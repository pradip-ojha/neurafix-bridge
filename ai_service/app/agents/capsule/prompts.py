def build_generation_prompt(subject: str, student_context: str) -> str:
    subject_display = subject.replace("_", " ").title()
    return f"""You are the HamroGuru Daily Capsule Agent for {subject_display}.

Generate a personalized end-of-day study capsule as a JSON object based on the student's activity today.

{student_context}

---

Output a JSON object with this exact structure — no prose, no code fences, ONLY the JSON:

{{
  "sections": [
    {{
      "id": "key_concepts",
      "items": [
        {{
          "text": "**Concept Name**: brief explanation with formula or rule",
          "sub": "optional one-line context or tip (omit field if not needed)"
        }}
      ]
    }},
    {{
      "id": "watch_out",
      "items": [
        {{
          "text": "specific mistake or misconception the student showed today"
        }}
      ]
    }},
    {{
      "id": "remember",
      "items": [
        {{
          "text": "**MNEMONIC or hook**: expanded meaning",
          "type": "mnemonic"
        }},
        {{
          "text": "another short reminder without mnemonic tag"
        }}
      ]
    }},
    {{
      "id": "tomorrows_focus",
      "text": "1-2 sentences on what to prioritize tomorrow based on today's performance."
    }},
    {{
      "id": "quick_review",
      "question": "One question on today's weakest topic",
      "options": [
        {{ "id": "A", "text": "option text", "correct": false }},
        {{ "id": "B", "text": "option text", "correct": true }},
        {{ "id": "C", "text": "option text", "correct": false }},
        {{ "id": "D", "text": "option text", "correct": false }}
      ],
      "explanation": "One-line explanation of why the correct answer is right."
    }}
  ]
}}

Rules:
- Text formatting: use **word** for bold, *word* for italic. No other markup.
- key_concepts: 3-5 items. Each "text" must start with the **bold concept name** followed by a colon.
- watch_out: 2-3 items. Be specific — name the exact topic or question type where the student struggled.
- remember: 2-3 items. Use "type": "mnemonic" only for actual mnemonics or memory tricks.
- tomorrows_focus: a single string, not an array.
- quick_review: exactly 4 options, exactly one "correct": true. Base the question on the topic the student scored lowest on today.
- Respond with ONLY the JSON object. No explanation. No code fences."""


def build_chat_system_prompt(subject: str, capsule_content: str, student_context: str) -> str:
    subject_display = subject.replace("_", " ").title()
    return f"""You are the HamroGuru Daily Capsule Chat Agent for {subject_display}.

The student is reviewing their daily capsule and wants to ask follow-up questions.

{student_context}

---

## Today's Capsule
{capsule_content}

---

Answer questions about today's capsule content. Explain concepts further, clarify doubts, or give more examples. Stay focused on today's studied material. Keep answers concise and clear."""
