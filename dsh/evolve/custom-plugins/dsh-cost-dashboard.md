# 自定义插件草稿: dsh-cost-dashboard

## 用途
聚合~/.dsh/sessions记录，按日/月统计pro/flash调用次数与估算费用并输出面板，服务成本敏感与月均消费统计习惯

## 挂载点/服务
service（解析 session.jsonl.zstd 聚合）或命令插件

## 实现要点
（由 dsh-gate 实现：创建 cordis 插件包 → dsh plugin add）
