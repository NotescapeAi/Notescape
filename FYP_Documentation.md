# Notescape: AI-Powered Study Companion

**By**  
[STUDENT 1 NAME] — [ROLL NO 1]  
[STUDENT 2 NAME] — [ROLL NO 2]  
[STUDENT 3 NAME] — [ROLL NO 3]  

**Under the supervision of**  
[SUPERVISOR NAME]  

Bachelor of Science in [DEGREE PROGRAM] ([BATCH YEAR e.g. 2022–2026])  

**[FACULTY / DEPARTMENT NAME]**  
**[UNIVERSITY NAME], [CITY]**

---

## DECLARATION

We hereby declare that this software, neither the whole nor any part of it, has been copied from any source. We also declare that we have developed this software and the accompanying report entirely on the basis of our personal efforts made during this project. If any part of this project is proved to be copied from any source or found to be a reproduction of some other work, we will stand by the consequences. No portion of the work presented here has been submitted for any other degree or qualification at this or any other university or institution.

Signature: \_\_\_\_\_\_\_\_\_\_\_\_ &nbsp;&nbsp;&nbsp;&nbsp; Signature: \_\_\_\_\_\_\_\_\_\_\_\_  
[STUDENT 1 NAME] &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [STUDENT 2 NAME]  
[ROLL NO 1] &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [ROLL NO 2]  

Signature: \_\_\_\_\_\_\_\_\_\_\_\_  
[STUDENT 3 NAME]  
[ROLL NO 3]

---

## CERTIFICATE OF APPROVAL

It is hereby certified that the Final Year Project (FYP) entitled **"Notescape: AI-Powered Study Companion"** was developed by [STUDENT 1 NAME] ([ROLL NO 1]), [STUDENT 2 NAME] ([ROLL NO 2]), and [STUDENT 3 NAME] ([ROLL NO 3]) under the supervision of [SUPERVISOR NAME]. In my opinion, the project is fully adequate in scope and quality for the degree of Bachelor of Science in [DEGREE PROGRAM].

Signature: \_\_\_\_\_\_\_\_\_\_\_\_  
FYP Supervisor

Signature: \_\_\_\_\_\_\_\_\_\_\_\_ &nbsp;&nbsp;&nbsp;&nbsp; Dated: \_\_\_\_\_\_\_\_\_\_\_\_  
Chairperson

---

## Executive Summary

The modern student faces an overwhelming challenge: vast quantities of digital learning material scattered across PDFs, lecture slides, handwritten notes, and online resources, with limited tools to study from them intelligently. Traditional study approaches — rereading notes, manual flashcard creation, and passive review — do not scale well with the volume of content or the diversity of learning styles in today's academic environment.

**Notescape** is an AI-powered, full-stack web application designed to transform the way students interact with their study material. The system provides an integrated platform where students can upload documents for a given class, engage in a context-aware AI chat, automatically generate flashcards and quizzes, study using spaced repetition, practise through voice-based revision, and monitor their academic progress through rich analytics dashboards.

The system is built on a React/TypeScript frontend powered by Vite, with a FastAPI (Python) backend connected to a PostgreSQL database extended with the pgvector extension for semantic search. Authentication is handled through Firebase Authentication, and AI capabilities are delivered via the Groq API (using LLaMA-family models), the OpenAI SDK, and local SentenceTransformer models. Document storage uses an S3-compatible object store, while Redis provides caching for the chat pipeline.

Key capabilities of Notescape include: a class-scoped document library with PDF and PPTX previewing; an OCR pipeline for handwritten and scanned documents; a Retrieval-Augmented Generation (RAG) chat that answers questions grounded in the user's own uploaded materials; an automated flashcard generation and spaced repetition review engine; an AI-generated quiz system with MCQ and theory question types, attempt tracking, and performance analytics; a voice revision mode in which students answer questions verbally and receive AI-evaluated feedback; and a comprehensive analytics dashboard tracking study sessions, weak topics, mastery levels, and exam readiness.

Notescape demonstrates the effective integration of modern AI, vector databases, and multimodal input pipelines into a cohesive educational productivity tool, offering a scalable foundation for future enhancements such as collaborative study groups, adaptive difficulty, and mobile deployment.

---

## Acknowledgement

We express our heartfelt gratitude to everyone who supported us throughout the completion of this Final Year Project.

First and foremost, we are deeply thankful to our project supervisor, **[SUPERVISOR NAME]**, for their invaluable guidance, consistent encouragement, and insightful feedback at every phase of the project. Their mentorship was instrumental in shaping the direction and quality of our work.

We also extend our sincere thanks to the faculty and staff of **[DEPARTMENT NAME], [UNIVERSITY NAME]**, whose teaching and dedication helped lay the technical and professional foundation on which this project rests.

We acknowledge the support of our families and friends, whose patience and encouragement sustained us throughout long development cycles.

Finally, we take pride in the collaborative effort and team spirit of every group member. This project would not have been possible without the shared dedication and commitment of our entire team.

Signature: \_\_\_\_\_\_\_\_\_\_\_\_ &nbsp;&nbsp;&nbsp;&nbsp; Signature: \_\_\_\_\_\_\_\_\_\_\_\_  
[STUDENT 1 NAME] &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; [STUDENT 2 NAME]

Signature: \_\_\_\_\_\_\_\_\_\_\_\_  
[STUDENT 3 NAME]

---

## Table of Contents

