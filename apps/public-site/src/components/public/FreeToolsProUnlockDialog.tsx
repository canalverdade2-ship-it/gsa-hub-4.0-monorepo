import { useEffect, useState } from 'react';
import { 
  AlertTriangle, 
  BadgeCheck, 
  Check, 
  CheckCircle2, 
  CreditCard, 
  Crown, 
  Loader2, 
  LockKeyhole, 
  LogIn, 
  MessageSquare, 
  ShieldCheck, 
  Smartphone, 
  Ticket, 
  X, 
  XCircle 
} from 'lucide-react';
import { AccessibleDialog } from '../ui/AccessibleDialog';
import { freeToolsProAccess, type ProAccessStatus, type ProToolId } from '../../lib/freeToolsProAccess';
import { rememberFreeToolsProLoginReturn } from '../../lib/freeToolsProLoginReturn';
import { maskPhone } from '../../lib/utils';

const TOOL_NAMES: Record<ProToolId, string> = {
  termination: 'Rescisão trabalhista Pro',
  retirement: 'Aposentadoria INSS Pro',
  vacation: 'Cálculo de férias Pro',
  thirteenth: '13º salário Pro',
  overtime: 'Horas extras & Noturno Pro',
  net_salary: 'Salário líquido & CLT x PJ Pro',
  mei_limit: 'Limite do MEI Pro',
  unemployment: 'Seguro-desemprego Pro',
  fator_r: 'Fator R Simples Nacional Pro',
  amortization: 'Amortização Pro',
  internship_termination: 'Rescisão de estágio Pro',
  prolabore_vs_lucros: 'Pró-labore vs Lucros Pro',
  employee_cost: 'Custo do funcionário Pro',
  night_shift_rural_urban: 'Adicional noturno rural/urbano Pro',
  proportional_salary: 'Salário proporcional Pro',
  late_fee_calculator: 'Juros e multa por atraso Pro',
  child_support: 'Pensão alimentícia Pro',
  benefits: 'Benefícios do INSS Pro',
  bpc: 'BPC / LOAS Pro',
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_voucher: 'Voucher inválido. Confira os dígitos do código e tente novamente.',
  voucher_unavailable: 'Este voucher já foi utilizado ou foi cancelado.',
  voucher_expired: 'Este voucher expirou.',
  voucher_wrong_tool: 'Este voucher não é válido para esta calculadora.',
  voucher_rate_limited: 'Foram realizadas muitas tentativas de voucher. Aguarde alguns minutos e tente novamente.',
  phone_already_used: 'Este número de WhatsApp já resgatou um voucher de uso único anteriormente.',
  invalid_phone: 'Informe um número de telefone com DDD válido (ex: 11 99999-9999).',
  checkout_rate_limited: 'Foram iniciados muitos checkouts neste dispositivo. Aguarde alguns minutos e tente novamente.',
  checkout_creation_failed: 'Não foi possível gerar o checkout neste momento.',
  infinitepay_not_configured: 'O pagamento online desta calculadora ainda não está configurado.',
  public_site_url_not_configured: 'O endereço de retorno do pagamento ainda não está configurado.',
  product_unavailable: 'O modo Pro desta calculadora está temporariamente indisponível.',
  invalid_product_price: 'O preço desta calculadora ainda não foi configurado corretamente.',
  payment_unavailable: 'Este pagamento não está mais disponível para confirmação.',
};

function formatPhoneInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

interface FreeToolsProUnlockDialogProps {
  isOpen: boolean;
  tool: ProToolId;
  status: ProAccessStatus | null;
  onClose: () => void;
  onUnlocked: () => void;
  onClientLogin: () => void;
}

type ModalAlert = {
  type: 'error' | 'success' | 'warning';
  title: string;
  message: string;
  actionText?: string;
  onAction?: () => void;
};

