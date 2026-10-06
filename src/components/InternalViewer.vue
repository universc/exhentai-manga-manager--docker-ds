<template>
  <el-drawer v-model="drawerVisibleViewer"
    direction="ltr"
    :size="drawerHeight"
    :with-header="false"
    destroy-on-close
    @open="attachViewerInertia"
    @close="handleStopReadManga"
    class="viewer-drawer"
    modal-class="viewer-drawer-modal"
  >
    <div class="viewer-container" :style="{
      '--viewer-image-gap': (Number(setting.viewerImageGap) || 0) + 'px',
      '--viewer-thumbnail-gap': (Number(setting.viewerThumbnailGap) || 0) + 'px'
    }">
      <div class="drawer-viewer-side"
        v-if="showViewerSide && !showThumbnail"
        @wheel.stop
        ref="sidebarRef"
      >
        <div class="sidebar-thumbnail-content">
          <div
            v-for="(image, index) in thumbnailList"
            :key="image.id"
            class="sidebar-thumbnail-item"
            :class="{
              'sidebar-thumbnail-active': isCurrentImage(image.id),
              'sidebar-thumbnail-clicked': clickedThumbId === image.id
            }"
            :id="image.thumbId"
          >
            <img
              :src="`${image.thumbnailPath}?id=${image.id}`"
              class="sidebar-thumbnail"
              @click="handleClickThumbnail(image.id)"
              @contextmenu="onMangaImageContextMenu($event, image)"
            />
            <div class="sidebar-thumbnail-page" v-if="!setting.hidePageNumber">{{index + 1}} / {{thumbnailList.length}}</div>
          </div>
        </div>
      </div>
      <div class="drawer-viewer-body"
        :class="{ 'viewer-horizontal-scroll': isHorizontalScroll, 'viewer-paged': isPaging, 'viewer-zoomed': isZoomedIn }"
        ref="drawerViewerBody"
        @wheel.stop="handleBodyWheel"
        @scroll="handleBodyScroll"
        @mousemove="handleViewerMouseMove"
        @mouseleave="nextMangaButtonsVisible = false"
      >
        <div class="drawer-image-content"
          v-if="!showThumbnail"
          @click="handleViewerAreaClick"
        >
          <!-- ① 卷轴 + 左右 / 右左:整排横向排列,横向连续滚动(单双不区分;右左时整排反向) -->
          <div v-if="isScrollHorizontal" class="viewer-horizontal-row" :class="{ 'viewer-horizontal-row-rtl': isRtl }">
            <div v-for="(image, index) in viewerImageList" :key="image.id" class="viewer-horizontal-item">
              <div
                class="viewer-image-frame"
                :id="image.id"
                :style="frameStyle(image, 'horizontal')"
                v-lazy:[image.id]="{enter: handleImageEnter, leave: handleImageLeave}"
              >
                <img
                  v-if="loadedImages[image.id]"
                  :src="imageSrc(image)"
                  class="viewer-image" draggable="false"
                  :style="{height: frameStyle(image, 'horizontal').height}"
                  @mousedown="onImagePanStart"
                  @dragstart.prevent
                  @contextmenu="onMangaImageContextMenu($event, image)"
                />
                <div v-else class="viewer-image-placeholder" :style="{height: frameStyle(image, 'horizontal').height}">
                  <el-icon class="is-loading"><Loading /></el-icon>
                </div>
              </div>
              <div class="viewer-image-page" v-if="!setting.hidePageNumber">{{index + 1}} of {{viewerImageList.length}}</div>
            </div>
          </div>
          <!-- ② 卷轴 + 上下:单页一行一张;双页一行两张(横图独占一行) -->
          <template v-else-if="imageStyleType === 'scroll'">
            <template v-if="!scrollDoubleMode">
              <div v-for="(image, index) in viewerImageList" :key="image.id" class="image-frame">
                <div
                  class="viewer-image-frame viewer-image-frame-scroll"
                  :id="image.id"
                  :style="frameStyle(image, 'scrollSingle')"
                  v-lazy:[image.id]="{enter: handleImageEnter, leave: handleImageLeave}"
                >
                  <img
                    v-if="loadedImages[image.id]"
                    :src="imageSrc(image)"
                    class="viewer-image" draggable="false"
                    :style="{height: frameStyle(image, 'scrollSingle').height}"
                    @mousedown="onImagePanStart"
                    @dragstart.prevent
                    @contextmenu="onMangaImageContextMenu($event, image)"
                  />
                  <div v-else class="viewer-image-placeholder" :style="{height: frameStyle(image, 'scrollSingle').height}">
                    <el-icon class="is-loading"><Loading /></el-icon>
                  </div>
                  <div class="viewer-image-bar" @mousedown="onFrameResizeStart($event, image)"></div>
                </div>
                <div class="viewer-image-page" v-if="!setting.hidePageNumber">{{index + 1}} of {{viewerImageList.length}}</div>
              </div>
            </template>
            <template v-else>
              <div v-for="(frame, frameIndex) in viewerImageListDouble" :key="'row-' + frameIndex" class="image-frame">
                <div class="viewer-image-row">
                  <div
                    v-for="image in frame.page"
                    :key="image.id"
                    class="viewer-image-frame viewer-image-frame-scroll"
                    :id="image.id"
                    :style="frameStyle(image, 'scrollDouble')"
                    v-lazy:[image.id]="{enter: handleImageEnter, leave: handleImageLeave}"
                  >
                    <img
                      v-if="loadedImages[image.id]"
                      :src="imageSrc(image)"
                      class="viewer-image" draggable="false"
                      :style="{height: frameStyle(image, 'scrollDouble').height}"
                      @mousedown="onImagePanStart"
                      @dragstart.prevent
                      @contextmenu="onMangaImageContextMenu($event, image)"
                    />
                    <div v-else class="viewer-image-placeholder" :style="{height: frameStyle(image, 'scrollDouble').height}">
                      <el-icon class="is-loading"><Loading /></el-icon>
                    </div>
                  </div>
                </div>
                <div class="viewer-image-page" v-if="!setting.hidePageNumber">{{ frame.pageNumber.join(', ') }} of {{viewerImageList.length}}</div>
              </div>
            </template>
          </template>
          <!-- ③ 分页 + 单页:一屏一张,翻页方向由「方向」决定 -->
          <div v-else-if="imageStyleType === 'single'" class="viewer-paging">
            <div class="image-frame" v-if="viewerImageList.length > 0">
              <div class="viewer-image-frame" :style="frameStyle(viewerImageList[currentImageIndex], 'single')">
                <img
                  :src="imageSrc(viewerImageList[currentImageIndex])"
                  class="viewer-image" draggable="false"
                  :style="{height: frameStyle(viewerImageList[currentImageIndex], 'single').height}"
                  @mousedown="onImagePanStart"
                  @dragstart.prevent
                  @contextmenu="onMangaImageContextMenu($event, viewerImageList[currentImageIndex])"
                />
              </div>
              <div class="viewer-image-page" v-if="!setting.hidePageNumber">{{currentImageIndex + 1}} of {{viewerImageList.length}}</div>
              <img
                :src="imageSrc(viewerImageList[currentImageIndex - 1])"
                class="viewer-image-preload"
                v-if="currentImageIndex > 1"
              />
              <img
                :src="imageSrc(viewerImageList[currentImageIndex + 1])"
                class="viewer-image-preload"
                v-if="currentImageIndex < viewerImageList.length - 1"
              />
            </div>
          </div>
          <!-- ④ 分页 + 双页:一屏最多两张(横图独占一屏);右左时 N+1 在左、N 在右 -->
          <div v-else-if="imageStyleType === 'double'" class="viewer-paging">
            <div class="image-frame" v-if="viewerImageListDouble.length > 0">
              <div class="viewer-image-frame viewer-image-frame-double" :class="{ 'viewer-image-frame-rtl': isRtl }">
                <img
                  v-for="image in viewerImageListDouble[currentImageIndex]?.page"
                  :key="image.id"
                  :src="imageSrc(image)"
                  class="viewer-image" draggable="false"
                  :style="{height: frameStyle(image, 'double').height}"
                  @mousedown="onImagePanStart"
                  @dragstart.prevent
                  @contextmenu="onMangaImageContextMenu($event, image)"
                />
              </div>
              <div class="viewer-image-page" v-if="!setting.hidePageNumber">{{viewerImageListDouble[currentImageIndex]?.pageNumber?.join(', ')}} of {{viewerImageList.length}}</div>
              <div v-if="currentImageIndex > 1">
                <img
                  v-for="image in viewerImageListDouble[currentImageIndex - 1]?.page" :key="image.id"
                  :src="imageSrc(image)"
                  class="viewer-image-preload"
                />
              </div>
              <div v-if="currentImageIndex < viewerImageListDouble.length - 1">
                <img
                  v-for="image in viewerImageListDouble[currentImageIndex + 1]?.page" :key="image.id"
                  :src="imageSrc(image)"
                  class="viewer-image-preload"
                />
              </div>
            </div>
          </div>
        </div>
        <div class="drawer-thumbnail-content" v-if="showThumbnail">
          <!-- eslint-disable-next-line vue/valid-v-for -->
          <el-space wrap :size="Number(setting.viewerThumbnailGap) || 0" @wheel.stop>
            <div v-for="(image, index) in thumbnailList" :key="image.id"
              class="viewer-thumbnail-item"
              :class="{
                'viewer-thumbnail-item-active': isCurrentImage(image.id),
                'viewer-thumbnail-item-clicked': clickedThumbId === image.id
              }">
              <img
                :src="`${image.thumbnailPath}?id=${image.id}`"
                class="viewer-thumbnail"
                :style="{width: thumbnailWidth}"
                @click="handleClickThumbnail(image.id)"
                @contextmenu="onMangaImageContextMenu($event, image)"
              />
              <div class="viewer-thunmnail-page" v-if="!setting.hidePageNumber">{{index + 1}} of {{thumbnailList.length}}</div>
            </div>
          </el-space>
        </div>
        <!-- 退出按钮:独立常驻右上角 -->
        <el-button class="viewer-exit-button" :class="{ 'viewer-exit-button-visible': viewerToolbarVisible }" link text :icon="Close" size="large" :title="$t('c.close')" @click="drawerVisibleViewer = false"></el-button>
        <!-- 阅读器设置栏:整体固定在右上角(在退出按钮下方);全部是按钮(点击切换),颜色跟随主题。
             唤出方式(可在 设置 → 内置阅读器 里关掉前两条):
               · 鼠标移到屏幕顶部 1/22 高度处弹出,移出 1/20 后隐藏
               · 点击画面中央 1/4 区域弹出(再点一次收起)
               · 图钉按钮固定后常驻 -->
        <div
          class="viewer-toolbar"
          :class="{ 'viewer-toolbar-visible': viewerToolbarVisible }"
          @mouseenter="toolbarHovered = true"
          @mouseleave="toolbarHovered = false"
        >
          <!-- 顺序 / 显隐完全由「设置 → 内置阅读器 → 设置栏按钮」决定 -->
          <template v-for="id in viewerToolbarList" :key="id">
            <span class="viewer-toolbar-divider" v-if="viewerToolbarDividerBefore(id)"></span>
            <!-- 放大 / 缩小是一个整体(设置里也是一项) -->
            <span v-if="id === 'zoom'" class="viewer-toolbar-group">
              <el-button class="viewer-toolbar-btn" size="small" :icon="ZoomOut" :title="$t('m.zoomOut')" @click="zoomViewerImage(-1)"></el-button>
              <span class="viewer-toolbar-value" :title="$t('m.zoomTip')">{{ viewerZoomLabel }}</span>
              <el-button class="viewer-toolbar-btn" size="small" :icon="ZoomIn" :title="$t('m.zoomIn')" @click="zoomViewerImage(1)"></el-button>
            </span>
            <el-button
              v-else
              class="viewer-toolbar-btn"
              size="small"
              :icon="viewerToolbarIcon(id)"
              :title="viewerToolbarTitle(id)"
              @click="viewerToolbarClick(id)"
            >{{ viewerToolbarText(id) }}</el-button>
          </template>
        </div>

        <div class="next-manga-button" v-if="setting.showNextMangaButtons !== false" :class="{ 'next-manga-button-visible': nextMangaButtonsVisible }">
          <el-button size="large" type="success" plain @click="$emit('toNextManga', -1)">{{$t('m.previousManga')}}</el-button>
          <el-button size="large" type="success" plain @click="$emit('toNextMangaRandom')">{{$t('m.nextMangaRandom')}}</el-button>
          <el-button size="large" type="success" plain @click="$emit('toNextManga', 1)">{{$t('m.nextManga')}}</el-button>
        </div>
      </div>
    </div>
  </el-drawer>
  <!-- ComicRead 阅读器:复用原版阅读器的左上角菜单样式(Teleport 进 #ComicRead 以显示在其上层) -->
  <Teleport to="#ComicRead" v-if="isComicReadDisplay">
    <div class="comic-read-mode-setting">
      <el-select v-model="comicReadStyle" size="small" class="viewer-mode" @change="applyComicReadOption">
        <el-option value="scroll" :label="$t('m.scrolling')" />
        <el-option value="single" :label="$t('m.singlePage')" />
        <el-option value="double" :label="$t('m.doublePage')" />
      </el-select>
      <el-select v-model="comicReadWidth" size="small" class="viewer-image-width" @change="applyComicReadOption">
        <el-option :value="50" label="50%" />
        <el-option :value="75" label="75%" />
        <el-option :value="90" label="90%" />
        <el-option :value="100" label="100%" />
      </el-select>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, computed, nextTick, watch, onUnmounted, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { Close, Loading, ZoomIn, ZoomOut, Lock, Unlock, Picture, Grid, Memo } from '@element-plus/icons-vue'
import { ElLoading, ElMessage, ElMessageBox } from 'element-plus'
import ContextMenu from '@imengyu/vue3-context-menu'
import { attachInertiaScroll } from '../inertia-scroll.js'

import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import { isContextMenuItemEnabled, sortContextMenuItems, insertLocalReadRecord } from '../utils.js'

const appStore = useAppStore()
const { keyMap, setting, bookDetail } = storeToRefs(appStore)
const { printMessage, saveBook } = appStore
const { t } = useI18n()

// 网页版(Docker)只读账户:图片右键菜单只保留复制图片
const viewerRole = computed(() => {
  const auth = window.__AUTH__ || {}
  return !!auth.enabled && auth.role === 'viewer'
})

const emit = defineEmits([
  'toNextManga',
  'toNextMangaRandom',
  'updateOptions',
  'updateWindowTitle',
  'rescanBook',
])

let ComicReader = null
const isComicReadDisplay = ref(false)
// ComicRead 当前显示到的图片序号(由它的 onShowImgsChange 回调提供,退出时用来写阅读进度)
let comicReadPageIndex = 0
let comicReadOpenedCount = 0
// 只在本轮阅读的第一次 open 时跳转进度,之后不再打扰用户
let comicReadJumped = false

// 列表还在增长时不要每秒重建一次(旧实现是 _.throttle 无条件 open):
// 只有「增长超过 20%」或「已经全部到齐」才重新 open,减少列表重建与图片重排。
const showComicReader = _.throttle((imageList) => {
  if (!ComicReader) return
  const total = totalPage.value || imageList.length
  const urls = imageList.filter(Boolean)
  if (comicReadOpenedCount && urls.length < total && urls.length < comicReadOpenedCount * 1.2) return
  comicReadOpenedCount = urls.length
  isComicReadDisplay.value = true
  const book = bookDetail.value
  ComicReader.open(urls, book ? (book.title_jpn || book.title) : undefined)
  syncComicReadPanel()
  // ComicRead 自己不带阅读进度,首次打开时按上一次记录跳转(双页模式下可能与图片序号有偏差)
  if (!comicReadJumped) {
    comicReadJumped = true
    try {
      if (setting.value.keepReadingProgress && book) {
        const prog = viewerReadingProgress.value.find(p => p.bookId === book.id)
        const idx = prog ? viewerImageList.value.findIndex(im => im.id === prog.pageId) : -1
        if (idx > 0) {
          setTimeout(() => {
            try { if (ComicReader) ComicReader.goto(idx) } catch (e) { /* 忽略 */ }
          }, 600)
        }
      }
    } catch (e) { /* 忽略 */ }
  }
}, 1000)

// ComicRead 阅读器的原版风格菜单:显示模式(卷轴/单页/双页)与图片宽度
const comicReadStyle = ref('scroll')
const comicReadWidth = ref(100)
// 打开时读取 ComicRead 当前配置,同步到菜单
const syncComicReadPanel = () => {
  if (!ComicReader) return
  const opt = ComicReader.store.option
  if (!opt) return
  comicReadStyle.value = opt.scrollMode?.enabled ? 'scroll' : opt.pageNum === 1 ? 'single' : opt.pageNum === 2 ? 'double' : 'scroll'
  comicReadWidth.value = opt.zoom?.ratio ?? 100
}
// 菜单变化时写回 ComicRead 配置(完整对象,避免部分合并丢失其他设置)
const applyComicReadOption = () => {
  if (!ComicReader) return
  const opt = ComicReader.store.option || {}
  const scrollEnabled = comicReadStyle.value === 'scroll'
  ComicReader.setProps('option', {
    ...opt,
    scrollMode: { ...opt.scrollMode, enabled: scrollEnabled },
    pageNum: comicReadStyle.value === 'single' ? 1 : comicReadStyle.value === 'double' ? 2 : 0,
    zoom: { ...opt.zoom, ratio: comicReadWidth.value }
  })
}

const closeComicReader = () => {
  if (!ComicReader) return
  // ComicRead 模式不走 el-drawer 的 @close,必须在这里手动收尾 ——
  // 否则主进程的 viewerActive 会一直是 true,后台扫描/封面/元数据任务会永久卡在 waitViewerIdle。
  if (setting.value.keepReadingProgress) {
    try {
      const image = viewerImageList.value[comicReadPageIndex]
      if (image && image.id) {
        viewerReadingProgress.value.unshift({ bookId: bookDetail.value.id, pageId: image.id })
        localStorage.setItem('viewerReadingProgress', JSON.stringify(viewerReadingProgress.value.slice(0, 1000)))
      }
    } catch (e) { /* 索引越界等:忽略 */ }
  }
  isComicReadDisplay.value = false
  ComicReader.setProps('show', false)
  ComicReader = null
  comicReadOpenedCount = 0
  comicReadPageIndex = 0
  comicReadJumped = false
  const comicReadElement = document.getElementById('ComicRead')
  if (comicReadElement) comicReadElement.remove()
  ipcRenderer.invoke('release-sendimagelock')
  ipcRenderer.invoke('set-viewer-active', false)
  ipcRenderer.invoke('update-window-title')
}

const initComicRead = async () => {
  if (!ComicReader && setting.value.viewerType === 'comicread') {
    try {
      const { initComicReader, defaultConfig } = await import('@hymbz/comic-read-script/ComicReader.umd.js')
      const configObject = defaultConfig()
      configObject.props.onExit = closeComicReader
      // 记录当前显示到的图片序号:退出时用它写阅读进度(原版阅读器靠滚动位置,ComicRead 没有)
      configObject.props.onShowImgsChange = (showImgs) => {
        try {
          if (showImgs && showImgs.size) comicReadPageIndex = Math.min(...showImgs)
        } catch (e) { /* 忽略 */ }
      }
      ComicReader = initComicReader(configObject)
    } catch (error) {
      console.error('Failed to load ComicRead:', error)
    }
  }
}

// ---------- 阅读器浮层工具栏(退出 / 缩放 / 固定 / 各项设置) ----------
// 显示规则(可在 设置 → 内置阅读器 里关掉前两条):
//   · 鼠标移到屏幕顶部 1/22 高度处弹出,移出 1/20 后自动隐藏
//   · 点击画面中央 1/4 区域也能弹出
//   · 图钉按钮固定后常驻,不再自动隐藏
// 底部「上一本 / 随机 / 下一本」:平时完全隐藏(0%),鼠标移到画面底部才显示
const nextMangaButtonsVisible = ref(false)
const viewerToolbarPinned = ref(false)
const toolbarHovered = ref(false)
const toolbarForced = ref(false)      // 顶部悬停唤出:鼠标离开顶部区域就收
const toolbarClickLocked = ref(false) // 点击画面中央唤出:需要再点一次才收
const viewerToolbarVisible = computed(() =>
  viewerToolbarPinned.value || toolbarHovered.value || toolbarForced.value || toolbarClickLocked.value
)

// 设置栏全部按钮化:按钮上显示当前状态,点击循环切换到下一个
const cycleImageStyleFit = () => {
  const order = ['window', 'width', 'height']
  imageStyleFit.value = order[(order.indexOf(imageStyleFit.value) + 1) % order.length]
  saveImageStyleFit()
  showViewerTip({
    window: t('m.tipFitWindow'),
    width: t('m.tipFitWidth'),
    height: t('m.tipFitHeight'),
  }[imageStyleFit.value] || '')
}
const toggleThumbnailMode = () => {
  // 以前只调 switchThumbnail(它负责请求缩略图 / 记录滚动位置),但状态没切换 → 点了没反应
  showThumbnail.value = !showThumbnail.value
  switchThumbnail(showThumbnail.value)
}
const toggleSidebar = () => handleSidebarChange(!showViewerSide.value)
let toolbarAutoHideTimer = null

const toggleToolbarPin = () => {
  viewerToolbarPinned.value = !viewerToolbarPinned.value
  if (viewerToolbarPinned.value) toolbarForced.value = true
}

// 阅读器里改的方向 / 卷轴双页等要写回 setting.json(只读账户不写)
const persistSetting = () => {
  if (viewerRole.value) return
  try { ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value))) } catch (e) { /* 忽略 */ }
}

