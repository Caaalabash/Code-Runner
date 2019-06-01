const { Transform } = require('stream')
/**
 * 自定义转换流
 * @description
 *   将child_process.stdout/stderr的可读流转换为EventStream的格式
 */
module.exports = class SSETransform extends Transform {
  constructor(eventName) {
    super()
    this.eventName = eventName || 'sse-result'
  }
  _transform(chunk, encoding, callback) {
    callback(null, `event: ${this.eventName}\ndata: ${JSON.stringify({result: chunk.toString('utf8')})}\n\n`)
  }
}
