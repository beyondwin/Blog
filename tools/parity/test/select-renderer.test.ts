import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  selectRenderer,
  type RendererSelectionReport,
} from '../src/select-renderer';

async function readReport(name: string): Promise<RendererSelectionReport> {
  const path = join(process.cwd(), 'tests/fixtures/parity', name);
  return JSON.parse(await readFile(path, 'utf8')) as RendererSelectionReport;
}

describe('renderer selection', () => {
  it('selects Next when it is the only renderer that passes mandatory gates', async () => {
    const report = await readReport('renderer-report-next-one-win.json');
    report.candidates.reactRouter.mandatoryFailures = ['serious axe finding'];

    expect(selectRenderer(report)).toEqual({ winner: 'next' });
  });

  it('selects React Router when both pass and Next wins only one quality category', async () => {
    const report = await readReport('renderer-report-next-one-win.json');

    expect(selectRenderer(report)).toEqual({ winner: 'react-router' });
  });

  it('selects Next when both pass and it wins two quality categories', async () => {
    const report = await readReport('renderer-report-pass.json');

    expect(selectRenderer(report)).toEqual({ winner: 'next' });
  });

  it('does not count an apparent advantage hidden inside candidate variance', async () => {
    const report = await readReport('renderer-report-pass.json');
    report.candidates.next.quality.lcpMs.mad = 101;

    expect(selectRenderer(report)).toEqual({ winner: 'react-router' });
  });

  it('counts responsive-image transfer only at equal displayed dimensions and format', async () => {
    const report = await readReport('renderer-report-pass.json');
    report.candidates.next.quality.lcpMs = { median: 1_000, mad: 10 };
    report.candidates.reactRouter.quality.lcpMs = { median: 1_000, mad: 10 };
    report.candidates.next.quality.imageBytes = { median: 80_000, mad: 1_000 };
    report.candidates.reactRouter.quality.imageBytes = { median: 100_000, mad: 1_000 };
    report.candidates.next.responsiveImageContract = ['/:desktop:image/webp:1200x800'];
    report.candidates.reactRouter.responsiveImageContract = ['/:desktop:image/webp:1200x800'];

    expect(selectRenderer(report)).toEqual({ winner: 'next' });

    report.candidates.next.responsiveImageContract = ['/:desktop:image/avif:1200x800'];
    expect(selectRenderer(report)).toEqual({ winner: 'react-router' });
  });

  it('blocks selection when neither renderer passes mandatory gates', async () => {
    const report = await readReport('renderer-report-next-one-win.json');
    report.candidates.next.mandatoryFailures = ['console error'];
    report.candidates.reactRouter.mandatoryFailures = ['viewport overflow'];

    expect(selectRenderer(report)).toEqual({
      blocked: true,
      reasons: ['next: console error', 'react-router: viewport overflow'],
    });
  });
});
