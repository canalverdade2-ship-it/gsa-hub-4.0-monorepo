import React, { useState, useEffect } from 'react';
import { Settings, Calculator, RefreshCw, Save, AlertCircle, TrendingUp, DollarSign, Activity } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../lib/supabase';

interface PricingPanelProps {
  colaboradorId?: string;
  colaboradorNome?: string;
}

interface PricingConfig {
  id: string;
  category: string;
  base_markup: number;
  min_margin: number;
  max_margin: number;
  dynamic_pricing_enabled: boolean;
  webhook_url?: string;
  last_updated?: string;
}

export function PricingPanel({ colaboradorId, colaboradorNome }: PricingPanelProps) {
  const [configs, setConfigs] = useState<PricingConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [globalWebhook, setGlobalWebhook] = useState('');

  // Carregar configurações simuladas ou reais
  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('pricing_configs').select('*');
      if (error) throw error;
      if (data && data.length > 0) {
        setConfigs(data);
      } else {
        setConfigs([
          { id: '1', category: 'Eletrônicos', base_markup: 30, min_margin: 15, max_margin: 50, dynamic_pricing_enabled: true },
          { id: '2', category: 'Vestuário', base_markup: 50, min_margin: 25, max_margin: 70, dynamic_pricing_enabled: false },
          { id: '3', category: 'Acessórios', base_markup: 60, min_margin: 30, max_margin: 80, dynamic_pricing_enabled: true },
          { id: '4', category: 'Geral', base_markup: 40, min_margin: 20, max_margin: 60, dynamic_pricing_enabled: true },
        ]);
      }
      setGlobalWebhook('https://n8n.gsa.com.br/webhook/pricing-update');
    } catch (error) {
      toast.error('Erro ao carregar configurações de preço.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = (id: string, field: keyof PricingConfig, value: any) => {
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const saveConfigs = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('pricing_configs').upsert(configs);
      if (error) throw error;
      toast.success('Configurações de precificação salvas com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar configurações de preço.');
    } finally {
      setSaving(false);
    }
  };

  const triggerPricingUpdate = async () => {
    if (!globalWebhook) {
      toast.error('URL do Webhook do N8N não configurada.');
      return;
    }
    
    const toastId = toast.loading('Disparando atualização de preços via N8N...');
    try {
      await fetch(globalWebhook, { method: 'POST', body: JSON.stringify({ action: 'update_pricing', configs }) });
      toast.success('Automação de precificação disparada com sucesso!', { id: toastId });
    } catch (error) {
      toast.error('Erro ao conectar com N8N', { id: toastId });
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-neutral-900 flex items-center gap-2">
            <Calculator className="h-6 w-6 text-indigo-600" />
            Precificação Dinâmica
          </h2>
          <p className="text-sm text-neutral-500 mt-1">
            Configure as regras de markup e margens de lucro para integração com fornecedores via N8N.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={triggerPricingUpdate}
            className="flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-colors text-sm gap-2 border border-indigo-200 text-indigo-700 hover:bg-indigo-50"
          >
            <Activity className="h-4 w-4" />
            Sincronizar Preços (N8N)
          </button>
          <button 
            type="button"
            onClick={saveConfigs} 
            disabled={saving}
            className="flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-colors text-sm gap-2 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Regras
          </button>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm">
        <h3 className="text-sm font-bold text-neutral-800 mb-4 flex items-center gap-2">
          <Settings className="h-4 w-4 text-neutral-500" />
          Configuração de Integração N8N
        </h3>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-neutral-600">URL do Webhook (N8N) para Atualização de Catálogo</label>
          <input 
            type="url" 
            value={globalWebhook}
            onChange={(e) => setGlobalWebhook(e.target.value)}
            placeholder="https://n8n.seu-dominio.com/webhook/..."
            className="w-full rounded-xl border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
          <p className="text-[10px] text-neutral-500">
            Esta URL será chamada quando você clicar em "Sincronizar Preços", enviando as regras abaixo para o fluxo do N8N processar o catálogo dos fornecedores.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100 bg-neutral-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-800 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-neutral-500" />
            Regras de Margem por Categoria
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-white">
              <tr>
                <th className="px-5 py-3 font-semibold text-neutral-500 text-xs uppercase tracking-wider">Categoria</th>
                <th className="px-5 py-3 font-semibold text-neutral-500 text-xs uppercase tracking-wider">Markup Base (%)</th>
                <th className="px-5 py-3 font-semibold text-neutral-500 text-xs uppercase tracking-wider">Margem Mínima (%)</th>
                <th className="px-5 py-3 font-semibold text-neutral-500 text-xs uppercase tracking-wider">Margem Máxima (%)</th>
                <th className="px-5 py-3 font-semibold text-neutral-500 text-xs uppercase tracking-wider text-center">Precificação Dinâmica</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {configs.map((config) => (
                <tr key={config.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="px-5 py-4 font-medium text-neutral-900">{config.category}</td>
                  <td className="px-5 py-4">
                    <div className="relative w-24">
                      <input 
                        type="number"
                        value={config.base_markup}
                        inputMode="numeric"
onChange={(e) => handleConfigChange(config.id, 'base_markup', Number(e.target.value))}
                        className="w-full rounded-lg border-neutral-200 pr-6 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs">%</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="relative w-24">
                      <input 
                        type="number"
                        value={config.min_margin}
                        inputMode="numeric"
onChange={(e) => handleConfigChange(config.id, 'min_margin', Number(e.target.value))}
                        className="w-full rounded-lg border-neutral-200 pr-6 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs">%</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="relative w-24">
                      <input 
                        type="number"
                        value={config.max_margin}
                        inputMode="numeric"
onChange={(e) => handleConfigChange(config.id, 'max_margin', Number(e.target.value))}
                        className="w-full rounded-lg border-neutral-200 pr-6 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs">%</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={config.dynamic_pricing_enabled}
                        onChange={(e) => handleConfigChange(config.id, 'dynamic_pricing_enabled', e.target.checked)}
                      />
                      <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="rounded-xl bg-indigo-50 p-4 border border-indigo-100 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-bold text-indigo-900">Como funciona a Precificação Dinâmica?</h4>
          <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
            A venda na loja será realizada <strong>sem estoque e sem venda direta</strong>. O cliente clica no link e é direcionado para a compra automatizada.
            O N8N será responsável por raspar ou conectar-se aos fornecedores, ler o custo e aplicar o <strong>Markup Base</strong> configurado aqui. 
            Se a opção "Precificação Dinâmica" estiver ativa, o N8N poderá ajustar o preço baseado na concorrência, desde que respeite os limites de <strong>Margem Mínima</strong> e <strong>Margem Máxima</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
