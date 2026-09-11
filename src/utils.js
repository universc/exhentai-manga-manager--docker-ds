function getWidth (el, type) {
  if (el === null) return null
  if (type === 'inner') // .innerWidth()
    return el.clientWidth
  else if (type === 'outer') // .outerWidth()
    return el.offsetWidth
  const s = window.getComputedStyle(el, null)
  if (type === 'width') // .width()
    return el.clientWidth - parseInt(s.getPropertyValue('padding-left'), 10) - parseInt(s.getPropertyValue('padding-right'), 10)
  else if (type === 'full') // .outerWidth(includeMargins = true)
    return el.offsetWidth + parseInt(s.getPropertyValue('margin-left'), 10) + parseInt(s.getPropertyValue('margin-right'), 10)
  return null
}

const acceleratorInfo = [
  {
    group: 'Global',
    accelerators: {
      'OpenSetting': 'Ctrl+E',
      'QuitApplication': 'Ctrl+Q',
      'ZoomIn': 'Ctrl++ / Ctrl+= / Ctrl+WheelUp',
      'ZoomOut': 'Ctrl+- / Ctrl+WheelDown',
      'ZoomReset': 'Ctrl+0',
      'FullScreen': 'F11',
      'Minimize': 'Ctrl+M',
      'Reload': 'Ctrl+R',
      'ShowAbout': 'F1',
      'ShowAccelerator': 'Shift+F1',
      'Escape': 'Escape / Backspace / MouseButton3',
      'RevertAction': 'MouseButton4',
    }
  },
  {
    group: 'Home',
    accelerators: {
      'PreviousPage': 'PageUp',
      'NextPage': 'PageDown',
      'FocusUp': 'ArrowUp',
      'FocusDown': 'ArrowDown',
      'FocusLeft': 'ArrowLeft',
      'FocusRight': 'ArrowRight',
      'OpenBook': 'Enter',
      'ManualScan': 'F5',
      'FocusSearch': 'Ctrl+L / F6',
      'ShuffleBook': 'Ctrl+S',
    }
  },
  {
    group: 'BookDetail',
    accelerators: {
      'PreviousBook': 'PageUp',
      'NextBook': 'PageDown',
      'NextRandomBook': 'Shift+PageDown',
      'OpenInnerViewer': 'Enter',
      'OpenExternalViewer': "'",
      'DeleteBook': 'Delete',
    }
  },
  {
    group: 'InnerViewer',
    accelerators: {
      'PreviousBook': 'PageUp',
      'NextBook': 'PageDown',
      'NextRandomBook': 'Shift+PageDown',
      'ScrollUp': 'Ctrl+ArrowUp / Ctrl+ArrowLeft',
      'ScrollDown': 'Ctrl+ArrowDown / Ctrl+ArrowRight',
      'FirstPage': 'Home',
      'LastPage': 'End',
      'InsertEmptyPage': '/',
      'SwitchThumbnail': '=',
      'PreviousPage': 'ArrowLeft / ArrowUp / WheelUp',
      'NextPage': 'ArrowRight / ArrowDown / WheelDown / Space',
      'Zoom': 'Ctrl+WheelUp / Ctrl+WheelDown',
    }
  }
]

const insertLocalReadRecord = (bookId) => {
  const maxRecentRead = 100
  let recentRead = JSON.parse(localStorage.getItem('recentRead') || '[]')
  const recordMap = new Map(recentRead.map(record => [record.id, record]))
  recordMap.delete(bookId)
  recordMap.set(bookId, { id: bookId, read_time: Math.floor(Date.now() / 1000) })
  recentRead = Array.from(recordMap.values())
  if (recentRead.length > maxRecentRead) {
    recentRead = recentRead.slice(-maxRecentRead) // Keep last 100
  }
  localStorage.setItem('recentRead', JSON.stringify(recentRead))
}

const fetchRecentReads = () => {
  const readHist = JSON.parse(localStorage.getItem('recentRead') || '[]')
  return readHist.map(record => record.id).reverse()
}

