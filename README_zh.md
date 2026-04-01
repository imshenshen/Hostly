# Hostly

## Why fork
https://github.com/zengyufei/Hostly/issues/3#issuecomment-3753877731

addition features:
* Search (CMD+F, CMD+Shift+F)
* Folder grouping
* `list` command returns JSON format

**语言**: [English](./README.md) | 中文简体

### Hostly (极简 Hosts 切换工具)

一个基于 Tauri v2 + Rust 构建的**极致轻量**、高性能 Hosts 管理工具。我们通过移除前端框架（迁移至 Vanilla JS），将体积和性能优化到了极点。

<p align="center">
  <img src="https://raw.githubusercontent.com/zengyufei/hostly/main/img/index.png" alt="Hostly Main Interface" width="600" />
</p>

> 🤖 **特别说明**: 本项目由 AI 智能体深度参与设计与实现，追求极致的简洁与高效。

## ✨ 核心特性

- 🚀 **极速启动**: 采用 **JS + 原生 CSS** 实现。单文件应用大小 **1MB**，毫秒级冷启动。
- 🎨 **现代 UI & 个性化**: 支持**侧边栏拖拽**调整宽度，内置 **明亮/深色** 双主题，并支持 **窗口大小记忆**。
- ⚡ **极致启动体验**: 针对各类系统环境进行了启动性能与视觉优化。
- 🔔 **非侵入式反馈**: 内置轻量级 Toast 通知系统，告别干扰式的确认弹窗。
- 🛡️ **智能提权**: 自动检测管理员权限并按需提权，支持直接编辑系统 Hosts 文件。
- ⚙️ **双模操作**: 完美支持 **GUI** 可视化操作与专业的 **CLI** 命令行调用。
- 🤖 **Headless CLI**: 提供独立的 `hostly-core` 二进制文件，专为服务器/CI环境设计，零GUI依赖。
- 🔄 **兼容迁移**: 支持导入 **SwitchHosts** 的配置，无缝切换无压力。
- ☁️ **远程订阅**: 支持添加远程 Hosts 源（HTTP/HTTPS），由后台调度器静默自动更新。
- 🍎 **全架构支持**: 提供 **macOS** (同时支持 Intel/Apple Silicon)，以及 Windows/Linux 全平台构建。
- 🔌 **数据便携**: 支持全量配置导入导出为文本文件。

## 🧩 功能详情

- **界面交互**: 
  - **拖拽调节**: 鼠标拖拽左侧分割线即可自定义侧边栏宽度，程序会自动记住您的偏好。
  - **主题跟随**: 启动时自动根据系统或上次设置应用主题，视觉体验丝滑流畅。
- **侧边栏布局**: 统一管理“系统备份”、“公共配置”与“自定义环境”。
- **多模式并存**: 
  - **单选模式**: 互斥切换，保持 hosts 清爽。
  - **多选模式**: 多个环境同时勾选叠加生效。
- **命令行 (CLI)**: 完整的子命令支持，分为两种模式：
  - `hostly`: 随 GUI 分发，适合桌面用户，支持 `open/list/export` 等操作。
  - `hostly-core`: **纯命令行版本**，体积更小，无视 GUI 依赖，适合自动化脚本。
- **远程配置与自动更新**:
  - **订阅源**: 输入 URL 即可添加远程配置，支持自定义更新间隔（默认 1小时）。
  - **交互式状态栏**: 选中远程配置时，底部状态栏会实时显示更新状态，支持一键强制刷新。
  - **后台调度**: 内置智能调度器（启动 5秒后介入），在后台静默完成更新，不阻塞 UI 操作。


<p align="center">
  <img src="https://raw.githubusercontent.com/imshenshen/hostly/main/img/common.png" alt="Hostly Main Interface" width="600" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/imshenshen/hostly/main/img/multi.png" alt="Hostly Main Interface" width="600" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/imshenshen/hostly/main/img/window.png" alt="Hostly Main Interface" width="600" />
</p>


## 🚀 快速开始

### 构建运行

