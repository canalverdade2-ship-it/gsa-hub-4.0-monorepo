import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { LogoGSA } from '../ui/LogoGSA';
import { AccessibleDialog } from '../ui/AccessibleDialog';
import { PartnerApplicationPage } from './PartnerApplicationPage';
import { PartnersPage } from './PartnersPage';
import { PrivacyPolicyPage } from './PrivacyPolicyPage';
import { PrivacyPolicyDialog } from './PrivacyPolicyDialog';
import { FreeToolsExperiencePage } from './FreeToolsExperiencePage';
import { PublicFooter } from './final/PublicFooter';
import { PublicHomeLanding, type HomeServiceCategory } from './final/PublicHomeLanding';
import { PublicServicesPage, type PublicServiceRequest } from './final/PublicServicesPage';
import { PublicHeader } from './final/PublicHeader';
import './final/PublicHomePlan3.css';
import {
  type Audience,
  type IconItem,
  type PublicPage,
  type ServicePackage,
} from '../../data/publicServiceCatalog';

const WHATSAPP_NUMBER = '5511920857756';

interface GSAEnterpriseHomeFinalProps {
  publicPage: PublicPage;
  setPublicPage: (page: PublicPage) => void;
  publicAudience: Audience;
  setPublicAudience: (audience: Audience) => void;
  servicePackages: ServicePackage[];
  publicServices: IconItem[];
  initialServiceSlug?: string;
  initialPartnerSlug?: string;
  onServiceDetailChange?: (slug: string | null) => void;
  onPartnerDetailChange?: (slug: string | null) => void;
  onGuestStore?: () => void;
  onClientLogin: () => void;
  onAdminLogin: () => void;
}

export function GSAEnterpriseHomeFinal(props: GSAEnterpriseHomeFinalProps) {
  const reduceMotion = useReducedMotion();
  const [showIntro, setShowIntro] = useState(false);
  const [initialServiceCategory, setInitialServiceCategory] = useState('all');
  const [privacyNoticeOpen, setPrivacyNoticeOpen] = useState(false);

  const filteredPackages = useMemo(
    () => props.servicePackages.filter((item) => item.audience === props.publicAudience || item.audience === 'AMBOS'),
    [props.publicAudience, props.servicePackages],
  );

  useEffect(() => {
    if (reduceMotion || window.innerWidth >= 768 || localStorage.getItem('gsa_intro_seen')) return;
    setShowIntro(true);
    const timer = window.setTimeout(() => dismissIntro(), 1200);
    return () => window.clearTimeout(timer);
  }, [reduceMotion]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [props.publicPage, props.initialPartnerSlug, reduceMotion]);

  const dismissIntro = () => {
    setShowIntro(false);
    localStorage.setItem('gsa_intro_seen', 'true');
  };

  const openWhatsApp = (message: string) => {
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const handleWhatsAppRequest = (request: PublicServiceRequest) => {
    const message = [
      '#SOLICITACAO_SERVICO_GSA',
      'Olá! Gostaria de solicitar atendimento para estes serviços da GSA HUB:',
      '',
      `👤 *Perfil:* ${request.audience === 'PJ' ? 'Empresa' : 'Pessoa física'}`,
      '🛠️ *Serviços escolhidos:*',
      ...request.services.map((service) => `• ${service.name} — ${service.category}`),
      '',
      'Pode me orientar sobre os próximos passos?',
    ].join('\n');

    openWhatsApp(message);
  };

  const isPartnerApplication = props.publicPage === 'partners' && props.initialPartnerSlug === 'solicitar';

  const exploreHomeCategory = (category: HomeServiceCategory) => {
    if (category === 'free-tools') {
      props.setPublicPage('free-tools');
      return;
    }
    if (category === 'marketplace') {
      if (props.onGuestStore) props.onGuestStore();
      else window.location.assign('/marketplace');
      return;
    }
    if (category === 'technology') {
      props.setPublicPage('systems');
      return;
    }

    props.setPublicAudience(category === 'business' ? 'PJ' : 'PF');
    setInitialServiceCategory(category === 'business' ? 'fiscal' : 'all');
    props.setPublicPage('services');
  };

  return (
    <div className="gsa-home-plan-3 min-h-screen bg-[#f4f1ea] text-neutral-950">
      <AccessibleDialog isOpen={showIntro} onClose={dismissIntro} ariaLabel="Introdução GSA" zIndexClassName="z-[100]" overlayClassName="items-center justify-center bg-[#050608] px-6 text-center md:hidden" panelClassName="max-w-lg bg-transparent text-center text-white shadow-none">
        <LogoGSA size="xl" variant="light" />
        <h1 className="mt-6 text-5xl font-serif tracking-[0.14em] text-[#d8bd73]">GSA HUB</h1>
        <p className="mt-3 text-sm uppercase tracking-[0.24em] text-white/65">Soluções Digitais</p>
        <button type="button" data-dialog-autofocus onClick={dismissIntro} className="mt-10 rounded-full border border-white/25 px-5 py-2 text-sm font-bold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8bd73]">Pular introdução</button>
      </AccessibleDialog>

      {!isPartnerApplication && <PublicHeader currentPage={props.publicPage} onNavigatePage={props.setPublicPage} onGuestStore={props.onGuestStore} onClientLogin={props.onClientLogin} />}

      {props.publicPage === 'home' && <PublicHomeLanding reduceMotion={Boolean(reduceMotion)} setPublicPage={props.setPublicPage} onGuestStore={props.onGuestStore} onExploreCategory={exploreHomeCategory} />}
      {props.publicPage === 'services' && <PublicServicesPage audience={props.publicAudience} setAudience={props.setPublicAudience} packages={filteredPackages} initialCategory={initialServiceCategory} onBack={() => props.setPublicPage('home')} onWhatsAppRequest={handleWhatsAppRequest} />}
      {props.publicPage === 'privacy' && <PrivacyPolicyPage />}
      {props.publicPage === 'free-tools' && <FreeToolsExperiencePage onBack={() => props.setPublicPage('home')} onServices={() => props.setPublicPage('services')} onClientLogin={props.onClientLogin} />}
      {props.publicPage === 'partners' && (
        isPartnerApplication
          ? <PartnerApplicationPage onBack={() => props.onPartnerDetailChange?.(null)} />
          : <PartnersPage selectedSlug={props.initialPartnerSlug} onSelectPartner={(slug) => props.onPartnerDetailChange?.(slug)} onBack={() => props.setPublicPage('home')} />
      )}

      {!isPartnerApplication && <PublicFooter setPublicPage={props.setPublicPage} onGuestStore={props.onGuestStore} onAdminLogin={props.onAdminLogin} onPrivacyNotice={() => setPrivacyNoticeOpen(true)} />}
      <PrivacyPolicyDialog isOpen={privacyNoticeOpen} onClose={() => setPrivacyNoticeOpen(false)} />
    </div>
  );
}

