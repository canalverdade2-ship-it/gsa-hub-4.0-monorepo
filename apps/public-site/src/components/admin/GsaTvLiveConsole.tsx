import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertTriangle, ArrowLeftToLine, ArrowRightToLine, CircleStop, Clapperboard,
  Clock3, History, Layers3, ListVideo, Pause, Play, RadioTower, RotateCcw, ShieldAlert,
  SkipBack, SkipForward,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { mutateGsaTvExtended } from '../../lib/gsaTvExtended';
import { sendGsaTvLiveCommand, type GsaTvLiveCommand } from '../../lib/gsaTvLiveControl';
import { getGsaTvLiveConsoleSnapshot, getGsaTvMediaPreviewUrl, getGsaTvPreviewUrl, type GsaTvLiveConsoleSnapshot } from '../../lib/gsaTvPreview';

type Props = {
  channel: any | null;
  media: any[];
  sources: any[];
  graphics: any[];
  watchdog?: any[];
  jobs?: any[];
  onChanged: () => Promise<void> | void;
};

const commandLabels: Record<GsaTvLiveCommand, string> = {
  stream_start: 'Iniciar transmissão', stream_pause: 'Pausar com continuidade', stream_resume: 'Retomar programação', stream_stop: 'Encerrar transmissão',
  playout_next: 'Próximo conteúdo', playout_previous: 'Conteúdo anterior', playout_reset: 'Sincronizar com a grade',
  live_take: 'Colocar fonte ao vivo no ar', live_return: 'Voltar à programação', media_take: 'Colocar mídia no ar', emergency_take: 'Acionar emergência', graphics_reload: 'Aplicar gráficos', live_badge_toggle: 'Alternar selo AO VIVO',
};

