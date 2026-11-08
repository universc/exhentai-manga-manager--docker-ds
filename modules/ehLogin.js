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

// ---------- 出网选路:完全照 JHenTai 的口径 ----------
// JHenTai 的做法(已对照 002/JHenTai-8.0.16-334 源码确认):
//   · 图片本体由 Flutter 的图片栈**直连** H@H 节点:不带 cookie、不带代理、不转码
//     (lib/src/widget/eh_image.dart:205-258,用的是 ExtendedNetworkImageProvider)
//   · 站点页(HTML / API)才走用户配置的代理(lib/src/network/eh_request.dart:89-96 全局代理)
// 本机实测也完全吻合(2026-11-06):
//   · H@H 图片节点 *.hath.network:直连 8/8 成功(334ms–2.7s),经代理 7/8 失败(ECONNRESET)
//   · 站点页 e-hentai.org:直连 15s 超时,经代理 443ms–4s 成功
// 所以这里不再做「健康度/heuristic 探测」,直接按目标域名硬分:
//   图片节点 → 直连;其余 → 用调用方给的 proxy(没配就直连)。
const EH_IMAGE_HOST_RE_JS = /^(?:[^/]+\.[^/]*\.hath\.network|.*\.hath\.network)(?::\d+)?$/i

const isEhImageHost = (urlOrHost) => {
  const raw = String(urlOrHost || '').trim()
  if (!raw) return false
  let host = raw
  try {
    if (/^https?:/i.test(raw)) host = new URL(raw).host
  } catch (e) { return false }
  host = host.toLowerCase().replace(/^www\./, '')
  // *.hath.network(可能带非标端口,如 :32038)
  const bare = host.replace(/:\d+$/, '')
  return bare.endsWith('.hath.network')
}

// 图片节点一律直连(JHenTai 同口径)。返回 true 表示「这个请求不该挂代理」。
const shouldBypassProxy = (url) => isEhImageHost(url)

// 代理 agent 缓存:同一个代理地址复用同一个 agent(keep-alive),避免每张图都重建 TLS。
const agentCache = new Map()
const agentFor = (proxy) => {
  const key = String(proxy || '')
  if (!key) return undefined
  let a = agentCache.get(key)
  if (!a) {
    a = new HttpsProxyAgent(key, { keepAlive: true, maxSockets: 8, maxFreeSockets: 4 })
    agentCache.set(key, a)
  }
  return a
}

// 值得重试的错误:EH 的图片/图片页在高并发下常见 TLS reset、连接被断、超时。
// 这类「网络层抖动」重试一次基本就能过;4xx(403/404)重试没有意义,不重试。
const isRetriableError = (e) => {
  const s = String((e && (e.code || e.message)) || '')
  return /ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|ESOCKETTIMEDOUT|socket hang up|aborted|timeout|EAI_AGAIN|ENOTFOUND|Client network socket disconnected/i.test(s)
}

// 重定向状态码。EH 的图片页 / H@H 节点 / archiver 都会 302,以前 request() 不跟随,
// 调用方拿到的是一句空 body 或 "http 302",表现就是「noImageUrl / 封面空白 / 归档 0 个」。
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])

// EH 家族域名:e-hentai / exhentai / ehgt / *.hath.network。
// 它们之间的跳转是「同一家的节点切换」—— Referer 是 H@H 节点校验的一部分,必须保留;
// 只有真正跳到第三方域时才把 Referer 丢掉。
const EH_FAMILY_RE = /^https?:\/\/([^/]+\.)?(hath\.network|ehgt\.org|e-hentai\.org|exhentai\.org)(:\d+)?\//i

// 跟随重定向时把「这一次要丢掉的响应体」处理干净:
//   · stream 模式:必须销毁上游流,否则这条没人读的 3xx 响应会一直占着 socket;
//   · 缓冲模式:body 在 requestOnce 里已经收完了(3xx 的 body 很小),不用再做什么。
const discardRedirectBody = (res) => {
  try {
    if (!res || !res.stream) return
    if (typeof res.stream.destroy === 'function') res.stream.destroy()
    else if (typeof res.stream.resume === 'function') res.stream.resume()
  } catch (e) { /* 忽略 */ }
}

