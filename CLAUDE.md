# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Status

This project is in initial setup — no service code has been written yet. Scaffold each service according to the architecture below.

---

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
| `DATABASE_URL` | Neon PostgreSQL connection string |
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
2. **RAG layer** — Pinecone for retrieval; Cloudflare R2 for image/diagram storage
3. **Memory / state layer** — personalization summaries and planner timeline (see Personalization below)

### Agents

| Agent | Role |
|-------|------|
| Tutor (per subject) | Teaches, answers questions, follows planner instructions |
| Capsule agent (per subject) | Generates and handles daily learning capsule |
| Practice agent (per subject) | Generates MCQ sets, evaluates, handles follow-ups |
| Planner agent | Plans full preparation timeline, coordinates all other agents, career guidance |
| Referral content agent | Generates social media posts with referral links |

All subject agents (tutor, capsule, practice) share context with each other for the same subject. The planner agent has read access to all agents' chat and practice performance.

### Personalization (Core Priority)

This is the most important part of the platform. Each agent must receive:

- Student's academic background (profile data, marksheets, past test scores)
- **LLM-generated summaries** for each timeline (daily, weekly, 15-day, monthly, all-time) per subject
- Each subject agent's own personalization summary for that student
- Planner agent's personalization summary for that student
- **Planner's preparation timeline** — created initially, updated by planner after each day; readable by all agents

#### Summary Format

Summaries are **free-form LLM-generated text**, not fixed database fields. This lets the agent capture unlimited parameters without schema changes.

There will be a set of **mandatory parameters** that every summary must always cover. These will be decided during the planning session for the AI core stage — do not define them before that point. Beyond the mandatory ones, the agent must include any additional observations it finds relevant for that student at that point in time.

### RAG Pipeline

Triggered from admin panel when a new book is uploaded:
1. Chunk by structure (headings, sections, paragraphs, figures)
2. LLM semantic refinement — each chunk = one complete learning concept
3. Extract images/diagrams → upload to R2, attach URL to chunk metadata
4. Embed and upsert to Pinecone

Pinecone metadata fields: `book_id`, `type` (default/additional), `publisher`, `class`, `subject`, `chapter`, `topic`, `page_number`, `chunk_type` (question/example/explanation), `image_urls`.

---

## Worker (Celery) Jobs

Scheduled jobs include:
- Daily capsule generation (fixed time each day, per student per subject)
- End-of-day summary update (update personalization summaries and dynamic notes after day ends)
- Weekly/15-day/monthly summary regeneration

---

## Key Design Decisions

