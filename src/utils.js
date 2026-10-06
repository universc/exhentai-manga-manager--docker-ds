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
  title: ['copyTitle', 'copyLink', 'copyTitleAndLink', 'translateTitle'],
  cover: ['getMetadata', 'resetMetadata', 'openFileLocation', 'moveFile', 'deleteFile', 'toggleHidden', 'copyTag', 'pasteTag', 'getMetadataFromLink', 'translateBook', 'upscaleBook', 'restoreBookBak', 'deleteBookBak', 'colorizeBook'],
  image: ['copyImage', 'setCover', 'deleteImage', 'renameImage', 'upscaleImage', 'restoreImageBak', 'ocrImage', 'translateImage', 'colorizeImage', 'imageProperties'],
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

// 本版本新增的右键菜单项:旧配置里没有它们,用户也没机会取消过 → 默认显示。
// 用户一旦在设置里显式取消,就写进独立的「已取消」标记,之后不再自动恢复。
// (不能用「已知项」记录判断:那个记录在上一版运行时就已经把新项写进去了,会导致兜底永远失效)
const CONTEXT_MENU_NEW_ITEMS = ['restoreImageBak', 'restoreBookBak']
const CONTEXT_MENU_DISABLED_KEY = 'emmContextMenuDisabledNew'
const readDisabledNewItems = () => {
  try {
    const raw = localStorage.getItem(CONTEXT_MENU_DISABLED_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch (e) {
    return new Set()
  }
}
// 用户在设置里取消 / 恢复某个新增项时调用
const markContextMenuItemDisabled = (itemId, disabled) => {
  if (!CONTEXT_MENU_NEW_ITEMS.includes(itemId)) return
  try {
    const set = readDisabledNewItems()
    if (disabled) set.add(itemId)
    else set.delete(itemId)
    localStorage.setItem(CONTEXT_MENU_DISABLED_KEY, JSON.stringify([...set]))
  } catch (e) { /* 隐私模式下写不了也不影响 */ }
}
// 判断某个右键菜单项是否启用(未配置过则默认启用)
const isContextMenuItemEnabled = (setting, menuId, itemId) => {
  const options = setting?.contextMenuOptions
  if (!options || !options[menuId]) return true
  if (options[menuId].includes(itemId)) return true
  if (CONTEXT_MENU_NEW_ITEMS.includes(itemId) && !readDisabledNewItems().has(itemId)) return true
  return false
}

// 按用户在「设置 → 高级 → 右键菜单」里拖动的顺序排列菜单项。
// contextMenuOptions[menuId] 既是「勾选了哪些」也是「顺序」;没有配置过就保持定义顺序。
const sortContextMenuItems = (setting, menuId, items) => {
  // 优先用「完整顺序」(隐藏项也留在原位),老配置回退到「已启用列表」的顺序
  const order = setting?.contextMenuOrder?.[menuId] || setting?.contextMenuOptions?.[menuId]
  if (!Array.isArray(order) || !order.length) return items
  const rank = new Map(order.map((id, index) => [id, index]))
  return [...items].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER
    const rb = rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER
    return ra - rb
  })
}

