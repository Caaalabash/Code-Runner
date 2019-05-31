const path = require('path')
const fs = require('fs')
const { exec } = require('child_process')

module.exports = {
  /**
   * 执行命令的Promise封装
   * @param {string} command 要运行的命令
   * @param {object} options 选项
   * @param {string} timeoutCommand 代码执行超时时执行的命令
   */
  execCommand(command, options, timeoutCommand = '') {
    return new Promise((resolve, reject) => {
      const child_process = exec(command, options, (e, stdout, stderr) => {
        if (e) reject(e)
        else if (stderr) reject(stderr)
        else resolve(stdout)
      })
      child_process.on('exit', (code, signal) => {
        if (signal) {
          exec(timeoutCommand, { timeout: 5000 }, () => {
            reject(new Error('代码执行超时'))
          })
        }
      })
    }).then(data => [null, data]).catch(err => [err.message, null])
  },
  /**
   * 写入文件的Promise封装
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
    }).then(data => [null, data]).catch(err => [err, null])
  },
  /**
   * EventSource事件流格式封装
   * @param {stream} target 写入流
   * @param {string} event 事件类型
   * @param {object} data 消息的数据字段
   */
  writeStream(target, event, data = {}) {
    if (!target) return
    return target.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
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