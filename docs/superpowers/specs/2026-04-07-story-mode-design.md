# 故事模式（Story Mode）设计规格

## 概述

为话树添加「故事模式」——一种新的项目类型，利用现有对话树结构实现互动叙事/角色扮演体验。项目 = 一本书/故事，对话 = 章节，分支 = 不同选择。

### 范围

本次实现：
- 核心故事体验（故事项目创建、剧本配置、故事交互UI、自动章节管理）
- 剧本导入/导出
- Agent 模式类型预留（不实现）

不在范围内：
- 故事市场（需要后端服务，未来考虑）
- Agent 模式实现

### 约束

- 不影响现有对话模式（chat）的任何行为
- 复用现有架构，最小改动方案

---

## 1. 数据模型

### 1.1 Project 扩展

在现有 `Project` 类型上增加 `mode` 和 `storyConfig` 字段：

```typescript
interface Project {
  // 现有字段全部保留
  id: string;
  name: string;
  description: string;
  schemaVersion: number;
  conversationOrder: string[];
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
  ragEnabled: boolean;

  // 新增
  mode: 'chat' | 'story' | 'agent';  // 默认 'chat'，agent 预留
  storyConfig?: StoryConfig;          // 仅 mode='story' 时存在
  agentConfig?: AgentConfig;          // 预留，未来实现
}
```

### 1.2 StoryConfig

```typescript
interface StoryConfig {
  worldSetting: string;               // 世界观设定（模板固定内容）
  rules: string;                      // 故事规则/玩法说明
  characters: StoryCharacter[];       // 角色列表（初始 + 可新增）
  openingMessage: string;             // 开场白（第一条 AI 消息）
  templateMeta?: TemplateMeta;        // 模板来源信息（从模板导入时存在）
  chapterSummaries: ChapterSummary[]; // 章节摘要（系统自动生成）
}

interface StoryCharacter {
  name: string;
  description: string;
  isOriginal: boolean;  // true = 模板自带, false = 玩家新增
}

interface ChapterSummary {
  conversationId: string;
  chapterNumber: number;
  summary: string;       // AI 生成的章节摘要
  createdAt: number;
}

interface TemplateMeta {
  name: string;
  author: string;
  version: string;
  description: string;  // 模板简介（区别于世界观设定）
}
```

### 1.3 Agent 模式预留类型

```typescript
interface AgentConfig {
  tools: AgentTool[];
  systemPrompt: string;
  maxIterations: number;
}

interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
```

这些类型仅做定义，不实现对应功能。

### 1.4 向后兼容

- 现有项目没有 `mode` 字段 → 视为 `mode: 'chat'`
- Migration 逻辑：读取项目时，若 `mode` 不存在则默认设为 `'chat'`
- `storyConfig` 为可选字段，不影响现有项目

---

## 2. 系统提示词拼装

故事模式的 system prompt 由 `context-service.ts` 根据 `storyConfig` 自动拼装：

```
[世界观设定]
{worldSetting}

[故事规则]
{rules}

[角色列表]
{characters.map(c => `- ${c.name}: ${c.description}`).join('\n')}

[前情提要]  （仅在有历史章节时出现）
{recentSummaries}

[指令]
请在每段叙述末尾提供2-4个选项供玩家选择，格式为：
[选项1] xxx
[选项2] xxx
玩家也可以自由输入自定义行动。
```

### 前情提要的分层策略

| 条件 | 策略 |
|------|------|
| 章节数 ≤ 5 | 所有摘要直接放入 system prompt |
| 章节数 > 5 | 最近 2 章摘要放入 system prompt + 早期摘要写入 RAG 知识库，每次对话前自动检索 top-3 相关历史片段 |

- 故事模式项目自动启用 RAG
- RAG 检索 query = 当前对话最近几轮内容
- 复用现有 RAG 基础设施（embedding-service、vector-store）

---

## 3. 章节自动管理

### 3.1 触发机制

每次 AI 回复完成后，检查当前对话链的 token 总量：

1. 调用 `token-service` 计算对话链总 token 数
2. 阈值 = 模型 maxContext 的 **50%**
3. 超过阈值时，自动触发章节切换

### 3.2 章节切换流程

```
1. AI 回复完成 → token 检查超过阈值
2. 独立 AI 调用：生成当前章节摘要
3. 摘要写入 storyConfig.chapterSummaries
4. 若章节数 > 5，将早期摘要写入 RAG 知识库
5. 自动创建新对话（章节 N+1），命名为「第N章」
6. 新对话 system prompt = 世界观 + 规则 + 角色 + 相关摘要
7. 新对话第一条消息 (assistant) = 基于摘要 + 上一章最后几轮对话生成的衔接叙述
8. UI 平滑切换到新章节
```

### 3.3 章节命名

- 自动命名：`第1章`、`第2章`...
- 用户可手动重命名

### 3.4 摘要存储位置

- 章节摘要存在 project 级别的 `storyConfig.chapterSummaries` 中
- 所有章节都能访问完整历史
- 摘要生成用独立 AI 调用，不影响故事对话流

---

## 4. UI 交互

