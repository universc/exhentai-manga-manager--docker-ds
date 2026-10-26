// EH 在线漫画库:站点/来源 URL 与漫画列表页解析。
//
// 口径来自 JHenTai-8.0.16-334:
//   - lib/src/consts/eh_consts.dart           站点与各来源 URL
//   - lib/src/utils/eh_spider_parser.dart     列表页 HTML 的解析(四种版式 + gid 游标翻页 + 评分偏移)
//
// 只做「取列表 + 解析」,不涉及下载入库:HTML 由主进程现成的 get-ex-webpage 通道取回
// (带 Cookie 与代理),这里用 DOMParser 解析 —— 与 SearchDialog.vue 的 resolveEhentaiResult 同一套做法。

export const EH_ONLINE_ID = 'eh-online'
export const EX_HOST = 'exhentai.org'
export const EH_HOST = 'e-hentai.org'

// 是否已填登录 Cookie(ipb_member_id + ipb_pass_hash 是 EH 登录态的必备两项)
export const hasEhCookies = (setting) => {
  const s = setting || {}
  return !!(String(s.ipb_member_id || '').trim() && String(s.ipb_pass_hash || '').trim())
}

// 有有效 igneous 才走 exhentai.org;否则走 e-hentai.org
// ('' / 'null' / 'mystery' / 'deleted' 都是"没有 igneous"的写法,照 JHenTai 的判法)
export const useExSite = (setting) => {
  const v = String((setting || {}).igneous || '').trim()
  return !!v && v !== 'null' && v !== 'mystery' && v !== 'deleted'
}

export const ehHost = (setting) => (useExSite(setting) ? EX_HOST : EH_HOST)

// 列表页 URL。
// source: front(首页) / favorites(收藏) / search(关键词搜索)
// cursor: EH 的 gid 游标(上一页/下一页由页面里的 #uprev / #unext 给出,参数名是 prev / next)
// filter: 「筛选」翻译过来的 EH 查询参数(见 ehFilter.js 的 ehFilterParams),缺省就是不加任何筛选
export const ehListUrl = (setting, { source = 'front', query = '', cursor = null, host = '', filter = null } = {}) => {
  const h = host || ehHost(setting)
  const params = []
  const kw = String(query || '').trim()
  // 语言照 JHenTai 的做法并进 f_search(写进查询串:`language:"chinese"`)
  let search = kw
  if (filter && filter.language) search = (search ? search + ' ' : '') + `language:"${filter.language}"`
  // 黑名单标签:EH 搜索语法里 `-tag` 是排除;多词标签要写成下划线形式
  if (filter && Array.isArray(filter.blacklist) && filter.blacklist.length) {
    search = (search ? search + ' ' : '') + filter.blacklist.map(t => '-' + String(t).trim().replace(/\s+/g, '_')).join(' ')
  }
  if (search) params.push('f_search=' + encodeURIComponent(search))
  if (filter) {
    if (filter.fCats) params.push('f_cats=' + filter.fCats)
    if (filter.expunged) params.push('f_sh=on')
    if (filter.torrents) params.push('f_sto=on')
    if (filter.pageAtLeast != null) params.push('f_spf=' + filter.pageAtLeast)
    if (filter.pageAtMost != null) params.push('f_spt=' + filter.pageAtMost)
    if (filter.minimumRating > 1) params.push('f_srdd=' + filter.minimumRating)
  }
  if (cursor) params.push('next=' + encodeURIComponent(String(cursor)))
  const qs = params.length ? '?' + params.join('&') : ''
  if (source === 'favorites') return `https://${h}/favorites.php${qs}`
  return `https://${h}/${qs}`
}

