import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Voucher, Cliente } from '../../types';
import { formatCurrency, formatDate, formatDateTime, copyToClipboard } from '../../lib/utils';
import { Ticket, Copy, CheckCircle, XCircle, Clock, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { useClientNotifications } from '../../hooks/useClientNotifications';
import { useAutoFitTabs } from '../../hooks/useAutoFitTabs';
import { callClientRpc } from '../../lib/clientRpc';
import { useRealtimeSubscription } from '../../hooks/useRealtime';

export function ClientVouchers({ clientId, initialItemId }: { clientId: string, initialItemId?: string }) {
  const { containerRef: vouchersTabsRef, setButtonRef: setVouchersTabButtonRef } = useAutoFitTabs(16, 10);
  const { pendencies } = useClientNotifications();
  const [activeTab, setActiveTab] = useState<'ativos' | 'usados'>('ativos');
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const hasAutoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (initialItemId && vouchers.length > 0 && hasAutoOpened.current !== initialItemId) {
      const item = vouchers.find(v => v.id === initialItemId);
      if (item) {
        hasAutoOpened.current = initialItemId;
        // Change to the correct tab automatically
        if (item.status === 'ativo') setActiveTab('ativos');
        else setActiveTab('usados');

        // Wait for tab switch to render and smooth scroll + highlight
        setTimeout(() => {
          const element = document.getElementById(`voucher-${item.id}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedItemId(item.id);
            setTimeout(() => setHighlightedItemId(null), 3000); // Highlight for 3s
          }
        }, 300);
      }
    }
  }, [initialItemId, vouchers.length]);

  useEffect(() => {
    fetchVouchers();
  }, [activeTab, clientId]);

  useRealtimeSubscription(
    [
      {
        table: 'vouchers',
        onChange: fetchVouchers,
        onPayload: (payload) => {
          fetchVouchers();
          if (payload.new && selectedVoucher && (payload.new as any).id === selectedVoucher.id) {
            setSelectedVoucher((prev) => (prev ? ({ ...prev, ...payload.new } as Voucher) : null));
          }
        },
      },
      {
        table: 'cupons_loja',
        onChange: fetchVouchers,
      },
      {
        table: 'cupons_ativados',
        onChange: fetchVouchers,
      },
      {
        table: 'clientes',
        filter: clientId ? `id=eq.${clientId}` : undefined,
        onChange: fetchVouchers,
      },
    ],
    [activeTab, clientId, selectedVoucher?.id]
  );

  async function fetchVouchers() {
    let query = supabase
      .from('vouchers')
      .select('*')
      .order('codigo_voucher', { ascending: false });

    if (activeTab === 'ativos') {
      // Para vouchers ativos, traz os específicos do cliente + globais
      query = query.eq('status', 'ativo').or(`cliente_id.eq.${clientId},cliente_id.is.null`);
      
      const { data } = await query;
      if (data) {
        setVouchers((data as Voucher[]).filter(v => !(v.cliente_id === null && v.codigo_voucher.startsWith('IDC'))));
      }
    } else if (activeTab === 'usados') {
      // Para vouchers usados, cancelados e expirados
      
      // 1. Busca IDs de vouchers globais que o cliente usou
      const usedVoucherIds = new Set<string>();
      
      const [extratoRes, pagsRes] = await Promise.all([
        supabase.from('extrato_financeiro').select('referencia_id').eq('cliente_id', clientId).eq('modulo_referencia', 'vouchers').not('referencia_id', 'is', null),
        supabase.from('pagamentos').select('voucher_id, faturas!inner(cliente_id)').eq('faturas.cliente_id', clientId).not('voucher_id', 'is', null)
      ]);
      
      if (extratoRes.data) {
        extratoRes.data.forEach(e => { if (e.referencia_id) usedVoucherIds.add(e.referencia_id); });
      }
      if (pagsRes.data) {
        pagsRes.data.forEach(p => { if (p.voucher_id) usedVoucherIds.add(p.voucher_id); });
      }

      const idsArray = Array.from(usedVoucherIds);
      
      // Construir a string para o filtro .or()
      // Exemplo: cliente_id.eq.123,id.in.(1,2,3)
      let orFilter = `cliente_id.eq.${clientId}`;
      if (idsArray.length > 0) {
        orFilter += `,id.in.(${idsArray.join(',')})`;
      }
      
      query = query.or(orFilter);
      
      const { data } = await query;
      if (data) {
        // Filtrar no JS para ter certeza
        // Mostrar se: for do cliente e (usado, cancelado ou expirado) OU se estiver na lista de usados globalmente
        const filtered = (data as Voucher[]).filter(v => 
          (v.cliente_id === clientId && ['usado', 'cancelado', 'expirado'].includes(v.status)) ||
          idsArray.includes(v.id)
        );
        setVouchers(filtered);
      }
    }
  };

  const handleCopy = async (code: string) => {
    const success = await copyToClipboard(code);
    if (success) {
      toast.success('Código copiado!');
    } else {
      toast.error('Erro ao copiar código. Tente selecionar e copiar manualmente.');
    }
  };

  const handleRedeemSaque = async (voucher: Voucher) => {
    if (loading) return;
    setLoading(true);

    try {
      const data = await callClientRpc<any>('gsa_client_redeem_wallet_voucher', {
        p_voucher_id: voucher.id,
      });
      if (!data?.success) {
        throw new Error('Erro ao resgatar voucher.');
      }

      toast.success(data?.already_exists ? 'Este voucher já foi resgatado.' : 'Valor resgatado com sucesso!');
      
      // Dispatch event to navigate and trigger animation without reload
      window.dispatchEvent(new CustomEvent('voucher-redeemed'));

    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="w-full">
        <div ref={vouchersTabsRef} className="flex w-full gap-1 rounded-3xl bg-neutral-200/50 p-1 ring-1 ring-neutral-300 shadow-inner">
          {['ativos', 'usados'].map((t, index) => (
            <button 
              key={t}
              ref={setVouchersTabButtonRef(index)}
              onClick={() => setActiveTab(t as any)}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-2xl px-1.5 py-2.5 font-black capitalize leading-none transition-all sm:gap-2 sm:px-6 ${activeTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
            >
              {t}
              {t === 'ativos' && pendencies.vouchers_ativos > 0 && (
                <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-black text-white ring-1 ring-white/20 animate-pulse">
                  {pendencies.vouchers_ativos}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {vouchers.map((voucher) => (
          <div 
            key={voucher.id} 
            id={`voucher-${voucher.id}`}
            className={`group relative overflow-hidden rounded-2xl p-6 transition-all duration-500 ${highlightedItemId === voucher.id ? 'bg-indigo-50 ring-4 ring-indigo-500 shadow-2xl scale-[1.02] z-10' : 'bg-white shadow-md ring-1 ring-neutral-300 hover:shadow-xl'}`}
          >
            {highlightedItemId === voucher.id && (
              <div className="absolute top-4 right-4 z-20">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
              </div>
            )}
            <div className={`absolute top-0 right-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full opacity-10 ${voucher.status === 'ativo' ? 'bg-emerald-500' : voucher.status === 'usado' ? 'bg-indigo-500' : 'bg-red-500'}`} />
            
            <div className="mb-4 flex items-center justify-between">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${voucher.status === 'ativo' ? 'bg-emerald-50 text-emerald-600' : voucher.status === 'usado' ? 'bg-indigo-50 text-indigo-600' : 'bg-red-50 text-red-600'}`}>
                <Ticket className="h-5 w-5" />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-[#1a1a1a]/60">{voucher.codigo_voucher}</span>
              </div>
            </div>

            <h3 className="text-2xl tracking-tight text-[#1a1a1a]">
              {voucher.tipo === 'porcentagem' ? `${voucher.valor}% OFF` : formatCurrency(voucher.valor)}
            </h3>
            {voucher.nome && (
              <p className="mt-1 text-sm font-medium text-indigo-600">
                {voucher.nome}
              </p>
            )}
            <p className="mt-1 text-xs font-medium text-[#1a1a1a]/60">
              {voucher.categoria === 'saque' ? 'Voucher de Resgate (Carteira)' : voucher.tipo === 'porcentagem' ? 'Desconto na Fatura' : 'Voucher de Desconto'}
            </p>

            <div className="mt-4 flex flex-col gap-2">
              {voucher.status === 'ativo' && (
                <>
                  {voucher.categoria === 'saque' ? (
                    <button 
                      onClick={() => handleRedeemSaque(voucher)}
                      disabled={loading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20"
                    >
                      <CheckCircle className="h-4 w-4" />
                      {loading ? 'Processando...' : 'Resgatar Agora'}
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleCopy(voucher.codigo_voucher)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white py-2 text-sm font-bold text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
                    >
                      <Copy className="h-4 w-4" />
                      Copiar Código
                    </button>
                  )}
                </>
              )}
              {voucher.status === 'usado' && (
                <button 
                  onClick={() => { setSelectedVoucher(voucher); setIsDetailOpen(true); }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-100 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-200 transition-colors"
                >
                  <Info className="h-4 w-4" />
                  Ver Detalhes
                </button>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-black/5 pt-4">
              <div className="flex items-center gap-2 text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">
                <Clock className="h-3 w-3" />
                {voucher.validade ? formatDate(voucher.validade) : 'Indeterminado'}
              </div>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase ${voucher.status === 'ativo' ? 'bg-emerald-50 text-emerald-600' : voucher.status === 'usado' ? 'bg-indigo-50 text-indigo-600' : 'bg-red-50 text-red-600'}`}>
                {voucher.status}
              </span>
            </div>
          </div>
        ))}
        {vouchers.length === 0 && (
          <div className="col-span-full py-24 text-center">
            <Ticket className="mx-auto h-12 w-12 text-[#1a1a1a]/20 mb-4" />
            <p className="text-[#1a1a1a]/40 font-medium">Você não possui vouchers nesta categoria.</p>
          </div>
        )}
      </div>

      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Detalhes do Voucher" size="full">
        {selectedVoucher && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-neutral-100 p-6 ring-1 ring-neutral-300">
              <div className="flex items-center justify-between mb-4">
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-[10px] font-black text-indigo-700 uppercase">
                  {selectedVoucher.status}
                </span>
                <span className="font-mono text-sm font-bold text-neutral-400">{selectedVoucher.codigo_voucher}</span>
              </div>
              <h3 className="text-2xl font-black text-neutral-900">
                {selectedVoucher.tipo === 'porcentagem' ? `${selectedVoucher.valor}% OFF` : formatCurrency(selectedVoucher.valor)}
              </h3>
              {selectedVoucher.nome && (
                <p className="mt-1 text-sm font-bold text-indigo-600">
                  {selectedVoucher.nome}
                </p>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-white p-4 ring-1 ring-neutral-100">
                  <p className="text-[10px] font-bold text-neutral-400 uppercase">Data de Uso</p>
                  <p className="mt-1 text-sm font-medium text-neutral-900">
                    {selectedVoucher.data_uso ? formatDateTime(selectedVoucher.data_uso) : 'Não informada'}
                  </p>
                </div>
                <div className="rounded-xl bg-white p-4 ring-1 ring-neutral-100">
                  <p className="text-[10px] font-bold text-neutral-400 uppercase">Tipo de Uso</p>
                  <p className="mt-1 text-sm font-medium text-neutral-900">
                    {selectedVoucher.tipo_uso || (selectedVoucher.categoria === 'saque' ? 'Resgate para Carteira' : 'Desconto em Fatura')}
                  </p>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setIsDetailOpen(false)}
              className="w-full rounded-xl bg-neutral-900 py-3 font-bold text-white hover:bg-black transition-colors"
            >
              Fechar
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
