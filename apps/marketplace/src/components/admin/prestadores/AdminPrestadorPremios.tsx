import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import { Gift, Plus, Trash2, CheckCircle } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { canDeleteRecord } from '../../../lib/deleteRequest';
import { logService } from '../../../lib/logService';
import { notificationService } from '../../../lib/notificationService';
import { formatDate } from '../../../lib/utils';

interface AdminPrestadorPremiosProps {
  prestadorId: string;
  prestadorNome?: string;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
}

export function AdminPrestadorPremios({ 
  prestadorId, 
  prestadorNome, 
  colaboradorId, 
  colaboradorNome 
}: AdminPrestadorPremiosProps) {
  const [premios, setPremios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [formData, setFormData] = useState({ titulo: '', descricao: '' });

  useEffect(() => {
    let isMounted = true;
    const fetchPremiosLocal = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.from('prestador_premios').select('*').eq('prestador_id', prestadorId).order('created_at', { ascending: false });
        if (error) throw error;
        if (isMounted) setPremios(data || []);
      } catch (e) {
        toast.error('Erro ao carregar prêmios.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchPremiosLocal();
    const sub = supabase.channel(`admin-premios-${prestadorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_premios', filter: `prestador_id=eq.${prestadorId}` }, fetchPremiosLocal)
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
      const { error } = await supabase.from('prestador_premios').insert([{
        prestador_id: prestadorId,
        titulo: formData.titulo,
        descricao: formData.descricao,
        status: 'disponivel'
      }]);
      if (error) throw error;
      toast.success('Prêmio adicionado com sucesso.');
      setIsModalOpen(false);
      setFormData({ titulo: '', descricao: '' });
      setPremios(prev => [{
        id: 'temp-' + Date.now(),
        prestador_id: prestadorId,
        titulo: formData.titulo,
        descricao: formData.descricao,
        status: 'disponivel',
        created_at: new Date().toISOString()
      }, ...prev]);

      // Notificar Prestador
      await notificationService.notifyProvider(
        prestadorId,
        '🎁 Novo Prêmio Disponível!',
        `Você recebeu um novo prêmio: "${formData.titulo}". Acesse seu painel para resgatar.`,
        'premios',
        'prestador_premio_aprovado',
        { tab: 'premios' }
      );

      // Log action
      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'CRIAR_PREMIO_PRESTADOR',
        detalhes: `Adicionou o prêmio "${formData.titulo}" para o prestador ${prestadorNome || prestadorId}`
      });
    } catch (e) {
      toast.error('Erro ao adicionar prêmio.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const canProceed = await canDeleteRecord('prestador_premios', id);
    if (!canProceed) return;

    if (!confirm('Excluir este prêmio?')) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('prestador_premios').delete().eq('id', id);
      if (error) throw error;
      toast.success('Excluído.');
      
      // Update state directly for optimistic UI since fetchPremios doesn't exist anymore
      setPremios(prev => prev.filter(p => p.id !== id));

      // Log action
      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'EXCLUIR_PREMIO_PRESTADOR',
        detalhes: `Excluiu um prêmio (ID: ${id}) do prestador ${prestadorNome || prestadorId}`
      });
    } catch (e) {
      toast.error('Erro ao excluir.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="p-4 text-center">Carregando prêmios...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-center bg-rose-50 p-6 rounded-2xl border border-rose-100 gap-4">
        <div>
          <h4 className="font-bold text-rose-900">Gerenciar Prêmios</h4>
          <p className="text-sm text-rose-700">Reconheça o bom desempenho com presentes exclusivos.</p>
        </div>
        <button 
          onClick={() => {
            setFormData({ titulo: '', descricao: '' });
            setIsModalOpen(true);
          }} 
          className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-rose-600/20"
        >
          <Plus className="w-5 h-5"/> Adicionar Prêmio
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {premios.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 bg-neutral-50 rounded-2xl border-2 border-dashed border-neutral-200 col-span-full">
            <Gift className="w-12 h-12 mx-auto mb-3 opacity-20" />
            Nenhum prêmio registrado para este prestador.
          </div>
        ) : premios.map(p => (
          <div key={p.id} className="border border-neutral-200 rounded-2xl overflow-hidden bg-white shadow-sm flex flex-col hover:shadow-md transition-shadow">
            <div className="p-6 flex flex-col flex-1">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0 border border-rose-100">
                  <Gift className="w-6 h-6" />
                </div>
                <button onClick={() => handleDelete(p.id)} disabled={actionLoading} className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50" title="Excluir">
                  <Trash2 className="w-5 h-5"/>
                </button>
              </div>
              
              <h5 className="font-bold text-neutral-900 text-lg">{p.titulo}</h5>
              <p className="text-sm text-neutral-500 mb-6 flex-1 line-clamp-2 leading-relaxed">{p.descricao}</p>
              
              <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
                <span className={`px-3 py-1 text-[10px] uppercase font-black tracking-widest rounded-full ${
                  p.status === 'disponivel' ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-700'
                }`}>
                  {p.status}
                </span>
                
                {p.status === 'resgatado' && (
                  <div className="flex items-center gap-1.5 text-amber-700 font-bold text-[10px] bg-amber-100 px-3 py-1 rounded-full uppercase tracking-widest border border-amber-200">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Resgatado
                  </div>
                )}
              </div>
              
              {p.status === 'resgatado' && p.data_resgate && (
                <p className="mt-3 text-[10px] text-neutral-400 text-center font-medium italic">
                  Solicitado em {formatDate(p.data_resgate)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Novo Prêmio" size="wide">
        <form onSubmit={handleCreate} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-neutral-700 mb-1.5 flex items-center justify-between">
              Título do Prêmio
              <span className="text-[10px] text-neutral-400 font-normal uppercase">Obrigatório</span>
            </label>
            <input 
              required 
              type="text" 
              value={formData.titulo} 
              onChange={e=>setFormData({...formData, titulo: e.target.value})} 
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-5 py-3.5 focus:border-rose-500 focus:outline-none transition-all" 
              placeholder="Ex: Cesta Básica, Voucher de R$ 100" 
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-neutral-700 mb-1.5 flex items-center justify-between">
              Motivo / Descrição
              <span className="text-[10px] text-neutral-400 font-normal uppercase">Obrigatório</span>
            </label>
            <textarea 
              required 
              value={formData.descricao} 
              onChange={e=>setFormData({...formData, descricao: e.target.value})} 
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-5 py-3.5 focus:border-rose-500 focus:outline-none transition-all min-h-[120px]" 
              placeholder="Descreva o que o prestador ganhará e o motivo..." 
              rows={3} 
            />
          </div>
          
          <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 flex gap-3">
             <Gift className="w-5 h-5 text-rose-500 shrink-0" />
             <p className="text-xs text-rose-800 leading-relaxed font-medium">
                O prêmio ficará imediatamente disponível para resgate no painel do prestador.
             </p>
          </div>

          <button 
            type="submit" 
            disabled={actionLoading} 
            className="w-full bg-[#1a1a1a] hover:bg-black text-white font-bold py-4 rounded-2xl shadow-xl shadow-black/10 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {actionLoading ? 'Adicionando...' : 'Adicionar Prêmio'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
