// EH 取图限速器:令牌桶 + 全局熔断冷却(web-server.js 与 index.js 共用)
// 背景:磁盘缓存 key 修复使旧缓存全失效后,服务端用同一出口 IP 高并发补抓几千张图,
// 被 EH 判 excessive request rate 封禁出口 IP(封禁页是 HTML,曾被当图片原样转发 → 全站破图)。
// 这里做两件事:
//   ① 令牌桶:限制「真正打上游」的启动速率(排队的是请求,不是冷却);
//   ② 命中封禁/509 后指数冷却,冷却期内所有取图请求快速失败,绝不排队占并发槽。
'use strict'

const { PassThrough } = require('stream')

// 摘出上游流的前 headLen 字节做魔数嗅探,返回 { head, rest }。
// 调用方把 rest 当作「上游流」继续用(pipe / 整包收集 / 转码):head + 多读的溢出 +
// 剩余字节全部经 rest 原样续传,图片一个字节都不少,也不用把整张图读进内存。
// (不能直接在原流上挂 data 监听"偷看":flowing 模式会把字节真正抽走,
//  read()/unshift() 又在 EOF 后不可用 —— 所以用 PassOver 做桥。)
const sniffUpstreamHead = (stream, headLen = 4096) => new Promise((resolve, reject) => {
  const rest = new PassThrough()
  const chunks = []
  let got = 0
  let settled = false
  const finish = (err) => {
    if (settled) return
    settled = true
    stream.removeListener('data', onData)
    stream.removeListener('end', onEnd)
    stream.removeListener('error', onError)
    if (err) {
      try { stream.destroy() } catch (e) { /* 忽略 */ }
      try { rest.destroy(err) } catch (e) { /* 忽略 */ }
      return reject(err)
    }
    // 嗅探之后原始流的错误要继续传导给 rest,别让下游拿着一条"假死"的流干等
    stream.on('error', (e) => { try { rest.destroy(e) } catch (e2) { /* 忽略 */ } })
    const all = Buffer.concat(chunks)
    resolve({ head: all.subarray(0, Math.min(headLen, all.length)), rest })
  }
  const onData = (chunk) => {
    chunks.push(chunk)
    got += chunk.length
    if (got < headLen) return
    // 摘掉 data 监听前必须先 pause,否则 flowing 模式下的数据会被静默丢弃
    stream.pause()
    finish(null)
    // 已收下的字节(含 head)先写入 rest,再让剩余部分续传
    rest.write(Buffer.concat(chunks))
    stream.pipe(rest)
  }
  // 小响应(< 4KB)会先于阈值触发 end
  const onEnd = () => {
    rest.end(Buffer.concat(chunks))
    finish(null)
  }
  const onError = (e) => finish(e)
  stream.on('data', onData)
  stream.on('end', onEnd)
  stream.on('error', onError)
  // 下游关闭时把原始流一起断掉,别让没人看的连接继续下载
  rest.on('close', () => { try { if (!stream.readableEnded) stream.destroy() } catch (e) { /* 忽略 */ } })
})

// EH 的图只有这四种格式;魔数比 content-type 可信 —— 事故里封禁页 HTML 连
// content-type 都被原样照抄转发过。
const isImageMagic = (b) => {
  if (!b || b.length < 3) return false
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true // JPEG
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true // PNG
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return true // GIF
  return b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP'
}

const BAN_RE = /temporarily banned|bandwidth limit exceeded/i
const isBanPage = (b) => BAN_RE.test(String(b || '').toString('latin1'))

const createEhRateLimiter = ({ perSecond = 8, baseCooldownMs = 60000, maxCooldownMs = 15 * 60 * 1000 } = {}) => {
  // ---- 令牌桶:按 1s 窗口放行,最多 perSecond 次;待发队列而非 busy-loop ----
  const queue = []
  let windowUsed = 0
  let windowTimer = null
  const openWindow = () => {
    windowTimer = setTimeout(() => {
      windowTimer = null
      windowUsed = 0
      pump()
    }, 1000)
    if (windowTimer.unref) windowTimer.unref()
  }
  const pump = () => {
    while (queue.length && windowUsed < perSecond) {
      windowUsed += 1
      queue.shift()()
    }
    if (queue.length && !windowTimer) openWindow()
  }
  const takeToken = () => new Promise((resolve) => {
    queue.push(resolve)
    pump()
  })

  // ---- 熔断:连续命中封禁页 → 冷却 = base × 2^(连续次数-1),封顶 max ----
  let consecutive = 0
  let banUntil = 0
  const noteBan = () => {
    consecutive += 1
    banUntil = Date.now() + Math.min(baseCooldownMs * 2 ** (consecutive - 1), maxCooldownMs)
  }
  // 一次成功取图说明限流已解除,连续次数清零(冷却剩余时间保留,自然到期)
  const noteOk = () => { consecutive = 0 }
  const cooldownLeftMs = () => Math.max(0, banUntil - Date.now())

  return {
    takeToken,
    noteBan,
    noteOk,
    cooldownLeftMs,
    stats: () => ({ banned: cooldownLeftMs() > 0, cooldownLeftMs: cooldownLeftMs(), consecutive, tokens: perSecond - windowUsed })
  }
}

module.exports = { createEhRateLimiter, sniffUpstreamHead, isImageMagic, isBanPage }
