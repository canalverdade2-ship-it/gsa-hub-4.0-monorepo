import { useCallback, useEffect, useState, type ComponentType } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  Crown,
  Database,
  KeyRound,
  Loader2,
  Megaphone,
  RefreshCw,
  Save,
  ShieldCheck,
  Ticket,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../lib/adminRpc';
import { useConfirm } from '../../hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';

const TOOL_LABELS: Record<string, string> = {
  termination: 'Rescisão trabalhista',
  retirement: 'Aposentadoria INSS',
  vacation: 'Cálculo de férias',
  thirteenth: '13º salário',
  benefits: 'Benefícios do INSS',
  bpc: 'BPC / LOAS',
};

const TOOL_CODES: Record<string, string> = {
  termination: 'FT-01',
  retirement: 'FT-02',
  vacation: 'FT-03',
  thirteenth: 'FT-04',
  benefits: 'FT-05',
  bpc: 'FT-06',
};

type Product = {
  tool_id: string;
  nome: string;
  ativo: boolean;
  preco_centavos: number;
  duracao_acesso_minutos: number;
  gratuito_inicio?: string | null;
  gratuito_fim?: string | null;
  modo_bloqueio?: 'total' | 'partial';
};

type Voucher = {
  id: string;
  code_hint?: string | null;
  tool_id?: string | null;
  status: string;
  expires_at?: string | null;
};

type Payment = {
  id: string;
  order_nsu: string;
  tool_id: string;
  cliente_nome?: string | null;
  valor_centavos: number;
  status: string;
  paid_at?: string | null;
  created_at?: string | null;
};

type Snapshot = {
  products: Product[];
  vouchers: Voucher[];
  payments: Payment[];
};

type TabId = 'products' | 'promotions' | 'vouchers' | 'payments';

const DEFAULT_PRODUCTS: Product[] = [
  {
    tool_id: 'termination',
    nome: 'Rescisão trabalhista Pro',
    ativo: true,
    preco_centavos: 990,
    duracao_acesso_minutos: 1440,
    gratuito_inicio: null,
    gratuito_fim: null,
    modo_bloqueio: 'total',
  },
  {
    tool_id: 'retirement',
    nome: 'Aposentadoria INSS Pro',
    ativo: true,
    preco_centavos: 990,
    duracao_acesso_minutos: 1440,
    gratuito_inicio: null,
    gratuito_fim: null,
    modo_bloqueio: 'total',
  },
  {
    tool_id: 'vacation',
    nome: 'Cálculo de férias Pro',
    ativo: true,
    preco_centavos: 990,
    duracao_acesso_minutos: 1440,
    gratuito_inicio: null,
    gratuito_fim: null,
    modo_bloqueio: 'total',
  },
  {
    tool_id: 'thirteenth',
    nome: '13º salário Pro',
    ativo: true,
    preco_centavos: 990,
    duracao_acesso_minutos: 1440,
    gratuito_inicio: null,
    gratuito_fim: null,
    modo_bloqueio: 'total',
  },
  {
    tool_id: 'benefits',
    nome: 'Benefícios do INSS Pro',
    ativo: true,
    preco_centavos: 990,
    duracao_acesso_minutos: 1440,
    gratuito_inicio: null,
    gratuito_fim: null,
    modo_bloqueio: 'total',
  },
  {
    tool_id: 'bpc',
    nome: 'BPC / LOAS Pro',
    ativo: true,
    preco_centavos: 990,
    duracao_acesso_minutos: 1440,
    gratuito_inicio: null,
    gratuito_fim: null,
    modo_bloqueio: 'total',
  },
];

const TABS: Array<{ id: TabId; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'products', label: 'Configuração', icon: Calculator },
  { id: 'promotions', label: 'Promoções', icon: Megaphone },
  { id: 'vouchers', label: 'Vouchers', icon: Ticket },
  { id: 'payments', label: 'Pagamentos', icon: CreditCard },
];

