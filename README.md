# Claudian WSL

> **基于 [Claudian](https://github.com/YishenTu/claudian) v2.0.16 by [Yishen Tu](https://github.com/YishenTu)**

![GitHub release](https://img.shields.io/github/v/release/bulynbulyn/claudian-wsl)
![License](https://img.shields.io/github/license/bulynbulyn/claudian-wsl)

## ⚠️ 适用范围

**本分支仅供 Claude Code / OpenCode安装在 WSL 的 Windows 用户使用。**

如果你的 Claude Code：
- 安装在 **Windows 本机**（Native Windows）
- 或你使用 **macOS / Linux** 等其他操作系统

请使用原版 [YishenTu/claudian](https://github.com/YishenTu/claudian)，功能更完整且更新及时。

---

> ⚠️ **说明**: 本项目由 **glm5 + Claude Code** 生成，仅测试了基本的 Claude Code-WSL 功能，其他功能未详细测试。如有问题请提 [Issues](https://github.com/bulynbulyn/claudian-wsl/issues)。

An Obsidian plugin that embeds AI coding agents (Claude Code, Codex, Opencode) in your vault with **WSL support for Windows users**.

## 新增功能：WSL 支持

在 Windows 上通过 WSL 运行 Claude CLI 或 OpenCode CLI：

| Provider | 功能 |
|----------|------|
| **Claude** | Installation method 选择、WSL distro 自动检测、路径自动转换、历史记录支持、Rewind 支持 |
| **OpenCode** | Installation method 选择、数据库路径自动计算、历史记录加载（sqlite3）、UNC 路径存储 |

详细改动说明请查看 [CHANGELOG-wsl.md](CHANGELOG-wsl.md)。

## Requirements

- **Claude provider**: [Claude Code CLI](https://code.claude.com/docs/en/overview) installed (native install recommended). Claude subscription/API or compatible provider ([Openrouter](https://openrouter.ai/docs/guides/guides/claude-code-integration), [Kimi](https://platform.moonshot.ai/docs/guide/agent-support), etc.).
- **Optional providers**: [Codex CLI](https://github.com/openai/codex), [Opencode](https://opencode.ai/).
- **WSL mode (Windows)**: Claude CLI/OpenCode CLI + Node.js in WSL
- Obsidian v1.7.2+
- Desktop only (macOS, Linux, Windows)

## 安装

### From Obsidian Community Plugins (recommended)

1. Open Obsidian → Settings → Community plugins → Browse
2. Search for "Claudian" and click Install
3. Enable the plugin

Or install directly from the [community plugin page](https://community.obsidian.md/plugins/realclaudian).

### 从 GitHub Release 安装

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

### Claude WSL

1. Settings → Claude → Installation method 选择 **WSL**
2. （可选）设置 WSL distro override
3. CLI path 填 Linux 路径（如 `/usr/local/bin/claude`）或 `claude`
4. 确保 WSL 中已安装 Claude CLI 和 Node.js

### OpenCode WSL

1. Settings → OpenCode → Installation method 选择 **WSL**
2. CLI path 填 Linux 路径（如 `/usr/local/bin/opencode`）或 `opencode`
3. WSL home path 填 WSL 用户目录（如 `/home/username`）
4. 确保 WSL 中已安装 sqlite3：
   ```bash
   sudo apt install sqlite3  # Ubuntu/Debian
   ```

## 原版功能

- **Inline Edit** — Select text + hotkey for direct note editing with diff preview
- **Slash Commands & Skills** — `/` for commands, `$` for skills
- **`@mention`** — Mention files, subagents, MCP servers
- **Plan Mode** — `Shift+Tab` to toggle
- **MCP Servers** — Connect external tools via Model Context Protocol
- **Multi-Tab & Conversations** — Multiple tabs, history, fork, resume

## Privacy & Data Use

- **Sent to API**: Your input, attached files, images, and tool call outputs. Default: Anthropic (Claude) or OpenAI (Codex); configurable via provider settings and environment variables.
- **Local storage**: Claudian settings and session metadata in `vault/.claudian/`; Claude provider files in `vault/.claude/`; transcripts in `~/.claude/projects/` (Claude) and `~/.codex/sessions/` (Codex).
- **Environment variables**: Provider subprocesses inherit the Obsidian process environment plus any variables you configure in Claudian. This is needed for CLI authentication, proxies, certificates, and PATH resolution.
- **Device-specific paths**: Per-device CLI paths use an opaque local key stored in browser local storage, not your system hostname.
- **Background activity**: Claudian does not run telemetry beacons. UI polling timers read local Obsidian/editor selection state only. Network activity is limited to explicit provider runtime work, configured MCP endpoints, and provider SDK/CLI calls needed to answer your requests.

## Troubleshooting

### Claude CLI not found

If you encounter `spawn claude ENOENT` or `Claude CLI not found`, the plugin can't auto-detect your Claude installation. Common with Node version managers (nvm, fnm, volta).

**Solution**: Leave the setting empty first so Claudian can auto-detect Claude Code. If auto-detection fails, find your CLI path and set it in Settings → Advanced → Claude CLI path.

| Platform | Command | Example Path |
|----------|---------|--------------|
| macOS/Linux | `which claude` | `/Users/you/.volta/bin/claude` |
| Windows (native) | `where.exe claude` | `C:\Users\you\AppData\Local\Claude\claude.exe` |
| Windows (npm) | `npm root -g` | `{root}\@anthropic-ai\claude-code\cli-wrapper.cjs` |

> **Note**: On Windows, avoid `.cmd` and `.ps1` wrappers. Use `claude.exe` for native installs, or `cli-wrapper.cjs` for package-manager installs. `cli.js` is only a legacy fallback for older Claude Code npm packages.

**Alternative**: Add your Node.js bin directory to PATH in Settings → Environment → Custom variables.

### npm CLI and Node.js not in same directory

If using npm-installed CLI, check if `claude` and `node` are in the same directory:
```bash
dirname $(which claude)
dirname $(which node)
```

If different, GUI apps like Obsidian may not find Node.js.

**Solutions**:
1. Install native binary (recommended)
2. Add Node.js path to Settings → Environment: `PATH=/path/to/node/bin`

### Other providers

Codex and Opencode support are live but features might be incomplete, and still need more testing across platforms and installation methods. If you have feature request or run into any bugs, please [submit a GitHub issue](https://github.com/YishenTu/claudian/issues).

## Architecture

```
src/
├── main.ts                      # Plugin entry point
├── app/                         # Shared defaults and plugin-level storage
├── core/                        # Provider-neutral runtime, registry, and type contracts
│   ├── runtime/                 # ChatRuntime interface and approval types
│   ├── providers/               # Provider registry and workspace services
│   ├── auxiliary/               # Shared provider auxiliary services
│   ├── bootstrap/               # Plugin bootstrap wiring
│   ├── security/                # Approval utilities
│   └── ...                      # commands, mcp, prompt, storage, tools, types
├── providers/
│   ├── claude/                  # Claude SDK adaptor, prompt encoding, storage, MCP, plugins
│   ├── codex/                   # Codex app-server adaptor, JSON-RPC transport, JSONL history
│   ├── opencode/                # Opencode adaptor
│   └── acp/                     # Agent Client Protocol shared transport
├── features/
│   ├── chat/                    # Sidebar chat: tabs, controllers, renderers
│   ├── inline-edit/             # Inline edit modal and provider-backed edit services
│   └── settings/                # Settings shell with provider tabs
├── shared/                      # Reusable UI components and modals
├── i18n/                        # Internationalization (10 locales)
├── types/                       # Shared ambient types
├── utils/                       # Cross-cutting utilities
└── style/                       # Modular CSS
```

## Roadmap

- [x] 1M Opus and Sonnet models
- [x] Codex provider integration
- [x] Opencode support
- [ ] More to come!

## 原版文档

完整功能说明请查看原版 [README](https://github.com/YishenTu/claudian#readme)。

## 致谢

- 原版作者：[Yishen Tu](https://github.com/YishenTu)
- WSL 支持实现参考 Codex provider 架构

## License

[MIT License](LICENSE) - 继承原项目
