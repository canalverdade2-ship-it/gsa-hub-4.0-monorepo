import { useMemo, useState } from 'react';
import { ArrowUpRight, BriefcaseBusiness, CheckCircle2, Clock3, Heart, Landmark, Palmtree } from 'lucide-react';
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
  type TerminationReason,
} from '../../lib/freeToolsCalculations';
import type { CalculatorPdfReport } from '../../lib/freeToolsPdfReport';
import type { ProToolId } from '../../lib/freeToolsProAccess';
import { BenefitsFree, BpcFree, ThirteenthFree } from './FreeToolsAdditionalCalculators';
import { CalculatorPdfReportButton } from './CalculatorPdfReportButton';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

const TERMINATION_REASON_LABELS: Record<TerminationReason, string> = {
  without_cause: 'Demissão sem justa causa',
  agreement: 'Acordo entre as partes',
  resignation: 'Pedido de demissão',
  just_cause: 'Demissão por justa causa',
};

function numeric(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function Field({ label, value, onChange, prefix, suffix, max }: { label: string; value: string; onChange: (value: string) => void; prefix?: string; suffix?: string; max?: number }) {
  return <label className="block"><span className="text-sm font-black text-[#26313a]">{label}</span><span className="relative mt-2 block">{prefix && <span className="absolute inset-y-0 left-4 flex items-center text-sm font-bold text-[#727c84]">{prefix}</span>}<input type="number" min={0} max={max} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} className={`min-h-12 w-full rounded-lg border border-[#d5cfc5] bg-white py-3 text-sm font-bold text-[#111820] outline-none transition focus:border-[#91722f] focus:ring-4 focus:ring-[#91722f]/10 ${prefix ? 'pl-12' : 'pl-4'} ${suffix ? 'pr-16' : 'pr-4'}`} />{suffix && <span className="absolute inset-y-0 right-4 flex items-center text-xs font-bold text-[#727c84]">{suffix}</span>}</span></label>;
}

function FreeLayout({ title, description, form, result, proItems, report }: { title: string; description: string; form: React.ReactNode; result: React.ReactNode; proItems: string[]; report: CalculatorPdfReport }) {
  return <div className="grid overflow-hidden rounded-2xl border border-[#d4cdc2] bg-white shadow-[0_20px_55px_rgba(29,36,42,0.09)] lg:grid-cols-[1fr_0.88fr]">
    <section className="bg-[#fffdfa] p-5 sm:p-7 lg:p-8"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#806128]">Modo Free · consulta básica</p><h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-[#111820]">{title}</h3><p className="mt-3 max-w-xl text-sm leading-6 text-[#68727a]">{description}</p><div className="mt-7 space-y-5">{form}</div></section>
    <aside className="bg-[#152433] p-5 text-white sm:p-7 lg:p-8"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#d8bd73]">Resultado básico</p><div className="mt-5">{result}</div><div className="mt-7 border-t border-white/10 pt-6"><CalculatorPdfReportButton report={report} mode="free" /></div><div className="mt-7 border-t border-white/10 pt-6"><p className="flex items-center gap-2 text-xs font-black text-white"><ArrowUpRight className="h-4 w-4 text-[#d8bd73]" />No modo Pro você também recebe</p><ul className="mt-4 space-y-2.5 text-xs leading-5 text-white/58">{proItems.map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#d8bd73]" />{item}</li>)}</ul></div></aside>
  </div>;
}

function TerminationFree() {
  const [salary, setSalary] = useState('3500');
  const [reason, setReason] = useState<TerminationReason>('without_cause');
  const [days, setDays] = useState('15');
  const result = useMemo(() => calculateTerminationEstimate({ salary: numeric(salary), reason, daysWorked: numeric(days), thirteenthMonths: 0, vacationMonths: 0, expiredVacation: false, completedYears: 0, fgtsBalance: 0 }), [salary, reason, days]);
  const report: CalculatorPdfReport = {
    calculator: 'Calculadora de rescisão trabalhista',
    mode: 'free',
    headline: `Saldo de salário estimado: ${currency.format(result.salaryBalance)}`,
    summary: 'Relatório simples elaborado somente com os campos disponíveis no modo Free.',
    sections: [
      { title: 'Dados informados', rows: [
        { label: 'Salário bruto mensal', value: currency.format(numeric(salary)) },
        { label: 'Motivo do desligamento', value: TERMINATION_REASON_LABELS[reason] },
        { label: 'Dias trabalhados no mês', value: `${numeric(days)} dia(s)` },
      ] },
      { title: 'Resultado simples', rows: [
        { label: 'Saldo de salário estimado', value: currency.format(result.salaryBalance) },
      ] },
    ],
    disclaimer: 'Estimativa educativa. O modo Free não considera aviso-prévio, férias, 13º proporcional, FGTS, descontos ou situações específicas do contrato.',
  };
  return <FreeLayout title="Estimativa inicial da rescisão" description="Informe somente salário, motivo e dias trabalhados para visualizar o saldo de salário e uma referência inicial." form={<><Field label="Salário bruto mensal" value={salary} onChange={setSalary} prefix="R$" /><label className="block"><span className="text-sm font-black text-[#26313a]">Motivo do desligamento</span><select value={reason} onChange={(event) => setReason(event.target.value as TerminationReason)} className="mt-2 min-h-12 w-full rounded-lg border border-[#d5cfc5] bg-white px-4 py-3 text-sm font-bold text-[#111820] outline-none focus:border-[#91722f] focus:ring-4 focus:ring-[#91722f]/10"><option value="without_cause">Demissão sem justa causa</option><option value="agreement">Acordo entre as partes</option><option value="resignation">Pedido de demissão</option><option value="just_cause">Demissão por justa causa</option></select></label><Field label="Dias trabalhados no mês" value={days} onChange={setDays} suffix="dias" max={30} /></>} result={<><BriefcaseBusiness className="h-7 w-7 text-[#d8bd73]" /><p className="mt-5 text-4xl font-black tracking-[-0.04em]">{currency.format(result.salaryBalance)}</p><p className="mt-2 text-sm leading-6 text-white/55">Saldo de salário estimado. Outras verbas dependem de períodos e informações adicionais.</p></>} proItems={['aviso-prévio conforme tempo de empresa', '13º e férias proporcionais', 'férias vencidas e multa do FGTS', 'memória detalhada das parcelas']} report={report} />;
}

