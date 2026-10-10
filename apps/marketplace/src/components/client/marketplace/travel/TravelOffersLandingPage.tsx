import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { ArrowLeft, ArrowRight, Plane, MapPin, Globe, Luggage, MessageCircle, Mail } from 'lucide-react';
import { LogoGSA } from '../../../ui/LogoGSA';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';

interface TravelOffersLandingPageProps {
  onBack: () => void;
  isPublic?: boolean;
}

const categories = [
  {
    id: 'nacionais',
    icon: MapPin,
    title: 'Destinos Nacionais',
    sub: 'Praias, serras, resorts e muito mais pelo Brasil',
    label: 'Brasil',
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=85',
    imageAlt: 'Praia brasileira com mar azul e areia clara',
    accent: '#0d7a71',
    path: routes.marketplace.travelPackages.ofertasNacionais()
  },
  {
    id: 'internacionais',
    icon: Globe,
    title: 'Destinos Internacionais',
    sub: 'Américas, Europa, Ásia e Oceania com condições especiais',
    label: 'Exterior',
    image: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1200&q=85',
    imageAlt: 'Vista urbana de Paris durante uma viagem internacional',
    accent: '#38bdf8',
    path: routes.marketplace.travelPackages.ofertasInternacionais()
  },
  {
    id: 'excursoes',
    icon: Luggage,
    title: 'Promoções Exclusivas',
    sub: 'Pacotes com descontos especiais e por tempo limitado',
    label: 'Ofertas',
    image: '/images/promocoes_exclusivas_cover.jpg',
    imageAlt: 'Resort de luxo em promoção',
    accent: '#065a82',
    path: routes.marketplace.travelPackages.ofertasExcursoes()
  },
];

const WHATSAPP_NUMBER = '5511920857756';
const CONTACT_EMAIL = 'gsa.doc.adm@gmail.com';