// 右键菜单项「版本迁移」合并 —— 只并入本版本真正新增的项,绝不动用户取消的勾选。
// 历史 bug:之前用 [...new Set([...saved, ...items])] 无条件把定义里的全部项并回去,
// 结果用户取消勾选的菜单项每次打开软件都被"恢复默认全选"(App.vue 启动时还会把这份全选结果写回服务器)。
// 判定依据:localStorage 记录的「上次界面定义过的项 id」。
//   - 无记录(首次运行 / 清了浏览器数据):完全信任已保存值,不做任何并入;
//   - 有记录:只并入 (当前定义 − 上次定义) 的差集;
//   - 某分组从未保存过(undefined):用默认全量。
// 记录跟随「界面版本」,桌面客户端与网页版各自独立、互不干扰。
const CONTEXT_MENU_KNOWN_KEY = 'emmContextMenuKnown'
const mergeContextMenuOptions = (options) => {
  const result = { ...(options || {}) }
  let changed = false
  let known = null
  try {
    const raw = localStorage.getItem(CONTEXT_MENU_KNOWN_KEY)
    if (raw) known = new Set(JSON.parse(raw))
  } catch (e) {
    known = null
  }
  const currentIds = []
  for (const [menu, items] of Object.entries(contextMenuDefinitions)) {
    for (const id of items) currentIds.push(id)
    const saved = Array.isArray(result[menu]) ? result[menu] : null
    if (saved === null) {
      result[menu] = [...items]
      changed = true
      continue
    }
    if (known) {
      const brandNew = items.filter(id => !known.has(id))
      if (brandNew.length) {
        result[menu] = [...new Set([...saved, ...brandNew])]
        changed = true
      }
    }
  }
  try {
    localStorage.setItem(CONTEXT_MENU_KNOWN_KEY, JSON.stringify(currentIds))
  } catch (e) { /* 忽略:隐私模式下写不了 localStorage 也不影响使用 */ }
  return { options: result, changed }
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
// 分四组:① 开源/免费商用中文字体 ② 开源日文字体 ③ 各系统通用的西文字体(web-safe,引用本机已装字体)
// ④ 通用字体族。微软雅黑、宋体、黑体、苹方、冬青黑体、华文系列等**商业授权中文字体**一律不列。
// 未安装的字体由后面的 sans-serif / serif / monospace 兜底。
const customFontStyles = [
  { value: '', labelKey: 'm.fontStyleDefault' },
  // ① 开源 / 免费商用(中文)
  { value: 'Source Han Sans SC, Noto Sans SC, 思源黑体, sans-serif', labelKey: 'm.fontStyleNoto' },
  { value: 'Source Han Serif SC, Noto Serif SC, 思源宋体, serif', labelKey: 'm.fontStyleNotoSerif' },
  { value: 'LXGW WenKai, LXGW WenKai Screen, 霞鹜文楷, serif', labelKey: 'm.fontStyleLXGW' },
  { value: 'Sarasa Gothic SC, 更纱黑体, sans-serif', labelKey: 'm.fontStyleSarasa' },
  { value: 'Alibaba PuHuiTi, 阿里巴巴普惠体, sans-serif', labelKey: 'm.fontStyleAlibaba' },
  { value: 'HarmonyOS Sans SC, HarmonyOS Sans, 鸿蒙字体, sans-serif', labelKey: 'm.fontStyleHarmonyOS' },
  { value: 'MiSans, 小米兰亭 Pro, sans-serif', labelKey: 'm.fontStyleMiSans' },
  { value: 'OPPO Sans, OPPO Sans SC, sans-serif', labelKey: 'm.fontStyleOPPO' },
  { value: 'Smiley Sans, 得意黑, sans-serif', labelKey: 'm.fontStyleSmiley' },
  // ② 日文(思源日文版为开源;Meiryo / Yu Gothic 是 Windows 自带日文字体)
  { value: 'Noto Sans JP, 思源黑体 JP, sans-serif', labelKey: 'm.fontStyleNotoSansJP' },
  { value: 'Noto Serif JP, 思源宋体 JP, serif', labelKey: 'm.fontStyleNotoSerifJP' },
  { value: 'Meiryo, メイリオ, sans-serif', labelKey: 'm.fontStyleMeiryo' },
  { value: 'Yu Gothic, 游ゴシック, sans-serif', labelKey: 'm.fontStyleYuGothic' },
  // ③ 通用西文字体(Windows / macOS 都自带,无需下载)
  { value: 'Arial, Helvetica, sans-serif', labelKey: 'm.fontStyleArial' },
  { value: 'Verdana, Geneva, sans-serif', labelKey: 'm.fontStyleVerdana' },
  { value: 'Tahoma, Geneva, sans-serif', labelKey: 'm.fontStyleTahoma' },
  { value: 'Trebuchet MS, sans-serif', labelKey: 'm.fontStyleTrebuchet' },
  { value: 'Georgia, serif', labelKey: 'm.fontStyleGeorgia' },
  { value: 'Times New Roman, Times, serif', labelKey: 'm.fontStyleTimes' },
  { value: 'Courier New, monospace', labelKey: 'm.fontStyleCourier' },
  // ④ 通用字体族(由系统映射到本机默认字体)
  { value: 'sans-serif', labelKey: 'm.fontStyleSans' },
  { value: 'serif', labelKey: 'm.fontStyleSerif' },
  { value: 'ui-monospace, monospace', labelKey: 'm.fontStyleMono' },
]

// 取颜色的 alpha(支持 #rgb / #rrggbb / #rgba / #rrggbbaa / rgb() / rgba() / hsl() / hsla())
const colorAlpha = (color) => {
  const c = String(color == null ? '' : color).trim()
  let m = c.match(/^rgba?\(([^)]+)\)$/i) || c.match(/^hsla?\(([^)]+)\)$/i)
  if (m) {
    const parts = m[1].split(',')
    return parts.length === 4 ? Number(parts[3]) : 1
  }
  m = c.match(/^#([0-9a-fA-F]{8})$/)
  if (m) return parseInt(m[1].slice(6, 8), 16) / 255
  m = c.match(/^#([0-9a-fA-F]{4})$/)
  if (m) return parseInt(m[1].slice(3, 4), 16) / 15
  return 1
}

// 应用自定义主题(背景色/背景图/字号/字色/字体/主色调,颜色支持调透明度)
const applyCustomTheme = (setting) => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const s = setting || {}
  const bg = s.themeCustomBg || ''
  root.style.setProperty('--emm-custom-bg', bg)
  // 背景色带透明度时,让弹层/卡片也用同一个半透明色 —— 否则弹层仍是不透明背景,看不出透明效果
  const translucent = colorAlpha(bg) < 0.999
  root.style.setProperty('--emm-custom-panel-bg', translucent ? bg : '')
  // 卡片框内颜色 / 按钮框内颜色:单独设置优先;没设时若背景是半透明,就跟着背景色走
  root.style.setProperty('--emm-custom-card-bg', s.themeCustomCardBg || (translucent ? bg : ''))
  root.style.setProperty('--emm-custom-button-bg', s.themeCustomButtonBg || (translucent ? bg : ''))
  const bgImage = toAssetUrl(s.themeCustomBgImage)
  root.style.setProperty('--emm-custom-bg-image', bgImage ? `url("${bgImage}")` : '')
  const fontSize = Number(s.themeCustomFontSize)
  root.style.setProperty('--emm-custom-font-size', Number.isFinite(fontSize) && fontSize > 0 ? fontSize + 'px' : '')
  root.style.setProperty('--emm-custom-font-color', s.themeCustomFontColor || '')
  root.style.setProperty('--emm-custom-font-family', s.themeCustomFontStyle || '')
  // 经典文字效果:加粗 / 倾斜 / 下划线
  // 字重:优先用「粗细」下拉;兼容旧配置里的「加粗」开关
  const weight = s.themeCustomFontWeight ? String(s.themeCustomFontWeight) : (s.themeCustomFontBold ? '700' : '')
  root.style.setProperty('--emm-custom-font-weight', weight)
  root.style.setProperty('--emm-custom-font-italic', s.themeCustomFontItalic ? 'italic' : '')
  root.style.setProperty('--emm-custom-font-decoration', s.themeCustomFontUnderline ? 'underline' : '')
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

// 自定义主题的变量是直接写在 <html> 内联样式上的,内联优先级高于主题类 ——
// 从「自定义」切到别的主题时必须逐个清掉,否则主色调 / 字号 / 字体颜色会一直赖着不走
const CUSTOM_THEME_VARS = [
  '--emm-custom-bg', '--emm-custom-panel-bg', '--emm-custom-card-bg', '--emm-custom-button-bg', '--emm-custom-bg-image',
  '--emm-custom-font-size', '--emm-custom-font-color', '--emm-custom-font-family',
  '--emm-custom-font-weight', '--emm-custom-font-italic', '--emm-custom-font-decoration',
  '--el-color-primary', '--el-color-primary-light-3', '--el-color-primary-light-5',
  '--el-color-primary-light-7', '--el-color-primary-light-8', '--el-color-primary-light-9',
  '--el-color-primary-dark-2',
]
const clearCustomTheme = () => {
  if (typeof document === 'undefined') return
  const style = document.documentElement.style
  for (const name of CUSTOM_THEME_VARS) style.removeProperty(name)
}

// 像素风格:独立于主题的附加外观(方角硬边 + 关掉圆角/阴影/过渡 + 图片像素化 + 像素字体)
// 只是个 class,具体覆盖规则在 App.vue 的 html.theme-pixel 里
const applyPixelTheme = (setting) => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('theme-pixel', !!setting?.pixelTheme)
  // 自带的开源像素字体(方舟像素 Ark Pixel 12px,OFL-1.1):简体/繁体是两个字体族,
  // 按界面语言切换,这样不依赖用户本机是否装了像素字体
  const hant = String(setting?.language || '') === 'zh-TW'
  root.style.setProperty('--emm-pixel-font', hant ? "'EmmPixelHant', 'EmmPixel'" : "'EmmPixel', 'EmmPixelHant'")
  // 混合背景:根据当前显示的漫画封面取色生成渐变(颜色由 App.vue 算好写进 --emm-mix-bg)
  root.classList.toggle('theme-mixbg', !!setting?.mixBackground)
  if (!setting?.mixBackground) root.style.removeProperty('--emm-mix-bg')
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
  // 宽 / 高:只有用户真调过(不等于默认值)才写变量,没调过时由各布局自己算
  //   --emm-card-width  : 移动端布局用它代替「按屏宽自适应的列宽」(App.vue body.emm-mobile)
  //   --emm-card-height : 卡片整体高度(填充封面 / 纯封面布局直接用)
  //   --emm-cover-height: 经典布局的封面图高度 = 卡片高度 - 标题等固定区域(约 84px)
  const widthCustom = Number(s.coverWidth) > 0 && Number(s.coverWidth) !== 220
  const heightCustom = Number(s.coverHeight) > 0 && Number(s.coverHeight) !== 360
  root.style.setProperty('--emm-card-width', widthCustom ? size + 'px' : '')
  root.style.setProperty('--emm-card-height', heightCustom ? height + 'px' : '')
  root.style.setProperty('--emm-cover-height', heightCustom ? Math.max(60, height - 84) + 'px' : '')
  root.style.setProperty('--emm-card-gap-v', gapV + 'px')
  root.style.setProperty('--emm-card-gap-h', gapH + 'px')
  // 兼容旧引用
  root.style.setProperty('--emm-card-gap', gapV + 'px')
}

