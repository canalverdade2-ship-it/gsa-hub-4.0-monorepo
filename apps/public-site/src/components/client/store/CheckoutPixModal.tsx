import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, 
  Clock, 
  Loader2, 
  ShieldCheck, 
  ExternalLink,
  Sparkles,
  RefreshCw,
  X,
  QrCode
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import confetti from 'canvas-confetti';
import { formatCurrency } from '../../../lib/utils';
import { supabase } from '../../../lib/supabase';
import { checkOrderStatus, createInfinitePayOrderCheckout } from '../../../lib/pixService';

export interface CheckoutPixModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderCode: string;
  total: number;
  pixCode?: string;
  qrCodeUrl?: string;
  checkoutUrl?: string;
  onPaymentSuccess: (orderId: string, orderCode: string) => void;
  clienteId?: string;
  clienteNome?: string;
  clienteEmail?: string;
  clienteTelefone?: string;
}

export function CheckoutPixModal({
  isOpen,
  onClose,
  orderId,
  orderCode,
  total,
  checkoutUrl,
  onPaymentSuccess,
  clienteId,
  clienteNome,
  clienteEmail,
  clienteTelefone,
}: CheckoutPixModalProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  const [activeCheckoutUrl, setActiveCheckoutUrl] = useState<string | null>(null);
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const hasTriggeredSuccess = useRef(false);
  const hasInitialized = useRef(false);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePaymentApproved = useCallback(() => {
    if (hasTriggeredSuccess.current) return;
    hasTriggeredSuccess.current = true;
    setIsPaid(true);

    try {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#10b981', '#059669', '#34d399', '#d8bd73', '#17345f']
      });
    } catch (_) {}

    toast.success('🎉 Pagamento Aprovado com Sucesso!', {
      duration: 5000,
      icon: '✅',
    });

    setTimeout(() => {
      onPaymentSuccess(orderId, orderCode);
    }, 2000);
  }, [orderId, orderCode, onPaymentSuccess]);

  // Initialize: resolve or create checkout URL
  useEffect(() => {
    if (!isOpen || hasInitialized.current) return;
    hasInitialized.current = true;
    hasTriggeredSuccess.current = false;
    setIsPaid(false);
    setIframeLoaded(false);
    setTimeLeft(15 * 60);

    if (checkoutUrl && checkoutUrl.trim().length > 10) {
      setActiveCheckoutUrl(checkoutUrl);
      return;
    }

    // If no checkout URL, create one
    setIsLoadingCheckout(true);
    setLoadError(null);

    createInfinitePayOrderCheckout({
      orcamentoId: orderId,
      codigoOrcamento: orderCode,
      clienteId: clienteId || '',
      clienteNome,
      clienteEmail,
      clienteTelefone,
    }).then((result) => {
      if (result.success && result.link) {
        setActiveCheckoutUrl(result.link);
      } else {
        setLoadError(result.error || 'Erro ao gerar link de pagamento. Tente novamente.');
      }
    }).catch((err) => {
      setLoadError(err.message || 'Erro ao gerar link de pagamento.');
    }).finally(() => {
      setIsLoadingCheckout(false);
    });
  }, [isOpen]);

  // Reset when closed
  useEffect(() => {
    if (!isOpen) {
      hasInitialized.current = false;
      setActiveCheckoutUrl(null);
      setIframeLoaded(false);
      setLoadError(null);
    }
  }, [isOpen]);

  // Timer countdown
  useEffect(() => {
    if (!isOpen || isPaid) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, isPaid]);

  // Payment status check
  const checkStatusNow = useCallback(async () => {
    if (!orderId || isPaid || hasTriggeredSuccess.current) return;
    setIsChecking(true);
    try {
      const res = await checkOrderStatus(orderId);
      if (res.pago) handlePaymentApproved();
    } catch (e) {
      console.error('[CheckoutPixModal] Erro ao verificar status:', e);
    } finally {
      setIsChecking(false);
    }
  }, [orderId, isPaid, handlePaymentApproved]);

  // Realtime + polling
  useEffect(() => {
    if (!isOpen || !orderId || isPaid) return;

    const pollInterval = setInterval(() => { checkStatusNow(); }, 3000);

    const channelOrc = supabase
      .channel(`pix-orc-${orderId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orcamentos', filter: `id=eq.${orderId}`,
      }, (payload) => {
        const newStatus = String(payload?.new?.status || '').toLowerCase();
        if (['pago', 'aprovado', 'em_expedicao', 'em_transporte', 'concluido'].includes(newStatus)) {
          handlePaymentApproved();
        }
      }).subscribe();

    const channelFat = supabase
      .channel(`pix-fat-${orderId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'faturas', filter: `orcamento_id=eq.${orderId}`,
      }, (payload) => {
        const newStatus = String(payload?.new?.status || '').toLowerCase();
        if (newStatus === 'pago') handlePaymentApproved();
      }).subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channelOrc);
      supabase.removeChannel(channelFat);
    };
  }, [isOpen, orderId, isPaid, checkStatusNow, handlePaymentApproved]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto bg-black/75 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25 }}
          className="relative w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl border border-neutral-200"
        >
          {/* Top Bar com Gradiente */}
          <div className="bg-gradient-to-r from-[#17345f] via-[#1e457e] to-[#17345f] px-6 py-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-md">
                <QrCode className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-black tracking-tight">
                  {isPaid ? 'Pagamento Aprovado!' : 'Pagamento via PIX'}
                </h3>
                <p className="text-xs text-blue-100 font-medium">
                  Pedido #{orderCode} • Banco Central do Brasil
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {!isPaid && (
                <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-emerald-300">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formatTimer(timeLeft)}</span>
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>

          {/* Conteúdo Principal */}
          <div className="p-5 sm:p-6 space-y-4">
            {isPaid ? (
              /* Tela de Sucesso */
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-10 text-center space-y-4"
              >
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-12 w-12 animate-bounce" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xl font-black text-neutral-900">Pagamento Confirmado!</h4>
                  <p className="text-sm text-neutral-600 font-medium">
                    Identificamos o pagamento de <strong className="text-emerald-700">{formatCurrency(total)}</strong>.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-neutral-500 pt-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[#17345f]" />
                  <span>Redirecionando para suas compras...</span>
                </div>
              </motion.div>
            ) : (
              <>
                {/* Destaque do Valor */}
                <div className="flex items-center justify-between rounded-2xl bg-emerald-50/70 border border-emerald-200/80 p-4">
                  <div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800">
                      Total a Pagar (PIX)
                    </span>
                    <p className="text-2xl font-black text-emerald-950">{formatCurrency(total)}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase text-white tracking-wide">
                    <Sparkles className="h-3 w-3" />
                    Aprovação Imediata
                  </span>
                </div>

                {/* Checkout iframe */}
                <div className="rounded-2xl overflow-hidden border border-neutral-200 bg-neutral-50 relative" style={{ minHeight: '380px' }}>
                  {isLoadingCheckout && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white z-10">
                      <Loader2 className="h-8 w-8 animate-spin text-[#17345f]" />
                      <p className="text-xs font-bold text-neutral-500">Gerando QR Code e código PIX...</p>
                    </div>
                  )}

                  {loadError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white z-10 p-6 text-center">
                      <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                        <X className="h-6 w-6 text-red-500" />
                      </div>
                      <p className="text-sm font-bold text-neutral-700">{loadError}</p>
                      <button
                        type="button"
                        onClick={() => {
                          hasInitialized.current = false;
                          setLoadError(null);
                        }}
                        className="rounded-xl bg-[#17345f] text-white px-4 py-2 text-xs font-black hover:bg-[#1e457e] transition-colors cursor-pointer"
                      >
                        Tentar Novamente
                      </button>
                    </div>
                  )}

                  {activeCheckoutUrl && !loadError && (
                    <>
                      {!iframeLoaded && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white z-10">
                          <Loader2 className="h-8 w-8 animate-spin text-[#17345f]" />
                          <p className="text-xs font-bold text-neutral-500">Carregando área de pagamento...</p>
                        </div>
                      )}
                      <iframe
                        src={activeCheckoutUrl}
                        title="Pagamento InfinitePay - PIX"
                        className="w-full border-0"
                        style={{ height: '480px', opacity: iframeLoaded ? 1 : 0, transition: 'opacity 0.3s' }}
                        onLoad={() => setIframeLoaded(true)}
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
                        allow="payment"
                      />
                    </>
                  )}

                  {!activeCheckoutUrl && !isLoadingCheckout && !loadError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white z-10">
                      <Loader2 className="h-8 w-8 animate-spin text-[#17345f]" />
                      <p className="text-xs font-bold text-neutral-500">Preparando pagamento...</p>
                    </div>
                  )}
                </div>

                {/* Status em Tempo Real */}
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                      </span>
                      <span className="text-xs font-black text-[#17345f]">Aguardando confirmação do banco...</span>
                    </div>
                    <button
                      type="button"
                      onClick={checkStatusNow}
                      disabled={isChecking}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer"
                    >
                      <RefreshCw className={`h-3 w-3 ${isChecking ? 'animate-spin' : ''}`} />
                      <span>Verificar agora</span>
                    </button>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-200/60">
                    <div className="h-full w-1/2 rounded-full bg-emerald-500 animate-[shimmer_2s_ease-in-out_infinite]"></div>
                  </div>
                  <p className="text-[10px] text-neutral-500 font-medium">
                    Após realizar o pagamento no app, o sistema reconhecerá automaticamente em poucos segundos.
                  </p>
                </div>

                {/* Link Externo como fallback */}
                {activeCheckoutUrl && (
                  <div className="text-center">
                    <a
                      href={activeCheckoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-500 hover:text-neutral-800 transition-colors"
                    >
                      <span>Prefere abrir em uma nova aba?</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}

                {/* Botão de Fechar */}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-xl border border-neutral-300 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100 transition-all cursor-pointer"
                >
                  Fechar e Pagar Mais Tarde em Minhas Compras
                </button>
              </>
            )}
          </div>

          {/* Rodapé Seguro */}
          <div className="bg-neutral-50 px-6 py-3 border-t border-neutral-200 flex items-center justify-between text-[11px] text-neutral-500 font-medium">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Transação Segura • Criptografia 256-bit</span>
            </div>
            <span>Grupo GSA • InfinitePay</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default CheckoutPixModal;
