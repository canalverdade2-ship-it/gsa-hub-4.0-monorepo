import React, { useState, useEffect } from 'react';
import { Plus, Search, MoreHorizontal, Calendar, Trash2, User, Building2, Store, Image as ImageIcon, Upload, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Assinatura } from '../../types';
import { Modal } from '../ui/Modal';
import { formatCurrency, generateCode, handleError } from '../../lib/utils';
import { archiveAdminCatalogItems, saveAdminSubscriptionCatalog } from '../../lib/adminStoreOperations';
import { removePublicStoreImage, removeUnusedPublicStoreImages, uploadPublicStoreImage } from '../../lib/publicStoreImage';
import { toast } from 'react-hot-toast';
import { canDeleteRecord } from '../../lib/deleteRequest';
import { logService } from '../../lib/logService';
import { notificationService } from '../../lib/notificationService';
import { useRealtimeSubscription } from '../../hooks/useRealtime';

// Helper functions for gallery mapping
const mapGalleryToColumns = (images: string[]) => {
  return {
    imagem_url: images[0] || null,
    imagem_url_2: images[1] || null,
    imagem_url_3: images[2] || null,
    imagem_url_4: images[3] || null,
    imagem_url_5: images[4] || null,
  };
};

const mapColumnsToGallery = (item: any) => {
  const images = [];
  if (item?.imagem_url) images.push(item.imagem_url);
  if (item?.imagem_url_2) images.push(item.imagem_url_2);
  if (item?.imagem_url_3) images.push(item.imagem_url_3);
  if (item?.imagem_url_4) images.push(item.imagem_url_4);
  if (item?.imagem_url_5) images.push(item.imagem_url_5);
  return images;
};

