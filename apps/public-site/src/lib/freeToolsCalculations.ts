export type TerminationReason = 'without_cause' | 'agreement' | 'resignation' | 'just_cause';
export type RetirementGender = 'woman' | 'man';
export type NoticeType = 'indemnified_employer' | 'worked_employer' | 'indemnified_employee' | 'waived';
export type InsalubrityLevel = 'none' | 'minimum_10' | 'medium_20' | 'maximum_40';

export const MINIMUM_WAGE_2026 = 1621;

function positiveNumber(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, positiveNumber(value)));
}

// ==========================================
// TABELAS OFICIAIS 2026 (INSS & IRRF)
// ==========================================

export interface InssBracket {
  limit: number;
  rate: number;
}

// Tabela progressiva do INSS 2026 (Estimada/Vigente com base no Salário Mínimo R$ 1.621)
export const INSS_BRACKETS_2026: InssBracket[] = [
  { limit: 1621.00, rate: 0.075 },
  { limit: 2792.16, rate: 0.09 },
  { limit: 4188.24, rate: 0.12 },
  { limit: 8157.41, rate: 0.14 }, // Teto INSS 2026 aproximado
];

// Tabela progressiva do IRRF 2026 (Com dedução por dependente de R$ 189,59)
export const IRRF_DEPENDENT_DEDUCTION_2026 = 189.59;
export const IRRF_SIMPLIFIED_DISCOUNT_2026 = 564.80; // Desconto simplificado opcional

export interface IrrfBracket {
  limit: number;
  rate: number;
  deduction: number;
}

export const IRRF_BRACKETS_2026: IrrfBracket[] = [
  { limit: 2259.20, rate: 0, deduction: 0 },
  { limit: 2826.65, rate: 0.075, deduction: 169.44 },
  { limit: 3751.05, rate: 0.15, deduction: 381.44 },
  { limit: 4664.68, rate: 0.225, deduction: 662.77 },
  { limit: Infinity, rate: 0.275, deduction: 896.00 },
];

/**
 * Calcula a contribuição previdenciária (INSS) progressiva.
 */
export function calculateInssDeduction(baseSalary: number): { inss: number; effectiveRate: number } {
  const base = positiveNumber(baseSalary);
  if (base <= 0) return { inss: 0, effectiveRate: 0 };

  let totalInss = 0;
  let previousLimit = 0;

  for (const bracket of INSS_BRACKETS_2026) {
    if (base > previousLimit) {
      const taxableChunk = Math.min(base, bracket.limit) - previousLimit;
      totalInss += taxableChunk * bracket.rate;
      previousLimit = bracket.limit;
    } else {
      break;
    }
  }

  const inss = Math.min(totalInss, 1050.00); // Teto de desconto aproximado
  const effectiveRate = base > 0 ? (inss / base) * 100 : 0;
  return { inss: roundCurrency(inss), effectiveRate: roundCurrency(effectiveRate) };
}

/**
 * Calcula o Imposto de Renda Retido na Fonte (IRRF).
 */
export function calculateIrrfDeduction(grossBase: number, inssDeduction: number, dependents = 0): { irrf: number; baseUsed: number } {
  const gross = positiveNumber(grossBase);
  const inss = positiveNumber(inssDeduction);
  const depDeduction = clamp(dependents, 0, 20) * IRRF_DEPENDENT_DEDUCTION_2026;

  // Opção 1: Dedução legal (INSS + Dependentes)
  const baseLegal = Math.max(0, gross - inss - depDeduction);
  // Opção 2: Desconto simplificado
  const baseSimplified = Math.max(0, gross - IRRF_SIMPLIFIED_DISCOUNT_2026);

  // Usa a base que for mais benéfica para o contribuinte (menor imposto)
  const baseUsed = Math.min(baseLegal, baseSimplified);

  let irrf = 0;
  for (const bracket of IRRF_BRACKETS_2026) {
    if (baseUsed <= bracket.limit) {
      irrf = (baseUsed * bracket.rate) - bracket.deduction;
      break;
    }
  }

  return { irrf: roundCurrency(Math.max(0, irrf)), baseUsed: roundCurrency(baseUsed) };
}

function roundCurrency(val: number): number {
  return Math.round(positiveNumber(val) * 100) / 100;
}

// ==========================================
// RESCISÃO TRABALHISTA CLT
// ==========================================

export interface TerminationEstimateInput {
  salary: number;
  reason: TerminationReason;
  daysWorked: number;
  thirteenthMonths: number;
  vacationMonths: number;
  expiredVacation: boolean;
  completedYears: number;
  fgtsBalance: number;
  insalubrity?: InsalubrityLevel;
  perilousness?: boolean;
  variableAverages?: number;
  noticeType?: NoticeType;
  dependents?: number;
}

export interface TerminationScenarioComparison {
  reason: TerminationReason;
  label: string;
  grossTotal: number;
  netTotal: number;
  fgtsPenalty: number;
  canWithdrawFgts: boolean;
  unemploymentInsuranceEligible: boolean;
}

