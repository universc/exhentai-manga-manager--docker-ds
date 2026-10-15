// EH 账号密码登录(纯 Node,不需要 Electron —— 所以网页版/Docker 也能用)。
//
// 口径来自 JHenTai-8.0.16-334 lib/src/network/eh_request.dart 的 requestLogin:
//   POST https://forums.e-hentai.org/index.php?act=Login&CODE=01
//   Content-Type: application/x-www-form-urlencoded
//   referer=https://forums.e-hentai.org/index.php?&b=&bt=&UserName=<账号>&PassWord=<密码>&CookieDate=365
//   成功 = 响应里带 ipb_member_id + ipb_pass_hash 两个 Set-Cookie;
//   失败 = 页面里有验证码提示(The captcha was not entered correctly),否则视为账号密码不对。
// 拿到 ipb_* 之后再访问一次站点补 igneous / star(JHenTai 是访问 home.php「先拿 cookie」)。
//
// ⚠️ 用 Node 原生 http/https 而不是 fetch:Set-Cookie 必须是**数组**才能可靠解析,
//    而 fetch 会把多个 Set-Cookie 用逗号拼成一坨(Expires 里本身就有逗号),拆不开。

const http = require('http')
const https = require('https')
const { URL } = require('url')
const { HttpsProxyAgent } = require('https-proxy-agent')

// 写进设置的四项(其余如 session_id / __utmp 不入库)
const EH_COOKIE_NAMES = ['igneous', 'ipb_pass_hash', 'ipb_member_id', 'star']
// 默认站点(测试时可用 bases 指到本地假服务)
const EH_BASES = {
  forum: 'https://forums.e-hentai.org',
  ehome: 'https://e-hentai.org',
  ex: 'https://exhentai.org',
  // 收藏 / 种子 / 收藏弹窗(JHenTai eh_consts.dart:EFavorite / ETorrent / EPopup)
  favorite: '/favorites.php',
  torrent: '/gallerytorrents.php',
  popup: '/gallerypopups.php'
}
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const DEFAULT_TIMEOUT = 15000

const cookieHeaderOf = (cookies) => Object.entries(cookies || {})
  .filter(([, v]) => v)
  .map(([k, v]) => `${k}=${v}`)
  .join('; ')

// 发一个请求,回 { status, headers, setCookies, body, buffer }(raw: true 时 body 为空,只给 buffer)
const request = (url, options = {}) => new Promise((resolve, reject) => {
  let u
  try {
    u = new URL(url)
  } catch (e) {
    return reject(new Error('badUrl'))
  }
  const lib = u.protocol === 'https:' ? https : http
  const body = options.form ? new URLSearchParams(options.form).toString() : null
  const headers = {
    'User-Agent': BROWSER_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: options.referer || url
  }
  if (options.cookie) headers.Cookie = options.cookie
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    headers['Content-Length'] = Buffer.byteLength(body)
  }
  const reqOptions = { method: options.method || 'GET', headers, timeout: options.timeout || DEFAULT_TIMEOUT }
  // 代理:https-proxy-agent 对 http/https 目标都可用
  if (options.proxy) reqOptions.agent = new HttpsProxyAgent(options.proxy)
  const req = lib.request(u, reqOptions, (res) => {
    const chunks = []
    res.on('data', (c) => chunks.push(c))
    res.on('end', () => {
      const buffer = Buffer.concat(chunks)
      resolve({
        status: res.statusCode,
        headers: res.headers,
        setCookies: Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [],
        // raw:图片等二进制别当字符串解(会把字节毁掉)
        body: options.raw ? '' : buffer.toString('utf-8'),
        buffer
      })
    })
  })
  req.on('timeout', () => req.destroy(new Error('timeout')))
  req.on('error', (e) => reject(e))
  if (body) req.write(body)
  req.end()
})

