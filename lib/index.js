/**
 * dsh-eco-fixes — DeepSeek Harness 常用插件问题的一键自愈(web profile 本地插件)。
 *
 * 解决的问题:
 *   1) dsh-auto-memory 403「forbidden: loopback-only」
 *      该插件所有 /api/dsh-auto-memory/* 路由在服务端硬编码 isLoopbackRequest,
 *      只放行 Host 为 127.0.0.1/localhost/[::1] 的请求;经域名/反代访问 GUI 时
 *      整站正常,唯独这些接口 403。本插件把该函数替换为带「部署信任主机白名单」
 *      的版本(默认 dsh.122050.xyz,可配置),每次启动(含插件自身更新热加载)
 *      幂等检查——记忆插件升级覆盖了源文件后,下次启动自动重打,无需手工设置。
 *   2) dsh-builtin-browser 的 electron 二进制缺失
 *      Electron 44+ 首次使用才下载二进制;缺失时 provider 报
 *      「electron unavailable: cannot locate a spawnable Electron binary」,
 *      browser_* 工具报 BROWSER_PROVIDER_UNAVAILABLE。本插件检测到缺失后
 *      自动在 profile 目录后台执行 `npx install-electron`,并在状态里标记
 *      「需重启 dsh-web 生效」。
 *   3) 侧边栏底部按钮各占一行(设置行插件按钮不再并排;自 dsh-guard-restart
 *      迁移而来,dsh-guard-restart 已移除该功能),由 client 端按菜单勾选应用。
 *   4) 显示环境(Xvfb):共享浏览器自托管窗口需要 X 显示。勾选 displayEnv 后,
 *      幂等注入 DISPLAY 到启动脚本、生成并启用 xvfb systemd 单元;检测项含
 *      DISPLAY 环境变量 / X socket / Xvfb 可执行文件 / 单元状态。修复对
 *      运行中进程无效,状态里会标出「需重启 dsh-web 生效」。
 *
 * 所有自愈方法都是**可选项**:在「设置 → 插件 → 插件配置」的
 * 「常用插件自愈(dsh-eco-fixes)」菜单里勾选,勾选了的才会运行。
 * 菜单项与 ~/.dsh/dsh-eco-fixes.json 的 features 双向同步:
 *   - autoMemoryPatch      自动记忆(dsh-auto-memory)白名单补丁自动重打
 *   - electronAutoInstall  浏览器 electron 二进制缺失自动安装
 *   - runScriptSandboxEnv  run-dsh-web.sh 注入 ELECTRON_DISABLE_SANDBOX
 *   - sidebarFooterStack   侧边栏底部按钮各占一行(默认关闭,client 端生效)
 *   - displayEnv           显示环境(Xvfb)自动配置(默认关闭;注入 DISPLAY + 生成/启用 Xvfb 单元)
 *
 * 接口:
 *   - 每次启动自动体检修复,无需手工操作。
 *   - GET  /dsh-eco-fixes/status   查看体检状态(含 features 勾选)
 *   - POST /dsh-eco-fixes/apply    立即执行已勾选的待修复项
 *   - 配置 ~/.dsh/dsh-eco-fixes.json,见 README.md;环境变量可覆盖。
 */
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const name = 'dsh-eco-fixes'

/** 设置-插件菜单的 settings namespace 名。 */
export const SETTINGS_NS = 'dsh-eco-fixes'

// ───────────────────────── 配置 ─────────────────────────

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const CONFIG_PATH = path.join(DSH_HOME, 'dsh-eco-fixes.json')
const PATCHES_DIR = path.join(DSH_HOME, 'patches')
const LOGS_DIR = path.join(DSH_HOME, 'logs')

/** features 的默认勾选(保持历史行为:前三个默认开,footerStack/displayEnv 默认关)。 */
export function defaultFeatures() {
  return {
    autoMemoryPatch: true,
    electronAutoInstall: true,
    runScriptSandboxEnv: true,
    sidebarFooterStack: false,
    // 显示环境(Xvfb)默认关闭:是否安装/启动虚拟显示属于部署方决策
    displayEnv: false,
  }
}

export function defaultConfig() {
  return {
    // 目标 profile 根目录(记忆插件与 electron 都装在这里)
    profileRoot: '/root/.dsh/profiles/web',
    // 自动记忆接口额外放行的部署信任主机(域名/IP 均可,按 Host 主机名比对)
    trustedHosts: ['dsh.122050.xyz'],
    autoMemory: { enabled: true },
    // dsh-web 启动包装脚本(run-dsh-web.sh),用于注入 electron 运行环境变量
    runScript: '/root/.dsh/run-dsh-web.sh',
    browser: {
      // 检测到 electron 二进制缺失时自动在 profile 里跑 npx install-electron
      electron: { autoInstall: true, disableSandboxEnv: true },
    },
    // 显示环境(共享浏览器自托管窗口需要 X):勾选 displayEnv 后,本插件会幂等
    // 注入 DISPLAY 到启动脚本、并生成/启用对应的 Xvfb systemd 单元。
    display: { value: ':99', unit: 'xvfb-dsh.service', screen: '1920x1080x24' },
    // 设置-插件菜单勾选项:只有勾选的「自愈方法」才会运行(默认保持历史行为)。
    // 菜单在 设置 → 插件 → 插件配置 的「常用插件自愈(dsh-eco-fixes)」卡片里,
    // 勾选变更会同步回本配置文件。
    features: defaultFeatures(),
  }
}

