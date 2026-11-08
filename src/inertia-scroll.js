// 类 macOS 惯性滚动(全局版)
// 拦截容器上的滚轮事件:滚动时叠加"速度",滚轮停止后按摩擦系数继续滑行,
// 产生 Mac 触摸板那种"松手后继续滑动"的效果;滚动到顶/底时停住。
// 力度由 设置 → 扫描与性能 →「惯性滑动」控制(开关 + 摩擦系数/最大速度/跟手灵敏度)。
//
// 两种挂载方式:
//   1) attachInertiaScroll(el, { getParams, getAxis, shouldIntercept })
//      —— 单个容器。阅读器这种「轴随模式变、部分模式不能接管」的才需要单独挂。
//   2) attachGlobalInertia({ getParams })
//      —— 文档级兜底:鼠标落在哪个可滚动容器上就滚哪个。
//         侧边详情栏 / 下载记录栏 / 文件夹树 / 各种弹窗 / 下拉 / 嵌套列表全自动覆盖,
//         以后新加滚动区也不用再记得来这里挂一次。
//
// 两者共存:局部挂载的容器先处理并给事件打标记(HANDLED_FLAG),全局层见标记就跳过,不会滚两次。
//
// 滚动链:从事件目标向上找「该方向还能继续滚」的最近祖先 ——
// 内层滚到头自动交给外层,外层到顶自动交回内层,和浏览器原生滚动链一致。
// 以前外层无脑 preventDefault,设置页里 .all-tags-list / .feature-content 这类内嵌列表
// 滚轮一格不动(滚的是整页),就是缺了这一步。
//
// 豁免:任何元素加 data-no-inertia 属性,它和它的子树都交回原生
// (文字阅读模式的正文就是这样 —— 那边正文自己接管滚轮)。

const PRESETS = {
  off: { friction: 0, maxVelocity: 0, deltaScale: 0 },
  verylow: { friction: 0.86, maxVelocity: 600, deltaScale: 0.55 },
  low: { friction: 0.90, maxVelocity: 900, deltaScale: 0.7 },
  medium: { friction: 0.93, maxVelocity: 1500, deltaScale: 0.85 },
  high: { friction: 0.95, maxVelocity: 2400, deltaScale: 1.0 },
  veryhigh: { friction: 0.965, maxVelocity: 3300, deltaScale: 1.15 },
}

const MIN_VELOCITY = 0.3   // 低于此速度停止滑行
const SMOOTH_FOLLOW = 0.3  // 默认速度跟随系数(越小越跟手)
const EDGE_EPS = 2         // 判定"到头/不到头"的容差(px),亚像素布局下别太严
const HANDLED_FLAG = '__emmInertiaHandled'
const NO_INERTIA_ATTR = 'data-no-inertia'
const OVERFLOW_OK = { auto: true, scroll: true, overlay: true }

