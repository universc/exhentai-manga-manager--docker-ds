// 漫画库列表(多库)数据层 —— 第二十七轮「只读兼容层」
//
// 背景:旧版只有一个 setting.library(单值),index.js 里有 30+ 处直接读它。
// 本轮只做数据结构与迁移,不改任何扫描/删除逻辑:
//   1. setting.libraries 描述所有漫画库([{ id, name, path, dataPath }]);
//   2. 启动时若没有 libraries,用旧的 setting.library 自动迁移出一个「默认库」(名字取文件夹名);
//   3. setting.library 继续同步为「当前活动库」的路径 —— 老代码读 setting.library 行为完全不变;
//   4. libraries 目前只被读取/记录日志,不参与扫描,方便下一轮把快照/库数据库/缓存切到 per-library。
//
// 说明:dataPath 留空 = 用默认库数据目录 <数据存放目录>/libraries/<库名>/;
//       用户以后可为单个库指定自定义路径(本层已支持读取,尚未提供 UI)。

const path = require('path')
const crypto = require('crypto')

// 每个库默认的数据目录所在子目录名
const LIBRARIES_DIR = 'libraries'

// 稳定的库 id(纯 ASCII,避免中文/空格带来的路径与 URL 问题)
const newLibraryId = () => 'lib-' + crypto.randomBytes(5).toString('hex')

const isWindowsPath = (p) => /^[A-Za-z]:[\\/]/.test(String(p || ''))

// 路径去重用的归一化 key(忽略结尾分隔符与大小写)
const normalizePathKey = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase()

// 从库路径取一个默认库名(文件夹名)
const libraryNameFromPath = (libPath, index = 0) => {
  const base = path.basename(String(libPath || '').replace(/[\\/]+$/, ''))
  return base || `漫画库${index + 1}`
}

// 目录名清洗:去掉非法字符与结尾点/空格,规避 Windows 保留名
const safeDirName = (name) => {
  let n = String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(n)) n = '_' + n
  return n || 'library'
}

// 某个库的数据目录:用户自定义优先,否则 <数据存放目录>/libraries/<库名>/
const libraryDataDir = (storePath, lib) => {
  const custom = String(lib && lib.dataPath ? lib.dataPath : '').trim()
  if (custom) return custom
  const name = safeDirName((lib && (lib.name || lib.id)) || 'library')
  return path.join(storePath, LIBRARIES_DIR, name)
}

// 只读兼容层:规范化 setting.libraries,必要时从 setting.library 迁移;返回本次是否发生迁移/变更
const ensureLibraries = (setting) => {
  const before = JSON.stringify({
    libraries: setting.libraries === undefined ? null : setting.libraries,
    activeLibraryId: setting.activeLibraryId === undefined ? null : setting.activeLibraryId,
    library: setting.library === undefined ? null : setting.library
  })

  const raw = Array.isArray(setting.libraries) ? setting.libraries : []
  const list = []
  const seen = new Set()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const p = String(item.path || '').trim()
    if (!p) continue
    const key = normalizePathKey(p)
    if (seen.has(key)) continue
    seen.add(key)
    list.push({
      id: String(item.id || '') || newLibraryId(),
      name: String(item.name || '').trim() || libraryNameFromPath(p, list.length),
      path: p,
      dataPath: typeof item.dataPath === 'string' ? item.dataPath : ''
    })
  }

  const state = { migrated: false, changed: false, active: null }

  // 旧版单库 → 默认库
  if (!list.length) {
    const legacy = String(setting.library || '').trim()
    if (legacy) {
      list.push({ id: newLibraryId(), name: libraryNameFromPath(legacy, 0), path: legacy, dataPath: '' })
      state.migrated = true
    }
  }

  // 活动库:优先 activeLibraryId,失效则退回第一个
  let active = list.find(l => l.id === setting.activeLibraryId) || null
  if (!active) active = list[0] || null
  // 旧字段优先:设置页现在改的仍是 setting.library,把它同步进活动库;
  // 反过来(库列表存在但 library 为空)则用活动库路径回填 setting.library,保证老代码可用。
  if (active) {
    const legacy = String(setting.library || '').trim()
    if (legacy) active.path = legacy
    else setting.library = active.path
  }
  state.active = active

  setting.libraries = list.map(l => ({ id: l.id, name: l.name, path: l.path, dataPath: l.dataPath }))
  setting.activeLibraryId = active ? active.id : ''

  const after = JSON.stringify({
    libraries: setting.libraries,
    activeLibraryId: setting.activeLibraryId,
    library: setting.library === undefined ? null : setting.library
  })
  state.changed = before !== after
  return state
}

module.exports = {
  LIBRARIES_DIR,
  newLibraryId,
  isWindowsPath,
  normalizePathKey,
  libraryNameFromPath,
  safeDirName,
  libraryDataDir,
  ensureLibraries
}
