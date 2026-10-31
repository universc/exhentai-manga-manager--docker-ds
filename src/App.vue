<template>
  <el-config-provider :locale="localeFile">
    <!-- 网页版账户登录(启用账户系统且未登录时显示) -->
    <LoginDialog />
    <el-button v-if="setting.showFullscreenButton !== false" class="fullscreen-button" circle :icon="FullScreen" size="large" @click="switchFullscreen"></el-button>
    <!-- 主界面与「下载记录」并排:左主右栏,中间那条可以拖宽度 -->
    <div class="app-body">
    <!-- 文件夹树：左侧入坞面板（原来是左抽屉，现在可拖宽，宽度持久化） -->
    <FolderTree
      ref="FolderTreeRef"
      :width="folderTreePanelWidth"
      @update:width="onFolderTreeWidthChange"
      @chunk-list="chunkList"
    />
    <div class="app-main">
    <el-row :gutter="20" class="book-search-bar">
      <el-col :span="24">
        <div class="toolbar-flex" ref="toolbarFlexRef" :style="toolbarWidth ? { width: toolbarWidth + 'px' } : {}">
          <!-- 工具栏元素:显示项与排列顺序都在 设置 → 高级 → 工具栏按钮 里调整(设置按钮始终保留) -->
          <template v-for="id in toolbarOrderIds" :key="id">
            <!-- 搜索输入框:搜索历史放在下拉弹层底部,排成**横排芯片**(见 footer 插槽 + .search-history-panel) -->
            <el-autocomplete
              v-if="id === 'searchInput'" v-show="!toolbarCollapsedIds.includes(id)" :data-tb-id="id"
              ref="searchInputRef"
              :model-value="searchString"
              :fetch-suggestions="querySearch"
              @keyup.enter="searchBook"
              @change="handleSearchStringChange"
              @input="handleInput"
              @focus="syncSearchPopperWidth"
              clearable
              :fit-input-width="false"
              :trigger-on-focus="true"
              popper-class="emm-search-suggest"
              :popper-style="searchPopperStyle"
              class="search-input"
            >
              <template #default="{ item }">
                <!-- 占位项不给任何文字(只为让弹层弹出来),样式里直接隐藏这一行 -->
                <span v-if="item.isHistoryPlaceholder" class="autocomplete-placeholder"></span>
                <template v-else>
                  <span class="autocomplete-label">{{ item.label }}</span>
                  <span class="autocomplete-value" v-if="item.value !== item.label">{{ item.value }}</span>
                </template>
              </template>
              <!-- 搜索历史:横排芯片(自动换行),点一下直接搜;点 ✕ 删单条
                   「清除」是滚动区里的**最后一项**:记录多时要滑到底才看得到,居中占一整行 -->
              <template #footer>
                <div v-if="searchHistory.length" class="search-history-panel">
                  <div class="search-history-chips">
                    <el-tag
                      v-for="h in searchHistory"
                      :key="'sh-' + h"
                      class="search-history-chip"
                      :class="{ 'is-selected': String(searchTyping || searchString || '') === h }"
                      size="small"
                      closable
                      disable-transitions
                      @click="applySearchHistory(h)"
                      @close="removeSearchHistory(h)"
                    >{{ h }}</el-tag>
                    <div class="search-history-foot">
                      <el-button class="search-history-clear" link size="small" :icon="MdTrash" @click="clearSearchHistory">{{ $t('m.clear') }}</el-button>
                    </div>
                  </div>
                </div>
              </template>
            </el-autocomplete>
            <!-- 搜索按钮 -->
            <el-button v-else-if="id === 'searchButton'"  v-show="!toolbarCollapsedIds.includes(id)" :data-tb-id="id" type="primary" :icon="Search32Filled" plain @click="searchBook" :title="$t('m.search')"></el-button>
            <!-- 排序/筛选:方向由箭头单独切换 -->
            <div v-else-if="id === 'sortSelect'"  v-show="!toolbarCollapsedIds.includes(id)" :data-tb-id="id" class="sort-select-wrap">
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
              v-else-if="id === 'filter'" v-show="!toolbarCollapsedIds.includes(id)" :data-tb-id="id"
              type="primary"
              plain
              :icon="MdOptions"
              :title="$t('m.filterButton')"
              :class="{ 'is-filtering': ehFilterActive }"
              @click="ehFilterVisible = true"
            ></el-button>
            <!-- 下载记录:右侧滑出下载列表(可在 高级 → 工具栏按钮 里隐藏);再点一次收回 -->
            <el-button
              v-else-if="id === 'downloads'" v-show="!toolbarCollapsedIds.includes(id)" :data-tb-id="id"
              type="primary"
              plain
              :icon="MdCloudDownload"
              :title="$t('m.downloads')"
              :class="{ 'is-filtering': downloadPanelVisible }"
              @click="toggleDownloadDrawer"
            ></el-button>
            <!-- 侧边详细信息:与下载记录同款右栏(封面/标题/评分/标签/操作,照 JHenTai 详情页) -->
            <el-button
              v-else-if="id === 'detailPanel'" v-show="!toolbarCollapsedIds.includes(id)" :data-tb-id="id"
              type="primary"
              plain
              :icon="InfoFilled"
              :title="$t('m.sideDetail')"
              :class="{ 'is-filtering': detailPanelVisible }"
              @click="detailPanelVisible = !detailPanelVisible"
            ></el-button>
            <!-- UI 模式切换:自动 → 手机 → 平板 → 电脑(桌面客户端与网页版都有) -->
            <el-button v-else-if="id === 'uiMode'"  v-show="!toolbarCollapsedIds.includes(id)" :data-tb-id="id" :icon="uiModeIcon" plain @click="switchUiMode" :title="$t('m.switchUiMode') + ': ' + $t(uiModeLabelKey)"></el-button>
            <!-- 设置按钮:与界面模式按钮一套样式(纯 plain,图标不跟主色调) -->
            <el-button v-else-if="id === 'setting'"  v-show="!toolbarCollapsedIds.includes(id)" :data-tb-id="id" :icon="SettingIcon" plain @click="$refs.SettingRef.dialogVisibleSetting = true" :title="$t('m.setting')"></el-button>
            <!-- 切换库:点一下 = 切到下一个「库切换」框(书架显示该框内所有库合并的漫画) -->
            <!-- 切换库:点一下 = 切到下一条「库切换」框(循环) -->
            <el-button v-else-if="id === 'switchLibrary'"  v-show="!toolbarCollapsedIds.includes(id)" :data-tb-id="id" type="primary" plain :icon="switchLibraryIcon" :loading="buttonLoadBookListLoading" @click="switchBox()" :title="$t('m.switchLibraryCurrent') + ':' + (boxLabel || '—')"></el-button>
            <!-- 可自定义的界面按钮 -->
            <el-button
              v-else-if="toolbarButtonMap[id]" v-show="!toolbarCollapsedIds.includes(id)" :data-tb-id="id"
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
            <!-- 智能生成:按名字与文件夹结构自动建议合集。
                 按钮样式与同一排的其它按钮保持一致(primary + plain + 24 号 fluent 图标),
                 以前用 success 绿色 + ionicons 的魔杖图标,在一排里显得突兀、图标也偏小不明显。 -->
            <el-button type="primary" plain v-if="editCollectionView" @click="autoCollectionVisible = true" :icon="Wand24Regular" :title="$t('m.autoCollectionTitle')"></el-button>
            <el-button type="primary" plain v-if="editCollectionView" @click="$refs.EditViewRef.editCollection()" :icon="Edit" :title="$t('m.editCollection')"></el-button>
            <el-button type="primary" plain v-if="editCollectionView" @click="$refs.EditViewRef.saveCollection()" :icon="Save16Regular" :title="$t('m.save')"></el-button>
            <el-button type="primary" plain v-if="editCollectionView" @click="$refs.EditViewRef.exitCollectionView()" :icon="MdExit" :title="$t('m.exit')"></el-button>
            <el-button type="primary" plain v-if="editTagView" @click="$refs.EditViewRef.exitEditTagView()" :icon="MdExit" :title="$t('m.exit')"></el-button>
          </div>
          <!-- 设置按钮已并入上面的排序序列(常驻,不可隐藏) -->
          <!-- 上下文按钮(仅 Win 远程桌面模式) = 服务器配置 -->
          <el-button v-if="showContextButton" :icon="contextButton.icon" plain @click="contextButton.action()" :title="$t(contextButton.titleKey)"></el-button>
          <!-- ⋯ 溢出收纳:一行放不下的按钮收进这里(显示项、顺序、行为都与工具栏上的按钮一致)
               唤出与收纳规则见 methods.recalcToolbarOverflow -->
          <el-dropdown v-if="toolbarCollapsedIds.length" trigger="click" @command="runToolbarAction">
            <el-button type="primary" plain :icon="MoreFilled" :title="$t('m.more')" :aria-label="$t('m.more')"></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="id in toolbarCollapsedIds" :key="'tb-ov-' + id" :command="id">
                  <component :is="toolbarMenuItemIcon(id)" v-if="toolbarMenuItemIcon(id)" class="emm-overflow-icon" />
                  <span>{{ toolbarMenuItemTitle(id) }}</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
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
        <!-- EH在线 重新加载/搜索/排序:立刻摆上骨架卡,而不是留着旧列表装作没事(用户说的「卡半天」) -->
        <div class="online-skeleton" v-if="onlineReloading && !visibleRenderedBookList.length">
          <div class="online-skeleton-card" v-for="n in (Number(setting.pageSize) > 24 ? 24 : Number(setting.pageSize) || 12)" :key="'sk' + n">
            <div class="online-skeleton-cover"></div>
            <div class="online-skeleton-line"></div>
            <div class="online-skeleton-line short"></div>
          </div>
        </div>
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
        <!-- 触底加载的底部状态:加载中转圈;EH在线全部加载完写「没有更多了」 -->
        <div class="load-more-footer" v-if="visibleChunkDisplayBookList.length && (listLoadingMore || (onlineActive && !onlineHasMore))">
          <el-icon v-if="listLoadingMore" class="is-loading" :size="20"><Loading /></el-icon>
          <span v-else-if="onlineActive && !onlineHasMore" class="load-more-end">{{ $t('m.noMoreData') }}</span>
        </div>
        <!-- 历史按库分流后为空时说一句(EH在线 库只列在线记录,本地库只列本地记录) -->
        <div class="book-empty-hint" v-if="sortValue === 'recentRead' && !displayBookList.length">
          {{ onlineActive ? $t('m.historyEmptyOnline') : $t('m.historyEmptyLocal') }}
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
    <!-- 两个右栏(侧边详细信息 / 下载记录)按打开顺序排:先开的在左,后开的在右 -->
    <template v-for="name in panelOrder" :key="'rpanel-' + name">
      <!-- 侧边详细信息:与下载记录同层同款的右栏(内容照 JHenTai 的详情页) -->
      <SideDetailPanel
        v-if="name === 'detail'"
        v-show="detailPanelVisible"
        :visible="detailPanelVisible"
        :width="detailPanelWidth"
        @close="detailPanelVisible = false"
        @update:width="onDetailPanelWidthChange"
        @read="onSideDetailRead"
        @download-gallery="({ book }) => openDownloadDialog(book)"
        @open-torrents="openTorrentDialog"
        @favorite="onOnlineFavorite"
        @search-from-tag="searchFromTag"
        @refresh-list="loadBookList(false)"
        @open-book-detail="(b) => $refs.BookDetailDialogRef.openBookDetail(b)"
        @get-metadata="(b) => $refs.SearchDialogRef.getBookInfo(b)"
        @toggle-hidden="onSideDetailToggleHidden"
        @rescan="onSideDetailRescan"
        @delete-book="onSideDetailDelete"
        @open-gallery-url="onSideDetailOpenGalleryUrl"
        @open-hh-download="openHhDownloadDialog"
      />
      <!-- 下载记录:和主界面**同层**(不是浮层);拖动左边缘可以调整这一栏的宽度。
           列表照 JHenTai 的下载网格模式:封面网格,没下完的封面上压暗 + 圆环进度 + 中央状态按钮 -->
      <!-- 下载记录栏：移植自重构版（redesign/v1）的 DownloadPanel.vue。
           纯展示组件：数据走 downloadTaskViews / previewViews 两个 computed，
           动作全部 emit 回 App.vue 原方法（一个没改名）；拖宽手柄保留
           （startDownloadPanelResize 与旧版同一实现）。 -->
      <DownloadPanel
        v-else-if="name === 'download'"
        :visible="downloadPanelVisible"
        :width="downloadPanelWidth"
        :preview-task="previewTask"
        :task-views="downloadTaskViews"
        :path-missing="downloadPathMissing"
        :resumable-count="resumableDownloadCount"
        :movable-count="movableDownloadCount"
        :done-count="previewDoneCount"
        :total-count="previewTotalCount"
        :preview-views="previewViews"
        :warn-id="downloadWarn.id"
        @resize-start="startDownloadPanelResize"
        @resume-all="resumeAllDownloads"
        @open-folder="openDownloadFolder"
        @move-all="moveAllCompletedDownloads"
        @close="downloadPanelVisible = false"
        @back="closeDownloadPreview"
        @task-action="downloadAction"
        @move-one="moveOneDownload"
        @delete-with-files="deleteDownloadWithFiles"
        @open-preview="openDownloadPreview"
        @open-task-detail="openDownloadTaskDetail"
        @tag-click="onDownloadTagClick"
        @cover-error="onDownloadCoverError"
        @warn-hover="hoverDownloadWarn"
        @warn-leave="leaveDownloadWarn"
        @warn-toggle="toggleDownloadWarn"
        @preview-context="onPreviewContextMenu"
        @preview-page="openDownloadPageInReader"
        @preview-img-error="onPreviewImgError"
        @retry-img="retryPreviewImg"
      />
      <!-- 管理合集：原来是底部抽屉，现在是右侧入坞面板（与任务记录同款，可拖宽）。
           保留 .collection-drawer 类，让旧样式继续命中内部元素 -->
      <div v-else-if="name === 'collection'" class="dock-panel collection-drawer" v-show="drawerVisibleCollection" :style="{ width: collectionPanelWidth + 'px' }">
        <div class="dock-panel-resizer" @mousedown="startDockResize($event, 'collectionPanelWidth', 320)"></div>
        <div class="dock-panel-header">
          <span class="dock-panel-title">{{ openCollectionTitle }}</span>
          <span class="dock-panel-actions">
            <el-button type="primary" :icon="Edit" plain link class="collection-edit-button" @click="editCurrentCollection"></el-button>
            <el-button text @click="drawerVisibleCollection = false">✕</el-button>
          </span>
        </div>
        <div class="dock-panel-body">
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
        </div>
      </div>
    </template>
    </div>
    <!-- 下载记录(右侧滑出):进度 / 暂停 / 继续 / 删除 / 打开下载文件夹 -->

    <!-- 种子列表(照 JHenTai 的 EHGalleryTorrentsDialog:名称 + 做种/下载/大小 + 复制磁力) -->
    <el-dialog v-model="torrentDialogVisible" :title="$t('m.torrentsTitle')" width="620px">
      <div v-if="torrentLoading" class="torrent-loading"><el-icon class="is-loading" :size="22"><Loading /></el-icon></div>
      <div v-else-if="!torrentList.length" class="torrent-empty">{{ $t('m.torrentNone') }}</div>
      <div v-else class="torrent-list">
        <div v-for="(tr, i) in torrentList" :key="i" class="torrent-item" :class="{ 'is-outdated': tr.outdated }">
          <div class="torrent-name" :title="tr.name" @click="openTorrentInBrowser(tr)">{{ tr.name }}</div>
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
          <el-tag size="small" effect="dark" :color="quickTag.color">{{ quickTagLabel }}</el-tag>
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
    <!-- 下载弹窗:所有「下载」入口(侧边详细 / 详细界面 / 右键)统一走它:位置 / 名称 / 原图 -->
    <DownloadDialog ref="DownloadDialogRef" @start="startGalleryDownloadFromDialog" />
    <!-- 移动弹窗:只能在**已有库的文件夹及其子文件夹**里选(设置里填了默认路径就不弹这个) -->
    <el-dialog v-model="moveDialog.visible" :title="$t('m.downloadMovePickTitle')" width="440px" append-to-body>
      <LibraryFolderPicker v-model="moveDialog.target" :placeholder="$t('m.downloadMovePick')" />
      <div class="move-dialog-hint" v-if="moveDialog.target">{{ moveDialog.target }}</div>
      <template #footer>
        <el-button size="small" @click="moveDialog.visible = false">{{ $t('m.cancel') }}</el-button>
        <el-button size="small" type="primary" :disabled="!moveDialog.target" @click="confirmMoveDialog">{{ $t('m.ok') }}</el-button>
      </template>
    </el-dialog>
    <BookDetailDialog
      ref="BookDetailDialogRef"
      @download-gallery="({ book }) => openDownloadDialog(book)"
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
      @open-hh-download="openHhDownloadDialog"
    />
    <!-- H@H 归档下载(EH 服务端打包):照 JHenTai 的 EHDownloadHHDialog -->
    <HhDownloadDialog
      v-model="hhDialogVisible"
      :archive-page-url="hhDialogUrl"
    />
    <!-- 自动生成合集:按名字与文件夹结构给出建议,用户勾选后才写盘 -->
    <AutoCollectionDialog
      v-model="autoCollectionVisible"
      @applied="$refs.EditViewRef && $refs.EditViewRef.saveCollection && null"
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
    <TagGraph ref="TagGraphRef" @search="handleSearchString"/>
    <SearchDialog ref="SearchDialogRef"/>
    <EhFilterDialog v-model:visible="ehFilterVisible" :filter="ehFilterForDialog" @apply="applyEhFilterAndRefresh"/>
    <Setting ref="SettingRef" @load-book-list="loadBookList" @load-collection-list="loadCollectionList"/>
  </el-config-provider>
