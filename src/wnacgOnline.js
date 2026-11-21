// 紳士漫畫(wnacg)在线漫画库:站点版块、列表页/详情页解析。
//
// 口径来自站点自己的导航(2026-11 实测):
//   更新     /albums.html
//   同人志   /albums-index-cate-5.html   漢化1 / 日語12 / English16 / CG畫集2 / AI圖集37 / 3D漫畫22 / Cosplay3
//   單行本   /albums-index-cate-6.html   漢化9 / 日語13 / English17
//   雜誌&短篇 /albums-index-cate-7.html   漢化10 / 日語14 / English18
//   排行     /albums-favorite_ranking.html(收藏榜:今日/本週/本月/今年)
//   韓漫     站内只有标签页 /albums-index-tag-韓漫.html(排行页没有韩漫分类)
//
// 列表页 HTML 由主进程的 get-ex-webpage 通道取回(带代理),这里用 DOMParser 解析 ——
// 与 ehOnline.js 同一套做法。翻页**不拼 URL**:直接读页面里「後頁」的链接,
// 搜索页的分页带一次性令牌(c=a~0~…),自己拼必然 404。

export const WNACG_ONLINE_ID = 'wnacg-online'
export const WNACG_DEFAULT_HOST = 'www.wnacg.com'

// 版块树:与站点顶部导航一一对应(children 是下拉里的子分类)
export const WNACG_SECTIONS = [
  { id: 'update', label: '更新', kind: 'index' },
  {
    id: 'cate-5', label: '同人志', kind: 'cate', cate: 5,
    children: [
      { id: 'cate-1', label: '汉化', kind: 'cate', cate: 1 },
      { id: 'cate-12', label: '日语', kind: 'cate', cate: 12 },
      { id: 'cate-16', label: 'English', kind: 'cate', cate: 16 },
      { id: 'cate-2', label: 'CG画集', kind: 'cate', cate: 2 },
      { id: 'cate-37', label: 'AI图集', kind: 'cate', cate: 37 },
      { id: 'cate-22', label: '3D漫画', kind: 'cate', cate: 22 },
      { id: 'cate-3', label: 'Cosplay', kind: 'cate', cate: 3 }
    ]
  },
  {
    id: 'cate-6', label: '单行本', kind: 'cate', cate: 6,
    children: [
      { id: 'cate-9', label: '汉化', kind: 'cate', cate: 9 },
      { id: 'cate-13', label: '日语', kind: 'cate', cate: 13 },
      { id: 'cate-17', label: 'English', kind: 'cate', cate: 17 }
    ]
  },
  {
    id: 'cate-7', label: '杂志&短篇', kind: 'cate', cate: 7,
    children: [
      { id: 'cate-10', label: '汉化', kind: 'cate', cate: 10 },
      { id: 'cate-14', label: '日语', kind: 'cate', cate: 14 },
      { id: 'cate-18', label: 'English', kind: 'cate', cate: 18 }
    ]
  },
  // 韩漫(cate 19,子分类 合集20 / 漢化21 / 其他38):站点把它从公开导航里藏了起来,
  // 未登录时直接访问会返回 404「漫畫不存在」—— 结构按站点自己的分组照搬
  {
    id: 'cate-19', label: '韩漫', kind: 'cate', cate: 19,
    children: [
      { id: 'cate-20', label: '汉化', kind: 'cate', cate: 20 },
      { id: 'cate-21', label: '生肉', kind: 'cate', cate: 21 },
      { id: 'cate-38', label: '合集', kind: 'cate', cate: 38 }
    ]
  },
  // 我的书架 = 站点的收藏夹(/users-users_fav.html),放在最后一个栏目之后。
  // 必须登录(带 Cookie)才拿得到内容,未登录时站点会回登录表单 ——
  // parseWnacgShelf 会识别出来并让上层提示去登录。
  { id: 'shelf', label: '我的书架', kind: 'shelf' }
]

// 分类 id → 显示名(列表卡片右下角的类别;站点用 class="cate-N" 标注)
// 站点自己的卡片角标文案(2026-11 从 style.css 的 .pic_box.cate-N::before 逐条抄下来,转简体)。
// 卡片分类角标一律用这份 —— 和原网页右上角的角标一字不差
export const WNACG_CATE_BADGE = {
  1: '同人志／汉化',
  2: '同人志／CG画集',
  3: '写真 & Cosplay',
  5: '同人志',
  6: '单行本',
  7: '杂志&短篇',
  9: '单行本／汉化',
  10: '杂志&短篇／汉化',
  12: '同人志／日语',
  13: '单行本／日语',
  14: '杂志&短篇／日语',
  16: '同人志／English',
  17: '单行本／English',
  18: '杂志&短篇／English',
  19: '韩漫',
  20: '韩漫／汉化',
  21: '韩漫／生肉',
  22: '3D&漫画',
  23: '3D&漫画／汉化',
  24: '3D&漫画／其他',
  37: 'AI&图集',
  // 站点 CSS 里没有 38 的角标(韩漫合集页),按站点的命名习惯补齐
  38: '韩漫／合集'
}

export const WNACG_CATEGORY_NAMES = {
  0: '未分类',
  1: '同人志',
  2: '同人志',
  3: '写真&Cosplay',
  5: '同人志',
  6: '单行本',
  9: '单行本',
  10: '杂志&短篇',
  12: '同人志',
  13: '单行本',
  14: '杂志&短篇',
  16: '同人志',
  17: '单行本',
  18: '杂志&短篇',
  19: '韩漫',
  20: '韩漫',
  21: '韩漫',
  22: '3D&漫画',
  23: '3D&漫画',
  24: '3D&漫画',
  37: 'AI图集',
  38: '韩漫',
}

