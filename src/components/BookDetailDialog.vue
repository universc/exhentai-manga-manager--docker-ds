<template>
  <el-dialog v-model="dialogVisibleBookDetail"
    fullscreen
    class="dialog-detail"
    modal-class="dialog-detail-modal"
    @close="exitEditMode"
  >
    <el-row :gutter="20" class="book-detail-card">
      <el-col :span="6">
        <!-- 标题:与封面同宽居中显示(与图片、按钮对齐) -->
        <div class="detail-title-above-cover" :title="getDisplayTitle(bookDetail)">
          <span class="url-link" @click="openUrl(bookDetail.url)" @contextmenu="onMangaTitleContextMenu($event, bookDetail)">{{ getDisplayTitle(bookDetail) }}</span>
        </div>
        <el-row class="book-detail-function book-detail-cover-frame">
          <img
            v-if="coverSrc"
            class="book-detail-cover"
            :src="coverSrc"
            alt=""
            @click="$emit('openContentView', bookDetail)"
            @mousedown.middle.prevent="openLocalBook(bookDetail)"
            @contextmenu="$emit('openThumbnailView', bookDetail)"
            @load="onDetailCoverLoad"
            @error="onCoverError"
          />
          <!-- 还没有封面地址(封面还没生成出来):淡底占位,交互与封面一致 -->
          <div
            v-else
            class="book-detail-cover book-detail-cover-empty"
            :title="getDisplayTitle(bookDetail)"
            @click="$emit('openContentView', bookDetail)"
            @mousedown.middle.prevent="openLocalBook(bookDetail)"
            @contextmenu="$emit('openThumbnailView', bookDetail)"
          ></div>
          <!-- 加载中一直转圈(含「封面还没生成出来」),生成本身可能要十几秒 -->
          <div class="cover-loading" v-if="detailCoverLoading">
            <el-icon class="is-loading" :size="26"><Loading /></el-icon>
          </div>
          <!-- 真生成不出来才写「加载失败」;图仍留在下面继续加载,补出封面会自动消失 -->
          <div class="cover-failed" v-if="detailCoverFailed">{{ $t('m.coverLoadFailed') }}</div>
          <el-icon
            v-if="!setting.hideBookmarkButton && !viewerRole && !isCollection"
            :size="30"
            :color="bookDetail.mark ? '#E6A23C' : '#666666'"
            class="book-detail-star" @click="switchMark(bookDetail)"
          ><BookmarkTwotone /></el-icon>
          <!-- 上一本/下一本:合集不是列表里的书,不参与翻页 -->
          <div class="next-manga-pane" v-if="!isCollection" @click="$emit('jumpMangeDetail', 1)"><el-icon text><CaretRight20Regular /></el-icon></div>
          <div class="prev-manga-pane" v-if="!isCollection" @click="$emit('jumpMangeDetail', -1)"><el-icon text><CaretLeft20Regular /></el-icon></div>
        </el-row>
        <el-row :gutter="20" class="book-detail-rate">
          <!-- 合集:评分只统计**真的评过分**的成员,只读展示(不存在「给合集整体打分」这件事) -->
          <el-rate v-if="isCollection" :model-value="collectionAvgRating" size="large" allow-half disabled />
          <el-rate v-else v-model="bookDetail.rating" size="large" allow-half :disabled="viewerRole" @change="saveBook(bookDetail)"/>
        </el-row>
        <el-row class="book-detail-function">
          <el-descriptions :column="1">
            <el-descriptions-item v-if="pageCountText !== '—'" :label="$t('m.pageCount')+':'" :class-name="bookDetail.pageDiff ? 'text-red' : ''">
              {{ pageCountText }}
            </el-descriptions-item>
            <!-- 文件大小:合集取成员合计(合集本身不是磁盘上的一个文件,但「这一堆占多少」有意义) -->
            <el-descriptions-item v-if="isCollection ? !!collectionTotalSize : (isOnline ? !!bookDetail.size : fileSizeText !== '—')" :label="$t('m.fileSize')+':'">
              {{ isCollection ? collectionTotalSize : (isOnline ? bookDetail.size : fileSizeText) }}
            </el-descriptions-item>
            <el-descriptions-item v-if="!isOnline" :label="$t('m.readCount')+':'">{{ isCollection ? collectionTotalReads : bookDetail.readCount }}</el-descriptions-item>
            <el-descriptions-item v-if="!isOnline && !isCollection" :label="$t('m.mtime')+':'">{{new Date(bookDetail.mtime).toLocaleString("zh-CN")}}</el-descriptions-item>
            <el-descriptions-item v-if="isOnline && bookDetail.uploader" :label="$t('m.ehOnlineUploader')+':'">{{bookDetail.uploader}}</el-descriptions-item>
            <el-descriptions-item v-if="bookDetail.posted && !isCollection" :label="$t('m.postTime')+':'">{{ isOnline ? bookDetail.posted : new Date(bookDetail.posted * 1000).toLocaleString("zh-CN") }}</el-descriptions-item>
          </el-descriptions>
        </el-row>
        <!-- 合集:阅读 / 重扫 / 编辑 / 获取元数据 / 隐藏 / 删除合集(只删壳,书留在库里) / 删除文件(整组移入回收站)。
             顺序按用户要求固定;「关闭」按钮已去掉(右上角 ✕ 或 ESC 一样能关)。
             阅读 = 用当前排序的第一本开读;重扫 / 获取元数据 / 隐藏 都是对整组批量执行。 -->
        <el-row class="book-detail-function" v-if="isCollection">
          <el-button class="detail-func-btn" type="success" plain :disabled="!collectionMembers.length" @click="readCollection">{{$t('m.collectionRead')}}</el-button>
          <el-button v-if="!viewerRole" class="detail-func-btn" plain :loading="collectionRescanning" :disabled="!collectionMembers.length" @click="rescanCollection">{{$t('m.rescan')}}</el-button>
          <el-button v-if="!viewerRole" class="detail-func-btn is-wide" type="primary" plain @click="editTags">{{editingTag ? $t('m.viewInfo') : $t('m.editCollection')}}</el-button>
          <el-button v-if="!viewerRole" class="detail-func-btn" type="primary" plain :disabled="!collectionMembers.length" @click="requestCollectionMetadata">{{$t('m.getMetadata')}}</el-button>
          <el-button v-if="!viewerRole" class="detail-func-btn" type="primary" plain :disabled="!collectionMembers.length" @click="triggerHiddenCollection">{{bookDetail.hiddenBook ? $t('m.showManga') : $t('m.hideManga')}}</el-button>
          <el-button v-if="!viewerRole" class="detail-func-btn" type="danger" plain @click="deleteCollectionOnly(bookDetail)">{{$t('c.deleteCollection')}}</el-button>
          <el-button v-if="!viewerRole" class="detail-func-btn" type="danger" plain @click="deleteCollectionFiles(bookDetail)">{{$t('m.deleteFile')}}</el-button>
        </el-row>
        <el-row class="book-detail-function" v-if="!isCollection">
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
        <el-row class="book-detail-function" v-if="!isOnline && !isCollection">
          <el-button v-if="!viewerRole" class="detail-func-btn" type="primary" plain @click="$emit('openSearchDialog')">{{$t('m.getMetadata')}}</el-button>
          <el-button v-if="!viewerRole" class="detail-func-btn" type="primary" plain @click="triggerHiddenBook(bookDetail)">{{bookDetail.hiddenBook ? $t('m.showManga') : $t('m.hideManga')}}</el-button>
          <el-button class="detail-func-btn" plain @click="showFile(bookDetail.filepath)">{{$t('m.openMangaFileLocation')}}</el-button>
        </el-row>
        <el-row class="book-detail-function" v-if="!viewerRole && !isOnline && !isCollection">
          <el-button class="detail-func-btn" type="danger" plain @click="deleteLocalBook(bookDetail)">{{$t('m.deleteFile')}}</el-button>
          <el-button class="detail-func-btn" plain @click="rescanBook(bookDetail)">{{$t('m.rescan')}}</el-button>
        </el-row>
      </el-col>
      <el-col :span="setting.showComment ? 10 : 18">
        <el-scrollbar class="book-tag-frame">
          <div v-if="editingTag && !viewerRole">
            <!-- ========== 合集编辑:名称 / 标签(批量作用于全部成员) ==========
                 合集的「元数据」不在 DB 里:名称与成员在 collectionList 那条记录上,
                 标签则完全落在每个成员身上 —— 所以这里的标签是「并集 + 差量下发」:
                 删掉一个标签 = 合集内全部成员都删掉它,加一个 = 全部成员都加上。 -->
            <template v-if="isCollection">
              <div class="edit-line">
                <el-input v-model="collectionEditTitle" :placeholder="$t('m.collectionName')" @change="saveCollectionTitle"></el-input>
              </div>
              <div class="tag-picker" v-for="(arr, key) in tagGroup" :key="key">
                <el-select
                  v-model="collectionEditTags[key]"
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
                  @change="applyCollectionTags"
                >
                  <el-option
                    v-for="opt in arr"
                    :key="key + '|' + opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </div>
              <div class="collection-edit-hint">{{ $t('m.collectionTagEditHint') }}</div>
              <div class="collection-edit-hint">{{ $t('m.collectionCoverEditHint') }}</div>
              <!-- 与普通漫画编辑标签界面同一排按钮:合集的按「全部成员」执行 -->
              <el-space wrap class="tag-edit-buttons">
                <el-button @click="addCollectionCategory">{{$t('m.addCategory')}}</el-button>
                <el-button type="success" @click="$emit('openAddTag')">{{$t('m.addNewTag')}}</el-button>
                <el-button @click="collectionGetMetadataByUrl">{{$t('m.getTagbyUrl')}}</el-button>
                <el-button :loading="queryingOrigins" @click="queryBookOrigins">{{$t('m.queryCharacterOrigins')}}</el-button>
                <el-button :loading="analyzingTitle" @click="analyzeCollectionTitles">{{$t('m.translateTitle')}}</el-button>
                <el-button @click="notImplemented($t('m.superResolution'))">{{$t('m.superResolution')}}</el-button>
                <el-button @click="notImplemented($t('m.colorization'))">{{$t('m.colorization')}}</el-button>
                <el-button @click="resetCollectionMetadata">{{$t('m.resetMetadata')}}</el-button>
                <el-button @click="copyCollectionTags">{{$t('m.copyTagClipboard')}}</el-button>
                <el-button @click="pasteCollectionTags">{{$t('m.pasteTagClipboard')}}</el-button>
              </el-space>
            </template>
            <template v-else>
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
            <!-- 长按/右键已选中的标签 = 弹「编辑标签 / 加入黑名单」菜单(与浏览态标签右键同一份菜单)。
                 事件委托:Element 的已选项渲染成 .el-tag;关闭按钮/svg 上的按压不算(那是「删掉这个标签」)。
                 ⚠ 这里**不能**用 @contextmenu.prevent:prevent 会作用于整个 wrapper,
                   用户在输入框里右键想「粘贴 / 全选」就没反应了 —— 只在命中胶囊时才在函数内 preventDefault -->
            <div class="tag-picker" v-for="(arr, key) in tagGroup" :key="key"
                 @contextmenu="onPickerContextMenu($event, key, arr)"
                 @mousedown="startTagLongPress($event, key, arr)"
                 @mouseup="cancelTagLongPress"
                 @mouseleave="cancelTagLongPress"
                 @touchstart.passive="startTagLongPress($event, key, arr)"
                 @touchend="cancelTagLongPress"
                 @touchmove.passive="cancelTagLongPress"
            >
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
              <el-button type="success" @click="$emit('openAddTag')">{{$t('m.addNewTag')}}</el-button>
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
            </template>
          </div>
          <div v-else class="book-info-block">
            <el-descriptions :column="1">
              <!-- 标题:浏览模式只展示各语言已有标题;需要修改请点「编辑信息」 -->
              <el-descriptions-item v-if="bookDetail.title_jpn && !isCollection" :label="$t('m.titleLangJpn')+':'">{{ bookDetail.title_jpn }}</el-descriptions-item>
              <el-descriptions-item v-if="bookDetail.title_cn && !isCollection" :label="$t('m.titleLangCn')+':'">{{ bookDetail.title_cn }}</el-descriptions-item>
              <el-descriptions-item v-if="bookDetail.title" :label="$t('m.titleLangEn')+':'">{{ bookDetail.title }}</el-descriptions-item>
              <!-- 合集不是磁盘上的一个文件:文件名 / 所在目录都不存在 -->
              <el-descriptions-item v-if="!isOnline && !isCollection" :label="$t('m.filename')+':'">{{returnFileNameWithExt(bookDetail.filepath)}}</el-descriptions-item>
              <el-descriptions-item v-if="!isOnline && !isCollection" :label="$t('m.fileLocation')+':'">{{returnDirname(bookDetail.filepath)}}</el-descriptions-item>
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
                        @contextmenu.prevent="onTagContextMenu($event, tag, g.key)"
                      >{{ tagDisplayName(setting, resolvedTranslation, g.key, tag) }}</span>
                    </template>
                  </el-popover>
                </span>
              </el-descriptions-item>
              <!-- 一个标签都没有时说一句(以前是一片空白,看不出是「没标签」还是「没加载出来」) -->
              <el-descriptions-item v-if="!tagGroups.length" :label="$t('m.tag')+':'">
                <span class="book-no-tag">{{ $t('m.sideDetailNoTags') }}</span>
              </el-descriptions-item>
            </el-descriptions>
          </div>
          <!-- 故事简介:有内容才显示(在线画廊没有简介 → 整块不出现);编辑模式始终显示以便填写
               ★ 合集没有简介这个东西(它不是一本书),编辑模式下也不显示 —— 否则这里改的东西
                 会顺着 saveBook 写到聚合快照上,等于往「不存在的书」里写字段。 -->
          <div class="story-summary" v-if="!isCollection && (bookDetail.description || (editingTag && !viewerRole))">
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
          <!-- 预览:合集显示成员封面网格;本地书按批取页图;在线画廊用它自己的页预览(雪碧图)
               ★ 合集即使一本都没有也要显示这块:「添加漫画」按钮挂在这里,空合集也得能加书。 -->
          <div class="book-preview" v-if="isCollection || previewItems.length || previewLoading">
            <div class="book-preview-title">
              <span v-if="isCollection">{{ $t('m.collectionBookCount', { n: collectionMembers.length }) }}</span>
              <span v-else>{{ $t('m.ehOnlinePagePreview') }}</span>
              <!-- 添加漫画:弹窗勾选还没进这个合集的书(与合集抽屉那颗按钮同一个弹窗) -->
              <el-button
                v-if="isCollection && !viewerRole && editingTag"
                class="preview-add-member"
                size="small"
                type="primary"
                plain
                :icon="Plus"
                @click="emit('add-collection-member', bookDetail)"
              >{{ $t('m.addMangaToCollection') }}</el-button>
              <template v-if="!isCollection">
                <span class="book-preview-hint" v-if="previewTotal > previewItems.length">{{ previewItems.length }}/{{ previewTotal }}</span>
                <span class="book-preview-hint" v-else-if="previewRawTotal > previewTotal">{{ previewTotal }}/{{ previewRawTotal }}</span>
              </template>
            </div>
            <div class="book-preview-strip" :style="{ '--preview-cell': previewCell + 'px' }">
              <!-- 合集:每本成员一格,点一下进那本书的详情(合集本身没有「页」) -->
              <template v-if="isCollection">
                <div v-if="!collectionMembers.length" class="collection-member-empty">{{ $t('m.collectionEmptyBooks') }}</div>
                <div
                  v-for="m in collectionMembers"
                  :key="'cm' + (m.id != null ? m.id : m.hash)"
                  class="book-preview-item collection-member-item"
                  :class="{ 'is-editing': editingTag && !viewerRole, 'is-cover': isCollectionCover(m) }"
                  :title="getDisplayTitle(m)"
                  @click="onMemberClick(m)"
                  @contextmenu.prevent="onMemberContextMenu($event, m)"
                >
                  <!-- 图没解码出来之前只留空白格:以前 <img> 一挂上去就参与渲染,
                       慢盘/坏封面时会先闪一下浏览器的「破图」图标(用户截图),
                       现在加载完成前 opacity:0,失败直接整张撤掉 -->
                  <div class="book-preview-pending"></div>
                  <img
                    v-if="memberCoverSrc(m) && !memberCoverBroken(m)"
                    class="collection-member-cover"
                    :class="{ 'is-loaded': memberCoverLoaded(m) }"
                    :src="memberCoverSrc(m)"
                    loading="lazy"
                    decoding="async"
                    @load="onMemberCoverLoad(m)"
                    @error="onMemberCoverError(m)"
                  />
                  <!-- 编辑态:右上角 ✕ = 移出合集(书还在库里);
                       右下角垃圾桶 = 直接删除这本漫画(移入回收站,同时移出合集) -->
                  <template v-if="editingTag && !viewerRole">
                    <span class="member-op member-op-remove" :title="$t('m.removeFromCollection')" @click.stop="emitRemoveMember(m)">
                      <el-icon :size="13"><Close /></el-icon>
                    </span>
                    <span class="member-op member-op-delete" :title="$t('m.deleteFile')" @click.stop="confirmDeleteMember(m)">
                      <el-icon :size="13"><Delete /></el-icon>
                    </span>
                  </template>
                  <!-- 当前合集封面:给个角标,不然右键设过之后看不出区别 -->
                  <span v-if="isCollectionCover(m)" class="member-cover-badge">{{ $t('m.collectionCover') }}</span>
                </div>
              </template>
              <template v-else>
              <div
                v-for="(it, i) in previewItems"
                :key="i"
                class="book-preview-item"
                :class="{ 'is-sprite': !!it.sprite }"
                :style="it.sprite ? spriteBoxStyle(it.sprite) : null"
                @click="readFromPreview(it.pageIndex != null ? it.pageIndex : i)"
                @contextmenu.prevent="onImageContextMenu($event, it, i)"
              >
                <div v-if="it.sprite" class="book-preview-sprite" :style="it.sprite" />
                <!-- GIF 超过 5 张时:默认显示静态首帧(thumb),鼠标移上去才换成动图(见 displaySrc)。
                     displaySrc 保证只要这一页有路径就返回非空地址 —— 不会再出现「纯白空格子」 -->
                <img
                  v-else-if="displaySrc(it)" :src="displaySrc(it)" loading="lazy" decoding="async"
                  @mouseenter="hoverGif(it, true)"
                  @mouseleave="hoverGif(it, false)"
                  @load="it.loaded = true"
                  @error="onDetailPreviewError(it)"
                />
                <div v-else class="book-preview-pending"></div>
                <!-- GIF 角标:标出这是动图 -->
                <span v-if="isGif(it)" class="preview-gif-badge">GIF</span>
                <!-- 页码:受「阅读器设置 → 隐藏页码」控制 -->
                <span v-if="!hidePageNumber" class="preview-page-badge">{{ i + 1 }}</span>
              </div>
              <!-- 滑到这里就自动加载下一批(只留一个不可见的哨兵:用户要求预览加载时不要任何转圈/计数,
                   所以这里不再渲染「24/40」与转圈图标,自动加载仍然生效) -->
              <div
                v-if="previewItems.length < previewTotal"
                ref="previewSentinel"
                class="book-preview-sentinel"
                aria-hidden="true"
              ></div>
              </template>
            </div>
          </div>
          <div class="book-preview-error" v-else-if="!isCollection && previewError">{{ previewError }}</div>
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

  <!-- ============ 全部评论弹窗(照 JHenTai 的 EHComment 页)============
       侧边详情点「全部评论」打开这里:大弹窗右侧那一小栏只有 5 行摘要,
       要看完整评论必须另开一个能滚动、能分页、能显示总数的面板。
       EH 的评论在详情页 ?p=N 里分页(每页约 20 条),这里按页拉并追加。 -->
  <el-dialog
    v-model="allCommentsVisible"
    :title="$t('m.allComments') + (allCommentsTitle ? ' — ' + allCommentsTitle : '')"
    width="720px"
    class="all-comments-dialog"
    destroy-on-close
  >
    <div class="all-comments-body" v-loading="allCommentsLoading">
      <div class="all-comments-summary" v-if="allCommentsTotal != null">
        {{ $t('m.allCommentsCount', { n: allCommentsTotal }) }}
      </div>
      <el-scrollbar height="52vh" v-if="allCommentsList.length">
        <div class="all-comment-item" v-for="c in allCommentsList" :key="c.id">
          <div class="all-comment-head">
            <span class="all-comment-author">{{ c.author }}</span>
            <span class="all-comment-score" v-if="c.score">{{ c.score }}</span>
            <span class="all-comment-votes" v-if="c.votes">{{ c.votes }}</span>
          </div>
          <p class="all-comment-content" @contextmenu="onMangaCommentContextMenu($event, c)">{{ c.content }}</p>
        </div>
        <div class="all-comments-more" v-if="allCommentsHasMore">
          <el-button size="small" :loading="allCommentsLoading" @click="loadMoreComments">
            {{ $t('m.allCommentsLoadMore') }}
          </el-button>
        </div>
      </el-scrollbar>
      <div class="all-comments-empty" v-else-if="!allCommentsLoading">
        {{ allCommentsError || $t('m.allCommentsEmpty') }}
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed, h, watch, onBeforeUnmount, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox, ElMessage } from 'element-plus'
import { CaretRight20Regular, CaretLeft20Regular } from '@vicons/fluent'
import { BookmarkTwotone } from '@vicons/material'
import { Loading, ArrowDown, Download, Plus, Close, Delete } from '@element-plus/icons-vue'
import { nanoid } from 'nanoid'
import he from 'he'
import * as linkify from 'linkifyjs'
import ContextMenu from '@imengyu/vue3-context-menu'
// 与阅读器/侧边详细信息同一套「图片右键菜单」
import { buildImageContextMenuItems, imageObjectFromPreview, refreshPreviewItem } from '../imageContextMenu.js'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import { isContextMenuItemEnabled, sortContextMenuItems, ensureBookCover, retryBookCover, bookImgSrc, catDisplayName, getDisplayTagName, resolveCatKey, tagDisplayName, tagColorOf, tagCatRank, galleryCategoryName, categoryDisplayName, compareCollectionBooks } from '../utils.js'
import  { insertLocalReadRecord, toAssetUrl } from '../utils.js'
import { parseGalleryDetail, mergeDetailIntoBook, ehImageSrc, collectGalleryThumbs } from '../ehOnline.js'
import { addTagToBlacklist, setBlacklistEnabled } from '../ehFilter.js'

