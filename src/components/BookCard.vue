<template>
  <div class="book-card"
    :class="{'fill-cover': fillCover, 'style-3': isStyle3, 'compact': isStyle3 && style3Compact, 'is-selected': isStyle3 && style3Selected}"
    :role="isStyle3 ? 'listitem' : undefined"
    :aria-label="isStyle3 ? style3AriaLabel : undefined"
  >
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
    <!-- ================= 三号样式:条状列表 =================
         参考「下载记录」的一行:左小封面 + 右信息(标题 / 标签 / 页数·评分)。
         卡片本身变成横向条状,由主界面的网格列数自适应排布。 -->
    <template v-if="isStyle3">
      <div class="strip-cover" :title="getDisplayTitle(book)" @click="onCoverClickOnce" @contextmenu="onCoverContextMenu($event)">
        <img v-if="coverSrc" class="strip-cover-img" :src="coverSrc" alt="" loading="lazy" decoding="async" @load="onCoverLoad" @error="onCoverError" />
        <div v-else class="strip-cover-img strip-cover-empty"></div>
        <div class="cover-loading" v-if="coverLoading"><el-icon class="is-loading" :size="18"><Loading /></el-icon></div>
      </div>
      <div class="strip-body">
        <!-- 标题行:+N 常占位(只改透明度),hover / 键盘焦点才淡入,标题省略号不跳 -->
        <div class="strip-title-line">
          <p class="strip-title" v-if="!viewSetting.hideTitle" :title="getDisplayTitle(book)"
            @click="$emit('titleClick')" @contextmenu="onTitleContextMenu($event)"
          >{{ getDisplayTitle(book) }}</p>
          <span v-if="!style3Compact && viewSetting.showTags" class="strip-more" :class="{ 'is-empty': !style3TagOverflow }"
            :aria-hidden="style3TagOverflow ? undefined : 'true'"
          >{{ style3TagOverflow ? '+' + style3TagOverflow : '' }}</span>
        </div>
        <!-- 标准档标签行:
             · 类别标签(如「同人誌/漢化」)受「隐藏类别」hideNonTag 控制
             · 画廊标签(如「其他/汉语/翻译/单女主…」)受独立的「显示标签」showTags 控制,
               一行显示多个、超出收成 +N(参考图2)
             · 紧凑档整行不渲染(档位只看行高设置值,与 zoom 无关) -->
        <div class="strip-tags" v-if="!style3Compact && (!viewSetting.hideNonTag || style3GalleryTags.length)">
          <el-tag v-if="!viewSetting.hideNonTag && (book.category || book.status)" class="strip-tag is-cat" size="small" effect="plain"
            :title="book.status"
            @click="$emit('searchFromTag', book.category || book.status, book.category ? 'category' : '')"
          >{{ book.site === 'wnacg' ? (wnacgCategoryText(book) || book.status) : (galleryCategoryName(book.category, $t) || book.status) }}</el-tag>
          <el-tag
            v-for="(t, ti) in style3GalleryTags" :key="t.cat + '::' + t.tag + ti"
            class="strip-tag" size="small" effect="plain"
            :title="t.cat + ':' + t.tag"
            @click="$emit('searchFromTag', t.tag, t.cat)"
          >{{ t.name }}</el-tag>
        </div>
        <div class="strip-meta">
          <span v-if="!viewSetting.hidePageCount" class="strip-meta-item is-pagecount" @click="$emit('pageCountClick')">{{ book.pageCount }}P</span>
          <template v-if="!style3Compact">
            <span class="strip-meta-dot" aria-hidden="true">·</span>
            <span v-if="book.historyTime || !viewSetting.hideReadCount" class="strip-meta-item is-time" :title="style3TimeTitle" @click="onReadCountClick">
              {{ book.historyTime ? historyTimeText : (book.online ? languageBadgeText(book) : book.readCount) }}
            </span>
            <span class="strip-meta-dot" aria-hidden="true">·</span>
            <!-- 只显示星星,不显示 Surprise/Excellent 等评分文字(需求:去掉评分单词) -->
            <el-rate v-if="!viewSetting.hideRating && book.site !== 'wnacg'" v-model="bookRating" size="small" allow-half :disabled="viewerRole || !!book.online" @change="onRateChange" />
          </template>
        </div>
      </div>
      <!-- 固定操作列:阅/读,与封面、正文同级,宽度固定不随内容伸缩 -->
      <el-button-group v-if="!viewSetting.hideReadButton" class="strip-actions">
        <el-button type="success" size="small" plain @click.stop="$emit('yueClick')">{{$t('m.re')}}</el-button>
        <el-button type="success" size="small" plain @click.stop="$emit('duClick')">{{$t('m.ad')}}</el-button>
      </el-button-group>
    </template>
    <!-- ================= 经典卡片布局(默认;原版布局原样保留) ================= -->
    <template v-else-if="!fillCover">
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
      <!-- ★ loading="lazy" + decoding="async" 必须有:
           在线书架每次翻页都会整体重建 bookList(applyOnlineList),所有卡片重新挂载。
           没有 lazy 时,42 张封面会**同时**发起请求 —— 而服务端图片并发只有 12 槽,
           于是排长队:界面先全部转圈、等槽陆续空出来再一次性涌出,伴随明显卡顿。
           加了 lazy 后浏览器只加载视口内的(通常 8-12 张),队列压力立刻降下来。 -->
      <img
        v-if="coverSrc"
        class="book-cover"
        :src="coverSrc"
        alt=""
        loading="lazy"
        decoding="async"
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
      <el-tag class="book-card-language" size="small" v-if="(book.historyTime || !viewSetting.hideReadCount) && !(book.site === 'wnacg' && !languageBadgeText(book))"
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
      >{{ (book.site === 'wnacg' ? '' : tagDisplayPrefix(setting, resolvedTranslation, tag.cat, tag.tag) + ':') + tagDisplayName(setting, resolvedTranslation, resolveCatKey(tag.cat), tag.tag) }}</el-tag>
    </div>
    <div class="book-card-footer">
      <el-button-group class="outer-read-button-group" v-if="!viewSetting.hideReadButton">
        <el-button type="success" size="small" class="outer-read-button" plain @click="$emit('yueClick')">{{$t('m.re')}}</el-button>
        <el-button type="success" size="small" class="outer-read-button" plain @click="$emit('duClick')">{{$t('m.ad')}}</el-button>
      </el-button-group>
      <!-- 这个「标签」格:有类别就显示所属类别(如 Misc / Western),没有才显示 tagged / non-tag 状态;悬停可看真实状态 -->
      <!-- ★ 以前的条件是 !(wnacg && !category):绅士漫画只要 category 为空就**整块不渲染**。
           而「杂志&短篇」这类书的 category 按规则被置空了(用户要求分类不保留),
           于是它们的标签格彻底消失,看起来就像「加载不完全」。
           现在改成:@wnacgCategoryText 有内容就显示(它会回退到 fullCategory 站点原文),
           实在什么都没有才退回 status。 -->
      <el-tag
        v-if="!viewSetting.hideNonTag && (book.site !== 'wnacg' || !!wnacgCategoryText(book) || !!book.status)"
        class="book-status-tag"
        effect="plain"
        :type="book.status === 'non-tag' ? 'info' : book.status === 'tagged' ? 'success' : 'warning'"
        :title="book.status"
        @click="$emit('searchFromTag', book.category || book.status, book.category ? 'category' : '')"
      >{{ book.site === 'wnacg' ? (wnacgCategoryText(book) || book.status) : (galleryCategoryName(book.category, $t) || book.status) }}</el-tag>
      <!-- 绅士漫画的合集:在「同人志」右边单独标一个「合集」(用户要求)。
           站点分类是 同人誌／漢化／合集,只看第一段会把这个信息丢掉。 -->
      <el-tag
        v-if="!viewSetting.hideNonTag && book.site === 'wnacg' && book.isSeries"
        class="book-status-tag book-series-tag"
        effect="plain"
        type="warning"
        :title="$t('m.seriesBadge')"
      >{{ $t('m.seriesBadge') }}</el-tag>
      <el-rate v-if="!viewSetting.hideRating && book.site !== 'wnacg'" v-model="bookRating" size="small" allow-half :disabled="viewerRole || !!book.online" @change="onRateChange"/>
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
        loading="lazy"
        decoding="async"
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
      <!-- ★ 二号样式(填充封面)的右上角角标区:
           以前这里只有「阅读数」,用户要求把**收藏标签**也放到右上角,
           而且不跟底部的页数/阅读按钮挤在一起。
           现在右上角是:收藏标签(前几个,超出的折叠成 +N)+ 阅读数角标。
           底部那一行仍然保留(页数/阅·读/分类),两边互不遮挡。 -->
      <div class="fill-top" v-if="fillTopShown || (!viewSetting.hideBookmarkButton && !viewerRole)">
        <!-- 右上角类别标签(参考图1:同人誌／漢化),受「隐藏类别」控制 -->
        <el-tag v-if="fillCatText" class="fill-cat-tag" size="small" effect="dark" :title="fillCatText">{{ fillCatText }}</el-tag>
        <div class="fill-top-tags" v-if="fillTopTags.length">
          <el-tag
            v-for="tag in fillTopTags" :key="tag.id"
            class="book-collect-tag fill-top-tag"
            :color="tag.color"
            size="small"
            effect="dark"
            :title="tag.letter + ':' + tagDisplayName(setting, resolvedTranslation, resolveCatKey(tag.cat), tag.tag)"
            @click.stop="onCollectTagClick(tag)"
            @mousedown="startTagPress(tag)"
            @mouseup="cancelTagPress"
            @mouseleave="cancelTagPress"
            @touchstart.passive="startTagPress(tag)"
            @touchend="cancelTagPress"
            @touchmove.passive="cancelTagPress"
            @contextmenu="onCollectTagContextMenu($event, tag)"
          >{{tag.letter}}:{{ tagDisplayName(setting, resolvedTranslation, resolveCatKey(tag.cat), tag.tag) }}</el-tag>
          <el-tag v-if="fillTopTagsOverflow > 0" class="fill-badge fill-top-tag" size="small" effect="plain"
            :title="'+' + fillTopTagsOverflow">+{{ fillTopTagsOverflow }}</el-tag>
        </div>
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
          >{{ book.site === 'wnacg' ? (wnacgCategoryText(book) || book.status) : (galleryCategoryName(book.category, $t) || book.status) }}</el-tag>
          <!-- 填充封面布局里的「合集」标记 -->
          <el-tag
            v-if="!viewSetting.hideNonTag && book.site === 'wnacg' && book.isSeries"
            class="fill-badge book-series-tag"
            type="warning"
            :title="$t('m.seriesBadge')"
          >{{ $t('m.seriesBadge') }}</el-tag>
          <el-rate v-if="!viewSetting.hideRating && book.site !== 'wnacg'" v-model="bookRating" size="small" allow-half :disabled="viewerRole || !!book.online" @change="onRateChange"/>
        </div>
      </div>
      <!-- 图片数量 + 添加时间(参考图1「26张图片，创建于2026-11-23」)。
           独立于 fill-footer,二号样式隐藏 fill-footer 时这行仍可见。 -->
      <div class="fill-counttime" v-if="fillCountTimeText">{{ fillCountTimeText }}</div>
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
import { ehProxyImageSrc } from '../ehOnline.js'
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
// 绅士漫画的分类角标。
// ★ 卡片显示**保持原样**:完整分类(如「单行本/汉化」)一个标签显示完。
//   分类拆分只用于「下载时获取标签」那条链路(写进库的 category / language 字段),
//   UI 上不要再拆成两个标签(用户明确要求改回去)。
const wnacgCategoryText = (book) => {
  if (!book || book.site !== 'wnacg') return ''
  // ★ 卡片显示**必须优先 fullCategory(站点原始角标)**:
  //   「同人志／汉化」「单行本／汉化」「杂志&短篇／汉化」—— 一个标签看全。
  //   分类拆分(category=同人志 / language=chinese)只用于**下载获取标签时写库**,
  //   不是给卡片显示用的(用户明确要求:卡片保持原样)。
  //   ⚠ 之前我为了修「category 为空时整块标签消失」,把优先级改成了
  //      category || fullCategory —— 结果所有卡片都只剩「同人志」,把「／汉化」丢了。
  //      正确的修法是:保持 fullCategory 优先,只在它也为空时才回退 category。
  const raw = String(book.fullCategory || book.category || '').trim()
  if (!raw) return ''
  return raw.replace(/\s*／\s*/g, '/').replace(/\s*\/\s*/g, '/')
}
const languageBadgeText = (book) => {
  // 绅士漫画:汉化→汉,日语→日,English→英,其余分类没有语言,角标直接不显示
  if (book && book.site === 'wnacg') {
    return { han: '汉', ja: '日', en: '英' }[book.wnacgLang] || ''
  }
  const code = onlineLanguageCode(book) || 'EH'
  if (String(locale.value || '').toLowerCase().startsWith('zh')) return LANG_ZH_CHAR[code] || code
  return code
}