- **No shared packages between services** — each service is fully self-contained.
- **Manual payments** — students pay via QR, admin approves in panel. System tracks status only; no payment gateway.
- **Personalization via LLM summaries, not fixed fields** — allows unlimited parameters per student without schema migrations.
- **Planner timeline is the single source of truth** for preparation plan; all agents follow it.

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
- the student’s academic ability,
- weaknesses,
- strengths,
- what the student learned today,
- how performance was,
- what type of questions were wrong,
- what the student’s learning approaches are.

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
- viewing each student’s details and taking action,
- community posts,
- push notifications to all students or selected categories,
- management of affiliated partners,
- adding resources to the vector database,
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
Provider: Neon

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
├── worker/
```

---

## AI Core Layers

AI core will contain three layers:

1. Agent layer
2. RAG layer
3. Memory / state layer

---

## RAG Layer

RAG layer is the RAG pipeline which will:
- chunk and embed the book,
- extract images and diagrams,
- store them in Cloudflare R2,
- add the image URL to metadata of the relevant chunk.

For RAG semantic refinement, LLM will also be used for better quality of data stored in the vector store.

The pipeline will be exposed to admin panel, from where admin can add new test books, and those books will go through the RAG pipeline and be stored in the vector database.

Images and diagrams in books will be stored in object storage, and the metadata in the vector DB will contain the image URL.

There will be:
- default books provided by the CDC,
- additional books added with their publisher name as type `additional book`.

Example metadata fields:

- book_id
- default / additional
- publisher name
- class
- subject
- chapter
- topic
- page number
- chunk type (for example: question, example, explanation)
- related image URLs

### Chunking Strategy

#### Structure-based chunking (primary)
- Split content using headings, sections, paragraphs, and figures.
- Keep related content (explanation + diagram + caption) together.

#### Semantic refinement (LLM-assisted)
- Group paragraphs into meaningful concept-level chunks.
- Ensure each chunk represents a single learning concept.
- Attach diagrams to the correct concept using context or LLM reasoning.

#### Diagram handling
- Store images in object storage.
- Link them to chunks via metadata (`image_url`, description).
- Use captions and nearby text to determine placement.

### Goal of Chunking
- Each chunk should be a complete, self-contained concept.
- This improves retrieval quality, tutor accuracy, and learning experience.

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

so that the tutor will have clear context of the student’s academic background.

However, during registration, none of these will be asked, since students may feel uncomfortable sharing such information without even experiencing the app.

After registration, students will be prompted to complete their profile gradually over time until their profile is fully filled.

### Initial Mock Test Recommendation
For the first mock test, the student will also be prompted to take a mock test first.

Planner agent will also ask the student to do so if it does not get any mock test and profile data, but it will not be mandatory.

The agent will recommend it, but if the student says they will do it later, it will continue with currently available data, since later it keeps updating the timeline based on the student’s performance.

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
- use past post history and the user’s request,
- generate posts which the user can simply post to social media accounts,
- include the referral link.

Students who sign up with referral will get extra discount.

---

## Features

### 1. Tutor for Each Subject

This section contains:

#### a. Tutor
- Tutor in chatbot form.

#### b. Note
There will be two notes:
1. Complete notes, same for everyone.
2. Incomplete / dynamic notes, where newly covered content will be added daily.

#### c. Daily Capsule
Daily capsule will include:
- interactive content,
- multimedia such as images and diagrams,
- ability for students to ask questions directly about the content on the same page.

Students can:
- see the history of capsules of each day,
- access history in ChatGPT format,
- choose capsule of any day from sidebar,
- see not only the initial capsule but the whole chat with the student on that day.

Other details:
- every day at a fixed time the capsule will be generated,
- in chat, student can ask any type of question,
- student can ask to reformat the capsule,
- by the end of the day, based on:
  - chat in capsule,
  - practice performance,
  - chat with tutor,
  - notes will be updated.

Daily Capsule will also contain a second tab: **Resources**

##### Resources tab
Agent will list the best resources for that topic from the internet.

For example:
- YouTube videos,
- any other helpful internet resources useful to understand the topic.

With each day’s capsule, helpful resources will be filtered and listed there.

#### d. Practice
Practice will contain two tabs:
1. practice topic of that day,
2. practice whole subject.

Practice details:
- there will be a chat option,
- student can ask what type of question they want to practice,
- student can ask follow-up questions regarding questions and solutions of practice questions,
- it will contain history so that student can see each day’s practice later.

Practice setup:
- number of questions,
- timer or not,
- optional message field if student wants to add something,
- submit button.

After submit:
- set will be created in MCQ form,
- student can choose answers in normal MCQ test interface,
- student can submit manually,
- if time is over, it will auto-submit.

After submission:
- score will be shown,
- correct options will be shown,
- explanation will be shown.

Follow-up mode:
- there will be a “follow up” button at the bottom right corner,
- if the student has any follow-up question regarding that set, they can click it,
- then the buttons for number of questions and timers will hide,
- only the message field will be visible,
- student can write message and send.

After all queries are clear, student can create another test again through the initial method.

#### Downloadable PDFs
Everything below will be provided in downloadable PDF format if the student wants to download:
- notes,
- daily capsule,
- practice questions.

#### Shared Context Among Subject Agents
All three agents will have context of one another.

For example:
- tutor agent will get summary of what student was asking to capsule agent or practice agent about that topic,
- and vice versa.

---

### 2. Planner Expert (Consultant)

Planner expert will:
- plan the whole preparation,
- allow student to discuss anything regarding preparation,
- give instructions to other tutors.

Initially, it will:
- prepare a whole timeline of preparation based on the time the student has.

It will:
- update plan for each next day after student completes that day’s preparation,
- take into account the student’s problems of that day,
- give instructions to other agents,
- follow the timeline,
- ask other agents how to make preparation more effective,
- read chats,
- read practice performance.

If student asks to make any change:
- that will also be taken into account.

It will:
- update instructions for agents immediately after chat,
- not wait for routine update,
- guide students about career.

This separate planner agent is built so that student can talk about their issues at one place, and those issues will be taken into account by all agents.

---

### 3. Community

#### a. Leaderboard
Leaderboard will show:
- top performers in daily mock test,
- each college leaderboard,
- student can choose any college to take mock test,
- test will be in the format of that college,
- overall topper for general category.

#### b. Community
- Both students and admin can post.

#### c. Announcement
- Announcement by admin.

#### d. Notices
- scholarship notices,
- entrance exam related notices,
- all other required notices for students.

All of community, announcement, and notice will be like Facebook posts, meaning:
- text,
- image,
- link,
can be posted.

---

### 4. Practice & Mock Test

This section will contain two tabs:

#### Fixed
- fixed number of questions,
- student can choose for any specific college or a universal one.

#### Customizable
- student can choose number of questions,
- for example if student wants to practice 30 questions.

---

### 5. Syllabus and Past Questions of Different Colleges

This section will contain:
- syllabus of different colleges,
- past questions of different colleges.

---

### 6. Progress

This section will track the progress of the student.

---

### 7. Setting

Settings will contain remaining control related features.

---

## Subject Structure by Stream

In the tutor page, each subject will be shown like in Google Classroom, where each subject is represented by a box, and by clicking that box the student can open that subject.

### Science
- Compulsory English
- Compulsory Science
- Compulsory Mathematics
- Optional Mathematics

### Management & Humanities
- Compulsory English
- Compulsory Mathematics
- GK (social or current affairs)
- IQ

Student interface will have the subjects of the respective stream.

---

## Personalization Requirements

This is the heart of the platform and the core developer focus.

Tutors should have context of:
- student’s academic background,
- subject-wise summary (daily, weekly, 15-day, monthly, all-time).

Summaries are LLM-generated free-form text — not fixed fields — so that any number of parameters (weak topics, improvement rate, performance patterns, learning style, etc.) can be captured without schema constraints.

There should be:
- personalization summary of each agent for the student,
- personalization summary of the planner agent for the student,
- timeline of whole preparation by planner agent, accessible to all agents.

This timeline can be updated by planner agent as needed, but it will be followed by all agents.

---

# Build Plan

This section contains the full phased build plan. Each session should read the **Build Status** table first to know which phase to work on next, then follow the detailed instructions for that phase.

## Rules for Every Phase

- Read the Build Status table at the bottom of this file first — it tells you the current phase.
- Build only what is listed for the current phase. Do not build ahead.
- At the end of each phase: run all services that were modified, present the full endpoint list for Postman testing, and wait for the user to say "continue" before moving to the next phase.
- Fix any bugs the user reports before proceeding.
- After completing a phase, update the Build Status table row to `[x] Complete` with the date.

## Port Map

| Service | Port | Start Command |
|---------|------|---------------|
| main_backend | 8000 | `cd main_backend && uvicorn app.main:app --reload` |
| ai_service | 8001 | `cd ai_service && uvicorn app.main:app --reload --port 8001` |
| worker | — | `cd worker && celery -A worker.celery_app worker --loglevel=info` |
| frontend | 5173 | `cd frontend && npm run dev` |

## Internal Auth

Services communicate using `X-Internal-Secret` header. Value = `MAIN_BACKEND_INTERNAL_SECRET` from `.env`. All internal endpoints must verify this header.

## Phase Dependency Order

```
Phase 1 (Scaffolding) ← START HERE
  ├── Phase 2 (RAG Pipeline)           ai_service
  └── Phase 3 (Auth + User Models)     main_backend
        └── Phase 4 (Tutor Agent)      ai_service  [needs Phase 2 + 3]
              └── Phase 5 (Planner)    ai_service  [needs Phase 4]
                    └── Phase 6 (Capsule + Practice)  ai_service  [needs Phase 5]
                          └── Phase 7 (Worker Jobs)   worker      [needs Phase 6]
                                └── Phase 8 (Main Backend Features)  main_backend  [needs Phase 3 + 7]
                                      └── Phase 9 (Admin Frontend)   frontend      [needs Phase 2 + 8]
                                            └── Phase 10 (Student Frontend)  frontend  [needs all AI]
                                                  └── Phase 11 (Affiliation)  frontend + ai_service