export const wnacgHost = (setting) => {
  const raw = String((setting || {}).wnacgHost || '').trim() || WNACG_DEFAULT_HOST
  return raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

const findSection = (id) => {
  for (const s of WNACG_SECTIONS) {
    if (s.id === id) return s
    const child = (s.children || []).find(c => c.id === id)
    if (child) return child
  }
  return null
}

// 版块第一页的地址(第 2 页起由页面里的「後頁」链接给出,见 parseWnacgList)
// EH 的高级搜索语法在绅士漫画上不成立。点标签时 EH 那边会送 `"标签"$`(精确匹配),
// 绅士漫画的搜索框只做普通关键词匹配 —— 原样丢过去 = 拿字面量去搜,永远 0 结果。
// 这里做一层「EH 语法 → 绅士漫画关键词」的归一化(用户手动粘贴也可能带这些符号):
//   · 去掉包裹的双引号(精确匹配)
//   · 去掉结尾的 $ 精确标记
//   · 去掉 f:/m:/a: 这类命名空间前缀(绅士漫画没有命名空间)
export const wnacgNormalizeQuery = (query) => {
  let q = String(query || '').trim()
  if (!q) return ''
  // 整串是 "xxx"$ / "xxx" 这种精确匹配:取引号里的内容
  const exact = /^"([\s\S]*)"\$?$/.exec(q)
  if (exact) q = exact[1]
  // 残留的引号 / $ 一并清掉(手动输入、或「精确匹配 + 附加词」混着写时常见)。
  // 注意 $ 要清**全部**而不是只清结尾:"\"big breasts\"$ extra" 这种混写,
  // $ 会落在中间,只清结尾就漏掉,搜索照样 0 结果。
  q = q.replace(/"/g, '').replace(/\$/g, ' ').replace(/\s+/g, ' ').trim()
  // 命名空间前缀 EH 才有(f: 女性 / m: 男性 / a: 作者 …),绅士漫画按纯关键词搜
  q = q.replace(/(^|\s)[a-z]:(?=\S)/gi, '$1').trim()
  return q
}

export const wnacgSectionUrl = (setting, sectionId, query = '', rankPeriod = 'week') => {
  const host = wnacgHost(setting)
  const base = 'https://' + host
  const kw = wnacgNormalizeQuery(query)
  if (kw) return base + '/search/?q=' + encodeURIComponent(kw) + '&f=_all&s=create_time_DESC&syn=yes'
  // 排行模式:rank-all / rank-cate-N → 站点收藏榜(period = day/week/month/year,默认 week)
  const rk = /^rank(?:-all|-cate-(\d+))?$/.exec(String(sectionId || ''))
  if (rk) {
    const period = ['day', 'week', 'month', 'year'].includes(String(rankPeriod)) ? rankPeriod : 'week'
    return base + '/albums-favorite_ranking-type-' + period + (rk[1] ? '-cate-' + rk[1] : '') + '.html'
  }
  // 我的书架:全部 / 按书架分类(shelf-c-<分类id>)
  if (sectionId === 'shelf') return base + '/users-users_fav.html'
  const sc = /^shelf-c-(\d+)$/.exec(String(sectionId || ''))
  if (sc) return base + '/users-users_fav-c-' + sc[1] + '.html'
  // 上传者的投稿列表(user-<uid>)
  const uu = /^user-(\d+)$/.exec(String(sectionId || ''))
  if (uu) return base + '/albums-user-uid-' + uu[1] + '.html'
  const section = findSection(sectionId) || WNACG_SECTIONS[0]
  if (section.kind === 'cate') return base + '/albums-index-cate-' + section.cate + '.html'
  return base + '/albums.html'
}

const absUrl = (href, host) => {
  const h = String(href || '').trim()
  if (!h) return ''
  if (/^https?:\/\//i.test(h)) return h
  if (h.startsWith('//')) return 'https:' + h.replace(/^\/+/, '//')
  return 'https://' + host + '/' + h.replace(/^\/+/, '')
}

const intOf = (text) => {
  const m = /(\d[\d,]*)/.exec(String(text || ''))
  return m ? Number(m[1].replace(/,/g, '')) : null
}

const CATEGORY_RE = /(?:^|\s)cate-(\d+)(?:\s|$)/

// 一行 → 一个相册。列表/排行/搜索三种页面的卡片结构相同,排行页多一个名次与收藏数。
const parseRow = (row, host) => {
  const linkEl = row.querySelector('.pic_box a[href*="photos-index-aid-"]')
    || row.querySelector('.title a[href*="photos-index-aid-"]')
    || row.querySelector('a[href*="photos-index-aid-"]')
  const href = linkEl ? (linkEl.getAttribute('href') || '') : ''
  const m = /photos-index-aid-(\d+)\.html/i.exec(href)
  if (!m) return null
  const aid = m[1]
  const img = row.querySelector('.pic_box img') || row.querySelector('img')
  const titleEl = row.querySelector('.title a')
  const infoText = (row.querySelector('.info_col')?.textContent || '').replace(/\s+/g, ' ')
  const picBox = row.querySelector('.pic_box')
  const cateMatch = CATEGORY_RE.exec(picBox ? (picBox.getAttribute('class') || '') : '')
  const cate = cateMatch ? Number(cateMatch[1]) : null
  // 排行页:名次徽标(👑/🥈/🥉/数字)与收藏数(❤️ N)
  const badgeText = picBox ? [...picBox.querySelectorAll(':scope > div')]
    .map(d => (d.textContent || '').trim())
    .filter(t => t && !/^❤/.test(t))
    .join(' ') : ''
  const rank = /👑/.test(badgeText) ? 1 : /🥈/.test(badgeText) ? 2 : /🥉/.test(badgeText) ? 3 : intOf(badgeText)
  const favMatch = /❤[^\d]*(\d[\d,]*)/.exec(picBox ? picBox.textContent || '' : '')
  const pageMatch = /(\d[\d,]*)\s*(?:張|张)圖片/.exec(infoText)
  const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(infoText)
  const title = (titleEl ? titleEl.textContent : (img ? img.getAttribute('alt') : '')) || ''
  // 站点角标原文(如「單行本／漢化」)。category 只取主分类用于筛选/搜索,
  // fullCategory 保留完整写法给卡片显示 —— 以前卡片直接显示 category,
  // 于是「单行本／汉化」被截成「单行本」(用户报的问题 6)。
  const badgeFull = (cate == null ? '' : String(WNACG_CATE_BADGE[cate] || '')).trim()
  return {
    id: 'wnacg:' + aid,
    aid,
    url: absUrl('/photos-index-aid-' + aid + '.html', host),
    title: title.trim(),
    cover: absUrl(img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '', host),
    pageCount: pageMatch ? Number(pageMatch[1].replace(/,/g, '')) : null,
    posted: dateMatch ? dateMatch[1] : '',
    categoryId: cate,
    category: badgeFull ? wnacgParentCategory(badgeFull) : '',
    fullCategory: badgeFull,
    rank,
    favCount: favMatch ? Number(favMatch[1].replace(/,/g, '')) : null
  }
}

// 解析列表页。返回 { items, nextUrl, totalText, error }
//   error: '' | 'empty' | 'noList'
export const parseWnacgList = (html, host = WNACG_DEFAULT_HOST) => {
  const out = { items: [], nextUrl: '', totalText: '', error: '' }
  if (!html || typeof html !== 'string') { out.error = 'empty'; return out }
  let doc
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch (e) {
    out.error = 'noList'
    return out
  }
  const rows = [...doc.querySelectorAll('li.gallary_item')]
  const seen = new Set()
  for (const row of rows) {
    const item = parseRow(row, host)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    out.items.push(item)
  }
  // 翻页:优先「後頁」链接;搜索页没有「後頁」,只有 1/2/3… 的数字链接 ——
  // 取「页码 = 当前页 + 1」那一条(它的地址里带一次性令牌,必须原样用)。
  const pager = doc.querySelector('.paginator')
  const thisPageEl = doc.querySelector('.paginator .thispage')
  const thisPage = Number((thisPageEl ? thisPageEl.textContent : '').trim()) || 1
  let nextHref = ''
  const nextSpan = doc.querySelector('.paginator span.next a[href]')
  if (nextSpan) {
    nextHref = nextSpan.getAttribute('href') || ''
  } else if (pager) {
    for (const a of pager.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || ''
      const m = /[?&]p=(\d+)/.exec(href)
      if (m && Number(m[1]) === thisPage + 1) { nextHref = href; break }
    }
  }
  if (nextHref) out.nextUrl = absUrl(nextHref, host)
  const result = doc.querySelector('#bodywrap .result, .bread ~ #bodywrap .result')
  out.totalText = result ? (result.textContent || '').trim().slice(0, 80) : ''
  if (!out.items.length) out.error = 'noList'
  return out
}

// ---------- 站点广告位 ----------
// 页面里的广告位长这样:
//   <div id="ad-<hash>" data-adxad-v3="<hash>" style="width:728px;height:90px"></div>
//   <script defer src="https://static.adxadserv.com/js/adbld.js"></script>
// 脚本靠 currentScript 上的 data-site-id(缺省取 location.hostname)识别站点、
// 再扫描 [data-adxad-v3] 把广告塞进那个 div。所以搬到我们界面里时:
//   · 只能有一个广告位(同一 spot 放多个会互相顶掉,实测全空)
//   · 必须给它 data-site-id=站点域名,否则按 localhost 去要广告,拿不到
export const extractWnacgAdSlot = (html) => {
  if (!html || typeof html !== 'string') return null
  const m = /<div[^>]*data-adxad-v3="([^"]+)"[^>]*>/i.exec(html)
  if (!m) return null
  const spot = m[1]
  const wm = /width:\s*(\d+)px/i.exec(m[0])
  const hm = /height:\s*(\d+)px/i.exec(m[0])
  const sm = /<script[^>]+src="(https?:\/\/[^"]*adxad[^"]*)"/i.exec(html)
  // 原站是两条广告:广告位上方还有一条静态图广告(.dlh > a > img)
  const bm = /<div class="dlh">[\s\S]{0,800}?<img[^>]+src="([^"]+)"/i.exec(html)
  return {
    spot,
    id: 'ad-' + spot,
    width: Number(wm && wm[1]) || 728,
    height: Number(hm && hm[1]) || 90,
    script: sm ? sm[1] : 'https://static.adxadserv.com/js/adbld.js',
    banner: bm ? bm[1] : ''
  }
}

