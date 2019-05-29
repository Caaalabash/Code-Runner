const path = require('path')
const fs = require('fs')
const exec = require('child_process').exec

module.exports = {
  execCommand(command, options) {
    return new Promise((resolve, reject) => {
      exec(command, options, (e, data) => {
        if (e) reject(e)
        else resolve(data)
      })
    }).then(data => [null, data]).catch(err => [err.message, null])
  },
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
  getFilename(language) {
    switch (language) {
      case 'python':
        return 'main.py'
      default:
        return 'man.js'
    }
  }
}