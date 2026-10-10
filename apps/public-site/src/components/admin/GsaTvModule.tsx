import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BrainCircuit,
  Calendar,
  FileVideo,
  Loader2,
  RefreshCw,
  Settings,
  Tv2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../lib/adminRpc';
import { getGsaTvCredentialStatus, updateGsaTvCredentials, type GsaTvCredentialStatus } from '../../lib/gsaTvCredentials';
import { importGsaTvMediaFromUrl, uploadGsaTvMedia } from '../../lib/gsaTvMediaUpload';
import { GsaTvMasterControl } from './gsa-tv/GsaTvMasterControl';
import { GsaTvScheduleTab } from './gsa-tv/GsaTvScheduleTab';
import { GsaTvLibraryTab } from './gsa-tv/GsaTvLibraryTab';
import { GsaTvAiStudioTab } from './gsa-tv/GsaTvAiStudioTab';
import { GsaTvSettingsTab } from './gsa-tv/GsaTvSettingsTab';
import { GsaTvOperations } from './gsa-tv/GsaTvOperations';
import { EMPTY_GSA_TV_EXTENDED, getGsaTvExtended, type GsaTvExtended } from '../../lib/gsaTvExtended';
import { getGsaTvLiveConsoleSnapshot, type GsaTvLiveConsoleSnapshot } from '../../lib/gsaTvPreview';

interface GsaTvModuleProps {
  colaboradorId?: string;
  colaboradorNome?: string | null;
  adminType?: 'admin' | 'colaborador';
}

export type TabType = 'master' | 'schedule' | 'library' | 'ai' | 'operations' | 'settings';
export type QualityProfile = '720p30' | '1080p30' | '1080p60';

export const PROFILES: Record<QualityProfile, { label: string; resolution: string; fps: number; bitrateKbps: number }> = {
  '720p30': { label: '720p30 HD', resolution: '1280×720', fps: 30, bitrateKbps: 4000 },
  '1080p30': { label: '1080p30 Full HD', resolution: '1920×1080', fps: 30, bitrateKbps: 6000 },
  '1080p60': { label: '1080p60 Full HD', resolution: '1920×1080', fps: 60, bitrateKbps: 8500 },
};

type Snapshot = {
  channel: any | null;
  media: any[];
  schedule: any[];
  playlists: any[];
  incidents: any[];
  jobs: any[];
  audit: any[];
  server_time?: string;
};

const EMPTY: Snapshot = {
  channel: null,
  media: [],
  schedule: [],
  playlists: [],
  incidents: [],
  jobs: [],
  audit: [],
};

const tabs: Array<{ id: TabType; label: string; icon: React.ElementType }> = [
  { id: 'master',   label: '🎛️ Central Master',      icon: Tv2 },
  { id: 'schedule', label: '📅 Grade & Programação',  icon: Calendar },
  { id: 'library',  label: '📁 Biblioteca de Mídia',  icon: FileVideo },
  { id: 'ai',       label: '✨ Estúdio IA',            icon: BrainCircuit },
  { id: 'operations', label: 'Operações',              icon: Wrench },
  { id: 'settings', label: '⚙️ Avançado & Técnico',   icon: Settings },
];

const msg = (e: unknown) => e instanceof Error ? e.message : String((e as any)?.message || e || 'Erro inesperado.');

