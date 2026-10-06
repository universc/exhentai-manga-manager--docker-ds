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
