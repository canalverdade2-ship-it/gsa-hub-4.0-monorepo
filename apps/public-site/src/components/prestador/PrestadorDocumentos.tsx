import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, Eye, FileText, Upload, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';
import { providerOperations } from '../../lib/providerOperations';
import { removeProviderPrivateFile, resolveProviderFileUrl, uploadProviderPrivateFile } from '../../lib/providerStorage';
import { logService } from '../../lib/logService';
import { useProviderNotifications } from '../../hooks/useProviderNotifications';
import { useFileViewer } from '../../contexts/FileViewerContext';
import { Modal } from '../ui/Modal';

type ProviderDocument = {
  id: string;
  nome: string;
  tipo: string;
  urls: string[] | null;
  status: 'pendente' | 'aprovado' | 'reprovado' | 'em_analise';
  created_at: string;
  updated_at?: string | null;
  motivo_rejeicao?: string | null;
  enviado_por_admin?: boolean | null;
};

export function PrestadorDocumentos({ prestadorId, initialItemId }: { prestadorId: string; initialItemId?: string }) {
  const { openFile } = useFileViewer();
  const { refreshCounts } = useProviderNotifications();
  const [documents, setDocuments] = useState<ProviderDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState('');
  const [selected, setSelected] = useState<ProviderDocument | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const load = async (getIsMounted?: () => boolean) => {
    try {
      const { data, error } = await supabase
        .from('prestador_documentos')
        .select('id,nome,tipo,urls,status,created_at,updated_at,motivo_rejeicao,enviado_por_admin')
        .eq('prestador_id', prestadorId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      if (!getIsMounted || getIsMounted()) setDocuments((data || []) as ProviderDocument[]);
    } catch (error: any) {
      if (!getIsMounted || getIsMounted()) toast.error(error?.message || 'Não foi possível carregar os documentos.');
    } finally {
      if (!getIsMounted || getIsMounted()) setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    void load(() => isMounted);
    const channel = supabase.channel(`provider-documents-${prestadorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_documentos', filter: `prestador_id=eq.${prestadorId}` }, () => void load(() => isMounted))
      .subscribe();
    return () => { isMounted = false; supabase.removeChannel(channel).catch(console.error); };
  }, [prestadorId]);

  useEffect(() => {
    if (!initialItemId || !documents.length) return;
    const document = documents.find((item) => item.id === initialItemId);
    if (!document) return;
    setHighlightedId(document.id);
    const timer = window.setTimeout(() => setHighlightedId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [initialItemId, documents]);

  const filtered = useMemo(() => monthFilter ? documents.filter((item) => item.created_at.startsWith(monthFilter)) : documents, [documents, monthFilter]);
  const pending = filtered.filter((item) => ['pendente', 'reprovado'].includes(item.status));
  const submitted = filtered.filter((item) => ['em_analise', 'aprovado'].includes(item.status));

  const chooseFiles = (list: FileList | null) => {
    if (!list) return;
    const selectedFiles = Array.from(list).slice(0, 5);
    setFiles(selectedFiles);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !files.length || uploading) return;
    setUploading(true);
    setProgress(5);
    const uploaded: string[] = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        const reference = await uploadProviderPrivateFile({
          bucket: 'documentos_prestador',
          providerId: prestadorId,
          scope: `documentos/${selected.id}`,
          file: files[index],
          maxSizeMb: 15,
        });
        uploaded.push(reference);
        setProgress(Math.round(((index + 1) / files.length) * 75));
      }

      const submission = await providerOperations.submitDocument(selected.id, uploaded);
      await Promise.allSettled(((submission?.old_urls || []) as string[]).map((reference) => removeProviderPrivateFile(reference)));
      setProgress(90);
      await Promise.allSettled([
        logService.logAction({ ator_tipo: 'prestador', ator_id: prestadorId, acao: 'UPLOAD_DOCUMENTO', detalhes: `Enviou ${uploaded.length} arquivo(s) para ${selected.nome}.` }),
        refreshCounts(),
      ]);
      setProgress(100);
      toast.success('Arquivos enviados de forma privada para análise.');
      setSelected(null);
      setFiles([]);
      await load();
    } catch (error: any) {
      await Promise.allSettled(uploaded.map((reference) => removeProviderPrivateFile(reference)));
      toast.error(error?.message || 'Não foi possível enviar os arquivos.');
    } finally {
      window.setTimeout(() => {
        setUploading(false);
        setProgress(0);
      }, 300);
    }
  };

  const [isViewing, setIsViewing] = useState(false);
  const view = async (reference: string, name: string) => {
    if (isViewing) return;
    setIsViewing(true);
    try {
      const signedUrl = await resolveProviderFileUrl(reference);
      openFile(signedUrl, name);
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível abrir o arquivo.');
    } finally {
      setIsViewing(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><div className="h-9 w-9 animate-spin rounded-full border-4 border-orange-600 border-t-transparent" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-xl font-black">Documentos do prestador</h2><p className="text-sm text-neutral-500">Os arquivos ficam privados e são abertos por link temporário.</p></div>
        <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-bold">
          <option value="">Todos os meses</option>
          {Array.from({ length: 12 }, (_, index) => {
            const month = String(index + 1).padStart(2, '0');
            const year = new Date().getFullYear();
            return <option key={month} value={`${year}-${month}`}>{new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(year, index))}</option>;
          })}
        </select>
      </div>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-neutral-100 bg-orange-50/50 p-5"><div><h3 className="font-black">Documentos solicitados</h3><p className="text-sm text-neutral-500">Envie apenas arquivos legíveis e atualizados.</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-800">{pending.length}</span></div>
        {pending.length === 0 ? <Empty icon={CheckCircle} text="Nenhum documento pendente." /> : pending.map((document) => <article id={`documento-${document.id}`} key={document.id} className={`flex flex-col gap-4 border-b border-neutral-100 p-5 last:border-0 sm:flex-row sm:items-center sm:justify-between ${highlightedId === document.id ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400' : ''}`}><div className="flex gap-4"><span className={`h-fit rounded-xl p-3 ${document.status === 'reprovado' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{document.status === 'reprovado' ? <XCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}</span><div><h4 className="font-black">{document.nome}</h4><p className="mt-1 text-xs font-bold uppercase tracking-widest text-neutral-400">{document.tipo.replaceAll('_', ' ')}</p>{document.motivo_rejeicao && <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700"><strong>Motivo:</strong> {document.motivo_rejeicao}</div>}</div></div><button onClick={() => { setSelected(document); setFiles([]); }} className="flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 py-3 text-sm font-black text-white"><Upload className="h-4 w-4" />{document.status === 'reprovado' ? 'Reenviar' : 'Enviar'}</button></article>)}
      </section>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="border-b border-neutral-100 p-5"><h3 className="font-black">Arquivos enviados</h3></div>
        {submitted.length === 0 ? <Empty icon={FileText} text="Nenhum arquivo enviado." /> : submitted.map((document) => <article id={`documento-${document.id}`} key={document.id} className={`border-b border-neutral-100 p-5 last:border-0 ${highlightedId === document.id ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400' : ''}`}><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-4"><span className={`h-fit rounded-xl p-3 ${document.status === 'aprovado' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>{document.status === 'aprovado' ? <CheckCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}</span><div><h4 className="font-black">{document.nome}</h4><p className="mt-1 text-xs text-neutral-400">{document.status === 'aprovado' ? 'Aprovado' : 'Em análise'} • {formatDateTime(document.updated_at || document.created_at)}</p></div></div><div className="flex flex-wrap gap-2">{(document.urls || []).map((reference, index) => <button key={`${document.id}-${index}`} onClick={() => view(reference, `${document.nome} ${index + 1}`)} className="flex items-center gap-2 rounded-xl bg-neutral-100 px-3 py-2 text-xs font-black text-neutral-700"><Eye className="h-4 w-4" />Arquivo {index + 1}</button>)}</div></div></article>)}
      </section>

      <Modal isOpen={!!selected} onClose={() => !uploading && setSelected(null)} title={`Enviar: ${selected?.nome || ''}`}>
        <form onSubmit={submit} className="space-y-4"><div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800">Até 5 arquivos, com no máximo 15 MB cada. Os arquivos não terão endereço público permanente.</div><label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-300 p-8 text-center hover:border-indigo-400"><Upload className="h-8 w-8 text-neutral-400" /><span className="mt-3 text-sm font-black">Selecionar arquivos</span><span className="mt-1 text-xs text-neutral-400">PDF, imagens, documentos ou planilhas</span><input type="file" multiple className="hidden" onChange={(event) => chooseFiles(event.target.files)} /></label>{files.length > 0 && <div className="space-y-2">{files.map((file) => <div key={`${file.name}-${file.size}`} className="flex items-center justify-between rounded-xl bg-neutral-50 p-3 text-sm"><span className="truncate font-bold">{file.name}</span><span className="text-xs text-neutral-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span></div>)}</div>}{uploading && <div><div className="mb-1 flex justify-between text-xs font-bold text-neutral-500"><span>Enviando com segurança</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-neutral-100"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} /></div></div>}<button disabled={uploading || !files.length} className="w-full rounded-xl bg-neutral-900 py-3 font-black text-white disabled:opacity-50">{uploading ? 'Enviando...' : 'Enviar para análise'}</button></form>
      </Modal>
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof FileText; text: string }) {
  return <div className="p-12 text-center text-neutral-400"><Icon className="mx-auto h-10 w-10" /><p className="mt-3 text-sm font-bold">{text}</p></div>;
}
