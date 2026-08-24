import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRendererPromotionReport } from './promotion-contract.ts';

const USAGE = 'Usage: verify-promotion.ts --report <renderer-promotion-report.json> [--require-clean]';

function argumentsFrom(argv: string[]): { report: string; requireCommittedClean: boolean } {
  if (argv.length !== 2 && argv.length !== 3) throw new Error(USAGE);
  if (argv[0] !== '--report' || !argv[1]) throw new Error(USAGE);
  if (argv.length === 3 && argv[2] !== '--require-clean') throw new Error(USAGE);
  return { report: argv[1], requireCommittedClean: argv[2] === '--require-clean' };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const options = argumentsFrom(process.argv.slice(2));
  const result = await verifyRendererPromotionReport(
    process.cwd(),
    options.report,
    { requireCommittedClean: options.requireCommittedClean },
  );
  console.log(JSON.stringify(result));
}
