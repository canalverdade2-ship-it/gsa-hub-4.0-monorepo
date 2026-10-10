import React, { useState, useEffect, useCallback } from 'react';
import { 
  Calculator, CreditCard, Ticket, Settings, Save, Plus, 
  CheckCircle2, XCircle, Clock, Copy, ShieldCheck, RefreshCw,
  Sparkles, Layers, AlertTriangle, Eye
} from 'lucide-react';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { formatCurrency, formatDateTime, formatDate, maskPhone } from '../../../../lib/utils';
import { toast } from 'react-hot-toast';
import { TacticalDataGrid, GridColumn } from '../shared/TacticalDataGrid';
import { CommandSlideOver } from '../shared/CommandSlideOver';
import { StatusBadge } from '../shared/StatusBadge';

export interface CalculadorasGatewayViewProps {
  initialSubTab?: 'produtos' | 'vouchers' | 'gateway';
  colaboradorNome?: string;
  colaboradorId?: string;
}

const TOOL_LABELS: Record<string, string> = {
  termination: 'Rescisão Trabalhista Pro',
  retirement: 'Aposentadoria INSS Pro',
  vacation: 'Cálculo de Férias Pro',
  thirteenth: '13º Salário Pro',
  benefits: 'Benefícios INSS Pro',
  bpc: 'BPC / LOAS Pro',
};