// ---------- 显示模式与阅读方向(严格按渲染矩阵) ----------
//   卷轴关 = 分页:一屏 1 张(单页)/ 2 张(双页),翻页方向由「方向」决定
//   卷轴开 = 连续滚动:一行 1 张 / 2 张;方向 = 左右 / 右左 时整排横向连续滚动
// 「方向」只决定排列与翻页方向,不再反过来强制切换卷轴开关。
const scrollDoubleMode = computed(() => setting.value.scrollDoubleMode === true)
const readingDirection = computed(() => setting.value.readingDirection || 'vertical')
const isRtl = computed(() => readingDirection.value === 'rtl')
// 横向整排:卷轴开着 + 方向不是「上下」
const isScrollHorizontal = computed(() => imageStyleType.value === 'scroll' && readingDirection.value !== 'vertical')
// 单双:分页下一屏 1 / 2 张;卷轴下一行 1 / 2 张
const isDoubleActive = computed(() => (
  imageStyleType.value === 'scroll' ? scrollDoubleMode.value : imageStyleType.value === 'double'
))
const readingDirectionLabel = computed(() => t({
  vertical: 'm.dirVertical',
  ltr: 'm.dirLtr',
  rtl: 'm.dirRtl',
}[readingDirection.value] || 'm.dirVertical'))

