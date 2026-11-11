<template>
  <div class="book-card" :class="{'fill-cover': fillCover}">
    <!-- 种子:这个画廊确实有种子时才出现。挂在**卡片框**的右下角(不在封面里),
         图标是用户给的藤蔓图,压在框角上像是藤蔓缠在框上;不显示数量 -->
    <button
      v-if="book.torrentCount > 0"
      class="book-card-torrent"
      :title="$t('m.torrent') + ' (' + book.torrentCount + ')'"
      @click.stop="$emit('openTorrents', book)"
    >
      <img :src="vineIcon" alt="torrent" />
    </button>
    <!-- ================= 经典卡片布局(默认;原版布局原样保留) ================= -->
    <template v-if="!fillCover">
    <p class="book-title" v-if="!viewSetting.hideTitle"
      @click="$emit('titleClick')"
      @contextmenu="onTitleContextMenu($event)"
      :title="getDisplayTitle(book)"
    ><span class="book-title-inner">{{getDisplayTitle(book)}}</span></p>
    <div class="book-cover-frame">
      <div class="book-task-mask" v-if="bookTaskChar">
        <div class="book-task-ring"></div>
        <span class="emm-eq pixel-only"><i></i><i></i><i></i><i></i></span>
        <span class="book-task-text">{{ bookTaskChar }}</span>
        <span class="book-task-progress" v-if="bookTaskTotal">{{ bookTaskDone }}/{{ bookTaskTotal }}</span>
      </div>
      <img
        v-if="coverSrc"
        class="book-cover"
        :src="coverSrc"
        alt=""
        @click="onCoverClickOnce"
        @dblclick="onCoverDblClick"
        @touchstart.passive="startCoverPress($event)"
        @touchend="endCoverPress"
        @touchmove.passive="cancelCoverPress"
        @touchcancel="cancelCoverPress"
        @contextmenu="onCoverContextMenu($event)"
        @load="onCoverLoad"
        @error="onCoverError"
      />
      <!-- 还没有封面地址(扫描后还没生成出来):只放一块淡底,文字由下面的失败层负责 -->
      <div
        v-else
        class="book-cover book-cover-empty"
        :title="getDisplayTitle(book)"
        @click="onCoverClickOnce"
        @dblclick="onCoverDblClick"
        @touchstart.passive="startCoverPress($event)"
        @touchend="endCoverPress"
        @touchmove.passive="cancelCoverPress"
        @touchcancel="cancelCoverPress"
        @contextmenu="onCoverContextMenu($event)"
      ></div>
      <!-- 加载中:一直转圈。这里的「加载中」包含「封面还没生成出来」——
           大书库首屏几十张封面同时解码、或现场解压生成,十几秒才出图是常态。
           ★ 绝不按秒数判死:一旦按时间判,正在生成的书会整屏显示「加载失败」。
           只有封面生成彻底失败(重试耗尽)才收成失败态。 -->
      <div class="cover-loading" v-if="coverLoading">
        <el-icon class="is-loading" :size="26"><Loading /></el-icon>
        <span class="emm-eq pixel-only"><i></i><i></i><i></i><i></i></span>
      </div>
      <!-- 真的生成不出来才显示「加载失败」。<img> 仍然留在下面继续加载,
           后台稍后补出封面时会自己换回来。 -->
      <div class="cover-failed" v-if="coverFailed">{{ $t('m.coverLoadFailed') }}</div>
      <el-tag class="book-card-language" size="small" v-if="book.historyTime || !viewSetting.hideReadCount"
        :type="isChineseTranslatedManga(book) ? 'danger' : 'info'"
        @click="onReadCountClick"
      >{{ book.historyTime ? historyTimeText : (book.online ? languageBadgeText(book) : book.readCount) }}</el-tag>
      <el-tag class="book-card-pagecount" size="small" type="danger" v-if="!viewSetting.hidePageCount && book.pageDiff && book.pageCount != null" @click="$emit('pageCountClick')">{{book.pageCount}}|{{book.filecount}}P</el-tag>
      <el-tag class="book-card-pagecount" size="small" type="info" v-else-if="!viewSetting.hidePageCount && book.pageCount != null" @click="$emit('pageCountClick')">{{ book.pageCount }}P</el-tag>
      <el-icon
        v-if="!viewSetting.hideBookmarkButton && !viewerRole"
        :size="30"
        :color="markColor(book)"
        class="book-card-mark"
        :title="book.online ? $t('m.favorite') : ''"
        @click="onMarkClick(book)"
      ><BookmarkTwotone /></el-icon>
    </div>
    <div class="collect-tag">
      <el-tag
        v-for="tag in filterCollectTag(book.tags)" :key="tag.id"
        @click="onCollectTagClick(tag)"
        @mousedown="startTagPress(tag)"
        @mouseup="cancelTagPress"
        @mouseleave="cancelTagPress"
        @touchstart.passive="startTagPress(tag)"
        @touchend="cancelTagPress"
        @touchmove.passive="cancelTagPress"
        @contextmenu="onCollectTagContextMenu($event, tag)"
        class="book-collect-tag"
        effect="plain"
        :style="tag.color ? { color: tag.color, borderColor: tag.color } : null"
        size="small"
      >{{ tagDisplayPrefix(setting, resolvedTranslation, tag.cat, tag.tag) }}:{{ tagDisplayName(setting, resolvedTranslation, resolveCatKey(tag.cat), tag.tag) }}</el-tag>
    </div>
    <div class="book-card-footer">
      <el-button-group class="outer-read-button-group" v-if="!viewSetting.hideReadButton">
        <el-button type="success" size="small" class="outer-read-button" plain @click="$emit('yueClick')">{{$t('m.re')}}</el-button>
        <el-button type="success" size="small" class="outer-read-button" plain @click="$emit('duClick')">{{$t('m.ad')}}</el-button>
      </el-button-group>
      <!-- 这个「标签」格:有类别就显示所属类别(如 Misc / Western),没有才显示 tagged / non-tag 状态;悬停可看真实状态 -->
      <el-tag
        v-if="!viewSetting.hideNonTag"
        class="book-status-tag"
        effect="plain"
        :type="book.status === 'non-tag' ? 'info' : book.status === 'tagged' ? 'success' : 'warning'"
        :title="book.status"
        @click="$emit('searchFromTag', book.category || book.status, book.category ? 'category' : '')"
      >{{ galleryCategoryName(book.category, $t) || book.status }}</el-tag>
      <el-rate v-if="!viewSetting.hideRating" v-model="bookRating" size="small" allow-half :disabled="viewerRole || !!book.online" @change="onRateChange"/>
    </div>
    </template>
    <!-- ================= 填充封面布局(设置 → 显示选项「填充封面」打开后) ================= -->
    <!-- 封面铺满整卡;阅读数/页数/阅·读按钮/状态/评分/收藏标签全部透明浮在图上(无白底) -->
    <template v-else>
      <img
        v-if="coverSrc"
        class="book-cover-fill"
        :src="coverSrc"
        alt=""
        @click="onCoverClickOnce"
        @dblclick="onCoverDblClick"
        @touchstart.passive="startCoverPress($event)"
        @touchend="endCoverPress"
        @touchmove.passive="cancelCoverPress"
        @touchcancel="cancelCoverPress"
        @contextmenu="onCoverContextMenu($event)"
        @load="onCoverLoad"
        @error="onCoverError"
      />
      <div
        v-else
        class="book-cover-fill book-cover-empty"
        :title="getDisplayTitle(book)"
        @click="onCoverClickOnce"
        @dblclick="onCoverDblClick"
        @touchstart.passive="startCoverPress($event)"
        @touchend="endCoverPress"
        @touchmove.passive="cancelCoverPress"
        @touchcancel="cancelCoverPress"
        @contextmenu="onCoverContextMenu($event)"
      ></div>
      <!-- 填充封面布局:同经典布局 —— 加载中一直转圈,真失败才写「加载失败」 -->
      <div class="cover-loading" v-if="coverLoading">
        <el-icon class="is-loading" :size="26"><Loading /></el-icon>
        <span class="emm-eq pixel-only"><i></i><i></i><i></i><i></i></span>
      </div>
      <div class="cover-failed" v-if="coverFailed">{{ $t('m.coverLoadFailed') }}</div>
      <!-- 任务进度遮罩:填充封面布局同样展示(旋转环 + 任务单字 + 已处理/总数) -->
      <div class="book-task-mask" v-if="bookTaskChar">
        <div class="book-task-ring"></div>
        <span class="emm-eq pixel-only"><i></i><i></i><i></i><i></i></span>
        <span class="book-task-text">{{ bookTaskChar }}</span>
        <span class="book-task-progress" v-if="bookTaskTotal">{{ bookTaskDone }}/{{ bookTaskTotal }}</span>
      </div>
      <div class="fill-top" v-if="fillTopShown || (!viewSetting.hideBookmarkButton && !viewerRole)">
        <el-tag class="fill-badge" size="small" v-if="book.historyTime || !viewSetting.hideReadCount"
          @click="onReadCountClick"
        >{{ book.historyTime ? historyTimeText : (book.online ? languageBadgeText(book) : book.readCount) }}</el-tag>
        <p class="fill-title" v-if="!viewSetting.hideTitle"
          @click="$emit('titleClick')"
          @contextmenu="onTitleContextMenu($event)"
          :title="getDisplayTitle(book)"
        ><span class="fill-title-inner">{{getDisplayTitle(book)}}</span></p>
        <!-- 收藏按钮:与角标/标题同一行;标题在角标与收藏按钮之间居中,
             隐藏任一侧时标题自动伸展填补空位 -->
        <el-icon
          v-if="!viewSetting.hideBookmarkButton && !viewerRole"
          :size="24"
          :color="book.online ? (book.favcat == null ? '#ffffff' : '#F7BA2A') : (book.mark ? '#F7BA2A' : '#ffffff')"
          class="fill-mark"
          :title="book.online ? $t('m.favorite') : ''"
          @click="onMarkClick(book)"
        ><BookmarkTwotone /></el-icon>
      </div>
      <div class="fill-footer" v-if="fillFooterShown">
        <!-- 阅读/页数/标签/评分尽量排在一行,放不下自动换行,换出的行居中 -->
        <div class="footer-row" v-if="fillRow1Shown || !viewSetting.hideRating">
          <el-tag
            v-for="tag in filterCollectTag(book.tags)" :key="tag.id"
            @click="onCollectTagClick(tag)"
            @mousedown="startTagPress(tag)"
            @mouseup="cancelTagPress"
            @mouseleave="cancelTagPress"
            @touchstart.passive="startTagPress(tag)"
            @touchend="cancelTagPress"
            @touchmove.passive="cancelTagPress"
            @contextmenu="onCollectTagContextMenu($event, tag)"
            class="book-collect-tag"
            :color="tag.color"
            size="small"
            effect="dark"
          >{{tag.letter}}:{{ tagDisplayName(setting, resolvedTranslation, resolveCatKey(tag.cat), tag.tag) }}</el-tag>
          <el-tag class="fill-badge" size="small" v-if="!viewSetting.hidePageCount && book.pageDiff" @click="$emit('pageCountClick')">{{book.pageCount}}|{{book.filecount}}P</el-tag>
          <el-tag class="fill-badge" size="small" v-else-if="!viewSetting.hidePageCount" @click="$emit('pageCountClick')">{{ book.pageCount }}P</el-tag>
          <el-button-group class="outer-read-button-group" v-if="!viewSetting.hideReadButton">
            <el-button type="success" size="small" class="outer-read-button" plain @click="$emit('yueClick')">{{$t('m.re')}}</el-button>
            <el-button type="success" size="small" class="outer-read-button" plain @click="$emit('duClick')">{{$t('m.ad')}}</el-button>
          </el-button-group>
          <el-tag
            v-if="!viewSetting.hideNonTag"
            class="fill-badge"
            :title="book.status"
            @click="$emit('searchFromTag', book.category || book.status, book.category ? 'category' : '')"
          >{{ galleryCategoryName(book.category, $t) || book.status }}</el-tag>
          <el-rate v-if="!viewSetting.hideRating" v-model="bookRating" size="small" allow-half :disabled="viewerRole || !!book.online" @change="onRateChange"/>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watchEffect, computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { BookmarkTwotone } from '@vicons/material'
