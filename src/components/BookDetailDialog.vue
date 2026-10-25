<template>
  <el-dialog v-model="dialogVisibleBookDetail"
    fullscreen
    class="dialog-detail"
  >
    <el-row :gutter="20" class="book-detail-card">
      <el-col :span="6">
        <!-- 标题:与封面同宽居中显示(与图片、按钮对齐) -->
        <div class="detail-title-above-cover" :title="getDisplayTitle(bookDetail)">
          <span class="url-link" @click="openUrl(bookDetail.url)" @contextmenu="onMangaTitleContextMenu($event, bookDetail)">{{ getDisplayTitle(bookDetail) }}</span>
        </div>
        <el-row class="book-detail-function book-detail-cover-frame">
          <img
            class="book-detail-cover"
            :src="bookDetail.coverPath"
            @click="$emit('openContentView', bookDetail)"
            @mousedown.middle.prevent="openLocalBook(bookDetail)"
            @contextmenu="$emit('openThumbnailView', bookDetail)"
            @load="detailCoverLoading = false"
            @error="onCoverError"
          />
          <div class="cover-loading" v-if="detailCoverLoading">
            <el-icon class="is-loading" :size="26"><Loading /></el-icon>
          </div>
          <el-icon
            v-if="!setting.hideBookmarkButton && !viewerRole"
            :size="30"
            :color="bookDetail.mark ? '#E6A23C' : '#666666'"
            class="book-detail-star" @click="switchMark(bookDetail)"
          ><BookmarkTwotone /></el-icon>
          <div class="next-manga-pane" @click="$emit('jumpMangeDetail', 1)"><el-icon text><CaretRight20Regular /></el-icon></div>
          <div class="prev-manga-pane" @click="$emit('jumpMangeDetail', -1)"><el-icon text><CaretLeft20Regular /></el-icon></div>
        </el-row>
        <el-row :gutter="20" class="book-detail-rate">
          <el-rate v-model="bookDetail.rating" size="large" allow-half :disabled="viewerRole" @change="saveBook(bookDetail)"/>
        </el-row>
        <el-row class="book-detail-function">
          <el-descriptions :column="1">
            <el-descriptions-item v-if="pageCountText !== '—'" :label="$t('m.pageCount')+':'" :class-name="bookDetail.pageDiff ? 'text-red' : ''">
              {{ pageCountText }}
            </el-descriptions-item>
            <el-descriptions-item v-if="isOnline ? !!bookDetail.size : fileSizeText !== '—'" :label="$t('m.fileSize')+':'">
              {{ isOnline ? bookDetail.size : fileSizeText }}
            </el-descriptions-item>
            <el-descriptions-item v-if="!isOnline" :label="$t('m.readCount')+':'">{{bookDetail.readCount}}</el-descriptions-item>
            <el-descriptions-item v-if="!isOnline" :label="$t('m.mtime')+':'">{{new Date(bookDetail.mtime).toLocaleString("zh-CN")}}</el-descriptions-item>
            <el-descriptions-item v-if="isOnline && bookDetail.uploader" :label="$t('m.ehOnlineUploader')+':'">{{bookDetail.uploader}}</el-descriptions-item>
            <el-descriptions-item v-if="bookDetail.posted" :label="$t('m.postTime')+':'">{{ isOnline ? bookDetail.posted : new Date(bookDetail.posted * 1000).toLocaleString("zh-CN") }}</el-descriptions-item>
          </el-descriptions>
        </el-row>
        <el-row class="book-detail-function">
          <el-button-group class="detail-read-group">
            <el-button type="success" plain @click="openLocalBook(bookDetail)">{{$t('m.re')}}</el-button>
            <el-button type="success" plain @click="$emit('openContentView', bookDetail)">{{$t('m.ad')}}</el-button>
          </el-button-group>
          <el-button class="detail-func-btn" plain @click="triggerShowComment">{{setting.showComment ? $t('m.hideComment') : $t('m.showComment')}}</el-button>
          <el-button v-if="!viewerRole && !isOnline" class="detail-func-btn" type="primary" plain @click="editTags">{{editingTag ? $t('m.viewInfo') : $t('m.editInfo')}}</el-button>
          <el-button v-if="isOnline" class="detail-func-btn" type="primary" plain @click="openUrl(bookDetail.url)">{{$t('m.ehOnlineOpen')}}</el-button>
          <!-- 种子:与封面右键/卡片右下角的是同一个入口 -->
          <el-button v-if="bookDetail.url" class="detail-func-btn" type="primary" plain @click="emit('openTorrents', bookDetail)">{{$t('m.torrent')}}</el-button>
          <!-- 下载整本(原图可选):与封面右键里的两项一致 -->
          <!-- 下载:合并成一个按钮,点开弹窗里选 位置 / 名称 / 原图 -->
          <el-button v-if="!viewerRole && isOnline" class="detail-func-btn" type="primary" :icon="Download" @click="emit('downloadGallery', { book: bookDetail, original: false })">{{$t('m.download')}}</el-button>
          <!-- H@H 归档下载:照 JHenTai 详情页的 H@H 按钮(EH 服务端打包,选分辨率后下载) -->
          <el-button v-if="!viewerRole && isOnline && bookDetail.archivePageUrl" class="detail-func-btn" type="warning" plain @click="emit('openHhDownload', bookDetail)">H@H</el-button>
        </el-row>
        <el-row class="book-detail-function" v-if="!isOnline">
          <el-button v-if="!viewerRole" class="detail-func-btn" type="primary" plain @click="$emit('openSearchDialog')">{{$t('m.getMetadata')}}</el-button>
          <el-button v-if="!viewerRole" class="detail-func-btn" type="primary" plain @click="triggerHiddenBook(bookDetail)">{{bookDetail.hiddenBook ? $t('m.showManga') : $t('m.hideManga')}}</el-button>
          <el-button class="detail-func-btn" plain @click="showFile(bookDetail.filepath)">{{$t('m.openMangaFileLocation')}}</el-button>
        </el-row>
        <el-row class="book-detail-function" v-if="!viewerRole && !isOnline">
          <el-button class="detail-func-btn" type="danger" plain @click="deleteLocalBook(bookDetail)">{{$t('m.deleteFile')}}</el-button>
          <el-button class="detail-func-btn" plain @click="rescanBook(bookDetail)">{{$t('m.rescan')}}</el-button>
        </el-row>
      </el-col>
      <el-col :span="setting.showComment ? 10 : 18">
        <el-scrollbar class="book-tag-frame">
          <div v-if="editingTag && !viewerRole">
            <!-- 标题:沿用原样式(日文标题 / 中文标题 / 英文标题 三个输入框) -->
            <div class="edit-line">
              <el-input v-model="bookDetail.title_jpn" :placeholder="$t('m.titleLangJpn')" @change="saveBook(bookDetail)"></el-input>
            </div>
            <div class="edit-line">
              <el-input v-model="bookDetail.title_cn" :placeholder="$t('m.titleLangCn')" @change="saveBook(bookDetail)"></el-input>
            </div>
            <div class="edit-line">
              <el-input v-model="bookDetail.title" :placeholder="$t('m.titleLangEn')" @change="saveBook(bookDetail)"></el-input>
            </div>
            <div class="edit-line">
              <el-select v-model="bookDetail.status" :placeholder="$t('m.metadataStatus')" @change="saveBook(bookDetail)">
                <el-option v-for="status in statusOption" :value="status" :key="status" :label="status" />
              </el-select>
            </div>
            <div class="edit-line">
              <el-input v-model="bookDetail.url" :placeholder="$t('m.ehexAddress')" @change="saveBook(bookDetail)"></el-input>
            </div>
            <div class="edit-line">
              <el-select v-model="bookDetail.category" :placeholder="$t('m.category')" @change="saveBook(bookDetail)" clearable>
                <el-option v-for="cat in categoryOption" :value="cat" :key="cat" :label="galleryCategoryName(cat, $t)" />
              </el-select>
            </div>
            <!-- 标签:与原选择框一致(框内可打字筛选/新建),下拉里标签一排一排排列 -->
            <div class="tag-picker" v-for="(arr, key) in tagGroup" :key="key">
              <el-select
                v-model="bookDetail.tags[key]"
                class="tag-select"
                multiple
                filterable
                clearable
                allow-create
                default-first-option
                :reserve-keyword="false"
                fit-input-width
                popper-class="tag-select-dropdown"
                :placeholder="resolvedTranslation[key]?._name || catDisplayName(key)"
                @change="saveBookTags(bookDetail)"
              >
                <el-option
                  v-for="opt in arr"
                  :key="key + '|' + opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </div>
            <el-space wrap class="tag-edit-buttons">
              <el-button @click="addTagCat">{{$t('m.addCategory')}}</el-button>
              <el-button type="success" @click="openAddNewTagDialog">{{$t('m.addNewTag')}}</el-button>
              <el-button @click="$emit('getBookInfo')">{{$t('m.getTagbyUrl')}}</el-button>
              <el-button :loading="queryingOrigins" @click="queryBookOrigins">{{$t('m.queryCharacterOrigins')}}</el-button>
              <el-button :loading="analyzingTitle" @click="analyzeBookTitleCharacters">{{$t('m.translateTitle')}}</el-button>
              <el-button @click="notImplemented($t('m.superResolution'))">{{$t('m.superResolution')}}</el-button>
              <el-button @click="notImplemented($t('m.colorization'))">{{$t('m.colorization')}}</el-button>
              <el-button @click="resetMetadata(bookDetail)">{{$t('m.resetMetadata')}}</el-button>
              <el-button @click="copyTagClipboard(bookDetail)">{{$t('m.copyTagClipboard')}}</el-button>
              <el-button @click="pasteTagClipboard(bookDetail)">{{$t('m.pasteTagClipboard')}}</el-button>
            </el-space>
            <!-- 增加标签:选类别 + 输入名称;同类别内重名(含跨语言名称)必须指定所属集合 -->
            <el-dialog v-model="newTagDialogVisible" :title="$t('m.addNewTag')" width="420px" append-to-body>
              <div class="add-tag-form">
                <el-select v-model="newTagCat" :placeholder="$t('m.category')" style="width: 100%; margin-bottom: 10px;" @change="checkNewTagDup">
                  <el-option v-for="c in categoryOption" :key="c" :label="galleryCategoryName(c, $t)" :value="c" />
                </el-select>
                <el-input v-model="newTagName" :placeholder="$t('m.tagNamePlaceholder')" @input="checkNewTagDup" />
                <div v-if="newTagDups.length" class="add-tag-warn">
                  <p class="add-tag-warn-text">{{ $t('m.tagDuplicateHint') }}</p>
                  <el-select v-model="newTagParent" filterable :placeholder="$t('m.pickParentSet')" style="width: 100%;">
                    <el-option v-for="o in newTagParentOptions" :key="o.value" :label="o.label" :value="o.value" />
                  </el-select>
                </div>
              </div>
              <template #footer>
                <el-button size="small" @click="newTagDialogVisible = false">{{ $t('m.cancel') }}</el-button>
                <el-button size="small" type="primary" :disabled="!canCreateNewTag" @click="createNewTagHere">{{ $t('m.apply') }}</el-button>
              </template>
            </el-dialog>
          </div>
          <div v-else class="book-info-block">
            <el-descriptions :column="1">
              <!-- 标题:浏览模式只展示各语言已有标题;需要修改请点「编辑信息」 -->
              <el-descriptions-item v-if="bookDetail.title_jpn" :label="$t('m.titleLangJpn')+':'">{{ bookDetail.title_jpn }}</el-descriptions-item>
              <el-descriptions-item v-if="bookDetail.title_cn" :label="$t('m.titleLangCn')+':'">{{ bookDetail.title_cn }}</el-descriptions-item>
              <el-descriptions-item v-if="bookDetail.title" :label="$t('m.titleLangEn')+':'">{{ bookDetail.title }}</el-descriptions-item>
              <el-descriptions-item v-if="!isOnline" :label="$t('m.filename')+':'">{{returnFileNameWithExt(bookDetail.filepath)}}</el-descriptions-item>
              <el-descriptions-item v-if="!isOnline" :label="$t('m.fileLocation')+':'">{{returnDirname(bookDetail.filepath)}}</el-descriptions-item>
              <!-- 没有的信息就不渲染这一行(特别是类别为空时,不再显示一个空行/空胶囊) -->
              <el-descriptions-item v-if="bookDetail.category" :label="$t('m.category')+':'">
                <span class="book-tag-cell">
                  <span class="book-tag-pill" @click="$emit('searchFromTag', `cat:${bookDetail.category}`)">{{ galleryCategoryName(bookDetail.category, $t) }}</span>
                </span>
              </el-descriptions-item>
              <!-- 类别(标签的类别分组):**并入上面这张信息表**,每个类别一行,和页数/文件大小/上传者同款;
                   分类顺序跟「设置 → 标签设置」里拖动的类别顺序一致。标签(胶囊)本身的样式不动 -->
              <el-descriptions-item v-for="g in tagGroups" :key="g.key" :label="g.label">
                <span class="book-tag-cell">
                  <el-popover
                    v-for="tag in g.tags"
                    :key="tag"
                    effect="dark"
                    trigger="hover"
                    :content="resolvedTranslation[g.key]?.[tag]?.intro || tagDisplayName(setting, resolvedTranslation, g.key, tag)"
                    :disabled="!resolvedTranslation[g.key]?.[tag]?.intro"
                    placement="top-start"
                    :show-after="500"
                    width="300px"
                  >
                    <template #reference>
                      <span
                        class="book-tag-pill"
                        :style="tagPillStyle(g.key, tag)"
                        @click="$emit('searchFromTag', tag, g.key)"
                      >{{ tagDisplayName(setting, resolvedTranslation, g.key, tag) }}</span>
                    </template>
                  </el-popover>
                </span>
              </el-descriptions-item>
            </el-descriptions>
          </div>
          <!-- 故事简介:有内容才显示(在线画廊没有简介 → 整块不出现);编辑模式始终显示以便填写 -->
          <div class="story-summary" v-if="bookDetail.description || (editingTag && !viewerRole)">
            <div class="story-summary-title">{{ $t('m.storySummary') }}</div>
            <el-input
              v-if="editingTag && !viewerRole"
              v-model="bookDetail.description"
              type="textarea"
              :autosize="{ minRows: 4, maxRows: 16 }"
              :placeholder="$t('m.storySummaryPlaceholder')"
              @change="saveBook(bookDetail)"
            />
            <div v-else class="story-summary-text">{{ bookDetail.description }}</div>
          </div>
          <!-- 预览:本地书按批取图;在线画廊用它自己的页预览(雪碧图)。放在「故事简介」下方 -->
          <div class="book-preview" v-if="previewItems.length || previewLoading">
            <div class="book-preview-title">
              <span>{{ $t('m.ehOnlinePagePreview') }}</span>
              <span class="book-preview-hint" v-if="previewTotal > previewItems.length">{{ previewItems.length }}/{{ previewTotal }}</span>
              <span class="book-preview-hint" v-else-if="previewRawTotal > previewTotal">{{ previewTotal }}/{{ previewRawTotal }}</span>
            </div>
            <div class="book-preview-strip">
              <div
                v-for="(it, i) in previewItems"
                :key="i"
                class="book-preview-item"
                :title="'P' + (i + 1)"
                @click="readFromPreview(i)"
              >
                <div v-if="it.sprite" class="book-preview-sprite" :style="it.sprite" />
                <img v-else :src="it.src" loading="lazy" @error="$event.target.style.display='none'" />
              </div>
              <!-- 滑到这里就自动加载下一批,不用再点加号 -->
              <div
                v-if="previewItems.length < previewTotal"
                ref="previewSentinel"
                class="book-preview-loading book-preview-sentinel"
                :title="$t('m.previewLoadMore')"
              >
                <el-icon v-if="previewLoading" class="is-loading" :size="18"><Loading /></el-icon>
                <span>{{ previewItems.length }}/{{ previewTotal }}</span>
              </div>
              <div v-if="previewLoading" class="book-preview-loading">
                <el-icon class="is-loading" :size="20"><Loading /></el-icon>
              </div>
            </div>
          </div>
          <div class="book-preview-error" v-else-if="previewError">{{ previewError }}</div>
        </el-scrollbar>
      </el-col>
      <el-col :span="8" v-if="setting.showComment">
        <el-scrollbar class="book-comment-frame">
          <div class="book-comment" v-for="comment in comments" :key="comment.id">
            <div class="book-comment-postby">{{comment.author}}<span class="book-comment-score">{{comment.score}}</span></div>
            <p class="book-comment-content" @contextmenu="onMangaCommentContextMenu($event, comment)">{{comment.content}}</p>
          </div>
        </el-scrollbar>
      </el-col>
    </el-row>
  </el-dialog>
