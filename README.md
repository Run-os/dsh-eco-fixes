# dsh-eco-fixes

DeepSeek Harness 常用插件问题的一键自愈插件(web profile 本地插件)。

安装后**每次启动自动体检修复**;插件(或其修复对象)更新后也会自动重打。
所有自愈方法都是**可选项**:在 **设置 → 插件 → 插件配置** 的
**「常用插件自愈(dsh-eco-fixes)」菜单**里勾选,**勾选了的才运行**。
每个勾选项下方不展示长描述,鼠标悬停其 **`详细`** 按钮(位于勾选项与勾选状态
之间)即显示说明。

## 自愈方法(全为可选项,菜单内勾选;悬停「详细」看说明)

| 勾选项 | 作用 | 默认 |
| --- | --- | --- |
| 自动记忆白名单补丁 | 修复 dsh-auto-memory 403「forbidden: loopback-only」,插件升级后自动重打 | ✅ 开 |
| dsh-builtin-browser 自动适配 | 共享浏览器一键适配:① electron 二进制缺失自动安装;② run-dsh-web.sh 注入 `ELECTRON_DISABLE_SANDBOX`;③ 显示环境(Xvfb 单元 + 注入 `DISPLAY`)。v0.5.0 起三合一 | ✅ 开 |
| 侧边栏底部按钮各占一行 | 让 `sidebar.footer.action` 槽内各插件按钮独占一行、不再并排(**自 dsh-guard-restart v0.7.0 迁移而来**) | ⬜ 关 |
| 插件菜单样式自动适配 | 为设置-插件里**未自带样式**的插件卡片(如 `@perrylink/dsh-github` 的 `ghc-card`)自动补标准边框/底色/圆角(纯前端 CSS,不修改任何插件文件) | ⬜ 关 |

> ⚠️ 取消勾选只停止**后续**运行,不会还原此前已做的文件修改(例如已打上的
> 白名单补丁、已注入的环境变量会保留)。

### 1. dsh-auto-memory 403「forbidden: loopback-only」

`@a9i5k4/dsh-auto-memory` 的所有 `/api/dsh-auto-memory/*` 路由在服务端硬编码
`isLoopbackRequest`,只放行 Host 为 `127.0.0.1`/`localhost`/`[::1]` 的请求。
经域名/反代访问 GUI(如本部署 `dsh.122050.xyz`,DSH 核心用 `--trusted-host` 放行)时,
整站正常,唯独这些接口全部 403。

本插件把 `isLoopbackRequest` 替换为带**部署信任主机白名单**的版本(默认
`dsh.122050.xyz`),并在每次启动时幂等检查、自动重打——**记忆插件自身升级覆盖
源文件后,下次启动自动恢复,无需手工设置**。

- 语义:回环 Host 维持原样;信任主机按 Host 主机名放行(容忍反代/端口差异),
  但仍要求 `Origin` 同主机名、`Sec-Fetch-Site` 非 `cross-site`。
- 修改前自动备份到 `~/.dsh/patches/dsh-auto-memory-index.js.bak-*`(保留最近 10 份)。
- 若上游函数签名变化导致定位失败,会**跳过并告警**,绝不盲改损坏文件。

### 2. dsh-builtin-browser 自动适配(v0.5.0 起三合一)

合并了旧版三个勾选项(浏览器 Electron 自动安装 / 启动脚本沙箱环境注入 /
显示环境 Xvfb 自动配置):**勾选一项,三件事一起做**(各自幂等,状态分别展示在
菜单「当前状态」区):

1. **electron 二进制缺失自动安装**:Electron 44+ 首次使用才下载二进制;缺失时
   browser provider 报 `electron unavailable: cannot locate a spawnable
   Electron binary`,`browser_*` 工具报 `BROWSER_PROVIDER_UNAVAILABLE`。检测到
   缺失后自动在 profile 目录后台执行 `npx install-electron`
   (日志 `~/.dsh/logs/eco-fixes-electron.log`)。
