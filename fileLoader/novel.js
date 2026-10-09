// txt 小说 / epub 支持
// - txt : 纯文本,没有图 → 用书名渲染一张文字封面;阅读时按"文字模式"渲染
// - epub: 本质是 zip(OEBPS 里放 xhtml + 图片) → 带图的当 zip 读图,纯文字的抽正文
// 刻意不依赖 electron,便于独立测试。
const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')
const sharp = require('sharp')
const _ = require('lodash')
const { nanoid } = require('nanoid')

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']
const TEXT_EXTS = ['.txt']
// epub 里表示"一页/一章"的文件
const EPUB_DOC_EXTS = ['.xhtml', '.html', '.htm']

const isNovelName = (name) => TEXT_EXTS.includes(path.extname(name).toLowerCase())
const isEpubName = (name) => path.extname(name).toLowerCase() === '.epub'
const isImageEntry = (name) => IMAGE_EXTS.includes(path.extname(name).toLowerCase())

// ── 文本解码:按 BOM 判断;没有 BOM 时先按 UTF-8 试,出现替换字符再退回 GBK ──
const decodeTextBuffer = (buf) => {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3).toString('utf-8')
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.slice(2).toString('utf16le')
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    // UTF-16BE:手工按 16 位交换后交给 utf16le
    const swapped = Buffer.from(buf.slice(2))
    for (let i = 0; i + 1 < swapped.length; i += 2) {
      const t = swapped[i]; swapped[i] = swapped[i + 1]; swapped[i + 1] = t
    }
    return swapped.toString('utf16le')
  }
  const asUtf8 = buf.toString('utf-8')
  // 替换字符数量是判断"这不是 UTF-8"的实用信号
  const bad = (asUtf8.match(/\uFFFD/g) || []).length
  if (bad === 0) return asUtf8
  try {
    return new TextDecoder('gbk').decode(buf)
  } catch (e) {
    return asUtf8
  }
}

// 每页约 1000 字(仅用于卡片上的页数展示与进度估算)
const NOVEL_CHARS_PER_PAGE = 1000

// ── 纯文本:读文件 → 字数 → 分页数 → 渲染文字封面 ──
const solveBookTypeNovel = async (filepath, TEMP_PATH, COVER_PATH, coverName) => {
  const stat = await fs.promises.stat(filepath)
  let text = ''
  try {
    const buf = await fs.promises.readFile(filepath)
    text = decodeTextBuffer(buf)
  } catch (e) { /* 读不到就按空文本处理,书仍然入库 */ }
  const pageCount = Math.max(1, Math.ceil(text.replace(/\s/g, '').length / NOVEL_CHARS_PER_PAGE))

  let coverPath = coverName
  if (coverName === null) {
    coverPath = null // 懒加载:不生成封面文件
  } else if (coverName === undefined) {
    coverPath = path.join(COVER_PATH, nanoid() + '.webp')
  }
  if (coverPath) {
    await renderTextCover(path.basename(filepath, path.extname(filepath)), coverPath)
  }
  return {
    targetFilePath: filepath,
    coverPath,
    tempCoverPath: null,
    pageCount,
    bundleSize: stat.size,
    mtime: stat.mtime,
    coverHash: null,
    novelText: text
  }
}