// 发一个请求,回 { status, headers, setCookies, body, buffer }(raw: true 时 body 为空,只给 buffer)。
// retries:网络层错误自动重试次数(默认 2 次,配合短退避)。
// ⚠ 这里只负责「一发一收」;301/302/303/307/308 的跟随在下面 request() 里做。
const requestOnce = (url, options = {}) => new Promise((resolveOuter, rejectOuter) => {
  const maxRetries = Number.isFinite(options.retries) ? Number(options.retries) : 2
  let attempt = 0
  const runOnce = () => {
    sendOnce().then(resolveOuter, (e) => {
      // 网络层抖动 → 短退避重试(0.3s、0.9s);4xx 之类的业务错误直接抛出
      if (attempt < maxRetries && isRetriableError(e)) {
        attempt += 1
        setTimeout(runOnce, 300 * attempt)
        return
      }
      rejectOuter(e)
    })
  }
  const sendOnce = () => new Promise((resolve, reject) => {
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
  // 代理:https-proxy-agent 对 http/https 目标都可用。
  // ⚠ 这里**复用** agent(按代理地址缓存):以前每次请求都 new 一个 HttpsProxyAgent,
  //   等于每一张图都重新跟代理建立 TCP+TLS;EH 的图片页/图片主机在这种高频新建连接下
  //   很容易被 reset(实测报 ECONNRESET: Client network socket disconnected before secure
  //   TLS connection was established)。复用后 keep-alive 生效,连接数大幅下降。
  if (options.proxy) reqOptions.agent = agentFor(options.proxy)
  const req = lib.request(u, reqOptions, (res) => {
    // ★ 流式模式:把原始 IncomingMessage 直接交出去,调用方边收边转,
    //   这样图片可以「一段一段地出来」(照浏览器 <img> 的行为),而不是等整包收完。
    //   注意:这个模式下重试只能覆盖「连不上/首字节前」的错误,一旦已开始推流就不能重来。
    if (options.stream) {
      if (typeof options.onProgress === 'function') {
        try {
          const t = Number(res.headers['content-length']) || 0
          options.onProgress({ received: 0, total: t, ratio: t ? 0 : -1 })
        } catch (e) { /* 忽略 */ }
      }
      resolve({ status: res.statusCode, headers: res.headers, stream: res })
      return
    }
    const chunks = []
    // 下载进度(照 JHenTai 的 ImageChunkEvent):按「已收字节 / content-length」回报。
    // 没有 content-length 时报 -1,前端显示转圈而不是假百分比。
    const totalBytes = Number(res.headers['content-length']) || 0
    let received = 0
    // ⚠ 这里**不能**再加 !options.raw 的判断:图片请求恰恰是 raw: true,
    //   加了等于进度回调永远不触发(占位永远只有转圈,没有百分比)。
    if (typeof options.onProgress === 'function') {
      try { options.onProgress({ received: 0, total: totalBytes, ratio: totalBytes ? 0 : -1 }) } catch (e) { /* 忽略 */ }
    }
    res.on('data', (c) => {
      chunks.push(c)
      received += c.length
      if (typeof options.onProgress === 'function') {
        try { options.onProgress({ received, total: totalBytes, ratio: totalBytes ? Math.min(1, received / totalBytes) : -1 }) } catch (e) { /* 忽略 */ }
      }
    })
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
    // ★ 必须监听响应流的 error。少了它,连接被中途重置(ECONNRESET)时
    //   Node 会把 'aborted' 抛成 uncaughtException:
    //     Error: aborted
    //       at connResetException (node:internal/errors)
    //       at TLSSocket.socketCloseListener (node:_http_client)
    //   这条错误不经过 req.on('error'),所以只能在 res 上接。
    //   用户日志里刷屏的「后台出错…:aborted」就是这一处漏了。
    res.on('error', (e) => {
      // 清掉监听,避免 destroy 时再次触发
      try { res.destroy() } catch (e2) { /* 忽略 */ }
      reject(e)
    })
    // 上游半路断开(没 end 也没 error 就被销毁):给一个明确的错误而不是静默挂起
    res.on('close', () => {
      if (!res.complete) reject(new Error('aborted'))
    })
  })
  req.on('timeout', () => req.destroy(new Error('timeout')))
  req.on('error', (e) => reject(e))
  if (body) req.write(body)
  req.end()
  })
  runOnce()
})

