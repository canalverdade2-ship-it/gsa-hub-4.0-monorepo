import { useState, useEffect } from 'react';
import { Plus, Search, MoreHorizontal, Gift, Trash2, Calendar, ShoppingBag, Loader2, Sparkles, AlertCircle, Copy, BarChart3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PromocaoQuantidade, Produto, LojaCategoria } from '../../types';
import { Modal } from '../ui/Modal';
import { formatCurrency, formatDate } from '../../lib/utils';
import { toast } from 'react-hot-toast';
import { logService } from '../../lib/logService';
import { PromocaoQuantidadeForm } from './PromocaoQuantidadeForm';
import { PromoAnalytics } from './PromoAnalytics';

export function PromocaoQuantidadeModule({ colaboradorId, colaboradorNome }: { colaboradorId?: string, colaboradorNome?: string }) {
  const [activeTab, setActiveTab] = useState<'ativas' | 'encerradas' | 'analytics'>('ativas');
  const [promocoes, setPromocoes] = useState<PromocaoQuantidade[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromocaoQuantidade | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPromocoes();
    const channel = supabase
      .channel('admin-promocoes-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promocoes_quantidade' }, () => {
        fetchPromocoes();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeTab, search]);

  const handleDeletePromo = async (id: string) => {
    try {
      const { error } = await supabase.from('promocoes_quantidade').delete().eq('id', id);
      if (error) throw error;
      toast.success('Promoção excluída com sucesso!');
      setIsModalOpen(false);
      setEditingPromo(null);
      fetchPromocoes();
    } catch (err) {
      console.error('Erro ao deletar promoção', err);
      toast.error('Não foi possível excluir a promoção.');
    }
  };

  const fetchPromocoes = async () => {
    setLoading(true);
    try {
      let query = supabase.from('promocoes_quantidade').select('*, produto_gatilho:produtos!produto_gatilho_id(nome), categoria_gatilho:loja_categorias!categoria_gatilho_id(nome), produto_brinde:produtos!produto_brinde_id(nome)');
      
      if (activeTab === 'ativas') {
        query = query.in('status', ['ativa', 'suspensa']);
      } else if (activeTab === 'encerradas') {
        query = query.in('status', ['encerrada']);
      }

      if (search) {
        query = query.ilike('nome', `%${search}%`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setPromocoes(data);
    } catch (error) {
      console.error('Erro ao buscar promoções', error);
      toast.error('Erro ao buscar promoções');
    } finally {
      setLoading(false);
    }
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'unidade_gratis': return <span className="bg-orange-100 text-orange-600 p-1.5 rounded-lg"><Gift className="w-4 h-4" /></span>;
      case 'desconto_proxima': return <span className="bg-green-100 text-green-600 p-1.5 rounded-lg"><ShoppingBag className="w-4 h-4" /></span>;
      case 'ganhe_outro_produto': return <span className="bg-purple-100 text-purple-600 p-1.5 rounded-lg"><Sparkles className="w-4 h-4" /></span>;
      case 'combo': return <span className="bg-blue-100 text-blue-600 p-1.5 rounded-lg"><ShoppingBag className="w-4 h-4" /></span>;
      default: return <Gift className="w-4 h-4" />;
    }
  };

  const formatTipoNome = (tipo: string) => {
    return tipo.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 group-focus-within:text-indigo-500 transition-colors" />
          <input 
            type="text" 
            placeholder="Buscar por nome da promoção..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white shadow-sm border border-neutral-200 rounded-xl py-3 pl-10 pr-4 text-xs font-medium text-neutral-900 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
          />
        </div>
        <button 
          onClick={() => {
            setEditingPromo(null);
            setIsModalOpen(true);
          }}
          className="flex items-center justify-center gap-3 rounded-xl bg-[#1a1a1a] px-8 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-xl transition-all hover:bg-black active:scale-95 group whitespace-nowrap"
        >
          <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
          Nova Promoção
        </button>
      </div>

      <div className="flex border-b border-neutral-200 mb-6">
        <button onClick={() => setActiveTab('ativas')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'ativas' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-neutral-500'}`}>Ativas / Suspensas</button>
        <button onClick={() => setActiveTab('encerradas')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'encerradas' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-neutral-500'}`}>Histórico</button>
        <button onClick={() => setActiveTab('analytics')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'analytics' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-neutral-500'}`}>
          <BarChart3 className="w-4 h-4" /> Analytics
        </button>
      </div>

      {activeTab !== 'analytics' && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
             <div className="col-span-full py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-500" /></div>
          ) : promocoes.map((promo) => (
            <div key={promo.id} className="group relative rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 transition-all hover:shadow-md">
              <div className="mb-4 flex items-center justify-between">
                {getTipoIcon(promo.tipo_promocao)}
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${promo.status === 'ativa' ? 'bg-emerald-100 text-emerald-700' : promo.status === 'suspensa' ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-neutral-700'}`}>
                  {promo.status}
                </span>
              </div>
              
              <h3 className="text-lg font-bold text-neutral-900 line-clamp-1">{promo.nome}</h3>
              
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="inline-block rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600 uppercase">
                  {promo.escopo_gatilho}
                </span>
                {promo.nivel_minimo_id && (
                  <span className="inline-block rounded-md bg-yellow-50 px-2 py-0.5 text-[10px] font-bold text-yellow-600 uppercase border border-yellow-200">
                    👑 VIP
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-xs text-neutral-500 font-medium">
                   Gatilho: <span className="text-neutral-900 font-bold">{promo.quantidade_minima}x</span> {promo.escopo_gatilho === 'produto' && promo.produto_gatilho?.nome} {promo.escopo_gatilho === 'geral' && 'Qualquer Produto'}
                </p>
                <p className="text-xs text-indigo-600 font-bold">
                   Benefício: {formatTipoNome(promo.tipo_promocao)}
                </p>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 border-t pt-4 border-neutral-100">
                 <button 
                   onClick={() => {
                     setEditingPromo(promo);
                     setIsModalOpen(true);
                   }}
                   className="px-4 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                 >
                   Editar / Visualizar
                 </button>
              </div>
            </div>
          ))}
          {!loading && promocoes.length === 0 && (
            <div className="col-span-full py-12 text-center text-neutral-500">Nenhuma promoção encontrada.</div>
          )}
        </div>
      )}

      {activeTab === 'analytics' && (
         <PromoAnalytics />
      )}

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingPromo(null); }} title={editingPromo ? "Editar Promoção" : "Nova Promoção Inteligente"} size="wide">
         <PromocaoQuantidadeForm 
            initialData={editingPromo}
            onCancel={() => { setIsModalOpen(false); setEditingPromo(null); }} 
            onDelete={editingPromo ? () => handleDeletePromo(editingPromo.id) : undefined}
            onSuccess={() => {
              setIsModalOpen(false);
              setEditingPromo(null);
              fetchPromocoes();
            }} 
         />
      </Modal>
    </div>
  );
}
