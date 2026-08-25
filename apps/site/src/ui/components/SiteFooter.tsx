import { PUBLIC_NAVIGATION, type PublicSection } from './MobileNavigation';

export function SiteFooter({ currentSection }: { currentSection: PublicSection }) {
  return (
    <footer className="site-footer site-shell-width" aria-label="사이트 바닥글">
      <span>© beyondwin</span>
      <nav aria-label="하단 탐색">
        {PUBLIC_NAVIGATION.map((item) => (
          <a
            key={item.href}
            href={item.href}
            aria-current={currentSection === item.section ? 'page' : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}
