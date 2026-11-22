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
        <div class="ehf-label ehf-label-with-hint">
          <span class="ehf-label-text">{{ $t('m.keyword') }}</span>
          <SettingHint :text="$t('m.filterKeywordTip')" />
        </div>
        <!-- ★ 关键词:点进输入状态自动弹出「标签选择栏」(用户要求 2)
             复用详情界面「编辑信息」里的那套 el-select 弹层样式
             (filterable + popper-class="tag-select-dropdown"),
             选项 = 全库已有标签,按类别分组;选中后把标签名追加进关键词。
             聚焦即展开,不需要额外按钮。 -->
        <el-select
          ref="keywordSelectRef"
          v-model="keywordPicked"
          class="ehf-keyword-select"
          filterable
          clearable
          default-first-option
          :reserve-keyword="false"
          popper-class="tag-select-dropdown"
          :placeholder="$t('m.filterKeywordPlaceholder')"
          @change="onKeywordPick"
          @visible-change="onKeywordDropVisible"
        >
          <el-option-group
            v-for="g in keywordTagGroups"
            :key="'kwg-' + g.cat"
            :label="g.label"
          >
            <el-option
              v-for="it in g.tags"
              :key="'kw-' + g.cat + '-' + it"
              :label="it"
              :value="g.cat + '##' + it"
            />
          </el-option-group>
        </el-select>
        <!-- 已选关键词(可单条移除) -->
        <div v-if="keywordTerms.length" class="ehf-keyword-chips">
          <el-tag
            v-for="(t, i) in keywordTerms" :key="'kwt-' + i"
            size="small" closable @close="removeKeywordTerm(i)"
          >{{ t }}</el-tag>
        </div>
      </div>

      <div class="ehf-field">
        <div class="ehf-label ehf-label-with-hint">
          <span class="ehf-label-text">{{ $t('m.language') }}</span>
          <SettingHint :text="$t('m.filterLanguageTip')" />
        </div>
        <el-select v-model="model.language" class="ehf-select" clearable :placeholder="$t('m.unlimited')">
          <!-- 显示名跟随界面语言(值仍是 EH 用的英文标识,不能改) -->
          <el-option v-for="l in languages" :key="l" :label="langLabel(l)" :value="l"></el-option>
        </el-select>
      </div>

      <div class="ehf-field">
        <div class="ehf-label ehf-label-with-hint">
          <span class="ehf-label-text">{{ $t('m.pagesBetween') }}</span>
          <SettingHint :text="$t('m.filterPagesTip')" />
        </div>
        <div class="ehf-pages">
          <!-- value-on-clear 显式给 null:清空后回到「不限」,不会被 :min="0" 兜成 0 -->
          <el-input-number v-model="model.pageAtLeast" :min="0" :controls="false" :value-on-clear="null" :placeholder="$t('m.unlimited')" />
          <span class="ehf-to">{{ $t('m.to') }}</span>
          <el-input-number v-model="model.pageAtMost" :min="0" :controls="false" :value-on-clear="null" :placeholder="$t('m.unlimited')" />
        </div>
      </div>

      <div class="ehf-field">
        <div class="ehf-label ehf-label-with-hint">
          <span class="ehf-label-text">{{ $t('m.minimumRating') }}</span>
          <SettingHint :text="$t('m.filterRatingTip')" />
        </div>
        <!-- 星星评分(与主界面一致):半星可选;0 颗 = 不限 -->
        <div class="ehf-rating-stars">
          <el-rate v-model="ratingStars" allow-half :max="5" :clearable="true" />
          <span class="ehf-rating-text">{{ ratingStars > 0 ? (ratingStars + ' ★ 及以上') : $t('m.unlimited') }}</span>
        </div>
      </div>

      <!-- 黑名单标签:命中就整本隐藏(本地库与 EH在线 都生效;EH在线 还会作为 -tag 交给 EH 排) -->
      <div class="ehf-field">
        <!-- 「启用黑名单」勾选框紧跟在「黑名单标签」文字正右边(同一行内联)。
             不显示文字(用户要求只留方框),用 title / aria-label 保住无障碍标签 -->
        <div class="ehf-label ehf-label-with-hint ehf-label-with-check">
          <span class="ehf-label-text">{{ $t('m.filterBlacklist') }}</span>
          <SettingHint :text="$t('m.filterBlacklistTip')" />
          <el-checkbox
            v-model="model.blacklistEnabled"
            class="ehf-blacklist-enabled"
            :title="$t('m.filterBlacklistEnabled')"
            :aria-label="$t('m.filterBlacklistEnabled')"
          ></el-checkbox>
        </div>
        <!-- 标签框:和「详细界面」里的标签同款(小号 plain 可关闭) -->
        <div class="ehf-tagbox" @click="focusBlacklistInput">
          <el-tag
            v-for="t in blacklistTerms"
            :key="t"
            size="small"
            effect="plain"
            closable
            class="ehf-tagbox-tag"
            @close="removeBlacklistTerm(t)"
          >{{ t }}</el-tag>
          <el-input
            ref="blacklistInputRef"
            v-model="newBlacklistTerm"
            class="ehf-tagbox-input"
            size="small"
            :placeholder="blacklistTerms.length ? '' : $t('m.filterBlacklistPlaceholder')"
            @keyup.enter="commitBlacklistTerm"
            @keyup="onBlacklistKeyup"
            @blur="commitBlacklistTerm"
          />
        </div>
      </div>

      <!-- 这两个只对 EH在线 有意义(会作为 f_sh / f_sto 发给 EH),本地库列表不受影响 ——
           所以本地库模式下整块不渲染(用户要求:本地筛选界面不要出现这两个按钮) -->
      <template v-if="online">
        <div class="ehf-switch">
          <span>{{ $t('m.onlySearchExpungedGalleries') }}</span>
          <el-switch v-model="model.expunged"></el-switch>
        </div>
        <div class="ehf-switch">
          <span>{{ $t('m.onlyShowGalleriesWithTorrents') }}</span>
          <el-switch v-model="model.torrents"></el-switch>
        </div>
      </template>
    </div>

    <template #footer>
      <!-- 名字保持「重置」:行为上只重置勾选类条件,不动黑名单标签内容(用户要求) -->
      <el-button @click="resetAll">{{ $t('m.reset') }}</el-button>
      <el-button type="primary" @click="apply">{{ $t('m.confirm') }}</el-button>
    </template>
  </el-dialog>

