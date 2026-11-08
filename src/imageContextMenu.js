// =============================================================================
// 图片右键菜单(共享):阅读器 / 侧边详细信息预览 / 信息界面预览 三处共用同一套。
//
// 为什么抽出来:这三处右键的对象都是「一张漫画图片」,动作完全一样
// (复制图片 / 图片属性 / 设为封面 / 重命名 / 恢复备份 / 超分 / 提取文字 / 翻译 / 上色 / 删除)。
// 以前只有阅读器有这套,预览图那边是简化的「打开 / 复制路径」四项 —— 用户要求统一。
//
// 用法:
//   const items = await buildImageContextMenuItems({ image, book, t, deps })
//   ContextMenu.showContextMenu({ x, y, items: sortContextMenuItems(setting, 'image', items) })
//
// image 字段:{ id, filepath, relativePath }
// deps 里只需给「弹窗怎么弹」(showImageProperties / renameImageFile / ...)与通知,
// 其余纯 IPC 动作这里已经实现,调用方不重复写。
// =============================================================================
import { ElMessageBox } from 'element-plus'
import { h } from 'vue'

// ⚠ 不要 import ipcRenderer!
//   preload.js 用 contextBridge 把它挂在 window 上(preload.js:3),
//   全项目组件都是直接用全局名。一旦 import electron 模块,
//   打包器会把 Electron 主进程代码塞进渲染端 → __dirname is not defined → 整页白屏。
const ipc = () => window.ipcRenderer

const formatBytes = (n) => {
  const v = Number(n) || 0
  if (v < 1024) return v + ' B'
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB'
  return (v / 1024 / 1024).toFixed(2) + ' MB'
}
const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

// 「图片属性」弹窗(纯 IPC + 只读展示,与阅读器里那份一致)
const defaultShowImageProperties = async (image, t, printMessage) => {
  const p = (image && (image.filepath || image.absolutePath || image.path)) || ''
  if (!p) return
  try {
    const res = await ipc().invoke('image-file-info', p)
    if (!res || !res.ok) {
      printMessage('error', (res && res.error) || t('c.imagePropertiesFailed'))
      return
    }
    const fmt = String(res.format || res.ext || '').toUpperCase() || '-'
    const detail = res.channels
      ? fmt + '(' + res.channels + ' 通道' + (res.depth ? ' / ' + res.depth + ' bit' : '') + ')'
      : fmt
    const rows = [
      [t('c.propName'), res.name || '-'],
      [t('c.propSize'), formatBytes(res.size) + '(' + Number(res.size || 0).toLocaleString() + ' 字节)'],
      [t('c.propResolution'), (res.width && res.height) ? (res.width + ' × ' + res.height) : '-'],
      [t('c.propFormat'), detail],
      [t('c.propModified'), res.mtime ? new Date(res.mtime).toLocaleString() : '-'],
      [t('c.propPath'), res.filePath || p]
    ]
    const html = '<div style="max-height:52vh;overflow:auto">' + rows.map(([k, v]) =>
      '<div style="display:flex;gap:10px;padding:4px 0;border-bottom:1px solid rgba(128,128,128,.15)">'
      + '<span style="flex:0 0 76px;opacity:.65">' + escapeHtml(k) + '</span>'
      + '<span style="flex:1;word-break:break-all">' + escapeHtml(v) + '</span>'
      + '</div>'
    ).join('') + '</div>'
    await ElMessageBox.alert(html, t('m.imageProperties'), {
      dangerouslyUseHTMLString: true,
      confirmButtonText: t('c.close')
    })
  } catch (e) { /* 用户关闭弹窗 */ }
}

// 「重命名图片」:只对文件夹型书有效
const defaultRenameImageFile = async (image, book, t, printMessage) => {
  if (!book || book.type !== 'folder') {
    printMessage('warning', t('c.renameFolderOnly'))
    return
  }
  try {
    const { value } = await ElMessageBox.prompt(
      t('m.renameImage'), t('m.renameImage'),
      { inputValue: String(image.filepath).split(/[\\/]/).pop() || '' }
    )
    const res = await ipc().invoke('rename-image', { oldPath: image.filepath, newName: value })
    if (res && res.ok) {
      image.filepath = res.path
      const bookDir = String(book.filepath || '').replace(/[\\/]+$/, '')
      const newPath = String(res.path)
      image.relativePath = newPath.startsWith(bookDir) ? newPath.slice(bookDir.length).replace(/^[\\/]/, '') : newPath
      printMessage('success', t('c.renameDone'))
      return res
    }
    printMessage('error', (res && res.error) || t('c.renameFailed'))
    return null
  } catch (e) { return null /* 用户取消 */ }
}

