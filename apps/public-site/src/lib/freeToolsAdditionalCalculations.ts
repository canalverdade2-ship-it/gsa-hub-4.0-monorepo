import {
  calculateInssDeduction,
  calculateIrrfDeduction,
} from './freeToolsCalculations';

export const MINIMUM_WAGE_2026 = 1621;
export const BPC_INCOME_LIMIT_2026 = MINIMUM_WAGE_2026 / 4; // R$ 405.25
export const BPC_JUDICIAL_INCOME_LIMIT_2026 = MINIMUM_WAGE_2026 / 2; // R$ 810.50

function positive(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, positive(value)));
}

function roundCurrency(val: number): number {
  return Math.round(positive(val) * 100) / 100;
}

// ==========================================
// 13º SALÁRIO (COM TRIBUTOS 2026 E DEPENDENTES)
// ==========================================

export interface ThirteenthSalaryInput {
  salary: number;
  variableAverage?: number;
  eligibleMonths: number;
  firstInstallmentPaid?: number;
  dependents?: number;
  unexcusedAbsencesInMonth?: boolean;
}

export function calculateThirteenthSalary(input: ThirteenthSalaryInput) {
  const baseRemuneration = positive(input.salary) + positive(input.variableAverage || 0);
  const eligibleMonths = Math.round(clamp(input.eligibleMonths, 0, 12));
  const grossValue = (baseRemuneration / 12) * eligibleMonths;

  // 1ª Parcela (50% da remuneração sem qualquer desconto)
  const referenceFirstInstallment = grossValue / 2;
  const firstInstallmentPaid = Math.min(grossValue, positive(input.firstInstallmentPaid ?? referenceFirstInstallment));

  // 2ª Parcela (Valor bruto integral - 1ª Parcela paga - INSS - IRRF)
  const secondInstallmentBeforeDeductions = Math.max(0, grossValue - firstInstallmentPaid);

  // Cálculo automático de Tributos 2026 sobre o valor bruto integral do 13º
  const inssDeduction = calculateInssDeduction(grossValue).inss;
  const irrfDeduction = calculateIrrfDeduction(grossValue, inssDeduction, input.dependents || 0).irrf;

  const totalDeductions = inssDeduction + irrfDeduction;
  const secondInstallmentNet = Math.max(0, secondInstallmentBeforeDeductions - totalDeductions);
  const estimatedTotalNet = firstInstallmentPaid + secondInstallmentNet;

  return {
    baseRemuneration: roundCurrency(baseRemuneration),
    eligibleMonths,
    grossValue: roundCurrency(grossValue),
    referenceFirstInstallment: roundCurrency(referenceFirstInstallment),
    firstInstallmentPaid: roundCurrency(firstInstallmentPaid),
    secondInstallmentBeforeDeductions: roundCurrency(secondInstallmentBeforeDeductions),
    inssDeduction: roundCurrency(inssDeduction),
    irrfDeduction: roundCurrency(irrfDeduction),
    totalDeductions: roundCurrency(totalDeductions),
    secondInstallmentNet: roundCurrency(secondInstallmentNet),
    estimatedTotalNet: roundCurrency(estimatedTotalNet),
  };
}

// ==========================================
// TRIAGEM DE BENEFÍCIOS DO INSS + RMI & PERÍODO DE GRAÇA
// ==========================================

export type InssBenefitType = 'temporary_incapacity' | 'maternity' | 'death_pension' | 'accident_assistance';

export interface InssBenefitScreeningInput {
  benefitType: InssBenefitType;
  hasInsuredStatus: boolean;
  contributionMonths?: number;
  incapacityDays?: number;
  carencyExempt?: boolean;
  hasMedicalEvidence?: boolean;
  maternityEventDocumented?: boolean;
  deceasedHadCoverage?: boolean;
  isEligibleDependent?: boolean;
  hasDependencyEvidence?: boolean;
  accidentCategoryEligible?: boolean;
  hasPermanentSequela?: boolean;
  capacityReduced?: boolean;
  averageContributionSalary?: number; // Média salarial contributiva
  dependentCountForPension?: number; // Número de dependentes para pensão por morte
  unvoluntaryUnemployment?: boolean; // Desemprego involuntário comprovado
}