// 从 Set-Cookie 数组里挑出关心的几项(同名后者覆盖前者;空值与 igneous=mystery 视为没有)
const pickCookies = (setCookies, names = EH_COOKIE_NAMES) => {
  const out = {}
  for (const line of setCookies || []) {
    const m = /^\s*([^=;\s]+)\s*=\s*([^;]*)/.exec(String(line))
    if (!m) continue
    const name = m[1]
    if (!names.includes(name)) continue
    const value = (m[2] || '').trim()
    if (!value || value === 'deleted' || value === 'mystery') continue
    out[name] = value
  }
  return out
}

// 补 Cookie:访问 e-hentai.org/home.php 与 exhentai.org,收集它们下发的 igneous / star
const fetchExtraCookies = async (cookies, { proxy, bases = EH_BASES } = {}) => {
  const targets = [bases.ehome + '/home.php', bases.ex + '/']
  const results = await Promise.all(targets.map(async (url) => {
    try {
      const res = await request(url, { cookie: cookieHeaderOf(cookies), proxy, referer: url })
      return pickCookies(res.setCookies)
    } catch (e) {
      return {} // 单个站点失败不影响登录结果(例如没有 igneous 时 exhentai 不可达)
    }
  }))
  return Object.assign({}, ...results)
}

// 账号密码登录。返回:
//   { ok:true,  cookies:{igneous,ipb_pass_hash,ipb_member_id,star} }
//   { ok:false, error:'emptyInput'|'captcha'|'badCredentials'|'network'|'timeout', detail? }
const passwordLogin = async ({ username, password, proxy, bases = EH_BASES } = {}) => {
  if (!String(username || '').trim() || !String(password || '')) return { ok: false, error: 'emptyInput' }
  const loginUrl = bases.forum + '/index.php?act=Login&CODE=01'
  let res
  try {
    res = await request(loginUrl, {
      method: 'POST',
      referer: bases.forum + '/index.php?act=Login&CODE=00',
      form: {
        referer: bases.forum + '/index.php?',
        b: '',
        bt: '',
        UserName: username,
        PassWord: password,
        CookieDate: 365
      },
      proxy
    })
  } catch (e) {
    const msg = String((e && e.message) || e)
    // 统一在这里归一化网络类错误,调用方(IPC)只管回给前端一个 code
    return { ok: false, error: /timeout/i.test(msg) ? 'timeout' : 'network', detail: msg }
  }
  const cookies = pickCookies(res.setCookies)
  if (!cookies.ipb_member_id || !cookies.ipb_pass_hash) {
    const html = res.body || ''
    if (/The captcha was not entered correctly/i.test(html)) return { ok: false, error: 'captcha' }
    // 论坛开着 Cloudflare 的 JS 挑战:响应头 Cf-Mitigated: challenge,页面是 "Just a moment..."。
    // 实测(2026-10-14,本机 Clash 出口)就是这么被拦的 —— 这不是密码错,不能报成 badCredentials,
    // 否则用户会一直去改密码。403 也按「被拦」处理(EH 的密码错返回的是 200 + 错误页)。
    const cfChallenge = String(res.headers['cf-mitigated'] || '').toLowerCase() === 'challenge'
      || /just a moment|challenges\.cloudflare\.com/i.test(html)
      || res.status === 403
    if (cfChallenge) return { ok: false, error: 'cloudflare', detail: 'http ' + res.status }
    return { ok: false, error: 'badCredentials', detail: 'http ' + res.status }
  }
  const extra = await fetchExtraCookies(cookies, { proxy, bases })
  return { ok: true, cookies: Object.assign({ igneous: '', star: '' }, cookies, extra) }
}

// 论坛 showuser 页取用户名(JHenTai profilePage2UserInfo 的口径:.home > b > a)
const fetchUserName = async (memberId, cookies, { proxy, bases = EH_BASES } = {}) => {
  if (!memberId) return ''
  try {
    const res = await request(bases.forum + '/index.php?showuser=' + encodeURIComponent(memberId), {
      cookie: cookieHeaderOf(cookies),
      proxy
    })
    const m = /<div class="home">[\s\S]{0,600}?<b>\s*<a[^>]*>([^<]+)<\/a>/i.exec(res.body || '')
    return m ? m[1].trim() : ''
  } catch (e) {
    return ''
  }
}

