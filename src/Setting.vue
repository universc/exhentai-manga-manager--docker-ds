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
                    @dblclick="renameTag(tag)"
                    :title="$t('m.renameTag')"
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
                    {{ tag.label }}
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
          <el-col :span="24" class="setting-switch">
            <el-switch
              v-model="setting.showCollectTag"
              :active-text="$t('m.showCollectTag')"
              @change="saveSetting"
            />
          </el-col>
        </el-row>
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
                <template #prepend><span class="setting-label">{{$t('m.directEnter')}}</span></template>
                <el-select placeholder=" " v-model="setting.directEnter" @change="saveSetting">
                  <el-option :label="$t('m.detailPage')" value="detail"></el-option>
                  <el-option :label="$t('m.internalViewer')" value="internalViewer"></el-option>
                  <el-option :label="$t('m.externalViewer')" value="externalViewer"></el-option>
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
              v-model="setting.showTranslation"
              :active-text="$t('m.tagTranslate')"
              @change="handleTranslationSettingChange"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.skipDeleteConfirm"
              :active-text="$t('m.skipDeleteConfirm')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.disableRandomTag"
              :active-text="$t('m.disableRandomTag')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideBookmarkButton"
              :active-text="$t('m.hideBookmarkButton')"
              @change="handleHideOptionChange"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hidePageCount"
              :active-text="$t('m.hidePageCount')"
              @change="handleHideOptionChange"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideReadCount"
              :active-text="$t('m.hideReadCount')"
              @change="handleHideOptionChange"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideReadButton"
              :active-text="$t('m.hideReadButton')"
              @change="handleHideOptionChange"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideNonTag"
              :active-text="$t('m.hideNonTag')"
              @change="handleHideOptionChange"
            />
          </el-col>
          <el-col :span="6" class="setting-switch">
            <el-switch
              v-model="setting.hideTitle"
              :active-text="$t('m.hideTitle')"
              @change="handleHideOptionChange"
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
              v-model="coverOnly"
              :active-text="$t('m.coverOnly')"
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

        <!-- 卡片样式:封面大小与间距 -->
        <div class="advanced-section-title">{{$t('m.cardStyle')}}</div>
        <el-row :gutter="8">
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.coverWidth')}}</span></template>
                <el-input-number v-model="setting.coverWidth" :min="120" :max="400" :step="10" controls-position="right" @change="handleCoverStyleChange" />
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="100px">
                <template #prepend><span class="setting-label">{{$t('m.cardGap')}}</span></template>
                <el-input-number v-model="setting.cardGap" :min="0" :max="40" :step="2" controls-position="right" @change="handleCoverStyleChange" />
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
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.titleTranslationMode')}}</span></template>
                <el-select placeholder=" " v-model="setting.titleTranslationMode" @change="handleTranslationModeChange">
                  <el-option :label="$t('m.titleTranslationOff')" value="off"></el-option>
                  <el-option :label="$t('m.titleTranslationOllama')" value="ollama"></el-option>
                  <el-option :label="$t('m.titleTranslationOpenAI')" value="openai"></el-option>
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <!-- 本地 AI(Ollama):地址与模型分开填写 -->
          <el-col :span="24" v-if="setting.titleTranslationMode === 'ollama'">
            <div class="setting-line">
              <el-input v-model="setting.ollamaBaseUrl" :placeholder="translationBaseUrlPlaceholder" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.titleTranslationBaseUrl')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24" v-if="setting.titleTranslationMode === 'ollama'">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.titleTranslationModel')}}</span></template>
                <el-select
                  v-model="setting.ollamaModel"
                  filterable allow-create default-first-option
                  :loading="modelsLoading"
                  :placeholder="translationModelPlaceholder"
                  @visible-change="handleModelsVisibleChange"
                  @change="saveSetting"
                >
                  <el-option v-for="m in translationModelOptions" :key="m" :label="m" :value="m" />
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <!-- 在线 AI API:地址/模型/密钥分开填写 -->
          <el-col :span="24" v-if="setting.titleTranslationMode === 'openai'">
            <div class="setting-line">
              <el-input v-model="setting.openaiBaseUrl" :placeholder="translationBaseUrlPlaceholder" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.titleTranslationBaseUrl')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24" v-if="setting.titleTranslationMode === 'openai'">
            <div class="setting-line">
              <NameFormItem class="label-input" prependWidth="110px">
                <template #prepend><span class="setting-label">{{$t('m.titleTranslationModel')}}</span></template>
                <el-select
                  v-model="setting.openaiModel"
                  filterable allow-create default-first-option
                  :loading="modelsLoading"
                  :placeholder="translationModelPlaceholder"
                  @visible-change="handleModelsVisibleChange"
                  @change="saveSetting"
                >
                  <el-option v-for="m in translationModelOptions" :key="m" :label="m" :value="m" />
                </el-select>
              </NameFormItem>
            </div>
          </el-col>
          <el-col :span="24" v-if="setting.titleTranslationMode === 'openai'">
            <div class="setting-line">
              <el-input v-model="setting.openaiApiKey" type="password" show-password @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.titleTranslationApiKey')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-divider content-position="left">{{$t('m.titleTranslation')}}</el-divider>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line function-button-row">
              <el-button plain :loading="testingTranslation" @click="testTitleTranslation">{{$t('m.test')}}</el-button>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-divider content-position="left">{{$t('m.characterAnalysis')}}</el-divider>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="characterNamesInput" :placeholder="$t('m.characterNamesPlaceholder')" @keyup.enter="queryCharacterOrigins">
                <template #prepend><span class="setting-label">{{$t('m.characterNames')}}</span></template>
                <template #append>
                  <el-button :loading="queryingOrigins" @click="queryCharacterOrigins">{{$t('m.queryCharacterOrigins')}}</el-button>
                </template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-divider content-position="left">{{$t('m.aiInfoProcessing')}}</el-divider>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line function-button-row">
              <el-button type="primary" plain :loading="aiProcessing" @click="aiProcessBatch(false)">{{$t('m.aiProcessBatch')}}</el-button>
              <el-button plain :loading="aiProcessing" @click="aiProcessBatch(true)">{{$t('m.aiProcessBatchForce')}}</el-button>
              <el-button :type="aiTaskPaused ? 'success' : 'warning'" plain :disabled="!aiProcessing" @click="toggleAiPause">
                {{ aiTaskPaused ? $t('m.aiResume') : $t('m.aiPause') }}
              </el-button>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line toolbar-tip">{{$t('m.aiProcessTip')}}</div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-divider content-position="left">{{$t('m.imageFeatures')}}</el-divider>
            </div>
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch
              v-model="setting.enableImageUpscale"
              :active-text="$t('m.enableImageUpscale')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="12" class="setting-switch">
            <el-switch
              v-model="setting.enableImageOcr"
              :active-text="$t('m.enableImageOcr')"
              @change="saveSetting"
            />
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.upscaleApiUrl" :placeholder="$t('m.upscaleApiPlaceholder')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.upscaleApiUrl')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.ocrApiUrl" :placeholder="$t('m.ocrApiPlaceholder')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.ocrApiUrl')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line">
              <el-input v-model="setting.ocrApiModel" :placeholder="$t('m.ocrApiModelPlaceholder')" @change="saveSetting">
                <template #prepend><span class="setting-label">{{$t('m.ocrApiModel')}}</span></template>
              </el-input>
            </div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line toolbar-tip">{{$t('m.imageApiTip')}}</div>
          </el-col>
          <el-col :span="24">
            <div class="setting-line translation-tip">{{$t('m.titleTranslationTip')}}</div>
          </el-col>
        </el-row>
      </el-tab-pane>
      <!-- 账户(网页版/Docker,所有登录用户可见;管理员另有账户管理/IP 控制) -->
      <el-tab-pane v-if="isWebMode && isWebLoggedIn" :label="$t('m.accounts')" name="accounts">
        <el-row :gutter="8">
          <el-col :span="24">
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
              <a href="#" @click="openLink('https://github.com/SchneeHertz/exhentai-manga-manager')">github</a>
            </el-descriptions-item>
            <el-descriptions-item :label="$t('m.help')+':'">
              <a v-if="['zh-CN', 'zh-TW'].includes($i18n.locale)" href="#" @click="openLink('https://github.com/SchneeHertz/exhentai-manga-manager/wiki/中文说明')">github wiki</a>
              <a v-else href="#" @click="openLink('https://github.com/SchneeHertz/exhentai-manga-manager/wiki/English-Instruction')">github wiki</a>
            </el-descriptions-item>
            <el-descriptions-item :label="$t('m.donation')+':'">
              <a v-if="['zh-CN', 'zh-TW'].includes($i18n.locale)" href="#" @click="openLink('https://afdian.com/a/SeldonHorizon')">爱发电</a>
              <a v-else href="#" @click="openLink('https://www.buymeacoffee.com/schneehertz')">buy me a coffee</a>
            </el-descriptions-item>
          </el-descriptions>
          <img src="/icon.png" class="about-logo">
          <!-- 致谢:大肥鱼 / universc -->
          <el-divider />
          <div class="credits-section">
            <div class="credit-person">
              <img :src="'credits/dayu.svg'" class="credit-avatar" alt="大肥鱼" />
              <a href="https://www.deepseek.com/" target="_blank" rel="noopener noreferrer">大肥鱼</a>
            </div>
            <div class="credit-person">
              <img :src="'credits/universc.svg'" class="credit-avatar" alt="universc" />
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
import { acceleratorInfo, defaultContextMenuOptions, applyCustomTheme, applyFavicon, applyCoverStyle, applyAppName, customFontStyles, toolbarButtonDefinitions, defaultToolbarButtons, defaultUiSettings, parsePageSizes } from '../utils.js'
import { attachInertiaScroll } from '../inertia-scroll.js'
import NameFormItem from './NameFormItem.vue'

