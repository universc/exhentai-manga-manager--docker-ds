<template>
  <!-- ★ 面板已经 Teleport 到 .app-body(不再占 el-row 的列),所以这里必须占满 24 栅格;
       以前是 :span="20",右侧会空出 4/24 的白条(用户截图里的右侧红框)。 -->
  <!-- ★ 2026-11「管理」合并:原来这里是两个 el-col —— .book-collect-view(管理合集,用 book.collected
       打 ✓/+)和 .book-tag-edit-view(管理标签,用 book.selected)。两段模板几乎一样,而且两个开关
       互不复位 —— 「先点管理合集、再点管理标签」之后它们同时为 true,同一批书被叠着渲染两遍。
       现在只留一个网格,选中态只用 book.selected 一套:合集与标签共用这批选区。 -->
  <el-col :span="24" v-if="manageView" class="book-manage-view"
    :style="editGridStyle"
    @mousedown="handleMouseDownForSelection" @mouseup="handleMouseUpForSelection" @mousemove="handleMouseMoveForSelection"
  >
    <div
      v-for="book in visibleManageBookList" :key="book.id"
      v-lazy:[book.id]="{'enter': loadBookCardContent, 'leave': unloadBookCardContent}"
      class="book-manage-card-frame"
    >
      <transition name="pop">
        <el-badge
          v-if="visibilityMap[book.id]"
          :value="book.selected ? '✓' : '+'"
          :type="book.selected ? 'success' : 'warning'"
          class="book-add-badge"
        >
          <!-- ⚠ :id="book.id" 必须保留:拖框多选(handleMouseUpForSelection)靠它反查 book -->
          <div class="book-manage-card selectable-card" @contextmenu="$emit('previewManga', book)" :id="book.id" @click="toggleBookSelected(book)">
            <p class="book-manage-title" :title="getDisplayTitle(book)">{{getDisplayTitle(book)}}</p>
            <el-popover placement="left" :width="300" trigger="hover" :show-after="1000" :hide-after="100">
              <template #reference>
                <!-- 封面包一层:成员角点要压在「封面」左上角。
                     如果直接挂在 .book-manage-card 上(top:6px),位置会落在标题第一行上、盖住书名的头几个字
                     —— 合并后的卡片是「标题在上、封面在下」,封面顶边在卡片内约 46px 处。
                     包一层 relative 容器就不必写 46px 这种魔数,标题高度以后改了也不会漂。 -->
                <span class="book-manage-cover-wrap">
                  <img class="book-manage-cover" :src="bookImgSrc(book.coverPath)"/>
                  <!-- 合集成员角点:纯提示,和选中态(book.selected)完全无关,
                       只为让用户看得出「哪几本已经是当前合集的成员」,别让「移出选中」变盲操作 -->
                  <span v-if="currentCollectionHashes.has(book.hash || book.id)" class="book-manage-member-dot"></span>
                </span>
              </template>
              <el-descriptions :column="1" size="small" class="book-tag-edit-popover">
                <el-descriptions-item :label="$t('m.pageCount')+':'">
                  <el-tag class="book-tag" :type="book.pageDiff ? 'danger' : 'info'">{{book.pageCount}} | {{book.filecount}}</el-tag>
                </el-descriptions-item>
                <el-descriptions-item :label="$t('m.metadataStatus')+':'">
                  <el-tag class="book-tag" :type="book.status === 'non-tag' ? 'info' : book.status === 'tagged' ? 'success' : 'warning'"
                  @click="$emit('searchFromTag', book.status)">{{book.status}}</el-tag>
                </el-descriptions-item>
                <el-descriptions-item :label="$t('m.category')+':'">
                  <el-tag type="info" class="book-tag" @click="$emit('searchFromTag', book.category)">{{book.category}}</el-tag>
                </el-descriptions-item>
                <el-descriptions-item v-for="(tagArr, key) in book.tags" :label="resolvedTranslation[key]?._name || key + ':'" :key="key">
                  <el-tag type="info" class="book-tag" v-for="tag in tagArr" :key="tag" @click="$emit('searchFromTag', tag, key)"
                    @mousedown="startTagPress(key, tag, book)"
                    @mouseup="cancelTagPress"
                    @mouseleave="cancelTagPress"
                    @touchstart.passive="startTagPress(key, tag, book)"
                    @touchend="cancelTagPress"
                    @touchmove.passive="cancelTagPress"
                    :title="$t('m.editTagNames')"
                  >{{resolvedTranslation[key]?.[tag]?.name || tag }}</el-tag>
                </el-descriptions-item>
              </el-descriptions>
            </el-popover>
          </div>
        </el-badge>
      </transition>
    </div>
  </el-col>
  <!-- 管理（合集+标签）的操作面板:投送到 App.vue 的 #emm-manage-tag-slot(与侧边详细信息同级的右栏)。
       ★ 以前这里是 el-col :span="4",嵌在 .book-card-area 的 el-row 里 —— 高度只有「工具栏到分页条」
         之间那一段,和整列通高的右栏观感完全不同。投送出去后高度由 .app-body 决定。
       v-loading 仍挂在 .emm-manage-body 上(蒙层会盖住拖宽手柄)。 -->
  <Teleport to="#emm-manage-tag-slot" v-if="manageView">
    <div class="book-tag-edit-operation emm-manage-col" :style="opColStyle">
      <div class="emm-manage-panel">
      <div class="emm-op-resizer" :title="$t('m.downloadPanelResizeHint')" @mousedown="startOpResize"></div>
      <div class="emm-manage-header">
        <!-- 合并后只有一个「管理」面板:标题不再分「管理标签/管理合集」,
             两个分区各自的小标题由下面的 el-divider 承担 -->
        <span class="emm-manage-title">{{ $t('m.manage') }}</span>
        <span class="emm-manage-actions">
          <!-- 只有退出,没有「提交」按钮:标签/类别/元数据都是一点就落盘;
               合集改动例外 —— 它只改内存,要点合集区的「保存」才写入,
               所以退出时会拦一次「合集改动还没保存,确定放弃?」(见 exitManageView)。 -->
          <el-button type="danger" plain :icon="MdExit" :title="$t('m.exit')" @click="exitManageView"></el-button>
        </span>
      </div>
      <div class="emm-manage-body" v-loading="updateTagsLoading">
        <!-- 已选中计数:左边网格勾的 + 当前合集的成员,两边都算「已选中」 -->
        <div class="manage-selected-head">
          <span class="manage-selected-count">{{ $t('m.selectedCount', { n: selectedBookObjects.length }) }}</span>
          <el-space>
            <el-button size="small" type="primary" plain @click="selectAllBooks">{{$t('m.selectAll')}}</el-button>
            <el-button size="small" type="primary" plain @click="unselectAllBooks">{{$t('m.unselectAll')}}</el-button>
          </el-space>
        </div>
        <!-- 合集:分区标题 + 「选择合集」按钮。
             ★ 原来这里是一个 el-select 下拉框(占位文案「选择一个合集来编辑」)。
               面板最窄只有 260px,合集名长一点就被截断,也看不出每个合集有几本。
               现在改成按钮 + 居中弹窗:弹窗里列全名 + 成员数,还能搜索。 -->
        <el-divider content-position="left">
          <span class="emm-divider-label label-with-hint">{{$t('m.manageCollection')}}<SettingHint :title="$t('m.manageCollection')" :lines="[$t('m.hintManageCollection')]" /></span>
        </el-divider>
        <el-button
          class="manage-collection-pick"
          type="primary"
          plain
          :icon="Collections24Regular"
          :title="$t('m.pickCollection')"
          @click="collectionPickDialogVisible = true"
        >{{ currentCollectionTitle || $t('m.pickCollection') }}</el-button>
        <div class="emm-manage-actions-row">
          <el-button class="emm-manage-act" size="small" type="primary" plain :icon="Collections24Regular" :title="$t('m.addCollection')" @click="addCollection"></el-button>
          <el-button class="emm-manage-act" size="small" type="warning" plain :icon="Wand24Regular" :title="$t('m.autoCollectionTitle')" @click="$emit('auto-collection')"></el-button>
          <el-button class="emm-manage-act" size="small" type="success" plain :icon="Edit" :title="$t('m.editCollection')" @click="editCollection"></el-button>
          <el-button class="emm-manage-act" size="small" :icon="Save16Regular" :title="$t('m.save')" @click="saveCollection">{{ $t('m.save') }}</el-button>
        </div>
        <!-- 已选中:网格里勾的 + 当前合集的成员,合并成一条列表。
             ★ 原来这里是「当前合集的成员列表」,只显示合集里的书;
               改成「已选中」之后,用户在左边勾的书也会立刻出现在这里,
               下面的 13 个操作按钮作用于整条列表,不必先加进合集才能批量处理。 -->
        <el-divider content-position="left">
          <span class="emm-divider-label label-with-hint">{{$t('m.selectedBooks')}}<SettingHint :title="$t('m.selectedBooks')" :lines="[$t('m.hintSelectedBooks')]" /></span>
        </el-divider>
        <div class="manage-collection-block" ref="collectionSectionRef">
          <div v-if="selectedBookObjects.length" class="manage-collection-list">
            <div v-for="book in selectedBookObjects" :key="book.id" class="book-collection-line">
              <img class="book-collection-cover" :src="bookImgSrc(book.coverPath)" />
              <p class="book-collection-title" :title="getDisplayTitle(book)">{{getDisplayTitle(book)}}</p>
              <!-- × = 从「已选中」里去掉这本书:网格勾选一并取消,属于当前合集的也移出合集 -->
              <el-icon :size="18" color="#FF0000" class="book-collection-remove" @click="removeFromSelected(book)"><IosRemoveCircleOutline /></el-icon>
            </div>
          </div>
          <div v-else class="manage-collection-empty">{{ $t('m.selectedEmpty') }}</div>
        </div>

        <!-- 已选中的批量操作:所有动作都作用于上面「已选中」那一条列表。
             ★ 原来这些动作散在「标签 / 类别 / 元数据状态 / 移动文件 / 其他」五个分区里,
               每个分区各带一个下拉框或输入控件,面板要滚很久才找得到底。
               现在压成一条两列按钮网:需要参数的走弹窗(标签/类别/状态/移动),
               不需要参数的直接执行。 -->
        <el-divider content-position="left">
          <span class="emm-divider-label label-with-hint">{{$t('m.selectedActions')}}<SettingHint :title="$t('m.selectedActions')" :lines="[$t('m.hintSelectedActions')]" /></span>
        </el-divider>
        <div class="selected-action-grid">
          <el-button size="small" type="primary" plain @click="openAddToCollectionPick">{{$t('m.addToCollection')}}</el-button>
          <el-button size="small" type="primary" plain @click="addCollectionWithSelected">{{$t('m.addCollection')}}</el-button>
          <el-button size="small" type="primary" plain @click="tagEditDialogVisible = true">{{$t('m.changeTag')}}</el-button>
          <el-button size="small" type="primary" plain @click="categoryDialogVisible = true">{{$t('m.changeCategory')}}</el-button>
          <el-button size="small" type="primary" plain @click="statusDialogVisible = true">{{$t('m.changeStatus')}}</el-button>
          <el-button size="small" type="primary" plain @click="moveDialogVisible = true">{{$t('m.moveFile')}}</el-button>
          <el-button size="small" type="primary" plain @click="groupGetMetadata">{{$t('m.batchGetMetadata')}}</el-button>
          <el-button size="small" type="primary" plain @click="groupReGetMetadata">{{$t('m.reGetMetadataShort')}}</el-button>
          <el-button size="small" type="danger" plain @click="groupDeleteLocalBook">{{$t('m.deleteFile')}}</el-button>
          <el-button size="small" type="primary" plain @click="groupTriggerHiddenBook(false)">{{$t('m.showManga')}}</el-button>
          <el-button size="small" type="primary" plain @click="groupTriggerHiddenBook(true)">{{$t('m.hideManga')}}</el-button>
          <el-button size="small" type="primary" plain @click="groupRescanBook">{{$t('m.rescan')}}</el-button>
          <el-button size="small" type="primary" plain @click="runTaskForSelected('translate')">{{$t('m.translateBook')}}</el-button>
          <el-button size="small" type="primary" plain @click="runTaskForSelected('upscale')">{{$t('m.upscaleBook')}}</el-button>
        </div>
        <!-- 增加标签:选类别 + 输入名称;同名标签必须指定所属集合以区分 -->
        <el-dialog v-model="addTagDialogVisible" :title="$t('m.addNewTag')" width="420px" append-to-body>
          <div class="add-tag-form">
            <el-select v-model="addTagForm.cat" :placeholder="$t('m.category')" style="width: 100%; margin-bottom: 10px;" @change="checkAddTagDuplicate">
              <el-option v-for="c in tagCatOptions" :key="c" :label="c" :value="c" />
            </el-select>
            <el-input v-model="addTagForm.name" :placeholder="$t('m.tagNamePlaceholder')" @input="checkAddTagDuplicate" />
            <div v-if="addTagDuplicate.length" class="add-tag-warn">
              <p class="add-tag-warn-text">{{ $t('m.tagDuplicateHint') }}</p>
              <el-select v-model="addTagForm.parent" filterable :placeholder="$t('m.pickParentSet')" style="width: 100%;">
                <el-option v-for="o in tagParentOptions" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </div>
          </div>
          <template #footer>
            <el-button size="small" @click="addTagDialogVisible = false">{{ $t('m.cancel') }}</el-button>
            <el-button size="small" type="primary" :disabled="!canCreateTag" @click="createNewTag">{{ $t('m.apply') }}</el-button>
          </template>
        </el-dialog>
        <!-- ★ 选择合集:居中弹窗,替代原来那个 260px 宽的下拉框。
             同一个弹窗两种用途 ——
               mode='select':切换「当前正在编辑的合集」(下拉框原本的语义);
               mode='add'   :把「已选中」里的书一次性加进某个合集(原来要先切过去再点「加入选中」)。
             列全名 + 成员数 + 可搜索:长标题不再被截断,也看得出每个合集有几本。 -->
        <el-dialog
          v-model="collectionPickDialogVisible"
          :title="collectionPickMode === 'add' ? $t('m.addToCollection') : $t('m.pickCollection')"
          width="460px"
          align-center
          append-to-body
        >
          <el-input
            v-model="collectionPickKeyword"
            class="collection-pick-search"
            :placeholder="$t('m.search')"
            clearable
          />
          <div class="collection-pick-list">
            <div
              v-for="c in filteredCollectionList"
              :key="c.id"
              class="collection-pick-item"
              :class="{ 'is-active': c.id === selectCollection }"
              @click="onCollectionPickClick(c)"
            >
              <span class="collection-pick-name" :title="c.title">{{ c.title }}</span>
              <span class="collection-pick-count">{{ (c.list || []).length }}</span>
            </div>
            <div v-if="!filteredCollectionList.length" class="collection-pick-empty">{{ $t('m.collectionPickEmpty') }}</div>
          </div>
          <template #footer>
            <el-button size="small" @click="collectionPickDialogVisible = false">{{ $t('m.cancel') }}</el-button>
            <el-button size="small" type="primary" plain @click="addCollection">{{ $t('m.addCollection') }}</el-button>
          </template>
        </el-dialog>
        <!-- 更改标签:原来这一整块(标签多选 + 加入/移除 + 增加标签)常驻在面板里,
             现在收进弹窗,面板上只留一个「更改标签」按钮 -->
        <el-dialog v-model="tagEditDialogVisible" :title="$t('m.changeTag')" width="440px" align-center append-to-body>
          <el-select
            v-model="groupTagSelected"
            class="manage-tag-select"
            filterable clearable multiple collapse-tags
            :collapse-tags-tooltip="true"
            :reserve-keyword="false"
            :placeholder="$t('m.manageTagPickPlaceholder')"
            popper-class="manage-tag-popper"
            style="width: 100%"
          >
            <el-option
              v-for="opt in tagListForSelect"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            >
              <span class="manage-tag-option">{{ opt.label }}</span>
            </el-option>
          </el-select>
          <template #footer>
            <el-button size="small" @click="tagEditDialogVisible = false">{{ $t('m.cancel') }}</el-button>
            <el-button size="small" type="success" plain @click="openAddTagDialog">{{ $t('m.addNewTag') }}</el-button>
            <el-button size="small" type="primary" plain @click="addTagToGroupAndClose">{{ $t('m.addGroupTag') }}</el-button>
            <el-button size="small" type="primary" plain @click="removeTagToGroupAndClose">{{ $t('m.removeGroupTag') }}</el-button>
          </template>
        </el-dialog>
        <!-- 更改类别 -->
        <el-dialog v-model="categoryDialogVisible" :title="$t('m.changeCategory')" width="380px" align-center append-to-body>
          <el-select v-model="categorySelected" :placeholder="$t('m.category')" clearable style="width: 100%">
            <el-option v-for="cat in categoryOption" :value="cat" :key="cat" :label="galleryCategoryName(cat, $t)" />
          </el-select>
          <template #footer>
            <el-button size="small" @click="categoryDialogVisible = false">{{ $t('m.cancel') }}</el-button>
            <el-button size="small" type="primary" @click="applyCategoryAndClose">{{ $t('m.apply') }}</el-button>
          </template>
        </el-dialog>
        <!-- 更改元数据状态 -->
        <el-dialog v-model="statusDialogVisible" :title="$t('m.changeStatus')" width="380px" align-center append-to-body>
          <el-select v-model="statusSelected" :placeholder="$t('m.metadataStatus')" style="width: 100%">
            <el-option v-for="status in statusOption" :value="status" :key="status" :label="status" />
          </el-select>
          <template #footer>
            <el-button size="small" @click="statusDialogVisible = false">{{ $t('m.cancel') }}</el-button>
            <el-button size="small" type="primary" @click="applyStatusAndClose">{{ $t('m.apply') }}</el-button>
          </template>
        </el-dialog>
        <!-- 移动文件 -->
        <el-dialog v-model="moveDialogVisible" :title="$t('m.moveFile')" width="440px" align-center append-to-body>
          <el-cascader
            v-model="selectFolderToMove"
            :options="folderTreeData"
            :props="{
              checkStrictly: true,
            }"
            filterable
            clearable
            :filter-method="filterFolderMethod"
            popper-class="book-tag-edit-cascader-popper"
            style="width: 100%"
          />
          <template #footer>
            <el-button size="small" @click="moveDialogVisible = false">{{ $t('m.cancel') }}</el-button>
            <el-button size="small" type="primary" @click="applyMoveFileAndClose">{{ $t('m.move') }}</el-button>
          </template>
        </el-dialog>

        <!-- ★ 第4项:把「设置 → 标签设置」里的各项也放到这里,改标签时不用来回跳设置页。
             只做「最常用的三项」,完整编辑器(配色/改名/关联/删除)还是留在设置页。 -->
        <el-divider content-position="left">
          <span class="emm-divider-label label-with-hint">{{$t('m.manageTagSettingsSection')}}<SettingHint :title="$t('m.manageTagSettingsSection')" :lines="[$t('m.hintManageTagSettings')]" /></span>
        </el-divider>
        <!-- 注:上面这块是「标签设置」快捷区(类别顺序/翻译语言/默认类别),与设置页同一批字段 -->

        <!-- ① 类别标签顺序:可拖动排序,决定详细信息里标签分类的上下顺序 -->
        <div class="manage-tag-setting-line">
          <span class="manage-tag-setting-label">{{$t('m.tagCatSet')}}</span>
        </div>
        <draggable
          v-model="manageTagCatOrder"
          item-key="id"
          class="manage-tag-cat-drag"
          animation="180"
          @end="saveTagCatOrder"
        >
          <template #item="{ element }">
            <span class="manage-tag-cat-chip">{{ categoryLabel(element.cat) }}</span>
          </template>
        </draggable>

        <!-- ② 标签翻译目标语言 -->
        <div class="manage-tag-setting-line">
          <span class="manage-tag-setting-label">{{$t('m.tagTranslate')}}</span>
          <el-select v-model="manageTagTargetLang" size="small" class="manage-tag-setting-select" @change="saveTagTargetLang">
            <el-option v-for="lang in tagLangOptions" :key="lang.value" :value="lang.value" :label="lang.label" />
          </el-select>
        </div>

        <!-- ③ 生成标签时默认归入的类别 -->
        <div class="manage-tag-setting-line">
          <span class="manage-tag-setting-label">{{$t('m.tagGenCategories')}}</span>
          <el-select v-model="manageTagGenCategories" size="small" multiple collapse-tags clearable class="manage-tag-setting-select" @change="saveTagGenCategories">
            <el-option v-for="cat in categoryOption" :key="cat" :value="cat" :label="galleryCategoryName(cat, $t)" />
          </el-select>
        </div>
        </div>
      </div>
    </div>
  </Teleport>
  <div id="selection-box" ref="selectionBox"></div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