</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { EH_FILTER_CATEGORIES, EH_FILTER_LANGUAGES, defaultEhFilter, normalizeEhFilter } from '../ehFilter.js'
import { galleryCategoryName } from '../utils.js'
import { useAppStore } from '../pinia.js'
// 统一的「!」说明图标(设置页同款)
import SettingHint from './SettingHint.vue'


const { t, te } = useI18n()

const props = defineProps({
  visible: { type: Boolean, default: false },
  filter: { type: Object, default: null },
  // 当前是不是「EH在线」模式:决定两个只对 EH 有意义的开关要不要出现
  online: { type: Boolean, default: false }
})
const emit = defineEmits(['update:visible', 'apply'])

// ============================================================================
// 类别按钮 / 语言下拉 —— 改成「由已有标签决定」(用户要求 4、6)
//
// 以前是写死的常量(EH 的 10 个分类 / 14 种语言),本地库里根本没有的分类也会列出来,
// 选了一本书都没有,用户以为坏了。
// 现在:从当前书架的标签数据里提取「实际出现过的类别值 / 语言值」。
//   · 类别:tagList 里 cat='category' 的那一组(见 utils.withCategoryTag)
//   · 语言:tagList 里 cat='language' 的那一组
// 一个都没有时退回原来的常量,保证界面不会空着。
// ============================================================================
const appStore = useAppStore()

