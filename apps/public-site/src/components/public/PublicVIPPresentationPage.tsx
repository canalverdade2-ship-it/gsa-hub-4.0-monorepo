import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown, Star, ShieldCheck, Zap, ArrowLeft, Sparkles, Trophy, Gift,
  Check, ArrowRight, ChevronDown, Award, Gem, Medal, CheckCircle2,
  UserPlus, LogIn, BadgePercent, Wallet, Headphones, Package,
  BarChart3, Users, TrendingUp, Coins, Flame, Shield, Clock,
  CreditCard, Percent, ShoppingBag, Tag, ChevronRight, HeartHandshake,
  HelpCircle, MessageCircle, Layers, Lock, RefreshCcw, CheckCircle,
  Sliders, Smartphone, Plane, Wrench, Search, Building2, Wifi,
  ExternalLink, Sparkle, ShoppingCart, Award as AwardIcon, CheckSquare
} from 'lucide-react';
import { VIP_LEVELS, VIPLevel } from '../../constants';
import { routes } from '../../routing/routeCatalog';
import { navigate } from '../../routing/navigationService';

interface PublicVIPPresentationPageProps {
  onBack?: () => void;
  clientId?: string;
}

/* ─── Níveis & Configurações Visuais de Alta Fidelidade ───────────────────── */
const LEVEL_CONFIG: Record<string, {
  name: string;
  badge: string;
  color: string;
  borderGlow: string;
  cardBg: string;
  textColor: string;
  accentBg: string;
  accentBorder: string;
  icon: any;
  cardStyle: string;
  gradientText: string;
}> = {
  basico: {
    name: 'Básico',
    badge: 'Multiplicador 0,5×',
    color: '#94a3b8',
    borderGlow: 'rgba(148, 163, 184, 0.4)',
    cardBg: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    textColor: '#f8fafc',
    accentBg: '#f1f5f9',
    accentBorder: '#cbd5e1',
    icon: Medal,
    cardStyle: 'border-slate-600 shadow-slate-900/40',
    gradientText: 'from-slate-300 via-slate-100 to-slate-400',
  },
  bronze: {
    name: 'Bronze',
    badge: 'Multiplicador 1×',
    color: '#d97706',
    borderGlow: 'rgba(217, 119, 6, 0.45)',
    cardBg: 'linear-gradient(135deg, #451a03 0%, #291205 60%, #1e0d04 100%)',
    textColor: '#fef3c7',
    accentBg: '#fef3c7',
    accentBorder: '#fcd34d',
    icon: Award,
    cardStyle: 'border-amber-700 shadow-amber-950/50',
    gradientText: 'from-amber-400 via-amber-200 to-amber-500',
  },
  prata: {
    name: 'Prata',
    badge: 'Multiplicador 2×',
    color: '#94a3b8',
    borderGlow: 'rgba(203, 213, 225, 0.5)',
    cardBg: 'linear-gradient(135deg, #334155 0%, #1e293b 50%, #0f172a 100%)',
    textColor: '#ffffff',
    accentBg: '#f1f5f9',
    accentBorder: '#94a3b8',
    icon: Star,
    cardStyle: 'border-slate-400 shadow-slate-800/50',
    gradientText: 'from-slate-200 via-white to-slate-300',
  },
  ouro: {
    name: 'Ouro',
    badge: 'Multiplicador 3×',
    color: '#f59e0b',
    borderGlow: 'rgba(245, 158, 11, 0.6)',
    cardBg: 'linear-gradient(135deg, #78350f 0%, #451a03 50%, #1c0a00 100%)',
    textColor: '#fffbeb',
    accentBg: '#fef3c7',
    accentBorder: '#fbbf24',
    icon: Crown,
    cardStyle: 'border-amber-500 shadow-amber-900/60 ring-2 ring-amber-400/30',
    gradientText: 'from-amber-300 via-yellow-200 to-amber-400',
  },
  diamante: {
    name: 'Diamante',
    badge: 'Multiplicador 4×',
    color: '#0284c7',
    borderGlow: 'rgba(14, 165, 233, 0.6)',
    cardBg: 'linear-gradient(135deg, #0c4a6e 0%, #072e44 60%, #031b28 100%)',
    textColor: '#f0f9ff',
    accentBg: '#e0f2fe',
    accentBorder: '#7dd3fc',
    icon: Gem,
    cardStyle: 'border-sky-400 shadow-sky-950/60 ring-2 ring-sky-400/40',
    gradientText: 'from-sky-300 via-cyan-100 to-sky-400',
  },
  black: {
    name: 'Black VIP',
    badge: 'Multiplicador 5×',
    color: '#fbbf24',
    borderGlow: 'rgba(251, 191, 36, 0.7)',
    cardBg: 'linear-gradient(135deg, #09090b 0%, #18181b 40%, #000000 100%)',
    textColor: '#ffffff',
    accentBg: '#18181b',
    accentBorder: '#fbbf24',
    icon: Trophy,
    cardStyle: 'border-amber-400 shadow-2xl shadow-amber-500/20 ring-2 ring-amber-400',
    gradientText: 'from-amber-300 via-yellow-100 to-amber-500',
  },
};

