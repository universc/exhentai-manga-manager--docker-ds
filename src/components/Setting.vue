<template>
  <el-dialog v-model="dialogVisibleSetting"
    width="55em"
    :modal="false"
    append-to-body
    top="60px"
    class="setting-dialog"
    @open="attachSettingInertiaScroll"
  >
    <template #header><p class="setting-title">{{$t('m.setting')}}</p></template>
    <el-tabs v-model="activeSettingPanel" class="setting-tabs">
      <!-- 网页版只读账户仅显示「账户」页(可查看当前账户并退出登录);管理员/桌面版显示全部 -->
      <el-tab-pane v-if="(showDesktopUI && !viewerRole) || isAdmin" :label="$t('m.general')" name="general">
        <!-- 运行模式:本地 / 服务器(NAS) -->
        <el-row :gutter="8" v-if="showDesktopUI">
          <el-col :span="24">
            <div class="setting-line">
              <span class="setting-label" style="margin-right: 14px;">{{$t('m.runMode')}}</span>
              <el-radio-group v-model="runMode" @change="handleRunModeChange">
                <el-radio-button label="local">{{$t('m.localMode')}}</el-radio-button>
                <el-radio-button label="remote">{{$t('m.serverMode')}}</el-radio-button>
              </el-radio-group>
            </div>
          </el-col>
        </el-row>
        <!-- 本地模式:数据文件位置(漫画库位置见下方) -->
        <el-row :gutter="8" v-if="showDesktopUI && runMode === 'local'">
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="dataPathText">
                <template #prepend><span class="setting-label">{{$t('m.dataPath')}}</span></template>
                <template #append>
                  <el-button-group>
                    <el-button @click="selectDataPath">{{$t('m.select')}}</el-button>
                    <el-button type="primary" @click="saveDataPath">{{$t('m.dataPathSaveRestart')}}</el-button>
                  </el-button-group>
                </template>
              </el-input>
            </div>
            <div class="setting-line toolbar-tip">{{$t('m.dataPathHint')}}</div>
          </el-col>
        </el-row>
        <!-- 服务器模式:服务器 IP / 端口 + 账户 + 连接/退出 -->
        <el-row :gutter="8" v-if="showDesktopUI && runMode === 'remote'">
          <el-col :span="12">
            <div class="setting-line">
              <el-input v-model="remoteIp" :placeholder="$t('m.remoteIpPlaceholder')" @change="syncRemoteServer">
                <template #prepend><span class="setting-label">{{$t('m.remoteIp')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <el-input v-model.number="remotePort" placeholder="10000" @change="syncRemoteServer">
                <template #prepend><span class="setting-label">{{$t('m.remotePort')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <el-input v-model="setting.remoteUsername" :placeholder="$t('m.loginUsername')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.remoteUsername')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <el-input v-model="setting.remotePassword" type="password" show-password :placeholder="$t('m.loginPassword')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.remotePassword')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line function-button-row">
              <el-button class="function-button" plain @click="testRemoteServer">{{$t('m.testConnection')}}</el-button>
              <el-button class="function-button" type="primary" plain :disabled="!remoteIp" @click="relaunchRemoteMode">{{$t('m.relaunchConnect')}}</el-button>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line function-button-row">
              <el-button class="function-button" type="danger" plain @click="exitServerMode">{{$t('m.exitServerMode')}}</el-button>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line toolbar-tip">{{$t('m.webModeHint')}}</div>
          </el-col>
        </el-row>
        <el-row :gutter="8">
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.appName" :placeholder="$t('m.appNamePlaceholder')" @change="handleAppNameChange">
                <template #prepend><span class="setting-label">{{$t('m.appNameSetting')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.library">
                <template #prepend><span class="setting-label">{{$t('m.library')}}</span></template>
                <template #append><el-button @click="selectLibraryPath">{{$t('m.select')}}</el-button></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.metadataPath" :placeholder="$t('m.metadataPathDefault')">
                <template #prepend><span class="setting-label">{{$t('m.metadataPath')}}</span></template>
                <template #append><el-button @click="selectMetadataPath">{{$t('m.select')}}</el-button></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.imageExplorer" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.imageViewer')}}</span></template>
                <template #append>
                  <el-button-group>
                    <el-button :icon="MdRefresh" @click="resetImageExplorer" style="border-right: solid 1px"></el-button>
                    <el-button @click="selectImageExplorerPath">{{$t('m.select')}}</el-button>
                  </el-button-group>
                </template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.theme')}}</span></template>
                <el-select placeholder=" " v-model="setting.theme" @change="handleThemeChange">
                  <el-option label="Default Dark" value="dark"></el-option>
                  <el-option label="Default Light" value="light"></el-option>
                  <el-option label="ExHentai" value="dark exhentai"></el-option>
                  <el-option label="E-Hentai" value="light e-hentai"></el-option>
                  <el-option label="nHentai" value="dark nhentai"></el-option>
                  <el-option :label="$t('m.customTheme')" value="custom"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.igneous" @change="saveSetting">
                <template #prepend><span class="setting-label">igneous</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.ipb_pass_hash" @change="saveSetting">
                <template #prepend><span class="setting-label">ipb_pass_hash</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.ipb_member_id" @change="saveSetting">
                <template #prepend><span class="setting-label">ipb_member_id</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.star" @change="saveSetting">
                <template #prepend><span class="setting-label">star</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.proxy" @change="saveSetting" :placeholder="$t('m.like') + ' http://127.0.0.1:7890'">
                <template #prepend><span class="setting-label">{{$t('m.proxy')}}</span></template>
                <template #append><el-button @click="testProxy">{{$t('m.test')}}</el-button></template>
              </el-input>
            </div>
          </el-col>
        </el-row>
      </el-tab-pane>
      <el-tab-pane v-if="(showDesktopUI && !viewerRole) || isAdmin" :label="$t('m.internalViewer')" name="internalViewer">
        <el-row :gutter="8">
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend>
                  <span class="setting-label">{{$t('m.viewerType')}}</span>
                </template>
                <el-select placeholder=" " v-model="setting.viewerType" @change="saveSetting">
                  <el-option :label="$t('m.originalViewer')" value="original"></el-option>
                  <el-option label="ComicRead" value="comicread"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model.number="setting.thumbnailColumn" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.thumbnailColumn')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model.number="setting.widthLimit" :placeholder="$t('m.widthLimitInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.widthLimit')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24" class="setting-switch">
            <el-switch
              v-model="setting.hidePageNumber"
              :active-text="$t('m.hidePageNumber')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="24" class="setting-switch">
            <el-switch
              v-model="setting.keepReadingProgress"
              :active-text="$t('m.keepReadingProgress')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="24" class="setting-switch">
            <el-switch
              v-model="setting.reverseLeftRight"
              :active-text="$t('m.reverseLeftRight')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="24" class="setting-switch">
            <el-switch
              v-model="setting.autoNextManga"
              :active-text="$t('m.autoNextManga')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="24" class="setting-switch">
            <el-switch
              v-model="setting.defaultInsertEmptyPage"
              :active-text="$t('m.defaultInsertEmptyPage')"
              @change="saveSetting"
            />
          </el-col>
        </el-row>
      </el-tab-pane>
      <el-tab-pane v-if="(showDesktopUI && !viewerRole) || isAdmin" :label="$t('m.collectTag')" name="collectTag">
        <el-row :gutter="8">
          <!-- 当前库中的全部标签:分类在上,标签在下;点击收藏、色点改色、双击重命名 -->
          <el-col :span="24" class="setting-line collect-tag">
            <div class="context-menu-title">{{$t('m.allTags')}}</div>
            <div class="tag-cat-list">
              <el-tag
                v-for="g in allTagsGroups"
                :key="g.cat"
                class="tag-cat-chip"
                :effect="selectedTagCat === g.cat ? 'dark' : 'plain'"
                :type="selectedTagCat === g.cat ? 'primary' : 'info'"
                @click="selectedTagCat = selectedTagCat === g.cat ? null : g.cat"
              >{{ categoryLabel(g.cat) }} ({{ g.tags.length }})</el-tag>
            </div>
            <div class="all-tags-list">
              <template v-for="g in allTagsGroups" :key="g.cat">
                <div v-if="!selectedTagCat || selectedTagCat === g.cat" class="tag-group">
                  <div class="tag-group-title">{{ categoryLabel(g.cat) }}</div>
                  <el-tag
                    v-for="tag in g.tags"
                    :key="tag.id"
                    class="all-tag-item"
                    :effect="collectedTagMap[tag.id] ? 'dark' : 'plain'"
                    :color="collectedTagMap[tag.id]?.color"
                    :closable="!!collectedTagMap[tag.id]"
                    @close="removeTag(tag.id)"
                    @pointerdown="startLongPressCollect(tag)"
                    @pointerup="cancelLongPressCollect"
                    @pointerleave="cancelLongPressCollect"
                    @dblclick="openTagNameEditor(tag)"
                    :title="$t('m.editTagNames')"
                  >
                    <el-popover
                      v-if="collectedTagMap[tag.id]"
                      trigger="click"
                      placement="top"
                      width="210"
                      :visible="tagColorPopupId === tag.id"
                      @hide="tagColorPopupId = null"
                    >
                      <template #reference>
                        <span class="tag-color-dot" :style="{background: collectedTagMap[tag.id].color}" @click.stop="tagColorPopupId = tag.id"></span>
                      </template>
                      <el-color-picker
                        :model-value="collectedTagMap[tag.id]?.color"
                        :predefine="moderateSoftColors"
                        @update:model-value="(c) => applyTagColor(tag, c)"
                      />
                    </el-popover>
                    {{ tagLabelWithSets(tag) }}
                  </el-tag>
                </div>
              </template>
            </div>
          </el-col>
          <!-- 已收藏标签:拖动排序 -->
          <el-col :span="24" class="setting-line collect-tag">
            <div class="context-menu-title">{{$t('m.collectedTags')}}</div>
            <draggable
              v-model="setting.collectTag"
              item-key="id"
              animation="200"
              @change="saveSetting"
            >
              <template #item="{element}">
                <el-tag :color="element.color" effect="dark" closable @close="removeTag(element.id)">
                  <span class="tag-color-dot" :style="{background: element.color}" @click.stop="pickTagColor(element)"></span>
                  {{element.letter}}:{{resolvedTranslation[element.cat]?.[element.tag]?.name || element.tag}}
                </el-tag>
              </template>
            </draggable>
          </el-col>
          <el-col :span="24" class="setting-line collect-tag">
            <el-form :inline="true" :model="formTagAdd" :show-message="false">
              <el-form-item :label="$t('m.tag')">
                <el-select-v2
                  v-model="formTagAdd.tag"
                  filterable clearable :height="340"
                  style="width: 500px"
                  :options="tagListForCollect"
                ></el-select-v2>
              </el-form-item>
              <el-form-item :label="$t('m.tagColor')">
                <el-color-picker v-model="formTagAdd.color" show-alpha :predefine="moderateSoftColors"/>
              </el-form-item>
              <el-form-item>
                <el-button plain @click="addTagToCollect">{{$t('m.addTag')}}</el-button>
              </el-form-item>
            </el-form>
          </el-col>
          <el-col :span="5" class="setting-switch">
            <el-switch
              v-model="setting.showCollectTag"
              :active-text="$t('m.showCollectTag')"
              @change="onShowCollectTagChange"
            />
          </el-col>
          <el-col :span="5" class="setting-switch">
            <el-switch
              v-model="setting.randomTagsEnabled"
              :active-text="$t('m.randomTagsEnabled')"
              @change="onRandomTagsChange"
            />
          </el-col>
          <el-col :span="7" class="setting-switch tag-lang-col">
            <span class="setting-label">{{$t('m.tagTranslate')}}</span>
            <el-select v-model="setting.tagTargetLang" size="small" class="tag-target-lang" @change="onTagLangChange">
              <el-option :label="$t('m.langDefault')" value=""></el-option>
              <el-option :label="$t('m.langZhCn')" value="zh-CN"></el-option>
              <el-option :label="$t('m.langZhTw')" value="zh-TW"></el-option>
              <el-option :label="$t('m.langEn')" value="en"></el-option>
              <el-option :label="$t('m.langJa')" value="ja"></el-option>
            </el-select>
          </el-col>
