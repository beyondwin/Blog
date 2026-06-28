const ITEM_PATTERN = /^- \[( |x|X)\]\s+(https?:\/\/\S+)\s*$/;
const METADATA_PATTERN = /^\s{2,}([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/;

export function parseQueue(markdown) {
  const lines = markdown.split(/\r?\n/);
  const items = [];
  let current = null;
  let inFence = false;

  lines.forEach((lineText, index) => {
    if (/^\s*```/.test(lineText)) {
      inFence = !inFence;
      current = null;
      return;
    }

    if (inFence) {
      return;
    }

    const itemMatch = lineText.match(ITEM_PATTERN);

    if (itemMatch) {
      current = {
        checked: itemMatch[1].toLowerCase() === 'x',
        line: index + 1,
        url: itemMatch[2],
        metadata: {},
      };
      items.push(current);
      return;
    }

    if (!current) {
      return;
    }

    const metadataMatch = lineText.match(METADATA_PATTERN);
    if (metadataMatch) {
      const [, key, value] = metadataMatch;
      current.metadata[key] = value.trim();
    }
  });

  return items;
}

export function getQueuedItems(items) {
  return items.filter((item) => {
    return !item.checked && item.metadata.status !== 'blocked';
  });
}

export function findQueueProblems(items) {
  const problems = [];

  for (const item of items) {
    if (!item.checked && !item.metadata.comment) {
      problems.push(`Line ${item.line}: queued URL is missing an indented comment line.`);
    }

    if (item.metadata.output && !item.metadata.output.endsWith('.mdx')) {
      problems.push(`Line ${item.line}: output must point to an .mdx file.`);
    }

    if (item.metadata.pr && !item.metadata.pr.startsWith('https://')) {
      problems.push(`Line ${item.line}: pr must be an HTTPS URL.`);
    }
  }

  return problems;
}
