import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import SignaturePad from 'signature_pad';
import { Modal } from '../ui/Modal';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { useWhatsAppDocument } from '../../hooks/useWhatsAppDocument';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import { generateExtratoPDF } from '../../lib/pdf';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { uploadFile } from '../../lib/storage';
import { supabase } from '../../lib/supabase';
import { Cliente, LojaCreditoSolicitacao, LojaCreditoDocumento, LojaCreditoMovimentacao } from '../../types';
import { notificationService } from '../../lib/notificationService';
import { clientOperationalWrite } from '../../lib/clientOperationalWrite';
import { callClientRpc } from '../../lib/clientRpc';
import { 
  Landmark, 
  FileText, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  History, 
  ShieldCheck, 
  Clock, 
  Info,
  DollarSign,
  ChevronRight,
  ArrowRight,
  Download,
  AlertTriangle,
  BadgeAlert,
  Loader2,
  X,
  XCircle,
  ClipboardList,
  CreditCard,
  Send,
  Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency, formatDate, formatDateTime, maskCPF, maskCNPJ, maskPhone } from '../../lib/utils';
import { toast } from 'react-hot-toast';
import { validarCPF, validarCNPJ, validarEmail } from '../../utils/cpfValidator';
import { getProductDisplayCode } from '../../lib/productIdentification';
import { useConfirm } from '../../hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { CreditDisputeModal } from './CreditDisputeModal';
import { listClientCreditDisputes } from '../../features/creditDisputes/service';
import type { CreditDispute } from '../../features/creditDisputes/types';
import { listClientCreditLimitCancellations, requestClientCreditLimitCancellation } from '../../features/creditLimitCancellation/service';
import type { CreditLimitCancellation } from '../../features/creditLimitCancellation/types';
import { CreditWithdrawalModal } from './CreditWithdrawalModal';
import { listClientCreditWithdrawals } from '../../features/creditWithdrawal/service';
import type { CreditWithdrawal } from '../../features/creditWithdrawal/types';

interface ClientMeuCreditoProps {
  clientId: string;
  cliente: Cliente;
  onRefreshCliente: () => void;
  onNavigate: (module: string, tab?: string, itemId?: string) => void;
  initialTab?: string;
  initialItemId?: string;
}

