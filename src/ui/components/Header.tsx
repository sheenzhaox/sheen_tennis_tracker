import type { ReactNode } from 'react';

interface Props {
  title: string;
  back?: string;
  action?: ReactNode;
}

export default function Header({ title, back, action }: Props) {
  return (
    <header className="header">
      {back !== undefined ? (
        <a className="header-back" href={`#${back}`} aria-label="Back">
          ‹
        </a>
      ) : (
        <span className="header-back" />
      )}
      <h1>{title}</h1>
      <span className="header-action">{action}</span>
    </header>
  );
}
