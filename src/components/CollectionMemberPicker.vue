<template>
  <!-- 选择漫画加入合集:合集抽屉 / 合集详情的「添加漫画」共用这一个弹窗。
       只列**还没在这个合集里**的本地书;点卡片切换勾选,确认后把 hash/id 交给 App 写入
       collectionList,并就地更新合集聚合条目(不整库重载)。 -->
  <el-dialog
    :model-value="modelValue"
    :title="$t('m.addMangaToCollection')"
    width="min(1040px, 94vw)"
    top="6vh"
    append-to-body
    class="collection-member-picker"
    @update:model-value="(v) => emit('update:modelValue', v)"
    @open="onOpen"
  >
    <div class="cmp-toolbar">
      <el-input
        v-model="keyword"
        class="cmp-search"
        clearable
        :prefix-icon="Search32Filled"
        :placeholder="$t('m.search')"
      />
      <span class="cmp-count">{{ $t('m.selectedCount', { n: selected.length }) }}</span>
      <span class="cmp-total" v-if="candidateTotal > shownList.length">
        {{ shownList.length }} / {{ candidateTotal }}
      </span>
    </div>
    <div class="cmp-grid" v-if="shownList.length">
      <div
        v-for="b in shownList"
        :key="keyOf(b)"
        class="cmp-item"
        :class="{ 'is-checked': selected.includes(keyOf(b)) }"
        :title="titleOf(b)"
        @click="toggle(b)"
      >
        <div class="cmp-cover">
          <img v-if="b.coverPath" :src="bookImgSrc(b.coverPath)" loading="lazy" decoding="async" />
          <div v-else class="cmp-cover-empty"></div>
          <span class="cmp-check"><el-icon v-if="selected.includes(keyOf(b))" :size="14"><Check /></el-icon></span>
        </div>
        <div class="cmp-title">{{ titleOf(b) }}</div>
      </div>
    </div>
    <div class="cmp-empty" v-else>{{ $t('m.emptyContent') }}</div>
    <template #footer>
      <el-button size="small" @click="emit('update:modelValue', false)">{{ $t('m.cancel') }}</el-button>
      <el-button size="small" type="primary" :disabled="!selected.length" @click="confirm">{{ $t('m.addToCollection') }} ({{ selected.length }})</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import { Check } from '@element-plus/icons-vue'
import { Search32Filled } from '@vicons/fluent'
import { bookImgSrc } from '../utils.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // 要加成员的那个合集 id
  collectionId: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'confirm'])

const appStore = useAppStore()
const { bookList, collectionList } = storeToRefs(appStore)
const { getDisplayTitle } = appStore

const keyword = ref('')
const selected = ref([])
// 一次最多渲染这么多本:大书库一万多本,全铺出来会卡死(要更多就用搜索)
const MAX_SHOWN = 300

const keyOf = (b) => String((b && (b.hash || b.id)) || '')
const titleOf = (b) => {
  try { return getDisplayTitle(b) } catch (e) { return (b && b.title) || '' }
}

// 已经在合集里的键(磁盘 list + 聚合条目的 ids/hash 都算,老数据只存 id 也认)
const existingKeys = computed(() => {
  const set = new Set()
  const rec = (collectionList.value || []).find(c => c && c.id === props.collectionId)
  if (rec && Array.isArray(rec.list)) rec.list.forEach(k => set.add(String(k)))
  const agg = (bookList.value || []).find(b => b && b.isCollection && b.id === props.collectionId)
  if (agg) {
    if (Array.isArray(agg.ids)) agg.ids.forEach(k => set.add(String(k)))
    if (Array.isArray(agg.list)) agg.list.forEach(k => set.add(String(k)))
    if (Array.isArray(agg._members)) agg._members.forEach(m => m && set.add(String(m.hash || m.id)))
  }
  return set
})

const candidates = computed(() => (bookList.value || []).filter(b => {
  if (!b || b.isCollection || b.online) return false
  const k1 = String(b.hash || '')
  const k2 = String(b.id || '')
  if ((k1 && existingKeys.value.has(k1)) || (k2 && existingKeys.value.has(k2))) return false
  return true
}))

const matched = computed(() => {
  const q = String(keyword.value || '').trim().toLowerCase()
  if (!q) return candidates.value
  return candidates.value.filter(b => {
    if (!b) return false
    const hay = [titleOf(b), b.title, b.title_jpn, b.title_cn, b.filepath]
      .filter(Boolean).join(' ').toLowerCase()
    return hay.includes(q)
  })
})
const candidateTotal = computed(() => matched.value.length)
const shownList = computed(() => matched.value.slice(0, MAX_SHOWN))

const toggle = (b) => {
  const k = keyOf(b)
  if (!k) return
  const i = selected.value.indexOf(k)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(k)
}

const onOpen = () => {
  keyword.value = ''
  selected.value = []
}

const confirm = () => {
  if (!selected.value.length) return
  emit('confirm', selected.value.slice())
  emit('update:modelValue', false)
}
</script>

<style lang="stylus">
.collection-member-picker
  .cmp-toolbar
    display: flex
    align-items: center
    gap: 12px
    margin-bottom: 10px
    .cmp-search
      max-width: 360px
    .cmp-count
      font-size: 13px
      color: var(--el-text-color-regular)
    .cmp-total
      font-size: 12px
      color: var(--el-text-color-secondary)
  .cmp-grid
    display: grid
    grid-template-columns: repeat(auto-fill, minmax(116px, 1fr))
    gap: 12px
    max-height: 62vh
    overflow-y: auto
    padding: 2px 4px 2px 2px
  .cmp-item
    cursor: pointer
    user-select: none
    .cmp-cover
      position: relative
      width: 100%
      aspect-ratio: 3 / 4
      border-radius: 4px
      overflow: hidden
      background: var(--el-fill-color-light)
      img
        width: 100%
        height: 100%
        object-fit: cover
      .cmp-cover-empty
        width: 100%
        height: 100%
        background: var(--el-fill-color-light)
    .cmp-check
      position: absolute
      top: 6px
      right: 6px
      width: 20px
      height: 20px
      border-radius: 50%
      border: 1px solid rgba(255, 255, 255, .9)
      background: rgba(0, 0, 0, .35)
      color: #fff
      display: flex
      align-items: center
      justify-content: center
    .cmp-title
      margin-top: 4px
      font-size: 12px
      line-height: 1.35
      max-height: 2.7em
      overflow: hidden
      display: -webkit-box
      -webkit-line-clamp: 2
      -webkit-box-orient: vertical
      word-break: break-all
    &:hover .cmp-title
      color: var(--el-color-primary)
    &.is-checked
      .cmp-cover
        outline: 2px solid var(--el-color-primary)
        outline-offset: -2px
      .cmp-check
        background: var(--el-color-primary)
        border-color: var(--el-color-primary)
      .cmp-title
        color: var(--el-color-primary)
  .cmp-empty
    padding: 60px 0
    text-align: center
    font-size: 13px
    color: var(--el-text-color-secondary)
</style>
