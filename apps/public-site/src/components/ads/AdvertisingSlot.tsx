import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ExternalLink, Megaphone, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAppLocation } from '../../routing/useAppLocation';
import type { ServedAdvertisement } from '../../types/advertising';
import { AccessibleDialog } from '../ui/AccessibleDialog';

export type AdvertisingPlacementCode =
  | 'HOME_BANNER_TOP'
  | 'HOME_INLINE_01'
  | 'HOME_LIGHTBOX'
  | 'SITE_STICKY_BOTTOM'
  | 'MARKETPLACE_SPONSORED_CARD'
  | 'CLASSIFIEDS_BANNER_TOP'
  | 'ADS_PUBLIC_SHOWCASE';

type AdvertisingSlotVariant = 'inline' | 'banner' | 'card' | 'showcase' | 'sticky' | 'lightbox';

interface AdvertisingSlotProps {
  placementCode: AdvertisingPlacementCode;
  variant?: AdvertisingSlotVariant;
  className?: string;
  loadingFallback?: ReactNode;
  emptyFallback?: ReactNode;
}

interface DeliveryResponse {
  success: boolean;
  event_token?: string;
  ad?: Omit<ServedAdvertisement, 'event_token'> | null;
}

const DISMISSIBLE_PLACEMENTS = new Set<AdvertisingPlacementCode>([
  'HOME_LIGHTBOX',
  'SITE_STICKY_BOTTOM',
]);

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function readStorage(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    // A entrega continua com um identificador efêmero quando o navegador bloqueia o armazenamento.
  }
}

function getPersistentId(key: string, storage: Storage) {
  const existing = readStorage(storage, key);
  if (existing && /^[a-zA-Z0-9._:-]+$/.test(existing)) return existing;
  const value = randomId();
  writeStorage(storage, key, value);
  return value;
}

function getViewerId() {
  const privacyNavigator = navigator as Navigator & { globalPrivacyControl?: boolean };
  const prefersSessionOnly = navigator.doNotTrack === '1' || privacyNavigator.globalPrivacyControl === true;
  return getPersistentId('_gsa_ad_viewer', prefersSessionOnly ? window.sessionStorage : window.localStorage);
}

function deviceType() {
  if (window.innerWidth < 768) return 'mobile';
  if (window.innerWidth < 1100) return 'tablet';
  return 'desktop';
}

function normalizePathname(pathname: string) {
  let normalized = pathname.replace(/\/+$/, '') || '/';
  if (!normalized.startsWith('/')) normalized = '/' + normalized;
  return normalized;
}

export function isPlacementAllowedOnRoute(placementCode: AdvertisingPlacementCode, pathname: string) {
  const route = normalizePathname(pathname);
  switch (placementCode) {
    case 'HOME_BANNER_TOP':
    case 'HOME_INLINE_01':
    case 'HOME_LIGHTBOX':
      return route === '/';
    case 'ADS_PUBLIC_SHOWCASE':
      return route === '/anuncios';
    case 'MARKETPLACE_SPONSORED_CARD':
      return route === '/marketplace' || route.startsWith('/marketplace/');
    case 'CLASSIFIEDS_BANNER_TOP':
      return route === '/marketplace/menu/classificados' || route.startsWith('/marketplace/menu/classificados/');
    case 'SITE_STICKY_BOTTOM':
      return true;
    default:
      return false;
  }
}

function safeHttpUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    const localDevelopmentUrl = import.meta.env.DEV
      && url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return url.protocol === 'https:' || localDevelopmentUrl ? url.href : null;
  } catch {
    return null;
  }
}

function dismissKey(placementCode: AdvertisingPlacementCode, pathname: string) {
  return `_gsa_ad_dismissed:${placementCode}:${normalizePathname(pathname)}`;
}

function slotClasses(variant: AdvertisingSlotVariant) {
  if (variant === 'sticky') {
    return 'fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-3xl rounded-2xl border border-neutral-200 bg-white p-3 text-neutral-950 shadow-2xl';
  }
  if (variant === 'banner') {
    return 'overflow-hidden rounded-2xl border border-neutral-200 bg-white p-3 text-neutral-950 shadow-sm sm:p-4';
  }
  if (variant === 'card' || variant === 'showcase') {
    return 'overflow-hidden rounded-3xl border border-neutral-200 bg-white p-4 text-neutral-950 shadow-sm';
  }
  return 'overflow-hidden rounded-3xl border border-neutral-200 bg-white p-4 text-neutral-950 shadow-sm sm:p-5';
}

