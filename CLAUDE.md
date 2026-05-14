# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Philosophy

**Build from core outward, one phase at a time.** Phases and their order will be decided in planning sessions — do not assume or proceed ahead speculatively.

### Rules for each phase
- **Run the service** at the end of each phase so the user can test it live.
- **Document every API endpoint** created in that phase — method, path, request body, response shape, and what it does — so the user can test in Postman. Present the list clearly after each phase, e.g.:
  ```
  POST /api/rag/upload-book     → triggers RAG pipeline for uploaded PDF
  GET  /api/rag/status/{job_id} → returns pipeline job status
  ```
- If an endpoint requires auth, specify what token/header to use.
- Do not move to the next phase until the user explicitly says to continue.
- If the user reports a bug or missing behaviour, fix and re-run before moving on.

---

## Service Architecture

Monorepo with four independent services (no shared packages between them):

```
hamroguru-platform/
├── frontend/        # React (student, admin, affiliation UIs)
├── main_backend/    # FastAPI (auth, payments, community, profiles, referrals)
├── ai_service/      # FastAPI + LangGraph + OpenAI Agents SDK (all AI/tutor logic)
└── worker/          # Celery (background jobs: daily capsule generation, end-of-day updates, summaries)
```

Each service has its own dependencies and is deployed independently. Do not create shared utility packages across services.

---

## Development Commands

### Frontend (`frontend/`)
```bash
npm install          # install dependencies
npm run dev          # start dev server
npm run build        # production build
npm run lint         # lint
```

### Main Backend (`main_backend/`)
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload          # dev server (port 8000)
alembic upgrade head                   # run migrations
alembic revision --autogenerate -m ""  # create migration
pytest                                 # run all tests
pytest tests/path/to/test.py::test_fn  # run single test
```

### AI Service (`ai_service/`)
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001   # dev server (port 8001)
pytest
pytest tests/path/to/test.py::test_fn
```

### Worker (`worker/`)
```bash
pip install -r requirements.txt
celery -A worker.celery_app worker --loglevel=info   # start worker
celery -A worker.celery_app beat --loglevel=info     # start scheduler
```

---

## Environment Variables

All credentials are in the root `.env` file. Keys used:

| Key | Service |
|-----|---------|
| `DATABASE_URL` | Azure PostgreSQL connection string |
| `PINECONE_API_KEY` | Pinecone vector DB |
| `OPENAI_API_KEY` | OpenAI (AI service) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis |
| `R2_ACCOUNT_ID` | Cloudflare R2 |
| `R2_ENDPOINT` | Cloudflare R2 |
| `R2_TOKEN_VALUE` | Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 |
| `R2_BUCKET_NAME` | Cloudflare R2 |

**Never use placeholder credentials.** All needed credentials are already in `.env`. If a new external service is required, ask the user to add its key to `.env` before using it.

---

## AI Service Architecture

The AI service has three layers:

1. **Agent layer** — OpenAI Agents SDK for per-agent runtime; LangGraph for orchestration
2. **RAG layer** — Pinecone for retrieval; Cloudflare R2 for note PDF storage
3. **Memory / state layer** — personalization summaries and consultant's preparation timeline

### Agents

| Agent | Role |
|-------|------|
| Tutor (per subject) | Teaches, answers questions, follows consultant instructions |
| Capsule agent (per subject) | Generates daily capsule after day ends; uses today's session data |
| Practice agent (per subject) | Selects questions from pool, evaluates, handles follow-ups |
| Consultant agent | Plans full preparation timeline, consults on study strategy, career guidance, motivates, web-searches for college recommendations, coordinates all agents |
| Personalization agent | Generates and updates all summaries (daily, weekly, all-time) and session memory at end of day and on schedule |
| Referral content agent | Generates social media posts with referral links |

All subject agents (tutor, capsule, practice) share personalization context for the same subject. The consultant agent has read access to all agents' chat and practice performance.

### Personalization (Core Priority)

