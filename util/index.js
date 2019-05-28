const fs = require('fs')
const exec = require('child_process').exec

module.exports = {
  render(page) {
    return new Promise((resolve, reject) => {
      let viewUrl = `./views/${page}`
      fs.readFile(viewUrl, 'binary', (e, data) => {
        if (e) reject(e)
        else resolve(data)
      })
    })
  },
  execCommand(command, options) {
    return new Promise((resolve, reject) => {
      exec(command, options, (e, data) => {
        if (e) reject(e)
        else resolve(data)
      })
    })
  },
  writeFile(file, data) {
    return new Promise((resolve, reject) => {
      fs.writeFile(file, data, e => {
        if (e) reject(e)
        else resolve()
      })
    })
  }
}