function layoutClasses(variant: AdvertisingSlotVariant) {
  if (variant === 'sticky') return 'flex min-w-0 items-center gap-3';
  if (variant === 'banner') return 'flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center';
  return 'flex min-w-0 flex-col gap-4';
}

function mediaClasses(variant: AdvertisingSlotVariant) {
  if (variant === 'sticky') return 'h-14 w-24 shrink-0 rounded-lg object-cover sm:h-16 sm:w-32';
  if (variant === 'banner') return 'h-36 w-full shrink-0 rounded-xl object-cover sm:h-24 sm:w-48';
  if (variant === 'lightbox') return 'max-h-[52vh] w-full rounded-2xl object-contain';
  return 'aspect-video max-h-80 w-full rounded-2xl object-cover';
}

export function AdvertisingSlot({
  placementCode,
  variant = 'inline',
  className = '',
  loadingFallback = null,
  emptyFallback = null,
}: AdvertisingSlotProps) {
  const route = useAppLocation();
  const pathname = normalizePathname(route.pathname);
  const routeAllowed = isPlacementAllowedOnRoute(placementCode, pathname);
  const [ad, setAd] = useState<ServedAdvertisement | null>(null);
  const [status, setStatus] = useState<'loading' | 'empty' | 'ready' | 'error'>('loading');
  const [dismissed, setDismissed] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewRecorded = useRef(false);
  const recordedEvents = useRef(new Set<string>());
  const eventToken = useRef<string | null>(null);

  useEffect(() => {
    eventToken.current = ad?.event_token || null;
    viewRecorded.current = false;
    recordedEvents.current.clear();
  }, [ad?.event_token]);

  useEffect(() => {
    let active = true;
    setAd(null);
    setDismissed(false);
    viewRecorded.current = false;
    recordedEvents.current.clear();

    if (!routeAllowed) {
      setStatus('empty');
      return () => { active = false; };
    }

    if (DISMISSIBLE_PLACEMENTS.has(placementCode) && readStorage(window.sessionStorage, dismissKey(placementCode, pathname)) === 'true') {
      setStatus('empty');
      return () => { active = false; };
    }

    setStatus('loading');
    const load = async () => {
      try {
        const viewerId = getViewerId();
        const sessionId = getPersistentId('_gsa_ad_session', window.sessionStorage);
        const { data, error } = await supabase.functions.invoke<DeliveryResponse>('gsa-ads-public', {
          body: {
            action: 'serve',
            placement_code: placementCode,
            viewer_id: viewerId,
            session_id: sessionId,
            route: pathname,
            device: deviceType(),
          },
        });
        if (error) throw error;
        if (!active) return;
        if (data?.ad && data.event_token) {
          setAd({ ...data.ad, event_token: data.event_token });
          setStatus('ready');
        } else {
          setStatus('empty');
        }
      } catch (error) {
        if (!active) return;
        setStatus('empty');
      }
    };
    void load();
    return () => { active = false; };
  }, [pathname, placementCode, routeAllowed]);

  const record = useCallback(async (eventType: 'viewable' | 'click' | 'video_start' | 'video_complete') => {
    const token = eventToken.current;
    if (!token || recordedEvents.current.has(eventType)) return;
    recordedEvents.current.add(eventType);
    try {
      const { error } = await supabase.functions.invoke('gsa-ads-public', {
        body: { action: 'event', event_token: token, event_type: eventType },
      });
      if (error) throw error;
    } catch (error) {
      recordedEvents.current.delete(eventType);
      console.warn(`Falha ao registrar evento ${eventType}:`, error);
    }
  }, []);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || !ad || dismissed || viewRecorded.current) return;
    let viewTimer: number | null = null;
    let currentlyViewable = false;

    const cancelViewTimer = () => {
      if (viewTimer !== null) window.clearTimeout(viewTimer);
      viewTimer = null;
    };

    const startViewTimer = () => {
      if (!currentlyViewable || document.visibilityState !== 'visible' || viewTimer !== null) return;
      viewTimer = window.setTimeout(() => {
        viewRecorded.current = true;
        void record('viewable');
        observer.disconnect();
      }, 1000);
    };

    const observer = new IntersectionObserver((entries) => {
      currentlyViewable = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5);
      if (!currentlyViewable || document.visibilityState !== 'visible') {
        cancelViewTimer();
        return;
      }
      startViewTimer();
    }, { threshold: [0, 0.5, 1] });

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') cancelViewTimer();
      else startViewTimer();
    };

    observer.observe(element);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelViewTimer();
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [ad, dismissed, record]);

  const targetUrl = useMemo(() => safeHttpUrl(ad?.target_url), [ad?.target_url]);
  const assetUrl = useMemo(() => safeHttpUrl(ad?.asset_url), [ad?.asset_url]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    if (DISMISSIBLE_PLACEMENTS.has(placementCode)) {
      writeStorage(window.sessionStorage, dismissKey(placementCode, pathname), 'true');
    }
  }, [pathname, placementCode]);

  if (!routeAllowed) return null;
  if (status === 'loading') return <>{loadingFallback}</>;
  if ((status === 'empty' || status === 'error') && !ad) return <>{emptyFallback}</>;
  if (!ad || dismissed) return null;

  const details = (
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">
        <Megaphone className="h-3 w-3" aria-hidden="true" /> Publicidade
      </p>
      <h3 className={`${variant === 'sticky' ? 'mt-1 truncate text-sm sm:text-base' : 'mt-2 text-xl'} font-black text-neutral-950`}>
        {ad.headline || ad.name}
      </h3>
      {(ad.body || ad.advertiser_name) && (
        <p className={`${variant === 'sticky' ? 'line-clamp-1 text-xs' : 'mt-2 text-sm leading-relaxed'} text-neutral-500`}>
          {ad.body || ad.advertiser_name}
        </p>
      )}
      {targetUrl && ad.kind === 'video' && (
        <a
          href={targetUrl}
          target="_blank"
          rel="sponsored noopener noreferrer"
          onClick={() => void record('click')}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-neutral-950 px-4 py-2 text-xs font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          Saiba mais <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      )}
      <span className="sr-only">A exibição usa identificadores aleatórios para limitar frequência e medir resultados, sem incluir seu nome ou e-mail.</span>
    </div>
  );

  const media = ad.kind === 'image' && assetUrl ? (
    <img
      src={assetUrl}
      alt={ad.alt_text || ad.headline || ad.name}
      className={mediaClasses(variant)}
      loading={variant === 'lightbox' ? 'eager' : 'lazy'}
      decoding="async"
    />
  ) : ad.kind === 'video' && assetUrl ? (
    <video
      src={assetUrl}
      muted
      playsInline
      controls
      preload="metadata"
      aria-label={ad.alt_text || ad.headline || `Vídeo publicitário de ${ad.advertiser_name}`}
      className={`${mediaClasses(variant)} bg-black`}
      onPlay={() => void record('video_start')}
      onEnded={() => void record('video_complete')}
    />
  ) : null;

  const creative = (
    <div className={layoutClasses(variant)}>
      {media}
      {details}
    </div>
  );

  const linkedCreative = targetUrl && ad.kind !== 'video' ? (
    <a
      href={targetUrl}
      target="_blank"
      rel="sponsored noopener noreferrer"
      onClick={() => void record('click')}
      aria-label={`${ad.headline || ad.name} (publicidade; abre em nova aba)`}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
    >
      {creative}
    </a>
  ) : creative;

  const advertisement = (
    <div
      ref={rootRef}
      role="complementary"
      className={`${slotClasses(variant)} ${className}`}
      data-ad-placement={placementCode}
      data-ad-privacy="pseudonymous"
      aria-label={`Publicidade de ${ad.advertiser_name}`}
    >
      <div className={variant === 'sticky' ? 'flex items-center gap-3' : undefined}>
        <div className="min-w-0 flex-1">{linkedCreative}</div>
        {variant === 'sticky' && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Fechar publicidade"
            className="shrink-0 rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );

  if (variant !== 'lightbox') return advertisement;

  return (
    <AccessibleDialog
      isOpen={!dismissed}
      onClose={dismiss}
      ariaLabel={`Publicidade de ${ad.advertiser_name}`}
      panelClassName="relative max-w-2xl rounded-3xl bg-white p-4 shadow-2xl sm:p-6"
      overlayClassName="items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
    >
      <button
        type="button"
        data-dialog-autofocus
        onClick={dismiss}
        aria-label="Fechar publicidade"
        className="absolute right-3 top-3 z-10 rounded-full bg-white p-2 text-neutral-600 shadow-lg transition hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
      {advertisement}
    </AccessibleDialog>
  );
}
