// 生成构建时间戳并写进 package.json 的自定义字段 buildTime
//
// 需求:版本号不再一路 +1,改成「当前版本号 + 构建时间戳」,例如 1.17.9+20261107-0025。
//
// 为什么时间戳放在 package.json 的自定义字段、而不是:
//   · 直接写进 "version":electron-builder / NSIS / Windows 文件版本号都不接受 "+xxx"
//     (semver build metadata 会被剥掉,NSIS VIProductVersion 只认四段数字);
//   · 单独一个 build-info.json:electron-builder 的 files 白名单不认它(实测没进 asar),
//     要多维护一处规则。
// package.json 本身一定会进 asar,所以把 buildTime 挂在这里最稳。
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const pkgPath = path.join(root, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

// version 必须是纯数字:去掉可能残留的 build metadata
const base = String(pkg.version).split('+')[0]
pkg.version = base

const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const buildTime = ''
  + now.getFullYear()
  + pad(now.getMonth() + 1)
  + pad(now.getDate())
  + '-'
  + pad(now.getHours())
  + pad(now.getMinutes())

pkg.buildTime = buildTime
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log('[stamp] 版本号: ' + base + '+' + buildTime)