</template>

<script setup>
import { ref, computed, h, watch, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox, ElMessage } from 'element-plus'
import { CaretRight20Regular, CaretLeft20Regular } from '@vicons/fluent'
import { BookmarkTwotone } from '@vicons/material'
import { Loading, ArrowDown, Download, Plus } from '@element-plus/icons-vue'
import { nanoid } from 'nanoid'
import he from 'he'
import * as linkify from 'linkifyjs'
import ContextMenu from '@imengyu/vue3-context-menu'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import { isContextMenuItemEnabled, sortContextMenuItems, ensureBookCover, catDisplayName, getDisplayTagName, resolveCatKey, tagDisplayName, tagColorOf, tagCatRank, galleryCategoryName, categoryDisplayName } from '../utils.js'
import  { insertLocalReadRecord, toAssetUrl } from '../utils.js'
import { parseGalleryDetail, mergeDetailIntoBook, ehImageSrc, collectGalleryThumbs } from '../ehOnline.js'

const appStore = useAppStore()
const {
  setting, bookDetail, resolvedTranslation,
  bookList, displayBookList, collectionList, openCollectionBookList,
  statusOption, categoryOption,
  pathSep,
} = storeToRefs(appStore)
const {
  printMessage,
  saveBook,
  returnFileNameWithExt,
  getDisplayTitle,
  resetMetadata,
  switchMark,
  copyTagClipboard,
  pasteTagClipboard,
} = appStore

