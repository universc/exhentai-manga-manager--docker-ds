#!/usr/bin/env node
/**
 * 桌面版热重载(开发用) —— npm run dev:desktop
 *
 * 为什么需要它:
 *   · 前端(src/**、index.html)改完,Electron 默认不会自己刷新,得手动关掉再开;
 *   · 主进程 / 模块(index.js、modules/**、fileLoader/**)改完更糟 —— 必须整个重启,
 *     而且单实例锁会把新进程直接踢掉(requestSingleInstanceLock),表现就是「改了没反应」。
 *
 * 做法(不引入任何新依赖,只用 electron + vite + node 自带能力):
 *   · 前端  → 起一个正常的 Vite dev server(http://localhost:5374),
 *             Electron 窗口加载它,保存即 HMR(样式/模板热替换,状态都不丢);
 *   · 主进程 → 自己递归 watch index.js / modules / fileLoader / preload*.js,
 *             **前端**文件不参与判断(那是 Vite 的活)。一变更就整体重启 Electron:
 *             先杀掉整个进程树(否则单实例锁还握着),再起一个新的。
 *   · 兜底:Electron 自己崩了 / 被用户关了也会自动重拉(只有本脚本退出才停)。
 *
 * 参数:
 *   --no-open     不自动打开 DevTools
 *   --port=5374   Vite 端口
 */
const { spawn, spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const http = require('http')

const ROOT = path.resolve(__dirname, '..')
const ELECTRON_BIN = require('electron')
const VITE_PORT = Number((process.argv.find(function (a) { return a.startsWith('--port=') }) || '').split('=')[1]) || 5374
// 可选:--inspect=9333 打开渲染进程的 DevTools 调试端口(做自动化验证 / 远程调试时用)
const DEBUG_PORT = Number((process.argv.find(function (a) { return a.startsWith('--inspect=') }) || '').split('=')[1]) || 0
const OPEN_DEVTOOLS = !process.argv.includes('--no-open')

const log = function () { console.log.apply(console, ['[dev]'].concat(Array.prototype.slice.call(arguments))) }

// 颜色(Windows 10+ 的终端都认 ANSI)
const C = { reset: '\x1b[0m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' }
const paint = function (c, s) { return C[c] + s + C.reset }

// 需要重启主进程的文件范围。
// 注意:src/ 与 index.html 故意**不在**这里面 —— 它们由 Vite HMR 处理,重启反而更慢。
const MAIN_FILES = ['index.js', 'preload.js', 'preload-remote.js', 'web-electron-shim.js', 'web-server.js']
const MAIN_DIRS = ['modules', 'fileLoader']

let viteProc = null
let electronProc = null
let restartTimer = null
let shuttingDown = false
let pendingRestart = false

// Vite 是否已经在监听(用户自己开了 npm run dev 就复用,不再起第二个)
// ⚠ 探测一律用 localhost:Vite 默认只监听 ::1(IPv6),硬写 127.0.0.1 会一直 ECONNREFUSED,
//   于是脚本卡在「等 Vite 就绪」,Electron 永远起不来(这个坑实际踩过一次)。
const VITE_HOST = '127.0.0.1'
const probe = function (timeout) {
  return new Promise(function (resolve) {
    const req = http.get({ host: VITE_HOST, port: VITE_PORT, path: '/', timeout: timeout || 600 }, function (res) {
      res.resume()
      resolve(true)
    })
    req.on('error', function () { resolve(false) })
    req.on('timeout', function () { req.destroy(); resolve(false) })
  })
}
const portAlive = function () { return probe(600) }

const waitViteReady = function () {
  return new Promise(function (resolve) {
    const started = Date.now()
    const tick = function () {
      const req = http.get({ host: VITE_HOST, port: VITE_PORT, path: '/', timeout: 800 }, function (res) {
        res.resume()
        resolve(true)
      })
      req.on('error', function () {
        if (Date.now() - started > 60000) return resolve(false)
        setTimeout(tick, 300)
      })
      req.on('timeout', function () { req.destroy(); if (Date.now() - started > 60000) resolve(false); else setTimeout(tick, 300) })
    }
    tick()
  })
}

const startVite = async function () {
  if (await portAlive()) {
    log(paint('cyan', 'Vite 已在 ' + VITE_PORT + ' 端口运行,直接复用'))
    return
  }
  log(paint('cyan', '启动 Vite dev server(:' + VITE_PORT + ')…'))
  // 用 npx 走项目本地的 vite,避免 PATH 里找不到
  viteProc = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx',
    // ★必须显式 --host 127.0.0.1:
    //   Vite 默认只绑 ::1(IPv6),而 Chromium 的 network service 把 localhost 解析成 IPv4 → 白屏;
    //   写成 --host localhost 时 Vite 又会挑一个网卡(VDS 里还是 ::1),同样连不上。
    //   钉死 IPv4 回环,谁解析都一样。
    ['vite', '--host', VITE_HOST, '--port', String(VITE_PORT), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })
  viteProc.stdout.on('data', function (d) { process.stdout.write(paint('dim', d.toString())) })
  viteProc.stderr.on('data', function (d) { process.stderr.write(paint('dim', d.toString())) })
  viteProc.on('exit', function (code) {
    viteProc = null
    if (!shuttingDown) log(paint('red', 'Vite 退出了(code=' + code + '),前端热更新不可用'))
  })
  const ok = await waitViteReady()
  log(ok ? paint('green', 'Vite 就绪') : paint('yellow', 'Vite 60 秒没起来,仍然继续(窗口可能白屏)'))
}

