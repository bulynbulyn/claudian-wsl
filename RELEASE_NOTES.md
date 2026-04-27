## v2.0.4-wsl.2

基于 [YishenTu/claudian](https://github.com/YishenTu/claudian) v2.0.4，修复多个 WSL 模式问题。

### Bug 修复

- **修复历史记录加载失败**：WSL 模式下点击历史对话显示空白内容，Obsidian 重启后历史全部消失。
  - `getVaultPath()` 使用 `getBasePath()` 方法而非 `basePath` 属性
  - 添加 WSL UNC 路径转换支持（`\\wsl$\Ubuntu\...`）
  - 修复 `encodeVaultPathForSDK()` 中 `path.resolve()` 对 Unix 路径的错误处理
  - 新增 `wslHomePath` 设置项用于指定 WSL 用户目录

- **修复 rewind 功能**：WSL 模式下 rewind 无法正常工作。
  - 通过 `WSLENV` 传递 `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING` 启用文件 checkpointing
  - SDK 返回的 WSL 路径转换为 Windows 路径供 fs 操作

- **修复 CLI 参数处理和 bash 特殊字符转义**：WSL 模式下含特殊字符的参数导致执行失败。
  - 合并 SDK CLI 参数与 WSL wrapper 参数
  - 对 bash 特殊字符（括号等）进行转义
  - MCP server 路径映射（Windows → WSL）

### 配置方法

WSL 模式下若 Windows 用户名与 WSL 用户名不同，需在 Settings → Claude → **WSL home path** 中配置（如 `/home/username`）。