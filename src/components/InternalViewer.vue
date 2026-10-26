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
        <!-- 文字模式:侧栏换成章节目录 -->
        <div class="sidebar-thumbnail-content novel-toc" v-if="isNovelMode">
          <div class="novel-toc-close" @click="handleSidebarChange(false)">{{ $t('m.novelCloseToc') }}</div>
          <div v-for="(c, i) in novelChapters" :key="i" class="novel-toc-item" @click="novelJumpTo(c)">{{ c.title }}</div>
          <div v-if="!novelChapters.length" class="novel-toc-item">{{ $t('m.novelNoToc') }}</div>
        </div>
        <div class="sidebar-thumbnail-content" v-else>
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
              v-if="image.thumbnailPath"
              :src="`${image.thumbnailPath}?id=${image.id}`"
              class="sidebar-thumbnail"
              loading="lazy"
              @click="handleClickThumbnail(image.id)"
              @contextmenu="onMangaImageContextMenu($event, image)"
            />
            <!-- 在线页还没解析出来先占个位,别让缩略图条缺一块 -->
            <div v-else class="sidebar-thumbnail sidebar-thumbnail-wait">
              <el-icon class="is-loading"><Loading /></el-icon>
            </div>
            <div class="sidebar-thumbnail-page" v-if="!setting.hidePageNumber">{{index + 1}} / {{thumbnailList.length}}</div>
          </div>
        </div>
      </div>
      <div class="drawer-viewer-body"
        :class="{
          'viewer-horizontal-scroll': isHorizontalScroll && !showThumbnail,
          'viewer-paged': isPaging && !showThumbnail,
          'viewer-zoomed': isZoomedIn && !showThumbnail,
        }"
        ref="drawerViewerBody"
        @wheel.stop="handleBodyWheel"
        @scroll="handleBodyScroll"
        @mousemove="handleViewerMouseMove"
        @mouseleave="nextMangaButtonsVisible = false"
      >
                  <!-- 文字模式:txt / 没有图片的 epub -->
          <div class="drawer-novel-content" v-if="!showThumbnail && isNovelMode" ref="novelScrollRef"
            :class="{ 'novel-paged': novelPaged, 'novel-scrollv': !novelPaged && novelDirection === 'vertical', 'novel-dir-ltr': !novelPaged && novelDirection === 'ltr', 'novel-dir-rtl': !novelPaged && novelDirection === 'rtl' }"
            :style="novelBoxStyle"
            @wheel="onNovelWheel" @keydown="onNovelKeydown" @click="onNovelClick"
            @scroll.passive="onNovelScroll"
            @pointerdown="onNovelPointerDown" @pointermove="onNovelPointerMove" @pointerup="onNovelPointerUp" @pointercancel="onNovelPointerUp" @pointerleave="onNovelPointerUp"
            @scroll="scheduleNovelProgress" tabindex="0">
            <!-- 卷轴(连续滚动):一整块流式内容,单列;方向由 writing-mode / maxWidth 控制 -->
            <div v-if="!novelPaged" class="novel-body" :style="novelStyle">
              <template v-for="(blk, i) in novelBlocks" :key="i">
                <div v-if="blk.kind === 'chapter'" :id="'nb-' + i" class="novel-chapter">{{ blk.title }}</div>
                <h4 v-else-if="blk.kind === 'heading'" :id="'nb-' + i" class="novel-heading">{{ blk.text }}</h4>
                <p v-else-if="blk.kind === 'text'" :id="'nb-' + i" class="novel-para">{{ blk.text }}</p>
                <img v-else-if="blk.kind === 'image'" :id="'nb-' + i" class="novel-image" :src="novelImageSrc(blk)" loading="lazy" />
              </template>
            </div>
            <!-- 分页:每个「页窗口」都是独立的一屏,整块内容按页高纵向平移。
                 不再使用「横向多列 + scrollLeft」,从结构上不存在残列/切割。 -->
            <div v-else class="novel-page-pair" :class="{ 'novel-pair-rtl': novelDirection === 'rtl' }">
              <!-- ⚠️ 不要用 v-show 隐藏第二页窗口:display:none 会让第一页的 flex:1
                   扩成整屏宽,正文重新换行,页高/页数全部对不上(最后一页底部会被裁)。
                   没有第二页时保留空窗口占位,宽度不变,正文不重排。 -->
              <div v-for="w in (novelTwoCol ? 2 : 1)" :key="w" class="novel-page-window">
                <div v-if="(novelPageIndex + w - 1) < novelPageCount" class="novel-page-clip" :style="novelClipStyle">
                  <!-- 再套一层精确页高的裁剪窗:只裁在「整行页高」处。
                       直接让 .novel-page-clip 裁的话,底部 padding 区仍会露出下一行的上半截。 -->
                  <div class="novel-page-viewport" :style="{ height: novelPageHeight + 'px' }">
                    <div class="novel-body novel-body-paged" :style="novelBodyStyle(w - 1)">
                    <template v-for="(blk, i) in novelBlocks" :key="i">
                      <div v-if="blk.kind === 'chapter'" :id="'nb-' + i" class="novel-chapter">{{ blk.title }}</div>
                      <h4 v-else-if="blk.kind === 'heading'" :id="'nb-' + i" class="novel-heading">{{ blk.text }}</h4>
                      <p v-else-if="blk.kind === 'text'" :id="'nb-' + i" class="novel-para">{{ blk.text }}</p>
                      <img v-else-if="blk.kind === 'image'" :id="'nb-' + i" class="novel-image" :src="novelImageSrc(blk)" loading="lazy" />
                    </template>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
<div class="drawer-image-content"
          v-if="!showThumbnail && !isNovelMode"
          @click="handleViewerAreaClick"
          @mousedown="onImagePanStart"
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
                  v-if="(loadedImages[image.id] || (image.online && image.filepath)) && !viewerImageFailed[image.id] && !image.failed"
                  :src="imageSrc(image)"
                  class="viewer-image" draggable="false"
                    @load="onViewerImageLoad(image)" @error="onViewerImageError(image)"
                  :style="{height: frameStyle(image, 'horizontal').height}"
                  @mousedown="onImagePanStart"
                  @dragstart.prevent
                  @contextmenu="onMangaImageContextMenu($event, image)"
                />
                <ViewerPagePlaceholder
                  v-else
                  :style="{height: frameStyle(image, 'horizontal').height}"
                  :state="placeholderState(image)"
                  :progress="imageLoadProgress(image)"
                  :index="index"
                  :total="viewerImageList.length"
                  @retry="retryOnlinePage(image)"
                />
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
                    v-if="(loadedImages[image.id] || (image.online && image.filepath)) && !viewerImageFailed[image.id] && !image.failed"
                    :src="imageSrc(image)"
                    class="viewer-image" draggable="false"
                    @load="onViewerImageLoad(image)" @error="onViewerImageError(image)"
                    :style="{height: frameStyle(image, 'scrollSingle').height}"
                    @mousedown="onImagePanStart"
                    @dragstart.prevent
                    @contextmenu="onMangaImageContextMenu($event, image)"
                  />
                  <ViewerPagePlaceholder
                    v-else
                    :style="{height: frameStyle(image, 'scrollSingle').height}"
                    :state="placeholderState(image)"
                    :progress="imageLoadProgress(image)"
                    :index="index"
                    :total="viewerImageList.length"
                    @retry="retryOnlinePage(image)"
                  />
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
                      v-if="(loadedImages[image.id] || (image.online && image.filepath)) && !viewerImageFailed[image.id] && !image.failed"
                      :src="imageSrc(image)"
                      class="viewer-image" draggable="false"
                    @load="onViewerImageLoad(image)" @error="onViewerImageError(image)"
                      :style="{height: frameStyle(image, 'scrollDouble').height}"
                      @mousedown="onImagePanStart"
                      @dragstart.prevent
                      @contextmenu="onMangaImageContextMenu($event, image)"
                    />
                    <ViewerPagePlaceholder
                      v-else
                      :style="{height: frameStyle(image, 'scrollDouble').height}"
                      :state="placeholderState(image)"
                      :progress="imageLoadProgress(image)"
                      :index="viewerImageList.findIndex(im => im.id === image.id)"
                      :total="viewerImageList.length"
                      @retry="retryOnlinePage(image)"
                    />
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
                <ViewerPagePlaceholder
                  v-if="viewerImageList[currentImageIndex] && viewerImageList[currentImageIndex].online && (!viewerImageList[currentImageIndex].filepath || viewerImageList[currentImageIndex].failed)"
                  class="viewer-page-placeholder-abs"
                  :state="placeholderState(viewerImageList[currentImageIndex])"
                  :progress="imageLoadProgress(viewerImageList[currentImageIndex])"
                  :thumb="(viewerImageList[currentImageIndex] || {}).thumb || ''"
                  :index="currentImageIndex"
                  :total="viewerImageList.length"
                  @retry="retryOnlinePage(viewerImageList[currentImageIndex])"
                />
                <img
                  :key="viewerImageList[currentImageIndex]?.id"
                  :src="imageSrc(viewerImageList[currentImageIndex])"
                  class="viewer-image" draggable="false"
                  @load="onViewerImageLoad(viewerImageList[currentImageIndex])" @error="onViewerImageError(viewerImageList[currentImageIndex])"
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
                <!-- 每一页各自占一格:解析好的出图,没解析好的出占位(转圈)。
                     以前占位是 position:absolute 全帧覆盖,双页模式下两个转圈叠在同一格,
                     只能看到一张进度条(用户反馈的 bug);现在按页渲染,左右各转各的圈 -->
                <template v-for="image in (viewerImageListDouble[currentImageIndex]?.page || [])" :key="image.id">
                  <div
                    v-if="image.online && (!image.filepath || image.failed)"
                    class="viewer-page-slot"
                    :style="{ height: frameStyle(image, 'double').height, aspectRatio: (image.width || 1200) + ' / ' + (image.height || 1700) }"
                  >
                    <ViewerPagePlaceholder
                      :state="placeholderState(image)"
                      :progress="imageLoadProgress(image)"
                      :index="viewerImageList.findIndex(im => im.id === image.id)"
                      :total="viewerImageList.length"
                      @retry="retryOnlinePage(image)"
                    />
                  </div>
                  <img
                    v-else
                    :src="imageSrc(image)"
                    class="viewer-image" draggable="false"
                    @load="onViewerImageLoad(image)" @error="onViewerImageError(image)"
                    :style="{height: frameStyle(image, 'double').height}"
                    @mousedown="onImagePanStart"
                    @dragstart.prevent
                    @contextmenu="onMangaImageContextMenu($event, image)"
                  />
                </template>
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
                v-if="image.thumbnailPath"
                :src="`${image.thumbnailPath}?id=${image.id}`"
                class="viewer-thumbnail"
                :style="{width: thumbnailWidth}"
                loading="lazy"
                @click="handleClickThumbnail(image.id)"
                @contextmenu="onMangaImageContextMenu($event, image)"
              />
              <div v-else class="viewer-thumbnail viewer-thumbnail-wait" :style="{width: thumbnailWidth}">
                <el-icon class="is-loading"><Loading /></el-icon>
              </div>
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
            <!-- 文字排版:左边按钮循环切换,右边输入框可直接输入 / 下拉选择 -->
            <span v-if="id === 'novelFont'" class="viewer-toolbar-group">
              <el-button class="viewer-toolbar-btn" size="small" :title="viewerToolbarTitle(id)" @click="viewerToolbarClick(id)">{{ viewerToolbarText(id) }}</el-button>
              <el-select class="viewer-toolbar-select" size="small" filterable allow-create default-first-option
                :model-value="novelFont" :title="viewerToolbarTitle(id)" @change="applyNovelFont">
                <el-option v-for="opt in NOVEL_FONT_OPTIONS" :key="opt.id" :label="$t(opt.labelKey)" :value="opt.id"></el-option>
              </el-select>
            </span>
            <span v-else-if="id === 'novelLineHeight'" class="viewer-toolbar-group">
              <el-button class="viewer-toolbar-btn" size="small" :title="viewerToolbarTitle(id)" @click="viewerToolbarClick(id)">{{ viewerToolbarText(id) }}</el-button>
              <el-input class="viewer-toolbar-input" size="small" :model-value="String(novelLineHeight)"
                :title="viewerToolbarTitle(id)" @change="applyNovelLineHeight"></el-input>
            </span>
            <span v-else-if="id === 'novelLetterSpacing'" class="viewer-toolbar-group">
              <el-button class="viewer-toolbar-btn" size="small" :title="viewerToolbarTitle(id)" @click="viewerToolbarClick(id)">{{ viewerToolbarText(id) }}</el-button>
              <el-input class="viewer-toolbar-input" size="small" :model-value="String(novelLetterSpacing)"
                :title="viewerToolbarTitle(id)" @change="applyNovelLetterSpacing"></el-input>
            </span>
            <!-- 放大 / 缩小是一个整体(设置里也是一项) -->
            <span v-else-if="id === 'zoom'" class="viewer-toolbar-group">
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
      <!-- 加载遮罩(可关闭):在线解析画廊页面 / 本地取图片列表;失败或卡住时点「关闭」退出 -->
      <div class="viewer-loading-overlay" v-if="viewerLoadingVisible">
        <el-icon class="is-loading" :size="34"><Loading /></el-icon>
        <div class="viewer-loading-overlay-text">{{ viewerLoadingText }}</div>
        <el-button class="viewer-loading-overlay-close" type="primary" plain @click="cancelViewerLoading">{{ $t('c.close') }}</el-button>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { ehImageSrc } from '../ehOnline.js'
import ViewerPagePlaceholder from './ViewerPagePlaceholder.vue'
import ContextMenu from '@imengyu/vue3-context-menu'
import { attachInertiaScroll } from '../inertia-scroll.js'

