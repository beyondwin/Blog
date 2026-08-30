import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { ORIGIN_QUERY_MAX_LENGTH } from '../navigation/origin';
import { SearchResults } from './SearchResults';
import {
  askExperienceReducer,
  initialAskState,
  resolveAskSubmission,
  type PublicAnswerFixture,
} from './secondBrain';
import { boundedSearchQuery, searchMatches, type SearchInventoryItem } from './searchModel';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function ArrowIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 16h23M19 8l8 8-8 8" /></svg>;
}

function AgentStage({ fixture }: { fixture: PublicAnswerFixture }) {
  const [imageFailed, setImageFailed] = useState(false);
  const stageRef = useRef<HTMLElement>(null);
  const portraitRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (portraitRef.current?.complete && portraitRef.current.naturalWidth === 0) setImageFailed(true);
  }, []);
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 9;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 6;
    stageRef.current?.style.setProperty('--look-x', `${x}px`);
    stageRef.current?.style.setProperty('--look-y', `${y}px`);
  };
  return (
    <section
      ref={stageRef}
      className="agent-stage"
      aria-label="FORM & THOUGHT의 공개 기록"
      data-image-state={imageFailed ? 'error' : 'ready'}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        stageRef.current?.style.setProperty('--look-x', '0px');
        stageRef.current?.style.setProperty('--look-y', '0px');
      }}
    >
      <div className="agent-stage__field" aria-hidden="true" />
      <div className="agent-stage__plane agent-stage__plane--one" aria-hidden="true" />
      <div className="agent-stage__plane agent-stage__plane--two" aria-hidden="true" />
      <div className="agent-stage__plane agent-stage__plane--three" aria-hidden="true" />
      <div className="agent-stage__rule" aria-hidden="true" />
      <div className="agent-stage__portrait-frame">
        <img
          ref={portraitRef}
          className="agent-stage__portrait"
          src="/images/form-and-thought-agent-avatar-v1.png"
          alt="종이와 기록으로 구성된 인물"
          onError={() => setImageFailed(true)}
        />
        <div className="agent-stage__portrait-slice" aria-hidden="true" />
      </div>
      <div className="agent-stage__thread" aria-hidden="true" />
      {fixture.evidence.map((item, index) => (
        <div className={`memory-fragment memory-fragment--${index + 1}`} key={item.id} aria-hidden="true">
          {item.label}<small>{item.collectionLabel} · {item.dateLabel}</small>
        </div>
      ))}
    </section>
  );
}

function QuestionComposer({ id, label, note, onBlur, onChange, onFocus, onSubmit, placeholder, value }: {
  id: string;
  label: string;
  note?: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <form className="question-composer" action="/search/" method="get" onSubmit={onSubmit}>
      <label htmlFor={id}>{label}</label>
      <div className="question-composer__row">
        <input
          id={id}
          name="q"
          type="search"
          value={value}
          aria-label={label}
          autoComplete="off"
          maxLength={ORIGIN_QUERY_MAX_LENGTH}
          placeholder={placeholder}
          onBlur={onBlur}
          onChange={(event) => onChange(event.currentTarget.value)}
          onFocus={onFocus}
        />
        <button className="question-composer__send" type="submit" aria-label="질문 보내기" disabled={!value.trim()}>
          <ArrowIcon />
        </button>
      </div>
      {note ? <p className="question-composer__note">{note}</p> : null}
    </form>
  );
}

function RetrievalSequence({ view }: { view: 'retrieving' | 'connecting' | 'composing' }) {
  const steps = [
    ['retrieving', '관련 기록을 찾고 있습니다'],
    ['connecting', '생각 사이를 잇고 있습니다'],
    ['composing', '답을 쓰고 있습니다'],
  ] as const;
  return (
    <div className="retrieval-sequence">
      <h1>기억을<br />펼치는 중</h1>
      <ol>{steps.map(([step, copy]) => (
        <li key={step} data-active={view === step ? 'true' : 'false'}><span>{copy}</span></li>
      ))}</ol>
    </div>
  );
}