// 卡片实际生效的开关。新旧字段都可能存在(升级过程),缺失时回落到上一代同名字段。
const pickHide = (v, fallback) => (v === undefined || v === null ? !!fallback : !!v)

// 卡片实际生效的开关:
//   · 主书架 → 主界面卡片样式;三号有专属 style3Hide* 字段
//   · 合集界面(底部抽屉)→ 完全独立的一套三选一 + 同款显隐字段
//     ★ collectionCardStyleEnabled 只保留字段,不再是渲染守卫
const viewSetting = computed(() => {
  const s = setting.value
  // ---------- 主界面:二号 / 三号各有自己的显隐;一号沿用原 hide* ----------
  if (!props.collectionView) {
    // 二号:自己的开关(隐藏标题 / 隐藏类别 / 填充封面),不能跟着一号的 hideTitle/fillCover 走
    if (s.cardStyle2) {
      return {
        ...s,
        hideTitle: pickHide(s.style2HideTitle, s.hideTitle),
        hideNonTag: pickHide(s.style2HideNonTag, s.hideNonTag),
        fillCover: pickHide(s.style2FillCover, s.fillCover)
      }
    }
    // 三号:专属 style3Hide*;收藏标签由独立开关 showTags 控制(与「隐藏类别」分开)
    if (s.cardStyle3) {
      return {
        ...s,
        hideTitle: pickHide(s.style3HideTitle, s.hideTitle),
        hideNonTag: pickHide(s.style3HideNonTag, s.hideNonTag),
        hideRating: pickHide(s.style3HideRating, s.hideRating),
        hidePageCount: pickHide(s.style3HidePageCount, s.hidePageCount),
        hideReadCount: pickHide(s.style3HideReadCount, s.hideReadCount),
        hideReadButton: pickHide(s.style3HideReadButton, s.hideReadButton),
        showTags: pickHide(s.style3ShowTags, true)
      }
    }
    return s
  }
  // ---------- 合集抽屉:合集自己的三选一 ----------
  const mode = s.collectionCardStyle3 ? 3 : (s.collectionCardStyle2 ? 2 : 1)
  const hidden = (v3, v2, v1) => (mode === 3 ? pickHide(v3, v1) : (mode === 2 ? pickHide(v2, v1) : !!v1))
  return {
    ...s,
    // 决定根节点走 style-3 / fill-cover / 经典哪条分支
    cardStyle3: mode === 3,
    cardStyle2: mode === 2,
    // 三号有自己的条状布局,永不走填充封面
    fillCover: mode === 3 ? false : (mode === 2 ? pickHide(s.collectionStyle2FillCover, s.collectionFillCover) : !!s.collectionFillCover),
    hideBookmarkButton: !!s.collectionHideBookmarkButton,
    hideTitle: hidden(s.collectionStyle3HideTitle, s.collectionStyle2HideTitle, s.collectionHideTitle),
    hideNonTag: hidden(s.collectionStyle3HideNonTag, s.collectionStyle2HideNonTag, s.collectionHideNonTag),
    hideRating: hidden(s.collectionStyle3HideRating, undefined, s.collectionHideRating),
    hidePageCount: hidden(s.collectionStyle3HidePageCount, undefined, s.collectionHideCount),
    hideReadCount: hidden(s.collectionStyle3HideReadCount, undefined, s.collectionHideReadCount),
    hideReadButton: hidden(s.collectionStyle3HideReadButton, undefined, s.collectionHideReadButton),
    showTags: hidden(s.collectionStyle3ShowTags, undefined, true)
  }
})

