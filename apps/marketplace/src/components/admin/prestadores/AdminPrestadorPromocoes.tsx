import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import { Tag, Plus, Trash2, Clock, Users, User, Phone, Search, Info } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { canDeleteRecord } from '../../../lib/deleteRequest';
import { notificationService } from '../../../lib/notificationService';
import { formatDate, formatDateTime } from '../../../lib/utils';

export function AdminPrestadorPromocoes() {
  const [promocoes, setPromocoes] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'ativa' | 'encerrada'>('ativa');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState<any>(null);
  const [ativacoes, setAtivacoes] = useState<any[]>([]);
  const [loadingAtivacoes, setLoadingAtivacoes] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [formData, setFormData] = useState({ titulo: '', descricao: '', regras: '', data_fim: '' });

  useEffect(() => {
    let isMounted = true;
    const fetchPromocoesLocal = async () => {
      try {
        setLoading(true);
        
        // Auto-update expired promotions
        const now = new Date().toISOString();
        const { data: expiredPromos } = await supabase
          .from('prestador_promocoes')
          .select('id')
          .eq('status', 'ativa')
          .lt('data_fim', now);

        if (expiredPromos && expiredPromos.length > 0) {
          await supabase
            .from('prestador_promocoes')
            .update({ status: 'encerrada' })
            .in('id', expiredPromos.map(p => p.id))
            .throwOnError();
        }

        const { data, error } = await supabase
          .from('prestador_promocoes')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          if (error.code === '42P01') {
            console.warn('Tabela prestador_promocoes não existe ainda.');
            if (isMounted) setPromocoes([]);
            return;
          }
          throw error;
        }
        if (isMounted) setPromocoes(data || []);
      } catch (e) {
        toast.error('Erro ao carregar promoções.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchPromocoesLocal();
    const sub = supabase.channel('admin-promocoes-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_promocoes' }, fetchPromocoesLocal)
      .subscribe();
    return () => { 
      isMounted = false;
      supabase.removeChannel(sub); 
    };
  }, [activeTab]);

  const getFilteredPromocoes = () => {
    return promocoes.filter(p => {
      if (activeTab === 'ativa') return p.status === 'ativa';
      return p.status === 'encerrada' || p.status === 'suspensa';
    });
  };

  const fetchAtivacoes = async (promoId: string) => {
    try {
      setLoadingAtivacoes(true);
      const { data, error } = await supabase
        .from('prestador_promocoes_ativacoes')
        .select(`
          id,
          created_at,
          ativa,
          prestadores (
            nome_razao,
            credencial_acesso,
            telefone,
            tipo_cadastro
          )
        `)
        .eq('promocao_id', promoId);

      if (error) throw error;
      setAtivacoes(data || []);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar participantes.');
    } finally {
      setLoadingAtivacoes(false);
    }
  };

  const openDetails = (promo: any) => {
    setSelectedPromo(promo);
    setIsDetailsModalOpen(true);
    fetchAtivacoes(promo.id);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const { error } = await supabase.from('prestador_promocoes').insert([{
        titulo: formData.titulo,
        descricao: formData.descricao,
        regras: formData.regras,
        data_fim: formData.data_fim || null,
        status: 'ativa'
      }]);
      if (error) throw error;
      toast.success('Promoção criada com sucesso.');
      setIsModalOpen(false);
      setFormData({ titulo: '', descricao: '', regras: '', data_fim: '' });
      setPromocoes(prev => [{
        id: 'temp-' + Date.now(),
        titulo: formData.titulo,
        descricao: formData.descricao,
        regras: formData.regras,
        data_fim: formData.data_fim || null,
        status: 'ativa',
        created_at: new Date().toISOString()
      }, ...prev]);

      // Notificar todos os prestadores sobre a nova promoção
      await notificationService.broadcastProviders(
        '🎁 Nova Campanha Disponível!',
        `A campanha "${formData.titulo}" acabou de ser lançada. Confira os detalhes e participe!`,
        'promocoes',
        'broadcast_promocao',
        { tab: 'promocoes' }
      );
    } catch (e) {
      toast.error('Erro ao criar promoção.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const canProceed = await canDeleteRecord('prestador_promocoes', id);
    if (!canProceed) return;

    if (!confirm('Excluir esta promoção? Todos os prestadores que participam perderão o acesso.')) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('prestador_promocoes').delete().eq('id', id);
      if (error) throw error;
      toast.success('Excluída.');
      setPromocoes(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      toast.error('Erro ao excluir.');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredAtivacoes = ativacoes.filter(a => 
    a.prestadores?.nome_razao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.prestadores?.credencial_acesso?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div>Carregando campanhas...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-fuchsia-50 p-4 rounded-xl border border-fuchsia-100 mb-6">
        <div>
          <h4 className="font-bold text-fuchsia-900">Promoções e Campanhas</h4>
          <p className="text-sm text-fuchsia-700">Gerencie campanhas de incentivo globais para os prestadores.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} disabled={actionLoading} className="btn-primary bg-fuchsia-600 hover:bg-fuchsia-700 text-sm disabled:opacity-50">
          <Plus className="w-4 h-4 mr-1"/> Nova Campanha
        </button>
      </div>

      <div className="flex gap-1 rounded-3xl bg-neutral-100 p-1 ring-1 ring-neutral-200 w-max mb-6">
        <button 
          onClick={() => setActiveTab('ativa')}
          className={`rounded-2xl px-6 py-2 text-sm font-bold transition-all ${activeTab === 'ativa' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
        >
          Campanhas Ativas
        </button>
        <button 
          onClick={() => setActiveTab('encerrada')}
          className={`rounded-2xl px-6 py-2 text-sm font-bold transition-all ${activeTab === 'encerrada' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
        >
          Encerradas/Histórico
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {getFilteredPromocoes().length === 0 ? (
          <div className="p-8 text-center text-neutral-500 col-span-full border-2 border-dashed border-neutral-200 rounded-3xl bg-neutral-50/50">
            Nenhuma campanha encontrada nesta categoria.
          </div>
        ) : getFilteredPromocoes().map(p => (
          <div key={p.id} className="border border-neutral-200 rounded-2xl overflow-hidden bg-white shadow-sm flex flex-col p-6 transition-all hover:shadow-md">
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 bg-fuchsia-50 text-fuchsia-600 rounded-xl flex items-center justify-center border border-fuchsia-100">
                <Tag className="w-6 h-6" />
              </div>
              <span className={`px-2 py-0.5 text-[10px] uppercase font-black tracking-widest rounded-full ${
                p.status === 'ativa' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                {p.status}
              </span>
            </div>
            
            <h5 className="font-black text-xl text-neutral-900 mb-2 leading-tight">{p.titulo}</h5>
            <p className="text-sm text-neutral-600 mb-6 flex-1 line-clamp-2">{p.descricao}</p>
            
            {p.regras && (
              <div className="bg-neutral-50 rounded-xl p-3 text-xs text-neutral-500 mb-6 border border-neutral-100 italic">
                <strong>Regras: </strong> {p.regras}
              </div>
            )}
            
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-neutral-500 font-medium pb-4 border-b border-neutral-100">
                {p.data_fim ? (
                  <span className="flex items-center gap-1.5 bg-neutral-100 px-2 py-1 rounded-lg">
                    <Clock className="w-3.5 h-3.5"/> Até {formatDate(p.data_fim)}
                  </span>
                ) : (
                  <span className="bg-neutral-100 px-2 py-1 rounded-lg">Sem prazo definido</span>
                )}
                
                <button onClick={() => handleDelete(p.id)} disabled={actionLoading} className="p-1.5 text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50" title="Excluir">
                  <Trash2 className="w-4 h-4"/>
                </button>
              </div>

              <button 
                onClick={() => openDetails(p)}
                className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-black py-3 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-fuchsia-600/10 flex items-center justify-center gap-2"
              >
                <Info className="w-4 h-4" />
                Detahes da Promoção
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Prestadores Cadastrados */}
      <Modal 
        isOpen={isDetailsModalOpen} 
        onClose={() => {
          setIsDetailsModalOpen(false);
          setAtivacoes([]);
          setSearchTerm('');
        }} 
        title={`Participantes: ${selectedPromo?.titulo}`}
        size="wide"
      >
        <div className="space-y-6">
          <div className="bg-fuchsia-50 p-6 rounded-[2rem] border border-fuchsia-100 shadow-inner">
             <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-fuchsia-600 shadow-sm">
                  <Tag className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-black text-fuchsia-900 text-lg uppercase tracking-tight">{selectedPromo?.titulo}</h4>
                  <p className="text-sm text-fuchsia-700/80 leading-relaxed font-medium">{selectedPromo?.descricao}</p>
                </div>
             </div>
             
             <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-fuchsia-200/50">
                <div className="text-center p-3 bg-white rounded-2xl shadow-sm">
                  <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1">Participantes</p>
                  <p className="text-2xl font-black text-fuchsia-600 leading-none">{ativacoes.length}</p>
                </div>
                <div className="text-center p-3 bg-white rounded-2xl shadow-sm">
                  <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1">Status</p>
                  <p className="text-xs font-black text-emerald-600 uppercase tracking-widest">{selectedPromo?.status}</p>
                </div>
                <div className="text-center p-3 bg-white rounded-2xl shadow-sm hidden sm:block">
                  <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1">Encerramento</p>
                  <p className="text-xs font-black text-neutral-900 uppercase">{selectedPromo?.data_fim ? formatDate(selectedPromo.data_fim) : 'INDETERMINADO'}</p>
                </div>
             </div>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou acesso..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl py-3 pl-10 pr-4 text-sm focus:border-fuchsia-500 focus:outline-none transition-all"
            />
          </div>

          <div className="max-h-[400px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            {loadingAtivacoes ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 rounded-full border-4 border-fuchsia-600 border-t-transparent animate-spin"/>
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Carregando participantes...</p>
              </div>
            ) : filteredAtivacoes.length === 0 ? (
              <div className="py-12 text-center bg-neutral-50 rounded-[2rem] border-2 border-dashed border-neutral-200">
                <Users className="w-12 h-12 text-neutral-200 mx-auto mb-3" />
                <p className="text-sm font-bold text-neutral-500 uppercase tracking-widest">Nenhum prestador encontrado</p>
              </div>
            ) : (
              filteredAtivacoes.map((ativ) => (
                <div key={ativ.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white rounded-[1.5rem] border border-neutral-200 hover:border-fuchsia-300 transition-all hover:shadow-md group">
                  <div className="flex items-center gap-4 mb-3 sm:mb-0">
                    <div className="w-12 h-12 rounded-2xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center group-hover:bg-fuchsia-600 group-hover:text-white transition-all flex-shrink-0">
                      <User className="w-6 h-6" />
                    </div>
                    <div>
                      <h5 className="font-black text-neutral-900 leading-tight uppercase tracking-tight">{ativ.prestadores?.nome_razao}</h5>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] font-black bg-neutral-100 px-2 py-0.5 rounded-lg text-neutral-500">ID: {ativ.prestadores?.credencial_acesso}</span>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-neutral-400">
                          <Phone className="w-3 h-3 text-emerald-500" />
                          {ativ.prestadores?.telefone}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between sm:flex-col sm:items-end pt-3 sm:pt-0 border-t sm:border-t-0 border-neutral-100">
                    <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest sm:mb-1">Participou em</p>
                    <p className="text-xs font-black text-neutral-900 group-hover:text-fuchsia-600 transition-colors">{formatDate(ativ.created_at)} {formatDateTime(ativ.created_at)}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pt-4 flex justify-end">
             <button 
              onClick={() => setIsDetailsModalOpen(false)}
              className="px-8 py-3 rounded-xl font-bold text-neutral-500 hover:bg-neutral-100 transition-colors uppercase tracking-widest text-[10px]"
             >
               Fechar Relatório
             </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nova Campanha/Promoção" size="wide">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Título da Campanha</label>
            <input required type="text" value={formData.titulo} onChange={e=>setFormData({...formData, titulo: e.target.value})} className="input-field" placeholder="Ex: Campanha 10 Serviços 5 Estrelas" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Descrição</label>
            <textarea required value={formData.descricao} onChange={e=>setFormData({...formData, descricao: e.target.value})} className="input-field" placeholder="Complete 10 serviços com avaliação 5 estrelas e ganhe bônus." rows={2} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Regras e Termos</label>
            <textarea required value={formData.regras} onChange={e=>setFormData({...formData, regras: e.target.value})} className="input-field" placeholder="Válido apenas para serviços da categoria X..." rows={3} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Data de Encerramento (Opcional)</label>
            <input type="date" value={formData.data_fim} onChange={e=>setFormData({...formData, data_fim: e.target.value})} className="input-field" />
          </div>
          <button type="submit" disabled={actionLoading} className="btn-primary w-full bg-fuchsia-600 hover:bg-fuchsia-700">Lançar Campanha</button>
        </form>
      </Modal>
    </div>
  );
}
