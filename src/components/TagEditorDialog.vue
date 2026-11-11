<template>
  <!-- 「编辑标签 / 添加标签」弹窗:全软件共用一套。
       以前这个弹窗写死在 Setting.vue 里,别处想「增加标签」只能跳到设置页;
       现在抽出来,App 里挂一个全局实例,任何组件 emit open-add-tag 就能弹它。 -->
  <el-dialog v-model="visible" :title="dialogTitle" width="380px" append-to-body>
    <div class="tag-name-editor">
      <p class="tag-edit-raw" v-if="!isNew">{{ rawLabel }}</p>
      <div class="tag-cat-editor" v-if="!isCategory">
        <span class="tag-color-label">{{ $t('m.category') }}</span>
        <el-select v-model="cat" size="small" style="width: 150px;">
          <el-option v-for="g in allTagGroups" :key="g.cat" :label="categoryLabel(g.cat)" :value="g.cat" />
        </el-select>
      </div>
      <div class="tag-name-hint">{{ $t('m.tagMultiNameHint') }}</div>
      <el-input v-model="langs['default']" size="small" :placeholder="$t('m.tagNameDefault')" />
      <el-input v-model="langs['zh-CN']" size="small" :placeholder="$t('m.tagNameZh')" />
      <el-input v-model="langs['zh-TW']" size="small" :placeholder="$t('m.tagNameZhTw')" />
      <el-input v-model="langs.ja" size="small" :placeholder="$t('m.tagNameJa')" />
      <el-input v-model="langs.en" size="small" :placeholder="$t('m.tagNameEn')" />
    </div>
    <div class="tag-color-editor" v-if="!isCategory">
      <span class="tag-color-label">{{ $t('m.tagColor') }}</span>
      <el-color-picker v-model="color" show-alpha :predefine="SOFT_COLORS" />
      <el-button v-if="color" size="small" text @click="color = ''">{{ $t('m.reset') }}</el-button>
    </div>
    <div class="tag-relation-editor" v-if="!isCategory && !isNew">
      <div class="tag-relation-title">{{ $t('m.tagRelations') }}</div>
      <div class="tag-relation-add">
        <el-select v-model="relationCat" size="small" :placeholder="$t('m.pickCategory')" style="width: 104px;">
          <el-option v-for="c in relationCats" :key="c.value" :label="c.label" :value="c.value" />
        </el-select>
        <el-select
          v-model="relationPick"
          size="small"
          clearable
          style="width: 156px;"
          popper-class="tag-relation-dropdown"
          :placeholder="$t('m.pickTag')"
        >
          <el-option v-for="o in relationOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
        <el-select v-model="relationKind" size="small" style="width: 104px;">
          <el-option :label="$t('m.relationContains')" value="contains"></el-option>
          <el-option :label="$t('m.relationContainedBy')" value="containedBy"></el-option>
        </el-select>
        <el-button size="small" type="primary" plain :disabled="!relationPick" @click="addRelation">{{ $t('m.addRelation') }}</el-button>
      </div>
      <div class="tag-relation-list">
        <el-tag v-for="r in relationList" :key="r.kind + r.key" size="small" closable class="tag-relation-item" @close="removeRelation(r)">
          {{ r.kind === 'contains' ? $t('m.relationContains') : $t('m.relationContainedBy') }} · {{ r.label }}
        </el-tag>
        <span v-if="!relationList.length" class="tag-relation-empty">—</span>
      </div>
    </div>
    <template #footer>
      <el-button
        v-if="!isNew"
        size="small"
        type="danger"
        plain
        class="tag-edit-delete"
        @click="isCategory ? deleteCategory() : deleteTag()"
      >{{ isCategory ? $t('m.deleteCategory') : $t('m.deleteTag') }}</el-button>
      <el-button size="small" @click="visible = false">{{ $t('m.cancel') }}</el-button>
      <el-button size="small" type="primary" :disabled="!canSave" @click="save">{{ $t('m.saveTagNames') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import {
  resolveCatKey, catDisplayName, getDisplayTagName, categoryDisplayName, tagColorOf,
  tagNameVariants, FALLBACK_CAT, isBuiltinCat, tagCatRank
} from '../utils.js'

const appStore = useAppStore()
const { setting, resolvedTranslation, tagListRaw, cat2letter } = storeToRefs(appStore)
const { printMessage } = appStore
const { t } = useI18n()

const emit = defineEmits(['refresh'])

const SOFT_COLORS = [
  '#FF6F61', '#F48FB1', '#42A5F5', '#66BB6A', '#FFCA28',
  '#AB47BC', '#26A69A', '#FFA726', '#8D6E63', '#78909C'
]

const visible = ref(false)
const item = ref(null)
const isCategory = ref(false)
const isNew = ref(false)
const langs = ref({ 'default': '', 'zh-CN': '', 'zh-TW': '', ja: '', en: '' })
const color = ref('')
const cat = ref('')
const origCat = ref('')
const relationPick = ref('')
const relationKind = ref('contains')
const relationCat = ref('')

// 全库标签分组(类别 → 标签):类别下拉 / 关联标签选项都靠它
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
    map[normCat].tags.push({ id: tag.id, cat: normCat, tag: tag.tag, letter: tag.letter })
  }
  const globalTags = setting.value.globalTags || {}
  for (const [rawCat, arr] of Object.entries(globalTags)) {
    const normCat = resolveCatKey(rawCat)
    if (!map[normCat]) {
      map[normCat] = { cat: normCat, tags: [] }
      groups.push(map[normCat])
    }
    const have = new Set(map[normCat].tags.map(x => x.tag))
    for (const tag of (Array.isArray(arr) ? arr : [])) {
      if (!tag || have.has(tag)) continue
      have.add(tag)
      map[normCat].tags.push({ id: normCat + ':' + tag, cat: normCat, tag, letter: cat2letter.value[normCat] || normCat })
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

const categoryLabel = (c) => categoryDisplayName(setting.value, resolvedTranslation.value, c)
const dialogTitle = computed(() => {
  if (isNew.value) return t('m.addNewTag')
  return isCategory.value ? t('m.tagCatEditNames') : t('m.editTag')
})
const rawLabel = computed(() => {
  const it = item.value
  if (!it) return ''
  if (isCategory.value) return categoryLabel(it.cat) + ' (' + it.cat + ')'
  return categoryLabel(it.cat) + ' · ' + it.tag
})
const canSave = computed(() => {
  if (isCategory.value) return true
  const name = String(langs.value['default'] || '').trim()
  if (!name) return false
  if (!isNew.value) return true
  // 新建:同类别同名不允许
  const c = resolveCatKey(cat.value)
  const exists = (allTagGroups.value.find(g => resolveCatKey(g.cat) === c)?.tags || [])
    .some(x => String(x.tag).toLowerCase() === name.toLowerCase())
  return !exists
})

const open = (tag) => {
  if (!tag || !tag.cat) return
  isNew.value = false
  const isCat = !tag.tag
  isCategory.value = isCat
  const catKey = resolveCatKey(tag.cat)
  const rec = isCat
    ? ((setting.value.tagCatNameLangs || {})[catKey] || {})
    : ((setting.value.tagNameLangs || {})[catKey + '::' + tag.tag] || {})
  langs.value = {
    'default': rec['default'] || (isCat ? catDisplayName(catKey) : String(tag.tag || '')),
    'zh-CN': rec['zh-CN'] || (!isCat ? ((resolvedTranslation.value[catKey] || {})[tag.tag] || {}).name : '') || '',
    'zh-TW': rec['zh-TW'] || '', ja: rec.ja || '', en: rec.en || ''
  }
  item.value = isCat ? { cat: catKey, isCategory: true } : { cat: catKey, tag: tag.tag }
  cat.value = catKey
  origCat.value = catKey
  relationPick.value = ''
  if (!isCat) {
    const key = catKey + '::' + tag.tag
    const old = ((setting.value.collectTag || []).find(x => x && (x.id === (catKey + ':' + tag.tag) || x.id === (tag.cat + ':' + tag.tag))) || {}).color
    color.value = ((setting.value.tagColors || {})[key]) || old || ''
  } else {
    color.value = ''
  }
  visible.value = true
}

// 新建标签:只填名称+类别(颜色可选),保存时登记到 globalTags
const openNew = (catKey) => {
  isNew.value = true
  isCategory.value = false
  item.value = null
  langs.value = { 'default': '', 'zh-CN': '', 'zh-TW': '', ja: '', en: '' }
  color.value = ''
  const c = resolveCatKey(catKey || setting.value.tagLastCat || (allTagGroups.value[0]?.cat || FALLBACK_CAT))
  cat.value = c
  origCat.value = c
  relationPick.value = ''
  visible.value = true
}

// ---------- 关联标签(包含 / 被包含) ----------
const keyLabel = (k) => { const p = String(k).split('::'); return p.length === 2 ? categoryLabel(p[0]) + ':' + p[1] : k }
const relationCats = computed(() => (allTagGroups.value || []).map(g => ({ value: g.cat, label: categoryLabel(g.cat) })))
const relationOptions = computed(() => {
  const it = item.value
  const selfKey = it ? it.cat + '::' + it.tag : ''
  const out = []
  for (const g of (allTagGroups.value || [])) {
    if (relationCat.value && g.cat !== relationCat.value) continue
    for (const x of (g.tags || [])) {
      const k = x.cat + '::' + x.tag
      if (k === selfKey) continue
      const label = getDisplayTagName(setting.value, resolveCatKey(x.cat), x.tag) || x.tag
      out.push({ value: k, label })
    }
  }
  return out
})
const containedByLocal = (key) => {
  const all = setting.value.tagRelations || {}
  const direct = all[key]
  if (direct && Array.isArray(direct.containedBy) && direct.containedBy.length) return direct.containedBy
  const out = []
  for (const [k, v] of Object.entries(all)) {
    if (k !== key && v && Array.isArray(v.contains) && v.contains.includes(key)) out.push(k)
  }
  return out
}
const relationList = computed(() => {
  const it = item.value
  if (!it) return []
  const key = it.cat + '::' + it.tag
  const rel = (setting.value.tagRelations || {})[key] || {}
  const list = []
  for (const k of (rel.contains || [])) list.push({ kind: 'contains', key: k, label: keyLabel(k) })
  for (const k of containedByLocal(key)) list.push({ kind: 'containedBy', key: k, label: keyLabel(k) })
  return list
})
const saveRelations = async () => {
  if (!setting.value.tagRelations) setting.value.tagRelations = {}
  await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
  emit('refresh')
}
const addRelation = async () => {
  const it = item.value
  const pick = relationPick.value
  if (!it || !pick) return
  const selfKey = it.cat + '::' + it.tag
  if (!setting.value.tagRelations) setting.value.tagRelations = {}
  if (relationKind.value === 'contains') {
    const rel = setting.value.tagRelations[selfKey] || {}
    const arr = Array.isArray(rel.contains) ? rel.contains.slice() : []
    if (!arr.includes(pick)) arr.push(pick)
    setting.value.tagRelations[selfKey] = { ...rel, contains: arr }
  } else {
    const other = setting.value.tagRelations[pick] || {}
    const arr = Array.isArray(other.contains) ? other.contains.slice() : []
    if (!arr.includes(selfKey)) arr.push(selfKey)
    setting.value.tagRelations[pick] = { ...other, contains: arr }
  }
  relationPick.value = ''
  await saveRelations()
}
const removeRelation = async (r) => {
  const it = item.value
  if (!it || !r) return
  const selfKey = it.cat + '::' + it.tag
  if (!setting.value.tagRelations) return
  if (r.kind === 'contains') {
    const rel = setting.value.tagRelations[selfKey] || {}
    const arr = (rel.contains || []).filter(k => k !== r.key)
    if (arr.length) setting.value.tagRelations[selfKey] = { ...rel, contains: arr }
    else delete setting.value.tagRelations[selfKey]
  } else {
    const other = setting.value.tagRelations[r.key] || {}
    const arr = (other.contains || []).filter(k => k !== selfKey)
    if (arr.length) setting.value.tagRelations[r.key] = { ...other, contains: arr }
    else delete setting.value.tagRelations[r.key]
  }
  await saveRelations()
}

// ---------- 保存 ----------
const applyColor = (key, catKey, name) => {
  if (!setting.value.tagColors) setting.value.tagColors = {}
  if (color.value) {
    setting.value.tagColors[key] = color.value
    setting.value.lastTagColor = color.value
  } else {
    delete setting.value.tagColors[key]
  }
  void catKey; void name
}

const createNewTag = async () => {
  const catKey = resolveCatKey(cat.value)
  const name = String(langs.value['default'] || '').trim()
  if (!catKey || !name) return
  const res = await ipcRenderer.invoke('add-global-tag', { cat: catKey, name })
  if (!res?.ok) {
    printMessage('error', res?.error || t('c.groupTagError'))
    return
  }
  if (!setting.value.globalTags || typeof setting.value.globalTags !== 'object') setting.value.globalTags = {}
  const arr = Array.isArray(setting.value.globalTags[catKey]) ? setting.value.globalTags[catKey].slice() : []
  if (!arr.includes(name)) arr.push(name)
  setting.value.globalTags = { ...setting.value.globalTags, [catKey]: arr }
  if (!Array.isArray(setting.value.tagCatOrder)) setting.value.tagCatOrder = []
  if (!setting.value.tagCatOrder.includes(catKey)) setting.value.tagCatOrder.push(catKey)
  // 名称 / 颜色:直接写成这条新标签的配置
  const key = catKey + '::' + name
  const lang = {}
  for (const k of ['default', 'zh-CN', 'zh-TW', 'ja', 'en']) {
    const v = String(langs.value[k] || '').trim()
    if (v) lang[k] = v
  }
  if (!setting.value.tagNameLangs) setting.value.tagNameLangs = {}
  setting.value.tagNameLangs[key] = { ...(setting.value.tagNameLangs[key] || {}), ...lang }
  applyColor(key, catKey, name)
  setting.value.tagLastCat = catKey
  await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
  try { await appStore.loadAllTags() } catch (e) { /* 忽略 */ }
  visible.value = false
  printMessage('success', t('m.tagAdded') || t('m.tagCatAdded'))
  // 新建标签不影响任何书,不需要重载
}

const save = async () => {
  if (isNew.value) return createNewTag()
  const it = item.value
  if (!it) return
  const lang = {
    'default': (langs.value['default'] || '').trim(),
    'zh-CN': (langs.value['zh-CN'] || '').trim(),
    'zh-TW': (langs.value['zh-TW'] || '').trim(),
    ja: (langs.value.ja || '').trim(),
    en: (langs.value.en || '').trim()
  }
  const empty = !lang['default'] && !lang['zh-CN'] && !lang['zh-TW'] && !lang.ja && !lang.en

  if (isCategory.value) {
    if (!setting.value.tagCatNameLangs) setting.value.tagCatNameLangs = {}
    const ck = resolveCatKey(it.cat)
    if (empty) delete setting.value.tagCatNameLangs[ck]
    else setting.value.tagCatNameLangs[ck] = { ...(setting.value.tagCatNameLangs[ck] || {}), ...lang }
    await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
    visible.value = false
    printMessage('success', t('m.saveTagNamesDone'))
    return
  }

  const oldCat = resolveCatKey(origCat.value || it.cat)
  const newCat = resolveCatKey(cat.value || oldCat)
  let movedToCat = newCat
  const myNames = new Set()
  for (const v of Object.values(lang)) {
    for (const n of String(v || '').split('/')) {
      const x = n.trim().toLowerCase()
      if (x) myNames.add(x)
    }
  }
  let conflict = null
  for (const g of (allTagGroups.value || [])) {
    for (const x of (g.tags || [])) {
      if (x.tag === it.tag && resolveCatKey(x.cat) === oldCat) continue
      const variants = tagNameVariants(setting.value, resolvedTranslation.value, x.cat, x.tag).map(v => String(v).toLowerCase())
      if (variants.some(v => myNames.has(v))) { conflict = { cat: resolveCatKey(x.cat), tag: x.tag }; break }
    }
    if (conflict) break
  }

  try {
    if (conflict && conflict.cat === newCat) {
      await ElMessageBox.confirm(
        t('m.tagMergeConfirm', { name: getDisplayTagName(setting.value, conflict.cat, conflict.tag) || conflict.tag }),
        t('m.tagMergeTitle'),
        { type: 'warning' }
      )
      await ipcRenderer.invoke('rename-tag', { cat: newCat, oldName: it.tag, newName: conflict.tag })
      if (setting.value.tagNameLangs) delete setting.value.tagNameLangs[oldCat + '::' + it.tag]
      if (setting.value.tagColors) delete setting.value.tagColors[oldCat + '::' + it.tag]
      await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
      visible.value = false
      printMessage('success', t('m.saveTagNamesDone'))
      emit('refresh')
      return
    }
    if (conflict && conflict.cat !== newCat) {
      await ElMessageBox.confirm(
        t('m.tagMoveToCatConfirm', { cat: categoryLabel(conflict.cat), name: getDisplayTagName(setting.value, conflict.cat, conflict.tag) || conflict.tag }),
        t('m.tagMergeTitle'),
        { type: 'warning' }
      )
      movedToCat = conflict.cat
      await ipcRenderer.invoke('move-tag', { fromCat: oldCat, name: it.tag, toCat: movedToCat, newName: conflict.tag })
      if (!setting.value.tagNameCategoryMap) setting.value.tagNameCategoryMap = {}
      for (const n of myNames) setting.value.tagNameCategoryMap[n] = movedToCat
      if (setting.value.tagNameLangs) delete setting.value.tagNameLangs[oldCat + '::' + it.tag]
      if (setting.value.tagColors) delete setting.value.tagColors[oldCat + '::' + it.tag]
      if (setting.value.tagRelations) delete setting.value.tagRelations[oldCat + '::' + it.tag]
      await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
      visible.value = false
      printMessage('success', t('m.saveTagNamesDone'))
      emit('refresh')
      return
    }
    if (movedToCat !== oldCat) {
      await ipcRenderer.invoke('move-tag', { fromCat: oldCat, name: it.tag, toCat: movedToCat })
      if (setting.value.tagNameLangs) delete setting.value.tagNameLangs[oldCat + '::' + it.tag]
      if (setting.value.tagColors) delete setting.value.tagColors[oldCat + '::' + it.tag]
      if (setting.value.tagRelations) {
        const oldKey = oldCat + '::' + it.tag
        const newKey = movedToCat + '::' + it.tag
        const rel = setting.value.tagRelations[oldKey]
        if (rel) { delete setting.value.tagRelations[oldKey]; setting.value.tagRelations[newKey] = rel }
        for (const [k, v] of Object.entries(setting.value.tagRelations)) {
          if (v && Array.isArray(v.contains)) {
            setting.value.tagRelations[k] = { ...v, contains: v.contains.map(x => (x === oldKey ? newKey : x)) }
          }
        }
      }
      item.value = { ...it, cat: movedToCat }
      origCat.value = movedToCat
    }
  } catch (e) {
    return
  }

  if (!setting.value.tagNameLangs) setting.value.tagNameLangs = {}
  const key = movedToCat + '::' + it.tag
  if (empty) delete setting.value.tagNameLangs[key]
  else setting.value.tagNameLangs[key] = { ...(setting.value.tagNameLangs[key] || {}), ...lang }
  applyColor(key, movedToCat, it.tag)
  if (!setting.value.tagNameCategoryMap) setting.value.tagNameCategoryMap = {}
  for (const n of myNames) setting.value.tagNameCategoryMap[n] = movedToCat

  await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
  visible.value = false
  printMessage('success', t('m.saveTagNamesDone'))
  // ★ 改名称/配色不需要重载书库:显示名是渲染时从 setting 里查的,
  //   以前这里 emit refresh → App 整库重读,界面白闪一次(用户明确要求去掉)。
}

// ---------- 删除 ----------
const deleteTag = async () => {
  const it = item.value
  if (!it || isCategory.value) return
  try {
    await ElMessageBox.confirm(
      t('m.deleteTagConfirm', { cat: categoryLabel(it.cat), tag: it.tag }),
      t('m.deleteTag'),
      { type: 'warning', confirmButtonText: t('m.delete'), cancelButtonText: t('m.cancel') }
    )
  } catch (e) { return }
  const res = await ipcRenderer.invoke('delete-tag', { cat: it.cat, name: it.tag })
  if (!res?.ok) {
    printMessage('error', res?.error || t('c.renameTagFailed'))
    return
  }
  if (setting.value.tagNameLangs) delete setting.value.tagNameLangs[it.cat + '::' + it.tag]
  const rel = setting.value.tagRelations
  if (rel) {
    const selfKey = it.cat + '::' + it.tag
    delete rel[selfKey]
    for (const [k, v] of Object.entries(rel)) {
      if (v && Array.isArray(v.contains)) {
        const kept = v.contains.filter(x => x !== selfKey)
        if (kept.length) rel[k] = { ...v, contains: kept }
        else delete rel[k]
      }
    }
  }
  if (Array.isArray(setting.value.collectTag)) {
    setting.value.collectTag = setting.value.collectTag.filter(x => x.id !== it.cat + ':' + it.tag)
  }
  try { await ipcRenderer.invoke('remove-global-tag', { cat: it.cat, name: it.tag }) } catch (e) { /* 忽略 */ }
  if (setting.value.globalTags && Array.isArray(setting.value.globalTags[it.cat])) {
    const kept = setting.value.globalTags[it.cat].filter(v => String(v) !== String(it.tag))
    if (kept.length) setting.value.globalTags = { ...setting.value.globalTags, [it.cat]: kept }
    else { const gt = { ...setting.value.globalTags }; delete gt[it.cat]; setting.value.globalTags = gt }
  }
  await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
  visible.value = false
  printMessage('success', t('c.renameTagDone', { count: res.count }))
  emit('refresh')
}

const deleteCategory = async () => {
  const it = item.value
  if (!it || !isCategory.value) return
  const key = resolveCatKey(it.cat)
  if (isBuiltinCat(key)) {
    printMessage('warning', t('m.cannotDeleteOtherCategory'))
    return
  }
  const count = (allTagGroups.value.find(g => g.cat === key)?.tags || []).length
  try {
    await ElMessageBox.confirm(
      count
        ? t('m.deleteCategoryConfirmWithTags', { cat: categoryLabel(key), n: count })
        : t('m.deleteCategoryConfirm', { cat: categoryLabel(key) }),
      t('m.deleteCategory'),
      { type: 'warning', confirmButtonText: t('m.delete'), cancelButtonText: t('m.cancel') }
    )
  } catch (e) { return }
  if (count) {
    const mv = await ipcRenderer.invoke('move-tag-category', { from: key, to: FALLBACK_CAT })
    if (!mv?.ok) {
      printMessage('error', mv?.error || t('c.groupTagError'))
      return
    }
  }
  const rel0 = setting.value.tagRelations
  if (rel0) {
    for (const [k, v] of Object.entries(rel0)) {
      const [kCat, kTag] = String(k).split('::')
      if (resolveCatKey(kCat) === key) {
        delete rel0[k]
        const nk = FALLBACK_CAT + '::' + kTag
        rel0[nk] = { ...(rel0[nk] || {}), ...v }
      }
      if (v && Array.isArray(v.contains)) {
        rel0[k] = {
          ...v,
          contains: v.contains.map(x => {
            const [c, tg] = String(x).split('::')
            return resolveCatKey(c) === key ? FALLBACK_CAT + '::' + tg : x
          })
        }
      }
    }
  }
  if (!Array.isArray(setting.value.tagCatOrder)) setting.value.tagCatOrder = []
  if (!setting.value.tagCatOrder.includes(FALLBACK_CAT)) setting.value.tagCatOrder.push(FALLBACK_CAT)
  setting.value.tagCatOrder = setting.value.tagCatOrder.filter(c => resolveCatKey(c) !== key)
  if (setting.value.tagCatNameLangs) delete setting.value.tagCatNameLangs[key]
  if (setting.value.globalTags && typeof setting.value.globalTags === 'object') {
    const gs = { ...setting.value.globalTags }
    let touched = false
    for (const k of Object.keys(gs)) {
      if (resolveCatKey(k) === key) { delete gs[k]; touched = true }
    }
    if (touched) setting.value.globalTags = gs
  }
  if (setting.value.tagColors && typeof setting.value.tagColors === 'object') {
    const next = { ...setting.value.tagColors }
    let touched = false
    for (const k of Object.keys(next)) {
      if (resolveCatKey(String(k).split('::')[0]) === key) { delete next[k]; touched = true }
    }
    if (touched) setting.value.tagColors = next
  }
  const rel = setting.value.tagRelations
  if (rel) {
    for (const [k, v] of Object.entries(rel)) {
      const kCat = resolveCatKey(String(k).split('::')[0])
      if (kCat === key) { delete rel[k]; continue }
      if (v && Array.isArray(v.contains)) {
        const kept = v.contains.filter(x => resolveCatKey(String(x).split('::')[0]) !== key)
        if (kept.length) rel[k] = { ...v, contains: kept }
        else delete rel[k]
      }
    }
  }
  await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
  visible.value = false
  printMessage('success', t('m.deleteCategoryDone'))
  emit('refresh')
}

defineExpose({ open, openNew, openTagNameEditor: open })
</script>
