---
name: frontend-design
description: 产品级 UI 设计规范 — React + Tailwind CSS，含组件库、布局系统、无障碍标准
---

# Frontend Design — 产品级 UI 规范

基于 React + Tailwind CSS 的前端 UI 设计系统。

## 核心原则

- **移动优先**：先写移动端布局，再用 `md:`/`lg:` 断点扩展
- **无障碍 (A11y)**：语义化 HTML、ARIA 标签、键盘导航、色彩对比度 ≥ 4.5:1
- **性能**：减少重排重绘，使用 CSS Grid/Flexbox，避免深层嵌套
- **一致性**：设计 Token（颜色、间距、圆角、阴影）通过 Tailwind 配置统一

## 设计 Token

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: { 50: '#eff6ff', 500: '#3b82f6', 900: '#1e3a5f' },
        surface: { DEFAULT: '#ffffff', muted: '#f8fafc', border: '#e2e8f0' }
      },
      spacing: { 18: '4.5rem', 88: '22rem' },
      borderRadius: { 'xl': '0.75rem', '2xl': '1rem' }
    }
  }
}
```

## 常用组件模式

### 响应式网格
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
```

### 模态框
```tsx
<dialog className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
  <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl" role="dialog" aria-modal="true">
    {children}
  </div>
</dialog>
```

## 页面布局模板

- **Dashboard**：侧边栏 + 顶部导航 + 内容区
- **Landing Page**：Hero → Features → Pricing → CTA → Footer
- **表单页**：分步表单 / 单页长表单 / 侧边面板
- **数据表格**：搜索 → 筛选 → 表格 → 分页
