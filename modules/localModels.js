// 本地超分模型管理(Real-ESRGAN / waifu2x)
//
// 设计:
//   - 模型来自 ncnn-vulkan 官方发布包,下载后解压到 <数据目录>/models/upscale/<id>/
//     包内自带可执行文件与 models/ 权重目录(运行时以可执行文件所在目录为 cwd)
//   - 全程纯文件操作 + 流式下载,不依赖任何 API 服务
//   - 运行需要 Vulkan:Windows 由显卡驱动提供;Linux/容器需要 libvulkan1 + 驱动
//     (无 GPU 时可用 mesa 的 lavapipe 软件渲染,但会慢很多)
//
// 模块刻意不依赖 electron,便于单独测试。
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const fetch = require('node-fetch')
const AdmZip = require('adm-zip')
const { HttpsProxyAgent } = require('https-proxy-agent')

// 运行平台 → 发布包后缀
const PLATFORM = process.platform === 'win32' ? 'win' : (process.platform === 'darwin' ? 'mac' : 'linux')

// 内置模型清单(可在此扩充,无需改前端)
const MODELS = [
  {
    id: 'realesrgan',
    name: 'Real-ESRGAN',
    desc: '通用/写实与照片风格,自带多种权重,支持 2~4 倍放大',
    exe: { win: 'realesrgan-ncnn-vulkan.exe', linux: 'realesrgan-ncnn-vulkan', mac: 'realesrgan-ncnn-vulkan' },
    url: {
      win: 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip',
      linux: 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-ubuntu.zip',
    },
    approxSize: 46 * 1024 * 1024,
    // 默认权重:realesrgan-x4plus 通用;动漫图可用 realesrgan-x4plus-anime
    defaultModel: 'realesrgan-x4plus',
    animeModel: 'realesrgan-x4plus-anime',
    maxScale: 4,
  },
  {
    id: 'waifu2x',
    name: 'waifu2x',
    desc: '动漫插画专用,降噪 + 放大,速度快、显存占用低',
    exe: { win: 'waifu2x-ncnn-vulkan.exe', linux: 'waifu2x-ncnn-vulkan', mac: 'waifu2x-ncnn-vulkan' },
    url: {
      win: 'https://github.com/nihui/waifu2x-ncnn-vulkan/releases/download/20220728/waifu2x-ncnn-vulkan-20220728-windows.zip',
      linux: 'https://github.com/nihui/waifu2x-ncnn-vulkan/releases/download/20220728/waifu2x-ncnn-vulkan-20220728-ubuntu.zip',
    },
    approxSize: 36 * 1024 * 1024,
    defaultModel: 'models-cunet',
    maxScale: 2,
  },
]

let MODELS_ROOT = ''       // <数据目录>/models/upscale
let proxyUrl = ''          // 下载时使用的 HTTP 代理(留空直连)
let mirrorPrefix = ''      // 下载源前缀(留空用 GitHub 官方;国内可填镜像加速地址)

// 由 index.js 在启动与设置变更时同步
const setProxy = (u) => { proxyUrl = String(u || '').trim() }
const setMirror = (u) => { mirrorPrefix = String(u || '').trim() }
const resolveDownloadUrl = (officialUrl) => {
  if (!mirrorPrefix) return officialUrl
  // 形如 https://ghproxy.net/ 的前缀,直接拼在官方地址前面
  return mirrorPrefix.replace(/\/+$/, '/') + officialUrl
}
const tasks = new Map()    // id -> { cancelled, controller }

const init = (dataDir) => {
  MODELS_ROOT = path.join(dataDir, 'models', 'upscale')
  try { fs.mkdirSync(MODELS_ROOT, { recursive: true }) } catch (e) {}
  return MODELS_ROOT
}

const definitionOf = (id) => MODELS.find(m => m.id === id) || null
const installDirOf = (id) => path.join(MODELS_ROOT, id)

