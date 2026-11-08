// 网页版 HTTP 服务
// - 提供 dist/ 构建后的前端页面
// - POST /api/ipc/:channel 把浏览器请求分派到 ipcMain 处理器
// - GET /api/events SSE 推送(消息/进度/阅读器图片)
// - GET /api/file 提供封面与阅读图片(限定在数据目录与漫画库内)
// - GET /api/list-dir 供网页版文件夹选择器使用
const express = require('express')
const path = require('path')
const fs = require('fs')
const sharp = require('sharp')
const TRANSCODE_MAX_BYTES = 24 * 1024 * 1024
// ★ 2026-11:WebP→progressive JPEG 默认**关闭**(与桌面版同一套设置项)。
//   实测每张多 62–94ms CPU、体积涨 95%(q90)/32%(q80);阅读器里收益不稳定,
//   默认直通原始 WebP 更快。设置里打开 ehWebpTranscode 才转。
const transcodeToProgressiveJpeg = async (buffer, quality) => {
  if (!buffer || buffer.length > TRANSCODE_MAX_BYTES) return null
  try {
    const q = Number.isFinite(Number(quality)) ? Math.round(Number(quality)) : 82
    const out = await sharp(buffer, { animated: false })
      .jpeg({ quality: Math.min(100, Math.max(50, q)), progressive: true, mozjpeg: false })
      .toBuffer()
    return (out && out.length) ? out : null
  } catch (e) {
    return null
  }
}
const os = require('os')
const { ipcMain, setBroadcast } = require('./web-electron-shim.js')
const { STORE_PATH } = require('./modules/init_folder_setting.js')
const auth = require('./modules/auth.js')
const iprules = require('./modules/iprules.js')
const ehLogin = require('./modules/ehLogin.js')
// 出网分流(图片直连 / 站点走代理)由 modules/ehLogin.js 的 request() 统一负责
// 在线图片磁盘缓存(与桌面版 index.js 共用同一份实现)
const { createCache: createEhImageCache } = require('./modules/ehImageCache.js')
auth.loadUsers(STORE_PATH)
iprules.loadRules(STORE_PATH)

const PORT = parseInt(process.env.WEB_PORT || '10000', 10)
const DIST_DIR = path.join(__dirname, 'dist')
const INDEX_HTML = path.join(DIST_DIR, 'index.html')

// index.js 通过 start({ getSetting, withAccount, settingForAccount }) 注入:
//   getSetting        —— 当前上下文下的设置(兼容保留)
//   withAccount       —— 把一次请求包进「该账户」的上下文(多账户并发互不干扰)
//   settingForAccount —— 取出某账户的设置对象(/api/file 的目录白名单用)
let getSetting = () => ({})
// 额外的放行目录(下载目录/移动目标):由 index.js 注入
let extraAllowedRoots = () => []
let withAccount = async (username, fn) => fn(username)
let settingForAccount = async () => getSetting()
// 会话 → 配置名:白名单 IP 的伪会话没有真实账户,沿用默认配置(setting.json)
const profileNameOf = (session) => {
  const name = session && session.username
  return (!name || name === 'whitelist') ? '' : name
}

const app = express()
// 登录接口单独压到 8kb:它在鉴权之前,全局放一个大 limit 等于给匿名用户开内存放大器。
// body-parser 解析过会置 req._body,后面的全局 parser 会自动跳过,不会重复解析。
app.use('/api/auth/login', express.json({ limit: '8kb' }))
app.use(express.json({ limit: '16mb' }))
app.disable('x-powered-by')

// ---------- IP 访问控制:黑名单全局拒绝 / 白名单免登录 ----------
const clientIp = (req) => String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '')
// 黑名单:命中即拒绝一切请求(页面/API/SSE/静态资源),视为"无法连接"
app.use((req, res, next) => {
  if (iprules.isBlacklisted(clientIp(req))) {
    return res.status(403).send('Forbidden: 您的 IP 已被列入黑名单,无法访问')
  }
  next()
})

// ---------- 账户系统(普通账户只读 / 管理员全部功能) ----------
const TOKEN_COOKIE = 'emm_token'
const parseCookies = (req) => {
  const result = {}
  const header = req.headers.cookie
  if (!header) return result
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx > 0) {
      // 畸形 cookie(如 emm_token=%)会让 decodeURIComponent 抛 URIError。
      // 它是同步抛在 async handler 里 → Express 4 不接 → 请求永久挂起。这里必须容错。
      try {
        result[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
      } catch {
        result[part.slice(0, idx).trim()] = part.slice(idx + 1).trim()
      }
    }
  }
  return result
}
const sessionOf = (req) => {
  if (!auth.isEnabled()) return null
  // 白名单 IP:免登录直接访问(视为管理员);黑名单已在全局中间件拒绝
  if (iprules.isWhitelisted(clientIp(req))) {
    return { username: 'whitelist', role: 'admin', whitelisted: true }
  }
  return auth.getSession(parseCookies(req)[TOKEN_COOKIE])
}
// 统一登录校验:启用账户系统后,/api/file(封面与阅读图片)、/api/list-dir(目录列表)、
// /browse(目录浏览页)等都不能匿名访问 —— 未登录一律 401。
// 说明:白名单 IP 在 sessionOf 里已被视为管理员,所以白名单用户不受影响;
//       未配置 WEB_ADMIN_USER 时账户系统未启用,auth.isEnabled() 为 false,行为与旧版一致。
const requireLogin = (req, res, next) => {
  if (auth.isEnabled() && !sessionOf(req)) {
    return res.status(401).send('Unauthorized: 请先登录后再访问')
  }
  next()
}

