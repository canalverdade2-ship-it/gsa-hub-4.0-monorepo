import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { LojaCategoria } from '../../types';
import { Plus, Edit2, Trash2, Search, Loader2, Tag, Check, X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { generateCode, isLocalDevHost } from '../../lib/utils';

export function LojaCategoriasModule() {
  const [categorias, setCategorias] = useState<LojaCategoria[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategoria, setEditingCategoria] = useState<LojaCategoria | null>(null);
  
  const [formData, setFormData] = useState({
    nome: '',
    slug: '',
    icone: '',
    imagem_url: '',
    ordem: 0,
    status: 'ativo' as 'ativo' | 'inativo',
    tipo_item: 'produto' as 'produto' | 'assinatura'
  });

  useEffect(() => {
    fetchCategorias();
    
    const channel = supabase.channel('categorias-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loja_categorias' }, () => {
        fetchCategorias();
      }).subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCategorias = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('loja_categorias')
        .select('*')
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true });
        
      if (error) throw error;
      setCategorias(data || []);
    } catch (err) {
      console.error('Erro ao buscar categorias:', err);
      toast.error('Não foi possível carregar as categorias.');
    } finally {
      setIsLoading(false);
    }
  };

  const generateSlug = (text: string) => {
    return text.toString().toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  };

  const handleNomeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nome = e.target.value;
    setFormData(prev => ({
      ...prev,
      nome,
      slug: generateSlug(nome)
    }));
  };

  const openNewModal = () => {
    setEditingCategoria(null);
    setFormData({
      nome: '',
      slug: '',
      icone: '',
      imagem_url: '',
      ordem: categorias.length * 10,
      status: 'ativo',
      tipo_item: 'produto'
    });
    setIsModalOpen(true);
  };

  const openEditModal = (categoria: LojaCategoria) => {
    setEditingCategoria(categoria);
    setFormData({
      nome: categoria.nome,
      slug: categoria.slug,
      icone: categoria.icone || '',
      imagem_url: categoria.imagem_url || '',
      ordem: categoria.ordem || 0,
      status: categoria.status,
      tipo_item: categoria.tipo_item === 'assinatura' ? 'assinatura' : 'produto'
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome || !formData.slug) {
      toast.error('Nome e Slug são obrigatórios.');
      return;
    }

    try {
      if (editingCategoria) {
        const { error } = await supabase
          .from('loja_categorias')
          .update({
            ...formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingCategoria.id);
          
        if (error) throw error;
        toast.success('Categoria atualizada com sucesso!');
      } else {
        const { error } = await supabase
          .from('loja_categorias')
          .insert([formData]);
          
        if (error) throw error;
        toast.success('Categoria criada com sucesso!');
      }
      setIsModalOpen(false);
      fetchCategorias();
    } catch (err: any) {
      console.error('Erro ao salvar categoria:', err);
      if (err.code === '23505') {
        toast.error('Já existe uma categoria com este slug.');
      } else {
        toast.error('Erro ao salvar categoria.');
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta categoria? Produtos vinculados podem perder a referência.')) {
      try {
        const { error } = await supabase.from('loja_categorias').delete().eq('id', id);
        if (error) throw error;
        toast.success('Categoria excluída com sucesso.');
        fetchCategorias();
      } catch (err) {
        console.error('Erro ao excluir categoria:', err);
        toast.error('Erro ao excluir. Verifique se há itens vinculados.');
      }
    }
  };

  const filteredCategorias = categorias.filter(c => 
    c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Tag className="w-6 h-6 text-indigo-600" />
            Categorias da Loja
          </h2>
          <p className="text-gray-500">Gerencie as categorias de produtos, serviços e assinaturas</p>
        </div>
        <button
          onClick={openNewModal}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nova Categoria
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
        <Search className="w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar categoria..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-transparent border-none focus:ring-0 text-gray-700 placeholder-gray-400"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : filteredCategorias.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-100">
          <Tag className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Nenhuma categoria encontrada</h3>
          <p className="text-gray-500 mt-1">Crie sua primeira categoria para organizar a loja.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredCategorias.map(categoria => (
            <div key={categoria.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group relative flex flex-col">
              <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-white/90 backdrop-blur-sm rounded-lg p-1 shadow-sm">
                <button
                  onClick={() => openEditModal(categoria)}
                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                  title="Editar"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(categoria.id)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  title="Excluir"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="h-32 bg-gray-50 flex items-center justify-center relative overflow-hidden border-b border-gray-100">
                {categoria.imagem_url ? (
                  <img src={categoria.imagem_url} alt={categoria.nome} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-10 h-10 text-gray-300" />
                )}
                <div className="absolute bottom-2 left-2 flex gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md shadow-sm bg-indigo-100 text-indigo-700`}>
                    {categoria.tipo_item === 'assinatura' ? 'Assinatura' : 'Produto'}
                  </span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md shadow-sm ${categoria.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {categoria.status}
                  </span>
                </div>
              </div>

              <div className="p-4 flex-1 flex flex-col">
                <h3 className="font-bold text-gray-900 line-clamp-1">{categoria.nome}</h3>
                <p className="text-xs text-gray-500 font-mono mt-1 mb-3 bg-gray-50 px-2 py-1 rounded w-fit">/{categoria.slug}</p>
                <div className="mt-auto flex items-center justify-between text-xs text-gray-500">
                  <span>Ordem: {categoria.ordem}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingCategoria ? "Editar Categoria" : "Nova Categoria"} size="md">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Categoria *</label>
            <input
              type="text"
              required
              value={formData.nome}
              onChange={handleNomeChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Ex: Produtos Digitais"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Item</label>
              <select
                value={formData.tipo_item}
                onChange={(e) => setFormData({...formData, tipo_item: e.target.value as 'produto' | 'assinatura'})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="produto">Produtos</option>
                <option value="assinatura">Assinaturas</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({...formData, status: e.target.value as 'ativo' | 'inativo'})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
            >
              <Check className="w-5 h-5" />
              Salvar Categoria
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