export function calculateTerminationEstimate(input: TerminationEstimateInput) {
  const baseSalaryInput = positiveNumber(input.salary);
  const variableAverages = positiveNumber(input.variableAverages || 0);

  // Adicionais do Contrato
  let insalubrityBonus = 0;
  if (input.insalubrity === 'minimum_10') insalubrityBonus = MINIMUM_WAGE_2026 * 0.10;
  if (input.insalubrity === 'medium_20') insalubrityBonus = MINIMUM_WAGE_2026 * 0.20;
  if (input.insalubrity === 'maximum_40') insalubrityBonus = MINIMUM_WAGE_2026 * 0.40;

  const perilousnessBonus = input.perilousness ? baseSalaryInput * 0.30 : 0;
  const effectiveBaseSalary = baseSalaryInput + insalubrityBonus + perilousnessBonus + variableAverages;

  const days = clamp(input.daysWorked, 0, 30);
  const thirteenth = clamp(input.thirteenthMonths, 0, 12);
  const vacation = clamp(input.vacationMonths, 0, 12);
  const years = clamp(Math.floor(input.completedYears), 0, 40);
  const isJustCause = input.reason === 'just_cause';

  // Aviso prévio proporcional (Lei 12.506/2011: 30 dias + 3 dias por ano completo, máx 90)
  const noticeDays = Math.min(90, 30 + (years * 3));

  let noticeFactor = 0;
  if (input.reason === 'without_cause') noticeFactor = 1;
  else if (input.reason === 'agreement') noticeFactor = 0.5;
  else if (input.reason === 'resignation' && input.noticeType === 'indemnified_employee') noticeFactor = -1; // Desconto do aviso prévio

  const salaryBalance = (effectiveBaseSalary / 30) * days;
  const notice = (effectiveBaseSalary / 30) * noticeDays * noticeFactor;
  const thirteenthValue = isJustCause ? 0 : (effectiveBaseSalary / 12) * thirteenth;
  const proportionalVacation = isJustCause ? 0 : ((effectiveBaseSalary / 12) * vacation) * (4 / 3);
  const expiredVacationValue = input.expiredVacation ? effectiveBaseSalary * (4 / 3) : 0;

  const fgtsPenaltyRate = input.reason === 'without_cause' ? 0.4 : input.reason === 'agreement' ? 0.2 : 0;
  const fgtsPenalty = positiveNumber(input.fgtsBalance) * fgtsPenaltyRate;

  // Verbas rescisórias tributáveis
  const grossSalaryAndNotice = Math.max(0, salaryBalance + (notice > 0 ? notice : 0));
  const inssOnSalary = calculateInssDeduction(grossSalaryAndNotice).inss;
  const irrfOnSalary = calculateIrrfDeduction(grossSalaryAndNotice, inssOnSalary, input.dependents || 0).irrf;

  const inssOnThirteenth = isJustCause ? 0 : calculateInssDeduction(thirteenthValue).inss;
  const irrfOnThirteenth = isJustCause ? 0 : calculateIrrfDeduction(thirteenthValue, inssOnThirteenth, input.dependents || 0).irrf;

  const totalDeductions = inssOnSalary + irrfOnSalary + inssOnThirteenth + irrfOnThirteenth + (notice < 0 ? Math.abs(notice) : 0);

  const totalGross = Math.max(0, salaryBalance + (notice > 0 ? notice : 0) + thirteenthValue + proportionalVacation + expiredVacationValue + fgtsPenalty);
  const totalNet = Math.max(0, totalGross - totalDeductions);

  // Cenários Comparativos (Lado a lado)
  const scenarios: TerminationScenarioComparison[] = [
    {
      reason: 'without_cause',
      label: 'Demissão sem Justa Causa',
      grossTotal: roundCurrency(salaryBalance + ((effectiveBaseSalary / 30) * noticeDays) + thirteenthValue + proportionalVacation + expiredVacationValue + (positiveNumber(input.fgtsBalance) * 0.4)),
      netTotal: roundCurrency((salaryBalance + ((effectiveBaseSalary / 30) * noticeDays) + thirteenthValue + proportionalVacation + expiredVacationValue + (positiveNumber(input.fgtsBalance) * 0.4)) - totalDeductions),
      fgtsPenalty: roundCurrency(positiveNumber(input.fgtsBalance) * 0.4),
      canWithdrawFgts: true,
      unemploymentInsuranceEligible: true,
    },
    {
      reason: 'agreement',
      label: 'Acordo Mútuo (Art. 484-A)',
      grossTotal: roundCurrency(salaryBalance + ((effectiveBaseSalary / 30) * noticeDays * 0.5) + thirteenthValue + proportionalVacation + expiredVacationValue + (positiveNumber(input.fgtsBalance) * 0.2)),
      netTotal: roundCurrency((salaryBalance + ((effectiveBaseSalary / 30) * noticeDays * 0.5) + thirteenthValue + proportionalVacation + expiredVacationValue + (positiveNumber(input.fgtsBalance) * 0.2)) - totalDeductions),
      fgtsPenalty: roundCurrency(positiveNumber(input.fgtsBalance) * 0.2),
      canWithdrawFgts: true, // Saque até 80% do saldo
      unemploymentInsuranceEligible: false,
    },
    {
      reason: 'resignation',
      label: 'Pedido de Demissão',
      grossTotal: roundCurrency(salaryBalance + thirteenthValue + proportionalVacation + expiredVacationValue),
      netTotal: roundCurrency((salaryBalance + thirteenthValue + proportionalVacation + expiredVacationValue) - (inssOnSalary + irrfOnSalary + inssOnThirteenth + irrfOnThirteenth)),
      fgtsPenalty: 0,
      canWithdrawFgts: false,
      unemploymentInsuranceEligible: false,
    },
  ];

  return {
    effectiveBaseSalary: roundCurrency(effectiveBaseSalary),
    salaryBalance: roundCurrency(salaryBalance),
    notice: roundCurrency(notice),
    noticeDays,
    thirteenthValue: roundCurrency(thirteenthValue),
    proportionalVacation: roundCurrency(proportionalVacation),
    expiredVacationValue: roundCurrency(expiredVacationValue),
    fgtsPenalty: roundCurrency(fgtsPenalty),
    inssOnSalary: roundCurrency(inssOnSalary),
    irrfOnSalary: roundCurrency(irrfOnSalary),
    inssOnThirteenth: roundCurrency(inssOnThirteenth),
    irrfOnThirteenth: roundCurrency(irrfOnThirteenth),
    totalDeductions: roundCurrency(totalDeductions),
    total: roundCurrency(totalGross),
    netTotal: roundCurrency(totalNet),
    scenarios,
  };
}

// ==========================================
// APOSENTADORIA PELO INSS (2026)
// ==========================================

export interface Retirement2026Input {
  gender: RetirementGender;
  age: number;
  contributionYears: number;
  contributedBeforeReform: boolean;
  contributionMonthsBeforeReform?: number; // Meses de contribuição acumulados até 13/11/2019
  averageSalary?: number; // Média salarial contributiva estimada
}

