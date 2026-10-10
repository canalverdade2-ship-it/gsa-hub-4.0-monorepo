import React, { useState } from 'react';
import {
  AlertTriangle,
  BadgeDollarSign,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  FileCheck2,
  KeyRound,
  Layers3,
  ListChecks,
  Loader2,
  RadioTower,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Tv2,
  Wrench,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatDateTime } from '../../../lib/utils';
import { GsaTvControlRoom } from '../GsaTvControlRoom';
import { GsaTvGraphics } from '../GsaTvGraphics';
import { GsaTvLiveConsole } from '../GsaTvLiveConsole';
import { GsaTvLiveSources } from '../GsaTvLiveSources';
import { GsaTvRights } from '../GsaTvRights';
import { GsaTvOperations } from './GsaTvOperations';

type QualityProfile = '720p30' | '1080p30' | '1080p60';

type Props = {
  data: any;
  extended: any;
  isAdmin: boolean;
  rtmpServer: string;
  setRtmpServer: (v: string) => void;
  streamKey: string;
  setStreamKey: (v: string) => void;
  showStreamKey: boolean;
  setShowStreamKey: (v: boolean | ((prev: boolean) => boolean)) => void;
  credentialStatus: any;
  credentialLoading: boolean;
  credentialSaving: boolean;
  saveCredentials: (e: React.FormEvent) => Promise<void>;
  channel: { name: string; profile: QualityProfile; youtubeVideoId: string };
  setChannel: React.Dispatch<React.SetStateAction<{ name: string; profile: QualityProfile; youtubeVideoId: string }>>;
  PROFILES: Record<QualityProfile, { label: string; resolution: string; fps: number; bitrateKbps: number }>;
  saving: boolean;
  onMutate: (action: string, payload: Record<string, unknown>, successMsg: string) => Promise<boolean>;
  onRefresh: () => Promise<void> | void;
  enqueue: (jobType: string, payload?: Record<string, unknown>) => Promise<boolean>;
  confirmCommand: (message: string, jobType: string) => void;
  publicSignal: any;
};

