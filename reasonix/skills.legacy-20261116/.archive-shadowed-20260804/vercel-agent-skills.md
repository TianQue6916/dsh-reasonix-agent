---
name: vercel-agent-skills
description: Vercel 官方技能 — React/Next.js 最佳实践 + Vercel 部署 + 设计指南 + 合成模式
---
# Vercel 官方 Agent 技能集

来自 vercel-labs/agent-skills（25K⭐）的技能。Vercel 官方的 React/Next.js 最佳实践和部署流程。

## 包含的子技能

### 1. react-best-practices — React 最佳实践

React 和 Next.js 应用的编码和优化指南。

**性能优化**:
- 使用 `React.memo` 避免不必要的重渲染（只在 props 真正变化时）
- 使用 `useMemo`/`useCallback` 缓存计算密集型操作和回调引用
- 大型列表使用虚拟化（`react-window`/`react-virtuoso`）
- 图片使用 `next/image` 自动优化
- 字体使用 `next/font` 消除 CLS

**状态管理**:
- 服务器状态用 React Query / SWR（缓存/重新验证/乐观更新）
- 客户端状态用 Zustand / Jotai（轻量、无 boilerplate）
- URL 状态用 `useSearchParams` / `useParams`
- 避免 prop drilling，优先组合而非多层传递

**代码组织**:
- 按功能/路由组织文件（colocation）
- Server Components 作为默认选择，只在需要交互时用 Client Components
- `'use client'` 边界尽可能靠近叶子组件
- API 路由用 Route Handlers（App Router）或 API Routes（Pages Router）

**可访问性**:
- 语义 HTML：`<nav>`, `<main>`, `<section>`, `<article>`
- 表单用 `<label>` 关联，或用 `aria-label`
- 动态内容更新用 `aria-live` 区域
- 键盘导航支持（`tabIndex`, `onKeyDown`）

**安全**:
- 用户内容渲染前消毒（`DOMPurify`）
- API 路由验证输入（Zod）
- 敏感操作验证 CSRF token
- 密钥和 token 用环境变量，不从客户端引用 `process.env.*`

### 2. deploy-to-vercel — Vercel 部署

将应用部署到 Vercel。**默认预览部署**，除非用户明确要求生产环境。

**检查项目状态**:
```bash
# 检查 git remote
git remote get-url origin 2>/dev/null
# 检查是否已链接到 Vercel 项目
cat .vercel/project.json 2>/dev/null
# 检查 CLI 是否已登录
vercel whoami 2>/dev/null
```

**部署方式**（按优先级）:
1. **已链接 + 有 git** → `git add . && git commit -m "deploy: ..." && git push`
2. **已链接 + 无 git** → `vercel deploy -y --no-wait`
3. **未链接 + 有 CLI** → `vercel link --repo` 然后部署
4. **无 CLI** → 安装 Vercel CLI 并登录

**输出**: 总是显示 Preview URL 给用户

### 3. composition-patterns — React 合成模式

React 组件组合的最佳模式。

| 模式 | 何时使用 | 关键原则 |
|------|---------|---------|
| 插槽模式 (Slots) | 布局组件（侧边栏/头部/底部） | 通过 props 传入 ReactNode，而非在组件内部硬编码子组件 |
| 渲染属性 (Render Props) | 数据获取、关注点分离 | 让父组件控制渲染逻辑 |
| 高阶组件 (HOC) | 鉴权守卫、布局包裹 | `withAuth(Component)` 模式 |
| 自定义 Hooks | 可复用的状态逻辑 | `useData()` 封装数据获取逻辑 |

**关键原则**：
- 组合优于继承 — 通过 props 组合组件而非继承
- 单一职责 — 每个组件做一件事
- 提升状态 — 共享状态提升到最近的公共祖先
- 状态 colocation — 状态放在使用它的组件附近

### 4. web-design-guidelines — Web 设计指南

Web 应用的设计和 UI 审核指南。

**布局原则**:
- 一致的对齐和间距（8pt 网格系统）
- 清晰的视觉层次（标题/副标题/正文）
- 充分的留白（呼吸空间）
- 响应式断点：移动端 375px、平板 768px、桌面 1280px+

**色彩**:
- 主色 + 辅色 + 中性色，不超过 3 种主色
- 足够的对比度（WCAG AA：文本 4.5:1，大文本 3:1）
- 不要只用颜色传递信息（配合图标/文字）
- 亮色/暗色模式支持

**排版**:
- 字体比例：16px 正文，递进的标题尺寸
- 行高：正文 1.5-1.6，标题 1.2-1.3
- 每行 ≤ 75 字符（最佳可读性）
- 中文和英文混合时的字间距

**交互**:
- 按钮和链接有 hover/focus/active 状态
- 加载状态（骨架屏/spinner）
- 空状态和错误状态的展示
- 过渡动画（300ms ease）

### 5. react-view-transitions — React 视图过渡

页面导航和视图切换的动画模式。
- 使用 CSS View Transitions API
- 列表项进出动画
- 页面切换过渡
- 共享元素过渡

### 6. react-native-skills — React Native

React Native 移动端开发指南。
- 组件选择和平台适配
- 导航和路由
- 状态管理
- 性能优化

## Vercel CLI Token 使用

当需要自动化部署时，使用 `VERCEL_TOKEN` 环境变量（Vercel 访问令牌）：
- 从环境变量或 `.env` 读取 `VERCEL_TOKEN`
- 导出为环境变量：`export VERCEL_TOKEN="vca_..."`
- **永远不要**通过 `--token` 参数传递 token（会暴露在 shell 历史中）
- CLI 自动读取 `VERCEL_TOKEN` 环境变量

## 触发条件

| 触发词 | 技能 |
|--------|------|
| React 最佳实践 / 性能优化 / 代码组织 | `react-best-practices` |
| 部署 / deploy / 上线 | `deploy-to-vercel` |
| 组件设计 / 合成 / 组合模式 | `composition-patterns` |
| UI 设计 / 视觉审核 / 设计指南 | `web-design-guidelines` |
| 页面过渡 / 路由动画 / 视图切换 | `react-view-transitions` |
| React Native / 移动端 | `react-native-skills` |