const { t } = useI18n()

// 网页版(Docker)只读账户:隐藏写操作按钮(服务端同样会拦截)
const viewerRole = computed(() => {
  const auth = window.__AUTH__ || {}
  return !!auth.enabled && auth.role === 'viewer'
})

// 在线画廊(书架上的「EH在线」):没有本地文件,本地专有的入口要隐藏
const isOnline = computed(() => !!bookDetail.value?.online)

const emit = defineEmits([
  // EH在线:详情页的「下载整本 / 下载整本(原图)」交给 App 去走 IPC
  'downloadGallery',
  // 详情页的「种子」按钮
  'openTorrents',
  // H@H 归档下载(照 JHenTai 的 H@H 按钮)
  'openHhDownload',
  'openContentView',
  'openThumbnailView',
  'saveCollection',
  'handleRemoveBookDisplay',
  'openSearchDialog',
  'getBookInfo',
  'searchFromTag',
  'jumpMangeDetail',
  'addToHistory',
])

const dialogVisibleBookDetail = ref(false)

// 封面加载动画(详情页)
const detailCoverLoading = ref(true)
// 封面懒加载:详情页封面缺失/加载失败时按需生成
const onCoverError = () => {
  // 在线画廊封面是远程地址,没有「本地封面生成」这回事
  if (bookDetail.value?.online) { detailCoverLoading.value = false; return }
  detailCoverLoading.value = true
  ensureBookCover(bookDetail.value)
}
watch(() => bookDetail.value?.coverPath, (v) => {
  detailCoverLoading.value = true
  if (!v && !bookDetail.value?.online) ensureBookCover(bookDetail.value)
}, { immediate: true })

// ---------- 预览(放在「故事简介」上方) ----------
// 本地书:取这本书的前 N 张图(只读 IPC,不占用阅读器的 viewerSession)
// 在线画廊:用它自己的页预览缩略图(EH 详情页是雪碧图,按 background-position 偏移取页)
// 页数:filecount 与 pageCount 相同时只显示一个,避免出现「18 | null」
const pageCountText = computed(() => {
  const b = bookDetail.value || {}
  if (isOnline.value) return b.pageCount == null ? '—' : b.pageCount
  const parts = []
  if (b.pageCount != null) parts.push(b.pageCount)
  if (b.filecount != null && b.filecount !== b.pageCount) parts.push(b.filecount)
  return parts.length ? parts.join(' | ') : '—'
})
// 文件大小:压缩包大小 / 解压后大小;缺失或 0 的跳过(以前会显示「| 0 MB」)
const fileSizeText = computed(() => {
  const b = bookDetail.value || {}
  const fmt = (n) => n >= 1048576 ? (Math.round(n / 1048576 * 10) / 10) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'
  const parts = []
  if (b.bundleSize > 0) parts.push(fmt(b.bundleSize))
  if (b.filesize > 0 && b.filesize !== b.bundleSize) parts.push(fmt(b.filesize))
  return parts.length ? parts.join(' | ') : '—'
})

// 标签分组:按「设置 → 标签设置」里拖动的类别顺序排(和设置里的列表一致)
const tagGroups = computed(() => {
  const tags = (bookDetail.value && bookDetail.value.tags) || {}
  return Object.keys(tags)
    .filter(k => Array.isArray(tags[k]) && tags[k].length)
    .map(k => ({
      key: k,
      label: categoryDisplayName(setting.value, resolvedTranslation.value, k) + ':',
      tags: tags[k],
    }))
    .sort((a, b) => tagCatRank(setting.value, a.key) - tagCatRank(setting.value, b.key))
})
// 胶囊配色:设置里给这个标签挑过颜色就用它(文字+描边),否则用主题默认
const tagPillStyle = (cat, tag) => {
  const c = tagColorOf(setting.value, cat, tag)
  return c ? { color: c } : {}
}

