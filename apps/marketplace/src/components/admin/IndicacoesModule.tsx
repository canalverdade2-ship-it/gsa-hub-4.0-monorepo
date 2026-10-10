import React from 'react';
import { useState, useEffect } from 'react';
import { Search, Filter, UserPlus, CheckCircle2, Clock, XCircle, Info, ExternalLink, Ticket, Calendar, DollarSign, User, Copy, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate, copyToClipboard, maskPhone } from '../../lib/utils';
import { toast } from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { GlobalFilter } from '../ui/GlobalFilter';
import { processGamificationPointsManual } from '../../utils/gamification';
import { createNotification } from '../../lib/notifications';
import { notificationService } from '../../lib/notificationService';
import { logService } from '../../lib/logService';
import { fetchReferralSettings, includesPontosIndicador, formatIndicadorReward } from '../../utils/referralHelpers';
import { AdminWhatsAppButton } from './ui/AdminWhatsAppButton';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';

export function IndicacoesModule({ activeSubTab, initialItemId, colaboradorId, colaboradorNome }: { activeSubTab?: 'aberta' | 'concluída' | 'cancelada', initialItemId?: string, colaboradorId?: string, colaboradorNome?: string | null }) {
  const [activeTab, setActiveTab] = useState<'aberta' | 'concluída' | 'cancelada'>('aberta');

  useEffect(() => {
    if (activeSubTab) setActiveTab(activeSubTab);
  }, [activeSubTab]);

  const [indicacoes, setIndicacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const hasAutoOpened = React.useRef<string | null>(null);

  useEffect(() => {
    if (initialItemId && indicacoes.length > 0 && hasAutoOpened.current !== initialItemId) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`ind-${initialItemId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedId(initialItemId);
          
          const ind = indicacoes.find(i => i.id === initialItemId);
          if (ind) {
            setSelectedIndicacao(ind);
            setIsModalOpen(true);
            hasAutoOpened.current = initialItemId;
          }

          setTimeout(() => setHighlightedId(null), 3000);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialItemId, indicacoes]);

  const [filters, setFilters] = useState<Record<string, any>>({
    mes: '',
    ano: ''
  });
  const [selectedIndicacao, setSelectedIndicacao] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [clientes, setClientes] = useState<any[]>([]);
  const [newFormData, setNewFormData] = useState({
    indicador_id: '',
    indicado_nome: '',
    whatsapp_indicado: '',
    data_indicacao: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchIndicacoes();
    fetchClientes();

    const channel = supabase
      .channel('admin-indicacoes-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'indicacoes' }, fetchIndicacoes)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTab, filters, search]);

  const fetchClientes = async () => {
    try {
      const { data, error } = await supabase.from('clientes').select('id, nome, cpf').eq('status', 'ativo').order('nome');
      if (error) throw error;
      if (data) setClientes(data);
    } catch (err: any) {
      toast.error('Erro ao carregar clientes.');
    }
  };

  const fetchIndicacoes = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('indicacoes')
        .select(`
          *,
          indicador:clientes!indicador_id (
            nome, cpf, telefone
          ),
          vouchers!voucher_id (
            codigo_voucher, validade
          )
        `)
        .eq('status', activeTab);
      
      if (search) {
        query = query.or(`indicado_nome.ilike.%${search}%,whatsapp_indicado.ilike.%${search}%`);
      }

      if (filters.mes) {
        const year = filters.ano || new Date().getFullYear();
        const startDate = `${year}-${filters.mes}-01`;
        const endDate = new Date(Number(year), Number(filters.mes), 0).toISOString().split('T')[0];
        query = query.gte('data_indicacao', startDate).lte('data_indicacao', endDate);
      }
      
      const { data, error } = await query.order('data_criacao', { ascending: false });

      if (error) {
        console.error('Supabase error fetching indicacoes:', error);
        throw error;
      }
      
      if (data) {
        setIndicacoes(data || []);
      }
    } catch (err) {
      console.error('Error fetching indicacoes:', err);
      toast.error('Erro ao carregar indicações');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateIndicacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFormData.indicador_id || !newFormData.whatsapp_indicado) {
      return toast.error('Preencha os campos obrigatórios.');
    }

    const cleanPhone = newFormData.whatsapp_indicado.replace(/\D/g, '');
    if (cleanPhone.length !== 11) {
      return toast.error('WhatsApp inválido. Use DDD + 9 dígitos.');
    }

    setLoading(true);
    try {
      // Buscar configurações dinâmicas
      const refSettings = await fetchReferralSettings();
      const bonusAmount = refSettings.indicador_limite_carteira;
      const descPercent = refSettings.indicado_desconto_porcentagem;

      // Só cria voucher se o tipo do indicado incluir desconto
      let voucherId: string | null = null;
      if (refSettings.indicado_tipo !== 'pontos') {
        const { data: voucherData, error: vError } = await supabase.from('vouchers').insert([{
          codigo_voucher: cleanPhone,
          tipo_desconto: 'porcentagem',
          valor_desconto: descPercent,
          validade: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
          uso_unico: true,
          status: 'ativo',
          descricao: `Indicação Manual: ${newFormData.indicado_nome}`
        }]).select().single();

        if (vError) console.error('Erro ao criar voucher manual:', vError);
        voucherId = voucherData?.id || null;
      }

      const { error } = await supabase.from('indicacoes').insert([{
        indicador_id: newFormData.indicador_id,
        indicado_nome: newFormData.indicado_nome,
        whatsapp_indicado: cleanPhone,
        data_indicacao: newFormData.data_indicacao,
        bonus_indicador: bonusAmount,
        voucher_id: voucherId,
        status: 'aberta'
      }]);

      if (error) throw error;

      toast.success('Indicação criada com sucesso!');
      
      // Log Action
      await logService.logAction({
        acao: 'CRIAR_INDICACAO',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `Registrou indicação manual de ${newFormData.indicado_nome} para o indicador ${clientes.find(c => c.id === newFormData.indicador_id)?.nome || 'ID: ' + newFormData.indicador_id}`
      });

      setIsNewModalOpen(false);
      setNewFormData({
        indicador_id: '',
        indicado_nome: '',
        whatsapp_indicado: '',
        data_indicacao: new Date().toISOString().split('T')[0]
      });
      fetchIndicacoes();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao criar indicação');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: string, indicadorId?: string, indicadoNome?: string) => {
    try {
      const { error } = await supabase
        .from('indicacoes')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
      
      if (status === 'concluída' && indicadorId) {
        // Buscar configurações dinâmicas
        const settings = await fetchReferralSettings();

        // Creditar pontos ao indicador (se configurado)
        if (includesPontosIndicador(settings.indicador_tipo) && settings.indicador_valor_pontos > 0) {
          await processGamificationPointsManual(
            indicadorId,
            settings.indicador_valor_pontos,
            `Bônus por indicação convertida: ${indicadoNome || 'amigo'}`,
            'indicacao'
          );
        }

        const recompensaTexto = formatIndicadorReward(settings);
        await notificationService.notifyClient(
          indicadorId,
          '🤝 Indicação Convertida!',
          `Sua indicação de ${indicadoNome || 'um amigo'} foi convertida com sucesso! Você ganhará ${recompensaTexto} após o pagamento da 1ª fatura. 🏆`,
          'indique-ganhe',
          'indicacao_convertida',
          { prioridade: 'alta', contexto: { indicado: indicadoNome, recompensa: recompensaTexto } }
        );
      } else if (status === 'cancelada' && indicadorId) {
        await notificationService.notifyClient(
          indicadorId,
          '❌ Indicação Cancelada',
          `Sua indicação de ${indicadoNome || 'um amigo'} foi cancelada. ⚠️`,
          'indique-ganhe',
          'indicacao_cancelada',
          { prioridade: 'normal', contexto: { indicado: indicadoNome } }
        );
      }
      
      toast.success('Status atualizado com sucesso!');

      // Log Action
      await logService.logAction({
        acao: status === 'concluída' ? 'CONVERTER_INDICACAO' : 'CANCELAR_INDICACAO',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        detalhes: `${status === 'concluída' ? 'Converteu' : 'Cancelou'} a indicação de ${indicadoNome || 'N/A'}`
      });

      fetchIndicacoes();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao atualizar status');
    }
  };

  const filteredIndicacoes = indicacoes.filter(ind => {
    const searchLower = search.toLowerCase();
    const indicadoNome = (ind.indicado_nome || ind.whatsapp_indicado || '').toLowerCase();
    const indicadorNome = (ind.indicador?.nome || '').toLowerCase();
    
    return indicadoNome.includes(searchLower) || indicadorNome.includes(searchLower);
  });

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 px-2 mb-1">
        <button
          onClick={() => setIsNewModalOpen(true)}
          className="flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all"
        >
          <Plus className="h-4 w-4" />
          Nova Indicação
        </button>
        
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
              label: 'Mês da Indicação',
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
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-3xl bg-neutral-100" />
          ))
        ) : filteredIndicacoes.length > 0 ? (
          filteredIndicacoes.map((ind) => (
            <div 
              key={ind.id} 
              id={`ind-${ind.id}`}
              className={`rounded-2xl bg-white p-4 md:p-5 shadow-sm ring-1 ring-neutral-200 transition-all hover:shadow-md ${
                highlightedId === ind.id 
                  ? 'bg-indigo-50/50 ring-2 ring-indigo-500 scale-[1.01] z-10 shadow-lg' 
                  : ''
              }`}
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <UserPlus className="h-6 w-6" />
                </div>
                <div className="flex flex-col gap-2">
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider text-center ${
                    ind.status === 'aberta' ? 'bg-amber-50 text-amber-600' :
                    ind.status === 'concluída' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                  }`}>
                    {ind.status}
                  </span>
                  {ind.data_cadastro_indicado && (
                    <span className="flex items-center justify-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Cadastrado
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="font-bold text-neutral-900">{ind.indicado_nome || ind.whatsapp_indicado}</h3>
                <p className="text-xs text-neutral-500">Indicado por: <span className="font-bold text-neutral-700">{ind.indicador?.nome}</span></p>
                <p className="text-xs text-neutral-500">Data: {formatDate(ind.data_indicacao)}</p>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <button
                  onClick={() => {
                    setSelectedIndicacao(ind);
                    setIsModalOpen(true);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-100 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-200 transition-colors"
                >
                  <Info className="h-4 w-4" />
                  Ver Detalhes
                </button>

                {ind.status === 'aberta' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateStatus(ind.id, 'concluída', ind.indicador_id, ind.indicado_nome)}
                      className="flex-1 rounded-xl bg-emerald-50 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-100"
                    >
                      Converter
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(ind.id, 'cancelada', ind.indicador_id, ind.indicado_nome)}
                      className="flex-1 rounded-xl bg-rose-50 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-12 text-center">
            <UserPlus className="mx-auto mb-4 h-12 w-12 text-neutral-200" />
            <p className="text-neutral-500">Nenhuma indicação encontrada.</p>
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Detalhes da Indicação"
        size="wide"
      >
        {selectedIndicacao && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-neutral-50 p-6 ring-1 ring-neutral-200">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
                    selectedIndicacao.status === 'aberta' ? 'bg-amber-100 text-amber-700' :
                    selectedIndicacao.status === 'concluída' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {selectedIndicacao.status}
                  </span>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase">ID: {selectedIndicacao.id.slice(0, 8)}</span>
                </div>
                <AdminWhatsAppButton 
                  telefone={selectedIndicacao.whatsapp_indicado}
                  mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                    tipo: 'indicacao',
                    clienteNome: selectedIndicacao.indicado_nome,
                    status: selectedIndicacao.status === 'concluída' ? 'Concluída' : selectedIndicacao.status === 'cancelada' ? 'Cancelada' : 'Em Aberto'
                  })}
                  className="shrink-0"
                />
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200">
                  <UserPlus className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-neutral-900">{selectedIndicacao.indicado_nome || selectedIndicacao.whatsapp_indicado || 'Nome não informado'}</h3>
                  <p className="text-sm text-neutral-500">{maskPhone(selectedIndicacao.whatsapp_indicado)}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-neutral-100 p-4">
                <div className="mb-2 flex items-center gap-2 text-neutral-400">
                  <User className="h-4 w-4" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Indicador</span>
                </div>
                <p className="font-bold text-neutral-900">{selectedIndicacao.indicador?.nome}</p>
                <p className="text-xs text-neutral-500">{selectedIndicacao.indicador?.cpf}</p>
                <p className="text-xs text-neutral-500">{selectedIndicacao.indicador?.telefone}</p>
              </div>

              <div className="rounded-2xl border border-neutral-100 p-4">
                <div className="mb-2 flex items-center gap-2 text-neutral-400">
                  <Ticket className="h-4 w-4" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Voucher Gerado</span>
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-mono font-bold text-indigo-600">{selectedIndicacao.vouchers?.codigo_voucher || maskPhone(selectedIndicacao.whatsapp_indicado) || 'N/A'}</p>
                  {(selectedIndicacao.vouchers?.codigo_voucher || selectedIndicacao.whatsapp_indicado) && (
                    <button
                      onClick={async () => {
                        const code = selectedIndicacao.vouchers?.codigo_voucher || selectedIndicacao.whatsapp_indicado;
                        const success = await copyToClipboard(code);
                        if (success) {
                          toast.success('Código copiado!');
                        } else {
                          toast.error('Erro ao copiar código.');
                        }
                      }}
                      className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 hover:bg-indigo-100 transition-colors"
                      title="Copiar código"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-neutral-500">Validade: {formatDate(selectedIndicacao.vouchers?.validade || (selectedIndicacao.data_indicacao ? new Date(new Date(selectedIndicacao.data_indicacao).getTime() + 15 * 24 * 60 * 60 * 1000).toISOString() : null))}</p>
              </div>

              <div className="rounded-2xl border border-neutral-100 p-4">
                <div className="mb-2 flex items-center gap-2 text-neutral-400">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Bônus (Indicador)</span>
                </div>
                <p className="text-lg font-bold text-neutral-900">
                  {selectedIndicacao.bonus_indicador > 0
                    ? formatCurrency(selectedIndicacao.bonus_indicador)
                    : '—'}
                </p>
                <p className="text-xs text-neutral-500">
                  {selectedIndicacao.bonus_indicador > 0
                    ? 'Crédito em carteira (após pagamento 1ª fatura)'
                    : 'Liberado após pagamento da 1ª fatura'}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-100 p-4">
                <div className="mb-2 flex items-center gap-2 text-neutral-400">
                  <Calendar className="h-4 w-4" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Datas</span>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-neutral-500">Indicação: <span className="font-bold text-neutral-700">{formatDate(selectedIndicacao.data_indicacao)}</span></p>
                  {selectedIndicacao.data_cadastro_indicado && (
                    <p className="text-xs text-neutral-500">Cadastro: <span className="font-bold text-neutral-700">{formatDate(selectedIndicacao.data_cadastro_indicado)}</span></p>
                  )}
                  {selectedIndicacao.data_conclusao && (
                    <p className="text-xs text-neutral-500">Conclusão: <span className="font-bold text-neutral-700">{formatDate(selectedIndicacao.data_conclusao)}</span></p>
                  )}
                </div>
              </div>
            </div>

            {selectedIndicacao.status === 'aberta' && (
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    handleUpdateStatus(selectedIndicacao.id, 'concluída', selectedIndicacao.indicador_id, selectedIndicacao.indicado_nome);
                    setIsModalOpen(false);
                  }}
                  className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
                >
                  Confirmar Conversão
                </button>
                <button
                  onClick={() => {
                    handleUpdateStatus(selectedIndicacao.id, 'cancelada', selectedIndicacao.indicador_id, selectedIndicacao.indicado_nome);
                    setIsModalOpen(false);
                  }}
                  className="flex-1 rounded-xl bg-rose-50 py-3 text-sm font-bold text-rose-600 hover:bg-rose-100 transition-all"
                >
                  Cancelar Indicação
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        title="Nova Indicação Manual"
      >
        <form onSubmit={handleCreateIndicacao} className="space-y-5">
          <div className="rounded-2xl bg-neutral-50 p-5 ring-1 ring-neutral-100">
            <p className="text-sm text-neutral-600">Utilize este formulário para registrar uma indicação recebida manualmente ou por outros canais.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-bold text-neutral-700">Quem está indicando? *</label>
              <select
                required
                value={newFormData.indicador_id}
                onChange={e => setNewFormData({...newFormData, indicador_id: e.target.value})}
                className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Selecione um cliente...</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nome} ({c.cpf})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-neutral-700">Nome do Amigo (Indicado)</label>
                <input
                  type="text"
                  placeholder="Ex: João Silva"
                  value={newFormData.indicado_nome}
                  onChange={e => {
                    const value = e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').toUpperCase();
                    setNewFormData({...newFormData, indicado_nome: value});
                  }}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-neutral-700">WhatsApp do Amigo *</label>
                <input
                  type="text"
                  required
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                  value={newFormData.whatsapp_indicado}
                  onChange={e => setNewFormData({...newFormData, whatsapp_indicado: maskPhone(e.target.value)})}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-neutral-700">Data da Indicação</label>
              <input
                type="date"
                required
                value={newFormData.data_indicacao}
                onChange={e => setNewFormData({...newFormData, data_indicacao: e.target.value})}
                className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsNewModalOpen(false)}
              className="flex-1 rounded-xl bg-neutral-100 py-3 text-sm font-bold text-neutral-700 hover:bg-neutral-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700"
            >
              Criar Indicação
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
