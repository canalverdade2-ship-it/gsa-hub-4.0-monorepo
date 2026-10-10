import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar, Clock, CheckCircle, XCircle, Info, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Promocao } from '../../types';
import { Modal } from '../ui/Modal';
import { GlobalFilter } from '../ui/GlobalFilter';
import { PromoDetalhesModal } from './PromoDetalhesModal';
import { formatDate, formatDateTime, generateCode } from '../../lib/utils';
import { toast } from 'react-hot-toast';
import { createNotification } from '../../lib/notifications';
import { notificationService } from '../../lib/notificationService';
import { canDeleteRecord } from '../../lib/deleteRequest';
import { logService } from '../../lib/logService';
import { AdminWhatsAppButton } from './ui/AdminWhatsAppButton';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { useConfirm } from '../../hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';

export function PromocoesModule({ activeSubTab, initialItemId, colaboradorId, colaboradorNome }: { activeSubTab?: 'ativas' | 'encerradas', initialItemId?: string, colaboradorId?: string, colaboradorNome?: string | null }) {
  const [activeTab, setActiveTab] = useState<'ativas' | 'encerradas'>('ativas');
  const confirmHook = useConfirm();

  useEffect(() => {
    if (activeSubTab) setActiveTab(activeSubTab);
  }, [activeSubTab]);
  const [promocoes, setPromocoes] = useState<Promocao[]>([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({
    mes: '',
    ano: ''
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState<Promocao | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    tipo: 'geral' as 'servico' | 'produto' | 'assinatura' | 'geral',
    tipo_desconto: 'nenhum' as 'valor' | 'porcentagem' | 'nenhum',
    valor_desconto: 0,
    data_inicio_divulgacao: '',
    data_fim_divulgacao: '',
    prazo_valor: 1,
    prazo_unidade: 'meses'
  });

  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    if (initialItemId && promocoes.length > 0) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`promo-${initialItemId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedId(initialItemId);
          setTimeout(() => setHighlightedId(null), 3000);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialItemId, promocoes]);

  useEffect(() => {
    fetchPromocoes();

    const channel = supabase
      .channel('admin-promocoes-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'promocoes'
      }, () => {
        fetchPromocoes();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [search, filters]);

  const fetchPromocoes = async () => {
    let query = supabase
      .from('promocoes')
      .select('*');

    if (search) {
      query = query.or(`titulo.ilike.%${search}%,codigo_promocao.ilike.%${search}%`);
    }

    if (filters.mes) {
      const year = filters.ano || new Date().getFullYear();
      const startDate = `${year}-${filters.mes}-01`;
      const endDate = new Date(Number(year), Number(filters.mes), 0).toISOString().split('T')[0];
      query = query.gte('created_at', startDate).lte('created_at', endDate);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching promocoes:', error);
    } else {
      setPromocoes(data || []);
    }
  };

  const openDetails = (promo: Promocao) => {
    setSelectedPromo(promo);
    setIsDetailsModalOpen(true);
  };

  const handleSuspender = async (id: string, status: 'ativa' | 'suspensa') => {
    const { error } = await supabase
      .from('promocoes')
      .update({ status })
      .eq('id', id);

    if (error) {
      toast.error('Erro ao atualizar status da promoção.');
    } else {
      toast.success('Promoção atualizada.');
      
      // Log Action
      await logService.logAction({
        acao: status === 'suspensa' ? 'SUSPENDER_PROMOCAO' : 'ATIVAR_PROMOCAO',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `${status === 'suspensa' ? 'Suspendeu' : 'Ativou'} a promoção ID: ${id}`
      });

      fetchPromocoes();
      setIsDetailsModalOpen(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    let meses = formData.prazo_valor;
    if (formData.prazo_unidade === 'dias') meses = Math.round(formData.prazo_valor / 30);
    else if (formData.prazo_unidade === 'semanas') meses = Math.round(formData.prazo_valor / 4);
    else if (formData.prazo_unidade === 'anos') meses = formData.prazo_valor * 12;

    try {
      const { data: newPromo, error } = await supabase
        .from('promocoes')
        .insert([{
          titulo: formData.titulo,
          descricao: formData.descricao,
          tipo: formData.tipo,
          tipo_desconto: formData.tipo_desconto,
          valor_desconto: formData.valor_desconto,
          status: 'ativa',
          data_inicio_divulgacao: new Date(formData.data_inicio_divulgacao).toISOString(),
          data_fim_divulgacao: new Date(formData.data_fim_divulgacao).toISOString(),
          prazo_validade_meses: meses
        }])
        .select()
        .single();

      if (error) throw error;

      // Broadcast para todos os clientes
      await notificationService.broadcastClients(
        '🔥 Nova Promoção!',
        `Confira a nova promoção: ${formData.titulo}`,
        'promocoes',
        'promocao_criada',
        { itemId: newPromo.id, prioridade: 'alta', contexto: { titulo: formData.titulo, tipo: formData.tipo } }
      );

      // Log Action
      await logService.logAction({
        acao: 'CRIAR_PROMOCAO',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `Criou a promoção: ${formData.titulo} (${formData.tipo})`
      });

      toast.success('Promoção cadastrada com sucesso!');
      setIsModalOpen(false);
      setFormData({
        titulo: '',
        descricao: '',
        tipo: 'geral',
        tipo_desconto: 'nenhum',
        valor_desconto: 0,
        data_inicio_divulgacao: '',
        data_fim_divulgacao: '',
        prazo_valor: 1,
        prazo_unidade: 'meses'
      });
      fetchPromocoes();
    } catch (error: any) {
      console.error('Erro detalhado ao cadastrar promoção:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        fullError: error
      });
      toast.error('Erro ao cadastrar promoção: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const canProceed = await canDeleteRecord('promocoes', id);
    if (!canProceed) return;

    const ok = await confirmHook.confirm({
      title: 'Excluir promoção',
      message: 'Excluir esta promoção?',
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;
    // confirmHook is used for other confirms in this component

    setLoading(true);
    try {
      const { error } = await supabase
        .from('promocoes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Promoção excluída.');
      
      // Log Action
      await logService.logAction({
        acao: 'EXCLUIR_PROMOCAO',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `Excluiu permanentemente a promoção ID: ${id}`
      });

      fetchPromocoes();
    } catch (err: any) {
      console.error('Erro ao excluir promoção:', err);
      toast.error('Erro ao excluir promoção: ' + (err.message || 'Falha inesperada'));
    } finally {
      setLoading(false);
    }
  };

  const getFilteredPromocoes = () => {
    return promocoes.filter(p => {
      if (activeTab === 'ativas') return p.status === 'ativa';
      return p.status === 'encerrada' || p.status === 'suspensa' || p.status === 'usada';
    });
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
      <ConfirmDialog {...confirmHook} />
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
          Nova Promoção
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {getFilteredPromocoes().map((promo) => (
          <div 
            key={promo.id} 
            id={`promo-${promo.id}`}
            className={`group relative overflow-hidden rounded-[2rem] p-[2px] transition-all duration-500 hover:shadow-2xl flex flex-col 
              ${
                highlightedId === promo.id 
                  ? 'bg-indigo-600 ring-4 ring-indigo-500 scale-[1.02] z-20 shadow-2xl' 
                  : (
                    promo.status === 'ativa' ? 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 shadow-emerald-500/20' : 
                    promo.status === 'suspensa' ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/10' :
                    promo.status === 'cancelada' || promo.status === 'encerrada' ? 'bg-gradient-to-br from-neutral-200 to-neutral-300' :
                    'bg-gradient-to-br from-indigo-500 via-purple-500 to-violet-600 shadow-indigo-500/20'
                  )
              }`}
          >
            {/* Overlay Blur for aesthetic */}
            <div className="absolute inset-0 bg-white/40 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-xl pointer-events-none" />
            
            <div className="flex flex-1 flex-col rounded-[1.9rem] bg-white p-6 relative z-10">
              
              {/* Status Badges */}
              {promo.status === 'ativa' && (
                <div className="absolute top-5 right-5 bg-emerald-50 text-emerald-600 text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5 ring-1 ring-emerald-500/20 shadow-sm">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div> Ativada
                </div>
              )}
              {promo.status === 'suspensa' && (
                <div className="absolute top-5 right-5 bg-amber-50 text-amber-600 text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5 ring-1 ring-amber-500/20 shadow-sm">
                  <AlertCircle className="w-3 h-3" /> Suspensa
                </div>
              )}
              {promo.status === 'encerrada' && (
                <div className="absolute top-5 right-5 bg-neutral-50 text-neutral-500 text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5 ring-1 ring-neutral-200">
                  <Clock className="w-3 h-3" /> Encerrada
                </div>
              )}

              {/* Title Header with tag */}
              <div className="mb-5 flex-1 pr-24">
                <span className={`inline-block px-3 py-1 mb-3 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm ${
                  promo.status === 'ativa' ? 'bg-emerald-900 text-emerald-100' : 
                  promo.status === 'suspensa' ? 'bg-amber-900 text-amber-100' : 
                  promo.status === 'encerrada' ? 'bg-neutral-800 text-neutral-100' :
                  'bg-indigo-900 text-indigo-100'
                }`}>
                  {promo.tipo}
                </span>

                <h3 className={`text-xl font-black tracking-tight leading-tight mb-2 transition-colors duration-300
                  ${promo.status === 'ativa' ? 'text-emerald-950 group-hover:text-emerald-700' : 
                    promo.status === 'suspensa' ? 'text-amber-950 group-hover:text-amber-700' :
                    promo.status === 'encerrada' ? 'text-neutral-900' :
                    'group-hover:text-indigo-600 text-neutral-900'}`}
                >
                  {promo.titulo}
                </h3>
<div className="mb-4">
                <span className="font-mono text-[9px] font-black text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-lg ring-1 ring-indigo-100 inline-block shadow-sm">
                  CÓD: {promo.codigo_promocao}
                </span>
</div>
                <p className="text-sm font-medium text-neutral-500 line-clamp-2 leading-relaxed">
                  {promo.descricao}
                </p>
              </div>

              {/* Action Buttons & Info Footer */}
              <div className="mt-auto space-y-4 pt-4 border-t border-neutral-100/60">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  <Calendar className="h-4 w-4 text-neutral-300" />
                  <span>Divulgação: {formatDate(promo.data_inicio_divulgacao)} <span className="text-neutral-200 mx-0.5">—</span> {formatDate(promo.data_fim_divulgacao)}</span>
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => openDetails(promo)}
                    className="flex-1 rounded-xl bg-neutral-100 py-3 text-xs font-black uppercase tracking-widest text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Info className="w-4 h-4" /> Relatórios
                  </button>
                  <AdminWhatsAppButton 
                    mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                      tipo: 'promocao',
                      titulo: promo.titulo,
                      codigo: promo.codigo_promocao,
                      status: promo.status === 'ativa' ? 'Ativa' : 'Encerrada'
                    })}
                    className="rounded-xl h-auto aspect-square w-10 sm:w-12"
                  />
                </div>
              </div>

            </div>
          </div>
        ))}
      </div>
      {getFilteredPromocoes().length === 0 && (
        <div className="col-span-full py-24 text-center">
          <Calendar className="h-16 w-16 text-neutral-100 mx-auto mb-4" />
          <p className="text-sm font-black text-neutral-300 uppercase tracking-widest">Nenhuma promoção encontrada nesta aba.</p>
        </div>
      )}

      <PromoDetalhesModal 
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        promo={selectedPromo}
        onDelete={handleDelete}
        onSuspender={handleSuspender}
        colaboradorNome={colaboradorNome}
      />

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title="Cadastrar Promoção"
        size="2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-neutral-700 mb-1">Título da Promoção</label>
            <input 
              type="text" 
              required
              value={formData.titulo}
              onChange={e => setFormData({...formData, titulo: e.target.value})}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 focus:border-indigo-500 focus:outline-none"
              placeholder="Ex: Desconto de Verão"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-neutral-700 mb-1">Tipo de Promoção</label>
            <select 
              required
              value={formData.tipo}
              onChange={e => setFormData({...formData, tipo: e.target.value as any})}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 focus:border-indigo-500 focus:outline-none"
            >
              <option value="geral">Geral</option>
              <option value="servico">Serviço</option>
              <option value="produto">Produto</option>
              <option value="assinatura">Assinatura</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-neutral-700 mb-1">Descrição</label>
            <textarea 
              required
              value={formData.descricao}
              onChange={e => setFormData({...formData, descricao: e.target.value})}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 focus:border-indigo-500 focus:outline-none h-24"
              placeholder="Descreva os detalhes da promoção..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-neutral-700 mb-1">Oferece desconto automático?</label>
              <select
                value={formData.tipo_desconto}
                onChange={e => setFormData({...formData, tipo_desconto: e.target.value as any, valor_desconto: 0})}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 focus:border-indigo-500 focus:outline-none"
              >
                <option value="nenhum">Não (Apenas Publicidade)</option>
                <option value="valor">Sim, Valor Fixo (R$)</option>
                <option value="porcentagem">Sim, Porcentagem (%)</option>
              </select>
            </div>
            {formData.tipo_desconto !== 'nenhum' && (
              <div>
                <label className="block text-sm font-bold text-neutral-700 mb-1">
                  Valor do Desconto ({formData.tipo_desconto === 'valor' ? 'R$' : '%'})
                </label>
                <input 
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={formData.valor_desconto || ''}
                  inputMode="numeric"
onChange={(e) => setFormData({...formData, valor_desconto: parseFloat(e.target.value) || 0})}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-neutral-700 mb-1">Início da Divulgação</label>
              <input 
                type="date" 
                required
                value={formData.data_inicio_divulgacao}
                onChange={e => setFormData({...formData, data_inicio_divulgacao: e.target.value})}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-neutral-700 mb-1">Fim da Divulgação</label>
              <input 
                type="date" 
                required
                value={formData.data_fim_divulgacao}
                onChange={e => setFormData({...formData, data_fim_divulgacao: e.target.value})}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-neutral-700 mb-1">Prazo de Validade</label>
            <div className="flex gap-4">
              <input  
                type="number" 
                required
                min="1"
                value={formData.prazo_valor}
                inputMode="numeric"
onChange={(e) => setFormData({...formData, prazo_valor: parseInt(e.target.value)})}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 focus:border-indigo-500 focus:outline-none"
              />
              <select
                value={formData.prazo_unidade}
                onChange={e => setFormData({...formData, prazo_unidade: e.target.value})}
                className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 focus:border-indigo-500 focus:outline-none"
              >
                <option value="dias">Dias</option>
                <option value="semanas">Semanas</option>
                <option value="meses">Meses</option>
                <option value="anos">Anos</option>
              </select>
            </div>
          </div>
          <div className="pt-4">
            <button 
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-indigo-600 py-3 font-bold text-white shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50"
            >
              {loading ? 'Cadastrando...' : 'Cadastrar Promoção'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
