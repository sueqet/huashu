# 话树 HuaShu

基于树状结构的 AI 对话管理桌面应用。

每条消息作为节点形成可分支的树结构，支持拖拽编辑、跨树移动节点、RAG 知识库等功能。告别线性对话，用树状思维管理你的 AI 对话。

## 功能特性

- **树状对话结构** — 每条消息是一个节点，可随时分支、追问，形成多路径对话
- **可视化画布** — 基于 React Flow 的图形化界面，直观展示对话树全貌
- **编辑模式** — 默认可拖拽节点、子树跟随、拖拽连接、边选择/断开，支持撤销/重做
- **全屏对话模式** — 双击节点进入类 ChatGPT 的全屏聊天界面，分支导航器
- **故事模式** — 带章节管理的互动小说创作，AI 生成故事选项，自动章节切换和摘要
- **多模型 AI 调用** — 支持 OpenAI 兼容接口，流式响应，可中断/重新生成
- **Markdown / LaTeX 渲染** — AI 回复支持完整 Markdown、LaTeX 公式、代码块语法高亮及复制
- **批量操作** — 批量选择节点后可构建新树、复制为新树、AI 总结压缩上下文、批量删除
- **智能上下文管理** — 分层滑动窗口，自动追溯父节点构建上下文，支持节点锁定
- **RAG 知识库** — 上传文档（PDF/DOCX/TXT/MD/HTML），自动切分、向量化、检索增强
- **多模态支持** — 支持粘贴/上传图片和文档作为消息附件
- **项目隔离** — 项目级工作空间，每个项目独立管理对话和知识库
- **全文搜索** — 项目内所有对话节点全文检索，关键词高亮跳转
- **导入导出** — 项目和对话的 ZIP 导入导出，剧本模板导入导出，便于跨机器迁移
- **本地存储** — 所有数据存储在本地，保护隐私

## 截图预览

> 应用启动后即可体验，无需任何在线服务（AI 功能需要配置 API）。

## 技术栈

| 领域 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.0 |
| 前端 | React 19 + TypeScript |
| 状态管理 | Zustand + Immer |
| 画布渲染 | React Flow (xyflow v12) |
| UI 组件 | Shadcn/ui + Tailwind CSS v4 |
| 数据存储 | JSON 文件 (tauri-plugin-fs) |
| 向量检索 | 纯 JS 实现（余弦相似度） |
| 文档解析 | pdf-parse, mammoth, cheerio |
| 文本切分 | @langchain/textsplitters |
| Token 计算 | js-tiktoken |

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 8
- [Rust](https://rustup.rs/) >= 1.70
- [Tauri CLI](https://v2.tauri.app/) (`cargo install tauri-cli --version "^2"`)

### 安装与运行

```bash
# 克隆项目
git clone https://github.com/sueqet/huashu.git
cd huashu

# 安装依赖
pnpm install

# 开发模式启动（首次需编译 Rust，约 3-5 分钟）
pnpm tauri dev

# 构建生产版本
pnpm tauri build
```


### 构建产物

构建完成后，安装包位于：
- NSIS 安装包: `src-tauri/target/release/bundle/nsis/话树_x.x.x_x64-setup.exe`
- 独立 EXE: `src-tauri/target/release/huashu.exe`

## 项目结构

```
src/
├── components/          # UI 组件
│   ├── ui/              # Shadcn/ui 基础组件
│   ├── layout/          # 布局（侧边栏、主内容区）
│   ├── canvas/          # 画布（节点、对话面板、搜索、编辑工具栏）
│   ├── project/         # 项目管理（列表、详情、知识库）
│   └── settings/        # 设置页面
├── stores/              # Zustand 状态管理
├── services/            # 业务逻辑服务
│   ├── file-service     # 文件读写（原子写入）
│   ├── ai-service       # AI 流式调用
│   ├── context-service  # 上下文构建（分层滑动窗口）
│   ├── rag-service      # RAG 完整管线
│   ├── search-service   # 全文检索
│   └── export-service   # 导入导出
├── types/               # TypeScript 类型定义
├── hooks/               # 自定义 Hooks
└── lib/                 # 工具函数（树布局算法等）
src-tauri/               # Tauri Rust 后端
```

## 数据存储

所有数据存储在系统 AppData 目录下：

```
%APPDATA%/com.huashu.desktop/     (Windows)
~/Library/Application Support/com.huashu.desktop/  (macOS)

├── config.json                    # 全局 API 配置
└── projects/
    └── <project_id>/
        ├── meta.json              # 项目元信息
        ├── conversations/
        │   └── <conv_id>.json     # 对话树数据
        └── knowledge_base/
            ├── meta.json          # 知识库元信息
            ├── chunks.json        # 文本片段
            ├── vectors.bin        # 向量索引
            └── documents/         # 原始文档
```

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+F` | 打开搜索 |
| `Ctrl+B` | 切换批量操作模式 |
| `Ctrl+Z` | 撤销 |
| `Ctrl+Y` | 重做 |
| `Delete` | 删除选中节点或断开选中边 |
| `Enter` | 发送消息 |
| `Shift+Enter` | 换行 |
| `Escape` | 退出对话模式 / 退出批量模式 |
| 双击节点 | 进入全屏对话模式 |
| 双击对话名称 | 重命名对话 |

## 架构设计

四层层级结构：**应用 > 项目 > 对话 > 节点**

- **节点**采用双向连接（`parentId` + `childrenIds[]`），移动/复制/删除时保持一致性
- **上下文构建**只沿当前分支向上追溯，兄弟分支互不干扰
- **分层滑动窗口**按优先级裁剪：锁定节点和最近对话始终保留，中间部分按需裁剪
- **原子写入**防止崩溃损坏：先写临时文件，再 rename 替换

## License

MIT
