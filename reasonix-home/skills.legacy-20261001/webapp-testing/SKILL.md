---
name: webapp-testing
description: Playwright 自动化测试 — 端到端测试、截图对比、表单交互、响应式测试
---

# Webapp Testing — Playwright 自动化测试

基于 Playwright 的 Web 应用端到端测试。

## 安装

```bash
npm init playwright@latest
# 或
pip install pytest-playwright
playwright install
```

## 测试模式

| 模式 | 用途 |
|------|------|
| 功能测试 | 用户操作流程验证 |
| 截图对比 | 视觉回归检测 |
| 响应式测试 | 多尺寸截图 |
| 表单测试 | 输入/提交/验证 |
| API Mock | 接口模拟 |
| 性能 | Lighthouse 指标 |

## 示例

### 基础 E2E
```javascript
const { test, expect } = require('@playwright/test');
test('用户登录流程', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#email', 'user@example.com');
  await page.fill('#password', 'password123');
  await page.click('button[type="submit"]');
  await expect(page.locator('.welcome')).toBeVisible();
});
```

### 截图对比
```javascript
test('首页视觉回归', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('homepage.png');
});
```

### 响应式测试
```javascript
const devices = ['iPhone 13', 'iPad Pro 11', 'Desktop'];
for (const device of devices) {
  test(`页面在 ${device} 上的显示`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: getViewport(device) });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page).toHaveScreenshot(`${device}.png`);
  });
}
```
