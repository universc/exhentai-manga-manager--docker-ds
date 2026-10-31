<template>
  <!-- 侧边详细信息:与「下载记录」同款的右栏(可拖宽度)。
       内容排布照 JHenTai 的详情页:左封面 + 右标题/评分,下面依次是信息行、操作按钮、标签分组。
       数据源是 pinia 里的 bookDetail(点开任意一本的详情/封面后自动跟着变) -->
  <div class="detail-panel" :class="{ 'is-narrow': isNarrow }" :style="{ width: width + 'px' }">
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
          <div class="detail-info">
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
        <div class="detail-cat-badge" v-if="book.category" :title="galleryCategoryName(book.category, $t)">
          <el-tag size="small" type="info" class="detail-tag" @click="onTagClick(book.category, 'category')">{{ galleryCategoryName(book.category, $t) }}</el-tag>
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
        <!-- H@H 归档下载(照 JHenTai 详情页的 H@H 按钮) -->
        <el-button v-if="book.online && !viewerRole && book.archivePageUrl" class="detail-act" size="small" type="warning" plain @click="$emit('open-hh-download', book)">H@H</el-button>
        <!-- 本地库:把「详细界面」里那一整排按钮也搬过来
             (查看/编辑信息、获取元数据、隐藏、打开文件位置、重新扫描、删除、显示评论) -->
        <template v-else>
          <el-button v-if="!viewerRole" class="detail-act" size="small" :icon="Edit" @click="$emit('open-book-detail', book)">{{ $t('m.editInfo') }}</el-button>
          <el-button v-if="!viewerRole" class="detail-act" size="small" :icon="MdSearch" @click="$emit('get-metadata', book)">{{ $t('m.getMetadata') }}</el-button>
          <el-button v-if="!viewerRole" class="detail-act" size="small" :icon="Hide" @click="$emit('toggle-hidden', book)">{{ book.hiddenBook ? $t('m.showManga') : $t('m.hideManga') }}</el-button>
          <el-button class="detail-act" size="small" :icon="FolderOpened" @click="showFile">{{ $t('m.openMangaFileLocation') }}</el-button>
          <el-button v-if="!viewerRole" class="detail-act" size="small" :icon="Refresh" @click="$emit('rescan', book)">{{ $t('m.rescan') }}</el-button>
          <el-button v-if="!viewerRole" class="detail-act detail-act-danger" size="small" :icon="Delete" @click="$emit('delete-book', book)">{{ $t('m.deleteFile') }}</el-button>
          <el-button class="detail-act" size="small" :icon="ChatDotSquare" @click="toggleSideComments">{{ sideCommentsOn ? $t('m.hideComment') : $t('m.showComment') }}</el-button>
        </template>
      </div>
      <!-- 标签分组:点一个标签 = 按它搜(JHenTai 详情页点标签也是这个动作) -->
      <div class="detail-tags">
        <template v-if="tagGroups.length">
          <div class="detail-tag-group" v-for="g in tagGroups" :key="g.cat">
            <!-- 自然行内流:类别名和标签在同一条基线上,标签换行就回到左边缘,不做列对齐 -->
            <span class="detail-tag-cat">{{ g.label }}</span>
            <el-tag
              v-for="tag in g.tags"
              :key="tag"
              size="small"
              class="detail-tag"
              :effect="'plain'"
              :style="tagStyle(g.cat, tag)"
              @click="onTagClick(tag, g.cat)"
            >{{ tagName(g.cat, tag) }}</el-tag>
          </div>
        </template>
        <div class="detail-tags-empty" v-else>{{ $t('m.sideDetailNoTags') }}</div>
      </div>
      <!-- 评论:照 JHenTai 的 EHComment 排布 ——
           头(作者 + 时间)/ 正文(详情页里最多 5 行省略)/ 尾(评分 + 评分明细 + 编辑时间) -->
      <!-- 评论:照 JHenTai details_page 的横排评论区 ——
           一排可以左右滑动的卡片(单卡 300x160),高度固定,不会把下面的页预览挤下去 -->
      <div class="detail-comments" v-if="sideCommentsOn && comments.length">
        <div class="detail-comments-title">
          <span>{{ $t('m.comment') }} · {{ comments.length }}</span>
          <span class="detail-comments-all" @click="emit('search-from-tag', '', '')">{{ $t('m.sideDetailAllComments') }}</span>
        </div>
        <div class="detail-comments-row" @click="onCommentClick">
          <div class="detail-comment" v-for="c in comments" :key="c.id">
            <div class="dc-head">
              <span
                class="dc-author"
                :class="{ 'dc-author-me': c.fromMe }"
                :title="c.userId ? c.author + ' (#' + c.userId + ')' : c.author"
              >{{ c.author || $t('m.sideDetailUnknownUser') }}<template v-if="c.fromMe"> ({{ $t('m.sideDetailYou') }})</template></span>
              <span class="dc-time" :title="c.time">{{ c.time }}</span>
            </div>
            <div class="dc-content" :class="{ 'dc-content-clamped': !commentExpanded[c.id] }" @click="toggleComment(c)" v-html="commentHtml(c)"></div>
            <div class="dc-footer">
              <span class="dc-score" :title="(c.scoreDetails || []).join(' ')">{{ c.score }}</span>
              <span class="dc-edited" v-if="c.lastEditTime">{{ $t('m.sideDetailEdited') }} {{ c.lastEditTime }}</span>
            </div>
          </div>
        </div>
      </div>
      <!-- 页预览:显示**全部页**,自动换行的网格(像 JHenTai 的页预览),竖向滚动;点一下 = 打开阅读器 -->
      <div class="detail-preview" v-if="previewItems.length || previewLoading || previewError">
        <div class="detail-preview-grid" v-if="previewItems.length" :style="{ '--cell': PREVIEW_W + 'px' }">
          <div
            v-for="(it, i) in previewItems"
            :key="'p' + i"
            class="detail-preview-item"
            :class="{ 'is-ready': it.loaded }"
            :title="'P' + (i + 1)"
            @click="emit('read', book, i)"
          >
            <div v-if="it.sprite" class="detail-preview-sprite" :style="it.sprite" />
            <img
              v-else :src="it.src" loading="lazy" decoding="async"
              @load="it.loaded = true"
              @error="$event.target.style.display='none'; it.loaded = true"
            />
          </div>
        </div>
        <div v-if="previewLoading && !previewItems.length" class="detail-preview-loading">
          <el-icon class="is-loading" :size="16"><Loading /></el-icon>
        </div>
        <div v-else-if="previewError && !previewItems.length" class="detail-preview-error">{{ previewError }}</div>
        <!-- 滚动哨兵:滑到这里就再取一批(侧栏只有一个滚动条,用可视区判断) -->
        <div ref="previewSentinel" class="detail-preview-sentinel"></div>
        <div v-if="previewLoading && previewItems.length" class="detail-preview-more">
          <el-icon class="is-loading" :size="14"><Loading /></el-icon>
        </div>
      </div>
      <div class="detail-loading" v-if="detailLoading">
        <el-icon class="is-loading" :size="14"><Loading /></el-icon> {{ $t('m.sideDetailLoading') }}
      </div>
    </div>
    <EmptyState v-else class="detail-empty" :title="$t('m.sideDetailEmpty')" />
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Loading, View, Download, Star, Link, FolderOpened, Edit, Hide, Refresh, Delete, ChatDotSquare } from '@element-plus/icons-vue'
import { MdAttach, MdSearch } from '@vicons/ionicons4'
import { MdRefresh } from '@vicons/ionicons4'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import { parseGalleryDetail, mergeDetailIntoBook, ehImageSrc, collectGalleryThumbs } from '../ehOnline.js'
import { catDisplayName, toAssetUrl, tagDisplayName, tagColorOf, tagCatRank, galleryCategoryName, categoryDisplayName } from '../utils.js'
// 统一空态（P0-08）：侧栏没有选中漫画时的提示
import EmptyState from './states/EmptyState.vue'

