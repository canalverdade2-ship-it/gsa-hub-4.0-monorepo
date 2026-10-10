import React, { useState } from 'react';
import {
  X, ArrowRightLeft, CheckCircle, CheckCircle2, AlertCircle, Clock, Upload, History, User, Building2,
  FileText, Flag, MessageSquare, Link, DollarSign, TrendingUp, Paperclip, Send, Trash2
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { isPast } from 'date-fns';
import { notificationService } from '../../../lib/notificationService';
import { logService } from '../../../lib/logService';
import { callAdminRpc, createAdminRequestId, deleteAdminEntityCascade } from '../../../lib/adminRpc';
import { DemandasComentarios } from './DemandasComentarios';
import { useFileViewer } from '../../../contexts/FileViewerContext';
import { useConfirm } from '../../../hooks/useConfirm';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { uploadFile, removeFile } from '../../../lib/storage';
import { useRealtimeSubscription } from '../../../hooks/useRealtime';

interface Props {
  demanda: any;
  initialTab?: string;
  historico: any[];
  colaboradorId?: string;
  colaboradorNome?: string;
  adminType?: 'admin' | 'colaborador';
  colaboradores: any[];
  prestadores: any[];
  onClose: () => void;
  onRefresh: () => void;
  onRefreshHistorico?: () => void;
}

const PRIO_CONFIG: Record<string, { label: string; color: string }> = {
  urgente: { label: '🔴 Urgente', color: 'bg-red-100 text-red-700' },
  alta:    { label: '🟠 Alta',    color: 'bg-orange-100 text-orange-700' },
  normal:  { label: '🔵 Normal',  color: 'bg-blue-100 text-blue-700' },
  baixa:   { label: '⚪ Baixa',   color: 'bg-neutral-100 text-neutral-500' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  aberta:                      { label: 'Não Iniciado',          color: 'bg-amber-100 text-amber-700' },
  ativa:                       { label: 'Em Execução',           color: 'bg-blue-100 text-blue-700' },
  em_negociacao:               { label: '💬 Em Negociação',      color: 'bg-amber-100 text-amber-800' },
  contraproposta_prestador:    { label: '↩ Contra-Proposta',     color: 'bg-indigo-100 text-indigo-800' },
  contraproposta_admin_final:  { label: '↪ Proposta Final ADM', color: 'bg-orange-100 text-orange-800' },
  em_analise:                  { label: 'Em Análise',            color: 'bg-violet-100 text-violet-700' },
  em_ajuste:                   { label: 'Em Ajuste',             color: 'bg-orange-100 text-orange-700' },
  concluida:                   { label: 'Concluída',             color: 'bg-emerald-100 text-emerald-700' },
  concluida_interna:           { label: 'Em Análise (Vendas)',   color: 'bg-violet-100 text-violet-700' },
  finalizada:                  { label: 'Concluída',             color: 'bg-emerald-100 text-emerald-700' },
  cancelada:                   { label: 'Cancelada',             color: 'bg-red-100 text-red-700' },
  pendente_aceite:             { label: 'Ag. Aceite',            color: 'bg-yellow-100 text-yellow-700' },
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'image/gif'];
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

const validateFile = (file: File): string | null => {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Tipo de arquivo não permitido: ${file.type}. Use: JPG, PNG, PDF, WebP`;
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `Arquivo muito grande: ${(file.size / 1024 / 1024).toFixed(1)}MB. Máximo: ${MAX_SIZE_MB}MB`;
  }
  return null;
};

export function DemandasDetalhesModal({
  demanda,
  initialTab,
  historico,
  colaboradorId,
  colaboradorNome,
  adminType,
  colaboradores,
  prestadores,
  onClose,
  onRefresh,
  onRefreshHistorico
}: Props) {
  const confirmHook = useConfirm();
  const { confirm } = confirmHook;
  const { openFile } = useFileViewer();
  type AbaType = 'detalhes' | 'transferir' | 'entregar' | 'ajuste' | 'comentarios' | 'negociacao' | 'suporte_cliente';
  const [aba, setAba] = useState<AbaType>((initialTab as AbaType) || 'detalhes');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Transfer
  const [transferTarget, setTransferTarget] = useState<'colaborador' | 'prestador' | 'admin'>('colaborador');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferFiles, setTransferFiles] = useState<File[]>([]);
  // Novo: valor proposto ao transferir para prestador
  const [valorPropostoTransfer, setValorPropostoTransfer] = useState('');
  const [transferPrazoEntrega, setTransferPrazoEntrega] = useState('');

  // Delivery
  const [deliveryFiles, setDeliveryFiles] = useState<File[]>([]);
  const [deliveryLink, setDeliveryLink] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Ajuste
  const [ajusteDesc, setAjusteDesc] = useState('');
  const [ajustePrazo, setAjustePrazo] = useState('');

  // Negociação (admin responde contraproposta do prestador)
  const [novoValorAdmin, setNovoValorAdmin] = useState('');
  const [motivoNegociacao, setMotivoNegociacao] = useState('');

  const vencida = demanda.prazo_limite && isPast(new Date(demanda.prazo_limite)) && demanda.status !== 'concluida';
  const prio = PRIO_CONFIG[demanda.prioridade || 'normal'];
  const status = STATUS_CONFIG[demanda.status] || { label: demanda.status?.replace(/_/g, ' ') || '—', color: 'bg-neutral-100 text-neutral-500' };
  const isAdmin = adminType === 'admin';
  const isConcluida = demanda.status === 'concluida' || demanda.status === 'concluida_interna' || demanda.status === 'finalizada' || demanda.status === 'cancelada';
  const isAguardandoVendas = demanda.status === 'concluida_interna';

  // flags de negociação
  const isEmNegociacao = demanda.status === 'em_negociacao';
  const isContrapropPrestador = demanda.status === 'contraproposta_prestador';
  const isContrapropAdminFinal = demanda.status === 'contraproposta_admin_final';
  const isInNegociation = isEmNegociacao || isContrapropPrestador || isContrapropAdminFinal;

  useRealtimeSubscription([
    {
      table: 'prestador_demandas',
      filter: `id=eq.${demanda.id}`,
      onChange: () => {
        onRefresh();
      },
      debounceMs: 300,
    },
    {
      table: 'prestador_demandas_historico',
      filter: `demanda_id=eq.${demanda.id}`,
      onChange: () => {
        onRefreshHistorico?.();
      },
      debounceMs: 300,
    },
  ], [demanda.id]);

  // ─────────────────── HANDLERS ────────────────────

  const checkStatusRaceCondition = async () => {
    const { data: current } = await supabase
      .from('prestador_demandas')
      .select('status, updated_at')
      .eq('id', demanda.id)
      .single();

    if (current?.status !== demanda.status) {
      toast.error('O status desta demanda foi alterado por outro usuário. Recarregue a página.');
      return false;
    }
    return true;
  };

  const updateDemand = async (
    patch: Record<string, unknown>,
    history?: {
      type: 'transferencia' | 'aceite' | 'entrega' | 'ajuste' | 'recusa' | 'negociacao' | 'finalizacao';
      reason: string;
      colaboradorDestinoId?: string | null;
      prestadorOrigemId?: string | null;
      prestadorDestinoId?: string | null;
      valorProposto?: number | null;
    },
  ) => {
    const status = String(patch.status || '');
    const fallbackType = status === 'em_ajuste' ? 'ajuste'
      : status === 'concluida_interna' || status === 'em_analise' ? 'entrega'
      : status === 'contraproposta_admin_final' || status === 'em_negociacao' ? 'negociacao'
      : status === 'aguardando_atribuicao' ? 'recusa'
      : 'aceite';
    return callAdminRpc('gsa_admin_transition_provider_demand', {
      p_demanda_id: demanda.id,
      p_expected_status: demanda.status,
      p_patch: patch,
      p_event_type: history?.type || fallbackType,
      p_event_reason: history?.reason || `Demanda atualizada pela administração. Novo status: ${status || demanda.status}.`,
      p_colaborador_destino_id: history?.colaboradorDestinoId || null,
      p_prestador_origem_id: history?.prestadorOrigemId || null,
      p_prestador_destino_id: history?.prestadorDestinoId || null,
      p_valor_proposto: history?.valorProposto ?? null,
      p_request_id: createAdminRequestId(),
    });
  };

  const addOsNote = async (nota: string) => {
    if (!demanda.os_id) return;
    await callAdminRpc('gsa_admin_add_os_note', {
      p_os_id: demanda.os_id,
      p_nota: nota,
      p_request_id: createAdminRequestId(),
    });
  };

  const sendOsSupportMessage = async (mensagem: string) => {
    if (!demanda.os_id) return;
    await callAdminRpc('gsa_admin_send_os_support_message', {
      p_os_id: demanda.os_id,
      p_mensagem: mensagem,
      p_request_id: createAdminRequestId(),
    });
  };
  const handleStartService = async () => {
    setIsSubmitting(true);
    try {
      if (!(await checkStatusRaceCondition())) return;
      await updateDemand(
        { status: 'ativa', data_inicio: new Date().toISOString() },
        { type: 'aceite', reason: 'Execução iniciada pela Gestão Interna.' },
      );
      
      // Log Action
      await logService.logAction({
        acao: 'INICIAR_DEMANDA_INTERNA',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Sistema',
        detalhes: `Iniciou a execução da demanda: ${demanda.titulo}`
      });

      toast.success('Execução iniciada!');
      onRefreshHistorico?.();
      onRefresh(); onClose();
    } catch { toast.error('Erro ao iniciar.'); }
    finally { setIsSubmitting(false); }
  };

  const handleAceitarDemanda = async () => {
    setIsSubmitting(true);
    try {
      if (!(await checkStatusRaceCondition())) return;
      await updateDemand(
        { status_aceite: 'aceito', status: 'aberta' },
        { type: 'aceite', reason: 'Demanda aceita pela Gestão Interna.' },
      );
      
      // Log Action
      await logService.logAction({
        acao: 'ACEITAR_DEMANDA_INTERNA',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Sistema',
        detalhes: `Aceitou a demanda: ${demanda.titulo}`
      });

      toast.success('Demanda aceita!');
      onRefreshHistorico?.();
      onRefresh(); onClose();
    } catch { toast.error('Erro ao aceitar.'); }
    finally { setIsSubmitting(false); }
  };

  const handleRecusarDemanda = async () => {
    const motivo = prompt('Informe o motivo da recusa:');
    if (!motivo) return;
    setIsSubmitting(true);
    try {
      if (!(await checkStatusRaceCondition())) return;
      await updateDemand(
        { status_aceite: 'recusado', motivo_recusa: motivo, colaborador_id: null, status: 'aguardando_atribuicao' },
        { type: 'recusa', reason: `Demanda recusada pela Gestão Interna: ${motivo}` },
      );
      
      // Log Action
      await logService.logAction({
        acao: 'RECUSAR_DEMANDA_INTERNA',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Sistema',
        detalhes: `Recusou a demanda: ${demanda.titulo}. Motivo: ${motivo}`
      });

      toast.success('Demanda devolvida ao pool central.');
      onRefreshHistorico?.();
      onRefresh(); onClose();
    } catch { toast.error('Erro ao recusar.'); }
    finally { setIsSubmitting(false); }
  };

  // Admin assume a demanda diretamente — sem transferir para colaborador/prestador
  const handleAssumeAndStart = async () => {
    setIsSubmitting(true);
    try {
      if (!(await checkStatusRaceCondition())) return;
      // 1. Marca como ativa — sem colaborador nem prestador vinculado
      await updateDemand(
        {
          status: 'ativa',
          data_inicio: new Date().toISOString(),
          colaborador_id: null,
          prestador_id: null
        },
        { type: 'aceite', reason: 'Demanda assumida diretamente pelo Sistema. Execução iniciada internamente.' },
      );

      // 3. Nota na OS + notificação ao cliente
      if (demanda.os_id) {
        try {
          await addOsNote('✅ Sua demanda foi iniciada e está em atendimento pela equipe interna da GSA.');
        } catch (error) {
          console.error('Erro ao adicionar nota na OS:', error);
          toast.error('Erro ao adicionar nota na OS.');
        }

        const clienteId = demanda.ordem_servico?.cliente_id;
        const codigoOs = demanda.ordem_servico?.codigo_os;
        if (clienteId) {
          await notificationService.notifyClient(
            clienteId,
            '🚀 Serviço em Andamento!',
            `Sua ordem de serviço ${codigoOs || ''} foi iniciada e está em atendimento pela equipe GSA.`,
            'servicos',
            'os_atualizada',
            { tab: 'andamento', itemId: demanda.os_id, prioridade: 'normal' }
          );
        }
      }

      // 4. Log de auditoria
      await logService.logAction({
        acao: 'ASSUMIR_DEMANDA_ADMIN',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Sistema',
        detalhes: `Assumiu diretamente a demanda: ${demanda.titulo}`
      });

      toast.success('Demanda assumida! Execução iniciada. Cliente notificado.');
      onRefreshHistorico?.();
      onRefresh(); onClose();
    } catch { toast.error('Erro ao assumir demanda.'); }
    finally { setIsSubmitting(false); }
  };

  // Aceitar o valor proposto pelo prestador (usar o valor_proposto_prestador como final)
  const handleAceitarProposta = async () => {
    setIsSubmitting(true);
    try {
      if (!(await checkStatusRaceCondition())) return;
      const valorFinal = demanda.valor_proposto_prestador;
      await updateDemand(
        {
          status: 'ativa',
          data_inicio: new Date().toISOString(),
          valor_final: valorFinal
        },
        {
          type: 'aceite',
          reason: `Contraproposta do prestador aceita pelo Sistema. Valor final: ${formatCurrency(valorFinal)}. Serviço em execução.`,
          prestadorDestinoId: demanda.prestador_id,
          valorProposto: valorFinal,
        },
      );

      // Notificar o prestador que a proposta foi aceita
      if (demanda.prestador_id) {
        await notificationService.notifyProvider(
          demanda.prestador_id,
          '✅ Proposta Aceita!',
          `Sua proposta de ${formatCurrency(valorFinal)} foi aceita para a demanda "${demanda.titulo || '#' + demanda.id.slice(0, 6)}". O serviço foi iniciado.`,
          'demandas',
          'demanda_atribuida',
          { itemId: demanda.id, prioridade: 'alta' }
        );
      }

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Sistema',
        acao: 'ACEITAR_CONTRAPROPOSTA_DEMANDA',
        detalhes: `Aceitou contraproposta da demanda #${demanda.id.slice(0, 8)} no valor de ${formatCurrency(valorFinal)}`
      });

      toast.success('Proposta aceita! Serviço iniciado.');
      onRefreshHistorico?.();
      onRefresh(); onClose();
    } catch (err: any) { 
      console.error('Erro ao aceitar proposta:', err);
      toast.error(err.message || 'Erro ao aceitar proposta.'); 
    } finally {
      setIsSubmitting(false);
    }
  };

  // Admin faz contraproposta final para o prestador
  const handleContrapropostaAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoValorAdmin) { toast.error('Informe o novo valor.'); return; }
    setIsSubmitting(true);
    try {
      if (!(await checkStatusRaceCondition())) return;
      await updateDemand(
        {
          status: 'contraproposta_admin_final',
          valor_proposto_admin: Number(novoValorAdmin),
          motivo_negociacao: motivoNegociacao,
        },
        {
          type: 'negociacao',
          reason: `Contraproposta enviada ao prestador no valor de ${formatCurrency(Number(novoValorAdmin))}. ${motivoNegociacao || ''}`,
          prestadorDestinoId: demanda.prestador_id,
          valorProposto: Number(novoValorAdmin),
        },
      );
      
      // Notificar prestador da proposta final
      if (demanda.prestador_id) {
        await notificationService.notifyProvider(
          demanda.prestador_id,
          '📩 Nova Proposta do Sistema',
          `O Sistema enviou uma proposta final de ${formatCurrency(Number(novoValorAdmin))} para a demanda "${demanda.titulo || '#' + demanda.id.slice(0, 6)}". Acesse o painel para aceitar ou recusar.`,
          'demandas',
          'demanda_contraproposta',
          { itemId: demanda.id, prioridade: 'alta' }
        );
      }

      // Log Action
      await logService.logAction({
        acao: 'ENVIAR_CONTRAPROPOSTA_ADMIN',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Sistema',
        detalhes: `Enviou contraproposta para a demanda: ${demanda.titulo}. Novo valor: ${formatCurrency(Number(novoValorAdmin))}. Motivo: ${motivoNegociacao}`
      });

      toast.success('Proposta final enviada ao prestador!');
      onRefreshHistorico?.();
      onRefresh(); onClose();
    } catch { toast.error('Erro ao enviar proposta final.'); }
    finally { setIsSubmitting(false); }
  };

  // Admin recusa a contraproposta e cancela a demanda com o prestador (volta para pool)
  const handleRecusarContrapropostaAdmin = async () => {
    const motivo = prompt('Motivo para recusar a contraproposta do prestador:');
    if (!motivo) return;
    setIsSubmitting(true);
    try {
      if (!(await checkStatusRaceCondition())) return;
      await updateDemand(
        {
          status: 'aguardando_atribuicao',
          prestador_id: null,
          motivo_recusa: motivo,
          valor_proposto_prestador: null,
        },
        {
          type: 'recusa',
          reason: `Proposta do prestador recusada: ${motivo}. Demanda voltou ao pool central.`,
          prestadorOrigemId: demanda.prestador_id,
        },
      );
      if (demanda.prestador_id) {
        await notificationService.notifyProvider(
          demanda.prestador_id,
          '❌ Proposta Recusada',
          `Sua contraproposta para a demanda "${demanda.titulo || '#' + demanda.id.slice(0, 6)}" foi recusada. A demanda foi devolvida à gestão interna.`,
          'demandas',
          'demanda_recusada',
          { itemId: demanda.id, prioridade: 'alta' }
        );
      }

      // Log Action
      await logService.logAction({
        acao: 'RECUSAR_PROPOSTA_PRESTADOR',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Sistema',
        detalhes: `Recusou a proposta do prestador para a demanda: ${demanda.titulo}. Motivo: ${motivo}`
      });

      toast.success('Proposta recusada. Demanda devolvida ao pool central.');
      onRefreshHistorico?.();
      onRefresh(); onClose();
    } catch { toast.error('Erro ao recusar proposta.'); }
    finally { setIsSubmitting(false); }
  };

  const handleCancelDemanda = async () => {
    const motivo = prompt('Por que deseja cancelar esta demanda?');
    if (!motivo) return;

    if (!await confirm({ title: 'Atenção', message: 'TEM CERTEZA? O cancelamento é irreversível e cancelará a OS e Orçamento vinculados.' })) return;

    setIsSubmitting(true);
    try {
      if (!(await checkStatusRaceCondition())) return;
      const result = await callAdminRpc<{ success?: boolean }>('gsa_admin_cancelar_demanda', {
        p_demanda_id: demanda.id,
        p_motivo: motivo,
      });
      if (!result?.success) throw new Error('O servidor não confirmou o cancelamento da demanda.');

      // Notificar quem estava com a demanda
      if (demanda.colaborador_id) {
        await notificationService.notifyAdmin(
          '❌ Demanda Cancelada',
          `A demanda "${demanda.titulo || '#' + demanda.id.slice(0, 6)}" foi cancelada pelo Sistema.`,
          'demandas', 'sistema',
          { adminId: demanda.colaborador_id, itemId: demanda.id, prioridade: 'alta' }
        );
      }
      if (demanda.prestador_id) {
        await notificationService.notifyProvider(
          demanda.prestador_id,
          '❌ Demanda Cancelada',
          `A demanda "${demanda.titulo || '#' + demanda.id.slice(0, 6)}" foi cancelada pelo Sistema.`,
          'demandas',
          'demanda_cancelada',
          { itemId: demanda.id, prioridade: 'alta' }
        );
      }

      toast.success('Demanda cancelada com sucesso.');
      onRefreshHistorico?.();
      onRefresh(); onClose();
    } catch (err: any) {
      console.error('Erro ao cancelar demanda:', err);
      toast.error(err.message || 'Erro ao cancelar demanda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetId) { toast.error('Selecione o destino.'); return; }
    if (transferTarget === 'prestador' && !valorPropostoTransfer) { toast.error('Informe o valor proposto ao prestador.'); return; }

    setIsSubmitting(true);
    const uploadedPaths: string[] = [];
    try {
      if (!(await checkStatusRaceCondition())) return;
      const urls: string[] = [];
      if (transferFiles.length > 0) {
        const uploadPromises = transferFiles.map(async (file) => {
          const ext = file.name.split('.').pop();
          const path = `transferencias/${demanda.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const __up = await uploadFile(file, 'entregas_demandas', path);
          uploadedPaths.push(__up.path);
          return __up.path;
        });
        const uploadedUrls = await Promise.all(uploadPromises);
        urls.push(...uploadedUrls);
      }

      const existingTransfer = Array.isArray(demanda.arquivos_transferencia) ? demanda.arquivos_transferencia : [];
      const upd: any = {};
      
      // Apenas atualiza arquivos se houver novos, preservando os anteriores
      if (urls.length > 0) {
        upd.arquivos_transferencia = [...existingTransfer, ...urls];
      }

      if (transferTarget === 'colaborador') {
        upd.colaborador_id = selectedTargetId;
        upd.prestador_id = null;
        upd.status = 'aberta';
        upd.status_aceite = 'pendente_aceite';
      } else if (transferTarget === 'prestador') {
        upd.prestador_id = selectedTargetId;
        upd.colaborador_id = null;
        upd.status = 'em_negociacao';
        upd.valor_proposto_admin = Number(valorPropostoTransfer);
        upd.prazo_entrega = transferPrazoEntrega ? new Date(transferPrazoEntrega).toISOString() : null;
        upd.valor_proposto_prestador = null;
        upd.valor_final = null;
        upd.motivo_negociacao = null;
        upd.is_contraproposta_final = false;
      }

      try {
        await updateDemand(upd, {
          type: 'transferencia',
          reason: transferTarget === 'prestador'
            ? `Demanda enviada para prestador com proposta de ${formatCurrency(Number(valorPropostoTransfer))}. ${transferReason || ''}${urls.length > 0 ? '\n\nArquivos: ' + urls.join(', ') : ''}`
            : `Transferida para colaborador. ${transferReason || ''}${urls.length > 0 ? '\n\nArquivos: ' + urls.join(', ') : ''}`,
          colaboradorDestinoId: transferTarget === 'colaborador' ? selectedTargetId : null,
          prestadorDestinoId: transferTarget === 'prestador' ? selectedTargetId : null,
          valorProposto: transferTarget === 'prestador' ? Number(valorPropostoTransfer) : null,
        });
      } catch (error) {
        console.error('Erro ao transferir demanda:', error);
        toast.error('Erro ao transferir demanda.');
        return;
      }

      // Notificações corretas por tipo de destino
      if (transferTarget === 'colaborador' && selectedTargetId) {
        await notificationService.notifyAdmin(
          '🔄 Demanda Transferida',
          `Demanda "${demanda.titulo || '#' + demanda.id.slice(0, 6)}" foi atribuída a você.`,
          'demandas', 'demanda_atribuida',
          { colaboradorId: selectedTargetId, itemId: demanda.id, prioridade: 'alta' }
        );
      } else if (transferTarget === 'prestador' && selectedTargetId) {
        // Notificar o PRESTADOR com a proposta
        await notificationService.notifyProvider(
          selectedTargetId,
          '📋 Nova Demanda com Proposta',
          `Você recebeu uma nova demanda "${demanda.titulo || '#' + demanda.id.slice(0, 6)}" com proposta de ${formatCurrency(Number(valorPropostoTransfer))}. Acesse o painel para aceitar, negociar ou recusar.`,
          'demandas',
          'demanda_atribuida',
          { itemId: demanda.id, prioridade: 'alta' }
        );
      }

      toast.success(
        transferTarget === 'admin' ? 'Enviado para análise!' :
        transferTarget === 'prestador' ? '📤 Proposta enviada ao prestador! Aguardando resposta.' :
        'Transferido com sucesso!'
      );

      // Log Action
      await logService.logAction({
        acao: 'TRANSFERIR_DEMANDA_INTERNA',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Sistema',
        detalhes: `Transferiu a demanda ${demanda.titulo} para ${transferTarget} (${selectedTargetId}). Valor proposto: ${valorPropostoTransfer}`
      });

      onRefreshHistorico?.();
      onRefresh(); onClose();
    } catch (err: any) {
      await removeFile(uploadedPaths);
      toast.error(err.message || 'Erro ao transferir demanda.');
    }
    finally { setIsSubmitting(false); }
  };

  const handleDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const uploadedPaths: string[] = [];
    try {
      if (!(await checkStatusRaceCondition())) return;
      const urls: string[] = [];
      if (deliveryFiles.length > 0) {
        const uploadPromises = deliveryFiles.map(async (file) => {
          const ext = file.name.split('.').pop();
          const path = `entregas/${demanda.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const __up = await uploadFile(file, 'entregas_demandas', path);
          uploadedPaths.push(__up.path);
          return __up.path;
        });
        const uploadedUrls = await Promise.all(uploadPromises);
        urls.push(...uploadedUrls);
      }
      // Usa concluida_interna para sinalizar que a gestão interna concluiu mas a finalização oficial fica no módulo Demandas
      try {
        await updateDemand(
          {
            status: 'concluida_interna',
            data_conclusao: new Date().toISOString(),
            arquivos_resultado: urls,
            link_resultado: deliveryLink
          },
          {
            type: 'entrega',
            reason: `Entrega pela Gestão Interna. ${deliveryNotes}. ${urls.length > 0 ? '\n\nAnexos: ' + urls.join(', ') : ''}${deliveryLink ? '\n\nLink: ' + deliveryLink : ''}\nAguardando finalização no módulo Demandas.`,
          },
        );
      } catch (error) {
        await removeFile(uploadedPaths);
        console.error('Erro ao concluir demanda:', error);
        toast.error('Erro ao concluir demanda.');
        return;
      }

      // Registrar nota na OS
      if (demanda.os_id) {
        try {
          await addOsNote('Gestão Interna concluiu a demanda. Aguardando finalização oficial pelo Sistema.');
        } catch (error) {
          console.error('Erro ao adicionar nota na OS:', error);
          toast.error('Erro ao adicionar nota na OS.');
        }

        // Quando o admin assumiu diretamente (sem prestador/colaborador), notifica o cliente também
        if (isAdmin && !demanda.prestador_id && !demanda.colaborador_id) {
          const clienteId = demanda.ordem_servico?.cliente_id;
          const codigoOs = demanda.ordem_servico?.codigo_os;
          if (clienteId) {
            await notificationService.notifyClient(
              clienteId,
              '📋 Serviço Concluído — Aguardando Finalização',
              `O atendimento da sua ordem de serviço ${codigoOs || ''} foi concluído pela equipe GSA. Em breve você receberá a confirmação final.`,
              'servicos',
              'os_atualizada',
              { tab: 'andamento', itemId: demanda.os_id, prioridade: 'normal' }
            );
          }
        }
      }

      // Notificar admin que a demanda está pronta para finalização
      await notificationService.notifyAdmin(
        '✅ Gestão Interna Concluiu',
        `A demanda "${demanda.titulo || '#' + demanda.id.slice(0, 6)}" foi concluída pela Gestão Interna e está aguardando finalização no módulo Demandas.`,
        'demandas', 'demanda_concluida_interna',
        { itemId: demanda.id, prioridade: 'alta' }
      );

      // Log Action
      await logService.logAction({
        acao: 'ENTREGAR_DEMANDA_INTERNA',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Sistema',
        detalhes: `Entregou a execução da demanda: ${demanda.titulo}. Notas: ${deliveryNotes}`
      });

      toast.success('Demanda entregue pela Gestão Interna! Aguardando finalização no módulo Demandas.');
      onRefreshHistorico?.();
      onRefresh(); onClose();
    } catch (err: any) { toast.error(err.message || 'Erro ao concluir demanda.'); }
    finally { setIsSubmitting(false); }
  };

  const handleAjuste = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (!(await checkStatusRaceCondition())) return;
      await updateDemand(
        { status: 'em_ajuste', ajuste_solicitado: ajusteDesc, prazo_ajuste: ajustePrazo ? new Date(ajustePrazo).toISOString() : null, status_ajuste: 'solicitado' },
        { type: 'ajuste', reason: `Ajuste solicitado: ${ajusteDesc}` },
      );
      if (demanda.colaborador_id) {
        await notificationService.notifyAdmin('⚠️ Ajuste Solicitado', `O Sistema solicitou correções na demanda "${demanda.titulo || '#' + demanda.id.slice(0, 6)}".`, 'demandas', 'sistema', { adminId: demanda.colaborador_id, itemId: demanda.id, prioridade: 'alta' });
      } else if (demanda.prestador_id) {
        await notificationService.notifyProvider(
          demanda.prestador_id,
          '⚠️ Ajuste Solicitado',
          `O Sistema solicitou ajustes na demanda "${demanda.titulo || '#' + demanda.id.slice(0, 6)}". Acesse para verificar o que precisa ser corrigido.`,
          'demandas',
          'demanda_ajuste',
          { itemId: demanda.id, prioridade: 'alta', tab: 'ativas' }
        );
      }

      // Log Action
      await logService.logAction({
        acao: 'SOLICITAR_AJUSTE_DEMANDA',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Sistema',
        detalhes: `Solicitou ajustes na demanda: ${demanda.titulo}. Ajuste: ${ajusteDesc}. Novo prazo: ${ajustePrazo}`
      });

      toast.success('Ajuste solicitado!');
      onRefreshHistorico?.();
      onRefresh(); onClose();
    } catch { toast.error('Erro ao solicitar ajuste.'); }
    finally { setIsSubmitting(false); }
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      if (!(await checkStatusRaceCondition())) return;
      // Usa concluida_interna para sinalizar que a gestão interna concluiu. 
      // A finalização oficial (status 'concluida') ocorrerá no módulo de Vendas.
      await updateDemand(
        {
          status: 'concluida_interna',
          data_conclusao: new Date().toISOString()
        },
        { type: 'entrega', reason: 'Aprovado pela Gestão Interna. Enviado para finalização oficial no módulo de Vendas.' },
      );

      // Registrar nota na OS
      if (demanda.os_id) {
        try {
          await addOsNote('Gestão Interna aprovou e concluiu a demanda. Aguardando finalização oficial pelo Sistema.');
        } catch (error) {
          console.error('Erro ao adicionar nota na OS:', error);
          toast.error('Erro ao adicionar nota na OS.');
        }
      }

      // Notificar admin
      await notificationService.notifyAdmin(
        '✅ Gestão Interna Concluiu',
        `A demanda "${demanda.titulo || '#' + demanda.id.slice(0, 6)}" foi aprovada pela Gestão Interna e está pronta para finalização.`,
        'demandas', 'demanda_concluida_interna',
        { itemId: demanda.id, prioridade: 'alta' }
      );
      if (demanda.prestador_id) {
        await notificationService.notifyProvider(
          demanda.prestador_id,
          '✅ Demanda Aprovada',
          `Sua entrega para a demanda "${demanda.titulo || '#' + demanda.id.slice(0, 6)}" foi aprovada pelo Sistema e está sendo finalizada!`,
          'demandas',
          'demanda_concluida',
          { itemId: demanda.id, prioridade: 'normal' }
        );
      }

      // Log Action
      await logService.logAction({
        acao: 'APROVAR_DEMANDA_INTERNA',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Sistema',
        detalhes: `Aprovou a finalização da demanda: ${demanda.titulo}`
      });

      toast.success('Aprovado! Demanda enviada para finalização oficial no módulo de Vendas.');
      onRefreshHistorico?.();
      onRefresh(); onClose();
    } catch { toast.error('Erro ao aprovar.'); }
    finally { setIsSubmitting(false); }
  };

  // Exclusão de Demanda em Cascata (Administrador Master)
  const handleDeleteDemandaCascade = async () => {
    const ok = await confirm({
      title: 'Excluir Demanda de Ponta a Ponta',
      message: 'Tem certeza que deseja excluir esta demanda definitivamente? O histórico, anexos, mensagens e vínculos operacionais serão removidos do sistema sem deixar pendências.',
      confirmLabel: 'Excluir Definitivamente',
      cancelLabel: 'Voltar',
      variant: 'danger'
    });
    if (!ok) return;

    setIsSubmitting(true);
    try {
      const result = await deleteAdminEntityCascade('demanda', demanda.id, 'Exclusão solicitada pelo Administrador Master');
      if (!result?.success) {
        throw new Error(result?.message || 'Falha ao excluir demanda.');
      }
      toast.success('Demanda excluída com sucesso de ponta a ponta!');
      onRefresh();
      onClose();
    } catch (err: any) {
      console.error('Erro ao excluir demanda:', err);
      toast.error(err.message || 'Erro ao excluir demanda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─────────────────── ABAS ────────────────────

  const ABAS = [
    { id: 'detalhes', label: 'Detalhes', icon: FileText },
    { id: 'comentarios', label: `Comentários${demanda.total_comentarios > 0 ? ` (${demanda.total_comentarios})` : ''}`, icon: MessageSquare },
    ...(demanda.os_id ? [{ id: 'suporte_cliente', label: 'Suporte Cliente', icon: MessageSquare }] : []),
    // Aba de negociação: aparece para admin quando há contraproposta do prestador
    ...(isAdmin && isContrapropPrestador ? [{ id: 'negociacao', label: '💬 Negociação', icon: DollarSign }] : []),
    ...(!isConcluida && !isInNegociation ? [{ id: 'transferir', label: 'Transferir', icon: ArrowRightLeft }] : []),
    // aba transferir ainda aparece em em_negociacao para poder reatribuir
    ...(isEmNegociacao || isContrapropAdminFinal ? [{ id: 'transferir', label: 'Reatribuir', icon: ArrowRightLeft }] : []),
    // Entregar: visível para colaboradores sempre; para admin, apenas quando assumiu diretamente (sem prestador/colaborador)
    ...(!isConcluida && (adminType !== 'admin' || (!demanda.prestador_id && !demanda.colaborador_id && demanda.status === 'ativa')) ? [{ id: 'entregar', label: 'Entregar', icon: CheckCircle2 }] : []),
    ...(isAdmin && demanda.status === 'em_analise' ? [{ id: 'ajuste', label: 'Solicitar Ajuste', icon: AlertCircle }] : []),
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-neutral-900/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[96vw] sm:max-w-4xl md:max-w-6xl lg:max-w-7xl bg-white rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">

        {/* Banner de negociação em andamento */}
        {isInNegociation && (
          <div className="bg-amber-500 text-white px-6 py-3 flex items-center gap-3 text-sm font-bold shrink-0">
            <DollarSign className="h-4 w-4 shrink-0" />
            {isEmNegociacao && 'Proposta enviada. Aguardando resposta do prestador...'}
            {isContrapropPrestador && '⚡ Prestador fez uma CONTRAPROPOSTA! Veja a aba "Negociação".'}
            {isContrapropAdminFinal && 'Sua proposta final foi enviada ao prestador. Aguardando aceite.'}
          </div>
        )}

        {/* Alerta vencida */}
        {vencida && !isInNegociation && (
          <div className="bg-red-500 text-white px-6 py-3 flex items-center gap-3 text-sm font-bold shrink-0">
            <AlertCircle className="h-4 w-4 shrink-0" /> Esta demanda está VENCIDA — prazo passou em {format(new Date(demanda.prazo_limite), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.
          </div>
        )}

        {/* Alerta de ajuste */}
        {demanda.status === 'em_ajuste' && demanda.ajuste_solicitado && (
          <div className="bg-orange-500 text-white px-6 py-3 shrink-0">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Ajuste Solicitado</p>
            <p className="text-sm font-bold mt-0.5">{demanda.ajuste_solicitado}</p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between px-8 pt-8 pb-4 shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${prio.color}`}>{prio.label}</span>
              {demanda.prazo_limite && <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${vencida ? 'bg-red-100 text-red-700' : 'bg-neutral-100 text-neutral-500'}`}>Prazo: {format(new Date(demanda.prazo_limite), "dd/MM/yy HH:mm")}</span>}
              {/* Valores de negociação no header */}
              {demanda.valor_proposto_admin > 0 && (
                <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                  💰 ADM: {formatCurrency(demanda.valor_proposto_admin)}
                </span>
              )}
              {demanda.valor_proposto_prestador > 0 && (
                <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
                  ↩ Prestador: {formatCurrency(demanda.valor_proposto_prestador)}
                </span>
              )}
              {demanda.valor_final > 0 && (
                <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-emerald-600 text-white">
                  ✓ Final: {formatCurrency(demanda.valor_final)}
                </span>
              )}
            </div>
            <h2 className="text-xl font-black text-neutral-900 leading-tight">
              {demanda.titulo || demanda.descricao?.slice(0, 60) || `#${demanda.id.slice(0, 8).toUpperCase()}`}
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              {demanda.ordem_servico?.cliente?.nome && <span className="font-medium">Cliente: {demanda.ordem_servico.cliente.nome} · </span>}
              {demanda.colaborador?.nome && <span>Responsável: {demanda.colaborador.nome} · </span>}
              {demanda.prestador?.nome_razao && <span className="font-medium text-orange-600">Prestador: {demanda.prestador.nome_razao}</span>}
            </p>
          </div>
          <button onClick={onClose} className="h-10 w-10 rounded-2xl bg-neutral-100 flex items-center justify-center text-neutral-400 hover:bg-neutral-200 transition-all shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-neutral-100 px-6 shrink-0 overflow-x-auto">
          {ABAS.filter(a => {
            // Se concluída, só mostra Detalhes e Comentários
            if (isConcluida) return ['detalhes', 'comentarios'].includes(a.id);
            // Aba de negociação só aparece se houver negociação em curso
            if (a.id === 'negociacao' && !isInNegociation) return false;
            return true;
          }).map(a => (
            <button
              key={a.id}
              onClick={() => setAba(a.id as AbaType)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-black whitespace-nowrap uppercase tracking-widest border-b-2 transition-all ${
                aba === a.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-neutral-400 hover:text-neutral-600'
              } ${a.id === 'negociacao' ? 'text-amber-600 hover:text-amber-700' : ''}`}
            >
              <a.icon className="h-3.5 w-3.5" />{a.label}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto">

          {aba === 'suporte_cliente' && demanda.os_id && (
            <div className="p-0 h-[600px] max-h-[60vh] flex flex-col">
              <AdminOSSuporteChat osId={demanda.os_id} remetenteId={colaboradorId || null} remetenteNome={colaboradorNome || 'Admin'} clienteId={demanda.ordem_servico?.cliente_id} isConcluida={demanda.status === 'concluida' || demanda.status === 'concluida_interna'} />
            </div>
          )}

          {/* ─── DETALHES ─── */}
          {aba === 'detalhes' && (
            <div className="p-8 space-y-6">
              {/* Descrição / Briefing */}
              {(demanda.descricao || demanda.detalhes) && (
                <div className="rounded-2xl bg-neutral-50 p-5">
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3">Descrição / Briefing</p>
                  <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">{demanda.descricao || '—'}</p>
                  {demanda.detalhes && <p className="text-sm text-neutral-500 mt-4 whitespace-pre-wrap border-t border-neutral-200 pt-4">{demanda.detalhes}</p>}
                </div>
              )}


              {/* Links e arquivos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {demanda.arquivos_briefing && Array.isArray(demanda.arquivos_briefing) && demanda.arquivos_briefing.map((item: any, i: number) => {
                  const url = typeof item === 'string' ? item : item.url;
                  const nome = typeof item === 'string' ? `Briefing ${i + 1}` : item.nome || `Briefing ${i + 1}`;
                  return (
                    <button key={`brief-${i}`} type="button" onClick={() => openFile(url, `Briefing ${i+1}`)} className="flex items-center text-left gap-3 rounded-2xl bg-indigo-50 border border-indigo-100 p-4 hover:bg-indigo-100 transition-all cursor-pointer">
                      <Upload className="h-5 w-5 text-indigo-600 shrink-0" />
                      <div className="overflow-hidden">
                        <p className="text-xs font-black text-indigo-800 truncate" title={nome}>{nome}</p>
                        <p className="text-[10px] text-indigo-500">Anexo do Cliente</p>
                      </div>
                    </button>
                  );
                })}
                {demanda.arquivos_transferencia && Array.isArray(demanda.arquivos_transferencia) && demanda.arquivos_transferencia.map((url: string, i: number) => {
                  return (
                    <button key={`trans-${i}`} type="button" onClick={() => openFile(url, `Transição ${i+1}`)} className="flex items-center text-left gap-3 rounded-2xl bg-amber-50 border border-amber-100 p-4 hover:bg-amber-100 transition-all cursor-pointer">
                      <Paperclip className="h-5 w-5 text-amber-600 shrink-0" />
                      <div className="overflow-hidden">
                        <p className="text-xs font-black text-amber-800 truncate">Anexo de Transferência {i + 1}</p>
                        <p className="text-[10px] text-amber-500">Documento do Sistema</p>
                      </div>
                    </button>
                  );
                })}
                {demanda.arquivos_resultado && Array.isArray(demanda.arquivos_resultado) && demanda.arquivos_resultado.map((item: any, i: number) => {
                  const url = typeof item === 'string' ? item : item.url;
                  const nome = typeof item === 'string' ? `Resultado ${i + 1}` : item.nome || `Resultado ${i + 1}`;
                  return (
                    <button key={`res-${i}`} type="button" onClick={() => openFile(url, `Resultado ${i+1}`)} className="flex items-center text-left gap-3 rounded-2xl bg-emerald-50 border border-emerald-100 p-4 hover:bg-emerald-100 transition-all cursor-pointer">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                      <div className="overflow-hidden">
                        <p className="text-xs font-black text-emerald-800 truncate" title={nome}>{nome}</p>
                        <p className="text-[10px] text-emerald-500">Resultado / Entrega</p>
                      </div>
                    </button>
                  );
                })}
                {demanda.link_entrega && (
                  <a href={demanda.link_entrega} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl bg-blue-50 border border-blue-100 p-4 hover:bg-blue-100 transition-all">
                    <Link className="h-5 w-5 text-blue-600 shrink-0" />
                    <div><p className="text-xs font-black text-blue-800">Link de Referência</p><p className="text-[10px] text-blue-500">Clique para abrir</p></div>
                  </a>
                )}
              </div>

              {/* Histórico Operacional Centralizado (Audit Trail) */}
              <div className="mt-8 pt-8 border-t border-neutral-100">
                <div className="flex items-center justify-between mb-6">
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                    <History className="h-3 w-3"/> Histórico Operacional e Auditoria
                  </p>
                  <span className="text-[9px] font-black px-2 py-1 rounded bg-neutral-100 text-neutral-500 uppercase tracking-tighter">End-to-End Visibility</span>
                </div>

                <div className="relative border-l-2 border-neutral-100 ml-3 pl-8 space-y-8 py-2">
                  {/* Eventos Dinâmicos */}
                  {historico.length > 0 ? (
                    historico.map((h, i) => {
                      const config = {
                        criacao: { label: '🆕 CRIAÇÃO DA DEMANDA', color: 'bg-neutral-50 text-neutral-600', icon: '🆕', borderColor: 'border-neutral-100' },
                        transferencia: { label: '🔄 DIRECIONAMENTO', color: 'bg-indigo-50 text-indigo-600', icon: '↔', borderColor: 'border-indigo-100' },
                        aceite: { label: '✅ ACEITE / INÍCIO', color: 'bg-emerald-50 text-emerald-600', icon: '✓', borderColor: 'border-emerald-100' },
                        entrega: { label: '📤 ENTREGA PARA ANÁLISE', color: 'bg-purple-50 text-purple-600', icon: '⬆', borderColor: 'border-purple-100' },
                        ajuste: { label: '⚠️ SOLICITAÇÃO DE AJUSTE', color: 'bg-orange-50 text-orange-600', icon: '⚠', borderColor: 'border-orange-100' },
                        recusa: { label: '❌ RECUSA / DEVOLUÇÃO', color: 'bg-red-50 text-red-600', icon: '✕', borderColor: 'border-red-100' },
                        negociacao: { label: '💬 NEGOCIAÇÃO', color: 'bg-amber-50 text-amber-600', icon: '$', borderColor: 'border-amber-100' },
                        finalizacao: { label: '🏁 FINALIZAÇÃO', color: 'bg-emerald-600 text-white', icon: '✓', borderColor: 'border-emerald-500' },
                        cancelamento: { label: '🚫 CANCELAMENTO', color: 'bg-red-600 text-white', icon: '✕', borderColor: 'border-red-500' }
                      }[h.tipo_evento] || { label: h.tipo_evento?.toUpperCase() || 'EVENTO', color: 'bg-neutral-50 text-neutral-600', icon: '•', borderColor: 'border-neutral-100' };

                      return (
                        <div key={i} className="relative">
                          <div className={`absolute -left-[37px] top-0 h-4 w-4 rounded-full ${config.color.split(' ')[0]} ring-4 ring-white flex items-center justify-center text-[8px] font-black`}>
                            <span className={config.color.split(' ')[1]}>{config.icon}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className={`text-xs font-black uppercase tracking-tight ${config.color.split(' ')[1]}`}>{config.label}</p>
                              {h.valor_proposto && <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-white border border-neutral-100 text-neutral-600">{formatCurrency(h.valor_proposto)}</span>}
                            </div>
                            <p className="text-[10px] font-bold text-neutral-400 mt-0.5 flex items-center gap-1.5">
                              {new Date(h.created_at).toLocaleString('pt-BR')}
                              <span className="w-1 h-1 rounded-full bg-neutral-200" />
                              <span>{h.origem?.nome || h.origem_prestador?.nome_razao || 'Central'} → {h.destino?.nome || h.destino_prestador?.nome_razao || 'Central'}</span>
                            </p>
                            {h.motivo && (
                              <div className={`mt-2 p-3 rounded-xl border ${config.borderColor} bg-white/50 shadow-sm`}>
                                <p className="text-xs text-neutral-600 leading-relaxed whitespace-pre-wrap italic">"{h.motivo}"</p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="relative py-4">
                       <p className="text-xs text-neutral-400 italic">Aguardando movimentações operacionais...</p>
                    </div>
                  )}

                  {/* Marco Final: Conclusão */}
                  {(demanda.status === 'concluida' || demanda.status === 'finalizada' || demanda.data_conclusao) && (
                    <div className="relative animate-in fade-in slide-in-from-left-4">
                      <div className="absolute -left-[37px] top-0 h-4 w-4 rounded-full bg-emerald-600 ring-4 ring-white flex items-center justify-center">
                        <CheckCircle className="h-2.5 w-2.5 text-white" />
                      </div>
                      <div className="bg-emerald-50/50 p-5 rounded-[2rem] border border-emerald-100 shadow-sm">
                        <p className="text-xs font-black text-emerald-900 uppercase tracking-tighter">🏁 FINALIZADA E LIQUIDADA</p>
                        <p className="text-[10px] font-bold text-emerald-400 mt-0.5">
                          {demanda.data_conclusao ? new Date(demanda.data_conclusao).toLocaleString('pt-BR') : '—'}
                        </p>
                        {demanda.valor_final > 0 && (
                           <div className="mt-3 pt-3 border-t border-emerald-100 flex items-center justify-between">
                             <span className="text-[10px] font-black text-emerald-600 uppercase">Valor Final Liquidado</span>
                             <span className="text-sm font-black text-emerald-700">{formatCurrency(demanda.valor_final)}</span>
                           </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── COMENTÁRIOS ─── */}
          {aba === 'comentarios' && (
            <div className="h-[500px]">
              <DemandasComentarios
                demandaId={demanda.id}
                autorId={colaboradorId || 'admin'}
                autorNome={adminType === 'admin' ? 'Administrador' : 'Colaborador'}
                autorTipo={adminType || 'admin'}
                disabled={isConcluida}
              />
            </div>
          )}

          {/* ─── NEGOCIAÇÃO (admin responde contraproposta do prestador) ─── */}
          {aba === 'negociacao' && isAdmin && (
            <div className="p-8 space-y-6">
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5">
                <p className="text-xs font-black text-amber-700 uppercase tracking-widest mb-1">⚡ Contraproposta do Prestador</p>
                <p className="text-3xl font-black text-amber-900 mt-2">{formatCurrency(demanda.valor_proposto_prestador || 0)}</p>
                {demanda.motivo_negociacao && (
                  <div className="mt-3 rounded-xl bg-amber-100 p-3">
                    <p className="text-xs font-black text-amber-700 uppercase tracking-widest mb-1">Justificativa do Prestador</p>
                    <p className="text-sm text-amber-800 italic">"{demanda.motivo_negociacao}"</p>
                  </div>
                )}
              </div>

              {/* Timeline da negociação */}
              <div className="space-y-3 rounded-2xl bg-neutral-50 p-5">
                <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">📊 Histórico de Lances</p>
                {/* Lance 1: ADM */}
                <div className="flex flex-col items-start gap-1">
                  <span className="text-[10px] font-bold text-neutral-500">Administração</span>
                  <div className="bg-white border border-neutral-200 rounded-2xl rounded-tl-none px-4 py-2.5 shadow-sm max-w-[80%]">
                    <p className="text-sm font-bold text-neutral-800">Ofereceu: <span className="text-emerald-700">{formatCurrency(demanda.valor_proposto_admin || 0)}</span></p>
                  </div>
                </div>
                {/* Lance 2: Prestador */}
                {demanda.valor_proposto_prestador > 0 && (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] font-bold text-neutral-500">{demanda.prestador?.nome_razao || 'Prestador'}</span>
                    <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-none px-4 py-2.5 shadow-sm max-w-[80%]">
                      <p className="text-sm font-bold">Pediu: {formatCurrency(demanda.valor_proposto_prestador)}</p>
                      {demanda.motivo_negociacao && <p className="text-[10px] text-indigo-200 mt-1 italic">"{demanda.motivo_negociacao}"</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* Opções de resposta */}
              <div className="grid grid-cols-1 gap-4">
                {/* Aceitar o valor do prestador */}
                <button
                  onClick={handleAceitarProposta}
                  disabled={isSubmitting}
                  className="flex items-center justify-between rounded-2xl bg-emerald-600 px-6 py-4 text-white hover:bg-emerald-700 transition-all disabled:opacity-60"
                >
                  <div className="text-left">
                    <p className="font-black text-sm uppercase tracking-widest">✅ Aceitar Proposta do Prestador</p>
                    <p className="text-emerald-200 text-xs mt-0.5">Valor final: {formatCurrency(demanda.valor_proposto_prestador || 0)} — Serviço é iniciado imediatamente</p>
                  </div>
                  <CheckCircle2 className="h-6 w-6 shrink-0 ml-4" />
                </button>

                {/* Fazer contraproposta final */}
                <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-5">
                  <p className="text-sm font-black text-orange-800 mb-4">↪ Fazer Proposta Final (Último Lance)</p>
                  <form onSubmit={handleContrapropostaAdmin} className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-black text-orange-700 uppercase tracking-widest mb-1">Novo Valor (R$) *</label>
                      <input 
                        type="number" step="0.01" min="0" required
                        value={novoValorAdmin}
                        inputMode="numeric"
onChange={(e) => setNovoValorAdmin(e.target.value)}
                        placeholder="0,00"
                        className="w-full rounded-xl bg-white border border-orange-200 px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-orange-400 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-orange-700 uppercase tracking-widest mb-1">Justificativa (Opcional)</label>
                      <textarea
                        value={motivoNegociacao}
                        onChange={e => setMotivoNegociacao(e.target.value)}
                        rows={2}
                        placeholder="Ex: Orçamento máximo disponível para esta demanda..."
                        className="w-full rounded-xl bg-white border border-orange-200 px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-orange-400 outline-none resize-none"
                      />
                    </div>
                    <button
                      type="submit" disabled={isSubmitting}
                      className="w-full rounded-xl bg-orange-500 text-white py-3 text-xs font-black uppercase tracking-widest hover:bg-orange-600 transition-all disabled:opacity-60"
                    >
                      {isSubmitting ? 'Enviando...' : 'Enviar Proposta Final ao Prestador'}
                    </button>
                  </form>
                </div>

                {/* Recusar e devolver */}
                <button
                  onClick={handleRecusarContrapropostaAdmin}
                  disabled={isSubmitting}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-red-50 border border-red-200 px-6 py-3 text-red-700 text-xs font-black uppercase tracking-widest hover:bg-red-100 transition-all disabled:opacity-60"
                >
                  <X className="h-4 w-4" /> Recusar Proposta e Devolver ao Pool Central
                </button>
              </div>
            </div>
          )}

          {/* ─── TRANSFERIR ─── */}
          {aba === 'transferir' && (
            <form onSubmit={handleTransfer} className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { id: 'colaborador', label: 'Equipe Interna', icon: User, desc: 'Colaborador interno' },
                  { id: 'prestador',   label: 'Prestador Externo', icon: Building2, desc: 'Enviar proposta + negociar' },
                ].map(t => (
                  <button key={t.id} type="button" onClick={() => { setTransferTarget(t.id as any); setSelectedTargetId(''); }}
                    className={`flex flex-col items-center gap-2 rounded-2xl p-5 border-2 transition-all ${transferTarget === t.id ? 'border-indigo-500 bg-indigo-50' : 'border-neutral-100 bg-white hover:border-neutral-200'}`}>
                    <t.icon className={`h-6 w-6 ${transferTarget === t.id ? 'text-indigo-700' : 'text-neutral-400'}`} />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${transferTarget === t.id ? 'text-indigo-700' : 'text-neutral-400'}`}>{t.label}</span>
                    <span className={`text-[9px] text-center ${transferTarget === t.id ? 'text-indigo-500' : 'text-neutral-300'}`}>{t.desc}</span>
                  </button>
                ))}
              </div>

              {transferTarget === 'colaborador' && (
                <select value={selectedTargetId} onChange={e => setSelectedTargetId(e.target.value)} required className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="">Selecione o colaborador...</option>
                  {colaboradores.filter(c => c.id !== colaboradorId).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              )}

              {transferTarget === 'prestador' && (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-1">📤 Fluxo de Negociação</p>
                    <p className="text-xs text-amber-700">A demanda será enviada ao prestador com uma proposta de valor. O prestador poderá aceitar, recusar ou fazer uma contraproposta. Você receberá a resposta e poderá negociar.</p>
                  </div>
                  <select value={selectedTargetId} onChange={e => setSelectedTargetId(e.target.value)} required className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="">Selecione o prestador...</option>
                    {prestadores.map(p => <option key={p.id} value={p.id}>{p.nome_razao}</option>)}
                  </select>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-2">
                        💰 Valor Proposto (R$) *
                      </label>
                      <input 
                        type="number" step="0.01" min="0" required
                        value={valorPropostoTransfer}
                        inputMode="numeric"
onChange={(e) => setValorPropostoTransfer(e.target.value)}
                        placeholder="0,00"
                        className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-bold focus:ring-2 focus:ring-amber-400 outline-none"
                      />
                      <p className="text-[10px] text-neutral-400 mt-1">Valor inicial da negociação.</p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-2">
                        ⏳ Prazo de Entrega *
                      </label>
                      <input
                        type="datetime-local" required
                        value={transferPrazoEntrega}
                        onChange={e => setTransferPrazoEntrega(e.target.value)}
                        className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-bold focus:ring-2 focus:ring-amber-400 outline-none"
                      />
                      <p className="text-[10px] text-neutral-400 mt-1">Data limite esperada.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Resumo de anexos atuais para o admin saber o que está enviando */}
              <div className="rounded-2xl bg-indigo-50/50 p-4 border border-indigo-100/50">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">📎 Anexos já vinculados à demanda</p>
                <div className="flex flex-wrap gap-2">
                   {((demanda.arquivos_briefing?.length || 0) + (demanda.arquivos_transferencia?.length || 0)) === 0 && (
                     <p className="text-[10px] text-indigo-300 italic">Nenhum anexo prévio encontrado.</p>
                   )}
                   {demanda.arquivos_briefing?.map((_: any, i: number) => (
                     <span key={`br-${i}`} className="px-2 py-1 rounded bg-white text-[9px] font-bold text-indigo-600 border border-indigo-100">Briefing {i+1}</span>
                   ))}
                   {demanda.arquivos_transferencia?.map((_: any, i: number) => (
                     <span key={`tr-${i}`} className="px-2 py-1 rounded bg-white text-[9px] font-bold text-amber-600 border border-amber-100">Transferência {i+1}</span>
                   ))}
                </div>
              </div>

              <textarea
                value={transferReason}
                onChange={e => setTransferReason(e.target.value)}
                rows={3}
                placeholder={transferTarget === 'prestador' ? 'Instruções ou detalhes adicionais para o prestador...' : 'Justificativa da transferência...'}
                className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />

              <div className="space-y-2">
                {transferFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-emerald-50 rounded-xl px-3 py-2 border border-emerald-100">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span className="text-xs font-bold text-emerald-700 truncate flex-1">{f.name}</span>
                    <button type="button" onClick={() => setTransferFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-emerald-500 hover:text-emerald-700">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {transferFiles.length < 5 && (
                <label className={`flex flex-col items-center justify-center w-full h-24 cursor-pointer rounded-2xl border-2 border-dashed transition-all bg-neutral-50 border-neutral-200 hover:border-indigo-300`}>
                  <input 
                    type="file" 
                    multiple 
                    className="hidden" 
                    onChange={e => {
                      const files = Array.from(e.target.files || []);
                      const validFiles = files.filter(f => {
                        const err = validateFile(f);
                        if (err) { toast.error(err); return false; }
                        return true;
                      });
                      setTransferFiles(prev => [...prev, ...validFiles].slice(0, 5));
                    }} 
                  />
                  <Upload className="h-7 w-7 text-neutral-300 mb-1" />
                  <p className="text-xs text-neutral-400">Anexar arquivos ({transferFiles.length}/5)</p>
                </label>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full rounded-2xl py-4 text-sm font-black uppercase tracking-widest text-white transition-all disabled:opacity-60 ${transferTarget === 'prestador' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                {isSubmitting ? 'Processando...' :
                  transferTarget === 'prestador' ? '📤 Enviar Proposta ao Prestador' :
                  transferTarget === 'admin' ? 'Enviar para Análise' :
                  'Confirmar Transferência'}
              </button>
            </form>
          )}

          {/* ─── ENTREGAR ─── */}
          {aba === 'entregar' && (
            <form onSubmit={handleDelivery} className="p-8 space-y-6">
              <div className="space-y-2">
                {deliveryFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-emerald-50 rounded-xl px-3 py-2 border border-emerald-100">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span className="text-xs font-bold text-emerald-700 truncate flex-1">{f.name}</span>
                    <button type="button" onClick={() => setDeliveryFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-emerald-500 hover:text-emerald-700">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {deliveryFiles.length < 5 && (
                <label className={`flex flex-col items-center justify-center w-full h-36 cursor-pointer rounded-2xl border-2 border-dashed transition-all bg-neutral-50 border-neutral-200 hover:border-emerald-300`}>
                  <input 
                    type="file" 
                    multiple 
                    className="hidden" 
                    onChange={e => {
                      const files = Array.from(e.target.files || []);
                      const validFiles = files.filter(f => {
                        const err = validateFile(f);
                        if (err) { toast.error(err); return false; }
                        return true;
                      });
                      setDeliveryFiles(prev => [...prev, ...validFiles].slice(0, 5));
                    }} 
                  />
                  <Upload className="h-10 w-10 text-neutral-300 mb-2" />
                  <p className="text-sm text-neutral-500 font-bold">Adicionar Arquivos ({deliveryFiles.length}/5)</p>
                </label>
              )}
              <input type="url" value={deliveryLink} onChange={e => setDeliveryLink(e.target.value)} placeholder="ou cole o link do resultado..." className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none" />
              <textarea value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)} rows={4} placeholder="Notas sobre o que está sendo entregue..." className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none resize-none" />
              <button type="submit" disabled={isSubmitting} className="w-full rounded-2xl bg-emerald-600 py-4 text-sm font-black uppercase tracking-widest text-white hover:bg-emerald-700 transition-all disabled:opacity-60">
                {isSubmitting ? 'Enviando...' : '✅ Finalizar e Entregar'}
              </button>
            </form>
          )}

          {/* ─── SOLICITAR AJUSTE ─── */}
          {aba === 'ajuste' && (
            <form onSubmit={handleAjuste} className="p-8 space-y-6">
              <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-800">
                ⚠️ A demanda voltará para <strong>"Em Ajuste"</strong> e o responsável será notificado.
              </div>
              <textarea value={ajusteDesc} onChange={e => setAjusteDesc(e.target.value)} rows={5} required placeholder="Descreva o que precisa ser ajustado..." className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none resize-none" />
              <input type="datetime-local" value={ajustePrazo} onChange={e => setAjustePrazo(e.target.value)} required className="w-full rounded-2xl bg-neutral-100 border-none px-5 py-4 text-sm font-medium focus:ring-2 focus:ring-amber-500 outline-none" />
              <button type="submit" disabled={isSubmitting} className="w-full rounded-2xl bg-amber-500 py-4 text-sm font-black uppercase tracking-widest text-white hover:bg-amber-600 transition-all disabled:opacity-60">
                {isSubmitting ? 'Enviando...' : 'Solicitar Ajuste'}
              </button>
            </form>
          )}
        </div>

        {/* Footer de ações rápidas */}
        <div className="border-t border-neutral-100 bg-neutral-50/50 px-8 py-5 flex flex-wrap items-center gap-3 shrink-0">
          {demanda.status_aceite === 'pendente_aceite' && Boolean(demanda.colaborador_id) && (
            <>
              <button onClick={handleAceitarDemanda} disabled={isSubmitting} className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-700 transition-all">
                <CheckCircle2 className="h-4 w-4" /> Aceitar Demanda
              </button>
              <button onClick={handleRecusarDemanda} disabled={isSubmitting} className="flex items-center gap-2 rounded-2xl bg-red-100 px-6 py-3 text-xs font-black uppercase tracking-widest text-red-600 hover:bg-red-200 transition-all">
                <X className="h-4 w-4" /> Recusar
              </button>
            </>
          )}
          {/* Admin pode assumir diretamente demandas na fila de Gestão Interna */}
          {isAdmin && demanda.status === 'aguardando_atribuicao' && (
            <button
              onClick={handleAssumeAndStart}
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-2xl bg-[#1a1a1a] px-6 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-black transition-all shadow-lg shadow-black/10"
            >
              <User className="h-4 w-4" /> Assumir Demanda
            </button>
          )}
          {/* Iniciar Execução: apenas para demandas abertas (não aguardando_atribuicao — usa Assumir acima) */}
          {(demanda.status === 'aberta' || demanda.status === 'pendente') && demanda.status_aceite !== 'pendente_aceite' && (
            <button onClick={handleStartService} disabled={isSubmitting} className="flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-700 transition-all">
              <Clock className="h-4 w-4" /> Iniciar Execução
            </button>
          )}
          {isAdmin && demanda.status === 'em_analise' && (
            <button onClick={handleApprove} disabled={isSubmitting} className="flex items-center gap-2 rounded-2xl bg-[#1a1a1a] px-6 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-black transition-all">
              <CheckCircle2 className="h-4 w-4" /> Aprovar e Finalizar
            </button>
          )}
          {/* Atalho: quando há contraproposta de prestador, mostrar botão de ir para aba */}
          {isAdmin && isContrapropPrestador && aba !== 'negociacao' && (
            <button onClick={() => setAba('negociacao')} className="flex items-center gap-2 rounded-2xl bg-amber-500 px-6 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-amber-600 transition-all animate-pulse">
              <DollarSign className="h-4 w-4" /> Ver Contraproposta ⚡
            </button>
          )}
          {isConcluida && (
            <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl border ${isAguardandoVendas ? 'bg-amber-50 border-amber-100 text-amber-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
              <CheckCircle2 className="h-5 w-5" />
              <div className="flex flex-col">
                <span className="text-xs font-black uppercase tracking-widest">
                  {isAguardandoVendas ? 'Aprovada pela Gestão Interna' : 'Demanda Concluída'}
                </span>
                <span className="text-[10px] font-bold opacity-80">
                  {isAguardandoVendas 
                    ? 'Esta demanda está aguardando a finalização oficial no módulo de Vendas.' 
                    : 'Esta demanda já foi finalizada e não permite mais alterações.'}
                </span>
              </div>
            </div>
          )}
          {isEmNegociacao && (
            <span className="flex items-center gap-2 text-sm font-bold text-amber-600">
              <DollarSign className="h-4 w-4" /> Aguardando resposta do prestador...
            </span>
          )}

          {/* Botão de Cancelar (Sempre visível se não estiver concluída) */}
          {!isConcluida && isAdmin && (
            <button
              onClick={handleCancelDemanda}
              disabled={isSubmitting}
              className="ml-auto flex items-center gap-2 rounded-2xl bg-white border border-red-200 px-6 py-3 text-xs font-black uppercase tracking-widest text-red-500 hover:bg-red-50 transition-all"
            >
              <X className="h-4 w-4" /> Cancelar Demanda
            </button>
          )}
        </div>
      </div>
      <ConfirmDialog {...confirmHook} />
    </div>
  );
}

function AdminOSSuporteChat({ osId, remetenteId, remetenteNome, clienteId, isConcluida }: { osId: string, remetenteId: string | null, remetenteNome: string, clienteId?: string, isConcluida?: boolean }) {
  const [mensagens, setMensagens] = React.useState<any[]>([]);
  const [anexoFile, setAnexoFile] = React.useState<File | null>(null);
  const [novaMensagem, setNovaMensagem] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { openFile } = useFileViewer();

  const fetchMensagensLocal = React.useCallback(async () => {
    const { data } = await supabase
      .from('os_suporte_mensagens')
      .select('*')
      .eq('os_id', osId)
      .order('created_at', { ascending: true });
    if (data) {
      setMensagens(data);
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    }
  }, [osId]);

  React.useEffect(() => {
    void fetchMensagensLocal();
  }, [fetchMensagensLocal]);

  useRealtimeSubscription({
    table: 'os_suporte_mensagens',
    filter: `os_id=eq.${osId}`,
    onChange: fetchMensagensLocal,
    onPayload: (payload) => {
      if (payload.new) {
        setMensagens((prev) => {
          if (prev.find(m => m.id === (payload.new as any).id)) return prev;
          return [...prev, payload.new];
        });
        setTimeout(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }, 100);
      }
    },
    debounceMs: 100,
  }, [osId]);

  const handleEnviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!novaMensagem.trim() && !anexoFile) || enviando) return;

    setEnviando(true);
    try {
      let mensagemTexto = novaMensagem.trim();

      if (anexoFile) {
        const fileExt = anexoFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
        const path = `suporte/${osId}/${fileName}`;
        
        const __up = await uploadFile(anexoFile, 'entregas_demandas', path);
        const anexoStr = `[ANEXO|${anexoFile.name}|${__up.path}]`;
        mensagemTexto = mensagemTexto ? `${mensagemTexto}\n\n${anexoStr}` : anexoStr;
      }

      await callAdminRpc('gsa_admin_send_os_support_message', {
        p_os_id: osId,
        p_mensagem: mensagemTexto,
        p_request_id: createAdminRequestId(),
      });
      setNovaMensagem('');
      setAnexoFile(null);
      
      if (clienteId) {
        await notificationService.notifyClient(
          clienteId,
          '💬 Nova Mensagem de Suporte',
          `${remetenteNome}: ${novaMensagem.trim()}`,
          'servicos',
          'ticket_mensagem_cliente',
          { itemId: osId, tab: 'andamento' }
        );
      }
    } catch (err) {
      console.error('Erro ao enviar mensagem', err);
      toast.error('Erro ao enviar mensagem.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div className="flex items-center gap-3 bg-neutral-50 px-6 py-4 border-b border-neutral-200">
        <MessageSquare className="h-5 w-5 text-indigo-600" />
        <div>
          <h4 className="font-bold text-neutral-900">Suporte ao Cliente (OS)</h4>
          <p className="text-xs text-neutral-500">Chat em tempo real com o cliente.</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-neutral-50/50">
        {mensagens.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-neutral-400">
            <MessageSquare className="h-8 w-8 mb-3 opacity-20" />
            <p className="text-sm font-medium">Nenhuma mensagem ainda.</p>
          </div>
        ) : (
          mensagens.map((msg) => {
            const isMe = msg.remetente_tipo === 'admin';
            const anexoMatch = msg.mensagem.match(/\[ANEXO\|(.*?)\|(.*?)\]/);
            const textContent = msg.mensagem.replace(/\[ANEXO\|.*?\|.*?\]/, '').trim();
            const fileName = anexoMatch ? anexoMatch[1] : null;
            const fileUrl = anexoMatch ? anexoMatch[2] : null;
            const isImage = fileName?.match(/\.(jpg|jpeg|png|gif|webp)$/i);

            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && <p className="text-[10px] font-bold text-neutral-400 mb-1 ml-1">Cliente</p>}
                {isMe && msg.remetente_nome && <p className="text-[10px] font-bold text-indigo-400 mb-1 mr-1">{msg.remetente_nome}</p>}
                <div 
                  className={`max-w-[80%] rounded-2xl px-5 py-3 flex flex-col gap-2 ${
                    isMe 
                      ? 'bg-indigo-600 text-white rounded-br-sm' 
                      : 'bg-white border border-neutral-200 text-neutral-800 rounded-bl-sm shadow-sm'
                  }`}
                >
                  {textContent && <p className="text-sm whitespace-pre-wrap">{textContent}</p>}
                  
                  {anexoMatch && (
                    <button type="button" onClick={() => openFile(fileUrl!, fileName!)} className={`block mt-1 overflow-hidden rounded-xl border ${isMe ? 'border-white/20' : 'border-neutral-200'} transition-opacity hover:opacity-90 cursor-pointer`}>
                      {isImage ? (
                        <img src={fileUrl!} alt={fileName!} className="max-w-[200px] max-h-[200px] object-cover" />
                      ) : (
                        <div className={`flex items-center gap-2 p-3 ${isMe ? 'bg-white/10' : 'bg-neutral-50'}`}>
                          <Paperclip className={`h-5 w-5 shrink-0 ${isMe ? 'text-white' : 'text-indigo-600'}`} />
                          <span className={`text-xs font-semibold truncate max-w-[150px] ${isMe ? 'text-white' : 'text-neutral-700'}`}>{fileName}</span>
                        </div>
                      )}
                    </button>
                  )}
                </div>
                <p className="text-[10px] font-bold text-neutral-400 mt-1 px-1">
                  {new Date(msg.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
            );
          })
        )}
      </div>

      <div className="p-4 bg-white border-t border-neutral-200 mt-auto flex flex-col gap-2">
        {isConcluida ? (
          <div className="p-3 bg-neutral-100 rounded-xl text-center text-sm font-medium text-neutral-500 flex items-center justify-center gap-2">
            <MessageSquare className="h-4 w-4 opacity-50" />
            Demanda concluída. O chat foi encerrado.
          </div>
        ) : (
          <>
            {anexoFile && (
              <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 w-fit">
                <Paperclip className="h-4 w-4 text-indigo-600" />
                <span className="text-xs font-semibold text-indigo-900 truncate max-w-[200px]">{anexoFile.name}</span>
                <button type="button" onClick={() => setAnexoFile(null)} className="ml-2 text-indigo-400 hover:text-indigo-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <form onSubmit={handleEnviar} className="flex items-center gap-3">
              <label className={`cursor-pointer flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${anexoFile ? 'bg-indigo-100 text-indigo-600' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'} ${enviando ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input type="file" className="hidden" disabled={enviando} onChange={(e) => {
                  if (e.target.files?.[0]) {
                    const f = e.target.files[0];
                    const err = validateFile(f);
                    if (err) { toast.error(err); } else { setAnexoFile(f); }
                  }
                  e.target.value = '';
                }} />
                <Paperclip className="h-5 w-5" />
              </label>
              <input
                type="text"
                value={novaMensagem}
                onChange={(e) => setNovaMensagem(e.target.value)}
                placeholder="Digite sua resposta..."
                className="flex-1 rounded-xl bg-neutral-100 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                disabled={enviando}
              />
              <button
                type="submit"
                disabled={(!novaMensagem.trim() && !anexoFile) || enviando}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                <Send className="h-5 w-5" />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
