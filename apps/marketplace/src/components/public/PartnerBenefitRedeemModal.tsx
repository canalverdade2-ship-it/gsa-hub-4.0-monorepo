import React, { useState, useEffect } from 'react';
import { 
  X, Gift, Sparkles, CheckCircle2, AlertTriangle,
  ArrowRight, ShieldCheck, Loader2, Phone, User, Mail,
  Clock, MessageSquare, Check, Ticket, Copy, ExternalLink,
  Star, Zap, Lock
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { maskPhone } from '../../lib/utils';
import { redeemPartnerBenefit } from '../../features/partners/service';
import type { Partner, PartnerBenefitRedemptionResult } from '../../features/partners/types';

export interface PartnerBenefitRedeemModalProps {
  partner: Partner | null;
  open: boolean;
  onClose: () => void;
  clienteId?: string | null;
}

export function PartnerBenefitRedeemModal({
  partner,
  open,
  onClose,
  clienteId
}: PartnerBenefitRedeemModalProps) {
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [showDuplicatePopup, setShowDuplicatePopup] = useState(false);
  const [justificativa, setJustificativa] = useState('');
  const [redemptionResult, setRedemptionResult] = useState<PartnerBenefitRedemptionResult | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [registeredData, setRegisteredData] = useState<{
    nome: string;
    email: string;
    telefone: string;
  } | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNomeCompleto('');
      setEmail('');
      setTelefone('');
      setSubmitting(false);
      setShowSuccessPopup(false);
      setShowDuplicatePopup(false);
      setRedemptionResult(null);
      setCopiedCode(false);
      setRegisteredData(null);
      setFocusedField(null);
    }
  }, [open, partner]);

  if (!open || !partner) return null;

  const handleCloseAll = () => {
    setShowSuccessPopup(false);
    setShowDuplicatePopup(false);
    onClose();
  };

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    toast.success('Código copiado!');
    setTimeout(() => setCopiedCode(false), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedNome = nomeCompleto.trim();
    if (trimmedNome.length < 3) {
      toast.error('Por favor, informe seu nome completo.');
      return;
    }

    const trimmedEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      toast.error('Por favor, informe um e-mail válido.');
      return;
    }

    const cleanPhone = telefone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      toast.error('Informe um telefone/WhatsApp válido com DDD.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await redeemPartnerBenefit({
        parceiroId: partner.id,
        parceiroSlug: partner.slug,
        nomeCompleto: trimmedNome,
        email: trimmedEmail,
        telefone: telefone.trim(),
        clienteId: clienteId || undefined,
        justificativaDuplicidade: justificativa || undefined,
        forceOverride: !!justificativa
      });

      setRedemptionResult(res);
      setRegisteredData({
        nome: trimmedNome,
        email: trimmedEmail,
        telefone: telefone.trim()
      });

      setShowSuccessPopup(true);
      setShowDuplicatePopup(false);
      toast.success(res?.status === 'analise' ? 'Solicitação enviada para análise!' : 'Benefício registrado com sucesso!', { duration: 4000 });
    } catch (err: any) {
      console.error('Erro ao resgatar benefício:', err);
      if (
        err?.status === 409 ||
        err?.code === '409' ||
        err?.message?.includes('409') ||
        err?.message?.includes('duplicidade') ||
        err?.message?.includes('já resgatou') ||
        err?.message?.includes('já resgatado')
      ) {
        setShowDuplicatePopup(true);
        return;
      }
      
      setShowSuccessPopup(false);
      toast.error(err?.message || 'Não foi possível registrar a solicitação. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const isDelay24h = Boolean(
    partner.redemption_delay_24h ||
    redemptionResult?.delay_24h ||
    redemptionResult?.status === 'analise' ||
    (!partner.redemption_has_coupon && !partner.redemption_has_voucher && !partner.redemption_has_link)
  );

  /* ─── Estilos compartilhados ─── */
  const inputBase = (field: string) =>
    `w-full rounded-2xl sm:rounded-xl border-2 py-3 sm:py-2.5 pl-10 pr-3.5 text-sm font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none transition-all duration-200 ${
      focusedField === field
        ? 'border-amber-400 bg-white shadow-[0_0_0_4px_rgba(251,191,36,0.12)]'
        : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300'
    }`;

  const noScrollClasses = "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto ${noScrollClasses}`}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop com blur suave */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={handleCloseAll}
        aria-hidden="true"
      />

      {/* ══════════════════════════════════════
          TELA 1 — FORMULÁRIO (ALTURA AJUSTÁVEL MOBILE)
      ══════════════════════════════════════ */}
      {showDuplicatePopup ? (
        <div className="relative w-full max-w-md min-h-[400px] overflow-hidden rounded-[28px] bg-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] flex flex-col justify-between my-auto border border-neutral-100">
          <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 shrink-0" />
          
          <div className="relative px-5 sm:px-6 pt-5 pb-3 text-center shrink-0">
            <button
              type="button"
              onClick={handleCloseAll}
              className="absolute right-4 sm:right-5 top-4 sm:top-5 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 transition-all cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto mb-2.5 relative w-fit">
              <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md">
                <AlertTriangle className="h-7 w-7 text-white" />
              </div>
            </div>
            <h2 className="text-lg font-black text-neutral-900 leading-tight">
              Você já resgatou este benefício!
            </h2>
            <p className="text-xs text-neutral-500 font-medium mt-2">
              Identificamos um resgate anterior. Se houver algum motivo especial para solicitar novamente, justifique abaixo.
            </p>
          </div>
          
          <div className="flex-1 px-5 sm:px-6 py-4 flex flex-col justify-between overflow-y-auto no-scrollbar">
            <div className="space-y-3">
              <label className="flex items-center gap-1 text-[11px] font-bold text-neutral-700">
                <span>Justificativa</span>
                <span className="text-rose-500 leading-none">*</span>
              </label>
              <textarea
                required
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Explique por que precisa resgatar novamente..."
                className="w-full rounded-xl border-2 py-3 px-3.5 text-sm font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none border-neutral-200 bg-neutral-50 focus:border-amber-400 focus:bg-white min-h-[100px] resize-none"
              />
            </div>
            <div className="flex items-center gap-2.5 pt-4 mt-auto">
              <button
                type="button"
                onClick={handleCloseAll}
                className="flex-1 rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-sm font-bold text-neutral-600 hover:bg-neutral-50 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !justificativa.trim()}
                className="flex-[2] flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-sm font-black text-white shadow-md hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-60 cursor-pointer"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span>Enviar Solicitação</span>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : !showSuccessPopup ? (
        <div className="relative w-full max-w-md min-h-[520px] sm:min-h-0 max-h-[92dvh] sm:max-h-[85vh] overflow-hidden rounded-[28px] bg-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] transition-all flex flex-col justify-between my-auto border border-neutral-100">

          {/* ── Faixa decorativa superior ── */}
          <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 shrink-0" />

          {/* ── Header ── */}
          <div className="relative px-5 sm:px-6 pt-5 pb-3.5 shrink-0">
            <button
              type="button"
              onClick={handleCloseAll}
              className="absolute right-4 sm:right-5 top-4 sm:top-5 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800 transition-all cursor-pointer"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Logo + info do parceiro */}
            <div className="flex items-center gap-3.5 pr-8">
              {partner.logo_url ? (
                <div className="relative shrink-0">
                  <div className="h-12 w-12 sm:h-13 sm:w-13 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs">
                    <img
                      src={partner.logo_url}
                      alt={partner.name}
                      className="h-full w-full object-contain p-1"
                    />
                  </div>
                  <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 shadow-2xs ring-2 ring-white">
                    <Star className="h-2 w-2 fill-white text-white" />
                  </div>
                </div>
              ) : (
                <div className="relative shrink-0 flex h-12 w-12 sm:h-13 sm:w-13 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-xs">
                  <Gift className="h-6 w-6 text-white" />
                  <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 shadow-2xs ring-2 ring-white">
                    <Star className="h-2 w-2 fill-white text-white" />
                  </div>
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-1 mb-0.5">
                  <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                  <span className="text-[10.5px] font-black uppercase tracking-wider text-amber-600 truncate">
                    Benefício Exclusivo GSA HUB
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-black text-neutral-900 leading-tight truncate">
                  {partner.name}
                </h2>
              </div>
            </div>
          </div>

          <div className="mx-5 sm:mx-6 h-px bg-gradient-to-r from-transparent via-neutral-200 to-transparent shrink-0" />

          {/* ── Body Form (Flex-1 para preenchimento harmonioso) ── */}
          <div className="flex-1 px-5 sm:px-6 py-4 flex flex-col justify-between overflow-y-auto no-scrollbar">
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between gap-3 sm:gap-3.5">

              <div className="space-y-3 sm:space-y-3.5">
                {/* Card de benefício */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/80 p-3.5 shadow-2xs">
                  <div className="relative flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500 shadow-2xs">
                      <Zap className="h-4 w-4 fill-white text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block">
                        Condição Exclusiva
                      </span>
                      <p className="text-xs sm:text-sm font-bold text-neutral-900 leading-snug line-clamp-2">
                        {partner.benefits || 'Descontos e condições exclusivas para associados e clientes GSA.'}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-neutral-500 font-medium">
                  Informe seus dados para liberar o benefício agora:
                </p>

                {/* Campo: Nome */}
                <div className="space-y-1">
                  <label className="flex items-center gap-1 text-[11px] font-bold text-neutral-700">
                    <span>Nome Completo</span>
                    <span className="text-rose-500 leading-none">*</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <User className={`h-4 w-4 transition-colors ${focusedField === 'nome' ? 'text-amber-500' : 'text-neutral-400'}`} />
                    </div>
                    <input
                      type="text"
                      required
                      value={nomeCompleto}
                      onChange={(e) => setNomeCompleto(e.target.value)}
                      onFocus={() => setFocusedField('nome')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Seu nome completo"
                      className={inputBase('nome')}
                    />
                  </div>
                </div>

                {/* Campo: E-mail */}
                <div className="space-y-1">
                  <label className="flex items-center gap-1 text-[11px] font-bold text-neutral-700">
                    <span>E-mail</span>
                    <span className="text-rose-500 leading-none">*</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Mail className={`h-4 w-4 transition-colors ${focusedField === 'email' ? 'text-amber-500' : 'text-neutral-400'}`} />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="seu.email@exemplo.com"
                      className={inputBase('email')}
                    />
                  </div>
                </div>

                {/* Campo: WhatsApp */}
                <div className="space-y-1">
                  <label className="flex items-center gap-1 text-[11px] font-bold text-neutral-700">
                    <span>WhatsApp com DDD</span>
                    <span className="text-rose-500 leading-none">*</span>
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Phone className={`h-4 w-4 transition-colors ${focusedField === 'tel' ? 'text-amber-500' : 'text-neutral-400'}`} />
                    </div>
                    <input 
                      type="tel"
                      required
                      value={telefone}
                      inputMode="numeric"
onChange={(e) => setTelefone(maskPhone(e.target.value))}
                      onFocus={() => setFocusedField('tel')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="(00) 00000-0000"
                      maxLength={15}
                      className={inputBase('tel')}
                    />
                  </div>
                </div>

                {/* Nota de privacidade */}
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50/80 border border-emerald-100/90 px-3 py-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-[10.5px] text-emerald-800 font-medium leading-tight">
                    Dados protegidos e utilizados exclusivamente para esta validação.
                  </span>
                </div>
              </div>

              {/* Ações na parte inferior */}
              <div className="flex items-center gap-2.5 pt-2 mt-auto">
                <button
                  type="button"
                  onClick={handleCloseAll}
                  className="flex-1 rounded-2xl sm:rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-xs sm:text-sm font-bold text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-[2] relative overflow-hidden flex items-center justify-center gap-1.5 rounded-2xl sm:rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-xs sm:text-sm font-black text-white shadow-md shadow-amber-500/25 hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-60 active:scale-[0.99] cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Registrando...</span>
                    </>
                  ) : (
                    <>
                      <span>Resgatar Benefício</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

      ) : isDelay24h ? (
        /* ══════════════════════════════════════
            TELA 2A — SUCESSO 24H (ALTURA AJUSTÁVEL MOBILE)
        ══════════════════════════════════════ */
        <div className="relative w-full max-w-md min-h-[520px] sm:min-h-0 max-h-[92dvh] sm:max-h-[85vh] overflow-hidden rounded-[28px] bg-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] flex flex-col justify-between my-auto border border-neutral-100">
          
          {/* Faixa verde de sucesso */}
          <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-500 shrink-0" />

          {/* ── Header de Sucesso ── */}
          <div className="relative px-5 sm:px-6 pt-5 pb-3 text-center shrink-0">
            <button
              type="button"
              onClick={handleCloseAll}
              className="absolute right-4 sm:right-5 top-4 sm:top-5 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 transition-all cursor-pointer"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Ícone de sucesso */}
            <div className="mx-auto mb-2.5 relative w-fit">
              <div className="flex h-13 w-13 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-green-500 shadow-md shadow-emerald-500/25">
                <MessageSquare className="h-7 w-7 text-white" />
              </div>
              <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-xs">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
            </div>

            <div className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-emerald-800 mb-1">
              <Check className="h-3 w-3" />
              <span>{redemptionResult?.status === 'analise' ? 'Solicitação em Análise' : 'Solicitação Confirmada'}</span>
            </div>

            <h2 className="text-base sm:text-lg font-black text-neutral-900 leading-tight">
              {redemptionResult?.status === 'analise' ? 'Novo Resgate em Análise' : 'Benefício Solicitado!'}
            </h2>
            <p className="text-xs text-neutral-500 font-medium truncate px-4">
              Parceiro: <strong className="text-neutral-800">{partner.name}</strong>
            </p>
          </div>

          <div className="mx-5 sm:mx-6 h-px bg-gradient-to-r from-transparent via-neutral-200 to-transparent shrink-0" />

          {/* ── Body 24h (Flex-1 para preenchimento dinâmico) ── */}
          <div className="flex-1 px-5 sm:px-6 py-4 flex flex-col justify-between space-y-3 overflow-y-auto no-scrollbar">

            <div className="space-y-2.5">
              {/* 1. Card Simplificado de Prazo & Etapas Coloridas (Verde, Amarelo e Vermelho) */}
              <div className="rounded-2xl border border-neutral-200/90 bg-white p-3 sm:p-3.5 shadow-2xs space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                  <span className="text-xs sm:text-sm font-black text-neutral-900">
                    {redemptionResult?.status === 'analise' ? 'Prazo de Análise: ' : 'Prazo de Liberação: '}
                    <span className="text-amber-600 font-black">Em até {redemptionResult?.status === 'analise' ? '48' : '24'} Horas</span>
                  </span>
                </div>

                <p className="text-[11px] text-neutral-600 font-medium leading-tight">
                  {redemptionResult?.status === 'analise'
                    ? 'Sua justificativa foi registrada. O benefício só será liberado após análise administrativa.'
                    : 'Seu link de ativação exclusivo será gerado e enviado diretamente no seu WhatsApp.'}
                </p>

                {/* 3 Etapas com Indicador de Conclusão / Em Andamento / Pendente (Animado como em ProtocolConsultPage) */}
                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  
                  {/* ETAPA 1: REGISTRADO (100% CONCLUÍDO) */}
                  <div className="relative rounded-2xl border-2 border-emerald-400/90 bg-emerald-50/95 p-2 sm:p-2.5 flex flex-col items-center justify-center shadow-xs transition-all hover:scale-[1.02]">
                    <div className="absolute -top-1.5 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs border-2 border-white">
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </div>
                    <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-1">
                      <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-black text-emerald-950 leading-tight">
                      1. Registrado
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[8.5px] sm:text-[9.5px] font-bold text-emerald-700 mt-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                      Confirmado
                    </span>
                  </div>

                  {/* ETAPA 2: EMISSÃO (EM ANDAMENTO - ANIMADO) */}
                  <div className="relative rounded-2xl border-2 border-amber-400 bg-amber-50/95 p-2 sm:p-2.5 flex flex-col items-center justify-center shadow-md shadow-amber-500/10 ring-2 ring-amber-400/30 transition-all hover:scale-[1.02]">
                    {/* Ping pulsante no topo */}
                    <div className="absolute -top-1.5 -right-1 flex h-4.5 w-4.5 items-center justify-center">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative flex h-4.5 w-4.5 items-center justify-center rounded-full bg-amber-500 text-white shadow-xs border-2 border-white">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      </span>
                    </div>
                    
                    <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-1 animate-pulse">
                      <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-black text-amber-950 leading-tight">
                      {redemptionResult?.status === 'analise' ? '2. Análise' : '2. Emissão'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[8.5px] sm:text-[9.5px] font-black text-amber-800 bg-amber-200/70 px-1.5 py-0.5 rounded-md mt-0.5 animate-pulse">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-ping"></span>
                      {redemptionResult?.status === 'analise' ? 'Até 48h' : 'Até 24h'}
                    </span>
                  </div>

                  {/* ETAPA 3: WHATSAPP (PENDENTE / PRÓXIMA) */}
                  <div className="relative rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-2 sm:p-2.5 flex flex-col items-center justify-center opacity-75 transition-all">
                    <div className="absolute -top-1.5 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-slate-200 text-slate-500 shadow-2xs border-2 border-white">
                      <Lock className="h-2.5 w-2.5" />
                    </div>
                    <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-1">
                      <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-600 leading-tight">
                      3. WhatsApp
                    </span>
                    <span className="text-[8.5px] sm:text-[9.5px] font-medium text-slate-400 mt-0.5">
                      Envio Final
                    </span>
                  </div>

                </div>
              </div>

              {/* 2. Protocolo Oficial — LINHA ÚNICA GARANTIDA */}
              {(redemptionResult?.codigo_gerado || redemptionResult?.protocolo) && (
                <div className="rounded-2xl border border-indigo-100/90 bg-gradient-to-br from-indigo-50/80 via-white to-indigo-50/40 p-3 shadow-2xs space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Ticket className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                    <span className="text-[10.5px] font-black uppercase tracking-wider text-indigo-800">
                      Protocolo Oficial de Resgate
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-xl bg-white border border-indigo-200/90 p-1.5 pl-3 shadow-2xs">
                    <div className="min-w-0 flex-1 overflow-x-auto no-scrollbar">
                      <span className="font-mono text-xs sm:text-[13px] font-black text-indigo-950 tracking-tight sm:tracking-normal whitespace-nowrap block select-all">
                        {redemptionResult.codigo_gerado || redemptionResult.protocolo}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(redemptionResult.codigo_gerado || redemptionResult.protocolo || '')}
                      className={`shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                        copiedCode
                          ? 'bg-emerald-500 text-white shadow-xs'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs active:scale-95'
                      }`}
                      title="Copiar Protocolo"
                    >
                      {copiedCode ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span className="text-[10.5px]">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span className="text-[10.5px]">Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* 3. Dados confirmados */}
              <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/90 p-3 space-y-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500 block">
                  Dados Confirmados para Contato
                </span>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-lg bg-green-100/90">
                      <Phone className="h-3 w-3 text-green-700" />
                    </div>
                    <span className="text-xs sm:text-sm text-neutral-700 font-medium truncate">
                      WhatsApp: <strong className="text-neutral-900 font-bold">{registeredData?.telefone}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-lg bg-amber-100/90">
                      <Mail className="h-3 w-3 text-amber-700" />
                    </div>
                    <span className="text-xs sm:text-sm text-neutral-700 font-medium truncate">
                      E-mail: <strong className="text-neutral-900 font-bold">{registeredData?.email}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-lg bg-neutral-200/80">
                      <User className="h-3 w-3 text-neutral-600" />
                    </div>
                    <span className="text-xs sm:text-sm text-neutral-700 font-medium truncate">
                      Titular: <strong className="text-neutral-900 font-bold">{registeredData?.nome}</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Botão na parte inferior */}
            <div className="pt-2 mt-auto">
              <button
                type="button"
                onClick={() => {
                  const protocolo = redemptionResult?.codigo_gerado || redemptionResult?.protocolo || '';
                  handleCloseAll();
                  if (protocolo) {
                    window.location.href = `/consulta-protocolo?codigo=${encodeURIComponent(protocolo)}`;
                  }
                }}
                className="w-full flex items-center justify-center gap-2 rounded-2xl sm:rounded-xl bg-neutral-900 px-5 py-3.5 text-xs sm:text-sm font-black text-white hover:bg-neutral-800 shadow-md transition-all active:scale-[0.99] cursor-pointer"
              >
                <Check className="h-4 w-4 text-emerald-400" />
                <span>Entendido — Concluir</span>
              </button>
            </div>
          </div>
        </div>

      ) : (
        /* ══════════════════════════════════════
            TELA 2B — LIBERAÇÃO IMEDIATA (ALTURA AJUSTÁVEL MOBILE)
        ══════════════════════════════════════ */
        <div className="relative w-full max-w-md min-h-[520px] sm:min-h-0 max-h-[92dvh] sm:max-h-[85vh] overflow-hidden rounded-[28px] bg-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] flex flex-col justify-between my-auto border border-neutral-100">

          {/* Faixa dourada premium */}
          <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-600 shrink-0" />

          {/* ── Header Imediato ── */}
          <div className="relative px-5 sm:px-6 pt-5 pb-3 text-center shrink-0">
            <button
              type="button"
              onClick={handleCloseAll}
              className="absolute right-4 sm:right-5 top-4 sm:top-5 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 transition-all cursor-pointer"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mx-auto mb-2.5 relative w-fit">
              <div className="flex h-13 w-13 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-500/25">
                <Gift className="h-7 w-7 text-white" />
              </div>
              <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-xs">
                <Zap className="h-4 w-4 fill-amber-400 text-amber-500" />
              </div>
            </div>

            <div className="inline-flex items-center gap-1 rounded-full bg-amber-100/90 px-2.5 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-amber-800 mb-1">
              <Sparkles className="h-3 w-3" />
              <span>Benefício Liberado Agora</span>
            </div>

            <h2 className="text-base sm:text-lg font-black text-neutral-900 leading-tight">
              Seu Benefício Está Pronto!
            </h2>
            <p className="text-xs text-neutral-500 font-medium truncate px-4">
              Parceiro: <strong className="text-neutral-800">{partner.name}</strong>
            </p>
          </div>

          <div className="mx-5 sm:mx-6 h-px bg-gradient-to-r from-transparent via-neutral-200 to-transparent shrink-0" />

          {/* ── Body Imediato (Flex-1) ── */}
          <div className="flex-1 px-5 sm:px-6 py-4 flex flex-col justify-between space-y-3 overflow-y-auto no-scrollbar">

            <div className="space-y-3">
              {/* Cupom / Código */}
              {(redemptionResult?.codigo_gerado || partner.redemption_coupon_code) && (
                <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-3.5 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1.5">
                    <Ticket className="h-4 w-4 text-amber-600" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-800">
                      Código Exclusivo
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-2.5">
                    <span className="font-mono text-xl sm:text-2xl font-black text-neutral-900 tracking-wider">
                      {redemptionResult?.codigo_gerado || partner.redemption_coupon_code}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(redemptionResult?.codigo_gerado || partner.redemption_coupon_code!)}
                      className="flex items-center gap-1 rounded-xl bg-white border border-amber-300 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-50 transition-all shadow-xs cursor-pointer"
                    >
                      {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedCode ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Link de acesso */}
              {(redemptionResult?.link || partner.redemption_link || partner.website) && (
                <a
                  href={redemptionResult?.link || partner.redemption_link || partner.website || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 rounded-2xl sm:rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-3 text-xs sm:text-sm font-black text-white hover:from-indigo-700 hover:to-violet-700 shadow-md shadow-indigo-500/20 transition-all active:scale-[0.99]"
                >
                  <span>Acessar Site do Parceiro</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}

              {/* Instruções de uso */}
              {(partner.redemption_instructions || redemptionResult?.instructions) && (
                <div className="rounded-2xl border border-neutral-200/90 bg-neutral-50 p-3">
                  <strong className="block text-[10px] font-black uppercase tracking-wider text-neutral-600 mb-1">
                    Como Utilizar:
                  </strong>
                  <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed font-medium">
                    {partner.redemption_instructions || redemptionResult?.instructions}
                  </p>
                </div>
              )}
            </div>

            {/* Confirmação de envio e Botão inferior */}
            <div className="space-y-2.5 pt-2 mt-auto">
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50/80 border border-emerald-100 px-3 py-2">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-500 text-white">
                  <MessageSquare className="h-3 w-3" />
                </div>
                <p className="text-xs text-emerald-900 font-medium truncate">
                  Cópia enviada ao WhatsApp <strong>{registeredData?.telefone}</strong>.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseAll}
                className="w-full rounded-2xl sm:rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs sm:text-sm font-bold text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50 transition-all cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
