import Ajv from 'ajv';
import addFormats from 'ajv-formats';
// @ts-ignore - JSON imports
import preSkeletonStateSchema from './pre_skeleton_state.schema.json';
// @ts-ignore - JSON imports
import llmStepOutputSchema from './llm_step_output.schema.json';
// @ts-ignore - JSON imports
import contractSkeletonSchema from './contract_skeleton.schema.json';

export interface SchemaRecord {
  schema_id: string;
  schema_version: string;
  compatibility: 'backward_compatible' | 'breaking';
  schema: object;
}

export interface ValidationResult {
  valid: boolean;
  errors?: Array<{
    path: string;
    message: string;
  }>;
}

const SCHEMA_REGISTRY: SchemaRecord[] = [
  {
    schema_id: 'schema://legalagi/pre_skeleton_state/1.0.0',
    schema_version: '1.0.0',
    compatibility: 'backward_compatible',
    schema: preSkeletonStateSchema,
  },
  {
    schema_id: 'schema://legalagi/llm_step_output/1.0.0',
    schema_version: '1.0.0',
    compatibility: 'backward_compatible',
    schema: llmStepOutputSchema,
  },
  {
    schema_id: 'schema://legalagi/contract_skeleton/1.0.0',
    schema_version: '1.0.0',
    compatibility: 'backward_compatible',
    schema: contractSkeletonSchema,
  },
];

// Инициализация Ajv с поддержкой форматов
// Используем draft-07 вместо draft-2020-12 для совместимости
const ajv = new Ajv({ 
  allErrors: true, 
  strict: false,
  validateSchema: false, // Отключаем валидацию самой схемы
  allowUnionTypes: true,
});
addFormats(ajv);

// Кэш скомпилированных валидаторов
// ВНИМАНИЕ: При изменении схем нужно очистить кэш или перезапустить сервер
const validatorsCache = new Map<string, ReturnType<typeof ajv.compile>>();

/**
 * Очищает кэш валидаторов (полезно при изменении схем)
 */
export function clearValidatorsCache(): void {
  validatorsCache.clear();
}

// Очищаем кэш при загрузке модуля (на случай изменений схем)
// В production это можно убрать для производительности
if (process.env.NODE_ENV === 'development') {
  // В dev режиме очищаем кэш при каждом изменении
  clearValidatorsCache();
}

// Также очищаем кэш при каждом импорте в dev режиме для hot reload
if (typeof globalThis !== 'undefined' && process.env.NODE_ENV === 'development') {
  clearValidatorsCache();
}

/**
 * Получает схему по ID и версии
 */
export function getSchema(schemaId: string, version?: string): SchemaRecord | null {
  const record = SCHEMA_REGISTRY.find(
    (r) => r.schema_id === schemaId && (!version || r.schema_version === version)
  );
  return record || null;
}

/**
 * Валидирует данные по схеме
 */
export function validate(data: unknown, schemaId: string, version?: string): ValidationResult {
  const schemaRecord = getSchema(schemaId, version);
  if (!schemaRecord) {
    return {
      valid: false,
      errors: [{ path: '', message: `Schema not found: ${schemaId}${version ? `@${version}` : ''}` }],
    };
  }

  // Получаем или создаем валидатор
  const cacheKey = `${schemaId}@${schemaRecord.schema_version}`;
  let validator = validatorsCache.get(cacheKey);

  if (!validator) {
    validator = ajv.compile(schemaRecord.schema);
    validatorsCache.set(cacheKey, validator);
  }

  const valid = validator(data);

  if (!valid && validator.errors) {
    return {
      valid: false,
      errors: validator.errors?.map((err: { instancePath?: string; schemaPath?: string; message?: string }) => ({
        path: err.instancePath || err.schemaPath || '',
        message: err.message || 'Validation error',
      })) || [],
    };
  }

  return { valid: true };
}

/**
 * Получает все зарегистрированные схемы
 */
export function getAllSchemas(): SchemaRecord[] {
  return [...SCHEMA_REGISTRY];
}
