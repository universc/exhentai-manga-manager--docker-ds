// 合集自动识别:纯函数模块(便于单测,不依赖 electron)。
//
// 口径参考 JHenTai 的「系列/作者合集」体验,以及 agent 评审给出的加权方案:
//   信号强度  parody(0.90) > 同父目录(0.85) > 标题主干相等(0.80)
//            > 括号内命中 group/artist/parody 标签(0.70) > artist/group 一致(0.45)
//            > character 一致(0.25,单独不成组)
//
// 关键防呆:
//   · 卷号**不参与相似度**,只用于排序;组内卷号全相同 → 判为「重复书」而不是合集
//   · 每本只进一个主合集;作者专辑可作为第二归属(kind='artist')
//   · 少于 3 本不成集(parody 强命中时 2 本也收)
//   · libraryId 是硬隔离,绝不跨库合并

const _ = require('lodash')

// ---------- 标题归一化 ----------
// 去掉:方括号里的语言/汉化/版本标记、圆括号里的年份与版本、卷号、页数、日期、多余标点
const RE_BRACKET = /\[[^\]]*\]/g
const RE_PAREN = /\([^)]*\)/g
const RE_NOISE = [
  /\b(vol|volume|ch|chapter|ep|episode|part|book)\.?\s*\d+\b/gi,
  /第\s*[0-9一二三四五六七八九十百]+\s*[卷话章回集部]/g,
  /\b(v|ver|version)\s*\d+(\.\d+)*\b/gi,
  // 单独的数字区间(1-7 / 01~03):系列合集里常见,不该留在主干里
  /\b\d{1,3}\s*[-~]\s*\d{1,3}\b/g,
  // 裸数字(0712、03 这类日期/卷号编号)
  /\b\d{1,4}\b/g,
  /\b\d{3,4}\s*[x×]\s*\d{3,4}\b/gi,
  /\(\s*\d+\s*(p|pages?|jpg|png|images?)\s*\)/gi,
  /\b\d{4}[-_./]\d{1,2}[-_./]\d{1,2}\b/g,
]
// 卷号:只在「同一系列」内部比较时用,不进相似度
const RE_VOLUME = /(?:\b(?:vol|volume|ch|chapter|ep|episode|part|book)\.?\s*|第\s*)([0-9一二三四五六七八九十百]+)/i

const detectVolume = (title) => {
  const m = RE_VOLUME.exec(String(title || ''))
  if (!m) return null
  const raw = m[1]
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN
  return Number.isFinite(n) ? n : raw
}