// 类 macOS 惯性滚动:管理标签 / 管理合集的面板主体要跟主界面一致(以前只有 .book-card-area 绑了)
import { attachInertiaScroll } from '../inertia-scroll.js'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
// ⚠ 不要 import { ipcRenderer } from 'electron'!
//   preload.js 已经用 contextBridge 把它挂到 window 上了(见 preload.js:3),
//   组件里直接用全局 ipcRenderer 即可。
//   一旦 import electron 模块,打包器会把整个 Electron 主进程代码塞进渲染端 bundle,
//   运行时立刻炸在 __dirname is not defined —— 整页白屏(这次就是这么挂的)。
import { IosRemoveCircleOutline } from '@vicons/ionicons4'
// 管理面板头部那排功能按钮的图标(原来在 App.vue 的工具栏里)
import { Collections24Regular, Wand24Regular, Save16Regular } from '@vicons/fluent'
import { MdExit } from '@vicons/ionicons4'
import { Edit } from '@element-plus/icons-vue'
import draggable from 'vuedraggable'
import { nanoid } from 'nanoid'
// 分区标题旁的感叹号说明(与设置页同一个组件,观感一致)
import SettingHint from './SettingHint.vue'

import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import { galleryCategoryName, bookImgSrc } from '../utils.js'
const appStore = useAppStore()
const {
  cat2letter,
  statusOption,
  categoryOption,
  setting,
  resolvedTranslation,
  bookList,
  displayBookList,
  chunkDisplayBookList,
  collectionList,
  openCollectionBookList,
  manageView,
  folderTreeData,
  tagListForSelect,
  visibleManageBookList,
 } = storeToRefs(appStore)