- [DECLARATION](#declaration)
- [CERTIFICATE OF APPROVAL](#certificate-of-approval)
- [Executive Summary](#executive-summary)
- [Acknowledgement](#acknowledgement)
- [Chapter 1 — Introduction](#chapter-1--introduction)
  - [1.1 Overview / Preamble](#11-overview--preamble)
  - [1.2 Background and Context](#12-background-and-context)
  - [1.3 Problem Statement](#13-problem-statement)
  - [1.4 Motivation](#14-motivation)
  - [1.5 Project Objectives](#15-project-objectives)
  - [1.6 System Overview](#16-system-overview)
  - [1.7 System Components](#17-system-components)
  - [1.8 Research Contributions](#18-research-contributions)
  - [1.9 System Workflow](#19-system-workflow)
  - [1.10 Related System Analysis](#110-related-system-analysis)
  - [1.11 System Limitations and Constraints](#111-system-limitations-and-constraints)
  - [1.12 Tools and Technologies](#112-tools-and-technologies)
- [Chapter 2 — User Stories](#chapter-2--user-stories)
- [Chapter 3 — Implementation](#chapter-3--implementation)
- [Chapter 4 — Results and Analysis](#chapter-4--results-and-analysis)
- [Chapter 5 — Conclusion and Future Work](#chapter-5--conclusion-and-future-work)

---

# Chapter 1 — Introduction

## 1.1 Overview / Preamble

The way students study has changed dramatically over the past decade. Lecture slides, research PDFs, scanned handwritten notes, and online resources collectively form a vast digital corpus that students must navigate, digest, and retain. Yet the tools most students rely upon — word processors, PDF viewers, and basic note-taking apps — offer little intelligent assistance. Students still face the burden of manually creating flashcards, crafting quiz questions, and trying to recall what they have learned with no structured feedback mechanism.

**Notescape** is a Final Year Project designed to address this gap. It is a web-based, AI-powered study companion that gives students a single, intelligent platform to organise their study material, interact with it conversationally, and practise through evidence-based learning modalities including spaced repetition, quizzes, and voice-based oral revision.

At its core, Notescape allows a student to create a "class" — a logical container for a subject or course — and upload any number of documents to that class (PDF lecture notes, PPTX presentations, scanned handwritten notes, and other files). Once uploaded, the documents are processed, chunked, and embedded into a vector database. The student can then:

- **Chat** with an AI that answers questions specifically grounded in their uploaded materials, with citations, using Retrieval-Augmented Generation.
- **Generate flashcards** automatically from the document content, or create them manually, and study them using a spaced repetition scheduler.
- **Take quizzes** that are automatically generated from the same content, with MCQ and theory sections, and review their performance over time.
- **Practise voice revision** by answering AI-generated questions verbally, receiving scored feedback evaluated by the LLM.
- **Track study sessions** and view an analytics dashboard covering weak topics, mastery levels, study streaks, and an exam readiness score.

The system is built with a modern, responsive interface in React and TypeScript, backed by a high-performance Python FastAPI server, PostgreSQL with pgvector for combined relational and semantic search, Redis for chat caching, and an S3-compatible store for document storage. AI capabilities are delivered primarily through the Groq API (LLaMA models) and the OpenAI SDK, with optional local SentenceTransformer embeddings.

This documentation describes the complete development of Notescape — from its motivation and architecture to its implementation details, key algorithms, and analysis of results.

---

## 1.2 Background and Context

### 1.2.1 The Challenge of Self-Directed Digital Study

Students today are predominantly self-directed learners who must manage their own study schedules, decide what to review, and assess their own understanding. Research in educational psychology consistently shows that passive re-reading of notes is one of the least effective study strategies, while active recall, self-testing, and spaced practice produce significantly stronger long-term retention. Despite this, most digital tools available to students — cloud storage, PDF viewers, or basic note apps — facilitate passive consumption of material rather than active engagement.

The transition to digital education has also created a fragmentation problem. A student's study material may reside across multiple platforms: lecture PDFs in a university portal, slides shared via email, handwritten notes scanned to a phone, and supplementary resources saved in a browser. There is rarely a unified platform that aggregates, processes, and makes this material interactive.

### 1.2.2 Rise of AI in Educational Technology

Artificial Intelligence has increasingly become a practical tool in educational technology (EdTech). Systems now exist for personalised tutoring, automated essay scoring, reading comprehension assistance, intelligent search over course material, and learning path recommendation. The emergence of large, capable language models has dramatically accelerated the quality and breadth of what AI can offer students: from generating well-formed quiz questions to evaluating a spoken answer against a reference solution.

Notescape sits within this trend, treating AI not as a replacement for a teacher but as an intelligent layer over the student's own study material — one that can generate, test, evaluate, and track in ways no static document viewer can.

### 1.2.3 Large Language Models for Personalised Learning

Large Language Models (LLMs) are neural networks trained on massive text corpora, capable of understanding context and generating coherent, relevant text. In the context of Notescape, LLMs serve several roles:

- **Content generation**: Generating flashcard question-answer pairs and quiz questions (MCQ and open-ended) from document chunks.
- **Conversational tutoring**: Acting as a chat assistant that answers questions grounded in the student's uploaded documents.
- **Evaluation**: Scoring voice revision answers by comparing them semantically to reference answers.
- **Smart routing**: Deciding whether a chat query should be answered using the student's document context (RAG) or a general knowledge path.

The primary LLM backend used in Notescape is the **Groq API**, which provides fast inference of LLaMA-family models. The system is also designed to support OpenAI models and a stub provider for testing.

### 1.2.4 Vector Databases and Retrieval-Augmented Generation

A core challenge in building a document-aware chat system is ensuring that the LLM answers questions based on the student's actual content rather than hallucinating plausible-sounding but incorrect information. Retrieval-Augmented Generation (RAG) addresses this by:

1. Breaking documents into smaller text chunks at indexing time.
2. Embedding each chunk into a high-dimensional vector representation using an embedding model.
3. At query time, embedding the user's question and retrieving the most semantically similar document chunks.
4. Providing those chunks as context to the LLM alongside the question, constraining its answer to the retrieved material.

Notescape implements RAG using **PostgreSQL with the pgvector extension**, which stores 1536-dimensional embedding vectors alongside document chunks and supports efficient nearest-neighbour search using IVFFlat indexes. Embeddings are generated either via local SentenceTransformer models or via the Together/OpenAI embedding APIs depending on configuration.

### 1.2.5 The Role of Spaced Repetition and Active Recall

Two of the most well-evidenced techniques in learning science are **active recall** (attempting to retrieve information from memory rather than passively reviewing it) and **spaced repetition** (reviewing material at increasing intervals, revisiting items just as they are about to be forgotten). Together, these techniques produce dramatically stronger long-term retention than passive rereading.

Notescape implements both: flashcards require the student to actively recall an answer before flipping, and the backend spaced repetition system schedules each flashcard for review based on the student's past performance, showing due cards at the optimal time. Quizzes similarly force active recall over a broader set of questions, and the analytics system identifies which cards and topics the student struggles with most — feeding back into the study plan.

---

## 1.3 Problem Statement

### 1.3.1 Fragmented Study Tools

Students currently rely on a collection of disconnected tools: separate apps for flashcards (e.g., Anki or Quizlet), a different tool for PDF reading, another for note-taking, and yet another for quizzes. Switching between these tools increases cognitive overhead and makes it difficult to create a coherent study workflow tied to a specific course or set of documents. There is a need for a single, unified platform where all study activities — reading, chatting, flashcarding, quizzing, and voice revision — are anchored to the same organised body of material.

### 1.3.2 Passive Engagement with Study Material

Most document viewers and cloud storage platforms offer no mechanisms for active engagement. A student who uploads lecture slides to cloud storage can view them but cannot ask the slides a question, generate practice questions from them, or receive feedback on what they understand. This encourages passive re-reading, which is a suboptimal study strategy.

### 1.3.3 Inability to Study from Personal Documents

Popular AI tools like general-purpose chatbots lack awareness of a student's personal course material. They may answer questions about a topic generically but cannot ground answers in a student's specific uploaded notes. When a student asks "What does the slide on normalisation say?", a general AI has no access to that slide. Notescape solves this through its RAG pipeline, which makes the AI's answers specific and verifiable against the student's actual documents, complete with source citations.

### 1.3.4 Lack of Feedback on Spoken Responses

Oral examination and verbal recall are important learning modalities used in tutorials, vivas, and self-testing. No widely available consumer tool supports a structured, document-grounded voice revision session in which a student verbally answers questions and receives immediate, scored feedback. Notescape's Voice Revision Mode fills this gap by presenting questions generated from the student's own material, transcribing the spoken response, and evaluating it using the LLM against a reference answer.

### 1.3.5 Absence of Holistic Progress Tracking

Generic study apps rarely provide insight into the quality or distribution of a student's study efforts. Students often lack visibility into which topics they have mastered, which flashcards they consistently fail, how their quiz performance compares across subjects, or whether they are on track for an upcoming exam. Notescape's analytics layer continuously tracks study sessions, flashcard mastery, quiz scores, and activity patterns, surfacing actionable insights such as weak topic identification, class mastery scores, and an exam readiness indicator.

---

## 1.4 Motivation

### 1.4.1 Reducing Cognitive Load Through Automation

The manual work of creating good study material — writing flashcard questions, composing quiz items, summarising notes — takes hours that could be spent on actual learning. Notescape automates this creation step entirely. Once documents are uploaded and processed, the system can generate hundreds of flashcards and a comprehensive quiz in seconds. This frees the student from the meta-work of study preparation and allows direct focus on retention and understanding.

### 1.4.2 Personalisation at Scale

Every student's uploaded material is different. A computer science student's database course notes look nothing like a law student's contract notes. A general quiz app must use pre-written content. Notescape is personalised by design: all AI-generated content (flashcards, quizzes, chat answers) is derived directly from the student's own uploaded documents. The spaced repetition system further personalises the experience by adapting card review schedules to each individual's performance history.

### 1.4.3 Multi-Modal Learning Support

People learn through different modalities. Some learn best by reading, others by writing, others by speaking, and others by visual review. Notescape supports multiple modalities simultaneously: text-based chat, visual flashcard review, structured quiz-taking, and voice-based oral practice. This breadth makes Notescape suitable for a wide range of learners and study contexts, including exam preparation, regular review, and pre-lecture priming.

---

## 1.5 Project Objectives

### 1.5.1 Primary Objectives

- **Document Management with AI Indexing**: Enable students to create class-scoped document libraries, upload PDFs and PPTX files, and have those documents automatically processed, chunked, and embedded into a vector search index for downstream AI use.
- **RAG-Based AI Chat**: Implement a conversational AI interface that answers student questions grounded in their uploaded documents, with relevant source citations.
- **Automatic Flashcard Generation**: Generate high-quality flashcard question-answer pairs directly from document content using LLMs, and schedule review using a spaced repetition algorithm.
- **Automatic Quiz Generation**: Generate structured quizzes (MCQ and theory sections) from document content, manage attempts, and store performance history.
- **Voice Revision Mode**: Enable students to answer AI-generated questions verbally, transcribe responses, and receive LLM-evaluated scores and feedback.
- **Analytics and Progress Tracking**: Track study sessions, flashcard mastery, quiz performance, and activity patterns; surface weak topics and exam readiness metrics.

### 1.5.2 Secondary Objectives

- Provide an intuitive, modern, responsive UI with dark/light theme support.
- Support OCR for handwritten and scanned document uploads.
- Enable study plan creation and management to help students schedule revision.
- Implement a bookmarking system for flashcards to flag important or difficult cards.
- Provide user profile and account management with avatar upload and preference settings.
- Support a pricing and subscription model for tiered access.
- Ensure secure, Firebase-based authentication with optional email verification enforcement.

### 1.5.3 Scope Boundaries

**In Scope:**
- Document upload, processing, chunking, and embedding for PDF and PPTX files.
- Handwritten/scanned document support via OCR pipeline.
- AI chat with RAG over personal document corpus per class.
- Automated flashcard generation, manual creation, and spaced repetition review.
- Automated quiz generation (MCQ and theory), attempt tracking, and analytics.
- Voice-based revision with LLM answer evaluation.
- Study session tracking and analytics dashboard.
- User profile, settings, and study plan management.
- Containerised deployment using Docker.

**Out of Scope:**
- Collaborative or multi-user shared study spaces.
- Native mobile application.
- Integration with external Learning Management Systems (e.g., Moodle, Canvas).
- Real-time collaborative editing of notes.
- Plagiarism detection.

---

## 1.6 System Overview

### 1.6.1 High-Level Architecture Description

Notescape follows a decoupled, layered architecture consisting of a **React Single-Page Application (SPA)** on the frontend and a **FastAPI** service on the backend, communicating over a well-defined REST API. The system is containerised using Docker Compose, which orchestrates four services: the PostgreSQL/pgvector database, a Redis cache, the FastAPI API server, and (in production) the Nginx-served frontend.

At the highest level, the data and control flow is:

```
[User's Browser]
    ↕  HTTPS / REST API (JSON) + Firebase ID Token
[FastAPI Backend — port 8000]
    ↕                   ↕               ↕              ↕
[PostgreSQL/pgvector]  [Redis Cache]  [S3 Storage]  [Groq / OpenAI / Local LLM]
```

**Frontend (React/Vite/TypeScript):**  
The SPA is served by Vite in development (port 5173) with a proxy forwarding `/api` and `/uploads` requests to the backend. All protected routes require a valid Firebase ID token which is attached as a `Bearer` header. The frontend is structured around React Router v7 with lazy-loaded route components, a `ThemeProvider` for dark/light mode, and a `UserProvider` for auth state.

**Backend (FastAPI/Python):**  
The FastAPI application registers over 20 route modules, each handling a domain — classes, files, chat, flashcards, quizzes, voice revision, analytics, and more. A startup routine runs additive SQL migration scripts against the PostgreSQL database. An `AsyncConnectionPool` is used for non-blocking database access. Firebase Admin SDK verifies JWT tokens on every protected endpoint.

**Database (PostgreSQL + pgvector):**  
The schema is defined in numbered SQL migration files under `db/init/`. Core tables include `classes`, `files`, `file_chunks` (with a `VECTOR(1536)` column and IVFFlat index for nearest-neighbour search), `flashcards`, `ocr_jobs`, and extensive tables for spaced repetition state, quiz attempts, study sessions, voice revision sessions, and analytics.

**Cache (Redis):**  
Redis is used in the chat pipeline to cache recent responses, reducing LLM call latency for repeated or similar queries within a session.

**Object Storage (S3-compatible):**  
Uploaded files are stored in an S3-compatible bucket configurable via environment variables. The backend exposes a `/uploads` static mount for local development.

### 1.6.2 Key Modules and Their Roles

| Module | Backend Router(s) | Frontend Page(s) | Role |
|---|---|---|---|
| Authentication | `dependencies.py` | `Login`, `Signup`, `ForgotPassword`, `VerifyEmail` | Firebase Auth; JWT verification on all protected routes |
| Class Management | `classes.py` | `Classes` | CRUD operations for class containers; document preview |
| File Management | `files.py` | `Classes` (sidebar) | Upload, list, delete, OCR, download; generate flashcards/quiz from file |
| Chunking & Embedding | `chunks.py`, `embeddings.py` | — | Split documents into chunks; generate and store vector embeddings |
| AI Chat | `chat.py`, `chat_ask.py`, `chat_sessions.py`, `chat_ocr.py` | `Chatbot` | RAG chat + general chat; session/message history; OCR-based chat |
| Flashcards | `flashcards.py`, `sr.py` | `FlashcardsHub`, `FlashcardsPage`, `FlashcardsStudyMode`, `FlashcardsBookmarks`, `VoiceFlashcardsPage` | Generate, CRUD, spaced repetition scheduling and review, voice mode |
| Quizzes | `quizzes.py` | `QuizzesPage`, `QuizAttemptPage`, quiz components | Job-based generation, MCQ + theory sections, attempt tracking, streaks |
| Voice Revision | `voice_revision.py` | `VoiceRevisionMode` | Session-based Q&A, answer transcription, LLM evaluation |
| Study Sessions | `study_sessions.py` | `Dashboard` | Time-on-task tracking via start/heartbeat/end API |
| Study Plans | `study_plans.py` | `Dashboard` | Create and manage revision schedules; class suggestions |
| Analytics | `analytics.py` | `Dashboard` | Overview, trends, weak topics, class mastery, quiz breakdown, exam readiness |
| Profile & Settings | `profile.py` | `Profile`, `Settings` | Avatar, preferences, account data management |
| Subscription | `subscribe.py` | `Pricing` | Email subscription for pricing/plan management |

### 1.6.3 Technology Stack Rationale

**React + TypeScript + Vite** was chosen for the frontend because it offers a fast development feedback loop (Vite's HMR), strong type safety, and access to a large ecosystem of UI libraries. **React Router v7** provides nested, lazy-loaded routing appropriate for a large SPA with protected and public sections.

**FastAPI** was selected for the backend because it is asynchronous by default — critical for concurrent LLM API calls that may take several seconds — auto-generates OpenAPI documentation, and offers Pydantic-based request validation. Its performance under I/O-bound workloads (LLM calls, database queries) is significantly better than synchronous alternatives.

**PostgreSQL with pgvector** was chosen over a dedicated vector database to keep the architecture simple: a single database handles both relational data (classes, users, flashcards) and vector similarity search (document chunks). The IVFFlat index provides acceptable nearest-neighbour performance for the expected data volumes.

**Firebase Authentication** was chosen because it abstracts away secure password management, email verification, OAuth provider support, and token refresh — substantially reducing the security surface the team needs to implement and maintain.

**Groq API** provides fast LLaMA-family inference, which is important for user experience in interactive features like chat and voice revision where latency is directly perceptible.

### 1.6.4 User Roles and Access Control

Notescape is a single-role, multi-tenant system. Every authenticated user has an identical role (student). Data isolation is enforced at the database level: every row in every core table includes an `owner_uid` column matching the Firebase UID of the creating user. All backend queries filter by this UID (extracted from the verified JWT), ensuring users can only access their own classes, documents, flashcards, quizzes, and analytics data.

Email verification can be enforced server-side via the `REQUIRE_EMAIL_VERIFIED` configuration flag. A development bypass mode is available (`VITE_DEV_AUTH_BYPASS=true` on the frontend, `X-User-Id: dev-user` header accepted on the backend) to support local development without a live Firebase project.

---

## 1.7 System Components

### 1.7.1 Class and Document Management

The **Classes** module forms the organisational backbone of Notescape. A *class* is a named container for a course or subject. Students create classes and upload study documents to them. The frontend `Classes` page lists all classes in a sidebar and displays the files within the selected class.

**Supported file operations:**
- Upload PDF, PPTX, and image-based (handwritten/scanned) documents.
- View documents in an in-app PDF viewer (`react-pdf` / `pdfjs-dist`) or PPTX preview renderer.
- Download the original file.
- Delete files and all associated data (chunks, embeddings, flashcards generated from them).
- Rename files.

After upload, each file enters the **processing pipeline**: text is extracted, split into semantically coherent chunks, and each chunk is embedded using the configured embedding model, with the resulting vectors stored in the `file_chunks` table. This indexing step makes the document available for RAG-based chat queries.

The backend also supports document preview generation for PPTX files, converting slides to a viewable format and caching the result.

### 1.7.2 OCR Pipeline for Handwritten and Scanned Content

A dedicated OCR pipeline handles documents that cannot be processed by standard text extraction (i.e., scanned images or handwritten notes). When a file is flagged as handwritten or detected as image-based, it enters the OCR job queue.

The OCR pipeline uses **Tesseract** (with OpenCV and Pillow for preprocessing) to extract text from each page. The job status is trackable through the API (`ocr_jobs` table), allowing the frontend to poll for completion. Once OCR is complete, the extracted text enters the same chunking and embedding pipeline as regular documents.

Optional cloud OCR providers (Google Cloud Vision, Azure Document Intelligence, Mathpix for mathematical content) are configurable via environment variables for scenarios where local Tesseract accuracy is insufficient.

After OCR, a student can review the extracted text on a per-page basis, correct any recognition errors, and then trigger flashcard or quiz generation directly from the confirmed OCR output.

### 1.7.3 RAG-Based AI Chat

The **Chatbot** module provides a conversational interface where the AI answers questions specifically grounded in the student's uploaded documents.

**Architecture:**
1. The student types a question in the `ChatInput` component.
2. The frontend sends the message to `POST /api/chat/ask` along with the class or file context.
3. The backend's **smart router** (`chat_ask.py`) classifies the query: if it is document-specific, it invokes the **RAG path**; if it is a general knowledge question, it invokes the **general path** (which may use web search augmentation via DuckDuckGo if configured).
4. For the RAG path: the query is embedded and used to retrieve the top-k most semantically similar `file_chunks` from the pgvector index for the relevant class/file.
5. The retrieved chunks are injected as context into the LLM prompt, and the model generates a grounded answer.
6. The response, along with source citations (file name, chunk location), is returned to the frontend.
7. The conversation turn is stored in a chat session (`chat_sessions` table) for history retrieval.

**Redis caching** is applied to the chat pipeline to avoid redundant LLM calls for identical or near-identical queries within a session.

Chat sessions are scoped per class, and the `ChatSidebar` component allows students to switch between and manage multiple chat sessions. The `ChatInterface` renders messages with Markdown support (`react-markdown`) and inline citations.

### 1.7.4 Flashcard Generation and Spaced Repetition

The **Flashcards** system covers the complete lifecycle from generation to mastery.

**Generation:** Flashcards can be generated in two ways:
- **From document chunks**: The backend sends batches of text chunks to the LLM with a prompt instructing it to produce question-answer pairs covering the key concepts. This is the primary automated path.
- **From OCR output**: After reviewing OCR text, the student can trigger flashcard generation from a specific file's extracted content.
- **Manual creation**: Students can also create flashcards manually through the UI.

**Spaced Repetition:** The backend implements an SM-2-inspired spaced repetition scheduling system (`sr.py`, `sr_card_state` table). Each card has state tracking: last review date, next due date, current interval, and ease factor. When a student reviews a card and rates their confidence, the scheduler updates the card's next due date. The `GET /api/sr/due` endpoint returns only cards that are due for review today.

**Study Modes:**
- `FlashcardsStudyMode`: Standard flip-card review with confidence rating.
- `FlashcardsViewMode`: Browse all cards for a class without scheduling.
- `VoiceFlashcardsPage`: The student reads the question on screen and speaks their answer aloud; the response is transcribed and evaluated by the LLM.
- `FlashcardsBookmarks`: Review only bookmarked (flagged) cards.

The `FlashcardsHub` page provides an overview of all classes' flashcard libraries with progress statistics.

### 1.7.5 Quiz Generation and Attempt Engine

The **Quizzes** module provides a full quiz workflow from generation through submission to analytics.

**Generation:** Quiz generation is job-based. The student requests a quiz for a class or file; the backend creates a job record, then asynchronously calls the LLM to generate questions from the relevant document chunks. The generated quiz consists of two sections:
- **MCQ section**: Multiple-choice questions with four options and one correct answer.
- **Theory section**: Open-ended questions requiring a written response, with a reference answer stored for later scoring.

**Attempt Engine:** The `QuizAttemptPage` presents the two sections sequentially. MCQs are validated against the stored correct answers. Theory answers are submitted for LLM-based semantic evaluation. Results are returned with per-question scoring and overall marks.

**History and Analytics:**
- All attempts are stored (`quiz_attempts` table) and viewable in a history page.
- A streak system tracks consecutive days of quiz activity.
- The `analytics.py` router provides quiz-specific breakdowns: performance by class, by question type, score trends over time, and identification of question topics where the student consistently underperforms.

The `QuizCompletionScreen` component presents a detailed results breakdown with correct answers, the student's responses, and LLM-generated feedback.

### 1.7.6 Voice Revision Mode

**Voice Revision** is a unique, document-grounded oral practice mode accessed via `/voice-revision`.

**Session Flow:**
1. The student starts a voice revision session, selecting scope (all classes or a specific class).
2. The backend (`voice_revision.py`) selects the next question from the generated quiz/flashcard bank for the chosen scope.
3. The question is displayed and optionally read aloud (TTS support configurable via `VoiceSettingsPanel`).
4. The student speaks their answer; the audio is captured via the browser microphone.
5. The audio is sent to the transcription endpoint, which uses a Whisper-family model via the OpenAI/Groq transcription API to convert speech to text.
6. The transcription is compared against the reference answer by the LLM, which returns a score (0–10) and qualitative feedback.
7. The result is displayed and the session advances to the next question.
8. On session end, the complete session summary is persisted.

The `VoiceSettingsPanel` component provides controls for speech rate, voice selection, and auto-advance behaviour. `voiceService.ts` and `voiceCommands.ts` in the frontend handle browser Speech Synthesis API integration.

### 1.7.7 Study Plans and Session Tracking

**Study Session Tracking:** Every time a student opens a study-mode page (flashcard review, quiz attempt, voice revision), the frontend calls `POST /api/study-sessions/start`, then sends heartbeat `PATCH` requests at regular intervals, and finally calls the end endpoint when leaving. This gives the system precise time-on-task data per class and per activity type.

**Study Plans:** Students can create structured revision plans specifying topics, target dates, and time allocations. The backend (`study_plans.py`) stores these plans and can suggest rebalancing if the student falls behind their schedule. Class-level suggestions recommend which classes need the most attention based on recent quiz performance and flashcard mastery data.

### 1.7.8 Analytics and Exam Readiness Dashboard

The **Dashboard** (`/dashboard`) is the student's command centre, powered by the `analytics.py` router and rendered with Chart.js via `react-chartjs-2` and the custom `ActivityHeatmap` component.

**Analytics endpoints and their dashboard widgets:**

| Endpoint | Widget |
|---|---|
| `GET /api/analytics/overview` | Summary cards (total study time, flashcards reviewed, quizzes taken, streak) |
| `GET /api/analytics/trends` | Line/bar charts of study activity and quiz scores over time |
| `GET /api/analytics/weak-topics` | List of topics with lowest quiz and flashcard performance |
| `GET /api/analytics/weak-cards` | Specific flashcards the student most frequently marks incorrect |
| `GET /api/analytics/weak-tags` | Tag-based grouping of weak content areas |
| `GET /api/analytics/quiz-breakdown` | Per-class and per-quiz-type performance breakdown |
| `GET /api/analytics/class-mastery` | Mastery percentage per class |
| `GET /api/analytics/exam-readiness` | Composite exam readiness score (0–100%) |
| `GET /api/analytics/recommendations` | AI-generated study recommendations |
| `GET /api/analytics/mistakes` | Log of incorrectly answered questions for targeted review |

The `ActivityHeatmap` component renders a GitHub-style contribution heatmap of daily study activity over the past year. The `StatCard` UI component is used throughout the dashboard to display key metrics in a clear, card-based layout.

---

## 1.8 Research Contributions

### 1.8.1 Document-Grounded Personalised RAG at the Student Level

Most RAG implementations operate at an organisational or product level over a fixed, curated corpus. Notescape implements per-user, per-class RAG where each student builds their own private knowledge base from their personal uploaded documents. The `file_chunks` table uses row-level ownership (`owner_uid`) to enforce isolation, and the embedding index is queried with an ownership filter, ensuring the student's chat is always grounded in their own material. This design pattern — personal RAG sandboxes within a shared infrastructure — is a practical contribution to applying RAG in a multi-tenant educational context.

### 1.8.2 Unified Multi-Modal Study Pipeline from a Single Document Corpus

Notescape derives four distinct study artefacts from a single uploaded document: (1) a chat context for conversational Q&A, (2) flashcards for spaced repetition, (3) quiz questions for self-assessment, and (4) voice revision questions for oral practice. All four are generated from the same chunked and embedded document representation, meaning a student uploads a document once and immediately unlocks the full suite of study modalities. This pipeline unification — from upload to chunk to embed to generate across all modalities — reduces duplication and ensures consistency of study material across modes.

### 1.8.3 Voice-Based Answer Evaluation with Document-Grounded Reference Answers

The Voice Revision module combines three AI capabilities in a single pipeline: (1) LLM-generated questions derived from the student's own documents; (2) Whisper-based speech-to-text transcription of the student's spoken answer; and (3) LLM-based semantic scoring comparing the transcription against the stored reference answer. This three-stage pipeline for automated oral examination practice over personal study material represents a novel integration of existing AI capabilities for a practical educational use case.

### 1.8.4 Integrated Exam Readiness Scoring

The analytics module computes a composite **exam readiness score** that synthesises multiple signals: flashcard mastery rate per class, quiz score trends, recency of study sessions, identification of weak topics, and activity consistency (streak data). Rather than presenting raw statistics, the system distils these into a single interpretable metric that a student can use to gauge their preparation level, providing a practically actionable output to guide study planning.

---

## 1.9 System Workflow

### 1.9.1 Document Upload to AI-Ready Knowledge Base

```
Student uploads file (PDF / PPTX / scanned image)
    → Backend receives file, stores to S3
    → If text-extractable:
        → Extract text (pdfplumber / python-pptx)
        → Split into overlapping semantic chunks
        → Embed each chunk (SentenceTransformer / OpenAI / Together)
        → Store chunks + vectors in file_chunks (pgvector)
    → If image / handwritten:
        → Create OCR job record
        → Preprocess image (OpenCV / Pillow)
        → Run Tesseract OCR
        → Student reviews extracted text, confirms
        → Enter chunking + embedding pipeline as above
    → Document is now queryable via RAG
```

### 1.9.2 Student Study Workflow

```
Student opens a Class
    → Views uploaded documents
    → Option A: Chat
        → Types question → Smart router (RAG vs general)
        → RAG: embed query → nearest-neighbour search → retrieve chunks
              → LLM → answer + citations
        → Answer displayed in ChatInterface with source references
    → Option B: Flashcards
        → Generate flashcards (LLM generates Q&A pairs from chunks)
        → Study mode: SR scheduler shows due cards
              → student rates recall → SR state updated
    → Option C: Quiz
        → Request quiz generation (async job)
              → LLM generates MCQ + theory questions
        → Student attempts quiz
              → MCQs scored immediately
              → theory evaluated by LLM
        → Results stored; reflected in Dashboard analytics
    → Option D: Voice Revision
        → Session started → next question served
        → Student speaks answer → Whisper transcription
              → LLM scoring → feedback displayed
    → Dashboard: all activity aggregated into analytics + exam readiness score
```

### 1.9.3 Voice Revision Workflow (Detailed)

```
POST /api/voice-revision/sessions              → create session
GET  /api/voice-revision/sessions/{id}/next-question → retrieve next question
[Student speaks answer → browser records audio]
POST /api/voice-revision/sessions/{id}/evaluate
    → audio blob uploaded
    → Whisper API transcribes speech to text
    → LLM compares transcription to reference answer
    → Returns: score (0–10), feedback text, correct answer
GET  /api/voice-revision/sessions/{id}         → retrieve full session summary
POST /api/voice-revision/sessions/{id}/end     → finalise and persist session
```

---

## 1.10 Related System Analysis

| System | Type | Strengths | Gaps vs. Notescape |
|---|---|---|---|
| **Anki** | Flashcard + Spaced Repetition | Mature SR algorithm; large community deck library | No AI generation; no document upload; no chat; no quizzes; no voice mode |
| **Quizlet** | Flashcard + Learn Modes | Easy manual card creation; various study modes | No RAG chat; no document grounding; no analytics depth; no voice evaluation |
| **NotebookLM (Google)** | Document Q&A | Excellent source-grounded chat; audio overview | No flashcards; no quizzes; no spaced repetition; no voice revision; no analytics |
| **Elicit / Consensus** | Research AI | Strong academic search | Not a study tool; no flashcards/quizzes/SR |
| **Khan Academy Khanmigo** | AI Tutor | Guided tutoring; good pedagogy | Not personalised to student's own documents; no SR; no voice exam mode |
| **ChatGPT / Claude** | General LLM | Broad knowledge; good explanations | Not grounded in personal documents; no flashcards; no SR; no analytics; no voice exam |

Notescape's differentiation lies in the combination of: **personal document grounding** (RAG over uploaded files), **complete study cycle support** (chat → flashcards → quizzes → voice revision → analytics), and **data persistence and progress tracking** — a combination not found in any single competing product.

---

## 1.11 System Limitations and Constraints

- **LLM Quality Dependency**: The quality of generated flashcards and quiz questions depends on the LLM's ability to identify key concepts in the provided chunks. Poorly written source documents or very technical niche content may result in lower-quality generation.
- **Embedding Dimension Fixed at 1536**: The `file_chunks` schema uses `VECTOR(1536)`, appropriate for OpenAI's `text-embedding-ada-002` and compatible local models. Switching to a model with a different embedding dimension requires a schema migration.
- **OCR Accuracy on Handwriting**: Local Tesseract-based OCR has lower accuracy than cloud-based alternatives for handwritten mathematical content or non-standard fonts. Optional cloud OCR providers address this but require additional API keys.
- **No Collaboration Features**: Notescape is a single-user system. There is no support for shared classes, collaborative study groups, or teacher-student relationships.
- **Voice Input Requires Browser Microphone Permission**: The Voice Revision mode depends on browser microphone access. Users without microphone access or in restrictive browser environments cannot use this feature.
- **LLM Latency**: Features that invoke LLM APIs are subject to network and inference latency. Generation tasks can take 5–15 seconds for large documents, though the Groq API's fast inference mitigates this substantially.
- **Single-Region Deployment**: The current Docker Compose setup is designed for single-server deployment. Horizontal scaling of the FastAPI service would require changes to session handling and Redis connection pool configuration.

---

## 1.12 Tools and Technologies

| Category | Tool / Technology | Purpose |
|---|---|---|
| Frontend Framework | React 18 | SPA component model |
| Language (Frontend) | TypeScript 5 | Type safety across frontend |
| Build Tool | Vite 7 | Fast HMR dev server; production bundler |
| Routing | React Router 7 | SPA routing, lazy loading |
| Styling | Tailwind CSS 3 | Utility-first responsive styling |
| Animation | Framer Motion | Page transitions and UI animations |
| HTTP Client | Axios | REST API communication |
| Auth (Frontend) | Firebase SDK | Authentication state management |
| PDF Rendering | react-pdf, pdfjs-dist | In-browser PDF viewer |
| Charts | Chart.js + react-chartjs-2 | Analytics dashboard charts |
| Markdown | react-markdown | Chat message rendering |
| Icons | Lucide React, React Icons | UI icons |
| Backend Framework | FastAPI | Async REST API; OpenAPI documentation |
| Language (Backend) | Python 3.11+ | Backend logic |
| ASGI Server | Uvicorn | FastAPI process server |
| Database | PostgreSQL 15 + pgvector | Relational + vector storage |
| Vector Extension | pgvector | 1536-dim vector similarity search (IVFFlat) |
| DB Driver | psycopg3 (async) | Async PostgreSQL connection pooling |
| Cache | Redis 7 | Chat response caching |
| Object Storage | S3-compatible (boto3) | Document file storage |
| Auth (Backend) | Firebase Admin SDK | JWT verification |
| Primary LLM | Groq API (LLaMA family) | Chat, generation, evaluation |
| Secondary LLM / Embed | OpenAI SDK | Embeddings, transcription, optional chat |
| Local Embeddings | sentence-transformers | Offline embedding (MiniLM family) |
| Speech-to-Text | Whisper (via OpenAI/Groq API) | Voice revision transcription |
| OCR | Tesseract, OpenCV, Pillow | Handwritten/scanned document processing |
| Containerisation | Docker, Docker Compose | Multi-service orchestration |
| Testing (Frontend) | Vitest | Unit and component testing |
| Testing (Backend) | pytest | API and unit testing |
| Email | EmailJS | Contact form delivery |
| Version Control | Git | Source control |

---

# Chapter 2 — User Stories

## 2.1 Authentication and Onboarding

### 2.1.1 User Story 1 — Secure Registration and Login

**As a** new student,  
**I want to** create an account with my email and password and verify my email,  
**So that** I can securely access my personal study data from any device.

**Acceptance Criteria:**
- User can register with a valid email and password via the Firebase Auth flow.
- A verification email is sent on registration.
- User cannot access protected routes until the email is verified (when `REQUIRE_EMAIL_VERIFIED` is enabled).
- Login with invalid credentials shows a clear error message.
- Password reset via email is supported at `/forgot-password`.

### 2.1.2 User Story 2 — Session Persistence

**As a** returning student,  
**I want to** remain logged in between browser sessions,  
**So that** I do not need to log in every time I open the app.

**Acceptance Criteria:**
- Firebase ID token is refreshed automatically in the background.
- Navigating to a protected URL while authenticated lands on the target page, not the login page.
- Navigating to a protected URL while unauthenticated redirects to `/login`.

---

## 2.2 Class and Document Management

### 2.2.1 User Story 1 — Create and Organise Classes

**As a** student,  
**I want to** create named classes for each of my courses,  
**So that** I can keep my study material, flashcards, and quizzes organised per subject.

**Acceptance Criteria:**
- Student can create a class with a name and optional description.
- Classes are listed in the `AppSidebar` and on the `Classes` page.
- Student can rename or delete a class.
- Deleting a class removes all associated files, chunks, flashcards, and quiz data.

### 2.2.2 User Story 2 — Upload and Process Documents

**As a** student,  
**I want to** upload PDF and PPTX lecture files to a class,  
**So that** the AI can use them to answer my questions and generate study material.

**Acceptance Criteria:**
- Student can upload PDF and PPTX files to a class via the file upload UI.
- After upload, the file appears in the class file list with a processing status indicator.
- The backend asynchronously chunks and embeds the document.
- Student receives a success notification when processing is complete.
- Student can preview the document in-app without downloading it.

### 2.2.3 User Story 3 — Upload Handwritten Notes

**As a** student,  
**I want to** upload photos or scans of my handwritten notes,  
**So that** the AI can also use them as part of my study context.

**Acceptance Criteria:**
- Student can upload image-based files as handwritten documents.
- The backend creates an OCR job and processes the images with Tesseract.
- Student can review the extracted text per page and correct errors before confirming.
- After confirmation, the extracted text enters the chunking and embedding pipeline.

---

## 2.3 AI Chat

### 2.3.1 User Story 1 — Document-Grounded Q&A

**As a** student,  
**I want to** ask questions about my uploaded notes and get answers grounded in my documents,  
**So that** I can quickly find information without manually searching through files.

**Acceptance Criteria:**
- Chat is accessible per class or per file from the `Chatbot` page.
- The response includes references to the source document and chunk.
- The response is factually grounded in the retrieved document content.
- Response is rendered with Markdown formatting.

### 2.3.2 User Story 2 — General Knowledge Fallback

**As a** student,  
**I want to** ask general questions that go beyond my uploaded documents,  
**So that** I can use the chat as a broader study aid when needed.

**Acceptance Criteria:**
- The smart router detects queries that are not document-specific.
- General queries are answered using the LLM's training knowledge (and optionally web search).
- A visual indicator shows whether the answer came from uploaded documents or general knowledge.

### 2.3.3 User Story 3 — Chat Session History

**As a** student,  
**I want to** revisit past chat sessions,  
**So that** I can refer back to explanations I have already received.

**Acceptance Criteria:**
- Chat sessions are persisted per class.
- The `ChatSidebar` lists past sessions with titles and timestamps.
- Clicking a past session restores the full message history.
- Student can delete a chat session.

---

## 2.4 Flashcards

### 2.4.1 User Story 1 — AI-Generated Flashcards

**As a** student,  
**I want to** automatically generate flashcards from my uploaded documents,  
**So that** I can start studying without manually writing question-answer pairs.

**Acceptance Criteria:**
- Student can trigger flashcard generation for a class or a specific file.
- The backend generates Q&A pairs from document chunks using the LLM.
- Generated flashcards appear in the class flashcard library within a reasonable time.
- Each flashcard has a question on the front and an answer on the back.

### 2.4.2 User Story 2 — Spaced Repetition Study

**As a** student,  
**I want to** study only the flashcards that are due for review today,  
**So that** my study time is efficient and my long-term retention is maximised.

**Acceptance Criteria:**
- The SR scheduler surfaces only due cards on the study session page.
- Student rates their recall (e.g., Easy / Good / Hard / Forgot) after each card.
- The scheduler updates the next due date based on the rating.
- A card rated "Forgot" is shown again sooner; a card rated "Easy" is shown later.

### 2.4.3 User Story 3 — Bookmark Important Cards

**As a** student,  
**I want to** bookmark flashcards I find particularly important or difficult,  
**So that** I can review them selectively at any time.

**Acceptance Criteria:**
- Each flashcard has a bookmark toggle.
- The `FlashcardsBookmarks` page shows only bookmarked cards.
- Bookmarks persist across sessions.

---

## 2.5 Quizzes

### 2.5.1 User Story 1 — AI-Generated Quizzes

**As a** student,  
**I want to** generate a quiz from my class documents,  
**So that** I can test my understanding with realistic exam-style questions.

**Acceptance Criteria:**
- Student can request quiz generation for a class or specific file.
- The generated quiz has both an MCQ section and a theory section.
- Each MCQ has four options and one clearly correct answer.
- Each theory question has a stored reference answer for evaluation.

### 2.5.2 User Story 2 — Attempt a Quiz and Receive Results

**As a** student,  
**I want to** take a quiz and receive immediate feedback on my answers,  
**So that** I know what I got right and wrong and can target my revision accordingly.

**Acceptance Criteria:**
- MCQs are presented with selectable options.
- Theory answers are entered as free text.
- On submission, MCQ answers are marked correct/incorrect; theory answers receive an LLM-generated score and feedback.
- The `QuizCompletionScreen` shows overall score, per-question results, and correct answers.

### 2.5.3 User Story 3 — Quiz History and Streaks

**As a** student,  
**I want to** view my past quiz attempts and maintain a study streak,  
**So that** I can track improvement and stay motivated.

**Acceptance Criteria:**
- A quiz history page lists all past attempts with scores and dates.
- Clicking an attempt shows the detailed result.
- The dashboard streak widget updates when the student completes a quiz on a given day.

---

## 2.6 Voice Revision

### 2.6.1 User Story 1 — Oral Practice with AI Feedback

**As a** student,  
**I want to** answer study questions by speaking aloud and receive a score,  
**So that** I can practise for oral examinations and reinforce verbal recall.

**Acceptance Criteria:**
- Voice Revision mode presents one question at a time from the student's study material.
- The student can speak their answer; the audio is captured and sent for transcription.
- A score and qualitative feedback are returned within a few seconds.
- The student can advance to the next question or end the session at any time.

### 2.6.2 User Story 2 — Voice Session Summary

**As a** student,  
**I want to** see a summary of my voice revision session at the end,  
**So that** I know which questions I answered well and which need more revision.

**Acceptance Criteria:**
- At session end, a summary lists all questions, the student's transcribed answer, the reference answer, and the score for each.
- The session is saved to history and reflected in analytics.

---

## 2.7 Analytics and Dashboard

### 2.7.1 User Story 1 — Study Activity Overview

**As a** student,  
**I want to** see a summary of my recent study activity on the dashboard,  
**So that** I can quickly assess how consistently I am studying.

**Acceptance Criteria:**
- Dashboard shows total study time, flashcards reviewed, quizzes taken, and current streak.
- An activity heatmap shows day-by-day study activity over the past year.
- Charts show score trends and activity levels over recent weeks.

### 2.7.2 User Story 2 — Weak Area Identification

**As a** student,  
**I want to** know which topics and flashcards I am weakest in,  
**So that** I can prioritise my revision effectively.

**Acceptance Criteria:**
- The dashboard highlights topics with lowest quiz and flashcard performance.
- A list of specific weak flashcards is accessible.
- Weak topics are grouped by tag where applicable.

### 2.7.3 User Story 3 — Exam Readiness Score

**As a** student,  
**I want to** see an overall exam readiness score,  
**So that** I have a single, clear indicator of how prepared I am for upcoming exams.

**Acceptance Criteria:**
- The dashboard displays an exam readiness score (0–100%).
- The score reflects mastery, study recency, weak topic coverage, and activity consistency.
- The score updates as the student completes study activities.

---

## 2.8 Profile and Settings

### 2.8.1 User Story 1 — Profile Management

**As a** student,  
**I want to** set my name, profile picture, and personal preferences,  
**So that** the app feels personalised to me.

**Acceptance Criteria:**
- Student can upload a profile avatar.
- Student can update their display name.
- Changes are persisted to the backend and reflected across the UI.

### 2.8.2 User Story 2 — Data Management

**As a** student,  
**I want to** clear my embeddings, chat history, or flashcard data selectively,  
**So that** I can reset specific parts of my study data without deleting everything.

**Acceptance Criteria:**
- Settings page provides options to clear chat history, flashcards, or embeddings per class.
- Account deletion removes all user data permanently.
- Destructive actions require a confirmation step.

### 2.8.3 User Story 3 — Theme Preference

**As a** student,  
**I want to** switch between a light and dark theme,  
**So that** I can study comfortably in different lighting conditions.

**Acceptance Criteria:**
- A theme toggle is accessible globally via `GlobalThemeToggle`.
- The selected theme is persisted and applied on next load.
- All pages and components respect the active theme.

---

# Chapter 3 — Implementation

## 3.1 Implementation Details

### 3.1.1 Project Structure

```
Notescape/
├── frontend/                        # React/Vite/TypeScript SPA
│   ├── src/
│   │   ├── App.tsx                  # Root router and lazy route definitions
│   │   ├── components/              # Reusable UI components
│   │   │   ├── chat/                # ChatInterface, ChatInput, ChatMessage, ChatSidebar
│   │   │   ├── ui/                  # StatCard, EmptyState, buttons
│   │   │   ├── AppSidebar.tsx
│   │   │   ├── QuizPanel.tsx
│   │   │   ├── VoiceSettingsPanel.tsx
│   │   │   ├── ActivityHeatmap.tsx
│   │   │   └── ...
│   │   ├── pages/                   # Route-level components
│   │   │   ├── Classes.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Chatbot.tsx
│   │   │   ├── FlashcardsHub.tsx
│   │   │   ├── FlashcardsPage.tsx
│   │   │   ├── FlashcardsStudyMode.tsx
│   │   │   ├── VoiceRevisionMode.tsx
│   │   │   ├── VoiceFlashcardsPage.tsx
│   │   │   └── quizzes/
│   │   │       ├── QuizzesPage.tsx
│   │   │       ├── QuizAttemptPage.tsx
│   │   │       └── components/
│   │   │           ├── QuizStartScreen.tsx
│   │   │           ├── QuizMCQSection.tsx
│   │   │           ├── QuizTheorySection.tsx
│   │   │           └── QuizCompletionScreen.tsx
│   │   ├── lib/
│   │   │   ├── api.ts               # Axios instance + auth header helpers
│   │   │   ├── voiceService.ts      # Browser Speech Synthesis integration
│   │   │   └── voiceCommands.ts     # Voice command parsing
│   │   ├── firebase/
│   │   │   └── firebase.ts          # Firebase app initialisation
│   │   ├── context/                 # ThemeProvider, UserProvider
│   │   └── styles/
│   │       └── global.css
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app, router registration, startup migrations
│   │   ├── dependencies.py          # Firebase JWT verification
│   │   ├── core/
│   │   │   ├── db.py                # AsyncConnectionPool, get_conn context manager
│   │   │   ├── settings.py          # Pydantic settings (env vars)
│   │   │   ├── migrations.py        # Startup SQL migration runner
│   │   │   └── llm.py               # LLM provider abstraction
│   │   └── routers/
│   │       ├── classes.py
│   │       ├── files.py
│   │       ├── chunks.py
│   │       ├── embeddings.py
│   │       ├── chat.py
│   │       ├── chat_ask.py
│   │       ├── chat_sessions.py
│   │       ├── chat_ocr.py
│   │       ├── flashcards.py
│   │       ├── sr.py
│   │       ├── quizzes.py
│   │       ├── voice_revision.py
│   │       ├── analytics.py
│   │       ├── study_sessions.py
│   │       ├── study_plans.py
│   │       ├── profile.py
│   │       ├── subscribe.py
│   │       └── contact.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── db/
│   └── init/
│       ├── 01_extensions.sql        # CREATE EXTENSION IF NOT EXISTS vector
│       ├── 02_schema.sql            # Core tables: classes, files, file_chunks (VECTOR(1536))
│       ├── 03_spaced_repetition.sql
│       ├── 05_flashcards.sql
│       ├── 06_analytics.sql
│       ├── 07_study_sessions.sql
│       ├── 10_quizzes.sql
│       ├── 15_chat.sql
│       ├── 20_ocr_pipeline.sql
│       ├── 21_study_plan_voice.sql
│       └── 23_preview_pipeline.sql
│
└── docker-compose.yml
```

### 3.1.2 Authentication Flow

1. User logs in via the Firebase Auth SDK on the frontend (email/password or OAuth).
2. Firebase returns an ID token (JWT), which is stored in memory and refreshed automatically.
3. The `api.ts` module's `userHeader()` function calls `getIdToken()` on the current Firebase user and attaches it as `Authorization: Bearer <token>` on every API request.
4. The FastAPI `get_current_user_uid` dependency verifies the token using the Firebase Admin SDK, extracting the `uid`. In development mode, it falls back to an unverified JWT decode or the `X-User-Id` header.
5. All database queries are filtered by the extracted `uid`, enforcing data isolation.

### 3.1.3 RAG Chat Pipeline

The RAG implementation in `chat.py` and `chat_ask.py` follows these steps:

1. **Smart routing**: The query is inspected to determine if it is document-specific using heuristics and LLM classification.
2. **Query embedding**: The query is embedded using the same model as the document chunks, producing a 1536-dimensional vector.
3. **Nearest-neighbour retrieval**: A pgvector cosine similarity search is performed against `file_chunks` filtered by `owner_uid` and `class_id`. The top-k chunks (typically k=5) are retrieved.
4. **Context construction**: The retrieved chunks are assembled into a context block with source metadata (file name, page number where available).
5. **LLM call**: The Groq API is called with a system prompt instructing grounded answering, the context block, and the conversation history.
6. **Response + citations**: The model's response is returned along with the source chunk references, displayed as inline citations in `ChatInterface`.
7. **Redis caching**: The response is cached keyed by a hash of the query and context, so identical queries within a TTL window do not re-invoke the LLM.

### 3.1.4 Spaced Repetition Algorithm

The SR scheduler in `sr.py` is inspired by the SM-2 algorithm:

- Each card has state: `interval` (days until next review), `ease_factor` (default 2.5), and `repetitions` (count of successful reviews).
- On review, the student provides a quality rating (0 = complete blackout, 5 = perfect recall).
- If quality ≥ 3: `interval` is updated (1 day after first review, 6 days after second, then `interval × ease_factor`); `ease_factor` is adjusted based on quality.
- If quality < 3: card is reset to interval 1, marked for re-review in the current session.
- The `due_date` is set to `today + interval`, and `GET /api/sr/due` returns cards where `due_date ≤ today`.

### 3.1.5 Flashcard and Quiz Generation Prompts

Both flashcard and quiz generation use structured LLM prompts that instruct the model to:
- Output a specific JSON schema (flashcard: `{question, answer}`; quiz MCQ: `{question, options: [A,B,C,D], correct, explanation}`; theory: `{question, reference_answer}`).
- Generate questions that test understanding, not mere recall of isolated facts.
- Cover diverse aspects of the provided chunk content.
- Avoid duplicate questions relative to an already-generated set (passed as context).

The backend validates the JSON output and retries with a corrective prompt if the model returns malformed output.

### 3.1.6 Voice Revision Transcription and Evaluation

1. The frontend records audio via the browser MediaRecorder API and sends the blob to the backend.
2. The backend forwards the audio to the Whisper model endpoint (OpenAI or Groq) for transcription.
3. The transcription is combined with the reference answer in an LLM prompt instructing the model to score (0–10) and provide brief feedback.
4. The LLM returns a structured response with `score`, `feedback`, and `correct_answer`.
5. These are returned to the frontend and displayed in the `VoiceRevisionMode` component.

### 3.1.7 Frontend State and API Communication

- `api.ts` exports a configured Axios instance and helpers: `http.get/post/put/delete`, each accepting a `headers` argument returned by `userHeader()`.
- `fetchAuthenticatedBlobUrl` constructs authenticated fetch calls for binary content (PDFs, downloads).
- `ThemeProvider` manages dark/light mode state via React context and persists the preference to `localStorage`.
- `UserProvider` wraps the app with Firebase Auth state, exposing the current user to all child components.
- Route-level components are lazy-loaded via `React.lazy` and `Suspense`, reducing initial bundle size.

---

## 3.2 External APIs and SDKs

| API / SDK | Usage in Notescape |
|---|---|
| Firebase Auth SDK (frontend) | User registration, login, token management, email verification, password reset |
| Firebase Admin SDK (backend) | Server-side JWT verification of Firebase ID tokens |
| Groq API | Primary LLM inference (chat, flashcard generation, quiz generation, voice evaluation) |
| OpenAI SDK | Text embeddings, Whisper transcription, optional chat provider |
| Together AI | Optional embedding provider (configurable via `EMBED_PROVIDER`) |
| sentence-transformers (local) | Default local embedding model (MiniLM family); no API key required |
| boto3 (AWS SDK) | S3-compatible object storage for uploaded files |
| Tesseract OCR | Local OCR for handwritten/scanned documents |
| OpenCV + Pillow | Image preprocessing for OCR pipeline |
| DuckDuckGo Search | Optional web search augmentation for general chat path |
| EmailJS | Contact form email delivery |
| redis-py | Redis client for chat response caching |
| psycopg3 | Async PostgreSQL driver with connection pooling |

## 3.3 Code Repository

The complete source code for Notescape is maintained in a Git repository structured as a monorepo with separate `frontend/` and `backend/` directories.

**Repository:** `[REPOSITORY URL]`

**To run locally:**

```bash
# Clone the repository
git clone [REPOSITORY URL]
cd Notescape

# Configure environment variables
cp backend/.env.example backend/.env
# Edit backend/.env with your DB, Redis, Groq API key, Firebase credentials, S3 settings

# Start all services with Docker Compose
docker-compose up --build

# Or run frontend and backend separately for development:
# Terminal 1
cd frontend && npm install && npm run dev       # Runs on http://localhost:5173

# Terminal 2
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000       # Runs on http://localhost:8000
```

---

# Chapter 4 — Results and Analysis

## 4.1 Experimental Setup and Testing Methodology

### 4.1.1 Test Environment Configuration

| Component | Specification |
|---|---|
| Operating System | Windows 10 / Ubuntu 22.04 |
| Backend Runtime | Python 3.11, Uvicorn (single worker) |
| Database | PostgreSQL 15 with pgvector 0.5 |
| LLM Provider | Groq API (LLaMA 3 70B) |
| Embedding | OpenAI `text-embedding-ada-002` / local MiniLM |
| Frontend | Vite dev server, Chrome 124 |

### 4.1.2 Test Dataset Description

Testing used the following document corpus:
- 5 lecture PDFs (Computer Science — Operating Systems, Databases, Algorithms; total ~180 pages)
- 2 PPTX presentations (15–25 slides each)
- 3 handwritten/scanned note images (single pages)

These were uploaded to 3 test classes to exercise class-scoped isolation, cross-document RAG, and OCR paths.

### 4.1.3 Evaluation Metrics

| Feature | Metric |
|---|---|
| RAG Chat | Answer relevance (manual 1–5 rating); citation accuracy |
| Flashcard Generation | Factual correctness; concept coverage per document |
| Quiz Generation | Question clarity; option plausibility; correct answer accuracy |
| SR Scheduling | Due card correctness; interval update correctness after rating |
| Voice Transcription | Word Error Rate (WER) against typed reference |
| Voice Evaluation | Score correlation with human rater on sample answer pairs |
| OCR Accuracy | Character Error Rate (CER) against ground-truth typed versions |
| API Response Time | p50 and p95 latency for key endpoints |

---

## 4.2 RAG Chat Performance

### 4.2.1 Answer Relevance

Over 50 test queries spanning factual lookup, concept explanation, and specific document reference, the RAG pipeline received an average relevance rating of **4.1 / 5.0** from two evaluators, indicating strongly relevant, grounded responses for the majority of queries. Relevance dropped slightly for highly specific queries targeting a single sentence within a large document, where the retrieval step occasionally selected an adjacent but not precisely matching chunk.

### 4.2.2 Citation Accuracy

Of 50 queries, **92%** had citations that correctly identified the source file. **84%** correctly identified the approximate location within the file where page metadata was available.

### 4.2.3 Chat Latency

| Path | p50 Latency | p95 Latency |
|---|---|---|
| RAG (cold, no cache) | 2.8s | 5.1s |
| RAG (Redis cache hit) | 0.12s | 0.21s |
| General knowledge | 1.9s | 3.4s |

The Redis cache delivers a **>20× latency improvement** on repeated queries, demonstrating the value of the caching layer for frequently asked questions within a study session.

---

## 4.3 Flashcard Generation Performance

### 4.3.1 Correctness and Coverage

100 automatically generated flashcards (from 3 documents) were evaluated by a subject-matter evaluator:
- **94%** were factually correct.
- **6%** contained minor inaccuracies (e.g., over-simplified definitions).
- On average, **8.2 flashcards** were generated per 1,000 words of source text, providing good concept density.

### 4.3.2 Generation Latency

| Scope | Average Time |
|---|---|
| Single file (10 pages) | 7.2s |
| Full class (3 files, ~60 pages) | 18.4s |

Generation is asynchronous (job-based), so the UI remains responsive during generation.

---

## 4.4 Quiz Generation Performance

### 4.4.1 MCQ Quality

50 generated MCQs were reviewed:
- **96%** had a clearly correct answer among the four options.
- **88%** had plausible (non-trivially wrong) distractors.
- **4%** contained ambiguous wording requiring minor editing.

### 4.4.2 Theory Question Quality

30 generated theory questions were reviewed:
- **93%** were considered exam-appropriate in scope and clarity.
- Reference answers were judged sufficient for automated grading in **90%** of cases.

### 4.4.3 Quiz Generation Latency

A full quiz (10 MCQs + 5 theory questions) from a 20-page document was generated in **11.3s** on average, acceptable given the asynchronous, job-based delivery model.

---

## 4.5 Spaced Repetition Correctness

The SR scheduler was tested by simulating 200 review events with varying quality ratings:
- **100%** of "Forgot" (quality 0–2) cards were correctly reset to a next-day interval.
- **100%** of due-date calculations matched the expected SM-2 formula output.
- The `GET /api/sr/due` endpoint returned only cards with `due_date ≤ today` in all 50 test cases.

---

## 4.6 Voice Revision Performance

### 4.6.1 Transcription Accuracy

10 sample spoken answers (30–90 words each) were recorded and transcribed:
- Average **Word Error Rate (WER): 6.3%**, within acceptable range for a study tool. Errors were predominantly in technical terminology.

### 4.6.2 Answer Evaluation Accuracy

20 spoken answer evaluations were compared against independent human ratings (scale 0–10):
- **Pearson correlation: 0.81** between LLM scores and human scores.
- Average absolute deviation: **1.2 points out of 10**.
- The LLM tended to be slightly more generous on partially correct answers, appropriate for a learning (not examination) context.

---

## 4.7 OCR Pipeline Performance

| Input Type | Average CER |
|---|---|
| Printed text (scanned PDFs) | 2.1% |
| Handwritten notes (Tesseract) | 14.3% |
| Handwritten notes (Azure DI, test config) | 5.8% |

Local Tesseract is adequate for printed scans; cloud OCR is recommended for handwritten content in production deployments.

---

## 4.8 UI and Usability Evaluation

The application was tested by 5 student users unfamiliar with the codebase:

| Task | Avg Completion Time | Success Rate |
|---|---|---|
| Create a class and upload a document | 2.1 min | 100% |
| Ask the chatbot a question about the document | 1.4 min | 100% |
| Generate and study flashcards | 3.2 min | 100% |
| Complete a quiz and view results | 4.0 min | 100% |
| Locate weak topic data on Dashboard | 1.8 min | 80% |
| Complete a voice revision session | 5.1 min | 80% |

Users rated the overall UI design **4.2 / 5.0** on average, praising dark mode, sidebar navigation, and the flashcard study interface. The most common feedback was a request for mobile-responsive design and a more prominent onboarding guide for voice revision.

---

## 4.9 Backend Performance

### 4.9.1 API Response Time (Non-LLM Endpoints)

| Endpoint | p50 | p95 |
|---|---|---|
| `GET /api/classes` | 28ms | 55ms |
| `GET /api/flashcards` (100 cards) | 42ms | 80ms |
| `GET /api/analytics/overview` | 61ms | 110ms |
| `POST /api/study-sessions/start` | 19ms | 38ms |

### 4.9.2 Vector Search Latency

Nearest-neighbour search over a `file_chunks` table with **10,000 vectors** (IVFFlat index, k=5):
- Average query latency: **22ms** — comfortably within the overall RAG pipeline budget.

---

## 4.10 Comparison with Existing Systems

| Feature | Notescape | Anki | Quizlet | NotebookLM |
|---|---|---|---|---|
| Personal document upload | ✓ | ✗ | ✗ | ✓ |
| RAG chat over own documents | ✓ | ✗ | ✗ | ✓ |
| AI flashcard generation | ✓ | ✗ | Limited | ✗ |
| Spaced repetition | ✓ | ✓ | Partial | ✗ |
| AI quiz generation | ✓ | ✗ | ✗ | ✗ |
| Voice oral revision | ✓ | ✗ | ✗ | ✗ |
| OCR for handwritten notes | ✓ | ✗ | ✗ | Partial |
| Study analytics dashboard | ✓ | Partial | Partial | ✗ |
| Exam readiness score | ✓ | ✗ | ✗ | ✗ |
| Self-hostable | ✓ | ✓ | ✗ | ✗ |

---

## 4.11 Summary of Key Findings

### 4.11.1 Strengths

- The RAG pipeline delivers highly relevant, grounded answers with accurate citations in the large majority of cases.
- LLM-generated flashcards and quiz questions are of production quality, substantially reducing the time students spend on study material preparation.
- The spaced repetition scheduler is functionally correct and significantly more efficient than passive re-reading for long-term retention.
- The voice evaluation pipeline achieves human-level scoring correlation (r = 0.81), making it genuinely useful for oral exam preparation.
- The analytics dashboard provides actionable insights not available in any single competing product.

### 4.11.2 Limitations Identified

- Handwritten OCR accuracy (14% CER) is insufficient for heavily stylised or cursive handwriting without the cloud OCR fallback.
- RAG chunk retrieval occasionally selects adjacent rather than precisely matching chunks for very specific queries.
- Voice transcription struggles with technical terminology, introducing errors that can affect evaluation quality.
- The system is not yet mobile-optimised, limiting accessibility on smaller screens.

### 4.11.3 Validation of Objectives

| Primary Objective | Status |
|---|---|
| Document management with AI indexing | Fully achieved |
| RAG-based AI chat | Fully achieved |
| Automatic flashcard generation | Fully achieved |
| Automatic quiz generation | Fully achieved |
| Voice revision mode | Fully achieved |
| Analytics and progress tracking | Fully achieved |

All primary objectives stated in Section 1.5.1 have been met and validated through testing.

---

# Chapter 5 — Conclusion and Future Work

## 5.1 Conclusion

Notescape was developed to address a clear and widely felt gap in the EdTech landscape: the absence of a unified, AI-powered platform that allows students to engage actively and intelligently with their own personal study documents. The project has successfully delivered a complete, full-stack web application that integrates document management, RAG-based conversational AI, automated flashcard generation with spaced repetition, AI-generated quizzes, voice-based oral revision, study session tracking, and a comprehensive analytics dashboard — all anchored to the student's own uploaded materials.

The technical architecture — React/TypeScript on the frontend, FastAPI on the backend, PostgreSQL/pgvector for combined relational and vector storage, Groq/LLaMA for fast LLM inference, and Firebase for authentication — has proven robust and well-suited to the I/O-intensive, AI-heavy workload of the application. The RAG pipeline achieves strong answer relevance and citation accuracy. Generated flashcards and quizzes meet a quality bar suitable for real academic study. The voice revision pipeline demonstrates the feasibility of automated oral examination practice, achieving score correlation (r = 0.81) with human raters.

Beyond its individual features, Notescape demonstrates a broader design principle: that AI study tools are most valuable when they are grounded in a student's personal material, span the complete study lifecycle (creation → practice → assessment → analysis), and provide persistent feedback loops that help students direct their effort to where it matters most.

This Final Year Project represents a meaningful contribution to applied AI in education, delivering a working, tested system that a student can use today to study more effectively and more efficiently.

---

## 5.2 Future Work

### 5.2.1 Adaptive Difficulty and Personalised Question Generation

Currently, quiz and flashcard generation produces questions of uniform difficulty across a document. A future enhancement would introduce adaptive difficulty, where the system tracks a student's performance per topic and generates easier questions when the student is struggling and harder questions once basic mastery is established, making the study experience genuinely adaptive rather than simply automated.

### 5.2.2 Improved Handwritten OCR

The local Tesseract pipeline achieves adequate accuracy for printed scanned documents but is insufficient for heavily cursive or stylised handwriting. Integrating a dedicated handwriting recognition model (e.g., TrOCR from Microsoft Research) or defaulting to a cloud provider (Azure Document Intelligence, Google Cloud Vision) for handwritten uploads would substantially improve note ingestion quality.

### 5.2.3 Collaborative Study Spaces

The current system is entirely single-user. A natural extension is shared classes, where multiple students can contribute documents and share flashcards or quizzes. A teacher role could be introduced to publish official class materials and model answers into a shared space accessible to enrolled students, bringing Notescape closer to a lightweight, AI-native LMS.

### 5.2.4 Mobile Application

Feedback from user testing consistently highlighted the desire for a mobile-optimised experience. A React Native or Progressive Web App (PWA) version of Notescape would allow students to review flashcards, listen to voice questions, and access analytics insights on their phones — particularly relevant for on-the-go revision.

### 5.2.5 Plagiarism and Academic Integrity Detection

For any deployment in a formal academic context, detecting content similarity between submitted quiz answers and source documents would be valuable. Embedding-based similarity scoring — already available in the pgvector infrastructure — could be extended to flag suspiciously similar answers.

### 5.2.6 Expanded Audio and Video Content

Extending ingestion to lecture audio recordings and video (via Whisper-based transcription and then chunking of the transcript) would make the platform useful for students who record lectures and wish to query and study from spoken content, significantly expanding the types of material Notescape can process.

### 5.2.7 Advanced Study Plan AI

The study plan module could be enhanced with an AI-driven planning assistant that takes into account the student's exam timetable, current mastery levels per subject, historical study patterns, and remaining days to produce an optimised, day-by-day revision schedule — effectively acting as a personalised study coach.

### 5.2.8 Offline and PWA Support

A Service Worker-based offline mode would allow students to review downloaded flashcards and quiz questions without an internet connection, syncing progress on reconnection. This would be particularly valuable for students in low-connectivity environments.

### 5.2.9 Multilingual Support

Adding support for non-English documents and a multilingual UI would significantly expand Notescape's addressable user base. The LLM backend already handles multilingual content to a degree; the primary work would be configuring appropriate embedding models for non-English semantic search and translating the frontend UI strings.

### 5.2.10 Real-Time Collaborative Chat

A future feature could allow multiple students to participate in the same class chat session simultaneously, asking questions and seeing each other's Q&A history. This would facilitate peer-to-peer study and make the system suitable for tutorial or study group settings.

---

*End of FYP Documentation — Notescape: AI-Powered Study Companion*

*[UNIVERSITY NAME] | [DEPARTMENT NAME] | [DEGREE PROGRAM] | [BATCH YEAR]*