import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import { isContextMenuItemEnabled, sortContextMenuItems, insertLocalReadRecord, customFontStyles } from '../utils.js'

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
  // EH在线:某一页的下载(交给 App 走 eh-download-page)
  'downloadPage',
  'toNextManga',
  'toNextMangaRandom',
  'updateOptions',
  'updateWindowTitle',
  'rescanBook',
  'openBookDetail',
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
if (viewerHeartbeat) { clearInterval(viewerHeartbeat); viewerHeartbeat = null }
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
const DEFAULT_VIEWER_TOOLBAR = ['scroll', 'singleDouble', 'direction', 'fit', 'zoom', 'novelFont', 'novelLineHeight', 'novelLetterSpacing', 'thumbnail', 'sidebar', 'pin']
// 只在文字阅读器出现的按钮(图片模式直接过滤掉)
const NOVEL_ONLY_TOOLBAR_ITEMS = ['novelFont', 'novelLineHeight', 'novelLetterSpacing']
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
  const visible = order.filter(id => (shown === null || shown.includes(id))
    && !(showThumbnail.value && HIDDEN_IN_THUMBNAIL.includes(id)))
  // 文字模式:thumbnail 与 sidebar 是两个完全重复的「章节目录」按钮 → 去掉 thumbnail(默认顺序里它在前);
  // 万一配置里只勾了 thumbnail(没有 sidebar),就保留它,保证文字模式仍有目录入口。
  // 字体 / 行距 / 字间距只在文字阅读器里才有意义,图片模式直接不显示
  const filtered = isNovelMode.value ? visible : visible.filter(id => !NOVEL_ONLY_TOOLBAR_ITEMS.includes(id))
  // 文字模式:thumbnail 与 sidebar 是两个完全重复的「章节目录」按钮 → 去掉 thumbnail
  if (isNovelMode.value && filtered.includes('sidebar')) return filtered.filter(id => id !== 'thumbnail')
  return filtered
})
// 分组竖线:适应 / 缩放 之前各一条
const viewerToolbarDividerBefore = (id) => id === 'fit' || id === 'zoom' || id === 'novelFont'
// 文字模式方向与漫画同一套:上下 / 左右 / 右左
const novelDirectionLabel = computed(() => t({ vertical: 'm.dirVertical', ltr: 'm.dirLtr', rtl: 'm.dirRtl' }[novelDirection.value] || 'm.dirVertical'))
// 文字模式:同一排按钮,标题与按钮文字换成语义相符的说法
const novelToolbarTitle = (id) => {
  if (!isNovelMode.value) return ''
  return {
    scroll: t('m.scrollModeLabel') + ' / ' + t('m.pagingModeLabel'),
    singleDouble: t('m.novelOnePage') + ' / ' + t('m.novelTwoPage'),
    direction: t('m.dirVertical') + ' / ' + t('m.dirLtr') + ' / ' + t('m.dirRtl'),
    fit: t('m.novelWidthTip', { n: novelWidthPercent.value }),
    novelFont: t('m.novelFontTip', { n: novelFontLabel.value }),
    novelLineHeight: t('m.novelLineHeightTip', { n: novelLineHeight.value }),
    novelLetterSpacing: t('m.novelLetterSpacingTip', { n: novelLetterSpacing.value }),
    thumbnail: t('m.novelToc'),
    sidebar: showViewerSide.value ? t('m.novelHideToc') : t('m.novelShowToc'),
    pin: viewerToolbarPinned.value ? t('m.unpinToolbar') : t('m.pinToolbar'),
  }[id] || ''
}
const novelToolbarText = (id) => {
  if (!isNovelMode.value) return ''
  return {
    scroll: novelPaged.value ? t('m.pagingModeLabel') : t('m.scrollModeLabel'),
    singleDouble: novelTwoCol.value ? t('m.novelTwoPage') : t('m.novelOnePage'),
    direction: novelDirectionLabel.value,
    fit: t('m.novelWidthShort') + ' ' + novelWidthPercent.value + '%',
    novelFont: t('m.novelFont'),
    // 只显示名字:数值由右边的输入框显示,避免「行距 1.9」又跟一个 1.9
    novelLineHeight: t('m.novelLineHeight'),
    novelLetterSpacing: t('m.novelLetterSpacing'),
    // 目录与图钉只要图标:状态看图标就够,按钮文字会挤占工具栏;说明留在 title 悬浮提示里
    thumbnail: '',
    sidebar: '',
    pin: '',
  }[id] || ''
}
const viewerToolbarTitle = (id) => novelToolbarTitle(id) || ({
  scroll: t('m.scrolling'),
  singleDouble: t('m.singlePage') + ' / ' + t('m.doublePage'),
  direction: t('m.dirTip'),
  fit: t('m.fitTip'),
  thumbnail: t('m.thumbnail'),
  sidebar: showViewerSide.value ? t('m.hideSidebar') : t('m.showSidebar'),
  pin: viewerToolbarPinned.value ? t('m.unpinToolbar') : t('m.pinToolbar'),
}[id] || '')
const viewerToolbarText = (id) => novelToolbarText(id) || ({
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
  // 文字模式:沿用同一排按钮,只把语义换成文字相关(设计稿)
  //   fit → 正文宽度占比 / singleDouble → 单页·双页 / direction → 上下·左右·右左 / scroll → 卷轴·分页
  //   sidebar、thumbnail → 章节目录
  if (isNovelMode.value) {
    const novelActions = {
      scroll: toggleNovelPaged,
      singleDouble: toggleNovelTwoCol,
      direction: cycleNovelDirection,
      fit: cycleNovelWidth,
      novelFont: cycleNovelFont,
      novelLineHeight: cycleNovelLineHeight,
      novelLetterSpacing: cycleNovelLetterSpacing,
      sidebar: () => { showThumbnail.value = false; toggleSidebar() },
      thumbnail: () => { showThumbnail.value = false; toggleSidebar() },
      pin: toggleToolbarPin,
    }
    if (novelActions[id]) { novelActions[id](); return }
  }
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
  // 文字模式:同一对放大/缩小按钮改用来调字号
  if (isNovelMode.value) { adjustNovelFont(dir); return }
  setViewerZoom(viewerZoom.value + dir * ZOOM_STEP)
  showViewerTip(t('m.tipZoom', { n: Math.round(viewerZoom.value * 100) }))
}
// Ctrl+滚轮:以鼠标位置为锚点缩放,缩放后指针下的内容尽量保持不动
const zoomByWheel = (event) => {
  // 文字模式:Ctrl+滚轮同样用来调字号
  if (isNovelMode.value) { adjustNovelFont(event.deltaY < 0 ? 1 : -1); return }
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
  if (action === 'detail') {
    // 交给 App:关掉阅读器并打开这本书的详情
    emit('openBookDetail')
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
  // t= 这一页的 id:主进程据此把下载进度回推给这一页的占位环
  return base + sep + 'id=' + image.id + '&t=' + encodeURIComponent(image.id) + (ver ? '&v=' + ver : '')
}

const viewerZoomLabel = computed(() => isNovelMode.value ? String(novelFontSize.value) : Math.round(viewerZoom.value * 100) + '%')
// 分页模式(单页 / 双页):用于关闭「没放大时的滚动条」
const isPaging = computed(() => imageStyleType.value === 'single' || imageStyleType.value === 'double')
// 是否已放大(>100%):放大后才允许分页容器滚动
const isZoomedIn = computed(() => viewerZoom.value > 1.001)
const currentImageId = ref('')
const insertEmptyPage = ref(true)
const insertEmptyPageIndex = ref(0)
const viewerImageList = ref([])
// ── 文字模式(txt 小说 / 图文 epub)──
// 内容按「块」渲染:chapter 章节标题 / text 段落 / image 插图(留在它原本的位置)。
// 工具栏沿用原来那一排按钮,只是行为随内容类型变化(见 viewerToolbarClick / zoomViewerImage)。
const isNovelMode = ref(false)
const novelBlocks = ref([])
const novelChapters = ref([])
const novelKind = ref('')
const novelCharCount = ref(0)
const novelFontSize = ref(Number(localStorage.getItem('emm-novel-font-size')) || 19)
// 字体 / 行距 / 字间距:阅读器工具栏的「字体」「行距」「间距」三个按钮循环切换
// 字体选项:软件自带的像素字体(带字体文件,不依赖本机) + 常用系统字体族;
// 阅读器工具栏的下拉支持直接手输任意字体名,所以这里只是「常用项」
// 阅读器可选字体 = 软件已有的那份字体列表(与「设置 → 自定义主题 → 字体样式」一致),
// 末尾再补上软件自带的像素字体。
const DEFAULT_NOVEL_FONT_STACK = "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif"
const NOVEL_FONT_OPTIONS = [
  ...customFontStyles.map(f => ({
    id: f.labelKey,
    labelKey: f.labelKey,
    stack: f.value || DEFAULT_NOVEL_FONT_STACK,
  })),
  { id: 'novelFontPixel', labelKey: 'm.novelFontPixel', stack: "var(--emm-pixel-font, 'EmmPixel'), 'EmmPixelHant', ui-monospace, monospace" },
  { id: 'novelFontPixelHant', labelKey: 'm.novelFontPixelHant', stack: "'EmmPixelHant', 'EmmPixel', ui-monospace, monospace" },
]
const novelFont = ref(localStorage.getItem('emm-novel-font') || 'serif')
const novelFontLabel = computed(() => {
  const f = NOVEL_FONT_OPTIONS.find(x => x.id === novelFont.value)
  return f ? t(f.labelKey) : String(novelFont.value)
})
const novelFontStack = computed(() => {
  const f = NOVEL_FONT_OPTIONS.find(x => x.id === novelFont.value)
  if (f) return f.stack
  // 兼容早期版本存下的短 id
  const legacy = {
    serif: 'serif', sans: 'sans-serif', kai: "'Kaiti SC', 'KaiTi', serif",
    mono: 'ui-monospace, monospace',
    pixel: "var(--emm-pixel-font, 'EmmPixel'), 'EmmPixelHant', ui-monospace, monospace",
    pixelHant: "'EmmPixelHant', 'EmmPixel', ui-monospace, monospace",
  }[novelFont.value]
  if (legacy) return legacy
  // 手输的字体名:去掉引号/反斜杠后当字体族用
  return "'" + String(novelFont.value).replace(/['"\\]/g, '') + "', serif"
})
const NOVEL_LINE_HEIGHTS = [1.5, 1.8, 2.1, 2.4]
const novelLineHeight = ref(Number(localStorage.getItem('emm-novel-line-height')) || 1.9)
const NOVEL_LETTER_SPACINGS = [0, 0.03, 0.08, 0.15]
const novelLetterSpacing = ref(Number(localStorage.getItem('emm-novel-letter-spacing')) || 0.02)
const cycleNovelFont = () => {
  const i = NOVEL_FONT_OPTIONS.findIndex(f => f.id === novelFont.value)
  const next = NOVEL_FONT_OPTIONS[(i + 1) % NOVEL_FONT_OPTIONS.length]
  novelFont.value = next.id
  localStorage.setItem('emm-novel-font', next.id)
  showViewerTip(t('m.novelFontTip', { n: t(next.labelKey) }))
  nextTick(() => { novelMeasure() })
}
const cycleNovelLineHeight = () => {
  const i = NOVEL_LINE_HEIGHTS.indexOf(Number(novelLineHeight.value.toFixed(2)))
  const next = NOVEL_LINE_HEIGHTS[(i + 1) % NOVEL_LINE_HEIGHTS.length]
  novelLineHeight.value = next
  localStorage.setItem('emm-novel-line-height', String(next))
  showViewerTip(t('m.novelLineHeightTip', { n: next }))
  nextTick(() => { novelMeasure() })
}
const cycleNovelLetterSpacing = () => {
  const i = NOVEL_LETTER_SPACINGS.indexOf(Number(novelLetterSpacing.value.toFixed(2)))
  const next = NOVEL_LETTER_SPACINGS[(i + 1) % NOVEL_LETTER_SPACINGS.length]
  novelLetterSpacing.value = next
  localStorage.setItem('emm-novel-letter-spacing', String(next))
  showViewerTip(t('m.novelLetterSpacingTip', { n: next }))
  nextTick(() => { novelMeasure() })
}
// ── 下拉/手输的直接应用(工具栏「字体 / 行距 / 间距」右侧的输入框) ──
const applyNovelFont = (v) => {
  const val = String(v == null ? '' : v).trim()
  if (!val) return
  novelFont.value = val
  localStorage.setItem('emm-novel-font', val)
  nextTick(() => { novelMeasure() })
}
const applyNovelLineHeight = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return
  const val = Math.min(3.5, Math.max(1, n))
  novelLineHeight.value = val
  localStorage.setItem('emm-novel-line-height', String(val))
  nextTick(() => { novelMeasure() })
}
const applyNovelLetterSpacing = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return
  const val = Math.min(0.5, Math.max(0, n))
  novelLetterSpacing.value = val
  localStorage.setItem('emm-novel-letter-spacing', String(val))
  nextTick(() => { novelMeasure() })
}
const NOVEL_WIDTH_STEPS = [100, 90, 80, 70, 60, 50, 40, 30]
const novelWidthPercent = ref(Number(localStorage.getItem('emm-novel-width-percent')) || 100)
// 双栏 = 一屏同时显示两页
const novelTwoCol = ref(localStorage.getItem('emm-novel-two-col') === '1')
// 文字模式方向:与漫画共用同一个设置(setting.readingDirection),不再各存一份。
//   vertical=上下(横排,纵向阅读) / ltr=左右(竖排,列从左往右) / rtl=右左(竖排,列从右往左)
// ⚠️ 早先这里是独立的一坨 localStorage(emm-novel-direction):在图片阅读器里把方向改成「上下」,
//    切到文字模式仍然是旧值(实测是「右左」)—— 用户报的「文字的上下没改过来」就是这个。
//    改成 computed 之后两个模式随时一致;写入走 setter,一样落盘。
// 文字模式的方向**独立于漫画**:以前两者共用 setting.readingDirection,
// 漫画里把方向切成「左右」,打开小说也跟着变左右 —— 用户明确要求两套不互通。
const novelDirection = computed({
  get: () => {
    const v = setting.value.novelReadingDirection
    return (v === 'ltr' || v === 'rtl' || v === 'vertical') ? v : 'vertical'
  },
  set: (v) => { setting.value.novelReadingDirection = v; persistSetting() },
})
// 分页 = 像书一样一页一页翻(不是滚动)
const novelPaged = ref(localStorage.getItem('emm-novel-paged') === '1')
const novelScrollRef = ref(null)
const novelViewportW = ref(0)
const novelPageIndex = ref(0)
const novelPageCount = ref(1)
// 分页:每页「首行」在正文里的纵向位置(由 novelMeasure 逐行量出来)。
// 每页都从某一整行开始 —— 页边界永不切行、也不会把图片切成两半。
// 分页:整块正文只排一次(单列流式),「一页」= 固定页高,且页高正好是「整数行」。
// 因为正文每行等高(段间距为 0),页边界必然落在行与行之间 —— 既不会切行,也不会像多列那样卡。
const novelPageHeight = ref(0)
const NOVEL_PAGE_PAD_X = 22
// .novel-page-clip 的上下内边距(6 + 12,见样式)。裁剪窗口高度必须正好等于
// 「页高 + 内边距」,否则多出来的那截会露出下一行的一半 —— 看起来就是底部文字被裁掉。
const NOVEL_CLIP_PAD_Y = 18
const novelClipStyle = computed(() => novelPageHeight.value
  ? { height: (novelPageHeight.value + NOVEL_CLIP_PAD_Y) + 'px' }
  : {})
// 分页模式:两侧留白实现「宽度占比」。留白放在滚动容器外面(margin) ——
// margin 不随滚动移动,所以每一屏都有同样的留白;调窄的是正文宽度,两页间距不变。
const novelBoxStyle = computed(() => {
  // 「宽度占比」= 正文(整块)占屏幕的比例,单页/双页同一口径。
  // 注意别按双页去乘 2:90/80/60/50 这些挡位一乘就超过 100、被夹成 0,点了一点反应都没有。
  // 双页时每页自然是「整块的一半」,这是并排阅读的必然结果。
  // 只服务分页:靠容器两侧留白实现宽度占比。
  // ⚠️ 卷轴(上下 / 左右 / 右左)一律不碰容器宽度 —— 卷轴下「宽度」管的是
  //    上下方向的尺寸(横排=正文块宽 maxWidth;竖排=每列的上下长度 height)。
  if (!novelPaged.value) return {}
  const side = (100 - novelWidthPercent.value) / 2
  return side > 0 ? { marginLeft: side + '%', marginRight: side + '%' } : {}
})
// 正文样式:分页时用精确列宽排版;连续滚动时只限制正文宽度(宽度占比)
const novelStyle = computed(() => {
  const base = {
    '--novel-font-size': novelFontSize.value + 'px',
    '--novel-line-height': String(novelLineHeight.value),
    '--novel-font-family': novelFontStack.value,
    '--novel-letter-spacing': novelLetterSpacing.value + 'em',
  }
  const pct = novelWidthPercent.value
  if (novelPaged.value) {
    // 分页:正文单列流式,「一页」= 一个固定高度的窗口;翻页靠 .novel-body-paged
    // 的 margin-top 纵向平移(见 novelBodyStyle)。这里只给字号 / 行高。
    return base
  }
  // 卷轴(连续滚动):一律一列,单双不生效(见 toggleNovelTwoCol)。
  // 方向 = 书写方向:上下=横排(纵向滚动);左右/右左=竖排(横向滚动,列从左往右/从右往左)。
  if (novelDirection.value === 'vertical') {
    // 卷轴正文宽度与分页同一口径:可视宽 × 宽度占比
    return { ...base, maxWidth: Math.round((pct / 100) * Math.max(240, novelViewportW.value - NOVEL_PAGE_PAD_X * 2)) + 'px' }
  }
  // 竖排:这里的「宽度」= 每一列的上下长度 —— 按占比缩列高,列数随之变多,横向阅读。
  // (配合 CSS 的 box-sizing: border-box,100/90/80 这些高档位不会再被 padding 夹住。)
  return { ...base, height: pct + '%' }
})
// 分页:每个页窗口里都是同一份正文,浏览器把它按「一列一屏高」切好;
// 窗口 w 显示第 (当前页 + w) 列 —— 横向平移一个列跨距即可。
// 左右方向用 margin-left 过渡(横向滑动);上下方向瞬时换页 + 纵向滑入(playNovelVertical)。
const novelBodyStyle = (w) => {
  const idx = Math.max(0, novelPageIndex.value + w)
  return {
    ...novelStyle.value,
    marginTop: -(idx * (novelPageHeight.value || 0)) + 'px',
    // 上下方向:整页纵向平滑滑过去;左右方向:瞬时换页 + 横向滑入(见 playNovelSlide)
    transition: novelDirection.value === 'vertical' ? 'margin-top .22s ease' : 'none',
  }
}
// 分页的页窗口(用于横向跟手 / 滑入动画)
const novelPageWins = () => {
  const el = novelScrollRef.value
  return el ? [...el.querySelectorAll('.novel-page-window')] : []
}
// 左右方向翻页:新的一屏从侧向滑入
const playNovelSlide = (dir, delta) => {
  const sign = dir === 'rtl' ? -1 : 1
  const from = (delta > 0 ? sign : -sign) * 8
  novelPageWins().forEach(w => {
    if (getComputedStyle(w).display === 'none' || !w.animate) return
    w.animate(
      [{ transform: 'translateX(' + from + '%)' }, { transform: 'translateX(0)' }],
      { duration: 220, easing: 'cubic-bezier(.22,.61,.36,1)' }
    )
  })
}
// 上下方向翻页:整页纵向滑入
const playNovelVertical = (delta) => {
  const from = (delta > 0 ? 6 : -6) + '%'
  novelPageWins().forEach(w => {
    if (getComputedStyle(w).display === 'none' || !w.animate) return
    w.animate(
      [{ transform: 'translateY(' + from + ')' }, { transform: 'translateY(0)' }],
      { duration: 200, easing: 'cubic-bezier(.22,.61,.36,1)' }
    )
  })
}
const novelImageSrc = (blk) => (blk && (blk.url || blk.absolutePath)) || ''
// 文字模式的阅读进度:和图片模式共用 viewerReadingProgress,只是存「进度比例」——
// 文字没有 image id,存页索引又会被字号/宽度改乱,比例最稳。
let novelProgressTimer = null
const saveNovelProgress = () => {
  if (!setting.value.keepReadingProgress) return
  const box = novelScrollBox()
  const book = bookDetail.value
  if (!box || !book || !book.id) return
  let ratio
  if (novelPaged.value) {
    // 分页:直接存「当前页 / 末页」的比例
    ratio = novelMaxPage() > 0 ? novelPageIndex.value / novelMaxPage() : 0
  } else {
    // 横排卷轴滚的是纵向、其余都按横向算 —— 轴取错就会把进度存成 0(下次打开回到第一页)
    const useY = novelDirection.value === 'vertical'
    const max = Math.max(1, useY ? (box.scrollHeight - box.clientHeight) : (box.scrollWidth - box.clientWidth))
    const pos = useY ? box.scrollTop : box.scrollLeft
    ratio = Math.min(1, Math.max(0, pos / max))
  }
  viewerReadingProgress.value = viewerReadingProgress.value.filter(p => p.bookId !== book.id)
  viewerReadingProgress.value.unshift({ bookId: book.id, novelRatio: ratio })
  localStorage.setItem('viewerReadingProgress', JSON.stringify(viewerReadingProgress.value.slice(0, 1000)))
}
// 正文容器自己滚时:横排卷轴(纵向滚动)也要记进度,和分页的 scheduleNovelProgress 共用节流
const onNovelScroll = () => {
  if (novelPaged.value) return
  scheduleNovelProgress()
}
const scheduleNovelProgress = () => {
  if (novelProgressTimer) clearTimeout(novelProgressTimer)
  novelProgressTimer = setTimeout(saveNovelProgress, 600)
}
const restoreNovelProgress = () => {
  if (!setting.value.keepReadingProgress) return
  const book = bookDetail.value
  const el = novelScrollRef.value
  if (!book || !el) return
  const prog = viewerReadingProgress.value.find(p => p.bookId === book.id)
  if (!prog || typeof prog.novelRatio !== 'number') return
  if (novelPaged.value) {
    // 分页:进度是「整本比例」,换算成页码后吸附到整页(双页吸附到偶数页)
    nextTick(() => {
      novelPageIndex.value = Math.round(prog.novelRatio * novelMaxPage())
      clampNovelPage()
    })
    return
  }
  // 横排卷轴滚的是纵向(正文容器自己滚),竖排才是横向 —— 轴错了就会"打开永远在第一页"
  if (novelDirection.value === 'vertical') {
    nextTick(() => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight)
      el.scrollTop = prog.novelRatio * max
    })
    return
  }
  const max = Math.max(0, el.scrollWidth - el.clientWidth)
  el.scrollLeft = prog.novelRatio * max
}
let novelResizeObserver = null
// 容器尺寸变化(窗口缩放、侧栏开合)就重测页宽
const startNovelResizeWatch = () => {
  const el = novelScrollRef.value
  if (!el || typeof ResizeObserver === 'undefined') return
  if (novelResizeObserver) novelResizeObserver.disconnect()
  novelResizeObserver = new ResizeObserver(() => { novelMeasure() })
  novelResizeObserver.observe(el)
}
// 松手后的平滑推进:自己写缓动(浏览器 scroll-behavior:smooth 的时长不可控,观感偏生硬)
let novelAnimRaf = null
const animateNovelScrollLeft = (el, to, dur = 300) => {
  cancelAnimationFrame(novelAnimRaf)
  const from = el.scrollLeft
  if (Math.abs(to - from) < 1) { el.scrollLeft = to; return }
  const t0 = performance.now()
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / dur)
    const e = 1 - Math.pow(1 - k, 3) // easeOutCubic
    el.scrollLeft = from + (to - from) * e
    if (k < 1) novelAnimRaf = requestAnimationFrame(tick)
  }
  novelAnimRaf = requestAnimationFrame(tick)
}
// ── 分页滚动位置:统一入口(处理「右左」的 scrollLeft 符号 / 整页吸附 / 平滑翻页) ──
// ── 分页:页码驱动(不再有 scrollLeft / 多列)──
// 双页时一屏两页:novelPageIndex 永远停在「偶数页」,窗口 w=0/1 分别是左/右页(右左时整体反过来)。
const novelPageSpan = () => (novelTwoCol.value ? 2 : 1)
const novelMaxPage = () => Math.max(0, novelPageCount.value - 1)
const clampNovelPage = () => {
  let p = Math.max(0, Math.min(novelMaxPage(), Math.round(novelPageIndex.value)))
  const span = novelPageSpan()
  p -= p % span // 双页对齐到偶数页
  novelPageIndex.value = p
}
const alignNovelPage = () => {
  if (!novelPaged.value) return
  clampNovelPage()
}
// 量一列多宽、一共多少列(多少页):正文交给浏览器多列排版,一列正好一屏高;
// 列边界由浏览器保证落在整行之间,不再需要任何像素级分页 —— 也就不会切行、切图。
const novelMeasure = () => {
  const el = novelScrollRef.value
  if (!el) return
  novelViewportW.value = el.clientWidth
  if (!novelPaged.value) return
  nextTick(() => {
    const clip = el.querySelector('.novel-page-clip')
    const body = el.querySelector('.novel-body-paged')
    if (!clip || !body) return
    const cs = getComputedStyle(clip)
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
    const lineH = parseFloat(getComputedStyle(body).lineHeight) || 20
    // 页高 = 可视高「向下取整到整数行」:页边界永远落在行与行之间,不会切行。
    // ⚠️ 用页窗口高度,不能用 clip.clientHeight:clip 现在会被绑成「页高 + 内边距」,
    //    拿它来量会自己越量越小。
    const win = clip.parentElement
    const availH = Math.max(40, (win ? win.clientHeight : clip.clientHeight) - padY)
    const rowCount = Math.max(1, Math.floor(availH / lineH))
    novelPageHeight.value = rowCount * lineH
    // 正文是单列流式:scrollHeight 就是全文高度,除以页高即页数
    novelPageCount.value = Math.max(1, Math.ceil(body.scrollHeight / novelPageHeight.value))
    if (novelPageIndex.value > novelMaxPage()) novelPageIndex.value = 0
    clampNovelPage()
  })
}
// ⚠️ 字体、图片都是异步就绪的:第一次测量拿到的往往是「换行还没稳定」的布局,
// 之后必须再量几次,否则分页边界会和最终行位置错开 —— 表现就是页边界切行。
let novelRemeasureTimers = []
const scheduleNovelRemeasure = () => {
  novelRemeasureTimers.forEach(t => clearTimeout(t))
  novelRemeasureTimers = [120, 420, 1100].map(ms => setTimeout(novelMeasure, ms))
  const onImageLoad = () => novelMeasure()
  try {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onImageLoad).catch(() => {})
  } catch (e) { /* 忽略 */ }
  nextTick(() => {
    const el = novelScrollRef.value
    const body = el && el.querySelector('.novel-body-paged')
    if (!body) return
    body.querySelectorAll('img').forEach(img => {
      if (!img.complete) img.addEventListener('load', onImageLoad, { once: true })
    })
  })
}
// 翻页:一屏 = 1 页(单页)或 2 页(双页),页码是唯一状态。
// 左右方向靠 margin-left 过渡横向滑动;上下方向瞬时换页 + 纵向滑入动画。
const goNovelPage = (delta) => {
  if (!novelPaged.value) return
  const span = novelPageSpan()
  const next = Math.min(novelMaxPage(), Math.max(0, novelPageIndex.value + (delta > 0 ? span : -span)))
  const target = next - (next % span)
  if (target !== novelPageIndex.value) {
    novelPageIndex.value = target
    scheduleNovelProgress() // 分页模式没有 scroll 事件,翻页后主动记进度
    if (novelDirection.value === 'vertical') nextTick(() => playNovelVertical(delta))
    else nextTick(() => playNovelSlide(novelDirection.value, delta))
  }
}
// 目录跳转:块在多列里的横向位置 ÷ 列跨距 = 页码
const novelJumpToPageOf = (blockIndex) => {
  const el = novelScrollRef.value
  if (!el || !novelPaged.value || !novelPageHeight.value) return false
  const body = el.querySelector('.novel-body-paged')
  const target = body && body.querySelector('#nb-' + blockIndex)
  if (!target) return false
  const page = Math.max(0, Math.floor(target.offsetTop / novelPageHeight.value))
  const span = novelPageSpan()
  novelPageIndex.value = Math.max(0, page - (page % span))
  return true
}
// 字号:仍然用原来的放大/缩小按钮
const adjustNovelFont = (d) => {
  novelFontSize.value = Math.min(34, Math.max(13, novelFontSize.value + d))
  localStorage.setItem('emm-novel-font-size', String(novelFontSize.value))
  showViewerTip(t('m.novelFontSizeTip', { n: novelFontSize.value }))
  nextTick(() => { novelMeasure() })
}
// 「适应」按钮:正文宽度占比,点一下小 10%
const cycleNovelWidth = () => {
  const i = NOVEL_WIDTH_STEPS.indexOf(Number(novelWidthPercent.value))
  const next = NOVEL_WIDTH_STEPS[(i + 1) % NOVEL_WIDTH_STEPS.length]
  novelWidthPercent.value = next
  localStorage.setItem('emm-novel-width-percent', String(next))
  showViewerTip(t('m.novelWidthTip', { n: next }))
  nextTick(() => { novelMeasure() })
}
const toggleNovelTwoCol = () => {
  // 卷轴(连续滚动)下一律一列,单双不生效 —— 只提示,不改状态
  if (!novelPaged.value) { showViewerTip(t('m.scrollModeLabel') + ' · ' + t('m.novelOnePage')); return }
  novelTwoCol.value = !novelTwoCol.value
  localStorage.setItem('emm-novel-two-col', novelTwoCol.value ? '1' : '0')
  showViewerTip(novelTwoCol.value ? t('m.novelTwoPage') : t('m.novelOnePage'))
  nextTick(() => { novelMeasure() })
}
// 方向循环:上下 → 左右 → 右左(与漫画同一套;卷轴下=书写方向,分页下=翻页方向)
const cycleNovelDirection = () => {
  const order = ['vertical', 'ltr', 'rtl']
  // novelDirection 独立存 setting.novelReadingDirection,不再影响漫画的阅读方向
  novelDirection.value = order[(order.indexOf(novelDirection.value) + 1) % order.length]
  showViewerTip(novelDirectionLabel.value)
  nextTick(() => { novelMeasure() })
}
const toggleNovelPaged = () => {
  novelPaged.value = !novelPaged.value
  localStorage.setItem('emm-novel-paged', novelPaged.value ? '1' : '0')
  showViewerTip(novelPaged.value ? t('m.pagingModeLabel') : t('m.scrollModeLabel'))
  nextTick(() => { novelMeasure() })
}
// 分页模式:滚轮 = 翻页(不是滚动),所以永远不会出现「滚到半页、内容错乱」
const onNovelWheel = (e) => {
  if (!isNovelMode.value) return
  const el = novelScrollRef.value
  if (!el) return
  const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (!raw) return
  if (novelPaged.value) {
    // 分页:滚轮 = 翻页;事件自己吃掉,别让外层的惯性滚动同时插手
    e.preventDefault()
    e.stopPropagation()
    if (Math.abs(raw) < 4) return
    // 往下滚永远是「继续读」= 下一页;左右/右左只是列的方向不同,
    // 翻页朝哪边由 setNovelScrollOffset 按 RTL 处理,这里不要再反转 ——
    // 反转过的结果是:右左模式下往下滚变成「上一页」,一直停在第 0 页翻不动。
    goNovelPage(raw > 0 ? 1 : -1)
    return
  }
  // 横排卷轴:原生滚动,不 preventDefault(要保留浏览器自己的滚动/惯性);
  // 但要 stopPropagation —— 否则冒泡到外层 .drawer-viewer-body 又被图片那套逻辑处理一次
  if (novelDirection.value === 'vertical') { e.stopPropagation(); return }
  // 竖排:内容沿横向排,纵向滚轮转成横向滚动,并带上同样的缓动
  e.preventDefault()
  e.stopPropagation()
  animateNovelScrollLeft(el, el.scrollLeft + (novelDirection.value === 'rtl' ? -raw : raw))
}
// 拖动:分页 = 跟手拖页(左右方向) / 手势翻页(上下方向);卷轴 = 跟手平移
// 卷轴模式下真正在滚的容器:横排卷轴把滚动交给了外层(那里挂着惯性),竖排仍是正文容器
const novelScrollBox = () => {
  const el = novelScrollRef.value
  if (!el) return null
  if (novelPaged.value) return el
  // 方向决定「正文怎么排」,也就决定了滚的是哪个轴、哪个盒子:
  //   上下(横排)        → 正文纵向长,滚动交给外层 .drawer-viewer-body(惯性挂在那儿)
  //   左右 / 右左(竖排) → 正文横向长,滚正文容器自己(overflow-x: auto)
  // ⚠️ 之前这里的轴判断和候选顺序都是反的(vertical 查横向、还优先返回正文容器),
  //    结果对象拿到的是「滚不动的那个盒子」,表现就是「文字卷轴拖不动」。
  const vertical = novelDirection.value === 'vertical'
  const canScroll = (box) => {
    if (!box) return false
    return vertical ? box.scrollHeight > box.clientHeight + 1 : box.scrollWidth > box.clientWidth + 1
  }
  // 横排卷轴:正文容器自己滚(原生),外层不再参与
  const candidates = [el, drawerViewerBody.value]
  for (const box of candidates) if (canScroll(box)) return box
  return candidates[0] || el
}
let novelDrag = null
let novelSuppressClick = false
const onNovelPointerDown = (e) => {
  if (!isNovelMode.value || e.button !== 0) return
  const el = novelScrollRef.value
  if (!el) return
  cancelAnimationFrame(novelAnimRaf)
  const paged = novelPaged.value
  const box = novelScrollBox() || el
  novelDrag = {
    x: e.clientX, y: e.clientY,
    left: box.scrollLeft, top: box.scrollTop,
    moved: false, paged, box,
    // 记下「按下的那一刻在第几页」,松手就从这里翻一页
    startPage: paged ? novelPageIndex.value : 0,
  }
}
const onNovelPointerMove = (e) => {
  if (!novelDrag) return
  const el = novelScrollRef.value
  if (!el) return
  const dx = e.clientX - novelDrag.x
  const dy = e.clientY - novelDrag.y
  if (!novelDrag.moved) {
    if (Math.hypot(dx, dy) < 6) return
    novelDrag.moved = true
    novelSuppressClick = true
  }
  if (novelDrag.paged) {
    // preventDefault 是必须的:否则浏览器会把横向拖动当成「选择文字 / 前进后退手势」而取消手势
    e.preventDefault()
    // 左右方向:页窗口横向跟手(还原以前的左右拖动);上下方向保持松手翻页
    if (novelDirection.value !== 'vertical') {
      novelPageWins().forEach(w => { w.style.transition = 'none'; w.style.transform = 'translateX(' + dx + 'px)' })
    }
  } else {
    // 卷轴:按方向只跟手一个轴 —— 两个轴都改会让画面斜着跑,松手后也不稳。
    // 横排卷轴的滚动在外层容器上(正文自己 overflow:visible),所以要滚 novelDrag 记下的那个盒子。
    const box = novelDrag.box || el
    if (novelDirection.value === 'vertical') box.scrollTop = novelDrag.top - dy
    else box.scrollLeft = novelDrag.left - dx
  }
}
const onNovelPointerUp = (e) => {
  if (!novelDrag) return
  const d = novelDrag
  novelDrag = null
  if (!d.moved) return
  const el = novelScrollRef.value
  if (!el) return
  setTimeout(() => { novelSuppressClick = false }, 0) // 拖完那一次 click 不当翻页
  if (!d.paged) return // 卷轴:跟手已经到位,松手停住
  const dx = e.clientX - d.x
  const dy = e.clientY - d.y
  // 手势主轴按实际位移大小决定:横滑、竖滑都能翻页
  const horizontal = Math.abs(dx) >= Math.abs(dy)
  const main = horizontal ? dx : dy
  const wins = novelPageWins()
  const resetWins = () => wins.forEach(w => { w.style.transition = ''; w.style.transform = '' })
  if (novelDirection.value !== 'vertical' && horizontal) {
    // 左右:跟手结束后回弹,或翻一页(翻页动画由 goNovelPage → playNovelSlide 负责)
    if (Math.abs(main) > 48) {
      resetWins()
      goNovelPage(main < 0 ? 1 : -1)
    } else {
      wins.forEach(w => { w.style.transition = 'transform .2s ease'; w.style.transform = 'translateX(0)' })
      setTimeout(resetWins, 240)
    }
    return
  }
  resetWins()
  // 统一手势:横滑向左 / 竖滑向上 = 下一页
  if (Math.abs(main) > 48) goNovelPage(main < 0 ? 1 : -1)
}
// 分页模式:像图片那样点画面翻页 —— 左半屏上一页,右半屏下一页
const onNovelClick = (e) => {
  if (!isNovelMode.value || !novelPaged.value) return
  // 刚拖动过的那一次 click 不当翻页
  if (novelSuppressClick) { novelSuppressClick = false; return }
  const el = novelScrollRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const dir = novelDirection.value
  // 方向决定点哪半边翻页:上下=上半屏上一页/下半屏下一页;
  // 左右=左半屏上一页/右半屏下一页;右左=反过来(从右往左读)。
  // 主轴上中间 1/4 区域留给「唤出设置栏」,不翻页(与图片阅读器一致)。
  const horizontal = dir !== 'vertical'
  const pos = horizontal ? (e.clientX - rect.left) / rect.width : (e.clientY - rect.top) / rect.height
  if (pos > 0.375 && pos < 0.625) { flashViewerToolbar(); return }
  const next = horizontal ? (dir === 'rtl' ? pos < 0.5 : pos > 0.5) : pos > 0.5
  goNovelPage(next ? 1 : -1)
}
const onNovelKeydown = (e) => {
  if (!isNovelMode.value || !novelPaged.value) return
  const lr = novelDirection.value === 'rtl' ? -1 : 1 // 右左时左右键反过来
  if (e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); goNovelPage(1) }
  else if (e.key === 'PageUp') { e.preventDefault(); goNovelPage(-1) }
  else if (e.key === 'ArrowDown') { e.preventDefault(); goNovelPage(1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); goNovelPage(-1) }
  else if (e.key === 'ArrowRight') { e.preventDefault(); goNovelPage(lr) }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); goNovelPage(-lr) }
}
// 目录跳转:章节块都带 id(nb-<块序号>)
const novelJumpTo = (chapter) => {
  if (!chapter) return
  if (novelJumpToPageOf(chapter.blockIndex)) return
  const el = document.getElementById('nb-' + chapter.blockIndex)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
const loadNovelContent = async (book) => {
  try {
    const res = await ipcRenderer.invoke('load-novel-content', _.cloneDeep(book))
    if (res && res.ok) {
      novelBlocks.value = res.blocks || []
      novelChapters.value = res.chapters || []
      novelKind.value = res.kind || ''
      novelCharCount.value = res.charCount || 0
      isNovelMode.value = true
      // 文字模式默认收起侧栏:目录要点开,不要一进来就占着半屏
      showViewerSide.value = false
      // ⚠️ 必须立刻测一次:否则分页模式页宽停留在保底值(240px)、页数停在 1,
      //    表现就是「排版错乱 + 只能翻一页」。
      nextTick(() => { novelMeasure(); novelPageIndex.value = 0; startNovelResizeWatch(); restoreNovelProgress(); scheduleNovelRemeasure() })
    } else {
      novelBlocks.value = []
      isNovelMode.value = false
      if (res) console.log('读取小说失败:', res.error)
    }
    return res
  } catch (e) {
    console.log(e)
    isNovelMode.value = false
    return null
  }
}
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
  // EH在线:没有本地缩略图流水线(那条路只在本地书上跑),直接用**已经解析出来的页图**当缩略图 ——
  // 和 EH 网站一样按页浏览。还没解析好的页缩略图留空,模板里显示转圈。
  if (bookDetail.value && bookDetail.value.online) {
    return viewerImageList.value.map((it, i) => ({
      id: it.id,
      index: i,
      online: true,
      thumbnailPath: it.filepath || '',
      filepath: it.filepath || '',
      rawUrl: it.rawUrl,
      originalUrl: it.originalUrl,
      pageUrl: it.pageUrl
    }))
  }
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
      // 「进入阅读(第 N 页)」的跳转:等图片全部到齐再跳 ——
      // 提前跳会被 currentImageIndex 的 setter 夹到「当前已到的最后一页」
      if (pendingJumpIndex != null) {
        const target = Math.min(Math.max(0, pendingJumpIndex), viewerImageList.value.length - 1)
        pendingJumpIndex = null
        if (target > 0 && viewerImageList.value[target]) {
          handleClickThumbnail(viewerImageList.value[target].id)
        }
      }

      if (setting.value.viewerType === 'comicread') {
        totalPage.value = arg.total
        nextTick(() => {
          showComicReader(viewerImageFilepathList.value)
        })
      }
      hideViewerLoading()
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

  // 在线图片下载进度(主进程 emm-eh:// 读响应体时回推):占位上的环形进度条据此显示真实百分比
  ipcRenderer.on('eh-image-progress', (event, arg) => {
    if (!arg || !arg.t) return
    const ratio = (typeof arg.ratio === 'number') ? arg.ratio : -1
    // 只在页面还没出图时更新,减少无谓重渲染
    if (loadedImages.value[arg.t]) return
    setImageProgress(arg.t, ratio)
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
if (viewerHeartbeat) { clearInterval(viewerHeartbeat); viewerHeartbeat = null }
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

// 加载遮罩(可关闭):在线解析画廊页面 / 本地取图片列表时显示。
// ⚠️ 不再用 ElLoading.service —— 它没有按钮,在线解析卡住(或失败)时整个阅读器被锁死出不来。
const viewerLoadingVisible = ref(false)
const viewerLoadingText = ref('')
// 加载作废令牌:用户点「关闭」后 +1,在途的结果回来时按 token 丢弃,不再往下走
const viewerLoadToken = ref(0)
// 「从下载记录进入阅读(第 N 页)」的跳转目标:本地书的图片是一条条推过来的,
// 要等全部到齐再跳(提前跳会被 currentImageIndex 的 setter 夹到当前末尾页)。
// 在线书的列表是同步建好的,在 openOnlineBook 里直接消费,不走这里。
let pendingJumpIndex = null
const showViewerLoading = (text) => {
  viewerLoadingText.value = text || t('m.loading')
  viewerLoadingVisible.value = true
}
const hideViewerLoading = () => { viewerLoadingVisible.value = false }
// 点「关闭」:收起遮罩 → 作废这次加载 → 退出阅读器(回到书架),不再卡在转圈里
const cancelViewerLoading = () => {
  viewerLoadToken.value += 1
  hideViewerLoading()
  drawerVisibleViewer.value = false
  nextTick(() => { try { ipcRenderer.invoke('set-viewer-active', false) } catch (e) { /* 忽略 */ } })
}


// ---------- 图片加载进度(照 JHenTai:转圈 + 进度)----------
// <img> 真正解码完成(@load)才算「已加载」;失败的(@error,例如 EH 的死 H@H 节点)也算「不 pending」,
// 否则进度圈会一直转着不停。
const viewerImageReady = ref({})
const viewerImageFailed = ref({})
const onViewerImageLoad = (image) => {
  if (!image || !image.id) return
  // H@H 节点抽风时会吐「加载了一半的残图」,这种中断经常不触发 @error:
  // load 完后看实际宽高,解不出来(或小得离谱)就按失败处理,让用户能点重试
  const el = document.getElementById(image.id)
  if (el && el.tagName === 'IMG' && (!el.naturalWidth || el.naturalWidth < 10)) {
    onViewerImageError(image)
    return
  }
  viewerImageReady.value = { ...viewerImageReady.value, [image.id]: true }
  // 图片真实高度落地会改动整卷布局:加载的是当前页时校回一次(带节流,连续加载不抖)
  if (image.id === currentImageId.value) {
    clearTimeout(onViewerImageLoad._alignT)
    onViewerImageLoad._alignT = setTimeout(() => {
      try { scrollToImageElement(currentImageId.value) } catch (e) { /* 忽略 */ }
    }, 120)
  }
}
// ★在线图片加载失败:自动换 H@H 节点重试(照 JHenTai 的 reParse 机制)。
//   ⚠ 这里以前有个观感 bug:先把 viewerImageFailed 置 true(界面**立刻**显示「这一页加载失败」),
//     紧接着又把 resolving 设回 true → 界面下一帧又变成「正在解析」。
//     于是用户看到「先失败、再正在解析」的乱跳。
//   现在:失败不写「最终失败」标记,只做换节点重试;重试期间状态保持 resolving(转圈/进度),
//     只有三轮都失败才真正标记失败(见 markImageFailed)。
const onViewerImageError = (image) => {
  if (!image || !image.id) return
  if (image.online && image.pageUrl) {
    const tries = (image.__retry || 0) + 1
    image.__retry = tries
    if (tries <= 3) {
      // 换节点重试:保持「解析中」的中间态,不要先闪一下失败
      image.resolving = true
      image.failed = false
      image.loaded = false
      setImageLoaded(image.id, false)
      image.filepath = ''
      if (!onlineResolveQueue.includes(image)) onlineResolveQueue.push(image)
      setTimeout(() => {
        if (viewerLoadToken.value) drainOnlineQueue(viewerLoadToken.value)
      }, 250 * tries)
      return
    }
  }
  markImageFailed(image)
}
// 真正判定失败(所有重试都用尽了)
const markImageFailed = (image) => {
  if (!image || !image.id) return
  viewerImageFailed.value = { ...viewerImageFailed.value, [image.id]: true }
  image.failed = true
  image.resolving = false
}
// 阅读心跳定时器:每 60 秒向主进程报一次「还在阅读」
let viewerHeartbeat = null
// 在线阅读:EH 画廊没有本地文件,不走 load-manga-image-list(本地文件流水线,还会占用 viewerSession)。
// 做法:先把各页的真实图片地址解析出来(主进程带 Cookie 与代理取,见 emm-eh:// 与 /api/ex-image),
// 再把它们当成「图片列表」交给**内置阅读器**—— 与本地书走同一套界面(翻页/缩放/适应/缩略图)。
const onlinePageSize = (url) => {
  // H@H 地址里带尺寸:...-<gid>-<宽>-<高>-wbp/...
  const m = /-(\d{3,5})-(\d{3,5})-(?:wbp|jpg|jpeg|png|webp)/i.exec(url)
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 1200, height: 1700 }
}

// 在线画廊:★立刻进阅读器★,再逐页解析图片地址(JHenTai 的做法)。
// 以前是「先把 20 页全解析完再进阅读器」—— 实测要 8~9 秒,点一下要等很久才有反应。
// 现在:①按卡片上已知的页数摆好占位 ②收页链接拿到真实总数 ③并发 6 逐页解析,解析好一页填一页,
// 没解析好的那一页显示「正在解析第 N 页」的转圈(与 JHenTai 阅读器的解析占位一致);
// 翻页时还会把离当前页近的页面提到队列前面(见 prioritizeOnlineQueue)。
const makeOnlineItem = (index, total) => ({
  id: 'eh-online-' + index,
  filepath: '',            // 解析到地址才算「可渲染」
  width: 1200, height: 1700,
  total, online: true,
  rawUrl: '', originalUrl: '', pageUrl: '',
  resolving: true, failed: false,
  // 这一页在整本里的序号:解析队列按「离当前页近的先解析」重排时用
  __index: index
})

// 占位状态:解析中 / 图片加载中 / 失败(可点重试)
// 占位状态 —— 只由三个明确的事实决定,不再"先失败再解析"地来回跳:
//   failed   → 所有换节点重试都失败(final 标记由 markImageFailed 写入)
//   resolving→ 还在解析图片地址(含换节点重试中)
//   loading  → 地址已就绪,图片本体正在下载(此时显示真实进度环)
const placeholderState = (image) => {
  if (!image) return 'loading'
  if (image.failed && viewerImageFailed.value[image.id]) return 'failed'
  if (image.online && image.resolving) return 'resolving'
  return 'loading'
}

// 每页的图片下载进度(0~1;-1 = 未知)。照 JHenTai 的 _computeLoadingProgress:
// 有 content-length 就 cur/total,否则返回 -1 让占位显示转圈而不是假的百分比。
// 进度来自 emm-eh:// 协议回传的字节数(见主进程 protocol.handle 的 onProgress)。
const imageLoadProgress = (image) => {
  if (!image || !image.id) return -1
  const p = loadedProgress.value[image.id]
  return (typeof p === 'number' && p >= 0) ? p : -1
}

// 并发解析数:每页都要回站上取一次图片地址,4 是「不太会被 EH 限速」的保守值;
// 6 是本机实测的平衡点(再多容易触发 EH 的限速页,反而更慢)
const ONLINE_RESOLVE_CONCURRENCY = 6
// 预加载窗口(照 JHenTai 的 preloadPageCount / preloadDistance 口径):
//   只解析「当前页前后 N 页」,不再整本一次性入队。
//   JHenTai 默认在线 preloadPageCount=1、本地=3,这里放宽一点(7)兼顾连续阅读;
//   窗口外的页在翻到附近时再补队,所以既有预读、又不会把请求堆成几百个。
const PRELOAD_WINDOW = 7
const onlineResolveQueue = []
let onlineResolveRunning = 0

// 翻页时把「离当前页近的页」提到解析队列前面 ——
// 否则用户翻到第 30 页时,它还在队尾排着(整本按顺序解析),观感就是「一直正在解析」。
// 正在解析中的(已经被 worker 取走)不受影响,只重排还没开始的。
const prioritizeOnlineQueue = (currentIndex) => {
  if (!onlineResolveQueue.length) return
  const idx = Math.max(0, Number(currentIndex) || 0)
  onlineResolveQueue.sort((a, b) => {
    const da = Math.abs((a.__index == null ? 0 : a.__index) - idx)
    const db = Math.abs((b.__index == null ? 0 : b.__index) - idx)
    return da - db
  })
}

const resolveOnlineItem = async (image, token, attempt = 0) => {
  if (!image || !image.pageUrl) { if (image) image.failed = true; return }
  try {
    // 每轮都带上 reloadKey(= 上一轮页面里的 nl 值):节点被限速/挂掉时,
    // EH 会据此重新挑一个 H@H 节点 —— 与 JHenTai 的 _reParseImageUrlAndDownload 同一做法。
    // 这就是用户看到的 ?nl=42598-498016;实测「换节点重试」能把连续失败压成 0。
    const r = await ipcRenderer.invoke('eh-page-image', {
      pageUrl: image.pageUrl,
      reloadKey: image.reloadKey || ''
    })
    if (token !== viewerLoadToken.value) return
    if (r && r.reloadKey) image.reloadKey = r.reloadKey
    // 换节点重试:最多 4 轮(原来只重试 2 次且不带 nl),失败率会明显下降
    if (!(r && r.ok && r.url) && attempt < 3) {
      await new Promise(r2 => setTimeout(r2, 250 * (attempt + 1)))
      if (token !== viewerLoadToken.value) return
      return resolveOnlineItem(image, token, attempt + 1)
    }
    if (r && r.ok && r.url) {
      image.rawUrl = r.url
      image.originalUrl = r.originalUrl || ''
      // 带上这一页的图片页 URL 当 referer —— 浏览器读图「从不失败」的关键之一
      image.filepath = ehImageSrc(r.url, image.id, image.pageUrl)
      const size = onlinePageSize(r.url)
      image.width = size.width
      image.height = size.height
      image.resolving = false
      image.failed = false
      // 在线条目要自己标「已渲染」:内置阅读器靠 loadedImages 决定渲不渲染 <img>
      setImageLoaded(image.id, true)
      // 高度从占位估算值变成真实值会让布局跳动(卷轴模式下**前面的页**变高会把
      // 当前页往下推):不论解析的是哪一页,都把当前页拉回视口(节流,批量解析不抖)
      clearTimeout(resolveOnlineItem._alignT)
      resolveOnlineItem._alignT = setTimeout(() => {
        if (currentImageId.value) nextTick(() => { try { scrollToImageElement(currentImageId.value) } catch (e) { /* 忽略 */ } })
      }, 120)
      return
    }
    // 解析彻底失败:统一走 markImageFailed(同时写最终失败标记,界面不会再闪回「正在解析」)
    markImageFailed(image)
    return
  } catch (e) {
    markImageFailed(image)
    return
  } finally {
    // ⚠ 只有「已成功/已彻底失败」时这里才是 false;重试排队中的那些由上面提前 return,
    //    不会被执行到这里(否则会把 resolving 抹掉,界面又跳回「加载失败」)
    if (image.failed || (image.filepath && !image.__retryPending)) image.resolving = false
  }
}

// 「从第 N 页打开」的目标页:占位图是估算高度,真实图片陆续撑开后滚动位置会漂到别的页,
// 所以队列跑空后再对齐一次(在线画廊点预览进阅读器「跳过去又变了」的根因)
let onlineJumpTargetId = null
// 翻页时推进「预加载窗口」:把当前页前后 PRELOAD_WINDOW 页里还没解析的补进队列。
// 已经在队列里的不重复加;已解析好/已失败的也不加(失败要用户点重试才重来)。
const enqueuePreloadWindow = (currentIndex) => {
  const list = viewerImageList.value
  if (!list || !list.length) return
  const idx = Math.max(0, Math.min(Number(currentIndex) || 0, list.length - 1))
  const token = viewerLoadToken.value
  const inQueue = new Set(onlineResolveQueue.map(it => it && it.id))
  const from = Math.max(0, idx - PRELOAD_WINDOW)
  const to = Math.min(list.length - 1, idx + PRELOAD_WINDOW)
  for (let i = from; i <= to; i++) {
    const it = list[i]
    if (!it || !it.pageUrl) continue
    if (!it.resolving) continue          // 已解析/已失败:不重复入队
    if (inQueue.has(it.id)) continue
    onlineResolveQueue.push(it)
  }
  drainOnlineQueue(token)
}

const drainOnlineQueue = (token) => {
  while (onlineResolveRunning < ONLINE_RESOLVE_CONCURRENCY && onlineResolveQueue.length) {
    const image = onlineResolveQueue.shift()
    onlineResolveRunning += 1
    resolveOnlineItem(image, token).finally(() => {
      onlineResolveRunning -= 1
      if (token === viewerLoadToken.value) drainOnlineQueue(token)
    })
  }
  if (!onlineResolveRunning && !onlineResolveQueue.length && onlineJumpTargetId) {
    const targetId = onlineJumpTargetId
    onlineJumpTargetId = null
    nextTick(() => {
      setTimeout(() => {
        try { if (bookDetail.value && bookDetail.value.online) handleClickThumbnail(targetId) } catch (e) { /* 忽略 */ }
      }, 60)
    })
  }
}

// 某一页失败后点「重新加载」:重新解析这一页
const retryOnlinePage = (image) => {
  if (!image || !image.pageUrl) return
  image.failed = false
  image.resolving = true
  // 记住重试时正在看的页:解析成功后图片高度会从占位变成实际值,滚动位置会漂
  // (用户反馈「点重新加载居然跳转页码」)。成功后把当前页拉回视口。
  const anchorId = currentImageId.value
  onlineResolveQueue.push(image)
  drainOnlineQueue(viewerLoadToken.value)
  if (anchorId) {
    const requeue = setInterval(() => {
      if (!image.resolving || image.failed) {
        clearInterval(requeue)
        if (!image.failed) nextTick(() => { try { scrollToImageElement(anchorId) } catch (e) { /* 忽略 */ } })
      }
    }, 200)
    setTimeout(() => clearInterval(requeue), 20000)
  }
}

const openOnlineBook = async (book, startIndex = null) => {
  const token = ++viewerLoadToken.value
  bookDetail.value = book
  emit('updateWindowTitle', book)
  isComicReadDisplay.value = false
  readyDestroyViewer.value = false
  onlineResolveQueue.length = 0
  onlineResolveRunning = 0
  onlineJumpTargetId = null
  receiveThumbnailList.value = []
  pendingImages.length = 0
  pendingThumbnails.length = 0
  currentImageIndex.value = 0

  // ①先用卡片上已知的页数摆好占位 —— 立刻把阅读器打开,不让用户干等。
  //   ★「从第 N 页进入」时占位阶段就直接定位到第 N 页:
  //     以前固定落在第一页,等链接收完再跳 N 页 —— 看起来就是「先跳第一页再跳回来」
  const known = Math.max(0, Number(book.pageCount) || 0)
  viewerImageList.value = Array.from({ length: known }, (_, i) => makeOnlineItem(i, known))
  totalPage.value = known
  // ⚠ startIdx 与 known 解算:卡片没带页数时 known=0,若在这里把 startIndex 清零,
  //   「从第 N 页进入」就丢了目标,links 到手后只会停在第一页
  const startIdx = (startIndex != null && startIndex > 0) ? Number(startIndex) : 0
  currentImageId.value = viewerImageList.value.length
    ? viewerImageList.value[startIdx].id
    : ''
  drawerVisibleViewer.value = true
  // ★占位阶段就定位到目标页:以前占位/currentImageId 定了但界面还在第一页,
  //   等链接收完才跳,看起来就是「先跳第一页再跳点击页」
  if (startIdx > 0) {
    const jumpToPlaceholder = () => {
      const it = viewerImageList.value[startIdx] || viewerImageList.value[viewerImageList.value.length - 1]
      if (!it) return false
      if (imageStyleType.value === 'scroll') {
        return scrollToImageElement(it.id)
      }
      // 横向/单页/双页:直接设当前页序号
      const idx = _.findIndex(viewerImageList.value, { id: it.id })
      if (idx >= 0) currentImageIndex.value = idx
      return true
    }
    nextTick(() => {
      if (jumpToPlaceholder()) return
      const t0 = setInterval(() => { if (jumpToPlaceholder()) clearInterval(t0) }, 80)
      setTimeout(() => clearInterval(t0), 3000)
    })
  }
  // 页数未知(少数卡片没有)时先用可关闭的遮罩撑着,拿到链接就换成占位
  if (!known) showViewerLoading(t('m.ehOnlineOpening'))

  try {
    // ②收页链接(几次请求就够):拿到真实总数后按它修补占位
    const res = await ipcRenderer.invoke('eh-gallery-page-links', { url: book.url })
    if (token !== viewerLoadToken.value) return
    const links = (res && res.links) || []
    if (!links.length) {
      // 一页都收不到:把现有占位标成失败(每页可以单独重试),不再傻等
      viewerImageList.value.forEach(it => { it.resolving = false; it.failed = true })
      if (!viewerImageList.value.length) ElMessage.warning(t('m.ehOnlineOpenFallback'))
      hideViewerLoading()
      return
    }
    // ⚠ 增量修补,不要整体重建:以前直接 viewerImageList.value = 新数组,
    //   ① 卡片页数与真实不符时列表长度突变,已经渲染出来的页全部丢掉重来
    //     (观感就是「加载混乱:图突然全空又慢慢冒出来」);
    //   ② 当前页/滚动位置跟着丢,用户被弹回第一页。
    const prev = viewerImageList.value
    const sameLen = prev.length === links.length
    const items = Array.from({ length: links.length }, (_, i) => {
      const old = (sameLen || i < prev.length) ? prev[i] : null
      // 已经解析好的页原样保留(URL、宽高、loaded 状态都不动)
      if (old && old.pageUrl === links[i] && old.filepath) return old
      const it = makeOnlineItem(i, links.length)
      it.pageUrl = links[i]
      return it
    })
    viewerImageList.value = items
    totalPage.value = links.length
    // 当前页保留:占位阶段的定位(第 N 页)在真列表里沿用,不回第一页
    if (!currentImageId.value || !items.some(it => it.id === currentImageId.value)) {
      currentImageId.value = (startIdx && items[startIdx]) ? items[startIdx].id : items[0].id
    }
    hideViewerLoading()
    // ③按「预加载窗口」入队(口径照 JHenTai 的 preloadPageCount / preloadDistance):
    //   以前是把**整本**一次性塞进队列 —— 一本 200 页的漫画会先生成 200 个请求,
    //   前面几十个还在排队,用户当前看的这几页反而要等它们跑完才轮到(观感就是「加载巨慢」)。
    //   现在只入队「当前页前后 window 页」;用户翻页时再往前推窗口(见 enqueuePreloadWindow)。
    onlineResolveQueue.length = 0
    const seed = (startIdx > 0 ? startIdx : 0)
    const needResolve = items
      .filter((it, i) => it.resolving && it.pageUrl && Math.abs(i - seed) <= PRELOAD_WINDOW)
    onlineResolveQueue.push(...needResolve)
    // 「从第 N 页进入」:目标页最先解析(以前从第 1 页顺序爬,目标页排在队尾,
    //   前后页都出图了本页还在转圈)
    if (startIdx > 0) prioritizeOnlineQueue(startIdx)
    drainOnlineQueue(token)
    // 「进入阅读(第 N 页)」跳转:列表已同步建好,直接跳
    // (handleClickThumbnail 会自己处理 卷轴/单页/双页 三种模式的换算)
    if (startIndex != null && startIndex > 0 && startIndex < items.length) {
      onlineJumpTargetId = items[startIndex].id
      handleClickThumbnail(items[startIndex].id)
    }
  } catch (e) {
    console.error(e)
    viewerImageList.value.forEach(it => { it.resolving = false; it.failed = true })
    hideViewerLoading()
  }
}

// opts.skipHistory / opts.skipSave:从「下载记录 → 进入阅读」打开的本机临时书用 ——
// 它不在任何库/数据库里,写阅读历史、saveBook(会往库里插一行)都会造成脏数据
const viewManga = (book, viewerHeight = '100%', startIndex = null, opts = {}) => {
  // 在线画廊:走在线分支(不进本地文件流水线)
  if (book && book.online) {
    // 在线画廊也要进「历史」—— JHenTai 的历史本来就是「看过哪些画廊」,而在线画廊占大多数。
    // 本地那条路的记录在下面(第 1700 行附近),这里提前 return 了,所以必须自己记一次;
    // 记录放在取图之前:哪怕这次没取到图(节点超时/被限速),「看过」这件事也已经发生了。
    if (!opts.skipHistory) insertLocalReadRecord(book.id, book)
    openOnlineBook(book, startIndex)
    return
  }
  readyDestroyViewer.value = false
  // 通知主进程正在阅读:后台扫描暂停,让出 CPU/磁盘
  ipcRenderer.invoke('set-viewer-active', true)
  // 换书先清掉上一本的文字状态(有图的书会走图片模式)
  isNovelMode.value = false
  novelBlocks.value = []
  novelChapters.value = []
  if (novelResizeObserver) { novelResizeObserver.disconnect(); novelResizeObserver = null }
  // 心跳:浏览器被强关时前端来不及发 false,主进程靠「3 分钟没心跳」自动放开后台任务
  if (viewerHeartbeat) clearInterval(viewerHeartbeat)
  viewerHeartbeat = setInterval(() => { ipcRenderer.invoke('set-viewer-active', true) }, 60000)
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
  showViewerLoading('Loading')
  emit('updateWindowTitle', book)
  if (!opts.skipHistory) insertLocalReadRecord(book.id, book)
  // 「进入阅读(第 N 页)」:等主进程把图片推全了再跳(见 manga-image 的到齐分支)
  pendingJumpIndex = (startIndex == null ? null : Math.max(0, Number(startIndex) | 0))
  ipcRenderer.invoke('load-manga-image-list', _.cloneDeep(book))
  .then((res) => {
    // txt / epub:取「内容块」(章节 / 段落 / 插图原位)。
    //  · 没有图片页的(txt、纯文字 epub) → 只能文字阅读
    //  · 图文 epub → 正文够长就默认图文混排(插图插在原文位置,仍可切回纯图片模式)
    if (book && (book.type === 'novel' || book.type === 'epub')) {
      loadNovelContent(book).then((r) => {
        if (!r || !r.ok) return
        if (res && res.textOnly) {
          hideViewerLoading()
          drawerVisibleViewer.value = true
          book.readCount += 1
          saveBook(book)
      // 文字模式默认收起侧栏:目录要点开,不要一进来就占着半屏
      showViewerSide.value = false
        } else if (r.charCount > 800) {
          isNovelMode.value = true
        nextTick(() => { novelMeasure(); novelPageIndex.value = 0; startNovelResizeWatch(); restoreNovelProgress(); scheduleNovelRemeasure() })
        }
      })
    }
    // 只有确实要看缩略图(侧栏开着 / 缩略图视图)时才请求生成,否则一个缩略图都不算
    if (!isNovelMode.value && (showViewerSide.value || showThumbnail.value)) requestThumbnails()
    if (!setting.value.viewerType || setting.value.viewerType === 'original') {
      drawerVisibleViewer.value = true
      // 先亮 3 秒,让用户知道顶部有设置栏(鼠标移到顶部可随时唤出)
      flashViewerToolbar()
      // ⚠ 显式指定了「从第 N 页打开」(点预览缩略图)时,绝不能再跳回上次读到的页 ——
      //    以前两套跳转同时生效:先到点击的页,过一会儿又被阅读进度拉走(用户报的「马上自动切换」)
      if (setting.value.keepReadingProgress && showThumbnail.value === false && pendingJumpIndex == null) handleJumpToReadingProgress(book)
      hideViewerLoading()
      // 横向整排:新开一本还没有阅读进度时,直接摆到「第一页」那一端(右左 = 最右)
      const hasProgress = pendingJumpIndex == null && setting.value.keepReadingProgress &&
        viewerReadingProgress.value.some(progress => progress.bookId === book.id)
      if (!hasProgress && isScrollHorizontal.value) pinHorizontal()
      // 自动超分开着时,打开就先把当前页送去超分
      nextTick(() => triggerAutoUpscaleForCurrentPage())
    } else if (setting.value.viewerType === 'comicread') {
      initComicRead()
    }
    // 下载记录里打开的临时书不在数据库里:不写阅读数、不 saveBook(否则会往库里插一行)
    if (!opts.skipSave) {
      book.readCount += 1
      saveBook(book)
    }
  })
  .catch(err => {
    console.log(err)
    hideViewerLoading()
    ipcRenderer.invoke('set-viewer-active', false)
    if (viewerHeartbeat) { clearInterval(viewerHeartbeat); viewerHeartbeat = null }
    // 取图失败:丢掉还没消费的跳转目标,不然会漏到下一本上
    pendingJumpIndex = null
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
// 点击 / 滚轮 / 键盘翻页:直接换页,不做滑入动画(用户要求「立马出图」)。
// 拖动翻页的连续性由 onImagePanEnd 自己接管,不经过这里的动画。
const turnPage = (step) => {
  if (!step) return
  const next = currentImageIndex.value + step
  if (next < 0) return
  currentImageIndex.value = next // setter 会夹住上限,并在越过最后一页时触发「阅读完成后」
  nextTick(() => {
    const el = drawerViewerBody.value
    if (el) { el.scrollTop = 0; el.scrollLeft = 0 }
    // 立即复位(不做动画):翻页后如果上一次拖动留下 transform,会挡住新页
    const content = document.querySelector('.drawer-image-content')
    if (content) {
      if (content.getAnimations) content.getAnimations().forEach(a => a.cancel())
      content.style.transform = ''
    }
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
  } else if (imageStyleType.value === 'horizontal') {
    // ⚠ 横向翻页(默认模式)原来根本没有分支:点缩略图/从第 N 页进入都不跳,
    //   一直停在第一页 —— 用户反馈「预览还是先跳第一页」的根因
    const index = _.findIndex(viewerImageList.value, { id })
    if (index >= 0) {
      currentImageIndex.value = index
      nextTick(() => { getCurrentImageId(); scrollCurrentThumbnailIntoView() })
    }
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
// 拖动翻页的「等新图就绪再复位」令牌:新一次拖动/换页会让旧回调作废
let dragTurnToken = 0
// 分页拖动时的「相邻页预览」:在视口外侧临时挂上一张/下一张的图,
// 拖动时当前页跟手平移,相邻页就从边上滑进来 —— 这样才「看得见下一张」。
let imagePeekEls = []
const clearImagePeek = () => {
  for (const el of imagePeekEls) el.remove()
  imagePeekEls = []
}
const buildImagePeek = () => {
  clearImagePeek()
  const content = document.querySelector('.drawer-image-content')
  if (!content || !isPaging.value || isZoomedIn.value) return
  const idx = currentImageIndex.value
  const frames = imageStyleType.value === 'double' ? viewerImageListDouble.value : viewerImageList.value
  const prevFrame = idx > 0 ? frames[idx - 1] : null
  const nextFrame = idx < frames.length - 1 ? frames[idx + 1] : null
  const dir = readingDirection.value
  const place = (frame, isPrev) => {
    if (!frame) return
    const isDoubleFrame = Array.isArray(frame.page)
    const pages = (isDoubleFrame ? frame.page : [frame]).filter(Boolean)
    if (!pages.length) return
    const wrap = document.createElement('div')
    wrap.className = 'viewer-image-peek'
    // 预览要按「真实排布」整屏搬过来:单页一张,双页两张并排。
    // ⚠️ 不能把每张都做成 absolute inset:0 —— 双页的两张会完全重叠,
    // 看起来就是「双页拖动只预览了一张」。这里用 flex 行 + frameStyle 出图,
    // 尺寸和当前页那张严格一致,滑进来时才对得上。
    Object.assign(wrap.style, {
      position: 'absolute', pointerEvents: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    })
    const mode = isDoubleFrame ? 'double' : 'single'
    const row = document.createElement('div')
    // 和「分页双页」的 .viewer-image-frame-double 一致:两张同高对齐、整块居中
    Object.assign(row.style, {
      display: 'flex',
      flexDirection: isDoubleFrame && dir === 'rtl' ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
    })
    for (const p of pages) {
      const size = frameStyle(p, mode)
      const img = document.createElement('img')
      img.src = imageSrc(p)
      Object.assign(img.style, { display: 'block', flex: '0 0 auto', maxWidth: '100%' })
      if (size.width) img.style.width = size.width
      if (size.height) img.style.height = size.height
      row.appendChild(img)
    }
    wrap.appendChild(row)
    // 用「两侧同时定位」把预览撑成和当前页一样大。
    // 贴哪一侧由「方向」决定:上下 → 上下两侧;左右 / 右左 → 左右两侧(方向只决定左右顺序)
    if (dir === 'vertical') {
      wrap.style.left = '0'; wrap.style.right = '0'
      wrap.style.top = isPrev ? '-100%' : '100%'
      wrap.style.bottom = isPrev ? '100%' : '-100%'
    } else {
      wrap.style.top = '0'; wrap.style.bottom = '0'
      if (dir === 'rtl') { wrap.style.left = isPrev ? '100%' : '-100%'; wrap.style.right = isPrev ? '-100%' : '100%' }
      else { wrap.style.left = isPrev ? '-100%' : '100%'; wrap.style.right = isPrev ? '100%' : '-100%' }
    }
    content.appendChild(wrap)
    imagePeekEls.push(wrap)
  }
  place(prevFrame, true)
  place(nextFrame, false)
}
const onImagePanStart = (event) => {
  if (event.button !== 0) return
  if (panState) return // 图片和内容层都会冒泡到这里,别重复进入
  const el = drawerViewerBody.value
  if (!el) return
  // 上一次拖动/翻页的动画可能被打断(onfinish 就不触发) —— 先把残留的位移和相邻页预览清干净,
  // 否则新一次拖动从偏移的位置开始,看起来就是「图片中间有空隙」。
  dragTurnToken += 1
  const content = document.querySelector('.drawer-image-content')
  if (content) {
    if (content.getAnimations) content.getAnimations().forEach(a => a.cancel())
    content.style.transform = ''
  }
  clearImagePeek()
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
  if (isPaging.value && !isZoomedIn.value) {
    // 分页 + 未放大:跟手平移 + 两侧露出相邻页(松手翻页)。
    // 只沿主轴平移 —— 任意方向乱拖会让人觉得"能随便拽"。
    const content = document.querySelector('.drawer-image-content')
    if (content) {
      if (!imagePeekEls.length) buildImagePeek()
      // 跟手平移只走「翻页主轴」:上下 → 纵向(dy),左右 / 右左 → 横向(dx)。
      // 另一轴锁死,免得斜着拖时画面乱跑。
      const axis = readingDirection.value === 'vertical' ? 'y' : 'x'
      const main = axis === 'y' ? dy : dx
      const prog = Math.min(1, Math.abs(main) / 160)
      for (const pk of imagePeekEls) pk.style.opacity = String(0.55 + 0.45 * prog)
      content.style.transform = axis === 'y'
        ? 'translate(0px, ' + dy + 'px)'
        : 'translate(' + dx + 'px, 0px)'
    }
  } else {
    // 溢出多少就允许拖多少:没溢出的轴不动(否则画面斜着跑),溢出(放大)了才能拖动查看
    if (el.scrollWidth > el.clientWidth + 1) el.scrollLeft = panState.left - dx
    if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = panState.top - dy
  }
  if (event.cancelable) event.preventDefault()
}
const onImagePanEnd = (event) => {
  window.removeEventListener('mousemove', onImagePanMove)
  window.removeEventListener('mouseup', onImagePanEnd)
  const content = document.querySelector('.drawer-image-content')
  if (panState && panState.moved) {
    // 拖动过就别再触发「点击翻页」
    suppressClickUntil = Date.now() + 250
    // 分页 + 没放大:拖动 = 翻页(卷轴 / 放大查看时仍然是平移)
    if (event && isPaging.value && !isZoomedIn.value && !showThumbnail.value) {
      const dx = event.clientX - panState.x
      const dy = event.clientY - panState.y
      const dir = readingDirection.value
      // 与跟手一致:走翻页主轴(上下 → 纵向,左右 / 右左 → 横向)
      const axis = dir === 'vertical' ? 'y' : 'x'
      const main = axis === 'y' ? dy : dx
      if (Math.abs(main) > 48) {
        // 「往哪个方向拖 = 下一页」跟预览位置严格对应:拖动露出的是哪一页,松手就翻到哪一页。
        //   上下:往上拖(main<0)→ 内容上移,露出下方 = 下一页
        //   左右:往左拖(main<0)→ 内容左移,露出右侧 = 下一页
        //   右左:往右拖(main>0)→ 内容右移,露出左侧 = 下一页
        // ⚠️ 别把 vertical 并到 rtl 那一支:那样往下拖会「看到上一页、翻到下一页」,看起来就是一次跳两页。
        const forward = dir === 'rtl' ? main > 0 : main < 0
        const step = forward ? 1 : -1
        if (!content) { clearImagePeek(); turnPage(step); panState = null; return }
        // 先把整条「轨道」滑完剩下的一屏 —— 相邻页这时正好滑到视口中央,
        // 再提交换页并复位(同一张图、同一个位置),全程连续。
        const size = (axis === 'y' ? content.clientHeight : content.clientWidth) || 1
        const move = axis === 'y' ? 'translateY(' : 'translateX('
        const offset = main >= 0 ? size : -size
        const from = move + main + 'px)'
        const end = move + offset + 'px)'
        const anim = content.animate([{ transform: from }, { transform: end }], {
          duration: 200, easing: 'cubic-bezier(.22,.61,.36,1)'
        })
        const token = ++dragTurnToken
        anim.onfinish = () => {
          if (token !== dragTurnToken) return
          content.style.transform = end
          turnPage(step)
          // 关键:先别删相邻页预览。此时整条轨道停在 end,预览页正好铺满视口;
          // 等新页的 <img> 真正解码完成,再把轨道复位、撤掉预览 ——
          // 以前是「先删预览、马上复位」,新图还没解码,中间就白闪一下。
          nextTick(() => {
            if (token !== dragTurnToken) return
            const imgs = [...document.querySelectorAll(
              '.viewer-paging .viewer-image-frame > img, .viewer-paging .viewer-image-frame-double > img'
            )]
            const pending = imgs.filter(img => !(img.complete && img.naturalWidth > 0))
            let settled = false
            const reveal = () => {
              if (settled || token !== dragTurnToken) return
              settled = true
              content.style.transform = ''
              clearImagePeek()
            }
            if (!pending.length) { reveal(); return }
            let left = pending.length
            const one = () => { left -= 1; if (left <= 0) reveal() }
            for (const img of pending) {
              img.addEventListener('load', one, { once: true })
              img.addEventListener('error', one, { once: true })
            }
            // 兜底:网络/在线页解析失败时也不能一直停在预览上
            setTimeout(reveal, 400)
          })
        }
        panState = null
        return
      }
    }
  }
  // 没翻页:平滑回到原位
  clearImagePeek()
  if (content) {
    const from = content.style.transform
    content.style.transform = ''
    if (from) content.animate([{ transform: from }, { transform: 'translate(0px, 0px)' }], { duration: 200, easing: 'ease-out' })
  }
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
if (viewerHeartbeat) { clearInterval(viewerHeartbeat); viewerHeartbeat = null }
}

// ---------- 阅读器惯性滚动(仅卷轴模式) ----------
let viewerInertiaDetach = null
const attachViewerInertia = () => {
  if (viewerInertiaDetach) return
  const el = document.querySelector('.viewer-drawer .drawer-viewer-body')
  if (!el) return
  viewerInertiaDetach = attachInertiaScroll(el, {
    getParams: () => ({
      enabled: setting.value.inertiaEnabled !== false,
      friction: setting.value.inertiaFriction,
      maxVelocity: setting.value.inertiaMaxVelocity,
      follow: setting.value.inertiaFollow,
    }),
    // 轴:文字横排卷轴纵向、文字竖排横向;图片横向整排横向、纵向卷轴纵向
    getAxis: () => (isNovelMode.value
      ? (novelDirection.value === 'vertical' ? 'y' : 'x')
      : (isScrollHorizontal.value ? 'x' : 'y')),
    // 只给图片卷轴用。文字·横排卷轴改成正文容器自己原生滚动(见 .novel-scrollv),
    // 再让这套「自己 preventDefault + rAF 改 scrollTop」的惯性接管,就会和原生滚动互相拉 → 卡在原地跳。
    shouldIntercept: () => (isNovelMode.value ? false : imageStyleType.value === 'scroll')
  })
}

const onMangaImageContextMenu = (e, image) => {
  e.preventDefault()
  // EH在线 的页:本地那套(复制图片/设封面/重命名/超分/OCR/删除)对它没意义,
  // 只给「下载本页 / 下载本页(原图)」(与 JHenTai 在线阅读的下载动作对应)
  if (image && image.online) {
    const book = bookDetail.value || {}
    const pageName = (book.title || 'eh') + ' - ' + (viewerImageList.value.findIndex(x => x.id === image.id) + 1)
    ContextMenu.showContextMenu({
      x: e.x,
      y: e.y,
      items: [
        {
          id: 'downloadPage',
          label: t('m.downloadPage'),
          onClick: () => emit('downloadPage', { url: image.rawUrl, originalUrl: image.originalUrl, pageUrl: image.pageUrl, original: false, name: pageName })
        },
        {
          id: 'downloadPageOriginal',
          label: t('m.downloadPageOriginal'),
          onClick: () => emit('downloadPage', { url: image.rawUrl, originalUrl: image.originalUrl, pageUrl: image.pageUrl, original: true, name: pageName })
        },
        {
          id: 'copyImageUrl',
          label: t('m.downloadCopyImageUrl'),
          onClick: () => ipcRenderer.invoke('copy-text-to-clipboard', image.rawUrl || '')
        }
      ]
    })
    return
  }
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
  // 缩略图界面:滚轮/触控板只用来滚缩略图列表,不翻页、不缩放
  if (showThumbnail.value) return
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    zoomByWheel(event)
    return
  }
  if (imageStyleType.value === 'scroll') {
    if (isScrollHorizontal.value) {
      // 用户自己滚了:先取消「自动贴边」—— 贴边的定时器会把视口拽回第一张,
      // 和惯性互相拉,表现就是一直在第一张来回弹、滚不到新页
      pinHorizontalStart = false
      // 开了惯性就交给 attachInertiaScroll(横向轴)去做,这里别再滚一次
      if (setting.value.inertiaEnabled !== false) return
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
  if (isNovelMode.value) { scheduleNovelProgress(); return } // 文字横排卷轴滚在外层
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
// 卷轴模式:当前页由滚动位置决定(currentImageId 变化),同样推进预加载窗口,
// 否则往下滚到第 50 页时那一片还没解析,一直在转圈。
watch(currentImageId, (id) => {
  if (!id) return
  if (!bookDetail.value || !bookDetail.value.online) return
  if (imageStyleType.value !== 'scroll') return
  const idx = viewerImageList.value.findIndex(it => it.id === id)
  if (idx >= 0) enqueuePreloadWindow(idx)
})
watch(currentImageIndex, () => {
  // 在线阅读:翻页时把「离当前页近的页」提到解析队列前面 ——
  // 不重排的话,翻到第 30 页时它还在整本队列的尾巴上,看着就是「一直正在解析」
  if (bookDetail.value && bookDetail.value.online) {
    let pageIdx = currentImageIndex.value
    if (imageStyleType.value === 'double') {
      // 双页模式 currentImageIndex 是「屏」序号,换算成这一屏第一页的页码
      const frame = viewerImageListDouble.value[pageIdx]
      const firstId = frame && frame.page && frame.page[0] && frame.page[0].id
      const found = firstId ? viewerImageList.value.findIndex(im => im.id === firstId) : -1
      if (found >= 0) pageIdx = found
    }
    prioritizeOnlineQueue(pageIdx)
    // 翻页时推进预加载窗口(不再是「整本一次性入队」):只补当前页附近的页
    enqueuePreloadWindow(pageIdx)
  }
  triggerAutoUpscaleForCurrentPage()
  scrollCurrentThumbnailIntoView()
  // 翻到最后一页时给一次「已到最后一页」提示
  if (imageStyleType.value === 'scroll') return
  const frames = imageStyleType.value === 'double' ? viewerImageListDouble.value : viewerImageList.value
  if (frames.length && currentImageIndex.value >= frames.length - 1) maybeTipLastPage()
})
// 相邻页预解码:换页时新图已经在内存里解码好,切过去就不会先白一下再出来。
// ⚠️ 必须放在 currentImageIndex 定义之后 —— 放在前面会因 TDZ 直接让整个阅读器组件挂掉,
//    表现就是页面提示「阅读器不可用,已打开详细界面」。
watch(currentImageIndex, () => {
  const frames = imageStyleType.value === 'double' ? viewerImageListDouble.value : viewerImageList.value
  const idx = currentImageIndex.value
  for (const off of [-1, 1]) {
    const frame = frames[idx + off]
    if (!frame) continue
    const pages = frame.page ? frame.page : [frame]
    for (const p of pages) {
      if (!p) continue
      try {
        const im = new Image()
        im.src = imageSrc(p)
        if (im.decode) im.decode().catch(() => {})
      } catch (e) { /* 忽略 */ }
    }
  }
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
// 每页图片的真实下载进度(0~1),供占位的环形进度使用(照 JHenTai 的 loadingProgressWidgetBuilder)。
// 由主进程 emm-eh:// 协议在读取响应体时回传(见 index.js 的 onImgProgress)。
const loadedProgress = ref({})
// ⚠ 进度事件非常密集:一张图按块回推,几十次/张;读一页就是上百次更新。
//   以前每次 `loadedProgress.value = { ...old, [id]: p }` 都换一个**新对象**,
//   等于让所有引用它的模板全部失效重算 —— 观感就是「进度一格一格地卡」。
//   现在:同一帧内的多次更新合并成一次提交。
const pendingProgress = new Map()
let progressRaf = null
const flushProgress = () => {
  progressRaf = null
  if (!pendingProgress.size) return
  const target = loadedProgress.value
  for (const [id, p] of pendingProgress) target[id] = p
  pendingProgress.clear()
  // 换一次引用以触发响应式(一帧一次,而不是每个事件一次)
  loadedProgress.value = { ...target }
}
const setImageProgress = (id, p) => {
  // 已经加载完的页不必再更新
  if (loadedImages.value[id]) return
  pendingProgress.set(id, p)
  if (!progressRaf) progressRaf = requestAnimationFrame(flushProgress)
}
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

// ── 文字模式(txt / 纯文字 epub):跟随主题配色,字号行距可当场调 ──

// 文字模式补全:章节标题 / 插图原位 / 单双栏 / 竖排 / 目录
.novel-chapter
  margin: 2.2em 0 1em
  padding-top: .6em
  font-size: calc(var(--novel-font-size, 19px) * 1.25)
  font-weight: 700
  letter-spacing: .04em
  text-align: center
  border-top: 1px solid var(--el-border-color-lighter, rgba(0, 0, 0, .08))
  &:first-child
    border-top: none
    margin-top: 0
.novel-heading
  margin: 1.6em 0 .6em
  font-size: calc(var(--novel-font-size, 19px) * 1.15)
  font-weight: 700
.novel-image
  display: block
  max-width: min(100%, 720px)
  height: auto
  margin: 1.4em auto
  border-radius: 4px
.novel-two-col .novel-body
  max-width: 1180px
.novel-body
  column-count: 1
  column-gap: 42px
// 右左(分页):整个滚动容器转 RTL —— 列的排列和 scrollLeft 语义一起反过来,
// 两页位置才真的互换;正文块本身保持 LTR,免得标点与对齐跟着反。
// 文字·横排卷轴:自己不做滚动容器,纵向滚动交给外层 .drawer-viewer-body ——
// 那里挂着「设置 → 高级 → 惯性移动」,滚轮才有惯性、不会一格一格卡。
// 顺带解决「卷轴下方内容被遮挡」:滚动范围由外层统一算,不会少算底部那截。
.drawer-novel-content.novel-scrollv
  // 自己滚:用浏览器原生滚动 —— 以前把滚动交给外层 .drawer-viewer-body 的「惯性模块」,
  // 那套是给图片整页滚动写的(自己 preventDefault + rAF 改 scrollTop),
  // 放在长文本上就是「滚一点被拉回去、一直卡在当前页跳动」,而且外层滚动条被全局样式隐藏了。
  overflow-y: auto
  overflow-x: hidden
  height: 100%
  overscroll-behavior: contain
  scrollbar-width: thin
  // 竖向滚动条:细一点、半透明,别和正文抢视线
  &::-webkit-scrollbar
    width: 10px
  &::-webkit-scrollbar-track
    background: transparent
  &::-webkit-scrollbar-thumb
    background: var(--el-border-color, rgba(0, 0, 0, .22))
    border-radius: 5px
    border: 2px solid transparent
    background-clip: padding-box
  &::-webkit-scrollbar-thumb:hover
    background: var(--el-text-color-disabled, rgba(0, 0, 0, .38))
    background-clip: padding-box
.drawer-novel-content.novel-rtl
  direction: rtl
.drawer-novel-content.novel-rtl .novel-body > *
  direction: ltr
// 卷轴模式的方向 = 书写方向:左右/右左 → 竖排。
// 类挂在外层滚动容器上:writing-mode 会继承给正文,滚动也归容器(竖排读的是横向)。
.drawer-novel-content.novel-dir-ltr
  writing-mode: vertical-lr
  text-orientation: mixed
  overflow-x: auto
  overflow-y: hidden
.drawer-novel-content.novel-dir-rtl
  writing-mode: vertical-rl
  text-orientation: mixed
  overflow-x: auto
  overflow-y: hidden
.drawer-novel-content.novel-dir-ltr,
.drawer-novel-content.novel-dir-rtl
  display: flex
  // 「宽度占比」的宽度由 novelBoxStyle 的内联 width 给 —— 别在这里写死 width,
  // 内联样式才能压住基础样式的 width: 100%(否则 100% + 两侧 margin 会撑出父容器)。
.drawer-novel-content.novel-dir-ltr .novel-body,
.drawer-novel-content.novel-dir-rtl .novel-body
  max-width: none
  height: 100%
  // ⚠️ 必须 border-box:novelStyle 会给正文设 height: pct%(「宽度占比」= 每列的上下长度)。
  // content-box 下垂直 padding(56+140=196)顶在 height 之外,导致 pct 一大就被夹在
  // 「父高 - 196」上 —— 实测 100% 和 90% 算出完全相同的 879px、80% 只差 19px,
  // 用户点 100→90→80 看不出任何变化,这就是「卷轴左右宽度无效」的真因。
  box-sizing: border-box
  // 竖排容器用 flex + margin:auto:列高调小后正文仍居中,不会全堆到上方
  margin: auto
.novel-toc
  padding: 12px 8px
// 分页(单页)模式:滚轮一屏一翻,滚动条隐藏
// 分页:不再使用「横向多列」——外层只负责尺寸与交互,裁剪与纵向平移在页窗口里完成。
.drawer-novel-content.novel-paged
  // 分页模式不给手动滚动:只能一页页翻
  overflow: hidden
  // 「宽度占比」靠容器两侧 margin 实现(novelBoxStyle),所以不能再写 width:100%
  width: auto
  display: flex
  justify-content: center
  user-select: none
  -webkit-user-select: none
  cursor: pointer
  // 手势自己处理:不让浏览器把横滑当成选择/前进后退(否则会 pointercancel,横滑失效)
  touch-action: none
  &::-webkit-scrollbar
    width: 0
    height: 0
  .novel-image
    max-height: 58vh
  // 「适应」= 正文宽度占比:每个内容块缩到占比宽度并居中
  .novel-body > *
    max-width: var(--novel-text-width, 100%)
    margin-left: auto
    margin-right: auto

// 一屏 = 1 页(单页)或 2 页(双页):两个页窗口并排
.novel-page-pair
  display: flex
  flex-direction: row
  gap: 8px
  width: 100%
  height: 100%
// 右左:两页顺序反过来(下一页码的页在左边)
.novel-page-pair.novel-pair-rtl
  flex-direction: row-reverse
.novel-page-window
  flex: 1 1 0
  min-width: 0
  height: 100%
  // 兜底:页内容绝不允许溢出到窗口之外
  overflow: hidden
// 每页的裁剪窗口:固定高度,超出部分裁掉
.novel-page-clip
  height: 100%
  overflow: hidden
  box-sizing: border-box
  // 页内留白:上下 26/48、左右 22 全部收到约 1/4
  padding: 6px 6px 12px
// 精确页高的裁剪窗:必须在这里裁,不能只靠外层的 padding box
// (外层 overflow:hidden 会把底部 padding 区也算进去,下一行会露出上半截)
.novel-page-viewport
  overflow: hidden
  width: 100%
// 正文:整块流式内容,靠 margin-top 负值整页平移
.novel-body.novel-body-paged
  max-width: none
  width: 100%
  margin: 0
  padding: 0
  position: relative
  // 段间距归零:整块正文每行等高,页高才能正好是整数行(页边界永不切行)
.novel-body-paged .novel-para
  margin: 0
.novel-body-paged .novel-chapter
  margin: 0
  padding: 0
  box-sizing: border-box
  // ⚠️ 高度必须是「行高的整数倍」,而且 em 要按正文字号算:
  // 标题字号是正文的 1.25 倍,直接写 2em 会算出非整行的高度,
  // 从每个标题开始,后面所有行的位置都会错开 —— 页边界就切到行中间了。
  height: calc(var(--novel-line-height, 1.9) * var(--novel-font-size, 19px) * 2)
  line-height: calc(var(--novel-line-height, 1.9) * var(--novel-font-size, 19px) * 2)
.novel-body-paged .novel-heading
  margin: 0
  padding: 0
  box-sizing: border-box
  height: calc(var(--novel-line-height, 1.9) * var(--novel-font-size, 19px))
  line-height: calc(var(--novel-line-height, 1.9) * var(--novel-font-size, 19px))
.novel-body-paged .novel-image
  break-inside: avoid
.novel-toc-item
  padding: 8px 10px
  border-radius: 4px
  font-size: 14px
  line-height: 1.5
  cursor: pointer
  &:hover
    background: var(--el-fill-color-light, rgba(0, 0, 0, .05))
.drawer-novel-content
  user-select: none          // 禁止复制(和图片阅读器一致)
  -webkit-user-select: none
  width: 100%
  height: 100%
  overflow-y: auto
  overflow-x: hidden
  background: var(--el-bg-color, #fff)
  color: var(--el-text-color-primary, #303133)
  -webkit-overflow-scrolling: touch
.novel-body
  max-width: 820px
  margin: 0 auto
  padding: 30px 32px 30px
  font-size: var(--novel-font-size, 19px)
  line-height: var(--novel-line-height, 1.9)
  font-family: var(--novel-font-family, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)
  letter-spacing: var(--novel-letter-spacing, .02em)
.novel-para
  margin: 0 0 .9em
  text-indent: 2em
  white-space: pre-wrap
  overflow-wrap: break-word
  word-break: break-word
  text-align: justify
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
  // 横向整排只横向滚:纵向一律不出滚动条(页码标签把内容撑高时也一样)。
  // clip 比 hidden 更彻底 —— 连编程滚动都不给,自然不会冒出右侧滚动条。
  overflow-y: clip
  .viewer-horizontal-item
    max-height: 100%

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
// 文字排版的下拉输入框(字体 / 行距 / 间距):可下拉选,也可直接手输
.viewer-toolbar-select
  width: 108px
  margin-left: 2px
  .el-select__wrapper
    padding: 0 6px
// 行距 / 间距:只要输入框(不要下拉)
.viewer-toolbar-input
  width: 62px
  margin-left: 2px
  .el-input__wrapper
    padding: 0 6px

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

// 加载遮罩(可关闭)
.viewer-loading-overlay
  position: absolute
  inset: 0
  z-index: 60
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  gap: 14px
  background: var(--el-mask-color, rgba(0, 0, 0, .55))
  color: #fff
  .viewer-loading-overlay-text
    font-size: 14px
    max-width: 70%
    text-align: center
    word-break: break-all
  .viewer-loading-overlay-close
    margin-top: 4px

// 分页模式下压在图片上的占位
.viewer-page-placeholder-abs
  position: absolute
  inset: 0
  z-index: 5
  background-color: var(--el-fill-color-light)

// 分页双页:每一页各自占一格(占位与图片都按页渲染)。
// 以前占位是 absolute 全帧覆盖,双页下两张占位叠在一起只能看到一张进度条。
// aspect-ratio 按「图片宽高比」给这一页留出和图一样的位置,解析好后图片顶替它,布局不跳。
.viewer-page-slot
  position: relative
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  flex: 0 0 auto
  box-sizing: border-box
  overflow: hidden
  background-color: var(--el-fill-color-light)

// 缩略图等待占位(在线页还没解析出地址时)
.sidebar-thumbnail-wait
  display: flex
  align-items: center
  justify-content: center
  min-height: 60px
  background-color: var(--el-fill-color-light)
.viewer-thumbnail-wait
  display: flex
  align-items: center
  justify-content: center
  height: 120px
  background-color: var(--el-fill-color-light)

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
      // 图片还没下载完时先垫一层深色底,避免「加载中发白」
      background: var(--el-fill-color-dark)
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

// 分页拖动时相邻页的定位基准 / 外观
.drawer-image-content
  position: relative
.viewer-image-peek
  opacity: .9

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
  // 缩略图界面交给 .drawer-viewer-body 原生滚动(见模板里的 class 绑定):
  // 内边距用 padding(不再靠 margin 外扩),高度用 min-height(不再写死 100vh),
  // 这样「内容超过一屏才滚、没超过就不滚」。
  padding: 16px
  min-height: 100%
  box-sizing: border-box
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