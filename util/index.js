const path = require('path')
const fs = require('fs')
const { exec, spawn } = require('child_process')
const { PassThrough } = require('stream')
const SSETransform = require('./transform')

const TIMEOUT_ERR = 'EXEC TIMEOUT'
const WRITE_ERR = 'WRITE ERROR'
const noop = () => {}
/**
 * 停止Docker容器
 * @description exec方法中的timeout选项在执行“docker run”命令时无效， 因此采用“docker stop”命令来正确限制容器使用时长
 * @param {string} containerName 容器名称
 * @param {number} timeout 限制使用时长
 */
function stopDocker(containerName, timeout) {
  return setTimeout(async () => {
    try {
      await exec(`docker stop ${containerName}`)
    } catch (e) {
      console.log(`停止Docker容器失败` + e)
    }
  }, timeout)
}

module.exports = {
  TIMEOUT_ERR,
  WRITE_ERR,
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
  /**
   * 拉取镜像
   * @description 拉取镜像需要区分如下的情况
   *   1. 拉取成功 -> resolve()
   *   2. 拉取超时 -> reject(new Error(TIMEOUT_ERR))
   *   3. 拉取异常 -> reject(err)
   * @param {string} imageName 镜像名
   * @param {number} timeout 超时时间
   */
  pullImage(imageName, timeout) {
    return new Promise((resolve, reject) => {
      const childProcess = exec(`docker pull ${imageName}`, { timeout }, (e, stdout) => {
        if (e)
          reject(e)
        else
          resolve(stdout)
      })
      childProcess.on('close', (code, signal) => {
        // 超时接收到SIGPIPE信号, 而不是SIGTERM
        if (signal) reject(new Error(TIMEOUT_ERR))
      })
    }).then(result => [null, result]).catch(error => [error, null])
  },
  /**
   * 启动Docker容器并执行代码
   * @description 需要处理的情况
   *   1. 代码执行超时 -> reject(new Error(TIMEOUT_ERR))
   *   2，代码执行完成 -> resolve(stderr || stdout)
   * @param {object} dockerOptions 启动Docker的配置
   * @param {string} dockerOptions.containerName 容器名称
   * @param {string} dockerOptions.imageName 镜像名称
   * @param {string} dockerOptions.execCommand 执行文件
   * @param {string} dockerOptions.volume 挂载路径
   * @param {number} timeout 超时时间
   */
  startDockerByExec(dockerOptions, timeout) {
    const { containerName, imageName, execCommand, volume } = dockerOptions

    return new Promise((resolve, reject) => {
      const childProcess = exec(`docker run --rm --memory=50m --name ${containerName} -v ${volume} ${imageName} ${execCommand}`, (e, stdout, stderr) => {
        resolve(stderr || stdout)
      })
      stopDocker(containerName, timeout)
      childProcess.on('close', (code, signal) => {
        if (signal) reject(new Error(TIMEOUT_ERR))
      })
    }).then(result => [null, result]).catch(e => [e, null])
  },
  /**
   * 启动Docker容器并使用流模式获取输出
   * @description 需要处理的情况
   *   1. 在限定时间内, 命令执行完毕, 触发close事件
   *   2. 命令执行时间超出限定时间, 主动调用kill方法, 触发close事件
   * @param {object} dockerOptions 启动docker的配置
   * @param {WritableStream} targetStream 目标流
   * @param {number} timeout 超时时间
   * @param {function} onTimeout 超时执行函数
   * @param {function} onClose 正常退出执行函数
   */
  startDockerBySpawn(dockerOptions, targetStream, timeout, onTimeout, onClose) {
    const { containerName, imageName, execCommand, volume } = dockerOptions
    const commandStr = `docker run --rm --memory=50m --name ${containerName} -v ${volume} ${imageName} ${execCommand}`
    const [command, ...args] = commandStr.split(' ')
    const childProcess = spawn(command, args)
    const transferStation = new PassThrough()
    const t = new SSETransform()

    let timer = timeout && (stopDocker(containerName, timeout))

    childProcess.stdout.pipe(transferStation)
    childProcess.stderr.pipe(transferStation)
    transferStation.pipe(t).pipe(targetStream, { end: false })

    childProcess.on('close', (code, signal) => {
      if (signal)
        onTimeout()
      else
        clearTimeout(timer)
      onClose()
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
    }).then(() => [null, null]).catch(error => [error, null])
  },
}