This is the most important part of the platform. Every agent must receive the appropriate personalization context before responding.

#### Context passed to tutor and practice agents (per subject)

- Student's overall summary (goals, personality, learning style, past academic background)
- Subject-wise all-time summary (performance, strong/weak topics, best teaching methods for this student)
- Subject-wise weekly summary (last 7 days summary)
- Subject-wise daily summary of the previous day
- Syllabus structure for the relevant chapter only (not whole subject)

#### Context passed to daily capsule agent (per subject)

Same as tutor/practice agents, except replace the previous day's daily summary with **today's** daily summary — because the capsule is generated after the study day ends and must reflect what happened that day.

#### Context passed to consultant agent

- Student's overall summary
- All-time subject summaries for all subjects
- Weekly summaries for all subjects
- Current preparation timeline
- Today's session summary from each subject (if any)

#### Summary types

All summaries are **free-form LLM-generated text**, not fixed database fields. This allows unlimited parameters without schema changes.

**Overall student summary** (not subject-specific):
- Student's goals, stream choice, and future ambitions
- Personality and general learning style
- Past academic performance across all subjects
- General strengths and weaknesses

**Subject-wise all-time summary** (updated weekly):
- Past academic performance in that subject
- Average score in that subject
- Topics with good and bad performance
- How the student is progressing in that subject
- Topics with most difficulties
- Which teaching methods work best for this student in this subject
- Updated each week by reading the new week's daily summaries and the previous all-time summary together, so the LLM incorporates new data into the previous context

**Subject-wise weekly summary** (regenerated daily):
- Covers the same dimensions as the daily summary but rolled up from the last 7 daily summaries
- Regenerated every day by reading the last 7 daily summaries — not accumulated, fully regenerated each time

**Subject-wise daily summary** (generated at end of day by Personalization agent):
- Topics covered that day (one line)
- Average practice score for those topics
- Which topics/question types were answered wrong
- Any confusion from follow-up questions in daily capsule, practice, or notes — what confusion existed and whether it was resolved
- From tutor chat: what confusion the student had and which type of answer helped them understand (uses session memory, not full chat log, as input)

Inputs used to generate daily summary:
- Session memory of that day's tutor chat
- All practice session summaries from that day
- Summary of consultant chat from that day (if any)
- Summary of any mock tests taken that day

**Session memory** (per tutor chat session, maintained by Personalization agent):
- Starts being generated after the 5th message in a session
- Updated after every 3 new messages after that
- Chat context window = last 3 messages (1 message = 1 student question + 1 AI answer)
- Purpose: keep tutor context rich without feeding the full chat log

#### Consultant chat contribution to summaries

After end of day, the Personalization agent reads the consultant chat summary and decides:
- Is there anything to add to the overall student summary?
- Is there anything to add to any subject's all-time summary or daily summary?
- Does anything in the chat require a timeline change?

If the student asks to change the plan directly during a consultant chat, the consultant agent updates the timeline **immediately** without waiting for end-of-day processing.

### RAG Pipeline

The RAG pipeline processes **text-only RAG notes** — not original books. RAG notes are pre-generated by the admin/developer from the original books and uploaded chapter by chapter. They contain all important points, and subjective questions from the original book are converted to objective format. No images are stored — where an image is essential, a text description is written in its place.

**Why text-only RAG notes instead of original books:**
- The RAG layer exists so the tutor knows what topics and concepts are in the course and what examples are used — it does not need the full book.
- LLMs process and retrieve from clean text far more reliably than from image-heavy PDFs.
- Text descriptions of images are sufficient and eliminate image processing costs.
- Converting subjective questions to objective format reduces confusion since students are preparing for objective exams.

**Upload flow (admin panel):**
1. Admin uploads a RAG note file (text/markdown) and selects subject and chapter.
2. Pipeline chunks the note by the subject's chapter/topic/subtopic structure already in the system.
3. LLM semantic refinement — each chunk = one complete learning concept.
4. Embed and upsert to Pinecone with metadata.

