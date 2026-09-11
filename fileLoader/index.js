const fs = require('fs')
const path = require('node:path')
const { createHash } = require('crypto')
const sharp = require('sharp')
const { getFolderlist, solveBookTypeFolder, getImageListFromFolder, deleteImageFromFolder } = require('./folder.js')
const { getArchivelist, solveBookTypeArchive, getImageListFromArchive, deleteImageFromArchive } = require('./archive.js')
const { getZipFilelist, solveBookTypeZip, getImageListFromZip } = require('./zip.js')
const { TEMP_PATH, COVER_PATH, VIEWER_PATH } = require('../modules/init_folder_setting.js')

// 流式计算文件 sha1:边读边哈希,避免把整张原图载入内存
// (对几十 MB 的大图和并发扫描尤其重要)
const sha1File = async (filePath) => {
  const hash = createHash('sha1')
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath)
    stream.on('data', d => hash.update(d))
    stream.on('end', resolve)
    stream.on('error', reject)
  })
  return hash.digest('hex')
}

const getBookFilelist = async (library) => {
  // 三类遍历并行执行(全部异步,不阻塞主进程),总耗时由三者之和降为最慢者
  const [folderList, archiveList, zipList] = await Promise.all([
    getFolderlist(library),
    getArchivelist(library),
    getZipFilelist(library)
  ])
  return [
    ...folderList.map(filepath => ({ filepath, type: 'folder' })),
    ...archiveList.map(filepath => ({ filepath, type: 'archive' })),
    ...zipList.map(filepath => ({ filepath, type: 'zip' })),
  ]
}

// coverName 三态:undefined=旧行为(扫描即生成,nanoid 文件名);
// null=懒加载模式(只探测第一页信息,不生成封面文件,coverPath 为 null);
// 字符串=以指定文件名生成封面(如「漫画名.webp」)
const geneCover = async (filepath, type, coverName) => {
  let targetFilePath, coverPath, tempCoverPath, pageCount, bundleSize, mtime
  switch (type) {
    case 'folder':
      ;({ targetFilePath, coverPath, tempCoverPath, pageCount, bundleSize, mtime } = await solveBookTypeFolder(filepath, TEMP_PATH, COVER_PATH, coverName))
      break
    case 'zip':
      try {
        ;({ targetFilePath, coverPath, tempCoverPath, pageCount, bundleSize, mtime } = await solveBookTypeArchive(filepath, TEMP_PATH, COVER_PATH, coverName))
      } catch (e) {
        console.log(e)
        console.log(`reload ${filepath} use adm-zip`)
        ;({ targetFilePath, coverPath, tempCoverPath, pageCount, bundleSize, mtime } = await solveBookTypeZip(filepath, TEMP_PATH, COVER_PATH, coverName))
      }
      break
    case 'archive':
      ;({ targetFilePath, coverPath, tempCoverPath, pageCount, bundleSize, mtime } = await solveBookTypeArchive(filepath, TEMP_PATH, COVER_PATH, coverName))
      break
  }

  const coverHash = await sha1File(tempCoverPath)
  // 目标页与封面页是同一文件(≤8 页)时复用 coverHash,避免同一文件被完整读两遍;
  // 不同文件才补算一次。hash 语义与旧逻辑一致(均为原图字节 sha1)。
  const hash = (targetFilePath && targetFilePath !== tempCoverPath)
    ? await sha1File(targetFilePath)
    : coverHash
  if (!coverPath) {
    // 懒加载模式:只探测信息,不生成封面文件
    return { targetFilePath, coverPath: null, hash, pageCount, bundleSize, mtime, coverHash }
  }
  // 封面按 500×707 居中裁切(fit: cover),而不是 contain 留底色边:
  // contain 会让横图/异形封面上下(左右)带 #303133 黑边,在"填充封面"布局里很难看。
  // 已有封面文件不受影响,重新扫描/修补封面后会按新规则生成。
  // 解压产物/库内原图在本批内不会被清理,sharp 直接读取,省一次整文件复制。
  await sharp(tempCoverPath, { failOnError: false })
    .resize(500, 707, {
      fit: 'cover'
    })
    .toFile(coverPath)
  return { targetFilePath, coverPath, hash, pageCount, bundleSize, mtime, coverHash }
}

const getImageListByBook = async (filepath, type) => {
  switch (type) {
    case 'folder':
      return await getImageListFromFolder(filepath, VIEWER_PATH)
    case 'zip':
      // zip 优先用 adm-zip 内存解压(更快),失败回退 7z
      try {
        return await getImageListFromZip(filepath, VIEWER_PATH)
      } catch (e) {
        console.log(`zip fallback to 7z: ${filepath}`)
        return await getImageListFromArchive(filepath, VIEWER_PATH)
      }
    case 'archive':
      return await getImageListFromArchive(filepath, VIEWER_PATH)
    default:
      return await getImageListFromArchive(filepath, VIEWER_PATH)
  }
}

const deleteImageFromBook = async (filename, filepath, type) => {
  switch (type) {
    case 'folder':
      return await deleteImageFromFolder(filename, filepath)
    case 'zip':
    case 'archive':
      return await deleteImageFromArchive(filename, filepath)
    default:
      return await deleteImageFromArchive(filename, filepath)
  }
}

module.exports = {
  getBookFilelist,
  geneCover,
  getImageListByBook,
  deleteImageFromBook,
  sha1File
}