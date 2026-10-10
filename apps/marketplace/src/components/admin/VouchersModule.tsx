import { useState, useEffect, useRef } from 'react';
import { Plus, Search, Ticket, XCircle, CheckCircle, Clock, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Voucher, Cliente } from '../../types';
import { Modal } from '../ui/Modal';
import { formatCurrency, formatDate, generateCode, maskCurrency, handleCurrencyInputChange, unmaskCurrency } from '../../lib/utils';
import { GlobalFilter } from '../ui/GlobalFilter';
import { toast } from 'react-hot-toast';
import { createNotification } from '../../lib/notifications';
import { notificationService } from '../../lib/notificationService';
import { canDeleteRecord } from '../../lib/deleteRequest';
import { useAdminNotifications } from '../../hooks/useAdminNotifications';
import { logService } from '../../lib/logService';
import { AdminWhatsAppButton } from './ui/AdminWhatsAppButton';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';

export function VouchersModule({ activeSubTab, initialItemId, colaboradorId, colaboradorNome }: { activeSubTab?: 'ativos' | 'usados' | 'cancelados', initialItemId?: string, colaboradorId?: string, colaboradorNome?: string | null }) {
  const { refreshCounts } = useAdminNotifications();
  const [activeTab, setActiveTab] = useState<'ativos' | 'usados' | 'cancelados'>('ativos');

  useEffect(() => {
    if (activeSubTab) setActiveTab(activeSubTab);
  }, [activeSubTab]);

  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const hasAutoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (initialItemId && vouchers.length > 0 && hasAutoOpened.current !== initialItemId) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`vouc-${initialItemId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedId(initialItemId);
          
          // Abrir modal automaticamente
          const voucher = vouchers.find(v => v.id === initialItemId);
          if (voucher) {
            handleOpenDetails(voucher);
            setIsDetailModalOpen(true);
            hasAutoOpened.current = initialItemId;
          }

          setTimeout(() => setHighlightedId(null), 3000);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialItemId, vouchers]);
  const [filters, setFilters] = useState<Record<string, any>>({
    mes: '',
    ano: ''
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [voucherHistory, setVoucherHistory] = useState<any[]>([]);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const handleOpenDetails = async (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    
    // 1. Fetch from pagamentos (standard invoice discounts)
    const { data: payData } = await supabase
      .from('pagamentos')
      .select('data_pagamento, valor, faturas(codigo_fatura, clientes(nome))')
      .eq('voucher_id', voucher.id);

    // 2. Fetch from extrato_financeiro (wallet redemptions)
    // We check for both referencia_id (new way) or description match (old way for current "TESTE" vouchers)
    const { data: extratoData } = await supabase
      .from('extrato_financeiro')
      .select('data, valor, descricao, clientes(nome)')
      .or(`referencia_id.eq.${voucher.id},descricao.ilike.%${voucher.codigo_voucher}%`);
      
    const combinedHistory: any[] = [];

    if (payData) {
      payData.forEach(p => {
        combinedHistory.push({
          data: p.data_pagamento,
          valor: p.valor,
          tipo: 'Fatura',
          referencia: (p as any).faturas?.codigo_fatura,
          cliente: (p as any).faturas?.clientes?.nome
        });
      });
    }

    if (extratoData) {
      extratoData.forEach(e => {
        combinedHistory.push({
          data: e.data,
          valor: e.valor,
          tipo: 'Resgate Carteira',
          referencia: 'Saldo Carteira',
          cliente: (e as any).clientes?.nome
        });
      });
    }

    // Sort by date newest first
    combinedHistory.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    setVoucherHistory(combinedHistory);
    setIsDetailModalOpen(true);
  };

  const fetchVersion = useRef(0);

  useEffect(() => {
    let isMounted = true;
    const version = ++fetchVersion.current;
    
    const fetchVouchersData = async (isInitial = false) => {
      try {
        if (isInitial && isMounted) {
          setLoading(true);
          setVouchers([]);
        }

        let query = supabase
          .from('vouchers')
          .select('*, clientes(nome, telefone)');
        
        const statusMap: Record<string, string> = {
          'ativos': 'ativo',
          'usados': 'usado',
          'cancelados': 'cancelado'
        };
        
        const targetStatus = statusMap[activeTab] || 'ativo';
        query = query.eq('status', targetStatus);

        if (search) {
          query = query.or(`codigo_voucher.ilike.%${search}%,nome.ilike.%${search}%`);
        }

        if (filters.mes) {
          const year = filters.ano || new Date().getFullYear();
          const startDate = `${year}-${filters.mes}-01`;
          const endDate = new Date(Number(year), Number(filters.mes), 0).toISOString().split('T')[0];
          query = query.gte('created_at', startDate).lte('created_at', endDate);
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Only update if it's still the active mount AND the latest request version
        if (isMounted && version === fetchVersion.current) {
          setVouchers(data || []);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching vouchers:', err);
        if (isMounted && version === fetchVersion.current) {
          setLoading(false);
        }
      }
    };

    fetchVouchersData(true);

    const channel = supabase
      .channel(`admin-vouchers-${activeTab}-${version}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'vouchers'
      }, () => {
        if (isMounted && version === fetchVersion.current) {
          fetchVouchersData(false); // Update without clearing/loading
        }
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [activeTab, search, filters]);

  // Keep a separate function for manual triggers (like after create/cancel)
  // that uses the current state values
  const refreshVouchers = async () => {
    try {
      let query = supabase
        .from('vouchers')
        .select('*, clientes(nome, telefone)');
      
      const statusMap: Record<string, string> = {
        'ativos': 'ativo',
        'usados': 'usado',
        'cancelados': 'cancelado'
      };
      
      const targetStatus = statusMap[activeTab] || 'ativo';
      query = query.eq('status', targetStatus);

      if (search) query = query.or(`codigo_voucher.ilike.%${search}%,nome.ilike.%${search}%`);
      if (filters.mes) {
        const year = filters.ano || new Date().getFullYear();
        const startDate = `${year}-${filters.mes}-01`;
        const endDate = new Date(Number(year), Number(filters.mes), 0).toISOString().split('T')[0];
        query = query.gte('created_at', startDate).lte('created_at', endDate);
      }

      const { data } = await query.order('created_at', { ascending: false });
      if (data) setVouchers(data);
    } catch (err) {
      console.error('Error refreshing vouchers:', err);
    }
  };

  const handleCreate = async (formData: any) => {
    try {
      const { data: newVoucher, error } = await supabase.from('vouchers').insert([{
        nome: formData.nome,
        tipo: formData.categoria === 'saque' ? 'valor' : formData.tipo,
        categoria: formData.categoria,
        valor: formData.valor,
        usage_limit: formData.usage_limit,
        cliente_id: formData.cliente_id,
        validade: formData.validade,
        codigo_voucher: generateCode('VCH'),
        status: 'ativo'
      }]).select().single();

      if (error) throw error;

      toast.success('Voucher cadastrado com sucesso.');
      if (formData.cliente_id) {
        await notificationService.notifyClient(
          formData.cliente_id,
          '🎫 Novo Voucher Disponível',
          `Você recebeu um novo voucher exclusivo: ${formData.nome}. Código: ${newVoucher.codigo_voucher} 🎁`,
          'vouchers',
          'voucher_criado',
          { itemId: newVoucher.id, prioridade: 'alta', contexto: { voucher_id: newVoucher.id, codigo: newVoucher.codigo_voucher, valor: formData.valor } }
        );
      } else {
        await notificationService.broadcastClients(
          '🔥📢 Novo Voucher Liberado!',
          `O voucher especial de ${formData.categoria === 'saque' ? 'saque' : 'desconto'} acaba de ser liberado! Resgate usando o código ${newVoucher.codigo_voucher} 🎁`,
          'vouchers',
          'broadcast_voucher',
          { itemId: newVoucher.id, prioridade: 'alta', contexto: { voucher_id: newVoucher.id, codigo: newVoucher.codigo_voucher } }
        );
      }
      
      // Log Action
      await logService.logAction({
        acao: 'CRIAR_VOUCHER',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `Cadastrou o voucher: ${formData.nome} (${newVoucher.codigo_voucher}) - Valor: ${formData.tipo === 'porcentagem' ? formData.valor + '%' : formatCurrency(formData.valor)}`
      });

      setIsModalOpen(false);
      refreshCounts?.();
      refreshVouchers();
    } catch (error: any) {
      console.error('Error creating voucher:', error);
      toast.error(`Erro ao cadastrar voucher: ${error.message || 'Erro desconhecido'}`);
    }
  };

  const handleDeleteVoucher = async (id: string) => {
    const canProceed = await canDeleteRecord('vouchers', id);
    if (!canProceed) return;

    try {
      const { error } = await supabase.from('vouchers').delete().eq('id', id);
      if (error) throw error;
      toast.success('Voucher excluído.');
      
      // Log Action
      await logService.logAction({
        acao: 'EXCLUIR_VOUCHER',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `Excluiu permanentemente o voucher ID: ${id}`
      });

      setIsDetailModalOpen(false);
      refreshCounts?.();
      await refreshVouchers();
    } catch (err) {
      console.error('Error deleting voucher:', err);
      toast.error('Erro ao excluir voucher.');
    }
  };

  const handleCancelClick = (id: string) => {
    setSelectedVoucherId(id);
    setCancelReason('');
    setIsCanceling(false);
    setIsCancelModalOpen(true);
  };

  const [isCanceling, setIsCanceling] = useState(false);

  const confirmCancel = async () => {
    if (!selectedVoucherId || !cancelReason || isCanceling) return;
    setIsCanceling(true);
    
    const voucherToCancel = vouchers.find(v => v.id === selectedVoucherId);

    const { error } = await supabase
      .from('vouchers')
      .update({ 
        status: 'cancelado', 
        motivo_cancelamento: cancelReason,
        data_cancelamento: new Date().toISOString()
      })
      .eq('id', selectedVoucherId);

    if (error) {
      toast.error('Erro ao cancelar voucher.');
    } else {
      toast.success('Voucher cancelado.');
      
      // Log Action
      await logService.logAction({
        acao: 'CANCELAR_VOUCHER',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `Cancelou o voucher ${voucherToCancel?.codigo_voucher}. Motivo: ${cancelReason}`
      });

      if (voucherToCancel?.cliente_id) {
        await notificationService.notifyClient(
          voucherToCancel.cliente_id,
          '❌ Voucher Cancelado',
          `O voucher ${voucherToCancel.codigo_voucher} foi cancelado. Motivo: ${cancelReason} ⚠️`,
          'vouchers',
          'voucher_cancelado',
          { itemId: voucherToCancel.id, contexto: { voucher_id: voucherToCancel.id, codigo: voucherToCancel.codigo_voucher, motivo: cancelReason } }
        );
      }
      refreshCounts?.();
      refreshVouchers();
      setIsCancelModalOpen(false);
    }
    setIsCanceling(false);
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-end gap-3 px-2 mb-6">
        <GlobalFilter 
          searchValue={search}
          onSearch={setSearch}
          currentFilters={filters}
          onFilterChange={setFilters}
          onClear={() => {
            setSearch('');
            setFilters({ mes: '', ano: new Date().getFullYear().toString() });
          }}
          options={[
            {
              id: 'mes',
              label: 'Mês de Cadastro',
              type: 'select',
              options: [
                { value: '01', label: 'Janeiro' },
                { value: '02', label: 'Fevereiro' },
                { value: '03', label: 'Março' },
                { value: '04', label: 'Abril' },
                { value: '05', label: 'Maio' },
                { value: '06', label: 'Junho' },
                { value: '07', label: 'Julho' },
                { value: '08', label: 'Agosto' },
                { value: '09', label: 'Setembro' },
                { value: '10', label: 'Outubro' },
                { value: '11', label: 'Novembro' },
                { value: '12', label: 'Dezembro' }
              ]
            },
            {
              id: 'ano',
              label: 'Ano',
              type: 'select',
              options: [
                { value: '2024', label: '2024' },
                { value: '2025', label: '2025' },
                { value: '2026', label: '2026' }
              ]
            }
          ]}
        />

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-3 rounded-[2rem] bg-[#1a1a1a] px-8 py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-xl transition-all hover:bg-black active:scale-95 group whitespace-nowrap"
        >
          <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
          Novo Voucher
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full py-24 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent mb-4"></div>
            <p className="text-sm font-black text-neutral-300 uppercase tracking-widest">Carregando vouchers...</p>
          </div>
        ) : vouchers.length > 0 ? vouchers.map((voucher) => (
          <div 
            key={voucher.id} 
            id={`vouc-${voucher.id}`}
            className={`group relative overflow-hidden rounded-[2.5rem] bg-white p-8 shadow-sm ring-1 ring-black/5 transition-all hover:shadow-2xl hover:-translate-y-1 ${
              highlightedId === voucher.id 
                ? 'bg-indigo-50/50 ring-2 ring-indigo-500 scale-[1.01] z-10 shadow-lg' 
                : ''
            }`}
          >
            <div className={`absolute top-0 right-0 h-32 w-32 translate-x-12 -translate-y-12 rounded-full opacity-5 group-hover:opacity-20 transition-opacity ${
              voucher.status === 'ativo' ? 'bg-emerald-500' : 
              voucher.status === 'usado' ? 'bg-indigo-500' : 'bg-red-500'
            }`} />
            
            <div className="mb-6 flex items-center justify-between relative z-10">
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-inner transition-all group-hover:scale-110 ${
                voucher.status === 'ativo' ? 'bg-emerald-50 text-emerald-600' : 
                voucher.status === 'usado' ? 'bg-indigo-50 text-indigo-600' : 
                'bg-red-50 text-red-600'
              }`}>
                <Ticket className="h-7 w-7" />
              </div>
              <span className="font-mono text-[10px] font-black text-neutral-400 bg-neutral-50 px-2.5 py-1 rounded-lg ring-1 ring-neutral-100">
                {voucher.codigo_voucher}
              </span>
            </div>

            <div className="space-y-2 relative z-10">
              <h3 className="text-3xl font-black text-neutral-900 tracking-tighter">
                {voucher.tipo === 'porcentagem' ? `${voucher.valor}% OFF` : formatCurrency(voucher.valor)}
              </h3>
              {voucher.nome && (
                <p className="text-xs font-black uppercase tracking-widest text-indigo-600 flex items-center gap-2">
                  {voucher.nome}
                  {voucher.categoria === 'saque' && (
                    <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-md shadow-lg shadow-indigo-600/20">CARTEIRA</span>
                  )}
                </p>
              )}
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest line-clamp-1">
                {voucher.cliente_id ? `Exclusivo: ${(voucher as any).clientes?.nome}` : 'Acesso Geral'}
              </p>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-neutral-100 pt-6 relative z-10">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-300">
                <Clock className="h-4 w-4" />
                {voucher.validade ? formatDate(voucher.validade) : 'VITALÍCIO'}
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-neutral-300">
                {voucher.usage_count} / {voucher.usage_limit} <span className="text-neutral-200 lowercase">usos</span>
              </div>
            </div>

            <div className="mt-6 flex gap-3 relative z-10">
              <button 
                onClick={() => handleOpenDetails(voucher)}
                className="flex-1 rounded-2xl bg-neutral-50 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-600 transition-all hover:bg-[#1a1a1a] hover:text-white active:scale-95"
              >
                Detalhes
              </button>
              {voucher.status === 'ativo' && (
                <button 
                  onClick={() => handleCancelClick(voucher.id)}
                  className="rounded-2xl border border-red-100 px-4 text-red-500 hover:bg-red-500 hover:text-white transition-all active:scale-95"
                  title="Cancelar Voucher"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={() => handleDeleteVoucher(voucher.id)}
                className="rounded-2xl border border-neutral-100 px-4 text-neutral-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all active:scale-95"
                title="Excluir Voucher"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        )) : (
          <div className="col-span-full py-24 text-center">
            <Ticket className="h-16 w-16 text-neutral-100 mx-auto mb-4" />
            <p className="text-sm font-black text-neutral-300 uppercase tracking-widest">Nenhum voucher {activeTab} encontrado</p>
          </div>
        )}
      </div>

      <Modal isOpen={isDetailModalOpen} onClose={() => setIsDetailModalOpen(false)} title="Detalhes do Voucher">
        {selectedVoucher && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-neutral-50 p-6 ring-1 ring-neutral-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${selectedVoucher.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' : selectedVoucher.status === 'usado' ? 'bg-indigo-100 text-indigo-700' : 'bg-red-100 text-red-700'}`}>
                    {selectedVoucher.status}
                  </span>
                  {selectedVoucher.cliente_id && (
                    <AdminWhatsAppButton 
                      telefone={(selectedVoucher as any).clientes?.telefone}
                      mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                        tipo: 'voucher',
                        clienteNome: (selectedVoucher as any).clientes?.nome,
                        codigo: selectedVoucher.codigo_voucher,
                        status: `${selectedVoucher.status === 'ativo' ? 'Disponível' : selectedVoucher.status === 'usado' ? 'Usado' : 'Cancelado'} - ${selectedVoucher.tipo === 'porcentagem' ? `${selectedVoucher.valor}% OFF` : formatCurrency(selectedVoucher.valor)}`
                      })}
                    />
                  )}
                </div>
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
              <p className="mt-1 text-sm text-neutral-500">
                {selectedVoucher.cliente_id ? `Exclusivo: ${(selectedVoucher as any).clientes?.nome}` : 'Geral (Qualquer cliente)'}
              </p>
              
              {selectedVoucher.status === 'cancelado' && (
                <div className="mt-4 border-t border-neutral-200 pt-4">
                  <p className="text-xs font-bold text-red-600 uppercase">Cancelado em {formatDate(selectedVoucher.data_cancelamento || '')}</p>
                  <p className="text-sm text-red-600">Motivo: {selectedVoucher.motivo_cancelamento}</p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h4 className="font-bold text-neutral-900">Histórico de Utilização</h4>
              {voucherHistory.length > 0 ? (
                <div className="space-y-3">
                  {voucherHistory.map((usage, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl bg-white p-4 ring-1 ring-neutral-100">
                      <div>
                        <p className="text-sm font-bold text-neutral-900">{usage.cliente || 'Sistema'}</p>
                        <p className="text-xs text-neutral-500">{usage.tipo}: {usage.referencia}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-indigo-600">{formatCurrency(usage.valor)}</p>
                        <p className="text-xs text-neutral-400">{formatDate(usage.data)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">Nenhuma utilização registrada.</p>
              )}
            </div>

            <div className="flex gap-4 pt-4 border-t border-neutral-100">
              <button 
                onClick={() => handleDeleteVoucher(selectedVoucher.id)}
                className="flex-1 rounded-xl bg-red-50 py-3 font-bold text-red-600 hover:bg-red-100"
              >
                Excluir Voucher
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Cadastrar Voucher">
        <VoucherForm onSubmit={handleCreate} onCancel={() => setIsModalOpen(false)} />
      </Modal>

      <Modal isOpen={isCancelModalOpen} onClose={() => setIsCancelModalOpen(false)} title="Cancelar Voucher">
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">Tem certeza que deseja cancelar este voucher? Esta ação não pode ser desfeita.</p>
          <div>
            <label className="mb-1 block text-sm font-bold text-neutral-700">Motivo do Cancelamento *</label>
            <textarea 
              rows={3}
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
              placeholder="Informe o motivo..."
            />
          </div>
          <div className="flex gap-4 pt-2">
            <button onClick={() => setIsCancelModalOpen(false)} className="flex-1 rounded-xl border border-neutral-200 py-3 font-bold text-neutral-600 hover:bg-neutral-50">Voltar</button>
            <button 
              onClick={confirmCancel}
              disabled={!cancelReason || isCanceling}
              className="flex-1 rounded-xl bg-red-600 py-3 font-bold text-white shadow-lg shadow-red-600/20 hover:bg-red-700 disabled:opacity-50"
            >
              {isCanceling ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function VoucherForm({ onSubmit, onCancel }: { onSubmit: (data: any) => Promise<void>, onCancel: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nome: '',
    scope: 'geral',
    tipo_valor: 'valor',
    categoria: 'desconto',
    cliente_id: '',
    valor: '',
    validade: '',
    usage_limit: '1'
  });
  const [clientes, setClientes] = useState<Partial<Cliente>[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchClientes = async () => {
      try {
        const { data, error } = await supabase.from('clientes').select('id, nome, codigo_cliente').eq('status', 'ativo');
        if (error) throw error;
        if (isMounted && data) setClientes(data);
      } catch (err: any) {
        console.error('Erro ao buscar clientes:', err);
        toast.error('Erro ao carregar clientes.');
      }
    };
    fetchClientes();
    return () => { isMounted = false; };
  }, []);

  return (
    <form onSubmit={async (e) => { 
      e.preventDefault(); 
      if (isSubmitting) return;
      setIsSubmitting(true);
      try {
        await onSubmit({
          nome: formData.nome,
          tipo: formData.categoria === 'saque' ? 'valor' : formData.tipo_valor,
          categoria: formData.categoria,
          valor: parseFloat(formData.valor) || 0,
          usage_limit: parseInt(formData.usage_limit) || 1,
          cliente_id: formData.scope === 'geral' ? null : formData.cliente_id,
          validade: formData.validade || null
        });
      } finally {
        setIsSubmitting(false);
      }
    }} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-bold text-neutral-700">Nome do Voucher *</label>
          <input 
            type="text" 
            required
            placeholder="Ex: Promoção de Natal"
            value={formData.nome}
            onChange={e => setFormData({...formData, nome: e.target.value})}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-bold text-neutral-700">Categoria do Voucher</label>
          <div className="flex gap-2 rounded-xl bg-neutral-100 p-1">
            <button 
              type="button"
              onClick={() => setFormData({...formData, categoria: 'desconto'})}
              className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${formData.categoria === 'desconto' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500'}`}
            >
              Desconto
            </button>
            <button 
              type="button"
              onClick={() => setFormData({...formData, categoria: 'saque'})}
              className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${formData.categoria === 'saque' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500'}`}
            >
              Saque (Carteira)
            </button>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-bold text-neutral-700">Alcance do Voucher</label>
          <div className="flex gap-2 rounded-xl bg-neutral-100 p-1">
            <button 
              type="button"
              onClick={() => setFormData({...formData, scope: 'geral'})}
              className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${formData.scope === 'geral' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500'}`}
            >
              Geral
            </button>
            <button 
              type="button"
              onClick={() => setFormData({...formData, scope: 'exclusivo'})}
              className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${formData.scope === 'exclusivo' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500'}`}
            >
              Exclusivo
            </button>
          </div>
        </div>

        {formData.categoria !== 'saque' && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-bold text-neutral-700">Tipo de Desconto</label>
            <div className="flex gap-2 rounded-xl bg-neutral-100 p-1">
              <button 
                type="button"
                onClick={() => setFormData({...formData, tipo_valor: 'valor'})}
                className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${formData.tipo_valor === 'valor' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500'}`}
              >
                Valor Fixo (R$)
              </button>
              <button 
                type="button"
                onClick={() => setFormData({...formData, tipo_valor: 'porcentagem'})}
                className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${formData.tipo_valor === 'porcentagem' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500'}`}
              >
                Porcentagem (%)
              </button>
            </div>
          </div>
        )}

        {formData.scope === 'exclusivo' && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-bold text-neutral-700">Selecionar Cliente *</label>
            <select 
              required
              value={formData.cliente_id}
              onChange={e => setFormData({...formData, cliente_id: e.target.value})}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Selecione um cliente...</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.nome} ({c.codigo_cliente})</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-bold text-neutral-700">
            {formData.tipo_valor === 'valor' ? 'Valor (R$) *' : 'Porcentagem (%) *'}
          </label>
          <input  
            type={formData.tipo_valor === 'valor' ? "text" : "number"} 
            step={formData.tipo_valor === 'valor' ? "0.01" : "1"}
            required
            value={formData.tipo_valor === 'valor' ? maskCurrency(formData.valor) : formData.valor}
            inputMode="decimal"
            onChange={(e) => {
              if (formData.tipo_valor === 'valor') {
                handleCurrencyInputChange(e.target.value, (val) => setFormData({...formData, valor: val.toString()}));
              } else {
                setFormData({...formData, valor: e.target.value});
              }
            }}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold text-neutral-700">Limite de Usos *</label>
          <input  
            type="number" 
            required
            value={formData.usage_limit}
            inputMode="numeric"
            onChange={e => setFormData({...formData, usage_limit: e.target.value})}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-bold text-neutral-700">Validade (Opcional)</label>
          <input 
            type="date" 
            value={formData.validade}
            onChange={e => setFormData({...formData, validade: e.target.value})}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex gap-4 pt-4">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-neutral-200 py-3 font-bold text-neutral-600 hover:bg-neutral-50">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50">{isSubmitting ? 'Salvando...' : 'Salvar Voucher'}</button>
      </div>
    </form>
  );
}
