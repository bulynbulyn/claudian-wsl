# Claudian WSL2 支持开发文档

## 项目概述

### 背景

[Claudian](https://github.com/YishenTu/claudian) 是一个 Obsidian 插件，允许在 Obsidian 中直接使用 Claude Code CLI。原插件只支持本地安装的 Claude Code，无法连接 WSL 中安装的 Claude Code。

### 目标

实现类似 VS Code Remote - WSL 的功能，让 Windows 上的 Obsidian 能够连接 WSL2 中安装的 Claude Code CLI。

### 最终效果

- ✅ WSL2 发行版自动检测
- ✅ Claude CLI 连接测试
- ✅ Windows ↔ WSL 路径自动转换
- ✅ 完整的对话功能
- ✅ 文件操作在 WSL 中执行

---

## 技术原理

### 原有架构分析

Claudian 使用 `@anthropic-ai/claude-agent-sdk` 与 Claude Code CLI 通信：

```
用户发送消息
    ↓
ClaudianService.query()
    ↓
buildPersistentQueryOptions() / buildColdStartQueryOptions()
    ↓
Options: {
  cwd: vaultPath,                        // 工作目录
  pathToClaudeCodeExecutable: cliPath,   // CLI 路径
  spawnClaudeCodeProcess: createCustomSpawnFunction(enhancedPath)
}
    ↓
SDK 调用 spawnClaudeCodeProcess()
    ↓
customSpawn(): spawn(node, [cliPath, ...args], { cwd, env })
```

### 核心问题

| 模块 | 文件 | 问题 |
|------|------|------|
| 进程创建 | `customSpawn.ts` | 使用 `spawn` 直接执行命令，无法调用 WSL |
| CLI 路径 | `claudeCli.ts` | 只识别 Windows 本地路径 |
| 工作目录 | `ClaudianService.ts` | Windows 路径无法在 WSL 中使用 |
| 环境变量 | `env.ts` | 只处理 Windows PATH |

### 解决方案架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Windows 本地机器                              │
│  ┌──────────────┐                                               │
│  │   Obsidian   │                                               │
│  │   (Electron) │                                               │
│  └──────┬───────┘                                               │
│         │ Claudian Plugin                                       │
│         ▼                                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  WSL Settings                            │   │
│  │  - wslEnabled: true                                       │   │
│  │  - wslDistro: Ubuntu                                      │   │
│  │  - wslClaudePath: /home/user/.local/bin/claude           │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │                                                        │
│         │ wsl.exe -d Ubuntu --exec /path/to/claude ...          │
│         ▼                                                        │
└─────────┼────────────────────────────────────────────────────────┤
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WSL2 Linux 环境                                │
│  ┌──────────────┐                                               │
│  │  Claude CLI  │  ← 独立可执行文件，不需要 node                │
│  └──────────────┘                                               │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────┐                                               │
│  │  /mnt/d/...  │  ← Windows 文件通过 /mnt/x/ 访问             │
│  │  (Vault)     │                                               │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 实施步骤

### Phase 1: 创建 WSL 工具模块

**新建文件**: `src/utils/wslPath.ts`

核心功能：
- WSL 发行版检测 (`detectWslDistros`)
- 路径转换 (`windowsToWslPath`, `wslToWindowsPath`)
- CLI 连接测试 (`testWslClaudeCli`)
- WSL URI 解析 (`parseWslUri`)

```typescript
// 发行版信息
export interface WslDistroInfo {
  name: string;        // Ubuntu, Debian, etc.
  isDefault: boolean;  // 是否默认发行版
  version: 1 | 2;      // WSL 版本 (只支持 2)
  state: 'Running' | 'Stopped' | ...;
}

// WSL 配置
export interface WslConfig {
  distro: string;   // 发行版名称
  cliPath: string;  // WSL 内的 CLI 路径
  user?: string;    // 可选用户
}
```

**关键技术点 - UTF-16 编码处理**：

Windows 的 `wsl.exe` 输出通常是 UTF-16 LE 编码，需要正确解码：

```typescript
// 检测 UTF-16 (每隔一个字节是 0x00)
const isUtf16 = stdout.length > 10 && stdout[1] === 0x00 && stdout[3] === 0x00;

if (isUtf16) {
  output = stdout.toString('utf16le');
}
// 移除空字符
output = output.replace(/\x00/g, '');
```

### Phase 2: 修改进程创建逻辑

**修改文件**: `src/core/agent/customSpawn.ts`

添加 `spawnWslProcess` 函数，通过 `wsl.exe` 执行 WSL 中的命令：

```typescript
export function createCustomSpawnFunction(
  enhancedPath: string,
  wslConfig?: WslConfig  // 新增参数
): (options: SpawnOptions) => SpawnedProcess {
  return (options: SpawnOptions) => {
    // WSL 模式
    if (wslConfig) {
      return spawnWslProcess(wslConfig, options);
    }
    // 原有逻辑...
  };
}
```

**关键实现 - WSL 进程启动**：

```typescript
function spawnWslProcess(wslConfig: WslConfig, options: SpawnOptions) {
  // 1. 转换工作目录
  const wslCwd = windowsToWslPath(cwd);  // D:\vault → /mnt/d/vault

  // 2. 构建 wsl.exe 参数
  const wslArgs = [
    '-d', wslConfig.distro,
    '--cd', wslCwd,
    '--exec',                 // 直接执行，不经过 shell
    wslConfig.cliPath,        // /home/user/.local/bin/claude
    ...cliArgs
  ];

  // 3. 启动进程
  return spawn('wsl.exe', wslArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
}
```

**重要发现**：

1. **Claude CLI 是独立可执行文件**，不需要通过 `node` 运行
2. **使用 `--exec` 而非 `--`**：避免 shell 解释特殊字符（如括号）
3. **需要添加 `--output-format stream-json`**：当使用 `--input-format stream-json` 时

### Phase 3: 扩展设置类型

**修改文件**: `src/core/types/settings.ts`

```typescript
export interface ClaudianSettings {
  // ...existing fields

  // WSL 配置 (仅 Windows)
  wslEnabled: boolean;       // 是否启用 WSL 模式
  wslDistro: string;         // 默认发行版名称
  wslClaudePath: string;     // WSL 内的 CLI 路径
}

export const DEFAULT_SETTINGS: ClaudianSettings = {
  // ...
  wslEnabled: false,
  wslDistro: '',
  wslClaudePath: '',
};
```

### Phase 4: 修改 CLI 路径解析

**修改文件**: `src/utils/claudeCli.ts`

支持 `wsl://` URI 格式：

```typescript
export function resolveClaudeCliPathWithWsl(...): CliResolveResult {
  // 检测 wsl:// 前缀
  if (isWslCliPath(trimmedHostname)) {
    const wslConfig = parseWslUri(trimmedHostname);
    // wsl://Ubuntu/home/user/.local/bin/claude
    // → { distro: 'Ubuntu', cliPath: '/home/user/.local/bin/claude' }
    return { path: trimmedHostname, wslConfig };
  }
  // 原有逻辑...
}
```

### Phase 5: 集成到主插件

**修改文件**: `src/main.ts`

```typescript
getResolvedClaudeCliPath(): string | null {
  // WSL 模式：构造 wsl:// URI
  if (this.settings.wslEnabled && this.settings.wslDistro && this.settings.wslClaudePath) {
    return `wsl://${this.settings.wslDistro}${this.settings.wslClaudePath}`;
  }
  return this.cliResolver.resolve(...);
}

