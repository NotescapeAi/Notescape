from app.routers.quizzes import grade_written_answer


def test_blank_conceptual_answer_is_incorrect():
    score, is_correct, feedback, missing = grade_written_answer(
        "   ",
        "Point A\nPoint B\nPoint C",
        "conceptual",
    )
    assert score == 0.0
    assert is_correct is False
    assert "blank" in feedback.lower()
    assert missing == []


def test_wrong_conceptual_answer_stays_incorrect():
    score, is_correct, feedback, missing = grade_written_answer(
        " unrelated content without the rubric ",
        "Point A\nPoint B\nPoint C",
        "conceptual",
    )
    assert score == 0.0
    assert is_correct is False
    assert len(missing) == 3
    assert "missing" in feedback.lower()


def test_partial_conceptual_does_not_award_full_credit():
    score, is_correct, feedback, missing = grade_written_answer(
        "Point A and Point B together",
        "Point A\nPoint B\nPoint C",
        "conceptual",
    )
    assert 0.0 < score < 0.7
    assert is_correct is False
    assert len(missing) == 1


def test_correct_conceptual_marks_correct():
    score, is_correct, feedback, missing = grade_written_answer(
        "Point A, point B, and point C covered thoroughly",
        "Point A\nPoint B\nPoint C",
        "conceptual",
    )
    assert score == 1.0
    assert is_correct is True
    assert missing == []
    assert "covered" in feedback.lower()


def test_conceptual_parsing_failure_returns_zero():
    score, is_correct, feedback, missing = grade_written_answer(
        "A decent answer",
        "",
        "conceptual",
    )
    assert score == 0.0
    assert is_correct is False
    assert "rubric" in feedback.lower()
    assert missing == []


def test_short_answer_exact_match():
    score, is_correct, feedback, missing = grade_written_answer(
        "The Answer",
        "the answer;The Answer",
        "short_qa",
    )
    assert score == 1.0
    assert is_correct is True
    assert missing == []


def test_short_answer_wrong():
    score, is_correct, feedback, missing = grade_written_answer(
        "Something else",
        "Answer",
        "short_qa",
    )
    assert score == 0.0
    assert is_correct is False
    assert "does not match" in feedback.lower()
    assert missing