// ---------- 排行模式(站点收藏榜旁边的「分類篩選」下拉,2026-11 实测) ----------
//   全部分類 = /albums-favorite_ranking-type-week.html
//   其余    = /albums-favorite_ranking-type-week-cate-<N>.html
// ⚠ 站点把韩漫那组(19/20/21)在排行榜里也藏了(实测 404),所以这里没有韩漫;
//   寫真&Cosplay(3)在原站菜单里没有子项,3D&漫畫 的子项是 23/24。
export const WNACG_RANK_SECTIONS = [
  { id: 'rank-all', label: '全部分类', kind: 'rank' },
  {
    id: 'rank-cate-5', label: '同人志', kind: 'rank',
    children: [
      { id: 'rank-cate-12', label: '日语', kind: 'rank' },
      { id: 'rank-cate-16', label: 'English', kind: 'rank' },
      { id: 'rank-cate-1', label: '汉化', kind: 'rank' },
      { id: 'rank-cate-2', label: 'CG画集', kind: 'rank' }
    ]
  },
  {
    id: 'rank-cate-6', label: '单行本', kind: 'rank',
    children: [
      { id: 'rank-cate-13', label: '日语', kind: 'rank' },
      { id: 'rank-cate-17', label: 'English', kind: 'rank' },
      { id: 'rank-cate-9', label: '汉化', kind: 'rank' }
    ]
  },
  {
    id: 'rank-cate-7', label: '杂志&短篇', kind: 'rank',
    children: [
      { id: 'rank-cate-14', label: '日语', kind: 'rank' },
      { id: 'rank-cate-18', label: 'English', kind: 'rank' },
      { id: 'rank-cate-10', label: '汉化', kind: 'rank' }
    ]
  },
  { id: 'rank-cate-3', label: '写真&Cosplay', kind: 'rank' },
  {
    id: 'rank-cate-19', label: '韩漫', kind: 'rank',
    children: [
      { id: 'rank-cate-20', label: '汉化', kind: 'rank' },
      { id: 'rank-cate-21', label: '生肉', kind: 'rank' },
      { id: 'rank-cate-38', label: '合集', kind: 'rank' }
    ]
  },
  {
    id: 'rank-cate-22', label: '3D&漫画', kind: 'rank',
    children: [
      { id: 'rank-cate-23', label: '汉化', kind: 'rank' },
      { id: 'rank-cate-24', label: '其他', kind: 'rank' }
    ]
  },
  { id: 'rank-cate-37', label: 'AI图集', kind: 'rank' }
]
// 角标只取「／」前面的主分类(用户要求:不显示 / 后面的字,如「杂志&短篇／汉化」→「杂志&短篇」)
export const wnacgParentCategory = (name) => {
  const s = String(name || '')
  const i = s.search(/[／/]/)
  return (i >= 0 ? s.slice(0, i) : s).trim()
}

// 站点把「合集」写在分类的**最后一段**:同人誌／漢化／合集。
// 只取第一段(wnacgParentCategory)会把这个信息丢掉,而用户要在
// 「同人志」右边单独看到一个「合集」标记 —— 所以单独判定一次。
export const wnacgIsSeriesCategory = (name) => /(^|[／/])\s*合集\s*$/.test(String(name || ''))

