// dsh-eco-fixes client 半:
//   - 在「设置 → 插件 → 插件配置」注册「常用插件扩展」菜单卡片:4 项功能
//     全部用勾选框控制,只有勾选的才运行(服务端按 features 门控);
//   - 「侧边栏底部按钮各占一行」自 dsh-guard-restart 迁移至此:把
//     sidebar.footer.action 槽容器改成每个子按钮独占一行(flex:0 0 100%),
//     勾选即时生效、取消勾选即时恢复;
//   - 状态区数据来自宿主 GET /dsh-eco-fixes/status,手动转的「立即执行」走
//     POST /dsh-eco-fixes/apply(只执行已勾选项)。
// 渲染模式与 dsh-guard-restart / dsh-fuhuobi 一致:__ModuleLoader__ + React.createElement。

window.__ModuleLoader__.load({ id: 'dsh-eco-fixes', factory: (require) => {
const module = { exports: {} }
const exports = module.exports
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

const React = require('react')
const h = React.createElement
const { useState, useEffect, useCallback, useMemo } = React

const NS = 'dsh-eco-fixes'

const zh = {
  cardTitle: '常用插件扩展',
  cardDesc: '勾选的功能才会运行',
  noneEnabled: '未勾选任何功能(全部关闭)',
  cardLoading: '检测中…',
  cardFailed: '读取状态失败',
  cardRefresh: '刷新',
  apply: '立即执行已勾选项',
  applying: '执行中…',
  statusTitle: '当前状态',
  autoMemory: 'dsh-auto-memory公网访问补丁',
  autoMemoryDesc: '让 dsh-auto-memory 支持通过公网域名访问,不再返回 403;插件更新后自动重新生效',
  browserAdapt: 'dsh-builtin-browser 自动适配',
  browserAdaptDesc: '一键适配共享浏览器:自动补全浏览器运行所需的安装、沙箱与图形显示环境,共享浏览器窗口即可正常打开。具体状态见下方「当前状态」的 electron / 启动脚本 / 显示环境三行。',
  electronInstall: '浏览器 Electron',
  runScript: '启动脚本沙箱环境',
  footerStack: '左侧边栏底部按钮纵向排列',
  footerStackDesc: '左侧边栏底部的各插件按钮纵向排列,不再并排挤在同一行',
  menuStyleAdapter: '插件菜单样式自动适配',
  menuStyleAdapterDesc: '为「设置 → 插件」中未自带样式的插件卡片统一补上边框、底色与圆角,页面更整齐(不修改任何插件文件)',
  detail: '详细',
  adaptedCount: (n) => '已适配 ' + n + ' 张无样式卡片',
  displayStatus: '显示环境',
  displayNotEnough: '未就绪',
  displayReady: '就绪',
  displayNeedRestart: '需重启生效',
  displayNoXvfb: 'Xvfb 未安装',
  displayUnitOff: '单元未运行',
  on: '已启用',
  off: '已停用',
  ready: '已就位',
  repatched: '已重打',
  needRestart: '需重启 dsh-web 生效',
  installing: '安装中',
  binaryMissing: '二进制缺失',
  pkgMissing: 'electron 包未安装',
  skippedLabel: '未勾选',
  hint: '说明:只有勾选的功能会在启动时与「立即执行」时运行;取消勾选只停止后续运行,不会还原此前已做的修改。菜单勾选与配置文件 ~/.dsh/dsh-eco-fixes.json 的 features 双向同步(鼠标移到「详细」可查看每项说明)。',
}

const en = {
  cardTitle: 'Common plugin extensions',
  cardDesc: 'Only checked features run',
  noneEnabled: 'No feature enabled (all off)',
  cardLoading: 'Checking…',
  cardFailed: 'Failed to read status',
  cardRefresh: 'Refresh',
  apply: 'Run checked features now',
  applying: 'Running…',
  statusTitle: 'Status',
  autoMemory: 'dsh-auto-memory public-access patch',
  autoMemoryDesc: 'Lets dsh-auto-memory be reached through a public domain instead of returning 403; re-applies automatically after plugin updates',
  browserAdapt: 'dsh-builtin-browser auto-adapt',
  browserAdaptDesc: 'One-click shared-browser adaptation: auto-installs the missing runtime and configures the sandbox and display environment so the shared-browser window opens properly. See electron / run-script / display rows under Status for detail.',
  electronInstall: 'Electron binary',
  runScript: 'Run-script sandbox env',
  footerStack: 'Left sidebar footer buttons stacked vertically',
  footerStackDesc: 'Stacks the sidebar footer plugin buttons vertically instead of squeezing them onto one row',
  menuStyleAdapter: 'Plugin menu style adapter',
  menuStyleAdapterDesc: 'Adds standard border/background/radius to unstyled plugin cards in Settings → Plugins for a cleaner look (no plugin files are modified)',
  displayStatus: 'Display env',
  displayNotEnough: 'Not ready',
  displayReady: 'Ready',
  displayNeedRestart: 'Restart to apply',
  displayNoXvfb: 'Xvfb not installed',
  displayUnitOff: 'Unit inactive',
  detail: 'Details',
  adaptedCount: (n) => n + ' unstyled card(s) adapted',
  on: 'On',
  off: 'Off',
  ready: 'Ready',
  repatched: 'Re-patched',
  needRestart: 'dsh-web restart required',
  installing: 'Installing',
  binaryMissing: 'Binary missing',
  pkgMissing: 'electron package missing',
  skippedLabel: 'Not checked',
  hint: 'Only checked features run at startup and on "Run checked features now"; unchecking stops future runs but does not revert previous changes. Menu toggles mirror ~/.dsh/dsh-eco-fixes.json features (hover "Details" for each item).',
}

const CSS = `
.efx-footer-stack{flex-wrap:wrap;row-gap:2px;overflow:visible}
.efx-footer-stack>*{flex:0 0 100%;box-sizing:border-box}
.efx-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;transition:border-color .16s,background .16s;position:relative;overflow:visible}
.efx-card:hover{border-color:var(--dsw-alias-label-dimmed)}
/* 悬停「详细」时抬高卡片,避免提示层被后一张卡片盖住(后渲染者在上) */
.efx-card:has(.efx-detail:hover),.efx-card:has(.efx-detail:focus-within){z-index:20}
.efx-head{display:flex;width:100%;align-items:baseline;gap:12px;padding:12px 14px;background:none;border:none;cursor:pointer;font:inherit;text-align:left;color:inherit}
.efx-title{font-size:14px;font-weight:700;flex:none}
.efx-desc{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.efx-body{display:flex;flex-direction:column;gap:12px;padding:0 14px 14px}
.efx-group{display:flex;flex-direction:column;gap:6px}
.efx-group-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#6b7280);margin:0}
.efx-row{display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:1.5}
.efx-check{flex:none;margin-top:3px;cursor:pointer;accent-color:var(--dsw-alias-brand-primary,#4f6ef7)}
.efx-box{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.efx-name{color:var(--dsw-alias-label-primary,#1f2328);font-weight:600;display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
/* 「详细」按钮:位于勾选项与勾选状态(徽章)之间;鼠标悬停/键盘聚焦显示描述 */
.efx-detail{position:relative;display:inline-flex;flex:none}
.efx-detail-btn{border:1px solid var(--dsw-alias-border-l2,#d0d5dd);background:var(--dsw-alias-bg-layer-2,#f8fafc);color:var(--dsw-alias-label-secondary,#6b7280);border-radius:999px;padding:0 9px;font:inherit;font-size:11px;line-height:18px;cursor:help;white-space:nowrap}
.efx-detail-btn:hover{border-color:var(--dsw-alias-brand-primary,#4f6ef7);color:var(--dsw-alias-brand-primary,#4f6ef7)}
.efx-tip{position:absolute;left:50%;top:calc(100% + 6px);transform:translateX(-50%);z-index:30;width:max-content;max-width:min(300px,55vw);box-sizing:border-box;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2,#d0d5dd);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#ffffff);color:var(--dsw-alias-label-primary,#1f2328);font-size:12px;line-height:1.7;font-weight:400;box-shadow:0 8px 24px rgba(15,23,42,.16);opacity:0;visibility:hidden;transition:opacity .12s visibility .12s;pointer-events:none;overflow-wrap:anywhere;word-break:break-word}
.efx-detail:hover .efx-tip,.efx-detail:focus-within .efx-tip{opacity:1;visibility:visible}
.efx-sub{font-size:12px;color:var(--dsw-alias-label-tertiary,#6b7280);margin:0}
.efx-badge{display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;font-size:12px;line-height:18px;white-space:nowrap}
.efx-on{background:rgba(22,163,74,.12);color:#16a34a}
.efx-off{background:rgba(107,114,128,.12);color:#6b7280}
.efx-ok{background:rgba(22,163,74,.12);color:#16a34a}
.efx-bad{background:rgba(220,38,38,.12);color:#dc2626}
.efx-warn{background:rgba(180,83,9,.12);color:#b45309}
.efx-neutral{background:rgba(107,114,128,.12);color:#6b7280}
.efx-status{display:grid;gap:6px;border-top:1px solid var(--dsw-alias-border-l1,#e5e7eb);padding-top:10px}
.efx-srow{display:flex;align-items:flex-start;gap:8px;font-size:13px}
.efx-slabel{flex:none;min-width:132px;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;padding-top:2px}
.efx-svalue{color:var(--dsw-alias-label-primary,#1f2328);word-break:break-all;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.efx-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.efx-btn{border:1px solid var(--dsw-alias-border-l2,#d0d5dd);background:var(--dsw-alias-bg-layer-2,#f8fafc);color:var(--dsw-alias-label-primary,#1f2328);border-radius:8px;padding:5px 12px;font:inherit;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.efx-btn:disabled{opacity:.6;cursor:default}
.efx-hint{font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary,#6b7280);margin:0}
.efx-mono{font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
/* 插件菜单样式自动适配:给未自带样式的 settings.plugin.item 卡片补标准卡片外观
   (配方同 dsh-fuhuobi .gdb-card / STYLE-DIFF-REPORT.md)。 */
/* 关键:样式同时挂在 class 和 data-efx-adapted 属性上。React 重渲染时会重写
   className(把注入的 class 抹掉),但不会碰我们 setAttribute 写的属性,所以
   属性选择器能保证边框/底色在重渲染瞬间不丢失(消除「闪一下恢复原样」)。 */
.efx-adapt-card,[data-efx-adapted="1"]{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;overflow:hidden;transition:border-color .16s,background .16s}
.efx-adapt-card:hover,[data-efx-adapted="1"]:hover{border-color:var(--dsw-alias-label-dimmed)}
.efx-adapt-card>*,[data-efx-adapted="1"]>*{padding:12px 14px;margin:0;box-sizing:border-box}
.efx-adapt-card>*+*,[data-efx-adapted="1"]>*+*{border-top:1px solid var(--dsw-alias-border-l1)}
.efx-adapt-card button,[data-efx-adapted="1"] button{width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:none;border:0;display:flex;align-items:center;gap:10px}
.efx-adapt-card input,.efx-adapt-card select,.efx-adapt-card textarea,[data-efx-adapted="1"] input,[data-efx-adapted="1"] select,[data-efx-adapted="1"] textarea{font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 8px;box-sizing:border-box;max-width:100%}
`

function injectStyles() {
  if (document.querySelector('style[data-plugin-css="dsh-eco-fixes"]') !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = NS
  tag.dataset.pluginCss = NS
  tag.textContent = CSS
  document.head.appendChild(tag)
}

// ---------------------------------------------------------------------------
// 侧边栏底部按钮各占一行:在 sidebar.footer.action 槽挂一个不可见锚点,
// 按 settingsScope 的 sidebarFooterStack 勾选切换父容器(槽容器)的 class。
// 幂等:只有勾选值真的变化才写 DOM;订阅 scope 随快照即时更新。
// ---------------------------------------------------------------------------
function FooterAnchor({ scope }) {
  const ref = React.useRef(null)
  useEffect(() => {
    if (!scope) return
    let alive = true
    const apply = () => {
      if (!alive) return
      try {
        const snap = scope.getSnapshot ? scope.getSnapshot() : null
        const v = snap && snap.value && typeof snap.value.sidebarFooterStack === 'boolean' ? snap.value.sidebarFooterStack : false
        const anchor = ref.current
        if (anchor && anchor.parentElement) anchor.parentElement.classList.toggle('efx-footer-stack', v)
      } catch { /* 保持现状,绝不影响页面 */ }
    }
    apply()
    const unsub = scope.subscribe ? scope.subscribe(apply) : null
    return () => { alive = false; if (unsub) unsub() }
  }, [scope])
  return h('span', { ref, style: { display: 'none' } })
}

// ---------------------------------------------------------------------------
// 插件菜单样式自动适配:给「未自带样式」的 settings.plugin.item 卡片补标准
// 卡片外观(边框/底色/圆角,配方同 gdb-card)。纯 CSS class 注入,不修改任何
// 插件文件;严格幂等、可随时开关。
//
// 检测:以本插件的卡片容器(settings.plugin.item 槽的 ul)为锚点,遍历其 li
// 子元素;computed 无边框(或透明底)即视为「未适配样式」→ 加 .efx-adapt-card。
// 已自带样式的卡片(如 gdb-card/dgs-card/efx-card)天然带边框,不会被误伤。
// ---------------------------------------------------------------------------
const ADAPT_CLASS = 'efx-adapt-card'
// 双保险:class 会被 React 重渲染抹掉,属性不会 —— 样式键在属性上,class 只作可读标记。
const ADAPT_ATTR = 'data-efx-adapted'

function markCard(el) {
  if (!el.hasAttribute(ADAPT_ATTR)) el.setAttribute(ADAPT_ATTR, '1')
  if (!el.classList.contains(ADAPT_CLASS)) el.classList.add(ADAPT_CLASS)
}

function unmarkCard(el) {
  if (el.hasAttribute(ADAPT_ATTR)) el.removeAttribute(ADAPT_ATTR)
  if (el.classList.contains(ADAPT_CLASS)) el.classList.remove(ADAPT_CLASS)
}

function isUnstyledCard(el) {
  try {
    if (!(el instanceof Element)) return false
    if (el.classList.contains(ADAPT_CLASS) || el.hasAttribute(ADAPT_ATTR)) return false
    if (el.closest('.efx-card') !== null) return false
    const cs = getComputedStyle(el)
    if (cs.display === 'none') return false
    const bw = parseFloat(cs.borderTopWidth) || 0
    if (bw > 0) return false // 有边框 = 已自带样式,不碰
    const bg = (cs.backgroundColor || '').trim()
    const transparent = bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)' || bg === ''
    const radius = parseFloat(cs.borderTopLeftRadius) || 0
    return transparent || radius === 0
  } catch { return false }
}

function findCardsContainer() {
  // 每张 settings.plugin.item 卡片都被包在各自的 wrapper div 里,公共容器是
  // 最近的 UL(实测 class 如 "pbvGtq_cards",内含全部卡片 wrapper)。
  const mine = document.querySelector('.efx-card')
  if (!mine) return null
  let el = mine.parentElement
  while (el) {
    if (el.tagName === 'UL' && el.querySelectorAll('li').length > 0) return el
    if (el.querySelectorAll(':scope > div > li, :scope > li').length >= 3) return el
    el = el.parentElement
  }
  return mine.parentElement
}

/**
 * 启动/停止「插件菜单样式自动适配」supervisor(跟随 settingsScope 勾选实时开关)。
 * @param {*} scope settingsScope.bind({namespace}) 的控制器
 * @returns 清理函数(取消 observer/订阅并移除已加 class)
 */
function startPluginMenuStyleAdapter(scope) {
  let disposed = false
  let enabled = false
  let frame = null
  let heartbeat = null
  let observer = null

  const applyAll = () => {
    if (disposed || !enabled) return
    try {
      const container = findCardsContainer()
      if (!container) return
      let added = 0
      // 卡片是 <ul> > <div(wrapper)> > <li>,取全部后代 li 逐个判定
      for (const li of container.querySelectorAll('li')) {
        if (!isUnstyledCard(li)) continue
        markCard(li)
        added++
      }
      if (added > 0) console.log('[dsh-eco-fixes] 插件菜单样式适配:为 ' + added + ' 张无样式卡片补充标准外观')
    } catch { /* 绝不影响页面 */ }
  }

  // 用 rAF 合并,而不是 setTimeout 防抖:最新一帧就补齐,肉眼看不到「先恢复原样」。
  const scheduleApply = () => {
    if (disposed || !enabled || frame !== null) return
    try {
      frame = requestAnimationFrame(() => { frame = null; applyAll() })
    } catch {
      frame = null
      applyAll()
    }
  }

  const removeAll = () => {
    try {
      for (const el of document.querySelectorAll('.' + ADAPT_CLASS + ',[' + ADAPT_ATTR + ']')) {
        unmarkCard(el)
      }
    } catch { /* ignore */ }
  }

  const sync = () => {
    if (disposed) return
    try {
      const snap = scope && scope.getSnapshot ? scope.getSnapshot() : null
      const v = snap && snap.value && typeof snap.value.pluginMenuStyleAdapter === 'boolean' ? snap.value.pluginMenuStyleAdapter : false
      if (v === enabled) { if (enabled) applyAll(); return }
      enabled = v
      if (enabled) applyAll()
      else removeAll()
    } catch { /* keep current */ }
  }

  // React 重渲染会重写 className,把注入的 class 抹掉。属性选择器保证样式不断,
  // 这里再把 class 同步补齐(class 变了会再触发一次 attribute 回调,但那时已有
  // class,直接返回,不会自激)。
  const onMutations = (records) => {
    if (disposed || !enabled) return
    let needApply = false
    for (const rec of records) {
      if (rec.type === 'attributes') {
        const el = rec.target
        if (el instanceof Element && el.hasAttribute(ADAPT_ATTR) && !el.classList.contains(ADAPT_CLASS)) {
          try { el.classList.add(ADAPT_CLASS) } catch {}
        }
      } else {
        needApply = true
      }
    }
    if (needApply) scheduleApply()
  }

  sync()
  const unsub = scope && scope.subscribe ? scope.subscribe(sync) : null
  try {
    observer = new MutationObserver(onMutations)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  } catch {}
  heartbeat = setInterval(sync, 3000)

  return () => {
    disposed = true
    if (frame !== null) { try { cancelAnimationFrame(frame) } catch {} frame = null }
    if (heartbeat) clearInterval(heartbeat)
    if (observer) { try { observer.disconnect() } catch {} }
    if (unsub) unsub()
    removeAll()
  }
}

// ---------------------------------------------------------------------------
// 设置 → 插件 → 插件配置:「常用插件扩展」菜单卡片
// ---------------------------------------------------------------------------
function EfxCard({ scope, t }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [applying, setApplying] = useState(false)

  const subscribe = useMemo(
    () => (scope && scope.subscribe ? scope.subscribe.bind(scope) : (() => () => {})),
    [scope],
  )
  const getSnapshot = useMemo(
    () => (scope && scope.getSnapshot ? scope.getSnapshot.bind(scope) : (() => null)),
    [scope],
  )
  let snap = null
  try { snap = React.useSyncExternalStore(subscribe, getSnapshot) } catch { snap = null }
  const cfgReady = !!(snap && snap.status === 'ready' && snap.value)
  const feats = (cfgReady && snap.value) || {}

  const setFeature = async (key, value) => {
    if (!cfgReady || !scope) return
    try { await scope.set(key, value) } catch { /* best effort(服务端 watch 会兜底) */ }
  }

  const load = useCallback(async () => {
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch(`/${NS}/status`, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      setStatus(await res.json())
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }, [])

  const applyNow = useCallback(async () => {
    if (applying) return
    setApplying(true)
    try {
      const res = await fetch(`/${NS}/apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) throw new Error(String(res.status))
      setStatus(await res.json())
    } catch {
      setFailed(true)
    } finally {
      setApplying(false)
    }
  }, [applying])

  useEffect(() => { load() }, [load])

  const s = status || {}
  const am = s.autoMemory || {}
  const el = s.electron || {}
  const rs = s.runScript || {}
  const dp = s.display || {}
  const serverFeats = (s.features && typeof s.features === 'object') ? s.features : {}

  const badge = (cls, text) => h('span', { className: 'efx-badge ' + cls }, text)
  const enabledBadge = (key) => badge(feats[key] ? 'efx-on' : 'efx-off', feats[key] ? t('on') : t('off'))

  const amBadge = am.skipped
    ? badge('efx-neutral', t('skippedLabel') + '·' + am.skipped)
    : am.ok ? badge(am.changed ? 'efx-ok' : 'efx-ok', am.changed ? t('repatched') : t('ready'))
      : badge('efx-bad', am.reason || 'failed')
  const elBadge = !el.present
    ? badge('efx-warn', t('pkgMissing'))
    : el.binaryOk ? badge('efx-ok', t('ready'))
      : badge(el.installing ? 'efx-warn' : 'efx-warn', el.installing ? t('installing') : t('binaryMissing'))
  const rsBadge = rs.skipped
    ? badge('efx-neutral', t('skippedLabel') + '·' + rs.skipped)
    : rs.ok ? badge(rs.changed ? 'efx-ok' : 'efx-ok', rs.changed ? t('repatched') : t('ready'))
      : badge('efx-bad', rs.reason || 'failed')
  // 显示环境徽章:综合 ok 为「现在能开窗」(Xvfb+socket+DISPLAY 一致)
  const dpBadge = !dp.xvfb
    ? badge('efx-warn', t('displayNoXvfb'))
    : dp.envMatches && dp.socketOk ? badge('efx-ok', t('displayReady') + ' ' + dp.display)
      : badge('efx-warn', (dp.display || '') + ' ' + t('displayNeedRestart'))
  const dpSub = (dp.envDisplay ? 'env=' + dp.envDisplay : 'env=∅')
    + (dp.socketOk ? ' · socket ok' : ' · socket ✗')
    + ((dp.unitPresent === false) ? ' · unit ✗' : (dp.unitActive ? ' · unit active' : (dp.unitPresent ? ' · unit inactive' : '')))

  const anyEnabled = feats.autoMemoryPatch || feats.dshBuiltinBrowserAdapt || feats.sidebarFooterStack || feats.pluginMenuStyleAdapter
  const summary = status === null
    ? (failed ? t('cardFailed') : t('cardLoading'))
    : (Object.keys(serverFeats).length ? Object.keys(serverFeats).filter((k) => serverFeats[k]).length + ' 项已启用' : t('cardDesc'))

  const rows = [
    { key: 'autoMemoryPatch', label: t('autoMemory'), sub: t('autoMemoryDesc') },
    { key: 'dshBuiltinBrowserAdapt', label: t('browserAdapt'), sub: t('browserAdaptDesc') },
    { key: 'sidebarFooterStack', label: t('footerStack'), sub: t('footerStackDesc') },
    { key: 'pluginMenuStyleAdapter', label: t('menuStyleAdapter'), sub: t('menuStyleAdapterDesc') },
  ]

  return h('li', { className: 'efx-card' + (open ? '' : '') },
    h('button', {
      type: 'button',
      className: 'efx-head',
      'aria-expanded': open,
      onClick: () => setOpen(!open),
    },
      h('span', { className: 'efx-title' }, t('cardTitle')),
      h('span', { className: 'efx-desc' }, summary),
    ),
    open ? h('div', { className: 'efx-body' },
      h('div', { className: 'efx-group' },
        rows.map((row) => h('div', { className: 'efx-row', key: row.key },
          h('input', {
            type: 'checkbox',
            className: 'efx-check',
            checked: !!feats[row.key],
            disabled: !cfgReady,
            onChange: (e) => setFeature(row.key, e.target.checked),
          }),
          h('div', { className: 'efx-box' },
            h('span', { className: 'efx-name' },
              h('span', null, row.label),
              // 「详细」:介于勾选项与勾选状态(徽章)之间,悬停/聚焦显示描述
              h('span', { className: 'efx-detail' },
                h('button', { type: 'button', className: 'efx-detail-btn', 'aria-label': row.label + ' — ' + row.sub }, t('detail')),
                h('span', { className: 'efx-tip', role: 'tooltip' }, row.sub),
              ),
              enabledBadge(row.key),
            ),
          ),
        )),
        anyEnabled ? null : h('p', { className: 'efx-sub' }, t('noneEnabled')),
      ),
      status !== null ? h('div', { className: 'efx-group' },
        h('p', { className: 'efx-group-title' }, t('statusTitle')),
        h('div', { className: 'efx-status' },
          h('div', { className: 'efx-srow' },
            h('span', { className: 'efx-slabel' }, t('autoMemory')),
            h('span', { className: 'efx-svalue' }, amBadge,
              am.file ? h('span', { className: 'efx-mono efx-sub' }, am.file) : null),
          ),
          h('div', { className: 'efx-srow' },
            h('span', { className: 'efx-slabel' }, t('electronInstall')),
            h('span', { className: 'efx-svalue' }, elBadge,
              el.installedThisSession ? h('span', { className: 'efx-badge efx-warn' }, t('needRestart')) : null),
          ),
          h('div', { className: 'efx-srow' },
            h('span', { className: 'efx-slabel' }, t('runScript')),
            h('span', { className: 'efx-svalue' }, rsBadge,
              rs.file ? h('span', { className: 'efx-mono efx-sub' }, rs.file) : null),
          ),
          h('div', { className: 'efx-srow' },
            h('span', { className: 'efx-slabel' }, t('displayStatus')),
            h('span', { className: 'efx-svalue' }, dpBadge,
              h('span', { className: 'efx-mono efx-sub' }, dpSub)),
          ),
          s.restartNeeded ? h('div', { className: 'efx-srow' },
            h('span', { className: 'efx-slabel' }, ' '),
            h('span', { className: 'efx-svalue' }, badge('efx-warn', t('needRestart'))),
          ) : null,
        ),
      ) : null,
      h('div', { className: 'efx-actions' },
        h('button', {
          type: 'button',
          className: 'efx-btn',
          disabled: busy || applying,
          onClick: applyNow,
        }, applying ? t('applying') + '…' : t('apply')),
        h('button', {
          type: 'button',
          className: 'efx-btn',
          disabled: busy,
          onClick: load,
        }, busy ? t('cardLoading') + '…' : '↻ ' + t('cardRefresh')),
      ),
      h('p', { className: 'efx-hint' }, t('hint')),
    ) : null,
  )
}

exports.name = NS
exports.inject = ['slots', 'locale', 'settingsScope']
exports.apply = function apply(ctx) {
  // 注入本插件全部样式(卡片边框/底色、footer-stack 布局等)。必须在注册任何
  // 槽位之前调用一次,否则 .efx-* 全部缺失 → 卡片显示为无边框裸文本。
  injectStyles()
  try {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-eco-fixes: dictionaries')
  } catch { /* locale unavailable: degrade quietly */ }
  const t = ctx.locale.bind(NS)
  let scope = null
  try { scope = ctx.settingsScope.bind({ namespace: NS }) } catch { /* no settings service */ }

  // 侧边栏底部按钮各占一行(自 dsh-guard-restart 迁移):不可见锚点 + class 切换
  try {
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
      name: 'sidebar.footer.action',
      id: NS,
      order: 0,
      label: () => 'dsh-eco-fixes',
    }, ({ wide }) => h(FooterAnchor, { scope })))
  } catch { /* slot unavailable: footer stack off, rest unaffected */ }

  // 设置 → 插件 → 插件配置:「常用插件扩展」菜单(勾选每项功能)
  if (scope) {
    try {
      ctx.slots.inject('settings.plugin.item', function* () {
        yield ctx.slots.register({
          name: 'settings.plugin.item',
          key: NS,
          id: NS,
          order: 50,
          label: NS,
          inject: () => ({ scope }),
        }, (props) => h(EfxCard, Object.assign({ t }, props)))
      })
    } catch { /* no settings card */ }
  }

  // 插件菜单样式自动适配:为未自带样式的设置-插件卡片补标准外观(跟随勾选开关)。
  // 注意:ctx.effect 期望「返回 disposer 的函数」,不能直接传执行结果,
  // 否则会在启动瞬间把 adapter 立刻回收,导致永远不生效(v0.4.0 故障,已修)。
  try {
    ctx.effect(() => startPluginMenuStyleAdapter(scope), 'dsh-eco-fixes: menu style adapter')
  } catch { /* settings unavailable: adapter off */ }
}

return module.exports
} })