**Pinecone metadata fields:** `note_id`, `subject`, `chapter`, `topic`, `subtopic`, `chunk_type` (explanation/example/objective_question), `difficulty`.

No images are stored in R2 for RAG purposes. R2 is used only for student-facing note PDFs.

### Subject Structure System

The system has a pre-built chapter/topic/subtopic structure for each subject. This is used by:
- **RAG retriever** — to determine which chapters/topics to fetch based on the student's question
- **RAG pipeline** — to classify each chunk's chapter/topic/subtopic during ingestion
- **Practice and mock test generation** — to select questions by chapter/topic in correct ratios

**Placeholder:** The structure files are not yet uploaded. Admin will upload the formatted structure (containing all chapters, topics, and subtopics per subject) later. The system will be built to load and use these structures when uploaded.

---

## Worker (Celery) Jobs

Scheduled jobs include:
- **End-of-day processing** — triggered after each day's study window ends: generate daily summaries, update session memories, generate daily capsules (per student per subject), update dynamic notes
- **Weekly summary regeneration** — runs daily, regenerates each subject's weekly summary from the last 7 daily summaries
- **All-time summary update** — runs weekly, updates all-time subject summaries by reading new daily summaries + previous all-time summary

---

## Key Design Decisions

- **No shared packages between services** — each service is fully self-contained.
- **Manual payments** — students pay via QR, admin approves in panel. System tracks status only; no payment gateway.
- **Personalization via LLM summaries, not fixed fields** — allows unlimited parameters per student without schema migrations.
- **Consultant's preparation timeline is the single source of truth** for the preparation plan; all agents follow it. Consultant can update it immediately on student request, or at end of day via Personalization agent.
- **Notes are level-based, not individually personalized** — 3 levels (Level 1: strong foundation, Level 2: average, Level 3: weak foundation). Whole note set for a level is rendered when a student's level is assigned. This avoids wasting tokens generating near-identical notes per student and allows rich PDF format with figures and diagrams.
- **Questions are pre-generated and uploaded as JSON** — not generated on the fly by the AI. This ensures quality control and allows fast random selection from a large pool.
- **RAG uses text-only notes, not original books** — higher retrieval quality, zero image processing cost, no ambiguity from subjective questions.
- **Tutors exist only for the 4 main subjects** — Compulsory English, Compulsory Mathematics, Compulsory Science, Optional Mathematics. Extra subjects (GK, IQ, Computer Science) have practice/mock test questions only.
- **Daily capsule is generated after the day ends** — so it reflects actual confusion and weak points from that day's activity, not a pre-generated prediction.

---

# HamroGuru — Product Details

## Overview

This is a personalized tutoring platform for students who have just given their SEE exams, so that they can prepare for class 11 entrance exams, improve their understanding for +2 level courses, and get consultation about +2 studies, including which branch and which college to choose.

## Main Jobs

1. Prepare students for class 11 entrance exams.
   - Help them revise and understand more deeply the course they have already studied till class 10.
   - Plan the preparation.
   - Help them understand required new concepts without overloading them with +2 syllabus that is never asked in the entrance exam, but institutes have been teaching just to continue their business.
   - Consult them about the future study plan, since the tutor will know the student very well through the course of preparation.

2. Update their knowledge and understanding for +2.

3. Consult them about +2, including which branch and which college to choose.

## Core Philosophy

The heart of this platform is personalization.

There are many learning platforms and AI chatbots that can answer any type of question, but they lack personalization, so they cannot guide the student as a personal tutor.

They do not know:
- the student's academic ability,
- weaknesses,
- strengths,
- what the student learned today,
- how performance was,
- what type of questions were wrong,
- what the student's learning approaches are.

But in reality, each student is unique, with different goals, methods, abilities, and circumstances. So for optimal outcomes of their efforts, tutoring must be personalized.

