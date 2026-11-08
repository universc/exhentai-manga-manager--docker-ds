// EH 在线首图基准(不依赖 Electron,直接跑 node)
//
// 用法:
//   node scripts/bench-eh-online.js                  # 默认 3 本
//   node scripts/bench-eh-online.js --n 5            # 跑 5 本
//   BENCH_PROXY=http://127.0.0.1:7897 node scripts/bench-eh-online.js
//
// 它量的是「用户真正感觉到的那一段」:
//   详情页 → 首条页链接 → 解析第 1 页图片地址 → 取到第 1 张图字节
// 并对比「旧口径(先全量 sweep 页链接再开工)」与「新口径(详情页内联链接直接开画)」。
//
// 出口说明:本机直连 e-hentai.org 不通,必须走代理;所以有 BENCH_PROXY 就用,
// 没有就尝试系统代理(Windows 注册表 Internet Settings)。
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const ehLogin = require(path.join(ROOT, 'modules', 'ehLogin.js'))
const ehImageCache = require(path.join(ROOT, 'modules', 'ehImageCache.js'))

const t0 = () => Number(process.hrtime.bigint() / 1000000n)
const log = (s) => process.stdout.write(s + '\n')

const argv = process.argv.slice(2)
const argN = (() => {
  const i = argv.indexOf('--n')
  return i >= 0 ? Math.max(1, Number(argv[i + 1]) || 3) : 3
})()

const systemProxy = () => {
  const env = String(process.env.BENCH_PROXY || process.env.HTTPS_PROXY || '').trim()
  if (env) return env
  if (process.platform !== 'win32') return ''
  try {
    const out = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const m = /ProxyServer\s+REG_SZ\s+([^\r\n]+)/i.exec(out)
    if (!m) return ''
    const v = m[1].trim()
    if (!v) return ''
    // 注册表里可能是 "host:port" 或 "http=host:port;https=host:port"
    const https = /https=([^;]+)/i.exec(v)
    const hostPort = https ? https[1] : v.split(';')[0].split('=').pop()
    if (!hostPort) return ''
    return /^[a-z]+:\/\//i.test(hostPort) ? hostPort : 'http://' + hostPort
  } catch (e) { return '' }
}

const grabGallery = (body) => {
  const m = String(body || '').match(/href="(https:\/\/e-hentai\.org\/g\/[0-9]+?\/[0-9a-z]+)"/i)
  return m ? m[1] : ''
}

// 取一张图的字节;失败返回 0(不抛)
const fetchImageBytes = async (url, referer, proxy) => {
  try {
    const r = await ehLogin.request(url, { proxy, raw: true, stream: true, referer, timeout: 25000 })
    if (!r || r.status !== 200) { try { r && r.stream && r.stream.destroy() } catch (e) {} ; return 0 }
    return await new Promise((resolve) => {
      let n = 0
      r.stream.on('data', (c) => { n += c.length })
      r.stream.on('end', () => resolve(n))
      r.stream.on('error', () => resolve(n))
    })
  } catch (e) { return 0 }
}

