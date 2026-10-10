import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260829133000_credit_available_withdrawals.sql'), 'utf8');
const clientModal = fs.readFileSync(path.join(root, 'src/components/client/CreditWithdrawalModal.tsx'), 'utf8');
const adminPanel = fs.readFileSync(path.join(root, 'src/components/admin/super-domains/financeiro/CreditWithdrawalsAdminPanel.tsx'), 'utf8');

describe('Saque do Crédito GSA', () => {
  it('mantém 30 dias e R$ 100 como critérios de análise, não como bloqueio absoluto', () => {
    expect(migration).toContain("criterio_cadastro_30d_ok");
    expect(migration).toContain("criterio_credito_100_ok");
    expect(migration).toContain("'analise_reforcada'");
    expect(migration).toContain("'pode_solicitar',v_eff>0");
  });

  it('reserva saque mais taxa no crédito durante a análise', () => {
    expect(migration).toContain("valor_bloqueado");
    expect(migration).toContain("limite_credito_bloqueado=round(COALESCE(limite_credito_bloqueado,0)+v_total,2)");
    expect(migration).toContain("O valor do saque somado à taxa ultrapassa o crédito disponível.");
  });
  it('exige documento com foto e comprovante de endereço antes da decisão', () => {
    expect(migration).toContain("documento_foto");
    expect(migration).toContain("comprovante_endereco");
    expect(migration).toContain("now()+interval '72 hours'");
    expect(migration).toContain("Os documentos obrigatórios ainda não foram enviados.");
  });

  it('separa aprovação da confirmação financeira do PIX', () => {
    expect(migration).toContain("status='aprovado'");
    expect(migration).toContain("gsa_admin_mark_credit_withdrawal_paid");
    expect(migration).toContain("O saque precisa estar aprovado antes da confirmação do PIX.");
    expect(adminPanel).toContain('Confirmar PIX pago e gerar fatura');
  });

  it('gera fatura única de saque mais taxa com vencimento em 30 dias', () => {
    expect(migration).toContain("current_date+30");
    expect(migration).toContain("'taxa_saque'");
    expect(migration).toContain("v_req.valor_total_fatura");
    expect(clientModal).toContain('Total da fatura');
    expect(clientModal).toContain('Vencimento: 30 dias');
  });

  it('exibe a taxa antes da solicitação e informa análise minuciosa sem usar linguagem de administrador', () => {
    expect(clientModal).toContain('Taxa de saque');
    expect(clientModal).toContain('análise minuciosa do sistema');
    expect(clientModal.toLowerCase()).not.toContain('administrador');
    expect(clientModal.toLowerCase()).not.toContain('administrativa');
  });
});
