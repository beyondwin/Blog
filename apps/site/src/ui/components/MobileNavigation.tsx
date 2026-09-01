import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';

export type PublicSection = 'reviews' | 'articles' | 'thoughts' | 'search' | null;

export const PUBLIC_NAVIGATION = [
  { href: '/reviews/', label: '서평', section: 'reviews' },
  { href: '/articles/', label: '아티클', section: 'articles' },
  { href: '/thoughts/', label: '생각', section: 'thoughts' },
  { href: '/search/', label: '검색', section: 'search' },
] as const;

const MOBILE_QUERY = '(max-width: 767px)';
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function NavigationLinks({
  currentSection,
  onSelection,
  showCurrent = false,
}: {
  currentSection: PublicSection;
  onSelection?: (event: MouseEvent<HTMLAnchorElement>) => void;
  showCurrent?: boolean;
}) {
  return PUBLIC_NAVIGATION.map((item) => (
    <a
      key={item.href}
      href={item.href}
      aria-current={showCurrent && currentSection === item.section ? 'page' : undefined}
      onClick={onSelection}
    >
      {item.label}
    </a>
  ));
}

export function MobileNavigation({ currentSection }: { currentSection: PublicSection }) {
  const [enhanced, setEnhanced] = useState(false);
  const [open, setOpen] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const releaseOpenStateRef = useRef<(() => void) | null>(null);
  const restoreFocusRef = useRef(false);

  const closeAndRestoreFocus = useCallback(() => {
    restoreFocusRef.current = true;
    releaseOpenStateRef.current?.();
    setOpen(false);
  }, []);

  useEffect(() => {
    setEnhanced(true);
    const media = window.matchMedia(MOBILE_QUERY);
    const updateViewport = () => setMobileViewport(media.matches);
    updateViewport();
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
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

    const menu = menuRef.current;
    const inertTargets = mobileViewport
      ? Array.from(document.querySelectorAll<HTMLElement>('[data-mobile-menu-inert]'))
      : [];
    const inertState = inertTargets.map((target) => target.hasAttribute('inert'));
    const previousOverflow = document.documentElement.style.overflow;
    let focusFrame: number | undefined;

    if (mobileViewport) {
      inertTargets.forEach((target) => target.setAttribute('inert', ''));
      document.documentElement.style.overflow = 'hidden';
      focusFrame = window.requestAnimationFrame(() => menu?.focus());
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAndRestoreFocus();
        return;
      }
      if (!mobileViewport || event.key !== 'Tab' || !menu) return;

      const focusable = Array.from(menu.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        menu.focus();
        return;
      }

      if (event.shiftKey && (document.activeElement === first || document.activeElement === menu)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === menu)) {
        event.preventDefault();
        first.focus();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!menu?.contains(event.target) && !buttonRef.current?.contains(event.target)) {
        closeAndRestoreFocus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    let released = false;
    const releaseOpenState = () => {
      if (released) return;
      released = true;
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      inertTargets.forEach((target, index) => {
        if (!inertState[index]) target.removeAttribute('inert');
      });
      if (focusFrame !== undefined) window.cancelAnimationFrame(focusFrame);
      if (mobileViewport) document.documentElement.style.overflow = previousOverflow;
      if (releaseOpenStateRef.current === releaseOpenState) releaseOpenStateRef.current = null;
    };
    releaseOpenStateRef.current = releaseOpenState;
    return releaseOpenState;
  }, [closeAndRestoreFocus, mobileViewport, open]);

  const onSelection = () => closeAndRestoreFocus();

  return (
    <div className="mobile-navigation" data-open={open ? 'true' : 'false'}>
      <nav className="primary-navigation" aria-label="주 탐색" data-mobile-menu-inert>
        <NavigationLinks currentSection={currentSection} showCurrent />
      </nav>
      <button
        ref={buttonRef}
        className="mobile-navigation__button touch-target"
        type="button"
        aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
        aria-controls="site-navigation-menu"
        aria-expanded={open}
        aria-haspopup={mobileViewport ? 'dialog' : undefined}
        hidden={!enhanced}
        onClick={() => {
          if (open) closeAndRestoreFocus();
          else setOpen(true);
        }}
      >
        <span aria-hidden="true"><i /><i /><i /></span>
      </button>
      <div className="navigation-backdrop" aria-hidden="true" />
      <div
        id="site-navigation-menu"
        className="navigation-menu"
        ref={menuRef}
        role={mobileViewport ? 'dialog' : undefined}
        aria-modal={mobileViewport ? 'true' : undefined}
        aria-label={mobileViewport ? '주 탐색 메뉴' : undefined}
        tabIndex={-1}
        hidden={!open}
      >
        <nav aria-label="메뉴 탐색">
          <NavigationLinks currentSection={currentSection} onSelection={onSelection} showCurrent />
        </nav>
      </div>
      <noscript>
        <nav className="navigation-noscript" aria-label="모바일 주 탐색">
          <NavigationLinks currentSection={currentSection} showCurrent />
        </nav>
      </noscript>
    </div>
  );
}