// ---------- 工具栏按钮 ----------
// 可自定义的界面元素:顺序即默认排列顺序(设置按钮始终保留,不在此列)。
// searchInput / searchButton / sortSelect / uiMode 是后来加入排序的固定元素,
// 老配置里没有它们,由 ensureToolbarButtons() 兜底补上(只有用户显式取消后才不再出现)
const toolbarButtonDefinitions = [
  { id: 'searchInput', labelKey: 'm.toolbarSearchInput' },
  { id: 'searchButton', labelKey: 'm.toolbarSearchButton' },
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
  { id: 'fullscreen', labelKey: 'm.fullscreenButton' },
  { id: 'sortSelect', labelKey: 'm.toolbarSortSelect' },
  // 设置按钮:可以拖动排序,但不能隐藏(常驻)
  { id: 'setting', labelKey: 'm.setting' },
  { id: 'uiMode', labelKey: 'm.toolbarUiMode' },
]
const defaultToolbarButtons = () => toolbarButtonDefinitions.map(b => b.id)

// 后来新增、老配置里不存在的工具栏元素:升级后默认仍然显示,只有用户显式关掉才隐藏
// 「显式关掉」记在设置项 toolbarButtonsHidden 里(不是只看 toolbarButtons 缺不缺 ——
// 老配置本来就缺这几项,分不清「没有」和「被关掉」)
const TOOLBAR_NEW_ITEMS = ['searchInput', 'searchButton', 'sortSelect', 'uiMode']
// 常驻元素:能拖动排序,但永远显示(设置列表里点击不生效)
const TOOLBAR_ALWAYS_ITEMS = ['setting']
// 补齐老配置里缺失的新元素;返回值只决定「显示与否」,排列顺序另由 toolbarButtonOrder 决定
const ensureToolbarButtons = (list, hidden) => {
  // list 缺失(旧配置没这个键)才用默认全开;空数组 = 用户把按钮全关了,尊重
  if (!Array.isArray(list)) return defaultToolbarButtons()
  const off = Array.isArray(hidden) ? hidden : []
  const out = list.filter(id => toolbarButtonDefinitions.some(b => b.id === id))
  for (const b of toolbarButtonDefinitions) {
    if (!out.includes(b.id) && TOOLBAR_NEW_ITEMS.includes(b.id) && !off.includes(b.id)) out.push(b.id)
  }
  return out
}

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
// 反向映射:中文显示名 → 英文分类键(收藏标签的历史数据可能存的是显示名,如 "角色")
const CAT_NAME_TO_KEY = Object.fromEntries(Object.entries(DEFAULT_CAT_NAMES).map(([k, v]) => [v, k]))
const resolveCatKey = (cat) => (DEFAULT_CAT_NAMES[cat] ? cat : (CAT_NAME_TO_KEY[cat] || cat))

