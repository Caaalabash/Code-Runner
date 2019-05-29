const path = require('path')
const fs = require('fs')
const exec = require('child_process').exec

module.exports = {
  /**
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
   * @param {string} language 语言
   * @param {number} idx 唯一索引
   * @return {string} 唯一文件名
   */
  getUniqueFilename(language, idx) {
    switch (language) {
      case 'python':
        return `main-${idx}.py`
      default:
        return `main-${idx}.js`
    }
  }
}