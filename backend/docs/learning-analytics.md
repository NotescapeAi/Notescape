# Learning analytics MVP

## Weakness score

For each tag:

- `quiz_accuracy` = average of `quiz_question_attempts.score` (normalized 0..1) over recent attempts.
- `flashcard_difficulty` = fraction of flashcard reviews marked as struggle (`again`, `hard`, or low numeric ratings) over recent reviews.
- `weakness_score`:

```text
weakness = (1 - quiz_accuracy) * 0.6 + flashcard_difficulty * 0.4
```

Higher is worse.

## Endpoints

- `GET /api/analytics/weak-tags`
- `GET /api/analytics/tag/{tagId}`
- `GET /api/analytics/quiz-breakdown/{attemptId}`

## Extension ideas

- Add trend delta by comparing last 10 vs previous 10 attempts per tag.
- Add confidence weighting by response time.
- Use richer content-tagging in quiz generation to improve topic precision.
