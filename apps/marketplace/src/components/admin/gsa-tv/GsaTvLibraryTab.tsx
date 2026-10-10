import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eraser,
  ExternalLink,
  FileVideo,
  Film,
  Filter,
  Layers,
  Loader2,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getGsaTvMediaPreviewUrl } from '../../../lib/gsaTvPreview';
import { deleteGsaTvMedia, enhanceGsaTvMediaQuality, QualityEnhancementProfile, API_BASE } from '../../../lib/gsaTvMediaUpload';

type Props = {
  channelId: string;
  media: any[];
  onUploadFile: (file: File, title: string, kind: string, rights: boolean, qualityProfile?: QualityEnhancementProfile) => Promise<boolean>;
  onImportUrl: (url: string, title: string, kind: string, rights: boolean, qualityProfile?: QualityEnhancementProfile) => Promise<boolean>;
  onMutate: (action: string, payload: Record<string, unknown>, successMsg: string) => Promise<boolean>;
  onRefresh: () => Promise<void> | void;
  onTakeMedia?: (mediaId: string) => Promise<void> | void;
};

export type EnhancingTaskInfo = {
  id: string;
  title: string;
  profile: QualityEnhancementProfile;
  progress: number;
  stage: string;
  stageIndex: number;
  startedAt: number;
};

const WATERMARK_ONLY_STAGES = [
  { label: 'Análise de fluxo e coordenadas da marca d\'água', pct: 25 },
  { label: 'Aplicação de inpainting espacial cirúrgico (Delogo)', pct: 60 },
  { label: 'Reconstrução de textura e renderização de vídeo limpo', pct: 85 },
  { label: 'Catalogação e atualização da prévia', pct: 98 },
];

const BROADCAST_1080P_STAGES = [
  { label: 'Análise de quadros e descompressão de fluxo', pct: 20 },
  { label: 'Limpeza cirúrgica de marca d\'água (se selecionada)', pct: 45 },
  { label: 'Equalização de contraste, nitidez broadcast e pretos de TV', pct: 70 },
  { label: 'Masterização de áudio 48 kHz estéreo (EBU R128)', pct: 88 },
  { label: 'Codificação final 1080p H.264 High Profile e catalogação', pct: 98 },
];

const AI_SUPER_RES_STAGES = [
  { label: 'Análise de quadros e descompressão de fluxo', pct: 15 },
  { label: 'Limpeza de marca d\'água e isolamento de elementos', pct: 40 },
  { label: 'Super-resolução neural de texturas para 1080p Full HD', pct: 65 },
  { label: 'Eliminação de blocos de compressão e ruído da internet', pct: 85 },
  { label: 'Codificação final 1080p H.264 High Profile e catalogação', pct: 98 },
];

function getStagesForProfile(profile: QualityEnhancementProfile) {
  if (profile === 'standard') return WATERMARK_ONLY_STAGES;
  if (profile === 'ai_super_res') return AI_SUPER_RES_STAGES;
  return BROADCAST_1080P_STAGES;
}

function getProfileDisplay(profile: QualityEnhancementProfile) {
  if (profile === 'standard') return { label: '🛡️ Manter Resolução (Apenas Limpeza)', color: 'text-emerald-600' };
  if (profile === 'ai_super_res') return { label: '🤖 IA Restauração 1080p', color: 'text-purple-600' };
  return { label: '✨ Master 1080p Pro', color: 'text-indigo-600' };
}

