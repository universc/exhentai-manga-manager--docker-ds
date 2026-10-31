<template>
  <!-- 下载记录栏：和主界面同层（不是浮层），拖动左边缘可以调整宽度。
       列表照 JHenTai 的下载网格模式：封面网格，没下完的封面上压暗 + 圆环进度 + 中央状态按钮。
       本组件是**纯展示**：所有数据由 App.vue 的 downloadTaskViews / previewViews 计算好传进来，
       所有动作用 emit 抛回去（T03-9 按「只搬不改」抽取，方法体仍在 App.vue）。 -->
  <div class="download-panel" v-show="visible" :style="{ width: width + 'px' }">
    <div class="download-panel-resizer" :title="$t('m.downloadPanelResizeHint')" @mousedown="$emit('resize-start', $event)"></div>
    <div class="download-panel-header">
      <template v-if="!previewTask">
        <span class="download-panel-title">{{ $t('m.downloads') }}</span>
        <span class="download-panel-actions">
          <el-button size="small" :disabled="!resumableCount" @click="$emit('resume-all')">{{ $t('m.downloadResumeAll') }}</el-button>
          <el-button size="small" @click="$emit('open-folder')">{{ $t('m.downloadOpenFolder') }}</el-button>
          <!-- 移动:把全部已完成的漫画移到本地库文件夹(设置里填了默认路径就直接移,不再弹选择) -->
          <el-button size="small" :disabled="!movableCount" @click="$emit('move-all')">{{ $t('m.downloadMove') }}</el-button>
        </span>
        <!-- 收起右栏:始终钉在最右边(不受其它按钮多少/面板宽度影响) -->
        <el-button class="download-panel-back" size="small" text :icon="ArrowLeft" :title="$t('m.back')" @click="$emit('close')"></el-button>
      </template>
      <template v-else>
        <el-button size="small" text @click="$emit('back')">← {{ $t('m.back') }}</el-button>
        <span class="download-panel-title" :title="previewTask.title">{{ previewTask.title }}</span>
        <span class="download-panel-progress">
          {{ $t('m.downloadStatusDone') }} {{ doneCount }}/{{ totalCount }}
          <template v-if="previewTask.failed"> · ✗{{ previewTask.failed }}</template>
        </span>
      </template>
    </div>
    <!-- 任务列表:整体是列表模式(一行一条:左封面 + 右信息) -->
    <div class="download-list" v-if="!previewTask">
      <div v-if="pathMissing" class="download-hint">{{ $t('m.downloadNeedPath') }}</div>
      <EmptyState v-if="!taskViews.length" class="download-empty" :title="$t('m.downloadEmpty')" />
      <div v-for="tv in taskViews" :key="tv.id" class="download-item">
        <!-- 右侧一条竖轴:X(顶)/ 移动(中)/ 垃圾桶(底),三者 right:4 对齐 -->
        <el-button
          class="download-item-close"
          size="small"
          text
          :icon="Close"
          :title="$t('m.downloadDeleteRecordOnly')"
          @click.stop="$emit('task-action', tv.task, 'delete')"
        ></el-button>
        <el-button
          v-if="tv.canMove"
          class="download-item-move"
          size="small"
          link
          type="primary"
          :icon="FolderOpened"
          :title="$t('m.downloadMove')"
          @click.stop="$emit('move-one', tv.task)"
        ></el-button>
        <el-button
          class="download-item-trash"
          size="small"
          link
          type="danger"
          :icon="MdTrash"
          :title="$t('m.downloadDeleteRecordAndFiles')"
          @click.stop="$emit('delete-with-files', tv.task)"
        ></el-button>
        <!-- 封面:左键 = 预览已下好的页。is-pending = 还没下完:封面做模糊 + 压暗 -->
        <div class="download-card-cover" :class="{ 'is-pending': tv.pending }" :title="$t('m.downloadPreviewHint')" @click="$emit('open-preview', tv.task)">
          <img
            v-if="(tv.task.coverPath || tv.task.cover) && !tv.coverFailed"
            :src="tv.coverSrc"
            loading="lazy"
            @error="$emit('cover-error', tv.task)"
          />
          <div v-else class="download-card-cover-empty"></div>
          <template v-if="tv.pending">
            <div class="download-card-mask"></div>
            <div class="download-card-overlay">
              <div class="download-card-ringwrap">
                <el-progress
                  type="circle"
                  :percentage="tv.percent"
                  :width="40"
                  :stroke-width="4"
                  :show-text="false"
                  :status="tv.task.status === 'failed' ? 'exception' : ''"
                />
                <span
                  class="download-card-action"
                  :title="tv.task.status === 'downloading' ? $t('m.pauseTask') : $t('m.resumeTask')"
                  @click.stop="$emit('task-action', tv.task, tv.task.status === 'downloading' ? 'pause' : 'resume')"
                >
                  <el-icon :size="20"><component :is="tv.task.status === 'downloading' ? MdPause : MdPlay" /></el-icon>
                </span>
              </div>
              <div class="download-card-count">
                {{ tv.task.done }}/{{ tv.task.total }}
              </div>
            </div>
          </template>
        </div>
        <!-- 右侧:标题 → 中间标签行 → 状态/进度 → 右下角时间 + 底部细进度条 -->
        <div class="download-body">
          <div class="download-title" :title="tv.task.title" @click="$emit('open-task-detail', tv.task)">{{ tv.task.title }}</div>
          <div class="download-tags" v-if="tv.tags.length || tv.task.category">
            <span v-if="tv.task.category" class="download-tag is-cat" :title="galleryCategoryName(tv.task.category, $t)" @click.stop="$emit('tag-click', { text: tv.task.category, ns: 'category' })">{{ galleryCategoryName(tv.task.category, $t) }}</span>
            <span
              v-for="(tg, ti) in tv.tags"
              :key="ti"
              class="download-tag"
              :title="tg.full"
              :style="tg.color ? { color: tg.color } : null"
              @click.stop="$emit('tag-click', tg)"
            >{{ tg.text }}</span>
          </div>
          <div class="download-meta">
            <span v-if="tv.task.original" class="download-pill">{{ $t('m.downloadOriginalTag') }}</span>
            <span v-if="tv.task.failed > 0" class="download-fail-chip">✗{{ tv.task.failed }}</span>
            <span class="download-count">
              <template v-if="tv.task.phase === 'links'">{{ $t('m.downloadCollecting', { n: tv.task.linkCount || 0 }) }}</template>
              <template v-else>{{ tv.task.done }}/{{ tv.task.total }}</template>
            </span>
            <span v-if="tv.task.bytes > 0" class="download-size" :title="tv.task.bytes + ' bytes'">{{ tv.sizeText }}</span>
            <span v-if="tv.task.movedTo" class="download-moved" :title="tv.task.movedTo">{{ $t('m.downloadMoved') }}</span>
            <span v-else class="download-status" :class="'is-' + tv.task.status">{{ tv.statusText }}</span>
          </div>
          <div class="download-foot">
            <span class="download-card-time">{{ tv.timeText }}</span>
            <div class="download-bar-row">
              <el-progress
                class="download-thin-bar"
                :percentage="tv.percent"
                :stroke-width="4"
                :show-text="false"
                :status="tv.task.status === 'done' ? 'success' : ''"
              />
              <span
                v-if="tv.hintText"
                class="download-warn-wrap"
                @mouseenter.stop="$emit('warn-hover', tv.id)"
                @mouseleave.stop="$emit('warn-leave')"
              >
                <el-icon class="download-card-warn" @click.stop="$emit('warn-toggle', tv.id)"><Warning /></el-icon>
                <span v-if="warnId === tv.id" class="download-warn-pop">{{ tv.hintText }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- 预览:点封面进来。整本的每一页都占一格 -->
    <div class="download-preview" v-else>
      <div
        v-for="pv in previewViews"
        :key="pv.index"
        class="download-preview-item"
        :class="{ 'is-ready': pv.ready, 'is-failed': !pv.file && pv.state === 'failed' }"
        @contextmenu="$emit('preview-context', $event, pv.index)"
      >
        <img
          v-if="pv.file && !pv.imgFailed"
          :src="pv.src"
          loading="lazy"
          decoding="async"
          :title="String(pv.index + 1)"
          @click="$emit('preview-page', pv.index)"
          @error="$emit('preview-img-error', $event, pv.index)"
        />
        <div v-else-if="pv.file" class="download-preview-blank is-imgfailed" @click="$emit('retry-img', pv.index)">
          <el-icon :size="16"><Refresh /></el-icon>
          <span class="download-preview-page">{{ pv.index + 1 }}</span>
          <span class="download-preview-state">{{ $t('m.previewImgFailed') }}</span>
        </div>
        <div v-else class="download-preview-blank">
          <el-icon v-if="pv.state === 'failed'" :size="16"><Close /></el-icon>
          <el-icon v-else-if="pv.state === 'waiting'" class="is-loading" :size="16"><Loading /></el-icon>
          <el-icon v-else-if="pv.state === 'pending'" :size="16"><Clock /></el-icon>
          <span class="download-preview-page">{{ pv.index + 1 }}</span>
          <span class="download-preview-state">{{ pv.stateText }}</span>
        </div>
      </div>
      <EmptyState v-if="previewTask && !previewTask.dir" class="download-empty" :title="$t('m.downloadPreviewNoDir')" />
      <EmptyState v-else-if="!previewViews.length" class="download-empty" :title="$t('m.downloadPreviewEmpty')" />
    </div>
  </div>
</template>

<script setup>
/**
 * 下载记录栏（T03-9）。
 *
 * 抽取原则（架构文档「只搬不改」）：
 *   · 展示逻辑全部下沉到本组件；
 *   · 数据/动作全部由 App.vue 提供：taskViews / previewViews 两个 computed 把
 *     「每条任务的封面地址、百分比、标签、尺寸、时间、状态文案、提示文案」一次算好，
 *     组件里不再出现任何 this.* 依赖；
 *   · 拖宽手柄保留（.emm-resizing 由 App.vue 的 startDownloadPanelResize 加到 body 上，
 *     它是 D5 离屏卸载的护栏之一）。
 */
import { ArrowLeft, Close, FolderOpened, Warning, Refresh, Loading, Clock } from '@element-plus/icons-vue'
import { MdTrash, MdPause, MdPlay } from '@vicons/ionicons4'
import EmptyState from './states/EmptyState.vue'
import { galleryCategoryName } from '../utils.js'

defineProps({
  visible: { type: Boolean, default: false },
  width: { type: Number, default: 320 },
  previewTask: { type: Object, default: null },
  // 任务视图模型（App.vue: downloadTaskViews）
  taskViews: { type: Array, default: () => [] },
  pathMissing: { type: Boolean, default: false },
  resumableCount: { type: Number, default: 0 },
  movableCount: { type: Number, default: 0 },
  doneCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  // 预览页视图模型（App.vue: previewViews）
  previewViews: { type: Array, default: () => [] },
  // 正在显示提示浮层的任务 id
  warnId: { type: String, default: '' },
})

defineEmits([
  'resize-start', 'resume-all', 'open-folder', 'move-all', 'close', 'back',
  'task-action', 'move-one', 'delete-with-files', 'open-preview', 'open-task-detail',
  'tag-click', 'cover-error', 'warn-hover', 'warn-leave', 'warn-toggle',
  'preview-context', 'preview-page', 'preview-img-error', 'retry-img',
])
</script>