2. **启动脚本沙箱环境注入**:在 dsh-web 启动包装脚本(`run-dsh-web.sh`)里幂等注入
   `ELECTRON_DISABLE_SANDBOX=1`(避免 Chromium 以 root 运行时报 "Running as root
   without --no-sandbox is not supported")。
3. **显示环境(Xvfb)自动配置**:共享浏览器的自托管 Electron 窗口需要 X 显示——
   `electronStatus` 只能证明二进制存在,**无法**证明「能开出窗口」,还需要
   `DISPLAY` 环境变量与可达的 X server。检测:Xvfb 可执行文件、X socket
   (`/tmp/.X11-unix/X<n>`)、当前进程 `DISPLAY` 是否指向目标 display、
   `xvfb-dsh.service` 是否存在/启用/运行、启动脚本是否已导出 `DISPLAY`。
   修复:① 在 `run-dsh-web.sh` 幂等注入 `export DISPLAY=:99`;② 生成
   `/etc/systemd/system/xvfb-dsh.service` 并 `systemctl enable --now`(仅在 Xvfb
   已安装时;未安装只报告「请先 apt-get install -y xvfb」,不自动 apt)。

- **生效**:运行中进程的环境无法热改,修复完成后状态会标出「需重启 dsh-web 生效」
  (`restartNeeded`)。
- 相关配置(可选,默认值见下):`display.value`(display 号)、`display.unit`、
  `display.screen`;`DSH_ECO_ELECTRON_AUTO=0` 可单独关闭 electron 自动安装。

> 若用其他方式提供 X(如真显示器/外部 Xvfb),可在菜单里取消勾选本项,已注入的
> 文件内容不会自动还原,但检测状态会如实展示。

### 3. 侧边栏底部按钮各占一行(自 dsh-guard-restart 迁移)

`sidebar.footer.action` 槽容器内各插件按钮(如 dsh-cost-meter 徽章、
dsh-auto-memory 按钮)原本并排显示;本项开启后容器改为 `flex-wrap` + 每个子元素
`flex:0 0 100%`,让每个按钮独占一行。**勾选即时生效、取消勾选即时恢复**(纯前端
布局,不修改任何文件)。dsh-guard-restart v0.7.0 起已移除同名功能,避免重复实现。

### 4. 插件菜单样式自动适配(v0.4.0 新增,默认关闭)

`settings.plugin.item` 卡片的外观完全由各插件自带 CSS 提供(平台不兜底,见
STYLE-DIFF-REPORT.md)。部分插件(如 `@perrylink/dsh-github` 的 `ghc-card`)渲染了
卡片结构但**完全没带样式**,表现为无边框/无底色/直角。勾选本项后(纯前端):

- 以本插件卡片所在容器(`settings.plugin.item` 槽的 `ul`)为锚点,遍历其中的卡片;
- **computed 无边框(或透明底/无圆角)即判定为「未适配」**,给该 `li` 加上
  `.efx-adapt-card` 与 `data-efx-adapted="1"`(标准卡片外观:边框/底色/圆角/
  内边距/按钮与输入框基础样式,配方同 `gdb-card`);

> 为什么加 `data-efx-adapted` 属性(v0.4.2):`settings.plugin.item` 卡片由 React
> 渲染,**任何重渲染(展开/收起等)都会重写 `className`、把注入的 class 抹掉**,旧版
> 因此出现「边框/底色闪一下恢复原样再补上」的视觉回跳。属性是 `setAttribute` 写的,
> React 不管理它,重渲染后依然存在 —— 样式同时键在 `[data-efx-adapted="1"]`
> 属性选择器上,重渲染瞬间样式**不中断**;class 由 MutationObserver 在下一帧
> (rAF 合并,不再用 150ms 防抖)同步补回,作为可读标记。
- 已自带样式的卡片(有边框,如 `gdb-card`/`dgs-card`/`efx-card`/宿主卡片)不会被误伤;
- **不修改任何插件文件**;勾选即生效、取消即移除(实时,无需重启)。
- 异常处理:适配器任何异常都不影响页面(逐卡 try/catch);无法定位容器时静默跳过。

## 设置 → 插件:常用插件自愈菜单

宿主在启动时注册 `settings` namespace `dsh-eco-fixes`,因此在
**设置 → 插件 → 插件配置** 列表中出现「常用插件自愈」卡片:

- 4 个自愈方法各一行勾选框(勾选/取消即时生效,服务端按勾选门控运行);
- 每行在勾选项与勾选状态(已启用/已停用徽章)之间有 **`详细`** 按钮,鼠标悬停
  (或键盘聚焦)弹出该项说明;说明气泡以按钮为中心水平居中、宽度自适应且上限
  `min(300px, 55vw)`(v0.5.1 收窄),因此不会越过设置面板左右边界;
- 「当前状态」区显示各方法的体检结果(autoMemory / electron / runScript / 显示环境);
- 「立即执行已勾选项」按钮 = 等同 `POST /dsh-eco-fixes/apply`;
- 勾选变更与配置文件 `~/.dsh/dsh-eco-fixes.json` 的 `features` **双向同步**
  (不创建该文件则用默认勾选;菜单里改一次后文件自动生成)。

## 安装

在 profile 的 `package.json` 里加依赖并挂进 bundles(本部署已配好):

```jsonc
// /root/.dsh/profiles/web/package.json
"dependencies": { "dsh-eco-fixes": "link:/root/deepseek/project/dsh-eco-fixes" }
"dsh": { "profile": { "bundles": [ /* … */ "dsh-eco-fixes", "@a9i5k4/dsh-auto-memory" /* … */ ] } }
```

放在 `@a9i5k4/dsh-auto-memory` **之前**,保证记忆插件升级后首次启动即完成重打
(该次启动就生效,不需要再重启一次)。

然后重启 dsh-web:

```bash
systemctl restart dsh-web.service
```

## 使用

- 启动日志可见体检结果:搜索 `[dsh-eco-fixes]`。
- 状态/手动修复接口(回环或信任主机同源才可访问):
  - `GET  http://127.0.0.1:3080/dsh-eco-fixes/status` — 查看体检状态(含 `features` 勾选)
  - `POST http://127.0.0.1:3080/dsh-eco-fixes/apply` — 立即执行**已勾选**的待修复项
- 浏览器适配完成后需重启 dsh-web 一次(接口状态里 `restartNeeded: true` 时会提示)。

## 配置

`~/.dsh/dsh-eco-fixes.json`(不创建则用默认值;菜单勾选变更会自动写入):

```jsonc
{
  "profileRoot": "/root/.dsh/profiles/web",   // 记忆插件与 electron 所在 profile
  "trustedHosts": ["dsh.122050.xyz"],         // 自动记忆接口额外放行的 Host(可按需增删)
  "autoMemory": { "enabled": true },
  "browser": { "electron": { "autoInstall": true, "disableSandboxEnv": true } },
  "display": { "value": ":99", "unit": "xvfb-dsh.service", "screen": "1920x1080x24" },
  "features": {                               // 设置-插件菜单勾选(与菜单双向同步)
    "autoMemoryPatch": true,
    "dshBuiltinBrowserAdapt": true,           // v0.5.0 起合并 electron 安装/沙箱注入/显示环境
    "sidebarFooterStack": false,
    "pluginMenuStyleAdapter": false
  }
}
```

> 旧版配置迁移(v0.5.0):旧文件里的 `electronAutoInstall` / `runScriptSandboxEnv` /
> `displayEnv` 三个键会**自动折算**为新键 `dshBuiltinBrowserAdapt`(三者任一为
> `true` 即视为开启),并在下次启动时把文件落成新格式,无需手工改。

环境变量覆盖:`DSH_ECO_PROFILE_ROOT`、`DSH_ECO_TRUSTED_HOSTS`(逗号分隔)、
`DSH_ECO_ELECTRON_AUTO`(`0` 关闭 electron 自动安装)、`DSH_ECO_RUN_SCRIPT`、
`DSH_ECO_DISPLAY`。

## 卸载

1. 从 profile `package.json` 的 `dependencies` 与 `dsh.profile.bundles` 中移除
   `dsh-eco-fixes`;
2. 删除 `/root/deepseek/project/dsh-eco-fixes`;
3. 重启 dsh-web。已打的白名单补丁如不需要,可从
   `~/.dsh/patches/dsh-auto-memory-index.js.bak-*` 恢复,或直接执行
   `bash` 还原后重启。

## 相关

- 上游自动记忆插件:[Aik358/dsh-auto-memory](https://github.com/Aik358/dsh-auto-memory)
- 浏览器插件: [wqty123/dsh-browser](https://github.com/wqty123/dsh-browser)
- footerStack 迁移来源: dsh-guard-restart(本地插件目录 `/root/deepseek/project/dsh-guard-restart`)