</el-row>
        <!-- 双击标签:编辑多语言名称(中/日/英),按「目标语言标签」显示 -->
        <el-dialog v-model="tagEditVisible" :title="$t('m.editTagNames')" width="380px" append-to-body>
          <div class="tag-name-editor">
            <p class="tag-edit-raw">{{ tagEditItem ? (tagEditItem.cat + ' : ' + tagEditItem.tag) : '' }}</p>
            <el-input v-model="tagEditLangs['default']" size="small" :placeholder="$t('m.tagNameDefault')" />
            <el-input v-model="tagEditLangs['zh-CN']" size="small" :placeholder="$t('m.tagNameZh')" />
            <el-input v-model="tagEditLangs['zh-TW']" size="small" :placeholder="$t('m.tagNameZhTw')" />
            <el-input v-model="tagEditLangs.ja" size="small" :placeholder="$t('m.tagNameJa')" />
            <el-input v-model="tagEditLangs.en" size="small" :placeholder="$t('m.tagNameEn')" />
          </div>
          <!-- 关联标签:包含 / 被包含 -->
          <div class="tag-relation-editor">
            <div class="tag-relation-title">{{ $t('m.tagRelations') }}</div>
            <div class="tag-relation-add">
              <el-select v-model="tagRelationCat" size="small" :placeholder="$t('m.pickCategory')" style="width: 104px;">
                <el-option v-for="c in tagRelationCats" :key="c.value" :label="c.label" :value="c.value" />
              </el-select>
              <el-select v-model="tagRelationPick" size="small" filterable clearable :placeholder="$t('m.pickTag')" style="width: 156px;">
                <el-option v-for="o in tagRelationOptions" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
              <el-select v-model="tagRelationKind" size="small" style="width: 104px;">
                <el-option :label="$t('m.relationContains')" value="contains"></el-option>
                <el-option :label="$t('m.relationContainedBy')" value="containedBy"></el-option>
              </el-select>
              <el-button size="small" type="primary" plain :disabled="!tagRelationPick" @click="addTagRelation">{{ $t('m.addRelation') }}</el-button>
            </div>
            <div class="tag-relation-list">
              <el-tag v-for="r in tagRelationList" :key="r.kind + r.key" size="small" closable class="tag-relation-item" @close="removeTagRelation(r)">
                {{ r.kind === 'contains' ? $t('m.relationContains') : $t('m.relationContainedBy') }} · {{ r.label }}
              </el-tag>
              <span v-if="!tagRelationList.length" class="tag-relation-empty">—</span>
            </div>
          </div>
          <template #footer>
            <el-button size="small" @click="tagEditVisible = false">{{ $t('m.cancel') }}</el-button>
            <el-button size="small" type="primary" @click="saveTagNames">{{ $t('m.saveTagNames') }}</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>
      <el-tab-pane v-if="(showDesktopUI && !viewerRole) || isAdmin" :label="$t('m.advanced')" name="advanced">
        <el-row :gutter="8">
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.language')}}</span></template>
                <el-select placeholder=" " v-model="setting.language" @change="handleLanguageChange(setting.language)">
                  <el-option :label="$t('m.systemDefault')" value="default"></el-option>
                  <el-option label="zh-CN" value="zh-CN"></el-option>
                  <el-option label="zh-TW" value="zh-TW"></el-option>
                  <el-option label="en-US" value="en-US"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.displayTitle')}}</span></template>
                <el-select :placeholder="$t('m.displayTitleInfo')" v-model="setting.displayTitle" @change="saveSetting">
                  <el-option :label="$t('m.englishTitle')" value="englishTitle"></el-option>
                  <el-option :label="$t('m.japaneseTitle')" value="japaneseTitle"></el-option>
                  <el-option :label="$t('m.chineseTitle')" value="chineseTitle"></el-option>
                  <el-option :label="$t('m.filename')" value="filename"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.defaultScraper')}}</span></template>
                <el-select v-model="setting.defaultScraper" @change="saveSetting">
                  <el-option v-for="searchType in searchTypeList" :key="searchType.value" :label="searchType.label" :value="searchType.value" />
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model.number="setting.requireGap" :placeholder="$t('m.requireGapInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.requestGap')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <NameFormItem class="setting-line" prependWidth="110px">
              <template #prepend>{{$t('m.customOptions')}}</template>
              <template #default>
                <el-input
                  v-model="setting.customOptions" :placeholder="$t('m.customOptionsPlaceholder')" @change="saveSetting"
                  type="textarea" :autosize="{ minRows: 2, maxRows: 4 }"
                ></el-input>
              </template>
            </NameFormItem>
          </el-col>
          <el-col :span="24">
            <div class="setting-line regexp">
              <el-input v-model="setting.trimTitleRegExp" :placeholder="$t('m.trimTitleRegExpInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.trimTitleRegExp')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.searchKeySuffix" :placeholder="$t('m.searchKeySuffixInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.searchKeySuffix')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line regexp">
              <el-input v-model="setting.excludeFile" :placeholder="$t('m.excludeFileInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.excludeFile')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.folderTreeWidth" :placeholder="$t('m.folderTreeWidthInfo')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.folderTreeWidth')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <!-- 每页数量 + 惯性滑动(放在自定义CSS上方,只保留设置框) -->
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.customPageSizes" :placeholder="$t('m.pageSizeCustomPlaceholder')" @change="handlePageSizesChange">
                <template #prepend><span class="setting-label">{{$t('m.pageSizeCustom')}}</span></template>
                <template #append>
                  <el-button @click="appendPageSizeComma">,</el-button>
                </template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.scrollInertia')}}</span></template>
                <el-select placeholder=" " v-model="setting.scrollInertiaLevel" @change="saveSetting">
                  <el-option :label="$t('m.scrollInertiaOff')" value="off"></el-option>
                  <el-option :label="$t('m.scrollInertiaLow')" value="low"></el-option>
                  <el-option :label="$t('m.scrollInertiaMedium')" value="medium"></el-option>
                  <el-option :label="$t('m.scrollInertiaHigh')" value="high"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line toolbar-tip">{{$t('m.scrollInertiaTip')}}</div>
          </el-col>
          <el-col :span="24">
            <NameFormItem class="setting-line" prependWidth="110px" appendWidth="0">
              <template #prepend>{{$t('m.customCss')}}</template>
              <template #default>
                <el-input
                  v-model="setting.customCss" :placeholder="$t('m.customCssPlaceholder')" @change="saveSetting"
                  type="textarea" :autosize="{ minRows: 2, maxRows: 4 }"
                ></el-input>
              </template>
              <template #append>
                <el-button text :icon="MdRefresh" @click="reloadWindow"></el-button>
              </template>
            </NameFormItem>
          </el-col>
          <el-col :span="24">
            <div class="setting-line function-button-row">
              <el-popconfirm
                placement="top-start"
                :title="$t('m.rebuildWarning')"
                @confirm="forceGeneBookList"
              >
                <template #reference>
                  <el-button class="function-button" plain>{{$t('m.rebuildLibrary')}}</el-button>
                </template>
              </el-popconfirm>
              <el-popconfirm
                placement="top-start"
                :title="$t('m.patchWarning')"
                @confirm="patchLocalMetadata"
              >
                <template #reference>
                  <el-button class="function-button" type="primary" plain>{{$t('m.patchLocalMetadata')}}</el-button>
                </template>
              </el-popconfirm>
              <el-button class="function-button" type="primary" plain @click="exportDatabase">{{$t('m.exportMetadata')}}</el-button>
              <el-button class="function-button" type="primary" plain @click="importDatabase">{{$t('m.importMetadata')}}</el-button>
              <el-button class="function-button" type="primary" plain @click="importMetadataFromSqlite">{{$t('m.importMetadataFromSqlite')}}</el-button>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="8">
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.loadOnStart"
              :active-text="$t('m.onStartScan')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.showComment"
              :active-text="$t('m.showComment')"
              @change="saveSetting"
            />
          </el-col>
          
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.skipDeleteConfirm"
              :active-text="$t('m.skipDeleteConfirm')"
              @change="saveSetting"
            />
          </el-col>
          
        </el-row>
        <!-- Windows 窗口开关:开机启动 / 置顶 / 托盘 -->
        <el-row :gutter="8" v-if="showDesktopUI">
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.startOnLogin"
              :active-text="$t('m.startOnLogin')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.alwaysOnTop"
              :active-text="$t('m.alwaysOnTop')"
              @change="handleAlwaysOnTopChange"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.minimizeOnStart"
              :active-text="$t('m.minimizeOnStart')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.minimizeToTray"
              :active-text="$t('m.minimizeToTray')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.closeToTray"
              :active-text="$t('m.closeToTray')"
              @change="saveSetting"
            />
          </el-col>
        </el-row>
        <el-row :gutter="8">
          <el-col :span="12" class="setting-switch">
            <el-switch
              v-model="setting.batchTagfailedBook"
              :active-text="$t('m.batchTagfailedBook')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch
              v-model="setting.onlyGetMetadataOfSelectedFolder"
              :active-text="$t('m.onlyGetMetadataOfSelectedFolder')"
              @change="saveSetting"
            />
          </el-col>
        </el-row>

        <!-- ================= 卡片样式 ================= -->
        <div class="advanced-section-title">{{$t('m.cardStyle')}}</div>
        <!-- 卡片相关开关(自其它分区归并到此):各元素显隐独立 + 填充封面 -->
        <el-row :gutter="8">
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideBookmarkButton"
              :active-text="$t('m.hideBookmarkButton')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hidePageCount"
              :active-text="$t('m.hidePageCount')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideReadCount"
              :active-text="$t('m.hideReadCount')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideReadButton"
              :active-text="$t('m.hideReadButton')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideNonTag"
              :active-text="$t('m.hideNonTag')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideTitle"
              :active-text="$t('m.hideTitle')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideRating"
              :active-text="$t('m.hideRating')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.fillCover"
              :active-text="$t('m.fillCover')"
              @change="saveSetting"
            />
          </el-col>
        </el-row>
        <!-- 封面大小(整体百分比,宽高等比)/ 封面宽度 / 封面高度 -->
        <el-row :gutter="8">
          <el-col :span="8">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.coverSize')}}</span></template>
                <el-input-number v-model="coverSizePercent" :min="50" :max="200" :step="5" controls-position="right" />
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.coverWidth')}}</span></template>
                <el-input-number v-model="setting.coverWidth" :min="120" :max="400" :step="10" controls-position="right" @change="handleCoverStyleChange" />
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.coverHeight')}}</span></template>
                <el-input-number v-model="setting.coverHeight" :min="160" :max="640" :step="10" controls-position="right" @change="handleCoverStyleChange" />
              </NameFormItem>
            </div>
          </el-col>
        </el-row>
        <!-- 卡片间距:上下 / 左右 分别调整 -->
        <el-row :gutter="8">
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.cardGapV')}}</span></template>
                <el-input-number v-model="setting.cardGapV" :min="0" :max="40" :step="2" controls-position="right" @change="handleCoverStyleChange" />
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.cardGapH')}}</span></template>
                <el-input-number v-model="setting.cardGapH" :min="0" :max="40" :step="2" controls-position="right" @change="handleCoverStyleChange" />
              </NameFormItem>
            </div>
          </el-col>
        </el-row>

        <!-- 工具栏按钮自定义(设置按钮始终保留) -->
        <div class="advanced-section-title">{{$t('m.toolbarButtons')}}</div>
        <el-row :gutter="8">
          <el-col :span="24">
            <div class="setting-line">
              <div class="toolbar-section-label">{{$t('m.toolbarShown')}}</div>
              <draggable v-model="toolbarButtonsShown" item-key="id" animation="200" class="toolbar-sort-list" @change="saveToolbarButtons">
                <template #item="{element}">
                  <div class="toolbar-sort-item">
                    <span class="drag-handle">⠿</span>
                    <el-icon :size="15" class="toolbar-item-icon"><component :is="toolbarIconMap[element]" /></el-icon>
                    <span class="toolbar-sort-label">{{$t(toolbarLabelKey(element))}}</span>
                    <el-button text type="danger" size="small" class="toolbar-remove-btn" @click="removeToolbarButton(element)">✕</el-button>
                  </div>
                </template>
              </draggable>
            </div>
          </el-col>
          <el-col :span="24" v-if="toolbarButtonsAvailable.length">
            <div class="setting-line">
              <div class="toolbar-section-label">{{$t('m.toolbarHidden')}}</div>
              <div class="toolbar-hidden-list">
                <el-tag
                  v-for="btn in toolbarButtonsAvailable"
                  :key="btn.id"
                  class="toolbar-hidden-tag"
                  closable
                  @close="addToolbarButton(btn.id)"
                >
                  <el-icon :size="14" style="vertical-align: -2px; margin-right: 3px;"><component :is="toolbarIconMap[btn.id]" /></el-icon>{{$t(btn.labelKey)}}
                </el-tag>
              </div>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-button plain @click="resetToolbarButtons">{{$t('m.contextMenuReset')}}</el-button>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line toolbar-tip">{{$t('m.toolbarTip')}}</div>
          </el-col>
        </el-row>

        <!-- 自定义主题 -->
        <div class="advanced-section-title">{{$t('m.customTheme')}}</div>
        <el-row :gutter="8">
          <el-col :span="24">
            <div class="custom-theme-panel">
              <div class="theme-row">
                <span class="theme-label">{{$t('m.themeCustomBg')}}</span>
                <div class="theme-value">
                  <el-color-picker v-model="setting.themeCustomBg" :show-alpha="false" @change="handleCustomThemeChange" />
                  <el-button v-if="setting.themeCustomBg" size="small" text type="danger" @click="clearThemeColor('bg')">{{$t('m.clear')}}</el-button>
                </div>
              </div>
              <div class="theme-row">
                <span class="theme-label">{{$t('m.themeCustomPrimary')}}</span>
                <div class="theme-value">
                  <el-color-picker v-model="setting.themeCustomPrimary" :show-alpha="false" @change="handleCustomThemeChange" />
                  <el-button v-if="setting.themeCustomPrimary && setting.themeCustomPrimary !== '#409EFF'" size="small" text type="danger" @click="resetThemeColor('primary')">{{$t('m.clear')}}</el-button>
                </div>
              </div>
              <div class="theme-row">
                <span class="theme-label">{{$t('m.themeCustomFontColor')}}</span>
                <div class="theme-value">
                  <el-color-picker v-model="setting.themeCustomFontColor" :show-alpha="false" @change="handleCustomThemeChange" />
                  <el-button v-if="setting.themeCustomFontColor" size="small" text type="danger" @click="clearThemeColor('font')">{{$t('m.clear')}}</el-button>
                </div>
              </div>
              <div class="theme-row">
                <span class="theme-label">{{$t('m.themeCustomFontSize')}}</span>
                <div class="theme-value">
                  <el-input-number v-model="setting.themeCustomFontSize" :min="10" :max="40" size="small" controls-position="right" @change="handleCustomThemeChange" />
                </div>
              </div>
              <div class="theme-row">
                <span class="theme-label">{{$t('m.themeCustomFontStyle')}}</span>
                <div class="theme-value">
                  <el-select v-model="setting.themeCustomFontStyle" size="small" placeholder=" " @change="handleCustomThemeChange">
                    <el-option v-for="fs in customFontStyles" :key="fs.value" :label="$t(fs.labelKey)" :value="fs.value" />
                  </el-select>
                </div>
              </div>
              <div class="theme-row">
                <span class="theme-label">{{$t('m.themeCustomBgImage')}}</span>
                <div class="theme-value">
                  <el-input v-model="setting.themeCustomBgImage" size="small" :placeholder="$t('m.themeCustomBgImagePlaceholder')" @change="handleCustomThemeChange" />
                  <el-button size="small" @click="selectCustomImage('bg')">{{$t('m.select')}}</el-button>
                  <el-button v-if="setting.themeCustomBgImage" size="small" text type="danger" @click="clearCustomImage('bg')">{{$t('m.clear')}}</el-button>
                </div>
              </div>
              <div class="theme-row">
                <span class="theme-label">{{$t('m.customIcon')}}</span>
                <div class="theme-value">
                  <el-input v-model="setting.customIconPath" size="small" :placeholder="$t('m.customIconPlaceholder')" @change="handleCustomIconChange" />
                  <el-button size="small" @click="selectCustomImage('icon')">{{$t('m.select')}}</el-button>
                  <el-button v-if="setting.customIconPath" size="small" text type="danger" @click="clearCustomImage('icon')">{{$t('m.clear')}}</el-button>
                </div>
              </div>
            </div>
          </el-col>
        </el-row>

        <!-- 右键菜单自定义 -->
        <div class="advanced-section-title">{{$t('m.contextMenu')}}</div>
        <el-row :gutter="8">
          <el-col :span="24" v-for="group in contextMenuGroups" :key="group.id">
            <div class="setting-line context-menu-group">
              <div class="context-menu-title">{{ group.title }}</div>
              <el-checkbox-group
                :model-value="setting.contextMenuOptions?.[group.id]"
                @update:model-value="(val) => updateContextMenuOptions(group.id, val)"
              >
                <el-checkbox v-for="item in group.items" :key="item.id" :value="item.id" :label="item.id">{{ item.label }}</el-checkbox>
              </el-checkbox-group>
            </div>
          </el-col>
        </el-row>

        <!-- 点击策略:单击封面 / 阅 / 读 / 页数 分别进入哪个界面 -->
        <div class="advanced-section-title">{{$t('m.clickPolicy')}}</div>
        <el-row :gutter="8">
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.clickCover')}}</span></template>
                <el-select placeholder=" " v-model="setting.clickCoverAction" @change="saveSetting">
                  <el-option :label="$t('m.clickActionDetail')" value="detail"></el-option>
                  <el-option :label="$t('m.clickActionContent')" value="content"></el-option>
                  <el-option :label="$t('m.clickActionThumbnail')" value="thumbnail"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.dblClickCover')}}</span></template>
                <el-select placeholder=" " v-model="setting.dblClickCoverAction" @change="saveSetting">
                  <el-option :label="$t('m.clickActionDetail')" value="detail"></el-option>
                  <el-option :label="$t('m.clickActionContent')" value="content"></el-option>
                  <el-option :label="$t('m.clickActionThumbnail')" value="thumbnail"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.clickYue')}}</span></template>
                <el-select placeholder=" " v-model="setting.clickYueAction" @change="saveSetting">
                  <el-option :label="$t('m.clickActionDetail')" value="detail"></el-option>
                  <el-option :label="$t('m.clickActionContent')" value="content"></el-option>
                  <el-option :label="$t('m.clickActionThumbnail')" value="thumbnail"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.clickDu')}}</span></template>
                <el-select placeholder=" " v-model="setting.clickDuAction" @change="saveSetting">
                  <el-option :label="$t('m.clickActionDetail')" value="detail"></el-option>
                  <el-option :label="$t('m.clickActionContent')" value="content"></el-option>
                  <el-option :label="$t('m.clickActionThumbnail')" value="thumbnail"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.clickPageCount')}}</span></template>
                <el-select placeholder=" " v-model="setting.clickPageCountAction" @change="saveSetting">
                  <el-option :label="$t('m.clickActionDetail')" value="detail"></el-option>
                  <el-option :label="$t('m.clickActionContent')" value="content"></el-option>
                  <el-option :label="$t('m.clickActionThumbnail')" value="thumbnail"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-hint">{{$t('m.clickPolicyHint')}}</div>
          </el-col>
        </el-row>

        <!-- 恢复全部默认(放在最下方) -->
        <el-row :gutter="8">
          <el-col :span="24">
            <div class="setting-line reset-all-row">
              <el-button type="danger" plain @click="resetAllSettings">{{$t('m.resetAll')}}</el-button>
            </div>
          </el-col>
        </el-row>
      </el-tab-pane>
            <el-tab-pane v-if="(showDesktopUI && !viewerRole) || isAdmin" :label="$t('m.aiFeatures')" name="translation">
        <el-row :gutter="8">
          <el-col :span="24">
            <div class="setting-line">
              <el-divider content-position="left">{{$t('m.imageUpscale')}}</el-divider>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.useApi')}}</span></template>
                <el-select v-model="setting.upscaleApiProfileId" clearable placeholder=" " @change="saveSetting">
                  <el-option v-for="p in (setting.aiApiProfiles || [])" :key="p.id" :label="p.name || p.baseUrl" :value="p.id" />
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.saveMode')}}</span></template>
                <el-select v-model="setting.upscaleSaveMode" placeholder=" " @change="saveSetting">
                  <el-option :label="$t('m.saveModeSame')" value="same"></el-option>
                  <el-option :label="$t('m.saveModeReplace')" value="replace"></el-option>
                  <el-option :label="$t('m.saveModePreview')" value="preview"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.upscaleSizeMode')}}</span></template>
                <el-select v-model="setting.upscaleSizeMode" placeholder=" " @change="saveSetting">
                  <el-option :label="$t('m.upscaleSizeByScale')" value="scale"></el-option>
                  <el-option :label="$t('m.upscaleSizeByWidth')" value="width"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24" v-if="(setting.upscaleSizeMode || 'scale') === 'scale'">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.upscaleScale')}}</span></template>
                <el-select v-model="setting.upscaleScale" placeholder=" " @change="saveSetting">
                  <el-option :label="$t('m.upscaleScale2x')" :value="2"></el-option>
                  <el-option :label="$t('m.upscaleScale3x')" :value="3"></el-option>
                  <el-option :label="$t('m.upscaleScale4x')" :value="4"></el-option>
                  <el-option label="1.5x" :value="1.5"></el-option>
                  <el-option label="6x" :value="6"></el-option>
                  <el-option label="8x" :value="8"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24" v-else>
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.upscaleTargetWidth')}}</span></template>
                <el-input-number v-model="setting.upscaleTargetWidth" :min="256" :max="16384" :step="128" @change="saveSetting" />
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-divider content-position="left">{{$t('m.imageColorize')}}</el-divider>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.useApi')}}</span></template>
                <el-select v-model="setting.colorizeApiProfileId" clearable placeholder=" " @change="saveSetting">
                  <el-option v-for="p in (setting.aiApiProfiles || [])" :key="p.id" :label="p.name || p.baseUrl" :value="p.id" />
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.saveMode')}}</span></template>
                <el-select v-model="setting.colorizeSaveMode" placeholder=" " @change="saveSetting">
                  <el-option :label="$t('m.saveModeSame')" value="same"></el-option>
                  <el-option :label="$t('m.saveModeReplace')" value="replace"></el-option>
                  <el-option :label="$t('m.saveModePreview')" value="preview"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-divider content-position="left">{{$t('m.aiInfoProcessing')}}</el-divider>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.textExtractModel')}}</span></template>
                <el-select v-model="setting.ocrApiProfileId" clearable placeholder=" " @change="saveSetting">
                  <el-option v-for="p in (setting.aiApiProfiles || [])" :key="p.id" :label="p.name || p.baseUrl" :value="p.id" />
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.textProcessModel')}}</span></template>
                <el-select v-model="setting.infoProcessApiProfileId" clearable placeholder=" " @change="saveSetting">
                  <el-option v-for="p in (setting.aiApiProfiles || [])" :key="p.id" :label="p.name || p.baseUrl" :value="p.id" />
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.tagGenCategories')}}</span></template>
                <el-select v-model="setting.tagGenCategories" multiple collapse-tags clearable placeholder=" " @change="saveSetting">
                  <el-option v-for="c in tagCategoryKeys" :key="c" :label="tagCategoryLabel(c)" :value="c" />
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.storyGenTypes')}}</span></template>
                <el-select v-model="setting.storyGenTypes" placeholder=" " @change="saveSetting">
                  <el-option :label="$t('m.storySummaryOpt')" value="summary"></el-option>
                  <el-option :label="$t('m.storyFullOpt')" value="full"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.translateTargetLang')}}</span></template>
                <el-select v-model="setting.translateTargetLang" placeholder=" " @change="saveSetting">
                  <el-option :label="$t('m.langZhCn')" value="zh-CN"></el-option>
                  <el-option :label="$t('m.langZhTw')" value="zh-TW"></el-option>
                  <el-option :label="$t('m.langEn')" value="en"></el-option>
                  <el-option :label="$t('m.langJa')" value="ja"></el-option>
                  <el-option :label="$t('m.langKo')" value="ko"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.translateSaveMode')}}</span></template>
                <el-select v-model="setting.translateSaveMode" placeholder=" " @change="saveSetting">
                  <el-option :label="$t('m.saveToMangaFolder')" value="folder"></el-option>
                  <el-option :label="$t('m.saveModePreview')" value="preview"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.ocrSaveMode')}}</span></template>
                <el-select v-model="setting.ocrSaveMode" placeholder=" " @change="saveSetting">
                  <el-option :label="$t('m.saveToMangaFolder')" value="folder"></el-option>
                  <el-option :label="$t('m.saveNone')" value="none"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line toolbar-tip">{{$t('m.aiProcessTip')}}</div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line toolbar-tip">{{$t('m.imageApiTip')}}</div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-divider content-position="left">{{$t('m.apiProfiles')}}</el-divider>
            </div>
          </el-col>
          <el-col :span="24" v-for="p in (setting.aiApiProfiles || [])" :key="p.id">
            <div class="setting-line api-profile-row">
              <el-input v-model="p.name" class="api-profile-name" :placeholder="$t('m.apiName')" @change="saveSetting" />
              <el-input v-model="p.baseUrl" class="api-profile-url" :placeholder="$t('m.apiBaseUrl')" @change="saveSetting" />
              <el-select
                v-model="p.model"
                class="api-profile-model"
                filterable
                allow-create
                default-first-option
                :placeholder="$t('m.apiModel')"
                @change="saveSetting"
              >
                <el-option v-for="mid in (p.models || [])" :key="mid" :label="mid" :value="mid" />
              </el-select>
              <el-input v-model="p.apiKey" class="api-profile-key" type="password" show-password :placeholder="$t('m.apiKey')" @change="saveSetting" />
              <el-button :loading="!!p._loading" @click="fetchApiModels(p)">{{$t('m.fetchModels')}}</el-button>
              <el-button :loading="!!p._testing" @click="testApiProfile(p)">{{$t('m.testApi')}}</el-button>
              <el-button text type="danger" @click="removeApiProfile(p.id)">{{$t('m.deleteApi')}}</el-button>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-button type="primary" plain @click="addApiProfile">{{$t('m.addApi')}}</el-button>
            </div>
          </el-col>
        </el-row>
      </el-tab-pane>
      <!-- 账户(网页版/Docker,所有登录用户可见;管理员另有账户管理/IP 控制) -->
      <el-tab-pane v-if="isWebMode" :label="$t('m.accounts')" name="accounts">
        <el-row :gutter="8">
          <el-col :span="24">
            <!-- 未登录(网页版已启用鉴权但无会话):在设置内直接登录,避免整页空白 -->
            <template v-if="!isWebLoggedIn">
              <div class="setting-line toolbar-tip">{{$t('m.loginSub')}}</div>
              <div class="setting-line" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <el-input v-model="webLoginUsername" :placeholder="$t('m.loginUsername')" style="width: 200px;" @keyup.enter="doWebLogin" />
                <el-input v-model="webLoginPassword" type="password" show-password :placeholder="$t('m.loginPassword')" style="width: 200px;" @keyup.enter="doWebLogin" />
                <el-button type="primary" plain :loading="webLoginLoading" @click="doWebLogin">{{$t('m.loginButton')}}</el-button>
              </div>
              <div v-if="webLoginError" class="setting-line" style="color: #f56c6c;">{{webLoginError}}</div>
            </template>
            <template v-else>
            <div class="setting-line" style="display: flex; align-items: center; gap: 10px;">
              <span>{{$t('m.loginUsername')}}: <b>{{authUsername}}</b></span>
              <el-tag :type="isAdmin ? 'danger' : 'info'" size="small">{{isAdmin ? $t('m.adminRole') : $t('m.viewerRole')}}</el-tag>
              <span style="flex: 1"></span>
              <el-button type="danger" plain size="small" @click="logout">{{$t('m.logout')}}</el-button>
            </div>
            <template v-if="isAdmin">
              <div class="setting-line toolbar-tip" style="margin-top: 14px;">{{$t('m.accountsTip')}}</div>
              <div class="account-list">
              <div class="account-row" v-for="user in accountList" :key="user.username">
                <span class="account-name">{{user.username}}</span>
                <el-tag :type="user.role === 'admin' ? 'danger' : 'info'" size="small">{{user.role === 'admin' ? $t('m.adminRole') : $t('m.viewerRole')}}</el-tag>
                <span class="account-actions">
                  <el-button size="small" text @click="resetAccountPassword(user.username)">{{$t('m.resetPassword')}}</el-button>
                  <el-button v-if="user.role !== 'admin'" size="small" text type="danger" @click="removeAccount(user.username)">{{$t('m.deleteAccount')}}</el-button>
                </span>
              </div>
            </div>
            <div class="setting-line" style="margin-top: 14px;">
              <el-input v-model="newAccountUsername" :placeholder="$t('m.loginUsername')" style="width: 200px; margin-right: 8px;" />
              <el-input v-model="newAccountPassword" type="password" show-password :placeholder="$t('m.loginPassword')" style="width: 200px; margin-right: 8px;" @keyup.enter="addAccount" />
              <el-select v-model="newAccountRole" style="width: 130px; margin-right: 8px;">
                <el-option :label="$t('m.viewerRole')" value="viewer"></el-option>
                <el-option :label="$t('m.adminRole')" value="admin"></el-option>
              </el-select>
              <el-button type="primary" plain @click="addAccount">{{$t('m.addAccount')}}</el-button>
            </div>
            <!-- IP 访问控制:白名单免登录 / 黑名单禁止连接 -->
            <div class="advanced-section-title" style="margin-top: 20px;">{{$t('m.ipAccessControl')}}</div>
            <div class="setting-line toolbar-tip">{{$t('m.ipWhitelistHint')}}</div>
            <div class="account-list">
              <div class="account-row" v-for="ip in ipWhitelist" :key="'w' + ip">
                <span class="account-name">{{ip}}</span>
                <el-tag type="success" size="small">{{$t('m.ipWhitelist')}}</el-tag>
                <span class="account-actions">
                  <el-button size="small" text type="danger" @click="removeIpRule('whitelist', ip)">{{$t('m.deleteAccount')}}</el-button>
                </span>
              </div>
            </div>
            <div class="setting-line" style="margin-top: 8px;">
              <el-input v-model="ipWhitelistInput" :placeholder="$t('m.ipRulePlaceholder')" style="width: 280px; margin-right: 8px;" @keyup.enter="addIpRule('whitelist')" />
              <el-button plain @click="addIpRule('whitelist')">{{$t('m.addIpRule')}}</el-button>
            </div>
            <div class="setting-line toolbar-tip" style="margin-top: 14px;">{{$t('m.ipBlacklistHint')}}</div>
            <div class="account-list">
              <div class="account-row" v-for="ip in ipBlacklist" :key="'b' + ip">
                <span class="account-name">{{ip}}</span>
                <el-tag type="danger" size="small">{{$t('m.ipBlacklist')}}</el-tag>
                <span class="account-actions">
                  <el-button size="small" text type="danger" @click="removeIpRule('blacklist', ip)">{{$t('m.deleteAccount')}}</el-button>
                </span>
              </div>
            </div>
            <div class="setting-line" style="margin-top: 8px;">
              <el-input v-model="ipBlacklistInput" :placeholder="$t('m.ipRulePlaceholder')" style="width: 280px; margin-right: 8px;" @keyup.enter="addIpRule('blacklist')" />
              <el-button plain @click="addIpRule('blacklist')">{{$t('m.addIpRule')}}</el-button>
            </div>
            <div class="setting-line" style="margin-top: 12px;">
              <el-button type="primary" plain @click="saveIpRules">{{$t('m.ipRulesSave')}}</el-button>
              <span class="setting-line toolbar-tip" style="display: inline-block; margin-left: 10px;">{{$t('m.ipRulesNote')}}</span>
            </div>
            </template>
            </template>
          </el-col>
        </el-row>
      </el-tab-pane>
      <el-tab-pane v-if="(showDesktopUI && !viewerRole) || isAdmin" :label="$t('m.usageGuide')" name="usageGuide">
        <!-- 1. 快捷键 -->
        <div class="guide-section">
          <h3 class="guide-title">{{$t('m.accelerator')}}</h3>
          <el-descriptions
            :column="2" size="small" style="margin-top: 8px;"
            v-for="group in acceleratorInfo" :key="group.group"
            :title="$t(`ac.${group.group}`)"
          >
            <el-descriptions-item v-for="(value, key) in group.accelerators" :key="value" width="22em">
              <template #label><span style="display: inline-block; min-width: 10em;">{{ $t(`ac.${group.group}_${key}`) }}</span></template>
              <el-tag>{{ value }}</el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </div>
        <!-- 2. 使用说明 -->
        <div class="guide-section">
          <h3 class="guide-title">{{$t('m.usageGuide')}}</h3>
          <div class="guide-text">{{$t('c.guideContent')}}</div>
        </div>
        <!-- 3. 关于(放在最底部) -->
        <div class="guide-section guide-about-section">
          <h3 class="guide-title">{{$t('m.about')}}</h3>
          <el-descriptions :column="1">
            <el-descriptions-item :label="$t('m.appName')+':'">exhentai-manga-manager</el-descriptions-item>
            <el-descriptions-item :label="$t('m.appPage')+':'">
              <a href="#" @click="openLink('https://github.com/SchneeHertz/exhentai-manga-manager')">github(原作者)</a>
            </el-descriptions-item>
            <el-descriptions-item :label="$t('m.updatedVersion')+':'">
              <a href="#" @click="openLink('https://github.com/universc/exhentai-manga-manager--docker-ds')">github.com/universc/exhentai-manga-manager--docker-ds</a>
            </el-descriptions-item>
          </el-descriptions>
          <!-- 更新日志 -->
          <el-divider />
          <div class="guide-section">
            <h3 class="guide-title">{{$t('m.changelog')}}</h3>
            <!-- 默认收缩,点击版本标题展开 -->
            <el-collapse class="changelog-collapse" :model-value="[]">
              <el-collapse-item
                v-for="log in changelog"
                :key="log.version"
                :name="log.version"
              >
                <template #title>
                  <span class="changelog-version">{{ log.version }}</span>
                  <span class="changelog-summary" v-if="log.summary">{{ log.summary }}</span>
                </template>
                <ul class="changelog-list">
                  <li v-for="(line, i) in log.items" :key="i">{{ line }}</li>
                </ul>
              </el-collapse-item>
            </el-collapse>
          </div>
          <img src="/icon.png" class="about-logo">
          <!-- 致谢:大肥鱼 / universc -->
          <el-divider />
          <div class="credits-section">
            <div class="credit-person">
              <img :src="'credits/dayu.png'" class="credit-avatar" alt="大肥鱼" />
              <a href="https://www.deepseek.com/" target="_blank" rel="noopener noreferrer">大肥鱼</a>
            </div>
            <div class="credit-person">
              <img :src="'credits/universc.png'" class="credit-avatar" alt="universc" />
              <a href="https://space.bilibili.com/315660852" target="_blank" rel="noopener noreferrer">universc</a>
            </div>
          </div>
          <div class="credit-note">{{$t('m.creditNote')}}</div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script setup>
