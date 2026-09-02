// 网页版入口
// 用法: node web.js   (需要先 npm run build 构建前端)
// 可选环境变量:
//   WEB_PORT     端口,默认 23787
//   WEB_DATA_DIR 数据目录,默认复用桌面版数据目录(存在时)或项目下 data/
process.env.WEB_MODE = '1'

// 让 require('electron') 返回兼容层,使主进程代码可以在纯 Node 下运行
const electronShim = require('./web-electron-shim.js')
const electronResolved = require.resolve('electron')
require.cache[electronResolved] = {
  id: electronResolved,
  filename: electronResolved,
  loaded: true,
  exports: electronShim,
}

require('./index.js')