// ---------- 右键菜单项定义 ----------
// 每个右键菜单(菜单id)包含一组可开关的菜单项(项id)。
// 用户可在 设置 → 右键菜单 中勾选要显示的项,保存在 setting.contextMenuOptions。
const contextMenuDefinitions = {
  title: ['copyTitle', 'copyLink', 'copyTitleAndLink'],
  cover: ['getMetadata', 'resetMetadata', 'openFileLocation', 'moveFile', 'deleteFile', 'toggleHidden', 'copyTag', 'pasteTag', 'getMetadataFromLink'],
  image: ['copyImage', 'setCover', 'deleteImage', 'renameImage', 'upscaleImage', 'ocrImage'],
  comment: ['openLink'],
}

// 默认:全部显示
const defaultContextMenuOptions = () => {
  const result = {}
  for (const [menu, items] of Object.entries(contextMenuDefinitions)) {
    result[menu] = [...items]
  }
  return result
}

// 判断某个右键菜单项是否启用(未配置过则默认启用)
const isContextMenuItemEnabled = (setting, menuId, itemId) => {
  const options = setting?.contextMenuOptions
  if (!options || !options[menuId]) return true
  return options[menuId].includes(itemId)
}

// ---------- 封面懒加载 ----------
// 封面缺失(空路径)或加载失败时,请求主进程按需生成封面(以漫画名命名)并更新路径。
// 网页版(Docker)经 web-ipc 桥转发,返回的 coverPath 会被改写为 /api/file?path=...。
// 失败后标记 _coverFailed,避免 img onerror 死循环。
const ensureBookCover = async (book) => {
  if (!book || book._coverFailed || !book.id) return
  const auth = window.__AUTH__ || {}
  if (auth.enabled && auth.role === 'viewer') return
  try {
    const res = await ipcRenderer.invoke('ensure-book-cover', book.id)
    if (res && res.coverPath) {
      book.coverPath = res.coverPath
      return res.coverPath
    }
    book._coverFailed = true
  } catch (e) {
    book._coverFailed = true
  }
}

// ---------- 自定义主题 / 图标 ----------
// 本地路径 → 浏览器可访问 URL(网页版走 /api/file,桌面版走 file://)
const toAssetUrl = (path) => {
  if (!path) return ''
  if (/^(https?:|data:|blob:)/.test(path)) return path
  if (typeof window !== 'undefined' && window.__WEB_MODE__) {
    return '/api/file?path=' + encodeURIComponent(path)
  }
  return 'file:///' + String(path).replace(/\\/g, '/')
}

// 字体样式映射
const customFontStyles = [
  { value: '', labelKey: 'm.fontStyleDefault' },
  { value: 'Microsoft YaHei, 微软雅黑, sans-serif', labelKey: 'm.fontStyleYaHei' },
  { value: 'SimSun, 宋体, serif', labelKey: 'm.fontStyleSong' },
  { value: 'KaiTi, 楷体, serif', labelKey: 'm.fontStyleKai' },
  { value: 'Consolas, Monaco, monospace', labelKey: 'm.fontStyleMono' },
  { value: 'PingFang SC, Hiragino Sans GB, sans-serif', labelKey: 'm.fontStylePingFang' },
]

// 应用自定义主题(背景色/背景图/字号/字色/字体/主色调)
const applyCustomTheme = (setting) => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const s = setting || {}
  root.style.setProperty('--emm-custom-bg', s.themeCustomBg || '')
  const bgImage = toAssetUrl(s.themeCustomBgImage)
  root.style.setProperty('--emm-custom-bg-image', bgImage ? `url("${bgImage}")` : '')
  root.style.setProperty('--emm-custom-font-size', s.themeCustomFontSize ? s.themeCustomFontSize + 'px' : '')
  root.style.setProperty('--emm-custom-font-color', s.themeCustomFontColor || '')
  root.style.setProperty('--emm-custom-font-family', s.themeCustomFontStyle || '')
  // 主色调(ELEMENT PLUS 变量)
  const primary = s.themeCustomPrimary || '#409EFF'
  root.style.setProperty('--el-color-primary', primary)
  root.style.setProperty('--el-color-primary-light-3', `color-mix(in srgb, ${primary} 70%, white)`)
  root.style.setProperty('--el-color-primary-light-5', `color-mix(in srgb, ${primary} 50%, white)`)
  root.style.setProperty('--el-color-primary-light-7', `color-mix(in srgb, ${primary} 30%, white)`)
  root.style.setProperty('--el-color-primary-light-8', `color-mix(in srgb, ${primary} 20%, white)`)
  root.style.setProperty('--el-color-primary-light-9', `color-mix(in srgb, ${primary} 10%, white)`)
  root.style.setProperty('--el-color-primary-dark-2', `color-mix(in srgb, ${primary} 80%, black)`)
}