function RetirementFree() {
  const [gender, setGender] = useState<'woman' | 'man'>('woman');
  const [age, setAge] = useState('57');
  const [contribution, setContribution] = useState('29');
  const result = useMemo(() => evaluateRetirement2026({ gender, age: numeric(age), contributionYears: numeric(contribution), contributedBeforeReform: false }), [gender, age, contribution]);
  const missingAge = Math.max(0, result.generalAge - result.currentAge);
  const missingContribution = Math.max(0, result.generalContribution - result.contributionYears);
  const report: CalculatorPdfReport = {
    calculator: 'Calculadora aposentadoria INSS',
    mode: 'free',
    headline: result.generalEligible ? 'Requisitos básicos da regra geral atingidos' : 'Existem requisitos básicos pendentes',
    summary: `${decimal.format(result.currentAge)} anos de idade e ${decimal.format(result.contributionYears)} anos de contribuição informados.`,
    sections: [
      { title: 'Dados informados', rows: [
        { label: 'Perfil', value: gender === 'woman' ? 'Mulher' : 'Homem' },
        { label: 'Idade atual', value: `${decimal.format(result.currentAge)} ano(s)` },
        { label: 'Tempo de contribuição', value: `${decimal.format(result.contributionYears)} ano(s)` },
      ] },
      { title: 'Regra geral', rows: [
        { label: 'Idade de referência', value: `${result.generalAge} anos` },
        { label: 'Contribuição de referência', value: `${result.generalContribution} anos` },
        { label: 'Situação da idade', value: missingAge === 0 ? 'Atingida' : `Faltam ${decimal.format(missingAge)} ano(s)` },
        { label: 'Situação da contribuição', value: missingContribution === 0 ? 'Atingida' : `Faltam ${decimal.format(missingContribution)} ano(s)` },
      ] },
    ],
    disclaimer: 'Triagem educativa da regra geral. Não avalia direito adquirido, pedágios, atividade especial, magistério, trabalho rural, deficiência, qualidade das contribuições ou informações do CNIS.',
  };
  return <FreeLayout title="Verificação básica da regra geral" description="Compare idade e contribuição com a regra geral, sem avaliar regras de transição ou situações especiais." form={<><div className="grid grid-cols-2 rounded-lg bg-[#ece9e2] p-1">{([['woman','Mulher'],['man','Homem']] as const).map(([value,label]) => <button key={value} type="button" onClick={() => setGender(value)} className={`min-h-11 rounded-md px-4 py-2.5 text-sm font-black ${gender === value ? 'bg-white text-[#111820] shadow-sm' : 'text-[#69727a]'}`}>{label}</button>)}</div><Field label="Idade atual" value={age} onChange={setAge} suffix="anos" max={100} /><Field label="Tempo de contribuição" value={contribution} onChange={setContribution} suffix="anos" max={60} /></>} result={<><Landmark className="h-7 w-7 text-[#d8bd73]" /><p className="mt-5 text-2xl font-black">{result.generalEligible ? 'Requisitos básicos atingidos' : 'Ainda existem requisitos pendentes'}</p><div className="mt-5 space-y-3">{result.generalEligible ? <p className="flex gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-5 w-5" />Idade e contribuição informadas atendem à regra geral básica.</p> : <><p className="flex gap-2 text-sm text-white/65"><Clock3 className="h-5 w-5 text-[#d8bd73]" />Idade: faltam {missingAge.toFixed(1).replace('.0','')} ano(s)</p><p className="flex gap-2 text-sm text-white/65"><Clock3 className="h-5 w-5 text-[#d8bd73]" />Contribuição: faltam {missingContribution.toFixed(1).replace('.0','')} ano(s)</p></>}</div></>} proItems={['regra dos pontos de 2026', 'idade mínima progressiva', 'comparação entre regras', 'pendências detalhadas por critério']} report={report} />;
}