const absUrl = (href, host) => {
  const h = String(href || '').trim()
  if (!h) return ''
  if (/^https?:\/\//i.test(h)) return h
  if (h.startsWith('//')) return 'https:' + h
  return `https://${host}/${h.replace(/^\/+/, '')}`
}

// 评分:EH 用 .ir 的 style="background-position:-Xpx -Ypx" 表示星级(JHenTai _parseGalleryRating)
const parseRating = (row) => {
  const style = row.querySelector('.ir') ? (row.querySelector('.ir').getAttribute('style') || '') : ''
  const offs = [...style.matchAll(/(-?\d+)px/g)].map(m => Number(m[1]))
  if (offs.length < 2) return 0
  let value = 5 + offs[0] / 16
  if (offs[1] === -21) value -= 0.5
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(5, Math.round(value * 2) / 2))
}

const intOf = (text) => {
  const m = /(\d+)/.exec(String(text || ''))
  return m ? Number(m[1]) : null
}

// 列表行里的标签:EH 每行的 .gt / .gtl / .gtw 带 title="namespace:tag"
const parseRowTags = (row) => {
  const out = {}
  for (const el of row.querySelectorAll('.gt, .gtl, .gtw')) {
    const pair = el.getAttribute('title') || ''
    const i = pair.indexOf(':')
    if (i <= 0) continue
    const cat = pair.slice(0, i).trim() || 'misc'
    const tag = pair.slice(i + 1).trim()
    if (!tag) continue
    if (!out[cat]) out[cat] = []
    if (!out[cat].includes(tag)) out[cat].push(tag)
  }
  return out
}

// 页数:照 JHenTai 的口径按版式取单元格(compact / extended / 网格),
// 都取不到时退回整行文本里的 "NN pages"。
// ⚠️ 兜底正则不能写 \b:列表里文本是连在一起的("66 pages" 后面紧跟日期),`pages\b` 匹配不到。
const PAGE_COUNT_CELLS = [
  ['.gl4c.glhide > div', 1], // compact
  ['.gl3e > div', 4], // extended
  ['.gl5t > div:nth-child(1) > div', 1] // 网格版式
]
const parsePageCount = (row) => {
  for (const [sel, idx] of PAGE_COUNT_CELLS) {
    const divs = row.querySelectorAll(sel)
    if (divs.length > idx) {
      const n = intOf(divs[idx].textContent)
      if (n !== null) return n
    }
  }
  const m = /(\d+)\s*pages(?![a-z])/i.exec(row.textContent || '')
  return m ? Number(m[1]) : null
}

// 列表页里「已收藏」的标记是封面框的 border-color;照 JHenTai 的颜色→分类索引表换算
// (lib/src/config/ui_config.dart:104-115 favoriteTagIndex)
const FAVORITE_TAG_INDEX = {
  '000': 0, f00: 1, fa0: 2, dd0: 3, '080': 4, '9f4': 5, '4bf': 6, '00f': 7, '508': 8, e8e: 9
}
const parseFavoriteTagIndex = (row) => {
  const m = /border-color:\s*#?([0-9a-f]{3})\b/i.exec(row.outerHTML || '')
  if (!m) return null
  const idx = FAVORITE_TAG_INDEX[m[1].toLowerCase()]
  return idx === undefined ? null : idx
}

// 一行 → 一个画廊。四种版式的选择器都试一遍(JHenTai _parseCompact/Extended/Thumbnail/MinimalGallery)
const parseRow = (row, host) => {
  const linkEl = row.querySelector('.gl3c.glname > a')
    || row.querySelector('.gl1e > div > a')
    || row.querySelector('.gl3m.glname > a')
    || row.querySelector('a[href*="/g/"]')
  const href = linkEl ? (linkEl.getAttribute('href') || '') : ''
  if (!/\/g\/\d+\/[0-9a-z]+/i.test(href)) return null
  const img = row.querySelector('img')
  const cnEl = row.querySelector('.cn') || row.querySelector('.gl1m.glcat > div') || row.querySelector('.cs')
  const glink = row.querySelector('.glink')
  const url = absUrl(href, host)
  return {
    // 在线项:和本地书区分开(on: true),书架点击逻辑据此走"打开网页"而不是内置阅读器
    id: 'eh:' + url,
    online: true,
    url,
    title: glink ? (glink.textContent || '').trim() : '',
    category: cnEl ? (cnEl.textContent || '').trim() : '',
    cover: img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '',
    pageCount: parsePageCount(row),
    rating: parseRating(row),
    tags: parseRowTags(row),
    // 账号收藏状态:null = 没收藏,0-9 = 在第几个收藏夹(JHenTai gallery.favoriteTagIndex)
    favcat: parseFavoriteTagIndex(row)
  }
}

