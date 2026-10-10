import React, { useCallback, useEffect, useState } from 'react';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import {
  Building2,
  Wallet,
  Calculator,
  Users,
  MessageSquare,
  Layout,
  LockKeyhole,
  Save,
  Plus,
  RefreshCw,
  Send,
  Bell,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Sparkles,
  Edit2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { maskCNPJ, maskPhone } from '../../../../lib/utils';
import { sendAdminWhatsAppNotification } from '../../../../utils/n8nWhatsApp';
import { CalculatorProAdminPanel } from '../../CalculatorProAdminPanel';
import { CalculatorProPaymentConfiguration } from '../../CalculatorProPaymentConfiguration';
import { TacticalDataGrid, CommandSlideOver, StatusBadge, GridColumn } from '../shared';
import { CompanyData, PaymentMethodItem, SettingsSnapshot } from './types';

type ConfigSubTab =
  | 'empresa'
  | 'financeiro'
  | 'formas_pagamento'
  | 'calculadoras'
  | 'indicacao'
  | 'whatsapp'
  | 'portal'
  | 'seguranca';

export function GovernancaConfiguracoesView() {
  const [activeTab, setActiveTab] = useState<ConfigSubTab>('empresa');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTestAlert, setSendingTestAlert] = useState(false);

  const [company, setCompany] = useState<CompanyData>({
    razao_social: '',
    cnpj: '',
    telefone: '',
    responsavel: '',
  });
  const [methods, setMethods] = useState<PaymentMethodItem[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});

  // SlideOver for Payment Method Editor
  const [methodForm, setMethodForm] = useState<PaymentMethodItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callAdminRpc<SettingsSnapshot>('gsa_admin_settings_snapshot');
      setCompany(data?.company || { razao_social: '', cnpj: '', telefone: '', responsavel: '' });
      setMethods(Array.isArray(data?.payment_methods) ? data.payment_methods : []);
      setSettings(data?.settings || {});
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar as configurações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Supabase Realtime — refresh on settings changes
  useRealtimeSubscription([
    { table: 'system_settings', onChange: () => void load() },
    { table: 'payment_methods', onChange: () => void load() },
    { table: 'configuracoes', onChange: () => void load() }
  ]);

  const value = (key: string, fallback = '') => settings[key] ?? fallback;
  const setValue = (key: string, next: string) =>
    setSettings((current) => ({ ...current, [key]: next }));

  const saveSettings = async (keys: string[], successMessage: string) => {
    setSaving(true);
    try {
      await callAdminRpc('gsa_admin_update_settings_secure', {
        p_settings: keys.map((key) => ({ key, value: value(key) })),
      });
      toast.success(successMessage);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  const saveCompany = async () => {
    setSaving(true);
    try {
      await callAdminRpc('gsa_admin_save_company', { p_payload: company });
      toast.success('Dados da empresa salvos e auditados com sucesso.');
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível salvar a empresa.');
    } finally {
      setSaving(false);
    }
  };

  const saveMethod = async () => {
    if (!methodForm?.nome?.trim()) {
      toast.error('Informe o nome da forma de pagamento.');
      return;
    }
    setSaving(true);
    try {
      await callAdminRpc('gsa_admin_save_payment_method', {
        p_id: methodForm.id || null,
        p_payload: methodForm,
      });
      toast.success('Forma de pagamento salva com sucesso.');
      setMethodForm(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível salvar a forma de pagamento.');
    } finally {
      setSaving(false);
    }
  };

  const toggleMethodStatus = async (method: PaymentMethodItem) => {
    if (saving) return;
    setSaving(true);
    try {
      await callAdminRpc('gsa_admin_save_payment_method', {
        p_id: method.id,
        p_payload: { ...method, ativo: !method.ativo },
      });
      toast.success(`Forma de pagamento ${method.ativo ? 'desativada' : 'ativada'}.`);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível alterar a forma de pagamento.');
    } finally {
      setSaving(false);
    }
  };

  const tabs: Array<{ id: ConfigSubTab; label: string; icon: React.ElementType }> = [
    { id: 'empresa', label: 'Empresa & Cadastro', icon: Building2 },
    { id: 'financeiro', label: 'Parâmetros Financeiros', icon: Wallet },
    { id: 'formas_pagamento', label: 'Métodos de Pagamento', icon: CreditCard },
    { id: 'calculadoras', label: 'Calculadoras Pro', icon: Calculator },
    { id: 'indicacao', label: 'Indicação & Bônus', icon: Users },
    { id: 'whatsapp', label: 'WhatsApp Master', icon: MessageSquare },
    { id: 'portal', label: 'Popups do Portal', icon: Layout },
    { id: 'seguranca', label: 'Segurança & Auditoria', icon: LockKeyhole },
  ];

  // Grid columns for custom payment methods
  const paymentMethodColumns: GridColumn<PaymentMethodItem>[] = [
    {
      key: 'nome',
      header: 'Nome do Método',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-bold text-slate-900 block">{row.nome}</span>
          <span className="font-mono text-[11px] text-slate-400">Slug: {row.slug}</span>
        </div>
      ),
    },
    {
      key: 'tipo',
      header: 'Tipo de Integração',
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 text-slate-700 uppercase">
          {row.tipo}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      sortable: true,
      render: (row) => <StatusBadge status={row.ativo ? 'ativo' : 'inativo'} size="xs" />,
    },
    {
      key: 'instrucoes',
      header: 'Instruções de Pagamento',
      render: (row) => <span className="text-xs text-slate-600 truncate max-w-sm block">{row.instrucoes || 'Sem instruções.'}</span>,
    },
    {
      key: 'acoes',
      header: 'Ações',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setMethodForm({ ...row })}
            className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => void toggleMethodStatus(row)}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors ${
              row.ativo
                ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            {row.ativo ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ── Sub-navigation Tab Bar ── */}
      <div className="flex items-center gap-1.5 flex-wrap bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === id
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab: Empresa & Cadastro ── */}
      {activeTab === 'empresa' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                <Building2 className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Dados Oficiais da Empresa</h3>
                <p className="text-xs text-slate-500">Identificação jurídica e dados fiscais do Grupo GSA</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Razão Social</label>
                <input
                  type="text"
                  value={company.razao_social || ''}
                  onChange={(e) => setCompany({ ...company, razao_social: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">CNPJ</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  value={maskCNPJ(company.cnpj || '')}
                  onChange={(e) => setCompany({ ...company, cnpj: maskCNPJ(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Telefone Principal</label>
                <input
                  type="text"
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                  value={maskPhone(company.telefone || '')}
                  onChange={(e) => setCompany({ ...company, telefone: maskPhone(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Responsável Legal</label>
                <input
                  type="text"
                  value={company.responsavel || ''}
                  onChange={(e) => setCompany({ ...company, responsavel: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={saveCompany}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saving ? 'Salvando...' : 'Salvar Dados da Empresa'}</span>
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <span className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Cadastro Padrão & Bônus de Boas-Vindas</h3>
                <p className="text-xs text-slate-500">Parâmetros aplicados na criação de novas contas</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Status do Código Padrão</label>
                <select
                  value={value('codigo_cadastro_padrao_ativo', 'false')}
                  onChange={(e) => setValue('codigo_cadastro_padrao_ativo', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="true">Ativo</option>
                  <option value="false">Desativado</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Código de Boas-Vindas</label>
                <input
                  type="text"
                  value={value('codigo_cadastro_padrao', 'BEMVINDO')}
                  onChange={(e) => setValue('codigo_cadastro_padrao', e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Recompensa</label>
                <select
                  value={value('bonus_cadastro_tipo', 'pontos')}
                  onChange={(e) => setValue('bonus_cadastro_tipo', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="pontos">Pontos de Fidelidade</option>
                  <option value="carteira">Crédito em Carteira (R$)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Valor do Bônus</label>
                <input 
                  type="number"
                  min="0"
                  value={value('bonus_cadastro_valor', '100')}
                  inputMode="numeric"
onChange={(e) => setValue('bonus_cadastro_valor', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void saveSettings(
                    ['codigo_cadastro_padrao_ativo', 'codigo_cadastro_padrao', 'bonus_cadastro_tipo', 'bonus_cadastro_valor'],
                    'Configurações de cadastro e boas-vindas salvas.'
                  )
                }
                className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saving ? 'Salvando...' : 'Salvar Regras de Cadastro'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Parâmetros Financeiros ── */}
      {activeTab === 'financeiro' && (
        <div className="space-y-6">
          <CalculatorProPaymentConfiguration />

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4"><span className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100"><Wallet className="h-5 w-5" /></span><div><h3 className="text-sm font-bold text-slate-900">Taxa de Saque do Crédito GSA</h3><p className="text-xs text-slate-500">Taxa pré-configurada exibida ao cliente antes da solicitação</p></div></div>
            <div className="grid gap-4 sm:grid-cols-2"><div><label className="block text-xs font-bold text-slate-700 mb-1">Tipo da taxa</label><select value={value('credito_saque_taxa_tipo', 'percentual')} onChange={(e) => setValue('credito_saque_taxa_tipo', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium"><option value="percentual">Percentual sobre o saque</option><option value="fixa">Valor fixo por saque</option></select></div><div><label className="block text-xs font-bold text-slate-700 mb-1">{value('credito_saque_taxa_tipo', 'percentual') === 'percentual' ? 'Taxa (%)' : 'Taxa fixa (R$)'}</label><input  type="number" min="0" max={value('credito_saque_taxa_tipo', 'percentual') === 'percentual' ? 100 : undefined} value={value('credito_saque_taxa_valor', '0')} inputMode="numeric"
onChange={(e) => setValue('credito_saque_taxa_valor', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium font-mono" /></div></div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-[11px] leading-relaxed text-indigo-900">O valor calculado é exibido antes da confirmação e fica registrado no protocolo. Alterações futuras da taxa não modificam solicitações já abertas.</div>
            <div className="flex justify-end"><button type="button" disabled={saving} onClick={() => void saveSettings(['credito_saque_taxa_tipo', 'credito_saque_taxa_valor'], 'Taxa de saque do crédito salva.')} className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 flex items-center gap-1.5"><Save className="h-3.5 w-3.5" />{saving ? 'Salvando...' : 'Salvar Taxa de Saque'}</button></div>
          </div>

          {/* Regras de Desconto PIX */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <span className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
                <Wallet className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Desconto Exclusivo PIX (Loja & Serviços)</h3>
                <p className="text-xs text-slate-500">Regras de precificação à vista e compatibilidade com carteira/pontos</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Desconto PIX Ativo</label>
                <select
                  value={value('loja_pix_desconto_ativo', 'true')}
                  onChange={(e) => setValue('loja_pix_desconto_ativo', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="true">Sim (Ativo)</option>
                  <option value="false">Não (Inativo)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Porcentagem de Desconto (%)</label>
                <input 
                  type="number"
                  min="0"
                  max="100"
                  value={value('loja_pix_desconto_porcentagem', '5')}
                  inputMode="numeric"
onChange={(e) => setValue('loja_pix_desconto_porcentagem', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Aplicar Em</label>
                <select
                  value={value('loja_pix_desconto_tipo_aplicacao', 'todos')}
                  onChange={(e) => setValue('loja_pix_desconto_tipo_aplicacao', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="todos">Todos os Produtos e Serviços</option>
                  <option value="categorias">Apenas Categorias Selecionadas</option>
                  <option value="produtos">Apenas Produtos Selecionados</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Permitir com Pontos de Fidelidade</label>
                <select
                  value={value('loja_pix_desconto_permitir_pontos', 'false')}
                  onChange={(e) => setValue('loja_pix_desconto_permitir_pontos', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="false">Não (Desconto Exclusivo PIX)</option>
                  <option value="true">Sim (Permite Acumular)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Permitir com Saldo da Carteira</label>
                <select
                  value={value('loja_pix_desconto_permitir_saldo_carteira', 'false')}
                  onChange={(e) => setValue('loja_pix_desconto_permitir_saldo_carteira', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="false">Não (Desconto Exclusivo PIX)</option>
                  <option value="true">Sim (Permite Acumular)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void saveSettings(
                    [
                      'loja_pix_desconto_ativo',
                      'loja_pix_desconto_porcentagem',
                      'loja_pix_desconto_tipo_aplicacao',
                      'loja_pix_desconto_permitir_pontos',
                      'loja_pix_desconto_permitir_saldo_carteira',
                    ],
                    'Regras de desconto PIX salvas.'
                  )
                }
                className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saving ? 'Salvando...' : 'Salvar Regras de Desconto PIX'}</span>
              </button>
            </div>
          </div>

          {/* Checkout Methods Enablement */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                <CreditCard className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Métodos Ativos no Checkout</h3>
                <p className="text-xs text-slate-500">Canais de pagamento visíveis para os clientes</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">PIX Instantâneo</label>
                <select
                  value={value('checkout_metodo_pix_ativo', 'true')}
                  onChange={(e) => setValue('checkout_metodo_pix_ativo', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cartão de Crédito</label>
                <select
                  value={value('checkout_metodo_cartao_ativo', 'true')}
                  onChange={(e) => setValue('checkout_metodo_cartao_ativo', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Boleto Bancário</label>
                <select
                  value={value('checkout_metodo_boleto_ativo', 'true')}
                  onChange={(e) => setValue('checkout_metodo_boleto_ativo', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void saveSettings(
                    ['checkout_metodo_pix_ativo', 'checkout_metodo_cartao_ativo', 'checkout_metodo_boleto_ativo'],
                    'Métodos do checkout salvos com sucesso.'
                  )
                }
                className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saving ? 'Salvando...' : 'Salvar Métodos de Checkout'}</span>
              </button>
            </div>
          </div>

          {/* Parâmetros Globais */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <span className="p-2 rounded-lg bg-slate-100 text-slate-700">
                <Sliders className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Parâmetros Operacionais Globais</h3>
                <p className="text-xs text-slate-500">Prazos de vencimento, saque mínimo e taxa de entrega</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Valor Mínimo para Saque (R$)</label>
                <input 
                  type="number"
                  min="0"
                  value={value('valor_minimo_saque', '50')}
                  inputMode="numeric"
onChange={(e) => setValue('valor_minimo_saque', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Vencimento Padrão de Serviços (dias)</label>
                <input 
                  type="number"
                  min="1"
                  value={value('vencimento_padrao_servicos', '10')}
                  inputMode="numeric"
onChange={(e) => setValue('vencimento_padrao_servicos', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Vencimento Padrão de Produtos (dias)</label>
                <input 
                  type="number"
                  min="1"
                  value={value('vencimento_padrao_produtos', '10')}
                  inputMode="numeric"
onChange={(e) => setValue('vencimento_padrao_produtos', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Taxa de Entrega Padrão (R$)</label>
                <input 
                  type="number"
                  min="0"
                  value={value('loja_taxa_entrega_padrao', '0')}
                  inputMode="numeric"
onChange={(e) => setValue('loja_taxa_entrega_padrao', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void saveSettings(
                    ['valor_minimo_saque', 'vencimento_padrao_servicos', 'vencimento_padrao_produtos', 'loja_taxa_entrega_padrao'],
                    'Parâmetros operacionais globais salvos.'
                  )
                }
                className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saving ? 'Salvando...' : 'Salvar Parâmetros Globais'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Métodos de Pagamento (TacticalDataGrid) ── */}
      {activeTab === 'formas_pagamento' && (
        <div className="space-y-4">
          <TacticalDataGrid<PaymentMethodItem>
            title="Formas de Pagamento Personalizadas"
            subtitle="Configuração de canais de liquidação, prazos e instruções"
            data={methods}
            columns={paymentMethodColumns}
            keyExtractor={(row) => row.id || row.slug}
            isLoading={loading}
            actions={
              <button
                type="button"
                onClick={() =>
                  setMethodForm({
                    nome: '',
                    slug: '',
                    tipo: 'manual',
                    instrucoes: '',
                    ativo: true,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-2xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Nova Forma de Pagamento</span>
              </button>
            }
          />
        </div>
      )}

      {/* ── Tab: Calculadoras Pro ── */}
      {activeTab === 'calculadoras' && (
        <div className="space-y-6">
          <CalculatorProPaymentConfiguration />
          <CalculatorProAdminPanel />
        </div>
      )}

      {/* ── Tab: Indicação & Bônus ── */}
      {activeTab === 'indicacao' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Programa Indique e Ganhe</h3>
              <p className="text-xs text-slate-500">Mecânica de recompensas para quem indica e novos indicados</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Recompensa do Indicador</label>
              <select
                value={value('indicador_recompensa_tipo', 'carteira')}
                onChange={(e) => setValue('indicador_recompensa_tipo', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
              >
                <option value="carteira">Crédito em Carteira (R$)</option>
                <option value="pontos">Pontos de Fidelidade</option>
                <option value="ambos">Ambos (Carteira + Pontos)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Recompensa do Indicado</label>
              <select
                value={value('indicado_recompensa_tipo', 'desconto')}
                onChange={(e) => setValue('indicado_recompensa_tipo', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
              >
                <option value="desconto">Cupom de Desconto (%)</option>
                <option value="pontos">Pontos de Boas-Vindas</option>
                <option value="ambos">Ambos (Desconto + Pontos)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Crédito do Indicador (R$)</label>
              <input 
                type="number"
                min="0"
                value={value('indicador_limite_carteira', value('bonus_indicador', '20'))}
                inputMode="numeric"
onChange={(e) => {
                  setValue('indicador_limite_carteira', e.target.value);
                  setValue('bonus_indicador', e.target.value);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Pontos do Indicador</label>
              <input 
                type="number"
                min="0"
                value={value('indicador_valor_pontos', '50')}
                inputMode="numeric"
onChange={(e) => setValue('indicador_valor_pontos', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Desconto do Indicado (%)</label>
              <input 
                type="number"
                min="0"
                max="100"
                value={value('indicado_desconto_porcentagem', value('desconto_indicado_porcentagem', '10'))}
                inputMode="numeric"
onChange={(e) => {
                  setValue('indicado_desconto_porcentagem', e.target.value);
                  setValue('desconto_indicado_porcentagem', e.target.value);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Pontos do Indicado</label>
              <input 
                type="number"
                min="0"
                value={value('indicado_valor_pontos', '50')}
                inputMode="numeric"
onChange={(e) => setValue('indicado_valor_pontos', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Template de Mensagem Compartilhável (WhatsApp)
              </label>
              <textarea
                rows={4}
                value={value('template_mensagem_indicacao', '')}
                onChange={(e) => setValue('template_mensagem_indicacao', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                placeholder="Ex: Olá! Conheça os serviços do Grupo GSA com desconto especial..."
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void saveSettings(
                  [
                    'indicador_recompensa_tipo',
                    'indicador_limite_carteira',
                    'indicador_valor_pontos',
                    'indicado_recompensa_tipo',
                    'indicado_desconto_porcentagem',
                    'indicado_valor_pontos',
                    'template_mensagem_indicacao',
                    'bonus_indicador',
                    'desconto_indicado_porcentagem',
                  ],
                  'Programa de indicação salvo com sucesso.'
                )
              }
              className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{saving ? 'Salvando...' : 'Salvar Programa de Indicação'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: WhatsApp Master ── */}
      {activeTab === 'whatsapp' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <span className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
                <MessageSquare className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">WhatsApp Master — Receptor 100% de Notificações</h3>
                <p className="text-xs text-slate-500">Número administrativo receptor de alertas técnicos e operacionais via n8n</p>
              </div>
            </div>

            <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-100 flex items-start gap-3">
              <Bell className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-950 leading-relaxed">
                Este número recebe notificações instantâneas de <strong>todos os eventos do sistema</strong>:
                alertas da VPS Oracle, novas ordens de serviço, solicitações de saque PIX e relatórios gerenciais.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Telefone Master (com DDI e DDD, ex: 5511920857756)
                </label>
                <input
                  type="text"
                  value={value('whatsapp_admin_notificacoes', '5511920857756')}
                  onChange={(e) => setValue('whatsapp_admin_notificacoes', e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  URL do Webhook n8n (Evolution API Dispatcher)
                </label>
                <input
                  type="text"
                  value={value('whatsapp_n8n_webhook_url', 'http://147.15.43.141:5678/webhook/send-whatsapp')}
                  onChange={(e) => setValue('whatsapp_n8n_webhook_url', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={sendingTestAlert || saving}
                onClick={async () => {
                  setSendingTestAlert(true);
                  try {
                    const targetNumber = value('whatsapp_admin_notificacoes', '5511920857756');
                    const ok = await sendAdminWhatsAppNotification({
                      title: 'Alerta de Teste de Configuração',
                      message: `Teste de recebimento de notificações administrativas no WhatsApp registrado (${targetNumber}). O sistema n8n está operacional!`,
                      category: 'SISTEMA',
                      recipientPhone: targetNumber,
                    });
                    if (ok) {
                      toast.success(`Alerta de teste enviado com sucesso para ${targetNumber}!`);
                    } else {
                      toast.error('Não foi possível enviar o alerta de teste. Verifique a URL do n8n.');
                    }
                  } catch (e: any) {
                    toast.error('Erro no envio: ' + (e?.message || 'Erro desconhecido'));
                  } finally {
                    setSendingTestAlert(false);
                  }
                }}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <Send className={`h-3.5 w-3.5 ${sendingTestAlert ? 'animate-bounce' : ''}`} />
                <span>{sendingTestAlert ? 'Enviando Alerta...' : 'Disparar Alerta de Teste Agora'}</span>
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void saveSettings(
                    ['whatsapp_admin_notificacoes', 'whatsapp_n8n_webhook_url'],
                    'WhatsApp Master de Notificações salvo com sucesso.'
                  )
                }
                className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saving ? 'Salvando...' : 'Salvar WhatsApp Master'}</span>
              </button>
            </div>
          </div>

          {/* Botão Flutuante do WhatsApp */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                <MessageSquare className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Botão Flutuante de WhatsApp no Portal</h3>
                <p className="text-xs text-slate-500">Widget de atendimento flutuante exibido aos visitantes e clientes</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Widget Ativo</label>
                <select
                  value={value('whatsapp_float_ativo', 'true')}
                  onChange={(e) => setValue('whatsapp_float_ativo', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="true">Ativo</option>
                  <option value="false">Desativado</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Telefone do Atendimento</label>
                <input
                  type="text"
                  value={value('whatsapp_float_telefone', '')}
                  onChange={(e) => setValue('whatsapp_float_telefone', e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                  placeholder="5511999999999"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tooltip / Rótulo</label>
                <input
                  type="text"
                  value={value('whatsapp_float_tooltip', 'Falar no WhatsApp')}
                  onChange={(e) => setValue('whatsapp_float_tooltip', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Posição na Tela</label>
                <select
                  value={value('whatsapp_float_posicao', 'direita')}
                  onChange={(e) => setValue('whatsapp_float_posicao', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="direita">Canto Inferior Direito</option>
                  <option value="esquerda">Canto Inferior Esquerdo</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Mensagem Inicial Pré-digitada</label>
                <textarea
                  rows={3}
                  value={value('whatsapp_float_mensagem', '')}
                  onChange={(e) => setValue('whatsapp_float_mensagem', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                  placeholder="Olá! Gostaria de mais informações sobre..."
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void saveSettings(
                    [
                      'whatsapp_float_ativo',
                      'whatsapp_float_telefone',
                      'whatsapp_float_mensagem',
                      'whatsapp_float_tamanho',
                      'whatsapp_float_posicao',
                      'whatsapp_float_tooltip',
                    ],
                    'Configurações do botão flutuante salvas.'
                  )
                }
                className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{saving ? 'Salvando...' : 'Salvar Botão Flutuante'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Popups do Portal ── */}
      {activeTab === 'portal' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Layout className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Modal Promocional de Indicação no Portal</h3>
              <p className="text-xs text-slate-500">Banner modal de conversão exibido para novos visitantes</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Modal Ativo</label>
              <select
                value={value('modal_indicacao_ativo', 'true')}
                onChange={(e) => setValue('modal_indicacao_ativo', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
              >
                <option value="true">Ativo</option>
                <option value="false">Desativado</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Título do Modal</label>
              <input
                type="text"
                value={value('modal_indicacao_titulo', 'Você foi indicado!')}
                onChange={(e) => setValue('modal_indicacao_titulo', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Texto do Botão CTA</label>
              <input
                type="text"
                value={value('modal_indicacao_texto_botao', 'Solicitar Serviços')}
                onChange={(e) => setValue('modal_indicacao_texto_botao', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Módulo de Destino</label>
              <input
                type="text"
                value={value('modal_indicacao_modulo_destino', 'orcamentos')}
                onChange={(e) => setValue('modal_indicacao_modulo_destino', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Descrição Informativa</label>
              <textarea
                rows={4}
                value={value('modal_indicacao_descricao', '')}
                onChange={(e) => setValue('modal_indicacao_descricao', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                placeholder="Receba descontos exclusivos em sua primeira contratação..."
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void saveSettings(
                  [
                    'modal_indicacao_ativo',
                    'modal_indicacao_titulo',
                    'modal_indicacao_descricao',
                    'modal_indicacao_url_botao',
                    'modal_indicacao_acao_botao',
                    'modal_indicacao_modulo_destino',
                    'modal_indicacao_texto_botao',
                    'modal_indicacao_tamanho',
                  ],
                  'Configurações do modal no portal salvas.'
                )
              }
              className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{saving ? 'Salvando...' : 'Salvar Configurações do Portal'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: Segurança ── */}
      {activeTab === 'seguranca' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <span className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Políticas de Segurança e Credenciais</h3>
              <p className="text-xs text-slate-500">Arquitetura de proteção zero-trust e rotação de senhas</p>
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-950 space-y-2">
            <p className="font-bold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Segurança de Credenciais Administrativas:
            </p>
            <p className="text-amber-900 leading-relaxed">
              Senhas e chaves criptográficas não são gravadas em texto plano. A geração e rotação de credenciais de colaboradores
              ocorre através do módulo <strong>Gestão de Acessos & RBAC</strong> com expurgo imediato de sessões ativas e log de auditoria imutável.
            </p>
          </div>
        </div>
      )}

      {/* ── Payment Method SlideOver ── */}
      <CommandSlideOver
        isOpen={Boolean(methodForm)}
        onClose={() => setMethodForm(null)}
        title={methodForm?.id ? 'Editar Forma de Pagamento' : 'Nova Forma de Pagamento'}
        subtitle="Configuração de método de cobrança"
        width="md"
        primaryAction={{
          label: saving ? 'Salvando...' : 'Salvar Método',
          onClick: saveMethod,
          loading: saving,
          variant: 'primary',
        }}
        secondaryAction={{
          label: 'Cancelar',
          onClick: () => setMethodForm(null),
        }}
      >
        {methodForm && (
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome do Método *</label>
                <input
                  type="text"
                  value={methodForm.nome || ''}
                  onChange={(e) => setMethodForm({ ...methodForm, nome: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: Transferência Bancária TED"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Slug Identificador *</label>
                <input
                  type="text"
                  value={methodForm.slug || ''}
                  onChange={(e) => setMethodForm({ ...methodForm, slug: e.target.value.toLowerCase() })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500 font-mono"
                  placeholder="ex: ted_bancaria"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Processamento</label>
                <select
                  value={methodForm.tipo || 'manual'}
                  onChange={(e) => setMethodForm({ ...methodForm, tipo: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="manual">Manual / Comprovante</option>
                  <option value="pix">PIX Automático</option>
                  <option value="gateway">Gateway de Cartão</option>
                  <option value="boleto">Boleto Bancário</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Instruções para o Cliente</label>
                <textarea
                  rows={4}
                  value={methodForm.instrucoes || ''}
                  onChange={(e) => setMethodForm({ ...methodForm, instrucoes: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-500"
                  placeholder="Informe os dados bancários ou instruções de liquidação..."
                />
              </div>
            </div>
          </div>
        )}
      </CommandSlideOver>
    </div>
  );
}
