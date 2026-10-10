import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, MoreHorizontal, Package, Trash2, User, Building2, Store, Image as ImageIcon, Upload, Loader2, History, Settings2, Check, Minus, AlertCircle, PackagePlus, Camera, Tag, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Produto } from '../../types';
import { Modal } from '../ui/Modal';
import { formatCurrency, generateCode, handleError, generateUUID } from '../../lib/utils';
import { toast } from 'react-hot-toast';
import { canDeleteRecord } from '../../lib/deleteRequest';
import { logService } from '../../lib/logService';
import { AdminWhatsAppButton } from './ui/AdminWhatsAppButton';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { callAdminRpc, getAdminProductSupplierConfig, upsertAdminProductSupplierConfig, setAdminProductDiscount } from '../../lib/adminRpc';
import { useConfirm } from '../../hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { maskPhone } from '../../lib/utils';
import { ProdutoFornecedorConfig } from '../../types';
import { productUrlImportService, ParsedProductData } from '../../lib/productUrlImportService';
import { BulkProductImportModal } from './products/BulkProductImportModal';
import { BarcodeScannerModal } from './products/BarcodeScannerModal';
import { getProductDisplayCode, getProductDisplayCodeLabel, validateBarcode, detectBarcodeType, normalizeBarcode, BarcodeType } from '../../lib/productIdentification';
import { sessionService } from '../../lib/sessionService';
import { adjustAdminProductStock, archiveAdminCatalogItems, deleteAdminProductsBulk, saveAdminProductCatalog } from '../../lib/adminStoreOperations';
import { removePublicStoreImage, removeUnusedPublicStoreImages, uploadPublicStoreImage } from '../../lib/publicStoreImage';
import { hasActiveProductDiscount, formatProductDiscountPercentage, getProductDiscountValidityInfo, getProductRemainingDaysText } from '../../lib/productPricing';
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
  if (item.imagem_url) images.push(item.imagem_url);
  if (item.imagem_url_2) images.push(item.imagem_url_2);
  if (item.imagem_url_3) images.push(item.imagem_url_3);
  if (item.imagem_url_4) images.push(item.imagem_url_4);
  if (item.imagem_url_5) images.push(item.imagem_url_5);
  return images;
};