// 跟随一次(或多跳)重定向后再把最终响应交给调用方。
// 规则(照浏览器语义):
//   · 最多 5 跳(options.maxRedirects 可覆盖),超了就返回最后一个 3xx —— 调用方至少知道是 3xx;
//   · POST + 301/302/303 → 转成 GET 并丢掉表单;307/308 保持原方法和表单;
//   · 跨域时丢掉 Cookie(凭据不发给第三方);Referer 只在「跳出 EH 家族」时丢掉
//     (EH 内部节点切换必须保留 Referer,否则 H@H 会回 403 —— 那就等于没修);
//   · ★Set-Cookie 跨跳累积:论坛登录成功是靠 302 那一跳下发 ipb_member_id / ipb_pass_hash 的,
//     只保留最后一跳的 setCookies 会让「账号密码登录」直接失效(判成 badCredentials)。
const requestWithRedirects = async (url, options, depth, carriedCookies) => {
  const maxRedirects = Number.isFinite(options.maxRedirects) ? Math.max(0, Number(options.maxRedirects)) : 5
  const carried = Array.isArray(carriedCookies) ? carriedCookies : []
  const res = await requestOnce(url, options)
  const status = res && res.status
  const collected = (res && Array.isArray(res.setCookies)) ? carried.concat(res.setCookies) : carried
  const location = res && res.headers && res.headers.location
  if (!REDIRECT_STATUS.has(status) || !location || depth >= maxRedirects) {
    // 最终响应把「这一路收到的 Set-Cookie」全部带上,登录/取 cookie 的逻辑照旧可用
    if (res && collected.length) res.setCookies = collected
    return res
  }
  let nextUrl
  try {
    nextUrl = new URL(location, url).toString()
  } catch (e) {
    // location 是坏值:当成最终响应交出去,让调用方按状态码判断,别在这里抛
    if (res && collected.length) res.setCookies = collected
    return res
  }
  discardRedirectBody(res)
  const nextOptions = { ...options }
  // 跟随时同样遵守「图片节点不挂代理」:H@H 节点之间切换保持直连
  if (nextOptions.proxy && shouldBypassProxy(nextUrl)) delete nextOptions.proxy
  const method = String(options.method || 'GET').toUpperCase()
  if ((status === 301 || status === 302 || status === 303) && method !== 'GET' && method !== 'HEAD') {
    nextOptions.method = 'GET'
    delete nextOptions.form
  }
  let sameOrigin = false
  try { sameOrigin = new URL(nextUrl).origin === new URL(url).origin } catch (e) { sameOrigin = false }
  if (!sameOrigin) {
    delete nextOptions.cookie
    const stayInFamily = EH_FAMILY_RE.test(nextUrl) && EH_FAMILY_RE.test(String(options.referer || url))
    if (!stayInFamily) delete nextOptions.referer
  }
  return requestWithRedirects(nextUrl, nextOptions, depth + 1, collected)
}

// ---------- 页面 HTML 缓存(照 JHenTai 的 eh_cache_manager)----------
// JHenTai 把「页面 HTML」按 (url, cookie) 缓存进 SQLite,默认 TTL 1 小时,
// 缓存键**忽略 nl 参数**(lib/src/network/eh_cache_manager.dart:38-61, 101-118;
//   TTL 在 lib/src/setting/network_setting.dart:14)。
// 收益:重进同一本书 / 翻回看过的页 / 换节点重试 —— 都是 0 请求。
// 这里用内存 LRU(重启后重新拉,不落盘:页面 HTML 体积大且时效性强,没必要长期存)。
const PAGE_CACHE_TTL_MS = 60 * 60 * 1000
const PAGE_CACHE_MAX_ENTRIES = 300
const pageCache = new Map()   // key -> { at, status, headers, body }

