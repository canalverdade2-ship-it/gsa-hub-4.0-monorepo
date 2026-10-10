import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  Car,
  CircleDollarSign,
  Clock3,
  Handshake,
  MessageCircle,
  PackageSearch,
  PlusCircle,
  ReceiptText,
  ShoppingBag,
  Tags,
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';

interface ClassifiedsClientDashboardProps {
  clientId: string;
  onBack: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));

const statusLabels: Record<string, string> = {
  rascunho: 'Rascunho',
  aguardando_revisao: 'Em revisão',
  ajustes_solicitados: 'Ajustes solicitados',
  aprovado: 'Aprovado',
  publicado: 'Publicado',
  pausado: 'Pausado',
  reservado: 'Reservado',
  vendido: 'Vendido',
  rejeitado: 'Rejeitado',
  cancelado: 'Cancelado',
  arquivado: 'Arquivado',
};

export function ClassifiedsClientDashboard({ clientId, onBack }: ClassifiedsClientDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ads, setAds] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const [adsResult, proposalsResult, salesResult, commissionsResult] = await Promise.all([
          supabase
            .from('classificados_anuncios')
            .select('id, slug, titulo, preco, status, categoria, created_at, classificados_propostas(id)')
            .eq('cliente_id', clientId)
            .order('created_at', { ascending: false }),
          supabase
            .from('classificados_propostas')
            .select('id, status, valor_proposta, comprador_id, vendedor_id, updated_at, classificados_anuncios(titulo, categoria)')
            .or(`comprador_id.eq.${clientId},vendedor_id.eq.${clientId}`)
            .order('updated_at', { ascending: false }),
          supabase
            .from('classificados_transacoes')
            .select('id, status, valor_final, created_at, anuncio_id, classificados_anuncios(titulo, categoria)')
            .eq('vendedor_id', clientId)
            .order('created_at', { ascending: false }),
          supabase
            .from('classificados_comissoes')
            .select('id, status, valor_comissao, data_vencimento, created_at')
            .eq('vendedor_id', clientId)
            .order('created_at', { ascending: false }),
        ]);

        const firstError = adsResult.error || proposalsResult.error || salesResult.error || commissionsResult.error;
        if (firstError) throw firstError;

        if (!mounted) return;
        setAds(adsResult.data || []);
        setProposals(proposalsResult.data || []);
        setSales(salesResult.data || []);
        setCommissions(commissionsResult.data || []);
      } catch (err: any) {
        console.error('Erro ao carregar painel dos classificados:', err);
        if (mounted) setError('Não foi possível carregar todas as informações dos seus classificados.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadDashboard();
    return () => {
      mounted = false;
    };
  }, [clientId]);

  const summary = useMemo(() => {
    const activeProposalStatuses = new Set([
      'nova',
      'em_analise_gsa',
      'aguardando_vendedor',
      'aguardando_comprador',
      'contraproposta',
      'aceita',
    ]);

    return {
      totalAds: ads.length,
      publishedAds: ads.filter((ad) => ['publicado', 'reservado'].includes(ad.status)).length,
      activeNegotiations: proposals.filter((proposal) => activeProposalStatuses.has(proposal.status)).length,
      completedSales: sales.filter((sale) => sale.status === 'concluida').length,
      completedSalesValue: sales
        .filter((sale) => sale.status === 'concluida')
        .reduce((total, sale) => total + Number(sale.valor_final || 0), 0),
      pendingCommissionValue: commissions
        .filter((commission) => ['pendente', 'vencida', 'contestada'].includes(commission.status))
        .reduce((total, commission) => total + Number(commission.valor_comissao || 0), 0),
    };
  }, [ads, proposals, sales, commissions]);

  const managementActions = [
    {
      title: 'Novo anúncio',
      description: 'Cadastre um imóvel, veículo ou produto para análise da GSA.',
      icon: PlusCircle,
      action: () => navigate(routes.marketplace.classifieds.anunciar()),
      primary: true,
    },
    {
      title: 'Meus anúncios',
      description: 'Gerencie publicações, revisões, propostas e anúncios vendidos.',
      icon: Tags,
      action: () => navigate(routes.marketplace.classifieds.meusAnuncios()),
    },
    {
      title: 'Negociações',
      description: 'Acompanhe propostas de compra e venda com mediação da GSA.',
      icon: MessageCircle,
      action: () => navigate(routes.marketplace.classifieds.negociacoes()),
    },
    {
      title: 'Minhas vendas',
      description: 'Visualize negócios em andamento e vendas já concluídas.',
      icon: ShoppingBag,
      action: () => navigate(routes.marketplace.classifieds.minhasVendas()),
    },
    {
      title: 'Comissões',
      description: 'Consulte valores, vencimentos e situação das comissões.',
      icon: ReceiptText,
      action: () => navigate(routes.marketplace.classifieds.comissoes()),
    },
  ];

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-neutral-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50"
          >
            <ArrowLeft className="h-4 w-4" /> Marketplace GSA
          </button>
          <button
            onClick={() => navigate(routes.marketplace.classifieds.anunciar())}
            className="inline-flex items-center gap-2 rounded-full bg-[#1a1a1a] px-5 py-2.5 text-sm font-black text-white transition hover:bg-black"
          >
            <PlusCircle className="h-4 w-4 text-[#f5b82e]" /> Anunciar
          </button>
        </div>

        <section className="relative overflow-hidden rounded-[2rem] bg-[#111] px-6 py-8 text-white shadow-xl sm:px-10 sm:py-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,184,46,0.22),transparent_38%)]" />
          <div className="relative z-10 grid gap-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#f5b82e]/30 bg-[#f5b82e]/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#f5b82e]">
                <BarChart3 className="h-3.5 w-3.5" /> Painel personalizado
              </div>
              <h1 className="max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">
                Gerencie seus anúncios e negócios em um só lugar
              </h1>
              <p className="mt-4 max-w-2xl text-sm font-medium leading-relaxed text-white/65 sm:text-base">
                Crie anúncios, acompanhe propostas, consulte vendas e veja suas informações financeiras dos Classificados GSA.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-white/45">Vendas concluídas</p>
              <p className="mt-2 text-3xl font-black text-[#f5b82e]">{formatCurrency(summary.completedSalesValue)}</p>
              <p className="mt-1 text-sm text-white/55">{summary.completedSales} negócio(s) finalizado(s)</p>
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800">
            {error}
          </div>
        )}

        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Meus anúncios', value: summary.totalAds, detail: `${summary.publishedAds} publicados`, icon: Tags },
            { label: 'Negociações ativas', value: summary.activeNegotiations, detail: 'comprando e vendendo', icon: Handshake },
            { label: 'Vendas realizadas', value: summary.completedSales, detail: formatCurrency(summary.completedSalesValue), icon: CircleDollarSign },
            { label: 'Comissões pendentes', value: formatCurrency(summary.pendingCommissionValue), detail: 'acompanhar pagamentos', icon: ReceiptText },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5b82e]/12 text-[#b87800]">
                <item.icon className="h-5 w-5" />
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">{item.label}</p>
              <p className="mt-1 break-words text-xl font-black text-neutral-900 sm:text-2xl">
                {loading ? '—' : item.value}
              </p>
              <p className="mt-1 text-xs font-medium text-neutral-500">{item.detail}</p>
            </div>
          ))}
        </section>

        <section className="mt-8">
          <div className="mb-4">
            <h2 className="text-2xl font-black tracking-tight text-neutral-900">Gerenciar meus Classificados</h2>
            <p className="mt-1 text-sm font-medium text-neutral-500">Acesse rapidamente cada etapa das suas operações.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {managementActions.map((item) => (
              <button
                key={item.title}
                onClick={item.action}
                className={`group flex min-h-44 flex-col justify-between rounded-3xl border p-6 text-left transition-all hover:-translate-y-1 hover:shadow-lg ${
                  item.primary
                    ? 'border-[#1a1a1a] bg-[#1a1a1a] text-white'
                    : 'border-black/5 bg-white text-neutral-900'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.primary ? 'bg-[#f5b82e] text-black' : 'bg-neutral-100 text-neutral-700'}`}>
                    <item.icon className="h-6 w-6" />
                  </div>
                  <ArrowRight className={`h-5 w-5 transition-transform group-hover:translate-x-1 ${item.primary ? 'text-white/50' : 'text-neutral-300'}`} />
                </div>
                <div className="mt-6">
                  <h3 className="text-xl font-black">{item.title}</h3>
                  <p className={`mt-2 text-sm font-medium leading-relaxed ${item.primary ? 'text-white/60' : 'text-neutral-500'}`}>
                    {item.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-neutral-900">Anúncios recentes</h2>
                <p className="text-sm font-medium text-neutral-500">Últimas publicações vinculadas ao seu cadastro.</p>
              </div>
              <button onClick={() => navigate(routes.marketplace.classifieds.meusAnuncios())} className="text-sm font-black text-[#a66a00] hover:underline">
                Ver todos
              </button>
            </div>

            {loading ? (
              <div className="flex h-40 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-[#1a1a1a]" />
              </div>
            ) : ads.length === 0 ? (
              <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl bg-neutral-50 px-5 text-center">
                <PackageSearch className="mb-3 h-9 w-9 text-neutral-300" />
                <p className="font-bold text-neutral-800">Você ainda não possui anúncios</p>
                <button onClick={() => navigate(routes.marketplace.classifieds.anunciar())} className="mt-3 text-sm font-black text-[#a66a00] hover:underline">
                  Criar primeiro anúncio
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {ads.slice(0, 4).map((ad) => (
                  <button
                    key={ad.id}
                    onClick={() => navigate(routes.marketplace.classifieds.meusAnuncios())}
                    className="flex w-full items-center gap-4 rounded-2xl border border-black/5 p-4 text-left transition hover:bg-neutral-50"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-100">
                      <Tags className="h-5 w-5 text-neutral-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black text-neutral-900">{ad.titulo}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-neutral-500">
                        <span>{statusLabels[ad.status] || ad.status}</span>
                        <span>•</span>
                        <span>{ad.classificados_propostas?.length || 0} proposta(s)</span>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-black text-neutral-800">{formatCurrency(ad.preco)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-neutral-900">Explorar anúncios</h2>
            <p className="mt-1 text-sm font-medium text-neutral-500">Encontre oportunidades publicadas por outros clientes.</p>

            <div className="mt-5 space-y-3">
              {[
                { label: 'Imóveis', description: 'Casas, apartamentos e terrenos', icon: Building2, route: routes.marketplace.classifieds.imoveis() },
                { label: 'Veículos', description: 'Carros, motos e utilitários', icon: Car, route: routes.marketplace.classifieds.veiculos() },
                { label: 'Produtos em geral', description: 'Equipamentos e oportunidades', icon: PackageSearch, route: routes.marketplace.classifieds.geral() },
              ].map((category) => (
                <button
                  key={category.label}
                  onClick={() => navigate(category.route)}
                  className="group flex w-full items-center gap-4 rounded-2xl border border-black/5 p-4 text-left transition hover:border-[#f5b82e]/50 hover:bg-[#fff9eb]"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f5b82e]/15 text-[#a66a00]">
                    <category.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-neutral-900">{category.label}</p>
                    <p className="truncate text-xs font-medium text-neutral-500">{category.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-neutral-300 transition-transform group-hover:translate-x-1" />
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-2xl bg-neutral-50 p-4 text-xs font-medium leading-relaxed text-neutral-500">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#a66a00]" />
              As negociações, mensagens e confirmações permanecem registradas e acompanhadas pela GSA.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default ClassifiedsClientDashboard;
