<template>
  <el-config-provider :locale="localeFile">
    <!-- 网页版账户登录(启用账户系统且未登录时显示) -->
    <LoginDialog />
    <div id="progressbar" :class="{ indeterminate: scanning && progress <= 0 }" :style="{ width: progress + '%' }"></div>
    <el-button class="fullscreen-button" circle :icon="FullScreen" size="large" @click="switchFullscreen"></el-button>
    <el-row :gutter="20" class="book-search-bar">
      <el-col :span="24">
        <div class="toolbar-flex" :style="toolbarWidth ? { width: toolbarWidth + 'px' } : {}">
          <!-- 搜索输入框与搜索按钮(固定在左侧) -->
          <el-autocomplete
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
          <el-button type="primary" :icon="Search32Filled" plain @click="searchBook" :title="$t('m.search')"></el-button>
          <!-- 可自定义的界面按钮(顺序/显示项在 设置 → 高级 → 工具栏按钮 中调整;设置按钮始终保留) -->
          <el-button
            v-for="btn in visibleToolbarButtons"
            :key="btn.id"
            type="primary"
            :icon="btn.icon"
            plain
            :title="$t(btn.titleKey)"
            :loading="btn.loading"
            @click="btn.action()"
          ></el-button>
          <!-- 排序/筛选:方向由箭头单独切换 -->
          <div class="sort-select-wrap">
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
          <!-- 合集/标签编辑按钮(仅编辑视图显示;管理入口已并入可自定义工具栏按钮) -->
          <div class="edit-btn-group">
            <el-button type="primary" plain v-if="editCollectionView" @click="$refs.EditViewRef.addCollection()" :icon="Collections24Regular" :title="$t('m.addCollection')"></el-button>
            <el-button type="primary" plain v-if="editCollectionView" @click="$refs.EditViewRef.editCollection()" :icon="Edit" :title="$t('m.editCollection')"></el-button>
            <el-button type="primary" plain v-if="editCollectionView" @click="$refs.EditViewRef.saveCollection()" :icon="Save16Regular" :title="$t('m.save')"></el-button>
            <el-button type="primary" plain v-if="editCollectionView" @click="$refs.EditViewRef.exitCollectionView()" :icon="MdExit" :title="$t('m.exit')"></el-button>
            <el-button type="primary" plain v-if="editTagView" @click="$refs.EditViewRef.exitEditTagView()" :icon="MdExit" :title="$t('m.exit')"></el-button>
          </div>
          <!-- 设置按钮:始终保留(网页版只读账户进入后仅显示「账户」页,可退出登录) -->
          <el-button :icon="SettingIcon" plain @click="$refs.SettingRef.dialogVisibleSetting = true" :title="$t('m.setting')"></el-button>
          <!-- 上下文按钮(仅桌面客户端):本地模式=打开库文件夹;服务器模式=服务器配置 -->
          <el-button v-if="!isWebMode" :icon="contextButton.icon" plain @click="contextButton.action()" :title="$t(contextButton.titleKey)"></el-button>
        </div>
      </el-col>
    </el-row>
    <RandomTags
      ref="randomTagsRef"
      v-if="!editTagView && !editCollectionView && !setting.disableRandomTag"
      @search="handleSearchString"
    />
    <el-row :gutter="20" class="book-card-area">
      <el-col :span="24" v-if="!editTagView && !editCollectionView" class="book-card-list" :style="{height: setting.disableRandomTag ? 'calc(100vh - 96px)' : 'calc(100vh - 134px)'}">
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
              @open-local-book="$refs.BookDetailDialogRef.openLocalBook(book)"
              @view-manga="$refs.InternalViewerRef.viewManga(book)"
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
            @open-local-book="$refs.BookDetailDialogRef.openLocalBook(book)"
            @view-manga="$refs.InternalViewerRef.viewManga(book)"
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
import { Setting as SettingIcon, FullScreen, Edit } from '@element-plus/icons-vue'
import { ArrowTrendingLines20Filled, Collections24Regular, Search32Filled, Save16Regular } from '@vicons/fluent'
import { MdShuffle, MdRefresh, MdCodeDownload, MdExit, MdBook, MdColorPalette, MdFolderOpen, MdCloudDone } from '@vicons/ionicons4'
import { TreeViewAlt, CicsSystemGroup, TagGroup } from '@vicons/carbon'

