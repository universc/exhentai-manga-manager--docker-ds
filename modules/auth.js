// 网页版(Docker)账户系统
// - 用户存储: <数据目录>/users.json  (首次启动由环境变量 WEB_ADMIN_USER / WEB_ADMIN_PASSWORD 创建管理员)
// - 角色:   admin  = 管理员,全部功能
//           viewer = 普通账户,仅可浏览(只读,写操作由 web-server.js 的 IPC 权限层拦截)
// - 会话:   token(HTTP-only Cookie,7 天有效)持久化到 <数据目录>/sessions.json,
//           容器重启后会话仍有效,用户无需重新登录
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

let usersFile = ''
let sessionsFile = ''
let users = {} // username -> { salt, hash, role, createdAt }
const sessions = new Map() // token -> { username, role, expires }
let authEnabled = false

// 会话有效期:登录后一直保持,直到用户主动退出登录(用户要求)。
const TOKEN_TTL = 365 * 24 * 3600 * 1000

const hashPassword = (password, salt) => {
  return crypto.scryptSync(String(password), salt, 32).toString('hex')
}

const validPassword = (password) => String(password || '').length >= 8

// 会话持久化:写/读 <数据目录>/sessions.json,容器重启后保持登录
// 原子写:先写临时文件再改名。直接覆盖写一旦中途失败(断电/进程被杀),
// users.json 会变成半截 JSON —— 下次启动解析失败就等于「所有账户都没了」。
const writeFileAtomic = (file, text) => {
  const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp'
  const fd = fs.openSync(tmp, 'w')
  try {
    fs.writeFileSync(fd, text, 'utf-8')
    // 只做 tmp+rename 是不够的:没 fsync 时断电/进程被 SIGKILL 可能留下 0 字节文件,
    // 下次启动 JSON.parse 失败 → users 为空 → 全站免鉴权。这里把数据和目录项都刷一次。
    try { fs.fsyncSync(fd) } catch (e) { /* 部分网络盘/overlay 不支持 fsync */ }
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmp, file)
  try {
    const dirFd = fs.openSync(path.dirname(file), 'r')
    try { fs.fsyncSync(dirFd) } catch (e) { /* 同上 */ }
    fs.closeSync(dirFd)
  } catch (e) { /* 目录 fsync 在部分文件系统不可用 */ }
}
const persistSessions = () => {
  if (!sessionsFile) return
  try {
    const now = Date.now()
    const alive = [...sessions.entries()].filter(([, s]) => s.expires > now)
    writeFileAtomic(sessionsFile, JSON.stringify(Object.fromEntries(alive), null, 2))
  } catch {}
}
const loadSessions = () => {
  if (!sessionsFile) return
  try {
    const parsed = JSON.parse(fs.readFileSync(sessionsFile, 'utf-8'))
    for (const [token, s] of Object.entries(parsed)) {
      if (s && s.expires > Date.now()) sessions.set(token, s)
    }
  } catch {}
}

// 从数据目录加载用户;首次启动时按环境变量创建管理员
const loadUsers = (dataDir) => {
  usersFile = path.join(dataDir, 'users.json')
  sessionsFile = path.join(dataDir, 'sessions.json')
  // 区分两种情况:① 文件根本不存在 = 首次启动 → 建默认管理员;
  //              ② 文件存在但没有账户 = 用户主动删光了 → 不能偷偷重建一个弱密码 admin/admin。
  let fileExists = true
  let parseFailed = false
  try {
    const parsed = JSON.parse(fs.readFileSync(usersFile, 'utf-8'))
    users = parsed.users || {}
  } catch {
    fileExists = fs.existsSync(usersFile)
    // 文件存在但解析不出来 = 损坏。以前这里会安静地变成「零账户 → authEnabled=false」,
    // 结果 141 个 IPC 通道对匿名全开。这个方向必须是 fail-closed。
    parseFailed = fileExists
    users = {}
  }
  loadSessions()
  if (parseFailed) {
    const bad = usersFile + '.corrupt-' + Date.now()
    try { fs.renameSync(usersFile, bad) } catch (e) { /* 改名失败也继续,至少别静默放行 */ }
    console.error('[auth] users.json 解析失败,已改名留存:' + bad)
    if (process.env.WEB_MODE === '1') {
      console.error('[auth] 网页版拒绝以「无鉴权」状态启动。处理办法:')
      console.error('  1) 有管理员口令:删掉该 .corrupt 文件,并设 WEB_ADMIN_USER / WEB_ADMIN_PASSWORD 后重启,会自动重建;')
      console.error('  2) 有备份:把备份的 users.json 覆盖回来再重启。')
      process.exit(1)
    }
  }
  if (!fileExists) {
    // 默认账户:admin / admin(用户要求 Win 与 NAS 都自带一个默认账户)。
    // 环境变量 WEB_ADMIN_USER / WEB_ADMIN_PASSWORD 仍可覆盖,便于部署时指定。
    const adminUser = process.env.WEB_ADMIN_USER || 'admin'
    const adminPass = process.env.WEB_ADMIN_PASSWORD || 'admin'
    const salt = crypto.randomBytes(16).toString('hex')
    users[adminUser] = { salt, hash: hashPassword(adminPass, salt), role: 'admin', createdAt: Date.now() }
    persistUsers()
    console.log(`[auth] 已创建默认管理员账户: ${adminUser}(可在设置 → 账户里新建账户后删除它)`)
  }
  authEnabled = Object.keys(users).length > 0
  return { authEnabled, users: Object.keys(users) }
}

