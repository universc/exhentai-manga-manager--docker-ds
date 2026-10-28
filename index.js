const { app, BrowserWindow, ipcMain, session, dialog, shell, screen, Menu, clipboard, nativeImage, Tray, globalShortcut, protocol } = require('electron')
const path = require('path')
const fs = require('fs')
const { brotliDecompress } = require('zlib')
const { promisify, format } = require('util')
const { Op } = require('sequelize')
const _ = require('lodash')
const { nanoid } = require('nanoid')
const sharp = require('sharp')
const { exec } = require('child_process')
const { createHash } = require('crypto')
const sqlite3 = require('sqlite3')
const { open } = require('sqlite')
const fetch = require('node-fetch')
const { HttpsProxyAgent } = require('https-proxy-agent')
const windowStateKeeper = require('electron-window-state')
const express = require('express')
const { glob } = require('glob')

const { prepareMangaModel, prepareMetadataModel } = require('./modules/database')
const { translateBookTitle, translateTitle, listTitleTranslationModels, queryCharacterOrigins, analyzeTitleCharacters, extractBookInfo, extractImageText, extractImageTextWithUrl } = require('./modules/translate')
const { prepareTemplate } = require('./modules/prepare_menu.js')
const { getBookFilelist, geneCover, getImageListByBook, deleteImageFromBook, listArchiveImages, extractArchiveFiles } = require('./fileLoader/index.js')
const { parseTxtStructured, parseEpubStructured } = require('./fileLoader/novel.js')
const {
  STORE_PATH, DEFAULT_DATA_PATH, isPortable,
  TEMP_PATH, VIEWER_PATH,
  prepareSetting, prepareCollectionList, preparePath,
  setBootstrapDataPath,
  dataPathFallback,
  SETTING_FILE,
  SETTING_FILE_NAME,
  SETTING_PROFILE,
  getSettingFilePath,
  getActiveProfile,
  setActiveProfile,
  resolveSettingReadPath,
  safeProfile,
  runWithProfile,
  readLibrariesFile,
  writeLibrariesFile,
  extractLibraryConfig,
  applyLibraryConfig,
  findLibrariesInSettingFiles,
  _mange_reader
} = require('./modules/init_folder_setting.js')
const { findSameFile } = require('./fileLoader/folder.js')
const { inventoryLibrary, diffInventory, snapshotFromInventory, loadSnapshotFile, saveSnapshotFile, archiveTypeOf } = require('./fileLoader/incremental.js')
const localModels = require('./modules/localModels.js')
const ehLogin = require('./modules/ehLogin.js')
const ehDownload = require('./modules/ehDownload.js')
const collectionAuto = require('./modules/collectionAuto.js')
const {
  ensureLibraries, libraryDataDir, libraryRuntimePaths, isLibraryActive, shouldMoveLibraryData, migrateLibraryData,
  runtimeLibraries, localLibraryPath, localLibraryDataPath
} = require('./modules/libraries.js')

const WEB_MODE = process.env.WEB_MODE === '1'

// 在线图片专用协议:EH 的原图主机(*.hath.network)浏览器直连基本不可达,
// 所以渲染进程只发 emm-eh://img/?u=<原图地址>,由主进程带 Cookie 与代理取回再交给它。
// 必须在 app ready 之前注册为 privileged,否则 <img> 不让用。
const EH_IMG_SCHEME = 'emm-eh'
const EH_IMG_HOST_RE = /^https:\/\/([^/]+\.)?(hath\.network|ehgt\.org|e-hentai\.org|exhentai\.org)(:\d+)?\//i

// ---------- 在线图片:内存缓存 + 有界并发(桌面版 emm-eh 协议用) ----------
// 与网页版 /api/ex-image 同一套策略:翻回上一页不再重新下载,并发过多不会被 EH 限速打死。
const EH_IMG_CACHE_MAX_BYTES = 600 * 1024 * 1024
const EH_IMG_CACHE_TTL = 30 * 60 * 1000
const EH_IMG_MAX_CONCURRENCY = 6
const ehImgCache = new Map()
let ehImgCacheBytes = 0
const ehImgCacheGet = (url) => {
  const hit = ehImgCache.get(url)
  if (!hit) return null
  if (Date.now() - hit.at > EH_IMG_CACHE_TTL) {
    ehImgCacheBytes -= hit.buffer.length
    ehImgCache.delete(url)
    return null
  }
  ehImgCache.delete(url)
  ehImgCache.set(url, hit)
  return hit
}
const ehImgCachePut = (url, buffer, type) => {
  if (!buffer || !buffer.length) return
  if (buffer.length > EH_IMG_CACHE_MAX_BYTES / 4) return
  const prev = ehImgCache.get(url)
  if (prev) { ehImgCacheBytes -= prev.buffer.length; ehImgCache.delete(url) }
  ehImgCache.set(url, { buffer, type, at: Date.now() })
  ehImgCacheBytes += buffer.length
  while (ehImgCacheBytes > EH_IMG_CACHE_MAX_BYTES && ehImgCache.size) {
    const oldest = ehImgCache.keys().next().value
    const v = ehImgCache.get(oldest)
    ehImgCache.delete(oldest)
    if (v) ehImgCacheBytes -= v.buffer.length
  }
}
let ehImgRunning = 0
const ehImgWaiters = []
const ehImgAcquire = () => new Promise((resolve) => {
  if (ehImgRunning < EH_IMG_MAX_CONCURRENCY) { ehImgRunning += 1; resolve() }
  else ehImgWaiters.push(resolve)
})
const ehImgRelease = () => {
  const next = ehImgWaiters.shift()
  if (next) next()
  else ehImgRunning = Math.max(0, ehImgRunning - 1)
}

// ---------- 让图片能「一段一段地显示」 ----------
// 实测结论(在本机 Electron 26 用真实截图逐帧验证):
//   · baseline JPEG → <img> 边收边画,从上往下逐行出现 ✓
//   · progressive JPEG → 先出整页模糊、再逐层变清晰 ✓
//   · **WebP → 整张不显示(naturalWidth=0),直到 complete** ✗
// EH 的原图大量是 WebP,这就是「看着不流式」的真正根因 —— 不是协议层的问题。
//
// 所以:对 WebP 原图,在服务端用 sharp 转成 **progressive JPEG** 再下发,
// 视觉上就是「先糊一片、再逐段清晰」,和浏览器里看 e-hentai 一致。
const TRANSCODE_MAX_BYTES = 24 * 1024 * 1024   // 超过这个体积不转(太占内存)
const isWebpType = (type, buffer) => {
  if (/^image\/webp/i.test(String(type || ''))) return true
  // 兜底看魔数:RIFF....WEBP
  return !!(buffer && buffer.length > 12 &&
    buffer.slice(0, 4).toString('latin1') === 'RIFF' &&
    buffer.slice(8, 12).toString('latin1') === 'WEBP')
}
const transcodeToProgressiveJpeg = async (buffer) => {
  if (!buffer || buffer.length > TRANSCODE_MAX_BYTES) return null
  try {
    const out = await sharp(buffer, { animated: false })
      .jpeg({ quality: 90, progressive: true, mozjpeg: true })
      .toBuffer()
    return (out && out.length) ? out : null
  } catch (e) {
    return null
  }
}

if (!WEB_MODE) {
  try {
    protocol.registerSchemesAsPrivileged([{
      scheme: EH_IMG_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
    }])
  } catch (e) { /* 已经注册过(热重载)时忽略 */ }
}

preparePath()
let defaultSetting = prepareSetting()

// ---------- 库配置与账户解耦(库单独存 <数据目录>/libraries.json) ----------
// 库是「这个数据目录」的属性,不该跟着账户设置走。启动时:
//   ① 有 libraries.json → 直接用它覆盖设置里的库字段;
//   ② 没有 → 从现有设置里迁移一份(优先挑"真的有库"的那份,例如 setting.<账户>.json)。
const LIBRARY_CONFIG_KEYS = ['libraries', 'activeLibraryId', 'switchBoxes', 'activeBoxIndex']
const bootstrapLibrariesConfig = (() => {
  let cfg = readLibrariesFile()
  const hasLibs = (c) => Array.isArray(c && c.libraries) && c.libraries.length > 0
  if (!hasLibs(cfg)) {
    const mine = extractLibraryConfig(defaultSetting)
    const migrated = hasLibs(mine) ? mine : findLibrariesInSettingFiles()
    if (hasLibs(migrated)) {
      cfg = migrated
      writeLibrariesFile(cfg)
      console.log(`[libraries] 已把库配置迁移到 libraries.json(${cfg.libraries.length} 个库)`)
    } else if (!cfg) {
      cfg = { libraries: [], activeLibraryId: '', switchBoxes: [], activeBoxIndex: 0 }
      writeLibrariesFile(cfg)
    }
  }
  return cfg
})()
applyLibraryConfig(defaultSetting, bootstrapLibrariesConfig)
// ---------- 每个账户一份设置(网页版多账户并发时互不干扰) ----------
// 键 = 配置名(账户名);'' = 未登录 / 桌面版默认。
// 谁在请求由 modules/init_folder_setting.js 的 AsyncLocalStorage 决定(getActiveProfile),
// web-server 用 withAccount() 把每个请求包进对应账户的上下文里。
// 配置名(账户名)必须真的存在于「当前数据目录」里,否则会错位:
// 例如 bootstrap.json 还记着 admin,但这个数据目录(如 NAS 共享)里只有 universc,
// 于是设置被写进 setting.admin.json,而另一端读的是 setting.universc.json —— 两端永远对不上。
const knownUsersInStore = () => {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(STORE_PATH, 'users.json'), 'utf-8'))
    return Object.keys(j.users || {})
  } catch { return [] }
}
if (getActiveProfile()) {
  const known = knownUsersInStore()
  if (known.length && !known.includes(getActiveProfile())) {
    console.log(`[profile] 配置名「${getActiveProfile()}」在当前数据目录里没有对应账户,回退默认配置(setting.json)`)
    setActiveProfile('')
  }
}
const settingsByProfile = new Map([[safeProfile(getActiveProfile() || ''), defaultSetting]])
const currentSettingObj = () => settingsByProfile.get(getActiveProfile()) || defaultSetting
// index.js 里大量 setting.xxx 读写不用改:Proxy 把它们代理到「当前账户那一份」
let setting = new Proxy({}, {
  get: (_, key) => currentSettingObj()[key],
  set: (_, key, value) => { currentSettingObj()[key] = value; return true },
  deleteProperty: (_, key) => { delete currentSettingObj()[key]; return true },
  has: (_, key) => key in currentSettingObj(),
  ownKeys: () => Reflect.ownKeys(currentSettingObj()),
  getOwnPropertyDescriptor: (_, key) => {
    const d = Reflect.getOwnPropertyDescriptor(currentSettingObj(), key)
    return d ? { ...d, configurable: true } : undefined
  },
})
// 整体替换「当前账户那份设置」(原来是 setting = xxx)
const replaceCurrentSetting = (obj) => {
  settingsByProfile.set(getActiveProfile(), obj)
  return obj
}

// 本地超分模型目录:<数据目录>/models/upscale/<模型 id>
localModels.init(STORE_PATH)
// 下载走用户配置的代理,或镜像前缀(国内直连 GitHub 大文件经常被重置)
localModels.setProxy(setting.proxy || process.env.HTTPS_PROXY || process.env.https_proxy || '')
localModels.setMirror(setting.localModelMirror || '')

// 容器模式(WEB_LIBRARY 环境变量):数据目录挂载为 /data、漫画库挂载为 /library。
// 只对「Windows 盘符路径」(桌面端写进共享 setting.json 的 Y:\... 等)做跨平台映射;
// 用户在容器内设置的合法路径(以 / 开头,如 /library/sub、/data/xxx)一律尊重,
// 不再无条件强制回 /library,避免「库文件夹/元数据目录设置后又被重置」的问题。
// 抽成函数:网页版按账户切换设置文件时,要对新读进来的那份重新套用一次。
// 容器/网页模式的「库根」:
//   · compose 会给 WEB_LIBRARY=/library;
//   · 但镜像本身只带 WEB_MODE=1 —— 以前只看 WEB_LIBRARY,导致「只用镜像建容器」时
//     应用把自己当桌面端(用 lib.path 而不是 pathWeb、跨端路径互译全关),
//     结果是封面和阅读图片全线 404。这里让 WEB_MODE=1 也等价于容器模式。
const WEB_LIBRARY_ENV = String(process.env.WEB_LIBRARY || (process.env.WEB_MODE === '1' ? '/library' : '')).trim()
const IS_WEB_ENV = !!WEB_LIBRARY_ENV

const applyContainerLibraryMapping = (target) => {
  if (!WEB_LIBRARY_ENV) return target
  const forcedLibrary = path.resolve(WEB_LIBRARY_ENV)
  const lib = String(target.library || '')
  if (/^[A-Za-z]:[\\/]/.test(lib)) {
    // Windows 盘符:记录为外部根,并在容器内强制为挂载路径
    if (!target.externalLibraryRoot) target.externalLibraryRoot = lib
    target.library = forcedLibrary
  } else if (!lib || lib === '/') {
    // 未设置 / 根目录:回退到默认挂载路径
    target.library = forcedLibrary
  }
  // 元数据目录:仅 Windows 盘符时映射;容器内合法路径尊重
  const meta = String(target.metadataPath || '')
  if (/^[A-Za-z]:[\\/]/.test(meta)) {
    if (!target.externalMetadataPath) target.externalMetadataPath = meta
    if (!target.externalCoverRoot) target.externalCoverRoot = path.join(meta, 'cover').replace(/\//g, '\\')
    target.metadataPath = null
  }
  return target
}
applyContainerLibraryMapping(setting)

// ---------- 漫画库列表 + 每库数据目录(第二十七/二十八轮) ----------
// 兼容层:旧版只有单个 setting.library,这里迁移出 setting.libraries,并把 setting.library
// 继续同步为活动库路径 —— 扫描/删除等现有逻辑不用改。
// 数据归属:scan-snapshot.json / database.sqlite / viewcache 属于「库」,放库数据目录;
// metadata.sqlite / setting.json / collectionList.json / cover 等属于「用户统一配置」,仍在数据存放目录。
// 当前活动库(多库管理 UI 切换的就是它)。第 3 条 C:没填「库数据存放位置」的库不生效、不参与。
// 当前环境:网页版/容器 还是 桌面版(IS_WEB_ENV 定义在上面,与 WEB_LIBRARY_ENV 同源)。
// libraries 里存了两组路径(path/dataPath = 桌面,pathWeb/dataPathWeb = 网页),
// 业务代码统一通过 runtimeLibs() 拿到「本端」那一组 —— 两端共用同一份 setting.json 也不会互相打架。
const runtimeLibs = (s = setting) => runtimeLibraries(s, IS_WEB_ENV)

const activeLibraryOf = (s = setting) => {
  const list = runtimeLibs(s)
  const byId = list.find(l => l.id === s.activeLibraryId)
  if (byId && isLibraryActive(byId, IS_WEB_ENV)) return byId
  return list.find(l => isLibraryActive(l, IS_WEB_ENV)) || null
}
// ---------- 库切换框(工具栏「切换库」按框循环) ----------
// 每个框 = 一组库;点一下工具栏按钮就切到下一个框,书架显示该框内所有库合并的漫画。
const activeBoxOf = (s = setting) => {
  const boxes = Array.isArray(s.switchBoxes) ? s.switchBoxes : []
  if (!boxes.length) return null
  const n = boxes.length
  const idx = Number.isInteger(s.activeBoxIndex) ? ((s.activeBoxIndex % n) + n) % n : 0
  return boxes[idx] || null
}
// 当前框里「已生效」的库;没配置框 / 框为空时退化成「所有已生效的库」
const boxLibraries = (s = setting) => {
  const active = runtimeLibs(s).filter(l => isLibraryActive(l, IS_WEB_ENV))
  const box = activeBoxOf(s)
  if (!box) return active              // 完全没配置切换框 → 退化成「所有已生效的库」
  const ids = Array.isArray(box.libraryIds) ? box.libraryIds : []
  if (!ids.length) return active       // 框里没选库 → 显示全部已生效的库(下拉/设置里都写明「未选库 = 显示全部」)
  return active.filter(l => ids.includes(l.id))
}
// 每个库一个 sequelize 实例:合并书架要同时读多个库数据库
const mangaModels = new Map()
// 丢掉某个库的数据库连接:库被删除、或库数据目录被换到别处时必须调用 ——
// 否则旧实例一直指向老文件(读出来的是旧数据),Windows 下还会锁住文件让目录删不掉。
const closeLibraryModel = (libraryId) => {
  const model = mangaModels.get(libraryId)
  if (!model) return
  mangaModels.delete(libraryId)
  // ⚠ 按文件路径的缓存也必须一起清:否则库数据目录改过之后,
  //   旧 dbFile 的条目还留着,后面按文件复用时会拿到指向**老文件**的实例。
  for (const [file, m] of [...mangaModelsByFile.entries()]) {
    if (m === model) mangaModelsByFile.delete(file)
  }
  try { model.sequelize.close() } catch (e) { /* 忽略:连接可能已断 */ }
}
// 只读场景的容错版:库不存在/未生效时返回 null,让调用方跳过这库,而不是让整页 500。
// ⚠ 绝不回退到全局 Manga —— 那正是把 A 库数据写进 B 库的来源。
const modelForLibraryOrNull = async (libraryId) => {
  try {
    return await modelForLibrary(libraryId)
  } catch (e) {
    console.warn('[libraries] 跳过库 ' + String(libraryId) + ':' + String((e && e.message) || e))
    return null
  }
}
const modelForLibrary = async (libraryId) => {
  const lib = (setting.libraries || []).find(l => l.id === libraryId)
  if (!lib) {
    // ⚠ 以前这里 return Manga —— 会在「库不存在/未配置好」时**静默退回到当前全局模型**,
    //   而那个模型很可能属于另一个库。扫描循环里一旦发生,数据就会写进错误的库
    //   (线上事故:小说库里混进 1.4 万条漫画,filepath 形如 "S/作者/作品")。
    //   现在:找不到库就抛错,让调用方明确跳过,绝不猜。
    throw new Error('[libraries] 找不到库:' + String(libraryId))
  }
  if (!isLibraryActive(lib, IS_WEB_ENV)) {
    // ⚠ 必须显式传 IS_WEB_ENV:不传时 libraries.js 内部会用「只认 WEB_LIBRARY」的旧判定,
    //   与 index.js 的 IS_WEB_ENV(WEB_LIBRARY || WEB_MODE)不一致 —— 容器只设 WEB_MODE 时,
    //   好库会被误判「未生效」,进而静默回退到别的库模型(事故根因之一)。
    throw new Error('[libraries] 库未生效(缺 path 或 dataPath):' + String(lib.name || lib.id))
  }
  const cached = mangaModels.get(lib.id)
  if (cached) return cached
  const paths = libraryRuntimePaths(STORE_PATH, lib)
  // ⚠️ 先按「文件路径」找:同一个数据库文件(例如库数据目录就是数据目录时)
  //    必须复用同一个 sequelize 实例,否则两个连接会互相锁死(SQLITE_IOERR)。
  const byFile = mangaModelsByFile.get(paths.dbFile)
  if (byFile) {
    mangaModels.set(lib.id, byFile)
    return byFile
  }
  const model = prepareMangaModel(paths.dbFile)
  await ensureMangaSchema(model)
  mangaModelsByFile.set(paths.dbFile, model)
  mangaModels.set(lib.id, model)
  return model
}
// 合并书架:记住「哪本书属于哪个库」——写操作/查找必须回到它自己的库,不然会写脏别的库
const bookLibraryById = new Map()
const bookLibraryByHash = new Map()
const rememberBookLibrary = (b) => {
  if (!b || !b.libraryId) return
  if (b.id) bookLibraryById.set(b.id, b.libraryId)
  if (b.hash) bookLibraryByHash.set(b.hash, b.libraryId)
}
const modelForBookId = async (id) => modelForLibrary(bookLibraryById.get(id))
// 在「当前框的所有库 + 当前库」里找一条记录,返回 { model, row, libraryId }
const findBookAcrossLibraries = async (where) => {
  const entries = []
  for (const lib of boxLibraries()) entries.push({ lib, model: await modelForLibraryOrNull(lib.id) })
  if (!entries.some(e => e.model === Manga)) entries.push({ lib: activeLibraryOf(setting), model: Manga })
  for (const e of entries) {
    try {
      const row = await e.model.findOne({ where, raw: true })
      if (row) return { model: e.model, row, libraryId: e.lib ? e.lib.id : undefined }
    } catch (err) { /* 忽略:某个库查不动不影响其它库 */ }
  }
  return { model: Manga, row: null, libraryId: undefined }
}
const libraryState = ensureLibraries(setting, { nameHint: setting.externalLibraryRoot })
const activeLibrary = libraryState.active
// 活动库的运行时路径:切换活动库时由 switchActiveLibraryRuntime() 重新计算,所以都是 let
const startupLibraryPaths = libraryRuntimePaths(STORE_PATH, activeLibrary)
let LIBRARY_DATA_DIR = startupLibraryPaths.dataDir
let LIBRARY_VIEWCACHE_DIR = startupLibraryPaths.viewcacheDir
// 封面缓存也属于「那个库」(用户要求:每个库独自生成封面)—— 用可变变量,随运行时切库走
let CURRENT_COVER_DIR = startupLibraryPaths.coverDir
try { fs.mkdirSync(CURRENT_COVER_DIR, { recursive: true }) } catch (e) { /* 稍后生成封面时再试 */ }
// 首次升级:把旧版放在数据存放目录根部的库数据搬进库数据目录(绝不覆盖已有文件)
let libraryDataMigration = (activeLibrary && !dataPathFallback) ? migrateLibraryData(STORE_PATH, LIBRARY_DATA_DIR) : { moved: [], kept: [] }
let SNAPSHOT_FILE = startupLibraryPaths.snapshotFile
let LIBRARY_DB_FILE = startupLibraryPaths.dbFile

let collectionList = prepareCollectionList()

// 按「数据库文件路径」复用同一个 sequelize 实例:
// 同一个 .sqlite 被两个连接打开时,Windows 上会直接报
// SQLITE_IOERR: disk I/O error(进而连锁成 Transaction cannot be rolled back)。
const mangaModelsByFile = new Map()
let Manga = prepareMangaModel(LIBRARY_DB_FILE)
mangaModelsByFile.set(LIBRARY_DB_FILE, Manga)
let metadataSqliteFile
if (setting.metadataPath) {
  metadataSqliteFile = path.join(setting.metadataPath, './metadata.sqlite')
} else {
  metadataSqliteFile = path.join(STORE_PATH, './metadata.sqlite')
}
let Metadata = prepareMetadataModel(metadataSqliteFile)
// 重建 Metadata 模型:必须先关掉旧连接 —— 同一个 metadata.sqlite 被两个连接打开,
// SQLite 会报 SQLITE_IOERR: disk I/O error,并连锁成
// "Transaction cannot be rolled back because it has been finished with state: commit"。
const rebuildMetadataModel = (file) => {
  const prev = Metadata
  metadataSqliteFile = file
  Metadata = prepareMetadataModel(file)
  if (prev && prev !== Metadata) {
    try { prev.sequelize.close() } catch (e) { /* 已关就忽略 */ }
  }
  return Metadata
}
const getColumns = async (sequelize, tableName) => {
  const query = `PRAGMA table_info(${tableName})`
  const [results] = await sequelize.query(query)
  return results.map(column => column.name)
}
// sqlite 下 sequelize 的 sync({alter:true}) 采用"备份表"策略,复制数据时会引用
// 旧表尚不存在的列而失败,因此新增可选列统一用原生 ALTER TABLE ADD COLUMN 幂等补列
const ensureColumns = async (sequelize, tableName, columnDefs) => {
  const columns = await getColumns(sequelize, tableName)
  for (const [column, definition] of Object.entries(columnDefs)) {
    if (!columns.includes(column)) {
      await sequelize.query(`ALTER TABLE ${tableName} ADD COLUMN ${column} ${definition}`)
    }
  }
}
// 保证一个「库数据库」的表结构与索引就绪(新库建表;老库幂等补列/补索引)。
// 切换活动库时会拿新库的 model 再调一次。
const ensureMangaSchema = async (model) => {
  await model.sync()
  await ensureColumns(model.sequelize, 'Mangas', {
    hiddenBook: 'BOOLEAN DEFAULT false',
    readCount: 'INTEGER DEFAULT 0',
    title_cn: 'TEXT',
    description: 'TEXT'
  })
  await model.sequelize.query('CREATE INDEX IF NOT EXISTS idx_mangas_filepath ON Mangas (filepath)')
  await model.sequelize.query('CREATE INDEX IF NOT EXISTS idx_mangas_hash ON Mangas (hash)')
  await model.sequelize.query('CREATE INDEX IF NOT EXISTS idx_mangas_bundle_mtime ON Mangas (bundleSize, mtime)')
}
// 切换活动库:关闭旧库数据库连接 → 切到新库的数据目录/快照/缓存 → 重新打开并同步库数据库。
// 多库管理 UI 的 apply-libraries 会调用它。
// 扫描循环用:把运行时切到指定库(搬数据只发生在设置页改目录/改名时,这里不搬)
const openLibraryForScan = async (lib) => {
  if (!lib) return false
  const paths = libraryRuntimePaths(STORE_PATH, lib)
  LIBRARY_DATA_DIR = paths.dataDir
  LIBRARY_VIEWCACHE_DIR = paths.viewcacheDir
  CURRENT_COVER_DIR = paths.coverDir
  try { fs.mkdirSync(CURRENT_COVER_DIR, { recursive: true }) } catch (e) { /* 稍后生成封面时再试 */ }
  SNAPSHOT_FILE = paths.snapshotFile
  LIBRARY_DB_FILE = paths.dbFile
  setting.library = lib.path
  Manga = await modelForLibrary(lib.id)
  return true
}

// ★ 扫描用的「上下文」:把「这个库是谁、它的模型、它的根目录」打包成一个不可变对象,
//   传给 runScan 全程使用 —— 不再在中途读全局 Manga / setting.library。
//   事故复盘:以前 runScan 里写入用全局 Manga、路径换算用 scanLib,两者不同源。
//   扫描循环 openLibraryForScan(下一个库) 一旦参与了时序,就可能出现
//   「路径按 A 库算、数据写进 B 库数据库」——小说库混进 1.4 万条漫画就是这么来的。
const scanContextFor = async (lib) => {
  if (!lib) throw new Error('[scan] 没有可用的库')
  const model = await modelForLibrary(lib.id)
  const paths = libraryRuntimePaths(STORE_PATH, lib)
  return {
    lib,
    model,
    root: String(lib.path || '').replace(/[\/]+$/, ''),
    dataDir: paths.dataDir,
    dbFile: paths.dbFile,
    coverDir: paths.coverDir,
    snapshotFile: paths.snapshotFile,
    viewcacheDir: paths.viewcacheDir
  }
}

const switchActiveLibraryRuntime = async (prevLibrary, prevDataDir, options = {}) => {
  // 切换账户(另一份 setting.<账户>.json)时只切运行时,绝不搬数据 ——
  // 两个账户可能给同一个库配了不同的库数据目录,搬一次就是灾难。
  const allowMove = options.allowMove !== false
  const lib = activeLibraryOf(setting)
  const paths = libraryRuntimePaths(STORE_PATH, lib)
  // 同一个库改了「库数据存放位置」:先把原库数据整体搬到新目录(绝不覆盖)
  const movedFromOldDir = (allowMove && !dataPathFallback && shouldMoveLibraryData(prevLibrary, lib, prevDataDir, paths.dataDir))
    ? migrateLibraryData(prevDataDir, paths.dataDir)
    : { moved: [], kept: [] }
  LIBRARY_DATA_DIR = paths.dataDir
  LIBRARY_VIEWCACHE_DIR = paths.viewcacheDir
  CURRENT_COVER_DIR = paths.coverDir
  try { fs.mkdirSync(CURRENT_COVER_DIR, { recursive: true }) } catch (e) { /* 稍后生成封面时再试 */ }
  // 首次升级:旧版放在数据存放目录根部的库数据
  libraryDataMigration = lib ? migrateLibraryData(STORE_PATH, LIBRARY_DATA_DIR) : { moved: [], kept: [] }
  SNAPSHOT_FILE = paths.snapshotFile
  LIBRARY_DB_FILE = paths.dbFile
  // 不关旧连接:每个库的 model 缓存在 mangaModels 里复用,关掉会破坏合并书架
  // ⚠️ 替换全局 Manga 之前,先关掉「没人认领」的旧实例:
  //   启动时会先用 LIBRARY_DB_FILE 建一个 Manga;若某个库的「库数据目录」
  //   正好等于数据目录,那个库的数据库就是同一个文件 ——
  //   两个连接同时写会报 SQLITE_IOERR: disk I/O error(SQLite 是单写者的)。
  const prevManga = Manga
  let nextManga
  if (lib) {
    nextManga = await modelForLibrary(lib.id)
  } else {
    const byFile = mangaModelsByFile.get(LIBRARY_DB_FILE)
    nextManga = byFile || prepareMangaModel(LIBRARY_DB_FILE)
    mangaModelsByFile.set(LIBRARY_DB_FILE, nextManga)
  }
  if (prevManga && prevManga !== nextManga && ![...mangaModels.values()].includes(prevManga)) {
    try { prevManga.sequelize.close() } catch (e) { /* 已关就忽略 */ }
  }
  Manga = nextManga
  if (!lib) await ensureMangaSchema(Manga)
  console.log(`[libraries] 已切换活动库「${lib ? lib.name : '(无)'}」;库数据目录:${LIBRARY_DATA_DIR}`)
  console.log(`[libraries] 库数据库:${LIBRARY_DB_FILE};扫描快照:${SNAPSHOT_FILE};缩略图缓存:${LIBRARY_VIEWCACHE_DIR}`)
  if (movedFromOldDir.moved.length) console.log(`[libraries] 已把库数据从旧位置搬到新位置:${movedFromOldDir.moved.join('、')}`)
  if (libraryDataMigration.moved.length) console.log(`[libraries] 已把库数据搬进库数据目录:${libraryDataMigration.moved.join('、')}`)
}
;(async () => {
  // 先建表再补列:全新数据库(无表)时 ALTER 会失败
  await ensureMangaSchema(Manga)
  await Metadata.sync()
  await ensureColumns(Metadata.sequelize, 'Metadata', {
    title_cn: 'TEXT',
    description: 'TEXT'
  })
})()

const logFile = fs.createWriteStream(path.join(STORE_PATH, 'log.txt'), { flags: 'w' })
const logStdout = process.stdout
const logStderr = process.stderr

console.log = (...message) => {
  logFile.write(format(...message) + '\n')
  logStdout.write(format(...message) + '\n')
}

console.error = (...message) => {
  logFile.write(format(...message) + '\n')
  logStderr.write(format(...message) + '\n')
}

process
  .on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at:', promise, 'reason:', reason)
  })
  .on('uncaughtException', err => {
    console.log(err, 'Uncaught Exception thrown')
    // ⚠ 这里以前是 process.exit(1) —— 任何一个没接住的小错误都会把整个客户端关掉
    //    (用户点「测试代理」闪退就是这么来的:IPC 回调里一处 ReferenceError)。
    //    现在:记日志 + 通知界面,进程继续跑。只有「连弹错误 20 次」才判定为不可恢复并退出,
    //    避免真的进入死循环时一直空转。
    globalThis.__emmUncaughtCount = (globalThis.__emmUncaughtCount || 0) + 1
    try { sendMessageToWebContents('后台出错(已记录日志,程序继续运行):' + String((err && err.message) || err).slice(0, 120)) } catch (e) { /* 界面可能还没好 */ }
    if (globalThis.__emmUncaughtCount > 20) {
      console.log('连续未捕获异常过多,退出')
      process.exit(1)
    }
  })

let settingWriteSeq = 0
const settingTmpPath = () => getSettingFilePath() + '.' + process.pid + '.' + (++settingWriteSeq) + '.tmp'
// ---------- 漫画库列表日志(第二十七/二十八轮) ----------
// ensureLibraries 与每库数据目录在文件上方(setting 就绪后、打开数据库之前)已算好;
// 这里只负责把结果写进 log.txt,并在本地模式把 setting.json 落盘。
if (libraryState.migrated || libraryState.changed) {
  console.log(`[libraries] 漫画库列表已初始化:${setting.libraries.map(l => `${l.name}(${l.path})`).join('、') || '(空)'}`)
  // 只在本地模式落盘:容器模式(共享 /data/setting.json)下 library 会写回 Windows 侧,
  // 这里避免把容器路径 /library 覆盖进跨平台共享的 setting.json。
  if (!process.env.WEB_LIBRARY && !dataPathFallback) {
    try {
      const settingPath = getSettingFilePath()
      const settingTempPath = settingTmpPath()
      fs.writeFileSync(settingTempPath, JSON.stringify(setting, null, '  '), { encoding: 'utf-8' })
      fs.renameSync(settingTempPath, settingPath)
      console.log('[libraries] 已写入 setting.json')
    } catch (e) {
      console.error('[libraries] 写入 setting.json 失败', e)
    }
  }
}
if (activeLibrary) {
  console.log(`[libraries] 活动库「${activeLibrary.name}」;库数据目录:${LIBRARY_DATA_DIR}`)
  console.log(`[libraries] 库数据库:${LIBRARY_DB_FILE};扫描快照:${SNAPSHOT_FILE};缩略图缓存:${LIBRARY_VIEWCACHE_DIR}`)
  if (libraryDataMigration.moved.length) console.log(`[libraries] 已把库数据搬进库数据目录:${libraryDataMigration.moved.join('、')}`)
  if (libraryDataMigration.kept.length) console.log(`[libraries] 目标已存在、保留原地数据(未覆盖):${libraryDataMigration.kept.join('、')}`)
  if (libraryDataMigration.error) console.error(`[libraries] 迁移库数据出错:${libraryDataMigration.error}`)
}

const sendMessageToWebContents = (message) => {
  console.log(message)
  if (WEB_MODE) {
    require('./web-electron-shim.js').broadcast('send-message', message)
  } else {
    mainWindow.webContents.send('send-message', message)
  }
}

// 有界并发:最多 concurrency 个任务同时执行,单个任务异常不会中断整个批次
const runConcurrent = async (items, concurrency, worker) => {
  let next = 0
  const run = async () => {
    while (next < items.length) {
      const index = next++
      try {
        await worker(items[index], index)
      } catch (e) {
        // worker 内部应自行捕获并记录错误;此处兜底避免整个批次被中断
        console.error(e)
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  await Promise.all(workers)
}

let mainWindow
let tray
let screenWidth
let sendImageLock = false

// ---------- Windows 客户端增强功能 ----------
// 原子写入 setting.json(与 save-setting 处理器末尾逻辑一致)
// setting.json 原子写:临时文件必须唯一 —— persistSetting(同步)与 applySetting(异步)可能并发,
// 以前都用 setting.json.tmp,先完成的那次会把临时文件 rename 走,后一次就 ENOENT(用户报的 bug)
const persistSetting = () => {
  // 库配置单独落盘,不写进按账户的设置文件(库跟数据目录走,不跟账户走)
  writeLibrariesFile(extractLibraryConfig(setting))
  const forFile = { ...setting }
  for (const k of LIBRARY_CONFIG_KEYS) delete forFile[k]
  const targetPath = getSettingFilePath()
  const tempPath = settingTmpPath()
  fs.writeFileSync(tempPath, JSON.stringify(forFile, null, '  '), { encoding: 'utf-8' })
  fs.renameSync(tempPath, targetPath)
}

// ---------- 设置按账户隔离(同名账户在 Win 与 NAS 上共用同一份) ----------
// 网页版一个进程要服务多个账户,所以:
//   · ensureProfileSetting —— 每个账户一份设置对象,首次用到时读它自己的 setting.<账户>.json
//     (不存在则回退 setting.json 平滑迁移),之后一直复用缓存;
//   · withAccount —— 把一次请求包进该账户的上下文(AsyncLocalStorage),
//     请求内所有 setting 读写与落盘路径都指向这个账户,多账户并发互不干扰;
//   · switchProfile —— 桌面版登录后切到该账户(单进程单用户,连活动库运行时一起切)。
const ensureProfileSetting = async (username) => {
  const key = safeProfile(username || '')
  const cached = settingsByProfile.get(key)
  if (cached) return cached
  const prev = getActiveProfile()
  let obj
  try {
    // prepareSetting 是同步读文件,这里临时切一下 profile 只为算出正确的文件名,读完立刻还原
    setActiveProfile(key)
    obj = prepareSetting()
    applyContainerLibraryMapping(obj)
    // 库配置与账户无关:一律以 libraries.json 为准(账户文件里即使残留旧库也不认)
    const libCfg = readLibrariesFile()
    if (libCfg) applyLibraryConfig(obj, libCfg)
    ensureLibraries(obj, { nameHint: obj.externalLibraryRoot || setting.externalLibraryRoot })
  } finally {
    setActiveProfile(prev)
  }
  settingsByProfile.set(key, obj)
  console.log(`[profile] 已加载账户配置「${key || '(默认)'}」:${resolveSettingReadPath(key)}`)
  return obj
}

// 网页版:按账户处理一次请求(返回 Promise;请求内 setting 全部指向该账户)
const withAccount = async (username, fn) => {
  const profile = safeProfile(username || '')
  await ensureProfileSetting(profile)
  return runWithProfile(profile, () => fn(profile))
}

// 桌面版:登录后切到该账户的设置(下次启动由 bootstrap.json 的 profile 决定)
const switchProfile = async (username) => {
  const key = safeProfile(username || '')
  const prevProfile = getActiveProfile()
  const prevLib = activeLibraryOf(setting)
  const prevDataDir = LIBRARY_DATA_DIR
  const obj = await ensureProfileSetting(key)
  setActiveProfile(key)
  // 元数据目录可能跟着账户变(metadata.sqlite 属于用户统一配置)
  const newMetaFile = obj.metadataPath
    ? path.join(obj.metadataPath, './metadata.sqlite')
    : path.join(STORE_PATH, './metadata.sqlite')
  if (newMetaFile !== metadataSqliteFile) {
    metadataSqliteFile = newMetaFile
    rebuildMetadataModel(metadataSqliteFile)
    try {
      await Metadata.sync()
      await ensureColumns(Metadata.sequelize, 'Metadata', { title_cn: 'TEXT', description: 'TEXT' })
    } catch (err) { console.log('[profile] 元数据库初始化失败:', String((err && err.message) || err)) }
  }
  await switchActiveLibraryRuntime(prevLib, prevDataDir, { allowMove: false })
  // 桌面端:把该账户的设置落盘(首次登录会把 setting.json 的内容平滑写进 setting.<账户>.json)
  if (!process.env.WEB_LIBRARY && !dataPathFallback) {
    try { persistSetting() } catch (err) { console.log('[profile] 写回设置失败:', String((err && err.message) || err)) }
  }
  console.log(`[profile] 已切换到账户配置「${key || '(默认)'}」:${resolveSettingReadPath(key)}`)
  return { ok: true, changed: key !== prevProfile, profile: key }
}

const showMainWindow = () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.setSkipTaskbar(false)
  mainWindow.focus()
}

// 全局快捷键/托盘点击:显示 ↔ 隐藏(驻留后台继续运行)
const toggleMainWindow = () => {
  if (!mainWindow) return
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    mainWindow.hide()
    mainWindow.setSkipTaskbar(true)
  } else {
    showMainWindow()
  }
}

const applyAlwaysOnTop = (flag) => {
  if (WEB_MODE || !mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setAlwaysOnTop(!!flag, 'floating')
}

// 开机自启动:携带 --autostart 参数,启动后按设置自动最小化/驻留托盘
const setStartOnLogin = (openAtLogin) => {
  if (WEB_MODE) return
  app.setLoginItemSettings({
    openAtLogin: !!openAtLogin,
    args: ['--autostart']
  })
}

// 注册全局快捷键(显示/隐藏窗口),留空则禁用
const registerGlobalHotkey = () => {
  if (WEB_MODE) return
  globalShortcut.unregisterAll()
  const combo = setting.globalHotkey
  if (!combo) return
  try {
    const registered = globalShortcut.register(combo, toggleMainWindow)
    if (!registered) console.log('注册全局快捷键失败(可能已被其他程序占用): ' + combo)
  } catch (e) {
    console.log('注册全局快捷键失败: ' + combo, e)
  }
}

// 归一化 NAS 服务器地址:去首尾空白/斜杠,自动补 http:// 前缀
const normalizeServerUrl = (url) => {
  let target = String(url || '').trim().replace(/[\\/]+$/, '')
  if (!target) return ''
  if (!/^https?:\/\//i.test(target)) target = 'http://' + target
  return target
}

// ============================================================
// 远程 NAS 模式本地代理
// 窗口加载「本地打包的最新界面」(Win 版功能永远可用,与 NAS 网页版版本无关),
// 所有数据请求由本代理转发到 NAS 服务器:
//   POST /api/ipc/:channel → NAS IPC 桥(携带 NAS 会话 Cookie,自动登录)
//   GET  /api/file         → NAS 封面/阅读图片(流式转发)
//   GET  /api/events       → NAS SSE 事件(流式转发)
//   /api/auth/*            → NAS 登录/登出(成功后缓存会话 Cookie)
//   /api/info              → NAS 信息;NAS 不可达时返回兜底信息
// ============================================================
let remoteProxyPort = 0
let remoteProxyServer = null

// NAS 会话持久化:登录 Cookie 存到数据目录,重启后免登录(NAS 会话 7 天内有效)
const nasSessionFile = () => path.join(STORE_PATH, 'nas-session.json')
const loadNasCookie = () => {
  try {
    return JSON.parse(fs.readFileSync(nasSessionFile(), 'utf-8')).cookie || ''
  } catch {
    return ''
  }
}
const saveNasCookie = (cookie) => {
  try {
    fs.writeFileSync(nasSessionFile(), JSON.stringify({ cookie, savedAt: Date.now() }), 'utf-8')
  } catch {}
}
const clearNasCookie = () => {
  try { fs.unlinkSync(nasSessionFile()) } catch {}
}

// 客户端专属设置键:远程模式下这些键保存在本机(其余设置来自/保存到服务器)
const CLIENT_SETTING_KEYS = new Set([
  'remoteServer', 'webUsername', 'webPassword',
  'startOnLogin', 'alwaysOnTop', 'globalHotkey',
  'minimizeOnStart', 'minimizeToTray', 'closeToTray',
])

// 应用客户端专属设置(窗口/托盘/登录项即时生效,写入本地 setting.json)
const applyClientSetting = async (part) => {
  if (part.startOnLogin !== undefined && part.startOnLogin !== setting.startOnLogin) {
    setStartOnLogin(part.startOnLogin)
  }
  if (part.alwaysOnTop !== undefined && part.alwaysOnTop !== setting.alwaysOnTop) {
    applyAlwaysOnTop(part.alwaysOnTop)
    sendWindowState()
  }
  if (part.globalHotkey !== undefined && part.globalHotkey !== setting.globalHotkey) {
    registerGlobalHotkey()
  }
  Object.assign(setting, part)
  if (tray && !setting.minimizeToTray && !setting.closeToTray) {
    tray.destroy()
    tray = null
  }
  if (tray) buildTrayMenu()
  persistSetting()
}

const startRemoteProxy = (remoteServer) => new Promise((resolve) => {
  const proxy = express()
  proxy.disable('x-powered-by')
  proxy.use(express.json({ limit: '100mb' }))
  let nasCookie = ''
  let nasSettingCache = null
  const nasHeaders = () => (nasCookie ? { Cookie: nasCookie } : {})

  // 验证持久化会话是否仍有效
  const verifyNasSession = async () => {
    if (!nasCookie) return false
    try {
      const r = await fetch(remoteServer + '/api/auth/me', { headers: nasHeaders() })
      if (r.status === 200) return true
    } catch {}
    return false
  }

  // 自动登录:先复用持久化会话;失效则用配置的账户重新登录
  const autoLogin = async () => {
    nasCookie = loadNasCookie()
    if (await verifyNasSession()) {
      console.log('NAS 会话已恢复(免登录)')
      return
    }
    clearNasCookie()
    nasCookie = ''
    // 兼容旧字段名:设置页里那两个框曾经写成 remoteUsername / remotePassword
    const username = setting.webUsername || setting.remoteUsername
    const password = setting.webPassword || setting.remotePassword
    if (!username || !password) return
    try {
      const r = await fetch(remoteServer + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await r.json().catch(() => null)
      const sc = r.headers.get('set-cookie') || ''
      if (data && data.ok) {
        nasCookie = sc.split(';')[0]
        saveNasCookie(nasCookie)
        console.log('NAS 自动登录成功: ' + username)
      } else {
        console.log('NAS 自动登录失败: ' + (data && data.error ? data.error : '未知错误'))
      }
    } catch (e) {
      console.log('NAS 自动登录失败:', String(e.message || e))
    }
  }

  proxy.post('/api/auth/login', async (req, res) => {
    try {
      const r = await fetch(remoteServer + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {})
      })
      const data = await r.json().catch(() => null)
      const sc = r.headers.get('set-cookie') || ''
      if (data && data.ok) {
        nasCookie = sc.split(';')[0]
        saveNasCookie(nasCookie)
        // 记住这次登录用的账户:下次启动 autoLogin 直接自动登录,
        // 用户只需在登录框输入一次(不再每次重开都要求重输)
        const u = String((req.body && req.body.username) || '').trim()
        const p = String((req.body && req.body.password) || '')
        if (u) {
          setting.webUsername = u
          setting.webPassword = p
          // 旧字段一并清掉,避免两套值打架
          setting.remoteUsername = ''
          setting.remotePassword = ''
          try { persistSetting() } catch (e) { console.log('保存远程账户失败:', String((e && e.message) || e)) }
          console.log('已记住远程账户: ' + u + '(下次自动登录)')
        }
      }
      res.status(r.status).json(data || { ok: false, error: '登录响应异常' })
    } catch (e) {
      res.status(502).json({ ok: false, error: '无法连接 NAS 服务器:' + (e.message || e) })
    }
  })

  proxy.post('/api/auth/logout', async (req, res) => {
    nasCookie = ''
    clearNasCookie()
    try { await fetch(remoteServer + '/api/auth/logout', { method: 'POST', headers: nasHeaders() }) } catch {}
    res.json({ ok: true })
  })

  proxy.get('/api/auth/me', async (req, res) => {
    try {
      const r = await fetch(remoteServer + '/api/auth/me', { headers: nasHeaders() })
      res.status(r.status).set('Content-Type', 'application/json').send(await r.text())
    } catch (e) {
      res.status(502).json({ ok: false, error: '无法连接 NAS 服务器' })
    }
  })

  proxy.get('/api/info', async (req, res) => {
    try {
      const r = await fetch(remoteServer + '/api/info', { headers: nasHeaders() })
      const info = await r.json()
      // 标记:Windows 客户端远程桌面模式(前端据此按桌面模式显示设置界面)
      info.remoteDesktop = true
      res.json(info)
    } catch (e) {
      // NAS 不可达:返回兜底信息,前端显示登录/连接提示
      res.json({
        webMode: true,
        remoteDesktop: true,
        pathSep: '\\',
        version: require('./package.json').version,
        port: remoteProxyPort,
        auth: true,
        role: null,
        username: null,
        proxyError: '无法连接 NAS 服务器: ' + (e.message || e)
      })
    }
  })

  proxy.post('/api/ipc/:channel', async (req, res) => {
    const channel = req.params.channel
    const args = Array.isArray(req.body?.args) ? req.body.args : []
    // 本地拦截的通道(不转发 NAS)
    if (channel === 'update-window-title') {
      const version = require('./package.json').version
      const title = args[0] ? `exhentai-manga-manager ${version} | ${args[0]}` : `exhentai-manga-manager ${version}`
      if (mainWindow) mainWindow.setTitle(title)
      return res.json({ ok: true, result: null })
    }
    if (channel === 'open-url') {
      const url = args[0]
      if (url) shell.openExternal(String(url))
      return res.json({ ok: true, result: null })
    }
    // 设置类通道:服务器模式下配置信息从服务器获取,仅客户端专属键保存在本机
    if (channel === 'load-setting') {
      let r
      try {
        r = await fetch(remoteServer + '/api/ipc/load-setting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...nasHeaders() },
          body: JSON.stringify({ args: [] })
        })
        const text = await r.text()
        let data
        try {
          data = JSON.parse(text)
        } catch (e) {
          console.log('代理 load-setting: NAS 返回非 JSON(HTTP ' + r.status + '): ' + text.slice(0, 120))
          return res.status(r.status).json({ ok: false, error: '服务器返回异常响应(HTTP ' + r.status + ')' })
        }
        if (data.ok && data.result) {
          // 缓存服务器设置(供 save-setting 拆分时补全敏感字段)
          nasSettingCache = data.result
          // 服务器配置为主,客户端专属键(运行模式/窗口/托盘)用本机值覆盖
          const merged = { ...data.result }
          for (const key of CLIENT_SETTING_KEYS) {
            if (setting[key] !== undefined) merged[key] = setting[key]
          }
          return res.json({ ok: true, result: merged })
        }
        return res.status(r.status).json(data)
      } catch (e) {
        // NAS 不可达:回退本机设置
        console.log('代理 load-setting 回退本地(服务器不可达):', String(e && e.message || e))
        return res.json({ ok: true, result: setting })
      }
    }
    if (channel === 'save-setting') {
      const receive = args[0] || {}
      try {
        // 拆分:客户端专属键 → 本机;其余 → 服务器
        const clientPart = {}
        const serverPart = {}
        for (const [key, value] of Object.entries(receive)) {
          if (CLIENT_SETTING_KEYS.has(key)) clientPart[key] = value
          else serverPart[key] = value
        }
        if (Object.keys(clientPart).length > 0) await applyClientSetting(clientPart)
        if (Object.keys(serverPart).length > 0) {
          // 服务器端 save-setting 会对比 metadataPath,缺失时用缓存的服务器值补全
          if (serverPart.metadataPath === undefined && nasSettingCache && nasSettingCache.metadataPath !== undefined) {
            serverPart.metadataPath = nasSettingCache.metadataPath
          }
          const r = await fetch(remoteServer + '/api/ipc/save-setting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...nasHeaders() },
            body: JSON.stringify({ args: [serverPart] })
          })
          const data = await r.json().catch(() => null)
          if (!r.ok || !data || data.ok !== true) {
            return res.status(r.status || 500).json(data || { ok: false, error: '保存到服务器失败' })
          }
          // 保存成功后刷新缓存
          nasSettingCache = { ...(nasSettingCache || {}), ...serverPart }
        }
        return res.json({ ok: true, result: null })
      } catch (e) {
        return res.status(500).json({ ok: false, error: String(e.message || e) })
      }
    }
    // 桌面窗口/本地功能通道:本地处理(不转发 NAS)
    if (channel === 'window-minimize') {
      if (mainWindow) mainWindow.minimize()
      return res.json({ ok: true, result: getWindowState() })
    }
    if (channel === 'window-toggle-maximize') {
      if (mainWindow) {
        if (mainWindow.isMaximized()) mainWindow.unmaximize()
        else mainWindow.maximize()
      }
      return res.json({ ok: true, result: getWindowState() })
    }
    if (channel === 'window-set-always-on-top') {
      setting.alwaysOnTop = !!args[0]
      applyAlwaysOnTop(setting.alwaysOnTop)
      persistSetting()
      if (tray) buildTrayMenu()
      sendWindowState()
      return res.json({ ok: true, result: getWindowState() })
    }
    if (channel === 'window-toggle-always-on-top') {
      if (mainWindow) {
        setting.alwaysOnTop = !mainWindow.isAlwaysOnTop()
        applyAlwaysOnTop(setting.alwaysOnTop)
        persistSetting()
        if (tray) buildTrayMenu()
        sendWindowState()
      }
      return res.json({ ok: true, result: getWindowState() })
    }
    if (channel === 'get-window-state') {
      return res.json({ ok: true, result: getWindowState() })
    }
    if (channel === 'get-data-path') {
      return res.json({ ok: true, result: { dataPath: STORE_PATH, defaultDataPath: DEFAULT_DATA_PATH, isPortable } })
    }
    if (channel === 'set-data-path') {
      try {
        setBootstrapDataPath(String(args[0] || '').trim())
      } catch (e) {
        return res.json({ ok: false, error: String(e.message || e) })
      }
      app.relaunch()
      app.exit(0)
      return res.json({ ok: true, result: null })
    }
    if (channel === 'open-library-folder') {
      try {
        const err = await shell.openPath(setting.library || app.getPath('downloads'))
        return res.json({ ok: !err, result: null })
      } catch (e) {
        return res.json({ ok: false, error: String(e.message || e) })
      }
    }
    if (channel === 'test-remote-server') {
      return res.json({ ok: true, result: { ok: true, version: require('./package.json').version, remote: true } })
    }
    if (channel === 'relaunch-app') {
      app.relaunch()
      app.exit(0)
      return res.json({ ok: true, result: null })
    }
    if (channel === 'switch-to-local-mode') {
      setting.remoteServer = ''
      setting.webUsername = ''
      setting.webPassword = ''
      persistSetting()
      app.relaunch()
      app.exit(0)
      return res.json({ ok: true, result: null })
    }
    if (channel === 'enable-LAN-browsing') {
      // 远程模式无需局域网浏览(数据本身来自 NAS)
      return res.json({ ok: true, result: false })
    }
    try {
      const r = await fetch(remoteServer + '/api/ipc/' + encodeURIComponent(channel), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...nasHeaders() },
        body: JSON.stringify({ args })
      })
      // 会话失效:清除持久化会话,前端会弹出登录框
      if (r.status === 401) clearNasCookie()
      res.status(r.status).set('Content-Type', 'application/json').send(await r.text())
    } catch (e) {
      res.status(502).json({ ok: false, error: '无法连接 NAS 服务器:' + (e.message || e) })
    }
  })

  proxy.get('/api/file', (req, res) => {
    const target = remoteServer + '/api/file?path=' + encodeURIComponent(String(req.query.path || ''))
    fetch(target, { headers: nasHeaders() })
      .then(r => {
        res.status(r.status)
        r.body.pipe(res)
      })
      .catch(() => res.status(502).send('proxy error'))
  })

  // 目录浏览页:转发到 NAS,远程桌面模式也能新开页面浏览 NAS 文件夹
  proxy.get('/browse', (req, res) => {
    const target = remoteServer + '/browse?path=' + encodeURIComponent(String(req.query.path || ''))
    fetch(target, { headers: nasHeaders() })
      .then(r => { res.status(r.status).set('Content-Type', 'text/html; charset=utf-8'); r.body.pipe(res) })
      .catch(() => res.status(502).send('proxy error'))
  })

  proxy.get('/api/events', (req, res) => {
    fetch(remoteServer + '/api/events', { headers: nasHeaders() })
      .then(r => {
        if (r.status !== 200) return res.status(r.status).end()
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        })
        res.write('retry: 3000\n\n')
        r.body.pipe(res)
        req.on('close', () => { try { r.body.destroy() } catch {} })
      })
      .catch(() => res.status(502).end())
  })

  // 本地打包的最新界面(静态文件 + SPA 回退)
  proxy.use(express.static(path.join(__dirname, 'dist')))
  proxy.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/index.html'))
  })

  // 固定端口:前端 localStorage 按页面 origin(含端口)隔离,
  // 随机端口会导致阅读器模式/排序/阅读进度等设置每次重启丢失
  const PROXY_BASE_PORT = 23886
  const startListen = (port) => {
    remoteProxyServer = proxy.listen(port, '127.0.0.1', async () => {
      remoteProxyPort = remoteProxyServer.address().port
      await autoLogin()
      console.log(`远程模式本地代理已启动: http://127.0.0.1:${remoteProxyPort} → ${remoteServer}`)
      resolve(remoteProxyPort)
    })
    remoteProxyServer.on('error', (e) => {
      if (e.code === 'EADDRINUSE' && port < PROXY_BASE_PORT + 20) {
        startListen(port + 1)
      } else {
        console.log('远程模式本地代理启动失败:', e.message || e)
        resolve(0)
      }
    })
  }
  startListen(PROXY_BASE_PORT)
})

// 远程模式自动登录已由本地代理 startRemoteProxy 完成(携带会话 Cookie 转发请求)

const getWindowState = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return null
  return {
    isMaximized: mainWindow.isMaximized(),
    isMinimized: mainWindow.isMinimized(),
    isAlwaysOnTop: mainWindow.isAlwaysOnTop(),
    isVisible: mainWindow.isVisible()
  }
}

const sendWindowState = () => {
  if (WEB_MODE || !mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('window-state-changed', getWindowState())
}

const buildTrayMenu = () => {
  if (!tray) return
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show / Hide Window',
      click: toggleMainWindow
    },
    { type: 'separator' },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: !!(setting.alwaysOnTop),
      click: (menuItem) => {
        setting.alwaysOnTop = !!menuItem.checked
        applyAlwaysOnTop(setting.alwaysOnTop)
        persistSetting()
        buildTrayMenu()
        sendWindowState()
      }
    },
    {
      label: 'Minimize to Tray',
      type: 'checkbox',
      checked: !!(setting.minimizeToTray),
      click: (menuItem) => {
        setting.minimizeToTray = !!menuItem.checked
        persistSetting()
        buildTrayMenu()
      }
    },
    {
      label: 'Start on Login',
      type: 'checkbox',
      checked: !!(setting.startOnLogin),
      click: (menuItem) => {
        setting.startOnLogin = !!menuItem.checked
        setStartOnLogin(setting.startOnLogin)
        persistSetting()
      }
    },
    { type: 'separator' },
    {
      // 远程 NAS 模式下,网页版界面内无法改客户端设置,托盘提供退出远程模式的出口
      label: 'Exit Remote NAS Mode',
      visible: !!normalizeServerUrl(setting.remoteServer),
      click: () => {
        setting.remoteServer = ''
        persistSetting()
        app.relaunch()
        app.exit(0)
      }
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        if (mainWindow) mainWindow.destroy()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
}

const createTray = () => {
  if (tray) return
  const iconPath = path.join(__dirname, 'public/icon.png')
  tray = new Tray(iconPath)
  tray.setToolTip('exhentai-manga-manager')
  tray.on('click', toggleMainWindow)
  buildTrayMenu()
}

const createWindow = () => {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1560,
    defaultHeight: 1000,
    maximize: true
  })
  // NAS 远程模式:填写服务器地址后直接加载远程网页版/Docker 服务
  const remoteServer = normalizeServerUrl(setting.remoteServer)
  const win = new BrowserWindow({
    'x': mainWindowState.x,
    'y': mainWindowState.y,
    'width': mainWindowState.width,
    'height': mainWindowState.height,
    webPreferences: {
      webSecurity: app.isPackaged ? true : false,
      // 远程模式使用空 preload:不暴露本地 IPC,前端自动走网页版桥直连服务器
      preload: path.join(__dirname, remoteServer ? 'preload-remote.js' : 'preload.js')
    },
    show: false
  })
  if (remoteServer) {
    // 远程模式:加载本地打包的最新界面,数据经本地代理转发到 NAS
    win.loadURL(remoteProxyPort ? `http://127.0.0.1:${remoteProxyPort}/` : remoteServer)
  } else if (app.isPackaged) {
    win.loadFile('dist/index.html')
  } else {
    win.loadURL('http://localhost:5374')
  }
  win.setMenuBarVisibility(false)
  win.setAutoHideMenuBar(true)
  // 窗口置顶设置
  if (setting.alwaysOnTop) win.setAlwaysOnTop(true, 'floating')
  const menu = Menu.buildFromTemplate(prepareTemplate(win))
  Menu.setApplicationMenu(menu)
  win.webContents.on('did-finish-load', () => {
    const name = require('./package.json').name
    const version = require('./package.json').version
    win.setTitle(remoteServer ? `${name} ${version} | NAS: ${remoteServer}` : name + ' ' + version)
    // 远程模式的自动登录已由本地代理(startRemoteProxy)完成
  })
  win.once('ready-to-show', () => {
    // 开机自启动(带 --autostart 参数)时默认不打扰:按设置最小化或驻留托盘
    const autoStarted = process.argv.includes('--autostart') || app.getLoginItemSettings().wasOpenedAtLogin
    if (setting.minimizeToTray && (autoStarted || setting.minimizeOnStart)) {
      createTray()
      win.hide()
      win.setSkipTaskbar(true)
    } else if (setting.minimizeOnStart || autoStarted) {
      win.minimize()
    } else {
      win.show()
    }
  })
  win.on('close', (event) => {
    if (setting.closeToTray) {
      event.preventDefault()
      createTray()
      win.hide()
      win.setSkipTaskbar(true)
    }
  })
  win.on('minimize', (event) => {
    if (setting.minimizeToTray) {
      event.preventDefault()
      createTray()
      win.hide()
      win.setSkipTaskbar(true)
    }
    sendWindowState()
  })
  win.on('maximize', () => sendWindowState())
  win.on('unmaximize', () => sendWindowState())
  win.on('restore', () => {
    win.show()
    win.setSkipTaskbar(false)
    sendWindowState()
  })
  win.on('show', () => {
    win.setSkipTaskbar(false)
    mainWindowState.manage(win)
  })
  return win
}

if (!WEB_MODE) {
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=65536')
  // app.disableHardwareAcceleration()
  // 单实例:重复启动时聚焦已有窗口,而不是再开一个
  if (!app.requestSingleInstanceLock()) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      showMainWindow()
    })
    app.whenReady().then(() => {
      // 在线图片代理(桌面版):只放行 EH 的几个域名,避免变成任意 URL 的代理
      try {

        protocol.handle(EH_IMG_SCHEME, async (req) => {
          try {
            const reqUrl = new URL(req.url)
            const raw = reqUrl.searchParams.get('u') || ''
            // t = 前端这一页的 id:用来把下载进度回推给对应的占位环
            const progressTag = reqUrl.searchParams.get('t') || ''
            // referer 由前端带过来:必须是「图片所在的 /s/<hash>/<gid>-<n> 页」。
            // EH 的 H@H 节点会校验收图来源;用站点根当 referer 更容易被拒。
            const pageRef = reqUrl.searchParams.get('r') || 'https://e-hentai.org/'
            if (!EH_IMG_HOST_RE.test(raw)) return new Response('bad url', { status: 400 })
            const cached = ehImgCacheGet(raw)
            if (cached) {
              return new Response(cached.buffer, {
                status: 200,
                headers: { 'Content-Type': cached.type, 'X-Img-Cache': 'hit', 'Cache-Control': 'no-store' }
              })
            }
            await ehImgAcquire()
            // 并发槽只释放一次:正常由 finally 释放;若流被 cancel(用户滑走),
            // cancel 里提前释放并置位,finally 就不再重复放。
            let slotReleased = false
            try {
              let lastErr = null
              // 重试链:① 同 URL 再试(网络抖动) → ② 回图片页重新解析拿新 nl 换 H@H 节点
              //   注意:以前是把 ?nl=xxx 直接拼到**图片 URL** 上 —— 那是无效的,
              //   必须回到「图片页」读 return nl('...') 才能真正换节点。
              for (let attempt = 0; attempt < 3; attempt++) {
                let target = raw
                if (attempt >= 1) {
                  try {
                    const fresh = await ehLogin.resolvePageImageInfo(pageRef, {
                      proxy: setting.proxy, cookie: ehCookieHeader(), reloadKey: ''
                    })
                    if (fresh && fresh.url && fresh.url !== raw) target = fresh.url
                  } catch (e) { /* 拿不到新节点就沿用原地址再试 */ }
                }
                try {
                  const r = await ehLogin.request(target, {
                    proxy: setting.proxy,
                    raw: true,
                    stream: true,
                    referer: pageRef,
                    timeout: 30000
                  })
                  if (!r || r.status !== 200) {
                    lastErr = new Error('upstream ' + (r && r.status))
                    if (r && r.stream && r.stream.resume) r.stream.resume()
                    await new Promise(cb => setTimeout(cb, 400 * (attempt + 1)))
                    continue
                  }
                  // 限速页 / 删图页返回的是 HTML:不能当图片交出去,更不能写进缓存
                  const ctype = String((r.headers && r.headers['content-type']) || '')
                  // ★ WebP 原图先整张取回、转成 progressive JPEG 再返回。
                  //   原因:实测浏览器对 WebP 是「整张解码」的,流式喂进去也不会逐段显示;
                  //   progressive JPEG 才会「先出模糊整页、再逐层清晰」——
                  //   这就是用户要的「像 e-hentai 那样一点点加载出来」。
                  //   代价:WebP 这一支要等整张收完才能转码(但换来的是视觉上的渐进)。
                  if (/^image\/webp/i.test(ctype)) {
                    try {
                      const full = await new Promise((resolve, reject) => {
                        const bufs = []
                        let size = 0
                        // 转码要等整张收完(可能好几秒):期间必须持续上报进度,
                        // 否则前端占位会停在 0% 像卡死,Chromium 也可能先给出一次 error。
                        const tTotal = Number((r.headers && r.headers['content-length']) || 0)
                        let tLastEmit = 0
                        let tLastRatio = -1
                        r.stream.on('data', (c) => {
                          size += c.length
                          if (size > TRANSCODE_MAX_BYTES) { reject(new Error('too-large')) ; try { r.stream.destroy() } catch (e) { /* 忽略 */ } ; return }
                          bufs.push(c)
                          if (progressTag) {
                            const now = Date.now()
                            const ratio = tTotal ? Math.min(0.95, size / tTotal * 0.95) : -1
                            const due = ratio < 0 ? (now - tLastEmit >= 120) : (ratio - tLastRatio >= 0.05 || now - tLastEmit >= 120)
                            if (due) {
                              tLastRatio = ratio
                              tLastEmit = now
                              try { emitToRenderer('eh-image-progress', { t: progressTag, ratio }) } catch (e) { /* 忽略 */ }
                            }
                          }
                        })
                        r.stream.on('end', () => resolve(Buffer.concat(bufs)))
                        r.stream.on('error', reject)
                      })
                      const jpg = await transcodeToProgressiveJpeg(full)
                      if (jpg) {
                        ehImgCachePut(raw, jpg, 'image/jpeg')
                        if (progressTag) {
                          try { emitToRenderer('eh-image-progress', { t: progressTag, ratio: 1 }) } catch (e) { /* 忽略 */ }
                        }
                        return new Response(jpg, {
                          status: 200,
                          headers: { 'Content-Type': 'image/jpeg', 'X-Img-Cache': 'miss', 'Cache-Control': 'no-store' }
                        })
                      }
                      // 转码失败:退回把原始 WebP 直接给(至少能显示)
                      return new Response(full, {
                        status: 200,
                        headers: { 'Content-Type': ctype, 'X-Img-Cache': 'miss', 'Cache-Control': 'no-store' }
                      })
                    } catch (e) {
                      // 太大或取流出错:继续走下面的通用流式路径
                    }
                  }
                  if (!/^image\//i.test(ctype)) {
                    lastErr = new Error('not-image:' + ctype.slice(0, 30))
                    if (r.stream && r.stream.resume) r.stream.resume()
                    await new Promise(cb => setTimeout(cb, 400 * (attempt + 1)))
                    continue
                  }
                  // ★ 关键改造:边收边转,而不是等整包收完再回 Response。
                  //   浏览器直接看 EH 之所以「从不失败」,很大一部分原因是首块到达就开始画;
                  //   以前要 Buffer 收满才返回,慢节点会白屏很久并最终被判失败。
                  const total = Number((r.headers && r.headers['content-length']) || 0)
                  const sink = r.stream
                  let received = 0
                  const collect = []
                  // 进度节流状态(每 5% 或 120ms 才发一次 IPC)
                  let lastRatio = -1
                  let lastEmit = 0
                  const imgStream = new ReadableStream({
                    start (controller) {
                      const endWith = (err) => {
                        if (!err && received <= EH_IMG_CACHE_MAX_BYTES / 8 && collect.length) {
                          try { ehImgCachePut(raw, Buffer.concat(collect), ctype) } catch (e) { /* 忽略 */ }
                        }
                        if (err) { lastErr = err; try { controller.error(err) } catch (e) { /* 已关闭 */ } }
                        else { try { controller.close() } catch (e) { /* 已关闭 */ } }
                      }
                      sink.on('data', (chunk) => {
                        received += chunk.length
                        if (received <= EH_IMG_CACHE_MAX_BYTES / 8) collect.push(chunk)
                        // 进度节流:不是每块都发 IPC(几百条会把渲染进程压垮)
                        if (progressTag) {
                          const now = Date.now()
                          const ratio = total ? Math.min(1, received / total) : -1
                          const due = ratio < 0 ? (now - lastEmit >= 120) : (ratio >= 1 || ratio - lastRatio >= 0.05 || now - lastEmit >= 120)
                          if (due) {
                            lastRatio = ratio
                            lastEmit = now
                            try { emitToRenderer('eh-image-progress', { t: progressTag, ratio }) } catch (e) { /* 忽略 */ }
                          }
                        }
                        try { controller.enqueue(new Uint8Array(chunk)) } catch (e) { /* 已关闭 */ }
                        // 背压:下游缓冲满了就暂停上游,别把内存灌爆
                        if (controller.desiredSize !== null && controller.desiredSize <= 0) sink.pause()
                      })
                      sink.on('end', () => endWith(null))
                      sink.on('error', (e) => endWith(e))
                    },
                    pull () {
                      if (typeof sink.isPaused === 'function' && sink.isPaused()) sink.resume()
                    },
                    // 用户滑走/关阅读器时 Chromium 会 cancel:断开上游并立刻归还并发槽,
                    // 否则「没人看的页」会把槽占死,后面的页只能排队。
                    cancel () {
                      try { if (sink.destroy) sink.destroy() } catch (e) { /* 忽略 */ }
                      if (!slotReleased) { slotReleased = true; try { ehImgRelease() } catch (e) { /* 忽略 */ } }
                    }
                  })
                  const hdrs = { 'Content-Type': ctype, 'X-Img-Cache': 'miss', 'Cache-Control': 'no-store' }
                  if (total) hdrs['Content-Length'] = String(total)
                  return new Response(imgStream, { status: 200, headers: hdrs })
                } catch (e) {
                  lastErr = e
                  await new Promise(cb => setTimeout(cb, 400 * (attempt + 1)))
                }
              }
              return new Response(String((lastErr && lastErr.message) || 'upstream error'), { status: 502 })
            } finally {
              // cancel 已提前释放过就不再放,否则计数会变成负数
              if (!slotReleased) ehImgRelease()
            }
          } catch (e) {
            return new Response(String((e && e.message) || e), { status: 502 })
          }
        })

      } catch (e) { console.error('register eh image protocol failed', e) }
    })

    app.whenReady().then(async () => {
      // Windows 任务栏正确分组与通知归属
      app.setAppUserModelId('electron.e-hentai.tagger')
      const primaryDisplay = screen.getPrimaryDisplay()
      screenWidth = Math.floor(primaryDisplay.workAreaSize.width * primaryDisplay.scaleFactor)
      // 远程模式:先启动本地代理(窗口加载本地界面,数据转发到 NAS)
      const remoteServer = normalizeServerUrl(setting.remoteServer)
      if (remoteServer) {
        try {
          remoteProxyPort = await startRemoteProxy(remoteServer)
        } catch (e) {
          console.log('远程模式本地代理启动失败:', e)
        }
      }
      mainWindow = createWindow()
      registerGlobalHotkey()
      // 数据目录不可用:明确弹窗,绝不静默换目录
      if (dataPathFallback) {
        setTimeout(() => {
          dialog.showMessageBox({
            type: 'warning',
            title: '数据目录不可用',
            message: '你设置的数据目录打不开,本次已临时改用默认目录。',
            detail: '设置的目录:' + dataPathFallback.configured
              + '\n错误:' + dataPathFallback.error
              + '\n本次实际使用:' + dataPathFallback.actual
              + '\n\n为避免弄乱默认目录里的旧数据,本次启动不会搬迁、也不会写入任何设置与库数据。'
              + '\n请检查该目录(例如网络盘/NAS 是否已挂载)后重启客户端。',
            buttons: ['知道了'],
            noLink: true
          }).catch(() => {})
        }, 1500)
      }
    })
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })

  app.on('ready', async () => {
    if (setting.proxy) {
      await session.defaultSession.setProxy({
        mode: 'fixed_servers',
        proxyRules: setting.proxy
      })
    }
    // session.defaultSession.loadExtension(path.join(__dirname, './devtools'))
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
}

process.on('exit', () => {
  if (!WEB_MODE) app.quit()
})

// base function
const loadBookListFromBrFile = async () => {
  try {
    const buffer = await fs.promises.readFile(path.join(LIBRARY_DATA_DIR, 'bookList.json.br'))
    const decodeBuffer = await promisify(brotliDecompress)(buffer)
    return JSON.parse(decodeBuffer.toString())
  } catch {
    try {
      return JSON.parse(await fs.promises.readFile(path.join(LIBRARY_DATA_DIR, 'bookList.json'), { encoding: 'utf-8' }))
    } catch {
      return []
    }
  }
}

const loadLegecyBookListFromFile = async () => {
  const bookList = await loadBookListFromBrFile()
  try {
    shell.trashItem(path.join(LIBRARY_DATA_DIR, 'bookList.json.br'))
    shell.trashItem(path.join(LIBRARY_DATA_DIR, 'bookList.json'))
  } catch {
    console.log('Remove Legecy BookList Failed')
  }
  return bookList
}

// ---------- 按「书所属的库」翻译路径(多库 + 跨端) ----------
// 约定:数据库里的 filepath 统一按「桌面(Windows)形式」保存(= 该库 path 的前缀),
// 网页端读写时按同一个库的 pathWeb 做双向映射。库按名字归并(见 modules/libraries.js),
// 所以两端同名库的 path / pathWeb 一定在同一条记录里。
// 旧实现只有全局 externalLibraryRoot,多库时非活动库的书翻译不了 ——
// 这正是「网页版能看封面、阅读器却一直白」的根因(图片路径根本没落到容器里)。
const {
  localizeBookPath: localizeBookPathIn, externalizeBookPath: externalizeBookPathIn,
  isAbsoluteStoredPath, isUrlLike, relativeToLibrary, resolveFromLibrary, libraryOwnerOfPath, relByRootTail, relForStoredPath
} = require('./modules/libraryPaths.js')
// 以「当前库列表 + 当前端」为准的翻译(纯函数见 modules/libraryPaths.js,可单独测试)
const localizeBookPath = (p) => localizeBookPathIn(p, setting.libraries, IS_WEB_ENV)
const externalizeBookPath = (p) => externalizeBookPathIn(p, setting.libraries, IS_WEB_ENV)

// 这本书属于哪个库:多库合并书架下,相对路径必须按「它自己那个库」的库根拼
const libForBook = (book) => {
  const libs = runtimeLibs()
  if (book && book.libraryId) {
    const hit = libs.find(l => l.id === book.libraryId)
    if (hit) return hit
  }
  return activeLibraryOf(setting) || null
}
// 当前「正在写库 / 正在扫描」的那个库:openLibraryForScan() 会把 setting.library 换成它的本端路径
const currentLibrary = () => {
  const cur = String(setting.library || '').trim()
  if (cur) {
    const hit = runtimeLibs().find(l => String(l.path || '').trim() === cur)
    if (hit) return hit
  }
  return activeLibraryOf(setting) || null
}

// 跨端路径翻译(读库后、展示/取图前调用)。两种存储形式都读得懂:
//   ① 相对路径(当前格式,相对该库根)—— 按「这本书所属的库」的本端库根拼回绝对路径;
//     这样同一份库数据库在桌面(Y:\01-漫画)、容器(/library)、换盘符换共享后都能读;
//   ② 绝对路径(老格式:Windows 盘符 / UNC / 容器 /library…)—— 按下面的老规则翻译。
const translateBookPath = (p, kind, lib, coverDir) => {
  if (!p) return p
  if (kind === 'filepath') {
    if (isUrlLike(p)) return p
    if (!isAbsoluteStoredPath(p)) {
      // 相对路径只有知道「属于哪个库」才拼得出来;拿不到库上下文时退一步:
      // 只有唯一一个库才敢拼(宁可拼不出来,也不要拼到别的库上去)
      const libs = runtimeLibs()
      const owner = lib || (libs.length === 1 ? libs[0] : null)
      const local = owner ? resolveFromLibrary(p, owner, IS_WEB_ENV) : null
      return local || p
    }
    // ① 多库:按书所属库翻译(网页端阅读能否取到图,全靠这一步)
    const localized = localizeBookPath(p)
    if (localized !== p) return localized
    // ② 旧版单库兜底:externalLibraryRoot(容器模式按 WEB_LIBRARY 设置)
    const root = setting.externalLibraryRoot || setting.windowsLibraryRoot
    if (root && p.startsWith(root)) {
      const rel = p.slice(root.length).replace(/\\/g, '/').replace(/^\/+/, '')
      return rel ? path.join(setting.library, rel) : setting.library
    }
    return p
  }
  if (kind === 'coverPath' && (/^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/'))) {
    // 封面绝对路径(Windows 盘符 / UNC / Linux 如 /data/cover/...) →
    // 只取文件名,映射到当前封面目录(封面文件统一存在共享 cover 目录,
    // NAS 端写入的 /data/cover/x.webp 在 Windows 桌面也能据此读到)
    const base = p.split(/[\\/]/).pop()
    return base ? path.join(coverDir || CURRENT_COVER_DIR, base) : p
  }
  return p
}

// 反向翻译(写库前调用)。新格式:写「相对所属库根」的相对路径 —— 两端、换盘符、换共享都读得懂;
// 只有路径不在任何库根下时(理论上不该出现)才退回原来的绝对形式,至少不丢路径。
const toExternalPath = (p, kind, lib, coverDir) => {
  if (!p) return p
  if (kind === 'filepath') {
    if (isUrlLike(p)) return p
    // ★ 严格归属校验(事故根因修复):
    //   以前是 owner = lib || libraryOwnerOfPath(p, ...) —— 传进来的 lib 会被无条件采信,
    //   于是「扫描小说库时把漫画的绝对路径 /library/S/xxx 传进来」会被压成
    //   「相对小说库根」的 "S/xxx",写进小说库后已无从判断归属(线上就是这么脏了 1.4 万行)。
    //   现在:传了 lib 就必须真的落在该库根下才折算;否则退回自动识别,绝不硬猜。
    let owner = null
    if (lib) {
      const rel = relativeToLibrary(p, lib, IS_WEB_ENV)
      if (rel !== null && rel !== '' && !rel.split(/[\\/]/).includes('..')) owner = lib
    }
    if (!owner) owner = libraryOwnerOfPath(p, runtimeLibs(), IS_WEB_ENV)
    if (owner) {
      const rel = relativeToLibrary(p, owner, IS_WEB_ENV)
      if (rel !== null && rel !== '' && !rel.split(/[\\/]/).includes('..')) return rel
    }
    // ① 老规矩:本端路径 → 桌面(规范)形式
    const externalized = externalizeBookPath(p)
    if (externalized !== p) return externalized
    // ② 旧版单库兜底
    if (setting.externalLibraryRoot && p.startsWith(setting.library)) {
      const rel = p.slice(setting.library.length).replace(/[/\\]+/g, '\\')
      return setting.externalLibraryRoot + rel
    }
    return p
  }
  const covDir = coverDir || CURRENT_COVER_DIR
  if (kind === 'coverPath' && setting.externalCoverRoot && p.startsWith(covDir)) {
    return setting.externalCoverRoot + '\\' + p.slice(covDir.length).replace(/[/\\]+/g, '\\')
  }
  return p
}

// 库数据库里的行:它属于哪个库(findBookAcrossLibraries 的返回值 / 行自带 libraryId 都认)
const libForRow = (found) => {
  const id = String((found && (found.libraryId || (found.row && found.row.libraryId))) || '')
  const libs = runtimeLibs()
  return (id ? libs.find(l => l.id === id) : null) || activeLibraryOf(setting) || null
}
// 库数据库里的行 → 本端绝对路径(相对路径按它所属库的库根拼;老格式绝对路径照老规则翻译)
const localizeRowPath = (row, lib) => translateBookPath(row && row.filepath, 'filepath', lib || null)

// ---------- 库数据库里的路径规范化:老格式绝对路径 → 相对库根 ----------// 升级到「相对路径存储」时,把库里已经存在的绝对路径行转成相对形式:
//   · 前缀正好是本库根(正常情况)→ 去掉前缀;
//   · 前缀已经失效(换过盘符/共享,例如库里全是 T:\01-漫画\... 而库根是 Y:\01-漫画)→
//     用「库根末尾几段」当锚点定位,锚点后面的部分就是相对路径;
//   · 认不出来的行原样保留(照旧按绝对路径读,不会丢数据)。
// 幂等:库里没有绝对路径行时什么都不写,可以每次启动都跑。
const normalizeLibraryPaths = async (lib) => {
  const model = await modelForLibrary(lib.id)
  const rows = await model.findAll({ attributes: ['id', 'filepath'], raw: true })
  const todo = []
  let byPrefix = 0
  let byAnchor = 0
  let unknown = 0
  for (const row of rows) {
    const p = String(row.filepath || '')
    if (!p || !isAbsoluteStoredPath(p)) continue
    const hit = relForStoredPath(p, lib, IS_WEB_ENV)
    if (!hit) {
      unknown++
      continue
    }
    if (hit.how === 'prefix') byPrefix++
    else byAnchor++
    todo.push({ id: row.id, rel: hit.rel })
  }
  if (todo.length) {
    // 分批提交(每批 500 行):一万多行挤进一个事务,在网络盘上很容易超时/报
    // SQLITE_IOERR disk I/O error(连接会被 sequelize 判为不可用而强杀);
    // 分批既有进度、失败也只影响当前这一批
    const BATCH = 500
    for (let i = 0; i < todo.length; i += BATCH) {
      const chunk = todo.slice(i, i + BATCH)
      await model.sequelize.transaction(async (t) => {
        for (const it of chunk) {
          await model.update({ filepath: it.rel }, { where: { id: it.id }, transaction: t })
        }
      })
    }
  }
  return { total: rows.length, changed: todo.length, byPrefix, byAnchor, unknown }
}
// 每个库只规范化一次(库数据目录变了/新加的库会各自再算一次)
const normalizedLibraryKeys = new Set()
const pathNormalizeJobs = new Map()
const ensureLibraryPathsNormalized = async () => {
  const libs = runtimeLibs().filter(l => isLibraryActive(l, IS_WEB_ENV))
  for (const lib of libs) {
    const key = lib.id + '|' + (libraryRuntimePaths(STORE_PATH, lib).dbFile || '')
    if (normalizedLibraryKeys.has(key)) continue
    let job = pathNormalizeJobs.get(key)
    if (!job) {
      job = normalizeLibraryPaths(lib).then(r => {
        normalizedLibraryKeys.add(key)
        if (r.changed || r.unknown) {
          console.log(`[paths] 库「${lib.name}」路径规范化:${r.changed} 条绝对路径 → 相对路径(按库根前缀 ${r.byPrefix}、按库名锚点 ${r.byAnchor}),无法识别保留 ${r.unknown} 条`)
        }
        return r
      }).catch(e => {
        console.error(`[paths] 库「${lib.name}」路径规范化失败:${String((e && e.message) || e)}`)
      }).finally(() => pathNormalizeJobs.delete(key))
      pathNormalizeJobs.set(key, job)
    }
    await job
  }
}

// ---------- 封面懒加载(用户使用时按需生成,以漫画名命名) ----------
// 文件名清洗:去掉 Windows 非法字符/控制字符/结尾空格点,规避保留名,限制长度
const sanitizeFileName = (name) => {
  let n = String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(n)) n = '_' + n
  if (n.length > 180) n = n.slice(0, 180)
  return n || 'unnamed'
}

// 以漫画名(文件名去扩展名)生成封面文件名:
// 用 openSync('wx') 独占创建占位文件,同名自动加序号,并发生成也不会互相覆盖
// 某本书的封面目录 —— 必须是【它自己所属库】的封面目录。
// 之前一律用全局 CURRENT_COVER_DIR(跟着"活动库"走),合并书架里只要书的库 ≠ 活动库,
// 封面就会写错目录/找不到 —— 这就是「同一个库在 Win 上没封面、NAS 上有」的根因。
const coverDirOf = (lib) => libraryRuntimePaths(STORE_PATH, lib).coverDir
const bookCoverDir = (book) => {
  const libs = runtimeLibs()
  const lib = (book && book.libraryId ? libs.find(l => l.id === book.libraryId) : null) || activeLibraryOf(setting)
  return lib ? coverDirOf(lib) : CURRENT_COVER_DIR
}

const acquireCoverName = (filepath, coverDir) => {
  const base = sanitizeFileName(path.basename(String(filepath || '').replace(/[\\/]+$/, '')).replace(/\.[^.]+$/, ''))
  let coverName = `${base}.webp`
  for (let i = 2; ; i++) {
    try {
      const fd = fs.openSync(path.join(coverDir || CURRENT_COVER_DIR, coverName), 'wx')
      fs.closeSync(fd)
      return coverName
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      coverName = `${base} (${i}).webp`
    }
  }
}

// 生成失败时释放占位文件(sharp 成功输出时会直接覆盖占位文件)
const releaseCoverName = (coverName, coverDir) => {
  try { fs.rmSync(path.join(coverDir || CURRENT_COVER_DIR, coverName), { force: true }) } catch {}
}

// 生成封面(指定漫画名)并返回本地 coverPath;失败返回 null
const generateCoverByName = async (book, coverDir) => {
  const dir = coverDir || bookCoverDir(book)
  const filepath = translateBookPath(book.filepath, 'filepath', libForBook(book))
  const type = book.type || 'archive'
  const coverName = acquireCoverName(filepath, dir)
  try {
    const { coverPath } = await geneCover(filepath, type, coverName, dir)
    if (!coverPath || !fs.existsSync(coverPath)) {
      releaseCoverName(coverName, dir)
      return null
    }
    return coverPath
  } catch (e) {
    releaseCoverName(coverName, dir)
    throw e
  }
}

// 把封面路径写回共享数据库(路径按当前环境转外部格式)
const updateBookCoverPath = async (id, coverPath, coverDir) => {
  const ext = toExternalPath(coverPath, 'coverPath', null, coverDir)
  // 合并书架下必须写回这本书自己的库
  const model = await modelForBookId(id)
  await model.update({ coverPath: ext }, { where: { id } })
  return ext
}

// 全局封面生成并发限制:同时最多 4 个(解压+sharp 较吃磁盘/CPU)
let coverSlots = 0
const coverWaiters = []
const takeCoverSlot = () => new Promise(resolve => {
  const max = coverConcurrency()
  if (coverSlots < max) { coverSlots++; resolve() } else coverWaiters.push(resolve)
})
const releaseCoverSlot = () => {
  coverSlots--
  const next = coverWaiters.shift()
  if (next) { coverSlots++; next() }
}

// 每本书的生成任务锁:并发请求只生成一次
const coverJobs = new Map()

// 封面文件必须「存在且不为空」才算可用。
// 背景:封面是先建 0 字节占位文件、再让 sharp 覆盖写入的;如果生成环节出错或写到别处,
// 就会留下 0 字节文件 —— 只判 existsSync 会把空文件当封面,表现就是「封面全是破图」。
const isUsableCover = (p) => {
  if (!p) return false
  try { return fs.statSync(p).size > 0 } catch (e) { return false }
}

// 按需确保封面存在:
// 1) DB 里 coverPath 翻译成本地路径后文件存在 → 直接复用;
// 2) 否则按 basename 在共享封面目录里找(另一平台生成的旧封面) → 复用并修正 DB 路径;
// 3) 都没有 → 生成并以漫画名命名。
const ensureBookCover = (book) => {
  if (!book || !book.id) return Promise.resolve(null)
  if (coverJobs.has(book.id)) return coverJobs.get(book.id)
  const job = (async () => {
    try {
      // 封面目录跟着「这本书所属的库」走,不再是全局的 CURRENT_COVER_DIR
      const coverDir = bookCoverDir(book)
      try { fs.mkdirSync(coverDir, { recursive: true }) } catch (e) { /* 稍后生成时再试 */ }
      if (book.coverPath) {
        const local = translateBookPath(book.coverPath, 'coverPath', null, coverDir)
        if (isUsableCover(local)) return local
        // basename 兜底:文件可能被另一端生成在同一个封面目录里
        const base = String(book.coverPath).replace(/[\\/]+$/, '').split(/[\\/]/).pop()
        if (base) {
          const fallback = path.join(coverDir, base)
          if (isUsableCover(fallback)) {
            await updateBookCoverPath(book.id, fallback, coverDir)
            return fallback
          }
        }
      }
      await takeCoverSlot()
      try {
        const coverPath = await generateCoverByName(book, coverDir)
        if (coverPath) await updateBookCoverPath(book.id, coverPath, coverDir)
        return coverPath
      } finally {
        releaseCoverSlot()
      }
    } catch (e) {
      console.error(`生成封面失败 ${book.filepath}:`, e)
      return null
    }
  })()
  coverJobs.set(book.id, job)
  job.finally(() => coverJobs.delete(book.id)).catch(() => {})
  return job
}

ipcMain.handle('ensure-book-cover', async (event, id) => {
  try {
    const found = await findBookAcrossLibraries({ id })
    const book = found.row
    if (!book) return null
    book.libraryId = found.libraryId || bookLibraryById.get(id)
    if (book.libraryId) rememberBookLibrary(book)
    const coverPath = await ensureBookCover(book)
    // 建库阶段跳过了页数/hash 的探测(那步要打开压缩包,很贵):
    // 用户浏览到这本书时顺便补上 —— 补完它才会出现在「按页数排序」、也才能关联到标签。
    if (!book.hash || book.pageCount === null || book.pageCount === undefined) {
      try {
        const lib = (setting.libraries || []).find(l => l.id === book.libraryId)
        const fp2 = translateBookPath(book.filepath, 'filepath', lib)
        const r = await geneCover(fp2, book.type, null, coverDirOf(lib))
        await found.model.update({
          hash: r.hash || null,
          pageCount: r.pageCount || null,
          bundleSize: r.bundleSize,
          mtime: r.mtime ? r.mtime.toJSON() : book.mtime,
          coverHash: r.coverHash || null
        }, { where: { id: book.id } })
      } catch (e) { /* 补不上就算了,不影响封面 */ }
    }
    return coverPath ? { coverPath } : null
  } catch (e) {
    console.error(e)
    return null
  }
})

let noLibraryNotified = false
// ---------- 旧版书架迁移:metadata.sqlite 里的 Mangas → 当前「每库一个 database.sqlite」 ----------
// 背景:老版本把书架行存在 metadata.sqlite 的 Mangas 表里;升级到多库后书架改到每库的 database.sqlite,
// 老表就变成了孤儿数据 —— 表现是「书架空 / 封面和阅读图片全 404」,而标签评分还在
// (因为它们在 Metadata 表里,按 hash 存,和书架行解耦)。
// 迁移按 filepath 前缀把老行分给**各自的库**,只往「空的库数据库」里搬(已有数据的一律不动),
// 老表整体改名为 Mangas_legacy_v1 保留,不删任何数据。
let legacyMigrated = false
const migrateLegacyMangaTable = async () => {
  if (legacyMigrated) return 0
  legacyMigrated = true
  try {
    // 旧表可能还叫 Mangas(没迁移过),也可能已经被上一次迁移改名成 Mangas_legacy_v1 —— 两种都要认,
    // 这样「书架库被重建/搬丢」时还能一键补回来(标签评分在 Metadata 里,永远不丢)。
    const [tbl] = await Metadata.sequelize.query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('Mangas','Mangas_legacy_v1') ORDER BY CASE name WHEN 'Mangas' THEN 0 ELSE 1 END")
    if (!tbl || !tbl.length) return 0
    const legacyTable = tbl[0].name
    console.log(`[legacy] 发现旧书架表:${legacyTable}`)
    const [legacyRows] = await Metadata.sequelize.query(`SELECT * FROM ${legacyTable}`)
    if (!legacyRows || !legacyRows.length) return 0

    // 1) 按 filepath 前缀把老数据分给对应的库(根路径越长越精确)
    const libs = runtimeLibs()
      .map(l => ({ id: l.id, name: l.name, root: String(l.path || '').replace(/[\\/]+$/, '') }))
      .filter(l => l.root)
      .sort((a, b) => b.root.length - a.root.length)
    const groups = new Map()
    for (const r of legacyRows) {
      const fp = String(r.filepath || '')
      const owner = libs.find(l => fp === l.root || fp.startsWith(l.root + '/'))
      const key = owner ? owner.id : '__active__'
      if (!groups.has(key)) groups.set(key, { rows: [], name: owner ? owner.name : '当前库' })
      groups.get(key).rows.push(r)
    }

    let totalInserted = 0
    const detail = []
    for (const [key, group] of groups) {
      let model
      try {
        model = key === '__active__' ? Manga : await modelForLibrary(key)
      } catch (e) {
        console.error(`[legacy] 打不开库 ${key} 的数据库,跳过:`, String((e && e.message) || e))
        continue
      }
      const [countRows] = await model.sequelize.query('SELECT COUNT(*) AS c FROM Mangas')
      const existing = Number((countRows && countRows[0] && countRows[0].c) || 0)
      // 已经有足够多就跳过;少了(上次迁移被打断/部分失败)→ 继续补齐,
      // INSERT OR IGNORE 只会补缺的那些(按 id 去重),不会重复插入也不会覆盖已有行。
      if (existing >= group.rows.length) { detail.push(`${group.name}: 已有 ${existing} 本,不迁移`); continue }

      const [shelfCols] = await model.sequelize.query('PRAGMA table_info(Mangas)')
      const cols = (shelfCols || []).map(r => r.name)
      const usable = cols.filter(c => Object.prototype.hasOwnProperty.call(group.rows[0], c))
      if (!usable.length) { detail.push(`${group.name}: 列不兼容,跳过`); continue }
      const sql = `INSERT OR IGNORE INTO Mangas (${usable.join(',')}) VALUES (${usable.map(() => '?').join(',')})`
      const BATCH = 300
      let done = 0
      for (let i = 0; i < group.rows.length; i += BATCH) {
        const chunk = group.rows.slice(i, i + BATCH)
        const t = await model.sequelize.transaction()
        try {
          for (const r of chunk) {
            const vals = usable.map((c) => {
              const v = r[c]
              if (v === undefined) return null
              if (v !== null && typeof v === 'object') return JSON.stringify(v)
              return v
            })
            await model.sequelize.query(sql, { replacements: vals, transaction: t })
          }
          await t.commit()
          done += chunk.length
        } catch (e) {
          try { await t.rollback() } catch (_) { /* 忽略 */ }
          console.error(`[legacy] ${group.name} 第 ${i / BATCH + 1} 批中断:`, String((e && e.message) || e))
          break
        }
      }
      const [afterRows] = await model.sequelize.query('SELECT COUNT(*) AS c FROM Mangas')
      const afterCount = Number((afterRows && afterRows[0] && afterRows[0].c) || 0)
      if (afterCount > 0) {
        totalInserted += afterCount
        detail.push(`${group.name}: ${group.rows.length} → ${afterCount} 本`)
      } else if (done === 0) {
        detail.push(`${group.name}: 一行都没写进去(列不兼容)`)
      }
    }
    if (totalInserted > 0) {
      if (legacyTable === 'Mangas') {
        try { await Metadata.sequelize.query('ALTER TABLE Mangas RENAME TO Mangas_legacy_v1') } catch (e) { /* 改名失败不影响数据 */ }
      }
      const msg = `[legacy] 旧版书架已迁移:${detail.join(';')}(老表改名为 Mangas_legacy_v1 保留)`
      console.log(msg)
      sendMessageToWebContents(`已迁移旧版书架数据:${detail.join(';')}`)
    } else if (detail.length) {
      console.log(`[legacy] 未迁移:${detail.join(';')}`)
    }
    return totalInserted
  } catch (e) {
    console.error('[legacy] 旧书架迁移失败:', String((e && e.message) || e))
    return 0
  }
}

// 库路径不存在(最常见:容器挂载点和设置里写的路径不一致)→ 明确告诉用户,别默默扫出 0 本
const warnedMissingLibrary = new Set()
const warnMissingLibraryPaths = () => {
  try {
    for (const lib of runtimeLibs()) {
      const p = String(lib.path || '')
      if (!p) continue
      if (fs.existsSync(p)) { warnedMissingLibrary.delete(p); continue }
      if (warnedMissingLibrary.has(p)) continue
      warnedMissingLibrary.add(p)
      const msg = `库「${lib.name}」的路径在容器里不存在:${p} —— 检查 docker 挂载点是否和设置里一致`
      console.error('[library] ' + msg)
      sendMessageToWebContents(msg)
      break
    }
  } catch (e) { /* 忽略 */ }
}

const loadBookListFromDatabase = async () => {
  // 先把旧版书架搬过来(只在书架为空时做一次),再走原来的合并逻辑
  try { await migrateLegacyMangaTable() } catch (e) { /* 迁移失败不影响书架 */ }
  try { warnMissingLibraryPaths() } catch (e) { /* 忽略 */ }
  // 库数据库里的老格式绝对路径先转成相对路径(每个库只做一次;之后新写入的都是相对路径)
  await ensureLibraryPathsNormalized()
  // 多库:当前「切换框」里所有已生效的库各读各的库数据库,合并成一个书架(同一本书不去重)
  const libs = boxLibraries()
  let bookList = []
  if (libs.length) {
    for (const lib of libs) {
      const model = await modelForLibrary(lib.id)
      let rows = []
      try {
        rows = await model.findAll()
      } catch (e) {
        // 单个库读失败(例如数据库正被写)不能把整个书架打崩
        console.error(`读取库「${lib.name}」失败:`, String((e && e.message) || e))
        continue
      }
      for (const row of rows) {
        const b = row.toJSON()
        b.libraryId = lib.id
        b.libraryName = lib.name
        b.filepath = translateBookPath(b.filepath, 'filepath', lib)
        b.coverPath = translateBookPath(b.coverPath, 'coverPath', null, coverDirOf(lib))
        rememberBookLibrary(b)
        bookList.push(b)
      }
    }
  } else {
    // 没有任何已生效的库:不再退回"全局默认库数据库" ——
    // 那会让同一个数据目录里出现一个跟设置无关的库文件(libraries/library/database.sqlite),
    // 扫描/书架各写一处、互相看不见。这里直接给空列表,界面提示去添加漫画库。
    if (!noLibraryNotified) {
      noLibraryNotified = true
      sendMessageToWebContents('还没有可用的漫画库:请在 设置 → 常用 里「添加库」并选好文件夹')
    }
    bookList = []
  }
  if (_.isEmpty(bookList) && boxLibraries().length) {
    // ⚠️ 这里以前会 saveBookListToDatabase(空数组) —— 那是"读到空就清库",
    // 现在整表重建必须显式声明(见 saveBookListToDatabase 的 guard)。
    // 旧版 bookList.json 若确实有内容,才迁移进库(并标记为显式重建,扫描中会被 guard 挡住)。
    const legacy = await loadLegecyBookListFromFile()
    if (!_.isEmpty(legacy)) {
      bookList = legacy
      await saveBookListToDatabase(bookList, { rebuild: true })
    }
  }
  let metadataList = await Metadata.findAll()
  metadataList = metadataList.map(m => m.toJSON())
  // 用 Map 按 hash 索引,替代 O(n²) 的数组 find
  const metadataMap = new Map(metadataList.map(m => [m.hash, m]))
  const bookListLength = bookList.length
  const pendingUpserts = []
  for (let i = 0; i < bookListLength; i++) {
    const book = bookList[i]
    const findMetadata = metadataMap.get(book.hash)
    if (findMetadata) {
      if (book.status === 'non-tag' && findMetadata.status !== 'non-tag') await (await modelForLibrary(book.libraryId)).update(findMetadata, { where: { id: book.id } })
      Object.assign(book, findMetadata)
    } else {
      // 每 50 本才刷新一次进度,减少 IPC 往返
      if ((i + 1) % 50 === 0) setProgressBar((i + 1) / bookListLength)
      // ⚠️ Metadata 表主键是 hash:两阶段扫描里还没探测过的新书 hash 为 null,
      //    写进去会 notNull Violation,让整个书架 500。跳过,等补全补上 hash 再写。
      if (book.hash) pendingUpserts.push(book)
    }
  }
  // 所有缺失元数据分批写入。
  // ⚠️ 两处必须这么写:
  //   ① 分批:元数据库是空的时候(首次建库 / 刚换「元数据存放目录」)会有「书的数量」那么多行要补,
  //      一万多行挤进一个事务,提交时会在 Windows 上直接报 SQLITE_IOERR disk I/O error;
  //   ② 整块容错:元数据只是「书架用的缓存」,写不进去最多是标签/评分晚一点补上,
  //      但绝不能因此让 load-book-list 抛错 —— 那会让整个书架变成 500 打不开
  //      (sequelize 在 commit 失败后还会杀掉连接,后续读写一起废掉)。
  if (pendingUpserts.length) {
    const META_BATCH = 500
    for (let i = 0; i < pendingUpserts.length; i += META_BATCH) {
      const t = await Metadata.sequelize.transaction()
      try {
        for (const book of pendingUpserts.slice(i, i + META_BATCH)) {
          await Metadata.upsert(book, { transaction: t })
        }
        await t.commit()
      } catch (e) {
        try { await t.rollback() } catch (_) { /* 连接可能已被杀,忽略 */ }
        console.error(`[meta] 元数据补写失败(第 ${i / META_BATCH + 1} 批,不影响书架显示):${String((e && e.message) || e)}`)
        break
      }
    }
  }
  setProgressBar(-1)
  return bookList
}

// ⚠️ 整表重建是危险操作:会先 truncate 再写入。
// 只允许「显式重建库」调用(force-gene-book-list),并且扫描进行中一律拒绝 ——
// 以前它被「书架读到空」这条路径顺带调用,等于谁都能把库清空。
const saveBookListToDatabase = async (data, options = {}) => {
  if (!options.rebuild) {
    console.error('[guard] 拒绝整表重建:saveBookListToDatabase 只能由显式「重建库」触发')
    return
  }
  if (isScanning) {
    console.error('[guard] 拒绝整表重建:扫描进行中')
    return
  }
  console.log(`[guard] 显式重建书库:清空后写入 ${Array.isArray(data) ? data.length : 0} 条`)
  await Manga.destroy({ truncate: true })
  await Manga.bulkCreate(data)
}

const saveBookToDatabase = async (book) => {
  // 写共享数据库时路径转换为 Windows 格式,保证桌面版可读
  const extBook = {
    ...book,
    filepath: toExternalPath(book.filepath, 'filepath', libForBook(book)),
    coverPath: toExternalPath(book.coverPath, 'coverPath')
  }
  // 合并书架下每本书自带 libraryId:必须写回它自己所属的库,不然会写脏别的库
  delete extBook.libraryId
  delete extBook.libraryName
  const target = await modelForLibrary(book.libraryId)
  await target.update(extBook, { where: { id: extBook.id } })
  // 元数据始终写全局 metadata.sqlite
  await Metadata.upsert(extBook)
  console.log(`Saved ${extBook.title}`)
}

const setProgressBar = (progress) => {
  if (WEB_MODE) {
    require('./web-electron-shim.js').broadcast('send-action', {
      action: 'send-progress',
      progress
    })
    return
  }
  mainWindow.setProgressBar(progress)
  mainWindow.webContents.send('send-action', {
    action: 'send-progress',
    progress
  })
}

// 扫描"边扫边显示":每批新书入库后通知前端刷新,让扫到多少就显示多少,
// 不需要等整轮扫描完成(扫描与加载互不阻塞;前端会做 900ms 节流合并)
const sendScanBatch = () => {
  const payload = { action: 'scan-batch' }
  if (WEB_MODE) {
    require('./web-electron-shim.js').broadcast('send-action', payload)
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('send-action', payload)
  }
}

const clearFolder = async (Folder) => {
  try {
    await fs.promises.rm(Folder, { recursive: true, force: true })
    await fs.promises.mkdir(Folder, { recursive: true })
  } catch (err) {
    console.log(err)
  }
}


// library and metadata
let isScanning = false
// 扫描并发:可按设备性能在 设置 → 高级 里调(1~16,默认 4)。
// 太高会拖慢 NAS 上的磁盘/CPU,也会影响你同时在阅读时的体验。
// 封面生成并发(设置 → 高级 → 扫描与性能):解压 + sharp 较吃磁盘/CPU,默认 4
const coverConcurrency = () => {
  const n = Number(setting && setting.coverConcurrency)
  if (!Number.isFinite(n) || n < 1) return 4
  return Math.min(16, Math.floor(n))
}
const scanConcurrency = () => {
  const n = Number(setting && setting.scanConcurrency)
  if (!Number.isFinite(n) || n < 1) return 4
  return Math.min(16, Math.floor(n))
}
// 扫描状态:网页版关掉页面后重开也能立刻知道「扫描还在后台跑」(SSE 建连时会补推一次)
const scanState = {
  scanning: false,
  message: '',
  found: 0,
  saved: 0,
  startedAt: 0,
  finishedAt: 0,
  error: ''
}
const broadcastScanStatus = () => {
  const payload = { ...scanState }
  try {
    if (WEB_MODE) require('./web-electron-shim.js').broadcast('scan-status', payload)
    else if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('scan-status', payload)
  } catch (e) { /* 没人听也无所谓 */ }
}
const beginScan = (message) => {
  scanState.scanning = true
  scanState.message = message || '开始加载漫画库'
  scanState.found = 0
  scanState.saved = 0
  scanState.error = ''
  scanState.startedAt = Date.now()
  scanState.finishedAt = 0
  broadcastScanStatus()
}
const endScan = (error) => {
  scanState.scanning = false
  scanState.message = error ? ('扫描失败:' + error) : 'Scan complete'
  scanState.error = error ? String(error) : ''
  scanState.finishedAt = Date.now()
  broadcastScanStatus()
}
let viewerActive = false
let viewerActiveAt = 0
const VIEWER_IDLE_TIMEOUT = 3 * 60 * 1000
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
// 用户正在阅读漫画时,扫描暂停,把 CPU/磁盘让给阅读器
const waitViewerIdle = async () => {
  // 超过 3 分钟没有心跳 = 阅读器已不在(网页被强关),不再无限等待
  while (viewerActive && Date.now() - viewerActiveAt < VIEWER_IDLE_TIMEOUT) await sleep(500)
}

// ---------- 元信息后台补全(页数 / hash) ----------
// 建库阶段只登记「路径 + 指纹」(秒级完成),页数/hash 由这里补:
//   · 只在「没有扫描、且没人在阅读」时跑(waitViewerIdle 会让路);
//   · 并发固定 2,后台任务不抢资源;
//   · 只探测信息,不生成封面(coverName 传 null → 封面仍按需生成)。
// 补完之后这些书才会出现在「按页数排序」里、也才能关联到 metadata 的标签。
const metaBackfill = { running: false, done: 0, total: 0, stop: false }
const broadcastBackfill = () => {
  const payload = { running: metaBackfill.running, done: metaBackfill.done, total: metaBackfill.total }
  try {
    if (WEB_MODE) require('./web-electron-shim.js').broadcast('meta-backfill', payload)
    else if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('meta-backfill', payload)
  } catch (e) { /* 没人听无所谓 */ }
}
ipcMain.handle('scan-status', async () => ({ ...scanState }))
ipcMain.handle('meta-backfill-status', async () => ({ ...metaBackfill }))
// 启动后延迟补全:容器/客户端重启时,把上次没补完的页数/hash/封面接着补上
setTimeout(() => { runMetaBackfill().catch(() => {}) }, 90000)
ipcMain.handle('meta-backfill-stop', async () => {
  metaBackfill.stop = true
  return { ok: true }
})
const runMetaBackfill = async () => {
  if (metaBackfill.running) return { ok: true, already: true }
  metaBackfill.running = true
  metaBackfill.stop = false
  metaBackfill.done = 0
  metaBackfill.total = 0
  broadcastBackfill()
  try {
    const pending = []
    for (const lib of boxLibraries()) {
      const model = await modelForLibrary(lib.id)
      // 只挑还没探测过的书(hash 为空)
      const rows = await model.findAll({ where: { hash: null }, raw: true })
      for (const row of rows) pending.push({ lib, model, row })
    }
    metaBackfill.total = pending.length
    console.log(`[meta] 待补全 ${pending.length} 本`)
    broadcastBackfill()
    // ⚠️ 必须串行:SQLite 是单写者,两路 update 并发会把事务冲掉,
    //    连带"读书架"都会报 Transaction cannot be rolled back。
    //    探测本身不并发,但配合「有人在阅读就等」已经够温和。
    for (const { lib, model, row } of pending) {
      if (metaBackfill.stop) break
      await waitViewerIdle()
      if (isScanning) { metaBackfill.stop = true; break }
      try {
        const filepath = translateBookPath(row.filepath, 'filepath', lib)
        const coverDir = coverDirOf(lib)
        // 用户要求:后台补全时把封面一并生成(以前只探测信息)。
        // 走 ensureBookCover:自带每本一次的任务锁 + 全局 4 路并发限制。
        try {
          await ensureBookCover({ ...row, filepath, libraryId: lib.id })
        } catch (e) { /* 封面失败不影响补页数/hash */ }
        const r = await geneCover(filepath, row.type, null, coverDir)
        await model.update({
          hash: r.hash || null,
          pageCount: r.pageCount || null,
          bundleSize: r.bundleSize,
          mtime: r.mtime ? r.mtime.toJSON() : row.mtime,
          coverHash: r.coverHash || null
        }, { where: { id: row.id } })
      } catch (e) { /* 单本失败跳过,不影响其它 */ }
      metaBackfill.done++
      if (metaBackfill.done % 20 === 0) broadcastBackfill()
    }
  } catch (e) {
    console.log('[meta] 后台补全出错:', String((e && e.message) || e))
  } finally {
    metaBackfill.running = false
    broadcastBackfill()
    console.log(`[meta] 后台补全结束:${metaBackfill.done}/${metaBackfill.total}`)
  }
  return { ok: true, done: metaBackfill.done, total: metaBackfill.total }
}


// ---------- AI 批量任务暂停控制 ----------
let aiTaskPaused = false
const waitIfAiPaused = async () => {
  while (aiTaskPaused) await sleep(300)
}
ipcMain.handle('set-ai-task-paused', (event, paused) => {
  aiTaskPaused = !!paused
  sendMessageToWebContents(aiTaskPaused ? 'AI任务已暂停' : 'AI任务已继续')
})

// AI 综合信息写入元数据:标题翻译 + 角色 + 出处 + 作者 + 类型
const mergeBookInfo = (book, info) => {
  const changes = []
  if (info.titleCn && info.titleCn !== (book.title_jpn || book.title)) {
    book.title_cn = info.titleCn
    changes.push('标题')
  }
  if (!book.tags) book.tags = {}
  const mergeTags = (key, list) => {
    if (!Array.isArray(list)) return 0
    if (!Array.isArray(book.tags[key])) book.tags[key] = []
    let n = 0
    for (const v of list) {
      if (v && !book.tags[key].includes(v)) {
        book.tags[key].push(v)
        n++
      }
    }
    return n
  }
  const cn = mergeTags('character', info.characters)
  const pn = mergeTags('parody', info.parodies)
  const an = mergeTags('artist', info.artists)
  if (cn) changes.push(`角色${cn}`)
  if (pn) changes.push(`出处${pn}`)
  if (an) changes.push(`作者${an}`)
  if (info.category && book.category !== info.category) {
    book.category = info.category
    changes.push('类型')
  }
  return changes
}

ipcMain.handle('set-viewer-active', (event, active) => {
  viewerActive = !!active
  // 记录最后一次上报时间:浏览器被强关/断网时前端来不及发 false,
  // viewerActive 会永远停在 true,让扫描/补全/封面任务全部卡在 waitViewerIdle。
  // 前端阅读时每 60 秒心跳一次,超过 3 分钟没上报就视为不活跃。
  viewerActiveAt = Date.now()
})

// 自动排除规则:这些是「软件自己的数据」,绝不能被当成漫画扫描进来
// (设置 → 高级 → 排除文件 下方会用灰字列出来,让用户知道它们始终生效)
const AUTO_EXCLUDE_PATTERNS = [
  // 库自身产生的目录/文件:绝不能被当成漫画扫描进来
  '(.trash)', 'viewcache', 'cover', 'viewer', 'libraries', 'models', 'tmp',
  '(database.sqlite)', '(metadata.sqlite)', '(setting.json)', '(scan-snapshot.json)', '(delete-log.jsonl)', '(.deleted-)',
  // 系统/网盘常见的缩略图与回收站目录
  '(@eaDir)', '(#recycle)', '(\\$RECYCLE.BIN)', '(System Volume Information)', '(Thumbs.db)', '(.DS_Store)',
]
// 正则元字符转义:数据目录路径里可能有 \\ ( ) 等字符
const escapeRegExp = (str) => String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// 目录路径 → 排除正则:只匹配这个目录本身和它下面的东西,
// 不误伤名字只是前缀相同的兄弟目录(例如「数据存放」vs「数据存放2」)
const dirExcludePattern = (dir) => escapeRegExp(String(dir || '').replace(/[\\/]+$/, '')) + '(?:[\\\\/]|$)'
// p 是否是 root 本身或 root 下面的路径(都用绝对路径比较)
const isSameOrUnder = (p, root) => {
  if (!p || !root) return false
  try {
    const P = path.resolve(p).toLowerCase()
    const R = path.resolve(root).toLowerCase()
    return P === R || P.startsWith(R.endsWith(path.sep) ? R : R + path.sep)
  } catch (e) { return false }
}
// 编译排除规则正则:用户规则 + 自动规则(任一命中即排除)
const compileExclude = () => {
  const user = _.isEmpty(setting.excludeFile) ? '' : String(setting.excludeFile)
  // 数据目录本身必须排除:漫画库常常把数据目录放在自己内部(例如 /library/S/数据存放),
  // 里面的 cover / viewer / tmp / models / 数据库 全都不该出现在书架里。
  // 书路径的相对基准永远是「库文件夹」,所以「数据存放目录」和每个库自己的
  // 「库数据存放位置」都要整体排除 —— 否则从数据目录里扫出来的书会带着一条
  // 相对库文件夹、却指向数据目录的路径进书架。
  const libRoots = runtimeLibs().map(l => localLibraryPath(l, IS_WEB_ENV)).filter(Boolean)
  const dataDirs = [STORE_PATH, ...runtimeLibs().map(l => libraryDataDir(STORE_PATH, l, IS_WEB_ENV))]
    // 数据目录是库文件夹本身/上层时不能排除(否则整个库都扫不到)
    .filter(d => d && !libRoots.some(r => isSameOrUnder(r, d)))
  const base = dataDirs.map(dirExcludePattern).concat(AUTO_EXCLUDE_PATTERNS)
  const all = (user ? [user] : []).concat(base)
  const buildRe = (arr) => new RegExp('(' + arr.join(')|(') + ')')
  try {
    return buildRe(all)
  } catch (e) {
    // 用户规则写坏了:仍然保留数据目录与自动规则 —— 它们不能因为一条坏正则就失效
    try { return buildRe(base) } catch (e2) { return null }
  }
}

// 共享:处理一本"枚举结果"漫画的 DB 比对(全量扫描与增量扫描共用)
// 命中数据库 → 标记 exist;路径未命中但找到"搬家" → 更新 filepath 沿用封面;
// 全新 → geneCover 探测并推入 batchNewBooks(由调用方批量入库)
// 封面懒加载为固定行为:扫描只探测信息不生成封面(geneCover 传 null),
// 封面由用户浏览时按需生成(见 ensureBookCover),不再提供切换开关
// fp = inventoryLibrary 顺手拿到的指纹 { m: mtimeMs, s?: size } —— 免费,不用再 stat/dirSize
const processScanItem = async (ctx, filepath, type, fp) => {
  // ★ 全程只用 ctx 里的模型与封面目录(哪本书属于哪个库就写哪个库)。
  const { bookMap, bookIdMap, batchNewBooks, skipRelocateLookup } = ctx
  const Db = ctx.model || Manga
  const scanCtx = {
    coverDir: ctx.coverDir || CURRENT_COVER_DIR,
    snapshotFile: ctx.snapshotFile || SNAPSHOT_FILE,
    viewcacheDir: ctx.viewcacheDir || LIBRARY_VIEWCACHE_DIR
  }
  const foundData = bookMap.get(filepath)
  if (foundData === undefined) {
    /*
    * check whether the file is the relocated only
    * return the existing data if and only if there is one match
    * */
    // 首次建库(库里一条记录都没有)不可能存在"搬家的老书" → 直接跳过这趟全表查询
    const existingManga = skipRelocateLookup ? null : await findSameFile(filepath, type, Db, fp)
    if (existingManga) {
      // the file is relocated only, so no need to regenerate the cover
      const foundPrevBook = bookIdMap.get(existingManga.id)
      if (foundPrevBook) {
        // this is necessary otherwise it will be deleted in the next step
        foundPrevBook.exist = true
        // update the Mangas table in database.sqlite(路径写 Windows 格式)
        // 懒加载模式下旧封面可能为空:保留空,由用户使用时按需生成
        const newCoverPath = foundPrevBook.coverPath
          ? path.join(scanCtx.coverDir, path.basename(foundPrevBook.coverPath))
          : null
        foundPrevBook.coverPath = newCoverPath
        await Db.update(
          {
            filepath: toExternalPath(filepath, 'filepath', ctx.lib),
            coverPath: newCoverPath ? toExternalPath(newCoverPath, 'coverPath') : null
          },
          { where: { id: existingManga.id } }
        )
      }
    } else {
      // 新书:轻量入库 —— 只用遍历时拿到的指纹,不打开文件。
      // 页数 / hash / 封面 由「浏览到时」或「空闲后台补全」再补上
      // (以前这里每次都 geneCover:压缩包要调 7z 解压出封面、还要 sha1 读整图,
      //  14343 本就要跑很久;现在建库阶段只登记路径与指纹)。
      const id = nanoid()
      batchNewBooks.push({
        title: path.basename(filepath),
        coverPath: null,
        hash: null,
        filepath,
        type,
        id,
        pageCount: null,
        bundleSize: (fp && fp.s !== undefined) ? fp.s : null,
        mtime: new Date((fp && fp.m) || Date.now()).toJSON(),
        coverHash: null,
        status: 'non-tag',
        exist: true,
        date: Date.now()
      })
    }
  } else {
    foundData.exist = true
    if (isPortable) {
      const newCoverPath = foundData.coverPath
        ? path.join(scanCtx.coverDir, path.basename(foundData.coverPath))
        : null
      if (foundData.coverPath !== newCoverPath) {
        foundData.coverPath = newCoverPath
        await Db.update({ coverPath: newCoverPath ? toExternalPath(newCoverPath, 'coverPath') : null }, { where: { id: foundData.id } })
      }
    }
  }
}

const runScan = async (ctx) => {
  // ★ ctx 由 runScanAll 显式传入(哪个库、哪个模型、哪个根目录/封面目录/快照文件),
  //   全程不再读全局 Manga / CURRENT_COVER_DIR / SNAPSHOT_FILE。
  //   事故复盘:这些全局量会在「几万文件的 await」期间被别的入口改掉,
  //   结果就是「枚举 A 库、写进 B 库、清 C 库封面」。ctx 把它们钉死在本次扫描上。
  const scanLib = ctx ? ctx.lib : currentLibrary()
  const Db = ctx ? ctx.model : Manga
  // 没有 ctx(单库/旧的单次扫描)时,用当前运行时值兜底
  const scanCtx = {
    coverDir: ctx ? ctx.coverDir : CURRENT_COVER_DIR,
    snapshotFile: ctx ? ctx.snapshotFile : SNAPSHOT_FILE,
    viewcacheDir: ctx ? ctx.viewcacheDir : LIBRARY_VIEWCACHE_DIR
  }
  // 库里老格式的绝对路径先规范化成相对路径,否则下面按「本端绝对路径」索引会对不上
  await ensureLibraryPathsNormalized()
  const bookList = await Db.findAll({ raw: true })
  bookList.forEach(b => {
    b.filepath = translateBookPath(b.filepath, 'filepath', scanLib)
    b.coverPath = translateBookPath(b.coverPath, 'coverPath')
    b.exist = false
  })
  // 用 Map 按 filepath / id 索引,替代 O(n²) 的数组 find
  const bookMap = new Map(bookList.map(b => [b.filepath, b]))
  const bookIdMap = new Map(bookList.map(b => [b.id, b]))
  // 库里一条记录都没有 = 首次建库:不可能有"搬家的老书",省掉每本一次的全表查询
  const skipRelocateLookup = bookMap.size === 0

  // 枚举阶段先给一点进度,避免界面长时间无反馈
  setProgressBar(0.02)
  // 统一单次遍历:等价于原「文件夹并发BFS + rar/7z glob + zip glob」三次遍历,
  // 同时产出目录/压缩包指纹,供增量扫描快照使用
  const excludeRe = compileExclude()
  // ⚠ 用本次扫描的库对象,不要读全局 setting.library ——
  //   多库依次扫描时,全局值可能已被别的库改掉,导致「扫的是 A 库、快照写的是 B 库、
  //   清理封面却清的是当前 scanCtx.coverDir」,书单和封面目录对不上 → 整目录被当孤儿删掉。
  const scanRoot = String(scanLib.path || setting.library || '')
  const inv = await inventoryLibrary(scanRoot, { excludeRe })
  let list = inv.books
  const listLength = list.length
  if (listLength === 0) {
    // 0 本 = 路径不对 / 没挂载 / 里面确实没有可识别的书,直接把看到的目录内容告诉用户
    const root = scanRoot
    let sample = ''
    try {
      const names = fs.readdirSync(root).slice(0, 8)
      sample = names.length ? `(里面前几个:${names.join('、')})` : '(目录是空的)'
    } catch (e) { sample = '(这个目录读不了:可能没挂载或没有权限)' }
    sendMessageToWebContents(`漫画库「${root}」里没找到任何漫画/小说 ${sample} —— 支持:含图片的文件夹、zip/cbz/rar/7z、epub、txt`)
    // 一本书都没扫到 = 这次扫描没有任何可信结果:直接收工。
    // 以前会继续往下走,bookList 为 0 时连「存活率 <30%」那道保护都绕过,
    // 接着清理孤儿封面时"现有封面集合"是空的 → 把当前库的封面目录清空。
    setProgressBar(-1)
    sendMessageToWebContents('Scan complete')
    return
  } else {
    sendMessageToWebContents(`从漫画库找到 ${listLength} 本漫画`)
  }

  const CONCURRENCY = scanConcurrency()
  const BATCH_SIZE = 200
  setProgressBar(0.05)
  // 分批并发处理,批次间清理 TEMP_PATH(替代原来每 50 本就递归删除一次)
  for (let start = 0; start < listLength; start += BATCH_SIZE) {
    // 用户在阅读漫画时暂停扫描,让出 CPU/磁盘
    await waitViewerIdle()
    const end = Math.min(start + BATCH_SIZE, listLength)
    const chunk = list.slice(start, end)
    const batchNewBooks = []
    await runConcurrent(chunk, CONCURRENCY, async ({ filepath, type }, chunkIndex) => {
      const i = start + chunkIndex
      // 用户在阅读时暂停任务,让出 CPU/磁盘
      await waitViewerIdle()
      try {
        await processScanItem({ bookMap, bookIdMap, batchNewBooks, skipRelocateLookup, lib: scanLib }, filepath, type, inv.dirs[filepath] || inv.arch[filepath])
      } catch (e) {
        sendMessageToWebContents(`加载 ${filepath} 失败:${e}(${i + 1}/${listLength})`)
      }
    })
    // 批量入库:一个事务写入一批,避免逐条 fsync(路径写入 Windows 格式)
    if (batchNewBooks.length) {
      // ★ 最后一道防线:入库前确认每本书的绝对路径**真的落在本次扫描的库根下**。
      //   事故复盘:一旦「枚举的是 A 库、写入时模型/库上下文是 B 库」,就会把 A 库的
      //   书压成相对 B 库根的路径写进 B 库(小说库里那 1.4 万条 "S/作者/作品" 就是)。
      //   这里做零 I/O 的归属校验:不属于本库的直接剔除并记日志,绝不写进去。
      const rootForCheck = String(scanLib.path || '').replace(/[\/]+$/, '')
      const owned = []
      const rejected = []
      for (const b of batchNewBooks) {
        const abs = String(b.filepath || '')
        const inRoot = rootForCheck && (abs === rootForCheck || abs.startsWith(rootForCheck + '/') || abs.startsWith(rootForCheck + '\\'))
        if (inRoot) owned.push(b)
        else rejected.push(abs)
      }
      if (rejected.length) {
        console.error(`[scan-guard] 剔除 ${rejected.length} 本不属于本库「${rootForCheck}」的记录:`, rejected.slice(0, 3).join(' | '))
        sendMessageToWebContents(`已跳过 ${rejected.length} 本不属于当前库「${scanLib.name || rootForCheck}」的书(路径不符,已阻止写入)`)
      }
      if (owned.length) {
        await Db.bulkCreate(owned.map(b => ({
          ...b,
          filepath: toExternalPath(b.filepath, 'filepath', scanLib),
          coverPath: toExternalPath(b.coverPath, 'coverPath')
        })))
      }
      for (const newBook of batchNewBooks) {
        bookMap.set(newBook.filepath, newBook)
        bookList.push(newBook)
      }
    }
    // 边扫边显示:本批已入库,通知前端先刷新出这批
    if (batchNewBooks.length) sendScanBatch()
    if (end < listLength) await clearFolder(TEMP_PATH)
    setProgressBar(end / listLength)
  }
  await clearFolder(TEMP_PATH)

  const existData = bookList.filter(b => b.exist === true)
  const removeData = bookList.filter(b => b.exist === false)
  // 安全防护:若枚举结果异常(例如 NAS/网络盘掉线导致几乎找不到书),
  // 跳过清理,避免把整个数据库和封面误删
  if (bookList.length > 0 && existData.length / bookList.length < 0.3) {
    sendMessageToWebContents(`扫描结果异常:仅找到 ${existData.length}/${bookList.length} 本漫画,已跳过清理,请检查漫画库是否可访问`)
    setProgressBar(-1)
    sendMessageToWebContents('Scan complete')
    return
  }
  // ⚠ 顺序很重要:必须先删数据库记录,再删封面文件。
  //   以前先删封面、后删记录,而删记录用的是一条 `IN (上万 id)`,SQLite 变量数超限会抛错,
  //   错误被 catch 吞掉 → 书还在、封面已经没了(用户遇到的"封面全没、书全在")。
  if (removeData.length) {
    try {
      const removeIds = removeData.map(b => b.id)
      const removeHashes = removeData.map(b => b.hash).filter(Boolean)
      for (let i = 0; i < removeIds.length; i += 400) {
        await Db.destroy({ where: { id: { [Op.in]: removeIds.slice(i, i + 400) } } })
      }
      for (let i = 0; i < removeHashes.length; i += 400) {
        await Metadata.destroy({ where: { hash: { [Op.in]: removeHashes.slice(i, i + 400) } } })
      }
      sendMessageToWebContents(`清理了 ${removeData.length} 本不存在的漫画`)
    } catch (e) {
      console.error(e)
      sendMessageToWebContents(`清理不存在的漫画失败:${e}`)
    }
  }
  try {
    // 清理孤儿封面。封面文件都存放在 scanCtx.coverDir,而数据库里的 coverPath 可能是
    // Windows 盘符 / UNC / Linux(/data/...) 任意一种格式 —— 统一取「文件名」再比较。
    // ⚠ 必须自己按 / 和 \\ 切:Linux 的 path.basename() 不认反斜杠,
    //   以前直接用 path.basename('D:\\cover\\x.webp') 会得到整串,匹配不上 →
    //   把整目录的封面全当孤儿删掉(用户反馈的「全库扫描后封面全丢」就是这个)。
    const baseNameOf = (p0) => String(p0 || '').replace(/[\\/]+$/, '').replace(/\\/g, '/').split('/').pop()
    const coverList = await fs.promises.readdir(scanCtx.coverDir)
    const existCoverSet = new Set(existData.map(b => baseNameOf(b.coverPath)).filter(Boolean))
    // 安全阀:一条都没匹配上,或要删掉一大半 —— 一律不删,只提示。
    // 宁可留几个孤儿文件,也不能再把用户封面清空。
    if (!existCoverSet.size) {
      sendMessageToWebContents('封面清理已跳过:数据库里没有可匹配的封面路径(不会删除任何封面)')
    } else {
      const removeCoverList = coverList
        .map(p0 => path.join(scanCtx.coverDir, p0))
        .filter(p0 => !existCoverSet.has(path.basename(p0)))
      if (coverList.length > 20 && removeCoverList.length > coverList.length * 0.5) {
        sendMessageToWebContents(`封面清理已跳过:本次要删 ${removeCoverList.length}/${coverList.length} 个封面,比例异常`)
      } else {
        for (const coverPath of removeCoverList) {
          await fs.promises.rm(coverPath)
        }
      }
    }
  } catch (err) {
    console.log(err)
  }
  // 全量扫描成功收尾:保存目录指纹快照,供增量扫描使用
  try {
    await saveSnapshotFile(scanCtx.snapshotFile, snapshotFromInventory(scanRoot, setting.excludeFile || '', inv))
  } catch (e) {
    console.log('save scan snapshot failed', e)
  }
  setProgressBar(-1)
  sendMessageToWebContents('Scan complete')
}

// 依次扫描「当前切换框」里的每个库(用户要求:扫描按钮改成依次扫每个库)
const runScanAll = async () => {
  const libs = boxLibraries()
  if (!libs.length) {
    sendMessageToWebContents('没有已生效的漫画库:请先在 设置 → 常用 给库填「库数据存放位置」')
    setProgressBar(-1)
    sendMessageToWebContents('Scan complete')
    return
  }
  for (let i = 0; i < libs.length; i++) {
    const lib = libs[i]
    sendMessageToWebContents(`[${i + 1}/${libs.length}] 开始扫描库「${lib.name}」:${lib.path}`)
    // ★ 先建 ctx(把这个库的模型/根目录/数据目录绑死),再用 ctx 扫描。
    //   以前是「切运行时 → runScan() 里读全局」:扫描中途全局被改动就会
    //   「路径按 A 库算、数据写进 B 库」。ctx 让这一层不再依赖全局状态。
    let ctx = null
    try {
      ctx = await scanContextFor(lib)
    } catch (e) {
      sendMessageToWebContents(`跳过库「${lib.name}」:${String((e && e.message) || e)}`)
      continue
    }
    await openLibraryForScan(lib)
    await runScan(ctx)
  }
  // 扫完还原到当前活动库(路径/数据库模型)
  const active = activeLibraryOf(setting)
  if (active) await openLibraryForScan(active)
  setting.library = active ? active.path : setting.library
}

ipcMain.handle('load-book-list', async (event, scan) => {
  if (scan) {
    if (isScanning) {
      sendMessageToWebContents('扫描正在进行中,已跳过重复扫描')
    } else {
      isScanning = true
      beginScan('开始加载漫画库')
      sendMessageToWebContents('开始加载漫画库')
      // 后台扫描:立即返回当前列表,不阻塞 UI,扫描完成后再通知前端刷新
      setImmediate(async () => {
        try {
          await runScanAll()
          endScan(null)
        } catch (e) {
          console.error(e)
          sendMessageToWebContents(`扫描失败:${e}`)
          endScan(e)
        } finally {
          isScanning = false
          setProgressBar(-1)
          // 扫描(建库/刷新)完成后:空闲时把还没探测过的书的页数/hash 补上
          setImmediate(() => { runMetaBackfill().catch(() => {}) })
        }
      })
    }
  }
  return await loadBookListFromDatabase()
})

// ---------- 增量扫描(快照式增量对账) ----------
// 与全量扫描不同:依赖上次扫描保存的目录指纹快照(scan-snapshot.json),
// 只对"目录 mtime 变化"的子树 readdir 下钻,其余目录仅做 stat,秒级完成。
// 无有效快照 / 库路径或排除规则变化时自动退化为全量扫描(全量会重建快照)。
const runIncrementalScan = async () => {
  const oldSnap = await loadSnapshotFile(SNAPSHOT_FILE)
  const excludeStr = setting.excludeFile || ''
  const libStat = await fs.promises.stat(setting.library).catch(() => null)
  if (!libStat || !libStat.isDirectory()) {
    sendMessageToWebContents('扫描结果异常:漫画库目录不可访问,请检查挂载')
    setProgressBar(-1)
    sendMessageToWebContents('Scan complete')
    return
  }
  if (!oldSnap || oldSnap.library !== setting.library || (oldSnap.excludeFile || '') !== excludeStr) {
    sendMessageToWebContents('增量扫描:无有效快照(库路径或排除规则变化),转为全量扫描')
    await runScan()
    return
  }
  setProgressBar(0.02)
  const excludeRe = compileExclude()
  const diff = await diffInventory(setting.library, oldSnap, { excludeRe })
  // 读取数据库并建立索引(与全量扫描相同的路径翻译;内存 Map 成本远低于枚举成本)
  await ensureLibraryPathsNormalized()
  const scanLib = currentLibrary()
  const bookList = await Manga.findAll({ raw: true })
  bookList.forEach(b => {
    b.filepath = translateBookPath(b.filepath, 'filepath', scanLib)
    b.coverPath = translateBookPath(b.coverPath, 'coverPath')
    b.exist = false
  })
  const bookMap = new Map(bookList.map(b => [b.filepath, b]))
  const bookIdMap = new Map(bookList.map(b => [b.id, b]))
  const skipRelocateLookup = bookMap.size === 0
  // 候选 = 目录变化发现的新书 + 快照有记录但数据库缺失的书(补上次探测失败的书)
  const candidates = [...diff.newBooks]
  const seenCand = new Set(candidates.map(c => c.filepath))
  for (const p of Object.keys(diff.nextSnap.arch)) {
    if (seenCand.has(p) || bookMap.has(p)) continue
    const t = archiveTypeOf(p)
    if (t && !(excludeRe && excludeRe.test(p))) {
      seenCand.add(p)
      candidates.push({ filepath: p, type: t })
    }
  }
  for (const p of Object.keys(diff.nextSnap.dirs)) {
    if (seenCand.has(p) || bookMap.has(p) || !diff.nextSnap.dirs[p].img) continue
    if (!(excludeRe && excludeRe.test(p))) {
      seenCand.add(p)
      candidates.push({ filepath: p, type: 'folder' })
    }
  }
  sendMessageToWebContents(`从漫画库找到 ${candidates.length} 本待处理漫画(增量扫描)`)
  // 安全阀:大比例目录消失 → 判定漫画库掉线,跳过清理并保留原快照
  if (diff.totalDirsCount > 50 && diff.removedDirsCount / diff.totalDirsCount > 0.8) {
    sendMessageToWebContents('扫描结果异常:检测到大量目录消失,可能漫画库不可访问,已跳过清理')
    setProgressBar(-1)
    sendMessageToWebContents('Scan complete')
    return
  }
  const CONCURRENCY = scanConcurrency()
  const BATCH_SIZE = 200
  setProgressBar(0.1)
  for (let start = 0; start < candidates.length; start += BATCH_SIZE) {
    // 用户在阅读漫画时暂停扫描,让出 CPU/磁盘
    await waitViewerIdle()
    const end = Math.min(start + BATCH_SIZE, candidates.length)
    const chunk = candidates.slice(start, end)
    const batchNewBooks = []
    await runConcurrent(chunk, CONCURRENCY, async ({ filepath, type }, chunkIndex) => {
      const i = start + chunkIndex
      await waitViewerIdle()
      try {
        await processScanItem({ bookMap, bookIdMap, batchNewBooks, lib: scanLib }, filepath, type)
      } catch (e) {
        sendMessageToWebContents(`加载 ${filepath} 失败:${e}(${i + 1}/${candidates.length})`)
      }
    })
    // 批量入库:一个事务写入一批,避免逐条 fsync(路径写入 Windows 格式)
    if (batchNewBooks.length) {
      await Manga.bulkCreate(batchNewBooks.map(b => ({
        ...b,
        filepath: toExternalPath(b.filepath, 'filepath', scanLib),
        coverPath: toExternalPath(b.coverPath, 'coverPath')
      })))
      for (const newBook of batchNewBooks) {
        bookMap.set(newBook.filepath, newBook)
        bookList.push(newBook)
      }
    }
    // 边扫边显示:本批已入库,通知前端先刷新出这批
    if (batchNewBooks.length) sendScanBatch()
    if (end < candidates.length) await clearFolder(TEMP_PATH)
    setProgressBar(0.1 + 0.7 * (end / Math.max(1, candidates.length)))
  }
  await clearFolder(TEMP_PATH)
  // 清理增量发现的消失书目(封面文件 / 数据库记录 / 关联元数据)
  const removedRows = []
  const seenRemove = new Set()
  for (const rb of diff.removedBooks) {
    if (seenRemove.has(rb.filepath)) continue
    seenRemove.add(rb.filepath)
    const row = bookMap.get(rb.filepath)
    if (row) removedRows.push(row)
  }
  if (removedRows.length) {
    let deleted = false
    try {
      // 先删记录(分批),确认成功后再删封面文件 —— 反过来就会出现"记录还在、封面没了"
      const removeIds = removedRows.map(b => b.id)
      const removeHashes = removedRows.map(b => b.hash).filter(Boolean)
      for (let i = 0; i < removeIds.length; i += 400) {
        await Manga.destroy({ where: { id: { [Op.in]: removeIds.slice(i, i + 400) } } })
      }
      for (let i = 0; i < removeHashes.length; i += 400) {
        await Metadata.destroy({ where: { hash: { [Op.in]: removeHashes.slice(i, i + 400) } } })
      }
      deleted = true
      sendMessageToWebContents(`清理了 ${removedRows.length} 本不存在的漫画`)
    } catch (e) {
      console.error(e)
      sendMessageToWebContents(`清理不存在的漫画失败:${e}`)
    }
    if (deleted) {
      for (const row of removedRows) {
        if (!row.coverPath) continue
        const coverFile = path.join(CURRENT_COVER_DIR, path.basename(String(row.coverPath)))
        await fs.promises.rm(coverFile, { force: true }).catch(() => {})
      }
    }
  }
  // 无变化时不重写快照(避免每轮都全量写 1MB+ 的 scan-snapshot.json)
  if (candidates.length || diff.removedBooks.length) {
    try {
      await saveSnapshotFile(SNAPSHOT_FILE, diff.nextSnap)
    } catch (e) {
      console.log('save scan snapshot failed', e)
    }
  }
  setProgressBar(-1)
  sendMessageToWebContents('Scan complete')
}

ipcMain.handle('incremental-scan', async () => {
  if (isScanning) {
    sendMessageToWebContents('扫描正在进行中,已跳过重复扫描')
  } else {
    isScanning = true
    beginScan('开始增量扫描')
    sendMessageToWebContents('开始加载漫画库')
    // 后台执行:立即返回当前列表,不阻塞 UI,完成后通知前端刷新
    setImmediate(async () => {
      try {
        await runIncrementalScan()
      // 增量扫描完成后同样要触发后台补全(以前只有全量扫描才触发,导致增量扫完的书一直没补) 
      setImmediate(() => { runMetaBackfill().catch(() => {}) })
        endScan(null)
      } catch (e) {
        console.error(e)
        sendMessageToWebContents(`扫描失败:${e}`)
        endScan(e)
      } finally {
        isScanning = false
        setProgressBar(-1)
      }
    })
  }
  return await loadBookListFromDatabase()
})

ipcMain.handle('force-gene-book-list', async (event, arg) => {
  // 重建库会清空数据库与封面目录,扫描进行中绝不能执行
  if (isScanning) {
    sendMessageToWebContents('正在扫描漫画库,请等扫描结束后再重建')
    return await loadBookListFromDatabase()
  }
  // 封面懒加载为固定行为:重建库也不生成封面,由用户浏览时按需生成
  await Manga.destroy({ truncate: true })
  await clearFolder(TEMP_PATH)
  await clearFolder(CURRENT_COVER_DIR)
  sendMessageToWebContents('开始加载漫画库')
  setProgressBar(0.02)
  let list = await getBookFilelist(setting.library)
  if (!_.isEmpty(setting.excludeFile)) {
    let excludeRe
    try {
      excludeRe = compileExclude()
      list = _.filter(list, file => !excludeRe.test(file.filepath))
    } catch {
      console.log('Illegal regular expressions')
    }
  }
  const listLength = list.length
  sendMessageToWebContents(`从漫画库找到 ${listLength} 本漫画`)
  const CONCURRENCY = scanConcurrency()
  const BATCH_SIZE = 200
  setProgressBar(0.05)
  for (let start = 0; start < listLength; start += BATCH_SIZE) {
    // 用户在阅读漫画时暂停扫描,让出 CPU/磁盘
    await waitViewerIdle()
    const end = Math.min(start + BATCH_SIZE, listLength)
    const chunk = list.slice(start, end)
    const batchNewBooks = []
    await runConcurrent(chunk, CONCURRENCY, async ({ filepath, type }, chunkIndex) => {
      const i = start + chunkIndex
      // 用户在阅读时暂停任务,让出 CPU/磁盘
      await waitViewerIdle()
      try {
        const id = nanoid()
        const { targetFilePath, hash, coverPath, pageCount, bundleSize, mtime, coverHash } = await geneCover(filepath, type, null, CURRENT_COVER_DIR)
        // 懒加载模式下 coverPath 为 null(封面按需生成),书仍然入库
        if (targetFilePath) {
          batchNewBooks.push({
            title: path.basename(filepath),
            coverPath,
            hash,
            filepath,
            type,
            id,
            pageCount,
            bundleSize,
            mtime: mtime.toJSON(),
            coverHash,
            status: 'non-tag',
            date: Date.now()
          })
        }
      } catch (e) {
        sendMessageToWebContents(`加载 ${filepath} 失败:${e}(${i + 1}/${listLength})`)
      }
    })
    // 批量入库:一个事务写入一批(路径写入相对库根的相对路径)
    if (batchNewBooks.length) await Manga.bulkCreate(batchNewBooks.map(b => ({
      ...b,
      filepath: toExternalPath(b.filepath, 'filepath', currentLibrary()),
      coverPath: toExternalPath(b.coverPath, 'coverPath')
    })))
    if (end < listLength) await clearFolder(TEMP_PATH)
    setProgressBar(end / listLength)
  }
  await clearFolder(TEMP_PATH)

  setProgressBar(-1)
  return await loadBookListFromDatabase()
})

ipcMain.handle('patch-local-metadata', async (event, arg) => {
  const bookList = await loadBookListFromDatabase()
  const bookListLength = bookList.length
  await clearFolder(TEMP_PATH)
  // ⚠ 这里以前是 `clearFolder(CURRENT_COVER_DIR)`:先清空整个封面目录再逐本重建。
  //   一万多本重建很慢,中途退出/出错 = 全部封面消失(用户遇到的正是这个)。
  //   修补元数据不应该销毁已有封面:现在只重建缺失的,已有的一律保留。

  const CONCURRENCY = scanConcurrency()
  const BATCH_SIZE = 200
  setProgressBar(0.05)
  for (let start = 0; start < bookListLength; start += BATCH_SIZE) {
    // 用户在阅读漫画时暂停扫描,让出 CPU/磁盘
    await waitViewerIdle()
    const end = Math.min(start + BATCH_SIZE, bookListLength)
    const chunk = bookList.slice(start, end)
    await runConcurrent(chunk, CONCURRENCY, async (book, chunkIndex) => {
      const i = start + chunkIndex
      // 用户在阅读时暂停任务,让出 CPU/磁盘
      await waitViewerIdle()
      try {
        // 已经有可用封面 → 跳过(只补缺失的,不再重复生成)
        const had = book.coverPath ? translateBookPath(book.coverPath, 'coverPath', null, bookCoverDir(book)) : ''
        if (had && isUsableCover(had)) return
        let { filepath, type } = book
        if (!type) type = 'archive'
        // 封面以漫画名命名(占位防并发)
        const coverName = acquireCoverName(filepath)
        try {
          const { targetFilePath, hash, coverPath, pageCount, bundleSize, mtime, coverHash } = await geneCover(filepath, type, coverName, CURRENT_COVER_DIR)
          if (targetFilePath && coverPath) {
            _.assign(book, { type, coverPath, hash, pageCount, bundleSize, mtime: mtime.toJSON(), coverHash })
            await saveBookToDatabase(book)
          } else {
            releaseCoverName(coverName)
          }
        } catch (e) {
          releaseCoverName(coverName)
          throw e
        }
      } catch (e) {
        sendMessageToWebContents(`补全 ${bookList[i].filepath} 失败:${e}`)
      }
    })
    if (end < bookListLength) await clearFolder(TEMP_PATH)
    setProgressBar(end / bookListLength)
  }

  await clearFolder(TEMP_PATH)
  setProgressBar(-1)
  return bookList
})

ipcMain.handle('patch-local-metadata-by-book', async (event, book) => {
  let { filepath, type } = book
  if (!type) type = 'archive'
  // 封面以漫画名命名(占位防并发)
  const coverName = acquireCoverName(filepath)
  try {
    const { targetFilePath, hash, coverPath, pageCount, bundleSize, mtime, coverHash } = await geneCover(filepath, type, coverName, CURRENT_COVER_DIR)
    if (targetFilePath && coverPath) {
      await clearFolder(TEMP_PATH)
      return Promise.resolve({ coverPath, hash, pageCount, bundleSize, mtime: mtime.toJSON(), coverHash })
    }
    releaseCoverName(coverName)
  } catch (e) {
    releaseCoverName(coverName)
    sendMessageToWebContents(`补全 ${book.filepath} 失败:${e}`)
    await clearFolder(TEMP_PATH)
    return Promise.reject()
  }
})

// Function to read the .ehviewer file
function getEhviewerDataManually(dir) {
  try {
    const filePath = path.join(dir, '.ehviewer')
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8')
      const lines = fileContent.split('\n')
      if (lines.length >= 4) {
        const gid = lines[2].trim()
        const token = lines[3].trim()
        return { gid, token }
      }
    }
    return null
  } catch (error) {
    console.error('Failed to read .ehviewer file:', error)
    return null
  }
}

ipcMain.handle('get-ehviewer-data', async (event, dir) => {
  return getEhviewerDataManually(dir)
})

// ---------- EH 出网公共 helper ----------
// ⚠️ 必须定义在所有使用者之前:这些是 const,提升到前面也没用(暂时性死区),
//    在主进程顶层/回调里"先引用后定义"会抛 ReferenceError。
//    「设置 → 测试代理」一点就闪退就是这个原因:test-proxy 用了下面的 ehCookieHeader,
//    而它当时定义在文件更后面 → IPC 回调里抛错 → 主进程崩掉。
// 出网口径与 eh-gallery-pages 一致:Cookie + 代理,超时自己控制(见 modules/ehLogin.js 的 request)。
const ehCookieHeader = () => ehLogin.cookieHeaderOf({
  igneous: setting.igneous,
  ipb_pass_hash: setting.ipb_pass_hash,
  ipb_member_id: setting.ipb_member_id,
  star: setting.star
})
// 有有效 igneous 走 exhentai,否则 e-hentai(与前端 ehOnline.js 的 useExSite 同判法)
const ehSiteName = () => {
  const v = String(setting.igneous || '').trim()
  return (v && v !== 'null' && v !== 'mystery' && v !== 'deleted') ? 'exhentai' : 'e-hentai'
}
const ehGidToken = (url) => {
  const m = /\/g\/(\d+)\/([0-9a-z]{10})/i.exec(String(url || ''))
  return m ? { gid: m[1], token: m[2] } : null
}
const emitToRenderer = (channel, arg) => {
  if (WEB_MODE) require('./web-electron-shim.js').broadcast(channel, arg)
  else if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, arg)
}

// 测试「设置 → 代理」是否真的能用:必须在**主进程**里带 setting.proxy 发请求。
// 以前这项测试是渲染进程直接 fetch EH —— 浏览器的 fetch 根本不走 setting.proxy,
// 于是「代理明明已经连上,测试却永远报连接错误」。
ipcMain.handle('test-proxy', async (event, arg) => {
  const proxy = String((arg && arg.proxy) || setting.proxy || '').trim()
  const testUrl = String((arg && arg.url) || 'https://e-hentai.org/')
  const started = Date.now()
  const cookie = ehCookieHeader()
  const opts = { timeout: 15000, cookie }
  if (proxy) opts.proxy = proxy
  try {
    const res = await ehLogin.request(testUrl, opts)
    const ms = Date.now() - started
    const body = res.body || ''
    // 200/302/403 都说明「代理通了」:能拿到 EH 的响应(哪怕是登录墙/ Cloudflare)就不是代理问题
    const reachable = res.status > 0
    return {
      ok: reachable,
      status: res.status || 0,
      ms,
      bytes: body.length,
      title: (/<title>([^<]*)<\/title>/i.exec(body) || [])[1] ? String((/<title>([^<]*)<\/title>/i.exec(body) || [])[1]).trim().slice(0, 60) : '',
      proxy: proxy || '(未设置,直连)'
    }
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - started, error: String((e && e.message) || e), proxy: proxy || '(未设置,直连)' }
  }
})

ipcMain.handle('get-ex-webpage', async (event, { url, cookie }) => {
  if (setting.proxy) {
    return await fetch(url, {
      headers: {
        Cookie: cookie
      },
      agent: new HttpsProxyAgent(setting.proxy)
    })
    .then(async res => {
      const result = await res.text()
      if (!result) throw new Error('Empty response, maybe the cookie is expired')
      return result
    })
    .catch(e => {
      // 不弹提示:在线列表/预览拉不到时由调用方按「有没有已显示内容」决定要不要打扰用户,
      // 这里每条失败都弹一次,就是「EH在线老是弹错误提示」的直接原因
      console.error('get-ex-webpage failed', e)
    })
  } else {
    return await fetch(url, {
      headers: {
        Cookie: cookie
      }
    })
    .then(async res => {
      const result = await res.text()
      if (!result) throw new Error('Empty response, maybe the cookie is expired')
      return result
    })
    .catch(e => {
      sendMessageToWebContents(`获取 Ex 页面失败:${e}`)
    })
  }
})

ipcMain.handle('post-data-ex', async (event, { url, data }) => {
  if (setting.proxy) {
    return await fetch(url, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json'
      },
      agent: new HttpsProxyAgent(setting.proxy)
    })
    .then(res => res.text())
    .catch(e => {
      console.error('post-data-ex failed', e)
    })
  } else {
    return await fetch(url, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json'
      }
    })
    .then(res => res.text())
    .catch(e => {
      sendMessageToWebContents(`获取 Ex 数据失败:${e}`)
    })
  }
})

// ---------- EH 登录(设置 → 常用 → EH设置)----------
// 两条路:
//   ① 账号密码登录(eh-password-login):纯 HTTP POST 到论坛登录表单,桌面版与网页版都能用
//      (逻辑在 modules/ehLogin.js,可离线单测);
//   ② 打开登录窗口(eh-login,仅桌面版):开一个用独立分区(persist:eh-login)的窗口打开论坛登录页,
//      轮询该分区的 Cookie;拿到 ipb_member_id + ipb_pass_hash 后再访问一次 exhentai.org 取 igneous,
//      最后用论坛 showuser 页取用户名,连同四项 Cookie 一起回给前端写进设置。
const EH_LOGIN_PARTITION = 'persist:eh-login'
const EH_LOGIN_URL = ehLogin.EH_BASES.forum + '/index.php?act=Login&CODE=00'
const EH_EX_URL = ehLogin.EH_BASES.ex + '/'
let ehLoginInFlight = false

// 登录窗口分区的 Cookie 全量(短命窗口,分区里只有我们自己的 Cookie)
const ehCookieMapOf = async (ses) => {
  const map = {}
  try {
    for (const c of await ses.cookies.get({})) map[c.name] = c.value
  } catch (e) { /* 分区还没建立等:当作没有 */ }
  return map
}

// 账号密码登录:桌面版与网页版都用这一条(不需要 Electron,所以放在 WEB_MODE 判断之外)
ipcMain.handle('eh-password-login', async (event, arg) => {
  const { username, password } = arg || {}
  try {
    const res = await ehLogin.passwordLogin({ username, password, proxy: setting.proxy })
    if (!res.ok) return res
    const user = await ehLogin.fetchUserName(res.cookies.ipb_member_id, res.cookies, { proxy: setting.proxy })
    return { ok: true, cookies: res.cookies, user }
  } catch (e) {
    console.error(e)
    return { ok: false, error: 'network', detail: String((e && e.message) || e) }
  }
})

// 详情页「预览」:只读地取这本书的前 N 张图,**不占用阅读器的 viewerSession**。
//  - folder:直接 glob(便宜)
//  - 压缩包:先用 7z 只列条目名,再**只解压前 N 张**(绝不为一个预览条解压整包)
//  - epub / txt:没有图片页 → 明确告诉前端不支持
// 压缩包名字列表缓存:同一本书连续翻页时不用每次重新 `7z l`
// (页数不再截断:前端的「加载更多」可以一直翻到最后一页,只是每次只解一小批)
const previewArchiveCache = new Map()

ipcMain.handle('book-preview-images', async (event, book) => {
  // 两种用法:
  //   · 分批(详细界面/侧栏):传 start + count,每次只解压/取这一批,前端取到就显示 ——
  //     以前 limit:0 会把压缩包前 60 页一次解完才返回,表现就是「卡半天然后突然全部冒出来」;
  //   · 老用法(limit):不传 count 时保持原行为。
  const LIMIT = Number(book && book.limit) >= 0 ? Number(book.limit) : 12
  const batchMode = !!(book && book.count !== undefined && book.count !== null)
  const start = Math.max(0, Number(book && book.start) || 0)
  const count = batchMode
    ? Math.max(1, Math.min(Number(book.count) || 12, 24))
    : (LIMIT === 0 ? 60 : LIMIT)
  try {
    const { filepath, type } = book || {}
    if (!filepath || !type) return { ok: false, error: 'no-filepath' }
    if (type === 'epub' || type === 'novel') return { ok: false, error: 'text-only' }
    if (type === 'folder') {
      const list = await getImageListByBook(filepath, type)
      const files = list.slice(start, start + count).map(it => it.absolutePath).filter(Boolean)
      return { ok: true, total: list.length, rawTotal: list.length, start, files }
    }
    // 压缩包:名字列表按「路径 + 修改时间」缓存,每次只解压要的这一批
    let mtime = 0
    try { mtime = fs.statSync(filepath).mtimeMs } catch (e) { /* 读不到就按 0 */ }
    const key = filepath + '|' + mtime
    let entry = previewArchiveCache.get(key)
    if (!entry) {
      const names = await listArchiveImages(filepath)
      if (!names.length) return { ok: false, error: 'no-image' }
      entry = { names, rawTotal: names.length, dir: path.join(VIEWER_PATH, 'preview-' + nanoid(8)) }
      fs.mkdirSync(entry.dir, { recursive: true })
      previewArchiveCache.set(key, entry)
      // 只留最近 6 本,避免常驻内存
      if (previewArchiveCache.size > 6) previewArchiveCache.delete(previewArchiveCache.keys().next().value)
    }
    const pick = entry.names.slice(start, start + count)
    if (!pick.length) return { ok: true, total: entry.names.length, rawTotal: entry.rawTotal, start, files: [] }
    // 已经解压过的页不再重解(重新打开预览时省一大截时间)
    const missing = pick.filter(n => !fs.existsSync(path.join(entry.dir, n)))
    if (missing.length) await extractArchiveFiles(filepath, missing, entry.dir)
    return {
      ok: true,
      total: entry.names.length,
      rawTotal: entry.rawTotal,
      start,
      files: pick.map(n => path.join(entry.dir, n)).filter(f => fs.existsSync(f))
    }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})

// ---------- 标签翻译词库(EhTagTranslation) ----------
// JHenTai 的「标签翻译」用的就是这份词库;以前这里是渲染进程直接 fetch GitHub,
// 在 NAS / 国内网络下经常拿不到(拿不到就永远显示原始英文标签)。现在改由主进程下载:
//   · 跟着「设置 → 代理」走;· 缓存到数据目录,只 7 天更新一次;· 失败时回退旧缓存。
const TAG_TRANSLATION_URL = 'https://github.com/EhTagTranslation/Database/releases/latest/download/db.text.json'
const TAG_TRANSLATION_TTL = 7 * 24 * 3600 * 1000
let tagTranslationMemory = null

const requestFollowRedirect = async (url, opts, depth = 0) => {
  const res = await ehLogin.request(url, opts)
  const loc = res && res.headers && res.headers.location
  if (res && [301, 302, 303, 307, 308].includes(res.status) && loc && depth < 5) {
    return requestFollowRedirect(new URL(loc, url).toString(), opts, depth + 1)
  }
  return res
}

const normalizeTagTranslationDb = (raw) => {
  const list = Array.isArray(raw) ? raw : ((raw && raw.data) || [])
  const out = {}
  for (const ns of list) {
    if (!ns || !ns.namespace) continue
    const rec = {}
    if (ns.frontMatters && ns.frontMatters.name) rec._name = ns.frontMatters.name
    const items = ns.data || {}
    for (const key of Object.keys(items)) {
      const v = items[key] || {}
      rec[key] = { name: v.name || '', intro: v.intro || '' }
    }
    out[ns.namespace] = rec
  }
  return out
}

ipcMain.handle('load-tag-translation', async (event, opts) => {
  const force = !!(opts && opts.force)
  const cacheFile = path.join(STORE_PATH, 'tag-translation.json')
  let cached = tagTranslationMemory
  if (!cached) {
    try {
      const j = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'))
      if (j && j.data) cached = j
    } catch (e) { /* 没有缓存 */ }
  }
  if (cached && !force && (Date.now() - (cached.updatedAt || 0) < TAG_TRANSLATION_TTL)) {
    return { ok: true, cached: true, updatedAt: cached.updatedAt || 0, data: cached.data }
  }
  try {
    const res = await requestFollowRedirect(TAG_TRANSLATION_URL, { proxy: setting.proxy, raw: true, timeout: 180000 })
    if (!res || res.status !== 200 || !res.buffer || !res.buffer.length) throw new Error('http ' + (res && res.status))
    const data = normalizeTagTranslationDb(JSON.parse(res.buffer.toString('utf-8')))
    if (!Object.keys(data).length) throw new Error('empty')
    const payload = { updatedAt: Date.now(), data }
    tagTranslationMemory = payload
    try { fs.writeFileSync(cacheFile, JSON.stringify(payload)) } catch (e) { /* 只放内存也行 */ }
    console.log('[tag-translation] 词库已更新:' + Object.keys(data).length + ' 个类别')
    return { ok: true, cached: false, updatedAt: payload.updatedAt, data }
  } catch (e) {
    if (cached) return { ok: true, cached: true, updatedAt: cached.updatedAt || 0, data: cached.data, error: String((e && e.message) || e) }
    return { ok: false, error: String((e && e.message) || e) }
  }
})

// 在线阅读:解析 EH 画廊各页的真实图片地址(交给内置 ComicRead 显示)。桌面版与网页版都注册。
ipcMain.handle('eh-gallery-pages', async (event, arg) => {
  const { url, limit } = arg || {}
  try {
    return await ehLogin.galleryPageImages({
      url,
      proxy: setting.proxy,
      cookie: ehCookieHeader(),
      limit: Math.max(1, Math.min(Number(limit) || 40, 200))
    })
  } catch (e) {
    console.error(e)
    return { ok: false, error: 'network', detail: String((e && e.message) || e), images: [], items: [], total: 0 }
  }
})

// 在线阅读用:①先把页链接收齐(快,几次请求就有总数)②再逐页解析图片地址。
// 拆成两条是为了「点开就进阅读器」—— 界面先按总数摆好占位,哪一页解析好就填哪一页
// (JHenTai 阅读器就是这么做的:进页面立刻可见,每页各自显示解析/加载状态)。
ipcMain.handle('eh-gallery-page-links', async (event, arg) => {
  const { url, limit = 3000 } = arg || {}
  if (!url) return { ok: false, error: 'noUrl', links: [] }
  try {
    const links = await ehLogin.listGalleryPageLinks(url, {
      proxy: setting.proxy,
      cookie: ehCookieHeader(),
      limit: Math.max(1, Math.min(Number(limit) || 3000, 5000)),
      maxPages: 200
    })
    return { ok: links.length > 0, links, total: links.length, error: links.length ? '' : 'noPages' }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), links: [] }
  }
})

ipcMain.handle('eh-page-image', async (event, arg) => {
  const { pageUrl, reloadKey = '' } = arg || {}
  if (!pageUrl) return { ok: false, error: 'noUrl' }
  try {
    const info = await ehLogin.resolvePageImageInfo(pageUrl, { proxy: setting.proxy, cookie: ehCookieHeader(), reloadKey })
    return { ok: !!info.url, url: info.url, originalUrl: info.originalUrl, reloadKey: info.reloadKey, error: info.url ? '' : 'noImageUrl' }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})

// ---------- H@H 归档下载(照 JHenTai 的 EHDownloadHHDialog)----------
// EH 的 archiver.php 会列出 6 种分辨率(各带体积与花费),用户选一个再 POST hathdl_xres。
// 这里分两步:①解析出列表交给界面 ②用户选中后发起下载(服务端会打包,完成后在 H@H 页面下载)。
const parseHhInfo = (html) => {
  // 表格:每个 td 里 p1=分辨率描述+onclick('xres'), p3=体积, p5=花费
  const res = []
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
  let m
  while ((m = tdRe.exec(html))) {
    const td = m[1]
    if (!/onclick|archive/i.test(td)) continue
    const desc = (/<p[^>]*>([\s\S]*?)<\/p>/i.exec(td) || [])[1] || ''
    const click = /\(['"]([a-z0-9_]+)['"]\)/i.exec(td)
    const cleanDesc = desc.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (!cleanDesc) continue
    const ps = [...td.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(x => x[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    res.push({
      resolutionDesc: cleanDesc,
      resolution: click ? click[1] : '',
      size: ps[2] || '',
      cost: ps[4] || ''
    })
  }
  // 去掉没有 resolution 的(纯表头)
  const archives = res.filter(a => a.resolution)
  // GP / Credits(照 JHenTai:#db > p:nth-child(4))
  const dbm = /([\d,]+)\s*GP/.exec(html)
  const crm = /([\d,]+)\s*Credits/.exec(html)
  return {
    archives,
    gpCount: dbm ? Number(dbm[1].replace(/,/g, '')) : null,
    creditCount: crm ? Number(crm[1].replace(/,/g, '')) : null
  }
}

ipcMain.handle('eh-hh-info', async (event, arg) => {
  const url = String((arg && arg.url) || '')
  if (!url) return { ok: false, error: 'noUrl' }
  try {
    // ⚠ archiver.php 未登录/会话过期会 302 到登录页:必须跟随重定向,
    //   否则拿到的是空 body(以前这里直接 request,结果解析出 0 个归档)。
    const r = await requestFollowRedirect(url, {
      proxy: setting.proxy, cookie: ehCookieHeader(), timeout: 30000, referer: url
    })
    // 未登录/会话过期:EH 会跳到登录页,页面里是 UserName/PassWord 表单
    const html = r.body || ''
    if (/name=["']PassWord["']/i.test(html) || /bounce_login\.php/i.test(String(r.headers && r.headers.location || ''))) {
      return { ok: false, error: 'needLogin', archives: [], gpCount: null, creditCount: null }
    }
    const info = parseHhInfo(html)
    if (!info.archives.length) {
      // 页面里有归档表但没解析出来 / 或该画廊不支持
      const hasTable = /hathdl_xres|Archive Download|\(['"]res\./i.test(html)
      return { ok: false, error: hasTable ? 'parse' : 'noArchives', ...info }
    }
    return { ok: true, ...info }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})

ipcMain.handle('eh-hh-download', async (event, arg) => {
  const url = String((arg && arg.url) || '')
  const resolution = String((arg && arg.resolution) || '')
  if (!url || !resolution) return { ok: false, error: 'badArgs' }
  try {
    // 照 JHenTai:POST hathdl_xres 到 archiver 页 → 返回一句结果文案
    const body = 'hathdl_xres=' + encodeURIComponent(resolution)
    const r = await ehLogin.request(url, {
      method: 'POST', form: { hathdl_xres: resolution }, proxy: setting.proxy,
      cookie: ehCookieHeader(), referer: url, timeout: 60000
    })
    const text = ((/<p[^>]*>([\s\S]*?)<\/p>/i.exec(r.body || '') || [])[1] || '')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    void body
    return { ok: r.status >= 200 && r.status < 400, status: r.status, message: text.slice(0, 300) }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})

// 卡片右下角的「种子」按钮要知道这个画廊有没有种子:只回数量,失败就当没有
ipcMain.handle('eh-torrent-count', async (event, arg) => {
  const gt = ehGidToken((arg && arg.url) || '')
  if (!gt) return { ok: false, count: 0 }
  try {
    const r = await ehLogin.galleryTorrents({ ...gt, site: ehSiteName(), proxy: setting.proxy, cookie: ehCookieHeader() })
    return { ok: true, count: (r.torrents || []).length }
  } catch (e) {
    return { ok: false, count: 0, error: String((e && e.message) || e) }
  }
})

// 收藏夹分类(EH 账号的 10 个收藏夹,带数量)
ipcMain.handle('eh-favorite-categories', async () => {
  try {
    const categories = await ehLogin.favoriteCategories({ site: ehSiteName(), proxy: setting.proxy, cookie: ehCookieHeader() })
    return { ok: true, categories }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), categories: [] }
  }
})

// 加入 / 取消收藏(账号侧,不是本地收藏)
ipcMain.handle('eh-set-favorite', async (event, arg) => {
  const { url, favcat = 0, remove = false, note = '' } = arg || {}
  const gt = ehGidToken(url)
  if (!gt) return { ok: false, error: 'badUrl' }
  try {
    return await ehLogin.setFavorite({
      ...gt, favcat, note, remove,
      site: ehSiteName(), proxy: setting.proxy, cookie: ehCookieHeader()
    })
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})

// 种子列表
ipcMain.handle('eh-torrents', async (event, arg) => {
  const gt = ehGidToken((arg && arg.url) || '')
  if (!gt) return { ok: false, error: 'badUrl', torrents: [] }
  try {
    return await ehLogin.galleryTorrents({ ...gt, site: ehSiteName(), proxy: setting.proxy, cookie: ehCookieHeader() })
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), torrents: [] }
  }
})

// ---------- 下载:任务记录 + 进度 ----------
// 记录落 <数据目录>/downloads.json(重启后还在);status: downloading/paused/done/failed
const downloadStoreFile = () => path.join(STORE_PATH, 'downloads.json')
const DOWNLOAD_RECORD_LIMIT = 200
const downloadTasks = new Map()
// 下载记录的封面:建任务时抓一次存成本地文件(<数据目录>/download-covers/<id>.<ext>),
// 之后界面直接读本地图 —— 不再走代理,代理挂了也不会变破图。
const DOWNLOAD_COVER_DIR = path.join(STORE_PATH, 'download-covers')
// 记录里存的 cover 可能是原始 EH 地址,也可能是网页版的 /api/ex-image?url=... 代理地址
const rawCoverUrl = (c) => {
  const s = String(c || '')
  if (!s) return ''
  if (s.startsWith('/api/ex-image')) {
    const m = /[?&]url=([^&]+)/.exec(s)
    if (m) { try { return decodeURIComponent(m[1]) } catch (e) { return '' } }
    return ''
  }
  return /^https?:\/\//i.test(s) ? s : ''
}
const coverExtOf = (contentType, url) => {
  const ct = String(contentType || '').toLowerCase()
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('png')) return 'png'
  if (ct.includes('gif')) return 'gif'
  if (ct.includes('avif')) return 'avif'
  const m = /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(String(url || ''))
  return m ? m[1].toLowerCase() : 'jpg'
}
// 「已完成但没封面」的兜底:直接拿下载目录里的第一页当封面(纯本地,不联网)。
// 用户要求:封面不该依赖代理 —— 漫画都下到本地了,第一页本来就是现成的图。
const firstImageInDir = (dir) => {
  const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|avif|jxl|tiff?)$/i
  try {
    if (!dir) return ''
    const files = fs.readdirSync(dir).filter(f => IMG_RE.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    return files.length ? path.join(dir, files[0]) : ''
  } catch (e) { return '' }
}

const cacheDownloadCover = async (rec) => {
  try {
    if (!rec || !rec.id) return ''
    const url = rawCoverUrl(rec.cover)
    if (!url) return ''
    fs.mkdirSync(DOWNLOAD_COVER_DIR, { recursive: true })
    const r = await ehLogin.request(url, {
      proxy: setting.proxy, cookie: ehCookieHeader(), raw: true,
      referer: 'https://e-hentai.org/', timeout: 30000
    })
    if (!r || r.status !== 200 || !r.buffer || !r.buffer.length) return ''
    const file = path.join(DOWNLOAD_COVER_DIR, rec.id + '.' + coverExtOf(r.headers && r.headers['content-type'], url))
    fs.writeFileSync(file, r.buffer)
    rec.coverPath = file
    persistDownloads()
    emitToRenderer('eh-download-progress', publicDownload(rec))
    return file
  } catch (e) { return '' }
}

const publicDownload = (t) => ({
  id: t.id, url: t.url, title: t.title, cover: t.cover, original: !!t.original,
  // 画廊标签 / 分类 / 日文标题 / 评分:下载记录显示标签、移动到本地库写元数据都用它
  tags: (t.tags && typeof t.tags === 'object') ? t.tags : {},
  category: t.category || '', titleJpn: t.titleJpn || '', rating: Number(t.rating) || 0,
  // 封面本地文件(绝对路径;前端用 toAssetUrl 转成可访问 URL);空 = 还没抓到,前端退回远端 cover
  coverPath: t.coverPath || '',
  saveDir: t.saveDir, dir: t.dir || '', total: t.total | 0, done: t.done | 0, failed: t.failed | 0,
  bytes: t.bytes | 0, status: t.status, error: t.error || '', fallback: t.fallback | 0, gpBlocked: t.gpBlocked | 0,
  phase: t.phase || '', linkCount: t.linkCount | 0,
  // 移动到本地库之后的目标路径(空 = 还在下载目录)
  movedTo: t.movedTo || '',
  // 自动重试:已经试过几次 / 下次什么时候试
  retryCount: t.retryCount | 0,
  nextRetryAt: t.nextRetryAt || 0,
  createdAt: t.createdAt, finishedAt: t.finishedAt || 0
})
const downloadList = () => Array.from(downloadTasks.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(publicDownload)
// 老记录(还没有本地封面)后台补一次:进程内每本只试一次,失败就算了
const coverBackfillTried = new Set()
const backfillDownloadCovers = () => {
  let changed = false
  for (const t of downloadTasks.values()) {
    if (t.coverPath && fs.existsSync(t.coverPath)) continue
    // ① 先看下载目录里的第一页(本地现成的,秒出,不依赖网络)
    if (t.dir) {
      const local = firstImageInDir(t.dir)
      if (local) { t.coverPath = local; changed = true; continue }
    }
    // ② 目录里没有图(还在下 / 没下完)再去抓 EH 封面
    if (coverBackfillTried.has(t.id)) continue
    coverBackfillTried.add(t.id)
    cacheDownloadCover(t).catch(() => {})
  }
  if (changed) persistDownloads()
}
const persistDownloads = () => {
  try {
    fs.writeFileSync(downloadStoreFile(), JSON.stringify(downloadList().slice(0, DOWNLOAD_RECORD_LIMIT), null, 1))
  } catch (e) { /* 写不了就只留内存里 */ }
}
const restoreDownloads = () => {
  try {
    const raw = JSON.parse(fs.readFileSync(downloadStoreFile(), 'utf-8'))
    if (!Array.isArray(raw)) return
    for (const t of raw) {
      if (!t || !t.id) continue
      // 旧记录里的 saveDir / dir 可能是相对路径(取决于当时的设置):统一补成绝对路径,
      // 否则重启后「继续下载」会写到一个不存在的地方、预览也读不到文件。
      const fix = (p) => { const s = String(p || ''); return s ? path.resolve(s) : '' }
      // 上次没跑完的:重启后一律当「已暂停」,由用户点继续(继续时会跳过已下好的文件)
      downloadTasks.set(t.id, {
        ...t,
        saveDir: fix(t.saveDir),
        dir: fix(t.dir),
        status: t.status === 'downloading' ? 'paused' : t.status,
        // 上次退出时如果停在「收页链接」阶段,phase 会被存成 links:重启后卡片会一直显示「0页」。
        // 恢复时统一清掉,让卡片显示真实的 done/total。
        phase: '',
        linkCount: 0,
        // total 兜底:links 收集不全的老记录会出现 done+failed > total(235/218,实际 236 页)。
        // 任务已经停了不会再走 onProgress,所以在恢复时按 done+failed 修正一次。
        total: Math.max(Number(t.total) || 0, (Number(t.done) || 0) + (Number(t.failed) || 0), Number(t.pageCount) || 0),
        state: { stopped: false }
      })
    }
    console.log('[download] 已恢复下载记录', downloadTasks.size, '条')
  } catch (e) { /* 没有记录文件 */ }
}
restoreDownloads()

const runDownloadJob = (rec) => {
  const state = rec.state || (rec.state = { stopped: false })
  state.stopped = false
  rec.status = 'downloading'
  rec.error = ''
  persistDownloads()
  emitToRenderer('eh-download-progress', publicDownload(rec))
  let lastEmit = 0
  const job = ehDownload.runGalleryDownload({
    galleryUrl: rec.url,
    title: rec.title,
    saveDir: rec.saveDir,
    // 续传必须沿用**第一次**解析出来的目录:以前每次重新推断,
    // 推断不一致(老目录名 / 带 gid 前缀)就会新建一个空目录从头下,
    // 用户看到的就是「点继续,已经下好的全部重下」
    dir: rec.dir || '',
    // EH 标注的页数:links 收集不全时(反爬/限速会少收十几条)用它兜底,
    // 不然封面会显示 235/218 这种 done 比 total 还大的计数
    pageCount: Number(rec.pageCount) || 0,
    // 速度限制(页数/时间):0 = 不限
    pageRate: Number(setting.downloadPageRate) || 0,
    pageRateSec: Number(setting.downloadPageRateSec) || 0,
    original: !!rec.original,
    proxy: setting.proxy,
    cookie: ehCookieHeader(),
    // 并发:默认 6(与 JHenTai downloadTaskConcurrency 的默认值一致;原来是 4,偏保守)
    concurrency: Math.max(1, Math.min(Number(setting.downloadConcurrency) || 6, 12)),
    // 速度限制(KB/s → 字节/秒);0 / 空 = 不限制
    speedLimit: Math.max(0, Number(setting.downloadSpeedLimit) || 0) * 1024,
    // 请求频率限制(照 JHenTai 的 Rate(maximum, period)):每 periodSec 秒最多 maxPerPeriod 个请求。
    // 这是「别被 EH 限速」最有效的一档;0 = 不限。
    maxPerPeriod: Math.max(0, Number(setting.downloadMaxPerPeriod) || 2),
    periodSec: Math.max(0.1, Number(setting.downloadPeriodSec) || 1),
    state,
    onProgress: (u) => {
      // 收页链接阶段(phase=links):只更新链接数,**不动 done/failed**。
      // 以前这里无条件 rec.done = u.done|0,而 links 阶段的 update 里 done 恒为 0 ——
      // 点「继续任务」后进度条先掉到 0、再把已下好的页数一遍爬回来,就是用户说的「短暂失灵」。
      if (u.phase === 'links') {
        rec.total = u.total || rec.total
        rec.phase = 'links'
        rec.linkCount = u.linkCount | 0
        if (u.dir) rec.dir = u.dir
        const now0 = Date.now()
        if (now0 - lastEmit > 400) {
          lastEmit = now0
          emitToRenderer('eh-download-progress', publicDownload(rec))
        }
        return
      }
      // total 取各路最大:links 数 / 上一次的值 / 已下+失败 / EH 标注页数。
      // links 收集可能少收(EH 限速时静默丢页),只用它会让 done 超过 total(235/218 这种)
      rec.total = Math.max(
        Number(u.total) || 0, Number(rec.total) || 0,
        (Number(u.done) || 0) + (Number(u.failed) || 0),
        (Number(rec.done) || 0) + (Number(rec.failed) || 0),
        Number(rec.pageCount) || 0
      )
      rec.done = u.done | 0
      rec.failed = u.failed | 0
      rec.bytes = u.bytes | 0
      rec.fallback = u.fallback | 0
      rec.gpBlocked = u.gpBlocked | 0
      if (u.phase) rec.phase = u.phase
      if (u.linkCount) rec.linkCount = u.linkCount | 0
      if (u.total) { rec.phase = ''; rec.linkCount = 0 }
      if (u.lastError) rec.lastError = u.lastError
      if (u.dir) rec.dir = u.dir
      const now = Date.now()
      if (u.finished || now - lastEmit > 400) {
        lastEmit = now
        emitToRenderer('eh-download-progress', publicDownload(rec))
      }
    }
  }).then(() => {
    if ((rec.gpBlocked | 0) > 0) {
      // 原图被 EH 以「需要 GP」挡下:任务停在「等待中」——额度恢复后点「继续」接着下
      rec.status = 'waiting'
      rec.error = 'gp'
    } else {
      // 有页失败就标成 failed(可「继续」补:继续时会跳过已下好的文件),不是 done ——
      // 否则用户看到 ✗ 却没有任何按钮能补齐(JHenTai 的 downloadFailed 也是可重下的状态)
        rec.status = state.stopped ? 'paused' : ((rec.failed | 0) === 0 ? 'done' : 'failed')
      if (rec.status === 'failed' && !rec.error) rec.error = (rec.lastError || '部分页面下载失败')
      // 失败(或等 GP 的 waiting)按设置排一次自动重试;完成/暂停清掉
      if (rec.status === 'failed' || rec.status === 'waiting') {
        const mins = Math.max(1, Number(setting.retryIntervalMin) || 10)
        rec.nextRetryAt = Date.now() + mins * 60000
      } else {
        rec.nextRetryAt = 0
      }
      // 封面兜底:EH 封面抓不到(或早就没了)时,用下载目录里的第一页(本地文件,永远在)
      if (!rec.coverPath && rec.dir) {
        const local = firstImageInDir(rec.dir)
        if (local) rec.coverPath = local
      }
    }
  }).catch((e) => {
    rec.status = state.stopped ? 'paused' : 'failed'
    rec.error = String((e && e.message) || e)
  }).finally(() => {
    // ★关键:这条记录可能已经在下载过程中被用户删掉了(删除时把它从 downloadTasks 里摘掉)。
    //   以前这里无条件 persist + emit —— worker 在几秒后收尾,又把「已删除的记录」推回前端,
    //   前端 upsertDownloadRecord 一看 id 不在就 unshift 回去,于是「删掉的记录自己又回来了」。
    //   已经被删(或已被换成新的同名任务)就什么都不做。
    if (downloadTasks.get(rec.id) !== rec) return
    // 收尾时一定要退出 links 阶段:否则「继续」如果失败,phase 还停在 links、linkCount 还是 0,
    // 任务卡封面就会一直显示「0页」,把真实的 done/total 藏起来(用户反馈的「继续后变成 0 页」)
    if (rec.status === 'downloading') rec.status = 'failed'
    rec.phase = ''
    rec.linkCount = 0
    rec.finishedAt = Date.now()
    persistDownloads()
    emitToRenderer('eh-download-progress', publicDownload(rec))
    emitToRenderer('eh-download-done', publicDownload(rec))
    // 「完成」之后按设置处理:自动移动 / 移动后移除记录
    onDownloadFinished(rec)
  })
  // 留住这次跑的 promise:「重新下载」要等旧 worker 退出后再清文件重下
  // (worker 循环只在页边界检查 state.stopped,不能这边刚删文件它还在写)
  rec.jobPromise = job
  return job
}

ipcMain.handle('eh-download-gallery', async (event, arg) => {
  const { url, title = '', cover = '', original = false, tags = null, category = '', titleJpn = '', rating = 0 } = arg || {}
  // 统一成绝对路径:记录里的 dir 会一直用到「重启后继续下载」和「预览找文件」,
  // 存相对路径的话换个工作目录就全找不到(预览空白、续传失效)。
  // 下载窗口里可以指定位置(saveDir):不传就用设置里的下载目录
  const wantDir = String((arg && arg.saveDir) || '').trim() || String(setting.downloadPath || '').trim()
  const saveDir = wantDir ? path.resolve(wantDir) : ''
  if (!url) return { ok: false, error: 'badUrl' }
  if (!saveDir) return { ok: false, error: 'noPath' }
  const rec = {
    id: nanoid(), url, title, cover, original: !!original, saveDir,
    // EH 标注的页数(卡片/详情里带的):links 收集不全时用它兜底总数
    pageCount: Number(arg && arg.pageCount) || 0,
    // 画廊标签随下载一起记下来(下载记录里显示 / 移动到本地库时写进书库,不用再连 EH 去取)
    tags: (tags && typeof tags === 'object') ? tags : {},
    category: String(category || ''), titleJpn: String(titleJpn || ''), rating: Number(rating) || 0,
    total: 0, done: 0, failed: 0, bytes: 0, status: 'downloading', error: '',
    createdAt: Date.now(), finishedAt: 0, state: { stopped: false }
  }
  downloadTasks.set(rec.id, rec)
  runDownloadJob(rec)
  // 封面存本地(后台做,不阻塞任务开始):成功后面板直接读本地图
  cacheDownloadCover(rec).catch(() => {})
  return { ok: true, task: publicDownload(rec) }
})

// 单页下载:直接存到下载目录(不建画廊子目录)
ipcMain.handle('eh-download-page', async (event, arg) => {
  const { url, originalUrl = '', pageUrl = '', original = false, name = '' } = arg || {}
  const saveDir = setting.downloadPath ? path.resolve(String(setting.downloadPath).trim()) : ''
  if (!saveDir) return { ok: false, error: 'noPath' }
  try {
    const r = await ehDownload.downloadOnePage({
      url, originalUrl, pageUrl, original, name, saveDir,
      proxy: setting.proxy, cookie: ehCookieHeader()
    })
    return { ok: true, ...r }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})

ipcMain.handle('eh-download-records', async () => {
  // 顺手把老记录的封面补成本地文件(后台,不阻塞返回)
  backfillDownloadCovers()
  // total 兜底:links 收集不全的记录会是 done+failed > total(如 235/218,实际 236 页),
  // 这里每次读记录都按 done+failed 修正一次,封面上的计数不会再出现「已下数比总数还大」
  for (const t of downloadTasks.values()) {
    const fixed = Math.max(Number(t.total) || 0, (Number(t.done) || 0) + (Number(t.failed) || 0), Number(t.pageCount) || 0)
    if (fixed !== t.total) { t.total = fixed }
  }
  return { ok: true, tasks: downloadList() }
})

// 诊断用:完整跑一次下载(到临时目录),把过程与错误原样带出来
ipcMain.handle('eh-debug-download', async (event, arg) => {
  const url = String((arg && arg.url) || '')
  const saveDir = String((arg && arg.dir) || '/tmp/debug-dl')
  if (!url) return { ok: false, error: 'noUrl' }
  const linkStats = {}
  const seen = []
  try {
    const r = await ehDownload.runGalleryDownload({
      galleryUrl: url, title: 'debug', saveDir, original: false,
      proxy: setting.proxy, cookie: ehCookieHeader(), concurrency: 4, state: {},
      onProgress: (u) => { seen.push({ total: u.total | 0, done: u.done | 0, dir: u.dir || '', phase: u.phase || '', linkCount: u.linkCount | 0 }) }
    })
    return { ok: true, result: { dir: r.dir, total: r.total, done: r.done, failed: r.failed, bytes: r.bytes }, first: seen.slice(0, 3), last: seen.slice(-2) }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), first: seen.slice(0, 3) }
  }
})

// 诊断用:在应用进程里跑一次「收页链接」,把过程信息带出来(排查「一条链接都收不到」)
ipcMain.handle('eh-debug-links', async (event, arg) => {
  const url = String((arg && arg.url) || '')
  if (!url) return { ok: false, error: 'noUrl' }
  const stats = {}
  try {
    const t0 = Date.now()
    const links = await ehLogin.listGalleryPageLinks(url, {
      proxy: setting.proxy, cookie: ehCookieHeader(), limit: 5000, maxPages: 200, stats
    })
    return { ok: true, ms: Date.now() - t0, count: links.length, first: links.slice(0, 2), stats }
  } catch (e) {
    return { ok: false, ms: 0, error: String((e && e.message) || e), stats }
  }
})

// 下载预览用:这个任务目录里每一页到底下了没有(按 1.webp / 02.jpg 这种序号文件名对应页码)。
// 返回定长数组,没下到的位置是 null —— 前端用「空白 + 进度圈」补上。
ipcMain.handle('eh-download-files', async (event, arg) => {
  // 目录可能是相对路径(下载设置里填的是相对路径时),一律先转绝对路径:
  // 否则 fs.readdirSync 会按进程 cwd 去找,读不到就返回空,前端表现为「预览什么都没有」;
  // 而且拼出来的图片路径也得是绝对的,file:// 才能加载。
  const rawDir = String((arg && arg.dir) || '')
  const dir = rawDir ? path.resolve(rawDir) : ''
  const total = Math.max(0, Number((arg && arg.total) || 0))
  // 任务状态:用来区分「这一页还没轮到」和「这一页试过但失败了」,
  // 预览里前者显示等待,后者显示失败(用户要的「没好的就显示进度」)。
  const taskId = String((arg && arg.id) || '')
  const task = taskId ? downloadTasks.get(taskId) : null
  // 全程按「任务已知的总页数」出定长数组:目录里只有前 7 张时也要有 8、9 两格占位,
  // 这样预览永远是「整本的样子」,不会因为还没下到而缺一块(用户反馈的问题)。
  const count = total
  const skeleton = Array.from({ length: count }, () => null)
  if (!dir) return { ok: true, files: skeleton, total: count, task: task ? publicDownload(task) : null }
  let names = []
  try {
    names = fs.readdirSync(dir)
  } catch (e) {
    return { ok: true, files: skeleton, total: count, task: task ? publicDownload(task) : null }
  }
  const byIndex = new Map()
  for (const name of names) {
    const m = /^(\d+)\.[a-z0-9]+$/i.exec(name)
    if (!m) continue
    const index = Number(m[1]) - 1
    const full = path.join(dir, name)
    let size = 0
    try { size = fs.statSync(full).size } catch (e) { size = 0 }
    if (size > 0) byIndex.set(index, { index, path: full, size, name })
  }
  // 目录里出现了超出记录总数的文件(记录里的 total 偏小):按实际文件数补长,
  // 否则多下的页会被截掉、用户以为没下全。
  const maxIndex = byIndex.size ? Math.max(...byIndex.keys()) + 1 : 0
  const finalCount = Math.max(count, maxIndex)
  const files = Array.from({ length: finalCount }, (_, i) => byIndex.get(i) || null)
  return { ok: true, files, total: finalCount, task: task ? publicDownload(task) : null }
})

ipcMain.handle('eh-download-action', async (event, arg) => {
  const { id, action } = arg || {}
  const t = downloadTasks.get(id)
  if (!t) return { ok: false, error: 'notFound' }
  if (action === 'pause') {
    if (t.state) t.state.stopped = true
    t.status = 'paused'
    persistDownloads()
    emitToRenderer('eh-download-progress', publicDownload(t))
    return { ok: true }
  }
  if (action === 'resume') {
    // ★已经「移动」过的记录不能再续传:移动把 rec.dir 指到了本地库里的书目录,
    //   继续下载会往库里继续写文件、多余页还按序号塞进去 —— 用户看到的就是
    //   「移动完的漫画又在重新下载」。真要补页请用「重新下载」(会清干净再下到下载目录)。
    if (t.movedTo) return { ok: false, error: 'alreadyMoved' }
    // 手动继续 = 重新开始计数(自动重试的次数归零)
    t.retryCount = 0
    t.nextRetryAt = 0
    runDownloadJob(t)
    return { ok: true }
  }
  if (action === 'restart') {
    // 重新下载(下载记录预览页右键):停掉正在跑的 worker → 等它退出 → 清掉已下好的文件
    // → 计数归零 → 重新入队。断点续传会跳过已存在的文件,所以「重下」必须显式删文件。
    if (t.state) t.state.stopped = true
    // 已经移到库里的记录:重新下载要回到**下载目录**、按原来的目录名重建,
    // 绝不能把库里的那本书当成下载目录(会写坏用户已入库的漫画)。
    if (t.movedTo) {
      t.movedTo = ''
      t.dir = ''
      if (t.saveDir) {
        const gidMatch = /\/g\/(\d+)\//.exec(String(t.url || ''))
        const plain = ehDownload.sanitizeName(t.title || '')
        const gid = gidMatch ? gidMatch[1] : ''
        t.dir = path.join(path.resolve(String(t.saveDir)), plain ? (gid ? gid + ' - ' + plain : plain) : '')
      }
    }
    const doRestart = () => {
      try {
        if (t.dir) fs.rmSync(t.dir, { recursive: true, force: true })
      } catch (e) { /* 目录本来就不存在:忽略 */ }
      t.done = 0
      t.failed = 0
      t.bytes = 0
      t.total = 0
      t.error = ''
      t.lastError = ''
      t.phase = ''
      t.linkCount = 0
      t.finishedAt = 0
      persistDownloads()
      runDownloadJob(t)
    }
    const prev = t.jobPromise
    if (prev && typeof prev.then === 'function') {
      // 任务正在跑:等这次 worker 收尾(它看到 stopped 会在页边界退出)再重下
      prev.then(doRestart, doRestart)
    } else {
      // 暂停/失败/等待中的任务没有在跑的 worker,直接重下
      setTimeout(doRestart, 0)
    }
    return { ok: true }
  }
  if (action === 'delete' || action === 'deleteWithFiles') {
    // ★先让正在跑的 worker 停下,再删记录 —— 这是「删不掉 / 删了又回来」的另一半原因:
    //   以前只删 Map 里的记录,worker 还在往下写文件、还在推进度,几秒后记录就被推回来了。
    if (t.state) t.state.stopped = true
    // ⚠ 已移到本地库的记录:t.dir 指向的是**库里的漫画**了,这里只删记录、绝不删文件
    //   (要删书请去书架那边删,那边才会同时清理数据库/封面)
    const dirToRemove = (action === 'deleteWithFiles' && t.dir && !t.movedTo) ? path.resolve(t.dir) : ''
    // 先把记录摘掉(立刻生效,前端马上看不到),
    // 文件放到 worker 完全退出之后再删 —— 否则 worker 正在写的文件会让 rmSync 报 EBUSY/EPERM,
    // 残留的半截文件下次又会被当成「已下载」跳过。
    downloadTasks.delete(id)
    persistDownloads()
    emitToRenderer('eh-download-removed', { id })
    const cleanup = () => {
      if (!dirToRemove) return
      // 只删「下载目录」里的东西:绝不能因为路径被改过而删到库里的书(双保险)
      const stillInDownloadPath = (() => {
        const base = String(t.saveDir || '').trim()
        if (!base) return false
        const b = path.resolve(base)
        return dirToRemove === b || dirToRemove.startsWith(b + path.sep)
      })()
      if (!stillInDownloadPath) return
      try { fs.rmSync(dirToRemove, { recursive: true, force: true }) } catch (e) { /* 忽略 */ }
    }
    const prev = t.jobPromise
    if (prev && typeof prev.then === 'function') prev.then(cleanup, cleanup)
    else setTimeout(cleanup, 0)
    return { ok: true }
  }
  return { ok: false, error: 'badAction' }
})

// 清空记录(只删记录,不动已下载的文件)
ipcMain.handle('eh-download-clear', async () => {
  // 先停掉所有在跑的 worker:否则它们收尾时又把记录推回前端(「清空后记录又冒出来」)
  for (const t of downloadTasks.values()) {
    if (t && t.state) t.state.stopped = true
  }
  downloadTasks.clear()
  persistDownloads()
  return { ok: true, tasks: [] }
})

// 数一个目录里的图片数(移动到本地库时要写 pageCount)
const countFolderImages = (dir) => {
  const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|avif|jxl|tiff?)$/i
  try {
    return fs.readdirSync(dir).filter(f => IMG_RE.test(f)).length
  } catch (e) { return 0 }
}

// 补写某条下载记录的画廊标签(老记录没有标签:前端现拉一次详情,拉到了存回来)
ipcMain.handle('eh-download-set-tags', async (event, arg) => {
  const { id, tags, category = '', titleJpn = '', rating = 0 } = arg || {}
  const t = downloadTasks.get(id)
  if (!t) return { ok: false, error: 'notFound' }
  if (tags && typeof tags === 'object' && Object.keys(tags).length) t.tags = tags
  if (category) t.category = String(category)
  if (titleJpn) t.titleJpn = String(titleJpn)
  if (Number(rating)) t.rating = Number(rating)
  persistDownloads()
  emitToRenderer('eh-download-progress', publicDownload(t))
  return { ok: true, task: publicDownload(t) }
})

// 失败任务定时重试:主进程里每 30 秒扫一遍(NAS 常驻,关掉网页照样重试)。
// 设置:retryEnabled 开关 / retryIntervalMin 间隔分钟 / retryTimes 最多重试几次。
const autoRetryTick = () => {
  try {
    const cfg = setting || {}
    if (!cfg.retryEnabled) return
    const max = Math.max(0, Number(cfg.retryTimes) || 0)
    if (!max) return
    const mins = Math.max(1, Number(cfg.retryIntervalMin) || 10)
    const now = Date.now()
    for (const rec of downloadTasks.values()) {
      if (rec.status !== 'failed' && rec.status !== 'waiting') continue
      if ((rec.retryCount | 0) >= max) continue
      if (!rec.nextRetryAt) { rec.nextRetryAt = now + mins * 60000; continue }
      if (now < rec.nextRetryAt) continue
      rec.retryCount = (rec.retryCount | 0) + 1
      rec.nextRetryAt = 0
      sendMessageToWebContents(`自动重试(${rec.retryCount}/${max}):${rec.title || rec.url}`)
      runDownloadJob(rec)
    }
  } catch (e) { /* 定时器里别抛 */ }
}
setInterval(autoRetryTick, 30000)

// 单页重新下载:只重下这一页(不动其它页)。index 是 0 基页码。
ipcMain.handle('eh-download-page-by-index', async (event, arg) => {
  const { id, index } = arg || {}
  const rec = downloadTasks.get(id)
  if (!rec) return { ok: false, error: 'notFound' }
  if (!rec.dir) return { ok: false, error: 'noDir' }
  const idx = Math.max(0, Number(index) | 0)
  try {
    const links = await ehLogin.listGalleryPageLinks(rec.url, {
      proxy: setting.proxy, cookie: ehCookieHeader(), limit: 5000, maxPages: 200
    })
    const pageUrl = links[idx]
    if (!pageUrl) return { ok: false, error: 'noPage' }
    const info = await ehDownload.resolveImagePage(pageUrl, { proxy: setting.proxy, cookie: ehCookieHeader() })
    // 原图任务下原图;拿不到原图链接才用普通图(与整本下载的口径一致)
    const target = rec.original ? (info.originalUrl || info.url) : info.url
    if (!target) return { ok: false, error: 'noImageUrl' }
    const pad = String(links.length).length
    const name = String(idx + 1).padStart(pad, '0')
    const file = path.join(rec.dir, name + '.' + ehDownload.extOf(target))
    const bytes = await ehDownload.downloadFile(target, file, {
      proxy: setting.proxy, cookie: ehCookieHeader(), referer: pageUrl
    })
    return { ok: true, path: file, bytes: bytes | 0 }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})

// 把下载好的漫画移动到本地库文件夹(或任意文件夹)。
// 除了搬文件,还要「迁移数据」:在目标所属的库里登记这本书(标题/标签/页数),
// 并用库自己的封面目录生成封面 —— 这样移过去就在书架里直接能看到,不用再全库扫描。
// 只列子目录(给「本地库文件夹选择器」按需加载用)
ipcMain.handle('list-subfolders', async (event, dir) => {
  try {
    const p = path.resolve(String(dir || ''))
    const entries = fs.readdirSync(p, { withFileTypes: true })
    return {
      ok: true,
      dirs: entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name).sort((a, b) => a.localeCompare(b))
    }
  } catch (e) { return { ok: false, dirs: [], error: String((e && e.message) || e) } }
})

// 真正执行移动(供 IPC 与「下载完成后自动移动」复用)
const runMoveDownloads = async (ids, targetRoot, opts = {}) => {
  const removeAfterMove = opts.removeAfterMove !== false && !!setting.downloadRemoveAfterMove
  targetRoot = path.resolve(String(targetRoot || '').trim())
  try { fs.mkdirSync(targetRoot, { recursive: true }) } catch (e) { /* 已存在或建不了,后面逐个报错 */ }
  const results = []
  for (const id of ids) {
    const rec = downloadTasks.get(id)
    if (!rec) { results.push({ id, ok: false, error: 'notFound' }); continue }
    // 正在下的不给动(会写坏文件)
    if (rec.status === 'downloading') { results.push({ id, ok: false, error: 'downloading' }); continue }
    const src = rec.dir ? path.resolve(rec.dir) : ''
    if (!src || !fs.existsSync(src)) { results.push({ id, ok: false, error: 'noDir' }); continue }
    try {
      // 目标同名就加 (2)(3)…
      const baseName = path.basename(src)
      let dest = path.join(targetRoot, baseName)
      for (let i = 2; fs.existsSync(dest); i++) dest = path.join(targetRoot, baseName + ' (' + i + ')')
      try {
        await fs.promises.rename(src, dest)
      } catch (e) {
        // 跨盘(下载目录和库不在同一个卷)走复制+删除
        if (e.code === 'EXDEV' || e.code === 'EPERM') {
          await fs.promises.cp(src, dest, { recursive: true })
          await fs.promises.rm(src, { recursive: true, force: true })
        } else throw e
      }
      // 迁移数据:目标在某个本地库内 → 在库里登记(标签/分类/日文标题/评分一并写进去)+ 生成封面
      let bookId = null
      let coverPath = null
      const lib = libraryForPath(dest)
      if (lib) {
        try {
          const model = await modelForLibrary(lib.id)
          bookId = nanoid()
          const tags = (rec.tags && typeof rec.tags === 'object' && Object.keys(rec.tags).length) ? rec.tags : {}
          const pageCount = rec.total || countFolderImages(dest) || null
          await model.create({
            id: bookId,
            title: rec.title || path.basename(dest),
            title_jpn: rec.titleJpn || '',
            coverPath: null,
            hash: null,
            filepath: toExternalPath(dest, 'filepath', lib),
            type: 'folder',
            pageCount,
            filecount: pageCount,
            bundleSize: null,
            mtime: new Date().toJSON(),
            coverHash: null,
            status: tags && Object.keys(tags).length ? 'tagged' : 'non-tag',
            exist: true,
            date: Date.now(),
            category: rec.category || '',
            url: rec.url || '',
            rating: Number(rec.rating) || 0,
            tags
          })
          // 记住这本书属于哪个库:后续「按 id 找模型」才不会落到活动库头上
          bookLibraryById.set(bookId, lib.id)
          try {
            const coverDir = coverDirOf(lib)
            fs.mkdirSync(coverDir, { recursive: true })
            const cover = await generateCoverByName({ id: bookId, filepath: dest, type: 'folder', libraryId: lib.id }, coverDir)
            if (cover) {
              // ⚠ 直接写回**目标库的 model**:updateBookCoverPath 走的是 modelForBookId,
              //   它靠内存里的 bookLibraryById 找库,新书还没登记过就可能写错库
              const extCover = toExternalPath(cover, 'coverPath', null, coverDir)
              await model.update({ coverPath: extCover }, { where: { id: bookId } })
              coverPath = extCover
            }
          } catch (e2) { /* 封面生成失败不影响移动 */ }
        } catch (e3) {
          sendMessageToWebContents('移动到库内登记失败:' + ((e3 && e3.message) || e3))
        }
      }
      // 记录:标记已移走,dir 指到新位置(预览还能用)
      rec.movedTo = dest
      rec.dir = dest
      // 「移动完成后移除记录」(设置项):移进本地库了,下载记录就没必要再留着
      if (removeAfterMove) {
        downloadTasks.delete(id)
        persistDownloads()
        emitToRenderer('eh-download-removed', { id })
      } else {
        persistDownloads()
        emitToRenderer('eh-download-progress', publicDownload(rec))
      }
      results.push({ id, ok: true, dest, bookId, coverPath, inLibrary: !!lib, removed: removeAfterMove })
    } catch (e) {
      results.push({ id, ok: false, error: String((e && e.message) || e) })
    }
  }
  return { ok: true, results }
}

ipcMain.handle('move-downloads', async (event, arg) => {
  const ids = Array.isArray(arg && arg.ids) ? arg.ids : []
  if (!ids.length) return { ok: false, error: 'noIds' }
  if (!(arg && arg.target)) return { ok: false, error: 'noTarget' }
  return runMoveDownloads(ids, arg.target, { removeAfterMove: arg.removeAfterMove })
})

// 下载收尾后的自动动作(设置 → 下载设置):
//   downloadAutoMoveEnabled + downloadAutoMovePath   → 下完自动移到这个文件夹
//   downloadRemoveAfterMove                          → 移动成功后顺手把记录也删掉
// 只在「真正下完」时动;失败/暂停的任务不动,免得把一个缺页的目录移进书库。
const onDownloadFinished = (rec) => {
  try {
    if (!rec || rec.status !== 'done') return
    if (!rec.dir || rec.movedTo) return
    if (!setting.downloadAutoMoveEnabled) return
    const target = String(setting.downloadAutoMovePath || '').trim()
    if (!target) return
    // 异步执行,不阻塞下载任务收尾
    setTimeout(() => {
      runMoveDownloads([rec.id], target, { removeAfterMove: false })
        .then(r => {
          const one = (r.results || [])[0]
          if (one && one.ok) sendMessageToWebContents('已自动移动到:' + one.dest)
          else if (one && !one.ok) sendMessageToWebContents('自动移动失败:' + one.error)
        })
        .catch(e => sendMessageToWebContents('自动移动失败:' + ((e && e.message) || e)))
    }, 500)
  } catch (e) { /* 定时器里别抛 */ }
}

if (!WEB_MODE) {
  // arg = { username, password }(可选):给了就自动填表提交,不给就等用户在窗口里自己登录。
  // 为什么要走窗口而不是直接 POST 账号密码:EH 论坛现在有两层 Cloudflare ——
  // ①整页的人机挑战(裸 HTTP 请求一律 403 "Just a moment...");②登录表单上的 Turnstile 验证码。
  // 真浏览器窗口两样都能自动过(实测:窗口里提交后 Cloudflare 自己出 token,登录成功),
  // 所以桌面端一律用窗口;纯 HTTP 那条(eh-password-login)只在网页版兜底。
  ipcMain.handle('eh-login', async (event, arg) => {
    const { username, password } = arg || {}
    if (ehLoginInFlight) return { ok: false, error: 'busy' }
    ehLoginInFlight = true
    let win = null
    try {
      const ses = session.fromPartition(EH_LOGIN_PARTITION)
      // 每次登录都从干净分区开始,避免上一次的登录态让"重新登录"直接跳过
      try { await ses.clearStorageData() } catch (e) { /* 忽略 */ }
      const parent = BrowserWindow.getAllWindows()[0]
      win = new BrowserWindow({
        width: 920,
        height: 780,
        title: '登录 E-Hentai / ExHentai',
        parent: parent || undefined,
        autoHideMenuBar: true,
        webPreferences: {
          partition: EH_LOGIN_PARTITION,
          nodeIntegration: false,
          contextIsolation: true
        }
      })
      let closed = false
      win.on('closed', () => { closed = true })
      const winRef = win
      // 登录后先从窗口页面里读用户名:论坛页会显示「Logged in as: xxx」。
      // 不能只靠 showuser 接口 —— 论坛挂在 Cloudflare 后面,接口请求会被 403 挑战挡掉(实测)。
      const readUserNameFromWindow = async () => {
        try {
          return await winRef.webContents.executeJavaScript(`(() => {
            const el = document.querySelector('.home > b > a')
            const text = document.body ? document.body.innerText : ''
            const m = /Logged in as[:\\s]*([^\\n(]+)/i.exec(text)
            return ((el && el.textContent) ? el.textContent.trim() : '') || (m ? m[1].trim() : '')
          })()`)
        } catch (e) {
          return ''
        }
      }
      const result = await new Promise((resolve) => {
        const deadline = Date.now() + 5 * 60 * 1000
        let exRequestedAt = 0
        let windowUserName = ''
        let done = false
        const finish = (payload) => { if (done) return; done = true; resolve(payload) }
        const tick = async () => {
          if (done) return
          if (closed) return finish({ ok: false, error: 'canceled' })
          if (Date.now() > deadline) return finish({ ok: false, error: 'timeout' })
          const cookies = await ehCookieMapOf(ses)
          if (cookies.ipb_member_id && cookies.ipb_pass_hash) {
            if (!exRequestedAt) {
              // 先趁着还在论坛页把用户名读出来(下面就要离开这一页了)
              windowUserName = await readUserNameFromWindow()
              // 已登录:再访问一次 EX,让服务端下发 igneous(取不到也不影响登录成功)
              exRequestedAt = Date.now()
              try { winRef.loadURL(EH_EX_URL) } catch (e) { /* 忽略:取 igneous 是加分项 */ }
            } else if (Date.now() - exRequestedAt > 3000) {
              const picked = {}
              for (const name of ehLogin.EH_COOKIE_NAMES) picked[name] = cookies[name] || ''
              const user = windowUserName || await ehLogin.fetchUserName(picked.ipb_member_id, picked, { proxy: setting.proxy })
              return finish({ ok: true, cookies: picked, user })
            }
          }
          setTimeout(tick, 1500)
        }
        winRef.loadURL(EH_LOGIN_URL).catch(() => { /* 网络失败:交给轮询/超时 */ })
        // 自动填表(给了账号密码时):等 Cloudflare 整页挑战过去、**并且 Turnstile 出了 token** 之后再提交。
        // 时序是实测跑通的时序:表单已出现但 Turnstile 还没出 token 就提交,会被回一句
        // 「The captcha was not entered correctly」。
        const autoFill = async () => {
          if (!username || !password) return
          for (let i = 0; i < 60 && !done && !closed; i++) {
            await new Promise(r => setTimeout(r, 1500))
            let state = null
            try {
              state = await winRef.webContents.executeJavaScript(`(() => {
                const u = document.querySelector('#UserName') || document.querySelector('input[name=UserName]')
                const p = document.querySelector('#PassWord') || document.querySelector('input[name=PassWord]')
                const t = document.querySelector('[name="cf-turnstile-response"]')
                return { form: !!(u && p), token: t ? String(t.value || '').length : -1, filled: !!(u && u.value) }
              })()`)
            } catch (e) { continue }
            if (!state || !state.form) continue
            if (state.filled) return          // 用户自己已经在填了,别插手
            if (state.token === 0) continue   // 还没出 Turnstile token:再等
            try {
              await winRef.webContents.executeJavaScript(`(() => {
                const u = document.querySelector('#UserName') || document.querySelector('input[name=UserName]')
                const p = document.querySelector('#PassWord') || document.querySelector('input[name=PassWord]')
                u.value = ${JSON.stringify(username)}
                p.value = ${JSON.stringify(password)}
                u.dispatchEvent(new Event('input', { bubbles: true }))
                p.dispatchEvent(new Event('input', { bubbles: true }))
                const f = Array.from(document.forms).find(f => f.querySelector('[name=UserName]'))
                if (!f) return 'no-form'
                const btn = f.querySelector('input[type=submit], button[type=submit], #ipb_login_submit')
                if (btn) { btn.click(); return 'clicked' }
                f.submit(); return 'submitted'
              })()`)
            } catch (e) { /* 忽略:填不进去就交给用户手动登录 */ }
            return
          }
        }
        autoFill()
        setTimeout(tick, 1500)
      })
      try { if (!win.isDestroyed()) win.destroy() } catch (e) { /* 忽略 */ }
      win = null
      return result
    } catch (e) {
      try { if (win && !win.isDestroyed()) win.destroy() } catch (err) { /* 忽略 */ }
      return { ok: false, error: String((e && e.message) || e) }
    } finally {
      ehLoginInFlight = false
    }
  })

  // 退出登录:清掉登录窗口分区里的 Cookie(设置里的四项由前端清空并保存)
  ipcMain.handle('eh-logout', async () => {
    try {
      const ses = session.fromPartition(EH_LOGIN_PARTITION)
      await ses.clearStorageData()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) }
    }
  })
}

ipcMain.handle('save-book', async (event, book) => {
  return await saveBookToDatabase(book)
})

// home
ipcMain.handle('get-folder-tree', async (event, filePathList) => {
  // 每个路径按「它所属的那个库」的根目录来切 —— 合并显示不同库时根深度可能不一样
  const folderList = [...new Set(filePathList.map(filepath => path.dirname(filepath)))]
  const bookPathSplitList = folderList.sort().map(fp => {
    const root = (libraryForPath(fp) || libraryForPath(path.dirname(fp)) || { path: setting.library }).path
    const rootDepth = String(root || '').split(path.sep).length - 1
    return fp.split(path.sep).slice(rootDepth)
  })
  const folderTreeObject = {}
  for (const folders of bookPathSplitList) {
    _.set(folderTreeObject, folders.map(f => '_' + f), {})
  }
  const resolveTree = (preRoot, tree, initFolder) => {
    _.forIn(tree, (node, label) => {
      const trueLabel = label.slice(1)
      if (_.isEmpty(node)) {
        preRoot.push({
          label: trueLabel,
          value: trueLabel,
          folderPath: [...initFolder, trueLabel].slice(1).join(path.sep),
        })
      } else {
        preRoot.push({
          label: trueLabel,
          value: trueLabel,
          folderPath: [...initFolder, trueLabel].slice(1).join(path.sep),
          children: resolveTree([], node, [...initFolder, trueLabel]),
        })
      }
    })
    return preRoot
  }
  return resolveTree([], folderTreeObject, [])
})

ipcMain.handle('load-collection-list', async (event, arg) => {
  return collectionList
})

ipcMain.handle('save-collection-list', async (event, list) => {
  collectionList = list
  const targetPath = path.join(STORE_PATH, 'collectionList.json')
  const tempPath = path.join(STORE_PATH, 'collectionList.json.tmp')
  await fs.promises.writeFile(tempPath, JSON.stringify(list, null, '  '), { encoding: 'utf-8' })
  return await fs.promises.rename(tempPath, targetPath)
})

// ---------- 合集自动识别(按名字与文件夹结构归组) ----------
// 算法本体在 modules/collectionAuto.js(纯函数、零磁盘 IO、可单测)。
// 这里只做 IPC 包装。要点(两位评审方案的合并结论):
//   · 结构信号(同容器目录 / 标题主干 / 卷号连续)权重最高
//   · parody 是强语义信号;artist 单列「作者专辑」
//   · 一卷一个文件夹与系列一个文件夹都要能认(取父目录做容器)
//   · libraryId 硬隔离,绝不跨库合并
ipcMain.handle('suggest-collections', async (event, books) => {
  try {
    const suggestions = collectionAuto.buildPlan(books, { threshold: 0.55 })
    return { ok: true, suggestions }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), suggestions: [] }
  }
})

// detail
ipcMain.handle('open-url', async (event, url) => {
  if (WEB_MODE) return
  shell.openExternal(url)
})

ipcMain.handle('show-file', async (event, filepath) => {
  if (WEB_MODE) return
  shell.showItemInFolder(filepath)
})

// 打开一个目录(下载文件夹等)。网页版跑在服务器上,打开服务器目录对用户没意义 → 返回失败
ipcMain.handle('open-path', async (event, target) => {
  if (WEB_MODE) return { ok: false, error: 'webMode' }
  try {
    const err = await shell.openPath(String(target || ''))
    return err ? { ok: false, error: err } : { ok: true }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})

ipcMain.handle('use-new-cover', async (event, filepath) => {
  const copyTempCoverPath = path.join(TEMP_PATH, nanoid(8) + path.extname(filepath))
  const coverPath = path.join(CURRENT_COVER_DIR, nanoid() + path.extname(filepath))
  try {
    await fs.promises.copyFile(filepath, copyTempCoverPath)
    await sharp(copyTempCoverPath, { failOnError: false })
    .resize(500, 707, {
      fit: 'contain',
      background: '#303133'
    })
    .toFile(coverPath)
    return coverPath
  } catch (e) {
    sendMessageToWebContents(`从 ${filepath} 生成封面失败:${e}`)
  }
})

ipcMain.handle('open-local-book', async (event, filepath) => {
  if (WEB_MODE) return
  if (setting.imageExplorer) {
    exec(`${setting.imageExplorer} "${filepath}"`)
  } else {
    shell.openPath(filepath)
  }
})

ipcMain.handle('get-default-manga-reader', async (event, arg) => {
  return _mange_reader
})

// ---------- 回收站(软删除) ----------
// 历史问题:delete-local-book 在 Linux 上 shell.trashItem 必然失败(容器里没有 gio trash),
// 于是逐张图退化成 fs.rm -rf —— 永久删除、不留日志、无法恢复(用户已因此误删过漫画)。
// 现在统一改为「移动到 <数据目录>/.trash/<时间戳>--<名字>」:
//   · 同一磁盘内 rename,瞬间完成、不额外占空间;跨盘(Windows 库在 Y: 而数据在 C:)自动降级为复制后删除;
//   · 每次删除都写 delete-log.jsonl 与 .trash/index.json,事后可查可还原;
//   · 整本目录/压缩包与**单张图片**都走这里(单张图片曾用 shell.trashItem,Linux 上同样必然失败);
//   · database.sqlite 的行会被移除,但 metadata.sqlite / 封面 / 缩略图 / 扫描快照一律保留,
//     只有「清空回收站」才真正清理它们 —— 这样恢复时元数据还在。
const TRASH_DIR = path.join(STORE_PATH, '.trash')
const TRASH_INDEX = path.join(TRASH_DIR, 'index.json')
// 旧版的全局删除记录:仍然读它(兼容),但新记录按库写进各自的数据目录
const LEGACY_DELETE_LOG = path.join(STORE_PATH, 'delete-log.jsonl')
// 按路径判断它属于哪个库(路径前缀最长匹配)——「每个操作都对应相应的库」的基础
const libraryForPath = (p) => {
  // 只在本端路径上做前缀匹配(投影后 path 就是本端值)
  const list = runtimeLibs().filter(l => isLibraryActive(l, IS_WEB_ENV))
  const s = String(p || '')
  if (!s) return null
  return list.filter(l => s.startsWith(l.path)).sort((a, b) => b.path.length - a.path.length)[0] || null
}

const readTrashIndex = async () => {
  try {
    const raw = await fs.promises.readFile(TRASH_INDEX, 'utf8')
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    return []
  }
}
const writeTrashIndex = async (list) => {
  await fs.promises.mkdir(TRASH_DIR, { recursive: true })
  await fs.promises.writeFile(TRASH_INDEX, JSON.stringify(list, null, 2), 'utf8')
}
// 追加一条删除日志(JSON Lines,不会被运行日志轮转清掉)
const appendDeleteLog = async (entry) => {
  try {
    // 写到「这条记录所属库」的目录里,并带上库名(回收站界面要显示属于哪个库)
    const lib = (entry && entry.libraryId ? (setting.libraries || []).find(l => l.id === entry.libraryId) : null)
      || libraryForPath(entry && (entry.src || entry.from))
    const line = { ...entry, libraryId: lib ? lib.id : undefined, libraryName: lib ? lib.name : undefined }
    const file = lib ? libraryRuntimePaths(STORE_PATH, lib).deleteLogFile : LEGACY_DELETE_LOG
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    await fs.promises.appendFile(file, JSON.stringify(line) + '\n', 'utf8')
  } catch (e) { /* 日志失败不影响删除本身 */ }
}
// 把路径移入回收站:同盘 rename,跨盘复制后删除
const movePathToTrash = async (srcPath, meta = {}, options = {}) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const name = path.basename(srcPath)
  let dest
  if (options.inPlace) {
    // 原地改名:文件不动地方(不跨盘、不占额外空间),只换成一个不会被扫描的名字 ——
    // 数据库/扫描快照里没有它、界面上也看不到;从回收站恢复就是改回原名
    dest = path.join(path.dirname(srcPath), '.' + name + '.deleted-' + stamp)
    let k = 1
    while (fs.existsSync(dest)) dest = path.join(path.dirname(srcPath), '.' + name + '.deleted-' + stamp + '(' + (++k) + ')')
  } else {
    await fs.promises.mkdir(TRASH_DIR, { recursive: true })
    dest = path.join(TRASH_DIR, stamp + '--' + name)
    let n = 1
    while (fs.existsSync(dest)) dest = path.join(TRASH_DIR, stamp + '--' + name + '(' + (++n) + ')')
  }
  let mode = options.inPlace ? 'rename-in-place' : 'move'
  if (options.keepOriginal) {
    // 压缩包这类「原地重写」的文件:只能留一份备份,原件必须留在原处
    mode = 'copy'
    await fs.promises.cp(srcPath, dest, { recursive: true, force: true })
  } else {
    try {
      await fs.promises.rename(srcPath, dest)
    } catch (e) {
      if (e && e.code === 'EXDEV') {
        mode = 'copy'
        await fs.promises.cp(srcPath, dest, { recursive: true, force: true })
        await fs.promises.rm(srcPath, { recursive: true, force: true })
      } else {
        throw e
      }
    }
  }
  const entry = {
    id: stamp + '--' + name,
    deletedAt: Date.now(),
    deletedAtText: new Date().toLocaleString(),
    src: srcPath,
    dest,
    mode,
    ok: true,
    ...meta,
  }
  const list = await readTrashIndex()
  list.unshift(entry)
  await writeTrashIndex(list)
  await appendDeleteLog(entry)
  return entry
}

ipcMain.handle('delete-local-book', async (event, filepath) => {
  const result = { ok: false, trashed: false, src: filepath }
  const ownerLibrary = libraryForPath(filepath)
  if (!filepath || !ownerLibrary) {
    result.error = '路径不在任何已生效的漫画库内,已拒绝'
    await appendDeleteLog({ deletedAt: Date.now(), deletedAtText: new Date().toLocaleString(), src: filepath, ok: false, error: result.error })
    return result
  }
  let info = {}
  // 库里存的是「相对库根的相对路径」,按本端路径查库要先换算成库里那种形式
  const dbPath = toExternalPath(filepath, 'filepath', ownerLibrary)
  try {
    const row = (await findBookAcrossLibraries({ filepath: dbPath })).row
    if (row) info = { id: row.id, title: row.title, title_jpn: row.title_jpn, tags: row.tags, libraryId: ownerLibrary.id, libraryName: ownerLibrary.name }
    else info = { libraryId: ownerLibrary.id, libraryName: ownerLibrary.name }
  } catch (e) { /* 拿不到不影响删除 */ }
  try {
    const stats = await fs.promises.stat(filepath)
    if (stats.isDirectory() || stats.isFile()) {
      // 整本(或压缩包)一次性移入回收站:不再逐张图操作,既快又不会删一半留一半
      await movePathToTrash(filepath, info, { inPlace: true })
      result.trashed = true
    } else {
      result.error = '不支持的路径类型'
    }
  } catch (e) {
    result.error = String((e && e.message) || e)
    await appendDeleteLog({ deletedAt: Date.now(), deletedAtText: new Date().toLocaleString(), src: filepath, ok: false, error: result.error, ...info })
    sendMessageToWebContents('删除 ' + filepath + ' 失败:' + result.error)
    return result
  }
  try { await (await findBookAcrossLibraries({ filepath: dbPath })).model.destroy({ where: { filepath: dbPath } }) } catch (e) { /* 忽略 */ }
  result.ok = true
  sendMessageToWebContents('已移入回收站:' + (info.title || path.basename(filepath)) + '(可在 设置 → 常用 → 回收站 里恢复)')
  return result
})

// 列出回收站
// 封面像素化:主进程用 nativeImage 直接降采样
// (渲染端 canvas 处理 file:// 图片会被跨域拦成「污染的画布」,toDataURL 会抛错)
ipcMain.handle('pixelate-cover', async (event, target, width) => {
  try {
    let p = String(target || '')
    if (!p) return null
    if (/^file:\/\//i.test(p)) {
      try { p = decodeURIComponent(p.replace(/^file:\/\//i, '')) } catch (e) { p = p.replace(/^file:\/\//i, '') }
    }
    if (/^https?:/i.test(p)) return null // 远程 URL 交回渲染端处理
    const w = Math.max(8, Math.min(512, Math.round(Number(width) || 56)))
    const img = nativeImage.createFromPath(p)
    if (img.isEmpty()) return null
    const size = img.getSize()
    if (!size.width || !size.height) return null
    const h = Math.max(8, Math.round((size.height / size.width) * w))
    return img.resize({ width: w, height: h, quality: 'good' }).toDataURL()
  } catch (e) { return null }
})

ipcMain.handle('trash-list', async () => {
  const list = await readTrashIndex()
  const out = []
  for (const item of list) {
    let exists = false
    let fileCount = 0
    try {
      const st = await fs.promises.stat(item.dest)
      exists = true
      if (st.isDirectory()) fileCount = (await fs.promises.readdir(item.dest)).length
      else if (st.isFile()) fileCount = 1
    } catch (e) { exists = false }
    out.push({ ...item, exists, fileCount })
  }
  return { ok: true, list: out, trashDir: TRASH_DIR, logFile: LEGACY_DELETE_LOG }
})

// 从回收站还原(优先还原回原路径;原路径已被占用则报错,不覆盖)
ipcMain.handle('trash-restore', async (event, id) => {
  const list = await readTrashIndex()
  const item = list.find(x => x.id === id)
  if (!item) return { ok: false, error: '回收站里没有这条记录' }
  try {
    if (fs.existsSync(item.src)) {
      if (!item.overwriteOnRestore) return { ok: false, error: '原路径已存在同名文件,请先改名或移动:' + item.src }
      // 压缩包备份:原文件必然还在(只是被 7z 改写过),按用户确认覆盖还原
      await fs.promises.rm(item.src, { recursive: true, force: true })
    }
    await fs.promises.mkdir(path.dirname(item.src), { recursive: true })
    let mode = 'move'
    try {
      await fs.promises.rename(item.dest, item.src)
    } catch (e) {
      if (e && e.code === 'EXDEV') {
        mode = 'copy'
        await fs.promises.cp(item.dest, item.src, { recursive: true, force: true })
        await fs.promises.rm(item.dest, { recursive: true, force: true })
      } else throw e
    }
    await writeTrashIndex(list.filter(x => x.id !== id))
    await appendDeleteLog({ restoredAt: Date.now(), restoredAtText: new Date().toLocaleString(), src: item.src, from: item.dest, mode, ok: true, action: 'restore' })
    return { ok: true, path: item.src }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})

// 清空回收站(传 id 只清一条;不传则全清)
ipcMain.handle('trash-purge', async (event, id) => {
  const list = await readTrashIndex()
  const targets = id ? list.filter(x => x.id === id) : list.slice()
  let removed = 0
  const failed = []
  for (const item of targets) {
    try {
      await fs.promises.rm(item.dest, { recursive: true, force: true })
      removed++
      await appendDeleteLog({ purgedAt: Date.now(), purgedAtText: new Date().toLocaleString(), src: item.src, from: item.dest, ok: true, action: 'purge' })
    } catch (e) {
      failed.push({ id: item.id, error: String((e && e.message) || e) })
    }
  }
  const keep = id ? list.filter(x => !targets.includes(x)) : []
  await writeTrashIndex(keep)
  return { ok: true, removed, failed }
})

// 读取删除记录(最多最近 200 条,倒序)—— 用户抱怨过「删了没日志」,这里把 delete-log.jsonl 直接摆到界面上
ipcMain.handle('trash-log', async () => {
  // 每个库各有一份删除记录:全部读出来合并,按时间倒序,界面上标出属于哪个库
  const files = (setting.libraries || []).filter(isLibraryActive).map(l => libraryRuntimePaths(STORE_PATH, l).deleteLogFile)
  files.push(LEGACY_DELETE_LOG)
  const out = []
  for (const file of files) {
    try {
      const st = await fs.promises.stat(file)
      const start = Math.max(0, st.size - 2 * 1024 * 1024) // 单份日志最多只读最后 2MB
      const fh = await fs.promises.open(file, 'r')
      const buf = Buffer.alloc(st.size - start)
      await fh.read(buf, 0, buf.length, start)
      await fh.close()
      for (const line of buf.toString('utf8').split('\n').filter(Boolean).slice(-200)) {
        try { out.push(JSON.parse(line)) } catch (e) { /* 跳过坏行 */ }
      }
    } catch (e) { /* 还没有日志文件 */ }
  }
  out.sort((a, b) => Number(b.deletedAt || b.restoredAt || b.purgedAt || 0) - Number(a.deletedAt || a.restoredAt || a.purgedAt || 0))
  return { ok: true, list: out.slice(0, 200), logFile: LEGACY_DELETE_LOG }
})

ipcMain.handle('move-local-book', async (event, oldPath, folderArr) => {
  try {
    const pathSep = require('path').sep
    const folderPath = Array.isArray(folderArr) && folderArr.length > 0 ? folderArr.join(pathSep) : ''
    const ownerRoot = (libraryForPath(oldPath) || { path: setting.library }).path
    const newFilePath = path.join(path.dirname(ownerRoot), folderPath, path.basename(oldPath))
    if (oldPath !== newFilePath) {
      await fs.promises.rename(oldPath, newFilePath)
      sendMessageToWebContents(`已将 ${oldPath} 移动到 ${newFilePath}`)
      return newFilePath
    } else {
      sendMessageToWebContents(`移动 ${oldPath} 失败:新路径与旧路径相同`)
      return false
    }
  } catch (e) {
    sendMessageToWebContents(`移动 ${oldPath} 失败:${e}`)
    return false
  }
})

// ---------- 阅读器图片准备(viewer) ----------
// 1.11.0 性能重构要点:
//  ① 原图优先:主循环只做 metadata 与必要的宽度缩放,缩略图**不在循环里发射** ——
//     旧写法 `(async () => {...})()` 会把几百个缩略图任务瞬间压进 libvips 线程池,
//     使循环里 0.4ms 的 metadata() 排队到 22ms(实测慢 53.8 倍);
//  ② 缩略图改为「前端按需请求 + 后台限流 + 持久缓存」:不开侧栏就不生成,重复打开直接命中缓存;
//  ③ token 取消:切书/关阅读器后旧循环立即 break,不再空转,也不再多写无用文件;
//  ④ 临时目录改惰性清理(只删 24h 前的文件),不再每次打开全量删除几千个小文件。
const VIEWCACHE_PATH = LIBRARY_VIEWCACHE_DIR
// 临时文件保留窗口:超过这个时间的 viewer/ 产物会在下次打开阅读器时被清掉。
// 30 分钟足够长(不会误删正在阅读的图),又不会像原来的「每次全量删除」那样引发磁盘风暴,
// 也不会像 24 小时那样让临时目录持续膨胀。
const VIEW_TMP_MAX_AGE = 30 * 60 * 1000

// 并发限制器(不引入新依赖)
const pLimit = (max) => {
  let active = 0
  const queue = []
  const pump = () => {
    if (active >= max || !queue.length) return
    active++
    const job = queue.shift()
    job.fn().then(job.resolve, job.reject).finally(() => { active--; pump() })
  }
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); pump() })
}

// 缓存文件名:源路径 + 源文件大小/mtime + 目标宽度 决定内容 —— 内容没变就直接复用
const cacheFileOf = (tag, src, width) => {
  let sig = '0'
  try {
    const st = fs.statSync(src)
    sig = st.size + '_' + Math.floor(st.mtimeMs)
  } catch (e) { /* 读不到就退化为无签名 */ }
  const hash = createHash('md5').update(tag + '|' + src + '|' + sig + '|' + width).digest('hex').slice(0, 20)
  return path.join(VIEWCACHE_PATH, tag + '_' + hash + '.jpg')
}

// 惰性清理 viewer 临时目录(替代原来的全量 clearFolder)
const cleanupViewerTemp = async () => {
  try {
    const names = await fs.promises.readdir(VIEWER_PATH)
    const now = Date.now()
    let removed = 0
    for (const name of names) {
      const p = path.join(VIEWER_PATH, name)
      try {
        const st = await fs.promises.stat(p)
        if (now - st.mtimeMs < VIEW_TMP_MAX_AGE) continue
        if (st.isDirectory()) await fs.promises.rm(p, { recursive: true, force: true })
        else await fs.promises.rm(p, { force: true })
        removed++
      } catch (e) { /* 单个失败不影响其它 */ }
    }
    if (removed) console.log(`[viewer] 清理过期临时文件 ${removed} 个`)
  } catch (e) { /* 目录不存在等:忽略 */ }
}

// 缓存体积控制:文件数超上限时按 mtime 删掉最旧的 20%
const trimViewCache = async (maxFiles = 8000) => {
  try {
    const names = await fs.promises.readdir(VIEWCACHE_PATH)
    if (names.length <= maxFiles) return
    const stats = []
    for (const name of names) {
      const p = path.join(VIEWCACHE_PATH, name)
      try { stats.push({ p, mtime: (await fs.promises.stat(p)).mtimeMs }) } catch (e) {}
    }
    stats.sort((a, b) => a.mtime - b.mtime)
    const drop = stats.slice(0, Math.max(1, Math.floor(stats.length * 0.2)))
    for (const item of drop) await fs.promises.rm(item.p, { force: true }).catch(() => {})
    console.log(`[viewer] 缩略图缓存瘦身:删除 ${drop.length} 个旧文件`)
  } catch (e) { /* 目录不存在等:忽略 */ }
}

// 宽度上限:用户显式设置就尊重(0=不限制);未设置时 ——
//   本地直读默认不缩放(浏览器显示时本来就会缩,主进程重编码纯属浪费:
//   实测 3000 宽页缩到 2560 要 199ms/张,300 页就是 60 秒);
//   仅网页版/远程桌面模式按屏幕宽度限制 —— 那里省的是网络传输。
const resolveWidthLimit = () => {
  if (_.isNumber(setting.widthLimit)) return Math.ceil(setting.widthLimit)
  return (WEB_MODE || !!setting.remoteServer) ? screenWidth : 0
}

// 当前阅读会话 + 缩略图后台队列
let viewerToken = 0
let viewerSession = null
let thumbQueueRunning = false
const thumbLimit = pLimit(3)

const runThumbnailQueue = async (token) => {
  const session = viewerSession
  if (!session || session.token !== token || thumbQueueRunning) return
  thumbQueueRunning = true
  try {
    while (session.thumbCursor < session.thumbTodo.length) {
      if (session.token !== viewerToken) return
      const job = session.thumbTodo[session.thumbCursor++]
      await thumbLimit(async () => {
        if (session.token !== viewerToken) return
        let thumbnailPath = job.src
        if (path.extname(job.src).toLowerCase() !== '.gif') {
          thumbnailPath = cacheFileOf('thumb', job.src, job.width)
          if (!fs.existsSync(thumbnailPath)) {
            try {
              await fs.promises.mkdir(VIEWCACHE_PATH, { recursive: true })
              await sharp(job.src, { failOnError: false })
                .resize({ width: job.width })
                .jpeg({ quality: 80 })
                .toFile(thumbnailPath)
            } catch (e) { return }
          }
        }
        if (session.token !== viewerToken) return
        const sendToRenderer = (channel, arg) => {
          if (WEB_MODE) require('./web-electron-shim.js').broadcast(channel, arg)
          else mainWindow.webContents.send(channel, arg)
        }
        sendToRenderer('manga-thumbnail-image', {
          id: job.id,
          thumbId: `thumb_${job.id}`,
          index: job.index,
          relativePath: job.relativePath,
          filepath: job.src,
          thumbnailPath,
          total: job.total,
        })
      })
    }
  } finally {
    thumbQueueRunning = false
  }
}

// 前端在「打开缩略图侧栏 / 切到缩略图视图」时请求生成缩略图;
// 不请求就完全不生成 —— 不开侧栏的用户零额外开销。
ipcMain.handle('request-thumbnails', async (event, bookId) => {
  const session = viewerSession
  if (!session || session.bookId !== bookId) return { ok: false, error: '当前阅读的不是这本书' }
  session.thumbWanted = true
  if (!session.loading) runThumbnailQueue(session.token)
  return { ok: true, total: session.thumbTodo.length }
})

// viewer
// 取小说正文(txt / 纯文字 epub 的「文字模式」阅读用)
// 有图的内容依然走 load-manga-image-list,这里只负责纯文字
// 取小说内容(文字阅读模式用):返回「内容块」序列,插图留在它原本的位置上
//   { kind:'chapter', title } / { kind:'text', text } / { kind:'image', absolutePath }
ipcMain.handle('load-novel-content', async (event, book) => {
  try {
    const filepath = translateBookPath(book && book.filepath, 'filepath', libForBook(book))
    if (!filepath) return { ok: false, error: '没有文件路径' }
    if (book.type === 'novel') {
      const { blocks, chapters } = await parseTxtStructured(filepath)
      const charCount = blocks.reduce((n, b) => n + (b.kind === 'text' ? String(b.text).replace(/\s/g, '').length : 0), 0)
      return { ok: true, blocks, chapters, charCount, kind: 'novel' }
    }
    if (book.type === 'epub') {
      // 插图解压到本次阅读的临时目录(和图片阅读器一样的 viewer 目录,前端用 /api/file 取)
      const dumpDir = path.join(VIEWER_PATH, 'novel_' + nanoid(8))
      const { blocks, chapters } = await parseEpubStructured(filepath, dumpDir)
      // 插图给前端一个能直接用的地址:网页版走 /api/file(带鉴权),桌面版直接用本地路径
      const toImgUrl = (p) => WEB_MODE ? ('/api/file?path=' + encodeURIComponent(String(p)) + '&id=' + nanoid(6)) : String(p)
      for (const b of blocks) if (b.kind === 'image' && b.absolutePath) b.url = toImgUrl(b.absolutePath)
      const charCount = blocks.reduce((n, b) => n + (b.kind === 'text' ? String(b.text).replace(/\s/g, '').length : 0), 0)
      return { ok: true, blocks, chapters, charCount, kind: 'epub' }
    }
    return { ok: false, error: '这本书不是文字类型' }
  } catch (e) {
    console.error('读取小说失败:', e)
    return { ok: false, error: String((e && e.message) || e) }
  }
})
ipcMain.handle('load-manga-image-list', async (event, book) => {
  // 后台清理(不 await):清掉上一本书遗留的临时文件,同时不拖慢本次打开
  cleanupViewerTemp()
  trimViewCache()

  const { filepath, type, id: bookId } = book
  const list = await getImageListByBook(filepath, type)
  // 纯文字内容(txt / 没有图片的 epub):没有"图片页"可读,
  // 直接告诉前端「走文字模式」,不要让它空等一串永远不会来的图片消息。
  if (!list.length && (type === 'epub' || type === 'novel')) {
    sendImageLock = false
    return { ok: true, textOnly: true, total: 0 }
  }

  const token = ++viewerToken
  sendImageLock = true
  const session = viewerSession = {
    token,
    bookId,
    list,
    thumbTodo: [],
    thumbCursor: 0,
    loading: true,
    thumbWanted: false,
  }
  ;(async () => {
    // 384 is the default 4K screen width divided by the default number of thumbnail columns
    const thumbnailWidth = _.isFinite(screenWidth / setting.thumbnailColumn) ? Math.floor(screenWidth / setting.thumbnailColumn) : 384
    const widthLimit = resolveWidthLimit()
    // 缩略图只在非 comicread 模式登记(ComicRead 自带网格视图,不需要这批缩略图)
    const wantThumb = setting.viewerType !== 'comicread'
    const sendToRenderer = (channel, arg) => {
      if (WEB_MODE) {
        require('./web-electron-shim.js').broadcast(channel, arg)
      } else {
        mainWindow.webContents.send(channel, arg)
      }
    }
    // 单张图片的准备(改名副本 → 读尺寸 → 超宽缩放);任何一步失败都退回原图信息,
    // 保证前端一定能收到这一张,不会因为一张坏图中断整条流水线。
    const prepareOne = async (index) => {
      const item = list[index - 1]
      const srcFilepath = item.absolutePath
      let imageFilepath = srcFilepath
      const extname = path.extname(imageFilepath)
      try {
        // 仅当路径含 %/#(URL 解析风险)时才复制改名;folder 型直接读源文件,避免每次阅读复制几百 MB
        if (imageFilepath.search(/[%#]/) >= 0) {
          const newFilepath = path.join(VIEWER_PATH, `rename_${nanoid(8)}${extname}`)
          await fs.promises.copyFile(imageFilepath, newFilepath)
          imageFilepath = newFilepath
        }
        const meta = await sharp(imageFilepath, { failOnError: false }).metadata()
        let width = meta.width || 1000
        let height = meta.height || 1400
        if (widthLimit !== 0 && width > widthLimit && extname.toLowerCase() !== '.gif') {
          height = Math.floor(height * (widthLimit / width))
          width = widthLimit
          // 缩放结果走持久缓存:同一张图 + 同一目标宽度只算一次(缓存键用原始文件,不受改名副本影响)
          const resizedFilepath = cacheFileOf('rsz', srcFilepath, widthLimit)
          if (!fs.existsSync(resizedFilepath)) {
            try {
              await fs.promises.mkdir(VIEWCACHE_PATH, { recursive: true })
              await sharp(imageFilepath, { failOnError: false })
                .resize({ width })
                .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
                .toFile(resizedFilepath)
            } catch (e) {
              // 缩放失败就退回原图,不影响阅读
              return { srcFilepath, filepath: imageFilepath, width, height, relativePath: item.relativePath }
            }
          }
          imageFilepath = resizedFilepath
        }
        return { srcFilepath, filepath: imageFilepath, width, height, relativePath: item.relativePath }
      } catch (e) {
        // 损坏文件等:用兜底尺寸推原图
        return { srcFilepath, filepath: srcFilepath, width: 1000, height: 1400, relativePath: item.relativePath }
      }
    }
    // 预读窗口:未来 3 张并行准备,但**严格按 index 顺序推送**,保证前端列表顺序稳定。
    // (实测 metadata 只要 0.36ms,收益主要来自超宽页的重编码 199ms/张。)
    const PREPARE_AHEAD = 3
    const prepared = new Map()
    for (let index = 1; index <= list.length; index++) {
      if (token !== viewerToken || !sendImageLock) break
      for (let k = 1; k <= PREPARE_AHEAD; k++) {
        const ahead = index + k
        if (ahead <= list.length && !prepared.has(ahead)) prepared.set(ahead, prepareOne(ahead))
      }
      const info = await (prepared.get(index) || prepareOne(index))
      prepared.delete(index)
      if (token !== viewerToken || !sendImageLock) break
      sendToRenderer('manga-image', {
        id: `${bookId}_${index}`,
        index,
        relativePath: info.relativePath,
        filepath: info.filepath,
        width: info.width,
        height: info.height,
        total: list.length
      })
      if (wantThumb) {
        // 只登记,不在循环里生成:等前端请求(打开侧栏)或原图推完后,由后台限流队列处理。
        // 旧实现在这里用 `(async () => {...})()` 发射任务,会把 libvips 线程池占满。
        session.thumbTodo.push({
          id: `${bookId}_${index}`,
          index,
          src: info.srcFilepath,
          width: thumbnailWidth,
          relativePath: info.relativePath,
          total: list.length,
        })
      }
    }
    session.loading = false
    // 原图全部推完后,后台限流生成缩略图(3 并发 + 持久缓存)。
    // 说明:曾经改成「前端按需请求」,但实测出现过侧栏空白,这里回退为总是生成 ——
    // 关键收益(不阻塞原图推送)依然保留。
    if (wantThumb) runThumbnailQueue(token)
  })()

  return list
})

ipcMain.handle('release-sendimagelock', () => {
  sendImageLock = false
})

// 单张图片删除:同样进回收站(用户要求「整本和单张都不能直接消失」)
//  · 文件夹漫画:那一张图直接 move 进 .trash(瞬间、可还原到原位)
//  · 压缩包漫画:7z 是原地重写,没法只搬一张出来 —— 于是先把整个压缩包「复制」一份进回收站
//    (同一本只留最早的那一份),再删包内那张图;还原时用备份覆盖回去,等于撤销这次删除。
ipcMain.handle('delete-image', async (event, filename, filepath, type) => {
  const result = { ok: false, trashed: false, src: filepath }
  const bookPath = String(filepath || '')
  const rel = String(filename || '')
  if (!bookPath || !rel) {
    result.error = '参数不完整'
    return result
  }
  let info = {}
  const ownerLibrary = libraryForPath(bookPath)
  const dbPath = toExternalPath(bookPath, 'filepath', ownerLibrary)
  try {
    const row = (await findBookAcrossLibraries({ filepath: dbPath })).row
    if (row) info = { bookId: row.id, title: row.title, title_jpn: row.title_jpn }
  } catch (e) { /* 拿不到元数据不影响删除 */ }
  const meta = { kind: 'image', bookPath, bookType: type, image: rel, ...info }
  if (type === 'folder') {
    const abs = path.isAbsolute(rel) ? rel : path.join(bookPath, rel)
    if (!libraryForPath(abs)) {
      result.error = '路径不在漫画库内,已拒绝'
      await appendDeleteLog({ deletedAt: Date.now(), deletedAtText: new Date().toLocaleString(), src: abs, ok: false, error: result.error, ...meta })
      return result
    }
    try {
      await fs.promises.stat(abs)
      await movePathToTrash(abs, meta, { inPlace: true })
      result.ok = true
      result.trashed = true
      sendMessageToWebContents('已把这张图移入回收站:' + rel + '(可在 设置 → 常用 → 回收站 里恢复)')
    } catch (e) {
      result.error = String((e && e.message) || e)
      await appendDeleteLog({ deletedAt: Date.now(), deletedAtText: new Date().toLocaleString(), src: abs, ok: false, error: result.error, ...meta })
      sendMessageToWebContents('删除 ' + abs + ' 失败:' + result.error)
    }
    return result
  }
  try {
    const list = await readTrashIndex()
    let backup = list.find(x => x.kind === 'archive-backup' && x.src === bookPath && fs.existsSync(x.dest))
    if (!backup) {
      backup = await movePathToTrash(bookPath, { kind: 'archive-backup', bookPath, bookType: type, overwriteOnRestore: true, ...info }, { keepOriginal: true })
    }
    result.backupId = backup.id
    const deleted = await deleteImageFromBook(rel, bookPath, type)
    if (!deleted) {
      result.error = '删除压缩包内的图片失败'
      await appendDeleteLog({ deletedAt: Date.now(), deletedAtText: new Date().toLocaleString(), src: bookPath, ok: false, error: result.error, ...meta })
      sendMessageToWebContents('删除 ' + bookPath + ' 里的 ' + rel + ' 失败')
      return result
    }
    result.ok = true
    result.trashed = true
    sendMessageToWebContents('已删除压缩包里的 ' + rel + ',该压缩包的原样备份在回收站里(可整体还原)')
  } catch (e) {
    result.error = String((e && e.message) || e)
    await appendDeleteLog({ deletedAt: Date.now(), deletedAtText: new Date().toLocaleString(), src: bookPath, ok: false, error: result.error, ...meta })
  }
  return result
})

// ---------- .bak 备份清理 ----------
// 超分「替换原文件」时会把旧文件备份成 <原名>.bak。这里提供两个清理入口:
//  · delete-all-bak-files  :设置 → 功能 → 图片超分 →「删除全部 .bak 备份」(遍历整个漫画库)
//  · delete-book-bak-files :封面右键 →「删除本书的 .bak 备份」(只处理这一本)
// 均为写操作,不加入网页版只读账户的白名单。
const walkRemoveBak = async (dir, depth = 0) => {
  let count = 0
  let bytes = 0
  if (depth > 12) return { count, bytes }
  let entries = []
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch (e) {
    return { count, bytes }
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const sub = await walkRemoveBak(p, depth + 1)
      count += sub.count
      bytes += sub.bytes
      continue
    }
    if (!entry.isFile() || !/\.bak$/i.test(entry.name)) continue
    try {
      const st = await fs.promises.stat(p)
      await fs.promises.rm(p, { force: true })
      count++
      bytes += st.size
    } catch (e) { /* 单个失败不影响其它 */ }
  }
  return { count, bytes }
}

ipcMain.handle('delete-all-bak-files', async () => {
  const root = String(setting.library || '')
  if (!root) return { ok: false, error: '未设置漫画库路径' }
  try {
    const res = await walkRemoveBak(root)
    return { ok: true, count: res.count, bytes: res.bytes }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})

ipcMain.handle('delete-book-bak-files', async (event, book) => {
  const target = String((book && book.filepath) || '')
  if (!target) return { ok: false, error: '未指定漫画' }
  try {
    const st = await fs.promises.stat(target).catch(() => null)
    if (!st) return { ok: false, error: '找不到漫画: ' + target }
    if (st.isDirectory()) {
      const res = await walkRemoveBak(target)
      return { ok: true, count: res.count, bytes: res.bytes }
    }
    // 压缩包型:超分替换会退化为另存,一般没有 .bak,这里保险检查同名备份
    let count = 0
    let bytes = 0
    const bakStat = await fs.promises.stat(target + '.bak').catch(() => null)
    if (bakStat && bakStat.isFile()) {
      await fs.promises.rm(target + '.bak', { force: true })
      count++
      bytes += bakStat.size
    }
    return { ok: true, count, bytes }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})

// setting
// ---------- .bak 备份恢复(超分出问题时的回滚) ----------
// 超分「替换原文件」会把旧文件备份成 <原名>.bak;这里做反向操作。
// 规则:**只处理确实存在 .bak 的文件**,目录里没有备份的图片一律不碰。
const restoreOneBakFile = async (filepath) => {
  const bak = filepath + '.bak'
  const st = await fs.promises.stat(bak).catch(() => null)
  if (!st || !st.isFile()) return { done: false, reason: 'no-bak' }
  try {
    await fs.promises.rm(filepath, { force: true })
    await fs.promises.rename(bak, filepath)
    return { done: true }
  } catch (e) {
    return { done: false, reason: String((e && e.message) || e) }
  }
}

const walkRestoreBak = async (dir, depth = 0) => {
  let restored = 0
  let failed = 0
  if (depth > 12) return { restored, failed }
  let entries = []
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch (e) {
    return { restored, failed }
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const sub = await walkRestoreBak(p, depth + 1)
      restored += sub.restored
      failed += sub.failed
      continue
    }
    // 只认 .bak 结尾的文件:没有备份的图片不会被扫到,更不会被改动
    if (!entry.isFile() || !/\.bak$/i.test(entry.name)) continue
    const res = await restoreOneBakFile(p.slice(0, -4))
    if (res.done) restored++
    else failed++
  }
  return { restored, failed }
}

ipcMain.handle('restore-image-bak', async (event, filepath) => {
  if (!filepath) return { ok: false, error: '未指定图片' }
  try {
    const res = await restoreOneBakFile(String(filepath))
    if (!res.done) {
      return {
        ok: false,
        noBak: res.reason === 'no-bak',
        error: res.reason === 'no-bak' ? '这张图没有 .bak 备份' : res.reason,
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})

ipcMain.handle('restore-book-bak-files', async (event, book) => {
  const target = String((book && book.filepath) || '')
  if (!target) return { ok: false, error: '未指定漫画' }
  try {
    const st = await fs.promises.stat(target).catch(() => null)
    if (!st) return { ok: false, error: '找不到漫画: ' + target }
    if (st.isDirectory()) {
      const res = await walkRestoreBak(target)
      return { ok: true, restored: res.restored, failed: res.failed }
    }
    // 压缩包型:只检查同名的单个 .bak
    const res = await restoreOneBakFile(target)
    return { ok: true, restored: res.done ? 1 : 0, failed: 0 }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})

ipcMain.handle('select-folder', async (event, title, presetPath) => {
  if (WEB_MODE) {
    // 网页版由前端文件夹选择器给出路径
    return presetPath || undefined
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    properties: ['openDirectory']
  })
  if (!result.canceled) {
    return result.filePaths[0]
  } else {
    return undefined
  }
})

ipcMain.handle('select-file', async (event, title, filters, presetPath) => {
  if (WEB_MODE) {
    // 网页版由前端文件选择器给出路径
    return presetPath || undefined
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    properties: ['openFile'],
    filters
  })
  if (!result.canceled) {
    return result.filePaths[0]
  } else {
    return undefined
  }
})

ipcMain.handle('load-setting', async (event, arg) => {
  // ⚠️ 必须返回「普通对象」:setting 是 Proxy(按账户隔离用的),
  //    Electron 的结构化克隆无法克隆 Proxy,会抛 "An object could not be cloned",
  //    于是渲染进程的 load-setting 直接失败 ——
  //    表现:设置界面读不到任何值(开关全变默认关闭)、本地模型等依赖它的区块不加载。
  //    (网页版走 JSON 序列化,所以那边看不出问题。)
  return { ...setting }
})

// 「全局标签」的并发保护。
//
// 背景:add-global-tag 由后端单独写 setting.globalTags 并落盘,紧接着前端会整份回传 setting
// 做保存 —— 回传里往往还没有刚加的那个标签,直接覆盖就等于「加完立刻消失」。
// 但**不能**无脑取并集:那样用户主动删除的标签会被内存里的旧值再并回来,删不掉。
//
// 所以用「未确认新增」小本子:add-global-tag 写盘时登记一笔,保存时把这些笔补回内存值;
// 前端把新标签带回(说明它已经看到了)就销账。删除走显式 removeGlobalTag,不受影响。
// ⚠ 按「账户 profile」分桶:setting 是按 profile 隔离的(见 198-213 的 Proxy),
//   但这个未确认小本子以前是模块级单例 —— 网页版多账户并发时,
//   A 账户「还没被前端确认的新增」会被补进 B 账户的 save-setting,造成跨账户污染。
const pendingGlobalTags = new Map() // '<profile>\u0000<cat>\u0000<name>' -> true
const currentProfileTag = () => String(getActiveProfile() || '')
const pendingKey = (cat, name) => currentProfileTag() + '\u0000' + String(cat) + '\u0000' + String(name)

const notePendingGlobalTag = (cat, name) => {
  if (!cat || name == null) return
  pendingGlobalTags.set(pendingKey(cat, name), true)
}
const clearPendingGlobalTag = (cat, name) => {
  pendingGlobalTags.delete(pendingKey(cat, name))
}
// 只处理「当前账户」的待确认项:别的账户的笔绝不能补进这个账户
const applyPendingGlobalTagsForProfile = (incoming) => {
  const prof = currentProfileTag()
  const prefix = prof + '\u0000'
  if (![...pendingGlobalTags.keys()].some(k => k.startsWith(prefix))) return incoming
  if (!incoming || typeof incoming !== 'object') incoming = {}
  const out = {}
  for (const [cat, arr] of Object.entries(incoming)) out[cat] = Array.isArray(arr) ? arr.slice() : []
  const seen = new Set()
  for (const [cat, arr] of Object.entries(out)) {
    for (const name of arr) seen.add(String(cat) + '\u0000' + String(name))
  }
  for (const key of [...pendingGlobalTags.keys()]) {
    if (!key.startsWith(prefix)) continue
    const rest = key.slice(prefix.length)
    if (seen.has(rest)) { pendingGlobalTags.delete(key); continue }
    const [cat, name] = rest.split('\u0000')
    if (!cat || name == null) { pendingGlobalTags.delete(key); continue }
    if (!out[cat]) out[cat] = []
    if (!out[cat].includes(name)) out[cat].push(name)
  }
  return out
}
// 把还没被前端确认的新增标签补进 incoming,避免被整份回传冲掉

// 显式删除一个全局标签(不碰书里的标签,只从登记表里去掉)
const removeGlobalTag = (cat, name) => {
  if (!setting.globalTags || typeof setting.globalTags !== 'object') return false
  const arr = Array.isArray(setting.globalTags[cat]) ? setting.globalTags[cat] : null
  if (!arr) return false
  const kept = arr.filter(v => String(v) !== String(name))
  if (kept.length === arr.length) return false
  if (kept.length) setting.globalTags[cat] = kept
  else delete setting.globalTags[cat]
  clearPendingGlobalTag(cat, name)
  return true
}
const persistSettingNow = () => {
  const p = getSettingFilePath()
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(setting, null, '  '), { encoding: 'utf-8' })
  fs.renameSync(tmp, p)
}

// 应用设置变更并写入本地 setting.json(本地模式 IPC 与远程模式本地代理共用)
const applySetting = async (receiveSetting) => {
  // 防丢配置(关键):前端启动时可能只回传了部分键(例如 App.vue 只回传 contextMenuOptions),
  // 绝不能把它当成完整配置整份替换 —— 先与内存中的现有设置合并,前端没传的键一律保留原值。
  receiveSetting = { ...setting, ...(receiveSetting || {}) }
  // 「全局标签」并发保护:把 add-global-tag 刚写入、前端还没带回来的新增标签补上,
  // 否则前端整份回传会把它覆盖掉(表现正是「加完立刻消失」)。
  // 只补「未确认的新增」,不做无脑并集 —— 否则用户主动删除的标签会被旧值并回来。
  receiveSetting.globalTags = applyPendingGlobalTagsForProfile(receiveSetting.globalTags)
  if (receiveSetting.proxy) {
    // ⚠ 不能 await:代理不可达时 Electron 的 setProxy 会挂住,后面整条保存链全卡住
    //   (表现为「切库没反应 / 设置保存转圈」)。改成后台设置 + 吞掉异常。
    session.defaultSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: receiveSetting.proxy
    }).catch((e) => console.error('setProxy failed', e))
  }
  // 本地模型下载同步使用代理 / 镜像前缀
  localModels.setProxy(receiveSetting.proxy || process.env.HTTPS_PROXY || process.env.https_proxy || '')
  localModels.setMirror(receiveSetting.localModelMirror || '')
  if (receiveSetting.metadataPath !== setting.metadataPath) {
    // metadataPath 可能为 undefined/null/空(前端缺键或用户清空):回退默认数据目录
    const target = receiveSetting.metadataPath || STORE_PATH
    rebuildMetadataModel(path.join(target, './metadata.sqlite'))
    await Metadata.sync()
  }
  // 网页版(Docker)不需要局域网浏览 API:本身就是通过网页/网络访问的
  if (!WEB_MODE && receiveSetting.enabledLANBrowsing !== setting.enabledLANBrowsing) {
    if (receiveSetting.enabledLANBrowsing) {
      enableLANBrowsing()
    } else {
      if (LANBrowsingInstance?.listening) {
        LANBrowsingInstance.close(() => {
          sendMessageToWebContents('局域网浏览已关闭')
        })
      }
    }
  }
  if (receiveSetting.startOnLogin !== setting.startOnLogin) {
    setStartOnLogin(receiveSetting.startOnLogin)
  }
  if (!WEB_MODE) {
    // 窗口置顶 / 全局快捷键变更即时生效
    if (receiveSetting.alwaysOnTop !== setting.alwaysOnTop) {
      applyAlwaysOnTop(receiveSetting.alwaysOnTop)
      sendWindowState()
    }
    if (receiveSetting.globalHotkey !== setting.globalHotkey) {
      registerGlobalHotkey()
    }
  }
  // 容器模式:只对 Windows 盘符路径做跨平台映射;容器内合法路径尊重用户设置。
  // 此时 receiveSetting 已是「现有设置 + 本次提交」的完整对象,落盘内容默认就是它。
  let fileSetting = { ...receiveSetting }
  if (WEB_LIBRARY_ENV) {
    const forcedLibrary = path.resolve(WEB_LIBRARY_ENV)
    const lib = String(receiveSetting.library || '')
    const meta = String(receiveSetting.metadataPath || '')
    if (/^[A-Za-z]:[\\/]/.test(lib)) {
      // 桌面端写来的 Windows 库路径:内存用容器挂载路径,落盘写 Windows 侧
      if (!receiveSetting.externalLibraryRoot) receiveSetting.externalLibraryRoot = lib
      receiveSetting.library = forcedLibrary
      fileSetting = { ...receiveSetting, library: receiveSetting.externalLibraryRoot }
    } else {
      // 容器内合法路径(以 / 开头)尊重用户设置;空/根目录才回退默认挂载路径
      if (!lib || lib === '/') receiveSetting.library = forcedLibrary
      fileSetting = { ...receiveSetting }
    }
    if (/^[A-Za-z]:[\\/]/.test(meta)) {
      // Windows 元数据路径:落盘写 Windows 侧,内存置空回退默认
      if (!receiveSetting.externalMetadataPath) receiveSetting.externalMetadataPath = meta
      if (!receiveSetting.externalCoverRoot) receiveSetting.externalCoverRoot = path.join(meta, 'cover').replace(/\//g, '\\')
      fileSetting = { ...fileSetting, metadataPath: receiveSetting.externalMetadataPath }
      receiveSetting.metadataPath = null
    }
    if (receiveSetting.externalLibraryRoot) fileSetting.windowsLibraryRoot = receiveSetting.externalLibraryRoot
  }
  replaceCurrentSetting(receiveSetting)
  if (tray && !setting.minimizeToTray && !setting.closeToTray) {
    tray.destroy()
    tray = null
  }
  // 刷新托盘菜单(置顶/开机启动勾选状态与设置同步)
  if (tray) buildTrayMenu()
  // 降级模式(用户设置的数据目录打不开):只改内存,不落盘,避免污染默认目录里的旧数据
  if (dataPathFallback) return
  // 库配置单独落盘(与账户无关):账户设置文件里不再保存 libraries/library/switchBoxes
  writeLibrariesFile(extractLibraryConfig(setting))
  const forFile = { ...fileSetting }
  for (const k of LIBRARY_CONFIG_KEYS) delete forFile[k]
  const targetPath = getSettingFilePath()
  const tempPath = settingTmpPath()
  await fs.promises.writeFile(tempPath, JSON.stringify(forFile, null, '  '), { encoding: 'utf-8' })
  return await fs.promises.rename(tempPath, targetPath)
}

ipcMain.handle('save-setting', async (event, receiveSetting) => {
  return applySetting(receiveSetting)
})

// ---------- 多库管理(第二十九轮) ----------
// 返回给设置页的库列表:额外带上解析后的「库数据目录」,方便 UI 显示
const librariesSnapshot = () => ({
  // 两组原始路径都给 UI(桌面端编辑 path/dataPath,网页端编辑 pathWeb/dataPathWeb),
  // 另附 localPath/localDataPath = 本端实际使用的值
  libraries: (setting.libraries || []).map(l => ({
    id: l.id,
    name: l.name,
    path: l.path || '',
    dataPath: l.dataPath || '',
    pathWeb: l.pathWeb || '',
    dataPathWeb: l.dataPathWeb || '',
    localPath: localLibraryPath(l, IS_WEB_ENV),
    localDataPath: localLibraryDataPath(l, IS_WEB_ENV),
    dataDir: libraryDataDir(STORE_PATH, l, IS_WEB_ENV),
    // 第 3 条 C:没填「库数据存放位置」的库不生效(按本端那一组判断)
    active: isLibraryActive(l, IS_WEB_ENV)
  })),
  activeLibraryId: setting.activeLibraryId || '',
  library: setting.library || '',
  switchBoxes: (Array.isArray(setting.switchBoxes) ? setting.switchBoxes : []).map(b => ({
    id: b.id,
    libraryIds: Array.isArray(b.libraryIds) ? [...b.libraryIds] : []
  })),
  activeBoxIndex: Number.isInteger(setting.activeBoxIndex) ? setting.activeBoxIndex : 0,
  boxLibraryIds: boxLibraries().map(l => l.id)
})

ipcMain.handle('get-libraries', async () => librariesSnapshot())

// 设置页提交整份库列表 + 活动库:先规范化,再落盘;活动库变了才重建运行时(切库)
// 校验库路径:必须是绝对路径、在容器里真实存在、而且是个目录。
// 用户反馈「新库扫不到内容(小说/xiaoshuo)」,绝大多数是路径不对:
//   · 填了相对路径(容器里会解析到 /app 下面)
//   · 目录没挂进容器(docker-compose 里没有对应 volume)
// 以前这两种情况都能保存,扫描只是「一本都没找到」,很难查 —— 现在保存时就报错。
const validateLibraryPaths = (libs) => {
  for (const lib of (libs || [])) {
    const p = String((lib && lib.path) || '').trim()
    if (!p) continue
    if (!path.isAbsolute(p)) {
      return `库「${lib.name || p}」的路径必须是绝对路径(以 / 开头),现在填的是「${p}」。
如果这个文件夹在漫画库里,请填 /library/${p.replace(/^[./\\]+/, '')}`
    }
    let st = null
    try { st = fs.statSync(p) } catch (e) { st = null }
    if (!st) {
      return `库「${lib.name || p}」的路径在容器里不存在:${p}
可能是没挂载进容器 —— 请确认 docker-compose 的 volumes 里有这个文件夹,或把漫画放到已挂载的库目录下面。`
    }
    if (!st.isDirectory()) return `库「${lib.name || p}」的路径不是文件夹:${p}`
  }
  return ''
}

ipcMain.handle('apply-libraries', async (event, arg) => {
  try {
    const payload = arg || {}
    const pathErr = validateLibraryPaths(Array.isArray(payload.libraries) ? payload.libraries : [])
    if (pathErr) return { ok: false, error: pathErr }
    const draft = {
      ...setting,
      libraries: Array.isArray(payload.libraries) ? payload.libraries : [],
      activeLibraryId: payload.activeLibraryId || '',
      switchBoxes: Array.isArray(payload.switchBoxes) ? payload.switchBoxes : (setting.switchBoxes || []),
      activeBoxIndex: Number.isInteger(payload.activeBoxIndex) ? payload.activeBoxIndex : (setting.activeBoxIndex || 0)
    }
    // preferList:以 UI 提交的库列表为准,否则旧的 setting.library 会把刚选中的库路径覆盖掉
    ensureLibraries(draft, { preferList: true, nameHint: setting.externalLibraryRoot })
    const prev = activeLibraryOf(setting)
    const next = activeLibraryOf(draft)
    const activeChanged = !prev || !next || prev.id !== next.id || prev.path !== next.path || (prev.dataPath || '') !== (next.dataPath || '')
    // 扫描过程中换库会把「旧库的书」写进「新库的数据库」,必须等扫描结束
    if (activeChanged && isScanning) {
      return { ok: false, error: '正在扫描漫画库,请等扫描结束后再切换库' }
    }
    // 库改名或改「库数据存放位置」:把该库的数据从旧目录搬到新目录(同名同目录不搬)
    // 库改名 → 默认目录按新库名变 → 数据要跟着搬,否则书架会「看起来空了」
    for (const nextLib of draft.libraries) {
      const prevLib = (setting.libraries || []).find(l => l.id === nextLib.id)
      if (!prevLib) continue
      const prevDir = libraryDataDir(STORE_PATH, prevLib)
      const nextDir = libraryDataDir(STORE_PATH, nextLib)
      if (shouldMoveLibraryData(prevLib, nextLib, prevDir, nextDir)) {
        const moved = migrateLibraryData(prevDir, nextDir)
        if (moved.moved.length) console.log(`[libraries] 库「${nextLib.name}」改名/改目录,已搬进新目录:${moved.moved.join('、')}`)
        // 数据被搬到新目录了,旧连接还指着老文件 → 丢弃,后面按需重开
        closeLibraryModel(nextLib.id)
      }
    }
    // 已经不在列表里的库:把它的连接关掉,别让残留实例锁着文件
    {
      const nextIds = new Set(draft.libraries.map(l => l.id))
      for (const id of [...mangaModels.keys()]) {
        if (!nextIds.has(id)) {
          console.log(`[libraries] 库已从列表移除,关闭其数据库连接: ${id}`)
          closeLibraryModel(id)
        }
      }
    }
    const prevDataDir = LIBRARY_DATA_DIR
    replaceCurrentSetting(draft)
    // 复用 applySetting 的落盘规则(容器模式下 library 会写回 Windows 侧)
    await applySetting({})
    if (activeChanged) await switchActiveLibraryRuntime(prev, prevDataDir)
    return { ok: true, activeChanged, ...librariesSnapshot() }
  } catch (e) {
    console.error(e)
    return { ok: false, error: String(e && e.message ? e.message : e) }
  }
})

// 切换当前漫画库(工具栏「切换库」):只改活动库并重建运行时,不要求提交整份列表
ipcMain.handle('set-active-library', async (event, id) => {
  try {
    const lib = (setting.libraries || []).find(l => l.id === id)
    if (!lib) return { ok: false, error: '找不到该漫画库' }
    if (!isLibraryActive(lib, IS_WEB_ENV)) return { ok: false, error: `库「${lib.name}」还没填「库数据存放位置」,填完才会生效` }
    const prev = activeLibraryOf(setting)
    if (prev && prev.id === lib.id) return { ok: true, activeChanged: false, ...librariesSnapshot() }
    if (isScanning) return { ok: false, error: '正在扫描漫画库,请等扫描结束后再切换库' }
    const prevDataDir = LIBRARY_DATA_DIR
    setting.activeLibraryId = lib.id
    setting.library = lib.path
    await applySetting({})
    await switchActiveLibraryRuntime(prev, prevDataDir)
    return { ok: true, activeChanged: true, ...librariesSnapshot() }
  } catch (e) {
    console.error(e)
    return { ok: false, error: String(e && e.message ? e.message : e) }
  }
})

// 库切换框:点工具栏按钮 = 切到下一个框(循环);书架显示该框内所有库合并的漫画
ipcMain.handle('set-active-box', async (event, arg) => {
  try {
    const boxes = Array.isArray(setting.switchBoxes) ? setting.switchBoxes : []
    if (!boxes.length) return { ok: false, error: '还没有配置「库切换」框(设置 → 常用)' }
    const n = boxes.length
    let idx = Number.isInteger(setting.activeBoxIndex) ? setting.activeBoxIndex : 0
    if (arg && Number.isInteger(arg.index)) idx = arg.index
    else idx += 1
    idx = ((idx % n) + n) % n
    // 切框只改「书架显示哪几个库」:不碰扫描/写操作的运行时,所以**扫描中也可以切**。
    // 每本书自带 libraryId 决定写回哪个库;扫描也是自带库循环逐个扫,两者互不干扰。
    setting.activeBoxIndex = idx
    // 兼容:还有几处(移动文件/文件夹树/局域网根目录)仍读 setting.library,同步成框里第一个库
    const firstLib = boxLibraries()[0]
    if (firstLib) setting.library = firstLib.path
    // ⚠ applySetting 失败不能连带把切库回滚:设置保存问题(代理/主题之类)应该各自报错,
    //   库切换本身已经成功,回滚会让用户「点好几次都切不过去」
    try { await applySetting({}) } catch (e) { console.error('applySetting after switch failed', e) }
    return { ok: true, activeChanged: true, ...librariesSnapshot() }
  } catch (e) {
    console.error(e)
    return { ok: false, error: String(e && e.message ? e.message : e) }
  }
})

// 全局标签列表(来自 metadata.sqlite,和当前库/切换框无关)—— 设置 → 标签 用它
ipcMain.handle('get-all-tags', async () => {
  try {
    const rows = await Metadata.findAll({ attributes: ['tags'] })
    const seen = new Set()
    const out = []
    for (const row of rows) {
      const tags = row.tags
      if (!tags || typeof tags !== 'object') continue
      for (const [cat, arr] of Object.entries(tags)) {
        if (!Array.isArray(arr)) continue
        for (const tag of arr) {
          if (!tag) continue
          const key = cat + '##' + tag
          if (seen.has(key)) continue
          seen.add(key)
          out.push({ cat, tag })
        }
      }
    }
    return { ok: true, tags: out }
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e), tags: [] }
  }
})

// 标题分析:把标题按括号/分隔符切开,和库里已有的 团队/作者/原作/角色 标签做精确对比,
// 命中就写入对应标签。纯本地规则,不调用 AI(设置 → 标签设置里的「标题分析」)。
ipcMain.handle('analyze-titles-by-tags', async (event, opts = {}) => {
  try {
    const dryRun = !!opts.dryRun
    const cats = Array.isArray(opts.cats) && opts.cats.length
      ? opts.cats
      : ['group', 'artist', 'parody', 'character']
    const ALIASES = {
      group: ['group', '团队', '社團', '社团'],
      artist: ['artist', '作者', '艺术家', '藝術家'],
      parody: ['parody', '原作', '作品'],
      character: ['character', '角色'],
    }
    const normCat = (c) => {
      const raw = String(c || '').trim()
      for (const [k, list] of Object.entries(ALIASES)) if (list.includes(raw)) return k
      return raw
    }
    const nameIndex = new Map()
    const addName = (name, cat, tag) => {
      const n = String(name || '').trim()
      if (!n) return
      const key = n.toLowerCase()
      if (!nameIndex.has(key)) nameIndex.set(key, { cat, tag })
    }
    const rows = await Metadata.findAll()
    const seen = new Set()
    for (const row of rows) {
      const tags = row.tags
      if (!tags || typeof tags !== 'object') continue
      for (const [rawCat, arr] of Object.entries(tags)) {
        if (!Array.isArray(arr)) continue
        const cat = normCat(rawCat)
        if (!cats.includes(cat)) continue
        for (const tag of arr) {
          if (!tag) continue
          const k = cat + '##' + tag
          if (seen.has(k)) continue
          seen.add(k)
          addName(tag, cat, tag)
          const rec = (setting.tagNameLangs || {})[rawCat + '::' + tag] || (setting.tagNameLangs || {})[cat + '::' + tag]
          if (rec) for (const v of Object.values(rec)) for (const n of String(v || '').split('/')) addName(n, cat, tag)
        }
      }
    }
    const books = await loadBookListFromDatabase()
    const targets = books.filter(b => !b.isCollection && (b.title_jpn || b.title))
    const total = targets.length
    if (!total) return { ok: true, total: 0, changed: 0, added: 0 }
    sendMessageToWebContents('标题分析:开始处理 ' + total + ' 本')
    let changed = 0
    let added = 0
    let done = 0
    const SPLIT_RE = /[\[\]()（）【】{}<>《》\/|｜、,，;；:：\s]+/
    const cleanSeg = (s0) => String(s0 || '').replace(/^[\s\-–—_·]+|[\s\-–—_·]+$/g, '')
    await Metadata.sequelize.transaction(async (tx) => {
      for (const book of targets) {
        const title = String(book.title_jpn || book.title || '')
        const segs = title.split(SPLIT_RE).map(cleanSeg).filter(s0 => s0 && s0.length >= 2 && s0.length <= 40)
        if (!segs.length) { done++; continue }
        const hits = new Map()
        for (const seg of segs) {
          const hit = nameIndex.get(seg.toLowerCase())
          if (!hit) continue
          if (!hits.has(hit.cat)) hits.set(hit.cat, new Set())
          hits.get(hit.cat).add(hit.tag)
        }
        if (!hits.size) { done++; continue }
        const tags = book.tags && typeof book.tags === 'object' ? { ...book.tags } : {}
        let localAdded = 0
        for (const [cat, set] of hits) {
          const existKey = Object.keys(tags).find(k => normCat(k) === cat) || cat
          const arr = Array.isArray(tags[existKey]) ? tags[existKey].slice() : []
          for (const tag of set) {
            if (arr.includes(tag)) continue
            arr.push(tag)
            localAdded++
          }
          tags[existKey] = arr
        }
        if (localAdded) {
          if (!dryRun) await Metadata.update({ tags }, { where: { hash: book.id || book.hash }, transaction: tx })
          changed++
          added += localAdded
        }
        done++
        if (done % 300 === 0) sendMessageToWebContents('标题分析:已处理 ' + done + '/' + total + ',新增 ' + added + ' 个标签')
      }
    })
    sendMessageToWebContents('标题分析完成:处理 ' + total + ' 本,更新 ' + changed + ' 本,新增 ' + added + ' 个标签')
    return { ok: true, total, changed, added, dryRun }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

ipcMain.handle('export-database', async (event, folder) => {
  if (folder !== STORE_PATH && folder !== setting.metadataPath) {
    await fs.promises.copyFile(path.join(STORE_PATH, 'collectionList.json'), path.join(folder, 'collectionList.json'))
    await fs.promises.copyFile(metadataSqliteFile, path.join(folder, 'metadata.sqlite'))
    return true
  } else {
    sendMessageToWebContents('导出失败:目标文件夹与源文件夹相同')
    return false
  }
})

ipcMain.handle('import-database', async (event, arg) => {
  const { collectionListPath, metadataSqlitePath } = arg
  if (collectionListPath && metadataSqlitePath) {
    await Metadata.sequelize.close()
    await fs.promises.copyFile(collectionListPath, path.join(STORE_PATH, 'collectionList.json'))
    await fs.promises.copyFile(metadataSqlitePath, metadataSqliteFile)
    if (WEB_MODE) {
      // 网页版无法重启进程:重新加载模型并提示前端刷新即可
      rebuildMetadataModel(metadataSqliteFile)
      await Metadata.sync()
      sendMessageToWebContents('导入完成,请刷新页面查看')
    } else {
      app.relaunch()
      app.exit(0)
    }
  } else {
    sendMessageToWebContents('导入失败:源文件夹为空')
  }
})

ipcMain.handle('import-sqlite', async (event, arg) => {
  let bookList = arg
  let sqliteFilePath
  if (WEB_MODE) {
    // 网页版通过前端文件选择器把路径作为参数传入
    bookList = arg?.bookList
    sqliteFilePath = arg?.sqliteFilePath
  } else {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'SQLite', extensions: ['sqlite'] }]
    })
    if (!result.canceled) sqliteFilePath = result.filePaths[0]
  }
  if (!sqliteFilePath) {
    return { success: false }
  }
  const db = await open({
    filename: sqliteFilePath,
    driver: sqlite3.Database
  })
  try {
    const re = /'/g
    const bookListLength = bookList.length
    for (let i = 0; i < bookListLength; i++) {
      const book = bookList[i]
      if (book.status !== 'tagged') {
        let metadata
        // 当book type为folder时，尝试获取.ehviewer数据
        if (book.type === 'folder') {
          const dirname = book.filepath
          const ehviewerData = getEhviewerDataManually(dirname)
          const { gid, token } = ehviewerData || {}
          if (gid && token) {
            metadata = await db.get('SELECT * FROM gallery WHERE gid = ? AND token = ?', [gid, token])
          }
        }
        if (metadata === undefined) {
          // remove file extension
          const filename = path.parse(book.title).name
          metadata = await db.get(`SELECT * FROM gallery WHERE torrents LIKE ?
                                                          OR title LIKE ?
                                                          OR title_jpn LIKE ?
                                                          OR thumb LIKE ?`,
            `%${filename}%`,
            `%${filename}%`,
            `%${filename}%`,
            `%${book.coverHash}%`
          )
        }

        if (metadata) {
          metadata.tags = {
            language: metadata.language ? JSON.parse(metadata.language.replace(re, '\"')) : undefined,
            parody: metadata.parody ? JSON.parse(metadata.parody.replace(re, '\"')) : undefined,
            character: metadata.character ? JSON.parse(metadata.character.replace(re, '\"')) : undefined,
            group: metadata.group ? JSON.parse(metadata.group.replace(re, '\"')) : undefined,
            artist: metadata.artist ? JSON.parse(metadata.artist.replace(re, '\"')) : undefined,
            male: metadata.male ? JSON.parse(metadata.male.replace(re, '\"')) : undefined,
            female: metadata.female ? JSON.parse(metadata.female.replace(re, '\"')) : undefined,
            mixed: metadata.mixed ? JSON.parse(metadata.mixed.replace(re, '\"')) : undefined,
            other: metadata.other ? JSON.parse(metadata.other.replace(re, '\"')) : undefined,
            cosplayer: metadata.cosplayer ? JSON.parse(metadata.cosplayer.replace(re, '\"')) : undefined,
            rest: metadata.rest ? JSON.parse(metadata.rest.replace(re, '\"')) : undefined,
          }
          metadata.filecount = +metadata.filecount
          metadata.rating = +metadata.rating
          metadata.posted = +metadata.posted
          metadata.filesize = +metadata.filesize
          metadata.url = `https://exhentai.org/g/${metadata.gid}/${metadata.token}/`
          _.assign(book, _.pick(metadata, ['tags', 'title', 'title_jpn', 'filecount', 'rating', 'posted', 'filesize', 'category', 'url']), { status: 'tagged' })
          await saveBookToDatabase(book)
        }
        setProgressBar(i / bookListLength)
      }
    }
    await db.close()
    setProgressBar(-1)
  } catch (e) {
    console.log(e)
    await db.close()
  }
  return {
    success: true,
    bookList
  }
})


// tools

ipcMain.handle('set-progress-bar', async (event, progress) => {
  setProgressBar(progress)
})

ipcMain.handle('get-locale', async (event, arg) => {
  return app.getLocale()
})

ipcMain.handle('copy-image-to-clipboard', async (event, filepath) => {
  clipboard.writeImage(nativeImage.createFromPath(filepath))
})

// 图片属性(阅读器右键「属性」):名称 / 大小 / 编码格式 / 分辨率 / 修改时间。
// 只读操作,网页版的只读账户(viewer)也允许调用 —— 需同步加进 web-server.js 的 VIEWER_ALLOWED_CHANNELS。
ipcMain.handle('image-file-info', async (event, filepath) => {
  try {
    if (!filepath) return { ok: false, error: '未指定图片' }
    const st = await fs.promises.stat(filepath).catch(() => null)
    if (!st || !st.isFile()) return { ok: false, error: '找不到图片: ' + filepath }
    let width = 0, height = 0, format = '', channels = 0, depth = '', pages = 1, space = ''
    try {
      const m = await sharp(filepath, { failOnError: false }).metadata()
      width = m.width || 0
      height = m.height || 0
      format = String(m.format || '')
      channels = m.channels || 0
      // sharp 的 depth 返回的是 'uchar' / 'ushort' 这类类型名,换算成位深更好读
      const depthRep = String(m.depth || '')
      depth = ({ uchar: 8, char: 8, ushort: 16, short: 16, uint: 32, int: 32, float: 32, double: 64 })[depthRep]
        || (Number(depthRep) || '')
      pages = m.pages || 1
      space = m.space || ''
    } catch (e) { /* 非图片或 sharp 不支持:仍返回文件层面的信息 */ }
    return {
      ok: true,
      name: path.basename(filepath),
      filePath: filepath,
      ext: path.extname(filepath).replace('.', '').toLowerCase(),
      size: st.size,
      width,
      height,
      format,
      channels,
      depth,
      pages,
      space,
      mtime: st.mtimeMs,
    }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})

ipcMain.handle('copy-text-to-clipboard', async (event, text) => {
  clipboard.writeText(text)
})

ipcMain.handle('read-text-from-clipboard', async () => {
  return clipboard.readText()
})

ipcMain.handle('update-window-title', async (event, title) => {
  if (WEB_MODE) return
  const name = require('./package.json').name
  const version = require('./package.json').version
  if (title) {
    mainWindow.setTitle(name + ' ' + version + ' | ' + title)
  } else {
    mainWindow.setTitle(name + ' ' + version)
  }
})

ipcMain.handle('switch-fullscreen', async (event, arg) => {
  if (WEB_MODE) return
  mainWindow.setFullScreen(!mainWindow.isFullScreen())
})

// ---------- Windows 窗口控制 ----------
ipcMain.handle('get-window-state', async () => getWindowState())

ipcMain.handle('window-minimize', async () => {
  if (mainWindow) mainWindow.minimize()
  return getWindowState()
})

ipcMain.handle('window-toggle-maximize', async () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  }
  return getWindowState()
})

ipcMain.handle('window-set-always-on-top', async (event, flag) => {
  if (!WEB_MODE && mainWindow) {
    setting.alwaysOnTop = !!flag
    applyAlwaysOnTop(setting.alwaysOnTop)
    persistSetting()
    if (tray) buildTrayMenu()
    sendWindowState()
  }
  return getWindowState()
})

ipcMain.handle('window-toggle-always-on-top', async () => {
  if (!WEB_MODE && mainWindow) {
    setting.alwaysOnTop = !mainWindow.isAlwaysOnTop()
    applyAlwaysOnTop(setting.alwaysOnTop)
    persistSetting()
    if (tray) buildTrayMenu()
    sendWindowState()
  }
  return getWindowState()
})

// ---------- NAS 远程漫画库 ----------
ipcMain.handle('test-remote-server', async (event, url) => {
  if (WEB_MODE) return { ok: false, error: '网页版无需测试' }
  const target = normalizeServerUrl(url)
  if (!target) return { ok: false, error: 'empty' }
  try {
    const res = await fetch(target + '/api/info', { timeout: 5000 })
    const info = await res.json()
    if (!res.ok || !info.webMode) {
      return { ok: false, error: `该地址不是 exhentai-manga-manager 网页版服务 (HTTP ${res.status})` }
    }
    return {
      ok: true,
      version: info.version,
      port: info.port,
      webMode: !!info.webMode,
      auth: !!info.auth
    }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

ipcMain.handle('relaunch-app', async () => {
  if (WEB_MODE) return
  app.relaunch()
  app.exit(0)
})

// 切回本地模式(登录框「使用本地模式」按钮):清空服务器地址并重启
ipcMain.handle('switch-to-local-mode', async () => {
  if (WEB_MODE) return { ok: false, error: '网页版无需切换' }
  setting.remoteServer = ''
  setting.webUsername = ''
  setting.webPassword = ''
  setting.remoteUsername = ''
  setting.remotePassword = ''
  persistSetting()
  app.relaunch()
  app.exit(0)
  return { ok: true }
})

// ---------- 本地模式:数据文件位置 ----------
ipcMain.handle('get-data-path', async () => {
  if (WEB_MODE) return null
  return {
    dataPath: STORE_PATH,
    defaultDataPath: DEFAULT_DATA_PATH,
    isPortable
  }
})

// 本地模式:打开漫画库文件夹(工具栏按钮)
ipcMain.handle('open-library-folder', async () => {
  if (WEB_MODE) return { ok: false }
  try {
    const result = await shell.openPath(setting.library || app.getPath('downloads'))
    return { ok: !result, error: result }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

ipcMain.handle('set-data-path', async (event, dataPath) => {
  if (WEB_MODE) return { ok: false, error: '网页版无需设置数据目录' }
  const target = String(dataPath || '').trim()
  if (!target) return { ok: false, error: 'empty' }
  try {
    setBootstrapDataPath(target)
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
  app.relaunch()
  app.exit(0)
  return { ok: true }
})

// ---------- 账户系统:桌面版与网页版共用 ----------
// 网页版的登录走 HTTP(web-server.js 的 /api/auth/*);桌面版没有 HTTP 服务,走这里的 IPC。
// 默认账户 admin / admin(见 modules/auth.js:没有任何账户时自动创建)。
const auth = require('./modules/auth.js')
auth.loadUsers(STORE_PATH)
// 桌面版当前登录用户(渲染进程刷新页面也不丢)
let currentAuth = null
// 桌面版「保持登录」:重启后自动恢复上次的有效会话,直到用户主动退出登录
if (!WEB_MODE) {
  const restored = auth.restoreLastSession()
  if (restored) {
    currentAuth = restored
    console.log('[auth] 已恢复上次登录:', restored.username, '(' + restored.role + ')')
  }
}
const authStatus = () => {
  // 以「会话是否仍然有效」为准:改密码、删账户都会作废会话,
  // 桌面版内存里的 currentAuth 也要跟着失效,否则界面还显示已登录。
  if (currentAuth && currentAuth.token && !auth.getSession(currentAuth.token)) currentAuth = null
  return {
    enabled: auth.isEnabled(),
    role: currentAuth ? currentAuth.role : null,
    username: currentAuth ? currentAuth.username : null
  }
}
// 账户管理类 IPC 的权限闸门:只有管理员能列/增/删账户、改密码
// (网页版由 web-server 的 VIEWER_ALLOWED_CHANNELS 拦截,桌面版本地 IPC 原先没有任何校验)
const requireAdmin = () => {
  // 网页版(Docker)的登录走 web-server 的 HTTP 层,不经过这里的 auth-login,
  // 所以 currentAuth 在网页版永远是空的 —— 不能拿它做判断,否则管理员自己也会被拒。
  // 网页版的角色校验由 web-server 的 /api/ipc 完成(auth-* 通道不在 viewer 白名单里)。
  if (WEB_MODE) return null
  return (!currentAuth || currentAuth.role !== 'admin')
    ? { ok: false, error: '需要管理员权限(请用管理员账户登录)' }
    : null
}
// 同步通道:渲染进程必须在加载界面之前就知道"要不要弹登录框"
ipcMain.on('auth-status', (event) => { event.returnValue = authStatus() })
ipcMain.handle('auth-current', async () => authStatus())
ipcMain.handle('auth-login', async (event, { username, password } = {}) => {
  const user = auth.verify(String(username || '').trim(), String(password || ''))
  if (!user) {
    // 账户是跟着「数据目录」走的:换了数据目录(例如指向 NAS 共享)后,
    // 本机原来的账户就不存在了 —— 直接把该目录里的账户列出来,免得用户猜。
    const names = auth.listUsers().map(u => u.username)
    const hint = names.length ? `(当前数据目录里的账户:${names.join('、')})` : ''
    return { ok: false, error: '用户名或密码不正确' + hint }
  }
  currentAuth = { username: user.username, role: user.role, token: auth.createSession(user) }
  // 需求:配置文件以账户命名 —— 把登录名记成「配置名」,下次启动就加载该账户的 setting.<账户>.json。
  // 这里不重启(避免打断当前使用),下次启动自然生效。
  if (!WEB_MODE) {
    try {
      const bf = path.join(app.getPath('userData'), 'bootstrap.json')
      let cfg = {}
      try { cfg = JSON.parse(fs.readFileSync(bf, 'utf-8')) || {} } catch (e) { cfg = {} }
      if (cfg.profile !== user.username) {
        fs.mkdirSync(path.dirname(bf), { recursive: true })
        fs.writeFileSync(bf, JSON.stringify({ ...cfg, profile: user.username }, null, '  '), 'utf-8')
        console.log('[auth] 配置名已设为账户:', user.username, '(下次启动生效)')
      }
    } catch (e) { console.log('[auth] 写入配置名失败:', String((e && e.message) || e)) }
    // 桌面版也立即切到该账户的设置文件(不重启;文件不存在时自动回退 setting.json 平滑迁移)
    try { await switchProfile(user.username) } catch (e) { console.log('[auth] 切换账户配置失败:', String((e && e.message) || e)) }
  }
  return { ok: true, role: user.role, username: user.username }
})
ipcMain.handle('auth-logout', async () => {
  if (currentAuth && currentAuth.token) auth.destroySession(currentAuth.token)
  currentAuth = null
  return { ok: true }
})
ipcMain.handle('auth-list-users', async () => {
  const denied = requireAdmin()
  return denied || auth.listUsers()
})
ipcMain.handle('auth-add-user', async (event, { username, password, role } = {}) => {
  const denied = requireAdmin()
  return denied || auth.addUser(username, password, role)
})
ipcMain.handle('auth-remove-user', async (event, username) => {
  const denied = requireAdmin()
  if (denied) return denied
  const res = auth.removeUser(username)
  // 删掉的正是当前登录的账户 → 立刻退出登录状态
  if (res.ok && currentAuth && currentAuth.username === username) {
    currentAuth = null
  }
  return res
})
ipcMain.handle('auth-change-password', async (event, { username, newPassword } = {}) => {
  const denied = requireAdmin()
  if (denied) return denied
  const res = auth.changePassword(username, newPassword)
  // 改的是自己的密码 → 会话已被作废,这里同步退出登录(让用户用新密码重新登录)
  if (res.ok && currentAuth && currentAuth.username === username) {
    currentAuth = null
  }
  return res
})
// 网页版专属:IP 访问控制(白名单免登录 / 黑名单拒绝连接)
if (WEB_MODE) {
  const iprules = require('./modules/iprules.js')
  ipcMain.handle('auth-get-ip-rules', async () => iprules.getRules())
  ipcMain.handle('auth-set-ip-rules', async (event, { whitelist, blacklist } = {}) => {
    return iprules.setRules(whitelist, blacklist)
  })
}

// title translation
ipcMain.handle('translate-book-title', async (event, book) => {
  try {
    if (!book || book.isCollection) return book
    const translated = await translateBookTitle(book, setting)
    if (!translated) {
      sendMessageToWebContents(`翻译 ${book.title_jpn || book.title} 失败:没有可翻译的标题`)
      return book
    }
    book.title_cn = translated
    await saveBookToDatabase(book)
    sendMessageToWebContents(`已将「${book.title_jpn || book.title}」翻译为「${translated}」`)
    return book
  } catch (e) {
    sendMessageToWebContents(`翻译「${book?.title_jpn || book?.title || ''}」失败:${e.message || e}`)
    throw e
  }
})

ipcMain.handle('translate-book-titles-batch', async (event, force = false) => {
  if (setting.titleTranslationMode === 'off' || !setting.titleTranslationMode) {
    const msg = '标题翻译未启用,请先在 设置 → 标题翻译 中选择翻译模式(本地AI或在线API)'
    sendMessageToWebContents(msg)
    return { total: 0, success: 0, failed: 0, error: msg }
  }
  const bookList = await loadBookListFromDatabase()
  const targets = bookList.filter(b => !b.isCollection && (force || !b.title_cn) && (b.title_jpn || b.title))
  const total = targets.length
  if (total === 0) {
    sendMessageToWebContents('标题翻译:没有需要翻译的标题')
    return { total: 0, success: 0, failed: 0 }
  }
  sendMessageToWebContents(`开始批量翻译标题,共 ${total} 本(模式:${setting.titleTranslationMode})`)
  let success = 0
  let failed = 0
  await runConcurrent(targets, 2, async (book, i) => {
    await waitIfAiPaused()
    try {
      const translated = await translateBookTitle(book, setting)
      if (translated) {
        book.title_cn = translated
        await saveBookToDatabase(book)
        success++
      } else {
        failed++
      }
    } catch (e) {
      failed++
      console.error(`翻译「${book.title_jpn || book.title}」失败:`, e.message || e)
    }
    if ((i + 1) % 10 === 0 || i + 1 === total) {
      sendMessageToWebContents(`标题翻译进度: ${i + 1}/${total}(成功 ${success},失败 ${failed})`)
    }
  })
  sendMessageToWebContents(`标题翻译完成:共 ${total} 本,成功 ${success},失败 ${failed}`)
  return { total, success, failed }
})

ipcMain.handle('test-title-translation', async (event, cfg) => {
  try {
    const testConfig = cfg && typeof cfg === 'object' ? cfg : setting
    const result = await translateTitle('Test Title [Sample Circle]', testConfig)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

ipcMain.handle('list-title-translation-models', async (event, cfg) => {
  try {
    const testConfig = cfg && typeof cfg === 'object' ? cfg : setting
    const models = await listTitleTranslationModels(testConfig)
    return { ok: true, models }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

// 查询角色出处:传入漫画对象(取 character 标签)或角色名字符串/数组
ipcMain.handle('query-character-origins', async (event, arg) => {
  try {
    let names = []
    if (Array.isArray(arg)) {
      names = arg
    } else if (typeof arg === 'string') {
      names = arg.split(/[,，、\n]/)
    } else if (arg && typeof arg === 'object') {
      const characterTags = arg.tags?.character
      if (Array.isArray(characterTags)) names = characterTags
    }
    names = names.map(n => String(n).trim()).filter(Boolean)
    if (names.length === 0) {
      return { ok: false, error: '没有可查询的角色(该漫画没有角色标签)' }
    }
    const result = await queryCharacterOrigins(names, setting)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

// 导入自定义资源(主题背景图/网站图标):复制到数据目录下,网页版可经 /api/file 访问
ipcMain.handle('import-custom-asset', async (event, filepath) => {
  if (!filepath) return { ok: false, error: '未选择文件' }
  try {
    const ext = path.extname(filepath) || '.png'
    const targetPath = path.join(STORE_PATH, 'custom-assets', `${nanoid(8)}${ext}`)
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.promises.copyFile(filepath, targetPath)
    return { ok: true, path: targetPath }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

// AI 综合信息处理(单本):翻译标题 + 角色 + 出处 + 作者 + 类型,写入元数据
ipcMain.handle('ai-process-book', async (event, book) => {
  try {
    if (!book || book.isCollection) return { ok: false, error: '无效的漫画' }
    const title = book.title_jpn || book.title
    if (!title) return { ok: false, error: '该漫画没有标题' }
    const info = await extractBookInfo(title, setting)
    const changes = mergeBookInfo(book, info)
    if (changes.length) await saveBookToDatabase(book)
    return { ok: true, book, changes }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

// AI 综合信息处理(批量,可暂停)
ipcMain.handle('ai-process-books-batch', async (event, force = false) => {
  if (setting.titleTranslationMode === 'off' || !setting.titleTranslationMode) {
    const msg = 'AI功能未启用,请先在 设置 → AI功能 中选择模式(本地AI或在线API)'
    sendMessageToWebContents(msg)
    return { total: 0, success: 0, failed: 0, error: msg }
  }
  const bookList = await loadBookListFromDatabase()
  const targets = bookList.filter(b => !b.isCollection && (force || !b.title_cn || !b.tags?.character?.length) && (b.title_jpn || b.title))
  const total = targets.length
  if (total === 0) {
    sendMessageToWebContents('AI信息处理:没有需要处理的漫画')
    return { total: 0, success: 0, failed: 0 }
  }
  sendMessageToWebContents(`开始批量AI信息处理,共 ${total} 本(可随时暂停)`)
  let success = 0
  let failed = 0
  await runConcurrent(targets, 2, async (book, i) => {
    await waitIfAiPaused()
    try {
      const title = book.title_jpn || book.title
      const info = await extractBookInfo(title, setting)
      const changes = mergeBookInfo(book, info)
      if (changes.length) {
        await saveBookToDatabase(book)
        success++
      } else {
        failed++
      }
    } catch (e) {
      failed++
      console.error(`AI处理「${book.title_jpn || book.title}」失败:`, e.message || e)
    }
    if ((i + 1) % 10 === 0 || i + 1 === total) {
      sendMessageToWebContents(`AI信息处理进度: ${i + 1}/${total}(成功 ${success},失败 ${failed})`)
    }
  })
  sendMessageToWebContents(`AI信息处理完成:共 ${total} 本,成功 ${success},失败 ${failed}`)
  return { total, success, failed }
})

// 分析单本漫画标题中的角色与出处,合并写入元数据(tags.character / tags.parody)
ipcMain.handle('analyze-book-title-characters', async (event, book) => {
  try {
    if (!book || book.isCollection) return { ok: false, error: '无效的漫画' }
    const title = book.title_jpn || book.title
    if (!title) return { ok: false, error: '该漫画没有标题' }
    const result = await analyzeTitleCharacters(title, setting)
    if (!result.length) return { ok: true, book, added: [] }
    if (!book.tags) book.tags = {}
    if (!Array.isArray(book.tags.character)) book.tags.character = []
    if (!Array.isArray(book.tags.parody)) book.tags.parody = []
    const added = []
    for (const item of result) {
      if (item.character && !book.tags.character.includes(item.character)) {
        book.tags.character.push(item.character)
        added.push(item.character)
      }
      if (item.parody && item.parody !== '未知' && !book.tags.parody.includes(item.parody)) {
        book.tags.parody.push(item.parody)
      }
    }
    await saveBookToDatabase(book)
    return { ok: true, book, added }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

// 批量分析标题角色(无角色标签的漫画),后台并发执行
ipcMain.handle('analyze-book-titles-characters-batch', async (event, force = false) => {
  if (setting.titleTranslationMode === 'off' || !setting.titleTranslationMode) {
    const msg = 'AI功能未启用,请先在 设置 → AI功能 中选择模式(本地AI或在线API)'
    sendMessageToWebContents(msg)
    return { total: 0, success: 0, failed: 0, error: msg }
  }
  const bookList = await loadBookListFromDatabase()
  const targets = bookList.filter(b => !b.isCollection && (force || !b.tags?.character?.length) && (b.title_jpn || b.title))
  const total = targets.length
  if (total === 0) {
    sendMessageToWebContents('AI角色分析:没有需要分析的标题')
    return { total: 0, success: 0, failed: 0 }
  }
  sendMessageToWebContents(`开始批量分析标题角色,共 ${total} 本`)
  let success = 0
  let failed = 0
  await runConcurrent(targets, 2, async (book, i) => {
    await waitIfAiPaused()
    try {
      const title = book.title_jpn || book.title
      const result = await analyzeTitleCharacters(title, setting)
      if (result.length) {
        if (!book.tags) book.tags = {}
        if (!Array.isArray(book.tags.character)) book.tags.character = []
        if (!Array.isArray(book.tags.parody)) book.tags.parody = []
        for (const item of result) {
          if (item.character && !book.tags.character.includes(item.character)) book.tags.character.push(item.character)
          if (item.parody && item.parody !== '未知' && !book.tags.parody.includes(item.parody)) book.tags.parody.push(item.parody)
        }
        await saveBookToDatabase(book)
        success++
      } else {
        failed++
      }
    } catch (e) {
      failed++
      console.error(`分析「${book.title_jpn || book.title}」失败:`, e.message || e)
    }
    if ((i + 1) % 10 === 0 || i + 1 === total) {
      sendMessageToWebContents(`AI角色分析进度: ${i + 1}/${total}(成功 ${success},失败 ${failed})`)
    }
  })
  sendMessageToWebContents(`AI角色分析完成:共 ${total} 本,成功 ${success},失败 ${failed}`)
  return { total, success, failed }
})

// 图片超分:优先调用本地超分 API(如 Real-ESRGAN / Waifu2x 服务),否则内置 sharp 2x 放大
// ---------- AI:列出某本书的全部图片(供任务运行器遍历) ----------
ipcMain.handle('ai-list-images', async (event, book = {}) => {
  try {
    if (!book || !book.filepath) return { ok: false, error: '缺少书籍路径' }
    const list = await getImageListByBook(book.filepath, book.type)
    const images = (list || []).map(x => (x && (x.absolutePath || x.path)) || x).filter(p => typeof p === 'string' && p)
    return { ok: true, images }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})
// ---------- AI:文字翻译(文字处理模型) ----------
const resolveAiProfile = (profileId, fallback = {}) => {
  const list = Array.isArray(setting.aiApiProfiles) ? setting.aiApiProfiles : []
  const p = list.find(x => x && x.id === profileId)
  if (p) return { baseUrl: p.baseUrl, model: p.model, apiKey: p.apiKey }
  return fallback
}
ipcMain.handle('ai-translate-text', async (event, payload = {}) => {
  try {
    const text = String(payload.text || '').trim()
    if (!text) return { ok: false, error: '无文本' }
    const prof = resolveAiProfile(payload.profileId, { baseUrl: setting.openaiBaseUrl, model: setting.openaiModel, apiKey: setting.openaiApiKey })
    let base = String(prof.baseUrl || '').trim().replace(/\/+$/, '')
    if (!base) return { ok: false, error: '未配置文字处理模型' }
    if (!/^https?:\/\//i.test(base)) base = 'http://' + base
    const target = payload.targetLang || setting.translateTargetLang || 'zh-CN'
    const res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(prof.apiKey ? { Authorization: 'Bearer ' + prof.apiKey } : {}) },
      body: JSON.stringify({
        model: prof.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '你是漫画翻译引擎。把用户提供的文本翻译成目标语言,只输出译文,不要解释。目标语言:' + target },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
      }),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const json = await res.json()
    const out = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || ''
    return { ok: true, text: out.trim(), target }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})
// ---------- AI:保存文本产物(漫画文件夹 / 仅预览 / 不保存) ----------
ipcMain.handle('ai-save-text', async (event, payload = {}) => {
  try {
    const mode = payload.mode || 'preview'
    if (mode !== 'folder') return { ok: true, saved: false, text: payload.text }
    const book = payload.book || {}
    const dir = book.type === 'folder' && book.filepath ? book.filepath : path.dirname(book.filepath || '')
    if (!dir) return { ok: false, error: '无法确定保存目录' }
    const name = payload.fileName || 'ai_translate.txt'
    const out = path.join(dir, name)
    await fs.promises.writeFile(out, String(payload.text || ''), 'utf-8')
    return { ok: true, saved: true, path: out }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})
// ---------- AI:单张上色(按保存位置写回) ----------
ipcMain.handle('ai-colorize-image', async (event, payload = {}) => {
  try {
    const filepath = payload.filepath
    if (!filepath) return { ok: false, error: '未指定图片' }
    const prof = resolveAiProfile(payload.profileId, { baseUrl: setting.colorizeApiUrl, model: setting.colorizeApiModel, apiKey: setting.colorizeApiKey })
    let base = String(prof.baseUrl || '').trim().replace(/\/+$/, '')
    if (!base) return { ok: false, error: '未配置上色模型' }
    if (!/^https?:\/\//i.test(base)) base = 'http://' + base
    const buf = await fs.promises.readFile(filepath)
    const res = await fetch(base + '/colorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', ...(prof.apiKey ? { Authorization: 'Bearer ' + prof.apiKey } : {}) },
      body: buf,
    })
    if (!res.ok) throw new Error('上色 API HTTP ' + res.status)
    const ct = res.headers.get('content-type') || ''
    let outBuf = Buffer.from(await res.arrayBuffer())
    if (ct.includes('application/json')) {
      const j = JSON.parse(outBuf.toString('utf-8'))
      const b64 = (j.image || j.data || '').replace(/^data:image\/\w+;base64,/, '')
      outBuf = Buffer.from(b64, 'base64')
    }
    const mode = setting.colorizeSaveMode || 'same'
    const ext = path.extname(filepath) || '.jpg'
    let target
    if (mode === 'replace') {
      const backup = filepath + '.bak'
      try { await fs.promises.copyFile(filepath, backup) } catch (e) { /* ignore */ }
      target = filepath
    } else if (mode === 'preview') {
      target = path.join(VIEWER_PATH, 'colorized_' + nanoid(8) + ext)
    } else {
      target = filepath.replace(new RegExp(ext + '$'), '_colorized' + ext)
    }
    await fs.promises.writeFile(target, outBuf)
    return { ok: true, path: target, mode }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})
// ---------- 本地超分模型(Real-ESRGAN / waifu2x)管理 ----------
// 模型下载/解压/删除都是真实文件操作;进度通过 'local-model-progress' 事件推送
// (桌面版走 webContents.send,网页版走 SSE,前端统一用 ipcRenderer.on 接收)
const sendLocalModelProgress = (payload) => {
  if (WEB_MODE) {
    require('./web-electron-shim.js').broadcast('local-model-progress', payload)
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('local-model-progress', payload)
  }
}

ipcMain.handle('local-model-list', async () => ({
  ok: true,
  platform: localModels.PLATFORM,
  modelsRoot: path.dirname(localModels.installDirOf('__placeholder__')),
  current: String(setting.localUpscaleEngine || ''),
  models: localModels.list(),
}))

ipcMain.handle('local-model-download', async (event, id) => {
  if (localModels.tasks.has(id)) return { ok: false, error: '该模型正在下载中' }
  const started = localModels.list().some(m => m.id === id)
  if (!started) return { ok: false, error: '未知的模型: ' + id }
  sendLocalModelProgress({ id, phase: 'start', percent: 0, message: '准备下载…' })
  // 后台执行,立即返回让前端显示进度
  setImmediate(async () => {
    const res = await localModels.download(id, (prog) => sendLocalModelProgress({ id, ...prog }))
    if (res.ok) {
      sendLocalModelProgress({ id, phase: 'installed', percent: 100, message: '安装完成' })
    } else if (res.cancelled) {
      sendLocalModelProgress({ id, phase: 'cancelled', percent: 0, message: '已取消' })
    } else {
      sendLocalModelProgress({ id, phase: 'error', percent: 0, message: res.error || '下载失败', error: res.error || '' })
    }
  })
  return { ok: true, started: true }
})

ipcMain.handle('local-model-cancel', async (event, id) => localModels.cancel(id))

ipcMain.handle('local-model-delete', async (event, id) => {
  const res = localModels.remove(id)
  // 删掉的正好是当前选用的引擎:顺带清空选择,避免超分时报「未安装」
  if (res.ok && String(setting.localUpscaleEngine || '') === id) {
    setting.localUpscaleEngine = ''
    persistSetting()
  }
  return res
})

ipcMain.handle('local-model-open-dir', async (event, id) => {
  const dir = localModels.installDirOf(id || '')
  try {
    fs.mkdirSync(dir, { recursive: true })
    const err = await shell.openPath(dir)
    return { ok: !err, error: err || '' }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
})

// ---------- 超分结果的落盘 ----------
// 保存方式(setting.upscaleSaveMode):
//   preview 仅预览(留在 viewer 临时目录)
//   same    另存到原图所在目录(文件名加 _upscaled;压缩包内的图解压产物是临时的,
//           这种情况统一存到 <数据目录>/upscaled/)
//   replace 覆盖原文件(先备份 .bak;压缩包内的图无法回写,退化为另存)
const uniquePath = (p) => {
  if (!fs.existsSync(p)) return p
  const ext = path.extname(p)
  const stem = p.slice(0, p.length - ext.length)
  for (let n = 2; n < 1000; n++) {
    const cand = stem + ' (' + n + ')' + ext
    if (!fs.existsSync(cand)) return cand
  }
  return p
}

// 按目标扩展名转存(保持原图格式,避免把 png 存成 jpg 掉透明通道)
const writeImageAs = async (srcImage, targetPath) => {
  const ext = path.extname(targetPath).toLowerCase()
  const pipe = sharp(srcImage, { failOnError: false })
  if (ext === '.png') await pipe.png().toFile(targetPath)
  else if (ext === '.webp') await pipe.webp({ quality: 95 }).toFile(targetPath)
  else if (ext === '.avif') await pipe.avif({ quality: 60 }).toFile(targetPath)
  else await pipe.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toFile(targetPath)
}

const isTempImage = (p) => p.startsWith(VIEWER_PATH + path.sep) || p.startsWith(TEMP_PATH + path.sep)

// 文件名后缀:原名_<模型>_<倍数>x(如 10_waifu2x_2x.jpg),便于一眼看出是超分产物
const safeFileTag = (v) => String(v || '').replace(/[^A-Za-z0-9._-]/g, '') || 'upscale'
const fmtScale = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return '2'
  return String(Math.round(n * 100) / 100)
}

const persistUpscaled = async (srcFilepath, tmpOutPath, meta = {}) => {
  // meta.forcePreview:自动超分(阅读器内放大显示)只用于显示,绝不落盘
  const mode = meta.forcePreview ? 'preview' : String(meta.modeOverride || setting.upscaleSaveMode || 'same')
  const suffix = '_' + safeFileTag(meta.engineName) + '_' + fmtScale(meta.scale) + 'x'
  if (mode === 'preview') {
    return { mode, saved: false, path: tmpOutPath, savePath: '', note: '仅预览,未写入文件' }
  }
  const ext = path.extname(srcFilepath) || '.jpg'
  const fromArchive = isTempImage(srcFilepath)
  if (mode === 'replace' && !fromArchive) {
    try { await fs.promises.copyFile(srcFilepath, srcFilepath + '.bak') } catch (e) {}
    await writeImageAs(tmpOutPath, srcFilepath)
    await fs.promises.rm(tmpOutPath, { force: true }).catch(() => {})
    return { mode: 'replace', saved: true, path: srcFilepath, savePath: srcFilepath, note: '已替换原文件(旧文件备份为 .bak)' }
  }
  let target, note = ''
  if (fromArchive) {
    // 压缩包里的图:解压产物是临时的,统一存到数据目录下的 upscaled/
    const dir = path.join(STORE_PATH, 'upscaled')
    await fs.promises.mkdir(dir, { recursive: true })
    target = path.join(dir, path.basename(srcFilepath, ext) + suffix + ext)
    if (mode === 'replace') note = '原图在压缩包内,无法替换,已另存'
  } else {
    const dir = path.dirname(srcFilepath)
    const stem = path.basename(srcFilepath, ext)
    target = path.join(dir, stem + suffix + ext)
  }
  target = uniquePath(target)
  await writeImageAs(tmpOutPath, target)
  await fs.promises.rm(tmpOutPath, { force: true }).catch(() => {})
  return { mode, saved: true, path: target, savePath: target, note }
}

// 列出某个模型可用的权重(已安装时)
ipcMain.handle('local-model-weights', async (event, id) => ({
  ok: true,
  id,
  weights: localModels.listWeights(id),
  schema: localModels.OPTION_SCHEMA[id] || [],
  options: Object.assign({}, localModels.defaultOptionsOf(id), (setting.localUpscaleOptions || {})[id] || {}),
}))
// options.previewOnly:只返回预览结果,不写入任何文件(阅读器「自动超分放大」用)
// options.skipFilter :跳过「超分过滤设置」的阈值判定(自动超分的前提就是图被放大显示)
ipcMain.handle('upscale-image', async (event, filepath, options) => {
  const opt = options && typeof options === 'object' ? options : {}
  try {
    if (!filepath) return { ok: false, error: '未指定图片' }
    const srcStat = await fs.promises.stat(filepath).catch(() => null)
    if (!srcStat || !srcStat.isFile()) return { ok: false, error: '找不到原图: ' + filepath }

    // ---------- 超分过滤 ----------
    // 「设置 → 功能 → 图片超分 → 过滤设置」:宽和高都 ≥ 阈值的图片视为已足够清晰,直接跳过超分。
    // 默认阈值 1200×2000(旧配置没有这些键时用默认值);某一方向填 0 表示该方向不限制。
    if (setting.upscaleSkipHighRes !== false && !opt.skipFilter) {
      const numOr = (v, dft) => {
        if (v === undefined || v === null || v === '') return dft
        const n = Number(v)
        return Number.isFinite(n) ? Math.max(0, Math.round(n)) : dft
      }
      const minW = numOr(setting.upscaleSkipWidth, 1200)
      const minH = numOr(setting.upscaleSkipHeight, 2000)
      if (minW > 0 || minH > 0) {
        let srcW = 0, srcH = 0
        try {
          const m0 = await sharp(filepath, { failOnError: false }).metadata()
          srcW = m0.width || 0
          srcH = m0.height || 0
        } catch (e) { /* 读不出尺寸就不跳过,按原流程超分 */ }
        if (srcW > 0 && srcH > 0 && srcW >= minW && srcH >= minH) {
          return {
            ok: true,
            skipped: true,
            width: srcW,
            height: srcH,
            minWidth: minW,
            minHeight: minH,
            reason: '图片 ' + srcW + '×' + srcH + ' 已达过滤阈值 ' + minW + '×' + minH + ',跳过超分',
          }
        }
      }
    }

    const tmpOut = path.join(TEMP_PATH, 'upscale_' + nanoid(8) + '.png')

    // 引擎优先级:本地模型 > API 服务 > 内置 Lanczos。
    // options.engine = 'local:<id>' / 'api:<profileId>' 时覆盖设置里的选择(阅读器「自动超分放大」用)。
    const engineOverride = String(opt.engine || '')
    const overrideLocal = engineOverride.startsWith('local:') ? engineOverride.slice(6) : ''
    const overrideApi = engineOverride.startsWith('api:') ? engineOverride.slice(4) : ''
    const localEngine = overrideLocal || (engineOverride ? '' : String(setting.localUpscaleEngine || ''))
    const apiProfileId = overrideApi || (engineOverride ? '' : String(setting.upscaleApiProfileId || ''))
    const upProf = (Array.isArray(setting.aiApiProfiles) ? setting.aiApiProfiles : []).find(p => p && p.id === apiProfileId)
    let apiUrl = (setting.upscaleApiUrl || '').trim()
    let apiKey = ''
    if (upProf && upProf.baseUrl) {
      apiUrl = String(upProf.baseUrl).trim().replace(/\/+$/, '')
      if (!/^https?:\/\//i.test(apiUrl)) apiUrl = 'http://' + apiUrl
      apiUrl = apiUrl + '/upscale'
      apiKey = upProf.apiKey || ''
    }
    // API / 内置缩放用的倍数(输出尺寸与倍数已从设置界面移除,这里保留旧字段做兼容)
    const legacyScale = Math.min(Math.max(Number(setting.upscaleScale) || 2, 1), 8)
    let engine = ''
    let engineName = ''      // 文件名里用的引擎短名
    let scaleUsed = 2        // 文件名里用的倍数

    if (localEngine) {
      // 参数来自「本地模型」里该模型自己的设置
      const opts = Object.assign({}, localModels.defaultOptionsOf(localEngine), (setting.localUpscaleOptions || {})[localEngine] || {})
      await localModels.runUpscale(localEngine, filepath, tmpOut, opts)
      engine = 'local:' + localEngine
      engineName = localEngine
      scaleUsed = Number(opts.scale) || (localEngine === 'realesrgan' ? 4 : 2)
    } else if (apiUrl) {
      const buf = await fs.promises.readFile(filepath)
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}), 'X-Upscale-Scale': String(legacyScale) },
        body: buf,
        timeout: 300000
      })
      if (!res.ok) throw new Error('超分 API 请求失败: HTTP ' + res.status)
      const resBuf = Buffer.from(await res.arrayBuffer())
      const contentType = res.headers.get('content-type') || ''
      let imageBuf = resBuf
      if (!contentType.includes('image/') && resBuf.length && resBuf[0] !== 0xFF && resBuf[0] !== 0x89) {
        try {
          const data = JSON.parse(resBuf.toString('utf-8'))
          const b64 = data.image || data.base64 || data.data
          if (!b64) throw new Error('超分 API 响应格式不正确(需返回图片二进制或 {image: base64})')
          imageBuf = Buffer.from(String(b64).replace(/^data:image\/\w+;base64,/, ''), 'base64')
        } catch (e) {
          if (e.message.includes('超分 API 响应格式')) throw e
          throw new Error('超分 API 响应格式不正确(需返回图片二进制或 {image: base64})')
        }
      }
      await sharp(imageBuf, { failOnError: false }).png().toFile(tmpOut)
      engine = 'api'
      engineName = 'api'
      scaleUsed = legacyScale
    } else {
      // 内置:Lanczos3 放大 2 倍 + 轻度锐化(非 AI)
      const meta = await sharp(filepath, { failOnError: false }).metadata()
      const srcW = meta.width || 1000
      const srcH = meta.height || 1400
      await sharp(filepath, { failOnError: false })
        .resize({ width: Math.round(srcW * 2), height: Math.round(srcH * 2), kernel: 'lanczos3', fit: 'fill' })
        .sharpen({ sigma: 0.8, m1: 0.6, m2: 0.4 })
        .png()
        .toFile(tmpOut)
      engine = 'local-resize'
      engineName = 'lanczos'
      scaleUsed = 2
    }

    const persisted = await persistUpscaled(filepath, tmpOut, { engineName, scale: scaleUsed, forcePreview: !!opt.previewOnly, modeOverride: opt.saveMode })
    let width = 0, height = 0
    try {
      const m = await sharp(persisted.path, { failOnError: false }).metadata()
      width = m.width || 0; height = m.height || 0
    } catch (e) {}
    return { ok: true, engine, path: persisted.path, savePath: persisted.savePath, saved: persisted.saved, mode: persisted.mode, note: persisted.note, width, height }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

// 图片文字提取:优先调用独立 OCR API(OpenAI 兼容),否则用标题翻译 AI 配置
ipcMain.handle('extract-image-text', async (event, filepath) => {
  try {
    if (!filepath) return { ok: false, error: '未指定图片' }
    // 优先使用「功能 → 信息处理 → 文字提取模型」里选择的 API 配置(OpenAI 兼容视觉接口)
    const prof = (Array.isArray(setting.aiApiProfiles) ? setting.aiApiProfiles : []).find(p => p && p.id === setting.ocrApiProfileId)
    if (prof && prof.baseUrl) {
      let base = String(prof.baseUrl).trim().replace(/\/+$/, '')
      if (!/^https?:\/\//i.test(base)) base = 'http://' + base
      const buf = await fs.promises.readFile(filepath)
      const ext = (path.extname(filepath) || '.jpg').replace('.', '')
      const dataUrl = 'data:image/' + (ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : 'jpeg') + ';base64,' + buf.toString('base64')
      const res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(prof.apiKey ? { Authorization: 'Bearer ' + prof.apiKey } : {}) },
        body: JSON.stringify({
          model: prof.model || 'qwen2.5-vl:7b',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: '提取这张漫画图片里的全部文字,按阅读顺序输出纯文本,不要翻译、不要解释、不要多余说明;没有文字就输出空。' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          }],
          temperature: 0.1,
        }),
      })
      if (!res.ok) throw new Error('文字提取 API HTTP ' + res.status)
      const json = await res.json()
      const out = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || ''
      return { ok: true, text: String(out).trim(), via: 'profile' }
    }
    const ocrUrl = (setting.ocrApiUrl || '').trim()
    if (ocrUrl) {
      const model = setting.ocrApiModel || setting.titleTranslationModel || 'qwen2.5-vl:7b'
      const text = await extractImageTextWithUrl(filepath, ocrUrl, model, setting)
      return { ok: true, text: text || '' }
    }
    const text = await extractImageText(filepath, setting)
    return { ok: true, text: text || '' }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

// 重命名阅读器中的图片文件(仅文件夹类型支持)
ipcMain.handle('rename-image', async (event, { oldPath, newName } = {}) => {
  try {
    if (!oldPath || !newName) return { ok: false, error: '参数错误' }
    const base = path.basename(oldPath)
    const ext = path.extname(base)
    let name = String(newName).trim()
    if (!name) return { ok: false, error: '文件名不能为空' }
    if (/[\\/:*?"<>|]/.test(name)) return { ok: false, error: '文件名包含非法字符' }
    if (ext && !name.toLowerCase().endsWith(ext.toLowerCase())) name += ext
    const newPath = path.join(path.dirname(oldPath), name)
    if (newPath === oldPath) return { ok: false, error: '新文件名与旧文件名相同' }
    if (fs.existsSync(newPath)) return { ok: false, error: '目标文件名已存在' }
    await fs.promises.rename(oldPath, newPath)
    return { ok: true, path: newPath }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

// 重命名标签:更新全库所有漫画中该标签(某分类下)的名称
// 把「标签变更」写回每个库的 Mangas 表。
// 传进来的 mutate(tags) 返回新的 tags(或 null = 这本书不用改)。
// 与 move-tag-category 完全同口径:某个库写失败只记日志,不影响其它库与 metadata。
const writeTagToLibraries = async (mutate) => {
  for (const lib of boxLibraries()) {
    try {
      const model = await modelForLibrary(lib.id)
      const books = await model.findAll({ attributes: ['id', 'tags'] })
      for (const book of books) {
        const tags = book.tags
        if (!tags || typeof tags !== 'object') continue
        const nextTags = mutate(tags)
        if (!nextTags) continue
        await model.update({ tags: nextTags }, { where: { id: book.id } })
      }
    } catch (e) {
      console.error('[tags] 写回库失败(' + String(lib.name || lib.id) + '):', String((e && e.message) || e))
    }
  }
}

// 改名时,把「以标签名为键」的用户配置一起搬走:
//   tagColors(Map: 'cat::tag' -> 颜色) / tagNameLangs(Map) / tagRelations(Map: 'cat::tag' -> {contains, containedBy})
// 不搬的话:改完名颜色没了、译文没了、集合关系断了 —— 用户看到「改个名字全丢了」。
const renameKeyedTagConfigs = (cat, oldName, newName) => {
  const oldKey = cat + '::' + oldName
  const newKey = cat + '::' + newName
  const remap = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
    // 只处理「键里带 :: 」的映射表(ANDC 的 tagColors/tagNameLangs/tagRelations 都是这种形状)
    const keys = Object.keys(obj)
    if (!keys.some(k => k.includes('::'))) return false
    let changed = false
    if (Object.prototype.hasOwnProperty.call(obj, oldKey)) {
      const v = obj[oldKey]
      delete obj[oldKey]
      obj[newKey] = v
      changed = true
    }
    // tagRelations 里别的条目可能「引用」了这个标签名(contains / containedBy)
    for (const k of Object.keys(obj)) {
      const v = obj[k]
      if (!v || typeof v !== 'object') continue
      for (const f of ['contains', 'containedBy']) {
        const arr = v[f]
        if (!Array.isArray(arr)) continue
        if (!arr.includes(oldKey)) continue
        v[f] = [...new Set(arr.map(x => (x === oldKey ? newKey : x)))]
        changed = true
      }
    }
    return changed
  }
  let dirty = false
  for (const f of ['tagColors', 'tagNameLangs', 'tagRelations', 'tagCatOrder']) {
    if (remap(setting[f])) dirty = true
  }
  if (dirty) { try { persistSettingNow() } catch (e) { /* 忽略 */ } }
}

ipcMain.handle('rename-tag', async (event, { cat, oldName, newName } = {}) => {
  try {
    if (!cat || !oldName || !newName) return { ok: false, error: '参数错误' }
    if (oldName === newName) return { ok: true, count: 0 }
    // 标签是全局的(metadata.sqlite):遍历全部元数据行,不受当前库/切换框影响
    const rows = await Metadata.findAll()
    let count = 0
    // 整批一个事务:否则几千行 = 几千次「建 journal → 提交 → 删 journal」,
    // 在网络盘上会把 NAS 日志刷爆而且极慢(用户反馈过)
    await Metadata.sequelize.transaction(async (tx) => {
      for (const row of rows) {
        const tags = row.tags
        if (!tags || typeof tags !== 'object') continue
        const keys = Object.keys(tags).filter(k => sameCat(k, cat) && Array.isArray(tags[k]) && tags[k].includes(oldName))
        if (!keys.length) continue
        const nextTags = { ...tags }
        for (const k of keys) {
          const mapped = [...new Set(nextTags[k].map(v => (v === oldName ? newName : v)))]
          nextTags[k] = mapped
        }
        await Metadata.update({ tags: nextTags }, { where: { hash: row.hash }, transaction: tx })
        count++
      }
    })
    // ⚠ 各库 Mangas 里也必须改名(与 move-tag-category 同口径)。
    //   书架卡片/详情读的是**库数据库**里的 book.tags,只改 metadata 的话
    //   会出现「设置页显示新名、书架还是旧名」的两份数据打架。
    await writeTagToLibraries((tags) => {
      const keys = Object.keys(tags).filter(k => sameCat(k, cat) && Array.isArray(tags[k]) && tags[k].includes(oldName))
      if (!keys.length) return null
      const nextTags = { ...tags }
      for (const k of keys) nextTags[k] = [...new Set(nextTags[k].map(v => (v === oldName ? newName : v)))]
      return nextTags
    })
    // ★ 还要改「全局标签登记表」以及所有「以标签名为键」的用户配置。
    //   事故:用「新增标签」建的全局标签只存在 setting.globalTags 里(不在 any 书上),
    //   上面的 Metadata 遍历命中 0 行 → rename-tag 返回 ok 但什么都没改,
    //   Setting.vue 里双击改名对它完全无效。
    const renameInGlobalTags = () => {
      const gs = setting.globalTags
      if (!gs || typeof gs !== 'object') return null
      let changed = false
      const next = {}
      for (const [k, arr] of Object.entries(gs)) {
        if (!Array.isArray(arr)) { next[k] = arr; continue }
        if (!sameCat(k, cat)) { next[k] = arr; continue }
        const mapped = arr.map(v => (v === oldName ? newName : v))
        if (arr.includes(oldName)) changed = true
        next[k] = [...new Set(mapped)]
      }
      return changed ? next : null
    }
    const gNext = renameInGlobalTags()
    if (gNext) { setting.globalTags = gNext; count += 1 }
    // 以「cat::name」为键的配置也要跟着改:否则改完名颜色/译文/关系全丢
    try { renameKeyedTagConfigs(cat, oldName, newName) } catch (e) { /* 忽略:配置是可选增强 */ }
    if (gNext) { try { persistSettingNow() } catch (e) { /* 忽略 */ } }
    return { ok: true, count }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

// 单个标签换类别(可同时改名):标签设置 → 编辑标签 里改类别用。
// 与 rename-tag 同口径:遍历全局 metadata.sqlite,整批一个事务。
// 类别键在库里可能是中英混用(character / 角色):统一用「同组别名」匹配
const TAG_CAT_GROUPS = [
  ['character', '角色'],
  ['parody', '作品', '原作'],
  ['group', '社团', '社團', '团队'],
  ['artist', '作者', '艺术家', '藝術家'],
  ['female', '女性'],
  ['male', '男性'],
  ['mixed', '混合'],
  ['language', '语言', '語言'],
  ['other', '其他'],
  ['cosplayer', 'Cosplay'],
]
const tagCatGroup = (cat) => TAG_CAT_GROUPS.find(g => g.includes(String(cat || ''))) || [String(cat || '')]
const sameCat = (a, b) => {
  if (a === b) return true
  const ga = tagCatGroup(a)
  return ga.includes(b) || tagCatGroup(b).some(x => ga.includes(x))
}

// 单个标签换类别(可同时改名):标签设置 → 编辑标签 里改类别用。
// 与 rename-tag 同口径:遍历全局 metadata.sqlite,整批一个事务。
ipcMain.handle('move-tag', async (event, { fromCat, name, toCat, newName, dryRun } = {}) => {
  try {
    if (!fromCat || !name || !toCat) return { ok: false, error: '参数错误' }
    const finalName = String(newName || name)
    const rows = await Metadata.findAll()
    let count = 0
    await Metadata.sequelize.transaction(async (tx) => {
      for (const row of rows) {
        const tags = row.tags
        if (!tags || typeof tags !== 'object') continue
        // 找到这本书里属于「旧类别」的所有键(可能既有 character 又有 角色)
        const fromKeys = Object.keys(tags).filter(k => sameCat(k, fromCat) && Array.isArray(tags[k]) && tags[k].includes(name))
        if (!fromKeys.length) continue
        const nextTags = { ...tags }
        for (const k of fromKeys) {
          const left = nextTags[k].filter(v => v !== name)
          if (left.length) nextTags[k] = left
          else delete nextTags[k]
        }
        // 目标类别:沿用书里已有的同组键,没有就用传入的 toCat
        const targetKey = Object.keys(nextTags).find(k => sameCat(k, toCat) && Array.isArray(nextTags[k])) || toCat
        const target = Array.isArray(nextTags[targetKey]) ? nextTags[targetKey].slice() : []
        if (!target.includes(finalName)) target.push(finalName)
        nextTags[targetKey] = target
        if (!dryRun) await Metadata.update({ tags: nextTags }, { where: { hash: row.hash }, transaction: tx })
        count++
      }
    })
    // ⚠ 各库 Mangas 同步(与 rename-tag 同口径):否则书架还是旧名/旧类别。
    if (!dryRun) {
      await writeTagToLibraries((tags) => {
        const fromKeys = Object.keys(tags).filter(k => sameCat(k, fromCat) && Array.isArray(tags[k]) && tags[k].includes(name))
        if (!fromKeys.length) return null
        const nextTags = { ...tags }
        for (const k of fromKeys) {
          const left = nextTags[k].filter(v => v !== name)
          if (left.length) nextTags[k] = left
          else delete nextTags[k]
        }
        const targetKey = Object.keys(nextTags).find(k => sameCat(k, toCat) && Array.isArray(nextTags[k])) || toCat
        const target = Array.isArray(nextTags[targetKey]) ? nextTags[targetKey].slice() : []
        if (!target.includes(finalName)) target.push(finalName)
        nextTags[targetKey] = target
        return nextTags
      })
    }
    return { ok: true, count }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

// 删除标签:从全库所有漫画中移除该分类下的这个标签
ipcMain.handle('delete-tag', async (event, { cat, name } = {}) => {
  try {
    if (!cat || !name) return { ok: false, error: '参数错误' }
    // 标签是全局的(metadata.sqlite):遍历全部元数据行,不受当前库/切换框影响
    const rows = await Metadata.findAll()
    let count = 0
    // 同改名:整批一个事务,避免几千次 journal 增删
    await Metadata.sequelize.transaction(async (tx) => {
      for (const row of rows) {
        const tags = row.tags
        const arr = tags && tags[cat]
        if (!Array.isArray(arr) || !arr.includes(name)) continue
        const next = arr.filter(v => v !== name)
        const nextTags = { ...tags }
        if (next.length) nextTags[cat] = next
        else delete nextTags[cat]
        await Metadata.update({ tags: nextTags }, { where: { hash: row.hash }, transaction: tx })
        count++
      }
    })
    // ★ 同时把它从「全局标签登记表」里摘掉(收口在这里,前端不必各调一遍)。
    //   事故:App.vue 的快捷删除只调 delete-tag,globalTags 不动,
    //   下次 save-setting 时 applySetting 又把它补回来 —— 用户看到「删了又回来」。
    //   删除 = 元数据 + 各库 Mangas + 登记表,三处一起清才干净。
    const dropFromGlobal = (gs) => {
      if (!gs || typeof gs !== 'object') return null
      let changed = false
      const next = {}
      for (const [k, arr] of Object.entries(gs)) {
        if (!Array.isArray(arr)) { next[k] = arr; continue }
        // 类别键中英混用(角色/character):用 sameCat 归一,否则只删一半
        const left = sameCat(k, cat) ? arr.filter(v => v !== name) : arr
        if (left.length !== arr.length) changed = true
        if (left.length) next[k] = left
      }
      return changed ? next : null
    }
    const g1 = dropFromGlobal(setting.globalTags)
    if (g1) { setting.globalTags = g1; try { persistSettingNow() } catch (e) { /* 忽略 */ } }
    const g2 = dropFromGlobal(setting.collectTag)
    if (g2) { setting.collectTag = g2; try { persistSettingNow() } catch (e) { /* 忽略 */ } }
    // ⚠ 各库 Mangas 同步删除(与 move-tag-category 同口径),
    //   否则书架卡片上那个标签会一直留着,而设置页已经没了 —— 两份数据打架。
    await writeTagToLibraries((tags) => {
      // 同样用 sameCat:库里可能存「角色」而传进来的是 character
      const keys = Object.keys(tags).filter(k => sameCat(k, cat) && Array.isArray(tags[k]) && tags[k].includes(name))
      if (!keys.length) return null
      const nextTags = { ...tags }
      for (const k of keys) {
        const next = nextTags[k].filter(v => v !== name)
        if (next.length) nextTags[k] = next
        else delete nextTags[k]
      }
      return nextTags
    })
    return { ok: true, count }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

// 整体迁移一个类别下的全部标签到另一个类别(删类别时把标签归入内置「其他」)
// 与 rename-tag / delete-tag 同一口径:遍历全局 metadata.sqlite,整批一个事务。
// 同时写回各库 Mangas 表,避免「Mangas 还是旧类别、Metadata 已是其他」的两份数据打架。
ipcMain.handle('move-tag-category', async (event, { from, to } = {}) => {
  try {
    if (!from || !to) return { ok: false, error: '参数错误' }
    if (from === to) return { ok: true, count: 0 }
    const rows = await Metadata.findAll()
    let count = 0
    await Metadata.sequelize.transaction(async (tx) => {
      for (const row of rows) {
        const tags = row.tags
        if (!tags || typeof tags !== 'object') continue
        // ⚠ 必须用 sameCat 找键:库里可能存中文「角色」而传进来是 character,
        //   用 tags[from] 精确匹配会一个都搬不走(类别删了、标签还挂在中文键下)。
        const fromKeys = Object.keys(tags).filter(k => sameCat(k, from) && Array.isArray(tags[k]) && tags[k].length)
        if (!fromKeys.length) continue
        const nextTags = { ...tags }
        const targetKey = Object.keys(nextTags).find(k => sameCat(k, to) && Array.isArray(nextTags[k])) || to
        const target = Array.isArray(nextTags[targetKey]) ? nextTags[targetKey].slice() : []
        for (const k of fromKeys) {
          for (const tag of nextTags[k]) if (!target.includes(tag)) target.push(tag)
          delete nextTags[k]
        }
        nextTags[targetKey] = target
        await Metadata.update({ tags: nextTags }, { where: { hash: row.hash }, transaction: tx })
        count++
      }
    })
    // 各库 Mangas 里的同一份标签也搬过去
    for (const lib of boxLibraries()) {
      try {
        const model = await modelForLibrary(lib.id)
        const books = await model.findAll({ attributes: ['id', 'tags'] })
        for (const book of books) {
          const tags = book.tags
          const arr = tags && tags[from]
          if (!Array.isArray(arr) || !arr.length) continue
          const nextTags = { ...tags }
          delete nextTags[from]
          const target = Array.isArray(nextTags[to]) ? nextTags[to].slice() : []
          for (const tag of arr) if (!target.includes(tag)) target.push(tag)
          nextTags[to] = target
          await model.update({ tags: nextTags }, { where: { id: book.id } })
        }
      } catch (e) {
        console.error('[tags] 迁移类别时写库失败(不影响元数据):', String((e && e.message) || e))
      }
    }
    return { ok: true, count }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

// 新增「全局标签」:不挂在任何一本书上,只登记到设置里,让标签列表能显示它。
// 表现与从书里来的标签完全一致(可在标签设置里看到、可被搜索到、可被分配到书)。
ipcMain.handle('add-global-tag', async (event, { cat, name } = {}) => {
  try {
    if (!cat || !name) return { ok: false, error: '参数错误' }
    if (!setting.globalTags || typeof setting.globalTags !== 'object') setting.globalTags = {}
    const arr = Array.isArray(setting.globalTags[cat]) ? setting.globalTags[cat].slice() : []
    if (!arr.includes(name)) arr.push(name)
    setting.globalTags[cat] = arr
    // 登记「前端还没确认这个新增」,防止它随后整份保存时把它冲掉
    notePendingGlobalTag(cat, name)
    persistSettingNow()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

// 从「全局标签登记表」里摘掉一个标签(只动 setting.globalTags,不碰书上的标签)。
// 前端「取消收藏/删除标签」用它,避免走 save-setting 整份回传时被并发保护并回来。
ipcMain.handle('remove-global-tag', async (event, { cat, name } = {}) => {
  try {
    if (!cat || name == null) return { ok: false, error: '参数错误' }
    const changed = removeGlobalTag(cat, name)
    if (changed) persistSettingNow()
    return { ok: true, removed: changed }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

// 同步一个类别下的标签集合:添加不存在的、删除被去掉的。
// 「添加」= 登记为全局标签(不挂任何书),「删除」= 从全库移除(等同 delete-tag 的批量版)。
ipcMain.handle('sync-category-tags', async (event, { cat, add = [], remove = [] } = {}) => {
  try {
    if (!cat) return { ok: false, error: '参数错误' }
    // ① 新增:登记到全局标签
    if (Array.isArray(add) && add.length) {
      if (!setting.globalTags || typeof setting.globalTags !== 'object') setting.globalTags = {}
      const arr = Array.isArray(setting.globalTags[cat]) ? setting.globalTags[cat].slice() : []
      for (const name of add) {
        if (!name) continue
        if (!arr.includes(name)) arr.push(name)
        notePendingGlobalTag(cat, name)
      }
      setting.globalTags[cat] = arr
      persistSettingNow()
    }
    // ② 删除:从全库移除这些标签
    let removed = 0
    if (Array.isArray(remove) && remove.length) {
      const rows = await Metadata.findAll()
      await Metadata.sequelize.transaction(async (tx) => {
        for (const row of rows) {
          const tags = row.tags
          const arr = tags && tags[cat]
          if (!Array.isArray(arr)) continue
          const kept = arr.filter(v => !remove.includes(v))
          if (kept.length === arr.length) continue
          const nextTags = { ...tags }
          if (kept.length) nextTags[cat] = kept
          else delete nextTags[cat]
          await Metadata.update({ tags: nextTags }, { where: { hash: row.hash }, transaction: tx })
          removed++
        }
      })
      for (const lib of boxLibraries()) {
        try {
          const model = await modelForLibrary(lib.id)
          const books = await model.findAll({ attributes: ['id', 'tags'] })
          for (const book of books) {
            const tags = book.tags
            const arr = tags && tags[cat]
            if (!Array.isArray(arr)) continue
            const kept = arr.filter(v => !remove.includes(v))
            if (kept.length === arr.length) continue
            const nextTags = { ...tags }
            if (kept.length) nextTags[cat] = kept
            else delete nextTags[cat]
            await model.update({ tags: nextTags }, { where: { id: book.id } })
          }
        } catch (e) { /* 单库失败不影响其它 */ }
      }
    }
    return { ok: true, removed }
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
})

ipcMain.on('get-path-sep', async (event, arg) => {
  event.returnValue = path.sep
})


// 初始化Express
const LANBrowsing = express()
// 局域网浏览端口:默认 23786,可用环境变量 LAN_PORT 覆盖(例如 Docker 部署时避免端口冲突)
const port = parseInt(process.env.LAN_PORT || '23786', 10)
const sortkey_map = {
  "date_added": {
    key: "date",
    type: "number"
  },
  "date_modified": {
    key: "mtime",
    type: "date"
  },
  "date_posted": {
    key: "posted",
    type: "number"
  },
  "size": {
    key: "bundleSize",
    type: "number"
  },
  "rating": {
    key: "rating",
    type: "number"
  },
  "read_count": {
    key: "readCount",
    type: "number"
  },
  "random": {}
}

// 设置静态文件夹
const staticFilePath = path.resolve(STORE_PATH, 'public')
fs.mkdirSync(staticFilePath, { recursive: true })
LANBrowsing.use('/static', express.static(staticFilePath))

let mangas = []
let tagTranslation = undefined

// sort
function compareItems(a, b, sortKey, ascending = false) {
  const sortConfig = sortkey_map[sortKey]
  if (!sortConfig) {
    throw new Error(`Invalid sort key: ${sortKey}`)
  }

  const { key, type } = sortConfig

  let valA = a[key]
  let valB = b[key]

  if (type === "number") {
    valA = Number(valA) || 0
    valB = Number(valB) || 0
  } else if (type === "date") {
    valA = new Date(valA).getTime() || 0
    valB = new Date(valB).getTime() || 0
  } else {
    valA = String(valA || "")
    valB = String(valB || "")
  }

  if (valA < valB) return ascending ? -1 : 1
  if (valA > valB) return ascending ? 1 : -1
  return 0
}

const getQueryValue = value => Array.isArray(value) ? value[0] : value

// 格式化标签（LANraragi 扩展按逗号分隔且不带空格）
const formatTags = (tags = {}) => {
  if (!tags || typeof tags !== 'object') return ''

  return Object.entries(tags)
    .map(([key, values]) => {
      const tagValues = Array.isArray(values) ? values : [values]
      return tagValues
        .filter(value => value !== undefined && value !== null && value !== '')
        .map(value => setting.showTranslation ? `${tagTranslation?.[key]?._name || key}:${tagTranslation?.[key]?.[value]?.name || value}` : `${key}:${value}`)
        .join(',')
    })
    .filter(Boolean)
    .join(',')
}

// 库里存的 filepath 是相对路径,两端分隔符不同(桌面 \、容器 /):
// 这些行可能来自「另一端写的库」,所以取文件名不能用 path.basename(容器里 \ 不算分隔符)
const crossBaseName = (p) => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || ''
const crossExtName = (p) => {
  const b = crossBaseName(p)
  const i = b.lastIndexOf('.')
  return i > 0 ? b.slice(i) : ''
}

const getLANArchiveTitle = (manga) => {
  if (manga.title_jpn && manga.title) return `${manga.title_jpn} || ${manga.title}`
  return manga.title_jpn || manga.title || crossBaseName(manga.filepath)
}

const getLANArchiveTags = (manga) => {
  const tags = manga.tags ? formatTags(manga.tags) : ''
  const extraTags = []
  const dateAdded = Math.floor(Number(manga.date) / 1000)
  if (dateAdded > 0) extraTags.push(`date_added:${dateAdded}`)
  return [tags, ...extraTags].filter(Boolean).join(',')
}

const mangaToLANraragiArchive = (manga) => ({
  arcid: manga.hash,
  extension: crossExtName(manga.filepath),
  filename: crossBaseName(manga.filepath),
  isnew: true,
  lastreadtime: 0,
  pagecount: Number(manga.pageCount || manga.filecount) || 0,
  progress: 0,
  size: Number(manga.filesize || manga.bundleSize) || 0,
  summary: null,
  tags: getLANArchiveTags(manga),
  title: getLANArchiveTitle(manga),
  category: manga.category || '',
  url: manga.url
})

const filterLANBrowsingMangas = (mangaList, query) => {
  const filter = String(getQueryValue(query.filter) || '').toLowerCase()
  const category = getQueryValue(query.category)
  const untaggedOnly = getQueryValue(query.untaggedonly) === 'true'

  return mangaList.filter(manga => {
    if (!manga.hash) return false
    if (category && manga.category !== category) return false
    if (untaggedOnly && manga.status !== 'non-tag' && !_.isEmpty(manga.tags)) return false
    if (!filter) return true

    return JSON.stringify(_.pick(manga, ['title', 'title_jpn', 'status', 'category', 'filepath', 'url'])).toLowerCase().includes(filter)
      || formatTags(manga.tags).toLowerCase().includes(filter)
  })
}

const sortLANBrowsingMangas = (mangaList, sortKey, ascending) => {
  if (sortKey === 'random') return _.shuffle(mangaList)
  if (!sortkey_map[sortKey]) return mangaList
  return mangaList.sort((a, b) => compareItems(a, b, sortKey, ascending))
}

ipcMain.handle('update-tag-translation', async (event, _tagTranslation) => {
  tagTranslation = _tagTranslation
})

LANBrowsing.get('/api/categories', async (req, res) => {
  try {
    const bookList = await loadBookListFromDatabase()
    const categories = [...new Set(bookList.map(manga => manga.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .map(category => ({ id: category, name: category, pinned: 0 }))

    res.json(categories)
  } catch (error) {
    res.status(500).send(error.message)
  }
})

LANBrowsing.get('/api/search', async (req, res) => {
  try {
    const start = parseInt(getQueryValue(req.query.start), 10) || 0
    const length = parseInt(getQueryValue(req.query.length), 10) || 200
    // 默认使用阅读次数排序, 来匹配 mihon 热门不带 sortby
    let sortKey = getQueryValue(req.query.sortby) || 'read_count'
    let showAll = false
    if (sortKey.includes('_all')) {
      sortKey = sortKey.replace('_all', '')
      showAll = true
    }

    mangas = await loadBookListFromDatabase()
    const totalRecords = mangas.filter(manga => manga.hash).length
    let filterMangas = filterLANBrowsingMangas(mangas, req.query)
    const recordsFiltered = filterMangas.length
    const ascending = getQueryValue(req.query.order) === 'asc'

    filterMangas = sortLANBrowsingMangas(filterMangas, sortKey, ascending)
    const pageMangas = showAll ? filterMangas : filterMangas.slice(start, start + length)

    const responseData = pageMangas.map(mangaToLANraragiArchive)
    const hash = createHash('md5').update(JSON.stringify(responseData)).digest('hex')
    res.json({
      data: responseData,
      hash,
      draw: 0,
      recordsFiltered,
      recordsTotal: totalRecords
    })
  } catch (error) {
    res.status(500).send(error.message)
  }
})

LANBrowsing.get('/api/search/random', async (req, res) => {
  try {
    const count = parseInt(getQueryValue(req.query.count), 10) || 1
    mangas = await loadBookListFromDatabase()
    const totalRecords = mangas.filter(manga => manga.hash).length
    const randomMangas = _.sampleSize(filterLANBrowsingMangas(mangas, req.query), count)

    const responseData = randomMangas.map(mangaToLANraragiArchive)
    const hash = createHash('md5').update(JSON.stringify(responseData)).digest('hex')
    res.json({
      data: responseData,
      hash,
      draw: 0,
      recordsFiltered: 0,
      recordsTotal: totalRecords
    })
  } catch (error) {
    console.error('Failed to fetch random Manga:', error)
    res.status(500).send('Internal Server Error')
  }
})

LANBrowsing.get('/api/archives/:hash/metadata', async (req, res) => {
  try {
    const mangaHash = req.params.hash

    if (_.isEmpty(mangas)) mangas = await loadBookListFromDatabase()
    const manga = mangas.find(manga => manga.hash === mangaHash)

    if (!manga) {
      return res.status(404).send('Manga not found')
    }

    res.json(mangaToLANraragiArchive(manga))
  } catch (error) {
    res.status(500).send(error.message)
  }
})

LANBrowsing.delete('/api/archives/:hash/isnew', async (req, res) => {
  res.status(204).send()
})

// 处理封面图片请求
LANBrowsing.get('/api/archives/:hash/thumbnail', async (req, res) => {
  const hash = req.params.hash
  const found = await findBookAcrossLibraries({ hash })
  const manga = found.row
  if (!manga || !manga.coverPath) {
    return res.status(404).send('Cover not found')
  }
  // 封面按 basename 落到「这本书所属库」的封面目录(库里存的 coverPath 可能是另一端的格式)
  const coverSrc = translateBookPath(manga.coverPath, 'coverPath', null, coverDirOf(libForRow(found)))
  const coverFilePath = path.join(staticFilePath, path.basename(coverSrc))
  await fs.promises.copyFile(coverSrc, coverFilePath)
  if (fs.existsSync(coverFilePath)) {
    res.sendFile(coverFilePath)
  } else {
    res.status(404).send('Cover file not found')
  }
})

let existBook = {
  hash: null,
  imageList: []
}

// 处理章节列表请求
LANBrowsing.get('/api/archives/:hash/files', async (req, res) => {
  try {
    const mangaHash = req.params.hash

    // 从数据库找到对应的漫画
    const found = await findBookAcrossLibraries({ hash: mangaHash })
    const manga = found.row

    if (!manga) {
      return res.status(404).send('Manga not found')
    }

    await clearFolder(VIEWER_PATH)
    await clearFolder(staticFilePath)
    const imageList = await getImageListByBook(localizeRowPath(manga, libForRow(found)), manga.type)

    existBook = {
      hash: manga.hash,
      imageList: imageList.map(p => p.absolutePath)
    }
    // 构造响应数据
    const responseFiles = {
      job: Date.now(), // 示例中的 job 可以是一个随机数或时间戳
      pages: imageList.map((file, index) => `/api/archives/${manga.hash}/page?path=${index + 1}`)
    }

    res.json(responseFiles)
  } catch (error) {
    res.status(500).send(error.message)
  }
})

// 处理章节图片请求
LANBrowsing.get('/api/archives/:hash/page', async (req, res) => {
  const hash = req.params.hash
  const page = parseInt(req.query.path, 10)
  if (isNaN(page) || page < 1) {
    return res.status(400).send('Invalid page number')
  }

  const found = await findBookAcrossLibraries({ hash })
  const manga = found.row
  if (!manga || !manga.filepath) {
    return res.status(404).send('File not found')
  }
  const bookPath = localizeRowPath(manga, libForRow(found))

  // 获取章节图片列表
  try {
    let imageList
    if (manga.hash === existBook.hash) {
      imageList = existBook.imageList
    } else {
      await clearFolder(VIEWER_PATH)
      await clearFolder(staticFilePath)
      imageList = await getImageListByBook(bookPath, manga.type)
      imageList = imageList.map(p => p.absolutePath)
      existBook.hash = manga.hash
      existBook.imageList = imageList
    }
    const imageFilePath = imageList[page - 1]
    if (!imageFilePath) {
      return res.status(404).send('Image not found')
    }

    // 重命名并复制图片文件到静态文件夹
    const imageFileName = `${manga.hash}_${page}${path.extname(imageFilePath)}`
    const imageFile = path.join(staticFilePath, imageFileName)
    await fs.promises.copyFile(imageFilePath, imageFile)

    // 发送图片文件
    if (fs.existsSync(imageFile)) {
      res.sendFile(imageFile)
    } else {
      res.status(404).send('Image file not found')
    }
  } catch (err) {
    console.error(err)
    res.status(500).send('Error processing file')
  }
})

// 处理webview请求
LANBrowsing.get('/reader', async (req, res) => {
  const id = req.query.id
  const manga = (await findBookAcrossLibraries({ hash: id })).row

  // 重定向至manga.url
  if (manga && manga.url) {
    res.redirect(manga.url.replace('exhentai', 'e-hentai'))
  } else {
    res.status(404).send('Manga not found')
  }
})

LANBrowsing.get('/', (req, res) => {
  switch (setting.language) {
    case 'en-US':
      res.redirect('https://github.com/SchneeHertz/exhentai-manga-manager/wiki/LAN-Browsing')
      break
    case 'zh-CN':
    case 'zh-TW':
    default:
      res.redirect('https://github.com/SchneeHertz/exhentai-manga-manager/wiki/%E5%B1%80%E5%9F%9F%E7%BD%91%E6%B5%8F%E8%A7%88')
      break
  }
})

let LANBrowsingInstance
// 启动Express服务器
const enableLANBrowsing = () => {
  // 网页版(Docker)为纯网页服务,局域网浏览 API 无意义,直接忽略
  if (WEB_MODE) {
    sendMessageToWebContents('网页版不需要局域网浏览,该功能已在 Docker 版移除')
    return
  }
  if (LANBrowsingInstance?.listening) {
    LANBrowsingInstance.close(() => {
      LANBrowsingInstance = LANBrowsing.listen(port, '0.0.0.0', () => {
        sendMessageToWebContents(`局域网浏览已重启,监听 http://0.0.0.0:${port}`)
      })
    })
  } else {
    LANBrowsingInstance = LANBrowsing.listen(port, '0.0.0.0', () => {
      sendMessageToWebContents(`局域网浏览已开启,监听 http://0.0.0.0:${port}`)
    })
  }
}

ipcMain.handle('enable-LAN-browsing', async (event, arg) => {
  enableLANBrowsing()
})

// 网页模式:启动 HTTP 服务(前端页面 + IPC 桥 + SSE + 文件服务)
if (WEB_MODE) {
  require('./web-server.js').start({
    getSetting: () => setting,
    // 每个账户读自己那份 setting.<账户名>.json(同名账户在 Win 与 NAS 共用);
    // withAccount 把每个请求包进对应账户的上下文 → 多账户并发时互不干扰
    withAccount,
    settingForAccount: (username) => ensureProfileSetting(username),
    // 下载任务可能落在不同目录(改过下载设置的老任务),逐个放行它们的目录
    extraAllowedRoots: () => {
      const out = []
      for (const t of downloadTasks.values()) {
        if (t && t.saveDir) out.push(t.saveDir)
        if (t && t.dir) out.push(t.dir)
      }
      return out
    }
  })
}