This platform is intended to provide each student with a personal teacher which will teach each subject, solve problems, take tests, evaluate, consult them about how to study, and use appropriate approaches to tutor the student.

So the AI part is the most important part to focus on in terms of quality.

The tutor must know everything about the student and should tutor accordingly.

---

## Technical Details

### Frontend
Frontend will include:
- admin panel,
- student interface,
- affiliation user interface.

Technology: React

#### Admin Panel
Admin panel is the interface for admin. It should contain all required control functionality, such as:
- discount rate to student,
- referral commission rate,
- current paid subscription price,
- free trial duration,
- analytics such as:
  - number of free users,
  - paid users,
  - referral partners,
  - students per stream,
  - students per college,
- viewing each student's details and taking action,
- community posts,
- push notifications to all students or selected categories,
- management of affiliated partners,
- upload level-based notes (PDF) per subject, chapter, and level,
- upload RAG notes (text) per subject and chapter (triggers RAG pipeline),
- upload MCQ question sets (JSON) per subject and chapter,
- add and manage extra subjects (GK, IQ, etc.) and upload their questions,
- add and manage colleges (name, exam format, number of questions per subject, total time),
- set per-question time by subject and difficulty (easy / medium / hard),
- and other related control features.

#### Student Interface
Student interface will be the learning interface for students.

#### Affiliation Interface
Affiliation interface will be for referral / affiliation users.

### Main Backend
Technology: FastAPI

Main backend will manage all backend services.

### AI Core
Technology: FastAPI, LangGraph, OpenAI Agent SDK

- OpenAI Agent SDK will be used for core runtime.
- LangGraph will be used for orchestration.

### Celery
Celery will be used for background jobs and schedulers.

### Managed Services
Remaining components will use managed services.

### Database
Technology: PostgreSQL  
Provider: Azure

### Vector Database
Technology: Pinecone

### Object Storage
Technology: Cloudflare R2

### Caching
Technology: Redis  
Provider: Upstash

---

## Repository / Service Structure

Same repo, separate services, and no shared packages or utils, because most of the packages and utils are different in each service.

Structure:

```text
hamroguru/
├── frontend/
├── main_backend/
├── ai_service/
└── worker/
```

---

## AI Core Layers

AI core will contain three layers:

1. Agent layer
2. RAG layer
3. Memory / state layer

---

## RAG Layer

The RAG layer processes text-only notes (not original books) uploaded by admin from the admin panel. These notes are pre-generated from the original books and uploaded chapter by chapter.

**What is a RAG note:**
- Contains all important concepts and points from the chapter.
- Subjective questions from the original book are converted to objective format.
- No images — where an image is needed, a text description is written instead.
- This ensures high-quality retrieval, zero image processing cost, and no confusion from subjective question formats.

**RAG pipeline steps:**
1. Admin uploads a RAG note file for a specific subject and chapter.
2. Pipeline chunks by the subject structure (chapters, topics, subtopics) already in the system.
3. LLM semantic refinement — each chunk = one complete learning concept.
4. Embed and upsert to Pinecone.

**Pinecone metadata fields:** `note_id`, `subject`, `chapter`, `topic`, `subtopic`, `chunk_type` (explanation/example/objective_question), `difficulty`.

No images are stored in R2 for RAG purposes. R2 is used only for student-facing level-based note PDFs.

### Chunking Strategy

#### Structure-based chunking (primary)
- Split content using the subject's pre-built chapter/topic/subtopic structure.
- Keep related content (concept + example + practice question) together.

#### Semantic refinement (LLM-assisted)
- Group paragraphs into meaningful concept-level chunks.
- Ensure each chunk represents a single learning concept.
- Pipeline determines the topic and subtopic of each chunk using the subject structure already in the system.

### Goal of Chunking
- Each chunk should be a complete, self-contained concept.
- This improves retrieval quality, tutor accuracy, and learning experience.

---

## Notes System (Level-Based)

