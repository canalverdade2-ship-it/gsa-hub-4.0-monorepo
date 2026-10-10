import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { callAdminRpc } from '../../lib/adminRpc';
import { Modal } from '../ui/Modal';
import { EmptyState } from '../ui/EmptyState';
import { toast } from 'react-hot-toast';
import { formatDateTime } from '../../lib/utils';
import { ScrapingExecutionMonitorModal } from './ScrapingExecutionMonitorModal';
import {
  Plus, Edit, Trash2, Webhook, CheckCircle2, XCircle,
  Settings2, Loader2, RefreshCw, Clock, Calendar, Repeat, Play, Zap, Eye, Activity
} from 'lucide-react';

const DIAS_SEMANA = [
  { key: 'segunda', label: 'Seg' },
  { key: 'terca', label: 'Ter' },
  { key: 'quarta', label: 'Qua' },
  { key: 'quinta', label: 'Qui' },
  { key: 'sexta', label: 'Sex' },
  { key: 'sabado', label: 'Sáb' },
  { key: 'domingo', label: 'Dom' },
];

const FREQ_LABELS: Record<string, string> = {
  uma_vez: 'Uma única vez',
  diario: 'Diariamente',
  semanal: 'Semanalmente',
  mensal: 'Mensalmente',
};

const inputClass = 'w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white';
const labelClass = 'block text-xs font-bold text-neutral-700 mb-1';

const DEFAULT_FORM = {
  nome: '',
  tipo: 'produtos',
  target_url: '',
  sync_id: '',
  margem_lucro: 15,
  modo_categoria: 'ia',
  categoria_id: '',
  ativo: true,
  frequencia: 'diario',
  horarios: ['09:00'],
  dias_semana: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
  data_inicio: '',
  data_fim: '',
  n8n_webhook_url: '',
  limite_produtos: 0,
  palavras_chave: '',
  categoria_filtro: '',
  preco_min: '',
  preco_max: '',
  desconto_min: '',
  rating_min: '',
};

