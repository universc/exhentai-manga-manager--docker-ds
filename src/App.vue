<template>
  <el-config-provider :locale="localeFile">
    <!-- 网页版账户登录(启用账户系统且未登录时显示) -->
    <LoginDialog />
    <el-button v-if="setting.showFullscreenButton !== false" class="fullscreen-button" circle :icon="FullScreen" size="large" @click="switchFullscreen"></el-button>
    <!-- 主界面与「下载记录」并排:左主右栏,中间那条可以拖宽度 -->
    <div class="app-body">
    <div class="app-main">
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
              :trigger-on-focus="true"
              @select="onSearchSuggestSelect"
              class="search-input"
            >
              <template #default="{ item }">
                <span class="autocomplete-label" :class="{ 'is-history': item.isHistory, 'is-clear': item.isClearHistory }">{{ item.label }}</span>
                <span class="autocomplete-value" v-if="!item.isHistory && !item.isClearHistory">{{ item.value }}</span>
                <span
                  v-if="item.isHistory"
                  class="autocomplete-del"
                  :title="$t('m.searchHistoryRemove')"
                  @click.stop="removeSearchHistory(item.value)"
                >✕</span>
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
                  <!-- EH在线:没有「合集」「隐藏」这两个本地概念,去掉;「仅收藏」= 我账号的收藏 -->
                  <el-option v-if="!onlineActive" :label="$t('m.collectionOnly')" value="collection"></el-option>
                  <el-option v-if="!onlineActive" :label="$t('m.hiddenOnly')" value="hidden"></el-option>
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
            <!-- 筛选(漏斗):点开就是 JHenTai 那个筛选对话框 —— 分类 / 关键词 / 语言 / 页数 / 最低评分
                 (可在 高级 → 工具栏按钮 里隐藏;有筛选在生效时按钮高亮) -->
            <el-button
              v-else-if="id === 'filter'"
              type="primary"
              plain
              :icon="MdFunnel"
              :title="$t('m.filterButton')"
              :class="{ 'is-filtering': ehFilterActive }"
              @click="ehFilterVisible = true"
            ></el-button>
            <!-- 下载记录:右侧滑出下载列表(可在 高级 → 工具栏按钮 里隐藏) -->
            <el-button
              v-else-if="id === 'downloads'"
              type="primary"
              plain
              :icon="MdCloudDownload"
              :title="$t('m.downloads')"
              :class="{ 'is-filtering': downloadActiveCount > 0 }"
              @click="openDownloadDrawer"
            ></el-button>
            <!-- UI 模式切换:自动 → 手机 → 平板 → 电脑(桌面客户端与网页版都有) -->
            <el-button v-else-if="id === 'uiMode'" :icon="uiModeIcon" plain @click="switchUiMode" :title="$t('m.switchUiMode') + ': ' + $t(uiModeLabelKey)"></el-button>
            <!-- 设置按钮:与界面模式按钮一套样式(纯 plain,图标不跟主色调) -->
            <el-button v-else-if="id === 'setting'" :icon="SettingIcon" plain @click="$refs.SettingRef.dialogVisibleSetting = true" :title="$t('m.setting')"></el-button>
            <!-- 切换库:点一下 = 切到下一个「库切换」框(书架显示该框内所有库合并的漫画) -->
            <!-- 切换库:点一下 = 切到下一条「库切换」框(循环) -->
            <el-button v-else-if="id === 'switchLibrary'" type="primary" plain :icon="switchLibraryIcon" @click="switchBox()" :title="$t('m.switchLibraryCurrent') + ':' + (boxLabel || '—')"></el-button>
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
          <!-- 历史视图:清空历史(JHenTai 历史页标题栏那个删除按钮) -->
          <el-button
            v-if="sortValue === 'recentRead' && !editCollectionView && !editTagView"
            type="danger"
            plain
            :icon="MdTrash"
            :title="$t('m.historyClear')"
            @click="clearHistory"
          ></el-button>
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
          :style="{ '--emm-in-delay': Math.min(index, 40) * 14 + 'ms' }"
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
              @title-click="onTitleClick(book)"
              @on-book-context-menu="onBookContextMenu"
              @handle-search-string="handleSearchString"
              @search-from-tag="searchFromTag"
              @tag-long-press="openQuickTagEdit"
              @cover-click="onCoverClick(book)"
              @cover-dblclick="onCoverDblClick(book)"
              @yue-click="onYueClick(book)"
              @du-click="onDuClick(book)"
              @page-count-click="onPageCountClick(book)"
              @online-favorite="onOnlineFavorite"
              @open-torrents="openTorrentDialog"
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
        <!-- 触底加载的底部状态(照 JHenTai 的 load-more footer):加载中转圈,到底了写「没有更多了」 -->
        <div class="load-more-footer" v-if="visibleChunkDisplayBookList.length && (listLoadingMore || (onlineActive && !onlineHasMore))">
          <el-icon v-if="listLoadingMore" class="is-loading" :size="20"><Loading /></el-icon>
          <span v-else class="load-more-end">{{ $t('m.noMoreData') }}</span>
        </div>
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
    </div>
    <!-- 下载记录:和主界面**同层**(不是浮层);拖动左边缘可以调整这一栏的宽度 -->
    <div class="download-panel" v-show="downloadPanelVisible" :style="{ width: downloadPanelWidth + 'px' }">
      <div class="download-panel-resizer" :title="$t('m.downloadPanelResizeHint')" @mousedown="startDownloadPanelResize"></div>
      <div class="download-panel-header">
        <template v-if="!previewTask">
          <span class="download-panel-title">{{ $t('m.downloads') }}</span>
          <span class="download-panel-actions">
            <el-button size="small" :disabled="!resumableDownloadCount" @click="resumeAllDownloads">{{ $t('m.downloadResumeAll') }}</el-button>
            <el-button size="small" @click="openDownloadFolder">{{ $t('m.downloadOpenFolder') }}</el-button>
            <el-button size="small" type="danger" plain @click="clearDownloadRecords">{{ $t('m.downloadClear') }}</el-button>
            <el-button size="small" text @click="downloadPanelVisible = false">✕</el-button>
          </span>
        </template>
        <template v-else>
          <el-button size="small" text @click="closeDownloadPreview">← {{ $t('m.back') }}</el-button>
          <span class="download-panel-title" :title="previewTask.title">{{ previewTask.title }}</span>
          <span class="download-panel-progress">{{ previewDoneCount }}/{{ previewTotalCount }}</span>
        </template>
      </div>
      <!-- 任务列表 -->
      <div class="download-list" v-if="!previewTask">
        <div v-if="downloadPathMissing" class="download-hint">{{ $t('m.downloadNeedPath') }}</div>
        <div v-if="!downloadRecords.length" class="download-empty">{{ $t('m.downloadEmpty') }}</div>
        <div v-for="task in downloadRecords" :key="task.id" class="download-item">
          <div class="download-cover-wrap" :title="$t('m.downloadPreviewHint')" @click="openDownloadPreview(task)">
            <img v-if="task.cover" class="download-cover" :src="task.cover" />
            <div v-else class="download-cover download-cover-empty"></div>
            <span class="download-cover-zoom">🔍</span>
          </div>
          <div class="download-body">
            <div class="download-title" :title="task.title">{{ task.title }}</div>
            <div class="download-meta">
              <span v-if="task.phase === 'links'">{{ $t('m.downloadCollecting', { n: task.linkCount || 0 }) }}</span>
              <span v-else>{{ task.done }}/{{ task.total }}</span>
              <span v-if="task.original" class="download-pill">{{ $t('m.downloadOriginalTag') }}</span>
              <span class="download-status" :class="'is-' + task.status">{{ downloadStatusText(task.status) }}</span>
              <span v-if="task.failed" class="download-failed">✗{{ task.failed }}</span>
            </div>
            <el-progress
              :percentage="downloadPercent(task)"
              :stroke-width="6"
              :status="task.status === 'failed' ? 'exception' : (task.status === 'done' ? 'success' : '')"
            />
            <div v-if="task.status === 'failed' && task.error" class="download-error">{{ downloadErrorText(task.error) }}</div>
            <div v-if="task.fallback > 0" class="download-hint-inline">{{ $t('m.downloadFallback', { n: task.fallback }) }}</div>
          </div>
          <div class="download-actions">
            <el-button v-if="task.status === 'downloading'" size="small" link @click="downloadAction(task, 'pause')">{{ $t('m.pauseTask') }}</el-button>
            <el-button v-else-if="['paused', 'failed', 'waiting'].includes(task.status)" size="small" link type="primary" @click="downloadAction(task, 'resume')">{{ $t('m.resumeTask') }}</el-button>
            <el-button size="small" link @click="downloadAction(task, 'delete')">{{ $t('m.downloadDeleteRecordOnly') }}</el-button>
            <el-button size="small" link type="danger" @click="deleteDownloadWithFiles(task)">{{ $t('m.downloadDeleteRecordAndFiles') }}</el-button>
          </div>
        </div>
      </div>
      <!-- 预览:点封面进来。下好的出图,没下好的用空白 + 进度圈占位(下载中会自动刷新) -->
      <div class="download-preview" v-else>
        <div v-for="(f, i) in downloadPreviewFiles" :key="i" class="download-preview-item">
          <img v-if="f" :src="assetUrl(f.path)" loading="lazy" :title="String(i + 1)" />
          <div v-else class="download-preview-blank">
            <el-icon class="is-loading" :size="18"><Loading /></el-icon>
            <span>{{ i + 1 }}</span>
          </div>
        </div>
        <div v-if="previewTask && !previewTask.dir" class="download-empty">{{ $t('m.downloadPreviewNoDir') }}</div>
        <div v-else-if="!downloadPreviewFiles.length" class="download-empty">{{ $t('m.downloadPreviewEmpty') }}</div>
      </div>
    </div>
    </div>
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
            @online-favorite="onOnlineFavorite"
            @open-torrents="openTorrentDialog"
            @open-local-book="$refs.BookDetailDialogRef.openLocalBook(book)"
          />
        </div>
      </div>
    </el-drawer>
    <!-- 下载记录(右侧滑出):进度 / 暂停 / 继续 / 删除 / 打开下载文件夹 -->

    <!-- 种子列表(照 JHenTai 的 EHGalleryTorrentsDialog:名称 + 做种/下载/大小 + 复制磁力) -->
    <el-dialog v-model="torrentDialogVisible" :title="$t('m.torrentsTitle')" width="620px">
      <div v-if="torrentLoading" class="torrent-loading"><el-icon class="is-loading" :size="22"><Loading /></el-icon></div>
      <div v-else-if="!torrentList.length" class="torrent-empty">{{ $t('m.torrentNone') }}</div>
      <div v-else class="torrent-list">
        <div v-for="(tr, i) in torrentList" :key="i" class="torrent-item" :class="{ 'is-outdated': tr.outdated }">
          <div class="torrent-name" :title="tr.name">{{ tr.name }}</div>
          <div class="torrent-meta">
            <span>{{ $t('m.torrentSize') }}: {{ tr.size || '—' }}</span>
            <span>{{ $t('m.torrentSeeds') }}: {{ tr.seeds }}</span>
            <span>{{ $t('m.torrentPeers') }}: {{ tr.peers }}</span>
            <span v-if="tr.uploader">{{ $t('m.torrentUploader') }}: {{ tr.uploader }}</span>
            <span v-if="tr.postTime">{{ tr.postTime }}</span>
            <span v-if="tr.outdated" class="torrent-outdated">{{ $t('m.torrentOutdated') }}</span>
          </div>
          <div class="torrent-actions">
            <el-button size="small" type="primary" plain @click="openTorrent(tr)">{{ $t('m.torrentOpen') }}</el-button>
            <el-button size="small" @click="copyTorrentMagnet(tr)">{{ $t('m.torrentCopyMagnet') }}</el-button>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 收藏夹选择(EH 账号的 10 个收藏夹) -->
    <el-dialog v-model="favoritePickerVisible" :title="$t('m.favoriteCategory')" width="380px">
      <div v-if="favoriteCategoryLoading" class="torrent-loading"><el-icon class="is-loading" :size="22"><Loading /></el-icon></div>
      <div v-else class="favorite-list">
        <div v-for="cat in favoriteCategoryList" :key="cat.index" class="favorite-item" @click="pickFavorite(cat.index)">
          <span class="favorite-name">{{ cat.index + 1 }}. {{ cat.name }}</span>
          <span v-if="cat.count >= 0" class="favorite-count">{{ cat.count }}</span>
        </div>
        <div v-if="favoritePickerBook && favoritePickerBook.favcat != null" class="favorite-remove" @click="removeFavoriteFromPicker">
          {{ $t('m.favoriteRemoveOption') }}
        </div>
      </div>
    </el-dialog>

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
      @download-gallery="({ book, original }) => startGalleryDownload(book, original)"
      @open-torrents="openTorrentDialog"
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
      @download-page="downloadCurrentPage"
      @open-book-detail="openBookDetailAfterRead"
    />
    <FolderTree ref="FolderTreeRef" @chunk-list="chunkList"/>
    <TagGraph ref="TagGraphRef" @search="handleSearchString"/>
    <SearchDialog ref="SearchDialogRef"/>
    <EhFilterDialog v-model:visible="ehFilterVisible" :filter="ehFilterForDialog" @apply="applyEhFilterAndRefresh"/>
    <Setting ref="SettingRef" @load-book-list="loadBookList" @load-collection-list="loadCollectionList"/>
  </el-config-provider>
