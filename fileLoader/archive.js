const fs = require('fs')
const path = require('path')
const { glob } = require('glob')
const { nanoid } = require('nanoid')
const { spawn } = require('child_process')
const _ = require('lodash')
const { getRootPath } = require('../modules/utils.js')

// Windows 桌面版使用随应用分发的 7z.exe;
// Linux/macOS(含 Docker/NAS 部署)使用系统 PATH 中的 7z(Docker 镜像内置 p7zip-full)
// 注:-p123456 仅用于解锁带该默认密码的压缩包(Ex 下载件常见);无密码包不受影响,
// zip 优先走内存 adm-zip 不走 7z
const _7z = process.platform === 'win32'
  ? path.join(getRootPath(), 'resources/extraResources/7z.exe')
  : '7z'

const getArchivelist = async (libraryPath) => {
  const list = await glob('**/*.@(rar|7z|cb7|cbr)', {
    cwd: libraryPath,
    nocase: true,
    nodir: true,
    follow: true,
    absolute: true
  })
  return list
}

// coverName 三态:undefined=旧行为(随机 nanoid 文件名);null=懒加载(不生成封面文件);字符串=以指定文件名生成
const solveBookTypeArchive = async (filepath, TEMP_PATH, COVER_PATH, coverName) => {
  const tempFolder = path.join(TEMP_PATH, nanoid(8))
  const output = await spawnPromise(_7z, ['l', filepath, '-slt', '-sccUTF-8', '-p123456'])
  // 跨平台:Windows 7z 输出 \r\n,Linux 7z 输出 \n
  let pathlist = _.filter(output.split(/\r?\n/), s => _.startsWith(s, 'Path') && !_.includes(s, '__MACOSX'))
  pathlist = pathlist.map(p => {
    const match = /(?<== ).*$/.exec(p)
    return match ? match[0] : ''
  })
  let imageList = _.filter(pathlist, p => ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'].includes(path.extname(p).toLowerCase()))
  imageList = imageList.sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}))

  let targetFile
  let coverFile
  let coverPath
  if (imageList.length > 8) {
    targetFile = imageList[7]
    coverFile = imageList[0]
    // 一次 7z 调用同时解出目标页与封面页,少起一个外部进程
    // (批量扫描新书时进程 spawn 是主要开销之一)
    await spawnPromise(_7z, ['x', '-o'+tempFolder, '-p123456', '--', filepath, targetFile, coverFile])
  } else if (imageList.length > 0) {
    targetFile = imageList[0]
    coverFile = imageList[0]
    await spawnPromise(_7z, ['x', '-o'+tempFolder, '-p123456', '--', filepath, targetFile])
  } else {
    throw new Error('compression package isnot include image')
  }
  // 直接引用解压产物做后续 hash/封面,不再复制到 TEMP 根:
  // 这些临时文件的生命周期只到本批扫描结束(TEMP_PATH 批次间统一清理),
  // 去掉每本 1~2 次整文件复制(写+读),扫描大库时磁盘/网络 IO 明显下降。
  const targetFilePath = path.join(tempFolder, targetFile)
  const tempCoverPath = path.join(tempFolder, coverFile)

  coverPath = coverName === undefined
    ? path.join(COVER_PATH, nanoid() + '.webp')
    : coverName
      ? path.join(COVER_PATH, coverName)
      : null

  const fileStat = await fs.promises.stat(filepath)
  return {targetFilePath, tempCoverPath, coverPath, pageCount: imageList.length, bundleSize: fileStat?.size, mtime: fileStat?.mtime}
}

const getImageListFromArchive = async (filepath, VIEWER_PATH) => {
  const tempFolder = path.join(VIEWER_PATH, nanoid(8))
  await spawnPromise(_7z, ['x', filepath, '-o' + tempFolder, '-p123456'], 2 * 60 * 1000)
  let list = await glob('**/*.@(jpg|jpeg|png|webp|avif|gif)', {
    cwd: tempFolder,
    nocase: true
  })
  list = _.filter(list, s => !_.includes(s, '__MACOSX'))
  list = list.sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}))
  return list.map(f => ({
    relativePath: f,
    absolutePath: path.join(tempFolder, f)
  }))
}

const deleteImageFromArchive = async (filename, filepath) => {
  await spawnPromise(_7z, ['d', '-p123456', '--', filepath, filename])
  return true
}

const spawnPromise = (commmand, argument, timeoutMs = 30 * 1000) => {
  return new Promise((resolve, reject) => {
    const spawned = spawn(commmand, argument)
    const output = []
    const timeout = setTimeout(() => {
      spawned.kill()
      reject('7z return timeout')
    }, timeoutMs) // 默认30s超时

    spawned.on('error', data => {
      clearTimeout(timeout)
      reject(data)
    })
    spawned.on('exit', code => {
      clearTimeout(timeout)
      if (code === 0) {
        setTimeout(() => resolve(String(output)), 50)
      } else {
        reject('close code is ' + code)
      }
    })
    spawned.stdout.on('data', data => {
      output.push(data)
    })
  })
}

module.exports = {
  getArchivelist,
  solveBookTypeArchive,
  getImageListFromArchive,
  deleteImageFromArchive
}