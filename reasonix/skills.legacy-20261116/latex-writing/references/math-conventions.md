# Mathematics Conventions

## Inline vs Display
- **Inline** `$E = mc^2$` — variables and short expressions within text
- **Display numbered** `\begin{equation}` — important equations deserving a number
- **Display unnumbered** `\begin{equation*}` or `\begin{align*}` — intermediate steps

## Equation Patterns

```latex
% Numbered — always with labels
\begin{equation}
\mathcal{L}(\theta) = -\frac{1}{N} \sum_{i=1}^{N} \log p_\theta(x_i)
\label{eq:loss}
\end{equation}

% Multi-line aligned
\begin{align}
\nabla_\theta \mathcal{L} &= -\frac{1}{N} \sum_{i=1}^{N} \nabla_\theta \log p_\theta(x_i) \label{eq:gradient} \\
\theta_{t+1} &= \theta_t - \eta \nabla_\theta \mathcal{L} \label{eq:update}
\end{align}

% Cases
\begin{equation}
f(x) = \begin{cases}
x^2 & \text{if } x \geq 0 \\
-x^2 & \text{if } x < 0
\end{cases}
\label{eq:piecewise}
\end{equation}
```

## Typography Rules
- **Operators**: `\max`, `\min`, `\log`, `\sin` — never italicize
- **Vectors**: bold `\mathbf{x}` or arrow `\vec{x}` — pick one, stay consistent
- **Matrices**: uppercase bold `\mathbf{W}`
- **Sets**: `\mathcal{S}` or `\mathbb{R}`
- **Expectation**: `\mathbb{E}_{x \sim p}`
- **Thin space**: `\,` before differentials: `\int f(x) \, dx`
- **Text in math**: `\text{subject to}`
- **Upright differential**: `\mathrm{d}x`

## Theorem Environments

```latex
\newtheorem{theorem}{Theorem}[section]
\newtheorem{lemma}[theorem]{Lemma}
\newtheorem{proposition}[theorem]{Proposition}
\newtheorem{corollary}[theorem]{Corollary}
\theoremstyle{definition}
\newtheorem{definition}[theorem]{Definition}
\theoremstyle{remark}
\newtheorem{remark}[theorem]{Remark}

\begin{theorem}\label{thm:convergence}
Under Assumption~\ref{asm:lipschitz}, the sequence $\{\theta_t\}$ converges.
\end{theorem}

\begin{proof}
...
\end{proof}
```
