import { useState, useEffect, useRef } from 'react';
import { Plus, Search, FileText, CheckCircle, XCircle, ChevronRight, ChevronLeft, Send, MessageSquare, Printer, Percent, Clock, Upload, Trash2, ArrowRightLeft, Calendar, Landmark, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Orcamento, Cliente, Servico, Produto, Assinatura, Promocao, ClientePromocao } from '../../types';
import { Modal } from '../ui/Modal';
import { formatCurrency, formatDate, generateCode, generateUUID, handleError, maskCurrency, handleCurrencyInputChange } from '../../lib/utils';
import { GlobalFilter } from '../ui/GlobalFilter';
import { toast } from 'react-hot-toast';
import { generateOrcamentoPDF } from '../../lib/pdf';
import { pdfSharingService } from '../../lib/pdfSharingService';
import { AdminWhatsAppButton } from './ui/AdminWhatsAppButton';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { callAdminRpc } from '../../lib/adminRpc';

import { notificationService } from '../../lib/notificationService';
import { logService } from '../../lib/logService';
import { PainelRentabilidade } from './PainelRentabilidade';

interface BudgetApprovalResult {
  success: boolean;
  already_processed?: boolean;
  request_id: string;
  orcamento_id: string;
  status: string;
  tipo?: string;
  os_id?: string | null;
  demanda_id?: string | null;
  ordem_compra_id?: string | null;
  ordem_assinatura_id?: string | null;
  fatura_id?: string | null;
  total_aprovado?: number | null;
}

