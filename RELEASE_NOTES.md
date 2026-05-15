## v2.0.10-wsl.2

修复 WSL root 用户运行 Claude CLI 时的安全限制问题。

### Bug 修复

- **WSL root 用户支持**：检测 WSL root 用户并自动降级权限模式
  - 辅助服务（标题生成、inline edit）：使用 `acceptEdits` 模式
  - 主聊天 YOLO 模式：自动降级为 `normal` 模式（使用 safeMode 设置）
  - 避免 Claude CLI 拒绝 `--dangerously-skip-permissions` 参数

### 技术细节

Claude Code CLI 出于安全原因拒绝在 root/sudo 用户下使用 `--dangerously-skip-permissions` 参数。
新增 `isWslUserRoot()` 函数通过 `wsl.exe whoami` 检测当前用户身份，
在 root 用户场景下自动调整权限模式以绕过此限制。

---

## v2.0.10-wsl.1

基于 [YishenTu/claudian](https://github.com/YishenTu/claudian) v2.0.10，合并上游新功能并保留 WSL 支持。

### 上游新功能融入

- **resolveClaudeSettingSources**：支持 user/project/local 设置源配置
- **ACP prompt timeout**：长运行的 prompt RPC 无超时限制
- **cliPathRequiresNode**：CLI 路径 Node.js 处理优化
- **Claude Code cjs wrapper**：支持 CLI cjs wrapper 文件
- **Local Claude settings**：加载本地 Claude settings 配置

### 上游 Bug 修复

- 支持 Claude Code cjs wrapper (#595)
- 加载本地 Claude settings (#594)

### WSL 功能保留

- ✅ Claude WSL：Installation method、distro 检测、路径转换、历史记录、Rewind
- ✅ OpenCode WSL：Installation method、数据库路径计算、sqlite3 历史加载
- ✅ MCP server 路径映射
- ✅ YOLO/bypassPermissions 重启检测

---

## v2.0.8-wsl.1

基于 [YishenTu/claudian](https://github.com/YishenTu/claudian) v2.0.8，新增 OpenCode provider WSL 支持。

### OpenCode WSL 支持

- **新增 OpenCode provider**：上游 v2.0.8 引入的新 AI provider，现已支持 WSL 模式
- **修复 OpenCode WSL 历史记录加载**：
  - JavaScript 字符串转义修正（UNC 路径检测）
  - 通过 `wsl.exe` 执行 sqlite3 读取 WSL 文件系统数据库
  - SQL 引号处理修正（双引号包裹 SQL）
  - WSL 模式下正确生成 UNC 路径存储

### 配置方法

OpenCode WSL 模式：
1. Settings → OpenCode → Installation method 选择 **WSL**
2. CLI path 填 Linux 路径（如 `/usr/local/bin/opencode`）或命令名（`opencode`）
3. WSL home path 填 WSL 用户目录（如 `/home/username`）
4. 确保 WSL 中已安装 OpenCode CLI 和 sqlite3

Claude WSL 模式：
- 若 Windows 用户名与 WSL 用户名不同，需在 Settings → Claude → **WSL home path** 中配置