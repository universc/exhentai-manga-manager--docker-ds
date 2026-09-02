// 类 macOS 惯性滚动
// 拦截容器上的滚轮事件:滚动时叠加"速度",滚轮停止后按摩擦系数继续滑行,
// 产生 Mac 触摸板那种"松手后继续滑动"的效果;滚动到顶/底时微微反弹。
// 力度可通过 setting.scrollInertiaLevel 自定义:off / low / medium / high
// 用法: attachInertiaScroll(el, { getLevel }) 返回 detach 函数。

const PRESETS = {
  off: { friction: 0, maxVelocity: 0, deltaScale: 0 },
  low: { friction: 0.90, maxVelocity: 900, deltaScale: 0.7 },
  medium: { friction: 0.93, maxVelocity: 1500, deltaScale: 0.85 },
  high: { friction: 0.95, maxVelocity: 2400, deltaScale: 1.0 },
}

const MIN_VELOCITY = 0.3   // 低于此速度停止滑行
const SMOOTH_FOLLOW = 0.3  // 速度跟随系数(越小越跟手)

const attachInertiaScroll = (el, options = {}) => {
  if (!el || el.__inertiaAttached) return () => {}
  el.__inertiaAttached = true

  const getLevel = typeof options.getLevel === 'function' ? options.getLevel : () => 'medium'
  const shouldIntercept = typeof options.shouldIntercept === 'function' ? options.shouldIntercept : () => true

  let velocity = 0
  let rafId = null

  const stop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  const step = () => {
    const preset = PRESETS[getLevel()] || PRESETS.medium
    velocity *= preset.friction
    if (Math.abs(velocity) < MIN_VELOCITY) {
      rafId = null
      return
    }
    const maxScroll = el.scrollHeight - el.clientHeight
    const next = el.scrollTop + velocity
    if (next <= 0 || next >= maxScroll) {
      // 到顶/底:贴住边界,速度快速衰减,缓缓停止(不反弹)
      el.scrollTop = next <= 0 ? 0 : maxScroll
      velocity *= 0.5
      if (Math.abs(velocity) < MIN_VELOCITY) {
        velocity = 0
        rafId = null
        return
      }
      rafId = requestAnimationFrame(step)
      return
    }
    el.scrollTop = next
    rafId = requestAnimationFrame(step)
  }

  const onWheel = (e) => {
    // 组合键(如 Ctrl+滚轮缩放)不拦截
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
    const level = getLevel()
    if (level === 'off') return
    // 只拦截纵向滚动
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
    const maxScroll = el.scrollHeight - el.clientHeight
    if (maxScroll <= 0) return // 无可滚动内容,交给原生
    if (!shouldIntercept()) return

    e.preventDefault()
    stop()
    const preset = PRESETS[level] || PRESETS.medium
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1) * preset.deltaScale
    const next = el.scrollTop + delta
    el.scrollTop = next <= 0 ? 0 : next >= maxScroll ? maxScroll : next
    velocity = velocity * (1 - SMOOTH_FOLLOW) + delta * SMOOTH_FOLLOW
    if (Math.abs(velocity) > preset.maxVelocity) {
      velocity = Math.sign(velocity) * preset.maxVelocity
    }
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
