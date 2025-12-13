import { ContractSkeleton, SkeletonNode, Issue } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import { TagOrderProfile, loadTagOrderProfile } from '@/lib/skeleton-tag-order';

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

/**
 * Вычисляет базовый order_key для узла на основе его tags и tag_order_profile
 * 
 * Применяет правила из sorting.md:
 * - Правило когнитивной нагрузки: контекст → механика → риски (учтено в group_index)
 * - Правило "плохих новостей": ответственность/споры ниже предмета и денег (учтено в group_index)
 * - Правило формальностей: формальные разделы ближе к концу (учтено в group_index)
 * 
 * @param node - узел для вычисления order_key
 * @param tagOrderProfile - профиль порядка тегов
 * @returns базовый order_key на основе tags
 */
function calculateBaseOrderKey(
  node: SkeletonNode,
  tagOrderProfile: TagOrderProfile
): number {
  if (!node.tags || node.tags.length === 0) {
    // Узлы без тегов отправляются в "прочее" (правило формальностей)
    return tagOrderProfile.unknown_tags_group_index;
  }
  
  // Находим первый tag, который есть в профиле
  // Это применяет правило когнитивной нагрузки: порядок групп определен в tag_order_profile
  for (const tag of node.tags) {
    for (const group of tagOrderProfile.tag_groups) {
      const tagIndex = group.tags.indexOf(tag);
      if (tagIndex >= 0) {
        // Возвращаем group_index + небольшой offset для порядка внутри группы
        // Используем tagIndex / 100 для более точной сортировки внутри группы
        // Это позволяет сохранить порядок тегов внутри группы, если это важно
        return group.group_index + (tagIndex / 100);
      }
    }
  }
  
  // Если тегов нет в профиле, отправляем в "прочее" (но до формальностей)
  // Правило формальностей: формальные разделы ближе к концу
  return tagOrderProfile.unknown_tags_group_index;
}

/**
 * Создает карту node_id -> order_key для всех узлов в дереве
 */
function buildNodeOrderMap(
  node: SkeletonNode,
  tagOrderProfile: TagOrderProfile,
  map: Map<string, number> = new Map()
): Map<string, number> {
  const orderKey = calculateBaseOrderKey(node, tagOrderProfile);
  map.set(node.node_id, orderKey);
  
  if (node.children) {
    for (const child of node.children) {
      buildNodeOrderMap(child, tagOrderProfile, map);
    }
  }
  
  // Также проверяем variants
  if (node.variants) {
    for (const variant of node.variants) {
      if (variant.children) {
        for (const child of variant.children) {
          buildNodeOrderMap(child, tagOrderProfile, map);
        }
      }
    }
  }
  
  return map;
}

/**
 * Вычисляет order_key для узла с учетом зависимостей (requires)
 * Применяет правила причинности и зависимости из sorting.md:
 * 
 * - Правило зависимости: раздел Б логически невозможен без А → А выше
 * - Правило причинности: раздел А выше Б, если А используется в Б
 * 
 * @param node - узел для вычисления order_key
 * @param tagOrderProfile - профиль порядка тегов
 * @param nodeOrderMap - карта node_id -> order_key для всех узлов
 * @param allNodeIds - множество всех node_id для парсинга requires
 * @returns order_key с учетом зависимостей
 */
