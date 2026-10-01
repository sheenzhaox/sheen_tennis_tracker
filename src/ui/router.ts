import { useEffect, useState } from 'react';

export interface Route {
  segments: string[];
  query: URLSearchParams;
}

function parseHash(hash: string): Route {
  const [path, search = ''] = hash.replace(/^#\/?/, '').split('?');
  return { segments: path.split('/').filter(Boolean), query: new URLSearchParams(search) };
}

export function useRoute(): Route {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return parseHash(hash);
}

export function navigate(path: string) {
  window.location.hash = path.startsWith('/') ? path : `/${path}`;
}