const previewItems = ref([])
const previewTotal = ref(0)
// 这本书实际有多少页(预览有上限,超出时提示「240/1234」而不是假装只有 240 页)
const previewRawTotal = ref(0)
const previewLoading = ref(false)
const previewError = ref('')

// 雪碧图:所有页共用一张图,靠 -Npx 偏移定位;用原尺寸层 + scale 缩到 96px 宽
const PREVIEW_W = 118
const spriteStyleOf = (th) => {
  const w = th.width || 200
  const s = PREVIEW_W / w
  return {
    width: w + 'px',
    height: (th.height || 287) + 'px',
    backgroundImage: `url(${ehImageSrc(th.thumb)})`,
    backgroundPosition: `-${th.offsetX || 0}px 0`,
    transform: `scale(${s})`,
    transformOrigin: '0 0',
    marginRight: '-' + Math.round(w - w * s) + 'px',
    marginBottom: '-' + Math.round((th.height || 287) - (th.height || 287) * s) + 'px'
  }
}

// 在线画廊:详情弹窗自己把 EH 详情页拉回来补齐(日文标题 / 上传者 / 时间 / 大小 / 标签 / 页预览)
const enrichOnlineBook = async (book) => {
  previewLoading.value = true
  try {
    const cookie = ['igneous', 'ipb_pass_hash', 'ipb_member_id', 'star']
      .map(k => k + '=' + (setting.value[k] || ''))
      .join('; ')
    const host = String(book.url).replace(/^https?:\/\//i, '').split('/')[0] || 'e-hentai.org'
    const html = await ipcRenderer.invoke('get-ex-webpage', { url: book.url, cookie })
    const detail = parseGalleryDetail(html, host)
    if (!detail.ok) {
      previewError.value = t('m.ehOnlineFailed')
      return
    }
    Object.assign(bookDetail.value, mergeDetailIntoBook(bookDetail.value, detail))
    const firstThumbs = detail.thumbnails || []
    previewItems.value = firstThumbs.map(th => ({ sprite: spriteStyleOf(th) }))
    // 详情页一页只给 20 张缩略图:总数按页数算,剩下的按 ?p=1.. 续拉(边拉边显示)
    const pages = Number(detail.pageCount) || firstThumbs.length
    previewTotal.value = Math.max(pages, firstThumbs.length)
    previewRawTotal.value = previewTotal.value
    const token = previewToken
    if (previewTotal.value > firstThumbs.length) {
      collectGalleryThumbs({
        url: book.url,
        host,
        pageCount: previewTotal.value,
        first: firstThumbs,
        fetchHtml: (u) => ipcRenderer.invoke('get-ex-webpage', { url: u, cookie }),
        shouldStop: () => token !== previewToken,
        onUpdate: (thumbs) => {
          if (token !== previewToken) return
          bookDetail.value.thumbnails = thumbs
          previewItems.value = thumbs.map(th => ({ sprite: spriteStyleOf(th) }))
        }
      }).then((thumbs) => {
        if (token !== previewToken) return
        bookDetail.value.thumbnails = thumbs
        previewItems.value = thumbs.map(th => ({ sprite: spriteStyleOf(th) }))
      }).catch(() => { /* 某页拉不到就算了,已显示的先留着 */ })
    }
  } catch (e) {
    previewError.value = t('m.ehOnlineFailed')
  } finally {
    previewLoading.value = false
  }
}

// 预览分批取:每批 12 页,拿到就先显示,不等整本解压完
// (以前 limit:0 会让压缩包一次解 60 页才返回 → 「卡半天然后突然全部冒出来」)
let previewToken = 0
const PREVIEW_BATCH = 12
// 打开时先自动加载这么多页(再多就要点「加载更多」,免得几千页的画集一次拉满)
const PREVIEW_AUTO_PAGES = 120
const previewAutoLimit = ref(PREVIEW_AUTO_PAGES)
// 滑到底部自动加载:用一个哨兵元素 + IntersectionObserver(容器里有滚动条也能触发,
// 因为祖先的 overflow 裁剪会计入 intersection)
const previewSentinel = ref(null)
let previewObserver = null
let previewAutoBusy = false
const autoLoadMoreIfNeeded = async () => {
  if (previewAutoBusy || previewLoading.value) return
  if (previewItems.value.length >= previewTotal.value) return
  previewAutoBusy = true
  try {
    await loadMorePreview()
    // 内容还不够高、哨兵仍然在可视区里:继续加载,直到撑满或加载完
    await nextTick()
    const el = previewSentinel.value
    if (el && previewItems.value.length < previewTotal.value) {
      const rect = el.getBoundingClientRect()
      const visible = rect.top < (window.innerHeight || 0) + 200 && rect.bottom > -200
      if (visible) await autoLoadMoreIfNeeded()
    }
  } finally {
    previewAutoBusy = false
  }
}
const setupPreviewObserver = () => {
  if (previewObserver) { previewObserver.disconnect(); previewObserver = null }
  const el = previewSentinel.value
  if (!el || typeof IntersectionObserver === 'undefined') return
  previewObserver = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) autoLoadMoreIfNeeded()
  }, { rootMargin: '240px 0px' })
  previewObserver.observe(el)
}
watch(previewSentinel, (el) => { if (el) setupPreviewObserver() })
onBeforeUnmount(() => { if (previewObserver) previewObserver.disconnect() })

const loadMorePreview = async () => {
  const target = Math.min(previewTotal.value, previewItems.value.length + PREVIEW_AUTO_PAGES)
  previewAutoLimit.value = Math.max(previewAutoLimit.value, target)
  if (currentPreviewBook) loadLocalPreview(currentPreviewBook)
}
let currentPreviewBook = null
const loadLocalPreview = async (book) => {
  const token = ++previewToken
  currentPreviewBook = book
  previewLoading.value = true
  previewError.value = ''
  try {
    let start = previewItems.value.length
    while (token === previewToken && start < previewAutoLimit.value) {
      const res = await ipcRenderer.invoke('book-preview-images', {
        filepath: book.filepath, type: book.type, start, count: PREVIEW_BATCH
      })
      if (token !== previewToken) return
      if (!res || !res.ok) {
        if (!previewItems.value.length) previewError.value = ''
        break
      }
      previewTotal.value = res.total || 0
      previewRawTotal.value = res.rawTotal || res.total || 0
      const fresh = (res.files || []).map(f => ({ src: toAssetUrl(f) }))
      if (!fresh.length) break
      previewItems.value = previewItems.value.concat(fresh)
      // 按「请求的批量」前进,而不是按实际返回条数:个别页解压失败时不会重复请求同一段
      start += PREVIEW_BATCH
      if (start >= previewTotal.value) break
    }
  } catch (e) {
    // 预览是锦上添花,失败就不显示(不打扰用户)
  } finally {
    if (token === previewToken) previewLoading.value = false
  }
}

