Ниже — **готовое задание для Cursor** (копируй целиком). Оно описывает, что именно нужно реализовать для блока **Skeleton Generation** в твоей LLM-first архитектуре (RU-only, без доменных типов в коде, со схемами как данными).

---

# ЗАДАНИЕ ДЛЯ CURSOR: Реализовать блок генерации Skeleton (после Gate=Ready)

## Контекст

У нас уже реализован этап **pre_skeleton**: собираем Contract IR Draft, ведём issues, делаем gate check. В UI видим `Gate Status: Ready`, `Issues: 0`, `Stage: pre_skeleton`. Теперь нужен следующий шаг: **создание Skeleton** — структуры договора, без финальных формулировок.

## Цель

Добавить в пайплайн новый шаг **SKELETON_GENERATE**, который:

1. запускается только если `state.meta.stage = pre_skeleton` и `state.gate.ready_for_skeleton = true`,
2. вызывает LLM и получает `llm_step_output` (patch + next_action),
3. добавляет в `state.document.skeleton` дерево узлов скелетона по JSON-схеме,
4. (опционально) выполняет минимальный lint скелетона и либо ставит issues, либо переводит stage дальше.

---

## Требования к архитектуре (обязательные)

1. **RU-only / RU-law**: язык `ru`, юрисдикция `RU` — константа.
2. **Код не знает доменных полей**: `state.domain` — свободный JSON. Никаких `contract_type`, `payment`, `work_details` и т.п. в коде.
3. **Схемы — как данные**: JSON Schema хранится отдельными файлами/записями и используется:

   * чтобы включать в prompt,
   * чтобы валидировать LLM output,
   * чтобы валидировать итоговый `state.document.skeleton`.
4. **LLM возвращает patch, а не весь state**:

   * patch применяется к текущему `state`,
   * после применения state валидируется.
5. **Никаких юридических текстов** в skeleton: только структура, purpose, requires, tags, include_if.

---

## Что такое Skeleton

Skeleton — это дерево `Node`:

* `node_id` (стабильный id),
* `kind`: document/section/clause/appendix,
* `title`,
* `tags[]` (семантика),
* `include_if[]` (условия включения — по путям в `state.domain`),
* `requires[]` (пути в `state.domain`, которые нужны для генерации текста),
* `purpose` (1–2 предложения, зачем узел),
* `notes_for_generator` (необязательно),
* `children[]`.

---

## Что нужно реализовать (функциональные блоки)

### A) Добавить JSON Schema для skeleton

Создать файл:

* `schemas/contract_skeleton.schema.json`

Схема должна быть универсальной (без доменных полей) и валидировать:

* `root` узел `Node`
* рекурсивно `children`
* поля `node_id, kind, title, tags, children` обязательны
* `include_if` и `requires` опциональны

### B) Добавить место для skeleton в state

После генерации state должен содержать:

* `state.document.skeleton` (объект по contract_skeleton.schema)
* `state.document.skeleton_meta` (версия схемы + timestamps + источник шага)

Важно: если `state.document` не существует — создаётся patch’ем.

### C) Реализовать шаг пайплайна: `SKELETON_GENERATE`

Создать модуль/функцию “run skeleton generation”, который:

1. проверяет preconditions:

   * stage = pre_skeleton
   * gate.ready_for_skeleton = true
2. формирует LLM запрос:

   * системные правила шага (см. ниже),
   * текущий `state`,
   * JSON schema: `llm_step_output.schema.json` и `contract_skeleton.schema.json`
3. вызывает LLM и получает JSON в формате `llm_step_output`:

   * `step = "SKELETON_GENERATE"` (добавить в enum шагов)
   * `patch` должен добавить/обновить `state.document.skeleton`
   * `next_action.kind` должен быть `"proceed_to_clause_requirements"` или `"proceed_to_next_stage"` (выбери одно имя и используй в пайплайне)
4. валидирует LLM output по `llm_step_output.schema.json`
5. применяет patch к state
6. валидирует `state.document.skeleton` по `contract_skeleton.schema.json`
7. сохраняет trace (input state, output, patched state)
8. возвращает обновлённый state и next_action

### D) Мини-линтер skeleton (обязательный, но простой)

Сразу после генерации выполнить проверку:

* у всех узлов есть `tags` и `purpose`
* `node_id` уникальны по дереву
* нет пустых `title`
* нет узлов `clause` без `tags`
* (soft-check) `requires[]` пути не должны быть явно мусорными (пустые строки)

Если линтер находит проблемы:

* создать issue(и) в `state.issues` с severity=high/med
* перевести `state.meta.status = "blocked"`
* `next_action.kind = "ask_user"` или `"halt_error"` (реши стратегию)

Если всё ок:

* `state.meta.stage` переводится в `"skeleton_ready"` (или `"post_skeleton"`, выбери одно)
* `state.meta.status = "collecting"` или `"ready"` — по твоей логике

---

## Правила для LLM (должны быть включены в prompt для шага)

1. Вернуть **строго JSON** в формате `llm_step_output` и пройти schema.
2. **Не генерировать юридические формулировки** пунктов договора. Никаких абзацев договора, только структура.
3. **Не придумывать факты**:

   * если чего-то нет в `state.domain`, не добавлять “как будто есть”;
   * вместо этого указывать в `requires[]` или `include_if[]`;
   * если критично для структуры — вернуть issue_updates и next_action ask_user.
4. Skeleton должен соответствовать RU-юрисдикции и типу договора, который уже выведен/зафиксирован в `state.domain` (если есть), но код это не интерпретирует.
5. `node_id` должны быть стабильными и читаемыми (например по тегам).
6. Каждый узел должен иметь `purpose` (1–2 предложения).

---

## API / UI интеграция

1. Добавить кнопку/действие “Generate Skeleton” 

   * если gate.ready_for_skeleton=true → запускаем `SKELETON_GENERATE`
2. В UI отобразить `state.document.skeleton` как дерево.
3. Показать статус: “Skeleton готов” или “Skeleton заблокирован issues”.

---

## Определение Done

* На примере “трудовой договор” система создаёт skeleton-дерево с секциями и пунктами.
* Skeleton валиден по схеме.
* В skeleton нет юридического текста, только структура.
* node_id уникальны и стабильны.
* Если `state.domain` неполный, шаг не “выдумывает”, а создаёт issues и/или задаёт уточнение.