// Electron 会拉出一堆子进程(GPU / 渲染 / utility),只 kill 父进程会留下孤儿,
// 下一次启动就抢不到单实例锁 —— 必须整棵树带走。
const killTree = function (child) {
  if (!child || child.killed || child.exitCode !== null) return
  const pid = child.pid
  if (!pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    try { process.kill(-pid, 'SIGTERM') } catch (e) { try { child.kill('SIGTERM') } catch (e2) { /* 忽略 */ } }
  }
}

let electronStartedAt = 0
// 崩溃自愈:GPU 进程起不来时(虚拟机 / 远程桌面 / 无显卡的沙箱环境)Electron 会
// "GPU process isn't usable. Goodbye." 直接退出,而且每次退出的都很快。
// 这里按「阶梯」自动降级,只有真的起不来才往下一步走 ——
// 正常有显卡的机器永远停在第一级,不会因为开发模式就无脑关掉沙箱/GPU。
//   0 级:原样
//   1 级:--disable-gpu                      (关硬件加速)
//   2 级:--disable-gpu --no-sandbox          (容器/沙箱环境里 GPU 子进程根本起不来)
const ARG_LADDER = [
  [],
  ['--disable-gpu'],
  ['--disable-gpu', '--no-sandbox', '--disable-software-rasterizer', '--in-process-gpu']
]
let crashStreak = 0
let argLevel = 0
const startElectron = function () {
  if (shuttingDown) return
  log(paint('cyan', '启动 Electron…' + (argLevel ? '(已降级:' + ARG_LADDER[argLevel].join(' ') + ')' : '')))
  electronStartedAt = Date.now()
  const env = Object.assign({}, process.env, { EMM_DEV_HMR: '1' })
  // ★ELECTRON_RUN_AS_NODE 必须删掉。
  //   有它时 electron.exe 会退化成纯 Node,主进程里 require('electron').app 是 undefined,
  //   启动立刻炸在 modules/utils.js 的 app.isPackaged 上 —— 表现就是「一行行报错、窗口不出来」。
  //   很多终端/CI 会全局带着这个变量,所以这里无条件清掉。
  delete env.ELECTRON_RUN_AS_NODE
  const args = ['.'].concat(OPEN_DEVTOOLS ? ['--devtools'] : []).concat(ARG_LADDER[argLevel] || [])
  if (DEBUG_PORT) args.push('--remote-debugging-port=' + DEBUG_PORT)
  electronProc = spawn(ELECTRON_BIN, args, {
    cwd: ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
    detached: process.platform !== 'win32',
    env: env
  })
  electronProc.on('exit', function (code, signal) {
    electronProc = null
    if (shuttingDown || pendingRestart) return
    const lived = Date.now() - electronStartedAt
    // 活够 8 秒才算「正常退出」(用户手动关窗口);否则算崩溃
    if (lived < 8000) {
      crashStreak += 1
      // 连崩两次就往下一级降:很多「虚拟机 / 远程桌面 / 容器」环境 GPU 子进程起不来
      if (crashStreak >= 2 && argLevel < ARG_LADDER.length - 1) {
        argLevel += 1
        crashStreak = 0
        log(paint('red', '连续快速崩溃 → 降级重试:' + ARG_LADDER[argLevel].join(' ')))
        setTimeout(function () { if (!shuttingDown) startElectron() }, 600)
        return
      }
      if (crashStreak >= 3) {
        log(paint('red', '降级到底仍然崩溃,先停下。常见原因:端口被占 / 主进程报错 / 库盘不可用 —— 见上面日志'))
        shutdown(1)
        return
      }
    } else {
      crashStreak = 0
      // 稳定跑起来了:记下这套参数用它,别再往下降
      log(paint('green', '窗口已稳定运行' + (argLevel ? '(降级参数:' + ARG_LADDER[argLevel].join(' ') + ')' : '')))
    }
    // 用户自己关掉窗口 / 崩了:重新拉起来(开发模式下窗口退出不该结束整个流程)
    log(paint('yellow', 'Electron 退出(code=' + code + ' signal=' + (signal || '-') + '),1.2 秒后自动重启…'))
    setTimeout(function () { if (!shuttingDown) startElectron() }, 1200)
  })
}