export function GsaTvSettingsTab({
  data,
  extended,
  isAdmin,
  rtmpServer,
  setRtmpServer,
  streamKey,
  setStreamKey,
  showStreamKey,
  setShowStreamKey,
  credentialStatus,
  credentialLoading,
  credentialSaving,
  saveCredentials,
  channel,
  setChannel,
  PROFILES,
  saving,
  onMutate,
  onRefresh,
  enqueue,
  confirmCommand,
  publicSignal,
}: Props) {
  const [activeSubTab, setActiveSubTab] = useState<'credentials' | 'playout' | 'graphics' | 'live' | 'audit'>('credentials');

  const heartbeatAge = data.channel?.last_heartbeat_at
    ? Date.now() - new Date(data.channel.last_heartbeat_at).getTime()
    : Infinity;
  const heartbeatFresh = heartbeatAge < 120000;
  const relaySending = heartbeatFresh && data.channel?.status === 'online' && data.channel?.signal_state === 'sending';
  const onAir = relaySending && publicSignal?.confirmed === true;

  return (
    <div className="space-y-6">
      {/* ── CABEÇALHO EXECUTIVO ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-slate-100 p-3 text-slate-700">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">AVANÇADO & TÉCNICO</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-black text-slate-700">
                ENGENHARIA & CONFIGURAÇÕES
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Credenciais RTMP, Controle Técnico do Playout, Gráficos e Diagnósticos
            </p>
          </div>
        </div>

        {/* Sub-navegação em Pílulas */}
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 p-1 text-xs font-black">
          {[
            { id: 'credentials', label: '🔑 Transmissão & YouTube' },
            { id: 'playout', label: '🎛️ Playout & Engenharia' },
            { id: 'graphics', label: '🎨 Gráficos' },
            { id: 'live', label: '📡 Fontes Externas' },
            { id: 'audit', label: '📋 Logs & Tarefas' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id as any)}
              className={`rounded-lg px-3 py-1.5 transition ${
                activeSubTab === t.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 1. TRANSMISSÃO & CREDENCIAIS ─────────────────────────────────── */}
      {activeSubTab === 'credentials' && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Configuração do Canal */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-slate-900">
              <Tv2 className="h-5 w-5 text-indigo-600" /> Configurações de Transmissão
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const p = PROFILES[channel.profile];
                void onMutate(
                  'update_channel',
                  {
                    channel_id: data.channel?.id,
                    name: channel.name,
                    quality_profile: channel.profile,
                    config: {
                      youtube_video_id: channel.youtubeVideoId,
                      fps: p.fps,
                      output_resolution: p.resolution.replace('×', 'x'),
                      video_bitrate_kbps: p.bitrateKbps,
                    },
                  },
                  'Canal atualizado com sucesso.',
                );
              }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-slate-600">Nome do Canal:</label>
                <input
                  required
                  value={channel.name}
                  onChange={(e) => setChannel({ ...channel, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-slate-600">Perfil de Qualidade:</label>
                <select
                  value={channel.profile}
                  onChange={(e) => setChannel({ ...channel, profile: e.target.value as QualityProfile })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
                >
                  {Object.entries(PROFILES).map(([id, p]) => (
                    <option key={id} value={id}>
                      {p.label} ({p.resolution} @ {p.fps}fps)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-slate-600">
                  ID Público do Vídeo no YouTube (Ao Vivo):
                </label>
                <input
                  value={channel.youtubeVideoId}
                  onChange={(e) => setChannel({ ...channel, youtubeVideoId: e.target.value.trim() })}
                  placeholder="Ex.: h93W7gyx-fk"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  É o código após v= na URL da live do YouTube (ex: youtube.com/watch?v=h93W7gyx-fk).
                </p>
              </div>

              <button
                disabled={saving}
                className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50"
              >
                Salvar Configurações do Canal
              </button>
            </form>
          </div>

          {/* Credenciais Seguras RTMP */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-slate-900">
              <KeyRound className="h-5 w-5 text-indigo-600" /> Credenciais RTMP Seguras
            </h3>

            {!isAdmin ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                <ShieldCheck className="mr-1 inline h-4 w-4" />
                Somente administradores podem visualizar e alterar as credenciais RTMP.
              </div>
            ) : credentialLoading ? (
              <div className="flex min-h-[160px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              </div>
            ) : (
              <form onSubmit={saveCredentials} className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-slate-600">Servidor RTMP:</label>
                  <input
                    required
                    value={rtmpServer}
                    onChange={(e) => setRtmpServer(e.target.value)}
                    placeholder="rtmp://a.rtmp.youtube.com/live2"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-slate-600">Chave de Transmissão:</label>
                  <div className="relative">
                    <input
                      type={showStreamKey ? 'text' : 'password'}
                      value={streamKey}
                      onChange={(e) => setStreamKey(e.target.value)}
                      placeholder={credentialStatus?.stream_key_configured ? '••••••••••••••••' : 'Cole a chave do YouTube'}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 pr-10 text-xs font-semibold outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStreamKey((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                    >
                      {showStreamKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div
                  className={`flex gap-2 rounded-xl p-3 text-xs ${
                    credentialStatus?.stream_key_configured
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                >
                  <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>
                      {credentialStatus?.stream_key_configured
                        ? 'Chave salva com segurança'
                        : 'Chave ainda não configurada'}
                    </strong>
                    <p className="text-[11px]">
                      A chave fica armazenada em cofre protegido na VPS e nunca é exposta no navegador.
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={credentialSaving}
                  className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50"
                >
                  {credentialSaving ? 'Salvando...' : 'Salvar Credenciais RTMP'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── 2. PLAYOUT & ENGENHARIA ───────────────────────────────────────── */}
      {activeSubTab === 'playout' && (
        <div className="space-y-6">
          {/* Ações Operacionais Seguras */}
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-black text-slate-900">Estado Técnico Confirmado</h3>
              <dl className="space-y-3 text-xs">
                <div className="flex justify-between border-b pb-2">
                  <dt className="text-slate-500">Transmissão:</dt>
                  <dd className="font-bold text-slate-900">{onAir ? 'AO VIVO' : relaySending ? 'RELAY' : 'PARADO'}</dd>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <dt className="text-slate-500">YouTube Público:</dt>
                  <dd className="font-bold text-emerald-600">{onAir ? 'Confirmado' : 'Aguardando'}</dd>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <dt className="text-slate-500">Último Heartbeat:</dt>
                  <dd className="font-bold text-slate-900">
                    {data.channel?.last_heartbeat_at ? formatDateTime(data.channel.last_heartbeat_at) : 'Nunca'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-black text-slate-900">Ações de Engenharia</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => confirmCommand('Iniciar envio do sinal ao YouTube?', 'stream_start')}
                  disabled={saving || data.channel?.signal_state === 'sending'}
                  className="rounded-xl border border-slate-200 p-2.5 font-bold hover:bg-slate-50 disabled:opacity-40"
                >
                  Iniciar Transmissão
                </button>
                <button
                  onClick={() => confirmCommand('Encerrar completamente o envio ao YouTube?', 'stream_stop')}
                  disabled={saving || data.channel?.signal_state === 'stopped'}
                  className="rounded-xl border border-rose-200 p-2.5 font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                >
                  Encerrar Transmissão
                </button>
                <button
                  onClick={() => void enqueue('health_check')}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 p-2.5 font-bold hover:bg-slate-50 disabled:opacity-40"
                >
                  Verificar Serviços
                </button>
                <button
                  onClick={() => void enqueue('playout_reload')}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 p-2.5 font-bold hover:bg-slate-50 disabled:opacity-40"
                >
                  Recarregar Playout
                </button>
              </div>
            </div>
          </div>

          {/* Sala de Controle Técnica */}
          <GsaTvControlRoom
            channel={data.channel}
            schedule={data.schedule}
            incidents={data.incidents}
            watchdog={extended.watchdog}
            execution={extended.execution}
          />
        </div>
      )}

      {/* ── 3. GRÁFICOS ───────────────────────────────────────────────────── */}
      {activeSubTab === 'graphics' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <GsaTvGraphics
            channelId={data.channel?.id || 'ch-main'}
            graphics={extended.graphics}
            media={data.media}
            onChanged={() => void onRefresh()}
            onApply={async () => {
              await enqueue('graphics_reload');
            }}
          />
        </div>
      )}

      {/* ── 4. FONTES AO VIVO ─────────────────────────────────────────────── */}
      {activeSubTab === 'live' && (
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <GsaTvLiveConsole
            channel={data.channel}
            media={data.media}
            sources={extended.live_sources}
            graphics={extended.graphics}
            watchdog={extended.watchdog}
            jobs={data.jobs}
            onChanged={() => void onRefresh()}
          />
          <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <summary className="cursor-pointer font-bold text-xs uppercase text-slate-700">
              Gerenciar Fontes Externas (RTMP / SRT)
            </summary>
            <div className="mt-3">
              <GsaTvLiveSources
                channelId={data.channel?.id || 'ch-main'}
                sources={extended.live_sources}
                saving={saving}
                onChanged={() => void onRefresh()}
                enqueue={enqueue}
              />
            </div>
          </details>
        </div>
      )}

      {/* ── 5. LOGS, TAREFAS & AUDITORIA ──────────────────────────────────── */}
      {activeSubTab === 'audit' && (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Fila de Tarefas */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
                <ListChecks className="h-4 w-4 text-indigo-600" /> Fila Operacional de Jobs
              </h3>
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {data.jobs.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">Nenhuma tarefa recente.</p>
                ) : (
                  data.jobs.slice(0, 15).map((x: any) => (
                    <div key={x.id} className="flex items-center justify-between py-2 text-xs">
                      <div>
                        <p className="font-bold text-slate-800">{x.job_type}</p>
                        <p className="text-[10px] text-slate-400">{formatDateTime(x.created_at)}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {x.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Incidentes */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" /> Incidentes
              </h3>
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {data.incidents.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-400">Nenhum incidente registrado.</p>
                ) : (
                  data.incidents.slice(0, 15).map((x: any) => (
                    <div key={x.id} className="flex items-center justify-between py-2 text-xs">
                      <div className="min-w-0 pr-2">
                        <p className="truncate font-bold text-slate-800">{x.message}</p>
                        <p className="text-[10px] text-slate-400">{formatDateTime(x.created_at)}</p>
                      </div>
                      {x.resolved ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          Resolvido
                        </span>
                      ) : (
                        <button
                          disabled={saving}
                          onClick={() => void onMutate('resolve_incident', { id: x.id, channel_id: data.channel?.id }, 'Incidente resolvido.')}
                          className="rounded-lg border px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50"
                        >
                          Resolver
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Manutenção do Sistema */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
              <Wrench className="h-4 w-4 text-indigo-600" /> Operações do Sistema
            </h3>
            <GsaTvOperations channelId={data.channel?.id || 'ch-main'} />
          </div>
        </div>
      )}
    </div>
  );
}

export default GsaTvSettingsTab;