const { getDisplayTitle, saveBook, printMessage, filterFolderMethod } = appStore

const { t } = useI18n()

// ---------- 管理标签页底部的「标签设置」快捷项 ----------
// 直接把 setting 上的字段包成本地 computed:读走 setting,写回 setting 并落盘,
// 这样不用在 EditView 里再维护一份状态(避免两处不同步)。
const tagLangOptions = computed(() => [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' }
])
// 类别标签顺序:tagCatOrder 是 ['language','parody',...] 的数组,拖拽后写回
const manageTagCatOrder = computed({
  get: () => (setting.value.tagCatOrder || []).map(cat => ({ id: cat, cat })),
  set: (val) => {
    if (!setting.value) return
    setting.value.tagCatOrder = val.map(it => it.cat)
  }
})
const manageTagTargetLang = computed({
  get: () => setting.value.tagTargetLang || 'zh-CN',
  set: (v) => { if (setting.value) setting.value.tagTargetLang = v }
})
const manageTagGenCategories = computed({
  get: () => setting.value.tagGenCategories || [],
  set: (v) => { if (setting.value) setting.value.tagGenCategories = v }
})
// 类别显示名:走 i18n 表(categoryOption 里是国际键名 language/parody/...)
const categoryLabel = (cat) => {
  const el = (categoryOption.value || []).find(o => (o.value || o) === cat)
  return el ? galleryCategoryName(cat, t) : cat
}
// 落盘:与设置页同一条路径(ipcRenderer.invoke('save-setting', 纯对象))
const persistSetting = () => {
  try {
    ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
  } catch (e) { /* 忽略 */ }
}
const saveTagCatOrder = () => persistSetting()
const saveTagTargetLang = () => persistSetting()
const saveTagGenCategories = () => persistSetting()

const emit = defineEmits(['previewManga', 'searchFromTag', 'loadBookList', 'getBooksMetadata', 'handleRemoveBookDisplay', 'tagLongPress',
  // 「智能生成合集」:弹窗由 App.vue 持有(autoCollectionVisible),这里只负责把意图传上去
  'auto-collection'])

const visibilityMap = ref({})
const loadBookCardContent = (id) => {
  visibilityMap.value[id] = true
}
const unloadBookCardContent = (id) => {
  // visibilityMap.value[id] = false
}
const selectBookList = ref([])

const selectCollection = ref(null)
const selectCollectionObject = ref({ list: [] })
const displaySelectCollectionList = computed({
  get () {
    const raw = selectCollectionObject.value
    const ids = (raw && Array.isArray(raw.list)) ? raw.list : []
    if (!ids.length) return []
    const list = ids.map(hash_id => _.filter(bookList.value, book => book.hash === hash_id || book.id === hash_id))
    return _.compact(_.flatten(list))
  },
  set (val) {
    const list = [...new Set(val.map(b => b.hash))]
    selectCollectionObject.value.list = list
    // 拖拽排序后的写回:只改了内存,要点「保存」才落盘 → 标记未保存
    collectionDirty.value = true
  }
})

// 当前合集里已有哪些书 —— **纯视觉提示,不参与任何选中判断**。
// 合并后角标只表达 book.selected,用户选了一个合集后看不出哪几本已经是成员,
// 「移出选中」就成了盲操作。老数据里成员可能存的 book.id、新数据存 hash,两种都收进 Set。
const currentCollectionHashes = computed(() => {
  const set = new Set()
  // 老数据里的合集对象可能没有 list 字段(甚至是字符串),必须 Array.isArray 兜底,
  // 否则 for...of 一个非可迭代值会直接把面板打白。
  const rawList = (selectCollectionObject.value && Array.isArray(selectCollectionObject.value.list))
    ? selectCollectionObject.value.list
    : []
  for (const key of rawList) set.add(key)
  for (const book of displaySelectCollectionList.value) {
    set.add(book.id)
    if (book.hash) set.add(book.hash)
  }
  return set
})