// 用户给的藤蔓图(白底已抠成透明):卡片右下角的「种子」按钮用它
import vineIcon from '../assets/vine-torrent.png'
import { Loading } from '@element-plus/icons-vue'
import ContextMenu from '@imengyu/vue3-context-menu'

import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
import { isContextMenuItemEnabled, sortContextMenuItems, ensureBookCover, retryBookCover, bookImgSrc, getDisplayTagName, tagDisplayName, resolveCatKey, galleryCategoryName, tagDisplayPrefix } from '../utils.js'
const appStore = useAppStore()
const TASK_CHARS = { translate: '翻', colorize: '色', upscale: '分', extract: '字' }
const bookTaskProgress = computed(() => (appStore.bookTaskProgress && appStore.bookTaskProgress[props.book && props.book.id]) || null)
const bookTaskDone = computed(() => (bookTaskProgress.value ? bookTaskProgress.value.done : 0))
const bookTaskTotal = computed(() => (bookTaskProgress.value ? bookTaskProgress.value.total : 0))
const bookTaskChar = computed(() => {
  const k = appStore.bookTasks && appStore.bookTasks[props.book && props.book.id]
  return k ? (TASK_CHARS[k] || '忙') : ''
})

const { setting, resolvedTranslation } = storeToRefs(appStore)
const { printMessage } = appStore
const { getDisplayTitle, isChineseTranslatedManga, onlineLanguageCode, saveBook, switchMark } = appStore

