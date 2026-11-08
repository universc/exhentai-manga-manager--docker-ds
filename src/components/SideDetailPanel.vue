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
        <el-button size="small" text class="detail-panel-close" :title="$t('m.close')" @click="$emit('close')">✕</el-button>
      </span>
    </div>
    <div class="detail-panel-body" v-if="book.id">
      <!-- 封面 + (标题 / 副标题 / 评分 / 类别 / 信息行):全部靠左,信息行贴在评分下面 -->
      <div class="detail-head">
        <!-- 左列:封面 + 评分(评分放到封面下方) -->
        <div class="detail-head-left">
          <div class="detail-cover-wrap" :title="$t('m.read')" @click="$emit('read', book)">
            <img v-if="coverSrc" :src="coverSrc" class="detail-cover" />
            <div v-else class="detail-cover detail-cover-empty"></div>
          </div>
          <!-- 评分:可点击编辑(半星步进),改完立即写库 -->
          <el-rate
            class="detail-rate"
            :model-value="rateValue"
            size="small"
            allow-half
            :disabled="!canEditRate"
            :colors="RATE_COLORS"
            @update:model-value="onRateChange"
          />
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
            <!-- 合集:本数 / 大小 / 阅读次数都取聚合字段(与书架卡片、详细界面同一个数) -->
            <div class="detail-info-row" v-if="isCollection">
              <span class="k">{{ $t('m.collection') }}</span>
              <span class="v">{{ $t('m.collectionBookCount', { n: collectionMembers.length }) }}</span>
            </div>
            <div class="detail-info-row is-minor" v-if="isCollection && collectionSizeText">
              <span class="k">{{ $t('m.sideDetailSize') }}</span>
              <span class="v">{{ collectionSizeText }}</span>
            </div>
            <!-- 以下都是「次要信息」:面板被拖窄(<300px)时由 .is-narrow 规则隐藏,页数始终保留 -->
            <div class="detail-info-row is-minor" v-if="book.online">
              <span class="k">{{ $t('m.ehOnlineUploader') }}</span>
              <span class="v" :title="book.uploader">{{ book.uploader || '—' }}</span>
            </div>
            <div class="detail-info-row is-minor" v-if="book.online">
              <span class="k">{{ $t('m.sideDetailLanguage') }}</span>
              <span class="v" :title="book.language">{{ book.language || '—' }}</span>
            </div>
            <div class="detail-info-row is-minor" v-if="book.online">
              <span class="k">{{ $t('m.sideDetailSize') }}</span>
              <span class="v">{{ book.size || '—' }}</span>
            </div>
            <div class="detail-info-row" v-if="book.posted">
              <span class="k">{{ $t('m.sideDetailPosted') }}</span>
              <span class="v">{{ book.posted }}</span>
            </div>
            <div class="detail-info-row is-minor" v-if="!book.online">
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
      <!-- ⚠ 在线 / 本地必须**互斥**成两块:以前那排在线按钮各自带 v-if,v-else 只挂在最后一个
           (H@H)上 —— 在线书只要没有 archivePageUrl 就会把「获取元数据/隐藏/重扫/删除」
           整排本地按钮露出来(本地/在线功能串场)。 -->
      <div class="detail-actions">
        <el-button class="detail-act" size="small" :icon="View" v-if="!isCollection" @click="$emit('read', book)">{{ $t('m.read') }}</el-button>
        <!-- 合集:打开合集抽屉看里面的书 / 进详细界面 / 编辑合集(删除在详细界面里,那里有完整确认) -->
        <template v-if="isCollection">
          <el-button class="detail-act" size="small" :icon="View" @click="$emit('read', book)">{{ $t('m.openCollection') }}</el-button>
          <el-button class="detail-act" size="small" :icon="Edit" @click="$emit('open-book-detail', book)">{{ $t('m.collectionDetail') }}</el-button>
          <el-button v-if="!viewerRole" class="detail-act" size="small" :icon="FolderOpened" @click="$emit('edit-collection', book)">{{ $t('m.editCollection') }}</el-button>
        </template>
        <!-- 在线画廊 -->
        <template v-else-if="book && book.online">
          <el-button v-if="!viewerRole" class="detail-act" size="small" :icon="Download" @click="$emit('download-gallery', { book, original: false })">{{ $t('m.download') }}</el-button>
          <!-- 种子:JHenTai 同款回形针图标;数量直接跟在按钮后面 -->
          <el-button class="detail-act" size="small" :icon="MdAttach" @click="$emit('open-torrents', book)">{{ $t('m.torrent') }}<template v-if="book.torrentCount != null"> {{ book.torrentCount }}</template></el-button>
          <el-button class="detail-act" size="small" :icon="Star" @click="$emit('favorite', book)">{{ book.favcat == null ? $t('m.favorite') : $t('m.favoriteRemoveOption') }}</el-button>
          <el-button class="detail-act" size="small" :icon="Link" @click="openInBrowser">{{ $t('m.ehOnlineOpen') }}</el-button>
          <!-- H@H 归档下载(照 JHenTai 详情页的 H@H 按钮) -->
          <el-button v-if="!viewerRole && book.archivePageUrl" class="detail-act" size="small" type="warning" plain @click="$emit('open-hh-download', book)">H@H</el-button>
        </template>
        <!-- 本地库:把「详细界面」里那一整排按钮也搬过来
             (查看/编辑信息、获取元数据、隐藏、打开文件位置、重新扫描、删除) -->
        <template v-else>
          <el-button v-if="!viewerRole" class="detail-act" size="small" :icon="Edit" @click="$emit('open-book-detail', book)">{{ $t('m.editInfo') }}</el-button>
          <el-button v-if="!viewerRole" class="detail-act" size="small" :icon="MdSearch" @click="$emit('get-metadata', book)">{{ $t('m.getMetadata') }}</el-button>
          <el-button v-if="!viewerRole" class="detail-act" size="small" :icon="Hide" @click="$emit('toggle-hidden', book)">{{ book.hiddenBook ? $t('m.showManga') : $t('m.hideManga') }}</el-button>
          <el-button class="detail-act" size="small" :icon="FolderOpened" @click="showFile">{{ $t('m.openMangaFileLocation') }}</el-button>
          <el-button v-if="!viewerRole" class="detail-act" size="small" :icon="Refresh" @click="$emit('rescan', book)">{{ $t('m.rescan') }}</el-button>
          <el-button v-if="!viewerRole" class="detail-act detail-act-danger" size="small" :icon="Delete" @click="$emit('delete-book', book)">{{ $t('m.deleteFile') }}</el-button>
        </template>
        <!-- 评论开关:两个来源都有评论(EH 在线 / 本地库),所以放在两块之外,始终可用。
             合集没有评论,不显示 -->
        <el-button v-if="!isCollection" class="detail-act" size="small" :icon="ChatDotSquare" @click="toggleSideComments">{{ sideCommentsOn ? $t('m.hideComment') : $t('m.showComment') }}</el-button>
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
              @contextmenu.prevent="onTagContextMenu($event, tag, g.cat)"
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
          <span class="detail-comments-all" @click="emit('all-comments', book)">{{ $t('m.sideDetailAllComments') }}</span>
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
      <!-- ★ 文字书(txt / epub):页预览位置改成显示正文。
           图片书这里是「每页缩略图」;文字书没有页图,原来这块永远是空的或只有加载图标,
           用户要的是「在这里直接看到文字内容」。 -->
      <div class="detail-preview detail-preview-text" v-if="isTextBook">
        <div class="detail-text-body" v-if="textPreview">{{ textPreview }}</div>
        <div class="detail-preview-loading" v-else-if="textPreviewLoading">
          <el-icon class="is-loading" :size="16"><Loading /></el-icon>
        </div>
        <div class="detail-preview-error" v-else>{{ $t('m.sideDetailTextPreviewEmpty') }}</div>
      </div>
      <!-- 合集:没有「页」这个概念,这里显示成员的封面网格(点一下打开那一本的详细界面) -->
      <div class="detail-preview" v-else-if="isCollection">
        <div class="detail-preview-grid" v-if="collectionMembers.length" :style="{ '--cell': PREVIEW_W + 'px' }">
          <div
            v-for="m in collectionMembers.slice(0, 80)"
            :key="'cm' + m.id"
            class="detail-preview-item"
            :title="m.title"
            @click="emit('open-book-detail', m)"
          >
            <img v-if="m.coverPath" :src="bookImgSrc(m.coverPath)" loading="lazy" decoding="async" />
            <div v-else class="detail-preview-pending"></div>
          </div>
        </div>
        <div v-else class="detail-preview-error">{{ $t('m.collectionEmptyBooks') }}</div>
      </div>
      <!-- 页预览(图片书):显示**全部页**,自动换行的网格(像 JHenTai 的页预览),竖向滚动;点一下 = 打开阅读器 -->
      <div class="detail-preview" v-else-if="previewItems.length || previewLoading || previewError">
        <div class="detail-preview-grid" v-if="previewItems.length" :style="{ '--cell': PREVIEW_W + 'px' }">
          <div
            v-for="(it, i) in previewItems"
            :key="'p' + i"
            class="detail-preview-item"
            :class="{ 'is-sprite': !!it.sprite }"
            :style="it.sprite ? spriteBoxStyle(it.sprite) : null"
            @click="emit('read', book, it.pageIndex != null ? it.pageIndex : i)"
            @contextmenu.prevent="onImageContextMenu($event, it, it.pageIndex != null ? it.pageIndex : i)"
          >
            <div v-if="it.sprite" class="detail-preview-sprite" :style="it.sprite" />
            <!-- GIF 超过 5 张时:默认显示静态首帧(thumb),鼠标移上去才换成动图(见 displaySrc)。
                 displaySrc 保证只要这一页有路径就返回非空地址 —— 不再出现「纯白空格子」。 -->
            <img
              v-else-if="displaySrc(it)" :src="displaySrc(it)" loading="lazy" decoding="async"
              @mouseenter="hoverGif(it, true)"
              @mouseleave="hoverGif(it, false)"
              @load="it.loaded = true"
              @error="onPreviewError(it)"
            />
            <!-- 只有连 it.src 都没有(极端情况)才会落到这里 -->
            <div v-else class="detail-preview-pending"></div>
            <!-- ① GIF 角标:左下角标出这是动图(非 GIF 不显示) -->
            <span v-if="isGif(it)" class="preview-gif-badge">GIF</span>
            <!-- ③ 页码:受「阅读器设置 → 隐藏页码」控制(与阅读器/缩略图同一个开关) -->
            <span v-if="!hidePageNumber" class="preview-page-badge">{{ i + 1 }}</span>
          </div>
        </div>
        <div v-if="previewError && !previewItems.length" class="detail-preview-error">{{ previewError }}</div>
        <!-- 滚动哨兵:滑到这里就再取一批(侧栏只有一个滚动条,用可视区判断)。
             预览加载期间不再显示转圈(用户要求取消加载动画),哨兵保持不可见即可。 -->
        <div ref="previewSentinel" class="detail-preview-sentinel"></div>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import ContextMenu from '@imengyu/vue3-context-menu'