// 安装目录里递归找可执行文件(发布包通常多一层顶层目录)
const findExecutable = (dir, name) => {
  const target = name.toLowerCase()
  const walk = (d, depth) => {
    if (depth > 4) return null
    let entries = []
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch (e) { return null }
    for (const e of entries) {
      if (e.isFile() && e.name.toLowerCase() === target) return path.join(d, e.name)
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        const hit = walk(path.join(d, e.name), depth + 1)
        if (hit) return hit
      }
    }
    return null
  }
  return walk(dir, 0)
}

const dirSize = (dir) => {
  let total = 0
  const walk = (d) => {
    let entries = []
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch (e) { return }
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else { try { total += fs.statSync(p).size } catch (err) {} }
    }
  }
  walk(dir)
  return total
}

const humanSize = (n) => {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0, v = n
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return v.toFixed(v >= 100 || i === 0 ? 0 : 1) + ' ' + units[i]
}

// 列表:内置清单 + 本机安装状态
const list = () => {
  return MODELS.map(m => {
    const dir = installDirOf(m.id)
    const exeName = m.exe[PLATFORM] || m.exe.linux
    let exePath = null
    let size = 0
    try {
      if (fs.existsSync(dir)) {
        exePath = findExecutable(dir, exeName)
        size = dirSize(dir)
      }
    } catch (e) {}
    const available = !!m.url[PLATFORM]
    return {
      id: m.id,
      name: m.name,
      desc: m.desc,
      approxSize: m.approxSize,
      approxSizeText: humanSize(m.approxSize),
      maxScale: m.maxScale,
      installed: !!exePath,
      installedSize: size,
      installedSizeText: size ? humanSize(size) : '',
      installPath: dir,
      available,
      unavailableReason: available ? '' : ('当前平台(' + PLATFORM + ')没有可用的官方发布包'),
      downloading: tasks.has(m.id),
    }
  })
}


// ---------- 下载 / 解压 ----------
// onProgress({ phase: 'download'|'extract'|'done', percent, received, total, message })
const download = async (id, onProgress) => {
  const def = definitionOf(id)
  if (!def) return { ok: false, error: '未知的模型: ' + id }
  const url = def.url[PLATFORM]
  if (!url) return { ok: false, error: '当前平台(' + PLATFORM + ')没有可用的官方发布包' }
  if (tasks.has(id)) return { ok: false, error: '该模型正在下载中' }

  const controller = new AbortController()
  const task = { cancelled: false, controller }
  tasks.set(id, task)

  const dir = installDirOf(id)
  const tmpZip = path.join(MODELS_ROOT, id + '.zip.part')
  try {
    fs.mkdirSync(MODELS_ROOT, { recursive: true })
    onProgress && onProgress({ phase: 'download', percent: 0, message: '正在连接下载源…' })
    const finalUrl = resolveDownloadUrl(url)
    const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined
    if (finalUrl !== url) onProgress && onProgress({ phase: 'download', percent: 0, message: '使用镜像下载源…' })
    const res = await fetch(finalUrl, { signal: controller.signal, redirect: 'follow', agent, timeout: 0 })
    if (!res.ok) throw new Error('下载失败:HTTP ' + res.status)
    const total = Number(res.headers.get('content-length')) || def.approxSize
    let received = 0
    let lastTick = 0
    res.body.on('data', chunk => {
      received += chunk.length
      const now = Date.now()
      if (now - lastTick > 400) {
        lastTick = now
        onProgress && onProgress({
          phase: 'download',
          percent: Math.min(99, Math.round(received / total * 100)),
          received, total,
          message: humanSize(received) + ' / ' + humanSize(total),
        })
      }
    })
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(tmpZip)
      res.body.on('error', reject)
      out.on('error', reject)
      out.on('finish', resolve)
      res.body.pipe(out)
    })
    if (task.cancelled) throw new Error('__cancelled__')

    onProgress && onProgress({ phase: 'extract', percent: 99, message: '正在解压…' })
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    new AdmZip(tmpZip).extractAllTo(dir, true)

    const exeName = def.exe[PLATFORM] || def.exe.linux
    const exePath = findExecutable(dir, exeName)
    if (!exePath) throw new Error('解压完成但没找到可执行文件 ' + exeName + ',发布包结构可能已变化')
    if (PLATFORM !== 'win') { try { fs.chmodSync(exePath, 0o755) } catch (e) {} }

    onProgress && onProgress({ phase: 'done', percent: 100, message: '安装完成' })
    return { ok: true, exePath }
  } catch (e) {
    const msg = String((e && e.message) || e)
    if (task.cancelled || msg === '__cancelled__' || /aborted/i.test(msg)) {
      try { fs.rmSync(dir, { recursive: true, force: true }) } catch (err) {}
      return { ok: false, error: '已取消下载', cancelled: true }
    }
    return { ok: false, error: msg }
  } finally {
    tasks.delete(id)
    try { fs.rmSync(tmpZip, { force: true }) } catch (e) {}
  }
}