const cursorOf = (doc, id) => {
  const href = doc.querySelector('#' + id) ? (doc.querySelector('#' + id).getAttribute('href') || '') : ''
  const m = /(?:next|prev)=(\d+)/.exec(href)
  return m ? m[1] : null
}

// 明确可识别的失败页(其余情况交给「没有画廊」的兜底)
const detectError = (html) => {
  const h = html || ''
  if (/Your IP address has been temporarily banned/i.test(h)) return 'ipBanned'
  if (/509 (Bandwidth|Error)|Bandwidth Limit Exceeded/i.test(h)) return 'ipBanned'
  if (/sadpanda|sad panda/i.test(h)) return 'notLoggedIn'
  return ''
}

// 解析列表页 HTML。
// 返回 { galleries, nextGid, prevGid, totalText, error }
//   error: '' | 'empty' | 'parse' | 'noList' | 'ipBanned' | 'notLoggedIn'
export const parseGalleryList = (html, host = EH_HOST) => {
  const out = { galleries: [], nextGid: null, prevGid: null, totalText: '', error: '' }
  if (!html || typeof html !== 'string') { out.error = 'empty'; return out }
  const known = detectError(html)
  if (known) { out.error = known; return out }
  let doc
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch (e) {
    out.error = 'parse'
    return out
  }
  const table = doc.querySelector('.itg.gltm, .itg.gltc, .itg.glte, .itg.gld')
  if (!table) { out.error = 'noList'; return out }

  // 表格版式用 tbody > tr;网格版式(.itg.gld)是 div —— 两条路都兜住
  let rows = [...table.querySelectorAll('tbody > tr')]
  if (!rows.length) rows = [...table.querySelectorAll('div')].filter(d => d.querySelector('a[href*="/g/"]'))
  rows = rows.filter(r => !r.querySelector('th')) // 去掉表头行

  const seen = new Set()
  for (const row of rows) {
    const g = parseRow(row, host)
    if (!g || !g.url || seen.has(g.url)) continue
    seen.add(g.url)
    out.galleries.push(g)
  }
  out.nextGid = cursorOf(doc, 'unext')
  out.prevGid = cursorOf(doc, 'uprev')
  const st = doc.querySelector('.searchtext')
  out.totalText = st ? (st.textContent || '').trim() : ''
  return out
}

// 「从剪贴板粘贴 Cookie」:把浏览器里复制来的一整串(Cookie 头 / document.cookie / 开发者工具里的键值对)
// 里的四项抽出来(JHenTai login_page_logic.dart 的 _autoDetectClipboard / pasteCookie 同口径)
export const parseCookieString = (text) => {
  const s = String(text || '')
  const pick = (name) => {
    const m = new RegExp(name + '\\s*[=:]\\s*"?([^;\\s"\\n]+)"?', 'i').exec(s)
    return m ? m[1].trim() : ''
  }
  return {
    igneous: pick('igneous'),
    ipb_pass_hash: pick('ipb_pass_hash'),
    ipb_member_id: pick('ipb_member_id'),
    star: pick('star')
  }
}