</template>

<script>
import { defineComponent } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Setting as SettingIcon, FullScreen, Edit, Loading, Close, Clock, InfoFilled, Warning, Refresh, ArrowLeft, FolderOpened, MoreFilled } from '@element-plus/icons-vue'
import { ArrowTrendingLines20Filled, Collections24Regular, Search32Filled, Save16Regular, Wand24Regular } from '@vicons/fluent'
import { MdShuffle, MdRefresh, MdSync, MdCodeDownload, MdExit, MdBook, MdColorPalette, MdFolderOpen, MdCloudDone, MdPhonePortrait, MdTabletPortrait, MdDesktop, MdFunnel, MdOptions, MdTrash, MdCloudDownload, MdPlay, MdPause } from '@vicons/ionicons4'
import { TreeViewAlt, CicsSystemGroup, TagGroup, Catalog } from '@vicons/carbon'

import { getWidth, fetchRecentReadRecords, removeReadRecord, clearReadRecords, isContextMenuItemEnabled, sortContextMenuItems, mergeContextMenuOptions, applyCustomTheme, applyFavicon, applyCoverStyle, applyAppName, defaultToolbarButtons, ensureToolbarButtons, insertMissingToolbarItems, TOOLBAR_NEW_ITEMS, TOOLBAR_ALWAYS_ITEMS, clearCustomTheme, applyPixelTheme, toAssetUrl, parsePageSizes, tagDisplayName, tagColorOf, galleryCategoryName as galleryCategoryNameOf, tagDisplayPrefix as tagDisplayPrefixOf } from './utils.js'
import { extractCoverColors, pixelateToDataUrl } from './cover-color.js'
// 内置的默认像素底图(构建后会变成带 hash 的资源 URL)
import pixelDefaultBg from './assets/pixel-default-bg.png'
import { attachPixelSfx, playPixelSfx } from './pixel-sfx.js'
import { attachInertiaScroll } from './inertia-scroll.js'

