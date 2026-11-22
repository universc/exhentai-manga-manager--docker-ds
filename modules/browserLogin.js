// ---------------------------------------------------------------------------
// EH 登录:「借一个真浏览器」把 Cloudflare 托管挑战过掉(JHenTai 同口径的移植)
//
// 为什么需要这个文件(2026-11 实测,不是猜的):
//   · EH 论坛(forums.e-hentai.org)现在整站挂在 Cloudflare **托管挑战** 后面。
//     GET/POST 的纯 HTTP 请求一律是 403 + `cf-mitigated: challenge` + "Just a moment...",
//     所以「账号密码直接 POST 登录」(modules/ehLogin.js passwordLogin)在这条链路上必然失败,
//     连"密码错"都轮不到 —— 请求根本没到达 IPB。
//   · JHenTai 在 Windows/Linux 上走的是 desktop_webview_window(系统 WebView2 / WebKitGTK),
//     那是**常青的现代 Chromium**,挑战能自己过,所以同一个网络里它能登、这里不能。
//   · 本仓库原来的登录窗口是 Electron 自带的 BrowserWindow。Electron 26 的 Chromium 是 116,
//     Cloudflare 对这类"过期内核 + 半自动指纹"会一直重发挑战:实测 120 秒里 did-navigate 刷了 6~7 次,
//     永远停在「正在进行安全验证」—— 这就是用户报的「一直卡在人机验证界面」。
//     更糟的是原代码还给这个窗口 setUserAgent 成 Chrome/120:
//     UA 说 120、navigator.userAgentData 说 116,自相矛盾,等于主动告诉 CF 这是个假浏览器。
//   · 实测对照(同一台机器、同一个代理、干净 profile):
//       Electron 26 + 默认 UA            → 120s 内 6~7 次重载,始终拿不到登录表单
//       Electron 26 + Chrome/120 UA      → 同样失败(UA 与内核版本对不上)
//       Chrome 159(用户已装,可见窗口) → 首次加载即通过,直接出登录表单
//
// 所以这里的做法和 JHenTai 完全一致:**不自己造浏览器,借系统里那个真浏览器去登录**,
// 登录成功后把 Cookie 取回来写进设置。取 Cookie 走 CDP(Chrome DevTools Protocol),
// 既不需要新依赖,也不会碰用户平时的浏览器配置(用一次性 profile 目录)。
//
// 与 JHenTai 的对应关系:
//   JHenTai: WebviewWindow.create() → launch(EForums) → evaluateJavaScript('document.cookie')
//            → CookieUtil.validateCookiesString → storeEHCookies → requestForum 取用户名
//   本文件:  spawn(Chrome/Edge --remote-debugging-port) → CDP Runtime.evaluate('document.cookie')
//            (另有 Network.getAllCookies 兜住 HttpOnly)→ 同一个校验 → 交回 index.js 落库
// ---------------------------------------------------------------------------

const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const net = require('net')
const crypto = require('crypto')
const { spawn } = require('child_process')