// 三号样式(条状列表):设置里选了「三号」时整个卡片换成长条布局。
// 它是三选一(与一/二号互斥),所以这里只要看 cardStyle3。
const isStyle3 = computed(() => !!viewSetting.value.cardStyle3)
// 填充封面开关(设置 → 显示选项「填充封面」):开 = 封面铺满卡片、文字/按钮透明浮层
// ★ 三号样式下不参与判断(它有自己的布局),避免两套模板同时命中。
const fillCover = computed(() => !isStyle3.value && !!viewSetting.value.fillCover)

// ---------- 三号双档:判据只看「行高设置值」,与缩放无关 ----------
// 拖缩放滑杆只改大小、不改信息量 —— 行数不会突然多一行或少一行。
const firstPositive = (v, fallback) => (Number(v) > 0 ? Number(v) : fallback)
const style3RowSetting = computed(() => {
  const s = viewSetting.value
  // 合集抽屉里的三号用合集自己的行高设置;主界面用主界面的
  if (props.collectionView && s.collectionCardStyle3) return firstPositive(s.collectionStyle3RowHeight, 96)
  return firstPositive(s.style3RowHeight, 96)
})
const style3Compact = computed(() => style3RowSetting.value < 88)
// ---------- 三号「显示标签」:展示画廊自身的标签(参考图2:其他/汉语/翻译/单女主…) ----------
// ★ 以前这里只渲染 filterCollectTag(用户自定义的「收藏标签」):没配置收藏标签就是空数组,
//   于是「显示标签」开关开了也什么都看不到 —— 用户说的「就加了个开关,功能根本没有」。
//   现在改为展平 book.tags(画廊自带标签),与标签设置里的语言/翻译一致。
const STYLE3_STANDARD_TAG_LIMIT = 12
const style3GalleryTags = computed(() => {
  if (style3Compact.value || !viewSetting.value.showTags) return []
  const tags = props.book && props.book.tags
  if (!tags || typeof tags !== 'object') return []
  const out = []
  for (const [cat, arr] of Object.entries(tags)) {
    if (!Array.isArray(arr)) continue
    for (const name of arr) {
      if (!name) continue
      out.push({
        cat,
        tag: name,
        name: tagDisplayName(setting.value, resolvedTranslation.value, resolveCatKey(cat), name)
      })
      if (out.length >= STYLE3_STANDARD_TAG_LIMIT) return out
    }
  }
  return out
})
const style3TagOverflow = computed(() => {
  if (style3Compact.value || !viewSetting.value.showTags) return 0
  const tags = props.book && props.book.tags
  if (!tags || typeof tags !== 'object') return 0
  let total = 0
  for (const arr of Object.values(tags)) if (Array.isArray(arr)) total += arr.length
  return Math.max(0, total - STYLE3_STANDARD_TAG_LIMIT)
})
// 完整时间只进 title,可见文案走 historyTimeText 的短格式(3天前 / 12-31)
const style3TimeTitle = computed(() => {
  const ts = Number(props.book && props.book.historyTime) || 0
  return ts ? new Date(ts * 1000).toLocaleString() : ''
})
// role=listitem 的 aria-label 必须与可见信息一致:紧凑档不读标签/时间/评分
const style3AriaLabel = computed(() => {
  const b = props.book || {}
  const s = viewSetting.value
  const parts = [getDisplayTitle(b)]
  if (!s.hidePageCount && b.pageCount != null) parts.push(b.pageCount + 'P')
  if (!style3Compact.value) {
    if (b.historyTime) parts.push(historyTimeText.value)
    else if (!s.hideReadCount) parts.push(String(b.readCount == null ? '' : b.readCount))
    if (!s.hideRating && b.site !== 'wnacg' && b.rating != null) parts.push('评分 ' + b.rating)
  }
  return parts.filter(Boolean).join('，')
})

