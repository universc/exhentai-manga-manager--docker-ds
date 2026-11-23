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
const { URL } = require('url')
const { request, listGalleryPageLinks, pageCacheDelete } = require('./ehLogin.js')

const DEFAULT_CONCURRENCY = 4
const IMAGE_TIMEOUT = 60000

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// 请求频率节流(照 JHenTai executor 的 Rate(maximum, period)):
//   滑动窗口内最多 maxPerPeriod 个请求,超了就等到窗口滑过去。
//   与「速度限制(KB/s)」是两件事:这个限的是**请求数**,防的是 EH 的限速策略。
const createRequestTicker = (maxPerPeriod, periodSec) => {
  const max = Math.max(0, Number(maxPerPeriod) || 0)
  const periodMs = Math.max(100, (Number(periodSec) || 1) * 1000)
  if (max <= 0) return null
  const stamps = []
  return {
    async acquire () {
      for (;;) {
        const now = Date.now()
        // 丢掉滑出窗口的
        while (stamps.length && now - stamps[0] >= periodMs) stamps.shift()
        if (stamps.length < max) { stamps.push(now); return }
        // 等最老的那次滑出窗口
        const wait = Math.max(20, periodMs - (now - stamps[0]))
        await sleep(Math.min(wait, periodMs))
      }
    }
  }
}

// 全局限速(设置 → 下载设置 → 速度限制)。按「累计字节 / 累计耗时」算平均速度,
// 超了就等一会儿再继续 —— 放在文件粒度就够:图片本身不大,多并发平均下来也很平滑,
// 而且不需要在 request 层改流(JHenTai 也是在下载任务里做节流)。
const createRateLimiter = (bytesPerSec) => {
  const limit = Number(bytesPerSec) || 0
  if (limit <= 0) return null
  let start = Date.now()
  let bytes = 0
  return {
    add: async (n) => {
      bytes += Math.max(0, Number(n) || 0)
      const elapsed = (Date.now() - start) / 1000
      const wait = bytes / limit - elapsed
      if (wait > 0) await sleep(Math.min(wait * 1000, 3000))
      // 空闲很久后重新计一笔,避免攒下大量额度后突然爆发
      if (Date.now() - start > 60000) { start = Date.now(); bytes = 0 }
    }
  }
}

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

// ---------- 文件名补零位数(续传的关键)----------
// ⚠ 以前位数 = String(total).length:同一本第一次收 links 只收到 218 页(3 位 → 001.jpg),
//   后来收全成 1000 页(4 位 → 0001.jpg),续传按新名字去找 → 一个旧文件都匹配不上,
//   于是「整本重下」还留下两套文件(用户看到的就是「继续下载还是从头下」)。
// 现在:位数**固定**,优先级为
//   ① 目录里已有文件的位数(已下好的就是权威,续传才认得上);
//   ② 没有旧文件时:max(4, 总页数的位数) —— 至少 4 位,一本 999 页也写成 0001.jpg。
// 这样换机 / 换版本 / links 收多收少都不会改文件名。
const PAD_MIN = 4
const existingIndexWidth = (dir) => {
  let width = 0
  try {
    for (const f of fs.readdirSync(dir)) {
      const m = /^(\d+)\./.exec(f)
      if (m) width = Math.max(width, m[1].length)
    }
  } catch (e) { /* 目录读不了 → 当没有旧文件 */ }
  return width
}
// 给「单页重下」等外部调用方用:与整本下载同一套位数规则
const indexPad = (dir, total) => {
  const old = dir ? existingIndexWidth(dir) : 0
  return old > 0 ? old : Math.max(PAD_MIN, String(Math.max(0, Number(total) || 0)).length)
}
// 目录里「序号 → 文件名」的索引。按**数值**归一,位数不同也认:
// 老版本写过 001.jpg、新版本写 0001.jpg,续传必须两种都当「已下好」,否则就是整本重下留两套文件。
const buildExistingIndex = (dir) => {
  const map = new Map()
  try {
    for (const f of fs.readdirSync(dir)) {
      const m = /^(\d+)\./.exec(f)
      if (!m) continue
      const n = Number(m[1])
      if (!Number.isFinite(n) || n <= 0 || map.has(n)) continue
      map.set(n, f)
    }
  } catch (e) { /* 目录读不了 → 当没有旧文件 */ }
  return map
}

