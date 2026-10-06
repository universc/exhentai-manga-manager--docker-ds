const { app } = require('electron')
const fs = require('fs')
const path = require('path')
const { getRootPath } = require('./utils.js')


let STORE_PATH = app.getPath('userData')
if (!fs.existsSync(STORE_PATH)) {
  fs.mkdirSync(STORE_PATH)
}
const rootPath = getRootPath()
let isPortable = false
// 自定义数据目录(设置 → 常用 → 本地模式 → 数据文件位置):
// 记录在 userData/bootstrap.json,优先级最高(高于便携模式)
const bootstrapFile = path.join(app.getPath('userData'), 'bootstrap.json')
let customDataPath = null
try {
  customDataPath = JSON.parse(fs.readFileSync(bootstrapFile, 'utf-8')).dataPath
} catch {
  customDataPath = null
}
if (customDataPath) {
  try {
    fs.mkdirSync(customDataPath, { recursive: true })
    STORE_PATH = customDataPath
  } catch (e) {
    console.log('自定义数据目录不可用,回退默认目录:', String(e.message || e))
  }
} else {
  try {
    const dataPath = path.join(rootPath, 'data')
    fs.accessSync(dataPath)
    STORE_PATH = dataPath
    isPortable = true
  } catch {
    try {
      fs.accessSync(path.join(rootPath, 'portable'))
      STORE_PATH = rootPath
      isPortable = true
    } catch {
      STORE_PATH = app.getPath('userData')
    }
  }
}

// 写入自定义数据目录设置(设置 → 常用 → 数据文件位置 → 保存并重启)
const setBootstrapDataPath = (dataPath) => {
  const userData = app.getPath('userData')
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(path.join(userData, 'bootstrap.json'), JSON.stringify({ dataPath: String(dataPath || '') }, null, '  '), 'utf-8')
}

const TEMP_PATH = path.join(STORE_PATH, 'tmp')
const COVER_PATH = path.join(STORE_PATH, 'cover')
const VIEWER_PATH = path.join(STORE_PATH, 'viewer')

const preparePath = () => {
  fs.mkdirSync(TEMP_PATH, { recursive: true })
  fs.mkdirSync(COVER_PATH, { recursive: true })
  fs.mkdirSync(VIEWER_PATH, { recursive: true })
}

const _mange_reader = `"${path.join(getRootPath(), 'resources/extraResources/manga_reader.exe')}"`

