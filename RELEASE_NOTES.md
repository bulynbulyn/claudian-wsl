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