import { ref, onMounted, h, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import draggable from 'vuedraggable'
import { MdRefresh, MdSync, MdShuffle, MdCodeDownload, MdBook, MdColorPalette } from '@vicons/ionicons4'
import { TreeViewAlt, CicsSystemGroup, TagGroup } from '@vicons/carbon'
import { Search32Filled, ArrowTrendingLines20Filled } from '@vicons/fluent'

import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import zhTw  from 'element-plus/dist/locale/zh-tw.mjs'
import en from 'element-plus/dist/locale/en.mjs'

import { version } from '../../package.json'
import { gh_token } from '../../secret_key.json'
import { acceleratorInfo, defaultContextMenuOptions, applyCustomTheme, applyFavicon, applyCoverStyle, applyAppName, customFontStyles, toolbarButtonDefinitions, defaultToolbarButtons, defaultUiSettings, parsePageSizes , catDisplayName, contextMenuDefinitions, resolveCatKey } from '../utils.js'
import { attachInertiaScroll } from '../inertia-scroll.js'
import NameFormItem from './NameFormItem.vue'

import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
const appStore = useAppStore()
const { searchTypeList, setting, bookList, resolvedTranslation, localeFile, tagListRaw ,
} = storeToRefs(appStore)
const { printMessage } = appStore

const { t, locale } = useI18n()

// 网页版(Docker)标志:由 web-ipc.js 从 /api/info 读取
const isWebMode = computed(() => !!window.__WEB_MODE__)
// Windows 客户端远程桌面模式(数据来自 NAS,界面按桌面模式显示)
const isRemoteDesktop = computed(() => !!window.__REMOTE_DESKTOP__)
// 桌面风格界面:本地模式 或 远程桌面模式(设置界面与本地模式一致,仅无账户栏)
const showDesktopUI = computed(() => !isWebMode.value || isRemoteDesktop.value)

// 标题翻译相关
const translationBaseUrlPlaceholder = computed(() => {
  return setting.value.titleTranslationMode === 'ollama'
    ? 'http://192.168.1.10:11434'
    : setting.value.titleTranslationMode === 'openai'
      ? 'https://api.deepseek.com/v1'
      : ''
})
const translationModelPlaceholder = computed(() => {
  return setting.value.titleTranslationMode === 'ollama'
    ? 'qwen2.5:7b'
    : setting.value.titleTranslationMode === 'openai'
      ? 'deepseek-chat'
      : ''
})

// 翻译是否启用(off 时禁用模型选择)
const translationEnabled = computed(() => {
  return !!setting.value.titleTranslationMode && setting.value.titleTranslationMode !== 'off'
})

// ---------- 显示选项 ----------
// 卡片为"填充封面 + 文字浮层"布局;各隐藏开关互相独立,不再有
// "纯图片模式"式的一键联动(每个元素是否显示由各自的开关控制)

// ---------- 工具栏按钮自定义 ----------
const toolbarIconMap = {
  folderTree: TreeViewAlt,
  search: Search32Filled,
  shuffle: MdShuffle,
  manualScan: MdRefresh,
  incrementalScan: MdSync,
  batchMetadata: MdCodeDownload,
  tagAnalysis: ArrowTrendingLines20Filled,
  manageCollection: CicsSystemGroup,
  manageTag: TagGroup,
  viewerSwitch: MdBook,
  themeSwitch: MdColorPalette,
}
const toolbarButtonsShown = computed({
  get: () => {
    const list = setting.value.toolbarButtons
    return (Array.isArray(list) && list.length) ? list : defaultToolbarButtons()
  },
  set: (val) => {
    setting.value.toolbarButtons = val
  }
})
const toolbarLabelKey = (id) => {
  return toolbarButtonDefinitions.find(b => b.id === id)?.labelKey || id
}
const toolbarButtonsAvailable = computed(() => {
  return toolbarButtonDefinitions.filter(b => !toolbarButtonsShown.value.includes(b.id))
})
const addToolbarButton = (id) => {
  if (!id || toolbarButtonsShown.value.includes(id)) return
  toolbarButtonsShown.value = [...toolbarButtonsShown.value, id]
  saveSetting()
}
const removeToolbarButton = (id) => {
  toolbarButtonsShown.value = toolbarButtonsShown.value.filter(b => b !== id)
  saveSetting()
}
const saveToolbarButtons = () => {
  saveSetting()
}
const resetToolbarButtons = () => {
  setting.value.toolbarButtons = defaultToolbarButtons()
  saveSetting()
}

// 每页条数:追加逗号,方便输入
const appendPageSizeComma = () => {
  const current = String(setting.value.customPageSizes || '')
  if (current && !current.endsWith(',') && !current.endsWith('，')) {
    setting.value.customPageSizes = current + ','
  }
  saveSetting()
}

// 每页数量选项变化:若当前每页数量不在列表中,就近切换到列表内的值,避免整页空白
const handlePageSizesChange = () => {
  const sizes = parsePageSizes(setting.value.customPageSizes)
  const current = Number(setting.value.pageSize)
  if (sizes.length && !sizes.includes(current)) {
    setting.value.pageSize = sizes.reduce((best, s) => Math.abs(s - current) < Math.abs(best - current) ? s : best, sizes[0])
  }
  saveSetting()
}

// ---------- 应用名称 ----------
const handleAppNameChange = () => {
  applyAppName(setting.value)
  saveSetting()
}

// ---------- 自定义主题 / 图标 ----------
const handleCustomThemeChange = () => {
  if (setting.value.theme === 'custom') {
    applyCustomTheme(setting.value)
  }
  saveSetting()
}
// 封面尺寸 / 间距
const handleCoverStyleChange = () => {
  applyCoverStyle(setting.value)
  saveSetting()
}
// 封面大小(整体百分比):显示当前宽相对基准 220px 的比例;
// 调整时宽度与高度(填充卡片高)按当前比例等比缩放
const coverSizePercent = computed({
  get: () => Math.round((Number(setting.value.coverWidth) || 220) / 220 * 100),
  set: (val) => {
    const k = Number(val) / 100
    if (!Number.isFinite(k) || k <= 0) return
    const w = Math.min(400, Math.max(120, Math.round((Number(setting.value.coverWidth) || 220) * k / 10) * 10))
    const h = Math.min(640, Math.max(160, Math.round((Number(setting.value.coverHeight) || 360) * k / 10) * 10))
    setting.value.coverWidth = w
    setting.value.coverHeight = h
    handleCoverStyleChange()
  }
})
// 清空主题颜色
const clearThemeColor = (kind) => {
  if (kind === 'bg') setting.value.themeCustomBg = ''
  if (kind === 'font') setting.value.themeCustomFontColor = ''
  handleCustomThemeChange()
}
const resetThemeColor = (kind) => {
  if (kind === 'primary') setting.value.themeCustomPrimary = '#409EFF'
  handleCustomThemeChange()
}
const handleCustomIconChange = () => {
  applyFavicon(setting.value)
  saveSetting()
}
const selectCustomImage = async (kind) => {
  const path = await ipcRenderer.invoke('select-file', kind === 'bg' ? t('m.themeCustomBgImage') : t('m.customIcon'))
  if (!path) return
  const imported = await ipcRenderer.invoke('import-custom-asset', path)
  if (imported?.ok) {
    if (kind === 'bg') {
      setting.value.themeCustomBgImage = imported.path
      handleCustomThemeChange()
    } else {
      setting.value.customIconPath = imported.path
      handleCustomIconChange()
    }
  } else {
    printMessage('error', imported?.error || t('c.importCustomAssetFailed'))
  }
}
const clearCustomImage = (kind) => {
  if (kind === 'bg') {
    setting.value.themeCustomBgImage = ''
    handleCustomThemeChange()
  } else {
    setting.value.customIconPath = ''
    handleCustomIconChange()
  }
}

// 可用模型列表(打开下拉时自动从 AI 服务拉取)
const translationModelOptions = ref([])
const modelsLoading = ref(false)
const testingTranslation = ref(false)
const translatingAll = ref(false)

const loadTranslationModels = async () => {
  if (!translationEnabled.value) return
  modelsLoading.value = true
  try {
    const res = await ipcRenderer.invoke('list-title-translation-models', _.cloneDeep(setting.value))
    if (res?.ok) {
      translationModelOptions.value = res.models || []
    } else {
      printMessage('warning', res?.error || t('c.modelsLoadFailed'))
    }
  } catch (e) {
    printMessage('warning', t('c.modelsLoadFailed') + ':' + (e?.message || ''))
  } finally {
    modelsLoading.value = false
  }
}

// 下拉打开时自动弹出可用模型列表
const handleModelsVisibleChange = (visible) => {
  if (visible) loadTranslationModels()
}

// ---------- AI API 配置(可命名保存多套,各功能下拉选用) ----------
const normApiBase = (u) => {
  let v = String(u || '').trim().replace(/\/+$/, '')
  if (!v) return ''
  if (!/^https?:\/\//i.test(v)) v = 'http://' + v
  return v
}
const apiHeaders = (p) => (p.apiKey ? { Authorization: 'Bearer ' + p.apiKey } : {})
const withTimeout = (ms) => {
  const c = new AbortController()
  const id = setTimeout(() => c.abort(), ms)
  return { signal: c.signal, done: () => clearTimeout(id) }
}
const addApiProfile = () => {
  if (!Array.isArray(setting.value.aiApiProfiles)) setting.value.aiApiProfiles = []
  setting.value.aiApiProfiles.push({
    id: 'api_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: 'API ' + (setting.value.aiApiProfiles.length + 1),
    baseUrl: '', model: '', apiKey: '', models: [],
  })
  saveSetting()
}
const removeApiProfile = (id) => {
  setting.value.aiApiProfiles = (setting.value.aiApiProfiles || []).filter(p => p.id !== id)
  for (const k of ['infoApiProfileId', 'infoProcessApiProfileId', 'upscaleApiProfileId', 'colorizeApiProfileId', 'ocrApiProfileId']) {
    if (setting.value[k] === id) setting.value[k] = ''
  }
  saveSetting()
}
const fetchApiModels = async (p) => {
  const base = normApiBase(p.baseUrl)
  if (!base) return printMessage('warning', t('m.apiNeedUrl'))
  p._loading = true
  const tm = withTimeout(12000)
  try {
    const res = await fetch(base + '/models', { headers: apiHeaders(p), signal: tm.signal })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const json = await res.json()
    const list = (json.data || json.models || []).map(x => (typeof x === 'string' ? x : (x.id || x.name))).filter(Boolean)
    if (!list.length) throw new Error('empty list')
    p.models = list
    if (!p.model) p.model = list[0]
    saveSetting()
    printMessage('success', t('m.apiModelsOk').replace('{n}', list.length))
  } catch (e) {
    printMessage('error', t('m.apiModelsFail') + ': ' + (e && e.message ? e.message : e))
  } finally {
    tm.done(); p._loading = false
  }
}
const testApiProfile = async (p) => {
  const base = normApiBase(p.baseUrl)
  if (!base) return printMessage('warning', t('m.apiNeedUrl'))
  p._testing = true
  const t0 = Date.now()
  let ok = false, detail = ''
  try {
    const tm = withTimeout(15000)
    try {
      const res = await fetch(base + '/models', { headers: apiHeaders(p), signal: tm.signal })
      ok = res.ok; detail = 'GET /models -> HTTP ' + res.status
    } catch (e) { detail = String(e && e.message ? e.message : e) } finally { tm.done() }
    if (!ok) {
      const tm2 = withTimeout(20000)
      try {
        const res2 = await fetch(base + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...apiHeaders(p) },
          body: JSON.stringify({ model: p.model || 'gpt-4o-mini', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
          signal: tm2.signal,
        })
        ok = res2.ok; detail = 'POST /chat/completions -> HTTP ' + res2.status
      } catch (e) { detail = String(e && e.message ? e.message : e) } finally { tm2.done() }
    }
    const ms = Date.now() - t0
    if (ok) printMessage('success', t('m.apiTestOk').replace('{ms}', ms) + ' (' + detail + ')')
    else printMessage('error', t('m.apiTestFail') + ' (' + detail + ')')
  } finally {
    p._testing = false
  }
}

const handleTranslationModeChange = (mode) => {
  // 本地/在线分别填充默认地址与模型
  if (mode === 'ollama') {
    if (!setting.value.ollamaBaseUrl) setting.value.ollamaBaseUrl = 'http://127.0.0.1:11434'
    if (!setting.value.ollamaModel) setting.value.ollamaModel = 'qwen2.5:7b'
  } else if (mode === 'openai') {
    if (!setting.value.openaiBaseUrl) setting.value.openaiBaseUrl = 'https://api.deepseek.com/v1'
    if (!setting.value.openaiModel) setting.value.openaiModel = 'deepseek-chat'
  }
  saveSetting()
  // 切换模式后自动拉取一次模型列表
  loadTranslationModels()
}

const testTitleTranslation = async () => {
  if (testingTranslation.value) return
  if (setting.value.titleTranslationMode === 'off' || !setting.value.titleTranslationMode) {
    printMessage('warning', t('c.titleTranslationNotEnabled'))
    return
  }
  testingTranslation.value = true
  try {
    const res = await ipcRenderer.invoke('test-title-translation', _.cloneDeep(setting.value))
    if (res?.ok) {
      printMessage('success', t('c.titleTranslationTestOk') + (res.result ? `:「${res.result}」` : ''))
    } else {
      printMessage('error', t('c.titleTranslationTestFailed') + (res?.error ? `:${res.error}` : ''))
    }
  } finally {
    testingTranslation.value = false
  }
}

const translateAllTitles = async (force = false) => {
  if (translatingAll.value) return
  translatingAll.value = true
  try {
    const res = await ipcRenderer.invoke('translate-book-titles-batch', force)
    if (res?.success > 0 || res?.total > 0) {
      emit('loadBookList')
      printMessage('success', t('c.titleTranslationBatchDone', { total: res.total, success: res.success, failed: res.failed }))
    } else if (res?.error) {
      printMessage('warning', res.error)
    } else if (res && res.total === 0) {
      printMessage('info', t('c.titleTranslationNoNeed'))
    }
  } finally {
    translatingAll.value = false
  }
}

// ---------- AI 角色出处查询 ----------
const characterNamesInput = ref('')
const queryingOrigins = ref(false)
const queryCharacterOrigins = async () => {
  if (queryingOrigins.value) return
  const names = characterNamesInput.value.trim()
  if (!names) {
    printMessage('warning', t('c.characterNamesEmpty'))
    return
  }
  queryingOrigins.value = true
  try {
    const res = await ipcRenderer.invoke('query-character-origins', names)
    if (res?.ok) {
      ElMessageBox.alert(
        h('pre', { style: 'white-space: pre-wrap; text-align: left; max-height: 50vh; overflow: auto; margin: 0' }, res.result || t('c.characterOriginEmpty')),
        t('m.queryCharacterOrigins'),
        { confirmButtonText: t('c.close'), showClose: true }
      )
    } else {
      printMessage('error', res?.error || t('c.characterOriginFailed'))
    }
  } catch (e) {
    printMessage('error', t('c.characterOriginFailed') + ':' + (e?.message || ''))
  } finally {
    queryingOrigins.value = false
  }
}

// ---------- AI 综合信息处理(可暂停) ----------
const aiProcessing = ref(false)
const aiTaskPaused = ref(false)
const aiProcessBatch = async (force) => {
  if (aiProcessing.value) return
  if (force) {
    try {
      await ElMessageBox.confirm(t('c.aiProcessForceWarning'), t('m.aiProcessBatchForce'), { type: 'warning' })
    } catch {
      return
    }
  }
  aiProcessing.value = true
  aiTaskPaused.value = false
  try {
    const res = await ipcRenderer.invoke('ai-process-books-batch', force)
    if (res?.success > 0 || res?.total > 0) {
      emit('loadBookList')
      printMessage('success', t('c.aiProcessBatchDone', { total: res.total, success: res.success, failed: res.failed }))
    } else if (res?.error) {
      printMessage('warning', res.error)
    } else if (res && res.total === 0) {
      printMessage('info', t('c.titleTranslationNoNeed'))
    }
  } finally {
    aiProcessing.value = false
    aiTaskPaused.value = false
    ipcRenderer.invoke('set-ai-task-paused', false)
  }
}
const toggleAiPause = async () => {
  aiTaskPaused.value = !aiTaskPaused.value
  await ipcRenderer.invoke('set-ai-task-paused', aiTaskPaused.value)
}

// ---------- 恢复全部默认 ----------
const resetAllSettings = async () => {
  try {
    await ElMessageBox.confirm(t('c.resetAllWarning'), t('m.resetAll'), {
      type: 'warning',
      confirmButtonText: t('c.resetAllConfirm'),
      cancelButtonText: t('c.cancel'),
    })
  } catch {
    return
  }
  // 保留个人数据(账户 Cookie / 库路径 / 元数据目录 / 代理等)
  const keep = {}
  for (const key of ['library', 'metadataPath', 'imageExplorer', 'igneous', 'ipb_pass_hash', 'ipb_member_id', 'star', 'proxy']) {
    if (setting.value[key] !== undefined) keep[key] = setting.value[key]
  }
  const defaults = defaultUiSettings()
  Object.assign(setting.value, defaults, keep)
  saveSetting()
  printMessage('success', t('c.resetAllDone'))
  setTimeout(() => window.location.reload(), 800)
}

const reTranslateAllTitles = () => {
  ElMessageBox.confirm(
    t('c.reTranslateAllTitlesWarning'),
    t('m.reTranslateAllTitles'),
    {}
  )
  .then(() => translateAllTitles(true))
  .catch(() => {})
}

// ---------- 右键菜单自定义 ----------
const contextMenuGroups = computed(() => [
  {
    id: 'title',
    title: t('cm.title'),
    items: [
      { id: 'copyTitle', label: t('c.copyTitleToClipboard') },
      { id: 'copyLink', label: t('c.copyLinkToClipboard') },
      { id: 'copyTitleAndLink', label: t('c.copyTitleAndLinkToClipboard') },
      { id: 'translateTitle', label: t('m.translateTitle') },
    ]
  },
  {
    id: 'cover',
    title: t('cm.cover'),
    items: [
      { id: 'getMetadata', label: t('m.getMetadata') },
      { id: 'resetMetadata', label: t('m.resetMetadata') },
      { id: 'openFileLocation', label: t('m.openMangaFileLocation') },
      { id: 'moveFile', label: t('m.moveFile') },
      { id: 'deleteFile', label: t('m.deleteFile') },
      { id: 'toggleHidden', label: `${t('m.hideManga')}/${t('m.showManga')}` },
      { id: 'copyTag', label: t('m.copyTagClipboard') },
      { id: 'pasteTag', label: t('m.pasteTagClipboard') },
      { id: 'getMetadataFromLink', label: t('m.getMetadataFromClipboardLink') },
      { id: 'translateBook', label: t('m.translateBook') },
      { id: 'upscaleBook', label: t('m.upscaleBook') },
      { id: 'colorizeBook', label: t('m.colorizeBook') },
    ]
  },
  {
    id: 'image',
    title: t('cm.image'),
    items: [
      { id: 'copyImage', label: t('c.copyImageToClipboard') },
      { id: 'setCover', label: t('c.designateAsCover') },
      { id: 'deleteImage', label: t('c.deleteImage') },
      { id: 'renameImage', label: t('m.renameImage') },
      { id: 'upscaleImage', label: t('m.upscaleImage') },
      { id: 'ocrImage', label: t('m.extractImageText') },
      { id: 'translateImage', label: t('m.translateImage') },
      { id: 'colorizeImage', label: t('m.colorize') },
    ]
  },
  {
    id: 'comment',
    title: t('cm.comment'),
    items: [
      { id: 'openLink', label: t('c.redirect') },
    ]
  },
])

const updateContextMenuOptions = (menuId, val) => {
  if (!setting.value.contextMenuOptions) setting.value.contextMenuOptions = defaultContextMenuOptions()
  setting.value.contextMenuOptions[menuId] = val
  saveSetting()
}

const resetContextMenuOptions = () => {
  setting.value.contextMenuOptions = defaultContextMenuOptions()
  saveSetting()
  printMessage('success', t('c.contextMenuResetDone'))
}

const emit = defineEmits([
  'loadBookList',
  'loadCollectionList',
])

onMounted(() => {
  ipcRenderer.invoke('load-setting')
    .then(async (res) => {
      setting.value = res
      // 网页版:管理员打开设置时加载账户列表与 IP 规则
      loadAccountList()
      loadIpRules()
      // 桌面版:同步运行模式(本地/网页)与数据目录显示
      syncRunMode()
      loadDataPath()

      // set default value
      if (res.autoCheckUpdates === undefined) setting.value.autoCheckUpdates = true
      if (res.trimTitleRegExp === undefined) setting.value.trimTitleRegExp = '^\\d+[-]?\\s*|\\s*(\\[[^\\]]*\\]|\\([^\\)]*\\)|【[^】]*】|（[^）]*）)\\s*'
      if (res.defaultScraper === undefined) setting.value.defaultScraper = 'exhentai'
      if (res.defaultInsertEmptyPage === undefined) setting.value.defaultInsertEmptyPage = true
      if (res.viewerType === undefined) setting.value.viewerType = 'original'
      // 标题翻译设置默认值(旧版 setting.json 没有这些键)
      if (res.titleTranslationMode === undefined) setting.value.titleTranslationMode = 'off'
      if (res.titleTranslationBaseUrl === undefined) setting.value.titleTranslationBaseUrl = ''
      if (res.titleTranslationModel === undefined) setting.value.titleTranslationModel = ''
      if (res.titleTranslationApiKey === undefined) setting.value.titleTranslationApiKey = ''
      // AI 配置:本地/在线分开填写(旧版共用字段自动迁移)
      if (res.ollamaBaseUrl === undefined) setting.value.ollamaBaseUrl = res.titleTranslationBaseUrl || 'http://127.0.0.1:11434'
      if (res.ollamaModel === undefined) setting.value.ollamaModel = res.titleTranslationModel || 'qwen2.5:7b'
      if (res.openaiBaseUrl === undefined) setting.value.openaiBaseUrl = res.titleTranslationBaseUrl || 'https://api.deepseek.com/v1'
      if (res.openaiModel === undefined) setting.value.openaiModel = res.titleTranslationModel || 'deepseek-chat'
      if (res.openaiApiKey === undefined) setting.value.openaiApiKey = res.titleTranslationApiKey || ''
      // 应用名称默认值
      if (res.appName === undefined) setting.value.appName = 'EX漫画管理器(exhentai-manga-manager)'
      // 右键菜单设置默认值(旧版 setting.json 没有这些键)
      if (res.contextMenuOptions === undefined) setting.value.contextMenuOptions = defaultContextMenuOptions()
  // 新增的右键菜单项自动并入(旧配置也不会丢失新项)
  for (const [menu, items] of Object.entries(contextMenuDefinitions)) {
    const saved = setting.value.contextMenuOptions[menu] || []
    setting.value.contextMenuOptions[menu] = [...new Set([...saved, ...items])]
  }
      // 卡片显示设置默认值
      if (res.hideBookmarkButton === undefined) setting.value.hideBookmarkButton = false
      if (res.hidePageCount === undefined) setting.value.hidePageCount = false
      if (res.hideReadCount === undefined) setting.value.hideReadCount = false
      if (res.hideReadButton === undefined) setting.value.hideReadButton = false
      if (res.hideNonTag === undefined) setting.value.hideNonTag = false
      if (res.hideTitle === undefined) setting.value.hideTitle = false
      if (res.hideRating === undefined) setting.value.hideRating = false
      if (res.coverWidth === undefined) setting.value.coverWidth = 220
      if (res.coverHeight === undefined) setting.value.coverHeight = 360
      // 卡片间距:旧版单值 cardGap → 拆分为 上下/左右 两个方向
      if (res.cardGapV === undefined) setting.value.cardGapV = res.cardGap !== undefined ? res.cardGap : 6
      if (res.cardGapH === undefined) setting.value.cardGapH = res.cardGap !== undefined ? res.cardGap : 6
      // 封面懒加载已是固定行为;旧"只显示封面(coverOnly)"改为独立开关「填充封面」:
      // - 曾开启 coverOnly 的用户:还原其联动隐藏项,并把新开关置为开(延续大图偏好)
      // - 其余用户:开关默认关(经典卡片布局)
      if (res.fillCover === undefined) setting.value.fillCover = !!res.coverOnly
      if (res.coverOnly) {
        for (const key of ['hideBookmarkButton', 'hidePageCount', 'hideReadCount', 'hideReadButton', 'hideNonTag', 'hideTitle', 'hideRating']) {
          setting.value[key] = false
        }
        setting.value.coverOnly = false
      }
      // 自定义主题/图标/工具栏/分页默认值
      if (res.themeCustomBg === undefined) setting.value.themeCustomBg = ''
      if (res.themeCustomBgImage === undefined) setting.value.themeCustomBgImage = ''
      if (res.themeCustomPrimary === undefined) setting.value.themeCustomPrimary = '#409EFF'
      if (res.themeCustomFontSize === undefined) setting.value.themeCustomFontSize = 14
      if (res.themeCustomFontColor === undefined) setting.value.themeCustomFontColor = ''
      if (res.themeCustomFontStyle === undefined) setting.value.themeCustomFontStyle = ''
      if (res.customIconPath === undefined) setting.value.customIconPath = ''
      if (res.toolbarButtons === undefined) setting.value.toolbarButtons = defaultToolbarButtons()
      if (res.customPageSizes === undefined) setting.value.customPageSizes = '12,24,42,72,500,5000,1000000'
      if (res.scrollInertiaLevel === undefined) setting.value.scrollInertiaLevel = 'medium'
      if (res.enableImageUpscale === undefined) setting.value.enableImageUpscale = false
      if (res.enableImageOcr === undefined) setting.value.enableImageOcr = false
      // 图片 AI 本地模型 API(旧配置无这些键时补默认值)
      if (res.upscaleApiUrl === undefined) setting.value.upscaleApiUrl = ''
      if (res.ocrApiUrl === undefined) setting.value.ocrApiUrl = ''
  if (!Array.isArray(res.aiApiProfiles)) setting.value.aiApiProfiles = []
  if (res.infoApiProfileId === undefined) setting.value.infoApiProfileId = ''
  if (res.infoProcessApiProfileId === undefined) setting.value.infoProcessApiProfileId = ''
  if (!Array.isArray(res.infoProcessTasks)) setting.value.infoProcessTasks = ['tags', 'story', 'translate']
  if (res.upscaleApiProfileId === undefined) setting.value.upscaleApiProfileId = ''
  if (res.colorizeApiProfileId === undefined) setting.value.colorizeApiProfileId = ''
  if (res.ocrApiProfileId === undefined) setting.value.ocrApiProfileId = ''
  if (res.upscaleSaveMode === undefined) setting.value.upscaleSaveMode = 'same'
    if (res.upscaleSizeMode === undefined) setting.value.upscaleSizeMode = 'scale'
    if (res.upscaleTargetWidth === undefined) setting.value.upscaleTargetWidth = 2000
  if (res.colorizeSaveMode === undefined) setting.value.colorizeSaveMode = 'same' 
      if (res.ocrApiModel === undefined) setting.value.ocrApiModel = 'qwen2.5-vl:7b'
      saveSetting()

      // default action
      if (res.theme) {
        changeTheme(res.theme)
        if (res.theme === 'custom') {
          document.documentElement.classList.add('theme-custom')
          applyCustomTheme(setting.value)
        }
      }
      await handleLanguageSet(res.language)
      if (res.showTranslation) loadTranslationFromEhTagTranslation()
      if (res.customCss) electronFunction['insert-css'](res.customCss)
      attachSettingInertiaScroll()
    })
})

const selectLibraryPath = () => {
  ipcRenderer.invoke('select-folder', t('m.library'))
  .then(res => {
    if (res) {
      setting.value.library = res
      saveSetting()
    }
  })
}

const selectMetadataPath = () => {
  ipcRenderer.invoke('select-folder', t('m.metadataPath'))
  .then(res => {
    setting.value.metadataPath = res
    saveSetting()
  })
}

const selectImageExplorerPath = () => {
  ipcRenderer.invoke('select-file', t('m.imageViewer'))
  .then(res => {
    if (res) {
      setting.value.imageExplorer = `"${res}"`
      saveSetting()
    }
  })
}

const resetImageExplorer = async () => {
  setting.value.imageExplorer = await ipcRenderer.invoke('get-default-manga-reader')
  saveSetting()
}

const loadTranslationFromEhTagTranslation = async () => {
  const resultObject = {}
  const translationCache = JSON.parse(localStorage.getItem('translationCache') || "{}")
  resolvedTranslation.value = translationCache
  ipcRenderer.invoke('update-tag-translation', translationCache)
  await fetch('https://github.com/EhTagTranslation/Database/releases/latest/download/db.text.json')
  .then(res => res.json())
  .then(res => {
    const database = Array.isArray(res) ? res : (res.data || [])

    database.forEach(namespaceObj => {
      const namespace = namespaceObj.namespace
      resultObject[namespace] = {}
      if (namespaceObj.frontMatters) {
        resultObject[namespace]._name = namespaceObj.frontMatters.name
      }
      _.forIn(namespaceObj.data, (value, key) => {
        resultObject[namespace][key] = _.pick(value, ['name', 'intro'])
      })
    })

    resolvedTranslation.value = resultObject
    ipcRenderer.invoke('update-tag-translation', resultObject)
    localStorage.setItem('translationCache', JSON.stringify(resultObject))
  })
  .catch((error) => {
    console.log(error)
    printMessage('warning', t('c.useTranslationCache'))
  })
}

const handleTranslationSettingChange = (val) => {
  if (val) {
    loadTranslationFromEhTagTranslation()
  } else {
    resolvedTranslation.value =  {}
  }
  saveSetting()
}

const testProxy = async () => {
  await fetch('https://e-hentai.org')
  .then((res) => {
    if (res.status === 200) {
      printMessage('success', t('c.proxyWorking'))
    } else {
      printMessage('error', `Error ${res.status}: ` + t('c.proxyNotWorking'))
    }
  })
  .catch((error) => {
    printMessage('error', t('c.proxyNotWorking'))
  })
}

const autoCheckUpdates = async (forceShowDialog) => {
  await fetch('https://api.github.com/repos/universc/exhentai-manga-manager--docker-ds/releases/latest', {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + gh_token,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })
  .then(res => res.json())
  .then(res => {
    const { tag_name, html_url, body } = res
    const skipVersion = localStorage.getItem('skipVersion')
    if (tag_name && tag_name !== 'v' + version && tag_name !== skipVersion) {
      ElMessageBox.confirm(
        h('pre', { innerHTML: body, style: 'font-family: Avenir, Helvetica, Arial, sans-serif; text-wrap: balance;' }),
        t('c.newVersion') + tag_name,
        {
          distinguishCancelAndClose: true,
          confirmButtonText: t('c.downloadUpdate'),
          cancelButtonText: t('c.skipVersion')
        }
      )
      .then(() => {
        ipcRenderer.invoke('open-url', html_url)
      })
      .catch((action) => {
        if (action === 'cancel') {
          localStorage.setItem('skipVersion', tag_name)
        }
      })
    } else if (forceShowDialog) {
      ElMessageBox.confirm(
        t('c.notNewVersion'),
        {
          type: 'info',
          showCancelButton: false
        }
      )
    }
  })
}

const handleThemeChange = (val) => {
  changeTheme(val)
  if (val === 'custom') {
    document.documentElement.classList.add('theme-custom')
    applyCustomTheme(setting.value)
  } else {
    document.documentElement.classList.remove('theme-custom')
  }
  saveSetting()
}

const changeTheme = (classValue) => {
  document.documentElement.setAttribute('class', classValue)
}

const handleLanguageChange = async (languageCode) => {
  await handleLanguageSet(languageCode)
  saveSetting()
}

const handleLanguageSet = async (languageCode) => {
  if (!languageCode || (languageCode === 'default')) {
    languageCode = await ipcRenderer.invoke('get-locale')
  }
  switch (languageCode) {
    case 'zh-CN':
      localeFile.value = zhCn
      locale.value = 'zh-CN'
      break
    case 'zh-TW':
      localeFile.value = zhTw
      locale.value = 'zh-TW'
      break
    case 'en-US':
    default:
      localeFile.value = en
      locale.value = 'en-US'
      break
  }
}

// 随机标签与「显示收藏标签」互斥:开启一个自动关闭另一个
// 立即落盘(绕过 500ms 防抖):这两个开关直接影响主界面,丢失会让人误以为"没生效"
const saveSettingNow = () => {
  try { ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value))) } catch (e) {}
}
const onRandomTagsChange = (val) => {
  if (val) setting.value.showCollectTag = false
  saveSettingNow()
}
const onShowCollectTagChange = (val) => {
  if (val) setting.value.randomTagsEnabled = false
  saveSettingNow()
}
// 「语言」下拉:选具体语言即启用标签翻译(供分类名/标签名显示翻译),选「默认」则关闭
const onTagLangChange = (val) => {
  setting.value.showTranslation = !!val
  if (val && typeof loadTranslationFromEhTagTranslation === 'function') loadTranslationFromEhTagTranslation()
  saveSetting()
}

