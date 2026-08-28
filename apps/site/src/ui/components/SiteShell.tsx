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
  currentSection: PublicSection | 'scene';
  inverseHeader?: boolean;
  [legacyProp: string]: unknown;
}) {
  const legacyHome = currentSection === 'scene';
  return (
    <div className="site-shell">
      <SiteHeader
        currentSection={legacyHome ? null : currentSection}
        inverse={inverseHeader || legacyHome}
      />
      <main className="site-main" data-mobile-menu-inert>{children}</main>
    </div>
  );
}