function VacationFree() {
  const [salary, setSalary] = useState('3500');
  const result = useMemo(() => calculateVacationEstimate(numeric(salary), 0), [salary]);
  const report: CalculatorPdfReport = {
    calculator: 'Calculadora de férias',
    mode: 'free',
    headline: `Total bruto estimado: ${currency.format(result.total)}`,
    summary: 'Relatório simples para férias de 30 dias, sem médias variáveis ou descontos.',
    sections: [
      { title: 'Dados informados', rows: [{ label: 'Salário bruto mensal', value: currency.format(numeric(salary)) }] },
      { title: 'Resultado simples', rows: [
        { label: 'Remuneração de férias', value: currency.format(result.remuneration) },
        { label: 'Adicional constitucional de 1/3', value: currency.format(result.constitutionalThird) },
        { label: 'Total bruto estimado', value: currency.format(result.total) },
      ] },
    ],
    disclaimer: 'Estimativa educativa para 30 dias de férias. Não considera descontos, faltas, médias, abono pecuniário, adiantamento do 13º ou férias em dobro.',
  };
  return <FreeLayout title="Estimativa simples de 30 dias de férias" description="Informe apenas o salário mensal para visualizar a remuneração e o adicional constitucional de um terço." form={<Field label="Salário bruto mensal" value={salary} onChange={setSalary} prefix="R$" />} result={<><Palmtree className="h-7 w-7 text-[#d8bd73]" /><p className="mt-5 text-4xl font-black tracking-[-0.04em]">{currency.format(result.total)}</p><div className="mt-5 space-y-2 text-sm text-white/62"><p>Remuneração: {currency.format(result.remuneration)}</p><p>Adicional de 1/3: {currency.format(result.constitutionalThird)}</p></div></>} proItems={['médias de horas extras e adicionais', 'composição detalhada do total', 'cenários e condições consideradas', 'resultado avançado para conferência']} report={report} />;
}

function OvertimeFree() {
  const [salary, setSalary] = useState('3500');
  const [hours50, setHours50] = useState('10');
  const [hours100, setHours100] = useState('0');

  const result = useMemo(() => calculateOvertimeEstimate(numeric(salary), { overtime50Hours: numeric(hours50), overtime100Hours: numeric(hours100) }), [salary, hours50, hours100]);

  const report: CalculatorPdfReport = {
    calculator: 'Calculadora de horas extras e noturno',
    mode: 'free',
    headline: `Total estimado de horas extras: ${currency.format(result.totalExtraWithoutDsr)}`,
    summary: 'Estimativa simples de horas suplementares a 50% e 100%.',
    sections: [
      { title: 'Dados informados', rows: [{ label: 'Salário base mensal', value: currency.format(numeric(salary)) }, { label: 'Horas 50%', value: `${numeric(hours50)} h` }, { label: 'Horas 100%', value: `${numeric(hours100)} h` }] },
      { title: 'Resultado simples', rows: [{ label: 'Valor da hora normal', value: currency.format(result.hourlyRate) }, { label: 'Horas 50%', value: currency.format(result.pay50) }, { label: 'Horas 100%', value: currency.format(result.pay100) }, { label: 'Total sem DSR', value: currency.format(result.totalExtraWithoutDsr) }] },
    ],
    disclaimer: 'Cálculo básico educativo sem considerar adicional noturno, hora reduzida ou reflexo no DSR.',
  };

  return <FreeLayout title="Horas extras simples" description="Informe o salário e as horas excedentes a 50% ou 100% para visualizar o valor das horas." form={<><Field label="Salário base mensal" value={salary} onChange={setSalary} prefix="R$" /><div className="grid grid-cols-2 gap-3"><Field label="Horas a 50%" value={hours50} onChange={setHours50} suffix="horas" /><Field label="Horas a 100%" value={hours100} onChange={setHours100} suffix="horas" /></div></>} result={<><Clock3 className="h-7 w-7 text-[#d8bd73]" /><p className="mt-5 text-4xl font-black tracking-[-0.04em]">{currency.format(result.totalExtraWithoutDsr)}</p><div className="mt-4 space-y-1.5 text-xs leading-5 text-white/60"><p>Valor hora normal: {currency.format(result.hourlyRate)}</p><p>Extras 50%: {currency.format(result.pay50)}</p><p>Extras 100%: {currency.format(result.pay100)}</p></div></>} proItems={['Adicional noturno e hora noturna reduzida', 'Reflexo automático no DSR mensal', 'Memória detalhada de cálculo', 'Relatório em PDF para conferência']} report={report} />;
}