// 模式 / 方向变化后的统一收尾:记住当前页,再把视口摆到该在的位置
const afterLayoutChange = () => {
  getCurrentImageId()
  saveImageStyleType()
  nextTick(() => {
    if (isScrollHorizontal.value) {
      const first = viewerImageList.value[0]
      // 列表还没推入 / 还停在第一页 → 贴到「第一页」那一端
      if (!viewerImageList.value.length || !currentImageId.value || (first && currentImageId.value === first.id)) pinHorizontal()
      else pinHorizontalStart = false
    } else {
      pinHorizontalStart = false
    }
    updateImageSize()
  })
}
// ① 卷轴开关:关掉卷轴 → 回到上次的单 / 双页;打开 → 沿用当前单双
const toggleScrollMode = () => {
  imageStyleType.value = imageStyleType.value === 'scroll'
    ? (scrollDoubleMode.value ? 'double' : 'single')
    : 'scroll'
  afterLayoutChange()
  showViewerTip(viewerModeTip())
}
// ② 单双开关:分页下一屏 1 ⇄ 2 张;卷轴下一行 1 ⇄ 2 张
const toggleSingleDouble = () => {
  if (imageStyleType.value === 'scroll') {
    setting.value.scrollDoubleMode = !scrollDoubleMode.value
    persistSetting()
  } else {
    imageStyleType.value = imageStyleType.value === 'double' ? 'single' : 'double'
  }
  afterLayoutChange()
  showViewerTip(viewerModeTip())
}
// ③ 方向:上下 → 左右 → 右左 循环(不改变卷轴开关)
const cycleReadingDirection = () => {
  const order = ['vertical', 'ltr', 'rtl']
  setting.value.readingDirection = order[(order.indexOf(readingDirection.value) + 1) % order.length]
  persistSetting()
  afterLayoutChange()
  showViewerTip({
    vertical: t('m.tipDirectionVertical'),
    ltr: t('m.tipDirectionLtr'),
    rtl: t('m.tipDirectionRtl'),
  }[readingDirection.value] || '')
}

// ---------- 设置栏按钮:可在 设置 → 内置阅读器 里勾选 / 排序(留空=全部显示) ----------
// 卷轴 / 单双 / 方向 / 适应 / 缩放 与 缩略图 / 侧栏 / 图钉 都可配置(设置里勾选 + 拖动排序);
// 只有「退出」按钮固定常驻右上角,不参与配置。
const DEFAULT_VIEWER_TOOLBAR = ['scroll', 'singleDouble', 'direction', 'fit', 'zoom', 'thumbnail', 'sidebar', 'pin']
// 旧配置里的 zoomIn / zoomOut 归一成一项 zoom
const normalizeViewerToolbarId = (id) => (id === 'zoomIn' || id === 'zoomOut' ? 'zoom' : id)
// 缩略图视图下这三项没有意义
const HIDDEN_IN_THUMBNAIL = ['fit', 'zoom', 'sidebar']
// 最终渲染的按钮顺序 + 显隐(设置里拖动排序 / 点击显隐后立即生效)
const viewerToolbarList = computed(() => {
  const rawOrder = Array.isArray(setting.value.viewerToolbarOrder) && setting.value.viewerToolbarOrder.length
    ? setting.value.viewerToolbarOrder
    : DEFAULT_VIEWER_TOOLBAR
  const order = []
  for (const id of rawOrder.map(normalizeViewerToolbarId)) {
    if (id !== 'exit' && !order.includes(id)) order.push(id)
  }
  for (const id of DEFAULT_VIEWER_TOOLBAR) if (!order.includes(id)) order.push(id)
  const rawShown = setting.value.viewerToolbarButtons
  const hasShownConfig = Array.isArray(rawShown) && rawShown.length > 0
  const hasOrderConfig = Array.isArray(setting.value.viewerToolbarOrder) && setting.value.viewerToolbarOrder.length > 0
  // 从未配置过 → 全部显示;配置过(哪怕一个都不勾选)→ 严格按配置来
  const shown = hasShownConfig ? rawShown.map(normalizeViewerToolbarId) : (hasOrderConfig ? [] : null)
  return order.filter(id => (shown === null || shown.includes(id)) && !(showThumbnail.value && HIDDEN_IN_THUMBNAIL.includes(id)))
})
// 分组竖线:适应 / 缩放 之前各一条
const viewerToolbarDividerBefore = (id) => id === 'fit' || id === 'zoom'
const viewerToolbarTitle = (id) => ({
  scroll: t('m.scrolling'),
  singleDouble: t('m.singlePage') + ' / ' + t('m.doublePage'),
  direction: t('m.dirTip'),
  fit: t('m.fitTip'),
  thumbnail: t('m.thumbnail'),
  sidebar: showViewerSide.value ? t('m.hideSidebar') : t('m.showSidebar'),
  pin: viewerToolbarPinned.value ? t('m.unpinToolbar') : t('m.pinToolbar'),
}[id] || '')
const viewerToolbarText = (id) => ({
  scroll: imageStyleType.value === 'scroll' ? t('m.scrollModeLabel') : t('m.pagingModeLabel'),
  singleDouble: isDoubleActive.value ? t('m.doublePage') : t('m.singlePage'),
  direction: readingDirectionLabel.value,
  fit: imageStyleFitLabel.value,
}[id] || '')
const viewerToolbarIcon = (id) => ({
  thumbnail: showThumbnail.value ? Picture : Grid,
  sidebar: Memo,
  pin: viewerToolbarPinned.value ? Lock : Unlock,
}[id])
const viewerToolbarClick = (id) => {
  const actions = {
    scroll: toggleScrollMode,
    singleDouble: toggleSingleDouble,
    direction: cycleReadingDirection,
    fit: cycleImageStyleFit,
    thumbnail: toggleThumbnailMode,
    sidebar: toggleSidebar,
    pin: toggleToolbarPin,
  }
  if (actions[id]) actions[id]()
}

// 打开阅读器时先亮 3 秒,避免用户不知道这里有个工具栏
const flashViewerToolbar = () => {
  toolbarForced.value = true
  if (toolbarAutoHideTimer) clearTimeout(toolbarAutoHideTimer)
  toolbarAutoHideTimer = setTimeout(() => {
    toolbarAutoHideTimer = null
    if (!viewerToolbarPinned.value && !toolbarHovered.value) toolbarForced.value = false
  }, 3000)
}

const handleViewerMouseMove = (event) => {
  const el = drawerViewerBody.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (!rect.height) return
  const y = event.clientY - rect.top
  // 上方 1/22:弹出
  if (setting.value.viewerToolbarHover !== false && y < rect.height / 22) {
    if (toolbarAutoHideTimer) { clearTimeout(toolbarAutoHideTimer); toolbarAutoHideTimer = null }
    toolbarForced.value = true
    return
  }
  // 离开 1/20 区域(且没有钉住 / 鼠标不在工具栏上):隐藏
  if (y > rect.height / 20 && !viewerToolbarPinned.value && !toolbarHovered.value) {
    toolbarForced.value = false
  }
  // 底部 1/10:显示「上一本 / 随机 / 下一本」;离开即收起(隐藏时透明度 0)
  nextMangaButtonsVisible.value = y > rect.height * 0.9
}

// ---------- 按钮操作提示:点每个设置栏按钮时说明「现在是什么状态、这一项管什么」 ----------
// 文案对着渲染矩阵写;可在 设置 → 内置阅读器 →「按钮操作提示」里关掉。
const showViewerTip = (message) => {
  if (setting.value.viewerButtonTips === false) return
  if (!message) return
  ElMessage({
    message,
    type: 'info',
    duration: 2200,
    offset: Math.max(70, Math.round(window.innerHeight / 10)),
  })
}
// 当前模式(卷轴 x 单双 x 方向)的一句说明
const viewerModeTip = () => {
  if (imageStyleType.value === 'scroll') {
    if (readingDirection.value !== 'vertical') return t('m.tipScrollHorizontal')
    return t(scrollDoubleMode.value ? 'm.tipScrollOnDouble' : 'm.tipScrollOnSingle')
  }
  return t(isDoubleActive.value ? 'm.tipPagedDouble' : 'm.tipPagedSingle')
}

// ---------- 全局缩放:全部模式(分页单/双页、纵向卷轴、横向整排)共用同一个系数 ----------
const viewerZoom = ref(1)
const ZOOM_MIN = 0.3
const ZOOM_MAX = 3
const ZOOM_STEP = 0.1
const setViewerZoom = (value, persist = true) => {
  const next = _.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)), 2)
  const changed = next !== viewerZoom.value
  viewerZoom.value = next
  if (persist) localStorage.setItem('viewerZoom', next)
  if (changed) nextTick(updateImageSize)
}
const zoomViewerImage = (dir) => {
  setViewerZoom(viewerZoom.value + dir * ZOOM_STEP)
  showViewerTip(t('m.tipZoom', { n: Math.round(viewerZoom.value * 100) }))
}
// Ctrl+滚轮:以鼠标位置为锚点缩放,缩放后指针下的内容尽量保持不动
const zoomByWheel = (event) => {
  const el = drawerViewerBody.value
  const dir = event.deltaY < 0 ? 1 : -1
  if (!el) { zoomViewerImage(dir); return }
  const rect = el.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top
  const leftRatio = (el.scrollLeft + mouseX) / Math.max(1, el.scrollWidth)
  const topRatio = (el.scrollTop + mouseY) / Math.max(1, el.scrollHeight)
  zoomViewerImage(dir)
  nextTick(() => {
    const box = drawerViewerBody.value
    if (!box) return
    box.scrollLeft = leftRatio * box.scrollWidth - mouseX
    box.scrollTop = topRatio * box.scrollHeight - mouseY
  })
}

// 退出阅读器(ComicRead 模式走它自己的关闭流程)
const exitViewer = () => {
  if (setting.value.viewerType === 'comicread') closeComicReader()
  else drawerVisibleViewer.value = false
}

// 阅读完成(滚动到最底部再往下滚 / 翻过最后一页)统一入口:
//   设置 → 内置阅读器 →「阅读完成后」= 不处理 / 退出阅读器 / 打开下一本,
//   另有「最后一页提示」开关,只在「不处理」时给一次提示(退出时提示没意义)。
let lastPageTipShown = false
// 到达最后一页就给一次提示(不依赖「再滚一次」,滚轮到底的判断在惯性滚动下并不可靠)
const maybeTipLastPage = () => {
  if (setting.value.viewerEndTip === false || lastPageTipShown) return
  if ((setting.value.viewerEndAction || 'none') === 'exit') return // 会立刻退出,提示没意义
  lastPageTipShown = true
  // 用和「扫描完成」一样的弹窗(ElMessage),但要显示在屏幕中间
  console.log('[viewer] 已到最后一页')
  ElMessage({
    message: t('m.lastPageReached'),
    type: 'success',
    duration: 2500,
    offset: Math.max(80, Math.round(window.innerHeight / 2) - 60),
  })
}
// 越过最后一页(继续滚 / 继续翻)时的统一入口
const handleReachEnd = () => {
  const action = setting.value.viewerEndAction || 'none'
  if (action === 'next') {
    emit('toNextManga', 1)
    return
  }
  if (action === 'random') {
    emit('toNextMangaRandom')
    return
  }
  if (action === 'exit') {
    exitViewer()
    return
  }
  maybeTipLastPage()
}

const drawerVisibleViewer = ref(false)
const showViewerSide = ref(true)
const showThumbnail = ref(false)
// 刚点过的缩略图(闪一下作为点击反馈)
const clickedThumbId = ref('')
let clickedThumbTimer = null
// 旧版「列宽(viewerImageWidth)」已并入全局缩放 viewerZoom

const imageStyleType = ref('scroll')
const imageStyleFit = ref('window')
const viewerReadingProgress = ref([])

// 设置栏按钮上显示的当前状态(必须放在上面这些 ref 之后:computed 会立即求值)
const imageStyleTypeLabel = computed(() => t({
  scroll: 'm.scrolling',
  single: 'm.singlePage',
  double: 'm.doublePage',
}[imageStyleType.value] || 'm.scrolling'))
const imageStyleFitLabel = computed(() => t({
  width: 'm.fitWidth',
  height: 'm.fitHeight',
  window: 'm.fitWindow',
}[imageStyleFit.value] || 'm.fitWindow'))
// 设置栏里的数值 = 全局缩放(对全部模式生效)
// ---------- 图片 URL 版本号 ----------
// 超分「替换原文件」后路径不变,URL 也就没变:
//   · 网页版的图片是 Http 资源(/api/file?path=...),浏览器会一直用缓存,页面看不到新图;
//   · 本地 file:// 在 Electron 里同样可能命中缓存。
// 所以这里维护一个 id → 版本号的表,超分完成后 +1,让 URL 变化从而强制重新拉取。
const imageVersion = ref({})
const bumpImageVersion = (id) => {
  imageVersion.value = { ...imageVersion.value, [id]: Date.now() }
}
// 统一的图片 src:兼容「磁盘路径」与「网页版 URL」两种形态
const imageSrc = (image) => {
  if (!image || !image.filepath) return ''
  const base = String(image.filepath)
  const sep = base.includes('?') ? '&' : '?'
  const ver = imageVersion.value[image.id]
  return base + sep + 'id=' + image.id + (ver ? '&v=' + ver : '')
}

