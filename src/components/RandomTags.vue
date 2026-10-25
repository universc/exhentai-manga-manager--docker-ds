<template>
  <el-row :gutter="20" class="book-tag-area">
    <el-space size="small" id="random-tags">
      <el-button size="small" plain :icon="MdRefresh" @click="reloadRandomTags"></el-button>
      <el-button size="small" plain :icon="UserMultiple" @click="showArtistList"></el-button>
      <el-button size="small" plain :icon="TagGroup" @click="showTagList"></el-button>
      <el-button
        v-for="tag in randomTags"
        :key="tag.value"
        size="small"
        plain
        @click="handleTagClick(tag.value)"
      >{{ tag.label }}</el-button>
    </el-space>
  </el-row>

  <TagList
    ref="tagListRef"
    :title="tagListTitle"
    @search="handleTagClick"
  />
</template>

<script setup>
import { ref, watch, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { MdRefresh } from '@vicons/ionicons4'
import { TagGroup, UserMultiple } from '@vicons/carbon'
import TagList from './TagList.vue'
import { tagDisplayPrefix, tagDisplayName } from '../utils.js'

import { useAppStore } from '../pinia.js'
import { storeToRefs } from 'pinia'
const appStore = useAppStore()
const { tagList, setting, resolvedTranslation } = storeToRefs(appStore)

const { t } = useI18n()

const emit = defineEmits(['search'])


const randomTags = ref([])
const tagListRef = ref(null)
const tagListTitle = ref('')

// 勾「收藏标签」→ 显示自己收藏的标签;勾「随机标签」→ 显示随机标签
const buildTags = () => {
  if (setting.value.showCollectTag) {
    const list = (setting.value.collectTag || []).map(t => ({
      value: `"${t.tag}"$`,
      // 严格「类别:标签」:被集合包含就用第一个包含它的标签名,否则类别名(不用 c:/f: 字母)
      label: `${tagDisplayPrefix(setting.value, resolvedTranslation.value, t.cat, t.tag)}:${tagDisplayName(setting.value, resolvedTranslation.value, t.cat, t.tag)}`
    }))
    // 收藏模式 = 在收藏的标签里随机抽一批(以前是全部平铺,「刷新」等于没效果)
    return _.sampleSize(list, Math.min(24, list.length))
  }
  return _.sampleSize(tagList.value, 24)
}
const reloadRandomTags = () => {
  randomTags.value = buildTags()
}

const handleTagClick = (value) => {
  emit('search', value)
}

const showArtistList = () => {
  tagListTitle.value = t('c.artist')
  tagListRef.value.showArtistTags()
}

const showTagList = () => {
  tagListTitle.value = t('m.tag')
  tagListRef.value.showMixedTags()
}

defineExpose({
  tagListRef
})

watch(tagList, () => {
  reloadRandomTags()
}, { immediate: false })

watch(() => setting.value.showCollectTag, () => { reloadRandomTags() })
watch(() => setting.value.collectTag, () => { reloadRandomTags() }, { deep: true })

reloadRandomTags()
</script>

<style lang="stylus" scoped>
.book-tag-area
  width: 100%
  margin-top: 14px
  #random-tags
    margin: 0 16px
    overflow-x: hidden
</style>
