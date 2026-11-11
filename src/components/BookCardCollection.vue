<template>
  <!-- 合集卡片:与普通卡片(BookCard)同一套结构 / 尺寸 / 边框 / 圆角 / 按钮行,
       所以「按键和功能」也保持一致(阅读按钮、页数、评分、右键菜单、双击进详情、
       填充封面布局)。唯一的合集专属元素是右上角的「合集」标签 —— 它用绝对定位盖住标题右上角,
       这是**预期**的遮挡行为;可在 设置 → 高级 → 卡片样式 →「隐藏合集」里关掉。
       底部状态标签保持原样(显示「合集」),与普通卡的 non-tag/tagged 状态标签对齐。 -->
  <div class="book-card book-card-collection" :class="{ 'fill-cover': cardFillCover }">
    <!-- ================= 经典卡片布局(默认) ================= -->
    <template v-if="!cardFillCover">
      <p class="book-title" v-if="!setting.hideTitle"
        @click.stop="$emit('titleClick')"
        @contextmenu="onTitleContextMenu($event)"
        :title="book.title"
      ><span class="book-title-inner">{{book.title}}</span></p>
      <div class="book-cover-frame">
        <img
          v-if="coverSrc"
          class="book-cover"
          :src="coverSrc"
          @click="$emit('openCollection')"
          @dblclick="$emit('coverDblclick')"
          @contextmenu="onCoverContextMenu($event)"
          @load="onCoverLoad"
          @error="onCoverError"
        />
        <div v-else class="book-cover book-cover-empty" @click="$emit('openCollection')" @contextmenu="onCoverContextMenu($event)"></div>
        <!-- 加载中一直转圈(包含「成员封面还没生成出来」);生成彻底失败才落文字 -->
        <div class="cover-loading" v-if="coverLoading">
          <el-icon class="is-loading" :size="26"><Loading /></el-icon>
        </div>
        <div class="cover-failed" v-if="coverFailed">{{ $t('m.coverLoadFailed') }}</div>
        <el-tag class="book-card-language" size="small" v-if="!setting.hideReadCount"
          @click.stop="$emit('openCollection')"
        >{{book.readCount}}</el-tag>
        <!-- 页数标签:合集显示成员本数(N C),维持书架原有观感 -->
        <el-tag class="book-card-pagecount" size="small" type="info" v-if="!setting.hidePageCount"
          @click.stop="$emit('pagecountClick')"
        >{{ book.chapterCount }}C</el-tag>
      </div>
      <!-- 收藏标签行:合集没有收藏标签,保留空容器让卡片高度与普通卡对齐 -->
      <div class="collect-tag"></div>
      <!-- 底部一行:与普通卡片同款 —— 阅/读按钮组 + 状态标签 + 评分 -->
      <div class="book-card-footer">
        <el-button-group class="outer-read-button-group" v-if="!setting.hideReadButton">
          <el-button type="success" size="small" class="outer-read-button" plain @click.stop="$emit('yueClick', book)">{{$t('m.re')}}</el-button>
          <el-button type="success" size="small" class="outer-read-button" plain @click.stop="$emit('duClick', book)">{{$t('m.ad')}}</el-button>
        </el-button-group>
        <el-tag
          v-if="!setting.hideNonTag"
          class="book-status-tag"
          effect="plain"
          type="warning"
          :title="$t('m.collection')"
          @click.stop="$emit('openCollectionInfo', book)"
        >{{$t('m.collection')}}</el-tag>
        <el-rate v-if="!setting.hideRating" :model-value="book.rating" size="small" allow-half disabled/>
      </div>
    </template>

    <!-- ================= 填充封面布局(设置「填充封面」打开后) ================= -->
    <template v-else>
      <img
        v-if="coverSrc"
        class="book-cover-fill"
        :src="coverSrc"
        @click="$emit('openCollection')"
        @dblclick="$emit('coverDblclick')"
        @contextmenu="onCoverContextMenu($event)"
        @load="onCoverLoad"
        @error="onCoverError"
      />
      <div v-else class="book-cover-fill book-cover-empty" @click="$emit('openCollection')" @contextmenu="onCoverContextMenu($event)"></div>
      <div class="cover-loading" v-if="coverLoading">
        <el-icon class="is-loading" :size="26"><Loading /></el-icon>
      </div>
      <div class="cover-failed" v-if="coverFailed">{{ $t('m.coverLoadFailed') }}</div>
      <div class="fill-top">
        <el-tag class="fill-badge" size="small" v-if="!setting.hideReadCount"
          @click.stop="$emit('openCollection')"
        >{{book.readCount}}</el-tag>
        <p class="fill-title" v-if="!setting.hideTitle"
          @click.stop="$emit('titleClick')"
          @contextmenu="onTitleContextMenu($event)"
          :title="book.title"
        ><span class="fill-title-inner">{{book.title}}</span></p>
      </div>
      <!-- 底部浮层:页数/阅·读按钮 + 状态标签 + 评分 -->
      <div class="fill-footer">
        <div class="footer-row">
          <el-tag class="fill-badge" size="small" v-if="!setting.hidePageCount"
            @click.stop="$emit('pagecountClick')"
          >{{ book.chapterCount }}C</el-tag>
          <el-button-group class="outer-read-button-group" v-if="!setting.hideReadButton">
            <el-button type="success" size="small" class="outer-read-button" plain @click.stop="$emit('yueClick', book)">{{$t('m.re')}}</el-button>
            <el-button type="success" size="small" class="outer-read-button" plain @click.stop="$emit('duClick', book)">{{$t('m.ad')}}</el-button>
          </el-button-group>
          <el-tag
            v-if="!setting.hideNonTag"
            class="fill-badge"
            type="warning"
            :title="$t('m.collection')"
            @click.stop="$emit('openCollectionInfo', book)"
          >{{$t('m.collection')}}</el-tag>
          <el-rate v-if="!setting.hideRating" :model-value="book.rating" size="small" allow-half disabled/>
        </div>
      </div>
    </template>

    <!-- 「合集」标签:可在 设置 → 高级 → 卡片样式 里关掉(隐藏合集) -->
    <el-tag v-if="!setting.hideCollectionTag" effect="dark" type="warning" class="book-collection-tag">{{$t('m.collection')}}</el-tag>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ContextMenu from '@imengyu/vue3-context-menu'

