import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
  User,
  Phone,
  Mail,
  FileText,
  MapPin,
  Link2,
  ExternalLink,
  Copy,
  Check,
  Send,
  Loader2,
  Sparkles,
  MessageSquare,
  Building2,
  Gift,
  ShieldAlert,
  Edit3,
  Image as ImageIcon,
  Maximize2,
  Eye,
  History,
  RefreshCw,
  Scale,
  Ban,
  Trash2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { maskPhone } from '../../../../lib/utils';
import { supabase } from '../../../../lib/supabase';
import {
  completePartnerRedemption,
  approveRedemption,
  rejectRedemption,
  cancelPartnerRedemption,
  deletePartnerRedemption,
  decidePartnerAppeal,
  consultarProtocolo
} from '../../../../features/partners/service';
import { sessionService } from '../../../../lib/sessionService';
import type { Partner, PartnerRedemption, PartnerRedemptionTimelineEvent } from '../../../../features/partners/types';

export interface PartnerRedemptionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  resgate: PartnerRedemption | null;
  partner: Partner | null;
  onSuccess?: () => void;
}

export function PartnerRedemptionDetailModal({
  isOpen,
  onClose,
  resgate,
  partner,
  onSuccess
}: PartnerRedemptionDetailModalProps) {
  const [activationLink, setActivationLink] = useState('');
  const [cupom, setCupom] = useState('');
  const [voucher, setVoucher] = useState('');
  const [isEditingLink, setIsEditingLink] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  const [isApproving, setIsApproving] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [appealDecisionReason, setAppealDecisionReason] = useState('');
  const [isDecidingAppeal, setIsDecidingAppeal] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<PartnerRedemptionTimelineEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const isSystemAdmin = sessionService.getCurrentSession()?.atorTipo === 'admin';

  // Atualiza o relógio a cada 1 segundo para manter o countdown do SLA em tempo real
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    if (resgate) {
      setActivationLink(resgate.link_ativacao || '');
      setCupom((resgate as any).cupom || '');
      setVoucher((resgate as any).voucher || '');
      setIsEditingLink(!resgate.link_ativacao);
      setAppealDecisionReason('');
    }
  }, [resgate]);

  // Cálculos de SLA de 24 Horas
  const slaData = useMemo(() => {
    if (!resgate?.created_at) {
      return {
        solicitadoEm: null,
        prazoLimite: null,
        tempoRestanteMs: 0,
        horas: 0,
        minutos: 0,
        segundos: 0,
        expirado: false,
        percentualDecorrido: 100,
        concluido: Boolean(resgate?.link_ativacao || resgate?.status === 'concluido')
      };
    }

    const solicitadoEm = new Date(resgate?.created_at);
    const vinteQuatroHorasMs = 24 * 60 * 60 * 1000;
    const prazoLimite = new Date(solicitadoEm.getTime() + vinteQuatroHorasMs);
    const diffMs = prazoLimite.getTime() - currentTime.getTime();
    const decorridoMs = currentTime.getTime() - solicitadoEm.getTime();

    const percentualDecorrido = Math.min(
      100,
      Math.max(0, Math.round((decorridoMs / vinteQuatroHorasMs) * 100))
    );

    const expirado = diffMs <= 0;
    const absDiff = Math.abs(diffMs);

    const horas = Math.floor(absDiff / (1000 * 60 * 60));
    const minutos = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
    const segundos = Math.floor((absDiff % (1000 * 60)) / 1000);

    return {
      solicitadoEm,
      prazoLimite,
      tempoRestanteMs: diffMs,
      horas,
      minutos,
      segundos,
      expirado,
      percentualDecorrido,
      concluido: Boolean(resgate?.link_ativacao || resgate?.status === 'concluido')
    };
  }, [resgate, currentTime]);



  const handleCopy = (text: string, fieldKey: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    toast.success(`${label} copiado com sucesso!`);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const protocolCode =
    resgate?.codigo_gerado ||
    `PROT-RES-${new Date(resgate?.created_at || Date.now()).getFullYear()}-${resgate?.id?.slice(0, 6).toUpperCase()}`;

  const loadTimelineEvents = useCallback(async () => {
    if (!resgate?.id) return;
    setIsLoadingEvents(true);
    try {
      // 1. Direct query on parceiros_resgates_eventos
      const { data, error } = await supabase
        .from('parceiros_resgates_eventos')
        .select('*')
        .eq('resgate_id', resgate.id)
        .order('ocorrido_em', { ascending: true });

      if (!error && data && data.length > 0) {
        setTimelineEvents(data);
        setIsLoadingEvents(false);
        return;
      }

      // 2. Fallback via RPC consultarProtocolo
      const code = resgate?.codigo_gerado || `PROT-RES-${new Date(resgate?.created_at || Date.now()).getFullYear()}-${resgate?.id?.slice(0, 6).toUpperCase()}`;
      const result = await consultarProtocolo(code);
      if (result.success && result.data?.eventos && result.data.eventos.length > 0) {
        setTimelineEvents(result.data.eventos);
        setIsLoadingEvents(false);
        return;
      }
    } catch (err) {
      console.warn('Erro ao carregar histórico de eventos:', err);
    } finally {
      setIsLoadingEvents(false);
    }
  }, [resgate?.id, resgate?.codigo_gerado, resgate?.created_at]);

  useEffect(() => {
    if (isOpen && resgate?.id) {
      void loadTimelineEvents();
    } else {
      setTimelineEvents([]);
      setSelectedPreviewImage(null);
    }
  }, [isOpen, resgate?.id, loadTimelineEvents]);

  if (!isOpen || !resgate || !partner) return null;

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await approveRedemption(resgate.id);
      toast.success('Resgate aprovado com sucesso!');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('Erro ao aprovar: ' + err.message);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    const motivo = rejectReason.trim();
    if (!motivo) {
      toast.error('Informe o motivo da recusa.');
      return;
    }
    setIsRejecting(true);
    try {
      await rejectRedemption(resgate.id, motivo);
      resgate.status = 'recusado';
      resgate.motivo_recusa = motivo;
      toast.success('Resgate recusado e cliente notificado!');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('Erro ao recusar: ' + err.message);
    } finally {
      setIsRejecting(false);
    }
  };

  const handleAdministrativeCancel = async () => {
    const reason = cancelReason.trim();
    if (reason.length < 10) {
      toast.error('Informe um motivo com pelo menos 10 caracteres.');
      return;
    }
    setIsCancelling(true);
    try {
      await cancelPartnerRedemption(resgate.id, reason);
      resgate.status = 'cancelado';
      resgate.motivo_cancelamento = reason;
      resgate.data_cancelamento = new Date().toISOString();
      toast.success('Resgate cancelado e motivo registrado.');
      setShowCancelForm(false);
      await loadTimelineEvents();
      onSuccess?.();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível cancelar o resgate.');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleAdministrativeDelete = async () => {
    const expected = (resgate.codigo_gerado || resgate.id).trim();
    if (deleteConfirmation.trim().toUpperCase() !== expected.toUpperCase()) {
      toast.error('Digite exatamente o protocolo para confirmar a exclusão.');
      return;
    }
    setIsDeleting(true);
    try {
      await deletePartnerRedemption(resgate.id, deleteConfirmation);
      toast.success('Resgate excluído definitivamente do sistema.');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível excluir o resgate.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAppealDecision = async (decision: 'deferido' | 'indeferido') => {
    if (!resgate?.recurso) return;
    const reason = appealDecisionReason.trim();
    if (decision === 'indeferido' && reason.length < 10) {
      toast.error('Informe a fundamentação da recusa com pelo menos 10 caracteres.');
      return;
    }
    setIsDecidingAppeal(true);
    try {
      await decidePartnerAppeal(resgate.recurso.id, decision, reason || undefined);
      
      // Atualiza estado local do resgate
      resgate.recurso.status = decision;
      resgate.recurso.motivo_decisao = reason || null;
      resgate.recurso.analisado_em = new Date().toISOString();

      if (decision === 'deferido') {
        resgate.status = 'pendente';
        resgate.alerta_duplicidade = false;
        toast.success('Recurso aprovado com sucesso! A solicitação retornou para o fluxo de andamento.');
      } else {
        resgate.status = 'recusado';
        toast.success('Recurso recusado e decisão registrada com sucesso.');
      }

      await loadTimelineEvents();
      if (onSuccess) onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível registrar a decisão do recurso.');
    } finally {
      setIsDecidingAppeal(false);
    }
  };

  const handleSaveActivation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanLink = activationLink.trim();
    if (!cleanLink) {
      toast.error('Informe o link de ativação gerado no site do parceiro.');
      return;
    }

    setIsSaving(true);
    try {
      const success = await completePartnerRedemption({
        resgateId: resgate.id,
        linkAtivacao: cleanLink,
        partnerName: partner.name,
        partnerCover: partner.cover_url || undefined,
        partnerLogo: partner.logo_url || undefined,
        benefitName: partner.benefits || undefined,
        customerName: resgate.nome_completo,
        customerPhone: resgate.telefone,
        customerEmail: resgate.email || undefined,
        protocolo: protocolCode,
        cupom: cupom,
        voucher: voucher
      });

      if (success) {
        toast.success(
          `Link de ativação salvo e enviado para o WhatsApp de ${resgate.nome_completo}!`,
          { duration: 5000 }
        );
      } else {
        toast.success('Link de ativação salvo no cadastro!', { duration: 4000 });
      }

      setIsEditingLink(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('Erro ao salvar ativação:', err);
      toast.error(err?.message || 'Erro ao salvar link de ativação.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResendWhatsApp = async () => {
    if (!resgate.link_ativacao) {
      toast.error('Nenhum link cadastrado para este resgate.');
      return;
    }

    setIsResending(true);
    try {
      const success = await completePartnerRedemption({
        resgateId: resgate.id,
        linkAtivacao: resgate.link_ativacao,
        partnerName: partner.name,
        partnerCover: partner.cover_url || undefined,
        partnerLogo: partner.logo_url || undefined,
        benefitName: partner.benefits || undefined,
        customerName: resgate.nome_completo,
        customerPhone: resgate.telefone,
        customerEmail: resgate.email || undefined,
        protocolo: protocolCode,
        cupom: (resgate as any).cupom || undefined,
        voucher: (resgate as any).voucher || undefined
      });

      if (success) {
        toast.success(
          `Notificação oficial de WhatsApp reenviada para ${maskPhone(resgate.telefone)}!`,
          { duration: 5000 }
        );
      } else {
        toast.error('Não foi possível reenviar o WhatsApp no momento.');
      }
    } catch (err: any) {
      toast.error('Falha no reenvio: ' + err.message);
    } finally {
      setIsResending(false);
    }
  };

  const cleanWaNumber = resgate.telefone.replace(/\D/g, '');
  const waUrl = cleanWaNumber
    ? `https://wa.me/${cleanWaNumber.startsWith('55') ? cleanWaNumber : `55${cleanWaNumber}`}`
    : null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl border border-neutral-100 transition-all flex flex-col max-h-[90vh] my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="relative border-b border-neutral-100 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800 p-5 sm:p-6 text-white shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 sm:top-5 sm:right-5 rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
            title="Fechar modal"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 shadow-lg shadow-amber-500/20 text-white font-black text-lg">
              {(resgate.nome_completo || 'C').slice(0, 2).toUpperCase()}
            </div>
            <div className="space-y-1 pr-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400 bg-amber-400/10 px-2.5 py-0.5 rounded-full border border-amber-400/20">
                  Resgate de Benefício
                </span>
                {resgate.status === 'cancelado' ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-400/30 bg-slate-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-300">
                    <Ban className="h-3 w-3" /> Cancelado
                  </span>
                ) : resgate.status === 'recusado' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 border border-rose-400/30 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-300">
                    <X className="h-3 w-3 text-rose-400" /> Recusado
                  </span>
                ) : resgate.status === 'analise' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 border border-rose-400/30 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-300 animate-pulse">
                    <AlertTriangle className="h-3 w-3 text-rose-400" /> Em Análise
                  </span>
                ) : slaData.concluido ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Link Ativado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-400/30 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300 animate-pulse">
                    <Clock className="h-3 w-3 text-amber-400" /> Pendente de Cadastro
                  </span>
                )}
              </div>
              <h3 className="text-xl font-black text-white leading-tight">
                {resgate.nome_completo}
              </h3>
              <p className="text-xs text-white/70 flex items-center gap-1.5 font-medium">
                <Building2 className="h-3.5 w-3.5 text-amber-400" />
                Parceiro: <strong className="text-white font-bold">{partner.name}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto p-5 sm:p-6 space-y-5 bg-neutral-50/50">
          {resgate.alerta_duplicidade && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:p-5 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
                <h4 className="font-black text-sm text-rose-950 uppercase tracking-wider">
                  Alerta de Duplicidade
                </h4>
              </div>
              <p className="text-xs text-rose-800 leading-relaxed font-medium">
                Este cliente já possui um resgate anterior para este parceiro.
              </p>
              {resgate.justificativa_duplicidade && (
                <div className="bg-white/60 rounded-xl p-3 border border-rose-100">
                  <span className="block text-[10px] font-black uppercase tracking-wider text-rose-500 mb-1">Justificativa do Cliente:</span>
                  <p className="text-xs text-rose-950 italic">"{resgate.justificativa_duplicidade}"</p>
                </div>
              )}
            </div>
          )}

          {/* 1. SLA E CRONÔMETRO REGRESSIVO DE 24 HORAS */}
          <div
            className={`rounded-2xl border p-4 sm:p-5 transition-all shadow-sm ${
              slaData.concluido
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                : slaData.expirado
                ? 'bg-rose-50/90 border-rose-300 text-rose-950 animate-pulse'
                : 'bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-amber-300 text-amber-950'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {slaData.concluido ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  ) : slaData.expirado ? (
                    <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0" />
                  ) : (
                    <Clock className="h-5 w-5 text-amber-600 shrink-0 animate-spin" style={{ animationDuration: '4s' }} />
                  )}
                  <h4 className="font-black text-sm uppercase tracking-wider">
                    {slaData.concluido
                      ? 'Atendimento Concluído com Sucesso'
                      : slaData.expirado
                      ? 'SLA Excedido — Prioridade Máxima'
                      : 'Prazo Máximo de Atendimento (SLA 24h)'}
                  </h4>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600">
                  <span>
                    <strong>Solicitado em:</strong>{' '}
                    {slaData.solicitadoEm
                      ? slaData.solicitadoEm.toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })
                      : '—'}
                  </span>
                  <span>
                    ⏰ <strong>Prazo Limite:</strong>{' '}
                    {slaData.prazoLimite
                      ? slaData.prazoLimite.toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : '—'}
                  </span>
                </div>
              </div>

              {/* Tempo Restante Box */}
              <div className="shrink-0 flex items-center gap-2 self-start sm:self-center">
                {slaData.concluido ? (
                  <div className="rounded-xl bg-emerald-600 text-white px-3.5 py-1.5 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                    <Check className="h-4 w-4" /> Ativo
                  </div>
                ) : slaData.expirado ? (
                  <div className="rounded-xl bg-rose-600 text-white px-3.5 py-1.5 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                    <AlertTriangle className="h-4 w-4" /> Atrasado há {slaData.horas}h {slaData.minutos}m
                  </div>
                ) : (
                  <div className="rounded-xl bg-amber-500 text-white px-4 py-2 text-center shadow-md shadow-amber-500/20">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-amber-100">
                      Tempo Restante
                    </span>
                    <span className="font-mono text-base font-black tracking-tight">
                      {String(slaData.horas).padStart(2, '0')}h :{' '}
                      {String(slaData.minutos).padStart(2, '0')}m :{' '}
                      {String(slaData.segundos).padStart(2, '0')}s
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Barra de Progresso SLA */}
            {!slaData.concluido && (
              <div className="mt-3 space-y-1">
                <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ${
                      slaData.expirado
                        ? 'bg-rose-500 w-full'
                        : slaData.percentualDecorrido > 75
                        ? 'bg-amber-600'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${slaData.percentualDecorrido}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-bold text-neutral-400">
                  <span>0h (Solicitação)</span>
                  <span>{slaData.percentualDecorrido}% decorrido</span>
                  <span>24h (Limite)</span>
                </div>
              </div>
            )}
          </div>

          {/* 2. DADOS CADASTRAIS DO CLIENTE (INFORMAÇÕES CADASTRADAS NO RESGATE) */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-neutral-800">
                <User className="h-4 w-4 text-indigo-600" />
                Dados Cadastrados pelo Cliente
              </h4>
              <span className="text-[11px] font-medium text-neutral-400">
                Utilize estes dados para o cadastro na {partner.name}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              {/* Nome Completo */}
              <div className="rounded-xl border border-neutral-100 bg-neutral-50/70 p-3 flex items-center justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                    <User className="h-3 w-3 text-neutral-400" /> Nome Completo
                  </span>
                  <p className="font-bold text-neutral-900 text-sm truncate">{resgate.nome_completo}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(resgate.nome_completo, 'nome', 'Nome')}
                  className="rounded-lg p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0 cursor-pointer"
                  title="Copiar Nome"
                >
                  {copiedField === 'nome' ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              {/* WhatsApp / Telefone */}
              <div className="rounded-xl border border-neutral-100 bg-neutral-50/70 p-3 flex items-center justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                    <Phone className="h-3 w-3 text-emerald-600" /> WhatsApp / Telefone
                  </span>
                  <p className="font-bold text-neutral-900 text-sm">{maskPhone(resgate.telefone)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy(resgate.telefone, 'telefone', 'Telefone')}
                    className="rounded-lg p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                    title="Copiar Telefone"
                  >
                    {copiedField === 'telefone' ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                  {waUrl && (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                      title="Abrir WhatsApp"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>

              {/* E-mail */}
              <div className="rounded-xl border border-neutral-100 bg-neutral-50/70 p-3 flex items-center justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                    <Mail className="h-3 w-3 text-blue-500" /> E-mail
                  </span>
                  <p className="font-bold text-neutral-900 text-xs truncate">
                    {resgate.email || <span className="text-neutral-400 font-normal italic">Não informado</span>}
                  </p>
                </div>
                {resgate.email && (
                  <button
                    type="button"
                    onClick={() => handleCopy(resgate.email!, 'email', 'E-mail')}
                    className="rounded-lg p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0 cursor-pointer"
                    title="Copiar E-mail"
                  >
                    {copiedField === 'email' ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                )}
              </div>

              {/* Protocolo Oficial de Resgate */}
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 flex items-center justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                    <FileText className="h-3 w-3 text-indigo-600" /> Protocolo de Resgate
                  </span>
                  <p className="font-mono font-black text-indigo-950 text-xs truncate">
                    {protocolCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(protocolCode, 'protocolo', 'Protocolo')}
                  className="rounded-lg p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 transition-colors shrink-0 cursor-pointer"
                  title="Copiar Protocolo"
                >
                  {copiedField === 'protocolo' ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* 3. DETALHES DO PARCEIRO & BENEFÍCIO */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
              <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-neutral-800">
                <Gift className="h-4 w-4 text-amber-500" />
                Benefício Solicitado
              </h4>
              {partner.website && (
                <a
                  href={partner.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1"
                >
                  <span>Acessar Site do Parceiro</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <div className="space-y-1.5 text-xs">
              <p className="text-neutral-800 leading-relaxed font-medium">
                {partner.benefits || 'Condição exclusiva com 100% de desconto e carência especial garantida pelo Grupo GSA.'}
              </p>
              {partner.redemption_instructions && (
                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 text-[11px] text-amber-900 leading-relaxed">
                  <strong>Instruções do Parceiro:</strong> {partner.redemption_instructions}
                </div>
              )}
            </div>
          </div>

          {resgate.status === 'recusado' && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-rose-100 pb-3">
                <X className="h-5 w-5 text-rose-600" />
                <h3 className="text-sm font-black text-rose-900">
                  Solicitação Recusada
                </h3>
              </div>
              <div className="space-y-2">
                <strong className="text-[10px] uppercase tracking-wider font-black text-rose-600">Motivo da Recusa</strong>
                <p className="text-sm text-rose-800 bg-white/50 p-3 rounded-xl border border-rose-100/50">
                  {resgate.motivo_recusa || 'Sem motivo registrado'}
                </p>
              </div>
            </div>
          )}

          {resgate.recurso && (
            <div className={`rounded-2xl border p-4 sm:p-5 shadow-sm space-y-4 ${
              resgate.recurso.status === 'em_analise'
                ? 'border-sky-200 bg-sky-50'
                : resgate.recurso.status === 'deferido'
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-rose-200 bg-rose-50'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 border-b border-current/10 pb-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Recurso do cliente</p>
                  <h3 className="text-sm font-black text-slate-900">
                    {resgate.recurso.status === 'em_analise'
                      ? 'Aguardando decisão'
                      : resgate.recurso.status === 'deferido'
                        ? 'Recurso aprovado'
                        : 'Recurso recusado'}
                  </h3>
                </div>
                <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-mono font-bold text-slate-600 border border-slate-200">
                  {resgate.recurso.protocolo_recurso}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-xl border border-white bg-white/70 p-3">
                  <span className="font-bold text-slate-500">Aberto em</span>
                  <p className="mt-1 font-black text-slate-900">{new Date(resgate.recurso.aberto_em).toLocaleString('pt-BR')}</p>
                </div>
                <div className="rounded-xl border border-white bg-white/70 p-3">
                  <span className="font-bold text-slate-500">Prazo de análise</span>
                  <p className={`mt-1 font-black ${new Date(resgate.recurso.prazo_analise_em).getTime() < currentTime.getTime() && resgate.recurso.status === 'em_analise' ? 'text-rose-700' : 'text-slate-900'}`}>
                    {new Date(resgate.recurso.prazo_analise_em).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Contestação apresentada</span>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{resgate.recurso.contestacao_cliente}</p>
              </div>

              {resgate.recurso.motivo_decisao && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800">
                  <strong>Motivo da decisão:</strong> {resgate.recurso.motivo_decisao}
                </div>
              )}

              {/* Galeria de Evidências e Anexos Apresentados */}
              {resgate.recurso.evidencias && resgate.recurso.evidencias.length > 0 && (
                <div className="space-y-3 rounded-2xl border border-sky-200/80 bg-white/90 p-4 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-sky-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-sky-600" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                        Evidências e Documentos Anexados
                      </h4>
                    </div>
                    <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-bold text-sky-700">
                      {resgate.recurso.evidencias.length} {resgate.recurso.evidencias.length === 1 ? 'anexo' : 'anexos'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {resgate.recurso.evidencias.map((url, idx) => {
                      const isPdf = /\.pdf(\?.*)?$/i.test(url) || url.toLowerCase().includes('/pdf');
                      const filename = url.split('/').pop()?.split('?')[0] || `evidencia-${idx + 1}`;
                      const decodedFilename = decodeURIComponent(filename);

                      if (isPdf) {
                        return (
                          <div
                            key={idx}
                            className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-3 hover:border-sky-300 hover:bg-sky-50/40 transition-all shadow-2xs"
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 block">
                                  Documento PDF
                                </span>
                                <p className="font-mono text-xs font-bold text-slate-800 truncate" title={decodedFilename}>
                                  {decodedFilename}
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-end">
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:text-sky-600 hover:border-sky-300 transition-colors shadow-2xs"
                              >
                                <ExternalLink className="h-3 w-3" />
                                <span>Abrir Documento</span>
                              </a>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={idx}
                          className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white hover:border-sky-400 hover:shadow-md transition-all flex flex-col"
                        >
                          {/* Thumbnail Preview */}
                          <div className="relative aspect-video w-full overflow-hidden bg-slate-100 flex items-center justify-center">
                            <img
                              src={url}
                              alt={`Evidência ${idx + 1}`}
                              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                                e.currentTarget.parentElement?.classList.add('bg-slate-200');
                              }}
                            />
                            {/* Overlay com Ações */}
                            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedPreviewImage(url)}
                                className="p-2 rounded-xl bg-white/90 text-slate-900 hover:bg-white transition-all shadow-md cursor-pointer hover:scale-110"
                                title="Expandir imagem"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 rounded-xl bg-white/90 text-slate-900 hover:bg-white transition-all shadow-md cursor-pointer hover:scale-110"
                                title="Abrir em nova aba"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </div>
                          </div>

                          {/* Footer do Card */}
                          <div className="p-2.5 bg-slate-50/90 border-t border-slate-100 flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                                Anexo #{idx + 1}
                              </span>
                              <p className="font-mono text-[11px] font-bold text-slate-700 truncate" title={decodedFilename}>
                                {decodedFilename}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedPreviewImage(url)}
                              className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:text-sky-600 hover:border-sky-300 transition-colors shrink-0 shadow-2xs cursor-pointer"
                            >
                              <Maximize2 className="h-3 w-3" />
                              <span>Ampliar</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {resgate.recurso.status === 'em_analise' && (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="appeal-decision-reason" className="text-xs font-bold text-slate-700">
                      Fundamentação da decisão
                    </label>
                    <textarea
                      id="appeal-decision-reason"
                      value={appealDecisionReason}
                      onChange={(event) => setAppealDecisionReason(event.target.value.slice(0, 2000))}
                      placeholder="Obrigatória para recusar; opcional para aprovar..."
                      className="mt-1.5 min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => handleAppealDecision('deferido')}
                      disabled={isDecidingAppeal}
                      className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {isDecidingAppeal ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Aprovar recurso
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAppealDecision('indeferido')}
                      disabled={isDecidingAppeal || appealDecisionReason.trim().length < 10}
                      className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      Recusar recurso
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {(resgate.status === 'analise' || resgate.status === 'pendente') && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
                <ShieldAlert className="h-5 w-5 text-indigo-600" />
                <h4 className="font-black text-sm text-neutral-800 uppercase tracking-wider">
                  Ação Necessária
                </h4>
              </div>
              
              {!showRejectInput ? (
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={isApproving}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 transition-all shadow-sm disabled:opacity-50"
                  >
                    {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    <span>Aprovar Pedido</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRejectInput(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-100 px-4 py-3 text-sm font-black text-rose-700 hover:bg-rose-200 transition-all shadow-sm"
                  >
                    <X className="h-4 w-4" />
                    <span>Recusar</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                  <label className="flex items-center gap-1 text-xs font-bold text-neutral-700">
                    <span>Motivo da Recusa</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Informe o motivo para o cliente..."
                    className="w-full rounded-xl border border-neutral-300 p-3 text-sm focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 focus:outline-none min-h-[80px]"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowRejectInput(false)}
                      className="px-4 py-2 text-xs font-bold text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={isRejecting || !rejectReason.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors disabled:opacity-50 shadow-sm"
                    >
                      {isRejecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      <span>Confirmar Recusa</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. FORMULÁRIO DE INSERÇÃO / GERENCIAMENTO DO LINK DE ATIVAÇÃO */}
          {resgate.status !== 'recusado' && resgate.status !== 'cancelado' && (
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/50 via-white to-amber-50/30 p-4 sm:p-5 space-y-3.5 shadow-sm">
              <div className="flex items-start gap-2.5 text-amber-950">
                <Sparkles className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-black text-sm">
                    {slaData.concluido ? 'Link de Ativação do Parceiro' : 'Inserir Link de Ativação'}
                  </h4>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    {slaData.concluido
                      ? 'O link de ativação foi registrado com sucesso. Você pode reenviar a notificação ou alterar o link abaixo.'
                      : `Cadastre o cliente no site da ${partner.name} e cole o link exclusivo de ativação gerado. O sistema enviará a notificação oficial automaticamente via WhatsApp.`}
                  </p>
                </div>
              </div>

              {/* Visualização de Link Concluído vs Formulário */}
              {resgate.link_ativacao && !isEditingLink ? (
                <div className="space-y-3 pt-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-emerald-300 shadow-sm">
                    <div className="space-y-1 min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Link Ativo no Cadastro
                      </span>
                      <a
                        href={resgate.link_ativacao}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs font-bold text-indigo-600 hover:underline truncate max-w-md flex items-center gap-1.5"
                      >
                        <span className="truncate">{resgate.link_ativacao}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </a>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopy(resgate.link_ativacao!, 'link_ativacao', 'Link')}
                        className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors flex items-center gap-1.5 shadow-xs"
                        title="Copiar Link"
                      >
                        {copiedField === 'link_ativacao' ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>Copiar</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleResendWhatsApp}
                        disabled={isResending}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                        title="Reenviar mensagem no WhatsApp"
                      >
                        {isResending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <MessageSquare className="h-3.5 w-3.5" />
                        )}
                        <span>Reenviar WhatsApp</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingLink(true)}
                        className="rounded-xl border border-neutral-200 bg-white px-2.5 py-2 text-xs font-bold text-neutral-600 hover:bg-neutral-50 transition-colors"
                        title="Alterar Link"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveActivation} className="space-y-3 pt-1">
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-neutral-400">
                      <Link2 className="h-4 w-4" />
                    </div>
                    <input
                      type="url"
                      value={activationLink}
                      onChange={(e) => setActivationLink(e.target.value)}
                      placeholder={`Cole o link de ativação gerado no site da ${partner.name} (ex: https://.../ativar?id=...)`}
                      className="w-full rounded-2xl border border-neutral-300 bg-white py-3 pl-10 pr-4 text-xs font-mono text-neutral-900 placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all shadow-sm"
                      autoFocus
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-neutral-400">
                        <Gift className="h-4 w-4" />
                      </div>
                      <input
                        type="text"
                        value={cupom}
                        onChange={(e) => setCupom(e.target.value)}
                        placeholder="Cupom (Opcional)"
                        className="w-full rounded-2xl border border-neutral-300 bg-white py-2.5 pl-10 pr-4 text-xs font-mono uppercase text-neutral-900 placeholder:text-neutral-400 placeholder:normal-case focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all shadow-sm"
                      />
                    </div>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-neutral-400">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <input
                        type="text"
                        value={voucher}
                        onChange={(e) => setVoucher(e.target.value)}
                        placeholder="Voucher (Opcional)"
                        className="w-full rounded-2xl border border-neutral-300 bg-white py-2.5 pl-10 pr-4 text-xs font-mono uppercase text-neutral-900 placeholder:text-neutral-400 placeholder:normal-case focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2.5">
                    {resgate.link_ativacao && (
                      <button
                        type="button"
                        onClick={() => {
                          setActivationLink(resgate.link_ativacao || '');
                          setIsEditingLink(false);
                        }}
                        disabled={isSaving}
                        className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={isSaving || !activationLink.trim()}
                      className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50 active:scale-[0.99] cursor-pointer"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Salvando e Notificando WhatsApp...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          <span>Salvar e Notificar Cliente via WhatsApp</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Ações administrativas ficam exclusivamente dentro deste modal. */}
          {isSystemAdmin && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 sm:p-5 space-y-4 shadow-sm">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
                <div><h4 className="text-sm font-black uppercase tracking-wider text-rose-950">Ações administrativas</h4><p className="mt-1 text-xs leading-relaxed text-rose-800">O cancelamento preserva o histórico e exige motivo. A exclusão é definitiva e só é liberada depois do cancelamento.</p></div>
              </div>

              {resgate.status !== 'cancelado' ? (
                !showCancelForm ? <button type="button" onClick={() => setShowCancelForm(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-3 text-sm font-black text-rose-700 hover:bg-rose-100"><Ban className="h-4 w-4" />Cancelar resgate</button> :
                <div className="space-y-3 rounded-xl border border-rose-200 bg-white p-4">
                  <label className="block text-xs font-bold text-rose-950">Motivo do cancelamento <span className="text-rose-600">*</span><textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value.slice(0, 2000))} placeholder="Explique claramente por que este resgate será cancelado..." className="mt-2 min-h-24 w-full rounded-xl border border-rose-200 p-3 text-sm font-normal outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100" /></label>
                  <div className="flex justify-end gap-2"><button type="button" onClick={() => { setShowCancelForm(false); setCancelReason(''); }} disabled={isCancelling} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Voltar</button><button type="button" onClick={handleAdministrativeCancel} disabled={isCancelling || cancelReason.trim().length < 10} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}Confirmar cancelamento</button></div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-rose-200 bg-white p-3 text-xs text-rose-900"><strong>Motivo registrado:</strong><p className="mt-1 whitespace-pre-wrap">{resgate.motivo_cancelamento || 'Motivo não informado.'}</p></div>
                  {!showDeleteForm ? <button type="button" onClick={() => setShowDeleteForm(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-3 text-sm font-black text-white hover:bg-rose-800"><Trash2 className="h-4 w-4" />Excluir definitivamente</button> :
                  <div className="space-y-3 rounded-xl border-2 border-rose-300 bg-white p-4">
                    <p className="text-xs font-bold leading-relaxed text-rose-900">Esta ação excluirá o resgate, recursos, eventos e notificações associados. A auditoria administrativa será preservada.</p>
                    <label className="block text-xs font-bold text-slate-700">Digite o protocolo <span className="font-mono text-rose-700">{resgate.codigo_gerado || resgate.id}</span><input value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)} className="mt-2 w-full rounded-xl border border-rose-300 px-3 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-rose-100" /></label>
                    <div className="flex justify-end gap-2"><button type="button" onClick={() => { setShowDeleteForm(false); setDeleteConfirmation(''); }} disabled={isDeleting} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Voltar</button><button type="button" onClick={handleAdministrativeDelete} disabled={isDeleting || deleteConfirmation.trim().toUpperCase() !== (resgate.codigo_gerado || resgate.id).trim().toUpperCase()} className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Excluir definitivamente</button></div>
                  </div>}
                </div>
              )}
            </div>
          )}

          {/* 5. HISTÓRICO DE AUDITORIA E LINHA DO TEMPO DE EVENTOS */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-indigo-600" />
                <h4 className="text-xs font-black uppercase tracking-wider text-neutral-800">
                  Histórico de Auditoria & Eventos
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-md">
                  {timelineEvents.length} {timelineEvents.length === 1 ? 'registro' : 'registros'}
                </span>
                <button
                  type="button"
                  onClick={loadTimelineEvents}
                  disabled={isLoadingEvents}
                  className="p-1 rounded-lg text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                  title="Atualizar eventos"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingEvents ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {isLoadingEvents ? (
              <div className="flex items-center justify-center py-6 gap-2 text-xs text-neutral-500 font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                <span>Carregando histórico do protocolo...</span>
              </div>
            ) : timelineEvents.length > 0 ? (
              <div className="relative pl-5 sm:pl-6 space-y-3.5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-200">
                {timelineEvents.map((evento: any, idx: number) => {
                  const actorType = evento.ator_tipo || 'sistema';
                  const isClient = actorType === 'cliente';
                  const isAdmin = actorType === 'admin';
                  const isColab = actorType === 'colaborador';

                  // Helper visual styling per event type
                  const getEventVisuals = (tipo: string) => {
                    switch (tipo) {
                      case 'solicitacao_criada':
                        return {
                          icon: <FileText className="h-3.5 w-3.5 text-amber-600" />,
                          badgeBg: 'bg-amber-50 border-amber-200 text-amber-800',
                          dotBg: 'bg-amber-500',
                        };
                      case 'solicitacao_recusada':
                      case 'recurso_indeferido':
                        return {
                          icon: <X className="h-3.5 w-3.5 text-rose-600" />,
                          badgeBg: 'bg-rose-50 border-rose-200 text-rose-800',
                          dotBg: 'bg-rose-500',
                        };
                      case 'recurso_interposto':
                        return {
                          icon: <Scale className="h-3.5 w-3.5 text-sky-600" />,
                          badgeBg: 'bg-sky-50 border-sky-200 text-sky-800',
                          dotBg: 'bg-sky-500',
                        };
                      case 'recurso_deferido':
                      case 'beneficio_liberado':
                      case 'solicitacao_aprovada':
                        return {
                          icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
                          badgeBg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
                          dotBg: 'bg-emerald-500',
                        };
                      default:
                        return {
                          icon: <Clock className="h-3.5 w-3.5 text-slate-500" />,
                          badgeBg: 'bg-slate-50 border-slate-200 text-slate-700',
                          dotBg: 'bg-slate-400',
                        };
                    }
                  };

                  const visuals = getEventVisuals(evento.tipo);
                  const description = evento.descricao_publica || evento.descricao;
                  const privateMotivo = evento.detalhes_privados?.motivo || evento.detalhes_privados?.motivo_decisao;

                  return (
                    <div key={evento.id || idx} className="relative group">
                      {/* Timeline Marker Dot */}
                      <div className="absolute -left-5 sm:-left-6 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white border-2 border-neutral-300 group-hover:border-indigo-500 transition-colors shadow-2xs">
                        <div className={`h-1.5 w-1.5 rounded-full ${visuals.dotBg}`} />
                      </div>

                      <div className="rounded-xl border border-neutral-100 bg-neutral-50/70 p-3 space-y-1.5 hover:bg-neutral-50 hover:border-neutral-200 transition-all">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-black border ${visuals.badgeBg}`}>
                              {visuals.icon}
                              <span>{evento.titulo}</span>
                            </span>

                            {/* Actor Badge */}
                            <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              isAdmin
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : isClient
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : isColab
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                            }`}>
                              {isAdmin ? 'Admin' : isClient ? 'Cliente' : isColab ? 'Colaborador' : 'Sistema'}
                            </span>
                          </div>

                          <span className="text-[10px] font-mono font-medium text-neutral-400">
                            {evento.ocorrido_em ? new Date(evento.ocorrido_em).toLocaleString('pt-BR') : '—'}
                          </span>
                        </div>

                        {description && (
                          <p className="text-xs text-neutral-700 leading-relaxed font-medium">
                            {description}
                          </p>
                        )}

                        {privateMotivo && privateMotivo !== description && (
                          <div className="text-[11px] text-neutral-600 bg-white/70 rounded-lg p-2 border border-neutral-100 italic">
                            <strong>Fundamentação registrada:</strong> "{privateMotivo}"
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-neutral-200 p-4 text-center text-xs text-neutral-400">
                Nenhum evento registrado ainda para este protocolo.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Lightbox de Expansão de Imagem da Evidência */}
      {selectedPreviewImage && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-neutral-950/90 backdrop-blur-md animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedPreviewImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-neutral-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lightbox Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-neutral-900 text-white border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-bold font-mono truncate max-w-md">
                  {decodeURIComponent(selectedPreviewImage.split('/').pop()?.split('?')[0] || 'Evidência do Recurso')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={selectedPreviewImage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Abrir Original</span>
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedPreviewImage(null)}
                  className="p-1.5 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Fechar visualização"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Lightbox Body with Image */}
            <div className="p-4 bg-neutral-950 flex items-center justify-center overflow-auto max-h-[calc(90vh-60px)]">
              <img
                src={selectedPreviewImage}
                alt="Visualização expandida"
                className="max-h-[75vh] w-auto object-contain rounded-xl shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

