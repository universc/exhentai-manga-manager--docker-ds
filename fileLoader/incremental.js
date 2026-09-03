// 增量扫描:目录指纹快照 + 差异检测
//
// 背景:全量扫描每次都要把整棵目录树 readdir 一遍(文件夹并发 BFS + rar/7z glob +
// zip glob,同一棵树走三遍),哪怕一本漫画都没变。本模块把"目录清单 + 目录 mtime +
// 压缩包 mtime/size"存成快照(scan-snapshot.json),增量扫描时:
//   1. 先对快照里的每个目录做 stat(比 readdir 便宜一个数量级,可并发);
//   2. mtime 没变的目录 → 整棵子树跳过;
//   3. mtime 变化的目录 → readdir 下钻,发现新增/删除的漫画;
//   4. 目录整个消失(stat 失败) → 自然发现删除,用于清理数据库;
//   5. 压缩包单独按文件 stat:同名覆盖下载(目录 mtime 不变)也能发现。
// 模块刻意不依赖 electron(纯 fs/path),便于脱离主进程独立测试。
const fs = require('fs')
const path = require('path')

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']
// 与 archive.js / zip.js 的扩展名清单保持一致
const ARCHIVE_TYPE = {
  '.rar': 'archive', '.7z': 'archive', '.cb7': 'archive', '.cbr': 'archive',
  '.zip': 'zip', '.cbz': 'zip'
}

const isImageName = (name) => IMAGE_EXTS.includes(path.extname(name).toLowerCase())
const archiveTypeOf = (filepath) => ARCHIVE_TYPE[path.extname(filepath).toLowerCase()] || null

// mtime 容差(ms):仅用于消除对"未变化目录"重复 stat 时的浮点噪声。
// 不能设大:文件系统目录 mtime 是粗粒度/延迟刷新的(如 NTFS 目录元数据批量刷新),
// 扫描刚结束几毫秒内的变更,目录 mtime 增量可能很小,容差过大会漏判。
const MTIME_TOLERANCE = 1

const statNoThrow = async (p) => {
  try { return await fs.promises.stat(p) } catch (e) { return null }
}

// 有界并发执行任务列表(单项失败不中断整批,与 index.js 的 runConcurrent 同思路)
const runConcurrent = async (items, concurrency, worker) => {
  let next = 0
  const run = async () => {
    while (next < items.length) {
      const index = next++
      try { await worker(items[index], index) } catch (e) { /* ignore */ }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  await Promise.all(workers)
}

// ---------- 全量清单(等价于 文件夹BFS + 压缩包glob 三次遍历的合并) ----------
// 返回 { dirs: {dirpath: {m, img}}, arch: {filepath: {m, s}}, books: [{filepath, type}] }
// dirs  记录遍历到的每一个目录(含无漫画目录),img=1 表示直接包含图片(文件夹漫画)
// arch  记录每一个压缩包文件(rar/7z/cb7/cbr/zip/cbz)
// books 与 getBookFilelist 语义一致:直接含图的目录一本 + 每个压缩包一本;
//       excludeRe 命中路径的书不列入 books,但目录/压缩包仍记录(便于后续发现)
const inventoryLibrary = async (libraryPath, { concurrency = 24, excludeRe = null } = {}) => {
  const dirs = {}
  const arch = {}
  const books = []
  const seen = new Set([libraryPath])
  const stack = [libraryPath]
  const isExcluded = (p) => !!excludeRe && excludeRe.test(p)

  const workers = Array.from({ length: concurrency }, async () => {
    while (stack.length) {
      const dir = stack.pop()
      let entries
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true })
      } catch (e) {
        continue
      }
      let hasImage = false
      const archFiles = []
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!seen.has(full)) { seen.add(full); stack.push(full) }
        } else if (entry.isSymbolicLink()) {
          // 跟随符号链接(兼容原 glob follow: true / folder.js 的行为)
          try {
            const targetStat = await fs.promises.stat(full)
            if (targetStat.isDirectory()) {
              if (!seen.has(full)) { seen.add(full); stack.push(full) }
            } else if (targetStat.isFile()) {
              if (isImageName(entry.name)) hasImage = true
              else if (archiveTypeOf(entry.name)) archFiles.push({ p: full, s: targetStat.size, m: targetStat.mtimeMs })
            }
          } catch (e) { /* broken symlink */ }
        } else if (entry.isFile()) {
          if (isImageName(entry.name)) hasImage = true
          else if (archiveTypeOf(entry.name)) archFiles.push({ p: full })
        }
      }
      const dirStat = await statNoThrow(dir)
      if (!dirStat) continue
      dirs[dir] = { m: dirStat.mtimeMs, img: hasImage ? 1 : 0 }
      if (hasImage && !isExcluded(dir)) books.push({ filepath: dir, type: 'folder' })
      for (const af of archFiles) {
        let s = af.s
        let m = af.m
        if (s === undefined) {
          const st = await statNoThrow(af.p)
          if (!st) continue
          s = st.size
          m = st.mtimeMs
        }
        arch[af.p] = { m, s }
        if (!isExcluded(af.p)) books.push({ filepath: af.p, type: archiveTypeOf(af.p) })
      }
    }
  })
  await Promise.all(workers)
  return { dirs, arch, books }
}

