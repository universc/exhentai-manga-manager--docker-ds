// 类 macOS 惯性滚动
// 拦截容器上的滚轮事件:滚动时叠加"速度",滚轮停止后按摩擦系数继续滑行,
// 产生 Mac 触摸板那种"松手后继续滑动"的效果;滚动到顶/底时微微反弹。
// 力度可通过 setting.scrollInertiaLevel 自定义:off / low / medium / high
// 用法: attachInertiaScroll(el, { getLevel }) 返回 detach 函数。

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

const attachInertiaScroll = (el, options = {}) => {
  if (!el || el.__inertiaAttached) return () => {}
  el.__inertiaAttached = true

  const getLevel = typeof options.getLevel === 'function' ? options.getLevel : () => 'medium'
  const getParams = typeof options.getParams === 'function' ? options.getParams : null
  const readParams = () => (getParams ? resolveParams(getParams()) : resolveParams(getLevel()))
  const shouldIntercept = typeof options.shouldIntercept === 'function' ? options.shouldIntercept : () => true

  let velocity = 0
  let rafId = null

  const stop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  // 滚动轴:默认纵向;横向整排(图片卷轴的左右/右左)按横向来
  const getAxis = typeof options.getAxis === 'function' ? options.getAxis : () => 'y'
  const readPos = () => (getAxis() === 'x' ? el.scrollLeft : el.scrollTop)
  const writePos = (v) => { if (getAxis() === 'x') el.scrollLeft = v; else el.scrollTop = v }
  const maxPos = () => (getAxis() === 'x' ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight)

  let lastStepAt = 0
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
    const maxScroll = maxPos()
    const next = readPos() + velocity
    if (next <= 0 || next >= maxScroll) {
      // 到顶/底:贴住边界并「立刻停止」。
      // 旧写法是 velocity *= 0.5 后继续每帧跑,直到速度低于阈值 ——
      // 那几十帧原地空转就是用户感觉到的「末端卡顿」。
      writePos(next <= 0 ? 0 : maxScroll)
      velocity = 0
      rafId = null
      return
    }
    writePos(next)
    rafId = requestAnimationFrame(step)
  }

  const onWheel = (e) => {
    // 组合键(如 Ctrl+滚轮缩放)不拦截
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
    const params = readParams()
    if (params.off) return
    const axis = getAxis()
    // 纵向时,横向为主的滚轮(触摸板横滑)不拦截
    if (axis === 'y' && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
    const maxScroll = maxPos()
    if (maxScroll <= 0) return // 无可滚动内容,交给原生
    if (!shouldIntercept()) return

    e.preventDefault()
    stop()
    const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    const delta = raw * (e.deltaMode === 1 ? 16 : 1) * params.deltaScale
    const next = readPos() + delta
    writePos(next <= 0 ? 0 : next >= maxScroll ? maxScroll : next)
    velocity = velocity * (1 - params.follow) + delta * params.follow
    if (Math.abs(velocity) > params.maxVelocity) {
      velocity = Math.sign(velocity) * params.maxVelocity
    }
    lastStepAt = 0 // 重新计时,第一帧按 ~16.7ms 归一化
    rafId = requestAnimationFrame(step)
  }

  el.addEventListener('wheel', onWheel, { passive: false })
  return () => {
    el.removeEventListener('wheel', onWheel)
    stop()
    el.__inertiaAttached = false
  }
}

// 给指定容器(含 el-scrollbar 内部滚动层)挂载惯性滚动
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

export { attachInertiaScroll, attachInertiaScrollTo }
