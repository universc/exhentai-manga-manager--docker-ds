const { app, BrowserWindow, ipcMain, session, dialog, shell, screen, Menu, clipboard, nativeImage, Tray, globalShortcut } = require('electron')
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
const { getBookFilelist, geneCover, getImageListByBook, deleteImageFromBook } = require('./fileLoader/index.js')
const {
  STORE_PATH, isPortable,
  TEMP_PATH, COVER_PATH, VIEWER_PATH,
  prepareSetting, prepareCollectionList, preparePath,
  setBootstrapDataPath,
  _mange_reader
} = require('./modules/init_folder_setting.js')
const { findSameFile } = require('./fileLoader/folder.js')
const { inventoryLibrary, diffInventory, snapshotFromInventory, loadSnapshotFile, saveSnapshotFile, archiveTypeOf } = require('./fileLoader/incremental.js')
const localModels = require('./modules/localModels.js')
const { ensureLibraries, libraryDataDir, libraryRuntimePaths, shouldMoveLibraryData, migrateLibraryData } = require('./modules/libraries.js')

const WEB_MODE = process.env.WEB_MODE === '1'

preparePath()
let setting = prepareSetting()

// 本地超分模型目录:<数据目录>/models/upscale/<模型 id>
localModels.init(STORE_PATH)
// 下载走用户配置的代理,或镜像前缀(国内直连 GitHub 大文件经常被重置)
localModels.setProxy(setting.proxy || process.env.HTTPS_PROXY || process.env.https_proxy || '')
localModels.setMirror(setting.localModelMirror || '')

// 容器模式(WEB_LIBRARY 环境变量):数据目录挂载为 /data、漫画库挂载为 /library。
// 只对「Windows 盘符路径」(桌面端写进共享 setting.json 的 Y:\... 等)做跨平台映射;
// 用户在容器内设置的合法路径(以 / 开头,如 /library/sub、/data/xxx)一律尊重,
// 不再无条件强制回 /library,避免「库文件夹/元数据目录设置后又被重置」的问题。
if (process.env.WEB_LIBRARY) {
  const forcedLibrary = path.resolve(process.env.WEB_LIBRARY)
  const lib = String(setting.library || '')
  if (/^[A-Za-z]:[\\/]/.test(lib)) {
    // Windows 盘符:记录为外部根,并在容器内强制为挂载路径
    if (!setting.externalLibraryRoot) setting.externalLibraryRoot = lib
    setting.library = forcedLibrary
  } else if (!lib || lib === '/') {
    // 未设置 / 根目录:回退到默认挂载路径
    setting.library = forcedLibrary
  }
  // 元数据目录:仅 Windows 盘符时映射;容器内合法路径尊重
  const meta = String(setting.metadataPath || '')
  if (/^[A-Za-z]:[\\/]/.test(meta)) {
    if (!setting.externalMetadataPath) setting.externalMetadataPath = meta
    if (!setting.externalCoverRoot) setting.externalCoverRoot = path.join(meta, 'cover').replace(/\//g, '\\')
    setting.metadataPath = null
  }
}

// ---------- 漫画库列表 + 每库数据目录(第二十七/二十八轮) ----------
// 兼容层:旧版只有单个 setting.library,这里迁移出 setting.libraries,并把 setting.library
// 继续同步为活动库路径 —— 扫描/删除等现有逻辑不用改。
// 数据归属:scan-snapshot.json / database.sqlite / viewcache 属于「库」,放库数据目录;
// metadata.sqlite / setting.json / collectionList.json / cover 等属于「用户统一配置」,仍在数据存放目录。
// 当前活动库(多库管理 UI 切换的就是它)
const activeLibraryOf = (s = setting) => (s.libraries || []).find(l => l.id === s.activeLibraryId) || (s.libraries || [])[0] || null
const libraryState = ensureLibraries(setting, { nameHint: setting.externalLibraryRoot })
const activeLibrary = libraryState.active
// 活动库的运行时路径:切换活动库时由 switchActiveLibraryRuntime() 重新计算,所以都是 let
const startupLibraryPaths = libraryRuntimePaths(STORE_PATH, activeLibrary)
let LIBRARY_DATA_DIR = startupLibraryPaths.dataDir
let LIBRARY_VIEWCACHE_DIR = startupLibraryPaths.viewcacheDir
// 首次升级:把旧版放在数据存放目录根部的库数据搬进库数据目录(绝不覆盖已有文件)
let libraryDataMigration = activeLibrary ? migrateLibraryData(STORE_PATH, LIBRARY_DATA_DIR) : { moved: [], kept: [] }
let SNAPSHOT_FILE = startupLibraryPaths.snapshotFile
let LIBRARY_DB_FILE = startupLibraryPaths.dbFile

let collectionList = prepareCollectionList()

let Manga = prepareMangaModel(LIBRARY_DB_FILE)
let metadataSqliteFile
if (setting.metadataPath) {
  metadataSqliteFile = path.join(setting.metadataPath, './metadata.sqlite')
} else {
  metadataSqliteFile = path.join(STORE_PATH, './metadata.sqlite')
}
let Metadata = prepareMetadataModel(metadataSqliteFile)
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
const switchActiveLibraryRuntime = async (prevLibrary, prevDataDir) => {
  try { await Manga.sequelize.close() } catch (e) { console.error('关闭旧库数据库失败', e) }
  const lib = activeLibraryOf(setting)
  const paths = libraryRuntimePaths(STORE_PATH, lib)
  // 同一个库改了「库数据存放位置」:先把原库数据整体搬到新目录(绝不覆盖)
  const movedFromOldDir = shouldMoveLibraryData(prevLibrary, lib, prevDataDir, paths.dataDir)
    ? migrateLibraryData(prevDataDir, paths.dataDir)
    : { moved: [], kept: [] }
  LIBRARY_DATA_DIR = paths.dataDir
  LIBRARY_VIEWCACHE_DIR = paths.viewcacheDir
  // 首次升级:旧版放在数据存放目录根部的库数据
  libraryDataMigration = lib ? migrateLibraryData(STORE_PATH, LIBRARY_DATA_DIR) : { moved: [], kept: [] }
  SNAPSHOT_FILE = paths.snapshotFile
  LIBRARY_DB_FILE = paths.dbFile
  Manga = prepareMangaModel(LIBRARY_DB_FILE)
  await ensureMangaSchema(Manga)
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
    process.exit(1)
  })

