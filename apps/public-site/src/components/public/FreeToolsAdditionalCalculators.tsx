import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Baby,
  BadgeCheck,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileCheck2,
  HandCoins,
  HeartHandshake,
  Info,
  Landmark,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import {
  BPC_INCOME_LIMIT_2026,
  BPC_JUDICIAL_INCOME_LIMIT_2026,
  MINIMUM_WAGE_2026,
  calculateThirteenthSalary,
  evaluateBpcScreening,
  evaluateInssBenefitScreening,
  type BpcApplicantType,
  type InssBenefitType,
  type ScreeningRequirement,
} from '../../lib/freeToolsAdditionalCalculations';
import type { CalculatorPdfReport } from '../../lib/freeToolsPdfReport';
import type { ProAccessStatus } from '../../lib/freeToolsProAccess';
import { CalculatorPdfReportButton } from './CalculatorPdfReportButton';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const BENEFIT_OPTIONS: Array<[InssBenefitType, string]> = [
  ['temporary_incapacity', 'Incapacidade temporária (Auxílio-doença)'],
  ['maternity', 'Salário-maternidade'],
  ['death_pension', 'Pensão por morte'],
  ['accident_assistance', 'Auxílio-acidente'],
];

const BENEFIT_LABELS: Record<InssBenefitType, string> = {
  temporary_incapacity: 'Auxílio por incapacidade temporária (Auxílio-doença)',
  maternity: 'Salário-maternidade',
  death_pension: 'Pensão por morte previdenciária',
  accident_assistance: 'Auxílio-acidente de qualquer natureza',
};

function yesNo(value: boolean) {
  return value ? 'Sim' : 'Não';
}

function numeric(value: string) {
  const parsed = Number(value.replace(/\D/g, ''));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function Field({ label, value, onChange, prefix, suffix, help, min = 0, max = 1000000, step = 1 }: { label: string; value: string; onChange: (value: string) => void; prefix?: string; suffix?: string; help?: string; min?: number; max?: number; step?: number }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#26313a] sm:text-sm">{label}</span>
      <span className="relative mt-1.5 block">
        {prefix && <span className="absolute inset-y-0 left-4 flex items-center text-xs font-bold text-[#727c84]">{prefix}</span>}
        <input 
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          inputMode="numeric" onChange={(event) => onChange(event.target.value)}
          className={`min-h-12 w-full rounded-lg border border-[#d5cfc5] bg-white py-3 text-sm font-bold text-[#111820] outline-none transition hover:border-[#bbb1a1] focus:border-[#91722f] focus:ring-4 focus:ring-[#91722f]/10 ${prefix ? 'pl-12' : 'pl-4'} ${suffix ? 'pr-16' : 'pr-4'}`}
        />
        {suffix && <span className="absolute inset-y-0 right-4 flex items-center text-xs font-bold text-[#727c84]">{suffix}</span>}
      </span>
      {help && <span className="mt-1.5 block text-xs leading-5 text-[#68727a]">{help}</span>}
    </label>
  );
}

