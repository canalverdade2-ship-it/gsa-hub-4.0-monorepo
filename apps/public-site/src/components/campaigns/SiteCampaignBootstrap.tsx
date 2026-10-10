import { useEffect, useMemo, useState } from 'react';
import { sessionService } from '../../lib/sessionService';
import type { SiteCampaignViewerAudience } from '../../types/siteCampaigns';
import { SiteCampaignLayer } from './SiteCampaignLayer';

const PRIVATE_PREFIXES = ['/admin', '/prestador'];

function currentLocation() {
  return `${window.location.pathname || '/'}${window.location.search || ''}`;
}

function readAudience() {
  const session = sessionService.getCurrentSession();
  const actorType = session?.atorTipo;
  const audience: SiteCampaignViewerAudience = actorType === 'cliente'
    ? 'clients'
    : actorType
      ? 'authenticated'
      : 'guests';
  return { audience, actorId: session?.atorId || null };
}

export function SiteCampaignBootstrap() {
  const [page, setPage] = useState(() => currentLocation());
  const [identity, setIdentity] = useState(() => readAudience());

  useEffect(() => {
    const refresh = () => {
      setPage(currentLocation());
      setIdentity(readAudience());
    };
    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);
    window.history.pushState = (...args) => { originalPushState(...args); window.dispatchEvent(new Event('gsa-location-change')); };
    window.history.replaceState = (...args) => { originalReplaceState(...args); window.dispatchEvent(new Event('gsa-location-change')); };
    window.addEventListener('popstate', refresh);
    window.addEventListener('gsa-location-change', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('gsa-session-revoked', refresh);
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', refresh);
      window.removeEventListener('gsa-location-change', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('gsa-session-revoked', refresh);
      window.clearInterval(interval);
    };
  }, []);

  const pathname = useMemo(() => page.split('?')[0] || '/', [page]);
  const privateRoute = PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (privateRoute) return null;

  return <SiteCampaignLayer page={pathname} audience={identity.audience} actorId={identity.actorId} />;
}