// ── 用书名渲染一张文字封面(没有图片的 txt 也不会出现"破图") ──
const escapeXml = (s) => String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]))
const wrapText = (s, perLine, maxLines) => {
  const out = []
  let cur = ''
  for (const ch of Array.from(String(s))) {
    cur += ch
    if (cur.length >= perLine) { out.push(cur); cur = '' }
    if (out.length >= maxLines) break
  }
  if (cur && out.length < maxLines) out.push(cur)
  return out
}
const renderTextCover = async (title, destPath, width = 500, height = 707) => {
  const lines = wrapText(String(title || 'TXT'), 11, 7)
  const lineHeight = 46
  const startY = height / 2 - ((lines.length - 1) * lineHeight) / 2
  const tspans = lines.map((l, i) =>
    `<tspan x="50%" y="${startY + i * lineHeight}">${escapeXml(l)}</tspan>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#3a3f47"/><stop offset="100%" stop-color="#22252a"/>
  </linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text fill="#e8e8e8" font-size="36" font-family="sans-serif" text-anchor="middle" font-weight="600">${tspans}</text>
  <text x="50%" y="${height - 40}" fill="#9aa0a6" font-size="22" font-family="sans-serif" text-anchor="middle">TXT</text>
</svg>`
  await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(destPath)
  return destPath
}

// ── epub:当 zip 处理,取出图片清单 / 封面 / 章节数 ──
const readEpubEntries = (filepath) => {
  const zip = new AdmZip(filepath)
  const names = zip.getEntries().map(e => e.entryName)
  const images = names.filter(isImageEntry)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  const docs = names.filter(n => EPUB_DOC_EXTS.includes(path.extname(n).toLowerCase()))
  return { zip, names, images, docs }
}
const pickEpubCover = (images) => {
  if (!images.length) return null
  // 优先名字里带 cover 的(epub 规范里常见 cover.jpg / images/cover.jpeg)
  return images.find(n => /cover/i.test(path.basename(n))) || images[0]
}
const solveBookTypeEpub = async (filepath, TEMP_PATH, COVER_PATH, coverName) => {
  const stat = await fs.promises.stat(filepath)
  const { zip, images, docs } = readEpubEntries(filepath)
  const tempFolder = path.join(TEMP_PATH, nanoid(8))
  let tempCoverPath = null
  const coverEntry = pickEpubCover(images)
  if (coverEntry) {
    zip.extractEntryTo(coverEntry, tempFolder, true, true)
    tempCoverPath = path.join(tempFolder, coverEntry)
  }
  let coverPath = null
  if (coverName !== null) {
    coverPath = coverName === undefined ? path.join(COVER_PATH, nanoid() + '.webp') : coverName
    if (tempCoverPath) {
      await sharp(tempCoverPath, { failOnError: false }).webp({ quality: 82 }).toFile(coverPath)
    } else {
      // 纯文字 epub:没有图 → 用书名渲染文字封面
      await renderTextCover(path.basename(filepath, '.epub'), coverPath)
    }
  }
  // 页数:带图的按图片数,纯文字按章节数
  const pageCount = images.length > 0 ? images.length : Math.max(1, docs.length)
  return {
    targetFilePath: filepath,
    coverPath,
    tempCoverPath,
    pageCount,
    bundleSize: stat.size,
    mtime: stat.mtime,
    coverHash: null,
    epubImages: images,
    epubDocs: docs
  }
}

// ── 阅读:epub 的图片按顺序提取(复用现有图片阅读器) ──
const getImageListFromEpub = async (filepath, VIEWER_PATH) => {
  const { zip, images } = readEpubEntries(filepath)
  if (!images.length) return []
  const folder = path.join(VIEWER_PATH, nanoid(8))
  fs.mkdirSync(folder, { recursive: true })
  const out = []
  for (const name of images) {
    // maintainEntryPath=true → 会按包内目录结构解压,所以返回路径也要按同样结构拼
    zip.extractEntryTo(name, folder, true, true)
    // 必须与 folder/zip/archive 的返回结构一致:{ relativePath, absolutePath }
    // (阅读器按 item.absolutePath 取图,返回纯字符串会让它崩)
    out.push({
      relativePath: String(name).split('/').pop(),
      absolutePath: path.join(folder, ...String(name).split('/'))
    })
  }
  return out
}

// ── 阅读:取 epub 正文(纯文字 epub 用) ──
const getEpubText = async (filepath) => {
  const { zip, docs } = readEpubEntries(filepath)
  const parts = []
  for (const d of docs) {
    try {
      const buf = zip.readFile(d)
      if (!buf) continue
      const html = decodeTextBuffer(buf)
      const text = html
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
        .replace(/<\/p>|<br\s*\/?>|<\/div>|<\/h[1-6]>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
        .trim()
      if (text) parts.push(text)
    } catch (e) { /* 单章失败跳过 */ }
  }
  return parts.join('\n\n')
}


// ────────────────────────────────────────────────────────────────
// 结构化解析:产出「内容块」序列,让前端把插图插在它原本的位置上
//   { kind:'chapter', title }           章标题(同时进目录)
//   { kind:'heading', text, level }     h1~h6
//   { kind:'text',    text }            正文段落
//   { kind:'image',   absolutePath }    插图(已解压到 dumpDir,前端用 /api/file 取)
// ────────────────────────────────────────────────────────────────
const decodeEntities = (t) => String(t || '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
const stripTags = (t) => decodeEntities(String(t || '').replace(/<[^>]*>/g, '')).replace(/[ \t]+/g, ' ').trim()
const resolveEntry = (baseEntry, src) => {
  let rel = String(src || '').split('#')[0].split('?')[0]
  try { rel = decodeURIComponent(rel) } catch (e) { /* 原样 */ }
  if (!rel) return ''
  if (rel.startsWith('/')) return rel.slice(1)
  const baseDir = baseEntry.includes('/') ? baseEntry.slice(0, baseEntry.lastIndexOf('/')) : ''
  const parts = (baseDir ? baseDir.split('/') : []).concat(rel.split('/'))
  const out = []
  for (const p of parts) {
    if (!p || p === '.') continue
    if (p === '..') out.pop()
    else out.push(p)
  }
  return out.join('/')
}

// 把一个 xhtml 拆成内容块;插图按需解压到 dumpDir 并回填绝对路径
const parseXhtmlBlocks = (zip, entryName, html, dumpDir, imageOut) => {
  const blocks = []
  // 先按块级标签切,再逐个判断是标题/段落/图片
  const cleaned = String(html || '')
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  const re = /<(h[1-6]|p|div|img|figure|blockquote|li)\b([^>]*)>([\s\S]*?)(?:<\/\1>|$)/gi
  let m
  while ((m = re.exec(cleaned)) !== null) {
    const tag = m[1].toLowerCase()
    const attrs = m[2] || ''
    const inner = m[3] || ''
    if (tag === 'img') {
      const srcMatch = /src\s*=\s*["']([^"']+)["']/i.exec(attrs)
      if (srcMatch) pushImage(blocks, resolveEntry(entryName, srcMatch[1]), imageOut)
      continue
    }
    // 块内可能还有 <img>(例如 <p><img src=.../></p>)
    const imgRe = /<img\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi
    let im
    let lastIndex = 0
    let hadImage = false
    while ((im = imgRe.exec(inner)) !== null) {
      hadImage = true
      const before = stripTags(inner.slice(lastIndex, im.index))
      if (before) blocks.push({ kind: 'text', text: before })
      pushImage(blocks, resolveEntry(entryName, im[1]), imageOut)
      lastIndex = im.index + im[0].length
    }
    const rest = stripTags(hadImage ? inner.slice(lastIndex) : inner)
    if (rest) blocks.push(/^h[1-6]$/.test(tag) ? { kind: 'heading', text: rest, level: Number(tag[1]) } : { kind: 'text', text: rest })
  }
  return blocks
}
const pushImage = (blocks, entry, imageOut) => {
  if (!entry) return
  const hit = imageOut.get(entry)
  if (hit) blocks.push({ kind: 'image', absolutePath: hit })
}

// 章节标题行:第N章 / 第N节 / 第N回 / Chapter N 等
// 章节标题行:第N章 / 第N节 / 第N回 / Chapter N 等
const isChapterLine = (l) => l.length <= 40 && (
  /^第[0-9一二三四五六七八九十百千万零两〇]+[章节回卷篇部集]/.test(l) ||
  l.indexOf('Chapter ') === 0 || l.indexOf('CHAPTER ') === 0
)
const parseEpubStructured = async (filepath, dumpDir) => {
  const { zip, images, docs } = readEpubEntries(filepath)
  fs.mkdirSync(dumpDir, { recursive: true })
  // 按需解压:只有被正文引用到的图片才落盘
  const imageOut = new Map()
  const ensureImage = (entry) => {
    if (!entry) return null
    if (imageOut.has(entry)) return imageOut.get(entry)
    const target = path.join(dumpDir, ...entry.split('/'))
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      zip.extractEntryTo(entry, path.dirname(target), false, true)
      // extractEntryTo(maintainEntryPath=false) 会平铺到目标目录 → 用 basename 找
      const flat = path.join(path.dirname(target), path.basename(entry))
      const real = fs.existsSync(flat) ? flat : target
      imageOut.set(entry, real)
      return real
    } catch (e) {
      imageOut.set(entry, null)
      return null
    }
  }
  const blocks = []
  const chapters = []
  const source = docs
  for (const doc of source) {
    let html = ''
    try {
      const buf = zip.readFile(doc)
      html = buf ? decodeTextBuffer(buf) : ''
    } catch (e) { continue }
    if (!html) continue
    const docBlocks = parseXhtmlBlocks(zip, doc, html, dumpDir, {
      get: (entry) => ensureImage(entry),
      has: (entry) => imageOut.has(entry),
    })
    // 给这一章起个名字:第一个 heading 或文件名
    const firstHeading = docBlocks.find(b => b.kind === 'heading' || b.kind === 'chapter')
    const title = firstHeading ? firstHeading.text : path.basename(doc).replace(/\.[^.]+$/, '')
    blocks.push({ kind: 'chapter', title })
    chapters.push({ title, blockIndex: blocks.length - 1 })
    // 章标题已经在上面作为 chapter 块推过:文档里那个同名标题不再重复渲染
    for (const b of docBlocks) {
      if (b.kind === 'heading' && String(b.text).trim() === String(title).trim()) continue
      blocks.push(b)
    }
  }
  // 没有任何图片被引用 → 已经全部是文字
  return { blocks, chapters }
}

// txt → 内容块(空行分段 + 章节行识别)
const parseTxtStructured = async (filepath) => {
  const buf = await fs.promises.readFile(filepath)
  const text = String(decodeTextBuffer(buf) || '').replace(/\r\n?/g, '\n')
  const blocks = []
  const chapters = []
  let pending = []
  const flush = () => {
    const t = pending.join('\n').trim()
    if (t) blocks.push({ kind: 'text', text: t })
    pending = []
  }
  for (const line of text.split('\n')) {
    const l = line.trim()
    if (!l) { flush(); continue }
    if (isChapterLine(l)) {
      flush()
      blocks.push({ kind: 'chapter', title: l })
      chapters.push({ title: l, blockIndex: blocks.length - 1 })
      continue
    }
    pending.push(line)
  }
  flush()
  return { blocks, chapters }
}
module.exports = {
  isNovelName,
  isEpubName,
  solveBookTypeNovel,
  solveBookTypeEpub,
  getImageListFromEpub,
  getEpubText,
  decodeTextBuffer,
  renderTextCover,
  parseEpubStructured,
  parseTxtStructured,
  NOVEL_CHARS_PER_PAGE
}