const { t, locale } = useI18n()

// 角标上的语言:界面是中文时**全部语言都用中文**(用户要的),其它界面沿用 CH/EH/JP 缩写。
// 取不到语言时维持原来的 EH(表示来自 E-Hentai),不会变成空的角标。
const LANG_ZH_CHAR = {
  CH: '中', EH: '英', JP: '日', KR: '韩', ES: '西', FR: '法', DE: '德', RU: '俄',
  IT: '意', PT: '葡', TH: '泰', VI: '越', PL: '波', NL: '荷', HU: '匈', TR: '土',
  ID: '印尼', AR: '阿', HE: '希伯来', HI: '印地', BN: '孟加拉', UR: '乌尔都', FA: '波斯',
  CS: '捷克', EL: '希腊', SV: '瑞典', FI: '芬兰', DA: '丹麦', NO: '挪威', RO: '罗马尼亚',
  UK: '乌克兰', CA: '加泰', HR: '克罗地亚', SR: '塞尔维亚', BG: '保加利亚', SK: '斯洛伐克',
  SL: '斯洛文尼亚', LT: '立陶宛', LV: '拉脱维亚', ET: '爱沙尼亚', IS: '冰岛', MS: '马来',
  TL: '菲律宾', MY: '缅甸', KM: '高棉', LO: '老挝', NE: '尼泊尔', SI: '僧伽罗', TA: '泰米尔',
  TE: '泰卢固', ML: '马拉雅拉姆', KN: '卡纳达', MR: '马拉地', GU: '古吉拉特', PA: '旁遮普'
}
const languageBadgeText = (book) => {
  const code = onlineLanguageCode(book) || 'EH'
  if (String(locale.value || '').toLowerCase().startsWith('zh')) return LANG_ZH_CHAR[code] || code
  return code
}

// 卡片实际生效的开关:
//   · 主书架(含主界面的合集卡)→ 普通「卡片样式」
//   · 合集界面(底部抽屉)里的卡 → 「卡片样式 → 合集界面卡片」那组开关覆盖三项
//     (页数角标 / 阅读数角标 / 填充封面)。「隐藏合集」这种只对主界面合集卡有意义,
//     不在这一组里。
const viewSetting = computed(() => {
  const s = setting.value
  // 合集界面卡片的总开关没开 → 抽屉卡片完全跟随主界面(与主界面同一套开关/尺寸)
  if (!props.collectionView || !s.collectionCardStyleEnabled) return s
  return {
    ...s,
    // 合集界面卡片:整套开关独立(设置 → 高级 → 卡片样式 → 合集界面卡片)
    hideBookmarkButton: !!s.collectionHideBookmarkButton,
    hidePageCount: !!s.collectionHideCount,
    hideReadCount: !!s.collectionHideReadCount,
    hideReadButton: !!s.collectionHideReadButton,
    hideNonTag: !!s.collectionHideNonTag,
    hideTitle: !!s.collectionHideTitle,
    hideRating: !!s.collectionHideRating,
    fillCover: !!s.collectionFillCover,
    // 二号样式(密集封面网格):同样只作用在抽屉里
    cardStyle2: !!s.collectionCardStyle2
  }
})

// 填充封面开关(设置 → 显示选项「填充封面」):开 = 封面铺满卡片、文字/按钮透明浮层
const fillCover = computed(() => !!viewSetting.value.fillCover)

