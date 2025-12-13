Ниже — **PRO-версия архитектуры целиком** (готовая вставка в Cursor как новый `ARCHITECTURE_PRO.md`).
Главное отличие: **мы НЕ ограничиваемся `DocumentType`**, вместо этого агент строит **Document Profile** (юридический профиль документа) из целей/контекста, и уже от него выводит issues, структуру, требования к пунктам и вопросы HITL.

---

````md
# ARCHITECTURE (PRO) — Legal Document Workspace (RU Law)

## 0. Что это

Это **специализированное рабочее место**:  
- слева (2/3) — документ,  
- справа (1/3) — чат с Legal Agent.

Агент делает **только юридические документы** и работает пошагово (step-based), встраивая **Human-in-the-Loop (HITL)** как обязательный механизм:

- агент задаёт вопросы только в юридически/бизнес-критичных развилках,
- предлагает варианты формулировок прямо в чате (кнопки/опции/формы),
- требует заполнения **сторон договора и реквизитов** (не придумывает).

Фокус: **российское законодательство**, русскоязычный drafting (опционально двуязычный).

---

## 1. Принципы PRO-версии

### 1.1. Не ограничиваемся типами документов
Пользователь не выбирает “NDA/SaaS/Lease” из списка.  
Вместо этого агент строит **DocumentProfile** — юридический профиль документа: какие правовые домены участвуют, какие блоки обязательны, какие паттерны запрещены/опасны, какие решения нужно получить от пользователя.

### 1.2. Уровень рассуждения = размер и глубина документа
Пользователь выбирает уровень:
- **basic**: 1–2 страницы, минимум необходимых положений,
- **standard**: 3–5 страниц, “рыночный” уровень,
- **professional**: объёмный документ, максимум защит/edge-cases.

Этот уровень управляет:
- количеством блоков,
- детализацией требований к пунктам,
- “verbosity” генерации,
- глубиной финального линта.

### 1.3. HITL встроен в pipeline
HITL — равноправный элемент исполнения.  
Если шаг требует решения пользователя → агент возвращает `need_user_input` и стопится.

### 1.4. Стороны и реквизиты — first-class сущности
Стороны (с ролями) и реквизиты существуют как структурированные объекты, а не “строчка преамбулы”.  
Если критичных реквизитов нет → агент запрашивает форму.

---

## 2. UX / UI layout

### 2.1 DocumentPane (2/3)
- отображает документ как структуру: секции/пункты,
- подсветка `highlightedSectionId` / `highlightedClauseId`,
- поддержка ручных правок пользователя,
- документ “источник правды”.

### 2.2 ChatPane (1/3)
- единственное место взаимодействия с агентом,
- интерактивные вопросы:
  - single_choice / multi_choice / free_text / form,
- агент объясняет последствия выбора и рекомендует варианты.

---

## 3. API и step-based протокол

### 3.1 Запрос к агенту
```ts
interface AgentStepRequest {
  conversationId: string;
  agentState: AgentState | null;

  userMessage?: string;
  userAnswer?: UserAnswer;

  documentPatchFromUser?: DocumentPatch; // пользователь мог править документ слева
}
````

### 3.2 Ответ агента

```ts
type AgentStepResult =
  | { type: "continue"; state: AgentState; documentPatch?: DocumentPatch; chatMessages: ChatMessage[]; highlightedSectionId?: string; highlightedClauseId?: string; }
  | { type: "need_user_input"; state: AgentState; documentPatch?: DocumentPatch; question: UserQuestion; chatMessages: ChatMessage[]; highlightedSectionId?: string; highlightedClauseId?: string; }
  | { type: "finished"; state: AgentState; document: LegalDocument; chatMessages: ChatMessage[]; };
```

---

## 4. Доменные модели PRO

### 4.1 Уровень рассуждения и политика размера

```ts
type ReasoningLevel = "basic" | "standard" | "professional";

interface DocumentSizePolicy {
  targetPages: { min: number; max: number };
  maxSections: number;
  maxClauses: number;
  verbosity: "low" | "medium" | "high";
  includeEdgeCases: boolean;
  includeOptionalProtections: boolean;
}

