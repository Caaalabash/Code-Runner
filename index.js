const Koa = require('koa')
const Router = require('koa-router')
const bodyparser = require('koa-bodyparser')
const { render, execCommand, writeFile } = require('./util')

const app = new Koa()
const router = new Router()

const path = '/mynode/Code-Runner/code'
const workPath = '/code'

let count = 0

router.post('/runner', async (ctx) => {
  const { code } = ctx.request.body
  await writeFile(`${path}/main.js`, code)
  const response = await execCommand(`
    docker run --rm --name runner${count++} -v ${path}:${workPath} node:latest node /code/main.js
  `)

  return ctx.body = {
    errno: 0,
    data: response
  }
})

app
  .use(bodyparser())
  .use(async (ctx, next) => {
    const { url, method } = ctx

    if (url === '/' && method === 'GET') {
      ctx.body = await render('index.html')
    } else if (method === 'POST') {
      await next()
    } else {
      ctx.body = await render('404.html')
    }
  })
  .use(router.routes())
  .use(router.allowedMethods())
  .listen(3003)