// 是不是排行版块(rank-all / rank-cate-N)
// 排行榜的周期(站点排行页顶部的 今日/本週/本月/今年)
export const WNACG_RANK_PERIODS = [
  { id: 'day', label: '今日' },
  { id: 'week', label: '本週' },
  { id: 'month', label: '本月' },
  { id: 'year', label: '今年' }
]

export const wnacgIsRankSection = (id) => /^rank(-|$)/.test(String(id || ''))

// 作品页地址 → 站内 aid(收藏/删除收藏都按这个 id 拼地址)
export const wnacgAidOf = (url) => {
  const m = /photos-index-aid-(\d+)\.html/i.exec(String(url || ''))
  return m ? m[1] : ''
}

// ---------- 评论页(/comment-index-aid-<aid>.html,阅读器「評論」按钮的地址) ----------
// 结构:#plList > .plItem —— 主楼(.plHead>.plName/.plTime、.plText、.plMeta>.plUp>i 赞数),
//       楼中楼 .plReplies>.plRe(.plReTo「回覆 @xxx」)。页头 .cmListTit 是「全部評論 (N)」。
// 服务端可以直接抓到完整列表(实测 200),拍平成 EH 评论卡的形状喂给侧边详情。
export const parseWnacgComments = (html) => {
  const out = []
  if (!html || typeof html !== 'string') return out
  let doc
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch (e) { return out }
  const pick = (item, replyOf, idx) => {
    const author = ((item.querySelector('.plName') || {}).textContent || '').trim()
    const time = ((item.querySelector('.plTime') || {}).textContent || '').trim()
    const text = ((item.querySelector('.plText') || {}).textContent || '').trim()
    const up = ((item.querySelector('.plUp i') || {}).textContent || '').trim()
    if (!author && !text) return null
    const prefix = replyOf ? ('回覆 @' + replyOf + '：') : ''
    return {
      id: (item.getAttribute('data-id') || 'c' + idx) + (replyOf ? '-r' : ''),
      author,
      time,
      score: up,
      content: prefix + text,
      contentRich: prefix + text
    }
  }
  let i = 0
  for (const item of doc.querySelectorAll('#plList .plItem')) {
    i += 1
    const main = pick(item, '', i)
    if (main) out.push(main)
    for (const re of item.querySelectorAll('.plReplies .plRe')) {
      i += 1
      const to = (((re.querySelector('.plReTo') || {}).textContent || '').replace(/^回覆\s*@/, '') || '').trim()
      const r = pick(re, to || '?', i)
      if (r) out.push(r)
    }
  }
  return out
}

// ---------- 下拉阅读的图片列表(/photos-item-aid-<aid>.html) ----------
// 阅读器页用 <script src="/photos-item-aid-<aid>.html"> 拉数据,内容是一段 JS:
//   mReader.initData({"page_url":["http://img5.qy0.ru/…/001.webp?verify=…",…],
//                     "page_size":[[4500,5998],…], …});
// ⚠ 数组带尾逗号,不是合法 JSON —— 按字面量抠。page_url 一次给全(带防盗链 token),
//   这就是「下拉阅读」的图片来源,本地阅读器与「下载(阅读)」都用它。
export const parseWnacgReader = (js) => {
  const out = { urls: [], sizes: [] }
  const src = String(js || '')
  const mu = /"page_url"\s*:\s*\[([\s\S]*?)\]/.exec(src)
  if (mu) {
    out.urls = (mu[1].match(/"((?:[^"\\]|\\.)*)"/g) || [])
      .map(s => s.slice(1, -1))
      .filter(u => /^https?:\/\//i.test(u))
  }
  const ms = /"page_size"\s*:\s*(\[[\s\S]*?\])\s*,\s*"chapter_type"/.exec(src)
  if (ms) {
    try { out.sizes = JSON.parse(ms[1].replace(/,\s*([\]}])/g, '$1')) } catch (e) { out.sizes = [] }
  }
  return out
}

// Cookie 失效时站点常回一个只有页头、没有正文的壳页(几千字节、没有 bodywrap/gallary_item)。
// 拿到这种页面就别解析了 —— 上层会匿名重取一次(列表/详情页游客也能看)。
export const wnacgHtmlLooksBroken = (html) => {
  const s = String(html || '')
  if (!s || s.length < 4000) return true
  return !/id="bodywrap"|gallary_item|photos-slide/.test(s)
}

// 作品被站点删除(或仅登录可见)时,匿名/带 Cookie 都回「您要訪問的漫畫不存在」壳页 ——
// 这种页面匿名重试也一样,直接告诉用户结果
export const wnacgIsDeletedPage = (html) => /您要訪問的漫畫不存在|您要访问的漫画不存在/.test(String(html || ''))