// 填充布局:顶部/底部浮层是否有内容(各元素显隐由独立开关控制,互相不联动)
const fillTopShown = computed(() => {
  const s = viewSetting.value
  return !s.hideTitle || !s.hideReadCount
})
const fillRow1Shown = computed(() => {
  const s = viewSetting.value
  return filterCollectTag(props.book.tags).length > 0 || !s.hidePageCount || !s.hideReadButton || !s.hideNonTag
})
const fillFooterShown = computed(() => {
  const s = viewSetting.value
  return fillRow1Shown.value || !s.hideRating
})

// 网页版(Docker)只读账户:隐藏收藏/评分(写操作)
const viewerRole = computed(() => {
  const auth = window.__AUTH__ || {}
  return !!auth.enabled && auth.role === 'viewer'
})

const emit = defineEmits([
  'openBookDetail',
  'handleClickCover',
  'onBookContextMenu',
  'handleSearchString',
  'searchFromTag',
  'openLocalBook',
  'viewManga',
  // 阅读器:进入缩略图模式(点击页数标签)
  'viewThumbnails',
  // 可配置点击策略:封面 / 阅 / 读 / 页数(由设置「点击策略」决定进入 详细/内容/缩略图)
  'coverClick',
  'cover-dblclick',
  'yueClick',
  'duClick',
  'pageCountClick',
  // EH在线:点收藏星 → 账号收藏(由 App 处理,走 EH 的 gallerypopups.php)
  'onlineFavorite',
  // 卡片右下角的种子按钮 → 打开种子列表
  'openTorrents',
  // 长按卡片上的收藏标签 → 弹出简易标签编辑器(筛选 / 全库重命名 / 全库删除 等)
  'tagLongPress',
])

const props = defineProps({
  book: Object,
  // 这张卡是不是「合集界面」(打开合集后的底部抽屉)里的卡。
  // 是 → 用设置里「卡片样式 → 合集界面卡片」那组开关覆盖普通卡片的三项显隐;
  // 否 → 完全跟随普通「卡片样式」。
  collectionView: { type: Boolean, default: false }
})

// 在线画廊不是本地书:本地右键菜单(移动/删除/超分…)、评分写回都不能碰
const onTitleContextMenu = (e) => { onMangaTitleContextMenu(e, props.book) }
// 在线画廊不是本地书:本地右键菜单(移动/删除/超分…)、评分写回都不能碰。
// 例外:历史条目 —— 「从历史中移除」是它唯一的动作,在线画廊也要有这个入口
// 在线画廊右键也弹菜单(与本地一致);菜单项由 App 按「对在线有没有意义」挑
const onCoverContextMenu = (e) => { emit('onBookContextMenu', e, props.book) }
// 收藏星:本地书看 mark,在线画廊看账号收藏状态(favcat 0-9;null = 没收藏)
const markColor = (book) => book.online
  ? (book.favcat == null ? '#666666' : '#E6A23C')
  : (book.mark ? '#E6A23C' : '#666666')
const onMarkClick = (book) => { if (book.online) emit('onlineFavorite', book); else switchMark(book) }

// 历史模式:用原本那个角标位置显示「阅读时间」(不新增元素),像 JHenTai 的历史那样
const historyTimeText = computed(() => {
  const ts = Number(props.book?.historyTime) || 0
  if (!ts) return ''
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60) return t('m.historyJustNow')
  if (diff < 3600) return t('m.historyMinutesAgo', { n: Math.floor(diff / 60) })
  if (diff < 86400) return t('m.historyHoursAgo', { n: Math.floor(diff / 3600) })
  if (diff < 86400 * 30) return t('m.historyDaysAgo', { n: Math.floor(diff / 86400) })
  const d = new Date(ts * 1000)
  return `${d.getMonth() + 1}-${d.getDate()}`
})
// 阅读次数角标:在线画廊显示 ☁️(不是本地阅读次数),点它也不做「按次数筛选」
const onReadCountClick = () => {
  if (props.book?.online) return
  emit('handleSearchString', ':count=' + props.book.readCount)
}
const onRateChange = () => {
  if (props.book?.online) return
  // ★ 必须写回 props.book 本身:以前用 Object.assign({}, book) 造副本去保存,
  //   书架/详情里的对象还是旧评分,一重排或翻页就变回 0 —— 用户说的「评分后评分消失」。
  // eslint-disable-next-line vue/no-mutating-props -- 书架里传进来的就是 store 里的那本书,写回它评分才不会丢
  props.book.rating = Number(bookRating.value) || 0
  saveBook(props.book)
}

const bookRating = ref(props.book.rating)

watchEffect(() => {
  bookRating.value = props.book.rating
})

// ---------- 封面状态机 ----------
// 只有两个状态:**加载中(转圈)** 与 **加载失败(文字)**。
// ★ 关键(用户反复强调的):
//   · 扫描后「封面还没生成出来」是常态,不是失败 —— 这种书必须一直转圈等生成,
//     绝不能一开始(或几秒后)就写「加载失败」;
//   · 只有封面生成彻底失败(退避重试耗尽)才落成失败态;
//   · 失败态**不是终点**:后台稍后补出封面(coverPath 变化)会立刻恢复成封面。
//   · 不写书级放弃标记:翻页/滚动回来要能重新尝试,否则一本当时没生成好的书永远坏在界面上。
const coverLoading = ref(false)
const coverFailed = ref(false)
let coverFailCount = 0      // <img> 连续 error 次数
let coverGenAttempt = 0     // 封面生成尝试次数
let coverTaskToken = 0
let coverRetryTimer = null