export interface ScreeningRequirement {
  label: string;
  met: boolean;
  detail: string;
}

const BENEFIT_DOCUMENTS: Record<InssBenefitType, string[]> = {
  temporary_incapacity: [
    'Documento de identificação e CPF',
    'Atestado, laudo ou relatório médico legível com CID',
    'Data de início do afastamento e tempo estimado de recuperação',
    'Carteira de trabalho ou comprovantes de contribuição quando solicitados',
  ],
  maternity: [
    'Documento de identificação e CPF',
    'Certidão de nascimento da criança ou documento de adoção/guarda',
    'Atestado médico em caso de afastamento pré-parto',
    'Comprovantes de atividade rural ou contribuinte individual, se aplicável',
  ],
  death_pension: [
    'Certidão de óbito do segurado falecido',
    'Documentos de identificação e CPF do falecido e dos dependentes',
    'Certidão de casamento, união estável ou certidão de nascimento dos filhos',
    'Comprovantes de dependência econômica quando exigidos por lei',
  ],
  accident_assistance: [
    'Documento de identificação e CPF',
    'Laudos médicos, exames e relatórios da consolidação da lesão/sequela',
    'Comunicação de Acidente de Trabalho (CAT), quando existente',
    'Documentos da atividade profissional exercida na época do acidente',
  ],
};