const saveSetting = _.debounce(() => {
  ipcRenderer.invoke('save-setting', _.cloneDeep(setting.value))
}, 500)

// ---------- 窗口置顶开关 ----------
const handleAlwaysOnTopChange = async (val) => {
  if (!showDesktopUI.value) return
  await ipcRenderer.invoke('window-set-always-on-top', !!val)
  saveSetting()
}

// ---------- 运行模式:本地 / 网页(NAS) ----------
const runMode = ref('local')
const remoteIp = ref('')
const remotePort = ref(10000)
const syncRunMode = () => {
  const url = String(setting.value?.remoteServer || '')
  runMode.value = url ? 'remote' : 'local'
  const m = url.match(/^https?:\/\/([^:/]+)(?::(\d+))?/i)
  remoteIp.value = m ? m[1] : ''
  remotePort.value = (m && m[2]) ? Number(m[2]) : 10000
}
const handleRunModeChange = (val) => {
  // 仅切换面板预览;连接/退出由面板按钮完成
}
// 退出服务器模式:清空服务器配置并重启回本地模式
const exitServerMode = async () => {
  if (!showDesktopUI.value) return
  await ipcRenderer.invoke('switch-to-local-mode')
}
const syncRemoteServer = () => {
  const ip = (remoteIp.value || '').trim()
  const port = Number(remotePort.value)
  if (ip && port > 0 && port < 65536) {
    setting.value.remoteServer = `http://${ip}:${port}`
    saveSetting()
  }
}

