// 网页版 Electron 兼容层
// 用纯 Node 运行时模拟主进程代码所需的最小 Electron API 子集,
// 让 index.js / modules 可以在没有 Electron 桌面的情况下运行。
const path = require('path')
const fs = require('fs')
const os = require('os')

// ---------- 数据目录 ----------
// 优先使用环境变量 WEB_DATA_DIR;
// 否则如果桌面版数据目录存在则复用(与桌面版共用漫画库);
// 否则使用项目目录下的 data 文件夹(便携式)。
let WEB_DATA_DIR = process.env.WEB_DATA_DIR
if (!WEB_DATA_DIR) {
  const appDataDir = process.env.APPDATA ? path.join(process.env.APPDATA, 'exhentai-manga-manager') : null
  if (appDataDir && fs.existsSync(path.join(appDataDir, 'setting.json'))) {
    WEB_DATA_DIR = appDataDir
  } else {
    WEB_DATA_DIR = path.join(__dirname, 'data')
  }
}

// ---------- SSE 广播 ----------
// web-server.js 启动时通过 setBroadcast 注入真正的广播函数
let broadcastFn = null
const setBroadcast = (fn) => { broadcastFn = fn }
const broadcast = (channel, arg) => { if (broadcastFn) broadcastFn(channel, arg) }

// ---------- app ----------
const app = {
  isPackaged: false,
  getAppPath: () => __dirname,
  getPath: (name) => {
    switch (name) {
      case 'userData': return WEB_DATA_DIR
      case 'appData': return process.env.APPDATA || os.homedir()
      case 'exe': return path.join(__dirname, 'web.js')
      case 'home': return os.homedir()
      case 'downloads': return path.join(os.homedir(), 'Downloads')
      case 'temp': return os.tmpdir()
      default: return os.homedir()
    }
  },
  getLocale: () => process.env.WEB_LOCALE || 'zh-CN',
  whenReady: () => Promise.resolve(),
  on: () => {},
  once: () => {},
  quit: () => {},
  exit: () => {},
  relaunch: () => {},
  setLoginItemSettings: () => {},
  requestSingleInstanceLock: () => true,
  getLoginItemSettings: () => ({}),
  commandLine: { appendSwitch: () => {} },
  disableHardwareAcceleration: () => {},
  setAppUserModelId: () => {},
}

// ---------- ipcMain ----------
// 记录 handle / on 注册的处理器,由 web-server.js 通过 HTTP 分派
const handlers = new Map()
const onHandlers = new Map()
const ipcMain = {
  handle: (channel, fn) => handlers.set(channel, fn),
  on: (channel, fn) => onHandlers.set(channel, fn),
  removeHandler: (channel) => handlers.delete(channel),
  _handlers: handlers,
  _onHandlers: onHandlers,
}

// ---------- BrowserWindow ----------
// 网页模式不创建窗口;createWindow 会被 index.js 跳过,
// 这里只提供一个带 webContents.send 广播能力的空壳兜底。
class BrowserWindow {
  constructor () {
    this.webContents = { send: broadcast, on: () => {} }
  }
  static getAllWindows () { return [] }
  static getFocusedWindow () { return null }
  loadFile () {}
  loadURL () {}
  setMenuBarVisibility () {}
  setAutoHideMenuBar () {}
  setTitle () {}
  setProgressBar () {}
  setFullScreen () {}
  isFullScreen () { return false }
  isVisible () { return false }
  isMinimized () { return false }
  show () {}
  hide () {}
  focus () {}
  setSkipTaskbar () {}
  minimize () {}
  restore () {}
  destroy () {}
  close () {}
  on () {}
  once () {}
}

// ---------- 其他 Electron API ----------
const session = {
  defaultSession: { setProxy: async () => {} }
}

// 网页模式不弹原生对话框,select-folder/select-file 由前端网页选择器实现
const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] })
}

const shell = {
  openExternal: () => {},
  showItemInFolder: () => {},
  openPath: async () => '',
  trashItem: async (p) => {
    try { await fs.promises.rm(p, { recursive: true, force: true }) } catch {}
  },
}

const screen = {
  getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 }, scaleFactor: 1 }),
  getAllDisplays: () => [],
}

const Menu = {
  buildFromTemplate: () => ({}),
  setApplicationMenu: () => {},
}

const clipboard = {
  writeText: () => {},
  readText: () => '',
  writeImage: () => {},
}

const nativeImage = {
  createFromPath: () => ({}),
}

class Tray {
  constructor () {}
  setToolTip () {}
  on () {}
  setContextMenu () {}
  destroy () {}
}

// 全局快捷键:网页模式不需要,提供空实现避免解构后调用报错
const globalShortcut = {
  register: () => false,
  unregister: () => {},
  unregisterAll: () => {},
  isRegistered: () => false,
}

module.exports = {
  app,
  BrowserWindow,
  ipcMain,
  session,
  dialog,
  shell,
  screen,
  Menu,
  clipboard,
  nativeImage,
  Tray,
  globalShortcut,
  setBroadcast,
  broadcast,
  WEB_DATA_DIR,
}
