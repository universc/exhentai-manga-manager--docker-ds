// EH 在线画廊下载:整本 / 单页,可选「原图」。
//
// 口径来自 JHenTai-8.0.16-334:
//   lib/src/service/gallery_download/gallery_download_task_runner.dart
//     · 每页先取「图片页」(/s/<hash>/<gid>-<n>),再从页里取 <img id="img" src> = 正常图
//     · 原图是同页里那句「Download original ...」的链接(_downloadUrlFor: 原图优先,取不到退正常图)
//   lib/src/service/gallery_download/download_path_resolver.dart
//     · 目录 `{gid} - {清理过的标题}`,文件 `{序号}.{扩展名}`;fullimg.php 那种没有扩展名的原图存 .jpg
//
// 与 JHenTai 的差别(有意):不做多 isolate、不做断点续传的 DB 表;进度与状态存在内存里,
// 记录落在 <数据目录>/downloads.json,够用且好维护。

const fs = require('fs')
const path = require('path')
const { request, listGalleryPageLinks } = require('./ehLogin.js')

const DEFAULT_CONCURRENCY = 4
const IMAGE_TIMEOUT = 60000

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// 文件名/目录名清理:去掉 Windows 不允许的字符(与 JHenTai computeSanitizedGalleryTitle 一致)
const sanitizeName = (s, max = 120) => {
  const t = String(s == null ? '' : s).replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
  return (t || 'untitled').slice(0, max)
}

const extOf = (url) => {
  if (/fullimg\.php/i.test(url)) return 'jpg'
  const last = String(url).split('?')[0].split('/').pop() || ''
  const m = /\.([a-z0-9]{2,5})$/i.exec(last)
  return m ? m[1].toLowerCase() : 'jpg'
}

// 图片页 → { url, originalUrl, reloadKey }
// reloadKey 是页面上「重试」链接里的 nl 值:EH 每个 H@H 节点挂了的时候,重取一次会换一个节点
// (JHenTai gallery_download_task_runner 的 _reParseImageUrlAndDownload 就是靠它换源的)
const resolveImagePage = async (pageUrl, { proxy, cookie, reloadKey = '' } = {}) => {
  const u = reloadKey
    ? pageUrl + (pageUrl.includes('?') ? '&' : '?') + 'nl=' + encodeURIComponent(reloadKey)
    : pageUrl
  const res = await request(u, { proxy, cookie, referer: pageUrl, timeout: 30000 })
  const body = res.body || ''
  const m = /<img[^>]*id="img"[^>]*src="([^"]+)"/i.exec(body) || /<img[^>]*src="([^"]+)"[^>]*id="img"/i.exec(body)
  // 原图:页面上那句「Download original 1280 x 1815」的链接。
  // 拿不到就留空 —— 调用方会退回正常图(与 JHenTai _downloadUrlFor 的兜底一致)。
  const om = /href="(https?:\/\/[^"]+)"[^>]*>[^<]*Download\s+original/i.exec(body)
  const nl = /return\s+nl\('([^']+)'\)/.exec(body)
  return { url: m ? m[1] : '', originalUrl: om ? om[1] : '', reloadKey: nl ? nl[1] : '' }
}

// 下到一个文件。返回字节数。
// EH 出错时会回 HTML 页面,或者回**一句纯文本**并仍然给 200 —— 实测原图在高峰时段需要 GP,
// 回的就是 "Downloading original files ... requires GP" 这种纯文本。所以不能只看状态码,
// 必须按「图片魔数 + 体积」判一次,否则会把错误信息当漫画页存下来(JHenTai 也有对应的
// eh_image_exception_matcher,是同一个意思)。
const isImageBuffer = (buffer, contentType) => {
  if (!buffer || buffer.length < 1024) return false
  const ct = String(contentType || '').toLowerCase()
  if (ct.includes('text/') || ct.includes('html') || ct.includes('json')) return false
  const b = buffer
  return (b[0] === 0xFF && b[1] === 0xD8) // JPEG
    || (b[0] === 0x89 && b[1] === 0x50) // PNG
    || (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) // GIF
    || b.toString('ascii', 0, 4) === 'RIFF' // WEBP
    || (b[0] === 0x42 && b[1] === 0x4D) // BMP
}
const downloadFile = async (url, filePath, { proxy, cookie, referer } = {}) => {
  const res = await request(url, { proxy, cookie, referer, raw: true, timeout: IMAGE_TIMEOUT })
  if (res.status !== 200 || !res.buffer || !res.buffer.length) throw new Error('http ' + res.status)
  if (!isImageBuffer(res.buffer, res.headers && res.headers['content-type'])) {
    const hint = res.buffer.slice(0, 160).toString('utf-8').replace(/\s+/g, ' ').trim()
    throw new Error('notImage: ' + hint)
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, res.buffer)
  return res.buffer.length
}