// 合集改动是否还没保存:成员增删 / 排序 / 新建 / 改名 / 删合集都只改内存,
// 必须点合集区的「保存」才写盘。退出面板时用它拦一次,避免误点 ✕ 把改动全丢掉。
const collectionDirty = ref(false)

// ★「已选中」= 网格里勾选的书 ∪ 当前合集的成员。
//   用户的要求是「从右侧漫画中选中的、或者合集中的,都显示在已选中栏里」——
//   所以这里不是单纯的 selectBookList,而是两边的并集(按 book.id 去重)。
//   排序:合集成员在前(保持合集里的顺序),网格新勾的追加在后面,避免列表跳动。
const selectedBookObjects = computed(() => {
  const out = []
  const seen = new Set()
  for (const book of displaySelectCollectionList.value) {
    if (!book || seen.has(book.id)) continue
    seen.add(book.id)
    out.push(book)
  }
  // 这里必须读 selectBookList(网格选中的原始 id 列表),不能读 selectedBookIds ——
  // 后者是 selectedBookObjects 的派生,两边互相依赖会让 computed 求值时拿到
  // undefined 并抛 "reading 'map'",整个管理面板白屏。
  for (const id of selectBookList.value) {
    const book = _.find(bookList.value, b => b.id === id || b.hash === id)
    if (!book || seen.has(book.id)) continue
    seen.add(book.id)
    out.push(book)
  }
  return out
})
// 批量操作统一用这份 id 列表,不再直接读 selectBookList ——
// 否则「只选了合集里的书、左边网格一本没勾」时,13 个按钮全都变成空操作。
const selectedBookIds = computed(() => selectedBookObjects.value.map(b => b.id))

// 当前合集的标题(「选择合集」按钮上显示)
const currentCollectionTitle = computed(() => {
  const c = _.find(collectionList.value, { id: selectCollection.value })
  return (c && c.title) || ''
})

// 「选择合集」弹窗里的搜索过滤
const collectionPickKeyword = ref('')
const filteredCollectionList = computed(() => {
  const kw = String(collectionPickKeyword.value || '').trim().toLowerCase()
  const list = collectionList.value || []
  if (!kw) return list
  return list.filter(c => String(c.title || '').toLowerCase().includes(kw))
})

// 弹窗开关 + 用途(select = 切换当前合集 / add = 把已选中加进某个合集)
const collectionPickDialogVisible = ref(false)
const collectionPickMode = ref('select')
// 13 个操作里需要参数的那几个,各自一个居中弹窗
const tagEditDialogVisible = ref(false)
const categoryDialogVisible = ref(false)
const statusDialogVisible = ref(false)
const moveDialogVisible = ref(false)

// 没有任何已选中时统一提示(否则下面的批量函数会静默什么都不做)
const ensureSelection = () => {
  if (selectedBookIds.value.length) return true
  printMessage('info', t('m.manageNeedBooks'))
  return false
}