// ---------- 本地模式:数据文件位置 ----------
const dataPathText = ref('')
const loadDataPath = async () => {
  if (!showDesktopUI.value) return
  const info = await ipcRenderer.invoke('get-data-path')
  if (info) dataPathText.value = info.dataPath
}
const selectDataPath = async () => {
  const folder = await ipcRenderer.invoke('select-folder', t('m.dataPath'))
  if (folder) dataPathText.value = folder
}
const saveDataPath = async () => {
  if (!dataPathText.value.trim()) return
  await ipcRenderer.invoke('set-data-path', dataPathText.value.trim())
}

// ---------- NAS 远程漫画库 ----------
const testRemoteServer = async () => {
  if (!showDesktopUI.value) return
  const url = (setting.value.remoteServer || '').trim()
  if (!url) {
    printMessage('info', t('m.remoteServerEmpty'))
    return
  }
  const res = await ipcRenderer.invoke('test-remote-server', url)
  if (res?.ok) {
    printMessage('success', t('m.remoteServerOk') + (res.version ? ` v${res.version}` : '') + (res.auth ? ` · ${t('m.remoteServerAuth')}` : ''))
  } else {
    printMessage('error', t('m.remoteServerFail') + (res?.error && res.error !== 'empty' ? `: ${res.error}` : ''))
  }
}
const relaunchRemoteMode = async () => {
  if (!showDesktopUI.value) return
  // 先把 IP/端口/账户写入配置(不走防抖),确保重启后生效
  syncRemoteServer()
  await ipcRenderer.invoke('save-setting', _.cloneDeep(setting.value))
  await ipcRenderer.invoke('relaunch-app')
}

