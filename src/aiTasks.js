// AI 任务运行器:批量 = 单次任务的复用
// 每张图片调用一次单次任务(超分/文字提取/上色/翻译),期间:
//  - 封面显示旋转进度(翻/色/分/字)
//  - 支持右键「暂停 / 继续 / 中止」
const ipc = () => (typeof window !== 'undefined' && window.ipcRenderer) || null
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export async function listBookImages (book) {
  const c = ipc()
  if (!c) return []
  const res = await c.invoke('ai-list-images', { filepath: book.filepath, type: book.type })
  if (res && res.ok && Array.isArray(res.images)) return res.images
  // 兼容:回退到阅读器用的列表接口
  const res2 = await c.invoke('load-manga-image-list', JSON.parse(JSON.stringify(book)))
  const arr = Array.isArray(res2) ? res2 : (res2 && (res2.list || res2.images)) || []
  return arr.map(x => (x && (x.absolutePath || x.path || x.filepath)) || x).filter(p => typeof p === 'string')
}

// 单次任务分发(kind: upscale / extract / translate / colorize)
export async function runSingleImageTask (kind, filepath, opts = {}) {
  const c = ipc()
  if (!c) return { ok: false, error: 'no-ipc' }
  const { profileId, targetLang, mode, book } = opts
  if (kind === 'upscale') return await c.invoke('upscale-image', filepath)
  if (kind === 'extract') return await c.invoke('extract-image-text', filepath)
  if (kind === 'translate') {
    // 单次任务 = 文字提取 + 文字翻译
    const ocr = await c.invoke('extract-image-text', filepath)
    const text = (ocr && (ocr.text || ocr.result)) || ''
    if (!text) return { ok: false, error: (ocr && ocr.error) || '未识别到文字' }
    const tr = await c.invoke('ai-translate-text', { text, targetLang, profileId })
    if (!tr || !tr.ok) return { ok: false, error: (tr && tr.error) || '翻译失败', source: text }
    return { ok: true, source: text, text: tr.text, target: tr.target }
  }
  if (kind === 'colorize') return await c.invoke('ai-colorize-image', { filepath, profileId })
  return { ok: false, error: 'unknown-kind' }
}

export async function runBookAiTask (appStore, book, kind, onProgress, opts = {}) {
  const id = book && book.id
  if (!id) return { ok: false, error: 'no-book' }
  appStore.setBookTask(id, kind)
  if (!appStore.bookTaskProgress) appStore.bookTaskProgress = {}
  appStore.bookTaskProgress[id] = { done: 0, total: 0, kind }
  try {
    const images = await listBookImages(book)
    const prog = appStore.bookTaskProgress[id]
    prog.total = images.length
    const results = []
    for (const p of images) {
      // 暂停:自旋等待;中止:抛错结束
      while (appStore.isBookTaskPaused && appStore.isBookTaskPaused(id)) {
        if (appStore.bookTaskAborted && appStore.bookTaskAborted[id]) throw new Error('aborted')
        await sleep(400)
      }
      if (appStore.bookTaskAborted && appStore.bookTaskAborted[id]) throw new Error('aborted')
      try {
        const r = await runSingleImageTask(kind, p, {
          profileId: opts.profileId || (kind === 'colorize' ? appStore.setting?.colorizeApiProfileId : appStore.setting?.infoProcessApiProfileId),
          targetLang: appStore.setting?.translateTargetLang,
          book,
        })
        results.push({ path: p, res: r })
      } catch (e) {
        results.push({ path: p, error: String((e && e.message) || e) })
      }
      prog.done++
      if (onProgress) onProgress(prog.done, prog.total)
    }
    // 翻译产物按「翻译保存位置」落盘
    if (kind === 'translate') {
      const texts = results.map((r, i) => '【' + (i + 1) + '】' + ((r.res && r.res.text) || ('(失败:' + (r.res && r.res.error) + ')')))
      const body = texts.join('\n\n')
      const mode = (appStore.setting && appStore.setting.translateSaveMode) || 'preview'
      const c = ipc()
      let saved = null
      if (c) {
        const sres = await c.invoke('ai-save-text', { book, text: body, fileName: 'AI翻译.txt', mode: mode === 'folder' ? 'folder' : 'preview' })
        saved = sres && sres.path
      }
      return { ok: true, total: images.length, results, saved, preview: saved ? '' : body.slice(0, 2000) }
    }
    return { ok: true, total: images.length, results }
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) }
  } finally {
    appStore.clearBookTask(id)
    if (appStore.bookTaskProgress) delete appStore.bookTaskProgress[id]
    if (appStore.bookTaskAborted) delete appStore.bookTaskAborted[id]
  }
}