// 换书就重新准备预览(在线书先拉详情页,本地书直接取图)
watch(() => bookDetail.value?.id, (id) => {
  previewToken++
  previewItems.value = []
  previewRawTotal.value = 0
  previewAutoLimit.value = PREVIEW_AUTO_PAGES
  currentPreviewBook = null
  previewTotal.value = 0
  previewError.value = ''
  const b = bookDetail.value
  if (!id || !b) return
  if (b.online) {
    if ((b.thumbnails || []).length) {
      previewItems.value = b.thumbnails.map(th => ({ sprite: spriteStyleOf(th) }))
      previewTotal.value = previewItems.value.length
    } else {
      enrichOnlineBook(b)
    }
    return
  }
  if (b.filepath && b.type) loadLocalPreview(b)
}, { immediate: true })

// 点预览里的某一页 → 直接读(交给主界面打开阅读器)
const readFromPreview = (index = 0) => {
  // 带上页码:点哪一页就从哪一页开始读(以前固定从第一页开)
  if (bookDetail.value) emit('openContentView', bookDetail.value, Number(index) || 0)
}

// ---------- 标签:一排一排的网格选择(替代单列下拉,节省空间) ----------
const TAG_PAGE = 40            // 每个分类首屏展示的标签数
const tagSearch = ref({})      // 每个分类的搜索词
const tagExpand = ref({})      // 每个分类的展开数量
const sortTagOptions = (key, arr) => {
  const kw = String(tagSearch.value[key] || '').trim().toLowerCase()
  const selected = bookDetail.value?.tags?.[key] || []
  // 已选中的排前面;搜索时按名称过滤
  const list = (arr || []).filter(o => !kw || String(o.label || '').toLowerCase().includes(kw) || String(o.value || '').toLowerCase().includes(kw))
  return list.sort((a, b) => {
    const sa = selected.includes(a.value) ? 0 : 1
    const sb = selected.includes(b.value) ? 0 : 1
    return sa - sb
  })
}
const tagLimit = (key) => TAG_PAGE + (tagExpand.value[key] || 0)
const visibleTagOptions = (key, arr) => sortTagOptions(key, arr).slice(0, tagLimit(key))
const hasMoreTagOptions = (key, arr) => sortTagOptions(key, arr).length > tagLimit(key)
const tagMoreCount = (key, arr) => Math.max(0, sortTagOptions(key, arr).length - tagLimit(key))
const showMoreTags = (key) => { tagExpand.value[key] = (tagExpand.value[key] || 0) + 120 }
const isTagChecked = (key, value) => (bookDetail.value?.tags?.[key] || []).includes(value)
const canCreateTag = (key, arr) => {
  const kw = String(tagSearch.value[key] || '').trim()
  if (!kw) return false
  return !(arr || []).some(o => String(o.value) === kw)
}
const applyTags = async (key, values) => {
  const tags = bookDetail.value.tags || (bookDetail.value.tags = {})
  if (values.length) tags[key] = values
  else delete tags[key]
  await saveBookTags(bookDetail.value)
}
const toggleBookTag = (key, value) => {
  const cur = [...(bookDetail.value?.tags?.[key] || [])]
  const idx = cur.indexOf(value)
  if (idx >= 0) cur.splice(idx, 1)
  else cur.push(value)
  applyTags(key, cur)
}
const removeBookTag = (key, value) => {
  const cur = [...(bookDetail.value?.tags?.[key] || [])].filter(t => t !== value)
  applyTags(key, cur)
}
// ---------- 新增标签:同类别内重名(含跨语言名称)必须指定所属集合 ----------
const newTagDialogVisible = ref(false)
const newTagCat = ref('')
const newTagName = ref('')
const newTagParent = ref('')
const newTagDups = ref([])
const allTagEntriesBDD = computed(() => {
  const out = []; const seen = new Set()
  for (const b of (displayBookList.value || [])) {
    for (const [cat, arr] of Object.entries(b.tags || {})) {
      for (const tg of (arr || [])) {
        const k = resolveCatKey(cat) + '::' + tg
        if (seen.has(k)) continue
        seen.add(k)
        out.push({ cat, tag: tg })
      }
    }
  }
  return out
})
const newTagParentOptions = computed(() => allTagEntriesBDD.value
  .filter(e => resolveCatKey(e.cat) !== resolveCatKey(newTagCat.value))
  .map(e => ({ value: e.cat + '::' + e.tag, label: e.tag })))
const checkNewTagDup = () => {
  const name = String(newTagName.value || '').trim().toLowerCase()
  const cat = resolveCatKey(newTagCat.value)
  if (!name || !cat) { newTagDups.value = []; return }
  const langs = setting.value.tagNameLangs || {}
  const hits = []
  for (const e of allTagEntriesBDD.value) {
    if (resolveCatKey(e.cat) !== cat) continue
    if (String(e.tag).trim().toLowerCase() === name) { hits.push(e); continue }
    const rec = langs[e.cat + '::' + e.tag] || {}
    const names = [rec['default'], rec['zh-CN'], rec['zh-TW'], rec.ja, rec.en].filter(Boolean).map(s => String(s).trim().toLowerCase())
    if (names.includes(name)) hits.push(e)
  }
  newTagDups.value = hits
  if (!hits.length) newTagParent.value = ''
}
const canCreateNewTag = computed(() => !!newTagCat.value && !!String(newTagName.value || '').trim() && (newTagDups.value.length === 0 || !!newTagParent.value))
const openAddNewTagDialog = () => {
  newTagCat.value = ''; newTagName.value = ''; newTagParent.value = ''; newTagDups.value = []
  newTagDialogVisible.value = true
}
const createNewTagHere = async () => {
  if (!canCreateNewTag.value) return
  const cat = resolveCatKey(newTagCat.value)
  const name = String(newTagName.value).trim()
  if (!bookDetail.value.tags) bookDetail.value.tags = {}
  if (!Array.isArray(bookDetail.value.tags[cat])) bookDetail.value.tags[cat] = []
  if (!bookDetail.value.tags[cat].includes(name)) bookDetail.value.tags[cat].push(name)
  if (newTagParent.value) {
    const [pcat, ptag] = newTagParent.value.split('::')
    if (!Array.isArray(bookDetail.value.tags[pcat])) bookDetail.value.tags[pcat] = []
    if (!bookDetail.value.tags[pcat].includes(ptag)) bookDetail.value.tags[pcat].push(ptag)
    const rel = setting.value.tagRelations || {}
    const pk = pcat + '::' + ptag
    const cur = rel[pk] || {}
    const arr = Array.isArray(cur.contains) ? cur.contains.slice() : []
    const selfKey = cat + '::' + name
    if (!arr.includes(selfKey)) arr.push(selfKey)
    setting.value.tagRelations = { ...rel, [pk]: { ...cur, contains: arr } }
    try { window.ipcRenderer?.invoke('save-setting', JSON.parse(JSON.stringify(setting.value))) } catch (e) {}
  }
  await saveBookTags(bookDetail.value)
  printMessage('success', t('m.addNewTag'))
  newTagDialogVisible.value = false
}

const addNewTag = (key) => {
  const kw = String(tagSearch.value[key] || '').trim()
  if (!kw) return
  const cur = [...(bookDetail.value?.tags?.[key] || [])]
  if (!cur.includes(kw)) cur.push(kw)
  tagSearch.value[key] = ''
  applyTags(key, cur)
}


// 暂未实现的功能(仅按钮占位)
const notImplemented = (name) => printMessage('info', name + ' ' + t('c.featureComingSoon'))

