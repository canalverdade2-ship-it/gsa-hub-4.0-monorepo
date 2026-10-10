import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import {
  detectSiteCampaignDevice,
  fetchSiteCampaigns,
  trackSiteCampaignEvent,
} from '../../lib/siteCampaigns';
import type {
  SiteCampaign,
  SiteCampaignDevice,
  SiteCampaignViewerAudience,
} from '../../types/siteCampaigns';

interface SiteCampaignLayerProps {
  page: string;
  audience: SiteCampaignViewerAudience;
  actorId?: string | null;
}

const TEMPLATE_STYLES: Record<SiteCampaign['template'], {
  surface: string;
  eyebrow: string;
  title: string;
  body: string;
  button: string;
  secondary: string;
}> = {
  institutional_light: {
    surface: 'border-[#ded8ca] bg-[#f8f6f1] text-[#172337]',
    eyebrow: 'text-[#9a742f]',
    title: 'text-[#172337]',
    body: 'text-[#5d6672]',
    button: 'bg-[#172337] text-white hover:bg-[#25364f]',
    secondary: 'border-[#c9c1b1] text-[#172337] hover:bg-white',
  },
  institutional_dark: {
    surface: 'border-white/10 bg-[#101a2a] text-white',
    eyebrow: 'text-[#d5b36b]',
    title: 'text-white',
    body: 'text-white/70',
    button: 'bg-[#d5b36b] text-[#101a2a] hover:bg-[#e4c982]',
    secondary: 'border-white/20 text-white hover:bg-white/10',
  },
  promotion: {
    surface: 'border-[#e0c37b] bg-[#fff9e9] text-[#2d2414]',
    eyebrow: 'text-[#9a6822]',
    title: 'text-[#2d2414]',
    body: 'text-[#66583c]',
    button: 'bg-[#9b6723] text-white hover:bg-[#80521a]',
    secondary: 'border-[#d8bd7d] text-[#6e4818] hover:bg-white/70',
  },
  alert: {
    surface: 'border-[#e5b2a7] bg-[#fff2ef] text-[#54291f]',
    eyebrow: 'text-[#a33e2d]',
    title: 'text-[#54291f]',
    body: 'text-[#7c4d43]',
    button: 'bg-[#a33e2d] text-white hover:bg-[#873224]',
    secondary: 'border-[#dfb1a6] text-[#7d3426] hover:bg-white/70',
  },
  maintenance: {
    surface: 'border-[#bdcadd] bg-[#f0f5fb] text-[#18314f]',
    eyebrow: 'text-[#2f5f91]',
    title: 'text-[#18314f]',
    body: 'text-[#526a84]',
    button: 'bg-[#214d79] text-white hover:bg-[#173c62]',
    secondary: 'border-[#b5c5d7] text-[#214d79] hover:bg-white/70',
  },
  launch: {
    surface: 'border-[#c9bdd9] bg-[#f7f1fb] text-[#342343]',
    eyebrow: 'text-[#754d91]',
    title: 'text-[#342343]',
    body: 'text-[#6a5877]',
    button: 'bg-[#674083] text-white hover:bg-[#53336a]',
    secondary: 'border-[#ccbddd] text-[#674083] hover:bg-white/70',
  },
};

const CATEGORY_LABELS: Record<SiteCampaign['category'], string> = {
  announcement: 'Comunicado',
  promotion: 'Promoção',
  news: 'Novidade',
  alert: 'Alerta',
  maintenance: 'Manutenção',
  event: 'Evento',
  system_update: 'Atualização',
  institutional: 'GSA HUB',
};

