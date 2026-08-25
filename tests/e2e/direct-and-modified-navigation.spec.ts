import { expect, test } from '@playwright/test';
import { APPROVED_VIEWPORTS, canonicalUrl } from './support';

const detailPath = '/articles/why-i-read-in-the-ai-era/';
const rowAnchor = 'record-articles-why-i-read-in-the-ai-era';

test('Ctrl, Cmd, Shift, middle, and explicit new-tab activations keep a clean canonical href and are not intercepted', async ({ page }) => {
  await page.setViewportSize(APPROVED_VIEWPORTS.desktop);
  await page.goto(canonicalUrl('/articles/'));
  const link = page.locator(`#${rowAnchor}`).getByRole('link');
  await expect(link).toHaveAttribute('href', detailPath);

  const activations = [
    { name: 'Ctrl', type: 'click', init: { button: 0, ctrlKey: true } },
    { name: 'Cmd', type: 'click', init: { button: 0, metaKey: true } },
    { name: 'Shift', type: 'click', init: { button: 0, shiftKey: true } },
    { name: 'middle', type: 'auxclick', init: { button: 1 } },
    { name: 'new-tab', type: 'click', init: { button: 0 }, target: '_blank' },
  ] as const;

  for (const activation of activations) {
    const result = await link.evaluate((anchor, value) => {
      const originalTarget = anchor.getAttribute('target');
      const target = 'target' in value ? value.target : undefined;
      if (target) anchor.setAttribute('target', target);
      let preventedByApplication: boolean | undefined;
      const observer = (event: Event) => {
        preventedByApplication = event.defaultPrevented;
        event.preventDefault();
      };
      window.addEventListener(value.type, observer, { once: true });
      anchor.dispatchEvent(new MouseEvent(value.type, {
        bubbles: true,
        cancelable: true,
        ...value.init,
      }));
      if (originalTarget === null) anchor.removeAttribute('target');
      else anchor.setAttribute('target', originalTarget);
      return {
        preventedByApplication,
        storedOriginKeys: Object.keys(sessionStorage).filter((key) => key.startsWith('bw:origin:')),
      };
    }, activation);
    expect(result, activation.name).toEqual({ preventedByApplication: false, storedOriginKeys: [] });
    await expect(link).toHaveAttribute('href', detailPath);
    await expect(page).toHaveURL(canonicalUrl('/articles/'));
  }
});

test('ordinary continuation does not inherit the incoming origin', async ({ page }) => {
  await page.goto(canonicalUrl('/articles/'));
  await page.locator(`#${rowAnchor}`).getByRole('link').click();
  await expect(page).toHaveURL(canonicalUrl(detailPath));
  const continuation = page.getByRole('link', { name: '글 전체 보기' });
  await expect(continuation).toHaveAttribute('href', '/articles/');
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('bw:origin:')))).toEqual([]);
  await continuation.click();
  await expect(page).toHaveURL(canonicalUrl('/articles/'));
  expect(page.url()).not.toContain('__bw_');
});