function mergeProducts(products: Product[]) {
  return DEFAULT_PRODUCTS.map((fallback) => {
    const persisted = products.find((product) => product.tool_id === fallback.tool_id);
    const storedBlockMode = (typeof localStorage !== 'undefined' ? localStorage.getItem(`gsa_free_tools_block_mode_${fallback.tool_id}`) as 'total' | 'partial' | null : null);
    const base = persisted ? { ...fallback, ...persisted } : { ...fallback };
    if (storedBlockMode && !persisted?.modo_bloqueio) {
      base.modo_bloqueio = storedBlockMode;
    }
    return base;
  });
}

function localInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function money(cents: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(cents || 0) / 100);
}

function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('pt-BR') : '—';
}

function durationLabel(minutes: number) {
  const value = Number(minutes || 0);
  if (value >= 1440 && value % 1440 === 0) return `${value / 1440} dia(s)`;
  if (value >= 60 && value % 60 === 0) return `${value / 60} hora(s)`;
  return `${value} minuto(s)`;
}

function promotionState(product: Product) {
  if (!product.gratuito_inicio || !product.gratuito_fim) {
    return { label: 'Não configurada', className: 'bg-neutral-100 text-neutral-600' };
  }
  const now = Date.now();
  const start = new Date(product.gratuito_inicio).getTime();
  const end = new Date(product.gratuito_fim).getTime();
  if (start > now) return { label: 'Agendada', className: 'bg-blue-100 text-blue-700' };
  if (end > now) return { label: 'Ativa', className: 'bg-emerald-100 text-emerald-700' };
  return { label: 'Encerrada', className: 'bg-neutral-100 text-neutral-500' };
}

