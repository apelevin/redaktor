import { PreSkeletonState, ImpactOp, SkeletonNode, Issue } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Применяет impact операции к state
 */
export function applyImpactOperations(
  state: PreSkeletonState,
  impactOps: ImpactOp[]
): PreSkeletonState {
  let updatedState = { ...state };
  
  // Клонируем skeleton для безопасного изменения
  if (updatedState.document?.skeleton) {
    updatedState = {
      ...updatedState,
      document: {
        ...updatedState.document,
        skeleton: JSON.parse(JSON.stringify(updatedState.document.skeleton)),
      },
    };
  }
  
  // Клонируем domain для безопасного изменения
  updatedState = {
    ...updatedState,
    domain: JSON.parse(JSON.stringify(updatedState.domain)),
  };
  
  // Клонируем issues
  let issues = [...(updatedState.issues || [])];
  
  for (const impactOp of impactOps) {
    switch (impactOp.op) {
      case 'set_node_status':
        if (impactOp.node_id && impactOp.status) {
          updatedState = setNodeStatus(updatedState, impactOp.node_id, impactOp.status);
        }
        break;
        
      case 'select_variant':
        if (impactOp.node_id && impactOp.variant_id) {
          updatedState = selectVariant(updatedState, impactOp.node_id, impactOp.variant_id);
        }
        break;
        
      case 'set_domain_value':
        if (impactOp.path && impactOp.value !== undefined) {
          updatedState = setDomainValue(updatedState, impactOp.path, impactOp.value);
        }
        break;
        
      case 'add_issue':
        if (impactOp.issue_payload) {
          const newIssue: Issue = {
            id: impactOp.issue_payload.id || `issue_${uuidv4()}`,
            ...impactOp.issue_payload,
          };
          issues.push(newIssue);
        }
        break;
        
      case 'resolve_issue':
        if (impactOp.issue_id) {
          const issueIndex = issues.findIndex(i => i.id === impactOp.issue_id);
          if (issueIndex >= 0) {
            issues[issueIndex] = { ...issues[issueIndex], status: 'resolved' };
          }
        }
        break;
    }
  }
  
  // Обновляем issues
  updatedState = {
    ...updatedState,
    issues,
    meta: {
      ...updatedState.meta,
      updated_at: new Date().toISOString(),
      state_version: (updatedState.meta.state_version || 0) + 1,
    },
  };
  
  return updatedState;
}

/**
 * Устанавливает status для узла
 */
function setNodeStatus(
  state: PreSkeletonState,
  nodeId: string,
  status: 'active' | 'omitted'
): PreSkeletonState {
  if (!state.document?.skeleton) {
    return state;
  }
  
  const updatedSkeleton = { ...state.document.skeleton };
  updatedSkeleton.root = updateNodeStatus(updatedSkeleton.root, nodeId, status);
  
  return {
    ...state,
    document: {
      ...state.document,
      skeleton: updatedSkeleton,
    },
  };
}

/**
 * Рекурсивно обновляет status узла
 */
function updateNodeStatus(
  node: SkeletonNode,
  nodeId: string,
  status: 'active' | 'omitted'
): SkeletonNode {
  if (node.node_id === nodeId) {
    return { ...node, status };
  }
  
  if (node.children && node.children.length > 0) {
    return {
      ...node,
      children: node.children.map(child => updateNodeStatus(child, nodeId, status)),
    };
  }
  
  return node;
}

/**
 * Выбирает вариант для узла
 */
function selectVariant(
  state: PreSkeletonState,
  nodeId: string,
  variantId: string
): PreSkeletonState {
  if (!state.document?.skeleton) {
    return state;
  }
  
  const updatedSkeleton = { ...state.document.skeleton };
  updatedSkeleton.root = updateNodeVariant(updatedSkeleton.root, nodeId, variantId);
  
  return {
    ...state,
    document: {
      ...state.document,
      skeleton: updatedSkeleton,
    },
  };
}

/**
 * Рекурсивно обновляет selected_variant_id узла
 */
function updateNodeVariant(
  node: SkeletonNode,
  nodeId: string,
  variantId: string
): SkeletonNode {
  if (node.node_id === nodeId) {
    // Проверяем, что вариант существует
    if (node.variants && node.variants.length > 0) {
      const selectedVariant = node.variants.find(v => v.variant_id === variantId);
      if (selectedVariant) {
        // При выборе варианта устанавливаем selected_variant_id
        // UI будет использовать children из варианта через effectiveChildren
        return { 
          ...node, 
          selected_variant_id: variantId,
        };
      }
    }
    return node;
  }
  
  // Рекурсивно обновляем дочерние узлы
  if (node.children && node.children.length > 0) {
    return {
      ...node,
      children: node.children.map(child => updateNodeVariant(child, nodeId, variantId)),
    };
  }
  
  // Также проверяем варианты, если они есть
  if (node.variants && node.variants.length > 0) {
    return {
      ...node,
      variants: node.variants.map(variant => ({
        ...variant,
        children: variant.children?.map(child => updateNodeVariant(child, nodeId, variantId)) || [],
      })),
    };
  }
  
  return node;
}

/**
 * Устанавливает значение в domain по JSON Pointer пути
 */
function setDomainValue(
  state: PreSkeletonState,
  path: string,
  value: unknown
): PreSkeletonState {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const parts = cleanPath.split('/');
  
  const updatedDomain = JSON.parse(JSON.stringify(state.domain));
  let current: any = updatedDomain;
  
  // Создаем промежуточные объекты при необходимости
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part])) {
      current[part] = {};
    }
    current = current[part];
  }
  
  // Устанавливаем значение
  const lastPart = parts[parts.length - 1];
  current[lastPart] = value;
  
  return {
    ...state,
    domain: updatedDomain,
  };
}
