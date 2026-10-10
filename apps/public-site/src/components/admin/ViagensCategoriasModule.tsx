import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { callAdminRpc, createAdminRequestId } from '../../lib/adminRpc';
import { Modal } from '../ui/Modal';
import { EmptyState } from '../ui/EmptyState';
import { toast } from 'react-hot-toast';
import { Plus, Edit, Trash2, ListTree, RefreshCw, Loader2, CheckCircle2, XCircle, Map as MapIcon } from 'lucide-react';
import { useRealtimeSubscription } from '../../hooks/useRealtime';

interface ViagemCategoria {
  id: string;
  nome: string;
  slug: string;
  ordem: number;
  status: 'ativo' | 'inativo';
  created_at: string;
}

export function ViagensCategoriasModule() {
  const [items, setItems] = useState<ViagemCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<ViagemCategoria> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useRealtimeSubscription({
    table: 'viagens_categorias',
    onChange: loadData,
    debounceMs: 300,
  });

  async function loadData() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('viagens_categorias')
        .select('*')
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      toast.error('Erro ao carregar categorias: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditingItem({ status: 'ativo', ordem: (items.length + 1) * 10 });
    setModalOpen(true);
  };

  const openEdit = (item: ViagemCategoria) => {
    setEditingItem(item);
    setModalOpen(true);
  };

  const closeModal = () => {
    setEditingItem(null);
    setModalOpen(false);
  };

  const generateSlug = (text: string) => {
    return text.toString().toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  };

  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem?.nome) {
      toast.error('Preencha o nome da categoria.');
      return;
    }

    const payload = {
      ...editingItem,
      slug: editingItem.slug || generateSlug(editingItem.nome),
    };

    setSaving(true);
    try {
      const result = await callAdminRpc('gsa_admin_save_travel_category', { p_payload: payload }) as { error?: string };
      if (result.error) throw new Error(result.error);
      
      toast.success(editingItem.id ? 'Categoria atualizada' : 'Categoria criada');
      closeModal();
      loadData();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (item: ViagemCategoria) => {
    const newStatus = item.status === 'ativo' ? 'inativo' : 'ativo';
    const toastId = toast.loading(`Marcando como ${newStatus}...`);
    try {
      const payload = { ...item, status: newStatus };
      const result = await callAdminRpc('gsa_admin_save_travel_category', { p_payload: payload }) as { error?: string };
      if (result.error) throw new Error(result.error);
      toast.success('Status atualizado!', { id: toastId });
      loadData();
    } catch (err: any) {
      toast.error('Erro ao atualizar: ' + err.message, { id: toastId });
    }
  };

  const deleteItem = async (item: ViagemCategoria) => {
    if (!window.confirm(`Tem certeza que deseja EXCLUIR a categoria "${item.nome}"?`)) return;

    const toastId = toast.loading('Excluindo...');
    try {
      await callAdminRpc('gsa_admin_delete_travel_category', {
        p_categoria_id: item.id,
        p_request_id: createAdminRequestId(),
      });
      toast.success('Categoria excluída!', { id: toastId });
      loadData();
    } catch (err: any) {
      toast.error('Erro ao excluir (Pode estar em uso): ' + err.message, { id: toastId });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-neutral-900">Categorias de Viagens</h2>
          <p className="text-sm text-neutral-500 mt-1">Gerencie as categorias dos pacotes de viagem (ex: Nacional, Internacional).</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-neutral-500 shadow-sm border border-neutral-200 hover:bg-neutral-50 hover:text-indigo-600 transition">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openNew} className="flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 font-bold text-white shadow-sm transition hover:bg-indigo-700">
            <Plus className="h-4 w-4" /> Nova Categoria
          </button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-neutral-100 bg-white py-24 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-4" />
          <p className="text-sm font-bold text-neutral-500">Carregando categorias...</p>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={MapIcon} title="Nenhuma categoria" description="Crie a primeira categoria de viagens." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="flex flex-col rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-indigo-100 group relative overflow-hidden">
              <div className="absolute top-0 right-0 p-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(item)} className="p-1.5 text-neutral-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Editar">
                  <Edit className="h-4 w-4" />
                </button>
                <button onClick={() => deleteItem(item)} className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Excluir">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.status === 'ativo' ? 'bg-indigo-100 text-indigo-600' : 'bg-neutral-100 text-neutral-400'}`}>
                  <ListTree className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900 truncate pr-12">{item.nome}</h3>
                  <p className="text-xs text-neutral-500">/{item.slug}</p>
                </div>
              </div>

              <div className="mt-auto flex items-center justify-between pt-4 border-t border-neutral-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleStatus(item)}
                    className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border transition ${
                      item.status === 'ativo' 
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                        : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    {item.status === 'ativo' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {item.status === 'ativo' ? 'Ativo' : 'Inativo'}
                  </button>
                </div>
                <span className="text-[10px] font-medium text-neutral-400 bg-neutral-50 px-2 py-1 rounded border border-neutral-100">
                  Ordem: {item.ordem}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal isOpen={true} title={editingItem?.id ? 'Editar Categoria' : 'Nova Categoria'} onClose={closeModal}>
          <form onSubmit={saveItem} className="p-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-neutral-700">Nome da Categoria</label>
                <input
                  type="text"
                  required
                  value={editingItem?.nome || ''}
                  onChange={(e) => {
                    const nome = e.target.value;
                    setEditingItem({ ...editingItem, nome, slug: generateSlug(nome) });
                  }}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Ex: Cruzeiros"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700">Slug (URL)</label>
                <input
                  type="text"
                  required
                  value={editingItem?.slug || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, slug: generateSlug(e.target.value) })}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700">Ordem</label>
                <input 
                  type="number"
                  value={editingItem?.ordem || 0}
                  inputMode="numeric"
onChange={(e) => setEditingItem({ ...editingItem, ordem: Number(e.target.value) })}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-neutral-700">Status</label>
                <select
                  value={editingItem?.status || 'ativo'}
                  onChange={(e) => setEditingItem({ ...editingItem, status: e.target.value as 'ativo' | 'inativo' })}
                  className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100">
              <button type="button" onClick={closeModal} className="rounded-xl px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-100 transition">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 transition disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar Categoria
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