export function evaluateRetirement2026(input: Retirement2026Input) {
  const currentAge = clamp(input.age, 0, 100);
  const contributionYears = clamp(input.contributionYears, 0, 60);
  const isWoman = input.gender === 'woman';

  // Regra Geral em 2026
  const generalAge = isWoman ? 62 : 65;
  const generalContribution = isWoman ? 15 : input.contributedBeforeReform ? 15 : 20;

  // Regra dos Pontos em 2026
  const transitionContribution = isWoman ? 30 : 35;
  const transitionPoints = isWoman ? 93 : 103;

  // Regra da Idade Progressiva em 2026
  const progressiveAge = isWoman ? 59.5 : 64.5;

  // Pedágio 50% (Exige que faltasse <= 2 anos em 13/11/2019: 28F / 33H anos em 13/11/2019)
  const yearsBeforeReform = (input.contributionMonthsBeforeReform || 0) / 12;
  const missingIn2019For50 = transitionContribution - yearsBeforeReform;
  const eligibleForToll50 = input.contributedBeforeReform && missingIn2019For50 > 0 && missingIn2019For50 <= 2;
  const toll50RequiredTime = transitionContribution + (missingIn2019For50 * 0.5);
  const toll50Eligible = eligibleForToll50 && contributionYears >= toll50RequiredTime;

  // Pedágio 100% (Exige 57F / 60H anos de idade + 100% do tempo que faltava em 13/11/2019)
  const toll100AgeRequired = isWoman ? 57 : 60;
  const missingIn2019For100 = Math.max(0, transitionContribution - yearsBeforeReform);
  const toll100RequiredTime = transitionContribution + missingIn2019For100;
  const toll100Eligible = input.contributedBeforeReform && currentAge >= toll100AgeRequired && contributionYears >= toll100RequiredTime;

  const points = currentAge + contributionYears;

  const generalEligible = currentAge >= generalAge && contributionYears >= generalContribution;
  const pointsEligible = input.contributedBeforeReform && contributionYears >= transitionContribution && points >= transitionPoints;
  const progressiveEligible = input.contributedBeforeReform && contributionYears >= transitionContribution && currentAge >= progressiveAge;

  // Estimativa de Renda Mensal Inicial (RMI)
  const baseAverage = positiveNumber(input.averageSalary || 3000);
  const baseRate = 0.60;
  const excessYears = isWoman ? Math.max(0, contributionYears - 15) : Math.max(0, contributionYears - 20);
  const totalRate = Math.min(1.00, baseRate + (excessYears * 0.02));
  const estimatedRmi = roundCurrency(baseAverage * totalRate);

  // Cálculo da projeção de anos/meses faltantes para cada regra
  const missingGeneralAge = Math.max(0, generalAge - currentAge);
  const missingGeneralContrib = Math.max(0, generalContribution - contributionYears);
  const yearsToGeneral = Math.max(missingGeneralAge, missingGeneralContrib);

  const missingPoints = Math.max(0, transitionPoints - points);
  const yearsToPoints = input.contributedBeforeReform ? Math.max(Math.max(0, transitionContribution - contributionYears), missingPoints / 2) : Infinity;

  const currentYear = new Date().getFullYear();
  const projectedRetirementYear = currentYear + Math.round(Math.min(yearsToGeneral, yearsToPoints === Infinity ? yearsToGeneral : yearsToPoints));

  return {
    currentAge,
    contributionYears,
    points,
    generalAge,
    generalContribution,
    transitionContribution,
    transitionPoints,
    progressiveAge,
    generalEligible,
    pointsEligible,
    progressiveEligible,
    toll50Eligible,
    toll100Eligible,
    toll50RequiredTime: roundCurrency(toll50RequiredTime),
    toll100RequiredTime: roundCurrency(toll100RequiredTime),
    toll100AgeRequired,
    anyEligible: generalEligible || pointsEligible || progressiveEligible || toll50Eligible || toll100Eligible,
    estimatedRmi,
    benefitRatePercentage: Math.round(totalRate * 100),
    projectedRetirementYear,
    yearsToGeneral: roundCurrency(yearsToGeneral),
  };
}

// ==========================================
// CÁLCULO DE FÉRIAS (CLT)
// ==========================================

export interface VacationEstimateInput {
  salary: number;
  variableAverages?: number;
  vacationDays?: number; // 30, 20, 15, 10
  sellDays?: boolean; // Abono pecuniário (venda de 10 dias)
  unexcusedAbsences?: number; // Faltas injustificadas no período aquisitivo (Art. 130 CLT)
  thirteenthAdvance?: boolean; // Adiantamento da 1ª parcela do 13º
  isDouble?: boolean; // Férias vencidas dobradas (Art. 137 CLT)
  dependents?: number;
}

