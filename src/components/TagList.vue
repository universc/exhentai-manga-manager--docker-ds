<template>
  <el-dialog
    v-model="dialogVisible"
    :title="title"
    width="72%"
    destroy-on-close
  >
    <div class="tag-list-container">
      <!-- 先选类别(可多选,再点一次取消):选中后下面只列出这些类别的全部标签 -->
      <div class="tag-cat-filter" v-if="!onlyCat">
        <el-check-tag :checked="!selectedCats.length" class="tag-cat-chip" @change="clearCats">
          {{ $t('m.tagAllCats') }}
        </el-check-tag>
        <el-check-tag
          v-for="c in categories"
          :key="c.cat"
          class="tag-cat-chip"
          :checked="selectedCats.includes(c.cat)"
          @change="toggleCat(c.cat)"
        >{{ c.label }} ({{ c.count }})</el-check-tag>
      </div>
      <el-skeleton v-if="loading" :rows="10" animated />
      <template v-else>
        <div v-if="!visibleItems.length" class="tag-list-empty">{{ $t('m.sideDetailNoTags') }}</div>
        <div v-for="(group, letter) in groupedItems" :key="letter" class="letter-group">
          <div class="letter-header">{{ letter }}</div>
          <div class="tag-cloud">
            <el-tag
              v-for="(item, index) in group"
              :key="`tag-${letter}-${index}`"
              class="tag-item"
              :effect="'plain'"
              :style="tagColorStyle(item.cat, item.name)"
              @click="handleTagClick(item)"
              @dblclick="openTagNameEditor(item)"
            >
              {{ formatTagText(item) }} ({{ item.count }})
            </el-tag>
          </div>
        </div>
      </template>
    </div>
    <!-- 双击标签:编辑多语言名称(中/日/英),按「目标语言标签」显示 -->
    <el-dialog v-model="tagEditVisible" :title="$t('m.editTagNames')" width="380px" append-to-body>
      <div class="tag-name-editor">
        <p class="tag-edit-raw">{{ tagEditItem ? (tagEditItem.cat + ' : ' + tagEditItem.name) : '' }}</p>
        <el-input v-model="tagEditLangs['zh-CN']" size="small" :placeholder="$t('m.tagNameZh')" />
        <el-input v-model="tagEditLangs.ja" size="small" :placeholder="$t('m.tagNameJa')" />
        <el-input v-model="tagEditLangs.en" size="small" :placeholder="$t('m.tagNameEn')" />
      </div>
      <template #footer>
        <el-button size="small" @click="tagEditVisible = false">{{ $t('m.cancel') }}</el-button>
        <el-button size="small" type="primary" @click="saveTagNames">{{ $t('m.saveTagNames') }}</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup>
import { ref, nextTick, computed } from 'vue'

import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import { tagDisplayName, tagColorOf, tagCatRank, resolveCatKey, catDisplayName, tagDisplayPrefix, categoryDisplayName } from '../utils.js'
const appStore = useAppStore()
const { setting, resolvedTranslation, displayBookList, cat2letter } = storeToRefs(appStore)