// 合集预览图的排序口径:由 App 把「合集界面设定的排序」传进来,
// 保证详情页成员网格的顺序与合集抽屉完全一致(名称走自然序,见 utils.compareCollectionBooks)。
const props = defineProps({
  collectionSortKey: { type: String, default: '' },
  collectionSortAsc: { type: Boolean, default: true },
})

const appStore = useAppStore()
const {
  setting, bookDetail, resolvedTranslation,
  bookList, displayBookList, collectionList, openCollectionBookList,
  statusOption, categoryOption,
  pathSep,
} = storeToRefs(appStore)
// 预览图页码角标:与阅读器「隐藏页码」同一个开关(设置 → 阅读器 → 隐藏页码)
const hidePageNumber = computed(() => !!(setting.value && setting.value.hidePageNumber))

// ---------- 预览格尺寸(--preview-cell) ----------
// 需求:预览图太小。对比站 wnacg 每格 160x202、e-hentai 每格高 150 —— 本项目以前死钉 118px
// (详情弹窗是全屏的,118px 铺一大片看着更小)。
// 现在按窗口宽度取 8.5vw,118px 起步、190px 封顶(再大一屏就放不下几格,反而要滚很久)。
// 为什么用 JS 算而不是纯 CSS calc():vw 在「窗口分屏 / 弹窗内边距」下不好与 118/190 做双向夹取,
// 而 el-dialog 是全屏的,窗口 resize 就是唯一的变量,监听一次即可。
const PREVIEW_CELL_MIN = 118
const PREVIEW_CELL_MAX = 190
const previewCell = ref(PREVIEW_CELL_MIN)
let previewCellRaf = 0
const recomputePreviewCell = () => {
  if (previewCellRaf) return
  previewCellRaf = requestAnimationFrame(() => {
    previewCellRaf = 0
    const vw = (typeof window !== 'undefined' && window.innerWidth) || 0
    const want = Math.round(vw * 0.085)
    previewCell.value = Math.max(PREVIEW_CELL_MIN, Math.min(PREVIEW_CELL_MAX, want))
  })
}
onMounted(() => {
  recomputePreviewCell()
  window.addEventListener('resize', recomputePreviewCell)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', recomputePreviewCell)
  if (previewCellRaf) { cancelAnimationFrame(previewCellRaf); previewCellRaf = 0 }
})

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

