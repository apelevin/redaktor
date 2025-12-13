# Промпты для LegalAGI

Эта папка содержит промпты для различных шагов LLM.

## Формат промптов

Промпты хранятся в файлах `.md` (Markdown) и используют шаблонизацию с переменными:

- `{{variable_name}}` — подстановка значения переменной
- Переменные передаются через `loadPrompt(filename, variables)`

## Доступные промпты

### `interpret-step.md`
Промпт для шага INTERPRET — извлечение фактов из сообщения пользователя.

**Переменные:**
- `{{domain_json}}` — JSON domain из state (форматированный)
- `{{issues_json}}` — JSON массив issues (форматированный)
- `{{recent_history}}` — последние N сообщений диалога (текстовый формат)
- `{{last_message}}` — последнее сообщение пользователя

**Использование:**
```typescript
import { loadPrompt } from '@/backend/prompts/prompt-loader';

const prompt = await loadPrompt('interpret-step.md', {
  domain_json: JSON.stringify(state.domain, null, 2),
  issues_json: JSON.stringify(state.issues, null, 2),
  recent_history: formatDialogueHistory(state.dialogue.history.slice(-5)),
  last_message: userMessage,
});
```

### `gate-check-step.md`
Промпт для шага GATE_CHECK — проверка готовности к skeleton.

**Переменные:**
- `{{state_json}}` — полный state (форматированный JSON)

**Использование:**
```typescript
const prompt = await loadPrompt('gate-check-step.md', {
  state_json: JSON.stringify(state, null, 2),
});
```

## Версионирование

Для версионирования промптов используйте суффиксы:
- `interpret-step-v1.md`
- `interpret-step-v2.md`

В `prompt-loader.ts` можно добавить поддержку указания версии при загрузке.

## Редактирование промптов

При редактировании промптов:
1. Обновляйте переменные в этом README
2. Тестируйте промпты с реальными данными
3. Сохраняйте старые версии для отката

## Кэширование

Промпты кэшируются в памяти для производительности. Для перезагрузки используйте `clearPromptCache()`.