// ---------- 漫画库列表日志(第二十七/二十八轮) ----------
// ensureLibraries 与每库数据目录在文件上方(setting 就绪后、打开数据库之前)已算好;
// 这里只负责把结果写进 log.txt,并在本地模式把 setting.json 落盘。
if (libraryState.migrated || libraryState.changed) {
  console.log(`[libraries] 漫画库列表已初始化:${setting.libraries.map(l => `${l.name}(${l.path})`).join('、') || '(空)'}`)
  // 只在本地模式落盘:容器模式(共享 /data/setting.json)下 library 会写回 Windows 侧,
  // 这里避免把容器路径 /library 覆盖进跨平台共享的 setting.json。
  if (!process.env.WEB_LIBRARY) {
    try {
      const settingPath = path.join(STORE_PATH, 'setting.json')
      const settingTempPath = settingPath + '.tmp'
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
const persistSetting = () => {
  const targetPath = path.join(STORE_PATH, 'setting.json')
  const tempPath = path.join(STORE_PATH, 'setting.json.tmp')
  fs.writeFileSync(tempPath, JSON.stringify(setting, null, '  '), { encoding: 'utf-8' })
  fs.renameSync(tempPath, targetPath)
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
    const username = setting.webUsername
    const password = setting.webPassword
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
      return res.json({ ok: true, result: { dataPath: STORE_PATH, defaultDataPath: app.getPath('userData'), isPortable } })
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

// 跨平台路径翻译:共享数据库可能由 Windows 桌面版写入(路径形如 Y:\01-漫画\...,
// 封面在 Y:\01-漫画\S\数据存放\cover\...)。读取时把 Windows 路径翻译为当前环境路径。
const translateBookPath = (p, kind) => {
  if (!p) return p
  const root = setting.externalLibraryRoot || setting.windowsLibraryRoot
  if (kind === 'filepath' && root && p.startsWith(root)) {
    const rel = p.slice(root.length).replace(/\\/g, '/').replace(/^\/+/, '')
    return rel ? path.join(setting.library, rel) : setting.library
  }
  if (kind === 'coverPath' && (/^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/'))) {
    // 封面绝对路径(Windows 盘符 / UNC / Linux 如 /data/cover/...) →
    // 只取文件名,映射到当前 COVER_PATH(封面文件统一存在共享 cover 目录,
    // NAS 端写入的 /data/cover/x.webp 在 Windows 桌面也能据此读到)
    const base = p.split(/[\\/]/).pop()
    return base ? path.join(COVER_PATH, base) : p
  }
  return p
}

// 反向翻译:写入共享数据库时把当前环境路径写成 Windows 侧格式,
// 保证 Windows 桌面版也能直接读取同一份数据库。
const toExternalPath = (p, kind) => {
  if (!p) return p
  if (kind === 'filepath' && setting.externalLibraryRoot && p.startsWith(setting.library)) {
    const rel = p.slice(setting.library.length).replace(/[/\\]+/g, '\\')
    return setting.externalLibraryRoot + rel
  }
  if (kind === 'coverPath' && setting.externalCoverRoot && p.startsWith(COVER_PATH)) {
    return setting.externalCoverRoot + '\\' + p.slice(COVER_PATH.length).replace(/[/\\]+/g, '\\')
  }
  return p
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
const acquireCoverName = (filepath) => {
  const base = sanitizeFileName(path.basename(String(filepath || '').replace(/[\\/]+$/, '')).replace(/\.[^.]+$/, ''))
  let coverName = `${base}.webp`
  for (let i = 2; ; i++) {
    try {
      const fd = fs.openSync(path.join(COVER_PATH, coverName), 'wx')
      fs.closeSync(fd)
      return coverName
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      coverName = `${base} (${i}).webp`
    }
  }
}

// 生成失败时释放占位文件(sharp 成功输出时会直接覆盖占位文件)
const releaseCoverName = (coverName) => {
  try { fs.rmSync(path.join(COVER_PATH, coverName), { force: true }) } catch {}
}

// 生成封面(指定漫画名)并返回本地 coverPath;失败返回 null
const generateCoverByName = async (book) => {
  const filepath = translateBookPath(book.filepath, 'filepath')
  const type = book.type || 'archive'
  const coverName = acquireCoverName(filepath)
  try {
    const { coverPath } = await geneCover(filepath, type, coverName)
    if (!coverPath || !fs.existsSync(coverPath)) {
      releaseCoverName(coverName)
      return null
    }
    return coverPath
  } catch (e) {
    releaseCoverName(coverName)
    throw e
  }
}

// 把封面路径写回共享数据库(路径按当前环境转外部格式)
const updateBookCoverPath = async (id, coverPath) => {
  const ext = toExternalPath(coverPath, 'coverPath')
  await Manga.update({ coverPath: ext }, { where: { id } })
  return ext
}

// 全局封面生成并发限制:同时最多 4 个(解压+sharp 较吃磁盘/CPU)
let coverSlots = 0
const coverWaiters = []
const takeCoverSlot = () => new Promise(resolve => {
  if (coverSlots < 4) { coverSlots++; resolve() } else coverWaiters.push(resolve)
})
const releaseCoverSlot = () => {
  coverSlots--
  const next = coverWaiters.shift()
  if (next) { coverSlots++; next() }
}

// 每本书的生成任务锁:并发请求只生成一次
const coverJobs = new Map()

// 按需确保封面存在:
// 1) DB 里 coverPath 翻译成本地路径后文件存在 → 直接复用;
// 2) 否则按 basename 在共享封面目录里找(另一平台生成的旧封面) → 复用并修正 DB 路径;
// 3) 都没有 → 生成并以漫画名命名。
const ensureBookCover = (book) => {
  if (!book || !book.id) return Promise.resolve(null)
  if (coverJobs.has(book.id)) return coverJobs.get(book.id)
  const job = (async () => {
    try {
      if (book.coverPath) {
        const local = translateBookPath(book.coverPath, 'coverPath')
        if (local && fs.existsSync(local)) return local
        // basename 兜底:共享 cover 目录里可能存在其他平台生成的文件
        const base = String(book.coverPath).replace(/[\\/]+$/, '').split(/[\\/]/).pop()
        if (base) {
          const fallback = path.join(COVER_PATH, base)
          if (fs.existsSync(fallback)) {
            await updateBookCoverPath(book.id, fallback)
            return fallback
          }
        }
      }
      await takeCoverSlot()
      try {
        const coverPath = await generateCoverByName(book)
        if (coverPath) await updateBookCoverPath(book.id, coverPath)
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
    const book = await Manga.findOne({ where: { id }, raw: true })
    if (!book) return null
    const coverPath = await ensureBookCover(book)
    return coverPath ? { coverPath } : null
  } catch (e) {
    console.error(e)
    return null
  }
})

const loadBookListFromDatabase = async () => {
  let bookList = await Manga.findAll()
  bookList = bookList.map(b => b.toJSON())
  // 兼容 Windows 版数据:统一翻译路径
  for (const b of bookList) {
    b.filepath = translateBookPath(b.filepath, 'filepath')
    b.coverPath = translateBookPath(b.coverPath, 'coverPath')
  }
  if (_.isEmpty(bookList)) {
    bookList = await loadLegecyBookListFromFile()
    await saveBookListToDatabase(bookList)
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
      if (book.status === 'non-tag' && findMetadata.status !== 'non-tag') await Manga.update(findMetadata, { where: { id: book.id } })
      Object.assign(book, findMetadata)
    } else {
      // 每 50 本才刷新一次进度,减少 IPC 往返
      if ((i + 1) % 50 === 0) setProgressBar((i + 1) / bookListLength)
      pendingUpserts.push(book)
    }
  }
  // 所有缺失元数据一次性事务写入,避免逐条 fsync
  if (pendingUpserts.length) {
    const t = await Metadata.sequelize.transaction()
    try {
      for (const book of pendingUpserts) {
        await Metadata.upsert(book, { transaction: t })
      }
      await t.commit()
    } catch (e) {
      await t.rollback()
      throw e
    }
  }
  setProgressBar(-1)
  return bookList
}

const saveBookListToDatabase = async (data) => {
  console.log('Empty Exist BookList and Saved New BookList')
  await Manga.destroy({ truncate: true })
  await Manga.bulkCreate(data)
}

const saveBookToDatabase = async (book) => {
  // 写共享数据库时路径转换为 Windows 格式,保证桌面版可读
  const extBook = {
    ...book,
    filepath: toExternalPath(book.filepath, 'filepath'),
    coverPath: toExternalPath(book.coverPath, 'coverPath')
  }
  await Manga.update(extBook, { where: { id: extBook.id } })
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
let viewerActive = false
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
// 用户正在阅读漫画时,扫描暂停,把 CPU/磁盘让给阅读器
const waitViewerIdle = async () => {
  while (viewerActive) await sleep(500)
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
})

// 自动排除规则:这些是「软件自己的数据」,绝不能被当成漫画扫描进来
// (设置 → 高级 → 排除文件 下方会用灰字列出来,让用户知道它们始终生效)
const AUTO_EXCLUDE_PATTERNS = ['(.trash)', 'viewcache', '(database.sqlite)', '(metadata.sqlite)', '(setting.json)', '(scan-snapshot.json)', '(delete-log.jsonl)', '(.deleted-)']
// 编译排除规则正则:用户规则 + 自动规则(任一命中即排除)
const compileExclude = () => {
  const user = _.isEmpty(setting.excludeFile) ? '' : String(setting.excludeFile)
  const all = (user ? [user] : []).concat(AUTO_EXCLUDE_PATTERNS)
  try {
    return new RegExp('(' + all.join(')|(') + ')')
  } catch (e) {
    try { return new RegExp('(' + AUTO_EXCLUDE_PATTERNS.join(')|(') + ')') } catch (e2) { return null }
  }
}

// 共享:处理一本"枚举结果"漫画的 DB 比对(全量扫描与增量扫描共用)
// 命中数据库 → 标记 exist;路径未命中但找到"搬家" → 更新 filepath 沿用封面;
// 全新 → geneCover 探测并推入 batchNewBooks(由调用方批量入库)
// 封面懒加载为固定行为:扫描只探测信息不生成封面(geneCover 传 null),
// 封面由用户浏览时按需生成(见 ensureBookCover),不再提供切换开关
const processScanItem = async (ctx, filepath, type) => {
  const { bookMap, bookIdMap, batchNewBooks } = ctx
  const foundData = bookMap.get(filepath)
  if (foundData === undefined) {
    /*
    * check whether the file is the relocated only
    * return the existing data if and only if there is one match
    * */
    const existingManga = await findSameFile(filepath, type, Manga)
    if (existingManga) {
      // the file is relocated only, so no need to regenerate the cover
      const foundPrevBook = bookIdMap.get(existingManga.id)
      if (foundPrevBook) {
        // this is necessary otherwise it will be deleted in the next step
        foundPrevBook.exist = true
        // update the Mangas table in database.sqlite(路径写 Windows 格式)
        // 懒加载模式下旧封面可能为空:保留空,由用户使用时按需生成
        const newCoverPath = foundPrevBook.coverPath
          ? path.join(COVER_PATH, path.basename(foundPrevBook.coverPath))
          : null
        foundPrevBook.coverPath = newCoverPath
        await Manga.update(
          {
            filepath: toExternalPath(filepath, 'filepath'),
            coverPath: newCoverPath ? toExternalPath(newCoverPath, 'coverPath') : null
          },
          { where: { id: existingManga.id } }
        )
      }
    } else {
      // this is the new file, so generate the cover(懒加载:只探测信息,封面为空)
      const id = nanoid()
      const { targetFilePath, hash, coverPath, pageCount, bundleSize, mtime, coverHash } = await geneCover(filepath, type, null)
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
          exist: true,
          date: Date.now()
        })
      }
    }
  } else {
    foundData.exist = true
    if (isPortable) {
      const newCoverPath = foundData.coverPath
        ? path.join(COVER_PATH, path.basename(foundData.coverPath))
        : null
      if (foundData.coverPath !== newCoverPath) {
        foundData.coverPath = newCoverPath
        await Manga.update({ coverPath: newCoverPath ? toExternalPath(newCoverPath, 'coverPath') : null }, { where: { id: foundData.id } })
      }
    }
  }
}

const runScan = async () => {
  const bookList = await Manga.findAll({ raw: true })
  bookList.forEach(b => {
    b.filepath = translateBookPath(b.filepath, 'filepath')
    b.coverPath = translateBookPath(b.coverPath, 'coverPath')
    b.exist = false
  })
  // 用 Map 按 filepath / id 索引,替代 O(n²) 的数组 find
  const bookMap = new Map(bookList.map(b => [b.filepath, b]))
  const bookIdMap = new Map(bookList.map(b => [b.id, b]))

  // 枚举阶段先给一点进度,避免界面长时间无反馈
  setProgressBar(0.02)
  // 统一单次遍历:等价于原「文件夹并发BFS + rar/7z glob + zip glob」三次遍历,
  // 同时产出目录/压缩包指纹,供增量扫描快照使用
  const excludeRe = compileExclude()
  const inv = await inventoryLibrary(setting.library, { excludeRe })
  let list = inv.books
  const listLength = list.length
  sendMessageToWebContents(`从漫画库找到 ${listLength} 本漫画`)

  const CONCURRENCY = 4
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
        await processScanItem({ bookMap, bookIdMap, batchNewBooks }, filepath, type)
      } catch (e) {
        sendMessageToWebContents(`加载 ${filepath} 失败:${e}(${i + 1}/${listLength})`)
      }
    })
    // 批量入库:一个事务写入一批,避免逐条 fsync(路径写入 Windows 格式)
    if (batchNewBooks.length) {
      await Manga.bulkCreate(batchNewBooks.map(b => ({
        ...b,
        filepath: toExternalPath(b.filepath, 'filepath'),
        coverPath: toExternalPath(b.coverPath, 'coverPath')
      })))
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
  try {
    // 清理孤儿封面。封面文件都存放在共享 COVER_PATH 目录,而数据库里的
    // coverPath 可能是 Windows 盘符 / UNC / Linux(/data/...) 任意一种格式,
    // 统一按 basename 对比,避免误删另一平台格式路径引用的封面。
    const coverList = await fs.promises.readdir(COVER_PATH)
    const existCoverSet = new Set(existData
      .map(b => b.coverPath ? path.basename(String(b.coverPath).replace(/[\\/]+$/, '')) : null)
      .filter(Boolean))
    const removeCoverList = coverList
      .map(p => path.join(COVER_PATH, p))
      .filter(p => !existCoverSet.has(path.basename(p)))
    for (const coverPath of removeCoverList) {
      await fs.promises.rm(coverPath)
    }
  } catch (err) {
    console.log(err)
  }
  // 批量清理数据库中已不存在的漫画(连同元数据),避免逐条删除
  if (removeData.length) {
    try {
      const removeIds = removeData.map(b => b.id)
      const removeHashes = removeData.map(b => b.hash).filter(Boolean)
      await Manga.destroy({ where: { id: { [Op.in]: removeIds } } })
      if (removeHashes.length) {
        await Metadata.destroy({ where: { hash: { [Op.in]: removeHashes } } })
      }
      sendMessageToWebContents(`清理了 ${removeData.length} 本不存在的漫画`)
    } catch (e) {
      console.error(e)
      sendMessageToWebContents(`清理不存在的漫画失败:${e}`)
    }
  }
  // 全量扫描成功收尾:保存目录指纹快照,供增量扫描使用
  try {
    await saveSnapshotFile(SNAPSHOT_FILE, snapshotFromInventory(setting.library, setting.excludeFile || '', inv))
  } catch (e) {
    console.log('save scan snapshot failed', e)
  }
  setProgressBar(-1)
  sendMessageToWebContents('Scan complete')
}

ipcMain.handle('load-book-list', async (event, scan) => {
  if (scan) {
    if (isScanning) {
      sendMessageToWebContents('扫描正在进行中,已跳过重复扫描')
    } else {
      isScanning = true
      sendMessageToWebContents('开始加载漫画库')
      // 后台扫描:立即返回当前列表,不阻塞 UI,扫描完成后再通知前端刷新
      setImmediate(async () => {
        try {
          await runScan()
        } catch (e) {
          console.error(e)
          sendMessageToWebContents(`扫描失败:${e}`)
        } finally {
          isScanning = false
          setProgressBar(-1)
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
  const bookList = await Manga.findAll({ raw: true })
  bookList.forEach(b => {
    b.filepath = translateBookPath(b.filepath, 'filepath')
    b.coverPath = translateBookPath(b.coverPath, 'coverPath')
    b.exist = false
  })
  const bookMap = new Map(bookList.map(b => [b.filepath, b]))
  const bookIdMap = new Map(bookList.map(b => [b.id, b]))
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
  const CONCURRENCY = 4
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
        await processScanItem({ bookMap, bookIdMap, batchNewBooks }, filepath, type)
      } catch (e) {
        sendMessageToWebContents(`加载 ${filepath} 失败:${e}(${i + 1}/${candidates.length})`)
      }
    })
    // 批量入库:一个事务写入一批,避免逐条 fsync(路径写入 Windows 格式)
    if (batchNewBooks.length) {
      await Manga.bulkCreate(batchNewBooks.map(b => ({
        ...b,
        filepath: toExternalPath(b.filepath, 'filepath'),
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
    try {
      for (const row of removedRows) {
        if (row.coverPath) {
          const coverFile = path.join(COVER_PATH, path.basename(String(row.coverPath)))
          await fs.promises.rm(coverFile, { force: true }).catch(() => {})
        }
      }
      const removeIds = removedRows.map(b => b.id)
      const removeHashes = removedRows.map(b => b.hash).filter(Boolean)
      await Manga.destroy({ where: { id: { [Op.in]: removeIds } } })
      if (removeHashes.length) {
        await Metadata.destroy({ where: { hash: { [Op.in]: removeHashes } } })
      }
      sendMessageToWebContents(`清理了 ${removedRows.length} 本不存在的漫画`)
    } catch (e) {
      console.error(e)
      sendMessageToWebContents(`清理不存在的漫画失败:${e}`)
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
    sendMessageToWebContents('开始加载漫画库')
    // 后台执行:立即返回当前列表,不阻塞 UI,完成后通知前端刷新
    setImmediate(async () => {
      try {
        await runIncrementalScan()
      } catch (e) {
        console.error(e)
        sendMessageToWebContents(`扫描失败:${e}`)
      } finally {
        isScanning = false
        setProgressBar(-1)
      }
    })
  }
  return await loadBookListFromDatabase()
})

ipcMain.handle('force-gene-book-list', async (event, arg) => {
  // 封面懒加载为固定行为:重建库也不生成封面,由用户浏览时按需生成
  await Manga.destroy({ truncate: true })
  await clearFolder(TEMP_PATH)
  await clearFolder(COVER_PATH)
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
  const CONCURRENCY = 4
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
        const { targetFilePath, hash, coverPath, pageCount, bundleSize, mtime, coverHash } = await geneCover(filepath, type, null)
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
    // 批量入库:一个事务写入一批(路径写入 Windows 格式)
    if (batchNewBooks.length) await Manga.bulkCreate(batchNewBooks.map(b => ({
      ...b,
      filepath: toExternalPath(b.filepath, 'filepath'),
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
  await clearFolder(COVER_PATH)

  const CONCURRENCY = 4
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
        let { filepath, type } = book
        if (!type) type = 'archive'
        // 封面以漫画名命名(占位防并发)
        const coverName = acquireCoverName(filepath)
        try {
          const { targetFilePath, hash, coverPath, pageCount, bundleSize, mtime, coverHash } = await geneCover(filepath, type, coverName)
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
    const { targetFilePath, hash, coverPath, pageCount, bundleSize, mtime, coverHash } = await geneCover(filepath, type, coverName)
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
      sendMessageToWebContents(`获取 Ex 页面失败:${e}`)
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
      sendMessageToWebContents(`获取 Ex 数据失败:${e}`)
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

ipcMain.handle('save-book', async (event, book) => {
  return await saveBookToDatabase(book)
})

// home
ipcMain.handle('get-folder-tree', async (event, filePathList) => {
  const librarySplitPathsLength = setting.library.split(path.sep).length - 1
  const folderList = [...new Set(filePathList.map(filepath => path.dirname(filepath)))]
  const bookPathSplitList = folderList.sort().map(fp => fp.split(path.sep).slice(librarySplitPathsLength))
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

// detail
ipcMain.handle('open-url', async (event, url) => {
  if (WEB_MODE) return
  shell.openExternal(url)
})

ipcMain.handle('show-file', async (event, filepath) => {
  if (WEB_MODE) return
  shell.showItemInFolder(filepath)
})

ipcMain.handle('use-new-cover', async (event, filepath) => {
  const copyTempCoverPath = path.join(TEMP_PATH, nanoid(8) + path.extname(filepath))
  const coverPath = path.join(COVER_PATH, nanoid() + path.extname(filepath))
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
const DELETE_LOG = path.join(STORE_PATH, 'delete-log.jsonl')

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
    await fs.promises.mkdir(STORE_PATH, { recursive: true })
    await fs.promises.appendFile(DELETE_LOG, JSON.stringify(entry) + '\n', 'utf8')
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
  if (!filepath || !filepath.startsWith(setting.library)) {
    result.error = '路径不在漫画库内,已拒绝'
    await appendDeleteLog({ deletedAt: Date.now(), deletedAtText: new Date().toLocaleString(), src: filepath, ok: false, error: result.error })
    return result
  }
  let info = {}
  try {
    const row = await Manga.findOne({ where: { filepath }, raw: true })
    if (row) info = { id: row.id, title: row.title, title_jpn: row.title_jpn, tags: row.tags }
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
  try { await Manga.destroy({ where: { filepath: filepath } }) } catch (e) { /* 忽略 */ }
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
  return { ok: true, list: out, trashDir: TRASH_DIR, logFile: DELETE_LOG }
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
  const out = []
  try {
    const st = await fs.promises.stat(DELETE_LOG)
    const start = Math.max(0, st.size - 2 * 1024 * 1024) // 日志再大也只读最后 2MB
    const fh = await fs.promises.open(DELETE_LOG, 'r')
    const buf = Buffer.alloc(st.size - start)
    await fh.read(buf, 0, buf.length, start)
    await fh.close()
    const lines = buf.toString('utf8').split('\n').filter(Boolean)
    for (const line of lines.slice(-200)) {
      try { out.push(JSON.parse(line)) } catch (e) { /* 跳过坏行 */ }
    }
  } catch (e) { /* 还没有日志文件 */ }
  return { ok: true, list: out.reverse(), logFile: DELETE_LOG }
})

ipcMain.handle('move-local-book', async (event, oldPath, folderArr) => {
  try {
    const pathSep = require('path').sep
    const folderPath = Array.isArray(folderArr) && folderArr.length > 0 ? folderArr.join(pathSep) : ''
    const newFilePath = path.join(path.dirname(setting.library), folderPath, path.basename(oldPath))
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
ipcMain.handle('load-manga-image-list', async (event, book) => {
  // 后台清理(不 await):清掉上一本书遗留的临时文件,同时不拖慢本次打开
  cleanupViewerTemp()
  trimViewCache()

  const { filepath, type, id: bookId } = book
  const list = await getImageListByBook(filepath, type)

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
  try {
    const row = await Manga.findOne({ where: { filepath: bookPath }, raw: true })
    if (row) info = { bookId: row.id, title: row.title, title_jpn: row.title_jpn }
  } catch (e) { /* 拿不到元数据不影响删除 */ }
  const meta = { kind: 'image', bookPath, bookType: type, image: rel, ...info }
  if (type === 'folder') {
    const abs = path.isAbsolute(rel) ? rel : path.join(bookPath, rel)
    if (!abs.startsWith(setting.library)) {
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
  return setting
})

// 应用设置变更并写入本地 setting.json(本地模式 IPC 与远程模式本地代理共用)
const applySetting = async (receiveSetting) => {
  // 防丢配置(关键):前端启动时可能只回传了部分键(例如 App.vue 只回传 contextMenuOptions),
  // 绝不能把它当成完整配置整份替换 —— 先与内存中的现有设置合并,前端没传的键一律保留原值。
  receiveSetting = { ...setting, ...(receiveSetting || {}) }
  if (receiveSetting.proxy) {
    await session.defaultSession.setProxy({
      mode: 'fixed_servers',
      proxyRules: receiveSetting.proxy
    })
  }
  // 本地模型下载同步使用代理 / 镜像前缀
  localModels.setProxy(receiveSetting.proxy || process.env.HTTPS_PROXY || process.env.https_proxy || '')
  localModels.setMirror(receiveSetting.localModelMirror || '')
  if (receiveSetting.metadataPath !== setting.metadataPath) {
    // metadataPath 可能为 undefined/null/空(前端缺键或用户清空):回退默认数据目录
    const target = receiveSetting.metadataPath || STORE_PATH
    Metadata = prepareMetadataModel(path.join(target, './metadata.sqlite'))
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
  if (process.env.WEB_LIBRARY) {
    const forcedLibrary = path.resolve(process.env.WEB_LIBRARY)
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
  setting = receiveSetting
  if (tray && !setting.minimizeToTray && !setting.closeToTray) {
    tray.destroy()
    tray = null
  }
  // 刷新托盘菜单(置顶/开机启动勾选状态与设置同步)
  if (tray) buildTrayMenu()
  const targetPath = path.join(STORE_PATH, 'setting.json')
  const tempPath = path.join(STORE_PATH, 'setting.json.tmp')
  await fs.promises.writeFile(tempPath, JSON.stringify(fileSetting, null, '  '), { encoding: 'utf-8' })
  return await fs.promises.rename(tempPath, targetPath)
}

ipcMain.handle('save-setting', async (event, receiveSetting) => {
  return applySetting(receiveSetting)
})

// ---------- 多库管理(第二十九轮) ----------
// 返回给设置页的库列表:额外带上解析后的「库数据目录」,方便 UI 显示
const librariesSnapshot = () => ({
  libraries: (setting.libraries || []).map(l => ({
    id: l.id,
    name: l.name,
    path: l.path,
    dataPath: l.dataPath || '',
    dataDir: libraryDataDir(STORE_PATH, l)
  })),
  activeLibraryId: setting.activeLibraryId || '',
  library: setting.library || ''
})

ipcMain.handle('get-libraries', async () => librariesSnapshot())

// 设置页提交整份库列表 + 活动库:先规范化,再落盘;活动库变了才重建运行时(切库)
ipcMain.handle('apply-libraries', async (event, arg) => {
  try {
    const payload = arg || {}
    const draft = {
      ...setting,
      libraries: Array.isArray(payload.libraries) ? payload.libraries : [],
      activeLibraryId: payload.activeLibraryId || ''
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
      }
    }
    const prevDataDir = LIBRARY_DATA_DIR
    setting = draft
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
      Metadata = prepareMetadataModel(metadataSqliteFile)
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
    defaultDataPath: app.getPath('userData'),
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

// ---------- 网页版(Docker)账户管理:仅管理员可用(权限在 web-server.js 拦截) ----------
if (WEB_MODE) {
  const auth = require('./modules/auth.js')
  const iprules = require('./modules/iprules.js')
  ipcMain.handle('auth-list-users', async () => auth.listUsers())
  ipcMain.handle('auth-add-user', async (event, { username, password, role } = {}) => {
    return auth.addUser(username, password, role)
  })
  ipcMain.handle('auth-remove-user', async (event, username) => {
    return auth.removeUser(username)
  })
  ipcMain.handle('auth-change-password', async (event, { username, newPassword } = {}) => {
    return auth.changePassword(username, newPassword)
  })
  // IP 访问控制:白名单免登录(视为管理员)/ 黑名单拒绝连接
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
ipcMain.handle('rename-tag', async (event, { cat, oldName, newName } = {}) => {
  try {
    if (!cat || !oldName || !newName) return { ok: false, error: '参数错误' }
    if (oldName === newName) return { ok: true, count: 0 }
    const bookList = await loadBookListFromDatabase()
    let count = 0
    for (const book of bookList) {
      const arr = book.tags?.[cat]
      if (Array.isArray(arr) && arr.includes(oldName)) {
        book.tags[cat] = arr.map(t => (t === oldName ? newName : t))
        await saveBookToDatabase(book)
        count++
      }
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
    const bookList = await loadBookListFromDatabase()
    let count = 0
    for (const book of bookList) {
      const arr = book.tags?.[cat]
      if (Array.isArray(arr) && arr.includes(name)) {
        const next = arr.filter(t => t !== name)
        if (next.length) book.tags[cat] = next
        else delete book.tags[cat]
        await saveBookToDatabase(book)
        count++
      }
    }
    return { ok: true, count }
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

const getLANArchiveTitle = (manga) => {
  if (manga.title_jpn && manga.title) return `${manga.title_jpn} || ${manga.title}`
  return manga.title_jpn || manga.title || path.basename(manga.filepath || '')
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
  extension: path.extname(manga.filepath || ''),
  filename: path.basename(manga.filepath || ''),
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
  const manga = await Manga.findOne({where: {hash: hash}})
  if (!manga || !manga.coverPath) {
    return res.status(404).send('Cover not found')
  }
  const coverFilePath = path.join(staticFilePath, path.basename(manga.coverPath))
  await fs.promises.copyFile(manga.coverPath, coverFilePath)
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
    const manga = await Manga.findOne({where: {hash: mangaHash}})

    if (!manga) {
      return res.status(404).send('Manga not found')
    }

    await clearFolder(VIEWER_PATH)
    await clearFolder(staticFilePath)
    const imageList = await getImageListByBook(manga.filepath, manga.type)

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

  const manga = await Manga.findOne({where: {hash: hash}})
  if (!manga || !manga.filepath) {
    return res.status(404).send('File not found')
  }

  // 获取章节图片列表
  try {
    let imageList
    if (manga.hash === existBook.hash) {
      imageList = existBook.imageList
    } else {
      await clearFolder(VIEWER_PATH)
      await clearFolder(staticFilePath)
      imageList = await getImageListByBook(manga.filepath, manga.type)
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
  const manga = await Manga.findOne({where: {hash: id}})

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
    getSetting: () => setting
  })
}