// ---------- 我的书架(站点收藏夹) ----------
// 页面:/users-users_fav.html,翻页 /users-users_fav-page-<n>-c-0.html
// 行结构与列表页不同(站点用 .asTB:左边封面、右边标题 + 收藏夹名 + 加入时间),
// 所以单独解析;万一站点改回卡片网格,回落到 parseWnacgList 也能用。
export const parseWnacgShelf = (html, host = WNACG_DEFAULT_HOST) => {
  const out = { items: [], nextUrl: '', error: '', needLogin: false }
  if (!html || typeof html !== 'string') { out.error = 'empty'; return out }
  let doc
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch (e) { out.error = 'noList'; return out }

  // 未登录:站点要么回登录弹窗(表单 action 指向 users-check_login),
  // 要么干脆给一张「您沒有權限,需要登錄!」的空壳页 —— 两种都要认出来
  const loginForm = doc.querySelector('#login_form')
  const bodyText = (doc.body ? doc.body.textContent : '') || ''
  if ((loginForm && /check_login/.test(loginForm.getAttribute('action') || '')) ||
      /您沒有權限|您没有权限/.test(bodyText)) {
    out.needLogin = true
    out.error = 'needLogin'
    return out
  }

  const seen = new Set()
  const pick = (row) => {
    const a = row.querySelector('a[href*="photos-index-aid-"]')
    const href = a ? (a.getAttribute('href') || '') : ''
    const m = /photos-index-aid-(\d+)\.html/i.exec(href)
    if (!m) return null
    const aid = m[1]
    const img = row.querySelector('img')
    const text = (row.textContent || '').replace(/\s+/g, ' ')
    const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(text)
    // 收藏夹名:除作品链接之外的第一个链接(站点写「默認收藏夾」这类名字)
    const other = [...row.querySelectorAll('a[href]')]
      .filter(x => !/photos-index-aid-/.test(x.getAttribute('href') || ''))
    const favName = other.length ? (other[0].textContent || '').trim() : ''
    const titleEl = row.querySelector('.l_title a') || a
    return {
      id: 'wnacg:' + aid,
      aid,
      url: absUrl('/photos-index-aid-' + aid + '.html', host),
      title: ((titleEl && titleEl.textContent) || (img && img.getAttribute('alt')) || '').trim(),
      cover: absUrl(img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '', host),
      pageCount: null,
      posted: dateMatch ? dateMatch[1] : '',
      categoryId: null,
      category: favName,
      rank: null,
      favCount: null,
      // 收藏记录的删除入口(操作列的 [刪除]):星标点一下就靠它移除
      favDel: (() => {
        const dm = /users-fav_del-id-(\d+)/.exec(row.innerHTML || '')
        return dm ? absUrl('/users-fav_del-id-' + dm[1] + '.html', host) : ''
      })(),
      // 书架里的条目:卡片上的收藏星标直接点亮
      inShelf: true
    }
  }

  for (const row of doc.querySelectorAll('.asTB')) {
    const item = pick(row)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    out.items.push(item)
  }
  // 结构变了(不再是 .asTB)→ 退回列表页那套解析
  if (!out.items.length) {
    const fb = parseWnacgList(html, host)
    for (const it of fb.items) {
      if (seen.has(it.id)) continue
      seen.add(it.id)
      out.items.push({ ...it, inShelf: true })
    }
    out.nextUrl = fb.nextUrl
  }

  // 翻页:优先「後頁」;没有就按「当前页 + 1」找数字页(地址里带 c-0,必须原样用)
  if (!out.nextUrl) {
    const nextEl = doc.querySelector('.paginator span.next a[href]')
    let nextHref = nextEl ? (nextEl.getAttribute('href') || '') : ''
    if (!nextHref) {
      const cur = doc.querySelector('.paginator .thispage')
      const thisPage = Number((cur ? cur.textContent : '').trim()) || 1
      for (const a of doc.querySelectorAll('.paginator a[href]')) {
        const href = a.getAttribute('href') || ''
        const mm = /users-users_fav-page-(\d+)-/.exec(href)
        if (mm && Number(mm[1]) === thisPage + 1) { nextHref = href; break }
      }
    }
    if (nextHref) out.nextUrl = absUrl(nextHref, host)
  }
  if (!out.items.length) out.error = 'noList'
  return out
}

// 书架分类(登录后书架页顶部那排):/users-users_fav.html(全部)+ /users-users_fav-c-<id>.html
export const extractWnacgFavClasses = (html) => {
  const out = []
  if (!html || typeof html !== 'string') return out
  let doc
  try { doc = new DOMParser().parseFromString(html, 'text/html') } catch (e) { return out }
  for (const a of doc.querySelectorAll('.fav_nav .nav_list a[href]')) {
    const name = (a.textContent || '').trim()
    const m = /users-users_fav-c-(\d+)\.html/i.exec(a.getAttribute('href') || '')
    if (name && m) out.push({ id: m[1], name })
  }
  return out
}

// 在书架页 HTML 里找某一本的「刪除」链接(fav_del-id 是收藏记录 id,不是作品 aid)。
// 移除收藏只认这个 id,所以取消收藏时要先来书架第一页按 aid 找一遍。
export const findWnacgFavDel = (html, aid, host = WNACG_DEFAULT_HOST) => {
  const chunks = String(html || '').split('class="asTB"')
  for (const c of chunks.slice(1)) {
    if (new RegExp('photos-index-aid-' + aid + '\.html').test(c)) {
      const dm = /users-fav_del-id-(\d+)/.exec(c)
      if (dm) return 'https://' + host + '/users-fav_del-id-' + dm[1] + '.html'
    }
  }
  return ''
}

// ---------- 「加入書架」弹窗页 ----------
// 站点入口:Mui.box.show('/users-addfav-id-<aid>.html')。登录后这里是一个 form
// (可能带「收藏夹分类」下拉),未登录则直接回登录表单。
// 这里把 form 的 action / method / 全部字段原样读出来,交给主进程去提交 —— 不猜接口。
export const parseWnacgFavDialog = (html, host = WNACG_DEFAULT_HOST) => {
  const out = { needLogin: false, form: null, removeUrl: '', already: false }
  if (!html || typeof html !== 'string') return out
  let doc
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch (e) { return out }

  const loginForm = doc.querySelector('#login_form')
  if (loginForm && /check_login/.test(loginForm.getAttribute('action') || '')) {
    out.needLogin = true
    return out
  }
  // 已在书架:站点直接回一句「你已經收藏過了」(没有表单、也没有移除链接)
  if (/你已經收藏過了|你已经收藏过了/.test(html)) {
    out.already = true
    return out
  }
  // 旧版式:弹窗里给「移除」入口
  const del = doc.querySelector('a[href*="delfav"], a[href*="del_fav"], a[href*="users-del"]')
  if (del) {
    out.removeUrl = absUrl(del.getAttribute('href'), host)
    out.already = true
  }

  const form = doc.querySelector('form')
  if (!form) return out
  const fields = {}
  for (const el of form.querySelectorAll('input[name], select[name], textarea[name]')) {
    const name = el.getAttribute('name')
    if (!name) continue
    const tag = String(el.tagName || '').toLowerCase()
    if (tag === 'select') {
      // 第一个 option 往往是「請選擇收藏分類」这种占位(value 为空),要选第一个真有值的
      const opts = [...el.querySelectorAll('option')].filter(o => (o.getAttribute('value') || '') !== '')
      const opt = opts[0] || el.querySelector('option[selected]') || el.querySelector('option')
      fields[name] = opt ? (opt.getAttribute('value') || '') : ''
    } else if (tag === 'textarea') {
      fields[name] = el.textContent || ''
    } else {
      const type = String(el.getAttribute('type') || 'text').toLowerCase()
      if (['submit', 'button', 'image', 'reset', 'file'].includes(type)) continue
      if ((type === 'checkbox' || type === 'radio') && !el.hasAttribute('checked')) continue
      fields[name] = el.getAttribute('value') || ''
    }
  }
  out.form = {
    action: absUrl(form.getAttribute('action') || '', host),
    method: String(form.getAttribute('method') || 'post').toUpperCase(),
    fields
  }
  return out
}

