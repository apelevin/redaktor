Ниже — **(1) минимальная JSON Schema для `skeleton_review_questions`**, **(2) schema для `skeleton_review_answers`**, и **(3) короткий пример 3 вопросов**. Всё универсально: без доменных полей и без привязки к типу договора.

---

## 1) `schemas/skeleton_review_questions.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "schema://legalagi/skeleton_review_questions/1.0.0",
  "title": "Skeleton Review Questions (Universal UX)",
  "type": "object",
  "additionalProperties": false,
  "required": ["review_id", "iteration", "questions"],
  "properties": {
    "review_id": { "type": "string", "minLength": 6 },
    "iteration": { "type": "integer", "minimum": 0, "maximum": 5 },
    "questions": {
      "type": "array",
      "minItems": 1,
      "maxItems": 12,
      "items": { "$ref": "#/$defs/Question" }
    }
  },
  "$defs": {
    "Question": {
      "type": "object",
      "additionalProperties": false,
      "required": ["question_id", "title", "ux", "binding", "priority"],
      "properties": {
        "question_id": { "type": "string", "minLength": 4 },
        "title": { "type": "string", "minLength": 5 },
        "description": { "type": "string" },

        "priority": { "type": "integer", "minimum": 1, "maximum": 100 },
        "required": { "type": "boolean", "default": false },

        "ux": { "$ref": "#/$defs/UXSpec" },

        "binding": { "$ref": "#/$defs/Binding" },

        "constraints": { "$ref": "#/$defs/Constraints" },

        "why_this_matters": {
          "type": "string",
          "description": "1–2 sentences: why user should decide this now."
        }
      }
    },

    "UXSpec": {
      "type": "object",
      "additionalProperties": false,
      "required": ["type"],
      "properties": {
        "type": {
          "type": "string",
          "enum": ["checkbox_group", "radio_group", "text_input", "number_input", "multi_text"]
        },
        "options": {
          "type": "array",
          "items": { "$ref": "#/$defs/Option" },
          "minItems": 2
        },
        "placeholder": { "type": "string" },
        "fields": {
          "type": "array",
          "description": "Used only for multi_text. Defines multiple input fields.",
          "items": { "$ref": "#/$defs/InputField" },
          "minItems": 1,
          "maxItems": 10
        }
      },
      "allOf": [
        {
          "if": { "properties": { "type": { "enum": ["checkbox_group", "radio_group"] } } },
          "then": { "required": ["options"] }
        },
        {
          "if": { "properties": { "type": { "const": "multi_text" } } },
          "then": { "required": ["fields"] }
        }
      ]
    },

    "Option": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "label", "value", "impact"],
      "properties": {
        "id": { "type": "string", "minLength": 2 },
        "label": { "type": "string", "minLength": 1 },
        "value": {
          "description": "Value sent back as answer; usually string/boolean.",
          "type": ["string", "number", "boolean"]
        },
        "impact": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/$defs/ImpactOp" }
        }
      }
    },

    "InputField": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "label", "bind_to_domain_path", "input_type"],
      "properties": {
        "id": { "type": "string", "minLength": 2 },
        "label": { "type": "string", "minLength": 1 },
        "input_type": { "type": "string", "enum": ["text", "number"] },
        "placeholder": { "type": "string" },
        "bind_to_domain_path": {
          "type": "string",
          "description": "JSON pointer path into state.domain where the value should be written."
        },
        "required": { "type": "boolean", "default": false }
      }
    },

    "Binding": {
      "type": "object",
      "additionalProperties": false,
      "required": ["node_ids"],
      "properties": {
        "node_ids": {
          "type": "array",
          "items": { "type": "string" },
          "minItems": 1
        },
        "bind_to_domain_path": {
          "type": "string",
          "description": "For text_input/number_input (single field) – where to write value in state.domain."
        }
      }
    },

    "Constraints": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "min": { "type": "number" },
        "max": { "type": "number" },
        "max_length": { "type": "integer", "minimum": 1 },
        "pattern": { "type": "string" }
      }
    },

    "ImpactOp": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op"],
      "properties": {
        "op": {
          "type": "string",
          "enum": [
            "set_node_status",
            "select_variant",
            "set_domain_value",
            "add_issue",
            "resolve_issue"
          ]
        },

        "node_id": { "type": "string" },
        "status": { "type": "string", "enum": ["active", "omitted"] },

        "variant_id": { "type": "string" },

        "path": {
          "type": "string",
          "description": "JSON pointer into state.domain for set_domain_value."
        },
        "value": {},

        "issue_id": { "type": "string" },
        "issue_payload": {
          "type": "object",
          "additionalProperties": true,
          "description": "Free-form issue object; must be compatible with your Issue schema."
        }
      },
      "allOf": [
        {
          "if": { "properties": { "op": { "const": "set_node_status" } } },
          "then": { "required": ["node_id", "status"] }
        },
        {
          "if": { "properties": { "op": { "const": "select_variant" } } },
          "then": { "required": ["node_id", "variant_id"] }
        },
        {
          "if": { "properties": { "op": { "const": "set_domain_value" } } },
          "then": { "required": ["path", "value"] }
        },
        {
          "if": { "properties": { "op": { "const": "add_issue" } } },
          "then": { "required": ["issue_payload"] }
        },
        {
          "if": { "properties": { "op": { "const": "resolve_issue" } } },
          "then": { "required": ["issue_id"] }
        }
      ]
    }
  }
}
```

---

## 2) `schemas/skeleton_review_answers.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "schema://legalagi/skeleton_review_answers/1.0.0",
  "title": "Skeleton Review Answers (Universal)",
  "type": "object",
  "additionalProperties": false,
  "required": ["review_id", "answers"],
  "properties": {
    "review_id": { "type": "string", "minLength": 6 },
    "answers": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/Answer" }
    }
  },
  "$defs": {
    "Answer": {
      "type": "object",
      "additionalProperties": false,
      "required": ["question_id", "value", "at"],
      "properties": {
        "question_id": { "type": "string" },
        "value": {
          "description": "Depends on ux.type: boolean/string/number/string[]/object",
          "type": ["string", "number", "boolean", "array", "object", "null"]
        },
        "at": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

---

## 3) Пример `review_questions` (3 вопроса, универсально)

```json
{
  "review_id": "rev_001",
  "iteration": 0,
  "questions": [
    {
      "question_id": "q_optional_blocks",
      "title": "Какие опциональные блоки добавить в структуру?",
      "description": "Отметьте блоки, которые точно должны быть в договоре. Остальные можно не включать.",
      "priority": 10,
      "required": false,
      "why_this_matters": "Это изменит структуру документа: появятся/исчезнут разделы и пункты.",
      "binding": { "node_ids": ["doc_root"] },
      "ux": {
        "type": "checkbox_group",
        "options": [
          {
            "id": "opt_personal_data",
            "label": "Раздел про обработку персональных данных",
            "value": "personal_data",
            "impact": [
              { "op": "set_node_status", "node_id": "sec_personal_data", "status": "active" }
            ]
          },
          {
            "id": "opt_confidentiality",
            "label": "Раздел про конфиденциальность/коммерческую тайну",
            "value": "confidentiality",
            "impact": [
              { "op": "set_node_status", "node_id": "sec_confidentiality", "status": "active" }
            ]
          },
          {
            "id": "opt_disputes",
            "label": "Раздел про порядок разрешения споров",
            "value": "disputes",
            "impact": [
              { "op": "set_node_status", "node_id": "sec_disputes", "status": "active" }
            ]
          }
        ]
      }
    },
    {
      "question_id": "q_detail_level",
      "title": "Насколько подробно описывать условия?",
      "description": "Выберите уровень детализации структуры: коротко или подробно.",
      "priority": 20,
      "required": true,
      "why_this_matters": "Это определит, какие пункты будут включены (короткая версия или расширенная).",
      "binding": { "node_ids": ["doc_root"] },
      "ux": {
        "type": "radio_group",
        "options": [
          {
            "id": "opt_short",
            "label": "Короткая версия (только ключевые пункты)",
            "value": "short",
            "impact": [
              { "op": "select_variant", "node_id": "doc_root", "variant_id": "v_short" }
            ]
          },
          {
            "id": "opt_full",
            "label": "Подробная версия (расширенные пункты)",
            "value": "full",
            "impact": [
              { "op": "select_variant", "node_id": "doc_root", "variant_id": "v_full" }
            ]
          }
        ]
      }
    },
    {
      "question_id": "q_key_parameter",
      "title": "Уточните один ключевой параметр, влияющий на структуру",
      "description": "Введите значение. Если не знаете — оставьте пустым.",
      "priority": 30,
      "required": false,
      "why_this_matters": "Некоторые разделы и пункты могут включаться или выключаться в зависимости от этого параметра.",
      "binding": {
        "node_ids": ["doc_root"],
        "bind_to_domain_path": "/domain/parameters/key_parameter"
      },
      "ux": {
        "type": "text_input",
        "placeholder": "Например: “нужен испытательный срок / нет”, “поставка партиями”, “SLA 99.9%”…"
      },
      "constraints": { "max_length": 200 }
    }
  ]
}
```

> Важно: в реальной системе `sec_personal_data`/`sec_confidentiality` должны существовать в skeleton как **узлы со статусом omitted по умолчанию** (или как variants), чтобы review мог их “включить”, не создавая новые узлы. Это даёт стабильность и не ломает freeze.

---

## Рекомендация по структуре skeleton для совместимости с review

Чтобы review был мощным без “добавления новых узлов”, сделай в skeleton_draft:

* опциональные секции/пункты уже присутствуют, но:

  * `status: "omitted"` и/или `include_if` false по умолчанию
* документ имеет `variants` (short/full), где “full” включает больше clauses

Тогда review — это выбор чекбоксов/радио, который просто переключает `status/variant`.

---
