from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE_FILE = ROOT / "題庫.txt"
OUTPUT_DIR = ROOT / "docs"
OUTPUT_FILE = OUTPUT_DIR / "questions.json"
REPORT_FILE = OUTPUT_DIR / "cleaning_report.json"

QUESTION_START_RE = re.compile(r"^\d+\s")
ANSWER_RE = re.compile(r"\b([A-D])\s*$")
NOISE_PATTERNS = (
    re.compile(r"^序號\s+單元名稱\s+題目\s+答案\s*$"),
    re.compile(r"^┌\s*1\s*1\s*5\s*年\s*版\s*┐"),
    re.compile(r"^https://lh3\.googleusercontent\.com/"),
)


def looks_like_unit_continuation(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    if "(A)" in stripped or "？" in stripped or "?" in stripped:
        return False
    return len(stripped) <= 30


@dataclass
class ParsedQuestion:
    source_order: int
    unit: str
    question_text: str
    answer: str


@dataclass(frozen=True)
class UnitPattern:
    lines: tuple[str, ...]
    display_name: str


def is_noise_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    return any(pattern.search(stripped) for pattern in NOISE_PATTERNS)


def load_source() -> list[str]:
    text = SOURCE_FILE.read_text(encoding="utf-8")
    return [line.rstrip() for line in text.splitlines()]


def split_blocks(lines: list[str]) -> tuple[list[list[str]], list[str]]:
    blocks: list[list[str]] = []
    ignored: list[str] = []
    current: list[str] = []

    for raw_line in lines[1:]:
        line = raw_line.strip()
        if not line:
            continue
        if is_noise_line(line):
            ignored.append(line)
            continue
        if QUESTION_START_RE.match(line):
            if current:
                blocks.append(current)
            current = [line]
        elif current:
            current.append(line)
        else:
            ignored.append(line)

    if current:
        blocks.append(current)

    return blocks, ignored


def detect_units(blocks: list[list[str]]) -> list[UnitPattern]:
    single_counter: Counter[str] = Counter()
    pair_counter: Counter[tuple[str, str]] = Counter()

    for block in blocks:
        first = QUESTION_START_RE.sub("", block[0]).strip()
        single_counter[first] += 1
        if len(block) >= 2:
            pair_counter[(first, block[1].strip())] += 1

    pair_patterns = [
        UnitPattern(lines=(first, second), display_name=f"{first} {second}")
        for (first, second), count in pair_counter.items()
        if count >= 5 and looks_like_unit_continuation(second)
    ]
    canonical_by_first_line = {pattern.lines[0]: pattern.display_name for pattern in pair_patterns}
    single_patterns = [
        UnitPattern(lines=(unit,), display_name=canonical_by_first_line.get(unit, unit))
        for unit, count in single_counter.items()
        if count >= 5
    ]

    return sorted(
        pair_patterns + single_patterns,
        key=lambda pattern: (len(pattern.lines), len(pattern.display_name)),
        reverse=True,
    )


def extract_answer(lines: list[str]) -> tuple[str | None, list[str]]:
    cleaned = lines[:]
    last_line = cleaned[-1]

    match = ANSWER_RE.search(last_line)
    if match:
        answer = match.group(1)
        stripped = ANSWER_RE.sub("", last_line).rstrip()
        if stripped:
            cleaned[-1] = stripped
        else:
            cleaned.pop()
        return answer, cleaned

    if last_line in {"A", "B", "C", "D"}:
        return last_line, cleaned[:-1]

    return None, cleaned


def parse_block(block: list[str], units: list[UnitPattern]) -> tuple[ParsedQuestion | None, str | None]:
    first_line = block[0]
    order_match = re.match(r"^(\d+)\s+(.*)$", first_line)
    if not order_match:
        return None, "invalid_order"

    source_order = int(order_match.group(1))
    remainder = order_match.group(2).strip()

    matched_unit = None
    for candidate in units:
        first_unit_line = candidate.lines[0]
        if not remainder.startswith(first_unit_line):
            continue
        if len(candidate.lines) == 2 and (len(block) < 2 or block[1].strip() != candidate.lines[1]):
            continue
        matched_unit = candidate
        break

    if matched_unit is None:
        return None, "unit_not_found"

    trailing_text = remainder[len(matched_unit.lines[0]) :].strip()
    remaining_lines = block[1:] if len(matched_unit.lines) == 1 else block[2:]
    content_lines = [line for line in ([trailing_text] if trailing_text else []) + remaining_lines if line.strip()]
    answer, question_lines = extract_answer(content_lines)
    if not answer:
        return None, "answer_not_found"

    question_text = "\n".join(line.strip() for line in question_lines if line.strip())
    if not question_text:
        return None, "empty_question"

    return ParsedQuestion(
        source_order=source_order,
        unit=matched_unit.display_name,
        question_text=question_text,
        answer=answer,
    ), None


def main() -> None:
    lines = load_source()
    blocks, ignored_lines = split_blocks(lines)
    units = detect_units(blocks)

    questions: list[dict[str, object]] = []
    skipped: list[dict[str, object]] = []

    for block in blocks:
        parsed, error = parse_block(block, units)
        if parsed is None:
            skipped.append(
                {
                    "reason": error,
                    "block": block,
                }
            )
            continue

        questions.append(
            {
                "id": f"q-{parsed.source_order:04d}",
                "sourceOrder": parsed.source_order,
                "unit": parsed.unit,
                "questionText": parsed.question_text,
                "answer": parsed.answer,
            }
        )

    unit_names = sorted({unit.display_name for unit in units})
    payload = {
        "meta": {
            "sourceFile": SOURCE_FILE.name,
            "questionCount": len(questions),
            "unitCount": len(unit_names),
        },
        "units": unit_names,
        "questions": questions,
    }
    report = {
        "sourceFile": str(SOURCE_FILE),
        "blockCount": len(blocks),
        "ignoredLineCount": len(ignored_lines),
        "ignoredLineSamples": ignored_lines[:20],
        "skippedCount": len(skipped),
        "skippedSamples": skipped[:20],
    }

    OUTPUT_DIR.mkdir(exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "questionCount": len(questions),
                "unitCount": len(unit_names),
                "skippedCount": len(skipped),
                "output": str(OUTPUT_FILE),
            },
            ensure_ascii=True,
        )
    )


if __name__ == "__main__":
    main()
