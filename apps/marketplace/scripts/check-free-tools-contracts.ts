import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateTerminationEstimate,
  calculateVacationEstimate,
  evaluateRetirement2026,
} from '../src/lib/freeToolsCalculations';
import {
  BPC_INCOME_LIMIT_2026,
  MINIMUM_WAGE_2026,
  calculateThirteenthSalary,
  evaluateBpcScreening,
  evaluateInssBenefitScreening,
} from '../src/lib/freeToolsAdditionalCalculations';
import { matchRoute } from '../src/routing/routeMatcher';

const closeTo = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} deve ser aproximadamente ${expected}`);
const read = (path: string) => readFileSync(path, 'utf8');
const contains = (path: string, expressions: RegExp[]) => {
  const content = read(path);
  for (const expression of expressions) assert.match(content, expression, `${path}: contrato ausente: ${expression}`);
};

const termination = calculateTerminationEstimate({
  salary: 3000,
  reason: 'without_cause',
  daysWorked: 15,
  thirteenthMonths: 6,
  vacationMonths: 6,
  expiredVacation: false,
  completedYears: 2,
  fgtsBalance: 10000,
});
closeTo(termination.salaryBalance, 1500);
closeTo(termination.notice, 3600);
closeTo(termination.thirteenthValue, 1500);
closeTo(termination.proportionalVacation, 2000);
closeTo(termination.fgtsPenalty, 4000);
closeTo(termination.total, 12600);

const agreement = calculateTerminationEstimate({
  salary: 3000,
  reason: 'agreement',
  daysWorked: 15,
  thirteenthMonths: 6,
  vacationMonths: 6,
  expiredVacation: false,
  completedYears: 2,
  fgtsBalance: 10000,
});
closeTo(agreement.notice, 1800);
closeTo(agreement.fgtsPenalty, 2000);

assert.equal(evaluateRetirement2026({ gender: 'woman', age: 60, contributionYears: 33, contributedBeforeReform: true }).pointsEligible, true);
assert.equal(evaluateRetirement2026({ gender: 'woman', age: 60, contributionYears: 33, contributedBeforeReform: true }).progressiveEligible, true);
assert.equal(evaluateRetirement2026({ gender: 'man', age: 65, contributionYears: 19, contributedBeforeReform: false }).generalEligible, false);
assert.equal(evaluateRetirement2026({ gender: 'man', age: 65, contributionYears: 20, contributedBeforeReform: false }).generalEligible, true);

const vacation = calculateVacationEstimate(3000, 300);
closeTo(vacation.remuneration, 3300);
closeTo(vacation.constitutionalThird, 1100);
closeTo(vacation.total, 4400);

const thirteenth = calculateThirteenthSalary({ salary: 3600, eligibleMonths: 6 });
closeTo(thirteenth.grossValue, 1800);
closeTo(thirteenth.referenceFirstInstallment, 900);
closeTo(thirteenth.secondInstallmentBeforeDeductions, 900);

const thirteenthWithDeductions = calculateThirteenthSalary({
  salary: 3000,
  variableAverage: 600,
  eligibleMonths: 12,
  firstInstallmentPaid: 1800,
  inssDeduction: 300,
  incomeTaxDeduction: 100,
});
closeTo(thirteenthWithDeductions.grossValue, 3600);
closeTo(thirteenthWithDeductions.secondInstallmentNet, 1402.24);

assert.equal(MINIMUM_WAGE_2026, 1621);
closeTo(BPC_INCOME_LIMIT_2026, 405.25);
const bpc = evaluateBpcScreening({
  applicantType: 'elderly',
  age: 67,
  familyGrossIncome: 1200,
  familyMembers: 4,
  cadUnicoUpdated: true,
  allFamilyCpfRegistered: true,
  receivesIncompatibleBenefit: false,
  biometricRegistered: true,
});
closeTo(bpc.netIncomePerPerson, 300);
assert.equal(bpc.incomeWithinObjectiveLimit, true);
assert.equal(bpc.allObjectiveCriteriaMet, true);

const incapacity = evaluateInssBenefitScreening({
  benefitType: 'temporary_incapacity',
  hasInsuredStatus: true,
  contributionMonths: 12,
  incapacityDays: 20,
  hasMedicalEvidence: true,
});
assert.equal(incapacity.allMet, true);

const maternity = evaluateInssBenefitScreening({
  benefitType: 'maternity',
  hasInsuredStatus: true,
  maternityEventDocumented: true,
});
assert.equal(maternity.allMet, true);
assert.match(maternity.requirements[2].detail, /Dispensa de carência/i);

const pension = evaluateInssBenefitScreening({
  benefitType: 'death_pension',
  hasInsuredStatus: false,
  deceasedHadCoverage: true,
  isEligibleDependent: true,
  hasDependencyEvidence: true,
});
assert.equal(pension.allMet, true);

const accidentAssistance = evaluateInssBenefitScreening({
  benefitType: 'accident_assistance',
  hasInsuredStatus: true,
  accidentCategoryEligible: true,
  hasPermanentSequela: true,
  capacityReduced: true,
});
assert.equal(accidentAssistance.allMet, true);

const route = matchRoute('/servicos-gratuitos', '', '');
assert.equal(route.area, 'public');
assert.equal(route.module, 'free-tools');

contains('src/components/public/FreeToolsPage.tsx', [
  /FreeToolsTieredCalculatorDialog/,
  /Free simples · Pro avançado/i,
  /pagamento e voucher Pro também podem ser usados sem cadastro/i,
  /não são armazenados pela GSA/i,
  /As seis ferramentas já estão disponíveis/i,
  /id: 'thirteenth'.*available: true/,
  /id: 'benefits'.*available: true/,
  /id: 'bpc'.*available: true/,
]);

contains('src/components/public/FreeToolsTieredCalculatorDialog.tsx', [
  /FreeToolsSimpleCalculator/,
  /FreeToolsAdvancedCalculator/,
  /FreeToolsProUnlockDialog/,
  /FreeToolsProEligibilityDialog/,
  /freeToolsProAccess\.activate/,
  /readInfinitePayReturn/,
  /result: 'promotion'/,
  /Não foi possível consultar agora o preço/,
  /Calculadora de 13º salário/,
  /Triagem de benefícios do INSS/,
  /Triagem BPC \/ LOAS/,
]);

contains('src/components/public/FreeToolsSimpleCalculators.tsx', [
  /Modo Free · consulta básica/i,
  /Regra geral/i,
  /Saldo de salário estimado/i,
  /ThirteenthFree/,
  /BenefitsFree/,
  /BpcFree/,
]);

contains('src/components/public/FreeToolsAdvancedCalculators.tsx', [
  /Modo Pro · cálculo avançado/i,
  /Conferir extrato CNIS no Meu INSS/i,
  /Memória detalhada de verbas/i,
  /ThirteenthPro/,
  /BenefitsPro/,
  /BpcPro/,
]);

contains('src/components/public/FreeToolsAdditionalCalculators.tsx', [
  /Estimativa simples dos valores brutos do 13º salário/,
  /Triagem de benefícios do INSS/,
  /Triagem BPC \/ LOAS/,
  /BENEFIT_OPTIONS/,
  /BPC_INCOME_LIMIT_2026/,
]);

contains('src/lib/freeToolsAdditionalCalculations.ts', [
  /MINIMUM_WAGE_2026 = 1621/,
  /BPC_INCOME_LIMIT_2026/,
  /calculateThirteenthSalary/,
  /evaluateInssBenefitScreening/,
  /evaluateBpcScreening/,
]);

contains('src/components/public/FreeToolsProUnlockDialog.tsx', [
  /Pagar e desbloquear agora/i,
  /Voucher de uso único/i,
  /não exige cadastro/i,
  /cadastro ativo e pelo menos uma fatura paga/i,
  /Pagamento online indisponível/i,
  /13º salário Pro/,
  /Benefícios do INSS Pro/,
  /BPC \/ LOAS Pro/,
]);

contains('src/components/public/FreeToolsProEligibilityDialog.tsx', [
  /Promoção de acesso gratuito/i,
  /Cadastro ativo/i,
  /Pelo menos uma fatura paga/i,
  /qualquer pessoa pode utilizar/i,
  /13º salário Pro/,
]);

contains('src/lib/freeToolsProAccess.ts', [
  /gsa-free-tools/,
  /gsa_free_tools_visitor_token/,
  /client_has_paid_invoice/,
  /checkout_available/,
  /verify_payment/,
  /'thirteenth'.*'benefits'.*'bpc'/,
]);

contains('supabase/functions/gsa-free-tools/index.ts', [
  /https:\/\/api\.checkout\.infinitepay\.io\/links/,
  /https:\/\/api\.checkout\.infinitepay\.io\/payment_check/,
  /client_paid_invoice/,
  /client_has_paid_invoice/,
  /free_period/,
  /src = \['payment', 'voucher'\]/,
  /gsa_calculator_redeem_voucher_and_create_session_internal/,
  /create_checkout/,
  /verify_payment/,
  /'thirteenth'.*'benefits'.*'bpc'/,
]);

contains('supabase/migrations/20260723233000_free_tools_pro_access.sql', [
  /gsa_calculator_pro_products/,
  /gsa_calculator_pro_payments/,
  /gsa_calculator_pro_vouchers/,
  /gsa_calculator_pro_grants/,
  /gsa_calculator_pro_sessions/,
  /gsa_admin_calculator_pro_snapshot/,
  /gsa_admin_create_calculator_pro_voucher/,
  /gsa_calculator_finalize_payment_internal/,
]);

contains('supabase/migrations/20260724113000_simplify_calculator_pro_eligibility_and_public_promotions.sql', [
  /cadastro ativo \+ pelo menos uma fatura paga/i,
  /DELETE FROM public\.gsa_calculator_pro_grants[\s\S]*source = 'manual'/,
  /DROP FUNCTION IF EXISTS public\.gsa_admin_grant_calculator_pro/,
  /liberar_cliente_com_fatura_paga = true/,
]);

contains('supabase/migrations/20260724163000_harden_calculator_pro_voucher_payment.sql', [
  /gsa_calculator_pro_runtime_config/,
  /duracao_acesso_minutos/,
  /idx_gsa_calculator_pro_transaction_unique/,
  /gsa_admin_save_calculator_pro_runtime_config/,
]);

contains('supabase/migrations/20260724163500_atomic_calculator_pro_voucher_redemption.sql', [
  /gsa_calculator_redeem_voucher_and_create_session_internal/,
  /INSERT INTO public\.gsa_calculator_pro_sessions/,
  /used_count/,
]);

contains('supabase/migrations/20260724193000_enable_remaining_free_tools.sql', [
  /'thirteenth', '13º salário Pro'/,
  /'benefits', 'Benefícios do INSS Pro'/,
  /'bpc', 'BPC \/ LOAS Pro'/,
  /gsa_admin_ensure_calculator_pro_products/,
  /gsa_calculator_redeem_voucher_and_create_session_internal/,
]);

contains('src/components/admin/CalculatorProAdminPanel.tsx', [
  /Calculadoras Pro/,
  /Preço do acesso/,
  /Gerar voucher/,
  /Promoções/,
  /Não existe liberação individual pelo administrador/i,
  /Pagamentos InfinitePay/,
  /FT-04/,
  /FT-05/,
  /FT-06/,
  /seis configurações obrigatórias/,
]);

contains('src/components/admin/CalculatorProPaymentConfiguration.tsx', [
  /InfiniteTag da conta/,
  /gsa_admin_save_calculator_pro_runtime_config/,
  /Checkout habilitado/,
]);

console.log('Contratos das seis Calculadoras Free e Pro, vouchers, elegibilidade e InfinitePay validados com sucesso.');
