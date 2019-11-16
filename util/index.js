const path = require('path')
const fs = require('fs')
const { exec, spawn } = require('child_process')

const TIMEOUT_ERR = 'EXEC TIMEOUT'
const WRITE_ERR = 'WRITE ERROR'
const DOCKER_EXIT_CODE = 137
const dockerCommand = 'docker run -u 1000 --net=none --rm --memory=50m'

/**
 * 写入文件的Promise封装
 * @param {string} folder 目标文件夹
 * @param {string} filename 文件名
 * @param {string} code 执行代码
 */
function writeFile(folder, filename, code) {
  return new Promise((resolve, reject) => {
    fs.writeFile(path.join(folder, filename), code, e => {
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
        fs.writeFileSync(path.join(folder, filename), code)
        resolve()
      } catch (e) {
        reject(new Error(WRITE_ERR))
      }
    })
  }).then(() => [null, null]).catch(error => [error, null])
}
/**
 * 拉取镜像
 * @description 拉取镜像需要区分如下的情况
 *   1. 拉取成功 -> resolve()
 *   2. 拉取超时 -> reject(new Error(TIMEOUT_ERR))
 *   3. 拉取异常 -> reject(err)
 * @param {string} imageName 镜像名
 * @param {number} timeout 超时时间
 */
function pullImage(imageName, timeout) {
  return new Promise((resolve, reject) => {
    const childProcess = exec(`docker pull ${imageName}`, { timeout }, (e, stdout) => {
      if (e) reject(e)
      else resolve(stdout)
    })
    childProcess.on('close', code => {

      if (code) reject(new Error(TIMEOUT_ERR))
    })
  }).then(result => [null, result]).catch(error => [error, null])
}

/**
 * 启动Docker容器并执行代码, 非流式
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
function startDockerByExec(dockerOptions, timeout) {
  const { containerName, imageName, execCommand, volume } = dockerOptions

  return new Promise((resolve, reject) => {
    let result
    const childProcess = exec(`${dockerCommand} --name ${containerName} -v ${volume} ${imageName} ${execCommand}`, (e, stdout, stderr) => {
      result = stderr || stdout
    })

    const timer = setTimeout(() => exec(`docker kill ${containerName}`), timeout)

    childProcess.on('close', code => {
      clearTimeout(timer)
      if (code === DOCKER_EXIT_CODE) {
        reject(new Error(TIMEOUT_ERR))
      } else {
        resolve(result)
      }
    })
  }).then(result => [null, result]).catch(e => [e, null])
}
/**
 * 启动Docker容器并执行代码, 流式
 * @description 需要处理的情况
 *   1. 在限定时间内, 命令执行完毕, 触发close事件
 *   2. 命令执行时间超出限定时间, 主动调用kill方法, 触发close事件
 * @param {Object} dockerOptions 启动docker的配置
 * @param {TransformStream} targetStream 目标流
 * @param {number} timeout 超时时间
 * @param {function} onTimeout 超时执行函数
 * @param {function} onClose 正常退出执行函数
 */
function startDockerBySpawn(dockerOptions, targetStream, timeout, onTimeout, onClose) {
  const { containerName, imageName, execCommand, volume } = dockerOptions
  const commandStr = `${dockerCommand} --name ${containerName} -v ${volume} ${imageName} ${execCommand}`
  const [command, ...args] = commandStr.split(' ')

  const childProcess = spawn(command, args)
  childProcess.stdout.pipe(targetStream, { end: false })
  childProcess.stderr.pipe(targetStream, { end: false })

  const timer = setTimeout(() => exec(`docker kill ${containerName}`), timeout)

  childProcess.on('close', code => {
    clearTimeout(timer)
    code === DOCKER_EXIT_CODE && onTimeout()
    onClose()
  })

  return childProcess
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
  writeFile,
  pullImage,
  startDockerByExec,
  startDockerBySpawn
}