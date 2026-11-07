import json, io

BASE_DL = "C:/Users/27063/Desktop/课程文件/data lerning"
BASE_PG = "C:/Users/27063/.reasonix/global-workspace/pages"

ml = {
 "subject": "ml-foundations",
 "generated_at": "2026-11-07T20:30:00+08:00",
 "sources": [
   BASE_DL + "/18.065_PS_I.1_Lecture1_双语详解.md",
   BASE_DL + "/18.065_PS_I.2_Lecture2_双语详解.md",
   BASE_DL + "/18.065_PS_I.5_Lecture3_双语详解.md",
   BASE_DL + "/18.065_PS_I.6_Lecture4_双语详解.md",
   BASE_DL + "/18.065_PS_I.7_Lecture5_双语详解.md",
   BASE_DL + "/18.065_PS_I.8_Lecture6_双语详解.md",
   BASE_DL + "/Strang_LaLFD_part001_p001-050.bilingual.md",
   BASE_DL + "/Strang_LaLFD_part005_p201-250.bilingual.md",
   BASE_PG + "/DS_线性代数.md",
   BASE_PG + "/DS_万亿参数模型盘点.md",
   BASE_PG + "/DS_V4前API模型回顾.md",
   BASE_PG + "/DS_V4.1开源时间.md",
   BASE_PG + "/DS_十年后最好专业.md",
   BASE_PG + "/DS_Lean4验证非绝对正确.md"
 ],
 "insights": [
  {"type": "层次",
   "content": "18.065 推进到 Lecture 6：2026-09-20→09-23 四天内产出 PS I.1/I.2/I.5/I.6/I.7/I.8 六讲双语详解（md+pdf 成对）。入口是 problem set 逐题精读，不是课程视频。",
   "tags": ["ML", "18.065", "lecture-notes"], "importance": 3,
   "evidence": "目录 " + BASE_DL + "：6 份 18.065_PS_I.*_双语详解.md，mtime 2026-09-20 08:44 → 2026-09-22 15:30，各自配同名 .pdf"},
  {"type": "层次",
   "content": "整书译稿停在书页 248（§IV.7 spectral clustering）：LaLFD part001–005 覆盖 p001–250，此后约 6 周无新增文件，目录 mtime 停在 2026-09-23。",
   "tags": ["ML", "18.065", "Strang"], "importance": 3,
   "evidence": "Strang_LaLFD_part005_p201-250.bilingual.md 末页注「Strang LaLFD §IV.7, p.248」；目录 ls -la 最新 mtime = 2026-09-23 21:38（采集日 2026-11-07）"},
  {"type": "已掌握",
   "content": "主线是 matrix methods 而非 neural net：DS_线性代数 session 709 条消息（2026-04-15→11-02）内 SVD 838、特征值 970、投影 488、PCA 208、最小二乘 149 次。",
   "tags": ["ML", "SVD", "PCA"], "importance": 4,
   "evidence": "DS_线性代数.md 头部元信息（709 条 / session ec7336c4）＋全文关键词计数"},
  {"type": "指针",
   "content": "同一 session 里 梯度 27、神经网络 8、反向传播 1、Transformer 0、注意力 0、贝叶斯 0、论文 0 —— deep learning 与统计学习一侧几乎空白，基础投入全押在线性代数。",
   "tags": ["ML", "deep-learning", "指针"], "importance": 5,
   "evidence": "DS_线性代数.md 词频：梯度 27 / 神经网络 8 / 反向传播 1 / Transformer 0 / 注意力 0 / 贝叶斯 0 / 论文 0（对比 SVD 838、特征值 970）"},
  {"type": "提问模式",
   "content": "提问极短、把解释负担推给模型：354 条 user 消息里 308 条不足 60 字，长度中位数 19 字，如「span是什么意思来着」(L63873)、「奇异值是什么」、「i是全1还是对角线？」(L63661)。",
   "tags": ["ML", "提问模式"], "importance": 3,
   "evidence": "DS_线性代数.md L63661 / L63873；user 消息长度分布：中位 19 字，308/354 条 <60 字"},
  {"type": "提问模式",
   "content": "对同一口径连问五轮：pca是什么 → 什么叫每行一个样本每列一个特征 → 「为什么用特征分解，不用svd，这样岂不是只有一部分能pca」(L61990) → 「为什么用右奇异啊，pca」→「那为什么用特征不用样本？」(L62266)。",
   "tags": ["ML", "PCA", "提问模式"], "importance": 4,
   "evidence": "DS_线性代数.md L61990 / L62120 / L62266，为连续 5 条 user 消息"},
  {"type": "提问模式",
   "content": "「没学过物理，解释的详细一点」(L2865)：对 quadratic form 被叫作「能量」的讲法直接要求换掉借来的直觉；18.065 笔记随即把 energy 明确写成纯数学的二次型 x^TSx。",
   "tags": ["ML", "quadratic-form", "第一性原理"], "importance": 4,
   "evidence": "DS_线性代数.md L2865（紧接其前问「什么叫做基于能量的定义？」）；18.065_PS_I.7_Lecture5_双语详解.md 首段把 c^TSc 当纯二次型处理"},
  {"type": "困惑",
   "content": "「这个没看懂，为什么？我总觉得只需要给输入或者输出旋转，而不是一起旋转？」(L53869)——对 A=USigmaV^T 两端各配一组正交基的必要性存疑，卡在「为什么不能只动一端」。",
   "tags": ["ML", "SVD", "困惑"], "importance": 4,
   "evidence": "DS_线性代数.md L53869（上下文为 SVD 的三段几何解读 V^T / Sigma / U）"},
  {"type": "困惑",
   "content": "「没看懂为什么突然可以了」(L58735)——对 rank-one 片在 Frobenius 内积下两两正交、因而贪心能全局最优那一步的 gap 敏感，不接受「显然」。",
   "tags": ["ML", "SVD", "proof"], "importance": 4,
   "evidence": "DS_线性代数.md L58735（上下文为 SVD 秩一片正交性与贪心最优的严格证明）"},
  {"type": "提问模式",
   "content": "追问构造动机而不止验算：「这个令是怎么想到的？」(L65094，PCA 中 Y=U^T(X-mu))、「解释一下正定的定义为什么是这个」(L10702)——要定义背后的设计理由。",
   "tags": ["ML", "PCA", "提问模式"], "importance": 4,
   "evidence": "DS_线性代数.md L65094 / L10702"},
  {"type": "提问模式",
   "content": "要求先查外部资料再下定义：「严谨思考，定义pca白化，查找wiki」(L61717)、「文件中的条件数定义没看懂，你再严谨一点，查询资料进行定义和讲解」(L64195)——不信任单一解释源。",
   "tags": ["ML", "verification", "提问模式"], "importance": 4,
   "evidence": "DS_线性代数.md L61717 / L64195"},
  {"type": "提问模式",
   "content": "质疑译名与定义是否对得上：「伪逆的翻译合理吗？」(L9616)、「这只能说明是某种逆，为什么能说它和伪逆定义一样？」(L10356)。",
   "tags": ["ML", "术语译名", "提问模式"], "importance": 3,
   "evidence": "DS_线性代数.md L9616 / L10356"},
  {"type": "困惑",
   "content": "「呃呃，我学到的是处理大矩阵用的是分块加缓存和向量化来优化，但是这个教授什么意思，随机？」(L16792)——§II.4 Randomized Linear Algebra 与已有的 CSAPP 式 cache 模型正面冲突。",
   "tags": ["ML", "randomized-linear-algebra", "困惑"], "importance": 4,
   "evidence": "DS_线性代数.md L16792"},
  {"type": "待验证",
   "content": "「这样的剥离对于信息来讲是有损还是无损的？」(L64817)——low-rank truncation 的误差口径已见到（Eckart-Young），但「信息」层面是否守恒他没给出自己的判断。",
   "tags": ["ML", "low-rank", "待验证"], "importance": 3,
   "evidence": "DS_线性代数.md L64817；18.065_PS_I.8_Lecture6_双语详解.md 已给出 Eckart-Young 与截断误差陈述"},
  {"type": "层次",
   "content": "跨课程连接是笔记的固定口径：18.065 反复接回 6.042J（等价关系 / relation matrix）、6.006（分治复杂度）、CSAPP ch.2（IEEE754 与 kappa(A^TA)=kappa(A)^2）。",
   "tags": ["ML", "18.065", "跨学科"], "importance": 3,
   "evidence": "18.065_PS_I.5_Lecture3_双语详解.md:373（6.042J 等价关系）；18.065_PS_I.8_Lecture6_双语详解.md（6.006 分治 + CSAPP 条件数平方）"},
  {"type": "层次",
   "content": "以可核验答案为准绳：对照官方 Instructor's Manual 页码，并标出第三方解答 prairie-guy/Linear_Algebra_18.065 第 4 题把 nullity 当 rank、第 9 题写成 m>=3 的错误。",
   "tags": ["ML", "18.065", "verification"], "importance": 3,
   "evidence": "18.065_PS_I.1_Lecture1_双语详解.md 文末来源说明，原文列举上述两处错误"},
  {"type": "待验证",
   "content": "对模型发布信息的判断方式是拿观察对账、不是有框架的评价：「可是v4根本就没有任何仓库在github呀」逼模型改口；能分清 MoE 总参数与激活参数。没有出现对架构或训练范式的独立判断。",
   "tags": ["ML", "LLM", "待验证"], "importance": 3,
   "evidence": "DS_V4.1开源时间.md（16 条消息，2026-09-10）末轮 user 质疑；DS_万亿参数模型盘点.md（2 条消息）user 侧强调 total vs activated params"},
  {"type": "指针",
   "content": "语料中没有「统计学习 vs 推理系统」的取舍表态：统计 36 次、贝叶斯 0 次且多在 least squares 语境；AGI 0 次、论文 0 次。不能替他把这条取舍定下来。",
   "tags": ["ML", "统计学习", "指针"], "importance": 5,
   "evidence": "DS_线性代数.md 词频（统计 36 / 贝叶斯 0 / AGI 0 / 论文 0）；DS_十年后最好专业.md（4 条消息）只问就业趋势，未涉及方法论取舍"},
  {"type": "指针",
   "content": "唯一触及「以逻辑为基础」的材料是 2026-11-04 的四条消息：「lean4验证不是绝对正确，对吧？」他质疑 form verification 的绝对性（kernel soundness / TCB / 公理），但没有展开成路线主张。",
   "tags": ["ML", "AGI", "Lean4", "指针"], "importance": 4,
   "evidence": "DS_Lean4验证非绝对正确.md（2026-11-04 21:50→21:51，4 条消息）：内核漏洞 CVE-2026-72844、TCB、约 8000 行信任基"}
 ]
}

