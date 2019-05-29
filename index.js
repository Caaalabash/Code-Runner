const Koa = require('koa')
const views = require('koa-views')
const bodyParser = require('koa-bodyparser')
const router = require('./router')

const app = new Koa()
const port = process.env.PORT || 3000

app
  .use(views('./views', { extension: 'pug' }))
  .use(bodyParser())
  .use(router.routes())
  .use(router.allowedMethods())
  .listen(port)