import { useAppStore } from '../pinia.js'
import { storeToRefs } from 'pinia'
import { ensureBookCover, bookImgSrc } from '../utils.js'
import { Loading } from '@element-plus/icons-vue'
const appStore = useAppStore()
const { bookList, setting } = storeToRefs(appStore)
const { isChineseTranslatedManga } = appStore

const { t } = useI18n()

// 点击事件拆细:以前标题 / 页数 / 封面双击都挤在 openCollectionInfo 一个事件上,
// 于是合集卡片永远只能「打开合集详情」,「点击策略」(设置 → 高级)对它完全无效。
// 现在与普通卡片一一对应:封面=openCollection、标题=titleClick、双击=coverDblclick、
// 页数=pagecountClick、阅/读=yueClick/duClick,全部交给 App 的 runClickAction 决定。
const emit = defineEmits(['openCollection', 'openCollectionInfo', 'titleClick', 'coverDblclick', 'pagecountClick', 'yueClick', 'duClick', 'editCollection'])

const props = defineProps({
  book: Object
})

// 合集成员用的键:聚合条目写入的 ids(id)优先,老数据退回 list(hash)
const memberKeys = computed(() => {
  const b = props.book || {}
  if (Array.isArray(b.ids) && b.ids.length) return b.ids
  if (Array.isArray(b.list) && b.list.length) return b.list
  return []
})

