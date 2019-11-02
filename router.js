const path = require('path')
const Router = require('koa-router')
const SSE = require('@caaalabash/node-sse')
const {
  TIMEOUT_ERR,
  WRITE_ERR,
  languageList,
  pullImage,
  startDockerByExec,
  startDockerBySpawn,
  writeFile,
} = require('./util/index')

const router = Router()
const INIT_EVENT = 'sse-connect'
const MESSAGE_EVENT = 'sse-message'
const RESULT_EVENT = 'sse-result'
let idx = 0

router
  /**
   * 渲染首页
   */
  .get('/', ctx => ctx.render('index', { languageList: ['node', 'python', 'go'] }))
  /**
   * 响应SSE连接请求
   */
  .get('/sse', ctx => {
    const sse = new SSE({
      setHeaderFunc: ctx.set.bind(ctx),
      processChunk: chunk => JSON.stringify({ result: chunk.toString() }),
      connectEventName: INIT_EVENT,
    })
    ctx.body = sse.stream
  })
  /**
   * 渲染404页面
   */
  .get('*', ctx => ctx.render('404'))
  /**
   * 执行代码请求
   */
  .post('/runner', async (ctx) => {
    const { language, code, version, uid, streamMode } = ctx.request.body
    const { extension, dockerPrefix, command } = languageList[language]
    /**
     * 文件名、本地路径、镜像名、容器名、挂载卷、执行命令、SSE实例
     */
    const filename = `main-${++idx}${extension}`
    const hostPath = path.join(__dirname, '/code')
    const dockerOptions = {
      imageName: `${dockerPrefix}:${version}`,
      containerName: `runner-${idx}`,
      volume: `${hostPath}:/code`,
      execCommand: `${command} /code/${filename}`
    }
    const sseInstance = SSE.getInstance(uid)
    /**
     * 拉取镜像阶段
     */
    sseInstance.send(MESSAGE_EVENT, `sand box: 开始拉取镜像 ${dockerOptions.imageName}`)
    const [[writeErr, ], [pullErr, ]] = await Promise.all([
      writeFile(hostPath, filename, code),
      pullImage(dockerOptions.imageName, 30000)
    ])
    if (!writeErr || !pullErr) {
      sseInstance.send(MESSAGE_EVENT, 'sand box: 镜像拉取成功')
    } else {
      if (writeErr.message === WRITE_ERR) sseInstance.send(MESSAGE_EVENT, 'sand box: 文件写入异常')
      if (pullErr.message === TIMEOUT_ERR) sseInstance.send(MESSAGE_EVENT, 'sand box: 镜像拉取超时')
      else sseInstance.send(MESSAGE_EVENT, pullErr)
      sseInstance.send(MESSAGE_EVENT, 'sand box: 执行结束')

      return ctx.body = {}
    }
    /**
     * 执行代码阶段, 分为流式和非流式
     */
    if (!streamMode) {
      sseInstance.send(MESSAGE_EVENT, `sand box: 开始执行代码, 非流式`)

      const [dockerErr, execResult] = await startDockerByExec(dockerOptions, 10000)
      if (dockerErr && dockerErr.message === TIMEOUT_ERR) {
        sseInstance.send(MESSAGE_EVENT, 'sand box: 代码执行超时, 非流式下执行时间限制为10秒')
      } else {
        sseInstance.send(RESULT_EVENT, { result: execResult || dockerErr } )
      }

      sseInstance.send(MESSAGE_EVENT, 'sand box: 代码执行结束')
    } else {
      sseInstance.send(MESSAGE_EVENT, `sand box: 开始执行代码, 流式`)

      startDockerBySpawn(
        dockerOptions,
        sseInstance.transformStream,
        30000,
        () => { sseInstance(MESSAGE_EVENT, 'sand box: 代码执行已被中断, stream模式下时间限制为30秒') },
        () => { sseInstance(MESSAGE_EVENT, 'sand box: 代码执行结束') }
      )
    }
    return ctx.status = 200
  })

module.exports = router