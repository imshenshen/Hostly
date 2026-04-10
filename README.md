# Hostly

## Why fork
https://github.com/zengyufei/Hostly/issues/3#issuecomment-3753877731
 
addition features:
* Search (CMD+F, CMD+Shift+F)
* Folder grouping
* `list` command returns JSON format
* support `Raycast` , [doc here](./raycast/README.md)

**Language**: English | [中文简体](./README_zh.md)

### Hostly (Minimalist Hosts Switcher)

An **ultra-lightweight**, high-performance Hosts management tool built on **Tauri v2 + Rust**. By removing the frontend framework (migrating to Vanilla JS), we have pushed size and performance to the extreme.

<p align="center">
  <img src="https://raw.githubusercontent.com/zengyufei/hostly/main/img/index.png" alt="Hostly Main Interface" width="600" />
</p>

> 🤖 **Special Note**: This project was deeply designed and implemented with the help of the AI agent, pursuing ultimate simplicity and efficiency.

## ✨ Core Features

- 🚀 **Lightning Fast**: Built with **JS + Native CSS**. Single-file app size is **~1MB** with millisecond cold-start.
- 🎨 **Modern UI & Personalization**: Supports **sidebar drag-to-resize**, built-in **Light/Dark** themes, and **window size memory**.
- ⚡ **Optimized Startup Experience**: Startup performance and visuals optimized for various system environments.
- 🔔 **Non-Intrusive Feedback**: Built-in lightweight Toast notification system — say goodbye to disruptive confirmation dialogs.
- 🛡️ **Smart Privilege Escalation**: Automatically detects admin privileges and escalates on demand, supporting direct editing of the system Hosts file.
- ⚙️ **Dual-Mode Operation**: Fully supports **GUI** visual operation and professional **CLI** command-line invocation.
- 🤖 **Headless CLI**: Provides a standalone `hostly-core` binary, designed for server/CI environments with zero GUI dependencies.
- 🔄 **Migration Support**: Supports importing **SwitchHosts** configurations for a seamless transition.
- ☁️ **Remote Subscriptions**: Supports adding remote Hosts sources (HTTP/HTTPS), silently auto-updated by a background scheduler.
- 🍎 **Universal Architecture Support**: Builds for **macOS** (Intel & Apple Silicon), as well as Windows and Linux.
- 🔌 **Data Portability**: Supports full configuration import/export as text files.

## 🧩 Feature Details

- **UI Interaction**:
  - **Drag to Resize**: Drag the left divider to customize sidebar width; the app remembers your preference.
  - **Theme Follow**: Automatically applies the system or last-used theme on startup for a smooth visual experience.
- **Sidebar Layout**: Unified management of "System Backup", "Public Config", and "Custom Environments".
- **Multi-Mode Support**:
  - **Single-Select Mode**: Mutually exclusive switching to keep hosts clean.
  - **Multi-Select Mode**: Multiple environments can be stacked and activated simultaneously.
- **Command Line (CLI)**: Full sub-command support, available in two modes:
  - `hostly`: Distributed with the GUI, suitable for desktop users, supports `open/list/export` and more.
  - `hostly-core`: **Pure CLI version**, smaller footprint, no GUI dependency, ideal for automation scripts.
- **Remote Config & Auto-Update**:
  - **Subscriptions**: Add a URL to subscribe to a remote config with a customizable update interval (default: 1 hour).
  - **Interactive Status Bar**: When a remote config is selected, the bottom status bar shows live update status with a one-click force-refresh button.
  - **Background Scheduling**: Built-in smart scheduler (activates 5 seconds after startup) silently performs updates in the background without blocking the UI.


<p align="center">
  <img src="https://raw.githubusercontent.com/imshenshen/hostly/main/img/common.png" alt="Hostly Main Interface" width="600" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/imshenshen/hostly/main/img/multi.png" alt="Hostly Main Interface" width="600" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/imshenshen/hostly/main/img/window.png" alt="Hostly Main Interface" width="600" />
</p>


## 🚀 Quick Start

### Build & Run

```bash
# After cloning the project
npm install

# Enter development mode
npm run tauri dev

# Build release package (output in src-tauri/target/release/)
npm run tauri build
```

