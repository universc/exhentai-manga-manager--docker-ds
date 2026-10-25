// 「筛选」功能的模型层 —— 口径照抄 JHenTai-8.0.16-334 的搜索配置对话框:
//   lib/src/widget/eh_search_config_dialog.dart   界面(分类 10 格 / 关键词 / 语言 / 页数 / 评分 / 两个开关)
//   lib/src/model/search_config.dart              → EH 查询参数(f_cats / f_sh / f_sto / f_spf / f_spt / f_srdd)
//
// 这里的筛选有两处落地:
//   1. 前台列表就地过滤(本地库与 EH在线 都生效):分类 / 语言 / 页数 / 最低评分(见 ehFilterMatch);
//   2. EH在线 模式下再翻译成 EH 的查询参数交给 EH 自己去筛(见 ehFilterParams),这才是 JHenTai 的做法。
// 关键词不在这里:它走软件原本的搜索栏(本地走本地语法、EH在线 走 EH 的 f_search)。

// 10 个 EH 分类,顺序与 JHenTai 那个对话框的两列排布一致。
// bit 是 EH 的 f_cats 位掩码(注意:f_cats 是「排除」位 —— 取消勾选才加上对应的 bit)。
export const EH_FILTER_CATEGORIES = [
  { key: 'doujinshi', name: 'Doujinshi', bit: 2 },
  { key: 'manga', name: 'Manga', bit: 4 },
  { key: 'imageSet', name: 'Image Set', bit: 32 },
  { key: 'gameCg', name: 'Game CG', bit: 16 },
  { key: 'artistCG', name: 'Artist CG', bit: 8 },
  { key: 'cosplay', name: 'Cosplay', bit: 64 },
  { key: 'nonH', name: 'Non-H', bit: 256 },
  { key: 'asianPorn', name: 'Asian Porn', bit: 128 },
  { key: 'western', name: 'Western', bit: 512 },
  { key: 'misc', name: 'Misc', bit: 1 }
]

// 语言下拉:JHenTai 用的是 LocaleConsts.language2Abbreviation 去掉 japanese(日文是默认语言,不列)
export const EH_FILTER_LANGUAGES = [
  'chinese', 'english', 'korean', 'spanish', 'portuguese', 'russian', 'french',
  'italian', 'german', 'polish', 'hungarian', 'thai', 'dutch', 'vietnamese'
]

export const EH_FILTER_STORE_KEY = 'emmEhFilter'

// 默认:分类全开、不限语言/页数、最低评分 1(即「没有任何筛选」)
export const defaultEhFilter = () => {
  const f = { keyword: '', language: '', pageAtLeast: null, pageAtMost: null, minimumRating: 1, expunged: false, torrents: false, blacklist: '' }
  for (const c of EH_FILTER_CATEGORIES) f[c.key] = true
  return f
}

const normalize = (raw) => {
  const base = defaultEhFilter()
  if (!raw || typeof raw !== 'object') return base
  const out = { ...base }
  for (const c of EH_FILTER_CATEGORIES) out[c.key] = raw[c.key] !== false
  out.keyword = String(raw.keyword || '')
  out.language = EH_FILTER_LANGUAGES.includes(raw.language) ? raw.language : ''
  const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) ? null : Number(v)
  out.pageAtLeast = num(raw.pageAtLeast)
  out.pageAtMost = num(raw.pageAtMost)
  const r = Number(raw.minimumRating)
  out.minimumRating = Number.isFinite(r) ? Math.min(5, Math.max(1, r)) : 1
  out.expunged = !!raw.expunged
  out.torrents = !!raw.torrents
  // 黑名单标签:逗号(中英文)分隔,也可以直接空格分隔;匹配时不区分大小写
  out.blacklist = String(raw.blacklist || '').trim()
  return out
}

// 把外部(对话框 / localStorage)给的值补齐成一份完整、合法的筛选条件。
// ehFilterActive / ehFilterMatch 都假定传进来的是「已经 normalize 过的」——
// 逐本书过滤时不要每本书都 normalize 一遍(那是万本库里的无用开销)。
export const normalizeEhFilter = normalize

export const loadEhFilter = () => {
  try {
    return normalize(JSON.parse(localStorage.getItem(EH_FILTER_STORE_KEY) || 'null'))
  } catch (e) {
    return defaultEhFilter()
  }
}