getWslConfig(): { distro: string; cliPath: string } | null {
  if (!this.settings.wslEnabled || !this.settings.wslDistro || !this.settings.wslClaudePath) {
    return null;
  }
  return { distro: this.settings.wslDistro, cliPath: this.settings.wslClaudePath };
}
```

### Phase 6: 添加设置 UI

**修改文件**: `src/features/settings/ClaudianSettings.ts`

添加 WSL 设置界面：

```typescript
private renderWslSettings(containerEl: HTMLElement): void {
  // 仅在 Windows 上显示
  if (process.platform !== 'win32') return;

  // WSL 模式开关
  new Setting(containerEl)
    .setName('Enable WSL2 Mode')
    .addToggle(toggle => toggle.setValue(this.plugin.settings.wslEnabled)...);

  // 发行版选择 (自动检测)
  distroSetting.addDropdown(dropdown => {
    const distros = await getWsl2Distros();
    for (const distro of distros) {
      dropdown.addOption(distro.name, distro.name);
    }
  });

  // 手动输入发行版 (备用)
  new Setting(containerEl)
    .setName('Manual Distribution Name')
    .addText(text => text.setValue(this.plugin.settings.wslDistro)...);

  // CLI 路径输入
  new Setting(containerEl)
    .setName('Claude CLI Path (in WSL)')
    .addText(text => text.setValue(this.plugin.settings.wslClaudePath)...);

  // 测试连接按钮
  new Setting(containerEl)
    .setName('Test WSL Connection')
    .addButton(button => button.setButtonText('Test Connection')...);
}
```

---

## 文件修改清单

| 文件 | 修改类型 | 行数 |
|------|----------|------|
| `src/utils/wslPath.ts` | 新增 | +386 |
| `src/core/agent/customSpawn.ts` | 修改 | +155 |
| `src/features/settings/ClaudianSettings.ts` | 修改 | +191 |
| `src/utils/claudeCli.ts` | 修改 | +95 |
| `src/main.ts` | 修改 | +16 |
| `src/core/types/settings.ts` | 修改 | +10 |
| `src/core/agent/QueryOptionsBuilder.ts` | 修改 | +7 |
| `src/core/agent/ClaudianService.ts` | 修改 | +4 |
| `tests/unit/core/types/types.test.ts` | 修改 | +9 |
| **总计** | | **+862, -11** |

---

## 安装和使用

### 前置条件

1. Windows 10/11 with WSL2 installed
2. Claude Code CLI installed in WSL2
3. Obsidian installed on Windows

### 安装步骤

```bash
# 1. 进入项目目录
cd claudian