const main = async () => {
  const proxy = systemProxy()
  log('出口代理: ' + (proxy || '(直连)'))
  log('样本数: ' + argN)
  log('')

  const home = await ehLogin.request('https://e-hentai.org/', { proxy, timeout: 20000 })
  const galleries = []
  const seen = new Set()
  // 注意不要把正则写死成「必须 http 前缀」:首页里 /g/ 链接可能是相对路径或带协议差异
  const re = /href="([^"]*\/g\/[0-9]+?\/[0-9a-z]{10}[^"]*)"/gi
  let m
  while ((m = re.exec(home.body || '')) && galleries.length < argN) {
    // 首页里的链接形态不固定(有绝对也有相对),统一补成绝对地址
    let u = String(m[1] || '').trim()
    if (!u) continue
    if (u.startsWith('//')) u = 'https:' + u
    else if (!/^https?:/i.test(u)) u = 'https://e-hentai.org/' + u.replace(/^\/+/, '')
    if (!/\/g\/[0-9]+?\/[0-9a-z]{10}/i.test(u)) continue
    if (seen.has(u)) continue
    seen.add(u)
    galleries.push(u)
  }
  if (!galleries.length) {
    const body = String(home.body || '')
    log('首页没解析出画廊链接。')
    log('  status=' + home.status + '  bytes=' + body.length)
    log('  title=' + ((/<title>([^<]*)<\/title>/i.exec(body) || [])[1] || '(无)').trim().slice(0, 80))
    log('  /g/ 出现次数=' + (body.match(/\/g\//g) || []).length)
    log('  片段=' + body.replace(/\s+/g, ' ').slice(0, 300))
    process.exit(1)
  }

  const rows = []
  for (const gallery of galleries) {
    let a = t0()
    const quick = await ehLogin.fetchDetailInlineLinks(gallery, { proxy })
    const tQuick = t0() - a

    a = t0()
    const full = await ehLogin.listGalleryPageLinks(gallery, { proxy, limit: 3000, maxPages: 200, batch: 8 })
    const tFull = t0() - a

    const pageLinks = (quick.links && quick.links.length) ? quick.links : full
    if (!pageLinks.length) {
      rows.push({ gallery, ok: false, note: '没有页链接' })
      continue
    }

    // 首图:解析第 1 页 + 取图
    a = t0()
    let info = null
    for (const p of pageLinks.slice(0, 4)) {
      try { info = await ehLogin.resolvePageImageInfo(p, { proxy }); if (info && info.url) break } catch (e) { info = null }
    }
    const tResolve = t0() - a
    const tImg0 = t0()
    const bytes = (info && info.url) ? await fetchImageBytes(info.url, pageLinks[0], proxy) : 0
    const tImg = t0() - tImg0

    // 缓存 key 稳定性:同一图片页再取一次,keystamp 会换,key 应该不变
    let keyStable = null
    try {
      const again = await ehLogin.request(pageLinks[0], { proxy, timeout: 20000 })
      const mm = /<img[^>]*id="img"[^>]*src="([^"]+)"/i.exec(again.body || '')
      if (mm && info && info.url) keyStable = ehImageCache.keyOf(mm[1]) === ehImageCache.keyOf(info.url)
    } catch (e) { keyStable = null }

    rows.push({
      gallery,
      ok: !!bytes,
      pages: quick.total || full.length,
      links: pageLinks.length,
      tQuick, tFull, tResolve, tImg, bytes,
      // 旧口径首图 = 全量 sweep + 解析 + 取图;新口径 = 详情页 + 解析 + 取图
      tOld: tFull + tResolve + tImg,
      tNew: tQuick + tResolve + tImg,
      keyStable
    })
  }

  log('画廊'.padEnd(44) + '页数   详情   全量sweep  解析   取图   旧口径首图  新口径首图  省下')
  for (const r of rows) {
    if (!r.ok) { log(r.gallery.replace('https://e-hentai.org', '').padEnd(44) + ' (失败: ' + r.note + ')'); continue }
    log(
      r.gallery.replace('https://e-hentai.org', '').padEnd(44) +
      String(r.pages).padEnd(6) +
      (r.tQuick + 'ms').padEnd(7) +
      (r.tFull + 'ms').padEnd(11) +
      (r.tResolve + 'ms').padEnd(7) +
      (r.tImg + 'ms').padEnd(7) +
      (r.tOld + 'ms').padEnd(11) +
      (r.tNew + 'ms').padEnd(11) +
      (r.tOld - r.tNew) + 'ms'
    )
  }

  const ok = rows.filter(r => r.ok)
  if (ok.length) {
    const avgOld = Math.round(ok.reduce((s, r) => s + r.tOld, 0) / ok.length)
    const avgNew = Math.round(ok.reduce((s, r) => s + r.tNew, 0) / ok.length)
    log('')
    log('平均: 旧口径首图 ' + avgOld + 'ms  →  新口径首图 ' + avgNew + 'ms  (省 ' + (avgOld - avgNew) + 'ms, ' +
      (avgNew > 0 ? Math.round(avgOld / avgNew * 10) / 10 : '-') + '×)')
    const ks = ok.filter(r => r.keyStable === true).length
    log('缓存 key 稳定性(同一图片页两次取到不同 keystamp): ' + ks + '/' + ok.length + ' 一致')
  } else {
    log('没有一本能取到首图,请检查代理/网络')
    process.exit(1)
  }
}

main().catch((e) => { log('FATAL ' + ((e && e.message) || e)); process.exit(1) })
