import './ProtectionQuote.css';
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  HeartPulse,
  HelpCircle,
  Home,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Umbrella,
  Upload,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { generateUUID } from '../../../../lib/utils';
import { supabase } from '../../../../lib/supabase';
import { callClientRpc } from '../../../../lib/clientRpc';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';
import { MarketplaceSubmoduleCard } from '../MarketplaceSubmoduleCard';

export type ProtectionDomain = 'saude' | 'seguros';

type ProtectionMarketplaceProps = {
  domain: ProtectionDomain;
  submodule?: string;
  itemId?: string;
  clientId?: string;
  onBackToMarketplace: () => void;
  onRequireAuth?: () => void;
};

type Category = {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  categoryLabel: string;
  image: string;
  imageAlt: string;
};

type DomainConfig = {
  label: string;
  eyebrow: string;
  description: string;
  accent: string;
  accentSoft: string;
  dark: string;
  icon: React.ElementType;
  heroImage: string;
  categories: Category[];
};

const configs: Record<ProtectionDomain, DomainConfig> = {
  saude: {
    label: 'GSA Saúde',
    eyebrow: 'Cuidado com orientação humana',
    description: 'Escolha o tipo de atendimento e envie seus dados para receber uma cotação personalizada da equipe GSA.',
    accent: '#16a394',
    accentSoft: '#e7f8f4',
    dark: '#092f32',
    icon: HeartPulse,
    heroImage: '/images/marketplace/gsa-saude-hero.webp',
    categories: [
      { key: 'individual-familiar', label: 'Individual e Familiar', description: 'Solicite uma análise para você e sua família.', icon: Users, categoryLabel: 'Saúde familiar', image: '/images/marketplace/submodules/health/individual-familiar.jpg', imageAlt: 'Família reunida em um ambiente acolhedor' },
      { key: 'empresarial', label: 'Empresarial', description: 'Informe os dados da empresa e da equipe.', icon: BriefcaseBusiness, categoryLabel: 'Empresas', image: '/images/marketplace/submodules/health/empresarial.jpg', imageAlt: 'Equipe participando de uma orientação de saúde corporativa' },
      { key: 'odontologico', label: 'Odontológico', description: 'Peça uma cotação de assistência odontológica.', icon: Stethoscope, categoryLabel: 'Odontologia', image: '/images/marketplace/submodules/health/odontologico.jpg', imageAlt: 'Consulta odontológica preventiva em ambiente moderno' },
    ],
  },
  seguros: {
    label: 'GSA Seguros',
    eyebrow: 'Proteção para cada momento',
    description: 'Escolha a modalidade e envie as informações necessárias para uma cotação personalizada.',
    accent: '#3569e8',
    accentSoft: '#edf3ff',
    dark: '#0d1f46',
    icon: ShieldCheck,
    heroImage: '/images/marketplace/gsa-seguros-hero.webp',
    categories: [
      { key: 'auto', label: 'Seguro Auto', description: 'Proteção para seu veículo e sua rotina.', icon: Car, categoryLabel: 'Automóvel', image: '/images/marketplace/submodules/insurance/auto.jpg', imageAlt: 'Veículo protegido em ambiente residencial' },
      { key: 'residencial', label: 'Residencial', description: 'Informe os dados do imóvel e solicite a cotação.', icon: Home, categoryLabel: 'Residência', image: '/images/marketplace/submodules/insurance/residencial.jpg', imageAlt: 'Residência acolhedora e protegida ao entardecer' },
      { key: 'vida', label: 'Vida', description: 'Solicite proteção para quem importa.', icon: Umbrella, categoryLabel: 'Família', image: '/images/marketplace/submodules/insurance/vida.jpg', imageAlt: 'Família reunida em um momento de cuidado e proteção' },
      { key: 'empresarial', label: 'Empresarial', description: 'Proteção personalizada para seu negócio.', icon: Building2, categoryLabel: 'Negócios', image: '/images/marketplace/submodules/insurance/empresarial.jpg', imageAlt: 'Empresário cuidando de seu estabelecimento' },
      { key: 'viagem', label: 'Viagem', description: 'Assistência para viajar com tranquilidade.', icon: CalendarDays, categoryLabel: 'Viagens', image: '/images/marketplace/submodules/insurance/viagem.jpg', imageAlt: 'Viajante preparado para embarcar com tranquilidade' },
      { key: 'outros', label: 'Outros Seguros', description: 'Conte o que precisa proteger.', icon: Sparkles, categoryLabel: 'Assessoria', image: '/images/marketplace/submodules/insurance/outros.jpg', imageAlt: 'Consultoria para escolha de proteção personalizada' },
    ],
  },
};

