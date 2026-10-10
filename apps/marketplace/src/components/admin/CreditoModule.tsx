import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate, formatDateTime } from '../../lib/utils';
import { toast } from 'react-hot-toast';
import { notificationService } from '../../lib/notificationService';
import { 
  Landmark, 
  FileText, 
  Upload, 
  CheckCircle, 
  XCircle, 
  Clock, 
  History, 
  User, 
  Search, 
  DollarSign, 
  AlertCircle, 
  CheckCircle2,
  FileCheck,
  Percent,
  TrendingUp,
  Settings,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Send,
  X,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AdminWhatsAppButton } from './ui/AdminWhatsAppButton';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { sessionService } from '../../lib/sessionService';
import { callAdminRpc } from '../../lib/adminRpc';
import { useConfirm } from '../../hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { uploadFile, getPublicFileUrl } from '../../lib/storage';

type CreditoSubTab = 'analise' | 'documentos_pendentes' | 'contrato_pendente_assinatura' | 'contrato_assinado' | 'liberado' | 'negado';

const getAdminSessionForRpc = () => {
  const session = sessionService.getCurrentSession();
  if (!session?.sessaoId || !session?.sessionToken) {
    throw new Error('Sessao administrativa expirada. Faca login novamente.');
  }
  return session;
};