const persistUsers = () => {
  if (!usersFile) return
  writeFileAtomic(usersFile, JSON.stringify({ users }, null, '  '))
}

const addUser = (username, password, role = 'viewer') => {
  const name = String(username || '').trim()
  if (!name) return { ok: false, error: '用户名不能为空' }
  if (users[name]) return { ok: false, error: '用户已存在' }
  if (!validPassword(password)) return { ok: false, error: '密码至少 4 位' }
  const salt = crypto.randomBytes(16).toString('hex')
  users[name] = { salt, hash: hashPassword(password, salt), role: role === 'admin' ? 'admin' : 'viewer', createdAt: Date.now() }
  persistUsers()
  authEnabled = true
  return { ok: true }
}

const removeUser = (username) => {
  if (!users[username]) return { ok: false, error: '用户不存在' }
  // 允许删除默认的 admin —— 但必须至少保留一个管理员,否则没人能再管理账户
  const adminCount = Object.values(users).filter(u => u.role === 'admin').length
  if (users[username].role === 'admin' && adminCount <= 1) {
    return { ok: false, error: '至少需要保留一个管理员账户' }
  }
  delete users[username]
  // 该账户的所有会话一并作废,否则被删掉的人照样能用旧 token 继续访问
  for (const [token, s] of [...sessions.entries()]) {
    if (s && s.username === username) sessions.delete(token)
  }
  persistSessions()
  persistUsers()
  // 删光账户后 authEnabled 必须跟着变,否则会锁死:仍要求登录却没有任何账户能登录
  authEnabled = Object.keys(users).length > 0
  return { ok: true }
}

const changePassword = (username, newPassword) => {
  if (!users[username]) return { ok: false, error: '用户不存在' }
  if (!validPassword(newPassword)) return { ok: false, error: '密码至少 4 位' }
  users[username].salt = crypto.randomBytes(16).toString('hex')
  users[username].hash = hashPassword(newPassword, users[username].salt)
  // 改密码后把该账户的旧会话全部作废(否则密码改了、旧 token 还能继续用)
  for (const [token, s] of [...sessions.entries()]) {
    if (s && s.username === username) sessions.delete(token)
  }
  persistSessions()
  persistUsers()
  return { ok: true }
}

const verify = (username, password) => {
  const u = users[username]
  if (!u) return null
  const got = Buffer.from(hashPassword(password, u.salt), 'hex')
  const want = Buffer.from(String(u.hash || ''), 'hex')
  // 常量时间比较(长度不同直接判否,避免抛异常)
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null
  return { username, role: u.role }
}

const createSession = (user) => {
  const token = crypto.randomBytes(32).toString('hex')
  sessions.set(token, { username: user.username, role: user.role, expires: Date.now() + TOKEN_TTL })
  persistSessions()
  return token
}

const getSession = (token) => {
  if (!token) return null
  const s = sessions.get(token)
  if (!s) return null
  // 账户被删掉的会话立即失效(否则旧 token 还能继续用)
  if (!s.username || !users[s.username]) {
    sessions.delete(token)
    persistSessions()
    return null
  }
  const now = Date.now()
  if (now > s.expires) {
    sessions.delete(token)
    persistSessions()
    return null
  }
  // 滑动续期:用掉一半有效期就把服务端过期时间也续满,
  // 否则 cookie 一直在续期、服务端却会在一年后突然失效(用户莫名掉登录)
  if (s.expires - now < TOKEN_TTL / 2) {
    s.expires = now + TOKEN_TTL
    persistSessions()
  }
  return s
}

const destroySession = (token) => {
  sessions.delete(token)
  persistSessions()
}

const listUsers = () => Object.entries(users).map(([username, u]) => ({ username, role: u.role }))

// 桌面版「保持登录」:重启后从 sessions.json 里挑一个仍然有效、且账户还在的会话,
// 直接恢复成已登录状态 —— 用户不必每次开客户端都重新输密码,
// 只有主动点「退出登录」才会失效。
const restoreLastSession = () => {
  const now = Date.now()
  let best = null
  for (const [token, s] of sessions.entries()) {
    if (!s || !s.username || !s.expires || s.expires <= now) continue
    if (!users[s.username]) continue // 账户已被删除的会话作废
    if (!best || s.expires > best.session.expires) best = { token, session: s }
  }
  if (!best) return null
  return {
    username: best.session.username,
    role: best.session.role || (users[best.session.username] || {}).role || 'viewer',
    token: best.token,
  }
}

module.exports = {
  loadUsers,
  addUser,
  removeUser,
  changePassword,
  verify,
  createSession,
  getSession,
  destroySession,
  listUsers,
  restoreLastSession,
  isEnabled: () => authEnabled,
}