```

---

## Phase 1 — Service Scaffolding

**Goal:** All 4 services boot, connect to all external services, return health checks.

**Services:** all 4

### Files to create

```
main_backend/
  requirements.txt
  alembic.ini
  alembic/env.py
  alembic/versions/        (empty dir)
  app/__init__.py
  app/main.py              FastAPI app, CORS (ALLOWED_ORIGINS from .env), mount routers
  app/config.py            pydantic-settings BaseSettings, env_file="../../.env" (2 levels up from app/)
  app/database.py          SQLAlchemy async engine + AsyncSession factory using DATABASE_URL
  app/api/__init__.py
  app/api/health.py        GET /health

ai_service/
  requirements.txt
  alembic.ini
  alembic/env.py
  alembic/versions/
  app/__init__.py
  app/main.py
  app/config.py            reads DATABASE_URL, PINECONE_API_KEY, OPENAI_API_KEY, all UPSTASH_*, all R2_*
  app/database.py
  app/r2_client.py         boto3.client("s3", endpoint_url=R2_ENDPOINT, aws_access_key_id, aws_secret_access_key)
                           expose: upload_bytes(key, data, content_type) → url, get_presigned_url(key)
  app/pinecone_client.py   Pinecone(api_key=PINECONE_API_KEY), index name="hamroguru"
                           expose: get_index() → Index
  app/redis_client.py      Upstash REST API via httpx (NOT socket Redis)
                           expose async: get(key), set(key, value, ex?), delete(key)
  app/api/__init__.py
  app/api/health.py        GET /health — checks db, pinecone, r2, redis

