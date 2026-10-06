<template>
  <el-config-provider :locale="localeFile">
    <!-- 网页版账户登录(启用账户系统且未登录时显示) -->
    <LoginDialog />
    <el-button v-if="setting.showFullscreenButton !== false" class="fullscreen-button" circle :icon="FullScreen" size="large" @click="switchFullscreen"></el-button>
    <el-row :gutter="20" class="book-search-bar">
      <el-col :span="24">
        <div class="toolbar-flex" :style="toolbarWidth ? { width: toolbarWidth + 'px' } : {}">
          <!-- 工具栏元素:显示项与排列顺序都在 设置 → 高级 → 工具栏按钮 里调整(设置按钮始终保留) -->
          <template v-for="id in toolbarOrderIds" :key="id">
            <!-- 搜索输入框 -->
            <el-autocomplete
              v-if="id === 'searchInput'"
              :model-value="searchString"
              :fetch-suggestions="querySearch"
              @keyup.enter="searchBook"
              @change="handleSearchStringChange"
              @input="handleInput"
              clearable
              :trigger-on-focus="false"
              class="search-input"
            >
              <template #default="{ item }">
                <span class="autocomplete-label">{{ item.label }}</span>
                <span class="autocomplete-value">{{ item.value }}</span>
              </template>
            </el-autocomplete>
            <!-- 搜索按钮 -->
            <el-button v-else-if="id === 'searchButton'" type="primary" :icon="Search32Filled" plain @click="searchBook" :title="$t('m.search')"></el-button>
            <!-- 排序/筛选:方向由箭头单独切换 -->
            <div v-else-if="id === 'sortSelect'" class="sort-select-wrap">
              <el-select class="sort-select" :placeholder="$t('m.sort_filter')" clearable v-model="sortBaseValue">
                <el-option-group :label="$t('m.filter')">
                  <el-option :label="$t('m.all')" value=""></el-option>
                  <el-option :label="$t('m.bookmarkOnly')" value="mark"></el-option>
                  <el-option :label="$t('m.collectionOnly')" value="collection"></el-option>
                  <el-option :label="$t('m.hiddenOnly')" value="hidden"></el-option>
                  <el-option :label="$t('m.recentReadOnly')" value="recentRead"></el-option>
                </el-option-group>
                <el-option-group :label="$t('m.sort')">
                  <el-option :label="$t('m.shuffle')" value="shuffle"></el-option>
                  <el-option :label="$t('m.addTime')" value="addTime"></el-option>
                  <el-option :label="$t('m.mtime')" value="mtime"></el-option>
                  <el-option :label="$t('m.postTime')" value="postTime"></el-option>
                  <el-option :label="$t('m.rating')" value="rating"></el-option>
                  <el-option :label="$t('m.readCount')" value="readCount"></el-option>
                  <el-option :label="$t('m.artist')" value="artist"></el-option>
                  <el-option :label="$t('m.title')" value="title"></el-option>
                  <el-option :label="$t('m.page')" value="page"></el-option>
                </el-option-group>
              </el-select>
              <el-button
                class="sort-dir-btn"
                plain
                :title="sortDirection === 'asc' ? $t('m.sortAsc') : $t('m.sortDesc')"
                @click="toggleSortDirection"
              >{{ sortDirection === 'asc' ? '↑' : '↓' }}</el-button>
            </div>
            <!-- UI 模式切换:自动 → 手机 → 平板 → 电脑(桌面客户端与网页版都有) -->
            <el-button v-else-if="id === 'uiMode'" :icon="uiModeIcon" plain @click="switchUiMode" :title="$t('m.switchUiMode') + ': ' + $t(uiModeLabelKey)"></el-button>
            <!-- 设置按钮:与界面模式按钮一套样式(纯 plain,图标不跟主色调) -->
            <el-button v-else-if="id === 'setting'" :icon="SettingIcon" plain @click="$refs.SettingRef.dialogVisibleSetting = true" :title="$t('m.setting')"></el-button>
            <!-- 可自定义的界面按钮 -->
            <el-button
              v-else-if="toolbarButtonMap[id]"
              type="primary"
              :icon="toolbarButtonMap[id].icon"
              plain
              :title="$t(toolbarButtonMap[id].titleKey)"
              :loading="toolbarButtonMap[id].loading"
              @click="toolbarButtonMap[id].action()"
            ></el-button>
          </template>
          <!-- 合集/标签编辑按钮(仅编辑视图显示;管理入口已并入可自定义工具栏按钮) -->
          <div class="edit-btn-group">
            <el-button type="primary" plain v-if="editCollectionView" @click="$refs.EditViewRef.addCollection()" :icon="Collections24Regular" :title="$t('m.addCollection')"></el-button>
            <el-button type="primary" plain v-if="editCollectionView" @click="$refs.EditViewRef.editCollection()" :icon="Edit" :title="$t('m.editCollection')"></el-button>
            <el-button type="primary" plain v-if="editCollectionView" @click="$refs.EditViewRef.saveCollection()" :icon="Save16Regular" :title="$t('m.save')"></el-button>
            <el-button type="primary" plain v-if="editCollectionView" @click="$refs.EditViewRef.exitCollectionView()" :icon="MdExit" :title="$t('m.exit')"></el-button>
            <el-button type="primary" plain v-if="editTagView" @click="$refs.EditViewRef.exitEditTagView()" :icon="MdExit" :title="$t('m.exit')"></el-button>
          </div>
          <!-- 设置按钮已并入上面的排序序列(常驻,不可隐藏) -->
          <!-- 上下文按钮(仅 Win 远程桌面模式) = 服务器配置 -->
          <el-button v-if="showContextButton" :icon="contextButton.icon" plain @click="contextButton.action()" :title="$t(contextButton.titleKey)"></el-button>
        </div>
      </el-col>
    </el-row>
    <RandomTags
      ref="randomTagsRef"
      v-if="!editTagView && !editCollectionView && (setting.randomTagsEnabled || setting.showCollectTag)"
      @search="handleSearchString"
    />
    <el-row :gutter="20" class="book-card-area">
      <el-col :span="24" v-if="!editTagView && !editCollectionView" class="book-card-list" :style="{height: (setting.randomTagsEnabled || setting.showCollectTag) ? 'calc(100vh - 134px)' : 'calc(100vh - 96px)'}">
        <div
          v-for="(book, index) in visibleRenderedBookList"
          :key="book.id"
          class="book-card-frame"
          :tabindex="index + 1"
        >
          <transition name="pop">
            <!-- show book card when book isn't a collection, book isn't hidden because collected,
              and book isn't hidden by user except sorting by onlyHiddenBook
              and book isn't hidden by folder select -->
            <BookCard
              :book="book"
              v-if="!book.isCollection && !book.collectionHide && (sortValue === 'hidden' || !book.hiddenBook) && !book.folderHide"
              @open-book-detail="$refs.BookDetailDialogRef.openBookDetail(book)"
              @handle-click-cover="handleClickCover(book)"
              @on-book-context-menu="onBookContextMenu"
              @handle-search-string="handleSearchString"
              @search-from-tag="searchFromTag"
              @tag-long-press="openQuickTagEdit"
              @cover-click="onCoverClick(book)"
              @cover-dblclick="onCoverDblClick(book)"
              @yue-click="onYueClick(book)"
              @du-click="onDuClick(book)"
              @page-count-click="onPageCountClick(book)"
              @open-local-book="$refs.BookDetailDialogRef.openLocalBook(book)"
            />
            <BookCardCollection
              :book="book"
              v-else-if="book.isCollection && !book.folderHide"
              @open-collection="openCollection(book)"
            />
          </transition>
        </div>
        <!-- 逐排加载哨兵:滚动到这里时继续加载下一排 -->
        <div ref="renderSentinel" class="render-sentinel"></div>
      </el-col>
      <EditView
        ref="EditViewRef"
        @preview-manga="previewManga"
        @search-from-tag="searchFromTag"
        @load-book-list="loadBookList"
        @get-books-metadata="(bookList, gap, callback) => $refs.SearchDialogRef.getBooksMetadata(bookList, gap, callback)"
        @handle-remove-book-display="handleRemoveBookDisplay"
        @tag-long-press="openQuickTagEdit"
      />
    </el-row>
    <el-row class="pagination-bar">
      <el-pagination
        v-model:currentPage="currentPage"
        v-model:page-size="setting.pageSize"
        :page-sizes="pageSizeOptions"
        size="small"
        layout="total, sizes, prev, pager, next, jumper"
        :total="displayBookCount"
        @size-change="handleSizeChange"
        @current-change="handleCurrentPageChange"
        background
      />
    </el-row>
    <el-drawer v-model="drawerVisibleCollection"
      direction="btt"
      size="calc(100vh - 60px)"
      destroy-on-close
      class="collection-drawer"
    >
      <template #header>
        <div>
          <span class="open-collection-title">{{openCollectionTitle}}</span>
          <el-button type="primary" :icon="Edit" plain link class="collection-edit-button" @click="editCurrentCollection"/>
        </div>
      </template>
      <div class="collection-book-card-list">
        <div
          v-for="(book, index) in openCollectionBookList"
          :key="book.id"
          class="book-card-frame"
        >
          <BookCard
            :book="book"
            :tabindex="index + 1"
            @open-book-detail="$refs.BookDetailDialogRef.openBookDetail(book)"
            @handle-click-cover="handleClickCover(book)"
            @on-book-context-menu="onBookContextMenu"
            @handle-search-string="handleSearchString"
            @search-from-tag="searchFromTag"
            @tag-long-press="openQuickTagEdit"
            @cover-click="onCoverClick(book)"
            @cover-dblclick="onCoverDblClick(book)"
            @yue-click="onYueClick(book)"
            @du-click="onDuClick(book)"
            @page-count-click="onPageCountClick(book)"
            @open-local-book="$refs.BookDetailDialogRef.openLocalBook(book)"
          />
        </div>
      </div>
    </el-drawer>
    <el-dialog v-model="moveFileDialogVisible" :title="$t('m.moveFile')" width="400px">
      <el-cascader
        v-model="moveFileTargetFolder"
        :options="folderTreeData"
        :props="{ checkStrictly: true }"
        filterable
        clearable
        style="width: 100%"
        :filter-method="filterFolderMethod"
        popper-class="book-tag-edit-cascader-popper"
      />
      <template #footer>
        <el-button @click="moveFileDialogVisible = false">{{$t('c.cancel')}}</el-button>
        <el-button type="primary" @click="confirmMoveFile">{{$t('m.move')}}</el-button>
      </template>
    </el-dialog>
    <!-- 标签快速编辑:长按卡片上的收藏标签(鼠标右键亦可)弹出 -->
    <el-dialog v-model="quickTagDialogVisible" :title="$t('m.quickTagEdit')" width="380px">
      <div v-if="quickTag" class="quick-tag-body">
        <p class="quick-tag-line">
          <el-tag size="small" effect="dark" :color="quickTag.color">{{ quickTag.letter }}:{{ quickTag.tag }}</el-tag>
          <span class="quick-tag-raw">{{ quickTag.cat }}</span>
        </p>
        <p class="quick-tag-line quick-tag-langs">
          <el-input v-model="quickTagLangs['default']" size="small" :placeholder="$t('m.tagNameDefault')" />
          <el-input v-model="quickTagLangs['zh-CN']" size="small" :placeholder="$t('m.tagNameZh')" />
          <el-input v-model="quickTagLangs['zh-TW']" size="small" :placeholder="$t('m.tagNameZhTw')" />
          <el-input v-model="quickTagLangs.ja" size="small" :placeholder="$t('m.tagNameJa')" />
          <el-input v-model="quickTagLangs.en" size="small" :placeholder="$t('m.tagNameEn')" />
          <el-button size="small" type="primary" @click="quickTagSaveLangs">{{ $t('m.saveTagNames') }}</el-button>
        </p>
        <el-input v-model="quickTagNewName" size="small" :placeholder="$t('m.newTagName')" @keyup.enter="quickTagRename" />
      </div>
      <template #footer>
        <div class="quick-tag-actions">
          <el-button size="small" @click="quickTagFilter">{{ $t('m.filterByThisTag') }}</el-button>
          <el-button size="small" @click="quickTagCopy">{{ $t('m.copyTagName') }}</el-button>
          <el-button size="small" @click="quickTagRemoveFromBook">{{ $t('m.removeTagFromThisBook') }}</el-button>
          <el-button size="small" type="primary" :disabled="!quickTagNewName || quickTagNewName === quickTag?.tag" @click="quickTagRename">{{ $t('m.renameTagGlobal') }}</el-button>
          <el-button size="small" type="danger" @click="quickTagDelete">{{ $t('m.deleteTagGlobal') }}</el-button>
        </div>
      </template>
    </el-dialog>
    <BookDetailDialog
      ref="BookDetailDialogRef"
      @open-content-view="openContentView"
      @open-thumbnail-view="openThumbnailView"
      @save-collection="$refs.EditViewRef.saveCollection()"
      @handle-remove-book-display="handleRemoveBookDisplay"
      @open-search-dialog="$refs.SearchDialogRef.openSearchDialog(bookDetail)"
      @get-book-info="$refs.SearchDialogRef.getBookInfo(bookDetail)"
      @search-from-tag="searchFromTag"
      @jump-mange-detail="jumpMangeDetail"
      @add-to-history="addBookToHistory"
    />
    <InternalViewer
      ref="InternalViewerRef"
      @to-next-manga="toNextManga"
      @to-next-manga-random="toNextMangaRandom"
      @update-window-title="updateWindowTitle"
      @rescan-book="(book) => $refs.BookDetailDialogRef.rescanBook(book)"
    />
    <FolderTree ref="FolderTreeRef" @chunk-list="chunkList"/>
    <TagGraph ref="TagGraphRef" @search="handleSearchString"/>
    <SearchDialog ref="SearchDialogRef"/>
    <Setting ref="SettingRef" @load-book-list="loadBookList" @load-collection-list="loadCollectionList"/>
  </el-config-provider>
</template>

<script>
import { defineComponent } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Setting as SettingIcon, FullScreen, Edit } from '@element-plus/icons-vue'
import { ArrowTrendingLines20Filled, Collections24Regular, Search32Filled, Save16Regular } from '@vicons/fluent'
import { MdShuffle, MdRefresh, MdSync, MdCodeDownload, MdExit, MdBook, MdColorPalette, MdFolderOpen, MdCloudDone, MdPhonePortrait, MdTabletPortrait, MdDesktop } from '@vicons/ionicons4'
import { TreeViewAlt, CicsSystemGroup, TagGroup } from '@vicons/carbon'

import { getWidth, fetchRecentReads, isContextMenuItemEnabled, sortContextMenuItems, mergeContextMenuOptions, applyCustomTheme, applyFavicon, applyCoverStyle, applyAppName, defaultToolbarButtons, ensureToolbarButtons, TOOLBAR_NEW_ITEMS, TOOLBAR_ALWAYS_ITEMS, clearCustomTheme, applyPixelTheme, parsePageSizes } from './utils.js'
import { extractCoverColors, pixelateToDataUrl } from './cover-color.js'
import { attachPixelSfx, playPixelSfx } from './pixel-sfx.js'
import { attachInertiaScroll } from './inertia-scroll.js'

import Setting from './components/Setting.vue'
import TagGraph from './components/TagGraph.vue'
import InternalViewer from './components/InternalViewer.vue'
import SearchDialog from './components/SearchDialog.vue'
import BookDetailDialog from './components/BookDetailDialog.vue'
import FolderTree from './components/FolderTree.vue'
import BookCard from './components/BookCard.vue'
import BookCardCollection from './components/BookCardCollection.vue'
import EditView from './components/EditView.vue'
import RandomTags from './components/RandomTags.vue'
import LoginDialog from './components/LoginDialog.vue'