// ---------- 1. 找系统里的「现代浏览器」 ----------
// 只认 Chromium 系(要 CDP):Chrome / Edge / Brave / Chromium / Vivaldi。
// 不认 Firefox(Safari 系的 WebDriver 完全是另一套,这里不做)。
const WINDOWS_BROWSERS = [
  { id: 'chrome', name: 'Google Chrome', paths: [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
  ] },
  { id: 'edge', name: 'Microsoft Edge', paths: [
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe')
  ] },
  { id: 'brave', name: 'Brave', paths: [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe')
  ] },
  { id: 'vivaldi', name: 'Vivaldi', paths: [
    path.join(process.env.LOCALAPPDATA || '', 'Vivaldi\\Application\\vivaldi.exe'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Vivaldi\\Application\\vivaldi.exe')
  ] }
]

const MAC_BROWSERS = [
  { id: 'chrome', name: 'Google Chrome', paths: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] },
  { id: 'edge', name: 'Microsoft Edge', paths: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'] },
  { id: 'brave', name: 'Brave', paths: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'] },
  { id: 'chromium', name: 'Chromium', paths: ['/Applications/Chromium.app/Contents/MacOS/Chromium'] }
]

const LINUX_BROWSERS = [
  { id: 'chrome', name: 'Google Chrome', paths: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'] },
  { id: 'chromium', name: 'Chromium', paths: ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'] },
  { id: 'edge', name: 'Microsoft Edge', paths: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'] },
  { id: 'brave', name: 'Brave', paths: ['/usr/bin/brave-browser', '/opt/brave.com/brave/brave'] }
]

// 返回第一个**真实存在**的浏览器({ id, name, path });没有就 null。
// 顺序即优先级:Chrome 在最前(用户机器上实测能过挑战的就是它)。
const findBrowser = (forcedPath) => {
  if (forcedPath && fs.existsSync(forcedPath)) return { id: 'custom', name: path.basename(forcedPath), path: forcedPath }
  const list = process.platform === 'win32' ? WINDOWS_BROWSERS
    : process.platform === 'darwin' ? MAC_BROWSERS
      : LINUX_BROWSERS
  for (const b of list) {
    for (const p of b.paths) {
      try {
        if (p && fs.existsSync(p)) return { id: b.id, name: b.name, path: p }
      } catch (e) { /* 单个路径读不到继续 */ }
    }
  }
  return null
}

// 给设置界面用:把「找到哪些浏览器」列出来(不含耗时探测,只是 existsSync)
const listBrowsers = () => {
  const out = []
  const list = process.platform === 'win32' ? WINDOWS_BROWSERS
    : process.platform === 'darwin' ? MAC_BROWSERS
      : LINUX_BROWSERS
  for (const b of list) {
    const hit = b.paths.find(p => { try { return p && fs.existsSync(p) } catch (e) { return false } })
    if (hit) out.push({ id: b.id, name: b.name, path: hit })
  }
  return out
}

// ---------- 2. 极简 WebSocket 客户端(CDP 用,不引第三方依赖) ----------
// 只需要:连上、发 JSON 文本帧、收 JSON 文本帧。够用就行,不做分片聚合的完整实现。
const connectWebSocket = (wsUrl) => new Promise((resolve, reject) => {
  let u
  try {
    u = new URL(wsUrl)
  } catch (e) {
    return reject(new Error('badWsUrl'))
  }
  const key = crypto.randomBytes(16).toString('base64')
  const req = http.request({
    host: u.hostname,
    port: u.port || 80,
    path: u.pathname + u.search,
    headers: {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      'Sec-WebSocket-Key': key,
      'Sec-WebSocket-Version': '13'
    }
  })
  req.on('upgrade', (res, socket) => {
    let buf = Buffer.alloc(0)
    const handlers = []
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      for (;;) {
        if (buf.length < 2) return
        const fin = (buf[0] & 0x80) !== 0
        const op = buf[0] & 0x0f
        let len = buf[1] & 0x7f
        let off = 2
        if (len === 126) {
          if (buf.length < 4) return
          len = buf.readUInt16BE(2)
          off = 4
        } else if (len === 127) {
          if (buf.length < 10) return
          len = Number(buf.readBigUInt64BE(2))
          off = 10
        }
        if (buf.length < off + len) return
        const payload = buf.slice(off, off + len)
        buf = buf.slice(off + len)
        if (op === 1 && fin) {
          const text = payload.toString('utf8')
          for (const h of handlers) {
            try { h(text) } catch (e) { /* 单个回调出错不影响其它 */ }
          }
          continue
        }
        if (op === 8) { try { socket.destroy() } catch (e) { /* 忽略 */ } return }
        // 0x9 ping → 回 pong(op 0xA),否则 Chrome 会在 30s 后断开
        if (op === 9) {
          try {
            const pong = Buffer.concat([Buffer.from([0x8a, payload.length]), payload])
            socket.write(pong)
          } catch (e) { /* 忽略 */ }
        }
      }
    })
    socket.on('close', () => { for (const h of handlers) { try { h('') } catch (e) { /* 忽略 */ } } })
    const send = (obj) => {
      const data = Buffer.from(JSON.stringify(obj))
      const mask = crypto.randomBytes(4)
      let header
      if (data.length < 126) {
        header = Buffer.from([0x81, 0x80 | data.length])
      } else if (data.length < 65536) {
        header = Buffer.alloc(4)
        header[0] = 0x81
        header[1] = 0x80 | 126
        header.writeUInt16BE(data.length, 2)
      } else {
        header = Buffer.alloc(10)
        header[0] = 0x81
        header[1] = 0x80 | 127
        header.writeBigUInt64BE(BigInt(data.length), 2)
      }
      const masked = Buffer.alloc(data.length)
      for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4]
      return new Promise((res, rej) => {
        try {
          socket.write(Buffer.concat([header, mask, masked]), (err) => (err ? rej(err) : res()))
        } catch (e) { rej(e) }
      })
    }
    resolve({
      send,
      onMessage: (h) => handlers.push(h),
      close: () => { try { socket.destroy() } catch (e) { /* 忽略 */ } }
    })
  })
  req.on('error', reject)
  req.setTimeout(15000, () => { try { req.destroy(new Error('wsConnectTimeout')) } catch (e) { /* 忽略 */ } })
  req.end()
})

// ---------- 3. 端口 ----------
const isPortFree = (port) => new Promise((resolve) => {
  const srv = net.createServer()
  srv.once('error', () => resolve(false))
  srv.once('listening', () => srv.close(() => resolve(true)))
  srv.listen(port, '127.0.0.1')
})

const pickPort = async () => {
  // 不用 9222 这类默认端口:用户自己开着 DevTools 的 Chrome 会占着它,
  // 我们会连到**别人**的浏览器上(既取不到 cookie,还可能误读别人的登录态)。
  for (let i = 0; i < 40; i++) {
    const port = 21000 + Math.floor(Math.random() * 20000)
    if (await isPortFree(port)) return port
  }
  throw new Error('noFreePort')
}

const httpGetJson = (port, p, timeout = 1500) => new Promise((resolve, reject) => {
  const req = http.get({ host: '127.0.0.1', port, path: p, timeout }, (res) => {
    const chunks = []
    res.on('data', (c) => chunks.push(c))
    res.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (e) { reject(e) }
    })
  })
  req.on('error', reject)
  req.on('timeout', () => { try { req.destroy(new Error('timeout')) } catch (e) { /* 忽略 */ } })
})

