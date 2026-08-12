import { describe, expect, it } from 'vitest';
import {
  applyMemorySelection,
  buildMemorySelectionUrl,
  resolveMemorySelection,
} from '../public/scripts/memory-workbench-state.mjs';

function selectable(id, key) {
  const classes = new Set();
  return {
    dataset: { [key]: id },
    classList: {
      contains: (name) => classes.has(name),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
    },
  };
}

describe('memory workbench selection state', () => {
  it('selects a valid thought query over the static fallback', () => {
    expect(resolveMemorySelection({
      hash: '',
      search: '?thought=context-quality-is-routing-problem',
      itemIds: ['thought:fallback', 'thought:context-quality-is-routing-problem'],
      fallbackId: 'thought:fallback',
    })).toBe('thought:context-quality-is-routing-problem');
  });

  it('updates both the selected row and visible desktop detail', () => {
    const items = [selectable('thought:a', 'memoryId'), selectable('thought:b', 'memoryId')];
    const details = [selectable('thought:a', 'memoryDetail'), selectable('thought:b', 'memoryDetail')];

    applyMemorySelection({ items, details }, 'thought:b');

    expect(items[0].classList.contains('is-selected')).toBe(false);
    expect(items[1].classList.contains('is-selected')).toBe(true);
    expect(details[0].classList.contains('is-selected')).toBe(false);
    expect(details[1].classList.contains('is-selected')).toBe(true);
  });

  it('keeps query and hash aligned for archive and map selection links', () => {
    expect(buildMemorySelectionUrl('/memory/', '', 'thought:routing-problem', 'archive')).toBe(
      '/memory/?thought=routing-problem#memory-detail-routing-problem',
    );
    expect(buildMemorySelectionUrl('/memory/map/', '?topic=ai', 'thought:routing-problem', 'map')).toBe(
      '/memory/map/?topic=ai&node=thought%3Arouting-problem#relation-routing-problem',
    );
  });
});