// ---------- 在线阅读:把画廊各页的「真实图片地址」解析出来 ----------
// EH 的画廊页只有每页的链接(/s/<hash>/<gid>-<n>),真正的图片地址在那一页的 <img id="img" src>。
// 所以在线阅读要先把页链接收集齐,再逐页取图(限并发,失败的那页留空)。
const listGalleryPageLinks = async (galleryUrl, { proxy, cookie, limit = 40, maxPages = 8, batch = 4, onPage, stats } = {}) => {
  const links = []
  const seen = new Set()
  const pageUrl = (p) => (p === 0 ? galleryUrl : galleryUrl + (galleryUrl.includes('?') ? '&' : '?') + 'p=' + p)
  // stats 是可选的出参:把「请求失败了几次、最后一次为什么」带出去,
  // 好让上层区分「画廊真的没有页」和「被 EH 限速/网络不通」(两者现象都是 links 为空)
  const fetchPage = async (p) => {
    try {
      const res = await request(pageUrl(p), { proxy, cookie, timeout: 20000 })
      const body = res.body || ''
      if (res.status && res.status >= 400 && stats) { stats.failed = (stats.failed || 0) + 1; stats.lastError = 'http ' + res.status }
      const found = body.match(/href="(https:\/\/[^"]*\/s\/[0-9a-f]{10}\/\d+-\d+)"/g) || []
      if (stats) { stats.pages = (stats.pages || 0) + 1; stats.raw = (stats.raw || 0) + found.length }
      // 200 但一个页链接都没有:把这一份响应长什么样记下来(是限速页?登录页?空页?)
      if (!found.length && stats && !stats.lastEmpty) {
        stats.lastEmpty = 'http ' + res.status + ', ' + body.length + ' bytes, itg=' + /\.itg/.test(body)
          + ', title=' + (((/<title>([^<]*)<\/title>/i.exec(body) || [])[1] || '').trim().slice(0, 60))
          + ', head=' + body.replace(/\s+/g, ' ').slice(0, 150)
      }
      return found
    } catch (e) {
      if (stats) { stats.failed = (stats.failed || 0) + 1; stats.lastError = String((e && e.message) || e) }
      return []
    }
  }
  const addAll = (found) => {
    let added = 0
    for (const raw of found) {
      const href = raw.slice(6, -1)
      if (seen.has(href)) continue
      seen.add(href)
      links.push(href)
      added++
      if (links.length >= limit) break
    }
    return added
  }
  // ⚠️ 以前是一页一页串行翻缩略图页:1000+ 页的画廊要 30 次请求、实测 115 秒才开工。
  // 现在一次并发 4 页;某一批一张新链接都没加就说明到头了。
  let p = 0
  while (p < maxPages && links.length < limit) {
    const idx = []
    for (let i = 0; i < batch && p + i < maxPages; i++) idx.push(p + i)
    const results = await Promise.all(idx.map(fetchPage))
    let added = 0
    for (const found of results) added += addAll(found)
    if (typeof onPage === 'function') onPage(links.length)
    if (!added) break
    p += idx.length
  }
  return links
}

// 一页图片页 → { url: 正常图, originalUrl: 原图(没有则空), page: 这一页的地址 }
// 原图口径与 modules/ehDownload.js、JHenTai 的 _downloadUrlFor 一致:页面上「Download original」那句的链接
const resolvePageImageInfo = async (pageUrl, { proxy, cookie } = {}) => {
  const res = await request(pageUrl, { proxy, cookie, timeout: 20000, referer: pageUrl })
  const body = res.body || ''
  const m = /<img[^>]*id="img"[^>]*src="([^"]+)"/i.exec(body) || /<img[^>]*src="([^"]+)"[^>]*id="img"/i.exec(body)
  const om = /href="(https?:\/\/[^"]+)"[^>]*>[^<]*Download\s+original/i.exec(body)
  return { url: m ? m[1] : '', originalUrl: om ? om[1] : '', page: pageUrl }
}