// ★ 2026-11:管理合集与管理标签合并成一个「管理」视图,只剩 manageView 一个开关。
//   section 只影响「进来时停在哪个分区」:传 'collection' 就把合集区滚到视野里,
//   不传则停在面板顶部(标签区在最上面一块之下,两块共用同一批选区)。
const collectionSectionRef = ref(null)
const enterManageView = (section) => {
  // ★ 2026-11 修:只有「从外面真正进来」才清可见表。
  //   以前无条件 visibilityMap.value = {}:若已经在管理界面里再点一次「管理」(或从合集右栏
  //   重复进入),视图根本没卸载 → v-lazy 的 mounted 不会重跑 → 没有新的 IntersectionObserver
  //   观察 → 可见表又刚被清空 = **整片卡片永久空白**,必须滚动一下才会恢复。
  //   现在:已经在管理界面就不清,卡片保持渲染;真正重新挂载时由指令的重算逻辑补上。
  const wasOpen = manageView.value
  if (!wasOpen) visibilityMap.value = {}
  manageView.value = true
  // 每次进入都从空选区开始:否则上次留下的选区会让「已选 N 本」和后续批量操作对不上
  selectBookList.value = []
  // ⚠ 必须清「全量」bookList,不能用 displayBookList:
  //   被文件夹树 / 筛选挡在外的书如果留着 selected=true,等它重新进入可见区时,
  //   卡片会显示 ✓ 却不在 selectBookList 里 —— 「已选 N 本」偏小、批量操作漏掉它,
  //   而且用户点一下只是把它塞回列表,没法真正取消。
  bookList.value.forEach(book => { book.selected = false })
  if (section === 'collection') {
    // 已经选好合集时先把成员列表填好(App.vue 从「合集」右栏点「编辑」进来就是这条路)
    if (selectCollection.value) handleSelectCollectionChange(selectCollection.value)
    // 等面板渲染出来后滚到合集分区(不打断用户正在看的标签内容,只在首次进入时滚)
    nextTick(() => {
      const el = collectionSectionRef.value
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }
}

// 退出「管理」视图。
// ⚠ 标签/类别/元数据是「点即生效」(saveBook 立即写盘),但合集不是 ——
//   成员增删 / 排序 / 新建 / 改名都只改内存,要点合集区的「保存」才落盘。
//   合并后两种心智模型挤在同一个面板里,用户误点右上角 ✕ 的概率比旧版独立面板高得多,
//   所以这里拦一次。确认放弃才算退出,取消就留在面板里(改动还在)。
const exitManageView = async () => {
  let discarded = false
  if (collectionDirty.value) {
    try {
      await ElMessageBox.confirm(
        t('m.manageDiscardConfirm'),
        t('m.manageDiscardTitle'),
        {
          type: 'warning',
          confirmButtonText: t('m.manageDiscardOk'),
          cancelButtonText: t('m.cancel')
        }
      )
    } catch (e) {
      // 用户选择「取消」/关闭弹窗:留在面板,不改动任何状态
      return
    }
    // ★「放弃改动」必须真的回到磁盘状态,不能只清标记:
    //   collectionList 是 Pinia state,未保存的成员 / 排序 / 新建 / 删除全都还在内存里。
    //   只清 dirty + 关面板的话 ——
    //     ① 重新进面板能看到"已经放弃"的改动;
    //     ② 之后任何走 saveCollection 的路径(合集区「保存」按钮、App.vue 的
    //        @save-collection 智能生成保存)会把它写盘;
    //     ③ 更糟的是「删合集」:内存里已是删除态,下次保存就把删除写下去,变成真删。
    //   所以走 App 的整库重载:重读 load-collection-list、重算 collectionHide、
    //   重建 displayBookList 里的合集聚合条目,内存与磁盘这才真正对齐。
    // ⚠ 重载会把 collectionList 整体换成新数组/新对象,而 selectCollectionObject 存的是**对象引用**,
    //   不一起清掉就会指着旧数组里那份刚被"放弃"的数据 —— 面板仍显示旧成员,新加的书写进 stale 对象后
    //   保存时静默丢失(还提示成功)。这里与 saveCollection / deleteCollection 保持一致地清空。
    selectCollection.value = undefined
    selectCollectionObject.value = { list: [] }
    collectionDirty.value = false
    discarded = true
  }
  visibilityMap.value = {}
  manageView.value = false
  // 顺序要求:先复位 dirty(避免重入) → 再关面板 → 最后 emit。
  // loadBookList 本身会清空 selectBookList,这正好是「放弃」期望的结果。
  // ⚠ 只在「放弃」分支重载:普通退出、保存后退出都不整库重载(那是没必要的重活)。
  if (discarded) emit('loadBookList', false)
}

const addCollection = () => {
  ElMessageBox.prompt(t('c.inputCollectionName'), t('m.addCollection'), {})
    .then(({ value }) => {
      const id = nanoid()
      collectionList.value.push({
        id,
        title: value,
        list: []
      })
      selectCollection.value = id
      handleSelectCollectionChange(selectCollection.value)
      // 新建的合集还没写盘(要点「保存」),标记未保存
      collectionDirty.value = true
    })
    .catch(() => {
      printMessage('info', t('c.canceled'))
    })
}

const editCollection = () => {
  if (_.has(selectCollectionObject.value, 'title')) {
    ElMessageBox.prompt(t('c.inputCollectionName'), t('m.editCollection'), {
      inputValue: selectCollectionObject.value.title,
      cancelButtonText: t('c.deleteCollection'),
      distinguishCancelAndClose: true
    })
      .then(({ value }) => {
        selectCollectionObject.value.title = value
        // 改名只改内存,同样要点「保存」
        collectionDirty.value = true
      })
      .catch((action) => {
        if (action === 'cancel') {
          deleteCollection()
        } else {
          printMessage('info', t('c.canceled'))
        }
      })
  }
}

const deleteCollection = () => {
  collectionList.value = _.filter(collectionList.value, c => c.id !== selectCollection.value)
  selectCollection.value = undefined
  selectCollectionObject.value = { list: [] }
  // 删合集也要点「保存」才真正落盘
  collectionDirty.value = true
  // 不再维护 book.collected:「在合集里」由右侧成员列表体现,左侧网格的选中态统一用 book.selected
}

// options.keepOpen = true 时不退出管理视图:
// 「批量删除本地文件」的收尾会顺带存一次合集,如果那时也把面板关掉,
// 用户点了删除 5 本,删完第 1 本面板就没了(旧版只关合集视图,面板还开着)。
const saveCollection = async (options) => {
  collectionList.value = _.filter(collectionList.value, c => !_.isEmpty(_.compact(c.list)))
  await ipcRenderer.invoke('save-collection-list', _.cloneDeep(collectionList.value))
  emit('loadBookList', false)
  selectCollection.value = undefined
  selectCollectionObject.value = { list: [] }
  // ⚠ dirty 必须在调 exitManageView() 之前复位,否则会自己弹自己的「未保存」确认框
  collectionDirty.value = false
  // 保存即收工:合并后只有「管理」一个视图,直接退出(旧版只关掉合集视图,还得再点一次退出)
  // 注:按钮上写的是 @click="saveCollection",这里会收到 MouseEvent —— 所以用 === true 判断
  if (!options || options.keepOpen !== true) exitManageView()
}

const handleSelectCollectionChange = (val) => {
  // 下拉是可清空的:清空时 val 是 undefined,这里退回空对象,避免下面读 .list 时报错
  // 注意:切换合集本身不算改动(dirty 保持原样),只有真的改了成员/排序/名字才算
  selectCollectionObject.value = _.find(collectionList.value, { id: val }) || { list: [] }
}

// ---------- 「选择合集」弹窗(替代原来的下拉框) ----------
// mode='add':把「已选中」一次性加进被点的那个合集,不切换当前编辑的合集也行
const openAddToCollectionPick = () => {
  if (!ensureSelection()) return
  if (!(collectionList.value || []).length) {
    printMessage('info', t('m.manageNeedCollection'))
    return
  }
  collectionPickMode.value = 'add'
  collectionPickKeyword.value = ''
  collectionPickDialogVisible.value = true
}

const onCollectionPickClick = (c) => {
  if (collectionPickMode.value === 'add') {
    addSelectedToPickedCollection(c)
    return
  }
  // 切换当前正在编辑的合集
  selectCollection.value = c.id
  handleSelectCollectionChange(c.id)
  collectionPickDialogVisible.value = false
}

// 把「已选中」加进指定合集:先把目标合集设为当前,再复用 addSelectedToCollection 的去重逻辑
const addSelectedToPickedCollection = (c) => {
  selectCollection.value = c.id
  handleSelectCollectionChange(c.id)
  addSelectedToCollection()
  collectionPickDialogVisible.value = false
}

// 新建合集 + 直接把「已选中」灌进去(用户点的是「新建合集」,意图就是给这批书建个新组)
const addCollectionWithSelected = () => {
  if (!ensureSelection()) return
  ElMessageBox.prompt(t('c.inputCollectionName'), t('m.addCollection'), {})
    .then(({ value }) => {
      const id = nanoid()
      const collection = { id, title: value, list: [] }
      collectionList.value.push(collection)
      selectCollection.value = id
      selectCollectionObject.value = collection
      const exist = new Set(collection.list)
      for (const book of selectedBookObjects.value) {
        const key = book.hash || book.id
        if (exist.has(key) || exist.has(book.id)) continue
        collection.list.push(key)
        exist.add(key)
      }
      collectionDirty.value = true
      printMessage('success', t('c.applied'))
    })
    .catch(() => {
      printMessage('info', t('c.canceled'))
    })
}

// 列表行右侧的 ×:从「已选中」里整本去掉 ——
// 网格勾选一并取消,属于当前合集的也同时移出(移出合集只改内存,要点保存)
const removeFromSelected = (book) => {
  if (!book) return
  if (book.selected) {
    book.selected = false
    selectBookList.value = _.filter(selectBookList.value, id => id !== book.id)
  }
  removeBookFromCollection(book)
}

// 翻译 / 超分:走 store 里同一套 runBookTask,与右键菜单完全同一条路径
const runTaskForSelected = (kind) => {
  if (!ensureSelection()) return
  for (const book of selectedBookObjects.value) {
    try {
      appStore.runBookTask(book, kind)
    } catch (e) {
      console.error(e)
    }
  }
  printMessage('success', t('c.applied'))
}

// 成员行右侧的 ×:只把这本书移出「当前合集」,不动左侧选区
// (旧的 handleClickCollectBadge 会顺手改 book.collected,合并后那一套字段已经不用了,必须拆开)
const removeBookFromCollection = (book) => {
  const target = selectCollectionObject.value
  if (!target || !Array.isArray(target.list)) return
  const before = target.list.length
  target.list = _.filter(target.list, hash_id => hash_id !== book.id && hash_id !== book.hash)
  // 真删掉了才算改动(book 不在合集里时长度不变,不该标记 dirty)
  if (target.list.length !== before) collectionDirty.value = true
}

// 加入选中:把左侧选中的书一次性推进当前合集(按 hash 去重)
const addSelectedToCollection = () => {
  if (!selectCollection.value) {
    printMessage('info', t('m.manageNeedCollection'))
    return
  }
  if (!selectedBookIds.value.length) {
    printMessage('info', t('m.manageNeedBooks'))
    return
  }
  const target = selectCollectionObject.value
  if (!target) return
  if (!Array.isArray(target.list)) target.list = []
  // 两个都塞进去判断:老数据里成员可能存的是 id,新数据存的是 hash(openCollection 也是两个都比)
  const exist = new Set(target.list)
  let added = 0
  for (const id of selectedBookIds.value) {
    const book = _.find(bookList.value, b => b.id === id || b.hash === id)
    if (!book) continue
    const key = book.hash || book.id
    if (exist.has(key) || exist.has(book.id)) continue
    target.list.push(key)
    exist.add(key)
    added += 1
  }
  if (added) {
    // 成员变了但还没写盘 → 标记未保存(退出时会拦一次)
    collectionDirty.value = true
    printMessage('success', t('c.applied'))
  } else {
    printMessage('info', t('m.manageNoChange'))
  }
}

// 移出选中:把左侧选中的书从当前合集里剔除
const removeSelectedFromCollection = () => {
  if (!selectCollection.value) {
    printMessage('info', t('m.manageNeedCollection'))
    return
  }
  if (!selectedBookIds.value.length) {
    printMessage('info', t('m.manageNeedBooks'))
    return
  }
  const target = selectCollectionObject.value
  if (!target || !Array.isArray(target.list)) return
  // 选中书的 id/hash 汇总成一个集合,过滤成员列表时两个都比
  const removing = new Set()
  for (const id of selectedBookIds.value) {
    removing.add(id)
    const book = _.find(bookList.value, b => b.id === id || b.hash === id)
    if (book) {
      removing.add(book.id)
      if (book.hash) removing.add(book.hash)
    }
  }
  const before = target.list.length
  target.list = _.filter(target.list, hash_id => !removing.has(hash_id))
  if (target.list.length === before) {
    printMessage('info', t('m.manageNoChange'))
  } else {
    // 真的移出了 → 标记未保存
    collectionDirty.value = true
    printMessage('success', t('c.applied'))
  }
}


const groupTagSelected = ref([])
const categorySelected = ref(null)
const statusSelected = ref('tagged')

// group edit tags viewer
const editOpWidth = ref(Number(localStorage.getItem('emmEditOpWidth')) || 360)
// 网格列占满整行。
// ★ 以前是 calc(100% - opWidth):那是在「操作面板还占着 el-row 的 4/24 栅格」时的算法。
//   现在面板已经 Teleport 到 .app-body,网格这边再减一次宽度就会空出一大块(用户截图里右侧的红框)。
const editGridStyle = computed(() => ({ width: '100%', flex: '1 1 auto', minWidth: '0' }))
const opColStyle = computed(() => ({ width: editOpWidth.value + 'px', maxWidth: editOpWidth.value + 'px', flex: '0 0 ' + editOpWidth.value + 'px', position: 'relative' }))
const startOpResize = (e) => {
  e.preventDefault()
  const sx = e.clientX
  const sw = editOpWidth.value
  const mv = (ev) => { editOpWidth.value = Math.max(260, Math.min(sw + (sx - ev.clientX), 600)) }
  const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); try { localStorage.setItem('emmEditOpWidth', String(editOpWidth.value)) } catch (_) {} }
  window.addEventListener('mousemove', mv)
  window.addEventListener('mouseup', up)
}
// ---------- 管理面板的惯性滚动 ----------
// 主界面(.book-card-area)和阅读器都绑了 attachInertiaScroll,但「管理」面板的
// 面板主体(.emm-manage-body)一直没绑 —— 所以在这一页滚轮滚动没有滑行效果,
// 和设置页里「惯性滑动」开关的说法对不上。
// 面板是 v-if 动态挂载的,而且现在还被 Teleport 到 .app-body,所以要等 DOM 真正出现再绑。
// ⚠ 挂在哪:用 CDP 实测过真实 DOM(不是猜的)——
//     .emm-manage-body   scrollH=883  clientH=883  → 根本不滚动(内容还没撑满)
//     .book-manage-view  scrollH=3491 clientH=865  → 真正滚动的是网格
//   把惯性挂在 .emm-manage-body 上等于挂了个不滚的元素,自然"没效果"。
let manageInertiaDetach = null
const bindManageInertia = () => {
  nextTick(() => {
    if (manageInertiaDetach) { try { manageInertiaDetach() } catch (e) { /* 忽略 */ } ; manageInertiaDetach = null }
    const getParams = () => {
      const s = (appStore && appStore.setting) || {}
      return {
        enabled: s.inertiaEnabled !== false,
        friction: s.inertiaFriction,
        maxVelocity: s.inertiaMaxVelocity,
        follow: s.inertiaFollow
      }
    }
    // 合并后只有一个网格(旧版是 .book-collect-view / .book-tag-edit-view 各绑一次)
    const detachers = []
    for (const sel of ['.book-manage-view']) {
      const el = document.querySelector(sel)
      if (!el) continue
      detachers.push(attachInertiaScroll(el, { getParams }))
    }
    manageInertiaDetach = () => { detachers.forEach(fn => { try { fn() } catch (e) { /* 忽略 */ } }) }
  })
}
// 视图打开/关闭时重新绑一次(元素会被销毁重建)
watch(manageView, (open) => {
  if (open) bindManageInertia()
})
onBeforeUnmount(() => {
  if (manageInertiaDetach) { try { manageInertiaDetach() } catch (e) { /* 忽略 */ } ; manageInertiaDetach = null }
})