const openBookDetail = (book, addToHistory = true) => {
  bookDetail.value = book
  dialogVisibleBookDetail.value = true
  comments.value = []
  if (setting.value.showComment) getComments(book.url)
  if (addToHistory) emit('addToHistory', book.id)
}
const openUrl = (url) => {
  ipcRenderer.invoke('open-url', url)
}
const triggerHiddenBook = async (book) => {
  book.hiddenBook = !book.hiddenBook
  await saveBook(book)
}


const returnDirname = (filepath) => {
  return filepath.split(/[/\\]/).slice(0, -1).join(pathSep.value)
}

const showFile = (filepath) => {
  ipcRenderer.invoke('show-file', filepath)
}
const openLocalBook = (book) => {
  bookDetail.value = book
  // 在线画廊没有本地文件:直接进内置阅读器(在线读图)
  if (book?.online) {
    emit('openContentView', book)
    return
  }
  if (setting.value.imageExplorer) {
    bookDetail.value.readCount += 1
    saveBook(bookDetail.value)
    ipcRenderer.invoke('open-local-book', bookDetail.value.filepath)
  } else {
    emit('openContentView', book)
  }
  insertLocalReadRecord(book.id, book)
}
const rescanBook = async (book) => {
  const bookInfo = await ipcRenderer.invoke('patch-local-metadata-by-book', _.cloneDeep(book))
  _.assign(book, bookInfo)
  await saveBook(book)
  printMessage('success', t('c.rescanSuccess'))
}

// ---------- AI 综合信息处理(标题翻译+角色+出处+作者+类型) ----------
const aiProcessingBook = ref(false)
const aiProcessCurrentBook = async () => {
  if (aiProcessingBook.value) return
  aiProcessingBook.value = true
  try {
    const res = await ipcRenderer.invoke('ai-process-book', _.cloneDeep(bookDetail.value))
    if (res?.ok) {
      if (res.changes?.length) {
        _.assign(bookDetail.value, res.book)
        printMessage('success', t('c.aiProcessDone', { changes: res.changes.join('、') }))
      } else {
        printMessage('info', t('c.characterAnalysisNone'))
      }
    } else {
      printMessage('error', res?.error || t('c.characterAnalysisFailed'))
    }
  } catch (e) {
    printMessage('error', t('c.characterAnalysisFailed') + ':' + (e?.message || ''))
  } finally {
    aiProcessingBook.value = false
  }
}

// ---------- AI 标题角色分析(写入元数据) ----------
const analyzingTitle = ref(false)
const analyzeBookTitleCharacters = async () => {
  if (analyzingTitle.value) return
  analyzingTitle.value = true
  try {
    const res = await ipcRenderer.invoke('analyze-book-title-characters', _.cloneDeep(bookDetail.value))
    if (res?.ok) {
      if (res.added?.length) {
        _.assign(bookDetail.value, res.book)
        printMessage('success', t('c.characterAnalysisDone', { chars: res.added.join(', ') }))
      } else {
        printMessage('info', t('c.characterAnalysisNone'))
      }
    } else {
      printMessage('error', res?.error || t('c.characterAnalysisFailed'))
    }
  } catch (e) {
    printMessage('error', t('c.characterAnalysisFailed') + ':' + (e?.message || ''))
  } finally {
    analyzingTitle.value = false
  }
}

// ---------- AI 角色出处查询 ----------
const queryingOrigins = ref(false)
const queryBookOrigins = async () => {
  if (queryingOrigins.value) return
  const characterTags = bookDetail.value?.tags?.character
  if (!Array.isArray(characterTags) || characterTags.length === 0) {
    printMessage('warning', t('c.characterOriginNoTags'))
    return
  }
  queryingOrigins.value = true
  try {
    const res = await ipcRenderer.invoke('query-character-origins', _.cloneDeep(bookDetail.value))
    if (res?.ok) {
      ElMessageBox.alert(
        h('pre', { style: 'white-space: pre-wrap; text-align: left; max-height: 50vh; overflow: auto; margin: 0' }, res.result || t('c.characterOriginEmpty')),
        t('m.queryCharacterOrigins'),
        { confirmButtonText: t('c.close'), showClose: true }
      )
    } else {
      printMessage('error', res?.error || t('c.characterOriginFailed'))
    }
  } catch (e) {
    printMessage('error', t('c.characterOriginFailed') + ':' + (e?.message || ''))
  } finally {
    queryingOrigins.value = false
  }
}

const deleteBook = async (book) => {
  let res = null
  try {
    res = await ipcRenderer.invoke('delete-local-book', book.filepath)
  } catch (e) {
    res = { ok: false, error: String((e && e.message) || e) }
  }
  if (res && res.ok) {
    // 现在是「移入回收站」,不是永久删除 —— 明确告诉用户去哪找回来
    ElMessage.success(t('c.movedToTrash'))
  } else if (res && res.error) {
    ElMessage.error(res.error)
  }
  await Promise.resolve()
  .finally(() => {
    dialogVisibleBookDetail.value = false
    if (book.collectionHide) {
      _.forEach(collectionList.value, (collection) => {
        collection.list = _.filter(collection.list, hash_id => hash_id !== book.id && hash_id !== book.hash)
      })
      openCollectionBookList.value = _.filter(openCollectionBookList.value, bookOfCollection => {
        return bookOfCollection.id !== book.id && bookOfCollection.id !== book.hash
      })
      emit('saveCollection')
    } else {
      const findBookInBookList = _.findIndex(bookList.value, b => b.filepath === book.filepath)
      bookList.value.splice(findBookInBookList, 1)
      displayBookList.value = _.filter(displayBookList.value, b => b.filepath !== book.filepath)
      emit('handleRemoveBookDisplay')
    }
  })
}
const deleteLocalBook = (book) => {
  if (setting.value.skipDeleteConfirm) {
    deleteBook(book)
  } else {
    ElMessageBox.confirm(
      t('c.confirmDelete'),
      '',
      {}
    )
    .then(() => deleteBook(book))
  }
}

