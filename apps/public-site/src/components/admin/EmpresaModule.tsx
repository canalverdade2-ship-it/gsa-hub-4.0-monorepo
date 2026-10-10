import React, { useState, useEffect } from 'react';
import { Building2, Save, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Empresa } from '../../types';
import { toast } from 'react-hot-toast';
import { maskCNPJ, maskPhone } from '../../lib/utils';

export function EmpresaModule() {
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    razao_social: '',
    cnpj: '',
    telefone: '',
    responsavel: ''
  });

  useEffect(() => {
    fetchEmpresa();

    let timeoutId: NodeJS.Timeout;
    const debouncedFetch = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fetchEmpresa();
      }, 300);
    };

    const channel = supabase
      .channel(`admin-empresa-rt-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'empresa' }, debouncedFetch)
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchEmpresa = async () => {
    try {
      const { data, error } = await supabase.from('empresa').select('*').limit(1).maybeSingle();
      if (error) throw error;
      if (data) {
        setEmpresa(data);
        setFormData({
          razao_social: data.razao_social,
          cnpj: data.cnpj,
          telefone: data.telefone || '',
          responsavel: data.responsavel || ''
        });
      }
    } catch (error) {
      console.error('Error fetching empresa:', error);
      toast.error('Erro ao buscar dados da empresa.');
    }
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    // Validate CNPJ (basic format check)
    const cnpjRegex = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;
    if (!cnpjRegex.test(formData.cnpj)) {
      toast.error('CNPJ inválido. Use o formato XX.XXX.XXX/XXXX-XX');
      setSaving(false);
      return;
    }

    // Validate Phone (exactly 11 digits)
    if (formData.telefone) {
      const cleanPhone = formData.telefone.replace(/\D/g, '');
      if (cleanPhone.length !== 11) {
        toast.error('O telefone deve conter exatamente 11 números (DDD + 9 dígitos).');
        setSaving(false);
        return;
      }
    }

    try {
      const { data: existing, error: fetchError } = await supabase.from('empresa').select('id').limit(1).maybeSingle();

      if (fetchError) throw fetchError;

      if (existing?.id) {
        const { error } = await supabase
          .from('empresa')
          .update(formData)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        // If no record exists, insert a new one.
        const { error } = await supabase
          .from('empresa')
          .insert([formData]);
        if (error) throw error;
      }
      toast.success('Dados da empresa salvos com sucesso.');
      fetchEmpresa();
    } catch (err) {
      console.error('Error saving empresa:', err);
      toast.error('Erro ao salvar dados. Verifique sua conexão.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-4">
      {!empresa && (
        <div className="flex items-center gap-4 rounded-2xl bg-amber-50 p-6 text-amber-700 ring-1 ring-amber-200">
          <AlertCircle className="h-6 w-6 shrink-0" />
          <div>
            <p className="font-bold">Configuração Necessária</p>
            <p className="text-sm">Cadastre os dados da empresa para que apareçam em orçamentos, faturas e tickets.</p>
          </div>
        </div>
      )}

      <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-neutral-200">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-neutral-900">Dados da Empresa</h3>
            <p className="text-sm text-neutral-500">Informações oficiais do Grupo GSA.</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-bold text-neutral-700">Razão Social *</label>
              <input 
                type="text" 
                required
                value={formData.razao_social}
                onChange={e => setFormData({...formData, razao_social: e.target.value})}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-neutral-700">CNPJ *</label>
              <input  
                type="text" 
                required
                placeholder="00.000.000/0000-00"
                maxLength={18}
                value={maskCNPJ(formData.cnpj)}
                inputMode="numeric"
onChange={(e) => setFormData({...formData, cnpj: maskCNPJ(e.target.value)})}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-bold text-neutral-700">Telefone</label>
              <input 
                type="text" 
                inputMode="numeric"
                pattern="[0-9]*"
                value={formData.telefone}
                onChange={e => setFormData({...formData, telefone: maskPhone(e.target.value)})}
                maxLength={15}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-bold text-neutral-700">Responsável</label>
              <input 
                type="text" 
                value={formData.responsavel}
                onChange={e => setFormData({...formData, responsavel: e.target.value})}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button 
              type="submit" 
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-3 font-bold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 disabled:opacity-50"
            >
              <Save className="h-5 w-5" />
              {saving ? 'Salvando...' : empresa ? 'Salvar Alterações' : 'Cadastrar Empresa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