function FreeLayout({
  eyebrow,
  title,
  description,
  form,
  result,
  proItems,
  report,
}: {
  eyebrow: string;
  title: string;
  description: string;
  form: ReactNode;
  result: ReactNode;
  proItems: string[];
  report: CalculatorPdfReport;
}) {
  return (
    <div className="grid overflow-hidden rounded-2xl border border-[#d4cdc2] bg-white shadow-[0_20px_55px_rgba(29,36,42,0.09)] lg:grid-cols-[1fr_0.88fr]">
      <section className="bg-[#fffdfa] p-5 sm:p-7 lg:p-8">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#806128]">Modo Free · {eyebrow}</p>
        <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-[#111820]">{title}</h3>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#68727a]">{description}</p>
        <div className="mt-7 space-y-5">{form}</div>
      </section>
      <aside className="bg-[#152433] p-5 text-white sm:p-7 lg:p-8">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#d8bd73]">Resultado básico</p>
        <div className="mt-5">{result}</div>
        <div className="mt-7 border-t border-white/10 pt-6">
          <CalculatorPdfReportButton report={report} mode="free" />
        </div>
        <div className="mt-7 border-t border-white/10 pt-6">
          <p className="flex items-center gap-2 text-xs font-black text-white">
            <ClipboardCheck className="h-4 w-4 text-[#d8bd73]" />
            No modo Pro você também recebe
          </p>
          <ul className="mt-4 space-y-2.5 text-xs leading-5 text-white/58">
            {proItems.map((item) => (
              <li key={item} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#d8bd73]" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
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

function ResultLine({ label, value, emphasized, subtext }: { label: string; value: string; emphasized?: boolean; subtext?: string; key?: string | number }) {
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
  onUnlockRequired,
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
  onUnlockRequired?: () => void;
}) {
  return (
    <aside className="bg-[#132231] p-5 text-white sm:p-7 lg:sticky lg:top-0 lg:self-start">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
        <span className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.13em] text-[#d8bd73]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Resultado Pro com Memória 2026
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
        <CalculatorPdfReportButton report={report} mode="pro" status={status} onUnlockRequired={onUnlockRequired} />
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
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#806128]">Modo Pro · análise avançada 2026</p>
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
// 13º SALÁRIO (FREE & PRO)
// ==========================================

export function ThirteenthFree() {
  const [salary, setSalary] = useState('3500');
  const [months, setMonths] = useState('12');
  const result = useMemo(
    () =>
      calculateThirteenthSalary({
        salary: numeric(salary),
        eligibleMonths: numeric(months),
      }),
    [salary, months]
  );
  const report: CalculatorPdfReport = {
    calculator: 'Calculadora de 13º salário',
    mode: 'free',
    headline: `Total bruto estimado: ${currency.format(result.grossValue)}`,
    summary: 'Estimativa simples dos valores brutos do 13º salário.',
    sections: [
      {
        title: 'Valores brutos',
        rows: [
          { label: 'Salário mensal', value: currency.format(numeric(salary)) },
          { label: 'Avos de 13º', value: `${result.eligibleMonths} de 12` },
          { label: '1ª Parcela (50%)', value: currency.format(result.firstInstallmentPaid) },
          { label: '2ª Parcela Bruta', value: currency.format(result.secondInstallmentBeforeDeductions) },
          { label: 'Total Bruto Estimado', value: currency.format(result.grossValue) },
        ],
      },
    ],
    disclaimer: 'Estimativa inicial bruta sem considerar impostos e adicionais.',
  };
  return (
    <FreeLayout
      eyebrow="13º Salário"
      title="Estimativa bruta do 13º"
      description="Calcule a estimativa inicial da 1ª e 2ª parcela antes de descontos tributários."
      form={
        <>
          <Field label="Salário bruto mensal" value={salary} onChange={setSalary} prefix="R$" />
          <Field label="Avos de 13º no ano" value={months} onChange={setMonths} suffix="/ 12" max={12} step={1} />
        </>
      }
      result={
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase text-[#d8bd73]">Total Bruto Estimado</p>
            <p className="text-3xl font-black">{currency.format(result.grossValue)}</p>
          </div>
          <div className="space-y-2 border-t border-white/10 pt-3 text-sm">
            <div className="flex justify-between"><span>1ª Parcela (50%):</span><strong className="font-black">{currency.format(result.firstInstallmentPaid)}</strong></div>
            <div className="flex justify-between"><span>2ª Parcela Bruta:</span><strong className="font-black">{currency.format(result.secondInstallmentBeforeDeductions)}</strong></div>
          </div>
        </div>
      }
      proItems={['Cálculo automático de INSS e IRRF 2026', 'Abatimento por dependente', 'Médias de horas extras e adicionais', 'Memória detalhada de cálculo em PDF']}
      report={report}
    />
  );
}

export function ThirteenthPro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void } = {}) {
  const [salary, setSalary] = useState('3500');
  const [averages, setAverages] = useState('0');
  const [months, setMonths] = useState('12');
  const [dependents, setDependents] = useState('0');

  const result = useMemo(
    () =>
      calculateThirteenthSalary({
        salary: numeric(salary),
        variableAverage: numeric(averages),
        eligibleMonths: numeric(months),
        dependents: numeric(dependents),
      }),
    [salary, averages, months, dependents]
  );

  const report: CalculatorPdfReport = {
    calculator: 'Calculadora de 13º salário',
    mode: 'pro',
    headline: `13º Líquido Total: ${currency.format(result.estimatedTotalNet)} (Bruto: ${currency.format(result.grossValue)})`,
    summary: 'Relatório completo de parcelas do 13º salário com deduções automáticas de INSS e IRRF 2026 por dependentes.',
    sections: [
      {
        title: 'Dados informados',
        rows: [
          { label: 'Salário base mensal', value: currency.format(numeric(salary)) },
          { label: 'Média de horas extras e comissões', value: currency.format(numeric(averages)) },
          { label: 'Meses trabalhados no ano', value: `${result.eligibleMonths} avos de 12` },
          { label: 'Dependentes para IRRF', value: `${numeric(dependents)} dependente(s)` },
        ],
      },
      {
        title: 'Detalhamento das Parcelas',
        rows: [
          { label: '1ª Parcela (Paga até 30/11 - Sem descontos)', value: currency.format(result.firstInstallmentPaid) },
          { label: '2ª Parcela Bruta (Antes de impostos)', value: currency.format(result.secondInstallmentBeforeDeductions) },
          { label: 'Dedução INSS 2026 (Tabela Progressiva)', value: `- ${currency.format(result.inssDeduction)}` },
          { label: 'Dedução IRRF 2026 (Com dependentes)', value: `- ${currency.format(result.irrfDeduction)}` },
          { label: 'Total de Descontos Fiscais', value: `- ${currency.format(result.totalDeductions)}` },
          { label: '2ª Parcela Líquida (Paga até 20/12)', value: currency.format(result.secondInstallmentNet) },
          { label: '13º Salário Total Líquido (1ª + 2ª)', value: currency.format(result.estimatedTotalNet) },
        ],
      },
    ],
    disclaimer: 'A 1ª parcela deve ser paga entre 1º de fevereiro e 30 de novembro sem retenções. Todos os tributos incidem integralmente na 2ª parcela paga até 20 de dezembro.',
  };

  return (
    <Workbench
      title="Cálculo do 13º Salário com Impostos 2026"
      description="Calcule a 1ª e 2ª parcela com retenções automáticas de INSS e IRRF 2026 considerando dependentes."
      result={
        <Result
          eyebrow="13º Salário Líquido Total"
          headline={currency.format(result.estimatedTotalNet)}
          summary={`1ª Parcela de ${currency.format(result.firstInstallmentPaid)} (sem impostos) + 2ª Parcela Líquida de ${currency.format(result.secondInstallmentNet)}.`}
          icon={<HandCoins className="h-5 w-5" />}
          note="Todos os descontos tributários do 13º salário (INSS e IRRF) concentram-se na 2ª parcela."
          report={report}
          status={status}
          onUnlockRequired={onUnlockRequired}
        >
          <ResultLine label="13º Salário Bruto Total" value={currency.format(result.grossValue)} />
          <ResultLine label="1ª Parcela (até 30/11 - Isenta)" value={currency.format(result.firstInstallmentPaid)} subtext="50% do valor bruto sem descontos" />
          <ResultLine label="2ª Parcela Bruta" value={currency.format(result.secondInstallmentBeforeDeductions)} />
          <ResultLine label="Retenções INSS + IRRF 2026" value={`- ${currency.format(result.totalDeductions)}`} subtext={`INSS: ${currency.format(result.inssDeduction)} | IRRF: ${currency.format(result.irrfDeduction)}`} />
          <ResultLine label="2ª Parcela Líquida (até 20/12)" value={currency.format(result.secondInstallmentNet)} />
          <ResultLine label="13º Salário Líquido Acumulado" value={currency.format(result.estimatedTotalNet)} emphasized />
        </Result>
      }
    >
      <Section number="01" title="Remuneração e avos do 13º">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Salário bruto mensal" value={salary} onChange={setSalary} prefix="R$" />
          <Field label="Média de adicionais habituais" value={averages} onChange={setAverages} prefix="R$" help="Médias de horas extras, adicionais e comissões." />
        </div>
      </Section>

      <Section number="02" title="Tempo trabalhado e tributos">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Avos de 13º no ano (mín. 15 dias no mês)" value={months} onChange={setMonths} suffix="/ 12" max={12} step={1} />
          <Field label="Número de dependentes para IRRF" value={dependents} onChange={setDependents} suffix="dep." max={10} step={1} help="Cada dependente reduz R$ 189,59 na base do IRRF." />
        </div>
      </Section>
    </Workbench>
  );
}

// ==========================================
// TRIAGEM BENEFÍCIOS INSS (FREE & PRO)
// ==========================================

export function BenefitsFree() {
  const [benefitType, setBenefitType] = useState<InssBenefitType>('temporary_incapacity');
  const [insured, setInsured] = useState(true);
  const [incapacityDays, setIncapacityDays] = useState('30');
  const [maternityDoc, setMaternityDoc] = useState(true);
  const [deceasedCoverage, setDeceasedCoverage] = useState(true);
  const [eligibleDependent, setEligibleDependent] = useState(true);
  const [accidentCategory, setAccidentCategory] = useState(true);
  const [permanentSequela, setPermanentSequela] = useState(true);

  const result = useMemo(
    () =>
      evaluateInssBenefitScreening({
        benefitType,
        hasInsuredStatus: insured,
        incapacityDays: numeric(incapacityDays),
        maternityEventDocumented: maternityDoc,
        deceasedHadCoverage: deceasedCoverage,
        isEligibleDependent: eligibleDependent,
        accidentCategoryEligible: accidentCategory,
        hasPermanentSequela: permanentSequela,
      }),
    [benefitType, insured, incapacityDays, maternityDoc, deceasedCoverage, eligibleDependent, accidentCategory, permanentSequela]
  );

  const report: CalculatorPdfReport = {
    calculator: 'Triagem de benefícios do INSS',
    mode: 'free',
    headline: result.allMet ? 'Requisitos básicos atingidos' : 'Requisitos básicos pendentes',
    summary: `Triagem inicial do ${BENEFIT_LABELS[benefitType]}.`,
    sections: [
      {
        title: 'Resultado da triagem',
        rows: result.requirements.map((req) => ({
          label: req.label,
          value: req.met ? 'Atingido' : 'Pendente',
        })),
      },
    ],
    disclaimer: 'Triagem básica simplificada sem estimativa financeira de benefício.',
  };

  return (
    <FreeLayout
      eyebrow="Triagem INSS"
      title="Panorama inicial de benefícios"
      description="Verifique os requisitos básicos para benefício do INSS."
      form={
        <>
          <label className="block">
            <span className="text-sm font-black text-[#26313a]">Tipo de benefício</span>
            <select
              value={benefitType}
              onChange={(event) => setBenefitType(event.target.value as InssBenefitType)}
              className="mt-2 min-h-12 w-full rounded-lg border border-[#d5cfc5] bg-white px-4 py-3 text-sm font-bold outline-none"
            >
              {BENEFIT_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a]">
            <input type="checkbox" checked={insured} onChange={(event) => setInsured(event.target.checked)} className="h-4 w-4 accent-[#8a6e2f]" />
            Possui qualidade de segurado
          </label>
        </>
      }
      result={
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase text-[#d8bd73]">Panorama</p>
            <p className="text-xl font-black">{result.allMet ? '✅ Requisitos básicos atingidos' : '⚠️ Requisitos pendentes'}</p>
          </div>
          <div className="space-y-2 border-t border-white/10 pt-3 text-xs">
            {result.requirements.map((req) => (
              <div key={req.label} className="flex justify-between">
                <span>{req.label}:</span>
                <strong className="font-black">{req.met ? 'Sim' : 'Não'}</strong>
              </div>
            ))}
          </div>
        </div>
      }
      proItems={['Simulador de Renda Mensal Inicial (RMI)', 'Cálculo do período de graça acumulado', 'Checklist completo de documentos', 'Relatório em PDF com fundamento legal']}
      report={report}
    />
  );
}

export function BenefitsPro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void } = {}) {
  const [benefitType, setBenefitType] = useState<InssBenefitType>('temporary_incapacity');
  const [insured, setInsured] = useState(true);
  const [contributions, setContributions] = useState('24');
  const [incapacityDays, setIncapacityDays] = useState('30');
  const [carencyExempt, setCarencyExempt] = useState(false);
  const [medicalEvidence, setMedicalEvidence] = useState(true);
  const [maternityDoc, setMaternityDoc] = useState(true);
  const [deceasedCoverage, setDeceasedCoverage] = useState(true);
  const [eligibleDependent, setEligibleDependent] = useState(true);
  const [dependencyEvidence, setDependencyEvidence] = useState(true);
  const [accidentCategory, setAccidentCategory] = useState(true);
  const [permanentSequela, setPermanentSequela] = useState(true);
  const [capacityReduced, setCapacityReduced] = useState(true);
  const [avgSalary, setAvgSalary] = useState('3500');
  const [pensionDeps, setPensionDeps] = useState('1');
  const [unemployed, setUnemployed] = useState(true);

  const result = useMemo(
    () =>
      evaluateInssBenefitScreening({
        benefitType,
        hasInsuredStatus: insured,
        contributionMonths: numeric(contributions),
        incapacityDays: numeric(incapacityDays),
        carencyExempt,
        hasMedicalEvidence: medicalEvidence,
        maternityEventDocumented: maternityDoc,
        deceasedHadCoverage: deceasedCoverage,
        isEligibleDependent: eligibleDependent,
        hasDependencyEvidence: dependencyEvidence,
        accidentCategoryEligible: accidentCategory,
        hasPermanentSequela: permanentSequela,
        capacityReduced,
        averageContributionSalary: numeric(avgSalary),
        dependentCountForPension: numeric(pensionDeps),
        unvoluntaryUnemployment: unemployed,
      }),
    [
      benefitType,
      insured,
      contributions,
      incapacityDays,
      carencyExempt,
      medicalEvidence,
      maternityDoc,
      deceasedCoverage,
      eligibleDependent,
      dependencyEvidence,
      accidentCategory,
      permanentSequela,
      capacityReduced,
      avgSalary,
      pensionDeps,
      unemployed,
    ]
  );

  const report: CalculatorPdfReport = {
    calculator: 'Triagem de benefícios do INSS',
    mode: 'pro',
    headline: result.allMet ? `Benefício provável (RMI estimada: ${currency.format(result.estimatedRmi)})` : 'Requisitos previdenciários pendentes',
    summary: `${BENEFIT_LABELS[benefitType]} com ${result.metCount} de ${result.totalRequirements} requisitos atingidos e período de graça de ${result.gracePeriodMonths} meses.`,
    sections: [
      {
        title: 'Modalidade e estimativa de renda (RMI)',
        rows: [
          { label: 'Benefício analisado', value: BENEFIT_LABELS[benefitType] },
          { label: 'Qualidade de segurado', value: yesNo(insured) },
          { label: 'Período de graça calculado', value: `${result.gracePeriodMonths} meses de cobertura` },
          { label: 'Média contributiva considerada', value: currency.format(numeric(avgSalary)) },
          { label: 'Renda Mensal Inicial (RMI) Estimada', value: currency.format(result.estimatedRmi) },
          { label: 'Regra de cálculo da RMI', value: result.rmiExplanation },
        ],
      },
      {
        title: 'Checklist detalhado de requisitos',
        rows: result.requirements.map((req) => ({
          label: req.label,
          value: `${req.met ? 'Atingido' : 'Pendente'} - ${req.detail}`,
        })),
      },
    ],
    disclaimer: 'Análise educativa baseada na Legislação Previdenciária. A concessão final depende da homologação de documentos e perícia médica do INSS.',
  };

  return (
    <Workbench
      title="Triagem de Benefícios com Simulador de RMI"
      description="Verifique requisitos legais, projete o valor estimado do benefício (RMI) e calcule a extensão do seu período de graça."
      result={
        <Result
          eyebrow="Renda Mensal Inicial (RMI)"
          headline={currency.format(result.estimatedRmi)}
          summary={`${result.rmiExplanation} Período de graça estimado: ${result.gracePeriodMonths} meses.`}
          icon={<HeartHandshake className="h-5 w-5" />}
          note="O valor definitivo é apurado pelo INSS com base nos salários de contribuição homologados no CNIS."
          report={report}
          status={status}
          onUnlockRequired={onUnlockRequired}
        >
          <div className="my-3 rounded-lg border border-white/10 bg-white/5 p-3">
            <span className="text-[10px] font-black uppercase tracking-[#d8bd73] text-[#d8bd73]">Status dos Requisitos</span>
            <p className="mt-1 text-sm font-black">{result.allMet ? '✅ Requisitos preliminares atingidos' : '⚠️ Requisitos em análise'}</p>
          </div>

          {result.requirements.map((req) => (
            <ResultLine
              key={req.label}
              label={req.label}
              value={req.met ? 'Atingido' : 'Pendente'}
              subtext={req.detail}
              emphasized={req.met}
            />
          ))}
        </Result>
      }
    >
      <Section number="01" title="Benefício e média contributiva">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-black text-[#26313a]">Tipo de benefício</span>
            <select
              value={benefitType}
              onChange={(event) => setBenefitType(event.target.value as InssBenefitType)}
              className="mt-2 min-h-12 w-full rounded-lg border border-[#d5cfc5] bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#91722f]"
            >
              {BENEFIT_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </label>

          <Field label="Média salarial contributiva" value={avgSalary} onChange={setAvgSalary} prefix="R$" />
        </div>
      </Section>

      <Section number="02" title="Qualidade de segurado & Período de graça">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contribuições totais acumuladas" value={contributions} onChange={setContributions} suffix="meses" step={1} />

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a]">
            <input type="checkbox" checked={insured} onChange={(event) => setInsured(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#8a6e2f]" />
            Possui qualidade de segurado ativa
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a] sm:col-span-2">
            <input type="checkbox" checked={unemployed} onChange={(event) => setUnemployed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#8a6e2f]" />
            <span>
              Desemprego involuntário comprovado no MTE
              <small className="block text-[11px] font-medium text-[#69727a]">Adiciona +12 meses no período de graça de manutenção da qualidade de segurado.</small>
            </span>
          </label>
        </div>
      </Section>

      <Section number="03" title="Requisitos específicos do benefício">
        {benefitType === 'temporary_incapacity' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dias de afastamento médico" value={incapacityDays} onChange={setIncapacityDays} suffix="dias" max={365} step={1} />
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a]">
              <input type="checkbox" checked={medicalEvidence} onChange={(event) => setMedicalEvidence(event.target.checked)} className="h-4 w-4 accent-[#8a6e2f]" />
              Possui atestado/laudo com CID
            </label>
          </div>
        )}

        {benefitType === 'death_pension' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Número de dependentes elegíveis" value={pensionDeps} onChange={setPensionDeps} suffix="dep." max={5} step={1} />
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a]">
              <input type="checkbox" checked={dependencyEvidence} onChange={(event) => setDependencyEvidence(event.target.checked)} className="h-4 w-4 accent-[#8a6e2f]" />
              Prova documental da dependência
            </label>
          </div>
        )}

        {benefitType === 'maternity' && (
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a]">
            <input type="checkbox" checked={maternityDoc} onChange={(event) => setMaternityDoc(event.target.checked)} className="h-4 w-4 accent-[#8a6e2f]" />
            Certidão de nascimento ou documento do evento
          </label>
        )}

        {benefitType === 'accident_assistance' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a]">
              <input type="checkbox" checked={permanentSequela} onChange={(event) => setPermanentSequela(event.target.checked)} className="h-4 w-4 accent-[#8a6e2f]" />
              Sequela permanente consolidada
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a]">
              <input type="checkbox" checked={capacityReduced} onChange={(event) => setCapacityReduced(event.target.checked)} className="h-4 w-4 accent-[#8a6e2f]" />
              Redução da capacidade de trabalho
            </label>
          </div>
        )}
      </Section>
    </Workbench>
  );
}