// ---------- 标签多语言名称:按「目标语言标签」设置显示 ----------
// 同一标签可保存多个语言的名称,显示时按 setting.tagTargetLang 选,缺失则依次回退
const getDisplayTagName = (setting, cat, tag) => {
  if (!tag) return tag
  const map = (setting && setting.tagNameLangs) || {}
  const rec = map[cat + '::' + tag]
  if (!rec) return null
  const lang = (setting && setting.tagTargetLang) || ''
  // 「默认」:优先使用默认名称,再依次回退其它语言
  if (!lang) return rec['default'] || null
  const order = lang === 'en'
    ? ['en', 'default', 'zh-CN', 'zh-TW', 'ja']
    : lang === 'ja'
      ? ['ja', 'default', 'zh-CN', 'zh-TW', 'en']
      : lang === 'zh-TW'
        ? ['zh-TW', 'default', 'zh-CN', 'ja', 'en']
        : ['zh-CN', 'default', 'zh-TW', 'ja', 'en']
  for (const k of order) { if (rec[k]) return rec[k] }
  return null
}

// ---------- 标签关联(包含 / 被包含) ----------
// 结构:setting.tagRelations = { '分类::标签': { contains: ['分类2::标签2', ...] } }
// 「被包含」由 contains 反向推导,避免双份数据不一致。
const getTagRelations = (setting) => (setting && setting.tagRelations) || {}
// 该标签被哪些集合包含(返回 '分类::标签' 数组,按配置顺序)
const getContainedBy = (setting, cat, tag) => {
  const key = cat + '::' + tag
  const all = getTagRelations(setting)
  const direct = all[key]
  if (direct && Array.isArray(direct.containedBy) && direct.containedBy.length) return direct.containedBy
  const out = []
  for (const [k, v] of Object.entries(all)) {
    if (k !== key && v && Array.isArray(v.contains) && v.contains.includes(key)) out.push(k)
  }
  return out
}
// 该标签包含哪些元素
const getContains = (setting, cat, tag) => {
  const rel = getTagRelations(setting)[cat + '::' + tag]
  return (rel && Array.isArray(rel.contains)) ? rel.contains : []
}
// 标签名后加括号显示前 maxSets 个所属集合,如 光辉(碧蓝航线,女)
const formatTagWithSets = (setting, cat, tag, maxSets = 3) => {
  if (!tag) return tag
  let sets = []
  try { sets = getContainedBy(setting, cat, tag) } catch { sets = [] }
  const names = sets.slice(0, maxSets).map(k => { const p = k.split('::'); return p[1] || k })
  return names.length ? tag + '(' + names.join(',') + ')' : tag
}

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
  // 随机标签:默认禁用,勾选后启用(与「显示收藏标签」互斥)
  randomTagsEnabled: false,
  // 目标语言标签:标签名按该语言显示(中/繁/英/日)
  tagTargetLang: '',
  viewerType: 'original',
  autoNextManga: false,
  batchTagfailedBook: false,
  showCollectTag: true,
  // 标签多语言名称:{ '分类::标签': { 'zh-CN': '', ja: '', en: '', 'zh-TW': '' } }
  tagNameLangs: {},
  tagRelations: {},
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
  // 右键菜单项的完整显示顺序(与「启用与否」分开存,这样隐藏的项会留在原地而不是被挤到后面)
  contextMenuOrder: {},
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
  themeCustomFontBold: false,
  themeCustomFontWeight: '',
  themeCustomFontItalic: false,
  themeCustomFontUnderline: false,
  themeCustomCardBg: '',
  themeCustomButtonBg: '',
  // 高级主题:像素风格(独立开关,可与任意主题叠加)
  pixelTheme: false,
  // 像素风点击音效(仅像素风格开启时生效)
  pixelSfx: true,
  // 混合背景:按当前显示的漫画封面取色生成渐变背景
  mixBackground: false,
  customIconPath: '',
  toolbarButtons: defaultToolbarButtons(),
  // 用户显式关掉的「后加入」工具栏元素(搜索框/搜索按钮/排序框/界面模式框)
  toolbarButtonsHidden: [],
  customPageSizes: '12,24,42,72,500,5000,1000000',
  scrollInertiaLevel: 'medium',
  enableImageUpscale: true,
  enableImageOcr: true,
  enableImageColorize: true,
  upscaleApiModel: '',
  upscaleApiKey: '',
  colorizeApiUrl: '',
  colorizeApiModel: '',
  colorizeApiKey: '',
  ocrApiKey: '',
  aiApiProfiles: [],
  infoApiProfileId: '',
  upscaleApiProfileId: '',
  colorizeApiProfileId: '',
  ocrApiProfileId: '',
  imgTranslateApiProfileId: '',
  infoProcessApiProfileId: '',
  infoProcessTasks: ['tags', 'story', 'translate'],
  tagGenCategories: [],
  storyGenTypes: ['summary'],
  translateTargetLang: 'zh-CN',
  infoProcessSaveMode: 'same',
  translateSaveMode: 'folder',
  ocrSaveMode: 'folder',
  storyGenApiProfileId: '',
  tagGenApiProfileId: '',
  upscaleSaveMode: 'same',
  upscaleScale: 2,
  // 超分过滤:图片宽和高都 ≥ 阈值(默认 1200×2000)时跳过超分,避免对已经足够清晰的图白跑一次
  upscaleSkipHighRes: true,
  upscaleSkipWidth: 1200,
  upscaleSkipHeight: 2000,
  // 内置阅读器:浮层设置栏的弹出方式与阅读结束行为
  viewerToolbarHover: true,   // 鼠标移到屏幕顶部(1/22)时弹出设置栏
  viewerToolbarClick: true,   // 点击画面中央 1/4 区域时弹出设置栏
  viewerEndAction: 'none',    // 阅读完成后:none=不处理 / exit=退出阅读器 / next=打开下一本 / random=打开随机一本
  viewerEndTip: true,         // 到最后一页时给一次提示
  // 自动超分放大:图片被放大显示时自动超分(仅用于显示,不落盘)
  autoUpscale: false,
  autoUpscaleRatio: 1.05,          // 显示尺寸超过原图这个倍数时触发自动超分
  autoUpscaleEngine: '',           // 自动超分用的模型:空=跟随「图片超分」;local:<id> / api:<profileId>
  autoUpscaleSaveMode: 'preview',  // 自动超分的保存方式:preview=只用于显示(默认,不落盘)
  // 阅读方向:vertical=上下(卷轴) / ltr=左右 / rtl=右左(日漫)
  readingDirection: 'vertical',
  // 卷轴模式下是否并排显示两页(和 ComicRead 的卷轴双页一致)
  scrollDoubleMode: false,
  // 阅读时设置栏里显示哪些按钮(顺序即数组顺序;留空=全部显示;「退出」按钮固定常驻不在此列)
  viewerToolbarButtons: [],
  // 阅读器底部「上一本 / 随机 / 下一本」按钮是否显示
  showNextMangaButtons: true,
  // 阅读器里图片之间的距离(px)与缩略图之间的距离(px),0 = 紧贴
  viewerImageGap: 0,
  viewerThumbnailGap: 0,
  // 点设置栏按钮时是否弹一句用法提示(可在 设置 → 内置阅读器 里关掉)
  viewerButtonTips: true,
  // 设置栏按钮的完整顺序(含隐藏项;空=定义顺序)
  viewerToolbarOrder: [],
  // 主界面工具栏按钮的完整顺序(含隐藏项;空=定义顺序)
  toolbarButtonOrder: [],
  // 界面:是否显示右上角的方框全屏按钮
  showFullscreenButton: true,
  // 超分输出尺寸:scale=按倍数 / width=按目标宽度(px)
  upscaleSizeMode: 'scale',
  upscaleTargetWidth: 2000,
  colorizeSaveMode: 'same',
})

export {
  getWidth,
  acceleratorInfo,
  insertLocalReadRecord,
  fetchRecentReads,
  contextMenuDefinitions,
  defaultContextMenuOptions,
  isContextMenuItemEnabled,
  markContextMenuItemDisabled,
  sortContextMenuItems,
  mergeContextMenuOptions,
  ensureBookCover,
  toAssetUrl,
  customFontStyles,
  applyCustomTheme,
  clearCustomTheme,
  applyPixelTheme,
  applyFavicon,
  applyCoverStyle,
  applyAppName,
  DEFAULT_APP_NAME,
  toolbarButtonDefinitions,
  defaultToolbarButtons,
  TOOLBAR_NEW_ITEMS,
  TOOLBAR_ALWAYS_ITEMS,
  ensureToolbarButtons,
  DEFAULT_CAT_NAMES,
  resolveCatKey,
  catDisplayName,
  getDisplayTagName,
  getTagRelations,
  getContainedBy,
  getContains,
  formatTagWithSets,
  parsePageSizes,
  defaultUiSettings,
}