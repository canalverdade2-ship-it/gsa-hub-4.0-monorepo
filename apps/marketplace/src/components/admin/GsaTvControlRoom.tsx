import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Activity, CalendarClock, Radio, RefreshCw, ShieldCheck } from 'lucide-react';
import { getGsaTvPreviewUrl } from '../../lib/gsaTvPreview';
import { formatDateTime } from '../../lib/utils';

type Props = { channel: any | null; schedule: any[]; incidents: any[]; watchdog?: any[]; execution?: any[] };

export function GsaTvControlRoom({ channel, schedule, incidents, watchdog = [], execution = [] }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [lastPreviewAuth, setLastPreviewAuth] = useState<number | null>(null);
  const onAir = channel?.status === 'online' && channel?.signal_state === 'sending';
  const openIncidents = incidents.filter((item) => !item.resolved);
  const nextSlot = useMemo(() => schedule.find((item) => new Date(item.scheduled_end).getTime() > Date.now()), [schedule]);
  const lastWatch = watchdog[0] || null;
  const qualityOk = lastWatch ? !lastWatch.black_detected && !lastWatch.silence_detected && !lastWatch.freeze_detected : true;
  const hlsAge = Number(lastWatch?.hls_age_s ?? NaN);

  const loadPreview = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setPreviewLoading(true);
    try {
      const signed = await getGsaTvPreviewUrl();
      hlsRef.current?.destroy();
      hlsRef.current = null;
      if (Hls.isSupported()) {
        const hls = new Hls({ lowLatencyMode: true, backBufferLength: 30 });
        hlsRef.current = hls;
        hls.loadSource(signed.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) setPreviewError(`Preview interrompido: ${data.details}`);
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = signed.url;
      } else {
        throw new Error('Este navegador não oferece reprodução HLS.');
      }
      setLastPreviewAuth(Date.now());
      setPreviewError('');
      void video.play().catch(() => {});
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Não foi possível abrir o preview.');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPreview();
    const timer = window.setInterval(() => void loadPreview(), 12 * 60 * 1000);
    return () => { window.clearInterval(timer); hlsRef.current?.destroy(); };
  }, [loadPreview]);

  return <div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-4">
      <StatusCard label="Sinal" value={channel?.signal_state || 'stopped'} ok={onAir} icon={Radio} />
      <StatusCard label="Playout" value={channel?.playout_state || 'off_air'} ok={channel?.playout_state === 'program'} icon={Activity} />
      <StatusCard label="Incidentes" value={String(openIncidents.length)} ok={!openIncidents.length} icon={ShieldCheck} />
      <StatusCard label="Próximo bloco" value={nextSlot ? formatDateTime(nextSlot.scheduled_start) : 'Continuidade'} ok icon={CalendarClock} />
    </div>
    <div className="grid gap-3 md:grid-cols-4"><StatusCard label="Conteudo atual" value={lastWatch?.current_title || 'Continuidade'} ok={Boolean(lastWatch?.hls_ok ?? true)} icon={Activity} /><StatusCard label="HLS" value={Number.isFinite(hlsAge) ? `${hlsAge.toFixed(1)}s` : 'sem amostra'} ok={Boolean(lastWatch?.hls_ok ?? true) && (!Number.isFinite(hlsAge) || hlsAge < 15)} icon={Radio} /><StatusCard label="Video/audio" value={qualityOk ? 'normal' : 'anomalia'} ok={qualityOk} icon={ShieldCheck} /><StatusCard label="As-run" value={execution[0]?.title || execution[0]?.outcome || 'aguardando'} ok={Boolean(execution.length)} icon={CalendarClock} /></div>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">Prévia interna protegida</p><p className="text-sm text-slate-300">O mesmo HLS utilizado pelo relay da GSA TV.</p></div>
        <div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${onAir ? 'bg-red-500 text-white' : 'bg-amber-400 text-slate-950'}`}>{onAir ? 'NO AR' : 'STANDBY'}</span><button onClick={() => void loadPreview()} disabled={previewLoading} className="rounded-lg border border-white/20 p-2 hover:bg-white/10 disabled:opacity-50" aria-label="Recarregar preview"><RefreshCw className={`h-4 w-4 ${previewLoading ? 'animate-spin' : ''}`} /></button></div>
      </div>
      <div className="aspect-video bg-black"><video ref={videoRef} controls muted playsInline className="h-full w-full object-contain" /></div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-slate-400">
        <span>{previewError || 'Preview autorizado por URL temporária; o token não contém a credencial do YouTube.'}</span>
        <span>{lastPreviewAuth ? `Autorizado ${new Date(lastPreviewAuth).toLocaleTimeString('pt-BR')}` : 'Aguardando autorização'}</span>
      </div>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="mb-3 font-black">As-run recente</h3>{execution.length ? <div className="divide-y">{execution.slice(0,8).map((x:any)=><div key={x.id} className="flex items-center justify-between gap-3 py-2 text-sm"><div><strong>{x.title || 'Conteudo'}</strong><p className="text-xs text-slate-500">{x.started_at ? formatDateTime(x.started_at) : ''}{x.ended_at ? ` - ${formatDateTime(x.ended_at)}` : ''}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase">{x.outcome || 'on_air'}</span></div>)}</div> : <p className="text-sm text-slate-500">Nenhuma execucao registrada ainda.</p>}</div>
  </div>;
}

function StatusCard({ label, value, ok, icon: Icon }: { label: string; value: string; ok: boolean; icon: React.ElementType }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className={`rounded-xl p-3 ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><Icon className="h-5 w-5" /></div>
    <div className="min-w-0"><p className="text-xs text-slate-500">{label}</p><p className="truncate text-sm font-black uppercase text-slate-900">{value}</p></div>
  </div>;
}

export default GsaTvControlRoom;
