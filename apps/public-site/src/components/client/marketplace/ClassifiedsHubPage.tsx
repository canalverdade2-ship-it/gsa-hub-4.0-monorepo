import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { 
  ArrowLeft, Tags, Building2, Car, Boxes, Clock, 
  Sparkles, MessageCircle, Mail, ShoppingBag, Search, Shield, 
  TrendingUp, User, LogIn, ChevronRight, PlusCircle, CheckCircle2 
} from 'lucide-react';
import { LogoGSA } from '../../ui/LogoGSA';
import { navigate } from '../../../routing/navigationService';
import { routes } from '../../../routing/routeCatalog';
import { MarketplaceSubmoduleCard } from './MarketplaceSubmoduleCard';

interface ClassifiedsHubPageProps {
  onBack: () => void;
  isPublic?: boolean;
}

const categories = [
  {
    id: 'imoveis',
    icon: Building2,
    title: 'Imóveis',
    sub: 'Casas, apartamentos, terrenos e salas comerciais.',
    categoryLabel: 'Imobiliário',
    image: '/images/marketplace/submodules/classifieds/imoveis.jpg',
    imageAlt: 'Interior contemporâneo de um imóvel disponível para negociação',
    gradient: 'from-[#1a1a1a] via-[#2d2411] to-[#3d2e0a]',
    accentColor: '#e8a838',
    color: 'amber',
    route: routes.marketplace.classifieds.imoveis()
  },
  {
    id: 'veiculos',
    icon: Car,
    title: 'Veículos',
    sub: 'Carros, motos, utilitários e outros veículos.',
    categoryLabel: 'Automotivo',
    image: '/images/marketplace/submodules/classifieds/veiculos.jpg',
    imageAlt: 'Veículo moderno apresentado em ambiente residencial',
    gradient: 'from-[#1a1a1a] via-[#2a1f0a] to-[#3c2a08]',
    accentColor: '#f59e0b',
    color: 'sky',
    route: routes.marketplace.classifieds.veiculos()
  },
  {
    id: 'geral',
    icon: Boxes,
    title: 'Geral',
    sub: 'Produtos, equipamentos e oportunidades diversas.',
    categoryLabel: 'Marketplace',
    image: '/images/marketplace/submodules/classifieds/geral.jpg',
    imageAlt: 'Produtos e equipamentos organizados para compra e venda',
    gradient: 'from-[#1a1a1a] via-[#2d2d2d] to-[#3d3027]',
    accentColor: '#fbbf24',
    color: 'emerald',
    route: routes.marketplace.classifieds.geral()
  },
];

const WHATSAPP_NUMBER = '5511920857756';
const CONTACT_EMAIL = 'gsa.doc.adm@gmail.com';