const SIZE_POLICY: Record<ReasoningLevel, DocumentSizePolicy> = {
  basic: { targetPages:{min:1,max:2}, maxSections:6, maxClauses:12, verbosity:"low", includeEdgeCases:false, includeOptionalProtections:false },
  standard: { targetPages:{min:3,max:5}, maxSections:10, maxClauses:22, verbosity:"medium", includeEdgeCases:false, includeOptionalProtections:true },
  professional: { targetPages:{min:6,max:30}, maxSections:18, maxClauses:45, verbosity:"high", includeEdgeCases:true, includeOptionalProtections:true }
};
```

---

### 4.2 Стороны договора (RU реквизиты)

```ts
type PartyRole = "customer" | "vendor" | "employer" | "employee" | "landlord" | "tenant" | "contractor" | "other";

interface PartyIdentifiersRU { inn?: string; ogrn?: string; kpp?: string; }

interface PartyRepresentative { name: string; position: string; basis: string; } // "на основании Устава" / "доверенности"

interface ContractParty {
  id: string;
  role: PartyRole;

  displayName: string;     // "Заказчик", "Исполнитель" — как в тексте
  legalName?: string;      // "ООО «Ромашка»"
  legalForm?: string;      // ООО/АО/ИП

  identifiers?: PartyIdentifiersRU;
  address?: string;

  representative?: PartyRepresentative;

  bankDetails?: { account?: string; bankName?: string; bik?: string; corrAccount?: string; };
}
```

---

### 4.3 DocumentProfile (замена DocumentType)

#### 4.3.1 Legal domains (модули права/контракта)

```ts
type LegalDomain =
  | "confidentiality"
  | "services"
  | "ip"
  | "license"
  | "sla"
  | "data_protection_ru"
  | "security"
  | "payment"
  | "liability"
  | "termination"
  | "dispute_resolution"
  | "governing_law"
  | "employment_ru"
  | "lease_ru"
  | "consumer"
  | "compliance"
  | "force_majeure"
  | "other";
```

#### 4.3.2 Legal blocks (структурные блоки документа)

```ts
type LegalBlock =
  | "preamble_parties"
  | "definitions"
  | "subject_scope"
  | "deliverables_acceptance"
  | "fees_payment"
  | "confidentiality"
  | "ip_rights"
  | "license_terms"
  | "service_levels_sla"
  | "data_protection_ru"
  | "info_security"
  | "warranties"
  | "liability_cap_exclusions"
  | "indemnities"
  | "term_renewal"
  | "termination"
  | "force_majeure"
  | "dispute_resolution"
  | "governing_law"
  | "notices"
  | "misc";
```

#### 4.3.3 Профиль документа

```ts
interface DocumentProfile {
  // Описание "что мы строим"
  primaryPurpose: string;          // "договор на услуги разработки", "соглашение о конфиденциальности" и т.п.
  legalDomains: LegalDomain[];     // какие домены участвуют
  mandatoryBlocks: LegalBlock[];   // must-have блоки
  optionalBlocks: LegalBlock[];    // nice-to-have (в зависимости от reasoningLevel)
  prohibitedPatterns: string[];    // запрещённые/опасные паттерны для РФ (например, "non-compete" в определённых случаях)
  marketArchetype?: string;        // ориентир: "Services + IP assignment (RU)"
  riskPosture: "conservative" | "balanced" | "aggressive";
}
```

---

### 4.4 Decisions (явные решения пользователя)

```ts
type DecisionKey =
  | "governing_law"
  | "dispute_resolution"
  | "liability_cap"
  | "term"
  | "auto_renewal"
  | "pd_regime_ru"
  | "sla_level"
  | "payment_terms"
  | "termination_rights"
  | "ip_model"
  | "other";

interface DecisionRecord<T> { key: DecisionKey; value: T; source: "user" | "default" | "model_suggestion"; timestamp: string; }

type DecisionsMap = Record<string, DecisionRecord<any>>;
```

---

### 4.5 Questions (варианты в чате)

```ts
type QuestionType = "single_choice" | "multi_choice" | "free_text" | "form";

