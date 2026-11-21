"""Split the Corvalis policy documents (docs/*.md) into retrievable chunks.

Strategy: one chunk per `##` section, prefixed with "Document > Section" so that both the
retrievers and the LLM always know where a sentence comes from (a section such as
"Approval" means nothing without "Expense policy").
"""

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

H1 = re.compile(r"^#\s+(?P<title>.+?)\s*#*\s*$", re.MULTILINE)
H2 = re.compile(r"^##\s+(?P<title>.+?)\s*#*\s*$", re.MULTILINE)  # "##" only, not "###"
SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9À-Ý\"'(])")
MAX_CHARS = 700  # long sections are split by sentence (none in today's corpus)


@dataclass(frozen=True)
class Chunk:
    id: str  # "leave.md#sick-leave"
    doc: str  # "leave.md"
    doc_title: str  # "Leave and working time"
    section: str  # "Sick leave"
    text: str  # section body, cleaned
    content: str  # what is embedded / shown to the LLM: "Doc > Section\nbody"


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def clean(markdown: str) -> str:
    """Normalise one section body: line endings, wrapped lines, markdown noise."""
    text = markdown.replace("\r\n", "\n").replace("\r", "\n")
    # "### Tickets" -> its own paragraph "Tickets:" so it reads as a label, not glued to the next sentence
    text = re.sub(r"^#{3,}\s*(.+?)\s*#*\s*$", r"\n\1:", text, flags=re.MULTILINE)
    text = re.sub(r"\*\*(.+?)\*\*|__(.+?)__", lambda m: m.group(1) or m.group(2), text)  # bold
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)  # links -> their text
    text = re.sub(r"^\s*[-*+]\s+", "• ", text, flags=re.MULTILINE)  # bullets
    paragraphs = [re.sub(r"\s*\n\s*", " ", p).strip() for p in re.split(r"\n\s*\n", text)]
    return "\n".join(p for p in paragraphs if p)


def _split_long(body: str) -> list[str]:
    if len(body) <= MAX_CHARS:
        return [body]
    parts, current = [], ""
    for sentence in SENTENCE_END.split(body):
        if current and len(current) + len(sentence) + 1 > MAX_CHARS:
            parts.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    return parts + ([current] if current else [])


def chunk_markdown(markdown: str, doc: str) -> list[Chunk]:
    markdown = markdown.lstrip("﻿")  # BOM written by some Windows editors
    markdown = markdown.replace("\r\n", "\n").replace("\r", "\n")  # Windows / old Mac line endings
    h1 = H1.search(markdown)
    doc_title = h1.group("title").strip() if h1 else Path(doc).stem.replace("-", " ").capitalize()

    headings = list(H2.finditer(markdown))
    sections: list[tuple[str, str]] = []
    intro_start = h1.end() if h1 else 0
    intro_end = headings[0].start() if headings else len(markdown)
    if markdown[intro_start:intro_end].strip():
        sections.append(("Introduction", markdown[intro_start:intro_end]))
    for i, h in enumerate(headings):
        end = headings[i + 1].start() if i + 1 < len(headings) else len(markdown)
        sections.append((h.group("title").strip(), markdown[h.end():end]))

    chunks, seen = [], set()
    for section, raw in sections:
        body = clean(raw)
        if not body:
            continue  # empty section
        pieces = _split_long(body)
        for n, piece in enumerate(pieces, start=1):
            cid = f"{doc}#{slugify(section)}" + (f"-{n}" if len(pieces) > 1 else "")
            while cid in seen:  # duplicate section titles in one document
                cid += "-b"
            seen.add(cid)
            chunks.append(Chunk(cid, doc, doc_title, section, piece, f"{doc_title} > {section}\n{piece}"))
    return chunks


def load_corpus(docs_dir: Path) -> list[Chunk]:
    chunks: list[Chunk] = []
    for path in sorted(docs_dir.glob("*.md")):
        chunks.extend(chunk_markdown(path.read_text(encoding="utf-8"), path.name))
    return chunks
