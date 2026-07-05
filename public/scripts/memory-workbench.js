(() => {
    const root = document.querySelector('[data-memory-app]');
    const payloadElement = document.querySelector('#memory-payload');
    const payload = payloadElement?.textContent ? JSON.parse(payloadElement.textContent) : {
      graph: { nodes: [], edges: [], selectedFallback: null },
      details: {},
      fallbackRelationships: [],
    };

    if (root) {
      const state = {
        query: '',
        activeLens: 'all',
        activeTopicIds: new Set(),
        activeSourceIds: new Set(),
        activeMemoryTypes: new Set(),
        activeEdgeTypes: new Set(),
        selectedNodeId: payload.graph.selectedFallback,
        urlHasSelection: false,
        layoutMode: 'brain',
        showLabels: true,
        density: 'normal',
      };

      const graphStage = root.querySelector('[data-memory-graph]');
      const graphNodes = Array.from(root.querySelectorAll('[data-memory-node]'));
      const graphEdges = Array.from(root.querySelectorAll('[data-memory-edge]'));
      const listItems = Array.from(root.querySelectorAll('[data-memory-list-item]'));
      const sourceCards = Array.from(root.querySelectorAll('[data-memory-source-card]'));
      const search = root.querySelector('[data-memory-search]');
      const lensButtons = Array.from(root.querySelectorAll('[data-memory-lens]'));
      const topicButtons = Array.from(root.querySelectorAll('.memory-app__rail [data-memory-topic]'));
      const sourceButtons = Array.from(root.querySelectorAll('.memory-app__rail [data-memory-source]'));
      const typeButtons = Array.from(root.querySelectorAll('.memory-app__rail [data-memory-type]'));
      const edgeTypeButtons = Array.from(root.querySelectorAll('.memory-app__rail [data-memory-edge-type]'));
      const layoutButtons = Array.from(root.querySelectorAll('[data-memory-layout]'));
      const resetButtons = Array.from(root.querySelectorAll('[data-memory-reset]'));
      const labelsButton = root.querySelector('[data-memory-labels]');
      const densityButton = root.querySelector('[data-memory-density]');
      const tabs = Array.from(root.querySelectorAll('[data-memory-tab]'));
      const panels = Array.from(root.querySelectorAll('.memory-panel'));
      const detailTitle = root.querySelector('[data-memory-detail-title]');
      const detailBody = root.querySelector('[data-memory-detail-body]');
      const detailChips = root.querySelector('[data-memory-detail-chips]');
      const detailSources = root.querySelector('[data-memory-detail-sources]');
      const detailRelationships = root.querySelector('[data-memory-detail-relationships]');
      const graphEmpty = root.querySelector('[data-memory-graph-empty]');
      const listEmptyStates = Array.from(root.querySelectorAll('[data-memory-list-empty]'));
      const sourceEmpty = root.querySelector('[data-memory-source-empty]');
      const topicGroups = Array.from(root.querySelectorAll('[data-memory-topic-group]'));
      const nodeById = new Map(payload.graph.nodes.map((node) => [node.id, node]));
      const edgeById = new Map(payload.graph.edges.map((edge) => [edge.id, edge]));
      const validNodeIds = new Set(payload.graph.nodes.map((node) => node.id));
      const validLensIds = new Set((payload.graph.facets?.lenses ?? []).map((lens) => lens.id));
      const validTopicIds = new Set((payload.graph.facets?.topics ?? []).map((topic) => topic.id));
      const validSourceIds = new Set((payload.graph.facets?.sources ?? []).map((source) => source.id));
      const validMemoryTypes = new Set((payload.graph.facets?.memoryTypes ?? []).map((type) => type.id));
      const validEdgeTypes = new Set((payload.graph.facets?.edgeTypes ?? []).map((type) => type.id));

      function allowedValues(params, key, allowed) {
        return params.getAll(key).filter((value) => allowed.has(value));
      }

      function readUrlState() {
        if (!window.location) {
          return {};
        }

        const params = new URLSearchParams(window.location.search);
        const selectedNodeId = params.get('node') ?? '';
        const activeLens = params.get('lens') ?? '';
        const urlState = {};

        if (selectedNodeId && validNodeIds.has(selectedNodeId)) {
          urlState.selectedNodeId = selectedNodeId;
        }

        const query = (params.get('q') ?? '').trim().toLocaleLowerCase();
        if (query) {
          urlState.query = query;
        }

        if (activeLens && validLensIds.has(activeLens)) {
          urlState.activeLens = activeLens;
        }

        urlState.activeTopicIds = allowedValues(params, 'topic', validTopicIds);
        urlState.activeSourceIds = allowedValues(params, 'source', validSourceIds);
        urlState.activeMemoryTypes = allowedValues(params, 'type', validMemoryTypes);
        urlState.activeEdgeTypes = allowedValues(params, 'edge', validEdgeTypes);

        return urlState;
      }

      function writeUrlState() {
        if (!window.history || !window.location) {
          return;
        }

        const params = new URLSearchParams();
        const selectedIsFallback = state.selectedNodeId === payload.graph.selectedFallback;
        if (state.selectedNodeId && (!selectedIsFallback || state.urlHasSelection)) {
          params.set('node', state.selectedNodeId);
        }
        if (state.query) {
          params.set('q', state.query);
        }
        if (state.activeLens && state.activeLens !== 'all') {
          params.set('lens', state.activeLens);
        }
        state.activeTopicIds.forEach((value) => params.append('topic', value));
        state.activeSourceIds.forEach((value) => params.append('source', value));
        state.activeMemoryTypes.forEach((value) => params.append('type', value));
        state.activeEdgeTypes.forEach((value) => params.append('edge', value));

        const nextUrl = params.toString()
          ? `${window.location.pathname}?${params.toString()}`
          : window.location.pathname;
        window.history.replaceState(null, '', nextUrl);
      }

      const urlState = readUrlState();
      if (urlState.query !== undefined) {
        state.query = urlState.query;
      }
      if (urlState.activeLens) {
        state.activeLens = urlState.activeLens;
      }
      if (urlState.selectedNodeId) {
        state.selectedNodeId = urlState.selectedNodeId;
        state.urlHasSelection = true;
      }
      for (const value of urlState.activeTopicIds ?? []) {
        state.activeTopicIds.add(value);
      }
      for (const value of urlState.activeSourceIds ?? []) {
        state.activeSourceIds.add(value);
      }
      for (const value of urlState.activeMemoryTypes ?? []) {
        state.activeMemoryTypes.add(value);
      }
      for (const value of urlState.activeEdgeTypes ?? []) {
        state.activeEdgeTypes.add(value);
      }
      if (search instanceof HTMLInputElement && state.query) {
        search.value = state.query;
      }

      function normalize(value) {
        return value.trim().toLocaleLowerCase();
      }

      function toggleSetValue(set, value) {
        if (!value) {
          return;
        }

        if (set.has(value)) {
          set.delete(value);
        } else {
          set.add(value);
        }
      }

      function splitAttribute(element, attributeName) {
        return (element.getAttribute(attributeName) ?? '').split(/\s+/).filter(Boolean);
      }

      function matchesSetAttribute(element, attributeName, values) {
        if (values.size === 0) {
          return true;
        }

        return splitAttribute(element, attributeName).some((value) => values.has(value));
      }

      function nodeAllowedByLens(node) {
        const kind = node.getAttribute('data-memory-kind') ?? '';

        if (state.activeLens === 'topics') {
          return kind === 'thought' || kind === 'topic';
        }

        if (state.activeLens === 'sources') {
          return kind === 'thought' || kind === 'source';
        }

        if (state.activeLens === 'theses') {
          return kind !== 'source';
        }

        if (state.activeLens === 'external-vs-mine') {
          return kind === 'thought' || kind === 'source';
        }

        return true;
      }

      function activeEdgeNodeIds() {
        if (state.activeEdgeTypes.size === 0) {
          return null;
        }

        return new Set(payload.graph.edges
          .filter((edge) => state.activeEdgeTypes.has(edge.type))
          .flatMap((edge) => [edge.from, edge.to]));
      }

      function nodeMatchesBase(node, edgeNodeIds) {
        const text = normalize(node.getAttribute('data-memory-text') ?? node.textContent ?? '');
        const nodeType = node.getAttribute('data-memory-type') ?? '';

        if (!nodeAllowedByLens(node)) {
          return false;
        }

        if (state.query && !text.includes(state.query)) {
          return false;
        }

        if (!matchesSetAttribute(node, 'data-memory-topics', state.activeTopicIds)) {
          return false;
        }

        if (!matchesSetAttribute(node, 'data-memory-sources', state.activeSourceIds)) {
          return false;
        }

        if (state.activeMemoryTypes.size > 0 && !state.activeMemoryTypes.has(nodeType)) {
          return false;
        }

        if (edgeNodeIds && !edgeNodeIds.has(node.getAttribute('data-memory-node') ?? '')) {
          return false;
        }

        return true;
      }

      function computeVisibleNodeIds() {
        const edgeNodeIds = activeEdgeNodeIds();
        const visible = new Set();
        const lensAllowed = new Set(graphNodes
          .filter((node) => nodeAllowedByLens(node))
          .map((node) => node.getAttribute('data-memory-node'))
          .filter(Boolean));

        graphNodes.forEach((node) => {
          if (nodeMatchesBase(node, edgeNodeIds)) {
            const id = node.getAttribute('data-memory-node');
            if (id) {
              visible.add(id);
            }
          }
        });

        payload.graph.edges.forEach((edge) => {
          if (!edge.derived) {
            return;
          }

          const fromNode = nodeById.get(edge.from);
          const toNode = nodeById.get(edge.to);
          const visibleThoughtContext = (fromNode?.kind === 'thought' && visible.has(edge.from)) || (toNode?.kind === 'thought' && visible.has(edge.to));

          if (visibleThoughtContext) {
            if (lensAllowed.has(edge.from)) {
              visible.add(edge.from);
            }
            if (lensAllowed.has(edge.to)) {
              visible.add(edge.to);
            }
          }
        });

        return visible;
      }

      function itemMatches(item) {
        const text = normalize(item.getAttribute('data-memory-text') ?? item.textContent ?? '');
        const itemType = item.getAttribute('data-memory-type') ?? '';

        if (state.query && !text.includes(state.query)) {
          return false;
        }

        if (!matchesSetAttribute(item, 'data-memory-topics', state.activeTopicIds)) {
          return false;
        }

        if (!matchesSetAttribute(item, 'data-memory-sources', state.activeSourceIds)) {
          return false;
        }

        if (state.activeMemoryTypes.size > 0 && !state.activeMemoryTypes.has(itemType)) {
          return false;
        }

        return true;
      }

      function createRow(text, href) {
        const row = document.createElement(href ? 'a' : 'p');
        row.textContent = text;
        row.className = href ? 'memory-detail-link' : 'memory-detail-static';
        if (href) {
          row.href = href;
        }
        return row;
      }

      function renderDetail() {
        const selected = payload.details[state.selectedNodeId] ?? null;

        if (!selected || !detailTitle || !detailBody || !detailChips || !detailSources || !detailRelationships) {
          return;
        }

        detailTitle.textContent = selected.title;
        detailBody.textContent = selected.body || selected.sublabel || '';
        detailChips.innerHTML = '';
        detailSources.innerHTML = '';
        detailRelationships.innerHTML = '';

        [selected.kind, selected.memoryType, selected.origin, ...(selected.topics ?? []), ...(selected.theses ?? [])]
          .filter(Boolean)
          .forEach((value) => {
            const chip = document.createElement('span');
            chip.textContent = value;
            detailChips.append(chip);
          });

        if (selected.sources) {
          selected.sources.forEach((source) => {
            detailSources.append(createRow(source.unresolved ? `${source.id} · unresolved source` : source.title, source.href));
          });
        }

        if (selected.href) {
          detailSources.append(createRow('Open source route', selected.href));
        }

        if (selected.thoughts) {
          selected.thoughts.forEach((thought) => {
            detailRelationships.append(createRow(thought.title));
          });
        }

        const relationshipValues = selected.relationships?.length > 0 ? selected.relationships : payload.fallbackRelationships;
        relationshipValues.forEach((relationship) => {
          detailRelationships.append(createRow(relationship));
        });
      }

      function updateSelectedFromVisibleNodes(visible) {
        if (state.selectedNodeId && visible.has(state.selectedNodeId)) {
          return;
        }

        state.selectedNodeId = [...visible][0] ?? payload.graph.selectedFallback;
      }

      function syncButtonStates() {
        lensButtons.forEach((button) => {
          const active = button.getAttribute('data-memory-lens') === state.activeLens;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', String(active));
        });

        [
          [topicButtons, state.activeTopicIds, 'data-memory-topic'],
          [sourceButtons, state.activeSourceIds, 'data-memory-source'],
          [typeButtons, state.activeMemoryTypes, 'data-memory-type'],
          [edgeTypeButtons, state.activeEdgeTypes, 'data-memory-edge-type'],
        ].forEach(([buttons, activeSet, attribute]) => {
          buttons.forEach((button) => {
            const active = activeSet.has(button.getAttribute(attribute) ?? '');
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
          });
        });

        layoutButtons.forEach((button) => {
          const active = button.getAttribute('data-memory-layout') === state.layoutMode;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', String(active));
        });

        labelsButton?.classList.toggle('is-active', state.showLabels);
        labelsButton?.setAttribute('aria-pressed', String(state.showLabels));
        densityButton?.classList.toggle('is-active', state.density === 'wide');
        densityButton?.setAttribute('aria-pressed', String(state.density === 'wide'));
      }

      function applyFilters() {
        const visible = computeVisibleNodeIds();
        let visibleGraphCount = 0;
        let visibleListCount = 0;
        let visibleSourceCount = 0;

        graphNodes.forEach((node) => {
          const id = node.getAttribute('data-memory-node') ?? '';
          const isVisible = visible.has(id);
          node.toggleAttribute('hidden', !isVisible);
          if (isVisible) {
            visibleGraphCount += 1;
          }
        });

        graphEdges.forEach((edge) => {
          const modelEdge = edgeById.get(edge.getAttribute('data-memory-edge'));
          const edgeType = edge.getAttribute('data-memory-edge-type') ?? '';
          const visibleEdge = modelEdge &&
            visible.has(modelEdge.from) &&
            visible.has(modelEdge.to) &&
            (state.activeEdgeTypes.size === 0 || state.activeEdgeTypes.has(edgeType));
          edge.toggleAttribute('hidden', !visibleEdge);
        });

        listItems.forEach((item) => {
          const visibleItem = itemMatches(item);
          item.toggleAttribute('hidden', !visibleItem);
          if (visibleItem) {
            visibleListCount += 1;
          }
        });

        sourceCards.forEach((card) => {
          const sourceId = card.getAttribute('data-memory-source-card') ?? '';
          const sourceVisible = state.activeSourceIds.size === 0 || state.activeSourceIds.has(sourceId);
          card.toggleAttribute('hidden', !sourceVisible);
          if (sourceVisible) {
            visibleSourceCount += 1;
          }
        });

        topicGroups.forEach((group) => {
          const groupItems = Array.from(group.querySelectorAll('[data-memory-list-item]'));
          group.toggleAttribute('hidden', !groupItems.some((item) => !item.hidden));
        });

        updateSelectedFromVisibleNodes(visible);

        graphNodes.forEach((node) => {
          const selected = node.getAttribute('data-memory-node') === state.selectedNodeId;
          node.classList.toggle('is-selected', selected);
          node.setAttribute('aria-pressed', String(selected));
        });

        listItems.forEach((item) => {
          item.classList.toggle('is-selected', item.getAttribute('data-memory-node') === state.selectedNodeId);
        });

        graphEmpty?.toggleAttribute('hidden', visibleGraphCount > 0);
        listEmptyStates.forEach((emptyState) => emptyState.toggleAttribute('hidden', visibleListCount > 0));
        sourceEmpty?.toggleAttribute('hidden', visibleSourceCount > 0);
        graphStage?.setAttribute('data-memory-layout-mode', state.layoutMode);
        graphStage?.setAttribute('data-memory-density-mode', state.density);
        graphStage?.classList.toggle('is-hiding-labels', !state.showLabels);
        syncButtonStates();
        renderDetail();
        writeUrlState();
      }

      search?.addEventListener('input', () => {
        state.query = search instanceof HTMLInputElement ? normalize(search.value) : '';
        applyFilters();
      });

      lensButtons.forEach((button) => {
        button.addEventListener('click', () => {
          state.activeLens = button.getAttribute('data-memory-lens') ?? 'all';
          applyFilters();
        });
      });

      [
        [topicButtons, state.activeTopicIds, 'data-memory-topic'],
        [sourceButtons, state.activeSourceIds, 'data-memory-source'],
        [typeButtons, state.activeMemoryTypes, 'data-memory-type'],
        [edgeTypeButtons, state.activeEdgeTypes, 'data-memory-edge-type'],
      ].forEach(([buttons, activeSet, attribute]) => {
        buttons.forEach((button) => {
          button.addEventListener('click', () => {
            toggleSetValue(activeSet, button.getAttribute(attribute) ?? '');
            applyFilters();
          });
        });
      });

      graphNodes.forEach((node) => {
        node.addEventListener('click', () => {
          state.selectedNodeId = node.getAttribute('data-memory-node') ?? state.selectedNodeId;
          state.urlHasSelection = true;
          applyFilters();
        });
      });

      listItems.forEach((item) => {
        item.addEventListener('click', () => {
          state.selectedNodeId = item.getAttribute('data-memory-node') ?? state.selectedNodeId;
          state.urlHasSelection = true;
          applyFilters();
        });
      });

      layoutButtons.forEach((button) => {
        button.addEventListener('click', () => {
          state.layoutMode = button.getAttribute('data-memory-layout') ?? 'brain';
          applyFilters();
        });
      });

      labelsButton?.addEventListener('click', () => {
        state.showLabels = !state.showLabels;
        applyFilters();
      });

      densityButton?.addEventListener('click', () => {
        state.density = state.density === 'normal' ? 'wide' : 'normal';
        applyFilters();
      });

      resetButtons.forEach((button) => {
        button.addEventListener('click', () => {
          state.query = '';
          state.activeLens = 'all';
          state.activeTopicIds.clear();
          state.activeSourceIds.clear();
          state.activeMemoryTypes.clear();
          state.activeEdgeTypes.clear();
          state.selectedNodeId = payload.graph.selectedFallback;
          state.urlHasSelection = false;
          state.layoutMode = 'brain';
          state.showLabels = true;
          state.density = 'normal';
          if (search instanceof HTMLInputElement) {
            search.value = '';
          }
          applyFilters();
        });
      });

      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          const target = tab.getAttribute('data-memory-tab');

          tabs.forEach((item) => {
            const selected = item === tab;
            item.classList.toggle('is-active', selected);
            item.setAttribute('aria-selected', String(selected));
          });

          panels.forEach((panel) => {
            const selected = panel.id === target;
            panel.classList.toggle('is-active', selected);
            panel.toggleAttribute('hidden', !selected);
          });

          applyFilters();
        });
      });

      applyFilters();
    }
})();