// 整本下载。state: { stopped:false } 由外面持有,暂停时置 stopped = true。
// onProgress(update) 会被频繁调用(每张图一次),调用方负责节流/合并。
const runGalleryDownload = async ({
  galleryUrl, title, saveDir, original = false, proxy, cookie,
  concurrency = DEFAULT_CONCURRENCY, state = {}, onProgress = () => {}
} = {}) => {
  if (!galleryUrl) throw new Error('noUrl')
  if (!saveDir) throw new Error('noSaveDir')
  // 收页链接阶段也要报进度:1000+ 页的画廊这一步本身就要十几秒,界面不能只显示 0/0
  const linkStats = {}
  // ⚠️ 注意签名:listGalleryPageLinks(url, options) —— 第 16 轮我改这段时漏掉了第一个参数,
  //    结果 options 被当成 url 传进去,一本都下不了(现象是 4 秒就 noPages)。
  const links = await listGalleryPageLinks(galleryUrl, {
    proxy, cookie, limit: 5000, maxPages: 200, stats: linkStats,
    onPage: (n) => onProgress({ total: 0, done: 0, failed: 0, bytes: 0, phase: 'links', linkCount: n })
  })
  // 一条都没收到时,区分「请求本身失败(限速/网络)」和「页面里确实没有页链接」
  if (!links.length) {
    if (linkStats.failed) throw new Error('linksFailed: ' + (linkStats.lastError || 'request failed'))
    if (linkStats.lastEmpty) throw new Error('linksFailed: ' + linkStats.lastEmpty)
    throw new Error('noPages')
  }
  // 目录名:默认**只用清理过的标题**(用户要的:不要 `4264378 - ` 这种前缀)。
  // 只有「同名目录已经存在」时才加 gid 前缀区分,避免两本同名漫画下进同一个文件夹。
  // 另外:如果这本以前已经按 `{gid} - {title}` 下过(断点续传),继续用老目录,不要新建一份。
  const gidMatch = /\/g\/(\d+)\//.exec(galleryUrl)
  const gid = gidMatch ? gidMatch[1] : ''
  const plainName = sanitizeName(title)
  const prefixedName = gid ? gid + ' - ' + plainName : plainName
  let dirName = plainName
  try {
    if (gid && fs.existsSync(path.join(saveDir, prefixedName))) {
      dirName = prefixedName            // 老目录(以前带 gid 下过)→ 续传
    } else if (fs.existsSync(path.join(saveDir, plainName))) {
      // 同名目录已存在:看是不是本画廊自己的(页文件名一致就当是),否则加 gid 区分
      const own = fs.existsSync(path.join(saveDir, plainName, '001.jpg')) ||
        fs.existsSync(path.join(saveDir, plainName, '001.webp')) ||
        fs.existsSync(path.join(saveDir, plainName, '001.png'))
      dirName = own ? plainName : prefixedName
    }
  } catch (e) { /* 读不了目录就当不存在 */ }
  const dir = path.join(saveDir, dirName)
  fs.mkdirSync(dir, { recursive: true })

  const total = links.length
  // 断点续传的初始计数:**先把目录里已下好的页数出来**,让进度从真实值开始。
  // 以前是边扫边数:继续下载后 done 先从 0 往上爬,界面进度条先掉到 0 再回来(用户看到的「短暂失灵」)。
  let existingDone = 0
  let existingBytes = 0
  try {
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (!/^0*\d+\./.test(f)) continue
        const st = fs.statSync(path.join(dir, f))
        if (st.size > 0) { existingDone += 1; existingBytes += st.size }
      }
    }
  } catch (e) { /* 读不了就按 0 开始,不影响下载 */
  }
  const update = { total, done: existingDone, failed: 0, bytes: existingBytes }
  onProgress({ ...update, dir })

  const pad = String(total).length
  let cursor = 0
  const worker = async () => {
    while (cursor < total) {
      if (state.stopped) return
      const i = cursor++
      const index = i + 1
      const name = String(index).padStart(pad, '0')
      try {
        // 断点续传:这一页的文件已经下好了(非空)就跳过 —— 暂停后再继续不用从头再来。
        // ⚠️ 这里**不能再** update.done += 1:启动时已经预扫过一遍全部已下好的页(见 existingDone),
        //    再加一次就会重复计数,done 很快超过 total。
        const existing = fs.existsSync(dir)
          ? fs.readdirSync(dir).find(f => f.startsWith(name + '.') && /^0*\d+\./.test(f))
          : null
        if (existing) {
          const st = fs.statSync(path.join(dir, existing))
          if (st.size > 0) { onProgress({ ...update, dir }); continue }
        }
        // 取图 + 下载;失败就按 JHenTai 的办法「重取一次图片页」换一个 H@H 节点重试
        // (实测:同一本里奇数页所在的节点 TLS 直接断,重取后就落到能用的节点上)
        let lastErr = null
        let reloadKey = ''
        // 6 次换源重试:EH 的 H@H 节点里确实有死节点,多换几次才能绕开(实测 4 次偶尔还差一页)
        for (let attempt = 0; attempt < 6; attempt++) {
          if (state.stopped) return
          try {
            const info = await resolveImagePage(links[i], { proxy, cookie, reloadKey })
            reloadKey = info.reloadKey || reloadKey
            // 原图:只下原图。**不再退回普通图** —— 用户要的是原图,拿不到就留着让任务等
            // (EH 高峰期会说「需要 GP」,等额度恢复后点「继续」接着下即可)。
            // 只有当这一页压根没有原图链接时才用普通图(那不是失败,是 EH 就没给原图)。
            const target = original ? (info.originalUrl || info.url) : info.url
            if (!target) { lastErr = new Error('noImageUrl'); continue }
            const bytes = await downloadFile(target, path.join(dir, name + '.' + extOf(target)), { proxy, cookie, referer: links[i] })
            update.done += 1
            update.bytes += bytes
            lastErr = null
            break
          } catch (e) {
            lastErr = e
            // EH 因为额度/配额拒绝原图(实测回纯文本「Downloading original files … requires GP」):
            // 这不是这一页的问题,是账号额度问题 —— 整本停下来进「等待中」,别再一页页去撞 EH
            if (original && /requires GP|not have enough|gp\b/i.test(String((e && e.message) || ''))) {
              update.gpBlocked = (update.gpBlocked || 0) + 1
              update.lastError = String(e.message)
              state.stopped = true
              onProgress({ ...update, dir })
              return
            }
            await sleep(400)
          }
        }
        if (lastErr) throw lastErr
      } catch (e) {
        update.failed += 1
        update.lastError = String((e && e.message) || e)
      }
      onProgress({ ...update, dir })
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, total)) }, worker))
  onProgress({ ...update, dir, finished: true, stopped: !!state.stopped })
  return { dir, ...update, stopped: !!state.stopped }
}

