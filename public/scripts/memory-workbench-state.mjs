function hashSelection(hash, itemIds) {
  const slug = hash.replace(/^#(?:map|relation|memory-detail)-/, '');
  const id = slug ? `thought:${slug}` : '';
  return itemIds.includes(id) ? id : '';
}

export function resolveMemorySelection({ hash, search, itemIds, fallbackId = '' }) {
  const params = new URLSearchParams(search);
  const queryThought = params.get('thought');
  const queryNode = params.get('node');
  const queryId = queryThought
    ? `thought:${queryThought}`
    : queryNode?.startsWith('thought:')
      ? queryNode
      : '';
  const validQuery = itemIds.includes(queryId) ? queryId : '';

  return hashSelection(hash, itemIds) || validQuery || (itemIds.includes(fallbackId) ? fallbackId : itemIds[0] ?? '');
}

export function applyMemorySelection({ items = [], details = [], graphNodes = [], graphEdges = [] }, id) {
  items.forEach((item) => item.classList.toggle('is-selected', item.dataset.memoryId === id));
  details.forEach((detail) => detail.classList.toggle('is-selected', detail.dataset.memoryDetail === id));
  graphNodes.forEach((node) => {
    const selected = node.dataset.memoryNode === id;
    const neighbor = graphEdges.some((edge) =>
      (edge.dataset.from === id && edge.dataset.to === node.dataset.memoryNode) ||
      (edge.dataset.to === id && edge.dataset.from === node.dataset.memoryNode));
    node.classList.toggle('is-selected', selected);
    node.classList.toggle('is-muted', !selected && !neighbor);
  });
  graphEdges.forEach((edge) => {
    const direct = edge.dataset.from === id || edge.dataset.to === id;
    edge.classList.toggle('is-direct', direct);
    edge.classList.toggle('is-muted', !direct);
  });
}

export function buildMemorySelectionUrl(pathname, search, id, mode) {
  const slug = id.replace(/^thought:/, '');
  const params = new URLSearchParams(search);
  if (mode === 'map') {
    params.delete('thought');
    params.set('node', id);
  } else {
    params.delete('node');
    params.set('thought', slug);
  }
  const query = params.toString();
  const hash = mode === 'map' ? `relation-${slug}` : `memory-detail-${slug}`;
  return `${pathname}${query ? `?${query}` : ''}#${hash}`;
}
