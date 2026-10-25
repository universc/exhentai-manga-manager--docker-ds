<template>
  <el-dialog
    v-model="visible_"
    :title="$t('m.filter')"
    width="400px"
    append-to-body
    class="eh-filter-dialog"
  >
    <div class="ehf-body">
      <!-- 分类:10 格两列,和 JHenTai 那个筛选对话框同款排布;长按(或右键)= 只看这一类 -->
      <div class="ehf-cats">
        <div
          v-for="c in categories"
          :key="c.key"
          class="ehf-cat"
          :class="{ 'is-on': model[c.key] }"
          :title="$t('m.filterOnlyThis')"
          @click="toggleCat(c.key)"
          @contextmenu.prevent="onlyCat(c.key)"
          @pointerdown="onCatDown(c.key)"
          @pointerup="onCatUp"
          @pointerleave="onCatUp"
        >{{ galleryCategoryName(c.name, $t) }}</div>
      </div>

      <div class="ehf-field">
        <div class="ehf-label">{{ $t('m.keyword') }}</div>
        <el-input v-model="model.keyword" clearable :placeholder="$t('m.filterKeywordPlaceholder')" />
        <div class="ehf-hint">{{ $t('m.filterKeywordHint') }}</div>
      </div>

      <div class="ehf-field">
        <div class="ehf-label">{{ $t('m.language') }}</div>
        <el-select v-model="model.language" class="ehf-select" clearable :placeholder="$t('m.unlimited')">
          <el-option v-for="l in languages" :key="l" :label="cap(l)" :value="l"></el-option>
        </el-select>
      </div>

      <div class="ehf-field">
        <div class="ehf-label">{{ $t('m.pagesBetween') }}</div>
        <div class="ehf-pages">
          <el-input-number v-model="model.pageAtLeast" :min="0" :controls="false" :placeholder="$t('m.unlimited')" />
          <span class="ehf-to">{{ $t('m.to') }}</span>
          <el-input-number v-model="model.pageAtMost" :min="0" :controls="false" :placeholder="$t('m.unlimited')" />
        </div>
      </div>

      <div class="ehf-field">
        <div class="ehf-label">{{ $t('m.minimumRating') }}</div>
        <!-- 星星评分(与主界面一致):半星可选;0 颗 = 不限 -->
        <div class="ehf-rating-stars">
          <el-rate v-model="ratingStars" allow-half :max="5" :clearable="true" />
          <span class="ehf-rating-text">{{ ratingStars > 0 ? (ratingStars + ' ★ 及以上') : $t('m.unlimited') }}</span>
        </div>
      </div>

      <!-- 黑名单标签:命中就整本隐藏(本地库与 EH在线 都生效;EH在线 还会作为 -tag 交给 EH 排) -->
      <div class="ehf-field">
        <div class="ehf-label">{{ $t('m.filterBlacklist') }}</div>
        <el-input v-model="model.blacklist" clearable :placeholder="$t('m.filterBlacklistPlaceholder')" />
        <!-- 记录标签:用过的黑名单标签记下来,点一下就追加,不用每次重新敲 -->
        <el-select
          v-if="blacklistHistory.length"
          class="ehf-select ehf-blacklist-history"
          :model-value="[]"
          multiple
          filterable
          allow-create
          default-first-option
          :placeholder="$t('m.filterBlacklistHistory')"
          @change="addBlacklistHistory"
        >
          <el-option v-for="tag in blacklistHistory" :key="tag" :label="tag" :value="tag"></el-option>
        </el-select>
        <div class="ehf-hint">{{ $t('m.filterBlacklistHint') }}</div>
      </div>

      <!-- 这两个只对 EH在线 有意义(会作为 f_sh / f_sto 发给 EH),本地库列表不受影响 -->
      <div class="ehf-switch">
        <span>{{ $t('m.onlySearchExpungedGalleries') }}</span>
        <el-switch v-model="model.expunged"></el-switch>
      </div>
      <div class="ehf-switch">
        <span>{{ $t('m.onlyShowGalleriesWithTorrents') }}</span>
        <el-switch v-model="model.torrents"></el-switch>
      </div>
    </div>

    <template #footer>
      <el-button @click="resetAll">{{ $t('m.reset') }}</el-button>
      <el-button type="primary" @click="apply">{{ $t('m.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch } from 'vue'
import { EH_FILTER_CATEGORIES, EH_FILTER_LANGUAGES, defaultEhFilter } from '../ehFilter.js'
import { galleryCategoryName } from '../utils.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  filter: { type: Object, default: null }
})
const emit = defineEmits(['update:visible', 'apply'])

const categories = EH_FILTER_CATEGORIES
const languages = EH_FILTER_LANGUAGES

const visible_ = ref(props.visible)
watch(() => props.visible, v => { visible_.value = v })
watch(visible_, v => emit('update:visible', v))

// 每次打开都用外面那份筛选值重置一遍,避免上一次的临时改动留在界面上
const model = reactive(defaultEhFilter())

// 评分 0.5 步进:1(不限)/1.5/2/…/5
const ratingOptions = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]