</template>

<script>
import { defineComponent } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Setting as SettingIcon, FullScreen, Edit, Loading } from '@element-plus/icons-vue'
import { ArrowTrendingLines20Filled, Collections24Regular, Search32Filled, Save16Regular } from '@vicons/fluent'
import { MdShuffle, MdRefresh, MdSync, MdCodeDownload, MdExit, MdBook, MdColorPalette, MdFolderOpen, MdCloudDone, MdPhonePortrait, MdTabletPortrait, MdDesktop, MdFunnel, MdTrash, MdCloudDownload } from '@vicons/ionicons4'
import { TreeViewAlt, CicsSystemGroup, TagGroup, Catalog } from '@vicons/carbon'

import { getWidth, fetchRecentReadRecords, removeReadRecord, clearReadRecords, isContextMenuItemEnabled, sortContextMenuItems, mergeContextMenuOptions, applyCustomTheme, applyFavicon, applyCoverStyle, applyAppName, defaultToolbarButtons, ensureToolbarButtons, insertMissingToolbarItems, TOOLBAR_NEW_ITEMS, TOOLBAR_ALWAYS_ITEMS, clearCustomTheme, applyPixelTheme, toAssetUrl, parsePageSizes } from './utils.js'
import { extractCoverColors, pixelateToDataUrl } from './cover-color.js'
// 内置的默认像素底图(构建后会变成带 hash 的资源 URL)
import pixelDefaultBg from './assets/pixel-default-bg.png'
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
import EhFilterDialog from './components/EhFilterDialog.vue'
import { EH_ONLINE_ID, hasEhCookies, ehHost, ehListUrl, parseGalleryList, galleryToBook, EX_HOST, EH_HOST } from './ehOnline.js'
import { loadEhFilter, saveEhFilter, ehFilterActive as ehFilterIsActive, ehFilterMatch, ehFilterParams, normalizeEhFilter } from './ehFilter.js'

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
    EhFilterDialog,
  },
  setup () {
    return {
      SettingIcon, FullScreen, Edit, Loading,
      Collections24Regular, Search32Filled, ArrowTrendingLines20Filled, Save16Regular,
      MdRefresh, MdCodeDownload, MdExit, MdShuffle, MdFolderOpen, MdCloudDone,
      MdPhonePortrait, MdTabletPortrait, MdDesktop, MdFunnel, MdTrash, MdCloudDownload,
      TreeViewAlt, CicsSystemGroup, TagGroup
    }
  },
  data () {
    return {
      // home
      searchString: '',
      // 「EH在线」没被勾进任何「库切换」框时的临时站位标志:
      // 勾进框之后切换库完全按框走,这个标志不再参与(见 computed onlineActive)
      onlineStopActive: false,
      // EH在线:书架数据来自 EH(不是本地库)。这些只是「取数据」用的游标,界面全部走原版
      onlineItems: [],
      onlineCursors: [null],
      onlinePagesFetched: 0,
      onlineHasMore: true,
      onlineQuery: '',
      onlineLoading: false,
      // 搜索框下方的「搜索历史」(只存本机)
      searchHistory: (() => {
        try { return JSON.parse(localStorage.getItem('emmSearchHistory') || '[]') } catch (e) { return [] }
      })(),
      // 卡片种子的数量查询:只查当前渲染出来的卡,并发 2、间隔 500ms,结果缓存在本机
      torrentQueue: [],
      torrentPending: new Set(),
      torrentRunning: 0,
      // 下载记录右栏(与主界面同层,可拖宽)/ 种子对话框 / 收藏夹选择
      downloadPanelVisible: false,
      downloadPanelWidth: Math.min(900, Math.max(240, Number(localStorage.getItem('emmDownloadPanelWidth')) || 380)),
      downloadRecords: [],
      // 预览:点某个任务的封面 → 在右栏里翻看已经下好的页
      previewTask: null,
      downloadPreviewFiles: [],
      previewRefreshTimer: null,
      torrentDialogVisible: false,
      torrentLoading: false,
      torrentList: [],
      favoritePickerVisible: false,
      favoritePickerBook: null,
      favoriteCategoryLoading: false,
      favoriteCategoryList: [],
      // EH在线:「仅收藏」= 我账号的收藏(换数据源去 /favorites.php 拉),不是本地 mark
      onlineFavOnly: false,
      // 「筛选」(JHenTai 那个筛选对话框):分类 / 关键词 / 语言 / 页数 / 最低评分 / 两个 EH 开关
      ehFilterVisible: false,
      ehFilter: loadEhFilter(),
      currentPage_: 1,
      progress: 0,
      // 后台扫描是否进行中(用于扫描按钮 loading 与进度条动画)
      scanning: false,
      randomTags: [],
      // EH在线 追加下一页时置位:让这一次重排保住滚动位置与已渲染数量(见 bookList watcher / chunkList)
      keepScrollOnNextChunk: false,
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
      // 背景图像素化的去重签名
      lastPixelBgSrc: null,
      pixelFallbackTimer: null,
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
    // 有几个任务可以「继续」(暂停/失败/等待中)
    resumableDownloadCount () {
      return (this.downloadRecords || []).filter(t => ['paused', 'failed', 'waiting'].includes(t.status)).length
    },
    previewDoneCount () {
      return (this.downloadPreviewFiles || []).filter(Boolean).length
    },
    previewTotalCount () {
      return (this.downloadPreviewFiles || []).length
    },
    // 还有几个任务在下(JHenTai 的下载页同理):工具栏按钮据此高亮
    downloadActiveCount () {
      return (this.downloadRecords || []).filter(t => t.status === 'downloading').length
    },
    // 没设下载目录时,右栏给一句提示
    downloadPathMissing () {
      return !String(this.setting.downloadPath || '').trim()
    },
    // 底部加载状态:在线模式下正在取下一页(触底加载的转圈)
    listLoadingMore () {
      return this.onlineActive ? this.onlineLoading : false
    },
    // 还有没有内容可加载(本地=还有下一页或还有没渲染出来的排)
    hasMoreToLoad () {
      if (this.renderedCount < this.chunkDisplayBookList.length) return true
      if (this.onlineActive) return this.onlineHasMore
      const pageSize = Number(this.setting.pageSize) || 1
      return this.currentPage < Math.max(1, Math.ceil(this.displayBookCount / pageSize))
    },
    // 「筛选」(JHenTai 那个筛选对话框)里有条件在生效 → 漏斗按钮高亮
    ehFilterActive () {
      return ehFilterIsActive(this.ehFilter)
    },
    // 对话框里的「关键词」直接镜像搜索栏(关键词真正的家在搜索栏,不另存一份),
    // 否则会看到「框里写着一个词、实际搜的是另一个」这种前后不一致。
    ehFilterForDialog () {
      return { ...this.ehFilter, keyword: this.searchString || '' }
    },
    // 可自定义的工具栏元素:图标 / 悬浮说明 / 动作(显示顺序由 toolbarOrderIds 决定)
    toolbarButtonMap () {
      return {
        folderTree: { icon: TreeViewAlt, titleKey: 'm.folderTree', loading: false, action: () => this.$refs.FolderTreeRef.openFolderTree() },
        shuffle: { icon: MdShuffle, titleKey: 'm.shuffle', loading: false, action: () => this.shuffleBook() },
        // EH在线 模式下没有本地书可扫:这两个按钮改成「重新加载」(按用户要求)
        manualScan: {
          icon: MdRefresh,
          titleKey: this.onlineActive ? 'm.ehOnlineRefresh' : 'm.manualScan',
          loading: this.onlineActive ? false : (this.buttonLoadBookListLoading || this.scanning),
          action: () => this.onlineActive ? this.reloadOnline() : this.loadBookList(true)
        },
        incrementalScan: {
          icon: MdSync,
          titleKey: this.onlineActive ? 'm.ehOnlineRefresh' : 'm.incrementalScan',
          loading: this.onlineActive ? false : this.scanning,
          action: () => this.onlineActive ? this.reloadOnline() : this.incrementalScan()
        },
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
      const composed = hasNew
        ? base
        : [...head, ...base.filter(id => !head.includes(id) && !tail.includes(id)), ...tail]
      // 新增元素插到定义顺序里前一个元素之后(与设置页共用 utils.js 的同一个函数)
      const fullOrder = insertMissingToolbarItems(composed)
      // 只读账户:隐藏写操作类按钮(扫描/批量元数据/合集编辑/标签编辑),服务端同样会拦截
      const viewerBlock = new Set(['manualScan', 'incrementalScan', 'batchMetadata', 'manageCollection', 'manageTag'])
      // ⚠️ 搜索框/搜索按钮/排序框不是 toolbarButtonMap 里的普通按钮(模板里各有一段 v-if 分支),
      //    不能被 map[id] 判空挡掉,必须单独放行
      // ⚠️ 模板分支类按钮(不在 toolbarButtonMap 里)必须在这里放行,否则会被 map[id] 判空挡掉 ——
      //    「筛选」按钮当初就是这么没渲染出来的,「下载记录」同理
      const plainItems = new Set(['searchInput', 'searchButton', 'sortSelect', 'uiMode', 'switchLibrary', 'filter', 'downloads'])
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
    // 多库:所有漫画库 / 当前框里的库名(工具栏「切换库」悬浮提示用)
    libraries () {
      const list = Array.isArray(this.setting?.libraries) ? this.setting.libraries : []
      // 「EH在线」是前端虚拟库:没有本地文件夹、不写进 setting.libraries
      // (塞进去会牵动后端的扫描 / 每库一个 sqlite / 缓存搬迁),只在库列表与工具栏循环里多出这一项
      return this.ehOnlineAvailable ? [...list, this.ehOnlineLibrary] : list
    },
    ehOnlineLibrary () {
      return { id: EH_ONLINE_ID, name: this.$t('m.ehOnline'), online: true, path: '', dataPath: '' }
    },
    // 出现条件:已填登录 Cookie,且用户打开了「EH在线」(登录成功后会自动打开)
    ehOnlineAvailable () {
      return !!this.setting?.ehOnlineEnabled && hasEhCookies(this.setting)
    },
    // 「EH在线」有没有被勾进某个「库切换」框:勾了之后切换库就完全按框循环
    ehOnlineInAnyBox () {
      return this.switchBoxes.some(b => Array.isArray(b.libraryIds) && b.libraryIds.includes(EH_ONLINE_ID))
    },
    // 当前这个框里有没有「EH在线」
    activeBoxHasOnline () {
      const boxes = this.switchBoxes
      const box = boxes[Number.isInteger(this.setting?.activeBoxIndex) ? this.setting.activeBoxIndex : 0]
      return !!(box && Array.isArray(box.libraryIds) && box.libraryIds.includes(EH_ONLINE_ID))
    },
    // 现在是不是停在「EH在线」:勾进框时看当前框;没勾进任何框时看临时站位
    onlineActive () {
      if (!this.ehOnlineAvailable) return false
      if (this.ehOnlineInAnyBox) return this.activeBoxHasOnline
      return this.onlineStopActive
    },
    // ⚠️ Options API 的模板拿不到 <script> 里 import 的组件(要靠 this.xxx),
    // 所以图标必须经 computed 暴露,否则按钮是空白的(用户报的 bug)
    switchLibraryIcon () {
      // 用 carbon 的 Catalog(目录本)和「切换阅读器」的 MdBook 区分开
      return Catalog
    },
    switchBoxes () {
      return Array.isArray(this.setting?.switchBoxes) ? this.setting.switchBoxes : []
    },
    activeBoxIndex () {
      return Number.isInteger(this.setting?.activeBoxIndex) ? this.setting.activeBoxIndex : 0
    },
    boxLabel () {
      if (this.onlineActive) return this.$t('m.ehOnline')
      const boxes = Array.isArray(this.setting?.switchBoxes) ? this.setting.switchBoxes : []
      const box = boxes[Number.isInteger(this.setting?.activeBoxIndex) ? this.setting.activeBoxIndex : 0]
      const ids = box && Array.isArray(box.libraryIds) ? box.libraryIds : []
      return this.libraries.filter(l => ids.includes(l.id)).map(l => l.name).join(' + ')
    },
    activeLibraryName () {
      const lib = this.libraries.find(l => l.id === this.setting?.activeLibraryId)
      return lib ? lib.name : ''
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
        const base = this.combineSortValue(val)
        // EH在线:「仅收藏」= 我账号的收藏 → 换数据源重新拉一次(EH 的 /favorites.php)
        if (this.onlineActive) {
          const wantFav = base === 'mark'
          if (wantFav !== this.onlineFavOnly) {
            this.onlineFavOnly = wantFav
            this.sortValue = base
            this.loadOnlineList(true)
            return
          }
        }
        this.handleSortChange(base, this.displayBookList)
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
    bookList (newList, oldList) {
      // EH在线 追加下一页(列表只是变长)时:不要回顶,也不要把已渲染的卡片收回去 ——
      // 用户正看到一半,列表突然弹回顶部/缩成一行就是这个原因
      this.keepScrollOnNextChunk = this.onlineActive && Array.isArray(oldList) && newList.length > oldList.length
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
        this.applyPixelBackground()
        this.applyAutoTheme()
      })
    },
    'setting.themeCustomBgImage' () { this.lastPixelBgSrc = null; this.$nextTick(() => this.applyPixelBackground()) },
    'setting.pixelSfx' () { this.syncPixelSfx() },
    // 任务减少(完成/中断)时来一段完成音效
    bookTaskCount (val, old) {
      // 音效是像素风格的专属功能,普通模式保持安静
      if (!this.setting?.pixelTheme || this.setting?.pixelSfx === false) return
      if (typeof old === 'number' && val < old) playPixelSfx('done')
    },
    'setting.autoTheme' () {
      applyPixelTheme(this.setting)
      this.lastAutoThemeCover = null
      this.$nextTick(() => this.applyAutoTheme())
    },
    // 「EH在线」被关掉 / 登录 Cookie 被清空时:正停在这一站就自动回到本地书架,
    // 否则界面会停在一个已经不存在的库上
    ehOnlineAvailable (val) {
      if (!val && (this.onlineStopActive || this.activeBoxHasOnline)) {
        this.onlineStopActive = false
        this.loadBookList()
      }
    },
    'setting.pixelCoverLevel' () { this.refreshPixelArt() },
    'setting.pixelBlockSize' () { this.refreshPixelArt() },
    'setting.pixelColorCount' () { this.refreshPixelArt() },
    'setting.pixelAlgorithm' () { this.refreshPixelArt() },
    'setting.pixelShowGrid' () { this.$nextTick(() => this.applyPixelCovers()) },
    // 卡片列表变化(翻页/排序/搜索/扫描)后重算混合背景 + 重新像素化封面
    visibleRenderedBookList () {
      // 新滚进来的在线卡片顺带查一下「有没有种子」(右下角的藤蔓按钮据此显隐)
      this.queueTorrentChecks()
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
    // 下载进度 / 完成 / 删除:主进程推过来,右栏就地更新(JHenTai 的下载页也是实时刷)
    ipcRenderer.on('eh-download-progress', (event, task) => this.upsertDownloadRecord(task))
    ipcRenderer.on('eh-download-done', (event, task) => this.upsertDownloadRecord(task))
    ipcRenderer.on('eh-download-removed', (event, arg) => {
      this.downloadRecords = this.downloadRecords.filter(t => t.id !== (arg && arg.id))
    })
    this.refreshDownloadRecords()
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
      getParams: () => ({
        enabled: this.setting?.inertiaEnabled !== false,
        friction: this.setting?.inertiaFriction,
        maxVelocity: this.setting?.inertiaMaxVelocity,
        follow: this.setting?.inertiaFollow,
      })
    })
    // 逐排加载:滚动接近底部时再加载下一排(比 IntersectionObserver 更可靠)
    this.cardAreaScrollListener = () => {
      const area = document.querySelector('.book-card-area')
      if (!area) return
      if (area.scrollTop + area.clientHeight >= area.scrollHeight - 600) {
        this.renderedCount += this.renderBatchSize
        // EH在线:渲染到底了就再取一页 EH,能一直往下看(抄 JHenTai 的逐页加载)
        this.appendOnlinePageIfNeeded()
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
    // 主界面防复制:拦复制/剪切/开始选择/拖拽
    this.antiCopyHandler = (e) => this.onAntiCopy(e)
    for (const ev of ['copy', 'cut', 'selectstart', 'dragstart']) document.addEventListener(ev, this.antiCopyHandler, true)
    // 像素风点击音效(仅像素风格开启时挂载)+ 混合背景首次取色
    this.syncPixelSfx()
    this.$nextTick(() => {
      this.applyPixelCovers()
      this.applyAutoTheme()
    })
    // 首屏封面是懒加载的:过一会儿再补几次,避免「不滚动就一直不像素化」
    this.applyPixelBackground()
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
    if (this.antiCopyHandler) {
      for (const ev of ['copy', 'cut', 'selectstart', 'dragstart']) document.removeEventListener(ev, this.antiCopyHandler, true)
      this.antiCopyHandler = null
    }
    clearTimeout(this.mixBgTimer)
  },
  methods: {
    ...mapActions(useAppStore, [
      'loadAllTags',
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
    // 参数变化后立刻重刷一次(清掉旧的 data-pixel-* 标记,否则失败过的封面会被跳过)
    refreshPixelArt () {
      for (const el of document.querySelectorAll('.book-card-list img[data-pixel-done], .book-card-list img[data-pixel-failed]')) {
        delete el.dataset.pixelDone
        delete el.dataset.pixelFailed
        delete el.dataset.pixelSig
      }
      this.lastPixelBgSrc = null
      this.$nextTick(() => {
        this.applyPixelCovers()
        this.applyPixelBackground()
      })
      // 兜底:万一有封面卡在处理中,5 秒后强制显示出来,不能一直空着
      clearTimeout(this.pixelFallbackTimer)
      this.pixelFallbackTimer = setTimeout(() => {
        for (const el of document.querySelectorAll('.book-card-list img:not([data-pixel-done])')) {
          el.dataset.pixelFailed = '1'
          el.style.removeProperty('opacity')
        }
      }, 5000)
    },
    // 背景图不做像素化(用户要求:背景保持原样)
    applyPixelBackground () {
      document.documentElement.style.removeProperty('--emm-pixel-bg-image')
      this.lastPixelBgSrc = null
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
    // ---------- 主界面防复制(卡片区/工具栏/随机标签;输入框与搜索框照常可用) ----------
    antiCopyTarget (t) {
      if (!t || typeof t.closest !== 'function') return false
      if (t.closest('input, textarea, [contenteditable="true"], .el-input, .el-textarea, .el-select')) return false
      return !!(t.closest('.book-card-area') || t.closest('.toolbar-flex') || t.closest('.random-tags') || t.closest('.render-sentinel'))
    },
    onAntiCopy (e) {
      if (this.antiCopyTarget(e.target)) e.preventDefault()
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
    // 切换库(工具栏):点一下 = 切到下一个「库切换」框,书架显示该框内所有库合并的漫画
    // 点一下工具栏按钮 = 切到下一条「库切换」框(循环)。只有一条框时点了不会变,所以提示一下
    // 启用了「EH在线」时,循环尾部多一站:最后一个框 → EH在线 → 回到第一个框
    async switchBox () {
      const boxes = this.switchBoxes
      const n = boxes.length
      // ①「EH在线」已经勾进某个切换框:完全按框循环(勾进哪个框,切到那个框就显示在线漫画)
      if (this.ehOnlineInAnyBox) {
        if (n <= 1) {
          this.$message.info(this.$t('m.switchBoxNeedMore'))
          return
        }
        const next1 = ((this.activeBoxIndex + 1) % n + n) % n
        try {
          const res = await ipcRenderer.invoke('set-active-box', { index: next1 })
          if (res && res.ok) {
            this.setting.activeBoxIndex = res.activeBoxIndex
            this.setting.activeLibraryId = res.activeLibraryId
            this.setting.library = res.library
            if (res.activeChanged) await this.loadBookList()
          } else {
            this.$message.error((res && res.error) || this.$t('m.librarySaveFailed'))
          }
        } catch (e) {
          this.$message.error(String((e && e.message) || e))
        }
        return
      }
      // ② 没勾进任何框:保持「循环末尾临时多一站 EH在线」的旧行为
      if (this.onlineActive) {
        // 从 EH在线 回到第一个框(没配过框时不碰后端,直接回到本地书架)
        this.onlineStopActive = false
        if (n) {
          try {
            const res = await ipcRenderer.invoke('set-active-box', { index: 0 })
            if (res && res.ok) {
              this.setting.activeBoxIndex = res.activeBoxIndex
              this.setting.activeLibraryId = res.activeLibraryId
              this.setting.library = res.library
            }
          } catch (e) { /* 忽略:回落后端失败也不该卡住界面 */ }
        }
        await this.loadBookList()
        return
      }
      if (this.ehOnlineAvailable && (n === 0 || this.activeBoxIndex + 1 >= n)) {
        // 最后一个框的下一个就是 EH在线:只切前端状态,后端仍停在原来的框(回来时不用重建运行时)
        this.onlineStopActive = true
        return
      }
      if (n <= 1) {
        this.$message.info(this.$t('m.switchBoxNeedMore'))
        return
      }
      // 前端算好「下一条框」的序号再传给后端:避免前后端状态不同步时「点了没反应」
      const next = ((this.activeBoxIndex + 1) % n + n) % n
      try {
        const res = await ipcRenderer.invoke('set-active-box', { index: next })
        if (res && res.ok) {
          this.setting.activeBoxIndex = res.activeBoxIndex
          this.setting.activeLibraryId = res.activeLibraryId
          this.setting.library = res.library
          if (res.activeChanged) await this.loadBookList()
        } else {
          this.$message.error((res && res.error) || this.$t('m.librarySaveFailed'))
        }
      } catch (e) {
        this.$message.error(String((e && e.message) || e))
      }
    },
    async loadBookList (scan) {
      // EH在线:没有本地书可扫,数据改成从 EH 取,然后照样塞进书架原本的数据流
      if (this.onlineActive) {
        if (scan) this.$message.info(this.$t('m.ehOnlineScanUnsupported'))
        // scan(工具栏「重新加载」)= 真的重拉;切库/切界面回来 = 用手上这份(见 loadOnlineList)
        await this.loadOnlineList(!!scan)
        return
      }
      // 顺带刷新全局标签列表(设置 → 标签 用)
      this.loadAllTags()
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
      // 「筛选」生效时,所有列表路径都在这里被就地过滤一次(没设筛选时等于原样返回)
      bookList = this.applyEhFilter(bookList)
      const allBooks = this.applyEhFilter(this.bookList)
      switch(val){
        case 'mark':
          // EH在线 的「仅收藏」已经在取数据时换成了账号收藏页,这里不能再按本地 mark 过滤(会全空)
          this.displayBookList = this.onlineActive ? allBooks : _.filter(allBooks, 'mark')
          this.chunkList()
          break
        case 'collection':
          this.displayBookList = _.filter(allBooks, 'isCollection')
          this.chunkList()
          break
        case 'hidden':
          this.displayBookList = _.filter(allBooks, 'hiddenBook')
          this.chunkList()
          break
        case 'recentRead': {
          // 历史(JHenTai 的做法):记录里存了画廊快照,所以**不在当前库里也能显示**
          // (换了库、文件被删、在线画廊只取过一页 —— 都能在历史里看到并点开)
          const records = fetchRecentReadRecords()
          const inLibrary = new Map(this.bookList.map(b => [b.id, b]))
          this.displayBookList = this.applyEhFilter(_.uniqBy(records.map(rec => {
            const local = inLibrary.get(rec.id)
            if (local) return { ...local, historyTime: rec.read_time }
            const snap = rec.snap
            if (!snap) return null
            return { ...snap, id: rec.id, historyTime: rec.read_time, fromHistory: true }
          }).filter(Boolean), 'id'))
          // ⚠️ 这里必须自己 chunkList():上面几个 case 各自都调了,这一个是花括号块,
          //    漏掉就整块显示不出来(历史列表看着「点了没反应」就是这里漏的)
          this.chunkList()
          break
        }
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
          this.displayBookList = allBooks
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
        // 空框:不列全部标签(那是几千条),改成像 JHenTai 那样只列「搜索历史」
        result = []
      }
      // 搜索框下方:优先弹出「搜索历史」(点一下直接搜)
      const q = String(queryString || '').trim().toLowerCase()
      const all = this.searchHistory || []
      const history = all
        .filter(s => !q || String(s).toLowerCase().includes(q))
        .slice(0, 10)
        .map(s => ({ value: s, label: this.$t('m.searchHistory') + ': ' + s, isHistory: true }))
      const tail = (history.length && !q) ? [{ value: '', label: this.$t('m.searchHistoryClear'), isClearHistory: true }] : []
      callback([...history, ...result, ...tail])
    },
    // 记住搜索词(搜索框下方的历史,只存本机)
    // 点下拉里的「搜索历史」= 直接搜(JHenTai 点历史芯片就是这个动作);点「清空」= 清空历史
    onSearchSuggestSelect (item) {
      if (!item) return
      if (item.isClearHistory) {
        this.searchHistory = []
        try { localStorage.removeItem('emmSearchHistory') } catch (e) { /* 忽略 */ }
        this.printMessage('success', this.$t('m.searchHistoryCleared'))
        this.searchString = ''
        this.$refs.searchInputRef?.blur?.()
        return
      }
      if (item.isHistory) {
        this.searchString = String(item.value || '')
        this.searchBook()
      }
    },
    // 删掉一条搜索历史(下拉项右侧的 ✕)
    removeSearchHistory (s) {
      this.searchHistory = (this.searchHistory || []).filter(x => x !== s)
      try { localStorage.setItem('emmSearchHistory', JSON.stringify(this.searchHistory)) } catch (e) { /* 忽略 */ }
    },
    rememberSearch (s) {
      const v = String(s || '').trim()
      if (!v) return
      this.searchHistory = [v, ...(this.searchHistory || []).filter(x => x !== v)].slice(0, 20)
      try { localStorage.setItem('emmSearchHistory', JSON.stringify(this.searchHistory)) } catch (e) { /* 忽略 */ }
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
      this.rememberSearch(this.searchString)
      // EH在线:搜索框就是「去 EH 上找」,结果照样进书架原本的数据流
      if (this.onlineActive) {
        this.onlineQuery = this.searchString
        this.currentPage = 1
        this.loadOnlineList(true)
        if (addToHistory) this.actionHistory.push({type: 'search', value: this.searchString})
        return
      }
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
      if (cat === 'category') {
        // 在线画廊的「所属类别」:直接拿类别名去搜
        this.searchString = String(tag)
        this.searchBook()
        return
      }
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
      // EH在线:不是本地书 —— 「缩略图」没有意义,所以 内容/缩略图 都走在线阅读;详细界面照旧
      if (book.online) {
        if (action === 'none') return
        if (action === 'detail') this.$refs.BookDetailDialogRef.openBookDetail(book)
        else this.openContentView(book)
        return
      }
      switch (action) {
        case 'none':
          // 「无效果」:点了什么都不做
          return
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
    onCoverClick (book) { this.runClickAction(this.setting.clickCoverAction || 'content', book) },
    onTitleClick (book) { this.runClickAction(this.setting.clickTitleAction || 'detail', book) },
    onYueClick (book) { this.runClickAction(this.setting.clickYueAction || 'content', book) },
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
      // EH在线 追加下一页:保住当前页与已渲染数量,不回顶(见上面 watcher 里的置位)
      const keepScroll = this.keepScrollOnNextChunk
      this.keepScrollOnNextChunk = false
      if (keepScroll) {
        this.chunkDisplayBookList = this.customChunk(this.displayBookList, this.setting.pageSize, this.currentPage - 1)
        // 新到的这批渲染出来(逐排淡入,用的是原有的出现动画),已渲染的数量只增不减
        this.renderedCount = Math.min(this.chunkDisplayBookList.length, this.renderedCount + this.renderBatchSize)
        this.$nextTick(() => {
          const area = document.querySelector('.book-card-area')
          if (area && area.scrollHeight <= area.clientHeight + 200) this.renderedCount += this.renderBatchSize
        })
        return
      }
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
      // EH在线:每页数量改了,按需再补几页 EH 数据
      if (this.onlineActive) this.loadOnlineList()
    },
    handleCurrentPageChange (currentPage) {
      this.renderedCount = this.renderBatchSize
      this.chunkDisplayBookList = this.customChunk(this.displayBookList, this.setting.pageSize, currentPage - 1)
      this.scrollMainPageTop()
      // EH在线:翻到后面时把对应的 EH 页补齐(抄 JHenTai 的逐页加载)
      if (this.onlineActive) this.loadOnlineList()
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
      // 历史条目:只有「从历史中移除」一个动作(JHenTai 历史页长按卡片也就是这一个)。
      // 单独走一条路,因为这类条目可能已经不在当前库里(在线画廊、换了库、文件被删),
      // 本地那套菜单(移动/删除/获取元数据…)对它要么没意义、要么会出错;
      // 而且它不在「设置 → 高级 → 右键菜单」的可配置项里,不能过那道开关。
      if (book.historyTime) {
        this.$contextmenu({
          x: e.x,
          y: e.y,
          items: [{
            id: 'removeHistory',
            label: this.$t('m.historyRemove'),
            onClick: () => {
              removeReadRecord(book.id)
              this.printMessage('success', this.$t('m.historyRemoved'))
              this.handleSortChange(this.sortValue, this.bookList)
            }
          }]
        })
        return
      }
      // EH在线 卡片:菜单跟本地「一样弹出来」,但只放对在线画廊有意义的项 ——
      // 移动文件/删除文件/打开所在目录/超分/上色/翻译/粘贴标签/获取元数据 这些是本地文件与本地库操作,
      // 对一个在线画廊要么没意义、要么会写坏本地元数据(在线书没有 hash,写 Metadata 表会炸)。
      if (book.online) {
        this.$contextmenu({
          x: e.x,
          y: e.y,
          items: [
            { id: 'downloadGallery', label: this.$t('m.downloadGallery'), onClick: () => this.startGalleryDownload(book, false) },
            { id: 'downloadGalleryOriginal', label: this.$t('m.downloadGalleryOriginal'), onClick: () => this.startGalleryDownload(book, true) },
            { id: 'torrents', label: this.$t('m.torrent'), onClick: () => this.openTorrentDialog(book) },
            { id: 'copyTag', label: this.$t('m.copyTagClipboard'), onClick: () => this.copyTagClipboard(book) },
            { id: 'copyLink', label: this.$t('c.copyLinkToClipboard'), onClick: () => ipcRenderer.invoke('copy-text-to-clipboard', book.url) },
            { id: 'openInBrowser', label: this.$t('m.openInBrowser'), onClick: () => ipcRenderer.invoke('open-url', book.url) }
          ]
        })
        return
      }
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
    openBookDetailAfterRead () {
      // 「阅读完成后 → 打开详情」:先关阅读器,再打开这本书的详情
      const book = this.bookDetail
      if (this.$refs.InternalViewerRef) this.$refs.InternalViewerRef.drawerVisibleViewer = false
      setTimeout(() => { if (book) this.$refs.BookDetailDialogRef.openBookDetail(book) }, 360)
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
    // EH在线:点标签/类别要搜时,写进**原本的搜索栏**再搜(不再另开一个搜索框)
    onOnlineSearch (q) {
      this.searchString = String(q || '')
      this.searchBook(false)
    },
    // 「筛选」(JHenTai 那个筛选对话框)在列表上的就地过滤 —— 分类 / 语言 / 页数 / 最低评分。
    // 没设筛选时原样返回,所以选排序、搜索、翻页这些老路径一点都不受影响。
    applyEhFilter (list) {
      if (!Array.isArray(list) || !list.length) return list
      if (!ehFilterIsActive(this.ehFilter)) return list
      return list.filter(book => ehFilterMatch(this.ehFilter, book))
    },
    // 筛选对话框点「确定」:存下来 → 就地过滤 → EH在线 时把条件也交给 EH 重新取一遍
    applyEhFilterAndRefresh (filter) {
      this.ehFilter = normalizeEhFilter(filter)
      saveEhFilter(this.ehFilter)
      // 关键词走软件原本的搜索栏(本地按本地语法解析,EH在线 就是 EH 的 f_search)
      const kw = String(this.ehFilter.keyword || '').trim()
      if (kw && kw !== this.searchString) {
        this.searchString = kw
        this.searchBook(false)   // searchBook 结尾会走 handleSortChange → 就地过滤
      } else if (this.onlineActive) {
        this.loadOnlineList(true)
      } else {
        this.handleSortChange(this.sortValue, this.displayBookList)
      }
      this.printMessage('success', this.$t('m.filterApplied'))
    },
    // ---------- 下载(第 13 轮)----------
    // 记录列表:主进程是唯一真源(内存 + downloads.json),前端只做展示
    async refreshDownloadRecords () {
      try {
        const r = await ipcRenderer.invoke('eh-download-records')
        if (r && r.ok) this.downloadRecords = r.tasks || []
      } catch (e) { /* 忽略 */ }
    },
    // 拖右栏左边缘调宽度(拖完记在本机;书架宽度变了工具栏会自己重算)
    startDownloadPanelResize (e) {
      e.preventDefault()
      const startX = e.clientX
      const startW = this.downloadPanelWidth
      const onMove = (ev) => {
        const next = startW + (startX - ev.clientX)
        this.downloadPanelWidth = Math.max(240, Math.min(next, Math.max(320, window.innerWidth - 420)))
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        try { localStorage.setItem('emmDownloadPanelWidth', String(this.downloadPanelWidth)) } catch (err) { /* 忽略 */ }
        this.recomputeToolbarWidth()
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    // ⑤ 一条命令把「已暂停 / 失败 / 等待中」的任务全部继续
    async resumeAllDownloads () {
      const list = (this.downloadRecords || []).filter(t => ['paused', 'failed', 'waiting'].includes(t.status))
      if (!list.length) return
      for (const t of list) {
        try { await ipcRenderer.invoke('eh-download-action', { id: t.id, action: 'resume' }) } catch (e) { /* 单条失败不影响其它 */ }
      }
      this.refreshDownloadRecords()
      this.printMessage('success', this.$t('m.downloadResumedAll', { n: list.length }))
    },
    // ③ 点封面 → 在右栏里预览这个任务已经下好的页
    // 任务刚建好时还没解析出目录(dir 为空),这时也先进预览 —— 目录一到会自动补上(见 schedulePreviewRefresh)
    async openDownloadPreview (task) {
      if (!task) return
      this.previewTask = task
      this.downloadPreviewFiles = []
      if (task.dir) await this.refreshDownloadPreview()
    },
    closeDownloadPreview () {
      this.previewTask = null
      this.downloadPreviewFiles = []
    },
    async refreshDownloadPreview () {
      const t = this.previewTask
      if (!t) return
      try {
        const r = await ipcRenderer.invoke('eh-download-files', { dir: t.dir || '', total: t.total || 0 })
        // 用户可能已经切走/关掉预览了,回来别把旧的糊上去
        if (this.previewTask && this.previewTask.id === t.id) this.downloadPreviewFiles = (r && r.files) || []
      } catch (e) { /* 忽略 */ }
    },
    // 下载中时预览要「自己长出来」:进度事件到了就节流刷一次;
    // 另外「目录刚从空变成有」的那一次也要刷(那时才知道去哪里找文件)
    schedulePreviewRefresh (task) {
      if (!this.previewTask || !task || this.previewTask.id !== task.id) return
      const dirJustArrived = !this.previewTask.dir && !!task.dir
      if (task.status !== 'downloading' && !dirJustArrived) return
      clearTimeout(this.previewRefreshTimer)
      this.previewRefreshTimer = setTimeout(() => this.refreshDownloadPreview(), 1200)
    },
    upsertDownloadRecord (task) {
      if (!task || !task.id) return
      const list = this.downloadRecords.slice()
      const i = list.findIndex(t => t.id === task.id)
      if (i >= 0) list.splice(i, 1, task)
      else list.unshift(task)
      this.downloadRecords = list
      // 正在预览这条任务时,让它边下边长出来
      this.schedulePreviewRefresh(task)
      if (this.previewTask && this.previewTask.id === task.id) this.previewTask = task
    },
    openDownloadDrawer () {
      this.downloadPanelVisible = true
      this.refreshDownloadRecords()
    },
    // 模板里不能直接用 import 进来的 toAssetUrl(Options API 不会把它挂到 this 上,渲染会报错),
    // 所以包一层 method
    assetUrl (path) {
      return toAssetUrl(path)
    },
    downloadPercent (task) {
      const total = Number(task.total) || 0
      if (!total) return task.status === 'done' ? 100 : 0
      return Math.min(100, Math.round(((task.done + task.failed) / total) * 100))
    },
    // 失败原因说人话(noPages 这种内部代号用户看不懂)
    downloadErrorText (err) {
      const e = String(err || '')
      // 原图被 EH 挡下(需要 GP):任务停在等待中,等额度恢复点「继续」接着下
      if (e === 'gp') return this.$t('m.downloadErrGp')
      // 取页链接一条都没收到:E H 限速 / 网络不通 —— 先说清原因,别让用户以为画廊没了
      if (e.startsWith('linksFailed')) return this.$t('m.downloadErrLinksFailed') + ' ' + e.replace(/^linksFailed:\s*/, '').slice(0, 100)
      if (e.startsWith('notImage')) return this.$t('m.downloadErrNotImage') + ' ' + e.replace(/^notImage:\s*/, '').slice(0, 120)
      const map = {
        noPages: 'm.downloadErrNoPages',
        noUrl: 'm.downloadErrNoUrl',
        noPath: 'm.downloadNeedPath',
        notLoggedIn: 'm.favoriteLoginNeeded'
      }
      const key = map[e]
      return key ? this.$t(key) : e.slice(0, 140)
    },
    downloadStatusText (status) {
      return this.$t({
        downloading: 'm.downloadStatusDownloading',
        paused: 'm.downloadStatusPaused',
        done: 'm.downloadStatusDone',
        failed: 'm.downloadStatusFailed',
        waiting: 'm.downloadStatusWaiting'
      }[status] || 'm.downloadStatusDownloading')
    },
    // 「删除记录和文件」要确认一下(会真删盘上的文件);「仅删除记录」不删文件,不问
    async deleteDownloadWithFiles (task) {
      try {
        await ElMessageBox.confirm(this.$t('m.downloadDeleteWithFilesConfirm'), this.$t('m.downloadDeleteRecordAndFiles'), { type: 'warning' })
      } catch (e) { return }
      this.downloadAction(task, 'deleteWithFiles')
    },
    async downloadAction (task, action) {
      const r = await ipcRenderer.invoke('eh-download-action', { id: task.id, action })
      if (!r || !r.ok) {
        if (r && r.error === 'notFound') this.refreshDownloadRecords()
        else this.printMessage('error', (r && r.error) || this.$t('m.downloadFailed'))
        return
      }
      if (action === 'delete' || action === 'deleteWithFiles') {
        this.downloadRecords = this.downloadRecords.filter(t => t.id !== task.id)
        if (this.previewTask && this.previewTask.id === task.id) this.closeDownloadPreview()
      } else {
        this.refreshDownloadRecords()
      }
    },
    async clearDownloadRecords () {
      try {
        await ElMessageBox.confirm(this.$t('m.downloadClearConfirm'), this.$t('m.downloadClear'), { type: 'warning' })
      } catch (e) { return }
      await ipcRenderer.invoke('eh-download-clear')
      this.downloadRecords = []
      this.printMessage('success', this.$t('m.downloadCleared'))
    },
    async openDownloadFolder () {
      const dir = String(this.setting.downloadPath || '').trim()
      if (!dir) { this.printMessage('warning', this.$t('m.downloadNeedPath')); return }
      try {
        const r = await ipcRenderer.invoke('open-path', dir)
        if (!r || !r.ok) this.printMessage('info', this.$t('m.downloadOpenFolderManual') + ': ' + dir)
      } catch (e) { this.printMessage('info', this.$t('m.downloadOpenFolderManual') + ': ' + dir) }
    },
    // 整本下载(original = 是否下原图)。没设下载目录时先提示去设置里选。
    async startGalleryDownload (book, original) {
      if (!String(this.setting.downloadPath || '').trim()) {
        this.printMessage('warning', this.$t('m.downloadNeedPath'))
        return
      }
      try {
        const r = await ipcRenderer.invoke('eh-download-gallery', {
          url: book.url, title: book.title || book.title_jpn || '', cover: book.coverPath || '', original: !!original
        })
        if (!r || !r.ok) { this.printMessage('error', (r && r.error) || this.$t('m.downloadFailed')); return }
        this.upsertDownloadRecord(r.task)
        this.printMessage('success', this.$t('m.downloadStarted'))
        this.downloadPanelVisible = true
      } catch (e) {
        this.printMessage('error', this.$t('m.downloadFailed') + ': ' + ((e && e.message) || e))
      }
    },
    // 阅读器里「下载本页 / 本页原图」:地址由阅读器传过来(它已经解析过这一页)
    async downloadCurrentPage ({ url, originalUrl, pageUrl, original, name }) {
      if (!String(this.setting.downloadPath || '').trim()) {
        this.printMessage('warning', this.$t('m.downloadNeedPath'))
        return
      }
      try {
        const r = await ipcRenderer.invoke('eh-download-page', { url, originalUrl, pageUrl, original: !!original, name })
        if (r && r.ok) this.printMessage('success', this.$t('m.downloadSaved') + ': ' + r.path)
        else this.printMessage('error', (r && r.error) || this.$t('m.downloadFailed'))
      } catch (e) {
        this.printMessage('error', this.$t('m.downloadFailed') + ': ' + ((e && e.message) || e))
      }
    },

    // ---------- 卡片右下角「种子」按钮:只查有种子没种子 ----------
    // EH 的列表页不带种子信息,只能挨个问 gallerytorrents.php。所以:
    //   ①只查当前渲染出来的在线卡片 ②并发 2、每次间隔 500ms,别把 EH 打急
    //   ③结果缓存在本机 localStorage(7 天内不再重复问)
    readTorrentCache () {
      try { return JSON.parse(localStorage.getItem('emmTorrentCounts') || '{}') } catch (e) { return {} }
    },
    writeTorrentCache (url, n) {
      try {
        const cache = this.readTorrentCache()
        cache[url] = { n, t: Date.now() }
        // 顺手清掉 30 天前的,免得这个键无限长
        const now = Date.now()
        for (const k of Object.keys(cache)) if (now - (cache[k].t || 0) > 30 * 86400000) delete cache[k]
        localStorage.setItem('emmTorrentCounts', JSON.stringify(cache))
      } catch (e) { /* 隐私模式等写不了就算了 */ }
    },
    applyTorrentCount (url, n) {
      for (const b of this.bookList) {
        if (b && b.online && b.url === url && b.torrentCount !== n) b.torrentCount = n
      }
    },
    queueTorrentChecks () {
      if (!this.onlineActive) return
      const cache = this.readTorrentCache()
      const now = Date.now()
      for (const book of this.visibleRenderedBookList) {
        if (!book || !book.online || !book.url || book.torrentCount !== undefined) continue
        if (this.torrentPending.has(book.url) || this.torrentQueue.includes(book.url)) continue
        const hit = cache[book.url]
        // 缓存命中(7 天内)直接用,不再请求
        if (hit && hit.n !== undefined && now - (hit.t || 0) < 7 * 86400000) {
          book.torrentCount = hit.n | 0
          continue
        }
        this.torrentPending.add(book.url)
        this.torrentQueue.push(book.url)
      }
      this.drainTorrentQueue()
    },
    drainTorrentQueue () {
      while (this.torrentRunning < 2 && this.torrentQueue.length) {
        const url = this.torrentQueue.shift()
        this.torrentRunning += 1
        ipcRenderer.invoke('eh-torrent-count', { url })
          .then(r => {
            const n = (r && r.ok) ? (r.count | 0) : 0
            this.writeTorrentCache(url, n)
            this.applyTorrentCount(url, n)
          })
          .catch(() => { this.applyTorrentCount(url, 0) })
          .finally(() => {
            this.torrentPending.delete(url)
            this.torrentRunning -= 1
            setTimeout(() => this.drainTorrentQueue(), 500)
          })
      }
    },

    // ---------- 种子(JHenTai EHGalleryTorrentsDialog)----------
    async openTorrentDialog (book) {
      this.torrentDialogVisible = true
      this.torrentLoading = true
      this.torrentList = []
      try {
        const r = await ipcRenderer.invoke('eh-torrents', { url: book.url })
        this.torrentList = (r && r.torrents) || []
        if (!this.torrentList.length) this.printMessage('info', this.$t('m.torrentNone'))
      } catch (e) {
        this.printMessage('error', this.$t('m.torrentFailed'))
      } finally {
        this.torrentLoading = false
      }
    },
    // 用种子下载:交给系统默认 BT 客户端(JHenTai 也是 launchUrlString 丢给外部)
    openTorrent (tr) {
      if (tr && tr.url) ipcRenderer.invoke('open-url', tr.url)
    },
    async copyTorrentMagnet (tr) {
      if (!tr || !tr.magnet) return
      // 网页版(局域网 http)不是安全上下文,复制要靠 textarea 兜底;失败时明确告诉用户
      const ok = await ipcRenderer.invoke('copy-text-to-clipboard', tr.magnet).catch(() => false)
      if (ok === false) this.printMessage('error', this.$t('m.copyFailed'))
      else if (tr.url) this.printMessage('success', this.$t('m.torrentCopied'))
      else this.printMessage('success', this.$t('m.torrentCopied'))
    },

    // ---------- EH 账号收藏 ----------
    // 点卡片上的收藏星:已收藏 → 取消;没收藏 → 打开收藏夹选择
    async onOnlineFavorite (book) {
      if (book.favcat != null) {
        const ok = await this.setOnlineFavorite(book, 0, true)
        if (ok) {
          book.favcat = null
          this.printMessage('success', this.$t('m.favoriteRemoved'))
        }
        return
      }
      this.openFavoritePicker(book)
    },
    async openFavoritePicker (book) {
      this.favoritePickerBook = book
      this.favoritePickerVisible = true
      this.favoriteCategoryLoading = true
      try {
        const r = await ipcRenderer.invoke('eh-favorite-categories')
        this.favoriteCategoryList = (r && r.categories) || []
        if (!this.favoriteCategoryList.length) {
          // 拿不到分类(没登录 / 网络不通)就退化成「收藏夹 1」,至少能收藏
          this.favoriteCategoryList = Array.from({ length: 10 }, (_, i) => ({ index: i, name: 'Favorite ' + i, count: -1 }))
        }
      } catch (e) {
        this.favoriteCategoryList = Array.from({ length: 10 }, (_, i) => ({ index: i, name: 'Favorite ' + i, count: -1 }))
      } finally {
        this.favoriteCategoryLoading = false
      }
    },
    setOnlineFavorite (book, favcat, remove) {
      return ipcRenderer.invoke('eh-set-favorite', { url: book.url, favcat, remove }).then(r => {
        if (!r || !r.ok) {
          this.printMessage('error', (r && r.error === 'notLoggedIn') ? this.$t('m.favoriteLoginNeeded') : ((r && r.error) || this.$t('m.favoriteFailed')))
          return false
        }
        return true
      }).catch(() => {
        this.printMessage('error', this.$t('m.favoriteFailed'))
        return false
      })
    },
    async pickFavorite (index) {
      const book = this.favoritePickerBook
      this.favoritePickerVisible = false
      if (!book) return
      if (await this.setOnlineFavorite(book, index, false)) {
        book.favcat = index
        this.printMessage('success', this.$t('m.favoriteAdded'))
      }
    },
    async removeFavoriteFromPicker () {
      const book = this.favoritePickerBook
      this.favoritePickerVisible = false
      if (!book) return
      if (await this.setOnlineFavorite(book, 0, true)) {
        book.favcat = null
        this.printMessage('success', this.$t('m.favoriteRemoved'))
      }
    },

    // 清空历史(带确认)
    async clearHistory () {
      try {
        await ElMessageBox.confirm(this.$t('m.historyClearConfirm'), this.$t('m.historyClear'), { type: 'warning' })
      } catch (e) {
        return
      }
      clearReadRecords()
      this.printMessage('success', this.$t('m.historyCleared'))
      this.handleSortChange(this.sortValue, this.bookList)
    },
    // EH在线:工具栏的「重新加载」(在线模式下扫描按钮就是它)
    reloadOnline () {
      this.loadOnlineList(true)
    },
    // 带 Cookie + 超时地取一个 EH 页面(桌面与网页版都走 get-ex-webpage 通道)
    async fetchExHtml (url) {
      const cookie = ['igneous', 'ipb_pass_hash', 'ipb_member_id', 'star']
        .map(k => k + '=' + (this.setting[k] == null ? '' : this.setting[k]))
        .join('; ')
      const invoke = ipcRenderer.invoke('get-ex-webpage', { url, cookie })
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), 20000)
        invoke.then(
          (v) => { clearTimeout(timer); resolve(v) },
          (e) => { clearTimeout(timer); reject(e) }
        )
      })
    },
    // EH在线:把已取到的画廊映射成「书」塞进书架原本的数据流
    applyOnlineList () {
      this.bookList = this.prepareBookList(this.onlineItems.map(galleryToBook).filter(Boolean))
      this.saveOnlineCache()
    },
    // ---------- EH在线 列表缓存 ----------
    // 用户要求:切界面 / 切库回来不要重新加载,只有「关掉软件或网页」才失效。
    // 用 sessionStorage:刷新页面还在,关掉标签页/客户端就没了 —— 正好是这个语义。
    saveOnlineCache () {
      try {
        sessionStorage.setItem('emmOnlineCache', JSON.stringify({
          query: this.onlineQuery || '',
          favOnly: !!this.onlineFavOnly,
          cursors: this.onlineCursors.slice(-40),
          pagesFetched: this.onlinePagesFetched,
          hasMore: !!this.onlineHasMore,
          // 只留最近 600 条,免得把 sessionStorage 撑爆(超额时下面 catch 掉,顶多下次重拉)
          items: this.onlineItems.slice(-600),
          savedAt: Date.now()
        }))
      } catch (e) { /* 写不了就算了 */ }
    },
    restoreOnlineCache () {
      try {
        const raw = sessionStorage.getItem('emmOnlineCache')
        if (!raw) return false
        const c = JSON.parse(raw)
        if (!c || !Array.isArray(c.items) || !c.items.length) return false
        // 搜索词 / 来源变了就不复用(那是另一份列表)
        if (String(c.query || '') !== String(this.onlineQuery || '')) return false
        if (!!c.favOnly !== !!this.onlineFavOnly) return false
        this.onlineItems = c.items
        this.onlineCursors = (Array.isArray(c.cursors) && c.cursors.length) ? c.cursors : [null]
        this.onlinePagesFetched = Number(c.pagesFetched) || 0
        this.onlineHasMore = c.hasMore !== false
        return true
      } catch (e) { return false }
    },
    // 取「下一个 EH 页」并追加(20 条;EX 拿不到退回 EH)。返回本次追加条数。
    async appendEhPage (src) {
      // 来源优先级:「仅收藏」→ 账号收藏页;有搜索词 → 搜索;否则首页
      const source = src || (this.onlineFavOnly ? 'favorites' : (String(this.onlineQuery || '').trim() ? 'search' : 'front'))
      const cursor = this.onlineCursors[this.onlinePagesFetched] || null
      // 「筛选」里的分类/语言/页数/评分也翻译成 EH 的 f_* 参数交给 EH 自己筛(和 JHenTai 一样)
      const filter = ehFilterParams(this.ehFilter)
      let host = ehHost(this.setting)
      let parsed = parseGalleryList(await this.fetchExHtml(ehListUrl(this.setting, { source, query: this.onlineQuery, cursor, host, filter })), host)
      if (host === EX_HOST && !parsed.galleries.length) {
        host = EH_HOST
        parsed = parseGalleryList(await this.fetchExHtml(ehListUrl(this.setting, { source, query: this.onlineQuery, cursor, host, filter })), host)
      }
      if (!parsed.galleries.length) {
        this.onlineHasMore = false
        this.printMessage('warning', (parsed.error === 'ipBanned') ? this.$t('m.ehOnlineIpBanned') : this.$t('m.ehOnlineEmpty'))
        return 0
      }
      this.onlineItems = this.onlineItems.concat(parsed.galleries)
      if (parsed.nextGid) this.onlineCursors = [...this.onlineCursors, parsed.nextGid]
      this.onlinePagesFetched += 1
      this.onlineHasMore = !!parsed.nextGid
      return parsed.galleries.length
    },
    // 补到至少 need 条(单次最多补 8 页,避免一口气连打二十几个请求)
    async fillOnlineUpTo (need) {
      let guard = 0
      while (this.onlineItems.length < need && this.onlineHasMore && guard < 8) {
        const n = await this.appendEhPage()
        guard += 1
        if (!n) break
      }
    },
    // 滚到底 / 翻页时再补下一页(在线「无限往下看」)
    async appendOnlinePageIfNeeded (force = false) {
      if (!this.onlineActive || this.onlineLoading || !this.onlineHasMore) return
      if (!force && this.renderedCount < this.visibleChunkDisplayBookList.length) return
      this.onlineLoading = true
      try {
        const n = await this.appendEhPage()
        if (n) this.applyOnlineList()
      } catch (e) {
        console.error(e)
      } finally {
        this.onlineLoading = false
      }
    },
    // EH在线:取列表 → 映射成「书」→ 交给书架原本的数据流(卡片/分页/排序/详情/阅读器全是原版)
    //  · EH 列表每页固定 20 条,所以按需拼几页(一次最多补 8 页,避免「每页 500 条」时连打二十几个请求)
    //  · 翻页时再补一批,保证往后翻总有新内容
    async loadOnlineList (reset = false) {
      if (this.onlineLoading) return
      // ★没要求重拉:手上这份就够用(切库/切界面回来不该重来);手上没有再看会话缓存
      if (!reset) {
        if (this.onlineItems.length) {
          this.applyOnlineList()
          try { await this.fillOnlineUpTo((Number(this.currentPage) || 1) * (Number(this.setting.pageSize) || 42)) } catch (e) { /* 补页失败不影响已显示的内容 */ }
          return
        }
        if (this.restoreOnlineCache()) {
          this.applyOnlineList()
          return
        }
      }
      this.onlineLoading = true
      const EH_PAGE = 20
      try {
        // 来源与 appendEhPage 保持同一套判断(「仅收藏」优先)
        const source = this.onlineFavOnly ? 'favorites' : (String(this.onlineQuery || '').trim() ? 'search' : 'front')
        if (reset) {
          this.onlineItems = []
          this.onlineCursors = [null]
          this.onlinePagesFetched = 0
          this.onlineHasMore = true
        }
        // 抄 JHenTai 的做法:不预先囤一堆,而是**一次取一页**(EH 每页 20 条,翻页用 gid 游标);
        // 滚到底 / 翻到后面时再追加下一页,所以能一直往下看,没有「只能加载 N 条」的上限。
        if (!this.onlineItems.length) {
          await this.appendEhPage(source)
        } else {
          await this.fillOnlineUpTo((Number(this.currentPage) || 1) * (Number(this.setting.pageSize) || 42))
        }
        this.applyOnlineList()
      } catch (e) {
        console.error(e)
        this.printMessage('error', (e && e.message === 'timeout') ? this.$t('m.ehOnlineTimeout') : this.$t('m.ehOnlineFailed'))
      } finally {
        this.onlineLoading = false
      }
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

// 卡片逐个淡入:一页 500 张一次渲染时,给前 41 张依次加一点延迟,
// 观感是"一张张出现"而不是整片同时弹出(超过 40 张不再延迟,免得等太久)。
// 延迟值由 App.vue 的 v-for 通过 --emm-in-delay 传进来。
.pop-enter-active
  transition-delay: var(--emm-in-delay, 0ms)

.pop-enter-from
  opacity: 0
  transform: translateY(8px)

.pop-leave-to
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

// 主界面防复制:卡片区/工具栏/随机标签不可选中,输入框(含搜索框)保持可选
.book-card-area, .book-card-area *, .random-tags, .random-tags *, .toolbar-flex .el-button
  user-select: none
  -webkit-user-drag: none
.toolbar-flex .search-input, .toolbar-flex .el-input, .toolbar-flex .el-input__inner, .book-card-area input, .book-card-area textarea
  user-select: text !important

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

// ============ 音乐律动加载动画(仅像素风格下使用,普通模式保持原生转圈) ============
.emm-eq.pixel-only
  display: none
html.theme-pixel .emm-eq.pixel-only
  display: inline-flex
// 像素模式:原生转圈/旋转环隐藏,换成均衡器
html.theme-pixel .cover-loading .el-icon
  display: none !important
html.theme-pixel .book-task-ring
  display: none !important
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
  // 自定义背景图优先,没设就用内置默认像素图(背景不做像素化处理)
  background-image: var(--emm-custom-bg-image, url('./assets/pixel-default-bg.png')) !important
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

.autocomplete-label.is-history
  color: var(--el-color-primary)
.autocomplete-label.is-clear
  color: var(--el-color-info)
  font-size: 12px
.autocomplete-del
  margin-left: auto
  padding: 0 4px
  color: var(--el-text-color-placeholder)
  cursor: pointer
  &:hover
    color: var(--el-color-danger)

.autocomplete-value
  margin-left: 2em
  float: right

// search-input sort-select
.el-autocomplete-suggestion__wrap, .el-select-dropdown__wrap
  max-height: 490px!important

.book-tag-edit-cascader-popper
  .el-cascader-menu__wrap.el-scrollbar__wrap
    height: 340px

// 主界面 + 下载记录右栏:flex 并排,右栏可以拖宽
.app-body
  display: flex
  align-items: stretch
  width: 100%
.app-main
  flex: 1
  min-width: 0

.download-panel
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
  // 拖宽的手柄:贴着左边缘的一条窄条
  .download-panel-resizer
    position: absolute
    left: -3px
    top: 0
    bottom: 0
    width: 6px
    cursor: col-resize
    z-index: 5
    &:hover
      background: var(--el-color-primary-light-7)
  .download-panel-header
    display: flex
    align-items: center
    justify-content: space-between
    gap: 8px
    padding-bottom: 8px
    font-size: 15px
    .download-panel-title
      overflow: hidden
      text-overflow: ellipsis
      white-space: nowrap
      font-weight: 600
    .download-panel-actions
      display: flex
      align-items: center
      gap: 2px
      flex: none
    .download-panel-progress
      flex: none
      font-size: 12px
      color: var(--el-text-color-secondary)
  // 列表 / 预览都要能自己滚
  .download-list,
  .download-preview
    flex: 1
    min-height: 0
    overflow-y: auto
  .download-cover-wrap
    position: relative
    flex: none
    cursor: pointer
    &:hover .download-cover-zoom
      opacity: 1
  .download-cover-zoom
    position: absolute
    right: 2px
    bottom: 2px
    font-size: 12px
    opacity: 0
    transition: opacity .15s
  // 预览网格:下好的出图,没下好的空白 + 转圈
  .download-preview
    display: grid
    grid-template-columns: repeat(auto-fill, minmax(88px, 1fr))
    gap: 6px
    align-content: start
  .download-preview-item
    aspect-ratio: 3 / 4
    border-radius: 6px
    overflow: hidden
    background: var(--el-fill-color-light)
    img
      width: 100%
      height: 100%
      object-fit: cover
      display: block
  .download-preview-blank
    width: 100%
    height: 100%
    display: flex
    flex-direction: column
    align-items: center
    justify-content: center
    gap: 4px
    font-size: 11px
    color: var(--el-text-color-placeholder)
  .download-list
    display: flex
    flex-direction: column
    gap: 10px
  .download-hint
    padding: 6px 8px
    border-radius: 6px
    font-size: 12px
    color: var(--el-color-warning)
    background: var(--el-color-warning-light-9)
  .download-empty
    padding: 24px 0
    text-align: center
    font-size: 13px
    color: var(--el-text-color-secondary)
  .download-item
    display: flex
    gap: 10px
    padding: 8px
    border-radius: 8px
    background: var(--el-fill-color-light)
  .download-cover
    width: 46px
    height: 62px
    object-fit: cover
    border-radius: 4px
    flex: none
    &.download-cover-empty
      background: var(--el-fill-color-dark)
  .download-body
    flex: 1
    min-width: 0
    display: flex
    flex-direction: column
    gap: 4px
  .download-title
    font-size: 13px
    line-height: 1.3
    overflow: hidden
    display: -webkit-box
    -webkit-line-clamp: 2
    -webkit-box-orient: vertical
  .download-meta
    display: flex
    align-items: center
    gap: 6px
    font-size: 12px
    color: var(--el-text-color-secondary)
  .download-pill
    padding: 0 4px
    border-radius: 3px
    background: var(--el-color-primary-light-9)
    color: var(--el-color-primary)
  .download-error
    font-size: 12px
    line-height: 1.4
    color: var(--el-color-danger)
    word-break: break-all
  .download-hint-inline
    font-size: 12px
    color: var(--el-color-warning)
  .download-status.is-done
    color: var(--el-color-success)
  .download-status.is-failed
    color: var(--el-color-danger)
  .download-failed
    color: var(--el-color-danger)
  .download-actions
    display: flex
    flex-direction: column
    align-items: flex-end
    gap: 2px
    flex: none

// 种子列表
.torrent-list
  display: flex
  flex-direction: column
  gap: 8px
  max-height: 60vh
  overflow-y: auto
.torrent-item
  padding: 8px 10px
  border-radius: 8px
  background: var(--el-fill-color-light)
  &.is-outdated
    opacity: .6
  .torrent-name
    font-size: 13px
    margin-bottom: 4px
    word-break: break-all
  .torrent-meta
    display: flex
    flex-wrap: wrap
    gap: 8px
    font-size: 12px
    color: var(--el-text-color-secondary)
  .torrent-outdated
    color: var(--el-color-danger)
  .torrent-actions
    margin-top: 6px
    display: flex
    gap: 6px
.torrent-loading, .torrent-empty
  padding: 20px 0
  text-align: center
  color: var(--el-text-color-secondary)

// 收藏夹选择
.favorite-list
  display: flex
  flex-direction: column
  gap: 6px
.favorite-item
  display: flex
  align-items: center
  justify-content: space-between
  padding: 8px 10px
  border-radius: 6px
  cursor: pointer
  background: var(--el-fill-color-light)
  font-size: 13px
  &:hover
    background: var(--el-color-primary-light-9)
  .favorite-count
    color: var(--el-text-color-secondary)
.favorite-remove
  margin-top: 4px
  padding: 8px 10px
  border-radius: 6px
  cursor: pointer
  text-align: center
  font-size: 13px
  color: var(--el-color-danger)
  background: var(--el-color-danger-light-9)

// 触底加载的底部状态(与卡片区同宽居中)
.load-more-footer
  display: flex
  align-items: center
  justify-content: center
  min-height: 44px
  padding-bottom: 16px
  color: var(--el-text-color-secondary)
  .load-more-end
    font-size: 13px

// 「筛选」按钮:有条件在生效时高亮(实心),一眼能看出列表正被筛着
.toolbar-flex
  .el-button.is-filtering
    background-color: var(--el-color-primary)
    border-color: var(--el-color-primary)
    color: #fff

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