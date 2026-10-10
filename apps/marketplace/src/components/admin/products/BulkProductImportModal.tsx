import React, { useState, useEffect } from 'react';
import { Modal } from '../../ui/Modal';
import { Check, AlertCircle, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { ImportSourceSelector } from './import/ImportSourceSelector';
import { UrlImportSource } from './import/UrlImportSource';
import { ExcelImportSource } from './import/ExcelImportSource';
import { TextImportSource } from './import/TextImportSource';
import { MediaImportSource } from './import/MediaImportSource';
import { ImportSupplierMode } from './import/ImportSupplierMode';

import { ProductImportCandidate, ImportSourceType, ImportSupplierConfig } from '../../../types/productImport';
import { productUrlImportService } from '../../../lib/productUrlImportService';
import { checkExistingSupplierProducts, importProductsBatch, requireAdminSession } from '../../../lib/adminRpc';
import { formatCurrency } from '../../../lib/utils';
import { supabase } from '../../../lib/supabase';

interface BulkProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  categorias: any[];
  onSuccess: () => void;
}

type Step = 
  | 'SELECT_SOURCE' 
  | 'SOURCE_INPUT' 
  | 'SUPPLIER_MODE'
  | 'CANDIDATE_SELECTION' 
  | 'FETCHING_URL_DETAILS'
  | 'COMMON_SETTINGS' 
  | 'REVIEW' 
  | 'SUCCESS';

