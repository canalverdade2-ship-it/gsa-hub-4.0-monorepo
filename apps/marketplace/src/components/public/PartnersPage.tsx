import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Clock3,
  ExternalLink,
  Globe2,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
  Gift,
  Sparkles,
  Zap,
  Award,
  CheckCircle2
} from 'lucide-react';
import { getPublicPartner, listPublicPartners } from '../../features/partners/service';
import { PARTNER_MODE_LABELS, type Partner } from '../../features/partners/types';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import { LogoGSA } from '../ui/LogoGSA';
import { HomeLogoLink } from '../ui/HomeLogoLink';
import { PartnerApplicationModal } from './PartnerApplicationModal';
import { PartnerBenefitRedeemModal } from './PartnerBenefitRedeemModal';
import '../../partners.css';

import { motion } from 'framer-motion';

interface PartnersPageProps {
  selectedSlug?: string;
  onSelectPartner: (slug: string | null) => void;
  onBack: () => void;
}

const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 48 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.18 },
  transition: { duration: 0.85, delay, ease: [0.16, 1, 0.3, 1] as const },
});

function safeExternalUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function buildAddress(partner: Partner): string {
  return [
    [partner.street, partner.number].filter(Boolean).join(', '),
    partner.complement,
    partner.neighborhood,
    [partner.city, partner.state].filter(Boolean).join(' - '),
    partner.zip_code,
  ].filter(Boolean).join(' · ');
}

function locationLabel(partner: Partner): string {
  return [partner.city, partner.state].filter(Boolean).join(' — ');
}

function PartnerVisual({ partner, detail = false }: { partner: Partner; detail?: boolean }) {
  // No quadradinho/cards de entrada: exibe o logotipo da empresa (logo_url)
  // Na página interna detalhada do parceiro: exibe a imagem de capa da parceria (cover_url)
  const image = detail
    ? (partner.cover_url || partner.logo_url)
    : (partner.logo_url || partner.cover_url);

  const isCover = detail && Boolean(partner.cover_url);

  return (
    <div className={`partner-visual ${detail ? 'partner-visual--detail' : ''}`}>
      {image ? (
        <img
          src={image}
          alt={isCover ? `Imagem da parceria com ${partner.name}` : `Logotipo de ${partner.name}`}
          className={detail ? 'partner-visual__detail-image' : (isCover ? 'partner-visual__cover' : 'partner-visual__logo-only')}
          loading={detail ? 'eager' : 'lazy'}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="partner-visual__fallback" aria-hidden="true">
          <Building2 />
          <span>{partner.name.slice(0, 2).toUpperCase()}</span>
        </div>
      )}

      {partner.featured && !detail && (
        <span className="partner-featured-label">
          <ShieldCheck aria-hidden="true" />
          Seleção GSA
        </span>
      )}
    </div>
  );
}

function HeroPartnerCard({ partner, position, onOpen }: { key?: string | number; partner: Partner; position: number; onOpen: () => void }) {
  const logo = partner.logo_url || partner.cover_url;

  return (
    <button type="button" onClick={onOpen} className="partners-hero-card">
      <span className="partners-hero-card__number">{String(position).padStart(2, '0')}</span>
      <span className="partners-hero-card__visual">
        {logo ? (
          <img
            src={logo}
            alt={`Logotipo de ${partner.name}`}
            className="is-logo"
            loading={position === 1 ? 'eager' : 'lazy'}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="partners-hero-card__fallback" aria-hidden="true">{partner.name.slice(0, 2).toUpperCase()}</span>
        )}
      </span>
      <span className="partners-hero-card__copy">
        <small>{partner.category}</small>
        <strong>{partner.name}</strong>
        <span>{locationLabel(partner) || PARTNER_MODE_LABELS[partner.service_mode]}</span>
      </span>
      <ArrowRight aria-hidden="true" />
    </button>
  );
}

