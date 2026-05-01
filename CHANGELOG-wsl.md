# Claudian v2.0.10-wsl.1

基于原版 [YishenTu/claudian](https://github.com/YishenTu/claudian) v2.0.10 的 WSL 支持二开版本。

## v2.0.10-wsl.1 合并上游 v2.0.10

### 上游新功能融入

- **resolveClaudeSettingSources**：支持 user/project/local 设置源配置
- **ACP prompt timeout**：`ACP_PROMPT_TURN_TIMEOUT_MS=0` 用于长运行的 prompt RPC
- **cliPathRequiresNode**：CLI 路径 Node.js 处理优化
- **Claude Code cjs wrapper**：支持 CLI cjs wrapper 文件
- **Local Claude settings**：加载本地 Claude settings 配置

### WSL 功能保留

- ✅ Claude WSL：Installation method、distro 检测、路径转换、历史记录、Rewind
- ✅ OpenCode WSL：Installation method、数据库路径计算、sqlite3 历史加载
- ✅ MCP server 路径映射
- ✅ YOLO/bypassPermissions 重启检测

---

## v2.0.8-wsl.1 合并上游 v2.0.8

### 新增上游功能

| 功能 | 描述 |
|------|------|
| **OpenCode provider** | 新增 Opencode 作为可选 AI provider |
| **Auto safe mode** | Claude 新增 `auto` 安全模式，支持动态权限审批 |
| **延迟 prompt usage** | 支持 Anthropic 流式事件中的 prompt token 使用统计 |
| **ACP 协议** | Agent Client Protocol 共享传输层 |
| **Bash 命令显示** | 工具调用展开时显示完整 bash 命令 |
| **Codex 自定义模型** | Codex provider 支持自定义模型配置 |
| **Codex GPT-5.5** | Codex 默认模型更新为 GPT-5.5 |

### 上游 Bug 修复

- Claude 上下文使用与所选模型对齐
- Codex/MCP 路径中 tool_result 内容规范化
- Claude SDK bundle 和 effort 类型兼容性修复
- Codex Spark 模型推理摘要禁用

### WSL 功能保留

所有 WSL 特有功能已保留并与新版本兼容：

- ✅ WSL 发行版检测和执行目标解析
- ✅ Windows ↔ WSL 路径转换
- ✅ WSL 进程 spawn 和参数构建
- ✅ WSL 历史记录加载（路径转换 + skipResolve）
- ✅ WSL rewind 支持（WSLENV + 路径映射）
- ✅ WSL 设置 UI（Installation method、distro override、home path）
- ✅ MCP server 路径映射
- ✅ YOLO/bypassPermissions 重启检测

### 冲突解决

| 文件 | 解决策略 |
|------|---------|
| `settings.ts` | 合并 CLAUDE_SAFE_MODES + WSL 配置字段 |
| `runtime/types.ts` | 合并 enableAutoMode + WSL 配置字段 |
| `ClaudeQueryOptionsBuilder.ts` | 合并 enableAutoMode 检查 + WSL 重启检测 |
| `ClaudeDynamicUpdates.ts` | 合并 auto mode 重启 + WSL MCP 路径映射 |
| `ClaudeChatRuntime.ts` | 合并 usageTransformState + WSL rewind |
| `claudeColdStartQuery.ts` | 合并 auto mode extraArgs + WSL launch spec |
| `ClaudeSettingsTab.ts` | 合并 CLAUDE_SAFE_MODES dropdown + WSL UI |
| `transformClaudeMessage.ts` | 合并 usageState + WSL 导入 |

---

## Bug 修复

### v2.0.8-wsl.1 OpenCode WSL 历史记录加载

**问题**：OpenCode WSL 连接下，重新打开 Obsidian 查看对话历史为空白。

**原因**：
1. JavaScript 字符串转义问题：`'\\wsl$'` = `\wsl$`（单反斜杠），但 UNC 路径实际是 `\\wsl$`（双反斜杠），导致 WSL 路径检测失败
2. `node:sqlite` 模块在 Obsidian/Electron 中被 CORS 政策阻止
3. Windows 端 sqlite3 CLI 无法直接读取 WSL 文件系统中的数据库
4. SQL 引号转义问题：使用 `'"'"'` 转义后放在双引号内，单引号被错误处理

**修复**：
- 修正 JavaScript 字符串转义：`'\\wsl$'` → `'\\\\wsl$'`（检测双反斜杠 UNC 路径）
- 正则表达式转义修正：`/^\\wsl\$/` → `/^\\\\wsl\$/`
- 新增 `runSqlite3ViaWsl()` 函数通过 `wsl.exe` 执行 `sqlite3 -json` 命令
- 新增 `convertWslUncToLinux()` 函数转换 UNC 路径到 Linux 路径（`\\wsl$\Ubuntu\path` → `/path`）
- 修正 SQL 引号处理：双引号包裹 SQL，内部单引号无需转义
- 新增 `resolveOpencodeDatabasePathForWsl()` 强制使用 Linux 格式路径计算
- `prepareOpencodeLaunchArtifacts()` 支持 WSL 模式下生成正确 UNC 路径

### v2.0.4-wsl.2 历史记录加载失败

**问题**：WSL 模式下点击历史对话显示空白内容，Obsidian 重启后历史全部消失。

**原因**：
1. `getVaultPath()` 使用 `basePath` 属性而非 `getBasePath()` 方法，Obsidian Desktop 返回 `undefined`
2. `path.resolve('/mnt/d/...')` 在 Windows 上会错误添加驱动器前缀变成 `F:/mnt/d/...`，导致 SDK 项目目录编码错误
3. Windows fs 无法直接读取 `/home/...` 这样的 WSL Unix 路径

**修复**：
- `getVaultPath()` 改用 `getBasePath()` 方法获取 vault 路径
- 新增 `windowsToWslPath()` 将 Windows 路径转换为 WSL 路径（`D:\...` → `/mnt/d/...`）
- 新增 `wslPathToWindowsUNC()` 将 WSL 路径转换为 Windows UNC 路径（`/home/...` → `\\wsl$\Ubuntu\home\...`）
- `encodeVaultPathForSDK()` 新增 `skipResolve` 参数，WSL 模式下跳过 `path.resolve()`
- 新增 `wslHomePath` 设置项，当 Windows 用户名与 WSL 用户名不同时可手动指定

### v2.0.4-wsl.2 WSL 模式下 rewind 功能支持

**问题**：WSL 模式下 rewind 功能无法正常工作。

**修复**：
- 通过 `WSLENV` 环境变量传递 `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING` 启用文件 checkpointing
- SDK 返回的 WSL 路径转换为 Windows 路径供 fs 操作
- 从 settings 获取 WSL 配置（避免 currentConfig 在重启时为 null）

### v2.0.4-wsl.2 CLI 参数处理和 bash 特殊字符转义

**问题**：WSL 模式下 CLI 参数传递不正确，含 bash 特殊字符的参数导致执行失败。

**修复**：
- 修复 WSL 进程 spawn，合并 SDK 构建的 CLI 参数与 WSL wrapper 参数
- 对包含 bash 特殊字符（括号等）的参数进行转义
- MCP server 路径映射：Windows → WSL 路径转换
- 简化 `ClaudeLaunchSpecBuilder` 仅构建 WSL wrapper 参数

### v2.0.4-wsl.1 Safe/YOLO 模式切换报错

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