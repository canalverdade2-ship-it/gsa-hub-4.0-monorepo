import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  BriefcaseBusiness,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coins,
  ExternalLink,
  GraduationCap,
  Heart,
  Info,
  Landmark,
  Layers,
  Palmtree,
  Percent,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Users,
} from 'lucide-react';
import {
  calculateAmortizationEstimate,
  calculateChildSupportEstimate,
  calculateEmployeeCostEstimate,
  calculateFatorREstimate,
  calculateInternshipTerminationEstimate,
  calculateLateFeeEstimate,
  calculateMeiLimitEstimate,
  calculateNetSalaryEstimate,
  calculateNightShiftRuralUrbanEstimate,
  calculateOvertimeEstimate,
  calculateProlaboreVsLucrosEstimate,
  calculateProportionalSalaryEstimate,
  calculateTerminationEstimate,
  calculateUnemploymentEstimate,
  calculateVacationEstimate,
  evaluateRetirement2026,
  type InsalubrityLevel,
  type NoticeType,
  type RetirementGender,
  type TerminationReason,
} from '../../lib/freeToolsCalculations';
import type { CalculatorPdfReport } from '../../lib/freeToolsPdfReport';
import type { ProAccessStatus, ProToolId } from '../../lib/freeToolsProAccess';
import { BenefitsPro, BpcPro, ThirteenthPro } from './FreeToolsAdditionalCalculators';
import { CalculatorPdfReportButton } from './CalculatorPdfReportButton';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

const TERMINATION_REASON_LABELS: Record<TerminationReason, string> = {
  without_cause: 'Demissão sem justa causa',
  agreement: 'Acordo entre as partes (Art. 484-A)',
  resignation: 'Pedido de demissão',
  just_cause: 'Demissão por justa causa',
};