const resolvePageImage = async (pageUrl, opts = {}) => {
  const info = await resolvePageImageInfo(pageUrl, opts)
  return info.url
}

// 返回 { ok, images, total, collected }
const galleryPageImages = async ({ url, proxy, cookie, limit = 40, concurrency = 4 } = {}) => {
  if (!url) return { ok: false, error: 'noUrl', images: [], items: [], total: 0 }
  const links = await listGalleryPageLinks(url, { proxy, cookie, limit, maxPages: 200 })
  if (!links.length) return { ok: false, error: 'noPages', images: [], items: [], total: 0 }
  const items = new Array(links.length).fill(null)
  let cursor = 0
  const worker = async () => {
    while (cursor < links.length) {
      const i = cursor++
      try {
        const info = await resolvePageImageInfo(links[i], { proxy, cookie })
        items[i] = info.url ? info : null
      } catch (e) {
        items[i] = null
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, links.length)) }, worker))
  const kept = items.filter(Boolean)
  // images 给阅读器(只有地址);items 给下载用(带原图与图片页地址)
  return { ok: true, images: kept.map(it => it.url), items: kept, total: links.length, collected: links.length }
}

// ---------- EH 账号收藏(照 JHenTai requestAddFavorite / requestRemoveFavorite)----------
// POST /gallerypopups.php?gid=&t=&act=addfav;表单 favcat/favnote/apply/update。
// 分类是 0-9;取消收藏 = favcat 传 'favdel'。
const ehSiteBase = (bases, site) => {
  const b = bases || EH_BASES
  return String(site || '').includes('e-hentai') ? b.ehome : b.ex
}
const setFavorite = async ({ gid, token, favcat = 0, note = '', remove = false, site = '', proxy, cookie, bases = EH_BASES } = {}) => {
  if (!gid || !token) return { ok: false, error: 'noGid' }
  const url = `${ehSiteBase(bases, site)}${bases.popup || '/gallerypopups.php'}?gid=${gid}&t=${token}&act=addfav`
  const form = remove
    ? { favcat: 'favdel', favnote: '', apply: 'Apply Changes', update: 1 }
    : { favcat: String(favcat), favnote: note || '', apply: 'Add to Favorites', update: 1 }
  const res = await request(url, { method: 'POST', form, proxy, cookie, referer: url, timeout: 20000 })
  const body = res.body || ''
  if (/sadpanda|sad panda/i.test(body)) return { ok: false, error: 'notLoggedIn' }
  return { ok: res.status >= 200 && res.status < 400, status: res.status }
}

// 收藏夹分类名与数量(照 JHenTai favoritePage2FavoriteTagsAndCounts,对着真实页面改的):
// 每个分类是一个 <div class="fp" onclick="...favcat=N">,里面有 count(第一个 div,加粗数字)、
// .i(title="Favorites N")、name(最后一个 div)。名字优先取 .i 的 title,取不到再退回最后一个 div 的文本。
const favoriteCategories = async ({ site = '', proxy, cookie, bases = EH_BASES } = {}) => {
  const url = ehSiteBase(bases, site) + (bases.favorite || '/favorites.php')
  const res = await request(url, { proxy, cookie, referer: url, timeout: 20000 })
  const body = String(res.body || '')
  const out = []
  const chunks = body.split(/<div class="fp"/i).slice(1)
  for (const chunk of chunks) {
    const idxM = /favcat=(\d+)/i.exec(chunk)
    const titleM = /title="([^"]*)"/i.exec(chunk)
    const countM = /<div[^>]*>\s*(\d+)\s*<\/div>/i.exec(chunk)
    if (!idxM && !titleM) continue
    const index = idxM ? Number(idxM[1]) : out.length
    let name = titleM ? titleM[1].trim() : ''
    if (!name) {
      const divs = chunk.match(/<div[^>]*>([^<]*)<\/div>/gi) || []
      const last = divs.length ? divs[divs.length - 1].replace(/<[^>]*>/g, '').trim() : ''
      name = last || ('Favorite ' + index)
    }
    out.push({ index, name, count: countM ? Number(countM[1]) : -1 })
  }
  out.sort((a, b) => a.index - b.index)
  return out
}