// 参数统一解析:
//   新设置传「物理参数对象」 { enabled, friction, maxVelocity, follow, deltaScale }
//   旧设置仍可传字符串档位(off / verylow / ... / veryhigh),行为不变。
const clampNum = (x, min, max, fallback) => {
  const n = Number(x)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
const resolveParams = (v) => {
  if (v && typeof v === 'object') {
    return {
      off: v.enabled === false || v.off === true,
      friction: clampNum(v.friction, 0.5, 0.995, 0.93),
      maxVelocity: clampNum(v.maxVelocity, 100, 8000, 1500),
      deltaScale: clampNum(v.deltaScale, 0.1, 3, 0.85),
      follow: clampNum(v.follow, 0.02, 0.95, SMOOTH_FOLLOW),
    }
  }
  const preset = PRESETS[v] || PRESETS.medium
  return {
    off: v === 'off',
    friction: preset.friction,
    maxVelocity: preset.maxVelocity,
    deltaScale: preset.deltaScale,
    follow: SMOOTH_FOLLOW,
  }
}

// ---------- 滚动链工具 ----------
const isEl = (n) => !!n && n.nodeType === 1
const overflowOk = (v) => !!OVERFLOW_OK[v]

const axisOverflowOk = (el, axis) => {
  const cs = getComputedStyle(el)
  return overflowOk(axis === 'x' ? cs.overflowX : cs.overflowY)
}
const axisRange = (el, axis) => (axis === 'x'
  ? el.scrollWidth - el.clientWidth
  : el.scrollHeight - el.clientHeight)
const axisPos = (el, axis) => (axis === 'x' ? el.scrollLeft : el.scrollTop)
const writeAxisPos = (el, axis, v) => { if (axis === 'x') el.scrollLeft = v; else el.scrollTop = v }

// 该元素在这个方向上「还能不能继续滚」:确实有溢出,而且没贴在那一侧的边界
const canScrollIn = (el, axis, forward) => {
  if (!isEl(el)) return false
  if (el.hasAttribute(NO_INERTIA_ATTR)) return false
  if (!axisOverflowOk(el, axis)) return false
  const range = axisRange(el, axis)
  if (range <= EDGE_EPS) return false
  const pos = axisPos(el, axis)
  return forward ? pos < range - EDGE_EPS : pos > EDGE_EPS
}

// 事件目标到 boundary(不含)之间,有没有「这个方向还能滚」的内层容器。
// 有 → 让内层自己滚,外层一个字都别动(否则就是抢滚轮)。
const innerCanScroll = (start, boundary, axis, forward) => {
  let node = isEl(start) ? start : (start && start.parentElement)
  while (isEl(node) && node !== boundary) {
    if (node.hasAttribute(NO_INERTIA_ATTR)) return true // 明确要求原生接管,谁都别插
    if (canScrollIn(node, axis, forward)) return true
    node = node.parentElement
  }
  return false
}

// 事件目标向上找第一个「该方向还能滚、且没有局部挂载」的容器(全局兜底层用)
const findScrollTarget = (start, axis, forward) => {
  let node = isEl(start) ? start : (start && start.parentElement)
  while (isEl(node) && node !== document.documentElement) {
    if (node.hasAttribute(NO_INERTIA_ATTR)) return null
    if (!node.__inertiaAttached && canScrollIn(node, axis, forward)) return node
    node = node.parentElement
  }
  return null
}

// ---------- 单个容器的惯性引擎 ----------
const createEngine = (el, options = {}) => {
  const getLevel = typeof options.getLevel === 'function' ? options.getLevel : () => 'medium'
  const getParams = typeof options.getParams === 'function' ? options.getParams : null
  const readParams = () => resolveParams(getParams ? getParams() : getLevel())
  const fixedAxis = typeof options.getAxis === 'function' ? options.getAxis : null
  const shouldIntercept = typeof options.shouldIntercept === 'function' ? options.shouldIntercept : () => true

  let velocity = 0
  let rafId = null
  let lastStepAt = 0
  let axis = 'y'

  const stop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  const step = (nowStamp) => {
    const now = typeof nowStamp === 'number' ? nowStamp : performance.now()
    // 按「真实帧间隔」做归一化衰减:掉一帧不会多衰减一次,末端速度更均匀
    const dt = lastStepAt ? Math.min(64, now - lastStepAt) : 16.7
    lastStepAt = now
    const params = readParams()
    velocity *= Math.pow(params.friction, dt / 16.7)
    if (Math.abs(velocity) < MIN_VELOCITY) {
      velocity = 0
      rafId = null
      return
    }
    const maxScroll = axisRange(el, axis)
    const next = axisPos(el, axis) + velocity
    if (next <= 0 || next >= maxScroll) {
      // 到顶/底:贴住边界并「立刻停止」。
      // 旧写法是 velocity *= 0.5 后继续每帧跑,直到速度低于阈值 ——
      // 那几十帧原地空转就是用户感觉到的「末端卡顿」。
      writeAxisPos(el, axis, next <= 0 ? 0 : maxScroll)
      velocity = 0
      rafId = null
      return
    }
    writeAxisPos(el, axis, next)
    rafId = requestAnimationFrame(step)
  }

  // 返回 true 表示这次滚轮已被本引擎接管
  const handleWheel = (event, axisOverride) => {
    if (event[HANDLED_FLAG]) return false
    // 组合键(如 Ctrl+滚轮缩放)不拦截
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false
    const params = readParams()
    if (params.off) return false

    // 轴:阅读器这类由 fixedAxis 决定;其余按「哪边占主导 + 容器本身能否横向滚」推
    const dominant = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? 'x' : 'y'
    const ax = axisOverride || (fixedAxis ? fixedAxis() : (dominant === 'x' && axisOverflowOk(el, 'x') ? 'x' : 'y'))

    // 纵向容器:横向为主的滚轮(触摸板横滑)不拦截
    if (ax === 'y' && Math.abs(event.deltaX) > Math.abs(event.deltaY)) return false

    const raw = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (!raw) return false
    const forward = raw > 0

    // 内层还能滚 → 让内层处理(它自己有引擎会先接管,没有就交给全局层/原生)
    if (innerCanScroll(event.target, el, ax, forward)) return false
    // 自己这个方向已经到头(或根本滚不动)→ 不拦,交回原生做滚动链传递
    if (!canScrollIn(el, ax, forward)) {
      stop()
      return false
    }
    if (!shouldIntercept()) return false

    event.preventDefault()
    event[HANDLED_FLAG] = true
    axis = ax

    stop()
    const delta = raw * (event.deltaMode === 1 ? 16 : 1) * params.deltaScale
    const next = axisPos(el, axis) + delta
    const maxScroll = axisRange(el, axis)
    writeAxisPos(el, axis, next <= 0 ? 0 : next >= maxScroll ? maxScroll : next)
    velocity = velocity * (1 - params.follow) + delta * params.follow
    if (Math.abs(velocity) > params.maxVelocity) {
      velocity = Math.sign(velocity) * params.maxVelocity
    }
    lastStepAt = 0 // 重新计时,第一帧按 ~16.7ms 归一化
    rafId = requestAnimationFrame(step)
    return true
  }

  return { handleWheel, stop }
}

// 给指定容器挂载惯性滚动(单容器 API)。返回 detach 函数。
const attachInertiaScroll = (el, options = {}) => {
  if (!el || el.__inertiaAttached) return () => {}
  el.__inertiaAttached = true

  const engine = createEngine(el, options)
  const onWheel = (e) => { engine.handleWheel(e) }

  el.addEventListener('wheel', onWheel, { passive: false })
  return () => {
    el.removeEventListener('wheel', onWheel)
    engine.stop()
    el.__inertiaAttached = false
  }
}

// 给指定容器(含 el-scrollbar 内部滚动层)批量挂载惯性滚动
const attachInertiaScrollTo = (root, selectors, options) => {
  const detachers = []
  if (!root) return () => {}
  const targets = selectors
    .map(sel => root.querySelectorAll(sel))
    .flatMap(list => Array.from(list))
  for (const el of targets) {
    detachers.push(attachInertiaScroll(el, options))
  }
  return () => detachers.forEach(d => d())
}

// ---------- 全局兜底层 ----------
// 文档级一个监听:鼠标落在哪个可滚动容器上,就给哪个容器做惯性。
// 局部挂载过的容器(有 __inertiaAttached)会被跳过 —— 它们在自己的监听里已经处理完了。
let globalDetach = null
const attachGlobalInertia = (options = {}) => {
  if (globalDetach) return globalDetach
  const getParams = typeof options.getParams === 'function' ? options.getParams : () => 'medium'
  const shouldIntercept = typeof options.shouldIntercept === 'function' ? options.shouldIntercept : () => true
  const engines = new WeakMap()

  const onWheel = (event) => {
    // 已经有人处理过(局部挂载的容器、阅读器翻页、Ctrl+缩放……)就别再滚一次
    if (event[HANDLED_FLAG] || event.defaultPrevented) return
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    if (resolveParams(getParams()).off) return
    if (!shouldIntercept(event)) return
    // 输入类控件(多行文本 / 可编辑区)自己会滚,别接管 —— 打字时被惯性带着跑很难受。
    // 它们滚不动时 return 也不影响原生滚到父级(没 preventDefault)。
    const t = event.target
    if (isEl(t) && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return

    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    const axis = horizontal ? 'x' : 'y'
    const forward = horizontal ? event.deltaX > 0 : event.deltaY > 0
    const target = findScrollTarget(event.target, axis, forward)
    if (!target) return

    let engine = engines.get(target)
    if (!engine) {
      engine = createEngine(target, { getParams })
      engines.set(target, engine)
    }
    engine.handleWheel(event, axis)
  }

  document.addEventListener('wheel', onWheel, { passive: false })
  globalDetach = () => {
    document.removeEventListener('wheel', onWheel)
    globalDetach = null
  }
  return globalDetach
}

export { attachInertiaScroll, attachInertiaScrollTo, attachGlobalInertia }