// ---------- 增量差异 ----------
// 入参 snap 结构: { v:1, library, excludeFile, dirs, arch }
// 返回 { newBooks, removedBooks, removedDirsCount, totalDirsCount, nextSnap }
//   newBooks     本次发现的新书(已按 excludeRe 过滤)
//   removedBooks 本次确认消失的书(不按 exclude 过滤,与全量扫描的清理语义一致)
//   nextSnap     更新后的快照(保存即完成一轮增量)
const diffInventory = async (libraryPath, snap, { concurrency = 24, excludeRe = null } = {}) => {
  const dirs0 = snap.dirs || {}
  const arch0 = snap.arch || {}
  const dirPaths = Object.keys(dirs0)
  const archPaths = Object.keys(arch0)
  const isExcluded = (p) => !!excludeRe && excludeRe.test(p)

  // 阶段 A:对快照中全部目录 / 压缩包做 stat(快速路径,不 readdir)
  const dirM = new Map() // path -> mtimeMs | null(目录已不存在)
  const archS = new Map() // path -> {m, s} | null(压缩包已不存在)
  await runConcurrent(dirPaths, concurrency, async (p) => {
    const st = await statNoThrow(p)
    dirM.set(p, st ? st.mtimeMs : null)
  })
  await runConcurrent(archPaths, concurrency, async (p) => {
    const st = await statNoThrow(p)
    archS.set(p, st ? { m: st.mtimeMs, s: st.size } : null)
  })

  // 阶段 B:被删除的目录子树(目录消失 → 整棵子树连带消失)
  const removed = new Set()
  const sortedPaths = dirPaths.slice().sort((a, b) => b.length - a.length)
  for (const p of sortedPaths) {
    if (dirM.get(p) === null) { removed.add(p); continue }
    const parent = path.dirname(p)
    if (parent !== p && removed.has(parent)) removed.add(p)
  }

  const removedBooks = []
  const removedBookSet = new Set()
  const addRemoved = (p, type) => {
    if (!removedBookSet.has(p)) {
      removedBookSet.add(p)
      removedBooks.push({ filepath: p, type })
    }
  }
  for (const p of dirPaths) {
    if (removed.has(p) && dirs0[p] && dirs0[p].img) addRemoved(p, 'folder')
  }
  for (const p of archPaths) {
    const parent = path.dirname(p)
    if (archS.get(p) === null || removed.has(parent)) addRemoved(p, archiveTypeOf(p) || 'archive')
  }
  const removedDirsCount = dirPaths.filter(p => removed.has(p) && !removed.has(path.dirname(p))).length

  // 阶段 C:对 mtime 变化的目录 readdir 下钻,发现新增内容
  const dirty = dirPaths.filter(p => {
    const m = dirM.get(p)
    return m !== null && !removed.has(p) && Math.abs(m - (dirs0[p] ? dirs0[p].m : 0)) > MTIME_TOLERANCE
  })
  const nextDirs = {}
  const nextArch = {}
  for (const p of dirPaths) if (!removed.has(p)) nextDirs[p] = dirs0[p]
  for (const p of archPaths) {
    if (archS.get(p) === null || removed.has(path.dirname(p))) continue
    nextArch[p] = archS.get(p) // 同名覆盖下载等:压缩包 mtime/size 变化也刷新快照
  }

  const newBooks = []
  const folderCandSet = new Set()
  const archiveCandSet = new Set()
  const pushFolderCand = (p) => {
    if (!folderCandSet.has(p) && !isExcluded(p)) { folderCandSet.add(p); newBooks.push({ filepath: p, type: 'folder' }) }
  }
  const pushArchiveCand = (p) => {
    const t = archiveTypeOf(p)
    if (!t || isExcluded(p) || archiveCandSet.has(p)) return
    archiveCandSet.add(p)
    newBooks.push({ filepath: p, type: t })
  }

  // 读一个目录并记录内容变化;返回其直接子目录清单
  const processDir = async (p, dirMtime) => {
    let entries
    try {
      entries = await fs.promises.readdir(p, { withFileTypes: true })
    } catch (e) {
      return []
    }
    const subdirs = []
    let hasImage = false
    const archNow = []
    for (const entry of entries) {
      const full = path.join(p, entry.name)
      if (entry.isDirectory()) {
        subdirs.push(full)
      } else if (entry.isSymbolicLink()) {
        try {
          const st = await fs.promises.stat(full)
          if (st.isDirectory()) subdirs.push(full)
          else if (st.isFile()) {
            if (isImageName(entry.name)) hasImage = true
            else if (archiveTypeOf(entry.name)) archNow.push({ p: full, m: st.mtimeMs, s: st.size })
          }
        } catch (e) { /* broken symlink */ }
      } else if (entry.isFile()) {
        if (isImageName(entry.name)) hasImage = true
        else if (archiveTypeOf(entry.name)) archNow.push({ p: full })
      }
    }
    const known = !!dirs0[p]
    const wasImg = known && !!dirs0[p].img
    const img = hasImage ? 1 : 0
    nextDirs[p] = { m: dirMtime, img }
    if (img) {
      if (!wasImg) pushFolderCand(p) // 目录从非书变成书,或全新目录
    } else if (wasImg) {
      addRemoved(p, 'folder') // 书目录里的图片被清空 → 书消失(目录还在)
    }
    for (const af of archNow) {
      if (af.m === undefined) {
        const st = await statNoThrow(af.p)
        if (!st) continue
        af.m = st.mtimeMs
        af.s = st.size
      }
      nextArch[af.p] = { m: af.m, s: af.s }
      if (!arch0[af.p]) pushArchiveCand(af.p)
    }
    return subdirs
  }

  // 广度优先:先处理变化目录,再下钻其变化/新增的子目录
  const queue = dirty.map(p => ({ p, m: dirM.get(p) }))
  const queued = new Set(queue.map(x => x.p))
  while (queue.length) {
    const item = queue.pop()
    let m = item.m
    if (m === null || m === undefined) {
      const st = await statNoThrow(item.p)
      if (!st) continue
      m = st.mtimeMs
    }
    const subdirs = await processDir(item.p, m)
    for (const child of subdirs) {
      if (queued.has(child)) continue
      const fresh = dirM.get(child) // 阶段 A 已知目录有值;全新目录为 undefined
      if (fresh === undefined) {
        queued.add(child)
        queue.push({ p: child, m: null })
      } else if (!removed.has(child) && Math.abs(fresh - (dirs0[child] ? dirs0[child].m : 0)) > MTIME_TOLERANCE) {
        queued.add(child)
        queue.push({ p: child, m: fresh })
      }
    }
  }

  return {
    newBooks,
    removedBooks,
    removedDirsCount,
    totalDirsCount: dirPaths.length,
    nextSnap: {
      v: 1,
      library: snap.library,
      excludeFile: snap.excludeFile || '',
      time: new Date().toISOString(),
      dirs: nextDirs,
      arch: nextArch
    }
  }
}

// ---------- 快照存取 ----------
const snapshotFromInventory = (library, excludeFile, inv) => ({
  v: 1,
  library,
  excludeFile: excludeFile || '',
  time: new Date().toISOString(),
  dirs: inv.dirs,
  arch: inv.arch
})

const loadSnapshotFile = async (file) => {
  try {
    const snap = JSON.parse(await fs.promises.readFile(file, 'utf-8'))
    if (!snap || snap.v !== 1 || !snap.dirs || !snap.arch) return null
    return snap
  } catch (e) {
    return null
  }
}

const saveSnapshotFile = async (file, snap) => {
  const tmp = file + '.tmp'
  await fs.promises.writeFile(tmp, JSON.stringify(snap))
  await fs.promises.rename(tmp, file)
}

module.exports = {
  inventoryLibrary,
  diffInventory,
  snapshotFromInventory,
  loadSnapshotFile,
  saveSnapshotFile,
  archiveTypeOf,
  isImageName,
  IMAGE_EXTS
}
