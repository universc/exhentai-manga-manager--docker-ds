<template>
  <!-- 侧边详细信息:与「下载记录」同款的右栏(可拖宽度)。
       内容排布照 JHenTai 的详情页:左封面 + 右标题/评分,下面依次是信息行、操作按钮、标签分组。
       数据源是 pinia 里的 bookDetail(点开任意一本的详情/封面后自动跟着变) -->
  <div class="detail-panel" :style="{ width: width + 'px' }">
    <div class="detail-panel-resizer" :title="$t('m.downloadPanelResizeHint')" @mousedown="startResize"></div>
    <div class="detail-panel-header">
      <span class="detail-panel-title">{{ $t('m.sideDetailTitle') }}</span>
      <span class="detail-panel-actions">
        <el-button v-if="book.online" size="small" text :icon="MdRefresh" :title="$t('m.sideDetailRefresh')" :loading="detailLoading" @click="refreshDetail"></el-button>
        <el-button size="small" text @click="$emit('close')">✕</el-button>
      </span>
    </div>
    <div class="detail-panel-body" v-if="book.id">
      <!-- 封面 + (标题 / 副标题 / 评分 / 类别 / 信息行):全部靠左,信息行贴在评分下面 -->
      <div class="detail-head">
        <!-- 左列:封面 + 评分(评分放到封面下方) -->
        <div class="detail-head-left">
          <div class="detail-cover-wrap" :title="$t('m.read')" @click="$emit('read', book)">
            <img v-if="book.coverPath" :src="book.coverPath" class="detail-cover" />
            <div v-else class="detail-cover detail-cover-empty"></div>
          </div>
          <el-rate class="detail-rate" :model-value="Number(book.rating) || 0" size="small" allow-half disabled />
        </div>
        <!-- 右列:标题 / 副标题 / 信息行(全部靠左;面板窄时信息行隐藏) -->
        <div class="detail-head-info">
          <div class="detail-title" :title="mainTitle">{{ mainTitle }}</div>
          <div class="detail-subtitle" v-if="subTitle" :title="subTitle">{{ subTitle }}</div>
          <div class="detail-info" v-if="!isNarrow">
            <div class="detail-info-row">
              <span class="k">{{ $t('m.sideDetailPages') }}</span>
              <span class="v">{{ book.pageCount == null ? (book.filecount == null ? '—' : book.filecount) : book.pageCount }}</span>
            </div>
            <div class="detail-info-row" v-if="book.online">
              <span class="k">{{ $t('m.ehOnlineUploader') }}</span>
              <span class="v" :title="book.uploader">{{ book.uploader || '—' }}</span>
            </div>
            <div class="detail-info-row" v-if="book.online">
              <span class="k">{{ $t('m.sideDetailLanguage') }}</span>
              <span class="v" :title="book.language">{{ book.language || '—' }}</span>
            </div>
            <div class="detail-info-row" v-if="book.online">
              <span class="k">{{ $t('m.sideDetailSize') }}</span>
              <span class="v">{{ book.size || '—' }}</span>
            </div>
            <div class="detail-info-row" v-if="book.posted">
              <span class="k">{{ $t('m.sideDetailPosted') }}</span>
              <span class="v">{{ book.posted }}</span>
            </div>
            <div class="detail-info-row" v-if="!book.online">
              <span class="k">{{ $t('m.sideDetailReadCount') }}</span>
              <span class="v">{{ book.readCount || 0 }}</span>
            </div>
          </div>
        </div>
        <!-- 分类标签:信息区右下的角上,底边和封面底边对齐 -->
        <div class="detail-cat-badge" v-if="book.category" :title="book.category">
          <el-tag size="small" type="info" class="detail-tag" @click="onTagClick(book.category, 'category')">{{ book.category }}</el-tag>
        </div>
      </div>
      <!-- 操作按钮:照 JHenTai 用「图标 + 文字」的小按钮;两个下载按钮合并成一个(弹窗里选原图) -->
      <div class="detail-actions">
        <el-button class="detail-act" size="small" :icon="View" @click="$emit('read', book)">{{ $t('m.read') }}</el-button>
        <el-button v-if="book.online && !viewerRole" class="detail-act" size="small" :icon="Download" @click="$emit('download-gallery', { book, original: false })">{{ $t('m.download') }}</el-button>
        <!-- 种子:JHenTai 同款回形针图标;数量直接跟在按钮后面 -->
        <el-button v-if="book.online" class="detail-act" size="small" :icon="MdAttach" @click="$emit('open-torrents', book)">{{ $t('m.torrent') }}<template v-if="book.torrentCount != null"> {{ book.torrentCount }}</template></el-button>
        <el-button v-if="book.online" class="detail-act" size="small" :icon="Star" @click="$emit('favorite', book)">{{ book.favcat == null ? $t('m.favorite') : $t('m.favoriteRemoveOption') }}</el-button>
        <el-button v-if="book.online" class="detail-act" size="small" :icon="Link" @click="openInBrowser">{{ $t('m.ehOnlineOpen') }}</el-button>
        <el-button v-else class="detail-act" size="small" :icon="FolderOpened" @click="showFile">{{ $t('m.sideDetailShowFile') }}</el-button>
      </div>
      <!-- 标签分组:点一个标签 = 按它搜(JHenTai 详情页点标签也是这个动作) -->
      <div class="detail-tags">
        <template v-if="tagGroups.length">
          <div class="detail-tag-group" v-for="g in tagGroups" :key="g.cat">
            <span class="detail-tag-cat">{{ g.label }}</span>
            <el-tag v-for="tag in g.tags" :key="tag" size="small" class="detail-tag" @click="onTagClick(tag, g.cat)">{{ tag }}</el-tag>
          </div>
        </template>
        <div class="detail-tags-empty" v-else>{{ $t('m.sideDetailNoTags') }}</div>
      </div>
      <!-- 评论:在浏览图上方(在线画廊才有;设置里关了「显示评论」就不拉) -->
      <div class="detail-comments" v-if="comments.length">
        <div class="detail-comments-title">{{ $t('m.comment') }} · {{ comments.length }}</div>
        <div class="detail-comment" v-for="c in comments" :key="c.id">
          <div class="dc-head">
            <span class="dc-author" :title="c.author">{{ c.author }}</span>
            <span class="dc-score">{{ c.score }}</span>
          </div>
          <div class="dc-content">{{ c.content }}</div>
        </div>
      </div>
      <!-- 页预览:显示**全部页**,自动换行的网格(像 JHenTai 的页预览),竖向滚动;点一下 = 打开阅读器 -->
      <div class="detail-preview" v-if="previewItems.length || previewLoading || previewError">
        <div class="detail-preview-grid" v-if="previewItems.length">
          <div
            v-for="(it, i) in previewItems"
            :key="i"
            class="detail-preview-item"
            :title="'P' + (i + 1)"
            @click="emit('read', book, i)"
          >
            <div v-if="it.sprite" class="detail-preview-sprite" :style="it.sprite" />
            <img v-else :src="it.src" loading="lazy" @error="$event.target.style.display='none'" />
          </div>
        </div>
        <div v-if="previewLoading && !previewItems.length" class="detail-preview-loading">
          <el-icon class="is-loading" :size="16"><Loading /></el-icon>
        </div>
        <div v-else-if="previewError && !previewItems.length" class="detail-preview-error">{{ previewError }}</div>
      </div>
      <div class="detail-loading" v-if="detailLoading">
        <el-icon class="is-loading" :size="14"><Loading /></el-icon> {{ $t('m.sideDetailLoading') }}
      </div>
    </div>
    <div class="detail-empty" v-else>{{ $t('m.sideDetailEmpty') }}</div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Loading, View, Download, Star, Link, FolderOpened } from '@element-plus/icons-vue'