const viewerZoomLabel = computed(() => Math.round(viewerZoom.value * 100) + '%')
// 分页模式(单页 / 双页):用于关闭「没放大时的滚动条」
const isPaging = computed(() => imageStyleType.value === 'single' || imageStyleType.value === 'double')
// 是否已放大(>100%):放大后才允许分页容器滚动
const isZoomedIn = computed(() => viewerZoom.value > 1.001)
const currentImageId = ref('')
const insertEmptyPage = ref(true)
const insertEmptyPageIndex = ref(0)
const viewerImageList = ref([])
const viewerImageListDouble = computed(() => {
  // 双页模式,以及「卷轴 + 并排两页」都走这套配对(横图独占一行,竖图两两一行)
  if (imageStyleType.value === 'double' || (imageStyleType.value === 'scroll' && scrollDoubleMode.value)) {
    const result = []
    let frame = {page: [], pageNumber: []}
    let pageNumber = 0
    for (const image of viewerImageList.value) {
      pageNumber += 1
      if (image.width > image.height) {
        if (frame.page.length > 0) {
          result.push(_.clone(frame))
          frame = {page: [], pageNumber: []}
        }
        result.push({page: [image], pageNumber: [pageNumber]})
      } else {
        frame.page.push(image)
        frame.pageNumber.push(pageNumber)
        if ((insertEmptyPage.value && result.length === insertEmptyPageIndex.value) || frame.page.length >= 2) {
          result.push(_.clone(frame))
          frame = {page: [], pageNumber: []}
        }
      }
    }
    if (frame.page.length > 0) result.push(_.clone(frame))
    return result
  } else {
    return []
  }
})

const totalPage = ref(0)
const viewerImageFilepathList = computed(() => {
  const appendixLength = totalPage.value - viewerImageList.value.length
  if (appendixLength > 0 && insertEmptyPage.value) {
    return [...viewerImageList.value.map(image => image.filepath), ...Array(appendixLength).fill('') ]
  }
  return viewerImageList.value.map(image => image.filepath)
})

const receiveThumbnailList = ref([])

const thumbnailList = computed(() => {
  return _.sortBy(receiveThumbnailList.value, 'index')
})

const pendingImages = []
const pendingThumbnails = []

const flushPendingImages = () => {
  if (pendingImages.length > 0) {
    viewerImageList.value.push(...pendingImages)
    pendingImages.length = 0
  }
}

const flushPendingThumbnails = () => {
  if (pendingThumbnails.length > 0) {
    receiveThumbnailList.value.push(...pendingThumbnails)
    pendingThumbnails.length = 0
  }
}