export function AssinaturasModule({ activeSubTab, initialItemId, colaboradorId, colaboradorNome }: { activeSubTab?: 'ativos' | 'inativos', initialItemId?: string, colaboradorId?: string, colaboradorNome?: string }) {
  const [activeTab, setActiveTab] = useState<'ativos' | 'inativos'>('ativos');
  const [tipoClienteFilter, setTipoClienteFilter] = useState<'todos' | 'pf' | 'pj' | 'ambos'>('todos');
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedAssinatura, setSelectedAssinatura] = useState<Assinatura | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<any[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (activeSubTab) setActiveTab(activeSubTab);
  }, [activeSubTab]);

  const fetchCats = async () => {
    try {
      const { data, error } = await supabase.from('loja_categorias').select('*').eq('status', 'ativo').in('tipo_item', ['assinatura', 'todos']).order('ordem');
      if (error) throw error;
      if (data) setCategorias(data);
    } catch (err: any) {
      toast.error('Erro ao carregar categorias.');
    }
  };

  useEffect(() => {
    void fetchCats();
  }, []);

  useEffect(() => {
    if (initialItemId && assinaturas.length > 0) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`plan-${initialItemId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedId(initialItemId);
          setTimeout(() => setHighlightedId(null), 3000);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialItemId, assinaturas]);

  const fetchAssinaturas = async (isMounted = { current: true }) => {
    let query = supabase
      .from('assinaturas')
      .select('*')
      .eq('status', activeTab === 'ativos' ? 'ativo' : 'inativo');
    
    if (tipoClienteFilter === 'pf' || tipoClienteFilter === 'pj') {
      query = query.in('tipo_cliente', [tipoClienteFilter, 'ambos']);
    } else if (tipoClienteFilter === 'ambos') {
      query = query.eq('tipo_cliente', 'ambos');
    }

    const safeSearch = search.replace(/[,()]/g, ' ').trim();
    if (safeSearch) {
      query = query.or(`nome.ilike.%${safeSearch}%,codigo_assinatura.ilike.%${safeSearch}%`);
    }

    const { data } = await query.order('codigo_assinatura', { ascending: false });
    if (isMounted.current && data) setAssinaturas(data);
  };

  useEffect(() => {
    void fetchAssinaturas();
  }, [activeTab, search, tipoClienteFilter]);

  useRealtimeSubscription([
    { table: 'assinaturas', onChange: () => void fetchAssinaturas(), debounceMs: 300 },
    { table: 'ordens_assinatura', onChange: () => void fetchAssinaturas(), debounceMs: 300 },
    { table: 'loja_categorias', onChange: () => void fetchCats(), debounceMs: 300 },
  ]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !selectedAssinatura) return;
    const file = e.target.files[0];
    setUploadingImage(true);
    try {
      const publicUrl = await uploadPublicStoreImage(file, `assinaturas/${selectedAssinatura.id}`);
      await saveAdminSubscriptionCatalog({
        assinaturaId: selectedAssinatura.id,
        payload: { imagem_url: publicUrl },
      });
      const oldUrl = selectedAssinatura.imagem_url;
      setSelectedAssinatura({ ...selectedAssinatura, imagem_url: publicUrl });
      await removePublicStoreImage(oldUrl).catch(() => undefined);
      toast.success('Imagem atualizada com sucesso!');
      void fetchAssinaturas();
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao fazer upload da imagem.');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleCreate = async (formData: any) => {
    const { imagens_adicionais, ...otherData } = formData;
    const galleryCols = mapGalleryToColumns(imagens_adicionais || []);
    try {
      const result = await saveAdminSubscriptionCatalog({
        payload: {
          ...otherData,
          ...galleryCols,
          descricao: otherData.descricao || '',
          status: 'ativo',
        },
      });
      const data = result?.assinatura || result?.data || result;
      toast.success('Assinatura cadastrada com sucesso.');
      await logService.logAction({
        acao: 'CRIAR_ASSINATURA',
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
      ator_nome: colaboradorNome || 'Administrador',
      detalhes: `Cadastrou a assinatura: ${formData.nome} (${formatCurrency(formData.valor)})`,
    });
    if (formData.visivel_na_loja) {
      await notificationService.broadcastClients(
        'âœ¨ Nova Assinatura Disponível',
        `Conheça nosso novo plano: ${formData.nome}. Confira na área de assinaturas!`,
        'assinaturas',
        'broadcast_assinatura',
        { tab: 'disponiveis' },
      );
    }
    setIsModalOpen(false);
    await fetchAssinaturas();
    if (data?.id) {
      setSelectedAssinatura(data);
      setIsDetailOpen(true);
    }
    return true;
  } catch (error) {
    toast.error(handleError(error, 'Erro ao cadastrar assinatura'));
    return false;
  }
};

const handleUpdate = async (formData: any) => {
  if (!selectedAssinatura) return false;
  const { imagens_adicionais, ...otherData } = formData;
  const galleryCols = mapGalleryToColumns(imagens_adicionais || []);
  const previousImages = mapColumnsToGallery(selectedAssinatura);
  try {
    await saveAdminSubscriptionCatalog({
      assinaturaId: selectedAssinatura.id,
      payload: {
        ...otherData,
        ...galleryCols,
        descricao: otherData.descricao || '',
      },
    });
    await removeUnusedPublicStoreImages(previousImages, imagens_adicionais || []);
    toast.success('Assinatura atualizada com sucesso.');
    await logService.logAction({
      acao: 'EDITAR_ASSINATURA',
      ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
      ator_id: colaboradorId || undefined,
      ator_nome: colaboradorNome || 'Administrador',
      detalhes: `Editou a assinatura: ${formData.nome} (#${selectedAssinatura.codigo_assinatura})`,
    });
    setIsEditModalOpen(false);
    await fetchAssinaturas();
    return true;
  } catch (error) {
    toast.error(handleError(error, 'Erro ao atualizar assinatura'));
    return false;
  }
};

