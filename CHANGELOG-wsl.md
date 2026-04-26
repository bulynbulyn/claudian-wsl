# Claudian v2.0.4-wsl.1 vs v2.0.4

基于原版 [YishenTu/claudian](https://github.com/YishenTu/claudian) v2.0.4 的 WSL 支持二开版本。

## Bug 修复

### Safe/YOLO 模式切换报错

**问题**：在 WSL 模式下，首次发消息后从 Safe 切换到 YOLO 时报错：
```
Cannot set permission mode to bypassPermissions because the session was not launched with --permission-mode bypassPermissions
```

**原因**：SDK 的 `setPermissionMode('bypassPermissions')` 要求 Claude CLI 启动时带有 `--permission-mode bypassPermissions` 参数。WSL 模式下该参数在 `wsl.exe` 启动时固定，无法运行时动态切换。

**修复**：
- `needsRestart` 中新增检测：`sdkPermissionMode` 涉及 `bypassPermissions` 的变化需要重启
- `applyClaudeDynamicUpdates` 中跳过对 `bypassPermissions` 的 `setPermissionMode` 调用，让重启来处理

## 原有功能（v2.0.2-wsl.1）

### 新增功能

- **Installation method 选择**：Settings → Claude → Installation method（Native Windows / WSL）
- **WSL distro override**：可指定 WSL 发行版，或自动从 `\\wsl$\` 工作区路径推断
- **路径自动转换**：Windows 路径 ↔ WSL Linux 路径自动映射
- **permission mode 重启检测**：WSL 模式下涉及 bypassPermissions 的权限模式变化需要重启

### 代码改动

#### 新增文件

| 文件 | 行数 | 作用 |
|------|------|------|
| `ClaudeExecutionTargetResolver.ts` | 109 | WSL distro 检测和执行目标解析 |
| `ClaudeLaunchSpecBuilder.ts` | 110 | 构建 `wsl.exe` 命令和参数 |
| `ClaudePathMapper.ts` | 155 | Windows ↔ WSL 路径转换 |
| `claudeLaunchTypes.ts` | 33 | 执行目标、路径映射器、启动规范类型定义 |

#### 修改文件

| 文件 | 改动 |
|------|------|
| `ClaudeCliResolver.ts` | 缓存新增 `installationMethod`；WSL 跳过 Windows 文件系统验证 |
| `customSpawn.ts` | 新增 `spawnWslProcess()` 处理 WSL 进程 spawn |
| `claudeColdStartQuery.ts` | WSL 模式跳过 Node.js 验证；构建 WSL launch spec |
| `ClaudeQueryOptionsBuilder.ts` | 配置传递 + 重启检测（WSL 权限模式/installation method 变化需重启） |
| `ClaudeDynamicUpdates.ts` | 跳过 bypassPermissions 的动态更新，交由重启处理 |
| `settings.ts` | 新增 `installationMethod`、`wslDistroOverride` 字段 |
| `ClaudeSettingsTab.ts` | WSL 设置 UI（Installation method dropdown、WSL distro override input） |
| `types.ts` | `PersistentQueryConfig` 新增 WSL 字段 |

### 使用方式

1. Windows 上安装 Claudian
2. Settings → Claude → Installation method 选择 **WSL**
3. （可选）设置 WSL distro override
4. CLI path 填 Linux 路径（如 `/usr/local/bin/claude`）或命令名（`claude`）
5. 确保 WSL 中已安装 Claude CLI 和 Node.js

### 限制

- 仅支持 Windows 平台
- 工作区路径需为 Windows 驱动器路径（如 `D:\vault`）或 `\\wsl$\` UNC 路径
- permission mode 涉及 YOLO/bypassPermissions 切换时需要重启（原版支持动态切换）

### 致谢

- 原版作者：[Yishen Tu](https://github.com/YishenTu)
- WSL 支持实现参考了 Codex provider 的架构设计