export function FreeToolsProUnlockDialog({ isOpen, tool, status, onClose, onUnlocked, onClientLogin }: FreeToolsProUnlockDialogProps) {
  const [voucher, setVoucher] = useState('');
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '' });
  const [loading, setLoading] = useState<'payment' | 'voucher' | 'request_whatsapp' | null>(null);
  
  // WhatsApp Request State
  const [showWhatsAppRequest, setShowWhatsAppRequest] = useState(false);
  const [whatsAppPhone, setWhatsAppPhone] = useState('');

  // Prominent Modal Alert
  const [alert, setAlert] = useState<ModalAlert | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setAlert(null);
    setLoading(null);
    setShowWhatsAppRequest(false);
  }, [isOpen, tool]);

  const productReady = Boolean(status?.success && status.product && status.available);
  const checkoutAvailable = Boolean(productReady && status?.checkout_available);
  const price = productReady && status?.product
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(status.product.preco_centavos / 100)
    : null;
  const durationMinutes = productReady ? Number(status?.product?.duracao_acesso_minutos || 0) : 0;
  const durationText = durationMinutes >= 1440 && durationMinutes % 1440 === 0
    ? `${durationMinutes / 1440} dia(s)`
    : durationMinutes >= 60 && durationMinutes % 60 === 0
      ? `${durationMinutes / 60} hora(s)`
      : `${durationMinutes} minuto(s)`;

  const pay = async () => {
    if (!checkoutAvailable) {
      setAlert({
        type: 'warning',
        title: 'Pagamento indisponível',
        message: 'O pagamento online ainda não está disponível no momento. Solicite um voucher gratuito ou acesse como cliente.',
      });
      return;
    }

    setLoading('payment');
    try {
      const result = await freeToolsProAccess.createCheckout(tool, customer);
      if (!result.success || !result.checkout_url) throw new Error(result.error || 'checkout_creation_failed');
      window.location.assign(result.checkout_url);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'checkout_creation_failed';
      setAlert({
        type: 'error',
        title: 'Falha no Checkout',
        message: ERROR_MESSAGES[code] || 'Não foi possível iniciar o pagamento. Tente novamente em instantes.',
      });
      setLoading(null);
    }
  };

  const redeem = async () => {
    const cleanVoucher = voucher.trim().toUpperCase();
    if (!cleanVoucher) {
      setAlert({
        type: 'warning',
        title: 'Código não informado',
        message: 'Por favor, digite o código do voucher no campo indicado antes de validar.',
      });
      return;
    }

    setLoading('voucher');
    try {
      const result = await freeToolsProAccess.redeemVoucher(tool, cleanVoucher);
      if (!result.success || !result.session?.success) {
        throw new Error(result.error || result.session?.error || 'voucher_unavailable');
      }

      setAlert({
        type: 'success',
        title: 'Voucher validado com sucesso!',
        message: 'O modo Pro foi liberado para 1 uso completo com emissão de relatório PDF.',
        actionText: 'Acessar Calculadora Pro',
        onAction: () => {
          setAlert(null);
          onUnlocked();
          onClose();
        },
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'voucher_unavailable';
      setAlert({
        type: 'error',
        title: 'Voucher Inválido ou Indisponível',
        message: ERROR_MESSAGES[code] || 'O código informado não é válido ou já foi utilizado. Confira o código ou solicite um novo voucher.',
        actionText: 'Entendi',
        onAction: () => {
          setAlert(null);
        },
      });
    } finally {
      setLoading(null);
    }
  };

  const handleRequestWhatsAppVoucher = async () => {
    const rawDigits = whatsAppPhone.replace(/\D/g, '');
    if (rawDigits.length < 10 || rawDigits.length > 11) {
      setAlert({
        type: 'warning',
        title: 'Número incompleto',
        message: 'Informe o número completo com DDD (exemplo: 11 99999-9999).',
        actionText: 'Corrigir Telefone',
        onAction: () => {
          setAlert(null);
        },
      });
      return;
    }

    setLoading('request_whatsapp');
    try {
      const result = await freeToolsProAccess.requestWhatsAppVoucher(tool, rawDigits);
      if (!result.success) {
        throw new Error(result.error || result.message || 'voucher_request_failed');
      }

      if (result.voucher_code) {
        setVoucher(result.voucher_code);
      }
      setShowWhatsAppRequest(false);

      setAlert({
        type: 'success',
        title: 'Voucher enviado para seu WhatsApp!',
        message: `Enviamos o código exclusivo para o WhatsApp informado (${formatPhoneInput(rawDigits)}). O código já foi preenchido no campo de voucher abaixo para sua comodidade. Clique em Validar para desbloquear!`,
        actionText: 'Validar Voucher Agora',
        onAction: () => {
          setAlert(null);
        },
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'voucher_request_failed';
      setAlert({
        type: 'error',
        title: code === 'phone_already_used' ? 'Voucher já resgatado' : 'Não foi possível solicitar',
        message: ERROR_MESSAGES[code] || (error instanceof Error ? error.message : 'Ocorreu um erro ao enviar o voucher. Tente novamente.'),
        actionText: 'Entendi',
        onAction: () => {
          setAlert(null);
        },
      });
    } finally {
      setLoading(null);
    }
  };

  const loginAsClient = () => {
    rememberFreeToolsProLoginReturn(tool);
    onClientLogin();
  };

  return (
    <AccessibleDialog
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel={`Desbloquear ${TOOL_NAMES[tool]}`}
      panelClassName="relative max-w-[980px] overflow-hidden rounded-2xl border border-[#c8bda9] bg-[#f5f1e9] shadow-[0_38px_110px_rgba(4,12,18,0.55)]"
      overlayClassName="items-center justify-center overflow-y-auto bg-[#07101b]/90 p-2 backdrop-blur-sm sm:p-5"
      zIndexClassName="z-[170]"
    >
      <div className="relative max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-h-[calc(100dvh-2.5rem)]">
        <header className="flex items-start justify-between gap-4 border-b border-[#d8d0c4] bg-[#fbf8f1] px-5 py-5 sm:px-7">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#172433] text-[#d8bd73]">
              <Crown className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#806128]">Acesso Pro avançado</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.03em] text-[#111820]">Desbloqueie a experiência completa.</h2>
              <p className="mt-2 text-sm leading-6 text-[#66717a]">{TOOL_NAMES[tool]}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d1c9bd] bg-white text-[#5c6670] transition hover:border-[#9d7c34] hover:text-[#111820]">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid lg:grid-cols-[1.04fr_0.96fr]">
          {/* LADO ESQUERDO: COMPRA AVULSA */}
          <section className="p-5 sm:p-7">
            <div className="rounded-2xl border border-[#d5cdc1] bg-white p-5 sm:p-6 shadow-sm">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#806128]">Compra avulsa</p>
                  {price ? (
                    <>
                      <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#111820]">{price}</p>
                      <p className="mt-1 text-xs text-[#6a737a]">Acesso por {durationText} após a confirmação.</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-lg font-black text-[#111820]">Configuração indisponível</p>
                      <p className="mt-1 text-xs leading-5 text-[#6a737a]">Preço e duração ainda não puderam ser confirmados pelo servidor.</p>
                    </>
                  )}
                </div>
                <CreditCard className="h-6 w-6 text-[#8a6e2f]" />
              </div>

              <ul className="mt-6 grid gap-3 text-sm text-[#4e5962] sm:grid-cols-2">
                {['Pagamento por Pix ou cartão', 'Liberação automática', 'Não exige cadastro', 'Checkout seguro InfinitePay'].map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    {item}
                  </li>
                ))}
              </ul>

              {!checkoutAvailable && (
                <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <strong className="block">Pagamento online indisponível neste momento.</strong>
                    O voucher e o benefício automático para clientes continuam disponíveis normalmente.
                  </span>
                </div>
              )}

              <div className="mt-6 border-t border-[#e3ddd4] pt-5">
                <p className="text-xs font-black text-[#333e47]">Dados opcionais para facilitar o checkout</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input 
                    value={customer.name} 
                    onChange={(event) => setCustomer({ ...customer, name: event.target.value })} 
                    placeholder="Nome completo" 
                    disabled={!checkoutAvailable} 
                    className="min-h-11 rounded-lg border border-[#d6cfc4] px-3 text-sm outline-none focus:border-[#91722f] disabled:bg-neutral-100 disabled:text-neutral-400" 
                  />
                  <input 
                    type="email" 
                    value={customer.email} 
                    onChange={(event) => setCustomer({ ...customer, email: event.target.value })} 
                    placeholder="E-mail" 
                    disabled={!checkoutAvailable} 
                    className="min-h-11 rounded-lg border border-[#d6cfc4] px-3 text-sm outline-none focus:border-[#91722f] disabled:bg-neutral-100 disabled:text-neutral-400" 
                  />
                  <input 
                    type="text"
                    inputMode="tel"
                    maxLength={15}
                    value={customer.phone} 
                    onChange={(event) => setCustomer({ ...customer, phone: maskPhone(event.target.value) })} 
                    placeholder="WhatsApp (DDD + Número)" 
                    disabled={!checkoutAvailable} 
                    className="min-h-11 rounded-lg border border-[#d6cfc4] px-3 font-mono text-sm outline-none focus:border-[#91722f] disabled:bg-neutral-100 disabled:text-neutral-400 sm:col-span-2" 
                  />
                </div>
              </div>

              <button 
                type="button" 
                onClick={() => void pay()} 
                disabled={loading !== null || !checkoutAvailable} 
                className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#172433] px-5 py-3 text-sm font-black text-white transition hover:bg-[#22364a] disabled:cursor-not-allowed disabled:bg-[#9aa1a7] disabled:opacity-80 shadow-sm"
              >
                {loading === 'payment' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {checkoutAvailable ? 'Pagar e desbloquear agora' : 'Pagamento indisponível'}
              </button>
            </div>
          </section>

          {/* LADO DIREITO: VOUCHER E BENEFÍCIO CLIENTE */}
          <aside className="border-t border-[#d8d0c4] bg-[#ece6db] p-5 sm:p-7 lg:border-l lg:border-t-0 flex flex-col gap-4">
            
            {/* CARD VOUCHER DE USO ÚNICO */}
            <div className="rounded-2xl border border-[#d1c8ba] bg-[#faf7f0] p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Ticket className="h-5 w-5 text-[#8a6e2f]" />
                  <div>
                    <p className="text-sm font-black text-[#202a32]">Voucher de uso único</p>
                    <p className="mt-0.5 text-xs text-[#6b747b]">Pode ser utilizado mesmo sem login.</p>
                  </div>
                </div>
              </div>

              {/* BOTÃO / ÁREA DE SOLICITAR VOUCHER VIA WHATSAPP */}
              {!showWhatsAppRequest ? (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5">
                  <p className="text-xs text-emerald-950 leading-relaxed font-medium">
                    🎁 <strong>Quer testar gratuitamente?</strong> Somente poderá ser resgatado <strong>1 voucher por número de WhatsApp</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowWhatsAppRequest(true)}
                    className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-xs font-black text-white transition hover:bg-emerald-800 shadow-sm"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Solicitar Voucher no WhatsApp
                  </button>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                      <Smartphone className="h-4 w-4 text-emerald-700" />
                      Informe seu WhatsApp com DDD
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowWhatsAppRequest(false)}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900"
                    >
                      Cancelar
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-emerald-800">
                    O sistema enviará o código do voucher instantaneamente para seu celular.
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <input 
                      type="tel"
                      value={whatsAppPhone}
                      inputMode="numeric"
onChange={(e) => setWhatsAppPhone(formatPhoneInput(e.target.value))}
                      placeholder="(11) 99999-9999"
                      className="min-h-11 rounded-lg border border-emerald-300 bg-white px-3 font-mono text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                      maxLength={16}
                    />
                    <button
                      type="button"
                      onClick={() => void handleRequestWhatsAppVoucher()}
                      disabled={loading === 'request_whatsapp'}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-xs font-black text-white transition hover:bg-emerald-800 disabled:opacity-60 shadow-sm"
                    >
                      {loading === 'request_whatsapp' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                      Receber Código no WhatsApp
                    </button>
                  </div>
                </div>
              )}

              {/* CAMPO DE DIGITAÇÃO DO VOUCHER */}
              <div className="mt-4 border-t border-[#e2dacb] pt-4">
                <label className="block text-xs font-black text-[#44505a] mb-1.5">
                  Digite ou cole o código recebido:
                </label>
                <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                  <input 
                    value={voucher} 
                    onChange={(event) => setVoucher(event.target.value.toUpperCase())} 
                    placeholder="GSA-PRO-XXXXXXXX" 
                    className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#d1c9bd] bg-white px-3 font-mono text-sm uppercase outline-none focus:border-[#91722f] focus:ring-2 focus:ring-[#91722f]/10" 
                  />
                  <button 
                    type="button" 
                    onClick={() => void redeem()} 
                    disabled={loading !== null} 
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#9d7c34] bg-[#f4ead0] px-4 text-sm font-black text-[#654f20] transition hover:bg-[#ebdcb5] disabled:opacity-60 shadow-sm"
                  >
                    {loading === 'voucher' ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                    Validar
                  </button>
                </div>
              </div>

              <p className="mt-3 text-[11px] leading-5 text-[#6b747b]">
                ⚡ Após a validação, o voucher libera <strong>1 uso completo</strong> (cálculo Pro e emissão de 1 relatório PDF detalhado).
              </p>
            </div>

            {/* CARD CLIENTE GSA */}
            <div className="rounded-2xl border border-[#b9c9c0] bg-[#edf4f0] p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#35705a]" />
                <div>
                  <p className="text-sm font-black text-[#163e31]">Benefício automático para clientes GSA</p>
                  <p className="mt-2 text-xs leading-5 text-[#426558]">
                    Todo cliente logado recebe acesso Pro automaticamente quando cumpre os dois critérios: cadastro ativo e pelo menos uma fatura paga.
                  </p>
                  {status?.logged_in ? (
                    <p className="mt-3 flex items-center gap-2 text-xs font-black text-[#315d4c]">
                      <LockKeyhole className="h-4 w-4" />
                      Sessão identificada. O sistema verificará os dois critérios.
                    </p>
                  ) : (
                    <button 
                      type="button" 
                      onClick={loginAsClient} 
                      className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#315d4c] px-4 text-sm font-black text-white transition hover:bg-[#25493b] shadow-sm"
                    >
                      <LogIn className="h-4 w-4" />
                      Entrar como cliente
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 rounded-xl border border-[#d5cec2] bg-white/65 p-4 text-xs leading-5 text-[#626c74]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6e2f]" />
              Pagamento, voucher e critérios do cliente são conferidos no servidor antes da liberação.
            </div>
          </aside>
        </div>

        {/* POP-UP / MODAL DE ALERTA CENTRAL E PROEMINENTE DENTRO DO DIALOG */}
        {alert && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
            <div 
              className="w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-2xl border border-neutral-200 animate-in zoom-in-95 duration-150 text-center"
              role="alertdialog"
              aria-modal="true"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full mb-4">
                {alert.type === 'error' ? (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
                    <XCircle className="h-8 w-8" />
                  </span>
                ) : alert.type === 'success' ? (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <CheckCircle2 className="h-8 w-8" />
                  </span>
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                    <AlertTriangle className="h-8 w-8" />
                  </span>
                )}
              </div>

              <h3 className="text-lg font-black text-neutral-900 leading-snug">
                {alert.title}
              </h3>

              <p className="mt-2.5 text-sm text-neutral-600 leading-relaxed font-medium">
                {alert.message}
              </p>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => {
                    if (alert.onAction) {
                      alert.onAction();
                    } else {
                      setAlert(null);
                    }
                  }}
                  className={`w-full min-h-12 rounded-xl px-4 text-sm font-black text-white transition shadow-sm cursor-pointer ${
                    alert.type === 'error' 
                      ? 'bg-red-600 hover:bg-red-700 active:bg-red-800' 
                      : alert.type === 'success'
                      ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                      : 'bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-950'
                  }`}
                >
                  {alert.actionText || 'Entendi'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AccessibleDialog>
  );
}

