<template>
  <!-- 绅士漫画合集:选要下载的章节(可多选)。
       和本地合集「添加漫画」那种多选弹窗同一个交互:点卡片切换勾选,底部确认。 -->
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="min(980px, 94vw)"
    top="6vh"
    append-to-body
    class="series-download-picker"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @open="onOpen"
  >
    <div class="sdp-toolbar">
      <el-checkbox
        :model-value="allChecked"
        :indeterminate="someChecked"
        @change="toggleAll"
      >{{ $t('m.selectAll') }}</el-checkbox>
      <span class="sdp-count">{{ $t('m.selectedCount', { n: selected.length }) }}</span>
      <span class="sdp-hint">{{ $t('m.seriesDlPickHint') }}</span>
    </div>
    <div class="sdp-grid" v-if="chapters.length">
      <div
        v-for="c in chapters"
        :key="c.chid"
        class="sdp-item"
        :class="{ 'is-checked': selected.includes(c.chid) }"
        :title="c.order + ' ' + c.title"
        @click="toggle(c)"
      >
        <div class="sdp-cover">
          <img v-if="c.coverPath" :src="wnacgImageSrc(c.coverPath, c.url)" loading="lazy" decoding="async" />
          <div v-else class="sdp-cover-empty"></div>
          <span class="sdp-check"><el-icon v-if="selected.includes(c.chid)" :size="14"><Check /></el-icon></span>
          <span class="sdp-order">{{ c.order }}</span>
        </div>
        <div class="sdp-title">{{ c.title }}</div>
        <div class="sdp-meta">
          <span v-if="c.pageCount">{{ c.pageCount }}P</span>
          <span v-if="c.posted">{{ c.posted }}</span>
        </div>
      </div>
    </div>
    <div class="sdp-empty" v-else>{{ $t('m.emptyContent') }}</div>
    <template #footer>
      <span class="sdp-mode">
        <span class="sdp-mode-label">{{ $t('m.seriesDlMode') }}</span>
        <el-radio-group v-model="mode" size="small">
          <el-radio-button label="read">{{ $t('m.wnacgDlRead') }}</el-radio-button>
          <el-radio-button label="server1">{{ $t('m.wnacgDlServer1') }}</el-radio-button>
          <el-radio-button label="server2">{{ $t('m.wnacgDlServer2') }}</el-radio-button>
        </el-radio-group>
      </span>
      <el-button size="small" @click="emit('update:modelValue', false)">{{ $t('m.cancel') }}</el-button>
      <el-button size="small" type="primary" :disabled="!selected.length" @click="confirm">
        {{ $t('m.download') }} ({{ selected.length }})
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check } from '@element-plus/icons-vue'
import { wnacgImageSrc } from '../wnacgOnline.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // 合集的所有章节(带 coverPath)
  chapters: { type: Array, default: () => [] },
  // 打开时默认选中的章节 chid 列表(右键单话时只选那一话)
  presetSelected: { type: Array, default: () => [] },
  // 默认线路
  presetMode: { type: String, default: 'read' },
})
const emit = defineEmits(['update:modelValue', 'confirm'])
const { t } = useI18n()

const selected = ref([])
const mode = ref('read')

const title = computed(() => t('m.seriesDlTitle', { n: props.chapters.length }))
const allChecked = computed(() => props.chapters.length > 0 && selected.value.length === props.chapters.length)
const someChecked = computed(() => selected.value.length > 0 && !allChecked.value)

const onOpen = () => {
  mode.value = props.presetMode || 'read'
  const presets = Array.isArray(props.presetSelected) ? props.presetSelected.filter(Boolean) : []
  selected.value = presets.length
    ? presets.slice()
    : props.chapters.map(c => c.chid).filter(Boolean)   // 默认全选:整本下载是最常见的意图
}
const toggle = (c) => {
  const k = c && c.chid
  if (!k) return
  const i = selected.value.indexOf(k)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(k)
}
const toggleAll = (v) => {
  selected.value = v ? props.chapters.map(c => c.chid).filter(Boolean) : []
}
const confirm = () => {
  const picked = props.chapters.filter(c => selected.value.includes(c.chid))
  if (!picked.length) return
  emit('confirm', { chapters: picked, mode: mode.value })
  emit('update:modelValue', false)
}
</script>

<style scoped>
.sdp-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 13px;
}
.sdp-count { color: var(--el-color-primary); font-variant-numeric: tabular-nums; }
.sdp-hint { margin-left: auto; font-size: 12px; color: var(--el-text-color-secondary); }
.sdp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 10px;
  max-height: 56vh;
  overflow-y: auto;
  padding-right: 4px;
}
.sdp-item {
  border: 2px solid transparent;
  border-radius: 6px;
  padding: 4px;
  cursor: pointer;
  background: var(--el-fill-color-light);
  transition: border-color .12s ease;
}
.sdp-item.is-checked { border-color: var(--el-color-primary); }
.sdp-cover {
  position: relative;
  aspect-ratio: 3 / 4;
  border-radius: 4px;
  overflow: hidden;
  background: var(--el-fill-color);
}
.sdp-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sdp-cover-empty { width: 100%; height: 100%; background: var(--el-fill-color-dark); }
.sdp-check {
  position: absolute;
  top: 4px; right: 4px;
  width: 20px; height: 20px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--el-color-primary);
  color: #fff;
}
.sdp-item:not(.is-checked) .sdp-check { background: rgba(0,0,0,.35); }
.sdp-order {
  position: absolute;
  left: 0; bottom: 0;
  padding: 1px 6px;
  font-size: 11px;
  border-top-right-radius: 4px;
  background: rgba(0,0,0,.55);
  color: #fff;
}
.sdp-title {
  font-size: 12px;
  line-height: 1.3;
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.sdp-meta {
  display: flex; gap: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.sdp-mode { display: inline-flex; align-items: center; gap: 8px; margin-right: 12px; }
.sdp-mode-label { font-size: 12px; color: var(--el-text-color-secondary); }
.sdp-empty { padding: 24px; text-align: center; color: var(--el-text-color-secondary); }
</style>
