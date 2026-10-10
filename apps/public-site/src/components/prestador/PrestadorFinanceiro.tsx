import { useEffect, useMemo, useState } from 'react';
import { copyToClipboard } from '../../lib/utils';
import { ArrowDownCircle, ArrowDownRight, ArrowUpRight, CheckCircle, Clock, Copy, DollarSign, Wallet, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { providerOperations } from '../../lib/providerOperations';
import { logService } from '../../lib/logService';
import { useProviderNotifications } from '../../hooks/useProviderNotifications';
import { Modal } from '../ui/Modal';
import { useWhatsAppDocument } from '../../hooks/useWhatsAppDocument';
import { generateExtratoPDF } from '../../lib/pdf';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { Send } from 'lucide-react';

type Transaction = {
  id: string;
  tipo: 'credito' | 'debito';
  valor: number;
  descricao: string;
  status: string;
  created_at: string;
};

type Withdrawal = {
  id: string;
  valor: number;
  valor_liquido?: number | null;
  taxa_aplicada?: number | null;
  tipo_chave_pix?: string | null;
  chave_pix?: string | null;
  status: string;
  data_vencimento?: string | null;
  created_at: string;
  motivo_cancelamento?: string | null;
  observacao?: string | null;
};

export function PrestadorFinanceiro({ prestadorId, initialItemId }: { prestadorId: string; initialItemId?: string }) {
  const { refreshCounts } = useProviderNotifications();
  const [activeTab, setActiveTab] = useState<'extrato' | 'saques'>('extrato');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestValue, setRequestValue] = useState('');
  const [pixType, setPixType] = useState('cpf');
  const [pixKey, setPixKey] = useState('');
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { isSendingWhatsApp, sendToWhatsApp } = useWhatsAppDocument();

  const loadData = async () => {
    try {
      const [snapshot, transactionResult, withdrawalResult] = await Promise.all([
        providerOperations.financialSnapshot(),
        supabase
          .from('prestador_transacoes')
          .select('id,tipo,valor,descricao,status,created_at')
          .eq('prestador_id', prestadorId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('prestador_saques')
          .select('id,valor,valor_liquido,taxa_aplicada,tipo_chave_pix,chave_pix,status,data_vencimento,created_at,motivo_cancelamento,observacao')
          .eq('prestador_id', prestadorId)
          .order('created_at', { ascending: false })
          .limit(100),
      ]);
      if (transactionResult.error) throw transactionResult.error;
      if (withdrawalResult.error) throw withdrawalResult.error;
      setBalance(Number(snapshot?.saldo || 0));
      setTransactions((transactionResult.data || []) as Transaction[]);
      setWithdrawals((withdrawalResult.data || []) as Withdrawal[]);
    } catch (error: any) {
      console.error('Erro ao carregar financeiro:', error);
      toast.error(error?.message || 'Não foi possível carregar o financeiro.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    const channel = supabase.channel(`provider-finance-${prestadorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_transacoes', filter: `prestador_id=eq.${prestadorId}` }, () => void loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_saques', filter: `prestador_id=eq.${prestadorId}` }, () => void loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel).catch(console.error); };
  }, [prestadorId]);

  useEffect(() => {
    if (!initialItemId || (!transactions.length && !withdrawals.length)) return;
    const transaction = transactions.find((item) => item.id === initialItemId);
    const withdrawal = withdrawals.find((item) => item.id === initialItemId);
    if (withdrawal) {
      setActiveTab('saques');
      setSelectedWithdrawal(withdrawal);
    } else if (transaction) {
      setActiveTab('extrato');
    }
    setHighlightedId(initialItemId);
    const timer = window.setTimeout(() => setHighlightedId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [initialItemId, transactions, withdrawals]);

  const pendingTotal = useMemo(() => withdrawals.filter((item) => item.status === 'pendente').reduce((sum, item) => sum + Number(item.valor || 0), 0), [withdrawals]);

  const openRequest = () => {
    if (balance <= 0) {
      toast.error('Você não possui saldo disponível.');
      return;
    }
    setRequestValue(balance.toFixed(2).replace('.', ','));
    setRequestOpen(true);
  };

  const requestWithdrawal = async () => {
    if (submitting) return;
    const value = Number(requestValue.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0 || value > balance) {
      toast.error('Informe um valor válido dentro do saldo disponível.');
      return;
    }
    if (!pixType || !pixKey.trim()) {
      toast.error('Informe o tipo e a chave PIX.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await providerOperations.requestWithdrawal(value, pixType, pixKey.trim());
      await logService.logAction({ ator_tipo: 'prestador', ator_id: prestadorId, acao: 'SOLICITAR_SAQUE', detalhes: `Solicitou saque de ${formatCurrency(value)} via PIX.` });
      toast.success('Solicitação de saque enviada com segurança.');
      setRequestOpen(false);
      setPixKey('');
      await Promise.all([loadData(), refreshCounts()]);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível solicitar o saque.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelWithdrawal = async () => {
    if (!selectedWithdrawal || !cancelReason.trim() || submitting) return;
    setSubmitting(true);
    try {
      await providerOperations.cancelWithdrawal(selectedWithdrawal.id, cancelReason.trim());
      await logService.logAction({ ator_tipo: 'prestador', ator_id: prestadorId, acao: 'CANCELAR_SAQUE', detalhes: `Cancelou o saque ${selectedWithdrawal.id.slice(0, 8)}.` });
      toast.success('Saque cancelado e valor devolvido à carteira.');
      setSelectedWithdrawal(null);
      setCancelReason('');
      await Promise.all([loadData(), refreshCounts()]);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível cancelar o saque.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyPix = async (value?: string | null) => {
    if (!value) return;
    await copyToClipboard(value);
    toast.success('Chave PIX copiada.');
  };

  if (loading) return <div className="flex justify-center py-16"><div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-900 border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[2rem] bg-neutral-900 p-6 text-white shadow-xl lg:p-8">
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Saldo disponível</p><p className="mt-2 text-4xl font-black">{formatCurrency(balance)}</p><p className="mt-2 text-sm text-white/60">Saldos e débitos são calculados diretamente no banco de dados.</p></div>
          <button onClick={openRequest} disabled={balance <= 0 || pendingTotal > 0} className="flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-black text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"><ArrowDownCircle className="h-5 w-5" />{pendingTotal > 0 ? 'Saque pendente' : 'Solicitar saque'}</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5"><p className="text-xs font-black uppercase tracking-widest text-neutral-400">Disponível</p><p className="mt-2 text-2xl font-black text-emerald-600">{formatCurrency(balance)}</p></div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5"><p className="text-xs font-black uppercase tracking-widest text-neutral-400">Em processamento</p><p className="mt-2 text-2xl font-black text-amber-600">{formatCurrency(pendingTotal)}</p></div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2 rounded-2xl bg-neutral-100 p-1 sm:w-max">
          <button onClick={() => setActiveTab('extrato')} className={`flex-1 rounded-xl px-6 py-3 text-sm font-black sm:flex-none ${activeTab === 'extrato' ? 'bg-white shadow-sm' : 'text-neutral-500'}`}>Extrato</button>
          <button onClick={() => setActiveTab('saques')} className={`flex-1 rounded-xl px-6 py-3 text-sm font-black sm:flex-none ${activeTab === 'saques' ? 'bg-white shadow-sm' : 'text-neutral-500'}`}>Saques ({withdrawals.length})</button>
        </div>
        {activeTab === 'extrato' && (
          <button
            onClick={async () => {
              setIsGenerating(true);
              try {
                const { data: pData } = await supabase.from('prestadores').select('nome_razao, telefone').eq('id', prestadorId).single();
                if (!pData?.telefone) { toast.error("Telefone não encontrado."); setIsGenerating(false); return; }
                
                const formattedTransactions = transactions.map(t => ({
                  data: t.created_at,
                  descricao: t.descricao,
                  tipo: t.tipo === 'credito' ? 'entrada' : 'saida',
                  valor: Math.abs(t.valor)
                }));
                
                const prestadorNome = pData.nome_razao || 'Prestador';
                const doc = await generateExtratoPDF(formattedTransactions as any, prestadorNome, { returnDoc: true }) as any;
                const pdfBase64 = doc.output('datauristring');
                
                const msg = whatsappNotificationService.gerarMensagemWhatsApp({
                  tipo: 'extrato' as any,
                  clienteNome: prestadorNome,
                });
                
                await sendToWhatsApp(pData.telefone, msg, pdfBase64, `extrato_prestador_${new Date().getTime()}.pdf`);
              } catch (e) {
                console.error(e);
                toast.error("Erro ao gerar extrato.");
              } finally {
                setIsGenerating(false);
              }
            }}
            disabled={isGenerating || isSendingWhatsApp || transactions.length === 0}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-100 px-4 py-3 text-xs font-bold text-emerald-800 hover:bg-emerald-200 border border-emerald-200 transition-all disabled:opacity-50"
          >
            {isSendingWhatsApp ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" /> : <Send className="h-4 w-4" />}
            Enviar WhatsApp
          </button>
        )}
      </div>

      {activeTab === 'extrato' && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          {transactions.length === 0 ? <Empty icon={Wallet} text="Nenhuma movimentação encontrada." /> : transactions.map((item) => (
            <div id={`transacao-${item.id}`} key={item.id} className={`flex items-center justify-between gap-4 border-b border-neutral-100 p-4 last:border-0 ${highlightedId === item.id ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400' : ''}`}>
              <div className="flex min-w-0 items-center gap-3"><span className={`rounded-full p-2 ${item.tipo === 'credito' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{item.tipo === 'credito' ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}</span><div className="min-w-0"><p className="truncate font-bold text-neutral-900">{item.descricao}</p><p className="text-xs text-neutral-400">{formatDateTime(item.created_at)}</p></div></div>
              <p className={`shrink-0 font-black ${item.tipo === 'credito' ? 'text-emerald-600' : 'text-red-600'}`}>{item.tipo === 'credito' ? '+' : '-'} {formatCurrency(Number(item.valor))}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'saques' && (
        <div className="grid gap-4">
          {withdrawals.length === 0 ? <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5"><Empty icon={DollarSign} text="Nenhuma solicitação de saque." /></div> : withdrawals.map((item) => (
            <button id={`saque-${item.id}`} key={item.id} onClick={() => setSelectedWithdrawal(item)} className={`flex w-full items-center justify-between gap-4 rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-md ${highlightedId === item.id ? 'ring-2 ring-indigo-500' : ''}`}>
              <div><p className="font-black">{formatCurrency(Number(item.valor))}</p><p className="mt-1 text-xs text-neutral-400">Solicitado em {formatDateTime(item.created_at)}</p></div>
              <StatusBadge status={item.status} />
            </button>
          ))}
        </div>
      )}

      <Modal isOpen={requestOpen} onClose={() => !submitting && setRequestOpen(false)} title="Solicitar saque">
        <div className="space-y-4"><div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Saldo disponível: <strong>{formatCurrency(balance)}</strong>. Apenas uma solicitação pendente é permitida.</div><Field label="Valor" value={requestValue} onChange={setRequestValue} inputMode="decimal" /><div><label className="mb-1 block text-sm font-bold">Tipo da chave PIX</label><select value={pixType} onChange={(event) => setPixType(event.target.value)} className="w-full rounded-xl border border-neutral-200 p-3"><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="telefone">Telefone</option><option value="aleatoria">Chave aleatória</option></select></div><Field label="Chave PIX" value={pixKey} onChange={setPixKey} /><button disabled={submitting} onClick={requestWithdrawal} className="w-full rounded-xl bg-neutral-900 py-3 font-black text-white disabled:opacity-50">{submitting ? 'Processando...' : 'Confirmar solicitação'}</button></div>
      </Modal>

      <Modal isOpen={!!selectedWithdrawal} onClose={() => !submitting && setSelectedWithdrawal(null)} title="Detalhes do saque">
        {selectedWithdrawal && <div className="space-y-4"><div className="flex items-center justify-between rounded-xl bg-neutral-50 p-4"><div><p className="text-xs font-black uppercase tracking-widest text-neutral-400">Valor</p><p className="mt-1 text-2xl font-black">{formatCurrency(Number(selectedWithdrawal.valor))}</p></div><StatusBadge status={selectedWithdrawal.status} /></div><div className="grid gap-4 sm:grid-cols-2"><Info label="Tipo PIX" value={selectedWithdrawal.tipo_chave_pix || '-'} /><div><p className="text-xs font-black uppercase tracking-widest text-neutral-400">Chave PIX</p><button onClick={() => copyPix(selectedWithdrawal.chave_pix)} className="mt-1 flex items-center gap-2 break-all text-left font-bold text-indigo-600">{selectedWithdrawal.chave_pix || '-'}<Copy className="h-4 w-4 shrink-0" /></button></div><Info label="Solicitado" value={formatDateTime(selectedWithdrawal.created_at)} /><Info label="Vencimento previsto" value={selectedWithdrawal.data_vencimento ? formatDateTime(selectedWithdrawal.data_vencimento) : '-'} /></div>{selectedWithdrawal.motivo_cancelamento && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{selectedWithdrawal.motivo_cancelamento}</div>}{selectedWithdrawal.status === 'pendente' && <><div><label className="mb-1 block text-sm font-bold">Motivo do cancelamento</label><textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} className="h-24 w-full rounded-xl border border-neutral-200 p-3" /></div><button disabled={submitting || !cancelReason.trim()} onClick={cancelWithdrawal} className="w-full rounded-xl bg-red-600 py-3 font-black text-white disabled:opacity-50">{submitting ? 'Cancelando...' : 'Cancelar saque e estornar valor'}</button></>}</div>}
      </Modal>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = status === 'pago' || status === 'concluido'
    ? { icon: CheckCircle, label: 'Pago', className: 'bg-emerald-50 text-emerald-700' }
    : status === 'cancelado' || status === 'rejeitado'
      ? { icon: XCircle, label: status === 'cancelado' ? 'Cancelado' : 'Rejeitado', className: 'bg-red-50 text-red-700' }
      : { icon: Clock, label: 'Pendente', className: 'bg-amber-50 text-amber-700' };
  const Icon = config.icon;
  return <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${config.className}`}><Icon className="h-3.5 w-3.5" />{config.label}</span>;
}

function Empty({ icon: Icon, text }: { icon: typeof Wallet; text: string }) {
  return <div className="p-12 text-center text-neutral-400"><Icon className="mx-auto h-10 w-10" /><p className="mt-3 text-sm font-bold">{text}</p></div>;
}

function Field({ label, value, onChange, inputMode }: { label: string; value: string; onChange: (value: string) => void; inputMode?: 'decimal' | 'text' }) {
  return <div><label className="mb-1 block text-sm font-bold">{label}</label><input inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-neutral-200 p-3 outline-none focus:border-indigo-500" /></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-black uppercase tracking-widest text-neutral-400">{label}</p><p className="mt-1 break-words font-bold">{value}</p></div>;
}