const setSessionCookie = (res, token) => {
  // 一年有效(登录后一直保持,直到用户主动退出登录)
  res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=31536000; SameSite=Lax`)
}
const clearSessionCookie = (res) => {
  res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=; HttpOnly; Path=/; Max-Age=0`)
}

// 登录失败限流。
// 双维度:
//   · 账户维度(u:)—— 阈值放宽到 20 次/60s,避免别人用 5 次错误密码就把真实用户永久锁死;
//   · 来源 IP 维度(i:)—— 阈值 30 次/5min,挡住换用户名撞库。
// 以前只按 username 计数且成功登录不清零,等于给了攻击者一个「定向锁死管理员」的开关。
const loginThrottle = new Map() // key -> { fails, lockUntil }
const userKey = (username) => 'u:' + String(username || '-')
const ipKey = (ip) => 'i:' + String(ip || '-')
const throttleWait = (key) => {
  const t = loginThrottle.get(key)
  if (!t) return 0
  if (t.lockUntil && Date.now() < t.lockUntil) return Math.ceil((t.lockUntil - Date.now()) / 1000)
  return 0
}
const throttleBump = (key, limit, lockMs) => {
  const t = loginThrottle.get(key) || { fails: 0, lockUntil: 0 }
  t.fails += 1
  if (t.fails >= limit) {
    t.lockUntil = Date.now() + lockMs
    t.fails = 0
  }
  loginThrottle.set(key, t)
}
const throttleFail = (username, ip) => {
  throttleBump(userKey(username), 20, 60 * 1000)
  throttleBump(ipKey(ip), 30, 5 * 60 * 1000)
}
const throttleClear = (username, ip) => {
  // 成功登录必须无条件清空,否则失败计数会一直累加到下一次手误就锁死
  loginThrottle.delete(userKey(username))
  loginThrottle.delete(ipKey(ip))
}

// 只读账户(viewer)允许的 IPC 通道:浏览/阅读/搜索类;写操作一律 403
const VIEWER_ALLOWED_CHANNELS = new Set([
  'load-setting', 'load-book-list', 'get-folder-tree', 'load-collection-list', 'load-manga-image-list', 'load-novel-content',
  'open-url', 'show-file', 'open-local-book', 'get-default-manga-reader',
  'get-locale', 'get-path-sep', 'copy-text-to-clipboard', 'copy-image-to-clipboard', 'image-file-info',
  'read-text-from-clipboard', 'update-window-title', 'switch-fullscreen',
  'set-viewer-active', 'set-progress-bar', 'extract-image-text',
  'ai-translate-text', 'ai-list-images',
  'list-title-translation-models', 'query-character-origins', 'test-title-translation',
  'request-thumbnails',
  // ---------- EH 在线阅读(只读) ----------
  // 这几个是网页版看 EH 在线画廊的必经通道;以前漏在白名单外,只读账户下:
  //   · 在线列表/详情/评论全空(get-ex-webpage 403 → DOMParser 拿到空文档)
  //   · 阅读器一直转圈(eh-gallery-page-links / eh-page-image 403 → 页链接和图片地址都拿不到)
  //   · 详情页预览条全空(book-preview-images 403)
  // 它们都只「读远端页面/读本地文件」,不写任何东西,所以对只读账户开放是安全的。
  'get-ex-webpage', 'eh-gallery-page-links', 'eh-gallery-page-links-fill', 'eh-page-image', 'eh-gallery-pages', 'book-preview-images',
  // 与 book-preview-images 同族:只读本地图片文件算出 GIF 首帧缓存,不泄露书名/不写任何东西。
  // 不加这条的话,网页版只读账户每次开详情/侧栏都会被 403 → 静默降级成动图(GIF 首帧能力对 viewer 失效)。
  'preview-thumbs',
  // 取「上一次 get-ex-webpage 失败的原因」,只读内存里的一个对象
  'eh-webpage-last-error',
  // ---------- EH 下载 ----------
  // ⚠ 下载是会**写文件**的操作(往下载目录写图片、写 downloads.json),
  //   按「读放行 / 写限管理员」的既有语义本不该放给只读账户;
  //   但用户明确要求「只读账户也要能下载」,所以这里显式放开,并且只放开 eh-download-* 这一组,
  //   其它写操作(删除书、改设置、移动文件……)仍然只在 ADMIN_ONLY_CHANNELS / 不在本表里。
  // ★这里放开通道不等于放开目录:只读账户的「写哪儿 / 读哪儿」由 index.js 收口在
  //   setting.downloadPath 之内 —— eh-download-gallery 忽略 saveDir、eh-download-files 越界回空、
  //   eh-download-action 的 resume/restart 要求记录落在下载目录内(restart 会 rmSync,最危险)。
  //   判定依据是下面分发时塞进 event 的 _emmRole,所以**不要**再在这里做路径特判,保持单一出口。
  'eh-download-gallery', 'eh-download-page', 'eh-download-records', 'eh-download-files',
  'eh-download-action', 'eh-download-clear', 'eh-download-set-tags', 'eh-download-page-by-index',
])