export function ProdutosModule({
  activeSubTab,
  initialItemId,
  colaboradorId,
  colaboradorNome,
  adminType,
}: {
  activeSubTab?: 'ativos' | 'inativos';
  initialItemId?: string;
  colaboradorId?: string;
  colaboradorNome?: string;
  adminType?: 'admin' | 'colaborador' | string;
}) {
  const confirmHook = useConfirm();
  const { confirm } = confirmHook;
  const [activeTab, setActiveTab] = useState<'ativos' | 'inativos'>('ativos');
  const [tipoClienteFilter, setTipoClienteFilter] = useState<'todos' | 'pf' | 'pj' | 'ambos'>('todos');
  const [categoriaFilter, setCategoriaFilter] = useState<string>('todos');

  useEffect(() => {
    if (activeSubTab) setActiveTab(activeSubTab);
  }, [activeSubTab]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkMenu, setShowBulkMenu] = useState(false);

  // Paginação inteligente para máxima performance com milhares de produtos
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(24);

  useEffect(() => {
    setCurrentPage(0);
  }, [search, categoriaFilter, tipoClienteFilter, activeTab]);

  const totalPages = Math.max(1, Math.ceil(produtos.length / pageSize));
  const paginatedProdutos = React.useMemo(() => {
    if (pageSize >= produtos.length) return produtos;
    const start = currentPage * pageSize;
    return produtos.slice(start, start + pageSize);
  }, [produtos, currentPage, pageSize]);

  const [selectAllMatching, setSelectAllMatching] = useState(false);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
      setSelectAllMatching(false);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleSelectAll = () => {
    if (selectAllMatching) {
      setSelectAllMatching(false);
      setSelectedIds(new Set());
    } else {
      setSelectAllMatching(true);
      setSelectedIds(new Set(produtos.map(p => p.id)));
    }
    setShowBulkMenu(false);
  };

  useEffect(() => {
    setSelectAllMatching(false);
    setSelectedIds(new Set());
  }, [search, activeTab, tipoClienteFilter, categoriaFilter]);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProduto, setSelectedProduto] = useState<Produto | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailSupplierConfig, setDetailSupplierConfig] = useState<ProdutoFornecedorConfig | null>(null);

  const [loadingDetailConfig, setLoadingDetailConfig] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (isDetailOpen && selectedProduto?.id) {
      setLoadingDetailConfig(true);
      getAdminProductSupplierConfig(selectedProduto.id)
        .then(data => {
          if (isMounted) setDetailSupplierConfig(data || null);
        })
        .catch(err => {
          console.error('Erro ao carregar configurações de fornecedor', err);
          if (isMounted) setDetailSupplierConfig(null);
        })
        .finally(() => {
          if (isMounted) setLoadingDetailConfig(false);
        });
    } else {
      setDetailSupplierConfig(null);
    }
    return () => { isMounted = false; };
  }, [isDetailOpen, selectedProduto?.id]);

  const [isDeleting, setIsDeleting] = useState(false);
  const [isAjusteOpen, setIsAjusteOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  
  // Desconto individual de produtos
  const [discountActive, setDiscountActive] = useState(false);
  const [discountType, setDiscountType] = useState<'porcentagem' | 'valor'>('porcentagem');
  const [discountValue, setDiscountValue] = useState('');
  const [discountValidityType, setDiscountValidityType] = useState<'determinado' | 'indeterminado'>('indeterminado');
  const [discountEndDate, setDiscountEndDate] = useState('');
  const [isSavingDiscount, setIsSavingDiscount] = useState(false);
  // Controle de cota de quantidade
  const [discountQuantityLimited, setDiscountQuantityLimited] = useState(false);
  const [discountQuantityLimit, setDiscountQuantityLimit] = useState('');
  const [showNewCampaignModal, setShowNewCampaignModal] = useState(false);

  useEffect(() => {
    if (selectedProduto) {
      setDiscountActive(selectedProduto.desconto_ativo || false);
      setDiscountType((selectedProduto.desconto_tipo as 'porcentagem' | 'valor') || 'porcentagem');
      setDiscountValue(selectedProduto.desconto_valor ? selectedProduto.desconto_valor.toString() : '');
      setDiscountValidityType(selectedProduto.desconto_prazo_tipo || 'indeterminado');
      setDiscountQuantityLimited(selectedProduto.desconto_limite_quantidade_ativo || false);
      setDiscountQuantityLimit(selectedProduto.desconto_quantidade_limite ? selectedProduto.desconto_quantidade_limite.toString() : '');
      if (selectedProduto.desconto_fim_em) {
        try {
          const dateObj = new Date(selectedProduto.desconto_fim_em);
          const dateStr = new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).format(dateObj);
          setDiscountEndDate(dateStr);
        } catch (e) {
          setDiscountEndDate(selectedProduto.desconto_fim_em.split('T')[0]);
        }
      } else {
        setDiscountEndDate('');
      }
    } else {
      setDiscountActive(false);
      setDiscountType('porcentagem');
      setDiscountValue('');
      setDiscountValidityType('indeterminado');
      setDiscountEndDate('');
      setDiscountQuantityLimited(false);
      setDiscountQuantityLimit('');
    }
  }, [selectedProduto]);

  const [categorias, setCategorias] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    fetchProdutos();
    const fetchCategorias = async () => {
      try {
        const { data, error } = await supabase.from('loja_categorias').select('*').eq('status', 'ativo').in('tipo_item', ['produto', 'todos']).order('ordem');
        if (error) throw error;
        if (isMounted && data) setCategorias(data);
      } catch (error) {
        console.error('Erro ao buscar categorias:', error);
        toast.error('Ocorreu um erro ao carregar as categorias. Por favor, tente novamente mais tarde.');
      }
    };
    fetchCategorias();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (initialItemId && produtos.length > 0) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`prod-${initialItemId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedId(initialItemId);
          setTimeout(() => setHighlightedId(null), 3000);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialItemId, produtos]);


  const [uploadingImage, setUploadingImage] = useState(false);

const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  if (!e.target.files || e.target.files.length === 0 || !selectedProduto) return;
  const file = e.target.files[0];
  setUploadingImage(true);
  try {
    const publicUrl = await uploadPublicStoreImage(file, `produtos/${selectedProduto.id}`);
    await saveAdminProductCatalog({
      produtoId: selectedProduto.id,
      payload: { imagem_url: publicUrl },
    });
    const oldUrl = selectedProduto.imagem_url;
    setSelectedProduto({ ...selectedProduto, imagem_url: publicUrl });
    await removePublicStoreImage(oldUrl).catch(() => undefined);
    toast.success('Imagem atualizada com sucesso!');
    fetchProdutos();
  } catch (error: any) {
    toast.error(error?.message || 'Erro ao fazer upload da imagem.');
  } finally {
    setUploadingImage(false);
    e.target.value = '';
  }
};

  const fetchProdutos = useCallback(async () => {
    let query = supabase
      .from('produtos')
      .select('*')
      .eq('status', activeTab === 'ativos' ? 'ativo' : 'inativo');
    
    if (tipoClienteFilter === 'pf' || tipoClienteFilter === 'pj') {
      query = query.in('tipo_cliente', [tipoClienteFilter, 'ambos']);
    } else if (tipoClienteFilter === 'ambos') {
      query = query.eq('tipo_cliente', 'ambos');
    }

    const safeSearch = search.replace(/[,()]/g, ' ').trim();
    if (safeSearch) {
      const searchClean = safeSearch.replace(/[\s\.\-]/g, '');
      const searchConditions = [`nome.ilike.%${safeSearch}%`];
      if (searchClean.length > 0) {
        searchConditions.push(`codigo_produto.ilike.%${searchClean}%`);
        searchConditions.push(`codigo_barras.ilike.%${searchClean}%`);
      }
      query = query.or(searchConditions.join(','));
    }

    if (categoriaFilter !== 'todos') {
      if (categoriaFilter === 'sem_categoria') {
        query = query.is('categoria_id', null);
      } else {
        query = query.eq('categoria_id', categoriaFilter);
      }
    }

    const { data, error } = await query
      .order('codigo_produto', { ascending: false })
      .range(0, 999);

    if (error) {
      if (error.message?.includes('Lock broken by another request')) {
        // Silently ignore Web Locks API aborts (caused by concurrent token refreshes)
        // because the concurrent request that "stole" the lock will succeed and update the state.
        return;
      }
      console.error('Erro ao consultar produtos no Supabase:', error);
      toast.error(`Falha na conexão com o banco de dados: ${error.message || 'Timeout de Conexão'}`);
      return;
    }

    setProdutos(data || []);
  }, [activeTab, search, tipoClienteFilter, categoriaFilter]);

  useEffect(() => {
    fetchProdutos();
  }, [fetchProdutos]);

  useRealtimeSubscription([
    {
      table: 'produtos',
      onChange: fetchProdutos,
      onPayload: (payload) => {
        if (payload.new && selectedProduto && (payload.new as any).id === selectedProduto.id) {
          setSelectedProduto(prev => prev ? { ...prev, ...payload.new } as Produto : null);
        }
      },
      debounceMs: 300,
    },
    { table: 'loja_categorias', onChange: fetchProdutos, debounceMs: 300 },
    { table: 'loja_estoque_historico', onChange: fetchProdutos, debounceMs: 300 },
    { table: 'produto_fornecedor_config', onChange: fetchProdutos, debounceMs: 300 },
    { table: 'produto_variantes', onChange: fetchProdutos, debounceMs: 300 },
    { table: 'produto_variacao_grupos', onChange: fetchProdutos, debounceMs: 300 },
    { table: 'produto_variacao_opcoes', onChange: fetchProdutos, debounceMs: 300 },
  ]);

const handleCreate = async (formData: any) => {
  const { imagens_adicionais, fornecedor_config, ...otherData } = formData;
  const galleryCols = mapGalleryToColumns(imagens_adicionais || []);
  try {
    const result = await saveAdminProductCatalog({
      payload: {
        ...otherData,
        ...galleryCols,
        descricao: otherData.descricao || '',
        status: 'ativo',
      },
      fornecedor: fornecedor_config || null,
    });
    const data = result?.produto || result?.data || result;
    toast.success('Produto cadastrado com sucesso.');
    await logService.logAction({
      acao: 'CRIAR_PRODUTO',
      ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
      ator_id: colaboradorId || undefined,
      ator_nome: colaboradorNome || 'Administrador',
      detalhes: `Cadastrou o produto: ${formData.nome} (${formatCurrency(formData.valor)})`,
    });
    setIsModalOpen(false);
    await fetchProdutos();
    if (data?.id) {
      setSelectedProduto(data);
      setIsDetailOpen(true);
    }
    return true;
  } catch (error) {
    toast.error(handleError(error, 'Erro ao cadastrar produto'));
    return false;
  }
};

const handleUpdate = async (formData: any) => {
  if (!selectedProduto) return false;
  const { imagens_adicionais, fornecedor_config, ...otherData } = formData;
  const galleryCols = mapGalleryToColumns(imagens_adicionais || []);
  const previousImages = mapColumnsToGallery(selectedProduto);
  try {
    await saveAdminProductCatalog({
      produtoId: selectedProduto.id,
      payload: {
        ...otherData,
        ...galleryCols,
        descricao: otherData.descricao || '',
      },
      fornecedor: fornecedor_config || null,
    });
    await removeUnusedPublicStoreImages(previousImages, imagens_adicionais || []);
    toast.success('Produto atualizado com sucesso.');
    await logService.logAction({
      acao: 'EDITAR_PRODUTO',
      ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
      ator_id: colaboradorId || undefined,
      ator_nome: colaboradorNome || 'Administrador',
      detalhes: `Editou o produto: ${formData.nome} (#${selectedProduto.codigo_produto})`,
    });
    setIsEditModalOpen(false);
    await fetchProdutos();
    return true;
  } catch (error) {
    toast.error(handleError(error, 'Erro ao atualizar produto'));
    return false;
  }
};

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    if (adminType === 'colaborador') {
      toast.error('Colaboradores não podem excluir em lote. Solicite exclusão individualmente.');
      return;
    }

    const count = selectAllMatching ? 'TODOS OS' : selectedIds.size;
    if (!await confirm({ 
      title: 'Excluir Produtos', 
      message: `Deseja excluir definitivamente ${count} produto(s) correspondente(s) aos filtros atuais? Esta ação removerá os produtos do catálogo e da loja permanentemente.` 
    })) {
      return;
    }

    setIsDeleting(true);
    const ids = Array.from(selectedIds) as string[];
    const toastId = toast.loading(selectAllMatching ? `Excluindo todos os produtos correspondentes...` : `Excluindo ${ids.length} produto(s)...`);
    try {
      if (selectAllMatching) {
        await callAdminRpc('gsa_admin_delete_products_by_filter', {
          p_status: activeTab === 'ativos' ? 'ativo' : 'inativo',
          p_tipo_cliente: tipoClienteFilter === 'ambos' ? 'ambos' : (tipoClienteFilter === 'todos' ? null : tipoClienteFilter),
          p_categoria_id: categoriaFilter === 'todos' ? null : categoriaFilter,
          p_search: search || null
        });
        setSelectAllMatching(false);
      } else {
        await deleteAdminProductsBulk(ids);
      }
      
      setSelectedIds(new Set());
      toast.success(`Produtos excluídos com sucesso.`, { id: toastId });
      await logService.logAction({
        acao: 'EXCLUIR_PRODUTO_LOTE',
        ator_tipo: 'admin',
        ator_nome: 'Administrador',
        detalhes: selectAllMatching ? 'Excluiu TODOS os produtos filtrados em lote.' : `Excluiu ${ids.length} produtos em lote.`
      });
      await fetchProdutos();
    } catch (err: any) {
      toast.error(handleError(err, 'Ocorreu um erro ao excluir os produtos.'), { id: toastId });
      await fetchProdutos();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">

      {/* Filtro PF/PJ */}
      <div className="flex items-center gap-2 p-1 bg-neutral-100 rounded-xl w-fit">
        {[
          { id: 'todos' as const, label: 'Todos', icon: null },
          { id: 'pf' as const, label: 'Pessoa Física', icon: User },
          { id: 'pj' as const, label: 'Pessoa Jurídica', icon: Building2 },
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
        <div className="w-full md:w-64">
          <select
            value={categoriaFilter}
            onChange={(e) => setCategoriaFilter(e.target.value)}
            className="w-full bg-white shadow-sm border border-neutral-200 rounded-xl py-3 px-4 text-xs font-medium text-neutral-900 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all appearance-none cursor-pointer"
          >
            <option value="todos">Todas Categorias</option>
            <option value="sem_categoria">Sem Categoria</option>
            {categorias.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.nome}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative">
            <button
              onClick={() => {
                const nextState = !showBulkMenu;
                setShowBulkMenu(nextState);
                if (!nextState) setSelectedIds(new Set());
              }}
              className={`flex items-center justify-center p-3 rounded-xl transition-all shadow-sm border ${
                showBulkMenu || selectedIds.size > 0 
                  ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' 
                  : 'bg-white text-neutral-400 border-neutral-200 hover:bg-neutral-50 hover:text-neutral-600'
              }`}
              title="Ações em lote"
            >
              <Trash2 className="h-4 w-4" />
              {selectedIds.size > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full shadow-sm">
                  {selectedIds.size}
                </span>
              )}
            </button>
            
            {showBulkMenu && (
              <>
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-neutral-100 p-2 z-50 origin-top-right animate-in fade-in zoom-in duration-200">
                  <button
                    onClick={handleSelectAll}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 rounded-lg transition-colors"
                  >
                    {selectAllMatching ? 'Remover Seleção' : 'Selecionar Todos'}
                    <span className="text-xs text-neutral-400">({selectAllMatching ? 'Tudo' : produtos.length})</span>
                  </button>
                  <div className="h-px bg-neutral-100 my-1" />
                  <button
                    onClick={() => {
                      setShowBulkMenu(false);
                      handleBulkDelete();
                    }}
                    disabled={selectedIds.size === 0 || isDeleting}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    Excluir Selecionados
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setIsBulkModalOpen(true)}
            className="flex items-center justify-center gap-3 rounded-xl bg-blue-600 px-8 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-xl transition-all hover:bg-blue-700 active:scale-95 group whitespace-nowrap"
          >
            <PackagePlus className="h-4 w-4" />
            Importar Vários
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-3 rounded-xl bg-[#1a1a1a] px-8 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-xl transition-all hover:bg-black active:scale-95 group whitespace-nowrap"
          >
            <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
            Novo Produto
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {paginatedProdutos.map((produto) => (
          <div 
            key={produto.id} 
            id={`prod-${produto.id}`}
            className={`group relative rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 transition-all hover:shadow-md ${
              highlightedId === produto.id 
                ? 'bg-indigo-50/50 ring-2 ring-indigo-500 scale-[1.01] z-10 shadow-lg' 
                : ''
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {showBulkMenu && (
                  <div className="animate-in fade-in slide-in-from-left-2 duration-200">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(produto.id)}
                      onChange={() => toggleSelection(produto.id)}
                      className="h-5 w-5 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                    />
                  </div>
                )}
                <div className="flex h-12 w-12 overflow-hidden items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shrink-0">
                {produto.imagem_url ? (
                  <img src={produto.imagem_url} alt={produto.nome} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <Package className="h-6 w-6" />
                )}
              </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                  produto.tipo_cliente === 'pf'
                    ? 'bg-sky-100 text-sky-700'
                    : produto.tipo_cliente === 'pj'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-purple-100 text-purple-700'
                }`}>
                  {produto.tipo_cliente === 'pf' ? <User className="h-3 w-3" /> : produto.tipo_cliente === 'pj' ? <Building2 className="h-3 w-3" /> : <MoreHorizontal className="h-3 w-3" />}
                  {produto.tipo_cliente === 'pf' ? 'PF' : produto.tipo_cliente === 'pj' ? 'PJ' : 'Ambos'}
                </span>
                <span className="font-mono text-xs font-bold text-neutral-400" title={getProductDisplayCodeLabel(produto)}>{getProductDisplayCode(produto)}</span>
              </div>
            </div>
            <h3 className="text-lg font-bold text-neutral-900">{produto.nome}</h3>
            {produto.categoria && (
              <span className="inline-block mt-1 mr-2 rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                {produto.categoria}
              </span>
            )}
            {produto.visivel_na_loja && (
              <span className="inline-block mt-1 mr-2 rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                🏪 Loja
              </span>
            )}
            {hasActiveProductDiscount(produto) && (
              <span className="inline-block mt-1 mr-2 rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 uppercase tracking-wider animate-pulse-subtle">
                🏷️ {formatProductDiscountPercentage(produto)}
              </span>
            )}
            {produto.controle_estoque && (
              <span className={`inline-block mt-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                (produto.estoque_disponivel || 0) <= 5 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                📦 Estoque: {produto.estoque_disponivel || 0}
              </span>
            )}
            <p className="mt-1 text-sm text-neutral-500 line-clamp-2">{produto.descricao || 'Sem descrição.'}</p>
            <div className="mt-6 flex items-center justify-between gap-4">
              <div className="flex flex-col shrink-0">
                {hasActiveProductDiscount(produto) ? (
                  <>
                    <span className="text-xs text-neutral-400 line-through font-bold leading-tight">{formatCurrency(produto.valor)}</span>
                    <span className="text-lg font-black text-indigo-600 leading-none mt-0.5">{formatCurrency(produto.valor_promocional!)}</span>
                  </>
                ) : (
                  <span className="text-lg font-black text-indigo-600">{formatCurrency(produto.valor)}</span>
                )}
              </div>
                <button 
                  onClick={() => { setSelectedProduto(produto); setIsDetailOpen(true); }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 px-6 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-black active:scale-95 shadow-lg whitespace-nowrap"
                >
                  Ver Detalhes
                </button>
            </div>
          </div>
          ))}
      </div>

      {/* Barra de Paginação de Alta Performance */}
      {produtos.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-neutral-200 shadow-sm mt-6">
          <div className="flex items-center gap-3 text-xs text-neutral-600 font-medium">
            <span>
              Exibindo <strong className="text-neutral-900 font-bold">{Math.min(produtos.length, currentPage * pageSize + 1)}</strong> - <strong className="text-neutral-900 font-bold">{Math.min(produtos.length, (currentPage + 1) * pageSize)}</strong> de <strong className="text-neutral-900 font-bold">{produtos.length}</strong> produtos
            </span>
            <span className="text-neutral-300">|</span>
            <div className="flex items-center gap-2">
              <span>Por página:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(0);
                }}
                className="bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1 text-xs font-bold text-neutral-900 cursor-pointer focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value={24}>24</option>
                <option value={48}>48</option>
                <option value={96}>96</option>
                <option value={1000}>Todos</option>
              </select>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="admin-pagination flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(0)}
                disabled={currentPage === 0}
                className="p-2 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Primeira Página"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="p-2 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Página Anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <span className="px-4 py-1.5 text-xs font-bold text-neutral-800 bg-neutral-100 rounded-xl">
                {currentPage + 1} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className="p-2 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Próxima Página"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages - 1)}
                disabled={currentPage >= totalPages - 1}
                className="p-2 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Última Página"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Cadastrar Produto" size="wide">
        <ProdutoForm onSubmit={handleCreate} onCancel={() => setIsModalOpen(false)} categorias={categorias} />
      </Modal>

      {/* Modal de Edição */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Editar Produto" size="wide">
        <ProdutoForm 
          initialData={selectedProduto} 
          onSubmit={handleUpdate} 
          onCancel={() => setIsEditModalOpen(false)} 
          categorias={categorias}
        />
      </Modal>

      <Modal isOpen={isDetailOpen} onClose={() => { setIsDetailOpen(false); setIsDeleting(false); }} title="Detalhes do Produto" size="wide">
        {selectedProduto && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-neutral-50 p-6 ring-1 ring-neutral-200">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex gap-4">
                  <div className="relative group flex h-20 w-20 overflow-hidden items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shrink-0 border border-neutral-200">
                    {selectedProduto.imagem_url ? (
                      <img src={selectedProduto.imagem_url} alt={selectedProduto.nome} className="h-full w-full object-contain" />
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
                    selectedProduto.tipo_cliente === 'pf'
                      ? 'bg-sky-100 text-sky-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {selectedProduto.tipo_cliente === 'pf' ? <User className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                    {selectedProduto.tipo_cliente === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                  </span>
                  <span className="font-mono text-sm font-bold text-neutral-400" title={getProductDisplayCodeLabel(selectedProduto)}>{getProductDisplayCode(selectedProduto)}</span>
                </div>
                    <h3 className="text-2xl font-bold text-neutral-900">{selectedProduto.nome}</h3>
                  </div>
                </div>
                <AdminWhatsAppButton 
                  mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                    tipo: 'produto',
                    titulo: selectedProduto.nome,
                    codigo: selectedProduto.codigo_produto
                  })}
                  className="shrink-0"
                />
              </div>
              {selectedProduto.categoria && (
                <span className="inline-block mt-2 rounded-lg bg-neutral-200/60 px-3 py-1 text-xs font-bold text-neutral-600 uppercase tracking-wider">
                  Categoria: {selectedProduto.categoria}
                </span>
              )}
              <p className="mt-2 text-neutral-600">{selectedProduto.descricao || 'Sem descrição disponível.'}</p>
              <div className="mt-8 grid grid-cols-3 gap-4 border-t border-neutral-100 pt-6">
                <div>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Custo</p>
                  <p className="text-xl font-black text-neutral-500">{formatCurrency(selectedProduto.valor_custo || 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Margem / Lucro</p>
                  <p className="text-xl font-black text-emerald-600">
                    +{selectedProduto.porcentagem_lucro}% 
                    <span className="text-[10px] ml-1 text-neutral-400">({formatCurrency((selectedProduto.valor || 0) - (selectedProduto.valor_custo || 0))})</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Venda (Final)</p>
                  <p className="text-2xl font-black text-indigo-600">{formatCurrency(selectedProduto.valor)}</p>
                </div>
              </div>

              {/* Seção de Desconto na GSA Store */}
              <div className="mt-6 border-t border-neutral-100 pt-6">
                <h4 className="text-xs font-bold text-indigo-600 uppercase mb-4 flex items-center gap-2">
                  <Tag className="w-4 h-4" /> Desconto na GSA Store
                </h4>

                <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200 space-y-4">
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div>
                      <span className="text-sm font-bold text-neutral-700 group-hover:text-indigo-600 transition-colors">Ativar desconto neste produto</span>
                    </div>
                    <div className="relative">
                      <input 
                        type="checkbox"
                        className="sr-only peer"
                        checked={discountActive}
                        onChange={(e) => {
                          setDiscountActive(e.target.checked);
                          if (!e.target.checked) {
                            setDiscountValue('');
                          }
                        }}
                      />
                      <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </div>
                  </label>

                  {discountActive && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                      <div>
                        <span className="text-xs font-bold text-neutral-400 uppercase block mb-2">Tipo de Desconto</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setDiscountType('porcentagem')}
                            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all border-2 ${
                              discountType === 'porcentagem'
                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                : 'border-neutral-100 bg-white text-neutral-400'
                            }`}
                          >
                            Porcentagem (%)
                          </button>
                          <button
                            type="button"
                            onClick={() => setDiscountType('valor')}
                            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all border-2 ${
                              discountType === 'valor'
                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                : 'border-neutral-100 bg-white text-neutral-400'
                            }`}
                          >
                            Valor Fixo (R$)
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-neutral-400 uppercase mb-2">
                          {discountType === 'porcentagem' ? 'Valor do Desconto (%)' : 'Valor do Desconto (R$)'}
                        </label>
                        <input 
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder={discountType === 'porcentagem' ? 'Ex: 40' : 'Ex: 20'}
                          value={discountValue}
                          inputMode="numeric"
onChange={(e) => setDiscountValue(e.target.value)}
                          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                        />
                      </div>

                      {/* Preview do Desconto */}
                      {(() => {
                        const originalVal = selectedProduto.valor || 0;
                        const descVal = parseFloat(discountValue) || 0;
                        let promoVal = originalVal;
                        let pctEfetivo = 0;
                        let valid = false;

                        if (descVal > 0) {
                          if (discountType === 'porcentagem') {
                            if (descVal < 100) {
                              promoVal = Number((originalVal * (1 - descVal / 100)).toFixed(2));
                              pctEfetivo = descVal;
                              valid = true;
                            }
                          } else {
                            if (descVal < originalVal) {
                              promoVal = Number((originalVal - descVal).toFixed(2));
                              pctEfetivo = Number((((originalVal - promoVal) / originalVal) * 100).toFixed(2));
                              valid = true;
                            }
                          }
                        }

                        const economia = Number((originalVal - promoVal).toFixed(2));
                        const lucroAprox = Number((promoVal - (selectedProduto.valor_custo || 0)).toFixed(2));
                        const abaixoCusto = promoVal < (selectedProduto.valor_custo || 0);

                        return (
                          <div className="border-t border-neutral-200/60 pt-3 mt-3 space-y-1.5 text-xs text-neutral-600">
                            <div className="flex justify-between">
                              <span>Preço Normal:</span>
                              <span className="font-bold">{formatCurrency(originalVal)}</span>
                            </div>
                            {valid && (
                              <>
                                <div className="flex justify-between">
                                  <span>Preço Promocional:</span>
                                  <span className="font-bold text-indigo-600">{formatCurrency(promoVal)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Percentual Efetivo:</span>
                                  <span className="font-bold text-emerald-600">
                                    {pctEfetivo % 1 === 0 ? pctEfetivo.toFixed(0) : pctEfetivo.toFixed(2).replace('.', ',')}% OFF
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Economia para o Cliente:</span>
                                  <span className="font-bold text-emerald-600">{formatCurrency(economia)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Margem Lucro Aprox:</span>
                                  <span className={`font-bold ${lucroAprox < 0 ? 'text-red-600' : 'text-neutral-700'}`}>
                                    {formatCurrency(lucroAprox)}
                                  </span>
                                </div>
                                {abaixoCusto && (
                                  <div className="p-2 rounded bg-red-50 border border-red-100 text-red-700 font-semibold mt-2 text-[10px] animate-pulse-subtle">
                                    Atenção: o preço promocional está abaixo do valor de custo.
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })()}
                      {/* Prazo da Promoção */}
                      <div className="border-t border-neutral-200/60 pt-3 mt-1">
                        <span className="text-xs font-bold text-neutral-400 uppercase block mb-2">Prazo da Promoção</span>
                        <div className="flex gap-2 mb-3">
                          <button
                            type="button"
                            onClick={() => setDiscountValidityType('indeterminado')}
                            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all border-2 ${
                              discountValidityType === 'indeterminado'
                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                : 'border-neutral-100 bg-white text-neutral-400'
                            }`}
                          >
                            Indeterminado
                          </button>
                          <button
                            type="button"
                            onClick={() => setDiscountValidityType('determinado')}
                            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all border-2 ${
                              discountValidityType === 'determinado'
                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                : 'border-neutral-100 bg-white text-neutral-400'
                            }`}
                          >
                            Com prazo
                          </button>
                        </div>
                        {discountValidityType === 'determinado' && (
                          <div>
                            <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Data Final da Promoção</label>
                            <input
                              type="date"
                              value={discountEndDate}
                              min={new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())}
                              onChange={(e) => setDiscountEndDate(e.target.value)}
                              className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                            />
                            {discountEndDate && (() => {
                              const info = getProductDiscountValidityInfo({
                                ...selectedProduto,
                                desconto_prazo_tipo: 'determinado',
                                desconto_fim_em: new Date(`${discountEndDate}T23:59:59-03:00`).toISOString()
                              });
                              return info.diasRestantes !== null ? (
                                <p className="mt-1.5 text-xs text-indigo-600 font-semibold">
                                  {getProductRemainingDaysText({ ...selectedProduto, desconto_prazo_tipo: 'determinado', desconto_fim_em: new Date(`${discountEndDate}T23:59:59-03:00`).toISOString() })}
                                </p>
                              ) : null;
                            })()}
                          </div>
                        )}
                      </div>

                      {/* Quantidade Promocional */}
                      <div className="border-t border-neutral-200/60 pt-3 mt-1">
                        <span className="text-xs font-bold text-neutral-400 uppercase block mb-2">Quantidade Promocional</span>
                        <div className="flex gap-2 mb-3">
                          <button
                            type="button"
                            onClick={() => { setDiscountQuantityLimited(false); setDiscountQuantityLimit(''); }}
                            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all border-2 ${
                              !discountQuantityLimited
                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                : 'border-neutral-100 bg-white text-neutral-400'
                            }`}
                          >
                            Ilimitada
                          </button>
                          <button
                            type="button"
                            onClick={() => setDiscountQuantityLimited(true)}
                            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all border-2 ${
                              discountQuantityLimited
                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                : 'border-neutral-100 bg-white text-neutral-400'
                            }`}
                          >
                            Limitar unidades
                          </button>
                        </div>

                        {discountQuantityLimited && (
                          <div className="space-y-2">
                            <div>
                              <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Unidades com desconto</label>
                              <input 
                                type="number"
                                step="1"
                                min="1"
                                placeholder="Ex: 50"
                                value={discountQuantityLimit}
                                inputMode="numeric"
onChange={(e) => setDiscountQuantityLimit(e.target.value)}
                                className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                              />
                            </div>

                            {/* Progresso da cota atual */}
                            {selectedProduto.desconto_limite_quantidade_ativo && selectedProduto.desconto_quantidade_limite && (
                              <div className="bg-white rounded-xl border border-neutral-100 p-3 space-y-2">
                                {(() => {
                                  const utilizada = selectedProduto.desconto_quantidade_utilizada || 0;
                                  const limite = selectedProduto.desconto_quantidade_limite || 0;
                                  const restante = Math.max(0, limite - utilizada);
                                  const pct = limite > 0 ? Math.min(100, (utilizada / limite) * 100) : 0;
                                  const esgotada = restante === 0;
                                  return (
                                    <>
                                      <div className="flex justify-between text-xs">
                                        <span className="text-neutral-500">Campanha atual</span>
                                        <span className={`font-bold ${esgotada ? 'text-red-600' : 'text-indigo-600'}`}>
                                          {esgotada ? '🔴 Cota esgotada' : `${restante} restantes`}
                                        </span>
                                      </div>
                                      <div className="flex justify-between text-[10px] text-neutral-400">
                                        <span>Vendidas com desc.: <strong className="text-neutral-700">{utilizada}</strong></span>
                                        <span>Limite: <strong className="text-neutral-700">{limite}</strong></span>
                                      </div>
                                      <div className="w-full bg-neutral-100 rounded-full h-2">
                                        <div
                                          className={`h-2 rounded-full transition-all ${esgotada ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => setShowNewCampaignModal(true)}
                                        className="w-full py-1.5 px-3 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-all"
                                      >
                                        🔄 Iniciar nova campanha e zerar contagem
                                      </button>
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(() => {
                    const descVal = parseFloat(discountValue);
                    const originalVal = selectedProduto.valor || 0;
                    const isDiscountFormValid = discountActive &&
                      !isNaN(descVal) &&
                      descVal > 0 &&
                      (discountType !== 'porcentagem' || descVal < 100) &&
                      (discountType !== 'valor' || descVal < originalVal) &&
                      (discountValidityType !== 'determinado' || (Boolean(discountEndDate) && discountEndDate >= new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date()))) &&
                      (!discountQuantityLimited || (Boolean(discountQuantityLimit) && parseInt(discountQuantityLimit, 10) > 0));

                    return (
                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          disabled={isSavingDiscount || !isDiscountFormValid}
                          onClick={async () => {
                            if (!isDiscountFormValid) return;

                            if (discountActive) {
                              if (isNaN(descVal) || descVal <= 0) {
                                toast.error('Informe um valor de desconto maior que zero.');
                                return;
                              }
                              if (discountType === 'porcentagem' && descVal >= 100) {
                                toast.error('O desconto de porcentagem deve ser menor que 100%.');
                                return;
                              }
                              if (discountType === 'valor' && descVal >= originalVal) {
                                toast.error('O desconto fixo deve ser menor que o preço original.');
                                return;
                              }
                              if (discountValidityType === 'determinado') {
                                if (!discountEndDate) {
                                  toast.error('Informe a data final da promoção.');
                                  return;
                                }
                                const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
                                if (discountEndDate < today) {
                                  toast.error('A data final da promoção não pode ser no passado.');
                                  return;
                                }
                              }
                            }

                            setIsSavingDiscount(true);
                            try {
                              let fimEmISO: string | null = null;
                              if (discountActive && discountValidityType === 'determinado' && discountEndDate) {
                                fimEmISO = new Date(`${discountEndDate}T23:59:59-03:00`).toISOString();
                              }
                              const limiteQtd = discountQuantityLimited && discountQuantityLimit ? parseInt(discountQuantityLimit, 10) : null;

                              if (discountActive && discountQuantityLimited) {
                                if (!limiteQtd || limiteQtd < 1 || !Number.isInteger(limiteQtd)) {
                                  toast.error('A quantidade limite deve ser um número inteiro maior que zero.');
                                  setIsSavingDiscount(false);
                                  return;
                                }
                                const utilizada = selectedProduto.desconto_quantidade_utilizada || 0;
                                if (limiteQtd < utilizada) {
                                  toast.error(`O limite não pode ser menor que as ${utilizada} unidades já utilizadas nesta campanha.`);
                                  setIsSavingDiscount(false);
                                  return;
                                }
                              }

                              const data = await setAdminProductDiscount(
                                selectedProduto.id,
                                discountActive,
                                discountActive ? discountType : null,
                                discountActive ? descVal : null,
                                discountActive ? discountValidityType : 'indeterminado',
                                fimEmISO,
                                discountActive ? discountQuantityLimited : false,
                                discountActive && discountQuantityLimited ? limiteQtd : null
                              );

                              if (data && data.success) {
                                toast.success('Configuração de desconto atualizada!');
                                
                                await logService.logAction({
                                  acao: 'EDITAR_PRODUTO',
                                  ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
                                  ator_id: colaboradorId || undefined,
                                  ator_nome: colaboradorNome || 'Administrador',
                                  detalhes: discountActive 
                                    ? `Configurou desconto no produto ${selectedProduto.nome}: Tipo: ${discountType}, Valor: ${descVal}, Promocional: R$ ${data.valor_promocional}, Efetivo: ${data.desconto_percentual}% OFF`
                                    : `Removeu desconto do produto ${selectedProduto.nome}`
                                });

                                setSelectedProduto({
                                  ...selectedProduto,
                                  desconto_ativo: data.desconto_ativo,
                                  desconto_tipo: data.desconto_tipo,
                                  desconto_valor: data.desconto_valor,
                                  valor_promocional: data.valor_promocional,
                                  desconto_percentual: data.desconto_percentual,
                                  desconto_prazo_tipo: data.desconto_prazo_tipo || discountValidityType,
                                  desconto_fim_em: data.desconto_fim_em || null,
                                  desconto_limite_quantidade_ativo: data.desconto_limite_quantidade_ativo || false,
                                  desconto_quantidade_limite: data.desconto_quantidade_limite || null,
                                  desconto_quantidade_utilizada: data.desconto_quantidade_utilizada || 0,
                                  desconto_campanha_id: data.desconto_campanha_id || null
                                });

                                fetchProdutos();
                              } else {
                                toast.error('Erro ao atualizar desconto.');
                              }
                            } catch (err: any) {
                              console.error(err);
                              toast.error(err.message || 'Erro ao aplicar desconto.');
                            } finally {
                              setIsSavingDiscount(false);
                            }
                          }}
                          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                            isDiscountFormValid && !isSavingDiscount
                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 cursor-pointer'
                              : 'bg-neutral-200 text-neutral-400 cursor-not-allowed shadow-none'
                          }`}
                        >
                          {isSavingDiscount ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          Aplicar desconto
                        </button>

                        {selectedProduto.desconto_ativo && (
                          <button
                            type="button"
                            disabled={isSavingDiscount}
                            onClick={async () => {
                              setIsSavingDiscount(true);
                              try {
                                const data = await setAdminProductDiscount(
                                  selectedProduto.id,
                                  false,
                                  null,
                                  null
                                );

                                if (data && data.success) {
                                  toast.success('Desconto removido com sucesso!');
                                  
                                  await logService.logAction({
                                    acao: 'EDITAR_PRODUTO',
                                    ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
                                    ator_id: colaboradorId || undefined,
                                    ator_nome: colaboradorNome || 'Administrador',
                                    detalhes: `Removeu desconto do produto ${selectedProduto.nome}`
                                  });

                                  setDiscountActive(false);
                                  setDiscountValue('');
                                  setDiscountValidityType('indeterminado');
                                  setDiscountEndDate('');

                                  setDiscountQuantityLimited(false);
                                  setDiscountQuantityLimit('');
                                  setSelectedProduto({
                                    ...selectedProduto,
                                    desconto_ativo: false,
                                    desconto_tipo: null,
                                    desconto_valor: null,
                                    valor_promocional: null,
                                    desconto_percentual: null,
                                    desconto_prazo_tipo: undefined,
                                    desconto_fim_em: undefined,
                                    desconto_limite_quantidade_ativo: false,
                                    desconto_quantidade_limite: null
                                  });

                                  fetchProdutos();
                                }
                              } catch (err: any) {
                                console.error(err);
                                toast.error(err.message || 'Erro ao remover desconto.');
                              } finally {
                                setIsSavingDiscount(false);
                              }
                            }}
                            className="py-2 px-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition-all border border-red-200 disabled:opacity-50"
                          >
                            Remover desconto
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
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
                          const current = selectedProduto.tipo_cliente;
                          let next = current;
                          if (tipo === 'pf') {
                            if (current === 'pj') next = 'ambos';
                            else if (current === 'ambos') next = 'pj';
                          } else {
                            if (current === 'pf') next = 'ambos';
                            else if (current === 'ambos') next = 'pf';
                          }

                          if (next === current) return;

                          setSelectedProduto({ ...selectedProduto, tipo_cliente: next });
                          const auditTag = colaboradorNome ? ` [Alt. por: ${colaboradorNome}]` : '';
                          try {
                            await callAdminRpc('gsa_admin_patch_marketplace_product', {
                              p_produto_id: selectedProduto.id,
                              p_patch: { tipo_cliente: next, descricao: `${selectedProduto.descricao || ''} ${auditTag}`.trim() },
                            });
                            
                            toast.success('Tipo de cliente atualizado.');
                            
                            // Log Action
                            await logService.logAction({
                              acao: 'EDITAR_PRODUTO',
                              ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
                              ator_id: colaboradorId || undefined,
                              ator_nome: colaboradorNome || 'Administrador',
                              detalhes: `Alterou o tipo de cliente do produto ${selectedProduto.nome} para ${next}`
                            });
                            fetchProdutos();
                          } catch (error) {
                            console.error('Erro ao atualizar tipo de cliente:', error);
                            toast.error('Ocorreu um erro ao atualizar o tipo de cliente. Por favor, tente novamente.');
                          }
                        }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all border-2 ${
                          selectedProduto.tipo_cliente === tipo || selectedProduto.tipo_cliente === 'ambos'
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
                    value={selectedProduto.categoria_id || ''}
                    onChange={async (e) => {
                      const catId = e.target.value;
                      const catNome = categorias.find(c => c.id === catId)?.nome || '';
                      setSelectedProduto({ ...selectedProduto, categoria_id: catId, categoria: catNome });
                      const auditTag = colaboradorNome ? ` [Alt. por: ${colaboradorNome}]` : '';
                      try {
                        await callAdminRpc('gsa_admin_patch_marketplace_product', {
                          p_produto_id: selectedProduto.id,
                          p_patch: { categoria_id: catId || null, categoria: catNome || null, descricao: `${selectedProduto.descricao || ''} ${auditTag}`.trim() },
                        });
                        
                        toast.success('Categoria atualizada.');
                        await logService.logAction({
                          acao: 'EDITAR_PRODUTO',
                          ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
                          ator_id: colaboradorId || undefined,
                          ator_nome: colaboradorNome || 'Administrador',
                          detalhes: `Alterou a categoria do produto ${selectedProduto.nome} para ${catNome || 'nenhuma'}`
                        });
                        fetchProdutos(); 
                      } catch (error) {
                        console.error('Erro ao salvar categoria:', error);
                        toast.error('Ocorreu um erro ao atualizar a categoria. Por favor, tente novamente.');
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
                      checked={selectedProduto.ocultar_valor || false}
                      onChange={async (e) => {
                        const newOcultar = e.target.checked;
                        setSelectedProduto({ ...selectedProduto, ocultar_valor: newOcultar });
                        const auditTag = colaboradorNome ? ` [Alt. por: ${colaboradorNome}]` : '';
                        try {
                          await callAdminRpc('gsa_admin_patch_marketplace_product', {
                            p_produto_id: selectedProduto.id,
                            p_patch: { ocultar_valor: newOcultar, descricao: `${selectedProduto.descricao || ''} ${auditTag}`.trim() },
                          });
                          
                          toast.success('Visibilidade de preço atualizada.');
                          await logService.logAction({
                            acao: 'EDITAR_PRODUTO',
                            ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
                            ator_id: colaboradorId || undefined,
                            ator_nome: colaboradorNome || 'Administrador',
                            detalhes: `${newOcultar ? 'Ocultou' : 'Exibiu'} o valor do produto ${selectedProduto.nome} para clientes`
                          });
                          fetchProdutos();
                        } catch (error) {
                          console.error('Erro ao atualizar visibilidade de preço:', error);
                          toast.error('Ocorreu um erro ao atualizar a visibilidade do preço. Por favor, tente novamente.');
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
                      <p className="text-[10px] text-neutral-400 font-medium mt-0.5">Disponibiliza o produto para compra direta.</p>
                    </div>
                    <div className="relative">
                      <input 
                        type="checkbox"
                        className="sr-only peer"
                        checked={selectedProduto.visivel_na_loja || false}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setSelectedProduto({ ...selectedProduto, visivel_na_loja: val });
                          try {
                            await callAdminRpc('gsa_admin_patch_marketplace_product', { p_produto_id: selectedProduto.id, p_patch: { visivel_na_loja: val } });
                            toast.success('Visibilidade na loja atualizada.');
                            fetchProdutos();
                          } catch (error) {
                            console.error('Erro ao atualizar visibilidade na loja:', error);
                            toast.error('Ocorreu um erro ao atualizar a visibilidade na loja. Por favor, tente novamente.');
                          }
                        }}
                      />
                      <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </div>
                  </label>

                  <label className="flex items-center justify-between cursor-pointer group mb-4">
                    <div>
                      <span className="text-sm font-bold text-neutral-700 group-hover:text-indigo-600 transition-colors">Controle de Estoque</span>
                      <p className="text-[10px] text-neutral-400 font-medium mt-0.5">Baixa automática ao realizar vendas.</p>
                    </div>
                    <div className="relative">
                      <input 
                        type="checkbox"
                        className="sr-only peer"
                        checked={selectedProduto.controle_estoque || false}
                        onChange={async (e) => {
                          const val = e.target.checked;
                          setSelectedProduto({ ...selectedProduto, controle_estoque: val });
                          try {
                            await callAdminRpc('gsa_admin_patch_marketplace_product', { p_produto_id: selectedProduto.id, p_patch: { controle_estoque: val } });
                            toast.success('Controle de estoque atualizado.');
                            fetchProdutos();
                          } catch (error) {
                            console.error('Erro ao atualizar controle de estoque:', error);
                            toast.error('Ocorreu um erro ao atualizar o controle de estoque. Por favor, tente novamente.');
                          }
                        }}
                      />
                      <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </div>
                  </label>

                  {selectedProduto.controle_estoque && (
                    <div className="flex items-center justify-between p-4 bg-white border border-neutral-100 rounded-2xl animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                          <Package className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                          <span className="text-sm font-bold text-neutral-700">Quantidade em Estoque</span>
                          <p className="text-[10px] text-neutral-400 font-medium">Estoque atual disponível.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="block text-xl font-black text-neutral-900">{selectedProduto.estoque_disponivel || 0}</span>
                          <span className="text-[9px] font-bold text-neutral-400 uppercase">Unidades</span>
                        </div>
                        <button 
                          onClick={() => setIsAjusteOpen(true)}
                          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
                        >
                          <Settings2 className="w-3.5 h-3.5" />
                          Ajustar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Exibição de Configuração de Fornecedor Externo no Detalhe */}
                {loadingDetailConfig ? (
                  <div className="border-t border-neutral-100 pt-6 mt-4 flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                  </div>
                ) : detailSupplierConfig?.fornecimento_externo_ativo && (
                  <div className="border-t border-neutral-100 pt-6 mt-4">
                    <h4 className="text-xs font-bold text-amber-600 uppercase mb-4 flex items-center gap-2">
                      <Store className="w-4 h-4" /> Compra Externa Necessária
                    </h4>
                    <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                      <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                        <div>
                          <p className="text-[10px] font-bold text-amber-700/60 uppercase">Fornecedor</p>
                          <p className="text-sm font-bold text-amber-900">{detailSupplierConfig.nome_fornecedor || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-amber-700/60 uppercase">Tipo</p>
                          <p className="text-sm font-medium text-amber-800">
                            {detailSupplierConfig.tipo_fornecedor === 'online' ? 'Site / Online' : 
                             detailSupplierConfig.tipo_fornecedor === 'loja_fisica' ? 'Loja Física' : 'N/A'}
                          </p>
                        </div>
                        {detailSupplierConfig.url_produto && (
                          <div className="col-span-2">
                            <p className="text-[10px] font-bold text-amber-700/60 uppercase">Link</p>
                            <a href={detailSupplierConfig.url_produto} target="_blank" rel="noreferrer" className="text-sm font-medium text-sky-600 hover:underline break-all">
                              {detailSupplierConfig.url_produto}
                            </a>
                          </div>
                        )}
                        {detailSupplierConfig.cidade && (
                          <div>
                            <p className="text-[10px] font-bold text-amber-700/60 uppercase">Localização</p>
                            <p className="text-sm font-medium text-amber-800">
                              {detailSupplierConfig.cidade}{detailSupplierConfig.estado ? ` / ${detailSupplierConfig.estado}` : ''}
                            </p>
                          </div>
                        )}
                        {detailSupplierConfig.telefone && (
                          <div>
                            <p className="text-[10px] font-bold text-amber-700/60 uppercase">Contato</p>
                            <p className="text-sm font-medium text-amber-800">{maskPhone(detailSupplierConfig.telefone)}</p>
                          </div>
                        )}
                        {detailSupplierConfig.endereco && (
                          <div className="col-span-2">
                            <p className="text-[10px] font-bold text-amber-700/60 uppercase">Endereço</p>
                            <p className="text-sm font-medium text-amber-800">{detailSupplierConfig.endereco}</p>
                          </div>
                        )}
                        {detailSupplierConfig.observacoes && (
                          <div className="col-span-2">
                            <p className="text-[10px] font-bold text-amber-700/60 uppercase">Observações</p>
                            <p className="text-sm font-medium text-amber-800 italic">{detailSupplierConfig.observacoes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Galeria no Modal de Detalhes */}
                <div className="border-t border-neutral-100 pt-6 mt-4">
                  <p className="text-xs font-bold text-neutral-400 uppercase mb-4">Galeria de Imagens</p>
                  <div className="grid grid-cols-5 gap-3">
                    {mapColumnsToGallery(selectedProduto).map((url, idx) => (
                      <div key={url} className="aspect-square rounded-xl border border-neutral-200 bg-neutral-50 overflow-hidden flex items-center justify-center">
                        <img src={url} alt="" className="w-full h-full object-contain" />
                      </div>
                    ))}
                    {mapColumnsToGallery(selectedProduto).length === 0 && (
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
                  Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita.
                  <br />
                  <span className="font-bold">Nota:</span> Se este produto estiver vinculado a algum orçamento, a exclusão poderá falhar.
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
                      const canProceed = await canDeleteRecord('produtos', selectedProduto.id);
                      if (!canProceed) {
                        setIsDeleting(false);
                        setIsDetailOpen(false);
                        return;
                      }

                      try {
                        await deleteAdminProductsBulk([selectedProduto.id]);
                        toast.success('Produto excluído definitivamente com sucesso.');
                        setIsDetailOpen(false);
                        setIsDeleting(false);
                        setProdutos((prev) => prev.filter((p) => p.id !== selectedProduto.id));
                        fetchProdutos();
                      } catch (error) {
                        toast.error(handleError(error, 'Erro ao excluir produto'));
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
                      const newStatus = selectedProduto.status === 'ativo' ? 'inativo' : 'ativo';
                      const auditTag = colaboradorNome ? ` [Alt. por: ${colaboradorNome}]` : '';
                      try {
                        if (newStatus === 'inativo') {
                          await archiveAdminCatalogItems('produto', [selectedProduto.id]);
                        } else {
                          await callAdminRpc('gsa_admin_patch_marketplace_product', {
                            p_produto_id: selectedProduto.id,
                            p_patch: { status: newStatus, descricao: `${selectedProduto.descricao || ''} ${auditTag}`.trim() },
                          });
                        }
                        
                        toast.success(`Produto ${newStatus === 'ativo' ? 'ativado' : 'inativado'} com sucesso.`);
                        
                        // Log Action
                        await logService.logAction({
                          acao: newStatus === 'ativo' ? 'ATIVAR_PRODUTO' : 'INATIVAR_PRODUTO',
                          ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
                          ator_id: colaboradorId || undefined,
                          ator_nome: colaboradorNome || 'Administrador',
                          detalhes: `${newStatus === 'ativo' ? 'Ativou' : 'Inativou'} o produto: ${selectedProduto.nome}`
                        });

                        setIsDetailOpen(false);
                        fetchProdutos();
                      } catch (error) {
                        console.error('Erro ao alterar status:', error);
                        toast.error('Ocorreu um erro ao alterar o status. Por favor, tente novamente.');
                      }
                    }}
                    className={`flex-1 rounded-xl py-4 font-bold transition-all ${selectedProduto.status === 'ativo' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                  >
                    {selectedProduto.status === 'ativo' ? 'Inativar Produto' : 'Ativar Produto'}
                  </button>
                  <button 
                    onClick={() => {
                      setIsDetailOpen(false);
                      setIsEditModalOpen(true);
                    }}
                    className="flex-1 rounded-xl bg-indigo-600 py-4 font-bold text-white hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
                  >
                    <Upload className="w-5 h-5 rotate-180" />
                    Editar Produto
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
                  Excluir Produto
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal de Ajuste de Estoque */}
      {selectedProduto && (
        <AjusteEstoqueModal 
          isOpen={isAjusteOpen}
          onClose={() => setIsAjusteOpen(false)}
          produto={selectedProduto}
          onSuccess={() => {
            fetchProdutos();
            setIsAjusteOpen(false);
          }}
          colaboradorNome={colaboradorNome}
        />
      )}
      
      <BulkProductImportModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        categorias={categorias}
        onSuccess={() => {
          setIsBulkModalOpen(false);
          fetchProdutos();
        }}
      />

      {/* Modal de Confirmação: Nova Campanha */}
      {showNewCampaignModal && selectedProduto && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowNewCampaignModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm z-10">
            <div className="text-center mb-5">
              <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">🔄</span>
              </div>
              <h3 className="text-lg font-black text-neutral-900 mb-1">Iniciar nova campanha?</h3>
              <p className="text-sm text-neutral-500">
                A contagem atual de <strong className="text-neutral-700">{selectedProduto.desconto_quantidade_utilizada || 0} unidades vendidas</strong> será zerada e uma nova campanha promocional será iniciada. O histórico anterior será preservado.
              </p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-5 text-xs text-amber-800 font-semibold">
              ⚠️ Esta ação não pode ser desfeita. Os pedidos anteriores não serão afetados.
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowNewCampaignModal(false)}
                className="flex-1 py-3 rounded-2xl border border-neutral-200 text-sm font-bold text-neutral-600 hover:bg-neutral-50 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingDiscount}
                onClick={async () => {
                  if (!selectedProduto) return;
                  setIsSavingDiscount(true);
                  try {
                    const descVal = parseFloat(discountValue) || 0;
                    let fimEmISO: string | null = null;
                    if (discountValidityType === 'determinado' && discountEndDate) {
                      fimEmISO = new Date(`${discountEndDate}T23:59:59-03:00`).toISOString();
                    }
                    const limiteQtd = discountQuantityLimit ? parseInt(discountQuantityLimit, 10) : null;
                    const data = await setAdminProductDiscount(
                      selectedProduto.id,
                      true,
                      discountType,
                      descVal,
                      discountValidityType,
                      fimEmISO,
                      true,
                      limiteQtd,
                      true // iniciarNovaCampanha = true
                    );
                    if (data && data.success) {
                      toast.success('Nova campanha iniciada! Contagem zerada.');
                      setSelectedProduto({
                        ...selectedProduto,
                        desconto_ativo: data.desconto_ativo,
                        desconto_tipo: data.desconto_tipo,
                        desconto_valor: data.desconto_valor,
                        valor_promocional: data.valor_promocional,
                        desconto_percentual: data.desconto_percentual,
                        desconto_prazo_tipo: data.desconto_prazo_tipo || discountValidityType,
                        desconto_fim_em: data.desconto_fim_em || null,
                        desconto_limite_quantidade_ativo: data.desconto_limite_quantidade_ativo || false,
                        desconto_quantidade_limite: data.desconto_quantidade_limite || null,
                        desconto_quantidade_utilizada: 0,
                        desconto_campanha_id: data.desconto_campanha_id || null
                      });
                      fetchProdutos();
                      setShowNewCampaignModal(false);
                    } else {
                      toast.error('Erro ao iniciar nova campanha.');
                    }
                  } catch (err: any) {
                    toast.error(err.message || 'Erro ao iniciar nova campanha.');
                  } finally {
                    setIsSavingDiscount(false);
                  }
                }}
                className="flex-1 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-black shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSavingDiscount ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog {...confirmHook} />
    </div>
  );
}

function ProdutoForm({ initialData, onSubmit, onCancel, categorias = [] }: { initialData?: Produto | null, onSubmit: (data: any) => Promise<boolean>, onCancel: () => void, categorias?: any[] }) {
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
    controle_estoque: initialData?.controle_estoque || false,
    estoque_disponivel: initialData?.estoque_disponivel?.toString() || '',
    valor_custo: initialData?.valor_custo?.toString() || '',
    porcentagem_lucro: initialData?.porcentagem_lucro?.toString() || '',
    imagens_adicionais: initialData ? mapColumnsToGallery(initialData) : [] as string[],
    codigo_barras: initialData?.codigo_barras || '',
    identificador_preferencial: initialData?.identificador_preferencial || 'interno',
    tipo_codigo_barras: initialData?.tipo_codigo_barras || ''
  });

  const [fornecedorConfig, setFornecedorConfig] = useState<ProdutoFornecedorConfig>({
    fornecimento_externo_ativo: false,
    tipo_fornecedor: null,
    nome_fornecedor: '',
    url_produto: '',
    cidade: '',
    estado: '',
    endereco: '',
    telefone: '',
    observacoes: ''
  });
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingBarcodes, setLoadingBarcodes] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Import State
  const [importState, setImportState] = useState<'idle'|'analyzing'|'preview'|'copying'|'error'>('idle');
  const [importData, setImportData] = useState<ParsedProductData | null>(null);
  const [importError, setImportError] = useState('');
  const [importSelection, setImportSelection] = useState({
    nome: true,
    descricao: true,
    preco: true,
    nome_fornecedor: true,
    imagens: [] as string[]
  });

  const [barcodeValidation, setBarcodeValidation] = useState<{ status: 'idle' | 'validating' | 'valid' | 'invalid' | 'duplicate', message: string }>({ status: 'idle', message: '' });

  const handleBarcodeChange = async (value: string) => {
    setFormData(prev => ({ ...prev, codigo_barras: value }));
    const norm = normalizeBarcode(value);
    
    if (!norm) {
      setFormData(prev => ({ ...prev, tipo_codigo_barras: '' }));
      setBarcodeValidation({ status: 'idle', message: '' });
      return;
    }

    const type = detectBarcodeType(norm);
    setFormData(prev => ({ ...prev, tipo_codigo_barras: type }));
    
    const localValidation = validateBarcode(norm, type);
    if (!localValidation.isValid) {
      setBarcodeValidation({ status: 'invalid', message: localValidation.error || 'Código inválido' });
      return;
    }

    setBarcodeValidation({ status: 'validating', message: 'Verificando duplicidade...' });
    
    try {
      const sessionData = sessionService.getCurrentSession();
      if (!sessionData) throw new Error('Sem sessão');
      
      const { data, error } = await supabase.rpc('gsa_admin_check_product_barcode', {
        p_sessao_id: sessionData.sessaoId,
        p_session_token: sessionData.sessionToken,
        p_codigo_barras: norm,
        p_produto_id: initialData?.id || null
      });

      if (error) throw error;
      
      const result = data as any[];
      if (result && result.length > 0 && result[0].is_duplicate) {
        setBarcodeValidation({ status: 'duplicate', message: `Este código de barras já pertence ao produto ${result[0].codigo_produto} — ${result[0].nome}` });
      } else {
        setBarcodeValidation({ status: 'valid', message: 'Código válido' });
      }
    } catch(e) {
      setBarcodeValidation({ status: 'invalid', message: 'Não foi possível verificar a duplicidade. Tente novamente antes de salvar.' });
    }
  };

  const isValidUrl = (urlString: string) => {
    try {
      return Boolean(new URL(urlString));
    } catch {
      return false;
    }
  };

  const handleAnalyzeUrl = async () => {
    if (!fornecedorConfig.url_produto || !isValidUrl(fornecedorConfig.url_produto)) return;
    setImportState('analyzing');
    setImportError('');
    try {
      const data = await productUrlImportService.analyzeProductUrl(fornecedorConfig.url_produto);
      setImportData(data);
      
      const currentImagesCount = formData.imagens_adicionais.length;
      
      setImportSelection({
        nome: !!data.nome,
        descricao: !!data.descricao,
        preco: !!data.preco && data.moeda === 'BRL',
        nome_fornecedor: !!data.nome_fornecedor,
        imagens: data.imagens.slice(0, Math.max(0, 5 - currentImagesCount))
      });
      setImportState('preview');
    } catch (e: any) {
      setImportState('error');
      setImportError(e.message || 'Erro desconhecido');
    }
  };

  const handleApplyImport = async () => {
    if (!importData) return;
    setImportState('copying');
    setImportError('');
    try {
      let finalImages = [...formData.imagens_adicionais];
      
      if (importSelection.imagens.length > 0) {
        const result = await productUrlImportService.importProductImages(importSelection.imagens);
        if (result.failed.length > 0) {
          toast.error(`Falha ao importar ${result.failed.length} imagens. As demais foram copiadas.`);
        }
        finalImages = [...finalImages, ...result.uploaded].slice(0, 5);
      }

      setFormData((prev: any) => {
        const next = { ...prev };
        if (importSelection.nome && importData.nome) next.nome = importData.nome;
        if (importSelection.descricao && importData.descricao) next.descricao = importData.descricao;
        if (importSelection.preco && importData.preco) {
           next.valor_custo = importData.preco.toString();
           const lucro = parseFloat(next.porcentagem_lucro || '0');
           if (lucro > 0) {
              next.valor = (Math.round(importData.preco * (1 + (lucro / 100)) * 100) / 100).toString();
           }
        }
        next.imagens_adicionais = finalImages;
        return next;
      });

      if (importSelection.nome_fornecedor && importData.nome_fornecedor) {
        setFornecedorConfig((prev: any) => ({...prev, nome_fornecedor: importData.nome_fornecedor || ''}));
      }

      toast.success('Dados importados aplicados com sucesso!');
      setImportState('idle');
      setImportData(null);
    } catch(e:any) {
      setImportState('error');
      setImportError(e.message || 'Erro ao aplicar importação');
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (initialData?.id) {
      setLoadingConfig(true);
      getAdminProductSupplierConfig(initialData.id)
        .then(data => {
          if (isMounted && data) {
            setFornecedorConfig({
              fornecimento_externo_ativo: data.fornecimento_externo_ativo || false,
              tipo_fornecedor: data.tipo_fornecedor || null,
              nome_fornecedor: data.nome_fornecedor || '',
              url_produto: data.url_produto || '',
              cidade: data.cidade || '',
              estado: data.estado || '',
              endereco: data.endereco || '',
              telefone: data.telefone || '',
              observacoes: data.observacoes || ''
            });
          }
        })
        .catch(err => {
          console.error("Erro ao carregar configuração de fornecedor:", err);
        })
        .finally(() => {
          if (isMounted) setLoadingConfig(false);
        });
    }
    return () => { isMounted = false; };
  }, [initialData?.id]);

  const handleCustoChange = (custo: string) => {
    const c = parseFloat(custo) || 0;
    const l = parseFloat(formData.porcentagem_lucro) || 0;
    const v = c * (1 + l / 100);
    setFormData({ ...formData, valor_custo: custo, valor: v.toFixed(2) });
  };

  const handleLucroChange = (lucro: string) => {
    const c = parseFloat(formData.valor_custo) || 0;
    const l = parseFloat(lucro) || 0;
    const v = c * (1 + l / 100);
    setFormData({ ...formData, porcentagem_lucro: lucro, valor: v.toFixed(2) });
  };

const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  if (!e.target.files || e.target.files.length === 0) return;
  const file = e.target.files[0];
  setUploadingGallery(true);
  try {
    const publicUrl = await uploadPublicStoreImage(file, 'produtos/galeria');
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
    <>
    <form onSubmit={async (e) => { 
      e.preventDefault(); 
      if (isSubmitting) return; 
      setIsSubmitting(true); 
      await onSubmit({
        ...formData,
        fornecedor_config: fornecedorConfig,
        valor: parseFloat(formData.valor) || 0, 
        valor_custo: parseFloat(formData.valor_custo) || 0,
        porcentagem_lucro: parseFloat(formData.porcentagem_lucro) || 0,
        categoria: formData.categoria || null,
        categoria_id: formData.categoria_id || null,
        estoque_disponivel: parseInt(formData.estoque_disponivel) || 0
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
            Pessoa Física (PF)
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
            Pessoa Jurídica (PJ)
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
        <p className="mt-1 text-[10px] text-neutral-400 font-medium">Opcional. Agrupa os produtos por categoria na loja.</p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-bold text-neutral-700">Nome do Produto *</label>
        <input 
          type="text" 
          required
          value={formData.nome}
          onChange={e => setFormData({...formData, nome: e.target.value})}
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {/* Seção Identificação do Produto */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest mb-4">Identificação do Produto</h4>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            type="button"
            onClick={() => {
              setFormData(prev => ({ ...prev, identificador_preferencial: 'interno' }));
              setBarcodeValidation({ status: 'idle', message: '' });
            }}
            className={`flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all ${
              formData.identificador_preferencial === 'interno'
                ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                : 'border-neutral-200 bg-white hover:border-indigo-300'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <span className="font-bold text-sm text-neutral-900">Código interno automático</span>
              <div className={`flex items-center justify-center w-5 h-5 rounded-full border ${
                formData.identificador_preferencial === 'interno' ? 'border-indigo-600 bg-indigo-600' : 'border-neutral-300'
              }`}>
                {formData.identificador_preferencial === 'interno' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </div>
            <span className="text-xs text-neutral-500">O sistema gerará automaticamente um código interno exclusivo ao salvar o produto.</span>
          </button>
          
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, identificador_preferencial: 'codigo_barras' }))}
            className={`flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all ${
              formData.identificador_preferencial === 'codigo_barras'
                ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                : 'border-neutral-200 bg-white hover:border-indigo-300'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <span className="font-bold text-sm text-neutral-900">Código de barras do produto</span>
              <div className={`flex items-center justify-center w-5 h-5 rounded-full border ${
                formData.identificador_preferencial === 'codigo_barras' ? 'border-indigo-600 bg-indigo-600' : 'border-neutral-300'
              }`}>
                {formData.identificador_preferencial === 'codigo_barras' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </div>
            <span className="text-xs text-neutral-500">Utilize o código de barras comercial EAN/UPC/GTIN da embalagem.</span>
          </button>
        </div>

        {formData.identificador_preferencial === 'codigo_barras' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-bold text-neutral-700">Código de Barras *</label>
                <div className="flex gap-4 items-center">
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="text-xs flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Ler com a câmera
                  </button>
                  
                  {formData.codigo_barras && (
                    <button 
                      type="button" 
                      onClick={() => {
                        setFormData(prev => ({ ...prev, codigo_barras: '', tipo_codigo_barras: '' }));
                        setBarcodeValidation({ status: 'idle', message: '' });
                      }}
                      className="text-xs text-red-600 font-medium hover:text-red-700"
                    >
                      Limpar código
                    </button>
                  )}
                </div>
              </div>
              <input 
                type="text" 
                required
                value={formData.codigo_barras}
                onChange={e => handleBarcodeChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault(); // Evita submeter form com leitor de código de barras
                  }
                }}
                className={`w-full rounded-xl border px-4 py-3 focus:outline-none ${
                  barcodeValidation.status === 'valid' ? 'border-emerald-500 focus:border-emerald-500 bg-emerald-50' :
                  barcodeValidation.status === 'invalid' || barcodeValidation.status === 'duplicate' ? 'border-red-500 focus:border-red-500 bg-red-50' :
                  'border-neutral-200 bg-neutral-50 focus:border-indigo-500'
                }`}
                placeholder="Ex: 7891234567895"
              />
              <p className="mt-2 text-[10px] text-neutral-400 font-medium">Digite o código presente na embalagem ou utilize um leitor de código de barras conectado ao computador.</p>
            </div>

            {formData.codigo_barras && (
              <div className="flex items-center gap-4 bg-neutral-50 p-4 rounded-xl border border-neutral-100">
                <div className="flex-1">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-400 block mb-1">Tipo Detectado</span>
                  {formData.tipo_codigo_barras === 'OUTRO' ? (
                    <select
                      value={formData.tipo_codigo_barras}
                      onChange={e => {
                        const type = e.target.value as BarcodeType;
                        setFormData(prev => ({ ...prev, tipo_codigo_barras: type }));
                        const norm = normalizeBarcode(formData.codigo_barras);
                        const localValidation = validateBarcode(norm, type);
                        if (!localValidation.isValid) {
                          setBarcodeValidation({ status: 'invalid', message: localValidation.error || 'Código inválido' });
                        } else {
                          // Note: duplicate check could be re-triggered here if necessary, but skipping for brevity
                          setBarcodeValidation({ status: 'valid', message: 'Código válido' });
                        }
                      }}
                      className="text-sm font-medium text-neutral-900 bg-transparent border-b border-neutral-300 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="OUTRO">Código personalizado / outro formato</option>
                    </select>
                  ) : (
                    <span className="text-sm font-bold text-neutral-900">{formData.tipo_codigo_barras || '-'}</span>
                  )}
                </div>
                <div className="flex-[2]">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-400 block mb-1">Status da Validação</span>
                  <div className="flex items-center gap-2">
                    {barcodeValidation.status === 'validating' && (
                      <><Loader2 className="w-4 h-4 animate-spin text-neutral-500" /><span className="text-sm text-neutral-600 font-medium">{barcodeValidation.message}</span></>
                    )}
                    {barcodeValidation.status === 'valid' && (
                      <><Check className="w-4 h-4 text-emerald-500" /><span className="text-sm text-emerald-600 font-medium">{barcodeValidation.message}</span></>
                    )}
                    {(barcodeValidation.status === 'invalid' || barcodeValidation.status === 'duplicate') && (
                      <><AlertCircle className="w-4 h-4 text-red-500" /><span className="text-sm text-red-600 font-medium">{barcodeValidation.message}</span></>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Seção Origem e fornecedor do produto */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h4 className="text-sm font-black text-neutral-900 uppercase tracking-widest mb-4">Origem e fornecedor do produto</h4>
        
        {loadingConfig ? (
          <div className="flex items-center gap-2 text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs font-medium">Carregando configurações...</span>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <label className="flex items-center gap-3 cursor-pointer group w-fit">
                <div className="relative">
                  <input 
                    type="checkbox" 
                    className="sr-only"
                    checked={fornecedorConfig.fornecimento_externo_ativo}
                    onChange={(e) => {
                      const ativo = e.target.checked;
                      setFornecedorConfig(prev => ({
                        ...prev,
                        fornecimento_externo_ativo: ativo,
                        // Limpa os dados se for desativado e não for edição para evitar lixo
                        ...(ativo ? {} : initialData ? {} : { tipo_fornecedor: null, nome_fornecedor: '' })
                      }));
                    }}
                  />
                  <div className={`block h-6 w-11 rounded-full transition-colors ${fornecedorConfig.fornecimento_externo_ativo ? 'bg-indigo-500' : 'bg-neutral-200 group-hover:bg-neutral-300'}`}></div>
                  <div className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${fornecedorConfig.fornecimento_externo_ativo ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </div>
                <div>
                  <span className="text-sm font-bold text-neutral-700">Produto adquirido de fornecedor externo</span>
                  <p className="text-[10px] text-neutral-400 mt-0.5 max-w-[400px]">Ative quando este produto for divulgado na loja GSA, mas adquirido posteriormente em outro site ou loja física.</p>
                </div>
              </label>
            </div>

            {fornecedorConfig.fornecimento_externo_ativo && (
              <div className="pt-4 border-t border-neutral-100 space-y-6 animate-in fade-in slide-in-from-top-2">
                
                <div>
                  <label className="mb-2 block text-sm font-bold text-neutral-700">Origem do produto *</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setFornecedorConfig({ ...fornecedorConfig, tipo_fornecedor: 'online' })}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all border-2 ${
                        fornecedorConfig.tipo_fornecedor === 'online'
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300'
                      }`}
                    >
                      <Store className="h-4 w-4" />
                      Fornecedor via site
                    </button>
                    <button
                      type="button"
                      onClick={() => setFornecedorConfig({ ...fornecedorConfig, tipo_fornecedor: 'loja_fisica' })}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all border-2 ${
                        fornecedorConfig.tipo_fornecedor === 'loja_fisica'
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300'
                      }`}
                    >
                      <Building2 className="h-4 w-4" />
                      Loja física
                    </button>
                  </div>
                </div>

                {fornecedorConfig.tipo_fornecedor === 'online' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-neutral-700">Nome do fornecedor ou site *</label>
                        <input 
                          type="text" 
                          required
                          value={fornecedorConfig.nome_fornecedor || ''}
                          onChange={e => setFornecedorConfig({...fornecedorConfig, nome_fornecedor: e.target.value})}
                          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-neutral-700">Link do produto no fornecedor *</label>
                        <input 
                          type="url" 
                          required
                          pattern="https?://.*"
                          title="Deve começar com http:// ou https://"
                          value={fornecedorConfig.url_produto || ''}
                          onChange={e => setFornecedorConfig({...fornecedorConfig, url_produto: e.target.value.trim()})}
                          placeholder="https://"
                          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                        />
                        {fornecedorConfig.fornecimento_externo_ativo && fornecedorConfig.tipo_fornecedor === 'online' && isValidUrl(fornecedorConfig.url_produto || '') && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={handleAnalyzeUrl}
                              disabled={importState === 'analyzing' || importState === 'copying'}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-50"
                            >
                              {importState === 'analyzing' ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Buscando dados...</>
                              ) : importState === 'copying' ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Aplicando...</>
                              ) : (
                                <><Search className="h-4 w-4" /> Buscar dados do produto</>
                              )}
                            </button>
                            
                            {importState === 'error' && (
                              <p className="mt-2 text-xs font-bold text-red-600 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" />
                                {importError}
                              </p>
                            )}
                            
                            {importState === 'preview' && importData && (
                              <div className="mt-4 rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
                                <h4 className="mb-4 text-sm font-black uppercase tracking-tight text-indigo-900">Prévia da Importação</h4>
                                
                                <div className="mb-4 space-y-3">
                                  {importData.nome && (
                                    <label className="flex items-start gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3 cursor-pointer hover:bg-neutral-100 transition-colors">
                                      <input type="checkbox" className="mt-1 h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={importSelection.nome}
                                        onChange={e => setImportSelection(s => ({...s, nome: e.target.checked}))}
                                      />
                                      <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Nome do Produto</p>
                                        <p className="text-sm font-medium text-neutral-900">{importData.nome}</p>
                                        {formData.nome && importSelection.nome && <p className="mt-0.5 text-[10px] font-semibold text-amber-600">Substituirá "{formData.nome}"</p>}
                                      </div>
                                    </label>
                                  )}

                                  {importData.descricao && (
                                    <label className="flex items-start gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3 cursor-pointer hover:bg-neutral-100 transition-colors">
                                      <input type="checkbox" className="mt-1 h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={importSelection.descricao}
                                        onChange={e => setImportSelection(s => ({...s, descricao: e.target.checked}))}
                                      />
                                      <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Descrição</p>
                                        <p className="text-xs text-neutral-600 line-clamp-2">{importData.descricao}</p>
                                      </div>
                                    </label>
                                  )}

                                  {importData.preco !== null && (
                                    <label className="flex items-start gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3 cursor-pointer hover:bg-neutral-100 transition-colors">
                                      <input type="checkbox" className="mt-1 h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={importSelection.preco}
                                        onChange={e => setImportSelection(s => ({...s, preco: e.target.checked}))}
                                        disabled={importData.moeda !== 'BRL'}
                                      />
                                      <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Valor de Custo</p>
                                        <p className="text-sm font-bold text-neutral-900">{importData.moeda} {importData.preco.toFixed(2)}</p>
                                        {importData.moeda !== 'BRL' && <p className="mt-0.5 text-[10px] font-semibold text-amber-600">Preço em moeda estrangeira. Insira o custo manualmente.</p>}
                                        {importData.moeda === 'BRL' && Number(formData.valor_custo) > 0 && importSelection.preco && <p className="mt-0.5 text-[10px] font-semibold text-amber-600">Substituirá custo atual (Recalculando valor final)</p>}
                                      </div>
                                    </label>
                                  )}

                                  {importData.nome_fornecedor && (
                                    <label className="flex items-start gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3 cursor-pointer hover:bg-neutral-100 transition-colors">
                                      <input type="checkbox" className="mt-1 h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={importSelection.nome_fornecedor}
                                        onChange={e => setImportSelection(s => ({...s, nome_fornecedor: e.target.checked}))}
                                      />
                                      <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Nome do Fornecedor</p>
                                        <p className="text-sm font-medium text-neutral-900">{importData.nome_fornecedor}</p>
                                      </div>
                                    </label>
                                  )}
                                </div>
                                
                                {importData.imagens.length > 0 && (
                                  <div className="mt-5">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2 flex justify-between">
                                      <span>Imagens Encontradas ({importData.imagens.length})</span>
                                      <span className="text-indigo-600">Sel. {importSelection.imagens.length}/5 permitidas</span>
                                    </p>
                                    <div className="grid grid-cols-5 gap-2">
                                      {importData.imagens.map((img, i) => {
                                        const isSelected = importSelection.imagens.includes(img);
                                        const toggleImg = () => {
                                          setImportSelection(s => {
                                            if (s.imagens.includes(img)) {
                                              return { ...s, imagens: s.imagens.filter(x => x !== img) };
                                            } else {
                                              if (s.imagens.length >= 5) {
                                                toast.error('Limite de 5 imagens (incluindo as atuais)');
                                                return s;
                                              }
                                              return { ...s, imagens: [...s.imagens, img] };
                                            }
                                          });
                                        };
                                        return (
                                          <div key={img} onClick={toggleImg} className={`relative aspect-square cursor-pointer rounded-lg border-2 bg-neutral-100 transition-all ${isSelected ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-transparent hover:border-indigo-300'}`}>
                                            <img src={img} alt="" className="h-full w-full object-cover rounded-md" />
                                            {isSelected && <div className="absolute top-1 right-1 h-4 w-4 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-sm"><Check className="h-3 w-3" /></div>}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                
                                <div className="mt-5 flex justify-end gap-3 pt-4 border-t border-indigo-50">
                                  <button type="button" onClick={() => { setImportState('idle'); setImportData(null); }} className="px-4 py-2 text-xs font-bold text-neutral-500 hover:text-neutral-900">
                                    Cancelar
                                  </button>
                                  <button type="button" onClick={handleApplyImport} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-indigo-700">
                                    Aplicar dados selecionados
                                  </button>
                                </div>
                                <p className="mt-4 text-center text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                                  Importe somente conteúdos que você tenha autorização para utilizar.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-neutral-700">Telefone / WhatsApp (Opcional)</label>
                        <input 
                          type="text" 
                          inputMode="tel"
                          maxLength={15}
                          value={maskPhone(fornecedorConfig.telefone || '')}
                          onChange={e => setFornecedorConfig({...fornecedorConfig, telefone: maskPhone(e.target.value)})}
                          placeholder="(00) 00000-0000"
                          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-neutral-700">Observações internas (Opcional)</label>
                        <input 
                          type="text" 
                          value={fornecedorConfig.observacoes || ''}
                          onChange={e => setFornecedorConfig({...fornecedorConfig, observacoes: e.target.value})}
                          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {fornecedorConfig.tipo_fornecedor === 'loja_fisica' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-neutral-700">Nome da loja *</label>
                        <input 
                          type="text" 
                          required
                          value={fornecedorConfig.nome_fornecedor || ''}
                          onChange={e => setFornecedorConfig({...fornecedorConfig, nome_fornecedor: e.target.value})}
                          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-neutral-700">Telefone / WhatsApp *</label>
                        <input 
                          type="text" 
                          required
                          inputMode="tel"
                          maxLength={15}
                          value={maskPhone(fornecedorConfig.telefone || '')}
                          onChange={e => setFornecedorConfig({...fornecedorConfig, telefone: maskPhone(e.target.value)})}
                          placeholder="(00) 00000-0000"
                          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-neutral-700">Cidade *</label>
                        <input 
                          type="text" 
                          required
                          value={fornecedorConfig.cidade || ''}
                          onChange={e => setFornecedorConfig({...fornecedorConfig, cidade: e.target.value})}
                          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-neutral-700">Estado / UF (Opcional)</label>
                        <select 
                          value={fornecedorConfig.estado || ''}
                          onChange={e => setFornecedorConfig({...fornecedorConfig, estado: e.target.value})}
                          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="">Selecione...</option>
                          {['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'].map(uf => (
                            <option key={uf} value={uf}>{uf}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-neutral-700">Endereço completo (Opcional)</label>
                      <input 
                        type="text" 
                        value={fornecedorConfig.endereco || ''}
                        onChange={e => setFornecedorConfig({...fornecedorConfig, endereco: e.target.value})}
                        className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold text-neutral-700">Observações internas (Opcional)</label>
                      <input 
                        type="text" 
                        value={fornecedorConfig.observacoes || ''}
                        onChange={e => setFornecedorConfig({...fornecedorConfig, observacoes: e.target.value})}
                        className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="mb-1 block text-sm font-bold text-neutral-700">Valor de Custo (R$) *</label>
          <input  
            type="number" 
            step="0.01"
            min="0"
            required
            value={formData.valor_custo}
            inputMode="numeric"
onChange={(e) => handleCustoChange(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none font-bold"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold text-neutral-700">Margem de Lucro (%) *</label>
          <input  
            type="number" 
            step="0.1"
            min="0"
            required
            value={formData.porcentagem_lucro}
            inputMode="numeric"
onChange={(e) => handleLucroChange(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none font-bold text-emerald-600"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold text-neutral-700">Valor de Venda (Final)</label>
          <input  
            type="number" 
            step="0.01"
            required
            readOnly
            value={formData.valor}
            className="w-full rounded-xl border border-neutral-200 bg-indigo-50 px-4 py-3 focus:outline-none font-black text-indigo-600" inputMode="numeric"/>
          <p className="mt-1 text-[10px] text-neutral-400">Calculado automaticamente: Custo + Margem.</p>
        </div>
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
        <p className="mt-1 text-[10px] text-neutral-400 font-medium">Se ativado, o valor deste produto não será exibido no portal do cliente durante a solicitação de orçamento.</p>
      </div>

      {/* Galeria de Imagens */}
      <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200">
        <div className="flex items-center justify-between mb-4">
          <label className="block text-sm font-bold text-neutral-700">Galeria de Fotos (Opcional - Até 5)</label>
          <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{formData.imagens_adicionais.length} / 5</span>
        </div>
        
        <div className="grid grid-cols-5 gap-3">
          {formData.imagens_adicionais.map((url, index) => (
            <div key={index} className="relative aspect-square bg-white rounded-xl overflow-hidden group border border-neutral-200 flex items-center justify-center">
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
        <p className="mt-3 text-[10px] text-neutral-400 font-medium italic">As imagens da galeria serão exibidas nos detalhes do produto para o cliente.</p>
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
            <p className="text-[10px] text-neutral-400 font-medium">Permite que o cliente compre este produto diretamente pelo GSA Store Hub.</p>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input 
              type="checkbox"
              className="sr-only peer"
              checked={formData.controle_estoque}
              onChange={e => setFormData({...formData, controle_estoque: e.target.checked})}
            />
            <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </div>
          <div>
            <span className="text-sm font-bold text-neutral-700 group-hover:text-indigo-600 transition-colors">Ativar Controle de Estoque</span>
            <p className="text-[10px] text-neutral-400 font-medium">Baixa automática ao vender. Alerta se &lt;= 5.</p>
          </div>
        </label>

        {formData.controle_estoque && (
          <div className="pl-14 animate-in slide-in-from-top-2 fade-in">
            <label className="mb-1 block text-xs font-bold text-neutral-700">Quantidade em Estoque</label>
            <input  
              type="number" 
              required
              min="0"
              value={formData.estoque_disponivel}
              inputMode="numeric"
onChange={(e) => setFormData({...formData, estoque_disponivel: e.target.value})}
              className="w-full sm:w-1/2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        )}
      </div>
      <div className="flex gap-4 pt-4">
        <button type="button" onClick={onCancel} disabled={isSubmitting} className="flex-1 rounded-xl border border-neutral-200 py-3 font-bold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50">Cancelar</button>
        <button type="submit" disabled={isSubmitting} className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50">
          {isSubmitting ? 'Processando...' : initialData ? 'Salvar Alterações' : 'Confirmar Cadastro'}
        </button>
      </div>
    </form>

    <BarcodeScannerModal
      isOpen={isScannerOpen}
      onClose={() => setIsScannerOpen(false)}
      onDetected={(result) => {
        handleBarcodeChange(result.rawValue);
        setIsScannerOpen(false);
      }}
    />
    </>
  );
}

function AjusteEstoqueModal({ isOpen, onClose, produto, onSuccess, colaboradorNome }: { isOpen: boolean, onClose: () => void, produto: Produto, onSuccess: () => void, colaboradorNome?: string }) {
  const [historico, setHistorico] = useState<any[]>([]);
  const [tipoAjuste, setTipoAjuste] = useState<'entrada' | 'saida'>('entrada');
  const [ajuste, setAjuste] = useState('');
  const [motivo, setMotivo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchHistorico = async () => {
      const { data } = await supabase
        .from('loja_estoque_historico')
        .select('*')
        .eq('produto_id', produto.id)
        .order('created_at', { ascending: false })
        .limit(3);
      if (isMounted && data) setHistorico(data);
    };

    if (isOpen) {
      fetchHistorico();
      setAjuste('');
      setMotivo('');
      setTipoAjuste('entrada');
    }
    return () => { isMounted = false; };
  }, [isOpen]);

const handleAjuste = async (e: React.FormEvent) => {
  e.preventDefault();
  const qtdAbsoluta = Math.abs(parseInt(ajuste));
  if (isNaN(qtdAbsoluta) || qtdAbsoluta === 0) return toast.error('Informe uma quantidade válida.');
  if (!motivo.trim()) return toast.error('Informe o motivo do ajuste.');

  setIsSubmitting(true);
  try {
    const result = await adjustAdminProductStock({
      requestId: generateUUID(),
      produtoId: produto.id,
      tipo: tipoAjuste,
      quantidade: qtdAbsoluta,
      motivo: motivo.trim(),
    });
    toast.success(result?.already_processed ? 'Este ajuste já havia sido processado.' : 'Estoque ajustado com sucesso!');
    onSuccess();
  } catch (err: any) {
    toast.error(err.message || 'Erro ao ajustar estoque.');
  } finally {
    setIsSubmitting(false);
  }
};

return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajuste de Estoque" size="sm">
      <div className="space-y-6">
        {/* Histórico Recente */}
        <div>
          <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <History className="w-3.5 h-3.5" /> Últimos 3 Ajustes
          </h4>
          <div className="space-y-2">
            {historico.length === 0 ? (
              <div className="text-[10px] text-neutral-400 italic bg-neutral-50 p-3 rounded-xl border border-dashed border-neutral-200 text-center">Nenhum ajuste registrado anteriormente.</div>
            ) : (
              historico.map((h) => (
                <div key={h.id} className="bg-neutral-50 p-3 rounded-xl border border-neutral-100 flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${h.ajuste > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {h.ajuste > 0 ? '+' : ''}{h.ajuste} unidades
                    </span>
                    <span className="text-[9px] font-bold text-neutral-400">{new Date(h.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                  <p className="text-[10px] text-neutral-600 font-medium line-clamp-1">Motivo: {h.motivo}</p>
                  <p className="text-[8px] text-neutral-400 uppercase font-black tracking-widest">Por: {h.colaborador_nome}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="border-t border-neutral-100 pt-6">
          <div className="bg-indigo-50 p-4 rounded-2xl mb-6 flex justify-between items-center border border-indigo-100">
            <span className="text-xs font-bold text-indigo-700 uppercase">Estoque Atual</span>
            <span className="text-2xl font-black text-indigo-900">{produto.estoque_disponivel || 0}</span>
          </div>

          <form onSubmit={handleAjuste} className="space-y-4">
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setTipoAjuste('entrada')}
                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 flex items-center justify-center gap-2 ${
                  tipoAjuste === 'entrada' 
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100' 
                    : 'border-neutral-100 bg-white text-neutral-400'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar
              </button>
              <button
                type="button"
                onClick={() => setTipoAjuste('saida')}
                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 flex items-center justify-center gap-2 ${
                  tipoAjuste === 'saida' 
                    ? 'border-red-500 bg-red-50 text-red-700 shadow-sm shadow-red-100' 
                    : 'border-neutral-100 bg-white text-neutral-400'
                }`}
              >
                <Minus className="w-3.5 h-3.5" />
                Retirar
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 uppercase mb-1.5 block">Quantidade *</label>
              <div className="relative">
                <input  
                  type="number"
                  min="1"
                  placeholder="Ex: 10"
                  value={ajuste}
                  inputMode="numeric"
onChange={(e) => setAjuste(e.target.value)}
                  className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-bold focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 uppercase mb-1.5 block">Motivo do Ajuste *</label>
              <textarea 
                required
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Ex: Reposição de estoque, Produto danificado, Erro na contagem..."
                rows={3}
                className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                type="button" 
                onClick={onClose}
                className="flex-1 px-4 py-3.5 rounded-xl border-2 border-neutral-100 text-xs font-black uppercase tracking-widest text-neutral-400 hover:bg-neutral-50 transition-all"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                disabled={isSubmitting}
                className={`flex-[2] px-4 py-3.5 rounded-xl text-white text-xs font-black uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-2 ${
                  tipoAjuste === 'entrada' ? 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700' : 'bg-red-600 shadow-red-600/20 hover:bg-red-700'
                }`}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirmar {tipoAjuste === 'entrada' ? 'Entrada' : 'Retirada'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  );
}