worker/
  requirements.txt
  worker/__init__.py
  worker/celery_app.py     Celery app, broker via Upstash Redis URL
  worker/config.py         reads .env

frontend/
  package.json             react, react-dom, react-router-dom, axios, typescript, vite,
                           @vitejs/plugin-react, tailwindcss, lucide-react
  vite.config.ts
  tsconfig.json
  index.html
  src/main.tsx
  src/App.tsx              basic router skeleton
  src/components/HealthCheck.tsx  hits GET :8000/health and displays result
```

### Config note
All Python services use `pydantic-settings`. The `.env` file is at the repo root. Each service's `config.py` must point `env_file` to the root `.env` using a path relative to where the process runs (e.g. `"../.env"` when running from the service directory).

### Requirements (minimum packages)

**main_backend/requirements.txt:**
```
fastapi
uvicorn[standard]
sqlalchemy[asyncio]
asyncpg
alembic
pydantic-settings
python-dotenv
python-jose[cryptography]
passlib[bcrypt]
python-multipart
httpx
```

**ai_service/requirements.txt:**
```
fastapi
uvicorn[standard]
sqlalchemy[asyncio]
asyncpg
alembic
pydantic-settings
python-dotenv
openai
openai-agents
pinecone
boto3
httpx
langgraph
langchain
langchain-openai
pymupdf
Pillow
```

**worker/requirements.txt:**
```
celery
redis
pydantic-settings
python-dotenv
httpx
sqlalchemy[asyncio]
asyncpg
openai
```

### Endpoints

```
GET /health  (main_backend :8000)
    → { "service": "main_backend", "status": "ok", "db": "connected" }

GET /health  (ai_service :8001)
    → { "service": "ai_service", "status": "ok", "db": "connected",
        "pinecone": "connected", "r2": "connected", "redis": "connected" }
