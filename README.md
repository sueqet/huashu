# 话树 HuaShu

以故事模式为核心、可分支的 AI 互动小说应用，面向安卓手机（基于 Tauri 2）。

每条消息作为节点形成可分支的树结构：重新生成就是开出新的分支，随时可以回到任意一段改写剧情。

> 重构进行中：正在从"树状对话管理桌面应用"转向"安卓端故事/角色扮演应用"，功能列表会随重构更新。

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
- **多模态支持** — 支持粘贴/上传图片和纯文本文档（TXT/MD/HTML/CSV/JSON）作为消息附件
- **图片生成（可选）** — 默认关闭，在厂商设置中开启后可用
- **项目隔离** — 项目级工作空间，每个项目独立管理对话
- **全文搜索** — 项目内所有对话节点全文检索，关键词高亮跳转
- **导入导出** — 项目和对话的 ZIP 导入导出，剧本模板导入导出，便于跨机器迁移
- **本地存储** — 所有数据只保存在本机，并关闭了安卓云备份与设备间迁移

## 隐私

- 唯一的联网请求是发往你自己配置的大模型 API（对话上下文按正常方式发送）
- 不做遥测、不云同步、不加载任何在线字体或资源；AI 回复中的外部图片不会被加载
- API 密钥和故事数据不会被安卓系统备份带走；换机请使用应用内导出
- 卸载应用会删除全部数据，请定期导出备份

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
| Token 计算 | 按字符估算（不内置分词词表） |

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

# 单元测试
pnpm test

# 桌面开发预览（仅用于开发调试）
pnpm tauri dev

# 安卓构建（需要 Android SDK / NDK，JDK 17）
pnpm tauri android build --apk --target aarch64
```

### 安卓 APK

推送到 `main` 或 `claude/**` 分支后，GitHub Actions（`.github/workflows/android.yml`）会自动构建 arm64 APK，
在对应运行的 Artifacts 中下载。

正式签名需要在仓库 Secrets 中配置 `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、
`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`；未配置时构建 debug APK（签名每次不同，无法覆盖安装）。

本地构建正式签名包：在 `src-tauri/gen/android/keystore.properties` 写入
`storeFile` / `storePassword` / `keyAlias` / `keyPassword`（该文件已被 git 忽略）。

## 项目结构

```
src/
├── components/          # UI 组件
│   ├── ui/              # Shadcn/ui 基础组件
│   ├── layout/          # 布局（侧边栏、主内容区）
│   ├── canvas/          # 画布（节点、对话面板、搜索、编辑工具栏）
│   ├── project/         # 项目管理（列表、详情、故事设定）
│   └── settings/        # 设置页面
├── stores/              # Zustand 状态管理
├── services/            # 业务逻辑服务
│   ├── file-service     # 文件读写（原子写入）
│   ├── ai-service       # AI 流式调用
│   ├── context-service  # 上下文构建（分层滑动窗口）
│   ├── story-service    # 故事模式（选项、章节摘要、剧本模板）
│   ├── search-service   # 全文检索
│   └── export-service   # 导入导出
├── types/               # TypeScript 类型定义
├── hooks/               # 自定义 Hooks
└── lib/                 # 工具函数（树布局算法等）
src-tauri/               # Tauri Rust 后端
└── gen/android/         # 安卓工程（清单、图标、签名配置）
```

## 数据存储

所有数据存储在应用私有数据目录下（安卓上其他应用无法访问）：

```

├── config.json                    # 全局 API 配置
└── projects/
    └── <project_id>/
        ├── meta.json              # 项目元信息
        ├── conversations/
        │   └── <conv_id>.json     # 对话树数据
        └── attachments/           # 消息附件
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