function quotePath(domain: ProtectionDomain, category?: string) {
  const base = domain === 'saude' ? routes.marketplace.saude.cotacao() : routes.marketplace.seguros.cotacao();
  return category ? `${base}/${encodeURIComponent(category)}` : base;
}

function domainPath(domain: ProtectionDomain, page: string, id?: string) {
  if (domain === 'saude') {
    const health = routes.marketplace.saude;
    const map: Record<string, () => string> = {
      home: health.root,
      cotacao: health.cotacao,
      cotacoes: health.minhasCotacoes,
      propostas: health.minhasPropostas,
      contratos: health.meusPlanos,
      dependentes: health.dependentes,
      documentos: health.documentos,
      suporte: health.suporte,
    };
    if (page === 'categoria' && id) return quotePath(domain, id);
    if (page === 'cotacao-detalhe' && id) return health.minhaCotacao(id);
    if (page === 'proposta-detalhe' && id) return health.minhaProposta(id);
    if (page === 'contrato-detalhe' && id) return health.meuPlano(id);
    if (page === 'documento-detalhe' && id) return health.documento(id);
    if (page === 'suporte-detalhe' && id) return health.ticket(id);
    return map[page]?.() || health.root();
  }

  const insurance = routes.marketplace.seguros;
  const map: Record<string, () => string> = {
    home: insurance.root,
    cotacao: insurance.cotacao,
    cotacoes: insurance.minhasCotacoes,
    propostas: insurance.minhasPropostas,
    contratos: insurance.minhasApolices,
    assistencias: insurance.assistencias,
    sinistros: insurance.sinistros,
    documentos: insurance.documentos,
    suporte: insurance.suporte,
  };
  if (page === 'categoria' && id) return quotePath(domain, id);
  if (page === 'cotacao-detalhe' && id) return insurance.minhaCotacao(id);
  if (page === 'proposta-detalhe' && id) return insurance.minhaProposta(id);
  if (page === 'contrato-detalhe' && id) return insurance.minhaApolice(id);
  if (page === 'sinistro-detalhe' && id) return insurance.sinistro(id);
  if (page === 'suporte-detalhe' && id) return insurance.ticket(id);
  return map[page]?.() || insurance.root();
}