```

### Verification checklist

1. `GET :8000/health` → db connected
2. `GET :8001/health` → all 4 services connected
3. Celery starts, broker connection established (no errors)
4. `localhost:5173` loads, HealthCheck component shows main_backend is reachable

---

## Phase 2 — RAG Pipeline

**Goal:** Admin uploads a PDF book → pipeline chunks it by structure, refines chunks with LLM (each chunk = one complete concept), extracts images to Cloudflare R2, embeds chunks, upserts to Pinecone with full metadata. This is the AI knowledge foundation.

**Services:** `ai_service`

### Files to create

```
ai_service/app/
  models/__init__.py
  models/rag_job.py        SQLAlchemy RagJob model

  rag/__init__.py
  rag/schemas.py           Pydantic: BookUploadRequest, ChunkMetadata, JobStatus
  rag/pipeline.py          async orchestrator — runs as background asyncio.create_task()
                           stages: chunking → image extraction → semantic refinement → embedding
                           updates Redis + DB at each stage
  rag/chunker.py           PyMuPDF (fitz): open PDF, extract text blocks preserving heading hierarchy,
                           detect image bounding boxes, group: heading + paragraphs + figures + caption
                           output: list of RawChunk {text, page_number, chapter_hint, image_blocks}
  rag/image_extractor.py   for each chunk with images: extract bytes from fitz, upload to R2
                           R2 path: books/{book_id}/page_{page}_{index}.png
                           attach image URLs to chunk metadata
  rag/semantic_refiner.py  sliding window of 3-5 raw chunks → GPT-4o call
                           instruction: merge chunks that are same concept, split chunks with 2 concepts,
                           identify chunk_type, extract chapter name and topic
                           return structured JSON list of refined chunks
  rag/embedder.py          OpenAI text-embedding-3-large per chunk
                           build Pinecone vector: {id: uuid, values: embedding, metadata: full dict}
                           batch upsert to index "hamroguru" in batches of 100

  api/rag.py               4 endpoints below, all require X-Internal-Secret header
```

### RagJob table

```
id              UUID PK
book_id         String
book_title      String
subject         String  (physics|chemistry|math|english|optional_math|science|ik|gk)
class_level     String  (default "10")
stream          String  (science|management|both)
book_type       String  (default|additional)
publisher       String
status          Enum    queued|processing|completed|failed
total_chunks    Integer (null until complete)
error_message   Text    (null unless failed)
created_at      DateTime
completed_at    DateTime
```

### Pinecone metadata schema (store ALL fields on every vector)

```json
{
  "book_id": "string",
  "book_title": "string",
  "type": "default|additional",
  "publisher": "string",
  "class": "integer",
  "subject": "physics|chemistry|math|english|optional_math|science|ik|gk",
  "stream": "science|management|both",
  "chapter": "string",
  "chapter_number": "integer",
  "topic": "string",
  "page_number": "integer",
  "chunk_type": "question|example|explanation|definition|diagram_description",
  "image_urls": ["string"],
  "text": "string"
}
```

### Job progress tracking (Redis)

Key: `rag:job:{job_id}` → JSON `{status, stage, progress_pct, message}` — TTL 24 hours.
Update Redis at the start of each pipeline stage. DB row updated at start and end.

### Endpoints

```
POST /api/rag/upload-book
     Header: X-Internal-Secret
     Multipart form: file(PDF), book_id, book_title, subject, class_level,
                     stream, book_type, publisher
     → { "job_id": "uuid", "status": "queued" }
     Immediately returns. Pipeline runs in background asyncio task.

GET  /api/rag/status/{job_id}
     Header: X-Internal-Secret
     → { job_id, status, stage, progress_pct, message, total_chunks, error_message }
     Reads from Redis first (fast), falls back to DB.

GET  /api/rag/books
     Header: X-Internal-Secret
     → list of all RagJob rows ordered by created_at desc

DELETE /api/rag/books/{book_id}
     Header: X-Internal-Secret
     → deletes all Pinecone vectors where metadata.book_id == book_id
        deletes RagJob row from DB
     → { "message": "deleted", "vectors_deleted": N }