export function calculateVacationEstimate(salaryInput: number, variableAveragesInput = 0, options: Partial<VacationEstimateInput> = {}) {
  const salary = positiveNumber(salaryInput);
  const averages = positiveNumber(variableAveragesInput);
  const totalBaseRemuneration = salary + averages;

  // Tabela de faltas Art. 130 CLT
  const absences = clamp(options.unexcusedAbsences || 0, 0, 100);
  let maxAllowedDays = 30;
  if (absences >= 6 && absences <= 14) maxAllowedDays = 24;
  else if (absences >= 15 && absences <= 23) maxAllowedDays = 18;
  else if (absences >= 24 && absences <= 32) maxAllowedDays = 12;
  else if (absences > 32) maxAllowedDays = 0;

  const requestedDays = clamp(options.vacationDays || 30, 1, maxAllowedDays);

  // Venda de férias (Abono pecuniário de 10 dias)
  const sell10Days = Boolean(options.sellDays) && maxAllowedDays >= 30;
  const actualVacationDays = sell10Days ? 20 : requestedDays;
  const soldDays = sell10Days ? 10 : 0;

  // Multiplicador se forem férias em dobro
  const doubleMultiplier = options.isDouble ? 2 : 1;

  // Remuneração das férias gozadas
  const vacationPay = ((totalBaseRemuneration / 30) * actualVacationDays) * doubleMultiplier;
  const vacationThird = (vacationPay / 3);

  // Abono Pecuniário (10 dias vendidos + 1/3 do abono) - Isentos de INSS/IRRF
  const abonoPay = sell10Days ? (totalBaseRemuneration / 30) * soldDays : 0;
  const abonoThird = sell10Days ? (abonoPay / 3) : 0;
  const totalAbonoPecuniario = abonoPay + abonoThird;

  // Adiantamento do 13º (50% do salário base)
  const thirteenthAdvancePay = options.thirteenthAdvance ? (salary / 2) : 0;

  // Tributação (INSS e IRRF incidem APENAS sobre férias gozadas + 1/3 constitucional)
  const taxableVacationBase = vacationPay + vacationThird;
  const inssDeduction = calculateInssDeduction(taxableVacationBase).inss;
  const irrfDeduction = calculateIrrfDeduction(taxableVacationBase, inssDeduction, options.dependents || 0).irrf;

  const totalGross = vacationPay + vacationThird + totalAbonoPecuniario + thirteenthAdvancePay;
  const totalNet = Math.max(0, totalGross - inssDeduction - irrfDeduction);

  return {
    remuneration: roundCurrency(totalBaseRemuneration),
    actualVacationDays,
    soldDays,
    maxAllowedDays,
    vacationPay: roundCurrency(vacationPay),
    constitutionalThird: roundCurrency(vacationThird),
    abonoPay: roundCurrency(abonoPay),
    abonoThird: roundCurrency(abonoThird),
    totalAbonoPecuniario: roundCurrency(totalAbonoPecuniario),
    thirteenthAdvancePay: roundCurrency(thirteenthAdvancePay),
    inssDeduction: roundCurrency(inssDeduction),
    irrfDeduction: roundCurrency(irrfDeduction),
    total: roundCurrency(totalGross),
    netTotal: roundCurrency(totalNet),
  };
}

// ==========================================
// CÁLCULO DE HORAS EXTRAS & NOTURNO (CLT)
// ==========================================

export interface OvertimeEstimateInput {
  salary: number;
  monthlyHours?: number; // padrão 220h
  overtime50Hours?: number;
  overtime100Hours?: number;
  nightHours?: number;
  businessDays?: number; // padrão 25
  sundaysAndHolidays?: number; // padrão 5
}

export function calculateOvertimeEstimate(salaryInput: number, options: Partial<OvertimeEstimateInput> = {}) {
  const salary = positiveNumber(salaryInput);
  const monthlyHours = clamp(options.monthlyHours || 220, 1, 300);
  const hourlyRate = salary / monthlyHours;

  const hours50 = positiveNumber(options.overtime50Hours || 0);
  const hours100 = positiveNumber(options.overtime100Hours || 0);
  const nightHoursRaw = positiveNumber(options.nightHours || 0);

  // Hora noturna reduzida (52m30s = 52.5min -> fator 60/52.5 = 1.142857)
  const reducedNightHours = nightHoursRaw * (60 / 52.5);

  // Valores das horas
  const pay50 = hours50 * (hourlyRate * 1.5);
  const pay100 = hours100 * (hourlyRate * 2.0);
  const nightAditionalPay = reducedNightHours * (hourlyRate * 0.20);

  const totalExtraWithoutDsr = pay50 + pay100 + nightAditionalPay;

  // DSR (Descanso Semanal Remunerado)
  const businessDays = clamp(options.businessDays || 25, 1, 31);
  const sundaysAndHolidays = clamp(options.sundaysAndHolidays || 5, 0, 15);
  const dsrPay = businessDays > 0 ? (totalExtraWithoutDsr / businessDays) * sundaysAndHolidays : 0;

  const totalGrossExtra = totalExtraWithoutDsr + dsrPay;

  return {
    hourlyRate: roundCurrency(hourlyRate),
    pay50: roundCurrency(pay50),
    pay100: roundCurrency(pay100),
    nightAditionalPay: roundCurrency(nightAditionalPay),
    reducedNightHours: roundCurrency(reducedNightHours),
    totalExtraWithoutDsr: roundCurrency(totalExtraWithoutDsr),
    dsrPay: roundCurrency(dsrPay),
    totalGrossExtra: roundCurrency(totalGrossExtra),
  };
}

// ==========================================
// CÁLCULO DE SALÁRIO LÍQUIDO & CLT x PJ
// ==========================================

export interface NetSalaryInput {
  grossSalary: number;
  dependents?: number;
  benefitsMonthly?: number; // VR/VA/Saúde
  pjProposedGross?: number;
}

export function calculateNetSalaryEstimate(grossInput: number, dependentsInput = 0, options: Partial<NetSalaryInput> = {}) {
  const gross = positiveNumber(grossInput);
  const dependents = clamp(dependentsInput, 0, 20);
  const benefits = positiveNumber(options.benefitsMonthly || 0);

  const inssResult = calculateInssDeduction(gross);
  const irrfResult = calculateIrrfDeduction(gross, inssResult.inss, dependents);

  const netSalary = Math.max(0, gross - inssResult.inss - irrfResult.irrf);
  const totalCltNetValue = netSalary + benefits;

  // Equivalência PJ Estimada (Custo Anual CLT: 13,33 salários + FGTS 8% + Férias 1/3 + Benefícios)
  const cltAnnualTotalCost = (gross * 13.33) + (gross * 0.08 * 12) + (gross / 3) + (benefits * 12);
  const recommendedPjMonthlyGross = (cltAnnualTotalCost / 12) / 0.94; // Considerando Simples Nacional ~6%

  const pjProposed = positiveNumber(options.pjProposedGross || 0);
  const pjEstimatedTax = pjProposed * 0.06;
  const pjNet = pjProposed - pjEstimatedTax;

  return {
    grossSalary: roundCurrency(gross),
    inssDeduction: inssResult.inss,
    inssEffectiveRate: inssResult.effectiveRate,
    irrfDeduction: irrfResult.irrf,
    netSalary: roundCurrency(netSalary),
    benefitsMonthly: roundCurrency(benefits),
    totalCltNetValue: roundCurrency(totalCltNetValue),
    recommendedPjMonthlyGross: roundCurrency(recommendedPjMonthlyGross),
    pjProposed: roundCurrency(pjProposed),
    pjNet: roundCurrency(pjNet),
    pjDifference: roundCurrency(pjNet - totalCltNetValue),
  };
}

