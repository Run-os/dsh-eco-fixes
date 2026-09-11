// dsh-eco-fixes client 半:
//   - 在「设置 → 插件 → 插件配置」注册「常用插件自愈」菜单卡片:4 个自愈方法
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
  cardTitle: '常用插件自愈',
  cardDesc: '勾选的自愈方法才会运行',
  noneEnabled: '未勾选任何自愈方法(全部关闭)',
  cardLoading: '检测中…',
  cardFailed: '读取状态失败',
  cardRefresh: '刷新',
  apply: '立即执行已勾选项',
  applying: '执行中…',
  statusTitle: '当前状态',
  autoMemory: '自动记忆白名单补丁',
  autoMemoryDesc: '修复 dsh-auto-memory 经域名访问 403「forbidden: loopback-only」,插件升级后自动重打',
  electronInstall: '浏览器 Electron 自动安装',
  electronInstallDesc: '检测到 dsh-builtin-browser 缺 electron 二进制时,后台执行 npx install-electron',
  runScript: '启动脚本沙箱环境注入',
  runScriptDesc: '在 run-dsh-web.sh 注入 ELECTRON_DISABLE_SANDBOX,root 下共享浏览器必需',
  footerStack: '侧边栏底部按钮各占一行',
  footerStackDesc: '设置行各插件按钮独占一行、不再并排(自 dsh-guard-restart 迁移,默认关闭)',
  on: '已启用',
  off: '已停用',
  ready: '已就位',
  repatched: '已重打',
  needRestart: '需重启 dsh-web 生效',
  installing: '安装中',
  binaryMissing: '二进制缺失',
  pkgMissing: 'electron 包未安装',
  skippedLabel: '未勾选',
  hint: '说明:只有勾选的方法会在启动时与「立即执行」时运行;取消勾选只停止后续运行,不会还原此前已做的修改。menu 勾选与配置文件 ~/.dsh/dsh-eco-fixes.json 的 features 双向同步。',
}

const en = {
  cardTitle: 'Common plugin auto-fixes',
  cardDesc: 'Only checked fixes run',
  noneEnabled: 'No fix enabled (all off)',
  cardLoading: 'Checking…',
  cardFailed: 'Failed to read status',
  cardRefresh: 'Refresh',
  apply: 'Run checked fixes now',
  applying: 'Running…',
  statusTitle: 'Status',
  autoMemory: 'Auto-memory whitelist patch',
  autoMemoryDesc: 'Fixes dsh-auto-memory 403 loopback-only behind a domain; re-applied after plugin updates',
  electronInstall: 'Browser Electron auto-install',
  electronInstallDesc: 'Runs npx install-electron in background when dsh-builtin-browser lacks the binary',
  runScript: 'Run script sandbox env',
  runScriptDesc: 'Injects ELECTRON_DISABLE_SANDBOX into run-dsh-web.sh (required for the shared browser as root)',
  footerStack: 'Sidebar footer buttons one per row',
  footerStackDesc: 'Each sidebar footer plugin button gets its own row (migrated from dsh-guard-restart, off by default)',
  on: 'On',
  off: 'Off',
  ready: 'Ready',
  repatched: 'Re-patched',
  needRestart: 'dsh-web restart required',
  installing: 'Installing',
  binaryMissing: 'Binary missing',
  pkgMissing: 'electron package missing',
  skippedLabel: 'Not checked',
  hint: 'Only checked fixes run at startup and on "Run checked fixes now"; unchecking stops future runs but does not revert previous changes. Menu toggles mirror ~/.dsh/dsh-eco-fixes.json features.',
}

const CSS = `
.efx-footer-stack{flex-wrap:wrap;row-gap:2px;overflow:visible}
.efx-footer-stack>*{flex:0 0 100%;box-sizing:border-box}
.efx-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;transition:border-color .16s,background .16s;overflow:hidden}
.efx-card:hover{border-color:var(--dsw-alias-label-dimmed)}
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
// 设置 → 插件 → 插件配置:「常用插件自愈」菜单卡片
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

  const anyEnabled = feats.autoMemoryPatch || feats.electronAutoInstall || feats.runScriptSandboxEnv || feats.sidebarFooterStack
  const summary = status === null
    ? (failed ? t('cardFailed') : t('cardLoading'))
    : (Object.keys(serverFeats).length ? Object.keys(serverFeats).filter((k) => serverFeats[k]).length + ' 项已启用' : t('cardDesc'))

  const rows = [
    { key: 'autoMemoryPatch', label: t('autoMemory'), sub: t('autoMemoryDesc') },
    { key: 'electronAutoInstall', label: t('electronInstall'), sub: t('electronInstallDesc') },
    { key: 'runScriptSandboxEnv', label: t('runScript'), sub: t('runScriptDesc') },
    { key: 'sidebarFooterStack', label: t('footerStack'), sub: t('footerStackDesc') },
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
              enabledBadge(row.key),
            ),
            h('p', { className: 'efx-sub' }, row.sub),
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

  // 设置 → 插件 → 插件配置:「常用插件自愈」菜单(勾选每项自愈方法)
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
}

return module.exports
} })