// ---------- 合集(聚合条目) ----------
// 合集不是一个磁盘文件,而是若干本书的集合。这里复用同一套 fullscreen 详情版式,
// 只在字段口径上做分支:页数/阅读次数求和、评分取「评过分的成员」均值、无意义的入口隐藏。
const isCollection = computed(() => !!(bookDetail.value && bookDetail.value.isCollection))

// 合集成员:按聚合条目的 ids 回 bookList 取**实时对象**
// (老数据没有 ids 时退回 list,那里存的是 hash)
const collectionMembers = computed(() => {
  if (!isCollection.value) return []
  const b = bookDetail.value || {}
  // ★ 优先用聚合条目挂的 _members(元素就是实时书对象):书架卡片也是按它找成员,
  //   两边必须用同一份对象,否则详情页的封面/评分/页数可能与卡片不是同一时刻的数据;
  //   老数据或外部构造的条目没有 _members,再按 ids/list 回退到 bookList 里查。
  let raw
  if (Array.isArray(b._members) && b._members.length) {
    raw = b._members
  } else {
    const keys = Array.isArray(b.ids) && b.ids.length ? b.ids : (Array.isArray(b.list) ? b.list : [])
    raw = []
    for (const key of keys) {
      const m = bookList.value.find(x => x && (x.id === key || x.hash === key))
      if (m) raw.push(m)
    }
  }
  // 预览图顺序 = 合集界面设定的排序(名称 / 时间 / 页数 / 评分)。
  // 没设过排序时保持合集原有顺序,与抽屉的行为一致。
  const key = props.collectionSortKey
  if (!key || raw.length < 2) return raw
  const asc = props.collectionSortAsc
  return [...raw].sort((a, b) => compareCollectionBooks(a, b, key, asc, x => getDisplayTitle(x)))
})
// 合集的页数 / 阅读次数 = 直接取聚合条目上的字段(与书架卡片同一个数,不再各自求一遍和)。
// 聚合条目由 App.loadCollectionList 产出:pageCount = 成员页数合计,readCount = 成员阅读次数合计。
// 成员数据还没加载全时退回就地求和(只为兜底,正常路径不会用到)。
const collectionTotalPages = computed(() => {
  const n = Number((bookDetail.value || {}).pageCount)
  if (Number.isFinite(n) && n > 0) return n
  return collectionMembers.value.reduce((sum, m) => sum + (Number(m && m.pageCount) || 0), 0)
})
const collectionTotalReads = computed(() => {
  const n = Number((bookDetail.value || {}).readCount)
  if (Number.isFinite(n) && n > 0) return n
  return collectionMembers.value.reduce((sum, m) => sum + (Number(m && m.readCount) || 0), 0)
})
// 合集大小 = 成员文件大小合计(合集不是磁盘上的一个文件,但有「这一堆占多少」的实际意义)
// ★ 以前只累加 filesize —— 那是 EH 元数据里的「远端原图大小」,本地书基本是 null,
//   于是合集这一行永远是 0 → 整行不渲染(用户反馈「合集详情没有大小」)。
//   本地书的真实体积在 bundleSize(扫描时算好的、压缩包/目录的字节数),
//   与普通书的「文件大小」行同一个口径(见 fileSizeText)。优先 bundleSize,filesize 兜底。
const collectionTotalSize = computed(() => {
  const total = collectionMembers.value.reduce((sum, m) => {
    if (!m) return sum
    return sum + (Number(m.bundleSize) || Number(m.filesize) || 0)
  }, 0)
  if (!total) return ''
  const fmt = (n) => n >= 1024 * 1024 * 1024 ? (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'
    : n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB'
    : (n / 1024).toFixed(0) + ' KB'
  return fmt(total)
})
// 合集的评分 = 只统计**真的评过分**的成员(rating > 0)的均值。
// 把没评分的成员当成 0 分算进去会把均值拉低,与「平均评分」的直觉不符。
const collectionAvgRating = computed(() => {
  const rated = collectionMembers.value.filter(m => Number(m && m.rating) > 0)
  if (!rated.length) return 0
  const sum = rated.reduce((acc, m) => acc + (Number(m && m.rating) || 0), 0)
  return Math.round((sum / rated.length) * 10) / 10
})

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
  // 标签右键菜单「编辑标签」:冒泡到 App.vue 走现成的 openQuickTagEdit
  'edit-tag',
  // 「加入黑名单」后要求刷新书架(黑名单可能刚被启用)
  'refresh-list',
  // 合集详情里的「编辑合集」:交给 App 打开管理面板并选中该合集
  'editCollection',
  // 合集内联编辑:改名 / 标签批量下发 / 设封面 / 移出或删除成员
  'collection-rename',
  'collection-tags-change',
  'collection-remove-member',
  'collection-set-cover',
  // 合集详情新增的两个批量动作:整组隐藏 / 整组获取元数据(落盘与抓取都由 App 负责)
  'collection-hidden-change',
  'get-collection-metadata',
  // 合集编辑态「添加漫画」:交给 App 打开选择弹窗
  'add-collection-member',
  // 合集详情的「删除合集 / 删除文件」:确认后交给 App 落盘并刷新
  'delete-collection',
])