// ==========================================
// LIMITE E EXCESSO DO MEI
// ==========================================

export const MEI_ANNUAL_LIMIT_2026 = 81000;

export function calculateMeiLimitEstimate(openingMonthInput = 1, accumulatedRevenueInput = 0, projectedMonthlyInput = 0) {
  const openingMonth = clamp(openingMonthInput, 1, 12);
  const monthsActive = 12 - openingMonth + 1;
  const proportionalLimit = (MEI_ANNUAL_LIMIT_2026 / 12) * monthsActive;

  const accumulated = positiveNumber(accumulatedRevenueInput);
  const remainingMonths = 12 - (new Date().getMonth() + 1);
  const projectedMonthly = positiveNumber(projectedMonthlyInput);

  const projectedTotal = accumulated + (projectedMonthly * Math.max(1, remainingMonths));
  const usedPercentage = proportionalLimit > 0 ? (accumulated / proportionalLimit) * 100 : 0;
  const projectedUsedPercentage = proportionalLimit > 0 ? (projectedTotal / proportionalLimit) * 100 : 0;

  const remainingBalance = Math.max(0, proportionalLimit - accumulated);

  // Cenários de estouro
  const isOverLimit = projectedTotal > proportionalLimit;
  const excessAmount = Math.max(0, projectedTotal - proportionalLimit);
  const excessPercentage = proportionalLimit > 0 ? (excessAmount / proportionalLimit) * 100 : 0;

  let excessCategory: 'within_limit' | 'up_to_20' | 'above_20' = 'within_limit';
  if (isOverLimit) {
    excessCategory = excessPercentage <= 20 ? 'up_to_20' : 'above_20';
  }

  return {
    monthsActive,
    proportionalLimit: roundCurrency(proportionalLimit),
    accumulated: roundCurrency(accumulated),
    remainingBalance: roundCurrency(remainingBalance),
    usedPercentage: roundCurrency(usedPercentage),
    projectedTotal: roundCurrency(projectedTotal),
    projectedUsedPercentage: roundCurrency(projectedUsedPercentage),
    isOverLimit,
    excessAmount: roundCurrency(excessAmount),
    excessPercentage: roundCurrency(excessPercentage),
    excessCategory,
  };
}

// ==========================================
// SEGURO-DESEMPREGO (MTE 2026)
// ==========================================

export interface UnemploymentInput {
  requestTimes: 1 | 2 | 3;
  monthsWorked: number;
  averageSalary: number;
}

export function calculateUnemploymentEstimate(requestTimes: 1 | 2 | 3 = 1, monthsWorkedInput = 12, averageSalaryInput = 2500) {
  const months = clamp(monthsWorkedInput, 0, 120);
  const averageSalary = positiveNumber(averageSalaryInput);

  let eligible = false;
  let installments = 0;

  if (requestTimes === 1) {
    if (months >= 12 && months <= 23) { eligible = true; installments = 4; }
    else if (months >= 24) { eligible = true; installments = 5; }
  } else if (requestTimes === 2) {
    if (months >= 9 && months <= 11) { eligible = true; installments = 3; }
    else if (months >= 12 && months <= 23) { eligible = true; installments = 4; }
    else if (months >= 24) { eligible = true; installments = 5; }
  } else {
    if (months >= 6 && months <= 11) { eligible = true; installments = 3; }
    else if (months >= 12 && months <= 23) { eligible = true; installments = 4; }
    else if (months >= 24) { eligible = true; installments = 5; }
  }

  // Tabela de Cálculo do Valor MTE 2026
  let installmentValue = 0;
  if (averageSalary <= 2041.39) {
    installmentValue = averageSalary * 0.80;
  } else if (averageSalary <= 3402.65) {
    installmentValue = 1633.11 + ((averageSalary - 2041.39) * 0.50);
  } else {
    installmentValue = 2313.74; // Teto MTE 2026
  }

  // Garante pelo menos o salário mínimo
  installmentValue = Math.max(MINIMUM_WAGE_2026, Math.min(2313.74, installmentValue));

  const totalBenefit = eligible ? installmentValue * installments : 0;

  return {
    eligible,
    installments,
    averageSalary: roundCurrency(averageSalary),
    installmentValue: eligible ? roundCurrency(installmentValue) : 0,
    totalBenefit: roundCurrency(totalBenefit),
  };
}

// ==========================================
// FATOR R (SIMPLES NACIONAL)
// ==========================================

export function calculateFatorREstimate(rbt12Input: number, payroll12Input: number) {
  const rbt12 = positiveNumber(rbt12Input);
  const payroll12 = positiveNumber(payroll12Input);

  const fatorRRatio = rbt12 > 0 ? (payroll12 / rbt12) : 0;
  const fatorRPercentage = fatorRRatio * 100;
  const isAnexo3 = fatorRPercentage >= 28;

  const requiredPayrollFor28 = rbt12 * 0.28;
  const payrollShortfall = Math.max(0, requiredPayrollFor28 - payroll12);

  // Estimativa de alíquota inicial
  const currentRate = isAnexo3 ? 6.0 : 15.5;

  return {
    rbt12: roundCurrency(rbt12),
    payroll12: roundCurrency(payroll12),
    fatorRPercentage: roundCurrency(fatorRPercentage),
    isAnexo3,
    anexoName: isAnexo3 ? 'Anexo III (Alíquota menor ~6%)' : 'Anexo V (Alíquota maior ~15.5%)',
    currentRate,
    requiredPayrollFor28: roundCurrency(requiredPayrollFor28),
    payrollShortfall: roundCurrency(payrollShortfall),
    recommendedMonthlyProLaboreAdjustment: roundCurrency(payrollShortfall / 12),
  };
}