// 从 tagList 里取某个标签类别的全部取值
// 从「全量标签」里取某个类别的所有取值。
// ★ 必须用 tagListRaw(全库标签,来自 get-all-tags),不能用 tagList ——
//   tagList 只从**当前书架的书**聚合,书没加载完/切到在线库时就是空的,
//   于是筛选的类别按钮和语言下拉会退回写死的常量,看起来「没生效」。
const valuesOfTagCat = (cat) => {
  const list = Array.isArray(appStore.tagListRaw) ? appStore.tagListRaw : []
  const out = new Set()
  const want = String(cat).toLowerCase()
  for (const item of list) {
    if (!item) continue
    const c = String(item.cat || '')
    if (c.toLowerCase() !== want) continue
    const tag = String(item.tag || '')
    if (tag) out.add(tag)
  }
  return [...out]
}

// 关键词「选标签」:复用本软件统一的横排标签弹窗 TagList(用户要求 5)
// ⚠ 不用 el-autocomplete 的竖排下拉 —— 软件里所有选标签的地方都是横排网格。
// ---------- 关键词:标签选择栏(复用「编辑信息」那套 el-select 弹层) ----------
const keywordSelectRef = ref(null)
const keywordPicked = ref('')          // el-select 的当前值,形如 'cat##tag'
const keywordDirty = ref(false)        // 用户手动改过关键词(避免被 select 覆盖)

// 已选关键词拆成词条(以空格分隔,符合 EH「空格 = 与」)
const keywordTerms = computed(() =>
  String(model.keyword || '').split(/\s+/).map(s => s.trim()).filter(Boolean)
)

// 标签选择栏的选项:按类别分组,来自全库标签
const keywordTagGroups = computed(() => {
  const list = Array.isArray(appStore.tagListRaw) ? appStore.tagListRaw : []
  const map = new Map()
  for (const it of list) {
    if (!it) continue
    const cat = String(it.cat || '')
    const tag = String(it.tag || '')
    if (!cat || !tag) continue
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat).push(tag)
  }
  const out = []
  for (const [cat, tags] of map) {
    out.push({
      cat,
      label: appStore.categoryLabel ? appStore.categoryLabel(cat) : cat,
      tags: tags.slice(0, 500).sort()
    })
  }
  return out.sort((a, b) => a.cat.localeCompare(b.cat))
})

const onKeywordPick = (val) => {
  if (!val) return
  const i = String(val).indexOf('##')
  const name = i >= 0 ? String(val).slice(i + 2) : String(val)
  if (!name) return
  const cur = String(model.keyword || '').trim()
  if (!keywordTerms.value.includes(name)) {
    model.keyword = cur ? (cur + ' ' + name) : name
  }
  keywordDirty.value = true
  // 清空 select 的选中值,方便继续选下一个
  nextTick(() => { keywordPicked.value = '' })
}

// 点进输入框(下拉展开)时,自动滚动到已有标签处 —— 用户要求「点击进入输入状态后弹出标签栏」
const onKeywordDropVisible = (open) => {
  if (!open) return
  // el-select 聚焦即展开,这里不用额外动作;保留钩子便于将来需要时扩展
}

const removeKeywordTerm = (idx) => {
  const arr = keywordTerms.value.slice()
  arr.splice(idx, 1)
  model.keyword = arr.join(' ')
  keywordDirty.value = true
}

// 类别按钮:优先用已有标签里出现过的类别值(按 EH 常量顺序排,未知的追加在后面)
// ★ EH 在线筛选必须保持原样(EH 的 10 个分类 / 14 种语言是站点命名空间)。
//   只有**本地库**筛选才改成「由已有标签决定」—— 这是两个完全不同的语义,
//   混在一起会把 EH 筛选污染成「AI图集」「绅士漫画分类」这种站点不认的值。
const categories = computed(() => {
  // 在线:永远用 EH 常量
  if (props.online) return EH_FILTER_CATEGORIES
  const used = valuesOfTagCat('category')
  if (!used.length) return EH_FILTER_CATEGORIES
  const byName = new Map(EH_FILTER_CATEGORIES.map(c => [c.name.toLowerCase(), c]))
  const out = []
  for (const name of used) {
    const hit = byName.get(String(name).toLowerCase())
    // 已知类别沿用 EH 的 key/bit(过滤逻辑依赖它们);未知类别用名字本身当 key
    out.push(hit || { key: name, name, bit: 0 })
  }
  return out
})

