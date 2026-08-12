import { getAllContent, getAllTags, getEntryDate, getEntryHref } from './content';
import { loadPublicMemoryData } from './memory';
import type { LiterarySearchRecord } from './searchPresentation';

function numericDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '.');
}

export async function loadLiterarySearchRecords(): Promise<LiterarySearchRecord[]> {
  const [entries, tags] = await Promise.all([getAllContent(), getAllTags()]);
  const memory = loadPublicMemoryData();

  const contentRecords: LiterarySearchRecord[] = entries.map((entry) => ({
    id: `${entry.collection}:${entry.id}`,
    kind: entry.collection === 'reviews' ? 'reading' : 'technical',
    title: entry.collection === 'reviews' ? entry.data.itemTitle : entry.data.title,
    description: entry.data.description,
    topics: entry.data.tags,
    href: getEntryHref(entry),
    date: numericDate(getEntryDate(entry)),
  }));

  const memoryRecords: LiterarySearchRecord[] = memory.thoughts.map((thought) => ({
    id: `memory:${thought.slug}`,
    kind: 'memory',
    title: thought.claimKo,
    description: thought.body,
    topics: thought.topics,
    href: `/memory/?thought=${encodeURIComponent(thought.slug)}`,
  }));

  const publicTopics = Array.from(new Set([
    ...tags,
    ...memory.topics.map((topic) => topic.label),
  ])).sort((a, b) => a.localeCompare(b));
  const topicRecords: LiterarySearchRecord[] = publicTopics.map((topic) => ({
    id: `topic:${topic}`,
    kind: 'topic',
    title: topic,
    description: '공개 기록과 기억을 잇는 주제명',
    topics: [topic],
    href: tags.includes(topic)
      ? `/tags/${encodeURIComponent(topic)}/`
      : `/memory/?topic=${encodeURIComponent(topic)}`,
  }));

  return [...contentRecords, ...memoryRecords, ...topicRecords];
}