// 实时成员数组:优先用聚合时 App 挂到条目上的 _members(元素就是 bookList 里那些书的
// 引用,成员重新生成封面/改元数据后这里立刻能看到;每次聚合都会重建,不会陈旧)。
// 老数据 / 异常情况没有 _members 时,退回按 ids/list 查一遍 —— 但只扫一次全库建映射,
// 不再是「每个成员一次 find」(那样一屏几十张卡 × 上万本 = 千万级比较)。
// ★ 走 _members 时这个 computed 根本不读 bookList:书架重排/扫描批次刷新都不会牵连卡片。
const memberBooks = computed(() => {
  const ms = props.book && props.book._members
  if (Array.isArray(ms) && ms.length) return ms.filter(Boolean)
  const byKey = new Map()
  for (const b of bookList.value) {
    if (!b) continue
    if (b.id != null) byKey.set(b.id, b)
    if (b.hash != null) byKey.set(b.hash, b)
  }
  const out = []
  for (const key of memberKeys.value) {
    const b = byKey.get(key)
    if (b) out.push(b)
  }
  return out
})

// 第一个成员(按成员顺序):所有成员都没封面时,由它负责去生成
const firstMember = computed(() => memberBooks.value[0] || null)
// 主界面的合集卡跟随普通「卡片样式」的填充封面开关 ——
// 「合集界面卡片」那组开关现在只管打开合集后底部抽屉里的那些卡(用户要求)。
const cardFillCover = computed(() => !!setting.value.fillCover)

// 第一个**有封面**的成员:合集封面取它的实时 coverPath。
// 以前先读聚合那一刻的 coverPath 快照 —— 第一本当时没封面、后来生成了也不回填,
// 卡片就永远空白(用户说的「后期也不会自动获取」);快照本身是坏图时更糟:
// 成员重新生成封面后 src 仍指向快照那条坏地址,卡片永久停在坏图。
// ★ 现在再加一层:合集可以在详情里手动「设为封面」(coverKey = 成员 hash/id),
//   指定过就优先用它 —— 否则手动设的封面在卡片上根本不生效。
const coverMember = computed(() => {
  const key = (props.book && props.book.coverKey) || ''
  if (key) {
    const hit = memberBooks.value.find(m => m && (m.hash === key || m.id === key))
    if (hit && hit.coverPath) return hit
  }
  return memberBooks.value.find(m => m && m.coverPath) || null
})

// 封面地址:成员实时 coverPath 优先,所有成员都没封面时才退回聚合快照兜底。
// 查询串带 nonce:同名文件重建后浏览器会用缓存,必须换 src 才会重新拉图 ——
//   · _coverNonce 由 ensureBookCover 成功时打上(见 utils.js)
//   · coverRetry 是组件内的重试 nonce:img 加载失败时光调 ensureBookCover 不换 src,
//     字符串没变浏览器根本不重发请求(旧代码「永久停在坏图」的根因)
const coverRetry = ref(0)
const MAX_COVER_RETRY = 3
const coverSrc = computed(() => {
  const m = coverMember.value
  const p = (m && m.coverPath) || (props.book && props.book.coverPath) || ''
  if (!p) return ''
  // ★ 先编码:文件名里的 # / % 会让 file:// 地址失效(封面存在也加载不出来)
  const base = bookImgSrc(p)
  const parts = []
  if (m && m._coverNonce) parts.push(m._coverNonce)
  if (coverRetry.value) parts.push('r' + coverRetry.value)
  if (!parts.length) return base
  return base + (base.includes('?') ? '&' : '?') + 'r=' + parts.join('-')
})
// 封面加载状态:与普通卡片同一套 —— 加载中一直转圈,直到 @load 出图或真失败;
// 不做「N 秒算失败」的超时(大书库并发读封面十几秒很正常,超时会整屏误标加载失败)。
const coverLoading = ref(false)
const coverFailed = ref(false)
const stopCoverLoading = () => { coverLoading.value = false }
const startCoverLoading = () => { coverFailed.value = false; coverLoading.value = true }
const failCover = () => { coverFailed.value = true; coverLoading.value = false }
const onCoverLoad = () => { coverFailed.value = false; stopCoverLoading() }
// 地址一换(成员换封面 / 重试 nonce)就重新等图,失败态一并清掉。
// 地址为空时不在这里停转圈 —— 那是「还没有封面」,交给下面那个 watcher 去生成 / 收失败。
watch(coverSrc, (v) => {
  if (v) startCoverLoading()
}, { immediate: true })
// 换了封面成员、或成员的 coverPath 变了(重新生成 / 被外部改写):重试计数从头来。
// ★ 同一个坏地址反复失败时 coverPath 不变、计数不清零,连续 3 次后彻底停手,
//   不会无限刷 IPC;封面真的换了(新文件)才给一份新预算。
watch([coverMember, () => (coverMember.value && coverMember.value.coverPath) || ''], () => { coverRetry.value = 0 })