// 详情页解析(/photos-index-aid-<aid>.html)。
// 页面里同时给出「分類 / 頁數 / 編號」三个 label、标签、简介,以及全页缩略图 —— 详情界面直接用。
export const parseWnacgDetail = (html, host = WNACG_DEFAULT_HOST) => {
  const out = {
    ok: false, error: '', title: '', cover: '', category: '', pageCount: null,
    number: '', tags: {}, summary: '', uploader: '', posted: '', readUrl: '',
    uploaderUrl: '', readState: '',
    thumbnails: [], thumbsNextUrl: '',
    // 合集(多话作品):站点在详情页用 div.sr_compact 列出每一话,
    //   每话是一个 a.tagshow[data-chid],href 指向**那一话自己的阅读页**(aid 换成了该话的 chid)。
    //   这是站点自己的「合集」概念,和本地合集是两回事,所以要单独建模。
    series: { isSeries: false, chapters: [], chapterCount: 0, status: '' },
  }
  if (!html || typeof html !== 'string') { out.error = 'empty'; return out }
  let doc
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch (e) { out.error = 'noList'; return out }
  const h2 = doc.querySelector('#bodywrap.userwrap h2')
  if (!h2) { out.error = 'noDetail'; return out }
  out.ok = true
  out.title = (h2.textContent || '').trim()
  const coverImg = doc.querySelector('.asTB .uwthumb img')
  out.cover = coverImg ? absUrl(coverImg.getAttribute('src'), host).replace(/^https:\/\/\/+/, 'https://') : ''
  for (const label of doc.querySelectorAll('.uwconn label')) {
    const text = (label.textContent || '').replace(/\s+/g, ' ')
    const mm = /^(分類|頁數|編號)[:：]\s*(.*)$/.exec(text)
    if (!mm) continue
    if (mm[1] === '分類') out.category = mm[2].trim()
    else if (mm[1] === '頁數') out.pageCount = intOf(mm[2])
    else out.number = mm[2].trim()
  }
  // ---------- 合集(多话作品) ----------
  // 站点结构(实测 /photos-index-aid-405086.html):
  //   <label>分類：同人誌／漢化／合集</label><label>章節：5 話</label><label>狀態：完結</label>
  //   <div class="sr_compact">
  //     <a class="tagshow" data-chid="98944" href="/photos-slide-aid-98944-sid-405086.html"
  //        title="第1話《...》 26P 2020-05-12">第1話 ...</a>
  //   ...
  // ⚠ 只在「分類包含合集」或「有章節標籤」时才当合集:普通单本没有章节列表。
  let chapterTotal = 0
  let seriesStatus = ''
  for (const label of doc.querySelectorAll('.uwconn label')) {
    const text = (label.textContent || '').replace(/\s+/g, ' ')
    const cm = /^章節[:：]\s*(\d+)/.exec(text)
    if (cm) chapterTotal = Number(cm[1]) || 0
    const sm = /^狀態[:：]\s*(.+)$/.exec(text)
    if (sm) seriesStatus = sm[1].trim()
  }
  // ⚠ 章节链接是 /photos-slide-aid-<chid>-sid-<sid>.html(**阅读器页**,没有封面),
  //   而封面/详情在 /photos-index-aid-<chid>.html。两个地址都要留着:
  //     url      = 详情页(取封面、当「作品」打开)
  //     readUrl  = 阅读器页(点封面直接进阅读)
  const chapterEls = [...doc.querySelectorAll('.sr_compact a[data-chid]')]
  const chapters = chapterEls.map((a, i) => {
    const href = absUrl(a.getAttribute('href') || '', host)
    const title = (a.getAttribute('title') || '').replace(/\s+/g, ' ').trim()
    const label = (a.textContent || '').replace(/\s+/g, ' ').trim()
    // title 形如「第1話《真实标题》 26P 2020-05-12」:把书名、页数、日期拆出来
    const tm = /^(.*?)\s*《([\s\S]*?)》\s*(.*)$/.exec(title)
    const epLabel = tm ? tm[1].trim() : ''
    const realTitle = tm ? tm[2].trim() : label
    const tail = tm ? tm[3] : ''
    const pm = /(\d+)\s*P\b/i.exec(tail)
    const dm = /(\d{4}-\d{2}-\d{2})/.exec(tail)
    const chid = String(a.getAttribute('data-chid') || '')
    // 详情页地址:把 slide 换成 index(封面、标签、页数都在那边)
    const indexUrl = chid ? absUrl('/photos-index-aid-' + chid + '.html', host) : href
    return {
      index: i + 1,
      order: epLabel || ('第' + (i + 1) + '話'),
      chid,
      // url 给「作品详情/封面」用;readUrl 给「直接阅读」用
      url: indexUrl,
      readUrl: href,
      title: realTitle || label,
      label,
      pageCount: pm ? Number(pm[1]) : null,
      posted: dm ? dm[1] : '',
    }
  }).filter(c => c.url)
  const isSeries = chapters.length > 1 || /合集/.test(out.category) || chapterTotal > 0
  // readUrl 只在「真的换成了 index 地址」时才有意义,没换就退回 url
  for (const c of chapters) { if (!c.readUrl || c.readUrl === c.url) c.readUrl = c.url }
  out.series = {
    isSeries,
    chapters,
    chapterCount: chapterTotal || chapters.length,
    status: seriesStatus,
  }

  // 标签:.addtags 里每个 a.tagshow 就是一个标签(站内没有命名空间,统一归到 tag)
  const tags = [...doc.querySelectorAll('.addtags a.tagshow')].map(a => (a.textContent || '').trim()).filter(Boolean)
  if (tags.length) out.tags = { tag: [...new Set(tags)] }
  const summaryEl = [...doc.querySelectorAll('.uwconn > p')].pop()
  out.summary = summaryEl ? (summaryEl.textContent || '').trim().replace(/^簡介[:：]\s*/, '') : ''
  const userLink = doc.querySelector('.uwuinfo a[href*="albums-user-uid"]')
  const userEl = doc.querySelector('.uwuinfo a[href*="albums-user-uid"] p')
  out.uploader = userEl ? (userEl.textContent || '').trim() : ''
  // 上传者的投稿列表:点上传者 → 主界面直接进他投稿的作品页
  if (userLink) out.uploaderUrl = absUrl(userLink.getAttribute('href') || '', host)
  // 閱讀狀態:服务端阅读进度(登录后才有值,游客是隐藏的空 p)
  const rm = doc.querySelector('#rm-state')
  out.readState = rm ? (rm.textContent || '').trim() : ''
  // 閱讀狀態(2026-10-22,伺服器 read_mark):站点把进度以 var RM = {...} 注进详情页脚本 ——
  // 游客 null(不显示)、会员没读过 false(「未讀」)、读过是 {k:'single'|'series',p,t,done,idx}。
  // 这里按站点自己的文案规则还原(简体)。
  const rmM = /var RM = (\{[^{}]*\}|false|null)/.exec(html)
  if (rmM) {
    try {
      // 站点注入的字面量键名不带引号({k:'single',...}),不是合法 JSON —— 用宽松的键值解析
      let rm
      if (rmM[1] === 'false') rm = false
      else if (rmM[1] === 'null') rm = null
      else {
        rm = {}
        for (const pair of rmM[1].match(/[A-Za-z_]\w*\s*:\s*('[^']*'|[^,}]+)/g) || []) {
          const i = pair.indexOf(':')
          const key = pair.slice(0, i).trim()
          let val = pair.slice(i + 1).trim()
          if (val.startsWith("'")) val = val.slice(1, -1)
          else if (val === 'true') val = true
          else if (val === 'false') val = false
          else if (/^\d+(\.\d+)?$/.test(val)) val = Number(val)
          rm[key] = val
        }
      }
      if (rm === false) out.readState = '未读'
      else if (rm && rm.k === 'single') out.readState = rm.done ? '已读完' : ('看过 · 读到 ' + rm.p + ' / ' + rm.t + ' 页')
      else if (rm && rm.k === 'series') out.readState = '读到第 ' + rm.idx + ' 话' + (rm.p ? (rm.done ? ' · 本话已读完' : ' · 第 ' + rm.p + ' / ' + rm.t + ' 页') : '')
    } catch (e) { /* 结构变了就留空 */ }
  }
  const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec((doc.querySelector('.gallary_wrap.tb .info_col')?.textContent || ''))
  out.posted = dateMatch ? dateMatch[1] : ''
  const reader = doc.querySelector('#reader-btn[href]')
  out.readUrl = reader ? absUrl(reader.getAttribute('href'), host) : ''
  // 全页缩略图:详情页下方 .gallary_wrap.tb 里每页一个 li(封面页标 span.cover)。
  // ⚠ 这里一页只给 12 张,剩下的在 /photos-index-page-N-aid-<aid>.html 里,见 collectWnacgThumbs。
  const thumbs = []
  const seen = new Set()
  for (const a of doc.querySelectorAll('.gallary_wrap.tb li .pic_box.tb a[href]')) {
    const href = a.getAttribute('href') || ''
    if (!href || seen.has(href)) continue
    const img = a.querySelector('img')
    if (!img) continue
    seen.add(href)
    const li = a.closest('li')
    const name = (li?.querySelector('.info .name')?.textContent || '').trim()
    thumbs.push({
      href: absUrl(href, host),
      thumb: absUrl(img.getAttribute('src'), host),
      name,
      width: Number(img.getAttribute('width')) || null,
      height: Number(img.getAttribute('height')) || null,
      offsetX: 0
    })
  }
  out.thumbnails = thumbs
  const nextThumbs = doc.querySelector('.paginator span.next a[href]')
  if (nextThumbs) out.thumbsNextUrl = absUrl(nextThumbs.getAttribute('href'), host)
  return out
}

// 详情页缩略图是**分页**的(每页 12 张)。按「後頁」链接续拉,边拉边通过 onUpdate 回传。
//   fetchHtml(url) -> Promise<html> 由调用方注入(渲染进程用 get-ex-webpage)
export const collectWnacgThumbs = async ({
  first = [], nextUrl = '', pageCount = 0, host = '', fetchHtml,
  onUpdate = null, shouldStop = null, maxPages = 8,
  // onError(err, loadedCount):所有重试都失败时回调,让界面能提示 + 提供重试入口
  onError = null
} = {}) => {
  const out = Array.isArray(first) ? first.slice() : []
  const seen = new Set(out.map(t => t && t.href).filter(Boolean))
  const h = host || (String(nextUrl).replace(/^https?:\/\//i, '').split('/')[0]) || WNACG_DEFAULT_HOST
  let url = String(nextUrl || '')
  for (let i = 0; i < maxPages && url; i++) {
    if (shouldStop && shouldStop()) break
    if (pageCount && out.length >= pageCount) break
    // ★ 分页请求要重试:NAS/代理链路上偶发 ECONNRESET(站点会直接断 TLS),
    //   以前这里一失败就 break —— 缩略图永远停在第一页,界面一直转圈,
    //   而且不给任何提示(用户只看到「预览图出不来」)。
    //   现在:每页最多试 3 次(退避 300/700/1500ms),全失败才放弃并把原因带出去。
    let html = ''
    let lastErr = null
    const RETRY_DELAYS = [300, 700, 1500]
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      if (shouldStop && shouldStop()) break
      try {
        html = await fetchHtml(url)
        if (html) break
        lastErr = 'empty'
      } catch (e) {
        lastErr = e
      }
      if (attempt < RETRY_DELAYS.length) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]))
      }
    }
    if (!html) {
      // 记下失败原因交给调用方:界面可以提示「预览图加载失败,点击重试」
      if (typeof onError === 'function') onError(lastErr, out.length)
      break
    }
    let doc
    try { doc = new DOMParser().parseFromString(html, 'text/html') } catch (e) { break }
    let added = 0
    for (const a of doc.querySelectorAll('.gallary_wrap.tb li .pic_box.tb a[href]')) {
      const href = a.getAttribute('href') || ''
      const img = a.querySelector('img')
      if (!href || !img || seen.has(href)) continue
      seen.add(href)
      out.push({
        href: absUrl(href, h),
        thumb: absUrl(img.getAttribute('src'), h),
        name: (a.closest('li')?.querySelector('.info .name')?.textContent || '').trim(),
        width: Number(img.getAttribute('width')) || null,
        height: Number(img.getAttribute('height')) || null,
        offsetX: 0
      })
      added++
    }
    if (!added) break
    if (onUpdate) onUpdate(out.slice())
    const next = doc.querySelector('.paginator span.next a[href]')
    url = next ? absUrl(next.getAttribute('href'), h) : ''
  }
  return out
}