function numeric(value: string) {
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function yesNo(value: boolean) {
  return value ? 'Sim' : 'Não';
}

function Field({
  label,
  value,
  onChange,
  prefix,
  suffix,
  help,
  max,
  step = 'any',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  help?: string;
  max?: number;
  step?: number | 'any';
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-[#26313a]">{label}</span>
      <span className="relative mt-2 block">
        {prefix && <span className="absolute inset-y-0 left-4 flex items-center text-sm font-bold text-[#727c84]">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`min-h-12 w-full rounded-lg border border-[#d5cfc5] bg-white py-3 text-sm font-bold text-[#111820] outline-none transition hover:border-[#bbb1a1] focus:border-[#91722f] focus:ring-4 focus:ring-[#91722f]/10 ${prefix ? 'pl-12' : 'pl-4'} ${suffix ? 'pr-16' : 'pr-4'}`}
        />
        {suffix && <span className="absolute inset-y-0 right-4 flex items-center text-xs font-bold text-[#727c84]">{suffix}</span>}
      </span>
      {help && <span className="mt-1.5 block text-xs leading-5 text-[#68727a]">{help}</span>}
    </label>
  );
}

function Section({ number, title, description, children }: { number: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section className="border-b border-[#e3ddd4] pb-7 last:border-0 last:pb-0">
      <div className="mb-5 flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#c9b57f] bg-[#f7f0dc] text-[9px] font-black text-[#765b25]">{number}</span>
        <div>
          <h3 className="text-sm font-black text-[#111820]">{title}</h3>
          {description && <p className="mt-1 text-xs leading-5 text-[#6b747c]">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function ResultLine({ label, value, emphasized, subtext }: { label: string; value: string; emphasized?: boolean; subtext?: string }) {
  return (
    <div className={`flex flex-col border-b border-white/10 py-3 last:border-0 ${emphasized ? 'text-[#f0d98f]' : 'text-white/76'}`}>
      <div className="flex items-start justify-between gap-5">
        <span className="text-xs leading-5 sm:text-sm">{label}</span>
        <strong className="shrink-0 text-right text-xs font-black sm:text-base">{value}</strong>
      </div>
      {subtext && <span className="mt-0.5 text-[11px] text-white/45">{subtext}</span>}
    </div>
  );
}

function Result({
  eyebrow,
  headline,
  summary,
  icon,
  children,
  note,
  report,
  action,
  status,
  tool,
  onUnlockRequired,
  onPdfGenerated,
}: {
  eyebrow: string;
  headline: string;
  summary: string;
  icon: ReactNode;
  children: ReactNode;
  note: string;
  report: CalculatorPdfReport;
  action?: ReactNode;
  status?: ProAccessStatus | null;
  tool?: ProToolId;
  onUnlockRequired?: () => void;
  onPdfGenerated?: () => void;
}) {
  return (
    <aside className="bg-[#132231] p-5 text-white sm:p-7 lg:sticky lg:top-0 lg:self-start">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
        <span className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.13em] text-[#d8bd73]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Resultado Pro com Tributos 2026
        </span>
        <BadgeCheck className="h-5 w-5 text-white/25" />
      </div>
      <div className="flex items-start justify-between gap-5 border-b border-white/10 py-6">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d8bd73]">{eyebrow}</p>
          <p className="mt-2 text-3xl font-black leading-tight tracking-[-0.03em] sm:text-4xl">{headline}</p>
          <p className="mt-3 max-w-md text-xs leading-5 text-white/60 sm:text-sm">{summary}</p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[#d8bd73]">{icon}</span>
      </div>
      <div className="mt-3">{children}</div>
      <div className="mt-6 flex gap-3 border-t border-white/10 pt-5 text-xs leading-5 text-white/55">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#d8bd73]" />
        {note}
      </div>
      <div className="mt-6 border-t border-white/10 pt-5">
        <CalculatorPdfReportButton 
          report={report} 
          mode="pro" 
          tool={tool} 
          status={status} 
          onUnlockRequired={onUnlockRequired} 
          onPdfGenerated={onPdfGenerated} 
        />
      </div>
      {action && <div className="mt-4">{action}</div>}
    </aside>
  );
}

function Workbench({ title, description, children, result }: { title: string; description: string; children: ReactNode; result: ReactNode }) {
  return (
    <div className="grid overflow-hidden rounded-2xl border border-[#d4cdc2] bg-white shadow-[0_24px_65px_rgba(29,36,42,0.11)] lg:grid-cols-[1.06fr_0.94fr]">
      <section className="min-w-0 bg-[#fffdfa]">
        <div className="border-b border-[#e2dcd2] bg-[#faf7f1] px-5 py-5 sm:px-7">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#806128]">Modo Pro · cálculo avançado 2026</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.025em] text-[#111820]">{title}</h3>
          <p className="mt-2 text-xs leading-5 text-[#68727a]">{description}</p>
        </div>
        <div className="space-y-7 p-5 sm:p-7 lg:p-8">{children}</div>
      </section>
      {result}
    </div>
  );
}

// ==========================================
// 1. RESCISÃO CLT (PRO AVANÇADA)
// ==========================================

function TerminationPro({ status, onUnlockRequired, onPdfGenerated }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void; onPdfGenerated?: () => void }) {
  const [salary, setSalary] = useState('3500');
  const [reason, setReason] = useState<TerminationReason>('without_cause');
  const [noticeType, setNoticeType] = useState<NoticeType>('indemnified_employer');
  const [days, setDays] = useState('15');
  const [years, setYears] = useState('2');
  const [thirteenth, setThirteenth] = useState('7');
  const [vacation, setVacation] = useState('7');
  const [fgts, setFgts] = useState('10000');
  const [expired, setExpired] = useState(false);
  const [insalubrity, setInsalubrity] = useState<InsalubrityLevel>('none');
  const [perilousness, setPerilousness] = useState(false);
  const [averages, setAverages] = useState('0');
  const [dependents, setDependents] = useState('0');

  const result = useMemo(
    () =>
      calculateTerminationEstimate({
        salary: numeric(salary),
        reason,
        noticeType,
        daysWorked: numeric(days),
        thirteenthMonths: numeric(thirteenth),
        vacationMonths: numeric(vacation),
        expiredVacation: expired,
        completedYears: numeric(years),
        fgtsBalance: numeric(fgts),
        insalubrity,
        perilousness,
        variableAverages: numeric(averages),
        dependents: numeric(dependents),
      }),
    [salary, reason, noticeType, days, thirteenth, vacation, expired, years, fgts, insalubrity, perilousness, averages, dependents]
  );

  const reset = () => {
    setSalary('3500');
    setReason('without_cause');
    setNoticeType('indemnified_employer');
    setDays('15');
    setYears('2');
    setThirteenth('7');
    setVacation('7');
    setFgts('10000');
    setExpired(false);
    setInsalubrity('none');
    setPerilousness(false);
    setAverages('0');
    setDependents('0');
  };

  const report: CalculatorPdfReport = {
    calculator: 'Calculadora de rescisão trabalhista',
    mode: 'pro',
    headline: `Total líquido estimado: ${currency.format(result.netTotal)} (Bruto: ${currency.format(result.total)})`,
    summary: 'Relatório completo com adicionais contratuais, cálculo de IRRF/INSS 2026 e comparativo de cenários.',
    sections: [
      {
        title: 'Dados do vínculo e parâmetros 2026',
        rows: [
          { label: 'Salário base informado', value: currency.format(numeric(salary)) },
          { label: 'Remuneração base considerada (com adicionais)', value: currency.format(result.effectiveBaseSalary) },
          { label: 'Motivo do desligamento', value: TERMINATION_REASON_LABELS[reason] },
          { label: 'Dias trabalhados no mês', value: `${numeric(days)} dia(s)` },
          { label: 'Anos completos na empresa', value: `${numeric(years)} ano(s)` },
          { label: 'Avos de 13º / Férias', value: `${numeric(thirteenth)}/12 e ${numeric(vacation)}/12` },
          { label: 'Saldo aproximado do FGTS', value: currency.format(numeric(fgts)) },
          { label: 'Dependentes para IRRF', value: `${numeric(dependents)} dependente(s)` },
        ],
      },
      {
        title: 'Memória detalhada de verbas',
        rows: [
          { label: 'Saldo de salário', value: currency.format(result.salaryBalance) },
          { label: `Aviso-prévio (${decimal.format(result.noticeDays)} dias)`, value: currency.format(result.notice) },
          { label: '13º proporcional', value: currency.format(result.thirteenthValue) },
          { label: 'Férias proporcionais + 1/3', value: currency.format(result.proportionalVacation) },
          { label: 'Férias vencidas + 1/3', value: currency.format(result.expiredVacationValue) },
          { label: 'Multa rescisória do FGTS', value: currency.format(result.fgtsPenalty) },
          { label: 'Total Bruto', value: currency.format(result.total) },
        ],
      },
      {
        title: 'Retenções fiscais (Tabelas Oficiais 2026)',
        rows: [
          { label: 'INSS sobre salário e aviso', value: `- ${currency.format(result.inssOnSalary)}` },
          { label: 'IRRF sobre salário e aviso', value: `- ${currency.format(result.irrfOnSalary)}` },
          { label: 'INSS sobre 13º salário', value: `- ${currency.format(result.inssOnThirteenth)}` },
          { label: 'IRRF sobre 13º salário', value: `- ${currency.format(result.irrfOnThirteenth)}` },
          { label: 'Total de Descontos Fiscais', value: `- ${currency.format(result.totalDeductions)}` },
          { label: 'Total Líquido a Receber', value: currency.format(result.netTotal) },
        ],
      },
      {
        title: 'Comparativo de Cenários de Desligamento',
        rows: result.scenarios.map((sc) => ({
          label: sc.label,
          value: `Líquido: ${currency.format(sc.netTotal)} | Multa FGTS: ${currency.format(sc.fgtsPenalty)} | Saque FGTS: ${sc.canWithdrawFgts ? 'Sim' : 'Não'}`,
        })),
      },
    ],
    disclaimer: 'Cálculo de precisão baseado nas tabelas progressivas de INSS e IRRF de 2026. Convenções coletivas e acordos específicos podem alterar adicionais e prazos.',
  };

  return (
    <Workbench
      title="Rescisão CLT Avançada com Impostos 2026"
      description="Cálculo completo com adicionais, tabela progressiva de INSS/IRRF 2026 e matriz comparativa de cenários."
      result={
        <Result
          eyebrow="Total líquido a receber"
          headline={currency.format(result.netTotal)}
          summary={`Total bruto de ${currency.format(result.total)} menos ${currency.format(result.totalDeductions)} em descontos oficiais de INSS e IRRF 2026.`}
          icon={<Calculator className="h-5 w-5" />}
          note="O saldo do FGTS não integra o total líquido. O saque depende da modalidade e da chave de conectividade."
          report={report}
          tool="termination"
          status={status}
          onUnlockRequired={onUnlockRequired}
          onPdfGenerated={onPdfGenerated}
        >
          {/* Gráfico/Barra de Distribuição Visual */}
          <div className="my-4 overflow-hidden rounded-lg bg-white/10 p-1">
            <div className="flex h-3 overflow-hidden rounded-md">
              <div style={{ width: `${Math.max(5, (result.netTotal / (result.total || 1)) * 100)}%` }} className="bg-emerald-400" title="Valor Líquido" />
              <div style={{ width: `${Math.min(95, (result.totalDeductions / (result.total || 1)) * 100)}%` }} className="bg-amber-400" title="Impostos/Descontos" />
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-bold text-white/60">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />Líquido: {currency.format(result.netTotal)}</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Impostos: {currency.format(result.totalDeductions)}</span>
            </div>
          </div>

          <ResultLine label="Saldo de salário" value={currency.format(result.salaryBalance)} />
          {result.notice !== 0 && (
            <ResultLine
              label={`Aviso-prévio (${decimal.format(result.noticeDays)} dias)`}
              value={currency.format(result.notice)}
              subtext={result.notice < 0 ? 'Desconto de aviso prévio não cumprido' : undefined}
            />
          )}
          <ResultLine label="13º proporcional" value={currency.format(result.thirteenthValue)} />
          <ResultLine label="Férias proporcionais + 1/3" value={currency.format(result.proportionalVacation)} />
          {expired && <ResultLine label="Férias vencidas + 1/3" value={currency.format(result.expiredVacationValue)} />}
          <ResultLine label="Multa estimada do FGTS" value={currency.format(result.fgtsPenalty)} />
          <ResultLine label="Total Bruto" value={currency.format(result.total)} />
          <ResultLine label="Retenções INSS + IRRF (2026)" value={`- ${currency.format(result.totalDeductions)}`} subtext={`INSS: ${currency.format(result.inssOnSalary + result.inssOnThirteenth)} | IRRF: ${currency.format(result.irrfOnSalary + result.irrfOnThirteenth)}`} />
          <ResultLine label="Total Líquido Estimado" value={currency.format(result.netTotal)} emphasized />
        </Result>
      }
    >
      <Section number="01" title="Dados principais do contrato">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Salário bruto mensal" value={salary} onChange={setSalary} prefix="R$" />
          <label className="block">
            <span className="text-sm font-black text-[#26313a]">Motivo do desligamento</span>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value as TerminationReason)}
              className="mt-2 min-h-12 w-full rounded-lg border border-[#d5cfc5] bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#91722f] focus:ring-4 focus:ring-[#91722f]/10"
            >
              <option value="without_cause">Demissão sem justa causa</option>
              <option value="agreement">Acordo entre as partes (Art. 484-A)</option>
              <option value="resignation">Pedido de demissão</option>
              <option value="just_cause">Demissão por justa causa</option>
            </select>
          </label>
        </div>
      </Section>

      <Section number="02" title="Adicionais & Média Variável">
        <div className="grid gap-5 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm font-black text-[#26313a]">Insalubridade</span>
            <select
              value={insalubrity}
              onChange={(event) => setInsalubrity(event.target.value as InsalubrityLevel)}
              className="mt-2 min-h-12 w-full rounded-lg border border-[#d5cfc5] bg-white px-3 py-3 text-xs font-bold outline-none focus:border-[#91722f]"
            >
              <option value="none">Nenhum grau</option>
              <option value="minimum_10">Grau Mínimo (10%)</option>
              <option value="medium_20">Grau Médio (20%)</option>
              <option value="maximum_40">Grau Máximo (40%)</option>
            </select>
          </label>

          <label className="flex cursor-pointer items-center gap-3 self-end rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a]">
            <input type="checkbox" checked={perilousness} onChange={(event) => setPerilousness(event.target.checked)} className="h-4 w-4 accent-[#8a6e2f]" />
            Adicional Periculosidade (30%)
          </label>

          <Field label="Médias de Horas Extras/Comissões" value={averages} onChange={setAverages} prefix="R$" />
        </div>
      </Section>

      <Section number="03" title="Períodos e tributos 2026">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Dias no mês" value={days} onChange={setDays} suffix="dias" max={30} step={1} />
          <Field label="Anos na empresa" value={years} onChange={setYears} suffix="anos" max={40} step={1} />
          <Field label="Avos de 13º" value={thirteenth} onChange={setThirteenth} suffix="/ 12" max={12} step={1} />
          <Field label="Avos de férias" value={vacation} onChange={setVacation} suffix="/ 12" max={12} step={1} />
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <Field label="Saldo atual do FGTS" value={fgts} onChange={setFgts} prefix="R$" />
          <Field label="Dependentes para IRRF" value={dependents} onChange={setDependents} suffix="dep." max={10} step={1} />
          <label className="flex cursor-pointer items-center gap-3 self-end rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a]">
            <input type="checkbox" checked={expired} onChange={(event) => setExpired(event.target.checked)} className="h-4 w-4 accent-[#8a6e2f]" />
            Possui férias vencidas (+1/3)
          </label>
        </div>
      </Section>

      {/* Matriz Comparativa de Cenários */}
      <Section number="04" title="Comparador de cenários de desligamento">
        <div className="grid gap-3 sm:grid-cols-3">
          {result.scenarios.map((sc) => (
            <div key={sc.reason} className={`rounded-xl border p-4 transition-all ${sc.reason === reason ? 'border-[#8a6e2f] bg-[#fffcf5] ring-2 ring-[#8a6e2f]/20' : 'border-neutral-200 bg-neutral-50/60'}`}>
              <span className="text-[10px] font-black uppercase text-[#8a6e2f]">{sc.label}</span>
              <p className="mt-2 text-xl font-black text-[#111820]">{currency.format(sc.netTotal)}</p>
              <p className="text-[11px] text-neutral-500">Bruto: {currency.format(sc.grossTotal)}</p>
              <div className="mt-3 space-y-1 border-t border-neutral-200/60 pt-2 text-[11px]">
                <p><strong>Multa FGTS:</strong> {currency.format(sc.fgtsPenalty)}</p>
                <p><strong>Saque FGTS:</strong> {sc.canWithdrawFgts ? '✅ Permitido' : '❌ Não'}</p>
                <p><strong>Seguro-Desemprego:</strong> {sc.unemploymentInsuranceEligible ? '✅ Habilitado' : '❌ Indisponível'}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <button type="button" onClick={reset} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#d5cec3] bg-white px-4 text-sm font-black text-[#59646d]">
        <RotateCcw className="h-4 w-4" />Restaurar exemplo
      </button>
    </Workbench>
  );
}

// ==========================================
// 2. APOSENTADORIA INSS (PRO AVANÇADA)
// ==========================================

function Requirement({ title, eligible, lines }: { title: string; eligible: boolean; lines: string[] }) {
  return (
    <article className={`rounded-xl border p-4 ${eligible ? 'border-emerald-300 bg-emerald-950/40 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-white'}`}>
      <div className="flex items-center gap-2">
        {eligible ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <Clock3 className="h-5 w-5 text-[#d8bd73]" />}
        <h4 className="text-xs font-black sm:text-sm">{title}</h4>
      </div>
      <p className={`mt-2 text-xs font-black ${eligible ? 'text-emerald-300' : 'text-[#efd991]'}`}>{eligible ? 'Requisitos atingidos em 2026' : 'Requisitos pendentes'}</p>
      <ul className={`mt-2 space-y-1 text-[11px] leading-4 ${eligible ? 'text-emerald-200/80' : 'text-white/60'}`}>
        {lines.map((line) => (
          <li key={line}>• {line}</li>
        ))}
      </ul>
    </article>
  );
}

function RetirementPro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void }) {
  const [gender, setGender] = useState<RetirementGender>('woman');
  const [age, setAge] = useState('57');
  const [contribution, setContribution] = useState('29');
  const [beforeReform, setBeforeReform] = useState(true);
  const [contrib2019, setContrib2019] = useState('324'); // Meses até 13/11/2019 (27 anos)
  const [avgSalary, setAvgSalary] = useState('3500');

  const result = useMemo(
    () =>
      evaluateRetirement2026({
        gender,
        age: numeric(age),
        contributionYears: numeric(contribution),
        contributedBeforeReform: beforeReform,
        contributionMonthsBeforeReform: numeric(contrib2019),
        averageSalary: numeric(avgSalary),
      }),
    [gender, age, contribution, beforeReform, contrib2019, avgSalary]
  );

  const missing = (current: number, target: number, label: string) => (current >= target ? `${label}: atingido` : `${label}: faltam ${decimal.format(target - current)} ano(s)`);

  const report: CalculatorPdfReport = {
    calculator: 'Calculadora aposentadoria INSS',
    mode: 'pro',
    headline: result.anyEligible ? `Aposentadoria possível em 2026 (RMI estimada: ${currency.format(result.estimatedRmi)})` : `Acompanhamento contínuo (Ano projetado: ${result.projectedRetirementYear})`,
    summary: `${decimal.format(result.currentAge)} anos de idade, ${decimal.format(result.contributionYears)} anos de contribuição e ${decimal.format(result.points)} pontos acumulados.`,
    sections: [
      {
        title: 'Dados do segurado e média salarial',
        rows: [
          { label: 'Gênero', value: gender === 'woman' ? 'Mulher' : 'Homem' },
          { label: 'Idade atual', value: `${decimal.format(result.currentAge)} ano(s)` },
          { label: 'Tempo total de contribuição', value: `${decimal.format(result.contributionYears)} ano(s)` },
          { label: 'Já contribuía antes da Reforma (13/11/2019)', value: yesNo(beforeReform) },
          { label: 'Pontuação atual', value: `${decimal.format(result.points)} pontos` },
          { label: 'Média contributiva estimada (80%/100%)', value: currency.format(numeric(avgSalary)) },
          { label: 'Alíquota de benefício calculada (60% + 2%/ano)', value: `${result.benefitRatePercentage}%` },
          { label: 'Renda Mensal Inicial (RMI) Estimada', value: currency.format(result.estimatedRmi) },
        ],
      },
      {
        title: 'Análise detalhada das 5 regras de transição em 2026',
        rows: [
          { label: '1. Regra Geral (Idade)', value: `${result.generalEligible ? 'Atingido' : 'Pendente'} (${missing(result.currentAge, result.generalAge, 'idade')}; ${missing(result.contributionYears, result.generalContribution, 'contribuição')})` },
          ...(beforeReform
            ? [
                { label: '2. Regra dos Pontos (93F / 103H)', value: `${result.pointsEligible ? 'Atingido' : 'Pendente'} (${missing(result.points, result.transitionPoints, 'pontos')}; ${missing(result.contributionYears, result.transitionContribution, 'contribuição')})` },
                { label: '3. Idade Mínima Progressiva (59.5F / 64.5H)', value: `${result.progressiveEligible ? 'Atingido' : 'Pendente'} (${missing(result.currentAge, result.progressiveAge, 'idade')}; ${missing(result.contributionYears, result.transitionContribution, 'contribuição')})` },
                { label: '4. Pedágio de 50%', value: `${result.toll50Eligible ? 'Atingido' : 'Pendente'} (Tempo exigido com pedágio: ${decimal.format(result.toll50RequiredTime)} anos)` },
                { label: '5. Pedágio de 100%', value: `${result.toll100Eligible ? 'Atingido' : 'Pendente'} (Exige ${result.toll100AgeRequired} anos idade e ${decimal.format(result.toll100RequiredTime)} anos contribuição)` },
              ]
            : []),
        ],
      },
    ],
    disclaimer: 'Análise de alta precisão considerando todas as 5 regras de transição da Emenda Constitucional 103/2019 para 2026. Somente contribuições homologadas no CNIS devem ser consideradas.',
  };

  return (
    <Workbench
      title="Simulador de Aposentadoria INSS com Pedágios e RMI"
      description="Avalie as 5 regras de transição vigentes em 2026, projete a Renda Mensal Inicial (RMI) e encontre a regra mais vantajosa."
      result={
        <Result
          eyebrow="Estimativa de Renda Mensal (RMI)"
          headline={currency.format(result.estimatedRmi)}
          summary={`Base de cálculo com taxa de benefício de ${result.benefitRatePercentage}% sobre a média salarial. Ano provável estimado: ${result.projectedRetirementYear}.`}
          icon={<Landmark className="h-5 w-5" />}
          note="Atividade especial, magistério, trabalho rural e direito adquirido exigem simulação documental específica."
          report={report}
          status={status}
          onUnlockRequired={onUnlockRequired}
          action={
            <a
              href="https://meu.inss.gov.br/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#d8bd73]/40 px-4 text-xs font-black text-[#efd991]"
            >
              Conferir extrato CNIS no Meu INSS <ExternalLink className="h-4 w-4" />
            </a>
          }
        >
          <div className="grid gap-3 py-4 sm:grid-cols-2">
            <Requirement
              title="1. Regra geral (Idade)"
              eligible={result.generalEligible}
              lines={[missing(result.currentAge, result.generalAge, 'Idade'), missing(result.contributionYears, result.generalContribution, 'Contribuição')]}
            />
            {beforeReform && (
              <>
                <Requirement
                  title="2. Regra dos Pontos"
                  eligible={result.pointsEligible}
                  lines={[missing(result.points, result.transitionPoints, 'Pontos'), missing(result.contributionYears, result.transitionContribution, 'Contribuição')]}
                />
                <Requirement
                  title="3. Idade Progressiva"
                  eligible={result.progressiveEligible}
                  lines={[missing(result.currentAge, result.progressiveAge, 'Idade'), missing(result.contributionYears, result.transitionContribution, 'Contribuição')]}
                />
                <Requirement
                  title="4. Pedágio 50%"
                  eligible={result.toll50Eligible}
                  lines={[`Exige ${decimal.format(result.toll50RequiredTime)} anos totais`, missing(result.contributionYears, result.toll50RequiredTime, 'Contribuição')]}
                />
                <Requirement
                  title="5. Pedágio 100%"
                  eligible={result.toll100Eligible}
                  lines={[missing(result.currentAge, result.toll100AgeRequired, 'Idade'), missing(result.contributionYears, result.toll100RequiredTime, 'Contribuição')]}
                />
              </>
            )}
          </div>
        </Result>
      }
    >
      <Section number="01" title="Perfil considerado">
        <div className="grid grid-cols-2 rounded-lg bg-[#ece9e2] p-1">
          {(
            [
              ['woman', 'Mulher'],
              ['man', 'Homem'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setGender(value)}
              className={`min-h-11 rounded-md text-sm font-black ${gender === value ? 'bg-white shadow-sm' : 'text-[#69727a]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section number="02" title="Dados de contribuição e média salarial">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Idade atual" value={age} onChange={setAge} suffix="anos" max={100} step={0.5} />
          <Field label="Tempo de contribuição total" value={contribution} onChange={setContribution} suffix="anos" max={60} step={0.5} />
          <Field label="Média salarial contributiva" value={avgSalary} onChange={setAvgSalary} prefix="R$" help="Média estimada de todos os seus salários de contribuição." />
          <Field label="Meses contribuídos até 13/11/2019" value={contrib2019} onChange={setContrib2019} suffix="meses" help="Necessário para avaliar as regras de pedágio." />
        </div>
      </Section>

      <Section number="03" title="Regras de transição">
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-4 text-sm font-bold">
          <input type="checkbox" checked={beforeReform} onChange={(event) => setBeforeReform(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#8a6e2f]" />
          <span>
            Já contribuía antes de 13/11/2019
            <small className="mt-1 block font-medium leading-5 text-[#69727a]">Habilita as regras de transição dos Pontos, Idade Progressiva e Pedágios de 50% e 100%.</small>
          </span>
        </label>
      </Section>
    </Workbench>
  );
}

// ==========================================
// 3. FÉRIAS CLT (PRO AVANÇADA)
// ==========================================

function VacationPro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void }) {
  const [salary, setSalary] = useState('3500');
  const [averages, setAverages] = useState('0');
  const [vacationDays, setVacationDays] = useState('30');
  const [sellDays, setSellDays] = useState(false);
  const [absences, setAbsences] = useState('0');
  const [thirteenthAdvance, setThirteenthAdvance] = useState(false);
  const [isDouble, setIsDouble] = useState(false);
  const [dependents, setDependents] = useState('0');

  const result = useMemo(
    () =>
      calculateVacationEstimate(numeric(salary), numeric(averages), {
        vacationDays: numeric(vacationDays),
        sellDays,
        unexcusedAbsences: numeric(absences),
        thirteenthAdvance,
        isDouble,
        dependents: numeric(dependents),
      }),
    [salary, averages, vacationDays, sellDays, absences, thirteenthAdvance, isDouble, dependents]
  );

  const report: CalculatorPdfReport = {
    calculator: 'Calculadora de férias',
    mode: 'pro',
    headline: `Total líquido a receber: ${currency.format(result.netTotal)} (Bruto: ${currency.format(result.total)})`,
    summary: 'Relatório completo de férias com abono pecuniário (venda de 10 dias), adicionais, tabela Art. 130 CLT e retenções fiscais de 2026.',
    sections: [
      {
        title: 'Parâmetros informados',
        rows: [
          { label: 'Salário bruto mensal', value: currency.format(numeric(salary)) },
          { label: 'Média de adicionais variáveis', value: currency.format(numeric(averages)) },
          { label: 'Dias de férias solicitados', value: `${result.actualVacationDays} dias` },
          { label: 'Venda de férias (Abono pecuniário)', value: sellDays ? 'Sim (10 dias)' : 'Não' },
          { label: 'Faltas injustificadas no ano', value: `${numeric(absences)} falta(s) (Dias de direito: ${result.maxAllowedDays})` },
          { label: 'Adiantamento de 50% do 13º', value: yesNo(thirteenthAdvance) },
          { label: 'Férias em dobro (concessivo vencido)', value: yesNo(isDouble) },
        ],
      },
      {
        title: 'Composição das verbas e isenções',
        rows: [
          { label: `Férias gozadas (${result.actualVacationDays} dias)`, value: currency.format(result.vacationPay) },
          { label: 'Adicional constitucional de 1/3', value: currency.format(result.constitutionalThird) },
          { label: 'Abono pecuniário (10 dias vendidos - Isento)', value: currency.format(result.abonoPay) },
          { label: '1/3 sobre o abono pecuniário (Isento)', value: currency.format(result.abonoThird) },
          { label: 'Adiantamento de 13º salário', value: currency.format(result.thirteenthAdvancePay) },
          { label: 'Total Bruto a Receber', value: currency.format(result.total) },
        ],
      },
      {
        title: 'Retenções Fiscais 2026 (INSS & IRRF)',
        rows: [
          { label: 'INSS sobre férias e 1/3', value: `- ${currency.format(result.inssDeduction)}` },
          { label: 'IRRF sobre férias e 1/3', value: `- ${currency.format(result.irrfDeduction)}` },
          { label: 'Total de Descontos Fiscais', value: `- ${currency.format(result.inssDeduction + result.irrfDeduction)}` },
          { label: 'Total Líquido a Receber', value: currency.format(result.netTotal) },
        ],
      },
    ],
    disclaimer: 'O abono pecuniário (venda de 10 dias) e o seu 1/3 são isentos de INSS e Imposto de Renda. O pagamento das férias deve ocorrer até 2 dias antes do início do gozo.',
  };

  return (
    <Workbench
      title="Cálculo de Férias Completo com Abono e Tributos 2026"
      description="Inclua venda de férias (abono de 10 dias), médias de adicionais, adiantamento do 13º e retenções oficiais de INSS/IRRF."
      result={
        <Result
          eyebrow="Total líquido a receber"
          headline={currency.format(result.netTotal)}
          summary={`Total bruto de ${currency.format(result.total)} menos ${currency.format(result.inssDeduction + result.irrfDeduction)} em tributos. Abono isento: ${currency.format(result.totalAbonoPecuniario)}.`}
          icon={<Palmtree className="h-5 w-5" />}
          note="O pagamento integral das férias e abono deve ser realizado até 2 dias antes do início do período de descanso (Art. 145 CLT)."
          report={report}
          status={status}
          onUnlockRequired={onUnlockRequired}
        >
          <ResultLine label={`Férias gozadas (${result.actualVacationDays} dias)`} value={currency.format(result.vacationPay)} />
          <ResultLine label="Adicional constitucional de 1/3" value={currency.format(result.constitutionalThird)} />
          {result.totalAbonoPecuniario > 0 && <ResultLine label="Abono pecuniário (10 dias + 1/3)" value={currency.format(result.totalAbonoPecuniario)} subtext="Isento de INSS e Imposto de Renda" />}
          {result.thirteenthAdvancePay > 0 && <ResultLine label="Adiantamento de 50% do 13º" value={currency.format(result.thirteenthAdvancePay)} />}
          <ResultLine label="Retenções INSS + IRRF 2026" value={`- ${currency.format(result.inssDeduction + result.irrfDeduction)}`} subtext={`INSS: ${currency.format(result.inssDeduction)} | IRRF: ${currency.format(result.irrfDeduction)}`} />
          <ResultLine label="Total Líquido a Receber" value={currency.format(result.netTotal)} emphasized />
        </Result>
      }
    >
      <Section number="01" title="Remuneração e adicionais">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Salário bruto mensal" value={salary} onChange={setSalary} prefix="R$" />
          <Field label="Média de horas extras/comissões" value={averages} onChange={setAverages} prefix="R$" help="Média habitual de adicionais dos últimos 12 meses." />
        </div>
      </Section>

      <Section number="02" title="Dias de férias e faltas (Art. 130 CLT)">
        <div className="grid gap-5 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm font-black text-[#26313a]">Dias de férias</span>
            <select
              value={vacationDays}
              onChange={(event) => setVacationDays(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-lg border border-[#d5cfc5] bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#91722f]"
            >
              <option value="30">30 dias</option>
              <option value="20">20 dias</option>
              <option value="15">15 dias</option>
              <option value="10">10 dias</option>
            </select>
          </label>
          <Field label="Faltas injustificadas" value={absences} onChange={setAbsences} suffix="faltas" max={50} step={1} help={`Limite permitido: ${result.maxAllowedDays} dias.`} />
          <Field label="Dependentes para IRRF" value={dependents} onChange={setDependents} suffix="dep." max={10} step={1} />
        </div>
      </Section>

      <Section number="03" title="Opções avançadas de férias">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a]">
            <input type="checkbox" checked={sellDays} onChange={(event) => setSellDays(event.target.checked)} className="h-4 w-4 accent-[#8a6e2f]" />
            <span>Vender 10 dias (Abono pecuniário)</span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a]">
            <input type="checkbox" checked={thirteenthAdvance} onChange={(event) => setThirteenthAdvance(event.target.checked)} className="h-4 w-4 accent-[#8a6e2f]" />
            <span>Adiantar 1ª parcela do 13º</span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a]">
            <input type="checkbox" checked={isDouble} onChange={(event) => setIsDouble(event.target.checked)} className="h-4 w-4 accent-[#8a6e2f]" />
            <span>Férias em dobro (concessivo vencido)</span>
          </label>
        </div>
      </Section>

      <button type="button" onClick={() => { setSalary('3500'); setAverages('0'); setVacationDays('30'); setSellDays(false); setAbsences('0'); setThirteenthAdvance(false); setIsDouble(false); setDependents('0'); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#d5cec3] bg-white px-4 text-sm font-black text-[#59646d]">
        <RotateCcw className="h-4 w-4" />Restaurar exemplo
      </button>
    </Workbench>
  );
}


function OvertimePro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void }) {
  const [salary, setSalary] = useState('3500');
  const [monthlyHours, setMonthlyHours] = useState('220');
  const [hours50, setHours50] = useState('15');
  const [hours100, setHours100] = useState('5');
  const [nightHours, setNightHours] = useState('20');
  const [businessDays, setBusinessDays] = useState('25');
  const [sundaysAndHolidays, setSundaysAndHolidays] = useState('5');

  const result = useMemo(() => calculateOvertimeEstimate(numeric(salary), {
    monthlyHours: numeric(monthlyHours),
    overtime50Hours: numeric(hours50),
    overtime100Hours: numeric(hours100),
    nightHours: numeric(nightHours),
    businessDays: numeric(businessDays),
    sundaysAndHolidays: numeric(sundaysAndHolidays),
  }), [salary, monthlyHours, hours50, hours100, nightHours, businessDays, sundaysAndHolidays]);

  const report: CalculatorPdfReport = {
    calculator: 'Calculadora de horas extras e noturno (Modo Pro)',
    mode: 'pro',
    headline: `Total com DSR: ${currency.format(result.totalGrossExtra)}`,
    summary: 'Memória de cálculo completa incluindo adicionais noturnos e reflexo no DSR.',
    sections: [
      { title: 'Dados informados', rows: [{ label: 'Salário base', value: currency.format(numeric(salary)) }, { label: 'Jornada mensal', value: `${numeric(monthlyHours)} horas` }, { label: 'Horas 50%', value: `${numeric(hours50)} h` }, { label: 'Horas 100%', value: `${numeric(hours100)} h` }, { label: 'Horas noturnas', value: `${numeric(nightHours)} h` }, { label: 'Dias úteis', value: `${numeric(businessDays)} d` }, { label: 'Domingos/Feriados', value: `${numeric(sundaysAndHolidays)} d` }] },
      { title: 'Valores apurados', rows: [{ label: 'Valor da hora normal', value: currency.format(result.hourlyRate) }, { label: 'Horas extras 50%', value: currency.format(result.pay50) }, { label: 'Horas extras 100%', value: currency.format(result.pay100) }, { label: 'Adicional noturno', value: currency.format(result.nightAditionalPay) }, { label: 'Subtotal sem DSR', value: currency.format(result.totalExtraWithoutDsr) }, { label: 'Reflexo no DSR', value: currency.format(result.dsrPay) }, { label: 'Total bruto extras', value: currency.format(result.totalGrossExtra) }] },
    ],
    disclaimer: 'Cálculo analítico do modo Pro com adicionais e DSR.',
  };

  return (
    <Workbench title="Cálculo analítico de horas extras & noturno" description="Informe jornada, horas excedentes e calendário do mês para cálculo com DSR." result={
      <Result eyebrow="Horas extras + DSR" headline={currency.format(result.totalGrossExtra)} summary="Total bruto a receber no mês pelas horas suplementares e reflexos no repouso remunerado." icon={<Clock3 className="h-5 w-5" />} note="Considera adicional noturno de 20% com hora noturna reduzida de 52m30s." report={report} status={status} onUnlockRequired={onUnlockRequired}>
        <ResultLine label="Valor hora normal" value={currency.format(result.hourlyRate)} />
        <ResultLine label="Horas a 50%" value={currency.format(result.pay50)} />
        <ResultLine label="Horas a 100%" value={currency.format(result.pay100)} />
        <ResultLine label="Adicional noturno" value={currency.format(result.nightAditionalPay)} subtext={`${result.reducedNightHours}h noturnas computadas`} />
        <ResultLine label="Subtotal extras sem DSR" value={currency.format(result.totalExtraWithoutDsr)} />
        <ResultLine label="Reflexo no DSR" value={currency.format(result.dsrPay)} subtext={`${businessDays}d úteis e ${sundaysAndHolidays}d repouso`} />
        <ResultLine label="Total bruto extras" value={currency.format(result.totalGrossExtra)} emphasized />
      </Result>
    }>
      <Section number="01" title="Jornada e salário" description="Dados base do contrato de trabalho.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Salário base mensal" value={salary} onChange={setSalary} prefix="R$" />
          <Field label="Jornada mensal" value={monthlyHours} onChange={setMonthlyHours} suffix="horas" />
        </div>
      </Section>
      <Section number="02" title="Horas suplementares" description="Horas excedentes trabalhadas no mês.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Horas a 50%" value={hours50} onChange={setHours50} suffix="h" />
          <Field label="Horas a 100%" value={hours100} onChange={setHours100} suffix="h" />
          <Field label="Horas noturnas (22h às 5h)" value={nightHours} onChange={setNightHours} suffix="h" help="Considera hora reduzida de 52m30s" />
        </div>
      </Section>
      <Section number="03" title="Calendário do mês para DSR" description="Quantidade de dias úteis e repousos remunerados.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dias úteis no mês" value={businessDays} onChange={setBusinessDays} suffix="dias" />
          <Field label="Domingos e feriados" value={sundaysAndHolidays} onChange={setSundaysAndHolidays} suffix="dias" />
        </div>
      </Section>
    </Workbench>
  );
}

function NetSalaryPro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void }) {
  const [gross, setGross] = useState('6000');
  const [dependents, setDependents] = useState('1');
  const [benefits, setBenefits] = useState('800');
  const [pjProposed, setPjProposed] = useState('9500');

  const result = useMemo(() => calculateNetSalaryEstimate(numeric(gross), numeric(dependents), { benefitsMonthly: numeric(benefits), pjProposedGross: numeric(pjProposed) }), [gross, dependents, benefits, pjProposed]);

  const report: CalculatorPdfReport = {
    calculator: 'Calculadora de salário líquido e equivalência CLT x PJ (Modo Pro)',
    mode: 'pro',
    headline: `Salário líquido + benefícios: ${currency.format(result.totalCltNetValue)}`,
    summary: 'Comparativo detalhado de retenções fiscais e faturamento PJ equivalente.',
    sections: [
      { title: 'Remuneração CLT', rows: [{ label: 'Salário bruto', value: currency.format(numeric(gross)) }, { label: 'Desconto INSS 2026', value: currency.format(result.inssDeduction) }, { label: 'Desconto IRRF', value: currency.format(result.irrfDeduction) }, { label: 'Salário líquido', value: currency.format(result.netSalary) }, { label: 'Benefícios mensais (VR/VA/Saúde)', value: currency.format(numeric(benefits)) }, { label: 'Total recebido no bolso', value: currency.format(result.totalCltNetValue) }] },
      { title: 'Comparativo PJ', rows: [{ label: 'Faturamento PJ recomendado', value: currency.format(result.recommendedPjMonthlyGross) }, { label: 'Proposta PJ informada', value: currency.format(result.pjProposed) }, { label: 'Imposto PJ estimado (Simples ~6%)', value: currency.format(result.pjProposed * 0.06) }, { label: 'Líquido PJ no bolso', value: currency.format(result.pjNet) }, { label: 'Diferença em relação à CLT', value: `${result.pjDifference >= 0 ? '+' : ''}${currency.format(result.pjDifference)}` }] },
    ],
    disclaimer: 'Demonstrativo avançado de tributação e equivalência CLT vs PJ.',
  };

  return (
    <Workbench title="Salário líquido & Equivalência CLT vs PJ" description="Demonstrativo dos descontos de INSS/IRRF e recomendação de faturamento PJ." result={
      <Result eyebrow="Líquido + Benefícios no bolso" headline={currency.format(result.totalCltNetValue)} summary="Valor líquido recebido no mês somado aos benefícios (VR/VA/Saúde)." icon={<Calculator className="h-5 w-5" />} note="Considera tabelas oficiais de INSS e IRRF de 2026." report={report} status={status} onUnlockRequired={onUnlockRequired}>
        <ResultLine label="Salário bruto CLT" value={currency.format(result.grossSalary)} />
        <ResultLine label="Desconto INSS (2026)" value={currency.format(result.inssDeduction)} subtext={`Alíquota efetiva ${result.inssEffectiveRate}%`} />
        <ResultLine label="Desconto IRRF" value={currency.format(result.irrfDeduction)} />
        <ResultLine label="Salário líquido CLT" value={currency.format(result.netSalary)} />
        <ResultLine label="Benefícios (VR/VA/Saúde)" value={currency.format(result.benefitsMonthly)} />
        <ResultLine label="Faturamento PJ equivalente recomendado" value={currency.format(result.recommendedPjMonthlyGross)} subtext="Para cobrir FGTS, 13º, férias + 1/3 e benefícios" />
        <ResultLine label="Proposta PJ líquida estimada" value={currency.format(result.pjNet)} emphasized subtext={`Diferença de ${result.pjDifference >= 0 ? '+' : ''}${currency.format(result.pjDifference)} vs CLT`} />
      </Result>
    }>
      <Section number="01" title="Contrato CLT e dependentes" description="Informações para cálculo dos descontos e deduções.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Salário bruto mensal" value={gross} onChange={setGross} prefix="R$" />
          <Field label="Número de dependentes" value={dependents} onChange={setDependents} suffix="dep." />
          <Field label="Benefícios mensais (VR/VA/Saúde)" value={benefits} onChange={setBenefits} prefix="R$" />
        </div>
      </Section>
      <Section number="02" title="Simulação de proposta PJ" description="Verifique se a proposta PJ compensa todos os direitos da CLT.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Proposta de faturamento PJ mensal" value={pjProposed} onChange={setPjProposed} prefix="R$" />
          <div className="flex flex-col justify-center rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-4 text-xs font-bold text-[#26313a]">
            <span>PJ Líquido Estimado: {currency.format(result.pjNet)}</span>
            <span className={`mt-1 font-black ${result.pjDifference >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>Diferença vs CLT: {result.pjDifference >= 0 ? '+' : ''}{currency.format(result.pjDifference)}</span>
          </div>
        </div>
      </Section>
    </Workbench>
  );
}

function MeiLimitPro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void }) {
  const [openingMonth, setOpeningMonth] = useState('1');
  const [accumulated, setAccumulated] = useState('50000');
  const [projectedMonthly, setProjectedMonthly] = useState('9000');

  const result = useMemo(() => calculateMeiLimitEstimate(numeric(openingMonth), numeric(accumulated), numeric(projectedMonthly)), [openingMonth, accumulated, projectedMonthly]);

  const report: CalculatorPdfReport = {
    calculator: 'Calculadora de limite e excesso do MEI (Modo Pro)',
    mode: 'pro',
    headline: `Projeção anual: ${currency.format(result.projectedTotal)} (${result.projectedUsedPercentage}%)`,
    summary: 'Diagnóstico avançado de margem de faturamento do MEI e regras de desenquadramento.',
    sections: [
      { title: 'Status atual', rows: [{ label: 'Mês de abertura', value: `Mês ${numeric(openingMonth)}` }, { label: 'Limite proporcional', value: currency.format(result.proportionalLimit) }, { label: 'Faturamento acumulado', value: currency.format(result.accumulated) }, { label: 'Saldo disponível', value: currency.format(result.remainingBalance) }] },
      { title: 'Projeção', rows: [{ label: 'Vendas mensais previstas', value: currency.format(numeric(projectedMonthly)) }, { label: 'Faturamento total projetado', value: currency.format(result.projectedTotal) }, { label: 'Diagnóstico', value: result.excessCategory === 'within_limit' ? 'Dentro do limite' : result.excessCategory === 'up_to_20' ? 'Extrapolação em até 20%' : 'Extrapolação acima de 20%' }] },
    ],
    disclaimer: 'Relatório educativo do modo Pro para acompanhamento do limite MEI.',
  };

  return (
    <Workbench title="Limite e extrapolação do faturamento MEI" description="Controle preventivo do limite proporcional e projeção de faturamento até dezembro." result={
      <Result eyebrow="Projeção anual do MEI" headline={currency.format(result.projectedTotal)} summary={`Faturamento total previsto (${result.projectedUsedPercentage}% do limite proporcional).`} icon={<Landmark className="h-5 w-5" />} note="Limite anual padrão de R$ 81.000,00 proporcional ao mês de abertura." report={report} status={status} onUnlockRequired={onUnlockRequired}>
        <ResultLine label="Meses ativos no ano" value={`${result.monthsActive} meses`} />
        <ResultLine label="Limite proporcional no ano" value={currency.format(result.proportionalLimit)} />
        <ResultLine label="Faturamento acumulado até agora" value={currency.format(result.accumulated)} subtext={`${result.usedPercentage}% já utilizado`} />
        <ResultLine label="Saldo disponível restante" value={currency.format(result.remainingBalance)} />
        <ResultLine label="Previsão de extrapolação" value={result.isOverLimit ? currency.format(result.excessAmount) : 'R$ 0,00'} subtext={result.excessCategory === 'within_limit' ? 'Dentro do limite' : result.excessCategory === 'up_to_20' ? 'Extrapolação até 20%' : 'Extrapolação acima de 20%'} emphasized={result.isOverLimit} />
      </Result>
    }>
      <Section number="01" title="Situação do MEI" description="Meses ativos e faturamento acumulado.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mês de abertura no ano (1 a 12)" value={openingMonth} onChange={setOpeningMonth} suffix="mês" max={12} />
          <Field label="Faturamento acumulado no ano" value={accumulated} onChange={setAccumulated} prefix="R$" />
        </div>
      </Section>
      <Section number="02" title="Projeção para os próximos meses" description="Previsão de vendas mensais até dezembro.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Média de faturamento mensal previsto" value={projectedMonthly} onChange={setProjectedMonthly} prefix="R$" />
          <div className="flex flex-col justify-center rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-4 text-xs font-bold text-[#26313a]">
            <span>Diagnóstico do limite:</span>
            <span className={`mt-1 font-black ${result.excessCategory === 'within_limit' ? 'text-emerald-700' : 'text-amber-700'}`}>
              {result.excessCategory === 'within_limit' ? '✅ Dentro do limite anual' : result.excessCategory === 'up_to_20' ? '⚠️ Estouro até 20% (DAS extra em janeiro)' : '🚨 Estouro > 20% (Desenquadramento retroativo)'}
            </span>
          </div>
        </div>
      </Section>
    </Workbench>
  );
}

function UnemploymentPro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void }) {
  const [requestTimes, setRequestTimes] = useState<1 | 2 | 3>(1);
  const [monthsWorked, setMonthsWorked] = useState('24');
  const [salary1, setSalary1] = useState('3000');
  const [salary2, setSalary2] = useState('3200');
  const [salary3, setSalary3] = useState('3400');

  const average = useMemo(() => (numeric(salary1) + numeric(salary2) + numeric(salary3)) / 3, [salary1, salary2, salary3]);
  const result = useMemo(() => calculateUnemploymentEstimate(requestTimes, numeric(monthsWorked), average), [requestTimes, monthsWorked, average]);

  const report: CalculatorPdfReport = {
    calculator: 'Simulador de seguro-desemprego MTE 2026 (Modo Pro)',
    mode: 'pro',
    headline: result.eligible ? `Direito a ${result.installments} parcelas de ${currency.format(result.installmentValue)}` : 'Não atinge requisitos de carência',
    summary: 'Cálculo analítico do benefício conforme tabela oficial MTE 2026.',
    sections: [
      { title: 'Histórico', rows: [{ label: 'Solicitação', value: `${requestTimes}ª vez` }, { label: 'Tempo trabalhado', value: `${numeric(monthsWorked)} meses` }, { label: 'Salários últimos 3 meses', value: `${currency.format(numeric(salary1))} | ${currency.format(numeric(salary2))} | ${currency.format(numeric(salary3))}` }, { label: 'Média apurada', value: currency.format(average) }] },
      { title: 'Benefício', rows: [{ label: 'Elegibilidade', value: result.eligible ? 'Elegível' : 'Pendente' }, { label: 'Número de parcelas', value: `${result.installments}` }, { label: 'Valor da parcela', value: currency.format(result.installmentValue) }, { label: 'Total a receber', value: currency.format(result.totalBenefit) }] },
    ],
    disclaimer: 'Cálculo detalhado do Seguro-Desemprego conforme regras do MTE.',
  };

  return (
    <Workbench title="Simulação analítica de Seguro-Desemprego" description="Análise exata do valor das parcelas por média salarial individual." result={
      <Result eyebrow="Seguro-Desemprego MTE 2026" headline={result.eligible ? `${result.installments} parcelas` : 'Sem direito'} summary={result.eligible ? `Valor de cada parcela: ${currency.format(result.installmentValue)}.` : 'Tempo de serviço insuficiente para esta solicitação.'} icon={<Clock3 className="h-5 w-5" />} note="Tabela MTE 2026 com teto de R$ 2.313,74." report={report} status={status} onUnlockRequired={onUnlockRequired}>
        <ResultLine label="Solicitação informada" value={`${requestTimes}ª vez`} />
        <ResultLine label="Meses de registro" value={`${numeric(monthsWorked)} meses`} />
        <ResultLine label="Média dos 3 salários" value={currency.format(average)} />
        <ResultLine label="Número de parcelas liberadas" value={`${result.installments} parcelas`} />
        <ResultLine label="Valor bruto de cada parcela" value={currency.format(result.installmentValue)} />
        <ResultLine label="Total acumulado do benefício" value={currency.format(result.totalBenefit)} emphasized />
      </Result>
    }>
      <Section number="01" title="Regras de carência MTE" description="Histórico de solicitações e meses de carteira assinada.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="block"><span className="text-sm font-black text-[#26313a]">Solicitação</span><div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-[#ece9e2] p-1">{([1, 2, 3] as const).map((t) => <button key={t} type="button" onClick={() => setRequestTimes(t)} className={`min-h-11 rounded-md text-xs font-black ${requestTimes === t ? 'bg-white text-[#111820] shadow-sm' : 'text-[#69727a]'}`}>{t}ª Vez</button>)}</div></div>
          <Field label="Meses trabalhados nos últimos 36 meses" value={monthsWorked} onChange={setMonthsWorked} suffix="meses" />
        </div>
      </Section>
      <Section number="02" title="Últimos 3 salários recebidos" description="Informe os salários dos últimos 3 meses antes da demissão.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Salário 1" value={salary1} onChange={setSalary1} prefix="R$" />
          <Field label="Salário 2" value={salary2} onChange={setSalary2} prefix="R$" />
          <Field label="Salário 3" value={salary3} onChange={setSalary3} prefix="R$" />
        </div>
      </Section>
    </Workbench>
  );
}

function FatorRPro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void }) {
  const [rbt12, setRbt12] = useState('240000');
  const [payroll12, setPayroll12] = useState('60000');

  const result = useMemo(() => calculateFatorREstimate(numeric(rbt12), numeric(payroll12)), [rbt12, payroll12]);

  const report: CalculatorPdfReport = {
    calculator: 'Calculadora do Fator R do Simples Nacional (Modo Pro)',
    mode: 'pro',
    headline: `Fator R: ${result.fatorRPercentage}% - Enquadramento: ${result.anexoName}`,
    summary: 'Planejamento e ajuste de pró-labore para enquadramento na menor alíquota tributária.',
    sections: [
      { title: 'Visão Geral', rows: [{ label: 'RBT12', value: currency.format(numeric(rbt12)) }, { label: 'Folha 12 Meses', value: currency.format(numeric(payroll12)) }, { label: 'Percentual Fator R', value: `${result.fatorRPercentage}%` }, { label: 'Anexo Atual', value: result.anexoName }] },
      { title: 'Ajuste Recomendado', rows: [{ label: 'Folha necessária para 28%', value: currency.format(result.requiredPayrollFor28) }, { label: 'Aumento de pró-labore mensal recomendado', value: currency.format(result.recommendedMonthlyProLaboreAdjustment) }] },
    ],
    disclaimer: 'Relatório de planejamento tributário do Fator R.',
  };

  return (
    <Workbench title="Análise tributária do Fator R" description="Planejamento de folha e pró-labore para enquadramento no Anexo III." result={
      <Result eyebrow="Resultado do Fator R" headline={`${result.fatorRPercentage}%`} summary={`Enquadramento atual: ${result.anexoName}`} icon={<BriefcaseBusiness className="h-5 w-5" />} note="Razão mínima de 28% de folha para tributação reduzida no Anexo III." report={report} status={status} onUnlockRequired={onUnlockRequired}>
        <ResultLine label="Receita Bruta 12 meses (RBT12)" value={currency.format(result.rbt12)} />
        <ResultLine label="Folha de Pagamento 12 meses" value={currency.format(result.payroll12)} />
        <ResultLine label="Folha necessária para 28%" value={currency.format(result.requiredPayrollFor28)} />
        <ResultLine label="Ajuste mensal de pró-labore sugerido" value={currency.format(result.recommendedMonthlyProLaboreAdjustment)} emphasized subtext={result.isAnexo3 ? 'Empresa já atinge o Fator R!' : 'Pró-labore mensal adicional necessário'} />
      </Result>
    }>
      <Section number="01" title="Faturamento e folha dos últimos 12 meses" description="Dados dos últimos 12 meses da empresa.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Receita Bruta 12 meses (RBT12)" value={rbt12} onChange={setRbt12} prefix="R$" />
          <Field label="Folha de Pagamento 12 meses" value={payroll12} onChange={setPayroll12} prefix="R$" />
        </div>
      </Section>
    </Workbench>
  );
}

function AmortizationPro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void }) {
  const [balance, setBalance] = useState('300000');
  const [rate, setRate] = useState('9.5');
  const [months, setMonths] = useState('360');
  const [system, setSystem] = useState<'SAC' | 'PRICE'>('SAC');
  const [extraAmortization, setExtraAmortization] = useState('20000');
  const [option, setOption] = useState<'reduce_term' | 'reduce_installment'>('reduce_term');

  const result = useMemo(() => calculateAmortizationEstimate(numeric(balance), numeric(rate), numeric(months), {
    system,
    extraAmortization: numeric(extraAmortization),
    amortizationOption: option,
  }), [balance, rate, months, system, extraAmortization, option]);

  const report: CalculatorPdfReport = {
    calculator: 'Calculadora de amortização de financiamento (Modo Pro)',
    mode: 'pro',
    headline: `Economia estimada em juros: ${currency.format(result.estimatedInterestSaved)}`,
    summary: 'Simulação comparativa de amortização extraordinária antecipada.',
    sections: [
      { title: 'Contrato Original', rows: [{ label: 'Saldo devedor', value: currency.format(numeric(balance)) }, { label: 'Taxa anual', value: `${numeric(rate)}% a.a.` }, { label: 'Prazo', value: `${numeric(months)} meses` }, { label: 'Sistema', value: system }] },
      { title: 'Aporte Extra e Resultado', rows: [{ label: 'Valor amortizado', value: currency.format(numeric(extraAmortization)) }, { label: 'Novo saldo devedor', value: currency.format(result.newBalance) }, { label: 'Nova parcela', value: currency.format(result.newInstallment) }, { label: 'Meses eliminados', value: `${result.monthsSaved} meses` }, { label: 'Juros economizados', value: currency.format(result.estimatedInterestSaved) }] },
    ],
    disclaimer: 'Simulação de amortização extraordinária.',
  };

  return (
    <Workbench title="Simulador de Amortização Extraordinária" description="Calcule os juros economizados e a redução do prazo ou parcela ao amortizar." result={
      <Result eyebrow="Economia estimada de juros" headline={currency.format(result.estimatedInterestSaved)} summary={`Economia aproximada ao aportar ${currency.format(result.extraAmortization)}.`} icon={<Landmark className="h-5 w-5" />} note="Simulação de amortização antecipada de financiamento." report={report} status={status} onUnlockRequired={onUnlockRequired}>
        <ResultLine label="Prestação atual estimada" value={currency.format(result.currentInstallment)} />
        <ResultLine label="Novo saldo devedor" value={currency.format(result.newBalance)} />
        <ResultLine label="Nova prestação estimada" value={currency.format(result.newInstallment)} />
        <ResultLine label="Meses reduzidos no prazo" value={`${result.monthsSaved} meses`} />
        <ResultLine label="Total de juros economizados" value={currency.format(result.estimatedInterestSaved)} emphasized />
      </Result>
    }>
      <Section number="01" title="Financiamento atual" description="Dados do contrato.">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Saldo devedor" value={balance} onChange={setBalance} prefix="R$" />
          <Field label="Taxa de juros (% a.a.)" value={rate} onChange={setRate} suffix="%" />
          <Field label="Prazo restante" value={months} onChange={setMonths} suffix="meses" />
          <div className="block"><span className="text-sm font-black text-[#26313a]">Sistema</span><div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-[#ece9e2] p-1">{(['SAC', 'PRICE'] as const).map((s) => <button key={s} type="button" onClick={() => setSystem(s)} className={`min-h-11 rounded-md text-xs font-black ${system === s ? 'bg-white text-[#111820] shadow-sm' : 'text-[#69727a]'}`}>{s}</button>)}</div></div>
        </div>
      </Section>
      <Section number="02" title="Amortização extraordinária" description="Valor adicional que pretende amortizar.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor do aporte extra" value={extraAmortization} onChange={setExtraAmortization} prefix="R$" />
          <div className="block"><span className="text-sm font-black text-[#26313a]">Objetivo da amortização</span><div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-[#ece9e2] p-1">{([['reduce_term', 'Reduzir Prazo'], ['reduce_installment', 'Reduzir Parcela']] as const).map(([val, label]) => <button key={val} type="button" onClick={() => setOption(val)} className={`min-h-11 rounded-md text-xs font-black ${option === val ? 'bg-white text-[#111820] shadow-sm' : 'text-[#69727a]'}`}>{label}</button>)}</div></div>
        </div>
      </Section>
    </Workbench>
  );
}

function InternshipTerminationPro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void }) {
  const [stipend, setStipend] = useState('1800');
  const [months, setMonths] = useState('6');
  const [expiredDays, setExpiredDays] = useState('0');
  const [workedDays, setWorkedDays] = useState('30');
  const [dailyTransport, setDailyTransport] = useState('12');
  const [transportDays, setTransportDays] = useState('20');
  const [reason, setReason] = useState<'employer_initiative' | 'intern_initiative' | 'contract_expiry'>('contract_expiry');

  const result = useMemo(() => calculateInternshipTerminationEstimate(numeric(stipend), numeric(months), {
    expiredRecessDays: numeric(expiredDays),
    workedDaysInLastMonth: numeric(workedDays),
    dailyTransportRate: numeric(dailyTransport),
    transportDays: numeric(transportDays),
    terminationReason: reason,
  }), [stipend, months, expiredDays, workedDays, dailyTransport, transportDays, reason]);

  const reasonLabels = {
    employer_initiative: 'Rescisão antecipada pela empresa (Sem justa causa)',
    intern_initiative: 'Rescisão antecipada pelo estagiário',
    contract_expiry: 'Término normal do prazo do contrato',
  };

  const report: CalculatorPdfReport = {
    calculator: 'Rescisão de contrato de estágio (Modo Pro)',
    mode: 'pro',
    headline: `Total devido no encerramento: ${currency.format(result.totalTerminationPay)}`,
    summary: 'Demonstrativo completo de verbas de estágio conforme a Lei do Estágio (Lei 11.788/2008).',
    sections: [
      { title: 'Contrato e Motivo', rows: [{ label: 'Bolsa-auxílio', value: currency.format(numeric(stipend)) }, { label: 'Tempo cumprido', value: `${numeric(months)} meses` }, { label: 'Motivo da rescisão', value: reasonLabels[reason] }] },
      { title: 'Bolsa e Transporte Proporcional', rows: [{ label: 'Saldo de bolsa do mês', value: currency.format(result.stipendBalance) }, { label: 'Auxílio-transporte proporcional', value: currency.format(result.transportTotal) }] },
      { title: 'Recesso Remunerado (Férias de Estágio)', rows: [{ label: 'Recesso proporcional', value: currency.format(result.proportionalRecessPay) }, { label: '1/3 proporcional', value: currency.format(result.proportionalRecessThird) }, { label: 'Recesso vencido', value: currency.format(result.expiredRecessPay) }, { label: '1/3 vencido', value: currency.format(result.expiredRecessThird) }, { label: 'Subtotal Recesso', value: currency.format(result.totalRecess) }] },
      { title: 'Total Final', rows: [{ label: 'Total bruto a receber pelo estagiário', value: currency.format(result.totalTerminationPay) }] },
    ],
    disclaimer: 'Estágio é isento de aviso-prévio, FGTS e multa de 40% (Art. 13 da Lei 11.788/2008).',
  };

  return (
    <Workbench title="Rescisão de Contrato de Estágio (Lei 11.788)" description="Apuração completa de saldo de bolsa, auxílio-transporte e recesso indenizado." result={
      <Result eyebrow="Total a receber na rescisão" headline={currency.format(result.totalTerminationPay)} summary={`Soma do recesso (${currency.format(result.totalRecess)}) + Saldo de bolsa (${currency.format(result.stipendBalance)}) + Transporte (${currency.format(result.transportTotal)}).`} icon={<GraduationCap className="h-5 w-5" />} note="Contrato isento de aviso-prévio, FGTS e multa de 40%." report={report} status={status} onUnlockRequired={onUnlockRequired}>
        <ResultLine label="Saldo de bolsa mensal" value={currency.format(result.stipendBalance)} subtext={`${workedDays} dias trabalhados no mês`} />
        <ResultLine label="Auxílio-transporte proporcional" value={currency.format(result.transportTotal)} subtext={`${transportDays} dias a R$ ${dailyTransport}/dia`} />
        <ResultLine label="Recesso proporcional + 1/3" value={currency.format(result.proportionalRecessPay + result.proportionalRecessThird)} subtext={`${result.monthsWorked} meses estagiados`} />
        <ResultLine label="Recesso vencido + 1/3" value={currency.format(result.expiredRecessPay + result.expiredRecessThird)} subtext={`${expiredDays} dias acumulados`} />
        <ResultLine label="Total líquido a receber" value={currency.format(result.totalTerminationPay)} emphasized />
      </Result>
    }>
      <Section number="01" title="Bolsa e período de estágio" description="Valores do contrato e tempo de vigência.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Bolsa-auxílio mensal" value={stipend} onChange={setStipend} prefix="R$" />
          <Field label="Meses de estágio cumpridos" value={months} onChange={setMonths} suffix="meses" max={24} />
          <Field label="Dias trabalhados no mês da saída" value={workedDays} onChange={setWorkedDays} suffix="dias" max={30} />
        </div>
      </Section>
      <Section number="02" title="Recesso acumulado e transporte" description="Dias não gozados e auxílio diário.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Dias de recesso vencido não gozado" value={expiredDays} onChange={setExpiredDays} suffix="dias" />
          <Field label="Valor diário do auxílio-transporte" value={dailyTransport} onChange={setDailyTransport} prefix="R$" />
          <Field label="Dias úteis de transporte devidos" value={transportDays} onChange={setTransportDays} suffix="dias" />
        </div>
      </Section>
      <Section number="03" title="Motivo do encerramento" description="Causa da rescisão do termo de compromisso.">
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-[#ece9e2] p-1">
          <button type="button" onClick={() => setReason('contract_expiry')} className={`min-h-11 rounded-md px-2 py-2 text-xs font-black ${reason === 'contract_expiry' ? 'bg-white text-[#111820] shadow-sm' : 'text-[#69727a]'}`}>Fim do Contrato</button>
          <button type="button" onClick={() => setReason('employer_initiative')} className={`min-h-11 rounded-md px-2 py-2 text-xs font-black ${reason === 'employer_initiative' ? 'bg-white text-[#111820] shadow-sm' : 'text-[#69727a]'}`}>Iniciativa Empresa</button>
          <button type="button" onClick={() => setReason('intern_initiative')} className={`min-h-11 rounded-md px-2 py-2 text-xs font-black ${reason === 'intern_initiative' ? 'bg-white text-[#111820] shadow-sm' : 'text-[#69727a]'}`}>Iniciativa Estagiário</button>
        </div>
      </Section>
    </Workbench>
  );
}

function ProlaboreVsLucrosPro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void }) {
  const [withdrawal, setWithdrawal] = useState('15000');
  const [regime, setRegime] = useState<'simples_anexo3' | 'simples_anexo5' | 'lucro_presumido'>('simples_anexo3');
  const [otherInss, setOtherInss] = useState('0');

  const result = useMemo(() => calculateProlaboreVsLucrosEstimate(numeric(withdrawal), regime, numeric(otherInss)), [withdrawal, regime, otherInss]);

  const regimeLabels = {
    simples_anexo3: 'Simples Nacional (Anexo III - Sem CPP 20%)',
    simples_anexo5: 'Simples Nacional (Anexo V - Com CPP 20%)',
    lucro_presumido: 'Lucro Presumido (Com CPP 20% patronal)',
  };

  const report: CalculatorPdfReport = {
    calculator: 'Pró-labore vs Distribuição de lucros (Modo Pro)',
    mode: 'pro',
    headline: `Economia anual estimada: ${currency.format(result.annualSavings)}`,
    summary: 'Matriz comparativa de eficiência tributária e projeção multianual de rendimentos.',
    sections: [
      { title: 'Parâmetros da Empresa', rows: [{ label: 'Retirada total mensal', value: currency.format(numeric(withdrawal)) }, { label: 'Regime tributário', value: regimeLabels[regime] }, { label: 'INSS já pago em outra fonte', value: currency.format(numeric(otherInss)) }] },
      { title: 'Cenário 1 (100% Pró-labore)', rows: [{ label: 'Impostos mensais retidos', value: currency.format(result.taxA) }, { label: 'Líquido no bolso', value: currency.format(result.netA) }] },
      { title: 'Cenário 2 Otimizado (Pró-labore 1SM + Lucros Isentos)', rows: [{ label: 'Pró-labore (1 Salário Mínimo)', value: currency.format(result.prolaboreB) }, { label: 'Distribuição de Lucros', value: currency.format(result.lucrosB) }, { label: 'Impostos mensais retidos', value: currency.format(result.taxB) }, { label: 'Líquido no bolso', value: currency.format(result.netB) }] },
      { title: 'Projeção de Economia', rows: [{ label: 'Economia mensal de tributos', value: currency.format(result.monthlySavings) }, { label: 'Economia em 1 ano', value: currency.format(result.annualSavings) }, { label: 'Economia em 3 anos', value: currency.format(result.savings3Years) }, { label: 'Economia em 5 anos', value: currency.format(result.savings5Years) }, { label: 'Economia em 1 ano investida (100% CDI)', value: currency.format(result.cdiInvestmentYield1Year) }] },
    ],
    disclaimer: 'Lucros distribuídos com base em escrituração contábil são isentos de IRRF/INSS.',
  };

  return (
    <Workbench title="Planejamento de Retiradas: Pró-labore vs Lucros" description="Otimização tributária com projeção multianual e rendimento no CDI." result={
      <Result eyebrow="Economia de impostos mensal" headline={currency.format(result.monthlySavings)} summary={`Ao adotar Pró-Labore de R$ 1.621,00 + R$ ${result.lucrosB} em lucros, você economiza ${currency.format(result.annualSavings)}/ano.`} icon={<Coins className="h-5 w-5" />} note="Distribuição de lucros é 100% isenta de Imposto de Renda e INSS." report={report} status={status} onUnlockRequired={onUnlockRequired}>
        <ResultLine label="Impostos no Pró-Labore Integral (Cenário 1)" value={currency.format(result.taxA)} subtext="INSS 11% + IRRF + CPP patronal" />
        <ResultLine label="Impostos na Estrutura Otimizada (Cenário 2)" value={currency.format(result.taxB)} subtext="Apenas INSS sobre 1 Salário Mínimo" />
        <ResultLine label="Líquido real mensal recebido" value={currency.format(result.netB)} />
        <ResultLine label="Economia em 1 ano" value={currency.format(result.annualSavings)} />
        <ResultLine label="Economia acumulada em 3 anos" value={currency.format(result.savings3Years)} />
        <ResultLine label="Economia acumulada em 5 anos" value={currency.format(result.savings5Years)} emphasized />
        <ResultLine label="Projeção investida em 1 ano (100% CDI)" value={currency.format(result.cdiInvestmentYield1Year)} subtext="Rendimento estimado com CDI a 10.75% a.a." />
      </Result>
    }>
      <Section number="01" title="Retirada mensal do sócio" description="Valor total a retirar da empresa.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Retirada mensal total desejada" value={withdrawal} onChange={setWithdrawal} prefix="R$" />
          <Field label="INSS já recolhido em outra fonte (teto)" value={otherInss} onChange={setOtherInss} prefix="R$" />
        </div>
      </Section>
      <Section number="02" title="Regime tributário da empresa" description="Inclusão de encargo patronal (CPP 20%).">
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-[#ece9e2] p-1">
          <button type="button" onClick={() => setRegime('simples_anexo3')} className={`min-h-11 rounded-md px-2 py-2 text-xs font-black ${regime === 'simples_anexo3' ? 'bg-white text-[#111820] shadow-sm' : 'text-[#69727a]'}`}>Simples Anexo III</button>
          <button type="button" onClick={() => setRegime('simples_anexo5')} className={`min-h-11 rounded-md px-2 py-2 text-xs font-black ${regime === 'simples_anexo5' ? 'bg-white text-[#111820] shadow-sm' : 'text-[#69727a]'}`}>Simples Anexo V</button>
          <button type="button" onClick={() => setRegime('lucro_presumido')} className={`min-h-11 rounded-md px-2 py-2 text-xs font-black ${regime === 'lucro_presumido' ? 'bg-white text-[#111820] shadow-sm' : 'text-[#69727a]'}`}>Lucro Presumido</button>
        </div>
      </Section>
    </Workbench>
  );
}

function EmployeeCostPro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void }) {
  const [salary, setSalary] = useState('4000');
  const [benefits, setBenefits] = useState('800');
  const [onboarding, setOnboarding] = useState('200');
  const [isSimples, setIsSimples] = useState(true);
  const [ratRate, setRatRate] = useState('2');
  const [fapRate, setFapRate] = useState('1.0');

  const result = useMemo(() => calculateEmployeeCostEstimate(numeric(salary), numeric(benefits), isSimples, numeric(ratRate)/100, numeric(fapRate), numeric(onboarding)), [salary, benefits, isSimples, ratRate, fapRate, onboarding]);

  const report: CalculatorPdfReport = {
    calculator: 'Custo total do funcionário para a empresa (Modo Pro)',
    mode: 'pro',
    headline: `Custo mensal total: ${currency.format(result.totalMonthlyCost)} (+${result.costPercentageOverSalary}%)`,
    summary: 'Demonstrativo analítico de encargos patronais, RAT/FAP, provisões e onboarding.',
    sections: [
      { title: 'Remuneração e Benefícios', rows: [{ label: 'Salário bruto', value: currency.format(numeric(salary)) }, { label: 'Benefícios mensais', value: currency.format(numeric(benefits)) }, { label: 'Custos de onboarding/equipamentos', value: currency.format(numeric(onboarding)) }] },
      { title: 'Provisões Mensais de Encerramento', rows: [{ label: 'FGTS mensal (8%)', value: currency.format(result.fgtsMonthly) }, { label: 'Provisão 13º salário + FGTS', value: currency.format(result.provision13th) }, { label: 'Provisão Férias + 1/3 + FGTS', value: currency.format(result.provisionVacation) }, { label: 'Provisão Rescisão (Multa 40% + Aviso)', value: currency.format(result.terminationProvisionMonthly) }] },
      { title: 'Encargos Patronais', rows: [{ label: 'Encargos Patronais (INSS/RAT*FAP/Sistema S)', value: currency.format(result.employerTaxes) }] },
      { title: 'Custo Total Final', rows: [{ label: 'Custo mensal total da empresa', value: currency.format(result.totalMonthlyCost) }, { label: 'Adicional percentual sobre o salário', value: `+${result.costPercentageOverSalary}%` }] },
    ],
    disclaimer: 'Cálculo analítico do impacto financeiro de contratação CLT.',
  };

  return (
    <Workbench title="Custo Real do Funcionário para a Empresa" description="Apuração completa de encargos patronais, FAP/RAT, provisões e onboarding." result={
      <Result eyebrow="Custo total mensal da empresa" headline={currency.format(result.totalMonthlyCost)} summary={`Um funcionário de R$ ${salary} custa R$ ${result.totalMonthlyCost} por mês para a empresa.`} icon={<Users className="h-5 w-5" />} note={isSimples ? 'Simples Nacional (Sem INSS patronal na folha).' : 'Lucro Presumido/Real (INSS Patronal + RAT*FAP + Sistema S).'} report={report} status={status} onUnlockRequired={onUnlockRequired}>
        <ResultLine label="Salário bruto mensal" value={currency.format(result.salary)} />
        <ResultLine label="Benefícios (VR/VA/VT/Saúde)" value={currency.format(result.benefits)} />
        <ResultLine label="Custos indiretos de Onboarding/EPI" value={currency.format(result.onboardingMonthly)} />
        <ResultLine label="FGTS mensal (8%)" value={currency.format(result.fgtsMonthly)} />
        <ResultLine label="Provisão mensal 13º salário" value={currency.format(result.provision13th)} />
        <ResultLine label="Provisão mensal Férias + 1/3" value={currency.format(result.provisionVacation)} />
        <ResultLine label="Provisão rescisória (FGTS 40% + Aviso)" value={currency.format(result.terminationProvisionMonthly)} />
        <ResultLine label="Encargos Patronais (INSS/RAT/Sistema S)" value={currency.format(result.employerTaxes)} subtext={isSimples ? 'Isento no Simples' : `RAT ${ratRate}% x FAP ${fapRate}`} />
        <ResultLine label="Custo mensal total final" value={currency.format(result.totalMonthlyCost)} emphasized subtext={`+${result.costPercentageOverSalary}% sobre o salário base`} />
      </Result>
    }>
      <Section number="01" title="Contrato, benefícios e onboarding" description="Remuneração e auxílios concedidos.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Salário bruto do funcionário" value={salary} onChange={setSalary} prefix="R$" />
          <Field label="Benefícios mensais (VR/VA/VT/Saúde)" value={benefits} onChange={setBenefits} prefix="R$" />
          <Field label="Custo mensal indireto (EPI/Treino)" value={onboarding} onChange={setOnboarding} prefix="R$" />
        </div>
      </Section>
      <Section number="02" title="Regime tributário e RAT/FAP" description="Alíquota de encargos patronais.">
        <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-[#ece9e2] p-1">
          <button type="button" onClick={() => setIsSimples(true)} className={`min-h-11 rounded-md px-4 py-2.5 text-xs font-black ${isSimples ? 'bg-white text-[#111820] shadow-sm' : 'text-[#69727a]'}`}>Simples Nacional</button>
          <button type="button" onClick={() => setIsSimples(false)} className={`min-h-11 rounded-md px-4 py-2.5 text-xs font-black ${!isSimples ? 'bg-white text-[#111820] shadow-sm' : 'text-[#69727a]'}`}>Lucro Presumido / Real</button>
        </div>
        {!isSimples && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Alíquota RAT da empresa (%)" value={ratRate} onChange={setRatRate} suffix="%" />
            <Field label="Fator FAP da empresa (0.5 a 2.0)" value={fapRate} onChange={setFapRate} />
          </div>
        )}
      </Section>
    </Workbench>
  );
}