// 与阅读器同一套「图片右键菜单」(共享模块,见 src/imageContextMenu.js)
import { buildImageContextMenuItems, imageObjectFromPreview, refreshPreviewItem } from '../imageContextMenu.js'
import { Loading, View, Download, Star, Link, FolderOpened, Edit, Hide, Refresh, Delete, ChatDotSquare } from '@element-plus/icons-vue'
import { MdAttach, MdSearch } from '@vicons/ionicons4'
import { MdRefresh } from '@vicons/ionicons4'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import { parseGalleryDetail, mergeDetailIntoBook, ehImageSrc, collectGalleryThumbs } from '../ehOnline.js'
import { catDisplayName, toAssetUrl, bookImgSrc, tagDisplayName, tagColorOf, tagCatRank, galleryCategoryName, categoryDisplayName, sortContextMenuItems, isContextMenuItemEnabled } from '../utils.js'
import { addTagToBlacklist, setBlacklistEnabled } from '../ehFilter.js'
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
  'open-gallery-url', 'open-hh-download',
  // 标签右键菜单「编辑标签」:冒泡到 App.vue 走现成的 openQuickTagEdit(不新写弹窗)
  'edit-tag',
  // 「全部评论」:以前 emit('search-from-tag', '', '') → App 拼成 ""$ 精确搜索,必然 0 结果。
  // 现在带上这本书,让 App 走「本书全部评论」分支(打开详细界面的评论列表)。
  'all-comments',
  // 评分被用户改动:冒泡到 App.vue 落库
  'save-book',
  // 预览图右键菜单:打开图片 / 打开所在目录 / 浏览器打开 URL
  'open-image', 'open-url', 'open-path',
  // 合集:「编辑合集」交给 App 打开管理面板并选中该合集
  'edit-collection'
])
// 侧边详情的评论开关:独立于「详细界面」的 setting.showComment(那是一整栏评论页)
const sideCommentsOn = ref(true)
const toggleSideComments = () => {
  sideCommentsOn.value = !sideCommentsOn.value
  if (sideCommentsOn.value) loadComments(book.value)
  else comments.value = []
}

