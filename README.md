# Claudian WSL

> 基于 [Claudian](https://github.com/YishenTu/claudian) v2.0.17 的 WSL 支持版本

⚠️ **说明**: 本项目由 **Claude Code** 生成，仅测试了基本的 Claude Code-WSL 功能，其他功能未详细测试。如有问题请提 [Issues](https://github.com/bulynbulyn/claudian-wsl/issues)。

![GitHub release](https://img.shields.io/github/v/release/bulynbulyn/claudian-wsl)
![License](https://img.shields.io/github/license/bulynbulyn/claudian-wsl)

## 适用范围

**仅适用于 Claude Code / OpenCode 安装在 WSL 的 Windows 用户。**

其他用户请使用原版 [YishenTu/claudian](https://github.com/YishenTu/claudian)。

## WSL 功能


| Provider     | 功能                                                |
| ------------ | --------------------------------------------------- |
| **Claude**   | WSL distro 自动检测、路径自动转换、历史记录、Rewind |
| **OpenCode** | 数据库路径自动计算、历史记录加载（sqlite3）         |

## 安装

### 从 GitHub Release

1. 从 [最新 Release](https://github.com/bulynbulyn/claudian-wsl/releases/latest) 下载 `main.js`, `manifest.json`, `styles.css`
2. 复制到 vault 的 `.obsidian/plugins/claudian/` 目录
3. Settings → Community plugins → Enable "Claudian"

### 使用 BRAT

1. 安装 BRAT 插件
2. BRAT settings → "Add Beta plugin"
3. 输入: `https://github.com/bulynbulyn/claudian-wsl`

## WSL 配置

### Claude

1. Settings → Claude → **Installation method** → 选择 `WSL`
2. **CLI path**：填 `claude`（自动检测）或完整路径如 `/home/username/.local/bin/claude`
3. **WSL distro override**（可选）：指定 WSL 发行版名称，如 `Ubuntu`、`Debian`。留空则自动检测
4. **WSL home path**（可选）：填 WSL 用户目录，如 `/home/username`。留空则自动推断

**前提条件**：WSL 中需安装 Claude CLI 和 Node.js

### OpenCode

1. Settings → OpenCode → **Installation method** → 选择 `WSL`
2. **CLI path**：填 `opencode`（自动检测）或完整路径如 `/home/username/.local/bin/opencode`
3. **WSL distro override**（可选）：指定 WSL 发行版名称。留空则自动检测
4. **WSL home path**（必填）：填 WSL 用户目录，如 `/home/username`

**前提条件**：WSL 中需安装 sqlite3：`sudo apt install sqlite3`

### 参数说明


| 参数                    | 说明                                                             | 示例                              |
| ----------------------- | ---------------------------------------------------------------- | --------------------------------- |
| **Installation method** | 运行方式。`native-windows` = Windows 本地，`wsl` = 通过 WSL 运行 | `wsl`                             |
| **CLI path**            | CLI 可执行文件路径。留空自动检测                                 | `claude`、`/usr/local/bin/claude` |
| **WSL distro override** | WSL 发行版名称。留空从 vault 路径或默认 WSL 推断                 | `Ubuntu`、`Debian`                |
| **WSL home path**       | WSL 用户主目录。用于访问 session 文件                            | `/home/bulinbulin`                |

### 自动检测逻辑

- **WSL distro**：优先使用 override 设置 → 从 vault UNC 路径（`\\wsl$\Ubuntu\...`）推断 → 使用默认 WSL 发行版
- **CLI path**：留空时自动在 WSL 中查找 `claude` / `opencode` 命令
- **WSL home path**：留空时根据 Windows 用户名推断（`/home/<username>`）

## 原版功能

- Inline Edit、Slash Commands、@mention、Plan Mode
- MCP Servers、Multi-Tab、历史记录、Fork

详细文档请查看 [原版 README](https://github.com/YishenTu/claudian#readme)。

## License

[MIT License](LICENSE)
