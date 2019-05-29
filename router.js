const router = require('koa-router')()
const path = require('path')
const { writeFile, execCommand, getFilename } = require('./util')

const hostPath = path.join(__dirname, '/code')
const workPath = '/code'
let count = 0

router.get('/', async ctx => {
  await ctx.render('index', {
    languageList: [
      'node',
      'python'
    ]
  })
})
router.post('/runner', async (ctx) => {
  const { language, code, version } = ctx.request.body
  const filename = getFilename(language)
  const filePath = path.join(hostPath, filename)

  const [writeErr, ] = await writeFile(hostPath, filename, code)
  const [execErr, ] = await execCommand(`docker pull ${language}:${version}`, { timeout: 30000 })

  if (writeErr || execErr) {
    return ctx.body = {
      errno: 0,
      data: writeErr || execErr
    }
  }

  const [e, data] = await execCommand(`
    docker run --rm --name runner${count++} -v ${hostPath}:${workPath} ${language}:${version} ${language} ${filePath}
  `, { timeout: 10000 })

  return ctx.body = {
    errno: 0,
    data: e || data
  }
})
router.get('*', async ctx => {
  await ctx.render('404')
})

module.exports = router