export function TravelOffersLandingPage({ onBack, isPublic = false }: TravelOffersLandingPageProps) {
  const headerRef = useRef(null);
  const headerInView = useInView(headerRef, { once: true });

  return (
    <div className="bg-[#f4f1ea] font-sans flex flex-col min-h-screen">
      <nav className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#f4f1ea]/80 backdrop-blur-xl shrink-0">
        <div className="max-w-7xl mx-auto px-5 flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-[#1a1a1a] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Voltar</span>
            </button>
            <div className="h-5 w-px bg-black/10" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0c2340]">
                <Plane className="h-4 w-4 text-[#38bdf8]" />
              </div>
              <span className="text-sm font-black tracking-tight text-[#0c2340]">Explorar Ofertas</span>
            </div>
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden bg-[#0c2340]">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=2200&q=80"
            alt=""
            className="h-full w-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0c2340] via-[#0c2340]/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c2340] to-transparent opacity-80" />
        </div>

        <div className="relative max-w-7xl mx-auto px-5 py-24 sm:py-32">
          <motion.div
            ref={headerRef}
            initial={{ opacity: 0, y: 30 }}
            animate={headerInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="max-w-3xl"
          >
            <h1 className="text-5xl sm:text-7xl font-black text-white tracking-tight leading-[1.1] mb-6" style={{ fontFamily: '"Cinzel", serif', fontWeight: 700 }}>
              Viaje mais,<br />
              <span className="text-[#38bdf8]">pagando menos.</span>
            </h1>
            <p className="text-xl sm:text-2xl text-white/80 font-medium mb-10 max-w-xl">
              Ofertas selecionadas pela GSA para você ter a melhor experiência pelo mundo.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <button 
                onClick={() => {
                  const el = document.getElementById('categorias');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full sm:w-auto px-8 py-4 rounded-full bg-[#38bdf8] text-[#0c2340] font-black hover:bg-[#7dd3fc] transition-colors flex items-center justify-center gap-2"
              >
                Ver ofertas
              </button>
              <button 
                onClick={() => navigate(routes.marketplace.travelPackages.orcamento())}
                className="w-full sm:w-auto px-8 py-4 rounded-full bg-white/10 backdrop-blur-md text-white font-black hover:bg-white/20 transition-colors border border-white/20 flex items-center justify-center gap-2"
              >
                Monte sua viagem
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      <section id="categorias" className="flex-1 py-10 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-5">
          <div className="mb-7 sm:mb-10 lg:mb-12">
            <h2 className="text-2xl font-black text-[#0c2340] sm:text-3xl">Escolha seu destino</h2>
            <p className="mt-2 text-sm text-neutral-500 sm:text-base">Navegue pelas nossas curadorias especiais</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
            {categories.map((cat, i) => {
              const Icon = cat.icon;
              return (
                <motion.button
                  key={cat.id}
                  onClick={() => navigate(cat.path)}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="group grid min-h-[168px] grid-cols-[112px_minmax(0,1fr)] overflow-hidden rounded-lg border border-neutral-200 bg-white text-left shadow-[0_8px_24px_rgba(12,35,64,0.06)] transition-all duration-300 hover:border-[#0c2340]/25 hover:shadow-[0_16px_36px_rgba(12,35,64,0.12)] md:block md:min-h-[350px]"
                >
                  <div className="relative min-h-full overflow-hidden bg-neutral-100 md:h-44 md:min-h-0 lg:h-48">
                    <img
                      src={cat.image}
                      alt={cat.imageAlt}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                    <span className="absolute left-3 top-3 hidden rounded-md bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0c2340] shadow-sm md:inline-flex">
                      {cat.label}
                    </span>
                  </div>

                  <div className="flex min-w-0 flex-col justify-between p-4 md:min-h-[174px] md:p-6 lg:min-h-[190px]">
                    <div>
                      <div className="mb-3 flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#f1f5f8]">
                          <Icon className="h-4 w-4" style={{ color: cat.accent }} />
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-500 md:hidden">{cat.label}</span>
                      </div>
                      <h3 className="text-base font-black leading-tight text-[#0c2340] sm:text-lg lg:text-xl">{cat.title}</h3>
                      <p className="mt-2 text-xs font-medium leading-5 text-neutral-500 md:text-sm">{cat.sub}</p>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3 md:mt-5 md:pt-4">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0c2340] md:text-xs">Ver ofertas</span>
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#0c2340] text-white transition-colors group-hover:bg-[#134e78] md:h-8 md:w-8">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-white py-20 border-t border-black/5">
        <div className="max-w-7xl mx-auto px-5 text-center">
          <h2 className="text-3xl font-black text-[#0c2340] mb-4">Como Funciona</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mt-12">
            <div className="flex flex-col items-center text-center">
              <div className="h-16 w-16 bg-[#f4f1ea] rounded-full flex items-center justify-center text-2xl font-black text-[#38bdf8] mb-4">1</div>
              <h4 className="text-xl font-bold text-[#0c2340] mb-2">Escolha ou Solicite</h4>
              <p className="text-neutral-500">Navegue pelas ofertas ou monte sua viagem sob medida.</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="h-16 w-16 bg-[#f4f1ea] rounded-full flex items-center justify-center text-2xl font-black text-[#38bdf8] mb-4">2</div>
              <h4 className="text-xl font-bold text-[#0c2340] mb-2">Receba a Proposta</h4>
              <p className="text-neutral-500">Nós confirmamos a disponibilidade e enviamos os valores exatos.</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="h-16 w-16 bg-[#f4f1ea] rounded-full flex items-center justify-center text-2xl font-black text-[#38bdf8] mb-4">3</div>
              <h4 className="text-xl font-bold text-[#0c2340] mb-2">Checkout Seguro</h4>
              <p className="text-neutral-500">Pagamento pelo nosso checkout apenas quando tudo estiver garantido.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER PÚBLICO */}
      {isPublic && (
        <footer className="border-t border-white/10 bg-[#0c2340] text-white py-14 mt-auto">
          <div className="max-w-7xl mx-auto px-5">
            <div className="grid gap-10 lg:grid-cols-[1.4fr_0.9fr_1fr] text-left">
              <div>
                <LogoGSA size="xl" variant="light" />
                <p className="mt-6 max-w-md text-sm leading-7 text-white/60">
                  Comercializado e atendido pela GSA Viagens. Determinados serviços turísticos são executados por fornecedores parceiros credenciados.
                </p>
              </div>
              <div>
                <h4 className="mb-5 text-xs font-black uppercase tracking-[0.22em] text-[#38bdf8]">Menu</h4>
                <ul className="space-y-3 text-sm font-bold text-white/70">
                  <li><button onClick={() => navigate(routes.public.home())} className="hover:text-white transition-colors">Voltar ao GSA Hub</button></li>
                  <li><button onClick={() => navigate(routes.marketplace.travelPackages.ofertasNacionais())} className="hover:text-white transition-colors">Nacionais</button></li>
                  <li><button onClick={() => navigate(routes.marketplace.travelPackages.ofertasInternacionais())} className="hover:text-white transition-colors">Internacionais</button></li>
                  <li><button onClick={() => navigate(routes.marketplace.travelPackages.ofertasExcursoes())} className="hover:text-white transition-colors">Excursões</button></li>
                </ul>
              </div>
              <div>
                <h4 className="mb-5 text-xs font-black uppercase tracking-[0.22em] text-[#38bdf8]">Atendimento</h4>
                <div className="space-y-3">
                  <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm font-bold text-white/70 hover:text-white transition-colors">
                    <MessageCircle className="h-5 w-5" /> WhatsApp
                  </a>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-center gap-3 text-sm font-bold text-white/70 hover:text-white transition-colors">
                    <Mail className="h-5 w-5" /> {CONTACT_EMAIL}
                  </a>
                </div>
              </div>
            </div>
            <div className="mt-10 pt-7 border-t border-white/10 text-xs font-semibold text-white/40 text-center sm:text-left">
              © {new Date().getFullYear()} Grupo GSA · Viagens. Todos os direitos reservados.
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
