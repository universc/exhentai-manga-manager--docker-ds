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
// ⚠ 顺序很重要:必须**先做全角→半角**,否则「第０９-１０章」这类全角数字匹配不上,
//   同一系列会被拆成两个不同的主干(这是实测 /library/2 只认出 141 个系列的主因之一)。
const toHalfWidth = (s) => String(s || '').replace(/[\u3000-\u303f\uff00-\uffef]/g,
  c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))

// 卷号/章节号的三种形态(评审给的写法,覆盖实测样本):
//   ① 前缀式:vol.1-4 / Part 02 / ch 12 —— 注意要能吃「区间」,旧正则只吃单个数
//   ② 中文式:第09-10章 / 第1話 —— 旧正则剥完会残留「第 章」
//   ③ 尾锚裸数字:... 01 / ... 1~2 —— 裸数字**只能尾锚**,否则会误伤「100日」「1984」这种真书名
const RE_VOL_PREFIX = /\b(?:vol|volume|ch|chapter|ep|episode|part|book|act)\.?\s*(\d+(?:\.\d+)?)(?:\s*[-~～–—〜至]\s*(\d+(?:\.\d+)?))?/gi
const RE_VOL_CN = /第\s*(\d+|[〇一二三四五六七八九十百]{1,4})\s*(?:[-~～至到]\s*(\d+|[〇一二三四五六七八九十百]{1,4}))?\s*[卷話话章回集部篇]/g
const RE_VOL_TAIL = /(?:^|[\s_\-~(])(\d{1,3}(?:\.\d+)?)(?:\s*[-~～至]\s*(\d{1,3}(?:\.\d+)?))?\s*$/
// 分段标记(上/中/下/前後編):也属于「卷」,要一起剥离并参与排序
const RE_VOL_PART = /(?:^|[\s_\-~])(上卷?|中卷?|下卷?|前編|後編|前篇|后篇|完)(?:$|[\s_\-~])/
const PART_RANK = { '上': 1, '上卷': 1, '中': 2, '中卷': 2, '下': 3, '下卷': 3, '前編': 5, '前篇': 5, '後編': 6, '后篇': 6, '完': 7 }

// 其余噪声:分辨率、页数、日期、版本号
const RE_NOISE = [
  /\b(v|ver|version)\s*\d+(\.\d+)*\b/gi,
  /\b\d{3,4}\s*[x×]\s*\d{3,4}\b/gi,
  /\(\s*\d+\s*(p|pages?|jpg|png|images?)\s*\)/gi,
  /\b\d{4}[-_./]\d{1,2}[-_./]\d{1,2}\b/g,
]

// 从标题里抽取卷号信息(同时把 span 从主干里删掉)
// 返回 { core, volume, volumeEnd, rank }
//   volume 可能是数字,也可能是无法解析的字符串;拿不到就是 null
//   ⚠ 卷号**不参与相似度**,只用于组内排序与「重复书」判定
const detectVolumeSpan = (title) => {
  let s = toHalfWidth(title)
  let volume = null
  let volumeEnd = null
  let rank = null

  // ① 前缀式(可能带区间)
  s = s.replace(RE_VOL_PREFIX, (m, a, b) => {
    const from = Number(a)
    if (Number.isFinite(from)) {
      volume = from
      volumeEnd = b != null && Number.isFinite(Number(b)) ? Number(b) : null
    }
    return ' '
  })
  // ② 中文式
  s = s.replace(RE_VOL_CN, (m, a, b) => {
    const from = Number(a)
    if (Number.isFinite(from)) {
      if (volume === null) volume = from
      volumeEnd = b != null && Number.isFinite(Number(b)) ? Number(b) : null
    }
    return ' '
  })
  // ③ 尾锚裸数字
  s = s.replace(RE_VOL_TAIL, (m, a, b) => {
    const from = Number(a)
    if (Number.isFinite(from) && volume === null) {
      volume = from
      volumeEnd = b != null && Number.isFinite(Number(b)) ? Number(b) : null
    }
    return ' '
  })
  // ④ 上/中/下
  s = s.replace(RE_VOL_PART, (m, p) => {
    const r = PART_RANK[p]
    if (r && rank === null) rank = r
    return ' '
  })

  return { core: s, volume, volumeEnd, rank }
}

const detectVolume = (title) => detectVolumeSpan(title).volume

// 归一化:返回 { core, brackets, tokens }
//   core     = 可用于比较的主干(小写、去噪、压空白)
//   brackets = 被剥掉的方括号内容(可能含作者/系列名,用于命中标签)
//   tokens   = core 分词
const normalizeTitle = (title) => {
  // 先全角→半角,后面所有匹配才一致
  const raw = toHalfWidth(title)
  const brackets = [...raw.matchAll(RE_BRACKET)].map(m => m[0].replace(/^\[|\]$/g, '').trim()).filter(Boolean)
  let s = raw.replace(RE_BRACKET, ' ').replace(RE_PAREN, ' ')
  // 卷号(前缀/中文/尾锚/上下册)统一抽出并删除
  const vol = detectVolumeSpan(s)
  s = vol.core
  for (const re of RE_NOISE) s = s.replace(re, ' ')
  // 标点 → 空格
  s = s.replace(/[·・~～!！?？,，.。:：;；'"“”‘’\-—_|/\\]+/g, ' ')
  s = s.replace(/\s+/g, ' ').trim().toLowerCase()
  return {
    core: s,
    brackets,
    tokens: s.split(' ').filter(Boolean),
    volume: vol.volume,
    volumeEnd: vol.volumeEnd,
    rank: vol.rank
  }
}

// 多语标题取并集:任一语言命中即算(三语不同不扣分)
const normalizeBookTitles = (book) => {
  const parts = [book.title, book.title_jpn, book.title_cn].map(t => normalizeTitle(t))
  const core = _.uniq(parts.map(p => p.core).filter(Boolean))
  const brackets = _.uniq(_.flatMap(parts.map(p => p.brackets)))
  // 卷号:任一语言解析出来就算(三语标题往往只有一种带卷号)
  const vol = parts.find(p => p.volume != null) || {}
  return {
    cores: core,
    brackets,
    volume: vol.volume
      != null ? vol.volume : null,
    volumeEnd: vol.volumeEnd != null ? vol.volumeEnd : null,
    rank: vol.rank != null ? vol.rank : null
  }
}


// ---------- 相似度:字符 bigram Dice + 前缀 ----------
// 评审指出「完全相等」太严,而且中文没空格,分词 Jaccard 会退化。
// 字符 bigram 对中文、日文、英文都稳。
const bigrams = (s) => {
  const t = String(s || '').replace(/\s+/g, '')
  const out = new Set()
  if (t.length <= 2) { if (t) out.add(t); return out }
  for (let i = 0; i + 1 < t.length; i++) out.add(t.slice(i, i + 2))
  return out
}
const diceBigram = (a, b) => {
  const A = bigrams(a), B = bigrams(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter += 1
  return (2 * inter) / (A.size + B.size)
}
// 标题主干相似度(0..1):全等 0.95 / 前缀 0.85 / Dice≥0.72 时 0.6~0.8
const coreSimilarity = (a, b) => {
  const x = String(a || ''), y = String(b || '')
  if (!x || !y) return 0
  if (x === y) return 0.95
  const short = x.length <= y.length ? x : y
  const long = x.length <= y.length ? y : x
  if (long.startsWith(short) && short.length / long.length >= 0.6) return 0.85
  const d = diceBigram(x, y)
  if (d >= 0.72) return 0.6 + (d - 0.72) / 0.28 * 0.2
  return d * 0.6
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
  // ① 同一容器/父目录 —— 但只是**弱证据**。
  //   ⚠ 教训:/library/2 这种「几千本平铺在一个目录」的库,同目录几乎对所有书都成立。
  //   以前给 0.40 会让这些书全部连边,再被 complete-link 整组否决 → 结果一个都识别不出来。
  //   现在同目录只给 0.15,主要靠标题主干相似度定案。
  if (ctx.dirA && ctx.dirA === ctx.dirB) {
    score += 0.15
    reasons.push('same-dir')
  }

  // ③ 标题主干相似度(最高 0.35)
  //   以前要求「完全相等」,太严:残留一个「第/章」就判不同。
  //   改用 coreSimilarity(全等/前缀/bigram Dice)后,同一系列能稳定连边。
  let best = 0
  for (const ca of ctx.coresA) {
    for (const cb of ctx.coresB) {
      const s = coreSimilarity(ca, cb)
      if (s > best) best = s
    }
  }
  if (best > 0) {
    score += 0.55 * best
    reasons.push(best >= 0.9 ? 'title-core' : 'title-similar')
  }
  // ② 卷号可解析且不同 → 是同一系列的不同卷(0.15)
  const va = ctx.volA, vb = ctx.volB
  if (va != null && vb != null && va !== vb && best >= 0.5) { score += 0.15; reasons.push('volume-seq') }

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
      // 卷号优先用「归一化时抽到的」(能识别区间与上下册),兜底再单独探测
      volume: n.volume != null ? n.volume : detectVolume(b.title || b.title_jpn || ''),
      volumeEnd: n.volumeEnd != null ? n.volumeEnd : null,
      rank: n.rank != null ? n.rank : null,
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
  // ⚠ 目录桶要**限制桶大小**:/library/2 这种「几千本平铺在同一个目录」的情况,
  //   如果按目录成桶就是 3900² ≈ 760 万次两两打分(实测 25 秒且全是噪音)。
  //   目录信号只在「同一目录下书不多」时才有意义(说明用户按系列分了子文件夹)。
  const DIR_BUCKET_MAX = 60
  {
    const m = new Map()
    for (const x of meta) {
      if (!x.dir) continue
      const key = x.libraryId + '|dir|' + x.dir
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(x)
    }
    for (const g of m.values()) {
      if (g.length >= 2 && g.length <= DIR_BUCKET_MAX) buckets.push(g)
    }
  }
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

    // ★ complete-link 校验(评审指出这是「误并」的最大来源):
    //   DSU 只按单条边 union,链式串联会把 A-B-C 拉成一组,即使 A 和 C 毫不相干。
    //   这里要求组内**任意一对**都不能太弱(>= 0.55),否则整组不算。
    const COMPLETE_LINK_MIN = 0.55
    let tooWeak = false
    for (let a2 = 0; a2 < idxs.length && !tooWeak; a2++) {
      for (let b2 = a2 + 1; b2 < idxs.length; b2++) {
        const p = pairMap.get(Math.min(idxs[a2], idxs[b2]) + ':' + Math.max(idxs[a2], idxs[b2]))
        // 没有配对记录的(理论上是同一分量内必有)按最弱处理
        if (!p || p.score < COMPLETE_LINK_MIN) { tooWeak = true; break }
      }
    }
    if (tooWeak) continue

    // parody 不同但 character 相同 → 不让它们靠 character 黏在一起(评审建议)
    const parodies = members.map(m => ((m.book.tags && m.book.tags.parody) || []).slice().sort().join('|'))
    const parodySetSize = new Set(parodies.filter(Boolean)).size

    // 卷号全相同 = 重复书,不是合集(哨兵)
    const vols = members.map(m => m.volume).filter(v => v !== null && v !== undefined)
    if (vols.length === members.length && new Set(vols.map(String)).size === 1) continue

    // 组内「标题主干 + 卷号」完全一样的多本 = 同一本的重复文件。
    // 它们不该被当成「系列的第几卷」;把重复的挑出来单独提示,组里只留一份参与命名。
    const sigCount = new Map()
    for (const m of members) {
      const sig = (m.cores[0] || '') + '#' + String(m.volume == null ? '' : m.volume)
      sigCount.set(sig, (sigCount.get(sig) || 0) + 1)
    }
    const dupCount = [...sigCount.values()].reduce((s, c) => s + (c - 1), 0)

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
    const GENERIC_DIR = /^(download|downloads|下载|temp|tmp|manga|漫画|books?|comics?|eh|new|新建文件夹|s|单图)$/i
    // 纯编号(如 /library/2 的 "2")或极短名不能当合集名 —— 之前就出现一堆叫「2」的组
    const isNumericDir = (d) => /^\d+$/.test(String(d || '').trim())
    const usableDirName = (dirNames.length === 1 && dirNames[0] &&
      !GENERIC_DIR.test(dirNames[0]) && !isNumericDir(dirNames[0]) &&
      String(dirNames[0]).length >= 2) ? dirNames[0] : ''
    // 命名优先级:parody > 标题主干 > 目录名。
    // (目录名常常是 "2"/"S" 这类容器名,标题主干反而更能说明这组是什么)
    // 优先用小写的 core 去**匹配**,但显示时用组内第一本的原始标题,保留大小写与可读性
    const prettyTitle = (() => {
      const raw = String(members[0].book.title || members[0].book.title_jpn || '')
      // 剥掉开头的 [作者] / (社团) 与尾部的 [语言] 等标记
      let t = raw.replace(/^(\s*[\[【(][^\]】)]*[\]】)]\s*)+/g, ' ')
      t = t.replace(/(\s*[\[【(][^\]】)]*[\]】)]\s*)+$/g, ' ')
      // 再去掉卷号与标点尾巴
      t = toHalfWidth(t)
      const v = detectVolumeSpan(t)
      t = v.core.replace(/[·・~～!！?？,，.。:：;；'"“”‘’\-—_|/\\]+/g, ' ').replace(/\s+/g, ' ').trim()
      return t
    })()
    let title = parody[0] || prettyTitle || usableDirName || commonCore || '合集'
    // 收尾:去掉首尾残留的标点与**孤立括号**
    title = String(title)
      .replace(/^[\s\-_:：,，.。\[\]【】()（）]+/, '')
      .replace(/[\s\-_:：,，.。\[\]【】()（）]+$/, '')
      .trim() || usableDirName || '合集'
    // 作者专辑:组内 artist 一致且没有 parody → kind=artist
    const artists = _.uniq(_.flatMap(members.map(m => (m.book.tags && m.book.tags.artist) || [])))
    const kind = (!parody.length && artists.length === 1) ? 'artist' : 'series'
    if (kind === 'artist' && !parody[0]) title = artists[0]

    // 组内每一本都是重复文件 → 这根本不是合集,跳过
    if (sigCount.size === 1 && dupCount === members.length - 1) continue

    out.push({
      id: 'auto-' + members[0].book.hash.slice(0, 8) + '-' + members.length,
      title: String(title).slice(0, 80),
      kind,
      confidence: Math.round(confidence * 100),
      reasons: [...reasonSet],
      // 重复文件数(同一本书有多份),给界面提示用
      duplicates: dupCount,
      books: members.map(m => ({
        hash: m.book.hash, id: m.book.id,
        title: m.book.title || m.book.title_jpn || '',
        filepath: m.book.filepath, volume: m.volume
      }))
    })
  }

  // ---------- 作者合集(按目录结构,独立规则) ----------
  // 用户库里 /library/S/<作者名>/ 这种「一个作者一个目录」是**人工整理过的强信号**,
  // 而且比 artist 标签可靠得多(实测这个库大多数书根本没填 artist 标签)。
  // 所以:目录名不是通用容器名、且该目录下书数 >= 2 时,整个目录 = 一个作者合集。
  const assigned0 = new Set(out.flatMap(g => g.books.map(b => b.hash)))
  const GENERIC_AUTHOR_DIR = /^(download|downloads|下载|temp|tmp|manga|漫画|books?|comics?|eh|s|2|单图|new|新建文件夹)$/i
  const byDirGroup = new Map()
  for (const m of meta) {
    if (!m.dir) continue
    const key = m.libraryId + '|' + m.dir
    if (!byDirGroup.has(key)) byDirGroup.set(key, { dir: m.dir, members: [] })
    byDirGroup.get(key).members.push(m)
  }
  for (const { dir, members } of byDirGroup.values()) {
    if (members.length < 2) continue
    const name = String(dir).split(/[\\/]/).pop() || ''
    if (!name || GENERIC_AUTHOR_DIR.test(name)) continue
    if (/^\d+$/.test(name.trim())) continue
    // 已经被系列规则整组收走的目录,就不再重复出一个「作者合集」
    const fresh = members.filter(m => !assigned0.has(m.book.hash))
    if (fresh.length < 2) continue
    out.push({
      id: 'dirgroup-' + name.slice(0, 12) + '-' + fresh.length,
      title: name,
      kind: 'artist',
      // 目录结构是强人工信号,但组内可能混着不同作品,给 60 左右
      confidence: Math.min(70, 50 + Math.min(fresh.length, 20)),
      reasons: ['same-dir-group'],
      books: fresh.map(m => ({
        hash: m.book.hash, id: m.book.id,
        title: m.book.title || m.book.title_jpn || '',
        filepath: m.book.filepath, volume: m.volume
      }))
    })
  }

  // ---------- 作者专辑(按 artist 标签,补充规则) ----------
  // 上面按目录没覆盖到的(比如书散在不同目录但确实是同一作者),再用标签补一次。
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