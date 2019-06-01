const path = require('path')
const fs = require('fs')
const { exec, spawn } = require('child_process')
const { PassThrough } = require('stream')
const SSETransform = require('./transform')

const TIMEOUT_ERR = 'EXEC TIMEOUT'
const WRITE_ERR = 'WRITE ERROR'
const noop = () => {}

module.exports = {
  TIMEOUT_ERR,
  WRITE_ERR,
  /**
   * 执行exec函数的Promise封装
   * @param {string} commandStr 要运行的命令
   * @param {object} options 选项
   * @param {number} options.timeout 命令超时时间
   * @param {boolean} options.strict 是否采用严格模式, 严格模式下, e/stderr将会被reject, 否则只有执行超时时被reject
   */
  execCommand(commandStr, options = {}) {
    const { strict = false, ...option } = options

    return new Promise((resolve, reject) => {
      let result, error
      const childProcess = exec(commandStr, option, (e, stdout, stderr) => {
        result = stdout
        error = stderr || e
      })
      childProcess.on('close', (code, signal) => {
        /**
         * @todo 通过docker run命令启动时, 超时接收到SIGPIPE信号, 而不是SIGTERM信号
         */
        if (signal) {
          reject(new Error(TIMEOUT_ERR))
        } else if (strict && error) {
          reject(error)
        } else {
          resolve(error || result)
        }
      })
    })
  },
  /**
   * 执行spawn函数的流封装, 有两种情况
   *   1. 在限定时间内, 命令执行完毕, 触发close事件
   *   2. 命令执行时间超出限定时间, 主动调用kill方法, 触发close事件
   * @param {string} commandStr 命令
   * @param {PassThrough} targetStream 目标流
   * @param {object} options 传给spawn的选项参数
   * @param {number} options.timeout 强制超时时间
   * @param {function} options.onClose 正常退出后执行的回调函数
   * @param {function} options.onTimeout 超过限定之间后执行的回调函数
   * @param {function} options.onExit 最后的回调函数
   * @return {child_process} 子进程
   */
  spawnCommand(commandStr, targetStream, options = {}) {
    const { timeout, onClose = noop, onTimeout = noop, onExit = noop, ...option } = options
    const [command, ...args] = commandStr.split(' ')
    const childProcess = spawn(command, args, option)
    const transferStation = new PassThrough()
    const t = new SSETransform()
    // 如果设定了强制超时时间, 则注册一个定时器用于杀死子进程
    let timer
    timeout && (timer = setTimeout(() => { childProcess.kill() }, timeout))

    childProcess.stdout.pipe(transferStation)
    childProcess.stderr.pipe(transferStation)
    transferStation.pipe(t).pipe(targetStream, { end: false })


    childProcess.on('close', (code, signal) => {
      timer && clearTimeout(timeout)
      // 如果收到中断信号, 需要移除后续管道中的可读流, 执行自定义的onTimeout方法
      if (signal === 'SIGTERM') {
        childProcess.stdout.unpipe(transferStation)
        childProcess.stderr.unpipe(transferStation)
        onTimeout()
      } else {
        onClose()
      }
      onExit()
    })

    return childProcess
  },
  /**
   * 写入文件的Promise封装,
   * @param {string} folder 目标文件夹
   * @param {string} filename 文件名
   * @param {object} data 文件数据
   */
  writeFile(folder, filename, data) {
    return new Promise((resolve, reject) => {
      fs.writeFile(path.join(folder, filename), data, e => {
        if (!e) {
          resolve()
          return
        }
        if (e.code !== 'ENOENT') {
          reject(new Error(WRITE_ERR))
          return
        }
        try {
          fs.mkdirSync(folder, { recursive: true })
          fs.writeFileSync(path.join(folder, filename), data)
          resolve()
        } catch (e) {
          reject(new Error(WRITE_ERR))
        }
      })
    })
  },
  /**
   * 语言相关属性
   * @prop {string} extension 文件后缀
   * @prop {string} dockerPrefix docker仓库名称
   * @prop {string} command 执行命令
   */
  languageList: {
    node: {
      extension: '.js',
      dockerPrefix: 'node',
      command: 'node'
    },
    python: {
      extension: '.py',
      dockerPrefix: 'python',
      command: 'python'
    },
    go: {
      extension: '.go',
      dockerPrefix: 'golang',
      command: 'go run'
    }
  },
}