export function OrcamentosModule({ activeSubTab, initialItemId, adminType, colaboradorId, colaboradorNome, onNavigate }: { activeSubTab?: 'abertos' | 'analise' | 'aprovados' | 'cancelados', initialItemId?: string, adminType?: string, colaboradorId?: string, colaboradorNome?: string, onNavigate?: (module: string, tab?: string) => void }) {
  const [activeTab, setActiveTab] = useState<'abertos' | 'aprovados' | 'cancelados'>(activeSubTab === 'analise' ? 'abertos' : (activeSubTab as any) || 'abertos');

  useEffect(() => {
    if (activeSubTab === 'analise') {
      setActiveTab('abertos');
    } else if (activeSubTab) {
      setActiveTab(activeSubTab as any);
    }
  }, [activeSubTab]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const PAGE_SIZE = 30;
  const [currentPage, setCurrentPage] = useState(0);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [selectedOrcamento, setSelectedOrcamento] = useState<Orcamento | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isRenegotiateModalOpen, setIsRenegotiateModalOpen] = useState(false);
  const [renegotiateValue, setRenegotiateValue] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({
    mes: '',
    ano: ''
  });
  const [isDocRequestModalOpen, setIsDocRequestModalOpen] = useState(false);
  const [requestedDocs, setRequestedDocs] = useState<string[]>(['']);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const hasAutoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (initialItemId && orcamentos.length > 0 && hasAutoOpened.current !== initialItemId) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`budget-${initialItemId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedId(initialItemId);
          
          // Abrir modal automaticamente
          const orcamento = orcamentos.find(o => o.id === initialItemId);
          if (orcamento) {
            setSelectedOrcamento(orcamento);
            setIsDetailOpen(true);
            hasAutoOpened.current = initialItemId;
          }

          setTimeout(() => setHighlightedId(null), 3000);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialItemId, orcamentos]);

  const selectedOrcamentoRef = useRef(selectedOrcamento);
  useEffect(() => { selectedOrcamentoRef.current = selectedOrcamento; }, [selectedOrcamento]);

  useEffect(() => {
    fetchOrcamentos();
  }, [activeTab, search, filters, currentPage]);

  // Stable Realtime Subscription
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const debouncedFetch = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fetchOrcamentos();
      }, 300);
    };

    const channel = supabase
      .channel(`admin-orcamentos-rt-${Date.now()}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orcamentos'
      }, (payload) => {
        debouncedFetch();
        
        // Se o orçamento selecionado foi alterado, atualizamos ele ou fechamos o modal se o status mudou
        if (selectedOrcamentoRef.current && (payload.new as any)?.id === selectedOrcamentoRef.current.id) {
          const updatedOrc = payload.new as Orcamento;
          if (updatedOrc.status !== selectedOrcamentoRef.current.status) {
            toast(`O orçamento ${updatedOrc.codigo_orcamento} foi atualizado para "${updatedOrc.status}" por outro usuário.`);
            setIsDetailOpen(false);
            setSelectedOrcamento(null);
          } else {
            setSelectedOrcamento(prev => prev ? { ...prev, ...payload.new } as Orcamento : null);
          }
        }
      })
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, []); // Empty dependency array for stability

  const fetchOrcamentos = async () => {
    const statusMap = {
      'abertos': 'aberto',
      'aprovados': 'aprovado',
      'cancelados': 'cancelado'
    };

    let query = supabase
      .from('orcamentos')
      .select(`
        *,
        clientes (
          id,
          nome,
          cpf,
          cnpj,
          email,
          telefone,
          codigo_cliente,
          indicacao_origem_id
        ),
        servicos (
          nome
        ),
        produtos (
          nome
        ),
        assinaturas (
          nome
        ),
        promocao_id
      `)
      .in('categoria', ['servico'])
      .or('origem_gsa_store.eq.false,origem_gsa_store.is.null');

    if (activeTab === 'abertos') {
      query = query.in('status', ['aberto', 'pendente', 'negociação', 'em revisão', 'pendência documentos']);
    } else {
      query = query.eq('status', statusMap[activeTab]);
    }

    if (search) {
      query = query.or(`codigo_orcamento.ilike.%${search}%, clientes.nome.ilike.%${search}%`);
    }

    if (filters.mes) {
      const year = filters.ano || new Date().getFullYear();
      const startDate = `${year}-${filters.mes}-01`;
      const endDate = new Date(Number(year), Number(filters.mes), 0).toISOString().split('T')[0];
      query = query.gte('data_criacao', startDate).lte('data_criacao', endDate);
    }
    
    const { data, error } = await query
      .order('data_criacao', { ascending: false })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);
    
    if (error) {
      console.error('Error fetching orcamentos:', error);
      return;
    }
    
    if (data) {
      setOrcamentos(data);
    }
  };

  const groupedOrcamentos = (list: Orcamento[]) => {
    const groups: Record<string, Orcamento[]> = {};
    list.forEach(o => {
      const code = o.codigo_orcamento || o.id;
      if (!groups[code]) groups[code] = [];
      groups[code].push(o);
    });
    return Object.entries(groups).map(([code, items]) => {
      const total = items.reduce((acc, curr) => acc + curr.total, 0);
      const status = items.every(i => (i.status as any) === 'pago') ? 'pago' : 
                     items.some(i => i.status === 'cancelado') ? 'cancelado' : 
                     items[0].status;
      
      return {
        ...items[0],
        items,
        total,
        status
      } as any;
    }).sort((a, b) => new Date(b.data_criacao).getTime() - new Date(a.data_criacao).getTime());
  };



  const handleApproveNegotiation = async (orc: Orcamento) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { data: currentOrc, error: fetchError } = await supabase
        .from('orcamentos')
        .select('status')
        .eq('id', orc.id)
        .single();

      if (fetchError) throw fetchError;
      if (currentOrc?.status !== 'negociação') {
        toast.error('Este orçamento já foi alterado por outro usuário.');
        setIsDetailOpen(false);
        await fetchOrcamentos();
        return;
      }

      const approval = await callAdminRpc<BudgetApprovalResult>('gsa_admin_approve_budget', {
        p_request_id: generateUUID(),
        p_orcamento_id: orc.id,
        p_approval_kind: 'negotiation',
      });
      if (!approval?.success) {
        throw new Error('O servidor não confirmou a aprovação do orçamento.');
      }

      await notificationService.notifyClient(
        orc.cliente_id,
        '🤝 Negociação Aprovada!',
        `Sua solicitação de negociação para o orçamento ${orc.codigo_orcamento} foi aprovada. 🎉`,
        'orcamentos',
        'orcamento_aprovado',
        { tab: 'aprovados', itemId: orc.id, prioridade: 'alta', contexto: { orcamento_id: orc.id, codigo: orc.codigo_orcamento } }
      );

      if (orc.categoria === 'servico') {
        toast.success('Negociação aprovada e OS gerada!');
        if (onNavigate) onNavigate('vendas', 'os');
      } else if (orc.categoria === 'produto') {
        toast.success('Negociação aprovada e Ordem de Compra gerada!');
        if (onNavigate) onNavigate('vendas', 'produtos');
      } else {
        toast.success('Negociação aprovada e Ordem de Assinatura gerada!');
        if (onNavigate) onNavigate('vendas', 'assinaturas');
      }

      setIsDetailOpen(false);
      
      // Log Action
      await logService.logAction({ acao: 'ACAO_SISTEMA', detalhes: JSON.stringify({}), ator_tipo: 'admin', ator_nome: 'Administrador' });

      await fetchOrcamentos();
    } catch (err: any) {
      console.error('Erro ao aprovar negociação:', err);
      toast.error(handleError(err, 'Erro ao aprovar negociação'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRenegotiate = async () => {
    if (!selectedOrcamento || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('orcamentos')
        .update({
          fase_negociacao: 'cliente',
          proposta_admin_porcentagem: renegotiateValue
        })
        .eq('id', selectedOrcamento.id);

      if (error) throw error;

      // Notificar cliente sobre contraproposta
      await notificationService.notifyClient(
        selectedOrcamento.cliente_id,
        '📩 Nova Proposta de Negociação',
        `O sistema enviou uma nova proposta para o orçamento ${selectedOrcamento.codigo_orcamento}. 📝`,
        'orcamentos',
        'orcamento_contraproposta',
        { tab: 'abertos', itemId: selectedOrcamento.id, prioridade: 'alta', contexto: { orcamento_id: selectedOrcamento.id, codigo: selectedOrcamento.codigo_orcamento } }
      );

      toast.success('Proposta de renegociação enviada!');
      setIsRenegotiateModalOpen(false);
      setIsDetailOpen(false);
      
      // Log Action
      await logService.logAction({ acao: 'ACAO_SISTEMA', detalhes: JSON.stringify({}), ator_tipo: 'admin', ator_nome: 'Administrador' });

      fetchOrcamentos();
    } catch (err) {
      toast.error('Erro ao enviar proposta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (orc: Orcamento & { items?: Orcamento[] }) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const itemsToApprove = orc.items || [orc];

      for (const item of itemsToApprove) {
        const approval = await callAdminRpc<BudgetApprovalResult>('gsa_admin_approve_budget', {
          p_request_id: generateUUID(),
          p_orcamento_id: item.id,
          p_approval_kind: 'standard',
        });
        if (!approval?.success) {
          throw new Error(`O servidor não confirmou a aprovação do orçamento ${item.codigo_orcamento || item.id}.`);
        }
      }

      await notificationService.notifyClient(
        orc.cliente_id,
        '✅ Pedido Aprovado!',
        `Seu pedido ${orc.codigo_orcamento} foi aprovado pelo sistema. 🚀`,
        'orcamentos',
        'orcamento_aprovado',
        { tab: 'aprovados', itemId: orc.id, prioridade: 'alta' }
      );

      toast.success('Pedido aprovado com sucesso!');
      setIsDetailOpen(false);
      await fetchOrcamentos();
    } catch (err: any) {
      console.error('Erro ao aprovar:', err);
      toast.error(handleError(err, 'Erro ao aprovar pedido'));
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleRequestDocuments = async () => {
    if (!selectedOrcamento || isSubmitting) return;
    const finalDocs = requestedDocs.filter(d => d.trim() !== '');
    if (finalDocs.length === 0) {
      toast.error('Adicione pelo menos um documento.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('orcamentos')
        .update({ 
          status: 'pendência documentos',
          documentos_solicitados: finalDocs,
          observacoes_servico: `${selectedOrcamento.observacoes_servico || ''}\n\n[ADM - Solicitação de Docs${colaboradorNome ? ` por ${colaboradorNome}` : ''}]: ${finalDocs.join(', ')}`.trim()
        })
        .eq('id', selectedOrcamento.id);

      if (error) throw error;

      await notificationService.notifyClient(
        selectedOrcamento.cliente_id,
        '📁 Documentos Solicitados',
        `Atenção: O sistema solicitou documentos para o orçamento ${selectedOrcamento.codigo_orcamento}. Verifique as pendências no seu portal. 📑`,
        'orcamentos',
        'orcamento_revisado',
        { tab: 'abertos', itemId: selectedOrcamento.id, prioridade: 'alta', contexto: { orcamento_id: selectedOrcamento.id, documentos: finalDocs } }
      );

      toast.success('Solicitação enviada ao cliente.');
      setIsDocRequestModalOpen(false);
      setIsDetailOpen(false);
      
      // Log Action
      await logService.logAction({ acao: 'ACAO_SISTEMA', detalhes: JSON.stringify({}), ator_tipo: 'admin', ator_nome: 'Administrador' });

      fetchOrcamentos();
    } catch (err: any) {
      toast.error(handleError(err, 'Erro ao solicitar documentos'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (status: string, message: string) => {
    if (!selectedOrcamento || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('orcamentos')
        .update({ 
          status,
          observacoes_servico: `${selectedOrcamento.observacoes_servico || ''}\n\n[ADM${colaboradorNome ? ` - ${colaboradorNome}` : ''}]: ${message}`.trim()
        })
        .eq('id', selectedOrcamento.id);

      if (error) throw error;

      await notificationService.notifyClient(
        selectedOrcamento.cliente_id,
        '📋 Atualização no Orçamento',
        message,
        'orcamentos',
        'orcamento_revisado',
        { tab: 'abertos', itemId: selectedOrcamento.id, contexto: { orcamento_id: selectedOrcamento.id } }
      );

      toast.success('Status atualizado e cliente notificado.');
      setIsDetailOpen(false);
      
      // Log Action
      await logService.logAction({ acao: 'ACAO_SISTEMA', detalhes: JSON.stringify({}), ator_tipo: 'admin', ator_nome: 'Administrador' });

      fetchOrcamentos();
    } catch (err: any) {
      toast.error(handleError(err, 'Erro ao atualizar status'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateDeliveryStatus = async (novoStatus: string, codigoRastreio?: string, transportadora?: string) => {
    if (!selectedOrcamento || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const updates: any = { status_entrega: novoStatus };
      
      const hoje = new Date().toISOString().split('T')[0];
      if (novoStatus === 'separacao') updates.data_separacao = hoje;
      if (novoStatus === 'em_transito') {
        updates.data_envio = hoje;
        if (codigoRastreio) updates.rastreio_codigo = codigoRastreio;
        if (transportadora) updates.rastreio_transportadora = transportadora;
      }
      if (novoStatus === 'entregue') updates.data_entrega = hoje;

      const { error } = await supabase
        .from('orcamentos')
        .update(updates)
        .eq('id', selectedOrcamento.id);

      if (error) throw error;

      await notificationService.notifyClient(
        selectedOrcamento.cliente_id,
        '📦 Atualização de Entrega',
        `O status do seu pedido #${selectedOrcamento.codigo_orcamento} mudou para: ${
          novoStatus === 'separacao' ? 'Em Separação' :
          novoStatus === 'em_transito' ? 'Em Transporte' :
          novoStatus === 'entregue' ? 'Entregue' : novoStatus
        }. Acompanhe na aba Meus Produtos.`,
        'orcamentos',
        'orcamento_aprovado',
        { tab: 'aprovados', itemId: selectedOrcamento.id, contexto: { orcamento_id: selectedOrcamento.id } }
      );

      toast.success('Status de entrega atualizado com sucesso!');
      
      // Update local state without closing modal
      setSelectedOrcamento({ ...selectedOrcamento, ...updates } as Orcamento);
      
      await logService.logAction({ acao: 'ATUALIZAR_ENTREGA', detalhes: JSON.stringify({ novoStatus, codigoRastreio }), ator_tipo: 'admin', ator_nome: colaboradorNome || 'Administrador' });

      fetchOrcamentos();
    } catch (err: any) {
      toast.error(handleError(err, 'Erro ao atualizar status de entrega'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveRevision = async (data: any) => {
    if (!selectedOrcamento || isSubmitting) return;
    setIsSubmitting(true);
    try {
      let finalDesconto = data.desconto || 0;
      let finalObservacoes = data.observacoes_servico || '';

      // Verificação de Desconto de Indicação (Primeira Compra)
      try {
        const { data: cliente } = await supabase
          .from('clientes')
          .select('indicacao_origem_id')
          .eq('id', selectedOrcamento.cliente_id)
          .single();

        if (cliente?.indicacao_origem_id) {
          // Verifica se é o primeiro orçamento (desconsiderando cancelados e considerando que este já existe)
          const { count } = await supabase
            .from('orcamentos')
            .select('*', { count: 'exact', head: true })
            .eq('cliente_id', selectedOrcamento.cliente_id)
            .neq('status', 'cancelado');

          // Se count for 1, significa que este é o único orçamento não cancelado do cliente
          if (count === 1) {
            const { data: indicacao } = await supabase
              .from('indicacoes')
              .select('status')
              .eq('id', cliente.indicacao_origem_id)
              .single();

            if (indicacao?.status === 'aberta') {
              const { data: allSettings } = await supabase
                .from('system_settings')
                .select('key, value');

              const getSet = (key: string, fallback: string) =>
                allSettings?.find((s: any) => s.key === key)?.value ?? fallback;

              const indicadoTipo = getSet('indicado_recompensa_tipo', 'desconto');

              // Só aplica desconto se o tipo incluir 'desconto'
              if (indicadoTipo !== 'pontos') {
                const discountPct = getSet(
                  'indicado_desconto_porcentagem',
                  getSet('desconto_indicado_porcentagem', '10')
                );
                const discountPercent = parseFloat(discountPct) / 100;
                const discountValue = data.valor_servico * discountPercent;

                // Só aplica se o desconto atual for zero
                if (finalDesconto === 0) {
                  finalDesconto = discountValue;
                  const discountMsg = `Desconto de ${parseFloat(discountPct)}% aplicado referente à campanha Indique e Ganhe (Primeira Compra).`;
                  if (!finalObservacoes.includes(discountMsg)) {
                    finalObservacoes = `${discountMsg}\n${finalObservacoes}`.trim();
                  }
                  toast.success(`Desconto de indicação (${parseFloat(discountPct)}%) aplicado!`);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Erro ao verificar desconto de indicação na revisão:', err);
      }

      // O desconto já vem consolidado do formulário (Manual + Promoção + Indicação)
      // Não somamos novamente para evitar duplicidade
      const total = data.valor_servico + data.valor_adicional + data.acrescimo - finalDesconto;

      const updateData: any = {
        valor_adicional: data.valor_adicional,
        acrescimo: data.acrescimo,
        desconto: finalDesconto,
        total,
        observacoes_servico: colaboradorNome ? `${finalObservacoes}\n\n[Revisado por: ${colaboradorNome}]` : finalObservacoes,
        status: 'aberto',
        categoria: data.categoria,
        servico_id: data.categoria === 'servico' ? data.servico_id : null,
        produto_id: data.categoria === 'produto' ? data.produto_id : null,
        assinatura_id: data.categoria === 'assinatura' ? data.assinatura_id : null,
      };

      if (data.categoria === 'produto') {
        updateData.valor_produto = data.valor_servico;
        updateData.valor_servico = null;
        updateData.valor_assinatura = null;
      } else if (data.categoria === 'assinatura') {
        updateData.valor_assinatura = data.valor_servico;
        updateData.valor_servico = null;
        updateData.valor_produto = null;
      } else {
        updateData.valor_servico = data.valor_servico;
        updateData.valor_produto = null;
        updateData.valor_assinatura = null;
      }

      const { error } = await supabase
        .from('orcamentos')
        .update(updateData)
        .eq('id', selectedOrcamento.id);

      if (error) throw error;

      await notificationService.notifyClient(
        selectedOrcamento.cliente_id,
        '📄 Orçamento Revisado e Disponível',
        `Seu orçamento ${selectedOrcamento.codigo_orcamento} foi revisado e está pronto para aprovação. ✨`,
        'orcamentos',
        'orcamento_revisado',
        { tab: 'abertos', itemId: selectedOrcamento.id, prioridade: 'alta', contexto: { orcamento_id: selectedOrcamento.id, codigo: selectedOrcamento.codigo_orcamento } }
      );

      toast.success('Orçamento revisado e enviado para o cliente!');
      setIsDetailOpen(false);
      
      // Log Action
      await logService.logAction({ acao: 'ACAO_SISTEMA', detalhes: JSON.stringify({}), ator_tipo: 'admin', ator_nome: 'Administrador' });

      fetchOrcamentos();
    } catch (err: any) {
      toast.error(handleError(err, 'Erro ao salvar revisão'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const orc = (orcamentos as any[]).find(o => o.id === id);
      const itemsToCancel = orc?.items || [orc];

      const itemIds = itemsToCancel.filter(i => i).map(i => i.id);
      if (itemIds.length > 0) {
        const { error } = await supabase
          .from('orcamentos')
          .update({ status: 'cancelado' })
          .in('id', itemIds);
        if (error) throw error;
      }

      if (orc) {
        await notificationService.notifyClient(
          orc.cliente_id || '',
          '❌ Pedido Cancelado',
          `Seu pedido ${orc.codigo_orcamento} foi cancelado pelo sistema. ⚠️`,
          'orcamentos',
          'orcamento_recusado',
          { tab: 'cancelados', itemId: orc.id, prioridade: 'normal' }
        );
      }

      toast.success('Pedido cancelado.');
      setIsDetailOpen(false);
      fetchOrcamentos();
    } catch (err) {
      console.error('Erro ao cancelar:', err);
      toast.error('Erro ao processar cancelamento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      {/* Search and Actions Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-[2rem] shadow-sm ring-1 ring-black/5 mx-2">
        <div className="w-full md:w-auto flex-1">
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
                label: 'Mês de Criação',
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

        <button
          onClick={() => setIsWizardOpen(true)}
          className="w-full md:w-auto flex items-center justify-center gap-3 rounded-2xl bg-[#1a1a1a] px-8 py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-xl transition-all hover:bg-black active:scale-95 group"
        >
          <Plus className="h-5 w-5 transition-transform group-hover:rotate-90" />
          Novo Orçamento
        </button>
      </div>

      {/* Mobile view cards */}
      <div className="md:hidden space-y-4 px-2">
        {orcamentos.length > 0 ? groupedOrcamentos(orcamentos).map((orc) => (
          <div 
            key={orc.id} 
            id={`budget-${orc.id}`}
            className={`bg-white rounded-[2rem] p-6 shadow-sm ring-1 ring-black/5 space-y-4 transition-all ${
              highlightedId === orc.id 
                ? 'bg-indigo-50 ring-2 ring-indigo-500 scale-[1.01] z-10' 
                : ''
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] font-black text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-lg ring-1 ring-indigo-100 w-fit">
                  {orc.codigo_orcamento}
                </span>
                {(orc as any).visualizado_cliente && (
                  <span className="flex items-center gap-1 text-[8px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 px-1.5 py-0.5 rounded-md w-fit">
                    <Clock className="h-3 w-3" />
                    Visualizado
                  </span>
                )}
              </div>
              <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{formatDate(orc.data_criacao)}</span>
            </div>
            
            <div>
              <h4 className="text-sm font-black text-neutral-900">{(orc as any).clientes?.nome}</h4>
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{(orc as any).clientes?.codigo_cliente}</p>
            </div>

            <div className="flex justify-between items-center py-3 border-y border-neutral-50">
              <span className="text-xs font-bold text-neutral-600 uppercase tracking-tight">
                {orc.items?.length > 1 
                      ? `${orc.items.length} itens no pedido`
                      : (orc.categoria === 'servico' && (orc as any).servicos?.nome ? (orc as any).servicos.nome : 
                         orc.categoria === 'produto' && (orc as any).produtos?.nome ? (orc as any).produtos.nome : 
                         orc.categoria === 'assinatura' && (orc as any).assinaturas?.nome ? (orc as any).assinaturas.nome : 
                         orc.titulo_solicitacao || 'Item Não Vinculado')}
              </span>
              <span className="text-sm font-black text-[#1a1a1a]">{formatCurrency(orc.total)}</span>
            </div>

            <button 
              onClick={() => { setSelectedOrcamento(orc); setIsDetailOpen(true); }}
              className="w-full rounded-2xl bg-indigo-600 py-4 text-[10px] font-black uppercase tracking-widest text-white transition-all active:scale-95 shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/30"
            >
              Ver Detalhes
            </button>
          </div>
        )) : (
          <div className="py-24 text-center">
            <FileText className="h-12 w-12 text-neutral-100 mx-auto mb-4" />
            <p className="text-[10px] font-black text-neutral-300 uppercase tracking-widest">Nenhum orçamento {activeTab} encontrado</p>
          </div>
        )}
      </div>

      {/* Desktop view table */}
      <div className="hidden md:block overflow-hidden rounded-[2.5rem] bg-white shadow-sm ring-1 ring-black/5">
        <table className="w-full text-left min-w-[800px] border-collapse">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50/50">
              <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-neutral-400">Código</th>
              <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-neutral-400">Cliente</th>
              <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-neutral-400">Item</th>
              <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-neutral-400">Qtd</th>
              <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-neutral-400">Total</th>
              <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-neutral-400">Data</th>
              <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-neutral-400 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {orcamentos.length > 0 ? groupedOrcamentos(orcamentos).map((orc) => (
              <tr 
                key={orc.id} 
                id={`budget-${orc.id}`}
                className={`group transition-all ${
                  highlightedId === orc.id 
                    ? 'bg-indigo-50/80 ring-2 ring-indigo-500 z-10' 
                    : 'hover:bg-neutral-50/50'
                }`}
              >
                <td className="px-8 py-6">
                  <div className="flex flex-col gap-1.5">
                    <span className="font-mono text-[10px] font-black text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-lg ring-1 ring-indigo-100 w-fit">
                      {orc.codigo_orcamento}
                    </span>
                    {(orc as any).visualizado_cliente && (
                      <span className="flex items-center gap-1 text-[8px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 px-1.5 py-0.5 rounded-md w-fit">
                        <Clock className="h-3 w-3" />
                        Visualizado
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-8 py-6">
                  <div className="flex flex-col">
                    <span className="text-sm font-black text-neutral-900 group-hover:text-indigo-600 transition-colors">{(orc as any).clientes?.nome}</span>
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{(orc as any).clientes?.codigo_cliente}</span>
                  </div>
                </td>
                <td className="px-8 py-6">
                  <span className="text-xs font-bold text-neutral-600 uppercase tracking-tight">
                    {orc.items?.length > 1 
                      ? `${orc.items.length} itens no pedido`
                      : (orc.categoria === 'servico' && (orc as any).servicos?.nome ? (orc as any).servicos.nome : 
                         orc.categoria === 'produto' && (orc as any).produtos?.nome ? (orc as any).produtos.nome : 
                         orc.categoria === 'assinatura' && (orc as any).assinaturas?.nome ? (orc as any).assinaturas.nome : orc.titulo_solicitacao || 'Item')}
                  </span>
                </td>
                <td className="px-8 py-6">
                  <span className="text-sm font-black text-neutral-900">{orc.quantidade || 1}</span>
                </td>
                <td className="px-8 py-6">
                  <span className="text-sm font-black text-[#1a1a1a] tracking-tight">{formatCurrency(orc.total)}</span>
                </td>
                <td className="px-8 py-6">
                  <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{formatDate(orc.data_criacao)}</span>
                </td>
                <td className="px-8 py-6 text-right">
                  <button 
                    onClick={() => { setSelectedOrcamento(orc); setIsDetailOpen(true); }}
                    className="rounded-xl bg-neutral-100 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-neutral-600 transition-all hover:bg-[#1a1a1a] hover:text-white active:scale-95 shadow-sm"
                  >
                    Detalhes
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={7} className="px-8 py-24 text-center">
                  <FileText className="h-12 w-12 text-neutral-100 mx-auto mb-4" />
                  <p className="text-[10px] font-black text-neutral-300 uppercase tracking-widest">Nenhum orçamento {activeTab} encontrado</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {orcamentos.length > 0 && (
        <div className="admin-pagination mt-4">
          <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0} className="px-4 py-2 text-sm font-bold text-neutral-600 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 disabled:opacity-50">Anterior</button>
          <span className="text-sm font-bold text-neutral-600">Página {currentPage + 1}</span>
          <button onClick={() => setCurrentPage(p => p + 1)} disabled={orcamentos.length < PAGE_SIZE} className="px-4 py-2 text-sm font-bold text-neutral-600 bg-white border border-neutral-200 rounded-xl hover:bg-neutral-50 disabled:opacity-50">Próximo</button>
        </div>
      )}

      <Modal isOpen={isWizardOpen} onClose={() => setIsWizardOpen(false)} title="Novo Orçamento" size="full">
        <div className="max-w-6xl mx-auto py-8">
          <OrcamentoWizard colaboradorNome={colaboradorNome} onFinish={() => { setIsWizardOpen(false); fetchOrcamentos(); }} onCancel={() => setIsWizardOpen(false)} />
        </div>
      </Modal>

      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Detalhes do Orçamento" size="full">
        {selectedOrcamento && (
          <OrcamentoDetails 
            colaboradorNome={colaboradorNome}
            orcamento={selectedOrcamento} 
            isSubmitting={isSubmitting}
            onApprove={() => handleApprove(selectedOrcamento)}
            onCancel={() => handleCancel(selectedOrcamento.id)}
            onApproveNegotiation={() => handleApproveNegotiation(selectedOrcamento)}
            onRenegotiate={() => {
              setRenegotiateValue(selectedOrcamento.desconto_solicitado_porcentagem || 0);
              setIsRenegotiateModalOpen(true);
            }}
            onSaveRevision={handleSaveRevision}
            onUpdateStatus={handleUpdateStatus}
            onRequestDocuments={() => setIsDocRequestModalOpen(true)}
            onUpdateDeliveryStatus={handleUpdateDeliveryStatus}
          />
        )}
      </Modal>

      <Modal isOpen={isDocRequestModalOpen} onClose={() => setIsDocRequestModalOpen(false)} title="Solicitar Documentos Específicos" size="wide">
        <div className="space-y-6">
          <div className="rounded-2xl bg-indigo-50 p-4 ring-1 ring-indigo-100">
            <p className="text-xs font-bold text-indigo-700 leading-relaxed">
              Liste abaixo os documentos necessários. O cliente verá um botão de upload específico para cada item da lista.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-2">Documentos Necessários</label>
            {requestedDocs.map((doc, index) => (
              <div key={index} className="flex gap-2">
                <input 
                  type="text"
                  placeholder="Ex: CNH, CPF, Comprovante de Residência..."
                  value={doc}
                  onChange={(e) => {
                    const newDocs = [...requestedDocs];
                    newDocs[index] = e.target.value;
                    setRequestedDocs(newDocs);
                  }}
                  className="flex-1 rounded-2xl bg-white p-3 font-bold text-neutral-900 ring-1 ring-neutral-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
                {requestedDocs.length > 1 && (
                  <button 
                    onClick={() => setRequestedDocs(requestedDocs.filter((_, i) => i !== index))}
                    className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
              </div>
            ))}
            
            <button 
              onClick={() => setRequestedDocs([...requestedDocs, ''])}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-neutral-200 text-xs font-black text-neutral-400 uppercase tracking-widest hover:border-indigo-500 hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Adicionar outro documento
            </button>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              onClick={() => setIsDocRequestModalOpen(false)}
              className="flex-1 rounded-2xl border border-neutral-200 py-4 text-sm font-black text-neutral-400 uppercase tracking-widest hover:bg-neutral-50"
            >
              Cancelar
            </button>
            <button 
              onClick={handleRequestDocuments}
              disabled={isSubmitting || requestedDocs.every(d => d.trim() === '')}
              className="flex-1 rounded-2xl bg-indigo-600 py-4 text-sm font-black text-white uppercase tracking-widest shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Enviando...' : 'Enviar Solicitação'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isRenegotiateModalOpen} onClose={() => setIsRenegotiateModalOpen(false)} title="Negociar Desconto Especial" size="wide">
        <div className="space-y-6">
          <div>
            <label className="mb-1 block text-sm font-bold text-neutral-700">Desconto Máximo Final (%)</label>
            <input  
              type="number"
              min="0"
              max="100"
              value={isNaN(renegotiateValue) ? 0 : renegotiateValue}
              inputMode="numeric"
onChange={e => {
                const val = e.target.value === '' ? 0 : Number(e.target.value);
                setRenegotiateValue(isNaN(val) ? 0 : val);
              }}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-lg font-bold focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => !isSubmitting && setIsRenegotiateModalOpen(false)}
              disabled={isSubmitting}
              className="flex-1 rounded-2xl border border-neutral-200 py-4 font-bold text-neutral-600 hover:bg-neutral-50 px-4 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button 
              onClick={handleRenegotiate}
              disabled={isSubmitting}
              className="flex-1 rounded-2xl bg-indigo-600 py-4 font-bold text-white shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 px-4 disabled:opacity-50"
            >
              {isSubmitting ? 'Enviando...' : 'Reenviar para Cliente'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function OrcamentoWizard({ onFinish, onCancel, colaboradorNome }: { onFinish: () => void, onCancel: () => void, colaboradorNome?: string }) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    cliente_id: '',
    servico_id: '',
    produto_id: '',
    assinatura_id: '',
    categoria: 'servico' as 'servico' | 'produto' | 'assinatura',
    observacoes_servico: '',
    valor_servico: 0,
    valor_adicional: 0,
    descricao_adicional: '',
    acrescimo: 0,
    desconto: 0,
    promocao_desconto_manual: 0,
    total: 0,
    quantidade_meses: 0,
    prazo_indeterminado: false,
    quantidade: 1,
    dia_vencimento: 10,
    data_emissao: new Date().toISOString().split('T')[0],
  });

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([]);
  const [isReferralDiscountApplied, setIsReferralDiscountApplied] = useState(false);
  const [promocaoAtiva, setPromocaoAtiva] = useState<{promocao: Promocao, clientePromocao: ClientePromocao} | null>(null);
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [promocaoAplicada, setPromocaoAplicada] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (formData.cliente_id && formData.categoria) {
      checkActivePromotion(formData.cliente_id, formData.categoria);
    }
  }, [formData.cliente_id, formData.categoria]);

  const checkActivePromotion = async (clienteId: string, categoria: string) => {
    try {
      const { data: clientPromos, error } = await supabase
        .from('cliente_promocoes')
        .select('*, promocoes!inner(*)')
        .eq('cliente_id', clienteId)
        .eq('status', 'ativa')
        .eq('promocoes.status', 'ativa');
      
      if (error) throw error;

      const { data: openOrcamentos } = await supabase
        .from('orcamentos')
        .select('promocao_id')
        .eq('cliente_id', clienteId)
        .neq('status', 'cancelado')
        .not('promocao_id', 'is', null);

      const usedPromoIds = openOrcamentos?.map(o => o.promocao_id) || [];
      
      // Filtra por categoria: categoria específica OU 'geral'
      const availablePromos = clientPromos?.filter(cp => {
        const promo = cp.promocoes as any;
        const matchesCategory = promo.tipo === 'geral' || promo.tipo === categoria;
        return matchesCategory && !usedPromoIds.includes(cp.promocao_id);
      }) || [];

      if (availablePromos.length > 0) {
        const data = availablePromos[0];
        setPromocaoAtiva({promocao: data.promocoes as any, clientePromocao: data as any});
        setIsPromoModalOpen(true);
      } else {
        setPromocaoAtiva(null);
        setPromocaoAplicada(null);
        setFormData(prev => ({ ...prev, promocao_desconto_manual: 0 }));
      }
    } catch (err) {
      console.error('Erro ao verificar promoção ativa:', err);
    }
  };

  // Efeito para cálculo automático de desconto de promoção
  useEffect(() => {
    if (promocaoAplicada && promocaoAtiva?.promocao && promocaoAtiva.promocao.tipo_desconto && promocaoAtiva.promocao.tipo_desconto !== 'nenhum') {
      const promo = promocaoAtiva.promocao;
      let calculated = 0;
      // Cálculo baseado no valor base e quantidade
      const baseValue = formData.valor_servico;
      
      if (promo.tipo_desconto === 'valor') {
        calculated = promo.valor_desconto || 0;
      } else if (promo.tipo_desconto === 'porcentagem') {
        calculated = (baseValue * formData.quantidade) * ((promo.valor_desconto || 0) / 100);
      }
      
      if (calculated !== formData.promocao_desconto_manual) {
        setFormData(prev => ({ ...prev, promocao_desconto_manual: calculated }));
      }
    } else if (!promocaoAplicada && formData.promocao_desconto_manual !== 0) {
      setFormData(prev => ({ ...prev, promocao_desconto_manual: 0 }));
    }
  }, [formData.valor_servico, formData.quantidade, promocaoAplicada, promocaoAtiva]);

  const checkReferralDiscount = async (clienteId: string, valorServico: number) => {
    try {
      // 1. Check if client has indicacao_origem_id
      const { data: cliente } = await supabase
        .from('clientes')
        .select('indicacao_origem_id')
        .eq('id', clienteId)
        .single();

      if (cliente?.indicacao_origem_id) {
        // 2. Check if client has a valid active budget (not cancelled, and its OS is not cancelled)
        const { data: activeOrcamentos } = await supabase
          .from('orcamentos')
          .select('id, status, ordens_servico(status)')
          .eq('cliente_id', clienteId)
          .neq('status', 'cancelado');

        const hasValidBudget = activeOrcamentos?.some((orc: any) => {
          const osList = orc.ordens_servico;
          if (osList && Array.isArray(osList) && osList.length > 0) {
            // Se todas as OS desse orçamento estiverem canceladas, consideramos o orçamento inválido
            return !osList.every((os: any) => os.status === 'cancelado');
          }
          return true;
        });

        if (!hasValidBudget) {
          // 3. Check if the referral is still open
          const { data: indicacao } = await supabase
            .from('indicacoes')
            .select('status')
            .eq('id', cliente.indicacao_origem_id)
            .single();

          if (indicacao?.status === 'aberta') {
            // 4. Buscar tipo de recompensa do indicado
            const { data: allSettings } = await supabase
              .from('system_settings')
              .select('key, value');

            const getSet = (key: string, fallback: string) =>
              allSettings?.find(s => s.key === key)?.value ?? fallback;

            const indicadoTipo = getSet('indicado_recompensa_tipo', 'desconto');

            // Só aplica desconto se o tipo incluir 'desconto'
            if (indicadoTipo !== 'pontos') {
              // Ler nova chave com fallback para legada
              const discountPct = getSet(
                'indicado_desconto_porcentagem',
                getSet('desconto_indicado_porcentagem', '10')
              );
              const discountPercent = parseFloat(discountPct) / 100;

              // Apply discount
              const discountValue = valorServico * discountPercent;
              setFormData(prev => ({
                ...prev,
                desconto: discountValue,
                observacoes_servico: `Desconto de ${parseFloat(discountPct)}% aplicado referente à campanha Indique e Ganhe (Primeira Compra).\n${prev.observacoes_servico}`.trim()
              }));
              setIsReferralDiscountApplied(true);
              toast.success(`Desconto de indicação (${parseFloat(discountPct)}%) aplicado!`);
            }
          }
        }
      }
    } catch (err) {
      console.error('Erro ao verificar desconto de indicação:', err);
    }
  };

  const fetchData = async () => {
    try {
      const { data: c, error: ec } = await supabase.from('clientes').select('id, nome, codigo_cliente, tipo_pessoa').eq('status', 'ativo');
      if (ec) throw ec;
      const { data: s, error: es } = await supabase.from('servicos').select('*').eq('status', 'ativo');
      if (es) throw es;
      if (c) setClientes(c);
      if (s) setServicos(s);
    } catch (err: any) {
      toast.error('Erro ao buscar dados.');
    }
  };

  // Filtra catálogo pelo tipo_pessoa do cliente selecionado
  const clienteSelecionado = clientes.find(c => c.id === formData.cliente_id);
  const tipoCliente = (clienteSelecionado as any)?.tipo_pessoa as 'pf' | 'pj' | undefined;
  const servicosFiltrados = tipoCliente ? servicos.filter(s => (s as any).tipo_cliente === tipoCliente || (s as any).tipo_cliente === 'ambos') : servicos;
  const produtosFiltrados = tipoCliente ? produtos.filter(p => (p as any).tipo_cliente === tipoCliente || (p as any).tipo_cliente === 'ambos') : produtos;
  const assinaturasFiltradas = tipoCliente ? assinaturas.filter(a => (a as any).tipo_cliente === tipoCliente || (a as any).tipo_cliente === 'ambos') : assinaturas;

  const calculateTotal = () => {
    const subtotal = (formData.valor_servico + formData.valor_adicional) * formData.quantidade;
    const total = subtotal + formData.acrescimo - formData.desconto - formData.promocao_desconto_manual;
    return total;
  };

  const handleFinish = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const total = calculateTotal();
    
    // Preparamos os dados limpando strings vazias para null nos campos de ID
    const { prazo_indeterminado, ...dataToInsert } = formData;
    const insertData: any = {
      ...dataToInsert,
      promocao_id: promocaoAplicada,
      desconto: formData.desconto + formData.promocao_desconto_manual,
      codigo_orcamento: generateCode(formData.categoria === 'servico' ? '#OS' : 'ORC'),
      total,
      status: 'aberto',
      data_criacao: new Date().toISOString().split('T')[0],
      data_emissao: formData.data_emissao,
      // Garantimos que IDs vazios sejam enviados como null
      servico_id: formData.servico_id || null,
      produto_id: formData.produto_id || null,
      assinatura_id: formData.assinatura_id || null,
      quantidade_meses: formData.categoria === 'assinatura' ? (formData.prazo_indeterminado ? null : formData.quantidade_meses) : null,
      dia_vencimento: formData.categoria === 'assinatura' ? formData.dia_vencimento : null,
      quantidade: formData.quantidade
    };



    const { data: newBudget, error } = await supabase.from('orcamentos').insert([insertData]).select('id').single();

    if (error) {
      toast.error(handleError(error, 'Erro ao salvar orçamento'));
    } else {
      // Create notification for the client
      await notificationService.notifyClient(
        insertData.cliente_id,
        '📄 Novo Orçamento Disponível',
        `Um novo orçamento (${insertData.codigo_orcamento}) foi gerado para você. ✨`,
        'orcamentos',
        'orcamento_criado',
        { tab: 'abertos', itemId: newBudget.id, contexto: { orcamento_id: newBudget.id, codigo: insertData.codigo_orcamento } }
      );

      toast.success('Orçamento gerado com sucesso.');

      // Log Action
      await logService.logAction({ acao: 'ACAO_SISTEMA', detalhes: JSON.stringify({}), ator_tipo: 'admin', ator_nome: 'Administrador' });

      onFinish();
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-8">
      {/* Stepper */}
      <div className="flex items-center justify-between">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${step >= s ? 'bg-indigo-600 text-white shadow-lg' : 'bg-neutral-100 text-neutral-400'}`}>
              {s}
            </div>
            {s < 4 && <div className={`h-1 w-12 rounded-full ${step > s ? 'bg-indigo-600' : 'bg-neutral-100'}`} />}
          </div>
        ))}
      </div>

      <div className="min-h-[300px]">
        {step === 1 && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-neutral-900">Etapa 1: Cliente</h3>
            <div className="space-y-4">
              <label className="block text-sm font-bold text-neutral-700">Selecione o Cliente</label>
              <select 
                value={formData.cliente_id}
                onChange={e => setFormData({...formData, cliente_id: e.target.value})}
                disabled={!!promocaoAplicada}
                className={`w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none ${!!promocaoAplicada ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <option value="">Selecione...</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nome} ({c.codigo_cliente})</option>
                ))}
              </select>
            </div>

            <div className="space-y-4">
              <label className="block text-sm font-bold text-neutral-700">Data de Emissão</label>
              <input 
                type="date"
                value={formData.data_emissao}
                onChange={e => setFormData({...formData, data_emissao: e.target.value})}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none font-bold"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-neutral-900">Etapa 2: Categoria e Item</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-neutral-700">Categoria</label>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setFormData({...formData, categoria: 'servico', servico_id: '', produto_id: '', assinatura_id: '', valor_servico: 0})}
                    disabled={!!promocaoAplicada}
                    className={`flex-1 rounded-xl py-3 font-bold transition-all ${formData.categoria === 'servico' ? 'bg-indigo-600 text-white' : 'bg-neutral-100 text-neutral-600'} ${!!promocaoAplicada ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    Serviço
                  </button>
                </div>
                {promocaoAplicada && (
                  <p className="mt-2 text-[10px] font-bold text-indigo-600 uppercase flex items-center gap-1">
                    <Percent className="h-3 w-3" />
                    Categorias bloqueadas pois uma promoção está aplicada
                  </p>
                )}
              </div>
              
              {formData.categoria === 'servico' && (
                <div>
                  <label className="mb-1 block text-sm font-bold text-neutral-700">Selecione o Serviço {tipoCliente ? `(${tipoCliente === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'})` : ''}</label>
                  <select 
                    value={formData.servico_id}
                    onChange={e => {
                      const s = servicosFiltrados.find(sv => sv.id === e.target.value);
                      setFormData({...formData, servico_id: e.target.value, valor_servico: s?.valor || 0});
                    }}
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">Selecione...</option>
                    {servicosFiltrados.map(s => (
                      <option key={s.id} value={s.id}>{s.nome}{(s as any).categoria ? ` [${(s as any).categoria}]` : ''} ({formatCurrency(s.valor)})</option>
                    ))}
                  </select>
                  {tipoCliente && servicosFiltrados.length === 0 && (
                    <p className="mt-2 text-xs font-bold text-amber-600">Nenhum serviço cadastrado para {tipoCliente === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}.</p>
                  )}
                </div>
              )}


              
              <div>
                <label className="mb-1 block text-sm font-bold text-neutral-700">Observações</label>
                <textarea 
                  rows={3}
                  value={formData.observacoes_servico}
                  onChange={e => setFormData({...formData, observacoes_servico: e.target.value})}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-neutral-900">Etapa 3: Financeiro</h3>
            
            {promocaoAplicada && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 p-4 bg-indigo-50 rounded-2xl ring-1 ring-indigo-100 mb-6">
                <div>
                  <label className="mb-1 block text-sm font-bold text-neutral-700">Código Promoção</label>
                  <input 
                    type="text" 
                    readOnly
                    value={promocaoAtiva?.promocao.codigo_promocao || ''}
                    className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 font-mono font-bold text-indigo-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-bold text-neutral-700">Desconto da Promoção (Valor)</label>
                  <input  
                    type="text" 
                    value={maskCurrency(formData.promocao_desconto_manual)}
                    inputMode="decimal"
onChange={(e) => handleCurrencyInputChange(e.target.value, (val) => setFormData({...formData, promocao_desconto_manual: val}))}
                    className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 font-bold text-indigo-600 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-bold text-neutral-700">Valor Base (Serviço/Produto/Assinatura) *</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  required
                  value={maskCurrency(formData.valor_servico)}
                  onChange={e => handleCurrencyInputChange(e.target.value, (val) => setFormData({...formData, valor_servico: val}))}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 font-bold text-indigo-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-neutral-700">Quantidade</label>
                <input 
                  type="number" 
                  inputMode="numeric"
                  min="1"
                  value={formData.quantidade}
                  onChange={e => setFormData({...formData, quantidade: parseInt(e.target.value) || 1})}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-neutral-700">Valor Adicional</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  value={maskCurrency(formData.valor_adicional)}
                  onChange={e => handleCurrencyInputChange(e.target.value, (val) => setFormData({...formData, valor_adicional: val}))}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-neutral-700">Descrição Adicional</label>
                <input 
                  type="text" 
                  value={formData.descricao_adicional}
                  onChange={e => setFormData({...formData, descricao_adicional: e.target.value})}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-neutral-700">Acréscimo</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  value={maskCurrency(formData.acrescimo)}
                  onChange={e => handleCurrencyInputChange(e.target.value, (val) => setFormData({...formData, acrescimo: val}))}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-neutral-700">Desconto</label>
                <input 
                  type="text" 
                  inputMode="numeric"
                  value={maskCurrency(formData.desconto)}
                  onChange={e => handleCurrencyInputChange(e.target.value, (val) => setFormData({...formData, desconto: val}))}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2 border-t border-neutral-100 pt-4">
                <p className="text-right text-xs font-bold text-neutral-400 uppercase">Total Final</p>
                <p className="text-right text-3xl font-black text-indigo-600">{formatCurrency(calculateTotal())}</p>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-neutral-900">Etapa 4: Revisão</h3>
            <div className="rounded-3xl bg-neutral-50 p-8 ring-1 ring-neutral-200">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-bold text-neutral-400 uppercase">Cliente</p>
                  <p className="font-bold text-neutral-900">{clientes.find(c => c.id === formData.cliente_id)?.nome}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-neutral-400 uppercase">Item</p>
                  <p className="font-bold text-neutral-900">
                    {formData.categoria === 'servico' 
                      ? servicos.find(s => s.id === formData.servico_id)?.nome 
                      : formData.categoria === 'produto'
                      ? produtos.find(p => p.id === formData.produto_id)?.nome
                      : assinaturas.find(a => a.id === formData.assinatura_id)?.nome}
                  </p>
                </div>
                <div className="col-span-2 border-t border-neutral-200 pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-500">Subtotal (Serviços)</span>
                    <span className="font-bold text-neutral-900">{formatCurrency(formData.valor_servico + formData.valor_adicional)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-500">Acréscimo</span>
                    <span className="font-bold text-emerald-600">+ {formatCurrency(formData.acrescimo)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-500">Desconto</span>
                    <span className="font-bold text-red-600">- {formatCurrency(formData.desconto)}</span>
                  </div>
                  {promocaoAplicada && (
                    <div className="flex justify-between text-sm text-indigo-600 font-bold border-t border-indigo-100 mt-2 pt-2">
                      <span>Promoção Aplicada ({promocaoAtiva?.promocao.codigo_promocao})</span>
                      <span>- {formatCurrency(formData.promocao_desconto_manual)}</span>
                    </div>
                  )}
                  <div className="mt-4 flex justify-between border-t border-neutral-200 pt-4">
                    <span className="text-lg font-black text-neutral-900 uppercase">Total</span>
                    <span className="text-2xl font-black text-indigo-600">{formatCurrency(calculateTotal())}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-4 border-t border-neutral-100 pt-6">
        {step > 1 && (
          <button 
            onClick={() => setStep(step - 1)}
            className="flex items-center gap-2 rounded-xl border border-neutral-200 px-6 py-3 font-bold text-neutral-600 hover:bg-neutral-50"
          >
            <ChevronLeft className="h-5 w-5" />
            Voltar
          </button>
        )}
        <div className="flex-1" />
        {step < 4 ? (
          <button 
            onClick={() => {
              if (step === 2) {
                if (!promocaoAplicada && formData.cliente_id && formData.valor_servico > 0 && !isReferralDiscountApplied) {
                  checkReferralDiscount(formData.cliente_id, formData.valor_servico);
                }
              }
              setStep(step + 1);
            }}
            disabled={
              (step === 1 && !formData.cliente_id) ||
              (step === 2 && (
                (formData.categoria === 'servico' && !formData.servico_id) ||
                (formData.categoria === 'produto' && !formData.produto_id) ||
                (formData.categoria === 'assinatura' && (!formData.assinatura_id || (!formData.prazo_indeterminado && formData.quantidade_meses <= 0)))
              ))
            }
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-3 font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50"
          >
            Próxima Etapa
            <ChevronRight className="h-5 w-5" />
          </button>
        ) : (
          <button 
            onClick={handleFinish}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Gerando...' : 'Finalizar Orçamento'}
            <CheckCircle className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Promo Modal */}
      <Modal isOpen={isPromoModalOpen} onClose={() => setIsPromoModalOpen(false)} title="Promoção Ativa Encontrada!">
        {promocaoAtiva && promocaoAtiva.promocao && (
          <div className="space-y-4">
            <p className="text-neutral-600">O cliente possui uma promoção ativa para esta categoria:</p>
            <div className="bg-indigo-50 p-4 rounded-xl">
              <h4 className="font-bold text-indigo-900">{promocaoAtiva.promocao.titulo}</h4>
              <p className="text-sm text-indigo-700">{promocaoAtiva.promocao.descricao}</p>
              <p className="text-xs font-bold text-indigo-600 mt-2">Código: {promocaoAtiva.promocao.codigo_promocao}</p>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => setIsPromoModalOpen(false)}
                className="flex-1 rounded-xl border border-neutral-200 py-3 font-bold text-neutral-600 hover:bg-neutral-50"
              >
                Não utilizar
              </button>
              <button 
                onClick={() => {
                  if (promocaoAtiva && promocaoAtiva.promocao) {
                    setPromocaoAplicada(promocaoAtiva.promocao.id);
                    setFormData(prev => ({
                      ...prev,
                      observacoes_servico: `Neste orçamento está a promoção aplicada código ${promocaoAtiva.promocao.codigo_promocao} referente a ${promocaoAtiva.promocao.titulo}.\n${prev.observacoes_servico}`.trim()
                    }));
                    setIsPromoModalOpen(false);
                    toast.success('Promoção aplicada!');
                  }
                }}
                className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold text-white shadow-lg hover:bg-indigo-700"
              >
                Utilizar promoção
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function OrcamentoDetails({ 
  orcamento, 
  isSubmitting,
  onApprove,
  onCancel,
  onApproveNegotiation,
  onRenegotiate,
  onSaveRevision,
  onUpdateStatus,
  onRequestDocuments,
  colaboradorNome,
  onUpdateDeliveryStatus
}: { 
  orcamento: Orcamento, 
  isSubmitting: boolean,
  onApprove: () => void,
  onCancel: () => void,
  onApproveNegotiation?: () => void,
  onRenegotiate?: () => void,
  onSaveRevision?: (data: any) => void,
  onUpdateStatus?: (status: string, message: string) => void,
  onRequestDocuments?: () => void,
  colaboradorNome?: string,
  onUpdateDeliveryStatus?: (novoStatus: string, codigoRastreio?: string, transportadora?: string) => Promise<void>
}) {
  const [editData, setEditData] = useState({
    valor_servico: orcamento.categoria === 'produto' ? orcamento.valor_produto || 0 :
                   orcamento.categoria === 'assinatura' ? orcamento.valor_assinatura || 0 :
                   orcamento.valor_servico || 0,
    valor_adicional: orcamento.valor_adicional,
    acrescimo: orcamento.acrescimo,
    desconto: orcamento.desconto,
    promocao_desconto_manual: (orcamento as any).promocao_desconto_manual || 0,
    observacoes_servico: orcamento.observacoes_servico || '',
    categoria: orcamento.categoria || 'servico',
    servico_id: orcamento.servico_id || '',
    produto_id: orcamento.produto_id || '',
    assinatura_id: orcamento.assinatura_id || ''
  });

  const [promocaoVinc, setPromocaoVinc] = useState<any | null>(null);

  useEffect(() => {
    const fetchPromo = async () => {
      let pId = orcamento.promocao_id || (orcamento as any).promocao_id;
      
      // Fallback: se não tiver no objeto (cache de esquema), busca no banco
      if (!pId) {
        try {
          const { data } = await supabase
            .from('orcamentos')
            .select('promocao_id')
            .eq('id', orcamento.id)
            .single();
          pId = data?.promocao_id;
        } catch (e) {
          console.error('Erro ao buscar promocao_id via fallback:', e);
        }
      }

      if (pId) {
        const { data } = await supabase.from('promocoes').select('*').eq('id', pId).single();
        setPromocaoVinc(data);
      } else {
        setPromocaoVinc(null);
      }
    };
    fetchPromo();
  }, [orcamento.id, orcamento.promocao_id]);

  const calculateAutoDiscount = (valorBase: number) => {
    let promoDesc = 0;
    if (promocaoVinc && promocaoVinc.tipo_desconto && promocaoVinc.tipo_desconto !== 'nenhum') {
      if (promocaoVinc.tipo_desconto === 'valor') {
        promoDesc = promocaoVinc.valor_desconto || 0;
      } else if (promocaoVinc.tipo_desconto === 'porcentagem') {
        promoDesc = valorBase * ((promocaoVinc.valor_desconto || 0) / 100);
      }
    }
    
    let referralDesc = 0;
    if (isPrimeiroOrcamento && nomeIndicador) {
      referralDesc = parseFloat((valorBase * (indicadoDescontoPct / 100)).toFixed(2));
    }
    
    return { promoDesc, referralDesc };
  };

  // Efeito para cálculo reativo de desconto de promoção no formulário de revisão ao mudar valor manualmente
  useEffect(() => {
    if (promocaoVinc && orcamento.status === 'em revisão') {
      const { promoDesc, referralDesc } = calculateAutoDiscount(editData.valor_servico);
      const totalAutoDesc = promoDesc + referralDesc;
      
      // Só aplica se o desconto atual for 0 ou se estivermos re-calculando após troca de valor/item
      // Se o admin já editou o desconto manualmente para algo diferente de 0, não sobrescrevemos a menos que seja necessário
      if (totalAutoDesc > 0 && editData.desconto === 0) {
        setEditData(prev => ({ ...prev, desconto: totalAutoDesc }));
        toast.success(`Descontos automáticos aplicados: ${formatCurrency(totalAutoDesc)}`);
      }
    }
  }, [editData.valor_servico, promocaoVinc, orcamento.status]);

  useEffect(() => {
    setEditData({
      valor_servico: orcamento.categoria === 'produto' ? orcamento.valor_produto || 0 :
                     orcamento.categoria === 'assinatura' ? orcamento.valor_assinatura || 0 :
                     orcamento.valor_servico || 0,
      valor_adicional: orcamento.valor_adicional || 0,
      acrescimo: orcamento.acrescimo || 0,
      desconto: orcamento.desconto || 0,
      promocao_desconto_manual: (orcamento as any).promocao_desconto_manual || 0,
      observacoes_servico: orcamento.observacoes_servico || '',
      categoria: orcamento.categoria || 'servico',
      servico_id: orcamento.servico_id || '',
      produto_id: orcamento.produto_id || '',
      assinatura_id: orcamento.assinatura_id || ''
    });
  }, [orcamento.id, orcamento.categoria]);

  const [servicos, setServicos] = useState<Servico[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([]);

  // Rastreamento State
  const [isTrackingUpdateModalOpen, setIsTrackingUpdateModalOpen] = useState(false);
  const [trackingUpdateData, setTrackingUpdateData] = useState({
    status_entrega: '',
    rastreio_codigo: '',
    rastreio_transportadora: ''
  });

  // --- Primeiro Orçamento + Cliente Indicado: carrega % de desconto configurado ---
  const [isPrimeiroOrcamento, setIsPrimeiroOrcamento] = useState(false);
  const [nomeIndicador, setNomeIndicador] = useState<string | null>(null);
  const [indicadoDescontoPct, setIndicadoDescontoPct] = useState(10);

  useEffect(() => {
    const verificarPrimeiroOrcamento = async () => {
      if (!orcamento.cliente_id) return;

      // 1. Verificar se é o primeiro orçamento deste cliente
      const { data: orcamentosCliente } = await supabase
        .from('orcamentos')
        .select('id')
        .eq('cliente_id', orcamento.cliente_id)
        .not('status', 'eq', 'cancelado');

      const totalOrcamentos = orcamentosCliente?.length ?? 0;
      const ehPrimeiro = totalOrcamentos <= 1; // só este mesmo orçamento

      setIsPrimeiroOrcamento(ehPrimeiro);

      // 2. Se for primeiro, verificar se o cliente foi indicado e buscar % do sistema
      if (ehPrimeiro) {
        const clienteIndicacaoId = (orcamento as any).clientes?.indicacao_origem_id;
        if (clienteIndicacaoId) {
          const { data: indicacao } = await supabase
            .from('indicacoes')
            .select('indicador:clientes!indicador_id(nome)')
            .eq('id', clienteIndicacaoId)
            .single();
          const nomeInd = (indicacao?.indicador as any)?.nome || null;
          setNomeIndicador(nomeInd);

          // 3. Buscar % de desconto configurado no sistema
          const { fetchReferralSettings } = await import('../../utils/referralHelpers');
          const settings = await fetchReferralSettings();
          setIndicadoDescontoPct(settings.indicado_desconto_porcentagem);
        } else {
          setNomeIndicador(null);
        }
      }
    };
    verificarPrimeiroOrcamento();
  }, [orcamento.id, orcamento.cliente_id]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: s, error: es } = await supabase.from('servicos').select('*').eq('status', 'ativo');
        if (es) throw es;
        const { data: p, error: ep } = await supabase.from('produtos').select('*').eq('status', 'ativo');
        if (ep) throw ep;
        const { data: a, error: ea } = await supabase.from('assinaturas').select('*').eq('status', 'ativo');
        if (ea) throw ea;
        if (s) setServicos(s);
        if (p) setProdutos(p);
        if (a) setAssinaturas(a);
      } catch (err: any) {
        toast.error('Erro ao buscar catálogo.');
      }
    };
    fetchData();
  }, []);

  const tipoCliente = (orcamento as any)?.clientes?.tipo_pessoa as 'pf' | 'pj' | undefined;
  const servicosFiltrados = tipoCliente ? servicos.filter(s => (s as any).tipo_cliente === tipoCliente || (s as any).tipo_cliente === 'ambos') : servicos;
  const produtosFiltrados = tipoCliente ? produtos.filter(p => (p as any).tipo_cliente === tipoCliente || (p as any).tipo_cliente === 'ambos') : produtos;
  const assinaturasFiltradas = tipoCliente ? assinaturas.filter(a => (a as any).tipo_cliente === tipoCliente || (a as any).tipo_cliente === 'ambos') : assinaturas;

  return (
    <div className="max-w-6xl mx-auto py-6">
      <div className="flex flex-col gap-10">
        
        {/* Superior: Status and Highlights */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] shadow-sm ring-1 ring-black/5">
           <div className="flex items-center gap-6">
              <div className="h-16 w-16 flex items-center justify-center rounded-3xl bg-indigo-50 text-indigo-600">
                <FileText className="h-8 w-8" />
              </div>
              <div>
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest leading-none mb-1">Identificação</p>
                <h2 className="text-2xl font-black text-neutral-900 uppercase tracking-tight">{orcamento.codigo_orcamento}</h2>
              </div>
           </div>

           <div className="flex items-center gap-4">
              <AdminWhatsAppButton 
                telefone={(orcamento as any).clientes?.telefone}
                mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                  tipo: 'orcamento',
                  clienteNome: (orcamento as any).clientes?.nome,
                  codigo: orcamento.codigo_orcamento,
                  status: orcamento.status,
                  valorTotal: formatCurrency(orcamento.total)
                })}
              />
              <div className="text-right hidden sm:block">
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest leading-none mb-1">Status do Registro</p>
                <p className="text-xs font-bold text-neutral-500 uppercase">{orcamento.status === 'em revisão' ? 'Em Análise pelo Admin' : 'Processamento Padrão'}</p>
              </div>
              <span className={`rounded-2xl px-6 py-3 text-xs font-black uppercase tracking-widest ${
                orcamento.status === 'aberto' ? 'bg-amber-100 text-amber-700 font-black' : 
                orcamento.status === 'negociação' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' :
                orcamento.status === 'em revisão' ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' :
                orcamento.status === 'aprovado' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                {orcamento.status === 'em revisão' ? 'Revisão Necessária' : orcamento.status}
              </span>
           </div>
        </div>

        {/* Banner: Primeiro Orçamento + Cliente Indicado */}
        {isPrimeiroOrcamento && (
          <div className="flex items-start gap-4 rounded-[2rem] bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white shadow-xl shadow-emerald-900/20 animate-in fade-in slide-in-from-top-2">
            <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md">
              <span className="text-xl">🎉</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-white/70 mb-1">Primeiro Orçamento do Cliente</p>
              {nomeIndicador ? (
                <>
                  <p className="text-sm font-black text-white leading-snug">
                    Este cliente foi indicado por <span className="underline decoration-white/40 underline-offset-2">{nomeIndicador}</span>.
                  </p>
                  <p className="text-xs font-medium text-white/80 mt-1">
                    Pelo programa de indicações, o cliente tem direito a <strong className="text-white">10% de desconto</strong> neste primeiro orçamento.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-black text-white leading-snug">
                    Este é o primeiro pedido de orçamento deste cliente.
                  </p>
                  <p className="text-xs font-medium text-white/80 mt-1">
                    Considere aplicar uma condição especial de boas-vindas.
                  </p>
                </>
              )}
            </div>
            <div className="shrink-0 text-right hidden sm:block">
              <p className="text-[10px] font-black text-white/50 uppercase tracking-widest">Desconto Indicação</p>
              <p className="text-3xl font-black text-white">{nomeIndicador ? '10%' : '—'}</p>
            </div>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
          
          {/* Left/Main Column: Data and Forms */}
          <div className="lg:col-span-2 space-y-10">
            
            {/* Negotiation Banner */}
            {orcamento.status === 'negociação' && (
              <section className="rounded-[2.5rem] bg-indigo-600 p-10 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700"></div>
                <div className="relative z-10 space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 flex items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md">
                      <Percent className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-black uppercase tracking-tight">Solicitação de Negociação Pendente</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6 bg-white/10 backdrop-blur-sm rounded-3xl ring-1 ring-white/10">
                    <div>
                      <p className="text-[10px] font-black uppercase text-white/60 tracking-wider mb-2">Proposta do Cliente</p>
                      <p className="text-3xl font-black">{orcamento.desconto_solicitado_porcentagem || 0}% <span className="text-sm font-medium opacity-60 uppercase ml-1">de desconto</span></p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-white/60 tracking-wider mb-2">Valor Solicitado</p>
                      <p className="text-3xl font-black">{formatCurrency(orcamento.total * (1 - (orcamento.desconto_solicitado_porcentagem || 0) / 100))}</p>
                    </div>
                    <div className="md:col-span-2 pt-4 border-t border-white/10">
                      <p className="text-[10px] font-black uppercase text-white/60 tracking-wider mb-2">Justificativa Enviada</p>
                      <p className="text-sm font-medium italic leading-relaxed mb-4">"{orcamento.motivo_desconto || 'Nenhuma justificativa detalhada foi fornecida pelo cliente.'}"</p>
                      
                      {(orcamento.comprovante_concorrente || (orcamento.comprovante_concorrente_urls && orcamento.comprovante_concorrente_urls.length > 0)) && (
                        <div className="mt-4">
                          <p className="text-[10px] font-black uppercase text-white/60 tracking-wider mb-2">Comprovante(s) do Concorrente</p>
                          <div className="flex flex-wrap gap-2">
                            {orcamento.comprovante_concorrente && (
                              <a 
                                href={orcamento.comprovante_concorrente} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 transition-all rounded-xl text-xs font-bold text-white ring-1 ring-white/20"
                              >
                                <FileText className="h-4 w-4" />
                                Comprovante (Legado)
                              </a>
                            )}
                            {orcamento.comprovante_concorrente_urls?.map((url, idx) => (
                              <a 
                                key={idx}
                                href={url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 transition-all rounded-xl text-xs font-bold text-white ring-1 ring-white/20"
                              >
                                <FileText className="h-4 w-4" />
                                Ver Comprovante {idx + 1}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {orcamento.fase_negociacao === 'cliente' && (
                    <div className="flex items-center gap-3 py-3 px-5 rounded-2xl bg-amber-500/20 ring-1 ring-amber-500/30">
                      <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></div>
                      <p className="text-xs font-bold text-amber-200">Aguardando resposta do cliente para sua contraproposta de {orcamento.proposta_admin_porcentagem}%.</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* General Info Grid */}
            <section className="bg-white rounded-[2.5rem] p-10 shadow-sm ring-1 ring-black/5 animate-in fade-in slide-in-from-bottom-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 flex items-center gap-2 mb-8 border-b border-neutral-100 pb-4">
                  <FileText className="h-4 w-4" /> Informações Gerais do Orçamento
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {/* Dados do Cliente */}
                  <div className="space-y-6">
                    <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest">Cliente</h4>
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-black text-neutral-400 uppercase">Nome</p>
                        <p className="text-sm font-bold text-neutral-800">{(orcamento as any).clientes?.nome || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-neutral-400 uppercase">Documento</p>
                        <p className="text-sm font-bold text-neutral-800">{(orcamento as any).clientes?.cpf || (orcamento as any).clientes?.cnpj || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-neutral-400 uppercase">Contato</p>
                        <p className="text-sm font-bold text-neutral-800">{(orcamento as any).clientes?.telefone || '—'} <br/> {(orcamento as any).clientes?.email || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Detalhes do Pedido */}
                  <div className="space-y-6">
                    <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest">Detalhes do Pedido</h4>
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-black text-neutral-400 uppercase">Categoria</p>
                        <p className="text-sm font-bold text-neutral-800 capitalize">{orcamento.categoria || 'Não definida'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-neutral-400 uppercase">Item Solicitado</p>
                        <p className="text-sm font-bold text-neutral-800">
                          {orcamento.categoria === 'servico' ? (orcamento as any).servicos?.nome : 
                           orcamento.categoria === 'produto' ? (orcamento as any).produtos?.nome : 
                           orcamento.categoria === 'assinatura' ? (orcamento as any).assinaturas?.nome : '—'}
                        </p>
                      </div>
                      {orcamento.observacoes_servico && (
                        <div>
                          <p className="text-[10px] font-black text-neutral-400 uppercase">Observações</p>
                          <p className="text-sm font-medium text-neutral-600 bg-neutral-50 p-3 rounded-xl mt-1 whitespace-pre-wrap">{orcamento.observacoes_servico}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {orcamento.anexos && Array.isArray(orcamento.anexos) && orcamento.anexos.length > 0 && (
                  <div className="mt-10 pt-8 border-t border-neutral-100">
                    <h4 className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-4">Anexos / Documentos</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {orcamento.anexos.map((doc: any, i: number) => (
                        <a 
                          key={i} 
                          href={doc.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-4 rounded-xl bg-neutral-50 ring-1 ring-neutral-200 hover:ring-indigo-300 hover:bg-white transition-all group shadow-sm"
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-indigo-500" />
                            <span className="text-xs font-bold text-neutral-700 truncate max-w-[150px]">{doc.tipo?.replace('_', ' ') || doc.nome || `Anexo ${i + 1}`}</span>
                          </div>
                          <span className="text-[10px] font-black text-indigo-600 uppercase group-hover:underline">Visualizar ↗</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            
            {/* Revision Form (if applicable) */}
            {orcamento.status === 'em revisão' && (
              <section className="bg-indigo-50/50 rounded-[2.5rem] p-10 ring-1 ring-indigo-100 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h3 className="mb-8 text-[10px] font-black uppercase tracking-widest text-indigo-600 flex items-center gap-2">
                  <Percent className="h-4 w-4" /> Modificar Valores e Condições
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest pl-2 block leading-none mb-2">Categoria Solicitada (Selecionada pelo Cliente)</label>
                    <div className="flex gap-4">
                      <div className="flex-1 rounded-2xl bg-indigo-50 py-3 px-4 font-bold text-indigo-700 ring-1 ring-indigo-200 capitalize text-center">
                        {editData.categoria === 'servico' ? 'Serviço' : 
                         editData.categoria === 'produto' ? 'Produto' : 
                         editData.categoria === 'assinatura' ? 'Assinatura' : 
                         `Categoria: ${editData.categoria || 'Não definida'}`}
                      </div>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest pl-2 block leading-none mb-2">Item Vinculado</label>
                    {editData.categoria === 'servico' && (
                      <select 
                        value={editData.servico_id}
                        onChange={e => {
                          const s = servicosFiltrados.find(sv => sv.id === e.target.value);
                          const novoValor = s?.valor || 0;
                          const { promoDesc, referralDesc } = calculateAutoDiscount(novoValor);
                          setEditData({
                            ...editData, 
                            servico_id: e.target.value, 
                            valor_servico: novoValor, 
                            desconto: referralDesc,
                            promocao_desconto_manual: promoDesc
                          });
                        }}
                        className="w-full rounded-2xl bg-white p-4 font-bold text-neutral-900 ring-1 ring-neutral-200 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm"
                      >
                        <option value="">Selecione...</option>
                        {servicosFiltrados.map(s => (
                          <option key={s.id} value={s.id}>{s.nome}{(s as any).categoria ? ` [${(s as any).categoria}]` : ''} ({formatCurrency(s.valor)})</option>
                        ))}
                      </select>
                    )}
                    {editData.categoria === 'produto' && (
                      <select 
                        value={editData.produto_id}
                        onChange={e => {
                          const pr = produtosFiltrados.find(p => p.id === e.target.value);
                          const novoValor = pr?.valor || 0;
                          const { promoDesc, referralDesc } = calculateAutoDiscount(novoValor);
                          setEditData({
                            ...editData, 
                            produto_id: e.target.value, 
                            valor_servico: novoValor, 
                            desconto: referralDesc,
                            promocao_desconto_manual: promoDesc
                          });
                        }}
                        className="w-full rounded-2xl bg-white p-4 font-bold text-neutral-900 ring-1 ring-neutral-200 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm"
                      >
                        <option value="">Selecione...</option>
                        {produtosFiltrados.map(p => (
                          <option key={p.id} value={p.id}>{p.nome}{(p as any).categoria ? ` [${(p as any).categoria}]` : ''} ({formatCurrency(p.valor)})</option>
                        ))}
                      </select>
                    )}
                    {editData.categoria === 'assinatura' && (
                      <select 
                        value={editData.assinatura_id}
                        onChange={e => {
                          const a = assinaturasFiltradas.find(as => as.id === e.target.value);
                          const novoValor = a?.valor || 0;
                          const { promoDesc, referralDesc } = calculateAutoDiscount(novoValor);
                          setEditData({
                            ...editData, 
                            assinatura_id: e.target.value, 
                            valor_servico: novoValor, 
                            desconto: referralDesc,
                            promocao_desconto_manual: promoDesc
                          });
                        }}
                        className="w-full rounded-2xl bg-white p-4 font-bold text-neutral-900 ring-1 ring-neutral-200 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm"
                      >
                        <option value="">Selecione...</option>
                        {assinaturasFiltradas.map(a => (
                          <option key={a.id} value={a.id}>{a.nome}{(a as any).categoria ? ` [${(a as any).categoria}]` : ''} ({formatCurrency(a.valor)})</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest pl-2 block leading-none">Valor Principal (Base)</label>
                    <input  
                      type="text"
                      value={maskCurrency(editData.valor_servico)}
                      inputMode="decimal"
onChange={(e) => handleCurrencyInputChange(e.target.value, (val) => setEditData({...editData, valor_servico: val}))}
                      className="w-full rounded-2xl bg-white p-5 font-black text-xl text-neutral-900 ring-1 ring-neutral-200 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest pl-2 block leading-none">Insumos/Adicionais</label>
                    <input  
                      type="text"
                      value={maskCurrency(editData.valor_adicional)}
                      inputMode="decimal"
onChange={(e) => handleCurrencyInputChange(e.target.value, (val) => setEditData({...editData, valor_adicional: val}))}
                      className="w-full rounded-2xl bg-white p-5 font-black text-xl text-neutral-900 ring-1 ring-neutral-200 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest pl-2 block leading-none">Taxas Extras (Acréscimo)</label>
                    <input  
                      type="text"
                      value={maskCurrency(editData.acrescimo)}
                      inputMode="decimal"
onChange={(e) => handleCurrencyInputChange(e.target.value, (val) => setEditData({...editData, acrescimo: val}))}
                      className="w-full rounded-2xl bg-emerald-50/50 p-5 font-black text-xl text-emerald-700 ring-1 ring-emerald-100 focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all shadow-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest pl-2 block leading-none">Bônus Especial (Desconto)</label>
                    <input  
                      type="text"
                      value={maskCurrency(editData.desconto)}
                      inputMode="decimal"
onChange={(e) => handleCurrencyInputChange(e.target.value, (val) => setEditData({...editData, desconto: val}))}
                      className="w-full rounded-2xl bg-red-50/50 p-5 font-black text-xl text-red-700 ring-1 ring-red-100 focus:ring-4 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all shadow-sm"
                    />
                  </div>

                  {promocaoVinc && (
                    <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100">
                      <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest leading-none mb-2">Promoção Ativa Detectada</p>
                      <p className="text-sm font-black text-indigo-900">{promocaoVinc.titulo} ({promocaoVinc.codigo_promocao})</p>
                      <p className="text-xs font-bold text-indigo-600 mt-1">
                        Desconto: {promocaoVinc.tipo_desconto === 'porcentagem' ? `${promocaoVinc.valor_desconto}%` : formatCurrency(promocaoVinc.valor_desconto)}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-neutral-500 uppercase tracking-widest pl-2 block leading-none">Relatório de Ajustes para o Cliente</label>
                  <textarea 
                    rows={4}
                    value={editData.observacoes_servico}
                    onChange={e => setEditData({...editData, observacoes_servico: e.target.value})}
                    placeholder="Especifique o que foi alterado e por que..."
                    className="w-full rounded-3xl bg-white p-6 text-base font-medium text-neutral-700 ring-1 ring-neutral-200 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all resize-none shadow-sm"
                  />
                </div>

                {orcamento.anexos && orcamento.anexos.length > 0 && (
                  <div className="mt-10 pt-10 border-t border-indigo-100">
                    <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-2 mb-4 block leading-none">Evidências / Documentos do Cliente</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {orcamento.anexos.map((anexo: any, i: number) => {
                         const nome = typeof anexo === 'string' ? `Documento Auxiliar ${i + 1}` : anexo.nome;
                         const url = typeof anexo === 'string' ? anexo : anexo.url;
                         
                         return (
                           <a 
                             key={i} 
                             href={url} 
                             target="_blank" 
                             rel="noopener noreferrer"
                             className="flex items-center justify-between rounded-2xl bg-white p-5 text-sm font-black text-neutral-700 ring-1 ring-neutral-200 hover:ring-indigo-300 hover:bg-neutral-50 transition-all shadow-sm group"
                           >
                              <div className="flex items-center gap-4">
                                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:scale-110 transition-transform">
                                  <FileText className="h-5 w-5" />
                                </div>
                                <span className="truncate max-w-[200px]">{nome}</span>
                              </div>
                              <ArrowRightLeft className="h-4 w-4 text-neutral-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                           </a>
                         );
                       })}
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Right Column: Financial Summary & Actions */}
          <div className="space-y-10">
            
            {/* Itens do Pedido (Grouped) */}
            {(orcamento as any).items && (orcamento as any).items.length > 1 && (
              <section className="bg-white rounded-[2.5rem] p-8 ring-1 ring-black/5 shadow-sm">
                <h3 className="mb-6 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 flex items-center gap-2">
                  <Package className="h-4 w-4" /> Itens do Pedido ({(orcamento as any).items.length})
                </h3>
                <div className="space-y-4">
                  {(orcamento as any).items.map((item: any) => {
                    const itemName = item.produtos?.nome || item.servicos?.nome || item.assinaturas?.nome || 'Item';
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-4 p-4 bg-neutral-50 rounded-2xl">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-neutral-900 truncate uppercase">{itemName}</p>
                          <p className="text-[10px] font-bold text-neutral-400 uppercase">Qtd: {item.quantidade || 1}</p>
                        </div>
                        <p className="text-xs font-black text-indigo-600">{formatCurrency(item.total)}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Financial Summary Card */}
            <section className="bg-neutral-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 left-0 -mt-10 -ml-10 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl"></div>
               
               <h3 className="mb-10 text-[10px] font-black uppercase tracking-[0.2em] text-white/40 flex items-center gap-2">
                 <Percent className="h-4 w-4" /> Composição Financeira
               </h3>
               
               <div className="space-y-6">
                  <div className="flex justify-between items-center px-2">
                    <span className="text-xs font-bold text-white/40 uppercase tracking-widest">
                      {(orcamento as any).items && (orcamento as any).items.length > 1 ? 'Soma dos Itens' : 'Base p/ Unid.'}
                    </span>
                    <span className="font-black text-white/90">
                      {formatCurrency(
                        orcamento.status === 'em revisão' 
                          ? (editData.valor_servico + editData.valor_adicional) 
                          : ((orcamento.categoria === 'produto' ? orcamento.valor_produto || 0 : orcamento.categoria === 'assinatura' ? orcamento.valor_assinatura || 0 : orcamento.valor_servico || 0) + orcamento.valor_adicional)
                      )}
                    </span>
                  </div>
                  
                  {(!((orcamento as any).items && (orcamento as any).items.length > 1)) && (
                    <div className="flex justify-between items-center px-2">
                      <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Quantidade</span>
                      <span className="font-black text-white/90">x {orcamento.quantidade || 1}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center px-2">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                      {(orcamento.categoria as any) === 'loja' ? 'Juros do Crédito GSA' : 'Ajuste (+)'}
                    </span>
                    <span className="font-black text-emerald-400">
                      + {formatCurrency(orcamento.status === 'em revisão' ? editData.acrescimo : orcamento.acrescimo)}
                    </span>
                  </div>
                  {(orcamento.categoria as any) === 'loja' && orcamento.descricao_adicional && (
                    <div className="px-2">
                      <p className="text-[10px] text-white/50 italic leading-tight bg-white/5 p-2 rounded-xl">
                        <span className="font-bold uppercase mr-1">Taxa:</span>
                        {orcamento.descricao_adicional}
                      </p>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center px-2">
                    <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Ajuste (-)</span>
                    <span className="font-black text-red-400">
                      - {formatCurrency(orcamento.status === 'em revisão' ? editData.desconto : orcamento.desconto)}
                    </span>
                  </div>
                  
                  <div className="mt-10 pt-10 border-t border-white/10">
                     <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2 text-center">
                       {(orcamento as any).items && (orcamento as any).items.length > 1 ? 'Total do Pedido' : 'Liquidação Final'}
                     </p>
                     <p className="text-4xl font-black text-center tracking-tighter">
                       {formatCurrency(
                         orcamento.status === 'em revisão'
                           ? (editData.valor_servico + editData.valor_adicional + editData.acrescimo - editData.desconto)
                           : orcamento.total
                       )}
                     </p>
                  </div>
               </div>
            </section>

            {/* Profitability Insight */}
            <div className="rounded-[2.5rem] overflow-hidden shadow-sm ring-1 ring-black/5">
              <PainelRentabilidade tipo="simulado" orcamentoId={orcamento.id} overrideData={editData} />
            </div>

            {/* Main Action Stack */}
            <div className="space-y-4">
               {/* Context Alerts */}
               {orcamento.status === 'em revisão' && (
                  <div className="rounded-3xl bg-amber-50 p-6 ring-1 ring-amber-100 flex gap-4">
                    <Clock className="h-5 w-5 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-xs font-black text-amber-900 uppercase">Renovação / Recompra</p>
                      <p className="text-[11px] text-amber-700 mt-1 leading-relaxed font-medium">Validar valores e condições antes da liberação oficial.</p>
                    </div>
                  </div>
               )}

               <div className="flex flex-col gap-3">
                  {(orcamento.status === 'aberto' || orcamento.status === 'em revisão') && (
                    <>
                      {orcamento.status === 'em revisão' ? (
                        <>
                          <button 
                            onClick={() => onSaveRevision?.(editData)}
                            disabled={isSubmitting || (editData.categoria === 'servico' && !editData.servico_id) || (editData.categoria === 'produto' && !editData.produto_id) || (editData.categoria === 'assinatura' && !editData.assinatura_id)}
                            className="w-full rounded-[1.5rem] bg-indigo-600 py-6 text-sm font-black uppercase tracking-widest text-white shadow-2xl shadow-indigo-500/20 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                          >
                            {isSubmitting ? 'Processando...' : 'Liberar Orçamento (Abrir)'}
                          </button>
                          <button 
                            onClick={onRequestDocuments}
                            disabled={isSubmitting}
                            className="w-full rounded-[1.5rem] border-2 border-amber-200 bg-amber-50 py-5 text-sm font-black uppercase tracking-widest text-amber-700 hover:bg-amber-100 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                          >
                            <Upload className="h-5 w-5" />
                            Pedir Documentação
                          </button>
                        </>
                      ) : (
                        <button 
                          onClick={onApprove}
                          disabled={isSubmitting}
                          className="w-full rounded-[1.5rem] bg-indigo-600 py-6 text-sm font-black uppercase tracking-widest text-white shadow-2xl shadow-indigo-500/20 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                        >
                          {isSubmitting ? 'Gerando OS...' : 'Aprovar e Ativar Serviço'}
                        </button>
                      )}
                      
                      {orcamento.status === 'aberto' && (
                        <button 
                          onClick={onRenegotiate}
                          disabled={isSubmitting}
                          className="w-full rounded-[1.5rem] border-2 border-indigo-100 bg-white py-5 text-xs font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-50 transition-all disabled:opacity-50"
                        >
                          Ofertar Novos Termos (Contraproposta)
                        </button>
                      )}
                    </>
                  )}

                  {orcamento.status === 'negociação' && orcamento.fase_negociacao === 'admin' && (
                    <div className="space-y-3">
                      <button 
                        onClick={onApproveNegotiation}
                        disabled={isSubmitting}
                        className="w-full rounded-[1.5rem] bg-emerald-600 py-6 text-sm font-black uppercase tracking-widest text-white shadow-2xl shadow-emerald-500/20 hover:bg-emerald-700 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                      >
                        {isSubmitting ? 'Aprovando...' : 'Aceitar Termos do Cliente'}
                      </button>
                      <button 
                        onClick={onRenegotiate}
                        disabled={isSubmitting}
                        className="w-full rounded-[1.5rem] border-2 border-indigo-100 bg-white py-5 text-xs font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-50 transition-all disabled:opacity-50"
                      >
                        Enviar Contraproposta
                      </button>
                    </div>
                  )}

                  {(orcamento.status === 'aberto' || orcamento.status === 'em revisão' || (orcamento.status === 'negociação' && orcamento.fase_negociacao === 'admin')) && (
                    <button 
                      onClick={onCancel}
                      disabled={isSubmitting}
                      className="w-full rounded-[1.5rem] py-5 text-xs font-black uppercase tracking-widest text-red-400 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-50"
                    >
                      {orcamento.status === 'negociação' ? 'Recusar Desconto e Cancelar' : 'Cancelar Orçamento'}
                    </button>
                  )}

                  {orcamento.status === 'negociação' && orcamento.fase_negociacao === 'cliente' && (
                    <button 
                      onClick={onCancel}
                      className="w-full rounded-[1.5rem] border-2 border-red-100 bg-white py-5 text-xs font-black uppercase tracking-widest text-red-500 hover:bg-red-50 transition-all"
                    >
                      Cancelar e Encerrar Negociação
                    </button>
                  )}
               </div>
            </div>
            
            {orcamento.status === 'aprovado' && orcamento.origem_gsa_store && orcamento.categoria === 'produto' && (
              <div className="rounded-[2.5rem] bg-indigo-50 p-8 ring-1 ring-indigo-100 shadow-sm mt-6">
                <h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Package className="h-5 w-5" /> Gestão de Entrega (Loja)
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white rounded-2xl ring-1 ring-indigo-50">
                    <div>
                      <p className="text-[10px] font-black uppercase text-neutral-400">Status Atual</p>
                      <p className="text-sm font-bold text-indigo-700 capitalize">
                        {(orcamento.status_entrega || 'pedido_realizado').replace('_', ' ')}
                      </p>
                    </div>
                    {orcamento.rastreio_codigo && (
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase text-neutral-400">Rastreio</p>
                        <p className="text-xs font-mono font-bold text-neutral-900">{orcamento.rastreio_codigo}</p>
                      </div>
                    )}
                  </div>
                  
                  {orcamento.status_entrega !== 'entregue' && (
                    <button 
                      onClick={() => {
                        setTrackingUpdateData({
                          status_entrega: orcamento.status_entrega || 'pedido_realizado',
                          rastreio_codigo: orcamento.rastreio_codigo || '',
                          rastreio_transportadora: orcamento.rastreio_transportadora || ''
                        });
                        setIsTrackingUpdateModalOpen(true);
                      }}
                      className="w-full rounded-2xl bg-indigo-600 py-4 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-700 transition-colors"
                    >
                      Atualizar Status de Entrega
                    </button>
                  )}
                </div>
              </div>
            )}
            
            {/* Export Menu */}
            <div className="pt-6 border-t border-neutral-100 flex justify-center">
              <PDFExportMenu 
                onDownload={() => {
                  const item = orcamento.categoria === 'produto' ? (orcamento as any).produtos : 
                               orcamento.categoria === 'assinatura' ? (orcamento as any).assinaturas : 
                               (orcamento as any).servicos;
                  generateOrcamentoPDF(orcamento, (orcamento as any).clientes, item);
                }}
                onWhatsApp={async () => {
                  const item = orcamento.categoria === 'produto' ? (orcamento as any).produtos : 
                               orcamento.categoria === 'assinatura' ? (orcamento as any).assinaturas : 
                               (orcamento as any).servicos;
                  const doc = await generateOrcamentoPDF(orcamento, (orcamento as any).clientes, item, { returnDoc: true });
                  if (doc) {
                    const result = await pdfSharingService.uploadAndGetLink(doc as any, `orcamento_${orcamento.codigo_orcamento}.pdf`);
                    if (result) {
                      await pdfSharingService.shareViaWhatsApp((orcamento as any).clientes.telefone || '', result.url, 'Orçamento', orcamento.codigo_orcamento);
                      setTimeout(() => pdfSharingService.deleteTempFile(result.path), 86400000);
                    }
                  }
                }}
                onEmail={async () => {
                  const item = orcamento.categoria === 'produto' ? (orcamento as any).produtos : 
                               orcamento.categoria === 'assinatura' ? (orcamento as any).assinaturas : 
                               (orcamento as any).servicos;
                  const doc = await generateOrcamentoPDF(orcamento, (orcamento as any).clientes, item, { returnDoc: true });
                  if (doc) {
                    const result = await pdfSharingService.uploadAndGetLink(doc as any, `orcamento_${orcamento.codigo_orcamento}.pdf`);
                    if (result) {
                      await pdfSharingService.shareViaEmail((orcamento as any).clientes.email || '', 'Orçamento', orcamento.codigo_orcamento, result.url);
                      setTimeout(() => pdfSharingService.deleteTempFile(result.path), 86400000);
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <Modal isOpen={isTrackingUpdateModalOpen} onClose={() => setIsTrackingUpdateModalOpen(false)} title="Atualizar Rastreamento" size="md">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-neutral-700 mb-2">Novo Status de Entrega</label>
            <select
              value={trackingUpdateData.status_entrega}
              onChange={e => setTrackingUpdateData({...trackingUpdateData, status_entrega: e.target.value})}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
            >
              <option value="pedido_realizado">Pedido Realizado</option>
              <option value="pagamento_aprovado">Pagamento Aprovado</option>
              <option value="separacao">Em Separação</option>
              <option value="em_transito">Em Transporte</option>
              <option value="entregue">Entregue</option>
            </select>
          </div>

          {trackingUpdateData.status_entrega === 'em_transito' && (
            <div className="space-y-4 p-4 bg-indigo-50 rounded-2xl">
              <div>
                <label className="block text-[10px] font-black uppercase text-indigo-700 mb-1">Código de Rastreio</label>
                <input
                  type="text"
                  value={trackingUpdateData.rastreio_codigo}
                  onChange={e => setTrackingUpdateData({...trackingUpdateData, rastreio_codigo: e.target.value})}
                  className="w-full rounded-xl border border-indigo-200 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  placeholder="Ex: BR123456789"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-indigo-700 mb-1">Transportadora</label>
                <input
                  type="text"
                  value={trackingUpdateData.rastreio_transportadora}
                  onChange={e => setTrackingUpdateData({...trackingUpdateData, rastreio_transportadora: e.target.value})}
                  className="w-full rounded-xl border border-indigo-200 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  placeholder="Ex: Correios, Loggi"
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-neutral-100">
            <button 
              onClick={() => setIsTrackingUpdateModalOpen(false)}
              className="flex-1 rounded-xl bg-neutral-100 py-3 text-sm font-bold text-neutral-600 hover:bg-neutral-200"
            >
              Cancelar
            </button>
            <button 
              onClick={() => {
                if (onUpdateDeliveryStatus) {
                  onUpdateDeliveryStatus(
                    trackingUpdateData.status_entrega,
                    trackingUpdateData.rastreio_codigo,
                    trackingUpdateData.rastreio_transportadora
                  );
                }
                setIsTrackingUpdateModalOpen(false);
              }}
              disabled={isSubmitting}
              className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Atualizando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
}

function PDFExportMenu({ onDownload, onWhatsApp, onEmail }: any) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative w-full">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-[1.5rem] bg-neutral-100 py-5 font-black text-xs uppercase tracking-[0.2em] text-neutral-600 hover:bg-neutral-200 flex items-center justify-center gap-3 transition-all active:scale-95"
      >
        <Printer className="h-5 w-5" />
        Exportar Orçamento
      </button>
      
      {isOpen && (
        <div className="absolute bottom-full left-0 w-full mb-3 bg-white rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] ring-1 ring-black/5 p-3 z-50 flex flex-col gap-2 animate-in slide-in-from-bottom-2 fade-in duration-300">
          <button onClick={() => { setIsOpen(false); onDownload(); }} className="w-full text-left px-5 py-4 hover:bg-neutral-50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-neutral-700 flex items-center justify-between transition-colors">
            Fazer Download (PDF)
            <Printer className="h-4 w-4 text-neutral-300"/>
          </button>
          <button onClick={() => { setIsOpen(false); onWhatsApp(); }} className="w-full text-left px-5 py-4 hover:bg-emerald-50 text-emerald-700 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-between transition-colors">
            Enviar por WhatsApp
            <Send className="h-4 w-4 text-emerald-400"/>
          </button>
          <button onClick={() => { setIsOpen(false); onEmail(); }} className="w-full text-left px-5 py-4 hover:bg-indigo-50 text-indigo-700 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-between transition-colors">
            Enviar por E-mail
            <MessageSquare className="h-4 w-4 text-indigo-400"/>
          </button>
        </div>
      )}
    </div>
  );
}
