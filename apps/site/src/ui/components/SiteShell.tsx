import type { ReactNode } from 'react';
import { SiteHeader } from './SiteHeader';
import type { PublicSection } from './MobileNavigation';
import '../styles/editorial.css';

export function SiteShell({
  children,
  currentSection,
  inverseHeader = false,
}: {
  children: ReactNode;
  currentSection: PublicSection;
  inverseHeader?: boolean;
}) {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <SiteHeader currentSection={currentSection} inverse={inverseHeader} />
      <main className="site-main" id="main-content" tabIndex={-1} data-mobile-menu-inert>{children}</main>
    </div>
  );
}