export function ClassifiedsHubPage({ onBack, isPublic = false }: ClassifiedsHubPageProps) {
  const headerRef = useRef(null);
  const headerInView = useInView(headerRef, { once: true });

  const handleRequireAuth = (actionRoute: string) => {
    if (isPublic) {
      const returnTo = encodeURIComponent(actionRoute);
      navigate(`${routes.login.personal()}?returnTo=${returnTo}`);
    } else {
      navigate(actionRoute);
    }
  };

  return (
    <div className="bg-[#f4f1ea] min-h-screen font-sans text-neutral-900">
      
      {/* ─── NAVBAR EXCLUSIVA CLASSIFICADOS ──────────────── */}
      <nav className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#f4f1ea]/80 backdrop-blur-xl shrink-0">
        <div className="max-w-7xl mx-auto px-5 flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-[#1a1a1a] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Voltar ao Marketplace</span>
            </button>
            <div className="h-5 w-px bg-black/10 hidden sm:block" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1a1a1a]">
                <Tags className="h-4 w-4 text-[#e8a838]" />
              </div>
              <span className="text-sm font-black tracking-tight text-[#1a1a1a] hidden sm:inline">
                GSA Classificados
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input 
                type="text" 
                placeholder="Buscar anúncios..." 
                className="pl-9 pr-4 py-2 w-64 bg-white/50 border border-black/5 rounded-full text-sm outline-none focus:ring-2 focus:ring-[#e8a838]/30 transition-all"
              />
            </div>

            {isPublic ? (
              <button 
                onClick={() => handleRequireAuth(routes.marketplace.classifieds.root())}
                className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] text-[#e8a838] rounded-full text-sm font-bold hover:bg-black transition-colors"
              >
                <LogIn className="h-4 w-4" />
                <span>Entrar</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => navigate(routes.marketplace.classifieds.meusAnuncios())}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white text-neutral-700 border border-black/5 rounded-full text-sm font-bold hover:bg-neutral-50 transition-colors"
                >
                  <Tags className="h-4 w-4" />
                  <span>Meus Anúncios</span>
                </button>
                <button 
                  onClick={() => navigate(routes.marketplace.classifieds.negociacoes())}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] text-[#e8a838] rounded-full text-sm font-bold hover:bg-black transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Negociações</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ─── HERO SECTION ────────────────────── */}
      <section className="relative overflow-hidden bg-[#0a0a0a]">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=2200&q=80"
            alt=""
            className="h-full w-full object-cover opacity-15"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/85 to-[#0a0a0a]/60" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />
        </div>

        <div className="relative max-w-7xl mx-auto px-5 pt-16 pb-20 md:pt-24 md:pb-32">
          <motion.div
            ref={headerRef}
            initial={{ opacity: 0, y: 30 }}
            animate={headerInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-3xl"
          >
            <div className="mb-4 sm:mb-6 inline-flex flex-col w-full">
              <span className="text-[#e8a838] font-black tracking-[0.2em] uppercase text-xs sm:text-sm mb-4 flex items-center gap-2">
                <Shield className="h-4 w-4" /> Negociações Seguras
              </span>
              <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-white tracking-tighter leading-[1.1] mb-6">
                Compre e anuncie com <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#e8a838] to-[#fbbf24]">intermediação da GSA</span>
              </h1>
              <p className="text-lg sm:text-xl text-neutral-400 font-medium leading-relaxed max-w-2xl mb-10">
                O Marketplace definitivo para negócios de alto padrão. 
                Nós cuidamos da mediação, segurança e burocracia para você.
              </p>
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <button 
                  onClick={() => handleRequireAuth(routes.marketplace.classifieds.anunciar())}
                  className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#e8a838] to-[#fbbf24] text-black rounded-full font-black uppercase tracking-wider hover:scale-105 transition-transform"
                >
                  <PlusCircle className="h-5 w-5" /> Anunciar Agora
                </button>
                <button 
                  onClick={() => document.getElementById('categorias')?.scrollIntoView({ behavior: 'smooth' })}
                  className="flex items-center gap-2 px-8 py-4 bg-white/10 text-white border border-white/20 rounded-full font-bold hover:bg-white/20 transition-colors"
                >
                  Explorar Anúncios
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── CATEGORY CARDS ───────────────────── */}
      <section id="categorias" className="py-20 max-w-7xl mx-auto px-5">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="text-3xl font-black text-[#1a1a1a] tracking-tight mb-2">
              Explore nossas categorias
            </h2>
            <p className="text-neutral-500 font-medium">Encontre exatamente o que procura nas seções abaixo.</p>
          </div>
        </div>

        <div className="mx-auto grid w-full grid-cols-1 gap-4 px-2 sm:grid-cols-2 md:grid-cols-3 md:gap-5 md:px-0">
          {categories.map((cat, i) => (
            <MarketplaceSubmoduleCard
              key={cat.id}
              icon={cat.icon}
              title={cat.title}
              description={cat.sub}
              actionLabel="Ver anúncios"
              image={cat.image}
              imageAlt={cat.imageAlt}
              categoryLabel={cat.categoryLabel}
              onClick={() => navigate(cat.route)}
              accentColor={cat.accentColor}
              index={i}
            />
          ))}
        </div>
      </section>

      {/* ─── COMO FUNCIONA E SEGURANÇA ───────────────────── */}
      <section className="py-24 bg-white border-y border-black/5">
        <div className="max-w-7xl mx-auto px-5">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-[#e8a838] font-black tracking-[0.2em] uppercase text-xs mb-4 block">Segurança em Primeiro Lugar</span>
              <h2 className="text-4xl font-black text-[#1a1a1a] tracking-tight mb-6 leading-tight">
                Intermediação especializada em todo o processo
              </h2>
              <div className="space-y-6">
                {[
                  { title: 'Sem Contato Direto Exposto', desc: 'Sua privacidade é garantida. Toda a conversa passa por nossa moderação para evitar fraudes.' },
                  { title: 'Pagamento Direto', desc: 'O valor principal vai direto para o vendedor, sem bloqueios desnecessários. A GSA cobra apenas a comissão.' },
                  { title: 'Suporte Ativo', desc: 'Nossa equipe acompanha cada etapa, desde a proposta até a confirmação de recebimento ou entrega da chave.' }
                ].map((item, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a1a1a]">
                      <CheckCircle2 className="h-4 w-4 text-[#e8a838]" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-neutral-900 mb-1">{item.title}</h4>
                      <p className="text-neutral-500 font-medium leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative rounded-[2rem] overflow-hidden shadow-2xl bg-neutral-100 p-8">
              <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] to-[#2d2411]" />
              <div className="relative z-10 flex flex-col h-full justify-center">
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-white/60 text-sm font-semibold">Proposta de Compra</span>
                    <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 text-xs font-bold rounded-md">Em análise</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-white/20 animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-2/3 bg-white/20 rounded-md animate-pulse" />
                      <div className="h-3 w-1/3 bg-white/10 rounded-md animate-pulse" />
                    </div>
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 ml-8">
                  <div className="flex items-center gap-3 mb-2">
                    <Shield className="h-5 w-5 text-emerald-400" />
                    <span className="text-emerald-400 text-sm font-bold">Intermediação GSA</span>
                  </div>
                  <p className="text-white/80 text-sm">"Olá, recebemos uma proposta para o seu anúncio. Confirme o valor e as condições."</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA FINAL ────────────────────────────── */}
      <section className="py-24 max-w-5xl mx-auto px-5 text-center">
        <h2 className="text-4xl font-black text-[#1a1a1a] tracking-tight mb-6">
          Pronto para fazer bons negócios?
        </h2>
        <p className="text-xl text-neutral-500 font-medium mb-10">
          Junte-se a milhares de usuários no ecossistema GSA.
        </p>
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
          <button 
            onClick={() => handleRequireAuth(routes.marketplace.classifieds.anunciar())}
            className="flex items-center gap-2 px-8 py-4 bg-[#1a1a1a] text-[#e8a838] rounded-full font-black uppercase tracking-wider hover:scale-105 transition-transform w-full sm:w-auto justify-center"
          >
            Quero Anunciar
          </button>
          <button 
            onClick={() => document.getElementById('categorias')?.scrollIntoView({ behavior: 'smooth' })}
            className="flex items-center gap-2 px-8 py-4 bg-white text-neutral-800 border-2 border-neutral-200 rounded-full font-bold hover:bg-neutral-50 transition-colors w-full sm:w-auto justify-center"
          >
            Buscar Oportunidades
          </button>
        </div>
      </section>

      {/* ─── FOOTER ────────────────────────────── */}
      <footer className="border-t border-black/10 bg-[#0a0a0a] text-white py-14">
        <div className="max-w-7xl mx-auto px-5">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_0.9fr_1fr] text-left">
            <div>
              <LogoGSA size="xl" variant="light" />
              <p className="mt-6 max-w-md text-sm leading-7 text-white/60">
                O GSA Classificados é uma plataforma premium com intermediação de ponta a ponta, garantindo segurança e transparência em suas transações.
              </p>
            </div>
            <div>
              <h4 className="mb-5 text-xs font-black uppercase tracking-[0.22em] text-white/40">Navegação</h4>
              <ul className="space-y-3 text-sm font-bold text-white/70">
                <li><button onClick={() => navigate(routes.marketplace.classifieds.imoveis())} className="hover:text-[#e8a838] transition-colors">Imóveis</button></li>
                <li><button onClick={() => navigate(routes.marketplace.classifieds.veiculos())} className="hover:text-[#e8a838] transition-colors">Veículos</button></li>
                <li><button onClick={() => navigate(routes.marketplace.classifieds.geral())} className="hover:text-[#e8a838] transition-colors">Geral</button></li>
                <li><button onClick={() => handleRequireAuth(routes.marketplace.classifieds.meusAnuncios())} className="hover:text-[#e8a838] transition-colors">Meus Anúncios</button></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-5 text-xs font-black uppercase tracking-[0.22em] text-white/40">Suporte GSA</h4>
              <div className="space-y-3">
                <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Olá! Vim pelo Classificados GSA e preciso de ajuda.')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm font-bold text-white/70 hover:text-[#e8a838] transition-colors">
                  <MessageCircle className="h-5 w-5" /> WhatsApp
                </a>
                <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-center gap-3 text-sm font-bold text-white/70 hover:text-[#e8a838] transition-colors">
                  <Mail className="h-5 w-5" /> {CONTACT_EMAIL}
                </a>
              </div>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-7 sm:flex-row text-xs font-semibold text-white/40">
            <p>© {new Date().getFullYear()} Grupo GSA · Classificados. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