// 归一化:返回 { core, brackets, tokens }
//   core     = 可用于比较的主干(小写、去噪、压空白)
//   brackets = 被剥掉的方括号内容(可能含作者/系列名,用于命中标签)
//   tokens   = core 分词
const normalizeTitle = (title) => {
  const raw = String(title || '')
  const brackets = [...raw.matchAll(RE_BRACKET)].map(m => m[0].replace(/^\[|\]$/g, '').trim()).filter(Boolean)
  let s = raw.replace(RE_BRACKET, ' ').replace(RE_PAREN, ' ')
  for (const re of RE_NOISE) s = s.replace(re, ' ')
  // 全角 → 半角
  s = s.replace(/[\u3000-\u303f\uff00-\uffef]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  // 标点 → 空格
  s = s.replace(/[·・~～!！?？,，.。:：;；'"“”‘’\-—_|/\\]+/g, ' ')
  s = s.replace(/\s+/g, ' ').trim().toLowerCase()
  return { core: s, brackets, tokens: s.split(' ').filter(Boolean) }
}

// 多语标题取并集:任一语言命中即算(三语不同不扣分)
const normalizeBookTitles = (book) => {
  const parts = [book.title, book.title_jpn, book.title_cn].map(t => normalizeTitle(t))
  const core = _.uniq(parts.map(p => p.core).filter(Boolean))
  const brackets = _.uniq(_.flatMap(parts.map(p => p.brackets)))
  return { cores: core, brackets }
}

// ---------- 打分 ----------
// Jaccard:两个数组的交并比
const jaccard = (a, b) => {
  const A = new Set((a || []).filter(Boolean))
  const B = new Set((b || []).filter(Boolean))
  if (!A.size && !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter += 1
  const union = A.size + B.size - inter
  return union ? inter / union : 0
}

// 取「这本书所在的容器目录」= 路径的**父目录**。
// ⚠ 以前对文件夹返回的是自身路径,导致「一卷一个文件夹」的系列
//   (SomeSeries/1、SomeSeries/2 …)永远不同目录,系列号永远匹配不上。
//   实际判断系列时应该看它们共同的父目录。
const dirOf = (filepath, isFolder) => {
  const p = String(filepath || '')
  if (!p) return ''
  const norm = p.replace(/[\\/]+$/, '')
  // 文件夹与压缩包都取其父目录
  void isFolder
  const parent = norm.replace(/[\\/][^\\/]*$/, '')
  return parent || norm
}

// 两本之间打分,返回 { score, reasons }
// ctx 里放一些预先算好的东西(避免每对都重算)
const scorePair = (a, b, ctx) => {
  const reasons = []
  let score = 0

  // 权重口径合并了两位评审方案:同容器/父目录与标题主干是最强结构信号,
  // parody 是强语义信号,卷号连续与 artist 是补充证据。
  // ① 同一容器/父目录(0.40)—— 用户手工整理的目录本身就是一种标注
  if (ctx.dirA && ctx.dirA === ctx.dirB) {
    score += 0.40
    reasons.push('same-dir')
    // ② 卷号连续且唯一(0.15):同目录 + 不同卷号 = 几乎确定是同一系列
    const va = ctx.volA, vb = ctx.volB
    if (va != null && vb != null && va !== vb) { score += 0.15; reasons.push('volume-seq') }
  }

  // ③ 标题主干全等(0.35)
  const coreHit = ctx.coresA.some(c => ctx.coresB.includes(c))
  if (coreHit) { score += 0.35; reasons.push('title-core') }
  else {
    // 主干高度相似(不是全等):按词集 Jaccard,过 0.8 才算(0.25 × 比例)
    const sm = Math.max(0, ...ctx.coresA.map(ca => Math.max(0, ...ctx.coresB.map(cb => jaccard(ca.split(' '), cb.split(' '))))))
    if (sm >= 0.8) { score += 0.25 * sm; reasons.push('title-similar') }
  }

  // ④ parody 标签(0.10 × Jaccard;强语义但结构信号已占大头)
  const pj = jaccard(a.tags && a.tags.parody, b.tags && b.tags.parody)
  if (pj > 0) { score += 0.10 * pj; reasons.push('parody') }

  // ⑤ artist 一致(0.10)
  const aj = jaccard(a.tags && a.tags.artist, b.tags && b.tags.artist)
  if (aj > 0) { score += 0.10 * aj; reasons.push('artist') }

  // ⑥ 括号内容命中已有标签(group/artist/parody)(0.10)
  const bracketHit = ctx.bracketsA.some(x => ctx.tagNames.has(String(x).toLowerCase()))
    && ctx.bracketsB.some(x => ctx.tagNames.has(String(x).toLowerCase()))
  if (bracketHit) { score += 0.10; reasons.push('bracket-tag') }

  // ⑦ character 一致(弱,0.05)
  const cj = jaccard(a.tags && a.tags.character, b.tags && b.tags.character)
  if (cj > 0) { score += 0.05 * cj; reasons.push('character') }

  // 惩罚:泛名(無題/杂图/合集)不该被当成系列名
  const GENERIC = /^(无题|無題|杂图|雜圖|合集|collection|various|misc|random)$/i
  if (ctx.coresA.every(c => GENERIC.test(c)) || ctx.coresB.every(c => GENERIC.test(c))) {
    score -= 0.20
    reasons.push('generic-name')
  }

  return { score: Math.max(0, Math.min(1, score)), reasons }
}

// ---------- 聚簇 ----------
// 并查集
const makeDSU = (n) => {
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  const union = (x, y) => { const rx = find(x), ry = find(y); if (rx !== ry) parent[ry] = rx }
  return { find, union }
}

// 锚守门:一个连通分量里必须至少有 1 个「可靠支撑」,否则按锚 key 拆开
//   可靠支撑 = parody 全一致 | 标题主干全等 | 同一父目录
const hasAnchor = (members, ctxs) => {
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const { reasons } = ctxs[i].pairCache[j]
      if (reasons.includes('parody') || reasons.includes('title-core') || reasons.includes('same-dir')) return true
    }
  }
  return false
}

module.exports.normalizeTitle = normalizeTitle
module.exports.normalizeBookTitles = normalizeBookTitles
module.exports.detectVolume = detectVolume
module.exports.jaccard = jaccard
module.exports.dirOf = dirOf
module.exports.scorePair = scorePair
module.exports.makeDSU = makeDSU
module.exports.hasAnchor = hasAnchor

// ---------- 主流程:buildPlan ----------
// 输入 books(书列表),输出候选合集 [{ title, kind, confidence, reasons, books }]
// opts: { libraryId, threshold=0.62 }
const buildPlan = (books, opts = {}) => {
  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : 0.62
  const list = (Array.isArray(books) ? books : []).filter(b => b && !b.isCollection && b.hash && b.filepath)
  if (list.length < 2) return []

  // 预先算好每本的归一化信息
  const meta = list.map(b => {
    const n = normalizeBookTitles(b)
    const isFolder = b.type === 'folder' || /[\\/]$/.test(String(b.filepath || ''))
    return {
      book: b,
      cores: n.cores,
      brackets: n.brackets,
      dir: dirOf(b.filepath, isFolder),
      volume: detectVolume(b.title || b.title_jpn || ''),
      libraryId: b.libraryId || ''
    }
  })

  // 标签名索引(用于「括号内容命中标签」)
  const tagNames = new Set()
  for (const b of list) {
    for (const cat of ['group', 'artist', 'parody']) {
      for (const t of ((b.tags && b.tags[cat]) || [])) if (t) tagNames.add(String(t).toLowerCase())
    }
  }

  // 按 (libraryId, core) / (libraryId, dir) / (libraryId, parody) 分桶,产生候选对
  const buckets = []
  const addBucket = (keyFn) => {
    const m = new Map()
    for (const x of meta) {
      const key = keyFn(x)
      if (!key) continue
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(x)
    }
    for (const g of m.values()) if (g.length >= 2) buckets.push(g)
  }
  addBucket(x => x.cores.length ? x.libraryId + '|core|' + x.cores[0] : '')
  addBucket(x => x.dir ? x.libraryId + '|dir|' + x.dir : '')
  addBucket(x => {
    const p = (x.book.tags && x.book.tags.parody) || []
    return p.length ? x.libraryId + '|parody|' + p[0] : ''
  })

  // 同一对可能出现在多个桶里:先收集所有候选对及其分数(去重)
  const pairMap = new Map() // 'i:j' -> {i,j,score,reasons}
  const idxOf = new Map(meta.map((x, i) => [x.book.hash, i]))
  for (const group of buckets) {
    for (let a = 0; a < group.length; a++) {
      for (let b = a + 1; b < group.length; b++) {
        const A = group[a], B = group[b]
        if (A.libraryId !== B.libraryId) continue // 跨库禁止合并
        const ia = idxOf.get(A.book.hash), ib = idxOf.get(B.book.hash)
        const key = ia < ib ? ia + ':' + ib : ib + ':' + ia
        if (pairMap.has(key)) continue
        const { score, reasons } = scorePair(A.book, B.book, {
          coresA: A.cores, coresB: B.cores, bracketsA: A.brackets, bracketsB: B.brackets,
          dirA: A.dir, dirB: B.dir, tagNames,
          volA: A.volume, volB: B.volume
        })
        pairMap.set(key, { i: Math.min(ia, ib), j: Math.max(ia, ib), score, reasons })
      }
    }
  }

  // 连通分量(只连 >= threshold 的对)
  const dsu = makeDSU(meta.length)
  for (const p of pairMap.values()) if (p.score >= threshold) dsu.union(p.i, p.j)
  const comps = new Map()
  for (let i = 0; i < meta.length; i++) {
    const r = dsu.find(i)
    if (!comps.has(r)) comps.set(r, [])
    comps.get(r).push(i)
  }

  const out = []
  for (const idxs of comps.values()) {
    if (idxs.length < 2) continue
    const members = idxs.map(i => meta[i])
    // 锚守门:没有可靠支撑就按「锚 key」拆开(避免只是 character 相似的一团)
    const pairOf = (i, j) => pairMap.get(Math.min(i, j) + ':' + Math.max(i, j))
    const anchored = (() => {
      for (let a = 0; a < idxs.length; a++) {
        for (let b = a + 1; b < idxs.length; b++) {
          const p = pairOf(idxs[a], idxs[b])
          if (p && (p.reasons.includes('parody') || p.reasons.includes('title-core') ||
                    p.reasons.includes('same-dir') || p.reasons.includes('title-similar'))) return true
        }
      }
      return false
    })()
    if (!anchored) continue

    // 卷号全相同 = 重复书,不是合集(哨兵)
    const vols = members.map(m => m.volume).filter(v => v !== null && v !== undefined)
    if (vols.length === members.length && new Set(vols.map(String)).size === 1) continue

    // 少于 3 本的组:只有「证据足够强」才收。
    // 强证据 = 有 parody 标签,或组内两两分都 >= 0.70(同目录 + 标题主干相同这种)。
    // 以前一律要求 >=3 本,导致「同一文件夹里只有 2 卷」的系列识别不出来。
    if (members.length < 3) {
      const hasParody = members.some(m => ((m.book.tags && m.book.tags.parody) || []).length)
      const strongPair = (() => {
        let seen = 0
        for (let a2 = 0; a2 < idxs.length; a2++) {
          for (let b2 = a2 + 1; b2 < idxs.length; b2++) {
            const p = pairMap.get(Math.min(idxs[a2], idxs[b2]) + ':' + Math.max(idxs[a2], idxs[b2]))
            if (!p || p.score < 0.70) return false
            seen += 1
          }
        }
        return seen > 0
      })()
      if (!hasParody && !strongPair) continue
    }

    // 置信度 = 组内平均两两分(只看 >=threshold 的对)
    let sum = 0, n = 0
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const p = pairOf(idxs[a], idxs[b])
        if (p && p.score >= threshold) { sum += p.score; n += 1 }
      }
    }
    const confidence = n ? sum / n : 0

    // 命名:parody 标签 > 目录名 > 标题主干
    const parody = (members[0].book.tags && members[0].book.tags.parody) || []
    const dirNames = _.uniq(members.map(m => m.dir.split(/[\\/]/).pop()).filter(Boolean))
    const commonCore = members[0].cores[0] || ''
    const reasonSet = new Set()
    for (const p of pairMap.values()) if (p.score >= threshold && idxs.includes(p.i)) p.reasons.forEach(r => reasonSet.add(r))
    // 目录名是通用容器名(Download/下载/漫画…)时,不要拿它当合集名
    const GENERIC_DIR = /^(download|downloads|下载|temp|tmp|manga|漫画|books?|comics?|eh|new|新建文件夹)$/i
    const usableDirName = (dirNames.length === 1 && dirNames[0] && !GENERIC_DIR.test(dirNames[0])) ? dirNames[0] : ''
    let title = parody[0] || usableDirName || commonCore || '合集'
    // 作者专辑:组内 artist 一致且没有 parody → kind=artist
    const artists = _.uniq(_.flatMap(members.map(m => (m.book.tags && m.book.tags.artist) || [])))
    const kind = (!parody.length && artists.length === 1) ? 'artist' : 'series'
    if (kind === 'artist' && !parody[0]) title = artists[0]

    out.push({
      id: 'auto-' + members[0].book.hash.slice(0, 8) + '-' + members.length,
      title: String(title).slice(0, 80),
      kind,
      confidence: Math.round(confidence * 100),
      reasons: [...reasonSet],
      books: members.map(m => ({
        hash: m.book.hash, id: m.book.id,
        title: m.book.title || m.book.title_jpn || '',
        filepath: m.book.filepath, volume: m.volume
      }))
    })
  }

  // ---------- 作者专辑(独立规则) ----------
  // 同目录 / 同 core 都够不上时,「同一作者的 ≥3 本」本身就是一个合集诉求
  // (用户想「把这个作者的全收进来」)。作为第二归属单独产出,kind='artist',
  // 置信度偏低,默认不勾选,由用户决定。
  const assigned = new Set(out.flatMap(g => g.books.map(b => b.hash)))
  const byArtist = new Map()
  for (const m of meta) {
    if (assigned.has(m.book.hash)) continue
    for (const a of ((m.book.tags && m.book.tags.artist) || [])) {
      if (!a) continue
      const key = m.libraryId + '|' + String(a).toLowerCase()
      if (!byArtist.has(key)) byArtist.set(key, { name: a, members: [] })
      byArtist.get(key).members.push(m)
    }
  }
  for (const { name, members } of byArtist.values()) {
    if (members.length < 3) continue
    out.push({
      id: 'artist-' + String(name).slice(0, 12) + '-' + members.length,
      title: String(name),
      kind: 'artist',
      // 作者专辑只靠一条弱信号,给 45~55 的保守置信度
      confidence: Math.min(55, 35 + members.length * 3),
      reasons: ['artist'],
      books: members.map(m => ({
        hash: m.book.hash, id: m.book.id,
        title: m.book.title || m.book.title_jpn || '',
        filepath: m.book.filepath, volume: m.volume
      }))
    })
  }

  // 大组优先;置信度高的优先;系列排在作者专辑之前
  out.sort((a, b) =>
    (a.kind === b.kind ? 0 : (a.kind === 'series' ? -1 : 1)) ||
    (b.books.length - a.books.length) || (b.confidence - a.confidence))
  return out
}

module.exports.buildPlan = buildPlan