/* ─── Estatísticas em Destaque ───────────────────────────────────────────── */
/* ─── Perguntas Frequentes ────────────────────────────────────────────────── */
const FAQS = [
  {
    category: 'geral',
    q: 'O cadastro no Programa VIP GSA é realmente gratuito?',
    a: 'Sim. O cadastro começa no nível Básico e você pode acompanhar seus pontos e sua evolução pelo painel VIP.',
  },
  {
    category: 'pontos',
    q: 'Como funcionam os pontos e os multiplicadores?',
    a: 'O valor de pontos é calculado conforme o multiplicador do seu nível. Quanto mais alto o nível, maior a quantidade de pontos recebida por compra elegível.',
  },
  {
    category: 'niveis',
    q: 'Como faço para subir de nível no Programa VIP?',
    a: 'O nível avança quando seu total de pontos alcança a faixa seguinte. Ao subir, a única mudança é o multiplicador de pontos.',
  },
  {
    category: 'seguranca',
    q: 'Existe algum período de fidelidade ou contrato de permanência?',
    a: 'Não há período de fidelidade. Consulte as regras vigentes do programa no seu painel.',
  },
];

export function PublicVIPPresentationPage({ onBack, clientId }: PublicVIPPresentationPageProps) {
  const [selectedLevel, setSelectedLevel] = useState<string>('ouro');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [faqFilter, setFaqFilter] = useState<string>('todos');
  const [faqSearch, setFaqSearch] = useState<string>('');
  const goRegister = () => navigate(`${routes.login.personal()}?mode=register`);
  const goLogin = () => navigate(routes.login.personal());
  const goBack = () => (onBack ? onBack() : navigate(routes.marketplace.root()));
  const goDashboard = () => navigate(routes.client.loyalty.vip());
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  // Filtragem de FAQ
  const filteredFaqs = FAQS.filter(faq => {
    const matchCategory = faqFilter === 'todos' || faq.category === faqFilter;
    const matchSearch = !faqSearch || faq.q.toLowerCase().includes(faqSearch.toLowerCase()) || faq.a.toLowerCase().includes(faqSearch.toLowerCase());
    return matchCategory && matchSearch;
  });

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 font-sans antialiased selection:bg-amber-400 selection:text-slate-950">

      {/* ── STICKY GLASS NAVBAR ── */}
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#0a101d]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          
          {/* Left: Voltar & Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={goBack}
              className="group flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:border-slate-700 hover:bg-slate-800 hover:text-white cursor-pointer shrink-0"
              title="Retornar à Loja Marketplace"
            >
              <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">Voltar</span>
            </button>

            <div className="flex items-center gap-2.5 shrink-0">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-yellow-600 p-0.5 shadow-md shadow-amber-500/20 shrink-0">
                <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-[#0c1427]">
                  <Crown size={18} className="fill-amber-400 text-amber-400" />
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-sm sm:text-base font-black tracking-tight text-white whitespace-nowrap">GSA HUB</span>
                <span className="rounded-md bg-gradient-to-r from-amber-400 to-yellow-500 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950 shrink-0">
                  VIP
                </span>
              </div>
            </div>
          </div>

          <nav className="hidden sm:flex items-center gap-1 text-xs font-semibold text-slate-300">
            <button onClick={() => scrollToSection('niveis')} className="rounded-lg px-3 py-2 hover:bg-slate-800 hover:text-amber-400">Níveis</button>
            <button onClick={() => scrollToSection('faq')} className="rounded-lg px-3 py-2 hover:bg-slate-800 hover:text-amber-400">Dúvidas</button>
          </nav>
          {/* Right: Auth Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {clientId ? (
              <button
                onClick={goDashboard}
                className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-3.5 py-2 text-xs font-black text-slate-950 shadow-md shadow-amber-500/20 transition-all hover:brightness-110 active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Trophy size={14} className="transition-transform group-hover:rotate-12 shrink-0" />
                <span>Painel VIP</span>
              </button>
            ) : (
              <>
                <button
                  onClick={goLogin}
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-bold text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-800 hover:text-white cursor-pointer whitespace-nowrap shrink-0"
                >
                  <LogIn size={13} className="text-amber-400 shrink-0" />
                  <span>Entrar</span>
                </button>
                <button
                  onClick={goRegister}
                  className="relative group overflow-hidden flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 px-4 py-2 text-xs font-black text-slate-950 shadow-md shadow-amber-500/20 transition-all hover:scale-[1.02] hover:shadow-amber-500/30 active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <UserPlus size={14} className="shrink-0" />
                  <span>Cadastrar Grátis</span>
                  <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="bg-gradient-to-b from-[#0c1427] to-[#070b14] px-4 py-12 text-white sm:py-16">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Programa VIP GSA</p>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Suba de nível e ganhe mais pontos</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Cada nível tem uma faixa de pontos e um multiplicador. Ao avançar, a única vantagem que muda é a quantidade de pontos recebida por compra elegível.</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            {clientId ? (
              <button onClick={goDashboard} className="rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950">Acessar meu painel VIP</button>
            ) : (
              <button onClick={goRegister} className="rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950">Cadastrar gratuitamente</button>
            )}
            <button onClick={() => scrollToSection('niveis')} className="rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-white">Comparar níveis</button>
          </div>
        </div>
      </section>

      <section id="niveis" className="border-y border-slate-800 bg-[#0a101d] px-4 py-10 text-white sm:py-14">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-black sm:text-3xl">Níveis e multiplicadores</h2>
              <p className="mt-1 text-sm text-slate-400">Compare os pontos necessários e o multiplicador de cada nível.</p>
            </div>
            <span className="text-xs text-slate-400">Todas as outras condições são iguais.</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {VIP_LEVELS.map((level) => {
              const conf = LEVEL_CONFIG[level.id];
              const LevelIcon = conf.icon;
              const selected = selectedLevel === level.id;
              return (
                <button key={level.id} type="button" onClick={() => setSelectedLevel(level.id)} aria-pressed={selected} className={`rounded-2xl border p-5 text-left transition-colors ${selected ? 'border-amber-400 bg-amber-400/10' : 'border-slate-800 bg-[#0d1629] hover:border-slate-600'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800"><LevelIcon size={20} style={{ color: conf.color }} /></span>
                      <span className="font-bold">{level.name}</span>
                    </div>
                    <span className="text-lg font-black text-amber-400">{level.multiplier}×</span>
                  </div>
                  <p className="mt-4 text-sm text-slate-300">A partir de {level.minPoints.toLocaleString('pt-BR')} pontos</p>
                  <p className="mt-1 text-xs text-slate-500">{level.maxPoints ? `Até ${level.maxPoints.toLocaleString('pt-BR')} pontos` : 'Nível máximo'}</p>
                  <p className="mt-3 border-t border-slate-800 pt-3 text-xs text-slate-400">{level.multiplier} ponto(s) por real elegível</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>
      {/* ── FAQ INTERATIVO COM BUSCA E ABAS ── */}
      <section id="faq" className="py-20 sm:py-28 bg-[#070b14]">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 mb-3">
              <HelpCircle size={12} className="text-amber-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                Tire Todas as Dúvidas
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Perguntas Frequentes
            </h2>
            <p className="mt-2 text-sm text-slate-400">Dúvidas sobre pontos e níveis.</p>
          </div>

          {/* Search Box */}
          <div className="relative mb-6">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar dúvida sobre pontos ou níveis..."
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
              className="w-full rounded-2xl border border-slate-800 bg-[#0d1629] py-3.5 pl-12 pr-4 text-xs font-medium text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>

          {/* Category Pills */}
          <div className="flex flex-wrap gap-2 mb-8 justify-center">
            {[
              { id: 'todos', label: 'Todas as Dúvidas' },
              { id: 'geral', label: 'Geral & Cadastro' },
              { id: 'pontos', label: 'Pontos & Multiplicadores' },
              { id: 'niveis', label: 'Níveis' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setFaqFilter(cat.id)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  faqFilter === cat.id
                    ? 'bg-amber-400 text-slate-950 font-black'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Accordion List */}
          <div className="space-y-3">
            {filteredFaqs.length > 0 ? (
              filteredFaqs.map((faq, index) => {
                const isOpen = openFaq === index;

                return (
                  <div
                    key={index}
                    className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0d1629] transition-all hover:border-slate-700 shadow-md"
                  >
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : index)}
                      className="flex w-full items-center justify-between p-5 text-left cursor-pointer"
                    >
                      <span className="text-sm font-bold text-white pr-4">{faq.q}</span>
                      <ChevronDown
                        size={18}
                        className={`shrink-0 text-slate-400 transition-transform duration-200 ${
                          isOpen ? 'rotate-180 text-amber-400' : ''
                        }`}
                      />
                    </button>
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-slate-800/80 bg-slate-950/60 p-5 text-xs sm:text-sm leading-relaxed text-slate-300"
                        >
                          {faq.a}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-10 rounded-2xl bg-slate-900/40 border border-slate-800">
                <p className="text-xs text-slate-400">Nenhuma pergunta encontrada com o termo pesquisado.</p>
              </div>
            )}
          </div>

        </div>
      </section>

      <section className="border-t border-slate-800 bg-[#070b14] px-4 py-10 text-center text-white sm:py-14">
        <h2 className="text-2xl font-black sm:text-3xl">Comece a acumular pontos</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">Crie sua conta e acompanhe seu nível e multiplicador pelo painel VIP.</p>
        <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
          {clientId ? <button onClick={goDashboard} className="rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950">Acessar meu painel VIP</button> : <button onClick={goRegister} className="rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950">Criar conta</button>}
          <button onClick={goLogin} className="rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-white">Entrar</button>
        </div>
      </section>
      {/* ── FOOTER — LUXURY DARK ── */}
      <footer className="bg-[#04060c] py-8 text-center text-xs text-slate-400 border-t border-slate-900">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 GSA HUB — Gestão de Serviços & Tecnologia. Todos os direitos reservados.</p>
          <div className="flex gap-4">
            <button onClick={goBack} className="hover:text-amber-400 transition-colors cursor-pointer">Marketplace</button>
            <button onClick={goRegister} className="hover:text-amber-400 transition-colors cursor-pointer">Cadastro VIP</button>
            <button onClick={goLogin} className="hover:text-amber-400 transition-colors cursor-pointer">Acessar Conta</button>
          </div>
        </div>
      </footer>

    </div>
  );
}