// ==========================================
// AMORTIZAÇÃO DE FINANCIAMENTO (SAC / PRICE)
// ==========================================

export interface AmortizationInput {
  balance: number;
  annualInterestRate: number;
  monthsRemaining: number;
  system: 'SAC' | 'PRICE';
  extraAmortization?: number;
  amortizationOption?: 'reduce_term' | 'reduce_installment';
}

export function calculateAmortizationEstimate(balanceInput: number, rateInput: number, monthsInput: number, options: Partial<AmortizationInput> = {}) {
  const balance = positiveNumber(balanceInput);
  const annualRate = positiveNumber(rateInput);
  const months = clamp(monthsInput, 1, 420);
  const system = options.system || 'SAC';
  const extraAmortization = positiveNumber(options.extraAmortization || 0);

  const monthlyRate = (annualRate / 100) / 12;

  let currentInstallment = 0;
  let totalInterestWithoutAmortization = 0;

  if (system === 'SAC') {
    const amort = balance / months;
    currentInstallment = amort + (balance * monthlyRate);
    totalInterestWithoutAmortization = ((months + 1) * balance * monthlyRate) / 2;
  } else {
    // PRICE
    if (monthlyRate > 0) {
      currentInstallment = balance * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
      totalInterestWithoutAmortization = (currentInstallment * months) - balance;
    } else {
      currentInstallment = balance / months;
    }
  }

  const newBalance = Math.max(0, balance - extraAmortization);
  let newInstallment = currentInstallment;
  let newMonths = months;

  if (extraAmortization > 0 && newBalance > 0) {
    if (options.amortizationOption === 'reduce_installment') {
      if (system === 'SAC') {
        const newAmort = newBalance / months;
        newInstallment = newAmort + (newBalance * monthlyRate);
      } else {
        if (monthlyRate > 0) {
          newInstallment = newBalance * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
        }
      }
    } else {
      // Reduzir prazo mantendo a parcela aproximada
      if (currentInstallment > 0) {
        newMonths = Math.max(1, Math.round(newBalance / (currentInstallment - (newBalance * monthlyRate))));
      }
    }
  }

  const estimatedInterestSaved = Math.max(0, totalInterestWithoutAmortization * (extraAmortization / (balance || 1)));

  return {
    balance: roundCurrency(balance),
    currentInstallment: roundCurrency(currentInstallment),
    totalInterestWithoutAmortization: roundCurrency(totalInterestWithoutAmortization),
    extraAmortization: roundCurrency(extraAmortization),
    newBalance: roundCurrency(newBalance),
    newInstallment: roundCurrency(newInstallment),
    newMonths,
    monthsSaved: Math.max(0, months - newMonths),
    estimatedInterestSaved: roundCurrency(estimatedInterestSaved),
  };
}

// ==========================================
// CÁLCULO DE RESCISÃO DE ESTÁGIO (LEI 11.788)
// ==========================================

export interface InternshipTerminationInput {
  stipend: number;
  monthsWorked: number;
  expiredRecessDays?: number;
  workedDaysInLastMonth?: number;
  dailyTransportRate?: number;
  transportDays?: number;
  terminationReason?: 'employer_initiative' | 'intern_initiative' | 'contract_expiry';
}

export function calculateInternshipTerminationEstimate(stipendInput: number, monthsWorkedInput = 6, options: Partial<InternshipTerminationInput> = {}) {
  const stipend = positiveNumber(stipendInput);
  const months = clamp(monthsWorkedInput, 1, 24);
  const expiredDays = positiveNumber(options.expiredRecessDays || 0);
  const workedDaysInLastMonth = clamp(options.workedDaysInLastMonth || 30, 1, 30);
  const dailyTransportRate = positiveNumber(options.dailyTransportRate || 0);
  const transportDays = positiveNumber(options.transportDays || 0);

  const stipendBalance = (stipend / 30) * workedDaysInLastMonth;
  const transportTotal = dailyTransportRate * transportDays;

  const proportionalRecessPay = (stipend / 12) * months;
  const proportionalRecessThird = proportionalRecessPay / 3;

  const expiredRecessPay = (stipend / 30) * expiredDays;
  const expiredRecessThird = expiredRecessPay / 3;

  const totalRecess = proportionalRecessPay + proportionalRecessThird + expiredRecessPay + expiredRecessThird;
  const totalTerminationPay = totalRecess + stipendBalance + transportTotal;

  return {
    stipend: roundCurrency(stipend),
    monthsWorked: months,
    stipendBalance: roundCurrency(stipendBalance),
    workedDaysInLastMonth,
    transportTotal: roundCurrency(transportTotal),
    proportionalRecessPay: roundCurrency(proportionalRecessPay),
    proportionalRecessThird: roundCurrency(proportionalRecessThird),
    expiredRecessPay: roundCurrency(expiredRecessPay),
    expiredRecessThird: roundCurrency(expiredRecessThird),
    totalRecess: roundCurrency(totalRecess),
    totalTerminationPay: roundCurrency(totalTerminationPay),
    hasNoticeOrFgts: false,
  };
}

// ==========================================
// PRÓ-LABORE VS DISTRIBUIÇÃO DE LUCROS
// ==========================================