function Badge({ value }: { value?: string }) {
  const v = String(value || 'desconhecido').toLowerCase();
  const color =
    v === 'online' || v === 'ao vivo' || v === 'pronto' || v === 'aprovado' || v === 'confirmado'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : v === 'relay' || v === 'alerta' || v === 'pausado'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-slate-100 text-slate-700 border-slate-200';
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${color}`}>
      {value || 'desconhecido'}
    </span>
  );
}

export function GsaTvModule(props: GsaTvModuleProps) {
  const [tab, setTab] = useState<TabType>('master');
  const [data, setData] = useState<Snapshot>(EMPTY);
  const [extended, setExtended] = useState<GsaTvExtended>(EMPTY_GSA_TV_EXTENDED);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [channel, setChannel] = useState<{ name: string; profile: QualityProfile; youtubeVideoId: string }>({
    name: '',
    profile: '720p30',
    youtubeVideoId: '',
  });

  const [rtmpServer, setRtmpServer] = useState('rtmp://a.rtmp.youtube.com/live2');
  const [streamKey, setStreamKey] = useState('');
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [credentialStatus, setCredentialStatus] = useState<GsaTvCredentialStatus | null>(null);
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [credentialSaving, setCredentialSaving] = useState(false);
  const [publicSignal, setPublicSignal] = useState<{ confirmed: boolean; state: string } | null>(null);

  const isAdmin = props.adminType === 'admin';

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [snapshot, ext] = await Promise.all([
        callAdminRpc<Snapshot>('gsa_admin_gsa_tv_snapshot'),
        getGsaTvExtended().catch(() => EMPTY_GSA_TV_EXTENDED),
      ]);
      setData(snapshot);
      setExtended(ext);
      if (snapshot.channel) {
        setChannel({
          name: snapshot.channel.name || '',
          profile: (snapshot.channel.quality_profile || '720p30') as QualityProfile,
          youtubeVideoId: snapshot.channel.config?.youtube_video_id || '',
        });
      }
    } catch (e) {
      setError(msg(e));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    let active = true;
    const fetchSignal = async () => {
      try {
        const snap = await getGsaTvLiveConsoleSnapshot();
        if (active && snap.youtube) {
          setPublicSignal({ confirmed: Boolean(snap.youtube.confirmed), state: snap.youtube.state || 'unknown' });
        }
      } catch {
        // Silencioso
      }
    };
    void fetchSignal();
    const interval = window.setInterval(fetchSignal, 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const loadCredentials = useCallback(async () => {
    if (!isAdmin) return;
    setCredentialLoading(true);
    try {
      const status = await getGsaTvCredentialStatus(data.channel?.id || 'ch-main');
      setCredentialStatus(status);
      setRtmpServer(status.rtmp_server || 'rtmp://a.rtmp.youtube.com/live2');
    } catch (e) {
      toast.error(msg(e));
    } finally {
      setCredentialLoading(false);
    }
  }, [data.channel?.id, isAdmin]);

  useEffect(() => {
    if (tab === 'settings' && isAdmin) void loadCredentials();
  }, [tab, isAdmin, loadCredentials]);

  const mutate = async (action: string, payload: Record<string, unknown>, success: string) => {
    setSaving(true);
    try {
      const res = await callAdminRpc<any>('gsa_admin_gsa_tv_mutate', { p_action: action, p_payload: payload });
      toast.success(success);
      await load(true);
      return res || true;
    } catch (e) {
      toast.error(msg(e));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveCredentials = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin) {
      toast.error('Somente administradores podem alterar as credenciais.');
      return;
    }
    const key = streamKey.trim();
    setCredentialSaving(true);
    try {
      const status = await updateGsaTvCredentials(data.channel?.id || 'ch-main', rtmpServer, key || undefined);
      setCredentialStatus(status);
      setRtmpServer(status.rtmp_server);
      setStreamKey('');
      setShowStreamKey(false);
      toast.success(key ? 'Credencial de transmissão atualizada.' : 'Servidor de transmissão atualizado.');
    } catch (e) {
      toast.error(msg(e));
    } finally {
      setCredentialSaving(false);
    }
  };

  const heartbeatAge = data.channel?.last_heartbeat_at
    ? Date.now() - new Date(data.channel.last_heartbeat_at).getTime()
    : Infinity;
  const heartbeatFresh = heartbeatAge < 120000;
  const relaySending = heartbeatFresh && data.channel?.status === 'online' && data.channel?.signal_state === 'sending';
  const onAir = relaySending && publicSignal?.confirmed === true;

  const enqueue = (jobType: string, payload: Record<string, unknown> = {}) =>
    mutate(
      'enqueue_job',
      { channel_id: data.channel?.id, job_type: jobType, payload },
      'Tarefa registrada. A conclusão será confirmada pelo serviço.',
    );

  const confirmCommand = (_message: string, jobType: string) => {
    void enqueue(jobType);
  };

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <section className="space-y-5">
      {/* ── CABEÇALHO DA GSA TV ───────────────────────────────────────────── */}
      <header className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="rounded-xl bg-indigo-500/20 p-3">
              <Tv2 className="h-6 w-6 text-indigo-300" />
            </div>
            <div>
              <h1 className="text-xl font-black">GSA TV — Central Operacional</h1>
              <p className="mt-1 text-sm text-slate-300">
                Programação validada, transmissão contínua 24h e estúdio integrado.
              </p>
            </div>
          </div>
          <button
            onClick={() => void load()}
            className="flex items-center gap-2 rounded-xl border border-white/20 px-3.5 py-2 text-xs font-bold transition hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar Dados
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Metric label="Canal">
            <div className="flex items-center gap-2">
              <strong>{data.channel?.name || 'GSA TV Principal'}</strong>
              <Badge value={onAir ? 'AO VIVO' : relaySending ? 'RELAY' : data.channel?.status} />
            </div>
          </Metric>
          <Metric label="Confirmação de Sinal">
            <strong className={onAir ? 'text-emerald-300' : relaySending || heartbeatFresh ? 'text-amber-300' : 'text-rose-300'}>
              {onAir
                ? 'YouTube confirmado AO VIVO'
                : relaySending
                ? 'Relay enviando — YouTube não confirmado'
                : heartbeatFresh
                ? 'Serviços operacionais'
                : 'Sinal em espera'}
            </strong>
          </Metric>
          <Metric label="Incidentes Abertos">
            <strong>{data.incidents.filter((x) => !x.resolved).length}</strong>
          </Metric>
        </div>
      </header>

      {/* Alerta de erro caso ocorra */}
      {error && (
        <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <XCircle className="h-5 w-5 shrink-0" />
          <div>
            <strong>Falha ao carregar a GSA TV.</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* ── BARRA DE 5 ABAS PRINCIPAIS ─────────────────────────────────────── */}
      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Seções da GSA TV">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition ${
              tab === id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {/* ── 1. CENTRAL MASTER ─────────────────────────────────────────────── */}
      {tab === 'master' && (
        <GsaTvMasterControl
          channel={data.channel}
          media={data.media}
          schedule={data.schedule}
          onChanged={() => load(true)}
          onOpenTab={(t) => setTab(t as TabType)}
        />
      )}

      {/* ── 2. GRADE & PROGRAMAÇÃO (PRÁTICA) ──────────────────────────────── */}
      {tab === 'schedule' && (
        <GsaTvScheduleTab
          channelId={data.channel?.id || 'ch-main'}
          schedule={data.schedule}
          media={data.media}
          onMutate={mutate}
          onRefresh={() => load(true)}
        />
      )}

      {/* ── 3. BIBLIOTECA DE MÍDIA (PRÁTICA) ──────────────────────────────── */}
      {tab === 'library' && (
        <GsaTvLibraryTab
          channelId={data.channel?.id || 'ch-main'}
          media={data.media}
          onUploadFile={async (file, title, kind, rights, qualityProfile) => {
            try {
              await uploadGsaTvMedia({ file, title, mediaKind: kind as any, rightsConfirmed: rights, qualityProfile });
              toast.success('Arquivo enviado com sucesso!');
              await load(true);
              return true;
            } catch (e) {
              toast.error(msg(e));
              return false;
            }
          }}
          onImportUrl={async (url, title, kind, rights, qualityProfile) => {
            try {
              await importGsaTvMediaFromUrl({ url, title, mediaKind: kind as any, rightsConfirmed: rights, qualityProfile });
              toast.success('Mídia importada com sucesso!');
              await load(true);
              return true;
            } catch (e) {
              toast.error(msg(e));
              return false;
            }
          }}
          onMutate={mutate}
          onRefresh={() => load(true)}
          onTakeMedia={async (mediaId) => {
            const ok = await mutate(
              'enqueue_job',
              { channel_id: data.channel?.id, job_type: 'media_take', payload: { media_item_id: mediaId } },
              'Comando TAKE enviado com sucesso!',
            );
            if (ok) setTab('master');
          }}
        />
      )}

      {/* ── 4. ESTÚDIO IA (PRÁTICO) ───────────────────────────────────────── */}
      {tab === 'ai' && (
        <GsaTvAiStudioTab
          channelId={data.channel?.id || 'ch-main'}
          onMutate={mutate}
          onRefresh={() => load(true)}
          onOpenTab={(t) => setTab(t as TabType)}
        />
      )}

      {tab === 'operations' && <GsaTvOperations audit={data.audit} refreshAudit={() => load(true)} />}

      {/* ── 5. AVANÇADO & TÉCNICO (ORGANIZADO EM SUB-ABAS) ─────────────────── */}
      {tab === 'settings' && (
        <GsaTvSettingsTab
          data={data}
          extended={extended}
          isAdmin={isAdmin}
          rtmpServer={rtmpServer}
          setRtmpServer={setRtmpServer}
          streamKey={streamKey}
          setStreamKey={setStreamKey}
          showStreamKey={showStreamKey}
          setShowStreamKey={setShowStreamKey}
          credentialStatus={credentialStatus}
          credentialLoading={credentialLoading}
          credentialSaving={credentialSaving}
          saveCredentials={saveCredentials}
          channel={channel}
          setChannel={setChannel}
          PROFILES={PROFILES}
          saving={saving}
          onMutate={mutate}
          onRefresh={() => load(true)}
          enqueue={enqueue}
          confirmCommand={confirmCommand}
          publicSignal={publicSignal}
        />
      )}
    </section>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default GsaTvModule;
