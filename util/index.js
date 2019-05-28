const fs = require('fs')

module.exports = {
  render(page) {
    return new Promise((resolve, reject) => {
      let viewUrl = `./views/${page}`
      fs.readFile(viewUrl, 'binary', (e, data) => {
        if (e) reject(e)
        else resolve(data)
      })
    })
  }
}