import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Clock,
  CreditCard,
  FileCheck2,
  Headphones,
  Landmark,
  LayoutDashboard,
  Lock,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import type { ComponentType, ReactNode } from 'react';
import type { Cliente, Module } from '../../types';
import { formatCurrency, maskCNPJ } from '../../lib/utils';

interface BusinessMenuItem {
  id: Module;
  label: string | ReactNode;
  icon: ComponentType<{ className?: string }>;
  count: number;
  locked: boolean;
}

interface BusinessDashboardProps {
  cliente: Cliente;
  menuItems: BusinessMenuItem[];
  onNavigate: (module: Module) => void;
}

const moduleDescriptions: Record<string, string> = {
  perfil: 'Dados cadastrais, contatos e documentos da organização.',
  servicos_assinaturas: 'Orçamentos, contratos, serviços, produtos e assinaturas.',
  financeiro: 'Faturas, notas fiscais, extrato, crédito e movimentações.',
  fidelidade: 'Vouchers, promoções, pontos e condições corporativas.',
  gsa_store: 'Soluções, produtos e oportunidades do ecossistema GSA.',
  suporte: 'Chamados e acompanhamento com a equipe de atendimento.',
};

export function BusinessDashboard({ cliente, menuItems, onNavigate }: BusinessDashboardProps) {
  const reduceMotion = useReducedMotion();
  const companyName = cliente.nome_razao || cliente.nome;
  const pendingItems = menuItems.reduce((total, item) => total + Math.max(0, item.count || 0), 0);
  const isActive = cliente.status === 'ativo' && cliente.cadastro_aprovado !== false && !cliente.bloqueado;
  const availableCredit = Number(cliente.limite_credito_disponivel || 0);
  const businessModules = menuItems.filter((item) => item.id !== 'dashboard');

  const quickActions = [
    { id: 'servicos_assinaturas' as Module, label: 'Ver operações', icon: PackageCheck },
    { id: 'financeiro' as Module, label: 'Abrir financeiro', icon: ReceiptText },
    { id: 'perfil' as Module, label: 'Dados da empresa', icon: Building2 },
    { id: 'suporte' as Module, label: 'Falar com a GSA', icon: Headphones },
  ];

  const kpis = [
    {
      label: 'Saldo disponível',
      value: formatCurrency(cliente.saldo_carteira || 0),
      detail: 'Conta GSA',
      icon: WalletCards,
      tone: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    },
    {
      label: 'Crédito disponível',
      value: formatCurrency(availableCredit),
      detail: cliente.opcao_pagamento_parcelado ? `Até ${cliente.max_parcelas || 1}x habilitado` : 'Conforme análise cadastral',
      icon: CreditCard,
      tone: 'text-blue-700 bg-blue-50 border-blue-100',
    },
    {
      label: 'Ações pendentes',
      value: String(pendingItems).padStart(2, '0'),
      detail: pendingItems === 1 ? 'Item requer atenção' : 'Itens requerem atenção',
      icon: FileCheck2,
      tone: 'text-amber-700 bg-amber-50 border-amber-100',
    },
    {
      label: 'Situação da empresa',
      value: isActive ? 'Regular' : 'Em análise',
      detail: isActive ? 'Ambiente liberado' : 'Acesso com restrições',
      icon: BadgeCheck,
      tone: isActive
        ? 'text-emerald-700 bg-emerald-50 border-emerald-100'
        : 'text-amber-700 bg-amber-50 border-amber-100',
    },
  ];

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-[#1f3449] bg-[linear-gradient(135deg,#07111f_0%,#10243a_55%,#0c1b2a_100%)] p-6 text-white shadow-[0_24px_60px_rgba(7,17,31,.18)] sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border border-[#d8bd73]/15 bg-[#d8bd73]/5" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-48 w-48 rounded-full bg-[#31577b]/30 blur-3xl" />
        <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d8bd73]/25 bg-[#d8bd73]/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#edcf83]">
              <Sparkles className="h-4 w-4" />
              GSA HUB Empresas
            </div>
            <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-white/45">Visão executiva</p>
            <h2 className="mt-2 max-w-3xl text-3xl font-black leading-tight tracking-[-0.04em] sm:text-4xl">
              Bem-vindo, {companyName}.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/58">
              Este é o centro de relacionamento da sua empresa com a GSA. Acompanhe operações, decisões financeiras e próximos passos em um único ambiente.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Identificação corporativa</span>
              <ShieldCheck className="h-5 w-5 text-[#edcf83]" />
            </div>
            <p className="mt-4 truncate text-sm font-black text-white">{companyName}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/10 pt-3 text-[10px]">
              <div>
                <span className="block uppercase tracking-wider text-white/35">CNPJ</span>
                <strong className="mt-1 block text-white/72">{cliente.cnpj ? maskCNPJ(cliente.cnpj) : 'Em atualização'}</strong>
              </div>
              <div>
                <span className="block uppercase tracking-wider text-white/35">Código GSA</span>
                <strong className="mt-1 block text-white/72">{cliente.codigo_cliente}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {(!isActive || (cliente.status as string) === 'em_analise' || (cliente.status as string) === 'pendente') && (
        <section className="rounded-2xl border border-amber-300/80 bg-amber-50/90 p-5 text-amber-950 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300 bg-amber-100 text-amber-800">
                <Clock className="h-6 w-6" />
              </span>
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-200/80 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-900">
                  Cadastro em Análise
                </div>
                <h3 className="mt-2 text-lg font-black text-amber-950 sm:text-xl">
                  Seu cadastro empresarial está sendo analisado pelo sistema
                </h3>
                <p className="mt-1 text-xs leading-6 text-amber-800 sm:text-sm">
                  Sua solicitação foi registrada com sucesso! Enquanto nossos analistas realizam a validação dos dados, os demais módulos permanecerão temporariamente bloqueados. Você pode acompanhar o status de liberação no módulo <strong>Meu Cadastro</strong>.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('perfil')}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-900 px-5 text-xs font-bold text-white transition hover:bg-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
            >
              <Building2 className="h-4 w-4 text-[#edcf83]" />
              Acompanhar no Meu Cadastro
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      <section aria-labelledby="business-indicators-title">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8a651f]">Agora</p>
            <h2 id="business-indicators-title" className="mt-1 text-xl font-black text-[#102033]">Indicadores da conta</h2>
          </div>
          <span className="hidden items-center gap-2 text-xs font-semibold text-[#617083] sm:inline-flex">
            <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {isActive ? 'Cadastro operacional' : 'Cadastro em acompanhamento'}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi, index) => (
            <motion.article
              key={kpi.label}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : index * 0.04 }}
              className="rounded-2xl border border-[#dde3e8] bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#778492]">{kpi.label}</p>
                  <p className="mt-3 text-2xl font-black tracking-[-0.04em] text-[#102033]">{kpi.value}</p>
                </div>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${kpi.tone}`}>
                  <kpi.icon className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#6c7987]">{kpi.detail}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <section className="rounded-[1.5rem] border border-[#dde3e8] bg-white p-5 shadow-sm sm:p-7" aria-labelledby="business-center-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8a651f]">Ambiente exclusivo</p>
              <h2 id="business-center-title" className="mt-1 text-xl font-black text-[#102033]">Central da empresa</h2>
              <p className="mt-2 text-xs leading-5 text-[#71808e]">Acesse os recursos disponíveis para o seu CNPJ.</p>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#102033] text-[#edcf83]">
              <LayoutDashboard className="h-5 w-5" />
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {businessModules.map((item) => (
              <button
                key={String(item.id)}
                type="button"
                disabled={item.locked}
                onClick={() => onNavigate(item.id)}
                className="group relative min-h-[124px] rounded-2xl border border-[#e1e6ea] bg-[#fbfcfd] p-4 text-left transition hover:border-[#bda15f] hover:bg-white hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f] disabled:cursor-not-allowed disabled:opacity-55"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d8bd73]/25 bg-[#fff9ea] text-[#8a651f]">
                    <item.icon className="h-5 w-5" />
                  </span>
                  {item.locked ? (
                    <Lock className="h-4 w-4 text-[#9aa4ae]" />
                  ) : item.count > 0 ? (
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#102033] px-2 text-[10px] font-black text-white">
                      {item.count}
                    </span>
                  ) : (
                    <ArrowRight className="h-4 w-4 text-[#9aa4ae] transition-transform group-hover:translate-x-1 group-hover:text-[#8a651f]" />
                  )}
                </div>
                <h3 className="mt-4 text-sm font-black text-[#102033]">{item.label}</h3>
                <p className="mt-1 text-[11px] leading-5 text-[#71808e]">
                  {moduleDescriptions[String(item.id)] || 'Acesse os recursos deste módulo.'}
                </p>
              </button>
            ))}
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-[1.5rem] border border-[#d5dde4] bg-[#eef2f5] p-5 sm:p-6" aria-labelledby="quick-actions-title">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#102033] shadow-sm">
                <Landmark className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#748190]">Atalhos</p>
                <h2 id="quick-actions-title" className="text-base font-black text-[#102033]">Ações rápidas</h2>
              </div>
            </div>
            <div className="mt-5 grid gap-2">
              {quickActions.map((action) => {
                const menuItem = menuItems.find((item) => item.id === action.id);
                return (
                  <button
                    key={action.id}
                    type="button"
                    disabled={menuItem?.locked}
                    onClick={() => onNavigate(action.id)}
                    className="group flex min-h-12 items-center justify-between gap-3 rounded-xl border border-[#d9e0e6] bg-white px-4 text-left text-xs font-bold text-[#26384b] transition hover:border-[#bda15f] hover:text-[#102033] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a651f] disabled:opacity-55"
                  >
                    <span className="flex items-center gap-3">
                      <action.icon className="h-4 w-4 text-[#8a651f]" />
                      {action.label}
                    </span>
                    <ArrowRight className="h-4 w-4 text-[#a0a9b3] transition-transform group-hover:translate-x-1" />
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-[#20364b] bg-[#102033] p-5 text-white sm:p-6" aria-labelledby="governance-title">
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#d8bd73]/25 bg-[#d8bd73]/10 text-[#edcf83]">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-300">
                Sessão protegida
              </span>
            </div>
            <h2 id="governance-title" className="mt-5 text-base font-black">Segurança e governança</h2>
            <p className="mt-2 text-xs leading-6 text-white/50">
              Os dados desta empresa são carregados somente após a validação da sessão e permanecem vinculados ao CNPJ autenticado.
            </p>
            <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-4 text-[10px] font-bold uppercase tracking-wider text-white/45">
              <ShieldCheck className="h-4 w-4 text-[#edcf83]" />
              Ambiente exclusivo GSA HUB
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
