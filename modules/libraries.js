// 漫画库列表(多库)数据层 —— 第二十七轮「只读兼容层」
//
// 背景:旧版只有一个 setting.library(单值),index.js 里有 30+ 处直接读它。
// 本轮只做数据结构与迁移,不改任何扫描/删除逻辑:
//   1. setting.libraries 描述所有漫画库([{ id, name, path, dataPath }]);
//   2. 启动时若没有 libraries,用旧的 setting.library 自动迁移出一个「默认库」(名字取文件夹名);
//   3. setting.library 继续同步为「当前活动库」的路径 —— 老代码读 setting.library 行为完全不变;
//   4. libraries 目前只被读取/记录日志,不参与扫描,方便下一轮把快照/库数据库/缓存切到 per-library。
//
// 说明:dataPath 留空 = 用默认库数据目录 <数据存放目录>/libraries/<库名>/;
//       用户以后可为单个库指定自定义路径(本层已支持读取,尚未提供 UI)。

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

// 每个库默认的数据目录所在子目录名
const LIBRARIES_DIR = 'libraries'

// 稳定的库 id(纯 ASCII,避免中文/空格带来的路径与 URL 问题)
const newLibraryId = () => 'lib-' + crypto.randomBytes(5).toString('hex')

const isWindowsPath = (p) => /^[A-Za-z]:[\\/]/.test(String(p || ''))

// 路径去重用的归一化 key(忽略结尾分隔符与大小写)
const normalizePathKey = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase()

// 从库路径取一个默认库名(文件夹名)
const libraryNameFromPath = (libPath, index = 0) => {
  const base = path.basename(String(libPath || '').replace(/[\\/]+$/, ''))
  return base || `漫画库${index + 1}`
}

// 目录名清洗:去掉非法字符与结尾点/空格,规避 Windows 保留名
const safeDirName = (name) => {
  let n = String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(n)) n = '_' + n
  return n || 'library'
}

// 某个库的数据目录:用户自定义优先,否则 <数据存放目录>/libraries/<库名>/
const libraryDataDir = (storePath, lib) => {
  const custom = String(lib && lib.dataPath ? lib.dataPath : '').trim()
  if (custom) return custom
  const name = safeDirName((lib && (lib.name || lib.id)) || 'library')
  return path.join(storePath, LIBRARIES_DIR, name)
}

// 只读兼容层:规范化 setting.libraries,必要时从 setting.library 迁移;返回本次是否发生迁移/变更。
// options.nameHint:容器模式下 setting.library 会被映射成 /library,但共享 setting.json 里存的是
// Windows 路径(Y:\...)。用这个名字提示保证容器与桌面算出同一个「库名」,即同一个库数据目录。
const ensureLibraries = (setting, options = {}) => {
  const before = JSON.stringify({
    libraries: setting.libraries === undefined ? null : setting.libraries,
    activeLibraryId: setting.activeLibraryId === undefined ? null : setting.activeLibraryId,
    library: setting.library === undefined ? null : setting.library
  })

  const raw = Array.isArray(setting.libraries) ? setting.libraries : []
  const list = []
  const seen = new Set()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const p = String(item.path || '').trim()
    if (!p) continue
    const key = normalizePathKey(p)
    if (seen.has(key)) continue
    seen.add(key)
    list.push({
      id: String(item.id || '') || newLibraryId(),
      name: String(item.name || '').trim() || libraryNameFromPath(p, list.length),
      path: p,
      dataPath: typeof item.dataPath === 'string' ? item.dataPath : ''
    })
  }

  const state = { migrated: false, changed: false, active: null }

  // 旧版单库 → 默认库(容器模式优先用 nameHint,保证与桌面端同名)
  if (!list.length) {
    const legacy = String(setting.library || '').trim()
    if (legacy) {
      const nameHint = String((options && options.nameHint) || '').trim()
      const name = nameHint ? libraryNameFromPath(nameHint, 0) : libraryNameFromPath(legacy, 0)
      list.push({ id: newLibraryId(), name, path: legacy, dataPath: '' })
      state.migrated = true
    }
  }

  // 活动库:优先 activeLibraryId,失效则退回第一个
  let active = list.find(l => l.id === setting.activeLibraryId) || null
  if (!active) active = list[0] || null
  // 旧字段优先(默认):设置页改的是 setting.library,把它同步进活动库。
  // options.preferList = true 时反过来 —— 以传入的 libraries 为准(多库管理 UI 用),
  // 由活动库路径回填 setting.library,避免旧值把用户刚选中的新库路径覆盖掉。
  if (active) {
    const legacy = String(setting.library || '').trim()
    if (options.preferList) setting.library = active.path
    else if (legacy) active.path = legacy
    else setting.library = active.path
  }
  state.active = active

  // 库名唯一:默认库数据目录按「库名」生成,同名会指向同一个目录(用户明确要求库名不重复)
  const usedNames = new Set()
  for (const lib of list) {
    const base = String(lib.name || '').trim() || libraryNameFromPath(lib.path, 0)
    let name = base
    let n = 2
    while (usedNames.has(name.toLowerCase())) { name = base + n; n++ }
    usedNames.add(name.toLowerCase())
    lib.name = name
  }
  setting.libraries = list.map(l => ({ id: l.id, name: l.name, path: l.path, dataPath: l.dataPath }))
  setting.activeLibraryId = active ? active.id : ''

  const after = JSON.stringify({
    libraries: setting.libraries,
    activeLibraryId: setting.activeLibraryId,
    library: setting.library === undefined ? null : setting.library
  })
  state.changed = before !== after
  return state
}

