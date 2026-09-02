const path = require('path')
const { glob } = require('glob')
const { nanoid } = require('nanoid')
const { readdir, stat } = require('fs/promises')
const { shell } = require('electron')
const fs = require('fs')

// 目录大小:有界并发 stat,避免几百个并发请求打爆 NAS/网络盘
const dirSize = async (dir, concurrency = 16) => {
  const files = await readdir(dir, { withFileTypes: true })
  const filePaths = files.filter(f => f.isFile()).map(f => path.join(dir, f.name))
  let total = 0
  for (let i = 0; i < filePaths.length; i += concurrency) {
    const chunk = filePaths.slice(i, i + concurrency)
    const sizes = await Promise.all(chunk.map(async p => (await stat(p)).size))
    total += sizes.reduce((a, b) => a + b, 0)
  }
  return total
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']

const isImageName = (name) => IMAGE_EXTS.includes(path.extname(name).toLowerCase())

// 目录级遍历:一个"直接包含图片文件"的目录算一本漫画。
// 相比逐文件 glob(对 65 万图片逐一匹配+stat),这里只 readdir 目录,
// 利用 Dirent 的类型信息,快一个数量级。
// 并发 BFS:worker 共享目录栈,对 NAS/网络盘能同时发出多个 readdir,
// 把"逐目录串行网络往返"变成多路并行,遍历时间可缩短数倍到十几倍。
const getFolderlist = async (libraryPath, concurrency = 24) => {
  const result = new Set()
  const stack = [libraryPath]
  // seen 集合防止符号链接指回祖先目录时无限循环
  const seen = new Set([libraryPath])
  const workers = Array.from({ length: concurrency }, async () => {
    while (stack.length) {
      const dir = stack.pop()
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch (e) {
        continue
      }
      let hasImage = false
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const child = path.join(dir, entry.name)
          if (!seen.has(child)) {
            seen.add(child)
            stack.push(child)
          }
        } else if (entry.isSymbolicLink()) {
          // 跟随符号链接(兼容原 glob follow: true 的行为)
          try {
            const targetStat = await stat(path.join(dir, entry.name))
            if (targetStat.isDirectory()) {
              const child = path.join(dir, entry.name)
              if (!seen.has(child)) {
                seen.add(child)
                stack.push(child)
              }
            } else if (targetStat.isFile() && isImageName(entry.name)) {
              hasImage = true
            }
          } catch (e) {
            // ignore broken symlink
          }
        } else if (entry.isFile() && isImageName(entry.name)) {
          hasImage = true
        }
      }
      if (hasImage) result.add(dir)
    }
  })
  await Promise.all(workers)
  return [...result]
}

// coverName 三态:undefined=旧行为(随机 nanoid 文件名,扫描即生成);
// null=懒加载模式(不生成封面文件,coverPath 返回 null,由用户使用时按需生成);
// 字符串=以指定文件名生成(如「漫画名.webp」)
const solveBookTypeFolder = async (folderpath, TEMP_PATH, COVER_PATH, coverName) => {
  let list = await glob('*.@(jpg|jpeg|png|webp|avif|gif)', {
    cwd: folderpath,
    nocase: true
  })
  list = list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).map(f => path.join(folderpath, f))
  let targetFilePath
  if (list.length > 8) {
    targetFilePath = list[7]
  } else {
    targetFilePath = list[0]
  }
  const tempCoverPath = list[0]
  const coverPath = coverName === undefined
    ? path.join(COVER_PATH, nanoid() + '.webp')
    : coverName
      ? path.join(COVER_PATH, coverName)
      : null
  const fileStat = await stat(folderpath)
  const bundleSize = await dirSize(folderpath)
  return { targetFilePath, tempCoverPath, coverPath, pageCount: list.length, bundleSize, mtime: fileStat?.mtime }
}

const getImageListFromFolder = async (folderpath, VIEWER_PATH) => {
  let list = await glob('*.@(jpg|jpeg|png|webp|avif|gif)', {
    cwd: folderpath,
    nocase: true
  })
  list = list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  return list.map(f => ({
    relativePath: f,
    absolutePath: path.join(folderpath, f)
  }))
}

const deleteImageFromFolder = async (filename, folderpath) => {
  const filepath = path.join(folderpath, filename)
  try {
    try {
      await shell.trashItem(filepath)
    } catch {
      await fs.promises.rm(filepath, { recursive: true, force: true })
    }
    return true
  } catch (e) {
    console.error(e)
    return false
  }
}


const findSameFile = async (filepath, type, Manga) => {
  let fileStat, bundleSize, mtime
  if (type === 'folder') {
    fileStat = await stat(filepath)
    bundleSize = await dirSize(filepath)
    mtime = fileStat.mtime
  } else {
    fileStat = await fs.promises.stat(filepath)
    bundleSize = fileStat.size
    mtime = fileStat.mtime
  }
  const filename = path.basename(filepath)
  // 原实现用 LIKE '%filename' 匹配,前缀通配符无法命中索引,
  // 每本新书都会对全表做一次扫描。改为先用 (bundleSize, mtime)
  // 联合索引精确定位候选(命中 idx_mangas_bundle_mtime),再在内存里
  // 做文件名后缀过滤,结果与原逻辑完全等价,但查询成本降几个数量级。
  const rows = await Manga.findAll({
    where: {
      bundleSize: bundleSize,
      mtime: mtime.toJSON() // mtime is text type in the database
    },
    raw: true
  })
  // SQLite 的 LIKE 对 ASCII 大小写不敏感,这里用 toLowerCase 对齐该语义
  const filenameLower = filename.toLowerCase()
  const matched = rows.filter(r => r.filepath.toLowerCase().endsWith(filenameLower))
  if (matched.length === 1) {
    return matched[0]
  } else {
    return null
  }
}

module.exports = {
  getFolderlist,
  solveBookTypeFolder,
  getImageListFromFolder,
  deleteImageFromFolder,
  findSameFile
}