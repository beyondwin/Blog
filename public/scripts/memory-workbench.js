(() => {
  const archive = document.querySelector('[data-memory-archive]');
  const map = document.querySelector('[data-memory-map]');
  const root = archive || map;
  if (!root) return;

  const items = [...root.querySelectorAll('[data-memory-item]')];
  const searchInputs = [...root.querySelectorAll('[data-memory-search]')];
  const filters = [...root.querySelectorAll('[data-memory-filter]')];
  const empty = root.querySelector('[data-memory-empty]');
  const status = root.querySelector('[data-memory-status]');
  const graphNodes = [...root.querySelectorAll('[data-memory-node]')];
  const graphEdges = [...root.querySelectorAll('[data-memory-edge]')];

  const normalize = (value) => value.trim().toLocaleLowerCase();

  function select(id) {
    items.forEach((item) => item.classList.toggle('is-selected', item.dataset.memoryId === id));
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

  function applyFilters(source) {
    const query = normalize(source?.value ?? searchInputs[0]?.value ?? '');
    searchInputs.forEach((input) => { if (input !== source) input.value = source?.value ?? ''; });
    const topics = new Set(filters.filter((input) => input.checked && input.dataset.memoryFilter === 'topic').map((input) => input.value));
    const types = new Set(filters.filter((input) => input.checked && input.dataset.memoryFilter === 'type').map((input) => input.value));
    let count = 0;
    items.forEach((item) => {
      const itemTopics = new Set((item.dataset.memoryTopics ?? '').split(' ').filter(Boolean));
      const visible = (!query || (item.dataset.memorySearchText ?? '').includes(query)) &&
        (!topics.size || [...topics].some((topic) => itemTopics.has(topic))) &&
        (!types.size || types.has(item.dataset.memoryType));
      item.hidden = !visible;
      if (visible) count += 1;
    });
    if (empty) empty.hidden = count !== 0;
    if (status) status.hidden = count !== 0;
  }

  searchInputs.forEach((input) => input.addEventListener('input', () => applyFilters(input)));
  filters.forEach((input) => input.addEventListener('change', () => applyFilters()));
  root.querySelectorAll('[data-memory-select]').forEach((control) => control.addEventListener('click', () => select(control.dataset.memorySelect)));

  const hashSlug = window.location.hash.replace(/^#(?:map|relation|memory-detail)-/, '');
  const hashSelection = items.find((item) => item.dataset.memoryId === `thought:${hashSlug}`)?.dataset.memoryId;
  const params = new URLSearchParams(window.location.search);
  const queryThought = params.get('thought');
  const queryNode = params.get('node');
  const querySelection = queryThought
    ? `thought:${queryThought}`
    : queryNode?.startsWith('thought:')
      ? queryNode
      : '';
  const validQuerySelection = items.some((item) => item.dataset.memoryId === querySelection) ? querySelection : '';
  const initial = hashSelection || validQuerySelection || items.find((item) => item.classList.contains('is-selected'))?.dataset.memoryId;
  if (initial) {
    select(initial);
    if (validQuerySelection && window.matchMedia('(max-width: 720px)').matches) {
      const slug = validQuerySelection.replace(/^thought:/, '');
      const prefix = map ? 'relation' : 'memory-detail';
      history.replaceState(null, '', `${window.location.pathname}#${prefix}-${slug}`);
    }
  }
})();