### 4.1 项目创建

在 ProjectList 的创建流程中增加项目类型选择：

1. 点击"新建项目"
2. 选择 **对话模式** 或 **故事模式**
3. 对话模式 → 现有流程不变
4. 故事模式 → 输入项目名称后进入 StorySetupPanel

### 4.2 StorySetupPanel（故事设定面板）

替代故事项目 ProjectDetail 中的描述区域，包含：

- **世界观设定** — 多行文本框，描述故事的世界背景
- **故事规则** — 多行文本框，说明玩法和叙事规则
- **角色管理** — 可增删的角色卡片列表（姓名 + 描述），标识模板原始 vs 玩家新增
- **开场白** — 文本框，设定 AI 的第一条消息
- **导入剧本** 按钮 — 从 JSON 文件导入剧本模板

### 4.3 ChatView 故事模式增强

当 `project.mode === 'story'` 时，ChatView 额外行为：

- **选项按钮**：解析 AI 回复末尾的 `[选项N] xxx` 格式，渲染为可点击按钮
- **按钮交互**：点击选项按钮 → 自动发送该选项文本作为用户消息
- **自由输入**：输入框保留，允许用户自由描述行动
- **章节指示器**：顶部显示当前章节号（如「第3章」）
- **章节过渡**：切换章节时显示过渡提示

### 4.4 CanvasView 故事模式

与对话模式基本一致：
- 对话树节点正常显示，用户可查看故事的完整分支结构
- 双击节点进入 ChatView（故事模式增强版）

### 4.5 开场流程

用户创建故事项目并配置完成后：
1. 自动创建第一个对话「第1章」
2. 第一条消息为 `storyConfig.openingMessage`（role: assistant）
3. 用户可直接开始选择/输入

---

## 5. 导出/导入

### 5.1 导出选项

故事模式项目的导出菜单提供两个选项：

| 选项 | 内容 |
|------|------|
| 导出完整存档 | 项目元数据 + storyConfig（含摘要）+ 所有对话 + 知识库 |
| 导出剧本模板 | 仅 storyConfig 中的模板部分（worldSetting, rules, characters, openingMessage, templateMeta），不含对话、摘要 |

### 5.2 剧本模板格式

导出为 `.huashu-story` 文件（实际为 JSON）：

```json
{
  "format": "huashu-story-template",
  "version": "1.0",
  "templateMeta": {
    "name": "...",
    "author": "...",
    "version": "1.0",
    "description": "..."
  },
  "worldSetting": "...",
  "rules": "...",
  "characters": [...],
  "openingMessage": "..."
}
```

### 5.3 导入流程

1. 在 StorySetupPanel 点击「导入剧本」
2. 选择 `.huashu-story` 文件
3. 自动填充 worldSetting、rules、characters、openingMessage
4. `templateMeta` 记录来源信息
5. 用户可预览并修改后开始游戏

---

## 6. 新增/修改文件清单

### 新增文件

| 文件 | 用途 |
|------|------|
| `src/types/story.ts` | StoryConfig, StoryCharacter, ChapterSummary, TemplateMeta, AgentConfig, AgentTool 类型定义 |
| `src/services/story-service.ts` | 章节管理（摘要生成、章节切换、选项解析、system prompt 拼装、剧本导入/导出） |
| `src/components/project/StorySetupPanel.tsx` | 故事设定面板（世界观/角色/规则/开场白/导入） |
| `src/components/canvas/StoryChoices.tsx` | 选项按钮组件（解析并渲染 AI 回复中的选项） |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/types/project.ts` | Project 增加 `mode`, `storyConfig`, `agentConfig` 字段 |
| `src/stores/project-store.ts` | 创建项目时支持 mode 和 storyConfig 参数 |
| `src/services/project-service.ts` | createProject 支持 mode, 读取时 mode 默认值迁移 |
| `src/services/context-service.ts` | buildContext 识别 storyConfig，拼装故事系统提示词 |
| `src/services/export-service.ts` | 增加剧本模板导出/导入功能 |
| `src/components/project/ProjectList.tsx` | 创建项目时增加类型选择（对话/故事） |
| `src/components/project/ProjectDetail.tsx` | 故事项目显示 StorySetupPanel 替代描述编辑 |
| `src/components/canvas/ChatView.tsx` | 故事模式下显示选项按钮、章节指示器、章节过渡 |
| `src/components/canvas/ChatPanel.tsx` | 故事模式下 AI 回复后触发 token 检查和章节切换 |

---

## 7. 架构预留（Agent 模式）

为未来 Agent 模式扩展做以下架构准备：

- `project.mode` 使用 `'chat' | 'story' | 'agent'` 联合类型
- ChatView 模式分支使用 `switch(mode)` 而非 `if/else`
- story-service 的章节管理逻辑设计为可复用（agent 长对话也可能需要）
- 导出/导入按 mode 分发

未来加入 Agent 模式时需要：
1. 定义 `AgentConfig` 具体字段
2. 实现 `agent-service.ts`
3. ChatView 增加 agent 模式 UI 分支
4. 创建流程增加 Agent 选项
