# Quiz & Study Assistant Integration Changes

## Overview
This document details the changes made to the Quiz and Study Assistant module to integrate inspiration content, enabling multi-source quiz generation and improving the user experience.

## Key Features Added
1.  **Multi-Source Support**:
    *   **Existing File**: Generate quizzes from previously uploaded files (PDF, DOCX, TXT).
    *   **Paste Text**: Direct text input for quick quiz generation.
    *   **From Topic**: Generate quizzes based on a specific topic using general knowledge (no file required).

2.  **Enhanced User Interface**:
    *   **2-Step Creation Flow**:
        1.  Select source (File, Text, Topic).
        2.  Configure quiz options (Question count, types, difficulty).
    *   **Responsive Design**: Adapted `QuizPanel` to handle different input modes seamlessly.
    *   **Accessibility**: Improved form labels and error handling feedback.

3.  **Backend Enhancements**:
    *   **Unified Document Processing**: `chunking.py` now supports PDF, DOCX, and TXT files with a unified extraction interface.
    *   **Source Type Logic**: Added `source_type` ("file" vs "topic") to `CreateQuizJobReq` and `quiz_worker.py`.
    *   **Dynamic Prompt Generation**: `_build_prompt` now generates different instructions for "Context-based" (File/Text) vs "Topic-based" quizzes.

## Technical Implementation

### Frontend (`frontend/src/components/QuizPanel.tsx`)
*   Added `QuizMode` state (`"file" | "text" | "topic"`).
*   Implemented `prepareFileForQuiz` to handle different sources:
    *   **File**: Uses existing `fileId`.
    *   **Text**: Creates a temporary `.txt` file from pasted content and uploads it.
    *   **Topic**: Creates a placeholder `.txt` file with the topic name and content, enabling the backend to track it as a file artifact but treat it as a topic source.
*   Updated `createQuizJob` API call to include `source_type`.

### Backend (`backend/app/routers/quizzes.py`)
*   Updated `CreateQuizJobReq` schema:
    ```python
    class CreateQuizJobReq(BaseModel):
        ...
        source_type: Literal["file", "topic"] = "file"
    ```
*   Passes `source_type` to the `quiz_jobs` table payload.

### Worker (`backend/app/workers/quiz_worker.py`)
*   Updated `_build_prompt` to accept `source_type`.
*   Added conditional logic for prompt construction:
    *   **If `source_type == "topic"`**: Instructs LLM to use general knowledge about the provided topic.
    *   **If `source_type == "file"`**: Instructs LLM to strictly use the provided context chunks.

### Document Processing (`backend/app/lib/chunking.py`)
*   Refactored `extract_file_content` to delegate to specific extractors:
    *   `_extract_pdf_text`: Uses `pypdf`.
    *   `_extract_docx_text`: Uses `python-docx` (added dependency).
    *   `_extract_plain_text`: Handles standard text decoding.

## API Changes

### `POST /api/quizzes/jobs`
**Request Payload**:
```json
{
  "class_id": 1,
  "file_id": "uuid...",
  "n_questions": 10,
  "mcq_count": 5,
  "types": ["mcq", "conceptual"],
  "difficulty": "medium",
  "source_type": "file" | "topic" // New Field
}
```

## Before vs After Comparison

| Feature | Before | After |
| :--- | :--- | :--- |
| **Input Sources** | PDF Files Only | PDF, DOCX, TXT, Pasted Text, Topics |
| **Creation Flow** | Single Step (File Selection) | 2-Step (Source Selection -> Configuration) |
| **Quiz Content** | Strictly from File Context | Context-based OR General Knowledge (Topic) |
| **File Support** | PDF | PDF, DOCX, TXT |
| **Error Handling** | Generic Errors | Specific Feedback (File not found, Timeout, etc.) |

## Testing
*   **Unit Tests**:
    *   **Backend**: Added `backend/tests/test_quiz_source_type_unit.py` to verify schema validation and prompt generation logic.
    *   **Frontend**: Added `frontend/src/components/QuizPanel.test.tsx` to verify UI rendering, state transitions, and API integration.
*   **Integration Tests**: Updated `backend/tests/test_api_integration_quiz.py` to ensure end-to-end flow stability.
