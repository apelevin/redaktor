/**
 * TypeScript типы на основе JSON Schema
 * Соответствуют backend/schemas/pre_skeleton_state.schema.json
 * и backend/schemas/llm_step_output.schema.json
 */

// ============================================================================
// Pre-Skeleton State Types
// ============================================================================

export interface PreSkeletonState {
  meta: StateMeta;
  domain: Record<string, unknown>; // Произвольный JSON
  issues: Issue[];
  dialogue: Dialogue;
  control: Control;
  gate?: Gate;
  document?: DocumentState;
  review?: ReviewState;
}

export interface StateMeta {
  session_id: string;
  schema_id: string;
  schema_version: string;
  stage: 'pre_skeleton' | 'skeleton_ready' | 'skeleton_review' | 'skeleton_final';
  locale: {
    language: 'ru';
    jurisdiction: 'RU';
  };
  status: 'collecting' | 'gating' | 'ready' | 'blocked';
  created_at: string; // ISO date-time
  updated_at: string; // ISO date-time
  state_version?: number;
}

export interface Issue {
  id: string;
  key?: string;
  severity: 'critical' | 'high' | 'med' | 'low';
  status: 'open' | 'resolved' | 'dismissed';
  title: string;
  why_it_matters: string;
  missing_or_conflict?: string;
  resolution_hint: string;
  requires_user_confirmation?: boolean;
  evidence?: Array<{
    kind: 'turn' | 'fact_path' | 'note';
    ref: string;
  }>;
}

export interface Dialogue {
  history: DialogueTurn[];
  asked: AskedQuestion[];
}

export interface DialogueTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: string; // ISO date-time
}

export interface AskedQuestion {
  id: string;
  text: string;
  at: string; // ISO date-time
  semantic_fingerprint?: string;
}

export interface Control {
  limits: {
    max_questions_per_run: number;
    max_loops: number;
    max_history_turns: number;
  };
  checks: {
    require_user_confirmation_for_assumptions: boolean;
  };
  flags: Record<string, unknown>;
}

export interface Gate {
  ready_for_skeleton: boolean;
  summary: string;
  blockers?: GateBlocker[];
}

export interface GateBlocker {
  severity: 'critical' | 'high' | 'med' | 'low';
  message: string;
  linked_issue_ids?: string[];
}

// ============================================================================
// LLM Step Output Types
// ============================================================================

export interface LLMStepOutput {
  output_id: string;
  step: 'INTERPRET' | 'GATE_CHECK' | 'SKELETON_GENERATE' | 'SKELETON_REVIEW_PLAN' | 'SKELETON_REVIEW_APPLY';
  patch: Patch;
  issue_updates?: IssueUpsert[];
  next_action: NextAction;
  rationale: string;
  safety?: SafetyFlags;
  observations?: string[];
}

export interface Patch {
  format: 'json_patch' | 'merge_patch';
  ops: JsonPatchOp[] | Record<string, unknown>;
}

export interface JsonPatchOp {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  from?: string;
  value?: unknown;
}

export interface IssueUpsert {
  op: 'upsert' | 'resolve' | 'dismiss';
  issue: Issue;
}

export type NextAction =
  | { kind: 'ask_user'; ask_user: AskUserAction }
  | { kind: 'proceed_to_gate' }
  | { kind: 'proceed_to_skeleton' }
  | { kind: 'show_review_questions' }
  | { kind: 'proceed_to_clause_requirements' }
  | { kind: 'halt_error'; error: HaltError };

export interface AskUserAction {
  question_id?: string;
  question_text: string;
  answer_format: 'free_text' | 'choices';
  choices?: Choice[];
  why_this_question?: string;
  links_to_issue_ids?: string[];
}

export interface Choice {
  id: string;
  label: string;
  value: string | number | boolean;
}

export interface HaltError {
  category: 'schema_validation' | 'insufficient_context' | 'policy_violation' | 'other';
  message: string;
  suggested_recovery?: string;
}