const appStore = useAppStore()
// bookList 用于合集成员(聚合条目只存 id/hash,成员对象要回整库取实时的那一份)
const { bookDetail, setting, bookList } = storeToRefs(appStore)
// 预览图页码角标:与阅读器「隐藏页码」同一个开关(设置 → 阅读器 → 隐藏页码)
const hidePageNumber = computed(() => !!(setting.value && setting.value.hidePageNumber))

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
// get-ex-webpage 失败时主进程返回 null(B 线),具体原因在只读通道 eh-webpage-last-error 里
const ehFailedText = async () => {
  let why = null
  try { why = await ipcRenderer.invoke('eh-webpage-last-error') } catch (e) { why = null }
  const detail = String((why && why.error) || '')
  return t('m.ehOnlineFailed') + (detail ? ': ' + detail : '')
}
// 同一个网络故障会同时打中「拉详情」和「拉评论」:4 秒内只提示一次,别弹两个 toast
let ehFailWarnAt = 0
const warnEhFailed = async () => {
  const msg = await ehFailedText()
  const now = Date.now()
  if (now - ehFailWarnAt < 4000) return msg
  ehFailWarnAt = now
  ElMessage.warning(msg)
  return msg
}
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
    // ★主进程失败时返回 null(B 线):parseFromString(null) 只会得到空列表,
    //   看起来就是「这本没有评论」—— 必须把原因说出来(见 eh-webpage-last-error)。
    if (!html) {
      await warnEhFailed()
      return
    }
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
// 面板宽就多列、格子更大,面板窄就少列。EH 详情页里一格高约 150(宽随比例),
// 这里按同一观感反过来算:先定目标格宽 target=160(对齐 wnacg 的 160 宽格子),
// 再拿容器宽度反算能放几列 —— 「宽面板多列但每格不缩水」,窄面板也不挤成一团。
// 目标格宽 160 而不是写死分档,好处是列数和格宽始终同源(见下方 PREVIEW_W)。
const previewCols = computed(() => {
  const w = Number(props.width) || 360
  // 目标格宽 160px:340 宽 → 2 列(格宽 158),480 宽 → 3 列(格宽 ~150),
  // 640 宽 → 4 列(格宽 150),800 宽 → 5 列;再窄也至少 2 列,再宽最多 8 列
  const target = 160
  // 下限 2 列:再窄也不能挤成一列长条;上限 8 列:再宽也不至于把格子压回 100px
  return Math.max(2, Math.min(8, Math.floor(w / target)))
})
// 每格的实际宽度(px):减去网格间距与内边距后按列数平分
const PREVIEW_W = computed(() => {
  const w = Number(props.width) || 360
  const gap = 8
  const pad = 16
  // 下限 140:窄面板(2 列)也不许把格子压到 100px 以下,太小的缩略图认不出内容
  return Math.max(140, Math.floor((w - pad - gap * (previewCols.value - 1)) / previewCols.value))
})
const previewItems = ref([])
const previewLoading = ref(false)
const previewError = ref('')

