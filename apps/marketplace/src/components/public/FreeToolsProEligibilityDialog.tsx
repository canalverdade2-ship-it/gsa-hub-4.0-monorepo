import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  CircleAlert,
  Crown,
  FileCheck2,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Ticket,
  X,
} from 'lucide-react';
import { AccessibleDialog } from '../ui/AccessibleDialog';
import type { ProAccessStatus, ProToolId } from '../../lib/freeToolsProAccess';

export type ProEligibilityResult = 'eligible' | 'ineligible' | 'verification_error' | 'promotion';

interface FreeToolsProEligibilityDialogProps {
  isOpen: boolean;
  tool: ProToolId;
  result: ProEligibilityResult;
  status: ProAccessStatus | null;
  source?: string | null;
  onClose: () => void;
  onUnlockOptions: () => void;
}

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

const SOURCE_LABELS: Record<string, string> = {
  client_paid_invoice: 'Benefício automático de cliente GSA',
  payment: 'Pagamento confirmado',
  voucher: 'Voucher validado',
  free_period: 'Promoção de acesso gratuito',
  session: 'Sessão Pro ativa',
};

function formatDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function Criterion({ met, title, description }: { met: boolean; title: string; description: string }) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${met ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${met ? 'bg-emerald-700 text-white' : 'bg-amber-600 text-white'}`}>
        {met ? <Check className="h-4 w-4" strokeWidth={3} /> : <LockKeyhole className="h-4 w-4" />}
      </span>
      <div>
        <p className={`text-sm font-black ${met ? 'text-emerald-950' : 'text-amber-950'}`}>{title}</p>
        <p className={`mt-1 text-xs leading-5 ${met ? 'text-emerald-800' : 'text-amber-800'}`}>{description}</p>
      </div>
    </div>
  );
}

export function FreeToolsProEligibilityDialog({
  isOpen,
  tool,
  result,
  status,
  source,
  onClose,
  onUnlockOptions,
}: FreeToolsProEligibilityDialogProps) {
  const eligible = result === 'eligible';
  const promotion = result === 'promotion';
  const verificationError = result === 'verification_error';
  const sourceLabel = source ? SOURCE_LABELS[source] || 'Acesso Pro autorizado' : 'Benefício automático de cliente GSA';
  const expiresAt = formatDateTime(status?.session_expires_at);
  const promotionStart = formatDateTime(status?.product?.gratuito_inicio);
  const promotionEnd = formatDateTime(status?.product?.gratuito_fim);
  const positive = eligible || promotion;

  return (
    <AccessibleDialog
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel={promotion ? 'Promoção de acesso gratuito ao Pro' : eligible ? 'Acesso Pro liberado' : verificationError ? 'Verificação do acesso Pro' : 'Acesso Pro não liberado'}
      panelClassName="max-w-[700px] overflow-hidden rounded-2xl border border-[#c8bda9] bg-[#f7f3eb] shadow-[0_40px_120px_rgba(4,12,18,0.58)]"
      overlayClassName="items-center justify-center overflow-y-auto bg-[#07101b]/92 p-3 backdrop-blur-sm sm:p-6"
      zIndexClassName="z-[190]"
    >
      <div className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
        <div className={`h-1.5 ${promotion ? 'bg-[#b58c37]' : eligible ? 'bg-emerald-600' : verificationError ? 'bg-[#a97625]' : 'bg-[#b77229]'}`} />

        <header className="flex items-start justify-between gap-4 border-b border-[#ddd5c9] bg-[#fbf8f2] px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex min-w-0 items-start gap-4">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white ${promotion ? 'bg-[#8a6829]' : eligible ? 'bg-emerald-700' : verificationError ? 'bg-[#8a6428]' : 'bg-[#9a5722]'}`}>
              {promotion ? <CalendarDays className="h-6 w-6" /> : eligible ? <BadgeCheck className="h-6 w-6" /> : verificationError ? <CircleAlert className="h-6 w-6" /> : <LockKeyhole className="h-6 w-6" />}
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#806128]">
                {promotion ? 'Promoção pública GSA' : 'Retorno do acesso de cliente'}
              </p>
              <h2 className="mt-1 text-2xl font-black leading-tight tracking-[-0.03em] text-[#111820]">
                {promotion ? 'Modo Pro liberado gratuitamente.' : eligible ? 'Acesso Pro liberado.' : verificationError ? 'Não foi possível concluir a verificação.' : 'O modo Pro permanece bloqueado.'}
              </h2>
              <p className="mt-2 text-sm font-bold text-[#68727a]">{TOOL_NAMES[tool]}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar aviso"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d1c9bd] bg-white text-[#5c6670] transition hover:border-[#9d7c34] hover:text-[#111820] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9d7c34]"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <main className="p-5 sm:p-7">
          {promotion ? (
            <>
              <p className="text-base leading-7 text-[#4f5a63]">
                A GSA está realizando uma promoção de acesso gratuito. Durante o período informado, qualquer pessoa pode utilizar esta calculadora Pro sem pagamento, voucher ou login.
              </p>

              <div className="mt-6 overflow-hidden rounded-2xl border border-[#d7c38e] bg-[#fbf4df]">
                <div className="flex items-start gap-4 border-b border-[#dfcfaa] px-5 py-4">
                  <Crown className="mt-0.5 h-5 w-5 shrink-0 text-[#86651f]" />
                  <div>
                    <p className="text-sm font-black text-[#4d3b17]">Promoção de acesso gratuito ao Pro</p>
                    <p className="mt-1 text-xs leading-5 text-[#715c2d]">O acesso permanece disponível durante todo o intervalo programado pela empresa.</p>
                  </div>
                </div>
                <div className="grid gap-px bg-[#dfcfaa] sm:grid-cols-2">
                  <div className="bg-white/70 px-5 py-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#8a7442]">Início</p>
                    <p className="mt-1 text-sm font-black text-[#3f3218]">{promotionStart || 'Período já iniciado'}</p>
                  </div>
                  <div className="bg-white/70 px-5 py-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#8a7442]">Término</p>
                    <p className="mt-1 text-sm font-black text-[#3f3218]">{promotionEnd || 'Conforme configuração da promoção'}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-800">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                Você poderá abrir e utilizar o modo Pro livremente enquanto a promoção estiver ativa.
              </div>
            </>
          ) : eligible ? (
            <>
              <p className="text-base leading-7 text-[#4f5a63]">
                Seu login foi confirmado. A conta está ativa e possui pelo menos uma fatura paga, portanto a calculadora avançada já está disponível.
              </p>

              <div className="mt-6 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50">
                <div className="flex items-start gap-4 border-b border-emerald-200 px-5 py-4">
                  <Crown className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                  <div>
                    <p className="text-sm font-black text-emerald-950">{sourceLabel}</p>
                    <p className="mt-1 text-xs leading-5 text-emerald-800">A autorização foi validada automaticamente no servidor.</p>
                  </div>
                </div>
                <div className="grid gap-px bg-emerald-200 sm:grid-cols-2">
                  <div className="flex items-center gap-2 bg-white/75 px-4 py-3 text-xs font-black text-emerald-900">
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />Cadastro ativo
                  </div>
                  <div className="flex items-center gap-2 bg-white/75 px-4 py-3 text-xs font-black text-emerald-900">
                    <FileCheck2 className="h-4 w-4 text-emerald-700" />Fatura paga encontrada
                  </div>
                </div>
              </div>

              {expiresAt && (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#d7d0c5] bg-white/70 p-4 text-xs leading-5 text-[#59646d]">
                  <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6e2f]" />
                  Esta sessão Pro está disponível até <strong>{expiresAt}</strong>.
                </div>
              )}
            </>
          ) : verificationError ? (
            <>
              <p className="text-base leading-7 text-[#4f5a63]">
                O login foi concluído, porém o sistema não conseguiu confirmar os dois critérios da conta neste momento. Nenhum acesso foi concedido sem validação.
              </p>
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#ddc99f] bg-[#faf2df] p-5 text-sm leading-6 text-[#665127]">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                Você pode continuar usando o cálculo Free ou consultar pagamento e voucher para desbloquear o Pro.
              </div>
            </>
          ) : (
            <>
              <p className="text-base leading-7 text-[#4f5a63]">
                Seu login foi realizado com sucesso, mas um ou mais critérios obrigatórios ainda não foram atendidos.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Criterion
                  met={Boolean(status?.client_active)}
                  title="Cadastro ativo"
                  description={status?.client_active ? 'A situação cadastral está regular.' : 'O cadastro precisa estar com status ativo.'}
                />
                <Criterion
                  met={Boolean(status?.client_has_paid_invoice)}
                  title="Pelo menos uma fatura paga"
                  description={status?.client_has_paid_invoice ? 'Foi localizada uma fatura com pagamento confirmado.' : 'Ainda não foi localizada uma fatura registrada como paga.'}
                />
              </div>

              <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#e0c5a8] bg-[#fbf0e4] p-4 text-xs leading-5 text-[#744b29]">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                O cálculo Free continua disponível. Para usar o Pro agora, também é possível realizar pagamento avulso ou aplicar um voucher válido.
              </div>
            </>
          )}
        </main>

        <footer className="flex flex-col-reverse gap-2 border-t border-[#d8d0c4] bg-[#fbf8f2] px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#d2cabf] bg-white px-5 text-sm font-black text-[#58636c] transition hover:border-[#9d7c34] hover:text-[#111820] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9d7c34]"
          >
            {positive ? 'Usar calculadora Pro' : 'Continuar no Free'}
          </button>

          {!positive && (
            <button
              type="button"
              onClick={onUnlockOptions}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#172433] px-5 text-sm font-black text-white transition hover:bg-[#22364a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9d7c34]"
            >
              <Ticket className="h-4 w-4" />
              Ver pagamento e voucher
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </footer>
      </div>
    </AccessibleDialog>
  );
}