import { MdAttach } from '@vicons/ionicons4'
import { MdRefresh } from '@vicons/ionicons4'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import { parseGalleryDetail, mergeDetailIntoBook, ehImageSrc } from '../ehOnline.js'
import { catDisplayName, toAssetUrl } from '../utils.js'

const props = defineProps({
  // 面板宽度(px):App.vue 持有并持久化,拖动时双向同步
  width: { type: Number, default: 360 },
  // 面板是否可见:藏起来时不自动拉 EH 详情(省请求,也少给 EH 添乱)
  visible: { type: Boolean, default: true }
})
const emit = defineEmits(['close', 'update:width', 'read', 'download-gallery', 'open-torrents', 'favorite', 'search-from-tag', 'refresh-list'])

const appStore = useAppStore()
const { bookDetail, setting } = storeToRefs(appStore)
const { t } = useI18n()

const detailLoading = ref(false)
// 网页版只读账户:下载按钮不显示(服务端也会拦)
const viewerRole = computed(() => {
  const auth = window.__AUTH__ || {}
  return !!auth.enabled && auth.role === 'viewer'
})
// 面板窄了就把「信息行」藏起来(用户要求:位置不够时隐藏)
const isNarrow = computed(() => Number(props.width || 0) < 300)
// 评论(在线画廊):详情页 #cdiv>.c1 里的作者/评分/内容
const comments = ref([])
const loadComments = async (b) => {
  comments.value = []
  if (!b || !b.online || !b.url) return
  if (setting.value.showComment === false) return
  try {
    const cookie = ['igneous', 'ipb_pass_hash', 'ipb_member_id', 'star']
      .map(k => k + '=' + (setting.value[k] || ''))
      .join('; ')
    const html = await ipcRenderer.invoke('get-ex-webpage', { url: b.url, cookie })
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const list = []
    doc.querySelectorAll('#cdiv>.c1').forEach((e, i) => {
      const author = ((e.querySelector('.c2 .c3') || {}).textContent || '').trim()
      const scoreEls = e.querySelectorAll('.c2 .nosel')
      const score = scoreEls.length ? (scoreEls[scoreEls.length - 1].textContent || '').trim() : ''
      let content = (e.querySelector('.c6') || {}).innerHTML || ''
      content = content.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .trim()
      if (!author && !content) return
      list.push({ id: i + '-' + author, author, score, content })
    })
    comments.value = list.slice(0, 12)
  } catch (e) { comments.value = [] }
}
// 页预览:在线 = 详情页雪碧缩略图;本地 = 前几页图片。点一下打开阅读器。
const PREVIEW_W = 92
const previewItems = ref([])
const previewLoading = ref(false)
const previewError = ref('')
const spriteStyleOf = (th) => {
  const w = th.width || 200
  const sc = PREVIEW_W / w
  return {
    width: w + 'px',
    height: (th.height || 287) + 'px',
    backgroundImage: `url(${ehImageSrc(th.thumb)})`,
    backgroundPosition: `-${th.offsetX || 0}px 0`,
    transform: `scale(${sc})`,
    transformOrigin: '0 0',
    marginRight: '-' + Math.round(w - w * sc) + 'px',
    marginBottom: '-' + Math.round((th.height || 287) - (th.height || 287) * sc) + 'px'
  }
}
// 本地书:后端直接给前几页的文件路径
const loadLocalPreview = async (b) => {
  if (!b || !b.filepath) return
  // limit: 0 = 全部页(目录书直接给所有图片路径;压缩包最多前 60 页)
  const res = await ipcRenderer.invoke('book-preview-images', { filepath: b.filepath, type: b.type, limit: 0 })
  if (res && res.ok && res.files && res.files.length) {
    previewItems.value = res.files.map(f => ({ src: toAssetUrl(f) }))
  }
}

