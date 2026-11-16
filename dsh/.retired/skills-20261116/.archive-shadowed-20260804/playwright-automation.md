---
name: playwright-automation
description: Playwright 浏览器自动化 — 自动检测开发服务器、编写并执行自定义 Playwright 脚本、截图、表单测试、响应式
---
# Playwright 浏览器自动化

通用浏览器自动化技能。编写并执行自定义 Playwright 脚本，用于测试、截图、表单填写、响应式设计验证等。

## 前置条件

```bash
npm init -y && npm install playwright
npx playwright install chromium
```

## 触发条件

用户要求：测试网页 / 浏览器自动化 / 截图 / 填表单 / 检查链接 / 响应式测试 / E2E 测试 / 自动化浏览器操作

## 工作流程

### Step 1: 检测开发服务器

对 localhost 测试，先检测运行中的服务器：

```bash
# 检查常见端口
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 2>/dev/null
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000 2>/dev/null
```

- 找到 1 个 → 自动使用
- 找到多个 → 让用户选
- 没找到 → 让用户提供 URL

### Step 2: 编写并执行脚本

```javascript
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';  // 自动检测或用户提供

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 15000 });
    console.log('✅ 页面加载:', await page.title());

    // 截图
    await page.screenshot({ path: '/tmp/screenshot.png', fullPage: true });
    console.log('📸 截图保存到 /tmp/screenshot.png');

  } catch (err) {
    console.error('❌ 错误:', err.message);
  } finally {
    await browser.close();
  }
})();
```

执行：
```bash
node /tmp/playwright-test.js
```

### 常用测试模式

#### 1. 页面截图（多视口）

```javascript
const viewports = [
  { name: 'Desktop', width: 1920, height: 1080 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Mobile', width: 375, height: 667 },
];
for (const vp of viewports) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.goto(TARGET_URL);
  await page.screenshot({ path: `/tmp/${vp.name.toLowerCase()}.png` });
}
```

#### 2. 表单填写测试

```javascript
await page.goto(`${TARGET_URL}/contact`);
await page.fill('input[name="name"]', '测试用户');
await page.fill('input[name="email"]', 'test@example.com');
await page.fill('textarea[name="message"]', '测试消息');
await page.click('button[type="submit"]');
await page.waitForSelector('.success-message');
console.log('✅ 表单提交成功');
```

#### 3. 登录流程测试

```javascript
await page.goto(`${TARGET_URL}/login`);
await page.fill('input[name="email"]', 'user@example.com');
await page.fill('input[name="password"]', 'test123');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard');
console.log('✅ 登录成功');
```

#### 4. 链接检查

```javascript
const links = await page.locator('a[href^="http"]').all();
for (const link of links) {
  const href = await link.getAttribute('href');
  const response = await page.request.head(href);
  console.log(`${response.ok() ? '✅' : '❌'} ${href} → ${response.status()}`);
}
```

#### 5. 响应式测试（完整）

```javascript
const viewports = [
  { name: 'Desktop', w: 1920, h: 1080 },
  { name: 'Laptop', w: 1366, h: 768 },
  { name: 'Tablet', w: 768, h: 1024 },
  { name: 'Mobile', w: 375, h: 667 },
];

const browser = await chromium.launch({ headless: false });
for (const vp of viewports) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `/tmp/${vp.name.toLowerCase()}.png`, fullPage: true });
  await page.close();
  console.log(`✅ ${vp.name} (${vp.w}x${vp.h})`);
}
await browser.close();
```

### 脚本编写规则

- **永远不要**写脚本到技能目录 — 使用 `/tmp/playwright-test-*.js`
- URL 参数化 — 使用变量定义在顶部
- 使用 `headless: false`（默认）以便用户看到操作过程
- 添加详细的 console.log 输出每个步骤
- 截图保存到 `/tmp/`
- 包含 try/catch 错误处理
- 始终在 finally 中关闭 browser

### 内联执行（快速任务）

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  await page.screenshot({ path: '/tmp/quick.png' });
  console.log('done');
  await browser.close();
})();
"
```

## 目录结构

```
/tmp/playwright-test-<desc>.js   # 测试脚本
/tmp/<name>.png                  # 截图输出
```

## 注意事项

- Playwright 需要 Node.js 18+
- 首次使用需要 `npx playwright install chromium`（仅一次）
- 脚本中的参数化 URL 方便用户切换环境
- `slowMo: 100` 可放慢操作以便观察