function AnswerStage({ evidenceOpen, fixture, onOpenEvidence, onSubmit, question }: {
  evidenceOpen: boolean;
  fixture: PublicAnswerFixture;
  onOpenEvidence: (index: number, trigger: HTMLElement) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  question: string;
}) {
  const [followUp, setFollowUp] = useState('');
  return (
    <div className="answer-stage">
      <p className="answer-stage__asked">당신이 물었습니다<strong>{question}</strong></p>
      <div className="answer-stage__lines">
        <p>{fixture.answerLead}</p>
        <p>
          {fixture.answerConclusionPrefix}<em>{fixture.answerEmphasis}</em>
          <button
            className="answer-stage__citation"
            type="button"
            aria-label={`${fixture.evidence[0]?.label ?? '첫 번째'} 근거 보기`}
            onClick={(event) => onOpenEvidence(0, event.currentTarget)}
          ><span aria-hidden="true">1</span></button>{fixture.answerConclusionSuffix}
        </p>
      </div>
      <div className="answer-stage__meta">
        <p>공개된 글의 근거 {fixture.evidence.length}개를 연결한 답</p>
        <button
          className="answer-stage__evidence"
          type="button"
          aria-expanded={evidenceOpen}
          onClick={(event) => onOpenEvidence(0, event.currentTarget)}
        >근거 {fixture.evidence.length}개 보기</button>
      </div>
      <QuestionComposer
        id="second-brain-follow-up"
        label="이 생각에 이어 묻기"
        placeholder="다음 질문을 입력하세요"
        value={followUp}
        onChange={setFollowUp}
        onSubmit={onSubmit}
      />
    </div>
  );
}

