import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const api = read('supabase/functions/gsa-free-tools/index.ts');
const hardening = read('supabase/migrations/20260724163000_harden_calculator_pro_voucher_payment.sql');
const atomicVoucher = read('supabase/migrations/20260724163500_atomic_calculator_pro_voucher_redemption.sql');
const unlockDialog = read('src/components/public/FreeToolsProUnlockDialog.tsx');
const paymentConfig = read('src/components/admin/CalculatorProPaymentConfiguration.tsx');
const accessClient = read('src/lib/freeToolsProAccess.ts');

assert.match(api, /checkout_available/);
assert.match(accessClient, /checkout_available\?: boolean/);
assert.match(api, /gsa_calculator_redeem_voucher_and_create_session_internal/);
assert.doesNotMatch(api, /gsa_calculator_redeem_voucher_internal/);
assert.match(api, /CHECKOUT_RATE_LIMIT_MAX/);
assert.match(api, /VOUCHER_RATE_LIMIT_MAX/);
assert.match(api, /Number\(result\.amount \|\| 0\) !== Number\(payment\.valor_centavos \|\| 0\)/);
assert.match(api, /duracao_acesso_minutos: durationMinutes/);
assert.match(api, /visitor_token_hash: client\?\.id \? null : visitorHash/);
assert.match(api, /!payment\.cliente_id && payment\.visitor_token_hash/);

assert.match(api, /async function handleWebhook\(/);
assert.match(api, /if \(body\.order_nsu && !body\.action\) return handleWebhook\(/);
assert.match(api, /Number\(verification\.amount \|\| 0\) !== Number\(payment\.valor_centavos \|\| 0\)/);
assert.match(api, /const webhookUrl = `\$\{supabaseUrl\}\/functions\/v1\/gsa-free-tools`/);
assert.doesNotMatch(api, /EdgeRuntime/);
assert.doesNotMatch(api, /waitUntil/);

assert.match(hardening, /ADD COLUMN IF NOT EXISTS duracao_acesso_minutos/);
assert.match(hardening, /idx_gsa_calculator_pro_transaction_unique/);
assert.match(hardening, /gsa_calculator_pro_runtime_config/);
assert.match(hardening, /gen_random_bytes\(10\)/);
assert.match(hardening, /v_payment\.duracao_acesso_minutos/);
assert.match(hardening, /gsa_admin_save_calculator_pro_runtime_config/);

assert.match(atomicVoucher, /gsa_calculator_redeem_voucher_and_create_session_internal/);
assert.match(atomicVoucher, /FOR UPDATE/);
assert.match(atomicVoucher, /used_count/);
assert.match(atomicVoucher, /INSERT INTO public\.gsa_calculator_pro_sessions/);
assert.match(atomicVoucher, /GRANT EXECUTE[\s\S]*TO service_role/);

assert.match(unlockDialog, /Pagamento online indisponível/);
assert.match(unlockDialog, /checkoutAvailable/);
assert.match(unlockDialog, /disabled=\{loading !== null \|\| !checkoutAvailable\}/);
assert.doesNotMatch(unlockDialog, /preco_centavos \|\| 0\) \/ 100/);

assert.match(paymentConfig, /InfiniteTag da conta/);
assert.match(paymentConfig, /gsa_admin_save_calculator_pro_runtime_config/);
assert.match(paymentConfig, /Checkout habilitado/);

console.log('Contratos de segurança, atomicidade e configuração do voucher/pagamento Pro validados no endpoint consolidado gsa-free-tools.');