export function loadConfig() {
  const base = defaultConfig()
  let fileCfg = {}
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      fileCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) || {}
    }
  } catch (e) {
    console.warn('[dsh-eco-fixes] 配置解析失败,使用默认值:', e && e.message)
  }
  const cfg = {
    ...base,
    ...fileCfg,
    autoMemory: { ...base.autoMemory, ...(fileCfg.autoMemory || {}) },
    browser: {
      electron: { ...base.browser.electron, ...((fileCfg.browser || {}).electron || {}) },
    },
    display: { ...base.display, ...(fileCfg.display || {}) },
  }
  if (process.env.DSH_ECO_RUN_SCRIPT) cfg.runScript = process.env.DSH_ECO_RUN_SCRIPT
  if (process.env.DSH_ECO_PROFILE_ROOT) cfg.profileRoot = process.env.DSH_ECO_PROFILE_ROOT
  if (process.env.DSH_ECO_DISPLAY) cfg.display.value = process.env.DSH_ECO_DISPLAY
  if (process.env.DSH_ECO_TRUSTED_HOSTS) {
    cfg.trustedHosts = process.env.DSH_ECO_TRUSTED_HOSTS.split(',').map(s => s.trim()).filter(Boolean)
  }
  if (process.env.DSH_ECO_ELECTRON_AUTO !== undefined) {
    cfg.browser.electron.autoInstall = !['0', 'false', 'off'].includes(String(process.env.DSH_ECO_ELECTRON_AUTO).toLowerCase())
  }
  return resolveFeatures(cfg)
}

/**
 * 计算生效的 features 勾选:显式 features 优先,缺失字段回退到历史配置
 * (autoMemory.enabled / browser.electron.autoInstall / browser.electron.disableSandboxEnv),
 * 保证旧配置文件升级到 v0.2.0 后行为不变。结果写回 cfg.features。
 */
export function resolveFeatures(cfg) {
  const legacy = defaultFeatures()
  legacy.autoMemoryPatch = cfg.autoMemory.enabled !== false
  legacy.electronAutoInstall = cfg.browser.electron.autoInstall !== false
  legacy.runScriptSandboxEnv = cfg.browser.electron.disableSandboxEnv !== false
  const f = { ...legacy }
  if (cfg.features && typeof cfg.features === 'object') {
    for (const key of Object.keys(legacy)) {
      if (typeof cfg.features[key] === 'boolean') f[key] = cfg.features[key]
    }
  }
  cfg.features = f
  return cfg
}

/** 把 features 勾选合并回 ~/.dsh/dsh-eco-fixes.json(菜单与文件双向同步)。 */
function persistFeatures(cfg) {
  try {
    let fileCfg = {}
    try {
      if (fs.existsSync(CONFIG_PATH)) fileCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) || {}
    } catch (e) {
      console.warn('[dsh-eco-fixes] 读取配置失败(持久化 features 前):', e && e.message)
    }
    fileCfg.features = { ...cfg.features }
    fs.mkdirSync(DSH_HOME, { recursive: true })
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(fileCfg, null, 2) + '\n')
  } catch (e) {
    console.warn('[dsh-eco-fixes] 持久化 features 失败:', e && e.message)
  }
}

function writeConfig(cfg) {
  try {
    fs.mkdirSync(DSH_HOME, { recursive: true })
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n')
  } catch (e) {
    console.warn('[dsh-eco-fixes] 写配置失败:', e && e.message)
  }
}

// ───────────────────────── 文件工具 ─────────────────────────

function writeAtomic(file, content) {
  let mode
  try { mode = fs.statSync(file).mode } catch {}
  const tmp = `${file}.eco-tmp-${process.pid}`
  fs.writeFileSync(tmp, content)
  if (mode !== undefined) { try { fs.chmodSync(tmp, mode) } catch {} }
  fs.renameSync(tmp, file)
}

