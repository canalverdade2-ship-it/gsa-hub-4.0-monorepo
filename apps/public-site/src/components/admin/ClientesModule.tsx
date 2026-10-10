// HMR cache refresh
import { useState, useEffect, useRef } from 'react';
import { Cliente } from '../../types';
import { Plus, Search, Filter, MoreHorizontal, User as UserIcon, Wallet, FileText, ClipboardList, History, Info, CheckCircle2, Users, Gift, Trash2, Settings, Shield, X, Send, Lock, Unlock, Mail, Eye, Save, AlertCircle, Pencil, ShoppingBag, ChevronRight, Calendar, Printer, MessageSquare, Clock, Landmark, CreditCard } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { safeSupabaseQuery } from '../../lib/supabaseWrapper';
import { canDeleteRecord } from '../../lib/deleteRequest';
import { formatCurrency, formatDate, maskCPF, maskCNPJ, maskPhone, generateCode, formatDateTime, formatLancamentoDescricao, handleError, isLocalDevHost } from '../../lib/utils';
import { validarCPF, validarCNPJ, validarEmail } from '../../utils/cpfValidator';
import { toast } from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { GlobalFilter } from '../ui/GlobalFilter';
import { OSDetails } from './OrdensServicoModule';
import { CompraDetails } from './OrdensCompraModule';
import { AssinaturaDetails } from './OrdensAssinaturaModule';
import { FaturaDetails } from './FaturaDetails';
import { osService } from '../../lib/osService';
import { AdminClienteDocumentos } from './clientes/AdminClienteDocumentos';

import { processGamificationPointsManual } from '../../utils/gamification';
import { notificationService } from '../../lib/notificationService';
import { createWelcomeSequence } from '../../lib/notifications';
import { createNotification } from '../../lib/notifications';
import { useAdminNotifications } from '../../hooks/useAdminNotifications';
import { logService } from '../../lib/logService';
import { fetchReferralSettings, includesPontosIndicado } from '../../utils/referralHelpers';
import { consultarCEP } from '../../utils/viaCep';
import { AdminWhatsAppButton } from './ui/AdminWhatsAppButton';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { sessionService } from '../../lib/sessionService';
import { callAdminRpc } from '../../lib/adminRpc';
import { removePrivateDocument } from '../../lib/privateStorage';
import { adminModulePath } from '../../routing/adminAccess';
import { navigate } from '../../routing/navigationService';

export interface ClientPendency {
  id: string;
  tipo: 'fatura' | 'orcamento' | 'saque' | 'ticket' | 'classificado' | 'credito';
  titulo: string;
  descricao: string;
  valorDisplay?: string;
  statusDisplay: string;
  module: string;
  tab?: string;
  itemId: string;
  tableName: string;
}

const getAdminSessionForRpc = () => {
  const session = sessionService.getCurrentSession();
  if (!session?.sessaoId || !session?.sessionToken) {
    throw new Error('Sessao administrativa expirada. Faca login novamente.');
  }
  return session;
};

