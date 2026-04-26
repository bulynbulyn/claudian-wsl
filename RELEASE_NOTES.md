## v2.0.4-wsl.1

基于 [YishenTu/claudian](https://github.com/YishenTu/claudian) v2.0.4，同步上游更新并修复 WSL 权限模式切换 bug。

### Bug 修复

- **修复 Safe/YOLO 模式切换报错**：WSL 模式下 `setPermissionMode('bypassPermissions')` 要求 Claude CLI 启动时带有 `--permission-mode bypassPermissions` 参数。现在检测到涉及 bypassPermissions 的模式切换时自动触发重启，而非尝试动态更新。

### 新增功能（上游 v2.0.4）

- Installation method 选择（Native Windows / WSL）
- WSL distro 自动检测或手动指定
- Windows ↔ WSL 路径自动转换

### 配置方法

1. Settings → Claude → Installation method 选择 **WSL**
2. CLI path 填 Linux 路径或 `claude`
3. 确保 WSL 中已安装 Claude CLI 和 Node.js

### 限制

- 仅支持 Windows
- 工作区路径需为 Windows 驱动器路径或 `\\wsl$\` UNC 路径
- permission mode 涉及 YOLO/bypassPermissions 切换时需要重启