// 点卡片 = 切换选中(合并后合集与标签共用这一套选区,不再有 book.collected)
const toggleBookSelected = (book) => {
  if (book.selected) {
    book.selected = false
    selectBookList.value = _.filter(selectBookList.value, id => id !== book.id)
  } else {
    book.selected = true
    selectBookList.value.push(book.id)
  }
}

const selectionBox = ref(null)
const isSelecting = ref(false)
const startX = ref(undefined)
const startY = ref(undefined)

const handleMouseDownForSelection = (e) => {
  isSelecting.value = true
  startX.value = e.pageX
  startY.value = e.pageY
  selectionBox.value.style.left = `${startX.value}px`
  selectionBox.value.style.top = `${startY.value}px`
  selectionBox.value.style.width = `0px`
  selectionBox.value.style.height = `0px`
  selectionBox.value.style.display = 'block'
  e.preventDefault()
}

const handleMouseMoveForSelection = (e) => {
  if (isSelecting.value) {
    const endX = e.pageX
    const endY = e.pageY
    const left = Math.min(endX, startX.value)
    const top = Math.min(endY, startY.value)
    const width = Math.abs(endX - startX.value)
    const height = Math.abs(endY - startY.value)
    selectionBox.value.style.left = `${left}px`
    selectionBox.value.style.top = `${top}px`
    selectionBox.value.style.width = `${width}px`
    selectionBox.value.style.height = `${height}px`
  }
}

// 拖框多选:合并后只有一种行为(切换 book.selected / selectBookList),
// 旧版的 'tag' / 'collect' 两个分支已经收敛成一个
const handleMouseUpForSelection = () => {
  const rect = selectionBox.value.getBoundingClientRect()
  if (rect.width > 10 || rect.height > 10) {
    document.querySelectorAll('.selectable-card').forEach(item => {
      const itemRect = item.getBoundingClientRect()
      if (
        itemRect.left < rect.right &&
        itemRect.right > rect.left &&
        itemRect.top < rect.bottom &&
        itemRect.bottom > rect.top
      ) {
        const book = chunkDisplayBookList.value.find(book => book.id === item.id)
        if (!book) return
        if (book.selected) {
          book.selected = false
          selectBookList.value = _.filter(selectBookList.value, id => id !== item.id)
        } else {
          book.selected = true
          selectBookList.value.push(item.id)
        }
      }
    })
  }
  isSelecting.value = false
  selectionBox.value.style.display = 'none'
}

// 全选:只选「当前网格里看得见的书」(与 visibleManageBookList 同口径),
// 且与已有选区取并集 —— 不能直接覆盖,否则已选但被文件夹树过滤掉的书会凭空丢失。
const selectAllBooks = () => {
  const picked = new Set(selectBookList.value)
  visibleManageBookList.value.forEach(book => {
    book.selected = true
    picked.add(book.id)
  })
  selectBookList.value = [...picked]
}

const unselectAllBooks = () => {
  // 同 enterManageView:清全量 bookList,否则被筛选挡在外的书会留着 ✓ 却不在 selectBookList 里
  bookList.value.forEach(book => {
    book.selected = false
  })
  selectBookList.value = []
}

const resolveGroupTagSelected = () => {
  const letter2cat = _.invert(cat2letter.value)
  let tags = groupTagSelected.value.map(tag => {
    // 标签名不要限制字符集:e-hentai 上真实存在 k-on! / love live! / h.o.t 这类标签,
    // 用 [- ._()\p{L}\d] 会把它们判成不匹配 → 走 else 被 _.compact 丢掉,
    // 而调用方仍然提示「成功」并关闭弹窗 = 假成功,用户以为改了其实没改。
    // 分类前缀(letter)本身不含冒号,所以用 [^:]+ 收口即可。
    const match = tag.match(/^([^:]+):"(.*)"\$$/u)
    // 必须先判 match 本身:格式不匹配(老格式 / 手工值)时 match 为 null,
    // 直接读 match[1] 会抛 TypeError,整个提交按钮失效。
    if (match && match[1] && match[2]) {
      return {
        category: letter2cat[match[1]] ? letter2cat[match[1]] : match[1],
        tag: match[2]
      }
    } else {
      return null
    }
  })
  tags = _.compact(tags)
  return tags
}


// ---------- 增加标签(同名必须指定所属集合) ----------
const addTagDialogVisible = ref(false)
const addTagForm = ref({ cat: '', name: '', parent: '' })
const addTagDuplicate = ref([])
const resolveCat = (c) => {
  const MAP = { parody:'作品', character:'角色', group:'社团', artist:'作者', male:'男性', female:'女性', mixed:'混合', other:'其他', cosplayer:'Cosplay' }
  if (MAP[c]) return c
  for (const [k, v] of Object.entries(MAP)) if (v === c) return k
  return c
}
const allTagEntries = computed(() => {
  const out = []
  const seen = new Set()
  for (const b of (displayBookList.value || [])) {
    for (const [cat, arr] of Object.entries(b.tags || {})) {
      for (const tg of (arr || [])) {
        const k = cat + '::' + tg
        if (seen.has(k)) continue
        seen.add(k)
        out.push({ cat, tag: tg })
      }
    }
  }
  return out
})
const tagCatOptions = computed(() => [...new Set(allTagEntries.value.map(e => resolveCat(e.cat)))].sort())
const tagParentOptions = computed(() => allTagEntries.value
  .filter(e => resolveCat(e.cat) !== resolveCat(addTagForm.value.cat))
  .map(e => ({ value: e.cat + '::' + e.tag, label: e.tag })))
// 重名判定:同类别内,比较所有语言的名称
const checkAddTagDuplicate = () => {
  const name = String(addTagForm.value.name || '').trim().toLowerCase()
  const cat = resolveCat(addTagForm.value.cat)
  if (!name || !cat) { addTagDuplicate.value = []; return }
  const langs = setting.value.tagNameLangs || {}
  const hits = []
  for (const e of allTagEntries.value) {
    if (resolveCat(e.cat) !== cat) continue
    if (String(e.tag).trim().toLowerCase() === name) { hits.push(e); continue }
    const rec = langs[e.cat + '::' + e.tag] || {}
    const names = [rec['default'], rec['zh-CN'], rec['zh-TW'], rec.ja, rec.en].filter(Boolean).map(s => String(s).trim().toLowerCase())
    if (names.includes(name)) hits.push(e)
  }
  addTagDuplicate.value = hits
  if (!hits.length) addTagForm.value.parent = ''
}
const canCreateTag = computed(() => !!addTagForm.value.cat && !!String(addTagForm.value.name || '').trim() && (addTagDuplicate.value.length === 0 || !!addTagForm.value.parent))
const openAddTagDialog = () => {
  addTagForm.value = { cat: '', name: '', parent: '' }
  addTagDuplicate.value = []
  addTagDialogVisible.value = true
}
const createNewTag = async () => {
  if (!canCreateTag.value) return
  const cat = resolveCat(addTagForm.value.cat)
  const name = String(addTagForm.value.name).trim()
  const parent = addTagForm.value.parent
  try {
    for (const id of selectedBookIds.value) {
      const book = _.find(bookList.value, { id })
      if (!book) continue
      if (!_.has(book, 'tags')) book.tags = {}
      if (!Array.isArray(book.tags[cat])) book.tags[cat] = []
      if (!book.tags[cat].includes(name)) book.tags[cat].push(name)
      // 同名标签:强制绑定所属集合(自动补上集合标签)
      if (parent) {
        const [pcat, ptag] = parent.split('::')
        if (!Array.isArray(book.tags[pcat])) book.tags[pcat] = []
        if (!book.tags[pcat].includes(ptag)) book.tags[pcat].push(ptag)
        // 记录关联:新标签被该集合包含
        const rel = setting.value.tagRelations || {}
        const pk = pcat + '::' + ptag
        const cur = rel[pk] || {}
        const arr = Array.isArray(cur.contains) ? cur.contains.slice() : []
        const selfKey = cat + '::' + name
        if (!arr.includes(selfKey)) arr.push(selfKey)
        setting.value.tagRelations = { ...rel, [pk]: { ...cur, contains: arr } }
        try { await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value))) } catch (e) {}
      }
      await saveBook(book)
    }
    printMessage('success', t('c.addGroupTagSuccess'))
    addTagDialogVisible.value = false
  } catch (e) {
    console.error(e)
    printMessage('error', t('c.groupTagError'))
  }
}

