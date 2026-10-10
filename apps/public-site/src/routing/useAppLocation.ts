import { useState, useEffect } from 'react';
import { RouteState } from './types';
import { matchRoute } from './routeMatcher';
import { navigationService } from './navigationService';

function safeMatchRoute(pathname: string, search: string, hash: string): RouteState {
  try {
    return matchRoute(pathname, search, hash);
  } catch (error) {
    console.warn('A URL contém parâmetros malformados; a navegação pública foi preservada.', error);
    return {
      pathname,
      search: '',
      hash,
      area: pathname === '/' ? 'public' : 'unknown',
      module: pathname === '/' ? 'home' : 'unknown',
      query: {},
    };
  }
}

export function useAppLocation(): RouteState {
  const [currentLoc, setCurrentLoc] = useState(() => {
    if (typeof window !== 'undefined') {
      return {
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      };
    }
    return { pathname: '/', search: '', hash: '' };
  });

  useEffect(() => {
    const handleRoute = (loc: { pathname: string; search: string; hash: string }) => {
      setCurrentLoc(loc);
    };

    const unsubscribe = navigationService.subscribe(handleRoute);
    return () => {
      unsubscribe();
    };
  }, []);

  return safeMatchRoute(currentLoc.pathname, currentLoc.search, currentLoc.hash);
}
export default useAppLocation;