// 「提取文字」(OCR)
const defaultExtractText = async (image, t, printMessage) => {
  try {
    const res = await ipc().invoke('extract-image-text', image.filepath)
    if (res && res.ok) {
      ElMessageBox.alert(
        h('pre', { style: 'white-space: pre-wrap; text-align: left; max-height: 50vh; overflow: auto; margin: 0' }, res.text || t('c.ocrEmpty')),
        t('m.extractImageText'),
        { confirmButtonText: t('c.close'), showClose: true }
      )
    } else {
      printMessage('error', (res && res.error) || t('c.ocrFailed'))
    }
  } catch (e) {
    printMessage('error', t('c.ocrFailed') + ':' + ((e && e.message) || ''))
  }
}

// ---------- 预览项(侧边详细信息 / 信息界面)专用小工具 ----------
// 预览项长这样:{ src(显示用)、thumb(小图)、raw(原始绝对路径)、loaded }
// 它**不是**阅读器那种 image 对象,没有 relativePath —— 而「删除图片」必须靠 relativePath
// 定位到书里的那一页,所以这里统一算一次(以前调用方直接写 it.relativePath || '' 恒为空串,
// 删除图片永远返回「参数不完整 = 删不掉」)。
const imageObjectFromPreview = (it, book) => {
  const raw = String((it && it.raw) || '')
  const b = book || {}
  const bookPath = String(b.filepath || '')
  const bookType = String(b.type || '')
  let rel = String((it && it.relativePath) || '')
  if (!rel && raw) {
    if (bookType === 'folder') {
      // 文件夹书:相对「书根目录」的路径
      const base = bookPath.replace(/[\\/]+$/, '')
      rel = (base && raw.startsWith(base)) ? raw.slice(base.length).replace(/^[\\/]+/, '') : raw
    } else {
      // 压缩包书:删除要用「包内条目名」,解压出来的文件基本名就是条目名
      rel = String(raw).split(/[\\/]/).pop() || ''
    }
  }
  return { id: raw, filepath: raw, absolutePath: raw, path: raw, relativePath: rel }
}

// 内容被改过(改名 / 恢复备份 / 超分)→ 让这一格重新加载。
// ★ 显示用的是 it.thumb(主进程压的小图),它的缓存键含文件的 mtime ——
//   内容变了旧小图就是错的,不清掉的话界面看起来「点了没反应」。
const refreshPreviewItem = (it) => {
  if (!it) return
  it.thumb = ''
  const s = String(it.src || '').split('?_n=')[0].split('&_n=')[0]
  it.src = s + (s.includes('?') ? '&' : '?') + '_n=' + Date.now()
  it.loaded = false
}

/**
 * 构造「图片右键菜单」的 items。
 * @returns {Promise<Array>} 菜单项;全部被过滤时返回空数组(调用方应直接 return,不弹空菜单)
 */
