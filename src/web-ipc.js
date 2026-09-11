// 网页版前端桥
// 在浏览器(非 Electron)环境中模拟 window.ipcRenderer / window.electronFunction:
// - invoke  → POST /api/ipc/:channel
// - on      → SSE(/api/events) 事件分发
// - sendSync→ 缓存的 path.sep
// - 本地路径(封面/阅读图片)自动改写为 /api/file?path=... 以便浏览器加载
// - select-folder / select-file 使用网页版目录选择器
if (typeof window !== 'undefined' && !window.ipcRenderer) {
  const FILE_PREFIX = '/api/file?path='

  const isLocalPath = (s) => typeof s === 'string' &&
    !s.startsWith('http://') && !s.startsWith('https://') &&
    !s.startsWith('data:') && !s.startsWith('blob:') &&
    !s.startsWith(FILE_PREFIX) &&
    (s.startsWith('/') || /^[A-Za-z]:[\\/]/.test(s) || s.startsWith('\\\\'))

  const toWebUrl = (p) => FILE_PREFIX + encodeURIComponent(p)
  const toLocalPath = (u) => u.startsWith(FILE_PREFIX) ? decodeURIComponent(u.slice(FILE_PREFIX.length)) : u

  // 服务端 → 前端:把 coverPath / thumbnailPath / (阅读事件中的) filepath 改写为可访问 URL
  const rewriteResponse = (value, extraKeys = []) => {
    const keys = ['coverPath', 'thumbnailPath', ...extraKeys]
    if (Array.isArray(value)) return value.map(v => rewriteResponse(v, extraKeys))
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        if (keys.includes(key) && isLocalPath(value[key])) {
          value[key] = toWebUrl(value[key])
        } else {
          value[key] = rewriteResponse(value[key], extraKeys)
        }
      }
      return value
    }
    return value
  }

  // 前端 → 服务端:把 /api/file?path= URL 还原为本地路径
  const rewriteRequest = (value) => {
    if (typeof value === 'string' && value.startsWith(FILE_PREFIX)) return toLocalPath(value)
    if (Array.isArray(value)) return value.map(rewriteRequest)
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) value[key] = rewriteRequest(value[key])
      return value
    }
    return value
  }

  // ---------- /api/info(同步获取 pathSep / version / webMode / 账户信息) ----------
  let pathSep = '\\'
  let webVersion = ''
  window.__WEB_MODE__ = false
  window.__REMOTE_DESKTOP__ = false
  window.__AUTH__ = { enabled: false, role: null, username: null }
  try {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', '/api/info', false)
    xhr.send()
    if (xhr.status === 200) {
      const info = JSON.parse(xhr.responseText)
      pathSep = info.pathSep || pathSep
      webVersion = info.version || ''
      window.__WEB_MODE__ = !!info.webMode
      // Windows 客户端远程桌面模式:数据来自 NAS,界面按桌面模式显示(设置与本地模式一致)
      window.__REMOTE_DESKTOP__ = !!info.remoteDesktop
      window.__AUTH__ = {
        enabled: !!info.auth,
        role: info.role || null,
        username: info.username || null,
      }
    }
  } catch (e) {}

  // ---------- SSE 事件分发 ----------
  const listeners = new Map()
  const sse = new EventSource('/api/events')
  sse.onmessage = (e) => {
    let data
    try { data = JSON.parse(e.data) } catch { return }
    if (!data || typeof data.channel !== 'string') return
    let arg = data.arg
    if (data.channel === 'manga-image' || data.channel === 'manga-thumbnail-image') {
      arg = rewriteResponse(arg, ['filepath'])
    }
    const fns = listeners.get(data.channel)
    if (fns) {
      for (const fn of [...fns]) {
        try { fn({}, arg) } catch (err) { console.error(err) }
      }
    }
  }

  // ---------- 目录/文件选择器 ----------
  const pickPath = (title, mode, filters) => new Promise((resolve) => {
    let current = ''
    let selectedFile = null
    let parent = null

    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif'
    const box = document.createElement('div')
    box.style.cssText = 'background:#fff;color:#333;width:640px;max-width:92vw;max-height:80vh;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden'
    box.innerHTML = `
      <div style="padding:14px 18px;font-size:15px;font-weight:600;border-bottom:1px solid #e5e5e5">${title}</div>
      <div style="display:flex;gap:8px;padding:10px 14px;border-bottom:1px solid #eee">
        <input type="text" style="flex:1;padding:7px 10px;border:1px solid #ccc;border-radius:6px;font-size:13px" placeholder="路径" />
        <button data-act="up" style="padding:6px 14px;border:1px solid #ccc;border-radius:6px;background:#f5f5f5;cursor:pointer;font-size:13px">上一级</button>
        <button data-act="go" style="padding:6px 14px;border:1px solid #409eff;border-radius:6px;background:#409eff;color:#fff;cursor:pointer;font-size:13px">进入</button>
      </div>
      <div data-role="list" style="flex:1;overflow-y:auto;padding:6px 0;min-height:220px;font-size:13px"></div>
      <div style="padding:10px 14px;border-top:1px solid #eee;display:flex;justify-content:flex-end;gap:10px">
        <button data-act="cancel" style="padding:6px 18px;border:1px solid #ccc;border-radius:6px;background:#fff;cursor:pointer;font-size:13px">取消</button>
        <button data-act="ok" style="padding:6px 18px;border:none;border-radius:6px;background:#409eff;color:#fff;cursor:pointer;font-size:13px">确定</button>
      </div>`
    overlay.appendChild(box)
    document.body.appendChild(overlay)

    const input = box.querySelector('input')
    const listEl = box.querySelector('[data-role="list"]')

    const joinPath = (base, name) => {
      if (base.endsWith('/') || base.endsWith('\\')) return base + name
      return base + (base.includes('\\') ? '\\' : '/') + name
    }

    const renderList = () => {
      listEl.innerHTML = '<div style="padding:12px 16px;color:#999">加载中…</div>'
      fetch(`/api/list-dir?path=${encodeURIComponent(current)}${mode === 'file' ? '&files=1' : ''}`)
        .then(r => r.json())
        .then(data => {
          if (data.error) {
            listEl.innerHTML = `<div style="padding:12px 16px;color:#e34">${data.error}</div>`
            return
          }
          current = data.path
          parent = data.parent
          input.value = current
          selectedFile = null
          listEl.innerHTML = ''
          const mkRow = (name, isDir) => {
            const row = document.createElement('div')
            row.style.cssText = 'padding:7px 16px;cursor:pointer;display:flex;align-items:center;gap:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
            row.textContent = (isDir ? '📁 ' : '📄 ') + name
            row.title = name
            row.onmouseenter = () => { row.style.background = '#f0f7ff' }
            row.onmouseleave = () => { if (!row.classList.contains('selected')) row.style.background = '' }
            row.onclick = () => {
              if (isDir) {
                current = joinPath(current, name)
                renderList()
              } else {
                listEl.querySelectorAll('.selected').forEach(el => { el.classList.remove('selected'); el.style.background = '' })
                row.classList.add('selected')
                row.style.background = '#d6e9ff'
                selectedFile = joinPath(current, name)
              }
            }
            return row
          }
          if (parent) listEl.appendChild(mkRow('..', true))
          for (const d of data.dirs) listEl.appendChild(mkRow(d, true))
          if (mode === 'file') for (const f of data.files) listEl.appendChild(mkRow(f, false))
          if (!data.dirs.length && (mode === 'dir' || !data.files.length)) {
            listEl.innerHTML = '<div style="padding:12px 16px;color:#999">(空目录)</div>'
          }
        })
        .catch(err => {
          listEl.innerHTML = `<div style="padding:12px 16px;color:#e34">${err.message}</div>`
        })
    }

    const onEnter = () => {
      const v = input.value.trim()
      if (v) { current = v; renderList() }
    }
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') onEnter() })
    box.querySelector('[data-act="go"]').onclick = onEnter
    box.querySelector('[data-act="up"]').onclick = () => { if (parent) { current = parent; renderList() } }
    box.querySelector('[data-act="cancel"]').onclick = () => { overlay.remove(); resolve(null) }
    box.querySelector('[data-act="ok"]').onclick = () => {
      let result = null
      if (mode === 'file') {
        result = selectedFile || (input.value.trim() || null)
      } else {
        result = input.value.trim() || current || null
      }
      overlay.remove()
      resolve(result)
    }
    renderList()
  })

  // ---------- invoke ----------
  const ipcInvoke = async (channel, ...args) => {
    const res = await fetch(`/api/ipc/${encodeURIComponent(channel)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args })
    })
    const data = await res.json().catch(() => null)
    if (res.status === 401) {
      // 会话失效/未登录:通知界面弹出登录框
      window.dispatchEvent(new Event('emm-auth-required'))
      throw new Error(data?.error || '未登录')
    }
    if (!res.ok || !data || data.ok !== true) {
      throw new Error(data?.error || `IPC ${channel} 调用失败`)
    }
    return rewriteResponse(data.result)
  }

  const invoke = async (channel, ...args) => {
    switch (channel) {
      case 'open-url':
        if (args[0]) window.open(args[0], '_blank')
        return
      case 'copy-text-to-clipboard':
        try { await navigator.clipboard.writeText(args[0] || '') } catch (e) { console.warn(e) }
        return
      case 'read-text-from-clipboard':
        try { return await navigator.clipboard.readText() } catch (e) { return '' }
      case 'get-locale':
        return navigator.language || 'en-US'
      case 'get-path-sep':
        return pathSep
      case 'set-progress-bar':
        return // 进度由 SSE send-action 驱动
      case 'update-window-title':
        document.title = args[0] ? `${window.__APP_NAME__ || 'EX漫画管理器(exhentai-manga-manager)'} | ${args[0]}` : (window.__APP_NAME__ || 'EX漫画管理器(exhentai-manga-manager)')
        return
      case 'switch-fullscreen':
        try {
          if (document.fullscreenElement) await document.exitFullscreen()
          else await document.documentElement.requestFullscreen()
        } catch (e) {}
        return
      case 'select-folder':
        return await pickPath(args[0] || '选择文件夹', 'dir')
      case 'select-file':
        return await pickPath(args[0] || '选择文件', 'file', args[1])
      case 'import-sqlite': {
        const p = await pickPath('选择 sqlite 数据库文件', 'file')
        if (!p) return { success: false }
        // bookList 中的 coverPath 是 URL,需还原为本地路径再交给服务端
        return ipcInvoke(channel, rewriteRequest({ bookList: args[0], sqliteFilePath: p }))
      }
      case 'copy-image-to-clipboard':
        try {
          const url = args[0]
          if (!url) return
          const blob = await (await fetch(url)).blob()
          await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
        } catch (e) { console.warn('复制图片失败(浏览器剪贴板需要 HTTPS 或 localhost)', e) }
        return
      case 'show-file': {
        // 网页版(含 Docker/NAS 与远程桌面模式):新标签页打开 NAS 上的目录浏览页
        const p = args[0]
        if (p) window.open('/browse?path=' + encodeURIComponent(p), '_blank')
        return
      }
      case 'open-local-book':
        console.warn(`[网页版] ${channel} 在浏览器中不可用`)
        return
      case 'use-new-cover': {
        // 返回的是裸的封面本地路径,需要改写为可访问 URL
        const coverPath = await ipcInvoke(channel, ...args.map(rewriteRequest))
        return isLocalPath(coverPath) ? toWebUrl(coverPath) : coverPath
      }
      default:
        return ipcInvoke(channel, ...args.map(rewriteRequest))
    }
  }

  window.ipcRenderer = {
    invoke,
    on: (channel, listener) => {
      if (!listeners.has(channel)) listeners.set(channel, [])
      listeners.get(channel).push(listener)
    },
    sendSync: (channel) => {
      if (channel === 'get-path-sep') return pathSep
      return undefined
    },
  }

  window.electronFunction = {
    'get-zoom-level': () => 0,
    'set-zoom-level': () => {},
    'insert-css': (css) => {
      const style = document.createElement('style')
      style.textContent = css
      document.head.appendChild(style)
    },
  }
}
