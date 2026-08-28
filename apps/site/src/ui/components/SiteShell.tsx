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
      <SiteHeader currentSection={currentSection} inverse={inverseHeader} />
      <main className="site-main" data-mobile-menu-inert>{children}</main>
    </div>
  );
}