const buildImageContextMenuItems = async ({ image, book, t, deps = {} }) => {
  const {
    showImageProperties = (img) => defaultShowImageProperties(img, t, deps.printMessage || (() => {})),
    // 默认实现跑完(改名成功)后回调 onRenamed,让调用方把预览项上的路径也更新掉 ——
    // 否则预览格还拿着旧路径:后续右键操作全部指向一个已不存在的文件
    renameImageFile = async (img) => {
      const res = await defaultRenameImageFile(img, book, t, deps.printMessage || (() => {}))
      if (res && res.ok && typeof deps.onRenamed === 'function') deps.onRenamed(img, res)
      return res
    },
    useNewCover = async (fp) => {
      const r = await ipc().invoke('use-new-cover', book && book.filepath, fp)
      if (!(r && r.ok)) (deps.printMessage || (() => {}))('error', t('c.useNewCoverFail'))
    },
    upscaleViewerImage = null,
    extractViewerImageText = (img) => defaultExtractText(img, t, deps.printMessage || (() => {})),
    onRestoreBakDone = () => {},
    onDeleted = () => {},
    onUpscaled = () => {},
    printMessage = () => {},
    viewerRole = false
  } = deps

  const items = [
    {
      id: 'copyImage',
      label: t('c.copyImageToClipboard'),
      onClick: () => {
        try { ipc().invoke('copy-image-to-clipboard', image.filepath) } catch (e) { /* 忽略 */ }
      }
    },
    {
      id: 'imageProperties',
      label: t('m.imageProperties'),
      onClick: () => showImageProperties(image)
    },
    {
      id: 'setCover',
      label: t('c.designateAsCover'),
      onClick: () => useNewCover(image.filepath)
    },
    {
      id: 'renameImage',
      label: t('m.renameImage'),
      onClick: () => renameImageFile(image)
    },
    {
      id: 'restoreImageBak',
      label: t('c.restoreImageBak'),
      onClick: async () => {
        let res = null
        try {
          res = await ipc().invoke('restore-image-bak', image.filepath)
        } catch (err) {
          printMessage('error', t('c.restoreBookBakFail') + ': ' + ((err && err.message) || err))
          return
        }
        if (res && res.ok) {
          onRestoreBakDone(image)
          printMessage('success', t('c.restoreImageBakDone'))
        } else {
          printMessage('warning', (res && res.error) || t('c.restoreNoBak'))
        }
      }
    },
    {
      id: 'upscaleImage',
      label: t('m.upscaleImage'),
      onClick: async () => {
        // 调用方给了自定义实现(阅读器)就用它的,否则走内置的纯 IPC 版本
        if (upscaleViewerImage) return upscaleViewerImage(image)
        try {
          const res = await ipc().invoke('upscale-image', image.filepath)
          if (res && res.ok) {
            if (res.skipped) {
              printMessage('info', t('c.upscaleSkipped', {
                width: res.width, height: res.height,
                minWidth: res.minWidth, minHeight: res.minHeight
              }))
              return
            }
            onUpscaled(image, res)
            if (!res.mode || res.mode === 'replace') printMessage('success', t('c.upscaleDone'))
          } else {
            printMessage('error', (res && res.error) || t('c.upscaleFailed'))
          }
        } catch (e) {
          printMessage('error', t('c.upscaleFailed') + ':' + ((e && e.message) || ''))
        }
      }
    },
    {
      id: 'ocrImage',
      label: t('m.extractImageText'),
      onClick: () => extractViewerImageText(image)
    },
    {
      id: 'translateImage',
      label: t('m.translateImage'),
      onClick: async () => {
        try {
          const p = image.filepath || image.absolutePath || image.path || ''
          if (!p) return
          const res = await ipc().invoke('extract-image-text', p)
          const text = (res && (res.text || res.result)) || ''
          if (text) printMessage('success', text.slice(0, 60))
          else printMessage('warning', (res && res.error) || t('m.extractImageText'))
        } catch (e) {
          printMessage('error', String((e && e.message) || e))
        }
      }
    },
    {
      id: 'colorizeImage',
      label: t('m.colorize'),
      onClick: () => printMessage('warning', t('m.colorization') + ': ' + t('c.featureComingSoon'))
    },
    {
      id: 'deleteImage',
      label: t('c.deleteImage'),
      onClick: async () => {
        const bookPath = (book && book.filepath) || ''
        const bookType = (book && book.type) || ''
        const r = await ipc().invoke('delete-image', image.relativePath, bookPath, bookType)
        const ok = r === true || !!(r && r.ok)
        if (ok) {
          onDeleted(image)
          const isArchive = bookType === 'zip' || bookType === 'archive'
          printMessage('success', t(isArchive ? 'c.imageDeletedWithBackup' : 'c.imageTrashed'))
        } else {
          printMessage('error', t('c.deleteImageError') + ((r && r.error) ? ':' + r.error : ''))
        }
      }
    }
  ]
  // 只读账户:隐藏写操作(与阅读器同一套过滤规则)
  return items.filter(item => {
    if (viewerRole && ['setCover', 'renameImage', 'upscaleImage', 'ocrImage', 'deleteImage'].includes(item.id)) return false
    return true
  })
}

export { buildImageContextMenuItems, imageObjectFromPreview, refreshPreviewItem }
