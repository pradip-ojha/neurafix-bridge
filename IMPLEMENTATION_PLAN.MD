 Implementation Plan — Four Platform Changes

     Context

     Four coordinated changes to the HamroGuru platform:
     1. Migrate from direct OpenAI to Azure OpenAI with a clean model-router architecture
     2. Move subject chapter/topic structures from local JSON files to the database with admin CRUD
     3. Replace AI-based context classification with explicit student-selected thinking modes
     4. Overhaul subscription: remove trial tier, free+paid only, per-feature admin-configurable rate limits

     These changes touch all four services. No external credentials need to be added — user already has Azure OpenAI keys in .env.

     ---
     Change 1 — Azure OpenAI Migration + Model Router

     Goal

     Replace AsyncOpenAI with AsyncAzureOpenAI everywhere in ai_service. Centralise all model assignments in one file so model names are never hardcoded across
     agent files.

     New config fields — ai_service/app/config.py

     Add to Settings:
     AZURE_OPENAI_ENDPOINT: str
     AZURE_OPENAI_API_KEY: str
     AZURE_OPENAI_API_VERSION: str
     MODEL_CHAT_FAST: str        # e.g. gpt-5-mini
     MODEL_CHAT_THINKING: str    # e.g. gpt-5
     MODEL_EMBEDDING: str        # e.g. text-embedding-3-large
     # Remove: OPENAI_API_KEY (or keep as Optional for fallback)

     New file — ai_service/app/agents/model_router.py

     Single source of truth. Maps semantic roles to Azure deployment names from settings:
     from app.config import settings
     from openai import AsyncAzureOpenAI
     from agents import OpenAIChatCompletionsModel

     # Role → deployment name mapping
     ROLES = {
         "tutor_fast":        settings.MODEL_CHAT_FAST,      # gpt-5-mini
         "tutor_thinking":    settings.MODEL_CHAT_THINKING,  # gpt-5
         "personalization":   settings.MODEL_CHAT_FAST,      # gpt-5-mini
         "session_memory":    settings.MODEL_CHAT_FAST,      # gpt-5-mini
         "practice_filter":   settings.MODEL_CHAT_FAST,      # gpt-5-mini
         "capsule_gen":       settings.MODEL_CHAT_THINKING,  # gpt-5
         "capsule_followup":  settings.MODEL_CHAT_FAST,      # gpt-5-mini
         "consultant":        settings.MODEL_CHAT_THINKING,  # gpt-5 (both modes)
         "referral":          settings.MODEL_CHAT_FAST,
     }

     _azure_client: AsyncAzureOpenAI | None = None

     def get_azure_client() -> AsyncAzureOpenAI:
         global _azure_client
         if _azure_client is None:
             _azure_client = AsyncAzureOpenAI(
                 azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
                 api_key=settings.AZURE_OPENAI_API_KEY,
                 api_version=settings.AZURE_OPENAI_API_VERSION,
                 timeout=httpx.Timeout(60.0, connect=5.0),
             )
         return _azure_client

     def get_model(role: str) -> OpenAIChatCompletionsModel:
         """Returns an Agents-SDK model bound to the Azure deployment for this role."""
         return OpenAIChatCompletionsModel(
             model=ROLES[role],
             openai_client=get_azure_client(),
         )

     Files to change

     ┌──────────────────────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────┐
     │                         File                         │                                         Change                                         │
     ├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/config.py                             │ Add Azure fields, remove/make optional OPENAI_API_KEY                                  │
     ├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/agents/base_agent.py                  │ Remove TUTOR_MODEL + get_openai_client(); export get_model() from model_router instead │
     ├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/agents/tutor/agent.py                 │ model=get_model("tutor_fast") or "tutor_thinking" based on mode                        │
     ├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/agents/capsule/agent.py               │ model=get_model("capsule_gen") for gen, "capsule_followup" for chat                    │
     ├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/agents/consultant/agent.py            │ model=get_model("consultant")                                                          │
     ├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/agents/practice/agent.py              │ model=get_model("capsule_followup") for followup chat (same mini model)                │
     ├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/agents/referral/agent.py              │ model=get_model("referral")                                                            │
     ├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/agents/personalization/agent.py       │ Replace AsyncOpenAI + _MODEL with get_azure_client() + ROLES["personalization"]        │
     ├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/sessions/manager.py                   │ Same as above, use "session_memory" role                                               │
     ├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/rag/retriever.py                      │ Replace AsyncOpenAI embed client with get_azure_client(), use settings.MODEL_EMBEDDING │
     ├──────────────────────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/personalization/context_classifier.py │ Delete this file (replaced by explicit modes in Change 3)                              │
     └──────────────────────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────┘

     Dependency change

     requirements.txt in ai_service: openai>=1.50.0 already supports AsyncAzureOpenAI. No new package needed.

     ---
     Change 2 — Subject Chapter Structure in Database

     Goal

     Replace local JSON files in ai_service/app/subject_structure/data/ with a subject_chapters PostgreSQL table managed via the admin panel. AI service fetches
      structure from the DB via internal API with Redis caching.

     New DB model — main_backend/app/models/subject_chapter.py

     class SubjectChapter(Base):
         __tablename__ = "subject_chapters"

         id: UUID PK
         subject: str  # compulsory_math | optional_math | compulsory_english | compulsory_science
         chapter_id: str  # slug, e.g. "compound_interest" — unique per subject
         display_name: str
         topics: dict  # JSONB — array of {topic, subtopics[]}
         sort_order: int  # for ordering in UI and context
         created_at, updated_at
         UNIQUE(subject, chapter_id)

     The topics JSONB stores the topic/subtopic array matching the user-provided JSON format:
     [{"topic": "...", "subtopics": ["...", "..."]}]

     Migration 008 — main_backend/alembic/versions/008_subject_chapters.py

     1. Create subject_chapters table
     2. Seed all chapters from the existing 4 JSON files in ai_service/app/subject_structure/data/
     (compulsory_math: ~9 chapters, optional_math, compulsory_english, compulsory_science)
     3. Seed covers chapter_id, display_name, topics JSONB, sort_order

     New admin API endpoints — main_backend/app/api/admin_content.py (extend existing file)

     GET    /api/admin/subject-chapters?subject=compulsory_math   → list chapters for subject
     POST   /api/admin/subject-chapters                           → add chapter (paste JSON + display_name + subject + sort_order)
     PATCH  /api/admin/subject-chapters/{chapter_id}              → edit chapter topics JSON or display_name
     DELETE /api/admin/subject-chapters/{chapter_id}              → remove chapter
     Request body for POST/PATCH includes topics as a parsed JSON object (not file upload). The admin pastes JSON into a textarea; the backend parses and
     validates it.

     New internal API endpoint — main_backend/app/api/internal.py

     GET /api/internal/subject-structure/{subject}   → returns all chapters with topics for a subject
     GET /api/internal/subject-structure/{subject}/chapter-names → returns [{chapter_id, display_name}] only
     Protected by X-Internal-Secret header.

     AI service changes

     - Replace ai_service/app/subject_structure/loader.py with a new function get_structure(subject) that:
       a. Checks Redis cache (key: subject_structure:{subject}, TTL: 1 hour)
       b. On miss: calls GET /api/internal/subject-structure/{subject} and caches result
       c. Returns same dict shape as the current loader ({"subject": ..., "chapters": [...]})
     - Keep old JSON files as seeds only; they are no longer the live source
     - context_builder.py continues calling get_structure() — no change at call sites

     New admin frontend — frontend/src/admin/pages/content/SubjectChapters.tsx

     New page added to the admin sidebar under "Content":
     - Tabs: Compulsory Math | Optional Math | Compulsory English | Compulsory Science
     - Chapter list: display_name, sort_order, edit/delete buttons
     - "Add Chapter" button → modal with:
       - Subject (auto-set from active tab)
       - Display name input
       - Sort order input
       - Large textarea for JSON (topics array)
       - Validate JSON on submit; show parse errors inline
     - Edit → same modal, pre-filled
     - Delete → confirm dialog

     ---
     Change 3 — Explicit Thinking Modes + Context Restructure

     Goal

     Remove AI-based context classifier. Students choose the thinking mode explicitly from the chat UI. Modes determine model + context depth. Remove "No
     specific chapter" option in tutor. Update context layouts for all agents.

     Tutor chat modes (3)

     ┌───────────────┬─────────────────────────┬─────────┬─────┐
     │     Mode      │          Model          │ Context │ RAG │
     ├───────────────┼─────────────────────────┼─────────┼─────┤
     │ Fast          │ tutor_fast (gpt-5-mini) │ Limited │ No  │
     ├───────────────┼─────────────────────────┼─────────┼─────┤
     │ Thinking      │ tutor_thinking (gpt-5)  │ Full    │ No  │
     ├───────────────┼─────────────────────────┼─────────┼─────┤
     │ Deep Thinking │ tutor_thinking (gpt-5)  │ Full    │ Yes │
     └───────────────┴─────────────────────────┴─────────┴─────┘

     Limited context (Fast mode):
     - Chapter topic structure (always included in all modes)
     - Overall student summary
     - Yesterday's daily summary for this subject

     Full context (Thinking + Deep Thinking):
     - Chapter topic structure
     - Overall student summary
     - Subject all-time summary
     - Subject weekly summary
     - Yesterday's daily summary
     - Preparation timeline

     Deep Thinking adds: RAG chunks for the selected chapter (top_k=4)

     Note: RAG is now only in Deep Thinking mode — full context (Thinking mode) does NOT contain RAG chunks.

     Consultant chat modes (2)

     ┌──────────┬────────────────────┬─────────┬────────────┐
     │   Mode   │       Model        │ Context │ Web search │
     ├──────────┼────────────────────┼─────────┼────────────┤
     │ Normal   │ consultant (gpt-5) │ Limited │ No         │
     ├──────────┼────────────────────┼─────────┼────────────┤
     │ Thinking │ consultant (gpt-5) │ Full    │ Yes        │
     └──────────┴────────────────────┴─────────┴────────────┘

     Limited context (Normal mode):
     - Overall student summary
     - Preparation timeline
     - Chapter names (display_name only, no topics) for all subjects — lightweight, supports timeline questions

     Full context (Thinking mode):
     - All of Normal context
     - All-time summaries for all 4 subjects
     - Weekly summaries for all 4 subjects
     - Today's practice sessions
     - Today's tutor session memories

     Daily capsule agent

     - Model: capsule_gen (gpt-5)
     - Context: overall summary + weekly summary + today's daily summary + today's practice session summaries + topic structures for chapters practiced today
     (replaces RAG chunks)
     - Remove RAG from capsule context

     Daily capsule followup

     - Model: capsule_followup (gpt-5-mini)
     - Context: the capsule content + student overall summary (no RAG)

     Practice question filtering

     - When student provides a focus instruction (e.g. "focus on hard questions only"), a small async LLM call using practice_filter (gpt-5-mini) determines
     which topic/difficulty filters to apply before querying the question pool
     - This is a simple structured output call, not a full agent

     "No specific chapter" removal

     - Remove the "No specific chapter" option from chapter selector in TutorChat
     - Chapter selection is required before sending any message
     - On load: auto-select today's planned chapter from the consultant's timeline if available, otherwise select the first chapter in the list
     - While no chapter is selected, show the chapter list with a prompt: "Select a chapter to start chatting"

     API changes

     POST /api/ai/tutor/chat (ai_service) — add field:
     { "mode": "fast" | "thinking" | "deep_thinking" }

     POST /api/consultant/chat (ai_service) — add field:
     { "mode": "normal" | "thinking" }

     main_backend proxy endpoints — forward mode field transparently (no change to proxy logic, just pass through the body)

     Files to change

     ┌───────────────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────────────────┐
     │                               File                                │                                       Change                                        │
     ├───────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/api/tutor.py                                       │ Accept mode param, pass to context builder and agent                                │
     ├───────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/agents/tutor/agent.py                              │ Accept mode, select model via get_model("tutor_fast") or "tutor_thinking"           │
     ├───────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/personalization/context_builder.py                 │ Accept mode: str param; build limited/full/full+RAG based on mode; remove           │
     │ build_tutor_context()                                             │ classify_task; always include chapter topic structure                               │
     ├───────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/api/consultant.py                                  │ Accept mode param                                                                   │
     ├───────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/agents/consultant/agent.py                         │ Accept mode; disable WebSearchTool when mode=normal                                 │
     ├───────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/personalization/context_builder.py                 │ Accept mode; build lean/full based on mode; remove classifier; add chapter names    │
     │ build_consultant_context()                                        │ (both modes)                                                                        │
     ├───────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/agents/capsule/agent.py                            │ Use capsule_gen model; remove RAG from gen context; add topic structures            │
     ├───────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │ ai_service/app/personalization/context_classifier.py              │ Delete — no longer needed                                                           │
     ├───────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │ main_backend/app/api/tutor_proxy.py                               │ Forward mode in request body                                                        │
     ├───────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │ main_backend/app/api/consultant_proxy.py                          │ Forward mode in request body                                                        │
     ├───────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │ frontend/src/student/components/TutorChat.tsx                     │ Add 3-mode selector near send button; remove "No specific chapter" option;          │
     │                                                                   │ auto-select chapter on load                                                         │
     ├───────────────────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────────────────┤
     │ frontend/src/student/pages/Consultant.tsx                         │ Add 2-mode selector (Normal / Thinking) near send button                            │
     └───────────────────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────────────────┘

     Chapter topic structure helper

     ai_service/app/personalization/context_builder.py — new helper _build_chapter_syllabus() already exists. Update it to use DB-fetched structure instead of
     local JSON. No call-site changes needed.

     ---
     Change 4 — Subscription System Overhaul

     Goal

     Remove trial tier. Free users get full platform access with per-feature daily rate limits. Paid users get higher limits. Admin configures all limits from
     admin panel. Remove upgrade banners; show upgrade prompt only on rate limit hit.

     Subscription model changes — main_backend/app/models/subscription.py

     - Keep trial in the subscription_status_enum PostgreSQL enum (cannot drop values without recreation — existing rows may have it)
     - Default status for new users: "free" (change from "trial")
     - trial_ends_at: make nullable (was NOT NULL) — no longer set on registration
     - In get_subscribed_user() dependency: treat trial same as active (backward compat for any existing trial rows); remove the block on free status — free
     users now get through

     PlatformConfig model changes — main_backend/app/models/platform_config.py

     Replace trial_daily_message_limit + paid_daily_message_limit with per-feature limits:

     # Free tier limits (per day)
     free_tutor_fast_limit: int = 10
     free_tutor_thinking_limit: int = 5
     free_tutor_deep_thinking_limit: int = 3
     free_consultant_normal_limit: int = 5
     free_consultant_thinking_limit: int = 2
     free_practice_limit: int = 5
     free_mock_test_limit: int = 2
     free_capsule_followup_limit: int = 5

     # Paid tier limits (per day)
     paid_tutor_fast_limit: int = 100
     paid_tutor_thinking_limit: int = 50
     paid_tutor_deep_thinking_limit: int = 20
     paid_consultant_normal_limit: int = 30
     paid_consultant_thinking_limit: int = 15
     paid_practice_limit: int = 50
     paid_mock_test_limit: int = 20
     paid_capsule_followup_limit: int = 30

     Old columns trial_daily_message_limit, paid_daily_message_limit, trial_duration_days are dropped in the migration.

     Rate limiter changes — main_backend/app/core/rate_limiter.py

     - New signature: check_rate_limit(user_id, feature, db) — feature is one of: tutor_fast, tutor_thinking, tutor_deep, consultant_normal,
     consultant_thinking, practice, mock_test, capsule_followup
     - Redis key: ratelimit:{user_id}:{date}:{feature}
     - Look up the correct limit field from PlatformConfig based on subscription status + feature
     - Free user: free_{feature}_limit; Active/Trial user: paid_{feature}_limit
     - 429 response detail: "Daily limit for {feature} reached. Upgrade to paid for more."

     Subscription gate changes — main_backend/app/core/dependencies.py

     - get_subscribed_user(): remove the HTTP 402 block for free status — free users pass through
     - Keep expiry auto-downgrade logic for active → free
     - Treat trial as active for backward compat
     - get_rate_limited_user() now requires feature parameter — update all endpoint usages

     Endpoint dependency updates

     Each endpoint needs its feature name passed to rate limiter:
     - POST .../tutor/chat → rate-limit based on mode field: tutor_fast, tutor_thinking, or tutor_deep
     - POST .../consultant/chat → consultant_normal or consultant_thinking
     - POST .../practice/start → practice
     - POST .../mock/start → mock_test
     - POST .../capsule/chat → capsule_followup

     Since mode is determined client-side, the proxy endpoints in main_backend read mode from the request body and pass the appropriate feature name to the rate
      limiter before proxying.

     Registration changes — main_backend/app/api/auth.py

     On new user registration: create Subscription with status="free", trial_ends_at=NULL.

     Migration 009 — main_backend/alembic/versions/009_rate_limits_per_feature.py

     1. Add all 16 new limit columns to platform_config with defaults
     2. Drop trial_daily_message_limit, paid_daily_message_limit, trial_duration_days
     3. Make subscriptions.trial_ends_at nullable
     4. Set subscriptions.status = 'free' for all rows where status = 'trial' (migrate existing trial users to free)
     5. Update platform_config default row (id=1) to set all limits

     Admin config UI — frontend/src/admin/pages/PlatformConfig.tsx

     Replace the single message limit fields with a grouped rate-limit table:
     - Two columns: Free Tier | Paid Tier
     - Rows: each feature with its limit input
     - Save button updates all at once via PATCH /api/admin/config

     Frontend changes — remove banners, add upgrade prompt on 429

     frontend/src/student/layout/StudentLayout.tsx:
     - Remove the subscription status banner (the "You're on free trial — subscribe..." section, lines 96-116)
     - Keep profile completion banner (unrelated to subscriptions)

     All chat/practice components (TutorChat, Consultant, PracticeTab, CapsuleTab):
     - On 429 response: show an inline toast/modal: "You've reached today's limit for this feature. Upgrade to paid for more access." with an "Upgrade" button
     that navigates to /student/payment
     - Remove existing 402 → payment redirect (free users no longer get 402)

     ---
     Migration Sequence

     ┌─────┬────────────────────────────────┬─────────────────────────────────────────────────────────────────────────┐
     │  #  │              File              │                              What it does                               │
     ├─────┼────────────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
     │ 008 │ 008_subject_chapters.py        │ Create subject_chapters table + seed all chapters                       │
     ├─────┼────────────────────────────────┼─────────────────────────────────────────────────────────────────────────┤
     │ 009 │ 009_rate_limits_per_feature.py │ Per-feature rate limit columns; remove trial fields; migrate trial→free │
     └─────┴────────────────────────────────┴─────────────────────────────────────────────────────────────────────────┘

     ---
     Build Order (within implementation)

     1. Azure migration (Change 1) — isolated to ai_service, no DB changes, test embedding + one agent call
     2. Subject chapters DB (Change 2) — migration + internal API + admin UI + ai_service loader swap; test chapter fetch
     3. Thinking modes (Change 3) — requires Change 1 (model router) and Change 2 (DB-backed chapter structure); update context builders, APIs, frontend mode
     selectors
     4. Subscription overhaul (Change 4) — migration + rate limiter + remove banners; test free user access and per-feature 429

     ---
     Critical Files

     ┌──────────────────────────────────────────────────────────────┬───────────────────────────────────────────┐
     │                             File                             │                    Why                    │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ ai_service/app/agents/model_router.py                        │ New — central model config                │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ ai_service/app/config.py                                     │ Add Azure credentials                     │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ ai_service/app/agents/base_agent.py                          │ Remove OpenAI client + TUTOR_MODEL        │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ ai_service/app/personalization/context_builder.py            │ Major rewrite of all 3 context builders   │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ ai_service/app/personalization/context_classifier.py         │ Delete                                    │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ main_backend/app/models/platform_config.py                   │ Per-feature rate limit columns            │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ main_backend/app/models/subscription.py                      │ default=free, trial_ends_at nullable      │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ main_backend/app/core/rate_limiter.py                        │ Per-feature rate limiting                 │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ main_backend/app/core/dependencies.py                        │ Remove free-user gate                     │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ main_backend/app/api/admin_content.py                        │ Subject chapter CRUD endpoints            │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ main_backend/app/api/internal.py                             │ Subject structure internal API            │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ main_backend/alembic/versions/008_subject_chapters.py        │ New migration                             │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ main_backend/alembic/versions/009_rate_limits_per_feature.py │ New migration                             │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ frontend/src/student/components/TutorChat.tsx                │ Mode selector, remove "no chapter" option │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ frontend/src/student/pages/Consultant.tsx                    │ Mode selector                             │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ frontend/src/student/layout/StudentLayout.tsx                │ Remove subscription banner                │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ frontend/src/admin/pages/content/SubjectChapters.tsx         │ New admin page                            │
     ├──────────────────────────────────────────────────────────────┼───────────────────────────────────────────┤
     │ frontend/src/admin/pages/PlatformConfig.tsx                  │ Per-feature rate limit config             │
     └──────────────────────────────────────────────────────────────┴───────────────────────────────────────────┘

     ---
     Verification

     After each change block:

     Change 1 (Azure):
     - Start ai_service, call POST /api/tutor/chat — confirm streaming response from Azure endpoint
     - Check embedding works: call GET /api/rag/retrieve test endpoint or trigger a Deep Thinking tutor message

     Change 2 (Subject chapters):
     - Run migration, verify seed rows: SELECT count(*) FROM subject_chapters should be ~30+ rows
     - Call GET /api/internal/subject-structure/compulsory_math — verify JSON matches old structure
     - Open admin panel, navigate to Subject Chapters, add/edit/delete a test chapter

     Change 3 (Modes):
     - Send tutor message in Fast mode — confirm gpt-5-mini used, limited context (no all-time/weekly in prompt)
     - Send tutor message in Deep Thinking — confirm RAG chunks appear in context
     - Send consultant Normal message — confirm web search not triggered
     - Send consultant Thinking message — confirm web search available
     - Verify "No specific chapter" option is gone from tutor UI

     Change 4 (Subscription):
     - Register new user — subscription status should be "free"
     - Free user can access tutor/practice (no 402)
     - Hit rate limit on tutor_fast — get 429 with upgrade prompt, not a banner
     - Admin config page shows per-feature limit inputs and saves correctly