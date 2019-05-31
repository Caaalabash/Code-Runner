const path = require('path')
const PassThrough = require('stream').PassThrough
const router = require('koa-router')()
const { writeFile, execCommand, languageList, writeStream } = require('./util')

const hostPath = path.join(__dirname, '/code')
const workPath = '/code'
let idx = 0

router.get('/', async ctx => {
  await ctx.render('index', {
    languageList: [
      'node',
      'python',
      'go'
    ]
  })
})
router.post('/runner', async (ctx) => {
  idx += 1
  const { language, code, version } = ctx.request.body
  const { extension, dockerPrefix, command } = languageList[language]
  const filename = `main-${idx}${extension}`

  const [writeErr, ] = await writeFile(hostPath, filename, code)
  const [execErr, ] = await execCommand(`docker pull ${dockerPrefix}:${version}`, { timeout: 30000 })

  if (writeErr || execErr) {
    return ctx.body = {
      errno: 0,
      data: writeErr || execErr
    }
  }
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
  const aliveTimer = setInterval(() => {
    writeStream(stream, 'alive')
  }, 5000)
  stream.on('close', function() {
    clearInterval(aliveTimer)
  })

  writeStream(stream, 'alive')
  ctx.body = stream
})
router.get('*', async ctx => {
  await ctx.render('404')
})

module.exports = router