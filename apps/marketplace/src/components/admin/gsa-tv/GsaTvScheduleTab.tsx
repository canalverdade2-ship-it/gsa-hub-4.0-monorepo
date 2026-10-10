import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Filter,
  Layers,
  Plus,
  Radio,
  RefreshCw,
  Sparkles,
  Trash2,
  Tv,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatDateTime } from '../../../lib/utils';
import { GsaTvProgrammingStudio } from './GsaTvProgrammingStudio';

type Props = {
  channelId: string;
  schedule: any[];
  media: any[];
  onMutate: (action: string, payload: Record<string, unknown>, successMsg: string) => Promise<boolean>;
  onRefresh: () => Promise<void> | void;
};

// Relógio editorial definitivo, igual de segunda a domingo. Não indica execução real.
const MASTER_GRADE = [
  { time: '06:00', title: 'Abertura oficial + GSA Em Fé', badge: 'Abertura e fé', icon: '✝️', durationMin: 30 },
  { time: '06:30', title: 'GSA Agro', badge: 'Agronegócio', icon: '🌾', durationMin: 45 },
  { time: '07:15', title: 'GSA Tempo', badge: 'Meteorologia', icon: '🌤️', durationMin: 15 },
  { time: '07:30', title: 'GSA Manhã News', badge: 'Jornalismo', icon: '🌅', durationMin: 30 },
  { time: '08:00', title: 'GSA Bem Viver', badge: 'Bem-estar', icon: '🌿', durationMin: 60 },
  { time: '09:00', title: 'GSA Tech', badge: 'Tecnologia', icon: '💻', durationMin: 30 },
  { time: '09:30', title: 'GSA Histórias da Bíblia', badge: 'Histórias bíblicas', icon: '📖', durationMin: 30 },
  { time: '10:00', title: 'GSA Cidadania', badge: 'Serviço', icon: '🤝', durationMin: 30 },
  { time: '10:30', title: 'GSA Business', badge: 'Negócios', icon: '💼', durationMin: 30 },
  { time: '11:00', title: 'GSA Sabor', badge: 'Gastronomia', icon: '🍳', durationMin: 60 },
  { time: '12:00', title: 'GSA Meio Dia News',     badge: 'Jornalismo',      icon: '☀️', durationMin: 30 },
  { time: '12:30', title: 'GSA Mercado',            badge: 'Economia',        icon: '💰', durationMin: 30 },
  { time: '13:00', title: 'GSA Desenhos', badge: 'Infantil', icon: '🎨', durationMin: 30 },
  { time: '13:30', title: 'GSA Planeta Terra', badge: 'Documentário', icon: '🌱', durationMin: 60 },
  { time: '14:30', title: 'GSA Destinos', badge: 'Viagens', icon: '🧳', durationMin: 60 },
  { time: '15:30', title: 'GSA Mundo', badge: 'Documentário', icon: '🌍', durationMin: 60 },
  { time: '16:30', title: 'GSA Hora da Palavra', badge: 'Espiritualidade', icon: '📖', durationMin: 30 },
  { time: '17:00', title: 'GSA Motor', badge: 'Automóveis', icon: '🚗', durationMin: 30 },
  { time: '17:30', title: 'GSA Tá na Rede', badge: 'Web', icon: '🌐', durationMin: 30 },
  { time: '18:00', title: 'GSA Esportes', badge: 'Esportes', icon: '⚽', durationMin: 60 },
  { time: '19:00', title: 'GSA News Noite', badge: 'Jornalismo', icon: '🌙', durationMin: 30 },
  { time: '19:30', title: 'GSA Cinema', badge: 'Cinema', icon: '🎬', durationMin: 30 },
  { time: '20:00', title: 'GSA Sessão Pipoca', badge: 'Filme integral e intervalos', icon: '🍿', durationMin: 120 },
  { time: '22:00', title: 'GSA Mistérios', badge: 'Documentário', icon: '🔎', durationMin: 60 },
  { time: '23:00', title: 'GSA Music', badge: 'Música', icon: '🎵', durationMin: 30 },
  { time: '23:30', title: 'GSA Em Fé', badge: 'Reflexão final', icon: '✝️', durationMin: 20 },
  { time: '23:50', title: 'Encerramento oficial da GSA TV', badge: 'Encerramento', icon: '🌙', durationMin: 9 },
];