// ---------- 站点级错误识别(照 JHenTai eh_image_exception_matcher.dart)----------
// JHenTai 把「这一页失败」分成两类:
//   · 页面/节点问题(reParse)        → 换节点重试这一页
//   · 站点/账号问题(pause/pauseAll) → **整本停下来**,别再一页一页去撞 EH
// 实测最要命的是第二条:「This IP address has been temporarily banned due to an excessive
// request rate」——EH 对 IP 封禁时回的是 **HTTP 200 + 一句纯文本**,状态码完全正常。
// 旧实现把它当普通失败,于是每页再原地重试 8 次(退避合计约 19 秒)× 剩下的每一页,
// 一边被 ban 一边继续砸请求,表现就是「最后几张图永远卡在 133/135」。
const SITE_ERROR_PATTERNS = [
  { re: /temporarily banned|excessive request rate|automated mirroring/i, kind: 'banned', message: 'EH 临时封禁了这个 IP(请求过于频繁)。已暂停,等封禁解除后点「继续」。' },
  { re: /You have reached the image limit|not have sufficient GP to buy/i, kind: 'imageLimit', message: '已达图片配额上限,暂停全部下载。' },
  { re: /Downloading original files .* requires GP|requires GP, and you do not have enough/i, kind: 'gp', message: '原图需要 GP 额度,暂停等待额度恢复。' },
  { re: /Invalid token|Invalid request|An error has occurred/i, kind: 'reparse', message: '' }
]
const ehSiteErrorOf = (body) => {
  const s = String(body || '')
  if (!s) return null
  for (const p of SITE_ERROR_PATTERNS) {
    if (p.re.test(s)) return { kind: p.kind, message: p.message }
  }
  return null
}