const clearCoverRetry = () => {
  if (coverRetryTimer) { clearTimeout(coverRetryTimer); coverRetryTimer = null }
}
const stopCoverLoading = () => { coverLoading.value = false }
// 开始等封面:清掉失败态、亮起转圈
const startCoverLoading = () => {
  coverFailed.value = false
  coverLoading.value = true
}
// 生成彻底失败:收掉转圈、写「加载失败」。<img> 不卸载,后台补出来还能自己恢复
const failCover = () => {
  coverFailed.value = true
  coverLoading.value = false
}
const onCoverLoad = () => {
  coverFailCount = 0
  coverGenAttempt = 0
  clearCoverRetry()
  coverFailed.value = false
  stopCoverLoading()
  retryBookCover(props.book)
}
// 生成失败不等于坏书:大书库的封面队列很长,经常只是还没轮到。
// 退避重试若干次,全部失败才落「加载失败」。
const afterCoverEnsure = (next) => {
  clearCoverRetry()
  // 成功:coverPath 已写回,watch 会重新转圈,<img> 自己会 load
  if (next) return
  coverGenAttempt += 1
  // 3 轮生成(每轮内部还有 3 次 IPC 重试)≈ 20 秒:足够熬过「队列里还没轮到」的等待,
  // 又不会让一本真坏(压缩包损坏)的书永远转圈。慢盘排队是 Promise 挂着,不消费这里的机会。
  if (coverGenAttempt > 2) { failCover(); return }
  const delay = Math.min(1200 * coverGenAttempt, 8000)
  coverRetryTimer = setTimeout(() => {
    coverRetryTimer = null
    if (!coverFailed.value) triggerEnsureCover()
  }, delay)
}
const triggerEnsureCover = () => {
  if (coverRetryTimer) return      // 已经排着队,别层层叠加
  const token = ++coverTaskToken
  coverLoading.value = true
  coverFailed.value = false
  ensureBookCover(props.book)
    .then((next) => { if (token === coverTaskToken) afterCoverEnsure(next) })
    .catch(() => { if (token === coverTaskToken) afterCoverEnsure(null) })
}
// <img> 读不出来。绝大多数是「封面正在生成 / 刚写完还没落盘」,不是坏图 ——
// 继续转圈并让后台重做,不要立刻写「加载失败」。
const onCoverError = () => {
  // 在线画廊是远程地址,没有本地生成这回事:读不出来就是读不出来
  if (props.book?.online) { failCover(); return }
  coverFailCount += 1
  coverLoading.value = true
  coverFailed.value = false
  if (coverFailCount > 6) { failCover(); return }
  triggerEnsureCover()
}
watch(() => props.book.coverPath, (v) => {
  coverTaskToken++                 // 作废进行中的生成回调
  clearCoverRetry()
  coverFailCount = 0
  coverGenAttempt = 0
  if (v) {
    // 有地址了:不管之前失败过几次,立刻恢复成「转圈等图」
    if (props.book && props.book._coverFailed) retryBookCover(props.book)
    startCoverLoading()
    return
  }
  // 没有地址:本地书 = 封面还没生成,转圈等生成;在线画廊没有本地生成,直接算失败
  if (props.book?.online) { failCover(); return }
  startCoverLoading()
  triggerEnsureCover()
}, { immediate: true })

// 封面重新生成后文件名不变,给 src 加一个时间戳,强制浏览器重新拉图
// ★ 地址必须先经 bookImgSrc 做百分号编码:文件名里的 # / % 会让 file:// 地址失效
//   (封面文件存在却永远加载不出来,表现就是「一直转圈 / 生成失败」)
const coverSrc = computed(() => {
  const p0 = props.book && props.book.coverPath
  if (!p0) return ''
  const base = bookImgSrc(p0)
  const n = props.book._coverNonce
  if (!n) return base
  return base + (base.includes('?') ? '&' : '?') + 'r=' + n
})

// ---------- 封面单击/双击分离:双击时取消单击动作 ----------
let coverClickTimer = null
const onCoverClickOnce = (e) => {
  // 长按已弹出右键菜单:抑制其后的 click,避免又进入阅读
  if (coverLongPressed) { coverLongPressed = false; return }
  // 双击的第二击不再触发单击动作(浏览器会把 detail 设为 2)
  if (e && e.detail > 1) return
  clearTimeout(coverClickTimer)
  // 窗口略大于常见双击间隔,避免慢速双击被拆成两次单击
  coverClickTimer = setTimeout(() => emit('coverClick'), 300)
}
// ---------- 移动端:长按封面 = 右键(触发同一套上下文菜单) ----------
let coverPressTimer = null
let coverLongPressed = false
const startCoverPress = (e) => {
  const t = e && e.touches && e.touches[0]
  if (!t) return
  const x = t.clientX, y = t.clientY
  clearTimeout(coverPressTimer)
  coverPressTimer = setTimeout(() => {
    coverPressTimer = null
    coverLongPressed = true
    clearTimeout(coverClickTimer)   // 取消待触发的单击
    // 合成与右键一致的事件对象(菜单只用到 x/y)
    emit('onBookContextMenu', { x, y, clientX: x, clientY: y, preventDefault () {} }, props.book)
  }, 500)
}
const endCoverPress = () => { clearTimeout(coverPressTimer); coverPressTimer = null }   // 保留 coverLongPressed,由 onCoverClickOnce 消费
const cancelCoverPress = () => { clearTimeout(coverPressTimer); coverPressTimer = null }

const onCoverDblClick = (e) => {
  if (e && e.preventDefault) e.preventDefault()
  clearTimeout(coverClickTimer)
  coverClickTimer = null
  emit('cover-dblclick')
}