```

### Alembic migration

Create migration `001_create_rag_job.py` and run `alembic upgrade head` in ai_service.

### Verification checklist

1. Upload a real PDF chapter → confirm `job_id` returned immediately
2. Poll status → watch stages: queued → chunking → extracting_images → refining → embedding → completed
3. Pinecone dashboard → vectors present with all metadata fields populated
4. R2 dashboard → images under `books/{book_id}/` (if PDF has images)
5. Query Pinecone directly: filter `{subject: "physics"}` → correct metadata
6. DELETE endpoint → vectors gone from Pinecone, row deleted from DB

---

## Phase 3 — Auth + User Models

**Goal:** Complete authentication system, user roles, student and affiliation profiles, onboarding flow, marksheet uploads.

**Services:** `main_backend`

### Files to create

```
main_backend/app/
  models/__init__.py
  models/user.py
  models/student_profile.py
  models/affiliation_profile.py

  schemas/__init__.py
  schemas/auth.py           RegisterRequest, LoginRequest, TokenResponse, UserOut
  schemas/user.py           UserUpdate
  schemas/student_profile.py ProfileOut, ProfileUpdate, TestScoreEntry

  core/__init__.py
  core/security.py          pwd_context (bcrypt), create_access_token, create_refresh_token,
                            decode_token, verify_password
  core/dependencies.py      get_current_user (reads Bearer token), require_role(roles),
                            verify_internal_secret (X-Internal-Secret middleware)
  core/r2_client.py         upload marksheets to R2 at students/{user_id}/marksheets/{year}.*

  api/auth.py               register, login, refresh, me
  api/onboarding.py         set-role, student set-stream, affiliation setup
  api/profile.py            get/update student profile, upload marksheet, get referral code
  api/admin_users.py        admin: list users, get user, deactivate user
  api/internal.py           GET /api/internal/profile/{user_id}  (X-Internal-Secret)

  alembic/versions/001_create_users_and_profiles.py
```

### User table

```
id                  UUID PK (default gen_random_uuid())
email               String unique not null
phone               String unique nullable
full_name           String not null
hashed_password     String not null
role                Enum: student|admin|affiliation_partner  default student
is_active           Boolean default True
onboarding_complete Boolean default False
referral_code       String unique not null  (auto-generated 8-char alphanumeric on register)
referred_by         UUID FK → users.id nullable
created_at          DateTime default now()
updated_at          DateTime
```

### StudentProfile table

```
id                      UUID PK
user_id                 UUID unique FK → users.id
stream                  Enum: science|management  nullable
school_name             String nullable
school_address          String nullable
class_8_scores          JSONB nullable   {subject: score, ...}
class_9_scores          JSONB nullable
class_10_scores         JSONB nullable
see_gpa                 Float nullable
marksheet_urls          JSONB nullable   [{year: "2080", url: "..."}]
notes                   Text nullable
profile_completion_pct  Integer default 0
created_at              DateTime
updated_at              DateTime
```

### AffiliationProfile table

```
id              UUID PK
user_id         UUID unique FK → users.id
bank_name       String nullable
account_number  String nullable
account_name    String nullable
qr_image_url    String nullable
total_referrals Integer default 0
total_earnings  Numeric default 0
created_at      DateTime
```

### JWT strategy

- `JWT_SECRET_KEY` from `.env`, algorithm HS256
- Access token: 30 min expiry
- Refresh token: 7 days expiry, stored in Redis as `refresh:{user_id}` → token_hash
- Token payload: `{sub: user_id, role: role, exp: expiry}`

### Endpoints

```
POST /api/auth/register
     Body: { email, password, full_name, referral_code? }
     → { access_token, refresh_token, user: UserOut }
     Creates User, auto-generates referral_code, links referred_by if code provided.

POST /api/auth/login
     Body: { email, password }
     → { access_token, refresh_token, user: UserOut }

POST /api/auth/refresh
     Body: { refresh_token }
     → { access_token, refresh_token }

GET  /api/auth/me
     Header: Authorization: Bearer <token>
     → UserOut