import { getWidth, fetchRecentReads, isContextMenuItemEnabled, applyCustomTheme, applyFavicon, applyCoverStyle, applyAppName, defaultToolbarButtons, parsePageSizes } from './utils.js'
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
      // 排序方向(仅排序类有效,筛选/随机无方向)
      sortDirection_: 'desc',
      // collection
      drawerVisibleCollection: false,
      openCollectionTitle: undefined,
      // move file
      moveFileDialogVisible: false,
      moveFileTargetBook: null,
      moveFileTargetFolder: null,
    }
  },
  computed: {
    ...mapWritableState(useAppStore, [
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
    // 可自定义的工具栏按钮(顺序 = 显示顺序;搜索按钮与设置按钮固定,不在此列)
    visibleToolbarButtons () {
      const map = {
        folderTree: { icon: TreeViewAlt, titleKey: 'm.folderTree', loading: false, action: () => this.$refs.FolderTreeRef.openFolderTree() },
        shuffle: { icon: MdShuffle, titleKey: 'm.shuffle', loading: false, action: () => this.shuffleBook() },
        manualScan: { icon: MdRefresh, titleKey: 'm.manualScan', loading: this.buttonLoadBookListLoading || this.scanning, action: () => this.loadBookList(true) },
        batchMetadata: { icon: MdCodeDownload, titleKey: 'm.batchGetMetadata', loading: this.buttonGetMetadatasLoading, action: () => this.getBookListMetadata() },
        tagAnalysis: { icon: ArrowTrendingLines20Filled, titleKey: 'm.tagAnalysis', loading: false, action: () => this.$refs.TagGraphRef.displayTagGraph() },
        manageCollection: { icon: CicsSystemGroup, titleKey: 'm.manageCollection', loading: false, action: () => this.$refs.EditViewRef.enterEditCollectionView() },
        manageTag: { icon: TagGroup, titleKey: 'm.manageTag', loading: false, action: () => this.$refs.EditViewRef.enterEditTagView() },
        viewerSwitch: { icon: MdBook, titleKey: 'm.viewerSwitch', loading: false, action: () => this.switchViewerType() },
        themeSwitch: { icon: MdColorPalette, titleKey: 'm.themeSwitch', loading: false, action: () => this.switchTheme() },
      }
      const order = this.setting?.toolbarButtons && this.setting.toolbarButtons.length
        ? this.setting.toolbarButtons
        : defaultToolbarButtons()
      // 只读账户:隐藏写操作类按钮(扫描/批量元数据/合集编辑/标签编辑),服务端同样会拦截
      const viewerBlock = new Set(['manualScan', 'batchMetadata', 'manageCollection', 'manageTag'])
      return order.filter(id => map[id] && !(this.viewerRole && viewerBlock.has(id))).map(id => map[id])
    },
    // 网页版标志(Vue 模板不能直接访问 window,需经 computed)
    isWebMode () {
      return !!window.__WEB_MODE__
    },
    // 网页版(Docker)账户:普通账户只读
    viewerRole () {
      const auth = window.__AUTH__ || {}
      return !!auth.enabled && auth.role === 'viewer'
    },
    // 移动端界面:按窗口宽度自动切换(<768px 视为移动布局)
    isMobile () {
      return window.innerWidth < 768
    },
    // 工具栏上下文按钮:本地模式=打开库文件夹;网页模式/网页版=服务器配置
    contextButton () {
      const isWebMode = !!window.__WEB_MODE__
      const isLocalMode = !isWebMode && !this.setting?.remoteServer
      return isLocalMode
        ? { icon: MdFolderOpen, titleKey: 'm.openLibraryFolder', action: () => this.openLibraryFolder() }
        : { icon: MdCloudDone, titleKey: 'm.serverConfig', action: () => this.openServerConfig() }
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
    'setting.cardGap' () { this.recomputeToolbarWidth() },
  },
  mounted () {
    // 移动端适配:窗口宽度变化时自动切换布局
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
      // 应用名称 / 自定义主题 / 自定义图标 / 封面尺寸
      applyAppName(this.setting)
      applyCoverStyle(this.setting)
      if (this.setting.theme === 'custom') {
        document.documentElement.classList.add('theme-custom')
        applyCustomTheme(this.setting)
      }
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
    }
    const cardAreaEl = document.querySelector('.book-card-area')
    if (cardAreaEl) cardAreaEl.addEventListener('scroll', this.cardAreaScrollListener, { passive: true })
    window.addEventListener('keydown', this.resolveKey)
    // passive:滚轮事件不阻塞浏览器默认滚动,消除滚轮卡顿感
    window.addEventListener('wheel', this.resolveWheel, { passive: true })
    window.addEventListener('mousedown', this.resolveMouseDown)
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
    window.removeEventListener('mousedown', this.resolveMouseDown)  },
  watch: {
    bookList () {
      this.handleSortChange(this.sortValue, this.bookList)
    },
  },
  methods: {
    ...mapActions(useAppStore, [
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
      let next, prev
      if (this.setting.reverseLeftRight) {
        ;({ next, prev } = this.keyMap.reverse)
      } else {
        ;({ next, prev } = this.keyMap.normal)
      }
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
          if (this.$refs.InternalViewerRef.imageStyleType === 'single' || this.$refs.InternalViewerRef.imageStyleType === 'double') {
            if (event.key === next || event.key === 'ArrowDown' || event.key === ' ') {
              this.$refs.InternalViewerRef.currentImageIndex += 1
            } else if (event.key === prev || event.key === 'ArrowUp') {
              this.$refs.InternalViewerRef.currentImageIndex -= 1
            } else if (event.key === 'Home') {
              this.$refs.InternalViewerRef.currentImageIndex = 0
            } else if (event.key === 'End') {
              if (this.$refs.InternalViewerRef.imageStyleType === 'single') {
                this.$refs.InternalViewerRef.currentImageIndex = this.$refs.InternalViewerRef.viewerImageList.length - 1
              } else if (this.$refs.InternalViewerRef.imageStyleType === 'double') {
                this.$refs.InternalViewerRef.currentImageIndex = this.$refs.InternalViewerRef.viewerImageListDouble.length - 1
              }
            }
            if (this.$refs.InternalViewerRef.imageStyleType === 'double') {
              if (event.key === "/") {
                this.$refs.InternalViewerRef.insertEmptyPageIndex = this.$refs.InternalViewerRef.currentImageIndex
                this.$refs.InternalViewerRef.insertEmptyPage = !this.$refs.InternalViewerRef.insertEmptyPage
              }
            }
          } else if (this.$refs.InternalViewerRef.imageStyleType === 'scroll') {
            if (event.key === prev || event.key === 'ArrowUp') {
              if (event.ctrlKey) {
                document.querySelector('.viewer-drawer .el-drawer__body').scrollBy(0, - window.innerHeight / 10)
              } else {
                document.querySelector('.viewer-drawer .el-drawer__body').scrollBy(0, - window.innerHeight / 1.2)
              }
            } else if (event.key === next || event.key === 'ArrowDown' || event.key === ' ') {
              if (event.ctrlKey) {
                document.querySelector('.viewer-drawer .el-drawer__body').scrollBy(0, window.innerHeight / 10)
              } else {
                document.querySelector('.viewer-drawer .el-drawer__body').scrollBy(0, window.innerHeight / 1.2)
              }
            } else if (event.key === 'Home') {
              document.querySelector('.viewer-drawer .el-drawer__body').scrollTop = 0
            } else if (event.key === 'End') {
              document.querySelector('.viewer-drawer .el-drawer__body').scrollTop = document.querySelector('.viewer-drawer .el-drawer__body').scrollHeight
            }
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
        const gap = parseFloat(rootStyle.getPropertyValue('--emm-card-gap')) || 6
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
      document.documentElement.setAttribute('class', next)
      if (next === 'custom') {
        document.documentElement.classList.add('theme-custom')
        applyCustomTheme(this.setting)
      } else {
        document.documentElement.classList.remove('theme-custom')
      }
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
    // home main
    handleClickCover (book) {
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
      ].filter(item => isContextMenuItemEnabled(this.setting, 'cover', item.id) && !(this.viewerRole && viewerWriteIds.has(item.id)))
      // 全部项都被取消勾选时不弹出空白菜单
      if (items.length === 0) return
      this.$contextmenu({ x: e.x, y: e.y, items })
    },

    // ---------- 移动端适配(自动) ----------
    applyUiMode () {
      document.body.classList.toggle('emm-mobile', this.isMobile)
    },
    onResize () {
      this.applyUiMode()
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
      this.$refs.InternalViewerRef.showThumbnail = false
      this.$refs.InternalViewerRef.viewManga(book)
    },
    openThumbnailView (book) {
      this.$refs.InternalViewerRef.showThumbnail = true
      this.$refs.InternalViewerRef.viewManga(book)
    },
    handleRemoveBookDisplay () {
      this.chunkDisplayBookList = this.customChunk(this.displayBookList, this.setting.pageSize, this.currentPage - 1)
    },

    // internal viewer
    toNextManga (step) {
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
  // 卡片自适应列数:手机 2 列,平板 3-4 列
  --emm-cover-size: calc((100vw - 56px) / 2)
  @media (min-width: 600px)
    --emm-cover-size: calc((100vw - 90px) / 3)
  @media (min-width: 900px)
    --emm-cover-size: calc((100vw - 120px) / 4)
  @media (min-width: 1200px)
    --emm-cover-size: calc((100vw - 160px) / 5)
  --emm-card-gap: 6px
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

// 自定义主题
html.theme-custom
  background-color: var(--emm-custom-bg, #ffffff)
  background-image: var(--emm-custom-bg-image, none)
  background-size: cover
  background-position: center
  background-attachment: fixed
  --el-text-color-primary: var(--emm-custom-font-color, #303133)
  --el-text-color-regular: var(--emm-custom-font-color, #606266)
  #app
    font-size: var(--emm-custom-font-size, 14px)
    color: var(--emm-custom-font-color, inherit)
    font-family: var(--emm-custom-font-family, inherit)
  // 弹层/卡片背景跟随背景色(半透明)增强沉浸感
  .el-dialog, .el-drawer, .el-message-box
    background-color: var(--emm-custom-panel-bg, var(--el-bg-color-overlay))
  .book-card
    background-color: var(--emm-custom-card-bg, var(--el-bg-color-overlay))
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

.book-card-frame
  min-width: calc(var(--emm-cover-size, 220px) + 14px)
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
  background-color: #0d0d0d
  --el-bg-color: #0d0d0d
  --el-bg-color-overlay: #0d0d0d
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