function Header({ domain, onBack }: { domain: ProtectionDomain; onBack: () => void }) {
  const config = configs[domain];
  const Icon = config.icon;
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-[#f8f7f3]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <button type="button" onClick={onBack} className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold text-neutral-600 hover:bg-black/5">
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Marketplace</span>
        </button>
        <button type="button" onClick={() => navigate(domainPath(domain, 'home'))} className="flex items-center gap-2 font-black" style={{ color: config.dark }}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white" style={{ background: config.dark }}><Icon className="h-5 w-5" /></span>
          {config.label}
        </button>
        <button type="button" onClick={() => navigate(domainPath(domain, 'suporte'))} className="rounded-full border border-black/10 p-2.5 text-neutral-600 hover:bg-white" aria-label="Suporte">
          <MessageCircle className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

function PageShell({ domain, onBack, children }: { domain: ProtectionDomain; onBack: () => void; children: React.ReactNode }) {
  return <div className="gsa-protection-shell min-h-screen bg-[#f8f7f3] text-neutral-900"><Header domain={domain} onBack={onBack} />{children}</div>;
}

function StatePanel({ type, message, onRetry }: { type: 'loading' | 'empty' | 'error'; message: string; onRetry?: () => void }) {
  const Icon = type === 'loading' ? Loader2 : HelpCircle;
  return (
    <div className="rounded-[2rem] border border-black/5 bg-white px-6 py-16 text-center shadow-sm">
      <Icon className={`mx-auto mb-4 h-10 w-10 text-neutral-300 ${type === 'loading' ? 'animate-spin' : ''}`} />
      <p className="mx-auto max-w-md font-bold text-neutral-700">{message}</p>
      {onRetry && <button type="button" onClick={onRetry} className="mt-5 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-black text-white"><RefreshCw className="h-4 w-4" /> Tentar novamente</button>}
    </div>
  );
}

function AuthGate({ domain, onRequireAuth }: { domain: ProtectionDomain; onRequireAuth?: () => void }) {
  useEffect(() => { onRequireAuth?.(); }, [onRequireAuth]);
  return (
    <main className="mx-auto max-w-xl px-5 py-20 text-center">
      <div className="rounded-[2rem] bg-white p-10 shadow-xl shadow-black/5">
        <ShieldCheck className="mx-auto mb-5 h-12 w-12" style={{ color: configs[domain].accent }} />
        <h1 className="text-2xl font-black">Entre para continuar</h1>
        <p className="mt-3 text-neutral-500">Esta área contém informações pessoais e precisa de acesso autenticado.</p>
        <button type="button" onClick={onRequireAuth} className="mt-7 rounded-full px-7 py-3 font-black text-white" style={{ background: configs[domain].dark }}>Entrar ou cadastrar</button>
      </div>
    </main>
  );
}

function Hub({ domain, clientId }: { domain: ProtectionDomain; clientId?: string }) {
  const config = configs[domain];
  const actions = [
    { label: 'Minhas cotações', description: 'Acompanhe solicitações já enviadas.', icon: ClipboardCheck, page: 'cotacoes' },
    { label: 'Minhas propostas', description: 'Consulte as propostas recebidas.', icon: WalletCards, page: 'propostas' },
    { label: domain === 'saude' ? 'Meus planos' : 'Minhas apólices', description: 'Acesse suas contratações.', icon: ShieldCheck, page: 'contratos' },
    { label: 'Documentos', description: 'Envie e acompanhe documentos.', icon: FileText, page: 'documentos' },
  ];

  return (
    <main>
      <section className="relative overflow-hidden" style={{ background: config.dark }}>
        <div className="absolute inset-0 opacity-25"><img src={config.heroImage} alt="" className="h-full w-full object-cover" /></div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-5 py-16 text-white sm:px-6 sm:py-24">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[.24em] text-white/65">{config.eyebrow}</p>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">{config.label}</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/75 sm:text-lg">{config.description}</p>
            <button type="button" onClick={() => document.getElementById('protection-categories')?.scrollIntoView({ behavior: 'smooth' })} className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-black" style={{ color: config.dark }}>
              Escolher categoria <ChevronRight className="h-4 w-4" />
            </button>
          </motion.div>
        </div>
      </section>

      <section id="protection-categories" className="mx-auto max-w-7xl px-5 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[.2em]" style={{ color: config.accent }}>Comece por aqui</p>
          <h2 className="mt-2 text-3xl font-black sm:text-4xl">Qual cotação você precisa?</h2>
          <p className="mt-3 text-neutral-500">Ao escolher uma categoria, o formulário será aberto com essa opção já definida.</p>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {config.categories.map((category) => (
            <MarketplaceSubmoduleCard
              key={category.key}
              title={category.label}
              description={category.description}
              categoryLabel={category.categoryLabel}
              image={category.image}
              imageAlt={category.imageAlt}
              icon={category.icon}
              accentColor={config.accent}
              actionLabel="Solicitar cotação"
              onClick={() => navigate(domainPath(domain, 'categoria', category.key))}
            />
          ))}
        </div>
      </section>

      {clientId && (
        <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-6">
          <div className="border-t border-black/10 pt-10">
            <h2 className="text-2xl font-black">Sua área de acompanhamento</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {actions.map((action) => {
                const ActionIcon = action.icon;
                return (
                  <button key={action.page} type="button" onClick={() => navigate(domainPath(domain, action.page))} className="rounded-2xl border border-black/5 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <ActionIcon className="h-5 w-5" style={{ color: config.accent }} />
                    <p className="mt-4 font-black">{action.label}</p>
                    <p className="mt-1 text-sm leading-6 text-neutral-500">{action.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function FixedCategory({ domain, category }: { domain: ProtectionDomain; category: Category }) {
  const config = configs[domain];
  const Icon = category.icon;
  return (
    <div className="gsa-quote-category rounded-2xl border p-4" style={{ borderColor: `${config.accent}35`, background: `${config.accent}0b` }}>
      <p className="text-xs font-black uppercase tracking-[.16em]" style={{ color: config.accent }}>{domain === 'saude' ? 'Tipo de plano selecionado' : 'Modalidade selecionada'}</p>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: config.dark }}><Icon className="h-5 w-5" /></span>
        <div><p className="font-black">{category.label}</p><p className="text-sm text-neutral-500">A categoria foi definida na etapa anterior.</p></div>
      </div>
    </div>
  );
}

function QuoteForm({ domain, clientId, initialCategory }: { domain: ProtectionDomain; clientId?: string; initialCategory?: string }) {
  const config = configs[domain];
  const selectedCategory = config.categories.find((category) => category.key === initialCategory);
  const [step, setStep] = useState(1);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<{ protocolo: string; id: string } | null>(null);
  const [error, setError] = useState('');
  const draftKey = `gsa-${domain}-cotacao-draft`;
  const [form, setForm] = useState<Record<string, string>>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) || '{}') as Record<string, string>;
      return { ...saved, categoria: selectedCategory?.key || saved.categoria || '', request_id: saved.request_id || generateUUID() };
    } catch {
      return { categoria: selectedCategory?.key || '', request_id: generateUUID() };
    }
  });

  useEffect(() => {
    if (!selectedCategory) return;
    setForm((current) => {
      if (current.categoria === selectedCategory.key) return current;
      const next = { ...current, categoria: selectedCategory.key };
      try { sessionStorage.setItem(draftKey, JSON.stringify(next)); } catch (e) { console.warn(e); }
      return next;
    });
  }, [draftKey, selectedCategory]);

  const set = (key: string, value: string) => {
    setError('');
    setForm((current) => {
      const next = { ...current, [key]: value };
      try { sessionStorage.setItem(draftKey, JSON.stringify(next)); } catch (e) { console.warn(e); }
      return next;
    });
  };

  const activeCategory = config.categories.find((category) => category.key === form.categoria);
  const isStep1Valid = Boolean(form.categoria && form.localidade?.trim() && form.inicio_desejado);
  const isStep2Valid = domain === 'saude'
    ? Boolean(form.idades?.trim())
    : Boolean(form.objeto_segurado?.trim() && form.valor_risco?.trim());

  const handleNextStep = () => {
    setError('');
    if (step === 1) {
      if (!form.categoria) return setError('Selecione a categoria da cotação.');
      if (!form.localidade?.trim()) return setError(domain === 'saude' ? 'Informe a Cidade/UF de atendimento.' : 'Informe a Cidade/UF do risco.');
      if (!form.inicio_desejado) return setError('Informe a data desejada para iniciar.');
    }
    if (step === 2) {
      if (domain === 'saude' && !form.idades?.trim()) return setError('Informe a idade dos beneficiários.');
      if (domain === 'seguros' && !form.objeto_segurado?.trim()) return setError('Informe o bem ou pessoa a proteger.');
      if (domain === 'seguros' && !form.valor_risco?.trim()) return setError('Informe o valor aproximado do bem ou capital.');
    }
    setStep((current) => current + 1);
  };

  const submit = async () => {
    if (!clientId) {
      try { sessionStorage.setItem(draftKey, JSON.stringify(form)); } catch (e) { console.warn(e); }
      navigate(`${routes.login.personal()}?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setSending(true);
    setError('');
    try {
      const result = await callClientRpc<any>(`gsa_client_${domain}_criar_cotacao`, {
        p_payload: { ...form, categoria: form.categoria, origem: 'marketplace_categoria' },
        p_idempotency_key: form.request_id,
      });
      if (!result?.success) throw new Error(result?.error || 'Não foi possível registrar a cotação.');
      try { sessionStorage.removeItem(draftKey); } catch (e) { console.warn(e); }
      setSuccess({ protocolo: result.protocolo, id: result.id });
    } catch (submitError: any) {
      setError(submitError?.message || 'Não foi possível registrar a cotação.');
    } finally {
      setSending(false);
    }
  };

  if (success) {
    return (
      <main className="gsa-quote gsa-quote-success mx-auto max-w-2xl px-5 py-16">
        <div className="rounded-[2rem] bg-white p-10 text-center shadow-xl">
          <CheckCircle2 className="mx-auto h-14 w-14" style={{ color: config.accent }} />
          <h1 className="mt-5 text-3xl font-black">Solicitação recebida</h1>
          <p className="mt-3 text-neutral-500">Protocolo <strong>{success.protocolo}</strong>. A equipe GSA analisará seus dados e dará continuidade ao atendimento.</p>
          <button type="button" onClick={() => navigate(domainPath(domain, 'cotacoes'))} className="mt-7 rounded-full px-7 py-3 font-black text-white" style={{ background: config.dark }}>Acompanhar cotação</button>
        </div>
      </main>
    );
  }

  return (
    <main className="gsa-quote mx-auto max-w-3xl px-5 py-8 sm:py-12">
      <button type="button" onClick={() => navigate(domainPath(domain, 'home'))} className="mb-6 flex items-center gap-2 text-sm font-bold text-neutral-500"><ArrowLeft className="h-4 w-4" /> Escolher outra categoria</button>
      <div className="gsa-quote-heading">
        <p className="gsa-quote-eyebrow">{config.label} · Cotação personalizada</p>
        <h1>Vamos cuidar do que importa.</h1>
        <p className="gsa-quote-intro">{domain === 'saude' ? 'Conte o que você precisa para encontrar um plano adequado.' : 'Informe o que deseja proteger para solicitar uma análise.'}</p>
        <ol className="gsa-quote-steps" aria-label="Etapas da cotação">
          {['Sua necessidade', 'Dados para análise', 'Autorização'].map((label, index) => (
            <li key={label} aria-current={step === index + 1 ? 'step' : undefined} data-complete={step > index + 1}>
              <span aria-hidden="true">{step > index + 1 ? <CheckCircle2 className="h-4 w-4" /> : index + 1}</span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="gsa-quote-panel">
        <div className="gsa-quote-panel-caption"><span>Solicitar cotação</span><span aria-live="polite">Etapa {step} de 3</span></div>
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-xl font-black">O que você procura?</h2>
            {activeCategory ? <FixedCategory domain={domain} category={activeCategory} /> : (
              <Field label={domain === 'saude' ? 'Tipo de plano' : 'Modalidade do seguro'} value={form.categoria || ''} onChange={(value) => set('categoria', value)} options={config.categories.map((category) => ({ value: category.key, label: category.label }))} required />
            )}
            <Field label={domain === 'saude' ? 'Cidade/UF de atendimento' : 'Cidade/UF do risco'} value={form.localidade || ''} onChange={(value) => set('localidade', value)} placeholder="Ex.: São Paulo / SP" required />
            <Field label="Quando deseja iniciar?" value={form.inicio_desejado || ''} onChange={(value) => set('inicio_desejado', value)} type="date" required />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-xl font-black">Dados para análise</h2>
            {domain === 'saude' ? (
              <>
                <Field label="Quantidade de titulares" value={form.titulares || '1'} onChange={(value) => set('titulares', value)} type="number" required />
                <Field label="Quantidade de dependentes" value={form.dependentes || '0'} onChange={(value) => set('dependentes', value)} type="number" />
                <Field label="Idades dos beneficiários" value={form.idades || ''} onChange={(value) => set('idades', value)} placeholder="Ex.: 35, 32, 8" required />
              </>
            ) : (
              <>
                <Field label="Bem ou pessoa a proteger" value={form.objeto_segurado || ''} onChange={(value) => set('objeto_segurado', value)} placeholder="Ex.: Honda Civic 2022 ou Nome da empresa" required />
                <Field label="Valor aproximado do bem/capital" value={form.valor_risco || ''} onChange={(value) => set('valor_risco', value)} placeholder="Ex.: R$ 120.000,00" required />
                <Field label="Uso principal" value={form.uso || ''} onChange={(value) => set('uso', value)} placeholder="Ex.: Pessoal / Lazer" />
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-xl font-black">Preferências e autorização</h2>
            <Field label="Observações" value={form.observacoes || ''} onChange={(value) => set('observacoes', value)} multiline placeholder="Escreva aqui detalhes adicionais ou preferências..." />
            <label className="flex gap-3 rounded-2xl bg-neutral-50 p-4 text-sm leading-6">
              <input type="checkbox" checked={form.consentimento === 'sim'} onChange={(event) => set('consentimento', event.target.checked ? 'sim' : '')} className="mt-1" />
              <span>Autorizo a GSA a tratar estes dados para analisar minha solicitação e buscar propostas de parceiros. Entendo que a contratação e a cobrança do {domain === 'saude' ? 'plano' : 'prêmio'} ocorrerão diretamente com a {domain === 'saude' ? 'operadora' : 'seguradora'}. <strong className="text-red-500">*</strong></span>
            </label>
          </div>
        )}

        {error && <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">⚠️ {error}</p>}
        <div className="gsa-quote-actions mt-8 flex justify-between gap-3">
          <button type="button" disabled={step === 1 || sending} onClick={() => { setError(''); setStep((current) => current - 1); }} className="rounded-full border border-black/10 px-6 py-3 font-bold disabled:opacity-30">Voltar</button>
          {step < 3 ? (
            <button type="button" disabled={(step === 1 && !isStep1Valid) || (step === 2 && !isStep2Valid)} onClick={handleNextStep} className="rounded-full px-7 py-3 font-black text-white transition disabled:cursor-not-allowed disabled:opacity-40" style={{ background: config.dark }}>Continuar</button>
          ) : (
            <button type="button" disabled={sending || form.consentimento !== 'sim'} onClick={() => void submit()} className="flex items-center gap-2 rounded-full px-7 py-3 font-black text-white transition disabled:cursor-not-allowed disabled:opacity-40" style={{ background: config.dark }}>{sending && <Loader2 className="h-4 w-4 animate-spin" />} Enviar solicitação</button>
          )}
        </div>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder, options, multiline, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; options?: { value: string; label: string }[]; multiline?: boolean; required?: boolean }) {
  const className = 'mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none transition focus:border-black/30 focus:ring-4 focus:ring-black/5';
  return (
    <label className="block text-sm font-bold text-neutral-700">
      {label}{required && <span className="ml-1 text-red-500">*</span>}
      {options ? (
        <select value={value} onChange={(event) => onChange(event.target.value)} className={className}><option value="">Selecione</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      ) : multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={5} className={className} />
      ) : (
        <input type={type} min={type === 'number' ? 0 : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={className} />
      )}
    </label>
  );
}

const resourceLabels: Record<string, string> = {
  cotacoes: 'Minhas cotações',
  propostas: 'Minhas propostas',
  contratos: 'Contratações',
  assessorias: 'Assessoria GSA',
  dependentes: 'Dependentes',
  documentos: 'Documentos',
  assistencias: 'Assistências',
  sinistros: 'Sinistros',
  suporte: 'Atendimentos',
};

function ClientRecords({ domain, resource, itemId, clientId }: { domain: ProtectionDomain; resource: string; itemId?: string; clientId?: string }) {
  const config = configs[domain];
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await callClientRpc<any[]>(`gsa_client_${domain}_listar`, { p_recurso: resource, p_item_id: itemId || null });
      setItems(Array.isArray(data) ? data : []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Não foi possível carregar seus dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [domain, resource, itemId]);

  const title = resourceLabels[resource] || 'Acompanhamento';
  const fields = useMemo(() => itemId && items[0]
    ? Object.entries(items[0]).filter(([key, value]) => !['id', 'cliente_id', 'dados', 'created_at', 'updated_at'].includes(key) && value != null).slice(0, 14)
    : [], [items, itemId]);

  const acceptProposal = async () => {
    if (!itemId || !termsAccepted) return;
    setWorking(true);
    setError('');
    try {
      await callClientRpc(`gsa_client_${domain}_aceitar_proposta`, { p_proposta_id: itemId, p_termos_versao: '2026-07-18' });
      await load();
    } catch (acceptError: any) {
      setError(acceptError?.message || 'Não foi possível aceitar a proposta.');
    } finally {
      setWorking(false);
    }
  };

  const uploadDocument = async (file?: File) => {
    if (!file || !clientId) return;
    setWorking(true);
    setError('');
    try {
      const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-');
      const path = `${clientId}/${generateUUID()}/${safeName}`;
      const bucket = domain === 'saude' ? 'gsa-saude-documentos' : 'gsa-seguros-documentos';
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      await callClientRpc(`gsa_client_${domain}_registrar_documento`, { p_titulo: file.name, p_tipo: 'documento_cliente', p_storage_path: path });
      await load();
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Não foi possível enviar o documento.');
    } finally {
      setWorking(false);
    }
  };

  const detailPage: Record<string, string> = { cotacoes: 'cotacao-detalhe', propostas: 'proposta-detalhe', contratos: 'contrato-detalhe', documentos: 'documento-detalhe', sinistros: 'sinistro-detalhe', suporte: 'suporte-detalhe' };

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="flex items-end justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[.2em]" style={{ color: config.accent }}>Área segura</p><h1 className="mt-2 text-3xl font-black sm:text-5xl">{itemId ? 'Detalhes' : title}</h1></div>
        <div className="flex gap-2">
          {resource === 'cotacoes' && <button type="button" onClick={() => navigate(domainPath(domain, 'home'))} className="rounded-full px-5 py-3 text-sm font-black text-white" style={{ background: config.dark }}>Escolher categoria</button>}
          {resource === 'documentos' && <label className="flex cursor-pointer items-center gap-2 rounded-full px-5 py-3 text-sm font-black text-white" style={{ background: config.dark }}><Upload className="h-4 w-4" /> {working ? 'Enviando...' : 'Enviar documento'}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={working} onChange={(event) => void uploadDocument(event.target.files?.[0])} className="hidden" /></label>}
        </div>
      </div>

      {domain === 'seguros' && !itemId && (resource === 'assistencias' || resource === 'sinistros') && <InsuranceOccurrenceForm type={resource === 'assistencias' ? 'assistencia' : 'sinistro'} onSaved={load} dark={config.dark} />}

      <div className="mt-8">
        {loading ? <StatePanel type="loading" message="Carregando seus dados..." />
          : error && items.length === 0 ? <StatePanel type="error" message={error} onRetry={load} />
            : items.length === 0 ? <StatePanel type="empty" message={`Você ainda não possui registros em ${title.toLowerCase()}.`} />
              : itemId ? (
                <div className="rounded-[2rem] bg-white p-7 shadow-sm">
                  <div className="flex items-center justify-between"><h2 className="text-xl font-black">{items[0].protocolo || items[0].numero || items[0].titulo || 'Registro'}</h2><Status value={items[0].status} color={config.accent} /></div>
                  <div className="mt-7 grid gap-4 sm:grid-cols-2">{fields.map(([key, value]) => <div key={key} className="rounded-2xl bg-neutral-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{key.replaceAll('_', ' ')}</p><p className="mt-1 font-bold">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</p></div>)}</div>
                  {resource === 'propostas' && ['enviada', 'visualizada'].includes(items[0].status) && (
                    <div className="mt-7 rounded-2xl border p-5" style={{ borderColor: `${config.accent}40`, background: `${config.accent}08` }}>
                      <label className="flex gap-3 text-sm leading-6"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-1" /><span>Li e aceito as condições desta proposta. Estou ciente de que {domain === 'saude' ? 'a mensalidade será paga diretamente à operadora' : 'o prêmio será pago diretamente à seguradora'} e que uma eventual taxa de assessoria GSA aparece separadamente.</span></label>
                      <button type="button" disabled={!termsAccepted || working} onClick={() => void acceptProposal()} className="mt-5 flex items-center gap-2 rounded-full px-6 py-3 font-black text-white disabled:opacity-40" style={{ background: config.dark }}>{working && <Loader2 className="h-4 w-4 animate-spin" />} Aceitar proposta</button>
                    </div>
                  )}
                  {error && <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
                </div>
              ) : (
                <div className="grid gap-4">{items.map((item) => <button key={item.id} type="button" onClick={() => detailPage[resource] && navigate(domainPath(domain, detailPage[resource], item.id))} className="flex items-center justify-between rounded-2xl border border-black/5 bg-white p-5 text-left shadow-sm hover:shadow-md"><div><p className="font-black">{item.protocolo || item.numero || item.titulo || item.nome || `Registro ${String(item.id).slice(0, 8)}`}</p><p className="mt-1 text-sm text-neutral-500">{item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : 'Atualizado recentemente'}</p></div><div className="flex items-center gap-3"><Status value={item.status} color={config.accent} />{detailPage[resource] && <ChevronRight className="h-5 w-5 text-neutral-300" />}</div></button>)}</div>
              )}
      </div>
    </main>
  );
}

function Status({ value, color }: { value?: string; color: string }) {
  return <span className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider" style={{ background: `${color}16`, color }}>{(value || 'ativo').replaceAll('_', ' ')}</span>;
}

function InsuranceOccurrenceForm({ type, onSaved, dark }: { type: 'assistencia' | 'sinistro'; onSaved: () => Promise<void>; dark: string }) {
  const [open, setOpen] = useState(false);
  const [policies, setPolicies] = useState<any[]>([]);
  const [policy, setPolicy] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    callClientRpc<any[]>('gsa_client_seguros_listar', { p_recurso: 'contratos', p_item_id: null }).then(setPolicies).catch((loadError: any) => setError(loadError?.message || 'Não foi possível carregar as apólices.'));
  }, [open]);

  const submit = async () => {
    setSending(true);
    setError('');
    try {
      await callClientRpc('gsa_client_seguros_criar_ocorrencia', { p_tipo: type, p_apolice_id: policy, p_payload: { tipo: kind, descricao: description, ocorrido_em: new Date().toISOString() } });
      setOpen(false);
      setDescription('');
      setKind('');
      setPolicy('');
      await onSaved();
    } catch (submitError: any) {
      setError(submitError?.message || 'Não foi possível registrar a solicitação.');
    } finally {
      setSending(false);
    }
  };

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-7 flex items-center gap-2 rounded-full px-5 py-3 text-sm font-black text-white" style={{ background: dark }}><Plus className="h-4 w-4" /> {type === 'assistencia' ? 'Solicitar assistência' : 'Comunicar sinistro'}</button>;

  return (
    <div className="mt-7 rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between"><h2 className="text-xl font-black">{type === 'assistencia' ? 'Nova assistência' : 'Comunicar sinistro'}</h2><button type="button" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">Apólice<select value={policy} onChange={(event) => setPolicy(event.target.value)} className="mt-2 w-full rounded-xl border border-black/10 px-4 py-3"><option value="">Selecione</option>{policies.filter((item) => item.status === 'ativo').map((item) => <option key={item.id} value={item.id}>{item.numero || item.titulo}</option>)}</select></label>
        <Field label={type === 'assistencia' ? 'Tipo de assistência' : 'Tipo de ocorrência'} value={kind} onChange={setKind} />
        <div className="sm:col-span-2"><Field label="Descrição" value={description} onChange={setDescription} multiline /></div>
      </div>
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
      <button type="button" disabled={sending || !policy || !description.trim()} onClick={() => void submit()} className="mt-5 flex items-center gap-2 rounded-full px-6 py-3 font-black text-white disabled:opacity-40" style={{ background: dark }}>{sending && <Loader2 className="h-4 w-4 animate-spin" />} Enviar</button>
    </div>
  );
}

function Support({ domain, clientId, onRequireAuth }: { domain: ProtectionDomain; clientId?: string; onRequireAuth?: () => void }) {
  const config = configs[domain];
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');

  if (!clientId) return <AuthGate domain={domain} onRequireAuth={onRequireAuth} />;

  const submit = async () => {
    setSending(true);
    setStatus('');
    try {
      await callClientRpc(`gsa_client_${domain}_abrir_atendimento`, { p_assunto: subject, p_mensagem: message });
      setSubject('');
      setMessage('');
      setStatus('Atendimento aberto com sucesso.');
    } catch (submitError: any) {
      setStatus(submitError?.message || 'Não foi possível abrir o atendimento.');
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="text-xs font-black uppercase tracking-[.2em]" style={{ color: config.accent }}>Atendimento</p>
      <h1 className="mt-2 text-4xl font-black">Como podemos ajudar?</h1>
      <div className="mt-8 rounded-[2rem] bg-white p-7 shadow-sm">
        <div className="space-y-5"><Field label="Assunto" value={subject} onChange={setSubject} required /><Field label="Mensagem" value={message} onChange={setMessage} multiline required /></div>
        {status && <p className="mt-4 rounded-xl bg-neutral-50 p-4 text-sm font-bold">{status}</p>}
        <button type="button" disabled={sending || !subject.trim() || !message.trim()} onClick={() => void submit()} className="mt-6 flex items-center gap-2 rounded-full px-7 py-3 font-black text-white disabled:opacity-40" style={{ background: config.dark }}>{sending && <Loader2 className="h-4 w-4 animate-spin" />} Enviar mensagem</button>
      </div>
    </main>
  );
}

function legacyCategory(submodule: string, itemId?: string) {
  if (submodule.startsWith('planos-')) return submodule.replace('planos-', '');
  if (submodule.startsWith('modalidade-')) return submodule.replace('modalidade-', '');
  return itemId;
}

export function ProtectionMarketplace({ domain, submodule = 'home', itemId, clientId, onBackToMarketplace, onRequireAuth }: ProtectionMarketplaceProps) {
  const normalizedSubmodule = submodule || 'home';
  const legacyCategoryKey = legacyCategory(normalizedSubmodule, itemId);
  const protectedResources = ['cotacoes', 'propostas', 'contratos', 'assessorias', 'dependentes', 'documentos', 'assistencias', 'sinistros'];
  const detailMap: Record<string, string> = {
    'cotacao-detalhe': 'cotacoes',
    'proposta-detalhe': 'propostas',
    'contrato-detalhe': 'contratos',
    'documento-detalhe': 'documentos',
    'sinistro-detalhe': 'sinistros',
    'suporte-detalhe': 'suporte',
  };

  let content: React.ReactNode;
  if (normalizedSubmodule === 'home') {
    content = <Hub domain={domain} clientId={clientId} />;
  } else if (normalizedSubmodule === 'cotacao' || normalizedSubmodule.startsWith('planos-') || normalizedSubmodule.startsWith('modalidade-')) {
    content = <QuoteForm domain={domain} clientId={clientId} initialCategory={legacyCategoryKey} />;
  } else if (['planos', 'modalidades', 'plano-detalhe', 'oferta-detalhe', 'ofertas'].includes(normalizedSubmodule)) {
    content = <Hub domain={domain} clientId={clientId} />;
  } else if (normalizedSubmodule === 'suporte') {
    content = <Support domain={domain} clientId={clientId} onRequireAuth={onRequireAuth} />;
  } else if (detailMap[normalizedSubmodule]) {
    content = clientId ? <ClientRecords domain={domain} resource={detailMap[normalizedSubmodule]} itemId={itemId} clientId={clientId} /> : <AuthGate domain={domain} onRequireAuth={onRequireAuth} />;
  } else if (protectedResources.includes(normalizedSubmodule)) {
    content = clientId ? <ClientRecords domain={domain} resource={normalizedSubmodule} itemId={itemId} clientId={clientId} /> : <AuthGate domain={domain} onRequireAuth={onRequireAuth} />;
  } else {
    content = <Hub domain={domain} clientId={clientId} />;
  }

  return <PageShell domain={domain} onBack={onBackToMarketplace}>{content}</PageShell>;
}

export default ProtectionMarketplace;
