// 网页版(Docker)IP 访问控制
// - 白名单:命中的 IP 免登录直接访问(视为管理员)
// - 黑名单:命中的 IP 拒绝一切请求(无法连接)
// 规则存 <数据目录>/iprules.json:{ "whitelist": ["192.168.1.10", "192.168.1.0/24"], "blacklist": [...] }
// 支持单个 IPv4 与 CIDR 网段;不匹配任何规则则走正常账户登录流程
const fs = require('fs')
const path = require('path')

let rulesFile = ''
let rules = { whitelist: [], blacklist: [] }

const loadRules = (dataDir) => {
  rulesFile = path.join(dataDir, 'iprules.json')
  try {
    rules = JSON.parse(fs.readFileSync(rulesFile, 'utf-8'))
  } catch {
    rules = { whitelist: [], blacklist: [] }
  }
  if (!Array.isArray(rules.whitelist)) rules.whitelist = []
  if (!Array.isArray(rules.blacklist)) rules.blacklist = []
  return rules
}

const persistRules = () => {
  if (!rulesFile) return
  fs.writeFileSync(rulesFile, JSON.stringify(rules, null, '  '), 'utf-8')
}

const ipToInt = (ip) => {
  const parts = String(ip || '').split('.')
  if (parts.length !== 4) return null
  let result = 0
  for (const part of parts) {
    const n = parseInt(part, 10)
    if (isNaN(n) || n < 0 || n > 255) return null
    result = (result << 8) | n
  }
  return result >>> 0
}

// 规则匹配:单个 IP(192.168.1.10)或 CIDR 网段(192.168.1.0/24)
const matchRule = (ip, rule) => {
  const target = String(rule || '').trim()
  if (!target) return false
  const slash = target.indexOf('/')
  if (slash > 0) {
    const base = ipToInt(target.slice(0, slash))
    const bits = parseInt(target.slice(slash + 1), 10)
    const value = ipToInt(ip)
    if (base === null || value === null || isNaN(bits) || bits < 0 || bits > 32) return false
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    return (value & mask) === (base & mask)
  }
  return ip === target
}

const isBlacklisted = (ip) => rules.blacklist.some(rule => matchRule(ip, rule))
const isWhitelisted = (ip) => rules.whitelist.some(rule => matchRule(ip, rule))

const getRules = () => ({
  whitelist: [...rules.whitelist],
  blacklist: [...rules.blacklist],
})

// 校验并保存;非法条目会被剔除并返回提示
const setRules = (whitelist, blacklist) => {
  const clean = (list) => (Array.isArray(list) ? list : [])
    .map(item => String(item || '').trim())
    .filter(item => {
      if (!item) return false
      if (item.includes('/')) {
        const [base, bits] = item.split('/')
        return ipToInt(base) !== null && !isNaN(parseInt(bits, 10)) && parseInt(bits, 10) >= 0 && parseInt(bits, 10) <= 32
      }
      return ipToInt(item) !== null
    })
  rules.whitelist = [...new Set(clean(whitelist))]
  rules.blacklist = [...new Set(clean(blacklist))]
  persistRules()
  return { ok: true, rules: getRules() }
}

module.exports = {
  loadRules,
  isBlacklisted,
  isWhitelisted,
  getRules,
  setRules,
}