export function evaluateInssBenefitScreening(input: InssBenefitScreeningInput) {
  const requirements: ScreeningRequirement[] = [];
  const contributions = Math.round(clamp(input.contributionMonths || 0, 0, 600));
  const baseSalary = positive(input.averageContributionSalary || MINIMUM_WAGE_2026);

  // Cálculo de RMI (Renda Mensal Inicial Estimada)
  let estimatedRmi = 0;
  let rmiExplanation = '';

  if (input.benefitType === 'temporary_incapacity') {
    estimatedRmi = roundCurrency(baseSalary * 0.91);
    rmiExplanation = 'Auxílio-doença: 91% do salário de benefício médio.';
  } else if (input.benefitType === 'maternity') {
    estimatedRmi = roundCurrency(baseSalary);
    rmiExplanation = 'Salário-maternidade: 100% da média das últimas contribuições / salário integral.';
  } else if (input.benefitType === 'death_pension') {
    const deps = clamp(input.dependentCountForPension || 1, 1, 5);
    const pensionRate = Math.min(1.00, 0.50 + (deps * 0.10));
    estimatedRmi = roundCurrency(baseSalary * pensionRate);
    rmiExplanation = `Pensão por Morte: 50% cota familiar + ${deps * 10}% (${deps} dependente(s)). Total: ${Math.round(pensionRate * 100)}%.`;
  } else if (input.benefitType === 'accident_assistance') {
    estimatedRmi = roundCurrency(baseSalary * 0.50);
    rmiExplanation = 'Auxílio-acidente: 50% do salário de benefício (indenizatório).';
  }

  // Cálculo do Período de Graça
  let gracePeriodMonths = 12; // Regra geral
  if (contributions >= 120) gracePeriodMonths += 12; // Mais de 10 anos sem perda da qualidade
  if (input.unvoluntaryUnemployment) gracePeriodMonths += 12; // Desemprego involuntário comprovado

  if (input.benefitType === 'temporary_incapacity') {
    requirements.push(
      { label: 'Qualidade de segurado', met: input.hasInsuredStatus, detail: 'É necessário estar coberto pelo INSS ou dentro do período de graça.' },
      { label: 'Incapacidade por mais de 15 dias', met: positive(input.incapacityDays || 0) > 15, detail: 'A incapacidade temporária precisa impedir o trabalho habitual por mais de 15 dias.' },
      { label: 'Carência ou hipótese de isenção', met: Boolean(input.carencyExempt) || contributions >= 12, detail: 'São exigidas 12 contribuições, salvo em acidentes ou doenças graves previstas em lei.' },
      { label: 'Prova médica documental', met: Boolean(input.hasMedicalEvidence), detail: 'Laudos e atestados legíveis com CID devem ser submetidos ao INSS.' },
    );
  }

  if (input.benefitType === 'maternity') {
    requirements.push(
      { label: 'Qualidade de segurado na data do fato', met: input.hasInsuredStatus, detail: 'A qualidade de segurado deve existir na data do parto, adoção ou evento.' },
      { label: 'Evento comprovado por documento', met: Boolean(input.maternityEventDocumented), detail: 'Certidão de nascimento, termo de guarda ou adoção devidamente emitido.' },
      { label: 'Carência', met: true, detail: 'Dispensa de carência mantida para empregadas, avulsas e domésticas.' },
    );
  }

  if (input.benefitType === 'death_pension') {
    requirements.push(
      { label: 'Cobertura do segurado falecido', met: Boolean(input.deceasedHadCoverage), detail: 'O falecido devia ter qualidade de segurado ou direito adquirido na data do óbito.' },
      { label: 'Dependente previsto em lei', met: Boolean(input.isEligibleDependent), detail: 'Cônjuge/companheiro, filho menor de 21 anos ou inválido, pais ou irmãos comprovados.' },
      { label: 'Prova da dependência e união', met: Boolean(input.hasDependencyEvidence), detail: 'Documentos oficiais demonstrando a união estável ou dependência econômica.' },
    );
  }

  if (input.benefitType === 'accident_assistance') {
    requirements.push(
      { label: 'Qualidade de segurado na data do acidente', met: input.hasInsuredStatus, detail: 'A cobertura previdenciária deve existir no momento do acidente.' },
      { label: 'Categoria abrangida', met: Boolean(input.accidentCategoryEligible), detail: 'Atende empregado, doméstico, trabalhador avulso e segurado especial.' },
      { label: 'Sequela permanente consolidada', met: Boolean(input.hasPermanentSequela), detail: 'A lesão deve estar cicatrizada e deixar limitação definitiva.' },
      { label: 'Redução da capacidade funcional', met: Boolean(input.capacityReduced), detail: 'A sequela deve reduzir a capacidade para o trabalho habitual.' },
    );
  }

  const metCount = requirements.filter((requirement) => requirement.met).length;
  const missing = requirements.filter((requirement) => !requirement.met);
  const allMet = requirements.length > 0 && missing.length === 0;
  const status = allMet ? 'possible' : metCount >= Math.ceil(requirements.length / 2) ? 'attention' : 'not_indicated';

  return {
    benefitType: input.benefitType,
    requirements,
    missing,
    metCount,
    totalRequirements: requirements.length,
    allMet,
    status,
    documents: BENEFIT_DOCUMENTS[input.benefitType],
    estimatedRmi,
    rmiExplanation,
    gracePeriodMonths,
  };
}

// ==========================================
// TRIAGEM BPC / LOAS + DEDUÇÃO DE DESPESAS DE SAÚDE
// ==========================================

export type BpcApplicantType = 'elderly' | 'disabled';

export interface BpcScreeningInput {
  applicantType: BpcApplicantType;
  age: number;
  familyGrossIncome: number;
  familyMembers: number;
  healthMedicalExpenses?: number; // Gastos com remédios, fraldas e cuidados médicos comprovados
  longTermImpairment?: boolean;
  cadUnicoUpdated?: boolean;
  allFamilyCpfRegistered?: boolean;
  receivesIncompatibleBenefit?: boolean;
  biometricRegistered?: boolean;
}