export function ClientesModule({ activeSubTab = 'ativos', initialItemId, colaboradorId, colaboradorNome }: { activeSubTab?: 'ativos' | 'inativos' | 'pendentes' | 'bloqueados', initialItemId?: string, colaboradorId?: string, colaboradorNome?: string }) {
  const { refreshCounts } = useAdminNotifications();
  const activeTab = activeSubTab; // Usar prop diretamente para evitar dessincronização

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({
    mes: '',
    ano: ''
  });

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);

  const activeTabRef = useRef(activeTab);
  const searchRef = useRef(search);
  const filtersRef = useRef(filters);
  const selectedClienteRef = useRef(selectedCliente);

  useEffect(() => { 
    activeTabRef.current = activeTab; 
    setPage(0);
  }, [activeTab]);
  useEffect(() => { searchRef.current = search; }, [search]);
  useEffect(() => { filtersRef.current = filters; }, [filters]);
  useEffect(() => { selectedClienteRef.current = selectedCliente; }, [selectedCliente]);

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  
  useEffect(() => {
    fetchClientes();
  }, [activeTab, search, filters, page]);

  // Navegação inteligente e destaque
  const hasAutoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (initialItemId && clientes.length > 0 && hasAutoOpened.current !== initialItemId) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`cliente-${initialItemId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedId(initialItemId);
          
          // Abrir modal automaticamente
          const cliente = clientes.find(c => c.id === initialItemId);
          if (cliente) {
            setSelectedCliente(cliente);
            setIsDetailOpen(true);
            hasAutoOpened.current = initialItemId;
          }

          setTimeout(() => setHighlightedId(null), 3000);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialItemId, clientes]);

  // Stable Realtime Subscription
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const debouncedFetch = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fetchClientes();
      }, 300);
    };

    const channel = supabase
      .channel('admin-clientes-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'clientes'
      }, (payload) => {
        debouncedFetch();
        if (payload.new && selectedClienteRef.current && (payload.new as any).id === selectedClienteRef.current.id) {
          setSelectedCliente(prev => prev ? { ...prev, ...payload.new } as Cliente : null);
        }
      })
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, []); // Empty dependency array for stability

  const fetchClientes = async () => {
    let query = supabase
      .from('clientes')
      .select('id, nome, cpf, cnpj, email, telefone, status, tipo_pessoa, codigo_cliente, data_cadastro, cadastro_aprovado, carteira_bloqueada');
      
    if (activeTab === 'ativos') {
      query = query.eq('status', 'ativo');
    } else if (activeTab === 'inativos') {
      query = query.eq('status', 'inativo').eq('cadastro_aprovado', true);
    } else if (activeTab === 'pendentes') {
      // Para pendentes, mostramos inativos que não foram aprovados (false ou null)
      query = query.eq('status', 'inativo').or('cadastro_aprovado.is.null,cadastro_aprovado.eq.false');
    } else if (activeTab === 'bloqueados') {
      query = query.eq('carteira_bloqueada', true);
    }

    if (search) {
      query = query.or(`nome.ilike.%${search}%,cpf.ilike.%${search}%,cnpj.ilike.%${search}%,codigo_cliente.ilike.%${search}%`);
    }

    if (filters.mes) {
      const year = filters.ano || new Date().getFullYear();
      const startDate = `${year}-${filters.mes}-01`;
      const endDate = new Date(Number(year), Number(filters.mes), 0).toISOString().split('T')[0];
      query = query.gte('data_cadastro', startDate).lte('data_cadastro', endDate);
    }
    
    const { data, error } = await query
      .order('data_cadastro', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    
    if (error) {
      console.warn('Error fetching clientes:', error.message);
      toast.error(`Erro ao buscar clientes: ${error.message}`);
      setClientes([]);
    } else if (data) {
      setClientes(data);
    }
  };





  const handleCreate = async (formData: any) => {
    if (formData.telefone) {
      const cleanPhone = formData.telefone.replace(/\D/g, '');
      if (cleanPhone.length !== 11) {
        return toast.error('O telefone deve conter exatamente 11 numeros (DDD + 9 digitos).');
      }
    }

    const cleanDoc = formData.tipo_pessoa === 'pf' ? formData.cpf.replace(/\D/g, '') : formData.cnpj.replace(/\D/g, '');

    if (formData.tipo_pessoa === 'pf' && cleanDoc.length !== 11) {
      return toast.error('O CPF deve conter exatamente 11 numeros.');
    }
    if (formData.tipo_pessoa === 'pj' && cleanDoc.length !== 14) {
      return toast.error('O CNPJ deve conter exatamente 14 numeros.');
    }

    const now = new Date();
    const selectedDate = new Date(formData.data_cadastro);
    const finalDataCadastro = (selectedDate.toDateString() === now.toDateString())
      ? now.toISOString()
      : formData.data_cadastro;

    const payload: any = {
      ...formData,
      data_cadastro: finalDataCadastro,
      telefone: formData.telefone?.replace(/\D/g, '') || '',
      cpf: formData.tipo_pessoa === 'pf' ? cleanDoc : '',
      cnpj: formData.tipo_pessoa === 'pj' ? cleanDoc : ''
    };

    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_criar_cliente', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_payload: payload
      });

      if (error) throw error;

      const clienteId = data?.cliente_id;
      const indicacaoId = data?.indicacao_id;

      toast.success('Cliente cadastrado com sucesso.');

      await logService.logAction({
        ator_tipo: 'colaborador',
        ator_id: colaboradorId,
        ator_nome: colaboradorNome,
        acao: 'CRIAR_CLIENTE',
        detalhes: `Cadastrou o cliente: ${formData.nome} (${formData.tipo_pessoa === 'pf' ? 'CPF' : 'CNPJ'}: ${cleanDoc})`
      });

      if (clienteId) {
        await notificationService.notifyClient(
          clienteId,
          'Bem-vindo(a)!',
          'Seu cadastro foi criado com sucesso. Bem-vindo(a) ao portal!',
          'dashboard',
          'cadastro_criado',
          { tab: 'perfil' }
        );
      }

      if (indicacaoId && clienteId) {
        try {
          const refSettings = await fetchReferralSettings();
          if (includesPontosIndicado(refSettings.indicado_tipo) && refSettings.indicado_valor_pontos > 0) {
            await processGamificationPointsManual(
              clienteId,
              refSettings.indicado_valor_pontos,
              'Bonus de indicacao - bem-vindo(a)!',
              'indicacao',
              undefined,
              true
            );
            await createNotification(
              clienteId,
              'Pontos de Boas-vindas!',
              `Voce recebeu ${refSettings.indicado_valor_pontos} pontos como recompensa por ser indicado. Aproveite!`,
              'pontos'
            );
          }
        } catch (err) {
          console.error('[Referral] Erro ao creditar pontos ao indicado:', err);
        }

        toast.success('Indicacao vinculada a este novo cadastro!');
      }

      setIsModalOpen(false);
      fetchClientes();
    } catch (error: any) {
      console.error('Erro ao cadastrar cliente:', error);
      toast.error(error.message || 'Erro ao cadastrar cliente.');
    }
  };

  const handleToggleStatus = async (cliente: Cliente) => {
    const newStatus = cliente.status === 'ativo' ? 'inativo' : 'ativo';

    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_alterar_status_cliente', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cliente_id: cliente.id,
        p_status: newStatus
      });

      if (error) throw error;

      toast.success(`Cliente ${newStatus === 'ativo' ? 'ativado' : 'inativado'} com sucesso.`);

      await logService.logAction({
        ator_tipo: 'colaborador',
        ator_id: colaboradorId,
        ator_nome: colaboradorNome,
        acao: 'ALTERAR_STATUS_CLIENTE',
        detalhes: `Alterou status do cliente ${cliente.nome} para ${newStatus}`
      });
      refreshCounts?.();

      await notificationService.notifyClient(
        cliente.id,
        'Status Alterado',
        `Seu status foi alterado para ${newStatus === 'ativo' ? 'Ativo' : 'Inativo'}.`,
        'dashboard',
        'status_alterado',
        { tab: 'perfil' }
      );

      fetchClientes();
    } catch (error: any) {
      console.error('[UPDATE] Erro ao atualizar cliente:', error);
      toast.error(error.message || 'Erro ao alterar status.');
    }
  };

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [clienteToDelete, setClienteToDelete] = useState<Cliente | null>(null);
  const [isPendenciesModalOpen, setIsPendenciesModalOpen] = useState(false);
  const [pendencies, setPendencies] = useState<ClientPendency[]>([]);
  const [isCheckingPendencies, setIsCheckingPendencies] = useState(false);
  const [deletingPendencyId, setDeletingPendencyId] = useState<string | null>(null);

  const checkClientPendencies = async (clienteId: string): Promise<ClientPendency[]> => {
    const result: ClientPendency[] = [];

    try {
      // 1. Faturas Pendentes
      const { data: faturas } = await supabase
        .from('faturas')
        .select('id, codigo_fatura, valor, status')
        .eq('cliente_id', clienteId)
        .in('status', ['pendente', 'vencida', 'pendente_pagamento', 'revisada', 'aguardando_link']);

      if (faturas && faturas.length > 0) {
        for (const f of faturas) {
          result.push({
            id: `fatura-${f.id}`,
            tipo: 'fatura',
            titulo: `Fatura ${f.codigo_fatura || '#' + f.id.slice(0, 8)}`,
            descricao: `Fatura pendente de pagamento ou vencida.`,
            valorDisplay: formatCurrency(f.valor || 0),
            statusDisplay: f.status,
            module: 'financeiro',
            tab: 'faturas',
            itemId: f.id,
            tableName: 'faturas'
          });
        }
      }

      // 2. Orçamentos em Aberto
      const { data: orcamentos } = await supabase
        .from('orcamentos')
        .select('id, codigo_orcamento, valor_total, status')
        .eq('cliente_id', clienteId)
        .in('status', ['em análise', 'negociação', 'pendência documentos', 'em revisão']);

      if (orcamentos && orcamentos.length > 0) {
        for (const o of orcamentos) {
          result.push({
            id: `orcamento-${o.id}`,
            tipo: 'orcamento',
            titulo: `Orçamento #${o.codigo_orcamento || o.id.slice(0, 8)}`,
            descricao: `Proposta/Orçamento em aberto ou negociação.`,
            valorDisplay: formatCurrency(o.valor_total || 0),
            statusDisplay: o.status,
            module: 'operacoes',
            tab: 'orcamentos',
            itemId: o.id,
            tableName: 'orcamentos'
          });
        }
      }

      // 3. Solicitações de Saque
      const { data: saques } = await supabase
        .from('saques')
        .select('id, valor, status')
        .eq('cliente_id', clienteId)
        .in('status', ['solicitado', 'aprovado']);

      if (saques && saques.length > 0) {
        for (const s of saques) {
          result.push({
            id: `saque-${s.id}`,
            tipo: 'saque',
            titulo: `Solicitação de Saque`,
            descricao: `Pedido de retirada de saldo em análise.`,
            valorDisplay: formatCurrency(s.valor || 0),
            statusDisplay: s.status,
            module: 'financeiro',
            tab: 'saques',
            itemId: s.id,
            tableName: 'saques'
          });
        }
      }

      // 4. Tickets de Suporte Abertos
      const { data: tickets } = await supabase
        .from('tickets')
        .select('id, assunto, status')
        .eq('cliente_id', clienteId)
        .in('status', ['aberto', 'em andamento', 'pendente_cliente']);

      if (tickets && tickets.length > 0) {
        for (const t of tickets) {
          result.push({
            id: `ticket-${t.id}`,
            tipo: 'ticket',
            titulo: `Ticket: ${t.assunto || 'Sem assunto'}`,
            descricao: `Chamado de suporte técnico/atendimento aberto.`,
            statusDisplay: t.status,
            module: 'atendimento',
            tab: 'abertos',
            itemId: t.id,
            tableName: 'tickets'
          });
        }
      }

      // 6. Anúncios nos Classificados
      const { data: classificados } = await supabase
        .from('classificados_anuncios')
        .select('id, titulo, status')
        .eq('cliente_id', clienteId)
        .in('status', ['ativo', 'pendente_aprovacao']);

      if (classificados && classificados.length > 0) {
        for (const c of classificados) {
          result.push({
            id: `classificado-${c.id}`,
            tipo: 'classificado',
            titulo: `Anúncio: ${c.titulo}`,
            descricao: `Anúncio publicado nos classificados.`,
            statusDisplay: c.status,
            module: 'classificados',
            tab: 'anuncios',
            itemId: c.id,
            tableName: 'classificados_anuncios'
          });
        }
      }

      // 7. Crédito Loja
      const { data: creditos } = await supabase
        .from('loja_credito_solicitacoes')
        .select('id, valor_solicitado, status')
        .eq('cliente_id', clienteId)
        .in('status', ['solicitado', 'em_analise']);

      if (creditos && creditos.length > 0) {
        for (const cr of creditos) {
          result.push({
            id: `credito-${cr.id}`,
            tipo: 'credito',
            titulo: `Solicitação de Crédito Loja`,
            descricao: `Pedido de aumento de limite em análise.`,
            valorDisplay: formatCurrency(cr.valor_solicitado || 0),
            statusDisplay: cr.status,
            module: 'financeiro',
            tab: 'credito',
            itemId: cr.id,
            tableName: 'loja_credito_solicitacoes'
          });
        }
      }

    } catch (err) {
      console.error('Erro ao verificar pendências do cliente:', err);
    }

    return result;
  };

  const confirmDelete = async (cliente: Cliente) => {
    setClienteToDelete(cliente);
    setIsCheckingPendencies(true);
    const toastId = toast.loading('Verificando pendências do cliente...');

    try {
      const pList = await checkClientPendencies(cliente.id);
      toast.dismiss(toastId);
      setPendencies(pList);
      if (pList.length > 0) {
        setIsPendenciesModalOpen(true);
      } else {
        setIsDeleteConfirmOpen(true);
      }
    } catch (err) {
      toast.dismiss(toastId);
      console.error('Erro ao verificar pendências:', err);
      setIsDeleteConfirmOpen(true);
    } finally {
      setIsCheckingPendencies(false);
    }
  };

  const handleDeletePendency = async (pItem: ClientPendency) => {
    setDeletingPendencyId(pItem.id);
    try {
      if (pItem.tableName === 'tickets') {
        await supabase.from('ticket_mensagens').delete().eq('ticket_id', pItem.itemId);
      } else if (pItem.tableName === 'orcamentos') {
        await supabase.from('orcamento_timeline').delete().eq('orcamento_id', pItem.itemId);
      }

      const { error } = await supabase.from(pItem.tableName).delete().eq('id', pItem.itemId);
      if (error) throw error;

      toast.success(`Pendência "${pItem.titulo}" excluída com sucesso.`);
      setPendencies(prev => prev.filter(p => p.id !== pItem.id));
    } catch (err: any) {
      console.error('Erro ao excluir pendência:', err);
      toast.error(`Erro ao excluir pendência: ${err.message || 'Verifique registros vinculados.'}`);
    } finally {
      setDeletingPendencyId(null);
    }
  };

  const handleResolvePendency = (pItem: ClientPendency) => {
    setIsPendenciesModalOpen(false);
    setIsDeleteConfirmOpen(false);
    const targetUrl = adminModulePath(pItem.module, pItem.tab, pItem.itemId);
    navigate(targetUrl);
  };

  const handleDelete = async () => {
    if (!clienteToDelete) return;

    const canProceed = await canDeleteRecord('clientes', clienteToDelete.id);
    if (!canProceed) {
      setIsDeleteConfirmOpen(false);
      setIsPendenciesModalOpen(false);
      setClienteToDelete(null);
      return;
    }
    
    const toastId = toast.loading('Excluindo registros vinculados...');

    try {
      const cliente = clienteToDelete;

      // 1. Obter URLs de arquivos para exclusão do Storage
      const { data: osList } = await supabase.from('ordens_servico').select('id, link_documento, anexos_os').eq('cliente_id', cliente.id);
      const { data: orcamentos } = await supabase.from('orcamentos').select('id, anexos, comprovante_concorrente_urls, comprovante_concorrente').eq('cliente_id', cliente.id);
      const { data: clientDocs } = await supabase.from('cliente_documentos').select('urls').eq('cliente_id', cliente.id);
      const { data: fiscalDocs } = await supabase.from('ordens_fiscais').select('arquivo_nf_url, arquivo_nf_xml_url').eq('cliente_id', cliente.id);
      
      const osIds = osList?.map(o => o.id) || [];
      const demands = osIds.length > 0 ? await supabase.from('prestador_demandas').select('link_entrega').in('os_id', osIds).then(res => res.data) : [];

      // 2. Excluir banco de dados atomicamente via RPC ou fallback seguro
      const { error: rpcError } = await supabase.rpc('delete_client_cascade', { p_cliente_id: cliente.id });
      if (rpcError) {
        console.warn('Fallback manual para exclusão do cliente:', rpcError);
        await supabase.from('notificacoes').delete().eq('cliente_id', cliente.id);
        const { data: clientTickets } = await supabase.from('tickets').select('id').eq('cliente_id', cliente.id);
        if (clientTickets && clientTickets.length > 0) {
          await supabase.from('ticket_mensagens').delete().in('ticket_id', clientTickets.map(t => t.id));
        }
        await supabase.from('tickets').delete().eq('cliente_id', cliente.id);
        await supabase.from('faturas').delete().eq('cliente_id', cliente.id);
        await supabase.from('orcamentos').delete().eq('cliente_id', cliente.id);
        await supabase.from('ordens_servico').delete().eq('cliente_id', cliente.id);
        await supabase.from('saques').delete().eq('cliente_id', cliente.id);
        await supabase.from('classificados_anuncios').delete().eq('cliente_id', cliente.id);
        await supabase.from('loja_credito_solicitacoes').delete().eq('cliente_id', cliente.id);
        await supabase.from('cliente_documentos').delete().eq('cliente_id', cliente.id);
        await supabase.from('clientes').delete().eq('id', cliente.id);
      }

      // 3. Excluir arquivos do Storage em background
      const deleteFiles = async (urlsOrAnexos: any, bucket: string) => {
        if (!urlsOrAnexos) return;
        let urls: string[] = [];
        if (typeof urlsOrAnexos === 'string') urls = [urlsOrAnexos];
        else if (Array.isArray(urlsOrAnexos)) {
          urls = urlsOrAnexos.map((item: any) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object' && item.url) return item.url;
            return null;
          }).filter(Boolean) as string[];
        }
        for (const url of urls) {
          try {
            if (typeof url !== 'string' || !url.trim()) continue;
            if (url.startsWith('gsa-private://')) {
              await removePrivateDocument(url);
              continue;
            }
            if (!url.startsWith('http')) {
              await supabase.storage.from(bucket).remove([url]);
              continue;
            }
            const urlObj = new URL(url);
            const pathSegments = urlObj.pathname.split('/');
            const bucketIndex = pathSegments.indexOf(bucket);
            if (bucketIndex !== -1) {
              const storagePath = decodeURIComponent(pathSegments.slice(bucketIndex + 1).join('/'));
              if (storagePath) await supabase.storage.from(bucket).remove([storagePath]);
            }
          } catch (err) { console.error("Erro capturado:", err); }
        }
      };

      if (osList) {
        for (const os of osList) {
          await deleteFiles(os.link_documento, 'orcamentos');
          await deleteFiles(os.anexos_os, 'orcamentos');
        }
      }
      if (demands) {
        for (const demand of demands) {
          await deleteFiles(demand.link_entrega, 'entregas_demandas');
        }
      }
      if (orcamentos) {
        for (const orc of orcamentos) {
          await deleteFiles(orc.anexos, 'orcamentos');
          await deleteFiles(orc.comprovante_concorrente_urls, 'orcamentos');
          await deleteFiles(orc.comprovante_concorrente, 'orcamentos');
        }
      }
      if (clientDocs) {
        for (const doc of clientDocs) {
          await deleteFiles(doc.urls, 'documentos_cliente');
        }
      }
      if (fiscalDocs) {
        for (const f of fiscalDocs) {
          await deleteFiles(f.arquivo_nf_url, 'fiscal_docs');
          await deleteFiles(f.arquivo_nf_xml_url, 'fiscal_docs');
        }
      }

      // Log de ação do colaborador
      await logService.logAction({
        ator_tipo: 'colaborador',
        ator_id: colaboradorId,
        ator_nome: colaboradorNome,
        acao: 'EXCLUIR_CLIENTE',
        detalhes: `Excluiu permanentemente o cliente: ${cliente.nome} (#${cliente.id.slice(0, 8)})`
      });

      toast.dismiss(toastId);
      toast.success('Cliente excluído permanentemente.');
      refreshCounts?.();
      setIsDeleteConfirmOpen(false);
      setIsPendenciesModalOpen(false);
      setIsDetailOpen(false);
      setClienteToDelete(null);
      fetchClientes();

    } catch (error: any) {
      console.error('Erro ao excluir cliente:', error);
      toast.dismiss(toastId);
      toast.error(`Erro ao excluir: ${error.message || 'Verifique registros vinculados.'}`);
    }
  };

  return (
    <div className="admin-clients-page space-y-5 animate-in fade-in slide-in-from-bottom-4">
      <div className="admin-list-toolbar flex flex-col items-stretch justify-end gap-3 sm:flex-row sm:items-center">
        <GlobalFilter 
          searchValue={search}
          showSearch={false}
          onSearch={(val) => { setSearch(val); setPage(0); }}
          currentFilters={filters}
          onFilterChange={(val) => { setFilters(val); setPage(0); }}
          onClear={() => {
            setSearch('');
            setFilters({ mes: '', ano: new Date().getFullYear().toString() });
            setPage(0);
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
          type="button"
          onClick={() => { setSelectedCliente(null); setIsModalOpen(true); }}
          className="admin-primary-action inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-neutral-950 px-7 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" /> Novo cliente
        </button>
      </div>

      <div className="admin-client-card-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Lista de clientes">
        {clientes.length > 0 ? clientes.map((cliente) => (
          <article
            key={cliente.id}
            id={`cliente-${cliente.id}`}
            className={`admin-client-card relative rounded-[28px] border bg-white p-6 shadow-sm transition-all ${highlightedId === cliente.id ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-200 hover:shadow-md'}`}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${cliente.status === 'ativo' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                <UserIcon className="h-6 w-6" />
              </div>
              <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 font-mono text-[10px] font-bold text-blue-700">
                {cliente.codigo_cliente || '—'}
              </span>
            </div>
            <div className="space-y-1">
              <h2 className="truncate text-base font-extrabold uppercase tracking-tight text-slate-950" title={cliente.nome}>{cliente.nome}</h2>
              <p className="font-mono text-[11px] font-semibold text-slate-500">
                {cliente.tipo_pessoa === 'pf' ? maskCPF(cliente.cpf) : maskCNPJ(cliente.cnpj || '')}
              </p>
            </div>
            <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <div className="min-w-0">
                <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">Contato/Cadastro</p>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-xs font-semibold text-slate-700">{maskPhone(cliente.telefone) || '—'}</span>
                  <span className="text-[10px] text-slate-400">{formatDate(cliente.data_cadastro)}</span>
                </div>
              </div>
              <button
                type="button"
                aria-label={`Abrir ações de ${cliente.nome}`}
                onClick={() => { setSelectedCliente(cliente); setIsDetailOpen(true); }}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>
          </article>
        )) : (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">Nenhum cliente {activeTab} encontrado</p>
            <p className="mt-1 text-xs text-slate-500">Ajuste os filtros para consultar outros cadastros.</p>
          </div>
        )}
      </div>

      <div className="admin-pagination">
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
          className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-neutral-600 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 disabled:opacity-50 transition-all"
        >
          Anterior
        </button>
        <span className="text-sm font-bold text-neutral-600">
          Página {page + 1}
        </span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={clientes.length < PAGE_SIZE}
          className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-neutral-600 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 disabled:opacity-50 transition-all"
        >
          Próxima
        </button>
      </div>

      {/* Create Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Cadastrar Cliente" size="wide">
        <ClienteForm onSubmit={async (data: any) => { await handleCreate(data); }} onCancel={() => setIsModalOpen(false)} />
      </Modal>

      {/* Detail Modal */}
      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Detalhes do Cliente" size="full">
        <div className="max-w-6xl mx-auto py-8">
          {selectedCliente && (
            <ClienteDetails 
              cliente={selectedCliente} 
              colaboradorId={colaboradorId}
              colaboradorNome={colaboradorNome}
              onToggleStatus={() => handleToggleStatus(selectedCliente)} 
              onDelete={() => confirmDelete(selectedCliente)}
              onRefresh={fetchClientes}
            />
          )}
        </div>
      </Modal>

      {/* Modal de Pendências do Cliente */}
      <Modal
        isOpen={isPendenciesModalOpen}
        onClose={() => {
          setIsPendenciesModalOpen(false);
          setClienteToDelete(null);
        }}
        title="PENDÊNCIAS BLOQUEANDO EXCLUSÃO"
        size="wide"
      >
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200/60 flex items-start gap-3.5 text-left">
            <AlertCircle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight">
                Pendências Encontradas no Cadastro
              </h4>
              <p className="text-xs text-amber-800 font-medium leading-relaxed mt-1">
                O cliente <strong className="font-black text-amber-950">{clienteToDelete?.nome}</strong> possui{' '}
                <span className="font-mono font-black text-amber-900 bg-amber-200/60 px-1.5 py-0.5 rounded-md">
                  {pendencies.length}
                </span>{' '}
                registro(s) em aberto no sistema. Resolva ou exclua cada pendência abaixo para liberar a exclusão imediata do cadastro.
              </p>
            </div>
          </div>

          {/* Lista de Pendências */}
          {pendencies.length > 0 ? (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {pendencies.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-neutral-200 shadow-2xs hover:border-indigo-200 transition-all text-left"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 shrink-0 mt-0.5">
                      {item.tipo === 'fatura' && <FileText className="h-5 w-5" />}
                      {item.tipo === 'orcamento' && <ClipboardList className="h-5 w-5" />}
                      {item.tipo === 'saque' && <Wallet className="h-5 w-5" />}
                      
                      {item.tipo === 'ticket' && <MessageSquare className="h-5 w-5" />}
                      {item.tipo === 'classificado' && <ShoppingBag className="h-5 w-5" />}
                      {item.tipo === 'credito' && <CreditCard className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h5 className="text-xs font-black text-neutral-900 uppercase tracking-tight truncate">
                          {item.titulo}
                        </h5>
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          {item.statusDisplay}
                        </span>
                        {item.valorDisplay && (
                          <span className="font-mono text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">
                            {item.valorDisplay}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-500 font-medium mt-1">
                        {item.descricao}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 justify-end">
                    <button
                      type="button"
                      disabled={deletingPendencyId === item.id}
                      onClick={() => handleDeletePendency(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
                      title="Excluir esta pendência imediatamente"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletingPendencyId === item.id ? 'Excluindo...' : 'Excluir assim mesmo'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleResolvePendency(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-black uppercase tracking-wider shadow-sm transition-all"
                      title="Ir para a página de resolução desta pendência"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                      Resolver agora
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto" />
              <h4 className="text-sm font-black text-emerald-950 uppercase tracking-tight">
                Todas as pendências foram removidas!
              </h4>
              <p className="text-xs text-emerald-700 font-medium">
                O cadastro do cliente agora está livre e pode ser excluído definitivamente.
              </p>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-neutral-100">
            <button
              type="button"
              onClick={() => {
                setIsPendenciesModalOpen(false);
                setClienteToDelete(null);
              }}
              className="order-2 sm:order-1 w-full sm:flex-1 rounded-xl border border-neutral-200 py-3 text-xs font-black uppercase tracking-widest text-neutral-600 hover:bg-neutral-50 transition-all"
            >
              Cancelar
            </button>

            {pendencies.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setIsPendenciesModalOpen(false);
                  setIsDeleteConfirmOpen(true);
                }}
                className="order-1 sm:order-2 w-full sm:flex-1 rounded-xl bg-red-600 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-red-600/30 hover:bg-red-700 transition-all"
              >
                Prosseguir com Exclusão Definitiva
              </button>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        title="Confirmar Exclusão"
      >
        <div className="space-y-4">
          <p>Tem certeza que deseja excluir o cliente <strong>{clienteToDelete?.nome}</strong> permanentemente? Esta ação não pode ser desfeita.</p>
          <div className="flex gap-4">
            <button onClick={() => setIsDeleteConfirmOpen(false)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={handleDelete} className="btn-primary flex-1 bg-red-600 hover:bg-red-700">Excluir</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ClienteForm({ onSubmit, onCancel }: { onSubmit: (data: any) => Promise<void> | void, onCancel: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    cpf: '',
    cnpj: '',
    tipo_pessoa: 'pf',
    telefone: '',
    observacoes: '',
    data_cadastro: new Date().toISOString().split('T')[0]
  });
  const [referralInfo, setReferralInfo] = useState<any>(null);

  useEffect(() => {
    const cleanPhone = formData.telefone.replace(/\D/g, '');
    if (cleanPhone.length === 11) {
      checkReferral(cleanPhone);
    } else {
      setReferralInfo(null);
    }
  }, [formData.telefone]);

  const checkReferral = async (phone: string) => {
    const { data } = await supabase
      .from('indicacoes')
      .select('*, indicador:clientes!indicador_id(nome, codigo_cliente)')
      .eq('whatsapp_indicado', phone)
      .eq('status', 'aberta')
      .maybeSingle();
    
    if (data) {
      setReferralInfo(data);
    } else {
      setReferralInfo(null);
    }
  };

  return (
    <form onSubmit={async (e) => { 
      e.preventDefault(); 
      setIsSubmitting(true);
      try {
        await onSubmit(formData);
      } finally {
        setIsSubmitting(false);
      }
    }} className="space-y-6">
      {referralInfo && (
        <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 animate-pulse">
          <div className="flex items-center gap-2 text-amber-800 mb-1">
            <Info className="h-4 w-4" />
            <p className="text-xs font-bold uppercase tracking-wider">Promoção Indique e Ganhe Detectada!</p>
          </div>
          <p className="text-sm text-amber-900">
            Este documento foi indicado por <strong>{referralInfo.indicador?.nome}</strong> ({referralInfo.indicador?.codigo_cliente}) em <strong>{formatDate(referralInfo.data_indicacao)}</strong>.
          </p>
        </div>
      )}
      <div className="flex gap-2 p-1 bg-neutral-100 rounded-lg">
        <button type="button" onClick={() => setFormData({...formData, tipo_pessoa: 'pf'})} className={`flex-1 py-2 text-sm rounded-md transition-all ${formData.tipo_pessoa === 'pf' ? 'bg-white shadow' : 'text-neutral-500'}`}>Pessoa Física</button>
        <button type="button" onClick={() => setFormData({...formData, tipo_pessoa: 'pj'})} className={`flex-1 py-2 text-sm rounded-md transition-all ${formData.tipo_pessoa === 'pj' ? 'bg-white shadow' : 'text-neutral-500'}`}>Pessoa Jurídica</button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-bold text-neutral-700">{formData.tipo_pessoa === 'pf' ? 'Nome Completo *' : 'Razão Social *'}</label>
          <input 
            type="text" 
            required
            value={formData.nome}
            onChange={e => setFormData({...formData, nome: e.target.value})}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-bold text-neutral-700">E-mail *</label>
          <input 
            type="email" 
            required
            value={formData.email}
            onChange={e => setFormData({...formData, email: e.target.value})}
            onBlur={(e) => {
              if (e.target.value && !validarEmail(e.target.value)) {
                toast.error('E-mail inválido');
                setFormData({...formData, email: ''});
              }
            }}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold text-neutral-700">{formData.tipo_pessoa === 'pf' ? 'CPF *' : 'CNPJ *'}</label>
          <input 
            type="text" 
            inputMode="numeric"
            pattern="[0-9]*"
            required
            value={formData.tipo_pessoa === 'pf' ? formData.cpf : formData.cnpj}
            onChange={e => setFormData(formData.tipo_pessoa === 'pf' ? {...formData, cpf: maskCPF(e.target.value)} : {...formData, cnpj: maskCNPJ(e.target.value)})}
            onBlur={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              if (val) {
                if (formData.tipo_pessoa === 'pf' && !validarCPF(val)) { toast.error('CPF inválido'); setFormData({ ...formData, cpf: '' }); }
                if (formData.tipo_pessoa === 'pj' && !validarCNPJ(val)) { toast.error('CNPJ inválido'); setFormData({ ...formData, cnpj: '' }); }
              }
            }}
            placeholder={formData.tipo_pessoa === 'pf' ? "000.000.000-00" : "00.000.000/0000-00"}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold text-neutral-700">Telefone</label>
          <input 
            type="text" 
            inputMode="numeric"
            pattern="[0-9]*"
            value={formData.telefone}
            onChange={e => setFormData({...formData, telefone: maskPhone(e.target.value)})}
            maxLength={15}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-bold text-neutral-700">Data Cadastro</label>
          <input 
            type="date" 
            value={formData.data_cadastro}
            onChange={e => setFormData({...formData, data_cadastro: e.target.value})}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-bold text-neutral-700">Observações</label>
          <textarea 
            rows={3}
            value={formData.observacoes}
            onChange={e => setFormData({...formData, observacoes: e.target.value})}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex gap-4 pt-4">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-neutral-200 py-3 font-bold text-neutral-600 hover:bg-neutral-50">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50">
          {isSubmitting ? 'Salvando...' : 'Finalizar Cadastro'}
        </button>
      </div>
    </form>
  );
}

function ClienteDetails({ cliente: initialCliente, colaboradorId, colaboradorNome, onToggleStatus, onDelete, onRefresh }: { cliente: Cliente, colaboradorId?: string, colaboradorNome?: string, onToggleStatus: () => void, onDelete: () => void, onRefresh: () => void }) {
  const [tab, setTab] = useState<'perfil' | 'ordens' | 'faturas' | 'carteira_digital' | 'carteira_pontos' | 'documentos'>('perfil');
  const [cliente, setCliente] = useState<Cliente>(initialCliente);
  const [isAddingBalance, setIsAddingBalance] = useState(false);
  const [balanceType, setBalanceType] = useState<'entrada' | 'saida'>('entrada');
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceDescription, setBalanceDescription] = useState('Ajuste de Saldo');
  const [osList, setOsList] = useState<any[]>([]);
  const [comprasList, setComprasList] = useState<any[]>([]);
  const [assinaturasList, setAssinaturasList] = useState<any[]>([]);
  const [faturasList, setFaturasList] = useState<any[]>([]);
  const [extratoList, setExtratoList] = useState<any[]>([]);
  const [extratoPontosList, setExtratoPontosList] = useState<any[]>([]);
  const [loadingTab, setLoadingTab] = useState(false);
  const [isAddingPoints, setIsAddingPoints] = useState(false);
  const [pointsType, setPointsType] = useState<'adicao' | 'remocao'>('adicao');
  const [pointsAmount, setPointsAmount] = useState('');
  const [pointsDescription, setPointsDescription] = useState('Ajuste de Pontos');
  const [paidInvoicesCount, setPaidInvoicesCount] = useState<number | null>(null);
  const [isProcessingBalance, setIsProcessingBalance] = useState(false);
  const [isProcessingPoints, setIsProcessingPoints] = useState(false);

  const [isReasonModalOpen, setIsReasonModalOpen] = useState(false);
  const [blockingType, setBlockingType] = useState<'cadastro' | 'carteira' | 'pontos' | null>(null);
  const [blockingReason, setBlockingReason] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});

  const [notasAdmin, setNotasAdmin] = useState<any[]>([]);
  const [novaNotaAdmin, setNovaNotaAdmin] = useState('');
  const [editandoNotaId, setEditandoNotaId] = useState<string | null>(null);
  const [isSavingNota, setIsSavingNota] = useState(false);

  const [selectedOS, setSelectedOS] = useState<any | null>(null);
  const [selectedCompra, setSelectedCompra] = useState<any | null>(null);
  const [selectedAssinatura, setSelectedAssinatura] = useState<any | null>(null);
  const [selectedFatura, setSelectedFatura] = useState<any | null>(null);
  
  const [isOSModalOpen, setIsOSModalOpen] = useState(false);
  const [isCompraModalOpen, setIsCompraModalOpen] = useState(false);
  const [isAssinaturaModalOpen, setIsAssinaturaModalOpen] = useState(false);
  const [isFaturaModalOpen, setIsFaturaModalOpen] = useState(false);

  useEffect(() => {
    setCliente(initialCliente);
    
    let isMounted = true;
    const fetchFullDetails = async () => {
      if (!initialCliente?.id) return;
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', initialCliente.id)
        .single();
      
      if (isMounted && data && !error) {
        setCliente(data);
      }
    };
    fetchFullDetails();
    return () => { isMounted = false; };
  }, [initialCliente]);

  useEffect(() => {
    if (tab === 'ordens') fetchOrdensGeradas();
    if (tab === 'faturas') fetchFaturas();
    if (tab === 'carteira_digital') {
      fetchExtrato();
      fetchPaidInvoicesCount();
    }
    if (tab === 'carteira_pontos') fetchExtratoPontos();
    fetchNotasAdmin();
  }, [tab, cliente.id]);

  useEffect(() => {
    if (!cliente.id) return;

    const channel = supabase.channel(`cliente-details-${cliente.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'extrato_financeiro', filter: `cliente_id=eq.${cliente.id}` }, fetchExtrato)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'faturas', filter: `cliente_id=eq.${cliente.id}` }, () => {
        fetchFaturas();
        fetchPaidInvoicesCount();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_servico', filter: `cliente_id=eq.${cliente.id}` }, fetchOrdensGeradas)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_compra', filter: `cliente_id=eq.${cliente.id}` }, fetchOrdensGeradas)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_assinatura', filter: `cliente_id=eq.${cliente.id}` }, fetchOrdensGeradas)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pontos_movimentacoes', filter: `cliente_id=eq.${cliente.id}` }, fetchExtratoPontos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'points_transactions', filter: `cliente_id=eq.${cliente.id}` }, fetchExtratoPontos)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clientes', filter: `id=eq.${cliente.id}` }, (payload) => {
        setCliente(prev => ({ ...prev, ...payload.new }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cliente_notas_admin', filter: `cliente_id=eq.${cliente.id}` }, fetchNotasAdmin)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cliente.id]);

  const fetchPaidInvoicesCount = async () => {
    try {
      const { count, error } = await supabase
        .from('faturas')
        .select('*', { count: 'exact', head: true })
        .eq('cliente_id', cliente.id)
        .eq('status', 'pago');
      
      if (error) throw error;
      setPaidInvoicesCount(count);
    } catch (error) {
      console.error('Error fetching paid invoices count:', error);
    }
  };

  const fetchOrdensGeradas = async () => {
    setLoadingTab(true);
    try {
      // 1. Ordens de Serviço
      const { data: osData } = await supabase
        .from('ordens_servico')
        .select('*, orcamentos(total, servicos(nome)), prestador_demandas(id, status)')
        .eq('cliente_id', cliente.id)
        .order('data_inicio', { ascending: false });

      // 2. Ordens de Compra (Produtos)
      const { data: compraData } = await supabase
        .from('ordens_compra')
        .select('*, orcamentos(total), produtos(nome)')
        .eq('cliente_id', cliente.id)
        .order('data_criacao', { ascending: false });

      // 3. Ordens de Assinatura
      const { data: assinaturaData } = await supabase
        .from('ordens_assinatura')
        .select('*, orcamentos(total), assinaturas(nome)')
        .eq('cliente_id', cliente.id)
        .order('data_criacao', { ascending: false });

      setOsList(osData || []);
      setComprasList(compraData || []);
      setAssinaturasList(assinaturaData || []);
    } catch (error) {
      console.error('Erro ao buscar ordens:', error);
    } finally {
      setLoadingTab(false);
    }
  };

  const fetchFaturas = async () => {
    setLoadingTab(true);
    const { data } = await supabase
      .from('faturas')
      .select('*, cobrancas(id), clientes(id, nome, cpf, cnpj, email, telefone, codigo_cliente), ordens_servico(codigo_os, orcamentos(codigo_orcamento, total, valor_servico, valor_adicional, descricao_adicional, acrescimo, desconto, servicos(nome))), ordens_compra(codigo_ordem, quantidade, produtos(nome, valor), orcamentos(codigo_orcamento, total, valor_servico, valor_adicional, descricao_adicional, acrescimo, desconto)), ordens_assinatura(codigo_ordem, quantidade, assinaturas(nome, valor), orcamentos(codigo_orcamento, total, valor_servico, valor_adicional, descricao_adicional, acrescimo, desconto, quantidade_meses, prazo_indeterminado)), pagamentos(metodo, valor), ordens_fiscais(id)')
      .eq('cliente_id', cliente.id)
      .order('created_at', { ascending: false });
    if (data) setFaturasList(data);
    setLoadingTab(false);
  };

  const handleManualPaymentFatura = async (method: string, dateTime: string, notes: string) => {
    if (!selectedFatura) return;
    if (!notes.trim()) {
      toast.error('Informe as observações da baixa.');
      return;
    }

    try {
      const isoDateTime = new Date(dateTime).toISOString();
      const session = getAdminSessionForRpc();

      const { data: baixaResult, error: baixaError } = await supabase.rpc('gsa_admin_baixar_fatura', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_fatura_id: selectedFatura.id,
        p_metodo: method,
        p_data_pagamento: isoDateTime,
        p_observacoes: notes
      });

      if (baixaError) throw baixaError;
      if (baixaResult && !(baixaResult as any).success) {
        throw new Error((baixaResult as any).error || 'Erro ao baixar fatura.');
      }

      toast.success('Baixa administrativa realizada com sucesso!');
      setIsFaturaModalOpen(false);
      fetchFaturas();
      fetchExtrato();
      fetchPaidInvoicesCount();
      onRefresh();

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'BAIXAR_FATURA_MANUAL',
        detalhes: `Baixa manual da fatura #${selectedFatura.codigo_fatura} via ${method}`
      });

      // Busca a fatura atualizada para pegar todos os descontos e contatos reais
      const { data: updatedFatura } = await supabase
        .from('faturas')
        .select(`
          *,
          clientes (
            nome,
            telefone
          )
        `)
        .eq('id', selectedFatura.id)
        .single();

      if (updatedFatura && updatedFatura.clientes?.telefone) {
        const mensagemWhats = whatsappNotificationService.gerarMensagemWhatsApp({
          tipo: 'fatura',
          clienteNome: updatedFatura.clientes.nome,
          codigo: updatedFatura.codigo_fatura,
          status: updatedFatura.status,
          dataVencimento: updatedFatura.data_vencimento ? new Date(updatedFatura.data_vencimento).toLocaleDateString('pt-BR') : undefined,
          valorTotal: formatCurrency(updatedFatura.valor_total),
          formaPagamento: method,
          valorLiquido: formatCurrency(updatedFatura.valor_pago || updatedFatura.valor_total),
          cupomAplicado: updatedFatura.voucher_codigo,
          valorCupom: updatedFatura.desconto_voucher_aplicado > 0 ? formatCurrency(updatedFatura.desconto_voucher_aplicado) : undefined,
          pontosUtilizados: updatedFatura.pontos_utilizados > 0 ? updatedFatura.pontos_utilizados : undefined,
          valorPontos: updatedFatura.desconto_pontos_aplicado > 0 ? formatCurrency(updatedFatura.desconto_pontos_aplicado) : undefined,
          saldoCarteiraUtilizado: updatedFatura.abatimento_carteira_aplicado > 0 ? formatCurrency(updatedFatura.abatimento_carteira_aplicado) : undefined,
        });

        whatsappNotificationService.enviarWhatsAppDireto(updatedFatura.clientes.telefone, mensagemWhats)
          .catch(err => console.warn('Falha ao enviar aviso WA:', err));
      }
    } catch (error: any) {
      console.error('Erro na baixa manual:', error);
      toast.error(error?.message || 'Erro ao processar baixa administrativa.');
    }
  };

  const handleEnviarParaCobrancaFatura = async () => {
    if (!selectedFatura) return;
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_enviar_fatura_cobranca', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_fatura_id: selectedFatura.id
      });

      if (error) throw error;
      if (data && !(data as any).success) {
        throw new Error((data as any).error || 'Erro ao enviar fatura para cobrança.');
      }

      toast.success('Fatura enviada para o módulo de cobrança com sucesso!');
      fetchFaturas();
      setSelectedFatura((prev: any) => prev ? { ...prev, tem_cobranca: true } : null);
    } catch (error: any) {
      console.error('Erro ao enviar fatura para cobrança:', error);
      toast.error(error?.message || 'Erro ao processar envio para cobrança.');
    }
  };

  const fetchExtrato = async () => {
    setLoadingTab(true);
    const { data } = await supabase
      .from('extrato_financeiro')
      .select('*')
      .eq('cliente_id', cliente.id)
      .order('data', { ascending: false });
    if (data) setExtratoList(data);
    setLoadingTab(false);
  };

  const fetchExtratoPontos = async () => {
    setLoadingTab(true);
    
    // Busca de pontos_movimentacoes
    const { data: dataOld, error: errorOld } = await supabase
      .from('pontos_movimentacoes')
      .select('*')
      .eq('cliente_id', cliente.id)
      .order('data_movimentacao', { ascending: false });

    if (errorOld) console.error('Error fetching pontos_movimentacoes:', errorOld);

    // Busca de points_transactions
    const { data: dataNew, error: errorNew } = await supabase
      .from('points_transactions')
      .select('*')
      .eq('cliente_id', cliente.id)
      .order('created_at', { ascending: false });

    if (errorNew) console.error('Error fetching points_transactions:', errorNew);

    // Combina e formata os dados, evitando duplicatas
    const formattedOld = (dataOld || []).map(item => ({
      id: item.id,
      data: item.data_movimentacao,
      descricao: item.descricao,
      pontos: item.pontos
    }));

    const formattedNew: any[] = [];
    (dataNew || []).forEach(newItem => {
      const isDuplicate = formattedOld.some(oldItem => 
        oldItem.pontos === newItem.pontos && 
        oldItem.descricao === newItem.descricao &&
        Math.abs(new Date(oldItem.data).getTime() - new Date(newItem.created_at).getTime()) < 5000
      );

      if (!isDuplicate) {
        formattedNew.push({
          id: newItem.id,
          data: newItem.created_at,
          descricao: newItem.descricao,
          pontos: newItem.pontos
        });
      }
    });

    const combined = [...formattedOld, ...formattedNew].sort((a, b) => 
      new Date(b.data).getTime() - new Date(a.data).getTime()
    );


    setExtratoPontosList(combined);
    setLoadingTab(false);
  };

  const fetchNotasAdmin = async () => {
    if (!cliente.id) return;
    const { data } = await supabase
      .from('cliente_notas_admin')
      .select('*')
      .eq('cliente_id', cliente.id)
      .order('created_at', { ascending: false });
    if (data) setNotasAdmin(data);
  };

  const handleSaveNotaAdmin = async () => {
    if (!novaNotaAdmin.trim()) return toast.error('Informe o conteúdo da nota.');
    setIsSavingNota(true);

    try {
      if (editandoNotaId) {
        const { error } = await supabase
          .from('cliente_notas_admin')
          .update({ conteudo: novaNotaAdmin.trim() })
          .eq('id', editandoNotaId);
        if (error) throw error;
        toast.success('Informação atualizada.');
      } else {
        const { error } = await supabase
          .from('cliente_notas_admin')
          .insert([{
            cliente_id: cliente.id,
            conteudo: colaboradorNome ? `${novaNotaAdmin.trim()} [Adicionado por: ${colaboradorNome}]` : novaNotaAdmin.trim()
          }]);
        if (error) throw error;
        toast.success('Informação adicionada.');
      }

      // Log Action
      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: editandoNotaId ? 'EDITAR_NOTA_ADMIN_CLIENTE' : 'CRIAR_NOTA_ADMIN_CLIENTE',
        detalhes: `${editandoNotaId ? 'Editou' : 'Criou'} uma nota administrativa para o cliente ${cliente.nome}`
      });

      setNovaNotaAdmin('');
      setEditandoNotaId(null);
      fetchNotasAdmin();
    } catch (error: any) {
      console.error('Erro ao salvar nota:', error);
      toast.error('Erro ao salvar informação.');
    } finally {
      setIsSavingNota(false);
    }
  };

  const handleDeleteNotaAdmin = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta informação?')) return;

    try {
      const { error } = await supabase
        .from('cliente_notas_admin')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Informação excluída.');

      // Log Action
      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'EXCLUIR_NOTA_ADMIN_CLIENTE',
        detalhes: `Excluiu uma nota administrativa do cliente ${cliente.nome}`
      });
      fetchNotasAdmin();
    } catch (error: any) {
      console.error('Erro ao excluir nota:', error);
      toast.error('Erro ao excluir informação.');
    }
  };

  const handleAddBalance = async () => {
    const amount = parseFloat(balanceAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return toast.error('Informe um valor valido.');
    if (isProcessingBalance) return;

    setIsProcessingBalance(true);
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_ajustar_saldo_cliente', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cliente_id: cliente.id,
        p_tipo: balanceType,
        p_valor: amount,
        p_descricao: balanceDescription || null
      });

      if (error) throw error;

      const newBalance = Number(data?.saldo_atual ?? cliente.saldo_carteira);
      const adjustment = Number(data?.ajuste ?? (balanceType === 'entrada' ? amount : -amount));

      setCliente({ ...cliente, saldo_carteira: newBalance });
      toast.success('Saldo atualizado com sucesso.');

      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'AJUSTE_SALDO_MANUAL',
        detalhes: `${balanceType === 'entrada' ? 'Adicionou' : 'Removeu'} ${formatCurrency(amount)} do saldo do cliente ${cliente.nome}. Motivo: ${balanceDescription}`
      });

      await notificationService.notifyClient(
        cliente.id,
        'Ajuste de Saldo',
        `Seu saldo na carteira foi ajustado em ${formatCurrency(adjustment)}. O saldo atual e ${formatCurrency(newBalance)}.`,
        'financeiro',
        'ajuste_saldo',
        { tab: 'extrato' }
      );

      setIsAddingBalance(false);
      setBalanceAmount('');
      setBalanceDescription('Ajuste de Saldo');
      setBalanceType('entrada');
      onRefresh();
    } catch (error: any) {
      console.error('Erro ao ajustar saldo:', error);
      toast.error(error.message || 'Erro ao processar o ajuste de saldo.');
    } finally {
      setIsProcessingBalance(false);
    }
  };

  const handleToggleBlockWallet = async () => {
    if (!cliente.carteira_bloqueada) {
      setBlockingType('carteira');
      setBlockingReason('');
      setIsReasonModalOpen(true);
      return;
    }

    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_atualizar_status_cliente', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cliente_id: cliente.id,
        p_acao: 'desbloquear_carteira',
        p_motivo: null,
        p_valor: null
      });

      if (error) throw error;

      const patch = data?.patch || { carteira_bloqueada: false };
      setCliente({ ...cliente, ...patch, motivo_bloqueio_carteira: undefined });
      toast.success('Carteira digital desbloqueada.');

      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'DESBLOQUEAR_CARTEIRA_CLIENTE',
        detalhes: `Desbloqueou a carteira digital do cliente ${cliente.nome}`
      });

      await notificationService.notifyClient(
        cliente.id,
        'Carteira Desbloqueada',
        'Sua carteira digital foi desbloqueada e esta pronta para uso.',
        'financeiro',
        'carteira_desbloqueada',
        { tab: 'extrato' }
      );

      onRefresh();
    } catch (error: any) {
      console.error('Erro ao atualizar status da carteira:', error);
      toast.error(error.message || 'Erro ao atualizar status da carteira.');
    }
  };

  const handleToggleManualUnlock = async () => {
    const newValue = !cliente.saque_liberado_manual;

    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_atualizar_status_cliente', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cliente_id: cliente.id,
        p_acao: 'definir_saque_manual',
        p_motivo: null,
        p_valor: newValue
      });

      if (error) throw error;

      const patch = data?.patch || { saque_liberado_manual: newValue };
      setCliente({ ...cliente, ...patch });
      toast.success(newValue ? 'Saque desbloqueado manualmente para este cliente.' : 'Desbloqueio manual de saque removido.');

      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'AJUSTE_SAQUE_MANUAL_CLIENTE',
        detalhes: `${newValue ? 'Liberou' : 'Removeu liberacao'} manual de saque para o cliente ${cliente.nome}`
      });

      if (newValue) {
        await notificationService.notifyClient(
          cliente.id,
          'Saque Liberado',
          'Seu saque foi liberado manualmente pela administracao. Agora voce pode solicitar retiradas.',
          'financeiro',
          'saque_liberado',
          { tab: 'saques' }
        );
      }

      onRefresh();
    } catch (error: any) {
      console.error('Erro ao atualizar desbloqueio manual:', error);
      toast.error(error.message || 'Erro ao atualizar desbloqueio manual.');
    }
  };

  const handleToggleBlockPoints = async () => {
    if (!cliente.pontos_bloqueados) {
      setBlockingType('pontos');
      setBlockingReason('');
      setIsReasonModalOpen(true);
      return;
    }

    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_atualizar_status_cliente', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cliente_id: cliente.id,
        p_acao: 'desbloquear_pontos',
        p_motivo: null,
        p_valor: null
      });

      if (error) throw error;

      const patch = data?.patch || { pontos_bloqueados: false };
      setCliente({ ...cliente, ...patch, motivo_bloqueio_pontos: undefined });
      toast.success('Carteira de pontos desbloqueada.');

      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'DESBLOQUEAR_PONTOS_CLIENTE',
        detalhes: `Desbloqueou a carteira de pontos do cliente ${cliente.nome}`
      });

      await notificationService.notifyClient(
        cliente.id,
        'Pontos Desbloqueados',
        'Sua carteira de pontos foi desbloqueada e esta pronta para uso.',
        'pontos',
        'pontos_desbloqueados',
        { tab: 'extrato' }
      );

      onRefresh();
    } catch (error: any) {
      console.error('Erro ao atualizar status da carteira de pontos:', error);
      toast.error(error.message || 'Erro ao atualizar status da carteira de pontos.');
    }
  };

  const handleAddPoints = async () => {
    const amount = parseInt(pointsAmount);
    if (isNaN(amount) || amount <= 0) return toast.error('Informe uma quantidade válida.');
    if (isProcessingPoints) return;

    setIsProcessingPoints(true);
    try {
      const adjustment = pointsType === 'adicao' ? amount : -amount;
      await processGamificationPointsManual(cliente.id, adjustment, pointsDescription, 'ajuste_manual', colaboradorNome);

      const newPoints = (cliente.saldo_pontos || 0) + adjustment;
      setCliente({ ...cliente, saldo_pontos: newPoints });
      toast.success('Saldo de pontos atualizado com sucesso.');

      // Log Action
      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'AJUSTE_PONTOS_CLIENTE',
        detalhes: `Ajuste manual de pontos para o cliente ${cliente.nome}. Tipo: ${pointsType}. Quantidade: ${amount}. Saldo resultante: ${newPoints}`
      });

      // Notificar Cliente
      await notificationService.notifyClient(
        cliente.id,
        pointsType === 'adicao' ? '⭐ Pontos Adicionados' : '📉 Pontos Removidos',
        `${pointsType === 'adicao' ? `${amount} pontos foram adicionados` : `${amount} pontos foram removidos`} da sua conta. Saldo atual: ${newPoints} pontos.`,
        'pontos',
        'ajuste_pontos',
        { tab: 'extrato' }
      );

      setIsAddingPoints(false);
      setPointsAmount('');
      setPointsDescription('Ajuste de Pontos');
      setPointsType('adicao');
      onRefresh();
    } catch (error: any) {
      console.error('Erro ao ajustar pontos:', error);
      toast.error('Erro ao processar ajuste de pontos.');
    } finally {
      setIsProcessingPoints(false);
    }
  };

  const handleUnlockCadastro = async () => {
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_atualizar_status_cliente', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cliente_id: cliente.id,
        p_acao: 'aprovar_cadastro',
        p_motivo: null,
        p_valor: null
      });

      if (error) throw error;

      await notificationService.notifyClient(
        cliente.id,
        'Cadastro Aprovado',
        'Seu cadastro foi revisado e aprovado com sucesso. Todos os modulos foram liberados.',
        'dashboard',
        'cadastro_aprovado',
        { tab: 'perfil', prioridade: 'alta' }
      );

      const patch = data?.patch || {
        status: 'ativo',
        carteira_bloqueada: false,
        pontos_bloqueados: false,
        cadastro_aprovado: true
      };
      setCliente({ ...cliente, ...patch });
      toast.success('Cadastro desbloqueado com sucesso!');

      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'DESBLOQUEAR_CLIENTE',
        detalhes: `Desbloqueou o cadastro e todas as funcoes do cliente ${cliente.nome}`
      });

      onRefresh();
    } catch (error: any) {
      console.error('Erro ao desbloquear cadastro:', error);
      toast.error(error.message || 'Erro ao desbloquear cadastro.');
    }
  };

  const handleBlockCadastro = async () => {
    setBlockingType('cadastro');
    setBlockingReason('');
    setIsReasonModalOpen(true);
  };

  const confirmBlocking = async () => {
    if (!blockingReason.trim()) return toast.error('Informe o motivo do bloqueio.');

    try {
      const actionByType: Record<string, string> = {
        cadastro: 'bloquear_cadastro',
        carteira: 'bloquear_carteira',
        pontos: 'bloquear_pontos'
      };
      const rpcAction = actionByType[blockingType];
      if (!rpcAction) throw new Error('Tipo de bloqueio invalido.');

      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_atualizar_status_cliente', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cliente_id: cliente.id,
        p_acao: rpcAction,
        p_motivo: blockingReason,
        p_valor: null
      });

      if (error) throw error;

      const patch = data?.patch || {};
      setCliente({ ...cliente, ...patch });

      const successMessage = blockingType === 'cadastro'
        ? 'Cadastro bloqueado com sucesso!'
        : blockingType === 'carteira'
          ? 'Carteira digital bloqueada!'
          : 'Carteira de pontos bloqueada!';
      toast.success(successMessage);

      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: blockingType === 'cadastro' ? 'BLOQUEAR_CLIENTE' : (blockingType === 'carteira' ? 'BLOQUEAR_CARTEIRA_CLIENTE' : 'BLOQUEAR_PONTOS_CLIENTE'),
        detalhes: `Bloqueou ${blockingType === 'cadastro' ? 'o cadastro' : (blockingType === 'carteira' ? 'a carteira digital' : 'a carteira de pontos')} do cliente ${cliente.nome}. Motivo: ${blockingReason}`
      });

      let notifTitulo = '';
      let notifMsg = '';
      let notifModulo: any = 'dashboard';

      if (blockingType === 'cadastro') {
        notifTitulo = 'Cadastro Bloqueado';
        notifMsg = `Seu cadastro foi bloqueado. Motivo: ${blockingReason}`;
      } else if (blockingType === 'carteira') {
        notifTitulo = 'Carteira Bloqueada';
        notifMsg = `Sua carteira digital foi bloqueada. Motivo: ${blockingReason}`;
        notifModulo = 'financeiro';
      } else if (blockingType === 'pontos') {
        notifTitulo = 'Pontos Bloqueados';
        notifMsg = `Sua carteira de pontos foi bloqueada. Motivo: ${blockingReason}`;
        notifModulo = 'pontos';
      }

      await notificationService.notifyClient(
        cliente.id,
        notifTitulo,
        notifMsg,
        notifModulo as any,
        blockingType === 'cadastro' ? 'cadastro_bloqueado' : (blockingType === 'carteira' ? 'carteira_bloqueada' : 'pontos_bloqueados'),
        {
          tab: blockingType === 'cadastro' ? 'perfil' : 'extrato',
          prioridade: 'alta'
        }
      );

      setIsReasonModalOpen(false);
      setBlockingReason('');
      onRefresh();
    } catch (error: any) {
      console.error('Erro ao realizar bloqueio:', error);
      toast.error(`Erro ao realizar bloqueio: ${error.message || 'Erro desconhecido'}`);
    }
  };

  const handleSaveEdit = async () => {
    try {
      const updateData: any = { ...editData };

      if (updateData.logradouro !== undefined) {
        updateData.endereco = updateData.logradouro;
        delete updateData.logradouro;
      }
      if (updateData.uf !== undefined) {
        updateData.estado = updateData.uf;
        delete updateData.uf;
      }

      if (updateData.cpf_cnpj !== undefined) {
        if (cliente.tipo_pessoa === 'pf') {
          updateData.cpf = updateData.cpf_cnpj;
          updateData.cnpj = null;
        } else {
          updateData.cnpj = updateData.cpf_cnpj;
          updateData.cpf = null;
        }
        delete updateData.cpf_cnpj;
      }

      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_atualizar_dados_cliente', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cliente_id: cliente.id,
        p_patch: updateData
      });

      if (error) throw error;

      const patch = data?.patch || updateData;
      setCliente({ ...cliente, ...patch });
      setIsEditing(false);
      toast.success('Perfil atualizado com sucesso!');

      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'EDITAR_CLIENTE',
        detalhes: `Editou os dados cadastrais do cliente ${cliente.nome}`
      });
      onRefresh();
    } catch (error: any) {
      console.error('Erro ao salvar edicao:', error);
      toast.error('Erro ao salvar: ' + (error.message || 'Tente novamente.'));
    }
  };

  const startEditing = () => {
    setEditData({
      nome: cliente.nome,
      email: cliente.email,
      telefone: cliente.telefone,
      cpf_cnpj: cliente.tipo_pessoa === 'pf' ? cliente.cpf : cliente.cnpj,
      cep: cliente.cep,
      logradouro: cliente.endereco,
      numero: cliente.numero,
      bairro: cliente.bairro,
      cidade: cliente.cidade,
      uf: cliente.estado
    });
    setIsEditing(true);
  };

  return (
    <div className="flex flex-col h-full bg-neutral-50/50">
      {/* Modal Header */}
      <div className="bg-white px-4 py-4 border-b border-neutral-200 sticky top-0 z-30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4 sm:gap-6">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.2rem] shadow-sm ring-1 ring-black/5 transition-transform ${cliente.status === 'ativo' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              <UserIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-neutral-900 uppercase tracking-tight truncate">{cliente.nome}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="font-mono text-[9px] sm:text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-lg ring-1 ring-indigo-100">
                  {cliente.codigo_cliente}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-[9px] sm:text-[10px] font-black uppercase tracking-widest ${
                  cliente.status === 'ativo' ? 'bg-emerald-50 text-emerald-600' : 
                  (cliente.status === 'inativo' && cliente.cadastro_aprovado === false) ? 'bg-amber-50 text-amber-600' : 
                  'bg-red-50 text-red-600'
                }`}>
                  {(cliente.status === 'inativo' && cliente.cadastro_aprovado === false) ? 'pendente' : cliente.status}
                </span>
              </div>
            </div>
          </div>
           <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
             {!isEditing ? (
               <button
                 onClick={startEditing}
                 className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-indigo-50 px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-colors"
               >
                 <Pencil className="h-3.5 w-3.5" />
                 Editar
               </button>
             ) : (
               <button
                 onClick={handleSaveEdit}
                 className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-bold text-white hover:bg-emerald-600 transition-colors"
               >
                 <Save className="h-3.5 w-3.5" />
                 Salvar
               </button>
             )}
              <button
               onClick={onDelete}
               className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-red-50 px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-bold text-red-600 hover:bg-red-100 transition-colors"
             >
               <Trash2 className="h-3.5 w-3.5" />
               Excluir
             </button>
           </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Sidebar Tabs / Mobile Top Nav */}
        <div className="w-full md:w-64 bg-white border-b md:border-r border-neutral-200 p-2 md:p-4 flex md:flex-col overflow-x-auto md:overflow-x-visible no-scrollbar shrink-0 gap-1 md:gap-1 sticky top-0 z-20">
          {[
            { id: 'perfil', label: 'Perfil', icon: UserIcon },
            { id: 'ordens', label: 'Ordens Geradas', icon: ClipboardList },
            { id: 'faturas', label: 'Faturas', icon: FileText },
            { id: 'carteira_digital', label: 'Carteira Digital', icon: Wallet },
            { id: 'carteira_pontos', label: 'Carteira Pontos', icon: Gift },
            { id: 'documentos', label: 'Documentos', icon: FileText }
          ].map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-xl text-[11px] md:text-sm font-bold transition-all whitespace-nowrap ${
                  tab === t.id 
                    ? 'bg-indigo-50 text-indigo-600 shadow-sm' 
                    : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 pb-20 md:pb-6">
           {tab === 'perfil' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              {isEditing && (
                <div className="rounded-2xl sm:rounded-3xl bg-white p-4 sm:p-6 md:p-8 shadow-sm ring-1 ring-neutral-200">
                  <h3 className="text-base sm:text-lg font-black text-neutral-900 uppercase tracking-tight mb-4 sm:mb-6">Editando Perfil do Cliente</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    <div className="space-y-1 text-left">
                      <label className="text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Nome / Razão Social</label>
                      <input 
                        type="text" 
                        value={editData.nome || ''} 
                        onChange={e => setEditData({...editData, nome: e.target.value})}
                        className="w-full rounded-xl bg-neutral-50 border-transparent px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                      />
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">CPF / CNPJ</label>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={editData.cpf_cnpj || ''} 
                        onChange={e => setEditData({...editData, cpf_cnpj: cliente.tipo_pessoa === 'pf' ? maskCPF(e.target.value) : maskCNPJ(e.target.value)})}
                        onBlur={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          if (val) {
                            if (cliente.tipo_pessoa === 'pf' && !validarCPF(val)) { toast.error('CPF inválido'); setEditData({ ...editData, cpf_cnpj: '' }); }
                            if (cliente.tipo_pessoa === 'pj' && !validarCNPJ(val)) { toast.error('CNPJ inválido'); setEditData({ ...editData, cpf_cnpj: '' }); }
                          }
                        }}
                        className="w-full rounded-xl bg-neutral-50 border-transparent px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                      />
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">E-mail</label>
                      <input 
                        type="email" 
                        value={editData.email || ''} 
                        onChange={e => setEditData({...editData, email: e.target.value})}
                        onBlur={(e) => {
                          if (e.target.value && !validarEmail(e.target.value)) {
                            toast.error('E-mail inválido');
                            setEditData({ ...editData, email: '' });
                          }
                        }}
                        className="w-full rounded-xl bg-neutral-50 border-transparent px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                      />
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Telefone</label>
                      <input 
                        type="text" 
                        inputMode="tel"
                        maxLength={15}
                        placeholder="(00) 00000-0000"
                        value={editData.telefone || ''} 
                        onChange={e => setEditData({...editData, telefone: maskPhone(e.target.value)})}
                        className="w-full rounded-xl bg-neutral-50 border-transparent px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                      />
                    </div>
                    <div className="hidden lg:block space-y-1 text-neutral-300"></div>
                    <div className="hidden lg:block space-y-1 text-neutral-300"></div>

                    <div className="space-y-1 text-left">
                      <label className="text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">CEP</label>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        value={editData.cep || ''} 
                        onChange={async e => {
                          let v = e.target.value.replace(/\D/g, '');
                          if (v.length > 5) v = v.replace(/^(\d{5})(\d)/, '$1-$2');
                          setEditData(prev => ({ ...prev, cep: v }));
                          
                          const rawCep = v.replace(/\D/g, '');
                          if (rawCep.length === 8) {
                            try {
                              const res = await consultarCEP(rawCep);
                              if (res) {
                                setEditData(prev => ({
                                  ...prev,
                                  logradouro: res.logradouro,
                                  bairro: res.bairro,
                                  cidade: res.localidade,
                                  uf: res.uf
                                }));
                              }
                            } catch (err) {
                              console.error('Erro ao consultar CEP:', err);
                            }
                          }
                        }}
                        maxLength={9}
                        placeholder="00000-000"
                        className="w-full rounded-xl bg-neutral-50 border-transparent px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2 text-left">
                      <label className="text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Logradouro</label>
                      <input 
                        type="text" 
                        value={editData.logradouro || ''} 
                        onChange={e => setEditData({...editData, logradouro: e.target.value})}
                        className="w-full rounded-xl bg-neutral-50 border-transparent px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                      />
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Número</label>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        value={editData.numero || ''} 
                        onChange={e => setEditData({...editData, numero: e.target.value})}
                        className="w-full rounded-xl bg-neutral-50 border-transparent px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                      />
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Bairro</label>
                      <input 
                        type="text" 
                        value={editData.bairro || ''} 
                        onChange={e => setEditData({...editData, bairro: e.target.value})}
                        className="w-full rounded-xl bg-neutral-50 border-transparent px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                      />
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Cidade</label>
                      <input 
                        type="text" 
                        value={editData.cidade || ''} 
                        onChange={e => setEditData({...editData, cidade: e.target.value})}
                        className="w-full rounded-xl bg-neutral-50 border-transparent px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                      />
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">UF</label>
                      <input 
                        type="text" 
                        maxLength={2}
                        value={editData.uf || ''} 
                        onChange={e => setEditData({...editData, uf: e.target.value.toUpperCase()})}
                        className="w-full rounded-xl bg-neutral-50 border-transparent px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 mt-6 sm:mt-8 pt-6 border-t border-neutral-100">
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="w-full sm:flex-1 rounded-2xl border border-neutral-200 py-3 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-neutral-500 hover:bg-neutral-50 transition-all"
                    >
                      Descartar Alterações
                    </button>
                    <button 
                      onClick={handleSaveEdit}
                      className="w-full sm:flex-1 rounded-2xl bg-indigo-600 py-3 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all"
                    >
                      Salvar Alterações
                    </button>
                  </div>
                </div>
              )}

              {!isEditing && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 text-left">
                {/* Perfil Informações */}
                <div className="rounded-2xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-sm ring-1 ring-neutral-200">
                  <p className="text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3 sm:mb-4">Informações de Cadastro</p>
                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <p className="text-[9px] sm:text-[10px] font-bold text-neutral-400 uppercase">{cliente.tipo_pessoa === 'pf' ? 'CPF' : 'CNPJ'}</p>
                      <p className="text-xs sm:text-sm font-black text-neutral-900">
                        {cliente.tipo_pessoa === 'pf' ? maskCPF(cliente.cpf) : maskCNPJ(cliente.cnpj || '')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] sm:text-[10px] font-bold text-neutral-400 uppercase">E-mail</p>
                      <p className="text-xs sm:text-sm font-black text-neutral-900">{cliente.email || 'Não informado'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] sm:text-[10px] font-bold text-neutral-400 uppercase">Telefone</p>
                      <p className="text-xs sm:text-sm font-black text-neutral-900">{maskPhone(cliente.telefone)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] sm:text-[10px] font-bold text-neutral-400 uppercase">Data de Cadastro</p>
                      <p className="text-xs sm:text-sm font-black text-neutral-900">{formatDate(cliente.data_cadastro)}</p>
                    </div>
                    {cliente.indicacao_origem_id && (
                      <div className="flex items-center gap-2 rounded-xl bg-indigo-50/50 p-2 sm:p-2.5 ring-1 ring-indigo-100/50 mt-1">
                        <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-indigo-500" />
                        <span className="text-[8px] sm:text-[9px] font-black text-indigo-700 uppercase">Cliente Indicado</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Observações */}
                <div className="lg:col-span-2 rounded-2xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-sm ring-1 ring-neutral-200">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest">Observações Admin</p>
                    <button 
                      onClick={() => {
                        setEditandoNotaId(null);
                        setNovaNotaAdmin('');
                        const el = document.getElementById('input-nota-admin');
                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el?.focus();
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-100 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      Adicionar Informação
                    </button>
                  </div>

                  <div className="space-y-3 mb-6">
                    {notasAdmin.length > 0 ? notasAdmin.map((nota) => (
                      <div key={nota.id} className="group/item relative rounded-xl bg-neutral-50/50 p-3 ring-1 ring-neutral-100/50 hover:bg-neutral-50 transition-all">
                        <div className="flex justify-between items-start gap-4">
                          <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed font-medium">
                            {nota.nota}
                          </p>
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                setEditandoNotaId(nota.id);
                                setNovaNotaAdmin(nota.nota);
                                const el = document.getElementById('input-nota-admin');
                                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }}
                              className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button 
                              onClick={() => handleDeleteNotaAdmin(nota.id)}
                              className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-all"
                              title="Excluir"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mt-2 flex items-center gap-1.5">
                          {formatDate(nota.created_at)}
                          {nota.updated_at !== nota.created_at && (
                            <span className="flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-neutral-300"></span>
                              editado
                            </span>
                          )}
                        </p>
                      </div>
                    )) : (
                      <p className="text-xs sm:text-sm text-neutral-400 italic font-medium py-2">
                        Nenhuma informação adicional registrada.
                      </p>
                    )}
                  </div>

                  <div className="relative">
                    <textarea 
                      id="input-nota-admin"
                      rows={2}
                      value={novaNotaAdmin}
                      onChange={e => setNovaNotaAdmin(e.target.value)}
                      placeholder={editandoNotaId ? "Editando informação..." : "Digite uma nova informação..."}
                      className="w-full rounded-xl bg-neutral-50 border-transparent px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                    />
                    <div className="flex items-center justify-end gap-2 mt-2">
                      {editandoNotaId && (
                        <button 
                          onClick={() => { setEditandoNotaId(null); setNovaNotaAdmin(''); }}
                          className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-neutral-500 hover:text-neutral-700 transition-colors"
                        >
                          Cancelar
                        </button>
                      )}
                      <button 
                        onClick={handleSaveNotaAdmin}
                        disabled={isSavingNota || !novaNotaAdmin.trim()}
                        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:scale-95"
                      >
                        {isSavingNota ? 'Salvando...' : editandoNotaId ? 'Salvar Edição' : 'Adicionar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            {(cliente.status === 'inativo' && cliente.cadastro_aprovado === false) && (
                <div className="rounded-2xl sm:rounded-[2rem] bg-amber-50 p-5 sm:p-6 ring-1 ring-amber-200">
                   <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-amber-100 text-amber-600">
                        <Lock className="h-5 w-5 sm:h-6 sm:w-6" />
                      </div>
                      <div>
                        <p className="text-base sm:text-lg font-black text-amber-900 uppercase tracking-tight">Cadastro Bloqueado</p>
                        <p className="text-[10px] sm:text-xs text-amber-700 font-bold">Aguardando análise ou bloqueio manual.</p>
                      </div>
                    </div>
                    <button
                      onClick={handleUnlockCadastro}
                      className="w-full sm:w-auto rounded-xl bg-amber-600 px-5 sm:px-6 py-2.5 sm:py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-amber-600/20 hover:bg-amber-700 transition-all active:scale-95"
                    >
                      Desbloquear Cadastro
                    </button>
                  </div>
                  {cliente.motivo_bloqueio_cadastro && (
                    <div className="mt-4 border-t border-amber-200 pt-4">
                      <p className="text-[9px] sm:text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">Motivo do Bloqueio:</p>
                      <p className="text-xs sm:text-sm text-amber-800 italic font-medium">"{cliente.motivo_bloqueio_cadastro}"</p>
                    </div>
                  )}
                </div>
              )}

              {/* Ações Rápidas */}
              <div className="pt-6 border-t border-neutral-200">
                <p className="text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4 sm:mb-6 ml-2 text-left">Ações Rápidas de Gestão</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  <button 
                    onClick={onToggleStatus}
                    className={`rounded-2xl py-3.5 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all ${
                      cliente.status === 'ativo' 
                        ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' 
                        : 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700'
                    }`}
                  >
                    {cliente.status === 'ativo' ? 'Inativar Cliente' : 'Ativar Cliente'}
                  </button>
                  {cliente.status === 'ativo' && (
                    <button 
                      onClick={handleBlockCadastro}
                      className="rounded-2xl bg-red-50 py-3.5 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-red-600 hover:bg-red-100 transition-all"
                    >
                      Bloquear Cadastro
                    </button>
                  )}
                  <button 
                    onClick={onDelete}
                    className="rounded-2xl bg-red-50 py-3.5 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-red-600 hover:bg-red-100 transition-all"
                  >
                    Excluir Cliente
                  </button>
                  <button 
                    onClick={async () => {
                      if (!confirm('Tem certeza que deseja resetar a senha de acesso deste cliente? O cliente precisará criar uma nova senha no próximo login.')) return;
                      try {
                        const success = await callAdminRpc<boolean>('gsa_admin_reset_actor_pin', {
                          p_actor_id: cliente.id,
                          p_actor_type: 'cliente',
                        });
                        if (success) {
                          toast.success('Senha de acesso resetada com sucesso!');
                        } else {
                          toast.error('Erro ao resetar senha.');
                        }
                      } catch (err: any) {
                        toast.error('Erro ao resetar senha: ' + (err.message || ''));
                      }
                    }}
                    className="rounded-2xl bg-amber-50 py-3.5 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-amber-600 hover:bg-amber-100 transition-all"
                  >
                    Resetar Senha
                  </button>
                  <button 
                    onClick={async () => {
                      try {
                        const session = getAdminSessionForRpc();
                        const { error } = await supabase.rpc('gsa_admin_desbloquear_pin_cliente', {
                          p_sessao_id: session.sessaoId,
                          p_session_token: session.sessionToken,
                          p_cliente_id: cliente.id
                        });
                        if (error) throw error;
                        setCliente({ ...cliente, pin_bloqueado: false, pin_tentativas: 0 } as any);
                        toast.success('Acesso desbloqueado com sucesso!');
                      } catch (err: any) {
                        toast.error('Erro ao desbloquear: ' + (err.message || ''));
                      }
                    }}
                    className="rounded-2xl bg-emerald-50 py-3.5 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-emerald-600 hover:bg-emerald-100 transition-all"
                  >
                    Desbloquear Acesso (PIN)
                  </button>
                  </div>
                </div>
                </>
              )}
            </div>
          )}

          {tab === 'ordens' && (
            <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-right-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-base sm:text-xl font-black text-neutral-900 uppercase tracking-tight text-left">Ordens Geradas</h3>
                <span className="text-[10px] sm:text-xs font-bold text-neutral-400 uppercase">Resumo Geral</span>
              </div>

              {loadingTab ? (
                <div className="flex justify-center p-10 sm:p-20 animate-pulse text-neutral-300"><ClipboardList className="h-10 w-10 sm:h-12 sm:w-12" /></div>
              ) : (
                <div className="grid grid-cols-1 gap-6 sm:gap-8">
                  {/* Card: Ordens de Serviço */}
                  <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-sm ring-1 ring-neutral-200">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shadow-sm ring-1 ring-indigo-100">
                          <Settings className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="text-sm sm:text-base font-black text-neutral-900 uppercase tracking-tight text-left">Ordens de Serviço</h4>
                          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest text-left">{osList.length} registros encontrados</p>
                        </div>
                      </div>
                    </div>
                    {osList.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {osList.map(os => (
                          <div 
                            key={os.id} 
                            onClick={() => { setSelectedOS(os); setIsOSModalOpen(true); }}
                            className="group rounded-2xl bg-neutral-50 p-4 transition-all hover:bg-white hover:shadow-md hover:ring-1 hover:ring-neutral-200 flex flex-col items-center text-center gap-4 cursor-pointer"
                          >
                            <div className="flex flex-col items-center gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                                  <span className="font-mono text-[9px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-lg ring-1 ring-indigo-100 uppercase">
                                    {os.codigo_os}
                                  </span>
                                  <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-widest ${
                                    os.status === 'concluido' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                                  }`}>
                                    {os.status}
                                  </span>
                                </div>
                                <h5 className="text-sm font-black text-neutral-900 uppercase tracking-tight">{os.orcamentos?.servicos?.nome || 'Serviço'}</h5>
                                <p className="text-[10px] font-bold text-neutral-400 mt-1 uppercase tracking-widest">Início: {formatDate(os.data_inicio)}</p>
                              </div>
                            </div>
                            <div className="flex flex-col items-center w-full pt-4 border-t border-neutral-200/60">
                              <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-1">Valor do Serviço</p>
                              <div className="flex items-center justify-center gap-4 w-full">
                                <p className="text-base font-black text-neutral-900">{formatCurrency(os.orcamentos?.total || 0)}</p>
                                <button className="rounded-full bg-indigo-50 p-1.5 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all">
                                  <ChevronRight className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center bg-neutral-50/50 rounded-2xl border border-dashed border-neutral-200">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Nenhuma OS encontrada</p>
                      </div>
                    )}
                  </div>

                  {/* Card: Ordens de Compra */}
                  <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-sm ring-1 ring-neutral-200">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 shadow-sm ring-1 ring-emerald-100">
                          <ShoppingBag className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="text-sm sm:text-base font-black text-neutral-900 uppercase tracking-tight text-left">Ordens de Compra</h4>
                          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest text-left">{comprasList.length} registros encontrados</p>
                        </div>
                      </div>
                    </div>
                    {comprasList.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {comprasList.map(compra => (
                          <div 
                            key={compra.id} 
                            onClick={() => { setSelectedCompra(compra); setIsCompraModalOpen(true); }}
                            className="group rounded-2xl bg-neutral-50 p-4 transition-all hover:bg-white hover:shadow-md hover:ring-1 hover:ring-neutral-200 flex flex-col items-center text-center gap-4 cursor-pointer"
                          >
                            <div className="flex flex-col items-center gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                                  <span className="font-mono text-[9px] font-black text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-lg ring-1 ring-emerald-100 uppercase">
                                    {compra.codigo_ordem}
                                  </span>
                                  <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-widest ${
                                    compra.status === 'concluido' || compra.status === 'pago' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                                  }`}>
                                    {compra.status}
                                  </span>
                                </div>
                                <h5 className="text-sm font-black text-neutral-900 uppercase tracking-tight">{compra.produtos?.nome || 'Produto'}</h5>
                                <p className="text-[10px] font-bold text-neutral-400 mt-1 uppercase tracking-widest">Data: {formatDate(compra.data_criacao)}</p>
                              </div>
                            </div>
                            <div className="flex flex-col items-center w-full pt-4 border-t border-neutral-200/60">
                              <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-1">Valor da Compra</p>
                              <div className="flex items-center justify-center gap-4 w-full">
                                <p className="text-base font-black text-neutral-900">{formatCurrency(compra.orcamentos?.total || 0)}</p>
                                <button className="rounded-full bg-emerald-50 p-1.5 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all">
                                  <ChevronRight className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center bg-neutral-50/50 rounded-2xl border border-dashed border-neutral-200">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Nenhuma compra encontrada</p>
                      </div>
                    )}
                  </div>

                  {/* Card: Ordens de Assinatura */}
                  <div className="rounded-3xl bg-white p-5 sm:p-6 shadow-sm ring-1 ring-neutral-200">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 shadow-sm ring-1 ring-amber-100">
                          <Gift className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="text-sm sm:text-base font-black text-neutral-900 uppercase tracking-tight text-left">Ordens de Assinatura</h4>
                          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest text-left">{assinaturasList.length} registros encontrados</p>
                        </div>
                      </div>
                    </div>
                    {assinaturasList.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {assinaturasList.map(assinatura => (
                          <div 
                            key={assinatura.id} 
                            onClick={() => { setSelectedAssinatura(assinatura); setIsAssinaturaModalOpen(true); }}
                            className="group rounded-2xl bg-neutral-50 p-4 transition-all hover:bg-white hover:shadow-md hover:ring-1 hover:ring-neutral-200 flex flex-col items-center text-center gap-4 cursor-pointer"
                          >
                            <div className="flex flex-col items-center gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
                                  <span className="font-mono text-[9px] font-black text-amber-500 bg-amber-50 px-2 py-0.5 rounded-lg ring-1 ring-amber-100 uppercase">
                                    {assinatura.codigo_ordem}
                                  </span>
                                  <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-widest ${
                                    assinatura.status === 'ativo' || assinatura.status === 'pago' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                                  }`}>
                                    {assinatura.status}
                                  </span>
                                </div>
                                <h5 className="text-sm font-black text-neutral-900 uppercase tracking-tight">{assinatura.assinaturas?.nome || 'Assinatura'}</h5>
                                <p className="text-[10px] font-bold text-neutral-400 mt-1 uppercase tracking-widest">Início: {formatDate(assinatura.data_criacao)}</p>
                              </div>
                            </div>
                            <div className="flex flex-col items-center w-full pt-4 border-t border-neutral-200/60">
                              <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-1">Valor Mensal</p>
                              <div className="flex items-center justify-center gap-4 w-full">
                                <p className="text-base font-black text-neutral-900">{formatCurrency(assinatura.orcamentos?.total || 0)}</p>
                                <button className="rounded-full bg-amber-50 p-1.5 text-amber-600 hover:bg-amber-600 hover:text-white transition-all">
                                  <ChevronRight className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center bg-neutral-50/50 rounded-2xl border border-dashed border-neutral-200">
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Nenhuma assinatura encontrada</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'faturas' && (
            <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-base sm:text-xl font-black text-neutral-900 uppercase tracking-tight text-left">Faturas Emitidas</h3>
                <span className="text-[10px] sm:text-xs font-bold text-neutral-400 uppercase">{faturasList.length} registros</span>
              </div>
              {loadingTab ? (
                <div className="flex justify-center p-10 sm:p-20 animate-pulse text-neutral-300"><FileText className="h-10 w-10 sm:h-12 sm:w-12" /></div>
              ) : faturasList.length > 0 ? (
                <div className="grid gap-3 sm:gap-4">
                  {faturasList.map(fat => (
                    <div 
                      key={fat.id} 
                      onClick={() => {
                        setSelectedFatura(fat);
                        setIsFaturaModalOpen(true);
                      }}
                      className="group rounded-xl sm:rounded-2xl bg-white p-4 sm:p-5 shadow-sm ring-1 ring-neutral-200 hover:shadow-md hover:ring-indigo-300 hover:bg-neutral-50/50 transition-all cursor-pointer"
                    >
                      <div className="flex justify-between items-center gap-4">
                        <div className="flex items-center gap-3 sm:gap-4 text-left min-w-0">
                          <div className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 flex items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                            <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-neutral-900 uppercase text-xs sm:text-sm truncate group-hover:text-indigo-600 transition-colors">{fat.codigo_fatura}</p>
                            <p className="text-[9px] sm:text-[10px] font-bold text-neutral-400 uppercase truncate">
                              Ref. {fat.ordens_servico?.codigo_os ? `OS: ${fat.ordens_servico.codigo_os}` : fat.ordens_compra?.codigo_ordem ? `Compra: ${fat.ordens_compra.codigo_ordem}` : fat.ordens_assinatura?.codigo_ordem ? `Assinatura: ${fat.ordens_assinatura.codigo_ordem}` : 'Geral'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-xs sm:text-sm font-black text-indigo-600">{formatCurrency(fat.valor_total)}</p>
                            <span className={`text-[8px] sm:text-[9px] font-black uppercase tracking-widest ${
                              fat.status === 'pendente' ? 'text-amber-500' : fat.status === 'pago' ? 'text-emerald-500' : 'text-red-500'
                            }`}>
                              {fat.status}
                            </span>
                          </div>
                          <div className="rounded-full bg-neutral-100 p-1.5 text-neutral-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 sm:py-20 bg-white rounded-2xl sm:rounded-3xl border border-dashed border-neutral-200">
                  <p className="text-[10px] sm:text-sm font-bold text-neutral-300 uppercase tracking-widest">Nenhuma fatura encontrada</p>
                </div>
              )}
            </div>
          )}

          {tab === 'carteira_digital' && (
            <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className={`rounded-3xl sm:rounded-[2.5rem] p-5 sm:p-8 text-white shadow-xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 sm:gap-6 ${cliente.carteira_bloqueada ? 'bg-red-600 shadow-red-600/20' : 'bg-indigo-600 shadow-indigo-600/20'}`}>
                <div className="text-left w-full">
                  <p className="text-[9px] sm:text-xs font-black uppercase tracking-widest opacity-70 mb-1">Saldo em Carteira {cliente.carteira_bloqueada && '(BLOQUEADO)'}</p>
                  <p className="text-3xl sm:text-5xl font-black tracking-tighter truncate">{formatCurrency(cliente.saldo_carteira)}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button 
                      onClick={() => setIsAddingBalance(true)}
                      className="flex items-center gap-2 rounded-xl bg-white/20 px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-white backdrop-blur-md hover:bg-white/30 transition-all"
                    >
                      <Plus className="h-3 w-3" />
                      Ajustar Saldo
                    </button>
                    <button
                      onClick={handleToggleManualUnlock}
                      disabled={paidInvoicesCount !== null && paidInvoicesCount > 0}
                      className={`flex items-center gap-2 rounded-xl px-3 sm:px-4 py-2 text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${
                        cliente.saque_liberado_manual 
                          ? 'bg-emerald-500 text-white' 
                          : (paidInvoicesCount !== null && paidInvoicesCount > 0)
                            ? 'bg-white/10 text-white/30 cursor-not-allowed'
                            : 'bg-white/20 text-white hover:bg-white/30'
                      }`}
                    >
                      {cliente.saque_liberado_manual ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                      Saque Manual
                    </button>
                    <div className="bg-white/10 p-0.5 rounded-full backdrop-blur-sm flex items-center justify-center">
                      <AdminWhatsAppButton 
                        telefone={cliente.telefone}
                        mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                          tipo: 'carteira_digital',
                          clienteNome: cliente.nome,
                          valorTotal: formatCurrency(cliente.saldo_carteira || 0)
                        })}
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleToggleBlockWallet}
                  className={`w-full lg:w-auto rounded-2xl px-5 sm:px-6 py-3.5 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all ${cliente.carteira_bloqueada ? 'bg-white text-red-600 hover:bg-neutral-50' : 'bg-red-500 text-white hover:bg-red-700 shadow-lg shadow-red-900/20'}`}
                >
                  {cliente.carteira_bloqueada ? 'Desbloquear Carteira' : 'Bloquear Carteira'}
                </button>
              </div>

              {cliente.carteira_bloqueada && cliente.motivo_bloqueio_carteira && (
                <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
                  <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Motivo do Bloqueio:</p>
                  <p className="text-sm text-red-800 italic font-medium">"{cliente.motivo_bloqueio_carteira}"</p>
                </div>
              )}

              <Modal
                isOpen={isAddingBalance}
                onClose={() => setIsAddingBalance(false)}
                title={`NOVO LANÇAMENTO - ${cliente.nome || (cliente as any).nome_razao || 'Cliente'}`}
                size="wide"
              >
                <div className="bg-[#1a1a1a] px-4 sm:px-5 py-4 sm:py-6 -mx-4 -mt-4 mb-4 border-b border-white/5 relative overflow-hidden rounded-t-xl sm:rounded-t-2xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>
                    <div className="relative z-10 flex items-center gap-3 sm:gap-4 text-left">
                        <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-transform">
                            <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
                        </div>
                        <div>
                            <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">
                                NOVO LANÇAMENTO
                            </h2>
                            <p className="text-[8px] sm:text-[9px] font-black text-indigo-400 uppercase tracking-widest mt-0.5">
                                {cliente.nome || (cliente as any).nome_razao || 'Cliente'}
                            </p>
                        </div>
                    </div>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); handleAddBalance(); }} className="space-y-3 sm:space-y-4 pt-1 sm:pt-2">
                  <div className="flex gap-2 p-1 bg-neutral-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setBalanceType('entrada')}
                      className={`flex-1 py-2.5 sm:py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-lg transition-all ${balanceType === 'entrada' ? 'bg-white shadow-sm text-emerald-600' : 'text-neutral-500 hover:text-neutral-700'}`}
                    >
                      Crédito
                    </button>
                    <button
                      type="button"
                      onClick={() => setBalanceType('saida')}
                      className={`flex-1 py-2.5 sm:py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-lg transition-all ${balanceType === 'saida' ? 'bg-white shadow-sm text-red-600' : 'text-neutral-500 hover:text-neutral-700'}`}
                    >
                      Débito
                    </button>
                  </div>

                  <div className="text-left">
                    <label className="mb-1.5 sm:mb-2 block text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Valor *</label>
                    <input
                      type="text"
                      required
                      placeholder="0,00"
                      value={balanceAmount}
                      onChange={e => setBalanceAmount(e.target.value.replace(/[^\d,]/g, ''))}
                      className="w-full rounded-xl sm:rounded-2xl bg-neutral-50 border-transparent px-4 sm:px-5 py-3.5 sm:py-4 text-xl sm:text-2xl font-black text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                    />
                  </div>

                  <div className="text-left">
                    <label className="mb-1.5 sm:mb-2 block text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Descrição / Motivo *</label>
                    <textarea
                      required
                      rows={2}
                      placeholder="Ex: Pagamento de demanda #123"
                      value={balanceDescription}
                      onChange={e => setBalanceDescription(e.target.value)}
                      className="w-full rounded-xl sm:rounded-2xl bg-neutral-50 border-transparent px-4 sm:px-5 py-3.5 sm:py-4 text-xs sm:text-sm font-bold text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-neutral-300 transition-all outline-none ring-1 ring-neutral-200 resize-none"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2 sm:pt-4">
                    <button 
                      type="button" 
                      onClick={() => setIsAddingBalance(false)} 
                      className="order-2 sm:order-1 w-full sm:flex-1 rounded-xl sm:rounded-2xl border border-neutral-200 py-3.5 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-neutral-500 hover:bg-neutral-50 transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit" 
                      disabled={isProcessingBalance}
                      className={`order-1 sm:order-2 w-full sm:flex-1 rounded-xl sm:rounded-2xl py-3.5 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-white shadow-lg transition-all ${balanceType === 'entrada' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' : 'bg-red-600 hover:bg-red-700 shadow-red-600/20'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isProcessingBalance ? 'Processando...' : 'Confirmar'}
                    </button>
                  </div>
                </form>
              </Modal>

              <div className="space-y-4">
                <h3 className="text-lg font-black text-neutral-900 uppercase tracking-tight flex items-center gap-2">
                  <History className="h-5 w-5 text-neutral-400" />
                  Extrato de Movimentações
                </h3>
                {loadingTab ? (
                  <div className="p-10 flex justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div></div>
                ) : extratoList.length > 0 ? (
                  <div className="space-y-2">
                    {extratoList.map(item => {
                      const info = formatLancamentoDescricao(item.descricao);
                      return (
                        <div key={item.id} className="flex items-center justify-between p-4 rounded-xl bg-white ring-1 ring-neutral-200 hover:shadow-sm transition-all group">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${item.tipo === 'entrada' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                              {item.tipo === 'entrada' ? <Plus className="h-4 w-4" /> : <Trash2 className="h-4 w-4 opacity-50" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs font-black text-neutral-900 uppercase tracking-tight">{info.titulo}</p>
                                {info.autor && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-neutral-100 text-neutral-600">
                                    {info.autor}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{formatDateTime(item.data)}</p>
                            </div>
                          </div>
                          <p className={`font-black text-sm tracking-tight ${item.tipo === 'entrada' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {item.tipo === 'entrada' ? '+' : '-'} {formatCurrency(item.valor)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10 bg-white rounded-3xl border border-dashed border-neutral-200 italic text-neutral-300 font-bold uppercase text-xs">Sem transações registradas</div>
                )}
              </div>
            </div>
          )}

          {tab === 'carteira_pontos' && (
            <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className={`rounded-3xl sm:rounded-[2.5rem] p-5 sm:p-8 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sm:gap-6 ${cliente.pontos_bloqueados ? 'bg-red-600 shadow-red-600/20' : 'bg-gradient-to-br from-indigo-500 to-violet-600 shadow-violet-600/20'}`}>
                <div className="text-left">
                  <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest opacity-70 mb-1">Pontuação Acumulada {cliente.pontos_bloqueados && '(BLOQUEADO)'}</p>
                  <p className="text-3xl sm:text-5xl font-black tracking-tighter">{(cliente.saldo_pontos || 0).toLocaleString('pt-BR')} <span className="text-lg sm:text-xl opacity-60">pts</span></p>
                  <div className="mt-3 sm:mt-4 flex flex-wrap items-center gap-2">
                    <button 
                      onClick={() => setIsAddingPoints(true)}
                      className="flex items-center gap-2 rounded-xl bg-white/20 px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-white backdrop-blur-md hover:bg-white/30 transition-all"
                    >
                      <Gift className="h-3 w-3" />
                      Ajustar Pontos
                    </button>
                    <div className="bg-white/10 p-0.5 rounded-full backdrop-blur-sm flex items-center justify-center">
                      <AdminWhatsAppButton 
                        telefone={cliente.telefone}
                        mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                          tipo: 'carteira_pontos',
                          clienteNome: cliente.nome,
                          valorTotal: (cliente.saldo_pontos || 0).toLocaleString('pt-BR')
                        })}
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleToggleBlockPoints}
                  className={`w-full md:w-auto rounded-xl sm:rounded-2xl px-5 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all ${cliente.pontos_bloqueados ? 'bg-white text-red-600 hover:bg-neutral-50' : 'bg-red-500 text-white hover:bg-red-700 shadow-lg shadow-red-900/20'}`}
                >
                  {cliente.pontos_bloqueados ? 'Desbloquear Pontos' : 'Bloquear Pontos'}
                </button>
              </div>

              {cliente.pontos_bloqueados && cliente.motivo_bloqueio_pontos && (
                <div className="rounded-xl sm:rounded-2xl bg-red-50 p-4 ring-1 ring-red-200 text-left">
                  <p className="text-[9px] sm:text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Motivo do Bloqueio:</p>
                  <p className="text-xs sm:text-sm text-red-800 italic font-medium">"{cliente.motivo_bloqueio_pontos}"</p>
                </div>
              )}

              <Modal
                isOpen={isAddingPoints}
                onClose={() => setIsAddingPoints(false)}
                title={`AJUSTE DE PONTOS - ${cliente.nome || (cliente as any).nome_razao || 'Cliente'}`}
                size="wide"
              >
                <div className="bg-[#1a1a1a] px-4 sm:px-5 py-4 sm:py-6 -mx-4 -mt-4 mb-4 border-b border-white/5 relative overflow-hidden rounded-t-xl sm:rounded-t-2xl">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>
                    <div className="relative z-10 flex items-center gap-3 sm:gap-4 text-left">
                        <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-transform">
                            <Gift className="h-5 w-5 sm:h-6 sm:w-6" />
                        </div>
                        <div>
                            <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight">
                                AJUSTE DE PONTOS
                            </h2>
                            <p className="text-[8px] sm:text-[9px] font-black text-indigo-400 uppercase tracking-widest mt-0.5">
                                {cliente.nome || (cliente as any).nome_razao || 'Cliente'}
                            </p>
                        </div>
                    </div>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); handleAddPoints(); }} className="space-y-3 sm:space-y-4 pt-1 sm:pt-2">
                  <div className="flex gap-2 p-1 bg-neutral-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setPointsType('adicao')}
                      className={`flex-1 py-2.5 sm:py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-lg transition-all ${pointsType === 'adicao' ? 'bg-white shadow-sm text-emerald-600' : 'text-neutral-500 hover:text-neutral-700'}`}
                    >
                      Adicionar (+)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPointsType('remocao')}
                      className={`flex-1 py-2.5 sm:py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-lg transition-all ${pointsType === 'remocao' ? 'bg-white shadow-sm text-red-600' : 'text-neutral-500 hover:text-neutral-700'}`}
                    >
                      Remover (-)
                    </button>
                  </div>

                  <div className="text-left">
                    <label className="mb-1.5 sm:mb-2 block text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Quantidade de Pontos *</label>
                    <input 
                      type="number"
                      required
                      placeholder="0"
                      value={pointsAmount}
                      inputMode="numeric"
