Ниже — **минимальные универсальные** концептуальные JSON Schema для:

1. `state` (Contract IR Draft для этапа “до skeleton”)
2. `llm_output` (ответ LLM: patch + next_action)

Они **не содержат доменных полей** (всё доменное живёт внутри `domain` как `object` без ограничений).

---

## 1) `pre_skeleton_state.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "schema://legalagi/pre_skeleton_state/1.0.0",
  "title": "LegalAGI Pre-Skeleton State (Minimal, Universal)",
  "type": "object",
  "additionalProperties": false,
  "required": ["meta", "domain", "issues", "dialogue", "control"],
  "properties": {
    "meta": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "session_id",
        "schema_id",
        "schema_version",
        "stage",
        "created_at",
        "updated_at"
      ],
      "properties": {
        "session_id": { "type": "string", "minLength": 8 },
        "schema_id": { "type": "string" },
        "schema_version": { "type": "string" },
        "stage": {
          "type": "string",
          "enum": ["pre_skeleton"]
        },
        "locale": {
          "type": "object",
          "additionalProperties": false,
          "required": ["language", "jurisdiction"],
          "properties": {
            "language": { "type": "string", "enum": ["ru"] },
            "jurisdiction": { "type": "string", "enum": ["RU"] }
          }
        },
        "status": {
          "type": "string",
          "enum": ["collecting", "gating", "ready", "blocked"]
        },
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" },
        "state_version": {
          "type": "integer",
          "minimum": 0
        }
      }
    },

    "domain": {
      "type": "object",
      "description": "All domain facts, assumptions, entities, and extracted structure. No fixed keys enforced here.",
      "additionalProperties": true
    },

    "issues": {
      "type": "array",
      "default": [],
      "items": { "$ref": "#/$defs/Issue" }
    },

    "dialogue": {
      "type": "object",
      "additionalProperties": false,
      "required": ["history", "asked"],
      "properties": {
        "history": {
          "type": "array",
          "description": "Conversation trace (may be truncated).",
          "items": { "$ref": "#/$defs/DialogueTurn" }
        },
        "asked": {
          "type": "array",
          "description": "Previously asked questions to support deduplication.",
          "items": { "$ref": "#/$defs/AskedQuestion" }
        }
      }
    },

    "control": {
      "type": "object",
      "additionalProperties": false,
      "required": ["limits", "checks", "flags"],
      "properties": {
        "limits": {
          "type": "object",
          "additionalProperties": false,
          "required": ["max_questions_per_run", "max_loops", "max_history_turns"],
          "properties": {
            "max_questions_per_run": { "type": "integer", "minimum": 1, "maximum": 10 },
            "max_loops": { "type": "integer", "minimum": 1, "maximum": 50 },
            "max_history_turns": { "type": "integer", "minimum": 3, "maximum": 200 }
          }
        },
        "checks": {
          "type": "object",
          "additionalProperties": false,
          "required": ["require_user_confirmation_for_assumptions"],
          "properties": {
            "require_user_confirmation_for_assumptions": { "type": "boolean" }
          }
        },
        "flags": {
          "type": "object",
          "description": "Arbitrary runtime flags. Keep flexible.",
          "additionalProperties": true
        }
      }
    },

    "gate": {
      "type": "object",
      "description": "Optional. Filled after gate check.",
      "additionalProperties": false,
      "required": ["ready_for_skeleton", "summary"],
      "properties": {
        "ready_for_skeleton": { "type": "boolean" },
        "summary": {
          "type": "string",
          "description": "1-3 sentences explaining readiness/blockers."
        },
        "blockers": {
          "type": "array",
          "items": { "$ref": "#/$defs/GateBlocker" }
        }
      }
    }
  },

  "$defs": {
    "DialogueTurn": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "role", "text", "at"],
      "properties": {
        "id": { "type": "string" },
        "role": { "type": "string", "enum": ["user", "assistant", "system"] },
        "text": { "type": "string", "minLength": 1 },
        "at": { "type": "string", "format": "date-time" }
      }
    },

    "AskedQuestion": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "text", "at"],
      "properties": {
        "id": { "type": "string" },
        "text": { "type": "string", "minLength": 1 },
        "at": { "type": "string", "format": "date-time" },
        "semantic_fingerprint": {
          "type": "string",
          "description": "Optional. For semantic dedup; e.g., short hash."
        }
      }
    },

    "Issue": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id",
        "severity",
        "title",
        "status",
        "why_it_matters",
        "resolution_hint"
      ],
      "properties": {
        "id": { "type": "string" },
        "key": {
          "type": "string",
          "description": "Optional stable key for dedup. Not required."
        },
        "severity": {
          "type": "string",
          "enum": ["critical", "high", "med", "low"]
        },
        "status": {
          "type": "string",
          "enum": ["open", "resolved", "dismissed"]
        },
        "title": { "type": "string", "minLength": 3 },
        "why_it_matters": { "type": "string", "minLength": 3 },
        "missing_or_conflict": {
          "type": "string",
          "description": "What exactly is missing/contradictory."
        },
        "resolution_hint": {
          "type": "string",
          "description": "What to ask/confirm to resolve."
        },
        "requires_user_confirmation": {
          "type": "boolean",
          "default": false
        },
        "evidence": {
          "type": "array",
          "description": "Optional pointers to dialogue turns or extracted facts.",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["kind", "ref"],
            "properties": {
              "kind": { "type": "string", "enum": ["turn", "fact_path", "note"] },
              "ref": { "type": "string" }
            }
          }
        }
      }
    },

    "GateBlocker": {
      "type": "object",
      "additionalProperties": false,
      "required": ["severity", "message"],
      "properties": {
        "severity": { "type": "string", "enum": ["critical", "high", "med", "low"] },
        "message": { "type": "string" },
        "linked_issue_ids": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  }
}
```

---

## 2) `llm_step_output.schema.json`

Это контракт, который **каждый шаг LLM** обязан вернуть. Он универсальный: доменная часть только в виде patch’ей к `state.domain` и сопутствующих updates.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "schema://legalagi/llm_step_output/1.0.0",
  "title": "LegalAGI LLM Step Output (Minimal, Universal)",
  "type": "object",
  "additionalProperties": false,
  "required": ["output_id", "step", "patch", "next_action", "rationale"],
  "properties": {
    "output_id": { "type": "string" },

    "step": {
      "type": "string",
      "enum": ["INTERPRET", "GATE_CHECK"]
    },

    "patch": {
      "type": "object",
      "additionalProperties": false,
      "required": ["format", "ops"],
      "properties": {
        "format": {
          "type": "string",
          "enum": ["json_patch", "merge_patch"]
        },

        "ops": {
          "description": "If json_patch: RFC 6902 array of operations. If merge_patch: a single object.",
          "oneOf": [
            {
              "type": "array",
              "items": { "$ref": "#/$defs/JsonPatchOp" }
            },
            {
              "type": "object",
              "additionalProperties": true
            }
          ]
        }
      }
    },

    "issue_updates": {
      "type": "array",
      "description": "Optional. Add/update issues. Keep it separate from patch for clarity.",
      "items": { "$ref": "#/$defs/IssueUpsert" }
    },

    "next_action": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind"],
      "properties": {
        "kind": {
          "type": "string",
          "enum": ["ask_user", "proceed_to_gate", "proceed_to_skeleton", "halt_error"]
        },
        "ask_user": { "$ref": "#/$defs/AskUserAction" },
        "error": { "$ref": "#/$defs/HaltError" }
      },
      "allOf": [
        {
          "if": { "properties": { "kind": { "const": "ask_user" } } },
          "then": { "required": ["ask_user"] }
        },
        {
          "if": { "properties": { "kind": { "const": "halt_error" } } },
          "then": { "required": ["error"] }
        }
      ]
    },

    "rationale": {
      "type": "string",
      "description": "Short explanation for debugging and trace (1-6 sentences).",
      "minLength": 3
    },

    "safety": {
      "type": "object",
      "description": "Optional flags that affect orchestration decisions.",
      "additionalProperties": false,
      "properties": {
        "has_unconfirmed_assumptions": { "type": "boolean" },
        "detected_conflict": { "type": "boolean" },
        "repeat_question_risk": { "type": "boolean" }
      }
    },

    "observations": {
      "type": "array",
      "description": "Optional short notes about extracted facts/ambiguities.",
      "items": { "type": "string" }
    }
  },

  "$defs": {
    "JsonPatchOp": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "path"],
      "properties": {
        "op": { "type": "string", "enum": ["add", "remove", "replace", "move", "copy", "test"] },
        "path": { "type": "string", "minLength": 1 },
        "from": { "type": "string" },
        "value": {}
      },
      "allOf": [
        {
          "if": { "properties": { "op": { "enum": ["add", "replace", "test"] } } },
          "then": { "required": ["value"] }
        },
        {
          "if": { "properties": { "op": { "enum": ["move", "copy"] } } },
          "then": { "required": ["from"] }
        }
      ]
    },

    "IssueUpsert": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "issue"],
      "properties": {
        "op": { "type": "string", "enum": ["upsert", "resolve", "dismiss"] },
        "issue": {
          "type": "object",
          "additionalProperties": true,
          "description": "Must conform to the Issue definition used by the state schema. Kept loose here for modularity."
        }
      }
    },

    "AskUserAction": {
      "type": "object",
      "additionalProperties": false,
      "required": ["question_text", "answer_format"],
      "properties": {
        "question_id": {
          "type": "string",
          "description": "Optional stable id for dedup (LLM may omit)."
        },
        "question_text": { "type": "string", "minLength": 5 },
        "answer_format": {
          "type": "string",
          "enum": ["free_text", "choices"]
        },
        "choices": {
          "type": "array",
          "items": { "$ref": "#/$defs/Choice" },
          "minItems": 2
        },
        "why_this_question": {
          "type": "string",
          "description": "1-2 sentences linking to the issue it resolves."
        },
        "links_to_issue_ids": {
          "type": "array",
          "items": { "type": "string" }
        }
      },
      "allOf": [
        {
          "if": { "properties": { "answer_format": { "const": "choices" } } },
          "then": { "required": ["choices"] }
        }
      ]
    },

    "Choice": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "label", "value"],
      "properties": {
        "id": { "type": "string" },
        "label": { "type": "string" },
        "value": { "type": ["string", "number", "boolean"] }
      }
    },

    "HaltError": {
      "type": "object",
      "additionalProperties": false,
      "required": ["message", "category"],
      "properties": {
        "category": {
          "type": "string",
          "enum": ["schema_validation", "insufficient_context", "policy_violation", "other"]
        },
        "message": { "type": "string", "minLength": 5 },
        "suggested_recovery": { "type": "string" }
      }
    }
  }
}
```

---

## Как этим пользоваться в пайплайне (1 абзац, чтобы вставить в Cursor)

* На каждом ходе оркестратор отдаёт LLM текущий `state` + последнюю реплику + актуальные схемы.
* LLM возвращает `llm_step_output`.
* Сервис валидирует его по `llm_step_output.schema.json`, применяет `patch` к `state`, затем применяет `issue_updates` (или тоже через patch — но лучше отдельно).
* Сервис исполняет `next_action`: задаёт вопрос, запускает gate, или отдаёт управление на генерацию skeleton.

Если хочешь, я добавлю ещё третью схему — **`schema_registry_record`**, чтобы сами схемы были версионируемыми объектами (с compatibility и migration notes), но для V1 это опционально.