// 长按标签(600ms) → 打开标签多语言名称编辑(与卡片标签长按一致)
let tagPressTimer = null
const startTagPress = (cat, tag, book) => {
  clearTimeout(tagPressTimer)
  tagPressTimer = setTimeout(() => {
    tagPressTimer = null
    emit('tagLongPress', { tag: { id: cat + ':' + tag, cat, tag, letter: cat }, book })
  }, 600)
}
const cancelTagPress = () => { if (tagPressTimer) { clearTimeout(tagPressTimer); tagPressTimer = null } }

const updateTagsLoading = ref(false)
const addTagToGroup = async () => {
  if (!ensureSelection()) return false
  try {
    updateTagsLoading.value = true
    const tags = resolveGroupTagSelected()
    for (const id of selectedBookIds.value) {
      const book = _.find(bookList.value, { id })
      // 操作途中书可能被删/被过滤掉 → book 为 undefined,不判空会抛
      // "Cannot set properties of undefined"
      if (!book) continue
      if (!_.has(book, 'tags')) book.tags = {}
      for (const { category, tag } of tags) {
        if (_.has(book.tags, category)) {
          if (!book.tags[category].includes(tag)) {
            book.tags[category].push(tag)
          }
        } else {
          book.tags[category] = [tag]
        }
      }
      await saveBook(book)
    }
    printMessage('success', t('c.addGroupTagSuccess'))
    updateTagsLoading.value = false
    return true
  } catch (e) {
    console.error(e)
    printMessage('error', t('c.groupTagError'))
    updateTagsLoading.value = false
    return false
  }
}
// 弹窗版:成功就关窗(失败或没选书时留在窗里,用户不用重新点开)
const addTagToGroupAndClose = async () => {
  if (await addTagToGroup()) tagEditDialogVisible.value = false
}

const removeTagToGroup = async () => {
  if (!ensureSelection()) return false
  try {
    updateTagsLoading.value = true
    const tags = resolveGroupTagSelected()
    for (const id of selectedBookIds.value) {
      const book = _.find(bookList.value, { id })
      if (!book || !_.has(book, 'tags')) continue
      for (const { category, tag } of tags) {
        if (_.has(book.tags, category)) {
          book.tags[category] = _.filter(book.tags[category], t => t !== tag)
        }
      }
      await saveBook(book)
    }
    printMessage('success', t('c.removeGroupTagSuccess'))
    updateTagsLoading.value = false
    return true
  } catch (e) {
    console.error(e)
    printMessage('error', t('c.groupTagError'))
    updateTagsLoading.value = false
    return false
  }
}
const removeTagToGroupAndClose = async () => {
  if (await removeTagToGroup()) tagEditDialogVisible.value = false
}

const applyCategory = async () => {
  if (!ensureSelection()) return false
  try {
    updateTagsLoading.value = true
    for (const id of selectedBookIds.value) {
      const book = _.find(bookList.value, { id })
      if (!book) continue
      book.category = categorySelected.value
      await saveBook(book)
    }
    printMessage('success', t('c.applied'))
    updateTagsLoading.value = false
    return true
  } catch (e) {
    console.error(e)
    printMessage('error', t('c.applyError'))
    updateTagsLoading.value = false
    return false
  }
}
const applyCategoryAndClose = async () => {
  if (await applyCategory()) categoryDialogVisible.value = false
}

const applyStatus = async () => {
  if (!ensureSelection()) return false
  try {
    updateTagsLoading.value = true
    for (const id of selectedBookIds.value) {
      const book = _.find(bookList.value, { id })
      if (!book) continue
      book.status = statusSelected.value
      await saveBook(book)
    }
    printMessage('success', t('c.applied'))
    updateTagsLoading.value = false
    return true
  } catch (e) {
    console.error(e)
    printMessage('error', t('c.applyError'))
    updateTagsLoading.value = false
    return false
  }
}
const applyStatusAndClose = async () => {
  if (await applyStatus()) statusDialogVisible.value = false
}

const groupGetMetadata = async () => {
  if (!ensureSelection()) return
  try {
    updateTagsLoading.value = true
    // ⚠ 变量别叫 bookList:它会遮蔽模块级的 bookList ref,
    //   右侧 _.find(bookList.value) 就会踩 TDZ 抛 ReferenceError(原实现就是这么挂的)。
    const books = _.compact(selectedBookIds.value.map(id => _.find(bookList.value, { id })))
    emit('getBooksMetadata', books, setting.value.requireGap || 10000, () => {
      updateTagsLoading.value = false
    })
  } catch (error) {
    console.error(error)
    updateTagsLoading.value = false
  }
}

const groupReGetMetadata = async () => {
  if (!ensureSelection()) return
  ElMessageBox.confirm(
    t('c.reGetMetadataWarning'),
    '',
    {}
  )
  .then(async () => {
    try {
      updateTagsLoading.value = true
      const books = _.compact(selectedBookIds.value.map(id => _.find(bookList.value, { id })))
      for (const book of books) {
        book.url = ''
        await saveBook(book)
      }
      emit('getBooksMetadata', books, setting.value.requireGap || 15000, () => {
        updateTagsLoading.value = false
      })
    } catch (error) {
      console.error(error)
      updateTagsLoading.value = false
    }
  })
}

const groupDeleteLocalBook = () => {
  if (!ensureSelection()) return
  ElMessageBox.confirm(
    t('c.confirmDelete'),
    '',
    {}
  )
  .then(async () => {
    updateTagsLoading.value = true
    for (const id of selectedBookIds.value) {
      const book = _.find(bookList.value, { id })
      if (book) {
        let delRes = null
        try {
          delRes = await ipcRenderer.invoke('delete-local-book', book.filepath)
        } catch (err) { delRes = { ok: false, error: String((err && err.message) || err) } }
        await Promise.resolve()
        .finally(async () => {
          if (book.collectionHide) {
            _.forEach(collectionList.value, (collection) => {
              collection.list = _.filter(collection.list, hash_id => hash_id !== book.id && hash_id !== book.hash)
            })
            openCollectionBookList.value = _.filter(openCollectionBookList.value, bookOfCollection => {
              return bookOfCollection.id !== book.id && bookOfCollection.id !== book.hash
            })
            await saveCollection({ keepOpen: true })
          } else {
            const findBookInBookList = _.findIndex(bookList.value, b => b.filepath === book.filepath)
            bookList.value.splice(findBookInBookList, 1)
            displayBookList.value = _.filter(displayBookList.value, b => b.filepath !== book.filepath)
            emit('handleRemoveBookDisplay')
          }
        })
      }
    }
  })
  .finally(() => {
    unselectAllBooks()
    updateTagsLoading.value = false
  })
}

const groupRescanBook = async () => {
  if (!ensureSelection()) return
  try {
    updateTagsLoading.value = true
    for (const id of selectedBookIds.value) {
      const book = _.find(bookList.value, { id })
      if (!book) continue
      const bookInfo = await ipcRenderer.invoke('patch-local-metadata-by-book', _.cloneDeep(book))
      _.assign(book, bookInfo)
      await saveBook(book)
    }
    printMessage('success', t('c.rescanSuccess'))
    updateTagsLoading.value = false
  } catch (error) {
    console.error(error)
    updateTagsLoading.value = false
  }
}

const groupTriggerHiddenBook = async (val) => {
  if (!ensureSelection()) return
  try {
    updateTagsLoading.value = true
    for (const id of selectedBookIds.value) {
      const book = _.find(bookList.value, { id })
      if (!book) continue
      book.hiddenBook = val
      await saveBook(book)
    }
    updateTagsLoading.value = false
  } catch (error) {
    console.error(error)
    updateTagsLoading.value = false
  }
}

