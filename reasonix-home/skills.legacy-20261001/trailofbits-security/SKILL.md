---
name: trailofbits-security
description: 安全审计 — CodeQL/Semgrep 静态分析、漏洞检测、智能合约审计
---

# Trail of Bits — 安全审计

基于 CodeQL 和 Semgrep 的代码安全扫描。

## 扫描类型

| 类型 | 工具 | 检测内容 |
|------|------|---------|
| 静态分析 | CodeQL | SQL注入、XSS、路径遍历、命令注入 |
| 模式匹配 | Semgrep | 硬编码密钥、危险函数、不良实践 |
| 依赖检查 | pip-audit / npm audit | CVE 已知漏洞 |
| 密钥扫描 | truffleHog / Gitleaks | 泄露的 API Key/Token |

## CodeQL 快速扫描

```bash
# 安装 CodeQL CLI
gh extension install github/gh-codeql

# 创建数据库
gh codeql database create ./codeql-db --language=javascript

# 运行查询
gh codeql database analyze ./codeql-db --format=sarif-latest --output=results.sarif

# 查看结果
gh codeql database analyze ./codeql-db
```

## Semgrep 规则

```yaml
rules:
  - id: no-hardcoded-secrets
    pattern-either:
      - pattern: 'password = "..."'
      - pattern: 'api_key = "..."'
    message: "发现硬编码密钥"
    languages: [python, javascript, typescript]
    severity: ERROR
```

## 常见漏洞检查清单

- [ ] SQL 注入：使用参数化查询而非拼接
- [ ] XSS：输出编码 / CSP 头
- [ ] 路径遍历：限制输入路径
- [ ] 命令注入：避免 shell=True
- [ ] 硬编码密钥：环境变量替代
- [ ] CSRF：Token 验证
- [ ] 认证绕过：JWT 签名验证
