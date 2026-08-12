(() => {
  async function start() {
    const archive = document.querySelector('[data-memory-archive]');
    const map = document.querySelector('[data-memory-map]');
    const root = archive || map;
    if (!root) return;

    const {
      applyMemorySelection,
      buildMemorySelectionUrl,
      resolveMemorySelection,
    } = await import('/scripts/memory-workbench-state.mjs');
    const items = [...root.querySelectorAll('[data-memory-item]')];
    const details = [...root.querySelectorAll('[data-memory-detail]')];
    const searchInputs = [...root.querySelectorAll('[data-memory-search]')];
    const filters = [...root.querySelectorAll('[data-memory-filter]')];
    const empty = root.querySelector('[data-memory-empty]');
    const status = root.querySelector('[data-memory-status]');
    const graphNodes = [...root.querySelectorAll('[data-memory-node]')];
    const graphEdges = [...root.querySelectorAll('[data-memory-edge]')];
    const mode = map ? 'map' : 'archive';

    root.classList.add('is-enhanced');
    const normalize = (value) => value.trim().toLocaleLowerCase();
    const itemIds = items.map((item) => item.dataset.memoryId).filter(Boolean);

    function select(id, { updateUrl = false, replace = false } = {}) {
      if (!itemIds.includes(id)) return;
      applyMemorySelection({ items, details, graphNodes, graphEdges }, id);
      if (updateUrl) {
        const url = buildMemorySelectionUrl(window.location.pathname, window.location.search, id, mode);
        history[replace ? 'replaceState' : 'pushState'](null, '', url);
      }
    }

    function selectFromLocation() {
      const id = resolveMemorySelection({
        hash: window.location.hash,
        search: window.location.search,
        itemIds,
        fallbackId: root.dataset.memoryFallback ?? '',
      });
      if (id) select(id);
      return id;
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
    root.querySelectorAll('[data-memory-select]').forEach((control) => control.addEventListener('click', (event) => {
      event.preventDefault();
      select(control.dataset.memorySelect, { updateUrl: true });
    }));
    window.addEventListener('popstate', selectFromLocation);
    window.addEventListener('hashchange', selectFromLocation);

    const hadRequestedSelection = /^(?:#(?:map|relation|memory-detail)-)/.test(window.location.hash)
      || new URLSearchParams(window.location.search).has(mode === 'map' ? 'node' : 'thought');
    const initial = selectFromLocation();
    if (initial && hadRequestedSelection) select(initial, { updateUrl: true, replace: true });
  }

  start();
})();