export function GsaTvLibraryTab({
  channelId,
  media,
  onUploadFile,
  onImportUrl,
  onMutate,
  onRefresh,
  onTakeMedia,
}: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'program' | 'advertising' | 'identity' | 'filler'>('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');

  // Form states
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaKind, setMediaKind] = useState<'program' | 'advertising' | 'identity' | 'filler'>('program');
  const [mediaRights, setMediaRights] = useState(true);
  const [qualityProfile, setQualityProfile] = useState<QualityEnhancementProfile>('1080p_pro');
  const [urlInput, setUrlInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Enhance Selection Modal
  const [enhancingItem, setEnhancingItem] = useState<any | null>(null);
  const [enhancingProfile, setEnhancingProfile] = useState<QualityEnhancementProfile>('standard');
  const [removeWatermark, setRemoveWatermark] = useState(true);
  
  // Background Active Tasks & Details Modal
  const [enhancingTasks, setEnhancingTasks] = useState<Record<string, EnhancingTaskInfo>>({});
  const [detailModalItem, setDetailModalItem] = useState<EnhancingTaskInfo | null>(null);

  // Preview Modal
  const [previewItem, setPreviewItem] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const filteredMedia = useMemo(() => {
    return media.filter((item) => {
      const matchSearch = (item.title || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchKind = kindFilter === 'all' || item.media_kind === kindFilter;
      return matchSearch && matchKind;
    });
  }, [media, searchTerm, kindFilter]);

  const stats = useMemo(() => {
    const totalDurationSeconds = media.reduce((acc, m) => acc + (Number(m.duration_s) || 0), 0);
    const totalHours = (totalDurationSeconds / 3600).toFixed(1);
    const readyCount = media.filter((m) => (m.state === 'ready' || m.approval_state === 'approved') && m.approval_state !== 'rejected').length;
    const aiCount = media.filter((m) => m.ai_generated).length;
    return { total: media.length, hours: totalHours, ready: readyCount, ai: aiCount };
  }, [media]);

  const handleOpenPreview = async (item: any) => {
    setPreviewItem(item);
    setPreviewLoading(true);
    try {
      const res = await getGsaTvMediaPreviewUrl(item.id);
      setPreviewUrl(res.url);
    } catch {
      setPreviewUrl('');
      toast.error('Não foi possível gerar a prévia do vídeo.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClosePreview = () => {
    setPreviewItem(null);
    setPreviewUrl('');
  };

  const handleSubmitUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (uploadMode === 'file') {
        if (!fileToUpload) {
          toast.error('Selecione um arquivo de vídeo.');
          return;
        }
        const fallbackTitle = fileToUpload.name ? fileToUpload.name.replace(/\.[^/.]+$/, '') : 'Novo Vídeo';
        const titleToSend = mediaTitle.trim() || fallbackTitle;
        const ok = await onUploadFile(fileToUpload, titleToSend, mediaKind, true, qualityProfile);
        if (ok) {
          setShowUploadModal(false);
          setFileToUpload(null);
          setMediaTitle('');
        }
      } else {
        if (!urlInput.trim()) {
          toast.error('Informe a URL direta do vídeo.');
          return;
        }
        const titleToSend = mediaTitle.trim() || 'Mídia Importada';
        const ok = await onImportUrl(urlInput.trim(), titleToSend, mediaKind, true, qualityProfile);
        if (ok) {
          setShowUploadModal(false);
          setUrlInput('');
          setMediaTitle('');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEnhanceMedia = () => {
    if (!enhancingItem) return;
    const itemToEnhance = enhancingItem;
    const profileToEnhance = enhancingProfile;
    const taskId = itemToEnhance.id;

    // 1. FECHA O MODAL IMEDIATAMENTE (requisito do usuário)
    setEnhancingItem(null);

    // 2. REGISTRA A TAREFA ATIVA
    const initialTask: EnhancingTaskInfo = {
      id: taskId,
      title: itemToEnhance.title,
      profile: profileToEnhance,
      progress: 10,
      stage: profileToEnhance === 'standard'
        ? 'Iniciando remoção cirúrgica de marca d\'água...'
        : 'Iniciando pipeline de aprimoramento 1080p...',
      stageIndex: 0,
      startedAt: Date.now(),
    };

    const currentStages = getStagesForProfile(profileToEnhance);
    setEnhancingTasks((prev) => ({ ...prev, [taskId]: initialTask }));
    toast.success(
      profileToEnhance === 'standard'
        ? 'Remoção de marca d\'água iniciada em segundo plano!'
        : 'Aprimoramento 1080p iniciado em segundo plano!'
    );

    // 3. ATUALIZADOR PROGRESSIVO ETAPA POR ETAPA
    let currentPct = 10;
    const progressTimer = setInterval(() => {
      if (currentPct < 92) {
        currentPct += 3;
        const currentStage = currentStages.find((s) => currentPct <= s.pct) || currentStages[currentStages.length - 1];
        const newStageIdx = currentStages.indexOf(currentStage);

        setEnhancingTasks((prev) => {
          if (!prev[taskId]) return prev;
          const updated = {
            ...prev[taskId],
            progress: Math.min(94, currentPct),
            stage: currentStage.label,
            stageIndex: Math.max(0, newStageIdx),
          };
          // Se o modal de detalhes estiver aberto para este item, sincroniza
          setDetailModalItem((cur) => (cur?.id === taskId ? updated : cur));
          return { ...prev, [taskId]: updated };
        });
      }
    }, 2800);

    // 4. EXECUTA O PROCESSAMENTO ASSÍNCRONO
    enhanceGsaTvMediaQuality(itemToEnhance.id, profileToEnhance, removeWatermark)
      .then((res) => {
        clearInterval(progressTimer);
        const finalTask: EnhancingTaskInfo = {
          id: taskId,
          title: itemToEnhance.title,
          profile: profileToEnhance,
          progress: 100,
          stage: '✅ Concluído com sucesso!',
          stageIndex: currentStages.length,
          startedAt: initialTask.startedAt,
        };
        setEnhancingTasks((prev) => ({ ...prev, [taskId]: finalTask }));
        setDetailModalItem((cur) => (cur?.id === taskId ? finalTask : cur));
        toast.success(res.message || 'Vídeo aprimorado com sucesso!');
        void onRefresh();

        setTimeout(() => {
          setEnhancingTasks((prev) => {
            const next = { ...prev };
            delete next[taskId];
            return next;
          });
        }, 4000);
      })
      .catch((e: any) => {
        clearInterval(progressTimer);
        const errorTask: EnhancingTaskInfo = {
          id: taskId,
          title: itemToEnhance.title,
          profile: profileToEnhance,
          progress: 0,
          stage: '❌ ' + (e.message || 'Erro no processamento'),
          stageIndex: 0,
          startedAt: initialTask.startedAt,
        };
        setEnhancingTasks((prev) => ({ ...prev, [taskId]: errorTask }));
        setDetailModalItem((cur) => (cur?.id === taskId ? errorTask : cur));
        toast.error(e.message || 'Erro ao aprimorar vídeo.');

        setTimeout(() => {
          setEnhancingTasks((prev) => {
            const next = { ...prev };
            delete next[taskId];
            return next;
          });
          void onRefresh();
        }, 6000);
      });
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Deseja realmente excluir "${title}" do catálogo e liberar o espaço em disco da VPS?`)) return;
    try {
      const res = await deleteGsaTvMedia(id);
      const freedInfo = res.freed_mb && res.freed_mb > 0 ? ` (${res.freed_mb} MB liberados no disco)` : '';
      toast.success(`Mídia e arquivos excluídos com sucesso${freedInfo}.`);
      await onRefresh();
    } catch (err: any) {
      console.warn('Fallback para exclusão com purga em segundo plano:', err);
      await onMutate('delete_media', { id, channel_id: channelId }, 'Mídia excluída (arquivos em processo de liberação).');
    }
  };

  return (
    <div className="space-y-6">
      {/* ── CABEÇALHO EXECUTIVO ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
            <Film className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">BIBLIOTECA DE MÍDIA</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-black text-slate-800">
                {stats.total} VÍDEOS ({stats.hours} HORAS)
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Acervo de Programas, Telejornais, Comerciais, Filmes e Vinhetas
            </p>
          </div>
        </div>

        {/* Botão de Adicionar */}
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white shadow transition hover:bg-slate-800"
        >
          <Upload className="h-4 w-4" />
          Adicionar Vídeo à VPS
        </button>
      </div>

      {/* ── MÉTRICAS DO ACERVO ────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-bold text-slate-500">Total no Catálogo</span>
          <p className="mt-1 text-2xl font-black text-slate-900">{stats.total} itens</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-bold text-slate-500">Horas de Conteúdo</span>
          <p className="mt-1 text-2xl font-black text-indigo-600">{stats.hours}h disponíveis</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-bold text-slate-500">Prontos para o Ar</span>
          <p className="mt-1 text-2xl font-black text-emerald-600">{stats.ready} aprovados</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-xs font-bold text-slate-500">Produzidos por IA</span>
          <p className="mt-1 text-2xl font-black text-purple-600">{stats.ai} edições</p>
        </div>
      </div>

      {/* ── BARRA DE PESQUISA & FILTROS ───────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        {/* Campo de Busca */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por título do vídeo..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2 text-xs font-semibold outline-none focus:border-indigo-500 focus:bg-white"
          />
        </div>

        {/* Filtros por Finalidade */}
        <div className="flex gap-1 overflow-x-auto text-xs font-bold">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'program', label: 'Programas' },
            { id: 'advertising', label: 'Comerciais' },
            { id: 'identity', label: 'Vinhetas' },
            { id: 'filler', label: 'Continuidade' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setKindFilter(tab.id as any)}
              className={`rounded-lg px-3 py-1.5 transition ${
                kindFilter === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── GALERIA DE CARDS DE VÍDEO ─────────────────────────────────────── */}
      {filteredMedia.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <FileVideo className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-2 text-sm font-bold text-slate-800">Nenhum vídeo encontrado</h3>
          <p className="mt-1 text-xs text-slate-500">Tente ajustar o termo de busca ou filtro acima.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredMedia.map((item) => {
            const durationMin = Math.round((Number(item.duration_s) || 0) / 60);
            const isReady = (item.state === 'ready' || item.approval_state === 'approved') && item.approval_state !== 'rejected';

            return (
              <div
                key={item.id}
                className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-indigo-300 hover:shadow-md"
              >
                {/* Topo / Capa do Card */}
                <div className="relative aspect-video w-full bg-slate-900 overflow-hidden flex items-center justify-center text-white">
                  <img
                    src={`${API_BASE}/media/${encodeURIComponent(item.id)}/thumbnail`}
                    alt={item.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-0">
                    <FileVideo className="h-10 w-10 text-slate-700" />
                  </div>
                  
                  {/* Badge de Duração */}
                  <div className="absolute bottom-2 right-2 rounded-md bg-black/80 px-2 py-0.5 text-[10px] font-black text-white">
                    {durationMin} min
                  </div>

                  {/* Badge de Tipo */}
                  <div className="absolute top-2 left-2">
                    <span className="rounded-md bg-slate-800/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-200">
                      {item.media_kind || 'programa'}
                    </span>
                  </div>

                  {/* Badge de Resolução / Qualidade */}
                  {item.video_width && (
                    <div className="absolute top-2 right-2 rounded-md bg-slate-950/80 border border-indigo-500/30 px-1.5 py-0.5 text-[9px] font-black text-indigo-300">
                      {item.video_width >= 3840 ? '💎 4K' : item.video_width >= 1920 ? '✨ 1080p' : '720p'}
                    </div>
                  )}

                  {/* Botão de Play / Preview Rápido */}
                  <button
                    onClick={() => void handleOpenPreview(item)}
                    className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-950 shadow-lg">
                      <Play className="h-5 w-5 ml-0.5" />
                    </div>
                  </button>
                </div>

                {/* Conteúdo do Card */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-black text-slate-900 line-clamp-2" title={item.title}>
                      {item.title}
                    </h3>
                    <p className="mt-1 text-[10px] text-slate-400 truncate">
                      {item.original_filename || item.drive_path || 'Arquivo local'}
                    </p>
                  </div>

                  {/* ── BARRA DE PROGRESSO AO VIVO NO CARD (ETAPA POR ETAPA) ── */}
                  {enhancingTasks[item.id] ? (
                    <div
                      onClick={() => setDetailModalItem(enhancingTasks[item.id])}
                      className="mt-3 cursor-pointer rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50 to-indigo-50 p-2.5 shadow-sm transition hover:border-amber-500 hover:shadow-md group/prog"
                      title="Clique para abrir os detalhes completos do andamento"
                    >
                      <div className="flex items-center justify-between text-[10px] font-black">
                        <span className="flex items-center gap-1.5 text-amber-900">
                          <Loader2 className="h-3 w-3 animate-spin text-amber-600" />
                          {enhancingTasks[item.id].profile === '1080p_pro' ? 'Aprimorando 1080p' : 'Super-Resolução 4K'}
                        </span>
                        <span className="font-mono text-indigo-700 font-bold">{enhancingTasks[item.id].progress}%</span>
                      </div>

                      {/* Barra de Progresso Animada */}
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 transition-all duration-700 ease-out"
                          style={{ width: `${enhancingTasks[item.id].progress}%` }}
                        />
                      </div>

                      <div className="mt-1.5 flex items-center justify-between text-[9px]">
                        <span className="text-slate-600 font-medium truncate max-w-[140px]">
                          {enhancingTasks[item.id].stage}
                        </span>
                        <span className="font-bold text-indigo-600 group-hover/prog:underline">Ver detalhes →</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-black uppercase ${
                          isReady ? 'text-emerald-600' : 'text-amber-600'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${isReady ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        {isReady ? 'Aprovado' : (item.state === 'processing' ? 'Processando' : item.state)}
                      </span>

                      <div className="flex items-center gap-1">
                        {isReady && (
                          <button
                            onClick={() => setEnhancingItem(item)}
                            className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-100 transition"
                            title="Aprimorar Qualidade (1080p / IA) ou Limpar Marca d'Água"
                          >
                            <Sparkles className="h-3 w-3 text-amber-500" /> IA
                          </button>
                        )}
                        {onTakeMedia && isReady && (
                          <button
                            onClick={() => onTakeMedia(item.id)}
                            className="flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700 hover:bg-red-100"
                            title="Disparar no Ar Imediatamente"
                          >
                            <Zap className="h-3 w-3" /> TAKE
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(item.id, item.title)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Excluir Mídia"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL DE PREVIEW DO VÍDEO ─────────────────────────────────────── */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-white">
              <span className="text-xs font-black uppercase tracking-wider truncate max-w-md">
                Prévia: {previewItem.title}
              </span>
              <button onClick={handleClosePreview} className="rounded-lg p-1 text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="relative aspect-video w-full bg-black">
              {previewLoading ? (
                <div className="flex h-full w-full items-center justify-center text-white">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                </div>
              ) : previewUrl ? (
                <video src={previewUrl} controls autoPlay className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400">
                  <AlertCircle className="h-8 w-8 text-amber-400" />
                  <p className="text-xs">Não foi possível carregar a prévia do vídeo.</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-white/10 bg-slate-900 px-5 py-3 text-white">
              <span className="text-xs text-slate-400">
                {Math.round((Number(previewItem.duration_s) || 0) / 60)} min • Formato compatível com playout
              </span>
              <button
                onClick={handleClosePreview}
                className="rounded-xl bg-white/10 px-4 py-1.5 text-xs font-bold hover:bg-white/20"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE UPLOAD / IMPORTAÇÃO ─────────────────────────────────── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">Adicionar Mídia à VPS</h3>
              <button onClick={() => setShowUploadModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                ✕
              </button>
            </div>

            {/* Alternador Arquivo vs Link */}
            <div className="mb-4 flex rounded-xl border border-slate-200 p-1 text-xs font-black">
              <button
                type="button"
                onClick={() => setUploadMode('file')}
                className={`flex-1 rounded-lg py-1.5 transition ${
                  uploadMode === 'file' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Enviar Arquivo do Computador
              </button>
              <button
                type="button"
                onClick={() => setUploadMode('url')}
                className={`flex-1 rounded-lg py-1.5 transition ${
                  uploadMode === 'url' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Importar por Link Direto
              </button>
            </div>

            <form onSubmit={handleSubmitUpload} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-slate-600">Título do Conteúdo (Opcional):</label>
                <input
                  type="text"
                  value={mediaTitle}
                  onChange={(e) => setMediaTitle(e.target.value)}
                  placeholder="Ex.: GSA News Especial (opcional, usa nome do arquivo)"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-slate-600">Finalidade do Vídeo:</label>
                <select
                  value={mediaKind}
                  onChange={(e) => setMediaKind(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
                >
                  <option value="program">Programa ou Conteúdo Oficial</option>
                  <option value="advertising">Peça Publicitária / Anunciante</option>
                  <option value="identity">Logo, Mosca ou Vinheta da TV</option>
                  <option value="filler">Preenchimento e Continuidade</option>
                </select>
              </div>

              {uploadMode === 'file' ? (
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-slate-600">Arquivo de Vídeo (MP4/WebM):</label>
                  <input
                    required
                    type="file"
                    accept="video/*"
                    onChange={(e) => setFileToUpload(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-xs file:font-bold file:text-slate-700 hover:file:bg-slate-200"
                  />
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase text-slate-600">Link Direto do Arquivo:</label>
                  <input
                    required
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://servidor.com/video.mp4"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">Deve ser link direto para arquivo MP4 ou WebM.</p>
                </div>
              )}

              {/* ── SELETOR DE TRATAMENTO DE QUALIDADE & IA ── */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase text-slate-700">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  Qualidade & Otimização de Imagem:
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setQualityProfile('1080p_pro')}
                    className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition ${
                      qualityProfile === '1080p_pro'
                        ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-900">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                      Master 1080p Pro
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      Super nitidez, cores ricas, preto ônix e áudio 48kHz (Recomendado).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQualityProfile('4k_pro')}
                    className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition ${
                      qualityProfile === '4k_pro'
                        ? 'border-purple-600 bg-purple-50/50 ring-1 ring-purple-600'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-900">
                      <span className="text-xs">💎</span>
                      Ultra 4K Pro
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      Upscaling Lanczos 3840x2160, 25 Mbps para telões e YouTube 4K.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQualityProfile('ai_super_res')}
                    className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition ${
                      qualityProfile === 'ai_super_res'
                        ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-900">
                      <span className="text-xs">🤖</span>
                      IA Super-Resolution
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      Reconstrução neural de textura e remoção mágica de compressão.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQualityProfile('standard')}
                    className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition ${
                      qualityProfile === 'standard'
                        ? 'border-slate-800 bg-slate-100 ring-1 ring-slate-800'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-900">
                      <Clock className="h-3.5 w-3.5 text-slate-600" />
                      Padrão Rápido
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      Mantém o arquivo como está, sem filtros adicionais.
                    </p>
                  </button>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t pt-4">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? 'Enviando...' : 'Enviar e Processar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL DE APRIMORAMENTO COM IA SOB DEMANDA ─────────────────────── */}
      {enhancingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                  <Sparkles className="h-4 w-4" />
                </div>
                <h3 className="text-base font-black text-slate-900">Aprimorar Vídeo com IA</h3>
              </div>
              <button
                onClick={() => setEnhancingItem(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <span className="text-[10px] font-bold uppercase text-slate-400">Mídia Selecionada:</span>
              <h4 className="text-xs font-black text-slate-800 truncate">{enhancingItem.title}</h4>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-600">
                <span>Resolução atual: <strong>{enhancingItem.video_width || 1280}x{enhancingItem.video_height || 720}</strong></span>
                <span>Duração: <strong>{Math.round((Number(enhancingItem.duration_s) || 0))}s</strong></span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase text-slate-600">Escolha o nível de aprimoramento:</label>

              {/* Opção 1: Padrão / Manter Resolução */}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                  enhancingProfile === 'standard'
                    ? 'border-emerald-600 bg-emerald-50/40 ring-1 ring-emerald-600'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="enh_profile"
                  checked={enhancingProfile === 'standard'}
                  onChange={() => setEnhancingProfile('standard')}
                  className="mt-0.5 text-emerald-600"
                />
                <div>
                  <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <span className="text-sm">🛡️</span> Manter Resolução Atual (Sem Alteração de Vídeo)
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Preserva a resolução e o tamanho original do arquivo. Ideal para apenas remover a marca d'água sem alterar a imagem.
                  </p>
                </div>
              </label>

              {/* Opção 2: Master 1080p Pro */}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                  enhancingProfile === '1080p_pro'
                    ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="enh_profile"
                  checked={enhancingProfile === '1080p_pro'}
                  onChange={() => setEnhancingProfile('1080p_pro')}
                  className="mt-0.5 text-indigo-600"
                />
                <div>
                  <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-600" /> Master 1080p Pro (Padrão TV Broadcast)
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Super nitidez nas bordas, pretos profundos de estúdio e áudio calibrado em 48 kHz (EBU R128). Fluido e sem travamentos.
                  </p>
                </div>
              </label>

              {/* Opção 3: IA Restauração 1080p */}
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                  enhancingProfile === 'ai_super_res'
                    ? 'border-purple-600 bg-purple-50/40 ring-1 ring-purple-600'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="enh_profile"
                  checked={enhancingProfile === 'ai_super_res'}
                  onChange={() => setEnhancingProfile('ai_super_res')}
                  className="mt-0.5 text-purple-600"
                />
                <div>
                  <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <span className="text-sm">🤖</span> IA Restauração 1080p (Super-Resolução & De-block)
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Reconstrução neural de textura e eliminação de blocos de compressão de vídeos da internet/celular para 1080p Full HD.
                  </p>
                </div>
              </label>
            </div>

            {/* Opção de Remoção de Marca de IA */}
            <div className="mt-4">
              <label className="flex items-start gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50/60 cursor-pointer hover:bg-amber-50 transition">
                <input
                  type="checkbox"
                  checked={removeWatermark}
                  onChange={(e) => setRemoveWatermark(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                    <Eraser className="h-3.5 w-3.5 text-amber-600" /> Remover Marca d'Água de IA (Canto Inferior)
                  </span>
                  <p className="text-[11px] text-amber-900/70 mt-0.5">
                    Aplica inpainting cirúrgico espacial para eliminar o selo/estrela de ferramentas como Veo, Google Flow e Gemini.
                  </p>
                </div>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEnhancingItem(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEnhanceMedia}
                className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition shadow-sm"
              >
                {enhancingProfile === 'standard' ? (
                  <>
                    <Eraser className="h-4 w-4 text-amber-400" /> Remover Marca d'Água
                  </>
                ) : removeWatermark ? (
                  <>
                    <Sparkles className="h-4 w-4 text-amber-400" /> Aprimorar & Remover Marca
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 text-amber-400" /> Iniciar Aprimoramento
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DE DETALHES DO ANDAMENTO (AO CLICAR NA BARRA DO CARD) ── */}
      {detailModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Andamento do Processamento com IA</h3>
                  <p className="text-[10px] text-slate-400">Processando na VPS em segundo plano</p>
                </div>
              </div>
              <button
                onClick={() => setDetailModalItem(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 p-3.5">
              <span className="text-[10px] font-bold uppercase text-slate-400">Vídeo em Processamento:</span>
              <h4 className="text-xs font-black text-slate-800 truncate">{detailModalItem.title}</h4>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-slate-600">
                  Perfil:{' '}
                  <strong className={getProfileDisplay(detailModalItem.profile).color}>
                    {getProfileDisplay(detailModalItem.profile).label}
                  </strong>
                </span>
                <span className="font-mono font-bold text-indigo-600">
                  {enhancingTasks[detailModalItem.id]?.progress || detailModalItem.progress}%
                </span>
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-indigo-600 transition-all duration-500"
                  style={{ width: `${enhancingTasks[detailModalItem.id]?.progress || detailModalItem.progress}%` }}
                />
              </div>
            </div>

            {/* Checklist de Etapas */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-bold uppercase text-slate-500">
                {detailModalItem.profile === 'standard'
                  ? 'Etapas da Limpeza de Marca d\'Água:'
                  : 'Etapas do Pipeline de Restauração 1080p:'}
              </span>
              {getStagesForProfile(detailModalItem.profile).map((st, idx, arr) => {
                const currentTask = enhancingTasks[detailModalItem.id] || detailModalItem;
                const isDone = currentTask.progress >= st.pct;
                const isCurrent = !isDone && (idx === 0 || (currentTask.progress >= arr[idx - 1].pct));

                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-2.5 rounded-xl text-xs transition ${
                      isDone
                        ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                        : isCurrent
                        ? 'bg-amber-50 text-amber-900 border border-amber-300 font-bold'
                        : 'text-slate-400 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : isCurrent ? (
                        <Loader2 className="h-4 w-4 animate-spin text-amber-600 shrink-0" />
                      ) : (
                        <div className="h-3 w-3 rounded-full border border-slate-300 shrink-0" />
                      )}
                      <span>{idx + 1}. {st.label}</span>
                    </div>
                    <span className="text-[10px] font-mono">
                      {isDone ? 'OK' : isCurrent ? 'Em execução' : 'Aguardando'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex items-center justify-between border-t pt-4">
              <span className="text-[10px] text-slate-400">
                Você pode fechar esta janela; o vídeo continuará processando normalmente.
              </span>
              <button
                onClick={() => setDetailModalItem(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Fechar Detalhes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GsaTvLibraryTab;