function EvidencePanel({ closeRef, fixture, onClose, onSelect, panelRef, selectedIndex }: {
  closeRef: RefObject<HTMLButtonElement | null>;
  fixture: PublicAnswerFixture;
  onClose: () => void;
  onSelect: (index: number) => void;
  panelRef: RefObject<HTMLElement | null>;
  selectedIndex: number;
}) {
  const selected = fixture.evidence[selectedIndex] ?? fixture.evidence[0];
  if (!selected) return null;
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="evidence-modal-layer">
      <button className="evidence-backdrop" type="button" tabIndex={-1} aria-hidden="true" onClick={onClose} />
      <aside ref={panelRef} className="evidence-panel" role="dialog" aria-modal="true" aria-labelledby="evidence-panel-title">
        <header className="evidence-panel__head">
          <div>
            <p>MEMORY LENS · {String(fixture.evidence.length).padStart(2, '0')} PASSAGES</p>
            <h2 id="evidence-panel-title">이 답의 기억</h2>
          </div>
          <button ref={closeRef} className="evidence-panel__close" type="button" aria-label="근거 패널 닫기" onClick={onClose} />
        </header>
        <div className="evidence-panel__body">
          <div className="evidence-panel__sources" aria-label="답변에 사용한 근거">
            {fixture.evidence.map((item, index) => (
              <button key={item.id} type="button" aria-pressed={selectedIndex === index} onClick={() => onSelect(index)}>
                <span>{String(index + 1).padStart(2, '0')}</span><strong>{item.label}</strong>
              </button>
            ))}
          </div>
          <article className="evidence-panel__preview">
            <p className="evidence-panel__meta">{selected.collectionLabel} · {selected.dateLabel} · {selected.locatorLabel}</p>
            <blockquote>“{selected.excerpt}”</blockquote>
            <p className="evidence-panel__context">{selected.context}</p>
            <div className="evidence-panel__location">
              <span>{selected.recordTitle}</span><a href={selected.canonicalPath}>원문 보기 ↗</a>
            </div>
          </article>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function progressStatus(view: string, query: string, resultCount: number): string {
  if (view === 'retrieving') return '관련 기록을 찾고 있습니다.';
  if (view === 'connecting') return '생각 사이를 잇고 있습니다.';
  if (view === 'composing') return '답을 쓰고 있습니다.';
  if (view === 'answered' || view === 'evidence-open') return '공개된 기록을 바탕으로 답했습니다.';
  if (view === 'search-results') {
    return resultCount > 0
      ? `“${query}”에 이어지는 공개 기록 ${resultCount}건을 찾았습니다.`
      : `“${query}”에 이어지는 공개 기록을 찾지 못했습니다.`;
  }
  return '질문을 기다리고 있습니다.';
}

export function SecondBrainExperience({ fixture, initialQuery, inventory }: {
  fixture: PublicAnswerFixture;
  initialQuery: string;
  inventory: readonly SearchInventoryItem[];
}) {
  const [state, dispatch] = useReducer(askExperienceReducer, initialQuery, initialAskState);
  const [inputValue, setInputValue] = useState(initialQuery || fixture.question);
  const [composerNote, setComposerNote] = useState('질문을 기다리고 있습니다.');
  const timersRef = useRef<number[]>([]);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const shouldReturnFocusRef = useRef(false);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const updateUrl = useCallback((query: string) => {
    const url = query ? `/search/?q=${encodeURIComponent(query)}` : '/search/';
    window.history.pushState({}, '', url);
  }, []);

  const startAnswer = useCallback((query: string) => {
    clearTimers();
    dispatch({ type: 'submit-answer', query });
    updateUrl(query);
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      dispatch({ type: 'complete' });
      return;
    }
    timersRef.current = [
      window.setTimeout(() => dispatch({ type: 'advance', view: 'connecting' }), 520),
      window.setTimeout(() => dispatch({ type: 'advance', view: 'composing' }), 1050),
      window.setTimeout(() => dispatch({ type: 'complete' }), 1900),
    ];
  }, [clearTimers, updateUrl]);

  const submitQuestion = useCallback((queryValue: string) => {
    const resolution = resolveAskSubmission(queryValue, fixture.question);
    if (resolution.kind === 'empty') {
      setComposerNote('질문을 입력해 주세요.');
      return;
    }
    setInputValue(resolution.query);
    setComposerNote('질문을 기다리고 있습니다.');
    if (resolution.kind === 'answer') {
      startAnswer(resolution.query);
    } else {
      clearTimers();
      dispatch({ type: 'show-results', query: resolution.query });
      updateUrl(resolution.query);
    }
  }, [clearTimers, fixture.question, startAnswer, updateUrl]);

  const restoreQueryFromLocation = useCallback(() => {
    clearTimers();
    const query = boundedSearchQuery(new URLSearchParams(window.location.search).get('q') ?? '');
    setInputValue(query || fixture.question);
    setComposerNote('질문을 기다리고 있습니다.');
    dispatch(query ? { type: 'show-results', query } : { type: 'reset' });
  }, [clearTimers, fixture.question]);

  useEffect(() => {
    restoreQueryFromLocation();
    window.addEventListener('popstate', restoreQueryFromLocation);
    return () => window.removeEventListener('popstate', restoreQueryFromLocation);
  }, [restoreQueryFromLocation]);

  const closeEvidence = useCallback(() => {
    shouldReturnFocusRef.current = true;
    dispatch({ type: 'close-evidence' });
  }, []);

  useEffect(() => {
    if (state.view !== 'evidence-open') {
      if (shouldReturnFocusRef.current) {
        shouldReturnFocusRef.current = false;
        const frame = window.requestAnimationFrame(() => returnFocusRef.current?.focus({ preventScroll: true }));
        return () => window.cancelAnimationFrame(frame);
      }
      return;
    }
    const shell = backgroundRef.current?.closest<HTMLElement>('.site-shell') ?? null;
    const panel = panelRef.current;
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
        closeEvidence();
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
    };
  }, [closeEvidence, state.view]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    submitQuestion(String(form.get('q') ?? ''));
  };
  const openEvidence = (index: number, trigger: HTMLElement) => {
    returnFocusRef.current = trigger;
    dispatch({ type: 'open-evidence', index, evidenceCount: fixture.evidence.length });
  };
  const progressView = state.view === 'retrieving' || state.view === 'connecting' || state.view === 'composing'
    ? state.view : null;
  const answerVisible = state.view === 'answered' || state.view === 'evidence-open';
  const resultCount = state.view === 'search-results' ? searchMatches(inventory, state.query).length : 0;

  return (
    <section className="second-brain-search" data-view={state.view} aria-label="공개 기록에 묻기">
      <div className="second-brain-search__background" ref={backgroundRef}>
        <div className="second-brain-search__stage">
          <AgentStage fixture={fixture} />
          <section className="second-brain-dialogue" aria-label="공개 기록과 대화">
            <div className="second-brain-dialogue__inner">
              {progressView ? <RetrievalSequence view={progressView} /> : null}
              {answerVisible ? (
                <AnswerStage
                  evidenceOpen={state.view === 'evidence-open'}
                  fixture={fixture}
                  question={state.query}
                  onOpenEvidence={openEvidence}
                  onSubmit={onSubmit}
                />
              ) : (
                <div className="second-brain-intro">
                  <h1>제 기록에<br />무엇을 묻고 싶나요?</h1>
                  <QuestionComposer
                    id="second-brain-question"
                    label="기록에 묻기"
                    note={composerNote}
                    placeholder="질문을 입력하세요"
                    value={inputValue}
                    onChange={setInputValue}
                    onFocus={() => setComposerNote('편하게 물어보세요.')}
                    onBlur={() => setComposerNote('질문을 기다리고 있습니다.')}
                    onSubmit={onSubmit}
                  />
                </div>
              )}
            </div>
            <p className="visually-hidden" role="status" aria-live="polite">
              {progressStatus(state.view, state.query, resultCount)}
            </p>
          </section>
        </div>
        {state.view === 'search-results' ? (
          <div className="second-brain-search__results"><SearchResults inventory={inventory} query={state.query} /></div>
        ) : null}
      </div>
      {state.view === 'evidence-open' ? (
        <EvidencePanel
          fixture={fixture}
          selectedIndex={state.selectedEvidenceIndex}
          onSelect={(index) => dispatch({ type: 'select-evidence', index, evidenceCount: fixture.evidence.length })}
          onClose={closeEvidence}
          closeRef={closeRef}
          panelRef={panelRef}
        />
      ) : null}
    </section>
  );
}
