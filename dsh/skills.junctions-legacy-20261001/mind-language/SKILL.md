---
name: mind-language
description: Mind 语言编写规范——天阙轩发明的结构化伪代码，混合自然语言+C/Python 风格，函数必须带 = "..." 文档串和参数注释
---

# Mind Language（思维语言）— 结构化伪代码编写规范

Mind 是天阙轩发明的纯描述性语言，混合自然语言（中文/英文）、C 风格和 Python 风格语法。`.mind` 文件不运行、不编译，专注于算法思想的清晰表达。

## 语法要素

### 控制流
```
if 条件
  操作
else
  操作

while 条件
  操作

for each 元素 in 集合
  操作

for i from 0 to n-1
  操作
```

### 函数定义
```
def 函数名(参数列表) = "一句话描述函数做什么"
  # 参数：param1 — 类型，含义
  #       param2 — 类型，含义
  # 返回：类型 — 含义
  # 核心变量：var1 — 含义
  #           var2 — 含义
  ...
  return 结果
```

**铁律：每个 `def` 后面必须跟 `= "..."` 写函数作用**，紧跟的参数注释块用 `#` 标注参数类型与含义、返回值、核心变量。不可省略。

### 赋值与运算
```
x = 初始值            # 赋值用 =
append item to list   # 向集合添加元素
remove x from set     # 从集合移除元素
candidate = min(a, b)
result = max(x, y)
n = |Adj|              # 取集合大小用 |·|
```

### 注释
```
# 这是注释
# ---- 分段标题 ----
# ============================================================
# 大段标题
# ============================================================
```

### 数据结构
```
empty dict / empty list / array of n zeros / array of n INF values
Q = set of all vertex indices 0 .. n-1
u = any element in Q
```

### 数学符号
```
∞ / min / max / ∑ / √ / ≤ / ≥ / ≠ / →
← / ∈ / ∉ / ∅ / ∩ / ∪
```

## 风格约束

1. **不写可执行代码**：mind 是伪代码，不写 `import`、不写语言特定的库调用。`lambda` 等具体语言构造应改为自然语言描述（如"对每条边取 w_w[(u,v)]"）。
2. **中文为主 + English term 行内嵌入**：描述用中文，术语首次出现用 `English term（中文翻译）` 格式。如 `adjacency list（邻接表）`。
3. **缩进表示块结构**：不用 `{}` 或 `begin/end`，纯缩进。
4. **赋值一律用 `=`**：不用 `←` `→` `:=` 等符号。
5. **代码主体用英文伪代码**：`empty dict`、`array of n zeros`、`remove u from Q`、`Q is not empty`。中文仅限 `#` 注释行和 `= "..."` 文档串。
6. **取长度用 `|·|`**：写 `|Adj|`，不写 `len(Adj)`。
7. **每个函数必须有 `= "..."` 文档串**，紧跟参数/变量注释块。

## 示例

```mind
def dijkstra_bottleneck(Adj, w, s) = "求从源点 s 到各顶点的最大瓶颈路径值"
  # 参数：Adj — 邻接表，每个元素是邻居顶点列表
  #       w   — 边权函数，w(u,v) 返回边 (u,v) 的权重
  #       s   — 源点索引
  # 返回：长度为 |V| 的数组，b[v] = s 到 v 的最大瓶颈值
  # 核心变量：b — bottleneck estimates（瓶颈估计值），初始 0，源点 ∞
  #           Q — 未处理顶点集合
  n = Adj 的长度
  b = 长度为 n 的数组，全部填 0
  b[s] = ∞
  Q = 包含全部顶点索引 0 .. n-1 的集合

  while Q 非空
    # 从 Q 中选出 b 值最大的顶点
    u = Q 中任意元素
    for each v in Q
      if b[v] > b[u]
        u = v
    从 Q 中移除 u

    for each v in Adj[u]
      candidate = min(b[u], w(u, v))
      if candidate > b[v]
        b[v] = candidate

  return b
```

## 与 bilingual-translator 格式的关系

当 mind 代码嵌入 `.md` 文件时，用 ```` ```mind ```` 代码块包裹。外层 Markdown 遵循 bilingual-translator 格式标准（中文主体 + English term 行内嵌入 + 蓝色标签 + blockquote 虚化）。