// ---------- 网页版(Docker)账户管理:仅管理员 ----------
const isAdmin = computed(() => {
  const auth = window.__AUTH__ || {}
  return !!auth.enabled && auth.role === 'admin'
})
// 只读账户(viewer):只能看账户页
const viewerRole = computed(() => {
  const auth = window.__AUTH__ || {}
  return !!auth.enabled && auth.role === 'viewer'
})
// 网页版已登录(管理员或普通账户)
const isWebLoggedIn = computed(() => {
  const auth = window.__AUTH__ || {}
  return !!auth.enabled && !!auth.role
})
const authUsername = computed(() => {
  const auth = window.__AUTH__ || {}
  return auth.username || ''
})
// 网页版登录(设置 → 账户:未登录时直接在此登录,避免设置页整页空白)
const webLoginUsername = ref('')
const webLoginPassword = ref('')
const webLoginLoading = ref(false)
const webLoginError = ref('')
const doWebLogin = async () => {
  if (!webLoginUsername.value.trim() || !webLoginPassword.value) {
    webLoginError.value = '请输入账户与密码'
    return
  }
  webLoginLoading.value = true
  webLoginError.value = ''
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: webLoginUsername.value.trim(), password: webLoginPassword.value }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.ok === false) throw new Error(data.error || '登录失败')
    window.location.reload()
  } catch (e) {
    webLoginError.value = String((e && e.message) || e)
  } finally {
    webLoginLoading.value = false
  }
}

