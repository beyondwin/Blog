import { getAllContent, getAllTags } from './content';
import { loadPublicMemoryData } from './memory';
import { topicRecordHref, type SearchRecord } from './searchPresentation';
import { toRecordSummary } from './content/viewModels';
import { memoryThoughtHref } from './siteChrome';

function numericDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '.');
}

export async function loadSearchRecords(): Promise<SearchRecord[]> {
  const [entries, tags] = await Promise.all([getAllContent(), getAllTags()]);
  const memory = loadPublicMemoryData();

  const contentRecords: SearchRecord[] = entries.map((entry) => {
    const summary = toRecordSummary(entry);
    return {
      id: `${entry.collection}:${entry.id}`,
      kind: entry.collection === 'reviews' ? 'book' : 'writing',
      title: summary.title,
      description: summary.description,
      topics: summary.tags,
      href: summary.href,
      date: numericDate(summary.primaryDate),
      ...(summary.media ? { media: summary.media } : {}),
      ...(summary.coverState ? { coverState: summary.coverState } : {}),
    };
  });

  const memoryRecords: SearchRecord[] = memory.thoughts.map((thought) => ({
    id: `memory:${thought.slug}`,
    kind: 'sentence',
    title: thought.claimKo,
    description: thought.body,
    topics: thought.topics,
    href: memoryThoughtHref(thought.slug),
  }));

  const publicTopics = Array.from(new Set([
    ...tags,
    ...memory.topics.map((topic) => topic.label),
  ])).sort((a, b) => a.localeCompare(b));
  const topicRecords: SearchRecord[] = publicTopics.map((topic) => ({
    id: `topic:${topic}`,
    kind: 'topic',
    title: topic,
    description: '찾기로 이어진 단어',
    topics: [topic],
    href: topicRecordHref(topic, tags),
  }));

  return [...contentRecords, ...memoryRecords, ...topicRecords];
}