const book = computed(() => (bookDetail.value && bookDetail.value.id) ? bookDetail.value : {})
const mainTitle = computed(() => book.value.title_jpn || book.value.title || '')
const subTitle = computed(() => {
  const b = book.value
  const sub = b.title_cn || b.title
  return sub && sub !== mainTitle.value ? sub : ''
})
// 标签按 namespace 分组;分类名优先用设置里的翻译,没有再退回内置中文名
const tagGroups = computed(() => {
  const tags = book.value.tags || {}
  const translated = (appStore.resolvedTranslation) || {}
  return Object.keys(tags).map(cat => {
    let tags_ = tags[cat] || []
    // category 键在本地书里也可能出现(用户自建类别),原样展示即可
    return {
      cat,
      label: (setting.value.showTranslation && translated[cat] && translated[cat]._name) || catDisplayName(cat) || cat,
      tags: Array.isArray(tags_) ? tags_ : []
    }
  }).filter(g => g.tags.length)
})

// 换书时:在线画廊如果还没拉过详情(没有上传者信息),自动补一次 ——
// 与 BookDetailDialog 的 enrichOnlineBook 同一套口径,合并回同一个 store 对象。
// 面板藏起来(v-show)时不拉:只给看得见的面板发请求
watch(() => book.value.id, async (id) => {
  const b = book.value
  if (!props.visible) return
  previewItems.value = []
  previewError.value = ''
  if (!id || !b || !b.id) return
  // 评论:在线画廊才拉(不阻塞预览)
  loadComments(b)
  // 预览:本地书直接取图;在线书等详情(传略图)回来再出
  if (!b.online) {
    previewLoading.value = true
    try { await loadLocalPreview(b) } catch (e) { /* 预览失败不打扰 */ } finally { previewLoading.value = false }
    return
  }
  if ((b.thumbnails || []).length) {
    previewItems.value = b.thumbnails.map(th => ({ sprite: spriteStyleOf(th) }))
    return
  }
  if (b.uploader || detailLoading.value) return
  await refreshDetail()
})

