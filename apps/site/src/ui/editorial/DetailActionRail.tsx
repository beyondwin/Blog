import { useState } from 'react';
import { copyCanonicalUrl, type ClipboardWriter } from './copyCanonicalUrl';

function HeartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M20.8 4.7a5.4 5.4 0 0 0-7.7 0L12 5.8l-1.1-1.1a5.4 5.4 0 1 0-7.7 7.7L12 21l8.8-8.6a5.4 5.4 0 0 0 0-7.7Z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M20 15a3 3 0 0 1-3 3H9l-5 3v-6a3 3 0 0 1-1-2V7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3Z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M10 13a5 5 0 0 0 7.1.1l2-2A5 5 0 0 0 12 4l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
    </svg>
  );
}

function browserClipboard(): ClipboardWriter | null {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return null;
  return navigator.clipboard;
}

export function DetailActionRail({
  canonicalUrl,
  clipboard,
}: {
  canonicalUrl: string;
  clipboard?: ClipboardWriter;
}) {
  const [message, setMessage] = useState('');

  const copy = async () => {
    const target = clipboard ?? browserClipboard();
    const result = target ? await copyCanonicalUrl(canonicalUrl, target) : 'failed';
    setMessage(result === 'copied'
      ? '링크를 복사했습니다.'
      : '링크를 복사하지 못했습니다. 다시 시도해 주세요.');
  };

  return (
    <aside className="detail-action-rail" aria-label="상세 동작">
      <span className="detail-action-rail__unavailable">
        <HeartIcon />
        <span>좋아요 · 준비 중</span>
      </span>
      <span className="detail-action-rail__unavailable">
        <CommentIcon />
        <span>댓글 · 준비 중</span>
      </span>
      <button className="detail-action-rail__copy" type="button" onClick={copy}>
        <LinkIcon />
        <span>링크 복사</span>
      </button>
      <span className="visually-hidden" aria-live="polite" aria-atomic="true">{message}</span>
    </aside>
  );
}
