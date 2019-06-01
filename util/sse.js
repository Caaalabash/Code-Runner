const { PassThrough } = require('stream')

const instanceMap = new Map()
let uid = 0

/**
 * Server Sent Events封装
 */
module.exports = class SSE {
  /**
   * 构造函数中初始化转换流、身份标识、执行初始化方法
   */
  constructor(options = {}) {
    this.stream = new PassThrough()
    this.uid = ++uid
    this.intervalTime = options.intervalTime || 5000
    this._init()
  }
  /**
   * 根据uid获取SSE实例
   */
  static getInstance(uid) {
    return instanceMap.get(+uid)
  }
  /**
   * 根据uid发送自定义事件
   */
  static writeStream(uid, event, data) {
    const instance = this.getInstance(uid)

    if (instance) instance.writeStream(event, data)
  }
  /**
   * 初始化函数中记录当前实例, 并保持长连接
   */
  _init() {
    instanceMap.set(this.uid, this)

    this._writeKeepAliveStream()
    const timer = setInterval(() => { this._writeKeepAliveStream() }, this.intervalTime)

    this.stream.on('close', () => {
      clearInterval(timer)
      instanceMap.delete(this.uid)
    })
  }
  /**
   * 通过发送注释消息保持长连接
   */
  _writeKeepAliveStream() {
    this.stream.write(': \n\n')
  }
  /**
   * 发送自定义事件
   */
  writeStream(event, data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data)

    this.stream.write(`event: ${event}\ndata: ${payload}\n\n`)
  }
}