export function calculateNodeOrderKey(
  node: SkeletonNode,
  tagOrderProfile: TagOrderProfile,
  nodeOrderMap?: Map<string, number>,
  allNodeIds?: Set<string>
): number {
  const baseOrderKey = calculateBaseOrderKey(node, tagOrderProfile);
  
  // Если нет requires, возвращаем базовый ключ
  if (!node.requires || node.requires.length === 0) {
    return baseOrderKey;
  }
  
  // Если нет nodeOrderMap или allNodeIds, не можем обработать зависимости
  if (!nodeOrderMap || !allNodeIds) {
    return baseOrderKey;
  }
  
  // Находим максимальный order_key среди зависимостей (правило зависимости)
  let maxDependencyOrder = -1;
  let hasValidDependency = false;
  
  for (const requirePath of node.requires) {
    // Извлекаем node_id из пути requires
    const dependencyNodeId = extractNodeIdFromRequires(requirePath, allNodeIds);
    
    if (dependencyNodeId && nodeOrderMap.has(dependencyNodeId)) {
      const depOrder = nodeOrderMap.get(dependencyNodeId)!;
      if (depOrder > maxDependencyOrder) {
        maxDependencyOrder = depOrder;
        hasValidDependency = true;
      }
    }
  }
  
  // Применяем правило зависимости: узел с requires должен быть не раньше зависимостей
  if (hasValidDependency && maxDependencyOrder >= 0) {
    // Если базовый order_key меньше максимального order_key зависимостей,
    // корректируем его, чтобы узел был после зависимостей
    if (baseOrderKey < maxDependencyOrder) {
      // Если зависимость в другой группе (другой целой части), перемещаем в эту группу
      const baseGroup = Math.floor(baseOrderKey);
      const depGroup = Math.floor(maxDependencyOrder);
      
      if (depGroup > baseGroup) {
        // Зависимость в более поздней группе - перемещаем узел в эту группу
        // Добавляем небольшой offset, чтобы он был после зависимостей
        return maxDependencyOrder + 0.01;
      } else {
        // Зависимость в той же группе - просто добавляем offset
        return maxDependencyOrder + 0.01;
      }
    }
  }
  
  return baseOrderKey;
}

/**
 * Находит node_id из пути requires
 * requires может содержать:
 * - Прямые node_id (например, "section_parties")
 * - JSON Pointer пути (например, "/document/skeleton/root/children/0")
 * - Domain пути (например, "/domain/parties/customer/name")
 * 
 * Для сортировки нас интересуют только node_id, domain пути игнорируем
 */
function extractNodeIdFromRequires(requirePath: string, allNodeIds: Set<string>): string | null {
  // Если это прямой node_id
  if (allNodeIds.has(requirePath)) {
    return requirePath;
  }
  
  // Если это путь, пытаемся извлечь node_id
  // JSON Pointer путь может быть вида: /document/skeleton/root/children/0
  // Или относительный путь: children/0
  const parts = requirePath.split('/').filter(p => p.length > 0);
  
  // Ищем node_id в частях пути
  for (const part of parts) {
    if (allNodeIds.has(part)) {
      return part;
    }
  }
  
  // Если путь содержит "children" и индекс, это может быть ссылка на узел по позиции
  // Но без доступа к структуре мы не можем определить node_id по индексу
  // Поэтому возвращаем null - такая зависимость не будет учтена в сортировке
  
  return null;
}

/**
 * Находит узел по node_id во всем дереве (включая variants)
 */
