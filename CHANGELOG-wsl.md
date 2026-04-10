# Claudian v2.0.2-wsl.1 vs v2.0.2

基于原版 [YishenTu/claudian](https://github.com/YishenTu/claudian) v2.0.2 的 WSL 支持二开版本。

## 新增功能

### WSL 支持

在 Windows 平台上支持通过 WSL 运行 Claude CLI：

- **Installation method 选择**：Settings 中新增安装方式选项（Native Windows / WSL）
- **WSL distro override**：可指定 WSL 发行版，或自动从 `\\wsl$\` 工作区路径推断
- **路径自动转换**：Windows 路径 ↔ WSL Linux 路径自动映射

## 代码改动

### 新增文件

| 文件 | 作用 |
|------|------|
| `ClaudeExecutionTargetResolver.ts` | WSL distro 检测和执行目标解析 |
| `ClaudeLaunchSpecBuilder.ts` | 构建 `wsl.exe` 命令和参数 |
| `ClaudePathMapper.ts` | Windows ↔ WSL 路径转换 |
| `claudeLaunchTypes.ts` | 执行目标、路径映射器、启动规范类型定义 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `ClaudeCliResolver.ts` | WSL 模式跳过 Windows 文件系统验证 |
| `customSpawn.ts` | 新增 WSL 进程 spawn 逻辑 |
| `claudeColdStartQuery.ts` | WSL 模式查询构建 |
| `ClaudeQueryOptionsBuilder.ts` | 配置传递 + 重启检测 |
| `settings.ts` | 新增 `installationMethod`、`wslDistroOverride` 字段 |
| `ClaudeSettingsTab.ts` | WSL 设置 UI |
| `types.ts` | `PersistentQueryConfig` 新增 WSL 字段 |

### Bug 修复

- 修复 `claudeColdStartQuery.ts` 中 `settings.effort` → `settings.effortLevel` 的字段名错误

## 使用方式

1. Windows 上安装 Claudian
2. Settings → Claude → Installation method 选择 **WSL**
3. （可选）设置 WSL distro override
4. CLI path 可填 Linux 路径（如 `/usr/local/bin/claude`）或命令名（`claude`）
5. 确保 WSL 中已安装 Claude CLI 和 Node.js

## 限制

- 仅支持 Windows 平台
- 工作区路径需为 Windows 驱动器路径（如 `D:\vault`）或 `\\wsl$\` UNC 路径
- permission mode 更换需要重启（原版支持动态切换）

## 致谢

- 原版作者：[YishenTu](https://github.com/YishenTu)
- WSL 支持实现参考了 Codex provider 的架构设计