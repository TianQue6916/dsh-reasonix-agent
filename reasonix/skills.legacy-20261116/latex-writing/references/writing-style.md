# Writing Style Conventions

## Paragraph Rules
- One idea per paragraph; 3–8 sentences per paragraph
- Start with a topic sentence, follow with evidence/argument, end with a transition
- Never use `\\` for paragraph breaks — use blank lines
- Avoid orphan lines — use `\widowpenalty=10000` and `\clubpenalty=10000` in preamble

## Sectioning
- Use `\section{}` / `\subsection{}` / `\subsubsection{}` hierarchy — never skip levels
- Section titles: Title Case for English, sentence case for Chinese
- Never use `\paragraph{}` as structural elements
- Always place a label immediately after section: `\section{Introduction}\label{sec:introduction}`

## Emphasis and Formatting

| Purpose | Command | Example |
|---------|---------|---------|
| First-use term | `\emph{}` | \emph{reinforcement learning} |
| Foreign word | `\textit{}` | \textit{a priori} |
| Definition term | `\textbf{}` first use | \textbf{gradient descent} |
| Math variable | `$...$` | the loss $L$ |

**Never** use `\underline{}` for emphasis — it is a typographic anti-pattern.

## Terminology Consistency
- Pick ONE term per concept and use it throughout (e.g., don't alternate "model" and "network")
- Abbreviations: define on first use, then use abbreviation only
- `\acrodef{CNN}{Convolutional Neural Network}` then `CNN~\ac{CNN}`
- Use `\newcommand` for repeated technical terms to ensure consistency:

```latex
\newcommand{\modelname}{ResonixNet}
\newcommand{\lossfunc}{\mathcal{L}}
```

## Language Conventions
- Use active voice when possible: "We propose..." not "It is proposed that..."
- Avoid hedging language: "This suggests" → "This demonstrates"
- Use "we" for the authors, not "the authors" or "I" (unless single author)
- Numbers: spell out one through nine, use digits for 10+
- Units: always with a thin space `3\,ms`, `100\,Hz`
