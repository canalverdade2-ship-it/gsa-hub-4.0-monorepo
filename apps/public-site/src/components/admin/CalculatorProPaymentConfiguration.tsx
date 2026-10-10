import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../lib/adminRpc';

type RuntimeConfig = {
  infinitepay_handle?: string | null;
  checkout_ready?: boolean;
  updated_at?: string | null;
};

type Snapshot = {
  runtime_config?: RuntimeConfig | null;
};

export function CalculatorProPaymentConfiguration() {
  const [handle, setHandle] = useState('');
  const [ready, setReady] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await callAdminRpc<Snapshot>('gsa_admin_calculator_pro_snapshot');
      const config = snapshot?.runtime_config || null;
      setHandle(config?.infinitepay_handle || '');
      setReady(Boolean(config?.checkout_ready));
      setUpdatedAt(config?.updated_at || null);
    } catch (loadError: unknown) {
      const message = loadError instanceof Error ? loadError.message : 'Não foi possível consultar a integração InfinitePay.';
      setError(message);
      setReady(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const normalized = handle.trim().replace(/^\$/, '');
    if (normalized && !/^[A-Za-z0-9._-]{2,100}$/.test(normalized)) {
      toast.error('Informe uma InfiniteTag válida, sem o símbolo $.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await callAdminRpc<RuntimeConfig & { success?: boolean }>('gsa_admin_save_calculator_pro_runtime_config', {
        p_infinitepay_handle: normalized || null,
      });
      if (!result?.success) throw new Error('O banco não confirmou a atualização da InfinitePay.');
      setHandle(result.infinitepay_handle || '');
      setReady(Boolean(result.checkout_ready));
      setUpdatedAt(result.updated_at || null);
      toast.success(result.checkout_ready
        ? 'InfinitePay configurada. O checkout das Calculadoras Pro foi habilitado.'
        : 'InfinitePay removida. O pagamento online foi desabilitado.');
    } catch (saveError: unknown) {
      const message = saveError instanceof Error ? saveError.message : 'Não foi possível salvar a InfinitePay.';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${ready ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${ready ? 'bg-emerald-700 text-white' : 'bg-amber-800 text-white'}`}>
            <CreditCard className="h-6 w-6" />
          </span>
          <div>
            <p className={`text-[10px] font-black uppercase tracking-[.18em] ${ready ? 'text-emerald-700' : 'text-amber-700'}`}>Integração de pagamento</p>
            <h2 className={`mt-1 text-xl font-black ${ready ? 'text-emerald-950' : 'text-amber-950'}`}>Checkout InfinitePay</h2>
            <p className={`mt-2 max-w-3xl text-sm leading-6 ${ready ? 'text-emerald-800' : 'text-amber-800'}`}>
              Informe a InfiniteTag da conta que receberá os pagamentos. Digite somente o nome exibido depois do símbolo <strong>$</strong> no aplicativo InfinitePay.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-current/15 bg-white px-4 text-sm font-black text-neutral-700 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Atualizar status
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label className={`block text-sm font-black ${ready ? 'text-emerald-950' : 'text-amber-950'}`}>
          InfiniteTag da conta
          <div className="mt-2 flex min-h-12 overflow-hidden rounded-xl border border-black/10 bg-white focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-100">
            <span className="flex items-center border-r border-neutral-200 bg-neutral-50 px-4 font-black text-neutral-500">$</span>
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value.replace(/^\$/, ''))}
              placeholder="sua-infinite-tag"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 px-4 text-sm font-bold text-neutral-900 outline-none"
            />
          </div>
        </label>
        <button type="button" onClick={() => void save()} disabled={loading || saving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 text-sm font-black text-white disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar integração
        </button>
      </div>

      <div className={`mt-5 flex items-start gap-3 rounded-xl border p-4 text-xs leading-5 ${ready ? 'border-emerald-200 bg-white/70 text-emerald-900' : 'border-amber-200 bg-white/70 text-amber-900'}`}>
        {ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}
        <div>
          <p className="font-black">{ready ? 'Checkout habilitado' : 'Checkout desabilitado'}</p>
          <p className="mt-1">{ready
            ? 'A página pública poderá gerar links da InfinitePay usando o preço e a duração registrados para cada calculadora.'
            : 'Enquanto a InfiniteTag não for cadastrada, o botão de pagamento ficará bloqueado. Voucher, promoção e benefício automático de clientes continuam funcionando.'}</p>
          {updatedAt && <p className="mt-2 text-[10px] font-bold opacity-70">Última atualização: {new Date(updatedAt).toLocaleString('pt-BR')}</p>}
          {error && <p className="mt-2 font-bold text-red-700">{error}</p>}
        </div>
      </div>

      <div className="mt-4 flex gap-3 rounded-xl border border-neutral-200 bg-white/70 p-4 text-xs leading-5 text-neutral-600">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
        <span>A InfiniteTag é o identificador público da conta recebedora. Nenhuma senha bancária ou chave privada é solicitada por este painel.</span>
      </div>
    </section>
  );
}
