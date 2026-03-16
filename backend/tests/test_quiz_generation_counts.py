import random

import pytest

import app.core.llm as llm
from app.lib.quiz_counts import resolve_requested_counts, validate_quiz_counts
from app.workers.quiz_worker import (
    QuizGenerationCountError,
    _generate_exact_batch,
    _generate_quiz_items_exact,
)


def _mcq(question: str, chunk_id: int) -> dict:
    return {
        "type": "mcq",
        "question": question,
        "options": ["A", "B", "C", "D"],
        "correct_index": 0,
        "answer_key": None,
        "difficulty": "medium",
        "source": {"chunk_id": chunk_id, "page_start": 1, "page_end": 1},
    }


def _theory(question: str, chunk_id: int) -> dict:
    return {
        "type": "conceptual",
        "question": question,
        "options": None,
        "correct_index": None,
        "answer_key": "Expected answer",
        "difficulty": "medium",
        "source": {"chunk_id": chunk_id, "page_start": 1, "page_end": 1},
    }


def test_resolve_requested_counts_respects_explicit_mcq_count():
    mcq_count, theory_count = resolve_requested_counts(
        n_questions=30,
        mcq_count=20,
        types=["mcq", "conceptual"],
    )
    assert mcq_count == 20
    assert theory_count == 10


def test_validate_quiz_counts_flags_mismatch():
    result = validate_quiz_counts(
        requested_mcq_count=20,
        requested_theory_count=10,
        actual_mcq_count=26,
        actual_theory_count=4,
    )
    assert result["is_valid"] is False
    assert result["failure_reason"] == "generated_counts_do_not_match_request"


@pytest.mark.asyncio
async def test_generate_exact_batch_retries_until_requested_count_is_met():
    calls = {"count": 0}

    async def fake_gen(_prompt: str):
        calls["count"] += 1
        if calls["count"] == 1:
            return {"title": "Retry Quiz", "items": [_mcq("Question 1", 1)]}
        return {"title": "Retry Quiz", "items": [_mcq("Question 2", 2)]}

    items, titles = await _generate_exact_batch(
        gen=fake_gen,
        all_chunks=[
            {"chunk_id": 1, "text": "Chunk one", "page_start": 1, "page_end": 1},
            {"chunk_id": 2, "text": "Chunk two", "page_start": 2, "page_end": 2},
        ],
        requested_count=2,
        allowed_types=["mcq"],
        difficulty="medium",
        batch_label="mcq",
        recent_fps=set(),
        recent_questions=[],
        rng=random.Random(7),
        max_attempts=2,
    )

    assert len(items) == 2
    assert calls["count"] == 2
    assert titles


@pytest.mark.asyncio
async def test_generate_quiz_items_exact_enforces_split():
    async def fake_gen(prompt: str):
        if 'Every item must use type "mcq"' in prompt:
            return {"title": "Exact Quiz", "items": [_mcq("MCQ 1", 1), _mcq("MCQ 2", 2)]}
        return {"title": "Exact Quiz", "items": [_theory("Theory 1", 3)]}

    items, _title, validation = await _generate_quiz_items_exact(
        gen=fake_gen,
        all_chunks=[
            {"chunk_id": 1, "text": "Chunk one", "page_start": 1, "page_end": 1},
            {"chunk_id": 2, "text": "Chunk two", "page_start": 2, "page_end": 2},
            {"chunk_id": 3, "text": "Chunk three", "page_start": 3, "page_end": 3},
        ],
        requested_mcq_count=2,
        requested_theory_count=1,
        theory_types=["conceptual"],
        difficulty="medium",
        recent_fps=set(),
        recent_questions=[],
        rng=random.Random(11),
    )

    assert len(items) == 3
    assert validation["is_valid"] is True
    assert validation["actual_mcq_count"] == 2
    assert validation["actual_theory_count"] == 1


@pytest.mark.asyncio
async def test_generate_quiz_items_exact_fails_when_split_cannot_be_met():
    async def fake_gen(prompt: str):
        if 'Every item must use type "mcq"' in prompt:
            return {"title": "Broken Quiz", "items": [_mcq("Only MCQ", 1)]}
        return {"title": "Broken Quiz", "items": []}

    with pytest.raises(QuizGenerationCountError) as err:
        await _generate_quiz_items_exact(
            gen=fake_gen,
            all_chunks=[{"chunk_id": 1, "text": "Chunk one", "page_start": 1, "page_end": 1}],
            requested_mcq_count=1,
            requested_theory_count=1,
            theory_types=["conceptual"],
            difficulty="medium",
            recent_fps=set(),
            recent_questions=[],
            rng=random.Random(13),
        )

    assert err.value.details["failure_reason"] in {
        "insufficient_theory_questions_generated",
        "generated_counts_do_not_match_request",
    }


@pytest.mark.asyncio
async def test_quiz_parser_accepts_top_level_item_array(monkeypatch):
    class FakeCardGenerator:
        async def generate_raw(self, _system: str, _user: str):
            return """
            [
              {
                "type": "mcq",
                "question": "Question 1",
                "options": ["A", "B", "C", "D"],
                "correct_index": 0,
                "answer_key": null,
                "difficulty": "medium",
                "source": {"chunk_id": 1, "page_start": 1, "page_end": 1}
              },
              {
                "type": "mcq",
                "question": "Question 2",
                "options": ["A", "B", "C", "D"],
                "correct_index": 1,
                "answer_key": null,
                "difficulty": "medium",
                "source": {"chunk_id": 2, "page_start": 2, "page_end": 2}
              }
            ]
            """

        def _extract_json_candidate(self, raw: str) -> str:
            start = raw.find("[")
            end = raw.rfind("]")
            return raw[start : end + 1]

    monkeypatch.setattr(llm, "get_card_generator", lambda: FakeCardGenerator())
    gen = llm.get_quiz_generator()
    parsed = await gen("ignored")

    assert isinstance(parsed, dict)
    assert len(parsed["items"]) == 2
