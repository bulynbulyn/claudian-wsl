# Claudian WSL

> **基于 [Claudian](https://github.com/YishenTu/claudian) v2.0.4 by [Yishen Tu](https://github.com/YishenTu)**

![GitHub release](https://img.shields.io/github/v/release/bulynbulyn/claudian-wsl)
![License](https://img.shields.io/github/license/bulynbulyn/claudian-wsl)

## ⚠️ 适用范围

**本分支仅供 Claude Code 安装在 WSL 的 Windows 用户使用。**

如果你的 Claude Code：
- 安装在 **Windows 本机**（Native Windows）
- 或你使用 **macOS / Linux** 等其他操作系统

请使用原版 [YishenTu/claudian](https://github.com/YishenTu/claudian)，功能更完整且更新及时。

---

> ⚠️ **说明**: 本项目由 **glm5 + Claude Code** 生成，仅测试了基本的 Claude Code-WSL 功能，其他功能未详细测试。如有问题请提 [Issues](https://github.com/bulynbulyn/claudian-wsl/issues)。

An Obsidian plugin that embeds AI coding agents (Claude Code, Codex) in your vault with **WSL support for Windows users**.

## 新增功能：WSL 支持

在 Windows 上通过 WSL 运行 Claude CLI：

- **Installation method 选择**：Settings 中新增 Native Windows / WSL 选项
- **WSL distro 自动检测**：自动从 `\\wsl$\` 工作区路径推断，或手动指定
- **路径自动转换**：`D:\vault` → `/mnt/d/vault`

详细改动说明请查看 [CHANGELOG-wsl.md](CHANGELOG-wsl.md)。

## 安装

### 从 GitHub Release 安装（推荐）

1. 从 [最新 Release](https://github.com/bulynbulyn/claudian-wsl/releases/latest) 下载 `main.js`, `manifest.json`, `styles.css`
2. 在 Obsidian vault 的 plugins 目录创建文件夹：
   ```
   /path/to/vault/.obsidian/plugins/claudian/
   ```
3. 将下载的文件复制到该文件夹
4. Settings → Community plugins → Enable "Claudian"

### 使用 BRAT

1. 安装 BRAT 插件
2. BRAT settings → "Add Beta plugin"
3. 输入仓库 URL: `https://github.com/bulynbulyn/claudian-wsl`

## WSL 配置

1. Settings → Claude → Installation method 选择 **WSL**
2. （可选）设置 WSL distro override
3. CLI path 填 Linux 路径（如 `/usr/local/bin/claude`）或 `claude`
4. 确保 WSL 中已安装 Claude CLI 和 Node.js

## 原版功能

- **Inline Edit** — Select text + hotkey for direct note editing with diff preview
- **Slash Commands & Skills** — `/` for commands, `$` for skills
- **`@mention`** — Mention files, subagents, MCP servers
- **Plan Mode** — `Shift+Tab` to toggle
- **MCP Servers** — Connect external tools via Model Context Protocol
- **Multi-Tab & Conversations** — Multiple tabs, history, fork, resume

## Requirements

- **Claude provider**: [Claude Code CLI](https://code.claude.com/docs/en/overview) installed
- **WSL mode (Windows)**: Claude CLI + Node.js in WSL
- Obsidian v1.4.5+
- Desktop only (macOS, Linux, Windows)

## 原版文档

完整功能说明请查看原版 [README](https://github.com/YishenTu/claudian#readme)。

## 致谢

- 原版作者：[Yishen Tu](https://github.com/YishenTu)
- WSL 支持实现参考 Codex provider 架构

## License

[MIT License](LICENSE) - 继承原项目