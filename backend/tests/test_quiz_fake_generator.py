import os
import importlib
import asyncio


def test_fake_quiz_generator_produces_items(monkeypatch):
    # Ensure we use the fake path
    monkeypatch.setenv("LLM_PROVIDER", "fake")

    from app.core import llm as llm_mod
    importlib.reload(llm_mod)

    gen = llm_mod.get_quiz_generator()

    prompt = (
        "TOTAL: EXACTLY 6 questions\n"
        "EXACTLY 3 questions with type=\"mcq\"\n"
        "Remaining must be subjective types\n"
    )

    data = asyncio.run(gen(prompt))
    assert isinstance(data, dict)
    assert "items" in data and isinstance(data["items"], list)
    assert len(data["items"]) == 6
    mcqs = [i for i in data["items"] if i.get("type") == "mcq"]
    assert len(mcqs) == 3


def test_fix_question_counts_helper():
    from app.workers.quiz_worker import _validate_and_fix_question_counts

    items = [
        {"type": "mcq"},
        {"type": "mcq"},
        {"type": "conceptual"},
        {"type": "short_qa"},
    ]
    fixed = _validate_and_fix_question_counts(items, n_questions=5, mcq_count=3, types=["mcq", "conceptual", "short_qa"])
    assert len(fixed) == 5 or len(fixed) == 4  # limited by available input
    mcqs = [i for i in fixed if i.get("type") == "mcq"]
    assert len(mcqs) <= 3