// 语言:在线用 EH 常量;本地库用「已有标签里出现过的语言」
const languages = computed(() => {
  if (props.online) return EH_FILTER_LANGUAGES
  const used = valuesOfTagCat('language')
  if (!used.length) return EH_FILTER_LANGUAGES
  const known = new Set(EH_FILTER_LANGUAGES)
  return [...used].sort((a, b) => {
    const ia = known.has(String(a).toLowerCase()) ? 0 : 1
    const ib = known.has(String(b).toLowerCase()) ? 0 : 1
    return ia - ib
  })
})

const visible_ = ref(props.visible)
watch(() => props.visible, v => { visible_.value = v })
watch(visible_, v => emit('update:visible', v))

// 每次打开都用外面那份筛选值重置一遍,避免上一次的临时改动留在界面上
// ★ 本地库的动态类别(由已有标签生成):默认全部勾上 = 不筛选
const dynamicCatKeys = computed(() => {
  if (props.online) return []
  return categories.value.map(c => c.key).filter(k => !EH_FILTER_CATEGORIES.some(e => e.key === k))
})
const model = reactive(defaultEhFilter(dynamicCatKeys.value))
// 每次打开时把动态类别也补进 model(否则界面上勾了但 model 里没这个 key)
const ensureDynamicCats = () => {
  for (const k of dynamicCatKeys.value) {
    if (!Object.prototype.hasOwnProperty.call(model, k)) model[k] = true
  }
}

// 评分 0.5 步进:1(不限)/1.5/2/…/5
const ratingOptions = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]

// 星星评分:0 颗 = 不限(映射回 minimumRating 的 1);半星直接对应 1.5/2.5/…
const ratingStars = ref(0)
watch(ratingStars, (v) => { model.minimumRating = (Number(v) || 0) > 1 ? Number(v) : 1 })
watch(() => model.minimumRating, (v) => { const n = Number(v); if (n > 1 && n !== ratingStars.value) ratingStars.value = n })

// ---------- 黑名单的「标签框」 ----------
// model.blacklist 仍然是「逗号分隔的字符串」(存盘格式不变、ehFilter.js 的过滤逻辑不变),
// 界面上把它拆成一个个标签显示,输入框负责「敲一个新的回车加进去」。
const blacklistTerms = computed(() =>
  String(model.blacklist || '').split(/[,，、]+/).map(s => s.trim()).filter(Boolean)
)
const newBlacklistTerm = ref('')
const blacklistInputRef = ref(null)
const writeBlacklistTerms = (list) => { model.blacklist = list.join(',') }
const commitBlacklistTerm = () => {
  const name = String(newBlacklistTerm.value || '').trim()
  newBlacklistTerm.value = ''
  if (!name) return
  const list = blacklistTerms.value.slice()
  // 去重(大小写不敏感),但保留用户输入的原始写法
  if (!list.some(s => s.toLowerCase() === name.toLowerCase())) list.push(name)
  writeBlacklistTerms(list)
}
// 输入框里敲逗号(中英文都算)= 立即提交这一个标签(和以前在输入框里打逗号的效果一致)
const onBlacklistKeyup = (e) => {
  const key = String((e && e.key) || '')
  if (key === ',' || key === '，' || key === '、') commitBlacklistTerm()
}
const removeBlacklistTerm = (name) => {
  writeBlacklistTerms(blacklistTerms.value.filter(s => s !== name))
}
const focusBlacklistInput = () => {
  try { blacklistInputRef.value && blacklistInputRef.value.focus() } catch (e) { /* 忽略 */ }
}
const syncFromProps = () => {
  ratingStars.value = (Number(model.minimumRating) || 0) > 1 ? Number(model.minimumRating) : 0
  // 用 normalize 而不是 {...default, ...props.filter}:外面传进来的可能是老数据
  // (没有 blacklistEnabled 字段),normalize 会按「黑名单非空 = 启用」补齐,不会误关老用户的黑名单
  const src = normalizeEhFilter(props.filter)
  // ★ 先把动态类别补进 model,再用 src 覆盖 —— 否则动态类别的勾选状态会被丢掉
  ensureDynamicCats()
  for (const k of Object.keys(model)) {
    model[k] = (k in src) ? src[k] : (dynamicCatKeys.value.includes(k) ? true : model[k])
  }
}
syncFromProps()
watch(() => props.visible, v => { if (v) syncFromProps() })

