<template>
  <!-- 自动生成合集:先给建议(可勾选/改标题),确认后才写入 -->
  <el-dialog v-model="visible" :title="$t('m.autoCollectionTitle')" width="760px" append-to-body class="auto-collection-dialog">
    <div v-if="loading" class="ac-loading">
      <el-icon class="is-loading" :size="22"><Loading /></el-icon>
      <span>{{ $t('m.autoCollectionScanning') }}</span>
    </div>
    <template v-else>
      <div v-if="!suggestions.length" class="ac-empty">{{ $t('m.autoCollectionNone') }}</div>
      <template v-else>
        <div class="ac-hint">
          {{ $t('m.autoCollectionHint', { n: suggestions.length, m: totalBooks }) }}
        </div>
        <div class="ac-toolbar">
          <el-button size="small" @click="selectAll">{{ $t('m.autoCollectionSelectAll') }}</el-button>
          <el-button size="small" @click="selectNone">{{ $t('m.autoCollectionSelectNone') }}</el-button>
          <span class="ac-threshold">
            {{ $t('m.autoCollectionMinConfidence') }}
            <el-input-number v-model="minConfidence" :min="0" :max="100" :step="10" size="small" />
          </span>
        </div>
        <div class="ac-list">
          <div
            v-for="s in filteredSuggestions"
            :key="s.id"
            class="ac-group"
            :class="{ 'is-checked': picked[s.id] }"
          >
            <div class="ac-group-head">
              <el-checkbox v-model="picked[s.id]" />
              <el-input v-model="titles[s.id]" size="small" class="ac-title-input" :placeholder="s.title" />
              <el-tag size="small" :type="confType(s.confidence)" class="ac-conf">
                {{ $t('m.autoCollectionConfidence') }} {{ s.confidence }}%
              </el-tag>
              <span class="ac-reason">{{ reasonText(s.reason) }} · {{ s.books.length }}{{ $t('m.autoCollectionBooksUnit') }}</span>
            </div>
            <div class="ac-books">
              <span v-for="b in s.books" :key="b.hash" class="ac-book" :title="b.filepath">{{ b.title }}</span>
            </div>
          </div>
        </div>
      </template>
    </template>
    <template #footer>
      <el-button @click="visible = false">{{ $t('m.cancel') }}</el-button>
      <el-button type="primary" :disabled="!pickedCount || saving" :loading="saving" @click="apply">
        {{ $t('m.autoCollectionApply', { n: pickedCount }) }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  books: { type: Array, default: null }
})
const emit = defineEmits(['update:modelValue', 'applied'])
const { t } = useI18n()
const appStore = useAppStore()
const { bookList, collectionList } = storeToRefs(appStore)

const visible = ref(false)
const loading = ref(false)
const saving = ref(false)
const suggestions = ref([])
const picked = ref({})
const titles = ref({})
const minConfidence = ref(0)

watch(() => props.modelValue, (v) => { visible.value = v; if (v) scan() }, { immediate: true })
watch(visible, (v) => emit('update:modelValue', v))

const totalBooks = computed(() => (props.books || bookList.value || []).filter(b => b && !b.isCollection).length)
const filteredSuggestions = computed(() => suggestions.value.filter(s => s.confidence >= minConfidence.value))
const pickedCount = computed(() => filteredSuggestions.value.filter(s => picked.value[s.id]).length)

const reasonText = (r) => ({
  'same-folder': t('m.autoCollectionReasonFolder'),
  'title-prefix': t('m.autoCollectionReasonTitle'),
  'shared-tag': t('m.autoCollectionReasonTag'),
  'artist': t('m.autoCollectionReasonArtist')
} [r] || r)
const confType = (c) => c >= 80 ? "success" : c >= 60 ? "warning" : "info"

const scan = async () => {
  loading.value = true
  suggestions.value = []
  picked.value = {}
  titles.value = {}
  try {
    const list = (props.books || bookList.value || []).filter(b => b && !b.isCollection)
    const r = await ipcRenderer.invoke('suggest-collections', list)
    if (r && r.ok) {
      suggestions.value = r.suggestions || []
      const p = {}
      const ti = {}
      for (const s of suggestions.value) {
        p[s.id] = s.confidence >= 70
        ti[s.id] = s.title
      }
      picked.value = p
      titles.value = ti
    } else {
      ElMessage.error((r && r.error) || t('m.autoCollectionFailed'))
    }
  } catch (e) {
    ElMessage.error(String((e && e.message) || e))
  } finally {
    loading.value = false
  }
}

const selectAll = () => {
  const p = { ...picked.value }
  for (const s of filteredSuggestions.value) p[s.id] = true
  picked.value = p
}
const selectNone = () => {
  const p = { ...picked.value }
  for (const s of filteredSuggestions.value) p[s.id] = false
  picked.value = p
}

const apply = async () => {
  const chosen = filteredSuggestions.value.filter(s => picked.value[s.id])
  if (!chosen.length) return
  saving.value = true
  try {
    const list = JSON.parse(JSON.stringify(collectionList.value || []))
    let created = 0
    for (const s of chosen) {
      const title = String(titles.value[s.id] || s.title || '合集').trim()
      const hashes = s.books.map(b => b.hash).filter(Boolean)
      const exist = list.find(c => String(c.title || "").trim() === title)
      if (exist) {
        const set = new Set([...(exist.list || []), ...hashes])
        exist.list = [...set]
      } else {
        list.push({ id: 'ac-' + Date.now() + '-' + created, title, list: hashes })
        created += 1
      }
    }
    await ipcRenderer.invoke('save-collection-list', list)
    collectionList.value = list
    ElMessage.success(t('m.autoCollectionDone', { n: chosen.length }))
    emit('applied')
    visible.value = false
  } catch (e) {
    ElMessage.error(String((e && e.message) || e))
  } finally {
    saving.value = false
  }
}
</script>

<style lang="stylus">
.auto-collection-dialog
  .ac-loading
    display: flex
    align-items: center
    justify-content: center
    gap: 10px
    height: 160px
    color: var(--el-text-color-secondary)
  .ac-empty
    padding: 30px 0
    text-align: center
    color: var(--el-text-color-secondary)
  .ac-hint
    font-size: 12px
    color: var(--el-text-color-secondary)
    margin-bottom: 8px
  .ac-toolbar
    display: flex
    align-items: center
    gap: 8px
    margin-bottom: 10px
    .ac-threshold
      margin-left: auto
      font-size: 12px
      color: var(--el-text-color-secondary)
      display: flex
      align-items: center
      gap: 6px
  .ac-list
    max-height: 52vh
    overflow-y: auto
    display: flex
    flex-direction: column
    gap: 8px
  .ac-group
    border: 1px solid var(--el-border-color-lighter)
    border-radius: 6px
    padding: 8px 10px
    &.is-checked
      border-color: var(--el-color-primary)
      background: var(--el-color-primary-light-9)
    .ac-group-head
      display: flex
      align-items: center
      gap: 8px
      .ac-title-input
        flex: 1
        min-width: 0
      .ac-conf
        flex: none
      .ac-reason
        flex: none
        font-size: 11px
        color: var(--el-text-color-secondary)
    .ac-books
      display: flex
      flex-wrap: wrap
      gap: 4px
      margin-top: 6px
      .ac-book
        font-size: 11px
        padding: 1px 6px
        border-radius: 3px
        background: var(--el-fill-color-light)
        color: var(--el-text-color-regular)
        max-width: 240px
        overflow: hidden
        text-overflow: ellipsis
        white-space: nowrap
</style>
