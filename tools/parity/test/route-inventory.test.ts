import { beforeAll, describe, expect, it } from 'vitest';
import { buildLegacyAstro } from '../src/capture-astro-baseline';
import { buildPublicRouteInventory } from '../src/route-inventory';

describe('Astro public route inventory', () => {
  let inventory: Awaited<ReturnType<typeof buildPublicRouteInventory>>;

  beforeAll(async () => {
    await buildLegacyAstro(process.cwd());
    inventory = await buildPublicRouteInventory(process.cwd());
  }, 180_000);

  it('contains every required route family and no draft records', async () => {
    expect(inventory.routes).toContain('/');
    expect(inventory.routes).toContain('/articles/why-i-read-in-the-ai-era/');
    expect(inventory.routes).toContain('/reviews/black-swan/');
    expect(inventory.routes).toContain('/memory/');
    expect(inventory.routes.some((route) => route.includes('example-article'))).toBe(false);
  });
});