export function BulkProductImportModal({ isOpen, onClose, categorias, onSuccess }: BulkProductImportModalProps) {
  const [step, setStep] = useState<Step>('SELECT_SOURCE');
  const [sourceType, setSourceType] = useState<ImportSourceType | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<ProductImportCandidate[]>([]);
  const [supplierConfig, setSupplierConfig] = useState<ImportSupplierConfig | null>(null);

  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'completos' | 'incompletos'>('todos');

  // Step 3 progress (URL Fetch)
  const [analyzingProgress, setAnalyzingProgress] = useState(0);
  const [analyzingTotal, setAnalyzingTotal] = useState(0);

  // Common settings
  const [commonCategoria, setCommonCategoria] = useState('');
  const [commonTipo, setCommonTipo] = useState<'ambos' | 'pf' | 'pj'>('ambos');
  const [commonMargin, setCommonMargin] = useState('');
  const [commonVisivel, setCommonVisivel] = useState(false);
  const [commonEstoqueAtivo, setCommonEstoqueAtivo] = useState(false);
  const [commonEstoqueQtd, setCommonEstoqueQtd] = useState('0');

  // Results
  const [results, setResults] = useState<{ created: any[], skipped: any[], failed: any[] }>({ created: [], skipped: [], failed: [] });
  const [importingProgress, setImportingProgress] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep('SELECT_SOURCE');
      setSourceType(null);
      setCandidates([]);
      setSupplierConfig(null);
      setResults({ created: [], skipped: [], failed: [] });
      setCommonMargin('');
      setCommonCategoria('');
      setCommonVisivel(false);
      setCommonEstoqueAtivo(false);
      setCommonEstoqueQtd('0');
    }
  }, [isOpen]);

  const handleSourceSelected = (source: ImportSourceType) => {
    setSourceType(source);
    setStep('SOURCE_INPUT');
  };

  const handleUrlAnalyze = async (url: string, supplierName: string, phone: string, obs: string) => {
    setLoading(true);
    try {
      const { candidates: found } = await productUrlImportService.discoverProducts(url);
      
      if (found.length === 0) {
        toast.error('Nenhum produto encontrado nesta página.');
        return;
      }

      const urlsToCheck = found.map(c => c.url_final || c.url_original).filter(Boolean);
      let duplicates: any[] = [];
      if (urlsToCheck.length > 0) {
        duplicates = await checkExistingSupplierProducts(urlsToCheck);
      }

      const hashBaseStr = Math.random().toString(36).substring(7);

      const mapped: ProductImportCandidate[] = found.map((c, idx) => {
        const cUrl = c.url_final || c.url_original;
        const isDup = duplicates.some(d => cUrl?.toLowerCase().includes(d.url_normalizada) || d.url_normalizada?.includes(cUrl?.toLowerCase()));
        
        return {
          client_id: c.candidate_id || crypto.randomUUID(),
          source_type: 'url',
          source_reference: url,
          source_fingerprint: `${hashBaseStr}-url-${idx}`,
          nome: c.nome || null,
          descricao: c.descricao || null,
          valor_custo: c.preco || null,
          moeda: c.moeda || 'BRL',
          imagens: c.imagens || [],
          url_produto: cUrl || null,
          nome_fornecedor: supplierName || null, // Will be overridden by SupplierConfig later
          categoria_sugerida: (c as any).categoria_sugerida || null,
          sku: null,
          selecionado: !isDup,
          completo: false, // Url always needs fetching
          avisos: isDup ? ['Já cadastrado'] : []
        };
      });

      setCandidates(mapped);
      
      // Since URL used to ask for Supplier info first, let's pre-fill the supplier config to avoid double asking if they prefer online mode
      setSupplierConfig({
         mode: 'online',
         nome_fornecedor: supplierName,
         telefone: phone,
         observacoes: obs
      });
      
      // Go directly to Candidate Selection since Supplier Mode is effectively pre-chosen for URL by the old form.
      // But for the NEW architecture, it's better to show the Supplier Mode selector for everything, or we skip it if URL.
      // The old form asked for Supplier, so we skip SUPPLIER_MODE for URL to save clicks.
      setStep('CANDIDATE_SELECTION');
      
    } catch (err: any) {
      toast.error(err.message || 'Erro ao localizar produtos');
    } finally {
      setLoading(false);
    }
  };

  const handleCandidatesReady = (cands: ProductImportCandidate[]) => {
    setCandidates(cands);
    setStep('SUPPLIER_MODE');
  };

  const handleSupplierConfigConfirm = (config: ImportSupplierConfig) => {
    setSupplierConfig(config);
    setStep('CANDIDATE_SELECTION');
  };

  // ----- Step 4: Candidate Selection UI -----
  const filteredCandidates = candidates.filter(c => {
    if (searchFilter && !c.nome?.toLowerCase().includes(searchFilter.toLowerCase())) return false;
    if (statusFilter === 'completos' && !c.completo) return false;
    if (statusFilter === 'incompletos' && c.completo) return false;
    return true;
  });
  const selectedCount = candidates.filter(c => c.selecionado).length;

  const handleToggleSelectAll = () => {
    const allSelected = filteredCandidates.every(c => c.selecionado);
    setCandidates(prev => prev.map(c => {
      if (filteredCandidates.find(fc => fc.client_id === c.client_id)) {
        return { ...c, selecionado: !allSelected };
      }
      return c;
    }));
  };

  const handleToggleSelect = (id: string) => {
    setCandidates(prev => prev.map(c => c.client_id === id ? { ...c, selecionado: !c.selecionado } : c));
  };

  const handleContinueFromSelection = async () => {
    if (selectedCount === 0) return toast.error('Selecione pelo menos um produto');

    // If source is URL and details not fetched yet
    if (sourceType === 'url') {
      const toFetch = candidates.filter(c => c.selecionado);
      setStep('FETCHING_URL_DETAILS');
      setAnalyzingTotal(toFetch.length);
      setAnalyzingProgress(0);
      
      const updatedCandidates = [...candidates];
      const chunkSize = 10;
      
      for (let i = 0; i < toFetch.length; i += chunkSize) {
        const chunk = toFetch.slice(i, i + chunkSize);
        const urls = chunk.map(c => c.url_produto).filter(Boolean) as string[];
        
        if (urls.length > 0) {
          try {
            const results = await productUrlImportService.analyzeProductsBatch(urls);
            results.forEach(res => {
              if (res.success && res.data) {
                 const candIndex = updatedCandidates.findIndex(c => c.url_produto === res.url);
                 if (candIndex >= 0) {
                    const cand = updatedCandidates[candIndex];
                    updatedCandidates[candIndex] = {
                      ...cand,
                      nome: res.data.nome || cand.nome,
                      descricao: res.data.descricao || cand.descricao,
                      valor_custo: res.data.preco || cand.valor_custo,
                      moeda: res.data.moeda || cand.moeda,
                      imagens: Array.from(new Set([...res.data.imagens, ...cand.imagens]))
                    };
                 }
              }
            });
          } catch (e) {
            console.error('Lote falhou', e);
          }
        }
        setAnalyzingProgress(Math.min(i + chunkSize, toFetch.length));
      }

      setCandidates(updatedCandidates.map(c => ({
        ...c,
        completo: !!(c.nome && c.valor_custo && c.url_produto)
      })));
      
      setStep('COMMON_SETTINGS');
    } else {
      setStep('COMMON_SETTINGS');
    }
  };

  // ----- Step 5: Common Settings -----
  const applyCommonSettings = () => {
    setCandidates(prev => prev.map(c => {
      if (!c.selecionado) return c;
      return {
        ...c,
        categoria_id: commonCategoria || c.categoria_id,
        tipo_cliente: commonTipo,
        porcentagem_lucro: commonMargin ? parseFloat(commonMargin) : c.porcentagem_lucro,
        visivel_na_loja: commonVisivel,
        controle_estoque: commonEstoqueAtivo,
        estoque_disponivel: parseFloat(commonEstoqueQtd || '0'),
      };
    }));
    setStep('REVIEW');
  };

  // ----- Step 6: Review -----
  const handleUpdateCandidate = (id: string, field: string, value: any) => {
    setCandidates(prev => prev.map(c => c.client_id === id ? { ...c, [field]: value } : c));
  };

  const handleImport = async () => {
    const toImport = candidates.filter(c => c.selecionado);
    const invalid = toImport.find(c => !c.nome || c.valor_custo === null || c.valor_custo <= 0 || c.porcentagem_lucro === undefined || !c.categoria_id);
    
    if (invalid) {
      return toast.error('Alguns produtos estão incompletos. Verifique custo, margem e categoria.');
    }

    setLoading(true);
    setImportingProgress('Copiando imagens...');

    const batchId = crypto.randomUUID();
    const payload = toImport.map(c => ({
      client_id: c.client_id,
      images: c.imagens.slice(0, 5)
    }));

    let imgResults: any = [];
    
    // Only call the Edge Function if there is at least one image to upload
    const hasImagesToUpload = payload.some(p => p.images.length > 0);
    
    if (hasImagesToUpload) {
      try {
         imgResults = await productUrlImportService.copyProductImagesBatch(batchId, payload);
         setCandidates(prev => prev.map(c => {
           const res = imgResults.find((r: any) => r.client_id === c.client_id);
           if (res) return { ...c, finalImages: res.uploaded };
           return c;
         }));
      } catch (err: any) {
         toast.error('Erro ao processar imagens: ' + err.message);
      }
    }

    setImportingProgress('Salvando no banco...');

    // Use candidates from state which now might have finalImages if React batched state update allowed,
    // but better use the local modified array
    const toImportFinal = candidates.filter(c => c.selecionado).map(c => {
       const res = imgResults?.find((r: any) => r.client_id === c.client_id);
       const imgArr = res?.uploaded || [];
       
       return {
         client_id: c.client_id,
         source_type: c.source_type,
         source_fingerprint: c.source_fingerprint,
         source_reference: c.source_reference,
         supplier_mode: supplierConfig?.mode || 'proprio',
         
         nome: c.nome,
         descricao: c.descricao,
         valor_custo: c.valor_custo,
         porcentagem_lucro: c.porcentagem_lucro,
         tipo_cliente: c.tipo_cliente || 'ambos',
         categoria_id: c.categoria_id,
         visivel_na_loja: c.visivel_na_loja,
         controle_estoque: c.controle_estoque,
         estoque_disponivel: c.estoque_disponivel,
         imagens: imgArr,
         codigo_barras: c.codigo_barras || null,
         tipo_codigo_barras: c.tipo_codigo_barras || null,
         identificador_preferencial: c.identificador_preferencial || 'interno',
         force_duplicate: false,
         
         fornecedor_config: supplierConfig?.mode === 'proprio' ? {} : {
           nome_fornecedor: supplierConfig?.nome_fornecedor,
           url_produto: c.url_produto,
           telefone: supplierConfig?.telefone,
           observacoes: supplierConfig?.observacoes,
           cidade: supplierConfig?.cidade,
           estado: supplierConfig?.estado,
           endereco: supplierConfig?.endereco
         }
       };
    });

    try {
      // Call RPC v2 which we created earlier
      const session = requireAdminSession();

      const { data, error } = await supabase.rpc('gsa_admin_import_products_batch_v2', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_items: toImportFinal
      });

      if (error) throw error;

      setResults(data);
      setStep('SUCCESS');
      onSuccess();
    } catch (e: any) {
      toast.error('Falha crítica ao importar: ' + e.message);
    } finally {
      setLoading(false);
      setImportingProgress('');
    }
  };

  // ---------- Renders ----------
  return (
    <Modal isOpen={isOpen} onClose={loading ? () => {} : onClose} title="Importação de Produtos" size="xl">
      {step === 'SELECT_SOURCE' && (
        <ImportSourceSelector onSelect={handleSourceSelected} />
      )}

      {step === 'SOURCE_INPUT' && (
        <div>
          {sourceType === 'url' && <UrlImportSource onAnalyze={handleUrlAnalyze} loading={loading} />}
          {sourceType === 'excel' && <ExcelImportSource onCandidatesReady={handleCandidatesReady} />}
          {sourceType === 'txt' && <TextImportSource onCandidatesReady={handleCandidatesReady} />}
          {sourceType === 'pdf' && <MediaImportSource type="pdf" onCandidatesReady={handleCandidatesReady} />}
          {sourceType === 'image' && <MediaImportSource type="image" onCandidatesReady={handleCandidatesReady} />}
          
          <div className="px-6 pb-6">
             <button onClick={() => setStep('SELECT_SOURCE')} className="text-sm text-gray-500 hover:text-gray-800">
               &larr; Voltar para as opções
             </button>
          </div>
        </div>
      )}

      {step === 'SUPPLIER_MODE' && (
        <ImportSupplierMode 
          onConfirm={handleSupplierConfigConfirm} 
          onBack={() => setStep('SOURCE_INPUT')} 
        />
      )}

      {step === 'CANDIDATE_SELECTION' && (
        <div className="p-6 space-y-4 flex flex-col h-[70vh]">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Encontrados: <strong>{candidates.length}</strong> | Selecionados: <strong>{selectedCount}</strong>
            </div>
            <div className="flex gap-2">
              <input type="text" placeholder="Pesquisar..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm w-48" />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="px-3 py-1.5 border rounded-lg text-sm">
                <option value="todos">Todos</option>
                <option value="completos">Completos</option>
                <option value="incompletos">Incompletos</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto border rounded-lg p-2 bg-gray-50 flex flex-col gap-2">
            {filteredCandidates.map(c => (
              <div key={c.client_id} className={`bg-white border rounded-lg p-3 flex gap-4 items-center relative cursor-pointer hover:border-blue-300 transition-colors ${c.selecionado ? 'border-blue-500 ring-1 ring-blue-500' : ''}`} onClick={() => handleToggleSelect(c.client_id)}>
                <div>
                   <input type="checkbox" checked={c.selecionado} onChange={() => {}} className="w-5 h-5 text-blue-600 rounded cursor-pointer" />
                </div>
                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                   {c.imagens[0] ? <img src={c.imagens[0]} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-gray-400" />}
                </div>
                <div className="flex-1">
                   <h4 className="text-sm font-semibold text-gray-900 leading-snug">{c.nome || 'Produto Sem Nome'}</h4>
                   <div className="flex items-center gap-3 mt-1.5">
                     <p className="text-sm text-gray-700 font-medium bg-gray-100 px-2 py-0.5 rounded">{c.valor_custo ? formatCurrency(c.valor_custo) : 'Sem preço'}</p>
                     {c.avisos.length > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">{c.avisos[0]}</span>}
                     {!c.completo && c.source_type !== 'url' && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Incompleto</span>}
                   </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
             <button onClick={handleToggleSelectAll} className="text-sm text-blue-600 hover:text-blue-700 font-medium">Selecionar / Desmarcar Visíveis</button>
             <button onClick={handleContinueFromSelection} disabled={selectedCount === 0 || loading} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
               {loading && <Loader2 className="w-4 h-4 animate-spin" />}
               {sourceType === 'url' ? `Buscar Detalhes (${selectedCount})` : 'Continuar e Configurar'}
             </button>
          </div>
        </div>
      )}

      {step === 'FETCHING_URL_DETAILS' && (
        <div className="p-6 flex flex-col items-center justify-center h-64 space-y-4">
           <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
           <h3 className="text-lg font-medium text-gray-900">Analisando Produtos...</h3>
           <p className="text-gray-500">Buscando detalhes página a página ({analyzingProgress} de {analyzingTotal})</p>
           <div className="w-full max-w-md bg-gray-200 rounded-full h-2.5 mt-4">
              <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${(analyzingProgress/analyzingTotal)*100}%` }}></div>
           </div>
        </div>
      )}

      {step === 'COMMON_SETTINGS' && (
        <div className="p-6 space-y-6">
          <div className="bg-blue-50 text-blue-800 p-4 rounded-lg flex items-start gap-3">
             <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
             <p className="text-sm">Configure os valores padrão que serão aplicados a todos os {selectedCount} produtos selecionados. Você poderá editar cada um individualmente na próxima etapa.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria Padrão *</label>
                <select value={commonCategoria} onChange={e => setCommonCategoria(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                   <option value="">Selecione...</option>
                   {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
             </div>
             <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Público</label>
                <select value={commonTipo} onChange={e => setCommonTipo(e.target.value as any)} className="w-full px-3 py-2 border rounded-lg">
                   <option value="ambos">Todos (Física e Jurídica)</option>
                   <option value="pf">Pessoa Física</option>
                   <option value="pj">Pessoa Jurídica</option>
                </select>
             </div>
             <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Margem de Lucro Padrão (%) *</label>
                <input  type="number" value={commonMargin} inputMode="numeric"
onChange={(e) => setCommonMargin(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="Ex: 30" />
             </div>
             <div className="flex items-center gap-2 mt-6">
                <input type="checkbox" id="cvisivel" checked={commonVisivel} onChange={e => setCommonVisivel(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                <label htmlFor="cvisivel" className="text-sm text-gray-700">Visível na vitrine da loja</label>
             </div>
             <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2">
                   <input type="checkbox" id="cestoque" checked={commonEstoqueAtivo} onChange={e => setCommonEstoqueAtivo(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                   <label htmlFor="cestoque" className="text-sm text-gray-700">Ativar Controle de Estoque</label>
                </div>
             </div>
             {commonEstoqueAtivo && (
               <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Qtd. Inicial</label>
                  <input  type="number" value={commonEstoqueQtd} inputMode="numeric"
onChange={(e) => setCommonEstoqueQtd(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
               </div>
             )}
          </div>

          <div className="flex justify-end pt-4 border-t gap-3">
             <button onClick={() => setStep('CANDIDATE_SELECTION')} className="px-4 py-2 text-gray-600 hover:text-gray-800">Voltar</button>
             <button onClick={applyCommonSettings} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Aplicar a Todos</button>
          </div>
        </div>
      )}

      {step === 'REVIEW' && (
        <div className="p-6 flex flex-col h-[80vh]">
           <div className="flex-1 overflow-y-auto space-y-4 pr-2">
             {candidates.filter(c => c.selecionado).map(c => (
                <div key={c.client_id} className={`bg-gray-50 border rounded-lg p-4 space-y-4 ${(!c.nome || !c.valor_custo || !c.categoria_id) ? 'border-red-300 ring-1 ring-red-300' : ''}`}>
                   <div className="flex justify-between items-start">
                     <div className="flex items-center gap-3 w-full">
                       <div className="w-12 h-12 rounded bg-white border flex items-center justify-center overflow-hidden shrink-0">
                         {c.imagens[0] ? <img src={c.imagens[0]} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-gray-400" />}
                       </div>
                       <div className="flex-1">
                         <input type="text" value={c.nome || ''} onChange={e => handleUpdateCandidate(c.client_id, 'nome', e.target.value)} className="w-full px-2 py-1 text-sm border-b bg-transparent font-medium focus:outline-none focus:border-blue-500" placeholder="Nome do Produto" />
                         {c.evidence && <p className="text-xs text-gray-500 mt-1">Ref: {c.evidence.planilha || c.evidence.pagina || 'Linha'} {c.evidence.linha || ''}</p>}
                         {c.url_produto && <p className="text-xs text-gray-500 mt-1 truncate max-w-md" title={c.url_produto}>{c.url_produto}</p>}
                       </div>
                     </div>
                     <button onClick={() => handleToggleSelect(c.client_id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><X className="w-5 h-5" /></button>
                   </div>

                   <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500">Custo Base ({c.moeda})</label>
                        <input  type="number" value={c.valor_custo || ''} inputMode="numeric"
onChange={(e) => handleUpdateCandidate(c.client_id, 'valor_custo', parseFloat(e.target.value))} className="w-full px-2 py-1.5 text-sm border rounded" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500">Margem (%)</label>
                        <input  type="number" value={c.porcentagem_lucro || ''} inputMode="numeric"
onChange={(e) => handleUpdateCandidate(c.client_id, 'porcentagem_lucro', parseFloat(e.target.value))} className="w-full px-2 py-1.5 text-sm border rounded" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500">Valor Final</label>
                        <div className="px-2 py-1.5 text-sm bg-gray-200 rounded font-medium text-gray-700">
                          {c.valor_custo && c.porcentagem_lucro ? formatCurrency(c.valor_custo * (1 + (c.porcentagem_lucro/100))) : '---'}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500">Categoria</label>
                        <select value={c.categoria_id || ''} onChange={e => handleUpdateCandidate(c.client_id, 'categoria_id', e.target.value)} className="w-full px-2 py-1.5 text-sm border rounded">
                           <option value="">Selecionar...</option>
                           {categorias.map(cat => <option key={cat.id} value={cat.id}>{cat.nome}</option>)}
                        </select>
                      </div>
                   </div>
                </div>
             ))}
           </div>
           <div className="flex justify-between items-center pt-4 border-t mt-4 bg-white">
              <div className="text-sm text-gray-600">
                 Revisando <strong>{candidates.filter(c=>c.selecionado).length}</strong> produtos.
              </div>
              <button onClick={handleImport} disabled={loading} className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                 {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                 {loading ? importingProgress : 'Confirmar e Importar'}
              </button>
           </div>
        </div>
      )}

      {step === 'SUCCESS' && (
        <div className="p-6 space-y-6">
           <div className="bg-green-50 text-green-800 p-4 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Check className="w-6 h-6 text-green-600" />
                <div>
                   <h3 className="font-semibold text-green-900">Processo Concluído</h3>
                   <p className="text-sm">Foram criados {results.created?.length || 0} produtos.</p>
                </div>
              </div>
           </div>

           {results.failed?.length > 0 && (
              <div className="bg-red-50 text-red-800 p-4 rounded-lg">
                 <h4 className="font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {results.failed.length} Erros</h4>
                 <ul className="mt-2 space-y-1 text-sm list-disc pl-5">
                   {results.failed.map((f, i) => <li key={i}>{f.nome}: {f.motivo}</li>)}
                 </ul>
              </div>
           )}

           {results.skipped?.length > 0 && (
              <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg">
                 <h4 className="font-medium">Ignorados ({results.skipped.length})</h4>
                 <p className="text-sm mt-1">Geralmente por duplicidade de código, URL ou impressão digital da origem.</p>
              </div>
           )}

           <div className="flex justify-end pt-4 border-t">
              <button onClick={() => { onClose(); onSuccess(); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Fechar e Ver Produtos</button>
           </div>
        </div>
      )}
    </Modal>
  );
}
