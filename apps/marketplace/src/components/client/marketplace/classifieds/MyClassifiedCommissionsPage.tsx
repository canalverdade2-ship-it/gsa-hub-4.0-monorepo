import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ReceiptText,
  WalletCards,
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));

const commissionStatus: Record<string, { label: string; className: string }> = {
  nao_gerada: { label: 'Não gerada', className: 'bg-neutral-100 text-neutral-700' },
  pendente: { label: 'Pendente', className: 'bg-amber-100 text-amber-800' },
  paga: { label: 'Paga', className: 'bg-emerald-100 text-emerald-800' },
  vencida: { label: 'Vencida', className: 'bg-red-100 text-red-800' },
  contestada: { label: 'Contestada', className: 'bg-orange-100 text-orange-800' },
  ajustada: { label: 'Ajustada', className: 'bg-blue-100 text-blue-800' },
  cancelada: { label: 'Cancelada', className: 'bg-neutral-200 text-neutral-700' },
};

export function MyClassifiedCommissionsPage({ clientId }: { clientId: string }) {
  const [commissions, setCommissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchCommissions = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: queryError } = await supabase
          .from('classificados_comissoes')
          .select(`
            id,
            status,
            valor_comissao,
            data_vencimento,
            created_at,
            fatura_id,
            classificados_transacoes(
              valor_final,
              status,
              classificados_anuncios(titulo, categoria)
            )
          `)
          .eq('vendedor_id', clientId)
          .order('created_at', { ascending: false });

        if (queryError) throw queryError;
        if (mounted) setCommissions(data || []);
      } catch (err) {
        console.error('Erro ao carregar comissões dos classificados:', err);
        if (mounted) setError('Não foi possível carregar suas comissões neste momento.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchCommissions();
    return () => {
      mounted = false;
    };
  }, [clientId]);

  const totals = useMemo(() => ({
    total: commissions.reduce((sum, commission) => sum + Number(commission.valor_comissao || 0), 0),
    pending: commissions
      .filter((commission) => ['pendente', 'vencida', 'contestada'].includes(commission.status))
      .reduce((sum, commission) => sum + Number(commission.valor_comissao || 0), 0),
    paid: commissions
      .filter((commission) => commission.status === 'paga')
      .reduce((sum, commission) => sum + Number(commission.valor_comissao || 0), 0),
    overdue: commissions.filter((commission) => commission.status === 'vencida').length,
  }), [commissions]);

  return (
    <div className="min-h-screen bg-[#f4f1ea] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <button
            onClick={() => navigate(routes.marketplace.classifieds.root())}
            className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-neutral-500 transition hover:text-neutral-900"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao painel
          </button>
          <h1 className="text-3xl font-black tracking-tight text-neutral-900">Comissões dos Classificados</h1>
          <p className="mt-1 text-sm font-medium text-neutral-500">
            Consulte valores cobrados pela intermediação e acompanhe cada situação.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Total gerado', value: formatCurrency(totals.total), icon: ReceiptText },
            { label: 'Pendente', value: formatCurrency(totals.pending), icon: Clock3 },
            { label: 'Pago', value: formatCurrency(totals.paid), icon: CheckCircle2 },
            { label: 'Vencidas', value: totals.overdue, icon: AlertTriangle },
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
          ) : commissions.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <WalletCards className="mb-4 h-12 w-12 text-neutral-300" />
              <h2 className="text-xl font-black text-neutral-900">Nenhuma comissão registrada</h2>
              <p className="mt-2 max-w-md text-sm font-medium text-neutral-500">
                As comissões serão exibidas após a conclusão das vendas intermediadas pela GSA.
              </p>
              <button
                onClick={() => navigate(routes.marketplace.classifieds.minhasVendas())}
                className="mt-5 rounded-full bg-[#1a1a1a] px-5 py-3 text-sm font-black text-white"
              >
                Ver minhas vendas
              </button>
            </div>
          ) : (
            <div className="divide-y divide-black/5">
              {commissions.map((commission) => {
                const status = commissionStatus[commission.status] || {
                  label: commission.status,
                  className: 'bg-neutral-100 text-neutral-700',
                };
                const transaction = commission.classificados_transacoes;
                const ad = transaction?.classificados_anuncios;

                return (
                  <div key={commission.id} className="p-5 transition hover:bg-neutral-50 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-wider text-neutral-400">
                            {ad?.categoria || 'Classificado'}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-black ${status.className}`}>
                            {status.label}
                          </span>
                        </div>
                        <h3 className="truncate text-lg font-black text-neutral-900">
                          {ad?.titulo || 'Venda intermediada pela GSA'}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs font-medium text-neutral-500">
                          <span>Venda: {formatCurrency(transaction?.valor_final || 0)}</span>
                          <span>
                            Vencimento: {commission.data_vencimento
                              ? new Date(commission.data_vencimento).toLocaleDateString('pt-BR')
                              : 'não definido'}
                          </span>
                        </div>
                      </div>
                      <div className="sm:text-right">
                        <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Comissão</p>
                        <p className="mt-1 text-xl font-black text-neutral-900">{formatCurrency(commission.valor_comissao)}</p>
                        {commission.fatura_id && (
                          <p className="mt-1 text-xs font-semibold text-neutral-400">Fatura vinculada</p>
                        )}
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

export default MyClassifiedCommissionsPage;