Notes are **not individually personalized**. They are pre-generated in advance and uploaded by admin. Notes exist at 3 levels based on student academic strength:

| Level | Target Student |
|-------|---------------|
| Level 1 | Strong foundation — focus on hard topics and advanced concepts |
| Level 2 | Average — solid on basics but difficulty with hard concepts |
| Level 3 | Weak foundation — difficulty even with basic topics |

Each student is assigned a level based on their past academic history, test/practice performance, and interaction patterns. When a level is assigned, the student gets access to all notes of that level for their stream's subjects.

**Format:** One PDF per chapter. Admin uploads by selecting subject, chapter, and level. PDFs are stored in Cloudflare R2 and indexed by subject + chapter + level.

**Student interface:** A sidebar lists all chapters. Student can click any chapter and the note PDF for their level is rendered on that page.

Notes may contain figures and diagrams since they are pre-generated PDFs (not LLM output at request time).

---

## Questions and MCQ Pool

All MCQ questions are **pre-generated and uploaded** by admin as JSON files — not generated on the fly. This allows quality control and fast retrieval.

### Question Schema

```json
{
  "question_id": "cs_ch1_q_001",
  "question_text": "Which symbol represents a decision in a flowchart?",
  "question_image": {
    "url": null,
    "caption": null
  },
  "options": [
    { "id": "A", "text": "Oval" },
    { "id": "B", "text": "Diamond" },
    { "id": "C", "text": "Rectangle" },
    { "id": "D", "text": "Parallelogram" }
  ],
  "correct_option_ids": ["B"],
  "explanation": "Diamond represents a decision symbol in a flowchart.",
  "difficulty": "easy",
  "class_level": 10,
  "subject": "computer_science",
  "chapter": "flowchart",
  "topic": "flowchart_symbols",
  "subtopic": "decision_symbol",
  "tags": ["mcq", "flowchart", "symbol_identification"],
  "skill": "concept_identification",
  "learning_objective": "Understand flowchart symbols and their meanings",
  "common_mistakes": {
    "A": "Confuses start/end with decision",
    "C": "Confuses process with decision"
  },
  "is_active": true,
  "version": 1
}
```

All questions are MCQ (1 mark, no negative marking). Image fields are null in Phase 1.

**`class_level` field:** Optional integer (9 or 10). Indicates which class's curriculum the question belongs to. Omit or set to `null` for questions that apply to all classes. Used to filter questions per college — some colleges ask only from class 10, others from both class 9 and 10. See `class_level_distribution` on the college model.

### Question Generation Phases

**Phase 1 (current):**
- Admin generates questions as JSON (no images, image fields set to null).
- Uploads via admin panel, chapter by chapter.
- System stores in database and serves from there.

**Phase 2 (future, not to be built now):**
- A pipeline will auto-generate new questions with real image references (store image in R2, get URL, inject into JSON).
- Will be built later after platform is in production.

### Database Storage

Hybrid design per question:
- **Important filtering fields as columns:** `question_id`, `subject`, `chapter`, `topic`, `subtopic`, `difficulty`, `class_level`, `is_active`, `version`
- **Full question data as JSONB column:** everything else

1 question = 1 row.

### Extra Subject Questions

Extra subjects (GK, IQ, and any subject added by admin later) are stored in a **separate table** since they do not have the same chapter structure as the 4 main subjects. Admin can add extra subjects from the admin panel and upload JSON question files for them.

### Timing

- **Mock tests:** Admin sets total questions, questions per subject, total time, and optionally `class_level_distribution` when adding a new college. `class_level_distribution` is a dict like `{"9": 15, "10": 35}` specifying how many questions to pull from each class. Questions with no `class_level` are universal and can fill any class's quota. If omitted, no class filter is applied.
- **Subject practice:** Per-question time is set by admin per subject and difficulty level (easy/medium/hard). Default: 72 seconds average per question.

---

## Payment

Payment will be manual.

