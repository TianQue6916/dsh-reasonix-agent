# Citation and Reference Guide

## natbib Commands (Most Common)

| Command | Output | Use When |
|---------|--------|----------|
| `\cite{key}` | [1] | Default numbered citation |
| `\citet{key}` | Author [1] | Author as part of sentence |
| `\citep{key}` | [1] | Parenthetical citation |
| `\citealt{key}` | Author 1 | No bracket |
| `\citeauthor{key}` | Author | Just the author name |
| `\citeyear{key}` | 2024 | Just the year |
| Multiple | `\citep{key1,key2,key3}` | Compressed: [1–3] |

## biblatex Commands

| Command | Output | Use When |
|---------|--------|----------|
| `\cite{key}` | [1] | Default |
| `\textcite{key}` | Author [1] | Author as noun |
| `\parencite{key}` | [1] | Parenthetical |
| `\autocite{key}` | [1] | Style-agnostic |

## Style Rules
- Every factual claim must have a citation
- "Recent work has shown..." → cite at least 2–3 papers
- Prefer `\citet` for narrative: "Smith et al. [1] proposed..."
- Prefer `\citep` for parenthetical: "widely adopted [1, 2]"
- Never write "In [1], the authors..." — use `\citet` instead
- Always use `~\cite{key}` (non-breaking space)

## BibTeX Entry Format

```bibtex
@article{smith2024method,
  author  = {Smith, John and Doe, Jane and Lee, Bob},
  title   = {A Novel Method for Efficient Training},
  journal = {Advances in Neural Information Processing Systems},
  volume  = {37},
  pages   = {1--15},
  year    = {2024},
  note    = {NeurIPS 2024}
}

@inproceedings{wang2023framework,
  author    = {Wang, Alice and Chen, Bob},
  title     = {A Unified Framework for Multi-Task Learning},
  booktitle = {Proceedings of the IEEE/CVF CVPR},
  pages     = {1234--1243},
  year      = {2023}
}

@misc{blog2024guide,
  author       = {Developer, Jane},
  title        = {A Practical Guide to Transformer Models},
  year         = {2024},
  howpublished = {\url{https://example.com/guide}},
  note         = {Accessed: 2024-01-15}
}
```

BibTeX key convention: `firstauthorYEARkeyword` (e.g., `smith2024method`)