function NightShiftRuralUrbanPro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void }) {
  const [salary, setSalary] = useState('3500');
  const [shiftType, setShiftType] = useState<'urban' | 'rural_cattle' | 'rural_farming'>('urban');
  const [hours, setHours] = useState('40');
  const [overtimeRate, setOvertimeRate] = useState('0');
  const [workingDays, setWorkingDays] = useState('25');
  const [sundays, setSundays] = useState('4');

  const result = useMemo(() => calculateNightShiftRuralUrbanEstimate(numeric(salary), shiftType, numeric(hours), numeric(overtimeRate), numeric(workingDays), numeric(sundays)), [salary, shiftType, hours, overtimeRate, workingDays, sundays]);

  const report: CalculatorPdfReport = {
    calculator: 'Adicional noturno urbano vs rural (Modo Pro)',
    mode: 'pro',
    headline: `Adicional noturno + DSR: ${currency.format(result.totalWithDsr)}`,
    summary: 'Demonstrativo de adicional noturno, hora extra noturna e reflexo no DSR mensal.',
    sections: [
      { title: 'Jornada Informada', rows: [{ label: 'Salário base', value: currency.format(numeric(salary)) }, { label: 'Regime/Horário', value: result.periodName }, { label: 'Horas noturnas prestadas', value: `${numeric(hours)} horas` }, { label: 'Horas computadas', value: `${result.computedHours} horas` }] },
      { title: 'Adicionais Apurados', rows: [{ label: 'Adicional noturno bruto', value: currency.format(result.nightAditionalPay) }, { label: 'Reflexo no DSR mensal', value: currency.format(result.dsrReflex) }, { label: 'Total devido', value: currency.format(result.totalWithDsr) }] },
    ],
    disclaimer: 'Conforme Art. 73 da CLT (Urbano) e Lei 5.889/1973 (Rural).',
  };

  return (
    <Workbench title="Adicional Noturno Urbano vs Rural" description="Análise de alíquotas (20% vs 25%), hora extra noturna e reflexo no DSR." result={
      <Result eyebrow="Total noturno + DSR" headline={currency.format(result.totalWithDsr)} summary={`Adicional noturno de R$ ${result.nightAditionalPay} + Reflexo no DSR de R$ ${result.dsrReflex}.`} icon={<SunMedium className="h-5 w-5" />} note={`Regra aplicável: ${result.periodName}`} report={report} status={status} onUnlockRequired={onUnlockRequired}>
        <ResultLine label="Valor da hora normal" value={currency.format(result.hourlyRate)} />
        <ResultLine label="Horas noturnas computadas" value={`${result.computedHours} horas`} subtext={shiftType === 'urban' ? 'Hora reduzida (52m30s)' : 'Hora normal (60m)'} />
        <ResultLine label="Percentual de adicional" value={`${result.ratePercentage}%`} />
        <ResultLine label="Adicional noturno de horas extras" value={currency.format(result.nightAditionalPay)} subtext={numeric(overtimeRate) > 0 ? `Com hora extra de ${overtimeRate}%` : 'Sem hora extra'} />
        <ResultLine label="Reflexo no DSR mensal" value={currency.format(result.dsrReflex)} subtext={`${sundays} descansos para ${workingDays} dias úteis`} />
        <ResultLine label="Total noturno a receber no mês" value={currency.format(result.totalWithDsr)} emphasized />
      </Result>
    }>
      <Section number="01" title="Salário, horas e horas extras" description="Base de cálculo e jornada.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Salário base mensal" value={salary} onChange={setSalary} prefix="R$" />
          <Field label="Horas noturnas trabalhadas" value={hours} onChange={setHours} suffix="horas" />
          <Field label="Adicional de hora extra (%)" value={overtimeRate} onChange={setOvertimeRate} suffix="%" />
        </div>
      </Section>
      <Section number="02" title="Parâmetros do DSR no mês" description="Dias úteis e descansos da folha.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dias úteis no mês" value={workingDays} onChange={setWorkingDays} suffix="dias" />
          <Field label="Domingos e feriados" value={sundays} onChange={setSundays} suffix="dias" />
        </div>
      </Section>
      <Section number="03" title="Tipo de atividade / horário" description="Definição da regra urbana ou rural.">
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-[#ece9e2] p-1">
          <button type="button" onClick={() => setShiftType('urban')} className={`min-h-11 rounded-md px-2 py-2 text-xs font-black ${shiftType === 'urban' ? 'bg-white text-[#111820] shadow-sm' : 'text-[#69727a]'}`}>Urbano (22h-5h)</button>
          <button type="button" onClick={() => setShiftType('rural_cattle')} className={`min-h-11 rounded-md px-2 py-2 text-xs font-black ${shiftType === 'rural_cattle' ? 'bg-white text-[#111820] shadow-sm' : 'text-[#69727a]'}`}>Pecuária (20h-4h)</button>
          <button type="button" onClick={() => setShiftType('rural_farming')} className={`min-h-11 rounded-md px-2 py-2 text-xs font-black ${shiftType === 'rural_farming' ? 'bg-white text-[#111820] shadow-sm' : 'text-[#69727a]'}`}>Lavoura (21h-5h)</button>
        </div>
      </Section>
    </Workbench>
  );
}

function ProportionalSalaryPro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void }) {
  const [salary, setSalary] = useState('3500');
  const [additional, setAdditional] = useState('500');
  const [days, setDays] = useState('18');
  const [daysInMonth, setDaysInMonth] = useState('31');
  const [absences, setAbsences] = useState('1');

  const result = useMemo(() => calculateProportionalSalaryEstimate(numeric(salary), numeric(days), numeric(daysInMonth), numeric(absences), numeric(additional)), [salary, additional, days, daysInMonth, absences]);

  const report: CalculatorPdfReport = {
    calculator: 'Calculadora de salário proporcional (Modo Pro)',
    mode: 'pro',
    headline: `Salário proporcional: ${currency.format(result.proportional30)}`,
    summary: 'Demonstrativo analítico de salário proporcional, adicionais e descontos por faltas/DSR.',
    sections: [
      { title: 'Dados do Mês', rows: [{ label: 'Salário base', value: currency.format(numeric(salary)) }, { label: 'Adicionais (Insalubridade/Periculosidade)', value: currency.format(numeric(additional)) }, { label: 'Base salarial total', value: currency.format(result.totalBaseSalary) }, { label: 'Dias trabalhados', value: `${numeric(days)} dias` }, { label: 'Dias no mês', value: `${numeric(daysInMonth)} dias` }] },
      { title: 'Descontos de Faltas', rows: [{ label: 'Faltas não justificadas', value: `${result.absences} dia(s)` }, { label: 'Desconto por faltas', value: currency.format(result.absenceDiscountValue) }, { label: 'Perda de DSR decorrente', value: `${result.dsrLossCount} dia(s)` }, { label: 'Desconto por perda de DSR', value: currency.format(result.dsrLossValue) }] },
      { title: 'Comparativo de Regras', rows: [{ label: 'Regra CLT 30 dias', value: currency.format(result.proportional30) }, { label: 'Regra Dias Reais do Mês', value: currency.format(result.proportionalActual) }] },
    ],
    disclaimer: 'A jurisprudência trabalhista adota majoritariamente a regra de divisão por 30 dias.',
  };

  return (
    <Workbench title="Salário Proporcional (Faltas, DSR e Adicionais)" description="Apuração exata com desconto de faltas e adicionais habituais." result={
      <Result eyebrow="Salário proporcional CLT" headline={currency.format(result.proportional30)} summary={`Proporcional para ${numeric(days)} dias trabalhados com dedução de ${absences} falta(s) e perda de DSR.`} icon={<CalendarDays className="h-5 w-5" />} note="Exibe também a comparação pela regra de dias reais do mês." report={report} status={status} onUnlockRequired={onUnlockRequired}>
        <ResultLine label="Base salarial total (Salário + Adicionais)" value={currency.format(result.totalBaseSalary)} />
        <ResultLine label="Valor diário (Regra 30 dias)" value={currency.format(result.dailyRate30)} />
        <ResultLine label="Desconto de faltas injustificadas" value={`-${currency.format(result.absenceDiscountValue)}`} subtext={`${absences} dia(s) de falta`} />
        <ResultLine label="Desconto de DSR por faltas" value={`-${currency.format(result.dsrLossValue)}`} subtext={`${result.dsrLossCount} DSR perdido(s)`} />
        <ResultLine label="Salário proporcional líquido (Regra 30d)" value={currency.format(result.proportional30)} emphasized />
        <ResultLine label="Salário proporcional (Regra Dias Reais)" value={currency.format(result.proportionalActual)} subtext={`Divisão por ${daysInMonth} dias`} />
      </Result>
    }>
      <Section number="01" title="Salário e adicionais" description="Remuneração mensal de referência.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Salário base contratual" value={salary} onChange={setSalary} prefix="R$" />
          <Field label="Adicionais fixos (Insalubridade/Periculosidade)" value={additional} onChange={setAdditional} prefix="R$" />
        </div>
      </Section>
      <Section number="02" title="Período e faltas no mês" description="Dias trabalhados e ocorrências da folha.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Dias trabalhados no mês" value={days} onChange={setDays} suffix="dias" max={31} />
          <Field label="Total de dias no mês calendário" value={daysInMonth} onChange={setDaysInMonth} suffix="dias" max={31} />
          <Field label="Faltas não justificadas" value={absences} onChange={setAbsences} suffix="faltas" />
        </div>
      </Section>
    </Workbench>
  );
}