// 星星评分:0 颗 = 不限(映射回 minimumRating 的 1);半星直接对应 1.5/2.5/…
const ratingStars = ref(0)
watch(ratingStars, (v) => { model.minimumRating = (Number(v) || 0) > 1 ? Number(v) : 1 })
watch(() => model.minimumRating, (v) => { const n = Number(v); if (n > 1 && n !== ratingStars.value) ratingStars.value = n })

// 黑名单的「记录标签」:输入过的标签存 localStorage,下次打开直接点选追加
const HISTORY_KEY = 'emmEhBlacklistHistory'
const blacklistHistory = ref([])
try { blacklistHistory.value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch (e) { blacklistHistory.value = [] }
const saveBlacklistHistory = () => {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(blacklistHistory.value.slice(0, 60))) } catch (e) { /* 忽略 */ }
}
const addBlacklistHistory = (tags) => {
  const list = String(model.blacklist || '').split(/[,，、]+/).map(t => t.trim()).filter(Boolean)
  for (const t of tags) {
    const name = String(t).trim()
    if (!name || list.includes(name)) continue
    list.push(name)
    if (!blacklistHistory.value.includes(name)) blacklistHistory.value.unshift(name)
  }
  blacklistHistory.value = blacklistHistory.value.slice(0, 60)
  saveBlacklistHistory()
  model.blacklist = list.join(',')
}
// 手动输入/修改黑名单时也把用过的标签记进历史(下次直接点选,不用重新敲)
watch(() => model.blacklist, (v) => {
  const tags = String(v || '').split(/[,，、]+/).map(t => t.trim()).filter(Boolean)
  if (!tags.length) return
  let changed = false
  for (const t of tags.reverse()) {
    if (!blacklistHistory.value.includes(t)) { blacklistHistory.value.unshift(t); changed = true }
  }
  if (changed) {
    blacklistHistory.value = blacklistHistory.value.slice(0, 60)
    saveBlacklistHistory()
  }
})
const syncFromProps = () => {
  ratingStars.value = (Number(model.minimumRating) || 0) > 1 ? Number(model.minimumRating) : 0
  const src = { ...defaultEhFilter(), ...(props.filter || {}) }
  for (const k of Object.keys(model)) model[k] = src[k]
}
syncFromProps()
watch(() => props.visible, v => { if (v) syncFromProps() })

const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1)

const toggleCat = (key) => { model[key] = !model[key] }
// 长按 / 右键 = 只看这一类(JHenTai 长按分类格就是这个动作)
const onlyCat = (key) => {
  for (const c of categories) model[c.key] = (c.key === key)
}
let catTimer = null
const onCatDown = (key) => {
  clearTimeout(catTimer)
  catTimer = setTimeout(() => { onlyCat(key) }, 500)
}
const onCatUp = () => { clearTimeout(catTimer) }

const resetAll = () => {
  const base = defaultEhFilter()
  for (const k of Object.keys(model)) model[k] = base[k]
}

const apply = () => {
  emit('apply', { ...model })
  visible_.value = false
}
</script>

<style lang="stylus">
.eh-filter-dialog
  .el-dialog__body
    padding-top: 8px
.ehf-body
  display: flex
  flex-direction: column
  gap: 12px
.ehf-cats
  display: grid
  grid-template-columns: repeat(2, 1fr)
  gap: 6px
  .ehf-cat
    height: 30px
    line-height: 30px
    text-align: center
    font-size: 13px
    border-radius: 6px
    cursor: pointer
    user-select: none
    color: var(--el-text-color-regular)
    background: var(--el-fill-color-light)
    border: 1px solid transparent
    transition: all .15s
    &.is-on
      color: var(--el-color-primary)
      background: var(--el-color-primary-light-9)
      border-color: var(--el-color-primary-light-5)
    &:hover
      border-color: var(--el-color-primary-light-3)
.ehf-field
  display: flex
  flex-direction: column
  gap: 4px
  .ehf-label
    font-size: 13px
    color: var(--el-text-color-regular)
  .ehf-hint
    font-size: 11px
    line-height: 1.5
    color: var(--el-text-color-placeholder)
  .ehf-select
    width: 100%
.ehf-pages
  display: flex
  align-items: center
  gap: 8px
  .el-input-number
    flex: 1
  .ehf-to
    font-size: 13px
    color: var(--el-text-color-regular)
.ehf-switch
  display: flex
  align-items: center
  justify-content: space-between
  font-size: 13px
  color: var(--el-text-color-regular)
</style>

.ehf-blacklist-history
  margin-top: 6px
  width: 100%

.ehf-rating-stars
  display: flex
  align-items: center
  gap: 10px
  .ehf-rating-text
    font-size: 12px
    color: var(--el-text-color-secondary)