POST /api/onboarding/set-role
     Header: Authorization: Bearer <token>
     Body: { role: "student" | "affiliation_partner" }
     → { message, redirect_to }

POST /api/onboarding/student/set-stream
     Header: Authorization: Bearer <token>
     Body: { stream: "science" | "management", school_name, school_address? }
     → { message, profile: ProfileOut }
     Creates StudentProfile. Sets onboarding_complete=True on User.

POST /api/onboarding/affiliation/setup
     Header: Authorization: Bearer <token>
     Body: { bank_name?, account_number?, account_name? }
     Multipart optional: qr_image (file)
     → { message, profile: AffiliationProfileOut }
     Creates AffiliationProfile. Sets onboarding_complete=True.

GET  /api/profile/student
     Header: Authorization: Bearer <token>
     → StudentProfileOut

PATCH /api/profile/student
     Header: Authorization: Bearer <token>
     Body: { school_name?, see_gpa?, class_8_scores?, class_9_scores?, class_10_scores?, notes? }
     → updated StudentProfileOut

POST /api/profile/student/upload-marksheet
     Header: Authorization: Bearer <token>
     Multipart: file (image or PDF), year (string e.g. "2080")
     → { url, year }

GET  /api/users/me/referral-code
     Header: Authorization: Bearer <token>
     → { referral_code, referral_link: "https://hamroguru.app/register?ref=CODE" }

GET  /api/admin/users
     Header: Authorization: Bearer <admin_token>
     Query: role?, stream?, page=1, limit=20
     → { items: [UserOut], total, page, limit }

GET  /api/admin/users/{user_id}
     Header: Authorization: Bearer <admin_token>
     → { user: UserOut, student_profile: StudentProfileOut | null }

PATCH /api/admin/users/{user_id}/deactivate
     Header: Authorization: Bearer <admin_token>
     → { message }

GET  /api/internal/profile/{user_id}
     Header: X-Internal-Secret
     → { user: UserOut, student_profile: StudentProfileOut | null }
```

### Verification checklist

1. Register → login → `GET /api/auth/me` confirms user data
2. Full onboarding flow (set-role → set-stream) → StudentProfile in Neon DB
3. Upload marksheet → file appears in R2 under `students/{user_id}/marksheets/`
4. Token refresh returns new access token that works on `/me`
5. Admin-only endpoint returns 403 for student token
6. `GET /api/internal/profile/{user_id}` with internal secret returns profile
7. `alembic upgrade head` runs clean, all tables in Neon

---


## Build Status

Update this table after completing each phase. Mark `[x] Complete` with the date.

| Phase | Name | Status | Completed | Notes |
|-------|------|--------|-----------|-------|
| 1 | Service Scaffolding | [x] Complete | 2026-04-16 | All 4 services boot. main_backend :8000 db=connected. ai_service :8001 db+pinecone+r2+redis=connected. Frontend builds clean. |
| 2 | RAG Pipeline | [x] Complete | 2026-04-24 | 4-stage pipeline (chunk→image→refine→embed) working. All 4 endpoints verified. Vectors upserted to Pinecone. Improvements on 2026-04-24: OCR error correction in refiner, AI-driven image→chunk assignment (IMG_N indices), DOCX OCR artifact filtering (dimension check + prompt), max 1000-token chunks with paragraph-boundary splitting, 15%-of-chunk-size overlap between chunks. ocr.py removed (image PDFs handled externally as DOCX). |
| 3 | Auth + User Models | [ ] Pending | — | — |
| 4 | Core Tutor Agent + RAG | [ ] Pending | — | — |
| 5 | Planner Agent + Summaries | [ ] Pending | — | — |
| 6 | Capsule + Practice Agents | [ ] Pending | — | — |
| 7 | Worker Jobs | [ ] Pending | — | — |
| 8 | Main Backend Features | [ ] Pending | — | — |
| 9 | Admin Panel Frontend | [ ] Pending | — | — |
| 10 | Student Interface Frontend | [ ] Pending | — | — |
| 11 | Affiliation Interface + Referral Agent | [ ] Pending | — | — |