function backupOnce(file, label) {
  try {
    fs.mkdirSync(PATCHES_DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const bak = path.join(PATCHES_DIR, `${label}-${stamp}`)
    fs.copyFileSync(file, bak)
    // 轻度清理:同类备份超过 10 份,删最旧的
    const list = fs.readdirSync(PATCHES_DIR)
      .filter(f => f.startsWith(label + '-'))
      .sort()
    while (list.length > 10) {
      const old = list.shift()
      try { fs.unlinkSync(path.join(PATCHES_DIR, old)) } catch {}
    }
    return bak
  } catch (e) {
    console.warn('[dsh-eco-fixes] 备份失败:', e && e.message)
    return null
  }
}

// ───────────────────────── 1) 自动记忆白名单补丁 ─────────────────────────

const MARKER = '// dsh-eco-fixes: trusted-host patch (auto-maintained)'
const AUTO_MEMORY_REL = path.join('node_modules', '@a9i5k4', 'dsh-auto-memory', 'lib', 'index.js')

/** 生成带部署信任主机白名单的 canonical 补丁函数(替换整个 isLoopbackRequest 函数)。 */
export function buildPatchedFunction(hosts) {
  const list = JSON.stringify((hosts || []).map(h => String(h).toLowerCase()))
  return `function isLoopbackRequest(req) {
  ${MARKER}
  // Hosts 由 dsh-eco-fixes 自动维护(配置:~/.dsh/dsh-eco-fixes.json 的 trustedHosts)。
  // 语义:回环 Host 维持原样;部署信任主机按 Host 主机名放行(容忍反代/端口差异),
  // 但仍要求 Origin 同主机名、Sec-Fetch-Site 非 cross-site。
  const extraTrusted = ${list}
  const address = req.socket && req.socket.remoteAddress
  const host = req.headers.host
  if (typeof host !== 'string') return false
  let hostUrl
  try { hostUrl = new URL('http://' + host) } catch { return false }
  const loopbackHost = hostUrl.hostname === '127.0.0.1' || hostUrl.hostname === 'localhost' || hostUrl.hostname === '[::1]'
  const trustedHost = extraTrusted.includes(hostUrl.hostname)
  if (!loopbackHost && !trustedHost) return false
  const loopbackAddress = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
  if (!loopbackAddress && !trustedHost) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    const originUrl = new URL(origin)
    if (trustedHost) return originUrl.hostname === hostUrl.hostname
    return originUrl.host === hostUrl.host
  } catch { return false }
}`
}

/** 定位 `function <name>(req) { ... }` 块的起止(花括号配平,支持函数体内无花括号字符串)。 */
function findFunctionBlock(src, name) {
  const start = src.indexOf(`function ${name}(req) {`)
  if (start < 0) return null
  let i = src.indexOf('{', start)
  let depth = 0
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) return { start, end: i + 1 } }
  }
  return null
}