onMounted(() => {
  imageStyleType.value = localStorage.getItem('imageStyleType') || 'scroll'
  imageStyleFit.value = localStorage.getItem('imageStyleFit') || 'window'
  viewerReadingProgress.value = JSON.parse(localStorage.getItem('viewerReadingProgress')) || []

  ipcRenderer.on('manga-image', async (event, arg) => {
    pendingImages.push(arg)

    if (pendingImages.length >= 10 || viewerImageList.value.length < 10) {
      flushPendingImages()

      if (setting.value.viewerType === 'comicread') {
        totalPage.value = arg.total
        nextTick(() => {
          showComicReader(viewerImageFilepathList.value)
        })
      }
    }

    if ((viewerImageList.value.length + pendingImages.length) === arg.total) {
      flushPendingImages()

      if (setting.value.viewerType === 'comicread') {
        totalPage.value = arg.total
        nextTick(() => {
          showComicReader(viewerImageFilepathList.value)
        })
      }
      viewerLoading?.close()
    }
  })

  ipcRenderer.on('manga-thumbnail-image', (event, arg) => {
    pendingThumbnails.push(arg)

    if (pendingThumbnails.length >= 10 || viewerImageList.value.length < 10) {
      flushPendingThumbnails()
    }

    if ((receiveThumbnailList.value.length + pendingThumbnails.length) === arg.total) {
      flushPendingThumbnails()
    }
  })

  showViewerSide.value = localStorage.getItem('showViewerSide') === 'true'

  window.addEventListener('resize', handleWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  if (imageStateRaf != null) {
    cancelAnimationFrame(imageStateRaf)
    imageStateRaf = null
  }
  ipcRenderer.invoke('set-viewer-active', false)
})
const handleWindowResize = _.debounce(() => {
  updateImageSize()
  if (pinHorizontalStart) applyHorizontalPin()
}, 200)

const drawerHeight = ref('100%')
const readyDestroyViewer = ref(false)

// 缩略图按需请求:后端只在收到请求后才生成缩略图(不请求 = 完全不生成,零开销)。
// 触发点:打开阅读器时侧栏/缩略图视图已经是开着的、用户中途打开侧栏、切到缩略图视图。
// 后端是幂等的(置 thumbWanted + 游标消费),重复请求无害。
const requestThumbnails = () => {
  const book = bookDetail.value
  if (!book || !book.id) return
  ipcRenderer.invoke('request-thumbnails', book.id).catch(() => {})
}

let viewerLoading = null
const viewManga = (book, viewerHeight = '100%') => {
  readyDestroyViewer.value = false
  // 通知主进程正在阅读:后台扫描暂停,让出 CPU/磁盘
  ipcRenderer.invoke('set-viewer-active', true)
  drawerHeight.value = viewerHeight
  viewerImageList.value = []
  receiveThumbnailList.value = []
  pendingImages.length = 0
  pendingThumbnails.length = 0
  currentImageIndex.value = 0
  comicReadJumped = false
  lastPageTipShown = false
  pinHorizontalStart = false
  currentImageId.value = ''
  resetAutoUpscale()
  insertEmptyPage.value = setting.value.defaultInsertEmptyPage
  insertEmptyPageIndex.value = 0
  bookDetail.value = book
  viewerLoading = ElLoading.service({
    lock: true,
    text: 'Loading',
    background: _.includes(setting.value.theme, 'light') ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
  })
  emit('updateWindowTitle', book)
  insertLocalReadRecord(book.id)
  ipcRenderer.invoke('load-manga-image-list', _.cloneDeep(book))
  .then(() => {
    // 只有确实要看缩略图(侧栏开着 / 缩略图视图)时才请求生成,否则一个缩略图都不算
    if (showViewerSide.value || showThumbnail.value) requestThumbnails()
    if (!setting.value.viewerType || setting.value.viewerType === 'original') {
      drawerVisibleViewer.value = true
      // 先亮 3 秒,让用户知道顶部有设置栏(鼠标移到顶部可随时唤出)
      flashViewerToolbar()
      if (setting.value.keepReadingProgress && showThumbnail.value === false) handleJumpToReadingProgress(book)
      viewerLoading.close()
      // 横向整排:新开一本还没有阅读进度时,直接摆到「第一页」那一端(右左 = 最右)
      const hasProgress = setting.value.keepReadingProgress &&
        viewerReadingProgress.value.some(progress => progress.bookId === book.id)
      if (!hasProgress && isScrollHorizontal.value) pinHorizontal()
      // 自动超分开着时,打开就先把当前页送去超分
      nextTick(() => triggerAutoUpscaleForCurrentPage())
    } else if (setting.value.viewerType === 'comicread') {
      initComicRead()
    }
    book.readCount += 1
    saveBook(book)
  })
  .catch(err => {
    console.log(err)
    viewerLoading.close()
    ipcRenderer.invoke('set-viewer-active', false)
  })

  if (localStorage.getItem('showViewerSide') === 'true') {
    showViewerSide.value = true
  }
}

const _currentImageIndex = ref(0)
const currentImageIndex = computed({
  get () {
    return _currentImageIndex.value
  },
  set (val) {
    let listLength
    if (imageStyleType.value === 'single') {
      listLength = viewerImageList.value.length
    } else {
      listLength = viewerImageListDouble.value.length
    }
    if (Number.isInteger(val)) {
      if (val < 0) {
        _currentImageIndex.value = 0
      } else if (val > listLength - 1 && listLength >= 1) {
        _currentImageIndex.value = listLength - 1
        // 已经到最后一页还继续往后翻:按「阅读完成后」的设置处理
        handleReachEnd()
      } else {
        _currentImageIndex.value = val
      }
    }
  }
})

let storeDrawerScrollTop
const switchThumbnail = (val) => {
  if (typeof val === 'boolean' && showThumbnail.value !== val) showThumbnail.value = val
  if (val) requestThumbnails()
  setTimeout(() => document.querySelector('.viewer-exit-button')?.focus(), 500)
  if (imageStyleType.value === 'scroll') {
    if (!val) {
      if (storeDrawerScrollTop) {
        nextTick(() => {
          document.querySelector('.drawer-viewer-body').scrollTop = storeDrawerScrollTop
          storeDrawerScrollTop = undefined
        })
      }
    } else {
      storeDrawerScrollTop = document.querySelector('.drawer-viewer-body').scrollTop
    }
  }
}

const drawerViewerBody = ref(null)

const thumbnailWidth = computed(() => {
  const innerWidth = drawerViewerBody.value ? drawerViewerBody.value.clientWidth : window.innerWidth
  return `${(innerWidth - 32) / (setting.value.thumbnailColumn || 10) - 10}px`
})

// ---------- 尺寸计算:「适应方式(fit)」与「缩放(zoom)」对全部模式生效 ----------
// 每种排列先算出「一张图最多能占的框」,再按 fit 决定贴哪一边,最后统一乘 zoom。
const viewportTick = ref(0)      // 窗口 / 侧栏尺寸变化时自增,触发重新计算
const PAGE_NUMBER_HEIGHT = 28    // 页码行高(设置里可以隐藏页码)
// 横向整排:把视口钉在「第一页」那一端(右左 = 最右),图片陆续推入时也不会漂走
let pinHorizontalStart = false

const viewportSize = () => {
  void viewportTick.value // 让窗口 / 侧栏变化能触发重新渲染
  const el = drawerViewerBody.value
  return {
    width: el && el.clientWidth ? el.clientWidth : window.innerWidth,
    height: el && el.clientHeight ? el.clientHeight : window.innerHeight,
  }
}
const isWideImage = (image) => !!image && image.width > image.height
// 一张图在某个排列里最多能占的框(还没乘 zoom)
const layoutSlot = (image, mode) => {
  const { width, height } = viewportSize()
  const availH = Math.max(80, height - (setting.value.hidePageNumber ? 0 : PAGE_NUMBER_HEIGHT))
  const availW = Math.max(80, width - (mode === 'horizontal' ? 0 : 8))
  // 双页 / 卷轴并排:竖图两人一行,横图独占一整屏
  if ((mode === 'double' || mode === 'scrollDouble') && !isWideImage(image)) {
    return { width: Math.max(80, (availW - 8) / 2), height: availH }
  }
  return { width: availW, height: availH }
}
// fit:窗口 = 整张完整可见 / 宽度 = 铺满可用宽 / 高度 = 铺满可用高
const fitScale = (image, slot) => {
  const byWidth = slot.width / image.width
  const byHeight = slot.height / image.height
  if (imageStyleFit.value === 'width') return byWidth
  if (imageStyleFit.value === 'height') return byHeight
  return Math.min(byWidth, byHeight)
}
const frameStyleCache = new Map()
// 当前排列对应的尺寸模式
const frameModeForStyle = () => {
  if (imageStyleType.value === 'scroll') {
    if (isScrollHorizontal.value) return 'horizontal'
    return scrollDoubleMode.value ? 'scrollDouble' : 'scrollSingle'
  }
  return imageStyleType.value === 'double' ? 'double' : 'single'
}
// 返回 { width, height }(px);同一次渲染里重复调用直接命中缓存
const frameStyle = (image, mode) => {
  if (!image || !image.width || !image.height) return {}
  const { width, height } = viewportSize()
  const key = [mode, image.id, image.width, image.height, width, height,
    viewerZoom.value, imageStyleFit.value, setting.value.hidePageNumber].join('|')
  const cached = frameStyleCache.get(key)
  if (cached) return cached
  const scale = fitScale(image, layoutSlot(image, mode)) * viewerZoom.value
  const style = {
    width: Math.round(image.width * scale) + 'px',
    height: Math.round(image.height * scale) + 'px',
  }
  if (frameStyleCache.size > 3000) frameStyleCache.clear()
  frameStyleCache.set(key, style)
  return style
}
// 自动超分用它判断「显示尺寸有没有超过原图」
const returnImageStyle = (image) => frameStyle(image, frameModeForStyle())

// 卷轴图片右侧那根拖拽条:拖动 = 直接改全局缩放
const onFrameResizeStart = (event, image) => {
  const el = drawerViewerBody.value
  if (!el || !image) return
  event.preventDefault()
  const startX = event.clientX
  const startZoom = viewerZoom.value
  const baseWidth = parseFloat(frameStyle(image, frameModeForStyle()).width) || image.width
  const onMove = (e) => {
    setViewerZoom(startZoom * (1 + (e.clientX - startX) / Math.max(60, baseWidth)))
  }
  const onUp = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// 当前页:分页看索引;纵向卷轴按累计高度;横向整排按元素与视口的关系
const getCurrentImageId = () => {
  if (imageStyleType.value === 'scroll') {
    if (isScrollHorizontal.value) {
      currentImageId.value = findVisibleHorizontalImageId() || (viewerImageList.value[0]?.id || '')
      return currentImageId.value
    }
    const scrollTopValue = drawerViewerBody.value ? drawerViewerBody.value.scrollTop : 0
    const pageNumberHeight = setting.value.hidePageNumber ? 0 : PAGE_NUMBER_HEIGHT
    if (scrollDoubleMode.value) {
      // 并排两页:按「行」累加高度(行高取这一行里最高的那张)
      let rowTop = 0
      let currentId = null
      let lastVisibleImage = null
      for (const frame of viewerImageListDouble.value) {
        if (!frame.page.length) continue
        const rowHeight = frame.page.reduce((max, image) => {
          return Math.max(max, parseFloat(frameStyle(image, 'scrollDouble').height) || 0)
        }, 0) + pageNumberHeight
        if (rowTop <= scrollTopValue && scrollTopValue < rowTop + rowHeight) {
          currentId = frame.page[0].id
          break
        }
        lastVisibleImage = frame.page[0]
        rowTop += rowHeight
      }
      currentImageId.value = currentId || (lastVisibleImage ? lastVisibleImage.id : (viewerImageList.value[0]?.id || ''))
      return currentImageId.value
    }
    let currentId = null
    let lastVisibleImage = null
    let totalHeight = 0
    for (const image of viewerImageList.value) {
      const elementHeight = (parseFloat(frameStyle(image, 'scrollSingle').height) || 0) + pageNumberHeight
      if (totalHeight <= scrollTopValue && scrollTopValue < totalHeight + elementHeight) {
        currentId = image.id
        break
      }
      lastVisibleImage = image
      totalHeight += elementHeight
    }
    currentImageId.value = currentId || (lastVisibleImage ? lastVisibleImage.id : (viewerImageList.value[0]?.id || ''))
  } else if (imageStyleType.value === 'single') {
    currentImageId.value = viewerImageList.value[currentImageIndex.value]?.id
  } else if (imageStyleType.value === 'double') {
    currentImageId.value = viewerImageListDouble.value[currentImageIndex.value]?.page[0]?.id
  }
  return currentImageId.value
}

// 横向整排里的「当前页」= 阅读起点那一端的第一张可见图(左右取最左,右左取最右)
const findVisibleHorizontalImageId = () => {
  const el = drawerViewerBody.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const items = el.querySelectorAll('.viewer-horizontal-item')
  let candidate = null
  // DOM 顺序 = 阅读顺序(右左时视觉上从右往左排),所以两种方向取的都是
  // 「第一个与视口有重叠的项」:左右 = 最左那张,右左 = 最右那张(阅读起点)。
  for (const item of items) {
    const itemRect = item.getBoundingClientRect()
    if (itemRect.right > rect.left + 4 && itemRect.left < rect.right - 4) {
      candidate = item
      break
    }
  }
  if (!candidate) return null
  const frame = candidate.querySelector('.viewer-image-frame')
  return frame ? frame.id : null
}

const saveReadingProgress = () => {
  readyDestroyViewer.value = true
  try {
    let currentImageId = getCurrentImageId()
    const currentImageIndex = viewerImageList.value.findIndex(image => image.id === currentImageId)
    if (currentImageIndex > bookDetail.value.pageCount - 6) {
      currentImageId = viewerImageList.value[0].id
    }
    viewerReadingProgress.value.unshift({bookId: bookDetail.value.id, pageId: currentImageId})
    localStorage.setItem('viewerReadingProgress', JSON.stringify(viewerReadingProgress.value.slice(0, 1000)))
  } catch {}
}

const saveImageStyleType = () => {
  localStorage.setItem('imageStyleType', imageStyleType.value)
  setTimeout(() => {
    // 横向整排还贴在起点端时保持贴边(否则会被 scrollIntoView 拉离最右 / 最左)
    if (isScrollHorizontal.value && pinHorizontalStart) {
      applyHorizontalPin()
    } else {
      handleClickThumbnail(currentImageId.value)
    }
    document.querySelector('.viewer-exit-button')?.focus()
  }, 500)
}

const saveImageStyleFit = () => {
  localStorage.setItem('imageStyleFit', imageStyleFit.value)
  setTimeout(() => document.querySelector('.viewer-exit-button')?.focus(), 500)
}

// ---------- 翻页(分页模式) ----------
const frameCount = () => (imageStyleType.value === 'double' ? viewerImageListDouble.value.length : viewerImageList.value.length)
const turnPage = (step) => {
  if (!step) return
  const next = currentImageIndex.value + step
  if (next < 0) return
  currentImageIndex.value = next // setter 会夹住上限,并在越过最后一页时触发「阅读完成后」
  nextTick(() => {
    const el = drawerViewerBody.value
    if (el) { el.scrollTop = 0; el.scrollLeft = 0 }
  })
  scrollCurrentThumbnailIntoView()
}

// ---------- 横向整排:把视口钉在「第一页」那一端(右左 = 最右) ----------
const applyHorizontalPin = () => {
  if (!pinHorizontalStart) return
  const el = drawerViewerBody.value
  if (!el || !isScrollHorizontal.value) return
  el.scrollLeft = isRtl.value ? el.scrollWidth : 0
  // 图片是边解码边插入的,下一帧再贴一次,避免刚插入的一张把视口顶偏
  requestAnimationFrame(() => {
    if (!pinHorizontalStart) return
    const box = drawerViewerBody.value
    if (!box || !isScrollHorizontal.value) return
    box.scrollLeft = isRtl.value ? box.scrollWidth : 0
  })
}
let pinSettleTimer = null
const pinHorizontal = () => {
  pinHorizontalStart = true
  nextTick(applyHorizontalPin)
  // 图片是懒加载的:元素宽度会陆续变化(每张进入视口才真正渲染),内容变宽会把视口顶偏,
  // 所以在接下来几秒里持续贴边;用户一旦有滚动 / 拖动 / 键盘操作会立刻取消(pinHorizontalStart=false)。
  if (pinSettleTimer) clearInterval(pinSettleTimer)
  let ticks = 0
  pinSettleTimer = setInterval(() => {
    ticks += 1
    if (!pinHorizontalStart || ticks > 24) {
      clearInterval(pinSettleTimer)
      pinSettleTimer = null
      return
    }
    applyHorizontalPin()
  }, 150)
}

// ---------- 键盘:由 App.vue 转发,返回 true 表示这次按键已由阅读器处理 ----------
const handleViewerKey = (event) => {
  if (!drawerVisibleViewer.value || showThumbnail.value) return false
  const keys = setting.value.reverseLeftRight ? keyMap.value.reverse : keyMap.value.normal
  const dir = readingDirection.value
  const el = drawerViewerBody.value

  if (event.key === 'Home' || event.key === 'End') {
    const toEnd = event.key === 'End'
    if (imageStyleType.value === 'scroll') {
      if (!el) return false
      if (isScrollHorizontal.value) {
        el.scrollLeft = toEnd ? (isRtl.value ? 0 : el.scrollWidth) : (isRtl.value ? el.scrollWidth : 0)
        pinHorizontalStart = false
      } else {
        el.scrollTop = toEnd ? el.scrollHeight : 0
      }
      setTimeout(() => { getCurrentImageId(); scrollCurrentThumbnailIntoView() }, 120)
    } else {
      currentImageIndex.value = toEnd ? Math.max(0, frameCount() - 1) : 0
    }
    return true
  }
  // 「/」:分页双页下插入 / 取消空白页(原 App.vue 里的快捷键,现在归阅读器)
  if (event.key === '/' && imageStyleType.value === 'double') {
    insertEmptyPageIndex.value = currentImageIndex.value
    insertEmptyPage.value = !insertEmptyPage.value
    return true
  }
  if (event.key === '+' || event.key === 'Add') { zoomViewerImage(1); return true }
  if (event.key === '-' || event.key === '_' || event.key === 'Subtract') { zoomViewerImage(-1); return true }

  let step = 0
  // PageDown / PageUp 归主界面「下一本 / 上一本」,阅读器里不抢这两个键
  if (event.key === 'ArrowDown' || event.key === ' ') step = 1
  else if (event.key === 'ArrowUp') step = -1
  else if (event.key === 'ArrowRight') step = dir === 'rtl' ? -1 : 1
  else if (event.key === 'ArrowLeft') step = dir === 'rtl' ? 1 : -1
  else if (event.key === keys.next) step = 1
  else if (event.key === keys.prev) step = -1
  if (!step) return false

  if (imageStyleType.value === 'scroll') {
    if (!el) return false
    const unit = (event.ctrlKey ? 0.12 : 0.85) * (isScrollHorizontal.value ? el.clientWidth : el.clientHeight)
    if (isScrollHorizontal.value) {
      el.scrollLeft += (isRtl.value ? -step : step) * unit
      pinHorizontalStart = false
    } else {
      el.scrollTop += step * unit
    }
    setTimeout(() => { getCurrentImageId(); scrollCurrentThumbnailIntoView() }, 120)
    return true
  }
  turnPage(step)
  return true
}

// 让目标页对齐到滚动容器起点(横向 / 纵向、右左反向都适用:直接用渲染出来的坐标换算)
const scrollToImageElement = (id) => {
  const el = document.getElementById(id)
  const box = drawerViewerBody.value
  if (!el || !box) return false
  const elRect = el.getBoundingClientRect()
  const boxRect = box.getBoundingClientRect()
  if (isScrollHorizontal.value) {
    box.scrollLeft += elRect.left - boxRect.left
  } else {
    box.scrollTop += elRect.top - boxRect.top
  }
  return true
}

const handleClickThumbnail = (id) => {
  showThumbnail.value = false
  // 点过的缩略图闪一下,让「点到了」这件事看得见
  clickedThumbId.value = id
  if (clickedThumbTimer) clearTimeout(clickedThumbTimer)
  clickedThumbTimer = setTimeout(() => { clickedThumbId.value = '' }, 600)
  if (imageStyleType.value === 'scroll') {
    const scrollToTarget = () => {
      if (!scrollToImageElement(id)) return false
      nextTick(() => { getCurrentImageId() })
      return true
    }
    nextTick(() => {
      scrollToTarget()
      // 图片懒加载会让每张的高度陆续变化,多校正几次,保证最终对齐
      for (const delay of [120, 320, 700, 1200]) setTimeout(scrollToTarget, delay)
    })
  } else if (imageStyleType.value === 'single') {
    const index = _.findIndex(viewerImageList.value, { id })
    if (index >= 0) currentImageIndex.value = index
  } else if (imageStyleType.value === 'double') {
    _.forEach(viewerImageListDouble.value, (imageGroup, index) => {
      if (_.find(imageGroup.page, { id })) {
        currentImageIndex.value = index
        return false
      }
    })
  }
}

// ---------- 按住图片拖动 = 平移查看 ----------
// 浏览器默认行为是「拖拽图片」(拖到桌面/文件夹会变成复制文件),这里改成平移滚动。
let panState = null
let suppressClickUntil = 0
const onImagePanStart = (event) => {
  if (event.button !== 0) return
  const el = drawerViewerBody.value
  if (!el) return
  panState = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false }
  pinHorizontalStart = false // 用户自己拖动过:横向不再自动贴边
  window.addEventListener('mousemove', onImagePanMove)
  window.addEventListener('mouseup', onImagePanEnd)
}
const onImagePanMove = (event) => {
  if (!panState) return
  const el = drawerViewerBody.value
  if (!el) return
  const dx = event.clientX - panState.x
  const dy = event.clientY - panState.y
  if (!panState.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return
  panState.moved = true
  el.scrollLeft = panState.left - dx
  el.scrollTop = panState.top - dy
  if (event.cancelable) event.preventDefault()
}
const onImagePanEnd = () => {
  window.removeEventListener('mousemove', onImagePanMove)
  window.removeEventListener('mouseup', onImagePanEnd)
  // 拖动过就别再触发「点击翻页」
  if (panState && panState.moved) suppressClickUntil = Date.now() + 250
  panState = null
}

// 点击画面「中央 1/5」唤出设置栏:指**宽度**占 1/5 的中央竖带(左右各 40% 仍是翻页区),
// 其余区域按「方向」翻页(只有分页模式翻页)
const TOOLBAR_CLICK_ZONE_HALF = 0.1
const handleViewerAreaClick = (event) => {
  if (Date.now() < suppressClickUntil) return
  const el = drawerViewerBody.value
  if (showThumbnail.value === false && setting.value.viewerToolbarClick !== false) {
    const rect = el
      ? el.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    // 中央「宽度 1/5」竖带:横向半边 = 0.1,纵向不限制(整个高度都算中央区)
    const halfW = rect.width * TOOLBAR_CLICK_ZONE_HALF
    if (Math.abs(x - rect.width / 2) <= halfW) {
      // 点击中央:唤出设置栏;再点一次收起(悬停唤出的那一套不受影响)
      toolbarClickLocked.value = !toolbarClickLocked.value
      return
    }
  }
  if (showThumbnail.value) return
  if (imageStyleType.value !== 'single' && imageStyleType.value !== 'double') return
  const rect = el
    ? el.getBoundingClientRect()
    : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
  const dir = readingDirection.value
  // 上下 = 点下半屏前进;左右 = 点右半屏前进;右左 = 点左半屏前进
  const forward = dir === 'vertical'
    ? event.clientY > rect.top + rect.height / 2
    : dir === 'rtl'
      ? event.clientX < rect.left + rect.width / 2
      : event.clientX > rect.left + rect.width / 2
  turnPage(forward ? 1 : -1)
}

const handleJumpToReadingProgress = async (book) => {
  const findProgress = viewerReadingProgress.value.find(progress => progress.bookId === book.id)
  if (findProgress) {
    const timer = ms => new Promise(res => setTimeout(res, ms))
    while (!readyDestroyViewer.value) {
      if (imageStyleType.value === 'scroll' || imageStyleType.value === 'single') {
        if (viewerImageList.value.findIndex(image => image.id === findProgress.pageId) >= 0) {
          handleClickThumbnail(findProgress.pageId)
          break
        }
      } else if (imageStyleType.value === 'double') {
        if (viewerImageListDouble.value.findIndex(imageGroup => imageGroup.page.findIndex(page => page.id === findProgress.pageId) >= 0) >= 0) {
          handleClickThumbnail(findProgress.pageId)
          break
        }
      }
      if (viewerImageList.value.length > book.pageCount - 5 || bookDetail.value.id !== book.id) break
      await timer(500)
    }
  }
}


const useNewCover = async (filepath) => {
  const coverPath = await ipcRenderer.invoke('use-new-cover', filepath)
  bookDetail.value.coverPath = coverPath
  await saveBook(bookDetail.value)
}

const handleStopReadManga = () => {
  // 释放惯性滚动监听
  if (viewerInertiaDetach) {
    viewerInertiaDetach()
    viewerInertiaDetach = null
  }
  if (setting.value.keepReadingProgress) saveReadingProgress()
  ipcRenderer.invoke('release-sendimagelock')
  ipcRenderer.invoke('update-window-title')
  ipcRenderer.invoke('set-viewer-active', false)
}

// ---------- 阅读器惯性滚动(仅卷轴模式) ----------
let viewerInertiaDetach = null
const attachViewerInertia = () => {
  if (viewerInertiaDetach) return
  const el = document.querySelector('.viewer-drawer .drawer-viewer-body')
  if (!el) return
  viewerInertiaDetach = attachInertiaScroll(el, {
    getLevel: () => setting.value.scrollInertiaLevel || 'medium',
    shouldIntercept: () => imageStyleType.value === 'scroll'
  })
}

const onMangaImageContextMenu = (e, image) => {
  e.preventDefault()
  const items = [
    {
      id: 'copyImage',
      label: t('c.copyImageToClipboard'),
      onClick: () => {
        ipcRenderer.invoke('copy-image-to-clipboard', image.filepath)
      }
    },
    {
      id: 'imageProperties',
      label: t('m.imageProperties'),
      onClick: () => {
        showImageProperties(image)
      }
    },
    {
      id: 'setCover',
      label: t('c.designateAsCover'),
      onClick: () => {
        useNewCover(image.filepath)
      }
    },
    {
      id: 'renameImage',
      label: t('m.renameImage'),
      onClick: () => {
        renameImageFile(image)
      }
    },
    {
      id: 'restoreImageBak',
      label: t('c.restoreImageBak'),
      onClick: async () => {
        let res = null
        try {
          res = await ipcRenderer.invoke('restore-image-bak', image.filepath)
        } catch (err) {
          ElMessage({ message: t('c.restoreBookBakFail') + ': ' + ((err && err.message) || err), type: 'error', duration: 3000 })
          return
        }
        if (res && res.ok) {
          // 让这张图重新加载(内容已换回原图)
          setImageLoaded(image.id, false)
          nextTick(() => setImageLoaded(image.id, true))
          ElMessage({ message: t('c.restoreImageBakDone'), type: 'success', duration: 2000 })
        } else {
          ElMessage({ message: (res && res.error) || t('c.restoreNoBak'), type: 'warning', duration: 2500 })
        }
      }
    },
    {
      id: 'upscaleImage',
      label: t('m.upscaleImage'),
      onClick: () => {
        upscaleViewerImage(image)
      }
    },
    {
      id: 'ocrImage',
      label: t('m.extractImageText'),
      onClick: () => {
        extractViewerImageText(image)
      }
    },
    {
      id: 'translateImage',
      label: t('m.translateImage'),
      onClick: async () => {
        // 单张:文字提取 → (后续接入文字处理模型翻译)
        try {
          const p = (image && (image.absolutePath || image.path)) || ''
          if (!p) return
          const res = await ipcRenderer.invoke('extract-image-text', p)
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
      onClick: () => {
        printMessage('warning', t('m.colorization') + ': ' + t('c.featureComingSoon'))
      }
    },
    {
      id: 'deleteImage',
      label: t('c.deleteImage'),
      onClick: async () => {
        const deleteResult = await ipcRenderer.invoke('delete-image', image.relativePath, bookDetail.value.filepath, bookDetail.value.type)
        // 后端现在返回 { ok, trashed, error },不能再只看「有没有返回值」
        const deleteOk = deleteResult === true || !!(deleteResult && deleteResult.ok)
        if (deleteOk) {
          viewerImageList.value = viewerImageList.value.filter(item => item.id !== image.id)
          receiveThumbnailList.value = receiveThumbnailList.value.filter(item => item.id !== image.id)
          emit('rescanBook', bookDetail.value)
          const isArchive = bookDetail.value.type === 'zip' || bookDetail.value.type === 'archive'
          printMessage('success', t(isArchive ? 'c.imageDeletedWithBackup' : 'c.imageTrashed'))
        } else {
          printMessage('error', t('c.deleteImageError') + ((deleteResult && deleteResult.error) ? ':' + deleteResult.error : ''))
        }
      }
    }
  ].filter(item => {
    // 只读账户:隐藏写操作(设封面/重命名/超分/OCR/删除图片)
    if (viewerRole.value && ['setCover', 'renameImage', 'upscaleImage', 'ocrImage', 'deleteImage'].includes(item.id)) return false
    if (!isContextMenuItemEnabled(setting.value, 'image', item.id)) return false
    // 注:历史上这里还有 enableImageUpscale / enableImageOcr 两道开关,但设置界面里
    // 从来没有对应的 UI(只有历史副本 src/Setting.vue 里有),默认 false 导致「超分图片」
    // 「提取文字」无论怎么勾选都不会出现。现在显示与否只由「设置 → 高级 → 右键菜单」决定。
    return true
  })
  // 全部项都被取消勾选时不弹出空白菜单
  if (items.length === 0) return
  // 顺序按「设置 → 高级 → 右键菜单」里拖动后的顺序
  ContextMenu.showContextMenu({ x: e.x, y: e.y, items: sortContextMenuItems(setting.value, 'image', items) })
}

// ---------- 图片属性(名称/大小/分辨率/编码) ----------
const formatBytes = (n) => {
  const v = Number(n) || 0
  if (v < 1024) return v + ' B'
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB'
  return (v / 1024 / 1024).toFixed(2) + ' MB'
}
const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))
const showImageProperties = async (image) => {
  const p = (image && (image.filepath || image.absolutePath || image.path)) || ''
  if (!p) return
  try {
    const res = await ipcRenderer.invoke('image-file-info', p)
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
      [t('c.propPath'), res.filePath || p],
    ]
    const html = '<div style="max-height:52vh;overflow:auto">' + rows.map(([k, v]) =>
      '<div style="display:flex;gap:10px;padding:4px 0;border-bottom:1px solid rgba(128,128,128,.15)">'
      + '<span style="flex:0 0 76px;opacity:.65">' + escapeHtml(k) + '</span>'
      + '<span style="flex:1;word-break:break-all">' + escapeHtml(v) + '</span>'
      + '</div>'
    ).join('') + '</div>'
    await ElMessageBox.alert(html, t('m.imageProperties'), {
      dangerouslyUseHTMLString: true,
      confirmButtonText: t('c.close'),
    })
  } catch (e) {
    // 用户关闭弹窗
  }
}

// ---------- 图片重命名 / 超分 / 提取文字 ----------
const renamingImage = ref(false)
const renameImageFile = async (image) => {
  if (renamingImage.value) return
  const book = bookDetail.value
  if (!book || book.type !== 'folder') {
    printMessage('warning', t('c.renameFolderOnly'))
    return
  }
  try {
    const { value } = await ElMessageBox.prompt(
      t('m.renameImage'),
      t('m.renameImage'),
      { inputValue: String(image.filepath).split(/[\\/]/).pop() || '' }
    )
    renamingImage.value = true
    const res = await ipcRenderer.invoke('rename-image', { oldPath: image.filepath, newName: value })
    if (res?.ok) {
      image.filepath = res.path
      const bookDir = String(book.filepath).replace(/[\\/]+$/, '')
      const newPath = String(res.path)
      image.relativePath = newPath.startsWith(bookDir) ? newPath.slice(bookDir.length).replace(/^[\\/]/, '') : newPath
      printMessage('success', t('c.renameDone'))
    } else {
      printMessage('error', res?.error || t('c.renameFailed'))
    }
  } catch (e) {
    // 用户取消
  } finally {
    renamingImage.value = false
  }
}

const upscalingImage = ref(false)
const upscaleViewerImage = async (image) => {
  if (upscalingImage.value) return
  upscalingImage.value = true
  try {
    const res = await ipcRenderer.invoke('upscale-image', image.filepath)
    if (res?.ok) {
      if (res.skipped) {
        // 命中「超分过滤设置」:图片分辨率已达阈值,后端直接跳过,不产生任何输出文件
        printMessage('info', t('c.upscaleSkipped', {
          width: res.width, height: res.height,
          minWidth: res.minWidth, minHeight: res.minHeight,
        }))
        return
      }
      if (res.mode === 'preview') {
        // 仅预览:把阅读器里这张图换成超分结果(临时文件)。
        // 网页版的 filepath 是 /api/file?path=... 的 URL,磁盘路径要转成 URL 才能显示。
        image.filepath = window.__WEB_MODE__
          ? '/api/file?path=' + encodeURIComponent(res.path)
          : res.path
        bumpImageVersion(image.id)
        printMessage('success', t('c.upscaleDone') + '(仅预览,未写入文件)')
      } else if (res.mode === 'replace') {
        // 替换原文件:路径本来就没变;网页版绝不能拿磁盘路径覆盖 URL,否则图片再也加载不出来。
        // 统一换 URL 版本号,保证浏览器重新拉取(否则会一直命中缓存,看不到超分效果)。
        if (!window.__WEB_MODE__) image.filepath = res.path
        bumpImageVersion(image.id)
        printMessage('success', '已替换原文件' + (res.note ? ':' + res.note : ''))
      } else {
        // 另存到文件夹:原图不动。提示里给出完整路径(网页版再给一个可点击的目录入口),
        // 否则用户不知道文件落在哪,会以为「没有保存」。
        const savePath = res.savePath || res.path
        const html = '已保存到:<br><code style="word-break:break-all">' + savePath + '</code>'
          + (res.note ? '<br><span style="color:#e6a23c">' + res.note + '</span>' : '')
          + (window.__WEB_MODE__ ? '<br><a href="/browse?path=' + encodeURIComponent(savePath) + '" target="_blank" style="color:#409eff">打开所在目录</a>' : '')
        ElMessage({ dangerouslyUseHTMLString: true, message: html, type: 'success', duration: 8000, showClose: true })
      }
    } else {
      printMessage('error', res?.error || t('c.upscaleFailed'))
    }
  } catch (e) {
    printMessage('error', t('c.upscaleFailed') + ':' + (e?.message || ''))
  } finally {
    upscalingImage.value = false
  }
}

const extractingImageText = ref(false)
const extractViewerImageText = async (image) => {
  if (extractingImageText.value) return
  extractingImageText.value = true
  try {
    const res = await ipcRenderer.invoke('extract-image-text', image.filepath)
    if (res?.ok) {
      ElMessageBox.alert(
        h('pre', { style: 'white-space: pre-wrap; text-align: left; max-height: 50vh; overflow: auto; margin: 0' }, res.text || t('c.ocrEmpty')),
        t('m.extractImageText'),
        { confirmButtonText: t('c.close'), showClose: true }
      )
    } else {
      printMessage('error', res?.error || t('c.ocrFailed'))
    }
  } catch (e) {
    printMessage('error', t('c.ocrFailed') + ':' + (e?.message || ''))
  } finally {
    extractingImageText.value = false
  }
}

// 尺寸变化(窗口 / 侧栏 / 缩放)时,让所有模式重新算一遍尺寸
const updateImageSize = () => { viewportTick.value += 1 }

const handleSidebarChange = (val) => {
  showViewerSide.value = val
  localStorage.setItem('showViewerSide', val)
  if (val) {
    requestThumbnails()
    // 侧栏刚打开时补算一次当前页(高亮依赖 currentImageId,而它只在滚动时更新)
    nextTick(() => { try { getCurrentImageId() } catch (e) { /* 忽略 */ } })
  }
  nextTick(updateImageSize)
}

watch(showViewerSide, () => {
  nextTick(updateImageSize)
})

// 横向整排:图片陆续推入时,把「第一页」那一端钉住(否则视口会随着内容变宽漂走)
watch(() => viewerImageList.value.length, () => {
  applyHorizontalPin()
})

// ---------- 卷轴:边界判断(横向整排要区分左右) ----------
const scrollBox = () => drawerViewerBody.value
// 是否已经滚到「阅读终点」那一端
const isAtScrollEnd = (tolerance = 2) => {
  const el = scrollBox()
  if (!el) return false
  if (isScrollHorizontal.value) {
    const maxLeft = el.scrollWidth - el.clientWidth
    if (maxLeft <= tolerance) return true
    return isRtl.value ? el.scrollLeft <= tolerance : el.scrollLeft >= maxLeft - tolerance
  }
  const maxTop = el.scrollHeight - el.clientHeight
  if (maxTop <= tolerance) return true
  return el.scrollTop >= maxTop - tolerance
}
// 分页:图片被缩放放大到超出屏幕时,先把这一屏滚完再翻页
const pageScrollRemaining = (forward) => {
  const el = scrollBox()
  if (!el) return 0
  const dir = readingDirection.value
  if (dir === 'vertical') {
    return forward ? (el.scrollHeight - el.clientHeight - el.scrollTop) : el.scrollTop
  }
  if (dir === 'rtl') {
    return forward ? el.scrollLeft : (el.scrollWidth - el.clientWidth - el.scrollLeft)
  }
  return forward ? (el.scrollWidth - el.clientWidth - el.scrollLeft) : el.scrollLeft
}

// ---------- 滚轮 ----------
//   Ctrl+滚轮 = 全局缩放(所有模式生效,以鼠标位置为锚点)
//   卷轴      = 原生滚动;横向整排自己处理(右左时反向)
//   分页      = 按「方向」翻页(图片被放大时先滚完一屏再翻)
const handleBodyWheel = (event) => {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    zoomByWheel(event)
    return
  }
  if (imageStyleType.value === 'scroll') {
    if (isScrollHorizontal.value) {
      const el = scrollBox()
      if (!el) return
      const raw = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      const delta = raw * (event.deltaMode === 1 ? 16 : 1)
      if (!delta) return
      event.preventDefault()
      el.scrollLeft += isRtl.value ? -delta : delta
      pinHorizontalStart = false
      if (delta > 0 && isAtScrollEnd(4)) handleReachEnd()
      return
    }
    // 纵向卷轴:交给原生滚动(惯性滚动模块接管),只在到底后继续滚时触发「阅读完成后」
    if (event.deltaY > 0 && isAtScrollEnd(4)) handleReachEnd()
    return
  }
  // 分页
  const dir = readingDirection.value
  const delta = dir === 'vertical'
    ? event.deltaY
    : (event.deltaX || event.deltaY) * (dir === 'rtl' ? -1 : 1)
  if (!delta) return
  const forward = delta > 0
  if (pageScrollRemaining(forward) > 2) return // 图片被放大:先把这一屏滚完
  turnPage(forward ? 1 : -1)
  const el = scrollBox()
  if (el) { el.scrollTop = 0; el.scrollLeft = 0 }
}