// ---------- 画廊详情页(/g/<gid>/<token>/)----------
// 口径来自 JHenTai detailPage2GalleryAndDetailAndApikey / _detailPageDocument2Tags /
// _detailPageDocument2Thumbnails:#gn 标题、#gj 日文标题、#gd1 封面、#gdc 分类、
// #gdd 信息表(Posted / Length / Language 等)、#gdn 上传者、#grt2 评分、#taglist 标签、#gdt 页预览。
const detailLabelValue = (doc) => {
  const out = {}
  for (const tr of doc.querySelectorAll('#gdd tr')) {
    const k = tr.querySelector('.gdt1')
    const v = tr.querySelector('.gdt2')
    if (k && v) out[(k.textContent || '').trim().toLowerCase().replace(/:\s*$/, '')] = (v.textContent || '').trim()
  }
  return out
}

// 详情页标签:每行 <td class="tc">language:</td><td><div id="td_language:chinese" class="gt"><a>chinese</a>
const parseDetailTags = (doc) => {
  const out = {}
  for (const tr of doc.querySelectorAll('#taglist tr')) {
    const ns = (tr.querySelector('td.tc')?.textContent || '').trim().replace(/:\s*$/, '') || 'misc'
    for (const div of tr.querySelectorAll('td:nth-child(2) div')) {
      const id = div.getAttribute('id') || ''
      let tag = (div.querySelector('a')?.textContent || '').trim()
      if (!tag) {
        const k = id.indexOf(':')
        tag = (k > 0 ? id.slice(k + 1) : id.replace(/^[a-z]+_/i, '')).replace(/_/g, ' ').trim()
      } else {
        tag = tag.replace(/_/g, ' ')
      }
      if (!tag) continue
      if (!out[ns]) out[ns] = []
      if (!out[ns].includes(tag)) out[ns].push(tag)
    }
  }
  return out
}

// 详情页页预览缩略图(导出给「详情界面/侧栏」做分页续拉)。⚠ 真实页面(#gdt class="gt200")是「雪碧图」:所有页共用同一张 url,
// 靠 style 里的 width/height 与 background-position 的 -Npx 偏移定位第几页(见 JHenTai offSet 的处理)。
export const parseGalleryThumbs = (doc, host) => {
  const roots = [...doc.querySelectorAll('#gdt > a')]
  if (!roots.length) roots.push(...doc.querySelectorAll('#gdt a'))
  const out = []
  const seen = new Set()
  for (const a of roots) {
    const href = a.getAttribute('href') || ''
    if (!href || seen.has(href)) continue
    const styled = a.querySelector('[style*="url("]') || a.querySelector('div[style]')
    if (!styled) continue
    const style = styled.getAttribute('style') || ''
    const um = /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(style)
    if (!um) continue
    const wm = /width:\s*(\d+)px/.exec(style)
    const hm = /height:\s*(\d+)px/.exec(style)
    const om = /\)\s*-\s*(\d+)px/.exec(style)
    seen.add(href)
    out.push({
      href: absUrl(href, host),
      thumb: absUrl(um[1], host),
      width: wm ? Number(wm[1]) : null,
      height: hm ? Number(hm[1]) : null,
      offsetX: om ? Number(om[1]) : 0
    })
  }
  // 整张雪碧图的总宽 = max(每格 offsetX + 单格宽)。
  // 预览格子要用 CSS 变量做缩放(拖宽时零 JS 重算),必须知道原图总宽,
  // 才能把 background-size 写成「总宽 × 缩放比」;否则只会显示第一格。
  const spriteWidth = out.reduce((mx, t) => Math.max(mx, (t.offsetX || 0) + (t.width || 0)), 0)
  if (spriteWidth > 0) out.forEach(t => { t.spriteWidth = spriteWidth })
  return out
}