function LateFeePro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void }) {
  const [amount, setAmount] = useState('2500');
  const [days, setDays] = useState('45');
  const [fine, setFine] = useState('2');
  const [interest, setInterest] = useState('1');
  const [legalFees, setLegalFees] = useState('10');

  const result = useMemo(() => calculateLateFeeEstimate(numeric(amount), numeric(days), numeric(fine), numeric(interest), numeric(legalFees)), [amount, days, fine, interest, legalFees]);

  const report: CalculatorPdfReport = {
    calculator: 'Juros e multa por atraso (Modo Pro)',
    mode: 'pro',
    headline: `Total atualizado: ${currency.format(result.totalUpdated)}`,
    summary: 'Demonstrativo analítico de encargos moratórios, honorários e projeção de evolução da dívida.',
    sections: [
      { title: 'Débito Original', rows: [{ label: 'Valor do débito', value: currency.format(numeric(amount)) }, { label: 'Tempo de atraso', value: `${numeric(days)} dias` }] },
      { title: 'Encargos e Honorários', rows: [{ label: `Multa (${numeric(fine)}%)`, value: currency.format(result.fineAmount) }, { label: `Juros de mora (${numeric(interest)}% a.m.)`, value: currency.format(result.interestAmount) }, { label: `Honorários de cobrança (${numeric(legalFees)}%)`, value: currency.format(result.legalFeesAmount) }, { label: 'Total final atualizado', value: currency.format(result.totalUpdated) }] },
      { title: 'Projeção de Evolução da Dívida', rows: [{ label: 'Projeção em 30 dias', value: currency.format(result.proj30) }, { label: 'Projeção em 90 dias', value: currency.format(result.proj90) }, { label: 'Projeção em 180 dias', value: currency.format(result.proj180) }, { label: 'Projeção em 360 dias', value: currency.format(result.proj360) }] },
    ],
    disclaimer: 'Cálculo analítico do modo Pro para atualização de débitos e demonstrativo de cobrança.',
  };

  return (
    <Workbench title="Atualização de Débitos e Encargos por Atraso" description="Cálculo de multa, juros de mora diários, honorários e evolução temporal." result={
      <Result eyebrow="Total atualizado do débito" headline={currency.format(result.totalUpdated)} summary={`Débito acrescido de R$ ${result.fineAmount} de multa, R$ ${result.interestAmount} de juros e R$ ${result.legalFeesAmount} de honorários.`} icon={<Percent className="h-5 w-5" />} note="Exibe a projeção do saldo devedor para períodos futuros." report={report} status={status} onUnlockRequired={onUnlockRequired}>
        <ResultLine label="Valor original do débito" value={currency.format(result.amount)} />
        <ResultLine label="Multa por atraso" value={currency.format(result.fineAmount)} subtext={`${fine}% sobre o débito`} />
        <ResultLine label="Juros de mora diários acumulados" value={currency.format(result.interestAmount)} subtext={`${interest}% a.m. (${days} dias)`} />
        <ResultLine label="Honorários de cobrança/advocaticiais" value={currency.format(result.legalFeesAmount)} subtext={`${legalFees}% sobre o subtotal`} />
        <ResultLine label="Valor total final atualizado" value={currency.format(result.totalUpdated)} emphasized />
        <ResultLine label="Projeção em 90 dias de atraso" value={currency.format(result.proj90)} />
        <ResultLine label="Projeção em 360 dias de atraso" value={currency.format(result.proj360)} subtext="Evolução sem pagamento" />
      </Result>
    }>
      <Section number="01" title="Valor e tempo de atraso" description="Dados da conta ou título.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor original da conta" value={amount} onChange={setAmount} prefix="R$" />
          <Field label="Dias em atraso" value={days} onChange={setDays} suffix="dias" />
        </div>
      </Section>
      <Section number="02" title="Taxas moratórias e honorários" description="Encargos contratados ou legais.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Multa por atraso (%)" value={fine} onChange={setFine} suffix="%" />
          <Field label="Juros de mora ao mês (%)" value={interest} onChange={setInterest} suffix="%" />
          <Field label="Honorários de cobrança (%)" value={legalFees} onChange={setLegalFees} suffix="%" />
        </div>
      </Section>
    </Workbench>
  );
}