function NetSalaryFree() {
  const [gross, setGross] = useState('5000');
  const [dependents, setDependents] = useState('1');

  const result = useMemo(() => calculateNetSalaryEstimate(numeric(gross), numeric(dependents)), [gross, dependents]);

  const report: CalculatorPdfReport = {
    calculator: 'Calculadora de salário líquido (CLT x PJ)',
    mode: 'free',
    headline: `Salário líquido estimado: ${currency.format(result.netSalary)}`,
    summary: 'Demonstrativo simplificado dos descontos oficiais de INSS e IRRF 2026.',
    sections: [
      { title: 'Dados informados', rows: [{ label: 'Salário bruto', value: currency.format(numeric(gross)) }, { label: 'Dependentes', value: `${numeric(dependents)}` }] },
      { title: 'Descontos calculados', rows: [{ label: 'Desconto INSS (2026)', value: currency.format(result.inssDeduction) }, { label: 'Desconto IRRF', value: currency.format(result.irrfDeduction) }, { label: 'Salário líquido', value: currency.format(result.netSalary) }] },
    ],
    disclaimer: 'Cálculo de salário líquido com base nas tabelas vigentes de 2026.',
  };

  return <FreeLayout title="Salário líquido 2026" description="Simule os descontos de INSS e Imposto de Renda para saber o valor líquido no bolso." form={<><Field label="Salário bruto mensal" value={gross} onChange={setGross} prefix="R$" /><Field label="Número de dependentes" value={dependents} onChange={setDependents} suffix="dep." /></>} result={<><BriefcaseBusiness className="h-7 w-7 text-[#d8bd73]" /><p className="mt-5 text-4xl font-black tracking-[-0.04em]">{currency.format(result.netSalary)}</p><div className="mt-4 space-y-1.5 text-xs leading-5 text-white/60"><p>Desconto INSS: {currency.format(result.inssDeduction)} ({result.inssEffectiveRate}% efetivo)</p><p>Desconto IRRF: {currency.format(result.irrfDeduction)}</p></div></>} proItems={['Comparador CLT x Contratação PJ', 'Cálculo do faturamento PJ necessário', 'Inclusão de VR/VA e plano de saúde', 'Relatório completo de equivalência']} report={report} />;
}

function MeiLimitFree() {
  const [openingMonth, setOpeningMonth] = useState('1');
  const [accumulated, setAccumulated] = useState('45000');

  const result = useMemo(() => calculateMeiLimitEstimate(numeric(openingMonth), numeric(accumulated)), [openingMonth, accumulated]);

  const report: CalculatorPdfReport = {
    calculator: 'Calculadora de limite e excesso do MEI',
    mode: 'free',
    headline: `Limite proporcional: ${currency.format(result.proportionalLimit)}`,
    summary: 'Verificação do limite de faturamento anual do MEI.',
    sections: [
      { title: 'Dados informados', rows: [{ label: 'Mês de abertura', value: `Mês ${numeric(openingMonth)}` }, { label: 'Faturamento acumulado', value: currency.format(numeric(accumulated)) }] },
      { title: 'Situação', rows: [{ label: 'Limite proporcional', value: currency.format(result.proportionalLimit) }, { label: 'Saldo disponível', value: currency.format(result.remainingBalance) }, { label: 'Uso do limite', value: `${result.usedPercentage}%` }] },
    ],
    disclaimer: 'Cálculo com base no limite anual padrão do MEI de R$ 81.000,00.',
  };

  return <FreeLayout title="Limite proporcional do MEI" description="Verifique o limite proporcional de faturamento do seu MEI conforme o mês de abertura." form={<><Field label="Mês de abertura no ano (1 a 12)" value={openingMonth} onChange={setOpeningMonth} suffix="mês" max={12} /><Field label="Faturamento acumulado até agora" value={accumulated} onChange={setAccumulated} prefix="R$" /></>} result={<><Landmark className="h-7 w-7 text-[#d8bd73]" /><p className="mt-5 text-3xl font-black tracking-[-0.03em]">{currency.format(result.remainingBalance)}</p><p className="mt-2 text-sm leading-6 text-white/70">Saldo disponível até atingir o limite proporcional de {currency.format(result.proportionalLimit)} ({result.usedPercentage}% utilizado).</p></>} proItems={['Projeção de vendas até o fim do ano', 'Diagnóstico de excesso (até 20% vs acima de 20%)', 'Simulação de imposto Simples Nacional (ME)', 'Relatório de acompanhamento fiscal']} report={report} />;
}

