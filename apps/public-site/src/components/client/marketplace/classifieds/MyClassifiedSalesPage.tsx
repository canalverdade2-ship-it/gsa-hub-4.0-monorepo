import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  PackageCheck,
  ReceiptText,
  ShoppingBag,
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));

const saleStatus: Record<string, { label: string; className: string }> = {
  criada: { label: 'Criada', className: 'bg-neutral-100 text-neutral-700' },
  aguardando_pagamento_ao_vendedor: { label: 'Aguardando pagamento', className: 'bg-amber-100 text-amber-800' },
  comprovante_enviado: { label: 'Comprovante enviado', className: 'bg-blue-100 text-blue-800' },
  pagamento_confirmado: { label: 'Pagamento confirmado', className: 'bg-sky-100 text-sky-800' },
  em_entrega_ou_transferencia: { label: 'Entrega ou transferência', className: 'bg-violet-100 text-violet-800' },
  aguardando_confirmacao_comprador: { label: 'Aguardando comprador', className: 'bg-orange-100 text-orange-800' },
  contestada: { label: 'Contestada', className: 'bg-red-100 text-red-800' },
  concluida: { label: 'Concluída', className: 'bg-emerald-100 text-emerald-800' },
  cancelada: { label: 'Cancelada', className: 'bg-neutral-200 text-neutral-700' },
  reembolsada: { label: 'Reembolsada', className: 'bg-rose-100 text-rose-800' },
};

export function MyClassifiedSalesPage({ clientId }: { clientId: string }) {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchSales = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: queryError } = await supabase
          .from('classificados_transacoes')
          .select(`
            id,
            status,
            valor_final,
            created_at,
            updated_at,
            classificados_anuncios(titulo, categoria, slug)
          `)
          .eq('vendedor_id', clientId)
          .order('created_at', { ascending: false });

        if (queryError) throw queryError;
        if (mounted) setSales(data || []);
      } catch (err) {
        console.error('Erro ao carregar vendas dos classificados:', err);
        if (mounted) setError('Não foi possível carregar suas vendas neste momento.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchSales();
    return () => {
      mounted = false;
    };
  }, [clientId]);

  const totals = useMemo(() => ({
    total: sales.length,
    completed: sales.filter((sale) => sale.status === 'concluida').length,
    completedValue: sales
      .filter((sale) => sale.status === 'concluida')
      .reduce((sum, sale) => sum + Number(sale.valor_final || 0), 0),
    inProgress: sales.filter((sale) => !['concluida', 'cancelada', 'reembolsada'].includes(sale.status)).length,
  }), [sales]);

  return (
    <div className="min-h-screen bg-[#f4f1ea] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button
              onClick={() => navigate(routes.marketplace.classifieds.root())}
              className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-neutral-500 transition hover:text-neutral-900"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar ao painel
            </button>
            <h1 className="text-3xl font-black tracking-tight text-neutral-900">Minhas vendas</h1>
            <p className="mt-1 text-sm font-medium text-neutral-500">
              Acompanhe cada negócio realizado por meio dos Classificados GSA.
            </p>
          </div>
          <button
            onClick={() => navigate(routes.marketplace.classifieds.comissoes())}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1a1a1a] px-5 py-3 text-sm font-black text-white transition hover:bg-black"
          >
            <ReceiptText className="h-4 w-4 text-[#f5b82e]" /> Ver comissões
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Total de vendas', value: totals.total, icon: ShoppingBag },
            { label: 'Em andamento', value: totals.inProgress, icon: Clock3 },
            { label: 'Concluídas', value: totals.completed, icon: CheckCircle2 },
            { label: 'Valor concluído', value: formatCurrency(totals.completedValue), icon: PackageCheck },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
              <item.icon className="mb-3 h-5 w-5 text-[#a66a00]" />
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">{item.label}</p>
              <p className="mt-1 break-words text-xl font-black text-neutral-900">{loading ? '—' : item.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
          {error ? (
            <div className="p-8 text-center text-sm font-semibold text-red-700">{error}</div>
          ) : loading ? (
            <div className="flex h-56 items-center justify-center">
              <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-[#1a1a1a]" />
            </div>
          ) : sales.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <ShoppingBag className="mb-4 h-12 w-12 text-neutral-300" />
              <h2 className="text-xl font-black text-neutral-900">Nenhuma venda registrada</h2>
              <p className="mt-2 max-w-md text-sm font-medium text-neutral-500">
                Quando uma negociação resultar em venda, todo o acompanhamento aparecerá aqui.
              </p>
              <button
                onClick={() => navigate(routes.marketplace.classifieds.meusAnuncios())}
                className="mt-5 rounded-full bg-[#1a1a1a] px-5 py-3 text-sm font-black text-white"
              >
                Ver meus anúncios
              </button>
            </div>
          ) : (
            <div className="divide-y divide-black/5">
              {sales.map((sale) => {
                const status = saleStatus[sale.status] || {
                  label: sale.status,
                  className: 'bg-neutral-100 text-neutral-700',
                };

                return (
                  <div key={sale.id} className="p-5 transition hover:bg-neutral-50 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-wider text-neutral-400">
                            {sale.classificados_anuncios?.categoria || 'Classificado'}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-black ${status.className}`}>
                            {status.label}
                          </span>
                        </div>
                        <h3 className="truncate text-lg font-black text-neutral-900">
                          {sale.classificados_anuncios?.titulo || 'Anúncio classificado'}
                        </h3>
                        <p className="mt-1 text-xs font-medium text-neutral-500">
                          Registrada em {new Date(sale.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <div className="sm:text-right">
                        <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Valor final</p>
                        <p className="mt-1 text-xl font-black text-neutral-900">{formatCurrency(sale.valor_final)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MyClassifiedSalesPage;