- Students will pay via QR.
- They will upload a screenshot of payment confirmation.
- Admin will approve manually from the admin panel by clicking an approve button.
- There will be an option to approve all pending requests at once, since almost all the time students will pay the exact amount.
- Referral feature will be there and the system will itself calculate and manage everything, but admin will do payment manually and update status to paid.

In simple words, everything is handled by the system except payment. Admin will do the payment and update the status so that the system knows about it.

---

## Onboarding

Initially, the user simply registers with name and contact verification.

Then the user will be asked whether they are:
- student, or
- affiliation partner.

This is because the platform has an affiliation program where anyone can earn by referring the platform to new users.

### If affiliation partner
- Redirect to affiliation interface.

### If student
Student will be asked:
- stream they are preparing for:
  - science, or
  - management & humanities,
- current school.

Then redirect to student interface.

### Student Profile
Profile will contain every detail of the student, including:
- class 8 to class 10 test scores,
- marksheets of final exams,

so that the tutor will have clear context of the student's academic background.

However, during registration, none of these will be asked, since students may feel uncomfortable sharing such information without even experiencing the app.

After registration, students will be prompted to complete their profile gradually over time until their profile is fully filled.

### Student Level Assignment

Each student is assigned a learning level (1, 2, or 3) based on:
- Past academic history and marksheets (from profile)
- Performance in mock tests and subject practice
- Patterns in tutor queries and session activity

Level is used to serve the appropriate note set. It can be updated over time as new data comes in. Level assignment is handled by the Personalization agent.

### Initial Mock Test Recommendation
For the first mock test, the student will also be prompted to take a mock test first.

The consultant agent will also ask the student to do so if it does not get any mock test and profile data, but it will not be mandatory.

The agent will recommend it, but if the student says they will do it later, it will continue with currently available data, since later it keeps updating the timeline based on the student's performance.

---

## Referral System

Both users registered as affiliation partner and as student can refer.

For students:
- there will be a big, visible refer button in the student interface,
- when student clicks it, they will be redirected to the affiliation user interface,
- so that the learning platform and referral part remain separated.

Users will add their payment details:
- account information to receive payment,
- QR.

They can refer by generating referral links.

This referral system will be advanced. There will be an agent which will generate content to post.

If the user wants to post on their social media to recommend the platform, it will:
- take the page URL where the user is going to post,
- use past post history and the user's request,
- generate posts which the user can simply post to social media accounts,
- include the referral link.

Students who sign up with referral will get extra discount.

---

## Features

### 1. Tutor for Each Subject

Tutors exist only for the **4 main subjects**: Compulsory English, Compulsory Mathematics, Compulsory Science, and Optional Mathematics. For science stream, all 4 subjects have tutors. For management stream, only Compulsory English and Compulsory Mathematics have tutors.

Each subject's tutor section contains:

