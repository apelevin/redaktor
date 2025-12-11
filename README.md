# Редактор документов

Редактор юридических документов с интеллектуальной системой вопросов.

## Структура проекта

- `app/` - Next.js App Router компоненты и страницы
- `lib/` - Бизнес-логика и утилиты
- `types/` - TypeScript типы
- `prompts/` - Промпты для LLM (в отдельных Markdown файлах)

## Установка

```bash
npm install
```

## Настройка

Создайте файл `.env.local` с переменными окружения:

```
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5.1
```

Опционально можно настроить:
```
OPENAI_REASONING_EFFORT=medium  # none, low, medium, high (когда будет поддержка в SDK)
OPENAI_VERBOSITY=medium          # low, medium, high (когда будет поддержка в SDK)
```

## Запуск

```bash
npm run dev
```

Приложение будет доступно по адресу `http://localhost:3000`

## Функциональность

- **Layout**: Две панели - слева документ, справа чат
- **Система вопросов**: Поддержка трех типов вопросов (open, single, multi)
- **Интеграция с OpenAI**: Вопросы генерируются динамически через OpenAI API с использованием модели GPT-5.1
- **State Management**: Zustand для управления состоянием документа

## Типы вопросов

- `open` - открытый текстовый ответ
- `single` - выбор одного варианта (radio)
- `multi` - выбор нескольких вариантов (checkboxes)

