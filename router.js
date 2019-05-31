const path = require('path')
const PassThrough = require('stream').PassThrough
const router = require('koa-router')()
const { writeFile, execCommand, languageList, writeStream } = require('./util')

const hostPath = path.join(__dirname, '/code')
const workPath = '/code'
const sseMap = {}
let idx = 0
let uid = 0

router.get('/', ctx => ctx.render('index', { languageList: ['node', 'python', 'go'] }))

router.post('/runner', async (ctx) => {
  const { language, code, version, uid } = ctx.request.body
  const { extension, dockerPrefix, command } = languageList[language]
  const filename = `main-${++idx}${extension}`
  const eventStream = sseMap[uid]

  writeStream(eventStream, 'sse-pull-start', 'sand box: 正在获取镜像...\n' )
  const [ [writeErr, ], [execErr, ] ] = await Promise.all([
    writeFile(hostPath, filename, code),
    execCommand(`docker pull ${dockerPrefix}:${version}`, { timeout: 30000 })
  ])

  if (writeErr || execErr) {
    writeStream(eventStream, 'sse-pull-end', 'sand box: 镜像获取错误\n' )
    return ctx.body = {
      errno: 0,
      data: writeErr || execErr
    }
  }
  writeStream(eventStream, 'sse-pull-end', 'sand box: 镜像获取成功\n' )
  const [e, data] = await execCommand(
    `docker run --rm --memory=50m --name runner-${idx} -v ${hostPath}:${workPath} ${dockerPrefix}:${version} ${command} /code/${filename}`,
    { timeout: 10000 },
    `docker stop runner-${idx}`
  )

  return ctx.body = {
    errno: 0,
    data: e || data
  }
})

router.get('/sse', ctx => {
  ctx.set({
    'Content-Type':'text/event-stream',
    'Cache-Control':'no-cache',
    'Connection': 'keep-alive'
  })
  const stream = new PassThrough()
  sseMap[++uid] = stream
  ctx.body = stream

  writeStream(stream, 'sse-connect', uid)
  writeStream(stream, 'sse-alive')
  const aliveTimer = setInterval(() => {
    writeStream(stream, 'sse-alive')
  }, 5000)
  stream.on('close', function() {
    clearInterval(aliveTimer)
    delete sseMap[uid]
  })
})

router.get('*', ctx => ctx.render('404'))

module.exports = router