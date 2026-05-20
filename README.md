# Claudian WSL

> 基于 [Claudian](https://github.com/YishenTu/claudian) v2.0.16 的 WSL 支持版本

![GitHub release](https://img.shields.io/github/v/release/bulynbulyn/claudian-wsl)
![License](https://img.shields.io/github/license/bulynbulyn/claudian-wsl)

## 适用范围

**仅适用于 Claude Code / OpenCode 安装在 WSL 的 Windows 用户。**

其他用户请使用原版 [YishenTu/claudian](https://github.com/YishenTu/claudian)。

## WSL 功能

| Provider | 功能 |
|----------|------|
| **Claude** | WSL distro 自动检测、路径自动转换、历史记录、Rewind |
| **OpenCode** | 数据库路径自动计算、历史记录加载（sqlite3） |

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

1. Settings → Claude → Installation method → **WSL**
2. CLI path 填 `claude` 或 Linux 路径
3. 确保 WSL 中已安装 Claude CLI

### OpenCode

1. Settings → OpenCode → Installation method → **WSL**
2. CLI path 填 `opencode` 或 Linux 路径
3. WSL home path 填 `/home/username`
4. 确保 WSL 中已安装 sqlite3：`sudo apt install sqlite3`

## 原版功能

- Inline Edit、Slash Commands、@mention、Plan Mode
- MCP Servers、Multi-Tab、历史记录、Fork

详细文档请查看 [原版 README](https://github.com/YishenTu/claudian#readme)。

## License

[MIT License](LICENSE)