import { storeToRefs } from 'pinia'
import { useAppStore } from '../pinia.js'
const appStore = useAppStore()
const { searchTypeList, setting, bookList, resolvedTranslation, localeFile, tagListRaw } = storeToRefs(appStore)
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

// ---------- 显示选项:纯图片模式 ----------
// 勾选纯图片 → 所有隐藏项一并勾选;取消任一隐藏项 → 纯图片自动取消
const hideOptionKeys = ['hideBookmarkButton', 'hidePageCount', 'hideReadCount', 'hideReadButton', 'hideNonTag', 'hideTitle', 'hideRating']
const coverOnly = computed({
  get: () => hideOptionKeys.every(key => setting.value[key]),
  set: (val) => {
    hideOptionKeys.forEach(key => { setting.value[key] = val })
    setting.value.coverOnly = val
    saveSetting()
  }
})
const handleHideOptionChange = () => {
  setting.value.coverOnly = hideOptionKeys.every(key => setting.value[key])
  saveSetting()
}

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
    ]
  },
  {
    id: 'image',
    title: t('cm.image'),
    items: [
      { id: 'copyImage', label: t('c.copyImageToClipboard') },
      { id: 'setCover', label: t('c.designateAsCover') },
      { id: 'deleteImage', label: t('c.deleteImage') },
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
      // 卡片显示设置默认值
      if (res.hideBookmarkButton === undefined) setting.value.hideBookmarkButton = false
      if (res.hidePageCount === undefined) setting.value.hidePageCount = false
      if (res.hideReadCount === undefined) setting.value.hideReadCount = false
      if (res.hideReadButton === undefined) setting.value.hideReadButton = false
      if (res.hideNonTag === undefined) setting.value.hideNonTag = false
      if (res.hideTitle === undefined) setting.value.hideTitle = false
      if (res.hideRating === undefined) setting.value.hideRating = false
      if (res.coverWidth === undefined) setting.value.coverWidth = 220
      if (res.cardGap === undefined) setting.value.cardGap = 6
      if (res.coverOnly) {
        hideOptionKeys.forEach(key => { setting.value[key] = true })
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
  await fetch('https://api.github.com/repos/SchneeHertz/exhentai-manga-manager/releases/latest', {
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
  accountList.value = await ipcRenderer.invoke('auth-list-users') || []
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
  const rules = await ipcRenderer.invoke('auth-get-ip-rules')
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
  for (const tag of tagListRaw.value) {
    if (!map[tag.cat]) {
      map[tag.cat] = { cat: tag.cat, tags: [] }
      groups.push(map[tag.cat])
    }
    const labelTail = setting.value.showTranslation ? (resolvedTranslation.value[tag.cat]?.[tag.tag]?.name || tag.tag) : tag.tag
    map[tag.cat].tags.push({ id: tag.id, cat: tag.cat, tag: tag.tag, letter: tag.letter, label: labelTail })
  }
  return groups
})
const categoryLabel = (cat) => {
  return setting.value.showTranslation ? (resolvedTranslation.value[cat]?._name || cat) : cat
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

const dialogVisibleSetting = ref(false)
const activeSettingPanel = ref('general')

// 设置页内容区惯性滚动(对话框打开/挂载后各尝试一次)
let settingInertiaDetach = null
const attachSettingInertiaScroll = () => {
  const el = document.querySelector('.setting-tabs .el-tabs__content')
  if (el && !settingInertiaDetach) {
    settingInertiaDetach = attachInertiaScroll(el)
  }
  // 网页版只读账户:强制停留在「账户」页(仅此页可见,含退出登录)
  if (viewerRole.value) {
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
  // 高级页分区标题
  .advanced-section-title
    font-weight: 600
    font-size: 13px
    color: var(--el-text-color-primary)
    border-left: 3px solid var(--el-color-primary)
    padding-left: 8px
    margin: 16px 0 8px
    text-align: left
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