// 标题翻译模块
// 支持两种翻译来源:
//   1. 本地AI (Ollama)      —— 内网/本机部署的大模型,数据不出内网
//   2. 在线AI API (OpenAI 兼容) —— 任意 OpenAI 格式接口(OpenAI / DeepSeek / Moonshot / 通义 等)
// 设置项(保存在 setting.json):
//   titleTranslationMode    'off' | 'ollama' | 'openai'
//   titleTranslationBaseUrl 接口地址(如 http://127.0.0.1:11434 或 https://api.deepseek.com/v1)
//   titleTranslationModel   模型名(如 qwen2.5:7b / deepseek-chat / gpt-4o-mini)
//   titleTranslationApiKey  API 密钥(仅在线模式需要)
const fetch = require('node-fetch')
const { HttpsProxyAgent } = require('https-proxy-agent')

const SYSTEM_PROMPT = [
  '你是一名专业的漫画标题翻译助手。请把用户提供的漫画标题翻译成简体中文。要求:',
  '1. 只输出翻译结果本身,不要任何解释、引号、前缀或后缀;',
  '2. 保留标题中的英文、数字、符号,括号内的内容(社团名、系列名、语气词等)整体翻译;',
  '3. 如果标题已经是简体中文,原样返回;',
  '4. 译文要自然通顺,符合中文命名习惯,不要机翻腔。'
].join('\n')

// 单次请求超时(毫秒)
const REQUEST_TIMEOUT = 120000

const buildRequestOptions = (setting) => {
  const options = {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout ? AbortSignal.timeout(REQUEST_TIMEOUT) : undefined
  }
  if (setting?.proxy) {
    options.agent = new HttpsProxyAgent(setting.proxy)
  }
  return options
}

