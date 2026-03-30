# WSL 功能合并指南

当 Claudian 主版本更新时，按以下步骤将 WSL 功能合并到新版本。

## 需要合并的文件

### 新增文件（直接复制）

| 文件 | 说明 |
|------|------|
| `src/utils/wslPath.ts` | WSL 工具函数（完整复制） |

### 需要合并的文件（手动合并）

| 文件 | 合并内容 |
|------|----------|
| `src/core/types/settings.ts` | 添加 `wslEnabled`, `wslDistro`, `wslClaudePath` 字段 |
| `src/main.ts` | 添加 `getWslConfig()` 方法和 `getResolvedClaudeCliPath()` 中的 WSL 逻辑 |
| `src/core/agent/customSpawn.ts` | 添加 `wslConfig` 参数和 `spawnWslProcess()` 函数 |
| `src/core/agent/QueryOptionsBuilder.ts` | 添加 `wslConfig` 到 `QueryOptionsContext` 接口 |
| `src/core/agent/ClaudianService.ts` | 添加 `wslConfig` 到 `buildQueryOptionsContext()` |
| `src/utils/claudeCli.ts` | 添加 `resolveWithWsl()` 方法和 `CliResolveResult` 类型 |
| `src/features/settings/ClaudianSettings.ts` | 添加 `renderWslSettings()` 方法 |

## 合并步骤

### 步骤 1: 准备环境

```bash
# 创建工作目录
mkdir claudian-merge
cd claudian-merge

# 克隆新版本
git clone https://github.com/YishenTu/claudian.git new-version
cd new-version

# 添加旧版本作为远程
git remote add old-version /path/to/your/claudian-for-wsl/claudian
git fetch old-version
```

### 步骤 2: 复制新增文件

```bash
# 复制 wslPath.ts
git checkout old-version/main -- src/utils/wslPath.ts
```

### 步骤 3: 手动合并各文件

#### 3.1 `src/core/types/settings.ts`

在 `ClaudianSettings` 接口中添加：

```typescript
// 在 loadUserClaudeSettings 字段之后添加
wslEnabled: boolean;
wslDistro: string;
wslClaudePath: string;
```

在 `DEFAULT_SETTINGS` 中添加默认值：

```typescript
wslEnabled: false,
wslDistro: '',
wslClaudePath: '',
```

#### 3.2 `src/main.ts`

在 `getResolvedClaudeCliPath()` 方法开头添加：

```typescript
// WSL mode: construct wsl:// URI from settings
if (this.settings.wslEnabled && this.settings.wslDistro && this.settings.wslClaudePath) {
  return `wsl://${this.settings.wslDistro}${this.settings.wslClaudePath}`;
}
```

添加新方法：

```typescript
getWslConfig(): { distro: string; cliPath: string } | null {
  if (!this.settings.wslEnabled || !this.settings.wslDistro || !this.settings.wslClaudePath) {
    return null;
  }
  return {
    distro: this.settings.wslDistro,
    cliPath: this.settings.wslClaudePath,
  };
}
```

#### 3.3 `src/core/agent/customSpawn.ts`

添加导入：

```typescript
import type { WslConfig } from '../../utils/wslPath';
import { windowsToWslPath } from '../../utils/wslPath';
```

修改函数签名：

```typescript
export function createCustomSpawnFunction(
  enhancedPath: string,
  wslConfig?: WslConfig  // 新增参数
): (options: SpawnOptions) => SpawnedProcess {
```

在函数开头添加 WSL 分支：

```typescript
// WSL mode: execute through wsl.exe
if (wslConfig) {
  return spawnWslProcess(wslConfig, options);
}
```

添加 `spawnWslProcess` 函数（完整代码见 `WSL_DEVELOPMENT.md`）

#### 3.4 `src/core/agent/QueryOptionsBuilder.ts`

添加导入：

```typescript
import type { WslConfig } from '../../utils/wslPath';
```

修改 `QueryOptionsContext` 接口：

```typescript
export interface QueryOptionsContext {
  // ...existing fields
  wslConfig?: WslConfig;
}
```

修改 `createCustomSpawnFunction` 调用：

```typescript
options.spawnClaudeCodeProcess = createCustomSpawnFunction(ctx.enhancedPath, ctx.wslConfig);
```

#### 3.5 `src/core/agent/ClaudianService.ts`

在 `buildQueryOptionsContext()` 中添加：

```typescript
const wslConfig = this.plugin.getWslConfig() ?? undefined;

return {
  // ...existing fields
  wslConfig,
};
```

#### 3.6 `src/features/settings/ClaudianSettings.ts`

添加 `renderWslSettings()` 方法（完整代码见源文件）

在 `display()` 方法中调用：

```typescript
// 在 CLI 路径设置之后
this.renderWslSettings(containerEl);
```

### 步骤 4: 更新测试

修改 `tests/unit/core/types/types.test.ts`，在测试对象中添加：

```typescript
wslEnabled: false,
wslDistro: '',
wslClaudePath: '',
```

### 步骤 5: 构建和测试

```bash
npm install
npm run typecheck
npm run build

# 手动测试 WSL 功能
```

## 快速合并脚本

```bash
#!/bin/bash
# merge-wsl.sh - 快速合并 WSL 功能到新版本

OLD_REPO="/path/to/claudian-for-wsl/claudian"
NEW_REPO="/path/to/new-claudian"

# 1. 复制新增文件
cp "$OLD_REPO/src/utils/wslPath.ts" "$NEW_REPO/src/utils/"

# 2. 显示需要手动合并的文件
echo "需要手动合并以下文件："
echo "  - src/core/types/settings.ts"
echo "  - src/main.ts"
echo "  - src/core/agent/customSpawn.ts"
echo "  - src/core/agent/QueryOptionsBuilder.ts"
echo "  - src/core/agent/ClaudianService.ts"
echo "  - src/utils/claudeCli.ts"
echo "  - src/features/settings/ClaudianSettings.ts"
echo ""
echo "请参考 WSL_DEVELOPMENT.md 中的详细说明进行合并。"
```

## 版本兼容性检查

合并前检查以下内容：

- [ ] `@anthropic-ai/claude-agent-sdk` 版本是否兼容
- [ ] `SpawnOptions` 接口是否有变化
- [ ] 设置存储格式是否有变化
- [ ] UI 组件 API 是否有变化

## 维护 Fork

如果频繁需要 WSL 功能，建议维护一个 Fork：

```bash
# 1. Fork Claudian 到你的 GitHub

# 2. 设置上游仓库
git remote add upstream https://github.com/YishenTu/claudian.git

# 3. 定期同步上游更新
git fetch upstream
git merge upstream/main

# 4. 解决冲突并推送
git push origin main
```

这样你的 Fork 始终包含最新的 WSL 功能。