// 缓存键:必须忽略 keystamp / nl / fileindex 这类一次性参数,
// 否则「每次请求都是新 URL」,缓存永远不命中。
const pageCacheKey = (url, cookie) => {
  let clean = String(url || '')
    .replace(/([?&#])nl=[^&#]*/gi, '')
    .replace(/([?&;])keystamp=[^&;]*/gi, '')
    .replace(/([?&;])fileindex=[^&;]*/gi, '')
    .replace(/[?&]$/, '')
  // Cookie 决定登录态,必须参与 key(不同账号看到的页面不同)
  return clean + '\u0001' + String(cookie || '')
}

const pageCacheGet = (key) => {
  const hit = pageCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > PAGE_CACHE_TTL_MS) { pageCache.delete(key); return null }
  // LRU:命中后移到队尾
  pageCache.delete(key)
  pageCache.set(key, hit)
  return hit
}

const pageCachePut = (key, entry) => {
  if (!entry || !entry.body) return
  pageCache.delete(key)
  pageCache.set(key, Object.assign({ at: Date.now() }, entry))
  while (pageCache.size > PAGE_CACHE_MAX_ENTRIES) {
    const oldest = pageCache.keys().next().value
    pageCache.delete(oldest)
  }
}

const pageCacheClear = () => pageCache.clear()
const pageCacheStats = () => ({ entries: pageCache.size, ttlMs: PAGE_CACHE_TTL_MS })

// 对外的 request():自动跟随 301/302/303/307/308(最多 5 跳)。
// ★ 图片节点强制直连:即使调用方传了 proxy,只要目标是 *.hath.network 就不挂 agent。
//   JHenTai 就是这么做的(图片栈直连);本机实测代理对非标端口的隧道几乎全 ECONNRESET。
// ★ 站点页走页面缓存(opts.cache === false 可关闭;stream/raw 不缓存)。
const request = async (url, options = {}) => {
  const opts = options || {}
  const viaProxyOpts = (opts.proxy && shouldBypassProxy(url))
    ? Object.assign({}, opts, { proxy: '' })
    : opts

  const cacheable = opts.cache !== false &&
    !opts.stream && !opts.raw &&
    String(opts.method || 'GET').toUpperCase() === 'GET'
  if (!cacheable) return requestWithRedirects(url, viaProxyOpts, 0, [])

  const key = pageCacheKey(url, viaProxyOpts.cookie)
  const hit = pageCacheGet(key)
  if (hit) {
    return {
      status: hit.status,
      headers: hit.headers,
      body: hit.body,
      buffer: Buffer.from(hit.body, 'utf8'),
      setCookies: hit.setCookies || [],
      fromCache: true
    }
  }
  const res = await requestWithRedirects(url, viaProxyOpts, 0, [])
  if (res && res.status === 200 && res.body) {
    pageCachePut(key, {
      status: res.status,
      headers: res.headers,
      body: res.body,
      setCookies: res.setCookies || []
    })
  }
  return res
}

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
// ★ 2026-11 新增:先拿「详情页自带的 20 条内联页链接」立刻开画(见 fetchDetailInlineLinks),
//   全量 sweep 降级成后台补全 —— 实测 977 页的画廊,全量 sweep 要 56 次请求 / 7 秒,
//   而详情页一次请求里就已经有前 20 条,足够用户从第 1 页读起来。

// 从画廊详情页 HTML 里抽「已经内联的页链接」。
// EH 的详情页(/g/<gid>/<token>/)把前 20 页缩略图直接写成 <a href="https://e-hentai.org/s/<hash>/<gid>-<n>">,
// 所以「打开在线画廊」不必先等全量 sweep 跑完,一次请求就能拿到开画所需的头几页。
// 返回 { links, total, error }:total 是页面上标的真实页数(拿不到就是 0,调用方按 links.length 兜底)
const parseDetailPageLinks = (html) => {
  const body = String(html || '')
  const links = []
  const seen = new Set()
  const re = /href="(https:\/\/e-hentai\.org\/s\/[0-9a-f]{10}\/\d+-\d+)"/gi
  let m
  while ((m = re.exec(body))) {
    const href = m[1]
    if (seen.has(href)) continue
    seen.add(href)
    links.push(href)
  }
  // 页码顺序:EH 详情页缩略图按 p=1..N 排,但同一页里可能因版式重排;
  // 按 URL 里的页码尾数(…-<gid>-<n>)升序排一次,保证「第 1 条 = 第 1 页」
  const pageNo = (u) => {
    const mm = /-(\d+)$/.exec(String(u).replace(/\/\/?$/, ''))
    return mm ? Number(mm[1]) : 0
  }
  links.sort((a, b) => pageNo(a) - pageNo(b))
  // 真实总页数:详情页信息表里的 "Length: 977 pages"
  const pm = /Length:[\s\S]{0,200}?<td[^>]*>([\d,]+)\s+pages/i.exec(body)
    || /([\d,]+)\s+pages/i.exec(body)
  const total = pm ? Number(String(pm[1]).replace(/,/g, '')) : 0
  return { links, total: Number.isFinite(total) ? total : 0, error: links.length ? '' : 'noInline' }
}

// 取详情页并抽出内联页链接(1 次请求)。失败返回空 links,调用方退回全量 sweep。
const fetchDetailInlineLinks = async (galleryUrl, { proxy, cookie } = {}) => {
  if (!galleryUrl) return { links: [], total: 0, error: 'noUrl' }
  const res = await request(galleryUrl, { proxy, cookie, timeout: 20000 })
  const body = res && res.body ? res.body : ''
  if (!body) return { links: [], total: 0, error: 'empty' }
  const out = parseDetailPageLinks(body)
  out.status = res && res.status
  return out
}
// 按「页范围」抓一段页链接:给后台增量补全用(每次只推进 [from, to) 这一段,不重头再扫)。
// 与 listGalleryPageLinks 共用同一套正则与限速口径;并发宽同样夹在 1~12。
//
// ⚠ 两个必须处理的现实:
//   ① **同一段内会重复** —— EH 的 ?p=N 在 N 超过「这个画廊的缩略图分页数」时会回同一批内容
//      (小画廊更是每一页 ?p= 都返回同样的几条),所以段内必须按 href 去重。
//   ② **和已拿到的会重复** —— 调用方已经内联了前 20 条,这里必须把它们过滤掉,
//      否则补回来的「第 21 条」其实是第 1 条,前端按序号落位就会整本错位。
// 因此这里既做段内去重,也接收 known(已拥有的页链接)做过滤;返回的一定是**全新**的链接。
const fetchGalleryPageRange = async (galleryUrl, { from = 0, to = 0, proxy, cookie, batch = 8, known = null, stats } = {}) => {
  const pageUrl = (p) => (p === 0 ? galleryUrl : galleryUrl + (galleryUrl.includes('?') ? '&' : '?') + 'p=' + p)
  const found = []
  const seen = new Set(Array.isArray(known) ? known : [])
  const width = Math.max(1, Math.min(Number(batch) || 8, 12))
  const hi = Math.max(Number(to) || 0, Number(from) || 0)
  for (let base = Number(from) || 0; base < hi; base += width) {
    const idx = []
    for (let i = 0; i < width && base + i < hi; i++) idx.push(base + i)
    const results = await Promise.all(idx.map(async (p) => {
      try {
        const res = await request(pageUrl(p), { proxy, cookie, timeout: 20000 })
        if (res.status && res.status >= 400 && stats) { stats.failed = (stats.failed || 0) + 1 }
        const body = res.body || ''
        return body.match(/href="(https:\/\/e-hentai\.org\/s\/[0-9a-f]{10}\/\d+-\d+)"/g) || []
      } catch (e) {
        if (stats) stats.failed = (stats.failed || 0) + 1
        return []
      }
    }))
    let added = 0
    for (const arr of results) {
      for (const raw of arr) {
        const href = raw.slice(6, -1)
        if (seen.has(href)) continue
        seen.add(href)
        found.push(href)
        added++
      }
    }
    // 这一段一条全新的都没有 = 已经翻到画廊末尾(或 ?p= 越界回同一批),提前收工
    if (!added) break
  }
  return found
}
const listGalleryPageLinks = async (galleryUrl, { proxy, cookie, limit = 40, maxPages = 8, batch = 8, onPage, stats, shouldStop = null } = {}) => {
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
  // 现在一次并发翻 batch 页(默认 8,上限 12 —— 再多容易招 EH 的限速页);
  // 某一批一张新链接都没加就说明到头了。
  const sweep = async () => {
    let p = 0
    // 参数可覆盖,但要夹在 1~12:调用方传 999 会把 EH 直接打限速
    const width = Math.max(1, Math.min(Number(batch) || 8, 12))
    let failedBefore = (stats && stats.failed) || 0
    while (p < maxPages && links.length < limit) {
      // 后台补全:切书/关阅读器时 shouldStop() 变 true,立刻退出,不再空转请求
      if (typeof shouldStop === 'function' && shouldStop()) break
      const idx = []
      for (let i = 0; i < width && p + i < maxPages; i++) idx.push(p + i)
      const results = await Promise.all(idx.map(fetchPage))
      let added = 0
      for (const found of results) added += addAll(found)
      if (typeof onPage === 'function') onPage(links.length)
      if (!added) break
      p += idx.length
    }
    return failedBefore
  }
  await sweep()
  // 这一轮有请求失败(超时/限速):整批再扫一次,把丢掉的页补回来。
  // 以前失败就静默少收十几条,续传时 total 比实际页数小,封面显示成 235/218 这种。
  if (stats && (stats.failed || 0) > 0 && links.length < limit) {
    const before = links.length
    await sweep()
    if (links.length > before && typeof onPage === 'function') onPage(links.length)
  }
  return links
}

// 一页图片页 → { url: 正常图, originalUrl: 原图(没有则空), page: 这一页的地址 }
// 原图口径与 modules/ehDownload.js、JHenTai 的 _downloadUrlFor 一致:页面上「Download original」那句的链接
const resolvePageImageInfo = async (pageUrl, opts = {}) => {
  const { proxy, cookie } = opts
  // nl=<key>:EH 每次打开图片页都会下发一个新的 nl 值(页面里 return nl('...'))。
  // 带上它再请求一次 = 让 EH 重新挑一个 H@H 节点(JHenTai 的 _reParseImageUrlAndDownload 同理)。
  // 这正是用户看到的 ?nl=42598-498016:节点挂了/被限速时,换一个节点重试往往就好了。
  const reloadKey = String(opts.reloadKey || '')
  const u = reloadKey
    ? pageUrl + (pageUrl.includes('?') ? '&' : '?') + 'nl=' + encodeURIComponent(reloadKey)
    : pageUrl
  // timeout / retries 允许调用方覆盖:阅读器的解析链要「快速失败」,
  // 不能沿用默认的 20s×3 次(单页最坏 60.9s,4 轮就是 245 秒)。
  const timeout = Number.isFinite(opts.timeout) ? Number(opts.timeout) : 20000
  const retries = Number.isFinite(opts.retries) ? Number(opts.retries) : undefined
  const res = await request(u, { proxy, cookie, timeout, retries, referer: pageUrl })
  const body = res.body || ''
  const m = /<img[^>]*id="img"[^>]*src="([^"]+)"/i.exec(body) || /<img[^>]*src="([^"]+)"[^>]*id="img"/i.exec(body)
  const om = /href="(https?:\/\/[^"]+)"[^>]*>[^<]*Download\s+original/i.exec(body)
  const nlm = /return nl\('([^']+)'\)/i.exec(body)
  return { url: m ? m[1] : '', originalUrl: om ? om[1] : '', page: pageUrl, reloadKey: nlm ? nlm[1] : '' }
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
    // ⚠ 这里原本是 /\.torrent/ —— 少写一个 t,会把 URL 截成 ".torren"(少一个 t),
    //   于是「打开种子」下载到的是坏链接。用 \.torrent 完整匹配。
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
    // 名称里常带 HTML 实体(&amp; &quot; &#39; 等):不解码的话界面上显示成 "[FOE &amp; JINGG]"
    const decodeEntities = (s) => String(s || '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    torrents.push({
      name: decodeEntities(String(link[2] || '').trim()) || 'torrent',
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
  // 图片节点判定(所有调用方共用一个口径:图片直连,站点走代理)
  isEhImageHost,
  shouldBypassProxy,
  // 页面 HTML 缓存(照 JHenTai 的 eh_cache_manager,TTL 1h)
  pageCacheClear,
  pageCacheStats,
  // 代理 agent 缓存(index.js 的 get-ex-webpage 要复用它,别再每次 new HttpsProxyAgent)
  agentFor,
  pickCookies,
  fetchExtraCookies,
  passwordLogin,
  fetchUserName,
  parseDetailPageLinks,
  fetchDetailInlineLinks,
  fetchGalleryPageRange,
  listGalleryPageLinks,
  resolvePageImage,
  resolvePageImageInfo,
  galleryPageImages,
  setFavorite,
  favoriteCategories,
  galleryTorrents
}
