from __future__ import annotations

from dataclasses import dataclass
import re

from app.services.ocr.config import OCRConfig
from app.services.ocr.schema import Correction, OCRBlock

_URL_RE = re.compile(r"https?://|www\.|[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_CODELIKE_RE = re.compile(r"[_/\\{}[\]<>:=;]|[A-Za-z]+\d|\d+[A-Za-z]+")
_WORD_RE = re.compile(r"\b[A-Za-z]{3,}\b")

_COMMON_CORRECTIONS = {
    "bleck": "black",
    "teh": "the",
    "recieve": "receive",
    "defintion": "definition",
    "functon": "function",
    "probablity": "probability",
}


def _edit_distance(a: str, b: str) -> int:
    if abs(len(a) - len(b)) > 4:
        return 99
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _protected(token: str, config: OCRConfig) -> bool:
    low = token.lower()
    return (
        low in config.protected_vocabulary
        or _URL_RE.search(token) is not None
        or _CODELIKE_RE.search(token) is not None
        or token.upper() == token
    )


def _candidate(token: str, config: OCRConfig) -> tuple[str, str] | None:
    low = token.lower()
    if low in _COMMON_CORRECTIONS:
        return _COMMON_CORRECTIONS[low], "common OCR/domain correction"
    best: tuple[str, int] | None = None
    for word in config.domain_lexicon:
        dist = _edit_distance(low, word.lower())
        if dist <= config.max_correction_edit_distance:
            if best is None or dist < best[1]:
                best = (word, dist)
    if not best:
        return None
    ratio = best[1] / max(len(token), len(best[0]), 1)
    if ratio <= config.max_correction_ratio:
        return best[0], "near domain lexicon match"
    return None


def postprocess_block(block: OCRBlock, config: OCRConfig) -> OCRBlock:
    if block.type == "formula" or block.latex:
        return block
    text = block.normalized_text or block.raw_text
    corrections: list[Correction] = []
    uncertain: list[str] = []

    def replace(match: re.Match[str]) -> str:
        token = match.group(0)
        if _protected(token, config):
            return token
        candidate = _candidate(token, config)
        if candidate and block.confidence < config.review_block_confidence:
            replacement, reason = candidate
            dist = _edit_distance(token.lower(), replacement.lower())
            confidence = max(0.51, 1.0 - (dist / max(len(token), len(replacement), 1)))
            corrections.append(Correction(token, replacement, reason, confidence))
            if token[0].isupper():
                return replacement[:1].upper() + replacement[1:]
            return replacement
        if block.confidence < config.min_block_confidence:
            uncertain.append(token)
        return token

    normalized = _WORD_RE.sub(replace, text)
    block.normalized_text = normalized
    block.corrections.extend(corrections)
    block.uncertain_spans.extend(sorted(set(uncertain)))
    if block.confidence < config.review_block_confidence or uncertain:
        block.needs_review = True
    return block


def postprocess_blocks(blocks: list[OCRBlock], config: OCRConfig) -> list[OCRBlock]:
    return [postprocess_block(block, config) for block in blocks]