// 在线图片统一走应用自己的代理(与 EH 同一套:桌面 emm-eh:// / 网页 /api/ex-image)。
// 详情页的封面常写成 "////t4.qy0.ru/…"(多一道斜杠),这里先规整成 https://。
const normalizeImg = (url) => {
  let u = String(url || '').trim()
  if (u.startsWith('//')) u = 'https:' + u.replace(/^\/+/, '//')
  if (/^http:\/\//i.test(u)) u = u.replace(/^http:/i, 'https:')
  return u
}

export const wnacgImageSrc = (url, referer) => {
  const u = normalizeImg(url)
  if (!u || !/^https?:\/\//i.test(u)) return u
  // 图床实测不校验 Referer,带上作品页地址只是为了与浏览器行为一致
  const rf = '&r=' + encodeURIComponent(String(referer || 'https://' + WNACG_DEFAULT_HOST + '/'))
  if (typeof window !== 'undefined' && window.__WEB_MODE__) {
    return '/api/ex-image?url=' + encodeURIComponent(u) + rf
  }
  return 'emm-eh://img/?u=' + encodeURIComponent(u) + rf
}

// 是不是紳士漫畫的作品页。除了官方域名,也认镜像站(wnacg01.link 之类)——
// 作品页路径 /photos-index-aid-<id>.html 是站内唯一的,拿它兜底最稳。
export const isWnacgUrl = (url) => {
  const u = String(url || '')
  return /^https?:\/\/([^/]+\.)?wnacg[0-9a-z.-]*\//i.test(u) || /\/photos-index-aid-\d+\.html/i.test(u)
}

// 相册 → 书的形状(与 ehOnline.js 的 galleryToBook 同口径:显示层不另起一套)
export const wnacgToBook = (item) => {
  if (!item) return null
  const pages = (item.pageCount == null) ? null : item.pageCount
  return {
    id: item.id,
    online: true,
    url: item.url,
    type: 'online',
    filepath: item.url,
    title: item.title || '',
    title_jpn: '',
    title_cn: '',
    category: item.category || '',
    // 完整分类(「单行本/汉化」):卡片显示用;详情页会再合并一次站点原文
    fullCategory: item.fullCategory || item.category || '',
    coverPath: wnacgImageSrc(item.cover, item.url),
    pageCount: pages,
    filecount: pages,
    rating: 0,
    tags: {},
    status: 'tagged',
    // 标记来源站(卡片语言角标/评分隐藏等按这个判断)
    site: 'wnacg',
    // 语言:汉化→汉,日语→日,English→英,其余不显示(卡片按 site==='wnacg' 特判)
    wnacgLang: ({ 1: 'han', 9: 'han', 10: 'han', 20: 'han', 12: 'ja', 13: 'ja', 14: 'ja',
      16: 'en', 17: 'en', 18: 'en' })[item.categoryId] || '',
    posted: item.posted || '',
    mark: false,
    readCount: 0,
    // 排行榜卡片带「❤️ N」:带进书对象,详情界面「收藏」一格才有值
    favCount: (item.favCount != null) ? item.favCount : null,
    // 我的书架里的条目直接标成「已收藏」,卡片右上角的星标是亮的
    favcat: item.inShelf ? 0 : null,
    inShelf: !!item.inShelf,
    // 收藏记录的删除地址(移除时用)
    favDelUrl: item.favDel || '',
    // 站点没有种子/收藏夹概念:置 0 让「查种子」的队列直接跳过(undefined 会去问 EH 的 API)
    torrentCount: 0
  }
}

// 详情页解析结果合并进卡片对象(详情界面要用:分类 / 页数 / 标签 / 页预览)
// 从一话的详情页里只取封面(合集目录要显示每话预览图)。
// 合集页本身的 .sr_compact 只有文字,封面得挨个话去取 —— 实测单次 ~640ms,
// 所以调用方要并发 + 只对「确实是合集」的书触发。
export const parseWnacgChapterCover = (html, host = WNACG_DEFAULT_HOST) => {
  const s = String(html || '')
  if (!s) return ''
  // ⚠ 只认 .uwthumb 里的封面图。
  //   以前还留了一条「退而求其次:页面第一张 qy0 图」的兜底 —— **那条抓的是广告**:
  //   站点页首有一张联盟广告 <img alt="天下布魔" src="//t4.qy0.ru/...">,
  //   它排在任何正文图片之前,于是合集预览里显示的全是广告图(用户实测截图)。
  //   宁可返回空(前端显示灰底占位)也不要拿错图。
  const m = /class="[^"]*uwthumb[^"]*"[\s\S]{0,800}?<img[^>]+src="([^"]+)"/i.exec(s)
  if (!m) return ''
  return absUrl(m[1], host).replace(/^https:\/\/\/+/, 'https://')
}

