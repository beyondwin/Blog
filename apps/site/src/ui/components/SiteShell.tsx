import type { ReactNode } from 'react';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import type { PublicSection } from './MobileNavigation';

export type SiteMode = 'scene' | 'reading';

export function SiteShell({
  children,
  currentSection,
  mode,
}: {
  children: ReactNode;
  currentSection: PublicSection;
  mode: SiteMode;
}) {
  return (
    <div className="site-shell" data-surface-mode={mode}>
      <SiteHeader currentSection={currentSection} />
      <main className="site-main">{children}</main>
      <SiteFooter currentSection={currentSection} />
    </div>
  );
}
