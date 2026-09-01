import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { ORIGIN_QUERY_MAX_LENGTH } from '../navigation/origin';
import type { AnswerViewModel } from './answerViewModel';
import { EvidencePanel } from './EvidencePanel';
import { LivingEvidenceDesk, type LivingEvidenceDeskProps } from './LivingEvidenceDesk';
import { createPublicAskCoordinator } from './publicAskCoordinator';
import { SearchResults } from './SearchResults';
import {
  askExperienceReducer,
  initialAskState,
  LOCAL_PROVIDER_DISCLOSURE,
  SAMPLE_QUESTION,
} from './secondBrain';
import type { PublicAskProvider } from './publicAskTransport';
import { boundedSearchQuery, searchMatches, type SearchInventoryItem } from './searchModel';
import { usePointerParallax } from './usePointerParallax';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const SEARCH_RETURN_POSITION_KEY = 'bwSearchReturnPosition';
const SEARCH_RETURN_POSITION_MAX_AGE_MS = 600_000;

interface SearchReturnPosition {
  anchorId: string;
  anchorTop: number;
  issuedAt: number;
  location: string;
  query: string;
  scrollY: number;
}

function objectState(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value } : {};
}

function relativeLocation(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function liveSearchContinuationLocation(query: string): string | null {
  if (window.location.pathname !== '/search/') return null;
  const liveQueries = new URLSearchParams(window.location.search).getAll('q');
  if (liveQueries.length !== 1 || boundedSearchQuery(liveQueries[0] ?? '') !== query) return null;
  return relativeLocation();
}

function documentScrollHeight(): number {
  return Math.max(
    window.innerHeight,
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0,
  );
}

function boundedReturnCoordinates(anchorTop: number, scrollY: number): boolean {
  if (!Number.isFinite(anchorTop) || !Number.isFinite(scrollY)) return false;
  const height = documentScrollHeight();
  const maxScrollY = Math.max(0, height - window.innerHeight);
  return scrollY >= 0
    && scrollY <= maxScrollY + 1
    && anchorTop >= -window.innerHeight
    && anchorTop <= window.innerHeight;
}

function takeSearchReturnPosition(query: string): SearchReturnPosition | null {
  const state = objectState(window.history.state);
  if (!(SEARCH_RETURN_POSITION_KEY in state)) return null;
  const candidate = state[SEARCH_RETURN_POSITION_KEY];
  delete state[SEARCH_RETURN_POSITION_KEY];
  try { window.history.replaceState(state, ''); } catch { return null; }
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return null;
  const value = candidate as Record<string, unknown>;
  const issuedAt = value.issuedAt;
  const age = typeof issuedAt === 'number' ? Date.now() - issuedAt : Number.NaN;
  if (
    typeof value.anchorId !== 'string'
    || typeof value.anchorTop !== 'number'
    || typeof issuedAt !== 'number'
    || !Number.isSafeInteger(issuedAt)
    || age < 0
    || age > SEARCH_RETURN_POSITION_MAX_AGE_MS
    || value.location !== relativeLocation()
    || value.query !== query
    || typeof value.scrollY !== 'number'
    || !boundedReturnCoordinates(value.anchorTop, value.scrollY)
  ) return null;
  return value as unknown as SearchReturnPosition;
}

function ArrowIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 16h23M19 8l8 8-8 8" /></svg>;
}

function AgentStage({ answer, interactive, onOpenEvidence, phase }: LivingEvidenceDeskProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const stageRef = useRef<HTMLElement>(null);
  const portraitRef = useRef<HTMLImageElement>(null);
  usePointerParallax(stageRef);
  useEffect(() => {
    if (portraitRef.current?.complete && portraitRef.current.naturalWidth === 0) setImageFailed(true);
  }, []);
  return (
    <section
      ref={stageRef}
      className="agent-stage"
      aria-label="FORM & THOUGHT의 공개 기록"
      data-image-state={imageFailed ? 'error' : 'ready'}
    >
      <div className="agent-stage__field" aria-hidden="true" />
      <div className="agent-stage__plane agent-stage__plane--one" aria-hidden="true" />
      <div className="agent-stage__plane agent-stage__plane--two" aria-hidden="true" />
      <div className="agent-stage__plane agent-stage__plane--three" aria-hidden="true" />
      <div
        className="agent-stage__portrait-frame"
        role="img"
        aria-label="종이 조각이 접힌 FORM & THOUGHT 기록 안내자"
      >
        <img
          ref={portraitRef}
          className="agent-stage__portrait"
          src="/images/form-and-thought-agent-avatar-v1.png"
          width="1254"
          height="1254"
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
          fetchPriority="high"
          onError={() => setImageFailed(true)}
        />
        <span className="agent-stage__portrait-fallback" aria-hidden="true">FORM &amp; THOUGHT</span>
        <div className="agent-stage__portrait-slice" aria-hidden="true" />
      </div>
      <LivingEvidenceDesk
        phase={phase}
        answer={answer}
        interactive={interactive}
        onOpenEvidence={onOpenEvidence}
      />
    </section>
  );
}