function UnemploymentFree() {
  const [requestTimes, setRequestTimes] = useState<1 | 2 | 3>(1);
  const [monthsWorked, setMonthsWorked] = useState('18');
  const [averageSalary, setAverageSalary] = useState('2800');

  const result = useMemo(() => calculateUnemploymentEstimate(requestTimes, numeric(monthsWorked), numeric(averageSalary)), [requestTimes, monthsWorked, averageSalary]);

  const report: CalculatorPdfReport = {
    calculator: 'Simulador de seguro-desemprego',
    mode: 'free',
    headline: result.eligible ? `Elegível: ${result.installments} parcelas de ${currency.format(result.installmentValue)}` : 'Não cumpre requisitos básicos de meses',
    summary: 'Triagem de parcelas e estimativa simples do benefício.',
    sections: [
      { title: 'Dados informados', rows: [{ label: 'Solicitação', value: `${requestTimes}ª vez` }, { label: 'Meses trabalhados', value: `${numeric(monthsWorked)} meses` }, { label: 'Média salarial', value: currency.format(numeric(averageSalary)) }] },
    ],
    disclaimer: 'Estimativa simples baseada na tabela oficial do MTE 2026.',
  };

  return <FreeLayout title="Seguro-desemprego MTE 2026" description="Simule o número de parcelas e o valor aproximado do benefício." form={<><div className="block"><span className="text-sm font-black text-[#26313a]">Solicitação do benefício</span><div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-[#ece9e2] p-1">{([1, 2, 3] as const).map((t) => <button key={t} type="button" onClick={() => setRequestTimes(t)} className={`min-h-11 rounded-md text-xs font-black ${requestTimes === t ? 'bg-white text-[#111820] shadow-sm' : 'text-[#69727a]'}`}>{t}ª Solicitação</button>)}</div></div><Field label="Meses trabalhados (últimos 36 meses)" value={monthsWorked} onChange={setMonthsWorked} suffix="meses" /><Field label="Média dos últimos 3 salários" value={averageSalary} onChange={setAverageSalary} prefix="R$" /></>} result={<><CheckCircle2 className="h-7 w-7 text-[#d8bd73]" /><p className="mt-5 text-3xl font-black">{result.eligible ? `${result.installments} parcelas` : 'Requisitos pendentes'}</p><div className="mt-4 space-y-1.5 text-xs text-white/65">{result.eligible ? <><p>Valor da parcela: {currency.format(result.installmentValue)}</p><p>Total estimado: {currency.format(result.totalBenefit)}</p></> : <p>Tempo trabalhado insuficiente para a solicitação informada.</p>}</div></>} proItems={['Detalhamento das regras do MTE 2026', 'Cálculo por salário individual dos 3 meses', 'Checklist de documentos para dar entrada', 'Exportação do extrato em PDF']} report={report} />;
}

function FatorRFree() {
  const [rbt12, setRbt12] = useState('180000');
  const [payroll12, setPayroll12] = useState('54000');

  const result = useMemo(() => calculateFatorREstimate(numeric(rbt12), numeric(payroll12)), [rbt12, payroll12]);

  const report: CalculatorPdfReport = {
    calculator: 'Calculadora do Fator R (Simples Nacional)',
    mode: 'free',
    headline: `Fator R: ${result.fatorRPercentage}% - Enquadramento: ${result.anexoName}`,
    summary: 'Cálculo rápido da razão folha/faturamento.',
    sections: [
      { title: 'Dados informados', rows: [{ label: 'Receita Bruta 12 meses (RBT12)', value: currency.format(numeric(rbt12)) }, { label: 'Folha de pagamento 12 meses', value: currency.format(numeric(payroll12)) }] },
      { title: 'Resultado', rows: [{ label: 'Fator R (%)', value: `${result.fatorRPercentage}%` }, { label: 'Anexo de enquadramento', value: result.anexoName }] },
    ],
    disclaimer: 'Cálculo baseado na regra geral do Fator R (>= 28% para Anexo III).',
  };

  return <FreeLayout title="Fator R do Simples Nacional" description="Verifique se sua empresa atinge 28% de folha para tributar no Anexo III (alíquota de 6%)." form={<><Field label="Receita bruta dos últimos 12 meses (RBT12)" value={rbt12} onChange={setRbt12} prefix="R$" /><Field label="Folha de pagamento dos últimos 12 meses" value={payroll12} onChange={setPayroll12} prefix="R$" /></>} result={<><BriefcaseBusiness className="h-7 w-7 text-[#d8bd73]" /><p className="mt-5 text-4xl font-black tracking-[-0.04em]">{result.fatorRPercentage}%</p><p className="mt-2 text-sm leading-6 text-white/70">{result.isAnexo3 ? 'Parabéns! Enquadrado no Anexo III (alíquota a partir de 6%).' : 'Atenção: Enquadrado no Anexo V (alíquota maior a partir de 15.5%).'}</p></>} proItems={['Projeção de pro-labore necessário para atingir 28%', 'Cálculo de economia em R$ nos próximos meses', 'Simulação de enquadramento por atividade', 'Relatório para contabilidade']} report={report} />;
}

function AmortizationFree() {
  const [balance, setBalance] = useState('200000');
  const [rate, setRate] = useState('10');
  const [months, setMonths] = useState('240');

  const result = useMemo(() => calculateAmortizationEstimate(numeric(balance), numeric(rate), numeric(months)), [balance, rate, months]);

  const report: CalculatorPdfReport = {
    calculator: 'Calculadora de amortização (SAC / PRICE)',
    mode: 'free',
    headline: `Prestação atual estimada: ${currency.format(result.currentInstallment)}`,
    summary: 'Estimativa inicial das parcelas e saldo devedor.',
    sections: [
      { title: 'Dados informados', rows: [{ label: 'Saldo devedor', value: currency.format(numeric(balance)) }, { label: 'Taxa de juros anual', value: `${numeric(rate)}% a.a.` }, { label: 'Prazo restante', value: `${numeric(months)} meses` }] },
    ],
    disclaimer: 'Simulação inicial baseada na Tabela SAC.',
  };

  return <FreeLayout title="Simulação de financiamento" description="Visualize o valor inicial da prestação e a projeção do saldo devedor." form={<><Field label="Saldo devedor atual" value={balance} onChange={setBalance} prefix="R$" /><div className="grid grid-cols-2 gap-3"><Field label="Juros ao ano (%)" value={rate} onChange={setRate} suffix="%" /><Field label="Meses restantes" value={months} onChange={setMonths} suffix="meses" /></div></>} result={<><Landmark className="h-7 w-7 text-[#d8bd73]" /><p className="mt-5 text-3xl font-black">{currency.format(result.currentInstallment)}</p><p className="mt-2 text-sm leading-6 text-white/70">Prestação inicial estimada na Tabela SAC.</p></>} proItems={['Simulação de aporte extra de amortização', 'Comparativo de redução de prazo vs redução da parcela', 'Cálculo exato da economia em R$ de juros', 'Relatório impresso para o banco']} report={report} />;
}

function InternshipTerminationFree() {
  const [stipend, setStipend] = useState('1800');
  const [months, setMonths] = useState('6');

  const result = useMemo(() => calculateInternshipTerminationEstimate(numeric(stipend), numeric(months)), [stipend, months]);

  const report: CalculatorPdfReport = {
    calculator: 'Rescisão de contrato de estágio (Lei 11.788)',
    mode: 'free',
    headline: `Recesso proporcional + 1/3: ${currency.format(result.totalRecess)}`,
    summary: 'Estimativa dos valores devidos no desligamento de estagiários.',
    sections: [
      { title: 'Dados informados', rows: [{ label: 'Bolsa-auxílio mensal', value: currency.format(numeric(stipend)) }, { label: 'Meses estagiados', value: `${numeric(months)} meses` }] },
      { title: 'Valores devidos', rows: [{ label: 'Recesso proporcional', value: currency.format(result.proportionalRecessPay) }, { label: 'Adicional de 1/3', value: currency.format(result.proportionalRecessThird) }, { label: 'Total devido', value: currency.format(result.totalRecess) }] },
    ],
    disclaimer: 'Estágio é isento de aviso-prévio, FGTS e multa de 40% (Lei 11.788/2008).',
  };

  return <FreeLayout title="Rescisão de estágio (Lei 11.788)" description="Informe a bolsa e os meses estagiados para apurar o recesso remunerado proporcional." form={<><Field label="Bolsa-auxílio mensal" value={stipend} onChange={setStipend} prefix="R$" /><Field label="Meses de estágio cumpridos" value={months} onChange={setMonths} suffix="meses" max={24} /></>} result={<><BriefcaseBusiness className="h-7 w-7 text-[#d8bd73]" /><p className="mt-5 text-4xl font-black tracking-[-0.04em]">{currency.format(result.totalRecess)}</p><div className="mt-4 space-y-1.5 text-xs text-white/65"><p>Recesso proporcional: {currency.format(result.proportionalRecessPay)}</p><p>1/3 Constitucional: {currency.format(result.proportionalRecessThird)}</p></div></>} proItems={['Apuração de recesso vencido', 'Inclusão de auxílio-transporte proporcional', 'Relatório jurídico em PDF', 'Checklist de documentos do estagiário']} report={report} />;
}

function ProlaboreVsLucrosFree() {
  const [withdrawal, setWithdrawal] = useState('10000');

  const result = useMemo(() => calculateProlaboreVsLucrosEstimate(numeric(withdrawal)), [withdrawal]);

  const report: CalculatorPdfReport = {
    calculator: 'Pró-labore vs Distribuição de lucros',
    mode: 'free',
    headline: `Economia anual estimada: ${currency.format(result.annualSavings)}`,
    summary: 'Comparativo de retenções tributárias entre pró-labore e distribuição de lucros.',
    sections: [
      { title: 'Retirada Desejada', rows: [{ label: 'Valor total mensal', value: currency.format(numeric(withdrawal)) }] },
      { title: 'Resultado da Economia', rows: [{ label: 'Impostos em 100% Pró-labore', value: currency.format(result.taxA) }, { label: 'Impostos com Pró-labore mínimo + Lucros', value: currency.format(result.taxB) }, { label: 'Economia mensal', value: currency.format(result.monthlySavings) }, { label: 'Economia anual', value: currency.format(result.annualSavings) }] },
    ],
    disclaimer: 'Distribuição de lucros é isenta de IRRF e INSS para o sócio.',
  };

  return <FreeLayout title="Economia Pró-labore vs Lucros" description="Compare o imposto pago ao retirar 100% em pró-labore versus otimizar com distribuição de lucros." form={<Field label="Retirada total mensal planejada pelo sócio" value={withdrawal} onChange={setWithdrawal} prefix="R$" />} result={<><Landmark className="h-7 w-7 text-[#d8bd73]" /><p className="mt-5 text-4xl font-black tracking-[-0.04em]">{currency.format(result.monthlySavings)}</p><p className="mt-2 text-sm leading-6 text-white/70">Economia estimada por mês ao adotar Pró-Labore de 1 salário mínimo + Distribuição de lucros ({currency.format(result.annualSavings)}/ano).</p></>} proItems={['Análise por regime (Simples vs Lucro Presumido)', 'Projeção de balancetes e retenção fiscal', 'Matriz de planejamento para o sócio', 'Relatório contábil em PDF']} report={report} />;
}

function EmployeeCostFree() {
  const [salary, setSalary] = useState('3000');
  const [benefits, setBenefits] = useState('500');

  const result = useMemo(() => calculateEmployeeCostEstimate(numeric(salary), numeric(benefits)), [salary, benefits]);

  const report: CalculatorPdfReport = {
    calculator: 'Custo total do funcionário para a empresa',
    mode: 'free',
    headline: `Custo mensal total: ${currency.format(result.totalMonthlyCost)} (+${result.costPercentageOverSalary}%)`,
    summary: 'Estimativa simples de encargos e provisões de contratação CLT no Simples Nacional.',
    sections: [
      { title: 'Dados informados', rows: [{ label: 'Salário bruto', value: currency.format(numeric(salary)) }, { label: 'Benefícios mensais', value: currency.format(numeric(benefits)) }] },
      { title: 'Composição de custo', rows: [{ label: 'FGTS mensal (8%)', value: currency.format(result.fgtsMonthly) }, { label: 'Provisão 13º', value: currency.format(result.provision13th) }, { label: 'Provisão Férias + 1/3', value: currency.format(result.provisionVacation) }, { label: 'Custo total mensal', value: currency.format(result.totalMonthlyCost) }] },
    ],
    disclaimer: 'Estimativa de custo no Simples Nacional.',
  };

  return <FreeLayout title="Custo total de contratação CLT" description="Descubra quanto a empresa realmente gasta por mês ao contratar um funcionário." form={<><Field label="Salário bruto do funcionário" value={salary} onChange={setSalary} prefix="R$" /><Field label="Benefícios mensais (VR/VA/VT)" value={benefits} onChange={setBenefits} prefix="R$" /></>} result={<><BriefcaseBusiness className="h-7 w-7 text-[#d8bd73]" /><p className="mt-5 text-4xl font-black tracking-[-0.04em]">{currency.format(result.totalMonthlyCost)}</p><p className="mt-2 text-sm leading-6 text-white/70">Custo mensal estimado para a empresa (+{result.costPercentageOverSalary}% sobre o salário).</p></>} proItems={['Comparativo Simples Nacional vs Lucro Presumido/Real', 'Encargos patronais INSS/RAT/Sistema S (27,8%)', 'Detalhamento de provisões anuais', 'Relatório financeiro em PDF']} report={report} />;
}

function NightShiftRuralUrbanFree() {
  const [salary, setSalary] = useState('3000');
  const [hours, setHours] = useState('30');

  const result = useMemo(() => calculateNightShiftRuralUrbanEstimate(numeric(salary), 'urban', numeric(hours)), [salary, hours]);

  const report: CalculatorPdfReport = {
    calculator: 'Adicional noturno urbano vs rural',
    mode: 'free',
    headline: `Adicional noturno urbano estimado: ${currency.format(result.nightAditionalPay)}`,
    summary: 'Estimativa simples de adicional noturno urbano (20% com hora reduzida 52m30s).',
    sections: [
      { title: 'Dados informados', rows: [{ label: 'Salário base', value: currency.format(numeric(salary)) }, { label: 'Horas noturnas', value: `${numeric(hours)} h` }] },
    ],
    disclaimer: 'Cálculo para adicional urbano (22h às 5h).',
  };

  return <FreeLayout title="Adicional noturno urbano" description="Calcule o valor do adicional noturno considerando a hora reduzida de 52m30s." form={<><Field label="Salário base mensal" value={salary} onChange={setSalary} prefix="R$" /><Field label="Horas noturnas trabalhadas" value={hours} onChange={setHours} suffix="horas" /></>} result={<><Clock3 className="h-7 w-7 text-[#d8bd73]" /><p className="mt-5 text-4xl font-black tracking-[-0.04em]">{currency.format(result.nightAditionalPay)}</p><p className="mt-2 text-sm leading-6 text-white/70">Adicional bruto estimado ({result.computedHours}h noturnas computadas).</p></>} proItems={['Comparativo com Noturno Rural Pecuária (25%)', 'Comparativo com Noturno Rural Lavoura (25%)', 'Reflexos no DSR mensal', 'Relatório analítico em PDF']} report={report} />;
}

function ProportionalSalaryFree() {
  const [salary, setSalary] = useState('3000');
  const [days, setDays] = useState('12');

  const result = useMemo(() => calculateProportionalSalaryEstimate(numeric(salary), numeric(days)), [salary, days]);

  const report: CalculatorPdfReport = {
    calculator: 'Calculadora de salário proporcional',
    mode: 'free',
    headline: `Salário proporcional (30 dias): ${currency.format(result.proportional30)}`,
    summary: 'Cálculo de salário por dias trabalhados na admissão ou saída.',
    sections: [
      { title: 'Dados informados', rows: [{ label: 'Salário mensal integral', value: currency.format(numeric(salary)) }, { label: 'Dias trabalhados', value: `${numeric(days)} dias` }] },
    ],
    disclaimer: 'Cálculo pela regra padrão CLT de 30 dias.',
  };

  return <FreeLayout title="Salário proporcional por dias" description="Calcule o salário devido por dias trabalhados no mês de admissão ou desligamento." form={<><Field label="Salário mensal integral" value={salary} onChange={setSalary} prefix="R$" /><Field label="Dias trabalhados no mês" value={days} onChange={setDays} suffix="dias" max={31} /></>} result={<><Clock3 className="h-7 w-7 text-[#d8bd73]" /><p className="mt-5 text-4xl font-black tracking-[-0.04em]">{currency.format(result.proportional30)}</p><p className="mt-2 text-sm leading-6 text-white/70">Salário proporcional para {numeric(days)} dias trabalhados.</p></>} proItems={['Comparação regra 30 dias vs dias reais do mês (28/31d)', 'Desconto proporcional de faltas', 'Exportação de memória em PDF', 'Conferência de holerite de admissão']} report={report} />;
}

function LateFeeFree() {
  const [amount, setAmount] = useState('1000');
  const [days, setDays] = useState('15');

  const result = useMemo(() => calculateLateFeeEstimate(numeric(amount), numeric(days)), [amount, days]);

  const report: CalculatorPdfReport = {
    calculator: 'Juros e multa por atraso',
    mode: 'free',
    headline: `Total atualizado: ${currency.format(result.totalUpdated)}`,
    summary: 'Cálculo de multa de 2% + juros de mora de 1% a.m. por atraso.',
    sections: [
      { title: 'Dados informados', rows: [{ label: 'Valor original', value: currency.format(numeric(amount)) }, { label: 'Dias de atraso', value: `${numeric(days)} dias` }] },
      { title: 'Acréscimos', rows: [{ label: 'Multa de 2%', value: currency.format(result.fineAmount) }, { label: 'Juros de mora', value: currency.format(result.interestAmount) }, { label: 'Total atualizado', value: currency.format(result.totalUpdated) }] },
    ],
    disclaimer: 'Simulação básica de encargos por atraso em cobranças.',
  };

  return <FreeLayout title="Atualização por atraso" description="Calcule a multa de 2% e os juros de mora proporcionais de 1% a.m. para contas em atraso." form={<><Field label="Valor original da conta / débito" value={amount} onChange={setAmount} prefix="R$" /><Field label="Dias em atraso" value={days} onChange={setDays} suffix="dias" /></>} result={<><Landmark className="h-7 w-7 text-[#d8bd73]" /><p className="mt-5 text-4xl font-black tracking-[-0.04em]">{currency.format(result.totalUpdated)}</p><div className="mt-4 space-y-1.5 text-xs text-white/65"><p>Multa (2%): {currency.format(result.fineAmount)}</p><p>Juros (1% a.m.): {currency.format(result.interestAmount)}</p></div></>} proItems={['Atualização pela taxa SELIC acumulada oficial', 'Simulação de juros compostos contratuais', 'Impressão de demonstrativo de cobrança em PDF', 'Opção de parcelamento com encargos']} report={report} />;
}

function ChildSupportFree() {
  const [gross, setGross] = useState('4500');
  const [percentage, setPercentage] = useState('20');

  const result = useMemo(() => calculateChildSupportEstimate(numeric(gross), 1, numeric(percentage)), [gross, percentage]);

  const report: CalculatorPdfReport = {
    calculator: 'Simulador de pensão alimentícia',
    mode: 'free',
    headline: `Pensão estimada: ${currency.format(result.pensionValue)}`,
    summary: 'Estimativa de pensão alimentícia sobre a base líquida (após INSS e IRRF).',
    sections: [
      { title: 'Dados informados', rows: [{ label: 'Salário bruto', value: currency.format(numeric(gross)) }, { label: 'Porcentagem aplicada', value: `${numeric(percentage)}%` }] },
      { title: 'Cálculo', rows: [{ label: 'Salário líquido base', value: currency.format(result.netBase) }, { label: 'Pensão estimada', value: currency.format(result.pensionValue) }] },
    ],
    disclaimer: 'Simulação com base na renda líquida após descontos fiscais.',
  };

  return <FreeLayout title="Pensão alimentícia estimada" description="Calcule o valor estimado da pensão alimentícia sobre a renda líquida descontando INSS e IRRF." form={<><Field label="Salário bruto do alimentante" value={gross} onChange={setGross} prefix="R$" /><Field label="Porcentagem de pensão fixada (%)" value={percentage} onChange={setPercentage} suffix="%" max={50} /></>} result={<><Heart className="h-7 w-7 text-[#d8bd73]" /><p className="mt-5 text-4xl font-black tracking-[-0.04em]">{currency.format(result.pensionValue)}</p><p className="mt-2 text-sm leading-6 text-white/70">Valor estimado da pensão sobre a base líquida de {currency.format(result.netBase)}.</p></>} proItems={['Inclusão de despesas extraordinárias (Escola/Saúde)', 'Incidência sobre 13º salário, férias e PLR', 'Relatório em PDF para instrução de acordo', 'Demonstrativo detalhado das retenções']} report={report} />;
}

export function FreeToolsSimpleCalculator({ tool }: { tool: ProToolId }) {
  if (tool === 'termination') return <TerminationFree />;
  if (tool === 'retirement') return <RetirementFree />;
  if (tool === 'vacation') return <VacationFree />;
  if (tool === 'thirteenth') return <ThirteenthFree />;
  if (tool === 'overtime') return <OvertimeFree />;
  if (tool === 'net_salary') return <NetSalaryFree />;
  if (tool === 'mei_limit') return <MeiLimitFree />;
  if (tool === 'unemployment') return <UnemploymentFree />;
  if (tool === 'fator_r') return <FatorRFree />;
  if (tool === 'amortization') return <AmortizationFree />;
  if (tool === 'internship_termination') return <InternshipTerminationFree />;
  if (tool === 'prolabore_vs_lucros') return <ProlaboreVsLucrosFree />;
  if (tool === 'employee_cost') return <EmployeeCostFree />;
  if (tool === 'night_shift_rural_urban') return <NightShiftRuralUrbanFree />;
  if (tool === 'proportional_salary') return <ProportionalSalaryFree />;
  if (tool === 'late_fee_calculator') return <LateFeeFree />;
  if (tool === 'child_support') return <ChildSupportFree />;
  if (tool === 'benefits') return <BenefitsFree />;
  return <BpcFree />;
}