const handleBodyScroll = _.debounce(() => {
  if (showThumbnail.value) return
  if (imageStyleType.value !== 'scroll') return
  if (showViewerSide.value) {
    const currentId = getCurrentImageId()
    if (currentId) scrollCurrentThumbnailIntoView(currentId)
  }
  // 滚到接近末尾就给一次「已到最后一页」提示(比等用户再滚一次可靠)
  if (isAtScrollEnd(8)) maybeTipLastPage()
}, 100)

const sidebarRef = ref(null)

// 当前页高亮:直接比较已算好的 currentImageId,不在渲染过程中遍历列表。
// 旧写法每渲染一个缩略图就调一次 getCurrentImageId()(内部 O(n) 遍历 + 反复读 clientWidth),
// 500 页的侧栏 = 25 万次迭代/次渲染;currentImageId 现在由滚动(debounce)更新。
const isCurrentImage = (id) => {
  if (imageStyleType.value === 'scroll') {
    return id === currentImageId.value
  } else if (imageStyleType.value === 'single') {
    return viewerImageList.value[currentImageIndex.value]?.id === id
  } else if (imageStyleType.value === 'double') {
    return viewerImageListDouble.value[currentImageIndex.value]?.page.some(page => page.id === id)
  }
  return false
}

// 分页(单页 / 双页)没有懒加载指令,进入新的一页时手动触发一次自动超分
const triggerAutoUpscaleForCurrentPage = () => {
  if (!setting.value.autoUpscale) return
  if (imageStyleType.value === 'scroll') return // 卷轴走 handleImageEnter
  const frames = imageStyleType.value === 'double' ? viewerImageListDouble.value : viewerImageList.value
  const current = frames[currentImageIndex.value]
  if (!current) return
  const pages = imageStyleType.value === 'double' ? (current.page || []) : [current]
  for (const image of pages) if (image) enqueueAutoUpscale(image)
}
watch(currentImageIndex, () => {
  triggerAutoUpscaleForCurrentPage()
  scrollCurrentThumbnailIntoView()
  // 翻到最后一页时给一次「已到最后一页」提示
  if (imageStyleType.value === 'scroll') return
  const frames = imageStyleType.value === 'double' ? viewerImageListDouble.value : viewerImageList.value
  if (frames.length && currentImageIndex.value >= frames.length - 1) maybeTipLastPage()
})

