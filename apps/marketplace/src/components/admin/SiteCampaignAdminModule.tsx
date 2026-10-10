import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, BarChart3, BellRing, CalendarClock, CheckCircle2, Copy, Eye,
  History, ImagePlus, MousePointerClick, Pause, Pencil, Play, Plus,
  RefreshCw, Search, Trash2, X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../lib/adminRpc';
import { supabase } from '../../lib/supabase';
import { uploadFile, getPublicFileUrl } from '../../lib/storage';
import type {
  SiteCampaign, SiteCampaignAction, SiteCampaignAdminOverview, SiteCampaignAudience,
  SiteCampaignCategory, SiteCampaignDevice, SiteCampaignFormat,
  SiteCampaignFrequency, SiteCampaignPayload, SiteCampaignStatus,
  SiteCampaignTemplate,
} from '../../types/siteCampaigns';
import { useConfirm } from '../../hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useRealtimeSubscription } from '../../hooks/useRealtime';

const EMPTY: SiteCampaignAdminOverview = {
  campaigns: [], history: [], analytics: { by_device: [], by_page: [], by_day: [] },
  totals: { all: 0, draft: 0, scheduled: 0, active: 0, paused: 0, ended: 0, archived: 0, impressions: 0, clicks: 0, click_through_rate: 0 },
};
const CATEGORIES: Record<SiteCampaignCategory, string> = { announcement: 'Comunicado', promotion: 'Promoção', news: 'Novidade', alert: 'Alerta', maintenance: 'Manutenção', event: 'Evento', system_update: 'Atualização do sistema', institutional: 'Campanha institucional' };
const FORMATS: Record<SiteCampaignFormat, string> = { popup: 'Janela pop-up', top_bar: 'Faixa superior', inline_banner: 'Banner integrado', floating_card: 'Card flutuante', fullscreen: 'Tela inteira' };
const STATUSES: Record<SiteCampaignStatus, string> = { draft: 'Rascunho', scheduled: 'Agendada', active: 'Ativa', paused: 'Pausada', ended: 'Encerrada', archived: 'Arquivada' };
const TEMPLATES: Record<SiteCampaignTemplate, string> = { institutional_light: 'Institucional claro', institutional_dark: 'Institucional escuro', promotion: 'Promocional', alert: 'Alerta', maintenance: 'Manutenção', launch: 'Lançamento' };
const AUDIENCES: Record<SiteCampaignAudience, string> = { all: 'Todos os visitantes', guests: 'Visitantes não logados', authenticated: 'Usuários autenticados', clients: 'Clientes logados' };
const FREQUENCIES: Record<SiteCampaignFrequency, string> = { every_visit: 'Em todos os acessos', once_per_session: 'Uma vez por sessão', once_per_visitor: 'Uma vez por visitante', once_per_day: 'Uma vez por dia', interval_days: 'A cada quantidade de dias', until_click: 'Até clicar', until_close: 'Até fechar' };
const DEVICES: [SiteCampaignDevice, string][] = [['desktop', 'Computador'], ['tablet', 'Tablet'], ['mobile', 'Celular']];
const input = 'w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100';

const DEFAULT_FORM: SiteCampaignPayload = {
  internal_name: '', title: '', subtitle: '', body: '', category: 'announcement',
  format: 'popup', template: 'institutional_light', priority: 50, cta_label: '',
  cta_url: '', cta_target: '_self', secondary_cta_label: '', secondary_cta_url: '',
  image_desktop_url: '', image_mobile_url: '', image_alt: '', target_pages: ['*'],
  audience: 'all', devices: ['desktop', 'tablet', 'mobile'], starts_at: null, ends_at: null,
  frequency_model: 'once_per_session', frequency_value: 1, dismissible: true,
  dismiss_on_backdrop: true, dismiss_on_escape: true, auto_close_seconds: null,
};

type Tab = 'campaigns' | 'templates' | 'results' | 'history';

