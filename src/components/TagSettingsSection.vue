<template>
  <!-- 「设置 → 标签」整页的复用版本:管理界面底部与设置页共用同一个组件,
       所以两边看到的类别胶囊 / 标签列表 / 已收藏标签 / 收藏开关 / 语言 / 更新词库完全一致。 -->
  <div class="tag-settings-section setting-line collect-tag" :class="{ 'is-expanded': expanded }">
    <div class="tag-cat-header">
      <span class="label-with-hint">
        <span class="context-menu-title">{{ $t('m.tagCatSet') }}</span>
        <SettingHint
          placement="right-start"
          :title="$t('m.tagHelpTitle')"
          :lines="[$t('m.tagHelp1'), $t('m.tagHelp2'), $t('m.tagHelp3'), $t('m.tagHelp4')]"
        />
      </span>
      <el-space>
        <el-button size="small" type="success" plain @click="openEditorNew()">{{ $t('m.addNewTag') }}</el-button>
        <el-button size="small" plain @click="openAddCategoryDialog">{{ $t('m.tagCatAdd') }}</el-button>
        <el-button size="small" type="primary" plain :loading="titleAnalyzing" @click="analyzeTitles">{{ $t('m.titleAnalyze') }}</el-button>
      </el-space>
    </div>

    <!-- 类别标签:拖动排序(顺序存 setting.tagCatOrder,也决定详细信息里标签分类的上下顺序);
         单击筛选该类别,双击编辑多语言名称 -->
    <draggable
      v-model="orderedTagCats"
      item-key="cat"
      animation="200"
      class="tag-cat-list"
      @change="onTagCatOrderChange"
    >
      <template #item="{ element: g }">
        <el-tag
          class="tag-cat-chip"
          :effect="selectedTagCat === g.cat ? 'dark' : 'plain'"
          :type="selectedTagCat === g.cat ? 'primary' : 'info'"
          :title="$t('m.editTagNames')"
          @click="onTagCatClick(g)"
          @dblclick="onTagCatDblClick(g)"
        >
          <span class="tag-cat-drag" @click.stop>⠿</span>{{ categoryDefaultName(g.cat) }}
          <span class="tag-cat-count">{{ g.tags.length }}</span>
        </el-tag>
      </template>
    </draggable>

    <div class="all-tags-list">
      <template v-for="g in allTagGroups" :key="g.cat">
        <div v-if="!selectedTagCat || selectedTagCat === g.cat" class="tag-group">
          <div class="tag-group-title">{{ categoryLabel(g.cat) }}</div>
          <el-tag
            v-for="tag in g.tags"
            :key="tag.id"
            :class="['all-tag-item', { 'is-collected': !!collectedTagMap[tag.id] }]"
            :effect="'plain'"
            :style="collectedTagMap[tag.id] ? tagChipFillStyle(tag.cat, tag.tag) : tagColorStyle(tag.cat, tag.tag)"
            @pointerdown="startLongPressCollect(tag)"
            @pointerup="cancelLongPressCollect"
            @pointerleave="cancelLongPressCollect"
            @pointercancel="cancelLongPressCollect"
            @click="onTagChipClick(g.cat, tag)"
            @dblclick="openEditor(tag)"
            :title="$t('m.editTagNames')"
          >
            {{ tagLabelWithSets(tag) }}
          </el-tag>
        </div>
      </template>
      <div v-if="!allTagGroups.length" class="tag-group-title">{{ $t('m.sideDetailNoTags') }}</div>
    </div>

    <!-- 已收藏标签:拖动排序;长按(或右键)= 取消收藏 -->
    <div class="context-menu-title tag-collected-title">
      <span class="label-with-hint">
        {{ $t('m.collectedTags') }}
        <SettingHint :text="$t('m.hintCollectedTags')" />
      </span>
    </div>
    <draggable
      v-model="setting.collectTag"
      item-key="id"
      animation="200"
      @change="saveNow"
    >
      <template #item="{element}">
        <el-tag
          class="collected-tag-item"
          :style="tagChipFillStyle(element.cat, element.tag)"
          @pointerdown="startLongPressUncollect(element, $event)"
          @pointermove="onLongPressUncollectMove($event)"
          @pointerup="cancelLongPressUncollect"
          @pointerleave="cancelLongPressUncollect"
          @pointercancel="cancelLongPressUncollect"
          @contextmenu.prevent="uncollectTag(element)"
        >{{ tagDisplayPrefix(setting, resolvedTranslation, element.cat, element.tag) }}:{{ getDisplayTagName(setting, resolveCatKey(element.cat), element.tag) || element.tag }}</el-tag>
      </template>
    </draggable>

    <!-- 收藏标签 / 随机标签 / 语言 / 更新词库:一行放完 -->
    <div class="setting-line tag-option-row">
      <el-switch v-model="setting.showCollectTag" :active-text="$t('m.showCollectTag')" @change="onShowCollectTagChange" />
      <el-switch v-model="setting.randomTagsEnabled" :active-text="$t('m.randomTagsEnabled')" @change="onRandomTagsChange" />
      <span class="setting-label tag-translate-label">{{ $t('m.tagTranslate') }}</span>
      <el-select v-model="setting.tagTargetLang" size="small" class="tag-target-lang" @change="onTagLangChange">
        <el-option :label="$t('m.langDefault')" value=""></el-option>
        <el-option :label="$t('m.langZhCn')" value="zh-CN"></el-option>
        <el-option :label="$t('m.langZhTw')" value="zh-TW"></el-option>
        <el-option :label="$t('m.langEn')" value="en"></el-option>
        <el-option :label="$t('m.langJa')" value="ja"></el-option>
      </el-select>
      <el-button
        size="small"
        plain
        class="tag-translation-refresh"
        :loading="translationStatus === 'loading'"
        @click="loadTranslation(true)"
      >{{ $t('m.tagTranslationUpdate') }}</el-button>
      <span class="setting-hint tag-translation-status" v-if="translationStatus === 'ok' && translationUpdatedText">
        {{ $t('m.tagTranslationUpdated') }} {{ translationUpdatedText }}
      </span>
      <span class="setting-hint tag-translation-status" v-else-if="translationStatus === 'fail'">
        {{ $t('m.tagTranslationFailed') }}
      </span>
    </div>

    <!-- 编辑 / 新增标签弹窗:与设置页同一个组件 -->
    <TagEditorDialog ref="editorRef" @refresh="emitRefresh" />

    <!-- 添加类别 -->
    <el-dialog v-model="addCategoryVisible" :title="$t('m.tagCatAdd')" width="360px" append-to-body>
      <el-input v-model="addCategoryName" :placeholder="$t('m.tagCatAddPlaceholder')" @keyup.enter="createCategory" />
      <div class="setting-hint" v-if="addCategoryName && !canAddCategory">{{ $t('m.tagCatExists') }}</div>
      <template #footer>
        <el-button size="small" @click="addCategoryVisible = false">{{ $t('m.cancel') }}</el-button>
        <el-button size="small" type="primary" :disabled="!canAddCategory" @click="createCategory">{{ $t('m.apply') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import draggable from 'vuedraggable'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import SettingHint from './SettingHint.vue'
import TagEditorDialog from './TagEditorDialog.vue'
import {
  resolveCatKey, catDisplayName, getDisplayTagName, categoryDisplayName, tagColorOf,
  tagCatRank, tagDisplayPrefix, FALLBACK_CAT
} from '../utils.js'

const props = defineProps({
  // 管理界面里空间够,不要 260px 的滚动区:全部铺开
  expanded: { type: Boolean, default: false },
  // 点标签 = 按它搜索(管理界面用;设置页没有搜索上下文,所以默认关)
  clickToSearch: { type: Boolean, default: false }
})

const appStore = useAppStore()
const { setting, resolvedTranslation, tagListRaw, cat2letter } = storeToRefs(appStore)
const { printMessage } = appStore
const { t } = useI18n()

const emit = defineEmits(['refresh', 'search'])
const emitRefresh = () => emit('refresh')

const editorRef = ref(null)
const openEditor = (tag) => { if (editorRef.value) editorRef.value.open(tag) }
const openEditorNew = (catKey) => { if (editorRef.value) editorRef.value.openNew(catKey || selectedTagCat.value || '') }

// ---------- 全库标签分组 ----------
const allTagGroups = computed(() => {
  const groups = []
  const map = {}
  const seen = new Set()
  for (const tag of tagListRaw.value) {
    const uniqKey = resolveCatKey(tag.cat) + '::' + tag.tag
    if (seen.has(uniqKey)) continue
    seen.add(uniqKey)
    const normCat = resolveCatKey(tag.cat)
    if (!map[normCat]) {
      map[normCat] = { cat: normCat, tags: [] }
      groups.push(map[normCat])
    }
    const labelTail = getDisplayTagName(setting.value, normCat, tag.tag)
      || (setting.value.showTranslation ? (resolvedTranslation.value[normCat]?.[tag.tag]?.name || tag.tag) : tag.tag)
    map[normCat].tags.push({ id: tag.id, cat: normCat, tag: tag.tag, letter: tag.letter, label: labelTail })
  }
  const globalTags = setting.value.globalTags || {}
  for (const [cat, arr] of Object.entries(globalTags)) {
    const normCat = resolveCatKey(cat)
    if (!map[normCat]) {
      map[normCat] = { cat: normCat, tags: [] }
      groups.push(map[normCat])
    }
    const have = new Set(map[normCat].tags.map(x => x.tag))
    for (const tag of (Array.isArray(arr) ? arr : [])) {
      if (!tag || have.has(tag)) continue
      have.add(tag)
      map[normCat].tags.push({
        id: normCat + ':' + tag, cat: normCat, tag,
        letter: cat2letter.value[normCat] || normCat,
        label: getDisplayTagName(setting.value, normCat, tag)
          || (setting.value.showTranslation ? (resolvedTranslation.value[normCat]?.[tag]?.name || tag) : tag)
      })
    }
  }
  if (!map[FALLBACK_CAT]) {
    map[FALLBACK_CAT] = { cat: FALLBACK_CAT, tags: [] }
    groups.push(map[FALLBACK_CAT])
  }
  for (const raw of (Array.isArray(setting.value.tagCatOrder) ? setting.value.tagCatOrder : [])) {
    const normCat = resolveCatKey(raw)
    if (map[normCat]) continue
    map[normCat] = { cat: normCat, tags: [] }
    groups.push(map[normCat])
  }
  groups.sort((a, b) => tagCatRank(setting.value, a.cat) - tagCatRank(setting.value, b.cat))
  return groups
})

const selectedTagCat = ref(null)
const orderedTagCats = computed({
  get: () => allTagGroups.value.slice(),
  set: (val) => {
    if (!Array.isArray(val)) return
    setting.value.tagCatOrder = val.map(g => g.cat)
  }
})
const onTagCatOrderChange = () => saveNow()
let tagCatClickTimer = null
const onTagCatClick = (g) => {
  if (tagCatClickTimer) clearTimeout(tagCatClickTimer)
  tagCatClickTimer = setTimeout(() => {
    tagCatClickTimer = null
    selectedTagCat.value = selectedTagCat.value === g.cat ? null : g.cat
  }, 220)
}
const onTagCatDblClick = (g) => {
  if (tagCatClickTimer) { clearTimeout(tagCatClickTimer); tagCatClickTimer = null }
  openEditor({ cat: g.cat })
}

const categoryDefaultName = (cat) => {
  const key = resolveCatKey(cat)
  const rec = (setting.value.tagCatNameLangs || {})[key] || {}
  const d = String(rec['default'] || '').trim()
  return d || catDisplayName(key)
}
const categoryLabel = (cat) => categoryDisplayName(setting.value, resolvedTranslation.value, cat)

// ---------- 颜色 ----------
const tagColorStyle = (cat, tag) => {
  const c = tagColorOf(setting.value, cat, tag)
  return c ? { color: c, borderColor: c } : {}
}
const tagChipFillStyle = (cat, tag) => {
  const c = tagColorOf(setting.value, cat, tag)
  if (!c) return {}
  const hex = (c.match(/^#([0-9a-f]{6})$/i) || [])[1]
  let dark = false
  if (hex) {
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16)
    dark = (0.299 * r + 0.587 * g + 0.114 * b) > 168
  }
  return { backgroundColor: c, borderColor: c, color: dark ? '#3a3a3f' : '#ffffff' }
}

// ---------- 标签名后的所属集合 ----------
const tagLabelWithSets = (tag) => {
  if (!tag) return ''
  const key = tag.cat + '::' + tag.tag
  const all = setting.value.tagRelations || {}
  const sets = []
  for (const [k, v] of Object.entries(all)) {
    if (k !== key && v && Array.isArray(v.contains) && v.contains.includes(key)) {
      const nm = k.split('::')[1]
      if (nm) sets.push(nm)
    }
  }
  const direct = all[key]
  if (direct && Array.isArray(direct.containedBy)) {
    for (const k of direct.containedBy) { const nm = k.split('::')[1]; if (nm) sets.push(nm) }
  }
  const uniq = [...new Set(sets)]
  return uniq.length ? tag.label + '(' + uniq.slice(0, 3).join(',') + ')' : tag.label
}

// ---------- 保存设置 ----------
const saveNow = () => ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))

// ---------- 长按收藏 / 取消收藏 ----------
const collectedTagMap = computed(() => {
  const map = {}
  for (const it of setting.value.collectTag || []) map[it.id] = it
  return map
})
const SOFT_COLORS = ['#FF6F61', '#F48FB1', '#42A5F5', '#66BB6A', '#FFCA28', '#AB47BC', '#26A69A', '#FFA726', '#8D6E63', '#78909C']
let longPressCollectTimer = null
const toggleCollectTag = (tag) => {
  if (!setting.value.collectTag) setting.value.collectTag = []
  const idx = setting.value.collectTag.findIndex(x => x.id === tag.id)
  if (idx >= 0) {
    setting.value.collectTag.splice(idx, 1)
  } else {
    const used = new Set((setting.value.collectTag || []).map(x => x && x.color))
    const color = tagColorOf(setting.value, tag.cat, tag.tag) ||
      setting.value.lastTagColor ||
      SOFT_COLORS.find(c => !used.has(c)) ||
      SOFT_COLORS[(setting.value.collectTag || []).length % SOFT_COLORS.length]
    setting.value.collectTag.push({ id: tag.id, letter: tag.letter, cat: tag.cat, tag: tag.tag, color })
  }
  saveNow()
}
const startLongPressCollect = (tag) => {
  cancelLongPressCollect()
  longPressCollectTimer = setTimeout(() => {
    longPressCollectTimer = null
    // 记住「刚才是长按收藏」,随后的 click 不要再触发搜索
    justCollectedAt = Date.now()
    toggleCollectTag(tag)
  }, 600)
}
// 单击标签:管理界面里 = 按这个标签搜索(长按收藏/双击改名时不要误触发)
let justCollectedAt = 0
const onTagChipClick = (cat, tag) => {
  if (!props.clickToSearch) return
  if (Date.now() - justCollectedAt < 400) return
  emit('search', tag.tag, cat)
}
const cancelLongPressCollect = () => {
  if (longPressCollectTimer) { clearTimeout(longPressCollectTimer); longPressCollectTimer = null }
}
const UNCOLLECT_LONG_PRESS_MS = 600
let longPressUncollectTimer = null
let longPressUncollectStart = { x: 0, y: 0 }
const uncollectTag = (element) => {
  if (!element || !element.id) return
  cancelLongPressUncollect()
  setting.value.collectTag = (setting.value.collectTag || []).filter(x => x.id !== element.id)
  saveNow()
}
const startLongPressUncollect = (element, e) => {
  cancelLongPressUncollect()
  longPressUncollectStart = { x: (e && e.clientX) || 0, y: (e && e.clientY) || 0 }
  longPressUncollectTimer = setTimeout(() => {
    longPressUncollectTimer = null
    uncollectTag(element)
  }, UNCOLLECT_LONG_PRESS_MS)
}
const onLongPressUncollectMove = (e) => {
  if (!longPressUncollectTimer) return
  const dx = Math.abs(((e && e.clientX) || 0) - longPressUncollectStart.x)
  const dy = Math.abs(((e && e.clientY) || 0) - longPressUncollectStart.y)
  if (dx > 8 || dy > 8) cancelLongPressUncollect()
}
const cancelLongPressUncollect = () => {
  if (longPressUncollectTimer) { clearTimeout(longPressUncollectTimer); longPressUncollectTimer = null }
}

const onShowCollectTagChange = (val) => {
  if (val) setting.value.randomTagsEnabled = false
  saveNow()
}
const onRandomTagsChange = (val) => {
  if (val) setting.value.showCollectTag = false
  saveNow()
}
const onTagLangChange = (val) => {
  setting.value.showTranslation = !!val
  if (val) loadTranslation()
  saveNow()
}

// ---------- 词库 ----------
const translationStatus = ref('')
const translationUpdatedAt = ref(0)
const translationUpdatedText = computed(() => {
  if (!translationUpdatedAt.value) return ''
  const d = new Date(translationUpdatedAt.value)
  const p2 = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
})
const backfillTagNames = async () => {
  const tr = resolvedTranslation.value || {}
  if (!tr || !Object.keys(tr).length) return 0
  if (!setting.value.tagNameLangs) setting.value.tagNameLangs = {}
  const map = setting.value.tagNameLangs
  let changed = 0
  const put = (cat, tag) => {
    if (!cat || !tag) return
    const ck = resolveCatKey(cat)
    const hit = (tr[ck] || {})[tag]
    if (!hit || !hit.name) return
    const key = ck + '::' + tag
    const cur = map[key] || {}
    if (cur['zh-CN']) return
    map[key] = { ...cur, 'zh-CN': hit.name }
    changed += 1
  }
  for (const x of (tagListRaw.value || [])) put(x.cat, x.tag)
  for (const [cat, arr] of Object.entries(setting.value.globalTags || {})) {
    for (const x of (Array.isArray(arr) ? arr : [])) put(cat, x)
  }
  if (changed) await saveNow()
  return changed
}
const loadTranslation = async (force = false) => {
  translationStatus.value = 'loading'
  try {
    const res = await ipcRenderer.invoke('load-tag-translation', { force: !!force })
    if (res && res.ok && res.data && Object.keys(res.data).length) {
      resolvedTranslation.value = res.data
      translationUpdatedAt.value = res.updatedAt || 0
      translationStatus.value = 'ok'
      ipcRenderer.invoke('update-tag-translation', res.data)
      const n = await backfillTagNames()
      if (n && force) printMessage('success', t('m.tagTranslationUpdated') + ' ' + translationUpdatedText.value)
      return
    }
    const cache = JSON.parse(localStorage.getItem('translationCache') || '{}')
    if (cache && Object.keys(cache).length) {
      resolvedTranslation.value = cache
      translationStatus.value = 'ok'
    } else {
      translationStatus.value = 'fail'
    }
  } catch (e) {
    translationStatus.value = 'fail'
  }
}

// ---------- 增加类别 ----------
const addCategoryVisible = ref(false)
const addCategoryName = ref('')
const openAddCategoryDialog = () => {
  addCategoryName.value = ''
  addCategoryVisible.value = true
}
const canAddCategory = computed(() => {
  const raw = String(addCategoryName.value || '').trim()
  if (!raw) return false
  const key = resolveCatKey(raw)
  return !(allTagGroups.value || []).some(g => resolveCatKey(g.cat) === key)
})
const createCategory = async () => {
  if (!canAddCategory.value) return
  const key = resolveCatKey(String(addCategoryName.value).trim())
  if (!Array.isArray(setting.value.tagCatOrder)) setting.value.tagCatOrder = []
  const order = setting.value.tagCatOrder.slice()
  if (!order.includes(key)) order.push(key)
  setting.value.tagCatOrder = order
  selectedTagCat.value = key
  await saveNow()
  addCategoryVisible.value = false
  printMessage('success', t('m.tagCatAdded'))
  emitRefresh()
}

// ---------- 标题分析(全局:扫全库标题,补角色/作品/作者标签) ----------
const titleAnalyzing = ref(false)
const analyzeTitles = async () => {
  if (titleAnalyzing.value) return
  try {
    await ElMessageBox.confirm(t('m.titleAnalyzeConfirm'), t('m.titleAnalyze'), { type: 'info' })
  } catch (e) { return }
  titleAnalyzing.value = true
  try {
    const res = await ipcRenderer.invoke('analyze-titles-by-tags', {})
    if (res && res.ok) {
      printMessage('success', t('m.titleAnalyzeDone', { changed: res.changed || 0, added: res.added || 0 }))
      emitRefresh()
    } else {
      printMessage('error', (res && res.error) || 'failed')
    }
  } catch (e) {
    printMessage('error', String((e && e.message) || e))
  } finally {
    titleAnalyzing.value = false
  }
}

defineExpose({ openEditor, openEditorNew, analyzeTitles, categoryLabel })
</script>

<style lang="stylus">
// 管理界面里这块要全部铺开(用户要求:角色那一栏不要滚动条,直接全部显示)
.tag-settings-section.is-expanded
  .all-tags-list
    max-height: none
    overflow: visible
  .tag-cat-header
    flex-wrap: wrap
    gap: 6px
  .tag-option-row
    flex-wrap: wrap
    gap: 8px
  .tag-collected-title
    margin-top: 10px
</style>