const dialogVisibleBookDetail = ref(false)

// 封面加载动画(详情页)
// ★ 与书架卡片同一套状态机:只有「加载中(转圈)」与「真失败(文字)」两个状态。
//   封面还没生成出来属于加载中,必须一直转圈等 —— 不能几秒后 / 一次 error 就写「加载失败」。
//   生成失败走退避重试,全部失败才落失败态;coverPath 一变立刻恢复。
const detailCoverLoading = ref(false)
const detailCoverFailed = ref(false)
let detailCoverFailCount = 0
let detailCoverGenAttempt = 0
let detailCoverToken = 0
let detailCoverRetryTimer = null

const clearDetailCoverRetry = () => {
  if (detailCoverRetryTimer) { clearTimeout(detailCoverRetryTimer); detailCoverRetryTimer = null }
}
const stopDetailCoverLoading = () => {
  detailCoverLoading.value = false
}
const startDetailCoverLoading = () => {
  detailCoverFailed.value = false
  detailCoverLoading.value = true
}
const failDetailCover = () => {
  detailCoverFailed.value = true
  detailCoverLoading.value = false
}
const onDetailCoverLoad = () => {
  detailCoverFailCount = 0
  detailCoverGenAttempt = 0
  clearDetailCoverRetry()
  detailCoverFailed.value = false
  const b = bookDetail.value
  if (b) retryBookCover(b)
  stopDetailCoverLoading()
}

// 第一个**有封面**的合集成员:详情页大封面取它的实时 coverPath。
// 以前死取 members[0] —— 它没封面时整页封面空白,而书架卡片取的是「第一个有封面的」,
// 两边还不是同一张图(用户反馈「卡片有图、详情空白」)。
const coverMember = computed(() => {
  // 手动指定过合集封面(coverKey 记的是成员的 hash/id)就优先用它;
  // 没指定 / 指定那本恰好没封面时,才退回「第一个有封面的成员」。
  const key = (bookDetail.value && bookDetail.value.coverKey) || ''
  if (key) {
    const hit = collectionMembers.value.find(m => m && (m.hash === key || m.id === key))
    if (hit && hit.coverPath) return hit
  }
  return collectionMembers.value.find(m => m && m.coverPath) || null
})
// 详情页封面地址:
//  · 普通书:就是它自己的 coverPath
//  · 合集:第一个有封面的成员的实时 coverPath 优先,聚合快照兜底;
//    成员重新生成过封面时带 nonce 强制浏览器重新拉图(同名文件会被缓存)。
const coverSrc = computed(() => {
  const b = bookDetail.value || {}
  // ★ 统一经 bookImgSrc 编码:文件名里的 # / % 会让 file:// 地址失效(封面存在也加载不出来)
  if (!b.isCollection) return bookImgSrc(b.coverPath)
  const m = coverMember.value
  const p = (m && m.coverPath) || b.coverPath || ''
  if (!p) return ''
  const base = bookImgSrc(p)
  const n = m && m._coverNonce
  return n ? base + (base.includes('?') ? '&' : '?') + 'r=' + n : base
})
// 成员封面(合集预览网格用):与卡片同一套 nonce 规则
const memberCoverSrc = (m) => {
  if (!m) return ''
  const p = m.coverPath || ''
  if (!p) return ''
  const base = bookImgSrc(p)
  const n = m._coverNonce
  return n ? base + (base.includes('?') ? '&' : '?') + 'r=' + n : base
}
// 成员封面的加载状态(合集预览网格):
//   undefined/loading = 还没解码出来(只显示空白格,不显示破图图标)
//   ok                = 已经 load 出来(opacity 1)
//   bad               = 这张地址确实读不出来(整张撤掉,后台重新生成)
const memberCoverStates = ref({})
// 每本成员失败过几次:坏封面不能无限「error → 重新生成 → 又 error」地转
const memberCoverErrCount = {}
const memberKeyOf = (m) => String((m && (m.hash || m.id)) || '')
const memberCoverLoaded = (m) => memberCoverStates.value[memberKeyOf(m)] === 'ok'
const memberCoverBroken = (m) => memberCoverStates.value[memberKeyOf(m)] === 'bad'
const setMemberCoverState = (m, state) => {
  const k = memberKeyOf(m)
  if (!k) return
  memberCoverStates.value = { ...memberCoverStates.value, [k]: state }
}
const onMemberCoverLoad = (m) => {
  memberCoverErrCount[memberKeyOf(m)] = 0
  setMemberCoverState(m, 'ok')
}
// 成员封面缺失/失败:真的去生成,而不是画占位块
const onMemberCoverError = (m) => {
  // 先撤掉这张坏图(不再让浏览器画破图图标),再让后台重新生成;
  // 生成成功拿到新地址后回到 loading 态,新 <img> 加载完自己显示。
  setMemberCoverState(m, 'bad')
  if (!m || m.online) return
  const k = memberKeyOf(m)
  const n = (memberCoverErrCount[k] || 0) + 1
  memberCoverErrCount[k] = n
  if (n > 2) return
  ensureBookCover(m)
    .then(next => { if (next) setMemberCoverState(m, 'loading') })
    .catch(() => {})
}
// 换一个合集 / 换一本书:成员封面状态全部从头来
watch(() => (bookDetail.value && bookDetail.value.id), () => {
  memberCoverStates.value = {}
  Object.keys(memberCoverErrCount).forEach(k => { delete memberCoverErrCount[k] })
})

// 封面生成:失败不等于坏书 —— 大书库的封面队列很长,经常只是还没轮到。
// 退避重试若干次,全部失败才落「加载失败」。
const afterDetailEnsure = (next) => {
  clearDetailCoverRetry()
  if (next) return          // 成功:coverPath 变了,watch 会重新转圈,<img> 自己 load
  detailCoverGenAttempt += 1
  if (detailCoverGenAttempt > 2) { failDetailCover(); return }
  const delay = Math.min(1200 * detailCoverGenAttempt, 8000)
  detailCoverRetryTimer = setTimeout(() => {
    detailCoverRetryTimer = null
    if (!detailCoverFailed.value) triggerDetailEnsureCover()
  }, delay)
}
const triggerDetailEnsureCover = () => {
  const b = bookDetail.value
  if (!b || b.online) return
  if (detailCoverRetryTimer) return
  const token = ++detailCoverToken
  detailCoverLoading.value = true
  detailCoverFailed.value = false
  // 合集:生成的是「第一个有封面的成员」的封面(合集自己没有封面文件)
  const target = b.isCollection ? (coverMember.value || collectionMembers.value[0]) : b
  if (!target || target.online) { clearDetailCoverRetry(); return }
  ensureBookCover(target)
    .then((next) => { if (token === detailCoverToken) afterDetailEnsure(next) })
    .catch(() => { if (token === detailCoverToken) afterDetailEnsure(null) })
}
// <img> 读不出来:多半个是「封面正在生成 / 刚写完还没落盘」,继续转圈等,不要立刻判失败。
const onCoverError = () => {
  const b = bookDetail.value
  if (!b) { stopDetailCoverLoading(); return }
  // 在线画廊封面是远程地址:没有本地生成这回事,读不出来就是读不出来
  if (b.online) { failDetailCover(); return }
  detailCoverFailCount += 1
  detailCoverLoading.value = true
  detailCoverFailed.value = false
  if (detailCoverFailCount > 6) { failDetailCover(); return }
  triggerDetailEnsureCover()
}
// 合集打开时:把还没有封面的成员挨个交给生成器(与卡片同一条路径),上限 60 本。
// ★ 并发 3 的队列:以前 60 个 ensure-book-cover 一起发出去会把 IO/CPU 打满。
const COVER_QUEUE_CONCURRENCY = 3
const ensureCollectionCovers = () => {
  const need = collectionMembers.value.filter(m => m && !m.coverPath && !m.online).slice(0, 60)
  let idx = 0
  const worker = async () => {
    while (idx < need.length) {
      const m = need[idx++]
      try { await ensureBookCover(m) } catch (e) { /* 单本失败不阻塞队列 */ }
    }
  }
  const n = Math.min(COVER_QUEUE_CONCURRENCY, need.length)
  for (let i = 0; i < n; i++) worker()
}
watch(
  () => [bookDetail.value?.id, bookDetail.value?.coverPath, bookDetail.value?.isCollection],
  () => {
    const b = bookDetail.value
    detailCoverToken++              // 作废进行中的生成回调
    clearDetailCoverRetry()
    detailCoverFailCount = 0
    detailCoverGenAttempt = 0
    if (!b) { stopDetailCoverLoading(); return }
    if (b.isCollection) ensureCollectionCovers()
    else if (!b.coverPath && !b.online) triggerDetailEnsureCover()
    if (coverSrc.value) startDetailCoverLoading()
    else if (b.online) failDetailCover()
    else { detailCoverFailed.value = false; detailCoverLoading.value = true }
  },
  { immediate: true }
)