// 单页下载:url 已经是图片地址(阅读器里解析好的);original 时优先用 originalUrl,
// 没有就现取一次图片页拿原图(JHenTai 的 reParse 同思路)。
// ⚠️ 和整本下载一样要「换源重试」:实测单页也会落在死 H@H 节点上(带非标端口的那些
// TLS 直接断),这时按 pageUrl 重取图片页就能拿到另一个节点的地址。
const downloadOnePage = async ({ url, originalUrl, pageUrl, original = false, saveDir, name, proxy, cookie } = {}) => {
  if (!saveDir) throw new Error('noSaveDir')
  let target = original ? (originalUrl || '') : (url || '')
  let reloadKey = ''
  let lastErr = null
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!target && pageUrl) {
      const r = await resolveImagePage(pageUrl, { proxy, cookie, reloadKey })
      reloadKey = r.reloadKey || reloadKey
      // 原图只下原图,不退回普通图(拿不到就报错,让用户等额度恢复);只有这一页压根没原图链接时才用普通图
      target = original ? (r.originalUrl || r.url) : r.url
    }
    if (target) {
      const filePath = path.join(saveDir, sanitizeName(name) + '.' + extOf(target))
      try {
        const bytes = await downloadFile(target, filePath, { proxy, cookie, referer: pageUrl || url })
        return { path: filePath, bytes }
      } catch (e) {
        lastErr = e
      }
    } else {
      lastErr = lastErr || new Error('noUrl')
    }
    // 换源再试:清掉 target,下一轮靠 pageUrl 重新解析
    target = ''
    if (!pageUrl) break
    await sleep(400)
  }
  throw lastErr || new Error('noUrl')
}

module.exports = { sanitizeName, extOf, resolveImagePage, downloadFile, runGalleryDownload, downloadOnePage }
