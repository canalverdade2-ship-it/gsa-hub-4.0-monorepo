import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Building2,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Star,
  Tags,
  Trash2,
  Upload,
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { generateUUID } from '../../../../lib/utils';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';
import { toast } from 'react-hot-toast';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import {
  CLASSIFIEDS_MAX_IMAGES,
  CLASSIFIEDS_MAX_IMAGE_SIZE_MB,
  UploadedClassifiedMedia,
  removeClassifiedImage,
  removeClassifiedImages,
  uploadClassifiedImage,
  validateClassifiedImage,
} from '../../../../lib/classifiedStorage';

interface WizardProps {
  clientId: string;
  onBack: () => void;
}

export function CreateListingWizard({ clientId, onBack }: WizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [removingPath, setRemovingPath] = useState<string | null>(null);
  const [commissions, setCommissions] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftIdRef = useRef(generateUUID());
  const uploadedPathsRef = useRef<string[]>([]);
  const submittedRef = useRef(false);

  const [formData, setFormData] = useState({
    categoria: '', titulo: '', descricao: '', preco: '', cep: '', estado: 'SP', cidade: '', bairro: '',
    detalhes: {} as Record<string, unknown>, midias: [] as UploadedClassifiedMedia[], termoAceito: false,
  });

  useEffect(() => {
    void fetchCommissions();
    return () => {
      if (!submittedRef.current && uploadedPathsRef.current.length > 0) {
        void removeClassifiedImages([...uploadedPathsRef.current]).catch((error) => console.error('Erro ao limpar mídias temporárias dos classificados:', error));
      }
    };
  }, []);

  useEffect(() => { uploadedPathsRef.current = formData.midias.map((media) => media.path); }, [formData.midias]);

  const fetchCommissions = async () => {
    const { data, error } = await supabase.from('classificados_comissoes_config').select('categoria, percentual');
    if (error) { console.error('Erro ao carregar comissões dos classificados:', error); toast.error('Não foi possível carregar a configuração de comissão.'); return; }
    const commissionMap: Record<string, number> = {};
    (data || []).forEach((item) => { commissionMap[item.categoria] = Number(item.percentual); });
    setCommissions(commissionMap);
  };

  useRealtimeSubscription(
    [
      {
        table: 'classificados_comissoes_config',
        debounceMs: 300,
        onChange: () => { void fetchCommissions(); },
      },
    ],
    []
  );

  const fetchCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;
    setLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      if (!data.erro) setFormData((current) => ({ ...current, estado: data.uf, cidade: data.localidade, bairro: data.bairro || current.bairro }));
      else toast.error('CEP não encontrado.');
    } catch (error) { console.error('Erro ao buscar CEP:', error); toast.error('Erro ao buscar o CEP.'); }
    finally { setLoadingCep(false); }
  };

  const handleNext = () => setStep((current) => current + 1);
  const handlePrev = () => setStep((current) => current - 1);
  const normalizeMediaOrder = (items: UploadedClassifiedMedia[]) => items.map((item, index) => ({ ...item, ordem: index }));

  const handleFiles = async (files: FileList | File[]) => {
    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) return;
    if (formData.midias.length + selectedFiles.length > CLASSIFIEDS_MAX_IMAGES) { toast.error(`Você pode adicionar no máximo ${CLASSIFIEDS_MAX_IMAGES} fotos por anúncio.`); return; }
    try {
      selectedFiles.forEach(validateClassifiedImage); setUploading(true);
      const uploaded: UploadedClassifiedMedia[] = [];
      try {
        for (const file of selectedFiles) uploaded.push(await uploadClassifiedImage({ clientId, draftId: draftIdRef.current, file, order: formData.midias.length + uploaded.length }));
      } catch (error) {
        if (uploaded.length) await removeClassifiedImages(uploaded.map((item) => item.path)).catch((cleanupError) => console.error('Erro ao desfazer uploads parciais:', cleanupError));
        throw error;
      }
      setFormData((current) => ({ ...current, midias: normalizeMediaOrder([...current.midias, ...uploaded]) }));
      toast.success(`${uploaded.length} foto(s) enviada(s) com sucesso.`);
    } catch (error: any) { console.error('Erro no upload das imagens dos classificados:', error); toast.error(error?.message || 'Não foi possível enviar as imagens.'); }
    finally { setUploading(false); setIsDragging(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleRemoveMedia = async (media: UploadedClassifiedMedia) => {
    try {
      setRemovingPath(media.path); await removeClassifiedImage(media.path);
      setFormData((current) => ({ ...current, midias: normalizeMediaOrder(current.midias.filter((item) => item.path !== media.path)) }));
      toast.success('Foto removida.');
    } catch (error: any) { console.error('Erro ao remover imagem dos classificados:', error); toast.error(error?.message || 'Não foi possível remover a foto.'); }
    finally { setRemovingPath(null); }
  };

  const moveMedia = (index: number, direction: -1 | 1) => setFormData((current) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= current.midias.length) return current;
    const reordered = [...current.midias]; [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    return { ...current, midias: normalizeMediaOrder(reordered) };
  });

  const makePrimary = (index: number) => setFormData((current) => {
    if (index <= 0 || index >= current.midias.length) return current;
    const reordered = [...current.midias]; const [selected] = reordered.splice(index, 1); reordered.unshift(selected);
    return { ...current, midias: normalizeMediaOrder(reordered) };
  });

  const handleSubmit = async () => {
    try {
      setLoading(true);
      if (uploading || formData.midias.length === 0) throw new Error('Adicione pelo menos uma foto antes de publicar o anúncio.');
      const precoNum = Number.parseFloat(formData.preco.replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(precoNum) || precoNum <= 0) throw new Error('Informe um preço válido para o anúncio.');
      const comissao = Number(commissions[formData.categoria]);
      if (!Number.isFinite(comissao) || comissao <= 0) throw new Error('A comissão desta categoria não está configurada. Entre em contato com a GSA.');
      const { data, error } = await supabase.rpc('rpc_criar_anuncio_classificado', {
        p_cliente_id: clientId, p_categoria: formData.categoria, p_titulo: formData.titulo.trim(),
        p_descricao: formData.descricao.trim(), p_preco: precoNum, p_cidade: formData.cidade.trim(),
        p_estado: formData.estado.trim().toUpperCase(), p_bairro: formData.bairro.trim(),
        p_detalhes: { ...formData.detalhes, cep: formData.cep.trim() || null },
        p_comissao_aceita: comissao, p_midias: formData.midias.map(({ url, tipo, ordem }) => ({ url, tipo, ordem })),
      });
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result?.success) throw error || new Error(result?.error || 'Não foi possível criar o anúncio.');
      submittedRef.current = true; toast.success('Anúncio criado e enviado para moderação!'); navigate(routes.marketplace.classifieds.meusAnuncios());
    } catch (error: any) { console.error('Erro ao criar anúncio classificado:', error); toast.error(error?.message || 'Erro ao criar anúncio.'); }
    finally { setLoading(false); }
  };

  const currentCommission = commissions[formData.categoria] || 0;

  return (
    <div className="bg-[#FAF9F6] min-h-screen pb-24">
      <nav className="sticky top-0 z-50 border-b border-black/[0.06] bg-[#FAF9F6]/90 backdrop-blur-xl"><div className="max-w-4xl mx-auto px-5 flex items-center justify-between h-16"><button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-[#1a1a1a]"><ArrowLeft className="h-4 w-4" /> Voltar</button><div className="flex items-center gap-2"><Tags className="h-5 w-5" /><span className="font-black">Novo Anúncio</span></div><div className="text-sm font-bold text-neutral-400">Passo {step} de 5</div></div></nav>
      <div className="max-w-2xl mx-auto px-5 pt-10">
        {step === 1 && <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}><h2 className="text-3xl font-black mb-2">O que você quer anunciar?</h2><p className="text-neutral-500 mb-8">Escolha a categoria que melhor descreve seu anúncio.</p><div className="grid gap-4">{[
          { id: 'imoveis', icon: Building2, title: 'Imóvel', desc: 'Casas, apartamentos, terrenos' },
          { id: 'veiculos', icon: Car, title: 'Veículo', desc: 'Carros, motos, utilitários' },
          { id: 'geral', icon: Boxes, title: 'Geral', desc: 'Outros produtos e equipamentos' },
        ].map((category) => <button key={category.id} onClick={() => { setFormData({ ...formData, categoria: category.id }); handleNext(); }} className="flex items-center p-6 rounded-2xl border-2 border-black/5 bg-white hover:border-black/20 text-left"><div className="h-12 w-12 rounded-xl flex items-center justify-center mr-4 bg-neutral-100"><category.icon className="h-6 w-6" /></div><div><h3 className="font-bold text-lg">{category.title}</h3><p className="text-sm text-neutral-500">{category.desc}</p></div></button>)}</div></motion.div>}
        {step === 2 && <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}><h2 className="text-3xl font-black mb-2">Informações Principais</h2><p className="text-neutral-500 mb-8">Descreva seu anúncio de forma atrativa.</p><div className="space-y-6"><div><label className="block text-sm font-bold mb-2">Título do Anúncio</label><input value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} className="w-full bg-white border border-black/10 rounded-xl px-4 py-3" /></div><div><label className="block text-sm font-bold mb-2">Descrição</label><textarea value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} rows={5} className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 resize-none" /></div><div><label className="block text-sm font-bold mb-2">Preço (R$)</label><input value={formData.preco} onChange={(e) => { const v=e.target.value.replace(/\D/g,''); setFormData({...formData,preco:v?(Number(v)/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):''}); }} className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 text-xl font-bold" /></div></div><div className="mt-10 flex gap-4"><button onClick={handlePrev} className="px-6 py-3 font-bold">Voltar</button><button onClick={handleNext} disabled={!formData.titulo.trim()||!formData.descricao.trim()||!formData.preco.trim()} className="flex-1 bg-black text-white py-3 rounded-full font-bold disabled:opacity-50">Próximo Passo</button></div></motion.div>}
        {step === 3 && <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}><h2 className="text-3xl font-black mb-2">Localização e Detalhes</h2><p className="text-neutral-500 mb-8">Onde está o item e características específicas.</p><div className="grid grid-cols-2 gap-4 mb-6"><div className="col-span-2"><label className="block text-sm font-bold mb-2">CEP (Opcional)</label><div className="relative"><input value={formData.cep} onChange={(e)=>{let v=e.target.value.replace(/\D/g,'').replace(/^(\d{5})(\d)/,'$1-$2');setFormData({...formData,cep:v});}} onBlur={(e)=>void fetchCep(e.target.value)} maxLength={9} className="w-full bg-white border border-black/10 rounded-xl px-4 py-3" />{loadingCep&&<Loader2 className="absolute right-4 top-3 h-5 w-5 animate-spin"/>}</div></div><div><label className="block text-sm font-bold mb-2">Estado</label><input value={formData.estado} onChange={(e)=>setFormData({...formData,estado:e.target.value})} maxLength={2} className="w-full bg-white border border-black/10 rounded-xl px-4 py-3"/></div><div><label className="block text-sm font-bold mb-2">Cidade</label><input value={formData.cidade} onChange={(e)=>setFormData({...formData,cidade:e.target.value})} className="w-full bg-white border border-black/10 rounded-xl px-4 py-3"/></div><div className="col-span-2"><label className="block text-sm font-bold mb-2">Bairro</label><input value={formData.bairro} onChange={(e)=>setFormData({...formData,bairro:e.target.value})} className="w-full bg-white border border-black/10 rounded-xl px-4 py-3"/></div></div>{formData.categoria==='imoveis'&&<div className="grid grid-cols-2 gap-4 border-t pt-6"><div><label className="block text-sm font-bold mb-2">Área (m²)</label><input  type="number" inputMode="numeric" onChange={(e) => setFormData({...formData,detalhes:{...formData.detalhes,area:e.target.value}})} className="w-full bg-white border rounded-xl px-4 py-3"/></div><div><label className="block text-sm font-bold mb-2">Quartos</label><input  type="number" inputMode="numeric" onChange={(e) => setFormData({...formData,detalhes:{...formData.detalhes,quartos:e.target.value}})} className="w-full bg-white border rounded-xl px-4 py-3"/></div></div>}{formData.categoria==='veiculos'&&<div className="grid grid-cols-2 gap-4 border-t pt-6"><div><label className="block text-sm font-bold mb-2">Marca/Modelo</label><input onChange={(e)=>setFormData({...formData,detalhes:{...formData.detalhes,marca:e.target.value}})} className="w-full bg-white border rounded-xl px-4 py-3"/></div><div><label className="block text-sm font-bold mb-2">Ano</label><input onChange={(e)=>setFormData({...formData,detalhes:{...formData.detalhes,ano:e.target.value}})} className="w-full bg-white border rounded-xl px-4 py-3"/></div></div>}<div className="mt-10 flex gap-4"><button onClick={handlePrev} className="px-6 py-3 font-bold">Voltar</button><button onClick={handleNext} disabled={!formData.cidade.trim()||formData.estado.trim().length!==2} className="flex-1 bg-black text-white py-3 rounded-full font-bold disabled:opacity-50">Próximo Passo</button></div></motion.div>}
        {step === 4 && <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}><h2 className="text-3xl font-black mb-2">Mídias do Anúncio</h2><p className="text-neutral-500 mb-8">Adicione fotos reais do item. A primeira imagem será a capa.</p><input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e)=>{if(e.target.files)void handleFiles(e.target.files);}}/><div onDragOver={(e)=>{e.preventDefault();setIsDragging(true);}} onDragLeave={()=>setIsDragging(false)} onDrop={(e)=>{e.preventDefault();setIsDragging(false);void handleFiles(e.dataTransfer.files);}} className={`border-2 border-dashed rounded-3xl p-10 text-center bg-white mb-6 ${isDragging?'border-amber-500 bg-amber-50':'border-black/20'}`}>{uploading?<Loader2 className="h-10 w-10 mx-auto animate-spin"/>:<Upload className="h-10 w-10 mx-auto text-neutral-400"/>}<p className="font-bold mt-4">{uploading?'Enviando fotos...':'Arraste fotos aqui'}</p><p className="text-xs text-neutral-400 my-4">JPG, PNG ou WEBP • até {CLASSIFIEDS_MAX_IMAGE_SIZE_MB} MB • máximo {CLASSIFIEDS_MAX_IMAGES}</p><button type="button" onClick={()=>fileInputRef.current?.click()} disabled={uploading} className="px-6 py-3 bg-black text-white rounded-full font-bold"><ImagePlus className="inline h-4 w-4 mr-2"/>Selecionar fotos</button></div>{formData.midias.length>0&&<div className="grid sm:grid-cols-2 gap-4">{formData.midias.map((media,index)=><div key={media.path} className="rounded-2xl overflow-hidden border bg-white"><div className="relative aspect-[4/3]"><img src={media.url} className="h-full w-full object-cover"/>{index===0&&<span className="absolute top-2 left-2 bg-black text-amber-400 px-3 py-1 rounded-full text-xs font-bold"><Star className="inline h-3 w-3"/> Capa</span>}</div><div className="p-3 flex gap-2"><button onClick={()=>makePrimary(index)} disabled={index===0} className="text-xs font-bold">Capa</button><button onClick={()=>moveMedia(index,-1)} disabled={index===0}><ChevronLeft/></button><button onClick={()=>moveMedia(index,1)} disabled={index===formData.midias.length-1}><ChevronRight/></button><button onClick={()=>void handleRemoveMedia(media)} disabled={removingPath===media.path} className="ml-auto text-red-600"><Trash2/></button></div></div>)}</div>}<div className="mt-10 flex gap-4"><button onClick={handlePrev} className="px-6 py-3 font-bold">Voltar</button><button onClick={handleNext} disabled={uploading||!formData.midias.length} className="flex-1 bg-black text-white py-3 rounded-full font-bold disabled:opacity-50">Revisar e Aceitar</button></div></motion.div>}
        {step === 5 && <motion.div initial={{opacity:0}} animate={{opacity:1}}><h2 className="text-3xl font-black mb-2">Termos e Comissão</h2><p className="text-neutral-500 mb-8">Revise seu anúncio e aceite os termos da GSA.</p><div className="bg-white rounded-3xl p-6 border"><div className="flex items-center gap-4"><div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center text-2xl font-black text-amber-700">{currentCommission}%</div><div><h3 className="font-black">Taxa de Intermediação</h3><p className="text-sm text-neutral-500">Cobrada apenas no sucesso da venda.</p></div></div><label className="mt-6 flex items-center gap-3 font-bold"><input type="checkbox" checked={formData.termoAceito} onChange={(e)=>setFormData({...formData,termoAceito:e.target.checked})} className="h-5 w-5"/>Li e aceito os termos de uso e comissionamento.</label></div><div className="mt-10 flex gap-4"><button onClick={handlePrev} className="px-6 py-3 font-bold">Voltar</button><button onClick={()=>void handleSubmit()} disabled={!formData.termoAceito||loading} className="flex-1 bg-black text-white py-3 rounded-full font-black disabled:opacity-50">{loading?<Loader2 className="inline h-5 w-5 animate-spin"/>:<ArrowRight className="inline h-5 w-5 mr-2"/>} PUBLICAR ANÚNCIO</button></div></motion.div>}
      </div>
    </div>
  );
}