// 账户/写操作类敏感通道:即使将来有人不小心把它们加进 viewer 白名单,也必须管理员才行。
// 背景:index.js 的 requireAdmin() 在 WEB_MODE 直接 return null(它假设 web-server 会拦),
// 所以服务端实际上只有这一道闸 —— 必须显式白名单化,而不是靠「没写进白名单」这种默示约定。
const ADMIN_ONLY_CHANNELS = new Set([
  'auth-add-user', 'auth-remove-user', 'auth-change-password', 'auth-list-users',
  'save-setting', 'reset-setting', 'import-setting', 'save-settings',
  'delete-local-book', 'move-local-book', 'rename-local-book', 'ai-save-text',
  'ai-colorize-image', 'open-path', 'show-file',
  // 重新生成封面 = 删旧封面文件 + 写库(coverPath/hash/页数),属于写操作,只给管理员
  'regenerate-cover',
])

// 只读账户读取设置时抹掉敏感信息。
// 口径改「宁可多抹」:凡是能当凭据用的字段一律不发给 viewer。
// 尤其 webUsername/webPassword —— 它们是桌面端远程模式用来登录这台 NAS 的管理员口令(明文)。
const VIEWER_SETTING_BLOCKLIST = new Set([
  'igneous', 'ipb_pass_hash', 'ipb_member_id', 'star', 'proxy', 'cookie',
  'openaiApiKey', 'titleTranslationApiKey',
  'upscaleApiKey', 'colorizeApiKey', 'ocrApiKey', 'colorizeApiUrl', 'ocrApiUrl',
  'aiApiProfiles', 'webUsername', 'webPassword', 'remoteUsername', 'remotePassword',
])
const sanitizeSettingForViewer = (setting) => {
  const out = {}
  for (const [key, value] of Object.entries(setting || {})) {
    if (!VIEWER_SETTING_BLOCKLIST.has(key)) out[key] = value
  }
  return out
}

// ---------- SSE ----------
const sseClients = new Set()
const broadcast = (channel, arg) => {
  const payload = `data: ${JSON.stringify({ channel, arg })}\n\n`
  // viewer(只读账户)不推送扫描/管理类消息,只保留阅读器图片等必要推送
  const isAdminOnly = channel === 'send-message' || channel === 'send-action'
  for (const res of sseClients) {
    try {
      if (isAdminOnly && res._emmViewer) continue
      res.write(payload)
    } catch {}
  }
}
setBroadcast(broadcast)

app.get('/api/events', (req, res) => {
  if (auth.isEnabled() && !sessionOf(req)) {
    res.status(401).end()
    return
  }
  // 记录该连接的角色,广播时用于过滤只读账户
  const sess = sessionOf(req)
  res._emmViewer = !!sess && sess.role === 'viewer'
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write('retry: 3000\n\n')
  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
})
// 心跳,避免代理/浏览器把空闲连接掐掉
setInterval(() => {
  for (const res of sseClients) {
    try { res.write(': ping\n\n') } catch {}
  }
}, 25000).unref()

// ---------- 登录 / 登出 / 当前用户 ----------
app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '')
  const ip = clientIp(req)
  const wait = Math.max(throttleWait(userKey(username)), throttleWait(ipKey(ip)))
  if (wait) return res.status(429).json({ ok: false, error: `尝试过于频繁,请 ${wait} 秒后再试` })
  const user = auth.verify(username, password)
  if (!user) {
    throttleFail(username, ip)
    return res.status(401).json({ ok: false, error: '用户名或密码错误' })
  }
  throttleClear(username, ip)
  const token = auth.createSession(user)
  setSessionCookie(res, token)
  // 登录即加载该账户的设置(同名账户在 Win 与 NAS 共用同一份)
  try { await settingForAccount(user.username) } catch (e) { console.log('[profile] 加载账户设置失败:', String((e && e.message) || e)) }
  res.json({ ok: true, username: user.username, role: user.role })
})

app.post('/api/auth/logout', (req, res) => {
  auth.destroySession(parseCookies(req)[TOKEN_COOKIE])
  clearSessionCookie(res)
  res.json({ ok: true })
})

app.get('/api/auth/me', (req, res) => {
  const session = sessionOf(req)
  if (!session) return res.status(401).json({ ok: false, error: '未登录' })
  res.json({ ok: true, username: session.username, role: session.role })
})

// ---------- 基础信息 ----------
app.get('/api/info', (req, res) => {
  const session = sessionOf(req)
  // 滑动续期:每次打开页面都把有效期续满,长期不用也不会突然掉登录
  const tok = parseCookies(req)[TOKEN_COOKIE]
  if (tok && auth.getSession(tok)) setSessionCookie(res, tok)
  res.json({
    webMode: true,
    pathSep: path.sep,
    // 与主进程同一口径:版本号 + 构建时间戳(见 index.js 的 appVersion)
    version: (() => {
      const pkg = require('./package.json')
      return pkg.buildTime ? (pkg.version + '+' + pkg.buildTime) : pkg.version
    })(),
    port: PORT,
    auth: auth.isEnabled(),
    role: session ? session.role : null,
    username: session ? session.username : null,
  })
})