const comments = ref([])
const triggerShowComment = () => {
  if (setting.value.showComment) {
    setting.value.showComment = false
  } else {
    comments.value = []
    getComments(bookDetail.value.url)
    setting.value.showComment = true
  }
}
const getComments = (url) => {
  if (url) {
    ipcRenderer.invoke('get-ex-webpage', {
      url,
      cookie: appStore.cookie
    })
    .then(res => {
      comments.value = []
      const commentElements = new DOMParser().parseFromString(res, 'text/html').querySelectorAll('#cdiv>.c1')
      commentElements.forEach(e => {
        const author = e.querySelector('.c2 .c3').textContent
        const scoreTail = e.querySelectorAll('.c2 .nosel')
        const score = scoreTail[scoreTail.length - 1].textContent
        let content = e.querySelector('.c6').innerHTML
        const foundLink = _.uniqBy(linkify.find(content.replace(/[<"]/gi, ' '), 'url'), 'href')
        content = content.replace(/<br>/gi, '\n')
        content = content.replace(/<.+?>/gi, '')
        content = he.decode(content)
        comments.value.push({
          author, score, content, id: nanoid(), foundLink
        })
      })
    })
    .catch(err => {
      comments.value = []
      console.log(err)
    })
  } else {
    comments.value = []
  }
}

const editingTag = ref(false)
const tagGroup = ref({})
const editTags = () => {
  editingTag.value = !editingTag.value
  if (editingTag.value) {
    if (!_.has(bookDetail.value, 'tags')) bookDetail.value.tags = {}
    const tempTagGroup = {}
    _.forEach(bookList.value.map(b => b.tags), (tagObject) => {
      _.forIn(tagObject, (tagArray, tagCat) => {
        if (_.isArray(tagArray)) {
          // 分类名归一:库中同时存在 parody/作品、character/角色 时合并为同一个标签栏
          const catKey = resolveCatKey(tagCat)
          if (_.has(tempTagGroup, catKey)) {
            tagArray.forEach(tag => tempTagGroup[catKey].add(tag))
          } else {
            tempTagGroup[catKey] = new Set(tagArray)
          }
        }
      })
    })
    _.forIn(tempTagGroup, (tagSet, tagCat) => {
      tempTagGroup[tagCat] = [...tagSet].sort().map(tag => ({
        value: tag,
        // 只显示「标签设置 → 语言」选中的那一种名字(以前是「中文 || 原文」,看起来像重复)
        label: tagDisplayName(setting.value, resolvedTranslation.value, tagCat, tag)
      }))
    })
    tagGroup.value = tempTagGroup
  } else {
    saveBookTags(bookDetail.value)
  }
}
const saveBookTags = (book) => {
  const compactTags = {}
  _.forIn(book.tags, (tagarr, tagCat) => {
    if (!_.isEmpty(tagarr)) {
      compactTags[tagCat] = tagarr
    }
  })
  const tagSortKey = ['language', 'parody', 'character', 'group', 'artist', 'male', 'female', 'mixed', 'other', 'cosplayer']
  const sortedTags = {}
  tagSortKey.forEach(tagCat => {
    if (compactTags[tagCat]) {
      sortedTags[tagCat] = compactTags[tagCat]
    }
  })
  book.tags = Object.assign(sortedTags, compactTags)
  saveBook(book)
}
const addTagCat = () => {
  ElMessageBox.prompt(t('c.inputCategoryName'), t('m.addCategory'), {
    inputPattern: /^[\p{L}\d_]+$/u,
    inputErrorMessage: t('c.categoryNameError')
  })
  .then(({ value }) => {
    tagGroup.value[value] = []
  })
  .catch(() => {
    printMessage('info', t('c.canceled'))
  })
}


const onMangaTitleContextMenu = (e, book) => {
  e.preventDefault()
  const items = [
    {
      id: 'copyTitle',
      label: t('c.copyTitleToClipboard'),
      onClick: () => {
        ipcRenderer.invoke('copy-text-to-clipboard', book.title_jpn || book.title)
      }
    },
    {
      id: 'copyLink',
      label: t('c.copyLinkToClipboard'),
      onClick: () => {
        ipcRenderer.invoke('copy-text-to-clipboard', book.url)
      }
    },
    {
      id: 'copyTitleAndLink',
      label: t('c.copyTitleAndLinkToClipboard'),
      onClick: () => {
        ipcRenderer.invoke('copy-text-to-clipboard', `${book.title_jpn || book.title}\n${book.url}\n`)
      }
    },
  ].filter(item => isContextMenuItemEnabled(setting.value, 'title', item.id))
  // 全部项都被取消勾选时不弹出空白菜单
  if (items.length === 0) return
  // 顺序按「设置 → 高级 → 右键菜单」里拖动后的顺序
  ContextMenu.showContextMenu({ x: e.x, y: e.y, items: sortContextMenuItems(setting.value, 'title', items) })
}

const onMangaCommentContextMenu = (e, comment) => {
  e.preventDefault()
  if (!isContextMenuItemEnabled(setting.value, 'comment', 'openLink')) return
  const foundLink = comment.foundLink
  if (!_.isEmpty(foundLink)) {
    const items = foundLink.map(l => ({
      id: 'openLink',
      label: `${t('c.redirect')} ${l.href}`,
      onClick: () => {
        ipcRenderer.invoke('open-url', l.href)
      }
    }))
    ContextMenu.showContextMenu({
      x: e.x,
      y: e.y,
      items
    })
  }
}

defineExpose({
  dialogVisibleBookDetail,
  editingTag,
  openBookDetail,
  openLocalBook,
  rescanBook,
  getComments,
  showFile,
  deleteLocalBook,
  triggerHiddenBook,
})

</script>

<style lang="stylus">
/* 详情页「预览」(放在故事简介上方):本地书是图片,在线画廊是雪碧图切片 */
.book-preview
  margin-top: 12px
.book-preview-title
  display: flex
  align-items: baseline
  gap: 8px
  font-size: 13px
  font-weight: 600
  margin-bottom: 6px
.book-preview-hint
  font-size: 12px
  font-weight: 400
  opacity: .6
.book-preview-strip
  display: flex
  flex-wrap: wrap
  gap: 6px
  align-items: flex-start
.book-preview-item
  // 和 EH 详情页的缩略图一个量级(118px,原来 96 偏小)
  width: 118px
  // 高度跟着缩略图比例走(3:4):固定 128 时雪碧图比格子高,底下会露一条白底
  height: auto
  aspect-ratio: 3 / 4
  overflow: hidden
  border-radius: 4px
  border: none
  background: transparent
  cursor: pointer
  img
    width: 100%
    height: 100%
    object-fit: cover
    display: block
.book-preview-sprite
  background-repeat: no-repeat
.book-preview-loading
  width: 96px
  height: 128px
  display: flex
  align-items: center
  justify-content: center
  color: var(--el-text-color-secondary)
.book-preview-error
  margin-top: 12px
  font-size: 12px
  opacity: .6
.el-dialog.is-fullscreen.dialog-detail
  .detail-book-title
    display: flex
    align-items: center
    gap: 8px
  .el-dialog__header
    .el-dialog__headerbtn
      margin: 8px 16px 0 0
      .el-icon
        width: 32px
        svg
          height: 32px
          width: 32px

.text-red
  color: red !important

.detail-book-title
  height: 44px
  overflow-y: hidden
  margin: 0 24px
.url-link
  cursor: pointer
.book-detail-card
  // 统一列宽变量:标题 / 封面 / 按钮行严格对齐(抵消 el-row gutter 的负边距)
  --detail-cover-w: 250px
  .book-detail-function, .book-detail-rate
    justify-content: center
    margin-bottom: 10px
    width: var(--detail-cover-w)
    max-width: 100%
    margin-left: auto !important
    margin-right: auto !important
  // 功能按钮行:等宽弹性排列,自动换行,宽度与封面图片一致
  .book-detail-function
    display: flex
    flex-wrap: wrap
    gap: 8px
    align-items: stretch
    width: var(--detail-cover-w)
    max-width: 100%
    // el-row 的 gutter 会加负边距,这里强制归零以与图片边框对齐
    margin-left: auto !important
    margin-right: auto !important
    padding-left: 0
    padding-right: 0
    .detail-func-btn, .detail-read-group
      flex: 1 1 108px
      margin: 0
    .detail-read-group
      display: flex
      .el-button
        flex: 1
        margin: 0
  .title-lang-select
    width: 104px
    margin-right: 6px
    flex: 0 0 auto
  .title-inline-input
    flex: 1 1 auto
    min-width: 200px
  .book-detail-cover-frame
    position: relative
    width: var(--detail-cover-w)
    max-width: 100%
    margin-left: auto !important
    margin-right: auto !important
    margin-bottom: 10px
    padding-left: 0
    padding-right: 0
    .book-detail-cover
      width: 100%
      max-width: 100%
      height: auto
      aspect-ratio: 250 / 354
      object-fit: cover
      border-radius: 4px
    .next-manga-pane, .prev-manga-pane
      position: absolute
      bottom: 80px
      cursor: pointer
      opacity: 0
      transition-delay: 0.5s
      background-color: rgba(0, 0, 0, 0.3)
      .el-icon
        font-size: 34px
        margin: 80px 0
        color: #FFFFFF
    .next-manga-pane
      right: 0
      border-radius: 4px 0 0 4px
    .prev-manga-pane
      left: 0
      border-radius: 0 4px 4px 0
    .next-manga-pane:hover, .prev-manga-pane:hover
      opacity: 1
      transition-delay: 0s
    .book-detail-star
      position: absolute
      cursor: pointer
      right: -6px
      top: -14px
  .edit-line
    margin: 4px 0
    .el-select, .el-select-v2
      width: 100%
  // 「标签不超过类别」:label 绝对定位在左列(80px 右对齐),内容格固定从 90px 起。
  //  inline 排布时长标签列表换行会绕到类别名左边(之前截图里第二行胶囊跑到最左),
  //  现在内容永远在自己列内换行,一行都不会越界。
  .el-descriptions__cell
    position: relative
    padding-left: 90px !important
  .el-descriptions__label
    position: absolute
    left: 0
    // 实测标签胶囊比类别名低 4px(胶囊自带 2px 上边距 + 行高差),这里补齐让两者垂直居中对齐
    top: 4px
    line-height: inherit
    width: 80px
    text-align: right
  .el-descriptions__content
    display: block
    width: auto
    min-width: 0
    overflow-wrap: anywhere
// ---------- 标签块(照 EH 详情页:类别名右对齐 + 圆角描边小胶囊) ----------
// 用 flex 两列:左列类别名固定宽度右对齐,右列标签自己换行 —— 换行永远不会跑到类别名左边
.book-tag-block
  margin-top: 12px
  display: flex
  flex-direction: column
  gap: 6px
  text-align: left
.book-tag-row
  display: flex
  align-items: flex-start
  gap: 6px
.book-tag-cat
  flex: none
  min-width: 92px
  text-align: right
  font-size: 13px
  line-height: 26px
  color: var(--el-text-color-secondary)
  white-space: nowrap
.book-tag-list
  flex: 1 1 auto
  min-width: 0
  display: flex
  flex-wrap: wrap
  gap: 6px
.book-tag-cell
  // 信息表单元格里的标签列表:自动换行
  display: inline
  line-height: 2
.book-tag-pill
  // 标签:恢复原来的胶囊样式(用户明确说过「标签不改」) —— 只有类别行的**位置**并进信息表
  display: inline-flex
  align-items: center
  height: 22px
  padding: 0 7px
  border: 1px solid var(--el-border-color)
  border-radius: 4px
  font-size: 12px
  line-height: 1
  color: var(--el-text-color-regular)
  background: var(--el-fill-color-blank)
  cursor: pointer
  margin: 2px 6px 2px 0
  &:hover
    border-color: var(--el-color-primary)
    color: var(--el-color-primary)

.book-tag-edit-popover
  .el-descriptions__cell
    padding-bottom: 0 !important
  .el-descriptions__label
    display: inline-block
    text-align: right
    width: 65px
.book-tag-frame
  height: calc(100vh - 100px)
  overflow-y: auto
  padding-right: 10px
  text-align: left
.book-tag
  margin: 4px 6px
  cursor: pointer
  // 长标签允许在格子内换行,不要顶出「类别:」那一行
  max-width: 100%
  height: auto
  white-space: normal
  word-break: break-word
.tag-edit-buttons
  margin-top: 4px
.book-comment-frame
  text-align: left
  height: calc(100vh - 100px)
  overflow-y: auto
  padding-right: 10px
  .book-comment
    .book-comment-postby
      font-size: 12px
      background-color: var(--el-fill-color-dark)
      padding-left: 4px
      color: var(--el-text-color-regular)
    .book-comment-score
      float: right
      margin-right: 4px
    .book-comment-content
      font-size: 14px
      white-space: pre-wrap
      padding-left: 4px
      color: var(--el-text-color-regular)

// 故事简介(标签栏最下方)
// 标题行(语言选择 + 值 + 编辑按钮)与其它详细项同列排列
.title-row
  display: flex
  align-items: center
  gap: 6px
  .title-row-value
    word-break: break-word
.title-row-others
  margin-top: 4px
  display: flex
  flex-direction: column
  gap: 2px
  .title-other
    display: flex
    gap: 6px
    font-size: 12px
    color: var(--el-text-color-secondary)
    cursor: pointer
    &:hover
      color: var(--el-color-primary)
    .title-other-label
      flex: 0 0 auto
    .title-other-value
      word-break: break-word

// 标题:与封面同宽居中(放在封面上方)
.detail-title-above-cover
  width: 250px
  max-width: 100%
  margin: 0 auto 8px
  text-align: center
  font-size: 15px
  line-height: 1.4
  word-break: break-word
  display: -webkit-box
  -webkit-box-orient: vertical
  -webkit-line-clamp: 3
  overflow: hidden
  .url-link
    cursor: pointer
// 标签:框与原选择框一致(可打字筛选/新建),下拉里标签一排一排排列
.tag-picker
  display: block
  margin-bottom: 8px
  text-align: left
  .tag-select
    width: 100%

// 下拉选项:网格化(一排一排),宽度跟随输入框(fit-input-width)
.tag-select-dropdown
  .el-select-dropdown__wrap
    max-height: 300px
  .el-select-dropdown__list
    display: flex
    flex-wrap: wrap
    gap: 6px
    padding: 8px
  .el-select-dropdown__item
    display: inline-flex
    align-items: center
    width: auto
    max-width: 100%
    height: 26px
    line-height: 24px
    padding: 0 10px
    margin: 0
    border: 1px solid var(--el-border-color)
    border-radius: 13px
    font-size: 12px
    background-color: var(--el-fill-color-blank, #fff)
    &.is-hovering,
    &:hover
      background-color: var(--el-fill-color-light)
    &.is-selected
      color: var(--el-color-primary)
      border-color: var(--el-color-primary)
      font-weight: 600
      background-color: var(--el-color-primary-light-9)

.story-summary
  margin-top: 12px
  padding-top: 10px
  border-top: 1px solid var(--el-border-color-lighter)
  .story-summary-title
    font-size: 13px
    font-weight: 600
    margin-bottom: 6px
    color: var(--el-text-color-primary)
  .story-summary-text
    font-size: 13px
    line-height: 1.7
    white-space: pre-wrap
    word-break: break-word
    color: var(--el-text-color-regular)
    max-height: 260px
    overflow-y: auto

// 详情封面加载动画
.book-detail-cover-frame
  .cover-loading
    position: absolute
    top: 0
    left: 50%
    transform: translateX(-50%)
    width: min(250px, 100%)
    height: 354px
    transition: opacity .25s ease
    display: flex
    align-items: center
    justify-content: center
    background: var(--el-fill-color-light, rgba(0, 0, 0, .04))
    color: var(--el-text-color-secondary, #909399)
    border-radius: 4px
    z-index: 6
    pointer-events: none
</style>