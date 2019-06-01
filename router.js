const path = require('path')
const router = require('koa-router')()
const {
  TIMEOUT_ERR,
  WRITE_ERR,
  writeFile,
  execCommand,
  languageList,
  spawnCommand
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
     * 文件名、镜像名、挂载卷、容器名、执行命令、拉取镜像命令、运行镜像命令、停止镜像命令
     */
    const filename = `main-${++idx}${extension}`
    const hostPath = path.join(__dirname, '/code')
    const dockerImageName = `${dockerPrefix}:${version}`
    const dockerImageVolume = `${hostPath}:/code`
    const dockerContainerName = `runner-${idx}`
    const execFileCommand = `${command} /code/${filename}`
    const dockerPullCommand = `docker pull ${dockerImageName}`
    const dockerRunCommand = `docker run --rm --memory=50m --name ${dockerContainerName} -v ${dockerImageVolume} ${dockerImageName} ${execFileCommand}`
    const dockerStopCommand = `docker stop ${dockerContainerName}`
    /**
     * 写入文件、拉取镜像, 需要处理如下错误:
     *   文件写入错误
     *   镜像拉取超时
     *   镜像不存在错误
     */
    SSE.writeStream(uid, 'sse-message', `sand box: 开始拉取镜像 ${dockerImageName}`)
    try {
      await Promise.all([
        writeFile(hostPath, filename, code),
        execCommand(dockerPullCommand, { timeout: 30000, strict: true })
      ])
      SSE.writeStream(uid, 'sse-message', 'sand box: 镜像拉取成功')
    } catch (e) {
      if (e.message === WRITE_ERR) SSE.writeStream(uid, 'sse-message', 'sand box: 文件写入异常')
      if (e.message === TIMEOUT_ERR) SSE.writeStream(uid, 'sse-message', 'sand box: 镜像拉取超时')
      SSE.writeStream(uid, 'sse-message', e)
      SSE.writeStream(uid, 'sse-message', 'sand box: 执行结束')
      return ctx.body = {}
    }
    /**
     * 执行代码, 并最终停止Docker容器
     *   streamMode 执行约30秒
     *   bufferMode 执行约10秒
     */
    SSE.writeStream(uid, 'sse-message', `sand box: 开始执行代码`)
    if (!streamMode) {
      try {
        const stdout = await execCommand(dockerRunCommand, { timeout: 10000 })
        SSE.writeStream(uid, 'sse-result', { result: stdout } )
        SSE.writeStream(uid, 'sse-message', 'sand box: 代码执行结束')
      } catch (e) {
        if (e.message === TIMEOUT_ERR) SSE.writeStream(uid, 'sse-message', 'sand box: 代码执行超时, 非stream模式下时间限制为10秒')
      } finally {
        try { await execCommand(dockerStopCommand) } catch (e) {}
      }
    } else {
      spawnCommand(dockerRunCommand, SSE.getInstance(uid).stream, {
        shell: false,
        timeout: 30000,
        onTimeout: () => { SSE.writeStream(uid, 'sse-message', 'sand box: 代码执行已被中断, stream模式下时间限制为30秒') },
        onClose: () => { SSE.writeStream(uid, 'sse-message', 'sand box: 代码执行结束') },
        onExit: async () => {
          try { await execCommand(dockerStopCommand) } catch (e) {}
        }
      })
    }
    return ctx.body = { }
  })

module.exports = router