export function evaluateBpcScreening(input: BpcScreeningInput) {
  const age = clamp(input.age, 0, 120);
  const familyMembers = Math.max(1, Math.round(clamp(input.familyMembers, 1, 30)));
  const familyGrossIncome = positive(input.familyGrossIncome);
  const healthExpenses = positive(input.healthMedicalExpenses || 0);

  // Renda familiar líquida após dedução de gastos comprovados de saúde/cuidados
  const netFamilyIncome = Math.max(0, familyGrossIncome - healthExpenses);

  const rawIncomePerPerson = familyGrossIncome / familyMembers;
  const netIncomePerPerson = netFamilyIncome / familyMembers;

  const incomeWithinObjectiveLimit = netIncomePerPerson <= BPC_INCOME_LIMIT_2026;
  const incomeWithinJudicialLimit = netIncomePerPerson <= BPC_JUDICIAL_INCOME_LIMIT_2026;

  const profileMet = input.applicantType === 'elderly'
    ? age >= 65
    : Boolean(input.longTermImpairment);

  const cadUnicoReady = Boolean(input.cadUnicoUpdated && input.allFamilyCpfRegistered);
  const noIncompatibleBenefit = !input.receivesIncompatibleBenefit;
  const biometricReady = Boolean(input.biometricRegistered);

  const allObjectiveCriteriaMet = profileMet
    && incomeWithinObjectiveLimit
    && cadUnicoReady
    && noIncompatibleBenefit
    && biometricReady;

  const requirements: ScreeningRequirement[] = [
    {
      label: input.applicantType === 'elderly' ? 'Idade mínima de 65 anos' : 'Impedimento de longo prazo (mín. 2 anos)',
      met: profileMet,
      detail: input.applicantType === 'elderly'
        ? 'A modalidade da pessoa idosa exige 65 anos de idade ou mais.'
        : 'A modalidade da pessoa com deficiência exige impedimento físico, mental ou sensorial por pelo menos 2 anos, sujeito a avaliação médica e social.',
    },
    {
      label: 'Renda per capita ajustada (após descontos de saúde)',
      met: incomeWithinObjectiveLimit,
      detail: `Renda líquida familiar de R$ ${netIncomePerPerson.toFixed(2).replace('.', ',')} por pessoa. O limite administrativo objetivo é R$ ${BPC_INCOME_LIMIT_2026.toFixed(2).replace('.', ',')} (1/4 salário mínimo em 2026).`,
    },
    {
      label: 'CadÚnico atualizado e CPF de todos',
      met: cadUnicoReady,
      detail: 'O Cadastro Único deve estar atualizado há menos de 24 meses contendo o CPF de cada morador da residência.',
    },
    {
      label: 'Ausência de outro benefício previdenciário',
      met: noIncompatibleBenefit,
      detail: 'O BPC não pode ser acumulado com seguro-desemprego, aposentadoria ou pensão do INSS.',
    },
    {
      label: 'Identificação biométrica registrada',
      met: biometricReady,
      detail: 'Cadastro biográfico e biométrico no TSE/Gov.br ou órgãos de identificação oficial.',
    },
  ];

  return {
    applicantType: input.applicantType,
    age,
    familyMembers,
    familyGrossIncome: roundCurrency(familyGrossIncome),
    healthExpenses: roundCurrency(healthExpenses),
    netFamilyIncome: roundCurrency(netFamilyIncome),
    rawIncomePerPerson: roundCurrency(rawIncomePerPerson),
    netIncomePerPerson: roundCurrency(netIncomePerPerson),
    incomeLimit: BPC_INCOME_LIMIT_2026,
    judicialIncomeLimit: BPC_JUDICIAL_INCOME_LIMIT_2026,
    benefitReferenceValue: MINIMUM_WAGE_2026,
    profileMet,
    incomeWithinObjectiveLimit,
    incomeWithinJudicialLimit,
    cadUnicoReady,
    noIncompatibleBenefit,
    biometricReady,
    allObjectiveCriteriaMet,
    requirements,
    missing: requirements.filter((requirement) => !requirement.met),
  };
}