// 应用自定义网站图标(浏览器标签页)
const applyFavicon = (setting) => {
  if (typeof document === 'undefined') return
  let link = document.querySelector('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  const path = setting?.customIconPath
  link.href = path ? toAssetUrl(path) : '/icon.png'
}

// 应用自定义应用名称(浏览器标签页标题)
const DEFAULT_APP_NAME = 'EX漫画管理器(exhentai-manga-manager)'
const applyAppName = (setting) => {
  if (typeof window === 'undefined') return
  const name = setting?.appName || DEFAULT_APP_NAME
  window.__APP_NAME__ = name
  if (document.title && document.title.includes('|')) {
    // 保留当前书名部分
    const current = document.title.split('|').pop().trim()
    document.title = current ? `${name} | ${current}` : name
  } else {
    document.title = name
  }
}

// 应用封面尺寸与卡片间距(通过 CSS 变量)
// coverWidth/coverHeight:封面(卡片)宽/高;经典布局高度自动,coverHeight 仅"填充封面"生效
// cardGapV/cardGapH:卡片间距(上下)/(左右);旧 cardGap 单值自动兼容
const applyCoverStyle = (setting) => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const s = setting || {}
  const size = Number(s.coverWidth) > 0 ? Number(s.coverWidth) : 220
  const height = Number(s.coverHeight) > 0 ? Number(s.coverHeight) : 360
  const oldGap = Number(s.cardGap) >= 0 ? Number(s.cardGap) : 6
  const gapV = Number(s.cardGapV) >= 0 ? Number(s.cardGapV) : oldGap
  const gapH = Number(s.cardGapH) >= 0 ? Number(s.cardGapH) : oldGap
  root.style.setProperty('--emm-cover-size', size + 'px')
  root.style.setProperty('--emm-cover-height', height + 'px')
  root.style.setProperty('--emm-card-gap-v', gapV + 'px')
  root.style.setProperty('--emm-card-gap-h', gapH + 'px')
  // 兼容旧引用
  root.style.setProperty('--emm-card-gap', gapV + 'px')
}

// ---------- 工具栏按钮 ----------
// 可自定义的界面按钮(设置按钮与搜索按钮始终保留,不在此列)
const toolbarButtonDefinitions = [
  { id: 'folderTree', labelKey: 'm.folderTree' },
  { id: 'shuffle', labelKey: 'm.shuffle' },
  { id: 'manualScan', labelKey: 'm.manualScan' },
  { id: 'incrementalScan', labelKey: 'm.incrementalScan' },
  { id: 'batchMetadata', labelKey: 'm.batchGetMetadata' },
  { id: 'tagAnalysis', labelKey: 'm.tagAnalysis' },
  { id: 'manageCollection', labelKey: 'm.manageCollection' },
  { id: 'manageTag', labelKey: 'm.manageTag' },
  { id: 'viewerSwitch', labelKey: 'm.viewerSwitch' },
  { id: 'themeSwitch', labelKey: 'm.themeSwitch' },
]
const defaultToolbarButtons = () => toolbarButtonDefinitions.map(b => b.id)

// ---------- 内置标签分类中文名(兜底) ----------
// 标签分类的中文名原本依赖 EhTagTranslation 在线词库(setting.showTranslation);
// 未开启或词库未加载时会回退成英文 key(character/parody…)。这里内置一份常见分类名兜底,
// 保证界面上始终显示中文:resolvedTranslation[cat]?._name || DEFAULT_CAT_NAMES[cat] || cat
const DEFAULT_CAT_NAMES = {
  language: '语言',
  parody: '作品',
  character: '角色',
  group: '社团',
  artist: '作者',
  male: '男性',
  female: '女性',
  mixed: '混合',
  other: '其他',
  cosplayer: 'Cosplay',
  reclass: '重新分类',
  temp: '临时',
  rows: '行数',
  doujinshi: '同人志',
  manga: '漫画',
  artistcg: '作者CG',
  gamecg: '游戏CG',
  western: '欧美',
  nonh: '非H',
  imageset: '图集',
  cosplay: 'Cosplay',
  asianporn: '亚洲',
  misc: '杂项',
}
const catDisplayName = (key) => DEFAULT_CAT_NAMES[key] || key

