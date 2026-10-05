import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';


export default [
  { files: ['**/*.{js,mjs,cjs,vue}'] },
  { files: ['**/*.js'], languageOptions: { sourceType: 'commonjs' } },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        // 项目里直接用到的全局(preload 注入 / main.js 挂载)
        ipcRenderer: 'readonly',
        electronFunction: 'readonly',
        _: 'readonly',
        __WEB_MODE__: 'readonly',
        __REMOTE_DESKTOP__: 'readonly',
        __AUTH__: 'readonly',
      },
    },
  },
  ...pluginVue.configs['flat/essential'],
  {
    rules: {
      'no-const-assign': 'error',
      // 抓「用了没 import 的变量」——这类错构建期不报、只在运行时炸(例如 ElMessageBox)
      'no-undef': 'error',
      'vue/multi-word-component-names': ['error', {
        'ignores': ['Setting']
      }]
    }
  },
]