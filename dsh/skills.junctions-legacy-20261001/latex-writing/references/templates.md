# Document Templates

## Standard Article

```latex
\documentclass[12pt,a4paper]{article}

\usepackage{amsmath,amssymb,amsthm}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage[ruled,vlined]{algorithm2e}
\usepackage{natbib}
\usepackage{hyperref}
\usepackage{cleveref}

\newtheorem{theorem}{Theorem}[section]
\newtheorem{lemma}[theorem]{Lemma}
\newtheorem{proposition}[theorem]{Proposition}
\theoremstyle{definition}
\newtheorem{definition}[theorem]{Definition}

\title{Your Title Here}
\author{Author Names}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
Your abstract here.
\end{abstract}

\section{Introduction}\label{sec:introduction}
\section{Related Work}\label{sec:related}
\section{Methodology}\label{sec:method}
\section{Experiments}\label{sec:experiments}
\section{Results}\label{sec:results}
\section{Conclusion}\label{sec:conclusion}

\bibliographystyle{plainnat}
\bibliography{references}
\end{document}
```

## IEEE Conference

```latex
\documentclass[conference]{IEEEtran}

\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage{cite}
\usepackage{hyperref}

\title{Your Title Here}
\author{
  \IEEEauthorblockN{First Author}
  \IEEEauthorblockA{Affiliation\\Email}
  \and
  \IEEEauthorblockN{Second Author}
  \IEEEauthorblockA{Affiliation\\Email}
}

\begin{document}
\maketitle

\begin{abstract}
Your abstract here.
\end{abstract}

\section{Introduction}\label{sec:introduction}
\section{Related Work}\label{sec:related}
\section{Proposed Method}\label{sec:method}
\section{Experimental Results}\label{sec:results}
\section{Conclusion}\label{sec:conclusion}

\bibliographystyle{IEEEtran}
\bibliography{references}
\end{document}
```

## Thesis (Master/PhD)

```latex
\documentclass[12pt,a4paper]{report}

\usepackage{amsmath,amssymb,amsthm}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage[ruled,vlined]{algorithm2e}
\usepackage{natbib}
\usepackage{hyperref}
\usepackage{cleveref}

\newtheorem{theorem}{Theorem}[chapter]
\newtheorem{lemma}[theorem]{Lemma}
\theoremstyle{definition}
\newtheorem{definition}[theorem]{Definition}

\title{Your Thesis Title}
\author{Your Name}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
Your abstract.
\end{abstract}

\tableofcontents
\listoffigures
\listoftables

\chapter{Introduction}\label{ch:introduction}
\chapter{Background}\label{ch:background}
\chapter{Methodology}\label{ch:methodology}
\chapter{Experiments}\label{ch:experiments}
\chapter{Conclusion}\label{ch:conclusion}

\bibliographystyle{plainnat}
\bibliography{references}
\end{document}
```
