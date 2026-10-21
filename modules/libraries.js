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
const libraryDataDir = (storePath, lib, isWeb) => {
  const custom = localLibraryDataPath(lib, isWeb)
  if (custom) return custom
  const name = safeDirName((lib && (lib.name || lib.id)) || 'library')
  return path.join(storePath, LIBRARIES_DIR, name)
}

// 某个库在「当前环境」下的路径。
// 老配置只有单个 path 字段 → 视作两端通用(网页端直接沿用桌面值)。
const localLibraryPath = (lib, isWeb) => {
  if (!lib) return ''
  // 容器模式判定与 index.js 一致:compose 给 WEB_LIBRARY,镜像自带 WEB_MODE=1 —— 两者都算
  const web = isWeb === undefined ? !!(process.env.WEB_LIBRARY || process.env.WEB_MODE === '1') : !!isWeb
  const desk = String(lib.path || '').trim()
  if (!web) return desk
  return String(lib.pathWeb || '').trim() || desk
}
const localLibraryDataPath = (lib, isWeb) => {
  if (!lib) return ''
  const web = isWeb === undefined ? !!process.env.WEB_LIBRARY : !!isWeb
  const desk = String(lib.dataPath || '').trim()
  if (!web) return desk
  return String(lib.dataPathWeb || '').trim() || desk
}
// 把落盘的双字段列表投影成「本端路径」列表,供 index.js 的运行时使用。
// 不修改传入的 setting —— 只读投影。
const runtimeLibraries = (setting, isWeb) => (Array.isArray(setting && setting.libraries) ? setting.libraries : [])
  .map(lib => ({
    ...lib,
    path: localLibraryPath(lib, isWeb),
    dataPath: localLibraryDataPath(lib, isWeb)
  }))

