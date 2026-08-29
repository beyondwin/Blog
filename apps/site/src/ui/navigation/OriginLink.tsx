import { createElement, useEffect, useRef, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { consumeReadingOriginFocus, enhanceOriginClick, type OriginClickBrowser } from './transport';

export interface OriginLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  origin: unknown;
  browser?: OriginClickBrowser;
}

function assertCleanInternalHref(href: string): void {
  if (!href.startsWith('/') || href.startsWith('//') || href.includes('\\')) {
    throw new Error('OriginLink requires a root-relative internal href');
  }
  const url = new URL(href, 'https://beyondwin.invalid');
  if ([...url.searchParams.keys()].some((key) => key.startsWith('__bw_'))) {
    throw new Error('OriginLink href must not contain origin transport parameters');
  }
}

function liveBrowser(): OriginClickBrowser | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return {
      location: {
        href: window.location.href,
        assign: (url) => window.location.assign(url),
      },
      sessionStorage: window.sessionStorage,
      crypto: {
        getRandomValues: (bytes) => { window.crypto.getRandomValues(bytes); },
      },
      now: () => Date.now(),
    };
  } catch {
    return undefined;
  }
}

export function OriginLink({
  browser,
  href,
  onClick,
  origin,
  ...anchorProps
}: OriginLinkProps) {
  assertCleanInternalHref(href);
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const restoreFocus = () => {
      const link = linkRef.current;
      if (link === null) return;
      try {
        consumeReadingOriginFocus(origin, {
          sessionStorage: window.sessionStorage,
          now: () => Date.now(),
        }, () => {
          try { link.focus({ preventScroll: true }); } catch { link.focus(); }
        });
      } catch {
        // Browsers may deny session storage; the canonical link remains usable.
      }
    };
    restoreFocus();
    window.addEventListener('pageshow', restoreFocus);
    return () => { window.removeEventListener('pageshow', restoreFocus); };
  }, [origin]);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    const activeBrowser = browser ?? liveBrowser();
    if (activeBrowser !== undefined) enhanceOriginClick(event, origin, activeBrowser);
  };

  return createElement('a', { ...anchorProps, href, onClick: handleClick, ref: linkRef });
}