// 二号样式右上角的「类别」标签(参考图1:同人誌／漢化)。
// ★ 只在「二号样式」出现 —— 一号的填充封面不显示,避免污染一号观感。
// ★ 受二号自己的「隐藏类别」开关 style2HideNonTag 控制(一/三号各有各的,互不影响)。
// 注意:这与「收藏标签」是两回事 —— 类别取 category/status,收藏标签取 book.tags。
const fillCatText = computed(() => {
  const s = viewSetting.value
  if (!s.cardStyle2) return ''
  if (s.hideNonTag) return ''
  const b = props.book || {}
  return b.site === 'wnacg'
    ? (wnacgCategoryText(b) || b.status || '')
    : (galleryCategoryName(b.category, t) || b.status || '')
})
// 填充封面底部的「图片数量 + 添加时间」一行(参考图1:26张图片,创建于2026-11-23)。
// 图片数受 hidePageCount 控制,添加时间取 mtime/date/posted,格式化成 YYYY-MM-DD。
const bookAddedDate = computed(() => {
  const b = props.book || {}
  const raw = b.mtime || b.date || b.posted
  if (!raw) return ''
  const d = new Date(raw)
  if (isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
})
const fillCountTimeText = computed(() => {
  const s = viewSetting.value
  // 参考图1是二号样式(填充封面):它的 fill-footer 被 CSS 隐藏,这条信息独占底部。
  // 一号填充封面仍用原 fill-footer(里面已有页数),不显示这条以免重叠。
  if (!s.cardStyle2 || !fillCover.value) return ''
  const count = (!s.hidePageCount && props.book?.pageCount != null) ? props.book.pageCount : null
  const date = bookAddedDate.value
  if (count != null && date) return t('m.imageCountDate', { n: count, date })
  if (count != null) return `${count} ${t('m.pageCount')}`
  return date
})

// 填充布局:顶部/底部浮层是否有内容(各元素显隐由独立开关控制,互相不联动)
const fillTopShown = computed(() => {
  const s = viewSetting.value
  return !s.hideTitle || !s.hideReadCount || !!fillCatText.value
})
const fillRow1Shown = computed(() => {
  const s = viewSetting.value
  return filterCollectTag(props.book.tags).length > 0 || !s.hidePageCount || !s.hideReadButton || !s.hideNonTag
})
const fillFooterShown = computed(() => {
  const s = viewSetting.value
  return fillRow1Shown.value || !s.hideRating
})

// 二号样式右上角的收藏标签(用户要求:右上角也要能看到标签)。
// 卡片很窄,塞太多会盖住封面 —— 最多显示 3 个,其余折成 +N。
const FILL_TOP_TAG_MAX = 3
const fillTopTags = computed(() => {
  if (!fillCover.value) return []
  const all = filterCollectTag(props.book.tags)
  return all.slice(0, FILL_TOP_TAG_MAX)
})
const fillTopTagsOverflow = computed(() => {
  if (!fillCover.value) return 0
  return Math.max(0, filterCollectTag(props.book.tags).length - FILL_TOP_TAG_MAX)
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
  // 是 → 用「合集界面卡片」那套独立配置;否 → 用主界面卡片配置。
  collectionView: { type: Boolean, default: false },
  // 三号三态里的「选中」:可由外部传入,也识别 book 上的 selected / isSelected 标记。
  // 只影响视觉(主色浅底 + 3px 左条),不位移、不改布局。
  selected: { type: Boolean, default: false }
})
const style3Selected = computed(() => !!props.selected || !!(props.book && (props.book.selected || props.book.isSelected)))

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
// 封面是否已从「直连图床」退回「应用自己的代理」。
// 为什么需要:ehImageSrc 对 EH 域名给的是直连地址,直连依赖主进程给 session 配的代理 +
// ehgt.org 的 Referer 兜底 —— 任何一环没生效,书架就是一整墙空白。封面不像页预览那样
// 有逐格回退,所以这里补一次:第一次直连失败就换回「慢但一定出图」的老路径。
// 换书 / coverPath 变化时复位(见下方 watch),否则一本书的失败会污染后面所有的书。
const coverViaProxy = ref(false)
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
// 「这个封面地址值得换代理再试一次」的判定:EH 系图床全算。
// ⚠ 这里**故意比** ehOnline.js 的直连白名单多一个 exhentai.org:ehImageSrc 已经不会把
//   exhentai 交给直连了(那域要登录 Cookie),但万一遇到裸的 exhentai 地址(老数据/其它入口),
//   「切代理」正是我们想要的兜底 —— 少判这一条只会让那张图一直直连失败到判死。
const EH_COVER_HOST_RE = /^https?:\/\/([^/]+\.)?(hath\.network|ehgt\.org|e-hentai\.org|exhentai\.org)(:\d+)?\//i
// <img> 读不出来。绝大多数是「封面正在生成 / 刚写完还没落盘」,不是坏图 ——
// 继续转圈并让后台重做,不要立刻写「加载失败」。
const onCoverError = () => {
  // ★ 直连图床失败:先退回代理地址重试一次,别急着烧重试次数。
  //   必须放在下面所有计数之前 —— 否则直连被拒时会一路数到「加载失败」,
  //   而其实换成 emm-eh:// 就能出图(封面没有别的兜底,判死就是一格空白)。
  //   只在「当前确实是直连的 EH 地址」时才切,本地封面(file://)与 wnacg 图床不受影响。
  if (!coverViaProxy.value && EH_COVER_HOST_RE.test(String((props.book && props.book.coverPath) || ''))) {
    coverViaProxy.value = true
    coverLoading.value = true
    coverFailed.value = false
    return
  }
  // 在线画廊封面走 emm-eh:// 由主进程带 Cookie/代理去取,EH 节点抖动、
  // 限速、keystamp 过期都会让第一次请求失败 —— 这不是「封面坏了」。
  // 以前这里一次 error 就直接判死,表现就是「一进在线画廊,满屏加载失败」。
  // 现在换 nonce 重拉,最多 4 次,间隔递增;全失败才写「加载失败」。
  if (props.book?.online) {
    coverFailCount += 1
    if (coverFailCount > 4) { failCover(); return }
    coverLoading.value = true
    coverFailed.value = false
    const delay = Math.min(900 * coverFailCount, 4000)
    clearCoverRetry()
    coverRetryTimer = setTimeout(() => {
      coverRetryTimer = null
      if (!props.book || coverFailed.value) return
      // 换 nonce 让 coverSrc 变,Chromium 才会真的重新请求(同 URL 会直接吃缓存里的失败)
      // eslint-disable-next-line vue/no-mutating-props
      props.book._coverNonce = Date.now() + coverFailCount
      coverLoading.value = true
    }, delay)
    return
  }
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
  // 换书 / 换封面:回退标记必须复位 —— 否则上一本「直连失败过」会让这本一上来就走代理,
  // 或者新地址明明能直连却一直在用老路径(每本书都要自己重新判断一次)
  coverViaProxy.value = false
  if (v) {
    // 有地址了:不管之前失败过几次,立刻恢复成「转圈等图」
    if (props.book && props.book._coverFailed) retryBookCover(props.book)
    startCoverLoading()
    return
  }
  // 没有地址:本地书 = 封面还没生成,转圈等生成。
  // 在线书:列表页解析偶尔拿不到缩略图地址(懒加载 data-src 缺失),先转圈等 6 秒,
  //   仍然没有才判失败 —— 「一进来就加载失败」多半就是这里立刻判死造成的。
  if (props.book?.online) {
    startCoverLoading()
    clearCoverRetry()
    coverRetryTimer = setTimeout(() => {
      coverRetryTimer = null
      if (!props.book || props.book.coverPath) return
      failCover()
    }, 6000)
    return
  }
  startCoverLoading()
  triggerEnsureCover()
}, { immediate: true })