// ---------- IPC 桥 ----------
app.post('/api/ipc/:channel', async (req, res) => {
  const channel = req.params.channel
  const args = Array.isArray(req.body?.args) ? req.body.args : []
  const fakeEvent = {
    sender: { send: broadcast },
    returnValue: undefined,
    // 把「这次请求是谁」带进 index.js:index.js 的 requireAdmin() 在 WEB_MODE 下恒返回 null
    // (它假设角色校验在 web-server 做),所以 handler 里拿不到角色。凡是「必须按角色收紧」的
    // 逻辑(例如 eh-download-* 对只读账户只许读写 downloadPath 内),都要靠这个字段判断。
    // 桌面版走的是真实 IpcMainInvokeEvent,没有这个字段 → index.js 视为管理员,行为不变。
    _emmRole: '',
  }
  // 账户权限:未登录 401;普通账户(viewer)只允许浏览类通道,写操作 403
  let session = null
  if (auth.isEnabled()) {
    session = sessionOf(req)
    if (!session) return res.status(401).json({ ok: false, error: '未登录,请先登录' })
    fakeEvent._emmRole = String(session.role || '')
    if (session.role !== 'admin') {
      if (ADMIN_ONLY_CHANNELS.has(channel)) {
        return res.status(403).json({ ok: false, error: '只读账户无此权限(请使用管理员账户)' })
      }
      // load-book-list(scan=true) 会触发扫描建库(写操作),普通账户只能加载现有列表。
      // 闸门必须和 handler 用同一套布尔语义:以前这里写 `=== true`、handler 写 `if (scan)`,
      // 传 1 或 "1" 就能绕过(已实测)。
      const wantScan = args[0] === true || args[0] === 1 || args[0] === 'true' || args[0] === '1'
      if (channel === 'load-book-list' && wantScan) {
        return res.status(403).json({ ok: false, error: '只读账户无此权限(请使用管理员账户)' })
      }
      if (!VIEWER_ALLOWED_CHANNELS.has(channel)) {
        return res.status(403).json({ ok: false, error: '只读账户无此权限(请使用管理员账户)' })
      }
    }
  }
  // 用「该账户自己的设置」处理这次请求:多账户同时在线也互不干扰
  return withAccount(profileNameOf(session), async () => {
  try {
    const handler = ipcMain._handlers.get(channel)
    if (handler) {
      const result = await handler(fakeEvent, ...args)
      // 普通账户读取设置时抹掉敏感信息(cookie / API 密钥 / 代理)
      const finalResult = (auth.isEnabled() && sessionOf(req)?.role === 'viewer' && channel === 'load-setting')
        ? sanitizeSettingForViewer(result)
        : result
      return res.json({ ok: true, result: finalResult === undefined ? null : finalResult })
    }
    const onHandler = ipcMain._onHandlers.get(channel)
    if (onHandler) {
      onHandler(fakeEvent, ...args)
      return res.json({ ok: true, result: fakeEvent.returnValue === undefined ? null : fakeEvent.returnValue })
    }
    res.status(404).json({ ok: false, error: `未知的 IPC 通道: ${channel}` })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
  })
})

// ---------- 文件服务(封面 / 阅读图片) ----------
// 「数据目录里到底哪些子目录该发给浏览器」—— 白名单,不是黑名单。
// 绝不整目录放行 STORE_PATH:那里同时住着 users.json / sessions.json / setting*.json /
// *.sqlite / log.txt,一条 GET 就能把管理员 token 和 EH cookie 端走(已实测复现)。
const STORE_SUBDIRS = ['cover', 'viewer', 'tmp', 'download-covers', 'upscaled', 'custom-assets', 'libraries']
// 第二层:即使将来有人又把某个根目录加回来,这些文件也一律拒发。
const DENY_BASENAME = /^(users|sessions|iprules|libraries|collectionList|bootstrap|nas-session|downloads|tag-translation|secret_key|log)\./i
const DENY_EXT = /\.(json|jsonl|sqlite|sqlite3|db|log|env|pem|key|crt|p12|tmp|bak)$/i
const DENY_SEGMENT = /(^|[\\/])(\.trash|node_modules|\.git)([\\/]|$)/i
// 解析真实路径:软链一律跟到底,防止「库里放个软链指到 /etc」绕过前缀校验
const realOrResolve = (p) => {
  try { return fs.realpathSync(p) } catch { return path.resolve(p) }
}
const isUnder = (child, parent) => child === parent || child.startsWith(parent + path.sep)
const isDeniedFile = (p) => {
  const base = path.basename(p)
  return DENY_BASENAME.test(base) || DENY_EXT.test(base) || DENY_SEGMENT.test(p)
}

const allowedRoots = (setting) => {
  const s = setting || getSetting() || {}
  // 相对路径按「用户数据目录」解析,必须和 index.js 的 resolveDownloadRoot 保持同一规则:
  // 否则「相对下载目录」实际被写到 STORE_PATH 下,而白名单按进程 cwd 解析 → 网页版一律 403。
  const localRoot = (p) => {
    const t = String(p == null ? '' : p).trim()
    if (!t) return ''
    return path.isAbsolute(t) ? t : path.join(STORE_PATH, t)
  }
  // 多库:活动库 + 所有库的路径 + 元数据目录。
  // ⚠️ 桌面路径(path)与网页/容器路径(pathWeb)都要放行 ——
  //    以前只放行 path,网页版读 NAS 上的书时图片一律 403,表现就是「阅读器一直白」。
  // 库数据目录(每库的 cover / viewcache / 缩放缓存)也要放行:
  // 用户把它指到数据目录之外时,封面与阅读缓存在网页版会 403
  const libraryPaths = Array.isArray(s.libraries)
    ? s.libraries.flatMap(l => [l.path, l.pathWeb, l.dataPath, l.dataPathWeb])
    : []
  const roots = [
    // 数据目录下只放行这几个「本来就是公开图片」的子目录(见 STORE_SUBDIRS 注释)
    ...STORE_SUBDIRS.map(d => path.join(STORE_PATH, d)),
    localRoot(s.library),
    // 下载目录 / 移动目标目录:下载预览要读这些文件,不放开的话网页版会一律 403(预览全是「加载失败」)
    localRoot(s.downloadPath), localRoot(s.moveDefaultPath), localRoot(s.moveSinglePath),
    ...libraryPaths,
    ...(extraAllowedRoots() || []),
  ].filter(Boolean)
  return [...new Set(roots.map(realOrResolve))]
}

app.get('/api/file', requireLogin, async (req, res) => {
  const raw = String(req.query.path || '')
  // 前端 img 标签可能自带 ?id= 缓存参数,去掉
  const clean = raw.split('?id=')[0]
  // 先解真实路径(软链跟到底),再做前缀比较
  const p = realOrResolve(clean)
  if (isDeniedFile(p)) return res.status(403).send('Forbidden')
  // 用「这个账户」的库列表放行(桌面路径与容器路径都算),多账户并发各读各的
  const roots = allowedRoots(await settingForAccount(profileNameOf(sessionOf(req))))
  const ok = roots.some(root => isUnder(p, root))
  if (!ok) return res.status(403).send('Forbidden')
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return res.status(404).send('Not found')
  // 缓存策略分三档(1.11.0):
  //  ① 封面(共享 cover 目录,文件名稳定)→ 长缓存;
  //  ② 阅读器自己生成的图(缩略图/缩放缓存/改名副本,文件名唯一且内容不会变)→ immutable 永久缓存:
  //     同一页来回滚动 = 零请求,这是网页版/远程模式最直接的提速点;
  //  ③ 其它(漫画库原图、压缩包解压产物:文件名可能在不同漫画间重名,内容也可能被超分替换)
  //     → 强制校验;Express sendFile 自带 ETag/Last-Modified,内容没变会返回 304,不再重传整张图。
  //     注意:这一档绝不能发 immutable,否则超分替换原文件后会一直显示旧图。
  // 封面现在按库存放:<数据目录>/libraries/<库名>/cover/
  const coverDir = path.join(STORE_PATH, 'cover')
  const isCover = p.startsWith(coverDir + path.sep)
    || (p.startsWith(path.join(STORE_PATH, 'libraries') + path.sep) && p.includes(path.sep + 'cover' + path.sep))
  const isGeneratedImage = /^(thumb_|rsz_|resized_|rename_)/.test(path.basename(p))
  res.sendFile(p, {
    headers: isCover
      ? { 'Cache-Control': 'public, max-age=86400' }
      : isGeneratedImage
        ? { 'Cache-Control': 'public, max-age=31536000, immutable' }
        : { 'Cache-Control': 'private, max-age=0, must-revalidate' }
  })
})

// ---------- 目录列表(网页版文件夹/文件选择器) ----------
// EH 在线图片代理:原图主机(*.hath.network)浏览器直连基本不可达,
// 在线读图与页预览一律由服务端带 Cookie + 代理取回再转发。
// 只放行 EH 的几个域名 —— 否则这就是一个「服务端任意 URL 代理」。
const EX_IMAGE_HOST_RE = /^https:\/\/([^/]+\.)?(hath\.network|ehgt\.org|e-hentai\.org|exhentai\.org)(:\d+)?\//i
// ---------- EH 图片:内存缓存 + 有界并发 + 失败重试 ----------
// 用户反馈「在线图片一直失败 / 很慢,自己开网站却又快又少失败」。三个原因:
//   ① 每张图都现取、没有缓存 —— 翻回上一页、来回滚就又打一次 EH;
//   ② 阅读器一次会请求几十张,并发几十个连接直奔 hath 节点,很容易被限速/握手失败,
//      表现就是「大面积加载失败」;
//   ③ 失败一次就认输,没有重试。
// 这里补齐:LRU 内存缓存(TTL)、同时最多 N 个取图、失败快速重试一次、超时下调。
const IMG_CACHE_MAX_BYTES = 600 * 1024 * 1024
const IMG_CACHE_TTL = 30 * 60 * 1000
// 提到 12:实测「直连优先 + 代理兜底」时并发 6/12/20 的成功率都是 20/20,
// 而并发 12 的墙钟比 6 快(2 572ms vs 3 115ms)。之前卡 6 是「只走代理」时代的经验值。
const IMG_MAX_CONCURRENCY = 12
const imgCache = new Map()
let imgCacheBytes = 0
const imgCacheGet = (url) => {
  const hit = imgCache.get(url)
  if (!hit) return null
  if (Date.now() - hit.at > IMG_CACHE_TTL) {
    imgCacheBytes -= hit.buffer.length
    imgCache.delete(url)
    return null
  }
  imgCache.delete(url)
  imgCache.set(url, hit)
  return hit
}
const imgCachePut = (url, buffer, type) => {
  if (!buffer || !buffer.length) return
  if (buffer.length > IMG_CACHE_MAX_BYTES / 4) return
  const prev = imgCache.get(url)
  if (prev) { imgCacheBytes -= prev.buffer.length; imgCache.delete(url) }
  imgCache.set(url, { buffer, type, at: Date.now() })
}

// ---------- 在线图片磁盘缓存(与桌面版 emm-eh:// 共用 modules/ehImageCache.js) ----------
// key 规则、淘汰策略、魔数嗅探只有一份实现,两边行为一致。
// 摘要:EH 图片 URL 里的 keystamp 实测 5–6 分钟失效,但 /h/<sha1>-<bytes>-<w>-<h>/ 是内容寻址的,
//      抹掉 keystamp/fileindex/xres 再哈希 → key 长期有效,重启后依然命中。
const ehImgDisk = createEhImageCache({ dir: () => path.join(STORE_PATH, 'ehimgcache') })
const ehImgDiskGet = (url) => ehImgDisk.get(url)
const ehImgDiskPut = (url, buffer) => ehImgDisk.put(url, buffer)
const trimEhImgCache = (maxFiles) => ehImgDisk.trim(maxFiles)
let imgRunning = 0
const imgWaiters = []
const acquireImgSlot = () => new Promise((resolve) => {
  if (imgRunning < IMG_MAX_CONCURRENCY) { imgRunning += 1; resolve() }
  else imgWaiters.push(resolve)
})
const releaseImgSlot = () => {
  const next = imgWaiters.shift()
  if (next) next()
  else imgRunning = Math.max(0, imgRunning - 1)
}

app.get('/api/ex-image', requireLogin, async (req, res) => {
  const url = String(req.query.url || '')
  if (!EX_IMAGE_HOST_RE.test(url)) return res.status(400).send('bad url')
  // r = 图片页 URL(/s/<hash>/<gid>-<n>);EH 的 H@H 节点会校验来源,用站点根当 referer 容易被拒。
  // ⚠️ 它会被当作 Referer 发给上游、并交给 resolvePageImageInfo 二次解析 —— 必须走同一份域名白名单,
  //    否则 url 拦得再严也没用:r 就是一个完整的 SSRF 入口(已实测服务端会真的发出请求)。
  const pageRefRaw = String(req.query.r || 'https://e-hentai.org/')
  const pageRef = EX_IMAGE_HOST_RE.test(pageRefRaw) ? pageRefRaw : 'https://e-hentai.org/'
  // 缓存命中:①内存(同会话)②磁盘(跨重启/跨会话,key 抹掉了 keystamp)
  // max-age=3600 让浏览器自己也留一份;private 是因为这些图属于账号内容。
  const hit = imgCacheGet(url)
  if (hit) {
    res.set('Content-Type', hit.type)
    res.set('Cache-Control', 'private, max-age=3600')
    res.set('X-Img-Cache', 'mem')
    return res.send(hit.buffer)
  }
  const diskHit = ehImgDiskGet(url)
  if (diskHit) {
    imgCachePut(url, diskHit.buffer, diskHit.type)
    res.set('Content-Type', diskHit.type)
    res.set('Cache-Control', 'private, max-age=3600')
    res.set('X-Img-Cache', 'disk')
    return res.send(diskHit.buffer)
  }
  // ★ 并发槽的归还:整个请求只还一次。
  //   以前是在 finally 里还 —— 而 finally 在 `upstream.pipe(res); return` 的**那一刻**就执行了
  //   (图片才刚开始往浏览器传),等于 IMG_MAX_CONCURRENCY 完全没生效:几十张图同时打 EH,必被限速。
  //   现在:把归还挂到响应的生命周期上(finish = 正常传完 / close = 客户端断开 / error),
  //   并用 released 标志保证只减一次;只有「没走到流式返回」的分支才由 finally 兜底归还。
  let released = false
  const releaseSlot = () => {
    if (released) return
    released = true
    try { releaseImgSlot() } catch (e) { /* 忽略 */ }
  }
  let release = null
  let slotHeld = false
  // 槽是否已经「交给响应」:交给响应后由上面的 close/finish/error 归还,finally 不再插手
  let slotHandedToResponse = false
  try {
    await acquireImgSlot()
    release = releaseSlot
    slotHeld = true
    // 该账户的设置(含 proxy);拿不到就退回全局设置
    let prof = {}
    try {
      prof = (await settingForAccount(profileNameOf(sessionOf(req)))) || {}
    } catch (e) {
      prof = (typeof getSetting === 'function' ? getSetting() : {}) || {}
    }
    let lastErr = null
    // ---------- 取上游(JHenTai 口径:图片节点直连,站点走代理)----------
    // 分流由 modules/ehLogin.js 的 request() 按目标域名统一负责:
    //   · *.hath.network → 忽略这里的 proxy,强制直连(实测代理对非标端口几乎全 ECONNRESET)
    //   · 其余站点页 → 用该账户配置的代理(实测直连必超时)
    // 所以这里只负责「拿 200 或者带 status 抛错」,不再做腿健康判断。
    const fetchUpstream = (target) => ehLogin.request(target, {
      proxy: prof.proxy,
      raw: true,
      stream: true,
      referer: pageRef,
      timeout: 15000,
      retries: 1
    })
    const dropStream = (r) => {
      try { if (r && r.stream && typeof r.stream.resume === 'function') r.stream.resume() } catch (e) { /* 忽略 */ }
    }
    // 返回 200 的响应;拿不到就抛(带 .status 供上层判断值不值得换节点)
    const openUpstream = async (target) => {
      const r = await fetchUpstream(target)
      if (r && r.status === 200) return r
      const st = Number((r && r.status) || 0)
      dropStream(r)
      const err = new Error('upstream ' + (st || 'error'))
      err.status = st
      throw err
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let target = url
      if (attempt >= 1) {
        try {
          const fresh = await ehLogin.resolvePageImageInfo(pageRef, { proxy: prof.proxy, cookie: prof.cookie || '', reloadKey: '' })
          // 上游页面里解析出来的图片地址同样要过白名单 —— 否则被投毒的页面能把请求引到内网
          if (fresh && fresh.url && EX_IMAGE_HOST_RE.test(fresh.url)) target = fresh.url
        } catch (e) { /* 拿不到新节点就沿用原地址 */ }
      }
      let r = null
      try {
        r = await openUpstream(target)
      } catch (e) {
        lastErr = e
        const st = Number((e && e.status) || 0)
        if (attempt === 0 && (st === 403 || st === 429 || st === 509)) continue
        break
      }
      try {
        const type = String((r.headers && r.headers['content-type']) || '')
        if (!/^image\//i.test(type)) {
          lastErr = new Error('not-image:' + type.slice(0, 30))
          dropStream(r)
          // 200 但回 HTML = 限速页/删图页:换一个节点再试一轮
          if (attempt === 0) continue
          break
        }
        // ★ WebP 先整张取回并转成 progressive JPEG:浏览器对 WebP 是整张解码的,
        //   流式喂进去也不会逐段显示;progressive JPEG 才会先糊后清晰。
        // ★ 2026-11:默认关闭(见文件头说明),只有设置里打开 ehWebpTranscode 才转码。
        if (prof.ehWebpTranscode === true && /^image\/webp/i.test(type)) {
          try {
            const full = await new Promise((resolve, reject) => {
              const bufs = []
              let size = 0
              r.stream.on('data', (c) => {
                size += c.length
                if (size > TRANSCODE_MAX_BYTES) { try { r.stream.destroy() } catch (e) { /* 忽略 */ } ; reject(new Error('too-large')); return }
                bufs.push(c)
              })
              r.stream.on('end', () => resolve(Buffer.concat(bufs)))
              r.stream.on('error', reject)
            })
            const jpg = await transcodeToProgressiveJpeg(full, prof.ehWebpTranscodeQuality)
            if (jpg) {
              imgCachePut(url, jpg, 'image/jpeg')
              ehImgDiskPut(url, jpg)
              res.set('Content-Type', 'image/jpeg')
              res.set('Cache-Control', 'private, max-age=3600')
              res.set('X-Img-Cache', 'miss')
              res.send(jpg)
              return
            }
            imgCachePut(url, full, type)
            ehImgDiskPut(url, full)
            res.set('Content-Type', type)
            res.set('Cache-Control', 'private, max-age=3600')
            res.set('X-Img-Cache', 'miss')
            res.send(full)
            return
          } catch (e) { /* 太大或出错,落回流式路径 */ }
        }
        const total = Number((r.headers && r.headers['content-length']) || 0)
        res.set('Content-Type', type)
        res.set('Cache-Control', 'private, max-age=3600')
        res.set('X-Img-Cache', 'miss')
        if (total) res.set('Content-Length', String(total))
        // 槽的归还交给响应:图片传完(finish)/ 浏览器断开(close)/ 出错(error)时各触发一次,
        // releaseSlot 内部有 released 标志,只会真正归还一次。
        slotHandedToResponse = true
        res.on('close', releaseSlot)
        res.on('finish', releaseSlot)
        res.on('error', releaseSlot)
        res.flushHeaders()
        const CACHE_LIMIT = IMG_CACHE_MAX_BYTES / 8
        const collect = []
        let received = 0
        const upstream = r.stream
        upstream.on('data', (chunk) => {
          received += chunk.length
          if (received <= CACHE_LIMIT) collect.push(chunk)
        })
        upstream.on('error', () => { try { res.destroy() } catch (e) { /* 忽略 */ } })
        upstream.on('end', () => {
          if (received <= CACHE_LIMIT && collect.length) {
            const whole = Buffer.concat(collect)
            try { imgCachePut(url, whole, type) } catch (e) { /* 忽略 */ }
            try { ehImgDiskPut(url, whole) } catch (e) { /* 忽略 */ }
          }
        })
        res.on('close', () => { if (!upstream.destroyed) upstream.destroy() })
        upstream.pipe(res)
        return
      } catch (e) {
        // 处理阶段出错(已经不是网络层):换节点也没用,交给浏览器自己重试
        lastErr = e
        break
      }
    }
    return res.status(502).send(String((lastErr && lastErr.message) || 'upstream error'))
  } catch (e) {
    res.status(502).send(String((e && e.message) || e))
  } finally {
    // 只有「没把槽交给响应」的分支(缓冲返回 / 502 / 早期异常)才需要在这里兜底归还;
    // 流式分支由 res 的 close/finish/error 归还,这里再还就变成负数了。
    if (slotHeld && release && !slotHandedToResponse) release()
  }
})

app.get('/api/list-dir', requireLogin, (req, res) => {
  // 目录选择器需要「管理员能自由浏览」,但只读账户不该有全盘枚举能力:
  // 它能配合 /api/file 精确定位 sessions.json 之类目标(已实测 ?path=/ 返回容器全盘)。
  const session = sessionOf(req)
  if (auth.isEnabled() && (!session || session.role !== 'admin')) {
    return res.status(403).json({ error: 'Forbidden: 只读账户无目录浏览权限' })
  }
  let p = String(req.query.path || '')
  if (!p) {
    p = process.platform === 'win32' ? 'C:\\' : '/'
  }
  p = path.resolve(p)
  const withFiles = req.query.files === '1'
  let dirs = []
  let files = []
  try {
    const entries = fs.readdirSync(p, { withFileTypes: true })
    dirs = entries.filter(d => d.isDirectory()).map(d => d.name).sort((a, b) => a.localeCompare(b))
    if (withFiles) {
      files = entries.filter(d => d.isFile()).map(d => d.name).sort((a, b) => a.localeCompare(b))
    }
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e) })
  }
  const parent = p === path.parse(p).root ? null : path.dirname(p)
  res.json({ path: p, parent, dirs, files })
})