const props = defineProps({
  title: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['search'])

const dialogVisible = ref(false)
const allItems = ref([])
const loading = ref(false)
// 选中的类别(可多选);空数组 = 全部类别
const selectedCats = ref([])
// 「作者」按钮打开时只看作者类别(不显示类别筛选条)
const onlyCat = ref('')

// 类别名:优先用「设置」里的类别名称,其次内置中文名
const categoryName = (cat) => categoryDisplayName(setting.value, resolvedTranslation.value, cat)

// 类别列表:只列当前库里真实存在标签的类别,顺序跟设置里拖动的一致
const categories = computed(() => {
  const map = {}
  for (const it of allItems.value) {
    if (!map[it.cat]) map[it.cat] = { cat: it.cat, label: categoryName(it.cat), count: 0 }
    map[it.cat].count++
  }
  return Object.values(map).sort((a, b) => tagCatRank(setting.value, a.cat) - tagCatRank(setting.value, b.cat))
})

const visibleItems = computed(() => {
  if (onlyCat.value) return allItems.value.filter(it => it.cat === onlyCat.value)
  if (!selectedCats.value.length) return allItems.value
  return allItems.value.filter(it => selectedCats.value.includes(it.cat))
})

const groupedItems = computed(() => {
  const grouped = {}
  for (const item of visibleItems.value) {
    const first = String(item.name).charAt(0).toUpperCase()
    const group = /[A-Z]/i.test(first) ? first : '#'
    if (!grouped[group]) grouped[group] = []
    grouped[group].push(item)
  }
  return Object.keys(grouped).sort().reduce((acc, key) => {
    acc[key] = grouped[key]
    return acc
  }, {})
})

const clearCats = () => { selectedCats.value = [] }
const toggleCat = (cat) => {
  const i = selectedCats.value.indexOf(cat)
  if (i >= 0) selectedCats.value.splice(i, 1)
  else selectedCats.value.push(cat)
}

// 搜索前缀仍然要用 EH 的命名空间字母(f:/a:/l:),只用于拼搜索语法,不用于显示
const tagLetter = (cat) => cat2letter.value[cat] || resolveCatKey(cat) || cat
// 标签颜色 = 字体颜色
const tagColorStyle = (cat, name) => {
  const c = tagColorOf(setting.value, cat, name)
  return c ? { color: c, borderColor: c } : {}
}

// 标签显示名:①「标签名称」里填的(按语言) ② 词库 ③ 原始名
const formatTagText = (item) => {
  const displayName = tagDisplayName(setting.value, resolvedTranslation.value, item.cat, item.name)
  // 前缀:被集合包含就用集合标签名(原神:甘雨),否则类别名(角色:甘雨)
  return `${tagDisplayPrefix(setting.value, resolvedTranslation.value, item.cat, item.name)}: ${displayName}`
}

// 双击标签 → 编辑多语言名称(中/日/英)
const tagEditVisible = ref(false)
const tagEditItem = ref(null)
const tagEditLangs = ref({ 'zh-CN': '', ja: '', en: '' })
const openTagNameEditor = (item) => {
  if (!item || !item.cat || !item.name) return
  const rec = (setting.value.tagNameLangs || {})[item.cat + '::' + item.name] || {}
  tagEditLangs.value = { 'zh-CN': rec['zh-CN'] || '', ja: rec.ja || '', en: rec.en || '' }
  tagEditItem.value = item
  tagEditVisible.value = true
}
const saveTagNames = async () => {
  const it = tagEditItem.value
  if (!it) return
  if (!setting.value.tagNameLangs) setting.value.tagNameLangs = {}
  const key = it.cat + '::' + it.name
  const lang = {
    'zh-CN': (tagEditLangs.value['zh-CN'] || '').trim(),
    ja: (tagEditLangs.value.ja || '').trim(),
    en: (tagEditLangs.value.en || '').trim(),
  }
  if (!lang['zh-CN'] && !lang.ja && !lang.en) delete setting.value.tagNameLangs[key]
  else setting.value.tagNameLangs[key] = { ...(setting.value.tagNameLangs[key] || {}), ...lang }
  if (window.ipcRenderer) {
    await window.ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
  }
  tagEditVisible.value = false
}

const getBookInfos = () => {
  const filteredBooks = displayBookList.value.filter(book => !book.folderHide && !book.hiddenBook && !book.isCollection)

  const bookInfos = filteredBooks.map(book => ({
    tags: (book && book.tags) || {},
    mtime: book.mtime ? `${new Date(book.mtime).getFullYear()}-${(new Date(book.mtime).getMonth() + 1).toString().padStart(2, '0')}` : '',
  }))

  return bookInfos
}

// 把库里所有书的标签按「类别 + 名称」去重计数
const collectAllTags = () => {
  const counter = new Map()
  for (const book of getBookInfos()) {
    for (const [rawCat, arr] of Object.entries(book.tags)) {
      if (!Array.isArray(arr)) continue
      // 归一化类别:库里同一个类别可能既有英文键又有中文键(female / 女性),不合并会列出两条
      const cat = resolveCatKey(rawCat)
      for (const name of arr) {
        const key = cat + '\u0000' + name
        let one = counter.get(key)
        if (!one) { one = { cat, name, count: 0 }; counter.set(key, one) }
        one.count++
      }
    }
  }
  return [...counter.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

// 打开列表:tagType 传 'artist' 时先只选作者类别;'mixed' 时先显示全部类别
const processTagsAsync = async (presetCats, only = '') => {
  loading.value = true
  allItems.value = []
  selectedCats.value = []
  onlyCat.value = only
  dialogVisible.value = true
  await nextTick()

  setTimeout(() => {
    allItems.value = collectAllTags()
    selectedCats.value = presetCats || []
    loading.value = false
  }, 60)
}

const showArtistTags = () => {
  // 作者按钮 = 只看作者(以前会把全部类别都列出来)
  processTagsAsync(['artist'], 'artist')
}

const showMixedTags = () => {
  processTagsAsync([])
}

// 点标签 = 按标签搜索(用原始名,翻译后的名字只用于显示)
const handleTagClick = (item) => {
  if (!item) return
  // 不带字母前缀,直接按标签名搜
  emit('search', `"${item.name}$"`)
  dialogVisible.value = false
}

defineExpose({
  dialogVisible,
  showArtistTags,
  showMixedTags,
  getBookInfos
})
</script>

<style lang="stylus">
.tag-list-container
  max-height: 60vh
  overflow-y: auto
  padding: 10px

// 类别筛选条:先类别、后标签
.tag-cat-filter
  display: flex
  flex-wrap: wrap
  gap: 8px
  padding: 2px 4px 12px
  margin-bottom: 6px
  border-bottom: 1px solid var(--el-border-color-lighter)
  position: sticky
  top: 0
  z-index: 3
  background: var(--el-bg-color-overlay)

.tag-cat-chip
  cursor: pointer
  font-size: 13px

.tag-list-empty
  padding: 20px 6px
  color: var(--el-text-color-secondary)
  font-size: 13px

.tag-cloud
  display: flex
  flex-wrap: wrap
  gap: 10px

.tag-item
  margin: 2px 3px
  cursor: pointer
  font-size: 12px

.letter-group
  margin-bottom: 20px

.letter-header
  font-size: 18px
  font-weight: bold
  margin-bottom: 10px
  padding-left: 5px
  padding-bottom: 5px
  text-align: left
</style>