function message(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : fallback;
}
function dateTime(value?: string | null) {
  if (!value) return 'Não definido';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data inválida' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
function localDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value); if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function formFrom(c: SiteCampaign): SiteCampaignPayload {
  return {
    internal_name: c.internal_name, title: c.title, subtitle: c.subtitle || '', body: c.body || '',
    category: c.category, format: c.format, template: c.template, priority: c.priority,
    cta_label: c.cta_label || '', cta_url: c.cta_url || '', cta_target: c.cta_target,
    secondary_cta_label: c.secondary_cta_label || '', secondary_cta_url: c.secondary_cta_url || '',
    image_desktop_url: c.image_desktop_url || '', image_mobile_url: c.image_mobile_url || '', image_alt: c.image_alt || '',
    target_pages: c.target_pages?.length ? c.target_pages : ['*'], audience: c.audience,
    devices: c.devices?.length ? c.devices : ['desktop', 'tablet', 'mobile'], starts_at: c.starts_at || null,
    ends_at: c.ends_at || null, frequency_model: c.frequency_model, frequency_value: c.frequency_value || 1,
    dismissible: c.dismissible, dismiss_on_backdrop: c.dismiss_on_backdrop,
    dismiss_on_escape: c.dismiss_on_escape, auto_close_seconds: c.auto_close_seconds || null,
  };
}

function Box({ children, className = '' }: { children: ReactNode; className?: string; key?: string | number }) { return <div className={`rounded-2xl border border-neutral-200 bg-white shadow-sm ${className}`}>{children}</div>; }
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string; key?: string | number }) { return <label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-neutral-500">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-neutral-400">{hint}</span>}</label>; }
function Metric({ icon: Icon, label, value }: { icon: typeof BarChart3; label: string; value: string | number }) { return <Box className="p-4"><div className="flex items-center gap-2 text-neutral-400"><Icon className="h-4 w-4"/><span className="text-xs font-black uppercase">{label}</span></div><p className="mt-3 text-2xl font-black text-neutral-950">{value}</p></Box>; }
function Badge({ status }: { status: SiteCampaignStatus }) {
  const style: Record<SiteCampaignStatus, string> = { draft: 'bg-neutral-100 text-neutral-700', scheduled: 'bg-blue-100 text-blue-700', active: 'bg-emerald-100 text-emerald-700', paused: 'bg-amber-100 text-amber-800', ended: 'bg-slate-200 text-slate-700', archived: 'bg-stone-200 text-stone-600' };
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${style[status]}`}>{STATUSES[status]}</span>;
}
function Toggle({ label, checked, disabled, change }: { label: string; checked: boolean; disabled?: boolean; change: (v: boolean) => void }) { return <label className={`flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-semibold ${disabled ? 'opacity-50' : ''}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={e => change(e.target.checked)}/>{label}</label>; }

function Preview({ value }: { value: SiteCampaignPayload }) {
  const dark = value.template === 'institutional_dark';
  const surface = dark ? 'bg-[#111c2d] text-white' : value.template === 'alert' ? 'bg-[#fff2ef] text-[#572b22]' : value.template === 'promotion' ? 'bg-[#fff9e8] text-[#342817]' : 'bg-[#f7f4ed] text-[#172337]';
  return <Box className="sticky top-24 overflow-hidden p-4"><p className="mb-3 text-xs font-black uppercase tracking-[.18em] text-neutral-400">Pré-visualização · {FORMATS[value.format]}</p><div className={`overflow-hidden border shadow-xl ${surface}`}>{value.image_desktop_url && <img src={value.image_desktop_url} alt={value.image_alt || ''} className="aspect-[16/7] w-full object-cover"/>}<div className="p-5"><p className="text-[10px] font-black uppercase tracking-[.18em] opacity-70">{CATEGORIES[value.category]}</p><h3 className="mt-2 text-xl font-black">{value.title || 'Título da campanha'}</h3>{value.subtitle && <p className="mt-1 text-sm font-bold">{value.subtitle}</p>}<p className="mt-3 whitespace-pre-line text-sm leading-6 opacity-75">{value.body || 'O conteúdo será apresentado aqui antes da publicação.'}</p>{value.cta_label && <span className={`mt-4 inline-flex px-4 py-2 text-sm font-black ${dark ? 'bg-[#d7b870] text-[#111c2d]' : 'bg-[#172337] text-white'}`}>{value.cta_label}</span>}</div></div></Box>;
}

