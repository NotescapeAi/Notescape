from datetime import datetime, timezone

from app.routers.flashcards import _sm2_update


def run():
    now = datetime.now(timezone.utc)
    state = _sm2_update(2.5, 0, 0, 0, "good")
    assert state["interval_days"] == 1
    assert state["due_at"] > now

    state2 = _sm2_update(state["ease_factor"], state["interval_days"], 1, 0, "easy")
    assert state2["interval_days"] >= 1
    assert state2["ease_factor"] >= state["ease_factor"]

    state3 = _sm2_update(state2["ease_factor"], state2["interval_days"], 2, 0, "again")
    assert state3["interval_days"] == 0
    assert state3["ease_factor"] <= state2["ease_factor"]

    print("SM-2 unit checks passed.")


if __name__ == "__main__":
    run()
