import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ImagePlus, Loader2, Save, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../../lib/supabase';
import {
  CLASSIFIEDS_MAX_IMAGES,
  UploadedClassifiedMedia,
  removeClassifiedImage,
  uploadClassifiedImage,
  validateClassifiedImage,
} from '../../../../lib/classifiedStorage';
import { generateUUID } from '../../../../lib/utils';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';

const getStoragePath = (url: string) => {
  const marker = '/storage/v1/object/public/classificados-midias/';
  const index = url.indexOf(marker);
  return index >= 0 ? decodeURIComponent(url.slice(index + marker.length)) : '';
};

const formatPriceInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return (Number(digits) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export function EditClassifiedListingPage({ clientId, anuncioId }: { clientId: string; anuncioId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [adjustment, setAdjustment] = useState<any>(null);
  const [category, setCategory] = useState('');
  const [form, setForm] = useState({ titulo: '', descricao: '', preco: '', cep: '', cidade: '', estado: '', bairro: '', detalhes: {} as Record<string, any>, midias: [] as UploadedClassifiedMedia[] });
  const inputRef = useRef<HTMLInputElement>(null);
  const draftIdRef = useRef(generateUUID());

  useEffect(() => { void load(); }, [anuncioId, clientId]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('classificados_anuncios')
        .select(`
          id, cliente_id, categoria, titulo, descricao, preco, cidade, estado, bairro, detalhes, status,
          classificados_midias(id, url, tipo, ordem),
          classificados_ajustes(id, campos, observacao, status, created_at)
        `)
        .eq('id', anuncioId)
        .eq('cliente_id', clientId)
        .single();
      if (error) throw error;
      const details = data.detalhes && typeof data.detalhes === 'object' ? data.detalhes : {};
      const medias = [...(data.classificados_midias || [])]
        .sort((a: any, b: any) => Number(a.ordem || 0) - Number(b.ordem || 0))
        .map((media: any, index: number) => ({
          url: media.url,
          path: getStoragePath(media.url),
          tipo: media.tipo || 'image',
          ordem: index,
          nome: media.url ? media.url.split('/').pop() || 'media' : 'media',
          tamanho: 0,
        }));
      const pending = [...(data.classificados_ajustes || [])]
        .filter((item: any) => item.status === 'pendente')
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;
      setCategory(data.categoria);
      setAdjustment(pending);
      setForm({
        titulo: data.titulo || '', descricao: data.descricao || '',
        preco: Number(data.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        cep: details.cep || '', cidade: data.cidade || '', estado: data.estado || '', bairro: data.bairro || '',
        detalhes: Object.fromEntries(Object.entries(details).filter(([key]) => key !== 'cep')),
        midias: medias,
      });
    } catch (error: any) {
      console.error('Erro ao carregar anúncio para correção:', error);
      toast.error(error?.message || 'Não foi possível carregar o anúncio.');
    } finally { setLoading(false); }
  };

  useRealtimeSubscription(
    [
      {
        table: 'classificados_anuncios',
        filter: anuncioId ? `id=eq.${anuncioId}` : undefined,
        debounceMs: 300,
        onChange: () => { void load(); },
      },
      {
        table: 'classificados_midias',
        filter: anuncioId ? `anuncio_id=eq.${anuncioId}` : undefined,
        debounceMs: 300,
        onChange: () => { void load(); },
      },
    ],
    [anuncioId, clientId]
  );

  const marked = new Set<string>(Array.isArray(adjustment?.campos) ? adjustment.campos : []);
  const highlight = (field: string) => marked.has(field) ? 'border-orange-500 ring-2 ring-orange-100' : 'border-black/10';

  const addFiles = async (files: FileList) => {
    if (form.midias.length + files.length > CLASSIFIEDS_MAX_IMAGES) { toast.error(`Máximo de ${CLASSIFIEDS_MAX_IMAGES} imagens.`); return; }
    setUploading(true);
    try {
      const uploaded: UploadedClassifiedMedia[] = [];
      for (const file of Array.from(files)) {
        validateClassifiedImage(file);
        uploaded.push(await uploadClassifiedImage({ clientId, draftId: draftIdRef.current, file, order: form.midias.length + uploaded.length }));
      }
      setForm((current) => ({ ...current, midias: [...current.midias, ...uploaded].map((item, index) => ({ ...item, ordem: index })) }));
      toast.success('Imagens adicionadas.');
    } catch (error: any) { toast.error(error?.message || 'Não foi possível enviar as imagens.'); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  const removeMedia = async (index: number) => {
    const media = form.midias[index];
    try {
      if (media.path) await removeClassifiedImage(media.path);
      setForm((current) => ({ ...current, midias: current.midias.filter((_, itemIndex) => itemIndex !== index).map((item, order) => ({ ...item, ordem: order })) }));
    } catch (error: any) { toast.error(error?.message || 'Não foi possível remover a imagem.'); }
  };

  const submit = async () => {
    setSaving(true);
    try {
      const price = Number.parseFloat(form.preco.replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(price) || price <= 0) throw new Error('Informe um preço válido.');
      if (form.midias.length === 0) throw new Error('Mantenha pelo menos uma imagem no anúncio.');
      const { data, error } = await supabase.rpc('rpc_reenviar_anuncio_classificado', {
        p_anuncio_id: anuncioId,
        p_titulo: form.titulo.trim(),
        p_descricao: form.descricao.trim(),
        p_preco: price,
        p_cidade: form.cidade.trim(),
        p_estado: form.estado.trim().toUpperCase(),
        p_bairro: form.bairro.trim(),
        p_detalhes: { ...form.detalhes, cep: form.cep.trim() || null },
        p_midias: form.midias.map(({ url, tipo, ordem }) => ({ url, tipo, ordem })),
      });
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result?.success) throw error || new Error('Não foi possível reenviar o anúncio.');
      toast.success('Correções enviadas para uma nova análise.');
      navigate(routes.marketplace.classifieds.meusAnuncios());
    } catch (error: any) {
      console.error('Erro ao reenviar anúncio:', error);
      toast.error(error?.message || 'Não foi possível reenviar o anúncio.');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-[#f4f1ea] px-4 py-6 sm:px-6 lg:py-10">
      <div className="mx-auto max-w-4xl">
        <button onClick={() => navigate(routes.marketplace.classifieds.meusAnuncios())} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-neutral-600"><ArrowLeft className="h-4 w-4" /> Voltar aos meus anúncios</button>
        <div className="rounded-[2rem] bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-3xl font-black">Corrigir anúncio</h1>
          <p className="mt-1 text-sm font-medium text-neutral-500">Revise os campos apontados pela GSA e reenvie para análise.</p>

          {adjustment && <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-5"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-orange-700" /><div><p className="font-black text-orange-950">Orientação da análise</p><p className="mt-1 text-sm font-semibold text-orange-900">{adjustment.observacao}</p><div className="mt-3 flex flex-wrap gap-2">{(adjustment.campos || []).map((field: string) => <span key={field} className="rounded-full bg-white px-3 py-1 text-xs font-black text-orange-800">{field.replace('detalhes.','').replace(/_/g,' ')}</span>)}</div></div></div></div>}

          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <label className="md:col-span-2"><span className="mb-2 block text-sm font-black">Título</span><input value={form.titulo} onChange={(e)=>setForm({...form,titulo:e.target.value})} className={`w-full rounded-xl border px-4 py-3 outline-none ${highlight('titulo')}`} /></label>
            <label className="md:col-span-2"><span className="mb-2 block text-sm font-black">Descrição</span><textarea value={form.descricao} onChange={(e)=>setForm({...form,descricao:e.target.value})} rows={6} className={`w-full resize-none rounded-xl border px-4 py-3 outline-none ${highlight('descricao')}`} /></label>
            <label><span className="mb-2 block text-sm font-black">Preço</span><input inputMode="numeric" value={form.preco} onChange={(e)=>setForm({...form,preco:formatPriceInput(e.target.value)})} className={`w-full rounded-xl border px-4 py-3 outline-none ${highlight('preco')}`} /></label>
            <label><span className="mb-2 block text-sm font-black">CEP</span><input inputMode="numeric" maxLength={9} value={form.cep} onChange={(e)=>{ let v = e.target.value.replace(/\D/g, ''); if (v.length > 5) v = v.replace(/^(\d{5})(\d)/, '$1-$2'); setForm({...form,cep:v}); }} className={`w-full rounded-xl border px-4 py-3 outline-none ${highlight('cep')}`} /></label>
            <label><span className="mb-2 block text-sm font-black">Cidade</span><input value={form.cidade} onChange={(e)=>setForm({...form,cidade:e.target.value})} className={`w-full rounded-xl border px-4 py-3 outline-none ${highlight('cidade')}`} /></label>
            <label><span className="mb-2 block text-sm font-black">Estado</span><input value={form.estado} onChange={(e)=>setForm({...form,estado:e.target.value})} maxLength={2} className={`w-full rounded-xl border px-4 py-3 outline-none ${highlight('estado')}`} /></label>
            <label className="md:col-span-2"><span className="mb-2 block text-sm font-black">Bairro</span><input value={form.bairro} onChange={(e)=>setForm({...form,bairro:e.target.value})} className={`w-full rounded-xl border px-4 py-3 outline-none ${highlight('bairro')}`} /></label>
          </div>

          <div className="mt-7"><h2 className="text-lg font-black">Detalhes específicos — {category}</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{Object.entries(form.detalhes).map(([key,value]) => <label key={key}><span className="mb-2 block text-sm font-black capitalize">{key.replace(/_/g,' ')}</span><input value={String(value ?? '')} onChange={(e)=>setForm({...form,detalhes:{...form.detalhes,[key]:e.target.value}})} className={`w-full rounded-xl border px-4 py-3 outline-none ${highlight(`detalhes.${key}`)}`} /></label>)}</div></div>

          <div className={`mt-7 rounded-2xl border p-5 ${marked.has('midias') ? 'border-orange-500 bg-orange-50' : 'border-neutral-200'}`}><div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-black">Imagens</h2><p className="text-xs font-medium text-neutral-500">A primeira imagem será a capa.</p></div><><input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e)=>{if(e.target.files)void addFiles(e.target.files);}}/><button onClick={()=>inputRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-black text-white"><ImagePlus className="h-4 w-4" /> Adicionar</button></></div><div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">{form.midias.map((media,index)=><div key={`${media.url}-${index}`} className="overflow-hidden rounded-xl border bg-white"><img src={media.url} className="aspect-[4/3] w-full object-cover"/><div className="flex items-center justify-between p-2"><span className="text-xs font-black">{index===0?'Capa':`Imagem ${index+1}`}</span><button onClick={()=>void removeMedia(index)} className="text-red-600"><Trash2 className="h-4 w-4"/></button></div></div>)}</div></div>

          <button onClick={()=>void submit()} disabled={saving||uploading} className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-4 font-black text-white disabled:opacity-50">{saving?<Loader2 className="h-5 w-5 animate-spin"/>:<Save className="h-5 w-5"/>} Reenviar para análise</button>
        </div>
      </div>
    </div>
  );
}

export default EditClassifiedListingPage;