// ---------- 4. 登录主流程 ----------
// 返回值与 Electron 窗口路径**完全一致**(index.js 用它落库):
//   { ok:true, cookies:{igneous,ipb_pass_hash,ipb_member_id,star}, user }
//   { ok:false, error:'browserNotFound'|'canceled'|'timeout'|'launchFailed'|..., detail }
const LOGIN_URL = 'https://forums.e-hentai.org/index.php?act=Login&CODE=00'

// 页面里取状态:登录表单/用户名/游客提示/Turnstile token。
// 与 JHenTai 的 login_page_logic.dart:370-404 同口径(#userlinksguest / .home > b > a)。
const READ_STATE_JS = `(() => {
  const d = document
  const q = (s) => d.querySelector(s)
  const u = q('#UserName') || q('input[name=UserName]')
  const p = q('#PassWord') || q('input[name=PassWord]')
  const t = q('[name="cf-turnstile-response"]')
  const guestBox = q('#userlinksguest')
  const userLink = q('.home > b > a')
  const text = d.body ? d.body.innerText : ''
  return JSON.stringify({
    url: location.href,
    title: d.title,
    hasForm: !!(u && p),
    filled: !!((u && u.value) || (p && p.value)),
    turnstile: t ? String(t.value || '').length : -1,
    guest: guestBox ? String(guestBox.innerText || '').trim().slice(0, 60) : '',
    user: userLink ? String(userLink.textContent || '').trim().slice(0, 60) : '',
    cookie: String(d.cookie || ''),
    text: text.replace(/\\s+/g, ' ').slice(0, 200)
  })
})()`

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const launchBrowserLogin = async ({ username = '', password = '', proxy = '', browserPath = '', timeoutMs = 5 * 60 * 1000, onStatus, loginUrl = '' } = {}) => {
  const browser = findBrowser(browserPath)
  if (!browser) return { ok: false, error: 'browserNotFound' }

  const userDataDir = path.join(os.tmpdir(), 'emm-eh-login-' + crypto.randomBytes(6).toString('hex'))
  try { fs.mkdirSync(userDataDir, { recursive: true }) } catch (e) { return { ok: false, error: 'launchFailed', detail: String(e.message || e) } }

  const port = await pickPort()
  const args = [
    '--remote-debugging-port=' + port,
    '--remote-allow-origins=*',
    '--user-data-dir=' + userDataDir,
    '--no-first-run',
    '--no-default-browser-check',
    // 关掉「这是自动化软件」这条最容易被 CF 抓的特征(与实测通过的那次一致)。
    // ⚠ 别在这里加 --disable-features=xxx:实测加上 Translate/MediaRouter 之后,
    //   同一个 URL、同一个代理,Cloudflare 就又开始无限重发挑战了。
    //   参数集只保留「实测能过」的这一组,想加新 flag 必须先跑通再合并。
    '--disable-blink-features=AutomationControlled',
    '--start-maximized',
    '--new-window',
    loginUrl || LOGIN_URL
  ]
  if (proxy) args.unshift('--proxy-server=' + proxy)

  let proc = null
  let cdp = null
  let child = null
  const cleanup = async () => {
    try { if (cdp) cdp.close() } catch (e) { /* 忽略 */ }
    try { if (child) child.kill() } catch (e) { /* 忽略 */ }
    if (proc) {
      // Chrome 会 fork 子进程:杀主进程后等它自己退,再兜底 taskkill / SIGKILL
      try { proc.kill() } catch (e) { /* 忽略 */ }
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
        }
      } catch (e) { /* 忽略 */ }
    }
    // profile 目录:留 2 秒再删(进程可能还在写 last-run / lockfile)
    await sleep(2000)
    try { fs.rmSync(userDataDir, { recursive: true, force: true }) } catch (e) { /* 忽略 */ }
  }

  try {
    proc = spawn(browser.path, args, { stdio: 'ignore', windowsHide: false })
    proc.on('error', () => { /* 由下面的 /json/version 轮询判定失败 */ })

    // 等 DevTools 端点起来(浏览器冷启动 + 代理握手,实测 1~6 秒)
    let version = null
    const startedAt = Date.now()
    while (!version && Date.now() - startedAt < 25000) {
      await sleep(400)
      try { version = await httpGetJson(port, '/json/version') } catch (e) { version = null }
      if (!version && proc && proc.exitCode !== null) {
        // 浏览器直接退了:多半是 profile 被占 / 参数不认。把退出码带出去,别只报 timeout。
        return { ok: false, error: 'launchFailed', detail: 'exit ' + proc.exitCode }
      }
    }
    if (!version) return { ok: false, error: 'launchFailed', detail: 'devtools not ready' }

    // 找到我们要的那个页面标签(打开时带的 LOGIN_URL)
    let page = null
    for (let i = 0; i < 40 && !page; i++) {
      let list = []
      try { list = await httpGetJson(port, '/json/list') } catch (e) { list = [] }
      const pages = (Array.isArray(list) ? list : []).filter(t => t && t.type === 'page' && t.webSocketDebuggerUrl)
      page = pages.find(t => /e-hentai\.org|exhentai\.org/i.test(String(t.url || ''))) || pages[0] || null
      if (!page) await sleep(400)
    }
    if (!page) return { ok: false, error: 'launchFailed', detail: 'no page target' }

    let msgId = 0
    const pending = new Map()
    let socketClosed = false

    // 把一条 WebSocket 接上:所有回包按 id 分发给等待中的 cmd()。
    // 单独抽成函数,是因为断线重连要能重新挂一次(见下面 socketClosed 的处理)。
    const attach = async (wsUrl) => {
      cdp = await connectWebSocket(wsUrl)
      socketClosed = false
      cdp.onMessage((txt) => {
        if (!txt) {
          socketClosed = true
          // 断线:把所有还在等的命令直接放行失败,别让它们干等 15 秒超时
          for (const [, cb] of pending) { try { cb({ error: { message: 'socketClosed' } }) } catch (e) { /* 忽略 */ } }
          pending.clear()
          return
        }
        let m = null
        try { m = JSON.parse(txt) } catch (e) { return }
        if (m && m.id && pending.has(m.id)) {
          const cb = pending.get(m.id)
          pending.delete(m.id)
          cb(m)
        }
      })
    }
    await attach(page.webSocketDebuggerUrl)
    const cmd = (method, params) => new Promise((resolve, reject) => {
      const id = ++msgId
      const timer = setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error('cdpTimeout ' + method)) }
      }, 15000)
      pending.set(id, (m) => {
        clearTimeout(timer)
        if (m.error) reject(new Error(m.error.message || 'cdpError'))
        else resolve(m.result)
      })
      cdp.send({ id, method, params: params || {} }).catch((e) => {
        clearTimeout(timer)
        if (pending.has(id)) pending.delete(id)
        reject(e)
      })
    })

    const evaluate = async (expression) => {
      const r = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false })
      // CDP 在页面还没就绪时会回 exceptionDetails —— 当作"没数据",让轮询继续
      if (!r || r.exceptionDetails) return null
      if (!r.result) return null
      return r.result.value
    }

    // Cookie 的读法与 JHenTai 完全一致:evaluateJavaScript('document.cookie')
    // (login_page_logic.dart:572/617)。ipb_member_id / ipb_pass_hash 都不是 HttpOnly,
    // 所以页面里的 document.cookie 就能拿到 —— 不需要额外的 CDP 命令。
    //
    // ⚠ 不要换成 Network.getAllCookies:实测(Chrome 159,Chromium 116 内核也一样)对
    //   page target 发这条命令会让整条 CDP WebSocket 被对端断掉,之后所有 Runtime.evaluate
    //   都报 "This socket has been ended by the other party",登录于是永远等不到 Cookie。
    //   这正是第一版移植跑 5 分钟超时的原因。
    //
    // ⚠ 这里**只**用页面里的 document.cookie,连 Network.getCookies 也不用:
    //   实测任何 Network.* 命令都会让这条 CDP 会话变得不稳定(严重时直接被对端断开),
    //   而 ipb_member_id / ipb_pass_hash / igneous / star 全都不是 HttpOnly,
    //   document.cookie 已经完全够用。
    const readCookieString = async (fallback) => fallback || ''

    const pickFromCookieString = (raw) => {
      const out = {}
      for (const part of String(raw || '').split(';')) {
        const i = part.indexOf('=')
        if (i <= 0) continue
        out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
      }
      return out
    }

    // 自动填表:等 Cloudflare 整页挑战过去、**并且 Turnstile 出了 token** 之后再提交。
    // 这是实测跑通的时序:表单已出现但 Turnstile 还没出 token 就提交,
    // 论坛会回一句 "The captcha was not entered correctly"(JHenTai 同坑)。
    let filled = false
    const tryAutofill = async (state) => {
      if (filled || !username || !password) return false
      if (!state || !state.hasForm) return false
      if (state.filled) { filled = true; return false }   // 用户自己在填,别插手
      if (state.turnstile === 0) return false              // 还没出 token:再等
      const js = `(() => {
        const u = document.querySelector('#UserName') || document.querySelector('input[name=UserName]')
        const p = document.querySelector('#PassWord') || document.querySelector('input[name=PassWord]')
        if (!u || !p) return 'no-form'
        u.value = ${JSON.stringify(String(username))}
        p.value = ${JSON.stringify(String(password))}
        u.dispatchEvent(new Event('input', { bubbles: true }))
        p.dispatchEvent(new Event('input', { bubbles: true }))
        const f = Array.from(document.forms).find(f => f.querySelector('[name=UserName]'))
        if (!f) return 'no-form'
        const btn = f.querySelector('input[type=submit], button[type=submit], #ipb_login_submit')
        if (btn) { btn.click(); return 'clicked' }
        f.submit()
        return 'submitted'
      })()`
      try {
        const r = await evaluate(js)
        if (r && r !== 'no-form') { filled = true; return true }
      } catch (e) { /* 填不进去就交给用户手动登录 */ }
      return false
    }

    const deadline = Date.now() + timeoutMs
    let loginSeenAt = 0
    let lastCookie = ''
    let userName = ''
    let lastStatus = ''

    while (Date.now() < deadline) {
      // 用户可能自己换标签页 / 浏览器把我们的 target 关了:重连一次再继续,不要直接判失败。
      if (socketClosed) {
        if (proc && proc.exitCode === null) {
          try {
            let list = await httpGetJson(port, '/json/list')
            const pages = (Array.isArray(list) ? list : []).filter(t => t && t.type === 'page' && t.webSocketDebuggerUrl)
            const again = pages.find(t => /e-hentai\.org|exhentai\.org/i.test(String(t.url || ''))) || pages[0]
            if (again) {
              await attach(again.webSocketDebuggerUrl)
              continue
            }
          } catch (e) { /* 连不上:下面按已关闭处理 */ }
        }
        return { ok: false, error: 'canceled', detail: 'browser closed' }
      }
      if (proc && proc.exitCode !== null && proc.exitCode !== 0) {
        return { ok: false, error: 'canceled', detail: 'browser exited ' + proc.exitCode }
      }

      let state = null
      try {
        const raw = await evaluate(READ_STATE_JS)
        state = raw ? JSON.parse(raw) : null
      } catch (e) { state = null }

      if (state) {
        const statusText = state.hasForm ? 'form' : (state.title || '')
        if (statusText !== lastStatus) { lastStatus = statusText; if (typeof onStatus === 'function') { try { onStatus(statusText) } catch (e) { /* 忽略 */ } } }
        if (state.cookie) lastCookie = state.cookie
        if (!userName && state.user) userName = state.user
        await tryAutofill(state)
      }

      // 从浏览器里取全部 cookie(含 HttpOnly),再并上页面里的那份
      let merged = lastCookie
      try {
        const all = await readCookieString(lastCookie)
        if (all) merged = all
      } catch (e) { /* 忽略 */ }

      const jar = pickFromCookieString(merged)
      const hasId = !!jar.ipb_member_id && jar.ipb_member_id !== '0'
      const hasHash = !!jar.ipb_pass_hash && jar.ipb_pass_hash !== '0'
      if (hasId && hasHash) {
        if (!loginSeenAt) {
          loginSeenAt = Date.now()
        } else if (Date.now() - loginSeenAt > 2500) {
          // 稳定 2.5 秒收工:igneous / star 由调用方用 HTTP 补(与原有窗口路径同口径)
          return {
            ok: true,
            cookies: {
              ipb_member_id: jar.ipb_member_id,
              ipb_pass_hash: jar.ipb_pass_hash,
              igneous: jar.igneous || '',
              star: jar.star || ''
            },
            user: userName
          }
        }
      } else {
        loginSeenAt = 0
      }
      // ★ 轮询间隔必须在 3 秒级,不要调快。实测 1.2 秒一轮会让 Cloudflare 的挑战
      //   一直重发(相隔 3 秒的同一份代码 24 秒就过了,改成 1.2 秒就跑满 90 秒超时)。
      //   挑战页本身对页面里的脚本活动很敏感 —— 这是 JHenTai 那种「只等页面自己稳定」的做法,
      //   也是这里刻意保持低频的原因。
      await sleep(3000)
    }
    return { ok: false, error: 'timeout' }
  } catch (e) {
    return { ok: false, error: 'launchFailed', detail: String((e && e.message) || e) }
  } finally {
    await cleanup()
  }
}

module.exports = {
  LOGIN_URL,
  findBrowser,
  listBrowsers,
  launchBrowserLogin,
  // 供测试/诊断用
  _connectWebSocket: connectWebSocket,
  _pickPort: pickPort
}