export const mergeWnacgDetail = (book, detail) => {
  if (!book || !detail || !detail.ok) return book
  const pages = (detail.pageCount == null) ? book.pageCount : detail.pageCount
  return {
    ...book,
    category: wnacgParentCategory(detail.category || book.category),
    // 站点完整分类(同人誌／漢化／合集):卡片要在「同人志」右边单独标一个「合集」
    fullCategory: detail.category || book.fullCategory || '',
    // 是不是合集(多话作品):有章节列表 / 分类里带「合集」
    isSeries: !!(detail.series && detail.series.isSeries) || wnacgIsSeriesCategory(detail.category || book.fullCategory || ''),
    coverPath: wnacgImageSrc(detail.cover, book.url) || book.coverPath,
    pageCount: pages,
    filecount: pages,
    tags: (detail.tags && Object.keys(detail.tags).length) ? detail.tags : book.tags,
    uploader: detail.uploader || book.uploader || '',
    uploaderUrl: detail.uploaderUrl || book.uploaderUrl || '',
    // 站点详情页的「編號：wnacgXXXXXX」;以前没映射,详情界面这一格永远是「—」
    number: detail.number || book.number || '',
    favCount: (detail.favCount != null) ? detail.favCount : ((book.favCount != null) ? book.favCount : null),
    readState: detail.readState || book.readState || '',
    description: detail.summary || book.description || '',
    posted: detail.posted || book.posted || '',
    summary: detail.summary || '',
    readUrl: detail.readUrl || '',
    thumbnails: detail.thumbnails || [],
    thumbsNextUrl: detail.thumbsNextUrl || '',
    // 合集(多话作品):章节列表给详情界面渲染用;普通单本时 isSeries=false
    series: (detail.series && detail.series.isSeries) ? detail.series : (book.series || null),
  }
}
