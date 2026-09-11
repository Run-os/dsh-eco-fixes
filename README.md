# dsh-eco-fixes

DeepSeek Harness 常用插件问题的一键自愈插件(web profile 本地插件)。

安装后**每次启动自动体检修复**;插件(或其修复对象)更新后也会自动重打。
所有自愈方法都是**可选项**:在 **设置 → 插件 → 插件配置** 的
**「常用插件自愈(dsh-eco-fixes)」菜单**里勾选,**勾选了的才运行**。

## 自愈方法(全为可选项,菜单内勾选)

| 勾选项 | 作用 | 默认 |
| --- | --- | --- |
| 自动记忆白名单补丁 | 修复 dsh-auto-memory 403「forbidden: loopback-only」,插件升级后自动重打 | ✅ 开 |
| 浏览器 Electron 自动安装 | dsh-builtin-browser 缺 electron 二进制时后台 `npx install-electron` | ✅ 开 |
| 启动脚本沙箱环境注入 | run-dsh-web.sh 注入 `ELECTRON_DISABLE_SANDBOX`(root 下共享浏览器必需) | ✅ 开 |
| 侧边栏底部按钮各占一行 | 让 `sidebar.footer.action` 槽内各插件按钮独占一行、不再并排(**自 dsh-guard-restart v0.7.0 迁移而来**) | ⬜ 关 |
| 显示环境(Xvfb)自动配置 | 注入 `DISPLAY` 到启动脚本并生成/启用 `xvfb-dsh.service`(共享浏览器自托管窗口需要 X 显示) | ⬜ 关 |

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

### 2. dsh-builtin-browser 的 electron 二进制缺失

Electron 44+ 首次使用才下载二进制;缺失时 browser provider 报
`electron unavailable: cannot locate a spawnable Electron binary`,
`browser_*` 工具报 `BROWSER_PROVIDER_UNAVAILABLE`。

本插件检测到缺失后自动在 profile 目录后台执行 `npx install-electron`
(日志 `~/.dsh/logs/eco-fixes-electron.log`),状态中标出「需重启 dsh-web 生效」——
重启一次后共享浏览器即可使用。

### 3. run-dsh-web.sh 注入 electron 运行环境

在 dsh-web 启动包装脚本里幂等注入 `ELECTRON_DISABLE_SANDBOX=1`(避免 Chromium
以 root 运行时报 "Running as root without --no-sandbox is not supported")。
下次重启 dsh-web 生效。

### 4. 侧边栏底部按钮各占一行(自 dsh-guard-restart 迁移)

`sidebar.footer.action` 槽容器内各插件按钮(如 dsh-cost-meter 徽章、
dsh-auto-memory 按钮)原本并排显示;本项开启后容器改为 `flex-wrap` + 每个子元素
`flex:0 0 100%`,让每个按钮独占一行。**勾选即时生效、取消勾选即时恢复**(纯前端
布局,不修改任何文件)。dsh-guard-restart v0.7.0 起已移除同名功能,避免重复实现。

### 5. 显示环境(Xvfb)自动配置(v0.3.0 新增,默认关闭)

共享浏览器的自托管 Electron 窗口需要 X 显示;`electronStatus` 只能证明二进制
存在,**无法**证明「能开出窗口」——还需要 `DISPLAY` 环境变量与可达的 X server。
勾选本项后,每次启动/手动执行时会**检测并修复**(幂等):

- **检测**:Xvfb 可执行文件、X socket(`/tmp/.X11-unix/X<n>`)、当前进程 `DISPLAY`
  是否指向目标 display、`xvfb-dsh.service` 是否存在/启用/运行、启动脚本是否已导出 `DISPLAY`。
- **修复**:
  1. 在 `run-dsh-web.sh` 幂等注入 `export DISPLAY=:99`(与沙箱变量同款机制);
  2. 生成 `/etc/systemd/system/xvfb-dsh.service` 并 `systemctl enable --now`(仅在
     Xvfb 已安装时;未安装只报告「请先 apt-get install -y xvfb」,不自动 apt)。
- **生效**:运行中进程的环境无法热改,修复完成后状态会标出「需重启 dsh-web 生效」
  (`restartNeeded`)。
- 相关配置(可选,默认值见下):`display.value`(display 号)、`display.unit`、`display.screen`。

## 设置 → 插件:常用插件自愈菜单

宿主在启动时注册 `settings` namespace `dsh-eco-fixes`,因此在
**设置 → 插件 → 插件配置** 列表中出现「常用插件自愈」卡片:

- 4 个自愈方法各一行勾选框(勾选/取消即时生效,服务端按勾选门控运行);
- 「当前状态」区显示各方法的体检结果(autoMemory / electron / runScript);
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
- 浏览器二进制装好后需重启 dsh-web 一次(接口状态里 `restartNeeded: true` 时会提示)。

## 配置

`~/.dsh/dsh-eco-fixes.json`(不创建则用默认值;菜单勾选变更会自动写入):

```jsonc
{
  "profileRoot": "/root/.dsh/profiles/web",   // 记忆插件与 electron 所在 profile
  "trustedHosts": ["dsh.122050.xyz"],         // 自动记忆接口额外放行的 Host(可按需增删)
  "autoMemory": { "enabled": true },
  "browser": { "electron": { "autoInstall": true } },
  "display": { "value": ":99", "unit": "xvfb-dsh.service", "screen": "1920x1080x24" }, // 显示环境参数(勾选 displayEnv 时使用)
  "features": {                               // 设置-插件菜单勾选(与菜单双向同步)
    "autoMemoryPatch": true,
    "electronAutoInstall": true,
    "runScriptSandboxEnv": true,
    "sidebarFooterStack": false,
    "displayEnv": false
  }
}
```

环境变量覆盖:`DSH_ECO_PROFILE_ROOT`、`DSH_ECO_TRUSTED_HOSTS`(逗号分隔)、
`DSH_ECO_ELECTRON_AUTO`(`0` 关闭自动安装)、`DSH_ECO_RUN_SCRIPT`、`DSH_ECO_DISPLAY`。

> 说明:浏览器部分默认**只处理 electron 二进制**;"显示环境(Xvfb)自动配置"为
> 可选项(默认关闭),勾选后才负责注入 `DISPLAY` 与生成/启用 Xvfb 单元——
> 是否符合部署要求由你决定。若用其他方式提供 X(如真显示器/外部 Xvfb),
> 保持该项关闭即可(检测状态会如实展示)。

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