### Common CLI Commands

You can use `hostly` or `hostly-core` to run the following commands:

> **Tip**: Running CLI commands on Windows will automatically request UAC elevation.

| Command | Description | Example |
| :--- | :--- | :--- |
| `list` | List all configurations and their status | `hostly list` |
| `open` | Activate one or more environments | `hostly open --names Dev Test --multi` |
| `close` | Deactivate a specified environment | `hostly close --names Dev` |
| `multi / single` | Toggle global selection mode | `hostly multi` |
| `export` | Export configuration or backup | `hostly export --target global.json` |
| `import` | Import configuration or backup | `hostly import --target` &nbsp;&nbsp;&nbsp;global.json &nbsp;&nbsp;single.txt &nbsp;or an http/https URL |
| `migration` | Migrate a SwitchHosts backup | `hostly migration --target swV4_backup.json` |

> Example: `hostly-core-win-x64.exe import ycf --target hosts.txt --open --single`
> Switches to single-select mode, imports hosts.txt into "ycf" and activates it. Creates "ycf" if it doesn't exist.

> Example: `hostly-core-win-x64.exe import ycf --target hosts.txt --open --multi`
> Switches to multi-select mode, imports hosts.txt into "ycf" and activates it. Creates "ycf" if it doesn't exist.

> Example: `hostly-core-win-x64.exe import ycf --target http://localhost:8080/hosts.txt --open --multi`
> Switches to multi-select mode, imports the remote hosts.txt into "ycf" and activates it. Creates "ycf" if it doesn't exist.

### SwitchHosts Migration Test Flow

Run these tests to verify SwitchHosts import compatibility (including folder hierarchy flattening to top-level folders):

```bash
cd src-tauri
cargo test import_switchhosts -- --nocapture
```

## 🛠️ FAQ

**Q: Why is the generated app so small?**

> A: Because we use the browser's native DOM operations and native CSS directly, with zero dependency on any heavy third-party libraries (like React/Vue/Tailwind, etc.), achieving the ultimate minimal runtime overhead and file size (~1MB).
---

**Q: Which download is recommended?**
> A:
> - **Windows**: Regular users are recommended to download `Hostly.exe`; if you need to manage permissions manually, download `hostly-off-elevation.exe` (requires right-click → Run as Administrator).
> - **macOS (Apple Silicon / M1/M2...)**: Download the version with the `aarch64` or `universal` suffix.
> - **macOS (Intel)**: Download the version with the `x86_64` or `universal` suffix.

⚠️ **macOS Users Note**: If you see "app is damaged and can't be opened", this is due to unsigned app security restrictions. Run the following command in Terminal to fix it:

> ```bash
> xattr -cr /Applications/Hostly.app
> ```
---

**Q: Can't open with double-click or getting a permission error?**
> A: Please check which version you are using:
> - **Hostly.exe (Standard)**: Has built-in auto-elevation logic; a UAC prompt will appear on startup — click "Yes" to allow.
> - **hostly-off-elevation.exe (No Elevation)**: This is a clean version with no elevation code. You must **right-click → Run as Administrator**, or go to Properties → Compatibility → check "Run this program as an administrator" for permanent elevation.
---

**Q: Getting "Permission Denied" on macOS or Linux?**
> A: Modifying the system hosts file is a privileged operation.
> - **Linux**: Run with `sudo ./hostly-core-linux-x64`.
> - **macOS**: The GUI version will automatically prompt for a password. For CLI, ensure you have run with `sudo` or have the appropriate permissions beforehand.
---

**Q: Why does a new window briefly pop up and close after running a CLI command?**
> A: This is because the main process was launched without admin privileges. To gain the necessary permissions, it spawns a new admin child process to execute the command. This is normal Windows security behavior.
--

**Q: How do I migrate my SwitchHosts backup?**
> A:
> - **GUI**: Click the "Import" button in the sidebar and directly select the SwitchHosts backup JSON file — it will be auto-detected.
> - **CLI**: Use the dedicated migration command: `hostly migration --target sw_backup.json`.
--

## 📄 License
MIT