export function GsaTvScheduleTab({
  channelId,
  schedule,
  media,
  onMutate,
  onRefresh,
}: Props) {
  const [activeSubTab, setActiveSubTab] = useState<'daily_grid' | 'custom_slots' | 'advanced'>('daily_grid');
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Formulário rápido de novo agendamento
  const [slot, setSlot] = useState({
    mediaId: '',
    start: '',
    end: '',
    type: 'program',
    titleOverride: '',
  });

  const readyMedia = useMemo(
    () => media.filter((x) => (x.state === 'ready' || x.approval_state === 'approved') && x.approval_state !== 'rejected'),
    [media],
  );

  const clockParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number);
  const currentMinute = clockParts[0] * 60 + clockParts[1];

  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slot.mediaId || !slot.start) {
      toast.error('Preencha a mídia e o horário de início.');
      return;
    }
    setSaving(true);
    try {
      const selectedMediaItem = readyMedia.find((m) => m.id === slot.mediaId);
      const durationSec = Number(selectedMediaItem?.duration_s) || 1800;
      const startDate = new Date(slot.start);
      const calculatedEnd = slot.end
        ? new Date(slot.end)
        : new Date(startDate.getTime() + durationSec * 1000);

      const ok = await onMutate(
        'save_slot',
        {
          channel_id: channelId,
          media_item_id: slot.mediaId,
          scheduled_start: startDate.toISOString(),
          scheduled_end: calculatedEnd.toISOString(),
          slot_type: slot.type,
          title_override: slot.titleOverride.trim() || undefined,
        },
        'Programação agendada com sucesso!',
      );
      if (ok) {
        setShowAddModal(false);
        setSlot({ mediaId: '', start: '', end: '', type: 'program', titleOverride: '' });
      }
    } catch {
      toast.error('Erro ao salvar agendamento.');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyMasterGrade = async () => {
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* ── CABEÇALHO EXECUTIVO ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">GRADE & PROGRAMAÇÃO</h2>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-black text-emerald-800">
                06H–23H59
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Segunda a domingo • Horário de Brasília • 27 faixas previstas. Produção reservada: 00h–05h59; preparação para transmissão: 05h59–06h.
            </p>
          </div>
        </div>

        {/* Botões de Ação Rápida */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleApplyMasterGrade()}
            className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-xs font-black text-indigo-700 transition hover:bg-indigo-100"
          >
            <Sparkles className="h-4 w-4" />
            Atualizar dados
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-black text-white shadow transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Novo Agendamento
          </button>
        </div>
      </div>

      {/* ── SELETOR DE VISUALIZAÇÃO PRÁTICO ───────────────────────────────── */}
      <div className="flex gap-2 border-b border-slate-200 pb-2 text-xs font-black uppercase tracking-wider">
        <button
          onClick={() => setActiveSubTab('daily_grid')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition ${
            activeSubTab === 'daily_grid'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Tv className="h-3.5 w-3.5" /> Grade definitiva (27 faixas)
        </button>
        <button
          onClick={() => setActiveSubTab('custom_slots')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition ${
            activeSubTab === 'custom_slots'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Clock className="h-3.5 w-3.5" /> Agendamentos do Sistema ({schedule.length})
        </button>
        <button
          onClick={() => setActiveSubTab('advanced')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-2 transition ${
            activeSubTab === 'advanced'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Layers className="h-3.5 w-3.5" /> Séries & Planejamento Editorial
        </button>
      </div>

      {/* Relógio editorial; somente a mesa master confirma o sinal efetivo. */}
      {activeSubTab === 'daily_grid' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Horários previstos, não confirmação de exibição ou de vídeos prontos. Abertura, vinhetas e intervalos estão incluídos nas faixas. Transmissão prevista para encerrar às 23h59.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {MASTER_GRADE.map((block, idx) => {
              const [hour, minute] = block.time.split(':').map(Number);
              const startMinute = hour * 60 + minute;
              const isCurrent = currentMinute >= startMinute && currentMinute < startMinute + block.durationMin;
              const isPast = currentMinute >= startMinute + block.durationMin;

              return (
                <div
                  key={idx}
                  className={`flex flex-col justify-between rounded-2xl border p-4 transition-all ${
                    isCurrent
                      ? 'border-red-500 bg-red-50/80 shadow-md ring-2 ring-red-500/20'
                      : isPast
                      ? 'border-slate-200 bg-slate-50/70 opacity-70'
                      : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-black ${isCurrent ? 'text-red-700' : 'text-slate-900'}`}>
                        {block.time}
                      </span>
                      <span className="text-xl">{block.icon}</span>
                    </div>
                    <h3 className="mt-2 text-xs font-black text-slate-900 line-clamp-2">
                      {block.title}
                    </h3>
                  </div>

                  <div className="mt-4 border-t border-slate-200/60 pt-2.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-slate-500">{block.badge}</span>
                      <span className="font-bold text-slate-400">{block.durationMin}m</span>
                    </div>
                    <div className="mt-2">
                      {isCurrent ? (
                        <span className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-red-600 py-1 text-[10px] font-black uppercase text-white shadow-sm">
                          <Clock className="h-3 w-3" /> FAIXA PREVISTA AGORA
                        </span>
                      ) : isPast ? (
                        <span className="inline-block w-full text-center text-[10px] font-bold text-slate-400">
                          Horário passado
                        </span>
                      ) : (
                        <span className="inline-block w-full text-center text-[10px] font-bold text-indigo-600">
                          Previsto na grade
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 2. AGENDAMENTOS PERSONALIZADOS DO BANCO ───────────────────────── */}
      {activeSubTab === 'custom_slots' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
              Slots Agendados no Playout
            </h3>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar Slot
            </button>
          </div>

          {schedule.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
              <Calendar className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-bold text-slate-700">Nenhum slot personalizado registrado</p>
              <p className="mt-1 text-xs text-slate-500">
                A transmissão contínua segue automaticamente a Grade Master 24h oficial.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow"
              >
                <Plus className="h-4 w-4" /> Criar Primeiro Slot
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {schedule.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                  <div>
                    <h4 className="font-bold text-slate-900">{item.title_override || item.media_title || 'Atração'}</h4>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(item.scheduled_start)} — {formatDateTime(item.scheduled_end)} •{' '}
                      <span className="font-semibold uppercase text-indigo-600">{item.slot_type}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
                      {item.state || 'agendado'}
                    </span>
                    <button
                      onClick={() => void onMutate('delete_slot', { id: item.id, channel_id: channelId }, 'Slot excluído.')}
                      className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                      title="Excluir Slot"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 3. PLANEJAMENTO EDITORIAL AVANÇADO (RECOLHIDO) ─────────────────── */}
      {activeSubTab === 'advanced' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <GsaTvProgrammingStudio channelId={channelId} media={media} />
        </div>
      )}

      {/* ── MODAL LIMPO DE NOVO AGENDAMENTO ───────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">Novo Agendamento na Grade</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSlot} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-slate-600">
                  Selecione a Mídia Pronta:
                </label>
                <select
                  required
                  value={slot.mediaId}
                  onChange={(e) => {
                    const newMediaId = e.target.value;
                    setSlot((prev) => {
                      const updated = { ...prev, mediaId: newMediaId };
                      if (newMediaId && prev.start && !prev.end) {
                        const sel = readyMedia.find((m) => m.id === newMediaId);
                        const dur = Number(sel?.duration_s) || 1800;
                        const st = new Date(prev.start);
                        if (!isNaN(st.getTime())) {
                          const endIso = new Date(st.getTime() + dur * 1000 - st.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                          updated.end = endIso;
                        }
                      }
                      return updated;
                    });
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-500 focus:bg-white"
                >
                  <option value="">-- Selecione uma atração pronta --</option>
                  {readyMedia.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} ({Math.round(m.duration_s / 60)} min)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold uppercase text-slate-600">
                      Início:
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        now.setSeconds(0, 0);
                        const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                        setSlot((prev) => {
                          const updated = { ...prev, start: iso };
                          if (prev.mediaId && !prev.end) {
                            const sel = readyMedia.find((m) => m.id === prev.mediaId);
                            const dur = Number(sel?.duration_s) || 1800;
                            const endIso = new Date(now.getTime() + dur * 1000 - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                            updated.end = endIso;
                          }
                          return updated;
                        });
                      }}
                      className="text-[10px] font-bold text-indigo-600 hover:underline"
                    >
                      Hoje Agora
                    </button>
                  </div>
                  <input
                    required
                    type="datetime-local"
                    value={slot.start}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      setSlot((prev) => {
                        const updated = { ...prev, start: newStart };
                        if (newStart && prev.mediaId && !prev.end) {
                          const sel = readyMedia.find((m) => m.id === prev.mediaId);
                          const dur = Number(sel?.duration_s) || 1800;
                          const st = new Date(newStart);
                          if (!isNaN(st.getTime())) {
                            const endIso = new Date(st.getTime() + dur * 1000 - st.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                            updated.end = endIso;
                          }
                        }
                        return updated;
                      });
                    }}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-slate-600">
                    Fim (Opcional - Automático):
                  </label>
                  <input
                    type="datetime-local"
                    value={slot.end}
                    onChange={(e) => setSlot({ ...slot, end: e.target.value })}
                    placeholder="Calculado pela duração do vídeo"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-slate-600">
                    Tipo do Bloco:
                  </label>
                  <select
                    value={slot.type}
                    onChange={(e) => setSlot({ ...slot, type: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
                  >
                    <option value="program">Programa Normal</option>
                    <option value="commercial">Comercial / Publicidade</option>
                    <option value="filler">Preenchimento / Continuidade</option>
                    <option value="live">Ao Vivo / Retransmissão</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-slate-600">
                    Título Personalizado (Opcional):
                  </label>
                  <input
                    type="text"
                    value={slot.titleOverride}
                    onChange={(e) => setSlot({ ...slot, titleOverride: e.target.value })}
                    placeholder="Ex.: Edição Especial de Domingo"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !readyMedia.length}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar e Validar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default GsaTvScheduleTab;