export function ScrapingAdminModule() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [form, setForm] = useState<any>({ ...DEFAULT_FORM });
  const [categorias, setCategorias] = useState<any[]>([]);
  const [viagensCategorias, setViagensCategorias] = useState<any[]>([]);
  const [novoHorario, setNovoHorario] = useState('');
  const [n8nBaseUrl, setN8nBaseUrl] = useState('http://127.0.0.1:5680');
  const [showN8nConfig, setShowN8nConfig] = useState(false);
  const [monitorItem, setMonitorItem] = useState<any>(null);
  const [showMonitor, setShowMonitor] = useState(false);

  useEffect(() => {
    loadData();
    loadCategorias();
    loadN8nBaseUrl();

    // Inscrever em atualizações Realtime para atualização instantânea na tela
    const channel = supabase
      .channel('realtime_automacao_configs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'automacao_scraping_configs' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadN8nBaseUrl = async () => {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'n8n_base_url')
        .single();
      if (data?.value) {
        const val = typeof data.value === 'string' ? data.value : JSON.parse(JSON.stringify(data.value));
        const clean = String(val).replaceAll('"', '').trim();
        if (clean) setN8nBaseUrl(clean);
      }
    } catch {
      /* silencioso */
    }
  };

  const saveN8nBaseUrl = async (newUrl: string) => {
    const cleanUrl = newUrl.trim().replace(/\/$/, '');
    if (!cleanUrl) return;

    const toastId = toast.loading('Atualizando servidor N8N global...');
    try {
      // 1. Salvar em system_settings
      await supabase
        .from('system_settings')
        .upsert({ key: 'n8n_base_url', value: JSON.stringify(cleanUrl) }, { onConflict: 'key' });

      setN8nBaseUrl(cleanUrl);

      // 2. Atualizar todas as automações para usar o novo servidor N8N
      const { data: configs } = await supabase.from('automacao_scraping_configs').select('*');
      if (configs) {
        for (const cfg of configs) {
          const webhookPath = cfg.tipo === 'viagens' ? '/webhook/gsa-viagens-scraping' : '/webhook/gsa-produtos-scraping';
          const newWebhook = `${cleanUrl}${webhookPath}`;
          await supabase
            .from('automacao_scraping_configs')
            .update({ n8n_webhook_url: newWebhook })
            .eq('id', cfg.id);
        }
      }

      toast.success('Servidor N8N e webhooks atualizados!', { id: toastId });
      setShowN8nConfig(false);
      loadData();
    } catch (err: any) {
      toast.error('Erro ao atualizar: ' + err.message, { id: toastId });
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('automacao_scraping_configs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      toast.error('Erro ao carregar automações: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCategorias = async () => {
    try {
      const [lojaRes, viagensRes] = await Promise.all([
        supabase.from('loja_categorias').select('id, nome').eq('status', 'ativo'),
        supabase.from('viagens_categorias').select('slug, nome').eq('status', 'ativo'),
      ]);
      if (lojaRes.data) setCategorias(lojaRes.data);
      if (viagensRes.data) setViagensCategorias(viagensRes.data);
    } catch { /* silencioso */ }
  };

  const openNew = () => {
    setEditingItem(null);
    const defaultWebhook = `${n8nBaseUrl}/webhook/gsa-produtos-scraping`;
    setForm({
      ...DEFAULT_FORM,
      sync_id: `AUTO_${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      n8n_webhook_url: defaultWebhook,
      limite_produtos: 0
    });
    setShowForm(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    const webhookPath = item.tipo === 'viagens' ? '/webhook/gsa-viagens-scraping' : '/webhook/gsa-produtos-scraping';
    const fallbackWebhook = `${n8nBaseUrl}${webhookPath}`;
    setForm({
      nome: item.nome,
      tipo: item.tipo,
      target_url: item.target_url,
      sync_id: item.sync_id,
      margem_lucro: item.margem_lucro,
      modo_categoria: item.modo_categoria,
      categoria_id: item.categoria_id || '',
      ativo: item.ativo,
      frequencia: item.frequencia || 'diario',
      horarios: item.horarios || ['09:00'],
      dias_semana: item.dias_semana || ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
      data_inicio: item.data_inicio || '',
      data_fim: item.data_fim || '',
      n8n_webhook_url: item.n8n_webhook_url || fallbackWebhook,
      limite_produtos: item.limite_produtos || 0,
      palavras_chave: item.palavras_chave || '',
      categoria_filtro: item.categoria_filtro || '',
      preco_min: item.preco_min || '',
      preco_max: item.preco_max || '',
      desconto_min: item.desconto_min || '',
      rating_min: item.rating_min || ''
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.nome.trim() || !form.target_url.trim() || !form.sync_id.trim()) {
      return toast.error('Preencha os campos obrigatórios (Nome, URL, Sync ID).');
    }
    if (form.frequencia !== 'uma_vez' && form.horarios.length === 0) {
      return toast.error('Adicione pelo menos um horário de execução.');
    }

    const webhookPath = form.tipo === 'viagens' ? '/webhook/gsa-viagens-scraping' : '/webhook/gsa-produtos-scraping';
    const fallbackWebhook = `${n8nBaseUrl}${webhookPath}`;
    const finalWebhookUrl = form.n8n_webhook_url?.trim() || fallbackWebhook;

    try {
      const payload = {
        id: editingItem?.id,
        ...form,
        categoria_id: form.categoria_id || null,
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        n8n_webhook_url: finalWebhookUrl,
      };
      const res = await callAdminRpc<any>('gsa_admin_save_scraping_config', { p_payload: payload });
      if (res?.error) throw new Error(res.error);
      toast.success(editingItem ? 'Automação atualizada!' : 'Automação criada!');
      setShowForm(false);
      loadData();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    }
  };

  const toggleAtivo = async (item: any) => {
    const toastId = toast.loading('Atualizando...');
    try {
      const payload = { ...item, ativo: !item.ativo };
      await callAdminRpc<any>('gsa_admin_save_scraping_config', { p_payload: payload });
      toast.success('Status atualizado!', { id: toastId });
      loadData();
    } catch (err: any) {
      toast.error('Erro: ' + err.message, { id: toastId });
    }
  };

  const deleteItem = async (id: string) => {
    if (!window.confirm('Excluir esta automação?')) return;
    const toastId = toast.loading('Excluindo...');
    try {
      const { error } = await supabase.from('automacao_scraping_configs').delete().eq('id', id);
      if (error) throw error;
      toast.success('Excluída!', { id: toastId });
      loadData();
    } catch (err: any) {
      toast.error('Erro: ' + err.message, { id: toastId });
    }
  };

  const triggerNow = async (item: any) => {
    const toastId = toast.loading(`Disparando "${item.nome}" no N8N...`);
    try {
      // 1. Chama a RPC que insere os logs iniciais de progresso (10%, 30%, 60%)
      await callAdminRpc<any>('gsa_admin_trigger_scraping_now', { p_automacao_id: item.id });
      
      setMonitorItem(item);
      setShowMonitor(true);
      
      toast.success('Execução disparada com sucesso!', { id: toastId });
      loadData();

      // 2. Usar a Edge Function para fazer proxy do Webhook
      const webhookUrl = item.n8n_webhook_url;
      if (webhookUrl) {
        try {
          const { error: invokeError } = await supabase.functions.invoke('gsa-trigger-webhook', {
            body: { 
              webhookUrl, 
              payload: { id: item.id, nome: item.nome, target_url: item.target_url, margem_lucro: item.margem_lucro }
            }
          });
          if (invokeError) throw invokeError;
        } catch (webhookErr: any) {
          await supabase.from('automacao_scraping_logs').insert({
            automacao_id: item.id,
            passo: 'erro',
            status: 'erro',
            mensagem: `Falha ao conectar com Servidor Python: ${webhookErr.message}`,
            progresso: 0,
          });
        }
      }
    } catch (err: any) {
      toast.error('Erro ao disparar: ' + err.message, { id: toastId });
    }
  };

  const openMonitor = (item: any) => {
    setMonitorItem(item);
    setShowMonitor(true);
  };

  const toggleDia = (dia: string) => {
    const dias = form.dias_semana as string[];
    setForm({
      ...form,
      dias_semana: dias.includes(dia) ? dias.filter((d: string) => d !== dia) : [...dias, dia],
    });
  };

  const addHorario = () => {
    if (!novoHorario) return;
    if ((form.horarios as string[]).includes(novoHorario)) {
      toast.error('Horário já adicionado.');
      return;
    }
    const sorted = [...form.horarios, novoHorario].sort();
    setForm({ ...form, horarios: sorted });
    setNovoHorario('');
  };

  const removeHorario = (h: string) => {
    setForm({ ...form, horarios: (form.horarios as string[]).filter((x: string) => x !== h) });
  };

  const freqSummary = (item: any) => {
    const freq = FREQ_LABELS[item.frequencia] || item.frequencia;
    const horarios = (item.horarios || []).join(', ');
    return `${freq}${horarios ? ` · ${horarios}` : ''}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-neutral-900">Automações N8N (Scraping)</h2>
          <p className="text-sm text-neutral-500 mt-1">
            Gerencie os robôs que importam produtos e pacotes de viagem automaticamente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowN8nConfig(true)} className="flex h-10 items-center gap-2 rounded-xl bg-neutral-900 px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-neutral-800">
            <Settings2 className="h-4 w-4 text-amber-400" /> Servidor N8N
          </button>
          <button onClick={loadData} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-neutral-500 shadow-sm border border-neutral-200 hover:bg-neutral-50 hover:text-indigo-600 transition">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openNew} className="flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 font-bold text-white shadow-sm transition hover:bg-indigo-700">
            <Plus className="h-4 w-4" /> Nova Automação
          </button>
        </div>
      </div>

      {/* List */}
      {loading && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-neutral-100 bg-white py-24 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-4" />
          <p className="text-sm font-bold text-neutral-500">Carregando automações...</p>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Webhook} title="Nenhuma automação" description="Nenhuma configuração de scraping foi criada." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${item.ativo ? 'border-indigo-100 ring-1 ring-indigo-50' : 'border-neutral-200 opacity-70'}`}>
              <div className="p-5">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.ativo ? 'bg-indigo-100 text-indigo-600' : 'bg-neutral-100 text-neutral-500'}`}>
                      {item.tipo === 'viagens' ? <Webhook className="h-5 w-5" /> : <Settings2 className="h-5 w-5" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-neutral-900">{item.nome}</h3>
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                        {item.tipo === 'viagens' ? 'GSA Viagens' : 'GSA Store'} · Margem: {item.margem_lucro}%
                      </p>
                    </div>
                  </div>
                  <button onClick={() => toggleAtivo(item)} className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition ${item.ativo ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
                    {item.ativo ? <><CheckCircle2 className="h-3.5 w-3.5" /> Ativo</> : <><XCircle className="h-3.5 w-3.5" /> Pausado</>}
                  </button>
                </div>

                <div className="rounded-xl bg-neutral-50 p-3 text-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-500">URL Alvo:</span>
                    <a href={item.target_url} target="_blank" rel="noreferrer" className="max-w-[200px] truncate font-bold text-indigo-600 hover:underline text-xs">{item.target_url}</a>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-500 flex items-center gap-1"><Repeat className="h-3 w-3" /> Frequência:</span>
                    <span className="font-bold text-neutral-700 text-xs">{freqSummary(item)}</span>
                  </div>
                  {(item.data_inicio || item.data_fim) && (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-neutral-500 flex items-center gap-1"><Calendar className="h-3 w-3" /> Período:</span>
                      <span className="font-bold text-neutral-700 text-xs">
                        {item.data_inicio || '—'} até {item.data_fim || 'sem fim'}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-500 flex items-center gap-1"><Clock className="h-3 w-3 text-amber-500" /> Última Execução:</span>
                    <span className={`font-bold text-xs ${item.ultima_execucao ? 'text-emerald-700' : 'text-neutral-400 font-normal'}`}>
                      {item.ultima_execucao ? formatDateTime(item.ultima_execucao) : 'Ainda não executou'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-500">Sync ID:</span>
                    <span className="rounded bg-neutral-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-neutral-700">{item.sync_id}</span>
                  </div>
                </div>
              </div>

              <div className="flex divide-x divide-neutral-100 border-t border-neutral-100 bg-neutral-50/50">
                <button onClick={() => triggerNow(item)} className="flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-bold text-emerald-700 hover:bg-emerald-50 transition">
                  <Zap className="h-4 w-4 text-emerald-600" /> Executar Agora
                </button>
                <button onClick={() => openMonitor(item)} className="flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-bold text-purple-700 hover:bg-purple-50 transition">
                  <Eye className="h-4 w-4 text-purple-600" /> Acompanhar
                </button>
                <button onClick={() => openEdit(item)} className="flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition">
                  <Edit className="h-4 w-4" /> Editar
                </button>
                <button onClick={() => deleteItem(item.id)} className="flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-bold text-red-600 hover:bg-red-50 transition">
                  <Trash2 className="h-4 w-4" /> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editingItem ? 'Editar Automação' : 'Nova Automação N8N'} size="lg">
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">

          {/* Identidade */}
          <div>
            <label className={labelClass}>Nome da Automação *</label>
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Shopee Achadinhos" className={inputClass} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Módulo Destino *</label>
              <select
                value={form.tipo}
                onChange={(e) => {
                  const newTipo = e.target.value;
                  const webhookPath = newTipo === 'viagens' ? '/webhook/gsa-viagens-scraping' : '/webhook/gsa-produtos-scraping';
                  setForm({
                    ...form,
                    tipo: newTipo,
                    categoria_id: '',
                    n8n_webhook_url: `${n8nBaseUrl}${webhookPath}`,
                  });
                }}
                className={inputClass}
              >
                <option value="produtos">Produtos (GSA Store)</option>
                <option value="viagens">Pacotes (GSA Viagens)</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Margem de Lucro (%)</label>
              <input type="number" value={form.margem_lucro} onChange={(e) => setForm({ ...form, margem_lucro: Number(e.target.value) })} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>URL Alvo (Feed ou Fornecedor) *</label>
            <input 
              value={form.target_url} 
              onChange={(e) => setForm({ ...form, target_url: e.target.value })} 
              placeholder={form.tipo === 'viagens' ? "https://feed.afiliados-viagens.com.br/pacotes.json ou .csv" : "https://www.atacadao.com.br/mercearia/chocolates"} 
              className={inputClass} 
            />
            
            {/* Detecção de compatibilidade dinâmica */}
            {(() => {
              const url = form.target_url.toLowerCase();
              if (form.tipo === 'viagens') {
                const isDecolarWeb = url.includes('decolar.com') && !url.includes('.csv') && !url.includes('.json') && !url.includes('.xml');
                const isCvcWeb = url.includes('cvc.com.br') && !url.includes('.csv') && !url.includes('.json');
                if (isDecolarWeb || isCvcWeb) {
                  return (
                    <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 p-3">
                      <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5 mb-1">
                        ⚠️ Portal de viagens com proteção antibot (SPA)
                      </p>
                      <p className="text-[11px] text-amber-600">
                        A página principal não entrega pacotes via HTML estático. Para importar pacotes do GSA Viagens, utilize a URL do <strong>Feed de Afiliados (CSV, JSON ou XML)</strong> fornecido no painel de parceiros da Decolar (Awin / Lomadee / Despegar Partners) ou API de catálogo.
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="mt-2 rounded-xl bg-sky-50 border border-sky-200 p-3">
                    <p className="text-xs font-bold text-sky-800 flex items-center gap-1.5 mb-1">
                      ✈️ Motor GSA Viagens Ativo
                    </p>
                    <p className="text-[11px] text-sky-700">
                      Suporta feeds em formato <strong>JSON, CSV e XML/RSS</strong> de operadoras e programas de afiliados. O robô extrai automaticamente título, destino, noites, hotel, fotos e calcula o preço de venda com a sua margem de lucro.
                    </p>
                  </div>
                );
              }

              const isShopee = url.includes('shopee');
              const isMeli = url.includes('mercadolivre') || url.includes('mlb.co');
              const isAliexpress = url.includes('aliexpress');
              const isAmazon = url.includes('amazon');
              const isIncompatible = isShopee || isMeli || isAliexpress || isAmazon;
              const isKnownVtex = url.includes('atacadao') || url.includes('cea.com') || url.includes('tokstok') || url.includes('polishop') || url.includes('carrefour') || url.includes('casasbahia') || url.includes('pontofrio') || url.includes('barateiro');

              if (isIncompatible) {
                const siteName = isShopee ? 'Shopee' : isMeli ? 'Mercado Livre' : isAliexpress ? 'AliExpress' : 'Amazon';
                return (
                  <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 p-3">
                    <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5 mb-1">
                      ⚠️ {siteName} usa proteção antibot (SPA) — compatibilidade limitada
                    </p>
                    <p className="text-[11px] text-amber-600">O robô pode não conseguir extrair produtos. Recomendamos usar fornecedores compatíveis listados abaixo.</p>
                  </div>
                );
              }
              if (isKnownVtex) {
                return (
                  <div className="mt-2 rounded-xl bg-emerald-50 border border-emerald-200 p-2.5">
                    <p className="text-[11px] font-bold text-emerald-700">✅ Fornecedor compatível! O robô consegue extrair produtos desta loja.</p>
                  </div>
                );
              }
              return null;
            })()}

            {/* Lista de feeds prontos para GSA Viagens */}
            {form.tipo === 'viagens' && (
              <div className="mt-3 rounded-xl bg-sky-50/70 border border-sky-200 p-3">
                <p className="text-[11px] font-bold text-sky-800 mb-2 uppercase tracking-wide">✈️ Feeds de Pacotes Prontos (Clique para selecionar)</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    {
                      nome: '🇧🇷 Pacotes Nacionais (10 Destinos)',
                      url: 'https://feed.gsa.com/viagens-nacionais.json',
                      tip: 'Gramado, Porto de Galinhas, Maceió, Noronha, Natal, Rio, Foz, Bonito, Floripa, Jalapão',
                      bg: 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-600 hover:text-white'
                    },
                    {
                      nome: '✈️ Pacotes Internacionais (10 Destinos)',
                      url: 'https://feed.gsa.com/viagens-internacionais.json',
                      tip: 'Cancún, Orlando Disney, Paris, Lisboa, Buenos Aires, Santiago, Punta Cana, Nova York, Roma, Dubai',
                      bg: 'bg-sky-50 border-sky-300 text-sky-800 hover:bg-sky-600 hover:text-white'
                    },
                    {
                      nome: '🔥 Super Promoções (Resorts All Inclusive)',
                      url: 'https://feed.gsa.com/viagens-promocoes.json',
                      tip: 'Porto Seguro All Inclusive, Maragogi Resort, Bariloche Neve & Spa',
                      bg: 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-600 hover:text-white'
                    },
                    {
                      nome: '🌎 Todos os Pacotes (Catálogo Completo)',
                      url: 'https://feed.gsa.com/viagens-geral.json',
                      tip: 'Importa todos os 23 pacotes turísticos nacionais e internacionais com fotos HD',
                      bg: 'bg-indigo-50 border-indigo-300 text-indigo-800 hover:bg-indigo-600 hover:text-white'
                    }
                  ].map((f) => (
                    <button
                      key={f.nome}
                      type="button"
                      title={f.tip}
                      onClick={() => setForm({ ...form, target_url: f.url })}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${f.bg}`}
                    >
                      {f.nome}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-sky-600 mt-2">
                  💡 <strong>Dica:</strong> Basta clicar em um dos botões acima e clicar em <strong>"Salvar e Executar"</strong> para importar automaticamente todos os pacotes completos com fotos HD, noites, hotel e margem de lucro!
                </p>
              </div>
            )}

            {/* Lista de fornecedores compatíveis (somente produtos) */}
            {form.tipo === 'produtos' && (
              <div className="mt-3 rounded-xl bg-indigo-50/60 border border-indigo-100 p-3">
                <p className="text-[11px] font-bold text-indigo-700 mb-2 uppercase tracking-wide">🛒 Fornecedores Compatíveis Confirmados</p>
                <div className="flex flex-wrap gap-1.5">
                  {/* Shopee Feed — botões especiais em laranja */}
                  {[
                    {
                      nome: '🟠 Shopee Premium',
                      url: 'https://affiliate.shopee.com.br/api/v1/datafeed/download?id=YWJjZGVmZ2hpamtsbW5vcPNcbnfdFhhQkoz1FtnUm6DtED25ejObtofpYLqHBC0h',
                      tip: 'Lojas verificadas / Shopee Mall — produtos de marca',
                      shopee: true
                    },
                    {
                      nome: '🛍️ Shopee Geral',
                      url: 'https://affiliate.shopee.com.br/api/v1/datafeed/download?id=YWJjZGVmZ2hpamtsbW5vcFMjz35zY_7hscVJ_4QLIFiIR3DQ9hsrLcX6rgIVVFkb',
                      tip: 'Marketplace geral — Beauty, Casa, Moda, Livros',
                      shopee: true
                    },
                  ].map((s) => (
                    <button
                      key={s.nome}
                      type="button"
                      title={s.tip}
                      onClick={() => setForm({ ...form, target_url: s.url })}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-orange-50 border border-orange-300 text-orange-700 hover:bg-orange-500 hover:text-white hover:border-orange-500 transition-all"
                    >
                      {s.nome}
                    </button>
                  ))}

                  {/* Divisor */}
                  <span className="self-center text-neutral-300 text-xs">|</span>

                  {/* Fornecedores VTEX normais */}
                  {[
                    { nome: 'Atacadão', url: 'https://www.atacadao.com.br/mercearia/chocolates' },
                    { nome: 'C&A', url: 'https://www.cea.com.br/roupas-femininas/camisetas' },
                    { nome: 'Tok&Stok', url: 'https://www.tokstok.com.br/sala/sofas' },
                    { nome: 'Polishop', url: 'https://www.polishop.com.br/eletrodomesticos' },
                    { nome: 'Carrefour', url: 'https://www.carrefour.com.br/mercearia' },
                    { nome: 'Casas Bahia', url: 'https://www.casasbahia.com.br/eletronicos' },
                    { nome: 'Daki', url: 'https://www.daki.com.br' },
                    { nome: 'Havan', url: 'https://www.havan.com.br/eletrodomesticos' },
                  ].map((s) => (
                    <button
                      key={s.nome}
                      type="button"
                      onClick={() => setForm({ ...form, target_url: s.url })}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all"
                    >
                      {s.nome}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-neutral-500 mt-1.5">
                  <span className="text-orange-600 font-bold">🟠 Shopee</span>: clique para usar o feed CSV de afiliados (100k produtos) — configure os filtros abaixo.&nbsp;
                  <span className="text-indigo-600 font-bold">🔵 Demais</span>: URL base editável, aponte para a categoria desejada.
                </p>
              </div>
            )}
          </div>

          {/* Categoria */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Modo de Categoria</label>
              <select value={form.modo_categoria} onChange={(e) => setForm({ ...form, modo_categoria: e.target.value })} className={inputClass}>
                <option value="ia">Inteligência Artificial (Auto)</option>
                <option value="manual">Fixa (Manual)</option>
              </select>
            </div>
            {form.modo_categoria === 'manual' && (
              <div>
                <label className={labelClass}>Categoria Destino</label>
                <select value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })} className={inputClass}>
                  <option value="">Selecione uma categoria...</option>
                  {form.tipo === 'produtos'
                    ? categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)
                    : viagensCategorias.map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)
                  }
                </select>
              </div>
            )}
          </div>

          {/* ─── LIMITE DE IMPORTAÇÃO ─────────────────────────── */}
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4 space-y-3">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-neutral-800">
              <Settings2 className="h-4 w-4 text-indigo-600" /> Limite de Importação de Produtos
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Modo de Limite</label>
                <select
                  value={form.limite_produtos > 0 ? 'especifico' : 'sem_limite'}
                  onChange={(e) => {
                    const modo = e.target.value;
                    setForm({
                      ...form,
                      limite_produtos: modo === 'sem_limite' ? 0 : (form.limite_produtos > 0 ? form.limite_produtos : 20),
                    });
                  }}
                  className={inputClass}
                >
                  <option value="sem_limite">Sem Limites (Importar tudo da página)</option>
                  <option value="especifico">Quantidade Pré-Escolhida (Limite Fixo)</option>
                </select>
              </div>

              {form.limite_produtos > 0 && (
                <div>
                  <label className={labelClass}>Quantidade Máxima de Produtos</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={form.limite_produtos}
                    onChange={(e) => setForm({ ...form, limite_produtos: Math.max(1, Number(e.target.value)) })}
                    placeholder="Ex: 10, 20, 50, 100"
                    className={inputClass}
                  />
                </div>
              )}
            </div>

            <p className="text-[11px] text-neutral-500 font-medium">
              {form.limite_produtos > 0
                ? ` O robô importará no máximo ${form.limite_produtos} produto(s) por execução.`
                : '⚡ O robô importará TODOS os produtos encontrados na página/catálogo sem restrição de quantidade.'}
            </p>

            {/* Campo de palavras-chave — aparece sempre mas é essencial para o Feed Shopee */}
            {/* Filtros Shopee Feed — aparece expandido quando URL é feed Shopee */}
            <div className={form.target_url.includes('datafeed/download') ? 'rounded-2xl border-2 border-orange-200 bg-orange-50/60 p-4 space-y-4' : 'space-y-3'}>
              {form.target_url.includes('datafeed/download') && (
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-orange-700">
                  🟠 Filtros do Feed Shopee (100.000 produtos)
                </p>
              )}

              {/* Palavras-chave */}
              <div>
                <label className={labelClass}>
                  🔍 Palavras-chave no nome/descrição
                  {form.target_url.includes('datafeed/download') && (
                    <span className="ml-2 text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded-md px-1.5 py-0.5">⚡ Principal filtro Shopee</span>
                  )}
                </label>
                <input
                  value={form.palavras_chave || ''}
                  onChange={(e) => setForm({ ...form, palavras_chave: e.target.value })}
                  placeholder="Ex: chocolate, vitamina, relógio (separe por vírgula)"
                  className={inputClass}
                />
                <p className="text-[11px] text-neutral-500 mt-0.5">Filtra produtos que contenham qualquer uma das palavras no nome, descrição ou categoria.</p>
              </div>

              {/* Categoria — só para Shopee feed */}
              {form.target_url.includes('datafeed/download') && (
                <div>
                  <label className={labelClass}>🗂️ Categoria Shopee (nome em inglês)</label>
                  <input
                    value={form.categoria_filtro || ''}
                    onChange={(e) => setForm({ ...form, categoria_filtro: e.target.value })}
                    placeholder="Ex: Food & Beverages, Health, Electronics, Clothing"
                    className={inputClass}
                  />
                  <p className="text-[11px] text-neutral-500 mt-0.5">Categorias disponíveis: Food & Beverages · Health · Electronics · Clothing · Sports · Home & Living · Beauty · Toys · Automotive</p>
                </div>
              )}

              {/* Faixa de Preço */}
              {form.target_url.includes('datafeed/download') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>💰 Preço Mínimo (R$)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={form.preco_min || ''}
                      onChange={(e) => setForm({ ...form, preco_min: e.target.value })}
                      placeholder="Ex: 10"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>💰 Preço Máximo (R$)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={form.preco_max || ''}
                      onChange={(e) => setForm({ ...form, preco_max: e.target.value })}
                      placeholder="Ex: 200"
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {/* Desconto e Avaliação */}
              {form.target_url.includes('datafeed/download') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>🏷️ Desconto Mínimo (%)</label>
                    <input
                      type="number" min="0" max="99"
                      value={form.desconto_min || ''}
                      onChange={(e) => setForm({ ...form, desconto_min: e.target.value })}
                      placeholder="Ex: 10 (mín 10% OFF)"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>⭐ Avaliação Mínima (0-5)</label>
                    <select
                      value={form.rating_min || ''}
                      onChange={(e) => setForm({ ...form, rating_min: e.target.value })}
                      className={inputClass}
                    >
                      <option value="">Qualquer avaliação</option>
                      <option value="3">3+ estrelas</option>
                      <option value="3.5">3.5+ estrelas</option>
                      <option value="4">4+ estrelas ⭐</option>
                      <option value="4.5">4.5+ estrelas ⭐⭐</option>
                      <option value="4.8">4.8+ estrelas 🏆</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Resumo dos filtros ativos */}
              {form.target_url.includes('datafeed/download') && (
                <div className="rounded-lg bg-white border border-orange-200 p-2.5 text-[11px] text-neutral-600">
                  <span className="font-bold text-orange-700">🔎 Filtros ativos: </span>
                  {[form.palavras_chave && `keyword: "${form.palavras_chave}"`, form.categoria_filtro && `categoria: ${form.categoria_filtro}`, form.preco_min && `preço ≥ R$${form.preco_min}`, form.preco_max && `preço ≤ R$${form.preco_max}`, form.desconto_min && `desconto ≥ ${form.desconto_min}%`, form.rating_min && `avaliação ≥ ${form.rating_min}★`].filter(Boolean).join(' · ') || 'Nenhum (importar tudo)'}
                </div>
              )}
            </div>
          </div>

          {/* ─── AGENDAMENTO ─────────────────────────── */}
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-4">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-700">
              <Clock className="h-4 w-4" /> Configuração de Agendamento
            </p>

            {/* Frequência */}
            <div>
              <label className={labelClass}>Frequência</label>
              <select value={form.frequencia} onChange={(e) => setForm({ ...form, frequencia: e.target.value })} className={inputClass}>
                <option value="uma_vez">Uma única vez</option>
                <option value="diario">Diariamente</option>
                <option value="semanal">Semanalmente (escolher dias)</option>
                <option value="mensal">Mensalmente (mesmo dia todo mês)</option>
              </select>
            </div>

            {/* Dias da semana (só para semanal) */}
            {form.frequencia === 'semanal' && (
              <div>
                <label className={labelClass}>Dias da Semana</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {DIAS_SEMANA.map((d) => {
                    const active = (form.dias_semana as string[]).includes(d.key);
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => toggleDia(d.key)}
                        className={`h-9 w-11 rounded-xl text-xs font-bold border transition ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-neutral-600 border-neutral-200 hover:border-indigo-300'}`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Horários */}
            {form.frequencia !== 'uma_vez' && (
              <div>
                <label className={labelClass}>Horários de Execução</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="time"
                    value={novoHorario}
                    onChange={(e) => setNovoHorario(e.target.value)}
                    className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button type="button" onClick={addHorario} className="rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700 transition">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {(form.horarios as string[]).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(form.horarios as string[]).map((h: string) => (
                      <span key={h} className="flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">
                        <Clock className="h-3 w-3" /> {h}
                        <button type="button" onClick={() => removeHorario(h)} className="ml-1 text-indigo-400 hover:text-red-500 transition">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-neutral-400 mt-1">Adicione vários horários para que o robô execute mais de uma vez no mesmo dia.</p>
              </div>
            )}

            {/* Período */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}><Calendar className="inline h-3 w-3 mr-1" />Data de Início</label>
                <input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}><Calendar className="inline h-3 w-3 mr-1" />Data de Fim (opcional)</label>
                <input type="date" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} className={inputClass} />
                <p className="text-[10px] text-neutral-400 mt-1">Deixe em branco para rodar indefinidamente.</p>
              </div>
            </div>
          </div>

          {/* Sync ID */}
          <div>
            <label className={labelClass}>ID de Sincronização (SYNC_ID) *</label>
            <input value={form.sync_id} onChange={(e) => setForm({ ...form, sync_id: e.target.value })} placeholder="Ex: SHOPEE_TENIS" className={inputClass} />
            <p className="mt-1 text-[10px] text-neutral-400">Usado pelo sistema para saber quais produtos pertencem a esta automação, permitindo marcar como esgotado o que sumir da loja.</p>
          </div>

          {/* Webhook N8N */}
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-700">
                <Webhook className="h-4 w-4" /> URL do Webhook N8N (Preenchimento Automático)
              </p>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Automático</span>
            </div>
            <input
              value={form.n8n_webhook_url}
              onChange={(e) => setForm({ ...form, n8n_webhook_url: e.target.value })}
              placeholder="Ex: https://n8n.gsa.com.br/webhook/gsa-produtos-scraping"
              className={inputClass}
            />
            <p className="text-[10px] text-neutral-500 leading-relaxed">
              O sistema preenche este campo automaticamente com o webhook do fluxo mestre selecionado (Produtos ou Viagens). Só altere se desejar usar um fluxo N8N customizado.
            </p>
          </div>
        </div>


        <div className="mt-6 flex justify-end gap-3 border-t border-neutral-100 pt-4">
          <button onClick={() => setShowForm(false)} className="rounded-xl px-5 py-2.5 text-sm font-bold text-neutral-600 hover:bg-neutral-100">
            Cancelar
          </button>
          <button onClick={save} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">
            Salvar Automação
          </button>
        </div>
      </Modal>

      {/* Modal de Configuração Global do Servidor N8N */}
      {showN8nConfig && (
        <Modal isOpen={showN8nConfig} onClose={() => setShowN8nConfig(false)} title="Configuração Global do Servidor N8N" size="md">
          <div className="space-y-4">
            <p className="text-xs text-neutral-600 leading-relaxed">
              Informe a URL base do seu servidor N8N (ex: <code>https://n8n.seu-dominio.com</code>). O sistema usará este endereço para construir automaticamente os webhooks de todas as automações de produtos e viagens!
            </p>
            <div>
              <label className={labelClass}>URL Base do Servidor N8N *</label>
              <input
                type="url"
                value={n8nBaseUrl}
                onChange={(e) => setN8nBaseUrl(e.target.value)}
                placeholder="Ex: https://n8n.seu-dominio.com"
                className={inputClass}
              />
            </div>
            <div className="flex justify-end gap-3 border-t border-neutral-100 pt-4">
              <button onClick={() => setShowN8nConfig(false)} className="rounded-xl px-4 py-2 text-xs font-bold text-neutral-600 hover:bg-neutral-100">
                Cancelar
              </button>
              <button onClick={() => saveN8nBaseUrl(n8nBaseUrl)} className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700">
                Salvar e Atualizar Todas Automações
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal de Acompanhamento ao Vivo */}
      {showMonitor && monitorItem && (
        <ScrapingExecutionMonitorModal
          isOpen={showMonitor}
          onClose={() => setShowMonitor(false)}
          automacao={monitorItem}
          onReTrigger={() => triggerNow(monitorItem)}
        />
      )}
    </div>
  );
}