// ---------- 预览(放在「故事简介」上方) ----------
// 本地书:取这本书的前 N 张图(只读 IPC,不占用阅读器的 viewerSession)
// 在线画廊:用它自己的页预览缩略图(EH 详情页是雪碧图,按 background-position 偏移取页)
// 页数:filecount 与 pageCount 相同时只显示一个,避免出现「18 | null」
const pageCountText = computed(() => {
  const b = bookDetail.value || {}
  // 合集:页数 = 成员页数之和(合集自己没有「页」)
  if (b.isCollection) return collectionTotalPages.value || '—'
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
// ★ 合集:标签取**全部成员的并集**(实时算,不读聚合快照)。
//   以前直接读 bookDetail.tags —— 那是 App.applyCollectionAggregates 在加载时合并出来的快照,
//   成员后来加了/删了标签不会回填,详情页就一直显示旧集合;而且那份快照一旦缺字段,
//   整个标签区就是一片空白(用户反馈「合集的标签并集没实现」)。
//   这里改成按 collectionMembers 现算:成员怎么变,标签区就怎么变。
const collectionTags = computed(() => {
  const out = {}
  for (const m of collectionMembers.value) {
    const tags = (m && m.tags) || {}
    for (const rawCat in tags) {
      const arr = tags[rawCat]
      if (!Array.isArray(arr) || !arr.length) continue
      // 分类名归一:库里同时存在 parody/作品、character/角色 时并进同一个类别行
      const cat = resolveCatKey(rawCat)
      if (!out[cat]) out[cat] = new Set()
      for (const tag of arr) if (tag) out[cat].add(tag)
    }
  }
  const res = {}
  for (const cat in out) res[cat] = [...out[cat]].sort()
  return res
})
const tagGroups = computed(() => {
  const tags = isCollection.value
    ? collectionTags.value
    : ((bookDetail.value && bookDetail.value.tags) || {})
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

// ---------- 预览里的 GIF:超过 5 张就不许自己动,鼠标悬停才动 ----------
// 一屏十几二十个 GIF 同时解码动画会明显掉帧,所以超过阈值后默认显示主进程给的
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
// 非 GIF 优先用已压好的小图(thumb),没有就**立即**退回原图;
// GIF 超过阈值时默认静态首帧、悬停才放动图。
// 任何分支都不返回空串 —— 返回空会让模板落到占位块,表现就是预览整片空白。
const displaySrc = (it) => {
  if (!it) return ''
  // ★ 非 GIF:优先用小图(主进程压好的长边 ≤360px)。
  //   以前这里直接返回原图 —— 预览格只有 118px 宽却解码整张原图,
  //   图越大越卡,还会拖累界面上其它操作。
  // 非 GIF:有已压好的小图就用,否则**立刻**退回原图(任何情况下都不返回空串,
  // 否则预览会整片空白 —— 这是上一版踩过的坑)
  if (!isGif(it)) return it.thumb || it.src || ''
  // GIF 少:直接放动图;GIF 多:默认静态首帧,悬停那一张才换回动图
  if (gifCount.value <= GIF_ANIM_LIMIT) return it.src || ''
  if (hoveredGif.value === it.src) return it.src || ''
  return it.thumb || it.src || ''
}
// thumb 是小图缓存,可能被清理或写坏:失败就丢掉 thumb 退回原图,让模板重新算 src。
// 以前是直接 display:none → 格子纯白;现在至少还能出图。
const onDetailPreviewError = (it) => {
  if (!it) return
  if (it.thumb) { it.thumb = ''; return }
  // 原图也失败:极端情况(文件已被删/压缩包读不出来),只记一下状态,不弹任何 UI
  it.loaded = true
}
const hoverGif = (it, on) => {
  if (!isGif(it) || gifCount.value <= GIF_ANIM_LIMIT) return
  hoveredGif.value = on ? it.src : null
}
// 静态首帧改成「按需单独取」:主进程的 book-preview-images 不再顺带返回 thumbs,
// 只有本页 GIF 超过阈值时才走 preview-thumbs 补一批(否则每翻一次详情都要为整本生成首帧)。
// 只补「还没有 thumb 的 GIF」,并且每次最多 60 张;thumbFetching 防重入。
// 预览小图:book-preview-images 只回路径(批次很快就返回 → 预览快速铺开),
// 前端随后用 preview-thumbs-batch 在后台补小图,回来再淡入。
// 以前把压图放在批次里同步做,每批要等 1.5s → 界面「先冒几排、再冒几排」。
let thumbFetching = false
const ensurePreviewThumbs = async () => {
  if (thumbFetching) return
  const need = previewItems.value.filter(it => !it.thumb && !it.loaded && it.raw)
  if (!need.length) return
  thumbFetching = true
  const batch = need.slice(0, 24)
  try {
    const r = await ipcRenderer.invoke('preview-thumbs-batch', batch.map(it => it.raw))
    if (r && r.ok && Array.isArray(r.thumbs)) {
      batch.forEach((it, i) => {
        const p = r.thumbs[i]
        // 只升级「原图还没加载完」的格子,避免换源闪烁
        if (p && !it.loaded) it.thumb = toAssetUrl(p)
      })
    }
  } catch (e) {
    // 失败无所谓:显示层用原图兜底
  } finally {
    thumbFetching = false
    // 补图期间又进了新格子:收尾再补一次(已处理过的会被过滤,不会死循环)
    if (previewItems.value.some(x => !x.thumb && !x.loaded && x.raw)) {
      setTimeout(() => { ensurePreviewThumbs() }, 0)
    }
  }
}

// 雪碧图:所有页共用一张图,靠 -Npx 偏移定位。
// ★ 缩放交给 CSS 变量(--cell)驱动,和侧栏预览(SideDetailPanel)同一套做法:
//   以前这里用 transform: scale() + 负 margin 把原尺寸层压到 118px,格子大小一变就得
//   整片重算 style;现在只记「第几格 / 格宽高 / 整张图多宽」,缩放全由 calc(var(--cell) …) 完成,
//   预览格放大到 190px 时雪碧图跟着等比放大,不糊也不重排。
// 雪碧图的 4 个尺寸变量要从「子元素」复制到「格子本身」:
// 格子的 height 用 calc(var(--th)/var(--tw)),而 CSS 变量只向下继承,写在子元素上父级读不到。
const spriteBoxStyle = (s) => ({
  '--ox': s['--ox'],
  '--tw': s['--tw'],
  '--th': s['--th'],
  '--sw': s['--sw'],
})

const spriteStyleOf = (th) => {
  const w = Number(th.width) || 200
  const h = Number(th.height) || 287
  // 整张雪碧图总宽(解析时算好);缺失时退化成一格宽
  const sw = Number(th.spriteWidth) || w
  return {
    backgroundImage: `url(${ehImageSrc(th.thumb)})`,
    '--ox': String(th.offsetX || 0),
    '--tw': String(w),
    '--th': String(h),
    '--sw': String(sw)
  }
}

// get-ex-webpage 失败时主进程返回 null(B 线),具体原因在只读通道 eh-webpage-last-error 里。
// 统一拼成「从 EH 取列表失败…: <原因>」,不要只给一句没有信息量的「失败」。
const ehFailedText = async () => {
  let why = null
  try { why = await ipcRenderer.invoke('eh-webpage-last-error') } catch (e) { why = null }
  const detail = String((why && why.error) || '')
  return t('m.ehOnlineFailed') + (detail ? ': ' + detail : '')
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
    // ★主进程失败时返回 null(B 线):以前这里直接把 null 丢给 parseGalleryDetail,
    //   结果只显示一句「获取失败」,用户不知道是网络、代理还是 Cookie 的问题。
    if (!html) {
      previewError.value = await ehFailedText()
      return
    }
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
      const fresh = (res.files || []).map((f, idx) => ({
        // 这一格是书里的第几页(0 基):删图后列表会前移,不能再用数组下标当页码
        pageIndex: start + idx,
        src: toAssetUrl(f),
        // 小图由 ensurePreviewThumbs() 在后台补(批次不再等压图,避免「一批一批冒出来」)
        thumb: '',
        // 原始绝对路径:右键操作 / 从这一页阅读 / preview-thumbs 都用这个
        raw: f,
      }))
      if (!fresh.length) break
      previewItems.value = previewItems.value.concat(fresh)
      // 这一批进列表后,后台补小图(内部按 !it.thumb 过滤 + 防重入)
      ensurePreviewThumbs()
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
  hoveredGif.value = null
  const b = bookDetail.value
  if (!id || !b) return
  // 合集没有「页预览」这回事:它的 filepath 是多个路径逗号拼接的,拿去解压必然失败。
  // 合集走上面的「成员封面网格」分支,这里必须直接返回。
  if (b.isCollection) return
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
  // 合集:标签落在每个成员身上,不能写聚合条目。这里只把标签加进编辑集合,
  // 由 applyCollectionTags 统一按差量下发(合集编辑界面的「增加标签」按钮)。
  if (isCollection.value) {
    if (!tagGroup.value[cat]) tagGroup.value[cat] = []
    const next = { ...(collectionEditTags.value || {}) }
    if (!Array.isArray(next[cat])) next[cat] = []
    if (!next[cat].includes(name)) next[cat].push(name)
    collectionEditTags.value = next
    if (!(cat in collectionBaseTags.value)) collectionBaseTags.value[cat] = []
    applyCollectionTags()
    newTagDialogVisible.value = false
    return
  }
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
  }
  // 关系写好后把新标签落到书里并保存
  saveBookTags(bookDetail.value)
  newTagDialogVisible.value = false
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

// 打开一个合集并直接进编辑态:合集抽屉里的「编辑合集」用这个入口,
// 与详情页里点「编辑合集」完全同一套界面。
const openCollectionEdit = (book) => {
  if (!book) return
  openBookDetail(book, false)
  if (!editingTag.value) editTags()
  // 已经处于编辑态(上一个合集还开着编辑)时,标题/标签基准要按新合集重算
  else if (isCollection.value) startCollectionEdit()
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

// ---------- 合集:删除合集(只删壳) / 删除合集内全部文件 ----------
// 真正的落盘与刷新交给 App(它持有 collectionList 与整库加载入口),
// 这里只负责二次确认 —— 删除文件是不可逆的「移入回收站」,文案必须写清楚。
const deleteCollectionOnly = async (collection) => {
  const c = collection || bookDetail.value
  if (!c || !c.id) return
  try {
    await ElMessageBox.confirm(t('c.deleteCollectionConfirm'), t('c.deleteCollection'), { type: 'warning' })
  } catch (e) { return }
  emit('delete-collection', { collection: c, withFiles: false })
}
const deleteCollectionFiles = async (collection) => {
  const c = collection || bookDetail.value
  if (!c || !c.id) return
  const n = collectionMembers.value.length
  try {
    await ElMessageBox.confirm(t('c.deleteCollectionFilesConfirm', { n }), t('m.deleteFile'), { type: 'warning' })
  } catch (e) { return }
  emit('delete-collection', { collection: c, withFiles: true })
}

// ---------- 合集:阅读 / 重扫 / 获取元数据 / 隐藏 ----------
// 合集自己不是一本书,这四个动作都落在成员身上:
//   阅读     → 从当前排序的第一本开读(合集的「开头」就是它)
//   重扫     → 逐本重新解析本地文件(页数 / 大小 / 封面),再逐本落库
//   获取元数据 → 整组交给 App 走批量抓取(逐本按 URL / 文件名匹配)
//   隐藏     → 整组 + 合集本身一起隐藏,按钮变成「显示漫画」
const collectionRescanning = ref(false)

const readCollection = () => {
  const first = collectionMembers.value[0]
  if (!first) return
  // ★ 不能直接复用 openLocalBook():它会把 bookDetail 改成传入的那本书,
  //   合集详情会当场「变成」单本详情(isCollection 变 false、返回也回不到合集)。
  //   这里只借它的两条阅读路径:系统看图 / 内置阅读器。
  if (first.online) {
    emit('openContentView', first)
    return
  }
  if (setting.value.imageExplorer) {
    first.readCount = (Number(first.readCount) || 0) + 1
    saveBook(first)
    ipcRenderer.invoke('open-local-book', first.filepath)
  } else {
    // ★ 内置阅读器会把全局 bookDetail 换成「正在读的这本」(它自己就是这么工作的),
    //   合集详情留着不关就会当场变成一个单本详情(合集成员/标签/按钮全没了)。
    //   所以进阅读器前先收起详情 —— 关掉阅读器回到书架,而不是回到一个错乱的详情页。
    dialogVisibleBookDetail.value = false
    emit('openContentView', first)
  }
  insertLocalReadRecord(first.id, first)
}

const rescanCollection = async () => {
  if (collectionRescanning.value) return
  const members = collectionMembers.value.filter(m => m && !m.online)
  if (!members.length) return
  collectionRescanning.value = true
  let ok = 0
  try {
    for (const m of members) {
      try {
        const bookInfo = await ipcRenderer.invoke('patch-local-metadata-by-book', _.cloneDeep(m))
        if (!bookInfo) continue
        _.assign(m, bookInfo)
        await saveBook(m)
        ok += 1
      } catch (e) { /* 单本失败不阻塞其余,最后按成功数提示 */ }
    }
    printMessage('success', t('c.rescanSuccess') + ' (' + ok + '/' + members.length + ')')
  } finally {
    collectionRescanning.value = false
  }
}

const requestCollectionMetadata = () => {
  const members = collectionMembers.value.slice()
  if (!members.length) return
  emit('get-collection-metadata', { collection: bookDetail.value, members })
}

const triggerHiddenCollection = () => {
  const c = bookDetail.value
  if (!c || !c.id) return
  emit('collection-hidden-change', { collection: c, hidden: !c.hiddenBook })
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

// ---------- 合集:内联编辑(名称 / 标签 / 封面 / 成员) ----------
// 合集不是一个 DB 里的「书」,它的元数据分散在两处:
//   · 名称 / 成员 / 封面 → collectionList 里那条记录(App 落盘)
//   · 标签             → 每个成员自己的 tags(合集本身没有标签)
// 所以这里**不能**走 saveBook(合集对象)——那会把聚合快照当成一本书写进库。
// 每类改动都 emit 给 App,由它写到对应的地方。
const collectionEditTitle = ref('')
// 编辑态的标签用独立一份 v-model:合集详情里 bookDetail.tags 是聚合快照,
// 直接绑上去会在用户还没确认时就改坏显示用的数据。
const collectionEditTags = ref({})
// 进入编辑那一刻的标签并集:用来算「这次加了哪些 / 删了哪些」
const collectionBaseTags = ref({})

const startCollectionEdit = () => {
  const b = bookDetail.value || {}
  collectionEditTitle.value = String(b.title || '')
  const snapshot = _.cloneDeep(collectionTags.value)
  collectionEditTags.value = _.cloneDeep(snapshot)
  collectionBaseTags.value = snapshot
}

// 合集改名:交给 App 写 collectionList
const saveCollectionTitle = () => {
  const b = bookDetail.value
  const title = String(collectionEditTitle.value || '').trim()
  if (!b || !title || title === String(b.title || '')) return
  emit('collection-rename', { collection: b, title })
}

// 合集标签:算差量 → 交给 App 批量下发到全部成员
// 删掉的标签 = 每个成员都删;新增的 = 每个成员都加(已经有的不重复加)
const applyCollectionTags = () => {
  const next = collectionEditTags.value || {}
  const base = collectionBaseTags.value || {}
  const cats = new Set([...Object.keys(next), ...Object.keys(base)])
  const add = {}
  const remove = {}
  for (const cat of cats) {
    const a = new Set(next[cat] || [])
    const b = new Set(base[cat] || [])
    const added = [...a].filter(x => !b.has(x))
    const removed = [...b].filter(x => !a.has(x))
    if (added.length) add[cat] = added
    if (removed.length) remove[cat] = removed
  }
  if (!Object.keys(add).length && !Object.keys(remove).length) return
  // 基线立刻推到新值:连续改两次时,第二次的 diff 要对着上一次的结果算
  collectionBaseTags.value = _.cloneDeep(next)
  emit('collection-tags-change', { collection: bookDetail.value, add, remove })
}

// ---------- 合集版「编辑标签」工具栏 ----------
// 合集没有自己的元数据文件,这些按钮要么作用于全部成员,要么只改合集标签的编辑集合。
const addCollectionCategory = () => {
  ElMessageBox.prompt(t('c.inputCategoryName'), t('m.addCategory'), {
    inputPattern: /^[\p{L}\d_]+$/u,
    inputErrorMessage: t('c.categoryNameError')
  }).then(({ value }) => {
    const cat = resolveCatKey(value)
    if (!tagGroup.value[cat]) tagGroup.value[cat] = []
    if (!collectionEditTags.value[cat]) collectionEditTags.value = { ...collectionEditTags.value, [cat]: [] }
  }).catch(() => { /* 取消 */ })
}
// 合集没有「网址」这个概念
const collectionGetMetadataByUrl = () => printMessage('info', t('c.collectionNoUrl'))
// 翻译标题 + 角色识别:逐本跑,写完各自落库
const analyzeCollectionTitles = async () => {
  if (analyzingTitle.value) return
  analyzingTitle.value = true
  let changed = 0
  try {
    for (const m of collectionMembers.value) {
      if (!m || m.online) continue
      try {
        const res = await ipcRenderer.invoke('analyze-book-title-characters', _.cloneDeep(m))
        if (res && res.ok) {
          _.assign(m, res.book)
          await saveBook(m)
          changed += 1
        }
      } catch (e) { /* 单本失败不阻塞其余 */ }
    }
    printMessage(changed ? 'success' : 'info', t('c.collectionAiDone', { n: changed }))
  } finally {
    analyzingTitle.value = false
  }
}
// 重置元数据:整组合集一起重置(先确认)
const resetCollectionMetadata = async () => {
  const members = collectionMembers.value.slice()
  if (!members.length) return
  try {
    await ElMessageBox.confirm(t('c.collectionResetConfirm', { n: members.length }), t('m.resetMetadata'), { type: 'warning' })
  } catch (e) { return }
  let ok = 0
  for (const m of members) {
    if (!m || m.online) continue
    try { await resetMetadata(m); ok += 1 } catch (e) { /* 单本失败不阻塞 */ }
  }
  printMessage('success', t('c.rescanSuccess') + ' (' + ok + '/' + members.length + ')')
  startCollectionEdit()
}
const copyCollectionTags = () => {
  ipcRenderer.invoke('copy-text-to-clipboard', JSON.stringify({ tags: collectionTags.value }))
  printMessage('success', t('c.copiedToClipboard'))
}
// 从剪贴板粘贴标签:并进编辑集合,再按差量下发到全部成员
const pasteCollectionTags = async () => {
  const text = await ipcRenderer.invoke('read-text-from-clipboard')
  let obj = null
  try { obj = JSON.parse(text) } catch (e) { obj = null }
  const tags = obj && obj.tags ? obj.tags : obj
  if (!tags || typeof tags !== 'object') {
    printMessage('warning', t('c.clipboardNoTags'))
    return
  }
  const next = { ...(collectionEditTags.value || {}) }
  for (const rawCat of Object.keys(tags)) {
    if (!Array.isArray(tags[rawCat])) continue
    const cat = resolveCatKey(rawCat)
    if (!Array.isArray(next[cat])) next[cat] = []
    for (const tg of tags[rawCat]) if (tg && !next[cat].includes(tg)) next[cat].push(tg)
    if (!(cat in collectionBaseTags.value)) collectionBaseTags.value[cat] = []
    if (!tagGroup.value[cat]) tagGroup.value[cat] = []
  }
  collectionEditTags.value = next
  applyCollectionTags()
}

// 当前哪个成员是「合集封面」(手动指定过才有)
const isCollectionCover = (m) => {
  const key = bookDetail.value && bookDetail.value.coverKey
  if (!key || !m) return false
  return m.hash === key || m.id === key
}

// 编辑态点成员:不跳进那本书的详情 —— 那会把 bookDetail 换成成员,合集上下文就丢了
const onMemberClick = (m) => {
  if (editingTag.value && !viewerRole.value) return
  openBookDetail(m)
}

const emitRemoveMember = (m) => {
  if (!m) return
  emit('collection-remove-member', { collection: bookDetail.value, member: m, deleteFile: false })
}

const confirmDeleteMember = async (m) => {
  if (!m) return
  try {
    await ElMessageBox.confirm(
      t('c.collectionDeleteMemberConfirm', { title: getDisplayTitle(m) }),
      t('m.deleteFile'),
      { type: 'warning' }
    )
  } catch (e) { return }
  emit('collection-remove-member', { collection: bookDetail.value, member: m, deleteFile: true })
}

// 成员封面右键:设为合集封面 / 移出合集 / 删除文件
const onMemberContextMenu = (e, m) => {
  if (!m) return
  if (viewerRole.value) { openBookDetail(m); return }
  const items = [
    { label: t('m.setAsCollectionCover'), onClick: () => emit('collection-set-cover', { collection: bookDetail.value, member: m }) },
    { label: t('m.removeFromCollection'), onClick: () => emitRemoveMember(m) },
    { label: t('m.deleteFile'), onClick: () => confirmDeleteMember(m) },
  ]
  ContextMenu.showContextMenu({ x: e.x, y: e.y, items })
}

const editTags = () => {
  editingTag.value = !editingTag.value
  if (editingTag.value) {
    if (isCollection.value) startCollectionEdit()
    else if (!_.has(bookDetail.value, 'tags')) bookDetail.value.tags = {}
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
    // 合集:标签改动在 applyCollectionTags 里已经即时下发,这里没有「退出时再存一次」
    if (isCollection.value) return
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

// ---------- 退出编辑态(App 在关弹窗 / 切在线书之前会主动调用) ----------
const exitEditMode = () => {
  if (!editingTag.value) return
  cancelTagLongPress()
  editingTag.value = false
  // 合集:它的标签改动在 applyCollectionTags 里已经批量下发到成员了,
  // 这里绝不能走 saveBookTags(合集对象不是库里的书,写进去只会污染聚合快照)
  if (isCollection.value) return
  // 在线书没有本地元数据可写,直接退出编辑态、绝不落盘
  if (bookDetail.value && bookDetail.value.online) return
  saveBookTags(bookDetail.value)
}

// ---------- 标签:长按 / 右键 ----------
let tagPressTimer = null
const cancelTagLongPress = () => {
  if (tagPressTimer) { clearTimeout(tagPressTimer); tagPressTimer = null }
}
const showTagMenu = (e, tag, key) => {
  if (!tag) return
  if (viewerRole.value) return
  e.preventDefault()
  e.stopPropagation()
  // 菜单只有两项(用户要求):编辑标签 / 加入黑名单。
  // 「从本书移除」已删除 —— 那个动作留给编辑态的选择框(点 × 或右键整类清空)。
  const items = []
  // 编辑标签:打开的就是设置页「双击标签」那个完整编辑器(多语言名 / 改类别 / 配色 / 关联),
  // 载荷与侧边详情完全一致 { tag:{id,cat,tag,letter}, book },App.vue 直接绑 @edit-tag="openFullTagEdit"
  if (!isOnline.value) {
    items.push({
      id: 'editTag',
      label: t('m.editTag'),
      onClick: () => emit('edit-tag', { tag: { id: key + ':' + tag, cat: key, tag, letter: key }, book: bookDetail.value })
    })
  }
  items.push({ id: 'blacklist', label: t('m.addToBlacklist'), onClick: () => addTagToBlacklistAndRefresh(tag) })
  if (!items.length) return
  ContextMenu.showContextMenu({ x: e.x, y: e.y, items })
}
// 「加入黑名单」:写原始 tag 名(过滤用的是原值);加完**必须**通知 App 重读筛选条件,
// 否则 ehFilter 还是启动时的快照 —— 筛选对话框里看不到这个词、列表也不重筛。
const addTagToBlacklistAndRefresh = async (tag) => {
  const r = addTagToBlacklist(tag)
  if (!r || !r.changed) {
    ElMessage.info(t('m.blacklistExists'))
    return
  }
  ElMessage.success(t('m.blacklistAdded', { name: tag }))
  if (!r.blacklistEnabled) {
    try {
      await ElMessageBox.confirm(t('m.blacklistEnableConfirm'), t('m.addToBlacklist'), { type: 'warning' })
      setBlacklistEnabled(true)
    } catch (e) { /* 用户不启用就只加词,不筛 */ }
  }
  // 无论有没有启用都刷新:加词本身也要让筛选对话框看到
  emit('refresh-list')
}
const onTagContextMenu = (e, tag, key) => showTagMenu(e, tag, key)
const startTagLongPress = (e, key, arr) => {
  cancelTagLongPress()
  const el = e && e.target ? e.target.closest('.el-select-dropdown__item, .el-tag, li') : null
  const tag = el ? String(el.textContent || '').trim() : ''
  tagPressTimer = setTimeout(() => { tagPressTimer = null; showTagMenu(e, tag, key) }, 600)
}
// 右键「选择标签」那一行:整类清空(逐个别点太慢)。
// ⚠ 这不是「标签右键菜单」—— 它挂在编辑态的标签选择框整行上,是批量编辑入口,
//   所以保留(标签胶囊上的右键菜单只有「编辑标签 / 加入黑名单」两项)。
const onPickerContextMenu = (e, key, arr) => {
  e.preventDefault()
  const cur = (bookDetail.value && bookDetail.value.tags && bookDetail.value.tags[key]) || []
  const items = []
  if (cur.length) items.push({ id: 'clearCat', label: t('m.clearThisCategory') + ' (' + cur.length + ')', onClick: () => applyTags(key, []) })
  if (Array.isArray(arr) && arr.length) items.push({ id: 'addAll', label: t('m.addToCollection').replace(/合集/g, t('m.tag')), onClick: () => applyTags(key, arr.map(x => x.value).filter(Boolean)) })
  if (!items.length) return
  ContextMenu.showContextMenu({ x: e.x, y: e.y, items })
}

// ---------- 全部评论(侧边详情「全部评论」打开) ----------
// EH 的评论按 ?p=N 分页,每页约 20 条;这里按页拉并追加,和 JHenTai 的 EHComment 页一致。
const allCommentsVisible = ref(false)
const allCommentsTitle = ref('')
const allCommentsLoading = ref(false)
const allCommentsError = ref('')
const allCommentsList = ref([])
const allCommentsTotal = ref(null)
const allCommentsHasMore = ref(false)
const allCommentsUrl = ref('')
let allCommentsPage = 0

// 从「#cdiv > .c1」解析一页评论(与 getComments 用的是同一套选择器)
const parseCommentPage = (html) => {
  const out = []
  try {
    const dom = new DOMParser().parseFromString(String(html || ''), 'text/html')
    dom.querySelectorAll('#cdiv>.c1').forEach(e => {
      const authorEl = e.querySelector('.c2 .c3')
      const scoreTail = e.querySelectorAll('.c2 .nosel')
      let content = (e.querySelector('.c6') || {}).innerHTML || ''
      const foundLink = _.uniqBy(linkify.find(content.replace(/[<"]/gi, ' '), 'url'), 'href')
      content = content.replace(/<br>/gi, '\n').replace(/<.+?>/gi, '')
      content = he.decode(content)
      out.push({
        author: authorEl ? authorEl.textContent : '',
        score: scoreTail.length ? scoreTail[scoreTail.length - 1].textContent : '',
        content,
        id: nanoid(),
        foundLink
      })
    })
  } catch (e) { /* 解析失败当作没有评论 */ }
  return out
}

const loadMoreComments = async () => {
  if (allCommentsLoading.value || !allCommentsUrl.value) return
  allCommentsLoading.value = true
  allCommentsError.value = ''
  try {
    const base = allCommentsUrl.value
    const url = allCommentsPage > 0 ? base + (base.includes('?') ? '&' : '?') + 'p=' + allCommentsPage : base
    const html = await ipcRenderer.invoke('get-ex-webpage', { url, cookie: appStore.cookie })
    const items = parseCommentPage(html)
    allCommentsList.value = allCommentsList.value.concat(items)
    allCommentsPage += 1
    allCommentsHasMore.value = items.length > 0
    if (!items.length) allCommentsTotal.value = allCommentsList.value.length
  } catch (e) {
    allCommentsError.value = String((e && e.message) || e)
  } finally {
    allCommentsLoading.value = false
  }
}

const openAllComments = async (book) => {
  const b = book || bookDetail.value || {}
  allCommentsVisible.value = true
  allCommentsTitle.value = getDisplayTitle(b)
  allCommentsList.value = []
  allCommentsTotal.value = null
  allCommentsError.value = ''
  allCommentsHasMore.value = false
  allCommentsPage = 0
  allCommentsUrl.value = String(b.url || '')
  if (!allCommentsUrl.value) { allCommentsError.value = t('m.allCommentsNoUrl'); return }
  await loadMoreComments()
}

// ---------- 预览图右键:与阅读器/侧边详情同一套图片菜单(共享模块) ----------
const onImageContextMenu = (e, it, index) => {
  e.preventDefault()
  const b = bookDetail.value || {}
  const raw = String((it && it.raw) || '')
  // 在线画廊:沿用「下载本页 / 复制图片地址」
  if (b.online) {
    const url = raw || (it && it.src) || ''
    const items = []
    if (url) {
      items.push({ id: 'downloadPage', label: t('m.downloadPage'), onClick: () => openUrl(url) })
      items.push({ id: 'copyImageUrl', label: t('m.downloadCopyImageUrl'), onClick: () => ipcRenderer.invoke('copy-text-to-clipboard', url) })
    }
    if (!items.length) return
    ContextMenu.showContextMenu({ x: e.x, y: e.y, items })
    return
  }
  // 没有本地路径(极少数情况):只给「从这一页开始阅读」
  if (!raw) {
    ContextMenu.showContextMenu({
      x: e.x, y: e.y,
      items: [{ id: 'readHere', label: t('m.readFromThisPage', { n: index + 1 }), onClick: () => readFromPreview(index) }]
    })
    return
  }
  // 预览项 → 图片对象:relativePath 由共享模块按书类型算好(否则「删除图片」恒失败)
  const image = imageObjectFromPreview(it, b)
  buildImageContextMenuItems({
    image,
    book: b,
    t,
    deps: {
      viewerRole: viewerRole.value,
      printMessage: (type, msg) => printMessage(type, msg),
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

defineExpose({
  dialogVisibleBookDetail,
  editingTag,
  openBookDetail,
  openLocalBook,
  openCollectionEdit,
  rescanBook,
  getComments,
  showFile,
  deleteLocalBook,
  triggerHiddenBook,
  openAllComments
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
  // 「添加漫画」贴着「N 本」右边:按钮自己垂直居中,字号回到正常(不跟标题加粗)
  .preview-add-member
    align-self: center
    margin-left: 4px
    font-weight: 400
.collection-member-empty
  width: 100%
  padding: 24px 0
  font-size: 12px
  color: var(--el-text-color-secondary)
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
  // ★ 格子尺寸改成随窗口缩放(原来死钉 118px):宽弹窗里 118px 铺满一大片、
  //   每格却只有指甲盖大,用户反馈「预览图太小」。现在 --preview-cell 由窗口宽度决定
  //   (118px 起步,8.5vw,上限 190px),和 wnacg 的 160px / EH 的 ~150px 高度一个量级。
  width: var(--preview-cell, 118px)
  // ★ 高度必须给**显式值**:以前是 height:auto + aspect-ratio:3/4,而 img 又是 height:100% ——
  //   百分比高度在「auto 高度父级」里会退化成 auto,于是图片按自身比例把格子撑高,
  //   同一行格子高低参差。给死 3:4 的高度后,img 的 100% 才有参照,整墙才是等高网格。
  height: calc(var(--preview-cell, 118px) * 4 / 3)
  overflow: hidden
  border-radius: 4px
  border: none
  background: transparent
  cursor: pointer
  img
    width: 100%
    height: 100%
    // ★ cover -> contain:cover 会把长页裁成中间一条(看着更小),改成完整显示整页
    object-fit: contain
    display: block
.book-preview-sprite
  background-repeat: no-repeat
  // 雪碧图切片:跟着 --preview-cell 等比缩放(数值来自 spriteStyleOf 的 --tw/--th/--sw/--ox)
  width: var(--preview-cell, 118px)
  height: calc(var(--preview-cell, 118px) * var(--th, 1) / var(--tw, 1))
  background-size: calc(var(--sw, 1) * var(--preview-cell, 118px) / var(--tw, 1)) auto
  background-position: calc(var(--ox, 0) * var(--preview-cell, 118px) / var(--tw, 1) * -1) 0
// 雪碧图格子:高度交给切片自己算(EH 页多为 100x140,比 3/4 高),
// 不然 3/4 的盒子会把长页底部切掉一条
.book-preview-item.is-sprite
  aspect-ratio: auto
  height: calc(var(--preview-cell, 118px) * var(--th, 1.4) / var(--tw, 1))
// 预览格的「空白占位」:图还没解码出来 / 没有图时铺一层极淡的底,
// 只表示「这里有一格」,不是破图也不是转圈(用户要求加载时不要残缺图)
.book-preview-pending
  width: 100%
  height: 100%
  border-radius: 4px
  background: var(--el-fill-color-lighter, rgba(0, 0, 0, .03))
// 合集成员格(编辑态)
// 编辑态给每格加一圈描边,一眼看出「现在改的是整个合集」;
// 当前合集封面用另一圈颜色 + 左上角角标标出来,不然右键设过之后看不出区别。
.collection-member-item
  position: relative
  // 占位与封面都绝对定位铺满格子:占位始终垫在下面,封面加载完再显出来
  // (否则占位会把 <img> 往下顶出格子)。加载完成前封面完全透明 → 不闪破图图标
  .book-preview-pending
    position: absolute
    inset: 0
  .collection-member-cover
    position: absolute
    inset: 0
    width: 100%
    height: 100%
    object-fit: contain
    opacity: 0
    &.is-loaded
      opacity: 1
  &.is-editing
    box-shadow: inset 0 0 0 2px var(--el-color-primary-light-5)
  &.is-cover
    box-shadow: inset 0 0 0 2px var(--el-color-warning)
.member-op
  position: absolute
  right: 4px
  z-index: 4
  display: flex
  align-items: center
  justify-content: center
  width: 22px
  height: 22px
  border-radius: 50%
  color: #fff
  cursor: pointer
  transition: transform .15s ease
  &:hover
    transform: scale(1.12)
  &.member-op-remove
    top: 4px
    background: rgba(64, 158, 255, .92)
  &.member-op-delete
    bottom: 4px
    background: rgba(245, 108, 108, .92)
.member-cover-badge
  position: absolute
  left: 4px
  top: 4px
  z-index: 3
  padding: 0 6px
  height: 20px
  line-height: 20px
  border-radius: 10px
  font-size: 11px
  color: #fff
  background: var(--el-color-warning)
.collection-edit-hint
  margin-top: 8px
  font-size: 12px
  line-height: 1.6
  color: var(--el-text-color-secondary)
// 自动加载哨兵:不可见(用户要求预览加载期间不显示转圈/计数),只占 1px 供 IntersectionObserver 命中
.book-preview-sentinel
  width: 1px
  height: 1px
  overflow: hidden
  opacity: 0
  pointer-events: none
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
    // 「编辑合集」单独占一整排(用户要求):盒子拉满一行,不再和「获取元数据」挤两列
    .detail-func-btn.is-wide
      flex: 1 0 100%
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
  // 「标签不超过类别」:类别名固定左列(80px 右对齐),内容从 90px 起,
  // 长标签列表只在自己列内换行,永远不会绕到类别名左边。
  // ★ 这里以前是「label 绝对定位 + top:4px」的写法:绝对定位的 top 以**内边距盒**为基准,
  //   而内容是从 cell 的 padding-top(8px)才开始排 —— 两者天然差 4px,
  //   于是纯文字行(页数/文件大小/阅读次数/修改时间)的标签整体往上飘,和数值对不齐
  //   (用户截图里就是这个现象)。改成 flex + 基线对齐后,文字行和标签胶囊行都按
  //   首行基线对齐,不再依赖任何魔数,换主题/换字号也不会再漂。
  .el-descriptions__cell
    display: flex
    align-items: baseline
    gap: 10px
    padding-left: 0 !important
  .el-descriptions__label
    flex: 0 0 80px
    width: 80px
    text-align: right
    line-height: inherit
  .el-descriptions__content
    flex: 1 1 auto
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
  // 真生成不出来:与封面/转圈同尺寸同位,盖住破图
  .cover-failed
    position: absolute
    top: 0
    left: 50%
    transform: translateX(-50%)
    width: min(250px, 100%)
    height: 354px
    display: flex
    align-items: center
    justify-content: center
    background: var(--el-fill-color-light, #f2f3f5)
    color: var(--el-text-color-placeholder, #a8abb2)
    font-size: 13px
    line-height: 1
    border-radius: 4px
    pointer-events: none
    background: var(--el-fill-color-light, rgba(0, 0, 0, .04))
    color: var(--el-color-primary, #409eff)
    border-radius: 4px
    z-index: 6
    pointer-events: none
  // 没有封面可显示 / 加载失败(与封面同尺寸、同样可点)
  .book-detail-cover-empty
    display: flex
    align-items: center
    justify-content: center
    background: var(--el-fill-color-light, #f2f3f5)
    color: var(--el-text-color-placeholder, #a8abb2)
    font-size: 14px
    font-weight: 400
    user-select: none
</style>


<style lang="stylus">
/* ---- 详情弹窗:关掉打开/关闭的淡入淡出动画 ----
   它是 fullscreen 的,里面有几十上百个预览格;Element Plus 的 dialog-fade 对**整个 overlay 层**
   做 300ms opacity 动画,动画期间每帧都要重新光栅化整块 → 实测关闭时最大帧 119~138ms。
   去掉后同样操作最大帧 6~10ms(约 14 倍)。只影响这个弹窗(靠 modal-class 定位)。 */
.dialog-detail-modal.dialog-fade-enter-active,
.dialog-detail-modal.dialog-fade-leave-active
  animation: none !important
.dialog-detail-modal
  .el-dialog, .el-dialog.is-fullscreen
    animation: none !important
    transition: none !important

/* ---- 关闭按钮被裁的修复 ----
   以前只给了 margin(8px 16px 0 0),全屏弹窗贴到窗口边缘时按钮右半边会被 dialog 的 overflow 裁掉。
   现在 header 右侧留 56px 固定避让位,按钮改 top/right 绝对定位,尺寸放大到 36px。
   ★ 2026-11:编辑态右侧第一个输入框的右上角会被这个 ✕ 压住(用户截图)。
     两件事一起做:按钮整体上移到 top:0(36→32px),内容区再往下让 12px。 */
.el-dialog.is-fullscreen.dialog-detail
  .el-dialog__header
    position: relative
    padding-right: 56px
    .el-dialog__headerbtn
      position: absolute
      top: 0
      right: 10px
      margin: 0
      width: 32px
      height: 32px
      display: flex
      align-items: center
      justify-content: center
      z-index: 20
      .el-icon
        width: 24px
        height: 24px
        svg
          height: 24px
          width: 24px
  // 内容区整体下移一点:避免右上角 ✕ 与编辑态第一行输入框的右上角叠在一起
  .el-dialog__body
    padding-top: 20px

/* ---- 预览格 ----
   一次渲染几十上百个格子:content-visibility 让离屏的不参与布局/绘制。
   ★ 用户要求取消「加载时淡入淡出」:以前 img 是 opacity 0 → 1 的 .18s 过渡,
     连续翻页/滚动时会看到一片「忽明忽暗」;现在图片解码完就直接显示(没有过渡,
     也没有 is-ready 开关)—— 加载过程也不再有任何转圈占位。 */
.book-preview-item
  content-visibility: auto
  contain-intrinsic-size: var(--preview-cell, 118px) calc(var(--preview-cell, 118px) * 4 / 3)
</style>
