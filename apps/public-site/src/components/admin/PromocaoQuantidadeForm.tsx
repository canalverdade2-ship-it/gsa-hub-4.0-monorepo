import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Gift, ArrowRight, Save, X, Info, Tag, Layers, Star, Calendar, ShoppingBag, Plus, Trash2, AlertCircle } from 'lucide-react';
import { getProductDisplayCode } from '../../lib/productIdentification';
import { toast } from 'react-hot-toast';
import { VIP_LEVELS } from '../../constants';
import { useConfirm } from '../../hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface PromocaoQuantidadeFormProps {
  initialData?: any;
  onSuccess: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function PromocaoQuantidadeForm({ initialData, onSuccess, onCancel, onDelete }: PromocaoQuantidadeFormProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const confirmHook = useConfirm();

  // Lists
  const [produtos, setProdutos] = useState<any[]>([]);
  const [categorias, setCategorias] = useState<any[]>([]);
  // VIP Levels are statically defined in constants
  const niveisVip = VIP_LEVELS;

  // Form State
  const [nome, setNome] = useState(initialData?.nome || '');
  const [descricao, setDescricao] = useState(initialData?.descricao || '');
  
  const [escopoGatilho, setEscopoGatilho] = useState<'produto' | 'categoria' | 'geral'>(initialData?.escopo_gatilho || 'produto');
  const [produtoGatilhoId, setProdutoGatilhoId] = useState(initialData?.produto_gatilho_id || '');
  const [categoriaGatilhoId, setCategoriaGatilhoId] = useState(initialData?.categoria_gatilho_id || '');
  const [quantidadeMinima, setQuantidadeMinima] = useState(initialData?.quantidade_minima || 1);
  
  const [tipoPromocao, setTipoPromocao] = useState<'unidade_gratis' | 'desconto_proxima' | 'ganhe_outro_produto'>(initialData?.tipo_promocao || 'unidade_gratis');
  const [produtoBrindeId, setProdutoBrindeId] = useState(initialData?.produto_brinde_id || '');
  const [quantidadeBrinde, setQuantidadeBrinde] = useState(initialData?.quantidade_brinde || 1);
  
  const [descontoTipo, setDescontoTipo] = useState<'porcentagem' | 'valor'>(initialData?.desconto_tipo || 'porcentagem');
  const [descontoValor, setDescontoValor] = useState(initialData?.desconto_valor || 0);

  const [nivelMinimoId, setNivelMinimoId] = useState(initialData?.nivel_minimo_id || '');
  const [usoMaximo, setUsoMaximo] = useState(initialData?.uso_maximo_por_cliente || 1);
  const [dataInicio, setDataInicio] = useState(initialData?.data_inicio || new Date().toISOString().split('T')[0]);
  const [dataFim, setDataFim] = useState(initialData?.data_fim || '');

  useEffect(() => {
    fetchLists();
  }, []);

  const fetchLists = async () => {
    try {
      const [prodRes, catRes] = await Promise.all([
        supabase.from('produtos').select('id, nome, codigo_produto, codigo_barras, identificador_preferencial').eq('status', 'ativo'),
        supabase.from('loja_categorias').select('id, nome')
      ]);
      if (prodRes.data) setProdutos(prodRes.data);
      if (catRes.data) setCategorias(catRes.data);
    } catch (err) {
      console.error('Erro ao buscar listas', err);
      toast.error('Erro ao carregar dados do formulário');
    }
  };

  const handleToggleStatus = async () => {
    if (!initialData?.id) return;
    const newStatus = initialData.status === 'ativa' ? 'suspensa' : 'ativa';
    const actionText = newStatus === 'ativa' ? 'reativar' : 'suspender';
    
    const ok = await confirmHook.confirm({
      title: 'Confirmar ação',
      message: `Tem certeza que deseja ${actionText} esta promoção?`,
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar'
    });
    if (!ok) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('promocoes_quantidade').update({ status: newStatus }).eq('id', initialData.id);
      if (error) throw error;
      toast.success(`Promoção ${newStatus === 'ativa' ? 'reativada' : 'suspensa'} com sucesso!`);
      onSuccess();
    } catch (err) {
      console.error(`Erro ao ${actionText} promoção`, err);
      toast.error(`Não foi possível ${actionText} a promoção.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome) { toast.error('Nome é obrigatório'); return; }
    if (escopoGatilho === 'produto' && !produtoGatilhoId) { toast.error('Selecione o produto gatilho'); return; }
    if (escopoGatilho === 'categoria' && !categoriaGatilhoId) { toast.error('Selecione a categoria gatilho'); return; }
    if (tipoPromocao === 'ganhe_outro_produto' && !produtoBrindeId) { toast.error('Selecione o produto brinde'); return; }

    setIsSubmitting(true);
    try {
      const payload = {
        nome,
        descricao,
        tipo_promocao: tipoPromocao,
        escopo_gatilho: escopoGatilho,
        produto_gatilho_id: escopoGatilho === 'produto' ? produtoGatilhoId : null,
        categoria_gatilho_id: escopoGatilho === 'categoria' ? categoriaGatilhoId : null,
        quantidade_minima: quantidadeMinima,
        produto_brinde_id: tipoPromocao === 'unidade_gratis' ? (escopoGatilho === 'produto' ? produtoGatilhoId : null) : (tipoPromocao === 'ganhe_outro_produto' ? produtoBrindeId : null),
        quantidade_brinde: quantidadeBrinde,
        desconto_tipo: tipoPromocao === 'desconto_proxima' ? descontoTipo : null,
        desconto_valor: tipoPromocao === 'desconto_proxima' ? descontoValor : null,
        nivel_minimo_id: nivelMinimoId || null,
        uso_maximo_por_cliente: usoMaximo,
        prioridade: 1,
        status: initialData?.status || 'ativa',
        data_inicio: dataInicio,
        data_fim: dataFim || null
      };

      try {
        if (initialData?.id) {
          await supabase.from('promocoes_quantidade').update(payload).eq('id', initialData.id).throwOnError();
        } else {
          await supabase.from('promocoes_quantidade').insert([payload]).throwOnError();
        }
      } catch (err) {
        console.error('Erro ao salvar promoção no banco:', err);
        toast.error('Erro ao salvar promoção no banco de dados.');
        return; // Prevent success toast below
      }

      toast.success(initialData?.id ? 'Promoção atualizada!' : 'Promoção Inteligente criada com sucesso!');
      onSuccess();
    } catch (err) {
      console.error('Erro ao criar promoção', err);
      toast.error('Erro ao criar promoção. Verifique os dados.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 md:p-8 flex flex-col h-[75vh] md:h-auto">
      <ConfirmDialog {...confirmHook} />
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-8 pb-8">
        
        {/* Passo 1: Dados Básicos */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-neutral-100 pb-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Tag className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-black text-neutral-900 uppercase tracking-widest">1. Dados Básicos</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-1 md:col-span-2">
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Nome da Promoção *</label>
              <input 
                type="text" 
                value={nome} 
                onChange={e => setNome(e.target.value)} 
                required
                placeholder="Ex: Compre 3 Óleos e Ganhe 1 Filtro"
                className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" 
              />
            </div>
            <div className="col-span-1 md:col-span-2">
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Descrição Interna / Regras</label>
              <textarea 
                value={descricao} 
                onChange={e => setDescricao(e.target.value)} 
                rows={2}
                placeholder="Detalhes para visualização interna..."
                className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none" 
              />
            </div>
          </div>
        </section>

        {/* Passo 2: O Gatilho */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-neutral-100 pb-2">
            <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-black text-neutral-900 uppercase tracking-widest">2. O Gatilho (Requisito)</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Escopo do Gatilho *</label>
              <select 
                value={escopoGatilho} 
                onChange={e => {
                  setEscopoGatilho(e.target.value as any);
                  if (e.target.value !== 'produto' && tipoPromocao === 'unidade_gratis') {
                    setTipoPromocao('ganhe_outro_produto'); // unidade gratis obriga ser do mesmo produto
                  }
                }}
                className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
              >
                <option value="produto">Produto Específico</option>
                <option value="categoria">Categoria Inteira</option>
                <option value="geral">Qualquer Produto da Loja</option>
              </select>
            </div>
            
            <div>
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Quantidade Mínima *</label>
              <div className="flex items-center">
                <input  
                  type="number" 
                  min="1"
                  value={quantidadeMinima} 
                  inputMode="numeric"
onChange={(e) => setQuantidadeMinima(parseInt(e.target.value) || 1)} 
                  required
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" 
                />
                <span className="ml-3 text-sm font-bold text-neutral-500">Unidades</span>
              </div>
            </div>

            {escopoGatilho === 'produto' && (
              <div className="col-span-1 md:col-span-2">
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Selecione o Produto Gatilho *</label>
                <select 
                  value={produtoGatilhoId} 
                  onChange={e => setProdutoGatilhoId(e.target.value)}
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option value="">-- Selecione --</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{getProductDisplayCode(p as any)} - {p.nome}</option>)}
                </select>
              </div>
            )}

            {escopoGatilho === 'categoria' && (
              <div className="col-span-1 md:col-span-2">
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Selecione a Categoria Gatilho *</label>
                <select 
                  value={categoriaGatilhoId} 
                  onChange={e => setCategoriaGatilhoId(e.target.value)}
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option value="">-- Selecione --</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            )}
          </div>
        </section>

        {/* Passo 3: O Benefício */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-neutral-100 pb-2">
            <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <Gift className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-black text-neutral-900 uppercase tracking-widest">3. O Benefício (Recompensa)</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Tipo de Recompensa *</label>
              <select 
                value={tipoPromocao} 
                onChange={e => setTipoPromocao(e.target.value as any)}
                className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
              >
                {escopoGatilho === 'produto' && <option value="unidade_gratis">Unidade Grátis (Compre X, Leve Y)</option>}
                <option value="ganhe_outro_produto">Ganhe Outro Produto (Brinde Específico)</option>
                <option value="desconto_proxima">Desconto em Valor/Porcentagem</option>
              </select>
            </div>

            {['unidade_gratis', 'ganhe_outro_produto'].includes(tipoPromocao) && (
              <div>
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Quantidade do Brinde *</label>
                <input  
                  type="number" 
                  min="1"
                  value={quantidadeBrinde} 
                  inputMode="numeric"
onChange={(e) => setQuantidadeBrinde(parseInt(e.target.value) || 1)} 
                  required
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" 
                />
              </div>
            )}

            {tipoPromocao === 'ganhe_outro_produto' && (
              <div className="col-span-1 md:col-span-2">
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Selecione o Produto Brinde *</label>
                <select 
                  value={produtoBrindeId} 
                  onChange={e => setProdutoBrindeId(e.target.value)}
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                >
                  <option value="">-- Selecione o que o cliente vai ganhar --</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{getProductDisplayCode(p as any)} - {p.nome}</option>)}
                </select>
              </div>
            )}

            {tipoPromocao === 'unidade_gratis' && escopoGatilho === 'produto' && (
               <div className="col-span-1 md:col-span-2 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 flex gap-3 items-start">
                 <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                 <p className="text-xs text-indigo-800 font-medium">O cliente ganhará {quantidadeBrinde} unidade(s) extra do mesmo produto selecionado como gatilho de forma 100% gratuita no carrinho.</p>
               </div>
            )}

            {tipoPromocao === 'desconto_proxima' && (
              <>
                <div>
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Tipo de Desconto</label>
                  <select 
                    value={descontoTipo} 
                    onChange={e => setDescontoTipo(e.target.value as any)}
                    className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                  >
                    <option value="porcentagem">Porcentagem (%)</option>
                    <option value="valor">Valor Fixo (R$)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Valor do Desconto *</label>
                  <input  
                    type="number" 
                    min="0.01" step="0.01"
                    value={descontoValor} 
                    inputMode="numeric"
onChange={(e) => setDescontoValor(parseFloat(e.target.value) || 0)} 
                    required
                    className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" 
                  />
                </div>
              </>
            )}
          </div>
        </section>

        {/* Passo 4: Limites e VIP */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-neutral-100 pb-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Layers className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-black text-neutral-900 uppercase tracking-widest">4. Limites e Regras</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Acesso VIP Exclusivo?</label>
              <select 
                value={nivelMinimoId} 
                onChange={e => setNivelMinimoId(e.target.value)}
                className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
              >
                <option value="">Não, liberar para todos os clientes</option>
                {niveisVip.map(n => <option key={n.id} value={n.id}>Sim, apenas {n.name} ou superior</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Uso Máximo por Cliente *</label>
              <input  
                type="number" 
                min="1"
                value={usoMaximo} 
                inputMode="numeric"
onChange={(e) => setUsoMaximo(parseInt(e.target.value) || 1)} 
                required
                className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" 
              />
            </div>
            <div>
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Data de Início *</label>
              <input 
                type="date" 
                value={dataInicio} 
                onChange={e => setDataInicio(e.target.value)} 
                required
                className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" 
              />
            </div>
            <div>
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-1 block">Data de Fim (Opcional)</label>
              <input 
                type="date" 
                value={dataFim} 
                onChange={e => setDataFim(e.target.value)} 
                className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" 
              />
            </div>
          </div>
        </section>

      </div>

      {/* Footer / Ações */}
      <div className="pt-4 mt-2 border-t border-neutral-200 flex items-center justify-between bg-white shrink-0">
        <div className="flex gap-2">
          {initialData?.id && onDelete && (
            <button 
              type="button" 
              onClick={async () => {
                const ok = await confirmHook.confirm({
                  title: 'Excluir promoção',
                  message: 'Tem certeza que deseja excluir esta promoção? Essa ação não pode ser desfeita.',
                  confirmLabel: 'Excluir',
                  cancelLabel: 'Cancelar',
                });
                if (ok) {
                  onDelete();
                }
              }}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Excluir
            </button>
          )}
          
          {initialData?.id && (
            <button 
              type="button" 
              onClick={handleToggleStatus}
              disabled={isSubmitting}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition-colors ${
                initialData.status === 'ativa' 
                  ? 'text-amber-600 hover:bg-amber-50' 
                  : 'text-emerald-600 hover:bg-emerald-50'
              }`}
            >
              {initialData.status === 'ativa' ? 'Suspender' : 'Reativar'}
            </button>
          )}
        </div>
        <div className="flex gap-3">
          <button 
            type="button" 
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-6 py-3 rounded-xl font-bold text-sm text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            Cancelar
          </button>
        <button 
          type="submit" 
          disabled={isSubmitting}
          className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-indigo-200 disabled:opacity-50"
        >
          {isSubmitting ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {isSubmitting ? 'Salvando...' : 'Salvar Promoção'}
        </button>
        </div>
      </div>
    </form>
  );
}
