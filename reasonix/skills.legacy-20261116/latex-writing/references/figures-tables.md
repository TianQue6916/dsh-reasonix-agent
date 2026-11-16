# Figures and Tables Conventions

## Figure Placement

```latex
\begin{figure}[tbp]  % prefer top, then bottom, then float page
\centering
\includegraphics[width=\linewidth]{figures/example.pdf}
\caption{Overview of the proposed architecture. The encoder maps input $x$ to latent $z$.}
\label{fig:architecture}
\end{figure}
```

### Rules
- Always use `[tbp]` placement — never `[h]` alone
- `\caption` before `\label` — always
- Caption: describe what the figure shows, not just "Figure 1: Architecture"
- Prefer vector formats (PDF, EPS) over raster (PNG, JPG)
- Reference: `Figure~\ref{fig:architecture}` (tilde for non-breaking space)

## Subfigures

```latex
\begin{figure}[tbp]
\centering
\begin{subfigure}[b]{0.48\linewidth}
\includegraphics[width=\linewidth]{figures/a.pdf}
\caption{Before training}
\label{fig:before}
\end{subfigure}
\hfill
\begin{subfigure}[b]{0.48\linewidth}
\includegraphics[width=\linewidth]{figures/b.pdf}
\caption{After training}
\label{fig:after}
\end{subfigure}
\caption{Comparison of model outputs before and after training.}
\label{fig:comparison}
\end{figure}
```

## Tables

```latex
\begin{table}[tbp]
\centering
\caption{Performance comparison. Best results in \textbf{bold}.}
\label{tab:performance}
\begin{tabular}{lcccc}
\toprule
Method & MNIST & CIFAR-10 & ImageNet & COCO \\
\midrule
Baseline & 95.2 & 78.3 & 62.1 & 41.5 \\
Ours & \textbf{98.7} & \textbf{85.1} & \textbf{71.3} & \textbf{52.8} \\
\bottomrule
\end{tabular}
\end{table}
```

### Rules
- Use `booktabs`: `\toprule`, `\midrule`, `\bottomrule` — never `\hline`
- Never use vertical lines in tables
- Caption ABOVE the table body (unlike figures where it goes below)
- Bold the best result in comparison tables
- Align numbers by decimal point when comparing values