onChange={(e) => setPointsAmount(e.target.value)}
                      className="w-full rounded-xl sm:rounded-2xl bg-neutral-50 border-transparent px-4 sm:px-5 py-3.5 sm:py-4 text-xl sm:text-2xl font-black text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                    />
                  </div>

                  <div className="text-left">
                    <label className="mb-1.5 sm:mb-2 block text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Motivo do Ajuste *</label>
                    <textarea
                      required
                      rows={2}
                      placeholder="Ex: Bonificação de Fidelidade, Campanha Promocional..."
                      value={pointsDescription}
                      onChange={e => setPointsDescription(e.target.value)}
                      className="w-full rounded-xl sm:rounded-2xl bg-neutral-50 border-transparent px-4 sm:px-5 py-3.5 sm:py-4 text-xs sm:text-sm font-bold text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-neutral-300 transition-all outline-none ring-1 ring-neutral-200 resize-none"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-2 sm:pt-4">
                    <button 
                      type="button" 
                      onClick={() => setIsAddingPoints(false)} 
                      className="order-2 sm:order-1 w-full sm:flex-1 rounded-xl sm:rounded-2xl border border-neutral-200 py-3.5 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-neutral-500 hover:bg-neutral-50 transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit" 
                      disabled={isProcessingPoints}
                      className={`order-1 sm:order-2 w-full sm:flex-1 rounded-xl sm:rounded-2xl py-3.5 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-white shadow-lg transition-all ${pointsType === 'adicao' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' : 'bg-red-600 hover:bg-red-700 shadow-red-600/20'} disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isProcessingPoints ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </form>
              </Modal>

              <div className="space-y-4">
                <h3 className="text-lg font-black text-neutral-900 uppercase tracking-tight flex items-center gap-2">
                  <History className="h-5 w-5 text-neutral-400" />
                  Histórico de Pontos
                </h3>
                {loadingTab ? (
                  <div className="p-10 flex justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div></div>
                ) : extratoPontosList.length > 0 ? (
                  <div className="space-y-2">
                    {extratoPontosList.map(item => {
                      const info = formatLancamentoDescricao(item.descricao);
                      return (
                        <div key={item.id} className="flex items-center justify-between p-4 rounded-xl bg-white ring-1 ring-neutral-200 hover:shadow-sm transition-all group">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${item.pontos > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                              <Gift className="h-4 w-4 opacity-70" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs font-black text-neutral-900 uppercase tracking-tight">{info.titulo}</p>
                                {info.autor && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-neutral-100 text-neutral-600">
                                    {info.autor}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{formatDateTime(item.data)}</p>
                            </div>
                          </div>
                          <p className={`font-black text-sm tracking-tight ${item.pontos > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {item.pontos > 0 ? '+' : ''}{item.pontos.toLocaleString('pt-BR')} <span className="text-[10px]">pts</span>
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10 bg-white rounded-3xl border border-dashed border-neutral-200 italic text-neutral-300 font-bold uppercase text-xs">Sem movimentações de pontos</div>
                )}
              </div>
            </div>
          )}

          {tab === 'documentos' && (
            <div className="animate-in fade-in slide-in-from-right-4">
              <AdminClienteDocumentos 
                clienteId={cliente.id} 
                clienteNome={cliente.nome}
                clienteTelefone={cliente.telefone}
              />
            </div>
          )}
        </div>
      </div>

      <Modal 
        isOpen={isReasonModalOpen} 
        onClose={() => setIsReasonModalOpen(false)} 
        title={`Motivo do Bloqueio - ${blockingType === 'cadastro' ? 'Cadastro' : blockingType === 'carteira' ? 'Carteira Digital' : 'Carteira de Pontos'}`}
        size="wide"
      >
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-red-50 p-4 rounded-2xl flex items-start gap-3 ring-1 ring-red-100 text-left">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <p className="text-[11px] sm:text-xs text-red-800 font-medium leading-relaxed">
              Informe detalhadamente o motivo deste bloqueio. Esta informação será enviada como notificação para o cliente e ficará registrada no perfil dele.
            </p>
          </div>
          <div className="space-y-2 text-left">
            <label className="text-[9px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Descrição do Bloqueio</label>
            <textarea
              rows={3}
              value={blockingReason}
              onChange={(e) => setBlockingReason(e.target.value)}
              placeholder="Ex: Identificado comportamento suspeito..."
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold focus:border-red-500 focus:ring-4 focus:ring-red-500/5 focus:outline-none transition-all"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => setIsReasonModalOpen(false)}
              className="order-2 sm:order-1 w-full sm:flex-1 rounded-xl border border-neutral-200 py-3.5 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-neutral-500 hover:bg-neutral-50 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={confirmBlocking}
              disabled={!blockingReason.trim()}
              className="order-1 sm:order-2 w-full sm:flex-1 rounded-xl bg-red-600 py-3.5 sm:py-4 text-[10px] sm:text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-red-600/30 hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirmar Bloqueio
            </button>
          </div>
        </div>
      </Modal>

      {/* Modais de Detalhes das Ordens no Perfil do Cliente */}
      <Modal isOpen={isOSModalOpen} onClose={() => setIsOSModalOpen(false)} title="Detalhes da Ordem de Serviço" size="full">
        <div className="max-w-6xl mx-auto py-8">
          {selectedOS && (
            <OSDetails 
              os={selectedOS} 
              onCancel={() => {
                 toast.error("Para cancelar, utilize o módulo 'Ordens de Serviço'.");
              }}
              onFinalized={() => {
                setIsOSModalOpen(false);
              }}
            />
          )}
        </div>
      </Modal>

      <Modal isOpen={isCompraModalOpen} onClose={() => setIsCompraModalOpen(false)} title="Detalhes da Ordem de Compra" size="wide">
        {selectedCompra && (
          <CompraDetails 
            ordem={selectedCompra} 
            showActions={false}
          />
        )}
      </Modal>

      <Modal isOpen={isAssinaturaModalOpen} onClose={() => setIsAssinaturaModalOpen(false)} title="Detalhes da Ordem de Assinatura" size="wide">
        {selectedAssinatura && (
          <AssinaturaDetails 
            ordem={selectedAssinatura}
            activeTab={selectedAssinatura.status === 'em_analise' ? 'processamento' : 'concluido'}
          />
        )}
      </Modal>

      <Modal isOpen={isFaturaModalOpen} onClose={() => setIsFaturaModalOpen(false)} title="Detalhes da Fatura" size="full">
        <div className="max-w-6xl mx-auto py-4 sm:py-8">
          {selectedFatura && (
            <FaturaDetails 
              fatura={selectedFatura} 
              onManualPay={handleManualPaymentFatura}
              onEnviarParaCobranca={handleEnviarParaCobrancaFatura}
              onCancel={() => {
                toast.error("Para cancelar faturas com registro definitivo, utilize o módulo 'Financeiro'.");
              }}
              colaboradorId={colaboradorId}
              colaboradorNome={colaboradorNome}
            />
          )}
        </div>
      </Modal>

    </div>
  );
}