// ---------- 预览里的 GIF:超过 5 张就不许自己动,鼠标悬停才动 ----------
// 侧栏一屏能放十几二十格,全都跑动图解码会明显掉帧。超过阈值后默认显示主进程给的
// 静态首帧(thumb,JPEG 缓存),只有鼠标移上去那一张才切回原图(动图)。
const GIF_ANIM_LIMIT = 5
// 当前悬停的 GIF(存 src,同一时刻只放一张动图跑)
const hoveredGif = ref(null)
const isGif = (it) => {
  // ★ 用 raw(原始绝对路径)优先,src 兜底:
  //   src 在网页版是 /api/file?path=... 这种形式,对整串做正则会受查询串干扰;
  //   raw 永远是磁盘路径,最可靠。判断前先剥掉 ?_n=xxx 这类防缓存参数。
  const s = String((it && (it.raw || it.src)) || '')
  const clean = s.split('?')[0].split('#')[0]
  return /\.gif$/i.test(clean)
}
// 预览里 GIF 的张数:<= 5 张就照旧全部允许动画
const gifCount = computed(() => previewItems.value.reduce((n, it) => n + (isGif(it) ? 1 : 0), 0))
// 实际显示的地址:能显示永远优先于「省解码」。
// thumb(主进程现算的 JPEG 小图,长边 ≤360px)优先 —— 预览格只有 ~100px 宽,
// 原图几千像素按 100px 显示也要整张解码,图越大越卡,几十张一起解码会把渲染线程占满。
// ★ 但**任何分支都不许返回空串**:GIF 超过阈值、首帧还没算好时以前返回 '',
//   模板就落到 .detail-preview-pending 占位块 —— 用户看到的就是「概率性空白」。
//   兜底一律退回 it.src(原图必然存在):宁可多解一张图,也不能留白。
const displaySrc = (it) => {
  if (!it) return ''
  // 非 GIF:有已压好的小图就用,否则**立刻**退回原图 ——
  //   ★ 这里是硬约束:任何情况下都不许返回空串。
  //   上一版为了等小图返回空串,小图没回来时整屏就是空白(用户反馈)。
  //   宁可多解一张原图,也不能让预览空着。
  if (!isGif(it)) return it.thumb || it.src || ''
  // GIF 少:直接放动图;GIF 多:默认静态首帧,悬停那一张才换回动图
  if (gifCount.value <= GIF_ANIM_LIMIT) return it.src || ''
  if (hoveredGif.value === it.src) return it.src || ''
  return it.thumb || it.src || ''
}
// thumb 是小图缓存,可能被清理或写坏:失败就丢掉 thumb 退回原图,让模板重新算 src。
// 以前是直接 display:none → 格子纯白;现在至少还能出图。
const onPreviewError = (it) => {
  if (!it) return
  if (it.thumb) { it.thumb = ''; it.loaded = false; return }
  it.loaded = true   // 原图也失败:极端情况(文件已被删),不弹任何 UI
}
const hoverGif = (it, on) => {
  if (!isGif(it) || gifCount.value <= GIF_ANIM_LIMIT) return
  hoveredGif.value = on ? it.src : null
}
// 预览小图:book-preview-images 只回路径(批次很快就返回 → 预览快速铺开),
// 前端随后用 preview-thumbs-batch 在后台补「长边 ≤360px 的小图」,回来再淡入。
// 这样既不会「一批一批地冒出来」,也不会拿原图(几千像素)去按 100px 显示。
let thumbFetching = false
const ensurePreviewThumbs = async () => {
  if (thumbFetching) return
  const need = previewItems.value.filter(it => !it.thumb && !it.loaded && it.raw)
  if (!need.length) return
  thumbFetching = true
  // 一次最多补 60 张,避免一屏几十格 + 后续预取把主进程压满
  const batch = need.slice(0, 24)
  try {
    const r = await ipcRenderer.invoke('preview-thumbs-batch', batch.map(it => it.raw))
    if (r && r.ok && Array.isArray(r.thumbs)) {
      batch.forEach((it, i) => {
        const p = r.thumbs[i]
        // 只升级「原图还没加载完」的格子:已经显示出来的换源会闪一下,不值当
        if (p && !it.loaded) it.thumb = toAssetUrl(p)
      })
    }
  } catch (e) {
    // 失败无所谓:显示层本来就用原图兜底
  } finally {
    thumbFetching = false
    // 补图期间又进了新格子:收尾再补一次。
    // 已经拿到 thumb 或已经加载完的会被过滤掉,所以不会死循环。
    if (previewItems.value.some(x => !x.thumb && !x.loaded && x.raw)) {
      setTimeout(() => { ensurePreviewThumbs() }, 0)
    }
  }
}
// 雪碧图切片:交给 CSS 的 --cell 变量缩放。
// 以前每次算 style 都带 transform:scale + 负 margin,而且 watch(width) 在拖拽时
// 每个 mousemove 都要把整张网格的 style 重算一遍 —— 这就是「拖动侧栏时预览卡」的根因。
// 现在每格只需在**插入时**记下自己的原图偏移与尺寸,缩放完全由 CSS 变量驱动:
//   background-size / background-position 都用 calc(var(--cell) * ...) 表达,
//   拖宽时只改根节点的 --cell,零 JS 重算。
// 雪碧图的 4 个尺寸变量要复制到「格子本身」:格子的 height 用 calc(var(--th)/var(--tw)),
// 而 CSS 变量只向下继承 —— 写在切片子元素上,父级格子读不到,高度会塌回 3/4 把长页切掉。
const spriteBoxStyle = (s) => ({
  '--ox': s['--ox'],
  '--tw': s['--tw'],
  '--th': s['--th'],
  '--sw': s['--sw'],
})
const spriteStyleOf = (th) => {
  const w = Number(th.width) || 200
  const h = Number(th.height) || 287
  // sw = 整张雪碧图总宽(解析时算好);缺失时退化成一格宽(至少不错位到离谱)
  const sw = Number(th.spriteWidth) || w
  return {
    backgroundImage: 'url(' + ehImageSrc(th.thumb, '', th.href || th.pageUrl || '') + ')',
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
// 「本轮想取到第几页」的上限:首屏 PREVIEW_AUTO 页,滑到底就再涨一批(以前恒为 60 → 永远不再取图)
const previewAutoLimit = ref(PREVIEW_AUTO)
// ★稳定游标:下一次向主进程请求的起始页。
//   以前增量加载用 `start = previewItems.length + previewQueue.length`,而每次进来先
//   clearPreviewQueue() —— 还没渲染的帧被丢掉,length 就缩水,start 又退回去
//   → 同一段页被反复请求(浪费 IPC/解压),页多了还会错位/缺页。
//   现在游标只随「真正发出的请求」前进,与渲染进度无关。
let previewCursor = 0
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
  // 这一帧有新图进列表:后台补小图(内部按 !it.thumb 过滤 + thumbFetching 防重入)
  ensurePreviewThumbs()
  if (previewQueue.length && token === previewToken) {
    previewRaf = requestAnimationFrame(flushPreviewQueue)
  }
}
const pushPreviewQueue = (files, thumbs, baseIndex = 0) => {
  for (let i = 0; i < files.length; i += 1) {
    previewQueue.push({
      // 这一格对应书里的第几页(0 基)。★ 必须单独记:
      //   删掉一张预览后列表会整体前移,再用数组下标当页码就会「点第 6 页打开第 7 页」。
      pageIndex: baseIndex + i,
      src: toAssetUrl(files[i]),
      // 主进程这一批顺带算好的「小图」(长边 ≤360px):
      // 显示优先用它 —— 原图动辄几千像素,按 100px 显示却要整张解码,图越大越卡。
      // 没算出来的(超预算/生成失败)留空,模板会退回原图。
      thumb: (thumbs && thumbs[i]) ? toAssetUrl(thumbs[i]) : '',
      // 原始绝对路径:右键操作/从这一页阅读/preview-thumbs 都用这个
      raw: files[i],
      loaded: false,
    })
  }
  if (!previewRaf) previewRaf = requestAnimationFrame(flushPreviewQueue)
}
const clearPreviewQueue = () => {
  previewQueue.length = 0
  if (previewRaf) { cancelAnimationFrame(previewRaf); previewRaf = 0 }
}

const loadLocalPreview = async (b, reset = true) => {
  if (!b || !b.filepath) return 0
  const token = ++previewToken
  if (reset) {
    // 只有「换书/重来」才清队列:增量加载清队列会把还没渲染的帧丢掉(见 previewCursor 注释)
    clearPreviewQueue()
    previewItems.value = []
    previewTotal.value = 0
    previewCursor = 0
    previewAutoLimit.value = PREVIEW_AUTO
  }
  previewLoading.value = true
  // 返回本轮真正取到的页数,供 autoLoadMorePreview 判断「有没有进展」(防死循环)
  let fetched = 0
  try {
    // 增量加载:游标已经顶到上限时把上限再抬一批,保证下面的 while 一定能进来
    if (previewCursor >= previewAutoLimit.value) previewAutoLimit.value = previewCursor + PREVIEW_AUTO
    let start = previewCursor
    while (token === previewToken && start < previewAutoLimit.value) {
      const res = await ipcRenderer.invoke('book-preview-images', {
        filepath: b.filepath, type: b.type, start, count: PREVIEW_BATCH
      })
      if (token !== previewToken) return fetched
      if (!res || !res.ok) break
      previewTotal.value = res.total || 0
      const fresh = (res.files || [])
      if (!fresh.length) break
      pushPreviewQueue(fresh, res.thumbs, start)
      fetched += fresh.length
      // 按「请求的批量」前进,而不是按实际返回条数:个别页解压失败时不会重复请求同一段
      start += PREVIEW_BATCH
      previewCursor = start
      if (start >= previewTotal.value) break
    }
  } catch (e) { /* 预览失败不影响其它信息 */ } finally {
    if (token === previewToken) previewLoading.value = false
  }
  return fetched
}
// 滑到底自动加载下一页(哨兵 + IntersectionObserver,和详细界面同一套)
const autoLoadMorePreview = async () => {
  if (previewAutoBusy || previewLoading.value) return
  // 已知总页数且已经取满 → 没什么可加载的
  if (previewTotal.value && previewItems.value.length >= previewTotal.value) return
  previewAutoBusy = true
  try {
    const before = previewItems.value.length + previewQueue.length
    let fetched = 0
    if (book.value && book.value.online) {
      // 在线书:后台补页没在跑就再启动一次(它自己会从当前 thumbnails 继续)
      await ensureOnlineThumbs()
    } else {
      fetched = await loadLocalPreview(book.value, false)
    }
    await nextTick()
    // ★没有任何新增就停:以前「取不到也继续往下递归」+ 60 页上限 = 无限自我递归,
    //   滑到底会卡住整个面板。这里必须有进展才继续。
    if (fetched <= 0 && previewItems.value.length + previewQueue.length <= before) return
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
// ---------- 合集(聚合条目) ----------
// 合集不是磁盘上的文件:没有页预览、没有评论、不能改「整组评分」,
// 页数/阅读次数/大小一律取聚合字段(与书架卡片、详细界面同一个口径)。
const isCollection = computed(() => !!(book.value && book.value.isCollection))
// 成员按 ids 回 bookList 取实时对象(老数据没有 ids 时退回 list,那里存的是 hash)
const collectionMembers = computed(() => {
  if (!isCollection.value) return []
  const b = book.value || {}
  const keys = Array.isArray(b.ids) && b.ids.length ? b.ids : (Array.isArray(b.list) ? b.list : [])
  const out = []
  for (const key of keys) {
    const m = bookList.value.find(x => x && (x.id === key || x.hash === key))
    if (m) out.push(m)
  }
  return out
})
// 合集大小 = 成员文件大小合计
const collectionSizeText = computed(() => {
  const total = collectionMembers.value.reduce((sum, m) => sum + (Number(m && m.filesize) || 0), 0)
  if (!total) return ''
  if (total >= 1024 * 1024 * 1024) return (total / 1024 / 1024 / 1024).toFixed(2) + ' GB'
  if (total >= 1024 * 1024) return (total / 1024 / 1024).toFixed(1) + ' MB'
  return (total / 1024).toFixed(0) + ' KB'
})
// 合集评分 = 只统计真的评过分的成员(rating > 0)的均值;与详细界面同一套算法
const collectionAvgRating = computed(() => {
  const rated = collectionMembers.value.filter(m => Number(m && m.rating) > 0)
  if (!rated.length) return Number(book.value.rating) || 0
  return Math.round((rated.reduce((a, m) => a + Number(m.rating), 0) / rated.length) * 10) / 10
})
const rateValue = computed(() => isCollection.value ? collectionAvgRating.value : (Number(book.value.rating) || 0))
// 封面:普通书用 coverPath;合集用聚合封面,没有就退到「第一个有封面的成员」
// (聚合封面是生成那一刻的快照,成员后来补了封面不会回填 —— 与书架卡片同一类兜底)
const coverSrc = computed(() => {
  const b = book.value || {}
  if (b.coverPath) return b.coverPath
  if (!isCollection.value) return ''
  const m = collectionMembers.value.find(x => x && x.coverPath)
  return m ? m.coverPath : ''
})
// ---------- 文字书(txt / epub)识别与正文摘要 ----------
// 需求:侧边详情打开的是文字文件时,预览图位置改成显示文字内容(而不是一张封面)。
// 判据:文件扩展名。不调用后端 —— 侧栏要的是「立刻有反应」,读文件是异步且有失败可能的,
// 这里只在识别到是文字书之后去取一小段正文。
const TEXT_EXTS = ['txt', 'epub']
// 星级配色固定成金色:以前跟随 el-rate 默认色,半星那档渲染出来是灰的,
// 看起来像「2.5 星错位」
const RATE_COLORS = ['#F7BA2A', '#F7BA2A', '#F7BA2A']

const isTextBook = computed(() => {
  const b = book.value
  if (!b || b.online || b.isCollection) return false
  const fp = String(b.filepath || '')
  if (!fp) return false
  const ext = fp.slice(fp.lastIndexOf('.') + 1).toLowerCase()
  return TEXT_EXTS.includes(ext)
})
const textPreview = ref('')
// 取正文开头一段当摘要。失败就留空(显示占位文案),不影响其它功能。
const textPreviewLoading = ref(false)
const loadTextPreview = async (b) => {
  textPreview.value = ''
  if (!b || !b.filepath) return
  textPreviewLoading.value = true
  try {
    // 深拷贝:主进程会往这个对象上写字段,直接传响应式对象会触发跨进程序列化报错
    const payload = JSON.parse(JSON.stringify(b))
    const res = await ipcRenderer.invoke('load-novel-content', payload)
    if (!res || !res.ok) return
    const txt = (res.blocks || [])
      .filter(blk => blk && blk.kind === 'text' && blk.text)
      .map(blk => String(blk.text).trim())
      .filter(Boolean)
      .join('\n')
    // 侧栏空间有限,取开头一段即可(点进去就是完整阅读器)
    textPreview.value = txt.slice(0, 3000)
  } catch (e) { /* 读不到就显示占位 */ } finally {
    textPreviewLoading.value = false
  }
}
watch(() => [book.value && book.value.id, isTextBook.value], () => {
  if (isTextBook.value) loadTextPreview(book.value)
  else textPreview.value = ''
}, { immediate: true })

// ---------- 评分编辑 ----------
// 需求:星星要能点着改(半星步进),不是只读。
// 只读账户不给改(和「编辑信息」等按钮同一套权限语义)。
const canEditRate = computed(() => !viewerRole.value && !isCollection.value)
const onRateChange = (v) => {
  if (!canEditRate.value) return
  const b = book.value
  if (!b || !b.id || b.isCollection) return
  const next = Number(v) || 0
  if (Number(b.rating) === next) return
  b.rating = next
  emit('save-book', b)
}

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
// 面板被拖宽/拖窄:缩略图是按「容器宽 / 列数」算的,宽度一变就要重算(否则会错位或留白)。
// ⚠ 拖动时 mousemove 会不停改 width —— 以前每个事件都重建全部缩略图(A 线已证实缺陷:拖宽卡顿)。
//   现在合并成一次:拖动过程中只等 180ms 静默后同步,松手时由 startResize 的 onUp 立刻同步一次。
let previewWidthTimer = 0
const scheduleSyncOnlinePreview = (delay = 180) => {
  if (previewWidthTimer) clearTimeout(previewWidthTimer)
  previewWidthTimer = setTimeout(() => {
    previewWidthTimer = 0
    if (!book.value || !book.value.online) return
    syncOnlinePreview()
  }, delay)
}
watch(() => props.width, () => {
  if (!book.value || !book.value.online) return
  scheduleSyncOnlinePreview(180)
})
onBeforeUnmount(() => { if (previewWidthTimer) { clearTimeout(previewWidthTimer); previewWidthTimer = 0 } })

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
  hoveredGif.value = null
  if (!id || !b || !b.id) return
  // 合集:没有页图、没有评论 —— 直接收尾,别去读那个「逗号拼起来的假路径」
  // (以前会走 loadLocalPreview,拿到不存在的路径后侧栏永远停在「加载失败」)。
  if (b.isCollection) {
    previewLoading.value = false
    previewItems.value = []
    previewError.value = ''
    // 上一条(普通书)的评论必须清掉,否则合集下面会挂着别人的评论
    comments.value = []
    return
  }
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
      // html 为 null(主进程失败,B 线)或解析不出详情:都带上具体原因,别只说「失败」
      if (!html) await warnEhFailed()
      else ElMessage.warning(t('m.ehOnlineFailed'))
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

// ---------- 标签右键菜单:编辑标签 / 加入黑名单 ----------
// 复用项目已有的 @imengyu/vue3-context-menu(用法同 BookCard.vue 的 onBookContextMenu)
// 在线画廊也弹,但只给「加入黑名单」(它没有本地标签数据,没有「编辑标签」这回事)
const onTagContextMenu = (e, tag, cat) => {
  // 边界:空标签不弹;只读账户不弹
  if (!tag) return
  if (viewerRole.value) return
  const items = []
  if (!(book.value || {}).online) {
    items.push({
      label: t('m.editTag'),
      // 载荷与 EditView 的 tagLongPress 完全一致({ tag: {id,cat,tag,letter}, book }),
      // 这样 App.vue 可以直接绑 @edit-tag="openQuickTagEdit",不用写适配层
      onClick: () => emit('edit-tag', { tag: { id: cat + ':' + tag, cat, tag, letter: cat }, book: book.value })
    })
  }
  items.push({
    label: t('m.addToBlacklist'),
    onClick: () => addTagToBlacklistAndRefresh(tag)
  })
  if (!items.length) return
  ContextMenu.showContextMenu({ x: e.x, y: e.y, items })
}
// ---------- 预览图右键菜单(与阅读器「图片右键菜单」同一套) ----------
// 需求:预览图右键要跟阅读器里对图片右键一致 —— 复制图片/图片属性/设为封面/重命名/
// 恢复备份/超分/提取文字/翻译/上色/删除,而不是原来那四个「打开/复制路径」的简化版。
// 预览项只有 raw(绝对路径)/src,阅读器要的是 { id, filepath, relativePath } —— 这里做一层适配。
const onImageContextMenu = (e, it, index) => {
  if (!it) return
  const b = book.value || {}
  const raw = String(it.raw || '')
  const isOnline = !!b.online
  // 在线画廊:沿用阅读器那套「下载本页 / 下载本页(原图) / 复制图片地址」
  if (isOnline) {
    const url = raw || it.src || ''
    const items = []
    if (url) {
      items.push({
        id: 'downloadPage',
        label: t('m.downloadPage'),
        onClick: () => emit('download-page', { url, original: false, pageUrl: it.pageUrl, name: (b.title || 'eh') + ' - ' + (index + 1) })
      })
      items.push({
        id: 'copyImageUrl',
        label: t('m.downloadCopyImageUrl'),
        onClick: () => ipcRenderer.invoke('copy-text-to-clipboard', url)
      })
    }
    if (!items.length) return
    ContextMenu.showContextMenu({ x: e.x, y: e.y, items })
    return
  }
  // 本地书:原样复用阅读器的图片右键菜单
  if (!raw) {
    // 没有本地路径(极少数情况):只给「从这一页开始阅读」
    ContextMenu.showContextMenu({
      x: e.x, y: e.y,
      items: [{ id: 'readHere', label: t('m.readFromThisPage', { n: index + 1 }), onClick: () => emit('read', b, index) }]
    })
    return
  }
  // 与阅读器同一套菜单(共享模块),调用方只负责「弹窗怎么弹」与通知
  const image = imageObjectFromPreview(it, b)
  buildImageContextMenuItems({
    image,
    book: b,
    t,
    deps: {
      viewerRole: viewerRole.value,
      printMessage: (type, msg) => emit('print-message', { type, msg }),
      onRestoreBakDone: () => refreshPreviewItem(it),
      onUpscaled: () => refreshPreviewItem(it),
      onRenamed: (img, res) => {
        if (res && res.path) {
          it.raw = res.path
          it.relativePath = image.relativePath
          it.src = toAssetUrl(res.path)
        }
        refreshPreviewItem(it)
      },
      onDeleted: () => {
        previewItems.value = previewItems.value.filter(x => x !== it)
        if (previewTotal.value > 0) previewTotal.value -= 1
      }
    }
  }).then(items => {
    // 跟随「设置 → 高级 → 右键菜单」的开关与顺序
    const shown = (items || []).filter(it => isContextMenuItemEnabled(setting.value, 'image', it.id))
    if (!shown.length) return
    ContextMenu.showContextMenu({ x: e.x, y: e.y, items: sortContextMenuItems(setting.value, 'image', shown) })
  })
}

// 「加入黑名单」:写的是**原始 tag 名**(不是翻译后的显示名 —— 过滤用的是原值)
const addTagToBlacklistAndRefresh = async (tag) => {
  const r = addTagToBlacklist(tag)
  if (!r || !r.changed) {
    ElMessage.info(t('m.blacklistExists'))
    return
  }
  ElMessage.success(t('m.blacklistAdded', { name: tag }))
  // 黑名单过滤没开时问一句:否则用户加了标签却看不到列表变化,以为没生效
  if (!r.blacklistEnabled) {
    try {
      await ElMessageBox.confirm(t('m.blacklistEnableConfirm'), t('m.addToBlacklist'), { type: 'warning' })
      setBlacklistEnabled(true)
    } catch (e) { /* 用户不开就算了 */ }
  }
  // ⚠ 不论是否启用都要刷新:App 里的 ehFilter 是启动时的快照,
  //   以前只有「刚启用」那条分支才刷,于是加完词筛选对话框里看不到、列表也不重筛。
  emit('refresh-list')
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
    // 照 e-hentai 详情页:列数随面板宽度自适应(2~8 列,按目标格宽 160 反算,见 script 里 previewCols)
    grid-template-columns: repeat(v-bind(previewCols), 1fr)
    gap: 8px
    padding-right: 2px
  // 预览格:不要任何框/底色,只留图片本身
  .detail-preview-item
    width: 100%
    // ★ 同弹窗:高度必须是显式值。aspect-ratio + height:auto 配 img{height:100%} 会让
    //   百分比高度退化,格子被图片自身比例撑高,一行高低参差。
    height: calc(var(--cell, 150px) * 4 / 3)
    overflow: hidden
    background: transparent
    cursor: pointer
    position: relative
    border-radius: 2px
    content-visibility: auto
    // 离屏占位高度跟着新格子高(4/3 格宽):还是老值 140px 的话滚动条长度会跳
    contain-intrinsic-size: auto calc(var(--cell, 150px) * 4 / 3)
    img
      width: 100%
      height: 100%
      // 用 contain 而不是 cover:长条页/竖长页完整显示,不再被裁成中间一小条
      object-fit: contain
      display: block
      // 用户要求取消加载淡入:图片解码完直接显示,不做 opacity 过渡
  // 雪碧图格子:高度按切片本身的比例走(EH 页多为 100x140,比 3/4 高)
  .detail-preview-item.is-sprite
    aspect-ratio: auto
    height: calc(var(--cell) * var(--th, 1.4) / var(--tw, 1))
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
  // 预览加载期间不显示任何转圈/占位(用户要求取消加载动画)
  .detail-preview-error
    font-size: 12px
    color: var(--el-text-color-placeholder)
</style>