// 某个库的运行时路径集合(库数据目录 / 缩略图缓存 / 扫描快照 / 库数据库)。
// 启动与「切换活动库」共用同一套计算,保证两处不会算出不同路径。
const libraryRuntimePaths = (storePath, lib) => {
  const dataDir = lib ? libraryDataDir(storePath, lib) : storePath
  return {
    dataDir,
    viewcacheDir: path.join(dataDir, 'viewcache'),
    snapshotFile: path.join(dataDir, 'scan-snapshot.json'),
    dbFile: path.join(dataDir, 'database.sqlite')
  }
}

// 是否该把「库数据」从旧目录搬到新目录:只有同一个库改了库数据存放位置时才搬。
// 切换到另一个库时绝不能搬(否则会把 A 库的数据倒进 B 库)。
const shouldMoveLibraryData = (prevLib, nextLib, prevDataDir, nextDataDir) => {
  if (!prevLib || !nextLib) return false
  if (prevLib.id !== nextLib.id) return false
  if (!prevDataDir || !nextDataDir) return false
  return path.resolve(prevDataDir) !== path.resolve(nextDataDir)
}

// 库是否「已生效」:用户第 3 条 C —— 没填「库数据存放位置」的库不加载、不扫描。
// (path 也要有;dataPath 留空 = 这个库还不算配置完成)
const isLibraryActive = (lib) => !!(lib && String(lib.path || '').trim() && String(lib.dataPath || '').trim())

// 属于「某个库」的数据文件名(第二十八轮起从「数据存放目录」根部搬进库数据目录)
const LIBRARY_DATA_FILES = ['scan-snapshot.json', 'viewcache', 'database.sqlite', 'bookList.json', 'bookList.json.br']
const SQLITE_SIDECAR_RE = /^database\.sqlite-(journal|wal|shm)$/

// 把旧版放在「数据存放目录」根部的库数据搬进该库的库数据目录:
//   scan-snapshot.json(扫描快照)/ viewcache(缩略图缓存)/ database.sqlite(库数据库)及 SQLite 附属文件。
// 原则:只在「目标不存在」时搬,绝不覆盖已有数据;库数据目录与数据存放目录相同时什么都不做。
// 返回 { moved, kept },供启动日志说明发生了什么。
const migrateLibraryData = (storePath, libDataDir) => {
  const result = { moved: [], kept: [] }
  if (!storePath || !libDataDir) return result
  const src = path.resolve(storePath)
  const dst = path.resolve(libDataDir)
  if (src === dst) return result
  fs.mkdirSync(dst, { recursive: true })
  const move = (name) => {
    const from = path.join(src, name)
    const to = path.join(dst, name)
    try {
      if (!fs.existsSync(from)) return
      if (fs.existsSync(to)) { result.kept.push(name); return }
      try {
        fs.renameSync(from, to)
      } catch {
        // 跨盘或占用:复制后再删源
        fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: true })
        fs.rmSync(from, { recursive: true, force: true })
      }
      result.moved.push(name)
    } catch (e) {
      result.kept.push(name)
      result.error = String((e && e.message) || e)
    }
  }
  for (const name of LIBRARY_DATA_FILES) move(name)
  try {
    for (const name of fs.readdirSync(src)) {
      if (SQLITE_SIDECAR_RE.test(name)) move(name)
    }
  } catch { /* 目录不存在等:忽略 */ }
  return result
}

module.exports = {
  LIBRARIES_DIR,
  newLibraryId,
  isWindowsPath,
  normalizePathKey,
  libraryNameFromPath,
  safeDirName,
  libraryDataDir,
  libraryRuntimePaths,
  isLibraryActive,
  shouldMoveLibraryData,
  ensureLibraries,
  migrateLibraryData
}