// 解析画廊详情页。返回 { ok, error, title, titleJpn, category, cover, pageCount, rating,
//                         uploader, posted, language, size, tags, thumbnails }
export const parseGalleryDetail = (html, host = EH_HOST) => {
  const out = {
    ok: false, error: '', title: '', titleJpn: '', category: '', cover: '',
    pageCount: null, rating: 0, uploader: '', posted: '', language: '', size: '',
    tags: {}, thumbnails: []
  }
  if (!html || typeof html !== 'string') { out.error = 'empty'; return out }
  const known = detectError(html)
  if (known) { out.error = known; return out }
  let doc
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch (e) { out.error = 'parse'; return out }
  const gn = doc.querySelector('#gn')
  if (!gn) { out.error = 'noDetail'; return out }
  out.ok = true
  out.title = (gn.textContent || '').trim()
  out.titleJpn = (doc.querySelector('#gj')?.textContent || '').trim()
  out.category = (doc.querySelector('#gdc .cs')?.textContent || doc.querySelector('#gdc')?.textContent || '').trim()
  // 封面:#gd1 里的 div 用 background:url(...)
  const coverStyle = doc.querySelector('#gd1 div[style*="url("]')?.getAttribute('style') || ''
  const cm = /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(coverStyle)
  if (cm) out.cover = absUrl(cm[1], host)
  const info = detailLabelValue(doc)
  const len = (info.length || info.pages || '')
  const pn = parseInt(len, 10)
  out.pageCount = Number.isFinite(pn) ? pn : null
  out.posted = info.posted || ''
  out.language = info.language || ''
  out.size = info['file size'] || info.filesize || info.size || ''
  out.uploader = (doc.querySelector('#gdn a')?.textContent || '').trim()
  out.rating = parseRating(doc.querySelector('#grt2') || doc)
  out.tags = parseDetailTags(doc)
  out.thumbnails = parseGalleryThumbs(doc, host)
  // H@H 归档页链接(照 JHenTai 的 detailsPage 里的 archivePageUrl):
  // ⚠ EH 把「Archive Download」写成 <a href="#" onclick="return popUp('…archiver.php?gid=…&token=…',480,320)">
  //   —— 链接在 onclick 里、href 是 "#"。以前只查 href 所以永远拿不到。
  let archLink = doc.querySelector('a[href*="archiver.php"]')?.getAttribute('href') || ''
  if (!archLink || archLink === '#') {
    const el = doc.querySelector('[onclick*="archiver.php"]')
    const oc = (el && el.getAttribute('onclick')) || ''
    const m = /['"]([^'"]*archiver\.php[^'"]*)['"]/i.exec(oc)
    if (m) archLink = m[1]
  }
  out.archivePageUrl = archLink && archLink !== '#' ? absUrl(archLink.replace(/&amp;/g, '&'), host) : ''
  return out
}

// ---------- 在线画廊 ↔ 软件自己的「书」 ----------
// 把画廊映射成书的形状,好让软件原有的卡片(BookCard)与详情(BookDetailDialog)直接复用 ——
// 这是「EH 在线跟本地长得一样」的关键:显示层不另起一套。
// ⚠️ filepath 给 url 兜底:卡片/详情里有些分支会取文件名(例如「显示标题 = 文件名」),留空会崩。
export const galleryToBook = (g) => {
  if (!g) return null
  const pages = (g.pageCount == null) ? null : g.pageCount
  return {
    id: g.id,                 // 'eh:<url>'
    online: true,
    url: g.url,
    type: 'online',
    filepath: g.url,
    title: g.title || '',
    title_jpn: '',
    title_cn: '',
    category: g.category || '',
    coverPath: ehImageSrc(g.cover || ''),
    pageCount: pages,
    filecount: pages,
    rating: g.rating || 0,
    tags: g.tags || {},
    status: 'tagged',
    posted: null,
    mark: false,
    readCount: 0,
    // 账号收藏状态(null / 0-9):卡片上的收藏星与右键「收藏」用它
    favcat: (g.favcat === undefined ? null : g.favcat),
    // 种子数量:undefined = 还没查过(卡片右下角的藤蔓按钮据此显隐,查完写成品)
    torrentCount: undefined
  }
}

