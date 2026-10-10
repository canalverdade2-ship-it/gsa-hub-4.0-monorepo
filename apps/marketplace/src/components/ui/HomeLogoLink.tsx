import type { ReactNode } from 'react';
import { navigate } from '../../routing/navigationService';

interface HomeLogoLinkProps {
  children: ReactNode;
  className?: string;
}

export function HomeLogoLink({ children, className = '' }: HomeLogoLinkProps) {
  return (
    <a
      href="/"
      aria-label="Ir para a página inicial da GSA HUB"
      onClick={(event) => {
        event.preventDefault();
        navigate('/');
      }}
      className={`inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d5b86b] ${className}`}
    >
      {children}
    </a>
  );
}