export function CalculadorasGatewayView({
  initialSubTab = 'produtos',
  colaboradorNome,
  colaboradorId
}: CalculadorasGatewayViewProps) {
  const [activeTab, setActiveTab] = useState<'produtos' | 'vouchers' | 'gateway'>(initialSubTab);
  const [products, setProducts] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Gateway Config State
  const [gatewayHandle, setGatewayHandle] = useState('');
  const [gatewayReady, setGatewayReady] = useState(false);
  const [savingGateway, setSavingGateway] = useState(false);

  // Edit Product Drawer
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [isProductDrawerOpen, setIsProductDrawerOpen] = useState(false);
  const [productForm, setProductForm] = useState({
    nome: '',
    precoCentavos: 1990,
    duracaoMinutos: 1440,
    ativo: true
  });
  const [savingProduct, setSavingProduct] = useState(false);

  // New Voucher Drawer
  const [isVoucherDrawerOpen, setIsVoucherDrawerOpen] = useState(false);
  const [voucherForm, setVoucherForm] = useState({
    toolId: 'termination',
    phone: '',
    observacoes: '',
    validadeDias: 30
  });
  const [creatingVoucher, setCreatingVoucher] = useState(false);
  const [generatedVoucherCode, setGeneratedVoucherCode] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callAdminRpc<any>('gsa_admin_calculator_pro_snapshot');
      if (data) {
        setProducts(data.products || []);
        setVouchers(data.vouchers || []);
        if (data.runtime_config) {
          setGatewayHandle(data.runtime_config.infinitepay_handle || '');
          setGatewayReady(Boolean(data.runtime_config.checkout_ready));
        }
      }
    } catch (err: any) {
      console.error('Erro ao carregar Calculadoras Pro:', err);
      toast.error('Erro ao carregar dados das ferramentas Pro.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  useRealtimeSubscription([
    { table: 'vouchers', onChange: loadSnapshot },
    { table: 'system_settings', onChange: loadSnapshot }
  ], [loadSnapshot]);

  // Save Product Changes
  const handleSaveProduct = async () => {
    if (!selectedProduct) return;
    setSavingProduct(true);
    try {
      const res = await callAdminRpc<any>('gsa_admin_save_calculator_pro_product', {
        p_tool_id: selectedProduct.tool_id,
        p_nome: productForm.nome.trim(),
        p_ativo: productForm.ativo,
        p_preco_centavos: Number(productForm.precoCentavos),
        p_duracao_acesso_minutos: Number(productForm.duracaoMinutos)
      });

      if (res && !res.success) throw new Error('Falha ao salvar produto.');
      toast.success('Configuração da ferramenta atualizada!');
      setIsProductDrawerOpen(false);
      loadSnapshot();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar ferramenta.');
    } finally {
      setSavingProduct(false);
    }
  };

  // Generate Voucher via RPC
  const handleCreateVoucher = async () => {
    setCreatingVoucher(true);
    try {
      const res = await callAdminRpc<any>('gsa_admin_create_calculator_pro_voucher', {
        p_tool_id: voucherForm.toolId || null,
        p_phone: voucherForm.phone.trim() || null,
        p_observacoes: voucherForm.observacoes.trim() || null,
        p_validade_dias: Number(voucherForm.validadeDias)
      });

      if (res && res.voucher?.full_voucher_code) {
        setGeneratedVoucherCode(res.voucher.full_voucher_code);
        toast.success('Voucher gerado com sucesso!');
        loadSnapshot();
      } else {
        throw new Error('Falha ao criar voucher.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao gerar voucher.');
    } finally {
      setCreatingVoucher(false);
    }
  };

  // Save Gateway Handle
  const handleSaveGateway = async () => {
    const norm = gatewayHandle.trim().replace(/^\$/, '');
    setSavingGateway(true);
    try {
      const res = await callAdminRpc<any>('gsa_admin_save_calculator_pro_runtime_config', {
        p_infinitepay_handle: norm || null
      });
      if (res && !res.success) throw new Error('Falha ao salvar gateway.');
      toast.success('Integração InfinitePay atualizada!');
      setGatewayHandle(res.infinitepay_handle || '');
      setGatewayReady(Boolean(res.checkout_ready));
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar configuração.');
    } finally {
      setSavingGateway(false);
    }
  };

  // Columns: Products
  const productColumns: GridColumn<any>[] = [
    {
      key: 'tool_id',
      header: 'ID da Ferramenta',
      width: '180px',
      render: (row) => (
        <span className="font-mono font-bold text-slate-900 text-xs uppercase">
          {row.tool_id}
        </span>
      )
    },
    {
      key: 'nome',
      header: 'Nome da Ferramenta Pro',
      render: (row) => (
        <span className="font-semibold text-slate-900 text-xs">
          {row.nome || TOOL_LABELS[row.tool_id] || row.tool_id}
        </span>
      )
    },
    {
      key: 'preco',
      header: 'Preço Avulso',
      align: 'right',
      width: '130px',
      render: (row) => (
        <span className="font-mono font-bold text-slate-900 text-xs">
          {formatCurrency((row.preco_centavos || 0) / 100)}
        </span>
      )
    },
    {
      key: 'duracao',
      header: 'Acesso Liberado',
      align: 'center',
      width: '140px',
      render: (row) => (
        <span className="text-xs text-slate-600 font-mono">
          {Math.round((row.duracao_acesso_minutos || 1440) / 60)} horas
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      width: '120px',
      render: (row) => <StatusBadge status={row.ativo ? 'ativo' : 'inativo'} size="xs" />
    },
    {
      key: 'acoes',
      header: 'Ações',
      align: 'right',
      width: '120px',
      render: (row) => (
        <button
          onClick={() => {
            setSelectedProduct(row);
            setProductForm({
              nome: row.nome || TOOL_LABELS[row.tool_id] || '',
              precoCentavos: row.preco_centavos || 1990,
              duracaoMinutos: row.duracao_acesso_minutos || 1440,
              ativo: Boolean(row.ativo)
            });
            setIsProductDrawerOpen(true);
          }}
          className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs"
        >
          Editar Preço
        </button>
      )
    }
  ];

  // Columns: Vouchers
  const voucherColumns: GridColumn<any>[] = [
    {
      key: 'code_hint',
      header: 'Código / Voucher',
      width: '160px',
      render: (row) => (
        <span className="font-mono font-bold text-indigo-600 text-xs tracking-wider">
          {row.code_hint || row.full_voucher_code || row.id.slice(0, 8)}
        </span>
      )
    },
    {
      key: 'tool_id',
      header: 'Ferramenta Alvo',
      render: (row) => (
        <span className="text-xs text-slate-800 font-medium">
          {TOOL_LABELS[row.tool_id] || row.tool_id || 'Todas as ferramentas'}
        </span>
      )
    },
    {
      key: 'phone',
      header: 'Telefone Destinatário',
      render: (row) => (
        <span className="font-mono text-xs text-slate-600">
          {row.phone || 'Geral / Não vinculado'}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      width: '120px',
      render: (row) => <StatusBadge status={row.status} size="xs" />
    },
    {
      key: 'created_at',
      header: 'Criado em',
      width: '140px',
      render: (row) => (
        <span className="text-[11px] font-mono text-slate-500">
          {row.created_at ? formatDate(row.created_at) : '—'}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-4 animate-fade-up">
      {/* ── Sub-Navigation Tabs ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center bg-slate-200/70 p-1 rounded-xl border border-slate-200 gap-1">
          <button
            onClick={() => setActiveTab('produtos')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'produtos'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calculator className="h-3.5 w-3.5 text-indigo-600" />
            <span>Preços das Calculadoras Pro</span>
          </button>

          <button
            onClick={() => setActiveTab('vouchers')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'vouchers'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Ticket className="h-3.5 w-3.5 text-amber-500" />
            <span>Vouchers de Desbloqueio</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800">
              {vouchers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('gateway')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'gateway'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
            <span>Gateway InfinitePay</span>
          </button>
        </div>

        {activeTab === 'vouchers' && (
          <button
            onClick={() => {
              setGeneratedVoucherCode(null);
              setIsVoucherDrawerOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-2xs"
          >
            <Plus className="h-4 w-4" />
            <span>Gerar Novo Voucher</span>
          </button>
        )}
      </div>

      {/* ── Active Content ── */}
      {activeTab === 'produtos' ? (
        <TacticalDataGrid
          title="Catálogo & Precificação de Ferramentas Pro"
          subtitle="Ajuste os valores unitários de desbloqueio avulso e tempo de vigência de acesso."
          data={products}
          columns={productColumns}
          keyExtractor={(row) => row.tool_id}
          isLoading={loading}
        />
      ) : activeTab === 'vouchers' ? (
        <TacticalDataGrid
          title="Vouchers Promocionais de Desbloqueio"
          subtitle="Códigos de acesso gratuito para clientes VIP ou campanhas de captação."
          data={vouchers}
          columns={voucherColumns}
          keyExtractor={(row) => row.id}
          isLoading={loading}
        />
      ) : (
        <div className="max-w-xl p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Integração InfinitePay</h3>
              <p className="text-xs text-slate-500">Configuração de checkout transparente e recebimento PIX das calculadoras.</p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                InfiniteTag / Handle do Estabelecimento ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400">$</span>
                <input
                  type="text"
                  placeholder="grupogsa"
                  value={gatewayHandle}
                  onChange={(e) => setGatewayHandle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-2 text-xs font-mono font-bold text-slate-900 shadow-2xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <span className="text-slate-600 font-medium">Status de Prontidão do Checkout:</span>
              <StatusBadge status={gatewayReady ? 'ativo' : 'inativo'} size="xs">
                {gatewayReady ? 'Pronto para Cobrança' : 'Aguardando Configuração'}
              </StatusBadge>
            </div>

            <button
              onClick={handleSaveGateway}
              disabled={savingGateway}
              className="w-full py-2 px-4 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-all shadow-2xs flex items-center justify-center gap-2"
            >
              <Save className="h-4 w-4" />
              <span>{savingGateway ? 'Salvando...' : 'Salvar Configuração'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER 1: EDIT PRODUCT PRICING
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isProductDrawerOpen}
        onClose={() => setIsProductDrawerOpen(false)}
        title="Editar Preço da Ferramenta Pro"
        subtitle={selectedProduct ? selectedProduct.tool_id : ''}
        width="sm"
        primaryAction={{
          label: 'Salvar Preço',
          onClick: handleSaveProduct,
          loading: savingProduct,
          variant: 'primary'
        }}
        secondaryAction={{
          label: 'Cancelar',
          onClick: () => setIsProductDrawerOpen(false)
        }}
      >
        {selectedProduct && (
          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Nome de Exibição
              </label>
              <input
                type="text"
                value={productForm.nome}
                onChange={(e) => setProductForm(prev => ({ ...prev, nome: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold text-slate-900 shadow-2xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Preço em Centavos (ex: 1990 = R$ 19,90)
              </label>
              <input 
                type="number"
                value={productForm.precoCentavos}
                inputMode="numeric"
onChange={(e) => setProductForm(prev => ({ ...prev, precoCentavos: Number(e.target.value) }))}
                className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-900 shadow-2xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Duração do Acesso (Minutos)
              </label>
              <input 
                type="number"
                value={productForm.duracaoMinutos}
                inputMode="numeric"
onChange={(e) => setProductForm(prev => ({ ...prev, duracaoMinutos: Number(e.target.value) }))}
                className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-900 shadow-2xs"
              />
            </div>
          </div>
        )}
      </CommandSlideOver>

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER 2: GENERATE VOUCHER
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isVoucherDrawerOpen}
        onClose={() => setIsVoucherDrawerOpen(false)}
        title="Gerar Voucher de Acesso Gratuito"
        width="sm"
        primaryAction={{
          label: 'Gerar Código',
          onClick: handleCreateVoucher,
          loading: creatingVoucher,
          variant: 'primary',
          icon: <Plus className="h-4 w-4" />
        }}
        secondaryAction={{
          label: 'Fechar',
          onClick: () => setIsVoucherDrawerOpen(false)
        }}
      >
        <div className="space-y-4 text-xs">
          {generatedVoucherCode && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 text-center">
              <span className="text-[10px] font-bold uppercase text-emerald-800">Voucher Gerado</span>
              <p className="text-xl font-mono font-black text-emerald-950 tracking-wider">
                {generatedVoucherCode}
              </p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(generatedVoucherCode);
                  toast.success('Código copiado!');
                }}
                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 underline"
              >
                <Copy className="h-3 w-3" />
                <span>Copiar Código</span>
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Ferramenta
            </label>
            <select
              value={voucherForm.toolId}
              onChange={(e) => setVoucherForm(prev => ({ ...prev, toolId: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold text-slate-900 shadow-2xs"
            >
              <option value="">Todas as Ferramentas Pro</option>
              {Object.entries(TOOL_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Telefone do Destinatário (Opcional)
            </label>
            <input
              type="text"
              inputMode="tel"
              maxLength={15}
              placeholder="(11) 99999-9999"
              value={voucherForm.phone}
              onChange={(e) => setVoucherForm(prev => ({ ...prev, phone: maskPhone(e.target.value) }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono text-slate-900 shadow-2xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Validade (Dias)
            </label>
            <input 
              type="number"
              value={voucherForm.validadeDias}
              inputMode="numeric"
onChange={(e) => setVoucherForm(prev => ({ ...prev, validadeDias: Number(e.target.value) }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 font-mono font-bold text-slate-900 shadow-2xs"
            />
          </div>
        </div>
      </CommandSlideOver>
    </div>
  );
}
