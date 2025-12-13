import { ContractSkeleton, SkeletonNode, Issue } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

export interface LintResult {
  valid: boolean;
  issues: Issue[];
}

/**
 * Линтит skeleton и возвращает найденные проблемы
 */
export function lintSkeleton(skeleton: ContractSkeleton): LintResult {
  const issues: Issue[] = [];
  const nodeIds = new Set<string>();
  
  /**
   * Рекурсивно обходит дерево узлов и проверяет их
   */
  function traverse(node: SkeletonNode, path: string[]): void {
    // Проверка уникальности node_id
    if (nodeIds.has(node.node_id)) {
      issues.push({
        id: `duplicate_node_id_${node.node_id}`,
        severity: 'high',
        title: `Дублирующийся node_id: ${node.node_id}`,
        why_it_matters: 'node_id должны быть уникальными по всему дереву',
        resolution_hint: `Исправьте node_id для узла по пути: ${path.join(' > ')}`,
        status: 'open',
      });
    }
    nodeIds.add(node.node_id);
    
    // Проверка обязательных полей
    if (!node.tags || node.tags.length === 0) {
      issues.push({
        id: `missing_tags_${node.node_id}`,
        severity: 'high',
        title: `Узел ${node.node_id} не имеет tags`,
        why_it_matters: 'tags необходимы для семантической классификации узла',
        resolution_hint: `Добавьте tags для узла "${node.title}"`,
        status: 'open',
      });
    }
    
    if (!node.purpose || node.purpose.trim().length === 0) {
      issues.push({
        id: `missing_purpose_${node.node_id}`,
        severity: 'med',
        title: `Узел ${node.node_id} не имеет purpose`,
        why_it_matters: 'purpose объясняет назначение узла и помогает в генерации текста',
        resolution_hint: `Добавьте purpose для узла "${node.title}"`,
        status: 'open',
      });
    }
    
    if (!node.title || node.title.trim().length === 0) {
      issues.push({
        id: `empty_title_${node.node_id}`,
        severity: 'high',
        title: `Узел ${node.node_id} имеет пустой title`,
        why_it_matters: 'title обязателен для отображения и понимания структуры',
        resolution_hint: `Добавьте title для узла с node_id: ${node.node_id}`,
        status: 'open',
      });
    }
    
    // Проверка clause без tags
    if (node.kind === 'clause' && (!node.tags || node.tags.length === 0)) {
      issues.push({
        id: `clause_without_tags_${node.node_id}`,
        severity: 'high',
        title: `Clause ${node.node_id} не имеет tags`,
        why_it_matters: 'Clause без tags не может быть правильно обработан генератором текста',
        resolution_hint: `Добавьте tags для clause "${node.title}"`,
        status: 'open',
      });
    }
    
    // Soft-check: requires не должны быть пустыми строками
    if (node.requires) {
      const emptyRequires = node.requires.filter(r => !r || r.trim().length === 0);
      if (emptyRequires.length > 0) {
        issues.push({
          id: `empty_requires_${node.node_id}`,
          severity: 'low',
          title: `Узел ${node.node_id} имеет пустые requires`,
          why_it_matters: 'Пустые requires указывают на ошибку в структуре',
          resolution_hint: `Удалите пустые requires или заполните их корректными путями для узла "${node.title}"`,
          status: 'open',
        });
      }
    }
    
    // Soft-check: include_if не должны быть пустыми строками
    if (node.include_if) {
      const emptyIncludeIf = node.include_if.filter(i => !i || i.trim().length === 0);
      if (emptyIncludeIf.length > 0) {
        issues.push({
          id: `empty_include_if_${node.node_id}`,
          severity: 'low',
          title: `Узел ${node.node_id} имеет пустые include_if`,
          why_it_matters: 'Пустые include_if указывают на ошибку в структуре',
          resolution_hint: `Удалите пустые include_if или заполните их корректными путями для узла "${node.title}"`,
          status: 'open',
        });
      }
    }
    
    // Рекурсивно проверяем children
    if (node.children) {
      node.children.forEach((child, index) => {
        traverse(child, [...path, `children[${index}]`]);
      });
    }
  }
  
  // Начинаем обход с корневого узла
  traverse(skeleton.root, ['root']);
  
  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Подсчитывает количество узлов в skeleton
 */
export function countNodes(skeleton: ContractSkeleton): number {
  let count = 0;
  
  function traverse(node: SkeletonNode): void {
    count++;
    if (node.children) {
      node.children.forEach(traverse);
    }
  }
  
  traverse(skeleton.root);
  return count;
}
