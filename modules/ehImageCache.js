// 在线图片磁盘缓存(EH 在线读图)
//
// 为什么需要:
//   · 内存缓存只有几百 MB / 30 分钟,关掉阅读器或重启客户端就全没了;
//   · EH 图片 URL 里的 keystamp **实测 5–6 分钟就过期**(过期再取回 403),
//     所以「按完整 URL 做缓存 key」跨会话天然不可靠。
//
// 为什么可以做到长期有效:
//   EH 的图片地址形如
//     https://xxx.hath.network:44000/h/<sha1>-<bytes>-<w>-<h>-wbp/keystamp=...;fileindex=...;xres=.../01.webp
//   其中 /h/ 那一段是**内容寻址**的(实测下载字节的 sha1 与 URL 里的 sha1 完全一致),
//   keystamp / fileindex / xres 只是「这一次的通行证」。
//   把这些噪声抹掉再哈希,得到的 key 既不会因过期失效,也不会因换会话/换进程而失效。
//
// 收益:翻回上一页、重进同一本、网络抖动重试、桌面版与网页版互切 —— 全是本地读盘,不再打 H@H。
//
// 目录放数据目录下(STORE_PATH/ehimgcache),与漫画库无关:换库不影响这份缓存。
const fs = require('fs')
const path = require('path')
const { createHash } = require('crypto')

const DEFAULT_MAX_FILES = 6000
const MAX_BYTES = 4 * 1024 * 1024   // 单张超过 4MB 不落盘(超大图会让缓存迅速膨胀)
// ★ 照 JHenTai 的图片缓存策略:默认 7 天过期 + 启动时清理(logs 之外按 mtime 判)。
//   (JHenTai:lib/src/setting/network_setting.dart:15 imageCacheDurationDays、
//    lib/src/service/schedule_service.dart:164-178 定期清理磁盘缓存)
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