export function CreditoModule({ 
  colaboradorNome,
  initialItemId
}: { 
  colaboradorNome?: string;
  initialItemId?: string;
}) {
  const [activeTab, setActiveTab] = useState<'solicitacoes' | 'carteira' | 'movimentacoes' | 'quitacoes'>('solicitacoes');
  const [activeSubTab, setActiveSubTab] = useState<CreditoSubTab>('analise');
  const confirmHook = useConfirm();

  useEffect(() => {
    let isMounted = true;
    if (initialItemId) {
      const loadInitialRequest = async () => {
        try {
          const { data, error } = await supabase
            .from('loja_credito_solicitacoes')
            .select('*, clientes(id, nome, email, telefone, cpf, cnpj, tipo_pessoa, cep, endereco, numero, bairro, cidade, estado)')
            .eq('id', initialItemId)
            .maybeSingle();

          if (error) throw error;
          if (data && isMounted) {
            setActiveTab('solicitacoes');
            if (data.status) {
              setActiveSubTab(data.status as CreditoSubTab);
            }
            
            setSelectedRequest(data);
            const docs = await loadRequestDocs(data.id);
            if (isMounted) {
              setSelectedRequest((prev: any) => prev ? { ...prev, documentos: docs } : null);
              setShowRequestDetail(true);
              
              setLimiteAprovado(data.limite_aprovado?.toString() || data.limite_solicitado?.toString() || '');
              setOpcaoParcelado(!!data.opcao_pagamento_parcelado);
              setMaxParcelas(data.max_parcelas || 12);
              if (data.contrato_url) setContratoUrl(data.contrato_url);
            }
          }
        } catch (err) {
          console.error('Erro ao carregar solicitação inicial da notificação:', err);
        }
      };
      loadInitialRequest();
    }
    return () => { isMounted = false; };
  }, [initialItemId]);
  
  // Lists
  const [solicitacoes, setSolicitacoes] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<any[]>([]);
  const [quitacoes, setQuitacoes] = useState<any[]>([]);
  
  // Selected detail
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [selectedCliente, setSelectedCliente] = useState<any | null>(null);
  const [selectedMovimentacao, setSelectedMovimentacao] = useState<any | null>(null);
  const [selectedClientMovs, setSelectedClientMovs] = useState<any | null>(null);
  const [selectedQuitacao, setSelectedQuitacao] = useState<any | null>(null);
  
  // Loading & states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [ledgerMonthFilter, setLedgerMonthFilter] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  
  // Action Modals / forms
  const [showRequestDetail, setShowRequestDetail] = useState(false);
  const [showClienteDetail, setShowClienteDetail] = useState(false);
  const [showMovimentacaoDetail, setShowMovimentacaoDetail] = useState(false);
  const [showClientLedgerModal, setShowClientLedgerModal] = useState(false);
  
  // Form fields for analysis review
  const [limiteAprovado, setLimiteAprovado] = useState('');
  const [opcaoParcelado, setOpcaoParcelado] = useState(false);
  const [maxParcelas, setMaxParcelas] = useState(12);
  const [contratoUrl, setContratoUrl] = useState('https://documentos.grupo-gsa.com/modelos/contrato_abertura_credito_gsa.pdf');
  const [contratoFile, setContratoFile] = useState<File | null>(null);
  const [motivoNegacao, setMotivoNegacao] = useState('');
  const [diasLockout, setDiasLockout] = useState('30');
  
  // Document Request Form
  const [docNome, setDocNome] = useState('');
  const [docObs, setDocObs] = useState('');
  const [solicitandoDocumento, setSolicitandoDocumento] = useState(false);
  
  // Manual Limit Change Form
  const [novoLimiteTotal, setNovoLimiteTotal] = useState('');
  const [ajusteDescricao, setAjusteDescricao] = useState('');

  // Juros do Crédito GSA
  const [jurosAvista, setJurosAvista] = useState('20');
  const [jurosParcelado, setJurosParcelado] = useState('50');
  const [savingSettings, setSavingSettings] = useState(false);

  // Quitacao de Credito
  const [valorQuitacao, setValorQuitacao] = useState('');
  const [showQuitacaoDetail, setShowQuitacaoDetail] = useState(false);
  const [totalQuitacaoFaturas, setTotalQuitacaoFaturas] = useState<number | null>(null);

const enviarOfertaQuitacao = async () => {
    if (!selectedQuitacao || !valorQuitacao) {
      toast.error('Informe o valor da oferta de quitacao.');
      return;
    }
    const v = parseFloat(valorQuitacao.replace(/[^\d.-]/g, ''));
    if (isNaN(v) || v <= 0) {
      toast.error('Valor invalido.');
      return;
    }
    setSubmitting(true);
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_enviar_oferta_quitacao_credito', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_orcamento_id: selectedQuitacao.id,
        p_valor_quitacao_acordo: v
      });

      if (error) throw error;

      if (!data?.already_processed) {
        await notificationService.notifyClient(
          selectedQuitacao.cliente_id,
          'Oferta de Quitacao de Credito',
          `Uma nova oferta de quitacao para o pedido #${selectedQuitacao.codigo_orcamento} foi enviada.`,
          'credito_loja',
          'cobranca_quitacao'
        );
      }

      toast.success(data?.already_processed ? 'Esta quitacao ja possui uma oferta enviada.' : 'Oferta de quitacao enviada ao cliente com sucesso!');
      setShowQuitacaoDetail(false);
      fetchQuitacoes();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao enviar oferta.');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .in('key', ['loja_credito_juros_avista', 'loja_credito_juros_parcelado']);
        
      if (error) throw error;
      if (data) {
        const av = data.find(s => s.key === 'loja_credito_juros_avista');
        const pa = data.find(s => s.key === 'loja_credito_juros_parcelado');
        if (av) setJurosAvista(av.value);
        if (pa) setJurosParcelado(pa.value);
      }
    } catch (err) {
      console.error('Erro ao carregar configurações de juros:', err);
      toast.error('Erro ao carregar taxas de juros.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const success = await callAdminRpc<boolean>('gsa_admin_upsert_settings', {
        p_settings: [
          { key: 'loja_credito_juros_avista', value: jurosAvista },
          { key: 'loja_credito_juros_parcelado', value: jurosParcelado }
        ]
      });

      if (!success) throw new Error('Acesso negado ou erro ao salvar');
      toast.success('Configurações de juros salvas com sucesso!');
      fetchSettings();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao salvar configurações de juros.');
    } finally {
      setSavingSettings(false);
    }
  };

  const fetchSolicitacoes = async (isMounted = true) => {
    if (isMounted) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('loja_credito_solicitacoes')
        .select('*, clientes(id, nome, email, telefone, cpf, cnpj)')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      if (data && isMounted) setSolicitacoes(data);
    } catch (err) {
      console.error('Erro ao buscar solicitações de crédito:', err);
    } finally {
      if (isMounted) setLoading(false);
    }
  };

  const fetchClientes = async (isMounted = true) => {
    if (isMounted) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome, email, telefone, cpf, cnpj, tipo_pessoa, limite_credito_total, limite_credito_disponivel, opcao_pagamento_parcelado, max_parcelas')
        .or('limite_credito_total.gt.0,limite_credito_disponivel.gt.0')
        .order('nome', { ascending: true });
        
      if (error) throw error;
      if (data && isMounted) setClientes(data || []);
    } catch (err) {
      console.error('Erro ao buscar clientes com limite de crédito:', err);
    } finally {
      if (isMounted) setLoading(false);
    }
  };

  const fetchMovimentacoes = async (isMounted = true) => {
    if (isMounted) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('loja_credito_movimentacoes')
        .select('*, clientes(id, nome, email, telefone, cpf, cnpj)')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      if (data && isMounted) setMovimentacoes(data);
    } catch (err) {
      console.error('Erro ao buscar movimentações de crédito:', err);
    } finally {
      if (isMounted) setLoading(false);
    }
  };

  const fetchQuitacoes = async (isMounted = true) => {
    if (isMounted) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('loja_credito_movimentacoes')
        .select('*, clientes(id, nome, email, telefone, cpf, cnpj)')
        .eq('tipo', 'saida')
        .eq('status', 'quitado')
        .order('updated_at', { ascending: false });
        
      if (error) throw error;
      if (data && isMounted) setQuitacoes(data);
    } catch (err) {
      console.error('Erro ao buscar quitações de crédito:', err);
    } finally {
      if (isMounted) setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (activeTab === 'solicitacoes') {
      fetchSolicitacoes(isMounted);
    } else if (activeTab === 'carteira') {
      fetchClientes(isMounted);
    } else if (activeTab === 'movimentacoes') {
      fetchMovimentacoes(isMounted);
    } else if (activeTab === 'quitacoes') {
      fetchQuitacoes(isMounted);
    } else if (activeTab === ('configuracoes' as any)) {
      fetchSettings();
    }

    // Configura canal de realtime para o painel administrativo
    const channel = supabase
      .channel('admin-credito-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loja_credito_solicitacoes' },
        async (payload: any) => {
          fetchSolicitacoes();
          
          if (selectedRequest && (payload.new?.id === selectedRequest.id || payload.old?.id === selectedRequest.id)) {
            // Recarrega os dados completos da solicitação selecionada
            const { data } = await supabase
              .from('loja_credito_solicitacoes')
              .select('*, clientes(id, nome, email, telefone, cpf, cnpj, tipo_pessoa, cep, endereco, numero, bairro, cidade, estado)')
              .eq('id', selectedRequest.id)
              .single();
            if (data) {
              const docs = await loadRequestDocs(selectedRequest.id);
              setSelectedRequest({ ...data, documentos: docs });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loja_credito_documentos' },
        async (payload: any) => {
          if (selectedRequest && (payload.new?.solicitacao_id === selectedRequest.id || payload.old?.solicitacao_id === selectedRequest.id)) {
            const docs = await loadRequestDocs(selectedRequest.id);
            setSelectedRequest((prev: any) => prev ? { ...prev, documentos: docs } : null);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loja_credito_movimentacoes' },
        () => {
          fetchMovimentacoes();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clientes' },
        () => {
          fetchClientes();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [activeTab, activeSubTab, selectedRequest]);

  // Load request documents & history helper
  const loadRequestDocs = async (reqId: string) => {
    try {
      const { data: docs } = await supabase
        .from('loja_credito_documentos')
        .select('*')
        .eq('solicitacao_id', reqId)
        .order('created_at', { ascending: true });
      return docs || [];
    } catch (err) {
      console.error('Erro ao buscar documentos da solicitação:', err);
      return [];
    }
  };

  const handleOpenRequest = async (req: any) => {
    setSelectedRequest(req);
    const docs = await loadRequestDocs(req.id);
    setSelectedRequest((prev: any) => ({ ...prev, documentos: docs }));
    
    // Set initial values
    setLimiteAprovado(req.limite_aprovado?.toString() || req.limite_solicitado?.toString() || '');
    setOpcaoParcelado(req.opcao_pagamento_parcelado || false);
    setMaxParcelas(req.max_parcelas || 12);
    if (req.contrato_url) setContratoUrl(req.contrato_url);
    setContratoFile(null);
    setMotivoNegacao(req.motivo_negacao || '');
    
    setShowRequestDetail(true);
  };

  // Admin Actions on Request
  const handlePreAprovar = async () => {
    if (!selectedRequest) return;
    const valorAprovado = parseFloat(limiteAprovado);
    if (isNaN(valorAprovado) || valorAprovado <= 0) {
      toast.error('Informe um valor de limite aprovado valido.');
      return;
    }
    if (!contratoFile && !selectedRequest.contrato_url) {
      toast.error('Faca o upload do contrato de abertura de credito.');
      return;
    }

    setSubmitting(true);
    try {
      let finalContratoUrl = selectedRequest.contrato_url;

      if (contratoFile) {
        const sanitizedName = contratoFile.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9.-]/g, '_').toLowerCase();
        const uploadPath = `credito_modelos/${selectedRequest.id}/${Date.now()}-${sanitizedName}`;
        const { url: uploadedUrl, path: uploadedPath } = await uploadFile(contratoFile, 'gsa-private-documents', uploadPath);
        finalContratoUrl = uploadedUrl ?? getPublicFileUrl(uploadedPath);
      }

      const session = getAdminSessionForRpc();
      const { error } = await supabase.rpc('gsa_admin_preaprovar_credito', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_solicitacao_id: selectedRequest.id,
        p_limite_aprovado: valorAprovado,
        p_opcao_pagamento_parcelado: opcaoParcelado,
        p_max_parcelas: maxParcelas,
        p_contrato_url: finalContratoUrl
      });

      if (error) throw error;

      await notificationService.notifyClient(
        selectedRequest.cliente_id,
        'Credito Pre-Aprovado!',
        `Sua solicitacao de credito de R$ ${valorAprovado.toFixed(2)} foi pre-aprovada. Assine o contrato digital para ativar seu limite.`,
        'credito_loja',
        'cadastro_aprovado'
      );

      toast.success('Solicitacao pre-aprovada! Contrato enviado ao cliente.');
      setShowRequestDetail(false);
      fetchSolicitacoes();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao pre-aprovar solicitacao.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAprovarAumentoDireto = async () => {
    if (!selectedRequest) return;
    const valorAprovado = parseFloat(limiteAprovado);
    if (isNaN(valorAprovado) || valorAprovado <= 0) {
      toast.error('Informe um valor de limite aprovado valido.');
      return;
    }

    setSubmitting(true);
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_aprovar_aumento_credito', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_solicitacao_id: selectedRequest.id,
        p_limite_aprovado: valorAprovado
      });

      if (error) throw error;

      await notificationService.notifyClient(
        selectedRequest.cliente_id,
        'Aumento de Limite Aprovado!',
        `Sua solicitacao de aumento de limite foi aprovada! Seu novo limite total e de R$ ${valorAprovado.toFixed(2)}.`,
        'credito_loja',
        'cliente_ativado'
      );

      toast.success(data?.already_processed ? 'Aumento de limite ja estava liberado.' : 'Aumento de limite aprovado e liberado!');
      setShowRequestDetail(false);
      fetchSolicitacoes();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao aprovar aumento de limite.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecusar = async () => {
    if (!selectedRequest) return;
    if (!motivoNegacao) {
      toast.error('Forneca uma justificativa para a recusa.');
      return;
    }

    setSubmitting(true);
    try {
      const lockDate = new Date();
      lockDate.setDate(lockDate.getDate() + parseInt(diasLockout));
      const session = getAdminSessionForRpc();

      const { error } = await supabase.rpc('gsa_admin_recusar_credito', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_solicitacao_id: selectedRequest.id,
        p_motivo: motivoNegacao,
        p_nova_tentativa_apos: lockDate.toISOString().split('T')[0]
      });

      if (error) throw error;

      await notificationService.notifyClient(
        selectedRequest.cliente_id,
        'Solicitacao de Credito Recusada',
        `Infelizmente sua analise de credito foi recusada. Motivo: ${motivoNegacao}. Nova tentativa liberada em ${formatDate(lockDate.toISOString())}`,
        'credito_loja',
        'cadastro_bloqueado'
      );

      toast.success('Solicitacao recusada.');
      setShowRequestDetail(false);
      fetchSolicitacoes();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao recusar solicitacao.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSolicitarDocumento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !docNome) return;

    setSubmitting(true);
    try {
      const session = getAdminSessionForRpc();
      const { error } = await supabase.rpc('gsa_admin_solicitar_documento_credito', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_solicitacao_id: selectedRequest.id,
        p_nome_documento: docNome,
        p_observacao: docObs || null
      });

      if (error) throw error;

      await notificationService.notifyClient(
        selectedRequest.cliente_id,
        'Acao Necessaria: Envio de Documento',
        `Para prosseguirmos com a analise de credito, envie o documento: ${docNome}`,
        'credito_loja',
        'documento_solicitado'
      );

      toast.success('Documento solicitado com sucesso!');
      setDocNome('');
      setDocObs('');
      setSolicitandoDocumento(false);

      const docs = await loadRequestDocs(selectedRequest.id);
      setSelectedRequest((prev: any) => ({ ...prev, documentos: docs }));
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao solicitar documento.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDocumentoStatus = async (docId: string, status: 'aprovado' | 'rejeitado') => {
    if (!selectedRequest) return;

    let motivo = '';
    if (status === 'rejeitado') {
      const inputMotivo = await confirmHook.confirm({
        title: 'Rejeitar Documento',
        message: 'Informe o motivo da rejeição. O cliente receberá esta mensagem.',
        confirmLabel: 'Rejeitar Documento',
        variant: 'warning',
        promptLabel: 'Motivo da rejeição',
        promptPlaceholder: 'Ex: Documento ilegível, fora do prazo de validade...',
        promptRequired: true,
      });
      if (!inputMotivo || typeof inputMotivo !== 'string') return;
      motivo = inputMotivo;
    }

    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_atualizar_documento_credito', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_documento_id: docId,
        p_status: status,
        p_observacao: status === 'rejeitado' ? motivo : null
      });

      if (error) throw error;

      const nomeDocumento = data?.nome_documento || 'Documento Adicional';
      toast.success(`Documento ${status === 'aprovado' ? 'aprovado' : 'rejeitado'}!`);

      await notificationService.notifyClient(
        selectedRequest.cliente_id,
        status === 'aprovado' ? 'Documento de Credito Aprovado' : 'Documento de Credito Rejeitado',
        status === 'aprovado'
          ? `Seu documento de limite de credito ("${nomeDocumento}") foi aprovado.`
          : `Seu documento de limite de credito ("${nomeDocumento}") foi rejeitado. Motivo: ${motivo}. Por favor, envie novamente.`,
        'credito_loja',
        status === 'aprovado' ? 'documento_credito_aprovado' : 'documento_credito_rejeitado',
        { tab: 'credito' }
      );

      const docs = await loadRequestDocs(selectedRequest.id);
      setSelectedRequest((prev: any) => ({ ...prev, documentos: docs }));
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao atualizar status do documento.');
    }
  };

  const handleRejeitarContrato = async () => {
    if (!selectedRequest) return;

    const inputMotivo = await confirmHook.confirm({
      title: 'Rejeitar Assinatura do Contrato',
      message: 'Informe o motivo da rejeição. O cliente receberá esta mensagem e deverá enviar o contrato novamente.',
      confirmLabel: 'Rejeitar Contrato',
      variant: 'danger',
      promptLabel: 'Motivo da rejeição',
      promptPlaceholder: 'Ex: Assinatura ilegível, documento incompleto...',
      promptRequired: true,
    });
    if (!inputMotivo || typeof inputMotivo !== 'string') return;

    const motivo = inputMotivo;

    setSubmitting(true);
    try {
      const session = getAdminSessionForRpc();
      const { error } = await supabase.rpc('gsa_admin_rejeitar_contrato_credito', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_solicitacao_id: selectedRequest.id,
        p_motivo: motivo
      });

      if (error) throw error;

      await notificationService.notifyClient(
        selectedRequest.cliente_id,
        'Assinatura de Contrato Rejeitada',
        `A assinatura do seu contrato de credito foi rejeitada. Motivo: ${motivo}. Por favor, envie novamente no portal.`,
        'credito_loja',
        'contrato_rejeitado',
        { tab: 'credito' }
      );

      toast.success('Assinatura do contrato rejeitada com sucesso!');
      setShowRequestDetail(false);
      fetchSolicitacoes();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao rejeitar assinatura do contrato.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReenviarContrato = async () => {
    if (!selectedRequest) return;
    
    const ok = await confirmHook.confirm({
      title: 'Reenviar Lembrete de Assinatura?',
      message: 'O cliente receberá uma notificação para assinar o contrato de crédito pendente.',
      confirmLabel: 'Sim, reenviar',
      variant: 'info',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      await notificationService.notifyClient(
        selectedRequest.cliente_id,
        'Ação Necessária: Assinatura de Contrato Pendente ✍️',
        'Lembrete: O seu contrato de crédito foi gerado e está aguardando a sua assinatura digital no portal.',
        'credito_loja',
        'documento_solicitado',
        { tab: 'credito' }
      );

      toast.success('Lembrete de assinatura reenviado com sucesso!');
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao notificar o cliente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAprovarContratoELiberar = async () => {
    if (!selectedRequest) return;

    setSubmitting(true);
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_liberar_credito_contrato', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_solicitacao_id: selectedRequest.id
      });

      if (error) throw error;

      const limiteNovoTotal = Number(data?.limite_total_novo || selectedRequest.limite_aprovado || 0);

      await notificationService.notifyClient(
        selectedRequest.cliente_id,
        'Credito Ativado com Sucesso!',
        `Seu limite de credito de R$ ${limiteNovoTotal.toFixed(2)} ja esta liberado para uso na GSA Store.`,
        'credito_loja',
        'cliente_ativado'
      );

      toast.success(data?.already_processed ? 'Credito ja estava liberado.' : 'Credito liberado com sucesso!');
      setShowRequestDetail(false);
      fetchSolicitacoes();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao aprovar e liberar credito.');
    } finally {
      setSubmitting(false);
    }
  };

  // Carteira Dynamic Manual Adjustments
  const handleOpenCliente = (cli: any) => {
    setSelectedCliente(cli);
    setNovoLimiteTotal(cli.limite_credito_total?.toString() || '0');
    setAjusteDescricao('');
    setShowClienteDetail(true);
  };

  const handleSalvarAjusteManual = async () => {
    if (!selectedCliente) return;
    const novoTotal = parseFloat(novoLimiteTotal);
    if (isNaN(novoTotal) || novoTotal < 0) {
      toast.error('Insira um limite total valido.');
      return;
    }
    if (!ajusteDescricao) {
      toast.error('Forneca uma descricao ou justificativa para este ajuste manual.');
      return;
    }

    setSubmitting(true);
    try {
      const session = getAdminSessionForRpc();
      const { error } = await supabase.rpc('gsa_admin_ajustar_limite_credito_cliente', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cliente_id: selectedCliente.id,
        p_novo_limite_total: novoTotal,
        p_descricao: ajusteDescricao
      });

      if (error) throw error;

      await notificationService.notifyClient(
        selectedCliente.id,
        'Ajuste de Limite de Credito',
        `Seu limite total de credito foi ajustado para R$ ${novoTotal.toFixed(2)}.`,
        'credito_loja',
        'ajuste_saldo'
      );

      toast.success('Limite atualizado com sucesso!');
      setShowClienteDetail(false);
      fetchClientes();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao ajustar limite.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleParcelamentoCliente = async (cli: any) => {
    try {
      const newVal = !cli.opcao_pagamento_parcelado;
      const session = getAdminSessionForRpc();
      const { error } = await supabase.rpc('gsa_admin_definir_parcelamento_credito', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cliente_id: cli.id,
        p_opcao_pagamento_parcelado: newVal
      });

      if (error) throw error;
      toast.success(`Parcelamento ${newVal ? 'ativado' : 'desativado'} para o cliente!`);
      fetchClientes();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Erro ao alterar opcao de parcelamento.');
    }
  };

  const groupedClientsForLedger = React.useMemo(() => {
    const map: Record<string, any> = {};
    movimentacoes.forEach(m => {
      if (!m.cliente_id) return;
      if (!map[m.cliente_id]) {
        map[m.cliente_id] = {
          cliente_id: m.cliente_id,
          nome: m.clientes?.nome || 'N/A',
          cpf: m.clientes?.cpf,
          cnpj: m.clientes?.cnpj,
          tipo_pessoa: m.clientes?.tipo_pessoa,
          movimentacoes: []
        };
      }
      map[m.cliente_id].movimentacoes.push(m);
    });
    return Object.values(map).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [movimentacoes]);

  const filteredLedgerClients = groupedClientsForLedger.filter(c => 
    c.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.cpf?.includes(searchQuery) ||
    c.cnpj?.includes(searchQuery)
  );

  const filteredSolicitacoes = solicitacoes.filter(s => 
    s.clientes?.nome?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.clientes?.cpf?.includes(searchQuery) ||
    s.clientes?.cnpj?.includes(searchQuery)
  );

  const filteredClientes = clientes.filter(c => 
    c.nome?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.cpf?.includes(searchQuery) ||
    c.cnpj?.includes(searchQuery)
  );

  const getQuitacaoBreakdown = () => {
    if (!selectedQuitacao || totalQuitacaoFaturas === null) return null;
    const total = Number(selectedQuitacao.total || 0);
    const acrescimo = Number(selectedQuitacao.acrescimo || 0);
    const principal = Math.max(0, total - acrescimo);
    
    const pctOriginal = total > 0 ? (principal / total) * 100 : 100;
    const pctJuros = total > 0 ? (acrescimo / total) * 100 : 0;
    
    const valorOriginalCredito = totalQuitacaoFaturas * (pctOriginal / 100);
    const valorJuros = totalQuitacaoFaturas * (pctJuros / 100);
    
    return {
      valorOriginalCredito,
      valorJuros,
      pctOriginal,
      pctJuros
    };
  };

  const quitacaoBreakdown = getQuitacaoBreakdown();

  return (
    <div className="space-y-6">
      <ConfirmDialog {...confirmHook} />
      {/* Tab Selector */}
      <div className="flex border-b border-neutral-100 pb-px">
        <button
          onClick={() => { setActiveTab('solicitacoes'); setSearchQuery(''); }}
          className={`flex items-center gap-2 py-4 px-6 font-bold text-xs uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'solicitacoes'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-neutral-400 hover:text-neutral-600'
          }`}
        >
          <Landmark className="w-4 h-4" />
          Solicitações
        </button>

        <button
          onClick={() => { setActiveTab('carteira'); setSearchQuery(''); }}
          className={`flex items-center gap-2 py-4 px-6 font-bold text-xs uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'carteira'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-neutral-400 hover:text-neutral-600'
          }`}
        >
          <User className="w-4 h-4" />
          Carteira de Limites
        </button>

        <button
          onClick={() => { setActiveTab('movimentacoes'); setSearchQuery(''); }}
          className={`flex items-center gap-2 py-4 px-6 font-bold text-xs uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'movimentacoes'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-neutral-400 hover:text-neutral-600'
          }`}
        >
          <History className="w-4 h-4" />
          Movimentações & Ledger
        </button>

        <button
          onClick={() => { setActiveTab('quitacoes'); setSearchQuery(''); }}
          className={`flex items-center gap-2 py-4 px-6 font-bold text-xs uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'quitacoes'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-neutral-400 hover:text-neutral-600'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Quitações
        </button>

        <button
          onClick={() => { setActiveTab('configuracoes' as any); setSearchQuery(''); }}
          className={`flex items-center gap-2 py-4 px-6 font-bold text-xs uppercase tracking-wider border-b-2 transition-all ${
            activeTab === ('configuracoes' as any)
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-neutral-400 hover:text-neutral-600'
          }`}
        >
          <Settings className="w-4 h-4" />
          Configuração de Juros
        </button>
      </div>

      {/* Main content grid */}
      <div className="space-y-4">
        {activeTab === 'solicitacoes' && (
          <>
            {/* Solicitações subtabs */}
            <div className="flex flex-wrap gap-2 p-1.5 bg-neutral-50 rounded-2xl border border-neutral-150/60 w-fit">
              {([
                { id: 'analise', label: 'Em Análise' },
                { id: 'documentos_pendentes', label: 'Docs Pendentes' },
                { id: 'contrato_pendente_assinatura', label: 'Pendente Contrato' },
                { id: 'contrato_assinado', label: 'Contrato Assinado' },
                { id: 'liberado', label: 'Liberados' },
                { id: 'negado', label: 'Recusados' }
              ] as { id: CreditoSubTab, label: string }[]).map(sub => (
                <button
                  key={sub.id}
                  onClick={() => { setActiveSubTab(sub.id); setSelectedRequest(null); }}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                    activeSubTab === sub.id
                      ? 'bg-white text-indigo-600 shadow-sm border border-neutral-200/50'
                      : 'text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            {/* Search Bar */}
            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-neutral-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por cliente, CPF ou CNPJ..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white border border-neutral-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* List */}
            {loading ? (
              <div className="flex justify-center py-20"><Clock className="w-8 h-8 text-indigo-600 animate-spin" /></div>
            ) : filteredSolicitacoes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredSolicitacoes.map(req => (
                  <div 
                    key={req.id} 
                    className="bg-white rounded-3xl border border-neutral-100 p-6 shadow-sm hover:shadow-md hover:border-neutral-200 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-4 mb-4">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500 block">
                            {req.tipo_solicitacao === 'adesao' ? 'Adesão Inicial' : 'Solicitação Aumento'}
                          </span>
                          <h4 className="text-sm font-bold text-neutral-900 mt-1">{req.clientes?.nome || 'Cliente não encontrado'}</h4>
                          <p className="text-[10px] text-neutral-400 font-bold mt-0.5">{req.clientes?.tipo_pessoa === 'pj' ? `CNPJ: ${req.clientes?.cnpj}` : `CPF: ${req.clientes?.cpf}`}</p>
                        </div>
                        <span className="text-[10px] text-neutral-400 font-bold block pt-1">{formatDate(req.created_at)}</span>
                      </div>
                      
                      <div className="bg-neutral-50/50 rounded-2xl p-4 border border-neutral-100/50 mb-6 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-neutral-400 font-semibold">Valor Desejado:</span>
                          <span className="font-bold text-neutral-800">{formatCurrency(req.limite_solicitado)}</span>
                        </div>
                        {req.limite_aprovado && (
                          <div className="flex justify-between text-xs border-t border-neutral-100 pt-2">
                            <span className="text-neutral-400 font-semibold">Valor Aprovado:</span>
                            <span className="font-black text-indigo-600">{formatCurrency(req.limite_aprovado)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleOpenRequest(req)}
                      className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-neutral-950 text-white text-[11px] font-black uppercase tracking-wider hover:bg-black transition-colors"
                    >
                      Analisar Solicitação
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 bg-white rounded-3xl border border-neutral-100">
                <p className="text-neutral-400 text-sm font-semibold">Nenhuma solicitação encontrada neste status.</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'carteira' && (
          <>
            {/* Search Bar */}
            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-neutral-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar na carteira..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white border border-neutral-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* List */}
            {loading ? (
              <div className="flex justify-center py-20"><Clock className="w-8 h-8 text-indigo-600 animate-spin" /></div>
            ) : filteredClientes.length > 0 ? (
              <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-neutral-50/50 border-b border-neutral-100">
                        <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Cliente</th>
                        <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Documento</th>
                        <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Limite Total</th>
                        <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Limite Disponível</th>
                        <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Parcelado</th>
                        <th className="px-6 py-4 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 text-sm font-bold text-neutral-600">
                      {filteredClientes.map(c => (
                        <tr key={c.id} className="hover:bg-neutral-50/30 transition-colors">
                          <td className="px-6 py-4 text-neutral-900">{c.nome}</td>
                          <td className="px-6 py-4 text-xs font-semibold text-neutral-500">{c.tipo_pessoa === 'pj' ? c.cnpj : c.cpf}</td>
                          <td className="px-6 py-4 text-neutral-900 font-extrabold">{formatCurrency(c.limite_credito_total || 0)}</td>
                          <td className="px-6 py-4">
                            <span className={c.limite_credito_disponivel <= 0 ? 'text-red-500 font-extrabold' : 'text-emerald-600 font-extrabold'}>
                              {formatCurrency(c.limite_credito_disponivel || 0)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              type="button"
                              onClick={() => handleToggleParcelamentoCliente(c)}
                              className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                                c.opcao_pagamento_parcelado 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                  : 'bg-neutral-100 text-neutral-500 border border-neutral-150'
                              }`}
                            >
                              {c.opcao_pagamento_parcelado ? `Sim (${c.max_parcelas || 12}x)` : 'Não'}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleOpenCliente(c)}
                              className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-neutral-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-black transition-colors"
                            >
                              Ajustar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 bg-white rounded-3xl border border-neutral-100">
                <p className="text-neutral-400 text-sm font-semibold">Nenhum cliente com crédito na carteira.</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'movimentacoes' && (
          <>
            {/* Search Bar */}
            <div className="relative max-w-md mb-4">
              <Search className="w-4 h-4 text-neutral-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar cliente no ledger..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white border border-neutral-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* List */}
            {loading ? (
              <div className="flex justify-center py-20"><Clock className="w-8 h-8 text-indigo-600 animate-spin" /></div>
            ) : filteredLedgerClients.length > 0 ? (
              <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-neutral-50/50 border-b border-neutral-100">
                        <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Cliente</th>
                        <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Documento</th>
                        <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Qtd. Operações</th>
                        <th className="px-6 py-4 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 text-xs font-bold text-neutral-500">
                      {filteredLedgerClients.map(c => (
                        <tr 
                          key={c.cliente_id} 
                          onClick={() => { setSelectedClientMovs(c); setShowClientLedgerModal(true); }}
                          className="hover:bg-neutral-50/30 transition-colors cursor-pointer"
                        >
                          <td className="px-6 py-4 text-neutral-900 font-extrabold">{c.nome}</td>
                          <td className="px-6 py-4 font-semibold text-neutral-500">{c.tipo_pessoa === 'pj' ? c.cnpj : c.cpf}</td>
                          <td className="px-6 py-4 text-neutral-500">{c.movimentacoes.length} registros</td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-indigo-600 font-bold uppercase text-[10px] tracking-wider hover:text-indigo-800">
                              Ver Ledger
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 bg-white rounded-3xl border border-neutral-100">
                <p className="text-neutral-400 text-sm font-semibold">Nenhum cliente com movimentação registrada.</p>
              </div>
            )}
          </>
        )}

        {activeTab === 'quitacoes' && (
          <>
            {/* Quitacoes list */}
            <div className="bg-white border border-neutral-100 rounded-[2rem] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#f8f7f5] text-[10px] font-semibold text-[#1a1a1a]/40 uppercase tracking-widest">
                    <tr>
                      <th className="px-6 py-4">Pedido / Cliente</th>
                      <th className="px-6 py-4">Data Solicitação</th>
                      <th className="px-6 py-4 text-center">Status</th>
                      <th className="px-6 py-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {loading ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-neutral-400">Carregando...</td>
                      </tr>
                    ) : quitacoes.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-neutral-400 italic">Nenhuma solicitação de quitação pendente.</td>
                      </tr>
                    ) : (
                      quitacoes.map(q => (
                        <tr key={q.id} className="hover:bg-[#f8f7f5] transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-neutral-900">{q.codigo_orcamento}</span>
                              <span className="text-xs text-neutral-500">{q.clientes?.nome}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-neutral-500">
                            {formatDate(q.data_criacao)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-widest uppercase ${
                              q.status_quitacao_credito === 'analise_quitacao' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
                            }`}>
                              {q.status_quitacao_credito === 'analise_quitacao' ? 'Análise' : 'Oferta Enviada'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={async () => {
                                setSelectedQuitacao(q);
                                setShowQuitacaoDetail(true);
                                setValorQuitacao(q.valor_quitacao_acordo?.toString() || '');
                                setTotalQuitacaoFaturas(null);
                                
                                // Fetch faturas pendentes do pedido para somar
                                const { data: fats } = await supabase
                                  .from('faturas')
                                  .select('valor_total, itens_faturados')
                                  .eq('cliente_id', q.cliente_id)
                                  .in('status', ['pendente', 'vencida', 'pendente_pagamento']);
                                  
                                if (fats) {
                                  let total = 0;
                                  fats.forEach(f => {
                                    const item = f.itens_faturados?.[0];
                                    if (item?.codigo === `CRE-${q.codigo_orcamento}` || item?.descricao?.includes(q.codigo_orcamento)) {
                                      total += Number(f.valor_total || 0);
                                    }
                                  });
                                  setTotalQuitacaoFaturas(total);
                                }
                              }}
                              className="inline-flex items-center justify-center p-2 rounded-xl bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 transition-colors"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === ('configuracoes' as any) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl bg-white rounded-3xl border border-neutral-100 p-6 space-y-6 shadow-sm"
          >
            <div>
              <h3 className="text-base font-black text-neutral-800 flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-500" />
                Configurações de Juros do Crédito GSA Store
              </h3>
              <p className="text-xs text-neutral-400 font-bold mt-1">
                Configure as taxas de juros aplicadas automaticamente no fechamento do carrinho de compras do portal do cliente.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">
                  Juros À Vista (30 dias) (%)
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <input 
                    type="number"
                    min="0"
                    step="0.01"
                    value={jurosAvista}
                    inputMode="numeric"
onChange={(e) => setJurosAvista(e.target.value)}
                    className="w-full pl-4 pr-10 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-bold text-neutral-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="20"
                  />
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <Percent className="h-4 w-4 text-neutral-400" />
                  </div>
                </div>
                <p className="text-[9px] text-neutral-400 font-bold leading-normal">
                  Aplicado quando o cliente escolhe pagar em 1x (30 dias) no Crédito GSA.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block">
                  Juros por Parcela adicional (%)
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <input 
                    type="number"
                    min="0"
                    step="0.01"
                    value={jurosParcelado}
                    inputMode="numeric"
onChange={(e) => setJurosParcelado(e.target.value)}
                    className="w-full pl-4 pr-10 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-bold text-neutral-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="15"
                  />
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                    <Percent className="h-4 w-4 text-neutral-400" />
                  </div>
                </div>
                <p className="text-[9px] text-neutral-400 font-bold leading-normal">
                  Taxa aplicada por parcela em parcelamentos de 2x ou mais no Crédito GSA.
                </p>
              </div>
            </div>

            <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100/60 flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-[10px] text-indigo-900 font-black uppercase tracking-wider">Como funciona o cálculo progressivo?</p>
                <p className="text-[10px] text-indigo-700 font-bold leading-relaxed">
                  A taxa de juros parcelada é composta: <strong>Juros à Vista + (Juros por Parcela × Nº de Parcelas)</strong>.
                  <br />Exemplo se configurar À Vista = 20% e Juros por Parcela = 15%:
                  <br />• <strong>À Vista (1x):</strong> 20% de juros total.
                  <br />• <strong>Parcelado em 2x:</strong> 20% + (15% × 2) = 50% de juros total.
                  <br />• <strong>Parcelado em 3x:</strong> 20% + (15% × 3) = 65% de juros total.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-neutral-100">
              <button
                type="button"
                disabled={savingSettings}
                onClick={handleSaveSettings}
                className="flex items-center gap-2 rounded-xl bg-[#1a1a1a] px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-md hover:bg-black active:scale-95 transition-all disabled:opacity-50"
              >
                {savingSettings ? 'Salvando...' : 'Salvar Configurações'}
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* MODAL: SOLICITAÇÃO DETALHE */}
      <AnimatePresence>
        {showRequestDetail && selectedRequest && (
          <div className="fixed inset-0 z-[99] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] border border-black/5 shadow-2xl w-full max-w-[96vw] sm:max-w-4xl md:max-w-6xl lg:max-w-7xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="p-6 md:p-8 border-b border-neutral-100 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="text-xl font-black text-neutral-900">
                    Análise da Solicitação de Crédito
                  </h3>
                  <p className="text-xs text-neutral-500 mt-1">Acompanhe dados, envie documentos extras e mude status.</p>
                </div>
                <div className="flex items-center gap-2">
                  <AdminWhatsAppButton 
                    telefone={selectedRequest.clientes?.telefone}
                    mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                      tipo: 'credito',
                      clienteNome: selectedRequest.clientes?.nome,
                      status: selectedRequest.status === 'liberado' ? 'Aprovado e Liberado' : selectedRequest.status === 'negado' ? 'Recusada' : 'Em Análise',
                      valorTotal: formatCurrency(selectedRequest.limite_aprovado || selectedRequest.limite_solicitado)
                    })}
                  />
                  <button 
                    onClick={() => setShowRequestDetail(false)}
                    className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors font-bold"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                
                {/* Client profile grid info */}
                <div className="bg-neutral-50 rounded-3xl p-6 border border-neutral-100 space-y-4">
                  <h4 className="text-xs font-black uppercase text-indigo-600 tracking-wider">Perfil Cadastral do Cliente</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs font-bold">
                    <div>
                      <span className="text-neutral-400 block font-semibold mb-0.5">Nome completo</span>
                      <span className="text-neutral-900">{selectedRequest.clientes?.nome}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block font-semibold mb-0.5">Tipo Pessoa</span>
                      <span className="text-neutral-900 uppercase">{selectedRequest.clientes?.tipo_pessoa || 'PF'}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block font-semibold mb-0.5">Documento</span>
                      <span className="text-neutral-900">{selectedRequest.clientes?.tipo_pessoa === 'pj' ? selectedRequest.clientes?.cnpj : selectedRequest.clientes?.cpf}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block font-semibold mb-0.5">Email</span>
                      <span className="text-neutral-900">{selectedRequest.clientes?.email}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block font-semibold mb-0.5">Telefone</span>
                      <span className="text-neutral-900">{selectedRequest.clientes?.telefone}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block font-semibold mb-0.5">CEP</span>
                      <span className="text-neutral-900">{selectedRequest.clientes?.cep}</span>
                    </div>
                    <div className="sm:col-span-2 md:col-span-3">
                      <span className="text-neutral-400 block font-semibold mb-0.5">Endereço Completo</span>
                      <span className="text-neutral-900">
                        {selectedRequest.clientes?.endereco}, Nº {selectedRequest.clientes?.numero} {selectedRequest.clientes?.bairro ? `- ${selectedRequest.clientes?.bairro}` : ''} - {selectedRequest.clientes?.cidade}/{selectedRequest.clientes?.estado}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sub-Ações / Uploads de Documentos cadastrados */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-black uppercase text-indigo-600 tracking-wider">Documentos Solicitados para Análise</h4>
                    <button
                      type="button"
                      onClick={() => setSolicitandoDocumento(!solicitandoDocumento)}
                      className="px-3 py-1.5 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-[10px] font-black uppercase tracking-wider"
                    >
                      {solicitandoDocumento ? 'Cancelar Pedido' : '+ Solicitar Documento'}
                    </button>
                  </div>

                  {solicitandoDocumento && (
                    <motion.form 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      onSubmit={handleSolicitarDocumento}
                      className="p-5 bg-indigo-50/20 border border-indigo-100 rounded-3xl space-y-4"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-black uppercase text-neutral-500 tracking-wider mb-1">Nome do Documento *</label>
                          <input
                            type="text"
                            required
                            placeholder="Ex: Contrato Social ou Extrato Bancário"
                            value={docNome}
                            onChange={e => setDocNome(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase text-neutral-500 tracking-wider mb-1">Instrução / Observação</label>
                          <input
                            type="text"
                            placeholder="Instruções para o cliente sobre como obter"
                            value={docObs}
                            onChange={e => setDocObs(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="submit"
                          disabled={submitting}
                          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-wider"
                        >
                          Confirmar Solicitação de Documento
                        </button>
                      </div>
                    </motion.form>
                  )}

                  {selectedRequest.documentos && selectedRequest.documentos.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedRequest.documentos.map((doc: any) => (
                        <div key={doc.id} className="p-4 rounded-2xl border border-neutral-100 bg-neutral-50/50 flex flex-col justify-between gap-4">
                          <div>
                            <div className="flex justify-between items-start gap-4">
                              <span className="text-xs font-bold text-neutral-800 block">{doc.nome_documento}</span>
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                doc.status === 'aprovado' ? 'bg-emerald-50 text-emerald-700' :
                                doc.status === 'rejeitado' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                              }`}>
                                {doc.status}
                              </span>
                            </div>
                            {doc.observacao && <p className="text-[10px] text-neutral-400 mt-1 leading-normal">Obs: {doc.observacao}</p>}
                          </div>
                          
                          <div className="flex items-center justify-between border-t border-neutral-100/50 pt-3">
                            {doc.arquivo_url ? (
                              <a 
                                href={doc.arquivo_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-wider"
                              >
                                Visualizar Arquivo
                              </a>
                            ) : (
                              <span className="text-[9px] text-neutral-400 italic">Aguardando envio do cliente</span>
                            )}

                            {doc.arquivo_url && doc.status === 'pendente' && (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleDocumentoStatus(doc.id, 'rejeitado')}
                                  className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                                  title="Rejeitar"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDocumentoStatus(doc.id, 'aprovado')}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                  title="Aprovar"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-400 italic">Nenhum documento adicional solicitado.</p>
                  )}
                </div>

                {/* Fluxo específico por status */}
                {['analise', 'documentos_pendentes'].includes(selectedRequest.status) && (
                  <>
                    {selectedRequest.status === 'documentos_pendentes' && (
                      <div className={`p-4 mb-6 rounded-3xl border text-xs font-semibold flex items-center gap-3 ${
                        selectedRequest.documentos?.every((d: any) => d.status === 'aprovado')
                          ? 'bg-emerald-50/60 border-emerald-100 text-emerald-800'
                          : 'bg-amber-50/60 border-amber-100 text-amber-800'
                      }`}>
                        {selectedRequest.documentos?.every((d: any) => d.status === 'aprovado') ? (
                          <>
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            <span>Todos os documentos adicionais foram aprovados com sucesso! Você pode prosseguir com a pré-aprovação do limite abaixo.</span>
                          </>
                        ) : (
                          <>
                            <Clock className="w-5 h-5 text-amber-600 shrink-0 animate-pulse" />
                            <span>Ainda existem documentos pendentes de envio ou análise pelo cliente. Você pode optar por aguardar ou conceder a pré-aprovação diretamente abaixo.</span>
                          </>
                        )}
                      </div>
                    )}

                    <div className="border-t border-neutral-100 pt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                      {selectedRequest.tipo_solicitacao === 'alteracao' ? (
                        <>
                          {/* APROVACAO DE AUMENTO DIRETO */}
                          <div className="space-y-4 p-6 bg-emerald-50/10 border border-emerald-100 rounded-3xl">
                            <div className="flex items-center gap-2 mb-2">
                              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                              <h4 className="text-xs font-black uppercase text-emerald-800 tracking-wider">Aprovar Aumento de Limite</h4>
                            </div>

                            <div className="space-y-4">
                              <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-150/50 text-xs font-semibold text-neutral-500 space-y-1">
                                <div className="flex justify-between">
                                  <span>Limite Total Atual:</span>
                                  <span className="text-neutral-900 font-bold">{formatCurrency(selectedRequest.clientes?.limite_credito_total || 0)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Limite Solicitado:</span>
                                  <span className="text-indigo-600 font-bold">{formatCurrency(selectedRequest.limite_solicitado)}</span>
                                </div>
                              </div>

                              <div>
                                <label className="block text-[10px] font-black text-neutral-500 uppercase tracking-wider mb-1">Novo Limite Total Aprovado (R$)</label>
                                <input 
                                  type="number"
                                  value={limiteAprovado}
                                  inputMode="numeric"
onChange={(e) => setLimiteAprovado(e.target.value)}
                                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                />
                              </div>

                              <button
                                type="button"
                                disabled={loading || submitting}
                                onClick={handleAprovarAumentoDireto}
                                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-wider shadow-md shadow-emerald-150"
                              >
                                Confirmar Novo Limite
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* APROVACAO SECTION */}
                          <div className="space-y-4 p-6 bg-emerald-50/10 border border-emerald-100 rounded-3xl">
                            <div className="flex items-center gap-2 mb-2">
                              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                              <h4 className="text-xs font-black uppercase text-emerald-800 tracking-wider">Opção 1: Pré-Aprovar Limite</h4>
                            </div>
                            
                            <div className="space-y-4">
                              <div>
                                <label className="block text-[10px] font-black text-neutral-500 uppercase tracking-wider mb-1">Valor do Limite Aprovado (R$)</label>
                                <input 
                                  type="number"
                                  value={limiteAprovado}
                                  inputMode="numeric"
onChange={(e) => setLimiteAprovado(e.target.value)}
                                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                />
                              </div>

                              <div className="space-y-3 py-1">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    id="opcaoParcelado"
                                    checked={opcaoParcelado}
                                    onChange={e => {
                                      setOpcaoParcelado(e.target.checked);
                                      if (!e.target.checked) setMaxParcelas(12);
                                    }}
                                    className="rounded text-emerald-600 focus:ring-emerald-500"
                                  />
                                  <label htmlFor="opcaoParcelado" className="text-xs font-bold text-neutral-700 cursor-pointer">
                                    Liberar opção de pagar parcelado na loja
                                  </label>
                                </div>

                                {opcaoParcelado && (
                                  <motion.div 
                                    initial={{ opacity: 0, height: 0 }} 
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="pl-6 space-y-1.5"
                                  >
                                    <label className="block text-[10px] font-black text-neutral-500 uppercase tracking-wider">Número máximo de parcelas</label>
                                    <select
                                      value={maxParcelas}
                                      onChange={e => setMaxParcelas(parseInt(e.target.value))}
                                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    >
                                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => (
                                        <option key={num} value={num}>{num === 1 ? '1x (À vista / 30 dias)' : `${num}x sem juros`}</option>
                                      ))}
                                    </select>
                                  </motion.div>
                                )}
                              </div>

                              <div>
                                <label className="block text-[10px] font-black text-neutral-500 uppercase tracking-wider mb-1.5">Contrato de Abertura de Crédito (PDF)</label>
                                <div className="relative group cursor-pointer border border-dashed border-neutral-200 hover:border-emerald-500 rounded-2xl bg-neutral-50/50 p-4 transition-all flex flex-col items-center justify-center gap-2">
                                  <Upload className="h-6 w-6 text-neutral-400 group-hover:text-emerald-500 transition-colors" />
                                  <span className="text-[11px] font-bold text-neutral-600 truncate max-w-full text-center">
                                    {contratoFile ? contratoFile.name : selectedRequest?.contrato_url ? 'Contrato já enviado. Clique para substituir...' : 'Clique para selecionar o arquivo do Contrato...'}
                                  </span>
                                  <span className="text-[9px] text-neutral-400 uppercase tracking-wider">Apenas arquivos .pdf</span>
                                  <input
                                    type="file"
                                    accept=".pdf"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    onChange={e => setContratoFile(e.target.files?.[0] || null)}
                                  />
                                </div>
                                {selectedRequest?.contrato_url && !contratoFile && (
                                  <div className="mt-2 flex items-center justify-between bg-neutral-50 px-3 py-1.5 rounded-xl border border-neutral-100">
                                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Contrato Atual:</span>
                                    <a
                                      href={selectedRequest.contrato_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[9px] font-black text-indigo-600 hover:underline uppercase tracking-wider"
                                    >
                                      Visualizar PDF
                                    </a>
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                disabled={loading || submitting}
                                onClick={handlePreAprovar}
                                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-wider shadow-md shadow-emerald-150"
                              >
                                Enviar Pré-Aprovação & Contrato
                              </button>
                            </div>
                          </div>
                        </>
                      )}

                      {/* NEGACAO SECTION */}
                      <div className="space-y-4 p-6 bg-rose-50/10 border border-rose-100 rounded-3xl">
                        <div className="flex items-center gap-2 mb-2">
                          <XCircle className="w-5 h-5 text-rose-600" />
                          <h4 className="text-xs font-black uppercase text-rose-800 tracking-wider">
                            {selectedRequest.tipo_solicitacao === 'alteracao' ? 'Recusar Aumento' : 'Opção 2: Recusar Solicitação'}
                          </h4>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-[10px] font-black text-neutral-500 uppercase tracking-wider mb-1">Justificativa da Recusa *</label>
                            <textarea
                              rows={3}
                              placeholder="Explique o motivo para o cliente..."
                              value={motivoNegacao}
                              onChange={e => setMotivoNegacao(e.target.value)}
                              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 resize-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-black text-neutral-500 uppercase tracking-wider mb-1">Bloqueio Temporário para Nova Tentativa</label>
                            <select
                              value={diasLockout}
                              onChange={e => setDiasLockout(e.target.value)}
                              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500/20 cursor-pointer"
                            >
                              <option value="15">15 dias</option>
                              <option value="30">30 dias (Recomendado)</option>
                              <option value="60">60 dias</option>
                              <option value="90">90 dias</option>
                            </select>
                          </div>

                          <button
                            type="button"
                            disabled={submitting}
                            onClick={handleRecusar}
                            className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black uppercase tracking-wider shadow-md shadow-rose-150"
                          >
                            {selectedRequest.tipo_solicitacao === 'alteracao' ? 'Confirmar Recusa de Aumento' : 'Confirmar Recusa'}
                          </button>
                        </div>
                      </div>
                    </div>
                </>
              )}

                {selectedRequest.status === 'contrato_pendente_assinatura' && (
                  <div className="border-t border-neutral-100 pt-6 p-6 bg-amber-50/40 border border-amber-200 rounded-3xl space-y-4 max-w-xl">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-amber-600" />
                      <h4 className="text-xs font-black uppercase text-amber-800 tracking-wider">Aguardando Assinatura do Cliente</h4>
                    </div>
                    <p className="text-xs text-amber-900/70 font-bold leading-relaxed">
                      O contrato de crédito foi enviado com sucesso e está pendente de assinatura digital pelo cliente no portal dele.
                    </p>
                    
                    {selectedRequest.contrato_url && (
                      <div className="mt-4 flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase text-amber-700/50 tracking-wider">Contrato Enviado para Assinatura:</span>
                        <div className="flex flex-wrap gap-3">
                          <a 
                            href={selectedRequest.contrato_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-amber-200 text-xs font-bold text-amber-700 hover:bg-amber-50 transition-colors shadow-sm w-fit"
                          >
                            <FileText className="w-4 h-4" />
                            Visualizar PDF Original
                          </a>
                          <button
                            type="button"
                            onClick={handleReenviarContrato}
                            disabled={submitting}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors shadow-sm disabled:opacity-50"
                          >
                            <Send className="w-4 h-4" />
                            Reenviar Aviso ao Cliente
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selectedRequest.status === 'contrato_assinado' && (
                  <div className="border-t border-neutral-100 pt-6 p-6 bg-indigo-50/20 border border-indigo-100 rounded-3xl space-y-4 max-w-xl">
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-5 h-5 text-indigo-600" />
                      <h4 className="text-xs font-black uppercase text-indigo-800 tracking-wider">Assinatura de Contrato Recebida</h4>
                    </div>

                    <p className="text-xs text-neutral-500 leading-relaxed font-bold">
                      O cliente anexou o comprovante/contrato assinado. Revise o documento para liberação definitiva do crédito.
                    </p>

                    {selectedRequest.contrato_assinado_url ? (
                      <div className="my-4">
                        <a
                          href={selectedRequest.contrato_assinado_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white border border-neutral-200 text-xs font-black text-indigo-700 hover:bg-neutral-50 transition-colors shadow-sm"
                        >
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          Visualizar Contrato Assinado
                        </a>
                      </div>
                    ) : (
                      <p className="text-xs text-rose-500 font-bold italic">Nenhum contrato assinado anexado ainda.</p>
                    )}

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleRejeitarContrato}
                        className="flex-1 py-3 rounded-xl border border-neutral-200 text-neutral-700 text-[10px] font-black uppercase tracking-wider hover:bg-neutral-50 transition-colors"
                      >
                        Rejeitar Assinatura
                      </button>
                      <button
                        type="button"
                        disabled={loading || submitting || !selectedRequest.contrato_assinado_url}
                        onClick={handleAprovarContratoELiberar}
                        className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-wider hover:scale-[1.02] transition-all shadow-md shadow-indigo-150"
                      >
                        Aprovar & Ativar Limite
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: AJUSTE MANUAL CLIENTE */}
      <AnimatePresence>
        {showClienteDetail && selectedCliente && (
          <div className="fixed inset-0 z-[99] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] border border-black/5 shadow-2xl w-full max-w-[96vw] sm:max-w-md md:max-w-xl lg:max-w-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 border-b border-neutral-100 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-black text-neutral-900">Ajuste de Crédito</h3>
                  <p className="text-[10px] text-neutral-400 font-bold">Cliente: {selectedCliente.nome}</p>
                </div>
                <button
                  onClick={() => setShowClienteDetail(false)}
                  className="text-neutral-400 hover:text-neutral-600 font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4 bg-neutral-50 rounded-2xl p-4 border border-neutral-100/50 text-xs font-bold">
                  <div>
                    <span className="text-neutral-400 block font-semibold mb-0.5">Limite Atual</span>
                    <span className="text-neutral-900">{formatCurrency(selectedCliente.limite_credito_total || 0)}</span>
                  </div>
                  <div>
                    <span className="text-neutral-400 block font-semibold mb-0.5">Disponível</span>
                    <span className="text-emerald-600">{formatCurrency(selectedCliente.limite_credito_disponivel || 0)}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-neutral-500 tracking-wider mb-1">Novo Limite Total (R$)</label>
                  <input 
                    type="number"
                    value={novoLimiteTotal}
                    inputMode="numeric"
onChange={(e) => setNovoLimiteTotal(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-neutral-500 tracking-wider mb-1">Motivo do Ajuste / Histórico *</label>
                  <textarea
                    rows={3}
                    placeholder="Escreva a justificativa para este ajuste de limite..."
                    value={ajusteDescricao}
                    onChange={e => setAjusteDescricao(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none"
                  />
                </div>

                <div className="flex gap-2 pt-4 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setShowClienteDetail(false)}
                    className="flex-1 py-3 rounded-xl border border-neutral-200 text-neutral-700 text-[10px] font-black uppercase tracking-wider hover:bg-neutral-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleSalvarAjusteManual}
                    className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-wider shadow-md shadow-indigo-150"
                  >
                    Salvar Ajuste
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: CLIENTE LEDGER (EXTRATO MENSAL) */}
      <AnimatePresence>
        {showClientLedgerModal && selectedClientMovs && (
          <div className="fixed inset-0 z-[99] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] border border-black/5 shadow-2xl w-full max-w-[96vw] sm:max-w-5xl md:max-w-7xl lg:max-w-[88vw] overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 md:p-8 border-b border-neutral-100 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="text-xl font-black text-neutral-900 flex items-center gap-2">
                    <History className="w-5 h-5 text-indigo-500" />
                    Extrato de Crédito: {selectedClientMovs.nome}
                  </h3>
                  <p className="text-xs text-neutral-500 mt-1 font-bold">{selectedClientMovs.tipo_pessoa === 'pj' ? `CNPJ: ${selectedClientMovs.cnpj}` : `CPF: ${selectedClientMovs.cpf}`}</p>
                </div>
                <button 
                  onClick={() => setShowClientLedgerModal(false)}
                  className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-neutral-50/30">
                <div className="mb-6 bg-white p-4 rounded-2xl ring-1 ring-neutral-200/60 shadow-sm flex items-center gap-4">
                  <div className="flex-1">
                    <label className="text-[10px] font-black uppercase text-neutral-400 tracking-wider block mb-1">Filtrar por Mês</label>
                    <input 
                      type="month" 
                      value={ledgerMonthFilter} 
                      onChange={e => setLedgerMonthFilter(e.target.value)} 
                      className="w-full rounded-xl border border-neutral-200 px-4 py-2 text-sm font-bold text-neutral-700 focus:outline-none focus:border-indigo-500" 
                    />
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="bg-neutral-50/50 border-b border-neutral-100">
                          <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Data / Hora</th>
                          <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Operação</th>
                          <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Valor</th>
                          <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">S. Disp. Ant.</th>
                          <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">S. Disp. Novo</th>
                          <th className="px-6 py-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Descrição</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 text-xs font-bold text-neutral-500">
                        {(() => {
                          const filtered = selectedClientMovs.movimentacoes.filter((m: any) => 
                            ledgerMonthFilter ? String(m.created_at).startsWith(ledgerMonthFilter) : true
                          );

                          if (filtered.length === 0) {
                            return (
                              <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-neutral-400 italic">
                                  Nenhum registro encontrado para este mês.
                                </td>
                              </tr>
                            );
                          }

                          return filtered.map((m: any) => {
                            const isAumento = ['concessao_inicial', 'ajuste_adm_aumento', 'solicitacao_aumento_aprovada', 'estorno_compra'].includes(m.tipo);
                            const isExpanded = selectedMovimentacao?.id === m.id;

                            return (
                              <React.Fragment key={m.id}>
                                <tr 
                                  onClick={() => setSelectedMovimentacao(isExpanded ? null : m)}
                                  className={`hover:bg-neutral-50/30 transition-colors cursor-pointer ${isExpanded ? 'bg-indigo-50/20' : ''}`}
                                >
                                  <td className="px-6 py-4 text-neutral-400">{formatDateTime(m.created_at)}</td>
                                  <td className="px-6 py-4">
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                      isAumento ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                    }`}>
                                      {m.tipo}
                                    </span>
                                  </td>
                                  <td className={`px-6 py-4 font-black ${isAumento ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {isAumento ? '+' : '-'}{formatCurrency(m.valor)}
                                  </td>
                                  <td className="px-6 py-4">{formatCurrency(m.limite_disponivel_anterior)}</td>
                                  <td className="px-6 py-4 text-neutral-700">{formatCurrency(m.limite_disponivel_novo)}</td>
                                  <td className="px-6 py-4 font-medium text-neutral-400 max-w-[200px] truncate" title={m.descricao}>{m.descricao}</td>
                                </tr>
                                {isExpanded && (
                                  <tr className="bg-indigo-50/5 border-b border-neutral-100">
                                    <td colSpan={6} className="px-6 py-4">
                                      <div className="bg-white p-4 rounded-2xl border border-indigo-100/50 shadow-sm space-y-4">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                          <div>
                                            <span className="text-neutral-400 block font-bold text-[10px] uppercase tracking-wider mb-0.5">L. Total Ant.</span>
                                            <span className="font-semibold text-neutral-700">{formatCurrency(m.limite_total_anterior)}</span>
                                          </div>
                                          <div>
                                            <span className="text-neutral-400 block font-bold text-[10px] uppercase tracking-wider mb-0.5">L. Total Novo</span>
                                            <span className="font-black text-neutral-900">{formatCurrency(m.limite_total_novo)}</span>
                                          </div>
                                          {m.solicitacao_id && (
                                            <div>
                                              <span className="text-neutral-400 block font-bold text-[10px] uppercase tracking-wider mb-0.5">Solicitação</span>
                                              <span className="font-mono text-neutral-600 select-all">{m.solicitacao_id}</span>
                                            </div>
                                          )}
                                          {m.fatura_id && (
                                            <div>
                                              <span className="text-neutral-400 block font-bold text-[10px] uppercase tracking-wider mb-0.5">Fatura</span>
                                              <span className="font-mono text-neutral-600 select-all">{m.fatura_id}</span>
                                            </div>
                                          )}
                                        </div>
                                        <div className="pt-2 border-t border-neutral-50">
                                          <span className="text-neutral-400 block font-bold text-[10px] uppercase tracking-wider mb-0.5">Descrição / Histórico</span>
                                          <p className="font-medium text-neutral-700 leading-relaxed">{m.descricao || 'Nenhuma descrição fornecida.'}</p>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-neutral-50 border-t border-neutral-100 flex justify-end shrink-0">
                <button
                  onClick={() => setShowClientLedgerModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-neutral-900 text-white text-xs font-black uppercase tracking-wider hover:bg-black transition-colors"
                >
                  Fechar Extrato
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {/* MODAL: QUITACAO */}
        {showQuitacaoDetail && selectedQuitacao && (
          <div className="fixed inset-0 z-[99] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] border border-black/5 shadow-2xl w-full max-w-[96vw] sm:max-w-lg md:max-w-2xl lg:max-w-3xl overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-neutral-100 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="text-lg font-black text-neutral-900 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-indigo-500" />
                    Análise de Quitação
                  </h3>
                  <p className="text-xs text-neutral-500 mt-1 font-bold">Pedido: {selectedQuitacao.codigo_orcamento}</p>
                </div>
                <button 
                  onClick={() => setShowQuitacaoDetail(false)}
                  className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-6">
                <div>
                  <p className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-2">Cliente</p>
                  <p className="text-sm font-bold text-neutral-800">{selectedQuitacao.clientes?.nome}</p>
                  <p className="text-xs text-neutral-500">{selectedQuitacao.clientes?.cpf || selectedQuitacao.clientes?.cnpj}</p>
                </div>

                <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50 space-y-4">
                  {totalQuitacaoFaturas !== null && quitacaoBreakdown && (
                    <div className="mb-4 bg-white p-4 rounded-xl border border-indigo-100/50">
                      <p className="text-[10px] font-black uppercase text-neutral-400 tracking-wider mb-1">Total Original Pendente</p>
                      <p className="text-xl font-black text-neutral-900">{formatCurrency(totalQuitacaoFaturas)}</p>
                      
                      <div className="mt-3 pt-3 border-t border-dashed border-neutral-150 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-neutral-500 font-semibold flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block"></span>
                            Crédito Original (Principal)
                          </span>
                          <span className="font-bold text-neutral-800">
                            {formatCurrency(quitacaoBreakdown.valorOriginalCredito)} <span className="text-[10px] text-neutral-400 font-normal">({quitacaoBreakdown.pctOriginal.toFixed(1)}%)</span>
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-neutral-500 font-semibold flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 block"></span>
                            Juros do Crédito
                          </span>
                          <span className="font-bold text-neutral-800">
                            {formatCurrency(quitacaoBreakdown.valorJuros)} <span className="text-[10px] text-neutral-400 font-normal">({quitacaoBreakdown.pctJuros.toFixed(1)}%)</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-black uppercase text-indigo-800 tracking-wider mb-2 block">
                      Valor da Oferta de Quitação à Vista (R$)
                    </label>
                    <input 
                      type="text"
                      placeholder="Ex: 500,00"
                      value={valorQuitacao}
                      onChange={e => setValorQuitacao(e.target.value)}
                      disabled={selectedQuitacao.status_quitacao_credito !== 'analise_quitacao'}
                      className="w-full text-2xl font-black text-indigo-900 bg-white px-4 py-3 rounded-xl border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    />
                    <p className="text-xs text-indigo-600 mt-2 font-medium">Informe o valor com desconto que o cliente deverá pagar para quitar este parcelamento.</p>
                  </div>
                </div>

                {selectedQuitacao.status_quitacao_credito === 'analise_quitacao' && (
                  <button
                    onClick={enviarOfertaQuitacao}
                    disabled={submitting}
                    className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Enviar Oferta ao Cliente
                  </button>
                )}

                {selectedQuitacao.status_quitacao_credito !== 'analise_quitacao' && (
                  <div className="text-center p-4 bg-amber-50 rounded-xl border border-amber-100 text-amber-800 text-xs font-bold uppercase tracking-wider">
                    Aguardando resposta do cliente
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

      </AnimatePresence>
    </div>
  );
}

function getMovimentacaoTipoLabel(tipo: string): string {
  switch (tipo) {
    case 'concessao_inicial': return 'Liberação Inicial';
    case 'compra': return 'Compra na GSA Store';
    case 'amortizacao': return 'Pagamento de Amortização';
    case 'ajuste_adm_aumento': return 'Aumento de Limite (ADM)';
    case 'ajuste_adm_reducao': return 'Redução de Limite (ADM)';
    case 'solicitacao_aumento_aprovada': return 'Aumento de Limite Aprovado';
    case 'estorno_compra': return 'Estorno de Compra';
    default: return tipo;
  }
}
