const path = require('path')
const router = require('koa-router')()
const {
  TIMEOUT_ERR,
  WRITE_ERR,
  languageList,
  pullImage,
  startDockerByExec,
  startDockerBySpawn,
  writeFile,
} = require('./util/index')
const SSE = require('./util/sse')

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
    ctx.set({
      'Content-Type':'text/event-stream',
      'Cache-Control':'no-cache',
      'Connection': 'keep-alive'
    })
    const sse = new SSE()
    sse.writeStream('sse-connect', sse.uid)

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
     * 文件名、本地路径、镜像名、容器名、挂载卷、执行命令
     */
    const filename = `main-${++idx}${extension}`
    const hostPath = path.join(__dirname, '/code')
    const dockerOptions = {
      imageName: `${dockerPrefix}:${version}`,
      containerName: `runner-${idx}`,
      volume: `${hostPath}:/code`,
      execCommand: `${command} /code/${filename}`
    }
    /**
     * 拉取镜像阶段
     */
    SSE.writeStream(uid, 'sse-message', `sand box: 开始拉取镜像 ${dockerOptions.imageName}`)
    const [[writeErr, ], [pullErr, ]] = await Promise.all([
      writeFile(hostPath, filename, code),
      pullImage(dockerOptions.imageName, 30000)
    ])
    if (!writeErr || !pullErr) {
      SSE.writeStream(uid, 'sse-message', 'sand box: 镜像拉取成功')
    } else {
      if (writeErr.message === WRITE_ERR)
        SSE.writeStream(uid, 'sse-message', 'sand box: 文件写入异常')
      if (pullErr.message === TIMEOUT_ERR)
        SSE.writeStream(uid, 'sse-message', 'sand box: 镜像拉取超时')
      else
        SSE.writeStream(uid, 'sse-message', pullErr)
      SSE.writeStream(uid, 'sse-message', 'sand box: 执行结束')
      return ctx.body = {}
    }
    /**
     * 执行代码阶段
     */
    SSE.writeStream(uid, 'sse-message', `sand box: 开始执行代码`)
    if (!streamMode) {
      const [dockerErr, execResult] = await startDockerByExec(dockerOptions, 10000)

      if (dockerErr && dockerErr.message === TIMEOUT_ERR)
        SSE.writeStream(uid, 'sse-message', 'sand box: 代码执行超时, 非stream模式下时间限制为10秒')
      else
        SSE.writeStream(uid, 'sse-result', { result: execResult || dockerErr } )
      SSE.writeStream(uid, 'sse-message', 'sand box: 代码执行结束')
    } else {
      startDockerBySpawn(
        dockerOptions,
        SSE.getInstance(uid).stream,
        30000,
        () => { SSE.writeStream(uid, 'sse-message', 'sand box: 代码执行已被中断, stream模式下时间限制为30秒') },
        () => { SSE.writeStream(uid, 'sse-message', 'sand box: 代码执行结束') }
      )
    }
    return ctx.body = { }
  })

module.exports = router