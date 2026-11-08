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
        <el-input v-model="model.keyword" clearable :placeholder="$t('m.filterKeywordPlaceholder')" />
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
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EH_FILTER_CATEGORIES, EH_FILTER_LANGUAGES, defaultEhFilter, normalizeEhFilter } from '../ehFilter.js'
import { galleryCategoryName } from '../utils.js'
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
  for (const k of Object.keys(model)) model[k] = src[k]
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
</style>
