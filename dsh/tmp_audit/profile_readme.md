# TianQue6916

> Undergraduate in Intelligent Science & Technology (Ningxia University). These repos are
> my working knowledge base: MIT/Stanford course material re-annotated bilingually (English
> source + 中文批注), plus the agent tooling I build to maintain it. Everything here is meant
> to be read by both humans and AI agents — each repo has an `llms.txt` at its root.

## Course material

| Repo | What is actually inside |
|---|---|
| [`Introduction-to-Probability-6.041`](https://github.com/TianQue6916/Introduction-to-Probability-6.041) | MIT 6.041 Probability — bilingual lecture notes, recitation solutions, problem sets, midterm/final exams, textbook chunks, tutorials |
| [`Introduction-to-Real-Analysis-18.100B`](https://github.com/TianQue6916/Introduction-to-Real-Analysis-18.100B) | MIT 18.100B Real Analysis — bilingual lecture notes, textbook translation, problem sets with solutions, exams, proof notes, subtitles |
| [`Design-and-Analysis-of-Algorithms-6.046J`](https://github.com/TianQue6916/Design-and-Analysis-of-Algorithms-6.046J) | MIT 6.046J Algorithms — bilingual lecture notes, recitation notes, problem sets with solutions, quizzes, final, review, code |
| [`Convex-Optimization-EE364a`](https://github.com/TianQue6916/Convex-Optimization-EE364a) | Stanford EE364a Convex Optimization solutions & notes — 13 lecture decks, homework problem sets with official solutions, Boyd textbook + answer manual, extra exercises, EN/中文 |
| [`Computer-Networking-CS144`](https://github.com/TianQue6916/Computer-Networking-CS144) | Stanford CS144 Computer Networking labs & notes — Lab 0-6 handouts, weekly lecture notes, MOOC unit notes, midterm & final practice exams with answers, textbook, subtitles, EN/中文 |
| [`Information-Theory`](https://github.com/TianQue6916/Information-Theory) | MacKay ITILA Information Theory lecture notes & slides — 16 bilingual lecture notes, official l1-l16 MagicPoint slides, textbook PDF/EPUB with bilingual chapters, board snapshots, EN/中文 |
| [`Mathematics-for-Computer-Science`](https://github.com/TianQue6916/Mathematics-for-Computer-Science) | MIT 6.042J Mathematics for Computer Science — textbook PDF (920pp), chapter structure index, scanned Ch.18 random variables, TOC docx |
| [`Computer-Systems-A-Programmer-s-Perspective`](https://github.com/TianQue6916/Computer-Systems-A-Programmer-s-Perspective) | CSAPP chapter & section index (Computer Systems: A Programmer's Perspective) — scanned TOC, Ch.2 info representation, Ch.8 exceptional control flow PDFs |
| [`Introduction-to-Algorithms`](https://github.com/TianQue6916/Introduction-to-Algorithms) | CLRS Introduction to Algorithms — bilingual EN/中文 book translation chunks (p005-242), MIT 6.006 lecture notes, problem set solutions, exams 1-14, subtitles. |
| [`Introduction-to-Linear-Algebra`](https://github.com/TianQue6916/Introduction-to-Linear-Algebra) | Introduction to Linear Algebra (Strang, MIT 18.06) — scanned Chinese-edition PDF merged into 2 volumes by page order (p000-055, p056-105), with chapter/page index. |
| [`Linear-Algebra-and-Learning-from-Data`](https://github.com/TianQue6916/Linear-Algebra-and-Learning-from-Data) | Linear Algebra and Learning from Data (Strang) — bilingual EN/中文 translations of chapters p001-250 and Parts IV-VII, 18.065 problem set solutions, lecture video transcripts. |
| [`Introduction-to-Algorithms-codetry`](https://github.com/TianQue6916/Introduction-to-Algorithms-codetry) | CLRS Introduction to Algorithms — code drills & practice: C/C++/Python exercise folders (loops, pointers, structs, BFS, Josephus, Yanghui), plus a few linear algebra notes. |

## Agent tooling & automation

| Repo | What is actually inside |
|---|---|
| [`dsh-reasonix-agent`](https://github.com/TianQue6916/dsh-reasonix-agent) | dsh-reasonix-agent — LLM agent harness config backup mirror + engineering notes, 2229 files: dsh presets & cordis.patch.yml, reasonix memory, agents/skills, PowerShell scripts, kb/ lessons |
| [`Structured-Pseudocode-mind-language`](https://github.com/TianQue6916/Structured-Pseudocode-mind-language) | Structured-Pseudocode-mind-language — VS Code ext + bridge: .mind structured pseudocode semantic highlighting, LLM code-generation to Python 3 / C11, DeepSeek API, 35 files |
| [`tool-box`](https://github.com/TianQue6916/tool-box) | tool-box — Python scripts for PDF/TOC extraction, docx summary generation and image rendering; PowerShell ops (autocommit, doctor, backup); Windows .bat push |
| [`diary`](https://github.com/TianQue6916/diary) | diary — auto-generated daily journal notes in Markdown, 18 files: index.md plus days-public/YYYY-MM-DD.md dailies written by an LLM from dsh sessions, tool-call logs, window activity and Edge history |
| [`desktop-tutorial`](https://github.com/TianQue6916/desktop-tutorial) | desktop-tutorial — empty placeholder repo, created automatically by GitHub Desktop on first sign-in; 0 files, no README, nothing to search |

## For AI agents / LLM crawlers

GitHub disallows `/*/tree/` and `/*/raw/` to GPTBot, ClaudeBot, PerplexityBot and friends,
so directory layouts are invisible to crawlers. Each repo therefore ships an `llms.txt`
(llmstxt.org format) stating what is really inside, with real paths.

- Docs via MCP: `https://gitmcp.io/TianQue6916/<repo>` — GitMCP reads `llms.txt` first, then `README.md`.
- Repo search on GitHub indexes only **name, description and topics** — not README body.
  The one-line descriptions above are written to be the search surface; the READMEs carry the detail.

## Notes

- Contents are personal study material. Textbooks and scans remain the copyright of their
  authors and publishers; buy the originals. Bilingual notes and translations are mine.
- Repository descriptions are deliberately keyword-dense: they are the only field GitHub
  search actually reads.