export function calculateProlaboreVsLucrosEstimate(totalWithdrawalInput: number, regime: 'simples_anexo3' | 'simples_anexo5' | 'lucro_presumido' = 'simples_anexo3', otherInssPaidInput = 0) {
  const totalWithdrawal = positiveNumber(totalWithdrawalInput);
  const otherInssPaid = positiveNumber(otherInssPaidInput);

  const inssCap = Math.max(0, 897.31 - otherInssPaid);
  const inssA = Math.min(totalWithdrawal * 0.11, inssCap);
  const irrfA = calculateIrrfDeduction(totalWithdrawal, inssA, 0).irrf;

  // Se empresa for Simples Anexo V ou Lucro Presumido, pró-labore tem CPP de 20% patronal
  const cppRate = regime === 'simples_anexo5' || regime === 'lucro_presumido' ? 0.20 : 0.0;
  const cppA = totalWithdrawal * cppRate;

  const totalTaxA = inssA + irrfA + cppA;
  const netA = Math.max(0, totalWithdrawal - totalTaxA);

  const prolaboreB = Math.min(totalWithdrawal, MINIMUM_WAGE_2026);
  const lucrosB = Math.max(0, totalWithdrawal - prolaboreB);
  const inssB = Math.min(prolaboreB * 0.11, inssCap);
  const irrfB = 0;
  const cppB = prolaboreB * cppRate;
  const totalTaxB = inssB + irrfB + cppB;
  const netB = Math.max(0, totalWithdrawal - totalTaxB);

  const monthlySavings = Math.max(0, totalTaxA - totalTaxB);
  const annualSavings = monthlySavings * 12;
  const savings3Years = monthlySavings * 36;
  const savings5Years = monthlySavings * 60;
  const cdiInvestmentYield1Year = annualSavings * 1.1075; // 10.75% a.a.

  return {
    totalWithdrawal: roundCurrency(totalWithdrawal),
    taxA: roundCurrency(totalTaxA),
    netA: roundCurrency(netA),
    prolaboreB: roundCurrency(prolaboreB),
    lucrosB: roundCurrency(lucrosB),
    taxB: roundCurrency(totalTaxB),
    netB: roundCurrency(netB),
    monthlySavings: roundCurrency(monthlySavings),
    annualSavings: roundCurrency(annualSavings),
    savings3Years: roundCurrency(savings3Years),
    savings5Years: roundCurrency(savings5Years),
    cdiInvestmentYield1Year: roundCurrency(cdiInvestmentYield1Year),
  };
}

// ==========================================
// CUSTO TOTAL DO FUNCIONÁRIO PARA A EMPRESA
// ==========================================

export function calculateEmployeeCostEstimate(salaryInput: number, benefitsMonthlyInput = 0, isSimples = true, ratRateInput = 0.02, fapRateInput = 1.0, onboardingMonthlyInput = 0) {
  const salary = positiveNumber(salaryInput);
  const benefits = positiveNumber(benefitsMonthlyInput);
  const onboarding = positiveNumber(onboardingMonthlyInput);
  const rat = clamp(ratRateInput, 0.01, 0.03);
  const fap = clamp(fapRateInput, 0.5, 2.0);

  const fgtsMonthly = salary * 0.08;
  const provision13th = (salary / 12) + (fgtsMonthly / 12);
  const provisionVacation = (salary / 12) + (salary / 36) + (fgtsMonthly / 12);
  const terminationProvisionMonthly = (fgtsMonthly * 0.40) + ((salary / 12) * 0.10); // Provisão 40% FGTS + Aviso

  const effectiveRat = rat * fap;
  const employerTaxesRate = isSimples ? 0 : (0.20 + effectiveRat + 0.058); // INSS 20% + RAT*FAP + Sistema S 5.8%
  const employerTaxes = salary * employerTaxesRate;

  const totalMonthlyCost = salary + benefits + fgtsMonthly + provision13th + provisionVacation + terminationProvisionMonthly + employerTaxes + onboarding;
  const costPercentageOverSalary = salary > 0 ? ((totalMonthlyCost - salary) / salary) * 100 : 0;

  return {
    salary: roundCurrency(salary),
    benefits: roundCurrency(benefits),
    fgtsMonthly: roundCurrency(fgtsMonthly),
    provision13th: roundCurrency(provision13th),
    provisionVacation: roundCurrency(provisionVacation),
    terminationProvisionMonthly: roundCurrency(terminationProvisionMonthly),
    employerTaxes: roundCurrency(employerTaxes),
    onboardingMonthly: roundCurrency(onboarding),
    totalMonthlyCost: roundCurrency(totalMonthlyCost),
    costPercentageOverSalary: roundCurrency(costPercentageOverSalary),
  };
}

// ==========================================
// ADICIONAL NOTURNO URBANO VS RURAL
// ==========================================

export function calculateNightShiftRuralUrbanEstimate(salaryInput: number, shiftType: 'urban' | 'rural_cattle' | 'rural_farming' = 'urban', nightHoursInput = 20, overtimeRatePercentage = 0, workingDaysInMonth = 25, sundaysInMonth = 4) {
  const salary = positiveNumber(salaryInput);
  const hourlyRate = salary / 220;
  const hours = positiveNumber(nightHoursInput);

  let rate = 0.20;
  let factor = 60 / 52.5;
  let periodName = '22h às 05h (Urbano)';

  if (shiftType === 'rural_cattle') {
    rate = 0.25;
    factor = 1.0;
    periodName = '20h às 04h (Pecuária Rural)';
  } else if (shiftType === 'rural_farming') {
    rate = 0.25;
    factor = 1.0;
    periodName = '21h às 05h (Lavoura Rural)';
  }

  const computedHours = hours * factor;
  const extraOvertimeMultiplier = 1 + (overtimeRatePercentage / 100);
  const nightAditionalPay = computedHours * (hourlyRate * rate * extraOvertimeMultiplier);

  // Reflexo no DSR = (Adicional Noturno / Dias Úteis) * Dias de Descanso (Domingos/Feriados)
  const dsrReflex = workingDaysInMonth > 0 ? (nightAditionalPay / workingDaysInMonth) * sundaysInMonth : 0;
  const totalWithDsr = nightAditionalPay + dsrReflex;

  return {
    salary: roundCurrency(salary),
    hourlyRate: roundCurrency(hourlyRate),
    hours,
    computedHours: roundCurrency(computedHours),
    ratePercentage: Math.round(rate * 100),
    periodName,
    nightAditionalPay: roundCurrency(nightAditionalPay),
    dsrReflex: roundCurrency(dsrReflex),
    totalWithDsr: roundCurrency(totalWithDsr),
  };
}