function QuestionComposer({
  id, label, localProviderDisclosure = false, note, onBlur, onChange, onFocus, onSubmit, placeholder, value,
}: {
  id: string;
  label: string;
  localProviderDisclosure?: boolean;
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
      <p className="question-composer__privacy-summary">
        공개 승인 기록만 사용 · 이 사이트는 질문을 저장하지 않음
      </p>
      {localProviderDisclosure ? (
        <p className="question-composer__local-disclosure">{LOCAL_PROVIDER_DISCLOSURE}</p>
      ) : null}
      {note ? <p className="question-composer__note">{note}</p> : null}
      <details className="question-composer__privacy">
        <summary className="touch-target">질문과 근거는 어떻게 처리되나요?</summary>
        <p>
          현재 질문과 선택된 공개 기록 발췌는 이 답을 만들기 위해 설정된 AI 제공자에게 전달됩니다.
          원문 질문의 서버 보관 기간은 0일이며, 공개 승인된 근거만 사용합니다.
        </p>
      </details>
    </form>
  );
}

function RetrievalSequence({ localProviderDisclosure, onChange, onSubmit, value, view }: {
  localProviderDisclosure: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  value: string;
  view: 'retrieving' | 'connecting' | 'composing';
}) {
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
      <QuestionComposer
        id="second-brain-replacement"
        label="다른 질문으로 바꾸기"
        localProviderDisclosure={localProviderDisclosure}
        placeholder="새 질문을 입력하세요"
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
      />
    </div>
  );
}