const scrollCurrentThumbnailIntoView = (id = null) => {
  nextTick(() => {
    const currentId = id || getCurrentImageId()
    if (showViewerSide.value && currentId && sidebarRef.value) {
      const thumbnailElement = document.getElementById(`thumb_${currentId}`)
      if (thumbnailElement) {
        thumbnailElement.scrollIntoView({ block: 'start' })
      }
    }
  })
}

// 懒加载状态:同一帧内的多次变化合并成一次提交。
// 旧写法 `loadedImages.value[id] = x` 每张图进出视口都会触发整棵列表组件 re-render
// (500 页 = 每次 diff 500 项);合并到 rAF 后,滚动时每帧最多一次。
const loadedImages = ref({})
const pendingImageState = new Map()
let imageStateRaf = null
const flushImageState = () => {
  imageStateRaf = null
  if (!pendingImageState.size) return
  const next = { ...loadedImages.value }
  for (const [id, val] of pendingImageState) next[id] = val
  pendingImageState.clear()
  loadedImages.value = next
}
const setImageLoaded = (id, val) => {
  if (loadedImages.value[id] === val) return
  pendingImageState.set(id, val)
  if (imageStateRaf == null) imageStateRaf = requestAnimationFrame(flushImageState)
}

// ---------- 自动超分放大(默认关闭) ----------
// 触发条件:图片的显示尺寸(物理像素)超过原始宽度 —— 也就是放大到会发糊的时候。
// 只做显示用:调用 upscale-image 时带 previewOnly(不落盘)+ skipFilter(自动超分的前提就是图被放大,不该被阈值拦掉)。
// 串行队列 + 队列上限,避免在 NAS 上把 CPU 打满(本地模型一张整页可能要几分钟)。
const autoUpscaleQueue = []
const autoUpscaledIds = new Set()
let autoUpscaleRunning = false

const needsAutoUpscale = (image) => {
  if (!setting.value.autoUpscale) return false
  if (!image || !image.width || !image.height) return false
  const style = returnImageStyle(image)
  if (!style || !style.width) return false
  const displayWidth = parseFloat(style.width)
  if (!displayWidth) return false
  const dpr = window.devicePixelRatio || 1
  return displayWidth * dpr > image.width * 1.05
}

const runAutoUpscaleQueue = async () => {
  if (autoUpscaleRunning) return
  autoUpscaleRunning = true
  try {
    while (autoUpscaleQueue.length) {
      const image = autoUpscaleQueue.shift()
      if (!image || !setting.value.autoUpscale) continue
      try {
        // 完全按「设置 → 功能 → 图片超分」里的模型 / 保存位置 / 过滤设置来执行:
        //   保存位置 = 替换原文件 → 会按设置备份成 .bak;同一文件夹 / 仅预览 也各按设置走。
        // 这里只额外带 skipFilter:能触发自动超分就说明这张图确实需要放大,不必再被阈值拦掉。
        const res = await ipcRenderer.invoke('upscale-image', image.filepath, { skipFilter: true })
        if (res && res.ok && !res.skipped && res.path) {
          // 静默替换:不弹任何提示,超分完立刻显示超分后的图(尺寸一并更新,排版跟着重算)
          if (res.width) image.width = res.width
          if (res.height) image.height = res.height
          // 网页版的 filepath 是 /api/file?path=... 的 URL,用磁盘路径覆盖它就再也加载不出来了
          // (桌面版 filepath 本来就是磁盘路径,替换原文件时路径也没变,只有「另存」才需要更新)
          if (!window.__WEB_MODE__) image.filepath = res.path
          // 无论哪种模式都换一个 URL 版本号:替换原文件后 URL 不变会命中缓存,页面看不到超分效果
          bumpImageVersion(image.id)
          frameStyleCache.clear()
          console.log('[auto-upscale]', image.id, res.width + 'x' + res.height)
        }
      } catch (e) { /* 单张失败不影响后面的:继续用原图 */ }
    }
  } finally {
    autoUpscaleRunning = false
  }
}