phy = {
 "subject": "physics",
 "generated_at": "2026-11-07T20:30:00+08:00",
 "sources": [
   BASE_PG + "/DS_物理.md",
   BASE_PG + "/DS_线性代数.md"
 ],
 "insights": [
  {"type": "层次",
   "content": "能识别「条件不足」这类 model 假设：仅给 R 与 g 时 mg = F万有 - F向心，反推不出 GM；必须另给自转周期 T，精确式 GM = gR^2 + omega^2 R^3，近似式才是 GM = gR^2。",
   "tags": ["物理", "近似", "模型假设"], "importance": 3,
   "evidence": "DS_物理.md 第 2 条消息（🤖）给出两张判别表：给 R,g 用 GM=gR^2；给 R,g,T 用 GM=gR^2+omega^2*R^3"},
  {"type": "层次",
   "content": "大学物理C 期末的复盘结论是「考试的核心内容完全偏离了方向」：一道选择题三分，备考方向与实考考点错位；补救方案定为回归课本例题与课后习题。",
   "tags": ["物理", "考试", "大学物理C"], "importance": 2,
   "evidence": "DS_物理.md 第 1 条消息（🧑，整段粘贴的复盘文本）：「三分，就是一道选择题的分值……复习的偏差到底出在哪里」"},
  {"type": "待验证",
   "content": "他拒的是物理隐喻而非物理本身：要求把 quadratic form 的「能量」当纯数学量处理（DS_线性代数 L2865），但大学物理C 实际在修。两种态度在先有语料里未分辨。",
   "tags": ["物理", "隐喻", "待验证"], "importance": 3,
   "evidence": "DS_线性代数.md L2865「没学过物理，解释的详细一点」 vs DS_物理.md 记录的大学物理C 期末复盘"},
  {"type": "指针",
   "content": "该科目在对话语料中几乎无投入：pages 目录 413 个文件里物理相关仅 DS_物理.md 一个，2 条消息 / 2.8 KB，无后续会话；且其中 user 侧是粘贴来的复盘文本，不是本人提问。",
   "tags": ["物理", "指针"], "importance": 4,
   "evidence": BASE_PG + " 下 ls | grep -v conflict.bak | wc -l = 413（不含 .bak）；DS_物理.md 2844 字节 / 2 条消息；第 1 条消息为助手口吻的整段粘贴"}
 ]
}

def validate(name, obj, cap):
    n = len(obj["insights"])
    assert cap[0] <= n <= cap[1], (name, n)
    for i in obj["insights"]:
        assert i["type"] in ("提问模式", "困惑", "解法", "层次", "已掌握", "待验证", "指针"), (name, i["type"])
        assert len(i["content"]) <= 120, (name, len(i["content"]), i["content"][:30])
        assert i["tags"][0] in ("ML", "物理")
        assert 1 <= i["importance"] <= 5

for nm, ob, cp in (("ml-foundations.json", ml, (10, 20)), ("physics.json", phy, (2, 6))):
    validate(nm, ob, cp)
    text = json.dumps(ob, ensure_ascii=False, indent=1)
    with open("C:/Users/27063/.dsh/_distill/" + nm, "wb") as f:
        f.write(text.encode("utf-8"))
    print("WROTE", nm, len(ob["insights"]), "maxlen", max(len(i["content"]) for i in ob["insights"]))
