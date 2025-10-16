from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import math

@dataclass
class SRState:
    repetition: int = 0
    ease_factor: float = 2.5
    interval_minutes: float = 0.0  # Interval in minutes
    learning: bool = True
    due_at: datetime = datetime.now(timezone.utc)
    last_review: datetime | None = None

class BrainLikeScheduler:
    """
    Confidence-based scheduler (1..5), Brainscape-inspired:
    - 4..5 = success -> interval grows by rating multiplier * sqrt(EF)
    - 3     marginal -> small growth
    - 1..2  lapse    -> return to learning step (short interval)
    Learning steps: [0, 1 minute, 1 hour] by default.
    """

    def __init__(self,
                 learning_steps = (0.0, 1.0/1440.0, 1.0),  # now, 1 minute, 1 hour (converted to minutes)
                 initial_interval_minutes: float = 1.0,  # initial interval in minutes
                 min_ease_factor: float = 1.3,
                 multipliers: dict[int, float] = None):
        self.learning_steps = learning_steps
        self.initial_interval_minutes = initial_interval_minutes
        self.min_ease_factor = min_ease_factor
        self.multipliers = multipliers or {5: 2.6, 4: 1.6, 3: 1.2, 2: 0.6, 1: 0.4}

    @staticmethod
    def _minutes_to_tdelta(minutes: float) -> timedelta:
        return timedelta(minutes=round(minutes))  # Convert minutes to timedelta

    def _update_ef(self, ef: float, rating: int) -> float:
        q = max(1, min(5, int(rating)))
        delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
        new_ef = ef + delta
        return max(self.min_ease_factor, new_ef)

    def review(self, s: SRState, rating: int, now: datetime | None = None) -> SRState:
        now = now or datetime.now(timezone.utc)
        rating = max(1, min(5, int(rating)))

        if s.learning:
            if rating <= 2:
                s.repetition = 0
                step_minutes = self.learning_steps[1] if len(self.learning_steps) > 1 else (1.0/1440.0)  # 1 minute
                s.interval_minutes = 0.0
                s.due_at = now + self._minutes_to_tdelta(step_minutes)
                s.last_review = now
                s.ease_factor = self._update_ef(s.ease_factor, rating)
                return s

            if rating == 3:
                next_step = self.learning_steps[-1] if self.learning_steps else 1.0
                s.interval_minutes = float(next_step)
                s.learning = False
                s.repetition = 1
                s.due_at = now + self._minutes_to_tdelta(s.interval_minutes)
                s.last_review = now
                s.ease_factor = self._update_ef(s.ease_factor, rating)
                return s

            if rating >= 4:
                s.repetition = 1
                s.interval_minutes = float(self.initial_interval_minutes)
                s.learning = False
                s.due_at = now + self._minutes_to_tdelta(s.interval_minutes)
                s.last_review = now
                s.ease_factor = self._update_ef(s.ease_factor, rating)
                return s

        # Stable scheduling after learning phase
        if rating <= 2:
            s.repetition = 0
            s.learning = True
            step_minutes = self.learning_steps[1] if len(self.learning_steps) > 1 else (1.0/1440.0)
            s.interval_minutes = 0.0
            s.due_at = now + self._minutes_to_tdelta(step_minutes)
            s.last_review = now
            s.ease_factor = self._update_ef(s.ease_factor, rating)
            return s

        # For ratings 3-5, success
        s.repetition = (s.repetition or 0) + 1
        mult = self.multipliers.get(rating, 1.2)
        if s.repetition == 1 and (s.interval_minutes or 0.0) <= 0.0:
            s.interval_minutes = float(self.initial_interval_minutes)
        else:
            ef_scale = math.sqrt(max(1.3, s.ease_factor))
            raw = max(1.0, (s.interval_minutes or 1.0) * mult * ef_scale)
            s.interval_minutes = float(round(raw))
        s.ease_factor = self._update_ef(s.ease_factor, rating)
        s.due_at = now + self._minutes_to_tdelta(s.interval_minutes)
        s.last_review = now
        return s