```bash
# 克隆项目后
npm install

# 进入开发模式
npm run tauri dev

# 打包发布版 (产物在 src-tauri/target/release/)
npm run tauri build
```

### 常用命令行操作

您可以使用 `hostly` 或 `hostly-core` 执行以下命令：

> **提示**: 在 Windows 下运行 CLI 命令会自动请求 UAC 提权。

| 命令 | 说明 | 示例 |
| :--- | :--- | :--- |
| `list` | 列出所有配置及其状态 | `hostly list` |
| `open` | 激活一个或多个环境 | `hostly open --names Dev Test --multi` |
| `close` | 关闭指定环境 | `hostly close --names Dev` |
| `multi / single` | 切换全局选择模式 | `hostly multi` |
| `export` | 导出配置或备份 | `hostly export --target global.json` |
| `import` | 导入配置或备份 | `hostly import --target`    全局配置.json  单个配置.txt 或者 http/https 链接 |
| `migration` | 迁移 SwitchHosts 备份 | `hostly migration --target swV4_backup.json` |

> 举例使用 hostly-core-win-x64.exe import ycf --target hosts.txt --open --single
> 更改为单选后导入 hots.txt 到ycf且生效，如果 ycf 不存在则创建

> 举例使用 hostly-core-win-x64.exe import ycf --target hosts.txt --open --multi
> 更改为多选后导入 hots.txt 到ycf且生效，如果 ycf 不存在则创建

> 举例使用 hostly-core-win-x64.exe import ycf --target http://localhost:8080/hosts.txt --open --multi
> 更改为多选后导入 远程配置hots.txt 到ycf且生效，如果 ycf 不存在则创建

## 🛠️ 常见问题

**Q: 为什么生成的体积这么小？**  

> A: 因为我们直接使用了浏览器原生的 DOM 操作和原生 CSS，完全不依赖任何第三方重量级库（如 React/Vue/Tailwind 等），从而实现了极致的运行时开销和文件体积 (仅约 1MB)。
---

**Q: 推荐下载？**
> A: 
> - **Windows**: 普通用户推荐 `Hostly.exe`；如需手动管理权限请下载 > `hostly-off-elevation.exe`（需右键管理员运行）。
> - **macOS (Apple Silicon / M1/M2...)**: 请下载带有 `aarch64` 或 `universal` 后缀的版本。
> - **macOS (Intel)**: 请下载带有 `x86_64` 或 `universal` 后缀的版本。

⚠️ **macOS 用户注意**: 若打开时提示“应用已损坏，无法打开”，是由于未签名的安全限制。请在终端运行以下命令修复：

> ```bash
> xattr -cr /Applications/Hostly.app
> ```
---

**Q: 双击打不开或提示权限不足？**
> A: 请检查您使用的版本：
> - **Hostly.exe (标准版)**: 内置自动提权逻辑，启动时会弹出 UAC 提示，请点击“是”允许。
> - **hostly-off-elevation.exe (无提权版)**: 这是一个纯净版本，不包含任何提权代码。您必须**右键 -> 以管理员身份运行**，或者右键属性 -> 兼容性 -> 勾选“以管理员身份运行此程序”来永久提权。
---

**Q: macOS 或 Linux 下提示 Permission Denied？**
> A: 修改系统 hosts 文件属于特权操作。
> - **Linux**: 请使用 `sudo ./hostly-core-linux-x64` 运行。
> - **macOS**: GUI 版本会自动弹窗请求密码提权。如果是 CLI，请确保在此前已通过 `sudo` 或拥有相应权限。
---

**Q: 命令行执行完为什么弹出了个新窗口就关了？** 
> A: 这是因为主进程是非管理员启动的，为了获得权限，它启动了一个新的管理员子进程来执行命令。这是正常的 Windows 安全机制。
--

**Q: 如何迁移 SwitchHosts 备份？**
> A: 
> - **GUI**: 点击侧边栏的“导入”按钮，直接选择 SwitchHosts 的备份 JSON 文件即可自动识别。
> - **CLI**: 使用专用迁移命令：`hostly migration --target sw_backup.json`。
--

## 📄 License
MIT