#### a. Tutor
- Tutor in chatbot form.
- Uses personalization context (overall student summary + subject all-time summary + weekly summary + previous day's daily summary + relevant chapter syllabus).
- Session memory keeps context manageable without feeding full chat logs.

#### b. Notes (Level-Based)
- Sidebar shows all chapters of the subject.
- Student can click any chapter to view the note PDF for their assigned level.
- Notes are pre-generated and uploaded by admin — not generated per student.
- May contain figures and diagrams.
- Downloadable as PDF.

#### c. Daily Capsule
Daily capsule is individually personalized and generated **after the day ends** (by end-of-day worker job). It is a short cheat-sheet type summary for the student.

Content is based on that day's data:
- Key points student struggled with or needs to recall.
- Concepts where confusion was observed.
- Questions answered wrong in practice.
- Personalized instructions for the student based on the day's performance.

Students can:
- See the history of capsules for each day.
- Access history in ChatGPT format, choosing any day from sidebar.
- See not only the initial capsule but the whole chat for that day.

In chat, student can ask any type of question about that day's content.

Daily Capsule also contains a second tab: **Resources**

##### Resources tab
Agent lists the best resources for that topic from the internet — YouTube videos and other helpful resources — filtered and listed with each day's capsule.

#### d. Practice (Subject Practice)
Practice has a chapter-browser sidebar. Student can navigate to any chapter and create a practice session for that chapter.

On opening the practice section, the student is directed to the chapter planned for that day (from the consultant's timeline), but can freely choose any chapter via the sidebar.

Practice setup per session:
- Number of questions.
- Timer option.
- Optional message field (e.g., "focus on hard questions only").
- Submit button.

Questions are selected from the pre-uploaded question pool for that chapter, in appropriate ratios by topic/difficulty.

After submission:
- Score shown.
- Correct options shown.
- Explanations shown.

Follow-up mode:
- "Follow up" button at bottom right.
- Student can ask follow-up questions about the questions or explanations.
- After follow-up, student can start a new practice session.

**Practice history:**
- History is stored per chapter.
- Each practice session generates a session summary after the student closes it (because the student may still be in follow-up before closing).
- Session summary contains: total questions solved, correct/incorrect count, topics with most wrong answers, topics with most right answers.
- Multiple sessions in one chapter each have their own summary stored.
- Summaries are used by the Personalization agent to generate daily summaries and by the Capsule agent for daily capsule generation.

#### Downloadable PDFs
The following are provided in downloadable PDF format:
- Notes.
- Daily capsule.
- Practice question sets.

#### Shared Context Among Subject Agents
All three agents (tutor, capsule, practice) receive the same personalization context for the same subject, so they are all aware of the student's state in that subject.

---

### 2. Consultant (Planner + Advisor + Motivator)

The consultant agent is the advanced personal advisor for the student. It is not just a planner — it is a comprehensive consultant, motivator, and career guide.

It will:
- Build and maintain the full preparation timeline based on the student's time and goals.
- Update the plan after each day's session, taking into account practice performance, tutor chats, and student issues.
- Give instructions to other agents (tutor, capsule, practice).
- Read all agent chats and practice performance to maintain full context.
- Provide personalized improvement tips and study strategy guidance.
- Identify weak points across all subjects and proactively advise.
- Motivate students — especially those scared of hard topics or who need reassurance about their stream choice.
- Guide students to choose the right stream based on future goals, not just course difficulty. Make clear that no stream is inherently "hard" — the right match depends on the student's goals.
- Help students choose the best college for them based on their goals and the college's strengths (e.g., suggest a sports-active college to a student with sports ambitions).

**Career and college guidance:**
- Uses web search to collect up-to-date information about colleges, streams, and career paths.
- Provides recommendations based on researched data, not just internal knowledge.
- Always frames suggestions as recommendations with reasoning — never mandates. Guardrails are built in to prevent directive language.

**Timeline management:**
- Creates initial preparation timeline based on student profile and available time.
- Updates the timeline at end of day via Personalization agent.
- Can update the timeline **immediately** mid-chat if the student explicitly requests a change, without waiting for end-of-day processing.

This separate consultant agent exists so the student has one place to talk about all their issues, and those issues are automatically propagated to all other agents.

---

### 3. Community

#### a. Leaderboard
Leaderboard will show:
- Top performers in daily mock test.
- Each college leaderboard.
- Student can choose any college to take mock test; test will be in that college's format.
- Overall topper for general category.

#### b. Community
- Both students and admin can post.

#### c. Announcement
- Announcement by admin.

#### d. Notices
- Scholarship notices.
- Entrance exam related notices.
- All other required notices for students.

All of community, announcement, and notice will be like Facebook posts (text, image, link).

---

### 4. Practice & Mock Test (Global Section)

This section is separate from the subject-specific practice inside the tutor section.

Two tabs:

#### Fixed (Mock Test)
- Fixed number of questions per college format.
- Student can choose any specific college or a universal format.
- Questions selected from the main question pool and extra subject question pool as required.

#### Customizable
- Student can choose number of questions and subjects.

---

### 5. Syllabus and Past Questions of Different Colleges

This section will contain:
- Syllabus of different colleges.
- Past questions of different colleges.

---

### 6. Progress

This section will track the progress of the student.

---

### 7. Setting

Settings will contain remaining control related features.

---

## Subject Structure by Stream

In the tutor page, each subject with a tutor is shown like Google Classroom (each subject as a clickable box).

### Science Stream — Subjects with Full Tutor
- Compulsory English
- Compulsory Mathematics
- Compulsory Science
- Optional Mathematics

### Management & Humanities Stream — Subjects with Full Tutor
- Compulsory English
- Compulsory Mathematics

### Extra Subjects (Practice & Mock Test Only — No Tutor)
These subjects have MCQ question pools for mock tests but no tutor, notes, or daily capsule:
- Computer Science
- GK (social / current affairs)
- IQ

Admin can add more extra subjects from the admin panel and upload JSON question files for them. Extra subject questions are stored in a separate database table.

---

## Personalization Requirements

This is the heart of the platform and the core developer focus.

A dedicated **Personalization agent** handles all summary generation and updates. It runs at end of day (via Celery job) and on schedule.

### What tutors receive (per subject)
- Student's overall summary
- Subject-wise all-time summary
- Subject-wise weekly summary
- Subject-wise daily summary of the previous day
- Syllabus structure of the relevant chapter only

### What the consultant receives
- Student's overall summary
- All-time subject summaries for all subjects
- Weekly summaries for all subjects
- Current preparation timeline
- Today's session summaries from each subject

### Summary schedule
- **Daily summary:** generated at end of day by Personalization agent using that day's session data
- **Weekly summary:** regenerated every day from the last 7 daily summaries (fully regenerated, not appended)
- **All-time subject summary:** updated once per week by reading new daily summaries + previous all-time summary together

### Session memory
- Starts after 5 messages in a session
- Updated every 3 messages after that
- Chat context = last 3 messages
- Keeps tutor input token count manageable

---


## Port Map

| Service | Port | Start Command |
|---------|------|---------------|
| main_backend | 8000 | `cd main_backend && uvicorn app.main:app --reload` |
| ai_service | 8001 | `cd ai_service && uvicorn app.main:app --reload --port 8001` |
| worker | — | `cd worker && celery -A worker.celery_app worker --loglevel=info` |
| frontend | 3000 | `cd frontend && npm run dev` |

## Internal Auth

Services communicate using `X-Internal-Secret` header. Value = `MAIN_BACKEND_INTERNAL_SECRET` from `.env`. All internal endpoints must verify this header.

---

## Cross-Cutting Notes

- **Pinecone vectors:** Clear all existing vectors at Phase 2 start — metadata schema is incompatible with new pipeline. Use existing `delete_book_vectors` utility per book, or flush the index directly.
- **agent_type_enum:** Phase 5 migration uses `ALTER TYPE ... ADD VALUE` (not drop/recreate). Keep `planner` value — existing chat session rows reference it.
- **SSE proxy pattern:** `frontend → main_backend → ai_service`. All streaming endpoints must use `httpx.AsyncClient.stream()` + FastAPI `StreamingResponse` in main_backend. Never buffer SSE.
- **Context window:** Phase 6 hardcodes `n=6` (3 message pairs) + session memory. Do not revert to `n=10`.
- **Level default:** No StudentLevel row → serve level 2 notes. Personalization agent assigns async.
- **books → rag_notes migration:** `ALTER TABLE RENAME` in Migration 005. Add `chapter` with empty-string default. Drop: publisher, stream, book_type, class_level, book_file_url, book_file_key columns.
- **Worker → ai_service:** Add `AI_SERVICE_URL = "http://127.0.0.1:8001"` to `worker/worker/config.py`.
- **SSE subject validation:** Tutor and practice endpoints must fetch student stream from main_backend internal profile and reject subjects not in that stream's list.

---
