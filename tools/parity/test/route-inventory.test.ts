import { describe, expect, it } from 'vitest';
import { buildPublicRouteInventory } from '../src/route-inventory';

describe('Astro public route inventory', () => {
  it('contains every required route family and no draft records', async () => {
    const inventory = await buildPublicRouteInventory(process.cwd());
    expect(inventory.routes).toContain('/');
    expect(inventory.routes).toContain('/articles/why-i-read-in-the-ai-era/');
    expect(inventory.routes).toContain('/reviews/black-swan/');
    expect(inventory.routes).toContain('/memory/');
    expect(inventory.routes.some((route) => route.includes('example-article'))).toBe(false);
  });
});
