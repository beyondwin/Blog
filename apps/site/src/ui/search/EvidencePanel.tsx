import { useEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { AnswerViewModel } from './answerViewModel';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface EvidencePanelProps {
  answer: AnswerViewModel;
  selectedEvidenceId: string;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose(): void;
  onSelect(evidenceId: string): void;
}

export function EvidencePanel({
  answer,
  selectedEvidenceId,
  returnFocusRef,
  onClose,
  onSelect,
}: EvidencePanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const selected = answer.evidenceById.get(selectedEvidenceId);
  if (!selected) throw new Error('selected evidence must resolve');

  useEffect(() => {
    const shell = returnFocusRef.current?.closest<HTMLElement>('.site-shell')
      ?? document.querySelector<HTMLElement>('.site-shell');
    const panel = panelRef.current;
    const returnTarget = returnFocusRef.current;
    const hadInert = shell?.hasAttribute('inert') ?? false;
    const previousAriaHidden = shell?.getAttribute('aria-hidden') ?? null;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    shell?.setAttribute('inert', '');
    shell?.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.cancelAnimationFrame(focusFrame);
      if (!hadInert) shell?.removeAttribute('inert');
      if (previousAriaHidden === null) shell?.removeAttribute('aria-hidden');
      else shell?.setAttribute('aria-hidden', previousAriaHidden);
      document.documentElement.style.overflow = previousDocumentOverflow;
      document.body.style.overflow = previousBodyOverflow;
      window.requestAnimationFrame(() => {
        if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
      });
    };
  }, [onClose, returnFocusRef]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="evidence-modal-layer">
      <button className="evidence-backdrop" type="button" tabIndex={-1} aria-hidden="true" onClick={onClose} />
      <aside ref={panelRef} className="evidence-panel" role="dialog" aria-modal="true" aria-labelledby="evidence-panel-title">
        <header className="evidence-panel__head">
          <h2 id="evidence-panel-title">이 답의 근거</h2>
          <button ref={closeRef} className="evidence-panel__close" type="button" aria-label="근거 패널 닫기" onClick={onClose} />
        </header>
        <div className="evidence-panel__body">
          <div className="evidence-panel__sources" aria-label="답변에 사용한 근거">
            {answer.evidence.map((item, index) => (
              <button
                key={item.evidenceId}
                type="button"
                aria-label={`${item.recordTitle} · ${item.locator.label}`}
                aria-pressed={selectedEvidenceId === item.evidenceId}
                onClick={() => onSelect(item.evidenceId)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span><strong>{item.recordTitle}</strong>
              </button>
            ))}
          </div>
          <article className="evidence-panel__preview">
            <p className="evidence-panel__meta">{selected.collectionLabel}</p>
            <p className="evidence-panel__locator">{selected.locator.label}</p>
            <blockquote>{selected.excerpt}</blockquote>
            <div className="evidence-panel__location">
              <span>{selected.recordTitle}</span><a href={selected.canonicalPath}>원문 보기</a>
            </div>
          </article>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