const cleanResult = (text) => {
  if (!text) return ''
  let t = String(text).trim()
  // 去掉常见的引号包裹
  t = t.replace(/^["'“”‘’「『]+|["'“”‘’」』]+$/g, '')
  // 去掉 "翻译:xxx" 这类前缀
  t = t.replace(/^(翻译|译文|结果)[：:]\s*/i, '')
  // 只取第一行
  t = t.split('\n')[0].trim()
  return t
}

// 多行结果清理:去掉首尾引号,但保留所有行(角色出处查询需要多行输出)
const cleanMultiLineResult = (text) => {
  if (!text) return ''
  let t = String(text).trim()
  t = t.replace(/^["'“”‘’「『]+|["'“”‘’」』]+$/g, '')
  return t
}

// ---------- AI 配置解析 ----------
// 本地AI 与 在线API 的地址/模型/密钥分开填写(旧版共用字段作为兼容回退):
//   ollamaBaseUrl / ollamaModel / openaiBaseUrl / openaiModel / openaiApiKey
const resolveAiConfig = (setting = {}) => {
  const mode = setting.titleTranslationMode || 'off'
  if (mode === 'ollama') {
    return {
      mode,
      baseUrl: setting.ollamaBaseUrl || setting.titleTranslationBaseUrl || 'http://127.0.0.1:11434',
      model: setting.ollamaModel || setting.titleTranslationModel || '',
    }
  }
  if (mode === 'openai') {
    return {
      mode,
      baseUrl: setting.openaiBaseUrl || setting.titleTranslationBaseUrl || 'https://api.openai.com/v1',
      model: setting.openaiModel || setting.titleTranslationModel || '',
      apiKey: setting.openaiApiKey || setting.titleTranslationApiKey || '',
    }
  }
  return { mode }
}

// ---------- 本地 AI(Ollama) ----------
const translateWithOllama = async ({ baseUrl, model, text, proxy }) => {
  const url = (baseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '') + '/api/generate'
  const options = buildRequestOptions({ proxy })
  options.method = 'POST'
  options.body = JSON.stringify({
    model,
    prompt: `${SYSTEM_PROMPT}\n\n标题:${text}`,
    stream: false,
    options: { temperature: 0.3 }
  })
  const res = await fetch(url, options)
  if (!res.ok) {
    throw new Error(`本地AI(Ollama)请求失败: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  }
  const data = await res.json()
  return cleanResult(data.response)
}

// ---------- 在线 AI API(OpenAI 兼容) ----------
const translateWithOpenAI = async ({ baseUrl, model, apiKey, text, proxy }) => {
  const url = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions'
  const options = buildRequestOptions({ proxy })
  options.method = 'POST'
  options.headers.Authorization = `Bearer ${apiKey || ''}`
  options.body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text }
    ],
    temperature: 0.3
  })
  const res = await fetch(url, options)
  if (!res.ok) {
    throw new Error(`在线AI API请求失败: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  }
  const data = await res.json()
  return cleanResult(data.choices?.[0]?.message?.content)
}

// 根据设置翻译一段文本,返回翻译结果(失败抛异常)
const translateTitle = async (text, setting = {}) => {
  if (!text) return ''
  const cfg = resolveAiConfig(setting)
  if (cfg.mode === 'off') {
    throw new Error('未启用标题翻译,请先在 设置 → AI功能 中选择翻译模式')
  }
  const common = { baseUrl: cfg.baseUrl, model: cfg.model, proxy: setting.proxy }
  if (cfg.mode === 'ollama') {
    if (!common.model) throw new Error('未填写本地AI模型名称')
    return await translateWithOllama({ ...common, text })
  }
  if (cfg.mode === 'openai') {
    if (!common.model) throw new Error('未填写在线AI模型名称')
    if (!cfg.apiKey) throw new Error('未填写在线AI API密钥')
    return await translateWithOpenAI({ ...common, apiKey: cfg.apiKey, text })
  }
  throw new Error(`未知的翻译模式: ${cfg.mode}`)
}

// 翻译一本漫画的标题(优先日文标题,其次英文标题),返回中文标题
const translateBookTitle = async (book, setting = {}) => {
  const source = book?.title_jpn || book?.title
  if (!source) return ''
  return await translateTitle(source, setting)
}

// ---------- 可用模型列表 ----------
// Ollama: GET /api/tags → { models: [{ name, ... }] }
const listOllamaModels = async ({ baseUrl, proxy }) => {
  const url = (baseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '') + '/api/tags'
  const res = await fetch(url, buildRequestOptions({ proxy }))
  if (!res.ok) throw new Error(`获取本地AI模型列表失败: HTTP ${res.status}`)
  const data = await res.json()
  return (data.models || []).map(m => m.name).filter(Boolean)
}

// OpenAI 兼容: GET /models → { data: [{ id, ... }] }
const listOpenAIModels = async ({ baseUrl, apiKey, proxy }) => {
  const url = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/models'
  const options = buildRequestOptions({ proxy })
  options.headers.Authorization = `Bearer ${apiKey || ''}`
  const res = await fetch(url, options)
  if (!res.ok) {
    throw new Error(`获取在线AI模型列表失败: HTTP ${res.status} ${(await res.text()).slice(0, 150)}`)
  }
  const data = await res.json()
  return (data.data || []).map(m => m.id).filter(Boolean)
}

// 根据设置获取当前翻译来源的可用模型列表
const listTitleTranslationModels = async (setting = {}) => {
  const cfg = resolveAiConfig(setting)
  if (cfg.mode === 'ollama') {
    return await listOllamaModels({ baseUrl: cfg.baseUrl, proxy: setting.proxy })
  }
  if (cfg.mode === 'openai') {
    if (!cfg.apiKey) throw new Error('未填写在线AI API密钥')
    return await listOpenAIModels({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      proxy: setting.proxy
    })
  }
  throw new Error('未启用标题翻译')
}

// ---------- 角色出处查询 ----------
// 根据角色名询问 AI 其出自哪部作品(如 博丽灵梦 → 东方Project)
const CHARACTER_ORIGIN_PROMPT = [
  '你是一名 ACG 作品知识助手。下面是漫画中出现的角色名(可能包含英文/日文/中文名),',
  '请判断每个角色出自哪一部作品(如「东方Project」「Fate系列」「原神」等)。要求:',
  '1. 按「角色名 → 作品名」的格式,每行一个角色;',
  '2. 只输出角色名与作品名,不要任何解释;',
  '3. 无法确定的写「未知」;',
  '4. 同人创作的角色按官方出处回答。'
].join('\n')

const queryCharacterOrigins = async (characterNames, setting = {}) => {
  const names = (Array.isArray(characterNames) ? characterNames : [characterNames])
    .map(n => String(n).trim())
    .filter(Boolean)
  if (names.length === 0) return ''
  const cfg = resolveAiConfig(setting)
  const text = names.join('\n')
  if (cfg.mode === 'ollama') {
    if (!cfg.model) throw new Error('未填写本地AI模型名称')
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/api/generate'
    const options = buildRequestOptions({ proxy: setting.proxy })
    options.method = 'POST'
    options.body = JSON.stringify({
      model: cfg.model,
      prompt: `${CHARACTER_ORIGIN_PROMPT}\n\n角色:\n${text}`,
      stream: false,
      options: { temperature: 0.2 }
    })
    const res = await fetch(url, options)
    if (!res.ok) throw new Error(`本地AI请求失败: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    return cleanMultiLineResult(data.response)
  }
  if (cfg.mode === 'openai') {
    if (!cfg.model) throw new Error('未填写在线AI模型名称')
    if (!cfg.apiKey) throw new Error('未填写在线AI API密钥')
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions'
    const options = buildRequestOptions({ proxy: setting.proxy })
    options.method = 'POST'
    options.headers.Authorization = `Bearer ${cfg.apiKey}`
    options.body = JSON.stringify({
      model: setting.titleTranslationModel,
      messages: [
        { role: 'system', content: CHARACTER_ORIGIN_PROMPT },
        { role: 'user', content: text }
      ],
      temperature: 0.2
    })
    const res = await fetch(url, options)
    if (!res.ok) throw new Error(`在线AI API请求失败: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    return cleanMultiLineResult(data.choices?.[0]?.message?.content)
  }
  throw new Error('未启用标题翻译,请先在 设置 → 标题翻译 中选择翻译模式')
}

// ---------- 标题角色分析 ----------
// 根据漫画标题分析其中的角色名与出处作品,返回 [{ character, parody }]
const CHARACTER_ANALYZE_PROMPT = [
  '你是一名 ACG 作品知识助手。根据漫画标题,分析其中出现的角色名及其出处作品(原作/系列)。要求:',
  '1. 只输出 JSON 数组,格式:[{"character":"角色名","parody":"作品名"}],不要任何解释;',
  '2. character 填角色名,parody 填作品名(如 东方Project / Fate系列);',
  '3. 标题中若没有明确角色,输出 [];',
  '4. 不确定的 parody 填 "未知"。'
].join('\n')

// 从 AI 回复中尽力解析 JSON 数组
const parseCharacterAnalysis = (text) => {
  if (!text) return []
  let t = String(text).trim()
  // 去掉 ```json 围栏
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  // 取第一个 [ ... ] 片段
  const start = t.indexOf('[')
  const end = t.lastIndexOf(']')
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(t.slice(start, end + 1))
      if (Array.isArray(parsed)) {
        return parsed
          .filter(item => item && item.character)
          .map(item => ({
            character: String(item.character).trim(),
            parody: item.parody ? String(item.parody).trim() : ''
          }))
      }
    } catch (e) { /* 继续尝试逐行解析 */ }
  }
  // 逐行回退:"角色 -> 作品" 或 "角色→作品" 或 "角色 出自 作品"
  const result = []
  for (const line of t.split('\n')) {
    const m = line.match(/^\s*[•\-*\d.、]?\s*(.+?)\s*(?:->|→|=>|出自|属于|—)\s*(.+?)\s*$/)
    if (m) result.push({ character: m[1].trim(), parody: m[2].trim() })
  }
  return result
}

const analyzeTitleCharacters = async (title, setting = {}) => {
  if (!title) return []
  const cfg = resolveAiConfig(setting)
  const text = String(title)
  if (cfg.mode === 'ollama') {
    if (!cfg.model) throw new Error('未填写本地AI模型名称')
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/api/generate'
    const options = buildRequestOptions({ proxy: setting.proxy })
    options.method = 'POST'
    options.body = JSON.stringify({
      model: cfg.model,
      prompt: `${CHARACTER_ANALYZE_PROMPT}\n\n标题:${text}`,
      stream: false,
      options: { temperature: 0.2 }
    })
    const res = await fetch(url, options)
    if (!res.ok) throw new Error(`本地AI请求失败: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    return parseCharacterAnalysis(data.response)
  }
  if (cfg.mode === 'openai') {
    if (!cfg.model) throw new Error('未填写在线AI模型名称')
    if (!cfg.apiKey) throw new Error('未填写在线AI API密钥')
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions'
    const options = buildRequestOptions({ proxy: setting.proxy })
    options.method = 'POST'
    options.headers.Authorization = `Bearer ${cfg.apiKey}`
    options.body = JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: CHARACTER_ANALYZE_PROMPT },
        { role: 'user', content: text }
      ],
      temperature: 0.2
    })
    const res = await fetch(url, options)
    if (!res.ok) throw new Error(`在线AI API请求失败: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    return parseCharacterAnalysis(data.choices?.[0]?.message?.content)
  }
  throw new Error('未启用AI功能,请先在 设置 → AI功能 中选择模式')
}

// ---------- 综合信息提取(标题翻译 + 角色 + 出处 + 作者 + 类型) ----------
const BOOK_INFO_PROMPT = [
  '你是一名 ACG 作品信息助手。根据漫画标题,提取以下信息,只输出一个 JSON 对象,不要任何解释:',
  '{',
  '  "title_cn": "标题的中文翻译(若已是中文则原样返回)",',
  '  "characters": ["标题中出现的角色名"],',
  '  "parodies": ["角色对应的出处作品,如 东方Project / Fate系列;没有则空数组"],',
  '  "artists": ["作者/社团名;无法判断则空数组"],',
  '  "category": "作品类型,取值为 同人志/单行本/画集/游戏CG/非H/图集/欧美/其他 之一"',
  '}'
].join('\n')

// 提取 JSON 对象(容忍围栏/前后缀)
const parseBookInfo = (text) => {
  if (!text) return {}
  let t = String(text).trim()
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1)) || {}
    } catch (e) { /* 返回空 */ }
  }
  return {}
}

// AI 类型 → ExHentai 分类
const aiCategoryToEx = (category) => {
  const map = {
    '同人志': 'Doujinshi',
    '单行本': 'Manga',
    '画集': 'Artist CG',
    '游戏cg': 'Game CG',
    '游戏': 'Game CG',
    '非h': 'Non-H',
    '图集': 'Image Set',
    '欧美': 'Western',
    'cosplay': 'Cosplay',
    '亚洲色情': 'Asian Porn',
    '其他': 'Misc',
  }
  const key = String(category || '').trim().toLowerCase()
  return map[key] || ''
}

const extractBookInfo = async (title, setting = {}) => {
  if (!title) return {}
  const cfg = resolveAiConfig(setting)
  const text = String(title)
  let raw = ''
  if (cfg.mode === 'ollama') {
    if (!cfg.model) throw new Error('未填写本地AI模型名称')
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/api/generate'
    const options = buildRequestOptions({ proxy: setting.proxy })
    options.method = 'POST'
    options.body = JSON.stringify({
      model: cfg.model,
      prompt: `${BOOK_INFO_PROMPT}\n\n标题:${text}`,
      stream: false,
      options: { temperature: 0.2 }
    })
    const res = await fetch(url, options)
    if (!res.ok) throw new Error(`本地AI请求失败: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    raw = data.response
  } else if (cfg.mode === 'openai') {
    if (!cfg.model) throw new Error('未填写在线AI模型名称')
    if (!cfg.apiKey) throw new Error('未填写在线AI API密钥')
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions'
    const options = buildRequestOptions({ proxy: setting.proxy })
    options.method = 'POST'
    options.headers.Authorization = `Bearer ${cfg.apiKey}`
    options.body = JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: BOOK_INFO_PROMPT },
        { role: 'user', content: text }
      ],
      temperature: 0.2
    })
    const res = await fetch(url, options)
    if (!res.ok) throw new Error(`在线AI API请求失败: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    raw = data.choices?.[0]?.message?.content || ''
  } else {
    throw new Error('未启用AI功能,请先在 设置 → AI功能 中选择模式')
  }
  const info = parseBookInfo(raw)
  return {
    titleCn: String(info.title_cn || '').trim(),
    characters: Array.isArray(info.characters) ? info.characters.map(c => String(c).trim()).filter(Boolean) : [],
    parodies: Array.isArray(info.parodies) ? info.parodies.map(c => String(c).trim()).filter(Boolean) : [],
    artists: Array.isArray(info.artists) ? info.artists.map(c => String(c).trim()).filter(Boolean) : [],
    category: aiCategoryToEx(info.category),
  }
}

// ---------- 图片文字提取(OCR) ----------
// 把图片发给 AI(多模态模型)提取文字
const OCR_PROMPT = '请提取这张图片中的全部文字内容,只输出提取到的文字,不要任何解释。若没有文字,输出"无"。'

const extractImageText = async (imagePath, setting = {}) => {
  if (!imagePath) return ''
  const cfg = resolveAiConfig(setting)
  const fs = require('fs')
  const base64 = fs.readFileSync(imagePath).toString('base64')
  const mime = (require('path').extname(imagePath) || '.png').replace(/^\./, '').toLowerCase()
  const mimeMap = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', gif: 'gif', avif: 'avif', bmp: 'bmp' }
  const dataUrl = `data:image/${mimeMap[mime] || 'png'};base64,${base64}`
  if (cfg.mode === 'ollama') {
    if (!cfg.model) throw new Error('未填写本地AI模型名称')
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/api/generate'
    const options = buildRequestOptions({ proxy: setting.proxy })
    options.method = 'POST'
    options.body = JSON.stringify({
      model: cfg.model,
      prompt: OCR_PROMPT,
      images: [base64],
      stream: false,
      options: { temperature: 0.1 }
    })
    const res = await fetch(url, options)
    if (!res.ok) throw new Error(`本地AI请求失败: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    return cleanMultiLineResult(data.response)
  }
  if (cfg.mode === 'openai') {
    if (!cfg.model) throw new Error('未填写在线AI模型名称')
    if (!cfg.apiKey) throw new Error('未填写在线AI API密钥')
    const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions'
    const options = buildRequestOptions({ proxy: setting.proxy })
    options.method = 'POST'
    options.headers.Authorization = `Bearer ${cfg.apiKey}`
    options.body = JSON.stringify({
      model: cfg.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: OCR_PROMPT },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ],
      temperature: 0.1
    })
    const res = await fetch(url, options)
    if (!res.ok) throw new Error(`在线AI API请求失败: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    return cleanMultiLineResult(data.choices?.[0]?.message?.content)
  }
  throw new Error('未启用AI功能,请先在 设置 → AI功能 中选择模式')
}

// 图片文字提取(独立 OCR API,OpenAI 兼容格式):
// 设置 → AI功能 → 文字提取 API 中填写本地模型链接(如 http://127.0.0.1:11434/v1)
const extractImageTextWithUrl = async (imagePath, baseUrl, model, setting = {}) => {
  if (!imagePath || !baseUrl) return ''
  const fs = require('fs')
  const base64 = fs.readFileSync(imagePath).toString('base64')
  const mime = (require('path').extname(imagePath) || '.png').replace(/^\./, '').toLowerCase()
  const mimeMap = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', gif: 'gif', avif: 'avif', bmp: 'bmp' }
  const dataUrl = `data:image/${mimeMap[mime] || 'png'};base64,${base64}`
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const options = buildRequestOptions({ proxy: setting.proxy })
  options.method = 'POST'
  options.body = JSON.stringify({
    model: model || 'qwen2.5-vl:7b',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: OCR_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ],
    temperature: 0.1
  })
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`文字提取 API 请求失败: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return cleanMultiLineResult(data.choices?.[0]?.message?.content)
}

module.exports = {
  translateTitle,
  translateBookTitle,
  listTitleTranslationModels,
  queryCharacterOrigins,
  analyzeTitleCharacters,
  extractBookInfo,
  extractImageText,
  extractImageTextWithUrl,
  SYSTEM_PROMPT
}
