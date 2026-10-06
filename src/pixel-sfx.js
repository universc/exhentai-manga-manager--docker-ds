// 像素风点击音效:用 Web Audio 现场合成方波(思路参考开源库 ZzFX,MIT;这里不引依赖)
// 不打包任何音频文件 —— 既避免版权问题,也不增大安装包
let audioCtx = null
const getCtx = () => {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!audioCtx) audioCtx = new AC()
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
  return audioCtx
}

// 一次很短的 8-bit「哔」声:方波 + 频率下滑 + 指数衰减
export const playPixelClick = () => {
  const ac = getCtx()
  if (!ac) return
  try {
    const t0 = ac.currentTime
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(1180, t0)
    osc.frequency.exponentialRampToValueAtTime(430, t0 + 0.07)
    gain.gain.setValueAtTime(0.045, t0)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09)
    osc.connect(gain)
    gain.connect(ac.destination)
    osc.start(t0)
    osc.stop(t0 + 0.1)
  } catch (e) { /* 忽略 */ }
}

// 只在点到「可交互元素」时响,避免拖选文字/滚动也响
const SFX_SELECTOR = 'button, .el-button, .book-card, .el-switch, .el-checkbox, .el-radio, .el-tabs__item, .el-select, .el-input__wrapper, a, [role="button"], .viewer-thumbnail-item, .sidebar-thumbnail-item'
export const attachPixelSfx = () => {
  if (typeof document === 'undefined') return () => {}
  const handler = (e) => {
    const t = e.target
    if (!t || typeof t.closest !== 'function') return
    if (t.closest(SFX_SELECTOR)) playPixelClick()
  }
  document.addEventListener('click', handler, true)
  return () => document.removeEventListener('click', handler, true)
}