const restartElectron = function (reason) {
  if (shuttingDown) return
  pendingRestart = true
  log(paint('yellow', '主进程变更 → 重启 Electron(' + reason + ')'))
  const old = electronProc
  if (!old) {
    pendingRestart = false
    startElectron()
    return
  }
  // 等它真的退出再拉起,否则单实例锁还握着,新进程会立刻自杀
  const done = function () {
    pendingRestart = false
    startElectron()
  }
  const timer = setTimeout(done, 2500)
  old.once('exit', function () { clearTimeout(timer); done() })
  killTree(old)
}

// ---------- 主进程文件监听(自己实现,不依赖 chokidar) ----------
const watched = new Set()
const addWatch = function (file) {
  const abs = path.resolve(file)
  if (watched.has(abs) || !fs.existsSync(abs)) return
  try {
    const watcher = fs.watch(abs, { persistent: true }, function () {
      // 编辑器保存常触发 2 次(rename + change),用防抖合并
      clearTimeout(restartTimer)
      restartTimer = setTimeout(function () { restartElectron(path.relative(ROOT, abs)) }, 220)
    })
    watcher.on('error', function () { /* 文件被删/改名:忽略 */ })
    watched.add(abs)
  } catch (e) { /* 监听失败不致命 */ }
}
const watchTree = function (dir) {
  const abs = path.resolve(dir)
  if (!fs.existsSync(abs)) return
  fs.readdirSync(abs, { withFileTypes: true }).forEach(function (entry) {
    const full = path.join(abs, entry.name)
    if (entry.isDirectory()) watchTree(full)
    else if (/\.(c?js|mjs|json)$/i.test(entry.name)) addWatch(full)
  })
}
const watchMainProcess = function () {
  MAIN_FILES.forEach(function (f) { addWatch(path.join(ROOT, f)) })
  MAIN_DIRS.forEach(function (d) { watchTree(path.join(ROOT, d)) })
  log(paint('green', '已监听主进程文件 ' + watched.size + ' 个(改主进程会自动重启)'))
}

// ---------- 收尾 ----------
const shutdown = function (code) {
  if (shuttingDown) return
  shuttingDown = true
  log('收尾…')
  if (electronProc) killTree(electronProc)
  if (viteProc) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(viteProc.pid), '/T', '/F'], { stdio: 'ignore' })
    else try { viteProc.kill('SIGTERM') } catch (e) { /* 忽略 */ }
  }
  process.exit(code || 0)
}
process.on('SIGINT', function () { shutdown(0) })
process.on('SIGTERM', function () { shutdown(0) })
process.on('SIGHUP', function () { shutdown(0) })
// 本脚本自己崩了也别把 Electron 留在后台
process.on('exit', function () { if (electronProc) killTree(electronProc) })

// ---------- 主流程 ----------
// 前面那行的 `)` 换行后紧跟 `(` 会被 JS 当成函数调用(ASI 陷阱),这里显式加分号隔开
void (async function () {
  log(paint('green', '桌面版热重载已启动'))
  await startVite()
  if (shuttingDown) return
  watchMainProcess()
  startElectron()
})()