// 没有封面就**真的去生成**(而不是画一个空占位块)。盯第一个成员:它长出封面后
// coverSrc 会自动接上。只对本地书有意义:在线书没有「本地封面」这回事。
// ★ 生成期间必须转圈等:合集封面来自成员,成员封面常常还没生成出来 ——
//   这正是「显示加载失败的书其实只是还没生成」的同一类情况。
watch([coverSrc, firstMember], async () => {
  if (coverSrc.value) { startCoverLoading(); return }
  const m = firstMember.value
  if (!m) { failCover(); return }
  if (m.online) { failCover(); return }
  startCoverLoading()
  const next = await ensureBookCover(m).catch(() => null)
  // 拿到地址后 coverSrc 变化会接管;拿不到才算这轮没封面
  if (!next && !coverSrc.value) failCover()
}, { immediate: true })

// 图片加载失败(封面文件被清理 / 损坏):继续转圈 + 重新生成,重试耗尽才显示「加载失败」。
// 连续失败上限 3 次:坏封面也不能无限刷 IPC(ensureBookCover 自己还有 _coverFailed 兜底)。
const onCoverError = () => {
  // 生成「当前显示的那个成员」的封面;一个都没封面时才轮到第一个成员
  const m = coverMember.value || firstMember.value
  if (!m) { failCover(); return }
  coverLoading.value = true
  coverFailed.value = false
  if (coverRetry.value >= MAX_COVER_RETRY) { failCover(); return }
  coverRetry.value++
  if (m.online) return
  ensureBookCover(m)
}

// ---------- 右键菜单:与普通卡片一样「封面/标题都能右键」 ----------
// 合集不是真的书,所以菜单项换成合集能做的四件事(普通卡那套改元数据/删文件对它没意义)。
const buildCollectionMenu = () => ([
  { label: t('m.openCollection'), onClick: () => emit('openCollection') },
  { label: t('m.collectionDetail'), onClick: () => emit('openCollectionInfo', props.book) },
  { label: t('m.editCollection'), onClick: () => emit('editCollection', props.book) },
  { label: t('c.copyTitleToClipboard'), onClick: () => { try { window.ipcRenderer.invoke('copy-text-to-clipboard', String(props.book && props.book.title || '')) } catch (e) { /* 忽略 */ } } }
])
const openMenu = (e) => {
  e.preventDefault()
  e.stopPropagation()
  ContextMenu.showContextMenu({ x: e.x, y: e.y, items: buildCollectionMenu() })
}
const onCoverContextMenu = (e) => openMenu(e)
const onTitleContextMenu = (e) => openMenu(e)
</script>

<style lang="stylus">
// 「合集」标签:绝对定位盖在标题右上角(用户要求的旧观感 —— 遮挡标题,而不是和标题抢位置)。
// .book-card 本身就是 position: relative,所以这里相对卡片定位即可。
.book-collection-tag
  position: absolute
  right: 1px
  top: 1px
  z-index: 3
  white-space: nowrap

// 合集卡的尺寸 / 边框 / 圆角全部继承 .book-card(BookCard.vue 里的全局样式),
// 这里**不写任何尺寸覆盖**,保证与主界面普通卡片完全一致。
.book-card-collection
  .book-title
    // 标签盖住标题头部是预期行为,这里只保证标题不溢出卡片右边
    overflow-x: hidden
</style>
