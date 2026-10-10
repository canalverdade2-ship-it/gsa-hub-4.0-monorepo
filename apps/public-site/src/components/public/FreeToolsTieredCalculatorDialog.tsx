import { useCallback, useEffect, useState, type ComponentType } from 'react';
import {
  ArrowRight,
  Baby,
  BadgePercent,
  BriefcaseBusiness,
  Building2,
  Calculator,
  CalendarDays,
  Clock3,
  Coins,
  Crown,
  GraduationCap,
  HandCoins,
  Heart,
  HeartHandshake,
  Landmark,
  Loader2,
  LockKeyhole,
  Palmtree,
  Percent,
  Sparkles,
  SunMedium,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { AccessibleDialog } from '../ui/AccessibleDialog';
import { FreeToolsSimpleCalculator } from './FreeToolsSimpleCalculators';
import { FreeToolsAdvancedCalculator } from './FreeToolsAdvancedCalculators';
import { FreeToolsProUnlockDialog } from './FreeToolsProUnlockDialog';
import {
  FreeToolsProEligibilityDialog,
  type ProEligibilityResult,
} from './FreeToolsProEligibilityDialog';
import {
  clearInfinitePayReturnFromUrl,
  freeToolsProAccess,
  readInfinitePayReturn,
  type ProAccessStatus,
  type ProToolId,
} from '../../lib/freeToolsProAccess';

export type FreeToolId = ProToolId;

interface FreeToolsTieredCalculatorDialogProps {
  tool: FreeToolId | null;
  onClose: () => void;
  onToolChange: (tool: FreeToolId) => void;
  onServices: () => void;
  onClientLogin: () => void;
}

const TOOLS: Record<FreeToolId, {
  icon: ComponentType<{ className?: string }>;
  title: string;
}> = {
  termination: {
    icon: BriefcaseBusiness,
    title: 'Calculadora de rescisão CLT',
  },
  retirement: {
    icon: Landmark,
    title: 'Calculadora aposentadoria INSS',
  },
  vacation: {
    icon: Palmtree,
    title: 'Calculadora de férias',
  },
  thirteenth: {
    icon: HandCoins,
    title: 'Calculadora de 13º salário',
  },
  overtime: {
    icon: Clock3,
    title: 'Calculadora de horas extras e noturno',
  },
  net_salary: {
    icon: Calculator,
    title: 'Calculadora de salário líquido (CLT x PJ)',
  },
  mei_limit: {
    icon: Building2,
    title: 'Calculadora de limite e excesso do MEI',
  },
  unemployment: {
    icon: HandCoins,
    title: 'Simulador de seguro-desemprego',
  },
  fator_r: {
    icon: BadgePercent,
    title: 'Calculadora do Fator R (Simples Nacional)',
  },
  amortization: {
    icon: TrendingUp,
    title: 'Calculadora de amortização (SAC / PRICE)',
  },
  internship_termination: {
    icon: GraduationCap,
    title: 'Rescisão de contrato de estágio',
  },
  prolabore_vs_lucros: {
    icon: Coins,
    title: 'Pró-labore vs Distribuição de lucros',
  },
  employee_cost: {
    icon: Users,
    title: 'Custo total do funcionário',
  },
  night_shift_rural_urban: {
    icon: SunMedium,
    title: 'Adicional noturno urbano vs rural',
  },
  proportional_salary: {
    icon: CalendarDays,
    title: 'Calculadora de salário proporcional',
  },
  late_fee_calculator: {
    icon: Percent,
    title: 'Juros e multa por atraso',
  },
  child_support: {
    icon: Heart,
    title: 'Simulador de pensão alimentícia',
  },
  benefits: {
    icon: Baby,
    title: 'Triagem de benefícios do INSS',
  },
  bpc: {
    icon: HeartHandshake,
    title: 'Triagem BPC / LOAS',
  },
};

const STYLES = `
  [role="dialog"][aria-label^="Calculadora GSA"] { isolation: isolate; }
  @media (max-width: 767px) {
    [role="dialog"][aria-label^="Calculadora GSA"] { width:100vw!important;max-width:100vw!important;height:100dvh!important;max-height:100dvh!important;margin:0!important;border:0!important;border-radius:0!important; }
    [role="dialog"][aria-label^="Calculadora GSA"] > div { height:100dvh!important;max-height:100dvh!important; }
    [role="dialog"][aria-label^="Calculadora GSA"] footer { padding-bottom:max(.75rem,env(safe-area-inset-bottom))!important; }
  }
`;

function sourceLabel(source?: string | null) {
  const labels: Record<string, string> = {
    payment: 'Pagamento confirmado',
    voucher: 'Voucher ativado',
    client_paid_invoice: 'Benefício automático de cliente',
    free_period: 'Promoção gratuita ativa',
    session: 'Sessão Pro ativa',
  };
  return source ? labels[source] || 'Acesso Pro ativo' : 'Acesso Pro bloqueado';
}

export function FreeToolsTieredCalculatorDialog({
  tool,
  onClose,
  onServices,
  onClientLogin,
}: FreeToolsTieredCalculatorDialogProps) {
  const [mode, setMode] = useState<'free' | 'pro'>('free');
  const [status, setStatus] = useState<ProAccessStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<{
    result: ProEligibilityResult;
    source?: string | null;
  } | null>(null);

  const presentation = tool ? TOOLS[tool] : null;
  const Icon = presentation?.icon || Calculator;

  const refreshStatus = useCallback(async (selectedTool: FreeToolId) => {
    try {
      const next = await freeToolsProAccess.status(selectedTool);
      if (!next?.success || !next.product) throw new Error('invalid_product_status');
      setStatus(next);
      setStatusError(false);
      return next;
    } catch {
      setStatus(null);
      setStatusError(true);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!tool) return;
    let active = true;
    setMode('free');
    setNotice(null);
    setUnlockOpen(false);
    setEligibility(null);
    setStatus(null);
    setStatusError(false);
    setChecking(true);

    void refreshStatus(tool).finally(() => {
      if (active) setChecking(false);
    });

    return () => {
      active = false;
    };
  }, [tool, refreshStatus]);

  useEffect(() => {
    if (!tool) return;
    const paymentReturn = readInfinitePayReturn();
    if (!paymentReturn || paymentReturn.tool !== tool) return;

    const isClientLoginReturn = paymentReturn.orderNsu === 'client-login';
    let active = true;

    const verify = async () => {
      setChecking(true);
      setNotice(isClientLoginReturn
        ? 'Login concluído. Verificando os critérios automáticos desta conta...'
        : 'Confirmando o pagamento com a InfinitePay...');

      try {
        let unlocked = false;
        let latestStatus: ProAccessStatus | null = null;

        if (!isClientLoginReturn && paymentReturn.transactionNsu && paymentReturn.slug) {
          const result = await freeToolsProAccess.verifyPayment(tool, paymentReturn);
          unlocked = Boolean(result.paid && result.session?.success);
        } else {
          for (let attempt = 0; attempt < 6 && active; attempt += 1) {
            latestStatus = await refreshStatus(tool);
            if (latestStatus?.access) {
              unlocked = true;
              break;
            }
            await new Promise((resolve) => window.setTimeout(resolve, 1500));
          }
        }

        if (!active) return;

        if (unlocked) {
          const activation = await freeToolsProAccess.activate(tool);
          if (activation.success) {
            setMode('pro');
            setNotice(isClientLoginReturn ? null : 'Pagamento confirmado. O modo Pro foi desbloqueado.');
            const refreshed = await refreshStatus(tool);
            const effectiveSource = refreshed?.source || latestStatus?.source || activation.source || null;

            if (isClientLoginReturn) {
              setEligibility({
                result: effectiveSource === 'free_period' ? 'promotion' : 'eligible',
                source: effectiveSource || 'client_paid_invoice',
              });
            }
            return;
          }
        }

        if (isClientLoginReturn) {
          setMode('free');
          setNotice(null);
          setEligibility({ result: 'ineligible' });
        } else {
          setNotice('O pagamento ainda está em processamento. A confirmação será atualizada automaticamente.');
        }
      } catch {
        if (!active) return;

        if (isClientLoginReturn) {
          setMode('free');
          setNotice(null);
          setEligibility({ result: 'verification_error' });
        } else {
          setNotice('Não foi possível confirmar o pagamento agora. Abra o modo Pro novamente para consultar o status.');
        }
      } finally {
        if (active) {
          setChecking(false);
          clearInfinitePayReturnFromUrl();
        }
      }
    };

    void verify();
    return () => {
      active = false;
    };
  }, [tool, refreshStatus]);

  const selectPro = async () => {
    if (!tool || checking) return;
    setChecking(true);
    setNotice(null);

    try {
      const next = await refreshStatus(tool);
      if (!next?.product) {
        setNotice('Não foi possível consultar agora o preço, a duração e o acesso Pro. Tente novamente em instantes.');
        return;
      }
      if (!next.available) {
        setNotice('O modo Pro desta calculadora está temporariamente indisponível.');
        return;
      }
      const cachedBlockMode = typeof localStorage !== 'undefined' ? localStorage.getItem(`gsa_free_tools_block_mode_${tool}`) : null;
      const isPartialLock = (next?.product?.modo_bloqueio || cachedBlockMode) === 'partial';

      if (!next.access) {
        if (isPartialLock) {
          setMode('pro');
          setNotice('Modo Pro liberado para simulação. A emissão do Relatório PDF exige a liberação de acesso Pro.');
          return;
        }
        setUnlockOpen(true);
        return;
      }

      const activation = await freeToolsProAccess.activate(tool);
      if (!activation.success) {
        setNotice('Não foi possível iniciar a sessão Pro. Tente novamente.');
        return;
      }

      setMode('pro');
      const refreshed = await refreshStatus(tool);
      const effectiveSource = refreshed?.source || next.source || activation.source || null;

      if (effectiveSource === 'free_period') {
        setEligibility({ result: 'promotion', source: 'free_period' });
      }
    } catch {
      setNotice('Não foi possível consultar o acesso Pro. Verifique sua conexão e tente novamente.');
    } finally {
      setChecking(false);
    }
  };

  const unlockedFromPopup = async () => {
    if (!tool) return;
    setMode('pro');
    setNotice('Acesso Pro liberado com sucesso.');
    await refreshStatus(tool);
  };

  const openUnlockOptions = () => {
    setEligibility(null);
    if (!status?.product) {
      setNotice('Não foi possível carregar as formas de desbloqueio. Toque novamente em Pro para atualizar.');
      return;
    }
    setUnlockOpen(true);
  };

  const onProPdfDownloaded = async () => {
    if (!tool) return;
    try {
      await freeToolsProAccess.consumeSession(tool);
    } catch {
      // ignore
    }
    await refreshStatus(tool);
    setMode('free');
    setNotice('O uso único do voucher foi concluído após a geração do PDF. A calculadora retornou ao modo Free.');
  };

  const price = status?.product
    ? new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(status.product.preco_centavos / 100)
    : null;

  const proSubtitle = checking && !status
    ? 'Consultando configuração...'
    : status?.access
      ? sourceLabel(status.source)
      : price
        ? `Avançado · ${price}`
        : statusError
          ? 'Toque para tentar novamente'
          : 'Cálculo avançado';

  return (
    <>
      <style>{STYLES}</style>

      <AccessibleDialog
        isOpen={Boolean(tool)}
        onClose={onClose}
        ariaLabel={presentation ? `Calculadora GSA — ${presentation.title}` : 'Calculadora GSA'}
        panelClassName="max-w-[1240px] overflow-hidden rounded-2xl border border-[#beb5a7] bg-[#f4efe6] shadow-[0_38px_110px_rgba(4,12,18,0.48)]"
        overlayClassName="items-center justify-center overflow-y-auto bg-[#07101b]/88 p-0 backdrop-blur-sm sm:p-5"
        zIndexClassName="z-[130]"
      >
        <div className="flex max-h-[calc(100dvh-.75rem)] min-h-0 flex-col sm:max-h-[calc(100dvh-2.5rem)]">
          <div className="flex min-h-7 items-center bg-[#111e2a] px-3 py-1.5 text-white sm:min-h-9 sm:px-6 sm:py-2">
            <strong className="text-[9px] font-black tracking-[.18em] text-[#d8bd73] sm:text-[10px]">GSA HUB</strong>
            <span className="mx-2.5 h-2.5 w-px bg-white/20 sm:mx-3 sm:h-3" />
            <span className="text-[8px] font-bold uppercase tracking-[.14em] text-white/50 sm:text-[9px]">Centro de ferramentas públicas</span>
          </div>

          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#d6cec2] bg-[#faf7f0]/97 px-3.5 py-2.5 backdrop-blur sm:px-6 sm:py-4">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#172433] text-[#d8bd73] shadow-xs sm:h-12 sm:w-12">
                <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
              </span>
              <h2 className="min-w-0 text-base font-black leading-tight tracking-[-.025em] text-[#111820] sm:text-2xl">{presentation?.title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar calculadora"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d1c9bd] bg-white text-[#5c6670] transition hover:border-[#9d7c34] hover:text-[#111820] sm:h-11 sm:w-11"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <section className="border-b border-[#ddd6cb] bg-[#eee8dd] px-3 py-2 sm:px-6 sm:py-3.5">
              <div className="mx-auto grid max-w-xl grid-cols-2 overflow-hidden rounded-xl border border-[#cec5b8] bg-white p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setMode('free')}
                  className={`min-h-10 rounded-lg px-3 text-xs font-black transition sm:min-h-12 sm:px-4 sm:text-sm ${mode === 'free' ? 'bg-[#172433] text-white shadow-sm' : 'text-[#59646d] hover:bg-[#f5f2ec]'}`}
                >
                  <span className="inline-flex items-center gap-1.5 sm:gap-2"><Calculator className="h-3.5 w-3.5 sm:h-4 sm:w-4" />Free</span>
                  <small className={`block text-[8px] font-bold sm:text-[9px] ${mode === 'free' ? 'text-white/50' : 'text-[#8b9297]'}`}>Cálculo simples</small>
                </button>

                <button
                  type="button"
                  onClick={() => void selectPro()}
                  className={`min-h-10 rounded-lg px-3 text-xs font-black transition sm:min-h-12 sm:px-4 sm:text-sm ${mode === 'pro' ? 'bg-[#91722f] text-white shadow-sm' : 'text-[#59646d] hover:bg-[#f5f2ec]'}`}
                >
                  <span className="inline-flex items-center gap-1.5 sm:gap-2"><Crown className="h-3.5 w-3.5 text-[#f5eaaf] sm:h-4 sm:w-4" />Pro</span>
                  <small className={`block text-[8px] font-bold sm:text-[9px] ${mode === 'pro' ? 'text-white/80' : 'text-[#8b9297]'}`}>
                    {proSubtitle}
                  </small>
                </button>
              </div>

              {notice && (
                <div className="mx-auto mt-2.5 max-w-xl rounded-lg border border-[#d2c4a3] bg-[#faf3df] px-3.5 py-2 text-xs font-bold text-[#685326] sm:px-4 sm:py-3">{notice}</div>
              )}
            </section>

            <main className="p-3 sm:p-6">
              {tool && (mode === 'free'
                ? <FreeToolsSimpleCalculator tool={tool} />
                : <FreeToolsAdvancedCalculator tool={tool} status={status} onUnlockRequired={openUnlockOptions} onPdfGenerated={onProPdfDownloaded} />)}
            </main>

            {/* Rodapé dentro do container de rolagem para não obstruir telas mobile */}
            <footer className="border-t border-[#d7d0c5] bg-[#faf7f0] px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-2xl">
                  <p className="text-[11px] font-bold text-[#4f5961]">Resultado informativo e educativo.</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-[#7a8288]">Não comprova direitos nem substitui documentos, cálculo oficial ou orientação profissional.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={onServices}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#b89a58] bg-[#f5ecd5] px-4 text-xs font-black uppercase tracking-wider text-[#654f20] shadow-2xs transition hover:bg-[#ede1c5]"
                  >
                    Conhecer atendimento GSA <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#172433] px-5 text-xs font-black uppercase tracking-wider text-white shadow-2xs transition hover:bg-[#253648]"
                  >
                    Fechar ferramenta
                  </button>
                </div>
              </div>
            </footer>
          </div>
        </div>
      </AccessibleDialog>

      {tool && status?.product && (
        <FreeToolsProUnlockDialog
          isOpen={unlockOpen}
          tool={tool}
          status={status}
          onClose={() => setUnlockOpen(false)}
          onUnlocked={() => void unlockedFromPopup()}
          onClientLogin={onClientLogin}
        />
      )}

      {tool && eligibility && (
        <FreeToolsProEligibilityDialog
          isOpen
          tool={tool}
          result={eligibility.result}
          status={status}
          source={eligibility.source}
          onClose={() => setEligibility(null)}
          onUnlockOptions={openUnlockOptions}
        />
      )}
    </>
  );
}