export function ClientMeuCredito({ clientId, cliente, onRefreshCliente, onNavigate, initialTab, initialItemId }: ClientMeuCreditoProps) {
  const [solicitacao, setSolicitacao] = useState<LojaCreditoSolicitacao | null>(null);
  const [documentos, setDocumentos] = useState<LojaCreditoDocumento[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<LojaCreditoMovimentacao[]>([]);
  const [faturas, setFaturas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals / Form states
  const [activeTab, setActiveTab] = useState(initialTab || 'resumo');
  const [creditoTab, setCreditoTab] = useState<'limite' | 'faturas' | 'extrato'>('limite');
  const { isSendingWhatsApp, sendToWhatsApp } = useWhatsAppDocument();
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isIncreaseModalOpen, setIsIncreaseModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [uploadingContrato, setUploadingContrato] = useState(false);
  const [cancellingIncrease, setCancellingIncrease] = useState(false);
  const confirmHook = useConfirm();
  const [showSign, setShowSign] = useState(false);
  const signCanvasRef = useRef<HTMLCanvasElement>(null);
  const signPadRef = useRef<SignaturePad|null>(null);
  
  // Form fields for profile completeness and request
  const [limiteDesejado, setLimiteDesejado] = useState<string>('');


  const [profileData, setProfileData] = useState({
    nome: cliente.nome || '',
    cpf: cliente.cpf || '',
    cnpj: cliente.cnpj || '',
    tipo_pessoa: cliente.tipo_pessoa || 'pf',
    telefone: cliente.telefone || '',
    email: cliente.email || '',
    cep: cliente.cep || '',
    endereco: cliente.endereco || '',
    numero: cliente.numero || '',
    bairro: cliente.bairro || '',
    cidade: cliente.cidade || '',
    estado: cliente.estado || '',
  });

  // Estados para Modal de Detalhes da Amortização
  const [selectedFatura, setSelectedFatura] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [creditoOrcamento, setCreditoOrcamento] = useState<any | null>(null);
  const [creditoFaturasRelacionadas, setCreditoFaturasRelacionadas] = useState<any[]>([]);
  const [loadingCreditoDetalhes, setLoadingCreditoDetalhes] = useState(false);
  const [faturaPointsDiscount, setFaturaPointsDiscount] = useState<number | null>(null);
  const [faturaCupomDesconto, setFaturaCupomDesconto] = useState<any | null>(null);

  // Filtros mensais para Amortizações e Extrato
  const [filtroMesAmortizacao, setFiltroMesAmortizacao] = useState<string>('todos');
  const [filtroMesExtrato, setFiltroMesExtrato] = useState<string>('todos');
  const [filtroCompraAmortizacao, setFiltroCompraAmortizacao] = useState<string>('todos');

  // Controle de exibição dos modais de "Ver Mais"
  const [isAllAmortizacoesOpen, setIsAllAmortizacoesOpen] = useState(false);
  const [isAllExtratoOpen, setIsAllExtratoOpen] = useState(false);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [creditDisputes, setCreditDisputes] = useState<CreditDispute[]>([]);
  const [selectedDisputeMovement, setSelectedDisputeMovement] = useState<LojaCreditoMovimentacao | null>(null);
  const [creditLimitCancellations, setCreditLimitCancellations] = useState<CreditLimitCancellation[]>([]);
  const [creditWithdrawals, setCreditWithdrawals] = useState<CreditWithdrawal[]>([]);
  const [isCreditWithdrawalModalOpen, setIsCreditWithdrawalModalOpen] = useState(false);

  // Extrai o código do orçamento de uma fatura de amortização de crédito
  const getFaturaCodigoOrcamento = (fat: any): string => {
    if (!fat.itens_faturados || fat.itens_faturados.length === 0) return '';
    const item = fat.itens_faturados[0];
    if (item.codigo && item.codigo.startsWith('CRE-')) {
      return item.codigo.replace('CRE-', '');
    }
    const match = item.descricao?.match(/(#ODC-\d+)/);
    if (match) {
      return match[1];
    }
    return '';
  };

  // Obtém códigos únicos de compras (orçamentos) que possuem faturas
  const getComprasUnicas = () => {
    const codigos = new Set<string>();
    faturas.forEach(fat => {
      const cod = getFaturaCodigoOrcamento(fat);
      if (cod) codigos.add(cod);
    });
    return Array.from(codigos).sort();
  };

  const getMesesFiltro = () => {
    const meses = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const opcoes = [];
    const hoje = new Date();
    let anoAtual = hoje.getFullYear();
    let mesAtual = hoje.getMonth(); // 0 a 11

    for (let i = 0; i < 12; i++) {
      opcoes.push({
        valor: `${anoAtual}-${String(mesAtual + 1).padStart(2, '0')}`,
        rotulo: `${meses[mesAtual]} de ${anoAtual}`
      });
      mesAtual--;
      if (mesAtual < 0) {
        mesAtual = 11;
        anoAtual--;
      }
    }
    return opcoes;
  };

  const handleOpenFaturaDetalhes = async (fat: any) => {
    setSelectedFatura(fat);
    setIsDetailOpen(true);
    setFaturaPointsDiscount(null);
    setFaturaCupomDesconto(null);
    setCreditoOrcamento(null);
    setCreditoFaturasRelacionadas([]);
    setLoadingCreditoDetalhes(true);

    try {
      let codigoOrcamento = '';
      if (fat.itens_faturados && fat.itens_faturados.length > 0) {
        const item = fat.itens_faturados[0];
        if (item.codigo && item.codigo.startsWith('CRE-')) {
          codigoOrcamento = item.codigo.replace('CRE-', '');
        } else {
          const match = item.descricao?.match(/(#ODC-\d+)/);
          if (match) {
            codigoOrcamento = match[1];
          }
        }
      }

      if (codigoOrcamento) {
        const { data: orcData } = await supabase
          .from('orcamentos')
          .select(`
            *,
            ordens_compra (
              *,
              produtos (*)
            ),
            ordens_assinatura (
              *,
              assinaturas (*)
            )
          `)
          .eq('codigo_orcamento', codigoOrcamento)
          .maybeSingle();

        if (orcData) {
          setCreditoOrcamento(orcData);
          
          if (orcData.cupom_desconto_id) {
            const { data: cupom } = await supabase
              .from('cupons_loja')
              .select('*')
              .eq('id', orcData.cupom_desconto_id)
              .maybeSingle();
            if (cupom) setFaturaCupomDesconto(cupom);
          }

          if (orcData.desconto_pontos_total) {
            setFaturaPointsDiscount(Number(orcData.desconto_pontos_total));
          }

          const { data: relatedFats } = await supabase
            .from('faturas')
            .select('*')
            .eq('cliente_id', clientId)
            .eq('is_amortizacao_credito', true)
            .order('data_vencimento', { ascending: true });

          if (relatedFats) {
            const filtered = relatedFats.filter((f: any) => {
              const item = f.itens_faturados?.[0];
              return item?.codigo === `CRE-${codigoOrcamento}` || item?.descricao?.includes(codigoOrcamento);
            });
            setCreditoFaturasRelacionadas(filtered);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao buscar detalhes da fatura:', err);
    } finally {
      setLoadingCreditoDetalhes(false);
    }
  };

  const solicitarQuitacao = async () => {
    if (!creditoOrcamento) return;
    try {
      await callClientRpc('gsa_client_request_store_credit_settlement', {
        p_orcamento_id: creditoOrcamento.id,
      });
      setCreditoOrcamento({ ...creditoOrcamento, status_quitacao_credito: 'analise_quitacao' });
      toast.success('Solicitação de quitação enviada para análise.');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao solicitar quitação.');
    }
  };

  const gerarFaturaQuitacao = async () => {
    if (!creditoOrcamento || !creditoOrcamento.valor_quitacao_acordo) return;
    try {
      setSubmitting(true);
      const data = await callClientRpc<any>('gsa_client_accept_store_credit_settlement', {
        p_orcamento_id: creditoOrcamento.id,
      });
      const faturaId = data?.fatura_id;

      toast.success(data?.already_exists ? 'A fatura de quitação já estava gerada.' : 'Fatura de quitação gerada com sucesso!');
      setIsDetailOpen(false);
      loadData();
      onNavigate('financeiro', 'faturas', faturaId);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar fatura de quitação.');
    } finally {
      setSubmitting(false);
    }
  };

  const recusarOfertaQuitacao = async () => {
    if (!creditoOrcamento) return;
    try {
      await callClientRpc('gsa_client_reject_store_credit_settlement', {
        p_orcamento_id: creditoOrcamento.id,
      });
      setCreditoOrcamento({ ...creditoOrcamento, status_quitacao_credito: null, valor_quitacao_acordo: null });
      toast.success('Oferta recusada.');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao recusar oferta.');
    }
  };

  useEffect(() => {
    // Sincroniza dados do cliente se ele for atualizado
    setProfileData({
      nome: cliente.nome || '',
      cpf: cliente.cpf || '',
      cnpj: cliente.cnpj || '',
      tipo_pessoa: cliente.tipo_pessoa || 'pf',
      telefone: cliente.telefone || '',
      email: cliente.email || '',
      cep: cliente.cep || '',
      endereco: cliente.endereco || '',
      numero: cliente.numero || '',
      bairro: cliente.bairro || '',
      cidade: cliente.cidade || '',
      estado: cliente.estado || '',
    });
  }, [cliente]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // 1. Carrega solicitação ativa/recente
      const { data: solData, error: solErr } = await supabase
        .from('loja_credito_solicitacoes')
        .select('*')
        .eq('cliente_id', clientId)
        .order('created_at', { ascending: false });
        
      if (solErr) throw solErr;
      
      // Pega a solicitação mais recente
      const currentSol = solData && solData.length > 0 ? solData[0] as LojaCreditoSolicitacao : null;
      setSolicitacao(currentSol);

      if (currentSol) {
        // 2. Carrega documentos adicionais solicitados para esta solicitação
        const { data: docsData, error: docsErr } = await supabase
          .from('loja_credito_documentos')
          .select('*')
          .eq('solicitacao_id', currentSol.id)
          .order('created_at', { ascending: true });
          
        if (docsErr) throw docsErr;
        setDocumentos(docsData || []);
      }

      // 3. Carrega histórico de movimentações
      const { data: movData, error: movErr } = await supabase
        .from('loja_credito_movimentacoes')
        .select('*')
        .eq('cliente_id', clientId)
        .order('created_at', { ascending: false });
        
      if (movErr) throw movErr;
      setMovimentacoes(movData || []);
      try { setCreditDisputes(await listClientCreditDisputes()); }
      catch (disputeError) { console.warn('Não foi possível carregar as contestações de crédito:', disputeError); setCreditDisputes([]); }
      try { setCreditLimitCancellations(await listClientCreditLimitCancellations()); }
      catch (cancelError) { console.warn('Não foi possível carregar os cancelamentos de limite:', cancelError); setCreditLimitCancellations([]); }
      try { setCreditWithdrawals(await listClientCreditWithdrawals()); }
      catch (withdrawalError) { console.warn('Não foi possível carregar os saques de crédito:', withdrawalError); setCreditWithdrawals([]); }

      // 4. Carrega faturas amortizáveis
      const { data: fatData, error: fatErr } = await supabase
        .from('faturas')
        .select('*')
        .eq('cliente_id', clientId)
        .eq('is_amortizacao_credito', true)
        .order('data_vencimento', { ascending: true });
        
      if (fatErr) throw fatErr;
      setFaturas(fatData || []);

    } catch (err: any) {
      console.error('Erro ao carregar dados de crédito:', err);
      toast.error('Erro ao carregar dados do seu crédito.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [clientId]);

  useRealtimeSubscription(
    [
      {
        table: 'loja_credito_solicitacoes',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        onChange: () => {
          loadData();
          onRefreshCliente();
        },
      },
      {
        table: 'loja_credito_movimentacoes',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        onChange: () => {
          loadData();
          onRefreshCliente();
        },
      },
      {
        table: 'faturas',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        onChange: () => {
          loadData();
          onRefreshCliente();
        },
      },
      {
        table: 'clientes',
        filter: clientId ? `id=eq.${clientId}` : undefined,
        onChange: onRefreshCliente,
      },
      {
        table: 'loja_credito_documentos',
        onChange: loadData,
      },
      {
        table: 'notificacoes',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        onChange: loadData,
      },
    ],
    [clientId]
  );


  const activeCreditWithdrawal = creditWithdrawals.find((item) => ['aguardando_documentos', 'em_analise', 'analise_reforcada', 'aprovado'].includes(item.status)) || null;
  const notifiedCreditWithdrawal = initialItemId ? creditWithdrawals.find((item) => item.id === initialItemId) || null : null;
  const creditWithdrawalForModal = notifiedCreditWithdrawal || activeCreditWithdrawal;

  useEffect(() => {
    if (initialItemId && creditWithdrawals.some((item) => item.id === initialItemId)) setIsCreditWithdrawalModalOpen(true);
  }, [initialItemId, creditWithdrawals]);

  const getCreditDisputeForMovement = (movementId: string) =>
    creditDisputes.find((item) => item.movimentacao_id === movementId) || null;

  const isWithinDisputeWindow = (mov: LojaCreditoMovimentacao) => {
    if (mov.tipo !== 'compra' || !mov.created_at) return false;
    return Date.now() <= new Date(mov.created_at).getTime() + 90 * 24 * 60 * 60 * 1000;
  };

  const disputeStatusLabel = (status: string) => ({
    aberta: 'Contestação registrada', em_analise: 'Contestação em análise',
    aguardando_documentos: 'Aguardando documentos', deferida: 'Contestação aprovada',
    parcialmente_deferida: 'Parcialmente aprovada', indeferida: 'Contestação não aprovada',
    cancelada_cliente: 'Contestação cancelada', resolvida_por_estorno: 'Resolvida por estorno',
  } as Record<string, string>)[status] || 'Ver contestação';

  const renderCreditDisputeAction = (mov: LojaCreditoMovimentacao) => {
    if (mov.tipo !== 'compra') return null;
    const dispute = getCreditDisputeForMovement(mov.id);
    if (dispute) return <button type="button" onClick={() => setSelectedDisputeMovement(mov)} className="mt-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-[9.5px] font-black text-indigo-700 ring-1 ring-indigo-100 hover:bg-indigo-100">{disputeStatusLabel(dispute.status)}</button>;
    if (!isWithinDisputeWindow(mov)) return <span className="mt-1.5 block text-[9px] font-semibold text-neutral-400">Prazo de contestação encerrado</span>;
    return <button type="button" onClick={() => setSelectedDisputeMovement(mov)} className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[9.5px] font-black text-amber-700 ring-1 ring-amber-100 hover:bg-amber-100">Contestar compra</button>;
  };

  const blockedCredit = Math.max(Number(cliente.limite_credito_bloqueado || 0), 0);
  const currentCreditUsed = Math.max(Number(cliente.limite_credito_total || 0) - Number(cliente.limite_credito_disponivel || 0), 0);
  const hasPendingCreditInvoice = faturas.some((fat) => fat.status !== 'cancelado' && Number(fat.valor_final_pendente || 0) > 0.01);
  const activeCreditLimitCancellation = creditLimitCancellations.find((item) => ['solicitado', 'em_analise'].includes(item.status)) || null;
  const isPreApprovedRequest = Boolean((solicitacao as any)?.origem_pre_aprovado);
  const preApprovedAlreadyReleased = Boolean((cliente as any).credito_pre_aprovado_liberado_em);

  const handleRequestPreApprovedCredit = async () => {
    const confirmed = await confirmHook.confirm({
      title: 'Solicitar liberação dos R$ 100,00?',
      message: 'O crédito continuará indisponível durante a análise. O sistema terá até 72 horas para aprovar ou recusar a liberação.',
      confirmLabel: 'Solicitar liberação', cancelLabel: 'Agora não', variant: 'info',
    });
    if (!confirmed) return;
    setSubmitting(true);
    try {
      const result = await callClientRpc<any>('gsa_client_request_preapproved_credit_100');
      toast.success(result?.already_pending ? 'A solicitação já está em análise.' : 'Solicitação enviada. Prazo de análise: até 72 horas.');
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível solicitar a liberação.');
    } finally { setSubmitting(false); }
  };

  const handleRequestCreditLimitCancellation = async () => {
    if (blockedCredit > 0.01) { toast.error('Existe limite bloqueado por uma análise financeira em andamento.'); return; }
    if (currentCreditUsed > 0.01) { toast.error('O limite só pode ser cancelado quando não houver nenhum valor utilizado.'); return; }
    if (hasPendingCreditInvoice) { toast.error('Quite ou regularize as faturas de crédito pendentes antes de solicitar o cancelamento.'); return; }
    const confirmed = await confirmHook.confirm({
      title: 'Solicitar cancelamento do limite?',
      message: 'Seu limite será enviado para análise de cancelamento. Até a decisão, não utilize o crédito. A aprovação só poderá ocorrer se o Limite Usado continuar em R$ 0,00.',
      confirmLabel: 'Solicitar cancelamento', cancelLabel: 'Manter meu limite', variant: 'danger',
    });
    if (!confirmed) return;
    setSubmitting(true);
    try {
      const result = await requestClientCreditLimitCancellation();
      toast.success(`Solicitação ${result.protocolo} registrada.`);
      await loadData(); onRefreshCliente();
    } catch (error: any) { toast.error(error?.message || 'Não foi possível solicitar o cancelamento do limite.'); }
    finally { setSubmitting(false); }
  };

  // Função para salvar cadastro pendente e criar a solicitação
  const handleCreateSolicitacao = async (e: React.FormEvent, tipo: 'adesao' | 'alteracao' = 'adesao') => {
    e.preventDefault();
    
    // Validar se dados obrigatórios estão preenchidos
    const missingFields: string[] = [];
    if (!profileData.nome) missingFields.push('Nome Completo');
    if (profileData.tipo_pessoa === 'pf' && !profileData.cpf) missingFields.push('CPF');
    if (profileData.tipo_pessoa === 'pj' && !profileData.cnpj) missingFields.push('CNPJ');
    if (!profileData.telefone) missingFields.push('Telefone');
    if (!profileData.email) missingFields.push('E-mail');
    if (!profileData.cep) missingFields.push('CEP');
    if (!profileData.endereco) missingFields.push('Endereço');
    if (!profileData.numero) missingFields.push('Número');

    // Bloquear envio se campos obrigatórios estiverem faltando
    if (missingFields.length > 0) {
      toast.error(`Preencha os campos obrigatórios: ${missingFields.join(', ')}`);
      return;
    }

    try {
      // 1. Atualiza dados cadastrais do cliente
      await clientOperationalWrite(clientId, 'clientes', 'update', {
        nome: profileData.nome,
        cpf: profileData.tipo_pessoa === 'pf' ? profileData.cpf : cliente.cpf,
        cnpj: profileData.tipo_pessoa === 'pj' ? profileData.cnpj : cliente.cnpj,
        telefone: profileData.telefone,
        email: profileData.email,
        cep: profileData.cep,
        endereco: profileData.endereco,
        numero: profileData.numero,
        bairro: profileData.bairro,
        cidade: profileData.cidade,
        estado: profileData.estado
      }, { id: clientId });

      // 2. Insere a solicitação de crédito
      const valorSolicitado = Number(limiteDesejado) || 0;
      await clientOperationalWrite(clientId, 'loja_credito_solicitacoes', 'insert', {
        tipo_solicitacao: tipo,
        limite_solicitado: valorSolicitado,
        status: 'analise',
      });

      // Notifica o cliente
      toast.success(tipo === 'adesao' 
        ? 'Solicitação de crédito enviada com sucesso! Entrou em análise de 5 dias úteis.'
        : 'Solicitação de alteração enviada! Ela será avaliada em até 5 dias úteis.'
      );

      // Envia notificação interna para administradores
      await notificationService.notifyAdmin(
        tipo === 'adesao' ? 'Nova Solicitação de Crédito 💳' : 'Solicitação de Aumento de Crédito 📈',
        `O cliente ${profileData.nome} solicitou R$ ${valorSolicitado.toFixed(2)} de limite de crédito.`,
        'credito_loja',
        'cadastro_novo_cliente',
        { tab: 'solicitacoes' }
      );

      // Atualiza cliente localmente e recarrega dados do módulo
      onRefreshCliente();
      setIsRequestModalOpen(false);
      setIsIncreaseModalOpen(false);
      setLimiteDesejado('');
      loadData();

    } catch (err: any) {
      console.error('Erro ao enviar solicitação:', err);
      toast.error('Erro ao processar sua solicitação cadastral ou de crédito.');
    } finally {
      setSubmitting(false);
    }
  };

  // Upload de documentos adicionais solicitados pelo ADM
  const handleUploadDocumento = async (docId: string, file: File) => {
    try {
      setUploadingDocId(docId);
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${clientId}/doc_${docId}_${Date.now()}.${fileExt}`;
      const filePath = `credito_documentos/${fileName}`;
      
      // Upload para storage bucket 'documentos_cliente'
      const { url: publicUrl, path: _uploadedPath } = await uploadFile(file, 'documentos_cliente', filePath);

      // Obter URL pública do arquivo
      // publicUrl is handled by uploadFile directly if bucket is public, else use getPublicFileUrl or getPrivateFileUrl.

      // Atualizar status e arquivo_url do documento na tabela loja_credito_documentos
      await clientOperationalWrite(clientId, 'loja_credito_documentos', 'update', {
        arquivo_url: publicUrl,
        status: 'pendente',
        updated_at: new Date().toISOString()
      }, { id: docId });

      toast.success('Documento enviado com sucesso!');
      
      // Envia notificação ao admin informando o envio
      await notificationService.notifyAdmin(
        'Documento de Crédito Enviado 📄',
        `O cliente ${cliente.nome} enviou um documento solicitado para análise de crédito.`,
        'credito_loja',
        'documento_cliente_enviado',
        { tab: 'solicitacoes' }
      );

      loadData();
    } catch (err: any) {
      console.error('Erro no upload do documento:', err);
      toast.error('Erro ao enviar o documento.');
    } finally {
      setUploadingDocId(null);
    }
  };

  // Upload de contrato assinado pelo cliente
  const handleUploadContratoAssinado = async (file: File) => {
    if (!solicitacao) return;

    try {
      setUploadingContrato(true);
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${clientId}/contrato_assinado_${solicitacao.id}_${Date.now()}.${fileExt}`;
      const filePath = `credito_contratos/${fileName}`;
      
      // Upload para storage bucket 'documentos_cliente'
      const { url: publicUrl, path: _uploadedPath } = await uploadFile(file, 'documentos_cliente', filePath);

      // Obter URL pública do arquivo
      // publicUrl is handled by uploadFile directly if bucket is public, else use getPublicFileUrl or getPrivateFileUrl.

      // Atualizar status da solicitação
      await clientOperationalWrite(clientId, 'loja_credito_solicitacoes', 'update', {
        contrato_assinado_url: publicUrl,
        status: 'contrato_assinado',
        updated_at: new Date().toISOString()
      }, { id: solicitacao.id });

      toast.success('Contrato assinado enviado com sucesso!');
      
      // Envia notificação ao admin informando que o contrato foi assinado
      await notificationService.notifyAdmin(
        'Contrato de Crédito Assinado 🖋️',
        `O cliente ${cliente.nome} anexou o contrato de crédito devidamente assinado.`,
        'credito_loja',
        'cadastro_aprovado',
        { tab: 'solicitacoes' }
      );

      loadData();
    } catch (err: any) {
      console.error('Erro no upload do contrato assinado:', err);
      toast.error('Erro ao enviar o contrato assinado.');
    } finally {
      setUploadingContrato(false);
    }
  };

  const openSignature = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowSign(true);
  };

  // Inicializa o SignaturePad quando o overlay é montado
  useEffect(() => {
    if (!showSign) return;
    // Pequeno delay para garantir que o portal renderizou o canvas
    const timer = setTimeout(() => {
      if (signCanvasRef.current) {
        try {
          signPadRef.current = new SignaturePad(signCanvasRef.current, { backgroundColor: 'rgb(255,255,255)', penColor: 'rgb(0,0,0)' });
          const canvas = signCanvasRef.current;
          canvas.width = canvas.offsetWidth * 2;
          canvas.height = canvas.offsetHeight * 2;
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.scale(2, 2);
        } catch (err) {
          console.error('Erro ao instanciar SignaturePad:', err);
          toast.error('Erro ao iniciar assinatura.');
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [showSign]);

  const finishSignature = async () => {
    if (!signPadRef.current || signPadRef.current.isEmpty() || !solicitacao) {
      toast.error('Assine o contrato antes de concluir.');
      return;
    }
    
    try {
      setUploadingContrato(true);
      const dataUrl = signPadRef.current.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();
      const signatureFile = new File([blob], 'assinatura.png', { type: blob.type });
      const path = `credito_contratos/${clientId}/assinatura_${solicitacao.id}_${Date.now()}.png`;
      
      const { url: publicUrl, path: _uploadedPath } = await uploadFile(signatureFile, 'documentos_cliente', path);
        
      // publicUrl is handled by uploadFile directly if bucket is public, else use getPublicFileUrl or getPrivateFileUrl.
        
      await clientOperationalWrite(clientId, 'loja_credito_solicitacoes', 'update', {
        contrato_assinado_url: publicUrl,
        status: 'contrato_assinado',
        updated_at: new Date().toISOString()
      }, { id: solicitacao.id });
      
      toast.success('Contrato assinado digitalmente com sucesso!');
      
      // Envia notificação ao admin informando que o contrato foi assinado
      await notificationService.notifyAdmin(
        'Contrato de Crédito Assinado 🖋️',
        `O cliente ${cliente.nome} assinou o contrato de crédito digitalmente na tela.`,
        'credito_loja',
        'cadastro_aprovado',
        { itemId: solicitacao.id, tab: 'solicitacoes' }
      );
      
      setShowSign(false);
      loadData();
    } catch (err: any) {
      console.error('Erro ao assinar contrato digitalmente:', err);
      toast.error('Erro ao salvar sua assinatura digital.');
    } finally {
      setUploadingContrato(false);
    }
  };

  const renderSignaturePortal = () => {
    if (!showSign) return null;
    return ReactDOM.createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={() => setShowSign(false)}
      >
        <div
          className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl ring-1 ring-black/5"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="mb-5 flex items-center justify-between pb-4 border-b border-neutral-100">
            <h2 className="text-lg font-black text-neutral-900 uppercase tracking-tight">Assinar Contrato</h2>
            <button
              type="button"
              onClick={() => setShowSign(false)}
              className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-all active:scale-95"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="space-y-4">
            {solicitacao?.contrato_url && (
              <iframe src={solicitacao.contrato_url} className="w-full h-64 rounded-xl border" title="Contrato" />
            )}
            <div className="space-y-2">
              <p className="text-xs font-black text-neutral-700 uppercase">✍️ Assinatura do Cliente</p>
              <div className="bg-white rounded-xl ring-1 ring-neutral-300 overflow-hidden" style={{touchAction:'none'}}>
                <canvas ref={signCanvasRef} className="w-full" style={{height:'180px', width:'100%'}} />
              </div>
              <button type="button" onClick={() => signPadRef.current?.clear()} className="text-xs text-neutral-500 hover:text-red-500 font-bold">🗑️ Limpar Assinatura</button>
            </div>
            <button 
              type="button"
              onClick={finishSignature} 
              disabled={uploadingContrato}
              className="w-full py-3 bg-[#1a1a1a] hover:bg-black text-white rounded-xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {uploadingContrato ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando Assinatura...
                </>
              ) : (
                <span>✅ Concluir Assinatura</span>
              )}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'analise': return 'Enviado para Análise';
      case 'documentos_pendentes': return 'Documentos Pendentes';
      case 'pre_aprovado': return 'Pré-Aprovado';
      case 'contrato_pendente_assinatura': return 'Aguardando Assinatura do Contrato';
      case 'contrato_assinado': return 'Contrato Assinado (Em Ativação)';
      case 'liberado': return 'Crédito Liberado';
      case 'negado': return 'Solicitação Recusada';
      case 'cancelado': return 'Solicitação Cancelada';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'liberado': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      case 'negado': return 'text-rose-600 bg-rose-50 border-rose-100';
      case 'cancelado': return 'text-neutral-600 bg-neutral-50 border-neutral-200';
      case 'analise': return 'text-amber-600 bg-amber-50 border-amber-100';
      case 'documentos_pendentes': return 'text-purple-600 bg-purple-50 border-purple-100';
      case 'pre_aprovado': return 'text-indigo-600 bg-indigo-50 border-indigo-100';
      case 'contrato_pendente_assinatura': return 'text-indigo-600 bg-indigo-50 border-indigo-100';
      case 'contrato_assinado': return 'text-blue-600 bg-blue-50 border-blue-100';
      default: return 'text-neutral-600 bg-neutral-50 border-neutral-100';
    }
  };

  // Lockout check
  const isLockoutActive = solicitacao?.status === 'negado' && solicitacao.nova_tentativa_apos && new Date(solicitacao.nova_tentativa_apos) > new Date();

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
      </div>
    );
  }

  // 1. Landing Page: Solicitação Inicial
  if ((!solicitacao || (solicitacao.status === 'negado' && !isLockoutActive)) && Number(cliente.limite_credito_total || 0) <= 0) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-[2rem] bg-indigo-600 text-white shadow-xl shadow-indigo-100 mb-6">
            <Landmark className="h-10 w-10" />
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-[#1a1a1a] mb-4 tracking-tight">GSA Store Credit</h2>
        </div>



        {/* CTA */}
        <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-neutral-950 text-white rounded-[3rem] p-8 md:p-14 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full filter blur-3xl -mr-16 -mt-16"></div>
          <div className="relative z-10 max-w-xl mx-auto">
            <h3 className="text-2xl md:text-4xl font-black mb-4">R$ 100,00 pré-aprovados para você</h3>
            <p className="text-indigo-200/80 font-medium text-xs md:text-sm leading-relaxed mb-8">
              Solicite a liberação. O valor entrará em análise por até 72 horas e somente ficará disponível depois da aprovação do sistema.
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <button onClick={() => void handleRequestPreApprovedCredit()} disabled={submitting} className="inline-flex items-center justify-center gap-3 rounded-2xl bg-white px-8 py-4 text-xs font-black uppercase tracking-wider text-indigo-900 shadow-xl transition-all hover:scale-105 hover:bg-neutral-50 disabled:opacity-50 md:text-sm">
                {submitting ? 'Enviando...' : 'Liberar os R$ 100'} <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={() => setIsRequestModalOpen(true)} disabled={submitting} className="inline-flex items-center justify-center gap-3 rounded-2xl border border-white/30 bg-white/10 px-8 py-4 text-xs font-black uppercase tracking-wider text-white transition-all hover:bg-white/20 md:text-sm">
                Solicitar outro valor
              </button>
            </div>
          </div>
        </div>

        <ConfirmDialog {...confirmHook} />
        <ModalSolicitacao isOpen={isRequestModalOpen} onClose={() => setIsRequestModalOpen(false)} profileData={profileData} setProfileData={setProfileData} limiteDesejado={limiteDesejado} setLimiteDesejado={setLimiteDesejado} onSubmit={(e) => handleCreateSolicitacao(e, 'adesao')} submitting={submitting} />
      </div>
    );
  }

  // 2. Lockout Temporário
  if (isLockoutActive) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto text-center">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-[2rem] bg-rose-50 text-rose-600 border border-rose-100 shadow-sm mb-6 animate-bounce">
          <BadgeAlert className="h-10 w-10" />
        </div>
        <h3 className="text-2xl font-black text-neutral-900 mb-2">Solicitação Recusada</h3>
        <p className="text-neutral-500 text-sm leading-relaxed mb-6">
          Sua solicitação de análise de crédito não foi aceita pela equipe no momento.
        </p>

        <div className="bg-rose-50 border border-rose-100 rounded-3xl p-6 mb-8 text-left">
          <h4 className="text-xs font-black uppercase text-rose-800 tracking-wider mb-2">Motivo da Recusa</h4>
          <p className="text-rose-900 text-sm leading-relaxed font-medium">
            {solicitacao.motivo_negacao || 'Perfil cadastral inconsistente com as políticas de crédito da loja.'}
          </p>
        </div>

        <div className="bg-neutral-50 rounded-3xl p-6 border border-neutral-100 flex items-center justify-center gap-4">
          <Clock className="w-8 h-8 text-neutral-400" />
          <div className="text-left">
            <h5 className="text-xs font-black text-neutral-700 uppercase tracking-wide">Nova Tentativa Permitida</h5>
            <p className="text-neutral-500 text-sm font-medium">
              Você poderá realizar uma nova solicitação a partir do dia <strong className="text-neutral-900">{formatDate(solicitacao.nova_tentativa_apos!)}</strong>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 3. Status da Solicitação em Andamento (Timeline / Documentos / Contratos)
  const isEmAndamento = solicitacao && !['liberado', 'negado', 'cancelado'].includes(solicitacao.status);

  const handleCancelCreditIncrease = async () => {
    if (!solicitacao || solicitacao.tipo_solicitacao !== 'alteracao' || solicitacao.status !== 'analise') return;
    const confirmed = await confirmHook.confirm({
      title: 'Cancelar aumento de crédito?',
      message: 'A solicitação deixará imediatamente a fila de análise. Esta ação não pode ser desfeita.',
      confirmLabel: 'Sim, cancelar solicitação',
      cancelLabel: 'Manter em análise',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      setCancellingIncrease(true);
      await callClientRpc('gsa_client_cancel_credit_increase_request', {
        p_solicitacao_id: solicitacao.id,
      });
      toast.success('Solicitação de aumento de crédito cancelada.');
      setIsTrackingModalOpen(false);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível cancelar a solicitação.');
      await loadData();
    } finally {
      setCancellingIncrease(false);
    }
  };

  const renderAcompanhamento = (isModal: boolean = false) => (
    <div className={isModal ? "p-2" : "p-4 md:p-8 max-w-4xl mx-auto"}>
        <ConfirmDialog {...confirmHook} />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h2 className="text-3xl font-black text-neutral-900 tracking-tight mt-1">Acompanhamento de Crédito</h2>
          </div>
          <div className={`px-4 py-2 rounded-full border text-xs font-bold ${getStatusColor(solicitacao.status)}`}>
            {getStatusText(solicitacao.status)}
          </div>
        </div>

        {solicitacao.tipo_solicitacao === 'alteracao' && solicitacao.status === 'analise' && (
          <button
            type="button"
            onClick={() => void handleCancelCreditIncrease()}
            disabled={cancellingIncrease}
            className="mb-8 w-full rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancellingIncrease ? 'Cancelando solicitação...' : 'Cancelar solicitação de aumento'}
          </button>
        )}

        {/* SLA Information Box */}
        <div className="bg-indigo-50/60 border border-indigo-100 rounded-3xl p-6 mb-8 flex items-start gap-4">
          <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-indigo-900">Prazo de Resposta</h4>
            <p className="text-xs text-indigo-800 leading-relaxed mt-1">
              Nossa análise tem o prazo padrão de até <strong>5 dias úteis</strong> para retorno da liberação de limite ou pedido de documentos adicionais.
            </p>
          </div>
        </div>

        {/* Timeline Stepper */}
        <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm p-8 mb-8">
          <h3 className="text-lg font-black text-neutral-900 mb-8">Etapas da Solicitação</h3>
          
          <div className="relative border-l-2 border-neutral-100 pl-8 space-y-8">
            {/* Step 1: Solicitação Enviada */}
            <div className="relative">
              <div className="absolute -left-[41px] top-0.5 bg-emerald-500 rounded-full p-1.5 text-white">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-neutral-900">Solicitação Enviada</h4>
                <p className="text-xs text-neutral-500 mt-1">Limite desejado: {formatCurrency(solicitacao.limite_solicitado || 0)}</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">Enviado em {formatDateTime(solicitacao.created_at)}</p>
              </div>
            </div>

            {/* Step 2: Em análise */}
            <div className="relative">
              <div className={`absolute -left-[41px] top-0.5 rounded-full p-1.5 text-white ${
                ['documentos_pendentes', 'pre_aprovado', 'contrato_pendente_assinatura', 'contrato_assinado', 'liberado'].includes(solicitacao.status)
                  ? 'bg-emerald-500'
                  : 'bg-amber-500 animate-pulse'
              }`}>
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-neutral-900">Análise de Perfil</h4>
                <p className="text-xs text-neutral-500 mt-1">
                  Nossa equipe financeira está avaliando o limite cadastral solicitado.
                </p>
              </div>
            </div>

            {/* Step 3: Documentos (se houver pedido ou se já passou) */}
            {(solicitacao.status === 'documentos_pendentes' || documentos.length > 0) && (
              <div className="relative">
                <div className={`absolute -left-[41px] top-0.5 rounded-full p-1.5 text-white ${
                  ['pre_aprovado', 'contrato_pendente_assinatura', 'contrato_assinado', 'liberado'].includes(solicitacao.status)
                    ? 'bg-emerald-500'
                    : 'bg-purple-500 animate-pulse'
                }`}>
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-neutral-900">Documentos Adicionais</h4>
                  <p className="text-xs text-neutral-500 mt-1 mb-4">
                    Documentação extra necessária para dar prosseguimento ao limite.
                  </p>
                  
                  {/* Upload de documentos pendentes */}
                  <div className="space-y-3 max-w-xl">
                    {documentos.map((doc) => (
                      <div key={doc.id} className="p-4 rounded-2xl border border-neutral-100 bg-neutral-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <span className="text-xs font-bold text-neutral-800">{doc.nome_documento}</span>
                          {doc.observacao && <p className="text-[10px] text-neutral-500 mt-0.5">Obs: {doc.observacao}</p>}
                        </div>
                        <div>
                          {doc.arquivo_url ? (
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                doc.status === 'aprovado' ? 'text-emerald-700 bg-emerald-100' :
                                doc.status === 'rejeitado' ? 'text-rose-700 bg-rose-100' : 'text-amber-700 bg-amber-100'
                              }`}>
                                {doc.status === 'aprovado' ? 'Aprovado' : doc.status === 'rejeitado' ? 'Rejeitado (Reenviar)' : 'Aguardando Análise'}
                              </span>
                              {doc.status === 'rejeitado' && (
                                <label className="cursor-pointer p-1.5 rounded-lg bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100 transition-colors" title="Reenviar documento">
                                  <Upload className="w-3.5 h-3.5" />
                                  <input 
                                    type="file" 
                                    className="hidden" 
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleUploadDocumento(doc.id, file);
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          ) : (
                            <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-neutral-200 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-all">
                              {uploadingDocId === doc.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-500" />
                              ) : (
                                <Upload className="w-3.5 h-3.5" />
                              )}
                              Upload
                              <input 
                                type="file" 
                                className="hidden" 
                                disabled={uploadingDocId !== null}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUploadDocumento(doc.id, file);
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Pré-aprovado / Assinatura do Contrato */}
            {['pre_aprovado', 'contrato_pendente_assinatura', 'contrato_assinado', 'liberado'].includes(solicitacao.status) && (
              <div className="relative">
                <div className={`absolute -left-[41px] top-0.5 rounded-full p-1.5 text-white ${
                  ['contrato_assinado', 'liberado'].includes(solicitacao.status)
                    ? 'bg-emerald-500'
                    : 'bg-indigo-500 animate-pulse'
                }`}>
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-neutral-900">Aprovação & Contratação</h4>
                  <p className="text-xs text-neutral-500 mt-1">
                    Crédito pré-aprovado no limite de <strong className="text-neutral-900">{formatCurrency(solicitacao.limite_aprovado || 0)}</strong>.
                  </p>
                  
                  {/* Fluxo de assinatura de contrato */}
                  {solicitacao.contrato_url ? (
                    <div className="mt-4 p-5 rounded-3xl border border-indigo-100 bg-indigo-50/20 max-w-xl">
                      <h5 className="text-xs font-black uppercase text-indigo-900 tracking-wider mb-2">Contrato de Abertura de Crédito</h5>
                      <p className="text-[11px] text-neutral-500 leading-relaxed mb-4">
                        Para ativar o seu limite de crédito, abra e assine o contrato digitalmente direto na tela.
                      </p>

                      {solicitacao.status === 'contrato_pendente_assinatura' && solicitacao.motivo_negacao && (
                        <div className="mb-4 p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-xs">
                          <span className="font-black block uppercase text-[10px] tracking-wider text-rose-800 mb-1">⚠️ Assinatura de Contrato Rejeitada</span>
                          <span className="font-bold">{solicitacao.motivo_negacao}</span>
                        </div>
                      )}
                      
                      <div className="flex flex-col sm:flex-row gap-3">
                        <a 
                          href={solicitacao.contrato_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-neutral-200 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors shadow-sm"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Baixar Contrato PDF
                        </a>
                        
                        {solicitacao.contrato_assinado_url ? (
                          <a 
                            href={solicitacao.contrato_assinado_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold hover:bg-emerald-100 transition-colors shadow-sm"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Visualizar Contrato Assinado
                          </a>
                        ) : (
                          <button 
                            type="button"
                            onClick={openSignature}
                            disabled={uploadingContrato}
                            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200"
                          >
                            {uploadingContrato ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <span>✍️ Assinar Contrato</span>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-400 italic mt-2">
                      Aguarde enquanto o sistema prepara o contrato de crédito para sua assinatura.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        {renderSignaturePortal()}
      </div>
    );

  if (isEmAndamento && (solicitacao as any)?.tipo === 'adesao') {
    return renderAcompanhamento(false);
  }

  // 4. Painel de Crédito Ativo (Status Liberado)
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      <ConfirmDialog {...confirmHook} />
      {isEmAndamento && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-[2rem] p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-black text-indigo-900 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              {isPreApprovedRequest ? 'Liberação do Crédito Pré-Aprovado em Análise' : 'Solicitação de Aumento de Limite em Andamento'}
            </h4>
            <p className="text-xs text-indigo-700/80 font-semibold mt-1">
              Status atual: {getStatusText(solicitacao.status)}
            </p>
          </div>
          <button
            onClick={() => setIsTrackingModalOpen(true)}
            className="px-6 py-3 rounded-xl bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-indigo-700 transition-colors shrink-0"
          >
            Acompanhar Solicitação
          </button>
        </div>
      )}
      
      {/* Tabs Menu */}
      <div className="flex items-center justify-between gap-1 sm:gap-2 pb-2 border-b border-neutral-100 w-full mt-2">
        {[
          { id: 'limite', label: 'Meu Limite', icon: CreditCard },
          { id: 'faturas', label: 'Faturas', icon: FileText },
          { id: 'extrato', label: 'Extrato', icon: History }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setCreditoTab(tab.id as any)}
            className={`flex-1 flex justify-center items-center gap-1.5 sm:gap-2 px-1 sm:px-4 py-3.5 sm:py-4 text-[11px] sm:text-sm font-black uppercase tracking-[0.02em] sm:tracking-wider whitespace-nowrap transition-all border-b-2 ${
              creditoTab === tab.id
                ? 'border-indigo-600 text-indigo-900 bg-indigo-50/50 rounded-t-xl'
                : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 rounded-t-xl'
            }`}
          >
            <tab.icon className={`w-4 h-4 sm:w-4 sm:h-4 ${creditoTab === tab.id ? 'text-indigo-600' : 'text-neutral-400'}`} />
            {tab.label}
          </button>
        ))}
      </div>

      {creditoTab === 'limite' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {Number(cliente.limite_credito_total || 0) < 100 && !preApprovedAlreadyReleased && !isPreApprovedRequest && (
            <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Oferta pré-aprovada</p>
                <h3 className="mt-1 text-2xl font-black text-emerald-950">R$ 100,00 em crédito</h3>
                <p className="mt-2 text-xs font-medium leading-relaxed text-emerald-800">A liberação depende de aprovação do sistema, com prazo de análise de até 72 horas.</p>
              </div>
              <button type="button" onClick={() => void handleRequestPreApprovedCredit()} disabled={submitting} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-6 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-800 disabled:opacity-50 sm:mt-0 sm:w-auto">
                {submitting ? 'Enviando...' : 'Solicitar liberação'} <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
          {/* Header Cards (Disponível vs Total) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Visa Card Design */}
        <div className="bg-gradient-to-br from-indigo-800 via-indigo-950 to-neutral-900 text-white rounded-[2rem] p-8 relative overflow-hidden shadow-2xl flex flex-col justify-between min-h-[220px]">
          <div className="absolute top-0 right-0 w-44 h-44 bg-white/5 rounded-full -mr-8 -mt-8 filter blur-lg"></div>
          
          <div className="flex justify-between items-start z-10 gap-4">
            <div className="flex-1 min-w-0">
              <span className="text-[10px] uppercase font-black tracking-widest text-indigo-300">GSA Store Card</span>
              <h3 className="text-xl sm:text-2xl font-black tracking-tight mt-1 truncate" title={cliente.nome}>{cliente.nome}</h3>
            </div>
            <Landmark className="w-8 h-8 text-indigo-400 shrink-0" />
          </div>

          <div className="z-10 mt-8">
            <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider block">Crédito Disponível</span>
            <span className="text-3xl md:text-4xl font-black tracking-tight">{formatCurrency(cliente.limite_credito_disponivel || 0)}</span>
            {blockedCredit > 0.01 && (
              <span className="mt-2 block text-[10px] font-black uppercase tracking-wider text-amber-300">
                {formatCurrency(blockedCredit)} bloqueado durante análise
              </span>
            )}
          </div>

          <div className="flex justify-between items-center z-10 border-t border-white/10 pt-4 mt-4">
            <div className="flex flex-col">
              <span className="text-[11px] text-indigo-300 font-black uppercase tracking-wider">Limite Total</span>
              <span className="text-xl md:text-2xl font-black text-white mt-1 leading-none">
                {formatCurrency(cliente.limite_credito_total || 0)}
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-white border border-white/20 font-black uppercase tracking-wider">
              {cliente.opcao_pagamento_parcelado ? 'À Vista & Parcelado' : 'À Vista (30d)'}
            </span>
          </div>
        </div>

        {/* Circular Credit Limit Progress */}
        <div className="bg-white rounded-[2rem] border border-neutral-100 p-8 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-black text-neutral-800 uppercase tracking-wide">Uso do Limite</h4>
            <p className="text-xs text-neutral-400 font-medium">Acompanhamento do saldo comprometido</p>
          </div>
          
          {(() => {
            const total = cliente.limite_credito_total || 1;
            const disponivel = cliente.limite_credito_disponivel || 0;
            const utilizado = total - disponivel;
            const pct = Math.min(100, Math.max(0, (utilizado / total) * 100));
            const pctDisponivel = 100 - pct;
            const colorClass = pct > 85 ? 'bg-rose-500' : pct > 50 ? 'bg-amber-500' : 'bg-indigo-600';
            return (
              <>
                <div className="my-4 space-y-2.5">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-bold text-neutral-700">
                      <span>Utilizado: {formatCurrency(utilizado)}</span>
                      <span>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-bold text-neutral-500">
                      <span>Disponível: {formatCurrency(disponivel)}</span>
                      <span>{pctDisponivel.toFixed(0)}%</span>
                    </div>
                    {blockedCredit > 0.01 && <p className="text-[11px] font-bold text-amber-600">Bloqueado: {formatCurrency(blockedCredit)} · Utilizável: {formatCurrency(Math.max(disponivel - blockedCredit, 0))}</p>}
                  </div>
                  <div className="w-full bg-neutral-100 h-3 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${colorClass}`} 
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="flex gap-4 text-xs font-bold text-neutral-500">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full transition-colors duration-500 ${colorClass}`}></div>
                    <span>Comprometido</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-neutral-200"></div>
                    <span>Disponível</span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>

          {/* Quick Actions Card */}
          <div className="bg-neutral-900 text-white rounded-[2rem] p-6 sm:p-8 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <h4 className="text-sm font-black uppercase tracking-wide text-neutral-400">Ações Rápidas</h4>
              <p className="text-xs text-neutral-500 font-medium mt-1">Gerencie seu crédito</p>
              {activeCreditLimitCancellation ? <p className="mt-2 text-[10px] font-bold text-amber-300">Cancelamento em análise • {activeCreditLimitCancellation.protocolo}</p> : blockedCredit > 0.01 ? <p className="mt-2 text-[10px] font-semibold text-amber-300">Há limite bloqueado por análise financeira.</p> : currentCreditUsed > 0.01 ? <p className="mt-2 text-[10px] font-semibold text-neutral-400">Cancelamento disponível somente com Limite Usado em R$ 0,00.</p> : hasPendingCreditInvoice ? <p className="mt-2 text-[10px] font-semibold text-neutral-400">Regularize as faturas de crédito pendentes antes de cancelar o limite.</p> : Number(cliente.limite_credito_total || 0) > 0 ? <p className="mt-2 text-[10px] font-semibold text-emerald-300">Seu limite está elegível para solicitação de cancelamento.</p> : null}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setIsIncreaseModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white text-neutral-900 text-xs font-black uppercase tracking-wider transition-all hover:bg-neutral-50 shadow-sm whitespace-nowrap"
              >
                Solicitar Aumento
                <ChevronRight className="w-4 h-4" />
              </button>
              {(Boolean(activeCreditWithdrawal) || Math.max(Number(cliente.limite_credito_disponivel || 0) - blockedCredit, 0) > 0) && (
                <button type="button" onClick={() => setIsCreditWithdrawalModalOpen(true)} className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 text-emerald-200 text-xs font-black uppercase tracking-wider transition-all hover:bg-emerald-500/20 whitespace-nowrap">
                  {activeCreditWithdrawal ? 'Acompanhar Saque' : 'Solicitar Saque'}
                  <DollarSign className="w-4 h-4" />
                </button>
              )}
              {Number(cliente.limite_credito_total || 0) > 0 && (
                <button type="button" onClick={() => void handleRequestCreditLimitCancellation()} disabled={submitting || blockedCredit > 0.01 || currentCreditUsed > 0.01 || hasPendingCreditInvoice || Boolean(activeCreditLimitCancellation)} className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl border border-rose-400/40 bg-rose-500/10 text-rose-200 text-xs font-black uppercase tracking-wider transition-all hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap">
                  Cancelar Limite
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {creditoTab === 'faturas' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="bg-white rounded-[2rem] border border-neutral-100 shadow-sm p-6 md:p-8">
            {(() => {
              const faturasFiltradas = faturas.filter(fat => {
                // Filtro Mensal
                let passMes = true;
                if (filtroMesAmortizacao !== 'todos') {
                  passMes = fat.data_vencimento ? fat.data_vencimento.startsWith(filtroMesAmortizacao) : false;
                }

                // Filtro Compra
                let passCompra = true;
                if (filtroCompraAmortizacao !== 'todos') {
                  passCompra = getFaturaCodigoOrcamento(fat) === filtroCompraAmortizacao;
                }

                return passMes && passCompra;
              }).sort((a: any, b: any) => {
                const getParcela = (cod: string) => {
                  const match = cod?.match(/-(\d+)\/\d+/);
                  return match ? parseInt(match[1], 10) : 0;
                };
                const pA = getParcela(a.codigo_fatura);
                const pB = getParcela(b.codigo_fatura);
                if (pA && pB && pA !== pB) return pA - pB;
                
                const vencA = a.data_vencimento ? new Date(a.data_vencimento).getTime() : 0;
                const vencB = b.data_vencimento ? new Date(b.data_vencimento).getTime() : 0;
                return vencA - vencB;
              });

              const faturasExibidas = faturasFiltradas.slice(0, 3);
              const temMaisFaturas = faturasFiltradas.length > 3;

              return (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <h3 className="text-lg font-black text-neutral-900 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-indigo-600" />
                      Amortizações de Crédito
                    </h3>
                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        value={filtroCompraAmortizacao}
                        onChange={(e) => setFiltroCompraAmortizacao(e.target.value)}
                        className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-white text-xs font-bold text-neutral-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                      >
                        <option value="todos">Todas as Compras</option>
                        {getComprasUnicas().map(cod => (
                          <option key={cod} value={cod}>{cod.startsWith('#') ? cod : `#${cod}`}</option>
                        ))}
                      </select>

                      <select
                        value={filtroMesAmortizacao}
                        onChange={(e) => setFiltroMesAmortizacao(e.target.value)}
                        className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-white text-xs font-bold text-neutral-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                      >
                        <option value="todos">Todos os Meses</option>
                        {getMesesFiltro().map(opt => (
                          <option key={opt.valor} value={opt.valor}>{opt.rotulo}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {faturasExibidas.length > 0 ? (
                    <div className="space-y-4">
                      {faturasExibidas.map((fat) => (
                        <div key={fat.id} className="p-5 rounded-2xl border border-neutral-100 bg-neutral-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-neutral-900">Parcela de Amortização</span>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                fat.status === 'pago' ? 'text-emerald-700 bg-emerald-100' :
                                fat.status === 'atrasado' ? 'text-rose-700 bg-rose-100 animate-pulse' :
                                fat.status === 'cancelado' ? 'text-neutral-700 bg-neutral-200' : 'text-amber-700 bg-amber-100'
                              }`}>
                                {fat.status === 'pago' ? 'Pago' : fat.status === 'atrasado' ? 'Atrasado' : fat.status === 'cancelado' ? 'Cancelado' : 'Aberto'}
                              </span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-1">Fatura #{fat.codigo_fatura || fat.id.substring(0,8).toUpperCase()}</p>
                            <p className="text-[10px] text-neutral-400 mt-0.5">Vencimento: {formatDate(fat.data_vencimento)}</p>
                          </div>

                          <div className="flex items-center gap-4">
                            <span className="text-base font-black text-neutral-900">{formatCurrency(fat.valor_total)}</span>
                            <button
                              onClick={() => handleOpenFaturaDetalhes(fat)}
                              className="px-4 py-2 rounded-xl border border-neutral-300 bg-white text-neutral-700 text-xs font-bold hover:bg-neutral-50 transition-all shadow-sm"
                            >
                              Detalhes
                            </button>
                            {fat.status !== 'pago' && fat.status !== 'cancelado' && (
                              <button
                                onClick={() => onNavigate('financeiro')}
                                className="px-4 py-2 rounded-xl bg-[#1a1a1a] text-white text-xs font-bold hover:bg-black transition-all shadow-sm"
                              >
                                Ir para Pagamento
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      {temMaisFaturas && (
                        <div className="pt-2 text-center">
                          <button
                            onClick={() => setIsAllAmortizacoesOpen(true)}
                            className="px-4 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors w-full sm:w-auto"
                          >
                            Ver Mais ({faturasFiltradas.length - 3} restantes)
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-neutral-400 text-sm font-medium">Nenhuma amortização de crédito encontrada para este período.</p>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {creditoTab === 'extrato' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div className="bg-white rounded-[2rem] border border-neutral-100 shadow-sm p-6 md:p-8">
            {(() => {
              const movimentacoesFiltradas = movimentacoes.filter(mov => {
                if (filtroMesExtrato === 'todos') return true;
                if (!mov.created_at) return false;
                return mov.created_at.startsWith(filtroMesExtrato);
              }).sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateB - dateA;
              });

              const movimentacoesExibidas = movimentacoesFiltradas.slice(0, 3);
              const temMaisMovimentacoes = movimentacoesFiltradas.length > 3;

              return (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <h3 className="text-lg font-black text-neutral-900 flex items-center gap-2">
                      <History className="w-5 h-5 text-indigo-600" />
                      Extrato de Crédito
                    </h3>
                    <div className="flex gap-2">
                      <select
                        value={filtroMesExtrato}
                        onChange={(e) => setFiltroMesExtrato(e.target.value)}
                        className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-white text-xs font-bold text-neutral-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                      >
                        <option value="todos">Todos os Meses</option>
                        {getMesesFiltro().map(opt => (
                          <option key={opt.valor} value={opt.valor}>{opt.rotulo}</option>
                        ))}
                      </select>
                      <button
                        onClick={async () => {
                          try {
                            const formattedMovimentacoes = movimentacoesFiltradas.map((mov: any) => ({
                              data: mov.created_at,
                              descricao: mov.historico || mov.descricao,
                              tipo: ['concessao_inicial', 'amortizacao', 'ajuste_adm_aumento', 'solicitacao_aumento_aprovada', 'estorno_compra'].includes(mov.tipo) ? 'entrada' : 'saida',
                              valor: Math.abs(mov.valor || 0)
                            }));
                            
                            const doc = await generateExtratoPDF(formattedMovimentacoes, cliente?.nome || 'Cliente', { returnDoc: true }) as any;
                            const pdfBase64 = doc.output('datauristring');
                            
                            const mensagemBase = whatsappNotificationService.gerarMensagemWhatsApp({
                              tipo: 'extrato' as any,
                              clienteNome: cliente?.nome,
                            });
                            
                            await sendToWhatsApp(
                              cliente?.telefone,
                              mensagemBase,
                              pdfBase64,
                              `extrato_credito_${new Date().getTime()}.pdf`
                            );
                          } catch (err) {
                            console.error(err);
                            toast.error("Erro ao gerar extrato.");
                          }
                        }}
                        disabled={isSendingWhatsApp || movimentacoesFiltradas.length === 0}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-200 border border-emerald-200 transition-all disabled:opacity-50"
                        title="Enviar para o WhatsApp"
                      >
                        {isSendingWhatsApp ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" /> : <Send className="h-3.5 w-3.5" />}
                        <span className="hidden sm:inline">WhatsApp</span>
                      </button>
                    </div>
                  </div>

                  {movimentacoesExibidas.length > 0 ? (
                    <div className="flow-root">
                      <ul className="-mb-8">
                        {movimentacoesExibidas.map((mov, idx) => {
                          const isPositive = ['concessao_inicial', 'amortizacao', 'ajuste_adm_aumento', 'solicitacao_aumento_aprovada', 'estorno_compra'].includes(mov.tipo);
                          return (
                            <li key={mov.id}>
                              <div className="relative pb-8">
                                {idx !== movimentacoesExibidas.length - 1 && (
                                  <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-neutral-100" aria-hidden="true" />
                                )}
                                <div className="relative flex space-x-3">
                                  <div>
                                    <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${
                                      isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                                    }`}>
                                      <DollarSign className="w-4 h-4" />
                                    </span>
                                  </div>
                                  <div className="flex-1 min-w-0 pt-1.5 flex justify-between gap-2">
                                    <div>
                                      <p className="text-xs font-bold text-neutral-800 leading-tight">{mov.descricao || getMovimentacaoTitle(mov.tipo)}</p>
                                      <p className="text-[9px] text-neutral-400 mt-0.5">{formatDateTime(mov.created_at)}</p>

                                      {renderCreditDisputeAction(mov)}
                                    </div>
                                    <div className="text-right shrink-0">
                                      <span className={`text-xs font-black ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        {isPositive ? '+' : '-'}{formatCurrency(mov.valor)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>

                      {temMaisMovimentacoes && (
                        <div className="pt-6 text-center">
                          <button
                            onClick={() => setIsAllExtratoOpen(true)}
                            className="px-4 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors w-full"
                          >
                            Ver Mais ({movimentacoesFiltradas.length - 3} restantes)
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-neutral-400 text-sm font-medium">Nenhuma movimentação encontrada para este período.</p>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal Solicitação de Alteração */}
      <ModalSolicitacao 
        isOpen={isIncreaseModalOpen}
        onClose={() => setIsIncreaseModalOpen(false)}
        profileData={profileData}
        setProfileData={setProfileData}
        limiteDesejado={limiteDesejado}
        setLimiteDesejado={setLimiteDesejado}
        onSubmit={(e) => handleCreateSolicitacao(e, 'alteracao')}
        submitting={submitting}
        tipo="alteracao"
        limiteAtual={cliente.limite_credito_total}
      />

      {renderSignaturePortal()}

      {/* Modal de Todas as Amortizações */}
      <Modal 
        isOpen={isAllAmortizacoesOpen} 
        onClose={() => setIsAllAmortizacoesOpen(false)} 
        title="Todas as Amortizações de Crédito"
        size="lg"
      >
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2">
          {(() => {
            const faturasFiltradas = faturas.filter(fat => {
              // Filtro Mensal
              let passMes = true;
              if (filtroMesAmortizacao !== 'todos') {
                passMes = fat.data_vencimento ? fat.data_vencimento.startsWith(filtroMesAmortizacao) : false;
              }

              // Filtro Compra
              let passCompra = true;
              if (filtroCompraAmortizacao !== 'todos') {
                passCompra = getFaturaCodigoOrcamento(fat) === filtroCompraAmortizacao;
              }

              return passMes && passCompra;
            }).sort((a: any, b: any) => {
                const getParcela = (cod: string) => {
                  const match = cod?.match(/-(\d+)\/\d+/);
                  return match ? parseInt(match[1], 10) : 0;
                };
                const pA = getParcela(a.codigo_fatura);
                const pB = getParcela(b.codigo_fatura);
                if (pA && pB && pA !== pB) return pA - pB;
                
                const vencA = a.data_vencimento ? new Date(a.data_vencimento).getTime() : 0;
                const vencB = b.data_vencimento ? new Date(b.data_vencimento).getTime() : 0;
                return vencA - vencB;
            });

            return faturasFiltradas.map((fat) => (
              <div key={fat.id} className="p-5 rounded-2xl border border-neutral-100 bg-neutral-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-neutral-900">Parcela de Amortização</span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      fat.status === 'pago' ? 'text-emerald-700 bg-emerald-100' :
                      fat.status === 'atrasado' ? 'text-rose-700 bg-rose-100 animate-pulse' :
                      fat.status === 'cancelado' ? 'text-neutral-700 bg-neutral-200' : 'text-amber-700 bg-amber-100'
                    }`}>
                      {fat.status === 'pago' ? 'Pago' : fat.status === 'atrasado' ? 'Atrasado' : fat.status === 'cancelado' ? 'Cancelado' : 'Aberto'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">Fatura #{fat.codigo_fatura || fat.id.substring(0,8).toUpperCase()}</p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Vencimento: {formatDate(fat.data_vencimento)}</p>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-base font-black text-neutral-900">{formatCurrency(fat.valor_total)}</span>
                  <button
                    onClick={() => {
                      setIsAllAmortizacoesOpen(false);
                      handleOpenFaturaDetalhes(fat);
                    }}
                    className="px-4 py-2 rounded-xl border border-neutral-300 bg-white text-neutral-700 text-xs font-bold hover:bg-neutral-50 transition-all shadow-sm"
                  >
                    Detalhes
                  </button>
                  {fat.status !== 'pago' && fat.status !== 'cancelado' && (
                    <button
                      onClick={() => {
                        setIsAllAmortizacoesOpen(false);
                        onNavigate('financeiro');
                      }}
                      className="px-4 py-2 rounded-xl bg-[#1a1a1a] text-white text-xs font-bold hover:bg-black transition-all shadow-sm"
                    >
                      Ir para Pagamento
                    </button>
                  )}
                </div>
              </div>
            ));
          })()}
        </div>
      </Modal>

      {/* Modal de Todos os Lançamentos do Extrato */}
      <Modal 
        isOpen={isAllExtratoOpen} 
        onClose={() => setIsAllExtratoOpen(false)} 
        title="Extrato de Crédito Completo"
        size="lg"
      >
        <div className="flow-root max-h-[65vh] overflow-y-auto pr-2 py-4">
          <ul className="-mb-8">
            {(() => {
              const movimentacoesFiltradas = movimentacoes.filter(mov => {
                if (filtroMesExtrato === 'todos') return true;
                if (!mov.created_at) return false;
                return mov.created_at.startsWith(filtroMesExtrato);
              }).sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateB - dateA;
              });

              return movimentacoesFiltradas.map((mov, idx) => {
                const isPositive = ['concessao_inicial', 'amortizacao', 'ajuste_adm_aumento', 'solicitacao_aumento_aprovada', 'estorno_compra'].includes(mov.tipo);
                return (
                  <li key={mov.id}>
                    <div className="relative pb-8">
                      {idx !== movimentacoesFiltradas.length - 1 && (
                        <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-neutral-100" aria-hidden="true" />
                      )}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${
                            isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                          }`}>
                            <DollarSign className="w-4 h-4" />
                          </span>
                        </div>
                        <div className="flex-1 min-w-0 pt-1.5 flex justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-neutral-800 leading-tight">{mov.descricao || getMovimentacaoTitle(mov.tipo)}</p>
                            <p className="text-[9px] text-neutral-400 mt-0.5">{formatDateTime(mov.created_at)}</p>

                            {renderCreditDisputeAction(mov)}
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`text-xs font-black ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {isPositive ? '+' : '-'}{formatCurrency(mov.valor)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              });
            })()}
          </ul>
        </div>
      </Modal>

      <CreditWithdrawalModal
        isOpen={isCreditWithdrawalModalOpen}
        clientId={clientId}
        withdrawal={creditWithdrawalForModal}
        onClose={() => setIsCreditWithdrawalModalOpen(false)}
        onChanged={async () => { await loadData(); onRefreshCliente(); }}
      />

      <CreditDisputeModal
        isOpen={Boolean(selectedDisputeMovement)}
        movement={selectedDisputeMovement}
        dispute={selectedDisputeMovement ? getCreditDisputeForMovement(selectedDisputeMovement.id) : null}
        clientId={clientId}
        onClose={() => setSelectedDisputeMovement(null)}
        onChanged={loadData}
      />

      {/* Modal de Detalhes da Amortização */}
      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Detalhes da Compra / Amortização" size="full">
        {selectedFatura && (() => {
          if (loadingCreditoDetalhes) {
            return (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                <p className="text-sm font-medium text-neutral-500 mt-2">Carregando detalhes minuciosos...</p>
              </div>
            );
          }

          if (creditoOrcamento) {
            const total = Number(creditoOrcamento.total || 0);
            const desconto = Number(creditoOrcamento.desconto || 0);
            const taxaEnt = Number(creditoOrcamento.taxa_entrega || 0);
            const acrescimo = Number(creditoOrcamento.acrescimo || 0);
            const subtotalItens = total + desconto - taxaEnt - acrescimo;

            return (
              <div className="space-y-8">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  <div className="rounded-2xl bg-neutral-100 p-5 ring-1 ring-neutral-300">
                    <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Código da Fatura Atual</p>
                    <p className="font-mono text-sm font-medium text-[#1a1a1a] mt-1">{selectedFatura.codigo_fatura}</p>
                  </div>
                  <div className="rounded-2xl bg-neutral-100 p-5 ring-1 ring-neutral-300">
                    <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Referência da Compra</p>
                    <p className="font-mono text-sm font-black text-indigo-600 mt-1">{creditoOrcamento.codigo_orcamento}</p>
                  </div>
                  <div className="rounded-2xl bg-neutral-100 p-5 ring-1 ring-neutral-300">
                    <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Status da Fatura</p>
                    <span className={`inline-block rounded-full px-3 py-0.5 text-[10px] font-bold tracking-widest uppercase mt-2.5 ${
                      selectedFatura.status === 'pago' ? 'bg-emerald-100 text-emerald-700' : 
                      selectedFatura.status === 'vencida' ? 'bg-red-100 text-red-700' :
                      selectedFatura.status === 'pendente_pagamento' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {selectedFatura.status === 'pendente_pagamento' ? 'Aguardando Pagamento' : selectedFatura.status}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 font-medium text-[#1a1a1a]">
                    <ClipboardList className="h-5 w-5 text-[#1a1a1a]/60" />
                    Itens do Pedido Original
                  </h4>
                  <div className="rounded-2xl border border-black/5 bg-white overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-[#f8f7f5] text-[10px] font-semibold text-[#1a1a1a]/40 uppercase tracking-widest">
                          <tr>
                            <th className="px-6 py-4">Item / Detalhes</th>
                            <th className="px-6 py-4 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {(creditoOrcamento.ordens_compra?.length > 0 || creditoOrcamento.ordens_assinatura?.length > 0
                            ? [
                                ...(creditoOrcamento.ordens_compra || []).map((item: any) => ({
                                  id: item.id,
                                  nome: item.produtos?.nome || 'Produto',
                                  codigo: item.produtos ? getProductDisplayCode(item.produtos as any) : 'PRODUTO',
                                  quantidade: item.quantidade || 1,
                                  imagem: item.produtos?.imagem_url,
                                  valor: item.produtos?.valor || 0
                                })),
                                ...(creditoOrcamento.ordens_assinatura || []).map((item: any) => ({
                                  id: item.id,
                                  nome: item.assinaturas?.nome || 'Assinatura',
                                  codigo: item.assinaturas?.codigo_assinatura || 'ASSINATURA',
                                  quantidade: item.quantidade || 1,
                                  imagem: item.assinaturas?.imagem_url,
                                  valor: item.assinaturas?.valor || 0
                                }))
                              ]
                            : [
                                {
                                  id: 'fallback',
                                  nome: creditoOrcamento.descricao_solicitacao?.split(' x')[0] || creditoOrcamento.titulo_solicitacao || 'Item do Pedido',
                                  codigo: creditoOrcamento.descricao_solicitacao?.toLowerCase().match(/assinatura|plano/i) || creditoOrcamento.titulo_solicitacao?.toLowerCase().match(/assinatura|plano/i) ? 'ASSINATURA VIP' : 'PRODUTO',
                                  quantidade: creditoOrcamento.quantidade || 1,
                                  imagem: null,
                                  valor: subtotalItens > 0 ? subtotalItens : (creditoOrcamento.valor_total || 0)
                                }
                              ]
                          ).map((item: any, idx: number) => (
                              <tr key={item.id || idx}>
                                <td className="px-6 py-5 align-top">
                                  <div className="flex gap-4 items-center">
                                    <div className="h-16 w-16 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-center overflow-hidden shrink-0">
                                      {item.imagem ? (
                                        <img src={item.imagem} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        <Package className="w-8 h-8 text-neutral-300" />
                                      )}
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full w-fit uppercase tracking-widest ${
                                        item.codigo?.includes('ASSINATURA') ? 'text-purple-600 bg-purple-50' : 'text-indigo-600 bg-indigo-50'
                                      }`}>
                                        {item.codigo}
                                      </span>
                                      <p className="font-bold text-[#1a1a1a] text-base tracking-tight">
                                        {item.nome} {item.quantidade > 1 ? `(x${item.quantidade})` : ''}
                                      </p>
                                      {item.quantidade > 1 && (
                                        <p className="text-xs font-semibold text-neutral-400">
                                          Valor unitário: {formatCurrency(item.valor)}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-5 text-right text-base font-black text-[#1a1a1a] align-top">
                                  {formatCurrency(item.valor * item.quantidade)}
                                </td>
                              </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-6 border-t border-black/5">
                  <h4 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em]">Resumo Financeiro da Compra</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium text-neutral-500">
                      <span>Subtotal dos Itens</span>
                      <span>{formatCurrency(subtotalItens)}</span>
                    </div>

                    {taxaEnt > 0 && (
                      <div className="flex justify-between text-sm font-medium text-neutral-500">
                        <span>Frete</span>
                        <span>{formatCurrency(taxaEnt)}</span>
                      </div>
                    )}

                    {desconto > 0 && (() => {
                      const pointsDiscount = faturaPointsDiscount !== null 
                        ? faturaPointsDiscount 
                        : 0;
                      const couponDiscount = Math.max(0, desconto - pointsDiscount);

                      return (
                        <div className="space-y-1.5 bg-emerald-50/50 rounded-2xl p-4 border border-emerald-100/50 my-2">
                          <div className="flex justify-between text-sm font-black text-emerald-800">
                            <span>Descontos Aplicados</span>
                            <span>-{formatCurrency(desconto)}</span>
                          </div>
                          
                          {pointsDiscount > 0 && (
                            <div className="flex justify-between text-xs text-emerald-600 font-bold pl-3 border-l-2 border-emerald-300">
                              <span>Carteira de Pontos ({Math.round(pointsDiscount * 105)} pts)</span>
                              <span>-{formatCurrency(pointsDiscount)}</span>
                            </div>
                          )}

                          {couponDiscount > 0 && (
                            <div className="flex justify-between text-xs text-emerald-600 font-bold pl-3 border-l-2 border-emerald-300">
                              <span>Cupom: {faturaCupomDesconto?.codigo_cupom || 'Desconto'}</span>
                              <span>-{formatCurrency(couponDiscount)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {acrescimo > 0 && (
                      <div className="flex justify-between text-sm font-bold text-amber-600">
                        <span>Juros do Crédito GSA</span>
                        <span>+ {formatCurrency(acrescimo)}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between border-t border-black/5 pt-4 gap-4">
                      <div>
                        <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Total Geral da Compra</p>
                        <p className="text-2xl font-black tracking-tight text-[#1a1a1a] mt-1">{formatCurrency(total)}</p>
                      </div>
                      <div className="text-center sm:text-right">
                        <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Esta Parcela ({selectedFatura.itens_faturados?.[0]?.descricao?.match(/Parcela \d+\/\d+/)?.[0] || '1/1'})</p>
                        <p className="text-2xl font-black tracking-tight text-indigo-600 mt-1">{formatCurrency(selectedFatura.valor_total)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Saldo Devedor Total</p>
                        <p className="text-3xl font-black tracking-tight text-indigo-600 mt-1">
                          {formatCurrency(
                            creditoFaturasRelacionadas
                              .filter((f: any) => f.status !== 'pago' && f.status !== 'cancelado')
                              .reduce((acc: number, f: any) => acc + (f.valor_final_pendente || f.valor_total || 0), 0)
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {creditoFaturasRelacionadas.length > 0 && (
                  <div className="space-y-4 pt-6 border-t border-black/5">
                    <h4 className="text-xs font-black text-neutral-400 uppercase tracking-[0.2em] flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-emerald-600" />
                      Plano de Parcelamento (Amortização de Crédito GSA)
                    </h4>
                    <div className="bg-emerald-50/40 rounded-2xl p-5 border border-emerald-100/50 flex flex-col gap-3">
                      <div className="flex justify-between items-center text-sm font-bold text-emerald-950">
                        <span>Forma de Pagamento Usada</span>
                        <span>Crédito GSA</span>
                      </div>
                      <div className="flex justify-between items-center text-xs font-bold text-emerald-800 border-b border-emerald-100 pb-2">
                        <span>Status Geral</span>
                        <span>{creditoFaturasRelacionadas.length} parcelas geradas {acrescimo > 0 ? 'com juros' : 'sem juros'}</span>
                      </div>
                      <div className="space-y-2.5">
                        {creditoFaturasRelacionadas.map((fat, idx) => {
                          const isCurrent = fat.id === selectedFatura.id;
                          return (
                            <div key={fat.id} className={`flex flex-col gap-1.5 p-2.5 rounded-xl border transition-all ${
                              isCurrent 
                                ? 'bg-indigo-50/70 border-indigo-200 shadow-sm' 
                                : 'bg-white/80 border-emerald-100/40 text-emerald-900'
                            }`}>
                              <div className="flex justify-between items-center text-xs">
                                <span className="font-bold">
                                  {idx + 1}ª Parcela ({fat.codigo_fatura || `Parcela ${idx+1}`})
                                  {isCurrent && <span className="ml-2 text-[9px] bg-indigo-600 text-white font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">Fatura Atual</span>}
                                </span>
                                <div className="flex items-center gap-3">
                                  <span className="font-extrabold">{formatCurrency(fat.valor_total)}</span>
                                  <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${
                                    fat.status === 'pago' 
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                                      : fat.status === 'cancelado' ? 'bg-neutral-200 text-neutral-700 border-neutral-300' 
                                      : 'bg-orange-100 text-orange-800 border-orange-200'
                                  }`}>
                                    {fat.status === 'pago' ? 'Pago' : fat.status === 'cancelado' ? 'Cancelado' : 'Pendente'}
                                  </span>
                                </div>
                              </div>
                              {fat.status === 'pago' && (
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-1 pt-2 border-t border-emerald-100/50 text-[10px] text-emerald-700/90 font-bold">
                                  <span>Baixado em: {fat.data_pagamento ? formatDate(fat.data_pagamento) : 'Data indisponível'}</span>
                                  <span>Forma de Pgto: <span className="uppercase">{fat.forma_pagamento_escolhida || 'Não informada'}</span></span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Quitação UI */}
                      {creditoOrcamento && creditoFaturasRelacionadas.filter(f => f.status !== 'pago' && f.status !== 'cancelado').length > 1 && (
                        <div className="bg-indigo-50 rounded-2xl p-5 border border-indigo-100 mt-6">
                          <h4 className="text-sm font-black text-indigo-900 mb-2">Opção de Quitação Antecipada</h4>
                          <p className="text-xs text-indigo-700/80 mb-4 font-medium">Você pode solicitar a quitação à vista de todas as parcelas restantes. O financeiro avaliará e poderá oferecer um desconto nos juros.</p>
                          
                          {!creditoOrcamento.status_quitacao_credito && (
                            <button
                              onClick={solicitarQuitacao}
                              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-[11px] uppercase tracking-wider hover:bg-indigo-700 transition-colors shadow-sm"
                            >
                              Solicitar Quitação à Vista
                            </button>
                          )}

                          {creditoOrcamento.status_quitacao_credito === 'analise_quitacao' && (
                            <div className="bg-indigo-100 text-indigo-800 p-3 rounded-xl flex items-center justify-center gap-2 font-bold text-[11px] uppercase tracking-wider">
                              <Loader2 className="w-4 h-4 animate-spin" /> Em Análise pelo Financeiro...
                            </div>
                          )}

                          {creditoOrcamento.status_quitacao_credito === 'aguardando_pagamento_quitacao' && (
                            <div className="space-y-4 bg-white p-4 rounded-xl border border-indigo-200 shadow-sm">
                              <div className="text-center">
                                <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-1">Oferta de Quitação Total</p>
                                <p className="text-3xl font-black text-emerald-600">{formatCurrency(creditoOrcamento.valor_quitacao_acordo || 0)}</p>
                                <p className="text-xs text-neutral-500 font-medium mt-2">Ao aceitar, uma nova fatura à vista será gerada e as parcelas antigas serão canceladas.</p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={gerarFaturaQuitacao}
                                  disabled={submitting}
                                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold text-[11px] uppercase tracking-wider hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                >
                                  Aceitar e Gerar Fatura
                                </button>
                                <button
                                  onClick={recusarOfertaQuitacao}
                                  disabled={submitting}
                                  className="px-4 py-3 bg-neutral-200 text-neutral-700 rounded-xl font-bold text-[11px] uppercase tracking-wider hover:bg-neutral-300 transition-colors disabled:opacity-50"
                                >
                                  Recusar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                <button 
                  onClick={() => setIsDetailOpen(false)}
                  className="w-full rounded-xl bg-[#1a1a1a] py-4 text-base font-bold text-white hover:bg-black/80 transition-all mt-6"
                >
                  Fechar Detalhes
                </button>
              </div>
            );
          }

          return (
            <div className="py-6 text-center text-neutral-500 italic">
              Não foi possível carregar os detalhes originais da compra.
            </div>
          );
        })()}
      </Modal>

      {/* Modal Acompanhamento de Aumento de Limite */}
      <Modal isOpen={isTrackingModalOpen} onClose={() => setIsTrackingModalOpen(false)} title="Acompanhamento de Aumento de Limite" size="xl">
        {renderAcompanhamento(true)}
      </Modal>
    </div>
  );
}

function getMovimentacaoTitle(tipo: string): string {
  switch (tipo) {
    case 'concessao_inicial': return 'Liberação Inicial';
    case 'compra': return 'Compra na GSA Store';
    case 'amortizacao': return 'Pagamento de Amortização';
    case 'ajuste_adm_aumento': return 'Aumento de Limite (Sistema)';
    case 'ajuste_adm_reducao': return 'Redução de Limite (Sistema)';
    case 'solicitacao_aumento_aprovada': return 'Aumento de Limite Aprovado';
    case 'estorno_compra': return 'Estorno de Compra';
    case 'cancelamento_limite': return 'Cancelamento do Limite de Crédito';
    case 'saque_credito': return 'Saque de Crédito GSA';
    default: return tipo;
  }
}

// Modal component reuse
interface ModalSolicitacaoProps {
  isOpen: boolean;
  onClose: () => void;
  profileData: any;
  setProfileData: (data: any) => void;
  limiteDesejado: string;
  setLimiteDesejado: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  tipo?: 'adesao' | 'alteracao';
  limiteAtual?: number;
}

function ModalSolicitacao({ 
  isOpen, 
  onClose, 
  profileData, 
  setProfileData, 
  limiteDesejado, 
  setLimiteDesejado, 
  onSubmit, 
  submitting,
  tipo = 'adesao',
  limiteAtual = 0
}: ModalSolicitacaoProps) {
  const [buscandoCep, setBuscandoCep] = useState(false);

  const isPersonalDataComplete = !!(profileData?.nome && profileData?.telefone && profileData?.tipo_pessoa && (profileData?.tipo_pessoa === 'pf' ? profileData?.cpf : profileData?.cnpj) && profileData?.email);
  const isAddressComplete = !!(profileData?.cep && profileData?.endereco && profileData?.numero && profileData?.bairro && profileData?.cidade && profileData?.estado);

  const [isPersonalOpen, setIsPersonalOpen] = useState(!isPersonalDataComplete);
  const [isAddressOpen, setIsAddressOpen] = useState(!isAddressComplete);

  useEffect(() => {
    if (isOpen) {
      setIsPersonalOpen(!isPersonalDataComplete);
      setIsAddressOpen(!isAddressComplete);
    }
  }, [isOpen]);

  const handleCEPChange = async (value: string) => {
    const limpo = value.replace(/\D/g, '');
    let masked = limpo;
    if (limpo.length > 5) {
      masked = limpo.slice(0, 5) + '-' + limpo.slice(5, 8);
    }
    setProfileData((prev: any) => ({ ...prev, cep: masked }));

    if (limpo.length === 8) {
      setBuscandoCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setProfileData((prev: any) => ({
            ...prev,
            cep: masked,
            endereco: data.logradouro || prev.endereco,
            bairro: data.bairro || prev.bairro,
            cidade: data.localidade || prev.cidade,
            estado: data.uf || prev.estado,
          }));
        } else {
          toast.error('CEP não encontrado.');
        }
      } catch {
        toast.error('Erro ao buscar CEP.');
      } finally {
        setBuscandoCep(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-[#fdfcfb] rounded-[2.5rem] border border-black/5 shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="p-6 md:p-8 border-b border-neutral-100 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-xl md:text-2xl font-black text-neutral-900">
              {tipo === 'adesao' ? 'Solicitação de Abertura de Crédito' : 'Solicitar Ajuste de Limite'}
            </h3>
            <p className="text-xs text-neutral-500 mt-1">Complete seus dados cadastrais obrigatórios.</p>
          </div>
          <button 
            onClick={onClose}
            className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          {/* Cadastro fields */}
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setIsPersonalOpen(!isPersonalOpen)}
              className="w-full flex justify-between items-center bg-indigo-50/50 p-3 rounded-xl hover:bg-indigo-50 transition-colors"
            >
              <h4 className="text-xs font-black uppercase text-indigo-600 tracking-wider">Dados Pessoais / Cadastrais</h4>
              <span className="text-indigo-600 font-bold">{isPersonalOpen ? '▲' : '▼'}</span>
            </button>
            
            {isPersonalOpen && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Nome Completo *</label>
                <input 
                  type="text"
                  required
                  value={profileData.nome}
                  onChange={e => setProfileData({ ...profileData, nome: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Telefone Celular *</label>
                <input 
                  type="text"
                  inputMode="tel"
                  required
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                  value={profileData.telefone}
                  onChange={e => setProfileData({ ...profileData, telefone: maskPhone(e.target.value) })}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Tipo de Pessoa *</label>
                <select
                  value={profileData.tipo_pessoa}
                  onChange={e => setProfileData({ ...profileData, tipo_pessoa: e.target.value as 'pf' | 'pj' })}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                >
                  <option value="pf">Pessoa Física (PF)</option>
                  <option value="pj">Pessoa Jurídica (PJ)</option>
                </select>
              </div>

              {profileData.tipo_pessoa === 'pf' ? (
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">CPF *</label>
                  <input 
                    type="text"
                    inputMode="numeric"
                    required
                    placeholder="000.000.000-00"
                    maxLength={14}
                    value={profileData.cpf}
                    onChange={e => setProfileData({ ...profileData, cpf: maskCPF(e.target.value) })}
                    onBlur={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      if (val && !validarCPF(val)) { toast.error('CPF inválido'); setProfileData({ ...profileData, cpf: '' }); }
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">CNPJ *</label>
                  <input 
                    type="text"
                    inputMode="numeric"
                    required
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                    value={profileData.cnpj}
                    onChange={e => setProfileData({ ...profileData, cnpj: maskCNPJ(e.target.value) })}
                    onBlur={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      if (val && !validarCNPJ(val)) { toast.error('CNPJ inválido'); setProfileData({ ...profileData, cnpj: '' }); }
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                  />
                </div>
              )}

              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">E-mail para Faturas *</label>
                <input 
                  type="email"
                  required
                  value={profileData.email}
                  onChange={e => setProfileData({ ...profileData, email: e.target.value })}
                  onBlur={(e) => {
                    if (e.target.value && !validarEmail(e.target.value)) { toast.error('E-mail inválido'); setProfileData({ ...profileData, email: '' }); }
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                />
              </div>
              </div>
            )}
          </div>

          {/* Endereço */}
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setIsAddressOpen(!isAddressOpen)}
              className="w-full flex justify-between items-center bg-indigo-50/50 p-3 rounded-xl hover:bg-indigo-50 transition-colors"
            >
              <h4 className="text-xs font-black uppercase text-indigo-600 tracking-wider">Endereço de Faturamento</h4>
              <span className="text-indigo-600 font-bold">{isAddressOpen ? '▲' : '▼'}</span>
            </button>
            
            {isAddressOpen && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">CEP *</label>
                <div className="relative">
                  <input 
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={9}
                    placeholder="00000-000"
                    value={profileData.cep}
                    onChange={e => handleCEPChange(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                  />
                  {buscandoCep && <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Endereço (Rua/Av) *</label>
                <input 
                  type="text"
                  required
                  value={profileData.endereco}
                  onChange={e => setProfileData({ ...profileData, endereco: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Número *</label>
                <input 
                  type="text"
                  inputMode="numeric"
                  required
                  value={profileData.numero}
                  onChange={e => setProfileData({ ...profileData, numero: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Bairro *</label>
                <input 
                  type="text"
                  required
                  value={profileData.bairro}
                  onChange={e => setProfileData({ ...profileData, bairro: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Cidade *</label>
                <input 
                  type="text"
                  required
                  value={profileData.cidade}
                  onChange={e => setProfileData({ ...profileData, cidade: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-700 mb-1">Estado (UF) *</label>
                <input 
                  type="text"
                  required
                  maxLength={2}
                  value={profileData.estado}
                  onChange={e => setProfileData({ ...profileData, estado: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                />
              </div>
              </div>
            )}
          </div>

          {/* Limite Solicitado */}
          <div className="space-y-4 pt-4 border-t border-neutral-100">
            <h4 className="text-xs font-black uppercase text-indigo-600 tracking-wider">Ajuste de Limite</h4>
            {tipo === 'alteracao' && (
              <p className="text-[11px] font-bold text-neutral-500">
                Seu limite atual: <span className="text-[#1a1a1a]">{formatCurrency(limiteAtual)}</span>
              </p>
            )}

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-[11px] font-bold text-neutral-700">
                  {tipo === 'adesao' ? 'Valor do Limite Desejado *' : 'Novo Valor de Limite Desejado *'}
                </label>
                <span className="text-lg font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">
                  {formatCurrency(Number(limiteDesejado) || 0)}
                </span>
              </div>
              {tipo === 'adesao' ? (
                <>
                  <input 
                    type="range"
                    min={0}
                    max={1000}
                    step={50}
                    value={limiteDesejado || 0}
                    onChange={e => setLimiteDesejado(e.target.value)}
                    className="w-full h-3 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-500 transition-all"
                  />
                  <div className="flex justify-between text-[10px] font-bold text-neutral-400 mt-2">
                    <span>R$ 0,00</span>
                    <span>R$ 1.000,00</span>
                  </div>
                </>
              ) : (
                <div className="relative mt-2">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-neutral-500 font-bold">R$</span>
                  </div>
                  <input 
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={limiteDesejado}
                    inputMode="numeric"
onChange={(e) => setLimiteDesejado(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-neutral-200 bg-white text-base font-bold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500"
                    placeholder="Digite o novo valor desejado"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-6 border-t border-neutral-100 flex flex-col sm:flex-row justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {tipo === 'adesao' ? 'Enviar Solicitação' : 'Solicitar Alteração'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