function AnswerStage({ answer, evidenceOpen, localProviderDisclosure, onOpenEvidence, onSubmit, question }: {
  answer: AnswerViewModel;
  evidenceOpen: boolean;
  localProviderDisclosure: boolean;
  onOpenEvidence: (evidenceId: string, trigger: HTMLElement) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  question: string;
}) {
  const [followUp, setFollowUp] = useState('');
  return (
    <div className="answer-stage">
      <p className="answer-stage__asked">당신이 물었습니다<strong>{question}</strong></p>
      <div className="answer-stage__lines">
        {answer.claims.map((claim) => (
          <p key={claim.id}>{claim.text}{claim.evidenceIds.map((evidenceId) => {
            const evidence = answer.evidenceById.get(evidenceId);
            if (!evidence) throw new Error('claim evidence must resolve');
            const evidenceNumber = answer.evidence.findIndex((item) => item.evidenceId === evidenceId) + 1;
            return <button
              key={evidenceId}
              className="answer-stage__citation"
              type="button"
              aria-label={`${evidence.recordTitle} · ${evidence.locator.label} 근거 보기`}
              onClick={(event) => onOpenEvidence(evidenceId, event.currentTarget)}
            ><span aria-hidden="true">{evidenceNumber}</span></button>;
          })}</p>
        ))}
      </div>
      <div className="answer-stage__meta">
        <p>공개된 글의 근거 {answer.evidence.length}개를 연결한 답</p>
        <button
          className="answer-stage__evidence"
          type="button"
          aria-expanded={evidenceOpen}
          onClick={(event) => {
            const firstEvidenceId = answer.claims[0]?.evidenceIds[0];
            if (!firstEvidenceId) throw new Error('answer evidence must resolve');
            onOpenEvidence(firstEvidenceId, event.currentTarget);
          }}
        >이 답의 근거 {answer.evidence.length}개 보기</button>
      </div>
      <QuestionComposer
        id="second-brain-follow-up"
        label="이 생각에 이어 묻기"
        localProviderDisclosure={localProviderDisclosure}
        placeholder="다음 질문을 입력하세요"
        value={followUp}
        onChange={setFollowUp}
        onSubmit={onSubmit}
      />
    </div>
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

export function SecondBrainExperience({
  initialQuery,
  inventory,
  localProviderDisclosure = false,
  provider,
}: {
  initialQuery: string;
  inventory: readonly SearchInventoryItem[];
  localProviderDisclosure?: boolean;
  provider: PublicAskProvider;
}) {
  const [state, dispatch] = useReducer(askExperienceReducer, initialQuery, initialAskState);
  const [inputValue, setInputValue] = useState(initialQuery || SAMPLE_QUESTION);
  const [composerNote, setComposerNote] = useState('질문을 기다리고 있습니다.');
  const coordinator = useMemo(() => createPublicAskCoordinator(provider), [provider]);
  const choreographyTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const clearChoreographyTimers = useCallback(() => {
    for (const timer of choreographyTimersRef.current) clearTimeout(timer);
    choreographyTimersRef.current = [];
  }, []);

  const startChoreography = useCallback(() => {
    clearChoreographyTimers();
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      dispatch({ type: 'visual-complete' });
      return;
    }
    choreographyTimersRef.current = [
      setTimeout(() => dispatch({ type: 'advance', phase: 'connecting' }), 450),
      setTimeout(() => dispatch({ type: 'advance', phase: 'composing' }), 900),
      setTimeout(() => dispatch({ type: 'visual-complete' }), 1_350),
    ];
  }, [clearChoreographyTimers]);

  const submitQuestion = useCallback(async (queryValue: string) => {
    const query = boundedSearchQuery(queryValue);
    if (!query) {
      setComposerNote('질문을 입력해 주세요.');
      return;
    }
    setInputValue(query);
    setComposerNote('질문을 기다리고 있습니다.');
    dispatch({ type: 'submit-answer', query });
    startChoreography();
    const result = await coordinator.submit(query);
    dispatch({ type: 'network-settled', result });
  }, [coordinator, startChoreography]);

  const restoreQueryFromLocation = useCallback(() => {
    coordinator.cancel();
    clearChoreographyTimers();
    const query = boundedSearchQuery(new URLSearchParams(window.location.search).get('q') ?? '');
    setInputValue(query || SAMPLE_QUESTION);
    setComposerNote('질문을 기다리고 있습니다.');
    dispatch(query ? { type: 'restore-search', query } : { type: 'reset' });
  }, [clearChoreographyTimers, coordinator]);

  useEffect(() => {
    restoreQueryFromLocation();
    window.addEventListener('popstate', restoreQueryFromLocation);
    window.addEventListener('pageshow', restoreQueryFromLocation);
    return () => {
      window.removeEventListener('popstate', restoreQueryFromLocation);
      window.removeEventListener('pageshow', restoreQueryFromLocation);
      clearChoreographyTimers();
      coordinator.dispose();
    };
  }, [clearChoreographyTimers, coordinator, restoreQueryFromLocation]);

  useLayoutEffect(() => {
    if (state.view !== 'search-results' || state.originPolicy !== 'search-continuation') return;
    const position = takeSearchReturnPosition(state.query);
    if (position === null) return;
    const matchingItem = searchMatches(inventory, state.query)
      .find(({ item }) => item.anchorId === position.anchorId)?.item;
    if (matchingItem === undefined) return;
    const anchor = document.getElementById(position.anchorId);
    if (anchor === null || !anchor.matches('.search-result-list > li')) return;
    const restore = () => {
      window.scrollTo(0, position.scrollY);
      const topDelta = anchor.getBoundingClientRect().top - position.anchorTop;
      if (Math.abs(topDelta) > 0.5) window.scrollTo(0, window.scrollY + topDelta);
    };
    restore();
    const frame = window.requestAnimationFrame(restore);
    return () => window.cancelAnimationFrame(frame);
  }, [inventory, state]);

  const rememberSearchReturnPosition = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (
      state.view !== 'search-results'
      || state.originPolicy !== 'search-continuation'
      || event.button !== 0
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
    ) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('.search-result-list a[href]') : null;
    const item = target?.closest<HTMLElement>('li[id]') ?? null;
    if (target === null || item === null || !event.currentTarget.contains(target)) return;
    const matchingItem = searchMatches(inventory, state.query)
      .find(({ item: inventoryItem }) => inventoryItem.anchorId === item.id)?.item;
    const location = liveSearchContinuationLocation(state.query);
    const anchorTop = item.getBoundingClientRect().top;
    const scrollY = window.scrollY;
    if (matchingItem === undefined || location === null || !boundedReturnCoordinates(anchorTop, scrollY)) return;
    const position: SearchReturnPosition = {
      anchorId: item.id,
      anchorTop,
      issuedAt: Date.now(),
      location,
      query: state.query,
      scrollY,
    };
    const historyState = objectState(window.history.state);
    historyState[SEARCH_RETURN_POSITION_KEY] = position;
    try { window.history.replaceState(historyState, ''); } catch { /* Native navigation remains available. */ }
  }, [inventory, state]);

  const closeEvidence = useCallback(() => {
    dispatch({ type: 'close-evidence' });
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submitQuestion(String(form.get('q') ?? ''));
  };
  const openEvidence = (evidenceId: string, trigger: HTMLElement) => {
    if (state.view !== 'answered' && state.view !== 'evidence-open') return;
    if (!state.answer.evidenceById.has(evidenceId)) return;
    returnFocusRef.current = trigger;
    dispatch({ type: 'open-evidence', evidenceId });
  };
  const progressView = state.view === 'pending' ? state.phase : null;
  const resultCount = state.view === 'search-results' ? searchMatches(inventory, state.query).length : 0;
  const deskPhase = progressView
    ?? (state.view === 'answered' || state.view === 'evidence-open' ? 'answered' : 'idle');
  const deskAnswer = state.view === 'pending' || state.view === 'answered' || state.view === 'evidence-open'
    ? state.answer
    : null;

  return (
    <section
      className="second-brain-search"
      data-view={state.view}
      aria-label="공개 기록에 묻기"
      onClickCapture={rememberSearchReturnPosition}
    >
      <div className="second-brain-search__background">
        <div className="second-brain-search__stage">
          <AgentStage
            phase={deskPhase}
            answer={deskAnswer}
            interactive={state.view === 'answered'}
            onOpenEvidence={openEvidence}
          />
          <section className="second-brain-dialogue" aria-label="공개 기록과 대화">
            <div className="second-brain-dialogue__inner">
              {progressView ? (
                <RetrievalSequence
                  view={progressView}
                  value={inputValue}
                  localProviderDisclosure={localProviderDisclosure}
                  onChange={setInputValue}
                  onSubmit={onSubmit}
                />
              ) : null}
              {state.view === 'answered' || state.view === 'evidence-open' ? (
                <AnswerStage
                  answer={state.answer}
                  evidenceOpen={state.view === 'evidence-open'}
                  localProviderDisclosure={localProviderDisclosure}
                  question={state.query}
                  onOpenEvidence={openEvidence}
                  onSubmit={onSubmit}
                />
              ) : null}
              {state.view === 'idle' || state.view === 'search-results' ? (
                <div className="second-brain-intro">
                  <h1>공개 기록에 무엇을 묻고 싶나요?</h1>
                  <QuestionComposer
                    id="second-brain-question"
                    label="기록에 묻기"
                    localProviderDisclosure={localProviderDisclosure}
                    note={composerNote}
                    placeholder="질문을 입력하세요"
                    value={inputValue}
                    onChange={setInputValue}
                    onFocus={() => setComposerNote('편하게 물어보세요.')}
                    onBlur={() => setComposerNote('질문을 기다리고 있습니다.')}
                    onSubmit={onSubmit}
                  />
                </div>
              ) : null}
            </div>
            <p className="visually-hidden" role="status" aria-live="polite">
              {progressStatus(progressView ?? state.view, state.query, resultCount)}
            </p>
          </section>
        </div>
        {state.view === 'search-results' ? (
          <div className="second-brain-search__results">
            {state.notice ? <p className="second-brain-search__notice" role="status">{state.notice}</p> : null}
            <SearchResults
              inventory={inventory}
              originPolicy={state.originPolicy}
              query={state.query}
            />
          </div>
        ) : null}
      </div>
      {state.view === 'evidence-open' ? (
        <EvidencePanel
          answer={state.answer}
          selectedEvidenceId={state.selectedEvidenceId}
          returnFocusRef={returnFocusRef}
          onSelect={(evidenceId) => dispatch({ type: 'select-evidence', evidenceId })}
          onClose={closeEvidence}
        />
      ) : null}
    </section>
  );
}
