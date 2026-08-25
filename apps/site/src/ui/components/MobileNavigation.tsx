import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';

export type PublicSection = 'scene' | 'articles' | 'reviews' | 'search' | null;

export const PUBLIC_NAVIGATION = [
  { href: '/', label: '장면', section: 'scene' },
  { href: '/articles/', label: '글', section: 'articles' },
  { href: '/reviews/', label: '책', section: 'reviews' },
  { href: '/search/', label: '찾기', section: 'search' },
] as const;

export function MobileNavigation({ currentSection }: { currentSection: PublicSection }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  const closeAndRestoreFocus = useCallback(() => {
    restoreFocusRef.current = true;
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      const frame = window.requestAnimationFrame(() => buttonRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAndRestoreFocus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        closeAndRestoreFocus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [closeAndRestoreFocus, open]);

  const onSelection = (event: MouseEvent<HTMLAnchorElement>, section: Exclude<PublicSection, null>) => {
    const currentRouteSelection = section === currentSection
      && event.button === 0
      && !event.altKey
      && !event.ctrlKey
      && !event.metaKey
      && !event.shiftKey;
    if (currentRouteSelection) event.preventDefault();
    closeAndRestoreFocus();
  };

  return (
    <div className="mobile-navigation" data-open={open ? 'true' : 'false'} ref={rootRef}>
      <button
        ref={buttonRef}
        className="mobile-navigation__button touch-target"
        type="button"
        aria-label="메뉴"
        aria-controls="site-primary-navigation"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true"><i /><i /></span>
      </button>
      <nav id="site-primary-navigation" className="primary-navigation" aria-label="주 탐색">
        {PUBLIC_NAVIGATION.map((item) => (
          <a
            key={item.href}
            href={item.href}
            aria-current={currentSection === item.section ? 'page' : undefined}
            onClick={(event) => onSelection(event, item.section)}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
