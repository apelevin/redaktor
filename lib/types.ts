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
}

export interface StateMeta {
  session_id: string;
  schema_id: string;
  schema_version: string;
  stage: 'pre_skeleton';
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
  step: 'INTERPRET' | 'GATE_CHECK';
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
  step: 'INTERPRET' | 'GATE_CHECK';
}

export interface RunStepResponse {
  llm_output: LLMStepOutput;
  state: PreSkeletonState;
  next_action: NextAction;
}