const selectFolderToMove = ref(null)

const applyMoveFile = async () => {
  if (!ensureSelection()) return false
  try {
    updateTagsLoading.value = true
    for (const id of selectedBookIds.value) {
      const book = _.find(bookList.value, { id })
      if (!book) continue
      if (book.filepath) {
        const newFilePath = await ipcRenderer.invoke('move-local-book', book.filepath, _.cloneDeep(selectFolderToMove.value))
        if (newFilePath) {
          book.filepath = newFilePath
          await saveBook(book)
        }
      }
    }
    printMessage('success', t('c.moveSuccess'))
    updateTagsLoading.value = false
    return true
  } catch (error) {
    console.error(error)
    printMessage('error', t('c.moveError'))
    updateTagsLoading.value = false
    return false
  }
}
const applyMoveFileAndClose = async () => {
  if (await applyMoveFile()) moveDialogVisible.value = false
}

defineExpose({
  selectCollection,
  selectBookList,
  // 合并后只暴露「管理」一套入口(原 enterEditCollectionView / exitCollectionView /
  // enterEditTagView / exitEditTagView 四个名字全部废弃)
  manageView,
  enterManageView,
  exitManageView,
  handleSelectCollectionChange,
  addCollection,
  editCollection,
  saveCollection,
})
</script>

<style lang="stylus">
.pop-enter-active, .pop-leave-active
  transition: opacity 0.3s ease

.pop-enter-from, .pop-leave-to
  opacity: 0

/* 网格列:纵向滚动(卡片行数超出高度时自己滚)。
   ★ 原来是 overflow-x: auto —— 但卡片是 inline-block 流式换行,正常不会横向溢出,
     那条规则反而在「卡片刚好塞满」时生出一条横向滚动条,把内容顶上去、滚动条位置看着不对。
     现在明确:纵向滚 + 纵向补位。
   ★ 2026-11:管理合集 / 管理标签两个网格合并成 .book-manage-view 一个。 */
.book-manage-view
  height: calc(100vh - 96px)
  overflow-x: hidden
  overflow-y: auto
  padding-top: 4px
  /* 卡片从左上角开始排,不要居中/底部对齐(否则宽屏时会有一大块空白) */
  text-align: left
  line-height: normal
/* 操作列:高度与网格列一致(两列底边平齐),但**不再**横向滚动 ——
   横向滚动已经由里面的 .emm-manage-body / 网格列各自负责,
   留在 el-col 上会让卡片区多出一条横向滚动条,看起来和侧边详细信息不一个档 */
.book-tag-edit-operation
  height: calc(100vh - 96px)
  padding-top: 4px

.book-manage-card-frame
  display: inline-block
  min-width: 138px
  min-height: 229px
  /* ★ 关键:inline-block 会按父级 line-height 留出基线空隙,而且顶部会被 padding-top 顶开,
     看起来就是「网格上方空一条」。改成顶部对齐的 flex 容器后,卡片从容器左上角开始排。 */
  vertical-align: top
.book-manage-card
  width: 138px
  height: 229px
  border: solid 1px var(--el-border-color)
  border-radius: 4px
  margin: 6px 6px
  position: relative
/* 封面包裹层:成员角点的定位上下文。
   display:block + line-height:0 —— 让包裹层尺寸正好等于封面(125x177),
   顺带去掉 inline 图片下方那条基线空隙,封面不会被顶下去。 */
.book-manage-cover-wrap
  position: relative
  display: block
  line-height: 0
/* 合集成员角点:封面左上角一个小圆点。
   只做提示,不参与任何选中判断;pointer-events: none 保证不会挡住封面点击/右键/长按。
   1px 白描边(用 box-shadow 实现,不占尺寸)是为了深色封面上也能看清。 */
.book-manage-member-dot
  position: absolute
  top: 4px
  left: 4px
  width: 8px
  height: 8px
  border-radius: 50%
  background: var(--el-color-primary)
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.9)
  pointer-events: none
  z-index: 2
.book-add-badge
  .el-badge__content.is-fixed
    top: 6px
    right: 17px
    cursor: pointer
.book-manage-title
  height: 38px
  overflow-y: hidden
  margin: 4px 2px
  /* 合并前合集卡片是 12px、标签卡片是 10px;现在只有一套卡片,统一取更大的 12px
     (10px 和「侧边详细信息」的正文比明显偏细) */
  font-size: 12px
.book-manage-cover
  border-radius: 4px
  width: 125px
  height: 177px
  object-fit: cover
/* 合集成员列表行属于右栏「合集」分区(.manage-collection-block)。
   ★ 这一组规则以前挂在 .book-collection 下 —— 那是旧合集面板的包裹层类名,面板改造成
     .emm-manage-col / .manage-collection-block 之后就没元素带这个类了,规则一直没生效
     (封面会按原始尺寸撑开)。这里改挂到 .manage-collection-block 下,成员行才真正有样式。 */
.manage-collection-block
  .book-collection-line
    text-align:left
    width: 100%
    height: 79px
    border: solid 1px var(--el-border-color)
    border-radius: 4px
    margin: 2px 0
    position: relative
    .book-collection-cover
      border-radius: 2px
      width: 50px
      height: 71px
      position: absolute
      top: 4px
      left: 2px
      object-fit: cover
    .book-collection-title
      height: 72px
      overflow-y: hidden
      margin: 4px 4px 4px 54px
      font-size: 12px
    .book-collection-remove
      position: absolute
      bottom: 2px
      right: 2px
      cursor: pointer

/* ---------- 「已选中」栏(2026-11) ---------- */
/* 头部:计数和全选/全不选同一行,面板窄时自动换行 */
.manage-selected-head
  display: flex
  align-items: center
  justify-content: space-between
  flex-wrap: wrap
  gap: 6px
  .manage-selected-count
    margin: 0
/* 「选择合集」按钮:占满整行。
   合集名太长时用 ellipsis 截断 —— 完整名字在 title 悬浮和弹窗里都能看到。 */
.manage-collection-pick
  width: 100%
  margin-bottom: 6px
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap
/* 已选中操作的按钮网:两列等宽。
   原来这些按钮是 el-space wrap 排的,面板一窄就参差不齐;grid 让它们对齐成两列。 */
.selected-action-grid
  display: grid
  grid-template-columns: repeat(2, minmax(0, 1fr))
  gap: 6px
  width: 100%
  /* ⚠ 必须连 `.el-button + .el-button` 一起写:Element Plus 给相邻按钮加了
     margin-left:12px,只写 `.el-button` 特异性不够(0,1,0 vs 0,2,0),会被它压过,
     grid 里就会出现「第二列按钮整体右移 12px」的错位。 */
  .el-button, .el-button + .el-button
    width: 100%
    margin: 0
    padding: 0 6px
    font-size: 12px
/* 「选择合集」弹窗 */
.collection-pick-search
  margin-bottom: 8px
.collection-pick-list
  max-height: 320px
  overflow-y: auto
  border: 1px solid var(--el-border-color-lighter)
  border-radius: 6px
.collection-pick-item
  display: flex
  align-items: center
  justify-content: space-between
  gap: 8px
  padding: 8px 10px
  cursor: pointer
  border-bottom: 1px solid var(--el-border-color-lighter)
  &:last-child
    border-bottom: none
  &:hover
    background: var(--el-fill-color-light)
  &.is-active
    background: var(--el-color-primary-light-9)
    color: var(--el-color-primary)
.collection-pick-name
  flex: 1 1 auto
  min-width: 0
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap
.collection-pick-count
  flex: 0 0 auto
  font-size: 12px
  color: var(--el-text-color-secondary)
.collection-pick-empty
  padding: 20px 10px
  text-align: center
  font-size: 12px
  color: var(--el-text-color-secondary)

.book-tag-edit-operation
  .el-select-v2
    width: 100%
  .el-cascader
    width: 100%
  /* 按钮行:必须占满宽度并靠左,否则 el-space 会按内容宽度收缩、被推到右边去 */
  .book-tag-edit-buttons
    width: 100%
    margin-top: 10px
    display: flex
    flex-wrap: wrap
    justify-content: flex-start
  /* 兼容:万一还有地方用这个类(旧的按钮行统一改造残留) */
  .emm-manage-actions-row
    width: 100%
    display: flex
    flex-wrap: wrap
    justify-content: flex-start

#selection-box
  position: fixed
  border: 2px dashed #00f
  display: none
  pointer-events: none
  user-select: none
</style>
<style lang="stylus">
/* 操作列左缘拖宽手柄（T04+）：「管理（合集+标签）」面板用 */
.emm-op-resizer
  position: absolute
  left: 0
  top: 0
  bottom: 0
  width: 8px
  cursor: col-resize
  z-index: 5
</style>