// ==========================================
// SALÁRIO PROPORCIONAL
// ==========================================

export function calculateProportionalSalaryEstimate(salaryInput: number, daysWorkedInput = 15, daysInMonthInput = 30, unjustifiedAbsencesInput = 0, additionalAllowancesInput = 0) {
  const salary = positiveNumber(salaryInput);
  const additional = positiveNumber(additionalAllowancesInput);
  const totalBaseSalary = salary + additional;

  const daysWorked = clamp(daysWorkedInput, 1, 31);
  const daysInMonth = clamp(daysInMonthInput, 28, 31);
  const absences = positiveNumber(unjustifiedAbsencesInput);

  // Perda do DSR se houver falta injustificada
  const dsrLossCount = absences > 0 ? Math.ceil(absences / 6) : 0;
  const totalDiscountDays = absences + dsrLossCount;

  const netWorkedDays30 = Math.max(0, daysWorked - totalDiscountDays);
  const netWorkedDaysActual = Math.max(0, daysWorked - totalDiscountDays);

  const dailyRate30 = totalBaseSalary / 30;
  const proportional30 = dailyRate30 * netWorkedDays30;

  const dailyRateActual = totalBaseSalary / daysInMonth;
  const proportionalActual = dailyRateActual * netWorkedDaysActual;

  const absenceDiscountValue = dailyRate30 * absences;
  const dsrLossValue = dailyRate30 * dsrLossCount;

  return {
    salary: roundCurrency(salary),
    additional: roundCurrency(additional),
    totalBaseSalary: roundCurrency(totalBaseSalary),
    daysWorked,
    daysInMonth,
    absences,
    dsrLossCount,
    absenceDiscountValue: roundCurrency(absenceDiscountValue),
    dsrLossValue: roundCurrency(dsrLossValue),
    dailyRate30: roundCurrency(dailyRate30),
    proportional30: roundCurrency(proportional30),
    dailyRateActual: roundCurrency(dailyRateActual),
    proportionalActual: roundCurrency(proportionalActual),
  };
}

// ==========================================
// JUROS DE MORA & MULTA POR ATRASO
// ==========================================

export function calculateLateFeeEstimate(amountInput: number, daysLateInput = 30, finePercentageInput = 2, interestMonthlyInput = 1, legalFeesPercentageInput = 0) {
  const amount = positiveNumber(amountInput);
  const daysLate = positiveNumber(daysLateInput);
  const fineRate = positiveNumber(finePercentageInput) / 100;
  const monthlyInterestRate = positiveNumber(interestMonthlyInput) / 100;
  const legalFeesRate = positiveNumber(legalFeesPercentageInput) / 100;

  const fineAmount = amount * fineRate;
  const dailyInterestRate = monthlyInterestRate / 30;
  const interestAmount = amount * (dailyInterestRate * daysLate);

  const subtotal = amount + fineAmount + interestAmount;
  const legalFeesAmount = subtotal * legalFeesRate;
  const totalUpdated = subtotal + legalFeesAmount;

  // Projeções temporais (30, 60, 90, 180, 360 dias)
  const proj30 = amount + (amount * fineRate) + (amount * (dailyInterestRate * 30));
  const proj90 = amount + (amount * fineRate) + (amount * (dailyInterestRate * 90));
  const proj180 = amount + (amount * fineRate) + (amount * (dailyInterestRate * 180));
  const proj360 = amount + (amount * fineRate) + (amount * (dailyInterestRate * 360));

  return {
    amount: roundCurrency(amount),
    daysLate,
    fineAmount: roundCurrency(fineAmount),
    interestAmount: roundCurrency(interestAmount),
    legalFeesAmount: roundCurrency(legalFeesAmount),
    totalUpdated: roundCurrency(totalUpdated),
    proj30: roundCurrency(proj30),
    proj90: roundCurrency(proj90),
    proj180: roundCurrency(proj180),
    proj360: roundCurrency(proj360),
  };
}

// ==========================================
// PENSÃO ALIMENTÍCIA ESTIMADA
// ==========================================

export function calculateChildSupportEstimate(grossSalaryInput: number, dependentsInput = 1, pensionPercentageInput = 20, extraExpensesInput = 0, motherGrossSalaryInput = 0) {
  const gross = positiveNumber(grossSalaryInput);
  const motherGross = positiveNumber(motherGrossSalaryInput);
  const dependents = clamp(dependentsInput, 0, 10);
  const percentage = clamp(pensionPercentageInput, 5, 50);
  const extraExpenses = positiveNumber(extraExpensesInput);

  const inss = calculateInssDeduction(gross).inss;
  const irrf = calculateIrrfDeduction(gross, inss, dependents).irrf;

  const netBase = Math.max(0, gross - inss - irrf);
  const monthlyPension = (netBase * (percentage / 100)) + extraExpenses;
  const percentageOfGross = gross > 0 ? (monthlyPension / gross) * 100 : 0;

  // Incidência sobre 13º Salário e Férias (13 meses de pensão + 1/3 sobre férias)
  const annualTotalPension = (monthlyPension * 13) + (monthlyPension / 3);

  // Proporção de renda entre pai e mãe
  const combinedGross = gross + motherGross;
  const fatherSharePercentage = combinedGross > 0 ? (gross / combinedGross) * 100 : 100;
  const motherSharePercentage = combinedGross > 0 ? (motherGross / combinedGross) * 100 : 0;

  return {
    grossSalary: roundCurrency(gross),
    motherGrossSalary: roundCurrency(motherGross),
    fatherSharePercentage: roundCurrency(fatherSharePercentage),
    motherSharePercentage: roundCurrency(motherSharePercentage),
    inssDeduction: roundCurrency(inss),
    irrfDeduction: roundCurrency(irrf),
    netBase: roundCurrency(netBase),
    pensionPercentage: percentage,
    extraExpenses: roundCurrency(extraExpenses),
    pensionValue: roundCurrency(monthlyPension),
    annualTotalPension: roundCurrency(annualTotalPension),
    percentageOfGross: roundCurrency(percentageOfGross),
  };
}