export function CalculatorProAdminPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ products: [], vouchers: [], payments: [] });
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS.map((item) => ({ ...item })));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('products');
  const [databaseProductCount, setDatabaseProductCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [voucherForm, setVoucherForm] = useState({ tool_id: 'termination', expires_at: '', observacoes: '' });
  const [issuedVoucher, setIssuedVoucher] = useState('');
  const [campaign, setCampaign] = useState({ start: '', end: '' });
  const confirmHook = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      try {
        await callAdminRpc('gsa_admin_ensure_calculator_pro_products');
      } catch {
        // A leitura abaixo ainda pode funcionar em instalações que possuem as linhas,
        // mas ainda não receberam a migração de autorreparo.
      }

      const data = await callAdminRpc<Partial<Snapshot>>('gsa_admin_calculator_pro_snapshot');
      const persistedProducts = Array.isArray(data?.products) ? data.products : [];
      const normalized: Snapshot = {
        products: persistedProducts,
        vouchers: Array.isArray(data?.vouchers) ? data.vouchers : [],
        payments: Array.isArray(data?.payments) ? data.payments : [],
      };

      setSnapshot(normalized);
      setDatabaseProductCount(persistedProducts.filter((product) => TOOL_LABELS[product.tool_id]).length);
      setProducts(mergeProducts(persistedProducts));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Não foi possível consultar as configurações no banco de dados.';
      setLoadError(message);
      setDatabaseProductCount(0);
      setSnapshot({ products: [], vouchers: [], payments: [] });
      setProducts(DEFAULT_PRODUCTS.map((item) => ({ ...item })));
      toast.error('As configurações Pro não foram sincronizadas com o banco.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateProduct = (toolId: string, patch: Partial<Product>) => {
    setProducts((current) => current.map((product) => (
      product.tool_id === toolId ? { ...product, ...patch } : product
    )));
  };

  const saveProduct = async (product: Product, successMessage?: string) => {
    const modoBloqueio = product.modo_bloqueio || 'total';
    try {
      localStorage.setItem(`gsa_free_tools_block_mode_${product.tool_id}`, modoBloqueio);
    } catch {
      // Ignora erro de local storage
    }
    await callAdminRpc('gsa_admin_save_calculator_pro_product', {
      p_tool_id: product.tool_id,
      p_payload: {
        ativo: product.ativo,
        preco_centavos: Math.max(0, Math.round(Number(product.preco_centavos || 0))),
        duracao_acesso_minutos: Math.max(15, Math.round(Number(product.duracao_acesso_minutos || 15))),
        modo_bloqueio: modoBloqueio,
        liberar_cliente_com_fatura_paga: true,
        gratuito_inicio: product.gratuito_inicio || null,
        gratuito_fim: product.gratuito_fim || null,
      },
    });
    if (successMessage) toast.success(successMessage);
  };

  const repairConfigurations = async () => {
    setSaving('repair');
    try {
      const result = await callAdminRpc<{ success?: boolean; count?: number }>('gsa_admin_ensure_calculator_pro_products');
      if (!result?.success && Number(result?.count || 0) < DEFAULT_PRODUCTS.length) {
        throw new Error('O banco não confirmou as seis configurações obrigatórias.');
      }
      toast.success('Configurações das Calculadoras Pro inicializadas.');
      await load();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Não foi possível inicializar as configurações.';
      toast.error(message);
      setLoadError(message);
    } finally {
      setSaving(null);
    }
  };

  const saveProductConfiguration = async (product: Product) => {
    setSaving(product.tool_id);
    try {
      await saveProduct(product, `${TOOL_LABELS[product.tool_id]} atualizada.`);
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a calculadora.');
    } finally {
      setSaving(null);
    }
  };

  const savePromotion = async (product: Product) => {
    if (!product.gratuito_inicio || !product.gratuito_fim) {
      toast.error('Informe o início e o término da promoção.');
      return;
    }
    if (new Date(product.gratuito_fim) <= new Date(product.gratuito_inicio)) {
      toast.error('O término precisa ser posterior ao início.');
      return;
    }

    setSaving(`promotion-${product.tool_id}`);
    try {
      await saveProduct(product, `Promoção de ${TOOL_LABELS[product.tool_id]} salva.`);
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a promoção.');
    } finally {
      setSaving(null);
    }
  };

  const clearPromotion = async (product: Product) => {
    setSaving(`promotion-${product.tool_id}`);
    try {
      await saveProduct({ ...product, gratuito_inicio: null, gratuito_fim: null }, 'Promoção removida.');
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível remover a promoção.');
    } finally {
      setSaving(null);
    }
  };

  const applyCampaignToAll = async () => {
    if (!campaign.start || !campaign.end) {
      toast.error('Informe o início e o término da promoção.');
      return;
    }

    const start = isoOrNull(campaign.start);
    const end = isoOrNull(campaign.end);
    if (!start || !end || new Date(end) <= new Date(start)) {
      toast.error('O término precisa ser posterior ao início.');
      return;
    }

    setSaving('campaign-all');
    try {
      for (const product of products) {
        await saveProduct({ ...product, gratuito_inicio: start, gratuito_fim: end });
      }
      toast.success('Promoção aplicada às seis calculadoras Pro.');
      setCampaign({ start: '', end: '' });
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível aplicar a promoção.');
    } finally {
      setSaving(null);
    }
  };

  const clearAllPromotions = async () => {
    const ok = await confirmHook.confirm({
      title: 'Remover promoções',
      message: 'Encerrar e remover as promoções das seis calculadoras?',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;
    setSaving('campaign-clear');
    try {
      for (const product of products) {
        await saveProduct({ ...product, gratuito_inicio: null, gratuito_fim: null });
      }
      toast.success('Todas as promoções foram removidas.');
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível remover as promoções.');
    } finally {
      setSaving(null);
    }
  };

  const createVoucher = async () => {
    setSaving('voucher');
    try {
      const result = await callAdminRpc<{ success: boolean; code: string }>('gsa_admin_create_calculator_pro_voucher', {
        p_tool_id: voucherForm.tool_id || null,
        p_expires_at: isoOrNull(voucherForm.expires_at),
        p_observacoes: voucherForm.observacoes || null,
      });
      setIssuedVoucher(result.code);
      setVoucherForm({ tool_id: 'termination', expires_at: '', observacoes: '' });
      toast.success('Voucher de uso único criado.');
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar o voucher.');
    } finally {
      setSaving(null);
    }
  };

  const toggleVoucher = async (voucher: Voucher) => {
    try {
      await callAdminRpc('gsa_admin_set_calculator_pro_voucher_status', {
        p_voucher_id: voucher.id,
        p_status: voucher.status === 'active' ? 'cancelled' : 'active',
      });
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar o voucher.');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="text-sm font-bold text-neutral-500">Carregando configurações das Calculadoras Pro...</p>
      </div>
    );
  }

  const synchronized = databaseProductCount === DEFAULT_PRODUCTS.length && !loadError;

  return (
    <div className="space-y-5">
      <ConfirmDialog {...confirmHook} />
      <div className="rounded-2xl border border-neutral-200 bg-[linear-gradient(135deg,#111827,#1f2937)] p-5 text-white sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-300/70">Produto digital GSA</p>
            <h2 className="mt-2 flex items-center gap-3 text-2xl font-black"><Crown className="h-6 w-6 text-amber-300" />Calculadoras Pro</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Preços, checkout InfinitePay, benefício automático de clientes, promoções públicas e vouchers.</p>
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-neutral-900"><RefreshCw className="h-4 w-4" />Atualizar</button>
        </div>
      </div>

      <section className={`rounded-2xl border p-4 sm:p-5 ${synchronized ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {synchronized ? <Database className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}
            <div>
              <p className={`text-sm font-black ${synchronized ? 'text-emerald-950' : 'text-amber-950'}`}>
                {synchronized ? 'Configurações sincronizadas com o banco' : 'Configurações locais exibidas — sincronização necessária'}
              </p>
              <p className={`mt-1 text-xs leading-5 ${synchronized ? 'text-emerald-800' : 'text-amber-800'}`}>
                {synchronized
                  ? 'As seis calculadoras obrigatórias foram localizadas e podem ser gerenciadas normalmente.'
                  : `O banco retornou ${databaseProductCount} de ${DEFAULT_PRODUCTS.length} configurações. Os valores padrão foram exibidos para a tela não permanecer em branco.`}
              </p>
              {loadError && <p className="mt-2 text-xs font-bold text-red-700">Detalhe: {loadError}</p>}
            </div>
          </div>
          {!synchronized && (
            <button type="button" onClick={() => void repairConfigurations()} disabled={saving === 'repair'} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-800 px-4 text-sm font-black text-white disabled:opacity-60">
              {saving === 'repair' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}Inicializar configurações
            </button>
          )}
        </div>
      </section>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <p className="text-sm font-black text-emerald-950">Benefício automático para todos os clientes GSA</p>
            <p className="mt-1 text-xs leading-5 text-emerald-800">O Pro é liberado automaticamente quando o cliente está logado, possui cadastro ativo e tem pelo menos uma fatura paga. Não existe liberação individual pelo administrador.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-neutral-200 bg-white p-2 lg:grid-cols-4">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black ${tab === id ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' : 'text-neutral-500 hover:bg-neutral-50'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'products' && (
        <div className="grid gap-5 xl:grid-cols-3">
          {products.map((product) => (
            <article key={product.tool_id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <div className="h-1 bg-[linear-gradient(90deg,#312e81,#6366f1,#c7d2fe)]" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[.15em] text-indigo-500">{TOOL_CODES[product.tool_id]} · {product.tool_id}</p>
                    <h3 className="mt-2 text-lg font-black text-neutral-900">{TOOL_LABELS[product.tool_id]}</h3>
                    <p className="mt-1 text-xs text-neutral-500">{product.nome}</p>
                  </div>
                  <button type="button" onClick={() => updateProduct(product.tool_id, { ativo: !product.ativo })} aria-label={product.ativo ? 'Desativar calculadora' : 'Ativar calculadora'} className={`relative h-7 w-12 rounded-full ${product.ativo ? 'bg-emerald-500' : 'bg-neutral-300'}`}>
                    <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${product.ativo ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <label className="text-xs font-black text-neutral-600">Preço do acesso (R$)
                    <input type="number" min={0} step="0.01" inputMode="decimal" value={(product.preco_centavos / 100).toFixed(2)} onChange={(event) => updateProduct(product.tool_id, { preco_centavos: Math.round(Number(event.target.value || 0) * 100) })} className="mt-2 min-h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
                  </label>
                  <label className="text-xs font-black text-neutral-600">Duração após compra
                    <input type="number" min={15} inputMode="numeric" value={product.duracao_acesso_minutos} onChange={(event) => updateProduct(product.tool_id, { duracao_acesso_minutos: Number(event.target.value) })} className="mt-2 min-h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
                    <span className="mt-1 block text-[10px] font-medium text-neutral-400">{durationLabel(product.duracao_acesso_minutos)}</span>
                  </label>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-xs font-black text-neutral-600">Regra de Bloqueio Pro</label>
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-neutral-100 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => updateProduct(product.tool_id, { modo_bloqueio: 'total' })}
                      className={`min-h-11 rounded-lg p-2.5 text-left font-black transition ${
                        (product.modo_bloqueio || 'total') === 'total'
                          ? 'bg-white text-indigo-900 shadow-sm ring-1 ring-indigo-200'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      🔒 Bloqueio Total
                      <span className="mt-0.5 block text-[9px] font-normal leading-3 text-neutral-500">Impede uso e cálculo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => updateProduct(product.tool_id, { modo_bloqueio: 'partial' })}
                      className={`min-h-11 rounded-lg p-2.5 text-left font-black transition ${
                        product.modo_bloqueio === 'partial'
                          ? 'bg-white text-indigo-900 shadow-sm ring-1 ring-indigo-200'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      📄 Bloqueio Parcial
                      <span className="mt-0.5 block text-[9px] font-normal leading-3 text-neutral-500">Bloqueia apenas PDF</span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-xs leading-5 text-neutral-600">A elegibilidade de clientes é automática e não pode ser desligada por calculadora.</div>

                <button type="button" onClick={() => void saveProductConfiguration(product)} disabled={saving === product.tool_id} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 text-sm font-black text-white disabled:opacity-50">
                  {saving === product.tool_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar configuração
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === 'promotions' && (
        <div className="space-y-5">
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-700">Promoção pública</p>
                <h3 className="mt-2 flex items-center gap-2 text-xl font-black text-amber-950"><Megaphone className="h-5 w-5" />Liberar o Pro gratuitamente para qualquer pessoa</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-800">Durante o período programado, visitantes e clientes poderão usar as seis calculadoras Pro sem login, pagamento ou voucher.</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-black text-amber-900">Início da promoção
                    <input type="datetime-local" value={campaign.start} onChange={(event) => setCampaign({ ...campaign, start: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm" />
                  </label>
                  <label className="text-xs font-black text-amber-900">Término da promoção
                    <input type="datetime-local" value={campaign.end} onChange={(event) => setCampaign({ ...campaign, end: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm" />
                  </label>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => void applyCampaignToAll()} disabled={saving === 'campaign-all'} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-800 px-5 text-sm font-black text-white disabled:opacity-50">
                  {saving === 'campaign-all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}Aplicar às seis
                </button>
                <button type="button" onClick={() => void clearAllPromotions()} disabled={saving === 'campaign-clear'} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-5 text-sm font-black text-amber-900 disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />Remover todas
                </button>
              </div>
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-3">
            {products.map((product) => {
              const state = promotionState(product);
              const isSaving = saving === `promotion-${product.tool_id}`;
              return (
                <article key={product.tool_id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[.15em] text-indigo-500">Promoção individual</p>
                      <h3 className="mt-2 text-lg font-black text-neutral-900">{TOOL_LABELS[product.tool_id]}</h3>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${state.className}`}>{state.label}</span>
                  </div>
                  <div className="mt-5 space-y-4">
                    <label className="block text-xs font-black text-neutral-600">Início
                      <input type="datetime-local" value={localInput(product.gratuito_inicio)} onChange={(event) => updateProduct(product.tool_id, { gratuito_inicio: isoOrNull(event.target.value) })} className="mt-2 min-h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm" />
                    </label>
                    <label className="block text-xs font-black text-neutral-600">Término
                      <input type="datetime-local" value={localInput(product.gratuito_fim)} onChange={(event) => updateProduct(product.tool_id, { gratuito_fim: isoOrNull(event.target.value) })} className="mt-2 min-h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm" />
                    </label>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => void clearPromotion(product)} disabled={isSaving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-200 px-3 text-xs font-black text-neutral-600 disabled:opacity-50"><Trash2 className="h-4 w-4" />Remover</button>
                    <button type="button" onClick={() => void savePromotion(product)} disabled={isSaving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 text-xs font-black text-white disabled:opacity-50">{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar</button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'vouchers' && (
        <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h3 className="flex items-center gap-2 font-black"><KeyRound className="h-5 w-5 text-indigo-600" />Criar voucher de uma utilização</h3>
            <div className="mt-5 space-y-4">
              <label className="block text-xs font-black text-neutral-600">Calculadora
                <select value={voucherForm.tool_id} onChange={(event) => setVoucherForm({ ...voucherForm, tool_id: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm">
                  <option value="termination">Rescisão</option><option value="retirement">Aposentadoria</option><option value="vacation">Férias</option><option value="">Qualquer calculadora</option>
                </select>
              </label>
              <label className="block text-xs font-black text-neutral-600">Validade opcional
                <input type="datetime-local" value={voucherForm.expires_at} onChange={(event) => setVoucherForm({ ...voucherForm, expires_at: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm" />
              </label>
              <label className="block text-xs font-black text-neutral-600">Observações
                <textarea rows={3} value={voucherForm.observacoes} onChange={(event) => setVoucherForm({ ...voucherForm, observacoes: event.target.value })} className="mt-2 w-full rounded-xl border border-neutral-200 p-3 text-sm" />
              </label>
              <button type="button" onClick={() => void createVoucher()} disabled={saving === 'voucher'} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-black text-white disabled:opacity-50">{saving === 'voucher' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}Gerar voucher</button>
            </div>
            {issuedVoucher && (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-black text-emerald-800">Código exibido somente agora</p>
                <div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-sm font-black text-emerald-900">{issuedVoucher}</code><button type="button" onClick={() => { void navigator.clipboard.writeText(issuedVoucher); toast.success('Código copiado.'); }} className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-700 text-white"><Copy className="h-4 w-4" /></button></div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h3 className="font-black">Vouchers emitidos</h3>
            <div className="mt-4 space-y-3">
              {snapshot.vouchers.length === 0 && <p className="text-sm text-neutral-400">Nenhum voucher emitido.</p>}
              {snapshot.vouchers.map((voucher) => (
                <article key={voucher.id} className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="font-mono text-sm font-black">••••••{voucher.code_hint}</p><p className="mt-1 text-xs text-neutral-500">{voucher.tool_id ? TOOL_LABELS[voucher.tool_id] : 'Qualquer calculadora'} · validade {dateTime(voucher.expires_at)}</p></div>
                  <div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${voucher.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>{voucher.status}</span>{['active', 'cancelled'].includes(voucher.status) && <button type="button" onClick={() => void toggleVoucher(voucher)} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-black">{voucher.status === 'active' ? 'Cancelar' : 'Reativar'}</button>}</div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'payments' && (
        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 p-5"><h3 className="flex items-center gap-2 font-black"><CreditCard className="h-5 w-5 text-indigo-600" />Pagamentos InfinitePay</h3><p className="mt-1 text-xs text-neutral-500">O acesso é concedido somente após verificação do pagamento no servidor.</p></div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-neutral-50 text-[10px] font-black uppercase tracking-wider text-neutral-500"><tr><th className="px-4 py-3">Pedido</th><th className="px-4 py-3">Calculadora</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Data</th></tr></thead>
              <tbody className="divide-y divide-neutral-100">
                {snapshot.payments.map((payment) => (
                  <tr key={payment.id}><td className="px-4 py-3 font-mono text-xs">{String(payment.order_nsu).slice(0, 8)}…</td><td className="px-4 py-3 font-bold">{TOOL_LABELS[payment.tool_id]}</td><td className="px-4 py-3 text-neutral-500">{payment.cliente_nome || 'Visitante'}</td><td className="px-4 py-3 font-black">{money(payment.valor_centavos)}</td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${payment.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : payment.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{payment.status === 'paid' ? <CheckCircle2 className="h-3 w-3" /> : payment.status === 'failed' ? <XCircle className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}{payment.status}</span></td><td className="px-4 py-3 text-xs text-neutral-500">{dateTime(payment.paid_at || payment.created_at)}</td></tr>
                ))}
              </tbody>
            </table>
            {snapshot.payments.length === 0 && <p className="p-8 text-center text-sm text-neutral-400">Nenhum pagamento registrado.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