// 图片页 → { url, originalUrl, reloadKey }
// reloadKey 是页面上「重试」链接里的 nl 值:EH 每个 H@H 节点挂了的时候,重取一次会换一个节点
// (JHenTai gallery_download_task_runner 的 _reParseImageUrlAndDownload 就是靠它换源的)
// ⚠ 换源重试必须能重新请求:request() 会把页面缓存 1 小时(照 JHenTai 的 EHCacheManager),
//   而「限速/封禁页」也是 200 —— 不清缓存的话,8 次重试拿到的全是同一份坏响应,
//   reloadKey 换节点的作用等于没有。JHenTai 是真重试(reParse 先 removeCacheByUrl),
//   所以这里也先清掉这一页的缓存再取。
const resolveImagePage = async (pageUrl, { proxy, cookie, reloadKey = '', fresh = false } = {}) => {
  const u = reloadKey
    ? pageUrl + (pageUrl.includes('?') ? '&' : '?') + 'nl=' + encodeURIComponent(reloadKey)
    : pageUrl
  if (fresh) {
    try { pageCacheDelete(u, cookie) } catch (e) { /* 忽略 */ }
    try { pageCacheDelete(pageUrl, cookie) } catch (e) { /* 忽略 */ }
  }
  const res = await request(u, { proxy, cookie, referer: pageUrl, timeout: 30000 })
  const body = res.body || ''
  const m = /<img[^>]*id="img"[^>]*src="([^"]+)"/i.exec(body) || /<img[^>]*src="([^"]+)"[^>]*id="img"/i.exec(body)
  // 原图:页面上那句「Download original 1280 x 1815」的链接。
  // 拿不到就留空 —— 调用方会退回正常图(与 JHenTai _downloadUrlFor 的兜底一致)。
  const om = /href="(https?:\/\/[^"]+)"[^>]*>[^<]*Download\s+original/i.exec(body)
  const nl = /return\s+nl\('([^']+)'\)/.exec(body)
  const siteErr = ehSiteErrorOf(body)
  return {
    url: m ? m[1] : '', originalUrl: om ? om[1] : '', reloadKey: nl ? nl[1] : '',
    siteError: siteErr
  }
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
  // ⚠ 以前只认 status === 200:H@H / CDN 一跳转(302)就直接抛 "http 302" ——
  //   整本下载里表现为「这一页永远失败」,封面链路上表现为「封面空白」。
  //   request() 已经会跟随 301/302/303/307/308(最多 5 跳),这里再兜一层:
  //   万一还剩 3xx(超过跳数上限等),就按 location 自己再跟两次;状态码则接受全部 2xx。
  let target = String(url || '')
  let res = null
  for (let hop = 0; hop < 3; hop += 1) {
    res = await request(target, { proxy, cookie, referer, raw: true, timeout: IMAGE_TIMEOUT })
    const status = res && res.status
    const location = res && res.headers && res.headers.location
    if (status >= 200 && status < 300) break
    if (/^3\d\d$/.test(String(status)) && location) {
      try { target = new URL(location, target).toString() } catch (e) { break }
      continue
    }
    break
  }
  const status = res && res.status
  if (!res || !(status >= 200 && status < 300) || !res.buffer || !res.buffer.length) {
    throw new Error('http ' + status)
  }
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
  concurrency = DEFAULT_CONCURRENCY, speedLimit = 0, state = {}, onProgress = () => {},
  dir: fixedDir = '', pageCount: knownPageCount = 0, pageRate = 0, pageRateSec = 0,
  // 请求频率限制(照 JHenTai 的 executor Rate(maximum, period)):
  // 每 periodSec 秒最多放 maxPerPeriod 个「取页/下载」请求。0 = 不限。
  maxPerPeriod = 0, periodSec = 1,
  // 进程级闸门(照 JHenTai 的单一 executor):不传就退化成「每本各自限速」(旧行为)。
  // gate.acquire() 管全局请求速率,gate.slot(fn) 管全局并发槽。
  gate = null
} = {}) => {
  if (!galleryUrl) throw new Error('noUrl')
  if (!saveDir) throw new Error('noSaveDir')
  const limiter = createRateLimiter(speedLimit)
  // 请求节流:JHenTai 默认 2 个/秒 —— 这是避免被 EH 限速最直接的一档
  const reqTick = createRequestTicker(maxPerPeriod, periodSec)
  // 页数限速(每 pageRate 页至少间隔 pageRateSec 秒):0 = 不限
  const ratePages = Math.max(0, Number(pageRate) || 0)
  const rateSec = Math.max(0, Number(pageRateSec) || 0)
  const pageLimiter = (ratePages > 0 && rateSec > 0) ? { n: 0, until: 0 } : null
  const pageTick = async () => {
    if (!pageLimiter) return
    pageLimiter.n += 1
    if (pageLimiter.n >= ratePages) {
      const now = Date.now()
      const wait = pageLimiter.until - now
      if (wait > 0) await sleep(Math.min(wait, 60000))
      pageLimiter.n = 0
      pageLimiter.until = Date.now() + rateSec * 1000
    }
  }
  // 收页链接阶段也要报进度:1000+ 页的画廊这一步本身就要十几秒,界面不能只显示 0/0
  const linkStats = {}
  // ⚠️ 注意签名:listGalleryPageLinks(url, options) —— 第 16 轮我改这段时漏掉了第一个参数,
  //    结果 options 被当成 url 传进去,一本都下不了(现象是 4 秒就 noPages)。
  const links = await listGalleryPageLinks(galleryUrl, {
    proxy, cookie, limit: 5000, maxPages: 200, stats: linkStats,
    // 分页请求同样受进程级并发/速率约束(照 JHenTai:它连解析分页都排进同一个 executor)
    gate,
    onPage: (n) => onProgress({ total: 0, done: 0, failed: 0, bytes: 0, phase: 'links', linkCount: n })
  })
  // 一条都没收到时,区分「请求本身失败(限速/网络)」和「页面里确实没有页链接」
  if (!links.length) {
    const detail = String((linkStats && (linkStats.lastError || linkStats.lastEmpty)) || '')
    // ★被封禁/限速时,收页阶段就一个链接都拿不到。这种要按「站点级」处理:
    //   标 waiting 等解封,而不是 failed —— 否则一解封就自动重试的链路断掉。
    const siteErr = ehSiteErrorOf(detail) || ehSiteErrorOf(String((linkStats && linkStats.lastEmpty) || ''))
    if (siteErr && siteErr.kind !== 'reparse') {
      const err = new Error('siteError: ' + siteErr.kind)
      err.siteError = siteErr.kind
      err.siteMessage = siteErr.message
      throw err
    }
    if (linkStats.failed) throw new Error('linksFailed: ' + (detail || 'request failed'))
    if (linkStats.lastEmpty) throw new Error('linksFailed: ' + linkStats.lastEmpty)
    throw new Error('noPages')
  }
  // 目录名:默认**只用清理过的标题**(用户要的:不要 `4264378 - ` 这种前缀)。
  // 只有「同名目录已经存在」时才加 gid 前缀区分,避免两本同名漫画下进同一个文件夹。
  // 另外:如果这本以前已经按 `{gid} - {title}` 下过(断点续传),继续用老目录,不要新建一份。
  let dir = ''
  if (fixedDir) {
    // 任务记录里已经记过目录(第一次下载时定下来的):续传/继续一律用它。
    // 以前每次重新推断,一旦推断出别的名字就新建空目录从头下 —— 已下好的文件被抛在原地。
    dir = path.isAbsolute(fixedDir) ? fixedDir : path.join(saveDir, fixedDir)
    try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { /* 建不了再用推断 */ }
  }
  if (!dir || !fs.existsSync(dir)) {
    const gidMatch = /\/g\/(\d+)\//.exec(galleryUrl)
    const gid = gidMatch ? gidMatch[1] : ''
    const plainName = sanitizeName(title)
    const prefixedName = gid ? gid + ' - ' + plainName : plainName
    let dirName = plainName
    try {
      if (gid && fs.existsSync(path.join(saveDir, prefixedName))) {
        dirName = prefixedName          // 老目录(以前带 gid 下过)→ 续传
      } else if (fs.existsSync(path.join(saveDir, plainName))) {
        // 同名目录已存在:目录里任意一个 "数字.扩展名" 的非空文件就算是本画廊自己的
        let own = false
        try {
          own = fs.readdirSync(path.join(saveDir, plainName)).some(f => /^\d+\.[A-Za-z0-9]+$/.test(f) && fs.statSync(path.join(saveDir, plainName, f)).size > 0)
        } catch (e) { /* 读不了就当不是 */ }
        dirName = own ? plainName : prefixedName
      }
    } catch (e) { /* 读不了目录就当不存在 */ }
    dir = path.join(saveDir, dirName)
  }
  // ★最后一道:最终目录必须在 saveDir 之内。
  //   sanitizeName 只清理 `\ / : * ? " < > |`,不处理 ".." —— 一个标题正好是 ".." 时
  //   path.join(saveDir, '..') 会指到下载目录的上级(再往上是哪就写哪了)。
  //   多账户场景里「只读账户的写范围 = downloadPath」是硬约束,所以在真正 mkdir 之前拦一道。
  const resolvedRoot = path.resolve(saveDir)
  const resolvedDir = path.resolve(dir)
  if (resolvedDir !== resolvedRoot && !resolvedDir.startsWith(resolvedRoot + path.sep)) {
    throw new Error('outsideSaveDir: ' + resolvedDir)
  }
  dir = resolvedDir
  fs.mkdirSync(dir, { recursive: true })

  // links 可能少收(EH 限速/反爬时静默丢页):与 EH 标注页数取大,计数不会出现 done > total
  const total = Math.max(links.length, Number(knownPageCount) || 0)
  // 断点续传的初始计数:**先扫一遍目录里已下好的页**,让进度从真实值开始。
  // ⚠ 只统计「落在 1..total 序号范围内」的文件 —— 以前是 /^0*\d+\./ 全收,
  //   目录里混进超范围的旧文件(换过位数/换过总页数)就会让 done 虚高,把缺口盖住。
  let existingDone = 0
  let existingBytes = 0
  // 实际落地的页集合:收尾时用它算「真正缺哪几页」,不再只靠 failed 计数判断有没有下完
  const havePage = new Set()
  try {
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        const m = /^(\d+)\.[a-z0-9]+$/i.exec(f)
        if (!m) continue
        const n = Number(m[1])
        if (!Number.isFinite(n) || n < 1 || n > total) continue
        const st = fs.statSync(path.join(dir, f))
        if (st.size > 0) { havePage.add(n); existingDone += 1; existingBytes += st.size }
      }
    }
  } catch (e) { /* 读不了就按 0 开始,不影响下载 */
  }
  const update = {
    total, done: existingDone, failed: 0, bytes: existingBytes,
    // EH 标注的真实页数(links 可能少收):上层用它持久化 pageCount,续传时不再丢
    imageCount: Number(knownPageCount) || 0
  }
  onProgress({ ...update, dir })

  // 补零位数固定(见 indexPad 的注释):有旧文件就沿用旧文件的位数,否则至少 4 位
  const pad = indexPad(dir, total)
  // 续传用:目录里已经存在的页(按序号的数值索引,位数不同也认)
  const existingIndex = buildExistingIndex(dir)
  let cursor = 0
  const worker = async () => {
    while (cursor < total) {
      if (state.stopped) return
      const i = cursor++
      const index = i + 1
      const name = String(index).padStart(pad, '0')
      // 超过已知页数的页(links 没收够)没有页地址可下:直接记失败,不再去撞 EH
      if (i >= links.length) { update.failed += 1; update.lastError = '页链接缺失( EH 限速时可能少收 )'; onProgress({ ...update, dir }); continue }
      try {
        // 断点续传:这一页的文件已经下好了(非空)就跳过 —— 暂停后再继续不用从头再来。
        // ⚠️ 这里**不能再** update.done += 1:启动时已经预扫过一遍全部已下好的页(见 existingDone),
        //    再加一次就会重复计数,done 很快超过 total。
        // ⚠️ 用启动时建好的索引(按序号数值匹配):位数不一致(001.jpg / 0001.jpg)也认得上,
        //    而且不用每页都 readdirSync 一次(1000 页 × 整目录扫描 = 明显卡顿)。
        const existing = existingIndex.get(index) || null
        if (existing) {
          const st = fs.statSync(path.join(dir, existing))
          if (st.size > 0) { havePage.add(index); onProgress({ ...update, dir }); continue }
          // 空壳文件(上次下到一半被中断):先删掉,免得这一页最后留下 001.jpg + 0001.jpg 两份
          try { fs.rmSync(path.join(dir, existing), { force: true }) } catch (e) { /* 删不掉就让它留着 */ }
        }
        // 取图 + 下载;失败就按 JHenTai 的办法「重取一次图片页」换一个 H@H 节点重试
        // (实测:同一本里奇数页所在的节点 TLS 直接断,重取后就落到能用的节点上)
        let lastErr = null
        let reloadKey = ''
        // 换源重试次数:EH 的 H@H 节点里确实有死节点,多换几次才能绕开。
        // 以前固定 6 次,但每次只 sleep 400ms —— 节点被限速时这点间隔根本不够,
        // 于是「一页反复失败、最后整本标失败」。改成递增退避(0.4s → 3.2s,最多 8 次)。
        const maxAttempts = 8
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (state.stopped) return
          try {
            // 请求节流:取图片页、下图片各算一个请求(与 JHenTai 的 Rate 一致)
            if (reqTick) await reqTick.acquire()
            if (gate && gate.acquire) await gate.acquire()
            // attempt > 0 = 换节点重试:必须先清掉这一页的页面缓存(照 JHenTai reParse 的 removeCacheByUrl),
            // 否则重试拿到的还是同一份「限速/封禁」页,8 次等于 1 次。
            const info = await resolveImagePage(links[i], { proxy, cookie, reloadKey, fresh: attempt > 0 })
            reloadKey = info.reloadKey || reloadKey
            // ★站点级错误(封禁 / 配额 / 账号问题):照 JHenTai _pauseOnSiteError —— 整本停下来,
            //   别再对剩下的每一页各砸 8 次重试。这是「最后几张永远下不完」最直接的成因:
            //   被 ban 之后继续砸请求,只会在解封前反复失败、把封禁续期。
            if (info.siteError && info.siteError.kind !== 'reparse') {
              const se = info.siteError
              update.lastError = se.message || se.kind
              update.siteBlocked = se.kind
              state.stopped = true
              onProgress({ ...update, dir })
              // 交给外层:标记 waiting,并按 retry 设置自动重试
              const err = new Error('siteError: ' + se.kind)
              err.siteError = se.kind
              throw err
            }
            // 原图:只下原图。**不再退回普通图** —— 用户要的是原图,拿不到就留着让任务等
            // (EH 高峰期会说「需要 GP」,等额度恢复后点「继续」接着下即可)。
            // 只有当这一页压根没有原图链接时才用普通图(那不是失败,是 EH 就没给原图)。
            const target = original ? (info.originalUrl || info.url) : info.url
            if (!target) { lastErr = new Error('noImageUrl'); continue }
            if (reqTick) await reqTick.acquire()
            if (gate && gate.acquire) await gate.acquire()
            // 抢全局并发槽再下:全局槽数 = 设置里的「同时下载数」,不是每本各自一份
            const bytes = gate && gate.slot
              ? await gate.slot(() => downloadFile(target, path.join(dir, name + '.' + extOf(target)), { proxy, cookie, referer: links[i] }))
              : await downloadFile(target, path.join(dir, name + '.' + extOf(target)), { proxy, cookie, referer: links[i] })
            havePage.add(index)
            update.done += 1
            update.bytes += bytes
            if (limiter) await limiter.add(bytes)
            if (pageLimiter) await pageTick()
            lastErr = null
            break
          } catch (e) {
            lastErr = e
            // 站点级错误(见上面的 siteError 分支):整本停,绝不再对剩下的页重试
            if (e && e.siteError) return
            // EH 因为额度/配额拒绝原图(实测回纯文本「Downloading original files … requires GP」):
            // 这不是这一页的问题,是账号额度问题 —— 整本停下来进「等待中」,别再一页页去撞 EH
            if (original && /requires GP|not have enough|gp\b/i.test(String((e && e.message) || ''))) {
              update.gpBlocked = (update.gpBlocked || 0) + 1
              update.lastError = String(e.message)
              state.stopped = true
              onProgress({ ...update, dir })
              return
            }
            // 递增退避:第 n 次失败后等 0.4s * 2^(n-1),上限 3.2s。
            // 给被限速的节点一点恢复时间,比死磕 400ms 成功率高得多。
            const backoff = Math.min(3200, 400 * Math.pow(2, Math.min(attempt, 3)))
            await sleep(backoff)
          }
        }
        if (lastErr) throw lastErr
      } catch (e) {
        // 站点级封禁/配额:不是「这一页失败」,不计数(failed 只记真正的坏页),
        // 标签由上一层置为 waiting 并安排自动重试。
        if (e && e.siteError) {
          update.lastError = e.message
        } else {
          update.failed += 1
          update.lastError = String((e && e.message) || e)
        }
      }
      onProgress({ ...update, dir })
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, total)) }, worker))

  // ★补缺轮:worker 正常跑完后,对「有页链接但磁盘上还没有」的页再补抓一次。
  //   为什么要单独一轮:续传时那些命中已有文件的页全程走 continue,不会发请求,
  //   于是「链接够但文件缺」(上次写盘中断、被查杀删掉、位数不一致)永远补不上,
  //   而 failed 又是 0 —— 表现就是「显示已完成,但页数不够」。
  // ★第一件事:如果缺的页「连页链接都没有」(收页阶段被限速吞掉),先补收一次页链接。
  //   照 JHenTai parseImageHrefTask:哪一页缺,就重新解析覆盖它的那一页缩略图分页;
  //   这里用「整体重收一次」实现,效果等价且实现简单。重收时若撞上封禁,按站点级处理。
  //   不加这一步的话,188-190 这种「压根没有链接」的缺口永远不会触发任何请求,
  //   封禁也就永远检测不到 —— 界面只会显示「还缺 3 页」,用户点继续也没用。
  if (!state.stopped && !update.siteBlocked && havePage.size < total) {
    const needMoreLinks = (() => {
      for (let n = 1; n <= total; n++) if (!havePage.has(n) && n > links.length) return true
      return false
    })()
    if (needMoreLinks) {
      try {
        update.phase = 'links'
        onProgress({ ...update, dir })
        // 用独立的 stats:上一次收页的残留(尤其 lastEmpty)会把这次的结果带偏
        const againStats = {}
        // ★必须先清掉画廊首页/各分页的缓存,否则这次「重收」拿到的还是第一次那份 187 条
        //   (页面缓存 TTL 1 小时),既补不到链接、也看不到封禁 —— 等于白跑一趟。
        for (let pg = 0; pg < 40; pg++) {
          try { pageCacheDelete(pg === 0 ? galleryUrl : galleryUrl + (galleryUrl.includes('?') ? '&' : '?') + 'p=' + pg, cookie) } catch (e) { /* 忽略 */ }
        }
        const again = await listGalleryPageLinks(galleryUrl, {
          proxy, cookie, limit: 5000, maxPages: 200, stats: againStats, gate
        })
        if (again.length > links.length) {
          // 补到的链接追加到后面(前面已解析过的不动,序号含义不变)
          for (let k = links.length; k < again.length; k++) links.push(again[k])
        } else if (!again.length) {
          // ★一条都没补到:先看是不是被封禁/限速(200 + 纯文本),这才是真实原因。
          //   以前这里静默跳过,于是「缺口 + 被封禁」只报成「还缺 3 页」,
          //   用户点「继续」也补不上(每次都被 ban),而自动重试链路也不会启动。
          const detail = String((againStats && (againStats.lastError || againStats.lastEmpty)) || '')
          const siteErr = ehSiteErrorOf(detail)
          if (siteErr && siteErr.kind !== 'reparse') {
            update.siteBlocked = siteErr.kind
            update.lastError = siteErr.message || siteErr.kind
            state.stopped = true
          }
        }
      } catch (e) {
        if (e && e.siteError) {
          update.siteBlocked = e.siteError
          update.lastError = e.siteMessage || e.siteError
          state.stopped = true
        }
      }
      update.phase = ''
    }
  }

  if (!state.stopped && !update.siteBlocked) {
    const retryPages = []
    for (let n = 1; n <= links.length; n++) if (!havePage.has(n)) retryPages.push(n)
    if (retryPages.length) {
      update.phase = 'fill'
      onProgress({ ...update, dir })
      for (const index of retryPages) {
        if (state.stopped || update.siteBlocked) break
        const name = String(index).padStart(pad, '0')
        const pageUrl = links[index - 1]
        try {
          if (reqTick) await reqTick.acquire()
          if (gate && gate.acquire) await gate.acquire()
          const info = await resolveImagePage(pageUrl, { proxy, cookie, fresh: true })
          if (info.siteError && info.siteError.kind !== 'reparse') {
            update.siteBlocked = info.siteError.kind
            update.lastError = info.siteError.message || info.siteError.kind
            state.stopped = true
            break
          }
          const target = original ? (info.originalUrl || info.url) : info.url
          if (!target) { update.failed += 1; update.lastError = 'noImageUrl'; continue }
          if (gate && gate.acquire) await gate.acquire()
          const bytes = await (gate && gate.slot
            ? gate.slot(() => downloadFile(target, path.join(dir, name + '.' + extOf(target)), { proxy, cookie, referer: pageUrl }))
            : downloadFile(target, path.join(dir, name + '.' + extOf(target)), { proxy, cookie, referer: pageUrl }))
          havePage.add(index)
          update.bytes += bytes
          update.done = havePage.size
          onProgress({ ...update, dir })
        } catch (e) {
          update.failed += 1
          update.lastError = String((e && e.message) || e)
          onProgress({ ...update, dir })
        }
      }
      update.phase = ''
    }
  }

  // ★收尾对账:以「磁盘上真实存在的页」为准,而不是只信 done/failed 两个计数器。
  //   这就是「187/190 却显示已完成」的根因 —— 以前只要 failed === 0 就判 done,
  //   而续传时命中已有文件的页全程走 continue(既不 +done 也不 +failed),
  //   缺的几页如果 links 没收全或被限速吞掉,failed 依然是 0。
  const missingPages = []
  for (let n = 1; n <= total; n++) if (!havePage.has(n)) missingPages.push(n)
  update.done = havePage.size
  update.missing = missingPages.length
  if (missingPages.length) {
    // 把缺口压成区间,方便界面/日志一眼看出缺哪几页
    update.missingRanges = (() => {
      const out = []
      let s = missingPages[0]; let prev = missingPages[0]
      for (let k = 1; k < missingPages.length; k++) {
        const n = missingPages[k]
        if (n === prev + 1) { prev = n; continue }
        out.push(s === prev ? String(s) : s + '-' + prev)
        s = n; prev = n
      }
      out.push(s === prev ? String(s) : s + '-' + prev)
      return out.join(',')
    })()
    update.lastError = update.lastError || ('缺 ' + missingPages.length + ' 页: ' + update.missingRanges)
  } else {
    update.missingRanges = ''
  }
  onProgress({ ...update, dir, finished: true, stopped: !!state.stopped })
  return {
    dir, ...update, stopped: !!state.stopped,
    siteBlocked: update.siteBlocked || '',
    missing: missingPages.length
  }
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

module.exports = {
  sanitizeName, extOf, resolveImagePage, downloadFile, runGalleryDownload, downloadOnePage,
  // 滑动窗口请求节流:紳士漫畫下载(index.js 的 wnacg-download)复用同一套算法,
  // 免得两处限速行为不一致。
  createRequestTicker,
  // 文件名位数规则对外暴露:单页重下(index.js 的 eh-download-page-by-index)必须用同一套,
  // 否则「单页重下」会按另一个位数存成第二个文件,整本续传就永远认为这页没下好。
  PAD_MIN, indexPad, buildExistingIndex
}