interface QuestionOption {
  id: string;
  label: string;
  legalEffect: string;
  riskLevel: "low" | "medium" | "high";
  isMarketStandard?: boolean;
  isRecommended?: boolean;
}

interface UserQuestion {
  id: string;
  type: QuestionType;
  title: string;
  text: string;
  options?: QuestionOption[];

  relatesToSectionId?: string;
  relatesToClauseId?: string;

  decisionKey?: DecisionKey;   // если вопрос пишет в decisions
  required: boolean;
  legalImpact: string;
}

interface UserAnswer {
  questionId: string;
  selectedOptionIds?: string[];
  freeText?: string;
  formData?: Record<string, any>;
}
```

---

### 4.6 Документ, секции, пункты, владение правками

```ts
interface DocumentSection { id: string; title: string; order: number; clauseRequirementIds: string[]; }

interface DocumentSkeleton { sections: DocumentSection[]; }

interface ClauseRequirement {
  id: string;
  sectionId: string;
  title: string;
  purpose: string;

  requiredElements: string[];
  recommendedElements: string[];

  relatedDomains: LegalDomain[];
  relatedBlocks: LegalBlock[];

  relatedDecisions?: DecisionKey[];
  relatedPartyRoles?: PartyRole[];
}

interface ClauseDraft {
  requirementId: string;
  text: string;
  reasoningSummary: string;

  source: "model" | "user" | "merged";
  lockedByUser?: boolean;
  version: number;
}

interface LegalDocument {
  id: string;
  mission: LegalDocumentMission;
  profile: DocumentProfile;

  skeleton: DocumentSkeleton;
  clauseRequirements: ClauseRequirement[];
  clauseDrafts: ClauseDraft[];

  finalText: string;
}
```

---

### 4.7 Mission (содержит profile вместо documentType)

```ts
interface LegalDocumentMission {
  rawUserInput: string;

  jurisdiction: string[];        // напр. ["RU"]
  language: "ru" | "en" | "dual";

  parties: ContractParty[];

  businessContext: string;
  userGoals: string[];

  reasoningLevel: ReasoningLevel;
  stylePresetId: string;

  // PRO: профиль документа — вместо жёсткого типа
  profile?: DocumentProfile;
}
```

---

## 5. AgentState (PRO)

```ts
type PipelineStepId =
  | "mission_interpreter"
  | "profile_builder"
  | "party_details_collector"
  | "decision_collector"
  | "issue_spotter"
  | "skeleton_generator"
  | "clause_requirements_generator"
  | "style_planner"
  | "clause_generator"
  | "document_linter";

interface AgentState {
  conversationId: string;

  plan: PipelineStepId[];
  stepCursor: number;

  mission?: LegalDocumentMission;
  profile?: DocumentProfile;

  sizePolicy: DocumentSizePolicy;

  parties: ContractParty[];
  decisions: DecisionsMap;

  skeleton?: DocumentSkeleton;
  clauseRequirements?: ClauseRequirement[];
  clauseDrafts?: ClauseDraft[];

