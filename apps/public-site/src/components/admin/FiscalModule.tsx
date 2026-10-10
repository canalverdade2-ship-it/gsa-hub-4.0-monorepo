import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import {
  Archive,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Printer,
  RefreshCw,
  Search,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../lib/adminRpc';
import { formatCurrency, formatDate, formatDateTime } from '../../lib/utils';
import { removePrivateDocument, uploadPrivateDocument } from '../../lib/privateStorage';
import { SecureAttachmentButton } from '../ui/SecureAttachmentButton';
import { useRealtimeSubscription } from '../../hooks/useRealtime';

type Props = { initialItemId?: string; colaboradorId?: string; colaboradorNome?: string };
type Tab = 'pendentes' | 'emitidas' | 'canceladas' | 'todas';
type PagedResult = { items: any[]; total: number; page: number; page_size: number };

const PAGE_SIZE = 40;

const statusByTab: Record<Tab, string | null> = {
  pendentes: 'pendente_emissao',
  emitidas: 'emitida',
  canceladas: 'cancelada',
  todas: null,
};

const statusOptions = ['pendente_emissao', 'emitida', 'cancelada', 'inutilizada', 'arquivada'];

function Overlay({ children, onClose, printable = false }: { children: React.ReactNode; onClose: () => void; printable?: boolean }) {
  return <div className={`fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 ${printable ? 'print:static print:block print:bg-white print:p-0' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div role="dialog" aria-modal="true" className={`max-h-[92vh] w-full max-w-[96vw] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl sm:p-8 ${printable ? 'print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:shadow-none' : ''}`}>{children}</div></div>;
}

export function FiscalModule({ initialItemId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('pendentes');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [result, setResult] = useState<PagedResult>({ items: [], total: 0, page: 1, page_size: PAGE_SIZE });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [numeroNota, setNumeroNota] = useState('');
  const [newStatus, setNewStatus] = useState('emitida');
  const [statusReason, setStatusReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setPage(1); }, [activeTab]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callAdminRpc<PagedResult>('gsa_admin_list_resource', {
        p_resource: 'ordens_fiscais',
        p_page: page,
        p_page_size: PAGE_SIZE,
        p_search: appliedSearch || null,
        p_status: statusByTab[activeTab],
      });
      setResult({ items: Array.isArray(data?.items) ? data.items : [], total: Number(data?.total || 0), page: Number(data?.page || page), page_size: Number(data?.page_size || PAGE_SIZE) });
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível carregar as ordens fiscais.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, appliedSearch, page]);

  useEffect(() => { void load(); }, [load]);

  useRealtimeSubscription([
    { table: 'ordens_fiscais', onChange: load, debounceMs: 300 },
    { table: 'faturas', onChange: load, debounceMs: 300 },
  ], [load]);

  useEffect(() => {
    if (!initialItemId || result.items.length === 0) return;
    const item = result.items.find((entry) => entry.id === initialItemId);
    if (item) setSelected(item);
  }, [initialItemId, result.items]);

  const totals = useMemo(() => ({
    quantidade: result.total,
    valorPagina: result.items.reduce((sum, item) => sum + Number(item.valor_total || 0), 0),
  }), [result]);

  const openUpload = (item: any) => {
    setSelected(item);
    setPdfFile(null);
    setXmlFile(null);
    setNumeroNota(item.numero_nota || '');
    setShowUpload(true);
  };

  const submitUpload = async () => {
    if (!selected || (!pdfFile && !xmlFile)) return toast.error('Selecione ao menos o PDF ou XML.');
    setSaving(true);
    const uploadedReferences: string[] = [];
    try {
      let pdfReference = selected.arquivo_nf_url || null;
      let xmlReference = selected.arquivo_nf_xml_url || null;
      if (pdfFile) {
        const uploaded = await uploadPrivateDocument(pdfFile, { scope: 'fiscal', ownerId: selected.id, context: 'notas-fiscais', contextId: selected.id });
        pdfReference = uploaded.reference;
        uploadedReferences.push(uploaded.reference);
      }
      if (xmlFile) {
        const uploaded = await uploadPrivateDocument(xmlFile, { scope: 'fiscal', ownerId: selected.id, context: 'notas-fiscais', contextId: selected.id });
        xmlReference = uploaded.reference;
        uploadedReferences.push(uploaded.reference);
      }

      await callAdminRpc('gsa_admin_fiscal_update', {
        p_ordem_id: selected.id,
        p_action: 'anexar',
        p_payload: { pdf_reference: pdfReference, xml_reference: xmlReference, numero_nota: numeroNota.trim() || null },
      });
      toast.success('Nota fiscal registrada com documentos privados.');
      setShowUpload(false);
      setSelected(null);
      await load();
    } catch (error: any) {
      await Promise.all(uploadedReferences.map((reference) => removePrivateDocument(reference).catch(() => undefined)));
      toast.error(error?.message || 'Não foi possível registrar a nota fiscal.');
    } finally {
      setSaving(false);
    }
  };

  const submitStatus = async () => {
    if (!selected) return;
    if (['cancelada', 'inutilizada'].includes(newStatus) && statusReason.trim().length < 3) return toast.error('Informe o motivo da alteração.');
    setSaving(true);
    try {
      await callAdminRpc('gsa_admin_fiscal_update', {
        p_ordem_id: selected.id,
        p_action: 'status',
        p_payload: { status: newStatus, observacoes: statusReason.trim() || null },
      });
      toast.success('Status fiscal atualizado e auditado.');
      setShowStatus(false);
      setSelected(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível atualizar o status.');
    } finally {
      setSaving(false);
    }
  };

  const archive = async (item: any) => {
    if (!window.confirm(`Arquivar a ordem fiscal ${item.codigo_fiscal || String(item.id).slice(0, 8)}?`)) return;
    try {
      await callAdminRpc('gsa_admin_fiscal_update', { p_ordem_id: item.id, p_action: 'arquivar', p_payload: {} });
      toast.success('Ordem fiscal arquivada.');
      if (selected?.id === item.id) setSelected(null);
      await load();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível arquivar a ordem.');
    }
  };

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return <div className="space-y-6 pb-10">
    <header className="rounded-[2rem] bg-neutral-950 p-6 text-white shadow-xl"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Documentos privados</p><h1 className="mt-2 flex items-center gap-3 text-2xl font-black"><FileText className="h-6 w-6 text-teal-400" /> Gestão Fiscal</h1><p className="mt-2 text-sm text-white/55">PDF e XML ficam em bucket privado; exclusão permanente foi substituída por arquivamento.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-neutral-900 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button></div></header>

    <div className="grid gap-4 sm:grid-cols-2"><article className="rounded-2xl border border-neutral-200 bg-white p-5"><p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Registros encontrados</p><p className="mt-2 text-3xl font-black">{totals.quantidade}</p></article><article className="rounded-2xl border border-neutral-200 bg-white p-5"><p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Valor da página atual</p><p className="mt-2 text-3xl font-black">{formatCurrency(totals.valorPagina)}</p></article></div>

    <div className="grid grid-cols-4 gap-2 rounded-2xl border border-neutral-200 bg-white p-2">{(['pendentes', 'emitidas', 'canceladas', 'todas'] as Tab[]).map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`rounded-xl px-3 py-3 text-sm font-bold ${activeTab === tab ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200' : 'text-neutral-500 hover:bg-neutral-50'}`}>{tab}</button>)}</div>

    <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { setPage(1); setAppliedSearch(search.trim()); } }} placeholder="Código, cliente ou descrição" className="w-full rounded-xl border border-neutral-200 py-3 pl-10 pr-4 text-sm" /></div><button type="button" onClick={() => { setPage(1); setAppliedSearch(search.trim()); }} className="rounded-xl bg-teal-600 px-5 text-sm font-black text-white">Buscar</button></div>

    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">{loading ? <div className="flex min-h-[320px] items-center justify-center"><RefreshCw className="h-8 w-8 animate-spin text-teal-600" /></div> : result.items.length === 0 ? <div className="p-14 text-center text-neutral-400">Nenhuma ordem fiscal encontrada.</div> : <div className="divide-y divide-neutral-100">{result.items.map((item) => <article key={item.id} className="p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><button type="button" onClick={() => setSelected(item)} className="min-w-0 text-left"><div className="flex items-center gap-2"><StatusIcon status={item.status_emissao} /><span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{item.status_emissao || 'sem status'}</span></div><h2 className="mt-2 truncate font-black text-neutral-900">{item.codigo_fiscal || `Ordem ${String(item.id).slice(0, 8)}`}</h2><p className="mt-1 truncate text-sm text-neutral-500">{item.cliente_nome || 'Cliente não informado'} · {item.descricao_item || 'Sem descrição'}</p><p className="mt-1 text-sm font-black text-teal-700">{formatCurrency(Number(item.valor_total || 0))}</p></button><div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => openUpload(item)} className="flex items-center gap-2 rounded-xl bg-teal-50 px-4 py-2.5 text-xs font-black text-teal-700"><Upload className="h-4 w-4" /> Anexar NF</button><button type="button" onClick={() => { setSelected(item); setNewStatus(item.status_emissao || 'emitida'); setStatusReason(''); setShowStatus(true); }} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-xs font-black">Alterar status</button><button type="button" onClick={() => void archive(item)} className="flex items-center gap-2 rounded-xl bg-neutral-100 px-4 py-2.5 text-xs font-black text-neutral-700"><Archive className="h-4 w-4" /> Arquivar</button></div></div></article>)}</div>}</section>

    <div className="admin-pagination justify-between"><p className="text-xs font-bold text-neutral-400">Página {page} de {totalPages} · {result.total} registro(s)</p><div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-xl border border-neutral-200 p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded-xl border border-neutral-200 p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>

    {selected && !showUpload && !showStatus && <Overlay onClose={() => setSelected(null)} printable><div className="flex items-center justify-between print:hidden"><h2 className="text-2xl font-black">Detalhes fiscais</h2><div className="flex gap-2"><button type="button" onClick={() => window.print()} className="rounded-xl border border-neutral-200 p-2"><Printer className="h-4 w-4" /></button><button type="button" onClick={() => setSelected(null)} className="rounded-xl border border-neutral-200 p-2"><X className="h-4 w-4" /></button></div></div><div className="mt-6 border-b-2 border-neutral-900 pb-5"><h1 className="text-3xl font-black">Recibo Fiscal</h1><p className="mt-1 font-mono text-sm text-indigo-600">{selected.codigo_fiscal || selected.id}</p></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Detail label="Cliente" value={selected.cliente_nome} /><Detail label="CPF/CNPJ" value={selected.cliente_documento} /><Detail label="Descrição" value={selected.descricao_item} /><Detail label="Valor total" value={formatCurrency(Number(selected.valor_total || 0))} /><Detail label="Status de emissão" value={selected.status_emissao} /><Detail label="Número da nota" value={selected.numero_nota} /><Detail label="Data de emissão" value={selected.data_emissao ? formatDate(selected.data_emissao) : null} /><Detail label="Pagamento" value={selected.status_pagamento} /></div>{(selected.arquivo_nf_url || selected.arquivo_nf_xml_url) && <div className="mt-6 space-y-2 print:hidden"><h3 className="text-sm font-black uppercase tracking-wider text-neutral-500">Documentos privados</h3>{selected.arquivo_nf_url && <SecureAttachmentButton reference={selected.arquivo_nf_url} fileName={`nota-${selected.numero_nota || selected.id}.pdf`} mimeType="application/pdf" className="bg-teal-50 text-teal-700" />}{selected.arquivo_nf_xml_url && <SecureAttachmentButton reference={selected.arquivo_nf_xml_url} fileName={`nota-${selected.numero_nota || selected.id}.xml`} mimeType="application/xml" className="bg-indigo-50 text-indigo-700" />}</div>}<p className="mt-8 text-xs text-neutral-400">Gerado em {formatDateTime(new Date().toISOString())}</p></Overlay>}

    {showUpload && selected && <Overlay onClose={() => setShowUpload(false)}><div className="flex items-center justify-between"><h2 className="text-2xl font-black">Anexar nota fiscal</h2><button type="button" onClick={() => setShowUpload(false)}><X className="h-5 w-5" /></button></div><div className="mt-6 space-y-4"><label className="block text-sm font-bold">Número da nota<input value={numeroNota} onChange={(event) => setNumeroNota(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3" /></label><label className="block text-sm font-bold">Arquivo PDF<input type="file" accept="application/pdf,.pdf" onChange={(event) => setPdfFile(event.target.files?.[0] || null)} className="mt-2 block w-full rounded-xl border border-neutral-200 p-3" /></label><label className="block text-sm font-bold">Arquivo XML<input type="file" accept="application/xml,text/xml,.xml" onChange={(event) => setXmlFile(event.target.files?.[0] || null)} className="mt-2 block w-full rounded-xl border border-neutral-200 p-3" /></label><p className="rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">Os arquivos serão privados e abertos somente por URL temporária.</p></div><div className="mt-8 flex justify-end gap-3"><button type="button" onClick={() => setShowUpload(false)} className="rounded-xl border border-neutral-200 px-5 py-3 font-bold">Cancelar</button><button type="button" disabled={saving} onClick={() => void submitUpload()} className="rounded-xl bg-teal-600 px-6 py-3 font-black text-white disabled:opacity-50">{saving ? 'Enviando...' : 'Salvar nota fiscal'}</button></div></Overlay>}

    {showStatus && selected && <Overlay onClose={() => setShowStatus(false)}><div className="flex items-center justify-between"><h2 className="text-2xl font-black">Alterar status fiscal</h2><button type="button" onClick={() => setShowStatus(false)}><X className="h-5 w-5" /></button></div><div className="mt-6 space-y-4"><label className="block text-sm font-bold">Novo status<select value={newStatus} onChange={(event) => setNewStatus(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3">{statusOptions.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label><label className="block text-sm font-bold">Motivo ou observação<textarea rows={4} value={statusReason} onChange={(event) => setStatusReason(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3" /></label></div><div className="mt-8 flex justify-end gap-3"><button type="button" onClick={() => setShowStatus(false)} className="rounded-xl border border-neutral-200 px-5 py-3 font-bold">Cancelar</button><button type="button" disabled={saving} onClick={() => void submitStatus()} className="rounded-xl bg-teal-600 px-6 py-3 font-black text-white disabled:opacity-50">Salvar status</button></div></Overlay>}
  </div>;
}

function StatusIcon({ status }: { status?: string }) {
  if (status === 'emitida') return <CheckCircle className="h-4 w-4 text-emerald-600" />;
  if (status === 'cancelada' || status === 'inutilizada') return <XCircle className="h-4 w-4 text-red-600" />;
  return <Clock className="h-4 w-4 text-amber-600" />;
}

function Detail({ label, value }: { label: string; value?: string | number | null }) {
  return <div className="rounded-xl bg-neutral-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{label}</p><p className="mt-1 font-bold text-neutral-900">{value || '—'}</p></div>;
}
