// 像素风音效组:全部用 Web Audio 现场合成方波/三角波,不打包任何音频文件
// (思路参考开源库 ZzFX,MIT;参数化后按钮/打字/评分/收藏/翻页各有不同音色)
let audioCtx = null
const getCtx = () => {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!audioCtx) audioCtx = new AC()
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
  return audioCtx
}

const tone = ({ type = 'square', from = 880, to = 440, dur = 0.07, gain = 0.045, delay = 0 }) => {
  const ac = getCtx()
  if (!ac) return
  try {
    const t0 = ac.currentTime + delay
    const osc = ac.createOscillator()
    const g = ac.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, t0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur)
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.02)
    osc.connect(g)
    g.connect(ac.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.03)
  } catch (e) { /* 忽略 */ }
}

// 每种操作一套音色
const SOUNDS = {
  click: () => tone({ from: 1180, to: 430, dur: 0.07 }),
  type: () => tone({ from: 1650, to: 1250, dur: 0.025, gain: 0.022 }),
  rate: () => { tone({ from: 900, to: 1350, dur: 0.05 }); tone({ from: 1350, to: 1900, dur: 0.07, gain: 0.03, delay: 0.05 }) },
  mark: () => { tone({ from: 680, to: 1150, dur: 0.07 }); tone({ from: 1250, to: 1750, dur: 0.09, gain: 0.032, delay: 0.06 }) },
  page: () => tone({ type: 'triangle', from: 540, to: 280, dur: 0.09, gain: 0.04 }),
  // 任务完成(超分 / 翻译 / 扫描等):一小段上行的三音琶音
  done: () => { tone({ from: 700, to: 700, dur: 0.06 }); tone({ from: 950, to: 950, dur: 0.06, delay: 0.09 }); tone({ from: 1250, to: 1750, dur: 0.16, gain: 0.05, delay: 0.18 }) },
  open: () => tone({ from: 620, to: 1240, dur: 0.12 }),
}
export const playPixelSfx = (kind) => {
  const fn = SOUNDS[kind] || SOUNDS.click
  fn()
}

const SFX_SELECTOR = 'button, .el-button, .book-card, .el-switch, .el-checkbox, .el-radio, .el-tabs__item, .el-select, .el-input__wrapper, a, [role="button"], .viewer-thumbnail-item, .sidebar-thumbnail-item'

// 只在点到可交互元素时响;评分/收藏/翻页/普通点击用不同音效
export const attachPixelSfx = () => {
  if (typeof document === 'undefined') return () => {}
  const clickHandler = (e) => {
    if (e.button && e.button !== 0) return
    const t = e.target
    // 任何点击都要有声音;只有下面几类换成专属音效
    if (!t || typeof t.closest !== 'function') { playPixelSfx('click'); return }
    if (t.closest('.el-rate')) { playPixelSfx('rate'); return }
    if (t.closest('.book-card-mark, .fill-mark')) { playPixelSfx('mark'); return }
    if (t.closest('.viewer-drawer')) { playPixelSfx('page'); return }
    playPixelSfx('click')
  }
  const keyHandler = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const t = e.target
    const tag = (t && t.tagName) || ''
    // 阅读器里翻页(方向键 / 空格 / PageUp / PageDown)
    if (document.querySelector('.viewer-drawer') && /^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|PageUp|PageDown| )$/.test(e.key || '')) {
      playPixelSfx('page')
      return
    }
    // 输入框里打字
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) playPixelSfx('type')
  }
  document.addEventListener('click', clickHandler, true)
  document.addEventListener('keydown', keyHandler, true)
  return () => {
    document.removeEventListener('click', clickHandler, true)
    document.removeEventListener('keydown', keyHandler, true)
  }
}