// EH 详情页的缩略图是**分页**的(每页 20 张,?p=1/2/3...)。
// 这里按页续拉,边拉边通过 onUpdate 回传,直到页数够或某页没有新图。
//   fetchHtml(url) -> Promise<html>   由调用方注入(渲染进程用 get-ex-webpage)
export const collectGalleryThumbs = async ({
  url, host = EH_HOST, pageCount = 0, first = [], fetchHtml,
  onUpdate = null, shouldStop = null, maxPages = 40, perPage = 20
} = {}) => {
  const out = Array.isArray(first) ? first.slice() : []
  const seen = new Set(out.map(t => t && t.href).filter(Boolean))
  const total = Math.max(Number(pageCount) || 0, out.length)
  const pages = Math.min(Math.ceil(total / Math.max(1, perPage)), maxPages)
  for (let p = 1; p < pages; p++) {
    if (shouldStop && shouldStop()) break
    const pageUrl = String(url).replace(/#.*$/, '') + (String(url).includes('?') ? '&' : '?') + 'p=' + p
    let html = ''
    try { html = await fetchHtml(pageUrl) } catch (e) { break }
    if (!html) break
    let doc
    try { doc = new DOMParser().parseFromString(html, 'text/html') } catch (e) { break }
    const more = parseGalleryThumbs(doc, host)
    let added = 0
    for (const th of more) {
      if (!th || !th.href || seen.has(th.href)) continue
      seen.add(th.href)
      out.push(th)
      added++
    }
    if (!added) break
    if (onUpdate) onUpdate(out.slice())
  }
  return out
}

// 把详情页解析结果合并进卡片对象(详情界面要用:日文标题 / 上传者 / 时间 / 大小 / 页预览)
export const mergeDetailIntoBook = (book, detail) => {
  if (!book || !detail) return book
  const pages = (detail.pageCount == null) ? book.pageCount : detail.pageCount
  return {
    ...book,
    title_jpn: detail.titleJpn || book.title_jpn || '',
    category: detail.category || book.category,
    coverPath: ehImageSrc(detail.cover || '') || book.coverPath,
    pageCount: pages,
    filecount: pages,
    rating: detail.rating || book.rating,
    tags: (detail.tags && Object.keys(detail.tags).length) ? detail.tags : book.tags,
    uploader: detail.uploader || '',
    posted: detail.posted || '',
    size: detail.size || '',
    language: detail.language || '',
    thumbnails: detail.thumbnails || [],
    // H@H 归档页(详情页底部 Archive Download 的链接)
    archivePageUrl: detail.archivePageUrl || book.archivePageUrl || ''
  }
}

// ---------- 在线图片统一走应用自己的代理 ----------
// 实测:EH 的原图主机(*.hath.network)浏览器直连基本不可达(DNS/端口被挡),
// 所以在线读图与页预览不能直接把原地址丢给 <img>,一律改写成应用自己的取图地址:
//   网页版 → /api/ex-image(服务端带 Cookie 与代理取回再转发)
//   桌面版 → emm-eh:// 自定义协议(主进程同样带 Cookie 与代理)
// opts.tracker:可选的「进度标识」(通常是这一页的 id)。带上它,主进程就能在读取图片时
//   按这个 id 回推下载进度,占位上的环形进度条就显示真实百分比(照 JHenTai 的 loadingProgress)。
// opts.referer:这一页的**图片页 URL**(/s/<hash>/<gid>-<n>)。
//   ⚠ 很重要:EH 的 H@H 节点会校验收图来源。以前统一用站点根当 referer,实测更容易被拒;
//   浏览器读图时 referer 天然就是图片页本身。现在把它透传给主进程。
export const ehImageSrc = (url, tracker, referer) => {
  const u = String(url || '')
  if (!u || !/^https?:\/\//i.test(u)) return u
  const tr = tracker ? '&t=' + encodeURIComponent(String(tracker)) : ''
  const rf = referer ? '&r=' + encodeURIComponent(String(referer)) : ''
  if (typeof window !== 'undefined' && window.__WEB_MODE__) {
    return '/api/ex-image?url=' + encodeURIComponent(u) + tr + rf
  }
  return 'emm-eh://img/?u=' + encodeURIComponent(u) + tr + rf
}
