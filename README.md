# Claudian WSL - WSL2 支持

> **基于 [Claudian](https://github.com/YishenTu/claudian) by [Yishen Tu](https://github.com/YishenTu)**

> 📖 **完整功能说明请查看 [README_ORIGINAL.md](README_ORIGINAL.md)**（原作者文档）

![GitHub release](https://img.shields.io/github/v/release/bulynbulyn/claudian-wsl)
![License](https://img.shields.io/github/license/bulynbulyn/claudian-wsl)

本项目是 Claudian Obsidian 插件的 fork，添加了 **WSL2 支持**，让 Windows 用户可以在 Obsidian 中连接运行于 WSL2 Linux 发行版中的 Claude Code CLI。

## 新增功能

- **WSL2 集成**: Windows Obsidian 连接 WSL2 中的 Claude Code CLI
- **自动检测**: 自动检测可用的 WSL2 发行版
- **路径转换**: Windows ↔ WSL 路径自动转换（如 `D:\vault` → `/mnt/d/vault`）
- **wsl:// URI**: 新的 CLI 路径配置格式（如 `wsl://Ubuntu/home/user/.local/bin/claude`）
- **多发行版支持**: 可选择不同的 WSL2 发行版

## 安装方法

### 从 GitHub Release 安装（推荐）

1. 从 [最新 Release](https://github.com/bulynbulyn/claudian-wsl/releases/latest) 下载 `main.js`, `manifest.json`, `styles.css`
2. 在 Obsidian vault 的 plugins 目录创建文件夹：
   ```
   /path/to/vault/.obsidian/plugins/claudian-wsl/
   ```
3. 将下载的文件复制到 `claudian-wsl` 文件夹
4. 在 Obsidian 设置中启用插件：
   - Settings → Community plugins → Enable "Claudian WSL"

### 使用 BRAT

1. 安装 BRAT 插件
2. 在 BRAT 设置中点击 "Add Beta plugin"
3. 输入仓库 URL: `https://github.com/bulynbulyn/claudian-wsl`
4. 点击 "Add Plugin"

## WSL2 配置指南

### 1. 确保 WSL2 已安装

在 Windows PowerShell 中运行：
```powershell
wsl -l -v
```

应显示你的 Linux 发行版（如 Ubuntu）状态为 Running，版本为 2。

### 2. 在 WSL2 中安装 Claude Code CLI

```bash
# 在 WSL2 终端中执行
# 方法1: npm 安装
npm install -g @anthropic-ai/claude-code

# 方法2: 官方推荐的原生安装
# 参考 https://docs.anthropic.com/en/docs/claude-code
```

### 3. 配置插件

在 Obsidian 中打开 Claudian WSL 设置：

1. **启用 WSL Mode** - 打开开关
2. **选择发行版** - 从下拉列表选择你的 WSL2 发行版（自动检测）
3. **设置 CLI 路径** - 输入 WSL 内的 Claude CLI 路径
   - 例如: `/home/user/.local/bin/claude` 或 `/usr/local/bin/claude`
4. **测试连接** - 点击按钮验证配置是否正确

### 工作原理

插件会自动处理：

- Windows 路径 → WSL 路径转换（`D:\Obsidian\vault` → `/mnt/d/Obsidian/vault`）
- 通过 `wsl.exe --exec` 执行 WSL 内的 CLI
- UTF-16 编码处理（WSL 输出的特殊编码）
- 多发行版切换支持

## 技术实现

关键文件：

- `src/utils/wslPath.ts` - WSL 路径转换和发行版检测
- `src/core/agent/customSpawn.ts` - WSL 进程创建
- `src/core/types/settings.ts` - WSL 配置字段

核心逻辑：

```typescript
// 通过 wsl.exe 执行 WSL 内的命令
const args = ['--exec', cliPath, '--input-format', 'stream-json', ...];
spawn('wsl.exe', ['-d', distro, ...args]);
```

## 开发文档

详细开发文档请参阅：

- [WSL_DEVELOPMENT.md](WSL_DEVELOPMENT.md) - WSL2 支持开发详解
- [MERGE_GUIDE.md](MERGE_GUIDE.md) - 与上游版本合并指南

## 致谢

感谢原作者 [Yishen Tu](https://github.com/YishenTu) 开发 Claudian 插件。

## 许可证

继承原项目的 [MIT License](LICENSE)。

## 相关链接

- **原项目**: [https://github.com/YishenTu/claudian](https://github.com/YishenTu/claudian)
- **本 Fork**: [https://github.com/bulynbulyn/claudian-wsl](https://github.com/bulynbulyn/claudian-wsl)
- **Claude Code CLI**: [https://docs.anthropic.com/en/docs/claude-code](https://docs.anthropic.com/en/docs/claude-code)
- **Obsidian**: [https://obsidian.md](https://obsidian.md)