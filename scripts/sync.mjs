import { readFile } from 'node:fs/promises';
import { findQueueProblems, getQueuedItems, parseQueue } from './queue.mjs';

const queuePath = new URL('../queue.md', import.meta.url);
const markdown = await readFile(queuePath, 'utf8');
const items = parseQueue(markdown);
const problems = findQueueProblems(items);

if (problems.length > 0) {
  console.error('Queue has validation problems:');
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exit(1);
}

const queued = getQueuedItems(items);

if (queued.length === 0) {
  console.log('No queued URLs.');
  process.exit(0);
}

console.log(`Queued URLs: ${queued.length}`);

queued.forEach((item, index) => {
  console.log('');
  console.log(`${index + 1}. ${item.url}`);
  console.log(`   comment: ${item.metadata.comment}`);
});

console.log('');
console.log('Next: ask Codex or Claude to process one queued item using SYNC.md.');
