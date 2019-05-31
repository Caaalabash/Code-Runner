const path = require('path')
const router = require('koa-router')()
const { writeFile, execCommand, languageList } = require('./util/index')
const SSE = require('./util/sse')

const hostPath = path.join(__dirname, '/code')
const workPath = '/code'
let idx = 0

router.get('/', ctx => ctx.render('index', { languageList: ['node', 'python', 'go'] }))

router.post('/runner', async (ctx) => {
  const { language, code, version, uid } = ctx.request.body
  const { extension, dockerPrefix, command } = languageList[language]
  const filename = `main-${++idx}${extension}`

  SSE.writeStream(uid, 'sse-message', 'sand box: 开始拉取镜像...')
  await Promise.all([
    writeFile(hostPath, filename, code, () => {
      SSE.writeStream(uid, 'sse-message', 'sand box: 文件写入异常')
    }),
    execCommand(`docker pull ${dockerPrefix}:${version}`, { timeout: 30000 }, () => {
      SSE.writeStream(uid, 'sse-message', 'sand box: 镜像拉取超时')
    })
  ])
  SSE.writeStream(uid, 'sse-message', 'sand box: 镜像拉取成功' )

  const [e, data] = await execCommand(
    `docker run --rm --memory=50m --name runner-${idx} -v ${hostPath}:${workPath} ${dockerPrefix}:${version} ${command} /code/${filename}`,
    { timeout: 10000 },
    `docker stop runner-${idx}`
  )
  SSE.writeStream(uid, 'sse-message', e || data )
  SSE.writeStream(uid, 'sse-message', 'sand box: 执行完毕' )
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