const props = defineProps({
  // 面板宽度(px):App.vue 持有并持久化,拖动时双向同步
  width: { type: Number, default: 360 },
  // 面板是否可见:藏起来时不自动拉 EH 详情(省请求,也少给 EH 添乱)
  visible: { type: Boolean, default: true }
})
const emit = defineEmits([
  'close', 'update:width', 'read', 'download-gallery', 'open-torrents', 'favorite',
  'search-from-tag', 'refresh-list',
  // 本地库:与「详细界面」同一套操作
  'open-book-detail', 'get-metadata', 'toggle-hidden', 'rescan', 'delete-book', 'toggle-comments',
  // 评论里的 EH 画廊链接:交给软件内部跳转
  'open-gallery-url', 'open-hh-download'
])
// 侧边详情的评论开关:独立于「详细界面」的 setting.showComment(那是一整栏评论页)
const sideCommentsOn = ref(true)
const toggleSideComments = () => {
  sideCommentsOn.value = !sideCommentsOn.value
  if (sideCommentsOn.value) loadComments(book.value)
  else comments.value = []
}

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
  // ⚠ 这里原本有一个 `setting.showComment === false` 的提前返回 ——
  //   那个开关是「详细界面(大弹窗)里要不要显示评论栏」,和侧边详情是两个独立界面。
  //   结果用户关掉大弹窗的评论后,侧边详情也一条评论都不显示。
  //   侧边详情的评论只看它自己的开关(sideDetailShowComments)。
  try {
    const cookie = ['igneous', 'ipb_pass_hash', 'ipb_member_id', 'star']
      .map(k => k + '=' + (setting.value[k] || ''))
      .join('; ')
    const html = await ipcRenderer.invoke('get-ex-webpage', { url: b.url, cookie })
    const doc = new DOMParser().parseFromString(html, 'text/html')
    // 解析口径照 JHenTai 的 EHSpiderParser._parseGalleryDetailsComments:
    //   .c2 > .c3 > a        作者(第 3 个 a 的 showuser= 是用户 id)
    //   .c2 > .c5.nosel>span 评分
    //   .c7                  评分明细(逗号分隔)
    //   .c6                  正文(带 id="comment_<n>")
    //   .c2 > .c3            里面含 "Posted on …" 的原文时间
    //   .c8 > strong         编辑时间
    //   .c2 > .c4.nosel > a  自己的评论有 Edit 链接
    const parseTime = (raw) => {
      const s = String(raw || '')
      // 原文形如 "Posted on 10 March 2022, 03:49 by: xxx"
      const m = /Posted on\s+([^,]+,\s*\d{1,2}:\d{2})/.exec(s)
      if (!m) return ''
      const d = new Date(m[1].replace(/\s+/g, ' '))
      if (isNaN(d.getTime())) return m[1]
      const p = (n) => String(n).padStart(2, '0')
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    }
    const decode = (str) => String(str || '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
    const list = []
    doc.querySelectorAll('#cdiv>.c1').forEach((e, i) => {
      const c2 = e.querySelector('.c2')
      const authorLink = c2 ? c2.querySelector('.c3 > a') : null
      const author = ((authorLink && authorLink.textContent) || '').trim()
      const userId = (() => {
        const a = c2 ? c2.querySelector('.c3 > a:nth-child(3)') : null
        const m = /showuser=(\d+)/.exec((a && a.getAttribute('href')) || '')
        return m ? m[1] : ''
      })()
      const score = ((c2 && c2.querySelector('.c5.nosel > span')) || {}).textContent || ''
      const scoreDetails = ((e.querySelector('.c7') || {}).textContent || '')
        .split(',').map(s => s.trim()).filter(Boolean)
      const c6 = e.querySelector('.c6')
      // 评论正文:保留链接(照 JHenTai 的 buildTag —— 链接可点)
      let content = (c6 && c6.innerHTML) || ''
      content = content
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<div[^>]*>/gi, '\n')
        // 先把 <a href="...">…</a> 转成占位标记,避免被「去标签」时丢掉链接
        .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
          (_m, href, text) => LINK_SEP_A + href + LINK_SEP_B + decode(String(text).replace(/<[^>]+>/g, '')) + LINK_SEP_C)
        .replace(/<[^>]+>/g, '')
      content = decode(content).replace(/\n{3,}/g, '\n\n').trim()
      // 正文纯文本(用于折叠判断/无障碍);富文本在渲染时再拼
      const contentRich = content
      const timeRaw = ((c2 && c2.querySelector('.c3')) || {}).textContent || ''
      const time = parseTime(timeRaw)
      const lastEditRaw = ((e.querySelector('.c8 > strong')) || {}).textContent || ''
      const lastEditTime = lastEditRaw ? parseTime('Posted on ' + lastEditRaw) || lastEditRaw.trim() : ''
      const fromMe = !!((c2 && c2.querySelector('.c4.nosel > a')) && ((c2.querySelector('.c4.nosel > a')).textContent || '').trim() === 'Edit')
      if (!author && !content) return
      const cid = ((c6 && c6.getAttribute('id')) || '').replace(/^comment_/, '') || String(i)
      list.push({ id: cid || (i + '-' + author), author, userId, score, scoreDetails, content, contentRich, time, lastEditTime, fromMe })
    })
    comments.value = list
  } catch (e) { comments.value = [] }
}
// 链接占位符:用不可见控制字符分隔(避免与正文冲突)。
// ⚠ 用 String.fromCharCode 生成,不要直接写 \u0001 字面量 —— 那会在源码里变成裸控制字符,
//    ESLint 会报 control-character-in-input-stream,某些编辑器也会把它吃掉。
const LINK_SEP_A = String.fromCharCode(1)
const LINK_SEP_B = String.fromCharCode(2)
const LINK_SEP_C = String.fromCharCode(3)
// 评论正文里的链接:把解析时的占位标记还原成 <a>(先做 HTML 转义,防注入)
const escapeHtml = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const commentHtml = (c) => {
  const raw = String((c && (c.contentRich || c.content)) || '')
  // ① a 标记 ( url  text ) → 可点链接
  let out = ''
  let rest = raw
  for (;;) {
    const a = rest.indexOf(LINK_SEP_A)
    if (a < 0) { out += escapeHtml(rest); break }
    out += escapeHtml(rest.slice(0, a))
    const b = rest.indexOf(LINK_SEP_B, a)
    const e = rest.indexOf(LINK_SEP_C, b)
    if (b < 0 || e < 0) { out += escapeHtml(rest.slice(a)); break }
    const href = rest.slice(a + 1, b)
    const text = rest.slice(b + 1, e)
    out += '<a href="' + escapeHtml(href) + '" data-ext="1">' + escapeHtml(text || href) + '</a>'
    rest = rest.slice(e + 1)
  }
  // ② 纯文本里的裸 URL 也要能点(评论区常见)
  out = out.replace(/(^|[^"'>])(https?:\/\/[^\s<>"']+)/g,
    (_m, pre, url) => pre + '<a href="' + escapeHtml(url) + '" data-ext="1">' + escapeHtml(url) + '</a>')
  return out
}
// 评论里的链接点击:EH 链接用软件内部跳转,其它用系统浏览器
const onCommentClick = (e) => {
  const a = e && e.target && e.target.closest ? e.target.closest('a[data-ext]') : null
  if (!a) return
  e.preventDefault()
  e.stopPropagation()
  const href = a.getAttribute('href') || ''
  if (!href) return
  if (/^https?:\/\/([^/]+\.)?(e-hentai\.org|exhentai\.org|forums\.e-hentai\.org)\/g\//i.test(href)) {
    // 画廊链接:用软件自己的详情/阅读流程打开
    emit('open-gallery-url', href)
    return
  }
  try { ipcRenderer.invoke('open-url', href) } catch (err) { /* 忽略 */ }
}
// 评论过长时折叠成 5 行(与 JHenTai 详情页一致),点一下展开
const commentExpanded = ref({})
const toggleComment = (c) => {
  if (!c || !c.id) return
  commentExpanded.value = { ...commentExpanded.value, [c.id]: !commentExpanded.value[c.id] }
}
// 页预览:在线 = 详情页雪碧缩略图;本地 = 前几页图片。点一下打开阅读器。
//
// 尺寸照 e-hentai 详情页的做法:缩略图不是固定 px,而是**跟着容器宽度自适应** —
// 面板宽就多列、格子更大,面板窄就少列。EH 详情页里一格大约占 1/5 容器宽(横向 5 列),
// 这里按同一比例算:每列宽度 = 容器宽 / 列数,列数随面板宽度取 3~6。
// 结果就是「都比原来的固定 118px 大」,而且窄面板也不会挤成一团。
const previewCols = computed(() => {
  const w = Number(props.width) || 360
  // 360 宽 → 3 列(约 112),420 → 4 列,520+ → 5 列,640+ → 6 列
  if (w >= 640) return 6
  if (w >= 520) return 5
  if (w >= 420) return 4
  return 3
})
// 每格的实际宽度(px):减去网格间距与内边距后按列数平分
const PREVIEW_W = computed(() => {
  const w = Number(props.width) || 360
  const gap = 8
  const pad = 16
  return Math.max(96, Math.floor((w - pad - gap * (previewCols.value - 1)) / previewCols.value))
})
const previewItems = ref([])
const previewLoading = ref(false)
const previewError = ref('')
// 雪碧图切片:交给 CSS 的 --cell 变量缩放。
// 以前每次算 style 都带 transform:scale + 负 margin,而且 watch(width) 在拖拽时
// 每个 mousemove 都要把整张网格的 style 重算一遍 —— 这就是「拖动侧栏时预览卡」的根因。
// 现在每格只需在**插入时**记下自己的原图偏移与尺寸,缩放完全由 CSS 变量驱动:
//   background-size / background-position 都用 calc(var(--cell) * ...) 表达,
//   拖宽时只改根节点的 --cell,零 JS 重算。
const spriteStyleOf = (th) => {
  const w = Number(th.width) || 200
  const h = Number(th.height) || 287
  // sw = 整张雪碧图总宽(解析时算好);缺失时退化成一格宽(至少不错位到离谱)
  const sw = Number(th.spriteWidth) || w
  return {
    backgroundImage: 'url(' + ehImageSrc(th.thumb, '', th.pageUrl || '') + ')',
    '--ox': String(th.offsetX || 0),
    '--tw': String(w),
    '--th': String(h),
    '--sw': String(sw)
  }
}
// ---------- 在线书预览 ----------
// 关键:previewItems **派生自** bookDetail.thumbnails,而不是只认自己那次 onUpdate。
// 以前 previewItems 只在「自己启动的 collectGalleryThumbs 回调」里赋值,而 thumbnails
// 还会被详细界面的补页/详情刷新写(同一个对象)→ 两边各跑一套,侧栏永远卡在第一页 20 张,
// 滑到底也没有后续(用户反馈的「只能加载部分,滑动到底根本不继续加载」)。
const syncOnlinePreview = () => {
  const b = book.value
  if (!b || !b.online) return
  const th = b.thumbnails || []
  previewTotal.value = Math.max(Number(b.pageCount) || 0, th.length)
  if (th.length) previewItems.value = th.map(x => ({ sprite: spriteStyleOf(x) }))
}
let onlineThumbsRunning = false
let onlineThumbsToken = 0
const ensureOnlineThumbs = async () => {
  const b = book.value
  if (!b || !b.online || !b.url) return
  const th = b.thumbnails || []
  const want = Number(b.pageCount) || 0
  // 已经够数 / 没有标注页数但已经拉过一批 → 不重复启动
  if (onlineThumbsRunning) return
  if (want && th.length >= want) return
  if (!want && th.length >= 20 && onlineThumbsToken > 0) return
  onlineThumbsRunning = true
  const token = ++onlineThumbsToken
  const host = String(b.url || '').replace(/^https?:\/\//i, '').split('/')[0]
  try {
    await collectGalleryThumbs({
      url: b.url, host, pageCount: want, first: th,
      fetchHtml: (u) => ipcRenderer.invoke('get-ex-webpage', { url: u, cookie: ['igneous', 'ipb_pass_hash', 'ipb_member_id', 'star'].map(k => k + '=' + (setting.value[k] || '')).join('; ') }),
      shouldStop: () => token !== onlineThumbsToken,
      onUpdate: (thumbs) => {
        if (token !== onlineThumbsToken) return
        b.thumbnails = thumbs
        syncOnlinePreview()
      }
    })
  } catch (e) { /* 某一页拉不到就算了,已显示的先留着 */ } finally {
    if (token === onlineThumbsToken) onlineThumbsRunning = false
  }
}
// 本地书:分批取页预览。先自动加载 PREVIEW_AUTO 页,滑到底部哨兵再继续
// (以前是一次 while 把所有页全拉完:几百页的书要把整本解压一遍才显示,侧栏直接卡住;
//  用户看到的就是「只能加载部分,滑到底根本不继续加载」)
let previewToken = 0
const PREVIEW_BATCH = 12
const PREVIEW_AUTO = 60
const previewTotal = ref(0)
const previewAutoLimit = ref(PREVIEW_AUTO)
const previewSentinel = ref(null)
let previewObserver = null
let previewAutoBusy = false
// ── 预览图的「逐张平滑插入」队列 ──
// 以前是:一次 IPC 拿 12 张 → 整表 concat(换新数组)→ 整张网格重渲染 → 再等下一次 IPC。
// 体感就是「几十几十地蹦一下」。现在拆成两层:
//   ① IPC 照旧批量取(减少往返),但取回来先进**队列**
//   ② 渲染端用 requestAnimationFrame 按帧消费,每帧最多 PREVIEW_PER_FRAME 张,
//      并且只 push 进同一个数组(不换引用),CSS 上再做淡入 —— 视觉上是连续长出来的。
const PREVIEW_PER_FRAME = 3
const previewQueue = []
let previewRaf = 0
const flushPreviewQueue = () => {
  previewRaf = 0
  if (!previewQueue.length) return
  const token = previewToken
  let n = 0
  while (previewQueue.length && n < PREVIEW_PER_FRAME) {
    const item = previewQueue.shift()
    // 就地 push:引用不变,Vue 只 patch 新增的节点,不会整表重 diff
    previewItems.value.push(item)
    n += 1
  }
  if (previewQueue.length && token === previewToken) {
    previewRaf = requestAnimationFrame(flushPreviewQueue)
  }
}
const pushPreviewQueue = (files) => {
  for (const f of files) {
    previewQueue.push({ src: toAssetUrl(f), loaded: false })
  }
  if (!previewRaf) previewRaf = requestAnimationFrame(flushPreviewQueue)
}
const clearPreviewQueue = () => {
  previewQueue.length = 0
  if (previewRaf) { cancelAnimationFrame(previewRaf); previewRaf = 0 }
}

const loadLocalPreview = async (b, reset = true) => {
  if (!b || !b.filepath) return
  const token = ++previewToken
  clearPreviewQueue()
  if (reset) {
    previewItems.value = []
    previewAutoLimit.value = PREVIEW_AUTO
    previewTotal.value = 0
  }
  previewLoading.value = true
  try {
    let start = previewItems.value.length + previewQueue.length
    while (token === previewToken && start < previewAutoLimit.value) {
      const res = await ipcRenderer.invoke('book-preview-images', {
        filepath: b.filepath, type: b.type, start, count: PREVIEW_BATCH
      })
      if (token !== previewToken) return
      if (!res || !res.ok) break
      previewTotal.value = res.total || 0
      const fresh = (res.files || [])
      if (!fresh.length) break
      pushPreviewQueue(fresh)
      // 按「请求的批量」前进,而不是按实际返回条数:个别页解压失败时不会重复请求同一段
      start += PREVIEW_BATCH
      if (start >= previewTotal.value) break
    }
  } catch (e) { /* 预览失败不影响其它信息 */ } finally {
    if (token === previewToken) previewLoading.value = false
  }
}
// 滑到底自动加载下一页(哨兵 + IntersectionObserver,和详细界面同一套)
const autoLoadMorePreview = async () => {
  if (previewAutoBusy || previewLoading.value) return
  if (previewItems.value.length >= previewTotal.value) return
  previewAutoBusy = true
  try {
    if (book.value && book.value.online) {
      // 在线书:后台补页没在跑就再启动一次(它自己会从当前 thumbnails 继续)
      await ensureOnlineThumbs()
    } else {
      await loadLocalPreview(book.value, false)
    }
    await nextTick()
    const el = previewSentinel.value
    if (el && previewItems.value.length < previewTotal.value) {
      const rect = el.getBoundingClientRect()
      const visible = rect.top < (window.innerHeight || 0) + 200 && rect.bottom > -200
      if (visible) await autoLoadMorePreview()
    }
  } finally { previewAutoBusy = false }
}
const setupPreviewObserver = () => {
  if (previewObserver) { previewObserver.disconnect(); previewObserver = null }
  const el = previewSentinel.value
  if (!el || typeof IntersectionObserver === 'undefined') return
  previewObserver = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) autoLoadMorePreview()
  }, { rootMargin: '240px 0px' })
  previewObserver.observe(el)
}
watch(previewSentinel, (el) => { if (el) setupPreviewObserver() })
onBeforeUnmount(() => { if (previewObserver) previewObserver.disconnect() })