return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">

      {/* Filtro PF/PJ */}
      <div className="flex items-center gap-2 p-1 bg-neutral-100 rounded-xl w-fit">
        {[
          { id: 'todos' as const, label: 'Todas', icon: null },
          { id: 'pf' as const, label: 'PF', icon: User },
          { id: 'pj' as const, label: 'PJ', icon: Building2 },
          { id: 'ambos' as const, label: 'Ambos', icon: MoreHorizontal },
        ].map((opt) => (
          <button
            key={opt.id}
            onClick={() => setTipoClienteFilter(opt.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
              tipoClienteFilter === opt.id
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {opt.icon && <opt.icon className="h-3.5 w-3.5" />}
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 group-focus-within:text-indigo-500 transition-colors" />
          <input 
            type="text" 
            placeholder="Buscar por nome ou código..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white shadow-sm border border-neutral-200 rounded-xl py-3 pl-10 pr-4 text-xs font-medium text-neutral-900 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
          />
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-3 rounded-xl bg-[#1a1a1a] px-8 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-xl transition-all hover:bg-black active:scale-95 group whitespace-nowrap"
        >
          <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
          Nova Assinatura
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {assinaturas.map((assinatura) => (
          <div 
            key={assinatura.id} 
            id={`plan-${assinatura.id}`}
            className={`group relative rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 transition-all hover:shadow-md ${
              highlightedId === assinatura.id 
                ? 'bg-indigo-50/50 ring-2 ring-indigo-500 scale-[1.01] z-10 shadow-lg' 
                : ''
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-12 w-12 overflow-hidden items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shrink-0">
                {assinatura.imagem_url ? (
                  <img src={assinatura.imagem_url} alt={assinatura.nome} className="h-full w-full object-cover" />
                ) : (
                  <Calendar className="h-6 w-6" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                  assinatura.tipo_cliente === 'pf'
                    ? 'bg-sky-100 text-sky-700'
                    : assinatura.tipo_cliente === 'pj'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {assinatura.tipo_cliente === 'pf' ? <User className="h-3 w-3" /> : assinatura.tipo_cliente === 'pj' ? <Building2 className="h-3 w-3" /> : <MoreHorizontal className="h-3 w-3" />}
                  {assinatura.tipo_cliente === 'pf' ? 'PF' : assinatura.tipo_cliente === 'pj' ? 'PJ' : 'Ambos'}
                </span>
                <span className="font-mono text-xs font-bold text-neutral-400">{assinatura.codigo_assinatura}</span>
              </div>
            </div>
            <h3 className="text-lg font-bold text-neutral-900">{assinatura.nome}</h3>
            {assinatura.categoria && (
              <span className="inline-block mt-1 mr-2 rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                {assinatura.categoria}
              </span>
            )}
            {assinatura.visivel_na_loja && (
              <span className="inline-block mt-1 mr-2 rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                🏪 Loja
              </span>
            )}
            <p className="mt-1 text-sm text-neutral-500 line-clamp-2">{assinatura.descricao || 'Sem descrição.'}</p>
            <div className="mt-6 flex items-center justify-between gap-4">
              <span className="text-lg font-black text-indigo-600 shrink-0">{formatCurrency(assinatura.valor)}</span>
                <button 
                  onClick={() => { setSelectedAssinatura(assinatura); setIsDetailOpen(true); }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 px-6 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-black active:scale-95 shadow-lg whitespace-nowrap"
                >
                  Ver Detalhes
                </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de Cadastro */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Nova Assinatura" size="wide">
        <AssinaturaForm onSubmit={handleCreate} onCancel={() => setIsModalOpen(false)} categorias={categorias} />
      </Modal>

      {/* Modal de Edição */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Editar Assinatura" size="wide">
        <AssinaturaForm 
          initialData={selectedAssinatura} 
          onSubmit={handleUpdate} 
          onCancel={() => setIsEditModalOpen(false)} 
          categorias={categorias}
        />
      </Modal>

      <Modal isOpen={isDetailOpen} onClose={() => { setIsDetailOpen(false); setIsDeleting(false); }} title="Detalhes da Assinatura">
        {selectedAssinatura && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-neutral-50 p-6 ring-1 ring-neutral-200">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex gap-4">
                  <div className="relative group flex h-20 w-20 overflow-hidden items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shrink-0 border border-neutral-200">
                    {selectedAssinatura.imagem_url ? (
                      <img src={selectedAssinatura.imagem_url} alt={selectedAssinatura.nome} className="h-full w-full object-contain" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-indigo-300" />
                    )}
                    <label className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white">
                      {uploadingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                      <span className="text-[9px] font-bold mt-1">ALTERAR</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                    </label>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
                    selectedAssinatura.tipo_cliente === 'pf'
                      ? 'bg-sky-100 text-sky-700'
                      : selectedAssinatura.tipo_cliente === 'pj'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}>
                    {selectedAssinatura.tipo_cliente === 'pf' ? <User className="h-3.5 w-3.5" /> : selectedAssinatura.tipo_cliente === 'pj' ? <Building2 className="h-3.5 w-3.5" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
                    {selectedAssinatura.tipo_cliente === 'pf' ? 'PF' : selectedAssinatura.tipo_cliente === 'pj' ? 'PJ' : 'Ambos'}
                  </span>
                  <span className="font-mono text-sm font-bold text-neutral-400">{selectedAssinatura.codigo_assinatura}</span>
                </div>
                    <h3 className="text-2xl font-bold text-neutral-900">{selectedAssinatura.nome}</h3>
                  </div>
                </div>
              </div>
              {selectedAssinatura.categoria && (
                <span className="inline-block mt-2 rounded-lg bg-neutral-200/60 px-3 py-1 text-xs font-bold text-neutral-600 uppercase tracking-wider">
                  Categoria: {selectedAssinatura.categoria}
                </span>
              )}
              <p className="mt-2 text-neutral-600">{selectedAssinatura.descricao || 'Sem descrição disponível.'}</p>
              
              <div className="mt-6">
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Status</p>
                  <span className={`inline-block rounded-full px-3 py-1 text-xs font-black uppercase mt-1 ${selectedAssinatura.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {selectedAssinatura.status}
                  </span>
              </div>

              <div className="mt-8 border-t border-neutral-100 pt-6">
                <p className="text-xs font-bold text-neutral-400 uppercase">Valor da Assinatura</p>
                <p className="text-3xl font-black text-indigo-600">{formatCurrency(selectedAssinatura.valor)}</p>
              </div>

              {/* Edição inline de tipo_cliente e categoria */}
              <div className="mt-6 border-t border-neutral-100 pt-6 space-y-4">
                <div>
                  <p className="text-xs font-bold text-neutral-400 uppercase mb-2">Tipo de Cliente</p>
                  <div className="flex gap-2">
                    {(['pf', 'pj'] as const).map((tipo) => (
                      <button 
                        key={tipo}
                        onClick={async () => {
                          const current = selectedAssinatura.tipo_cliente;
                          let next = current;
                          if (tipo === 'pf') {
                            if (current === 'pj') next = 'ambos';
                            else if (current === 'ambos') next = 'pj';
                          } else {
                            if (current === 'pf') next = 'ambos';
                            else if (current === 'ambos') next = 'pf';
                          }

                          if (next === current) return;

                          setSelectedAssinatura({ ...selectedAssinatura, tipo_cliente: next });
                          try {
                            const { error } = await supabase.from('assinaturas').update({
                              tipo_cliente: next
                            }).eq('id', selectedAssinatura.id);
                            if (error) throw error;
                            
                            toast.success('Tipo de cliente atualizado.');

                            
                            // Log Action
                            await logService.logAction({
                              acao: 'EDITAR_ASSINATURA',
                              ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
                              ator_id: colaboradorId || undefined,
                              ator_nome: colaboradorNome || 'Administrador',
                              detalhes: `Alterou o tipo de cliente da assinatura ${selectedAssinatura.nome} para ${next}`
                            });

                            fetchAssinaturas(); 
                          } catch (err: any) {
                            toast.error('Erro ao atualizar tipo de cliente.');
                          }
                        }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all border-2 ${
                          selectedAssinatura.tipo_cliente === tipo || selectedAssinatura.tipo_cliente === 'ambos'
                            ? tipo === 'pf' ? 'border-sky-500 bg-sky-50 text-sky-700 shadow-sm' : 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm'
                            : 'border-neutral-100 bg-white text-neutral-400 hover:border-neutral-200'
                        }`}
                      >
                        {tipo === 'pf' ? <User className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                        {tipo === 'pf' ? 'PF' : 'PJ'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-neutral-400 uppercase mb-2">Categoria</p>
                  <select
                    value={selectedAssinatura.categoria_id || ''}
                    onChange={async (e) => {
                      const catId = e.target.value;
                      const catNome = categorias.find(c => c.id === catId)?.nome || '';
                      setSelectedAssinatura({ ...selectedAssinatura, categoria_id: catId, categoria: catNome });
                      try {
                        const { error } = await supabase.from('assinaturas').update({
                          categoria_id: catId || null,
                          categoria: catNome || null
                        }).eq('id', selectedAssinatura.id);
                        if (error) throw error;
                         
                        toast.success('Categoria atualizada.');
                        await logService.logAction({
                          acao: 'EDITAR_ASSINATURA',
                          ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
                          ator_id: colaboradorId || undefined,
                          ator_nome: colaboradorNome || 'Administrador',
                          detalhes: `Alterou a categoria da assinatura ${selectedAssinatura.nome} para ${catNome || 'nenhuma'}`
                        });
                        fetchAssinaturas(); 
                      } catch (err: any) {
                        toast.error('Erro ao salvar categoria.');
                      }
                    }}
                    className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                  >
                    <option value="">Sem categoria</option>
                    {categorias.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 border-t border-neutral-100 pt-6">
                <label className="flex items-center justify-between cursor-pointer group">
                  <div>
                    <span className="text-sm font-bold text-neutral-700 group-hover:text-indigo-600 transition-colors">Ocultar Valor para Clientes</span>
                    <p className="text-[10px] text-neutral-400 font-medium mt-0.5">Se ativado, o valor não será exibido no portal do cliente.</p>
                  </div>
                  <div className="relative">
                    <input 
                      type="checkbox"
                      className="sr-only peer"
                      checked={selectedAssinatura.ocultar_valor || false}
                      onChange={async (e) => {
                        const newOcultar = e.target.checked;
                        setSelectedAssinatura({ ...selectedAssinatura, ocultar_valor: newOcultar });
                        try {
                          const { error } = await supabase.from('assinaturas').update({
                            ocultar_valor: newOcultar
                          }).eq('id', selectedAssinatura.id);
                          if (error) throw error;
                          
                          toast.success('Visibilidade de preço atualizada.');
                          fetchAssinaturas();
                        } catch (err: any) {
                          toast.error('Erro ao atualizar visibilidade de preço.');
                        }
                      }}
                    />
                    <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </div>
                </label>

                <div className="border-t border-neutral-100 pt-6 mt-4">
                  <h4 className="text-xs font-bold text-indigo-600 uppercase mb-4 flex items-center gap-2"><Store className="w-4 h-4" /> Configurações GSA Store Hub</h4>
                  
                  <label className="flex items-center justify-between cursor-pointer group mb-4">
                    <div>
                      <span className="text-sm font-bold text-neutral-700 group-hover:text-indigo-600 transition-colors">Visível na Vitrine da Loja</span>
                      <p className="text-[10px] text-neutral-400 font-medium mt-0.5">Disponibiliza a assinatura para compra direta.</p>
                    </div>
                    <div className="relative">
                      <input 
                        type="checkbox"
                        className="sr-only peer"
                        checked={selectedAssinatura.visivel_na_loja || false}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setSelectedAssinatura({ ...selectedAssinatura, visivel_na_loja: val });
                          try {
                            const { error } = await supabase.from('assinaturas').update({ visivel_na_loja: val }).eq('id', selectedAssinatura.id);
                            if (error) throw error;
                            toast.success('Visibilidade na loja atualizada.'); 
                            fetchAssinaturas();
                          } catch (err: any) {
                            toast.error('Erro ao atualizar visibilidade na loja.');
                          }
                        }}
                      />
                      <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </div>
                  </label>
                </div>

                {/* Galeria no Modal de Detalhes */}
                <div className="border-t border-neutral-100 pt-6 mt-4">
                  <p className="text-xs font-bold text-neutral-400 uppercase mb-4">Galeria de Imagens</p>
                  <div className="grid grid-cols-5 gap-3">
                    {mapColumnsToGallery(selectedAssinatura).map((url, idx) => (
                      <div key={url} className="aspect-square rounded-xl border border-neutral-200 bg-neutral-50 overflow-hidden flex items-center justify-center">
                        <img src={url} alt="" className="w-full h-full object-contain" />
                      </div>
                    ))}
                    {mapColumnsToGallery(selectedAssinatura).length === 0 && (
                      <div className="col-span-5 py-8 text-center bg-neutral-50 rounded-2xl border border-dashed border-neutral-200">
                        <ImageIcon className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                        <p className="text-[10px] font-bold text-neutral-400 uppercase">Nenhuma imagem na galeria</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {isDeleting ? (
              <div className="rounded-2xl bg-red-50 p-6 ring-1 ring-red-200 flex flex-col items-center text-center">
                <Trash2 className="h-8 w-8 text-red-500 mb-2" />
                <h4 className="text-lg font-bold text-red-900 mb-1">Confirmar Exclusão</h4>
                <p className="text-sm text-red-700 mb-6">
                  Tem certeza que deseja excluir esta assinatura? Esta ação não pode ser desfeita.
                  <br />
                  <span className="font-bold">Nota:</span> Se esta assinatura estiver vinculada a algum orçamento, a exclusão poderá falhar.
                </p>
                <div className="flex w-full gap-4">
                  <button 
                    onClick={() => setIsDeleting(false)}
                    className="flex-1 rounded-xl bg-white py-3 font-bold text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={async () => {
                      const canProceed = await canDeleteRecord('assinaturas', selectedAssinatura.id);
                      if (!canProceed) {
                        setIsDeleting(false);
                        setIsDetailOpen(false);
                        return;
                      }

                      try {
                        await archiveAdminCatalogItems('assinatura', [selectedAssinatura.id]);
                        toast.success('Assinatura inativado com sucesso.');
                        setIsDetailOpen(false);
                        setIsDeleting(false);
                        fetchAssinaturas();
                      } catch (error) {
                        toast.error(handleError(error, 'Erro ao inativar assinatura'));
                      }
                    }}
                    className="flex-1 rounded-xl bg-red-600 py-3 font-bold text-white hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                  >
                    Sim, Excluir
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={async () => {
                      const newStatus = selectedAssinatura.status === 'ativo' ? 'inativo' : 'ativo';
                      try {
                        const { error } = await supabase.from('assinaturas').update({
                          status: newStatus
                        }).eq('id', selectedAssinatura.id);
                        if (error) throw error;
                        
                        toast.success(`Assinatura ${newStatus === 'ativo' ? 'ativada' : 'inativada'} com sucesso.`);
                        
                        // Log Action
                        await logService.logAction({
                          acao: newStatus === 'ativo' ? 'ATIVAR_ASSINATURA' : 'INATIVAR_ASSINATURA',
                          ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
                          ator_id: colaboradorId || undefined,
                          ator_nome: colaboradorNome || 'Administrador',
                          detalhes: `${newStatus === 'ativo' ? 'Ativou' : 'Inativou'} a assinatura: ${selectedAssinatura.nome}`
                        });

                        setIsDetailOpen(false);
                        fetchAssinaturas();
                      } catch (err: any) {
                        toast.error('Erro ao alterar status.');
                      }
                    }}
                    className={`flex-1 rounded-xl py-4 font-bold transition-all ${selectedAssinatura.status === 'ativo' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                  >
                    {selectedAssinatura.status === 'ativo' ? 'Inativar Assinatura' : 'Ativar Assinatura'}
                  </button>
                  <button 
                    onClick={() => {
                      setIsDetailOpen(false);
                      setIsEditModalOpen(true);
                    }}
                    className="flex-1 rounded-xl bg-indigo-600 py-4 font-bold text-white hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
                  >
                    <Upload className="w-5 h-5 rotate-180" />
                    Editar Assinatura
                  </button>
                  <button 
                    onClick={() => setIsDetailOpen(false)}
                    className="flex-1 rounded-xl bg-neutral-900 py-4 font-bold text-white hover:bg-black transition-all"
                  >
                    Fechar Detalhes
                  </button>
                </div>
                <button 
                  onClick={() => setIsDeleting(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-50 py-3 font-bold text-red-600 hover:bg-red-100 transition-all"
                >
                  <Trash2 className="h-5 w-5" />
                  Excluir Assinatura
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function AssinaturaForm({ initialData, onSubmit, onCancel, categorias = [] }: { initialData?: Assinatura | null, onSubmit: (data: any) => Promise<boolean>, onCancel: () => void, categorias?: any[] }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [formData, setFormData] = useState({
    nome: initialData?.nome || '',
    valor: initialData?.valor?.toString() || '',
    descricao: initialData?.descricao || '',
    ocultar_valor: initialData?.ocultar_valor || false,
    tipo_cliente: initialData?.tipo_cliente || 'pf' as 'pf' | 'pj' | 'ambos',
    categoria: initialData?.categoria || '',
    categoria_id: initialData?.categoria_id || '',
    visivel_na_loja: initialData?.visivel_na_loja || false,
    imagens_adicionais: initialData ? mapColumnsToGallery(initialData) : [] as string[]
  });

const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  if (!e.target.files || e.target.files.length === 0) return;
  const file = e.target.files[0];
  setUploadingGallery(true);
  try {
    const publicUrl = await uploadPublicStoreImage(file, 'assinaturas/galeria');
    setFormData(prev => ({
      ...prev,
      imagens_adicionais: [...prev.imagens_adicionais, publicUrl].slice(0, 5),
    }));
    toast.success('Imagem adicionada à galeria!');
  } catch (error: any) {
    toast.error(error?.message || 'Erro ao fazer upload da imagem.');
  } finally {
    setUploadingGallery(false);
    e.target.value = '';
  }
};

const removeGalleryImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      imagens_adicionais: prev.imagens_adicionais.filter((_, i) => i !== index)
    }));
  };

  return (
    <form onSubmit={async (e) => { 
      e.preventDefault(); 
      if (isSubmitting) return; 
      setIsSubmitting(true); 
      await onSubmit({
        ...formData, 
        valor: parseFloat(formData.valor) || 0, 
        categoria: formData.categoria || null,
        categoria_id: formData.categoria_id || null
      }); 
      setIsSubmitting(false); 
    }} className="space-y-6">
      {/* Seletor PF / PJ */}
      <div>
        <label className="mb-2 block text-sm font-bold text-neutral-700">Tipo de Cliente *</label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              const current = formData.tipo_cliente;
              if (current === 'pj') setFormData({...formData, tipo_cliente: 'ambos'});
              else if (current === 'ambos') setFormData({...formData, tipo_cliente: 'pj'});
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all border-2 ${
              formData.tipo_cliente === 'pf' || formData.tipo_cliente === 'ambos'
                ? 'border-sky-500 bg-sky-50 text-sky-700 shadow-sm shadow-sky-100'
                : 'border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300'
            }`}
          >
            <User className="h-4 w-4" />
            PF
          </button>
          <button
            type="button"
            onClick={() => {
              const current = formData.tipo_cliente;
              if (current === 'pf') setFormData({...formData, tipo_cliente: 'ambos'});
              else if (current === 'ambos') setFormData({...formData, tipo_cliente: 'pf'});
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all border-2 ${
              formData.tipo_cliente === 'pj' || formData.tipo_cliente === 'ambos'
                ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm shadow-amber-100'
                : 'border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300'
            }`}
          >
            <Building2 className="h-4 w-4" />
            PJ
          </button>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">Categoria</label>
        <select 
          value={formData.categoria_id}
          onChange={e => {
            const catId = e.target.value;
            const catNome = categorias.find(c => c.id === catId)?.nome || '';
            setFormData({...formData, categoria_id: catId, categoria: catNome});
          }}
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
        >
          <option value="">Sem categoria</option>
          {categorias.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.nome}</option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-neutral-400 font-medium">Opcional. Agrupa as assinaturas por categoria na loja.</p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">Nome da Assinatura *</label>
        <input 
          type="text" 
          required
          value={formData.nome}
          onChange={e => setFormData({...formData, nome: e.target.value})}
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">Valor (R$) *</label>
        <input  
          type="number" 
          step="0.01"
          min="0.01"
          required
          value={formData.valor}
          inputMode="numeric"
onChange={(e) => setFormData({...formData, valor: e.target.value})}
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">Descrição</label>
        <textarea 
          rows={3}
          value={formData.descricao}
          onChange={e => setFormData({...formData, descricao: e.target.value})}
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input 
              type="checkbox"
              className="sr-only peer"
              checked={formData.ocultar_valor}
              onChange={e => setFormData({...formData, ocultar_valor: e.target.checked})}
            />
            <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </div>
          <span className="text-sm font-bold text-neutral-700 group-hover:text-indigo-600 transition-colors">Ocultar Valor para Clientes</span>
        </label>
        <p className="mt-1 text-[10px] text-neutral-400 font-medium">Se ativado, o valor desta assinatura não será exibido no portal do cliente durante a solicitação de orçamento.</p>
      </div>

      {/* Galeria de Imagens */}
      <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200">
        <div className="flex items-center justify-between mb-4">
          <label className="block text-sm font-bold text-neutral-700">Galeria de Fotos (Opcional - Até 5)</label>
          <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{formData.imagens_adicionais.length} / 5</span>
        </div>
        
        <div className="grid grid-cols-5 gap-3">
          {formData.imagens_adicionais.map((url, index) => (
            <div key={url} className="relative aspect-square bg-white rounded-xl overflow-hidden group border border-neutral-200 flex items-center justify-center">
              <img src={url} alt="" className="w-full h-full object-contain" />
              <button 
                type="button"
                onClick={() => removeGalleryImage(index)}
                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          
          {formData.imagens_adicionais.length < 5 && (
            <label className={`relative aspect-square bg-white border-2 border-dashed border-neutral-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-50 hover:border-indigo-500 hover:text-indigo-600 transition-all ${uploadingGallery ? 'opacity-50 cursor-wait' : ''}`}>
              <input 
                type="file" 
                className="sr-only" 
                accept="image/*"
                disabled={uploadingGallery}
                onChange={handleGalleryUpload}
              />
              {uploadingGallery ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            </label>
          )}
        </div>
      </div>

      <div className="space-y-4 pt-4 border-t border-neutral-100">
        <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2"><Store className="w-4 h-4 text-indigo-500" /> Configurações do GSA Store Hub</h4>
        
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input 
              type="checkbox"
              className="sr-only peer"
              checked={formData.visivel_na_loja}
              onChange={e => setFormData({...formData, visivel_na_loja: e.target.checked})}
            />
            <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </div>
          <div>
            <span className="text-sm font-bold text-neutral-700 group-hover:text-indigo-600 transition-colors">Visível na Vitrine da Loja</span>
            <p className="text-[10px] text-neutral-400 font-medium">Permite que o cliente solicite esta assinatura diretamente pelo GSA Store Hub.</p>
          </div>
        </label>
      </div>
      <div className="flex gap-4 pt-4">
        <button type="button" onClick={onCancel} disabled={isSubmitting} className="flex-1 rounded-xl border border-neutral-200 py-3 font-bold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50">
          {isSubmitting ? 'Processando...' : initialData ? 'Salvar Alterações' : 'Confirmar Cadastro'}
        </button>
      </div>
    </form>
  );
}
