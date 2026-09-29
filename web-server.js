// 网页版 HTTP 服务
// - 提供 dist/ 构建后的前端页面
// - POST /api/ipc/:channel 把浏览器请求分派到 ipcMain 处理器
// - GET /api/events SSE 推送(消息/进度/阅读器图片)
// - GET /api/file 提供封面与阅读图片(限定在数据目录与漫画库内)
// - GET /api/list-dir 供网页版文件夹选择器使用
const express = require('express')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { ipcMain, setBroadcast } = require('./web-electron-shim.js')
const { STORE_PATH } = require('./modules/init_folder_setting.js')
const auth = require('./modules/auth.js')
const iprules = require('./modules/iprules.js')
auth.loadUsers(STORE_PATH)
iprules.loadRules(STORE_PATH)

const PORT = parseInt(process.env.WEB_PORT || '10000', 10)
const DIST_DIR = path.join(__dirname, 'dist')
const INDEX_HTML = path.join(DIST_DIR, 'index.html')

// index.js 通过 start({ getSetting }) 注入,用于 /api/file 的目录白名单
let getSetting = () => ({})

const app = express()
app.use(express.json({ limit: '100mb' }))
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
    if (idx > 0) result[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
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
  res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`)
}
const clearSessionCookie = (res) => {
  res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=; HttpOnly; Path=/; Max-Age=0`)
}

// 登录失败限流:每用户 5 次失败后锁定 60 秒
const loginThrottle = new Map() // username -> { fails, lockUntil }
const throttleCheck = (username) => {
  const t = loginThrottle.get(username)
  if (!t) return null
  if (t.lockUntil && Date.now() < t.lockUntil) return Math.ceil((t.lockUntil - Date.now()) / 1000)
  return null
}
const throttleFail = (username) => {
  const t = loginThrottle.get(username) || { fails: 0, lockUntil: 0 }
  t.fails += 1
  if (t.fails >= 5) {
    t.lockUntil = Date.now() + 60 * 1000
    t.fails = 0
  }
  loginThrottle.set(username, t)
}

// 只读账户(viewer)允许的 IPC 通道:浏览/阅读/搜索类;写操作一律 403
const VIEWER_ALLOWED_CHANNELS = new Set([
  'load-setting', 'load-book-list', 'get-folder-tree', 'load-collection-list', 'load-manga-image-list',
  'open-url', 'show-file', 'open-local-book', 'get-default-manga-reader',
  'get-locale', 'get-path-sep', 'copy-text-to-clipboard', 'copy-image-to-clipboard',
  'read-text-from-clipboard', 'update-window-title', 'switch-fullscreen',
  'set-viewer-active', 'set-progress-bar', 'extract-image-text',
  'ai-translate-text', 'ai-save-text', 'ai-colorize-image', 'ai-list-images',
  'list-title-translation-models', 'query-character-origins', 'test-title-translation',
])

// viewer 读取设置时抹掉敏感信息(cookie / API 密钥 / 代理)
const VIEWER_SETTING_BLOCKLIST = new Set([
  'igneous', 'ipb_pass_hash', 'ipb_member_id', 'star', 'proxy',
  'openaiApiKey', 'titleTranslationApiKey',
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
app.post('/api/auth/login', (req, res) => {
  const username = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '')
  const wait = throttleCheck(username)
  if (wait) return res.status(429).json({ ok: false, error: `尝试过于频繁,请 ${wait} 秒后再试` })
  const user = auth.verify(username, password)
  if (!user) {
    throttleFail(username)
    return res.status(401).json({ ok: false, error: '用户名或密码错误' })
  }
  throttleCheck(username) && loginThrottle.delete(username)
  const token = auth.createSession(user)
  setSessionCookie(res, token)
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
  res.json({
    webMode: true,
    pathSep: path.sep,
    version: require('./package.json').version,
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
  }
  // 账户权限:未登录 401;普通账户(viewer)只允许浏览类通道,写操作 403
  if (auth.isEnabled()) {
    const session = sessionOf(req)
    if (!session) return res.status(401).json({ ok: false, error: '未登录,请先登录' })
    if (session.role !== 'admin') {
      // load-book-list(scan=true) 会触发扫描建库(写操作),普通账户只能加载现有列表
      if (channel === 'load-book-list' && args[0] === true) {
        return res.status(403).json({ ok: false, error: '只读账户无此权限(请使用管理员账户)' })
      }
      if (!VIEWER_ALLOWED_CHANNELS.has(channel)) {
        return res.status(403).json({ ok: false, error: '只读账户无此权限(请使用管理员账户)' })
      }
    }
  }
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

// ---------- 文件服务(封面 / 阅读图片) ----------
const allowedRoots = () => {
  const setting = getSetting() || {}
  const roots = [STORE_PATH, setting.library, setting.metadataPath].filter(Boolean)
  return roots.map(p => path.resolve(p))
}

app.get('/api/file', requireLogin, (req, res) => {
  const raw = String(req.query.path || '')
  // 前端 img 标签可能自带 ?id= 缓存参数,去掉
  const clean = raw.split('?id=')[0]
  const p = path.resolve(clean)
  const roots = allowedRoots()
  const ok = roots.some(root => p === root || p.startsWith(root + path.sep))
  if (!ok) return res.status(403).send('Forbidden')
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return res.status(404).send('Not found')
  // 封面文件(共享 cover 目录,文件名稳定)→ 允许长缓存,滚动浏览提速;
  // 阅读用临时图(viewer 缓存/漫画库原图)→ 不缓存,避免旧图错乱
  const coverDir = path.join(STORE_PATH, 'cover')
  const isCover = p.startsWith(coverDir + path.sep)
  res.sendFile(p, {
    headers: isCover
      ? { 'Cache-Control': 'public, max-age=86400' }
      : { 'Cache-Control': 'no-store' }
  })
})

// ---------- 目录列表(网页版文件夹/文件选择器) ----------
app.get('/api/list-dir', requireLogin, (req, res) => {
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