// 规范化 setting.libraries,必要时从 setting.library 迁移;返回本次是否发生迁移/变更。
// options.isWeb:当前是不是网页版/容器(默认按 process.env.WEB_LIBRARY 判断)。
//   —— 决定把 path/pathWeb 中的哪一组投影成本端路径,写盘时只写自己那一半。
// options.nameHint:容器模式下 setting.library 会被映射成 /library,但共享 setting.json 里存的是
// Windows 路径(Y:\...)。用这个名字提示保证容器与桌面算出同一个「库名」,即同一个库数据目录。
const ensureLibraries = (setting, options = {}) => {
  // 当前环境:网页版/容器 还是 桌面版 —— 决定运行时投影用哪一组路径
  const isWeb = (options && options.isWeb !== undefined) ? !!options.isWeb : !!process.env.WEB_LIBRARY
  const before = JSON.stringify({
    libraries: setting.libraries === undefined ? null : setting.libraries,
    activeLibraryId: setting.activeLibraryId === undefined ? null : setting.activeLibraryId,
    library: setting.library === undefined ? null : setting.library
  })

  const raw = Array.isArray(setting.libraries) ? setting.libraries : []
  const list = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const p = String(item.path || '').trim()
    const pw = String(item.pathWeb || '').trim()
    // 只配了「这一端」路径的库同样保留(另一端的路径可以以后再补),两端都空才丢弃
    if (!p && !pw) continue
    // 不再按路径去重:同一个文件夹可以建多个库(各自有库名与库数据目录,互不覆盖)
    list.push({
      id: String(item.id || '') || newLibraryId(),
      name: String(item.name || '').trim() || libraryNameFromPath(p || pw, list.length),
      path: p,
      dataPath: typeof item.dataPath === 'string' ? item.dataPath : '',
      // 双环境路径:同一份 setting.json 可能被桌面版与网页版共用,
      // path/dataPath 是桌面(Windows)那组,pathWeb/dataPathWeb 是容器那组
      // 兼容历史字段名 pathOther / dataPathOther(早期前端用的名字):
      // 不兼容的话,旧配置升级后「另一端」的路径会直接丢失,跨端翻译失效。
      pathWeb: (typeof item.pathWeb === 'string' && item.pathWeb)
        ? item.pathWeb
        : (typeof item.pathOther === 'string' ? item.pathOther : ''),
      dataPathWeb: (typeof item.dataPathWeb === 'string' && item.dataPathWeb)
        ? item.dataPathWeb
        : (typeof item.dataPathOther === 'string' ? item.dataPathOther : '')
    })
  }

  const state = { migrated: false, changed: false, active: null }

  // 旧版单库 → 默认库(容器模式优先用 nameHint,保证与桌面端同名)。
  // ⚠️ 只在「从来没有 libraries 字段」时迁移:用户主动删光库之后 libraries 是空数组,
  //    这时若还按 setting.library 重建,就会出现「删掉的库自己复活、一万多本又回来了」。
  if (!list.length && setting.libraries === undefined) {
    const legacy = String(setting.library || '').trim()
    if (legacy) {
      const nameHint = String((options && options.nameHint) || '').trim()
      const name = nameHint ? libraryNameFromPath(nameHint, 0) : libraryNameFromPath(legacy, 0)
      list.push({ id: newLibraryId(), name, path: legacy, dataPath: '', pathWeb: '', dataPathWeb: '' })
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
    if (options.preferList) setting.library = localLibraryPath(active, isWeb)
    else if (legacy && !isWeb && !String(active.path || '').trim()) {
      // setting.library 是**桌面端的遗留单值字段**。它只该在「这个库还没配过路径」时兜底迁移;
      // 库列表里已经有路径时绝不覆盖 —— 否则一个过期/填错的 legacy 值会在**每次启动**把
      // 「库文件夹」改回去(现象:书架能列出、点开没图,而设置里看着"自己变回去了")。
      active.path = legacy
      setting.library = localLibraryPath(active, isWeb)
    } else setting.library = localLibraryPath(active, isWeb)
  }
  state.active = active

  // 库名唯一:默认库数据目录按「库名」生成,同名会指向同一个目录(用户明确要求库名不重复)
  const usedNames = new Set()
  for (const lib of list) {
    const base = String(lib.name || '').trim() || libraryNameFromPath(lib.path || lib.pathWeb, 0)
    let name = base
    let n = 2
    while (usedNames.has(name.toLowerCase())) { name = base + n; n++ }
    usedNames.add(name.toLowerCase())
    lib.name = name
  }
  // ── 双环境路径(A 方案:两端各存自己那一半) ───────────────────────────────
  // 约定:path / dataPath        = 桌面版(Windows)那组
  //       pathWeb / dataPathWeb  = 网页版 / 容器那组
  // 这里【只规范化,绝不投影、绝不写对方字段】—— setting.libraries 本身就是落盘内容,
  // 任何投影都会把另一端的路径覆盖掉。运行时需要「本端路径」时请调用 runtimeLibraries()。
  setting.libraries = list.map(l => ({
    id: l.id,
    name: l.name,
    path: String(l.path || '').trim(),
    dataPath: String(l.dataPath || '').trim(),
    pathWeb: String(l.pathWeb || '').trim(),
    dataPathWeb: String(l.dataPathWeb || '').trim()
  }))
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
    dbFile: path.join(dataDir, 'database.sqlite'),
    // 封面缓存与删除记录也属于「那个库」,各放各的
    coverDir: path.join(dataDir, 'cover'),
    deleteLogFile: path.join(dataDir, 'delete-log.jsonl')
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
const isLibraryActive = (lib, isWeb) => !!(
  lib && localLibraryPath(lib, isWeb) && localLibraryDataPath(lib, isWeb)
)

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
  localLibraryPath,
  localLibraryDataPath,
  runtimeLibraries,
  libraryRuntimePaths,
  isLibraryActive,
  shouldMoveLibraryData,
  ensureLibraries,
  migrateLibraryData
}
