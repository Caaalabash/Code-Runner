const path = require('path')
const router = require('koa-router')()
const { writeFile, execCommand, languageList, spawnCommand } = require('./util/index')
const SSE = require('./util/sse')

const hostPath = path.join(__dirname, '/code')
const workPath = '/code'
let idx = 0

router.get('/', ctx => ctx.render('index', { languageList: ['node', 'python', 'go'] }))

router.post('/runner', async (ctx) => {
  const { language, code, version, uid, streamMode } = ctx.request.body
  const { extension, dockerPrefix, command } = languageList[language]
  const filename = `main-${++idx}${extension}`

  SSE.writeStream(uid, 'sse-message', 'sand box: 开始拉取镜像...')
  const [[writeErr, ], [pullErr, ]] = await Promise.all([
    writeFile(hostPath, filename, code, () => {
      SSE.writeStream(uid, 'sse-message', 'sand box: 文件写入异常')
    }),
    execCommand(`docker pull ${dockerPrefix}:${version}`, {
      handleTimeout: () => {
        SSE.writeStream(uid, 'sse-message', 'sand box: 镜像拉取超时')
      },
      option: {
        timeout: 30000
      }
    })
  ])
  SSE.writeStream(uid, 'sse-message', 'sand box: 镜像拉取成功')

  if (!writeErr || !pullErr) {
    const commandStr = `docker run --rm --memory=50m --name runner-${idx} -v ${hostPath}:${workPath} ${dockerPrefix}:${version} ${command} /code/${filename}`
    const exitCommand = `docker stop runner-${idx}`

    if (!streamMode) {
      const [e, data] = await execCommand(commandStr, {
        handleTimeout: exitCommand,
        option: {
          timeout: 10000
        }
      })
      SSE.writeStream(uid, 'sse-result', { result: e || data } )
      SSE.writeStream(uid, 'sse-message', 'sand box: 执行完毕')
    } else {
      spawnCommand(commandStr, SSE.getInstance(uid).stream, {
        onExit: () => {
          SSE.writeStream(uid, 'sse-message', 'sand box: 执行完毕')
          execCommand(exitCommand)
        }
      })
    }
  }
  return ctx.body = { }
})

router.get('/sse', ctx => {
  ctx.set({
    'Content-Type':'text/event-stream',
    'Cache-Control':'no-cache',
    'Connection': 'keep-alive'
  })
  const sse = new SSE()
  sse.writeStream('sse-connect', sse.uid)

  ctx.body = sse.stream
})

router.get('*', ctx => ctx.render('404'))

module.exports = router