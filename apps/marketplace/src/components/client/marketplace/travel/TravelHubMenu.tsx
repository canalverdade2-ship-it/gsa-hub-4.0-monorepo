import React from 'react';
import { motion } from 'framer-motion';
import { Plane, Compass, FileText, CheckSquare, Users, Ticket, RefreshCcw, HelpCircle, ArrowLeft } from 'lucide-react';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';
import { MarketplaceSubmoduleCard } from '../MarketplaceSubmoduleCard';

interface TravelHubMenuProps {
  clientId?: string;
  onBackToMarketplace: () => void;
  onRequireAuth: () => void;
}

export function TravelHubMenu({ clientId, onBackToMarketplace, onRequireAuth }: TravelHubMenuProps) {
  const handleNav = (path: string, authRequired: boolean) => {
    if (authRequired && !clientId) {
      onRequireAuth();
      return;
    }
    navigate(path);
  };

  const cards = [
    {
      id: 'ofertas',
      title: 'Explorar Pacotes',
      desc: 'Confira ofertas selecionadas pela GSA.',
      icon: Compass,
      cta: 'Explorar',
      categoryLabel: 'Descobrir',
      image: '/images/marketplace/submodules/travel/explorar-pacotes.jpg',
      imageAlt: 'Planejamento de viagem com vista para um destino litorâneo',
      auth: false,
      path: routes.marketplace.travelPackages.ofertas(),
      color: 'blue'
    },
    {
      id: 'viagens',
      title: 'Minhas Viagens',
      desc: 'Acompanhe reservas, emissões e viagens.',
      icon: Plane,
      cta: 'Acompanhar',
      categoryLabel: 'Minha jornada',
      image: '/images/marketplace/submodules/travel/minhas-viagens.jpg',
      imageAlt: 'Mala de viagem em uma sala de embarque com avião ao fundo',
      auth: true,
      path: routes.marketplace.travelPackages.minhasViagens(),
      color: 'sky'
    },
    {
      id: 'orcamento',
      title: 'Solicitar Orçamento',
      desc: 'Solicite uma viagem personalizada.',
      icon: FileText,
      cta: 'Solicitar',
      categoryLabel: 'Personalizado',
      image: '/images/marketplace/submodules/travel/solicitar-orcamento.jpg',
      imageAlt: 'Consultoria para planejamento de uma viagem personalizada',
      auth: false,
      path: routes.marketplace.travelPackages.orcamento(),
      color: 'emerald'
    },
    {
      id: 'propostas',
      title: 'Minhas Propostas',
      desc: 'Consulte propostas enviadas pela GSA.',
      icon: CheckSquare,
      cta: 'Consultar',
      categoryLabel: 'Comparação',
      image: '/images/marketplace/submodules/travel/minhas-propostas.jpg',
      imageAlt: 'Propostas de viagem organizadas para comparação',
      auth: true,
      path: routes.marketplace.travelPackages.minhasPropostas(),
      color: 'amber'
    },
    {
      id: 'passageiros',
      title: 'Passageiros e Documentos',
      desc: 'Gerencie dados e documentos necessários.',
      icon: Users,
      cta: 'Gerenciar',
      categoryLabel: 'Documentação',
      image: '/images/marketplace/submodules/travel/passageiros-documentos.jpg',
      imageAlt: 'Documentos e organizador preparados para uma viagem',
      auth: true,
      path: routes.marketplace.travelPackages.documentos(),
      color: 'indigo'
    },
    {
      id: 'vouchers',
      title: 'Vouchers e Comprovantes',
      desc: 'Consulte bilhetes, reservas e vouchers.',
      icon: Ticket,
      cta: 'Acessar',
      categoryLabel: 'Confirmações',
      image: '/images/marketplace/submodules/travel/vouchers-comprovantes.jpg',
      imageAlt: 'Comprovantes e bilhetes de uma viagem organizados',
      auth: true,
      path: routes.marketplace.travelPackages.minhasViagens(),
      color: 'rose'
    },
    {
      id: 'cancelamentos',
      title: 'Cancelamentos e Reembolsos',
      desc: 'Acompanhe solicitações e devoluções.',
      icon: RefreshCcw,
      cta: 'Solicitar',
      categoryLabel: 'Pós-venda',
      image: '/images/marketplace/submodules/travel/cancelamentos-reembolsos.jpg',
      imageAlt: 'Atendimento para alteração ou cancelamento de viagem',
      auth: true,
      path: routes.marketplace.travelPackages.cancelamentos(),
      color: 'purple'
    },
    {
      id: 'suporte',
      title: 'Suporte',
      desc: 'Atendimento da equipe GSA Viagens.',
      icon: HelpCircle,
      cta: 'Ajuda',
      categoryLabel: 'Atendimento',
      image: '/images/marketplace/submodules/travel/suporte.jpg',
      imageAlt: 'Consultora oferecendo suporte especializado em viagens',
      auth: false,
      path: routes.marketplace.travelPackages.suporte(),
      color: 'neutral'
    },
  ];

  const visibleCards = clientId ? cards : cards.filter(card => !card.auth);

  const getAccentColor = (color: string) => {
    switch (color) {
      case 'blue': return '#2563eb';
      case 'sky': return '#0284c7';
      case 'emerald': return '#059669';
      case 'amber': return '#d97706';
      case 'indigo': return '#4f46e5';
      case 'rose': return '#e11d48';
      case 'purple': return '#7c3aed';
      default: return '#0c2340';
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#f4f1ea] flex flex-col font-sans">
      <nav className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#f4f1ea]/80 backdrop-blur-xl shrink-0">
        <div className="max-w-7xl mx-auto px-5 flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <button
              onClick={onBackToMarketplace}
              className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-[#1a1a1a] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Voltar ao Marketplace</span>
            </button>
            <div className="h-5 w-px bg-black/10" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0c2340]">
                <Plane className="h-4 w-4 text-[#38bdf8]" />
              </div>
              <span className="text-sm font-black tracking-tight text-[#0c2340]">GSA Viagens</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {!clientId ? (
              <button 
                onClick={onRequireAuth}
                className="px-4 py-2 rounded-lg bg-[#0c2340] text-white text-sm font-bold hover:bg-[#134e78] transition-colors"
              >
                Entrar
              </button>
            ) : (
              <button
                onClick={() => navigate(routes.client.dashboard())}
                className="px-4 py-2 rounded-lg bg-white border border-black/10 text-sm font-bold text-[#1a1a1a] hover:bg-neutral-50 transition-colors"
              >
                Portal do Cliente
              </button>
            )}
          </div>
        </div>
      </nav>

      <div className="flex-1 flex flex-col py-10 sm:py-16">
        <div className="max-w-7xl mx-auto px-5 w-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 text-center sm:text-left"
          >
            <h1 className="text-4xl sm:text-5xl font-black text-[#0c2340] tracking-tight mb-3" style={{ fontFamily: '"Cinzel", serif', fontWeight: 700 }}>
              Bem-vindo ao GSA Viagens
            </h1>
            <p className="text-lg text-neutral-600 max-w-2xl mx-auto sm:mx-0">
              Sua boutique digital de viagens. Ofertas selecionadas e atendimento exclusivo para as melhores experiências pelo mundo.
            </p>
          </motion.div>

          <div className="mx-auto grid w-full grid-cols-1 gap-4 px-2 sm:grid-cols-2 md:gap-5 md:px-0 lg:grid-cols-4">
            {visibleCards.map((card, i) => (
              <MarketplaceSubmoduleCard
                key={card.id}
                icon={card.icon}
                title={card.title}
                description={card.desc}
                actionLabel={card.cta}
                image={card.image}
                imageAlt={card.imageAlt}
                categoryLabel={card.categoryLabel}
                onClick={() => handleNav(card.path, card.auth)}
                accentColor={getAccentColor(card.color)}
                index={i}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
