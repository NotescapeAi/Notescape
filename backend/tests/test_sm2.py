from datetime import datetime, timezone

from app.lib.study_analytics import sm2_update

# note: study_analytics.sm2_update is the core SM-2 scheduling function used by flashcard review logic


def run():
    now = datetime.now(timezone.utc)
    state = sm2_update(2.5, 0, 0, 0, "good")
    assert state["interval"] == 1
    assert state["next_review_at"] > now

    state2 = sm2_update(state["ease_factor"], state["interval"], 1, 0, "easy")
    assert state2["interval"] >= 1
    assert state2["ease_factor"] >= state["ease_factor"]

    state3 = sm2_update(state2["ease_factor"], state2["interval"], 2, 0, "again")
    assert state3["interval"] == 0
    assert state3["ease_factor"] <= state2["ease_factor"]

    print("SM-2 unit checks passed.")


if __name__ == "__main__":
    run()