function safeDestination(url?: string | null) {
  if (!url) return null;
  const value = url.trim();
  if (!value) return null;
  if (value.startsWith('/')) return value;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function CampaignContent({
  campaign,
  device,
  compact = false,
  onPrimary,
  onSecondary,
}: {
  campaign: SiteCampaign;
  device: SiteCampaignDevice;
  compact?: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  const styles = TEMPLATE_STYLES[campaign.template];
  const image = device === 'mobile'
    ? campaign.image_mobile_url || campaign.image_desktop_url
    : campaign.image_desktop_url || campaign.image_mobile_url;

  return (
    <div className={`overflow-hidden border shadow-2xl ${compact ? 'sm:flex' : ''} ${styles.surface}`}>
      {image && (
        <div className={compact ? 'h-32 sm:h-auto sm:w-48' : 'aspect-[16/7] w-full bg-black/5'}>
          <img
            src={image}
            alt={campaign.image_alt || ''}
            className="h-full w-full object-cover"
            loading="eager"
          />
        </div>
      )}
      <div className={compact ? 'flex-1 p-5 sm:p-6' : 'p-6 sm:p-8'}>
        <p className={`text-[11px] font-black uppercase tracking-[0.2em] ${styles.eyebrow}`}>
          {CATEGORY_LABELS[campaign.category]}
        </p>
        <h2 className={`mt-2 font-black tracking-[-0.025em] ${compact ? 'text-xl' : 'text-2xl sm:text-3xl'} ${styles.title}`}>
          {campaign.title}
        </h2>
        {campaign.subtitle && <p className={`mt-2 text-sm font-bold ${styles.title}`}>{campaign.subtitle}</p>}
        {campaign.body && <p className={`mt-3 whitespace-pre-line text-sm leading-6 ${styles.body}`}>{campaign.body}</p>}
        {(campaign.cta_label || campaign.secondary_cta_label) && (
          <div className="mt-5 flex flex-wrap gap-2">
            {campaign.cta_label && campaign.cta_url && (
              <button type="button" onClick={onPrimary} className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-black transition ${styles.button}`}>
                {campaign.cta_label}<ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            {campaign.secondary_cta_label && campaign.secondary_cta_url && (
              <button type="button" onClick={onSecondary} className={`border px-4 py-2.5 text-sm font-black transition ${styles.secondary}`}>
                {campaign.secondary_cta_label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function SiteCampaignLayer({ page, audience, actorId }: SiteCampaignLayerProps) {
  const [campaigns, setCampaigns] = useState<SiteCampaign[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [device, setDevice] = useState<SiteCampaignDevice>(() => detectSiteCampaignDevice());

  useEffect(() => {
    const onResize = () => setDevice(detectSiteCampaignDevice());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let active = true;
    setHidden(new Set());
    fetchSiteCampaigns({ page, device, audience, actorId })
      .then((items) => { if (active) setCampaigns(items); })
      .catch((error) => {
        console.error('Falha não bloqueante ao carregar avisos e campanhas:', error);
        if (active) setCampaigns([]);
      });
    return () => { active = false; };
  }, [actorId, audience, device, page]);

  const visible = useMemo(() => campaigns.filter((campaign) => !hidden.has(campaign.id)), [campaigns, hidden]);
  const topBar = visible.find((campaign) => campaign.format === 'top_bar');
  const inlineBanner = visible.find((campaign) => campaign.format === 'inline_banner');
  const floatingCard = visible.find((campaign) => campaign.format === 'floating_card');
  const modalCampaign = visible.find((campaign) => ['fullscreen', 'popup'].includes(campaign.format));

  const track = useCallback(async (campaign: SiteCampaign, eventType: 'click' | 'close', metadata?: Record<string, unknown>) => {
    try {
      await trackSiteCampaignEvent({
        campaignId: campaign.id,
        eventType,
        page,
        device,
        audience,
        actorId,
        metadata,
      });
    } catch (error) {
      console.error(`Falha não bloqueante ao registrar ${eventType} da campanha:`, error);
    }
  }, [actorId, audience, device, page]);

  const close = useCallback((campaign: SiteCampaign) => {
    setHidden((current) => new Set(current).add(campaign.id));
    void track(campaign, 'close');
  }, [track]);

  const navigateTo = useCallback((campaign: SiteCampaign, url?: string | null, kind: 'primary' | 'secondary' = 'primary') => {
    const destination = safeDestination(url);
    if (!destination) return;
    void track(campaign, 'click', { action: kind, destination });
    if (campaign.cta_target === '_blank' && !destination.startsWith('/')) {
      window.open(destination, '_blank', 'noopener,noreferrer');
    } else {
      window.location.assign(destination);
    }
  }, [track]);

  useEffect(() => {
    if (!modalCampaign) return;
    const previousOverflow = document.body.style.overflow;
    if (previousOverflow !== 'hidden') {
      document.body.style.overflow = 'hidden';
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && modalCampaign.dismissible && modalCampaign.dismiss_on_escape) close(modalCampaign);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      if (previousOverflow !== 'hidden') {
        document.body.style.overflow = previousOverflow;
      }
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [close, modalCampaign]);

  useEffect(() => {
    if (!modalCampaign?.auto_close_seconds || !modalCampaign.dismissible) return;
    const timer = window.setTimeout(() => close(modalCampaign), modalCampaign.auto_close_seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [close, modalCampaign]);

  if (!visible.length) return null;

  return (
    <>
      {topBar && (
        <div className={`relative z-[80] border-b px-4 py-3 ${TEMPLATE_STYLES[topBar.template].surface}`} role="status" aria-live="polite">
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-3 pr-9 text-center">
            <p className="text-sm font-bold">
              <span className={`mr-2 text-[10px] font-black uppercase tracking-[0.18em] ${TEMPLATE_STYLES[topBar.template].eyebrow}`}>{CATEGORY_LABELS[topBar.category]}</span>
              {topBar.title}
            </p>
            {topBar.cta_label && topBar.cta_url && (
              <button type="button" onClick={() => navigateTo(topBar, topBar.cta_url)} className="shrink-0 text-sm font-black underline decoration-2 underline-offset-4">
                {topBar.cta_label}
              </button>
            )}
          </div>
          {topBar.dismissible && <button type="button" aria-label="Fechar aviso" onClick={() => close(topBar)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>}
        </div>
      )}

      {inlineBanner && (
        <section className="relative z-20 mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8" aria-label="Campanha em destaque">
          <div className="relative">
            <CampaignContent
              campaign={inlineBanner}
              device={device}
              compact
              onPrimary={() => navigateTo(inlineBanner, inlineBanner.cta_url)}
              onSecondary={() => navigateTo(inlineBanner, inlineBanner.secondary_cta_url, 'secondary')}
            />
            {inlineBanner.dismissible && <button type="button" aria-label="Fechar campanha" onClick={() => close(inlineBanner)} className="absolute right-3 top-3 bg-white/80 p-2 text-neutral-800 shadow hover:bg-white"><X className="h-4 w-4" /></button>}
          </div>
        </section>
      )}

      {floatingCard && (
        <aside className="fixed bottom-5 right-4 z-[90] w-[calc(100%-2rem)] max-w-sm" aria-label="Aviso em destaque">
          <div className="relative">
            <CampaignContent
              campaign={floatingCard}
              device={device}
              compact
              onPrimary={() => navigateTo(floatingCard, floatingCard.cta_url)}
              onSecondary={() => navigateTo(floatingCard, floatingCard.secondary_cta_url, 'secondary')}
            />
            {floatingCard.dismissible && <button type="button" aria-label="Fechar aviso" onClick={() => close(floatingCard)} className="absolute right-3 top-3 bg-white/85 p-2 text-neutral-800 shadow hover:bg-white"><X className="h-4 w-4" /></button>}
          </div>
        </aside>
      )}

      {modalCampaign && (
        <div
          className={`fixed inset-0 z-[150] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm ${modalCampaign.format === 'fullscreen' ? 'sm:p-8' : ''}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && modalCampaign.dismissible && modalCampaign.dismiss_on_backdrop) close(modalCampaign);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby={`site-campaign-${modalCampaign.id}`} className={modalCampaign.format === 'fullscreen' ? 'relative h-full w-full max-w-7xl overflow-y-auto' : 'relative max-h-[92vh] w-full max-w-2xl overflow-y-auto'}>
            <span id={`site-campaign-${modalCampaign.id}`} className="sr-only">{modalCampaign.title}</span>
            <CampaignContent
              campaign={modalCampaign}
              device={device}
              onPrimary={() => navigateTo(modalCampaign, modalCampaign.cta_url)}
              onSecondary={() => navigateTo(modalCampaign, modalCampaign.secondary_cta_url, 'secondary')}
            />
            {modalCampaign.dismissible && <button type="button" aria-label="Fechar janela" onClick={() => close(modalCampaign)} className="absolute right-3 top-3 bg-white/90 p-2 text-neutral-800 shadow-lg hover:bg-white"><X className="h-5 w-5" /></button>}
          </div>
        </div>
      )}
    </>
  );
}