// ---------- 收藏标签:点击筛选,长按(500ms)打开简易标签编辑器 ----------
let tagPressTimer = null
let tagLongPressed = false
const startTagPress = (tag) => {
  // 在线画廊的标签不在本地库里,长按弹「标签编辑器」没有意义(而且会写库)
  if (props.book?.online) return
  tagLongPressed = false
  clearTimeout(tagPressTimer)
  tagPressTimer = setTimeout(() => {
    tagLongPressed = true
    emit('tagLongPress', { tag, book: props.book })
  }, 500)
}
const cancelTagPress = () => { clearTimeout(tagPressTimer) }
const onCollectTagClick = (tag) => {
  // 长按已触发编辑器时,抑制随后的 click 误触发筛选
  if (tagLongPressed) { tagLongPressed = false; return }
  emit('searchFromTag', tag.tag, tag.cat)
}
// 右键标签:同一份简易编辑器(方便鼠标用户)
const onCollectTagContextMenu = (e, tag) => {
  e.preventDefault()
  cancelTagPress()
  emit('tagLongPress', { tag, book: props.book })
}

const filterCollectTag = (tagObject) => {
  if (setting.value.showCollectTag) {
    const collectTag = setting.value.collectTag || []
    // 兼容:collectTag 里 cat 可能是中文显示名("角色"),而 book.tags 的键是英文("character")
    return collectTag.filter(tag => {
      const key = resolveCatKey(tag.cat)
      return tagObject[key] && tagObject[key].includes(tag.tag)
    })
  } else {
    return []
  }
}

const onMangaTitleContextMenu = (e, book) => {
  e.preventDefault()
  const items = [
    {
      id: 'copyTitle',
      label: t('c.copyTitleToClipboard'),
      onClick: () => {
        ipcRenderer.invoke('copy-text-to-clipboard', book.title_jpn || book.title)
      }
    },
    {
      id: 'copyLink',
      label: t('c.copyLinkToClipboard'),
      onClick: () => {
        ipcRenderer.invoke('copy-text-to-clipboard', book.url)
      }
    },
    {
      id: 'copyTitleAndLink',
      label: t('c.copyTitleAndLinkToClipboard'),
      onClick: () => {
        ipcRenderer.invoke('copy-text-to-clipboard', `${book.title_jpn || book.title}\n${book.url}\n`)
      }
    },
    {
      id: 'translateTitle',
      label: t('m.translateTitle'),
      onClick: async () => {
        appStore.setBookTask(book.id, 'translate')
        try {
          // ★ 必须先脱代理:book 是 pinia 里的响应式 Proxy,
          //   Electron IPC 用结构化克隆传参,克隆 Proxy 会抛 "An object could not be cloned."
          const res = await ipcRenderer.invoke('translate-book-title', JSON.parse(JSON.stringify(book)))
          if (res && res.title) printMessage('success', t('m.translateTitle') + ': ' + res.title)
          else printMessage('warning', res?.error || t('c.titleTranslationFailed'))
        } catch (err) {
          printMessage('error', String(err?.message || err))
        } finally {
          appStore.clearBookTask(book.id)
        }
      }
    },
  ].filter(item => isContextMenuItemEnabled(setting.value, 'title', item.id))
  // 全部项都被取消勾选时不弹出空白菜单
  if (items.length === 0) return
  // 顺序按「设置 → 高级 → 右键菜单」里拖动后的顺序
  ContextMenu.showContextMenu({ x: e.x, y: e.y, items: sortContextMenuItems(setting.value, 'title', items) })
}

// 卡片被移出列表(换页 / 筛掉)时把挂在 window 上的定时器清掉:
// 否则 300ms 后那个「单击封面」还会触发一次,把一本已经不在列表里的书打开
onUnmounted(() => {
  if (coverRetryTimer) { clearTimeout(coverRetryTimer); coverRetryTimer = null }
  clearTimeout(coverClickTimer)
  clearTimeout(coverPressTimer)
  clearTimeout(tagPressTimer)
})

</script>

<style lang="stylus">
.book-task-mask
  position: absolute
  inset: 0
  display: flex
  align-items: center
  justify-content: center
  background: rgba(0, 0, 0, 0.45)
  border-radius: 4px
  z-index: 8
  pointer-events: none
  .book-task-ring
    width: 44px
    height: 44px
    border: 3px solid rgba(255, 255, 255, 0.25)
    border-top-color: #fff
    border-radius: 50%
    animation: book-task-spin 0.9s linear infinite
  .book-task-progress
    position: absolute
    margin-top: 56px
    font-size: 12px
    color: #fff
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6)
  .book-task-text
    position: absolute
    font-size: 18px
    font-weight: 700
    color: #fff
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6)
@keyframes book-task-spin
  to
    transform: rotate(360deg)

.book-card
  display: inline-block
  width: var(--emm-cover-size, 220px)
  padding-bottom: 4px
  border: solid 1px var(--el-border-color)
  border-radius: 6px
  margin: var(--emm-card-gap-v, var(--emm-card-gap, 6px)) var(--emm-card-gap-h, var(--emm-card-gap, 6px))
  position: relative
  // 悬停上浮 + 阴影,更丝滑
  transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease
  &:hover
    transform: translateY(-3px)
    box-shadow: 0 8px 22px rgba(0, 0, 0, .16)
    border-color: var(--el-border-color-hover, var(--el-border-color))
  .collect-tag
    overflow-x: hidden
    margin: 0 0 0 10px
    text-align: left
    .book-collect-tag
      cursor: pointer
      margin-right: 4px
      margin-bottom: 4px
      border-width: 0
      padding-left: 4px
      padding-right: 4px
