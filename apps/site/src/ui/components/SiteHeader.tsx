import { MobileNavigation, type PublicSection } from './MobileNavigation';

export function SiteHeader({ currentSection }: { currentSection: PublicSection }) {
  return (
    <header className="site-header" aria-label="사이트 머리말">
      <div className="site-shell-width site-header__inner">
        <a className="site-brand touch-target" href="/" aria-label="beyondwin 홈">beyondwin</a>
        <MobileNavigation currentSection={currentSection} />
      </div>
    </header>
  );
}