export function PartnersPage({ selectedSlug, onSelectPartner, onBack }: PartnersPageProps) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [redeemPartner, setRedeemPartner] = useState<Partner | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useRealtimeSubscription({
    table: 'parceiros',
    onChange: () => setReloadKey((k) => k + 1),
    debounceMs: 300,
  });

  useEffect(() => {
    document.body.classList.add('gsa-public-partners');
    return () => document.body.classList.remove('gsa-public-partners');
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [selectedSlug]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);

    const load = async () => {
      try {
        if (selectedSlug) {
          const partner = await getPublicPartner(selectedSlug);
          if (!cancelled) {
            setSelectedPartner(partner);
            setPartners([]);
          }
        } else {
          const rows = await listPublicPartners();
          if (!cancelled) {
            setPartners(rows);
            setSelectedPartner(null);
          }
        }
      } catch (error) {
        console.error('Erro ao carregar parceiros:', error);
        if (!cancelled) {
          setPartners([]);
          setSelectedPartner(null);
          setLoadError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [reloadKey, selectedSlug]);

  const categories = useMemo(() => [
    'Todas',
    ...Array.from(new Set<string>(partners.map((partner) => partner.category).filter((item): item is string => Boolean(item)))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ], [partners]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return partners.filter((partner) => {
      const matchesCategory = category === 'Todas' || partner.category === category;
      const haystack = [
        partner.name,
        partner.category,
        partner.short_description,
        partner.city,
        partner.state,
        ...(partner.services || []),
        ...(partner.products || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR');
      return matchesCategory && (!term || haystack.includes(term));
    });
  }, [category, partners, search]);

  const featuredPartners = useMemo(() => filtered.filter((partner) => partner.featured), [filtered]);
  const regularPartners = useMemo(() => filtered.filter((partner) => !partner.featured), [filtered]);
  const heroPartners = useMemo(() => {
    const featured = partners.filter((partner) => partner.featured);
    const remaining = partners.filter((partner) => !partner.featured);
    return [...featured, ...remaining].slice(0, 3);
  }, [partners]);

  if (selectedSlug) {
    if (loading) return <PartnersLoading detail />;

    if (loadError) {
      return (
        <PartnersFailure
          title="Não foi possível carregar este perfil"
          description="A conexão com o diretório de parceiros falhou. Tente novamente ou retorne para a listagem."
          onRetry={() => setReloadKey((current) => current + 1)}
          onBack={() => onSelectPartner(null)}
        />
      );
    }

    if (!selectedPartner) {
      return (
        <main className="partners-page partners-state-page">
          <div className="partners-state-panel">
            <Building2 aria-hidden="true" />
            <p className="partners-kicker">Diretório institucional</p>
            <h1>Parceiro não encontrado</h1>
            <p>Este perfil não está disponível ou deixou de fazer parte da área pública.</p>
            <button type="button" onClick={() => onSelectPartner(null)} className="partner-primary-button">
              <ArrowLeft aria-hidden="true" />
              Voltar aos parceiros
            </button>
          </div>
        </main>
      );
    }

    return (
      <>
        <PartnerDetail 
          partner={selectedPartner} 
          onBack={() => onSelectPartner(null)} 
          onRedeem={setRedeemPartner} 
        />
        <PartnerBenefitRedeemModal 
          partner={redeemPartner} 
          open={Boolean(redeemPartner)} 
          onClose={() => setRedeemPartner(null)} 
        />
      </>
    );
  }

  return (
    <>
      <main className="partners-page partners-listing-page">
        <header className="partners-topbar">
          <div className="partners-container partners-topbar__inner">
            <button type="button" onClick={onBack} className="partners-topbar__back">
              <ArrowLeft aria-hidden="true" />
              Voltar ao site
            </button>
            <HomeLogoLink><LogoGSA size="sm" variant="dark" showText /></HomeLogoLink>
            <button type="button" onClick={() => setApplicationOpen(true)} className="partners-topbar__action">
              Apresentar empresa
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </header>

        <section className="partners-hero" aria-labelledby="partners-hero-title">
          <div className="partners-container partners-hero__layout">
            <div className="partners-hero__copy">
              <p className="partners-kicker">Rede de parceiros GSA HUB</p>
              <h1 id="partners-hero-title">Capacidade empresarial conectada a uma rede de confiança.</h1>
              <p className="partners-hero__lead">
                Reunimos empresas, profissionais e organizações com atuação comprovável para ampliar o acesso dos clientes GSA a especialidades, soluções e canais de atendimento qualificados.
              </p>

              <div className="partners-hero__actions">
                <a href="#diretorio-parceiros" className="partner-primary-button">
                  Explorar o diretório
                  <ArrowRight aria-hidden="true" />
                </a>
                <button type="button" onClick={() => setApplicationOpen(true)} className="partner-secondary-button">
                  Seja nosso parceiro
                </button>
              </div>

              <div className="partners-hero__assurance" aria-label="Compromissos da rede">
                <span><ShieldCheck aria-hidden="true" />Curadoria administrativa</span>
                <span><Check aria-hidden="true" />Informações publicadas após análise</span>
                <span><Users aria-hidden="true" />Contato direto com cada parceiro</span>
              </div>
            </div>

            <aside className="partners-hero-showcase" aria-label="Parceiros em evidência">
              <div className="partners-hero-showcase__heading">
                <span>Seleção da rede</span>
                <strong>Empresas em evidência</strong>
              </div>

              {loading ? (
                <div className="partners-hero-showcase__loading" role="status">
                  <span /><span /><span />
                  <span className="sr-only">Carregando parceiros em evidência</span>
                </div>
              ) : heroPartners.length > 0 ? (
                <div className="partners-hero-showcase__list">
                  {heroPartners.map((partner, index) => (
                    <HeroPartnerCard
                      key={partner.id}
                      partner={partner}
                      position={index + 1}
                      onOpen={() => onSelectPartner(partner.slug)}
                    />
                  ))}
                </div>
              ) : (
                <div className="partners-hero-showcase__empty">
                  <Building2 aria-hidden="true" />
                  <strong>Rede em atualização</strong>
                  <p>Os perfis aprovados serão apresentados aqui.</p>
                </div>
              )}

              <div className="partners-hero-showcase__footer">
                <span>Diretório público institucional</span>
                <a href="#diretorio-parceiros">Ver rede completa</a>
              </div>
            </aside>
          </div>
        </section>

        <section className="partners-manifesto" aria-label="Princípios da Rede de Parceiros">
          <div className="partners-container partners-manifesto__layout">
            <p className="partners-manifesto__statement">
              Uma rede de alto padrão não é construída por volume. É construída por aderência, clareza e responsabilidade.
            </p>
            <div className="partners-manifesto__principles">
              <article><span>01</span><div><strong>Atuação identificada</strong><p>Empresa, responsável e canais públicos apresentados de forma verificável.</p></div></article>
              <article><span>02</span><div><strong>Especialidade declarada</strong><p>Serviços, produtos e regiões descritos com objetividade.</p></div></article>
              <article><span>03</span><div><strong>Publicação controlada</strong><p>O perfil só integra a página após avaliação administrativa.</p></div></article>
            </div>
          </div>
        </section>

        <section id="diretorio-parceiros" className="partners-directory" aria-labelledby="partners-directory-title">
          <div className="partners-container">
            <header className="partners-section-heading">
              <div>
                <p className="partners-kicker partners-kicker--dark">Diretório institucional</p>
                <h2 id="partners-directory-title">Encontre capacidade complementar para a sua necessidade.</h2>
              </div>
              <p>Pesquise por empresa, especialidade, produto ou localidade. Cada perfil reúne somente as informações autorizadas para publicação na rede GSA HUB.</p>
            </header>

            <div className="partners-directory-shell">
              <aside className="partners-filter-panel" aria-label="Filtros do diretório">
                <div className="partners-filter-panel__heading">
                  <span>Consulta da rede</span>
                  <strong>Refine sua busca</strong>
                </div>

                <label className="partners-search">
                  <span>O que você procura?</span>
                  <div>
                    <Search aria-hidden="true" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Empresa, serviço ou cidade" />
                    {search && <button type="button" onClick={() => setSearch('')} aria-label="Limpar pesquisa"><X aria-hidden="true" /></button>}
                  </div>
                </label>

                <label className="partners-category-select">
                  <span>Área de atuação</span>
                  <select value={category} onChange={(event) => setCategory(event.target.value)}>
                    {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>

                <div className="partners-category-tabs" role="group" aria-label="Filtrar por categoria">
                  {categories.map((item) => (
                    <button key={item} type="button" onClick={() => setCategory(item)} aria-pressed={category === item} className={category === item ? 'is-active' : ''}>
                      <span>{item}</span>
                      <ArrowRight aria-hidden="true" />
                    </button>
                  ))}
                </div>

                <div className="partners-filter-panel__note">
                  <ShieldCheck aria-hidden="true" />
                  <p>Os dados exibidos pertencem a perfis aprovados para publicação.</p>
                </div>
              </aside>

              <div className="partners-directory-content">
                <div className="partners-results-line">
                  <span>{loading ? 'Atualizando diretório' : `${filtered.length} ${filtered.length === 1 ? 'parceiro disponível' : 'parceiros disponíveis'}`}</span>
                  {(search || category !== 'Todas') && <button type="button" onClick={() => { setSearch(''); setCategory('Todas'); }}>Limpar filtros</button>}
                </div>

                {loading ? (
                  <PartnersLoading compact />
                ) : loadError ? (
                  <PartnersFailure title="O diretório não pôde ser carregado" description="Não foi possível consultar os parceiros neste momento. Nenhum dado foi substituído por conteúdo de exemplo." onRetry={() => setReloadKey((current) => current + 1)} />
                ) : filtered.length === 0 ? (
                  <div className="partners-empty-state">
                    <Search aria-hidden="true" />
                    <h3>Nenhum parceiro corresponde aos filtros</h3>
                    <p>Revise o termo pesquisado ou consulte todas as áreas de atuação.</p>
                    <button type="button" onClick={() => { setSearch(''); setCategory('Todas'); }} className="partner-secondary-button">Mostrar todo o diretório</button>
                  </div>
                ) : (
                  <div className="partners-list">
                    {featuredPartners.map((partner, index) => <PartnerDirectoryItem key={partner.id} partner={partner} index={index + 1} featured onOpen={() => onSelectPartner(partner.slug)} onRedeem={setRedeemPartner} />)}
                    {regularPartners.map((partner, index) => <PartnerDirectoryItem key={partner.id} partner={partner} index={featuredPartners.length + index + 1} onOpen={() => onSelectPartner(partner.slug)} onRedeem={setRedeemPartner} />)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="partners-application" aria-labelledby="partners-application-title">
          <div className="partners-container partners-application__executive">
            <div className="partners-application__eyebrow">
              <span>Expansão da rede</span>
              <strong>GSA HUB · Parcerias institucionais</strong>
            </div>

            <div className="partners-application__copy">
              <h2 id="partners-application-title">Sua empresa tem estrutura para complementar esta rede?</h2>
              <p>Apresente sua atuação, seus canais e sua capacidade de atendimento. A solicitação é enviada diretamente ao painel administrativo para análise e recebe protocolo oficial.</p>
              <button type="button" onClick={() => setApplicationOpen(true)} className="partner-gold-button">
                Apresentar minha empresa
                <ArrowRight aria-hidden="true" />
              </button>
            </div>

            <ol className="partners-application__criteria">
              <li><span>01</span><div><strong>Identificação empresarial</strong><p>Dados cadastrais, responsável e contatos oficiais.</p></div></li>
              <li><span>02</span><div><strong>Capacidade apresentada</strong><p>Serviços, produtos, regiões e materiais institucionais.</p></div></li>
              <li><span>03</span><div><strong>Análise registrada</strong><p>Protocolo, status Em análise e publicação somente após aprovação.</p></div></li>
            </ol>
          </div>
        </section>
      </main>

      <PartnerApplicationModal open={applicationOpen} onClose={() => setApplicationOpen(false)} />
      <PartnerBenefitRedeemModal partner={redeemPartner} open={Boolean(redeemPartner)} onClose={() => setRedeemPartner(null)} />
    </>
  );
}

function PartnerDirectoryItem({ partner, index, featured = false, onOpen, onRedeem }: { key?: string | number; partner: Partner; index: number; featured?: boolean; onOpen: () => void; onRedeem: (partner: Partner) => void }) {
  return (
    <motion.article 
      {...reveal((index - 1) * 0.15)}
      className={`partner-directory-item ${featured ? 'partner-directory-item--featured' : ''}`}
    >
      <div className="partner-directory-item__visual">
        <PartnerVisual partner={partner} />
        <span className="partner-directory-item__index">{String(index).padStart(2, '0')}</span>
      </div>
      <div className="partner-directory-item__content">
        <div className="partner-directory-item__meta">
          <span>{partner.category}</span>
          {locationLabel(partner) && <span><MapPin aria-hidden="true" />{locationLabel(partner)}</span>}
        </div>
        <h3>{partner.name}</h3>
        <p>{partner.short_description}</p>
        <div className="partner-directory-item__services">{(partner.services || []).slice(0, 4).map((service) => <span key={service}><Check aria-hidden="true" />{service}</span>)}</div>
        <div className="partner-directory-item__footer">
          <span>{PARTNER_MODE_LABELS[partner.service_mode]}</span>
          <div className="flex items-center gap-2">
            {partner.benefits && (
              <button 
                type="button" 
                onClick={(e) => { e.stopPropagation(); onRedeem(partner); }} 
                className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-900 bg-amber-100/90 hover:bg-amber-200/90 border border-amber-300 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                <Gift className="h-3.5 w-3.5 text-amber-700" />
                <span>Resgatar Benefício</span>
              </button>
            )}
            <button type="button" onClick={onOpen}>Conhecer parceiro<ArrowRight aria-hidden="true" /></button>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function PartnerDetail({ partner, onBack, onRedeem }: { partner: Partner; onBack: () => void; onRedeem: (partner: Partner) => void }) {
  const address = buildAddress(partner);
  const website = safeExternalUrl(partner.website);
  const instagram = safeExternalUrl(partner.instagram);
  const linkedin = safeExternalUrl(partner.linkedin);
  const maps = safeExternalUrl(partner.maps_url);
  const whatsappDigits = partner.whatsapp?.replace(/\D/g, '');

  const hasContactActions = Boolean(whatsappDigits || partner.phone || partner.email || maps);
  const hasSocial = Boolean(website || instagram || linkedin);
  const hasFacts = Boolean(address || partner.business_hours);
  const hasContactInfo = Boolean(hasContactActions || hasSocial || hasFacts);

  return (
    <main className="partners-page partners-detail-page">
      <section className="partners-detail-hero">
        <div className="partners-container">
          <button type="button" onClick={onBack} className="partner-back-link"><ArrowLeft aria-hidden="true" />Nossos parceiros</button>
          <div className="partners-detail-hero__layout">
            <PartnerVisual partner={partner} detail />
            <div className="partners-detail-hero__copy">
              <p className="partners-kicker">{partner.category}</p>
              <h1>{partner.name}</h1>
              <p>{partner.description || partner.short_description}</p>
              <div className="partners-detail-hero__facts">
                <span><Users aria-hidden="true" />{PARTNER_MODE_LABELS[partner.service_mode]}</span>
                {locationLabel(partner) && <span><MapPin aria-hidden="true" />{locationLabel(partner)}</span>}
                {partner.business_hours && <span><Clock3 aria-hidden="true" />{partner.business_hours}</span>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="partners-detail-content">
        <div className={`partners-container partners-detail-content__layout ${!hasContactInfo ? 'partners-detail-content__layout--full' : ''}`}>
          <div className="partners-detail-main">
            {partner.services.length > 0 && (
              <section className="partner-detail-section">
                <header><span>01</span><div><p>Capacidade de atendimento</p><h2>Serviços e especialidades</h2></div></header>
                <div className="partner-detail-service-list">{partner.services.map((service) => <div key={service}><Check aria-hidden="true" /><span>{service}</span></div>)}</div>
              </section>
            )}
            {partner.products.length > 0 && (
              <section className="partner-detail-section">
                <header><span>02</span><div><p>Portfólio declarado</p><h2>Produtos e soluções</h2></div></header>
                <div className="partner-detail-product-list">{partner.products.map((product) => <span key={product}>{product}</span>)}</div>
              </section>
            )}
            {partner.service_regions.length > 0 && (
              <section className="partner-detail-section">
                <header><span>03</span><div><p>Abrangência</p><h2>Regiões atendidas</h2></div></header>
                <div className="partner-detail-regions">{partner.service_regions.map((region) => <span key={region}><MapPin aria-hidden="true" />{region}</span>)}</div>
              </section>
            )}
            {partner.benefits && (
              <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c131d] via-[#111a26] to-[#080d14] p-6 sm:p-8 text-white shadow-[0_20px_50px_rgba(8,23,38,0.3)] border border-[#e2c98e]/35 my-8">
                {/* Decorative Ambient Lighting & Watermark */}
                <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#e2c98e]/10 blur-3xl pointer-events-none" />
                <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-[#e2c98e]/10 blur-3xl pointer-events-none" />
                <div className="absolute right-4 bottom-4 opacity-5 pointer-events-none select-none">
                  <Gift className="h-48 w-48 text-[#e2c98e]" />
                </div>

                {/* Top Badge & Exclusive Label */}
                <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-white/10">
                  <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#e2c98e]/20 to-[#e2c98e]/5 px-3.5 py-1.5 border border-[#e2c98e]/40 text-[11px] font-black uppercase tracking-wider text-[#f5e7c4] shadow-inner">
                    <Sparkles className="h-3.5 w-3.5 text-[#e2c98e] animate-pulse" />
                    <span>Benefício Exclusivo GSA HUB</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-neutral-300 font-medium">
                    <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>Condição Exclusiva GSA HUB</span>
                  </div>
                </div>

                {/* Main Content Area: Title & Luxury Golden Voucher Box */}
                <div className="relative z-10 my-6 space-y-4">
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Vantagem Especial da Parceria
                  </h2>

                  {/* Golden Ticket / Voucher Box */}
                  <div className="relative rounded-2xl bg-gradient-to-r from-[#e2c98e]/15 via-[#e2c98e]/5 to-transparent p-5 border border-[#e2c98e]/30 backdrop-blur-sm shadow-inner">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#f5e7c4] via-[#e2c98e] to-[#c99738] text-neutral-950 font-black shadow-lg shadow-[#e2c98e]/20">
                        <Gift className="h-6 w-6 text-neutral-950" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#e2c98e]">
                          Condição Especial Concedida:
                        </span>
                        <p className="text-base sm:text-lg font-bold text-neutral-50 leading-relaxed">
                          {partner.benefits}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Micro-benefits & Trust Badges */}
                <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 pb-6 border-b border-white/10 text-neutral-300 text-xs">
                  <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2.5 border border-white/5">
                    <Zap className="h-4 w-4 text-amber-400 shrink-0" />
                    <span className="font-semibold">Resgate 100% Online</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2.5 border border-white/5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="font-semibold">Sem Taxas Adicionais</span>
                  </div>
                  <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2.5 border border-white/5">
                    <Award className="h-4 w-4 text-[#e2c98e] shrink-0" />
                    <span className="font-semibold">Validação Instantânea</span>
                  </div>
                </div>

                {/* Action Footer & High-Converting CTA */}
                <div className="relative z-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-6">
                  <div className="text-xs text-neutral-400 leading-tight">
                    <p className="font-bold text-neutral-200">Pronto para aproveitar este benefício?</p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">Clique para gerar seu cupom ou voucher oficial de associado.</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRedeem(partner)}
                    className="group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-[#f5e7c4] via-[#e2c98e] to-[#c99738] px-8 py-4 text-xs font-black uppercase tracking-wider text-neutral-950 shadow-xl shadow-[#e2c98e]/25 transition-all duration-300 hover:scale-[1.03] hover:shadow-[#e2c98e]/40 active:scale-95 cursor-pointer"
                  >
                    <span className="absolute inset-0 bg-white/20 opacity-0 transition-opacity group-hover:opacity-100" />
                    <Gift className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
                    <span className="font-black text-neutral-950">Resgatar Benefício Agora</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </button>
                </div>
              </section>
            )}
          </div>

          {hasContactInfo && (
            <aside className="partner-contact-panel">
              <p className="partners-kicker">Canais públicos</p>
              <h2>Informações de contato</h2>
              <p className="partner-contact-panel__intro">Fale diretamente com o parceiro pelos dados publicados no cadastro aprovado.</p>
              <div className="partner-contact-panel__facts">
                {address && <div><MapPin aria-hidden="true" /><span>{address}</span></div>}
                {partner.business_hours && <div><Clock3 aria-hidden="true" /><span>{partner.business_hours}</span></div>}
                <div><Users aria-hidden="true" /><span>{PARTNER_MODE_LABELS[partner.service_mode]}</span></div>
              </div>
              {hasContactActions && (
                <div className="partner-contact-panel__actions">
                  {whatsappDigits && <a href={`https://wa.me/${whatsappDigits}?text=${encodeURIComponent(`Olá! Encontrei a ${partner.name} pela página de parceiros da GSA HUB e gostaria de mais informações.`)}`} target="_blank" rel="noopener noreferrer" className="is-primary"><MessageCircle aria-hidden="true" />Conversar pelo WhatsApp</a>}
                  {partner.phone && <a href={`tel:${partner.phone.replace(/[^\d+]/g, '')}`}><Phone aria-hidden="true" />Ligar para o parceiro</a>}
                  {partner.email && <a href={`mailto:${partner.email}`}><Mail aria-hidden="true" />Enviar e-mail</a>}
                  {maps && <a href={maps} target="_blank" rel="noopener noreferrer"><MapPin aria-hidden="true" />Abrir localização<ExternalLink aria-hidden="true" /></a>}
                </div>
              )}
              {hasSocial && (
                <div className="partner-contact-panel__social">
                  <p>Presença digital</p>
                  {website && <SocialLink href={website} label="Site oficial"><Globe2 aria-hidden="true" /></SocialLink>}
                  {instagram && <SocialLink href={instagram} label="Instagram"><Instagram aria-hidden="true" /></SocialLink>}
                  {linkedin && <SocialLink href={linkedin} label="LinkedIn"><Linkedin aria-hidden="true" /></SocialLink>}
                </div>
              )}
            </aside>
          )}
        </div>
      </section>
    </main>
  );
}

function SocialLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}<span>{label}</span><ExternalLink aria-hidden="true" /></a>;
}

function PartnersFailure({ title, description, onRetry, onBack }: { title: string; description: string; onRetry: () => void; onBack?: () => void }) {
  return (
    <div className="partners-failure" role="alert">
      <AlertTriangle aria-hidden="true" />
      <div><h3>{title}</h3><p>{description}</p><div><button type="button" onClick={onRetry} className="partner-primary-button"><RefreshCw aria-hidden="true" />Tentar novamente</button>{onBack && <button type="button" onClick={onBack} className="partner-secondary-button"><ArrowLeft aria-hidden="true" />Voltar</button>}</div></div>
    </div>
  );
}

function PartnersLoading({ compact = false, detail = false }: { compact?: boolean; detail?: boolean }) {
  return (
    <div className={`partners-loading ${compact ? 'partners-loading--compact' : ''} ${detail ? 'partners-loading--detail' : ''}`} role="status">
      <div className="partners-loading__bar" /><div className="partners-loading__body"><span /><span /><span /></div><span className="sr-only">Carregando parceiros</span>
    </div>
  );
}
