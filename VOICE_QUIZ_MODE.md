# Voice Quiz Mode (MVP) Developer Note

## What was added
- New flashcards Voice Quiz mode UI:
  - Reads question aloud via browser SpeechSynthesis API.
  - Records answer via MediaRecorder.
  - Uploads audio for backend transcription.
  - Shows transcript and correct answer before rating.
  - Saves 1-5 self-rating attempt.
  - Moves card-by-card with manual next flow.
- Backend voice quiz API:
  - `POST /api/flashcards/voice/transcribe`
  - `POST /api/flashcards/voice/attempts`
- Voice attempt persistence table: `voice_quiz_attempts`.
- Transcription service abstraction for pluggable providers.
- Spaced-repetition metadata updates through existing `apply_study_review`.

## Files changed (voice quiz related)
- `backend/app/routers/flashcards.py`
- `backend/app/core/settings.py`
- `backend/app/services/transcription.py`
- `db/init/11_voice_quiz.sql`
- `backend/tests/test_voice_quiz.py`
- `frontend/src/hooks/useAudioRecorder.ts`
- `frontend/src/components/VoiceQuizMode.tsx`
- `frontend/src/pages/FlashcardsVoiceQuizPage.tsx`
- `frontend/src/pages/FlashcardsPage.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/App.tsx`

## Transcription configuration
- `TRANSCRIPTION_PROVIDER`:
  - `auto` (default): uses OpenAI if `OPENAI_API_KEY` exists, otherwise Groq if `GROQ_API_KEY` exists.
  - `openai` to force OpenAI STT.
  - `groq` to force Groq STT.
  - any other value returns a clear service-unavailable message.
- `OPENAI_API_KEY`: required when `TRANSCRIPTION_PROVIDER=openai`.
- `GROQ_API_KEY`: required when `TRANSCRIPTION_PROVIDER=groq` (or when `auto` falls back to Groq).
- `TRANSCRIPTION_MODEL`: default `gpt-4o-mini-transcribe`.
- `TRANSCRIPTION_GROQ_MODEL`: default `whisper-large-v3-turbo`.
- `TRANSCRIPTION_LANGUAGE` (optional): hint language code.
- `VOICE_QUIZ_MAX_AUDIO_MB`: max upload size (default `12`).
- `VOICE_QUIZ_PERSIST_AUDIO`: `true` to save audio under `/uploads/voice_quiz/...`, else audio URL is null.

## Future AI grading extension
- Add `AnswerEvaluationService` abstraction beside transcription.
- Extend `voice_quiz_attempts` with fields like `ai_score`, `ai_feedback`, `grader_version`.
- Evaluate transcript against card answer in save-attempt flow, but keep user rating as fallback.
- Optionally blend user rating + AI score into scheduling policy after calibration.