// 取消下载:中断 fetch 并清理半成品目录
const cancel = (id) => {
  const t = tasks.get(id)
  if (!t) return { ok: false, error: '该模型没有正在进行的下载' }
  t.cancelled = true
  try { t.controller.abort() } catch (e) {}
  return { ok: true }
}

const remove = (id) => {
  const def = definitionOf(id)
  if (!def) return { ok: false, error: '未知的模型: ' + id }
  if (tasks.has(id)) return { ok: false, error: '请先取消正在进行的下载' }
  try {
    fs.rmSync(installDirOf(id), { recursive: true, force: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  }
}

// ---------- 列出可用权重 ----------
// realesrgan:安装目录 models/*.param 的文件名(即 -n 的取值)
// waifu2x:可执行文件同级的 models-* 目录名(即 -m 的取值)
const listWeights = (id) => {
  const def = definitionOf(id)
  if (!def) return []
  const dir = installDirOf(id)
  if (!fs.existsSync(dir)) return []
  const exe = findExecutable(dir, def.exe[PLATFORM] || def.exe.linux)
  if (!exe) return []
  const exeDir = path.dirname(exe)
  try {
    if (id === 'realesrgan') {
      const modelsDir = path.join(exeDir, 'models')
      return fs.readdirSync(modelsDir)
        .filter(f => f.toLowerCase().endsWith('.param'))
        .map(f => f.replace(/\.param$/i, ''))
        .sort((a, b) => a.localeCompare(b))
    }
    if (id === 'waifu2x') {
      return fs.readdirSync(exeDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && e.name.startsWith('models-'))
        .map(e => e.name)
        .sort((a, b) => a.localeCompare(b))
    }
  } catch (e) { /* 忽略:目录不可读时返回空 */ }
  return []
}

// 各模型的可调参数描述(前端据此渲染;新增模型时在这里补一段即可)
const OPTION_SCHEMA = {
  realesrgan: [
    { key: 'model', label: '权重模型', type: 'weights', default: 'realesrgan-x4plus', hint: '安装包里自带的模型,可按图片风格选择' },
    { key: 'scale', label: '放大倍数', type: 'select', options: [2, 3, 4], default: 4 },
    { key: 'tileSize', label: '分块大小', type: 'number', default: 0, min: 0, max: 4096, hint: '0=自动;显存/内存不足时调小(如 128)' },
    { key: 'gpuId', label: 'GPU 编号', type: 'number', default: 0, min: 0, max: 7 },
    { key: 'tta', label: 'TTA 模式', type: 'bool', default: false, hint: '更精细但慢 8 倍左右' },
  ],
  waifu2x: [
    { key: 'model', label: '模型目录', type: 'weights', default: 'models-cunet', hint: 'cunet 平衡;upconv_7_anime_style_art_rgb 偏插画' },
    { key: 'scale', label: '放大倍数', type: 'select', options: [1, 2], default: 2 },
    { key: 'noiseLevel', label: '降噪等级', type: 'select', options: [-1, 0, 1, 2, 3], default: 0, hint: '-1=不降噪,数值越大降噪越强' },
    { key: 'tileSize', label: '分块大小', type: 'number', default: 0, min: 0, max: 4096, hint: '0=自动;内存不足时调小(如 128)' },
    { key: 'gpuId', label: 'GPU 编号', type: 'number', default: 0, min: 0, max: 7 },
    { key: 'tta', label: 'TTA 模式', type: 'bool', default: false, hint: '更精细但慢 8 倍左右' },
  ],
}

// 某个模型的默认参数对象
const defaultOptionsOf = (id) => {
  const schema = OPTION_SCHEMA[id] || []
  const out = {}
  for (const f of schema) out[f.key] = f.default
  return out
}

// ---------- 运行超分 ----------
// 返回 { ok, log } 或抛错;调用方负责把 outputPath 再按需缩放到目标尺寸
const runUpscale = (id, inputPath, outputPath, options = {}) => {
  const def = definitionOf(id)
  if (!def) return Promise.reject(new Error('未知的模型: ' + id))
  const exeName = def.exe[PLATFORM] || def.exe.linux
  const exePath = findExecutable(installDirOf(id), exeName)
  if (!exePath) return Promise.reject(new Error(def.name + ' 未安装,请先在 设置 → 功能 → 本地模型 中下载'))

  const args = ['-i', inputPath, '-o', outputPath]
  if (id === 'realesrgan') {
    // -n 权重模型;-s 输出倍数;可选 -t 分块 / -g 显卡 / -x TTA
    args.push('-n', String(options.model || def.defaultModel))
    args.push('-s', String(Math.min(Math.max(Number(options.scale) || 4, 2), 4)))
    if (Number(options.tileSize) > 0) args.push('-t', String(Number(options.tileSize)))
    if (options.gpuId !== undefined) args.push('-g', String(Number(options.gpuId) || 0))
    if (options.tta) args.push('-x')
  } else if (id === 'waifu2x') {
    // -m 模型目录;-s 放大倍数(1/2);-n 降噪等级
    if (options.model) args.push('-m', String(options.model))
    args.push('-s', String(Number(options.scale) >= 2 ? 2 : 1))
    args.push('-n', String(options.noiseLevel === undefined ? 0 : Number(options.noiseLevel)))
    if (Number(options.tileSize) > 0) args.push('-t', String(Number(options.tileSize)))
    args.push('-g', String(Number(options.gpuId) || 0))
    if (options.tta) args.push('-x')
  }

  const timeoutMs = Number(options.timeoutMs) || 10 * 60 * 1000
  return new Promise((resolve, reject) => {
    let log = ''
    let settled = false
    let proc
    try {
      // cwd 设为可执行文件所在目录 —— ncnn-vulkan 用相对路径 models/ 找权重
      proc = spawn(exePath, args, { cwd: path.dirname(exePath) })
    } catch (e) {
      return reject(new Error('启动 ' + def.name + ' 失败:' + ((e && e.message) || e)))
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { proc.kill() } catch (e) {}
      reject(new Error(def.name + ' 执行超时(' + Math.round(timeoutMs / 1000) + ' 秒)'))
    }, timeoutMs)
    const collect = (d) => { log += d.toString(); if (log.length > 4000) log = log.slice(-4000) }
    if (proc.stdout) proc.stdout.on('data', collect)
    if (proc.stderr) proc.stderr.on('data', collect)
    proc.on('error', (e) => {
      if (settled) return
      settled = true; clearTimeout(timer)
      reject(new Error('无法运行 ' + def.name + ':' + ((e && e.message) || e)))
    })
    proc.on('exit', (code) => {
      if (settled) return
      settled = true; clearTimeout(timer)
      if (code === 0) resolve({ ok: true, log })
      else reject(new Error(def.name + ' 退出码 ' + code + (log ? ':' + log.trim().slice(-300) : '')))
    })
  })
}
module.exports = {
  MODELS,
  PLATFORM,
  init,
  list,
  definitionOf,
  installDirOf,
  findExecutable,
  humanSize,
  dirSize,
  tasks,
  download,
  cancel,
  remove,
  runUpscale,
  setProxy,
  setMirror,
  listWeights,
  OPTION_SCHEMA,
  defaultOptionsOf,
  resolveDownloadUrl,
}