import { mapWritableState, mapActions } from 'pinia'
import { useAppStore } from './pinia.js'

export default defineComponent({
  components: {
    Setting,
    TagGraph,
    InternalViewer,
    SearchDialog,
    BookDetailDialog,
    FolderTree,
    BookCard,
    BookCardCollection,
    EditView,
    RandomTags,
    LoginDialog,
  },
  setup () {
    return {
      SettingIcon, FullScreen, Edit,
      Collections24Regular, Search32Filled, ArrowTrendingLines20Filled, Save16Regular,
      MdRefresh, MdCodeDownload, MdExit, MdShuffle, MdFolderOpen, MdCloudDone,
      MdPhonePortrait, MdTabletPortrait, MdDesktop,
      TreeViewAlt, CicsSystemGroup, TagGroup
    }
  },
  data () {
    return {
      // home
      searchString: '',
      currentPage_: 1,
      progress: 0,
      // 后台扫描是否进行中(用于扫描按钮 loading 与进度条动画)
      scanning: false,
      randomTags: [],
      // 逐排加载:当前页已渲染的卡片数量(滚动到哨兵时按排增加)
      renderedCount: 0,
      renderBatchSize: 24,
      buttonLoadBookListLoading: false,
      buttonGetMetadatasLoading: false,
      actionHistory: [],
      // 工具栏宽度(与下方漫画卡片行对齐,随窗口/封面尺寸自适应)
      toolbarWidth: 0,
      // 上一次「打开下一本」的时间戳(1 秒冷却)
      lastMangaSwitchAt: 0,
      // 混合背景:上次取色用的封面地址 / 滚动节流定时器 / 像素音效解绑函数
      lastAutoThemeCover: null,
      mixBgTimer: null,
      pixelSfxDetach: null,
      // 排序方向(仅排序类有效,筛选/随机无方向)
      sortDirection_: 'desc',
      // collection
      drawerVisibleCollection: false,
      openCollectionTitle: undefined,
      // move file
      moveFileDialogVisible: false,
      moveFileTargetBook: null,
      moveFileTargetFolder: null,
      // UI 模式:auto(随窗口宽度) / phone(手机) / tablet(平板) / desktop(电脑)
      uiMode: 'auto',
      // 标签快速编辑(长按卡片标签):当前标签 / 所属漫画 / 新名字
      quickTagDialogVisible: false,
      quickTag: null,
      quickTagBook: null,
      quickTagNewName: '',
      quickTagLangs: { 'zh-CN': '', ja: '', en: '' },
    }
  },
  computed: {
    ...mapWritableState(useAppStore, [
      'bookTasks',
      'bookTaskPaused',
      'cat2letter',
      'keyMap',
      'categoryOption',
      'setting',
      'bookDetail',
      'bookList',
      'displayBookList',
      'chunkDisplayBookList',
      'collectionList',
      'openCollectionBookList',
      'serviceAvailable',
      'sortValue',
      'editCollectionView',
      'editTagView',
      'folderTreeData',
      'localeFile',
      'displayBookCount',
      'tagList',
      'tag2cat',
      'customOptions',
      'visibleChunkDisplayBookList',
    ]),
    currentPage: {
      get () {
        return this.currentPage_
      },
      set (val) {
        const pageLimit = Math.ceil(this.displayBookCount / this.setting.pageSize)
        if (Number.isInteger(val)) {
          if (val < 1) {
            this.currentPage_ = 1
          } else if (val > pageLimit) {
            this.currentPage_ = pageLimit
          } else {
            this.currentPage_ = val
          }
        }
      }
    },
    // 可自定义的工具栏元素:图标 / 悬浮说明 / 动作(显示顺序由 toolbarOrderIds 决定)
    toolbarButtonMap () {
      return {
        folderTree: { icon: TreeViewAlt, titleKey: 'm.folderTree', loading: false, action: () => this.$refs.FolderTreeRef.openFolderTree() },
        shuffle: { icon: MdShuffle, titleKey: 'm.shuffle', loading: false, action: () => this.shuffleBook() },
        manualScan: { icon: MdRefresh, titleKey: 'm.manualScan', loading: this.buttonLoadBookListLoading || this.scanning, action: () => this.loadBookList(true) },
        incrementalScan: { icon: MdSync, titleKey: 'm.incrementalScan', loading: this.scanning, action: () => this.incrementalScan() },
        batchMetadata: { icon: MdCodeDownload, titleKey: 'm.batchGetMetadata', loading: this.buttonGetMetadatasLoading, action: () => this.getBookListMetadata() },
        tagAnalysis: { icon: ArrowTrendingLines20Filled, titleKey: 'm.tagAnalysis', loading: false, action: () => this.$refs.TagGraphRef.displayTagGraph() },
        manageCollection: { icon: CicsSystemGroup, titleKey: 'm.manageCollection', loading: false, action: () => this.$refs.EditViewRef.enterEditCollectionView() },
        manageTag: { icon: TagGroup, titleKey: 'm.manageTag', loading: false, action: () => this.$refs.EditViewRef.enterEditTagView() },
        viewerSwitch: { icon: MdBook, titleKey: 'm.viewerSwitch', loading: false, action: () => this.switchViewerType() },
        themeSwitch: { icon: MdColorPalette, titleKey: 'm.themeSwitch', loading: false, action: () => this.switchTheme() },
        fullscreen: { icon: FullScreen, titleKey: 'm.fullscreenButton', loading: false, action: () => this.switchFullscreen() },
        setting: { icon: SettingIcon, titleKey: 'm.setting', loading: false, action: () => { this.$refs.SettingRef.dialogVisibleSetting = true } },
      }
    },
    // 工具栏元素的显示顺序 —— 搜索框/搜索按钮/排序框/界面模式切换 与普通按钮一起排序
    // 显示哪些由 toolbarButtons 决定(ensureToolbarButtons 补齐老配置里没有的新元素),
    // 排列顺序由 toolbarButtonOrder(含隐藏项的完整顺序)决定;没拖过排序时按默认顺序,
    // 其中新元素固定在默认位置(搜索框/搜索按钮在最前,排序框/界面模式切换在最后)。
    toolbarOrderIds () {
      const map = this.toolbarButtonMap
      const enabledButtons = ensureToolbarButtons(this.setting?.toolbarButtons, this.setting?.toolbarButtonsHidden)
      const savedOrder = Array.isArray(this.setting?.toolbarButtonOrder) ? this.setting.toolbarButtonOrder : []
      const base = savedOrder.length ? savedOrder.slice() : defaultToolbarButtons()
      const head = ['searchInput', 'searchButton']
      const tail = ['sortSelect', 'setting', 'uiMode']
      // 老配置的排序里还没有新元素(用户新版里没拖过)→ 按默认位置摆放
      const hasNew = savedOrder.some(id => TOOLBAR_NEW_ITEMS.includes(id))
      const fullOrder = hasNew
        ? base
        : [...head, ...base.filter(id => !head.includes(id) && !tail.includes(id)), ...tail]
      for (const id of defaultToolbarButtons()) if (!fullOrder.includes(id)) fullOrder.push(id)
      // 只读账户:隐藏写操作类按钮(扫描/批量元数据/合集编辑/标签编辑),服务端同样会拦截
      const viewerBlock = new Set(['manualScan', 'incrementalScan', 'batchMetadata', 'manageCollection', 'manageTag'])
      // ⚠️ 搜索框/搜索按钮/排序框不是 toolbarButtonMap 里的普通按钮(模板里各有一段 v-if 分支),
      //    不能被 map[id] 判空挡掉,必须单独放行
      const plainItems = new Set(['searchInput', 'searchButton', 'sortSelect', 'uiMode'])
      return fullOrder.filter(id => {
        // 常驻元素(设置按钮)不参与「显示/隐藏」判断,永远显示
        if (!TOOLBAR_ALWAYS_ITEMS.includes(id) && !enabledButtons.includes(id)) return false
        if (plainItems.has(id)) return true
        return !!map[id] && !(this.viewerRole && viewerBlock.has(id))
      })
    },
    // 正在跑的任务数量(超分/翻译等):减少到 0 时播放完成音效
    bookTaskCount () {
      const store = useAppStore()
      return Object.keys(store.bookTasks || {}).length
    },
    // 网页版标志(Vue 模板不能直接访问 window,需经 computed)
    isWebMode () {
      return !!window.__WEB_MODE__
    },
    // Windows 客户端远程桌面模式(数据来自 NAS,界面按桌面模式显示)
    isRemoteDesktop () {
      return !!window.__REMOTE_DESKTOP__
    },
    // 网页版(Docker)账户:普通账户只读
    viewerRole () {
      const auth = window.__AUTH__ || {}
      return !!auth.enabled && auth.role === 'viewer'
    },
    // 桌面客户端(Win 本地/远程桌面)与纯网页版(浏览器)区分
    isDesktopClient () {
      return !this.isWebMode || this.isRemoteDesktop
    },
    // 移动端界面(emm-mobile 布局)
    // Win 客户端:auto 模式按老行为(<768px);NAS 网页版:含平板(<1024px)
    isMobile () {
      if (this.uiMode === 'phone' || this.uiMode === 'tablet') return true
      if (this.uiMode === 'desktop') return false
      if (this.isDesktopClient) return window.innerWidth < 768
      return window.innerWidth < 1024
    },
    // 平板布局(emm-tablet):仅 NAS 网页版区分手机/平板列数
    isTablet () {
      if (this.uiMode === 'tablet') return true
      if (this.uiMode === 'phone' || this.uiMode === 'desktop') return false
      if (this.isDesktopClient) return false
      return window.innerWidth >= 768 && window.innerWidth < 1024
    },
    // UI 模式切换按钮图标:auto(自适应) / phone / tablet / desktop
    uiModeIcon () {
      if (this.uiMode === 'phone') return MdPhonePortrait
      if (this.uiMode === 'desktop') return MdDesktop
      return MdTabletPortrait
    },
    uiModeLabelKey () {
      return 'm.uiMode' + (this.uiMode.charAt(0).toUpperCase() + this.uiMode.slice(1))
    },
    // 工具栏上下文按钮:仅 Win 远程桌面模式保留「服务器配置」
    // (本地模式的「打开库文件夹」按钮已删除,该位置改回界面模式按钮,见 toolbarButtonDefinitions 的 uiMode)
    contextButton () {
      return { icon: MdCloudDone, titleKey: 'm.serverConfig', action: () => this.openServerConfig() }
    },
    showContextButton () {
      return this.isRemoteDesktop
    },
    // 自定义每页显示条数选项(逗号分隔;始终包含当前每页数量,避免选择栏失效)
    pageSizeOptions () {
      const parsed = parsePageSizes(this.setting?.customPageSizes)
      const current = Number(this.setting?.pageSize)
      if (Number.isFinite(current) && current > 0 && !parsed.includes(current)) {
        return [...parsed, current].sort((a, b) => a - b)
      }
      return parsed
    },
    // 逐排渲染:只渲染当前已加载的前 N 张卡片,滚动时继续加载下一排
    visibleRenderedBookList () {
      const list = this.visibleChunkDisplayBookList
      const n = Number.isFinite(this.renderedCount) ? this.renderedCount : 0
      return list.slice(0, n)
    },
    // 排序方向(↑正序 / ↓倒序)
    sortDirection: {
      get () { return this.sortDirection_ },
      set (val) {
        this.sortDirection_ = val
        localStorage.setItem('sortDirection', val)
      }
    },
    // 排序下拉显示的基础值(不含方向;方向由箭头单独切换)
    sortBaseValue: {
      get () {
        if (!this.sortValue) return ''
        const reverseMap = {
          addAscend: 'addTime', addDescend: 'addTime',
          mtimeAscend: 'mtime', mtimeDescend: 'mtime',
          postAscend: 'postTime', postDescend: 'postTime',
          scoreAscend: 'rating', scoreDescend: 'rating',
          readCountAscend: 'readCount', readCountDescend: 'readCount',
          artistAscend: 'artist', artistDescend: 'artist',
          titleAscend: 'title', titleDescend: 'title',
          pageAscend: 'page', pageDescend: 'page',
        }
        return reverseMap[this.sortValue] || this.sortValue
      },
      set (val) {
        this.handleSortChange(this.combineSortValue(val), this.displayBookList)
      }
    },
  },
  watch: {
    // 封面尺寸/间距变化时重新对齐工具栏
    'setting.coverWidth' () { this.recomputeToolbarWidth() },
    'setting.cardGapV' () { this.recomputeToolbarWidth() },
    'setting.cardGapH' () { this.recomputeToolbarWidth() },
    // ⚠️ 这里原来被下面那个重复的 watch 段覆盖掉了(同一个对象里 watch 只能有一份),
    //    所以卡片尺寸变化后工具栏宽度其实一直没重算 —— 现在合并到一处。
    bookList () {
      this.handleSortChange(this.sortValue, this.bookList)
    },
    // 像素风格 / 像素音效 / 混合背景
    'setting.pixelTheme' (val) {
      // 开启像素风格时自动打开「自动主题」(用户仍可手动关掉)
      // 开启像素风格 → 自动打开「自动主题」
      if (val) this.setting.autoTheme = true
      applyPixelTheme(this.setting)
      this.syncPixelSfx()
      this.$nextTick(() => {
        this.applyPixelCovers()
        this.applyAutoTheme()
      })
    },
    'setting.pixelSfx' () { this.syncPixelSfx() },
    // 任务减少(完成/中断)时来一段完成音效
    bookTaskCount (val, old) {
      if (typeof old === 'number' && val < old) playPixelSfx('done')
    },
    'setting.autoTheme' () {
      applyPixelTheme(this.setting)
      this.lastAutoThemeCover = null
      this.$nextTick(() => this.applyAutoTheme())
    },
    'setting.pixelCoverLevel' () { this.$nextTick(() => this.applyPixelCovers()) },
    'setting.pixelBlockSize' () { this.$nextTick(() => this.applyPixelCovers()) },
    'setting.pixelColorCount' () { this.$nextTick(() => this.applyPixelCovers()) },
    'setting.pixelAlgorithm' () { this.$nextTick(() => this.applyPixelCovers()) },
    'setting.pixelShowGrid' () { this.$nextTick(() => this.applyPixelCovers()) },
    // 卡片列表变化(翻页/排序/搜索/扫描)后重算混合背景 + 重新像素化封面
    visibleRenderedBookList () {
      this.$nextTick(() => {
        this.applyPixelCovers()
        this.applyAutoTheme()
      })
    },
  },
  mounted () {
    // UI 模式初始化(自动/手机/平板/电脑)与 body 标记
    this.uiMode = localStorage.getItem('emmUiMode') || 'auto'
    this.applyUiMode()
    window.addEventListener('resize', this.onResize)
    // 工具栏与卡片行对齐:随窗口/封面尺寸实时重算
    this.recomputeToolbarWidth()
    this.coverResizeObserver = new ResizeObserver(() => this.recomputeToolbarWidth())
    const cardArea = document.querySelector('.book-card-area')
    if (cardArea) this.coverResizeObserver.observe(cardArea)
    window.addEventListener('resize', this.recomputeToolbarWidth)
    ipcRenderer.on('send-message', (event, arg) => {
      if (arg === 'Scan complete') {
        // 后台扫描完成:重新加载列表
        this.scanning = false
        this.loadBookList(false)
        this.printMessage('success', this.$t('c.scanComplete'))
        return
      }
      if (arg === '开始加载漫画库' || arg.startsWith('从漫画库找到')) {
        // 扫描进度消息不弹窗,避免消息轰炸卡住界面
        if (arg === '开始加载漫画库') this.scanning = true
        console.log(arg)
        return
      }
      if (arg.includes('失败') || arg.includes('failed') || arg.startsWith('扫描结果异常')) {
        if (arg.startsWith('扫描失败') || arg.startsWith('扫描结果异常')) this.scanning = false
        console.error(arg)
        return
      }
      this.printMessage('info', arg)
      console.log(arg)
    })
    ipcRenderer.invoke('load-setting')
    .then(async (res) => {
      this.setting = res
      // 右键/长按菜单:只把「本版本新增」的项并入已保存配置。
      // 必须用 mergeContextMenuOptions —— 无条件把定义里的全部项并回去,
      // 会把用户取消勾选的项恢复成默认全选(历史 bug)。
      try {
        const mergedMenuOptions = mergeContextMenuOptions(res.contextMenuOptions)
        res.contextMenuOptions = mergedMenuOptions.options
        this.setting = res
        if (mergedMenuOptions.changed && !this.viewerRole) {
          ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(res)))
        }
      } catch (e) { /* 忽略:不影响启动 */ }
      // 新版本自动把「增量扫描」按钮补进工具栏(紧跟手动扫描;之后可在设置中拖出)
      if (Array.isArray(res.toolbarButtons) && !res.toolbarButtons.includes('incrementalScan')) {
        const list = [...res.toolbarButtons]
        const idx = list.indexOf('manualScan')
        list.splice(idx >= 0 ? idx + 1 : list.length, 0, 'incrementalScan')
        res.toolbarButtons = list
        this.setting = res
        ipcRenderer.invoke('save-setting', _.cloneDeep(res))
      }
      // 应用名称 / 自定义主题 / 自定义图标 / 封面尺寸
      applyAppName(this.setting)
      applyCoverStyle(this.setting)
      if (this.setting.theme === 'custom') {
        document.documentElement.classList.add('theme-custom')
        applyCustomTheme(this.setting)
      } else {
        // 非自定义主题:确保上一次会话/上一次切换留下的自定义变量不残留
        clearCustomTheme()
      }
      // 高级主题:像素风格(独立开关)
      applyPixelTheme(this.setting)
      applyFavicon(this.setting)
      this.recomputeToolbarWidth()
      if (this.setting.loadOnStart) {
        // display exist books first then load new books
        await this.loadBookList()
        this.loadBookList(true)
      } else {
        this.loadBookList()
      }
    })
    .catch(() => {
      // 未登录/会话失效:登录弹窗会由 emm-auth-required 事件触发
    })
    this.sortValue = localStorage.getItem('sortValue')
    this.sortValue = this.sortValue === 'null' ? undefined : this.sortValue === 'undefined' ? undefined : this.sortValue
    this.sortDirection_ = localStorage.getItem('sortDirection') || 'desc'
    // 类 macOS 惯性滚动(滚轮停止后继续滑行,力度可设置)
    this.inertiaDetachCardArea = attachInertiaScroll(document.querySelector('.book-card-area'), {
      getLevel: () => this.setting?.scrollInertiaLevel || 'medium'
    })
    // 逐排加载:滚动接近底部时再加载下一排(比 IntersectionObserver 更可靠)
    this.cardAreaScrollListener = () => {
      const area = document.querySelector('.book-card-area')
      if (!area) return
      if (area.scrollTop + area.clientHeight >= area.scrollHeight - 600) {
        this.renderedCount += this.renderBatchSize
      }
      // 滚动时节流:新滚进来的封面做像素化 + 按当前可见封面重算混合背景
      if (this.setting?.pixelTheme) {
        clearTimeout(this.mixBgTimer)
        this.mixBgTimer = setTimeout(() => {
          this.applyPixelCovers()
          this.applyAutoTheme()
        }, 400)
      }
    }
    const cardAreaEl = document.querySelector('.book-card-area')
    if (cardAreaEl) cardAreaEl.addEventListener('scroll', this.cardAreaScrollListener, { passive: true })
    window.addEventListener('keydown', this.resolveKey)
    // passive:滚轮事件不阻塞浏览器默认滚动,消除滚轮卡顿感
    window.addEventListener('wheel', this.resolveWheel, { passive: true })
    window.addEventListener('mousedown', this.resolveMouseDown)
    // 像素风点击音效(仅像素风格开启时挂载)+ 混合背景首次取色
    this.syncPixelSfx()
    this.$nextTick(() => {
      this.applyPixelCovers()
      this.applyAutoTheme()
    })
    // 首屏封面是懒加载的:过一会儿再补几次,避免「不滚动就一直不像素化」
    setTimeout(() => this.applyPixelCovers(), 700)
    setTimeout(() => this.applyPixelCovers(), 1800)
    setTimeout(() => this.applyPixelCovers(), 3500)
    ipcRenderer.on('send-action', async (event, arg) => {
      switch (arg.action) {
        case 'setting':
          this.$refs.SettingRef.dialogVisibleSetting = true
          this.$refs.SettingRef.activeSettingPanel = 'general'
          break
        case 'about':
          this.$refs.SettingRef.dialogVisibleSetting = true
          this.$refs.SettingRef.activeSettingPanel = 'about'
          break
        case 'accelerator':
          this.$refs.SettingRef.dialogVisibleSetting = true
          this.$refs.SettingRef.activeSettingPanel = 'accelerator'
          break
        case 'send-progress':
          this.progress = +arg.progress > 1 ? 100 : +arg.progress < 0 ? 0 : +arg.progress * 100
          break
        case 'scan-batch':
          // 扫描批次入库完成:节流轻刷列表,扫到多少就先显示多少(不重建文件夹树,
          // 避免打断用户浏览;整轮扫描完成后仍会做一次完整刷新)
          this.queueScanBatchLoad()
          break
        case 'tag-fail-non-tag-book':
          if (this.currentUI() === 'home') {
            for (const book of this.displayBookList) {
              if (book.status === 'non-tag' && this.isBook(book) && this.isVisibleBook(book)) {
                book.status = 'tag-failed'
                await this.saveBook(book)
              }
            }
          }
          break
      }
    })
  },
  beforeUnmount () {
    window.removeEventListener('keydown', this.resolveKey)
    window.removeEventListener('wheel', this.resolveWheel)
    window.removeEventListener('mousedown', this.resolveMouseDown)
    if (this.pixelSfxDetach) { this.pixelSfxDetach(); this.pixelSfxDetach = null }
    clearTimeout(this.mixBgTimer)
  },
  methods: {
    ...mapActions(useAppStore, [
      'runBookTask',
      'pauseBookTask',
      'resumeBookTask',
      'abortBookTask',
      'isBookTaskPaused',
      'isBook',
      'isVisibleBook',
      'printMessage',
      'getDisplayTitle',
      'resetMetadata',
      'saveBook',
      'copyTagClipboard',
      'pasteTagClipboard',
      'filterFolderMethod',
    ]),

    // base function
    currentUI () {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return 'inputing'
      }
      if (!!document.querySelector('.is-message-box')) {
        return 'message-box'
      }
      if (this.$refs.SettingRef.dialogVisibleSetting) {
        return 'setting'
      }
      if (this.$refs.SearchDialogRef.dialogVisibleEhSearch) {
        return 'search-dialog'
      }
      if (this.$refs.InternalViewerRef.drawerVisibleViewer) {
        if (this.$refs.InternalViewerRef.showThumbnail) {
          return 'viewer-thumbnail'
        } else {
          return 'viewer-content'
        }
      }
      if (this.$refs.InternalViewerRef.isComicReadDisplay) {
        return 'viewer-comicread'
      }
      if (this.$refs.BookDetailDialogRef.dialogVisibleBookDetail) {
        if (this.$refs.BookDetailDialogRef.editingTag) {
          return 'edit-tag'
        } else {
          return 'bookdetail'
        }
      }
      if (this.$refs.TagGraphRef.dialogVisibleGraph) {
        return 'tag-graph'
      }
      if (this.$refs.FolderTreeRef.sideVisibleFolderTree) {
        return 'folder-tree'
      }
      if (this.$refs.EditViewRef.editCollectionView) {
        return 'edit-collection'
      }
      if (this.$refs.EditViewRef.editTagView) {
        return 'edit-group-tag'
      }
      if (this.drawerVisibleCollection) {
        return 'collection'
      }
      return 'home'
    },
    resolveKey (event) {
      // 阅读器里的翻页键由 InternalViewer.handleViewerKey 统一处理(按阅读方向)
      const currentUIValue = this.currentUI()
      const bookEachLine = Math.floor(getWidth(document.querySelector('.book-card-area div:first-child'), 'width') / getWidth(document.querySelector('.book-card'), 'full'))
      if (currentUIValue !== 'inputing') {
        if (event.key === 'Backspace') {
          document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))
          return
        }
      }
      if (currentUIValue === 'viewer-content' || currentUIValue === 'viewer-thumbnail') {
        if (event.key === 'PageDown') {
          if (event.shiftKey) {
            this.toNextMangaRandom()
          } else {
            this.toNextManga(1)
          }
        } else if (event.key === 'PageUp') {
          this.toNextManga(-1)
        } else if (event.key === '=') {
          this.$refs.InternalViewerRef.showThumbnail = !this.$refs.InternalViewerRef.showThumbnail
        }
        if (currentUIValue === 'viewer-content') {
          // 翻页 / 滚动 / 缩放全部交给阅读器按「阅读方向」处理(InternalViewer.handleViewerKey)。
          // 旧实现滚的是 .el-drawer__body,而真正滚动的是 .drawer-viewer-body,卷轴下键盘等于没反应。
          if (this.$refs.InternalViewerRef.handleViewerKey &&
              this.$refs.InternalViewerRef.handleViewerKey(event)) {
            return
          }
        }
      } else if (currentUIValue === 'viewer-comicread') {
        // do nothing for now
      } else if (currentUIValue === 'bookdetail') {
        if (event.key === 'Enter') {
          event.preventDefault()
          this.$refs.InternalViewerRef.viewManga(this.bookDetail)
        } else if (event.key === "'") {
          this.$refs.BookDetailDialogRef.openLocalBook(this.bookDetail)
        } else if (event.key === 'Delete') {
          this.$refs.BookDetailDialogRef.deleteLocalBook(this.bookDetail)
        } else if (event.key === 'PageDown') {
          if (event.shiftKey) {
            this.jumpMangeDetailRandom()
          } else {
            this.jumpMangeDetail(1)
          }
        } else if (event.key === 'PageUp') {
          this.jumpMangeDetail(-1)
        }
      } else if (currentUIValue === 'home') {
        if (event.key === 'Enter') {
          event.preventDefault()
          document.activeElement.querySelector('.book-cover').click()
        } else if (event.key === 'F5') {
          this.loadBookList(true)
        } else if (event.key === 'F6' || (event.ctrlKey && event.key === 'l')) {
          document.querySelector('.search-input .el-input__inner').select()
        } else if (event.ctrlKey && event.key === 's') {
          this.shuffleBook()
        } else if (event.key === 'PageUp') {
          event.preventDefault()
          this.currentPage -= 1
          this.handleCurrentPageChange(this.currentPage)
        } else if (event.key === 'PageDown') {
          event.preventDefault()
          this.currentPage += 1
          this.handleCurrentPageChange(this.currentPage)
        } else if (event.key === 'ArrowDown') {
          event.preventDefault()
          this.jumpBookByTabindex(bookEachLine, '.book-card-area')
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          this.jumpBookByTabindex(-bookEachLine, '.book-card-area')
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault()
          this.jumpBookByTabindex(-1, '.book-card-area')
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          this.jumpBookByTabindex(1, '.book-card-area')
        }
      } else if (currentUIValue === 'collection') {
        if (event.key === 'Enter') {
          document.activeElement.querySelector('.book-cover').click()
        } else if (event.key === 'ArrowDown') {
          this.jumpBookByTabindex(bookEachLine, '.collection-drawer')
        } else if (event.key === 'ArrowUp') {
          this.jumpBookByTabindex(-bookEachLine, '.collection-drawer')
        } else if (event.key === 'ArrowLeft') {
          this.jumpBookByTabindex(-1, '.collection-drawer')
        } else if (event.key === 'ArrowRight') {
          this.jumpBookByTabindex(1, '.collection-drawer')
        }
      }
    },
    // ---------- 高级主题:封面真降采样像素化 ----------
    // CSS 的 image-rendering 对高分辨率原图看不出效果,所以直接把封面缩到 72px 宽再显示
    async applyPixelCovers () {
      const nodes = Array.from(document.querySelectorAll('.book-card-list .book-cover, .book-card-list .book-cover-fill'))
      const level = Number(this.setting?.pixelCoverLevel)
      // 清晰度拉条:0 = 完全不像素化封面;越大降采样越狠(块越粗)
      const pixelOn = !!this.setting?.pixelTheme && Number.isFinite(level) && level > 0
      if (!pixelOn) {
        for (const el of nodes) {
          if (el.dataset.pixelOriginal) {
            el.src = el.dataset.pixelOriginal
            delete el.dataset.pixelOriginal
            delete el.dataset.pixelDone
            delete el.dataset.pixelWidth
            delete el.dataset.pixelSig
            const host = el.closest('.book-cover-frame') || el.closest('.book-card')
            if (host) { delete host.dataset.pixelGrid; host.style.removeProperty('--pixel-cols'); host.style.removeProperty('--pixel-rows') }
          }
          el.style.removeProperty('opacity')
        }
        return
      }
      // 像素画参数(参考 image2pixel.app)
      const blockSize = Math.max(2, Math.min(20, Math.round(Number(this.setting?.pixelBlockSize) || 4)))
      const colorCount = Math.max(0, Math.min(64, Math.round(Number(this.setting?.pixelColorCount) || 0)))
      const algorithm = this.setting?.pixelAlgorithm || 'average'
      const showGrid = !!this.setting?.pixelShowGrid
      const pixelSig = blockSize + '/' + colorCount + '/' + algorithm
      const area = document.querySelector('.book-card-area')
      const areaRect = area ? area.getBoundingClientRect() : null
      let processed = 0
      for (const el of nodes) {
        if (processed >= 40) break
        if (areaRect) {
          const r = el.getBoundingClientRect()
          if (r.bottom < areaRect.top - 300 || r.top > areaRect.bottom + 300) continue
        }
        // 图片可能还没加载完(懒加载),加载完成后再补一次,免得「不动就不处理」
        if (!el.dataset.pixelHooked) {
          el.dataset.pixelHooked = '1'
          el.addEventListener('load', () => this.applyPixelCovers(), { once: true })
        }
        const cur = el.currentSrc || el.src
        if (!cur || cur.startsWith('data:')) continue
        if (el.dataset.pixelFailed) continue
        // 同一套参数已经处理过就不重复处理,免得滚动时反复闪
        if (el.dataset.pixelDone && el.dataset.pixelSig === pixelSig) continue
        // 先把原图藏起来,处理完再显示 —— 否则会「先看到原图,再变成像素图」
        el.style.opacity = '0'
        let res = await pixelateToDataUrl(cur, { blockSize, colorCount, algorithm })
        let dataUrl = res && res.dataUrl
        if (!dataUrl) {
          // 主进程兜底:只能按块大小降采样(nativeImage 不做量化与网格)
          const fallbackWidth = Math.max(16, Math.round(240 / blockSize))
          try { dataUrl = await ipcRenderer.invoke('pixelate-cover', cur, fallbackWidth) } catch (e) { dataUrl = null }
        }
        if (!dataUrl) {
          el.dataset.pixelFailed = '1'
          el.style.removeProperty('opacity')
          continue
        }
        // 显示网格:行列数写进外层容器,网格由 CSS 覆盖层画(inset + repeating-linear-gradient)
        const host = el.closest('.book-cover-frame') || el.closest('.book-card')
        if (host) {
          if (showGrid && res) {
            host.dataset.pixelGrid = res.cols + 'x' + res.rows
            host.style.setProperty('--pixel-cols', res.cols)
            host.style.setProperty('--pixel-rows', res.rows)
          } else {
            delete host.dataset.pixelGrid
            host.style.removeProperty('--pixel-cols')
            host.style.removeProperty('--pixel-rows')
          }
        }
        el.dataset.pixelOriginal = cur
        el.dataset.pixelDone = '1'
        el.dataset.pixelSig = pixelSig
        el.src = dataUrl
        el.style.removeProperty('opacity')
        processed++
      }
    },
    // ---------- 高级主题:像素音效 / 自动主题 ----------
    syncPixelSfx () {
      if (this.pixelSfxDetach) { this.pixelSfxDetach(); this.pixelSfxDetach = null }
      if (this.setting?.pixelTheme && this.setting?.pixelSfx !== false) {
        this.pixelSfxDetach = attachPixelSfx()
      }
    },
    // 自动主题:取「当前可见的那张封面」的主色,联动卡片框 / 按钮 / 按钮内颜色 / 主色调
    async applyAutoTheme () {
      if (!(this.setting?.pixelTheme && this.setting?.autoTheme !== false)) return
      const covers = Array.from(document.querySelectorAll('.book-card-list .book-cover, .book-card-list .book-cover-fill'))
      if (!covers.length) return
      // 每页只取一次色:固定用列表第一张封面,不随滚动反复取色
      const el = covers[0]
      const src = el && (el.dataset.pixelOriginal || el.currentSrc || el.src)
      if (!src || src === this.lastAutoThemeCover) return
      this.lastAutoThemeCover = src
      const colors = await extractCoverColors(src)
      if (!colors) return
      const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
      const shade = (c, k) => c.map((v) => Math.round(v * k))
      const lighten = (c, k) => c.map((v) => Math.round(v + (255 - v) * k))
      const vivid = colors.vivid || colors.average
      const avg = colors.average
      // 用户要求:底色取浅色、文字取深色 —— 底色统一提亮,文字固定深色,对比稳定
      const btnBg = lighten(avg, 0.55)
      const cardBg = lighten(avg, 0.68)
      const btnText = '#1a1a1a'
      const cardText = '#1f1f1f'
      const root = document.documentElement.style
      root.setProperty('--emm-auto-primary', toHex(vivid))
      root.setProperty('--emm-auto-primary-dark', toHex(shade(vivid, 0.7)))
      root.setProperty('--emm-auto-card-bg', `rgba(${cardBg[0]}, ${cardBg[1]}, ${cardBg[2]}, 0.45)`)
      root.setProperty('--emm-auto-card-border', toHex(shade(vivid, 0.65)))
      root.setProperty('--emm-auto-card-text', cardText)
      root.setProperty('--emm-auto-button-bg', `rgba(${btnBg[0]}, ${btnBg[1]}, ${btnBg[2]}, 0.6)`)
      root.setProperty('--emm-auto-button-text', btnText)
    },
    resolveWheel (event) {
      if (event.ctrlKey) {
        const level = electronFunction['get-zoom-level']()
        if (event.deltaY > 0) {
          electronFunction['set-zoom-level'](level - 1)
        } else {
          electronFunction['set-zoom-level'](level + 1)
        }
      }
    },
    resolveMouseDown (event) {
      const currentUIValue = this.currentUI()
      if (event.button === 3) {
        if (currentUIValue === 'viewer-comicread') {
          this.$refs.InternalViewerRef.closeComicReader()
          return
        }
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))
        // clear search result when at home page
        if (currentUIValue === 'home') {
          this.handleSearchStringChange()
          this.$refs.FolderTreeRef.resetSelect()
        }
      } else if (event.button === 4) {
        if (currentUIValue !== 'viewer-content' && currentUIValue !== 'viewer-thumbnail' && currentUIValue !== 'viewer-comicread') {
          this.revertAction()
        }
      }
    },
    switchFullscreen () {
      ipcRenderer.invoke('switch-fullscreen')
    },
    // 重算工具栏宽度,使其与下方漫画卡片行的左/右边缘对齐(rAF 节流,宽度过渡平滑)
    recomputeToolbarWidth () {
      if (this._toolbarRaf) return
      this._toolbarRaf = requestAnimationFrame(() => {
        this._toolbarRaf = null
        const area = document.querySelector('.book-card-area')
        if (!area) return
        const rootStyle = getComputedStyle(document.documentElement)
        const size = parseFloat(rootStyle.getPropertyValue('--emm-cover-size')) || 220
        // 行宽计算只依赖横向间距(卡片间距(左右))
        const gap = parseFloat(rootStyle.getPropertyValue('--emm-card-gap-h')) || parseFloat(rootStyle.getPropertyValue('--emm-card-gap')) || 6
        const frameW = size + 2 * gap
        const w = area.clientWidth
        if (!w) return
        const n = Math.max(1, Math.floor((w + 2 * gap) / frameW))
        this.toolbarWidth = n * frameW - 2 * gap
      })
    },
    // 阅读器类型切换按钮
    switchViewerType () {
      this.setting.viewerType = this.setting.viewerType === 'comicread' ? 'original' : 'comicread'
      ipcRenderer.invoke('save-setting', _.cloneDeep(this.setting))
      this.printMessage('info', this.setting.viewerType === 'comicread' ? 'ComicRead' : this.$t('m.originalViewer'))
    },
    // 主题循环切换按钮
    switchTheme () {
      const themes = ['dark', 'light', 'dark exhentai', 'light e-hentai', 'nhentai', 'custom']
      const current = this.setting.theme || 'light'
      const idx = themes.indexOf(current)
      const next = themes[(idx + 1) % themes.length]
      this.setting.theme = next
      // ⚠️ 不能直接 setAttribute('class', …):会把 theme-pixel / theme-auto 一起抹掉
      //    (症状就是「切完主题像素风格失效,得关掉再打开」)
      const root = document.documentElement
      const keepClasses = ['theme-pixel', 'theme-auto'].filter(c => root.classList.contains(c))
      root.setAttribute('class', next)
      keepClasses.forEach(c => root.classList.add(c))
      if (next === 'custom') {
        document.documentElement.classList.add('theme-custom')
        applyCustomTheme(this.setting)
      } else {
        root.classList.remove('theme-custom')
        // 清掉自定义主题写在 <html> 上的内联变量,否则按钮主色调等会继续生效
        clearCustomTheme()
      }
      // 切主题后重新把像素风格挂回去
      applyPixelTheme(this.setting)
      ipcRenderer.invoke('save-setting', _.cloneDeep(this.setting))
      this.printMessage('info', next)
    },
    customChunk (list, size, index) {
      // 容错:每页数量必须是有效正数,否则回退 42,避免整页空白
      const safeSize = Number(size)
      const chunkSize = Number.isFinite(safeSize) && safeSize > 0 ? safeSize : 42
      const result = []
      let count = 0
      let countIndex = 0
      _.forEach(list, (book) => {
        if (countIndex === index) result.push(book)
        if (this.isVisibleBook(book)) count++
        if (count >= chunkSize) {
          countIndex++
          count = 0
        }
        if (countIndex > index) return false
      })
      return result
    },
    sortList(label) {
      return (a, b) => {
        if (_.get(a, label) && _.get(b, label)) {
          if (_.get(a, label) > _.get(b, label)) {
            return -1
          } else if (_.get(a, label) < _.get(b, label)) {
            return 1
          } else {
            return 0
          }
        } else if (_.get(a, label)) {
          return -1
        } else if (_.get(b, label)) {
          return 1
        } else {
          return 0
        }
      }
    },
    async loadBookList (scan) {
      try {
        this.buttonLoadBookListLoading = true
        if (scan) this.scanning = true
        const res = await ipcRenderer.invoke('load-book-list', scan)
        const bookList = this.prepareBookList(res)
        await this.loadCollectionList(bookList)
        this.bookList = bookList
        await this.$refs.FolderTreeRef.geneFolderTree()
        this.$refs.FolderTreeRef.resetSelect()
        this.$refs.EditViewRef.selectBookList = []
        this.buttonLoadBookListLoading = false
      } catch (error) {
        this.buttonLoadBookListLoading = false
        console.error(error)
      }
      // 扫描已后台化:扫描完成由 'Scan complete' 消息触发刷新与提示
    },
    // 扫描进行中:新书每批入库后轻刷列表(900ms 节流合并),实现"边扫边显示";
    // 不重建文件夹树/不重置选中,避免打断浏览,整轮完成后会再完整刷新一次
    queueScanBatchLoad () {
      if (this._scanBatchTimer) return
      this._scanBatchTimer = setTimeout(async () => {
        this._scanBatchTimer = null
        if (!this.scanning) return // 扫描已完成,最终刷新会接管
        try {
          const res = await ipcRenderer.invoke('load-book-list', false)
          if (!this.scanning || !res) return
          const list = this.prepareBookList(res)
          // bookList 变更会触发 watch → 自动重排序/重绘
          this.bookList = list
          if (Number.isFinite(this.renderedCount) && list.length < this.renderedCount) {
            this.renderedCount = list.length
          }
        } catch (e) {
          console.error(e)
        }
      }, 900)
    },
    // 增量扫描:只对目录指纹变化的子树做 diff,无快照时服务端自动退化为全量扫描
    async incrementalScan () {
      try {
        this.buttonLoadBookListLoading = true
        this.scanning = true
        await ipcRenderer.invoke('incremental-scan')
      } catch (e) {
        this.scanning = false
        this.printMessage('error', String(e?.message || e))
        console.error(e)
      } finally {
        this.buttonLoadBookListLoading = false
      }
      // 扫描已后台化:扫描完成由 'Scan complete' 消息触发刷新与提示
    },
    prepareBookList (bookList) {
      bookList.forEach(book => {
        if (Number.isInteger(book.filecount) && Number.isInteger(book.pageCount) && Math.abs(book.filecount - book.pageCount) > 5) book.pageDiff = true
      })
      return bookList
    },
    updateWindowTitle (book) {
      const title = this.getDisplayTitle(book)
      ipcRenderer.invoke('update-window-title', title)
    },

    // home header
    async getBookListMetadata () {
      try {
        this.buttonGetMetadatasLoading = true
        let bookList
        if (this.setting.batchTagfailedBook) {
          bookList = this.bookList.filter(book => book.status === 'tag-failed' || book.status === 'non-tag')
        } else {
          bookList = this.bookList.filter(book => book.status === 'non-tag')
        }
        if (this.setting.onlyGetMetadataOfSelectedFolder) {
          bookList = bookList.filter(book => !book.folderHide)
        }
        await this.$refs.SearchDialogRef.getBooksMetadata(bookList, this.setting.requireGap || 10000)
        this.buttonGetMetadatasLoading = false
      } catch (error) {
        this.buttonGetMetadatasLoading = false
        console.error(error)
      }
    },
    shuffleBook () {
      this.sortValue = 'shuffle'
      this.displayBookList = _.shuffle(this.displayBookList)
      this.chunkList()
    },
    // 基础排序值 + 方向 → 内部完整 sortValue
    combineSortValue (base) {
      if (['', 'mark', 'collection', 'hidden', 'recentRead', 'shuffle'].includes(base)) return base
      const map = {
        addTime: ['addAscend', 'addDescend'],
        mtime: ['mtimeAscend', 'mtimeDescend'],
        postTime: ['postAscend', 'postDescend'],
        rating: ['scoreAscend', 'scoreDescend'],
        readCount: ['readCountAscend', 'readCountDescend'],
        artist: ['artistAscend', 'artistDescend'],
        title: ['titleAscend', 'titleDescend'],
        page: ['pageAscend', 'pageDescend'],
      }
      const pair = map[base]
      if (!pair) return base
      return this.sortDirection === 'asc' ? pair[0] : pair[1]
    },
    // 点击箭头切换排序方向
    toggleSortDirection () {
      const base = this.sortBaseValue
      if (['', 'mark', 'collection', 'hidden', 'recentRead', 'shuffle'].includes(base)) return
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc'
      this.handleSortChange(this.combineSortValue(base), this.displayBookList)
    },
    handleSortChange (val, bookList) {
      if (!bookList) bookList = this.displayBookList
      switch(val){
        case 'mark':
          this.displayBookList = _.filter(this.bookList, 'mark')
          this.chunkList()
          break
        case 'collection':
          this.displayBookList = _.filter(this.bookList, 'isCollection')
          this.chunkList()
          break
        case 'hidden':
          this.displayBookList = _.filter(this.bookList, 'hiddenBook')
          this.chunkList()
          break
        case 'recentRead':
          const recentReads =  fetchRecentReads()
          this.displayBookList = _.uniqBy(
            recentReads.map(id => this.bookList.find(book => {
              if (book.collectionHide) return false
              if (book.isCollection) return book.ids.includes(id)
              return book.id === id
            }))
            .filter(book => book !== undefined),
            'id'
          )
          this.chunkList()
          break
        case 'shuffle':
          this.displayBookList = _.shuffle(bookList)
          this.chunkList()
          break
        case 'addAscend':
          this.displayBookList = bookList.toSorted(this.sortList('date')).toReversed()
          this.chunkList()
          break
        case 'addDescend':
          this.displayBookList = bookList.toSorted(this.sortList('date'))
          this.chunkList()
          break
        case 'mtimeAscend':
          this.displayBookList = bookList.toSorted(this.sortList('mtime')).toReversed()
          this.chunkList()
          break
        case 'mtimeDescend':
          this.displayBookList = bookList.toSorted(this.sortList('mtime'))
          this.chunkList()
          break
        case 'postAscend':
          this.displayBookList = bookList.toSorted(this.sortList('posted')).toReversed()
          this.chunkList()
          break
        case 'postDescend':
          this.displayBookList = bookList.toSorted(this.sortList('posted'))
          this.chunkList()
          break
        case 'scoreAscend':
          this.displayBookList = bookList.toSorted(this.sortList('rating')).toReversed()
          this.chunkList()
          break
        case 'scoreDescend':
          this.displayBookList = bookList.toSorted(this.sortList('rating'))
          this.chunkList()
          break
        case 'readCountAscend':
          this.displayBookList = bookList.toSorted(this.sortList('readCount')).toReversed()
          this.chunkList()
          break
        case 'readCountDescend':
          this.displayBookList = bookList.toSorted(this.sortList('readCount'))
          this.chunkList()
          break
        case 'artistAscend':
          this.displayBookList = bookList.toSorted(this.sortList('tags.artist')).toReversed()
          this.chunkList()
          break
        case 'artistDescend':
          this.displayBookList = bookList.toSorted(this.sortList('tags.artist'))
          this.chunkList()
          break
        case 'titleAscend':
          this.displayBookList = bookList.toSorted((a, b) => this.getDisplayTitle(b).localeCompare(this.getDisplayTitle(a), undefined, {numeric: true, sensitivity: 'base'})).toReversed()
          this.chunkList()
          break
        case 'titleDescend':
          this.displayBookList = bookList.toSorted((a, b) => this.getDisplayTitle(b).localeCompare(this.getDisplayTitle(a), undefined, {numeric: true, sensitivity: 'base'}))
          this.chunkList()
          break
        case 'pageAscend':
          this.displayBookList = bookList.toSorted(this.sortList('pageCount')).toReversed()
          this.chunkList()
          break
        case 'pageDescend':
          this.displayBookList = bookList.toSorted(this.sortList('pageCount'))
          this.chunkList()
          break
        default:
          this.displayBookList = this.bookList
          this.chunkList()
          break
      }
      // 同步排序状态(pinia),否则排序下拉/方向箭头读取不到当前值
      this.sortValue = val
      localStorage.setItem('sortValue', val)
    },
    querySearch (queryString, callback) {
      let result = []
      const options = this.customOptions.concat(this.tagList)
      if (queryString) {
        const keywords = [...queryString.matchAll(/\s+(?=(?:[^\'"]*[\'"][^\'"]*[\'"])*[^\'"]*$)/g)]
        if (!_.isEmpty(keywords)) {
          const nextKeyword = queryString.replace(/(~|-)?[\p{L}\d]+:"[- ._()\p{L}\d]+"\$/gu, '').trim()
          if (nextKeyword[0] === '-' || nextKeyword[0] === '~') {
            result = _.filter(options, (str) => {
              return _.includes(str.value.toLowerCase(), nextKeyword.slice(1).toLowerCase())
              || _.includes(str.label.toLowerCase(), nextKeyword.slice(1).toLowerCase())
            })
          } else {
            result = _.filter(options, (str) => {
              return _.includes(str.value.toLowerCase(), nextKeyword.toLowerCase())
              || _.includes(str.label.toLowerCase(), nextKeyword.toLowerCase())
            })
          }
        } else {
          if (queryString[0] === '-' || queryString[0] === '~') {
            result = _.filter(options, (str) => {
              return _.includes(str.value.toLowerCase(), queryString.slice(1).toLowerCase())
              || _.includes(str.label.toLowerCase(), queryString.slice(1).toLowerCase())
            })
          } else {
            result = _.filter(options, (str) => {
              return _.includes(str.value.toLowerCase(), queryString.toLowerCase())
              || _.includes(str.label.toLowerCase(), queryString.toLowerCase())
            })
          }
        }
      } else {
        result = options
      }
      callback(result)
    },
    handleSearchStringChange (val) {
      if (!val) {
        this.searchString = ''
        this.handleSortChange(this.sortValue, this.bookList)
      }
    },
    handleInput (val) {
      try {
        if (/^[\p{L}\d]+:"[- ._()\p{L}\d]+"\$$/u.test(val)
            && this.searchString.trim() !== val.trim()) {
          const keywords = [...this.searchString.trim().matchAll(/\s+(?=(?:[^\'"]*[\'"][^\'"]*[\'"])*[^\'"]*$)/g)]
          if (!_.isEmpty(keywords)) {
            const keyword = this.searchString.replace(/(~|-)?[\p{L}\d]+:"[- ._()\p{L}\d]+"\$/gu, '').trim()
            const matches = this.searchString.match(/(~|-)?[\p{L}\d]+:"[- ._()\p{L}\d]+"\$/gu)
            if (keyword[0] === '-') {
              this.searchString = matches.concat([`-${val}`]).join(' ')
            } else if (keyword[0] === '~') {
              this.searchString = matches.concat([`~${val}`]).join(' ')
            } else {
              this.searchString = matches.concat([val]).join(' ')
            }
          } else {
            const keyword = this.searchString.trim()
            if (keyword[0] === '-') {
              this.searchString = `-${val}`
            } else if (keyword[0] === '~') {
              this.searchString = `~${val}`
            } else {
              this.searchString = val
            }
          }
        } else {
          this.searchString = val
          this.searchString = this.searchString.replace(/\|{3}/, ' ')
        }
      } catch {
        this.searchString = val
      }
    },
    searchBook (addToHistory = true) {
      const checkCondition = (bookString, bookInfo) => {
        const searchStringArray = this.searchString ? this.searchString.split(/\s+(?=(?:[^\'"]*[\'"][^\'"]*[\'"])*[^\'"]*$)/) : []
        const orCondition = _.filter(searchStringArray, (str) => str.startsWith('~'))
        const andCondition = _.filter(searchStringArray, (str) => !str.startsWith('~'))
        return _.some([andCondition, ...orCondition], (condition) => {
          if (_.isArray(condition)) {
            return _.every(condition, (str) => {
              try {
                if (_.startsWith(str, ':')) {
                  const type = str.slice(1, 6)
                  if (str[6] === '>') {
                    switch (type) {
                      case 'mtime':
                      case 'atime':
                      case 'ptime':
                        return bookInfo[type] >= new Date(str.slice(7))
                      case 'count':
                        return bookInfo[type] > parseInt(str.slice(7), 10)
                    }
                  } else if (str[6] === '<') {
                    switch (type) {
                      case 'mtime':
                      case 'atime':
                      case 'ptime':
                        return bookInfo[type] <= new Date(str.slice(7))
                      case 'count':
                        return bookInfo[type] < parseInt(str.slice(7), 10)
                    }
                  } else if (str[6] === '=') {
                    switch (type) {
                      case 'mtime':
                      case 'atime':
                      case 'ptime':
                        return bookInfo[type].toLocaleDateString() === new Date(str.slice(7)).toLocaleDateString()
                      case 'count':
                        return bookInfo[type] === parseInt(str.slice(7), 10)
                    }
                  } else {
                    return false
                  }
                } else if (_.startsWith(str, '-')) {
                  return !bookString.includes(str.slice(1).replace(/["']/g, '').replace(/[$]/g, '"').toLowerCase())
                } else {
                  return bookString.includes(str.replace(/["']/g, '').replace(/[$]/g, '"').toLowerCase())
                }
              } catch {
                return false
              }
            })
          } else {
            return bookString.includes(condition.slice(1).replace(/["']/g, '').replace(/[$]/g, '"').toLowerCase())
          }
        })
      }
      this.displayBookList = _.filter(this.bookList, (book) => {
        const bookString = JSON.stringify(
          _.assign(
            {},
            _.pick(book, ['title', 'title_jpn', 'status', 'filepath', 'url', 'pageDiff']),
            {
              tags: _.map(book.tags, (tags, cat) => {
                const letter = this.cat2letter[cat] ? this.cat2letter[cat] : cat
                return _.map(tags, (tag) => `${letter}:${tag}`).concat(_.map(tags, (tag) => `${cat}:${tag}`))
              }),
              category: `cat:${book.category}`,
            }
          )
        ).toLowerCase()
        const bookInfo = {
          mtime: new Date(book.mtime),
          atime: new Date(book.date),
          ptime: new Date(book.posted * 1000),
          count: book.readCount
        }
        return checkCondition(bookString, bookInfo)
      })
      if (!this.sortValue || ['mark', 'hidden', 'collection'].includes(this.sortValue)) this.sortValue = 'addDescend'
      this.handleSortChange(this.sortValue, this.displayBookList)
      if (this.currentUI() === 'edit-group-tag') {
        this.$refs.EditViewRef.selectBookList = []
        this.displayBookList.forEach(book => book.selected = false)
      } else if (addToHistory) {
        this.actionHistory.push({type: 'search', value: this.searchString})
      }
    },
    handleSearchString (string) {
      this.$refs.BookDetailDialogRef.dialogVisibleBookDetail = false
      this.drawerVisibleCollection = false
      this.searchString = string
      this.searchBook()
    },
    revertAction () {
      let action = this.actionHistory.pop()
      switch (action?.type) {
        case 'search':
          if (action?.value === this.searchString && this.currentUI() === 'home') {
            this.revertAction()
            return
          }
          if (action?.value !== undefined) {
            this.$refs.BookDetailDialogRef.dialogVisibleBookDetail = false
            this.drawerVisibleCollection = false
            this.searchString = action.value
            this.searchBook(false)
          }
          break
        case 'openBook':
          if (action?.value === this.bookDetail?.id && this.currentUI() === 'bookdetail') {
            this.revertAction()
            return
          }
          if (action?.value !== undefined) {
            const book = this.bookList.find(b => b.id === action.value)
            if (book) this.$refs.BookDetailDialogRef.openBookDetail(book, false)
          }
          break
        default:
          this.$refs.BookDetailDialogRef.dialogVisibleBookDetail = false
          this.handleSearchStringChange()
          this.printMessage('info', this.$t('c.noMoreActionHistory'))
          break
      }
    },
    // ---------- 标签快速编辑(长按卡片标签) ----------
    openQuickTagEdit ({ tag, book } = {}) {
      if (!tag) return
      // 只读账户:直接退化为按标签筛选,不提供写操作
      if (this.viewerRole) {
        this.searchFromTag(tag.tag, tag.cat)
        return
      }
      this.quickTag = tag
      this.quickTagBook = book
      this.quickTagNewName = tag.tag
      const rec = (this.setting.tagNameLangs || {})[tag.cat + '::' + tag.tag] || {}
      this.quickTagLangs = { 'default': rec['default'] || '', 'zh-CN': rec['zh-CN'] || '', 'zh-TW': rec['zh-TW'] || '', ja: rec.ja || '', en: rec.en || '' }
      this.quickTagDialogVisible = true
    },
    quickTagFilter () {
      this.quickTagDialogVisible = false
      if (this.quickTag) this.searchFromTag(this.quickTag.tag, this.quickTag.cat)
    },
    quickTagCopy () {
      if (this.quickTag) ipcRenderer.invoke('copy-text-to-clipboard', this.quickTag.tag)
    },
    // 保存标签的多语言名称(中/日/英),按「目标语言标签」显示
    async quickTagSaveLangs () {
      const { cat, tag } = this.quickTag || {}
      if (!cat || !tag) return
      if (!this.setting.tagNameLangs) this.setting.tagNameLangs = {}
      const key = cat + '::' + tag
      const rec = this.setting.tagNameLangs[key] || {}
      const lang = { 'default': (this.quickTagLangs['default'] || '').trim(), 'zh-CN': (this.quickTagLangs['zh-CN'] || '').trim(), 'zh-TW': (this.quickTagLangs['zh-TW'] || '').trim(), ja: (this.quickTagLangs.ja || '').trim(), en: (this.quickTagLangs.en || '').trim() }
      if (!lang['default'] && !lang['zh-CN'] && !lang['zh-TW'] && !lang.ja && !lang.en) delete this.setting.tagNameLangs[key]
      else this.setting.tagNameLangs[key] = { ...rec, ...lang }
      await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(this.setting)))
      this.printMessage('success', this.$t('m.saveTagNamesDone'))
      this.quickTagDialogVisible = false
    },
    async quickTagRename () {
      const { cat, tag } = this.quickTag || {}
      const newName = (this.quickTagNewName || '').trim()
      if (!cat || !tag || !newName || newName === tag) return
      const res = await ipcRenderer.invoke('rename-tag', { cat, oldName: tag, newName })
      if (res?.ok) {
        this.printMessage('success', this.$t('m.renameTagDone', { n: res.count ?? 0 }))
        this.quickTagDialogVisible = false
        await this.loadBookList(false)
      } else {
        this.printMessage('error', res?.error || 'rename failed')
      }
    },
    async quickTagRemoveFromBook () {
      const { cat, tag } = this.quickTag || {}
      const book = this.quickTagBook
      if (book && cat && Array.isArray(book.tags?.[cat])) {
        book.tags[cat] = book.tags[cat].filter(t => t !== tag)
        await this.saveBook(book)
        this.printMessage('success', this.$t('m.tagRemoved'))
      }
      this.quickTagDialogVisible = false
    },
    async quickTagDelete () {
      const { cat, tag } = this.quickTag || {}
      if (!cat || !tag) return
      const ok = window.confirm(this.$t('m.deleteTagGlobal') + ': ' + tag + ' ?')
      if (!ok) return
      const res = await ipcRenderer.invoke('delete-tag', { cat, name: tag })
      if (res?.ok) {
        this.printMessage('success', this.$t('m.deleteTagDone', { n: res.count ?? 0 }))
        this.quickTagDialogVisible = false
        await this.loadBookList(false)
      } else {
        this.printMessage('error', res?.error || 'delete failed')
      }
    },
    searchFromTag (tag, cat) {
      this.$refs.BookDetailDialogRef.dialogVisibleBookDetail = false
      this.drawerVisibleCollection = false
      if (cat) {
        const letter = this.cat2letter[cat] ? this.cat2letter[cat] : cat
        this.searchString = `${letter}:"${tag}"$`
      } else {
        this.searchString = `"${tag}"$`
      }
      this.searchBook()
    },
    // ---------- 可配置点击策略(设置 → 高级设置):详细界面 / 内容界面 / 缩略图 ----------
    runClickAction (action, book) {
      if (!book) return
      switch (action) {
        case 'content':
          this.openContentView(book)
          break
        case 'thumbnail':
          this.openThumbnailView(book)
          break
        default:
          this.$refs.BookDetailDialogRef.openBookDetail(book)
          break
      }
    },
    onCoverClick (book) { this.runClickAction(this.setting.clickCoverAction || 'detail', book) },
    onYueClick (book) { this.runClickAction(this.setting.clickYueAction || 'detail', book) },
    onDuClick (book) { this.runClickAction(this.setting.clickDuAction || 'content', book) },
    onPageCountClick (book) { this.runClickAction(this.setting.clickPageCountAction || 'thumbnail', book) },
    onCoverDblClick (book) { this.runClickAction(this.setting.dblClickCoverAction || 'content', book) },
    // home main(兼容旧入口:未配置点击策略时沿用「单击封面进入」设置)
    handleClickCover (book) {
      if (this.setting.clickCoverAction) {
        this.runClickAction(this.setting.clickCoverAction, book)
        return
      }
      switch (this.setting.directEnter) {
        case 'internalViewer':
          this.$refs.InternalViewerRef.viewManga(book)
          break
        case 'externalViewer':
          this.$refs.BookDetailDialogRef.openLocalBook(book)
          break
        default:
          this.$refs.BookDetailDialogRef.openBookDetail(book)
          break
      }
    },
    addBookToHistory (id) {
      if (id) this.actionHistory.push({type: 'openBook', value: id})
    },
    jumpBookByTabindex (step, container) {
      try {
        const activeElement = document.activeElement
        if (!document.querySelector(container).contains(activeElement)) {
          throw new Error('active element not in container')
        }
        const tabIndexNow = activeElement.getAttribute('tabindex')
        const tabIndexNext = parseInt(tabIndexNow, 10) + step
        if (!(tabIndexNext >= 1)) throw new Error('detect illegal tabindex')
        document.querySelector(`${container} div[tabindex="${tabIndexNext}"]`).focus()
      } catch (error) {
        console.log(error)
        document.querySelector(`${container} div[tabindex="1"]`).focus()
      }
    },
    loadBookCardContent (id) {},
    unloadBookCardContent (id) {},
    chunkList () {
      this.currentPage = 1
      this.renderedCount = this.renderBatchSize
      this.chunkDisplayBookList = this.customChunk(this.displayBookList, this.setting.pageSize, 0)
      this.scrollMainPageTop()
      // 首屏若没排满,继续加载直到填满可视区域
      this.$nextTick(() => {
        const area = document.querySelector('.book-card-area')
        if (area && area.scrollHeight <= area.clientHeight + 200) {
          this.renderedCount += this.renderBatchSize
        }
      })
    },
    handleSizeChange () {
      this.chunkList()
      this.$refs.SettingRef.saveSetting()
      this.scrollMainPageTop()
    },
    handleCurrentPageChange (currentPage) {
      this.renderedCount = this.renderBatchSize
      this.chunkDisplayBookList = this.customChunk(this.displayBookList, this.setting.pageSize, currentPage - 1)
      this.scrollMainPageTop()
    },
    scrollMainPageTop () {
      document.getElementsByClassName('book-card-area')[0].scrollTop = 0
    },

    async getMetadataFromClipboardLink (book) {
      const text = await ipcRenderer.invoke('read-text-from-clipboard')
      const url = text.trim()
      if (url) {
        book.url = url
        this.$refs.SearchDialogRef.getBookInfo(book)
      }
    },
    // 封面右键:恢复本书目录里所有 .bak 备份(超分出错时回滚;没有备份的图片不动)
    async restoreBookBakFiles (book) {
      try {
        await ElMessageBox.confirm(this.$t('c.restoreBookBakConfirm'), this.$t('c.restoreBookBak'), { type: 'warning' })
      } catch (e) { return } // 用户取消
      try {
        // 只传纯对象:Vue 响应式对象没法结构化克隆(会报 An object could not be cloned)
        const res = await ipcRenderer.invoke('restore-book-bak-files', { filepath: book.filepath, id: book.id })
        if (res && res.ok) {
          if (res.restored > 0) this.printMessage('success', this.$t('c.restoreBookBakDone', { n: res.restored }))
          else this.printMessage('info', this.$t('c.restoreBookBakNone'))
        } else {
          this.printMessage('error', (res && res.error) || this.$t('c.restoreBookBakFail'))
        }
      } catch (err) {
        this.printMessage('error', this.$t('c.restoreBookBakFail') + ': ' + ((err && err.message) || err))
      }
    },

    // 封面右键:删除本书目录里的 .bak 备份(这个入口一直只写在菜单配置里,没接上处理函数)
    async deleteBookBakFiles (book) {
      try {
        await ElMessageBox.confirm(this.$t('c.deleteBookBakConfirm'), this.$t('c.deleteBookBak'), { type: 'warning' })
      } catch (e) { return }
      try {
        const res = await ipcRenderer.invoke('delete-book-bak-files', { filepath: book.filepath, id: book.id })
        if (res && res.ok) this.printMessage('success', this.$t('c.deleteBookBakDone', { n: res.count || 0 }))
        else this.printMessage('error', (res && res.error) || this.$t('c.restoreBookBakFail'))
      } catch (err) {
        this.printMessage('error', this.$t('c.restoreBookBakFail') + ': ' + ((err && err.message) || err))
      }
    },

    onBookContextMenu (e, book) {
      e.preventDefault()
      // 只读账户:隐藏封面右键菜单中的写操作(获取/重置元数据、移动、删除、隐藏、粘贴标签等)
      const viewerWriteIds = new Set(['getMetadata', 'resetMetadata', 'moveFile', 'deleteFile', 'toggleHidden', 'pasteTag', 'getMetadataFromLink'])
      const items = [
        {
          id: 'getMetadata',
          label: this.$t('m.getMetadata'),
          onClick: () => {
            this.$refs.SearchDialogRef.openSearchDialog(book)
          }
        },
        {
          id: 'resetMetadata',
          label: this.$t('m.resetMetadata'),
          onClick: () => {
            this.resetMetadata(book)
          }
        },
        {
          id: 'openFileLocation',
          label: this.$t('m.openMangaFileLocation'),
          onClick: () => {
            this.$refs.BookDetailDialogRef.showFile(book.filepath)
          }
        },
        {
          id: 'moveFile',
          label: this.$t('m.moveFile'),
          onClick: () => {
            this.handleMoveFile(book)
          }
        },
        {
          id: 'deleteFile',
          label: this.$t('m.deleteFile'),
          onClick: () => {
            this.$refs.BookDetailDialogRef.deleteLocalBook(book)
          }
        },
        {
          id: 'toggleHidden',
          label: this.$t('m.hideManga') + "/" + this.$t('m.showManga'),
          onClick: () => {
            this.$refs.BookDetailDialogRef.triggerHiddenBook(book)
          }
        },
        {
          id: 'copyTag',
          label: this.$t('m.copyTagClipboard'),
          onClick: () => {
            this.copyTagClipboard(book)
          }
        },
        {
          id: 'pasteTag',
          label: this.$t('m.pasteTagClipboard'),
          onClick: () => {
            this.pasteTagClipboard(book)
          }
        },
        {
          id: 'getMetadataFromLink',
          label: this.$t('m.getMetadataFromClipboardLink'),
          onClick: () => {
            this.getMetadataFromClipboardLink(book)
          }
        },
        {
          id: 'translateBook',
          label: this.$t('m.translateBook'),
          onClick: () => { this.runBookTask(book, 'translate') }
        },
        {
          id: 'pauseTask',
          label: this.$t('m.pauseTask'),
          onClick: () => { this.pauseBookTask(book.id) }
        },
        {
          id: 'resumeTask',
          label: this.$t('m.resumeTask'),
          onClick: () => { this.resumeBookTask(book.id) }
        },
        {
          id: 'abortTask',
          label: this.$t('m.abortTask'),
          onClick: () => { this.abortBookTask(book.id) }
        },
        {
          id: 'upscaleBook',
          label: this.$t('m.upscaleBook'),
          onClick: () => { this.runBookTask(book, 'upscale') }
        },
        {
          id: 'deleteBookBak',
          label: this.$t('c.deleteBookBak'),
          onClick: () => { this.deleteBookBakFiles(book) }
        },
        {
          id: 'restoreBookBak',
          label: this.$t('c.restoreBookBak'),
          onClick: () => { this.restoreBookBakFiles(book) }
        },
        {
          id: 'colorizeBook',
          label: this.$t('m.colorizeBook'),
          onClick: () => { this.runBookTask(book, 'colorize') }
        },
      ].filter(item => {
        const taskRunning = !!(this.bookTasks && this.bookTasks[book.id])
        if (item.id === 'pauseTask') return taskRunning && !this.isBookTaskPaused(book.id)
        if (item.id === 'resumeTask') return taskRunning && this.isBookTaskPaused(book.id)
        if (item.id === 'abortTask') return taskRunning
        return isContextMenuItemEnabled(this.setting, 'cover', item.id) && !(this.viewerRole && viewerWriteIds.has(item.id))
      })
      // 全部项都被取消勾选时不弹出空白菜单
      if (items.length === 0) return
      // 顺序按设置里的「右键菜单」完整顺序(拖动排序后立即生效)
      this.$contextmenu({ x: e.x, y: e.y, items: sortContextMenuItems(this.setting, 'cover', items) })
    },

    // ---------- UI 模式适配(自动/手机/平板/电脑) ----------
    applyUiMode () {
      const mobile = this.isMobile
      const tablet = this.isTablet
      document.body.classList.toggle('emm-mobile', mobile)
      document.body.classList.toggle('emm-phone', mobile && !tablet)
      document.body.classList.toggle('emm-tablet', mobile && tablet)
    },
    onResize () {
      this.applyUiMode()
    },
    switchUiMode () {
      // 循环:自动 → 手机 → 平板 → 电脑 → 自动
      const order = ['auto', 'phone', 'tablet', 'desktop']
      this.uiMode = order[(order.indexOf(this.uiMode) + 1) % order.length]
      localStorage.setItem('emmUiMode', this.uiMode)
      this.applyUiMode()
      this.printMessage('info', `${this.$t('m.switchUiMode')}: ${this.$t(this.uiModeLabelKey)}`)
    },
    // ---------- 工具栏上下文按钮 ----------
    // 本地模式:打开漫画库文件夹
    openLibraryFolder () {
      ipcRenderer.invoke('open-library-folder')
    },
    // 网页模式/网页版:服务器配置(打开设置并定位到常用页的服务器配置)
    openServerConfig () {
      this.$refs.SettingRef.dialogVisibleSetting = true
      this.$refs.SettingRef.activeSettingPanel = 'general'
    },

    handleMoveFile (book) {
      this.moveFileTargetBook = book
      this.moveFileTargetFolder = null
      this.moveFileDialogVisible = true
    },
    async confirmMoveFile () {
      if (!this.moveFileTargetBook || !this.moveFileTargetFolder) {
        this.printMessage('error', this.$t('c.moveError'))
        return
      }
      try {
        const newFilePath = await ipcRenderer.invoke('move-local-book', this.moveFileTargetBook.filepath, _.cloneDeep(this.moveFileTargetFolder))
        if (newFilePath) {
          this.moveFileTargetBook.filepath = newFilePath
          await this.saveBook(this.moveFileTargetBook)
        }
      } catch (e) {
        console.error(e)
      }
      this.moveFileDialogVisible = false
      this.moveFileTargetBook = null
      this.moveFileTargetFolder = null
    },

    // collection view function
    async loadCollectionList (bookList = null) {
      if (!bookList) {
        bookList = this.bookList
      }
      this.collectionList = await ipcRenderer.invoke('load-collection-list')

      // 创建查找映射表，避免重复遍历
      const bookMap = new Map(bookList.flatMap(book => [[book.hash, book], [book.id, book]]))

      _.forEach(this.collectionList, collection => {
        let collectBook = _.compact(collection.list.map(hash_id => {
          return bookMap.get(hash_id)
        }))
        collectBook = _.flatten(collectBook)
        collection.list = [...new Set(collectBook.map(book => book.hash))]
        collectBook.forEach(book => book.collectionHide = true)
        const date = _.last(_.compact(_.sortBy(collectBook.map(book => book.date))))
        const posted = _.last(_.compact(_.sortBy(collectBook.map(book => book.posted))))
        const rating = _.last(_.compact(_.sortBy(collectBook.map(book => book.rating))))
        const mtime = _.last(_.compact(_.sortBy(collectBook.map(book => book.mtime))))
        const mark = _.some(collectBook, 'mark')
        const pageDiff = _.some(collectBook, 'pageDiff') ? true : undefined
        const readCount = _.max(collectBook.map(book => book.readCount))
        const pageCount = _.sum(collectBook.map(book => book.pageCount))
        const tags = _.mergeWith({}, ...collectBook.map(book => book.tags), (obj, src) => {
          if (_.isArray(obj) && _.isArray(src)) {
            return [...new Set(obj.concat(src))]
          } else {
            return src
          }
        })
        const ids = collectBook.map(book => book.id)
        const title_jpn = collectBook.map(book => book.title+book.title_jpn).join(',')
        const filepath = collectBook.map(book => book.filepath).join(',')
        const category = [...new Set(collectBook.map(book => book.category))].join(',')
        const status = [...new Set(collectBook.map(book => book.status))].join(',')
        if (!_.isEmpty(collectBook)) {
          bookList.push({
            title: collection.title,
            id: collection.id,
            coverPath: collectBook?.[0]?.coverPath,
            date, posted, rating, mtime, mark, tags, title_jpn, category, status, pageDiff, readCount, pageCount,
            list: collection.list,
            filepath,
            isCollection: true,
            chapterCount: collection?.list?.length,
            ids,
          })
        }
      })
    },
    openCollection (collection) {
      this.drawerVisibleCollection = true
      this.openCollectionBookList = _.compact(_.flatten(collection.list.map(hash_id => {
        return _.filter(this.bookList, book => book.id === hash_id || book.hash === hash_id)
      })))
      this.openCollectionTitle = collection.title
      this.$refs.EditViewRef.selectCollection = collection.id
    },
    editCurrentCollection () {
      this.drawerVisibleCollection = false
      this.$refs.EditViewRef.editCollectionView = true
      this.$refs.EditViewRef.handleSelectCollectionChange(this.$refs.EditViewRef.selectCollection)
    },
    previewManga (book) {
      this.$refs.InternalViewerRef.showThumbnail = true
      this.$refs.InternalViewerRef.viewManga(book, '83%')
    },

    // bookDetailView
    jumpMangeDetail (step) {
      const activeBookList = this.drawerVisibleCollection ? this.openCollectionBookList : _.filter(this.displayBookList, book => this.isBook(book) && this.isVisibleBook(book))
      const indexNow = _.findIndex(activeBookList, {id: this.bookDetail.id})
      const indexNext = indexNow + step
      if (indexNext >= 0 && indexNext < activeBookList.length) {
        this.$refs.BookDetailDialogRef.openBookDetail(activeBookList[indexNext])
      } else {
        this.printMessage('info', this.$t('c.outOfRange'))
      }
    },
    jumpMangeDetailRandom () {
      const activeBookList = this.drawerVisibleCollection ? this.openCollectionBookList : _.filter(this.displayBookList, book => this.isBook(book) && this.isVisibleBook(book))
      this.$refs.BookDetailDialogRef.openBookDetail(_.sample(activeBookList))
    },
    openContentView (book) {
      const viewer = this.$refs.InternalViewerRef
      if (!viewer || typeof viewer.viewManga !== 'function') {
        // 阅读器未就绪(或纯网页模式)时兜底:打开详细界面,避免"双击没反应"
        this.printMessage('warning', this.$t('m.viewerUnavailable') || 'viewer unavailable')
        this.$refs.BookDetailDialogRef.openBookDetail(book)
        return
      }
      viewer.showThumbnail = false
      viewer.viewManga(book)
    },
    openThumbnailView (book) {
      this.$refs.InternalViewerRef.showThumbnail = true
      this.$refs.InternalViewerRef.viewManga(book)
    },
    handleRemoveBookDisplay () {
      this.chunkDisplayBookList = this.customChunk(this.displayBookList, this.setting.pageSize, this.currentPage - 1)
    },

    // internal viewer
    // 「打开下一本」1 秒冷却:新打开的书若也处于「已读完」(阅读进度带过去的),
    // 会立刻再次触发下一本,不加限制会一连切掉好几本
    canSwitchManga () {
      const now = Date.now()
      if (this.lastMangaSwitchAt && now - this.lastMangaSwitchAt < 1000) return false
      this.lastMangaSwitchAt = now
      return true
    },
    toNextManga (step) {
      if (!this.canSwitchManga()) return
      this.$refs.InternalViewerRef.handleStopReadManga()
      const activeBookList = this.drawerVisibleCollection ? this.openCollectionBookList : _.filter(this.displayBookList, book => this.isBook(book) && this.isVisibleBook(book))
      const indexNow = _.findIndex(activeBookList, {id: this.bookDetail.id})
      const indexNext = indexNow + step
      if (indexNext >= 0 && indexNext < activeBookList.length) {
        const selectBook = activeBookList[indexNext]
        setTimeout(() => {
          this.bookDetail = selectBook
          this.$refs.InternalViewerRef.viewManga(selectBook)
          this.comments = []
          if (this.setting.showComment) this.getComments(selectBook.url)
        }, 500)
      } else {
        this.printMessage('info', this.$t('c.outOfRange'))
      }
    },
    toNextMangaRandom () {
      if (!this.canSwitchManga()) return
      this.$refs.InternalViewerRef.handleStopReadManga()
      const activeBookList = this.drawerVisibleCollection ? this.openCollectionBookList : _.filter(this.displayBookList, book => this.isBook(book) && this.isVisibleBook(book))
      const selectBook = _.sample(activeBookList)
      setTimeout(() => {
        this.bookDetail = selectBook
        this.$refs.InternalViewerRef.viewManga(selectBook)
        this.comments = []
        if (this.setting.showComment) this.getComments(selectBook.url)
      }, 500)
    },
  }
})
</script>
<style lang='stylus'>
body
  margin: auto
  width: calc(100vw - 20px)
#app
  font-family: Avenir, Helvetica, Arial, sans-serif
  text-align: center
  margin-top: 20px

@keyframes striped-flow
  0%
    background-position: -100%
  to
    background-position: 100%

.pop-enter-active, .pop-leave-active
  transition: opacity .2s ease

.pop-enter-from, .pop-leave-to
  opacity: 0

// ---------- 全局动画微调(更丝滑) ----------
:root
  --el-transition-duration: .25s
  --el-transition-duration-fast: .18s

// 页面级滚动平滑
html
  scroll-behavior: smooth

// 按钮按下的轻反馈
.el-button:not(.is-disabled):not(.is-loading):active
  transform: scale(.96)

// 开关、标签等过渡更柔和
.el-switch
  transition: opacity .2s ease

// 滚动条细一点,更现代
::-webkit-scrollbar
  width: 8px
  height: 8px
::-webkit-scrollbar-thumb
  background-color: var(--el-border-color-darker, #c0c4cc)
  border-radius: 4px
  &:hover
    background-color: var(--el-text-color-placeholder, #a8abb2)
::-webkit-scrollbar-track
  background-color: transparent

// ---------- 滚动容器丝滑 ----------
.book-card-area
  scroll-behavior: smooth
  overscroll-behavior: contain
  -webkit-overflow-scrolling: touch
  will-change: scroll-position
  // 卡片跳过屏外渲染,大幅降低滚动掉帧(尺寸跟随封面设置)
  .book-card-frame
    content-visibility: auto
    contain-intrinsic-size: calc(var(--emm-cover-size, 220px) + 14px) calc(var(--emm-cover-size, 220px) * 1.72 + 30px)

// el-scrollbar 内部滚动(阅读器缩略图、标签列表等)
.el-scrollbar__wrap
  scroll-behavior: smooth
  overscroll-behavior: contain
  -webkit-overflow-scrolling: touch

#progressbar
  position: fixed
  top: 0
  left: 0
  height: 6px
  background-color: #67C23A
  background-image: linear-gradient(45deg,rgba(0,0,0,.1) 25%,transparent 25%,transparent 50%,rgba(0,0,0,.1) 50%,rgba(0,0,0,.1) 75%,transparent 75%,transparent)
  background-size: 2em 2em
  animation: striped-flow 3s linear infinite
  animation-duration: 30s
  border-radius: 2px
  transition: width 0.5s linear

// 扫描枚举阶段(进度未知):条左右滑动的不确定进度动画
#progressbar.indeterminate
  width: 35% !important
  animation: scan-slide 1.2s ease-in-out infinite

// ============================================================
// 移动端/平板适配:body.emm-mobile 由「界面模式切换按钮」控制
// (auto 模式随窗口宽度 <768px 自动生效,或手动强制移动/桌面布局)
// ============================================================
body.emm-mobile
  // 卡片自适应列数:手机 2 列,平板 3-5 列
  // 注意:el-row 的 gutter 会为卡片列加上左右内边距(共约 20px),
  // 所以列宽要按「内容可用宽 = 100vw - 卡片区留白 - gutter 内边距」反推,
  // 否则算出来的列宽实际放不下 N 列,flex 会把每行折成 1 列(手机出现"单列大图")。
  // 只能用纯 calc(sass 会把 min()/clamp() 提前折叠成常数,导致列宽公式失效)
  // 卡片宽度:用户调过就用他的值(--emm-card-width),没调过才按屏宽自适应列宽。
  // 以前这里直接写死列宽(还带 !important),设置里的宽/高在手机、平板上完全无效。
  --emm-cover-size: var(--emm-card-width, calc((100vw - 70px) / 2))
  @media (min-width: 600px)
    --emm-cover-size: var(--emm-card-width, calc((100vw - 100px) / 3))
  @media (min-width: 900px)
    --emm-cover-size: var(--emm-card-width, calc((100vw - 130px) / 4))
  @media (min-width: 1200px)
    --emm-cover-size: var(--emm-card-width, calc((100vw - 170px) / 5))
  // 手动指定模式:手机 2 列,平板 3 列
  &.emm-phone
    --emm-cover-size: var(--emm-card-width, calc((100vw - 70px) / 2)) !important
  &.emm-tablet
    --emm-cover-size: var(--emm-card-width, calc((100vw - 100px) / 3)) !important
  // 卡片高度、卡片间距都不再覆盖 —— 设置里调多少就是多少
  // 工具栏:搜索框独占一行,按钮自动换行
  .book-search-bar
    padding: 0 8px
  .toolbar-flex
    flex-wrap: wrap
    width: auto !important
    gap: 6px
    padding: 8px 0
    .search-input
      flex: 1 1 100%
      min-width: 0
    .sort-select-wrap
      .sort-select
        max-width: 150px
  // 卡片区贴边 + 居中
  .book-card-area
    padding: 0 6px
  .book-card-list
    text-align: center
  // 对话框全屏(设置/详情/搜索等)
  .el-dialog
    width: 100vw !important
    max-width: 100vw !important
    margin: 0 !important
    height: 100dvh
    max-height: 100dvh
    display: flex
    flex-direction: column
    border-radius: 0
    .el-dialog__header
      flex: 0 0 auto
    .el-dialog__body
      flex: 1
      overflow: auto
  // 大屏专用按钮隐藏
  .fullscreen-button
    display: none
  // 阅读器工具条:允许换行,按钮紧凑
  .viewer-drawer
    .viewer-mode-setting
      flex-wrap: wrap
      gap: 4px
    .next-manga-button
      flex-wrap: wrap
      .el-button
        margin-left: 0
        padding: 6px 10px
  // 详情页封面与信息在窄屏下自然堆叠
  .book-detail-cover
    max-width: 100%
  // 分页条:窄屏下允许换行,禁止把整页撑出横向滚动(内容按 100vw 排布)
  .pagination-bar
    justify-content: center
    .el-pagination
      flex-wrap: wrap
      row-gap: 4px
      max-width: 100%
      justify-content: center
  // 设置弹窗窄屏:内边距收紧、顶部分类标签可横向滑动
  .setting-dialog
    .el-dialog__body
      padding: 8px 10px
    .el-tabs__header
      margin-bottom: 6px
    .el-tabs__nav-wrap
      overflow-x: auto

@keyframes scan-slide
  0%
    transform: translateX(-120%)
  100%
    transform: translateX(420%)


.fullscreen-button
  position: absolute
  top: 39px
  left: calc(50vw - 22px)
  border-width: 0
  opacity: 0
  z-index: 3000!important
  .el-icon
    width: 20px
    svg
      height: 20px
      width: 20px
.fullscreen-button:hover
  opacity: 1
  background-color: #ffffff66

.search-input,
.function-button
  width: 100%
// 工具栏:固定一行,搜索栏随按钮数量伸缩,宽度与卡片行对齐并居中
.toolbar-flex
  display: flex
  align-items: center
  justify-content: flex-start
  flex-wrap: nowrap
  gap: 8px
  margin: 0 auto
  transition: width .3s ease
  overflow: hidden
  .search-input
    flex: 1 1 auto
    min-width: 120px
  .sort-select
    width: 150px
    flex: 0 0 150px
  .sort-select-wrap
    display: inline-flex
    gap: 4px
    align-items: center
    flex: 0 0 auto
    .sort-dir-btn
      width: 24px
      padding: 0
      margin: 0
      font-size: 13px
  .edit-btn-group
    display: inline-flex
    gap: 8px
    flex: 0 0 auto

// 像素风格自带字体:缝合像素字体 Fusion Pixel 12px(OFL-1.1,许可证见 src/assets/fonts/OFL-fusion-pixel.txt)
// 自带字体文件,不依赖用户本机安装。方舟像素(Ark Pixel)对中文/日文覆盖不全,改用缝合像素:
// 汉字覆盖面更广,且日文假名单独一段 unicode-range,所以中文、日文都能像素化。
// 简体 / 繁体是两个字体族,由 applyPixelTheme 按界面语言切换。
@font-face
  font-family: 'EmmPixel'
  font-style: normal
  font-weight: 100 900
  font-display: swap
  src: url('./assets/fonts/fusion-pixel-12px-proportional-latin.woff2') format('woff2')
  unicode-range: U+0000-024F, U+1E00-1EFF, U+2000-206F, U+20A0-20CF, U+2100-214F, U+2190-21FF, U+2200-22FF, U+25A0-25FF
@font-face
  font-family: 'EmmPixel'
  font-style: normal
  font-weight: 100 900
  font-display: swap
  src: url('./assets/fonts/fusion-pixel-12px-proportional-ja.woff2') format('woff2')
  unicode-range: U+3040-30FF, U+31F0-31FF, U+FF66-FF9F
@font-face
  font-family: 'EmmPixel'
  font-style: normal
  font-weight: 100 900
  font-display: swap
  src: url('./assets/fonts/fusion-pixel-12px-proportional-zh_hans.woff2') format('woff2')
  unicode-range: U+2E80-2EFF, U+3000-303F, U+31C0-31EF, U+3200-32FF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FE30-FE4F, U+FF00-FF65, U+FFA0-FFEF
@font-face
  font-family: 'EmmPixelHant'
  font-style: normal
  font-weight: 100 900
  font-display: swap
  src: url('./assets/fonts/fusion-pixel-12px-proportional-latin.woff2') format('woff2')
  unicode-range: U+0000-024F, U+1E00-1EFF, U+2000-206F, U+20A0-20CF, U+2100-214F, U+2190-21FF, U+2200-22FF, U+25A0-25FF
@font-face
  font-family: 'EmmPixelHant'
  font-style: normal
  font-weight: 100 900
  font-display: swap
  src: url('./assets/fonts/fusion-pixel-12px-proportional-ja.woff2') format('woff2')
  unicode-range: U+3040-30FF, U+31F0-31FF, U+FF66-FF9F
@font-face
  font-family: 'EmmPixelHant'
  font-style: normal
  font-weight: 100 900
  font-display: swap
  src: url('./assets/fonts/fusion-pixel-12px-proportional-zh_hant.woff2') format('woff2')
  unicode-range: U+2E80-2EFF, U+3000-303F, U+31C0-31EF, U+3200-32FF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FE30-FE4F, U+FF00-FF65, U+FFA0-FFEF

// 像素风格(高级主题):自带像素字体、方角硬边、图片真像素化(降采样)、方块动画
html.theme-pixel
  --emm-pixel-border: 2px solid var(--el-border-color-darker, #606266)
  // 像素风给按钮/输入框加了 2px 硬边框,尺寸会略微变大,容易把内容顶出横向滚动条
  overflow-x: hidden
  body
    overflow-x: hidden
  .el-icon svg
    shape-rendering: crispEdges
  // 全部图片 / 缩略图 / Canvas 像素化(封面、阅读器图片、侧栏与底部缩略图都走这条)
  img, canvas, video
    image-rendering: pixelated
  // 全部字体像素化:直接盖在 body 上 —— 设置对话框、选择器浮层、右键菜单都是 teleport 到 body 的,
  // 只写 #app 会漏掉一大半(设置里那些字就是这么漏的)
  body, body *
    font-family: var(--emm-pixel-font, 'EmmPixel'), 'EmmPixelHant', ui-monospace, monospace !important
    -webkit-font-smoothing: none
    font-smooth: never
  *, *::before, *::after
    border-radius: 0 !important
    box-shadow: none !important
    text-shadow: none !important
    transition: none !important
    // 动画改成「方块跳帧」:所有缓动都换成 steps,不再有平滑过渡
    transition-timing-function: steps(4, end) !important
    animation-timing-function: steps(6, end) !important
  // 加载/任务转圈:圆环变方块
  .book-task-ring, .book-task-mask, .el-loading-spinner .circular, .el-loading-spinner .path
    border-radius: 0 !important
  // 封面像素化交给「真降采样」:渲染端 Canvas,失败时走主进程 nativeImage(pixelate-cover)。
  // ⚠️ 不再用 CSS 缩放:transform: scale(4) 会撑出可视溢出(页面多出滚动条),
  //    而给 book-cover-frame 加 overflow: hidden 又会把右上角的收藏按钮裁掉。
  .book-card-list img, .book-cover, .book-cover-fill
    image-rendering: pixelated
  // 按钮:粗像素风(2px 硬边框 + 左上亮/右下暗的内阴影,像老游戏按钮)
  .el-button
    box-sizing: border-box !important
    border-width: 2px !important
    border-style: solid !important
    box-shadow: inset 2px 2px 0 0 rgba(255, 255, 255, .28), inset -2px -2px 0 0 rgba(0, 0, 0, .35) !important
    &:active
      transform: translate(2px, 2px)
      box-shadow: inset -2px -2px 0 0 rgba(255, 255, 255, .28), inset 2px 2px 0 0 rgba(0, 0, 0, .35) !important
  // ---------- 方块的「贪吃蛇」动画 ----------
  // 顶部扫描进度:一个小方块从左跳到右,像蛇头
  #progressbar
    transition: none !important
  #progressbar.indeterminate
    width: 14px !important
    animation: pixel-jump 1.6s steps(12, end) infinite !important
  // 加载遮罩:方块绕着方形路径跑一圈
  .el-loading-spinner
    position: relative
    width: 26px
    height: 26px
    .circular
      display: none !important
    &::after
      content: ''
      position: absolute
      top: 0
      left: 0
      width: 8px
      height: 8px
      background-color: var(--el-color-primary)
      animation: pixel-chase 1.4s steps(8, end) infinite
  // 收藏按钮:像素风小方块 + 像素心(mask),原书签 SVG 变透明占位
  .book-card-mark
    right: 3px !important
    top: 3px !important
  .book-card-mark, .fill-mark
    width: 22px
    height: 22px
    padding: 0
    box-sizing: border-box
    border: 2px solid var(--el-border-color-darker, #606266) !important
    // 半透明深色底:填充封面布局的白色心形、经典布局的橙/灰心形都能看清
    background-color: rgba(0, 0, 0, .45) !important
    svg
      opacity: 0 !important
    &::after
      content: ''
      position: absolute
      inset: 3px
      background-color: currentColor
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 7 7'%3E%3Cg fill='black'%3E%3Crect x='1' y='0' width='2' height='1'/%3E%3Crect x='4' y='0' width='2' height='1'/%3E%3Crect x='0' y='1' width='7' height='3'/%3E%3Crect x='1' y='4' width='5' height='1'/%3E%3Crect x='2' y='5' width='3' height='1'/%3E%3Crect x='3' y='6' width='1' height='1'/%3E%3C/g%3E%3C/svg%3E") center / contain no-repeat
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 7 7'%3E%3Cg fill='black'%3E%3Crect x='1' y='0' width='2' height='1'/%3E%3Crect x='4' y='0' width='2' height='1'/%3E%3Crect x='0' y='1' width='7' height='3'/%3E%3Crect x='1' y='4' width='5' height='1'/%3E%3Crect x='2' y='5' width='3' height='1'/%3E%3Crect x='3' y='6' width='1' height='1'/%3E%3C/g%3E%3C/svg%3E") center / contain no-repeat
  // 阅读器里看漫画时不做像素化(用户要求:看图保持原样)
  .viewer-drawer .drawer-image-content img,
  .viewer-drawer .viewer-image-frame img,
  .viewer-drawer .viewer-horizontal-item img,
  .viewer-drawer .image-frame img
    image-rendering: auto !important
  // 评分星星:用 SVG 蒙版换成像素方块星。
  // ⚠️ 原 SVG 不能 display:none —— 那样点击区域与半星的 50% 宽度都会塌掉;
  //    现在它只是透明占位,形状交给 mask(蒙版固定 14px,半星时只露左半)
  .el-rate__icon
    width: 18px
    height: 18px
    display: inline-block
  .el-rate__icon, .el-rate__decimal
    background-color: currentColor
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 7 7'%3E%3Cg fill='black'%3E%3Crect x='3' y='0' width='1' height='2'/%3E%3Crect x='2' y='2' width='3' height='1'/%3E%3Crect x='0' y='3' width='7' height='2'/%3E%3Crect x='1' y='5' width='5' height='1'/%3E%3Crect x='2' y='6' width='1' height='1'/%3E%3Crect x='4' y='6' width='1' height='1'/%3E%3C/g%3E%3C/svg%3E") center / 14px 14px no-repeat
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 7 7'%3E%3Cg fill='black'%3E%3Crect x='3' y='0' width='1' height='2'/%3E%3Crect x='2' y='2' width='3' height='1'/%3E%3Crect x='0' y='3' width='7' height='2'/%3E%3Crect x='1' y='5' width='5' height='1'/%3E%3Crect x='2' y='6' width='1' height='1'/%3E%3Crect x='4' y='6' width='1' height='1'/%3E%3C/g%3E%3C/svg%3E") center / 14px 14px no-repeat
    svg
      opacity: 0 !important
  .el-button, .el-input__wrapper, .el-select__wrapper, .el-textarea__inner, .el-tag, .el-card, .el-checkbox__inner, .el-switch__core
    border: var(--emm-pixel-border) !important
  .el-dialog
    border: 3px solid var(--el-border-color-darker, #606266) !important
  .book-card
    border: 3px solid var(--el-border-color-darker, #606266)
    &:hover
      transform: none
      box-shadow: none

// 自定义主题
html.theme-custom
  background-color: var(--emm-custom-bg, #ffffff)
  background-image: var(--emm-custom-bg-image, none)
  // 注意:不要动 --el-font-size-*,自定义字号只影响正文/卡片文字,
  // 按钮(含框内图标)必须保持原始尺寸
  background-size: cover
  background-position: center
  background-attachment: fixed
  --el-text-color-primary: var(--emm-custom-font-color, #303133)
  --el-text-color-regular: var(--emm-custom-font-color, #606266)
  #app
    font-size: var(--emm-custom-font-size, 14px)
    color: var(--emm-custom-font-color, inherit)
    font-family: var(--emm-custom-font-family, inherit)
    font-weight: var(--emm-custom-font-weight, normal)
    font-style: var(--emm-custom-font-italic, normal)
    text-decoration-line: var(--emm-custom-font-decoration, none)
  // 下划线不会传播到绝对定位的后代(卡片上的浮层文字就是),所以每个元素都显式带上
  #app *
    text-decoration-line: var(--emm-custom-font-decoration, none)
  // 弹层/卡片背景跟随背景色(半透明)增强沉浸感
  .el-dialog, .el-drawer, .el-message-box
    background-color: var(--emm-custom-panel-bg, var(--el-bg-color-overlay))
  .book-card
    background-color: var(--emm-custom-card-bg, var(--el-bg-color-overlay))
  // 按钮框内颜色(未单独设置时按背景色自动混合)
  .el-button.is-plain
    background-color: var(--emm-custom-button-bg, var(--el-fill-color-blank))
  // 工具栏:输入框 / 下拉框 / plain 按钮跟随自定义背景色,否则深色背景下会是一块白
  .toolbar-flex
    // 直接覆盖 Element Plus 变量 —— 工具栏里的界面模式按钮、设置按钮、排序框、搜索框
    // 全部由这些变量驱动,不依赖各控件选择器的优先级(以前界面模式框就是漏在这里)
    --el-fill-color-blank: unquote("color-mix(in srgb, var(--emm-custom-bg, #ffffff) 88%, var(--emm-custom-font-color, #303133) 12%)")
    --el-button-bg-color: unquote("color-mix(in srgb, var(--emm-custom-bg, #ffffff) 88%, var(--emm-custom-font-color, #303133) 12%)")
    --el-button-hover-bg-color: unquote("color-mix(in srgb, var(--emm-custom-bg, #ffffff) 88%, var(--emm-custom-font-color, #303133) 12%)")
    --el-button-active-bg-color: unquote("color-mix(in srgb, var(--emm-custom-bg, #ffffff) 88%, var(--emm-custom-font-color, #303133) 12%)")
    --el-button-disabled-bg-color: unquote("color-mix(in srgb, var(--emm-custom-bg, #ffffff) 88%, var(--emm-custom-font-color, #303133) 12%)")
    // stylus 会把 color-mix(in srgb, ...) 的 in 当语法解析,必须用 unquote 原样输出
    // 搜索框 / 排序框 / plain 按钮统一用「按钮框内颜色」
    .el-input__wrapper, .el-select__wrapper, .el-textarea__inner
      background-color: var(--emm-custom-button-bg, unquote("color-mix(in srgb, var(--emm-custom-bg, #ffffff) 88%, var(--emm-custom-font-color, #303133) 12%)"))
    .el-button.is-plain
      background-color: var(--emm-custom-button-bg, unquote("color-mix(in srgb, var(--emm-custom-bg, #ffffff) 88%, var(--emm-custom-font-color, #303133) 12%)"))
// 像素风格用的两个方块动画(贪吃蛇式)
@keyframes pixel-jump
  0%
    margin-left: 0
  100%
    margin-left: calc(100vw - 14px)

@keyframes pixel-chase
  0%
    left: 0
    top: 0
  25%
    left: calc(100% - 10px)
    top: 0
  50%
    left: calc(100% - 10px)
    top: calc(100% - 10px)
  75%
    left: 0
    top: calc(100% - 10px)
  100%
    left: 0
    top: 0

// 封面像素化进行中:先隐藏原图,换好像素图(data-pixel-done)或处理失败(data-pixel-failed)才显示
// 只在「像素风格开启 + 清晰度 > 0」时生效(清晰度为 0 时不做像素化,封面照常显示)
html.theme-pixel-covers
  .book-card-list img:not([data-pixel-done]):not([data-pixel-failed])
    opacity: 0 !important
  // 显示网格:在封面外层叠一层网格线(行列数由 JS 写进 --pixel-cols/--pixel-rows)
  .book-cover-frame[data-pixel-grid], .book-card[data-pixel-grid]
    position: relative
    &::after
      content: ''
      position: absolute
      inset: 0
      pointer-events: none
      background-image: repeating-linear-gradient(to right, rgba(0, 0, 0, .35) 0 1px, transparent 1px calc(100% / var(--pixel-cols, 60))), repeating-linear-gradient(to bottom, rgba(0, 0, 0, .35) 0 1px, transparent 1px calc(100% / var(--pixel-rows, 80)))

// ============ 音乐律动加载动画(4 根柱子上下跳,替代转圈) ============
.emm-eq
  display: inline-flex
  align-items: flex-end
  justify-content: center
  gap: 3px
  height: 22px
  i
    width: 4px
    background-color: var(--el-color-primary, #409EFF)
    transform-origin: bottom center
    // !important:像素模式里那条「所有动画都用 steps(6)」的规则会覆盖简写里的 timing
    animation: emm-eq 0.9s steps(4, end) infinite !important
    &:nth-child(1)
      height: 34%
      animation-delay: 0s
    &:nth-child(2)
      height: 72%
      animation-delay: .15s
    &:nth-child(3)
      height: 48%
      animation-delay: .3s
    &:nth-child(4)
      height: 92%
      animation-delay: .45s
// 白色浮层上的均衡器(填充封面/任务遮罩)用白柱子,并保证居中
.book-task-mask .emm-eq, .cover-loading .emm-eq
  position: relative
  margin: 0 auto
  flex: 0 0 auto
  i
    background-color: #ffffff
// ⚠️ 任务遮罩容器原来是个「转圈环」,自带 spin 动画 —— 换成均衡器后必须关掉它自己的旋转,
//    否则 4 根柱子会跟着一起转
.book-task-ring.emm-eq
  width: auto !important
  height: auto !important
  border: none !important
  background: none !important
  animation: none !important

@keyframes emm-eq
  0%, 100%
    transform: scaleY(.35)
  50%
    transform: scaleY(1)

// 像素模式:加载中的按钮改成「光点闪烁」
html.theme-pixel
  .el-button.is-loading
    .el-icon
      display: none !important
    &::after
      content: ''
      display: inline-block
      width: 6px
      height: 6px
      background-color: currentColor
      box-shadow: 10px 0 0 currentColor, 20px 0 0 currentColor
      animation: emm-blink 1s steps(3, end) infinite

@keyframes emm-blink
  0%
    opacity: 1
  35%
    opacity: .2
  70%
    opacity: .65
  100%
    opacity: 1

// 自动主题(替代原「混合背景」):按当前显示的漫画封面取色,
// 联动 卡片框背景 / 卡片边框 / 按钮框内颜色 / 按钮内文字颜色 / 主色调
html.theme-auto
  --el-color-primary: var(--emm-auto-primary, #409EFF)
  --el-color-primary-dark-2: var(--emm-auto-primary-dark, #337ecc)
  .book-card
    background-color: var(--emm-auto-card-bg, var(--el-bg-color-overlay)) !important
    border-color: var(--emm-auto-card-border, var(--el-border-color)) !important
    // 浅底色配深色文字,保证看得清
    color: var(--emm-auto-card-text, #1f1f1f) !important
    .book-title, .fill-title, .book-status-tag
      color: var(--emm-auto-card-text, #1f1f1f) !important
  .el-button
    background-color: var(--emm-auto-button-bg, var(--el-button-bg-color)) !important
    border-color: var(--emm-auto-card-border, var(--el-border-color)) !important
    color: var(--emm-auto-button-text, var(--el-button-text-color)) !important

// 像素风格的默认背景图(用户提供的那张);若设了自定义背景图,以自定义为准
// (theme-custom 的规则写在后面,同优先级下后写者胜)
html.theme-pixel
  // 有自定义背景图(--emm-custom-bg-image 只在设了图时才有值)就用自定义的,没有才用内置默认图。
  // ⚠️ 不能直接写死 url(默认图):这条规则在 html.theme-custom 之后,会把自定义背景图盖掉
  background-image: var(--emm-custom-bg-image, url('./assets/pixel-default-bg.png'))
  background-size: cover
  background-position: center
  background-attachment: fixed
  // body 默认有不透明底色,会把 html 上的背景图盖住 → 让它透明透出来
  body
    background-color: transparent
// 设了自定义背景图时(theme-custom),body 同样透明,由 html 上的自定义背景图接管
html.theme-custom
  body
    background-color: transparent

.autocomplete-value
  margin-left: 2em
  float: right

// search-input sort-select
.el-autocomplete-suggestion__wrap, .el-select-dropdown__wrap
  max-height: 490px!important

.book-tag-edit-cascader-popper
  .el-cascader-menu__wrap.el-scrollbar__wrap
    height: 340px

.pagination-bar
  margin: 4px 0
  justify-content: center
  .el-pagination--small .el-select
    width: 110px
    .el-select__wrapper
      text-align: center

.book-card-area
  overflow-x: auto
  justify-content: center
  margin-top: 8px
  .book-card-list
    height: calc(100vh - 96px)
    display: flex
    flex-wrap: wrap
    justify-content: center
    align-content: flex-start

// 标签快速编辑弹窗(长按卡片标签)
.quick-tag-body
  .quick-tag-line
    display: flex
    align-items: center
    gap: 8px
    margin: 0 0 10px
    .quick-tag-raw
      font-size: 12px
      color: var(--el-text-color-secondary)
.quick-tag-actions
  display: flex
  flex-wrap: wrap
  gap: 8px
  justify-content: flex-end

.book-card-frame
  // 卡片框最小宽度 = 卡片宽度 + 左右间距 —— 以前固定 +14px,所以间距调到 0 也贴不到一起
  min-width: calc(var(--emm-cover-size, 220px) + var(--emm-card-gap-h, 0px) * 2)
  display: inline-block

// 逐排加载哨兵(占位一行,进入视口即触发下一排加载)
.render-sentinel
  width: 100%
  height: 0
  flex-basis: 100%

.collection-book-card-list
  display: flex
  flex-wrap: wrap
  justify-content: center
  align-content: flex-start

.open-collection-title
  margin: 0 4px
.collection-edit-button
  margin-bottom: 2px


.mx-menu-ghost-host
  z-index: 5000!important
.mx-context-menu
  background-color: var(--el-fill-color-extra-light)!important
  .mx-context-menu-item:hover
    background-color: var(--el-fill-color-dark)
    color: var(--el-text-color-regular)
  .mx-context-menu-item
    padding: 6px
    color: var(--el-text-color-regular)

html.light
  color-scheme: light

html.exhentai
  background-color: #34353b
  --el-bg-color: #34353b
  --el-bg-color-overlay: #34353b
  --el-color-primary: #909399
  --el-color-primary-light-3: #6b6d71
  --el-color-primary-light-5: #525457
  --el-color-primary-light-7: #393a3c
  --el-color-primary-light-8: #2d2d2f
  --el-color-primary-light-9: #383838
  --el-color-primary-dark-2: #a6a9ad
  --el-color-warning-light-9: #433827
  --el-color-danger-light-9: #493333
  --el-color-success-light-9: #303927
  --el-color-info-light-9: #383838
  --el-fill-color-light: #3d414b
  --el-fill-color-extra-light: #3d414b
  --el-fill-color-dark: #50535b
  --el-border-color: #6e6e6e

html.e-hentai
  background-color: #e2e0d2
  --el-bg-color: #e2e0d2
  --el-bg-color-overlay: #e2e0d2
  --el-color-primary: #521613
  --el-color-primary-light-3: #eebe77
  --el-color-primary-light-5: #9d702e
  --el-color-primary-light-7: #f8e3c5
  --el-color-primary-light-8: #faecd8
  --el-color-primary-light-9: #fdf6ec
  --el-color-primary-dark-2: #b88230
  --el-fill-color-light: #edebe0
  --el-fill-color-extra-light: #edebe0
  --el-fill-color-dark: #fefcf4
  --el-fill-color-blank: #e2e0d2
  --el-border-color: #919191

html.nhentai
  color-scheme: dark
  background-color: #0d0d0d
  --el-bg-color: #0d0d0d
  --el-bg-color-overlay: #0d0d0d
  --el-bg-color-page: #0d0d0d
  // 这个主题没有挂 html.dark,Element Plus 的深色变量得自己补齐,
  // 否则输入框 / plain 按钮会是一块白底,文字也是深色,在纯黑背景上非常突兀
  --el-fill-color-blank: #1f1f1f
  --el-fill-color: #262626
  --el-fill-color-lighter: #1a1a1a
  --el-text-color-primary: #e5eaf3
  --el-text-color-regular: #cfd3dc
  --el-text-color-secondary: #a3a6ad
  --el-text-color-placeholder: #8d9095
  --el-text-color-disabled: #6c6e72
  --el-border-color-light: #414243
  --el-border-color-lighter: #363637
  --el-border-color-extra-light: #2b2b2c
  --el-mask-color: rgba(0, 0, 0, .8)
  --el-color-primary: #d54255
  --el-color-primary-light-3: #b25252
  --el-color-primary-light-5: #854040
  --el-color-primary-light-7: #582e2e
  --el-color-primary-light-8: #412626
  --el-color-primary-light-9: #493333
  --el-color-primary-dark-2: #f78989
  --el-color-warning-light-9: #433827
  --el-color-danger-light-9: #493333
  --el-color-success-light-9: #303927
  --el-color-info-light-9: #383838
  --el-fill-color-light: #1f1f1f
  --el-fill-color-extra-light: #1f1f1f
  --el-fill-color-dark: #666666
  --el-border-color: #6e6e6e
</style>