function Analytics({ title, keyLabel, rows }: { title: string; keyLabel: string; rows: SiteCampaignAdminOverview['analytics']['by_device'] }) {
  return <Box className="overflow-hidden"><h3 className="border-b border-neutral-200 px-4 py-3 font-black">{title}</h3><div className="max-h-[420px] overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-neutral-50 uppercase text-neutral-400"><tr><th className="px-4 py-2">{keyLabel}</th><th className="px-3 py-2">Exib.</th><th className="px-3 py-2">Cliques</th><th className="px-3 py-2">CTR</th></tr></thead><tbody className="divide-y divide-neutral-100">{rows.map(r => <tr key={r.key}><td className="max-w-[180px] truncate px-4 py-3 font-bold" title={r.key}>{r.key}</td><td className="px-3 py-3">{r.impressions}</td><td className="px-3 py-3">{r.clicks}</td><td className="px-3 py-3 font-black">{Number(r.click_through_rate || 0).toFixed(2)}%</td></tr>)}{!rows.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-neutral-400">Ainda não há dados.</td></tr>}</tbody></table></div></Box>;
}

export function SiteCampaignAdminModule() {
  const [overview, setOverview] = useState<SiteCampaignAdminOverview>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('campaigns');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | SiteCampaignStatus>('all');
  const [editing, setEditing] = useState<SiteCampaign | null | undefined>(undefined);
  const [form, setForm] = useState<SiteCampaignPayload>(DEFAULT_FORM);
  const [pages, setPages] = useState('*');
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');
  const [saving, setSaving] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'desktop' | 'mobile' | null>(null);
  const confirmHook = useConfirm();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await callAdminRpc<SiteCampaignAdminOverview>('gsa_admin_site_campaigns_overview');
      setOverview({ campaigns: Array.isArray(data?.campaigns) ? data.campaigns : [], history: Array.isArray(data?.history) ? data.history : [], analytics: { by_device: Array.isArray(data?.analytics?.by_device) ? data.analytics.by_device : [], by_page: Array.isArray(data?.analytics?.by_page) ? data.analytics.by_page : [], by_day: Array.isArray(data?.analytics?.by_day) ? data.analytics.by_day : [] }, totals: data?.totals || EMPTY.totals });
    } catch (error) { console.error(error); toast.error(message(error, 'Não foi possível carregar as campanhas.')); setOverview(EMPTY); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void callAdminRpc<{ allowed_actions?: SiteCampaignAction[] }>('gsa_admin_site_campaign_my_permissions')
      .then(permissions => setCanDelete(Array.isArray(permissions?.allowed_actions) && permissions.allowed_actions.includes('delete')))
      .catch(error => { console.error(error); setCanDelete(false); });
  }, []);

  useRealtimeSubscription([
    { table: 'system_settings', filter: 'key=eq.site_campaigns', onChange: () => void load(true), debounceMs: 300 },
    { table: 'site_campaigns', onChange: () => void load(true), debounceMs: 300 },
    { table: 'site_campaign_events', onChange: () => void load(true), debounceMs: 300 },
  ], [load]);

  const filtered = useMemo(() => overview.campaigns.filter(c => (status === 'all' || c.status === status) && (!search.trim() || `${c.internal_name} ${c.title} ${CATEGORIES[c.category]} ${FORMATS[c.format]}`.toLowerCase().includes(search.trim().toLowerCase()))), [overview.campaigns, search, status]);
  const set = <K extends keyof SiteCampaignPayload>(key: K, value: SiteCampaignPayload[K]) => setForm(v => ({ ...v, [key]: value }));
  const openNew = () => { setEditing(null); setForm(DEFAULT_FORM); setPages('*'); setStarts(''); setEnds(''); };
  const openEdit = (c: SiteCampaign) => { setEditing(c); setForm(formFrom(c)); setPages(c.target_pages.join('\n')); setStarts(localDate(c.starts_at)); setEnds(localDate(c.ends_at)); };
  const toggleDevice = (d: SiteCampaignDevice) => setForm(v => ({ ...v, devices: v.devices.includes(d) ? v.devices.filter(x => x !== d) : [...v.devices, d] }));

  const upload = async (file: File, variant: 'desktop' | 'mobile') => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast.error('Envie uma imagem JPG, PNG ou WebP.');
    if (file.size > 5 * 1024 * 1024) return toast.error('A imagem deve ter no máximo 5 MB.');
    setUploading(variant);
    try {
      const name = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
      const path = `campaigns/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${name}`;
      const __up = await uploadFile(file, 'gsa-site-campaigns', path);
      const publicUrl = __up.url ?? getPublicFileUrl(__up.path);
      const r2Path = __up.path;
      set(variant === 'desktop' ? 'image_desktop_url' : 'image_mobile_url', publicUrl);
      toast.success('Imagem enviada.');
    } catch (error) { toast.error(message(error, 'Não foi possível enviar a imagem.')); }
    finally { setUploading(null); }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const targetPages = pages.split(/[\n,]/).map(v => v.trim()).filter(Boolean);
    if (form.internal_name.trim().length < 3 || form.title.trim().length < 3) return toast.error('Informe nome interno e título público.');
    if (!targetPages.length || !form.devices.length) return toast.error('Selecione ao menos uma página e um dispositivo.');
    if (form.cta_label && !form.cta_url) return toast.error('Informe o destino do botão principal.');
    if (form.secondary_cta_label && !form.secondary_cta_url) return toast.error('Informe o destino do botão secundário.');
    if (starts && ends && new Date(ends) <= new Date(starts)) return toast.error('O encerramento deve ser posterior ao início.');
    setSaving(true);
    try {
      const payload: SiteCampaignPayload = { ...form, internal_name: form.internal_name.trim(), title: form.title.trim(), subtitle: form.subtitle?.trim() || null, body: form.body?.trim() || null, cta_label: form.cta_label?.trim() || null, cta_url: form.cta_url?.trim() || null, secondary_cta_label: form.secondary_cta_label?.trim() || null, secondary_cta_url: form.secondary_cta_url?.trim() || null, image_desktop_url: form.image_desktop_url?.trim() || null, image_mobile_url: form.image_mobile_url?.trim() || null, image_alt: form.image_alt?.trim() || null, target_pages: targetPages, starts_at: starts ? new Date(starts).toISOString() : null, ends_at: ends ? new Date(ends).toISOString() : null, frequency_value: form.frequency_model === 'interval_days' ? Math.max(1, Number(form.frequency_value || 1)) : form.frequency_value, auto_close_seconds: form.auto_close_seconds && form.auto_close_seconds > 0 ? form.auto_close_seconds : null };
      await callAdminRpc('gsa_admin_upsert_site_campaign', { p_campaign_id: editing?.id || null, p_payload: payload });
      toast.success(editing ? 'Campanha atualizada.' : 'Rascunho criado.'); setEditing(undefined); await load(true);
    } catch (error) { toast.error(message(error, 'Não foi possível salvar a campanha.')); }
    finally { setSaving(false); }
  };

  const changeStatus = async (c: SiteCampaign, action: 'publish' | 'pause' | 'resume' | 'end' | 'archive') => {
    if (action === 'archive') {
      const ok = await confirmHook.confirm({
        title: 'Arquivar campanha',
        message: `Arquivar “${c.internal_name}”?`,
        confirmLabel: 'Arquivar',
        cancelLabel: 'Cancelar'
      });
      if (!ok) return;
    }
    setWorking(c.id);
    try { await callAdminRpc('gsa_admin_set_site_campaign_status', { p_campaign_id: c.id, p_action: action }); toast.success('Situação atualizada.'); await load(true); }
    catch (error) { toast.error(message(error, 'Não foi possível atualizar a campanha.')); }
    finally { setWorking(null); }
  };
  const duplicate = async (c: SiteCampaign) => {
    setWorking(c.id);
    try { await callAdminRpc('gsa_admin_duplicate_site_campaign', { p_campaign_id: c.id }); toast.success('Cópia criada como rascunho.'); await load(true); }
    catch (error) { toast.error(message(error, 'Não foi possível duplicar.')); }
    finally { setWorking(null); }
  };
  const remove = async (campaign: SiteCampaign) => {
    if (!['draft', 'archived'].includes(campaign.status)) return;
    const confirmed = await confirmHook.confirm({
      title: 'Confirmar exclusão',
      message: `Excluir permanentemente “${campaign.internal_name}”?\n\nO histórico da exclusão permanecerá registrado para auditoria.`,
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;

    setDeleting(true);
    try {
      await callAdminRpc('gsa_admin_delete_site_campaign', { p_campaign_id: campaign.id });
      toast.success('Campanha excluída e ação registrada no histórico.');
      setEditing(undefined);
      await load(true);
    } catch (error) {
      console.error(error);
      toast.error(message(error, 'Não foi possível excluir a campanha.'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <Box className="p-12 text-center text-sm font-bold text-neutral-500">Carregando Central de Avisos e Campanhas...</Box>;

  return <section className="space-y-6">
    <ConfirmDialog {...confirmHook} />
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.2em] text-amber-700">Comunicação no site</p><h1 className="mt-1 text-2xl font-black">Central de Avisos e Campanhas</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-500">Comunicados, promoções e alertas com segmentação, agendamento, frequência, métricas e auditoria.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold"><RefreshCw className="h-4 w-4"/>Atualizar</button><button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-black text-white"><Plus className="h-4 w-4"/>Nova campanha</button></div></header>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric icon={BellRing} label="Campanhas" value={overview.totals.all}/><Metric icon={CheckCircle2} label="Ativas" value={overview.totals.active}/><Metric icon={CalendarClock} label="Agendadas" value={overview.totals.scheduled}/><Metric icon={Eye} label="Visualizações" value={overview.totals.impressions}/><Metric icon={MousePointerClick} label="CTR" value={`${Number(overview.totals.click_through_rate || 0).toFixed(2)}%`}/></div>
    <Box className="flex gap-2 overflow-x-auto p-2">{([['campaigns', BellRing, 'Campanhas'], ['templates', ImagePlus, 'Modelos visuais'], ['results', BarChart3, 'Resultados'], ['history', History, 'Histórico']] as const).map(([id, Icon, label]) => <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black ${tab === id ? 'bg-neutral-950 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}><Icon className="h-4 w-4"/>{label}</button>)}</Box>

    {tab === 'campaigns' && <div className="space-y-4"><Box className="grid gap-3 p-3 sm:grid-cols-[1fr_220px]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-neutral-400"/><input className={`${input} pl-10`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, título, categoria ou formato"/></div><select className={input} value={status} onChange={e => setStatus(e.target.value as 'all' | SiteCampaignStatus)}><option value="all">Todos os status</option>{Object.entries(STATUSES).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></Box><div className="space-y-3">{filtered.map(c => <Box key={c.id} className="p-5"><div className="flex flex-wrap justify-between gap-4"><div><div className="flex gap-2"><Badge status={c.status}/><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-black">Prioridade {c.priority}</span></div><h2 className="mt-3 text-lg font-black">{c.internal_name}</h2><p className="text-sm font-bold text-neutral-700">{c.title}</p><p className="mt-1 text-xs text-neutral-500">{CATEGORIES[c.category]} · {FORMATS[c.format]} · {AUDIENCES[c.audience]}</p></div><div className="grid min-w-[300px] grid-cols-4 gap-2 text-center">{[['Exibições', c.metrics?.impressions || 0], ['Pessoas', c.metrics?.unique_viewers || 0], ['Cliques', c.metrics?.clicks || 0], ['CTR', `${Number(c.metrics?.click_through_rate || 0).toFixed(2)}%`]].map(([l,v]) => <div key={String(l)} className="rounded-xl bg-neutral-50 p-2"><p className="text-[10px] font-black uppercase text-neutral-400">{l}</p><p className="mt-1 font-black">{v}</p></div>)}</div></div><div className="mt-4 grid gap-3 rounded-xl bg-neutral-50 p-4 text-sm sm:grid-cols-3"><div><b>Período</b><p>{dateTime(c.starts_at)}<br/>{c.ends_at ? `até ${dateTime(c.ends_at)}` : 'sem encerramento'}</p></div><div><b>Páginas</b><p className="break-words">{c.target_pages.join(', ')}</p></div><div><b>Frequência</b><p>{FREQUENCIES[c.frequency_model]}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => openEdit(c)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-black"><Pencil className="h-3.5 w-3.5"/>Editar</button><button disabled={working === c.id} onClick={() => void duplicate(c)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-black"><Copy className="h-3.5 w-3.5"/>Duplicar</button>{['draft','ended'].includes(c.status) && <button disabled={working === c.id} onClick={() => void changeStatus(c,'publish')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white"><Play className="h-3.5 w-3.5"/>Publicar</button>}{['active','scheduled'].includes(c.status) && <button disabled={working === c.id} onClick={() => void changeStatus(c,'pause')} className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-2 text-xs font-black text-amber-800"><Pause className="h-3.5 w-3.5"/>Pausar</button>}{c.status === 'paused' && <button disabled={working === c.id} onClick={() => void changeStatus(c,'resume')} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white"><Play className="h-3.5 w-3.5"/>Retomar</button>}{['active','scheduled','paused'].includes(c.status) && <button disabled={working === c.id} onClick={() => void changeStatus(c,'end')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-black text-red-700">Encerrar</button>}{c.status !== 'archived' && <button disabled={working === c.id} onClick={() => void changeStatus(c,'archive')} className="ml-auto inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-black text-neutral-500"><Archive className="h-3.5 w-3.5"/>Arquivar</button>}</div></Box>)}{!filtered.length && <Box className="p-12 text-center"><BellRing className="mx-auto h-8 w-8 text-neutral-300"/><p className="mt-3 font-black">Nenhuma campanha encontrada</p></Box>}</div></div>}

    {tab === 'templates' && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Object.entries(TEMPLATES).map(([id,label]) => <Box key={id} className="overflow-hidden"><div className={`h-28 ${id === 'institutional_dark' ? 'bg-[#111c2d]' : id === 'alert' ? 'bg-[#fff2ef]' : id === 'promotion' ? 'bg-[#fff4d6]' : id === 'maintenance' ? 'bg-[#edf4fb]' : id === 'launch' ? 'bg-[#f7effb]' : 'bg-[#f7f4ed]'}`}/><div className="p-5"><h3 className="font-black">{label}</h3><p className="mt-1 text-sm text-neutral-500">Estrutura institucional fixa, responsiva e sem liberdade para layouts fora do padrão GSA.</p><button onClick={() => { openNew(); set('template', id as SiteCampaignTemplate); }} className="mt-4 rounded-lg border px-3 py-2 text-xs font-black">Usar modelo</button></div></Box>)}</div>}
    {tab === 'results' && <div className="grid gap-4 xl:grid-cols-3"><Analytics title="Por dispositivo" keyLabel="Dispositivo" rows={overview.analytics.by_device}/><Analytics title="Por página" keyLabel="Página" rows={overview.analytics.by_page}/><Analytics title="Últimos dias" keyLabel="Data" rows={overview.analytics.by_day}/></div>}
    {tab === 'history' && <Box className="overflow-hidden"><div className="divide-y divide-neutral-100">{overview.history.map(h => <div key={h.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[180px_1fr_220px]"><p className="text-sm font-bold">{dateTime(h.created_at)}</p><div><p className="font-black">{h.campaign_name || 'Campanha removida'}</p><p className="text-sm text-neutral-500">{h.action}</p></div><p className="text-sm text-neutral-500">{h.actor_name || h.actor_type}</p></div>)}{!overview.history.length && <p className="p-10 text-center text-neutral-400">Ainda não há histórico.</p>}</div></Box>}

    {editing !== undefined && <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && setEditing(undefined)}><div role="dialog" aria-modal="true" className="max-h-[95vh] w-full max-w-6xl overflow-y-auto rounded-[2rem] bg-[#f7f6f3]"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-700">Central de Avisos e Campanhas</p><h2 className="text-xl font-black">{editing ? 'Editar campanha' : 'Nova campanha'}</h2></div><button onClick={() => setEditing(undefined)} className="rounded-xl border p-2"><X className="h-5 w-5"/></button></div><form onSubmit={save} className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_360px]"><div className="space-y-4">
      <Box className="space-y-4 p-5"><h3 className="font-black">1. Identificação e conteúdo</h3><div className="grid gap-4 sm:grid-cols-2"><Field label="Nome interno"><input className={input} maxLength={120} value={form.internal_name} onChange={e => set('internal_name', e.target.value)}/></Field><Field label="Categoria"><select className={input} value={form.category} onChange={e => set('category', e.target.value as SiteCampaignCategory)}>{Object.entries(CATEGORIES).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></Field></div><Field label="Título público"><input className={input} maxLength={160} value={form.title} onChange={e => set('title', e.target.value)}/></Field><Field label="Subtítulo"><input className={input} maxLength={220} value={form.subtitle || ''} onChange={e => set('subtitle', e.target.value)}/></Field><Field label="Descrição"><textarea className={input} rows={5} maxLength={1800} value={form.body || ''} onChange={e => set('body', e.target.value)}/></Field></Box>
      <Box className="space-y-4 p-5"><h3 className="font-black">2. Formato e identidade</h3><div className="grid gap-4 sm:grid-cols-3"><Field label="Formato"><select className={input} value={form.format} onChange={e => set('format', e.target.value as SiteCampaignFormat)}>{Object.entries(FORMATS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></Field><Field label="Modelo"><select className={input} value={form.template} onChange={e => set('template', e.target.value as SiteCampaignTemplate)}>{Object.entries(TEMPLATES).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></Field><Field label="Prioridade"><input  className={input} type="number" min={1} max={1000} value={form.priority} inputMode="numeric"
onChange={(e) => set('priority', Number(e.target.value))}/></Field></div></Box>
      <Box className="space-y-4 p-5"><h3 className="font-black">3. Imagens responsivas</h3><div className="grid gap-4 sm:grid-cols-2">{(['desktop','mobile'] as const).map(variant => <Field key={variant} label={`Imagem para ${variant === 'desktop' ? 'computador' : 'celular'}`}><input className={input} value={(variant === 'desktop' ? form.image_desktop_url : form.image_mobile_url) || ''} onChange={e => set(variant === 'desktop' ? 'image_desktop_url' : 'image_mobile_url', e.target.value)}/><label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-black"><ImagePlus className="h-4 w-4"/>{uploading === variant ? 'Enviando...' : 'Selecionar arquivo'}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading !== null} onChange={e => { const f=e.target.files?.[0]; if(f) void upload(f,variant); e.currentTarget.value=''; }}/></label></Field>)}</div><Field label="Texto alternativo"><input className={input} maxLength={180} value={form.image_alt || ''} onChange={e => set('image_alt',e.target.value)}/></Field></Box>
      <Box className="space-y-4 p-5"><h3 className="font-black">4. Botões e destinos</h3><div className="grid gap-4 sm:grid-cols-2"><Field label="Botão principal"><input className={input} value={form.cta_label || ''} onChange={e => set('cta_label',e.target.value)}/></Field><Field label="Destino principal"><input className={input} placeholder="/servicos ou https://..." value={form.cta_url || ''} onChange={e => set('cta_url',e.target.value)}/></Field><Field label="Botão secundário"><input className={input} value={form.secondary_cta_label || ''} onChange={e => set('secondary_cta_label',e.target.value)}/></Field><Field label="Destino secundário"><input className={input} value={form.secondary_cta_url || ''} onChange={e => set('secondary_cta_url',e.target.value)}/></Field></div><Field label="Abertura"><select className={input} value={form.cta_target} onChange={e => set('cta_target',e.target.value as '_self'|'_blank')}><option value="_self">Mesma página</option><option value="_blank">Nova aba para link externo</option></select></Field></Box>
      <Box className="space-y-4 p-5"><h3 className="font-black">5. Público e posicionamento</h3><div className="grid gap-4 sm:grid-cols-2"><Field label="Páginas" hint="Uma por linha: *, /, /servicos/*"><textarea className={input} rows={5} value={pages} onChange={e => setPages(e.target.value)}/></Field><div className="space-y-4"><Field label="Público"><select className={input} value={form.audience} onChange={e => set('audience',e.target.value as SiteCampaignAudience)}>{Object.entries(AUDIENCES).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></Field><div><p className="mb-2 text-xs font-black uppercase text-neutral-500">Dispositivos</p>{DEVICES.map(([v,l]) => <label key={v} className="mr-4 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={form.devices.includes(v)} onChange={() => toggleDevice(v)}/>{l}</label>)}</div></div></div></Box>
      <Box className="space-y-4 p-5"><h3 className="font-black">6. Agendamento e frequência</h3><div className="grid gap-4 sm:grid-cols-2"><Field label="Início"><input className={input} type="datetime-local" value={starts} onChange={e => setStarts(e.target.value)}/></Field><Field label="Encerramento"><input className={input} type="datetime-local" value={ends} onChange={e => setEnds(e.target.value)}/></Field><Field label="Frequência"><select className={input} value={form.frequency_model} onChange={e => set('frequency_model',e.target.value as SiteCampaignFrequency)}>{Object.entries(FREQUENCIES).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></Field>{form.frequency_model === 'interval_days' && <Field label="Intervalo em dias"><input  className={input} type="number" min={1} max={365} value={form.frequency_value || 1} inputMode="numeric"
onChange={(e) => set('frequency_value',Number(e.target.value))}/></Field>}<Field label="Fechamento automático (segundos)"><input  className={input} type="number" min={1} max={3600} value={form.auto_close_seconds || ''} inputMode="numeric"
onChange={(e) => set('auto_close_seconds',e.target.value ? Number(e.target.value) : null)}/></Field></div><div className="grid gap-2 sm:grid-cols-3"><Toggle label="Pode fechar" checked={form.dismissible} change={v => set('dismissible',v)}/><Toggle label="Clique fora" checked={form.dismiss_on_backdrop} disabled={!form.dismissible} change={v => set('dismiss_on_backdrop',v)}/><Toggle label="Tecla Esc" checked={form.dismiss_on_escape} disabled={!form.dismissible} change={v => set('dismiss_on_escape',v)}/></div></Box>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <div>{editing && canDelete && <button type="button" disabled={deleting || !['draft', 'archived'].includes(editing.status)} onClick={() => void remove(editing)} title={!['draft', 'archived'].includes(editing.status) ? 'Encerre e arquive a campanha antes de excluí-la.' : undefined} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-black text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45"><Trash2 className="h-4 w-4"/>{deleting ? 'Excluindo...' : 'Excluir campanha'}</button>}</div>
        <div className="flex gap-2"><button type="button" onClick={() => setEditing(undefined)} disabled={deleting} className="rounded-xl border bg-white px-5 py-3 text-sm font-black disabled:opacity-50">Cancelar</button><button type="submit" disabled={saving || deleting || uploading !== null} className="rounded-xl bg-neutral-950 px-6 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar rascunho'}</button></div>
      </div>
    </div><Preview value={form}/></form></div></div>}
  </section>;
}