// 标签显示名:先用手动填写的多语言名,再用 EhTagTranslation 词库(语言 = 中文时就显示中文)
const tagName = (cat, tag) => tagDisplayName(setting.value, appStore.resolvedTranslation, cat, tag)

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
      label: categoryDisplayName(setting.value, translated, cat) || cat,
      tags: Array.isArray(tags_) ? tags_ : []
    }
  }).filter(g => g.tags.length)
    // 分类顺序跟设置里拖动的一致
    .sort((a, b) => tagCatRank(setting.value, a.cat) - tagCatRank(setting.value, b.cat))
})
// 标签颜色 = 字体颜色
const tagStyle = (cat, tag) => {
  const c = tagColorOf(setting.value, cat, tag)
  return c ? { color: c, borderColor: c } : {}
}

// 在线书:thumbnails 会被别的入口写胖(详细界面的补页 / 详情刷新 / 阅读器解析),
// 它们写的是**同一个** bookDetail 对象。侧栏预览必须跟着同步 ——
// 以前只在「书 id 变化」的 watch 里赋值一次,所以永远停在第一页 20 张,
// 滑到底也没有后续(用户反馈的「只能加载部分,滑动到底根本不继续加载」)。
watch(() => (book.value.thumbnails || []).length, (n, old) => {
  if (!book.value.online || n === old) return
  syncOnlinePreview()
})
// 面板被拖宽/拖窄:缩略图是按「容器宽 / 列数」算的,宽度一变就要重算(否则会错位或留白)
watch(() => props.width, () => {
  if (!book.value || !book.value.online) return
  syncOnlinePreview()
})

