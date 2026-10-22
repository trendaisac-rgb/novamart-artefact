"""Knowledge base: loads the policy documents, splits them into sections and
answers keyword searches.

Design choice: with 8 short documents there is no reason to run a vector database.
Each document is split by its "##" headings, every section becomes a retrieval unit,
and BM25 (keyword scoring) ranks sections for a query. The agent gets the section
text plus a stable reference (doc_id + section) it must cite.

When the corpus grows past a few hundred sections, this module is the only thing
to replace: keep the same `search()` contract and back it with hybrid retrieval
(keyword + embeddings + metadata filters). See PRODUCTION_NOTE.md.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from pathlib import Path

from rank_bm25 import BM25Okapi

from .config import POLICIES_DIR, SEARCH_TOP_K

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _stem(token: str) -> str:
    """Tiny plural stripper so "cards" matches "card" and "returns" matches "return".
    Good enough for a few dozen sections. A real analyzer or embeddings replace this in production."""
    if len(token) > 3 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 3 and token.endswith("es") and token[-3] in "sxz":
        return token[:-2]
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def tokenize(text: str) -> list[str]:
    return [_stem(t) for t in _TOKEN_RE.findall(text.lower())]


@dataclass(frozen=True)
class Section:
    doc_id: str
    title: str
    heading: str
    text: str

    @property
    def ref(self) -> str:
        return f"{self.doc_id} > {self.heading}"


@dataclass(frozen=True)
class Document:
    doc_id: str
    title: str
    summary: str
    sections: tuple[Section, ...]


def _parse_document(path: Path) -> Document:
    doc_id = path.stem
    lines = path.read_text(encoding="utf-8").splitlines()

    title = doc_id
    summary_lines: list[str] = []
    sections: list[Section] = []
    heading: str | None = None
    buffer: list[str] = []

    def flush() -> None:
        if heading is not None and buffer:
            body = "\n".join(buffer).strip()
            if body:
                sections.append(Section(doc_id, title, heading, body))

    for line in lines:
        if line.startswith("# "):
            title = line[2:].strip()
        elif line.startswith("## "):
            flush()
            heading = line[3:].strip()
            buffer = []
        elif heading is None:
            if line.strip():
                summary_lines.append(line.strip())
        else:
            buffer.append(line)
    flush()

    return Document(doc_id, title, " ".join(summary_lines), tuple(sections))


class KnowledgeBase:
    def __init__(self, policies_dir: Path = POLICIES_DIR):
        paths = sorted(policies_dir.glob("*.md"))
        if not paths:
            raise FileNotFoundError(f"No policy documents found in {policies_dir}")
        self.documents: list[Document] = [_parse_document(p) for p in paths]
        self.sections: list[Section] = [s for d in self.documents for s in d.sections]

        # Index the document title and the heading together with the body, heading
        # counted twice, so a query like "holiday returns" also matches on the section name.
        corpus = [tokenize(f"{s.title} {s.heading} {s.heading} {s.text}") for s in self.sections]
        self._bm25 = BM25Okapi(corpus)

    # The catalog goes into the system prompt. It is what lets the agent know what
    # exists, which is half of knowing what it cannot answer.
    def catalog(self) -> str:
        lines = []
        for d in self.documents:
            headings = ", ".join(s.heading for s in d.sections)
            lines.append(f"- {d.doc_id}: {d.title}. {d.summary} Sections: {headings}.")
        return "\n".join(lines)

    def search(self, query: str, top_k: int = SEARCH_TOP_K) -> list[dict]:
        scores = self._bm25.get_scores(tokenize(query))
        ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
        results = []
        for i in ranked[:top_k]:
            if scores[i] <= 0:
                break
            s = self.sections[i]
            results.append({**asdict(s), "score": round(float(scores[i]), 3)})
        return results

    def get_section(self, doc_id: str, heading: str) -> Section | None:
        for s in self.sections:
            if s.doc_id == doc_id and s.heading.lower() == heading.lower():
                return s
        return None