// ---------- 目录浏览页(网页版「打开所在目录」:新标签页打开 NAS 文件夹) ----------
app.get('/browse', requireLogin, (req, res) => {
  const roots = allowedRoots()
  if (!roots.length) return res.status(400).send('未配置可浏览目录')
  let target = path.resolve(String(req.query.path || roots[0]))
  const ok = roots.some(root => target === root || target.startsWith(root + path.sep))
  if (!ok) return res.status(403).send('Forbidden: 只能浏览漫画库/数据目录内的路径')
  let st = null
  try { st = fs.statSync(target) } catch (e) { return res.status(404).send('Not found: ' + target) }
  const dir = st.isDirectory() ? target : path.dirname(target)
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return res.status(400).send(String(e.message || e)) }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const enc = (s) => encodeURIComponent(s)
  const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort((a, b) => a.localeCompare(b, 'zh'))
  const files = entries.filter(e => e.isFile()).map(e => e.name).sort((a, b) => a.localeCompare(b, 'zh', { numeric: true }))
  const rootPath = path.parse(dir).root
  const parent = dir === rootPath ? null : path.dirname(dir)
  const segs = dir.split(path.sep).filter(Boolean)
  let acc = rootPath
  const crumbs = segs.map(seg => { acc = path.join(acc, seg); return { name: seg, p: acc } })
  const rows = []
  if (parent) rows.push({ name: '..', url: '/browse?path=' + enc(parent), dir: true })
  dirs.forEach(n => rows.push({ name: n + '/', url: '/browse?path=' + enc(path.join(dir, n)), dir: true }))
  files.forEach(n => rows.push({ name: n, url: '/api/file?path=' + enc(path.join(dir, n)), dir: false }))
  const html = [
    '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>目录浏览 - ' + esc(path.basename(dir) || dir) + '</title>',
    '<style>',
    'body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;margin:0;background:#f5f6f8;color:#303133}',
    'header{position:sticky;top:0;background:#fff;border-bottom:1px solid #e4e7ed;padding:10px 14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}',
    '.crumb{font-size:13px;color:#606266;word-break:break-all}.crumb a{color:#409eff;text-decoration:none}.crumb a:hover{text-decoration:underline}',
    'main{padding:10px 14px 40px}ul{list-style:none;margin:0;padding:0}li{border-bottom:1px solid #ebeef5}',
    'a.row{display:flex;gap:10px;align-items:center;padding:10px 6px;color:#303133;text-decoration:none;font-size:14px;word-break:break-all}',
    'a.row:hover{background:#ecf5ff}.ico{flex:0 0 20px;text-align:center}.count{font-size:12px;color:#909399}',
    '</style></head><body>',
    '<header><div class="crumb">' + crumbs.map(c => '<a href="/browse?path=' + enc(c.p) + '">' + esc(c.name) + '</a>').join(' / ') + '</div>',
    '<div class="count">' + dirs.length + ' 个文件夹 / ' + files.length + ' 个文件</div></header>',
    '<main><ul>',
    rows.map(r => '<li><a class="row" href="' + r.url + '"' + (r.dir ? '' : ' target="_blank"') + '><span class="ico">' + (r.dir ? 'DIR' : 'FILE') + '</span><span>' + esc(r.name) + '</span></a></li>').join(''),
    '</ul></main></body></html>'
  ].join('')
  res.type('html').send(html)
})

