// 封面取色:给「混合背景」用 —— 把封面缩到 8x8 后在 Canvas 上取平均色与最鲜艳色
// (思路参考开源的 ColorThief / node-vibrant,这里只保留需要的一点点逻辑,不引依赖)
export function extractCoverColors (src) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !src) { resolve(null); return }
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const size = 8
          const canvas = document.createElement('canvas')
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(img, 0, 0, size, size)
          const data = ctx.getImageData(0, 0, size, size).data
          let r = 0, g = 0, b = 0, n = 0
          let vivid = null, vividScore = -1
          for (let i = 0; i < data.length; i += 4) {
            const rr = data[i], gg = data[i + 1], bb = data[i + 2], aa = data[i + 3]
            if (aa < 128) continue
            r += rr; g += gg; b += bb; n++
            const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb)
            const sat = max === 0 ? 0 : (max - min) / max
            const score = sat * (max / 255)
            if (score > vividScore) { vividScore = score; vivid = [rr, gg, bb] }
          }
          if (!n) { resolve(null); return }
          resolve({ average: [Math.round(r / n), Math.round(g / n), Math.round(b / n)], vivid: vivid || null })
        } catch (e) {
          // 跨域图片会污染 canvas(getImageData 抛错),这种时候放弃取色
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = src
    } catch (e) { resolve(null) }
  })
}

export function buildMixGradient (colors, dark) {
  if (!colors) return ''
  const toRgb = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`
  const vivid = colors.vivid || colors.average
  const avg = colors.average
  const base = dark ? '#0d0d0d' : '#ffffff'
  return `linear-gradient(160deg, ${toRgb(vivid, 0.85)} 0%, ${toRgb(avg, 0.92)} 42%, ${base} 100%)`
}

// 真降采样:把图片缩到 targetWidth 宽再返回 dataURL —— 显示时它天然就是「块状像素」,
// 比纯 CSS 的 image-rendering 可靠(高分辨率原图直接缩放是看不出像素感的)
// 像素化参数参考 https://www.image2pixel.app/ 的「块大小 / 颜色数量 / 显示网格 / 算法」
//   blockSize   2–20,越大块越粗(输出宽度 = 原宽 / blockSize)
//   colorCount  2–64,量化到多少色;<=1 表示不量化
//   showGrid    是否显示网格(网格由 CSS 覆盖层画,这里把行列数写回元素)
//   algorithm   average(块平均) / center(中心像素采样) / dither(平均 + Floyd–Steinberg 抖动) / none(只降采样不量化)
export function pixelateToDataUrl (src, options = {}) {
  const {
    blockSize = 4,
    colorCount = 32,
    algorithm = 'average',
  } = options || {}
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !src) { resolve(null); return }
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const naturalW = img.naturalWidth || 0
          const block = Math.max(2, Math.min(20, Math.round(Number(blockSize) || 4)))
          let w = naturalW > 0 ? Math.round(naturalW / block) : 64
          w = Math.max(12, Math.min(240, w))
          const h = Math.max(12, Math.round(((img.naturalHeight || 1) / (naturalW || 1)) * w))
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          // 中心像素采样:关掉平滑,让浏览器直接取最近的源像素
          ctx.imageSmoothingEnabled = algorithm !== 'center'
          ctx.drawImage(img, 0, 0, w, h)
          const colors = Math.max(0, Math.min(64, Math.round(Number(colorCount) || 0)))
          if (algorithm !== 'none' && colors >= 2) {
            try {
              const imageData = ctx.getImageData(0, 0, w, h)
              quantize(imageData, colors, algorithm === 'dither')
              ctx.putImageData(imageData, 0, 0)
            } catch (e) { /* 跨域污染时跳过量化 */ }
          }
          resolve({ dataUrl: canvas.toDataURL('image/png'), cols: w, rows: h })
        } catch (e) { resolve(null) }
      }
      img.onerror = () => resolve(null)
      img.src = src
    } catch (e) { resolve(null) }
  })
}

// 调色板量化:每通道取 levels 档(levels ≈ 立方根(颜色数)),可选 Floyd–Steinberg 误差扩散
function quantize (imageData, colorCount, dither) {
  const data = imageData.data
  const w = imageData.width
  const h = imageData.height
  const levels = Math.max(2, Math.round(Math.cbrt(colorCount)))
  const step = 255 / (levels - 1)
  const snap = (v) => Math.round(v / step) * step
  if (!dither) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = snap(data[i])
      data[i + 1] = snap(data[i + 1])
      data[i + 2] = snap(data[i + 2])
    }
    return
  }
  // Floyd–Steinberg:把量化误差按 7/16、3/16、5/16、1/16 扩散到邻近像素
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      for (let c = 0; c < 3; c++) {
        const oldV = data[i + c]
        const newV = snap(oldV)
        data[i + c] = newV
        const err = oldV - newV
        const push = (dx, dy, k) => {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) return
          data[(ny * w + nx) * 4 + c] += err * k
        }
        push(1, 0, 7 / 16)
        push(-1, 1, 3 / 16)
        push(0, 1, 5 / 16)
        push(1, 1, 1 / 16)
      }
    }
  }
}
