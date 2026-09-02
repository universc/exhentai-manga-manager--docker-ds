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

const TOKEN_TTL = 7 * 24 * 3600 * 1000

const hashPassword = (password, salt) => {
  return crypto.scryptSync(String(password), salt, 32).toString('hex')
}

const validPassword = (password) => String(password || '').length >= 4

// 会话持久化:写/读 <数据目录>/sessions.json,容器重启后保持登录
const persistSessions = () => {
  if (!sessionsFile) return
  try {
    const now = Date.now()
    const alive = [...sessions.entries()].filter(([, s]) => s.expires > now)
    fs.writeFileSync(sessionsFile, JSON.stringify(Object.fromEntries(alive), null, 2), 'utf-8')
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
  try {
    const parsed = JSON.parse(fs.readFileSync(usersFile, 'utf-8'))
    users = parsed.users || {}
  } catch {
    users = {}
  }
  loadSessions()
  if (Object.keys(users).length === 0) {
    const adminUser = process.env.WEB_ADMIN_USER || 'admin'
    const adminPass = process.env.WEB_ADMIN_PASSWORD
    if (adminPass) {
      const salt = crypto.randomBytes(16).toString('hex')
      users[adminUser] = { salt, hash: hashPassword(adminPass, salt), role: 'admin', createdAt: Date.now() }
      persistUsers()
      console.log(`[auth] 已从环境变量创建管理员账户: ${adminUser}(密码已加盐加密存储)`)
    } else {
      console.log('[auth] 未配置 WEB_ADMIN_PASSWORD,账户系统未启用(保持匿名访问)')
    }
  }
  authEnabled = Object.keys(users).length > 0
  return { authEnabled, users: Object.keys(users) }
}

const persistUsers = () => {
  if (!usersFile) return
  fs.writeFileSync(usersFile, JSON.stringify({ users }, null, '  '), 'utf-8')
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
  if (users[username].role === 'admin') return { ok: false, error: '不能删除管理员账户' }
  delete users[username]
  persistUsers()
  return { ok: true }
}

const changePassword = (username, newPassword) => {
  if (!users[username]) return { ok: false, error: '用户不存在' }
  if (!validPassword(newPassword)) return { ok: false, error: '密码至少 4 位' }
  users[username].salt = crypto.randomBytes(16).toString('hex')
  users[username].hash = hashPassword(newPassword, users[username].salt)
  persistUsers()
  return { ok: true }
}

const verify = (username, password) => {
  const u = users[username]
  if (!u) return null
  if (hashPassword(password, u.salt) !== u.hash) return null
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
  if (Date.now() > s.expires) {
    sessions.delete(token)
    persistSessions()
    return null
  }
  return s
}

const destroySession = (token) => {
  sessions.delete(token)
  persistSessions()
}

const listUsers = () => Object.entries(users).map(([username, u]) => ({ username, role: u.role }))

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
  isEnabled: () => authEnabled,
}