// 网页版退出登录(设置 → 账户)
const logout = () => {
  fetch('/api/auth/logout', { method: 'POST' })
    .catch(() => {})
    .finally(() => {
      window.location.reload()
    })
}
const accountList = ref([])
const newAccountUsername = ref('')
const newAccountPassword = ref('')
const newAccountRole = ref('viewer')
const loadAccountList = async () => {
  if (!isAdmin.value) return
  try {
    accountList.value = await ipcRenderer.invoke('auth-list-users') || []
  } catch {
    accountList.value = []
  }
}
const addAccount = async () => {
  const res = await ipcRenderer.invoke('auth-add-user', {
    username: newAccountUsername.value,
    password: newAccountPassword.value,
    role: newAccountRole.value
  })
  if (res?.ok) {
    printMessage('success', t('m.accountAdded'))
    newAccountUsername.value = ''
    newAccountPassword.value = ''
    loadAccountList()
  } else {
    printMessage('error', res?.error || t('m.accountOpFailed'))
  }
}
const removeAccount = async (username) => {
  try {
    await ElMessageBox.confirm(t('m.confirmDeleteAccount').replace('{name}', username), t('m.deleteAccount'), { type: 'warning' })
  } catch {
    return
  }
  const res = await ipcRenderer.invoke('auth-remove-user', username)
  if (res?.ok) {
    printMessage('success', t('m.accountDeleted'))
    loadAccountList()
  } else {
    printMessage('error', res?.error || t('m.accountOpFailed'))
  }
}
const resetAccountPassword = async (username) => {
  let newPassword
  try {
    const { value } = await ElMessageBox.prompt(t('m.newPasswordFor').replace('{name}', username), t('m.resetPassword'), {
      inputType: 'password',
      inputValidator: (v) => (v && v.length >= 4) ? true : t('m.passwordTooShort')
    })
    newPassword = value
  } catch {
    return
  }
  const res = await ipcRenderer.invoke('auth-change-password', { username, newPassword })
  if (res?.ok) {
    printMessage('success', t('m.passwordChanged'))
  } else {
    printMessage('error', res?.error || t('m.accountOpFailed'))
  }
}

// ---------- IP 访问控制(白名单免登录 / 黑名单禁止连接) ----------
const ipWhitelist = ref([])
const ipBlacklist = ref([])
const ipWhitelistInput = ref('')
const ipBlacklistInput = ref('')
const loadIpRules = async () => {
  if (!isAdmin.value) return
  let rules = null
  try {
    rules = await ipcRenderer.invoke('auth-get-ip-rules')
  } catch {
    rules = null
  }
  if (rules) {
    ipWhitelist.value = [...rules.whitelist]
    ipBlacklist.value = [...rules.blacklist]
  }
}
const addIpRule = (kind) => {
  const input = kind === 'whitelist' ? ipWhitelistInput : ipBlacklistInput
  const list = kind === 'whitelist' ? ipWhitelist : ipBlacklist
  const value = input.value.trim()
  if (!value) return
  if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(value)) {
    printMessage('error', t('m.ipRuleInvalid'))
    return
  }
  if (!list.value.includes(value)) list.value.push(value)
  input.value = ''
}
const removeIpRule = (kind, ip) => {
  const list = kind === 'whitelist' ? ipWhitelist : ipBlacklist
  list.value = list.value.filter(item => item !== ip)
}
const saveIpRules = async () => {
  const res = await ipcRenderer.invoke('auth-set-ip-rules', {
    whitelist: ipWhitelist.value,
    blacklist: ipBlacklist.value
  })
  if (res?.ok) {
    printMessage('success', t('m.ipRulesSaved'))
    loadIpRules()
  } else {
    printMessage('error', res?.error || t('m.accountOpFailed'))
  }
}

const openLink = (link) => {
  ipcRenderer.invoke('open-url', link)
}

const forceGeneBookList = async () => {
  dialogVisibleSetting.value = false
  localStorage.setItem('viewerReadingProgress', JSON.stringify([]))
  bookList.value = await ipcRenderer.invoke('force-gene-book-list')
  emit('loadCollectionList')
  printMessage('success', t('c.rebuildMessage'))
}
const patchLocalMetadata = async () => {
  await ipcRenderer.invoke('patch-local-metadata')
  emit('loadBookList')
}


const exportDatabase = async () => {
  const folder = await ipcRenderer.invoke('select-folder', t('c.exportFolder'))
  const result = await ipcRenderer.invoke('export-database', folder)
  if (result) printMessage('success', t('c.exportMessage'))
}

const importDatabase = async () => {
  const collectionListPath = await ipcRenderer.invoke('select-file', t('c.selectCollectionList'), [{name: 'JSON', extensions: ['json']}])
  const metadataSqlitePath = await ipcRenderer.invoke('select-file', t('c.selectMetadataSqlite'), [{name: 'SQLite', extensions: ['sqlite']}])
  await ipcRenderer.invoke('import-database', {collectionListPath, metadataSqlitePath})
}

const importMetadataFromSqlite = async () => {
  const {success, bList} = await ipcRenderer.invoke('import-sqlite', _.cloneDeep(bookList.value))
  if (success) {
    bookList.value = bList
    printMessage('success', t('c.importMessage'))
  } else {
    printMessage('info', t('c.canceled'))
  }
}

const formTagAdd = ref({
  tag: null,
  color: '#42A5F5'
})

const tagListForCollect = computed(() => {
  if (setting.value.showTranslation) {
    return tagListRaw.value.map(({letter, cat, tag, id}) => {
      const labelHeader = resolvedTranslation.value[cat]?._name || cat
      const labelTail = resolvedTranslation.value[cat]?.[tag]?.name || tag
      return {
        label: `${labelHeader}:${labelTail} || ${letter}:"${tag}"$`,
        value: id
      }
    })
  } else {
    return tagListRaw.value.map(({letter, cat, tag, id}) => {
      return {
        label: `${cat}:${tag} || ${letter}:"${tag}"$`,
        value: id
      }
    })
  }
})

const moderateSoftColors = [
  '#FF6F61', // 略微柔和但鲜艳的珊瑚红
  '#F48FB1', // 鲜明的粉红色
  '#42A5F5', // 鲜艳的蓝色
  '#66BB6A', // 鲜艳的绿色
  '#FFCA28', // 亮黄色
  '#AB47BC', // 鲜亮的紫色
  '#26A69A', // 热带青色
  '#FFA726', // 鲜亮的橙色
  '#8D6E63', // 保存自然的棕色
  '#78909C'  // 鲜明的灰蓝色
]

const addTagToCollect = () => {
  const tag = tagListRaw.value.find(tag => tag.id === formTagAdd.value.tag)
  if (!setting.value.collectTag) setting.value.collectTag = []
  setting.value.collectTag.push({
    id: tag.id,
    letter: tag.letter,
    cat: tag.cat,
    tag: tag.tag,
    color: formTagAdd.value.color
  })
  setting.value.collectTag = _.uniqBy(setting.value.collectTag, 'id')
  formTagAdd.value.tag = null
  saveSetting()
}

const removeTag = (id) => {
  setting.value.collectTag = setting.value.collectTag.filter(tag => tag.id !== id)
  saveSetting()
}