// 类型一律按魔数嗅探,不依赖上游 content-type:
// 「200 但回 HTML」是 EH 的限速页/删图页,绝不能被当成图片写进缓存。
const sniffImageType = (buf) => {
  if (!buf || buf.length < 12) return ''
  const head = buf.slice(0, 12).toString('latin1')
  if (head.slice(0, 3) === '\xff\xd8\xff') return 'image/jpeg'
  if (head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP') return 'image/webp'
  if (head.slice(0, 4) === '\x89PNG') return 'image/png'
  if (head.slice(0, 3) === 'GIF') return 'image/gif'
  return ''
}

// key:抹掉 keystamp / fileindex / xres 后取 md5
//
// ⚠️ 为什么不能用「查询参数」那一套正则一把梭:
//   EH 的 H@H 链接把通行证拼成了**路径段**(不是 ?a=b):
//     /h/<sha1>-<bytes>-<w>-<h>-wbp/keystamp=<ts>-<rand>;fileindex=<n>;xres=<w>/01.webp
//   `keystamp=` 前面是 `/`,而旧的 `([?&;])keystamp=` 要求前置 ? & ; —— 一个都匹配不上,
//   于是 key 里原样带着那个 **5–6 分钟就过期**的通行证:「跨会话/重启命中」这个前提其实是假的
//   (实测:同一个 URL 只换 keystamp,两次 key 不相等 → 必然 miss)。
//   所以这里对路径段写法要连分隔的 '/' 一起吃掉,同时保留末尾的图片文件名。
const keyOf = (url) => {
  const clean = String(url || '')
    // ① 路径段写法 /keystamp=…;fileindex=…;xres=…(三者通常挤在同一段里,一次吃掉)
    .replace(/\/(?:keystamp|fileindex|xres)=[^/?#]*/gi, '')
    // ② 查询串写法 ?keystamp=…&fileindex=…&xres=…
    .replace(/([?&;])(?:keystamp|fileindex|xres)=[^&#;]*/gi, '$1')
    // ② 会留下 '?&&' 这类空分隔符(值相同则残留也相同,不影响命中,但 key 难看/难核对)
    .replace(/[?&;]+$/, '')
  return createHash('md5').update(clean).digest('hex')
}

const createCache = ({ dir }) => {
  // dir 既可以是字符串,也可以是函数 —— 桌面版/网页版的数据目录在切库、切账户时会变,
  // 传函数让缓存目录始终跟着「当前」数据目录走(传字符串会把启动那一刻的路径焊死)。
  const cacheDir = () => {
    try {
      const v = typeof dir === 'function' ? dir() : dir
      return v ? String(v) : ''
    } catch (e) { return '' }
  }
  const fileOf = (url) => path.join(cacheDir(), keyOf(url) + '.bin')

  // ★ 必须 async:缓存命中是「热路径」(翻回上一页会连着命中几十张),
  //   以前用 statSync + readFileSync + utimesSync —— 单张最大 4MB,同步读盘期间
  //   **整个 Electron 主进程**都停住(窗口/其它 IPC 一起卡),网络盘/机械盘上尤其明显。
  const get = async (url, opts = {}) => {
    if (!cacheDir()) return null
    try {
      const f = fileOf(url)
      const ttl = Number.isFinite(opts.ttlMs) ? Number(opts.ttlMs) : DEFAULT_TTL_MS
      if (ttl > 0) {
        // 过期文件当作未命中(JHenTai 也是按天数过期后再删)
        const st = await fs.promises.stat(f)
        if (Date.now() - st.mtimeMs > ttl) return null
      }
      const buf = await fs.promises.readFile(f)
      if (!buf || !buf.length) return null
      const type = sniffImageType(buf)
      if (!type) return null
      // 命中就刷新 mtime:trim 按 mtime 淘汰「最久没用过」的,近似 LRU
      try { const now = new Date(); await fs.promises.utimes(f, now, now) } catch (e) { /* 忽略 */ }
      return { buffer: buf, type }
    } catch (e) { return null }
  }

  const put = (url, buffer) => {
    if (!cacheDir()) return
    if (!buffer || !buffer.length || buffer.length > MAX_BYTES) return
    if (!sniffImageType(buffer)) return
    const d = cacheDir()
    const f = fileOf(url)
    // 异步写,绝不阻塞出图;写失败也不影响这次请求
    fs.promises.mkdir(d, { recursive: true })
      .then(() => fs.promises.writeFile(f, buffer))
      .catch(() => { /* 忽略 */ })
  }

  // 启动清理:先按 TTL 删过期文件,再按容量上限删最旧的 25%(两者都是 JHenTai 的做法)
  const trim = async (maxFiles = DEFAULT_MAX_FILES, ttlMs = DEFAULT_TTL_MS) => {
    const d = cacheDir()
    if (!d) return 0
    try {
      const names = await fs.promises.readdir(d)
      const now = Date.now()
      const stats = []
      let expired = 0
      for (const name of names) {
        try {
          const st = await fs.promises.stat(path.join(d, name))
          // ① TTL 过期:直接删(JHenTai 的 7 天策略)
          if (ttlMs > 0 && now - st.mtimeMs > ttlMs) {
            await fs.promises.unlink(path.join(d, name))
            expired++
            continue
          }
          stats.push({ name, mtime: st.mtimeMs })
        } catch (e) { /* 单个失败不影响其它 */ }
      }
      // ② 容量超限:按 mtime 删最旧的 25%
      let drop = 0
      if (stats.length > maxFiles) {
        stats.sort((a, b) => a.mtime - b.mtime)
        drop = Math.ceil(stats.length * 0.25)
        for (let i = 0; i < drop; i++) {
          try { await fs.promises.unlink(path.join(d, stats[i].name)) } catch (e) { /* 忽略 */ }
        }
      }
      if (expired || drop) console.log('[ehimg] 缓存清理:过期 ' + expired + ' 个,超额 ' + drop + ' 个(上限 ' + maxFiles + ')')
      return expired + drop
    } catch (e) {
      if (e && e.code === 'ENOENT') return 0
      return 0
    }
  }
  return { get, put, trim, keyOf, dir: cacheDir }
}

module.exports = { createCache, keyOf, sniffImageType, DEFAULT_MAX_FILES, MAX_BYTES, DEFAULT_TTL_MS }