export const saveEhFilter = (f) => {
  try {
    localStorage.setItem(EH_FILTER_STORE_KEY, JSON.stringify(normalize(f)))
  } catch (e) { /* 隐私模式等写不了就算了,只是不记忆 */ }
}

// 有哪些条件真的在起作用(关键词不算 —— 它走搜索栏)
export const ehFilterActive = (f) => {
  const x = normalize(f)
  if (EH_FILTER_CATEGORIES.some(c => !x[c.key])) return true
  if (x.language) return true
  if (x.pageAtLeast != null || x.pageAtMost != null) return true
  if (x.minimumRating > 1) return true
  if (x.blacklist) return true
  return false
}

// 黑名单拆分结果按「筛选对象」缓存(WeakMap:筛选条件一换就是新对象,旧的自然回收)
const blacklistCache = new WeakMap()

// 本地列表的就地过滤(分类按 EH 的同名分类;没有分类的书按 Misc 算,与 EH 把杂项叫 Misc 一致)。
// ⚠️ 逐本书调用,传入的 f 必须是 normalizeEhFilter() 过的(不再在这里重复 normalize)。
export const ehFilterMatch = (f, book) => {
  const x = f
  const enabled = EH_FILTER_CATEGORIES.filter(c => x[c.key])
  if (!book) return false
  if (enabled.length !== EH_FILTER_CATEGORIES.length) {
    const cat = String(book.category || '').trim().toLowerCase() || 'misc'
    if (!enabled.some(c => c.name.toLowerCase() === cat)) return false
  }
  if (x.language) {
    const langs = (book.tags && book.tags.language) || []
    const want = x.language.toLowerCase()
    if (!langs.some(l => String(l).toLowerCase() === want)) return false
  }
  if (x.pageAtLeast != null && Number(book.pageCount || 0) < x.pageAtLeast) return false
  if (x.pageAtMost != null && Number(book.pageCount || 0) > x.pageAtMost) return false
  if (x.minimumRating > 1 && Number(book.rating || 0) < x.minimumRating) return false
  // 黑名单标签:命中任意一条就整本排除(标签名大小写不敏感;多词标签按「每个词都出现」匹配)
  if (x.blacklist) {
    // 拆分结果缓存:列表里几千本书逐本调用,不要每次都 split
    let terms = blacklistCache.get(x)
    if (!terms) {
      terms = x.blacklist.split(/[,，、]+/).map(t => t.trim().toLowerCase()).filter(Boolean)
      if (!terms.length) terms = [String(x.blacklist).toLowerCase()]
      blacklistCache.set(x, terms)
    }
    const texts = []
    const tags = book.tags || {}
    for (const k of Object.keys(tags)) {
      const arr = tags[k]
      if (Array.isArray(arr)) for (const t of arr) texts.push(String(t).toLowerCase())
    }
    if (book.category) texts.push(String(book.category).toLowerCase())
    const hit = terms.some(term => {
      const words = term.split(/\s+/).filter(Boolean)
      return texts.some(t => words.every(w => t.includes(w)))
    })
    if (hit) return false
  }
  return true
}

// 翻译成 EH 的查询参数(JHenTai SearchConfig.toQueryParameters 同款)。
// 只返回「与本项筛选有关」的参数,其余由 ehListUrl 负责。
export const ehFilterParams = (f) => {
  const x = normalize(f)
  const out = {}
  if (!ehFilterActive(f)) return out
  // f_cats 是排除位:把**没勾**的分类的 bit 加起来
  const excluded = EH_FILTER_CATEGORIES.filter(c => !x[c.key]).reduce((sum, c) => sum + c.bit, 0)
  if (excluded) out.fCats = excluded
  if (x.language) out.language = x.language
  if (x.expunged) out.expunged = true
  if (x.torrents) out.torrents = true
  if (x.pageAtLeast != null) out.pageAtLeast = x.pageAtLeast
  if (x.pageAtMost != null && (x.pageAtLeast == null || x.pageAtMost >= x.pageAtLeast)) out.pageAtMost = x.pageAtMost
  if (x.minimumRating > 1) out.minimumRating = x.minimumRating
  // 黑名单交给 EH 自己排(搜索语法 -tag);本地的就地过滤仍然保留(离线列表也生效)
  if (x.blacklist) {
    const terms = x.blacklist.split(/[,，、]+/).map(t => t.trim()).filter(Boolean)
    if (terms.length) out.blacklist = terms
  }
  return out
}
