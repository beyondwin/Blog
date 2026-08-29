import { MobileNavigation, type PublicSection } from './MobileNavigation';

export function SiteHeader({
  currentSection,
  evidenceModalInert = false,
  inverse = false,
}: {
  currentSection: PublicSection;
  evidenceModalInert?: boolean;
  inverse?: boolean;
}) {
  return (
    <header
      className={`site-header${inverse ? ' site-header--inverse' : ''}`}
      aria-label="사이트 머리말"
      data-evidence-modal-inert={evidenceModalInert || undefined}
    >
      <div className="site-shell-width site-header__inner">
        <a
          className="site-brand touch-target"
          href="/"
          aria-label="FORM & THOUGHT 홈"
          data-mobile-menu-inert
        >
          <span>FORM &amp;</span><span>THOUGHT</span>
        </a>
        <MobileNavigation currentSection={currentSection} />
      </div>
    </header>
  );
}