// ---------- 每页条数 ----------
const parsePageSizes = (raw) => {
  const parsed = String(raw || '')
    .split(/[,，、\s]+/)
    .map(n => parseInt(n, 10))
    .filter(n => Number.isFinite(n) && n > 0)
  return parsed.length ? [...new Set(parsed)] : [12, 24, 42, 72, 500, 5000, 1000000]
}

// ---------- 恢复全部默认 ----------
// 界面/功能类设置的默认值(账户 Cookie、库路径、代理等个人数据保留不清除)
const defaultUiSettings = () => ({
  pageSize: 42,
  loadOnStart: false,
  showComment: true,
  requireGap: 3000,
  thumbnailColumn: 10,
  showTranslation: false,
  theme: 'light e-hentai',
  widthLimit: undefined,
  directEnter: 'detail',
  // 点击策略:detail=详细界面 / content=内容界面(阅读器) / thumbnail=阅读器缩略图
  clickCoverAction: 'detail',
  clickYueAction: 'detail',
  clickDuAction: 'content',
  clickPageCountAction: 'thumbnail',
  dblClickCoverAction: 'content',
  // 「编辑信息」里信息块的显示顺序(可拖动调整)
  detailEditBlockOrder: ['title', 'status', 'url', 'category', 'tags'],
  language: 'default',
  folderTreeWidth: '',
  advancedSearch: true,
  customOptions: '',
  defaultExpandTree: true,
  hidePageNumber: false,
  skipDeleteConfirm: false,
  displayTitle: 'japaneseTitle',
  keepReadingProgress: true,
  trimTitleRegExp: '^\\d+[-]?\\s*|\\s*(\\[[^\\]]*\\]|\\([^\\)]*\\)|【[^】]*】|（[^）]*）)\\s*',
  defaultScraper: 'exhentai',
  defaultInsertEmptyPage: true,
  disableRandomTag: false,
  viewerType: 'original',
  autoNextManga: false,
  batchTagfailedBook: false,
  showCollectTag: true,
  onlyGetMetadataOfSelectedFolder: false,
  titleTranslationMode: 'off',
  titleTranslationBaseUrl: '',
  titleTranslationModel: '',
  titleTranslationApiKey: '',
  // 本地/在线分开配置(新)
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'qwen2.5:7b',
  openaiBaseUrl: 'https://api.deepseek.com/v1',
  openaiModel: 'deepseek-chat',
  openaiApiKey: '',
  contextMenuOptions: defaultContextMenuOptions(),
  hideBookmarkButton: false,
  hidePageCount: false,
  hideReadCount: false,
  hideReadButton: false,
  hideNonTag: false,
  hideTitle: false,
  hideRating: false,
  // 填充封面(开关):开 = 封面铺满卡片、文字/按钮透明浮层;关 = 经典卡片布局
  fillCover: false,
  coverWidth: 220,
  // 封面高度:填充封面布局的固定卡片高度(经典布局高度由内容自适应)
  coverHeight: 360,
  // 卡片间距(上下)/(左右)
  cardGapV: 6,
  cardGapH: 6,
  themeCustomBg: '',
  themeCustomBgImage: '',
  themeCustomPrimary: '#409EFF',
  themeCustomFontSize: 14,
  themeCustomFontColor: '',
  themeCustomFontStyle: '',
  customIconPath: '',
  toolbarButtons: defaultToolbarButtons(),
  customPageSizes: '12,24,42,72,500,5000,1000000',
  scrollInertiaLevel: 'medium',
  enableImageUpscale: false,
  enableImageOcr: false,
})

export {
  getWidth,
  acceleratorInfo,
  insertLocalReadRecord,
  fetchRecentReads,
  contextMenuDefinitions,
  defaultContextMenuOptions,
  isContextMenuItemEnabled,
  ensureBookCover,
  toAssetUrl,
  customFontStyles,
  applyCustomTheme,
  applyFavicon,
  applyCoverStyle,
  applyAppName,
  DEFAULT_APP_NAME,
  toolbarButtonDefinitions,
  defaultToolbarButtons,
  DEFAULT_CAT_NAMES,
  catDisplayName,
  parsePageSizes,
  defaultUiSettings,
}