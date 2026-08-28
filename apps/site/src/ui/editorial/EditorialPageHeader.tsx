import type { ReactNode } from 'react';

export function EditorialPageHeader({
  children,
  description,
  title,
}: {
  children?: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <header className="editorial-page-header">
      <div className="editorial-page-header__heading">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="editorial-page-header__controls">{children}</div> : null}
    </header>
  );
}