export interface SafetyFlags {
  has_unconfirmed_assumptions?: boolean;
  detected_conflict?: boolean;
  repeat_question_risk?: boolean;
}

// ============================================================================
// Skeleton Review Types
// ============================================================================

export interface ReviewState {
  questions?: ReviewQuestion[];
  answers?: SkeletonReviewAnswer[];
  iteration?: number;
  status?: 'collecting' | 'ready_to_apply' | 'applied' | 'frozen';
  review_id?: string;
}

export interface SkeletonReviewQuestions {
  review_id: string;
  iteration: number;
  questions: ReviewQuestion[];
}

export interface ReviewQuestion {
  question_id: string;
  title: string;
  description?: string;
  priority: number;
  required?: boolean;
  ux: UXSpec;
  binding: Binding;
  constraints?: Constraints;
  why_this_matters?: string;
}

export interface UXSpec {
  type: 'checkbox_group' | 'radio_group' | 'text_input' | 'number_input' | 'multi_text';
  options?: Option[];
  placeholder?: string;
  fields?: InputField[];
}

export interface Option {
  id: string;
  label: string;
  value: string | number | boolean;
  impact: ImpactOp[];
}

export interface InputField {
  id: string;
  label: string;
  bind_to_domain_path: string;
  input_type: 'text' | 'number';
  placeholder?: string;
  required?: boolean;
}

export interface Binding {
  node_ids: string[];
  bind_to_domain_path?: string;
}

export interface Constraints {
  min?: number;
  max?: number;
  max_length?: number;
  pattern?: string;
}

export interface ImpactOp {
  op: 'set_node_status' | 'select_variant' | 'set_domain_value' | 'add_issue' | 'resolve_issue';
  node_id?: string;
  status?: 'active' | 'omitted';
  variant_id?: string;
  path?: string;
  value?: unknown;
  issue_id?: string;
  issue_payload?: Issue;
}

export interface SkeletonReviewAnswers {
  review_id: string;
  answers: SkeletonReviewAnswer[];
}

export interface SkeletonReviewAnswer {
  question_id: string;
  value: string | number | boolean | string[] | object | null;
  at: string; // ISO date-time
}

// ============================================================================
// Contract Skeleton Types
// ============================================================================

export interface ContractSkeleton {
  root: SkeletonNode;
}

export interface SkeletonNode {
  node_id: string;
  kind: 'document' | 'section' | 'clause' | 'appendix';
  title: string;
  tags: string[];
  purpose?: string;
  include_if?: string[];
  requires?: string[];
  notes_for_generator?: string;
  status?: 'active' | 'omitted';
  variants?: Variant[];
  selected_variant_id?: string;
  children: SkeletonNode[];
}

export interface Variant {
  variant_id: string;
  label: string;
  description?: string;
  children: SkeletonNode[];
}

export interface SkeletonMeta {
  schema_version: string;
  generated_at: string;
  generated_by_step: string;
  node_count: number;
}

export interface DocumentState {
  skeleton?: ContractSkeleton;
  skeleton_meta?: SkeletonMeta;
  skeleton_final?: ContractSkeleton;
  freeze?: {
    structure?: boolean;
  };
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateSessionRequest {
  initial_message?: string;
}

export interface CreateSessionResponse {
  session_id: string;
  state: PreSkeletonState;
  next_action: NextAction;
}

export interface GetSessionResponse {
  state: PreSkeletonState;
  next_action: NextAction;
}

export interface SendMessageRequest {
  message: string;
  answer_to_question_id?: string;
}

export interface SendMessageResponse {
  state: PreSkeletonState;
  next_action: NextAction;
}

export interface RunStepRequest {
  step: 'INTERPRET' | 'GATE_CHECK' | 'SKELETON_GENERATE' | 'SKELETON_REVIEW_PLAN' | 'SKELETON_REVIEW_APPLY';
}

export interface RunStepResponse {
  llm_output: LLMStepOutput;
  state: PreSkeletonState;
  next_action: NextAction;
}