// ---------- 前端静态资源 ----------
app.use(express.static(DIST_DIR))
// SPA 回退(API 之外的所有 GET 都返回 index.html)
app.get(/^\/(?!api\/).*/, (req, res) => {
  if (fs.existsSync(INDEX_HTML)) {
    res.sendFile(INDEX_HTML)
  } else {
    res.status(500).send('未找到 dist/index.html,请先运行 npm run build 构建前端')
  }
})

function getLanAddresses () {
  const result = []
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) result.push(net.address)
    }
  }
  return result
}

function start (options) {
  if (options?.getSetting) getSetting = options.getSetting
  if (options?.withAccount) withAccount = options.withAccount
  if (options?.settingForAccount) settingForAccount = options.settingForAccount
  if (options?.extraAllowedRoots) extraAllowedRoots = options.extraAllowedRoots
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('')
    console.log('============================================')
    console.log('  exhentai-manga-manager 网页版已启动')
    console.log(`  本机访问:   http://127.0.0.1:${PORT}`)
    for (const addr of getLanAddresses()) {
      console.log(`  局域网访问: http://${addr}:${PORT}`)
    }
    console.log('============================================')
    console.log('')
  })
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`端口 ${PORT} 被占用,可用环境变量 WEB_PORT 指定其他端口(例如 set WEB_PORT=23788 && node web.js)`)
    } else {
      console.error(e)
    }
    process.exit(1)
  })
  return server
}

module.exports = { start, broadcast }
