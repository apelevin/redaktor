# SKELETON_REVIEW_APPLY Step Prompt

Ты применяешь ответы пользователя к skeleton_draft.

Твоя задача — обновить структуру skeleton на основе ответов пользователя:
— включить/выключить узлы (status),
— выбрать варианты (selected_variant_id),
— добавить/уточнить данные в domain (через input-вопросы),
— обновить issues (resolve/add),
— сформировать skeleton_final при завершении review.

Юрисдикция: Российская Федерация  
Язык: русский  

## Текущее состояние

```json
{{state_json}}
```

## Review Questions (вопросы, на которые отвечал пользователь)

```json
{{review_questions_json}}
```

## Review Answers (ответы пользователя)

```json
{{review_answers_json}}
```

## ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА:

1. Верни ИСКЛЮЧИТЕЛЬНО валидный JSON, строго соответствующий схеме `llm_step_output.schema.json`.
2. Применяй изменения через patch операции.
3. Для каждого ответа:
   - Найди соответствующий вопрос по `question_id`
   - Примени `impact` операции из выбранных опций
   - Для `text_input`/`number_input`/`multi_text`: запиши значение в `state.domain` по `bind_to_domain_path`
4. Обнови skeleton_draft:
   - Установи `status: "active"` или `status: "omitted"` для узлов согласно impact
   - Установи `selected_variant_id` для узлов с выбранными вариантами
5. Обнови `state.review.answers` (добавь новые ответы).
6. Обнови `state.review.status = "applied"`.
7. Обнови issues:
   - Закрой issues, которые были решены ответами (`resolve_issue`)
   - Добавь новые issues, если ответы создают конфликт/неполноту (`add_issue`)
8. Если `state.review.iteration >= 2` (или достигнут лимит итераций):
   - Скопируй обновленный skeleton в `state.document.skeleton_final`
   - Установи `state.document.freeze.structure = true`
   - Установи `state.review.status = "frozen"`
   - Установи `state.meta.stage = "skeleton_final"`
   - Установи `next_action = { kind: "proceed_to_clause_requirements" }`
9. Если итерация не завершена:
   - Установи `state.review.status = "collecting"`
   - Установи `next_action = { kind: "show_review_questions" }` (для следующей итерации)
10. НЕ добавляй новые узлы (section/clause) после freeze.
11. НЕ удаляй узлы физически — используй только `status: "omitted"`.

## Формат ответа

Верни JSON согласно схеме `llm_step_output.schema.json`:

```json
{
  "output_id": "уникальный_id",
  "step": "SKELETON_REVIEW_APPLY",
  "patch": {
    "format": "merge_patch",
    "ops": {
      "document": {
        "skeleton": {
          "root": {
            // Обновленный skeleton с примененными изменениями
          }
        }
      },
      "review": {
        "answers": [
          // Добавь новые ответы
        ],
        "status": "applied"
      },
      "domain": {
        // Обновления domain из input-вопросов
      },
      "issues": [
        // Обновленные issues
      ]
    }
  },
  "issue_updates": [
    // Если нужно обновить issues
  ],
  "next_action": {
    "kind": "proceed_to_clause_requirements" // или "show_review_questions"
  },
  "rationale": "Применены ответы пользователя. Обновлена структура skeleton: включены/исключены узлы, выбраны варианты, обновлен domain. Review завершен, структура зафиксирована."
}
```

## ЕСЛИ:

— ответы создают конфликт или неполноту,

ТО:

— добавь issues с описанием проблемы,
— установи `next_action = ask_user` для уточнения.

## Важные замечания

- Все изменения должны быть обратимыми (используй status, а не удаление)
- `node_id` должны оставаться стабильными
- При применении `set_domain_value` используй правильные JSON Pointer пути
- При применении `select_variant` убедись, что `variant_id` существует в узле
- При завершении review обязательно создай `skeleton_final` и установи `freeze.structure = true`

Результат должен быть детерминированным и воспроизводимым при одинаковом входном состоянии.