const refreshDetail = async () => {
  const b = book.value
  if (!b || !b.online || !b.url) return
  detailLoading.value = true
  try {
    const cookie = ['igneous', 'ipb_pass_hash', 'ipb_member_id', 'star']
      .map(k => k + '=' + (setting.value[k] || ''))
      .join('; ')
    const host = String(b.url).replace(/^https?:\/\//i, '').split('/')[0] || 'e-hentai.org'
    const html = await ipcRenderer.invoke('get-ex-webpage', { url: b.url, cookie })
    const detail = parseGalleryDetail(html, host)
    if (detail.ok) {
      Object.assign(bookDetail.value, mergeDetailIntoBook(bookDetail.value, detail))
      // 详情页的雪碧缩略图 → 侧栏预览
      if ((detail.thumbnails || []).length) {
        previewItems.value = detail.thumbnails.map(th => ({ sprite: spriteStyleOf(th) }))
      }
    } else {
      ElMessage.warning(t('m.ehOnlineFailed'))
    }
  } catch (e) {
    ElMessage.warning(t('m.ehOnlineFailed'))
  } finally {
    detailLoading.value = false
  }
}

const onTagClick = (tag, cat) => {
  emit('search-from-tag', tag, cat)
}

const openInBrowser = () => {
  const url = book.value.url
  if (url) ipcRenderer.invoke('open-url', url)
}

const showFile = () => {
  const fp = book.value.filepath
  if (fp) ipcRenderer.invoke('show-file', fp)
}


// 拖左边缘调宽度(与下载记录面板同款;宽度由 App.vue 持久化)
const startResize = (e) => {
  e.preventDefault()
  const startX = e.clientX
  const startW = props.width
  const onMove = (ev) => {
    const next = startW + (startX - ev.clientX)
    emit('update:width', Math.max(240, Math.min(next, Math.max(320, window.innerWidth - 420))))
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
</script>

<style lang="stylus">
.detail-panel
  position: relative
  flex: none
  display: flex
  flex-direction: column
  box-sizing: border-box
  min-width: 240px
  max-width: 70vw
  height: calc(100vh - 8px)
  padding: 10px 10px 10px 6px
  border-left: 1px solid var(--el-border-color)
  background: var(--el-bg-color, #fff)
  overflow: hidden
  // 拖宽的手柄:贴着左边缘的一条窄条(不要高亮色,安安静静能拖就行)
  .detail-panel-resizer
    position: absolute
    left: -3px
    top: 0
    bottom: 0
    width: 6px
    cursor: col-resize
    z-index: 5
  .detail-panel-header
    display: flex
    align-items: center
    justify-content: space-between
    gap: 8px
    padding-bottom: 8px
    font-size: 15px
    .detail-panel-title
      font-weight: 600
    .detail-panel-actions
      display: flex
      align-items: center
      gap: 2px
      flex: none
  .detail-panel-body
    flex: 1
    min-height: 0
    overflow-y: auto
    display: flex
    flex-direction: column
    gap: 10px
  .detail-empty
    flex: 1
    display: flex
    align-items: center
    justify-content: center
    padding: 24px
    text-align: center
    font-size: 13px
    color: var(--el-text-color-secondary)
  // 头部:左封面 + 右标题(JHenTai 详情页布局)
  .detail-head
    position: relative
    display: flex
    align-items: flex-start
    gap: 10px
  // 左列:封面 + 封面下方的评分
  .detail-head-left
    flex: none
    width: 108px
    display: flex
    flex-direction: column
    gap: 2px
  .detail-cover-wrap
    flex: none
    cursor: pointer
    border-radius: 4px
    transition: box-shadow .15s ease, transform .15s ease
    &:hover
      box-shadow: 0 0 0 2px var(--el-color-primary-light-5, var(--el-color-primary))
    &:active
      transform: scale(.97)
  .detail-cover
    display: block
    width: 108px
    height: 150px
    object-fit: cover
    border-radius: 4px
    background: var(--el-fill-color-light)
    &.detail-cover-empty
      background: var(--el-fill-color-dark)
  .detail-head-info
    flex: 1
    min-width: 0
    display: flex
    flex-direction: column
    align-items: flex-start
    text-align: left
    gap: 4px
  .detail-title
    font-size: 13px
    font-weight: 600
    line-height: 1.35
    text-align: left
    overflow: hidden
    display: -webkit-box
    -webkit-line-clamp: 4
    -webkit-box-orient: vertical
  .detail-subtitle
    font-size: 12px
    line-height: 1.3
    color: var(--el-text-color-secondary)
    overflow: hidden
    display: -webkit-box
    -webkit-line-clamp: 2
    -webkit-box-orient: vertical
  .detail-rate
    // 评分只读,放在封面下面:以封面宽度为准居中
    height: 18px
    width: 108px
    display: flex
    align-items: center
    justify-content: center
    text-align: center
    padding: 0
    margin: 0
    --el-rate-icon-size: 14px
    --el-rate-icon-margin: 1px
  // 分类标签:贴在信息区最右边,底边和封面底边(150px)对齐
  .detail-cat-badge
    position: absolute
    right: 0
    top: 150px
    transform: translateY(-100%)
    display: flex
  // 信息行:封面右侧这一列里,紧凑、全部靠左;底部留出分类徽标的位置
  .detail-info
    display: flex
    flex-direction: column
    align-items: flex-start
    gap: 1px
    margin-top: 4px
    padding-bottom: 20px
    font-size: 11px
    line-height: 1.5
    min-width: 0
    text-align: left
  .detail-info-row
    display: flex
    align-items: baseline
    justify-content: flex-start
    text-align: left
    gap: 8px
    width: 100%
    .k
      flex: none
      width: 52px
      text-align: left
      color: var(--el-text-color-secondary)
    .v
      flex: 1
      min-width: 0
      overflow: hidden
      text-overflow: ellipsis
      white-space: nowrap
  // 操作按钮:允许换行
  .detail-actions
    display: flex
    flex-wrap: wrap
    gap: 6px
    // 照 JHenTai:图标在前、文字在后的小按钮(不抢眼,一排能放好几个)
    .detail-act
      margin: 0
  // 标签分组
  .detail-tags
    display: flex
    flex-direction: column
    gap: 6px
  .detail-tag-group
    display: flex
    flex-wrap: wrap
    align-items: center
    gap: 4px
  .detail-tag-cat
    flex: none
    font-size: 12px
    color: var(--el-text-color-secondary)
    margin-right: 2px
  .detail-tag
    cursor: pointer
  .detail-tags-empty
    font-size: 12px
    color: var(--el-text-color-placeholder)
  .detail-loading
    display: flex
    align-items: center
    gap: 6px
    font-size: 12px
    color: var(--el-text-color-secondary)
  // 评论:紧凑列表,最多占 28vh,超出自己滚
  .detail-comments
    margin: 8px 0 4px
    max-height: 28vh
    overflow-y: auto
    display: flex
    flex-direction: column
    gap: 6px
  .detail-comments-title
    font-size: 12px
    font-weight: 600
    color: var(--el-text-color-secondary)
  .detail-comment
    padding: 4px 6px
    border-radius: 4px
    background: var(--el-fill-color-light)
    .dc-head
      display: flex
      align-items: baseline
      justify-content: space-between
      gap: 6px
      margin-bottom: 2px
    .dc-author
      font-size: 11px
      font-weight: 600
      color: var(--el-color-primary)
      overflow: hidden
      text-overflow: ellipsis
      white-space: nowrap
    .dc-score
      flex: none
      font-size: 10px
      color: var(--el-text-color-placeholder)
    .dc-content
      font-size: 11px
      line-height: 1.4
      color: var(--el-text-color-regular)
      white-space: pre-wrap
      word-break: break-word
  // 页预览:全部页,自动换行的网格(像 JHenTai 的页预览),超出高度就竖向滚动
  .detail-preview
    margin: 8px 0 4px
  .detail-preview-grid
    display: grid
    // 和 EH 网站的缩略图差不多大(一列约 110px)
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr))
    gap: 8px
    max-height: 56vh
    overflow-y: auto
    padding-right: 2px
  // 预览格:不要任何框/底色(用户要求把框隐藏),只留图片本身
  .detail-preview-item
    width: 100%
    aspect-ratio: 3 / 4
    overflow: hidden
    background: transparent
    cursor: pointer
    position: relative
    border-radius: 2px
    img
      width: 100%
      height: 100%
      object-fit: cover
      display: block
  .detail-preview-sprite
    position: absolute
    top: 0
    left: 0
  .detail-preview-loading
    display: flex
    align-items: center
    justify-content: center
    height: 60px
  .detail-preview-error
    font-size: 12px
    color: var(--el-text-color-placeholder)
</style>