// 封面加载圈(经典/填充布局共用):覆盖封面区,加载完成或判定失败后由 v-if 收起
.cover-loading
  position: absolute
  top: 0
  left: 0
  right: 0
  bottom: 0
  display: flex
  align-items: center
  justify-content: center
  background: var(--el-fill-color-light, #f2f3f5)
  color: var(--el-text-color-secondary, #909399)
  border-radius: 6px
  pointer-events: none
// 真失败:盖一层「加载失败」。<img> 仍留在下面继续加载(不卸载),
// 后台补出封面 / 慢盘终于读完时会自己消失,不需要用户重新翻页。
.cover-failed
  position: absolute
  top: 0
  left: 0
  right: 0
  bottom: 0
  display: flex
  align-items: center
  justify-content: center
  background: var(--el-fill-color-light, #f2f3f5)
  color: var(--el-text-color-placeholder, #a8abb2)
  font-size: 13px
  line-height: 1
  border-radius: 6px
  pointer-events: none
// ★ 用双类选择器提权:后面的 .book-cover { display: block } 同特异性会把它盖掉,
//   文字就会顶到左上角而不是居中
.book-cover.book-cover-empty,
.book-cover-fill.book-cover-empty
  display: flex
  align-items: center
  justify-content: center
  background: var(--el-fill-color-light, #f2f3f5)
  color: var(--el-text-color-placeholder, #a8abb2)
  font-size: 13px
  font-weight: 400
  line-height: 1
  object-fit: initial
  user-select: none
  span
    line-height: 1
.book-title
  // 高度/字号跟着「界面缩放」一起放大(变量在普通样式下是 1)
  height: calc(36px * var(--emm-card-zoom, 1))
  overflow-y: hidden
  margin: 8px 6px
  // 跟随自定义主题的字体大小(--emm-custom-font-size 只在该主题下存在,其它主题回退 14px)
  font-size: calc(var(--emm-custom-font-size, 14px) * var(--emm-card-zoom, 1))
  cursor: pointer
  line-height: calc(18px * var(--emm-card-zoom, 1))
  // 一行、两行都居中(用户要求):
  //   内层盒子是「收缩包裹」的 —— 一行时宽度=文字宽度,外层 flex 居中;
  //   两行时撑满可用宽度,再用 text-align:center 让两行文字本身也居中
  display: flex
  align-items: center
  justify-content: center
  .book-title-inner
    max-width: 100%
    text-align: center
    display: -webkit-box
    -webkit-box-orient: vertical
    -webkit-line-clamp: 2
    overflow: hidden
    word-break: break-word
.book-card-mark, .book-card-language, .book-card-pagecount
  position: absolute
  cursor: pointer
.book-cover-frame
  position: relative
  width: calc(var(--emm-cover-size, 220px) - 20px)
  margin: 0 auto
  // 兜底:无论封面有没有生成/加载成功,封面区都占住固定高度,
  // 避免"没封面的卡片被压扁"这种形状不一致
  height: var(--emm-cover-height, calc((var(--emm-cover-size, 220px) - 20px) * 1.415))
  .book-card-language
    left: 0
    top: 0
    border-radius: 3px 0 3px 0
  .book-card-pagecount
    left: 0
    bottom: 0
    border-radius: 0 3px 0 3px
  .book-card-mark
    right: -14px
    top: -14px
.book-cover
  border-radius: 4px
  width: 100%
  // 「卡片高度」设置 → 封面高度(--emm-cover-height 由 applyCoverStyle 按 卡片高度-84px 算好)
  height: var(--emm-cover-height, calc((var(--emm-cover-size, 220px) - 20px) * 1.415))
  object-fit: cover
  display: block
.book-card-footer
  min-height: 26px
  padding-top: 4px
// 纯图片模式:封面铺满卡片,不再有"图片套小框"的错位感
.book-card.cover-only
  padding: 0
  .book-cover-frame
    width: calc(var(--emm-cover-size, 220px) - 2px)
    .book-cover
      height: var(--emm-card-height, calc((var(--emm-cover-size, 220px) - 2px) * 1.415))
      border-radius: 5px
  .book-card-mark, .book-card-language, .book-card-pagecount, .book-title, .book-card-footer, .collect-tag
    display: none
.outer-read-button-group
  margin: 0 6px
.outer-read-button:first-child
  padding: 0 0 0 6px
.outer-read-button + .outer-read-button
  padding: 0 6px 0 0
.book-status-tag
  padding: 0 2px
  margin-right: 6px
  cursor: pointer
  min-width: 56px
.el-rate
  display: inline-block
  height: 18px

// ============ 填充封面布局(设置「填充封面」打开后;经典布局不受影响) ============
// 封面铺满整卡,所有信息为透明浮层(无白底块),上/下缘黑色渐变兜底保证可读
.book-card.fill-cover
  // 高度来自「卡片高度」设置
  height: var(--emm-card-height, calc(var(--emm-cover-size, 220px) * 1.5 + 36px))
  padding: 0
  overflow: hidden
  background: #2b2d31
  border-radius: 8px
  .book-cover-fill
    // 封面放大铺满卡片框,再居中放大 ~15%:旧封面文件自带的深色边缘(黑边)
    // 会被推出画面裁掉,避免"内容小 + 四周黑"的观感
    position: absolute
    top: 0
    left: 0
    width: 100%
    height: 100%
    object-fit: cover
    display: block
    transform: scale(1.15)
    // 失败占位要恢复成弹性居中:上面那条 display: block 比 .book-cover-empty 的
    // flex 优先级高(3 个类 vs 2 个类),不在这里补回来文字会跑到卡片左上角
    &.book-cover-empty
      display: flex
      align-items: center
      justify-content: center
  // 顶部浮层:阅读数角标 + 标题 + 收藏按钮同一行。
  // 标题始终在"角标 ~ 收藏按钮"之间的可用区居中;任一侧隐藏,标题自动伸展填补空位
  .fill-top
    position: absolute
    top: 0
    left: 0
    right: 0
    z-index: 2
    display: flex
    align-items: flex-start
    gap: 6px
    padding: 6px 8px 18px
    background: linear-gradient(180deg, rgba(0, 0, 0, .55), rgba(0, 0, 0, 0))
    pointer-events: none
    // 阅读数角标(左上,随开关显隐)
    .fill-badge
      flex: 0 0 auto
      pointer-events: auto
      margin-top: 1px
    .fill-title
      flex: 1 1 auto
      min-width: 0
      margin: 0
      color: #fff
      font-size: calc(var(--emm-custom-font-size, 14px) - 1px)
      line-height: 1.4
      cursor: pointer
      text-shadow: 0 1px 2px rgba(0, 0, 0, .85)
      pointer-events: auto
      display: flex
      align-items: center
      justify-content: center
      .fill-title-inner
        max-width: 100%
        text-align: center
        display: -webkit-box
        -webkit-box-orient: vertical
        -webkit-line-clamp: 2
        overflow: hidden
        word-break: break-all
      &:hover
        color: #ffd04b
    // 收藏按钮(右上,随开关显隐;与角标、标题同一行)
    .fill-mark
      flex: 0 0 auto
      pointer-events: auto
      cursor: pointer
      padding: 2px
      margin-top: 1px
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .8))
      transition: transform .15s ease
      &:hover
        transform: scale(1.15)
  // 底部浮层
  .fill-footer
    position: absolute
    bottom: 0
    left: 0
    right: 0
    z-index: 2
    padding: 18px 6px 6px
    background: linear-gradient(0deg, rgba(0, 0, 0, .6) 0%, rgba(0, 0, 0, .35) 55%, rgba(0, 0, 0, 0) 100%)
    .footer-row
      display: flex
      flex-wrap: wrap
      justify-content: center
      align-items: center
      gap: 4px 5px
      // 元素尽可能挤在一排;放不下自动换行,换出的行居中
  // 透明徽标(阅读数/页数/状态):半透明黑底 + 白字,无白底
  .fill-badge
    flex: 0 0 auto
    cursor: pointer
    background: rgba(0, 0, 0, .36) !important
    border: 1px solid rgba(255, 255, 255, .28) !important
    color: #fff !important
    font-weight: 600
    border-radius: 4px
    padding: 0 5px
    height: 20px
    line-height: 18px
    box-shadow: none
    text-shadow: 0 1px 1px rgba(0, 0, 0, .5)
    &:hover
      background: rgba(255, 255, 255, .25) !important
  // 收藏标签:保留自定义彩色信息色
  .book-collect-tag
    flex: 0 0 auto
    cursor: pointer
    border-width: 0
    opacity: .94
    box-shadow: 0 1px 3px rgba(0, 0, 0, .35)
  // 阅/读按钮:透明浮层(无白底)
  .outer-read-button-group
    flex: 0 0 auto
    .el-button.is-plain
      background: rgba(0, 0, 0, .22)
      border-color: rgba(255, 255, 255, .65)
      color: #fff
      text-shadow: 0 1px 1px rgba(0, 0, 0, .6)
      &:hover
        background: rgba(255, 255, 255, .3)
        border-color: #fff
    .outer-read-button:first-child
      padding: 0 0 0 6px
    .outer-read-button + .outer-read-button
      padding: 0 6px 0 0
  // 评分:透明,未选星半透明白,选中保持金色
  .el-rate
    height: 22px
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, .7))
    .el-rate__item
      color: rgba(255, 255, 255, .8)
      cursor: pointer
    .el-rate__icon.is-active
      color: #f7ba2a
    &.is-disabled .el-rate__item
      color: rgba(255, 255, 255, .55)
      cursor: auto
// 「种子」按钮:挂在卡片框的右下角(用用户给的藤蔓图,只有确实有种子才出现)
.book-card-torrent
  position: absolute
  right: -6px
  bottom: -6px
  z-index: 4
  padding: 0
  border: none
  background: transparent
  cursor: pointer
  line-height: 0
  opacity: .95
  img
    width: 34px
    height: 40px
    object-fit: contain
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .3))
  &:hover
    opacity: 1
    transform: scale(1.08)

