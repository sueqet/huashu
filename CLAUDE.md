# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指引。

## 项目概述

**话树**是一款基于树状结构的AI对话管理桌面应用。每条消息作为节点形成可分支的树结构，支持拖拽编辑、跨树移动节点、RAG知识库等功能。

当前处于**预开发阶段**，仅有技术方案文档：`document/AI对话管理桌面应用技术方案.md`。

## 架构

四层层级结构：**应用 > 项目 > 对话 > 节点**，知识库作为项目的附属组件与对话列表平级。

- **应用**：入口，全局设置（API密钥、模型配置）
- **项目**：独立工作空间，包含对话列表和一个知识库；项目描述作为系统提示词前缀
- **对话**：节点树，以 `{nodeId: Node}` 字典存储，支持多根节点 `rootNodeIds[]`
- **节点**：单条消息（user/assistant），双向连接（`parentId` + `childrenIds[]`），含 `conversationId` 标识所属对话

### 核心模块

1. **画布渲染**（React Flow）—— 浏览模式（查看/聊天/分支折叠）与编辑模式（拖拽重组/快照栈撤销重做）
2. **上下文构建** —— 向上追溯父节点；分层滑动窗口（支持节点锁定 `isPinned`）；拼接项目描述 + RAG结果
3. **AI调用** —— 多厂商API、流式响应、中断生成、重新生成、错误处理
4. **数据持久化** —— JSON文件按项目组织，自动保存，原子写入（写临时文件+rename），崩溃恢复
5. **RAG管线** —— 文档解析 → 切分 → Embedding → HNSW向量索引 → Top-K余弦相似度检索
6. **节点搜索** —— 项目内全文检索，结果定位跳转

### AI回复生成数据流

```
当前节点 → 追溯父节点到根 → 拼接项目描述 →
（若启用RAG）向量化查询 → 检索Top-K片段 → 拼接到上下文 →
分层滑动窗口检查token上限 → 调用AI模型 → 保存回复为子节点
```

## 技术栈

| 领域 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.0 + React + TypeScript |
| 状态管理 | Zustand + Immer |
| 画布渲染 | React Flow |
| UI组件 | Shadcn/ui + Tailwind CSS |
| 数据存储 | tauri-plugin-store + JSON文件，向量用二进制 |
| 加密存储 | tauri-plugin-stronghold |
| 向量检索 | hnswlib-node |
| 文档解析 | pdf-parse、mammoth、cheerio |
| 文本切分 | langchain-text-splitter |
| Token计算 | js-tiktoken |

## 本地存储结构

```
应用数据目录/
├── config.json                    # 全局API设置（含schemaVersion）
└── projects/
    └── <project_id>/
        ├── meta.json              # 项目元信息（含schemaVersion、ragEnabled）
        ├── knowledge_base/
        │   ├── meta.json          # 知识库元信息（含embeddingModel、embeddingDimension）
        │   ├── documents/         # 原始上传文档
        │   ├── chunks.json        # 文本片段
        │   └── vectors.bin        # HNSW向量索引
        └── conversations/
            └── <conv_id>.json     # 完整对话树（含schemaVersion）
```

## 关键设计决策

- **数据版本化**：所有持久化JSON文件含 `schemaVersion` 字段，启动时检测并自动迁移
- **双向节点连接**：`parentId` + `childrenIds[]`，移动/复制/删除时必须保持一致性（原子操作）
- **分支隔离**：上下文只沿当前分支向上追溯，兄弟分支不泄漏
- **分层滑动窗口**：超限时按优先级裁剪——中间对话最先裁剪，首轮对话尽量保留，锁定节点和最近N轮始终保留
- **节点锁定**：`isPinned` 字段，锁定的节点不被滑动窗口移除
- **Token运行时计算**：不持久化tokenCount，按当前模型用js-tiktoken实时计算
- **RAG纯Top-K策略**：默认不设固定相似度阈值，用户可选择性开启
- **Embedding兼容性检测**：知识库记录embeddingModel和维度，切换模型时检测并提示重建索引
- **自动保存**：对话内容即时保存；编辑模式写入临时文件，崩溃后可恢复
- **原子写入**：写临时文件 → rename替换，防止半写损坏
- **跨树移动警告**：移动节点到其他对话时弹出上下文重算警告
- **以文件系统为准**：项目不冗余存储conversationIds，扫描conversations/目录获取列表

## 可移植性与跨平台规范

开发时必须注意本项目的可移植性，确保应用在不同电脑、不同操作系统间可正常运行。

### 路径处理

- **禁止硬编码绝对路径**：所有文件路径必须通过 Tauri 的 `path` API 动态获取（如 `appDataDir()`、`documentDir()`）
- **路径分隔符**：使用 `path.join()` 或 Tauri 的路径拼接 API，不要手动拼接 `/` 或 `\`
- **应用数据目录**：使用 Tauri 标准的 `appDataDir`（Windows: `%APPDATA%`，macOS: `~/Library/Application Support`，Linux: `~/.local/share`），不要自定义非标准位置

### 数据存储

- **用户数据与应用分离**：所有用户数据（项目、对话、知识库）存储在应用数据目录下，不要存放在应用安装目录中
- **导入导出**：支持项目级别的完整导入导出（包括对话、知识库文档、向量索引），导出为自包含的 ZIP 包，用于跨机器迁移
- **配置迁移**：全局配置（config.json）中不包含机器相关的绝对路径信息，仅存储相对于应用数据目录的相对路径
- **API密钥安全**：API密钥通过 `tauri-plugin-stronghold` 加密存储，导出时不包含密钥信息，导入后需要用户重新配置

### 依赖与兼容性

- **原生依赖**：优先选择纯 JavaScript/WASM 实现的库，避免依赖系统级 C/C++ 编译工具链。如必须使用原生模块（如 `hnswlib-node`），需在 CI 中为各目标平台预编译
- **文件编码**：所有文本文件统一使用 UTF-8 编码，JSON 文件写入时确保 UTF-8 无 BOM
- **换行符**：代码仓库通过 `.gitattributes` 规范换行符，运行时处理文件不依赖特定换行符格式

### 打包与分发

- **Tauri 多平台构建**：利用 Tauri 的跨平台构建能力，CI 中配置 Windows（.msi/.exe）、macOS（.dmg）、Linux（.AppImage/.deb）的自动化构建
- **便携模式**：考虑支持便携模式（portable），将应用数据存储在应用同目录的 `data/` 文件夹下，方便 U 盘携带使用。通过检测应用目录下是否存在 `portable.flag` 文件来切换模式
- **首次启动**：首次启动时自动初始化数据目录结构，不依赖安装脚本创建目录

## 项目日志规范

每次对项目进行修改后，在 `document/项目日志.md` 中追加记录，格式如下：

```markdown
### YYYY-MM-DD 简要标题

- 修改内容1
- 修改内容2
- ...
```

日志按时间倒序排列（最新的在最前面），记录内容包括但不限于：
- 技术方案变更
- 新增/删除/修改的文件
- 架构或设计决策变更
- 重要的bug修复