// 封面重新生成后文件名不变,给 src 加一个时间戳,强制浏览器重新拉图
// ★ 地址必须先经 bookImgSrc 做百分号编码:文件名里的 # / % 会让 file:// 地址失效
//   (封面文件存在却永远加载不出来,表现就是「一直转圈 / 生成失败」)
const coverSrc = computed(() => {
  const p0 = props.book && props.book.coverPath
  if (!p0) return ''
  let base = bookImgSrc(p0)
  const n = props.book._coverNonce
  if (n) base += (base.includes('?') ? '&' : '?') + 'r=' + n
  // 直连失败过一次 → 换成应用自己的代理地址。nonce 要先加在「原地址」上:
  // emm-eh:// 的缓存键就是 u 里的地址,nonce 进 u 才能真正绕开上一次的失败缓存。
  // 已经是 emm-eh:// / file:// / /api/file 的非 http 地址,ehProxyImageSrc 会原样返回,不会二次包装。
  return coverViaProxy.value ? ehProxyImageSrc(base) : base
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
  // 统一用 border-box:设置的宽高就是卡片外框尺寸,border/padding 计入其中。
  // 修复「填充封面」开关切换时卡片尺寸跳变(经典布局外框 ≈ cardHeight,而填充封面
  // 过去 content-box 下是 cardHeight + 2px border,两者不一致)。
  box-sizing: border-box
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
    // 阅读数角标(随开关显隐)。
    // 加了右上角标签区之后,这个角标也靠右排 —— 原来它贴在左上,
    // 会跟「右上角标签」分处两端、中间的标题被夹得很窄。
    .fill-badge
      flex: 0 0 auto
      pointer-events: auto
      margin-top: 1px
      order: 3
    // 右上角的收藏标签区(用户要求:二号样式右上角也要能看到标签)。
    // 卡片窄、标签长,所以最多 3 个 + 一个 +N;只占右上角,不挤压中间的标题。
    .fill-top-tags
      position: absolute
      top: 6px
      right: 8px
      display: flex
      flex-direction: column
      align-items: flex-end
      gap: 3px
      max-width: 62%
      pointer-events: auto
      z-index: 3
      .fill-top-tag
        flex: 0 0 auto
        max-width: 100%
        font-size: calc(var(--emm-custom-font-size, 14px) - 4px)
        line-height: 1.5
        padding: 0 5px
        height: 18px
        overflow: hidden
        text-overflow: ellipsis
        white-space: nowrap
        box-shadow: 0 1px 3px rgba(0, 0, 0, .5)
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
  // ★ 以下三条必须与 .fill-badge 同级(2 空格缩进),不能嵌进 .fill-badge 里 ——
  //   曾因缩进错位编译成 `.fill-badge .fill-cat-tag`,绝对定位失效,标签掉到左上角。
  // 右上角类别标签(参考图1:同人誌／漢化):深色半透明胶囊,绝对定位到右上角
  .fill-cat-tag
    position: absolute
    top: 6px
    right: 8px
    z-index: 4
    max-width: 70%
    height: 22px
    line-height: 20px
    padding: 0 8px
    border: 1px solid rgba(255, 255, 255, .28) !important
    border-radius: 4px
    background: rgba(0, 0, 0, .55) !important
    color: #fff !important
    font-weight: 600
    font-size: calc(var(--emm-custom-font-size, 14px) - 3px)
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis
    box-shadow: 0 1px 3px rgba(0, 0, 0, .5)
  // 图片数量 + 添加时间(参考图1):底部独立一行,二号样式隐藏 fill-footer 时仍可见。
  .fill-counttime
    position: absolute
    left: 0
    right: 0
    bottom: 4px
    z-index: 3
    padding: 0 8px
    text-align: center
    color: rgba(255, 255, 255, .88)
    font-size: calc(var(--emm-custom-font-size, 14px) - 2px)
    line-height: 1.5
    text-shadow: 0 1px 3px rgba(0, 0, 0, .9)
    pointer-events: none
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


// ---------- 三号样式:条状列表(设置 → 高级 → 卡片样式 → 三号样式) ----------
// 版式参考「下载记录」每一行:左小封面 + 右信息(标题 / 标签 / 页数·评分 / 阅·读)。
// 容器按「条宽自适应」排布:一行能放几张就放几张,条宽下限 320px。
// 与一/二号互斥(由设置里的三选一保证),这里只负责容器层面的列数。
.card-style-3
  display: grid !important
  // 列宽下限 = 设置里的「条宽」(--style3-card-w,默认 320px)。
  // min(…,100%) 兜底:窄屏/设置过大时列下限不超过容器,避免横向溢出。
  grid-template-columns: repeat(auto-fill, minmax(unquote('min(var(--style3-card-w, 320px), 100%)'), 1fr))
  align-content: start
  // 行/列间距分开:--style3-gap-v / --style3-gap-h 已由唯一写入方按 zoom 算好
  gap: var(--style3-gap-v, 8px) var(--style3-gap-h, 8px)
  // 容器留白取纵向间距的一半,与 grid gap 不叠加成双倍
  padding: calc(var(--style3-gap-v, 8px) / 2)
  // 三号样式下卡片自身已改成 flex 横排(见 BookCard 的 .book-card.style-3)
  .book-card
    width: 100%
    margin: 0

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
    // 二号填充封面:右上角「类别标签」在第一行,收藏标签区顺延到它下面,避免两块重叠
    &.fill-cover .fill-top-tags
      top: 34px


/* ================= 三号样式:条状列表 =================
   ★ 13 / 11 / 18 是三号专用设计值(标题 13、元信息 11、chip 高 18);
     一号/二号的标题基准是 12 —— 禁止后续「一致性清理」把这些数字改回 12。
   ★ 字号只乘 --style3-zoom,不碰 --emm-card-zoom(一号/二号/合集一号靠它)。
   ★ height 而不是 min-height,且 box-sizing:border-box —— 行高严格等于设置值。
   双档由 .compact 控制:判据只看行高设置值(<88),与 zoom 无关。 */
.book-card.style-3 {
  display: flex !important;
  flex-direction: row !important;
  align-items: center;
  box-sizing: border-box;
  height: var(--style3-row-h, 96px);
  min-height: 0;
  gap: calc(8px * var(--style3-zoom, 1));
  padding: calc(6px * var(--style3-zoom, 1));
  border: 0;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 6px;
  background: transparent;
  overflow: hidden;
  transition: background .15s, box-shadow .15s;
  /* 条状样式不需要原来的封面框/标题浮层 */
  .book-cover-frame,
  .book-title,
  .book-card-footer,
  .fill-top,
  .fill-footer,
  .book-task-mask,
  .book-card-torrent { display: none !important; }

  /* 三态:hover / 键盘焦点 / 选中 —— 只改底色与描边,绝不改 margin/transform */
  &:hover,
  &:focus-visible,
  &:focus-within {
    // 覆盖 base .book-card:hover 的 translateY(-3px) 与大阴影 —— 三态全程不位移
    transform: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, .08);
    background: var(--el-fill-color-light, #f5f7fa);
    .strip-title { color: var(--el-color-primary); }
    .strip-more { opacity: 1; }
  }
  &:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: -2px;
  }
  &.is-selected {
    background: var(--el-color-primary-light-9, #ecf5ff);
    .strip-title { color: var(--el-color-primary); }
  }
  &.is-selected::before {
    content: "";
    position: absolute; left: 0; top: 0; bottom: 0;
    width: 3px;
    background: var(--el-color-primary);
    border-radius: 3px 0 0 3px;
  }

  .strip-cover {
    position: relative;
    flex: 0 0 auto;
    align-self: center;
    // 宽/高都由变量给定且保持 3:4 —— 不写 min-height,否则内容盒比行盒多 6px
    width: var(--style3-cover-w, 63px);
    height: var(--style3-cover-h, 84px);
    border-radius: 5px;
    overflow: hidden;
    background: rgba(128, 128, 128, .12);
    box-shadow: 0 1px 3px rgba(0, 0, 0, .14);
    cursor: pointer;
    .strip-cover-img {
      width: 100%; height: 100%;
      object-fit: cover;
      display: block;
      transition: transform .3s;
    }
    &:hover .strip-cover-img { transform: scale(1.03); }
    .strip-cover-empty { background: rgba(128, 128, 128, .18); }
    .cover-loading {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      color: var(--el-color-primary);
    }
  }

  .strip-body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: calc(4px * var(--style3-zoom, 1));
    padding: 0 calc(2px * var(--style3-zoom, 1));
  }
  .strip-title-line {
    display: flex;
    align-items: center;
    gap: calc(6px * var(--style3-zoom, 1));
    min-width: 0;
  }
  .strip-title {
    margin: 0;
    flex: 1 1 auto;
    min-width: 0;
    font-size: calc(13px * var(--style3-zoom, 1));
    line-height: 1.35;
    font-weight: 600;
    letter-spacing: .1px;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color .15s;
  }
  .strip-more {
    flex: 0 0 auto;
    // 常占位:有没有 +N 都占同一宽度,标题省略号不因 hover 而跳
    min-width: calc(26px * var(--style3-zoom, 1));
    height: calc(18px * var(--style3-zoom, 1));
    line-height: calc(16px * var(--style3-zoom, 1));
    padding: 0 calc(5px * var(--style3-zoom, 1));
    border-radius: calc(9px * var(--style3-zoom, 1));
    background: var(--el-color-primary-light-9, #ecf5ff);
    border: 1px solid var(--el-color-primary-light-8, #d9ecff);
    color: var(--el-color-primary);
    font-size: calc(11px * var(--style3-zoom, 1));
    text-align: center;
    opacity: 0;
    transition: opacity .12s;
    &.is-empty { opacity: 0 !important; }
  }
  .strip-tags {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: calc(4px * var(--style3-zoom, 1));
    height: calc(18px * var(--style3-zoom, 1));
    overflow: hidden;
    .strip-tag {
      flex: 0 0 auto;
      max-width: calc(96px * var(--style3-zoom, 1));
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: calc(11px * var(--style3-zoom, 1));
      height: calc(18px * var(--style3-zoom, 1));
      line-height: calc(18px * var(--style3-zoom, 1));
    }
  }
  // 紧凑档:整行标签不渲染(模板已 v-if,这里兜底)
  &.compact .strip-tags { display: none; }

  .strip-meta {
    display: flex;
    align-items: center;
    gap: calc(6px * var(--style3-zoom, 1));
    flex-wrap: nowrap;
    height: calc(16px * var(--style3-zoom, 1));
    font-size: calc(11px * var(--style3-zoom, 1));
    line-height: calc(16px * var(--style3-zoom, 1));
    color: var(--el-text-color-secondary);
    white-space: nowrap;
    overflow: hidden;
    .strip-meta-item { cursor: pointer; flex: 0 0 auto; }
    // 页数永不截;时间短格式,完整时间进 title
    .is-pagecount { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
    .is-time { min-width: 0; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; }
    .strip-meta-dot { flex: 0 0 auto; width: 3px; height: 3px; border-radius: 50%; background: var(--el-border-color); }
    .el-rate { flex: 0 0 auto; height: calc(16px * var(--style3-zoom, 1)); }
    .el-rate__text { color: var(--el-text-color-secondary); font-size: calc(11px * var(--style3-zoom, 1)); }
  }

  // 固定操作列:阅/读。68px 是设计固定值,不随 zoom 伸缩(热区稳定)
  .strip-actions {
    flex: 0 0 68px;
    width: 68px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    justify-content: center;
    align-self: stretch;
    margin: 0;
    padding: 0 0 0 8px;
    border-left: 1px solid var(--el-border-color-lighter, #ebeef5);
    .el-button {
      height: 28px;
      margin: 0;
      padding: 0;
      font-size: 11.5px;
    }
  }
}

// 键盘焦点实际落在 .book-card-frame 的 tabindex 上,不是 .book-card 自身 ——
// 把焦点环与 +N 淡入转发到内层条状卡,否则 focus-visible 永远不触发。
.card-style-3 .book-card-frame:focus-visible
  outline: none
  .book-card
    outline: 2px solid var(--el-color-primary)
    outline-offset: -2px
    background: var(--el-fill-color-light, #f5f7fa)
    .strip-more
      opacity: 1

/* 绅士漫画的「合集」角标:紧跟在分类标签右边,用暖色区分 */
.book-series-tag {
  --el-tag-border-color: var(--el-color-warning-light-5);
  flex: none;
}
</style>