function findNodeById(
  root: SkeletonNode,
  nodeId: string
): SkeletonNode | null {
  if (root.node_id === nodeId) {
    return root;
  }
  
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeById(child, nodeId);
      if (found) {
        return found;
      }
    }
  }
  
  if (root.variants) {
    for (const variant of root.variants) {
      if (variant.children) {
        for (const child of variant.children) {
          const found = findNodeById(child, nodeId);
          if (found) {
            return found;
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * Рекурсивно переупорядочивает children узла на основе order_key
 * 
 * Применяет все правила сортировки из sorting.md:
 * 
 * 1. Правило причинности: раздел А выше Б, если А используется в Б
 *    - Реализовано через requires: если узел Б требует узел А, то А получает меньший order_key
 *    - Применяется в calculateNodeOrderKey через корректировку order_key
 * 
 * 2. Правило зависимости: раздел Б логически невозможен без А → А выше
 *    - Реализовано через корректировку order_key: узел с requires получает order_key >= max(dependencies)
 *    - Если зависимость в другой группе, узел перемещается в группу зависимости
 * 
 * 3. Правило когнитивной нагрузки: контекст → механика → риски
 *    - Учтено в tag_order_profile через порядок групп:
 *      - Группы 0-1: контекст (идентификация, предмет)
 *      - Группы 2-5: механика (сроки, коммерция, исполнение, права)
 *      - Группы 6-8: риски (ответственность, споры, прекращение)
 * 
 * 4. Правило "плохих новостей": ответственность/споры ниже предмета и денег
 *    - Учтено в tag_order_profile: liability/disputes в группах 6-7, после subject (1) и price (3)
 * 
 * 5. Правило формальностей: формальные разделы ближе к концу
 *    - Учтено в tag_order_profile: формальные разделы (addresses, signatures) в группе 9
 * 
 * @param node - узел для переупорядочивания
 * @param tagOrderProfile - профиль порядка тегов
 * @param nodeOrderMap - карта node_id -> order_key для всех узлов (для обработки зависимостей)
 * @param allNodeIds - множество всех node_id (для парсинга requires)
 * @returns узел с переупорядоченными children
 */
function reorderNodeChildren(
  node: SkeletonNode,
  tagOrderProfile: TagOrderProfile,
  nodeOrderMap?: Map<string, number>,
  allNodeIds?: Set<string>
): SkeletonNode {
  if (!node.children || node.children.length === 0) {
    return node;
  }
  
  // Собираем все node_id для парсинга requires
  const localNodeIds = allNodeIds || new Set<string>();
  function collectNodeIds(n: SkeletonNode): void {
    localNodeIds.add(n.node_id);
    if (n.children) {
      n.children.forEach(collectNodeIds);
    }
    if (n.variants) {
      n.variants.forEach(v => {
        if (v.children) {
          v.children.forEach(collectNodeIds);
        }
      });
    }
  }
  collectNodeIds(node);
  
  // Строим карту order_key для всех children
  const localOrderMap = nodeOrderMap || buildNodeOrderMap(node, tagOrderProfile);
  
  // Вычисляем order_key для каждого child с учетом зависимостей
  // Применяем правила из sorting.md:
  // - Правило зависимости: раздел Б логически невозможен без А → А выше
  // - Правило причинности: раздел А выше Б, если А используется в Б
  const childrenWithOrder = node.children.map(child => {
    // calculateNodeOrderKey уже учитывает зависимости через nodeOrderMap
    const orderKey = calculateNodeOrderKey(child, tagOrderProfile, localOrderMap, localNodeIds);
    
    return {
      node: child,
      orderKey,
      hasRequires: !!(child.requires && child.requires.length > 0),
      // Для дополнительной сортировки: узлы без requires идут раньше
      dependencyCount: child.requires?.length || 0,
    };
  });
  
  // Сортируем по order_key с применением правил из sorting.md
  childrenWithOrder.sort((a, b) => {
    // Основная сортировка по order_key (учитывает tag_order_profile и зависимости)
    const orderDiff = a.orderKey - b.orderKey;
    if (Math.abs(orderDiff) > 0.001) {
      return orderDiff;
    }
    
    // Если order_key очень близки (в пределах одной группы), применяем дополнительные правила:
    
    // 1. Правило зависимости: узлы без requires идут раньше узлов с requires
    // Это применяет правило причинности: раздел А выше Б, если А используется в Б
    if (a.hasRequires !== b.hasRequires) {
      return a.hasRequires ? 1 : -1;
    }
    
    // 2. Если оба имеют requires, узлы с меньшим количеством зависимостей идут раньше
    // Это помогает упорядочить узлы внутри одной группы
    if (a.dependencyCount !== b.dependencyCount) {
      return a.dependencyCount - b.dependencyCount;
    }
    
    // 3. Правило формальностей: более формальные разделы (с большим количеством тегов)
    // идут позже в пределах одной группы
    const aTagCount = a.node.tags?.length || 0;
    const bTagCount = b.node.tags?.length || 0;
    if (aTagCount !== bTagCount) {
      // Узлы с большим количеством тегов (более формальные) идут позже
      return aTagCount - bTagCount;
    }
    
    // 4. Сохраняем исходный порядок для стабильности (стабильная сортировка)
    // Это важно для предсказуемости при одинаковых order_key
    return 0;
  });
  
  // Рекурсивно применяем reorder к children
  const reorderedChildren = childrenWithOrder.map(({ node: child }) =>
    reorderNodeChildren(child, tagOrderProfile, localOrderMap, localNodeIds)
  );
  
  return {
    ...node,
    children: reorderedChildren,
  };
}

/**
 * Переупорядочивает skeleton на основе tag_order_profile
 * 
 * Применяет универсальные правила сортировки из sorting.md:
 * 
 * 1. Базовый принцип: путь от "кто и зачем" → к "что делать, если что-то пойдёт не так"
 *    - I. Идентификация и рамка (parties, definitions)
 *    - II. Предмет и цель договора (subject)
 *    - III. Сроки и жизненный цикл (term)
 *    - IV. Коммерческая модель (price, payment)
 *    - V. Исполнение и операционные правила (performance, acceptance)
 *    - VI. Права, обязанности и ограничения (rights_obligations, confidentiality)
 *    - VII. Риски и защита (liability, force_majeure)
 *    - VIII. Разрешение конфликтов (dispute_resolution)
 *    - IX. Изменение и прекращение (termination, amendments)
 *    - X. Заключительные положения (final_provisions, signatures)
 * 
 * 2. Правило причинности: раздел А выше Б, если условия из А используются в Б
 *    - Реализовано через requires: если узел Б требует узел А, то А должен быть выше
 * 
 * 3. Правило зависимости: раздел Б логически невозможен без А → А выше
 *    - Реализовано через корректировку order_key: узел с requires получает order_key >= max(dependencies)
 * 
 * 4. Правило когнитивной нагрузки: контекст → механика → риски
 *    - Учтено в tag_order_profile: группы идут от контекста (0-1) к механике (2-5) к рискам (6-8)
 * 
 * 5. Правило "плохих новостей": ответственность/споры ниже предмета и денег
 *    - Учтено в tag_order_profile: liability/disputes в группах 6-7, после subject (1) и price (3)
 * 
 * 6. Правило формальностей: формальные разделы ближе к концу
 *    - Учтено в tag_order_profile: формальные разделы (addresses, signatures) в группе 9
 * 
 * Учитывает зависимости (requires): узлы с requires идут после узлов, от которых зависят
 */
export function reorderSkeletonNodes(
  skeleton: ContractSkeleton,
  tagOrderProfile: TagOrderProfile
): ContractSkeleton {
  // Строим глобальную карту order_key для всего дерева
  // Это нужно для обработки зависимостей между узлами на разных уровнях
  const globalOrderMap = buildNodeOrderMap(skeleton.root, tagOrderProfile);
  
  // Собираем все node_id для парсинга requires
  const allNodeIds = new Set<string>();
  function collectAllNodeIds(n: SkeletonNode): void {
    allNodeIds.add(n.node_id);
    if (n.children) {
      n.children.forEach(collectAllNodeIds);
    }
    if (n.variants) {
      n.variants.forEach(v => {
        if (v.children) {
          v.children.forEach(collectAllNodeIds);
        }
      });
    }
  }
  collectAllNodeIds(skeleton.root);
  
  // Применяем рекурсивную сортировку с учетом зависимостей
  // Порядок применения:
  // 1. Сначала вычисляем order_key для всех узлов (учитывая зависимости)
  // 2. Затем сортируем siblings по order_key
  // 3. Рекурсивно применяем к children
  return {
    ...skeleton,
    root: reorderNodeChildren(skeleton.root, tagOrderProfile, globalOrderMap, allNodeIds),
  };
}

/**
 * Проверяет порядок узлов с учетом зависимостей (requires)
 * Применяет правила причинности и зависимости из sorting.md:
 * 
 * - Правило зависимости: раздел Б логически невозможен без А → А выше
 * - Правило причинности: раздел А выше Б, если А используется в Б
 * 
 * Проверяет, что узлы с requires идут после узлов, от которых они зависят
 */
function checkDependencyOrder(
  node: SkeletonNode,
  siblings: SkeletonNode[],
  nodeOrderMap: Map<string, number>,
  allNodeIds: Set<string>,
  rootNode: SkeletonNode,
  issues: Issue[],
  path: string[]
): void {
  if (!node.requires || node.requires.length === 0) {
    return;
  }
  
  const nodeOrder = nodeOrderMap.get(node.node_id);
  if (nodeOrder === undefined) {
    return;
  }
  
  // Проверяем каждую зависимость
  for (const requirePath of node.requires) {
    const dependencyNodeId = extractNodeIdFromRequires(requirePath, allNodeIds);
    if (!dependencyNodeId) {
      continue; // Не можем определить зависимость (возможно, это domain путь)
    }
    
    // Ищем зависимый узел во всем дереве
    const dependencyNode = findNodeById(rootNode, dependencyNodeId);
    if (!dependencyNode) {
      continue; // Узел не найден
    }
    
    const dependencyOrder = nodeOrderMap.get(dependencyNodeId);
    if (dependencyOrder === undefined) {
      continue;
    }
    
    // Правило зависимости: раздел Б логически невозможен без А → А выше
    // Проверяем, что зависимость идет раньше (имеет меньший order_key)
    const isSibling = siblings.some(s => s.node_id === dependencyNodeId);
    
    if (isSibling && dependencyOrder > nodeOrder) {
      // Нарушение порядка среди siblings - критично
      issues.push({
        id: `dependency_order_violation_${node.node_id}_${dependencyNodeId}`,
        severity: 'high',
        title: `Нарушение порядка зависимостей: "${node.title}" должен идти после "${dependencyNode.title}"`,
        why_it_matters: 'Раздел Б логически невозможен без А, поэтому А должен быть выше (правило зависимости из sorting.md). Это нарушает логическую структуру документа.',
        resolution_hint: `Переместите раздел "${node.title}" после раздела "${dependencyNode.title}" или убедитесь, что зависимости указаны корректно`,
        status: 'open',
      });
    } else if (!isSibling) {
      // Зависимость в другом месте дерева
      // Проверяем, что зависимость имеет меньший order_key (правило зависимости)
      if (dependencyOrder > nodeOrder) {
        // Зависимость должна быть выше по документу, но имеет больший order_key
        // Это может быть проблемой, если зависимость должна быть в более ранней группе
        const nodeGroup = Math.floor(nodeOrder);
        const depGroup = Math.floor(dependencyOrder);
        
        if (depGroup > nodeGroup) {
          // Зависимость в более поздней группе - это нарушение правила зависимости
          issues.push({
            id: `dependency_group_violation_${node.node_id}_${dependencyNodeId}`,
            severity: 'med',
            title: `Нарушение порядка групп: "${node.title}" зависит от "${dependencyNode.title}", но находится в более ранней группе`,
            why_it_matters: 'Раздел Б логически невозможен без А, поэтому А должен быть в более ранней группе (правило зависимости из sorting.md)',
            resolution_hint: `Переместите раздел "${node.title}" в группу после "${dependencyNode.title}" или проверьте правильность указания зависимостей`,
            status: 'open',
          });
        }
      }
    }
  }
}

/**
 * Проверяет соблюдение правил из sorting.md для узла
 * 
 * Правила:
 * - Правило когнитивной нагрузки: контекст → механика → риски
 * - Правило "плохих новостей": ответственность/споры ниже предмета и денег
 * - Правило формальностей: формальные разделы ближе к концу
 */
function checkSortingRules(
  node: SkeletonNode,
  nodeOrder: number,
  tagOrderProfile: TagOrderProfile,
  issues: Issue[]
): void {
  if (!node.tags || node.tags.length === 0) {
    return; // Узлы без тегов уже обработаны
  }
  
  const nodeGroup = Math.floor(nodeOrder);
  
  // Правило "плохих новостей": ответственность/споры ниже предмета и денег
  // Проверяем, что liability/disputes не находятся в группах раньше subject (1) и price (3)
  // Согласно sorting.md: "Всё про ответственность, санкции, споры всегда ниже по документу, чем предмет и деньги"
  const hasBadNewsTags = node.tags.some(tag => 
    ['liability', 'penalties', 'damages', 'force_majeure', 'dispute_resolution', 'disputes', 'arbitration', 'negotiation'].includes(tag)
  );
  
  if (hasBadNewsTags && nodeGroup < 4) {
    // Нарушение правила "плохих новостей": ответственность/споры должны быть после предмета (1) и денег (3)
    // Минимальная группа для "плохих новостей" - группа 4 (исполнение) или выше
    // Но обычно они должны быть в группах 6-7 (риски и защита, разрешение конфликтов)
    issues.push({
      id: `bad_news_rule_violation_${node.node_id}`,
      severity: 'med',
      title: `Нарушение правила "плохих новостей": "${node.title}" находится слишком рано в документе`,
      why_it_matters: 'Всё про ответственность, санкции, споры всегда ниже по документу, чем предмет и деньги (правило "плохих новостей" из sorting.md). Это улучшает читаемость документа и следует логике: сначала позитивное (предмет, деньги), потом защита от рисков.',
      resolution_hint: `Переместите раздел "${node.title}" в группу после коммерческой модели (группа 4+) или в группу рисков и защиты (группа 6+)`,
      status: 'open',
    });
  }
  
  // Правило формальностей: формальные разделы ближе к концу
  // Проверяем, что формальные разделы (addresses, signatures) находятся в группе 9
  // Согласно sorting.md: "Чем более формальный и технический раздел, тем ближе он к концу"
  const hasFormalTags = node.tags.some(tag => 
    ['addresses', 'bank_details', 'requisites', 'signatures', 'execution', 'appendices'].includes(tag)
  );
  
  if (hasFormalTags && nodeGroup < 9) {
    // Нарушение правила формальностей: формальные разделы должны быть ближе к концу
    // Но не критично, если они в группе 8 (изменение и прекращение) - это допустимо
    if (nodeGroup < 8) {
      issues.push({
        id: `formalities_rule_violation_${node.node_id}`,
        severity: 'low',
        title: `Нарушение правила формальностей: "${node.title}" находится слишком рано в документе`,
        why_it_matters: 'Чем более формальный и технический раздел, тем ближе он к концу (правило формальностей из sorting.md). Это улучшает структуру документа и следует логике: сначала смысл, потом формальности.',
        resolution_hint: `Переместите раздел "${node.title}" в группу заключительных положений (группа 9)`,
        status: 'open',
      });
    }
  }
  
  // Правило когнитивной нагрузки: контекст → механика → риски
  // Это правило уже учтено в tag_order_profile через порядок групп:
  // - Группы 0-1: контекст (идентификация, предмет)
  // - Группы 2-5: механика (сроки, коммерция, исполнение, права)
  // - Группы 6-8: риски (ответственность, споры, прекращение)
  // Проверка этого правила не требуется, так как оно реализовано через порядок групп в tag_order_profile
}

/**
 * Расширенная проверка структуры skeleton (variants, review_hooks, пустые секции)
 * 
 * Применяет все правила из sorting.md:
 * - Правило причинности: раздел А выше Б, если А используется в Б
 * - Правило зависимости: раздел Б логически невозможен без А → А выше
 * - Правило когнитивной нагрузки: контекст → механика → риски
 * - Правило "плохих новостей": ответственность/споры ниже предмета и денег
 * - Правило формальностей: формальные разделы ближе к концу
 */
export function lintSkeletonStructure(
  skeleton: ContractSkeleton,
  tagOrderProfile: TagOrderProfile
): LintResult {
  const issues: Issue[] = [];
  const nodeIds = new Set<string>();
  const variantIds = new Map<string, Set<string>>(); // node_id -> Set<variant_id>
  
  // Строим карту order_key для проверки зависимостей
  const nodeOrderMap = buildNodeOrderMap(skeleton.root, tagOrderProfile);
  
  // Карта для отслеживания первого вхождения каждого node_id (для проверки дубликатов)
  const nodeIdFirstOccurrence = new Map<string, string[]>(); // node_id -> path первого вхождения
  
  function traverse(node: SkeletonNode, path: string[], siblings: SkeletonNode[] = []): void {
    // Проверка уникальности node_id
    // Проверяем, встречался ли этот node_id раньше
    if (nodeIdFirstOccurrence.has(node.node_id)) {
      // Дубликат найден - это второе (или более) вхождение
      const firstPath = nodeIdFirstOccurrence.get(node.node_id)!;
      issues.push({
        id: `duplicate_node_id_${node.node_id}_${path.join('_')}`,
        severity: 'high',
        title: `Дублирующийся node_id: ${node.node_id}`,
        why_it_matters: 'node_id должны быть уникальными по всему дереву. Дубликаты нарушают логику сортировки и обработку зависимостей (правила причинности и зависимости из sorting.md).',
        resolution_hint: `Исправьте node_id для узла по пути: ${path.join(' > ')}. Первое вхождение находится по пути: ${firstPath.join(' > ')}`,
        status: 'open',
      });
    } else {
      // Первое вхождение - сохраняем путь
      nodeIdFirstOccurrence.set(node.node_id, [...path]);
    }
    // Добавляем в Set для других проверок (например, для парсинга requires)
    nodeIds.add(node.node_id);
    
    // Проверка выбранных variants
    if (node.selected_variant_id && node.variants) {
      const variantExists = node.variants.some(
        v => v.variant_id === node.selected_variant_id
      );
      if (!variantExists) {
        issues.push({
          id: `invalid_variant_${node.node_id}`,
          severity: 'high',
          title: `Узел ${node.node_id} ссылается на несуществующий вариант: ${node.selected_variant_id}`,
          why_it_matters: 'Выбранный вариант должен существовать в списке variants',
          resolution_hint: `Исправьте selected_variant_id для узла "${node.title}" или добавьте вариант`,
          status: 'open',
        });
      }
      
      // Проверка уникальности variant_id внутри узла
      if (!variantIds.has(node.node_id)) {
        variantIds.set(node.node_id, new Set());
      }
      const variantSet = variantIds.get(node.node_id)!;
      for (const variant of node.variants) {
        if (variantSet.has(variant.variant_id)) {
          issues.push({
            id: `duplicate_variant_${node.node_id}_${variant.variant_id}`,
            severity: 'high',
            title: `Дублирующийся variant_id в узле ${node.node_id}: ${variant.variant_id}`,
            why_it_matters: 'variant_id должны быть уникальными внутри узла',
            resolution_hint: `Исправьте variant_id для варианта в узле "${node.title}"`,
            status: 'open',
          });
        }
        variantSet.add(variant.variant_id);
      }
    }
    
    // Проверка пустых активных секций
    if (node.kind === 'section' && node.status !== 'omitted') {
      const hasActiveChildren = node.children?.some(
        child => child.status !== 'omitted'
      );
      if (!hasActiveChildren && (!node.children || node.children.length === 0)) {
        issues.push({
          id: `empty_section_${node.node_id}`,
          severity: 'med',
          title: `Пустая секция: ${node.title || node.node_id}`,
          why_it_matters: 'Активные секции должны содержать хотя бы один активный дочерний элемент',
          resolution_hint: `Добавьте дочерние элементы в секцию "${node.title}" или пометьте её как omitted`,
          status: 'open',
        });
      }
    }
    
    // Проверяем порядок зависимостей (правило зависимости и причинности из sorting.md)
    // Это применяется к самому узлу, если он имеет requires
    if (node.requires && node.requires.length > 0) {
      // Проверяем порядок зависимостей для текущего узла
      // Находим siblings из контекста (если они есть)
      const siblings: SkeletonNode[] = [];
      // Для упрощения проверяем глобально - checkDependencyOrder найдет зависимости во всем дереве
      checkDependencyOrder(node, siblings, nodeOrderMap, nodeIds, skeleton.root, issues, path);
    }
    
    // Проверяем соблюдение правил из sorting.md для текущего узла
    const nodeOrder = nodeOrderMap.get(node.node_id);
    if (nodeOrder !== undefined) {
      checkSortingRules(node, nodeOrder, tagOrderProfile, issues);
    }
    
    // Проверяем порядок зависимостей для children (правило зависимости)
    if (node.children && node.children.length > 0) {
      // Передаем children как siblings для проверки порядка среди них
      // Это применяет правило зависимости: раздел Б логически невозможен без А → А выше
      for (const child of node.children) {
        checkDependencyOrder(child, node.children, nodeOrderMap, nodeIds, skeleton.root, issues, path);
        
        // Проверяем соблюдение правил для каждого child
        const childOrder = nodeOrderMap.get(child.node_id);
        if (childOrder !== undefined) {
          checkSortingRules(child, childOrder, tagOrderProfile, issues);
        }
      }
    }
    
    // Рекурсивно проверяем children
    if (node.children) {
      node.children.forEach((child, index) => {
        traverse(child, [...path, `children[${index}]`], node.children || []);
      });
    }
    
    // Проверяем variants
    if (node.variants) {
      for (const variant of node.variants) {
        if (variant.children) {
          variant.children.forEach((child, index) => {
            traverse(child, [...path, `variants[${variant.variant_id}].children[${index}]`], variant.children || []);
          });
        }
      }
    }
  }
  
  traverse(skeleton.root, ['root'], []);
  
  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Проверяет, можно ли переходить к генерации формулировок
 */
export function canProceedToClauses(lintResult: LintResult): boolean {
  // Проверяем, что нет критичных или высокоприоритетных issues
  const criticalIssues = lintResult.issues.filter(
    issue => issue.severity === 'critical' || issue.severity === 'high'
  );
  
  return lintResult.valid && criticalIssues.length === 0;
}