function ChildSupportPro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void }) {
  const [gross, setGross] = useState('6000');
  const [motherGross, setMotherGross] = useState('4000');
  const [dependents, setDependents] = useState('1');
  const [percentage, setPercentage] = useState('25');
  const [extraExpenses, setExtraExpenses] = useState('300');

  const result = useMemo(() => calculateChildSupportEstimate(numeric(gross), numeric(dependents), numeric(percentage), numeric(extraExpenses), numeric(motherGross)), [gross, dependents, percentage, extraExpenses, motherGross]);

  const report: CalculatorPdfReport = {
    calculator: 'Simulador de pensão alimentícia (Modo Pro)',
    mode: 'pro',
    headline: `Pensão mensal total: ${currency.format(result.pensionValue)}`,
    summary: 'Demonstrativo analítico da pensão alimentícia, incidência em 13º/férias e partilha de sustento.',
    sections: [
      { title: 'Remuneração dos Genitores', rows: [{ label: 'Salário bruto do alimentante (Pai/Mãe 1)', value: currency.format(numeric(gross)) }, { label: 'Salário bruto do outro genitor (Mãe/Pai 2)', value: currency.format(numeric(motherGross)) }, { label: 'Partilha de renda relativa', value: `${result.fatherSharePercentage}% vs ${result.motherSharePercentage}%` }] },
      { title: 'Base Líquida de Impostos', rows: [{ label: 'Desconto INSS 2026', value: currency.format(result.inssDeduction) }, { label: 'Desconto IRRF', value: currency.format(result.irrfDeduction) }, { label: 'Renda líquida base', value: currency.format(result.netBase) }] },
      { title: 'Fixação da Pensão e Projeção Anual', rows: [{ label: 'Porcentagem aplicada', value: `${result.pensionPercentage}%` }, { label: 'Despesas extraordinárias (Escola/Saúde)', value: currency.format(numeric(extraExpenses)) }, { label: 'Pensão mensal devida', value: currency.format(result.pensionValue) }, { label: 'Recebimento total anual (com 13º e Férias)', value: currency.format(result.annualTotalPension) }] },
    ],
    disclaimer: 'Relatório educativo para instrução de acordos judiciais ou extrajudiciais de alimentos.',
  };

  return (
    <Workbench title="Simulação Analítica de Pensão Alimentícia" description="Apuração com dedução fiscal, partilha por renda dos pais e incidência no 13º/férias." result={
      <Result eyebrow="Pensão mensal total" headline={currency.format(result.pensionValue)} summary={`Corresponde a ${result.pensionPercentage}% da base líquida de R$ ${result.netBase} + R$ ${extraExpenses} extras.`} icon={<Heart className="h-5 w-5" />} note="Calcula o montante anual recebido pelo filho considerando 13º e adicional de férias." report={report} status={status} onUnlockRequired={onUnlockRequired}>
        <ResultLine label="Salário bruto do alimentante" value={currency.format(result.grossSalary)} />
        <ResultLine label="Retenções fiscais oficiais (INSS+IRRF)" value={`-${currency.format(result.inssDeduction + result.irrfDeduction)}`} />
        <ResultLine label="Renda líquida base para a pensão" value={currency.format(result.netBase)} />
        <ResultLine label="Pensão mensal (Porcentagem + Extras)" value={currency.format(result.pensionValue)} emphasized subtext={`Compromete ${result.percentageOfGross}% da renda bruta`} />
        <ResultLine label="Total de pensão recebida em 1 ano" value={currency.format(result.annualTotalPension)} subtext="Inclui reflexos no 13º Salário e 1/3 de Férias" />
        <ResultLine label="Partilha de renda dos genitores" value={`${result.fatherSharePercentage}% alimentante / ${result.motherSharePercentage}% guardião`} subtext="Proporção de renda entre ambos os pais" />
      </Result>
    }>
      <Section number="01" title="Renda dos genitores e dependentes" description="Apuração da proporção salarial dos pais.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Salário bruto do alimentante" value={gross} onChange={setGross} prefix="R$" />
          <Field label="Salário bruto do outro genitor" value={motherGross} onChange={setMotherGross} prefix="R$" />
          <Field label="Dependentes para IRRF" value={dependents} onChange={setDependents} suffix="dep." />
        </div>
      </Section>
      <Section number="02" title="Porcentagem e despesas extraordinárias" description="Parâmetros fixados para a pensão.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Porcentagem fixada de pensão (%)" value={percentage} onChange={setPercentage} suffix="%" max={50} />
          <Field label="Despesas extras mensais (Escola/Saúde)" value={extraExpenses} onChange={setExtraExpenses} prefix="R$" />
        </div>
      </Section>
    </Workbench>
  );
}