// ==========================================
// TRIAGEM BPC / LOAS (FREE & PRO)
// ==========================================

export function BpcFree() {
  const [applicantType, setApplicantType] = useState<BpcApplicantType>('elderly');
  const [age, setAge] = useState('67');
  const [grossIncome, setGrossIncome] = useState('1200');
  const [members, setMembers] = useState('4');

  const result = useMemo(
    () =>
      evaluateBpcScreening({
        applicantType,
        age: numeric(age),
        familyGrossIncome: numeric(grossIncome),
        familyMembers: numeric(members),
      }),
    [applicantType, age, grossIncome, members]
  );

  const report: CalculatorPdfReport = {
    calculator: 'Triagem BPC / LOAS',
    mode: 'free',
    headline: result.incomeWithinObjectiveLimit ? 'Renda per capita dentro do limite' : 'Renda per capita acima do limite administrativo',
    summary: `Renda de ${currency.format(result.rawIncomePerPerson)} por pessoa.`,
    sections: [
      {
        title: 'Dados da renda',
        rows: [
          { label: 'Renda bruta familiar', value: currency.format(result.familyGrossIncome) },
          { label: 'Integrantes', value: `${result.familyMembers} pessoa(s)` },
          { label: 'Renda per capita bruta', value: currency.format(result.rawIncomePerPerson) },
          { label: 'Limite de 1/4 SM (2026)', value: currency.format(result.incomeLimit) },
        ],
      },
    ],
    disclaimer: 'Triagem administrativa básica.',
  };

  return (
    <FreeLayout
      eyebrow="BPC / LOAS"
      title="Triagem básica de renda"
      description="Verifique o enquadramento inicial no critério de renda do BPC."
      form={
        <>
          <div className="grid grid-cols-2 rounded-lg bg-[#ece9e2] p-1">
            {(
              [
                ['elderly', 'Idoso (65+)'],
                ['disabled', 'PCD'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setApplicantType(val)}
                className={`min-h-11 rounded-md text-xs font-black ${applicantType === val ? 'bg-white shadow-sm' : 'text-[#69727a]'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Field label="Renda familiar bruta" value={grossIncome} onChange={setGrossIncome} prefix="R$" />
          <Field label="Número de pessoas" value={members} onChange={setMembers} suffix="pessoas" max={30} step={1} />
        </>
      }
      result={
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase text-[#d8bd73]">Renda Per Capita Bruta</p>
            <p className="text-2xl font-black">{currency.format(result.rawIncomePerPerson)}</p>
          </div>
          <p className="text-xs text-white/70">
            {result.incomeWithinObjectiveLimit ? '✅ Renda dentro do limite objetivo (1/4 SM).' : '⚠️ Renda acima de R$ 405,25 por pessoa.'}
          </p>
        </div>
      }
      proItems={['Dedução de gastos com remédios/fraldas/cuidados', 'Análise de flexibilização judicial (1/2 SM)', 'Ajuste fino de renda per capita líquida', 'Relatório completo em PDF']}
      report={report}
    />
  );
}

export function BpcPro({ status, onUnlockRequired }: { status?: ProAccessStatus | null; onUnlockRequired?: () => void } = {}) {
  const [applicantType, setApplicantType] = useState<BpcApplicantType>('elderly');
  const [age, setAge] = useState('67');
  const [grossIncome, setGrossIncome] = useState('1200');
  const [members, setMembers] = useState('4');
  const [healthExpenses, setHealthExpenses] = useState('350');
  const [impairment, setImpairment] = useState(true);
  const [cadUnico, setCadUnico] = useState(true);
  const [familyCpf, setFamilyCpf] = useState(true);
  const [incompatibleBenefit, setIncompatibleBenefit] = useState(false);
  const [biometric, setBiometric] = useState(true);

  const result = useMemo(
    () =>
      evaluateBpcScreening({
        applicantType,
        age: numeric(age),
        familyGrossIncome: numeric(grossIncome),
        familyMembers: numeric(members),
        healthMedicalExpenses: numeric(healthExpenses),
        longTermImpairment: impairment,
        cadUnicoUpdated: cadUnico,
        allFamilyCpfRegistered: familyCpf,
        receivesIncompatibleBenefit: incompatibleBenefit,
        biometricRegistered: biometric,
      }),
    [applicantType, age, grossIncome, members, healthExpenses, impairment, cadUnico, familyCpf, incompatibleBenefit, biometric]
  );

  const report: CalculatorPdfReport = {
    calculator: 'Triagem BPC / LOAS',
    mode: 'pro',
    headline: result.allObjectiveCriteriaMet ? 'Critérios de renda e perfil atendidos' : result.incomeWithinJudicialLimit ? 'Elegível via Flexibilização Judicial (1/2 SM)' : 'Critérios de renda pendentes',
    summary: `Renda líquida familiar de ${currency.format(result.netFamilyIncome)} (${currency.format(result.netIncomePerPerson)}/pessoa). Benefício de 1 salário mínimo (R$ 1.621,00 em 2026).`,
    sections: [
      {
        title: 'Composição da renda familiar e descontos de saúde',
        rows: [
          { label: 'Modalidade', value: applicantType === 'elderly' ? 'Pessoa Idosa (65+ anos)' : 'Pessoa com Deficiência' },
          { label: 'Integrantes da residência', value: `${result.familyMembers} pessoa(s)` },
          { label: 'Renda familiar bruta', value: currency.format(result.familyGrossIncome) },
          { label: 'Gastos com medicamentos/cuidados deduzidos', value: `- ${currency.format(result.healthExpenses)}` },
          { label: 'Renda familiar líquida ajustada', value: currency.format(result.netFamilyIncome) },
          { label: 'Renda per capita bruta', value: currency.format(result.rawIncomePerPerson) },
          { label: 'Renda per capita líquida ajustada', value: currency.format(result.netIncomePerPerson) },
        ],
      },
      {
        title: 'Análise dos Limites Legais em 2026',
        rows: [
          { label: 'Limite Administrativo INSS (1/4 SM)', value: `R$ ${result.incomeLimit.toFixed(2).replace('.', ',')} (${result.incomeWithinObjectiveLimit ? 'Atingido' : 'Excedido'})` },
          { label: 'Limite de Flexibilização Judicial (1/2 SM)', value: `R$ ${result.judicialIncomeLimit.toFixed(2).replace('.', ',')} (${result.incomeWithinJudicialLimit ? 'Atingido' : 'Excedido'})` },
        ],
      },
      {
        title: 'Requisitos Cadastrais e Legais',
        rows: result.requirements.map((req) => ({
          label: req.label,
          value: `${req.met ? 'Atingido' : 'Pendente'} - ${req.detail}`,
        })),
      },
    ],
    disclaimer: 'Conforme entendimento fixado pelo STJ e STF, gastos comprovados com medicamentos, fraldas e cuidados essenciais podem ser deduzidos da renda familiar para apuração do BPC.',
  };

  return (
    <Workbench
      title="Análise Avançada BPC/LOAS com Dedução de Gastos de Saúde"
      description="Calcule a renda per capita ajustada deduzindo comprovantes de medicamentos/cuidados e compare os critérios administrativo e judicial."
      result={
        <Result
          eyebrow="Valor do Benefício BPC"
          headline={currency.format(MINIMUM_WAGE_2026)}
          summary={`Renda por pessoa ajustada: ${currency.format(result.netIncomePerPerson)}. ${result.incomeWithinObjectiveLimit ? '✅ Dentro do limite administrativo de 1/4 SM (R$ 405,25).' : result.incomeWithinJudicialLimit ? '⚖️ Dentro da flexibilização judicial de 1/2 SM (R$ 810,50).' : '❌ Renda acima dos limites legais.'}`}
          icon={<ShieldCheck className="h-5 w-5" />}
          note="O BPC garante o pagamento mensal de 1 salário mínimo sem direito a 13º salário ou pensão por morte aos dependentes."
          report={report}
          status={status}
          onUnlockRequired={onUnlockRequired}
        >
          <div className="my-3 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-xs">
            <div>
              <span className="block text-[10px] uppercase text-white/50">Renda Per Capita Bruta</span>
              <span className="font-bold text-white">{currency.format(result.rawIncomePerPerson)}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase text-[#d8bd73]">Renda Per Capita Líquida</span>
              <span className="font-black text-[#f0d98f]">{currency.format(result.netIncomePerPerson)}</span>
            </div>
          </div>

          {result.requirements.map((req) => (
            <ResultLine key={req.label} label={req.label} value={req.met ? 'Atingido' : 'Pendente'} subtext={req.detail} emphasized={req.met} />
          ))}
        </Result>
      }
    >
      <Section number="01" title="Perfil do requerente">
        <div className="grid grid-cols-2 rounded-lg bg-[#ece9e2] p-1">
          {(
            [
              ['elderly', 'Pessoa Idosa (65+ anos)'],
              ['disabled', 'Pessoa com Deficiência'],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setApplicantType(val)}
              className={`min-h-11 rounded-md text-xs font-black ${applicantType === val ? 'bg-white shadow-sm' : 'text-[#69727a]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section number="02" title="Renda familiar e descontos de medicamentos/cuidados">
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Renda familiar mensal bruta" value={grossIncome} onChange={setGrossIncome} prefix="R$" />
          <Field label="Pessoas residentes na casa" value={members} onChange={setMembers} suffix="pessoas" max={30} step={1} />
          <Field label="Gastos com remédios/fraldas/cuidados" value={healthExpenses} onChange={setHealthExpenses} prefix="R$" help="Despesas médicas e medicamentosas comprovadas." />
        </div>
      </Section>

      <Section number="03" title="Cadastros e requisitos formais">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a]">
            <input type="checkbox" checked={cadUnico} onChange={(event) => setCadUnico(event.target.checked)} className="h-4 w-4 accent-[#8a6e2f]" />
            CadÚnico atualizado nos últimos 24 meses
          </label>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a]">
            <input type="checkbox" checked={familyCpf} onChange={(event) => setFamilyCpf(event.target.checked)} className="h-4 w-4 accent-[#8a6e2f]" />
            CPF registrado para todos os integrantes
          </label>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a]">
            <input type="checkbox" checked={biometric} onChange={(event) => setBiometric(event.target.checked)} className="h-4 w-4 accent-[#8a6e2f]" />
            Possui biometria cadastrada
          </label>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#d5cfc5] bg-[#faf8f3] p-3 text-xs font-bold text-[#26313a]">
            <input type="checkbox" checked={incompatibleBenefit} onChange={(event) => setIncompatibleBenefit(event.target.checked)} className="h-4 w-4 accent-[#8a6e2f]" />
            Recebe aposentadoria/pensão do INSS
          </label>
        </div>
      </Section>
    </Workbench>
  );
}