/** 清理历史手工补丁残留的 `const EXTRA_TRUSTED_HOSTS = ...` 常量块(两行)。 */
function stripExtraConstResidue(src) {
  return src.replace(/(^|\n)const EXTRA_TRUSTED_HOSTS = [^\n]*\n(?:[^\n]*\.split\([^\n]*\n)?/g, '\n')
}

/**
 * 幂等修复自动记忆插件的 isLoopbackRequest。
 * 返回 { ok, changed, file, reason? } —— changed=true 表示本次改写了文件。
 */
export function fixAutoMemory(cfg) {
  if (!cfg.features || cfg.features.autoMemoryPatch === false) {
    return { ok: true, changed: false, skipped: 'autoMemoryPatch 未勾选(设置-插件),跳过' }
  }
  if (!cfg.autoMemory.enabled) return { ok: true, changed: false, skipped: 'autoMemory disabled' }
  const file = path.join(cfg.profileRoot, AUTO_MEMORY_REL)
  if (!fs.existsSync(file)) return { ok: false, reason: 'missing: ' + file }
  let src
  try { src = fs.readFileSync(file, 'utf8') } catch (e) { return { ok: false, reason: 'read: ' + e.message } }
  const block = findFunctionBlock(src, 'isLoopbackRequest')
  if (!block) {
    // 上游把函数签名改了(不再是 `function isLoopbackRequest(req) {`)——不硬猜,只告警
    return { ok: false, reason: 'isLoopbackRequest 块定位失败(上游签名变了?),跳过以免损坏文件' }
  }
  const current = src.slice(block.start, block.end)
  const patched = buildPatchedFunction(cfg.trustedHosts)
  if (current === patched) return { ok: true, changed: false, file }
  const bak = backupOnce(file, 'dsh-auto-memory-index.js.bak')
  const out = stripExtraConstResidue(src.slice(0, block.start) + patched + src.slice(block.end))
  try { writeAtomic(file, out) } catch (e) { return { ok: false, reason: 'write: ' + e.message } }
  return { ok: true, changed: true, file, backup: bak }
}

// ───────────────────────── 2) electron 二进制自愈 ─────────────────────────

const state = { electronInstalling: false, electronInstalledThisSession: false }

export function electronStatus(cfg) {
  const root = path.join(cfg.profileRoot, 'node_modules', 'electron')
  if (!fs.existsSync(path.join(root, 'package.json'))) {
    return { present: false, binaryOk: false, reason: 'electron 包未安装(可先 dsh plugin add electron)' }
  }
  let rel = ''
  try { rel = fs.readFileSync(path.join(root, 'path.txt'), 'utf8').trim() } catch {}
  const candidates = []
  if (rel) candidates.push(path.join(root, 'dist', rel))
  candidates.push(path.join(root, 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron'))
  const binary = candidates.find(p => { try { return fs.existsSync(p) } catch { return false } })
  return { present: true, binaryOk: !!binary, binary: binary || null, installing: state.electronInstalling }
}

/** 后台在 profile 目录执行 `npx install-electron`,输出写 /root/.dsh/logs/eco-fixes-electron.log。 */
export function kickElectronInstall(cfg) {
  if (state.electronInstalling) return { kicked: false, reason: '已在安装中' }
  if (cfg.features && cfg.features.electronAutoInstall === false) {
    return { kicked: false, reason: 'electronAutoInstall 未勾选(设置-插件),跳过' }
  }
  if (!cfg.browser.electron.autoInstall) return { kicked: false, reason: 'autoInstall 已关闭(DSH_ECO_ELECTRON_AUTO=0)' }
  try { fs.mkdirSync(LOGS_DIR, { recursive: true }) } catch {}
  const logFile = path.join(LOGS_DIR, 'eco-fixes-electron.log')
  const out = fs.openSync(logFile, 'a')
  const child = spawn('npx', ['install-electron'], {
    cwd: cfg.profileRoot,
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env },
  })
  child.unref()
  state.electronInstalling = true
  child.on('error', (e) => {
    state.electronInstalling = false
    console.warn('[dsh-eco-fixes] npx install-electron 启动失败:', e && e.message)
  })
  child.on('exit', (code) => {
    state.electronInstalling = false
    state.electronInstalledThisSession = code === 0
    console.log(`[dsh-eco-fixes] npx install-electron 结束 code=${code} 日志=${logFile}`)
  })
  return { kicked: true, logFile }
}

// ───────────────────────── 3) run-dsh-web.sh 注入 electron 运行环境 ─────────────────────────

const RUN_MARKER = '# dsh-eco-fixes: electron sandbox env'
const RUN_INJECT = `# ${RUN_MARKER} — root 下运行 electron 需禁沙箱(共享浏览器必需),由 dsh-eco-fixes 自动维护
export ELECTRON_DISABLE_SANDBOX=1
`

/**
 * 幂等地在 dsh-web 启动包装脚本里注入 ELECTRON_DISABLE_SANDBOX(避免 Chromium
 * 以 root 运行时报 "Running as root without --no-sandbox is not supported")。
 * 返回 { ok, changed, file, reason? }。下次重启 dsh-web 生效。
 */
export function patchRunScript(cfg) {
  if (cfg.features && cfg.features.runScriptSandboxEnv === false) {
    return { ok: true, changed: false, skipped: 'runScriptSandboxEnv 未勾选(设置-插件),跳过' }
  }
  if (!cfg.browser.electron.disableSandboxEnv) return { ok: true, changed: false, skipped: 'disableSandboxEnv off' }
  const file = cfg.runScript
  if (!fs.existsSync(file)) return { ok: false, reason: 'missing: ' + file }
  let src
  try { src = fs.readFileSync(file, 'utf8') } catch (e) { return { ok: false, reason: 'read: ' + e.message } }
  if (src.includes(RUN_MARKER)) return { ok: true, changed: false, file }
  const idx = src.indexOf('\nexec ')
  if (idx < 0) return { ok: false, reason: '未找到 exec 行,跳过注入' }
  const bak = backupOnce(file, 'run-dsh-web.sh.bak')
  const out = src.slice(0, idx) + '\n' + RUN_INJECT + src.slice(idx)
  try { writeAtomic(file, out) } catch (e) { return { ok: false, reason: 'write: ' + e.message } }
  return { ok: true, changed: true, file, backup: bak }
}

// ───────────────────────── 4) 显示环境(Xvfb)自愈 ─────────────────────────

const DISPLAY_MARKER = '# dsh-eco-fixes: 共享浏览器显示环境'
const DISPLAY_EXPORT_PREFIX = 'export DISPLAY='

/** 从配置解析显示环境规格(:99 / 单元名 / 分辨率)。 */
function displaySpec(cfg) {
  const d = (cfg && cfg.display) || {}
  return {
    value: String(d.value || ':99'),
    unit: String(d.unit || 'xvfb-dsh.service'),
    screen: String(d.screen || '1920x1080x24'),
  }
}

function xvfbUnitContent(spec) {
  return `[Unit]
Description=Xvfb display ${spec.value} for dsh web shared browser (dsh-builtin-browser 自托管窗口,由 dsh-eco-fixes 维护)
After=systemd-user-sessions.service

[Service]
Type=simple
# -nolisten tcp:不对外暴露 X(安全);如需 x11vnc 远程观看再另配
ExecStart=/usr/bin/Xvfb ${spec.value} -screen 0 ${spec.screen} -ac -nolisten tcp
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
`
}

/** 短超时执行 systemctl,不阻塞插件主流程。返回 { code, out }。 */
function systemctl(args) {
  try {
    const r = spawnSync('systemctl', args, { encoding: 'utf8', timeout: 5000 })
    return { code: r.status, out: (r.stdout || '').trim() }
  } catch (e) {
    return { code: -1, out: '', error: e && e.message }
  }
}

function hasSystemd() {
  try { return fs.existsSync('/run/systemd/system') } catch { return false }
}

/**
 * 检测显示环境是否就绪(纯读,不改任何东西):
 *   - Xvfb 可执行文件是否存在
 *   - X socket(/tmp/.X11-unix/X<n>)是否存在
 *   - 当前 dsh 进程的 DISPLAY 是否已指向该 display(决定「现在能否开窗」)
 *   - systemd 单元是否存在/启用/运行中
 *   - 启动脚本是否已导出 DISPLAY(决定「下次启动能否继承」)
 */
export function displayStatus(cfg) {
  const spec = displaySpec(cfg)
  const num = String(spec.value).replace(/^[^:]*:/, '').split('.')[0]
  const socket = `/tmp/.X11-unix/X${num}`
  let socketOk = false
  try { socketOk = fs.existsSync(socket) } catch {}
  const xvfb = ['/usr/bin/Xvfb', '/usr/local/bin/Xvfb'].find(p => { try { return fs.existsSync(p) } catch { return false } }) || null
  const unitPath = path.join('/etc/systemd/system', spec.unit)
  let unitPresent = false
  try { unitPresent = fs.existsSync(unitPath) } catch {}
  const sysd = hasSystemd()
  const unitActive = unitPresent && sysd ? systemctl(['is-active', spec.unit]).out === 'active' : false
  const unitEnabled = unitPresent && sysd ? systemctl(['is-enabled', spec.unit]).out === 'enabled' : false
  const envDisplay = process.env.DISPLAY || null
  let runScriptHasExport = false
  let runScriptFile = null
  try {
    runScriptFile = cfg.runScript
    const src = fs.readFileSync(cfg.runScript, 'utf8')
    runScriptHasExport = src.includes(DISPLAY_MARKER) || src.includes(DISPLAY_EXPORT_PREFIX + spec.value)
  } catch {}
  return {
    display: spec.value,
    unit: spec.unit,
    xvfb,
    socket,
    socketOk,
    envDisplay,
    envMatches: envDisplay === spec.value,
    unitPresent,
    unitActive,
    unitEnabled,
    systemd: sysd,
    runScriptFile: runScriptFile || null,
    runScriptHasExport,
    // 综合「可用」:Xvfb 在 + socket 在 + 当前进程 DISPLAY 指对
    ok: !!xvfb && socketOk && envDisplay === spec.value,
  }
}

/** 幂等地在启动脚本注入 `export DISPLAY=<value>`(紧跟 sandbox 注入块之后)。 */
export function injectDisplayExport(cfg, display) {
  const file = cfg.runScript
  if (!fs.existsSync(file)) return { ok: false, reason: 'missing: ' + file }
  let src
  try { src = fs.readFileSync(file, 'utf8') } catch (e) { return { ok: false, reason: 'read: ' + e.message } }
  if (src.includes(DISPLAY_EXPORT_PREFIX + display)) return { ok: true, changed: false, file }
  const idx = src.indexOf('\nexec ')
  if (idx < 0) return { ok: false, reason: '未找到 exec 行,跳过注入' }
  const inject = `${DISPLAY_MARKER} — 共享浏览器(Xvfb)显示环境,由 dsh-eco-fixes 自动维护(重启 dsh-web 生效)\n${DISPLAY_EXPORT_PREFIX}${display}\n`
  const bak = backupOnce(file, 'run-dsh-web.sh.bak')
  const out = src.slice(0, idx) + '\n' + inject + src.slice(idx)
  try { writeAtomic(file, out) } catch (e) { return { ok: false, reason: 'write: ' + e.message } }
  return { ok: true, changed: true, file, backup: bak }
}

/** 生成并启用 Xvfb systemd 单元(不存在才写;未运行才 enable --now)。 */
export function ensureXvfbUnit(cfg) {
  const spec = displaySpec(cfg)
  if (!hasSystemd()) return { ok: false, reason: '无 systemd(/run/systemd/system 不存在),跳过 Xvfb 单元' }
  const unitPath = path.join('/etc/systemd/system', spec.unit)
  let created = false
  if (!fs.existsSync(unitPath)) {
    try {
      fs.writeFileSync(unitPath, xvfbUnitContent(spec))
      created = true
    } catch (e) { return { ok: false, reason: 'write unit: ' + e.message } }
  }
  if (created) systemctl(['daemon-reload'])
  if (systemctl(['is-active', spec.unit]).out !== 'active') {
    const en = systemctl(['enable', '--now', spec.unit])
    if (en.code !== 0) return { ok: false, reason: 'enable --now 失败: ' + (en.out || en.error || en.code) }
  }
  return { ok: true, changed: created, unit: spec.unit, unitPath }
}

/**
 * 修复显示环境(仅勾选 displayEnv 时运行;幂等):
 *   1) 启动脚本注入 export DISPLAY(重启 dsh-web 生效);
 *   2) 生成并启用 Xvfb systemd 单元(需已安装 Xvfb;未安装只报告不自动 apt)。
 */
export function fixDisplayEnv(cfg) {
  if (!cfg.features || cfg.features.displayEnv === false) {
    return { ok: true, changed: false, skipped: 'displayEnv 未勾选(设置-插件),跳过' }
  }
  const spec = displaySpec(cfg)
  const probe = displayStatus(cfg)
  if (!probe.xvfb) {
    return { ok: false, changed: false, reason: `Xvfb 未安装(${DISPLAY_EXPORT_PREFIX}${spec.value} 对应 socket 无法提供),请先 'apt-get install -y xvfb'` }
  }
  const runFix = injectDisplayExport(cfg, spec.value)
  const unitFix = ensureXvfbUnit(cfg)
  const after = displayStatus(cfg)
  const changed = !!runFix.changed || !!unitFix.changed
  return {
    ok: runFix.ok && unitFix.ok,
    changed,
    runScript: runFix,
    unit: unitFix,
    restartNeeded: !!runFix.changed || !after.envMatches,
    status: after,
  }
}

// ───────────────────────── 状态汇总 ─────────────────────────

export function currentStatus(cfg) {
  const autoMemory = fixAutoMemory(cfg) // 只读检查时也请直接调 fix(幂等,不变则零写入)
  const electron = electronStatus(cfg)
  const runScript = patchRunScript(cfg)
  const display = displayStatus(cfg)
  const restartNeeded = state.electronInstalledThisSession || runScript.changed
    || (electron.present && !electron.binaryOk && state.electronInstalling)
    // 显示环境已勾选但当前进程 DISPLAY 未指向目标 display → 需重启继承
    || (cfg.features && cfg.features.displayEnv === true && !display.envMatches)
    || false
  return {
    at: new Date().toISOString(),
    autoMemory: {
      ok: autoMemory.ok,
      changed: !!autoMemory.changed,
      skipped: autoMemory.skipped || undefined,
      reason: autoMemory.reason || undefined,
      file: autoMemory.file ? path.relative(DSH_HOME, autoMemory.file) : undefined,
    },
    trustedHosts: cfg.trustedHosts,
    features: (cfg.features && { ...cfg.features }) || defaultFeatures(),
    display: {
      ok: display.ok,
      enabled: !!(cfg.features && cfg.features.displayEnv),
      display: display.display,
      unit: display.unit,
      xvfb: display.xvfb,
      socket: display.socket,
      socketOk: display.socketOk,
      envDisplay: display.envDisplay,
      envMatches: display.envMatches,
      unitPresent: display.unitPresent,
      unitActive: display.unitActive,
      unitEnabled: display.unitEnabled,
      runScriptHasExport: display.runScriptHasExport,
      systemd: display.systemd,
    },
    electron: {
      present: electron.present,
      binaryOk: electron.binaryOk,
      binary: electron.binary || null,
      installing: electron.installing,
      installedThisSession: state.electronInstalledThisSession,
      reason: electron.reason || undefined,
    },
    runScript: {
      ok: runScript.ok,
      changed: !!runScript.changed,
      skipped: runScript.skipped || undefined,
      reason: runScript.reason || undefined,
      file: runScript.file ? path.relative(DSH_HOME, runScript.file) : undefined,
    },
    restartNeeded,
  }
}

// ───────────────────────── 设置-插件菜单(勾选开关) ─────────────────────────

/** 当前生效的 settings namespace 作用域(client 勾选后 watch 回调由它驱动)。 */
let menuScope = null

/**
 * 运行时解析 @deepseek-ai/schemastery(settings schema 用)。
 *
 * 不以顶层 import 引入,而是用 createRequire 以 **profile 目录**为解析锚点同步
 * 解析(同 dsh-guard-restart 的教训:link: 安装不会装源目录自己的依赖,若顶层
 * import 会让 Node 从插件源码真实路径解析不到该包 → 插件树加载失败 → dsh 崩溃
 * 循环)。profile 的 node_modules 里通常已有 schemastery(dsh 生态自带)。
 * 解析失败只降级为隐藏设置-插件菜单,绝不影响自愈功能。
 */
function resolveSchemastery(cfg) {
  try {
    const requireFromProfile = createRequire(path.join(cfg.profileRoot, 'package.json'))
    const mod = requireFromProfile('@deepseek-ai/schemastery')
    return (mod && mod.default) || mod || null
  } catch (error) {
    console.warn('[dsh-eco-fixes] schemastery 不可用,设置-插件菜单将隐藏:', error && error.message)
    return null
  }
}

/**
 * 注册「设置 → 插件 → 插件配置」菜单:
 *   - settings namespace `dsh-eco-fixes`(4 个 boolean 勾选字段);
 *   - 用配置文件 features 播种文档,并把菜单变更镜像回配置文件;
 *   - 勾选变更时立即重新执行已勾选的体检项(取消勾选只停止后续运行)。
 * 任何失败都只降级为菜单不可见,自愈功能照常(按配置文件 features)。
 */
function registerSettingsMenu(ctx, cfg, log) {
  if (!ctx || typeof ctx.inject !== 'function') return
  ctx.inject(['settings'], (sctx) => {
    try {
      const z = resolveSchemastery(cfg)
      if (!z) {
        log('设置-插件菜单降级(schemastery 解析失败),菜单隐藏;自愈功能按配置文件 features 运行')
        return
      }
      const scope = sctx.settings.register(SETTINGS_NS, z.object({
        autoMemoryPatch: z.boolean().default(true),
        electronAutoInstall: z.boolean().default(true),
        runScriptSandboxEnv: z.boolean().default(true),
        sidebarFooterStack: z.boolean().default(false),
        displayEnv: z.boolean().default(false),
      }), { base: { ...cfg.features } })
      menuScope = scope
      // 用配置文件 features 播种文档,让菜单与文件一致
      void scope.update({ ...cfg.features }).catch(() => {})
      // 菜单勾选变更 → 更新 features → 写回配置文件 → 重跑已勾选项
      scope.watch(() => {
        try {
          const v = scope.get()
          if (!v || typeof v !== 'object') return
          cfg.features = {
            autoMemoryPatch: v.autoMemoryPatch !== false,
            electronAutoInstall: v.electronAutoInstall !== false,
            runScriptSandboxEnv: v.runScriptSandboxEnv !== false,
            sidebarFooterStack: v.sidebarFooterStack === true,
            displayEnv: v.displayEnv === true,
          }
          persistFeatures(cfg)
          log('菜单勾选变更:', JSON.stringify(cfg.features))
          runFixes(cfg, log, '菜单变更后重跑')
        } catch (e) {
          log('菜单勾选应用失败(不影响后续):', e && e.message)
        }
      })
      // 暴露给 web 配置边界(browser settingsScope 枚举 namespace 需要;best effort)
      const llm = ctx.get('llm')
      if (llm !== undefined) {
        try {
          llm.registerConfigurableProviders([{
            provider: SETTINGS_NS,
            displayName: '常用插件自愈（dsh-eco-fixes）',
            settingsNs: SETTINGS_NS,
            settingsPath: [],
          }])
        } catch { /* best effort */ }
      }
      sctx.effect(() => () => { menuScope = null }, SETTINGS_NS + ': menu teardown')
      log(`设置-插件菜单已注册(${SETTINGS_NS}): ` + JSON.stringify(cfg.features))
    } catch (e) {
      log('设置-插件菜单注册失败(菜单隐藏,自愈功能不受影响):', e && e.message)
    }
  })
}

/** 按当前 features 勾选执行全部体检项(不勾选的不运行),返回汇总供日志/接口用。 */
function runFixes(cfg, log, hint) {
  const mem = fixAutoMemory(cfg)
  const elec = electronStatus(cfg)
  const runScr = patchRunScript(cfg)
  const disp = fixDisplayEnv(cfg)
  if (elec.present && !elec.binaryOk && !state.electronInstalling) {
    const kick = kickElectronInstall(cfg)
    if (kick.kicked) log('electron 二进制缺失,已后台启动 npx install-electron(日志:', kick.logFile + ')')
    else if (kick.reason) log('electron 自动安装跳过:', kick.reason)
  }
  if (disp && disp.changed) log('显示环境已配置(Xvfb 单元 / DISPLAY 注入),需重启 dsh-web 生效')
  else if (disp && disp.ok === false && !disp.skipped) log('显示环境修复未完成:', disp.reason || (disp.unit && disp.unit.reason) || '未知原因')
  if (hint) {
    const memTxt = mem.skipped || (mem.ok ? (mem.changed ? '已补丁' : '已就位') : '失败:' + mem.reason)
    const elecTxt = elec.present ? (elec.binaryOk ? 'binary-ok' : (state.electronInstalling ? 'installing' : '待安装')) : 'package-missing'
    const runTxt = runScr.skipped || (runScr.ok ? (runScr.changed ? '已注入' : '已就位') : '失败:' + runScr.reason)
    const dispTxt = disp.skipped ? disp.skipped
      : disp.ok === false ? '失败:' + (disp.reason || '未完成')
        : (disp.status && disp.status.ok ? 'ok(' + disp.status.display + ')' : '未生效,需重启')
    log(hint + ': autoMemory=' + memTxt + ' | electron=' + elecTxt + ' | runScript=' + runTxt + ' | display=' + dispTxt)
  }
  return { mem, elec, runScr, disp }
}

// ───────────────────────── HTTP 路由(/dsh-eco-fixes/*) ─────────────────────────

function routeAllowed(req, hosts) {
  const host = req.headers.host
  if (typeof host !== 'string') return false
  let hostUrl
  try { hostUrl = new URL('http://' + host) } catch { return false }
  const loopback = hostUrl.hostname === '127.0.0.1' || hostUrl.hostname === 'localhost' || hostUrl.hostname === '[::1]'
  const trusted = (hosts || []).map(h => String(h).toLowerCase()).includes(hostUrl.hostname)
  if (!loopback && !trusted) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    const o = new URL(origin)
    return trusted ? o.hostname === hostUrl.hostname : o.host === hostUrl.host
  } catch { return false }
}

function sendJson(res, status, payload) {
  try {
    res.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(payload))
  } catch {}
}