export function FreeToolsAdvancedCalculator({
  tool,
  status,
  onUnlockRequired,
  onPdfGenerated,
}: {
  tool: ProToolId;
  status?: ProAccessStatus | null;
  onUnlockRequired?: () => void;
  onPdfGenerated?: () => void;
}) {
  if (tool === 'termination') return <TerminationPro status={status} onUnlockRequired={onUnlockRequired} onPdfGenerated={onPdfGenerated} />;
  if (tool === 'retirement') return <RetirementPro status={status} onUnlockRequired={onUnlockRequired} />;
  if (tool === 'vacation') return <VacationPro status={status} onUnlockRequired={onUnlockRequired} />;
  if (tool === 'thirteenth') return <ThirteenthPro status={status} onUnlockRequired={onUnlockRequired} />;
  if (tool === 'overtime') return <OvertimePro status={status} onUnlockRequired={onUnlockRequired} />;
  if (tool === 'net_salary') return <NetSalaryPro status={status} onUnlockRequired={onUnlockRequired} />;
  if (tool === 'mei_limit') return <MeiLimitPro status={status} onUnlockRequired={onUnlockRequired} />;
  if (tool === 'unemployment') return <UnemploymentPro status={status} onUnlockRequired={onUnlockRequired} />;
  if (tool === 'fator_r') return <FatorRPro status={status} onUnlockRequired={onUnlockRequired} />;
  if (tool === 'amortization') return <AmortizationPro status={status} onUnlockRequired={onUnlockRequired} />;
  if (tool === 'internship_termination') return <InternshipTerminationPro status={status} onUnlockRequired={onUnlockRequired} />;
  if (tool === 'prolabore_vs_lucros') return <ProlaboreVsLucrosPro status={status} onUnlockRequired={onUnlockRequired} />;
  if (tool === 'employee_cost') return <EmployeeCostPro status={status} onUnlockRequired={onUnlockRequired} />;
  if (tool === 'night_shift_rural_urban') return <NightShiftRuralUrbanPro status={status} onUnlockRequired={onUnlockRequired} />;
  if (tool === 'proportional_salary') return <ProportionalSalaryPro status={status} onUnlockRequired={onUnlockRequired} />;
  if (tool === 'late_fee_calculator') return <LateFeePro status={status} onUnlockRequired={onUnlockRequired} />;
  if (tool === 'child_support') return <ChildSupportPro status={status} onUnlockRequired={onUnlockRequired} />;
  if (tool === 'benefits') return <BenefitsPro status={status} onUnlockRequired={onUnlockRequired} />;
  return <BpcPro status={status} onUnlockRequired={onUnlockRequired} />;
}