export function GsaTvLiveConsole({ channel, media, sources, graphics, watchdog = [], jobs = [], onChanged }: Props) {
  const [busy, setBusy] = useState('');
  const [selectedMedia, setSelectedMedia] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [graphicType, setGraphicType] = useState<'lower_third' | 'ticker' | 'bug' | 'breaking'>('lower_third');
  const [graphicText, setGraphicText] = useState('');
  const [onAirUrl, setOnAirUrl] = useState('');
  const [activeMediaUrl, setActiveMediaUrl] = useState('');
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [liveData, setLiveData] = useState<GsaTvLiveConsoleSnapshot | null>(null);
  const current = watchdog[0] || null;
  const pending = jobs.find((job) => job.status === 'pending' || job.status === 'running');
  const readyMedia = useMemo(() => media.filter((item) => (item.state === 'ready' || item.approval_state === 'approved') && item.approval_state !== 'rejected'), [media]);
  const liveSources = useMemo(() => sources.filter((source) => source.enabled !== false && source.connection_configured), [sources]);
  const quickGraphic = graphics.find((item) => item.name === 'Comando rápido ao vivo');
  const isSending = channel?.signal_state === 'sending';
  const youtubeConfirmed = liveData?.youtube?.confirmed === true;
  const isPaused = channel?.desired_state === 'paused' || channel?.playout_state === 'paused';
  const remainingSeconds = Math.max(0, Number(liveData?.playout?.remaining_sec ?? liveData?.playout?.remaining ?? 0));
  const activeMode = String(liveData?.stream?.mode || channel?.playout_state || 'program');
  const activeMediaId = activeMode.startsWith('media:') ? activeMode.slice('media:'.length) : '';
  const activeMedia = readyMedia.find((item) => item.id === activeMediaId);
  const activeSourceId = activeMode.includes('live:') ? activeMode.slice(activeMode.indexOf('live:') + 5) : '';
  const activeSource = liveSources.find((item) => item.id === activeSourceId);
  const activeTitle = activeMedia?.title || activeSource?.name || liveData?.playout?.media?.title || current?.current_title || (activeMode === 'paused' ? 'Continuidade GSA TV' : 'Programação GSA TV');
  const activeUrl = activeMediaUrl || (activeMode === 'program' ? onAirUrl : '');
  const activeOffset = activeMedia && liveData?.stream?.started_at ? Math.max(0, (Date.now() - new Date(liveData.stream.started_at).getTime()) / 1000) % Math.max(1, Number(activeMedia.duration_s || 1)) : 0;

  useEffect(() => {
    let active = true;
    void getGsaTvPreviewUrl().then((value) => { if (active) setOnAirUrl(value.url); }).catch(() => {});
    const refresh = async () => { try { const value = await getGsaTvLiveConsoleSnapshot(); if (active) setLiveData(value); } catch { /* snapshot principal permanece como fallback */ } };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    setMediaPreviewUrl('');
    if (selectedMedia) void getGsaTvMediaPreviewUrl(selectedMedia).then((value) => { if (active) setMediaPreviewUrl(value.url); }).catch((error) => toast.error(error instanceof Error ? error.message : 'Prévia indisponível.'));
    return () => { active = false; };
  }, [selectedMedia]);

  useEffect(() => {
    let active = true;
    setActiveMediaUrl('');
    if (activeMediaId) void getGsaTvMediaPreviewUrl(activeMediaId).then((value) => { if (active) setActiveMediaUrl(value.url); }).catch(() => {});
    return () => { active = false; };
  }, [activeMediaId]);

  const run = async (command: GsaTvLiveCommand, payload: Record<string, unknown> = {}) => {
    setBusy(command);
    try {
      await sendGsaTvLiveCommand(command, { channel_id: channel?.id || 'ch-main', ...payload });
      toast.success(`${commandLabels[command]}: comando enviado.`);
      window.setTimeout(() => void onChanged(), 1800);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível executar o comando.');
    } finally { setBusy(''); }
  };

  const applyQuickGraphic = async (enabled: boolean) => {
    if (enabled && !graphicText.trim()) return toast.error('Digite o texto que será exibido.');
    setBusy('graphics_reload');
    try {
      await mutateGsaTvExtended('save_graphic', {
        id: quickGraphic?.id,
        channel_id: channel?.id || 'ch-main',
        layer_type: enabled ? (graphicType === 'breaking' ? 'lower_third' : graphicType) : (quickGraphic?.layer_type || 'lower_third'),
        name: 'Comando rápido ao vivo',
        text_content: enabled ? graphicText.trim() : (quickGraphic?.text_content || ''),
        enabled,
        media_item_id: null,
        config: enabled && graphicType === 'breaking' ? { preset: 'breaking' } : {},
      });
      await sendGsaTvLiveCommand('graphics_reload', { channel_id: channel?.id || 'ch-main' });
      toast.success(enabled ? 'Gráfico enviado ao sinal.' : 'Gráfico retirado do sinal.');
      window.setTimeout(() => void onChanged(), 1800);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar o gráfico.');
    } finally { setBusy(''); }
  };

  return <div className="space-y-4" aria-busy={Boolean(busy)}>
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-white shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-indigo-300">Mesa de operação ao vivo</p><h2 className="mt-1 text-xl font-black">Controle mestre da GSA TV</h2></div>
        <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${youtubeConfirmed ? 'animate-pulse bg-rose-500' : isSending ? 'bg-amber-400' : 'bg-slate-500'}`} aria-hidden="true"/><strong className="text-xs uppercase">{youtubeConfirmed ? 'YouTube ao vivo' : isSending ? 'Relay enviando — não confirmado' : 'Sinal em espera'}</strong></div>
      </div>
      <div className="grid gap-px bg-white/10 lg:grid-cols-2">
        <div className="bg-slate-950 p-4"><PlayerHeader label={youtubeConfirmed ? 'NO AR' : 'SINAL LOCAL'} tone={youtubeConfirmed ? 'red' : 'indigo'} title={activeTitle}/>{activeUrl ? <BroadcastPlayer url={activeUrl} hls={activeMode === 'program'} muted startOffset={activeOffset}/> : <div className="flex aspect-video items-center justify-center rounded-xl border border-white/10 bg-black p-6 text-center text-sm text-slate-400">{activeSource ? `Fonte externa no ar: ${activeSource.name}` : 'Continuidade protegida em execução. O monitor exibe somente fontes autorizadas para prévia.'}</div>}</div>
        <div className="bg-slate-900 p-4"><PlayerHeader label="PRÉVIA" tone="indigo" title={readyMedia.find((item) => item.id === selectedMedia)?.title || liveSources.find((item) => item.id === selectedSource)?.name || 'Selecione uma mídia ou fonte'}/>{mediaPreviewUrl ? <BroadcastPlayer url={mediaPreviewUrl} controls/> : <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-white/20 bg-black/30 p-6 text-center text-sm text-slate-400">A mídia selecionada aparecerá aqui antes do TAKE. Fontes externas permanecem protegidas até o corte.</div>}</div>
      </div>
      <div className="grid gap-px border-t border-white/10 bg-white/10 sm:grid-cols-3"><LiveMetric label="Tempo restante" value={remainingSeconds ? formatDuration(remainingSeconds) : '—'}/><LiveMetric label="YouTube" value={youtubeConfirmed ? 'AO VIVO CONFIRMADO' : isSending ? 'NÃO CONFIRMADO' : 'SEM ENVIO'}/><LiveMetric label="Modo" value={liveData?.stream?.mode || channel?.playout_state || 'program'}/></div>
      <div aria-live="polite" className="border-t border-white/10 px-5 py-3 text-xs text-slate-400">{busy ? `${commandLabels[busy as GsaTvLiveCommand] || 'Comando'} em processamento…` : pending ? `Tarefa em andamento: ${pending.job_type}` : 'Mesa pronta para receber comandos.'}</div>
    </section>

    <section className="grid gap-4 xl:grid-cols-2">
      <ControlCard title="Programação e transmissão" icon={Clapperboard}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <CommandButton icon={SkipBack} label="Anterior" disabled={Boolean(busy)} onClick={() => run('playout_previous')}/>
          <CommandButton icon={SkipForward} label="Próximo" disabled={Boolean(busy)} onClick={() => run('playout_next')}/>
          <CommandButton icon={RotateCcw} label="Sincronizar" disabled={Boolean(busy)} onClick={() => run('playout_reset')}/>
          <CommandButton icon={Pause} label="Pausar" tone="warning" disabled={Boolean(busy) || isPaused} onClick={() => run('stream_pause')}/>
          <CommandButton icon={Play} label="Retomar" tone="success" disabled={Boolean(busy) || (!isPaused && isSending)} onClick={() => run('stream_resume')}/>
          <CommandButton icon={CircleStop} label="Encerrar" tone="danger" disabled={Boolean(busy) || !isSending} onClick={() => run('stream_stop')}/>
        </div>
        {!isSending && <button type="button" disabled={Boolean(busy)} onClick={() => run('stream_start')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white focus-visible:ring-2 focus-visible:ring-emerald-400"><Play className="h-4 w-4"/>Iniciar transmissão</button>}
      </ControlCard>

      <ControlCard title="Continuidade e emergência" icon={ShieldAlert}>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4"/>A emergência mantém o logo oficial no ar e substitui imediatamente o conteúdo atual.</div>
        <button type="button" disabled={Boolean(busy)} onClick={() => run('emergency_take')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-black text-white shadow-sm focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-50"><ShieldAlert className="h-5 w-5"/>EMERGÊNCIA — COLOCAR LOGO NO AR</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => run('live_return')} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 text-sm font-black focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50"><ArrowLeftToLine className="h-4 w-4"/>Voltar à grade publicada</button>
      </ControlCard>
    </section>

    <section className="grid gap-4 xl:grid-cols-2">
      <ControlCard title="Colocar mídia da biblioteca no ar" icon={Play}>
        <label className="block text-sm font-bold" htmlFor="gsa-tv-live-media">Mídia aprovada</label>
        <select id="gsa-tv-live-media" value={selectedMedia} onChange={(event) => setSelectedMedia(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"><option value="">Selecione uma mídia</option>{readyMedia.map((item) => <option key={item.id} value={item.id}>{item.title} — {item.duration_s}s</option>)}</select>
        <button type="button" disabled={Boolean(busy) || !selectedMedia} onClick={() => run('media_take', { media_item_id: selectedMedia })} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-40"><ArrowRightToLine className="h-4 w-4"/>TAKE — colocar mídia no ar</button>
      </ControlCard>

      <ControlCard title="Colocar fonte externa no ar" icon={RadioTower}>
        <label className="block text-sm font-bold" htmlFor="gsa-tv-live-source">Fonte conectada</label>
        <select id="gsa-tv-live-source" value={selectedSource} onChange={(event) => setSelectedSource(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"><option value="">Selecione uma fonte</option>{liveSources.map((source) => <option key={source.id} value={source.id}>{source.name} — {String(source.protocol).toUpperCase()}</option>)}</select>
        <button type="button" disabled={Boolean(busy) || !selectedSource} onClick={() => run('live_take', { source_id: selectedSource })} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40"><RadioTower className="h-4 w-4"/>TAKE — colocar fonte ao vivo</button>
      </ControlCard>
    </section>

    <ControlCard title="Gráfico rápido no sinal" icon={Layers3}>
      <div className="grid gap-3 lg:grid-cols-[220px_1fr_auto_auto] lg:items-end">
        <label className="text-sm font-bold">Formato<select value={graphicType} onChange={(event) => setGraphicType(event.target.value as typeof graphicType)} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2.5"><option value="lower_third">GC / tarja</option><option value="ticker">Ticker</option><option value="bug">Identificador</option><option value="breaking">Plantão</option></select></label>
        <label className="text-sm font-bold">Texto<input value={graphicText} onChange={(event) => setGraphicText(event.target.value)} maxLength={500} placeholder="Digite a informação que será exibida" className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2.5"/></label>
        <button type="button" disabled={Boolean(busy) || !graphicText.trim()} onClick={() => applyQuickGraphic(true)} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:opacity-40">COLOCAR NO AR</button>
        <button type="button" disabled={Boolean(busy) || !quickGraphic?.enabled} onClick={() => applyQuickGraphic(false)} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-black disabled:opacity-40">RETIRAR</button>
      </div>
    </ControlCard>

    <section className="grid gap-4 xl:grid-cols-2">
      <ControlCard title="Fila dos próximos materiais" icon={ListVideo}>
        <div className="space-y-2">
          {(liveData?.queue || []).length ? liveData!.queue.map((item, index) => <div key={item.id} className="grid grid-cols-[42px_1fr_auto] items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-xs font-black text-white">{index + 1}</span>
            <div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{item.title}</p><p className="text-xs text-slate-500">{item.block_type || 'programa'} · início {formatClock(item.planned_start_offset_s)}</p></div>
            <span className="text-xs font-bold tabular-nums text-slate-600">{formatDuration(Number(item.planned_duration_s || 0))}</span>
          </div>) : <EmptyState text="A grade publicada não possui outros materiais para hoje."/>}
        </div>
      </ControlCard>

      <ControlCard title="Histórico de comandos ao vivo" icon={History}>
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {(liveData?.history || []).length ? liveData!.history.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
            <div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{commandLabels[item.job_type as GsaTvLiveCommand] || item.job_type}</p><p className="text-xs text-slate-500">{formatDateTime(item.created_at)}{item.error_message ? ` · ${item.error_message}` : ''}</p></div>
            <StatusPill status={item.status}/>
          </div>) : <EmptyState text="Nenhum comando foi executado nesta transmissão."/>}
        </div>
      </ControlCard>
    </section>
  </div>;
}

function PlayerHeader({ label, tone, title }: { label: string; tone: 'red' | 'indigo'; title: string }) {
  return <div className="mb-3 flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className={`rounded-md px-2 py-1 text-[10px] font-black tracking-wider text-white ${tone === 'red' ? 'bg-rose-600' : 'bg-indigo-600'}`}>{label}</span><strong className="truncate text-sm">{title}</strong></div><Clock3 className="h-4 w-4 shrink-0 text-slate-500"/></div>;
}

function BroadcastPlayer({ url, hls = false, controls = false, muted = false, startOffset = 0 }: { url: string; hls?: boolean; controls?: boolean; muted?: boolean; startOffset?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;
    let instance: Hls | null = null;
    if ((hls || url.includes('.m3u8')) && Hls.isSupported()) {
      instance = new Hls({ liveSyncDurationCount: 2, lowLatencyMode: true });
      instance.loadSource(url);
      instance.attachMedia(video);
    } else video.src = url;
    const synchronize = () => { if (startOffset > 0 && Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(startOffset, Math.max(0, video.duration - 0.25)); void video.play().catch(() => {}); };
    video.addEventListener('loadedmetadata', synchronize, { once: true });
    void video.play().catch(() => {});
    return () => { video.removeEventListener('loadedmetadata', synchronize); instance?.destroy(); video.removeAttribute('src'); video.load(); };
  }, [hls, url]);
  return <video ref={videoRef} className="aspect-video w-full rounded-xl bg-black object-contain" controls={controls} muted={muted} autoPlay playsInline preload="metadata" aria-label={hls ? 'Sinal atualmente no ar' : 'Prévia da mídia selecionada'}/>;
}

function LiveMetric({ label, value }: { label: string; value: string }) {
  return <div className="bg-slate-950 px-5 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-sm font-black text-white">{value}</p></div>;
}

function EmptyState({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">{text}</div>; }

function StatusPill({ status }: { status: string }) {
  const style = status === 'completed' ? 'bg-emerald-100 text-emerald-800' : status === 'failed' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-900';
  const label = status === 'completed' ? 'Concluído' : status === 'failed' ? 'Falhou' : status === 'running' ? 'Executando' : 'Pendente';
  return <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ${style}`}>{label}</span>;
}

function formatDuration(total: number) {
  if (!Number.isFinite(total) || total <= 0) return '00:00';
  const seconds = Math.max(0, Math.floor(total));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function formatClock(offset: number) {
  const seconds = Math.max(0, Number(offset || 0));
  return `${String(Math.floor(seconds / 3600) % 24).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}`;
}

function formatDateTime(value?: string) { return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : '—'; }

function ControlCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 font-black"><span className="rounded-lg bg-indigo-50 p-2 text-indigo-700"><Icon className="h-4 w-4"/></span>{title}</h2>{children}</section>;
}

function CommandButton({ icon: Icon, label, tone = 'neutral', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ElementType; label: string; tone?: 'neutral' | 'warning' | 'success' | 'danger' }) {
  const colors = tone === 'danger' ? 'border-rose-200 bg-rose-50 text-rose-800' : tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-800';
  return <button type="button" {...props} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-3 py-2 text-xs font-black transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:translate-y-0 disabled:opacity-40 ${colors}`}><Icon className="h-5 w-5"/><span>{label}</span></button>;
}

export default GsaTvLiveConsole;
