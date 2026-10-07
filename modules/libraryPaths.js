// 跨端路径翻译(桌面 Windows <-> 网页/容器) —— 按「库」的 path / pathWeb 双向映射。
// 约定:数据库里的 filepath 统一按「桌面(Windows)形式」保存(= 该库 path 的前缀);
//       网页端读写时按同一个库的 pathWeb 做双向映射。
// 库按名字归并(modules/libraries.js),所以两端同名库的两组路径一定在同一条记录里。
// 纯函数:不依赖 electron / fs,可以单独跑测试。
const toPosixPath = (s) => String(s || '').replace(/\\/g, '/').replace(/\/+$/, '')
// p 以 root 开头时返回相对部分(可能为空串),否则 null
const stripPathRoot = (p, root) => {
  const P = toPosixPath(p)
  const R = toPosixPath(root)
  if (!R) return null
  const cp = process.platform === 'win32' ? P.toLowerCase() : P
  const cr = process.platform === 'win32' ? R.toLowerCase() : R
  if (cp === cr) return ''
  if (!cp.startsWith(cr + '/')) return null
  return P.slice(R.length).replace(/^\/+/, '')
}
// 按目标根的风格(反斜杠 / 斜杠)拼回绝对路径
const joinPathRoot = (root, rel) => {
  const r = String(root || '').replace(/[\\/]+$/, '')
  const sep = r.includes('\\') ? '\\' : '/'
  const seg = String(rel || '').replace(/^[\\/]+/, '').replace(/[\\/]+/g, sep)
  return seg ? r + sep + seg : r
}
// 本端形式 → 规范(桌面)形式:写库前调用
const externalizeBookPath = (p, libraries, isWeb) => {
  if (!p) return p
  for (const lib of (Array.isArray(libraries) ? libraries : [])) {
    const desk = String(lib.path || '').trim()
    const web = String(lib.pathWeb || '').trim()
    if (!desk || !web || web === desk) continue
    const rel = stripPathRoot(p, web)
    if (rel !== null) return joinPathRoot(desk, rel)
  }
  return p
}
// 规范(桌面)形式 → 本端形式:读库展示 / 取图前调用
const localizeBookPath = (p, libraries, isWeb) => {
  if (!p) return p
  for (const lib of (Array.isArray(libraries) ? libraries : [])) {
    const desk = String(lib.path || '').trim()
    const web = String(lib.pathWeb || '').trim()
    if (!desk || !web || web === desk) continue
    // 网页端:桌面形式 → 容器路径;桌面端:碰巧存成网页形式的,翻回桌面路径
    const rel = stripPathRoot(p, isWeb ? desk : web)
    if (rel !== null) return joinPathRoot(isWeb ? web : desk, rel)
  }
  return p
}
module.exports = { toPosixPath, stripPathRoot, joinPathRoot, externalizeBookPath, localizeBookPath }