// 换书时:在线画廊如果还没拉过详情(没有上传者信息),自动补一次 ——
// 与 BookDetailDialog 的 enrichOnlineBook 同一套口径,合并回同一个 store 对象。
// 面板藏起来(v-show)时不拉:只给看得见的面板发请求
// 兜底:面板从「隐藏」变「显示」、或书已经设置好但评论还没拉过时,补拉一次评论。
// (只在 book.id 变化时拉的话,先设 bookDetail 再开面板就不会触发 —— 用户看到的就是「没有评论」)
watch(() => [props.visible, book.value.id, book.value.online], async () => {
  const b = book.value
  if (!props.visible || !b || !b.id || !b.online) return
  if (comments.value.length) return
  if (!sideCommentsOn.value) return
  await loadComments(b)
})

watch(() => book.value.id, async (id) => {
  const b = book.value
  if (!props.visible) return
  previewToken++
  previewItems.value = []
  previewError.value = ''
  previewTotal.value = 0
  previewAutoLimit.value = PREVIEW_AUTO
  onlineThumbsToken++
  onlineThumbsRunning = false
  if (!id || !b || !b.id) return
  // 评论:在线画廊才拉(不阻塞预览)
  loadComments(b)
  // 预览:本地书直接取图;在线书等详情(传略图)回来再出
  if (!b.online) {
    previewLoading.value = true
    try { await loadLocalPreview(b) } catch (e) { /* 预览失败不打扰 */ } finally { previewLoading.value = false }
    return
  }
  // 在线书:thumbnails 被别人(详细界面/详情刷新)补了页,侧栏也跟着同步
  syncOnlinePreview()
  if ((b.thumbnails || []).length) {
    syncOnlinePreview()
    // 缩略图也是分页的(每页 20 张):后台继续把后面的补进来
    ensureOnlineThumbs()
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
/* ============================================================
 * 页预览（缩略图）样式 —— 用户要求改回旧版（1.14.x）观感。
 * 从重构前的 SideDetailPanel.vue 原样搬回。之所以放回组件内而不是
 * panels.css：旧样式用了 v-bind(previewCols)（列数跟随面板宽度），
 * v-bind 只在 SFC 的 <style> 里生效；且组件样式源码顺序晚于
 * panels.css，同特异性 (0,2,0) 下整体覆盖新版样式。
 * ============================================================ */
.detail-panel
  .detail-preview
    margin: 8px 0 4px
  .detail-preview-grid
    display: grid
    // 照 e-hentai 详情页:列数随面板宽度自适应(3~6 列)
    grid-template-columns: repeat(v-bind(previewCols), 1fr)
    gap: 8px
    padding-right: 2px
  // 预览格:不要任何框/底色,只留图片本身
  .detail-preview-item
    width: 100%
    aspect-ratio: 3 / 4
    overflow: hidden
    background: transparent
    cursor: pointer
    position: relative
    border-radius: 2px
    content-visibility: auto
    contain-intrinsic-size: auto 140px
    img
      width: 100%
      height: 100%
      object-fit: cover
      display: block
      opacity: 0
      transition: opacity .16s ease
    &.is-ready img
      opacity: 1
  .detail-preview-sprite
    position: absolute
    top: 0
    left: 0
    width: var(--cell)
    height: calc(var(--cell) * var(--th) / var(--tw))
    background-repeat: no-repeat
    background-size: calc(var(--sw) * var(--cell) / var(--tw)) auto
    background-position: calc(var(--ox) * var(--cell) / var(--tw) * -1) 0
  .detail-preview-sentinel
    height: 1px
  .detail-preview-more
    display: flex
    align-items: center
    justify-content: center
    height: 32px
    color: var(--el-text-color-placeholder)
  .detail-preview-loading
    display: flex
    align-items: center
    justify-content: center
    height: 60px
  .detail-preview-error
    font-size: 12px
    color: var(--el-text-color-placeholder)
</style>
