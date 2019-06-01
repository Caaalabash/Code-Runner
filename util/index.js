const path = require('path')
const fs = require('fs')
const { exec, spawn } = require('child_process')
const { PassThrough } = require('stream')
const SSETransform = require('./transform')

const noop = () => {}
const isFunction = x => typeof x === 'function'

module.exports = {
  /**
   * 执行exec命令的Promise封装
   * @param {string} command 要运行的命令
   * @param {object} options 选项
   * @param {string | function} options.handleTimeout 代码执行超时时执行的命令或回调
   * @param {object} options.option exec函数的选项参数
   */
  execCommand(command, options = {}) {
    const { handleTimeout, ...option } = options

    return new Promise((resolve, reject) => {
      const childProcess = exec(command, option, (e, stdout, stderr) => {
        if (stderr) reject(stderr)
        else if (e) reject(e)
        else resolve(stdout)
      })
      childProcess.on('exit', (code, signal) => {
        if (!signal) return

        if (isFunction(handleTimeout)) {
          handleTimeout()
        } else {
          exec(handleTimeout, { timeout: 5000 }, () => {
            reject(new Error('代码执行超时'))
          })
        }
      })
    }).then(data => [null, data]).catch(err => [err, null])
  },
  /**
   * 执行spawn命令的封装
   * @param {string} commandStr 命令
   * @param {PassThrough} targetStream 目标流
   * @param {object} options 传给spawn的选项参数
   * @param {function | string} options.onExit 子进程退出后执行的命令或函数
   * @return {child_process} 子进程
   */
  spawnCommand(commandStr, targetStream, options = {}) {
    const { onExit, ...option } = options
    const [command, ...args] = commandStr.split(' ')
    const childProcess = spawn(command, args, option)

    const transferStation = new PassThrough()
    const t = new SSETransform()

    childProcess.stdout.pipe(transferStation)
    childProcess.stderr.pipe(transferStation)
    transferStation.pipe(t).pipe(targetStream, { end: false })

    childProcess.on('close', () => {
      try {
        isFunction(onExit) ? onExit() : execCommand(onExit)
      } catch (e) { }
    })

    return childProcess
  },
  /**
   * 写入文件的Promise封装
   * @param {string} folder 目标文件夹
   * @param {string} filename 文件名
   * @param {object} data 文件数据
   * @param {function} handleWriteError 写入异常处理函数
   */
  writeFile(folder, filename, data, handleWriteError = noop) {
    return new Promise((resolve, reject) => {
      fs.writeFile(path.join(folder, filename), data, e => {
        if (!e) {
          resolve()
          return
        }
        if (e.code !== 'ENOENT') {
          reject(e.message)
          return
        }
        try {
          fs.mkdirSync(folder, { recursive: true })
          fs.writeFileSync(path.join(folder, filename), data)
          resolve()
        } catch (e) {
          reject(e.message)
        }
      })
    }).then(data => [null, data]).catch(err => {
      handleWriteError()
      return [err, null]
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