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
// ---------- 相对路径(与「哪一端 / 什么盘符」无关的存储形式)----------
// 约定升级:库数据库里的 filepath 存「相对该库根」的相对路径(如 S\大嘘\某本)。
//   · 两端各按自己的库根拼绝对路径:桌面 Y:\01-漫画 + S\大嘘\某本、容器 /library + S/大嘘/某本;
//   · 换盘符 / 换共享 / 换机器都不用再改库,同一份库数据库两端都能直接读;
//   · 老库里的绝对路径仍然照读(见 localizeBookPath),所以升级不需要一次性迁移,
//     新写入的行会逐步变成相对形式(启动时也会把能识别的老行规范化一次)。
const isAbsoluteStoredPath = (p) => {
  const s = String(p || '')
  return /^[A-Za-z]:[\\/]/.test(s) || s.startsWith('\\\\') || s.startsWith('/')
}
// 形如 https://… / emm-eh://… 的值不是磁盘路径(在线漫画的书把 filepath 存成画廊地址):
// 既不能当相对路径去拼库根,也不能当绝对路径处理 —— 一律原样返回。
const isUrlLike = (p) => /^[a-z][a-z0-9+.-]*:\/\//i.test(String(p || ''))
// 本端库根(桌面 = path;网页/容器 = pathWeb,没填就退回 path)。
// 与 modules/libraries.js 的 localLibraryPath 同一规则,这里自己实现一份:
// 本文件要保持「纯函数、不依赖别的模块」,方便单独跑测试。
const localLibraryRoot = (lib, isWeb) => {
  if (!lib) return ''
  const web = isWeb === undefined ? !!process.env.WEB_LIBRARY : !!isWeb
  const desk = String(lib.path || '').trim()
  if (!web) return desk
  return String(lib.pathWeb || '').trim() || desk
}
// 本端绝对路径 → 相对该库根(不在库根下返回 null;正好是库根本身返回 '')
const relativeToLibrary = (p, lib, isWeb) => {
  const root = localLibraryRoot(lib, isWeb)
  if (!root) return null
  const rel = stripPathRoot(p, root)
  return rel === null ? null : rel
}
// 相对路径 → 本端绝对路径
const resolveFromLibrary = (rel, lib, isWeb) => {
  const root = localLibraryRoot(lib, isWeb)
  if (!root) return null
  return joinPathRoot(root, rel)
}
// 本端绝对路径属于哪个库(最长库根优先)
const libraryOwnerOfPath = (p, libraries, isWeb) => {
  let best = null
  let bestLen = -1
  for (const lib of (Array.isArray(libraries) ? libraries : [])) {
    const root = localLibraryRoot(lib, isWeb)
    if (!root || root.length <= bestLen) continue
    if (relativeToLibrary(p, lib, isWeb) !== null) { best = lib; bestLen = root.length }
  }
  return best
}
// 兜底:路径前缀已经不指向任何库根时(换过盘符/共享,例如库里全是 T:\01-漫画\... 而库根是
// Y:\01-漫画),用「库根末尾几段」当锚点,在存下来的路径里从后往前找,取锚点后面的部分当相对路径。
// 只在本库自己的数据库里用(每个库的库只装自己的书),不会把别的库的书错认进来。
const relByRootTailWithRoot = (p, root) => {
  const P = toPosixPath(p).split('/').filter(Boolean)
  const R = toPosixPath(root).split('/').filter(Boolean)
  if (!P.length || !R.length) return null
  const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b)
  const maxTail = Math.min(R.length, 4)
  for (let n = maxTail; n >= 1; n--) {
    const tail = R.slice(R.length - n)
    for (let i = P.length - tail.length; i >= 0; i--) {
      let hit = true
      for (let k = 0; k < tail.length; k++) {
        if (!same(P[i + k], tail[k])) { hit = false; break }
      }
      if (!hit) continue
      const rest = P.slice(i + tail.length)
      if (rest.length) return rest.join('/')
    }
  }
  return null
}
const relByRootTail = (p, lib, isWeb) => relByRootTailWithRoot(p, localLibraryRoot(lib, isWeb))

// 库里存的一行路径 → 「相对该库根」的相对路径(启动时的路径规范化用它):
//   前缀正好是库根 → how='prefix';前缀失效(换过盘符/共享)→ 用库根末尾几段当锚点,how='anchor'。
//   容器端还要拿「另一端的库根」(lib.path,桌面形式)再试一次 —— 老库里存的绝对路径按约定是
//   桌面形式,而容器上算出来的本端库根是 /library,拿它当锚点永远匹配不上(容器根本不知道
//   Windows 侧的文件夹名),这时用 lib.path 里的 '01-漫画' 才是对的锚点。
// 认不出来返回 null —— 调用方保留原值(照旧按绝对路径读),绝不乱改。
const relForStoredPath = (p, lib, isWeb) => {
  if (!p || !isAbsoluteStoredPath(p)) return null
  const web = isWeb === undefined ? !!process.env.WEB_LIBRARY : !!isWeb
  const byPrefix = relativeToLibrary(p, lib, isWeb)
  if (byPrefix !== null && byPrefix !== '') return { rel: byPrefix, how: 'prefix' }
  const anchors = [
    localLibraryRoot(lib, isWeb),
    (web ? String((lib && lib.path) || '') : String((lib && lib.pathWeb) || ''))
  ]
  for (const root of anchors) {
    if (!String(root || '').trim()) continue
    const byAnchor = relByRootTailWithRoot(p, root)
    if (byAnchor) return { rel: byAnchor, how: 'anchor' }
  }
  return null
}

module.exports = {
  toPosixPath, stripPathRoot, joinPathRoot, externalizeBookPath, localizeBookPath,
  isAbsoluteStoredPath, isUrlLike, localLibraryRoot, relativeToLibrary, resolveFromLibrary,
  libraryOwnerOfPath, relByRootTail, relByRootTailWithRoot, relForStoredPath
}
