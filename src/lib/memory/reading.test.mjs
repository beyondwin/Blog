import { describe, expect, it } from 'vitest';
import { makeMemory } from './testFixture.mjs';
import { buildMemoryThoughtPage, sortMemoryReading } from './reading.ts';

describe('memory reading', () => {
  it('orders thoughts as a readable sequence with two clusters', () => {
    const memory = makeMemory();
    const entries = sortMemoryReading(memory.thoughts);
    expect(entries.every((entry) => entry.href === `/memory/${entry.slug}/`)).toBe(true);
    const clusters = entries.map((entry) => entry.cluster);
    expect(new Set(clusters).size).toBeGreaterThan(0);
  });

  it('keeps only routeable writings and omits edge verbs', () => {
    const memory = makeMemory();
    const page = buildMemoryThoughtPage(memory, memory.thoughts[0].slug);
    expect(page.sourceWritings.every((source) => source.href.startsWith('/'))).toBe(true);
    expect(JSON.stringify(page)).not.toMatch(/지지한다|확장한다|semantic|procedural/);
  });

  it('returns null for an unknown slug', () => {
    expect(buildMemoryThoughtPage(makeMemory(), 'missing')).toBeNull();
  });
});