const prepareSetting = () => {
  let setting
  try {
    setting = JSON.parse(fs.readFileSync(path.join(STORE_PATH, 'setting.json'), { encoding: 'utf-8' }))
    if (setting.imageExplorer === '"C:\\Windows\\explorer.exe"') {
      setting.imageExplorer = _mange_reader
      fs.writeFileSync(path.join(STORE_PATH, 'setting.json'), JSON.stringify(setting, null, '  '), { encoding: 'utf-8' })
    }
  } catch {
    setting = {
      proxy: undefined,
      library: app.getPath('downloads'),
      metadataPath: undefined,
      imageExplorer: _mange_reader,
      pageSize: 42,
      loadOnStart: false,
      // Windows 客户端:开机自启动 / 窗口置顶 / 全局快捷键(显示/隐藏窗口)
      startOnLogin: false,
      alwaysOnTop: false,
      globalHotkey: 'Control+Alt+X',
      // NAS 远程漫画库:填写网页版/Docker 服务地址(如 http://192.168.1.100:23787)后
      // 重启客户端,窗口将直接加载该服务器,封面与阅读图片均从服务器获取;留空为本地模式
      remoteServer: '',
      // 远程模式自动登录账户(服务器启用账户系统时使用)
      webUsername: '',
      webPassword: '',
      igneous: '',
      ipb_pass_hash: '',
      ipb_member_id: '',
      star: '',
      showComment: true,
      requireGap: 3000,
      thumbnailColumn: 10,
      showTranslation: false,
      theme: 'light e-hentai',
      widthLimit: undefined,
      directEnter: 'detail',
      language: 'default',
      folderTreeWidth: '',
      advancedSearch: true,
      autoCheckUpdates: false,
      customOptions: '',
      defaultExpandTree: true,
      hidePageNumber: false,
      skipDeleteConfirm: false,
      displayTitle: 'japaneseTitle',
      keepReadingProgress: true,
      // 标题翻译(AI):off / ollama(本地AI) / openai(在线API)
      titleTranslationMode: 'off',
      titleTranslationBaseUrl: '',
      titleTranslationModel: '',
      titleTranslationApiKey: '',
      // 本地/在线分开配置
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'qwen2.5:7b',
      openaiBaseUrl: 'https://api.deepseek.com/v1',
      openaiModel: 'deepseek-chat',
      openaiApiKey: '',
      // 应用名称(浏览器标签页)
      appName: 'EX漫画管理器(exhentai-manga-manager)',
      // 右键菜单项(每个菜单显示哪些项,缺省为全部显示)
      contextMenuOptions: {
        title: ['copyTitle', 'copyLink', 'copyTitleAndLink'],
        cover: ['getMetadata', 'resetMetadata', 'openFileLocation', 'moveFile', 'deleteFile', 'toggleHidden', 'copyTag', 'pasteTag', 'getMetadataFromLink'],
        image: ['copyImage', 'setCover', 'deleteImage'],
        comment: ['openLink']
      },
      // 卡片显示选项
      hideBookmarkButton: false,
      hidePageCount: false,
      hideReadCount: false,
      hideReadButton: false,
      hideNonTag: false,
      hideTitle: false,
      hideRating: false,
      // 填充封面(开关):开 = 封面铺满卡片、文字/按钮透明浮层;关 = 经典卡片布局
      fillCover: false,
      // 封面尺寸与卡片间距(px):宽/高独立;间距分上下/左右
      coverWidth: 220,
      coverHeight: 360,
      cardGapV: 6,
      cardGapH: 6,
      // 自定义主题
      themeCustomBg: '',
      themeCustomBgImage: '',
      themeCustomPrimary: '#409EFF',
      themeCustomFontSize: 14,
      themeCustomFontColor: '',
      themeCustomFontStyle: '',
      // 自定义网站图标
      customIconPath: '',
      // 工具栏元素(设置按钮始终保留;搜索框/搜索按钮/排序框/界面模式框也参与排序)
      toolbarButtons: ['searchInput', 'searchButton', 'folderTree', 'shuffle', 'manualScan', 'incrementalScan', 'batchMetadata', 'tagAnalysis', 'manageCollection', 'manageTag', 'viewerSwitch', 'themeSwitch', 'fullscreen', 'sortSelect', 'uiMode'],
      // 用户显式关掉的工具栏元素(搜索框/搜索按钮/排序框/界面模式框)
      toolbarButtonsHidden: [],
      // 工具栏元素的完整排列顺序(含隐藏项;空 = 定义顺序)
      toolbarButtonOrder: [],
      // 每页条数选项
      customPageSizes: '12,24,42,72,500,5000,1000000',
      // 惯性滚动力度:off / low / medium / high
      scrollInertiaLevel: 'medium',
      // 图片 AI 功能(阅读器右键菜单显示)
      enableImageUpscale: false,
      enableImageOcr: false,
      // 图片 AI 本地模型 API:超分(如 Real-ESRGAN 服务)/ 文字提取(OpenAI 兼容);留空用内置或标题翻译AI配置
      upscaleApiUrl: '',
      ocrApiUrl: '',
      ocrApiModel: 'qwen2.5-vl:7b',
    }
    fs.writeFileSync(path.join(STORE_PATH, 'setting.json'), JSON.stringify(setting, null, '  '), { encoding: 'utf-8' })
  }
  return setting
}

const prepareCollectionList = () => {
  let collectionList
  try {
    collectionList = JSON.parse(fs.readFileSync(path.join(STORE_PATH, 'collectionList.json'), { encoding: 'utf-8' }))
  } catch {
    collectionList = []
    fs.writeFileSync(path.join(STORE_PATH, 'collectionList.json'), JSON.stringify(collectionList, null, '  '), { encoding: 'utf-8' })
  }
  return collectionList
}

module.exports = {
  STORE_PATH,
  isPortable,
  TEMP_PATH,
  COVER_PATH,
  VIEWER_PATH,
  prepareSetting,
  prepareCollectionList,
  preparePath,
  _mange_reader,
  setBootstrapDataPath,
}