import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import { Ticket, Plus, Trash2, CheckCircle } from 'lucide-react';
import { formatCurrency, formatDateTime } from '../../../lib/utils';
import { Modal } from '../../ui/Modal';
import { canDeleteRecord } from '../../../lib/deleteRequest';
import { logService } from '../../../lib/logService';
import { notificationService } from '../../../lib/notificationService';

interface AdminPrestadorVouchersProps {
  prestadorId: string;
  prestadorNome?: string;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
}

export function AdminPrestadorVouchers({ 
  prestadorId, 
  prestadorNome, 
  colaboradorId, 
  colaboradorNome 
}: AdminPrestadorVouchersProps) {
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ valor: '', descricao: '' });
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchVouchersLocal = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.from('prestador_vouchers').select('*').eq('prestador_id', prestadorId).order('created_at', { ascending: false });
        if (error) throw error;
        if (isMounted) setVouchers(data || []);
      } catch (e) {
        toast.error('Erro ao carregar vouchers.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchVouchersLocal();
    const sub = supabase.channel(`admin-vouchers-${prestadorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_vouchers' }, fetchVouchersLocal)
      .subscribe();
    return () => { 
      isMounted = false;
      supabase.removeChannel(sub); 
    };
  }, [prestadorId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const codigo = 'PRST-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const { error } = await supabase.from('prestador_vouchers').insert([{
        prestador_id: prestadorId,
        codigo,
        valor: parseFloat(formData.valor),
        descricao: formData.descricao,
        status: 'ativo'
      }]);
      if (error) throw error;
      toast.success('Voucher criado com sucesso.');
      setIsModalOpen(false);
      setFormData({ valor: '', descricao: '' });
      setVouchers(prev => [{
        id: 'temp-' + Date.now(),
        prestador_id: prestadorId,
        codigo,
        valor: parseFloat(formData.valor),
        descricao: formData.descricao,
        status: 'ativo',
        created_at: new Date().toISOString()
      }, ...prev]);

      // Notificar Prestador
      await notificationService.notifyProvider(
        prestadorId,
        '🎟️ Novo Voucher Disponível!',
        `Você recebeu um voucher de ${formatCurrency(parseFloat(formData.valor))}. Código: ${codigo}. Motivo: ${formData.descricao}.`,
        'financeiro',
        'prestador_voucher_enviado',
        { tab: 'vouchers' }
      );

      // Log action
      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'CRIAR_VOUCHER_PRESTADOR',
        detalhes: `Criou um voucher (Código: ${codigo}) de ${formatCurrency(parseFloat(formData.valor))} para o prestador ${prestadorNome || prestadorId}`
      });
    } catch (e) {
      toast.error('Erro ao criar voucher.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const canProceed = await canDeleteRecord('prestador_vouchers', id);
    if (!canProceed) return;

    if (!confirm('Excluir este voucher?')) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('prestador_vouchers').delete().eq('id', id);
      if (error) throw error;
      toast.success('Excluído.');
      setVouchers(prev => prev.filter(v => v.id !== id));

      // Log action
      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'EXCLUIR_VOUCHER_PRESTADOR',
        detalhes: `Excluiu um voucher (ID: ${id}) do prestador ${prestadorNome || prestadorId}`
      });
    } catch (e) {
      toast.error('Erro ao excluir.');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePagar = async (id: string) => {
    if (!confirm('Confirmar o pagamento/transferência deste voucher saquado?')) return;
    setActionLoading(true);
    try {
      // In a real flow, you might want to create a transaction here or just mark as pago.
      const { error } = await supabase.from('prestador_vouchers').update({ status: 'pago' }).eq('id', id);
      if (error) throw error;
      toast.success('Voucher marcado como pago.');
      setVouchers(prev => prev.map(v => v.id === id ? { ...v, status: 'pago' } : v));

      // Notificar Prestador do pagamento
      await notificationService.notifyProvider(
        prestadorId,
        '✅ Voucher Pago!',
        `Seu voucher foi pago/transferido com sucesso pelo administrador.`,
        'financeiro',
        'prestador_saque_pago',
        { tab: 'vouchers' }
      );

      // Log action
      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'PAGAR_VOUCHER_PRESTADOR',
        detalhes: `Marcou o voucher (ID: ${id}) do prestador ${prestadorNome || prestadorId} como pago`
      });
    } catch (e) {
      toast.error('Erro ao processar.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div>Carregando vouchers...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-indigo-50 p-4 rounded-xl border border-indigo-100">
        <div>
          <h4 className="font-bold text-indigo-900">Vouchers do Prestador</h4>
          <p className="text-sm text-indigo-700">Gerencie os bônus concedidos para este profissional.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} disabled={actionLoading} className="btn-primary bg-indigo-600 hover:bg-indigo-700 text-sm disabled:opacity-50">
          <Plus className="w-4 h-4 mr-1"/> Adicionar Voucher
        </button>
      </div>

      <div className="divide-y divide-neutral-100 border rounded-xl overflow-hidden">
        {vouchers.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">Nenhum voucher registrado.</div>
        ) : vouchers.map(v => (
          <div key={v.id} className="p-4 flex items-center justify-between hover:bg-neutral-50">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-neutral-900">{formatCurrency(v.valor)}</span>
                <span className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded-full ${
                  v.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' :
                  v.status === 'resgatado' ? 'bg-amber-100 text-amber-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {v.status}
                </span>
                {v.status === 'resgatado' && (
                  <span className="text-xs text-red-500 font-bold ml-2 animate-pulse">SAQUE SOLICITADO!</span>
                )}
              </div>
              <div className="text-xs text-neutral-500 font-mono mt-1">Código: {v.codigo}</div>
              <div className="text-sm text-neutral-600 mt-1">{v.descricao}</div>
              <div className="text-[10px] text-neutral-400 mt-1 flex gap-2">
                <span>Criado em: {formatDateTime(v.created_at)}</span>
                {v.status !== 'ativo' && <span>• Atualizado em: {formatDateTime(v.updated_at)}</span>}
              </div>
            </div>
            <div className="flex gap-2">
              {v.status === 'resgatado' && (
                <button onClick={() => handlePagar(v.id)} disabled={actionLoading} className="p-2 text-emerald-600 bg-emerald-50 rounded disabled:opacity-50" title="Confirmar Pagamento">
                  <CheckCircle className="w-5 h-5"/>
                </button>
              )}
              {v.status === 'ativo' && (
                <button onClick={() => handleDelete(v.id)} disabled={actionLoading} className="p-2 text-red-600 bg-red-50 rounded disabled:opacity-50" title="Excluir">
                  <Trash2 className="w-5 h-5"/>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Novo Voucher" size="wide">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Valor (R$)</label>
            <input  required type="number" step="0.01" value={formData.valor} inputMode="numeric"
onChange={(e) => setFormData({...formData, valor: e.target.value})} className="input-field" placeholder="Ex: 50.00" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Motivo / Descrição</label>
            <input required type="text" value={formData.descricao} onChange={e=>setFormData({...formData, descricao: e.target.value})} className="input-field" placeholder="Ex: Bônus por 10 serviços 5 estrelas" />
          </div>
          <button type="submit" disabled={actionLoading} className="btn-primary w-full">Gerar Voucher</button>
        </form>
      </Modal>
    </div>
  );
}