  highlightedSectionId?: string;
  highlightedClauseId?: string;
}
```

---

## 6. Пайплайн (PRO) — шаги и HITL

### 6.1 `mission_interpreter`

Цель: распарсить запрос, уточнить:

* юрисдикцию/язык,
* уровень рассуждения (basic/standard/pro),
* первичную цель документа.

HITL:

* выбор reasoningLevel (кнопки),
* если цель/контекст неясны — уточняющий вопрос.

---

### 6.2 `profile_builder` (новый ключевой шаг)

Цель: построить `DocumentProfile`:

* определить `legalDomains`,
* выбрать обязательные `mandatoryBlocks`,
* определить `prohibitedPatterns` для РФ,
* накинуть базовый `marketArchetype`.

Алгоритм:

* правило-движок (rules) + LLM для уточнения.
* вход: mission.businessContext + userGoals + jurisdiction=RU.
* выход: profile.

HITL:

* только если есть неоднозначность профиля (например: отчуждение прав vs лицензия).

---

### 6.3 `party_details_collector`

Цель: собрать parties и реквизиты.

HITL (форма):

* legalName, legalForm, ИНН/ОГРН/КПП, адрес,
* подписант и основание полномочий,
* банковские реквизиты (опционально).

Принцип: агент НЕ придумывает реквизиты.

---

### 6.4 `decision_collector` (сквозной)

Цель: собрать критические решения пользователя:

* governing law / dispute,
* liability cap,
* term/renewal,
* IP модель (лицензия vs отчуждение),
* PD режим (если применимо).

Этот шаг может повторно вызываться после линтера (когда возникают новые вопросы).

HITL: кнопки/варианты в чате.

---

### 6.5 `issue_spotter`

Цель: сформировать issues из profile + reasoningLevel policy:

* basic → required issues,
* professional → + edge-cases.

HITL:

* опциональные блоки (например, аудит/расширенные гарантии).

---

### 6.6 `skeleton_generator`

Цель: построить skeleton из `mandatoryBlocks` и `SIZE_POLICY`:

* basic → объединённые разделы,
* professional → более тонкая структура.

Обычно без HITL.

---

### 6.7 `clause_requirements_generator`

Цель: создать `ClauseRequirement[]`:

* для каждого блока — цель, requiredElements, recommendedElements,
* связать с domains/blocks/decisions/party roles.

Основной источник важных вопросов:

* если нужен decisionKey и его нет → ask user.

---

### 6.8 `style_planner`

Цель: выбрать стиль drafting (RU civil style / более plain).
HITL: если пользователь хочет “канцелярит vs понятный язык”.

---

### 6.9 `clause_generator`

Цель: генерировать текст пунктов (желательно батчами по секциям):

* учитывает decisions,
* учитывает ownership (lockedByUser),
* следует sizePolicy (verbosity).

HITL: только когда нельзя корректно сформулировать без данных (например SLA параметры).

---

### 6.10 `document_linter`

Цель: финальный аудит:

* hard checks (детерминированные):

  * покрытие mandatoryBlocks,
  * отсутствие пустых пунктов,
  * consistency терминов,
  * заполненность parties.
* soft checks (LLM):

  * риск-позиция,
  * рыночность,
  * “опасные” паттерны для РФ.

HITL:

* если риск/конфликт требует бизнес-решения: спросить и записать decision.

---

## 7. Rule Engine (PRO) — как строится DocumentProfile

В PRO системе обязательно иметь слой правил для РФ:

* `if domain=employment_ru` → запрещать “штрафы работнику” и т.п.
* `if domain=data_protection_ru` → блоки про 152-ФЗ, поручение/оператор/обработчик, меры защиты.
* `if services + ip` → спросить IP модель: отчуждение/лицензия/служебное.
* `if professional` → включить optional protections.

Это реализуется как набор правил:

```ts
interface ProfileRule {
  when(mission): boolean;
  then(profileDraft): profileDraft;
  mayRequireDecision?: DecisionKey;
}
```

---

## 8. Рекомендованная структура проекта

```text
/apps
  /web
    DocumentPane.tsx
    ChatPane.tsx
  /api
    agentStep.ts

/backend
  /agent
    orchestrator.ts
    state.ts
    questionPolicy.ts
    rules/
      profileRulesRU.ts
      prohibitedPatternsRU.ts
    steps/
      missionInterpreter.ts
      profileBuilder.ts
      partyDetailsCollector.ts
      decisionCollector.ts
      issueSpotter.ts
      skeletonGenerator.ts
      clauseRequirementsGenerator.ts
      stylePlanner.ts
      clauseGenerator.ts
      documentLinter.ts

/domain
  models.ts

/tools
  checklistsRU.ts
  templatesRU.ts
  linting.ts
  calculators.ts
```

---

## 9. Что даёт PRO-версия

* нет жёсткого ограничения “по типам документов”,
* агент умеет собирать гибридные документы (services + IP + confidentiality + PD),
* users контролируют:

  * глубину/размер документа,
  * ключевые решения по рискам,
  * реквизиты сторон,
* HITL становится системным и минимально навязчивым,
* документ получается воспроизводимым: profile + decisions = “контрактная логика”.

```