// ---------- 二号样式(设置 → 高级 → 卡片样式 → 二号样式) ----------
// 版式照「合集界面 → 添加漫画」的选择弹窗:封面在上(圆角、铺满整格)、标题在下(左对齐、最多两行),
// 没有卡片边框/底色/角标/按钮/评分/标签。点击仍走标题/封面的点击策略,标题显隐仍由「隐藏标题」控制。
// ⚠ 选择器不绑定 .book-card-list:合集抽屉(setting.collectionCardStyle2)用的是另一套容器,
//   它也会挂 .card-style-2。
.card-style-2
  .book-card
    padding: 0
    border: none
    border-radius: 4px
    background: transparent
    box-shadow: none
    &:hover
      transform: none
      box-shadow: none
    .book-card-footer,
    .collect-tag,
    .book-card-pagecount,
    .book-card-language,
    .book-card-mark,
    .book-card-torrent,
    .book-collection-tag,
    .fill-footer,
    .fill-top .fill-badge,
    .fill-top .fill-mark
      display: none !important
    // 经典布局:封面在前、标题在后(与「添加漫画」的卡片一致)
    &:not(.fill-cover)
      display: flex
      flex-direction: column
      .book-cover-frame
        order: 1
        width: 100%
        margin: 0
      .book-cover
        height: 100%
        border-radius: 4px
      .book-title
        order: 2
        display: block
        height: auto
        max-height: 2.75em
        margin: 4px 0 0
        padding: 0
        font-size: calc(12px * var(--emm-card-zoom, 1))
        line-height: 1.35
        text-align: left
        .book-title-inner
          display: -webkit-box
          -webkit-line-clamp: 2
          -webkit-box-orient: vertical
          overflow: hidden
          text-align: left
          max-width: 100%
    // 填充封面:保留标题浮层,字号与上面一致
    &.fill-cover .fill-title
      font-size: calc(12px * var(--emm-card-zoom, 1))
</style>