const enqueueAutoUpscale = (image) => {
  if (!image || autoUpscaledIds.has(image.id)) return
  if (!needsAutoUpscale(image)) return
  autoUpscaledIds.add(image.id)
  // 快速滚动时只保留最近的几张,避免排出一长队
  if (autoUpscaleQueue.length >= 3) autoUpscaleQueue.length = 0
  autoUpscaleQueue.push(image)
  runAutoUpscaleQueue()
}

const resetAutoUpscale = () => {
  autoUpscaleQueue.length = 0
  autoUpscaledIds.clear()
}

const handleImageEnter = (id) => {
  setImageLoaded(id, true)
  // 横向整排:图片真正渲染后宽度才算数,贴边期间跟着修正一次
  if (pinHorizontalStart) applyHorizontalPin()
  // 最后一页进入视口也算「到达最后一页」(兜底:不依赖滚动事件与索引判断)
  const last = viewerImageList.value[viewerImageList.value.length - 1]
  if (last && last.id === id) maybeTipLastPage()
  // 自动超分默认关闭:关闭时这里只做一次布尔判断,零开销
  if (setting.value.autoUpscale) {
    const image = viewerImageList.value.find(item => item.id === id)
    if (image) enqueueAutoUpscale(image)
  }
}

const handleImageLeave = (id) => {
  setImageLoaded(id, false)
}

defineExpose({
  drawerVisibleViewer,
  showThumbnail,
  currentImageIndex,
  viewerImageList,
  viewerImageListDouble,
  imageStyleType,
  insertEmptyPage,
  insertEmptyPageIndex,
  switchThumbnail,
  saveReadingProgress,
  viewManga,
  handleStopReadManga,
  isComicReadDisplay,
  closeComicReader,
  // 键盘转发(App.vue 的全局快捷键先问阅读器要不要处理)与分页/缩放/模式接口
  handleViewerKey,
  turnPage,
  viewerZoom,
  setViewerZoom,
  toggleScrollMode,
  toggleSingleDouble,
  cycleReadingDirection,
  cycleImageStyleFit,
  isDoubleActive,
  readingDirection,
  isScrollHorizontal,
  pinHorizontal,
  applyHorizontalPin,
  showViewerSide,
  toggleSidebar,
  clickedThumbId,
  // 便于自动化验证
  isPaging,
  isZoomedIn,
  toolbarClickLocked,
})
</script>

<style lang="stylus">
.viewer-drawer
  .el-drawer__body
    padding: 0
    overflow: hidden

.viewer-drawer-modal
  background-color: var(--el-mask-color-extra-light)

.viewer-container
  display: flex
  width: 100%
  height: 100%

.drawer-viewer-side
  width: 220px
  height: 100%
  overflow-y: auto
  border-right: 1px solid var(--el-border-color-lighter)
  padding: 10px
  box-sizing: border-box
  background-color: var(--el-fill-color-light)
  flex-shrink: 0
  z-index: 10

  .sidebar-thumbnail-content
    display: flex
    flex-direction: column
    align-items: center
    // 间距由 设置 → 内置阅读器 → 缩略图间距 控制(默认 0 = 紧贴)
    gap: var(--viewer-thumbnail-gap, 0px)

  .sidebar-thumbnail-item
    display: flex
    flex-direction: column
    align-items: center
    cursor: pointer

    &.sidebar-thumbnail-active
      .sidebar-thumbnail
        border: 2px solid var(--el-color-primary)
        box-shadow: 0 0 5px var(--el-color-primary-light-5)

    // 刚点过:缩一下 + 高亮,让「点到了」看得见
    &.sidebar-thumbnail-clicked
      .sidebar-thumbnail
        border-color: var(--el-color-primary)
        box-shadow: 0 0 12px var(--el-color-primary)
        transform: scale(0.94)

  .sidebar-thumbnail
    width: 100%
    max-width: 200px
    object-fit: contain
    border-radius: 4px
    border: 2px solid transparent
    transition: all 0.2s

    &:hover
      border-color: var(--el-color-primary)

  .sidebar-thumbnail-page
    margin-top: 3px
    font-size: 11px
    color: var(--el-text-color-secondary)

.drawer-viewer-body
  flex: 1
  width: 100%
  height: 100%
  overflow: auto
  transition: width 0.3s
  overscroll-behavior: contain
  -webkit-overflow-scrolling: touch

// 横向整排(卷轴 + 左右/右左):容器只做横向滚动
.drawer-viewer-body.viewer-horizontal-scroll
  overflow-x: auto
  overflow-y: hidden

// 分页(单页 / 双页):没放大时内容正好一屏,不该出现滚动条;放大后才允许滚动
.drawer-viewer-body.viewer-paged
  overflow: hidden

.drawer-viewer-body.viewer-paged.viewer-zoomed
  overflow: auto

// 分页:一屏一张 / 两张。图片用 auto margin 居中,放大超出屏幕时也不会被顶到滚动区外
.viewer-paging
  display: flex
  flex-direction: column
  min-height: 100%
  min-width: 100%

// 退出按钮:固定在右上角,但与设置栏同步显示/隐藏(一起出现、一起消失)
.viewer-exit-button
  position: absolute
  top: 8px
  right: 12px
  z-index: 10000
  color: var(--el-text-color-primary) !important
  opacity: 0
  pointer-events: none
  transition: opacity .25s ease, color .2s ease
.viewer-exit-button-visible
  opacity: .8
  pointer-events: auto
  .el-icon
    width: 26px
    svg
      height: 26px
      width: 26px
.viewer-exit-button:hover
  opacity: 1
  color: var(--el-color-primary) !important

// 阅读器设置栏:一排按钮(点击循环切换),颜色全部取自主题变量 ——
// 浅色/深色/自定义主题下都由 Element Plus 的 CSS 变量决定,不再硬编码颜色。
// 显示与否由 JS 控制(顶部 1/22 悬停、点击中央 1/4 再点收起、图钉固定)。
.viewer-toolbar
  position: absolute
  top: 8px
  left: 8px
  right: auto
  z-index: 9999
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 4px
  max-width: calc(100vw - 96px)
  padding: 4px 8px
  border-radius: 10px
  background: var(--el-bg-color-overlay)
  border: 1px solid var(--el-border-color-lighter)
  box-shadow: var(--el-box-shadow-light)
  color: var(--el-text-color-primary)
  transform: translateY(-180%)
  opacity: 0
  pointer-events: none
  transition: transform .25s ease, opacity .25s ease
.viewer-toolbar-visible
  transform: translateY(0)
  opacity: 1
  pointer-events: auto
.viewer-toolbar-btn
  margin: 0 !important
  color: var(--el-text-color-primary) !important
  border-color: var(--el-border-color-lighter) !important
  background: transparent !important
.viewer-toolbar-btn:hover
  color: var(--el-color-primary) !important
  border-color: var(--el-color-primary) !important
// 按钮分组之间的竖线(适应窗口 | 缩放)
.viewer-toolbar-divider
  width: 1px
  height: 16px
  margin: 0 4px
  background: var(--el-border-color)
.viewer-toolbar-group
  display: inline-flex
  align-items: center
  gap: 2px
.viewer-toolbar-value
  font-size: 12px
  min-width: 40px
  text-align: center
  color: var(--el-text-color-secondary)

// ComicRead 内的面板:相对 #ComicRead(fixed 全屏)左上角定位
.comic-read-mode-setting
  position: absolute
  top: 8px
  left: 8px
  width: 100px
  z-index: 2147483647
.viewer-mode, .viewer-image-fit, .viewer-thumbnail-select, .viewer-image-width, .viewer-sidebar-select
  width: 100px
  margin: 4px 8px

.image-frame
  display: flex
  flex-direction: column
  // 图片间距(设置 → 内置阅读器 → 图片间距,默认 0 = 紧贴)
  margin-bottom: var(--viewer-image-gap, 0px)
  // 这里刻意不写 align-items: center —— 图片比屏幕宽时 center 会把左侧顶到滚动区外(滚不回来),
  // 改用子项 margin: auto:有剩余空间就居中,没有就贴左上,溢出方向始终能滚到。
  .viewer-image-frame-scroll
    position: relative
    // 浏览器原生虚拟化:屏幕外页面跳过布局与绘制(高度由 JS 精确设置,滚动条不会跳)
    content-visibility: auto
    contain-intrinsic-size: auto 1200px
  .viewer-image-frame
    margin: auto
    .viewer-image
      user-select: none
    .viewer-image-bar
      position: absolute
      height: 100%
      width: 6px
      top: 0
      right: -3px
      cursor: ew-resize
    .viewer-image-bar:hover
      background-color: var(--el-color-primary)
  // 分页双页:两张并排;「右左」时第一页排到右边(视觉 N+1, N)
  .viewer-image-frame-double
    display: flex
    flex-direction: row
    align-items: flex-start
  .viewer-image-frame-double.viewer-image-frame-rtl
    flex-direction: row-reverse
  // 卷轴并排两页:整体居中,图片超宽时左右都还能滚到
  .viewer-image-row
    display: flex
    flex-direction: row
    align-items: flex-start
    gap: var(--viewer-image-gap, 0px)
    .viewer-image-frame
      margin: 0
    .viewer-image-frame:first-child
      margin-left: auto
    .viewer-image-frame:last-child
      margin-right: auto
  .viewer-image-page
    line-height: 18px
    margin-top: 3px
    margin-bottom: 7px
  .viewer-image-preload
    display: none

// 横向整排:所有页排成一行,横向连续滚动(单页 / 双页在横向时都是整排)
.viewer-horizontal-row
  display: inline-flex
  flex-direction: row
  flex-wrap: nowrap
  align-items: flex-start
  min-width: 100%
  height: 100%
.viewer-horizontal-row-rtl
  flex-direction: row-reverse
.viewer-horizontal-item
  flex: 0 0 auto
  display: flex
  flex-direction: column
  align-items: center
  margin-right: var(--viewer-image-gap, 0px)
.viewer-horizontal-item .viewer-image
  user-select: none

.next-manga-button
  opacity: 0
  pointer-events: none
  position: fixed
  bottom: 1em
  left: calc(50vw - 154px)
  transition: opacity 0.25s ease
  .el-button
    --el-button-bg-color: #f0f9eb66
// 鼠标移到画面底部才出现(隐藏时 0%,显示时 100%)
.next-manga-button-visible
  opacity: 1
  pointer-events: auto

.drawer-thumbnail-content
  margin: 16px
  height: 100vh
  text-align: left
  .viewer-thumbnail-item
    display: inline-flex
    flex-direction: column
    align-items: center
    // 不要固定 padding:缩略图之间的距离完全由 设置 → 缩略图间距 决定(0 = 紧贴)
    padding: 0
    border: 2px solid transparent
    border-radius: 6px
    transition: all 0.2s
    cursor: pointer
  .viewer-thumbnail-item-active
    border-color: var(--el-color-primary)
    background: var(--el-fill-color-light)
  .viewer-thumbnail-item-clicked
    border-color: var(--el-color-primary)
    transform: scale(0.95)
.viewer-thunmnail-page
  text-align: center
  font-size: 11px

.viewer-image-placeholder
  display: flex
  align-items: center
  justify-content: center
  background-color: var(--el-fill-color-light)
  .el-icon
    font-size: 32px
    color: var(--el-text-color-placeholder)
</style>