// ---------- 标签设置:当前库中的全部标签 ----------
const tagColorPopupId = ref(null)
const selectedTagCat = ref(null)
const allTagsGroups = computed(() => {
  const groups = []
  const map = {}
  const seen = new Set()
  for (const tag of tagListRaw.value) {
    // 去重:同一「分类::标签」只保留一项;分类名中英混用(角色/character)统一后合并
    const uniqKey = resolveCatKey(tag.cat) + '::' + tag.tag
    if (seen.has(uniqKey)) continue
    seen.add(uniqKey)
    // 分组同样按英文分类名归一:「parody」与「作品」合并为一个分组,避免出现两个同名分组
    const normCat = resolveCatKey(tag.cat)
    if (!map[normCat]) {
      map[normCat] = { cat: normCat, tags: [] }
      groups.push(map[normCat])
    }
    const labelTail = setting.value.showTranslation ? (resolvedTranslation.value[tag.cat]?.[tag.tag]?.name || tag.tag) : tag.tag
    map[normCat].tags.push({ id: tag.id, cat: tag.cat, tag: tag.tag, letter: tag.letter, label: labelTail })
  }
  return groups
})
const categoryLabel = (cat) => {
  return setting.value.showTranslation ? (resolvedTranslation.value[cat]?._name || cat) : cat
}
// 标签名后加括号显示前 3 个所属集合(被哪些集合包含),如 光辉(碧蓝航线,女)
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
// 双击标签 → 编辑多语言名称(中/日/英),按「目标语言标签」显示
const tagEditVisible = ref(false)
const tagEditItem = ref(null)
const tagEditLangs = ref({ 'default': '', 'zh-CN': '', 'zh-TW': '', ja: '', en: '' })
const openTagNameEditor = (tag) => {
  tagRelationPick.value = ''
  if (!tag || !tag.cat || !tag.tag) return
  const rec = (setting.value.tagNameLangs || {})[tag.cat + '::' + tag.tag] || {}
  tagEditLangs.value = { 'default': rec['default'] || '', 'zh-CN': rec['zh-CN'] || '', 'zh-TW': rec['zh-TW'] || '', ja: rec.ja || '', en: rec.en || '' }
  tagEditItem.value = tag
  tagEditVisible.value = true
}
// ---------- 关联标签(包含 / 被包含) ----------
const tagRelationPick = ref('')
const tagRelationKind = ref('contains')
const keyLabel = (k) => { const p = String(k).split('::'); return p.length === 2 ? categoryLabel(p[0]) + ':' + p[1] : k }
const tagRelationCat = ref('')
const tagRelationCats = computed(() => (allTagsGroups.value || []).map(g => ({ value: g.cat, label: categoryLabel(g.cat) })))
const tagRelationOptions = computed(() => {
  const it = tagEditItem.value
  const selfKey = it ? it.cat + '::' + it.tag : ''
  const out = []
  for (const g of (allTagsGroups.value || [])) {
    if (tagRelationCat.value && g.cat !== tagRelationCat.value) continue
    for (const t of (g.tags || [])) {
      const k = t.cat + '::' + t.tag
      if (k === selfKey) continue
      out.push({ value: k, label: t.tag })
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
const tagRelationList = computed(() => {
  const it = tagEditItem.value
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
  emit('loadBookList')
}
const addTagRelation = async () => {
  const it = tagEditItem.value
  const pick = tagRelationPick.value
  if (!it || !pick) return
  const selfKey = it.cat + '::' + it.tag
  if (!setting.value.tagRelations) setting.value.tagRelations = {}
  if (tagRelationKind.value === 'contains') {
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
  tagRelationPick.value = ''
  await saveRelations()
}
const removeTagRelation = async (r) => {
  const it = tagEditItem.value
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

const saveTagNames = async () => {
  const it = tagEditItem.value
  if (!it) return
  if (!setting.value.tagNameLangs) setting.value.tagNameLangs = {}
  const key = it.cat + '::' + it.tag
  const lang = {
    'default': (tagEditLangs.value['default'] || '').trim(),
    'zh-CN': (tagEditLangs.value['zh-CN'] || '').trim(),
    'zh-TW': (tagEditLangs.value['zh-TW'] || '').trim(),
    ja: (tagEditLangs.value.ja || '').trim(),
    en: (tagEditLangs.value.en || '').trim(),
  }
  if (!lang['default'] && !lang['zh-CN'] && !lang['zh-TW'] && !lang.ja && !lang.en) delete setting.value.tagNameLangs[key]
  else setting.value.tagNameLangs[key] = { ...(setting.value.tagNameLangs[key] || {}), ...lang }
  await ipcRenderer.invoke('save-setting', JSON.parse(JSON.stringify(setting.value)))
  tagEditVisible.value = false
  printMessage('success', t('m.saveTagNamesDone'))
  emit('loadBookList')
}
// 双击重命名标签(全库更新)
const renameTag = async (tag) => {
  try {
    const { value } = await ElMessageBox.prompt(t('c.renameTagPrompt'), t('m.renameTag'), { inputValue: tag.tag })
    const newName = String(value || '').trim()
    if (!newName || newName === tag.tag) return
    const res = await ipcRenderer.invoke('rename-tag', { cat: tag.cat, oldName: tag.tag, newName })
    if (res?.ok) {
      // 同步已收藏的标签条目
      if (setting.value.collectTag) {
        setting.value.collectTag = setting.value.collectTag.map(item => {
          return item.id === tag.id ? { ...item, id: `${tag.cat}:${newName}`, tag: newName } : item
        })
      }
      saveSetting()
      emit('loadBookList')
      printMessage('success', t('c.renameTagDone', { count: res.count }))
    } else {
      printMessage('error', res?.error || t('c.renameTagFailed'))
    }
  } catch (e) {
    // 用户取消
  }
}
const collectedTagMap = computed(() => {
  const map = {}
  for (const item of setting.value.collectTag || []) map[item.id] = item
  return map
})
const toggleCollectTag = (tag) => {
  if (!setting.value.collectTag) setting.value.collectTag = []
  const idx = setting.value.collectTag.findIndex(t => t.id === tag.id)
  if (idx >= 0) {
    setting.value.collectTag.splice(idx, 1)
  } else {
    setting.value.collectTag.push({ id: tag.id, letter: tag.letter, cat: tag.cat, tag: tag.tag, color: '#42A5F5' })
  }
  saveSetting()
}
// 长按收藏:按住标签 600ms 触发收藏/取消收藏
let longPressCollectTimer = null
const startLongPressCollect = (tag) => {
  cancelLongPressCollect()
  longPressCollectTimer = setTimeout(() => {
    longPressCollectTimer = null
    toggleCollectTag(tag)
  }, 600)
}
const cancelLongPressCollect = () => {
  if (longPressCollectTimer) {
    clearTimeout(longPressCollectTimer)
    longPressCollectTimer = null
  }
}
const applyTagColor = (tag, color) => {
  const list = setting.value.collectTag || []
  const item = list.find(t => t.id === tag.id)
  if (item) {
    item.color = color
  } else {
    list.push({ id: tag.id, letter: tag.letter, cat: tag.cat, tag: tag.tag, color })
  }
  setting.value.collectTag = [...list]
  tagColorPopupId.value = null
  saveSetting()
}

const reloadWindow = () => {
  window.location.reload()
}

// 信息处理:可生成标签的分类(取自现有标签栏)
const tagCategoryKeys = computed(() => {
  const set = new Set()
  for (const t of (tagListRaw.value || [])) { if (t && t.cat) set.add(t.cat) }
  for (const b of (bookList.value || [])) { for (const k of Object.keys(b.tags || {})) set.add(k) }
  return [...set]
})
const tagCategoryLabel = (c) => ((resolvedTranslation.value && resolvedTranslation.value[c] && resolvedTranslation.value[c]._name) || catDisplayName(c))

const dialogVisibleSetting = ref(false)
// 更新日志(关于页展示;新版本加在数组最前面)
const changelog = [
  {
    version: 'v1.10.0',
    summary: 'AI 功能改造修复批次:双击封面 / 收藏标签 / 标签去重 / 超分尺寸 / 标签多语言 / 标签关联',
    items: [
      '修复双击封面无反应(事件名大小写不匹配)',
      '修复设置页显示原始 key(locale 命名空间错位 + 补齐 5 个缺失键)',
      '修复收藏标签在主界面不显示(分类名中英文映射兼容)',
      '修复标签栏重复项(按 分类::标签 去重,中英分类名合并)',
      '收藏标签 / 随机标签开关改为立即保存,避免勾选后未落盘',
      '非管理员 / 未登录时设置页显示账户页(可在设置内登录或退出)',
      '修复重启后服务无法启动(sqlite3 原生模块被 electron-builder 误删)',
      '图片超分:新增「输出尺寸」(按倍数 / 按目标宽度),倍数扩展为 1.5 / 2 / 3 / 4 / 6 / 8',
      '标签多语言名称:默认 / 简体 / 繁体 / 英文 / 日文 五种,双击标签即可编辑',
      '标签关联(包含 / 被包含):标签名后自动括号显示前 3 个所属集合',
      '收藏标签 / 随机标签 / 语言 三项同排;「目标语言标签」改为「语言」;「AI 基础功能」改为「功能」',
    ]
  },
  {
    version: 'v1.9.8',
    summary: '扫描优化 / 详情页重构 / 标签网格选择 / 移动端适配',
    items: [
      '扫描优化:压缩包只解压一次、去掉冗余整文件复制、同一文件只算一次哈希(封面懒加载)',
      '封面加载动画只覆盖封面区域,不再遮挡标题与角标',
      '详情页:故事简介字段(可编辑,随元数据同步)',
      '详情页:封面 / 标题 / 按钮 / 评分统一宽度并居中对齐,窗口缩放不再错位',
      '点击策略可配置:单击封面、双击封面、阅、读、页数 → 详细界面 / 内容界面 / 缩略图',
      '标签选择:框与原选择框一致(可直接打字筛选、回车新建),下拉里标签按一排一排网格平铺,宽度与输入框一致',
      '标签分类名内置中文兜底(角色 / 作品 / 社团 …),不再依赖联网词库',
      '长按卡片上的收藏标签(或右键)打开简易标签编辑器:按标签筛选 / 重命名(全库) / 删除(全库) / 从本书移除',
      '打开所在目录:网页版与远程桌面模式改为新标签页浏览 NAS 文件夹',
      '编辑信息按钮调整:移除「AI 信息处理」,改为「查询角色出处 / 翻译」,新增「超分辨率 / 上色」(占位)',
      '界面模式(自动 / 手机 / 平板 / 桌面)文案补全;手机端两列布局、分页不再横向溢出',
      '版本号 1.9.8;关于页移除帮助/捐赠入口,新增本仓库链接与更新日志',
    ]
  },
  {
    version: 'v1.9.7',
    summary: '封面懒加载 / 跨平台共享数据库(上游 v1.9.7 基线)',
    items: [
      '封面懒加载(默认开启):扫描建库不再批量生成封面,浏览到哪本按需生成',
      '跨平台共享数据库:Windows 桌面版与 Docker 网页版读写同一份数据库与封面目录',
      '封面清理修复:按文件名统一对比,避免误删另一端路径引用的封面',
    ]
  },
]
const activeSettingPanel = ref('general')

// 设置页内容区惯性滚动(对话框打开/挂载后各尝试一次)
let settingInertiaDetach = null
const attachSettingInertiaScroll = () => {
  const el = document.querySelector('.setting-tabs .el-tabs__content')
  if (el && !settingInertiaDetach) {
    settingInertiaDetach = attachInertiaScroll(el)
  }
  // 网页版只读账户 / 未登录:强制停留在「账户」页(仅此页可见,含登录或退出登录)
  if (viewerRole.value || (isWebMode.value && !isWebLoggedIn.value)) {
    activeSettingPanel.value = 'accounts'
  }
  // 每次打开对话框都刷新账户列表与 IP 规则(网页版管理员)
  loadAccountList()
  loadIpRules()
  // 同步运行模式与数据目录(桌面版)
  syncRunMode()
  loadDataPath()
}

defineExpose({
  dialogVisibleSetting,
  activeSettingPanel,
  saveSetting
})

</script>

<style lang="stylus">
.setting-title
  margin:0
  text-align: center
.setting-line
  margin: 6px 0
  .el-input-group__prepend
    width: 110px
.setting-line.regexp
  .el-input__inner
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace
.setting-line.collect-tag
  .el-form-item
    margin-bottom: 0
  .el-tag
    margin-right: 8px
    margin-bottom: 8px
    border-width: 0
// 标签设置:当前库中的全部标签
.tag-cat-list
  display: flex
  flex-wrap: wrap
  gap: 6px
  margin-bottom: 8px
  .tag-cat-chip
    cursor: pointer
.all-tags-list
  max-height: 260px
  overflow-y: auto
  text-align: left
  padding: 4px 2px
  .tag-group
    margin-bottom: 8px
    .tag-group-title
      font-size: 12px
      font-weight: 600
      color: var(--el-text-color-secondary)
      margin: 6px 0 4px
  .all-tag-item
    cursor: pointer
    margin-right: 8px
    margin-bottom: 8px
    transition: transform .15s ease
    &:hover
      transform: scale(1.05)
.tag-color-dot
  display: inline-block
  width: 10px
  height: 10px
  border-radius: 50%
  margin-right: 5px
  vertical-align: middle
  cursor: pointer
.setting-switch
  text-align: left
  margin-top: 6px
.translation-tip
  color: var(--el-text-color-secondary)
  font-size: 12px
  line-height: 1.6
  white-space: pre-line
// 功能按钮行:等宽弹性排列,自动换行
.function-button-row
  display: flex
  flex-wrap: wrap
  gap: 8px
  .function-button, > .el-button
    flex: 1 1 130px
    width: auto
    margin: 0
.label-input>.el-input__wrapper
  display: none
.label-input
  .el-input-group__append
    width: calc(100% - 140px)
    padding: 0
    background-color: transparent
    border-left: solid 1px var(--el-border-color)
    .el-select
      width: 100%
.about-logo
  width: 160px
  display: block
  margin: 12px auto 0

// 致谢区:大肥鱼 / universc
.credits-section
  display: flex
  justify-content: center
  gap: 48px
  margin-top: 8px
  .credit-person
    display: flex
    flex-direction: column
    align-items: center
    gap: 8px
    .credit-avatar
      width: 72px
      height: 72px
      border-radius: 50%
      object-fit: cover
      border: solid 2px var(--el-border-color)
    a
      font-size: 14px
      color: var(--el-color-primary, #409eff)
      text-decoration: none
      &:hover
        text-decoration: underline
.credit-note
  margin-top: 14px
  text-align: center
  font-size: 13px
  color: var(--el-text-color-secondary, #888)

// 使用说明页排版
.guide-section
  text-align: left
  margin-top: 14px
  padding: 0 4px 12px
  border-bottom: solid 1px var(--el-border-color-lighter, var(--el-border-color))
  &:last-child
    border-bottom: none
  .guide-title
    margin: 0 0 4px
    font-size: 15px
    color: var(--el-text-color-primary)
  .guide-text
    color: var(--el-text-color-regular)
    font-size: 13px
    line-height: 1.8
    white-space: pre-line
.guide-about-section
  .el-descriptions
    margin-top: 8px

.setting-tabs
  // 标签栏均分居中
  .el-tabs__header
    .el-tabs__nav-wrap
      .el-tabs__nav
        display: flex
        width: 100%
        .el-tabs__item
          flex: 1
          justify-content: center
          padding: 0 4px
  .el-tabs__content
    max-height: 70vh
    overflow-y: auto
    padding-right: 10px
    scroll-behavior: smooth
    overscroll-behavior: contain
    -webkit-overflow-scrolling: touch
  .context-menu-group
    border: solid 1px var(--el-border-color)
    border-radius: 6px
    padding: 10px 12px
    margin-bottom: 8px
    .context-menu-title
      font-weight: 600
      margin-bottom: 8px
      text-align: left
    .el-checkbox-group
      display: flex
      flex-wrap: wrap
      gap: 4px 16px
      text-align: left
    .el-checkbox
      margin-right: 0
  // 关于页:更新日志(默认收缩,点击展开)
  .changelog-collapse
    border-top: none
    .el-collapse-item__header
      height: auto
      min-height: 36px
      line-height: 1.5
      padding: 6px 0
      font-weight: 600
    .changelog-version
      color: var(--el-color-primary)
    .changelog-summary
      margin-left: 8px
      font-size: 12px
      font-weight: 400
      color: var(--el-text-color-secondary)
    .el-collapse-item__content
      padding-bottom: 8px
    .changelog-list
      margin: 0
      padding-left: 18px
      li
        font-size: 12px
        line-height: 1.7
        color: var(--el-text-color-regular)
        list-style: disc
  .changelog-box
    margin-top: 6px
    border: 1px solid var(--el-border-color-lighter)
    border-radius: 8px
    padding: 10px 12px
    background-color: var(--el-fill-color-extra-light, transparent)
    text-align: left
    max-height: 320px
    overflow-y: auto
    .changelog-item + .changelog-item
      margin-top: 10px
      border-top: 1px dashed var(--el-border-color-lighter)
      padding-top: 10px
    .changelog-version
      font-weight: 600
      font-size: 13px
      color: var(--el-color-primary)
      margin-bottom: 4px
    .changelog-list
      margin: 0
      padding-left: 18px
      li
        font-size: 12px
        line-height: 1.7
        color: var(--el-text-color-regular)
        list-style: disc
  // 高级页分区标题(与下方行距统一,视觉更整齐)
  .advanced-section-title
    font-weight: 600
    font-size: 13px
    color: var(--el-text-color-primary)
    border-left: 3px solid var(--el-color-primary)
    padding-left: 8px
    margin: 18px 0 10px
    line-height: 18px
    text-align: left
    &:first-child
      margin-top: 4px
  // 设置项说明文字(灰字小提示)
  .setting-hint
    font-size: 12px
    line-height: 1.6
    color: var(--el-text-color-secondary)
    margin: 2px 0 6px
    text-align: left
  // 高级页里的行:统一左右对齐与间距
  .el-tab-pane > .el-row
    .el-col
      padding-bottom: 2px
  // 工具栏按钮编辑
  .toolbar-section-label
    font-size: 12px
    color: var(--el-text-color-secondary)
    margin-bottom: 6px
    text-align: left
  .toolbar-sort-list
    display: flex
    flex-wrap: wrap
    gap: 8px
    .toolbar-sort-item
      display: flex
      align-items: center
      gap: 6px
      padding: 4px 8px 4px 10px
      border: solid 1px var(--el-border-color)
      border-radius: 16px
      background-color: var(--el-fill-color-light)
      cursor: grab
      transition: box-shadow .2s ease, transform .2s ease
      &:hover
        box-shadow: 0 2px 8px rgba(0, 0, 0, .1)
      .drag-handle
        color: var(--el-text-color-secondary)
        font-size: 14px
        cursor: grab
      .toolbar-item-icon
        color: var(--el-color-primary)
      .toolbar-sort-label
        font-size: 13px
      .toolbar-remove-btn
        margin: 0
        padding: 2px 4px
  .toolbar-hidden-list
    display: flex
    flex-wrap: wrap
    gap: 8px
    .toolbar-hidden-tag
      cursor: pointer
      transition: transform .2s ease
      &:hover
        transform: scale(1.05)
  .toolbar-tip
    color: var(--el-text-color-secondary)
    font-size: 12px
    text-align: left
  // 自定义主题面板
  .custom-theme-panel
    border: solid 1px var(--el-border-color)
    border-radius: 8px
    padding: 4px 14px
    .theme-row
      display: flex
      align-items: center
      gap: 12px
      padding: 9px 0
      border-bottom: dashed 1px var(--el-border-color-lighter, var(--el-border-color))
      &:last-child
        border-bottom: none
      .theme-label
        width: 88px
        flex: 0 0 88px
        text-align: right
        font-size: 13px
        color: var(--el-text-color-regular)
      .theme-value
        flex: 1
        display: flex
        align-items: center
        gap: 8px
        min-width: 0
        .el-input, .el-select
          flex: 1
        .el-color-picker
          flex: 0 0 auto
  // 恢复全部默认
  .reset-all-row
    margin-top: 18px
    padding-top: 12px
    border-top: solid 1px var(--el-border-color-lighter, var(--el-border-color))
  // 账户管理
  .account-list
    .account-row
      display: flex
      align-items: center
      gap: 10px
      padding: 7px 4px
      border-bottom: dashed 1px var(--el-border-color-lighter, var(--el-border-color))
      .account-name
        min-width: 160px
        font-weight: 500
      .account-actions
        margin-left: auto
    text-align: center
</style>