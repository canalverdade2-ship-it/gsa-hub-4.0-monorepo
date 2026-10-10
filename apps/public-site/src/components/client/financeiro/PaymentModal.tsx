import React, { useState, useEffect } from 'react';
import { notifyWhatsAppModal } from '../../ui/WhatsAppButton';
import { motion } from 'framer-motion';
import { 
  CheckCircle, 
  RefreshCw, 
  Globe, 
  Info,
  CreditCard,
  Ticket,
  ArrowRight,
  Clock
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useRealtimeSubscription } from '../../../hooks/useRealtime';
import { toast } from 'react-hot-toast';
import { formatCurrency } from '../../../lib/utils';
import { Modal } from '../../ui/Modal';
import { logService } from '../../../lib/logService';
import { callClientRpc, requireClientSession } from '../../../lib/clientRpc';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  fatura: any;
  onSuccess: () => void;
  clientName?: string;
}

export function PaymentModal({ isOpen, onClose, fatura, onSuccess, clientName }: PaymentModalProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  
  // States from original component
  const [voucherCode, setVoucherCode] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState<any>(null);
  const [checkingVoucher, setCheckingVoucher] = useState(false);
  const [availableVouchers, setAvailableVouchers] = useState<any[]>([]);
  const [checkingAvailable, setCheckingAvailable] = useState(false);
  const [showVouchersList, setShowVouchersList] = useState(false);
  const [useWallet, setUseWallet] = useState(false);
  const [usePontos, setUsePontos] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  
  // Values
  const [saldoCarteira, setSaldoCarteira] = useState(0);
  const [saldoPontos, setSaldoPontos] = useState(0);
  const [carteiraBloqueada, setCarteiraBloqueada] = useState(false);
  const [pontosBloqueados, setPontosBloqueados] = useState(false);
  const [taxaConversao, setTaxaConversao] = useState(0.01);

  const subtotal = fatura.valor_final_pendente || fatura.valor_total;
  
  // Regra: Bloquear Saldo/Pontos no Financeiro para produtos da Loja GSA ou 1ª parcela de Assinatura
  const isGSAStoreInvoice = !!(
    fatura.ordem_compra_id || 
    (fatura.ordem_assinatura_id && /-1\/\d+$/.test(fatura.codigo_fatura || ''))
  );

  // Calculate deductions
  // Calculate deductions with float artifact prevention
  const voucherDiscount = Number((appliedVoucher ? (appliedVoucher.tipo === 'porcentagem' ? (subtotal * (appliedVoucher.valor / 100)) : appliedVoucher.valor) : 0).toFixed(2));
  const walletDeduction = Number(((useWallet && !isGSAStoreInvoice) ? Math.min(saldoCarteira, subtotal - voucherDiscount) : 0).toFixed(2));
  const pontosDeduction = Number(((usePontos && !isGSAStoreInvoice) ? Math.min(saldoPontos * taxaConversao, subtotal - voucherDiscount - walletDeduction) : 0).toFixed(2));
  const pontosUtilizados = Math.round(pontosDeduction / (taxaConversao || 0.01));
  const negativeBalanceCharge = saldoCarteira < 0 ? Math.abs(saldoCarteira) : 0;
  const netTotal = Number((Math.max(0, subtotal - voucherDiscount - walletDeduction - pontosDeduction) + negativeBalanceCharge).toFixed(2));

  const isStoreInvoice = fatura?.orcamentos?.categoria === 'loja' 
    || fatura?.orcamentos?.origem_gsa_store 
    || fatura?.ordens_compra != null 
    || fatura?.itens_faturados?.some((i: any) => i.tipo === 'produto');

  useEffect(() => {
    if (isOpen) {
      fetchClientData();
      setStep(isStoreInvoice ? 3 : 1);
      setPaymentConfirmed(false);
      setPaymentLink(null);
      notifyWhatsAppModal(true);
    } else {
      notifyWhatsAppModal(false);
    }
    return () => { notifyWhatsAppModal(false); };
  }, [isOpen]);

  useRealtimeSubscription(
    [
      {
        table: 'clientes',
        filter: fatura?.cliente_id ? `id=eq.${fatura.cliente_id}` : undefined,
        enabled: isOpen && Boolean(fatura?.cliente_id),
        onChange: fetchClientData,
      },
      {
        table: 'vouchers',
        enabled: isOpen && Boolean(fatura?.cliente_id),
        onChange: () => {
          if (showVouchersList) {
            fetchAvailableVouchers();
          }
        },
      },
    ],
    [isOpen, fatura?.cliente_id, showVouchersList]
  );

  async function fetchClientData() {
    const { data } = await supabase.from('clientes').select('saldo_carteira, saldo_pontos, carteira_bloqueada, pontos_bloqueados').eq('id', fatura.cliente_id).single();
    if (data) {
      setSaldoCarteira(data.saldo_carteira || 0);
      setSaldoPontos(data.saldo_pontos || 0);
      setCarteiraBloqueada(!!data.carteira_bloqueada);
      setPontosBloqueados(!!data.pontos_bloqueados);
    }
    const { data: emp } = await supabase.from('empresa').select('taxa_conversao_pontos').limit(1).single();
    if (emp) setTaxaConversao(emp.taxa_conversao_pontos || 0.01);
  };

  const fetchAvailableVouchers = async () => {
    setCheckingAvailable(true);
    try {
      const { data, error } = await supabase
        .from('vouchers')
        .select('*')
        .eq('status', 'ativo')
        .or(`cliente_id.eq.${fatura.cliente_id},cliente_id.is.null`);

      if (error) throw error;
      
      const now = new Date();
      const valid = data.filter((v: any) => {
        if (v.validade && new Date(v.validade) < now) return false;
        if (v.usage_limit && v.usage_count >= v.usage_limit) return false;
        if (v.categoria === 'saque') return false;
        if (v.cliente_id === null && v.codigo_voucher.startsWith('IDC')) return false;
        return true;
      });

      setAvailableVouchers(valid);
      setShowVouchersList(true);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao buscar vouchers.');
    } finally {
      setCheckingAvailable(false);
    }
  };

  const handleApplyVoucher = async (codeOverride?: string) => {
    const code = typeof codeOverride === 'string' ? codeOverride : voucherCode;
    if (!code.trim()) return;
    setCheckingVoucher(true);
    try {
      const { data, error } = await supabase
        .from('vouchers')
        .select('*')
        .eq('codigo_voucher', code.toUpperCase())
        .eq('status', 'ativo')
        .single();

      if (error || !data) throw new Error('Voucher inválido ou expirado.');
      
      const now = new Date();
      if (data.validade && new Date(data.validade) < now) throw new Error('Voucher expirado.');
      if (data.usage_limit && data.usage_count >= data.usage_limit) throw new Error('Limite de uso do voucher atingido.');
      if (data.categoria === 'saque') throw new Error('Este voucher é de saque e não pode ser aplicado aqui.');

      setAppliedVoucher(data);
      setVoucherCode(data.codigo_voucher);
      setShowVouchersList(false);
      toast.success(`Voucher ${data.codigo_voucher} aplicado com sucesso!`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCheckingVoucher(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const paymentResult = await callClientRpc<any>('gsa_client_pagar_fatura', {
        p_payload: {
          fatura_id: fatura.id,
          voucher_id: appliedVoucher?.id || null,
          metodo: selectedMethod || 'carteira',
          use_wallet: useWallet,
          use_pontos: usePontos,
          taxa_conversao: taxaConversao
        }
      });

      const result = paymentResult as any;
      const novoStatus = result?.status || 'pendente_pagamento';

      if (novoStatus === 'pago') {
        toast.success('Pagamento realizado com sucesso!');
        setPaymentConfirmed(true);
        setStep(4);
      } else {
        toast.success('Solicitacao de pagamento enviada para analise!');
        setStep(4);
      }

      await logService.logAction({
        ator_tipo: 'cliente',
        ator_id: fatura.cliente_id,
        acao: 'PAGAR_FATURA',
        detalhes: `Pagou fatura ${fatura.codigo_fatura}. Metodo: ${selectedMethod || 'carteira'}`
      });

      onSuccess();
    } catch (err: any) {
      console.error('Erro ao pagar fatura:', err);
      toast.error(err.message || 'Erro ao processar pagamento.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToPayment = async () => {
    if (selectedMethod === 'pix_manual' || selectedMethod === 'transferencia' || selectedMethod === 'boleto_manual') {
      handleConfirmPayment();
      return;
    }

    setGeneratingLink(true);
    try {
      const prepared = await callClientRpc<any>('gsa_client_pagar_fatura', {
        p_payload: {
          fatura_id: fatura.id,
          voucher_id: appliedVoucher?.id || null,
          metodo: selectedMethod || 'pix_infinitepay',
          use_wallet: useWallet,
          use_pontos: usePontos,
          taxa_conversao: taxaConversao,
        },
      });
      if (prepared?.status === 'pago') {
        toast.success('Pagamento realizado com sucesso!');
        setPaymentConfirmed(true);
        setStep(4);
        onSuccess();
        return;
      }
      const clientSession = requireClientSession();
      const { data: result, error } = await supabase.functions.invoke('gsa-payments', {
        body: {
          action: 'create_link',
          fatura_id: fatura.id,
          sessao_id: clientSession.sessaoId,
          session_token: clientSession.sessionToken,
        },
      });

      if (error || !result?.link) throw new Error(result?.error || 'Erro ao gerar link de pagamento.');
      
      // Redireciona diretamente para o link de pagamento
      window.location.href = result.link;
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível gerar o link.');
    } finally {
      setGeneratingLink(false);
    }
  };

  const paymentMethods = [
    { id: 1, nome: 'PIX', slug: 'pix_infinitepay', tipo: 'automatico' },
    { id: 2, nome: 'CARTÃO DE CRÉDITO', slug: 'cartao_infinitepay', tipo: 'automatico' },
    { id: 3, nome: 'BOLETO BANCÁRIO', slug: 'boleto_manual', tipo: 'manual', instrucoes: 'O boleto será enviado pelo nosso financeiro. Aguarde o contato.' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Realizar Pagamento" size="wide">
      <div className="space-y-6">
        {/* Steps Indicator */}
        {!isStoreInvoice && (
          <div className="flex items-center justify-between px-4">
            {[1, 2, 3, 4].map(s => (
              <div key={s} className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${step >= s ? 'bg-[#1a1a1a] text-white' : 'bg-[#f8f7f5] text-[#1a1a1a]/40'}`}>
                {s}
              </div>
            ))}
          </div>
        )}

        {step === 1 && !isStoreInvoice && (
          <div className="space-y-6">
            <h4 className="font-medium text-[#1a1a1a]">1. Descontos e Carteira</h4>
            
            <div className="rounded-2xl bg-neutral-100 p-5 ring-1 ring-neutral-300">
                <label className="mb-2 block text-[10px] font-semibold tracking-widest text-[#1a1a1a]/40 uppercase">Possui um Voucher?</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={voucherCode}
                    onChange={e => setVoucherCode(e.target.value.toUpperCase())}
                    placeholder="Digite o código..."
                    disabled={!!appliedVoucher}
                    className="flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-neutral-200 font-mono"
                  />
                  <button 
                    onClick={() => handleApplyVoucher()}
                    disabled={!!appliedVoucher || checkingVoucher}
                    className="rounded-xl bg-indigo-600 px-6 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {checkingVoucher ? '...' : appliedVoucher ? 'Aplicado' : 'Aplicar'}
                  </button>
                </div>
                {!appliedVoucher && (
                  <button 
                    onClick={() => { fetchAvailableVouchers(); }}
                    disabled={checkingAvailable}
                    className="flex items-center gap-1.5 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800 transition-colors ml-1 mt-2 cursor-pointer"
                  >
                    <Ticket className="w-3.5 h-3.5" />
                    {checkingAvailable ? 'Consultando...' : 'Consultar Vouchers Disponíveis'}
                  </button>
                )}

                {appliedVoucher && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-2.5 border border-emerald-100"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      <p className="text-[10px] font-black text-emerald-800 uppercase tracking-tight">
                        Voucher {appliedVoucher.codigo_voucher} aplicado! 
                        <span className="ml-1 text-emerald-600">
                          (-{appliedVoucher.tipo === 'porcentagem' ? `${appliedVoucher.valor}%` : formatCurrency(appliedVoucher.valor)})
                        </span>
                      </p>
                    </div>
                    <button 
                      onClick={() => { setAppliedVoucher(null); setVoucherCode(''); }}
                      className="text-[10px] font-black text-emerald-800 hover:text-red-600 underline uppercase transition-colors"
                    >
                      Remover
                    </button>
                  </motion.div>
                )}
            </div>

            {isGSAStoreInvoice ? (
              <div className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-900">Uso de Carteira/Pontos Indisponível</p>
                    <p className="text-xs font-medium text-amber-700 mt-1">
                      O uso de saldo ou pontos para novas compras da GSA Store deve ser feito diretamente no momento do checkout na loja. 
                      Para esta fatura, utilize apenas Pix ou Cartão.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`rounded-2xl p-5 ring-1 ${carteiraBloqueada ? 'bg-red-50 ring-red-100' : 'bg-indigo-50 ring-indigo-100'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`font-medium ${carteiraBloqueada ? 'text-red-900' : 'text-indigo-900'}`}>Saldo em Carteira</p>
                      <p className={`text-2xl font-black ${carteiraBloqueada ? 'text-red-600' : 'text-indigo-600'}`}>{formatCurrency(saldoCarteira)}</p>
                    </div>
                    <button 
                      onClick={() => setUseWallet(!useWallet)}
                      disabled={saldoCarteira <= 0 || carteiraBloqueada}
                      className={`relative h-6 w-11 rounded-full transition-colors ${useWallet && !carteiraBloqueada ? 'bg-indigo-600' : 'bg-neutral-300'}`}
                    >
                      <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform ${useWallet ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
              </div>
            )}

            <button onClick={() => setStep(2)} className="w-full rounded-xl bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-700">Avançar</button>
          </div>
        )}

        {step === 2 && !isStoreInvoice && (
          <div className="space-y-6">
            <h4 className="font-bold text-neutral-900">2. Revisão de Valores</h4>
            <div className="space-y-3 rounded-2xl bg-neutral-100 p-6 ring-1 ring-neutral-300 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span className="font-bold">{formatCurrency(subtotal)}</span></div>
              {voucherDiscount > 0 && <div className="flex justify-between text-emerald-600 font-bold"><span>Desconto Voucher</span><span>- {formatCurrency(voucherDiscount)}</span></div>}
              {walletDeduction > 0 && <div className="flex justify-between text-indigo-600 font-bold"><span>Uso de Carteira</span><span>- {formatCurrency(walletDeduction)}</span></div>}
              {pontosDeduction > 0 && <div className="flex justify-between text-violet-600 font-bold"><span>Uso de Pontos</span><span>- {formatCurrency(pontosDeduction)}</span></div>}
              <div className="border-t pt-3 flex justify-between text-lg font-black text-indigo-600"><span>Total a Pagar</span><span>{formatCurrency(netTotal)}</span></div>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setStep(1)} className="flex-1 rounded-xl border py-3 font-bold">Voltar</button>
              {netTotal <= 0 ? (
                <button onClick={handleConfirmPayment} disabled={loading} className="flex-1 rounded-xl bg-emerald-600 py-3 font-bold text-white">Confirmar</button>
              ) : (
                <button onClick={() => setStep(3)} className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold text-white">Forma de Pagamento</button>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h4 className="font-bold text-neutral-900">{isStoreInvoice ? 'Forma de Pagamento' : '3. Forma de Pagamento'}</h4>
            <div className="grid grid-cols-1 gap-3">
              {paymentMethods.map(m => (
                <button 
                  key={m.id} 
                  onClick={() => setSelectedMethod(m.slug)}
                  className={`rounded-xl border p-4 text-left font-bold ${selectedMethod === m.slug ? 'border-indigo-600 bg-indigo-50' : 'border-neutral-200'}`}
                >
                  {m.nome}
                </button>
              ))}
            </div>
            <div className="flex gap-4">
              <button onClick={() => isStoreInvoice ? onClose() : setStep(2)} className="flex-1 rounded-xl border py-3 font-bold">Voltar</button>
              <button onClick={handleGoToPayment} disabled={!selectedMethod || generatingLink} className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold text-white">Confirmar</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6 text-center">
             <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
               <CheckCircle className="h-10 w-10" />
             </div>
             <h4 className="text-2xl font-black">{paymentConfirmed ? 'Pagamento Confirmado!' : 'Solicitação Recebida!'}</h4>
             <p className="text-sm text-neutral-500">
               {paymentConfirmed ? 'Sua fatura foi quitada com sucesso.' : 'Seu pagamento manual está em análise. Você será notificado em breve.'}
             </p>
             {paymentLink && (
               <a href={paymentLink} target="_blank" className="block w-full rounded-xl bg-emerald-600 py-4 font-bold text-white">Pagar agora (InfinitePay)</a>
             )}
             <button onClick={onClose} className="w-full rounded-xl bg-neutral-100 py-3 font-bold">Fechar</button>
          </div>
        )}
      </div>

      <AvailableVouchersModal
        isOpen={showVouchersList}
        onClose={() => setShowVouchersList(false)}
        vouchers={availableVouchers}
        onSelect={(code) => {
          handleApplyVoucher(code);
          setShowVouchersList(false);
        }}
      />
    </Modal>
  );
}

// Subcomponent: Available Vouchers Modal (same pattern as AvailableCouponsModal)
function AvailableVouchersModal({ isOpen, onClose, vouchers, onSelect }: { isOpen: boolean, onClose: () => void, vouchers: any[], onSelect: (code: string) => void }) {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Vouchers Disponíveis" size="sm">
      <div className="p-2 space-y-4 max-h-[85vh] overflow-y-auto custom-scrollbar">
        {vouchers.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Ticket className="w-10 h-10 text-neutral-200" />
            </div>
            <p className="text-sm text-neutral-500 font-bold uppercase tracking-widest">Nenhum voucher disponível</p>
            <p className="text-xs text-neutral-400 mt-2 font-medium">Fique atento às nossas promoções!</p>
          </div>
        ) : (
          vouchers.map((voucher, idx) => (
            <motion.button
              key={voucher.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: idx * 0.05, type: 'spring', stiffness: 300, damping: 20 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { onSelect(voucher.codigo_voucher); onClose(); }}
              className="w-full text-left relative group outline-none focus:ring-4 focus:ring-indigo-500/20 rounded-3xl"
            >
              {/* Card Container with "Ticket" cutout effect */}
              <div className="relative bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-3xl border-2 border-indigo-200/60 p-5 pr-16 hover:border-indigo-500 transition-all shadow-sm group-hover:shadow-indigo-200/50 group-hover:shadow-xl overflow-hidden overflow-visible">
                {/* Shine Effect */}
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:animate-[shimmer_1.5s_infinite] skew-x-12 z-0"></div>

                {/* Side Circles Decoration */}
                <div className="absolute top-1/2 -left-3 -translate-y-1/2 w-6 h-6 bg-white border-2 border-indigo-200/60 rounded-full z-10 hidden md:block group-hover:border-indigo-500 transition-colors shadow-inner"></div>
                <div className="absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-6 bg-white border-2 border-indigo-200/60 rounded-full z-10 hidden md:block group-hover:border-indigo-500 transition-colors shadow-inner"></div>

                <div className="flex flex-col gap-2 relative z-10">
                  <div className="flex items-center gap-2 justify-between">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white shadow-sm border border-indigo-100 text-indigo-700 rounded-lg">
                      <Ticket className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-black uppercase tracking-widest">{voucher.codigo_voucher}</span>
                    </div>
                    {voucher.validade && (
                      <span className="text-[10px] font-bold text-neutral-500 uppercase flex items-center gap-1 bg-white/60 px-2 py-0.5 rounded-full border border-neutral-200/50 backdrop-blur-sm">
                        <Clock className="w-3 h-3" />
                        Válido até {new Date(voucher.validade).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>

                  {voucher.nome && (
                    <h4 className="text-base font-black text-neutral-800 group-hover:text-indigo-700 transition-colors line-clamp-1 mt-1 drop-shadow-sm">
                      {voucher.nome}
                    </h4>
                  )}

                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-3xl font-black tabular-nums bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-purple-600 drop-shadow-sm group-hover:scale-105 origin-left transition-transform duration-300">
                      {voucher.tipo === 'porcentagem' ? `${voucher.valor}%` : formatCurrency(voucher.valor)}
                    </span>
                    <span className="text-xs font-bold text-indigo-600/70 uppercase tracking-widest">
                      {voucher.tipo === 'porcentagem' ? 'OFF' : 'DESCONTO'}
                    </span>
                  </div>
                </div>

                {/* Vertical Divider Pattern */}
                <div className="absolute right-12 top-0 bottom-0 border-l-2 border-dashed border-indigo-300/60 group-hover:border-indigo-400 transition-colors z-0"></div>

                {/* Right Action Area */}
                <div className="absolute right-0 top-0 bottom-0 w-12 flex flex-col items-center justify-center bg-gradient-to-b from-emerald-500 to-emerald-600 group-hover:from-emerald-400 group-hover:to-emerald-500 transition-all z-10 shadow-[inset_1px_0_0_rgba(255,255,255,0.2)]">
                  <div className="text-white rotate-90 font-black text-sm uppercase tracking-[0.4em] whitespace-nowrap pl-1 drop-shadow-md flex items-center gap-2">
                    USAR <ArrowRight className="w-4 h-4 -rotate-90 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </div>
            </motion.button>
          ))
        )}
      </div>
    </Modal>
  );
}