function registerRoutes(ctx, cfg) {
  if (!ctx || typeof ctx.inject !== 'function') return false
  // cordis 4:服务只能在 ctx.inject 声明的回调里访问,直接取 ctx.webServer 会抛
  // 「cannot get property "webServer" without inject」
  ctx.inject(['webServer'], (webCtx) => {
    if (!webCtx.webServer || typeof webCtx.webServer.register !== 'function') return
    const routes = [
      {
        kind: 'exact',
        path: '/dsh-eco-fixes/status',
        handler: (req, res) => {
          if (!routeAllowed(req, cfg.trustedHosts)) return sendJson(res, 403, { error: 'forbidden' })
          if (req.method && req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method not allowed' })
          sendJson(res, 200, currentStatus(cfg))
        },
      },
      {
        kind: 'exact',
        path: '/dsh-eco-fixes/apply',
        handler: (req, res) => {
          if (!routeAllowed(req, cfg.trustedHosts)) return sendJson(res, 403, { error: 'forbidden' })
          if (!req.method || req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
          const mem = fixAutoMemory(cfg)
          const elec = electronStatus(cfg)
          const runScr = patchRunScript(cfg)
          const disp = fixDisplayEnv(cfg)
          let kick = null
          if (elec.present && !elec.binaryOk) kick = kickElectronInstall(cfg)
          const st = currentStatus(cfg)
          st.lastApply = { autoMemory: mem, runScript: runScr, electronKick: kick, display: disp, at: new Date().toISOString() }
          sendJson(res, 200, st)
        },
      },
    ]
    for (const route of routes) {
      try { webCtx.webServer.register(route) } catch (e) { console.warn('[dsh-eco-fixes] 路由注册失败:', route.path, e && e.message) }
    }
  })
  return true
}

// ───────────────────────── 插件入口 ─────────────────────────

export function apply(ctx, config) {
  const log = (...a) => console.log('[dsh-eco-fixes]', ...a)
  let cfg
  try { cfg = loadConfig() } catch (e) { cfg = defaultConfig(); log('配置加载失败,用默认值:', e && e.message) }
  try {
    try { registerRoutes(ctx, cfg) } catch (e) { log('路由注册失败(不影响体检):', e && e.message) }
    try { registerSettingsMenu(ctx, cfg, log) } catch (e) { log('设置-插件菜单注册异常(不影响体检):', e && e.message) }
    const { mem, elec, runScr, disp } = runFixes(cfg, log)
    const memTxt = mem.skipped || (mem.ok ? (mem.changed ? '已补丁(重打)' : '已就位') : '失败:' + mem.reason)
    const elecTxt = elec.present ? (elec.binaryOk ? 'binary-ok' : (state.electronInstalling ? 'installing' : '待安装')) : 'package-missing'
    const runTxt = runScr.skipped || (runScr.ok ? (runScr.changed ? '已注入沙箱环境' : '已就位') : '失败:' + runScr.reason)
    const dispTxt = disp.skipped ? disp.skipped
      : disp.ok === false ? '失败:' + (disp.reason || '未完成')
        : (disp.status && disp.status.ok ? 'ok(' + disp.status.display + ')' : '未生效,需重启')
    log('boot 体检完成: autoMemory=' + memTxt
      + ' | electron=' + elecTxt
      + ' | runScript=' + runTxt
      + ' | display=' + dispTxt
      + ' | trustedHosts=' + cfg.trustedHosts.join(',')
      + ' | features=' + JSON.stringify(cfg.features || defaultFeatures())
      + ((state.electronInstalledThisSession || runScr.changed || (disp && disp.restartNeeded)) ? ' | 提示:需重启 dsh-web 使浏览器生效' : ''))
  } catch (e) {
    log('boot 体检异常(不影响启动):', e && e.stack || e)
  }
  // 占位生命周期(无资源需释放,保持插件契约)
  if (ctx && typeof ctx.effect === 'function') ctx.effect(() => () => {})
}