import Setting from './components/Setting.vue'
import TagGraph from './components/TagGraph.vue'
import InternalViewer from './components/InternalViewer.vue'
import SearchDialog from './components/SearchDialog.vue'
import HhDownloadDialog from './components/HhDownloadDialog.vue'
import AutoCollectionDialog from './components/AutoCollectionDialog.vue'
import BookDetailDialog from './components/BookDetailDialog.vue'
import FolderTree from './components/FolderTree.vue'
import BookCard from './components/BookCard.vue'
import BookCardCollection from './components/BookCardCollection.vue'
import EditView from './components/EditView.vue'
import RandomTags from './components/RandomTags.vue'
import LoginDialog from './components/LoginDialog.vue'
import EhFilterDialog from './components/EhFilterDialog.vue'
import SideDetailPanel from './components/SideDetailPanel.vue'
import DownloadPanel from './components/DownloadPanel.vue'
import DownloadDialog from './components/DownloadDialog.vue'
import LibraryFolderPicker from './components/LibraryFolderPicker.vue'
import { EH_ONLINE_ID, hasEhCookies, ehHost, ehListUrl, parseGalleryList, parseGalleryDetail, galleryToBook, ehImageSrc, EX_HOST, EH_HOST } from './ehOnline.js'
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
    HhDownloadDialog,
    AutoCollectionDialog,
    SideDetailPanel,
    DownloadPanel,
    DownloadDialog,
    LibraryFolderPicker,
  },
  setup () {
    return {
      SettingIcon, FullScreen, Edit, Loading, Close, Clock, InfoFilled, Warning, Refresh, ArrowLeft, FolderOpened, MdPlay, MdPause,
      Collections24Regular, Search32Filled, ArrowTrendingLines20Filled, Save16Regular, Wand24Regular,
      MdRefresh, MdCodeDownload, MdExit, MdShuffle, MdFolderOpen, MdCloudDone, MoreFilled,
      MdPhonePortrait, MdTabletPortrait, MdDesktop, MdFunnel, MdOptions, MdTrash, MdCloudDownload,
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
      // 搜索框弹出的下拉底部的「搜索历史」(只存本机),排成横排芯片
      searchHistory: (() => {
        try { return JSON.parse(localStorage.getItem('emmSearchHistory') || '[]') } catch (e) { return [] }
      })(),
      // 输入框里此刻正在敲的内容(handleInput 实时维护);querySearch 用它判断「是不是空框」
      searchTyping: '',
      // 下拉弹层的宽度:跟搜索框一样宽(聚焦/输入时实测输入框宽度写进来)
      searchPopperWidth: 0,
      // 卡片种子的数量查询:只查当前渲染出来的卡,并发 2、间隔 500ms,结果缓存在本机
      torrentQueue: [],
      torrentPending: new Set(),
      torrentRunning: 0,
      // 下载记录右栏(与主界面同层,可拖宽)/ 种子对话框 / 收藏夹选择
      downloadPanelVisible: false,
      downloadPanelWidth: Math.min(900, Math.max(240, Number(localStorage.getItem('emmDownloadPanelWidth')) || 380)),
      downloadRecords: [],
      // 侧边详细信息(与下载记录同款右栏,内容照 JHenTai 详情页;数据是「最近点开的那本」)
      detailPanelVisible: false,
      detailPanelWidth: Math.min(900, Math.max(240, Number(localStorage.getItem('emmDetailPanelWidth')) || 340)),
      // 两个右栏(侧边详细信息 / 下载记录)的打开顺序:先开的排左边,后开的排右边
      panelOpenSeq: { detail: 0, download: 0, collection: 0 },
      collectionPanelWidth: Number((typeof localStorage !== 'undefined' && localStorage.getItem('emmCollectionPanelWidth')) || 380),
      folderTreePanelWidth: Number((typeof localStorage !== 'undefined' && localStorage.getItem('emmFolderTreePanelWidth')) || 300),
      panelSeq: 0,
      // 下载记录里感叹号弹出的错误信息:{ id, pinned }
      downloadWarn: { id: '', pinned: false },
      // H@H 归档下载弹窗(照 JHenTai 的 H@H 按钮)
      hhDialogVisible: false,
      hhDialogUrl: '',
      // 自动生成合集的对话框
      autoCollectionVisible: false,
      // 封面加载失败的任务(网络/代理挂了):{ [taskId]: true },失败就退回灰底占位,不显示破图
      failedCovers: {},
      // 在线列表:改每页数量等操作期间先压住「自动补页」,避免自激循环(改完 1 秒后恢复)
      suppressOnlineAppend: false,
      // 在线列表:正在「清空后重新加载」(排序/搜索/重新加载)。
      // 界面据此显示骨架屏,而不是继续摆着旧内容、看起来像卡死。
      onlineReloading: false,
      // 在线列表:两次自动补页的最小间隔(毫秒),防止滚动事件连发时连着打 EH
      onlineLastAppendAt: 0,
      // 补下载标签的防重入(打开面板时可能被连续调用)
      backfillTagsRunning: false,
      // 「移动到本地库」弹窗:ids = 要移动的记录,target = 选中的库文件夹(绝对路径)
      moveDialog: { visible: false, ids: [], target: '' },
      // 下载预览图片加载重试计数 / 最终失败标记 / 重拉随机数(按页码)
      previewImgRetry: {},
      previewImgFailed: {},
      previewImgNonce: {},
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
      // 一行放不下时被收进 ⋯ 的工具条目 id（顺序 = toolbarOrderIds 的相对顺序）
      toolbarCollapsedIds: [],
      // 每个条目实测宽度缓存（图标尺寸会随主题字号/像素模式变，估不准，只能量）
      toolbarWidthCache: {},
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
    // 快速编辑弹窗标题里的标签:严格「类别:标签」(被集合包含时用集合名),不用 c:/f: 这种字母
    quickTagLabel () {
      const t = this.quickTag
      if (!t) return ''
      const cat = t.cat
      const prefix = tagDisplayPrefixOf(this.setting, this.resolvedTranslation, cat, t.tag)
      return prefix + ':' + tagDisplayName(this.setting, this.resolvedTranslation, cat, t.tag)
    },
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
      'resolvedTranslation',
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
    // 能「移动」的记录:已下完(或至少不在下载中)且还没移走
    movableDownloadCount () {
      return (this.downloadRecords || []).filter(t => this.canMoveDownload(t)).length
    },
    resumableDownloadCount () {
      // 已移到库里的记录不给「继续」:它的 dir 指向库里那本书,续传会往书里写多余页
      return (this.downloadRecords || []).filter(t => !t.movedTo && ['paused', 'failed', 'waiting'].includes(t.status)).length
    },
    previewDoneCount () {
      return (this.downloadPreviewFiles || []).filter(Boolean).length
    },
    previewTotalCount () {
      return (this.downloadPreviewFiles || []).length
    },
    // 预览里「还没下好的格子」该显示成什么:
    //   done    = 已下好(正常出图,不查这里)
    //   failed  = 这一页试过且失败了(任务已停/该页已判失败)
    //   waiting = 任务正在下,这一页迟早会好(转圈)
    //   pending = 任务暂停/还没开始(时钟)
    // 首页/末页的顺序由文件序号决定,失败数按「任务失败数」从后往前扣 ——
    // EH 的失败页没有落盘记录,只能这样给用户一个诚实的近似。
    previewFailedIndexes () {
      const t = this.previewTask
      const n = (this.downloadPreviewFiles || []).length
      if (!t || !n) return []
      const failed = Math.min(Number(t.failed) || 0, n)
      const out = []
      for (let k = 0; k < failed; k++) out.push(n - 1 - k)
      return out
    },
    // 没设下载目录时,右栏给一句提示
    downloadPathMissing () {
      return !String(this.setting.downloadPath || '').trim()
    },
    // 两个右栏的左右顺序:按打开顺序排(每次打开都重新排到最右),都没开过时默认详细信息在左
    downloadTaskViews () {
      return (this.downloadRecords || []).map((task) => ({
        id: task.id,
        task,
        coverSrc: this.downloadCoverSrc(task),
        coverFailed: !!this.failedCovers[task.id],
        percent: this.downloadPercent(task),
        canMove: this.canMoveDownload(task),
        tags: this.downloadTaskTags(task),
        sizeText: this.downloadSizeText(task.bytes),
        timeText: this.downloadTimeText(task),
        statusText: this.downloadStatusText(task.status),
        hintText: this.downloadHintText(task),
        pending: task.status !== 'done',
      }))
    },
    // 预览页视图模型：页码状态/文案一次算好
    previewViews () {
      return (this.downloadPreviewFiles || []).map((f, i) => ({
        index: i,
        file: f,
        src: f ? this.previewImgSrc(f, i) : '',
        imgFailed: !!this.previewImgFailed[i],
        ready: !!f,
        state: this.previewPageState(i),
        stateText: this.previewPageStateText(i),
      }))
    },
    // 底部加载状态:在线模式下正在取下一页(触底加载的转圈)
    // 两个右栏的左右顺序:按打开顺序排(每次打开都重新排到最右),都没开过时默认详细信息在左
    // 两个右栏的左右顺序:按打开顺序排(每次打开都重新排到最右),都没开过时默认详细信息在左。
    // T04+:管理合集从底部抽屉改成第三个右栏,参与同一排序;文件夹树是独立左栏不参与。
    panelOrder () {
      const s = this.panelOpenSeq
      const right = ['detail', 'download', 'collection']
      const opened = right.filter(k => s[k])
      const rest = right.filter(k => !s[k])
      return opened.sort((a, b) => s[a] - s[b]).concat(rest)
    },
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
    // 当前「筛选属于哪个库」:EH在线 单独一份,本地每个库各一份
    filterLibKey () {
      if (this.onlineActive) return EH_ONLINE_ID
      const id = this.setting && this.setting.activeLibraryId
      return id ? String(id) : ''
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
      const plainItems = new Set(['searchInput', 'searchButton', 'sortSelect', 'uiMode', 'switchLibrary', 'filter', 'downloads', 'detailPanel'])
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
    // 搜索建议弹层的样式(宽度与搜索框等宽)。
    // 内部滚动条是 2px 的细线,会吃掉一点内容宽,这里补回去,视觉上才与搜索框严丝合缝。
    searchPopperStyle () {
      return this.searchPopperWidth ? { width: (this.searchPopperWidth + 2) + 'px' } : {}
    },
    // 工具栏按钮增减(设置里改显隐/排序)会挤压搜索框,弹层宽度要跟着重算
    toolbarOrderSignature () {
      return this.toolbarOrderIds.join('|')
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
    // 工具栏:按钮集合/顺序、编辑视图、界面语言变化都会改变按钮宽度 → 重新量一次
    toolbarOverflowSignature () {
      this.scheduleToolbarRecalc()
    },
    // 切库(或进/出 EH在线):筛选是**按库独立**的 —— 先把当前筛选存回旧库,再取新库那份
    filterLibKey (key, oldKey) {
      const store = (k, v) => { try { localStorage.setItem('emmEhFilter:' + k, JSON.stringify(v)) } catch (e) { /* 忽略 */ } }
      const read = (k) => {
        try {
          const raw = localStorage.getItem('emmEhFilter:' + k)
          return raw ? normalizeEhFilter(JSON.parse(raw)) : null
        } catch (e) { return null }
      }
      if (oldKey) store(oldKey, this.ehFilter)
      if (!key) return
      let next = read(key)
      if (!next) {
        // 这个库还没存过筛选:老版本那份全局筛选迁给第一个库,其它库一律从「无筛选」开始
        const hasAny = (() => { try { return Object.keys(localStorage).some(k => k.startsWith('emmEhFilter:')) } catch (e) { return false } })()
        next = (!hasAny && ehFilterIsActive(this.ehFilter)) ? this.ehFilter : normalizeEhFilter({})
        store(key, next)
      }
      if (JSON.stringify(next) !== JSON.stringify(this.ehFilter)) {
        this.ehFilter = next
        this.$nextTick(() => {
          if (this.onlineActive) this.loadOnlineList(true)
          else if (this.bookList && this.bookList.length) this.handleSortChange(this.sortValue, this.displayBookList)
        })
      }
    },
    'setting.coverWidth' () { this.recomputeToolbarWidth() },
    'setting.cardGapV' () { this.recomputeToolbarWidth() },
    'setting.cardGapH' () { this.recomputeToolbarWidth() },
    toolbarOrderSignature () {
      // 工具栏元素变了(增删/排序),搜索框宽度会变,弹层要跟着变
      this.$nextTick(() => this.scheduleSyncSearchPopperWidth())
    },
    // ⚠️ 这里原来被下面那个重复的 watch 段覆盖掉了(同一个对象里 watch 只能有一份),
    //    所以卡片尺寸变化后工具栏宽度其实一直没重算 —— 现在合并到一处。
    bookList (newList, oldList) {
      // EH在线 追加下一页(列表只是变长)时:不要回顶,也不要把已渲染的卡片收回去 ——
      // 用户正看到一半,列表突然弹回顶部/缩成一行就是这个原因
      this.keepScrollOnNextChunk = this.onlineActive && Array.isArray(oldList) && newList.length > oldList.length
      this.handleSortChange(this.sortValue, this.bookList)
    },
    // 两个右栏:每次打开都记一次顺序(后开的排右边);关闭不记
    detailPanelVisible (v) { if (v) this.recordPanelOpen('detail') },
    downloadPanelVisible (v) { if (v) this.recordPanelOpen('download') },
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
    // 工具栏溢出收纳:窗口 resize 会派发 resize,侧栏开合不会 → 再挂一个 ResizeObserver
    this._toolbarOnResize = () => this.scheduleToolbarRecalc()
    window.addEventListener('resize', this._toolbarOnResize)
    if (typeof ResizeObserver !== 'undefined' && this.$refs.toolbarFlexRef) {
      this._toolbarObserver = new ResizeObserver(() => this.scheduleToolbarRecalc())
      this._toolbarObserver.observe(this.$refs.toolbarFlexRef)
    }
    this.$nextTick(() => this.recalcToolbarOverflow())
    // UI 模式初始化(自动/手机/平板/电脑)与 body 标记
    this.uiMode = localStorage.getItem('emmUiMode') || 'auto'
    this.applyUiMode()
    // 标签翻译:语言选了中文就启动时把词库准备好(主进程有磁盘缓存;以前只在设置页里加载,
    // 所以打开应用后卡片上的标签一直是英文)
    this.loadTagTranslation()
    window.addEventListener('resize', this.onResize)
    // 工具栏与卡片行对齐:随窗口/封面尺寸实时重算
    this.recomputeToolbarWidth()
    this.coverResizeObserver = new ResizeObserver(() => this.recomputeToolbarWidth())
    const cardArea = document.querySelector('.book-card-area')
    if (cardArea) this.coverResizeObserver.observe(cardArea)
    window.addEventListener('resize', this.recomputeToolbarWidth)
    // 搜索框尺寸一变(缩窗口/工具栏增减/侧栏拖宽)就同步下拉弹层宽度
    this.observeSearchBox()
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
        // EH在线:滚到当前内容的真正底部才补下一页(触发判断在 appendOnlinePageIfNeeded 里,
        // 要求距底 ≤100px;补页后列表变长,必须再滚到底才会补下一批 —— 不会连发)
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
    clearTimeout(this._toolbarRecalcTimer)
    clearTimeout(this._toolbarRecalcTimer2)
    if (this._toolbarOnResize) window.removeEventListener('resize', this._toolbarOnResize)
    if (this._toolbarObserver) { this._toolbarObserver.disconnect(); this._toolbarObserver = null }
    window.removeEventListener('keydown', this.resolveKey)
    window.removeEventListener('wheel', this.resolveWheel)
    window.removeEventListener('mousedown', this.resolveMouseDown)
    if (this.pixelSfxDetach) { this.pixelSfxDetach(); this.pixelSfxDetach = null }
    if (this.antiCopyHandler) {
      for (const ev of ['copy', 'cut', 'selectstart', 'dragstart']) document.removeEventListener(ev, this.antiCopyHandler, true)
      this.antiCopyHandler = null
    }
    clearTimeout(this.mixBgTimer)
    clearTimeout(this._onlineReloadGuard)
    if (this._searchBoxObserver) { this._searchBoxObserver.disconnect(); this._searchBoxObserver = null }
    if (this._searchPopperRaf) { cancelAnimationFrame(this._searchPopperRaf); this._searchPopperRaf = null }
    clearTimeout(this._searchPopperTimer)
  },
  methods: {
    // 取标签翻译词库(主进程下载 + 缓存)。失败就保持原始标签,不打扰用户。
    async loadTagTranslation () {
      try {
        const st = this.setting || {}
        if (!st.tagTargetLang && !st.showTranslation) return
        const res = await ipcRenderer.invoke('load-tag-translation', {})
        if (res && res.ok && res.data) {
          useAppStore().resolvedTranslation = res.data
          // 词库到位后,把库里所有标签的中文名写进「标签名称」(只补空的)
          this.backfillLibraryTagNames()
        }
      } catch (e) { /* 忽略 */ }
    },
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
        // 工具栏宽度变了 → 搜索框宽度跟着变 → 弹层也要跟着变
        this.scheduleSyncSearchPopperWidth()
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
      // 'light deprecated1' 放在末尾：不打断现有循环顺序，只是多停一站
      const themes = ['dark', 'light', 'dark exhentai', 'light e-hentai', 'nhentai', 'custom', 'light deprecated1']
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
    // 工具栏按钮溢出收纳:
    //   旧版页头是一行 nowrap + overflow:hidden —— 按钮一多就被裁掉且**没有任何提示**,
    //   搜索框还会被 flex 压到 120px 底线。这里加一层「量宽度 → 末尾收进 ⋯」。
    //   ⋯ 菜单里的项与工具栏上的按钮同顺序、同图标、同动作。
    //
    // 永不收纳(与重构版 AppHeader 的 PINNED 一致):设置(随时要能进)、排序复合控件(主操作)、
    // 搜索框与搜索按钮(中段主操作)。其余按渲染顺序从末尾往前收。
    toolbarPinnedIds () {
      return ['setting', 'sortSelect', 'searchInput', 'searchButton']
    },
    // 搜索框的体验底线:低于这个宽度就把右侧按钮收起来,而不是继续压搜索框。
    // 与 .toolbar-flex .search-input 的 min-width:120px 是同一个口径。
    toolbarSearchMinWidth () {
      return 120
    },
    // ⋯ 菜单项的 i18n 文案:与模板里各分支的 :title 一一对应
    toolbarMenuItemTitle (id) {
      const map = {
        searchButton: 'm.search',
        filter: 'm.filterButton',
        downloads: 'm.downloads',
        detailPanel: 'm.sideDetail',
        uiMode: 'm.switchUiMode',
        setting: 'm.setting',
        switchLibrary: 'm.switchLibraryCurrent',
        searchInput: 'm.search',
        sortSelect: 'm.sort_filter'
      }
      if (map[id]) return this.$t(map[id])
      const def = this.toolbarButtonMap[id]
      return def ? this.$t(def.titleKey) : this.$t('m.more')
    },
    // ⋯ 菜单项的图标:普通按钮直接复用 toolbarButtonMap,特殊分支单独映射
    toolbarMenuItemIcon (id) {
      if (id === 'filter') return MdOptions
      if (id === 'downloads') return MdCloudDownload
      if (id === 'detailPanel') return InfoFilled
      if (id === 'uiMode') return this.uiModeIcon
      if (id === 'switchLibrary') return this.switchLibraryIcon
      if (id === 'setting') return SettingIcon
      if (id === 'searchButton') return Search32Filled
      const def = this.toolbarButtonMap[id]
      return def ? def.icon : null
    },
    // ⋯ 菜单项的动作:必须与模板里对应分支的 @click 完全一致
    runToolbarAction (id) {
      switch (id) {
        case 'searchButton': return this.searchBook()
        case 'filter': this.ehFilterVisible = true; return
        case 'downloads': return this.toggleDownloadDrawer()
        case 'detailPanel': this.detailPanelVisible = !this.detailPanelVisible; return
        case 'uiMode': return this.switchUiMode()
        case 'setting':
          if (this.$refs.SettingRef) this.$refs.SettingRef.dialogVisibleSetting = true
          return
        case 'switchLibrary': return this.switchBox()
        default: {
          const def = this.toolbarButtonMap[id]
          if (def && typeof def.action === 'function') def.action()
        }
      }
    },
    // resize / 侧栏开合都会改变可用宽度,统一走 80ms 防抖
    scheduleToolbarRecalc () {
      clearTimeout(this._toolbarRecalcTimer)
      clearTimeout(this._toolbarRecalcTimer2)
      this._toolbarRecalcTimer = setTimeout(() => { this.recalcToolbarOverflow() }, 80)
      // .toolbar-flex 的 width 带 300ms 过渡（见它的 transition: width .3s ease）：
      // 过渡途中 clientWidth 是**中间值**，只算一次会把「动画还没走完」当成真实宽度，
      // 于是多收几个按钮、而且不会自己回来。过渡结束之后再算一次。
      this._toolbarRecalcTimer2 = setTimeout(() => { this.recalcToolbarOverflow() }, 420)
    },
    /**
     * 重新计算「末尾哪几个条目要收进 ⋯」。
     * 宽度全部取实测值并缓存:图标尺寸会随主题字号/像素模式变,估出来的值一定不准。
     * 1) 若有条目还没量过(刚在设置里启用),先全部展开量一遍;
     * 2) 用缓存算「固定项 + 搜索框底线 + gap」是否超过容器宽;
     * 3) 超了就从末尾往前收,直到「剩下的 + ⋯ 自己」放得下。
     */
    // 收纳算法（v3，全真实测量）：不做任何宽度估算/缓存。
    // 每一步都以 row.scrollWidth vs clientWidth 的真实布局为准：
    //   ① 全展开量自然状态；② 真溢出才收（从末尾往前，每收一个确认一次）；
    //   ③ 有余量则尝试放回（防止过度收纳）。⋯ 按钮随 collapsedIds 渲染，
    //   收纳判断里天然包含它自己的宽度，因此「⋯ 自己被裁掉」在结构上不再可能。
    async recalcToolbarOverflow () {
      if (this._toolbarMeasuring) { this._toolbarRecalcQueued = true; return }
      this._toolbarMeasuring = true
      try {
        const row = this.$refs.toolbarFlexRef
        if (!row) return
        const ids = this.toolbarOrderIds || []
        const clear = () => { if (this.toolbarCollapsedIds.length) this.toolbarCollapsedIds = [] }
        if (!ids.length) { clear(); return }
        // 移动端（wrap 布局）本来就不溢出，跳过收纳
        if (getComputedStyle(row).flexWrap === 'wrap') { clear(); return }
        const pinned = this.toolbarPinnedIds()
        const overflow = () => row.scrollWidth > row.clientWidth + 1
        // ① 全部展开，量自然宽度
        clear()
        await this.$nextTick()
        // ② 没溢出就完事
        if (!overflow()) return
        // ③ 从末尾往前收，每收一个用真实布局确认
        const hidden = []
        let guard = 0
        while (overflow() && guard++ <= ids.length) {
          let picked = null
          for (let i = ids.length - 1; i >= 0; i--) {
            if (!pinned.includes(ids[i]) && !hidden.includes(ids[i])) { picked = ids[i]; break }
          }
          if (!picked) break
          hidden.push(picked)
          const next = hidden.slice().sort((a, b) => ids.indexOf(a) - ids.indexOf(b))
          this.toolbarCollapsedIds = next
          await this.$nextTick()
        }
        // ④ 收缩：有余量就放回「最靠近末尾」的一个，放不下即停
        let restore = 0
        while (this.toolbarCollapsedIds.length && restore++ <= ids.length) {
          const candidate = this.toolbarCollapsedIds[this.toolbarCollapsedIds.length - 1]
          const next = this.toolbarCollapsedIds.filter(id => id !== candidate)
          this.toolbarCollapsedIds = next
          await this.$nextTick()
          if (overflow()) {
            next.push(candidate)
            next.sort((a, b) => ids.indexOf(a) - ids.indexOf(b))
            this.toolbarCollapsedIds = next
            await this.$nextTick()
            break
          }
        }
      } finally {
        this._toolbarMeasuring = false
        // 测量期间又有新的 resize 进来 → 排队补算一次，保证最终状态正确
        if (this._toolbarRecalcQueued) {
          this._toolbarRecalcQueued = false
          this.recalcToolbarOverflow()
        }
      }
    },

    async switchBox () {
      // ⚠ 这里**不能**无条件置 loading:这个函数有好几条提前 return 的路
      //   (只有一条框 / 切到 EH在线 / 已经在 EH在线),那些路径根本不加载列表,
      //   置了不还原 → 工具栏按钮**永远转圈**(线上就是"一直转圈"这个死现象)。
      //   所以 loading 只在「确实要拉列表」的分支里打开,由 loadBookList 自己收尾。
      const boxes = this.switchBoxes
      const n = boxes.length
      // ①「EH在线」已经勾进某个切换框:完全按框循环(勾进哪个框,切到那个框就显示在线漫画)
      if (this.ehOnlineInAnyBox) {
        if (n <= 1) {
          this.$message.info(this.$t('m.switchBoxNeedMore'))
          return
        }
        const next1 = ((this.activeBoxIndex + 1) % n + n) % n
        // 先把「当前框」切过去(按钮/标题立刻变),后端切换与加载随后进行 ——
        // 以前要等 set-active-box + loadBookList 都回来才有反应,切库像卡住了
        const prevBoxIndex = this.activeBoxIndex
        this.setting.activeBoxIndex = next1
        try {
          // ★ 5 秒兜底:后端在 NAS 上卡住时不能让界面永远不动 ——
          //   超时也照样刷新列表(后端 setting 已改,列表会按新库读)。
          const res = await Promise.race([
            ipcRenderer.invoke('set-active-box', { index: next1 }),
            new Promise((resolve) => setTimeout(() => resolve({ ok: true, activeChanged: true, timeout: true }), 5000)),
          ])
          if (res && res.ok) {
            this.setting.activeBoxIndex = res.activeBoxIndex
            this.setting.activeLibraryId = res.activeLibraryId
            this.setting.library = res.library
            if (res.activeChanged) {
            // ★ 先清空旧列表再拉新库:以前直接 loadBookList() 但不清空,
            //   用户看到的一直是**上一个库的书**,以为"切了但还是本界面"。
            //   ⚠ loading 不在这里置:交给 loadBookList 自己管,它每条路径都会收尾。
            this.bookList = []
            this.chunkDisplayBookList = []
            this.loadBookList()   // 不 await:界面先切好,列表随后填
          }
          } else {
            this.setting.activeBoxIndex = prevBoxIndex   // 失败回滚
            this.$message.error((res && res.error) || this.$t('m.librarySaveFailed'))
          }
        } catch (e) {
          this.setting.activeBoxIndex = prevBoxIndex
          this.$message.error(String((e && e.message) || e))
        }
        return
      }
      // ② 没勾进任何框:保持「循环末尾临时多一站 EH在线」的旧行为
      if (this.onlineActive) {
        // 从 EH在线 回到第一个框:界面立刻回落(先把列表清空显示 loading),后端切换在后台做
        this.onlineStopActive = false
        this.bookList = []
        this.chunkDisplayBookList = []
        if (n) {
          ipcRenderer.invoke('set-active-box', { index: 0 }).then(res => {
            if (res && res.ok) {
              this.setting.activeBoxIndex = res.activeBoxIndex
              this.setting.activeLibraryId = res.activeLibraryId
              this.setting.library = res.library
            }
            this.loadBookList()
          }).catch(() => { this.loadBookList() })
        } else {
          this.loadBookList()
        }
        return
      }
      if (this.ehOnlineAvailable && (n === 0 || this.activeBoxIndex + 1 >= n)) {
        // 最后一个框的下一个就是 EH在线:只切前端状态,后端仍停在原来的框(回来时不用重建运行时)
        // ⚠ 这条路**不加载列表**:必须显式收掉 loading,否则按钮一直转圈
        this.onlineStopActive = true
        this.buttonLoadBookListLoading = false
        return
      }
      if (n <= 1) {
        this.$message.info(this.$t('m.switchBoxNeedMore'))
        return
      }
      // 前端算好「下一条框」的序号再传给后端:避免前后端状态不同步时「点了没反应」
      const next = ((this.activeBoxIndex + 1) % n + n) % n
      const prevIndex = this.activeBoxIndex
      this.setting.activeBoxIndex = next      // 先切界面
      try {
        const res = await ipcRenderer.invoke('set-active-box', { index: next })
        if (res && res.ok) {
          this.setting.activeBoxIndex = res.activeBoxIndex
          this.setting.activeLibraryId = res.activeLibraryId
          this.setting.library = res.library
          if (res.activeChanged) {
            // 同上一处:切库先清空;loading 交给 loadBookList 自己管
            this.bookList = []
            this.chunkDisplayBookList = []
            this.loadBookList()    // 后加载
          }
        } else {
          this.setting.activeBoxIndex = prevIndex
          this.$message.error((res && res.error) || this.$t('m.librarySaveFailed'))
        }
      } catch (e) {
        this.setting.activeBoxIndex = prevIndex
        this.$message.error(String((e && e.message) || e))
      }
    },
    async loadBookList (scan) {
      // EH在线:没有本地书可扫,数据改成从 EH 取,然后照样塞进书架原本的数据流
      if (this.onlineActive) {
        if (scan) this.$message.info(this.$t('m.ehOnlineScanUnsupported'))
        // scan(工具栏「重新加载」)= 真的重拉;切库/切界面回来 = 用手上这份(见 loadOnlineList)
        this.loadAllTags()
        await this.loadOnlineList(!!scan)
        // ⚠ 在线分支也要把 loading 收掉:否则切到 EH 在线后按钮一直转圈
        this.buttonLoadBookListLoading = false
        return
      }
      // 顺带刷新全局标签列表(设置 → 标签 用)
      this.loadAllTags()
      // ★ 竞态序号:连点两次切库时,先发的那次可能后回来,把新库的数据覆盖掉。
      //   每次进来取一个新序号,await 回来后对不上就直接丢弃。
      const seq = (this._libLoadSeq || 0) + 1
      this._libLoadSeq = seq
      try {
        this.buttonLoadBookListLoading = true
        if (scan) this.scanning = true
        const res = await ipcRenderer.invoke('load-book-list', scan)
        // ⚠ 过期响应要**先复位 loading 再 return**:
        //   以前这里直接 return,loading 永远停在 true → 工具栏一直转圈。
        //   (连点两次切库、或切库时又点了重新加载,都会走到这里)
        if (seq !== this._libLoadSeq) {
          this.buttonLoadBookListLoading = false
          return
        }
        const bookList = this.prepareBookList(res)
        // ★ 首屏立刻出:以前这里还要 await 两件事(拉整份收藏、算 1.4 万条的文件夹树),
        //   等于切库额外多两次 IPC 往返 + 一棵大树。它们不影响首屏显示,挪到 $nextTick 后台跑。
        this.bookList = bookList
        this.buttonLoadBookListLoading = false
        // 词库比书先到(启动时 loadTagTranslation 是并行的):列表就绪后再补一次标签名称,
        // 否则第一次启动时 bookList 还是空的,一条名字都写不进去
        if (this.resolvedTranslation && Object.keys(this.resolvedTranslation).length) this.backfillLibraryTagNames()
        this.$nextTick(async () => {
          try {
            await this.loadCollectionList(bookList)
            await this.$refs.FolderTreeRef.geneFolderTree()
            this.$refs.FolderTreeRef.resetSelect()
            this.$refs.EditViewRef.selectBookList = []
          } catch (e) { /* 后台这两步失败不打扰:首屏已经出来了 */ }
        })
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
          this.chunkList(true)
          break
        case 'collection':
          this.displayBookList = _.filter(allBooks, 'isCollection')
          this.chunkList(true)
          break
        case 'hidden':
          this.displayBookList = _.filter(allBooks, 'hiddenBook')
          this.chunkList(true)
          break
        case 'recentRead': {
          // 历史(JHenTai 的做法):记录里存了画廊快照,所以**不在当前库里也能显示**
          // (换了库、文件被删、在线画廊只取过一页 —— 都能在历史里看到并点开)
          const inLibrary = new Map(this.bookList.map(b => [b.id, b]))
          // 「本地 / EH在线」按当前库自动分开:EH在线 库下选历史 = 只看在线浏览记录,
          // 本地库下选历史 = 只看本地记录(用户要求,不手动切范围)
          const isOnlineRecord = (rec) => {
            const local = inLibrary.get(rec.id)
            if (local) return !!local.online
            return !!(rec.snap && rec.snap.online)
          }
          const records = fetchRecentReadRecords()
            .filter(rec => this.onlineActive ? isOnlineRecord(rec) : !isOnlineRecord(rec))
          this.displayBookList = this.applyEhFilter(_.uniqBy(records.map(rec => {
            const local = inLibrary.get(rec.id)
            if (local) return { ...local, historyTime: rec.read_time }
            const snap = rec.snap
            if (!snap) return null
            return { ...snap, id: rec.id, historyTime: rec.read_time, fromHistory: true }
          }).filter(Boolean), 'id'))
          // ⚠️ 这里必须自己 chunkList():上面几个 case 各自都调了,这一个是花括号块,
          //    漏掉就整块显示不出来(历史列表看着「点了没反应」就是这里漏的)
          this.chunkList(true)
          break
        }
        case 'shuffle':
          this.displayBookList = _.shuffle(bookList)
          this.chunkList(true)
          break
        case 'addAscend':
          this.displayBookList = bookList.toSorted(this.sortList('date')).toReversed()
          this.chunkList(true)
          break
        case 'addDescend':
          this.displayBookList = bookList.toSorted(this.sortList('date'))
          this.chunkList(true)
          break
        case 'mtimeAscend':
          this.displayBookList = bookList.toSorted(this.sortList('mtime')).toReversed()
          this.chunkList(true)
          break
        case 'mtimeDescend':
          this.displayBookList = bookList.toSorted(this.sortList('mtime'))
          this.chunkList(true)
          break
        case 'postAscend':
          this.displayBookList = bookList.toSorted(this.sortList('posted')).toReversed()
          this.chunkList(true)
          break
        case 'postDescend':
          this.displayBookList = bookList.toSorted(this.sortList('posted'))
          this.chunkList(true)
          break
        case 'scoreAscend':
          this.displayBookList = bookList.toSorted(this.sortList('rating')).toReversed()
          this.chunkList(true)
          break
        case 'scoreDescend':
          this.displayBookList = bookList.toSorted(this.sortList('rating'))
          this.chunkList(true)
          break
        case 'readCountAscend':
          this.displayBookList = bookList.toSorted(this.sortList('readCount')).toReversed()
          this.chunkList(true)
          break
        case 'readCountDescend':
          this.displayBookList = bookList.toSorted(this.sortList('readCount'))
          this.chunkList(true)
          break
        case 'artistAscend':
          this.displayBookList = bookList.toSorted(this.sortList('tags.artist')).toReversed()
          this.chunkList(true)
          break
        case 'artistDescend':
          this.displayBookList = bookList.toSorted(this.sortList('tags.artist'))
          this.chunkList(true)
          break
        case 'titleAscend':
          this.displayBookList = bookList.toSorted((a, b) => this.getDisplayTitle(b).localeCompare(this.getDisplayTitle(a), undefined, {numeric: true, sensitivity: 'base'})).toReversed()
          this.chunkList(true)
          break
        case 'titleDescend':
          this.displayBookList = bookList.toSorted((a, b) => this.getDisplayTitle(b).localeCompare(this.getDisplayTitle(a), undefined, {numeric: true, sensitivity: 'base'}))
          this.chunkList(true)
          break
        case 'pageAscend':
          this.displayBookList = bookList.toSorted(this.sortList('pageCount')).toReversed()
          this.chunkList(true)
          break
        case 'pageDescend':
          this.displayBookList = bookList.toSorted(this.sortList('pageCount'))
          this.chunkList(true)
          break
        default:
          this.displayBookList = allBooks
          this.chunkList(true)
          break
      }
      // 同步排序状态(pinia),否则排序下拉/方向箭头读取不到当前值
      this.sortValue = val
      localStorage.setItem('sortValue', val)
    },
    querySearch (queryString, callback) {
      // 用自己记的实时输入值:el-autocomplete 聚焦时喂进来的是「上次搜索的值」,不是正在敲的内容
      const typed = String(this.searchTyping || queryString || '')
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
      // 搜索历史不进这个竖向列表(它在弹层底部的横排里,见 .search-history-panel)。
      // 但 el-autocomplete 的弹层只有「建议列表非空」时才显示,历史面板挂在它的 footer 上,
      // 所以列表为空时补一条提示项把弹层撑出来。
      // 有历史时就一定补(否则一聚焦看不到历史);没历史时只在敲了字、又没有标签匹配时补。
      const q0 = typed.trim()
      const hasHistory = (this.searchHistory || []).length > 0
      if (!result.length && hasHistory) {
        // 只为让弹层弹出来(Element 建议列表为空就不弹),这一行在样式里被隐藏、不显示任何文字
        result = [{ value: '', label: '', isHistoryPlaceholder: true }]
      }
      callback(result)
    },
    // 记住搜索词(搜索框下方那一横排历史,只存本机)
    // 下拉里现在只剩标签建议,选中即写进搜索框
    onSearchSuggestSelect (item) {
      if (!item || item.isHistoryPlaceholder) return
      if (item.value) this.searchString = String(item.value)
    },
    // 弹层宽度跟搜索框对齐(Element 默认只保证「不小于」输入框宽度,这里强制等宽)
    // 注意:$el 本身就是 .search-input,querySelector 查不到自己,要单独判断
    syncSearchPopperWidth () {
      const root = this.$refs.searchInputRef
      const el = Array.isArray(root) ? root[0]?.$el : root?.$el
      const box = (el && el.matches && el.matches('.search-input'))
        ? el
        : (el?.querySelector?.('.search-input') || document.querySelector('.search-input'))
      const w = box ? Math.round(box.getBoundingClientRect().width) : 0
      if (w && w !== this.searchPopperWidth) this.searchPopperWidth = w
    },
    // 窗口/布局变化时跟着重算弹层宽度。
    // 说明:弹层开着时把宽度改掉,Element 的定位器不会自己重排,所以要「先量、再下一帧量」各来一次。
    scheduleSyncSearchPopperWidth () {
      if (this._searchPopperRaf) cancelAnimationFrame(this._searchPopperRaf)
      this._searchPopperRaf = requestAnimationFrame(() => {
        this._searchPopperRaf = null
        this.syncSearchPopperWidth()
      })
      clearTimeout(this._searchPopperTimer)
      this._searchPopperTimer = setTimeout(() => this.syncSearchPopperWidth(), 120)
    },
    // 直接盯住搜索框自身的尺寸变化:窗口缩放、工具栏按钮增减、侧栏拖宽都会触发,
    // 比监听 window resize 更可靠(有些变化不会派发 resize 事件)。
    observeSearchBox () {
      const root = this.$refs.searchInputRef
      const el = Array.isArray(root) ? root[0]?.$el : root?.$el
      const box = (el && el.matches && el.matches('.search-input'))
        ? el
        : (el?.querySelector?.('.search-input') || document.querySelector('.search-input'))
      if (!box || this._searchBoxObserver) return
      this._searchBoxObserver = new ResizeObserver(() => this.scheduleSyncSearchPopperWidth())
      this._searchBoxObserver.observe(box)
      this.syncSearchPopperWidth()
    },
    // ---------- 搜索历史横排(在下拉弹层底部):点芯片直接搜 ----------
    // 点历史芯片 = 直接搜(JHenTai 点历史芯片就是这个动作)
    applySearchHistory (s) {
      this.searchString = String(s || '')
      this.searchTyping = this.searchString
      this.searchBook()
      this.closeSearchPopper()
    },
    // 收起搜索建议弹层。
    // 不能只靠失焦:芯片就在弹层里,点它焦点仍在弹层内容中,Element 判定「焦点还在浮层内」就不会关。
    // 搜索框写在 v-for 里,ref 会被收集成数组,这里两种都兼容。
    closeSearchPopper () {
      const refs = this.$refs.searchInputRef
      const comp = Array.isArray(refs) ? refs[0] : refs
      try { comp?.close?.() } catch (e) { /* 忽略 */ }
      const input = this.$el?.querySelector?.('.search-input input')
      if (input) input.blur()
    },
    // 删掉一条搜索历史(芯片右侧的 ✕)
    removeSearchHistory (s) {
      this.searchHistory = (this.searchHistory || []).filter(x => x !== s)
      try { localStorage.setItem('emmSearchHistory', JSON.stringify(this.searchHistory)) } catch (e) { /* 忽略 */ }
    },
    clearSearchHistory () {
      this.searchHistory = []
      try { localStorage.removeItem('emmSearchHistory') } catch (e) { /* 忽略 */ }
      this.printMessage('success', this.$t('m.searchHistoryCleared'))
    },
    rememberSearch (s) {
      const v = String(s || '').trim()
      if (!v) return
      // 最多留 500 条(去重后最新的排最前)
      this.searchHistory = [v, ...(this.searchHistory || []).filter(x => x !== v)].slice(0, 500)
      try { localStorage.setItem('emmSearchHistory', JSON.stringify(this.searchHistory)) } catch (e) { /* 忽略 */ }
    },
    handleSearchStringChange (val) {
      this.searchTyping = String(val || '')
      if (!val) {
        this.searchString = ''
        this.handleSortChange(this.sortValue, this.bookList)
      }
    },
    handleInput (val) {
      this.searchTyping = String(val || '')
      this.syncSearchPopperWidth()
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
        // 先清空再取:旧结果留在屏幕上等新结果,看起来就是「点了没反应/卡死」
        this.clearOnlineListForReload()
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
      // 搜索语法里也不再用 f:/m:/a: 这种字母前缀(用户要求):直接按标签名精确匹配
      this.searchString = `"${tag}"$`
      this.searchBook()
    },
    // ---------- 可配置点击策略(设置 → 高级设置):详细界面 / 内容界面 / 缩略图 ----------
    runClickAction (action, book) {
      if (!book) return
      // 侧边详细信息开着时,「详细界面」临时变成「侧边详细信息」—— 关掉面板就自动恢复
      // (不改设置里存的值,只是当前生效行为切换)
      if (action === 'detail' && this.detailPanelVisible) action = 'sideDetail'
      // EH在线:不是本地书 —— 「缩略图」没有意义,所以 内容/缩略图 都走在线阅读;详细界面照旧
      if (book.online) {
        if (action === 'none') return
        if (action === 'detail') this.$refs.BookDetailDialogRef.openBookDetail(book)
        else if (action === 'sideDetail') this.openSideDetail(book)
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
        case 'sideDetail':
          this.openSideDetail(book)
          break
        default:
          this.$refs.BookDetailDialogRef.openBookDetail(book)
          break
      }
    },
    // 打开侧边详细信息(点击策略 / 面板自身的入口都走这)
    openSideDetail (book) {
      if (!book) return
      this.bookDetail = book
      this.detailPanelVisible = true
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
    // 重排「当前页」的卡片。
    // keepPage=true 时沿用现在的页码与滚动位置(排序/筛选/数据变长都属于这一类:
    // 用户正停在第 3 页,不该被弹回第 1 页顶部 —— 那是本轮要修的 bug);
    // keepPage=false 才回第 1 页(切库、换搜索词这种「换了整个列表」的操作)。
    chunkList (keepPage = false) {
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
      if (keepPage) {
        // 页码按新的总数重新夹一次(筛选后变短时,原来的第 9 页可能已经不存在)
        const pageLimit = Math.max(1, Math.ceil((this.displayBookCount || 0) / (Number(this.setting.pageSize) || 42)))
        const page = Math.min(Math.max(1, Number(this.currentPage) || 1), pageLimit)
        if (page !== this.currentPage) this.currentPage_ = page
        const area = document.querySelector('.book-card-area')
        const keepTop = area ? area.scrollTop : 0
        this.renderedCount = this.renderBatchSize
        this.chunkDisplayBookList = this.customChunk(this.displayBookList, this.setting.pageSize, page - 1)
        // 排序/筛选变了但页码没变:滚动位置也留着,别跳一下
        this.$nextTick(() => {
          const el = document.querySelector('.book-card-area')
          if (el && keepTop) el.scrollTop = Math.min(keepTop, Math.max(0, el.scrollHeight - el.clientHeight))
          if (el && el.scrollHeight <= el.clientHeight + 200) this.renderedCount += this.renderBatchSize
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
      // EH在线:每页数量改了,按需再补几页 EH 数据。
      // ⚠ 改页数量时列表很短(或刚好在底部),「滚到底自动加载」的判定会一直成立 ——
      //   补一页 → 重排回顶 → 又判定到底 → 再补一页,就成了「一直加载个不停」。
      //   所以这一小段时间里先关掉自动补页,只做一次有上限的补齐。
      if (this.onlineActive) {
        this.suppressOnlineAppend = true
        Promise.resolve(this.loadOnlineList()).finally(() => {
          setTimeout(() => { this.suppressOnlineAppend = false }, 1200)
        })
      }
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
            { id: 'downloadGallery', label: this.$t('m.downloadGallery'), onClick: () => this.openDownloadDialog(book) },
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
      // 窗口大小变了,搜索框宽度也会变 → 下拉弹层要跟着变
      this.scheduleSyncSearchPopperWidth()
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
      this.recordPanelOpen('collection')
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
      // 按库保存:换库回来还是这一套筛选
      try { if (this.filterLibKey) localStorage.setItem('emmEhFilter:' + this.filterLibKey, JSON.stringify(this.ehFilter)) } catch (e) { /* 忽略 */ }
      // 关键词走软件原本的搜索栏(本地按本地语法解析,EH在线 就是 EH 的 f_search)
      const kw = String(this.ehFilter.keyword || '').trim()
      if (kw && kw !== this.searchString) {
        this.searchString = kw
        this.searchBook(false)   // searchBook 结尾会走 handleSortChange → 就地过滤
      } else if (this.onlineActive) {
        // 先在当前列表上就地过滤(点确定立刻见效),再去 EH 重新取一遍
        this.handleSortChange(this.sortValue, this.bookList)
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
        if (r && r.ok) {
          this.downloadRecords = r.tasks || []
          // 记录里已有标签的,顺手把词库里的中文名写进「标签名称」(只写缺的那些)
          for (const t of this.downloadRecords) if (t && t.tags) this.writeTagTranslations(t.tags)
          // 重新拉记录(打开面板/移动作完)时把「封面失败」标记清掉:网络恢复了就该重新出图
          this.failedCovers = {}
          // 老记录(下载那会儿还没存标签)现拉一次详情补上,一次最多 3 条,别一下打爆 EH
          this.backfillDownloadTags()
        }
      } catch (e) { /* 忽略 */ }
    },
    // 给「没有标签」的下载记录补标签:拉一次画廊详情 → 存回主进程的记录里(downloads.json)
    async backfillDownloadTags () {
      if (this.backfillTagsRunning) return
      this.backfillTagsRunning = true
      try {
        const todo = (this.downloadRecords || []).filter(t =>
          t && t.url && (!t.tags || !Object.keys(t.tags || {}).length)
        ).slice(0, 3)
        for (const task of todo) {
          try {
            const host = String(task.url).replace(/^https?:\/\//i, '').split('/')[0] || EX_HOST
            const detail = parseGalleryDetail(await this.fetchExHtml(task.url), host)
            if (detail && detail.ok) {
              const r = await ipcRenderer.invoke('eh-download-set-tags', {
                id: task.id,
                tags: detail.tags || {},
                category: detail.category || '',
                titleJpn: detail.titleJpn || '',
                rating: Number(detail.rating) || 0
              })
              if (r && r.ok && r.task) {
                this.writeTagTranslations(r.task.tags)
                this.upsertDownloadRecord(r.task)
              }
            }
          } catch (e) { /* 代理/网络不通就下次再说 */ }
        }
      } finally {
        this.backfillTagsRunning = false
      }
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
    // 通用面板拖宽（T04+）：合集面板 / 文件夹树共用。key = data 里的宽度字段名。
    // dir=1 向右拖变宽（右侧面板），dir=-1 向右拖变窄（左侧面板）。
    startDockResize (e, key, min, dir) {
      e.preventDefault()
      const startX = e.clientX
      const startW = this[key]
      const d = dir || 1
      const onMove = (ev) => {
        const next = startW + d * (startX - ev.clientX)
        this[key] = Math.max(min, Math.min(next, Math.max(min + 80, window.innerWidth - 420)))
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        try { localStorage.setItem('emm' + key.charAt(0).toUpperCase() + key.slice(1), String(this[key])) } catch (err) { /* 忽略 */ }
        this.recomputeToolbarWidth()
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    onFolderTreeWidthChange (w) {
      this.folderTreePanelWidth = Math.min(600, Math.max(220, Number(w) || 300))
      try { localStorage.setItem('emmFolderTreePanelWidth', String(this.folderTreePanelWidth)) } catch (e) { /* 忽略 */ }
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
      // 先把「整本有多少页」摆出来(哪怕一张都还没下、目录还没解析出来),
      // 之后每次刷新只替换内容,格子数量不变 —— 这就是「全部图片都在位」。
      this.downloadPreviewFiles = Array.from({ length: Math.max(0, Number(task.total) || 0) }, () => null)
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
        const r = await ipcRenderer.invoke('eh-download-files', {
          dir: t.dir || '', total: t.total || 0, id: t.id
        })
        // 用户可能已经切走/关掉预览了,回来别把旧的糊上去
        if (!this.previewTask || this.previewTask.id !== t.id) return
        // 后端会把「任务已知的总页数」一起带回来 —— 以它为准重建定长数组,
        // 没下好的页就是 null,前端照样给它留一格(不再凭空少一块)。
        // 「重新下载」刚把计数归零(total=0)的那一下也按当前格子数兜底,
        // 免得整页格子突然全消失,等页链接收回来再自然变多。
        const files = (r && Array.isArray(r.files)) ? r.files : []
        const expect = Math.max(
          Number(r && r.total) || 0,
          Number(t.total) || 0,
          files.length,
          (this.downloadPreviewFiles || []).length
        )
        const out = files.slice(0, Math.max(expect, files.length))
        while (out.length < expect) out.push(null)
        this.downloadPreviewFiles = out
        // 顺带把这条任务的最新状态并回列表(目录是后端解析出来的)
        if (r && r.task) {
          this.upsertDownloadRecord(r.task)
          if (this.previewTask && this.previewTask.id === r.task.id) this.previewTask = r.task
        }
      } catch (e) { /* 忽略 */ }
    },
    // 预览格子的状态:已下好 / 失败 / 下载中 / 未开始
    previewPageState (index) {
      if ((this.downloadPreviewFiles || [])[index]) return 'done'
      if ((this.previewFailedIndexes || []).includes(index)) return 'failed'
      const status = this.previewTask && this.previewTask.status
      if (status === 'downloading') return 'waiting'
      if (status === 'failed' || status === 'done') return 'failed'
      return 'pending'
    },
    // 占位格下面那行字:告诉用户这一页是在等、在下,还是已经判失败了
    previewPageStateText (index) {
      const state = this.previewPageState(index)
      if (state === 'failed') return this.$t('m.downloadStatusFailed')
      if (state === 'waiting') return this.$t('m.downloadStatusDownloading')
      if (state === 'pending') {
        const status = this.previewTask && this.previewTask.status
        return status === 'paused' ? this.$t('m.downloadStatusPaused') : this.$t('m.downloadStatusWaiting')
      }
      return ''
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
    // 类别本地化:Options API 的模板拿不到 import,必须过一层 method
    galleryCategoryName (cat) {
      return galleryCategoryNameOf(cat, this.$t)
    },
    // 把库里全部书的标签名称补齐(词库加载完后调用;只落盘一次)
    backfillLibraryTagNames () {
      let changed = false
      for (const b of (this.bookList || [])) {
        if (b && b.tags && this.writeTagTranslations(b.tags, false)) changed = true
      }
      if (changed) ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(this.setting)))
      return changed
    },
    // 下载任务的标签到手后,把词库里的名字自动写进「标签名称」里(键:分类::标签)。
    // 这样标签语言下拉切到哪个语言,任务记录/卡片/详情就都显示那个语言(词库只有中文,其它语言回退原名)。
    writeTagTranslations (tags, save = true) {
      const tr = this.resolvedTranslation || {}
      if (!tags || typeof tags !== 'object') return
      if (!this.setting.tagNameLangs) this.setting.tagNameLangs = {}
      let changed = false
      for (const [ns, arr] of Object.entries(tags)) {
        if (!Array.isArray(arr)) continue
        const rec = tr[ns] || {}
        for (const t of arr) {
          const name = String(t || '').trim()
          if (!name) continue
          const hit = rec[name]
          const zh = hit && hit.name
          if (!zh) continue
          const key = ns + '::' + name
          const cur = this.setting.tagNameLangs[key] || {}
          if (cur['zh-CN']) continue
          this.setting.tagNameLangs[key] = { ...cur, 'zh-CN': zh }
          changed = true
        }
      }
      if (changed && save) ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(this.setting)))
      return changed
    },
    upsertDownloadRecord (task) {
      if (!task || !task.id) return
      if (task.tags) this.writeTagTranslations(task.tags)
      // 封面文件后到(抓取是后台异步的):清掉失败标记,让 img 重新加载
      const prev = this.downloadRecords.find(t => t.id === task.id)
      if (task.coverPath && (!prev || prev.coverPath !== task.coverPath)) {
        const next = { ...this.failedCovers }
        delete next[task.id]
        this.failedCovers = next
      }
      const list = this.downloadRecords.slice()
      const i = list.findIndex(t => t.id === task.id)
      if (i >= 0) list.splice(i, 1, task)
      else list.unshift(task)
      this.downloadRecords = list
      // 正在预览这条任务时,让它边下边长出来
      this.schedulePreviewRefresh(task)
      if (this.previewTask && this.previewTask.id === task.id) this.previewTask = task
    },
    // 工具栏「下载记录」:点开 ⇄ 收起(再点一次收回)
    toggleDownloadDrawer () {
      this.downloadPanelVisible = !this.downloadPanelVisible
      if (this.downloadPanelVisible) this.refreshDownloadRecords()
    },
    // 记录右栏打开顺序(先开的在左,后开的在右;每次打开都排到最右)
    recordPanelOpen (name) {
      this.panelSeq += 1
      this.panelOpenSeq = { ...this.panelOpenSeq, [name]: this.panelSeq }
    },
    // 下载记录标题点击:与主界面点标题同一个详情界面(用任务里的画廊 url 现成一个在线书对象;
    // 详情会自动补拉上传者/语言/大小等信息)。addToHistory=false:只是看看,不算「读过」。
    openDownloadTaskDetail (task) {
      if (!task) return
      // 已经下完(并且能定位到目录):当**本地书**打开 —— 不再跑去解析 EH 链接。
      // 这里给出的 filepath 就是下载目录里的漫画文件夹,详情/阅读/标签都按本地书走。
      if (task.status === 'done' && task.dir) {
        this.$refs.BookDetailDialogRef.openBookDetail({
          id: task.id,
          online: false,
          type: 'folder',
          filepath: task.dir,
          title: task.title || '',
          title_jpn: task.titleJpn || '',
          category: task.category || '',
          url: task.url || '',
          coverPath: task.cover ? ehImageSrc(task.cover) : '',
          pageCount: task.total || null,
          filecount: task.total || null,
          rating: Number(task.rating) || 0,
          tags: (task.tags && typeof task.tags === 'object') ? task.tags : {},
          status: 'tagged',
          readCount: 0,
          mark: false,
          movedTo: task.movedTo || ''
        }, false)
        return
      }
      if (!task.url) return
      this.$refs.BookDetailDialogRef.openBookDetail({
        id: task.id,
        online: true,
        type: 'online',
        url: task.url,
        filepath: task.url,
        title: task.title || '',
        // cover 可能是原始 EH 地址、也可能是已经代理过的 /api/ex-image?url=...
        // ehImageSrc 对已经是代理地址的相对 URL 原样返回,两种都安全
        coverPath: task.cover ? ehImageSrc(task.cover) : '',
        pageCount: task.total || null,
        filecount: task.total || null,
        tags: (task.tags && typeof task.tags === 'object') ? task.tags : {},
        readCount: 0
      }, false)
    },
    // 封面地址:coverPath 可能是本地绝对路径,也可能已经是 /api/file?path=... 的 URL
    // (web-ipc 会把响应里的本地路径改写成 URL)。已经是 URL 就原样用,
    // 再 encodeURIComponent 一次会变成 %252F —— 直接 404,整排封面变灰。
    downloadCoverSrc (task) {
      const p = String((task && task.coverPath) || '')
      if (p) return /^(https?:|data:|blob:|\/api\/)/i.test(p) ? p : this.assetUrl(p)
      return (task && task.cover) || ''
    },
    // 封面加载失败(代理挂了 / EH 换图 / 网络不通):记下来,退回灰底占位,不留破图
    onDownloadCoverError (task) {
      if (!task || !task.id) return
      this.failedCovers = { ...this.failedCovers, [task.id]: true }
    },
    // 下载记录里显示的漫画标签(下载时存下来的画廊 tags):
    // 拍平成 [{ text, full, ns }],text 给 chip 显示、full 是「命名空间:标签」用于悬浮提示、
    // ns 用于点击时按命名空间搜索(和其它界面点标签一样)。
    downloadTaskTags (task) {
      const tags = task && task.tags
      if (!tags || typeof tags !== 'object') return []
      const out = []
      for (const [ns, arr] of Object.entries(tags)) {
        if (!Array.isArray(arr)) continue
        for (const t of arr) {
          const name = String(t || '').trim()
          if (!name) continue
          // 按「标签设置」里选的语言显示(和卡片/详细信息同一套规则),命名空间放进悬浮提示
          const shown = tagDisplayName(this.setting, this.resolvedTranslation, ns, name) || name
          out.push({ text: shown, raw: name, full: ns + ':' + name, ns, color: tagColorOf(this.setting, ns, name) })
        }
      }
      return out
    },
    // 点任务记录里的标签:和别的界面一样「按这个标签搜索」,顺手收起任务面板看结果
    onDownloadTagClick (tg) {
      if (!tg || !tg.text) return
      this.downloadPanelVisible = false
      // 搜索用原始标签名(翻译后的显示名是给眼睛看的,EH/本地搜索都认原名)
      this.searchFromTag(tg.raw || tg.text, tg.ns)
    },
    // 能不能「移动」:只有**下载完成**的任务才给移(暂停/失败/下载中的都不动)
    canMoveDownload (task) {
      if (!task || task.status !== 'done' || task.movedTo) return false
      return !!task.dir
    },
    // 头部「移动」:全部已完成的任务 → 目标文件夹(设置里填了默认移动路径就直接用,不再弹选择)
    async moveAllCompletedDownloads () {
      const ids = (this.downloadRecords || []).filter(t => this.canMoveDownload(t)).map(t => t.id)
      if (!ids.length) { this.printMessage('warning', this.$t('m.downloadMoveNone')); return }
      const target = this.resolveMoveTarget('all')
      if (target) { await this.runMoveDownloads(ids, target); return }
      // 没有默认路径:弹「本地库文件夹」选择器(只能选已有库的目录及其子目录)
      this.moveDialog = { visible: true, ids, target: '' }
    },
    // 单本「移动」:该记录 → 目标文件夹(单本移动路径优先)
    async moveOneDownload (task) {
      if (!this.canMoveDownload(task)) return
      const target = this.resolveMoveTarget('single')
      if (target) { await this.runMoveDownloads([task.id], target); return }
      this.moveDialog = { visible: true, ids: [task.id], target: '' }
    },
    confirmMoveDialog () {
      const { ids, target } = this.moveDialog
      this.moveDialog.visible = false
      if (ids.length && target) this.runMoveDownloads(ids, target)
    },
    // 默认目标:设置里填的默认移动路径(启用时)/ 单本移动路径
    resolveMoveTarget (kind) {
      const s = this.setting || {}
      if (kind === 'all' && s.moveDefaultPath && (s.moveDefaultPathEnabled !== false)) return String(s.moveDefaultPath).trim()
      if (kind === 'single' && s.moveSinglePath) return String(s.moveSinglePath).trim()
      return ''
    },
    // 真正执行移动(后端:搬文件 + 在目标库登记书 + 生成封面)
    async runMoveDownloads (ids, target) {
      try {
        const r = await ipcRenderer.invoke('move-downloads', { ids, target })
        if (!r || !r.ok) { this.printMessage('error', (r && r.error) || this.$t('m.downloadMoveFailed')); return }
        const okList = (r.results || []).filter(x => x.ok)
        const badList = (r.results || []).filter(x => !x.ok)
        for (const x of okList) {
          if (x.removed) {
            // 「移动完成后移除记录」:后端已经把记录摘掉了,这里同步去掉(否则要等下一次刷新)
            this.downloadRecords = this.downloadRecords.filter(t => t.id !== x.id)
            continue
          }
          const rec = this.downloadRecords.find(t => t.id === x.id)
          if (rec) { rec.movedTo = x.dest; rec.dir = x.dest }
        }
        this.downloadRecords = this.downloadRecords.slice()
        if (okList.length) {
          this.printMessage('success', this.$t('m.downloadMoveDone', { n: okList.length }))
          // 移进本地库了:刷新书架(不用等整库扫描,后端已经登记好了)
          if (okList.some(x => x.inLibrary)) this.loadBookList(false)
        }
        if (badList.length) {
          this.printMessage('warning', this.$t('m.downloadMovePartial', { n: badList.length, err: badList.map(x => x.error).join(', ') }))
        }
        this.refreshDownloadRecords()
      } catch (e) {
        this.printMessage('error', this.$t('m.downloadMoveFailed') + ': ' + ((e && e.message) || e))
      }
    },
    // 记录上的时间(开始下载的时间;已完成的显示完成时间)。用户要年月日时分秒
    // 已下载尺寸说人话(B / KB / MB / GB)
    downloadSizeText (bytes) {
      const n = Number(bytes) || 0
      if (!n) return ''
      if (n < 1024) return n + ' B'
      if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB'
      if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
      return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'
    },
    downloadTimeText (task) {
      const ts = Number((task.status === 'done' && task.finishedAt) ? task.finishedAt : task.createdAt) || 0
      if (!ts) return ''
      const d = new Date(ts)
      const p = (n) => String(n).padStart(2, '0')
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
    },
    // 感叹号上的错误弹出:悬浮显示,点击钉住(再点一次取消)
    hoverDownloadWarn (id) {
      if (!this.downloadWarn.pinned) this.downloadWarn = { id, pinned: false }
    },
    leaveDownloadWarn () {
      if (!this.downloadWarn.pinned) this.downloadWarn = { id: '', pinned: false }
    },
    toggleDownloadWarn (id) {
      const cur = this.downloadWarn
      this.downloadWarn = (cur.id === id && cur.pinned) ? { id: '', pinned: false } : { id, pinned: true }
    },
    // ---------- 下载预览图片的加载重试 ----------
    // 预览图加载失败多半是「文件刚下完还在写」:换 URL 重拉 3 次,再不行给可点的重试占位
    previewImgSrc (f, i) {
      const base = this.assetUrl(f && f.path)
      const n = this.previewImgNonce[i]
      if (!base || !n) return base
      return base + (base.includes('?') ? '&' : '?') + 'r=' + n
    },
    onPreviewImgError (e, index) {
      const n = ((this.previewImgRetry || {})[index] || 0) + 1
      this.previewImgRetry = { ...this.previewImgRetry, [index]: n }
      if (n > 3) {
        this.previewImgFailed = { ...this.previewImgFailed, [index]: true }
        return
      }
      const f = (this.downloadPreviewFiles || [])[index]
      if (!f) return
      // 越重试间隔越长(400/800/1200ms),给写入留时间
      setTimeout(() => {
        this.previewImgNonce = { ...this.previewImgNonce, [index]: Date.now() }
      }, 400 * n)
    },
    retryPreviewImg (index) {
      this.previewImgRetry = { ...this.previewImgRetry, [index]: 0 }
      this.previewImgFailed = { ...this.previewImgFailed, [index]: false }
      this.previewImgNonce = { ...this.previewImgNonce, [index]: Date.now() }
      this.refreshDownloadPreview()
    },
    // 模板里不能直接用 import 进来的 toAssetUrl(Options API 不会把它挂到 this 上,渲染会报错),
    // 所以包一层 method
    assetUrl (path) {
      return toAssetUrl(path)
    },
    // ---------- 下载预览页的右键菜单:继续下载 / 重新下载 ----------
    // (「进入阅读」不放在右键里 —— 左键点图就是进入阅读,从第 N 页开始读)
    onPreviewContextMenu (e, index) {
      e.preventDefault()
      const task = this.previewTask
      if (!task) return
      // 已移到库里的记录不给「继续下载」(见 resumableDownloadCount 的注释)
      const resumable = !task.movedTo && ['paused', 'failed', 'waiting'].includes(task.status)
      const items = []
      // 「继续下载」只对暂停/失败/等待中的任务有意义
      if (resumable) {
        items.push({
          id: 'resume',
          label: this.$t('m.previewContinueDownload'),
          onClick: () => this.downloadAction(task, 'resume')
        })
      }
      // 只保留「重新下载(这一页)」—— 整本重下只放在确认框之外的地方,这里不要
      items.push({
        id: 'redownloadPage',
        label: this.$t('m.previewRedownloadPage'),
        onClick: () => this.redownloadPreviewPage(task, index)
      })
      this.$contextmenu({ x: e.x, y: e.y, items })
    },
    // 单页重新下载:只重下这一页(覆盖同名文件),其它页不动
    async redownloadPreviewPage (task, index) {
      if (!task || index == null) return
      this.printMessage('info', this.$t('m.previewRedownloadPageRunning', { n: index + 1 }))
      try {
        const r = await ipcRenderer.invoke('eh-download-page-by-index', { id: task.id, index })
        if (r && r.ok) {
          this.printMessage('success', this.$t('m.previewRedownloadPageDone', { n: index + 1 }))
          // 预览图是按文件路径缓存的:换个 nonce 强制重新加载这一格
          this.previewImgNonce = { ...this.previewImgNonce, [index]: Date.now() }
          this.previewImgFailed = { ...this.previewImgFailed, [index]: false }
          this.refreshDownloadPreview()
        } else {
          this.printMessage('error', (r && r.error) || this.$t('m.downloadFailed'))
        }
      } catch (e) {
        this.printMessage('error', (e && e.message) || this.$t('m.downloadFailed'))
      }
    },
    // 整本重新下载:先确认(会删掉已经下好的文件从头下),再走 eh-download-action 的 restart
    async confirmRestartDownload (task) {
      try {
        await ElMessageBox.confirm(this.$t('m.downloadRestartConfirm'), this.$t('m.previewRedownload'), { type: 'warning' })
      } catch (err) { return }
      const r = await ipcRenderer.invoke('eh-download-action', { id: task.id, action: 'restart' })
      if (r && r.ok) {
        this.printMessage('success', this.$t('m.downloadRestarted'))
        this.refreshDownloadRecords()
        // 预览还停在这条任务上:进度归零了,就地重刷一次
        if (this.previewTask && this.previewTask.id === task.id) this.refreshDownloadPreview()
      } else {
        this.printMessage('error', (r && r.error) || this.$t('m.downloadFailed'))
      }
    },
    // 把这条任务已经下好的页当一本书翻开,第 pageIndex 页就是当前页。
    // 这本书是临时构造的、不在任何库里:所以跳过阅读历史与 saveBook(见 viewManga 的 opts)
    openDownloadPageInReader (task, pageIndex) {
      const dir = task && task.dir
      if (!dir) { this.printMessage('warning', this.$t('m.downloadPreviewNoDir')); return }
      const viewer = this.$refs.InternalViewerRef
      if (!viewer || typeof viewer.viewManga !== 'function') {
        this.printMessage('warning', this.$t('m.viewerUnavailable'))
        return
      }
      viewer.showThumbnail = false
      viewer.viewManga({
        id: 'dl:' + task.id,
        title: task.title || '',
        title_jpn: '',
        filepath: dir,
        type: 'folder',
        coverPath: task.cover || '',
        pageCount: Number(task.total) || 0,
        filecount: Number(task.total) || 0,
        rating: 0,
        readCount: 0,
        tags: {},
        category: '',
        online: false
      }, '100%', pageIndex, { skipHistory: true, skipSave: true })
    },
    // ---------- 侧边详细信息面板 ----------
    onDetailPanelWidthChange (w) {
      this.detailPanelWidth = Math.min(900, Math.max(240, Number(w) || 340))
      try { localStorage.setItem('emmDetailPanelWidth', String(this.detailPanelWidth)) } catch (e) { /* 忽略 */ }
    },
    // 面板里的「阅读」:与点封面同一个点击策略(在线 → 在线阅读,本地 → 内置阅读器)
    // 侧边详细点预览图:带上页码,直接从那一页开始读
    // H@H 归档下载:打开弹窗(EH 服务端按分辨率打包);详情与侧边详情两个入口共用
    openHhDownloadDialog (book) {
      const url = String((book && book.archivePageUrl) || '').trim()
      if (!url) { this.printMessage('warning', this.$t('m.hhNoArchive')); return }
      this.hhDialogUrl = url
      this.hhDialogVisible = true
    },
    // 评论里的 EH 画廊链接:用软件内部流程打开(先拉详情,再决定进详情/阅读器)
    async onSideDetailOpenGalleryUrl (url) {
      const u = String(url || '')
      if (!u) return
      try {
        const book = await this.openOnlineBookByUrl(u)
        if (book) this.$refs.BookDetailDialogRef.openBookDetail(book)
      } catch (e) {
        // 拉不到详情就退回系统浏览器
        try { await ipcRenderer.invoke('open-url', u) } catch (err) { /* 忽略 */ }
      }
    },
    // 按 URL 现拉一本在线书的详情(评论里的链接跳转用)
    async openOnlineBookByUrl (url) {
      const host = (String(url).match(/^https?:\/\/([^/]+)/i) || [])[1] || EX_HOST
      const detail = await this.fetchExHtml(url)
      const parsed = parseGalleryDetail(detail, host)
      if (!parsed || !parsed.ok) return null
      const book = galleryToBook({
        id: 'eh:' + url, url,
        title: parsed.title, title_jpn: parsed.titleJpn,
        category: parsed.category, cover: parsed.cover,
        pageCount: parsed.pageCount, rating: parsed.rating,
        uploader: parsed.uploader, posted: parsed.posted,
        language: parsed.language, size: parsed.size, tags: parsed.tags
      })
      if (!book) return null
      book.archivePageUrl = parsed.archivePageUrl || ''
      book.thumbnails = parsed.thumbnails || []
      this.bookDetail = book
      return book
    },
    onSideDetailRead (book, startIndex = null) {
      if (!book) return
      if (startIndex != null) { this.openContentView(book, startIndex); return }
      this.runClickAction(this.setting.clickCoverAction || 'content', book)
    },
    // 侧边详情的「本地库」操作:与详细界面完全同一套（直接复用大弹窗里的实现，
    // 避免两处各写一遍、行为慢慢跑偏）
    onSideDetailToggleHidden (book) {
      const ref = this.$refs.BookDetailDialogRef
      if (ref && typeof ref.triggerHiddenBook === 'function') return ref.triggerHiddenBook(book)
      // 兜底:大弹窗没挂载时自己改并保存
      book.hiddenBook = !book.hiddenBook
      this.saveBook(book)
    },
    onSideDetailRescan (book) {
      const ref = this.$refs.BookDetailDialogRef
      if (ref && typeof ref.rescanBook === 'function') return ref.rescanBook(book)
    },
    onSideDetailDelete (book) {
      const ref = this.$refs.BookDetailDialogRef
      if (ref && typeof ref.deleteLocalBook === 'function') return ref.deleteLocalBook(book)
    },
    downloadPercent (task) {
      const total = Number(task.total) || 0
      if (!total) return task.status === 'done' ? 100 : 0
      return Math.min(100, Math.round(((task.done + task.failed) / total) * 100))
    },
    // 失败原因说人话(noPages 这种内部代号用户看不懂)。
    // ⚠️ 下载记录界面以前把原始错误(英文的网络报错)直接铺在界面上,用户看不懂 ——
    //    现在所有提示统一走中文映射(见 networkErrorText),原始的只留在悬浮 title 里。
    downloadErrorText (err) {
      const e = String(err || '')
      if (!e) return ''
      // 原图被 EH 挡下(需要 GP):任务停在等待中,等额度恢复点「继续」接着下
      if (e === 'gp') return this.$t('m.downloadErrGpShort')
      // 取页链接一条都没收到:EH 限速 / 网络不通 —— 先说清原因,别让用户以为画廊没了
      if (e.startsWith('linksFailed')) return this.$t('m.downloadErrLinksFailed') + ' ' + e.replace(/^linksFailed:\s*/, '').slice(0, 100)
      if (e.startsWith('notImage')) return this.$t('m.downloadErrNotImage') + ' ' + e.replace(/^notImage:\s*/, '').slice(0, 120)
      const map = {
        noPages: 'm.downloadErrNoPages',
        noUrl: 'm.downloadErrNoUrl',
        noPath: 'm.downloadNeedPath',
        notLoggedIn: 'm.favoriteLoginNeeded'
      }
      const key = map[e]
      if (key) return this.$t(key)
      // Node/网络层的英文报错 → 中文
      const net = this.networkErrorText(e)
      if (net) return net
      // 实在认不出来:给一句中文,原始错误截短跟在后面(至少看得懂「下载出错了」)
      return this.$t('m.downloadErrGeneric', { detail: e.slice(0, 120) })
    },
    // 网络层错误的中文映射(node-fetch / undici 的报错都是英文)
    networkErrorText (e) {
      const s = String(e || '')
      if (!s) return ''
      if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(s)) return this.$t('m.downloadErrDns')
      if (/ETIMEDOUT|ESOCKETTIMEDOUT|timed?\s?out|timeout/i.test(s)) return this.$t('m.downloadErrTimeout')
      if (/ECONNRESET|ECONNREFUSED|EPIPE|socket hang up|aborted/i.test(s)) return this.$t('m.downloadErrReset')
      if (/429|too many requests|rate.?limit/i.test(s)) return this.$t('m.downloadErrRateLimit')
      if (/403|forbidden/i.test(s)) return this.$t('m.downloadErrForbidden')
      if (/\b(5\d{2})\b/.test(s)) {
        const code = (/\b(5\d{2})\b/.exec(s) || [])[1] || '5xx'
        return this.$t('m.downloadErrServer', { code })
      }
      if (/certificate|SSL|TLS/i.test(s)) return this.$t('m.downloadErrSsl')
      return ''
    },
    // 下载记录每一行的「提示」:显示在状态(下载中/失败/…)右边,全中文
    downloadHintText (task) {
      if (!task) return ''
      // 收页链接阶段:左边那一格已经在显示「正在收集页链接:N 页…」,不重复
      if (task.phase === 'links' && task.status === 'downloading') return ''
      if ((task.fallback | 0) > 0) return this.$t('m.downloadFallback', { n: task.fallback | 0 })
      if (task.status === 'waiting' && task.error === 'gp') return this.$t('m.downloadErrGpShort')
      if (task.error) return this.downloadErrorText(task.error)
      return ''
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
        // 已移到库里的记录不能续传:说清楚,并刷新列表(它的按钮状态也该变了)
        else if (r && r.error === 'alreadyMoved') {
          this.printMessage('warning', this.$t('m.downloadAlreadyMoved'))
          this.refreshDownloadRecords()
        } else this.printMessage('error', (r && r.error) || this.$t('m.downloadFailed'))
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
    // 打开下载弹窗(位置/名称/原图);确定后回到 startGalleryDownload
    openDownloadDialog (book) {
      if (!book) return
      // 设置里勾了「使用默认下载地址和名称」:不弹窗,直接按设置里的目录 + 默认名称下载
      if (this.setting.downloadUseDefault) {
        this.startGalleryDownload(book, false, { title: this.defaultDownloadName(book), saveDir: '' })
        return
      }
      this.$refs.DownloadDialogRef.open(book)
    },
    // 默认下载名称:按界面语言挑标题(中文→中文名,日文→日文名,其它→原名),没有再依次退
    defaultDownloadName (book) {
      const b = book || {}
      const cn = String(b.title_cn || '').trim()
      const jp = String(b.title_jpn || '').trim()
      const raw = String(b.title || '').trim()
      const lang = String((this.setting && this.setting.language) || '').toLowerCase()
      if (lang.startsWith('zh')) return cn || jp || raw
      if (lang.startsWith('ja')) return jp || cn || raw
      return raw || jp || cn
    },
    startGalleryDownloadFromDialog ({ book, original, title, saveDir }) {
      this.startGalleryDownload(book, original, { title, saveDir })
    },
    async startGalleryDownload (book, original, opts = {}) {
      const wantDir = String(opts.saveDir || '').trim() || String(this.setting.downloadPath || '').trim()
      if (!wantDir) {
        this.printMessage('warning', this.$t('m.downloadNeedPath'))
        return
      }
      try {
        // 下载时把**画廊标签一起带上**(下载记录要显示、移到本地库时写进书库)。
        // 手上没有标签(从阅读器/别的入口进来)就现拉一次详情页解析出来。
        let tags = (book && book.tags && Object.keys(book.tags).length) ? book.tags : null
        let category = (book && book.category) || ''
        let titleJpn = (book && book.title_jpn) || ''
        let rating = Number(book && book.rating) || 0
        if (!tags && book && book.url) {
          try {
            const host = String(book.url).replace(/^https?:\/\//i, '').split('/')[0] || EX_HOST
            const detail = parseGalleryDetail(await this.fetchExHtml(book.url), host)
            if (detail && detail.ok) {
              if (detail.tags && Object.keys(detail.tags).length) tags = detail.tags
              if (!category) category = detail.category || ''
              if (!titleJpn) titleJpn = detail.titleJpn || ''
              if (!rating) rating = Number(detail.rating) || 0
            }
          } catch (e) { /* 标签拿不到也不影响下载 */ }
        }
        const r = await ipcRenderer.invoke('eh-download-gallery', {
          url: book.url,
          // 下载弹窗里改过的名字优先(它同时决定文件夹名);没给就按老规矩
          title: String((opts && opts.title) || '').trim() || book.title || book.title_jpn || '',
          cover: book.coverPath || '', original: !!original,
          saveDir: String((opts && opts.saveDir) || '').trim(),
          tags: tags || {}, category, titleJpn, rating,
          // EH 标注的页数:links 收集不全时后端用它兜底 total(否则封面会显示 235/218)
          pageCount: Number(book && book.pageCount) || Number(book && book.filecount) || 0
        })
        if (!r || !r.ok) { this.printMessage('error', (r && r.error) || this.$t('m.downloadFailed')); return }
        this.upsertDownloadRecord(r.task)
        this.printMessage('success', this.$t('m.downloadStarted'))
        // 用户要求:添加下载后**不要**自动弹出任务记录面板,任务在记录里看得到
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
    // 用种子下载:交给系统默认 BT 客户端。
    // ⚠ 用**磁力链接**而不是 .torrent 直链:磁力链接交给 BT 客户端能直接开始,
    //   直链还要走一次 HTTP 下载再交出去(而且 ehtracker 的直链带一次性 token,容易失效)。
    async openTorrent (tr) {
      if (!tr) return
      const target = tr.magnet || tr.url
      if (!target) return
      if (window.__WEB_MODE__) { window.open(target, '_blank', 'noopener'); return }
      const r = await ipcRenderer.invoke('open-url', target).catch(() => ({ ok: false }))
      if (!r || !r.ok) {
        try { window.open(target, '_blank', 'noopener') } catch (e) { this.printMessage('error', this.$t('m.openFailed')) }
      }
    },
    // 种子标题点击:**用浏览器打开磁力链接**(相当于在地址栏输入 magnet:?xt=urn:btih:...)。
    // ⚠ 以前这里是打开 tr.url(.torrent 直链)—— 与要求不符。
    //   用户要的是磁力链接本身,浏览器/外部工具按 magnet: 协议接手。
    async openTorrentInBrowser (tr) {
      if (!tr) return
      const target = tr.magnet || tr.url
      if (!target) return
      // 网页版/容器:没有桌面壳,直接让浏览器打开 magnet(浏览器会弹"交给 BT 客户端")
      if (window.__WEB_MODE__) { window.open(target, '_blank', 'noopener'); return }
      // 桌面版:交系统外壳。失败(没装 BT 客户端 / 协议未注册)时退回浏览器打开,
      // 至少不会"点了没反应"。
      const r = await ipcRenderer.invoke('open-url', target).catch(() => ({ ok: false }))
      if (!r || !r.ok) {
        try { window.open(target, '_blank', 'noopener') } catch (e) { this.printMessage('error', this.$t('m.openFailed')) }
      }
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
    // ★用户反馈「点了要卡半天才刷新,像卡死」:以前 loadOnlineList(true) 会先打 EH 请求,
    //   期间旧列表原样不动、也没有任何「正在加载」的反馈。
    //   现在:立刻清空 + 显示骨架/加载态,再去取第一页,拿到一批就填一批。
    reloadOnline () {
      this.clearOnlineListForReload()
      this.loadOnlineList(true)
    },
    // 清空在线列表并进入「正在加载」态(排序/搜索/重新加载都走这里)
    clearOnlineListForReload () {
      this.onlineItems = []
      this.onlineCursors = [null]
      this.onlinePagesFetched = 0
      this.onlineHasMore = true
      this.bookList = []
      this.displayBookList = []
      this.chunkDisplayBookList = []
      this.currentPage = 1
      this.renderedCount = this.renderBatchSize
      this.onlineReloading = true
      // onlineLoading 由 loadOnlineList 自己置位 —— 这里不要抢着设成 true,
      // 否则 loadOnlineList 一进来就判定「已经在加载」,整次重拉被跳过,骨架永远不消失。
      try { sessionStorage.removeItem('emmOnlineCache') } catch (e) { /* 忽略 */ }
      // 兜底:网络卡住(EH 不可达 / 代理没通)时,最多 15 秒也要收拾掉骨架,
      // 不能让界面永远停在骨架屏上(那和「卡死」没区别)。
      clearTimeout(this._onlineReloadGuard)
      this._onlineReloadGuard = setTimeout(() => {
        if (this.onlineReloading) {
          this.onlineReloading = false
          this.onlineLoading = false
          if (!this.onlineItems.length) this.printMessage('error', this.$t('m.ehOnlineTimeout'))
        }
      }, 8000)
      this.$nextTick(() => this.scrollMainPageTop())
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
        // 只有「第一页就空」才提示(那是真的没内容 / 被 Ban);
        // 往下滚动补页时到头是正常现象,再弹就是「老是弹出错误提示」
        if (!this.onlinePagesFetched) {
          this.printMessage('warning', (parsed.error === 'ipBanned') ? this.$t('m.ehOnlineIpBanned') : this.$t('m.ehOnlineEmpty'))
        }
        return 0
      }
      // ⚠ 去重后再追加:EH 的游标偶尔会失效(尤其带筛选时),同一页会被反复返回,
      //   表现就是「拉到底无限加载」——列表越来越长但全是重复的卡片。
      //   新页里一半以上是已存在的画廊 = 到底了,不再追加。
      const existIds = new Set((this.onlineItems || []).map(g => g.id))
      const fresh = parsed.galleries.filter(g => !existIds.has(g.id))
      if (!fresh.length || fresh.length < Math.ceil(parsed.galleries.length / 2)) {
        this.onlineHasMore = false
        return 0
      }
      this.onlineItems = this.onlineItems.concat(fresh)
      if (parsed.nextGid) this.onlineCursors = [...this.onlineCursors, parsed.nextGid]
      this.onlinePagesFetched += 1
      this.onlineHasMore = !!parsed.nextGid
      return fresh.length
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
      // ★必须翻到**分页器的最后一页**才拉下一批 EH 数据:
      //   EH在线是按「每页数量」分页的(底部 1/2/3… 页码)。以前不管翻到第几页,
      //   只要往下滚就去拉数据 —— 第 1 页就无限加载,看起来"没有边界"。
      //   现在只有当前页 == 分页器最后一页、并且滚到该页底部,才补下一页数据。
      if (!force) {
        const pageSize = Math.max(1, Number(this.setting.pageSize) || 42)
        const totalPages = Math.max(1, Math.ceil((this.onlineItems || []).length / pageSize))
        if ((Number(this.currentPage) || 1) < totalPages) return
      }
      // 改「每页数量」等操作期间先压住自动补页(见 handleSizeChange)
      if (!force && this.suppressOnlineAppend) return
      // 两次自动补页至少隔 600ms:滚动事件连发时不要连着打 EH(会看起来「一直加载」)
      if (!force) {
        const now = Date.now()
        if (now - (this.onlineLastAppendAt || 0) < 600) return
      }
      if (!force && this.renderedCount < this.visibleChunkDisplayBookList.length) return
      // ★必须是**真正的滚动到底**:以前滚动监听在距底 600px 时就一路触发,
      //   renderedCount 涨完之后每次滚动事件都会补一页 —— 看起来就是「拉到底无限加载」。
      //   现在补一页后列表变长,除非用户**再次滚到底部 150px 内**,否则不再补。
      if (!force) {
        const area = document.querySelector('.book-card-area')
        if (area) {
          // 距底 ≤100px 才算「浏览到底部」:补一页后列表变长,不继续滚就不会再触发
          const toBottom = area.scrollHeight - area.scrollTop - area.clientHeight
          if (toBottom > 100) return
        }
      }
      this.onlineLoading = true
      this.onlineLastAppendAt = Date.now()
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
      // ⚠ 这里以前是「已经在加载就直接 return」—— 但「重新加载」会先把 onlineReloading 打开,
      //   如果这时刚好有一次自动补页在跑,这个 return 就把 reload 整个吞掉,
      //   骨架屏从此再也不消失(实测:清空后卡在骨架 6 秒以上还不恢复)。
      //   现在:重拉请求一律排队等正在跑的那次结束,而不是被丢掉。
      if (this.onlineLoading) {
        if (!reset) return
        for (let i = 0; i < 100 && this.onlineLoading; i++) await new Promise(r => setTimeout(r, 100))
      }
      // ★没要求重拉:手上这份就够用(切库/切界面回来不该重来);手上没有再看会话缓存
      if (!reset) {
        if (this.onlineItems.length) {
          this.applyOnlineList()
          try {
            const before = this.onlineItems.length
            await this.fillOnlineUpTo((Number(this.currentPage) || 1) * (Number(this.setting.pageSize) || 42))
            // 补到了新页:再 apply 一次,不然新取到的条目在界面上看不到(要等下次滚动)
            if (this.onlineItems.length > before) this.applyOnlineList()
          } catch (e) { /* 补页失败不影响已显示的内容 */ }
          this.onlineReloading = false
          return
        }
        if (this.restoreOnlineCache()) {
          this.applyOnlineList()
          this.onlineReloading = false
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
        }
        // 初始也要把「当前页」填满(每页数量):只拉 EH 一页(20 条)时不足一屏,
        // 用户滚到底就触发补页 —— 看起来又是「无限制加载」。
        await this.fillOnlineUpTo((Number(this.currentPage) || 1) * (Number(this.setting.pageSize) || 42))
        this.applyOnlineList()
      } catch (e) {
        console.error(e)
        // 已经拉到过内容:保持现状,别把用户正在看的列表用一条错误提示盖掉
        if (!this.onlineItems.length) {
          this.printMessage('error', (e && e.message === 'timeout') ? this.$t('m.ehOnlineTimeout') : this.$t('m.ehOnlineFailed'))
        }
      } finally {
        this.onlineLoading = false
        this.onlineReloading = false
        clearTimeout(this._onlineReloadGuard)
      }
    },
    // startIndex:从第几页开始翻(0 基);点预览缩略图时传页面序号
    openContentView (book, startIndex = null) {
      const viewer = this.$refs.InternalViewerRef
      if (!viewer || typeof viewer.viewManga !== 'function') {
        // 阅读器未就绪(或纯网页模式)时兜底:打开详细界面,避免"双击没反应"
        this.printMessage('warning', this.$t('m.viewerUnavailable') || 'viewer unavailable')
        this.$refs.BookDetailDialogRef.openBookDetail(book)
        return
      }
      viewer.showThumbnail = false
      viewer.viewManga(book, '100%', startIndex)
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
  // 主界面自己滚(见 .book-card-area 的 overflow-y),窗口不再滚 ——
  // 以前窗口滚,滚动条挂在浏览器最右边,下载记录栏一开就被隔在主界面外面,
  // 看着像「主界面的滚动条和主界面分割开了」;而且惯性滚动/无限滚动/回到顶部
  // 这些本来挂在 .book-card-area 上的逻辑也一直没真正生效(容器不可滚,写 scrollTop 无效)。
  overflow: hidden
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
  // 主界面的滚动容器:卡片区自己滚,滚动条贴在这一栏的右缘(紧挨下载记录栏),
  // 不再漂到浏览器窗口最右边。高度由里层 .book-card-list 的行内样式给定(100vh-96/134)。
  overflow-y: auto
  // ⚠ el-row 的 gutter 是「行负 margin + 列正 padding」做的:这一行因此比主界面宽 20px,
  //    右侧那 10px 正好探到下载记录/侧边详细栏底下 —— 滚动条就画在这 10px 里,
  //    一开右栏就被盖住(用户反馈「滚动条消失」)。把负 margin 收回来、列的内边距也归零,
  //    卡片位置与原来完全一致,但滚动条落在主界面自己的框里,永远露在右栏左边。
  margin-left: 0 !important
  margin-right: 0 !important
  > .book-card-list
    padding-left: 0 !important
    padding-right: 0 !important
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
  // EH在线 重新加载时的骨架卡:与真实卡片同尺寸,避免「空一下再突然冒出整片」
  .online-skeleton
    display: flex
    flex-wrap: wrap
    gap: 12px
    align-content: flex-start
    justify-content: flex-start
    padding: 4px
  .online-skeleton-card
    width: calc(var(--emm-cover-size, 220px))
    border-radius: 6px
    padding: 6px
    background: var(--el-fill-color-light)
    box-sizing: border-box
    .online-skeleton-cover
      width: 100%
      aspect-ratio: 3 / 4
      border-radius: 4px
      background: var(--el-fill-color-dark)
      animation: emm-skeleton-pulse 1.2s ease-in-out infinite
    .online-skeleton-line
      height: 10px
      margin-top: 8px
      border-radius: 4px
      background: var(--el-fill-color-dark)
      animation: emm-skeleton-pulse 1.2s ease-in-out infinite
      &.short
        width: 60%
  @keyframes emm-skeleton-pulse
    0%, 100%
      opacity: .55
    50%
      opacity: 1
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
// ⋯ 溢出收纳下拉里的图标:与工具栏按钮的图标同尺寸
.emm-overflow-icon
  width: 14px
  height: 14px
  margin-right: 8px
  vertical-align: -2px

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

// ============================================================
// 搜索历史:在搜索建议弹层的**底部**横排成芯片(不再是竖着一行行往下排)
// 弹层结构来自 el-autocomplete:header / 竖向建议列表 / footer,历史就放在 footer 里
// ============================================================
// ⚠️ 这里不要画分隔线:弹层里已经有搜索建议区和历史区两块背景,
//    再加 border 会在毫厘之间多出两根横杠(用户反馈「上下两根横行占位置」)
.search-history-panel
  display: flex
  flex-direction: column
  // 不留上下空白:历史紧贴搜索建议区/弹层底边
  gap: 0
  padding: 6px 8px
  background: var(--el-bg-color-overlay)
  font-size: 12px
  line-height: 1
  // 芯片横排:一行放不下就换行;高度按「4 排芯片」截断,再多就在这块里滚动
  // (每排 22px 芯片 + 6px 间距 = 28;4 排 = 22*4 + 6*3 = 106)
  .search-history-chips
    display: flex
    flex-wrap: wrap
    align-items: flex-start
    align-content: flex-start
    gap: 6px
    max-height: 106px
    overflow-y: auto
    overflow-x: hidden
    // 滚动条做成一根极细的线(2px)。
    // ⚠️ 不要写 scrollbar-width: thin —— Windows 上 Chromium 仍按 10px 渲染并吃掉布局宽度,
    //    而且它会优先于 ::-webkit-scrollbar 的宽度设置;显式写 auto 才轮到 webkit 伪元素生效。
    scrollbar-width: auto
    &::-webkit-scrollbar
      width: 2px
      height: 2px
    &::-webkit-scrollbar-track
      background: transparent
    &::-webkit-scrollbar-thumb
      background: var(--el-border-color-lighter)
      border-radius: 1px
    &:hover::-webkit-scrollbar-thumb
      background: var(--el-border-color)
  .search-history-chip
    flex: 0 0 auto
    // 弹层跟搜索框等宽,搜索框窄时芯片也别超出容器(留出 ✕ 的位置)
    max-width: 100%
    cursor: pointer
    user-select: none
    // 芯片文字过长就省略,免得一条历史占掉半行
    .el-tag__content
      overflow: hidden
      text-overflow: ellipsis
      white-space: nowrap
    &:hover
      background: var(--el-color-primary-light-9)
      border-color: var(--el-color-primary-light-5)
    &.is-selected
      background: var(--el-color-primary-light-8)
      border-color: var(--el-color-primary)
      color: var(--el-color-primary)
  // 「清除」是滚动区里的最后一项:占满一整行、居中,记录多时要滑到底才出现
  .search-history-foot
    flex: 0 0 100%
    display: flex
    justify-content: center
    align-items: center
    margin-top: 2px
  .search-history-clear
    padding: 0 2px
    height: auto
    font-size: 12px
    color: var(--el-text-color-secondary)
    &:hover
      color: var(--el-color-danger)

// 搜索建议下拉(竖向列表只剩「标签建议」,历史在同一下拉的底部横排)
// 只作用于搜索框自己的下拉,不影响设置页等其它 autocomplete
.emm-search-suggest
  // 宽度由 popper-style 写死成搜索框宽度;这里再兜一层,防止内部内容把它撑开
  max-width: 100%
  box-sizing: border-box
  overflow-x: hidden
  li
    line-height: 24px
    padding: 0 8px
  // 占位项不显示任何内容(只为撑开弹层):那一行整行隐藏
  // (stylus 不认 :has(),用插值原样输出选择器)
  {unquote('li:has(.autocomplete-placeholder)')}
    display: none
    height: 0
    min-height: 0
    padding: 0
    margin: 0
    overflow: hidden
  // 弹层底部那块历史:贴着底边,去掉 Element 默认的内边距让芯片区自己撑开
  .el-autocomplete-suggestion__footer
    padding: 0
  .el-autocomplete-suggestion__wrap
    max-height: 300px !important
  // 弹层里的建议区/历史区都按弹层宽度布局,不允许撑宽。
  // ⚠️ Element 会给 suggestion 写内联 min-width(缓存了弹出那一刻的输入框宽度),
  //    窗口缩小后它还留着旧值,把弹层撑回去 —— 这里必须 !important 覆盖掉。
  .el-autocomplete-suggestion
    width: 100% !important
    min-width: 0 !important
    max-width: 100% !important
    box-sizing: border-box
    overflow-x: hidden

.autocomplete-value
  margin-left: 2em
  float: right

// search-input sort-select
.el-autocomplete-suggestion__wrap, .el-select-dropdown__wrap
  max-height: 490px!important

.book-tag-edit-cascader-popper
  .el-cascader-menu__wrap.el-scrollbar__wrap
    height: 340px

// 历史视图按「本地 / EH在线」筛选后为空时说一句
.book-empty-hint
  padding: 40px 0
  text-align: center
  font-size: 13px
  color: var(--el-text-color-secondary)

// 主界面 + 下载记录右栏:flex 并排,右栏可以拖宽
.app-body
  display: flex
  align-items: stretch
  width: 100%
.app-main
  flex: 1
  min-width: 0

// 「移动到本地库」弹窗里选中路径的提示
.move-dialog-hint
  margin-top: 8px
  font-size: 12px
  color: var(--el-text-color-secondary)
  word-break: break-all

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
  // 种子界面全部居中
  text-align: center
  &.is-outdated
    opacity: .6
  .torrent-name
    font-size: 13px
    margin-bottom: 4px
    word-break: break-all
    // 点标题 = 用浏览器打开种子页链接
    color: var(--el-color-primary)
    cursor: pointer
    &:hover
      text-decoration: underline
  .torrent-meta
    display: flex
    flex-wrap: wrap
    gap: 8px
    font-size: 12px
    color: var(--el-text-color-secondary)
    justify-content: center
  .torrent-outdated
    color: var(--el-color-danger)
  .torrent-actions
    margin-top: 6px
    display: flex
    gap: 6px
    justify-content: center
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

// ============================================================
// 入坞面板外壳（T04+）：文件夹树 / 管理合集共用，观感与侧边详细信息一致。
// .dock-panel--left 是左侧面板变体：描边和拖宽手柄在右缘。
.dock-panel
  position: relative
  flex: none
  display: flex
  flex-direction: column
  box-sizing: border-box
  height: calc(100vh - 8px)
  padding: 10px 10px 10px 6px
  border-left: 1px solid var(--el-border-color)
  background: var(--el-bg-color, #fff)
  overflow: hidden
  .dock-panel-resizer
    position: absolute
    left: -3px
    top: 0
    bottom: 0
    width: 6px
    cursor: col-resize
    z-index: 5
  .dock-panel-header
    display: flex
    align-items: center
    justify-content: space-between
    gap: 8px
    padding-bottom: 8px
    font-size: 15px
    flex: none
  .dock-panel-title
    font-weight: 600
    overflow: hidden
    text-overflow: ellipsis
    white-space: nowrap
  .dock-panel-actions
    flex: none
    display: flex
    align-items: center
  .dock-panel-body
    flex: 1 1 auto
    min-height: 0
    overflow: auto
.dock-panel--left
  border-left: none
  border-right: 1px solid var(--el-border-color)
  .dock-panel-resizer
    left: auto
    right: -3px

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