const Koa = require('koa')
const Router = require('koa-router')
const bodyparser = require('koa-bodyparser')
const { render } = require('./util')

const app = new Koa()
const router = new Router()

router.post('/runner', (ctx) => {
  const { language, version, code } = ctx.request.body

  return ctx.body = {
    errno: 0,
    data: 'test'
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
  .listen(3000)