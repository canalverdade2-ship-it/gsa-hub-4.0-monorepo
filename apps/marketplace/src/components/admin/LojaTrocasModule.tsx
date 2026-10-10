import { useState, useEffect, useRef } from 'react';
import { Search, MoreHorizontal, FileText, CheckCircle, XCircle, AlertCircle, RefreshCcw, User, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { LojaSolicitacao } from '../../types';
import { Modal } from '../ui/Modal';
import { formatDate } from '../../lib/utils';
import { toast } from 'react-hot-toast';
import { logService } from '../../lib/logService';
import { notificationService } from '../../lib/notificationService';
import { sessionService } from '../../lib/sessionService';

const getAdminSessionForRpc = () => {
  const session = sessionService.getCurrentSession();
  if (!session?.sessaoId || !session?.sessionToken) {
    throw new Error('Sessao administrativa expirada. Faca login novamente.');
  }
  return session;
};

export function LojaTrocasModule({ colaboradorId, colaboradorNome }: { colaboradorId?: string, colaboradorNome?: string }) {
  const [activeTab, setActiveTab] = useState<'pendentes' | 'historico'>('pendentes');
  const [solicitacoes, setSolicitacoes] = useState<LojaSolicitacao[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<LojaSolicitacao | null>(null);
  
  const PAGE_SIZE = 30;
  const [page, setPage] = useState(0);
  
  const [resolucaoInput, setResolucaoInput] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Estados para fluxo avançado de logística (Instruções, Endereço, Agendamento e Rastreio)
  const [enderecoDevolucaoInput, setEnderecoDevolucaoInput] = useState('');
  const [dataAgendamentoInput, setDataAgendamentoInput] = useState('');
  const [rastreioAdminInput, setRastreioAdminInput] = useState('');

  const fetchSolicitacoesRef = useRef<() => void>(() => {});

  // Debounce da busca para não recriar canal nem sobrecarregar o banco
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Recarrega os dados ao trocar de aba, página ou termo de busca
  useEffect(() => {
    fetchSolicitacoes();
  }, [activeTab, page, debouncedSearch]);

  // Inscrição Realtime estável: canal mantido aberto sem recriação a cada digitação
  useEffect(() => {
    const channel = supabase
      .channel('admin-loja-solicitacoes-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loja_solicitacoes' }, () => {
        fetchSolicitacoesRef.current();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchSolicitacoes = async () => {
    let query = supabase.from('loja_solicitacoes').select('id, cliente_id, tipo, status, motivo, metodo_entrega, endereco_devolucao, data_agendamento, rastreio_cliente, rastreio_admin, valor_diferenca, resposta_admin, historico_status, created_at, updated_at, descricao_detalhada, imagens_anexo, clientes(nome, email), orcamentos!orcamento_origem_id(codigo_orcamento, protocolo)');
    
    if (activeTab === 'pendentes') {
      query = query.in('status', ['pendente', 'em_analise', 'aprovado', 'aguardando_instrucoes', 'aguardando_devolucao', 'devolucao_postada', 'agendado', 'devolucao_recebida', 'novo_produto_enviado']);
    } else {
      query = query.in('status', ['rejeitado', 'concluido']);
    }

    const searchTerm = debouncedSearch.trim();
    if (searchTerm) {
      query = query.ilike('motivo', `%${searchTerm}%`);
    }

    let data;
    let error;
    try {
      const res = await query
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      data = res.data;
      error = res.error;
      if (error) throw error;
    } catch (err) {
      toast.error('Erro ao carregar solicitações.');
      return;
    }
    if (error) {
      console.error('Erro ao buscar loja_solicitacoes:', error);
    }
    if (data) setSolicitacoes(data as unknown as LojaSolicitacao[]);
  };

  fetchSolicitacoesRef.current = fetchSolicitacoes;

  const handleUpdateStatus = async (newStatus: 'em_analise' | 'aprovado' | 'rejeitado' | 'concluido') => {
    if (!selectedSolicitacao) return;

    setUpdatingStatus(true);
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_atualizar_solicitacao_loja', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_solicitacao_id: selectedSolicitacao.id,
        p_novo_status: newStatus,
        p_resposta_admin: resolucaoInput || selectedSolicitacao.resposta_admin || null
      });

      if (error) throw error;

      const statusToSave = data?.status || newStatus;
      const diffValue = Number(data?.valor_diferenca || selectedSolicitacao.valor_diferenca || 0);
      const codigoOrcamento = data?.codigo_orcamento || '';
      const totalOrcamento = Number(data?.total_orcamento || 0);

      if (newStatus === 'aprovado' && data?.fatura_diferenca_id) {
        const vencimentoDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
        const vencimentoStr = vencimentoDate.toISOString().split('T')[0];

        await notificationService.notifyClient(
          selectedSolicitacao.cliente_id,
          'Fatura de Diferenca de Troca Gerada',
          `Sua solicitacao de troca foi aprovada! Foi gerada uma fatura de R$ ${diffValue.toFixed(2)} correspondente a diferenca de valor, com vencimento para ${formatDate(vencimentoStr)}.`,
          'gsa_store',
          'fatura_gerada',
          { tab: 'acompanhar', itemId: selectedSolicitacao.id, prioridade: 'alta' }
        );
      }

      if (newStatus === 'aprovado' && data?.credito_estornado) {
        await notificationService.notifyClient(
          selectedSolicitacao.cliente_id,
          'Limite de Credito Restaurado (Troca/Devolucao)',
          `Sua solicitacao de ${selectedSolicitacao.tipo} para o pedido #${codigoOrcamento} foi aprovada e o valor de R$ ${totalOrcamento.toFixed(2)} foi estornado para o seu limite de credito disponivel.`,
          'gsa_store',
          'credito_estornado',
          { tab: 'acompanhar', itemId: selectedSolicitacao.id, prioridade: 'normal' }
        );
      }

      toast.success('Solicitacao atualizada com sucesso.');
      await logService.logAction({
        acao: 'ATUALIZAR_SOLICITACAO_LOJA',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        ator_id: colaboradorId,
        detalhes: `Atualizou a solicitacao de ${(selectedSolicitacao as any).clientes?.nome} para status: ${statusToSave}`
      });
      setIsDetailOpen(false);
      fetchSolicitacoes();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao atualizar solicitacao.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleUpdateAdvancedStatus = async (
    targetStatus: string, 
    payload: {
      endereco_devolucao?: string;
      data_agendamento?: string;
      rastreio_admin?: string;
      resposta_admin?: string;
    }
  ) => {
    if (!selectedSolicitacao) return;
    setUpdatingStatus(true);
    try {
      const session = getAdminSessionForRpc();

      // Previously performed direct client table mutation:
      // await supabase.from('loja_solicitacoes').update({ status: targetStatus, ... })
      // Now routed through canonical atomic security definer RPC gsa_admin_atualizar_solicitacao_loja
      const { data, error } = await supabase.rpc('gsa_admin_atualizar_solicitacao_loja', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_solicitacao_id: selectedSolicitacao.id,
        p_novo_status: targetStatus,
        p_resposta_admin: payload.resposta_admin || resolucaoInput || selectedSolicitacao.resposta_admin || null,
        p_endereco_devolucao: payload.endereco_devolucao || null,
        p_data_agendamento: payload.data_agendamento || null,
        p_rastreio_admin: payload.rastreio_admin || null,
      });

      if (error) throw error;

      toast.success('Fluxo logístico atualizado!');
      
      // Notificar cliente
      let notificationMsg = '';
      if (targetStatus === 'aguardando_devolucao') {
        notificationMsg = `As instruções de devolução via Correios foram enviadas! Envie para o endereço cadastrado.`;
      } else if (targetStatus === 'agendado') {
        notificationMsg = `Sua entrega presencial foi agendada para o dia ${payload.data_agendamento ? new Date(payload.data_agendamento).toLocaleString('pt-BR') : ''}.`;
      } else if (targetStatus === 'novo_produto_enviado') {
        notificationMsg = `O seu novo produto substituto foi enviado! Código de rastreio: ${payload.rastreio_admin}`;
      } else if (targetStatus === 'devolucao_recebida') {
        notificationMsg = `O produto que você devolveu foi recebido na GSA e está em conferência.`;
      } else if (targetStatus === 'concluido') {
        notificationMsg = `A sua solicitação de ${selectedSolicitacao.tipo} foi totalmente concluída! Obrigado.`;
      }

      if (notificationMsg) {
        await notificationService.notifyClient(
          selectedSolicitacao.cliente_id,
          '🔄 Atualização na sua Troca/Devolução',
          notificationMsg,
          'gsa_store',
          'solicitacao_atualizada',
          { tab: 'acompanhar', itemId: selectedSolicitacao.id, prioridade: 'alta' }
        );
      }

      await logService.logAction({
        acao: 'ATUALIZAR_LOGISTICA_LOJA',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        ator_id: colaboradorId,
        detalhes: `Atualizou logística da troca de ${(selectedSolicitacao as any).clientes?.nome} para status: ${targetStatus}`
      });

      setIsDetailOpen(false);
      fetchSolicitacoes();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao atualizar fluxo.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pendente': return 'bg-amber-100 text-amber-700';
      case 'em_analise': return 'bg-blue-100 text-blue-700';
      case 'aprovado': return 'bg-emerald-100 text-emerald-700';
      case 'rejeitado': return 'bg-red-100 text-red-700';
      case 'concluido': return 'bg-purple-100 text-purple-700';
      case 'aguardando_postagem': return 'bg-orange-100 text-orange-700';
      case 'em_transito': return 'bg-sky-100 text-sky-700';
      case 'devolucao_recebida': return 'bg-teal-100 text-teal-700';
      case 'novo_produto_enviado': return 'bg-indigo-100 text-indigo-700';
      case 'cancelado': return 'bg-neutral-200 text-neutral-700';
      default: return 'bg-neutral-100 text-neutral-700';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pendente: 'PENDENTE',
      em_analise: 'EM ANÁLISE',
      aprovado: 'APROVADO',
      rejeitado: 'REJEITADO',
      concluido: 'CONCLUÍDO',
      cancelado: 'CANCELADO',
      aguardando_postagem: 'AGUARDANDO POSTAGEM',
      em_transito: 'EM TRÂNSITO',
      devolucao_recebida: 'DEVOLUÇÃO RECEBIDA',
      novo_produto_enviado: 'NOVO PRODUTO ENVIADO',
    };
    return labels[status] || status.replace(/_/g, ' ').toUpperCase();
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 group-focus-within:text-indigo-500 transition-colors" />
          <input 
            type="text" 
            placeholder="Buscar por motivo..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white shadow-sm border border-neutral-200 rounded-xl py-3 pl-10 pr-4 text-xs font-medium text-neutral-900 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      <div className="flex border-b border-neutral-200 mb-6">
        <button
          onClick={() => { setActiveTab('pendentes'); setPage(0); }}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'pendentes'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
          }`}
        >
          Pendentes / Em Análise
        </button>
        <button
          onClick={() => { setActiveTab('historico'); setPage(0); }}
          className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'historico'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
          }`}
        >
          Histórico (Concluídas/Rejeitadas)
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {solicitacoes.map((solicitacao) => (
          <div key={solicitacao.id} className="group relative rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 transition-all hover:shadow-md">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                {solicitacao.tipo === 'troca' ? <RefreshCcw className="h-6 w-6" /> : 
                 solicitacao.tipo === 'devolucao' ? <AlertCircle className="h-6 w-6" /> : 
                 <CheckCircle className="h-6 w-6" />}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${getStatusColor(solicitacao.status)}`}>
                  {getStatusLabel(solicitacao.status)}
                </span>
                <span className="font-mono text-xs font-bold text-neutral-400">{(solicitacao as any).orcamentos?.codigo_orcamento || 'N/A'}</span>
              </div>
            </div>
            
            <h3 className="text-lg font-bold text-neutral-900 uppercase">{solicitacao.tipo}</h3>
            
            <div className="mt-2 flex flex-col gap-1">
              <span className="text-xs font-bold text-neutral-600 flex items-center gap-1">
                <User className="w-3 h-3" /> {(solicitacao as any).clientes?.nome}
              </span>
              <span className="text-[10px] text-neutral-400">
                {formatDate(solicitacao.created_at)}
              </span>
            </div>

            <p className="mt-4 text-sm text-neutral-600 line-clamp-2">
              <span className="font-bold text-neutral-900">Motivo:</span> {solicitacao.motivo}
            </p>

            <div className="mt-6 flex items-center justify-end">
              <button 
                onClick={() => { 
                  setSelectedSolicitacao(solicitacao); 
                  setResolucaoInput(solicitacao.resposta_admin || '');
                  setEnderecoDevolucaoInput(solicitacao.endereco_devolucao || 'Sede GSA - Av. das Nações, 4500, São Paulo/SP');
                  setDataAgendamentoInput(solicitacao.data_agendamento ? new Date(solicitacao.data_agendamento).toISOString().substring(0, 16) : '');
                  setRastreioAdminInput(solicitacao.rastreio_admin || '');
                  setIsDetailOpen(true); 
                }}
                className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-indigo-600"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {solicitacoes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 mb-4">
            <FileText className="h-8 w-8 text-neutral-400" />
          </div>
          <h3 className="text-lg font-bold text-neutral-900">Nenhuma solicitação encontrada</h3>
          <p className="text-neutral-500 mt-2 max-w-sm">
            Nenhuma troca ou devolução na aba atual.
          </p>
        </div>
      )}

      <div className="admin-pagination justify-between mt-6">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
          className="px-4 py-2 bg-neutral-100 text-neutral-600 font-bold rounded-lg hover:bg-neutral-200 disabled:opacity-50 text-sm"
        >
          Anterior
        </button>
        <span className="text-sm font-bold text-neutral-600">
          Página {page + 1}
        </span>
        <button
          disabled={solicitacoes.length < PAGE_SIZE}
          onClick={() => setPage((p) => p + 1)}
          className="px-4 py-2 bg-neutral-100 text-neutral-600 font-bold rounded-lg hover:bg-neutral-200 disabled:opacity-50 text-sm"
        >
          Próxima
        </button>
      </div>

      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Detalhes da Solicitação" size="wide">
        {selectedSolicitacao && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-neutral-50 p-6 ring-1 ring-neutral-200">
              <div className="mb-6 flex items-center justify-between border-b border-neutral-200 pb-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                    {selectedSolicitacao.tipo === 'troca' ? <RefreshCcw className="h-6 w-6" /> : 
                     selectedSolicitacao.tipo === 'devolucao' ? <AlertCircle className="h-6 w-6" /> : 
                     <CheckCircle className="h-6 w-6" />}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-neutral-900 uppercase">Solicitação de {selectedSolicitacao.tipo}</h3>
                    <span className="text-sm font-medium text-neutral-500">{(selectedSolicitacao as any).clientes?.nome} • {(selectedSolicitacao as any).clientes?.email}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-block rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${getStatusColor(selectedSolicitacao.status)}`}>
                    {getStatusLabel(selectedSolicitacao.status)}
                  </span>
                  <p className="text-[10px] font-bold text-neutral-400 mt-1">{formatDate(selectedSolicitacao.created_at)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div>
                  <p className="text-xs font-bold text-neutral-400 uppercase">Motivo Resumido</p>
                  <p className="text-sm font-bold text-neutral-900 mt-1">{selectedSolicitacao.motivo}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-neutral-400 uppercase">Protocolo do Pedido (Venda)</p>
                  <p className="text-sm font-bold text-indigo-600 font-mono mt-1">{(selectedSolicitacao as any).orcamentos?.protocolo || 'N/A'}</p>
                </div>
                
                {selectedSolicitacao.valor_diferenca && Number(selectedSolicitacao.valor_diferenca) > 0 && (
                  <div className="col-span-1 md:col-span-2 bg-blue-50 border border-blue-150 p-4 rounded-xl">
                    <p className="text-xs font-bold text-blue-900 uppercase">Diferença de Valor a ser Cobrada</p>
                    <p className="text-lg font-black text-blue-700 mt-1">R$ {Number(selectedSolicitacao.valor_diferenca).toFixed(2)}</p>
                    <p className="text-[10px] text-blue-600 mt-0.5">Uma fatura com vencimento de 2 dias será gerada para o cliente assim que a solicitação for aprovada.</p>
                  </div>
                )}
                
                <div className="col-span-1 md:col-span-2">
                  <p className="text-xs font-bold text-neutral-400 uppercase">Descrição Detalhada do Cliente</p>
                  <div className="mt-1 bg-white p-4 rounded-xl border border-neutral-200 text-sm text-neutral-700 whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
                    {selectedSolicitacao.descricao_detalhada || 'Nenhuma descrição fornecida.'}
                  </div>
                </div>
              </div>

              {selectedSolicitacao.imagens_anexo && selectedSolicitacao.imagens_anexo.length > 0 && (
                <div className="mt-6 border-t border-neutral-200 pt-6">
                  <p className="text-xs font-bold text-neutral-400 uppercase mb-4 flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Anexos do Cliente</p>
                  <div className="flex gap-4 overflow-x-auto pb-4">
                    {selectedSolicitacao.imagens_anexo.map((img, idx) => (
                      <a key={img} href={img} target="_blank" rel="noopener noreferrer" className="block w-24 h-24 shrink-0 rounded-xl overflow-hidden border border-neutral-200 hover:opacity-80 transition-opacity">
                        <img src={img} alt={`Anexo ${idx + 1}`} className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Painel de Resolução e Status */}
            <div className="rounded-2xl bg-indigo-50/50 p-6 border border-indigo-100">
              <h4 className="text-sm font-bold text-indigo-900 mb-4">Painel de Resolução (Uso Interno)</h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Notas de Resolução</label>
                  <textarea 
                    rows={3} 
                    value={resolucaoInput}
                    onChange={(e) => setResolucaoInput(e.target.value)}
                    placeholder="Descreva a providência tomada (ex: Estorno realizado, Novo produto enviado)..."
                    className="w-full rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-neutral-500 mt-1">Este texto ajudará no histórico da solicitação.</p>
                </div>

                <div className="pt-4 flex flex-col gap-4 border-t border-indigo-100">
                  {/* Status: PENDENTE */}
                  {selectedSolicitacao.status === 'pendente' && (
                    <button 
                      disabled={updatingStatus}
                      onClick={() => handleUpdateStatus('em_analise')}
                      className="w-full px-4 py-3 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 uppercase tracking-wider"
                    >
                      Colocar em Análise
                    </button>
                  )}
                  
                  {/* Status: PENDENTE ou EM_ANALISE */}
                  {(selectedSolicitacao.status === 'pendente' || selectedSolicitacao.status === 'em_analise') && (
                    <div className="flex gap-3">
                      <button 
                        disabled={updatingStatus}
                        onClick={() => handleUpdateStatus('rejeitado')}
                        className="flex-1 px-4 py-3 bg-red-600 text-white font-bold text-xs rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 uppercase tracking-wider"
                      >
                        <XCircle className="w-4 h-4" /> Rejeitar
                      </button>
                      <button 
                        disabled={updatingStatus}
                        onClick={() => handleUpdateStatus('aprovado')}
                        className="flex-1 px-4 py-3 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 uppercase tracking-wider"
                      >
                        <CheckCircle className="w-4 h-4" /> Aprovar Solicitação
                      </button>
                    </div>
                  )}

                  {/* Status: APROVADO (Aguardando Pagamento da Fatura pelo Cliente se houver diferença) */}
                  {selectedSolicitacao.status === 'aprovado' && (
                    Number(selectedSolicitacao.valor_diferenca || 0) > 0 ? (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center">
                        <p className="text-xs font-bold text-amber-800">
                          ⏳ <strong>Aguardando Pagamento:</strong> A solicitação foi aprovada, porém o cliente precisa pagar a fatura de diferença de valor (R$ {Number(selectedSolicitacao.valor_diferenca).toFixed(2)}) para poder liberar o envio das instruções de logística.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                        <p className="text-xs font-bold text-emerald-800">
                          ✅ <strong>Sem diferença de valor:</strong> não há fatura a ser paga pelo cliente. Libere as instruções de logística para seguir com o fluxo.
                        </p>
                        <button
                          disabled={updatingStatus}
                          onClick={() => handleUpdateAdvancedStatus('aguardando_instrucoes', { resposta_admin: resolucaoInput })}
                          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase rounded-xl tracking-wider transition-colors disabled:opacity-50"
                        >
                          Liberar Instruções de Logística
                        </button>
                      </div>
                    )
                  )}


                  {/* Status: AGUARDANDO INSTRUÇÕES (Aprovado sem diferença OU com diferença paga) */}
                  {selectedSolicitacao.status === 'aguardando_instrucoes' && (
                    <div className="space-y-4 bg-white p-4 rounded-xl border border-indigo-150">
                      <div className="bg-indigo-50 p-3 rounded-lg">
                        <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest block mb-1">📋 Instruções de Devolução</span>
                        <p className="text-xs text-neutral-600">
                          Selecione o endereço para postagem ou agende data/hora caso o cliente tenha selecionado o método <strong>{selectedSolicitacao.metodo_entrega === 'pessoalmente' ? 'Presencial na GSA' : 'Via Correios'}</strong>.
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] font-black uppercase text-neutral-500 mb-1">Endereço de Recebimento</label>
                          <input 
                            type="text"
                            value={enderecoDevolucaoInput}
                            onChange={(e) => setEnderecoDevolucaoInput(e.target.value)}
                            placeholder="Endereço para o cliente enviar/entregar o produto"
                            className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:outline-none font-bold"
                          />
                        </div>

                        {selectedSolicitacao.metodo_entrega === 'pessoalmente' && (
                          <div>
                            <label className="block text-[10px] font-black uppercase text-neutral-500 mb-1">Data & Hora do Agendamento</label>
                            <input 
                              type="datetime-local"
                              value={dataAgendamentoInput}
                              onChange={(e) => setDataAgendamentoInput(e.target.value)}
                              className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:outline-none font-bold text-neutral-700"
                            />
                          </div>
                        )}
                      </div>

                      <button
                        disabled={updatingStatus}
                        onClick={() => {
                          if (selectedSolicitacao.metodo_entrega === 'pessoalmente') {
                            if (!dataAgendamentoInput) {
                              toast.error('Informe a data/hora para o agendamento presencial.');
                              return;
                            }
                            handleUpdateAdvancedStatus('agendado', {
                              endereco_devolucao: enderecoDevolucaoInput,
                              data_agendamento: new Date(dataAgendamentoInput).toISOString(),
                              resposta_admin: resolucaoInput
                            });
                          } else {
                            handleUpdateAdvancedStatus('aguardando_devolucao', {
                              endereco_devolucao: enderecoDevolucaoInput,
                              resposta_admin: resolucaoInput
                            });
                          }
                        }}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase rounded-xl tracking-wider transition-colors disabled:opacity-50"
                      >
                        {selectedSolicitacao.metodo_entrega === 'pessoalmente' ? 'Confirmar Agendamento Presencial' : 'Enviar Endereço para Cliente'}
                      </button>
                    </div>
                  )}

                  {/* Status: AGUARDANDO DEVOLUÇÃO (Correios) */}
                  {selectedSolicitacao.status === 'aguardando_devolucao' && (
                    <div className="p-4 bg-indigo-50/50 border border-indigo-150 rounded-xl space-y-2 text-center">
                      <p className="text-xs text-indigo-900 font-bold leading-normal">
                        📨 <strong>Aguardando Postagem:</strong> O cliente foi notificado com o endereço dos Correios e deve inserir o código de rastreio de postagem no painel dele para dar andamento.
                      </p>
                      <div className="p-3 bg-white rounded-lg border border-neutral-200 text-[11px] font-semibold text-neutral-600">
                        Endereço Cadastrado: <strong className="text-neutral-800">{selectedSolicitacao.endereco_devolucao}</strong>
                      </div>
                    </div>
                  )}

                  {/* Status: DEVOLUÇÃO POSTADA (Correios) */}
                  {selectedSolicitacao.status === 'devolucao_postada' && (
                    <div className="bg-white p-4 rounded-xl border border-blue-150 space-y-4">
                      <div className="p-3 bg-blue-50 rounded-lg text-blue-900 font-semibold text-xs leading-normal">
                        📦 O cliente postou o produto de devolução! Código de rastreio informado:
                        <div className="mt-2 text-sm font-black font-mono text-indigo-700 bg-white border border-indigo-150 px-3 py-1.5 rounded-lg inline-block">
                          {selectedSolicitacao.rastreio_cliente}
                        </div>
                      </div>

                      <button
                        disabled={updatingStatus}
                        onClick={() => handleUpdateAdvancedStatus('devolucao_recebida', { resposta_admin: resolucaoInput })}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase rounded-xl tracking-wider transition-colors"
                      >
                        Confirmar Recebimento & Conferência de Produto
                      </button>
                    </div>
                  )}

                  {/* Status: AGENDADO (Presencial) */}
                  {selectedSolicitacao.status === 'agendado' && (
                    <div className="bg-white p-4 rounded-xl border border-indigo-150 space-y-4">
                      <div className="p-3 bg-indigo-50 rounded-lg text-indigo-900 font-semibold text-xs leading-normal">
                        🤝 <strong>Entrega Presencial Agendada:</strong>
                        <div className="mt-2 text-[11px] space-y-1">
                          <p><strong>Data/Hora:</strong> {selectedSolicitacao.data_agendamento ? new Date(selectedSolicitacao.data_agendamento).toLocaleString('pt-BR') : ''}</p>
                          <p><strong>Endereço:</strong> {selectedSolicitacao.endereco_devolucao}</p>
                        </div>
                      </div>

                      <button
                        disabled={updatingStatus}
                        onClick={() => handleUpdateAdvancedStatus('concluido', { resposta_admin: resolucaoInput })}
                        className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black uppercase rounded-xl tracking-wider transition-colors"
                      >
                        Confirmar Troca Presencial & Concluir
                      </button>
                    </div>
                  )}

                  {/* Status: DEVOLUÇÃO RECEBIDA (Correios) */}
                  {selectedSolicitacao.status === 'devolucao_recebida' && (
                    selectedSolicitacao.tipo === 'devolucao' ? (
                      <div className="space-y-4 bg-white p-4 rounded-xl border border-amber-150">
                        <div className="p-3 bg-amber-50 rounded-lg text-amber-900 font-semibold text-xs leading-normal">
                          ✅ <strong>Produto Devolvido Recebido!</strong> Como esta solicitação é uma <strong>devolução</strong>, não há novo produto a enviar. Conclua para finalizar o estorno ao cliente.
                        </div>

                        <button
                          disabled={updatingStatus}
                          onClick={() => handleUpdateAdvancedStatus('concluido', { resposta_admin: resolucaoInput })}
                          className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black uppercase rounded-xl tracking-wider transition-colors disabled:opacity-50"
                        >
                          Concluir Devolução & Liberar Estorno
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4 bg-white p-4 rounded-xl border border-amber-150">
                        <div className="p-3 bg-amber-50 rounded-lg text-amber-900 font-semibold text-xs leading-normal">
                          ✅ <strong>Produto Devolvido Recebido!</strong> Agora insira o código de rastreio dos Correios do <strong>novo produto</strong> enviado para o cliente.
                        </div>

                        <div>
                          <label className="block text-[10px] font-black uppercase text-neutral-500 mb-1">Código de Rastreio do Novo Produto</label>
                          <input 
                            type="text"
                            value={rastreioAdminInput}
                            onChange={(e) => setRastreioAdminInput(e.target.value)}
                            placeholder="Ex: OB987654321BR"
                            className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-xs focus:ring-4 focus:ring-indigo-500/10 focus:outline-none font-bold"
                          />
                        </div>

                        <button
                          disabled={updatingStatus}
                          onClick={() => {
                            if (!rastreioAdminInput.trim()) {
                              toast.error('Informe o código de rastreio do novo produto enviado.');
                              return;
                            }
                            handleUpdateAdvancedStatus('novo_produto_enviado', { 
                              rastreio_admin: rastreioAdminInput.trim(),
                              resposta_admin: resolucaoInput
                            });
                          }}
                          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase rounded-xl tracking-wider transition-colors disabled:opacity-50"
                        >
                          Enviar Novo Produto (Informar Rastreio)
                        </button>
                      </div>
                    )
                  )}


                  {/* Status: NOVO PRODUTO ENVIADO (Correios) */}
                  {selectedSolicitacao.status === 'novo_produto_enviado' && (
                    <div className="space-y-4 bg-white p-4 rounded-xl border border-emerald-150">
                      <div className="p-3 bg-emerald-50 rounded-lg text-emerald-900 font-semibold text-xs leading-normal">
                        🚚 Novo produto enviado e em trânsito para o cliente!
                        <div className="mt-2 text-xs font-bold text-neutral-600">
                          Código de rastreio informado: <span className="font-mono text-emerald-800 font-black">{selectedSolicitacao.rastreio_admin}</span>
                        </div>
                      </div>

                      <button
                        disabled={updatingStatus}
                        onClick={() => handleUpdateAdvancedStatus('concluido', { resposta_admin: resolucaoInput })}
                        className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black uppercase rounded-xl tracking-wider transition-colors"
                      >
                        Concluir Solicitação de Troca
                      </button>
                    </div>
                  )}

                  {/* Status: CONCLUIDO */}
                  {selectedSolicitacao.status === 'concluido' && (
                    <div className="space-y-4 bg-white p-4 rounded-xl border border-purple-200">
                      <div className="p-3 bg-purple-50 rounded-lg text-purple-900 font-semibold text-xs leading-normal">
                        🎉 <strong>Solicitação Concluída!</strong> Abaixo está todo o histórico e detalhes logísticos desta operação.
                      </div>

                      <div className="space-y-3 mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-200">
                            <p className="text-[10px] font-black uppercase text-neutral-400 mb-1">Método de Entrega</p>
                            <p className="text-xs font-bold text-neutral-700">{selectedSolicitacao.metodo_entrega === 'pessoalmente' ? 'Presencial' : 'Via Correios'}</p>
                          </div>
                          {selectedSolicitacao.endereco_devolucao && (
                            <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-200">
                              <p className="text-[10px] font-black uppercase text-neutral-400 mb-1">Endereço</p>
                              <p className="text-xs font-bold text-neutral-700">{selectedSolicitacao.endereco_devolucao}</p>
                            </div>
                          )}
                          {selectedSolicitacao.data_agendamento && (
                            <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-200">
                              <p className="text-[10px] font-black uppercase text-neutral-400 mb-1">Data Agendada</p>
                              <p className="text-xs font-bold text-neutral-700">{new Date(selectedSolicitacao.data_agendamento).toLocaleString('pt-BR')}</p>
                            </div>
                          )}
                          {selectedSolicitacao.rastreio_cliente && (
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                              <p className="text-[10px] font-black uppercase text-blue-500 mb-1">Rastreio (Devolução)</p>
                              <p className="text-xs font-mono font-bold text-blue-700">{selectedSolicitacao.rastreio_cliente}</p>
                            </div>
                          )}
                          {selectedSolicitacao.rastreio_admin && (
                            <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                              <p className="text-[10px] font-black uppercase text-emerald-500 mb-1">Rastreio (Novo Produto)</p>
                              <p className="text-xs font-mono font-bold text-emerald-700">{selectedSolicitacao.rastreio_admin}</p>
                            </div>
                          )}
                        </div>

                        {selectedSolicitacao.historico_status && (
                          <div className="mt-6 pt-4 border-t border-neutral-200">
                            <p className="text-[10px] font-black uppercase text-neutral-500 mb-3">Histórico de Andamento</p>
                            <div className="space-y-3 relative before:absolute before:inset-0 before:ml-1 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-neutral-200 before:to-transparent ml-2">
                              {Object.entries(selectedSolicitacao.historico_status)
                                .sort((a, b) => new Date(a[1] as string).getTime() - new Date(b[1] as string).getTime())
                                .map(([status, dateStr]) => (
                                <div key={status} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                  <div className="flex items-center justify-center w-3 h-3 rounded-full border border-white bg-indigo-500 group-[.is-active]:bg-purple-500 text-neutral-500 group-[.is-active]:text-emerald-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 -translate-x-[5px]"></div>
                                  <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-xl border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1">
                                      <p className="text-xs font-black text-neutral-800">{getStatusLabel(status)}</p>
                                      <time className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">{new Date(dateStr as string).toLocaleString('pt-BR')}</time>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}
      </Modal>
    </div>
  );
}