// ---------- 种子列表(照 JHenTai torrentPage2GalleryTorrent)----------
// GET /gallerytorrents.php?gid=&t=;每条种子在一个 <form> 里,取名称/大小/做种/下载/发布者/是否过期
const galleryTorrents = async ({ gid, token, site = '', proxy, cookie, bases = EH_BASES } = {}) => {
  if (!gid || !token) return { ok: false, error: 'noGid', torrents: [] }
  const url = `${ehSiteBase(bases, site)}${bases.torrent || '/gallerytorrents.php'}?gid=${gid}&t=${token}`
  const res = await request(url, { proxy, cookie, referer: url, timeout: 20000 })
  const body = String(res.body || '')
  const torrents = []
  const forms = body.split(/<form/i).slice(1)
  for (const block of forms) {
    const link = /<a[^>]+href="(https?:\/\/[^"]+\.torrent)"[^>]*>([^<]*)<\/a>/i.exec(block)
    if (!link) continue
    const flat = block.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
    const pick = (re) => { const m = re.exec(flat); return m ? m[1].trim() : '' }
    const num = (s) => { const m = /(\d+)/.exec(s || ''); return m ? Number(m[1]) : 0 }
    const hash = /([0-9a-f]{40})/i.exec(link[1])
    // 发布时间:真实页面里是 <span style="color:red">2026-10-10 23:38</span> 这类时间戳,
    // 取第一个像日期的 span(别取最后一个 —— 末尾还有 tracker announce 那种 span)
    const spans = [...block.matchAll(/<span[^>]*>([^<]*)<\/span>/gi)].map(m => m[1].trim()).filter(Boolean)
    const postTime = spans.find(s => /^\d{4}-\d{2}-\d{2}/.test(s)) || spans.find(s => /ago$/i.test(s)) || ''
    torrents.push({
      name: String(link[2] || '').trim() || 'torrent',
      url: link[1],
      magnet: hash ? 'magnet:?xt=urn:btih:' + hash[1] : '',
      // 大小带单位(真实页面是「Size:</span> 27.15 MiB」,只取第一个词会丢掉单位)
      size: pick(/Size:\s*([\d.]+\s*[KMGT]?i?B)/i) || pick(/Size:\s*([^ ]+)/i),
      seeds: num(pick(/Seeds:\s*(\d+)/i)),
      peers: num(pick(/Peers:\s*(\d+)/i)),
      downloads: num(pick(/Downloads:\s*(\d+)/i)),
      uploader: pick(/Uploader:\s*([^ <]+)/i),
      postTime,
      // 过期种子:发布时间那格带 style="color:red"(JHenTai 同判法)
      outdated: /<span[^>]*style="[^"]*color:\s*red[^"]*"[^>]*>[^<]*<\/span>/i.test(block)
    })
  }
  return { ok: true, torrents }
}

module.exports = {
  EH_COOKIE_NAMES,
  EH_BASES,
  cookieHeaderOf,
  request,
  pickCookies,
  fetchExtraCookies,
  passwordLogin,
  fetchUserName,
  listGalleryPageLinks,
  resolvePageImage,
  resolvePageImageInfo,
  galleryPageImages,
  setFavorite,
  favoriteCategories,
  galleryTorrents
}