# 2. 安装依赖
npm install

# 3. 构建
npm run build

# 4. 复制到 Obsidian 插件目录
cp main.js styles.css manifest.json "/path/to/vault/.obsidian/plugins/claudian/"
```

### 配置步骤

1. 打开 Obsidian → 设置 → Claudian
2. 找到 "WSL2 Settings" 部分
3. 启用 "Enable WSL2 Mode"
4. 选择 WSL 发行版 (或手动输入，如 `Ubuntu`)
5. 输入 Claude CLI 路径 (如 `/home/user/.local/bin/claude`)
6. 点击 "Test Connection" 验证

### 查找 Claude CLI 路径

在 WSL 中运行：
```bash
which claude
# 输出: /home/username/.local/bin/claude
```

---

## 故障排除

### 问题 1: 发行版下拉框为空

**原因**: UTF-16 编码未正确处理

**解决方案**: 检查 `wslPath.ts` 中的解码逻辑：
```typescript
const isUtf16 = stdout.length > 10 && stdout[1] === 0x00 && stdout[3] === 0x00;
```

### 问题 2: Process exited with code 2

**原因**:
1. 命令找不到
2. 参数中的特殊字符被 shell 解释

**解决方案**: 使用 `--exec` 替代 `--`：
```typescript
// 错误: wsl -d Ubuntu -- /path/to/claude --disallowedTools Task(statusline-setup)
// 正确: wsl -d Ubuntu --exec /path/to/claude --disallowedTools Task(statusline-setup)
```

### 问题 3: --output-format required

**原因**: 使用 `--input-format stream-json` 时必须同时指定 `--output-format`

**解决方案**:
```typescript
if (hasInputStreamJson && !hasOutputStreamJson) {
  finalCliArgs.push('--output-format', 'stream-json');
}
```

### 问题 4: 环境变量未传递

**原因**: WSL 和 Windows 的环境变量是隔离的

**解决方案**: 使用 `WSLENV` 传递变量：
```typescript
wslEnv.WSLENV = 'ANTHROPIC_API_KEY:ANTHROPIC_BASE_URL:...';
```

---

## 参考资源

- [WSL 互操作文档](https://learn.microsoft.com/en-us/windows/wsl/interop)
- [VS Code Remote - WSL 架构](https://code.visualstudio.com/docs/remote/wsl)
- [Claudian 原项目](https://github.com/YishenTu/claudian)
- [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)

---

## Git 提交记录

```
commit 9122c07
Author: WSL Developer <dev@local.com>
Date:   Sun Mar 29 23:17:11 2026 +0800

feat(wsl): add WSL2 support for Claude CLI

Add support for running Claude CLI inside WSL2 distributions on Windows.
This allows users to connect Obsidian (running on Windows) with Claude Code
installed in WSL2, similar to VS Code's Remote - WSL extension.

Key changes:
- Add wslPath.ts utility for path conversion and WSL detection
- Modify customSpawn.ts to spawn processes via wsl.exe
- Add WSL settings (wslEnabled, wslDistro, wslClaudePath)
- Add WSL configuration UI in settings (Windows only)
- Handle UTF-16 LE encoding for wsl.exe output
- Use --exec flag to bypass shell interpretation

Users can configure WSL mode in settings by:
1. Enabling WSL2 mode
2. Selecting their WSL distribution
3. Entering the Claude CLI path inside WSL

 9 files changed, 862 insertions(+), 11 deletions(-)
 create mode 100644 src/utils/wslPath.ts
```