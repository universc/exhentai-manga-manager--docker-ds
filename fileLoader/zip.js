const fs = require('fs')
const path = require('path')
const { glob } = require('glob')
const AdmZip = require('adm-zip')
const { nanoid } = require('nanoid')
const _ = require('lodash')

const getZipFilelist = async (libraryPath) => {
  const list = await glob('**/*.@(zip|cbz)', {
    cwd: libraryPath,
    nocase: true,
    nodir: true,
    follow: true,
    absolute: true
  })
  return list
}

// coverName 三态:undefined=旧行为(随机 nanoid 文件名);null=懒加载(不生成封面文件);字符串=以指定文件名生成
const solveBookTypeZip = async (filepath, TEMP_PATH, COVER_PATH, coverName) => {
  const tempFolder = path.join(TEMP_PATH, nanoid(8))
  const zip = new AdmZip(filepath)
  const zipFileList = zip.getEntries()
  const findZFile = (entryName) => {
    return _.find(zipFileList, zFile => zFile.entryName == entryName)
  }
  const fileList = zipFileList.map(zFile => zFile.entryName)
  // 修复:原列表里误写成 ',jpeg',导致 zip/cbz 内的 .jpeg 图片不被识别
  let imageList = _.filter(fileList, filepath => _.includes(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'], path.extname(filepath).toLowerCase()))
  imageList = imageList.sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}))

  let targetFile
  let coverFile
  let coverPath
  if (imageList.length > 8) {
    targetFile = imageList[7]
    coverFile = imageList[0]
    zip.extractEntryTo(findZFile(targetFile), tempFolder, true, true)
    zip.extractEntryTo(findZFile(coverFile), tempFolder, true, true)
  } else if (imageList.length > 0) {
    targetFile = imageList[0]
    coverFile = imageList[0]
    zip.extractEntryTo(findZFile(targetFile), tempFolder, true, true)
  } else {
    throw new Error('compression package isnot include image')
  }
  // 直接引用解压产物(adm-zip 为内存解压,不再复制到 TEMP 根):
  // 生命周期只到本批扫描结束(TEMP_PATH 批次间统一清理),
  // 每本最多省 2 次整文件复制(写+读)。
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

const getImageListFromZip = async (filepath, VIEWER_PATH) => {
  const zip = new AdmZip(filepath)
  const tempFolder = path.join(VIEWER_PATH, nanoid(8))
  // 异步解压整本压缩包,避免在主进程同步阻塞(对 NAS/大文件尤其重要)
  await new Promise((resolve, reject) => {
    zip.extractAllToAsync(tempFolder, true, false, err => err ? reject(err) : resolve())
  })
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

module.exports = {
  getZipFilelist,
  solveBookTypeZip,
  getImageListFromZip
}