const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1)
// 语言下拉的显示名:跟随界面语言(m.ehLangChinese / ehLangEnglish …)。
// ⚠ 只有显示名本地化,存到 setting 里的值仍然是 EH 认的英文标识(chinese/english/…)
const langLabel = (l) => {
  const key = 'm.ehLang' + cap(l)
  if (te(key)) return t(key)
  return cap(l)   // 词条缺失时退回首字母大写,绝不显示 "m.ehLang..."
}

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
  // 重置**全部**筛选条件(关键词/语言/页数/评分/分类格/两个开关/黑名单开关都在 base 里),
  // 但保留黑名单标签内容(用户明确要求:重置不再重置黑名单内容)。
  for (const k of Object.keys(base)) {
    if (k === 'blacklist') continue
    model[k] = base[k]
  }
  // 星星是独立 ref,不跟着 minimumRating 自动回落时必须显式清零,否则还亮着
  ratingStars.value = 0
  newBlacklistTerm.value = ''
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
  // 标题 + 「!」说明图标:同一行基线对齐(label 里的 SettingHint 自带 4px 左边距)
  .ehf-label-with-hint
    display: flex
    align-items: center
    gap: 0
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

// 黑名单标签行:标题与「启用黑名单」勾选框同一行。
// 勾选框不显示文字,所以要让它和「黑名单标签」四个字的垂直中线对齐:
//   文字行高 20px、方框 14px 且 margin 归零,靠 align-items:center 居中。
.ehf-label-with-check
  .ehf-label-text
    flex: none
    line-height: 20px
  // 间距由 margin 控制(gap 会被 .ehf-field .ehf-label-with-hint 的 gap:0 覆盖)
  .ehf-blacklist-enabled
    margin: 0 0 0 8px
    height: 14px
    padding: 0
// 黑名单标签框:外观对齐「详细界面」的标签(el-tag size=small effect=plain)
.ehf-tagbox
  display: flex
  flex-wrap: wrap
  align-items: center
  gap: 4px
  min-height: 32px
  padding: 3px 6px
  border: 1px solid var(--el-border-color)
  border-radius: 4px
  background: var(--el-fill-color-blank)
  cursor: text
  &:hover
    border-color: var(--el-border-color-hover)
  .ehf-tagbox-tag
    max-width: 100%
// 框内的输入框去掉自己的边框/底色,看起来就像标签框里的一个光标位。
// ⚠ 组件是**非 scoped** 样式,:deep() 在这里无效,直接写后代选择器
.ehf-tagbox-input
  flex: 1 1 90px
  min-width: 90px
  .el-input__wrapper
    box-shadow: none !important
    background: transparent
    padding: 0
// 历史标签行(已移除)不再有样式
.ehf-rating-stars
  display: flex
  align-items: center
  gap: 10px
  .ehf-rating-text
    font-size: 12px
    color: var(--el-text-color-secondary)





/* 关键词:标签选择栏 + 已选词条 */
.ehf-keyword-select {
  width: 100%;
}
.ehf-keyword-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

</style>
