import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit2,
  Eye,
  FileVideo,
  Globe,
  Info,
  Link,
  Loader2,
  Maximize2,
  Pause,
  Play,
  Radio,
  RadioTower,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tv,
  Volume2,
  VolumeX,
  Zap,
  Megaphone,
  Timer,
  Layers,
  Plus,
  Trash2,
  PlayCircle,
  FastForward,
  Film,
  Upload,
  FolderOpen,
  Calendar,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../lib/supabase';
import { callAdminRpc } from '../../../lib/adminRpc';
import { sendGsaTvLiveCommand, type GsaTvLiveCommand } from '../../../lib/gsaTvLiveControl';
import {
  getGsaTvLiveConsoleSnapshot,
  getGsaTvMediaPreviewUrl,
  getGsaTvPreviewUrl,
  type GsaTvLiveConsoleSnapshot,
} from '../../../lib/gsaTvPreview';
import { mutateGsaTvExtended } from '../../../lib/gsaTvExtended';
import { updateGsaTvLiveSourceCredentials } from '../../../lib/gsaTvLiveSources';
import { importGsaTvMediaFromUrl } from '../../../lib/gsaTvMediaUpload';
import {
  analyzeUrlCopyright,
  type CopyrightAnalysisResult,
} from '../../../lib/gsaTvCopyrightAnalysis';
import {
  buildBreakPlaylist,
  formatSecondsToTime,
  CATEGORY_METADATA,
  DEFAULT_COMMERCIAL_SPOTS,
  type BreakDurationPreset,
  type CommercialSpot,
  type ActiveBreak,
  type ScheduledBreak,
  type SpotCategory,
  type SpotSourceType,
} from '../../../lib/gsaTvCommercialBreaks';

type Props = {
  channel: any | null;
  media: any[];
  schedule: any[];
  onChanged: () => Promise<void> | void;
  onOpenTab?: (tab: string) => void;
};

// ──────────────────────────────────────────────────────────────────────────────
// Tipos de transição disponíveis
// ──────────────────────────────────────────────────────────────────────────────
export type TransitionType = 'cut' | 'fade_black' | 'fade_white' | 'dissolve';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers para Links de Transmissão / Vídeos da Internet
// ──────────────────────────────────────────────────────────────────────────────
export type StreamProtocol = 'auto' | 'hls' | 'direct_video' | 'rtmp' | 'rtmps' | 'srt' | 'youtube';

export function extractYoutubeId(url: string): string | null {
  const clean = url.trim();
  const match = clean.match(/(?:v=|\/embed\/|\/watch\?v=|\/video\/|youtu\.be\/|\/live\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export function detectProtocol(url: string): 'hls' | 'direct_video' | 'rtmp' | 'rtmps' | 'srt' | 'youtube' {
  const clean = url.trim().toLowerCase();
  if (clean.includes('youtube.com/') || clean.includes('youtu.be/')) return 'youtube';
  if (clean.includes('.m3u8') || clean.includes('/hls/')) return 'hls';
  if (clean.startsWith('rtmp://')) return 'rtmp';
  if (clean.startsWith('rtmps://')) return 'rtmps';
  if (clean.startsWith('srt://')) return 'srt';
  return 'direct_video';
}

const TRANSITIONS: Array<{ id: TransitionType; label: string; icon: string; desc: string }> = [
  { id: 'cut',        label: 'Corte Seco',     icon: '⚡', desc: 'Troca imediata, sem efeito' },
  { id: 'fade_black', label: 'Fade ao Preto',  icon: '⬛', desc: 'Escurece e retorna (1.5s)' },
  { id: 'fade_white', label: 'Fade ao Branco', icon: '⬜', desc: 'Clareia e retorna (1.5s)' },
  { id: 'dissolve',   label: 'Dissolve',       icon: '🌊', desc: 'Fusão suave entre cenas (2s)' },
];

const DAILY_BLOCKS = [
  { time: '06:00', title: 'GSA Bem Viver',          badge: 'Saúde & Vida',    icon: '🏃' },
  { time: '07:00', title: 'GSA Em Fé',              badge: 'Espiritualidade', icon: '✝️' },
  { time: '07:25', title: 'GSA Tempo',               badge: 'Meteorologia',    icon: '☀️' },
  { time: '07:30', title: 'GSA Manhã News',         badge: 'Jornalismo',      icon: '🌅' },
  { time: '08:00', title: 'GSA Business',           badge: 'Negócios & Gestão',icon: '💼' },
  { time: '09:00', title: 'GSA Em Fé',              badge: 'Espiritualidade', icon: '✝️' },
  { time: '09:30', title: 'GSA Histórias da Bíblia', badge: 'Família & Fé',   icon: '📖' },
  { time: '10:00', title: 'GSA Cidadania',           badge: 'Utilidade Pública',icon: '⚖️' },
  { time: '11:00', title: 'GSA Destinos',           badge: 'Turismo & Viagem',icon: '✈️' },
  { time: '11:30', title: 'GSA Sabor',              badge: 'Gastronomia',     icon: '🍳' },
  { time: '11:55', title: 'GSA Tempo',               badge: 'Meteorologia',    icon: '☀️' },
  { time: '12:00', title: 'GSA Meio Dia News',      badge: 'Jornalismo',      icon: '☀️' },
  { time: '12:30', title: 'GSA Mercado',             badge: 'Economia & B3',   icon: '💰' },
  { time: '13:00', title: 'GSA Em Fé',              badge: 'Espiritualidade', icon: '✝️' },
  { time: '13:30', title: 'GSA Desenhos Clássicos', badge: 'Infantil Lúdico', icon: '🎨' },
  { time: '15:00', title: 'GSA Em Fé',              badge: 'Espiritualidade', icon: '✝️' },
  { time: '15:30', title: 'GSA Tech',               badge: 'Tecnologia & IA', icon: '💡' },
  { time: '16:30', title: 'GSA Planeta Terra',      badge: 'Natureza & Vida', icon: '🌍' },
  { time: '17:00', title: 'GSA Tá na Rede',         badge: 'Viral & Web',     icon: '🌐' },
  { time: '17:30', title: 'GSA Motor',               badge: 'Automotivo',      icon: '🚗' },
  { time: '18:00', title: 'GSA Music',              badge: 'Gospel & Louvor', icon: '🎵' },
  { time: '18:55', title: 'GSA Tempo',               badge: 'Meteorologia',    icon: '☀️' },
  { time: '19:00', title: 'GSA News Noite',         badge: 'Jornalismo Nobre',icon: '🌙' },
  { time: '19:30', title: 'GSA Mercado',             badge: 'Fechamento B3',   icon: '💰' },
  { time: '20:00', title: 'GSA Em Fé',              badge: 'Espiritualidade', icon: '✝️' },
  { time: '20:30', title: 'GSA Cidadania',          badge: 'Serviço Social',  icon: '⚖️' },
  { time: '21:00', title: 'GSA Music',              badge: 'Gospel & Louvor', icon: '🎵' },
  { time: '22:00', title: 'GSA Noites de Cinema',   badge: 'Filmes & Docs',   icon: '🍿' },
  { time: '23:00', title: 'GSA Em Fé',              badge: 'Espiritualidade', icon: '✝️' },
  { time: '23:30', title: 'GSA News Noturno',       badge: 'Jornalismo',      icon: '🌙' },
  { time: '00:00', title: 'GSA Sessão Pipoca — Madrugada', badge: 'Maratona Ouro', icon: '🌌' },
];

function MonitorFrame({
  label,
  badge,
  badgeColor,
  children,
}: {
  label: string;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-xl">
      <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/80 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${badgeColor ?? 'bg-slate-500'}`} />
          <span className="text-xs font-black uppercase tracking-widest text-slate-200">{label}</span>
        </div>
        {badge && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${badgeColor?.includes('red') ? 'bg-red-600/20 text-red-400' : 'bg-slate-700 text-slate-300'}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="relative aspect-video w-full bg-slate-950">{children}</div>
    </div>
  );
}

export function GsaTvMasterControl({ channel, media, onChanged, onOpenTab }: Props) {
  // Player de Programa (ao vivo — HLS VPS)
  const pgmVideoRef = useRef<HTMLVideoElement | null>(null);
  const pgmHlsRef = useRef<Hls | null>(null);

  // Player de Preview (ensaio de arquivo)
  const pvwVideoRef = useRef<HTMLVideoElement | null>(null);
  const pvwHlsRef = useRef<Hls | null>(null);

  const [pgmLoading, setPgmLoading] = useState(false);
  const [pgmError, setPgmError] = useState('');
  const [pgmMuted, setPgmMuted] = useState(true);

  const [pvwLoading, setPvwLoading] = useState(false);
  const [pvwError, setPvwError] = useState('');
  const [pvwMuted, setPvwMuted] = useState(true);

  const [liveData, setLiveData] = useState<GsaTvLiveConsoleSnapshot | null>(null);
  const [busy, setBusy] = useState('');
  const [takeMediaId, setTakeMediaId] = useState('');
  // Modo de seleção da atração: arquivo salvo na biblioteca, link de transmissão ou break comercial
  const [sourceMode, setSourceMode] = useState<'library' | 'url' | 'break'>('library');
  const [streamUrl, setStreamUrl] = useState('');
  const [streamTitle, setStreamTitle] = useState('');
  const [streamProtocol, setStreamProtocol] = useState<StreamProtocol>('auto');
  const [pvwUrlLoaded, setPvwUrlLoaded] = useState<string | null>(null);
  const [pvwYtId, setPvwYtId] = useState<string | null>(null);

  // Intervalos Comerciais (Breaks Master)
  const [breakPreset, setBreakPreset] = useState<BreakDurationPreset>('2min');
  const [commercialSpots, setCommercialSpots] = useState<CommercialSpot[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('gsa_tv_commercial_spots');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            // Elimina qualquer dado fictício anterior de testes
            const realOnly = parsed.filter(
              (s: any) =>
                !s.id?.startsWith('spot-') &&
                s.advertiser !== 'AgroTech Agronegócios' &&
                s.advertiser !== 'Central Corp' &&
                s.advertiser !== 'GSA TV Institucional' &&
                s.advertiser !== 'Ministério da Saúde / GSA TV' &&
                s.advertiser !== 'Senatran / Utilidade Pública' &&
                s.advertiser !== 'GSA TV Jornalismo' &&
                s.advertiser !== 'GSA TV Serviços' &&
                s.advertiser !== 'GSA TV Entretenimento' &&
                !s.title?.includes('AgroTech') &&
                !s.title?.includes('Central Serviços')
            );
            return realOnly;
          }
        }
      } catch (_) {}
    }
    return DEFAULT_COMMERCIAL_SPOTS;
  });
  const [activeBreak, setActiveBreak] = useState<ActiveBreak | null>(null);
  const [showSpotsManager, setShowSpotsManager] = useState(false);
  const [selectedSpotFilter, setSelectedSpotFilter] = useState<'all' | SpotCategory>('all');
  const [newSpotCategory, setNewSpotCategory] = useState<SpotCategory>('sponsor');
  const [newSpotTitle, setNewSpotTitle] = useState('');
  const [newSpotAdvertiser, setNewSpotAdvertiser] = useState('');
  const [newSpotDuration, setNewSpotDuration] = useState(30);
  const [newSpotUrl, setNewSpotUrl] = useState('');
  const [newSpotSourceType, setNewSpotSourceType] = useState<SpotSourceType>('url');
  const [newSpotLibraryId, setNewSpotLibraryId] = useState('');
  const [newSpotFileName, setNewSpotFileName] = useState('');
  const [newSpotFileObjUrl, setNewSpotFileObjUrl] = useState('');

  // Agendamento e Disparo Rápido de Comerciais
  const [scheduledBreaks, setScheduledBreaks] = useState<ScheduledBreak[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('gsa_tv_scheduled_breaks');
        if (saved) return JSON.parse(saved);
      } catch (_) {}
    }
    return [];
  });
  const [showQuickBreakModal, setShowQuickBreakModal] = useState(false);
  const [quickSelectedSpotId, setQuickSelectedSpotId] = useState<string>('');
  const [quickPreset, setQuickPreset] = useState<BreakDurationPreset>('2min');
  const [quickScheduleTime, setQuickScheduleTime] = useState<string>('');

  // Análise de Direitos Autorais e Content ID do YouTube
  const [copyrightAnalysis, setCopyrightAnalysis] = useState<CopyrightAnalysisResult | null>(null);
  const [isAnalyzingCopyright, setIsAnalyzingCopyright] = useState(false);
  const [copyrightAcknowledged, setCopyrightAcknowledged] = useState(false);
  const [showCopyrightDetails, setShowCopyrightDetails] = useState(false);

  const [transition, setTransition] = useState<TransitionType>('fade_black');
  const [generatingProgram, setGeneratingProgram] = useState('gsa-news');

  // Selo AO VIVO sob o logotipo da TV (Padrão de Emissora de Televisão)
  const [liveBadgeActive, setLiveBadgeActive] = useState(false);

  const fetchLiveBadgeStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('gsa_tv_graphics')
        .select('enabled')
        .eq('id', '70faed0c-f6b5-4b01-b80f-493bdbda6708')
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setLiveBadgeActive(Boolean(data.enabled));
      }
    } catch (error) {
      console.error('[GSA TV] Falha ao consultar o estado real do selo AO VIVO:', error);
    }
  }, []);

  useEffect(() => {
    void fetchLiveBadgeStatus();
    const interval = window.setInterval(fetchLiveBadgeStatus, 4000);
    return () => window.clearInterval(interval);
  }, [fetchLiveBadgeStatus]);

  const handleToggleLiveBadge = async () => {
    const nextState = !liveBadgeActive;
    setBusy('live_badge_toggle');
    try {
      toast.loading(nextState ? 'Ativando selo AO VIVO na transmissão...' : 'Desativando selo AO VIVO...', { id: 'live-badge' });
      await sendGsaTvLiveCommand('live_badge_toggle', {
        channel_id: channel?.id || 'ch-main',
        enabled: nextState,
      });
      await fetchLiveBadgeStatus();
      toast.success(nextState ? '🔴 Selo AO VIVO NO AR!' : 'Selo AO VIVO DESLIGADO da transmissão!', { id: 'live-badge' });
      window.setTimeout(() => void onChanged(), 1000);
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao alternar selo AO VIVO.', { id: 'live-badge' });
    } finally {
      setBusy('');
    }
  };

  const readyMedia = useMemo(
    () => media.filter((item) => item.state === 'ready' && item.rights_ok),
    [media],
  );

  const selectedMedia = useMemo(
    () => readyMedia.find((m) => m.id === takeMediaId) ?? null,
    [readyMedia, takeMediaId],
  );

  const isPaused = channel?.desired_state === 'paused' || channel?.playout_state === 'paused';
  const isSending = channel?.signal_state === 'sending';
  const onAir = isSending && !isPaused;

  const currentHour = new Date().getHours();
  const currentBlock = DAILY_BLOCKS.find((b) => parseInt(b.time.split(':')[0], 10) === currentHour);

  const activeTitle = liveData?.stream?.mode?.startsWith('media:')
    ? (readyMedia.find((m) => m.id === liveData?.stream?.mode?.slice(6))?.title ?? currentBlock?.title ?? 'Programa Oficial GSA')
    : isPaused
    ? 'Tela de Continuidade / Intervalo'
    : (currentBlock?.title ?? 'Programação Oficial GSA TV');

  // Persistir biblioteca de comerciais no localStorage
  useEffect(() => {
    try {
      localStorage.setItem('gsa_tv_commercial_spots', JSON.stringify(commercialSpots));
    } catch (_) {}
  }, [commercialSpots]);

  // Encerrar break e retomar programação
  const handleEndBreak = useCallback(async (isAuto = false) => {
    try {
      toast.loading(
        isAuto ? 'Break concluído! Retomando programação...' : 'Encerrando break antecipadamente...',
        { id: 'end-break' }
      );
      await sendGsaTvLiveCommand('stream_resume', {
        channel_id: channel?.id || 'ch-main',
        transition_type: 'dissolve',
        transition_duration_ms: 1500,
      });
      setActiveBreak(null);
      toast.success('Programação retomada no ar!', { id: 'end-break' });
    } catch (err: any) {
      toast.error(`Erro ao retomar programação: ${err?.message || err}`, { id: 'end-break' });
    }
  }, [channel?.id]);

  // Timer de contagem regressiva em tempo real para o break ativo
  useEffect(() => {
    if (!activeBreak) return;
    if (activeBreak.preset === 'continuous') return;

    const timer = setInterval(() => {
      setActiveBreak((prev) => {
        if (!prev) return null;
        const nextRemaining = prev.remaining_s - 1;
        if (nextRemaining <= 0) {
          clearInterval(timer);
          void handleEndBreak(true);
          return null;
        }

        // Calcular qual spot está no ar baseado no tempo transcorrido
        const elapsed = prev.totalDuration_s - nextRemaining;
        let accum = 0;
        let newSpotIdx = 0;
        for (let i = 0; i < prev.spots.length; i++) {
          accum += prev.spots[i].duration_s;
          if (elapsed < accum) {
            newSpotIdx = i;
            break;
          }
        }

        return {
          ...prev,
          remaining_s: nextRemaining,
          currentSpotIndex: newSpotIdx,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeBreak, handleEndBreak]);

  // Disparo direto de break (1 clique no card de intervalo)
  const handleDirectBreakTake = useCallback(
    async (preset: BreakDurationPreset) => {
      const playlist = buildBreakPlaylist(preset, commercialSpots, activeTitle);
      const breakLabel =
        preset === '1min'
          ? 'Break Rápido (1 min)'
          : preset === '2min'
          ? 'Break Padrão (2 min)'
          : preset === '3min'
          ? 'Break Completo (3 min)'
          : 'Cartela Contínua';

      setBusy('media_take');
      try {
        toast.loading(`Entrando no ${breakLabel}...`, { id: 'direct-break' });
        await sendGsaTvLiveCommand('stream_pause', {
          channel_id: channel?.id || 'ch-main',
          transition_type: transition,
          transition_duration_ms: transition === 'cut' ? 0 : 1500,
        });

        const totalSec = playlist.totalDuration_s;
        setActiveBreak({
          preset,
          title: breakLabel,
          totalDuration_s: totalSec,
          remaining_s: totalSec,
          spots: playlist.spots,
          currentSpotIndex: 0,
          startedAt: Date.now(),
        });

        toast.success(`${breakLabel} NO AR!`, { id: 'direct-break' });
      } catch (err: any) {
        toast.error(`Falha ao disparar break: ${err?.message || err}`, { id: 'direct-break' });
      } finally {
        setBusy('');
      }
    },
    [activeTitle, channel?.id, commercialSpots, transition]
  );

  // Upload de arquivo local de vídeo para a peça comercial
  const handleSpotFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    setNewSpotFileName(file.name);
    if (!newSpotTitle.trim()) {
      setNewSpotTitle(cleanName);
    }
    const blobUrl = URL.createObjectURL(file);
    setNewSpotFileObjUrl(blobUrl);

    try {
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = blobUrl;
      tempVideo.onloadedmetadata = () => {
        if (tempVideo.duration && !isNaN(tempVideo.duration) && tempVideo.duration > 0) {
          setNewSpotDuration(Math.min(180, Math.max(3, Math.round(tempVideo.duration))));
          toast.success(`Duração detectada: ${Math.round(tempVideo.duration)}s`);
        }
      };
    } catch (_) {}

    toast.success(`Arquivo "${file.name}" carregado com sucesso!`);
  };

  // Seleção de mídia salva na biblioteca da TV
  const handleSelectSpotFromLibrary = (mediaId: string) => {
    setNewSpotLibraryId(mediaId);
    const item = readyMedia.find((m) => m.id === mediaId);
    if (!item) return;

    if (!newSpotTitle.trim()) {
      setNewSpotTitle(item.title);
    }
    if (item.duration_s && item.duration_s > 0) {
      setNewSpotDuration(Math.min(180, Math.max(3, Math.round(item.duration_s))));
    }
    toast.success(`Vídeo "${item.title}" selecionado da biblioteca!`);
  };

  // Adicionar novo spot comercial (Link URL, Arquivo da Biblioteca ou Upload)
  const handleAddSpot = useCallback(() => {
    if (!newSpotTitle.trim()) {
      toast.error('Informe o título da peça publicitária.');
      return;
    }

    let finalVideoUrl: string | undefined = undefined;
    if (newSpotSourceType === 'url') {
      finalVideoUrl = newSpotUrl.trim() || undefined;
    } else if (newSpotSourceType === 'upload') {
      finalVideoUrl = newSpotFileObjUrl || undefined;
    } else if (newSpotSourceType === 'library') {
      const item = readyMedia.find((m) => m.id === newSpotLibraryId);
      finalVideoUrl = item?.storage_path || undefined;
    }

    const newSpot: CommercialSpot = {
      id: `spot-${Date.now()}`,
      title: newSpotTitle.trim(),
      advertiser: newSpotAdvertiser.trim() || 'Anunciante Parceiro',
      category: newSpotCategory,
      duration_s: Math.max(3, Number(newSpotDuration) || 30),
      sourceType: newSpotSourceType,
      videoUrl: finalVideoUrl,
      libraryMediaId: newSpotSourceType === 'library' ? newSpotLibraryId : undefined,
      fileName: newSpotSourceType === 'upload' ? newSpotFileName : undefined,
      active: true,
    };
    setCommercialSpots((prev) => [newSpot, ...prev]);
    setNewSpotTitle('');
    setNewSpotAdvertiser('');
    setNewSpotUrl('');
    setNewSpotLibraryId('');
    setNewSpotFileName('');
    setNewSpotFileObjUrl('');
    toast.success('Peça publicitária cadastrada na biblioteca da GSA TV!');
  }, [
    newSpotAdvertiser,
    newSpotCategory,
    newSpotDuration,
    newSpotFileName,
    newSpotFileObjUrl,
    newSpotLibraryId,
    newSpotSourceType,
    newSpotTitle,
    newSpotUrl,
    readyMedia,
  ]);

  // Alternar ativação de spot
  const handleToggleSpot = useCallback((id: string) => {
    setCommercialSpots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s))
    );
  }, []);

  // Excluir spot
  const handleDeleteSpot = useCallback((id: string) => {
    setCommercialSpots((prev) => prev.filter((s) => s.id !== id));
    toast.success('Peça removida da biblioteca.');
  }, []);

  // Limpar todas as peças da biblioteca
  const handleClearAllSpots = useCallback(() => {
    if (window.confirm('Deseja realmente excluir todas as peças publicitárias da biblioteca?')) {
      setCommercialSpots([]);
      try {
        localStorage.removeItem('gsa_tv_commercial_spots');
      } catch (_) {}
      toast.success('Biblioteca de peças publicitárias zerada.');
    }
  }, []);

  // Persistir breaks agendados no localStorage
  useEffect(() => {
    try {
      localStorage.setItem('gsa_tv_scheduled_breaks', JSON.stringify(scheduledBreaks));
    } catch (_) {}
  }, [scheduledBreaks]);

  // Monitorar horário para disparar breaks agendados no minuto marcado
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const dueBreak = scheduledBreaks.find((sb) => sb.time === currentHHMM);
      if (dueBreak && !activeBreak && !isPaused) {
        toast.success(`⏰ Executando break agendado para ${dueBreak.time}!`);
        setScheduledBreaks((prev) => prev.filter((x) => x.id !== dueBreak.id));
        void handleDirectBreakTake(dueBreak.preset);
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [activeBreak, handleDirectBreakTake, isPaused, scheduledBreaks]);

  // Agendar um novo break
  const handleScheduleBreak = (time: string, preset: BreakDurationPreset, spotTitle: string) => {
    if (!time.trim()) {
      toast.error('Informe o horário desejado para o intervalo.');
      return;
    }
    const newScheduled: ScheduledBreak = {
      id: `sched-${Date.now()}`,
      time: time.trim(),
      preset,
      spotTitle,
      createdAt: Date.now(),
    };
    setScheduledBreaks((prev) => [...prev, newScheduled]);
    setShowQuickBreakModal(false);
    toast.success(`Intervalo comercial agendado para às ${time}!`);
  };

  // Cancelar break agendado
  const handleCancelScheduledBreak = (id: string) => {
    setScheduledBreaks((prev) => prev.filter((x) => x.id !== id));
    toast.success('Agendamento de intervalo cancelado.');
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Carregar HLS de programa da VPS
  // ──────────────────────────────────────────────────────────────────────────
  const loadPgmHls = useCallback(async () => {
    const videoEl = pgmVideoRef.current;
    if (!videoEl) return;
    setPgmLoading(true);
    try {
      const signed = await getGsaTvPreviewUrl();
      if (pgmHlsRef.current) {
        pgmHlsRef.current.destroy();
        pgmHlsRef.current = null;
      }
      if (Hls.isSupported()) {
        const hls = new Hls({
          lowLatencyMode: true,
          liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 5,
          maxBufferLength: 6,
          maxMaxBufferLength: 10,
          backBufferLength: 4,
          // Retry fast on network errors
          fragLoadingMaxRetry: 6,
          manifestLoadingMaxRetry: 6,
          levelLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 1000,
          enableWorker: true,
        });
        pgmHlsRef.current = hls;
        hls.loadSource(signed.url);
        hls.attachMedia(videoEl);

        let mediaRecoveries = 0;
        let networkRecoveries = 0;

        hls.on(Hls.Events.ERROR, (_ev, data) => {
          // Non-fatal buffer hiccups — try to recover silently
          if (data.details === 'bufferAppendError' || data.details === 'bufferFullError') {
            try { hls.recoverMediaError(); } catch (_) {}
            return;
          }
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            if (mediaRecoveries < 4) {
              mediaRecoveries++;
              hls.recoverMediaError();
              return;
            }
          } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (networkRecoveries < 4) {
              networkRecoveries++;
              hls.startLoad();
              return;
            }
          }
          setPgmError(`HLS: ${data.details}`);
        });
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = signed.url;
      }
      setPgmError('');
      void videoEl.play().catch(() => {});
    } catch (err) {
      setPgmError(err instanceof Error ? err.message : 'Falha ao conectar HLS VPS.');
    } finally {
      setPgmLoading(false);
    }
  }, []);

  // Monitor de Preview — Carrega URL autorizada da mídia da VPS
  const loadPvwMedia = useCallback(
    async (mediaItem: any) => {
      const videoEl = pvwVideoRef.current;
      if (!videoEl) return;
      setPvwLoading(true);
      setPvwError('');
      try {
        if (pvwHlsRef.current) {
          pvwHlsRef.current.destroy();
          pvwHlsRef.current = null;
        }
        // Solicita URL assinada autorizada do backend
        const previewInfo = await getGsaTvMediaPreviewUrl(mediaItem.id);
        const src: string = previewInfo?.url || '';
        if (!src) {
          setPvwError('Mídia sem URL de preview disponível.');
          return;
        }
        if (src.includes('.m3u8') && Hls.isSupported()) {
          const hls = new Hls({ lowLatencyMode: false });
          pvwHlsRef.current = hls;
          hls.loadSource(src);
          hls.attachMedia(videoEl);
        } else {
          videoEl.src = src;
        }
        void videoEl.play().catch(() => {});
      } catch (err) {
        setPvwError(err instanceof Error ? err.message : 'Erro ao carregar prévia da mídia.');
      } finally {
        setPvwLoading(false);
      }
    },
    [],
  );

  // Análise de Direitos Autorais e Content ID do YouTube
  const runCopyrightAnalysis = useCallback(async (url: string) => {
    const clean = url.trim();
    if (!clean) {
      setCopyrightAnalysis(null);
      return;
    }
    setIsAnalyzingCopyright(true);
    try {
      const res = await analyzeUrlCopyright(clean);
      setCopyrightAnalysis(res);
      // Se o usuário ainda não digitou um título customizado, preenche com o título detectado
      if (res.title && res.title !== 'Transmissão no YouTube') {
        setStreamTitle((prev) => (prev.trim() ? prev : res.title));
      }
      if (res.riskLevel === 'low') {
        setCopyrightAcknowledged(true);
      } else {
        setCopyrightAcknowledged(false);
      }
    } catch {
      // Silencioso se der erro de rede
    } finally {
      setIsAnalyzingCopyright(false);
    }
  }, []);

  // Monitor de Preview — Carrega URL ou link externo
  const loadPvwUrl = useCallback((urlToLoad: string) => {
    const clean = urlToLoad.trim();
    if (!clean) return;
    void runCopyrightAnalysis(clean);
    setPvwLoading(true);
    setPvwError('');
    setPvwUrlLoaded(clean);

    const ytId = extractYoutubeId(clean);
    if (ytId) {
      setPvwYtId(ytId);
      setPvwLoading(false);
      return;
    }
    setPvwYtId(null);

    const videoEl = pvwVideoRef.current;
    if (!videoEl) {
      setPvwLoading(false);
      return;
    }

    if (pvwHlsRef.current) {
      pvwHlsRef.current.destroy();
      pvwHlsRef.current = null;
    }

    const isHls = clean.includes('.m3u8') || clean.includes('/hls/');
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: false });
      pvwHlsRef.current = hls;
      hls.loadSource(clean);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.ERROR, (_ev, data) => {
        if (data.fatal) setPvwError(`Erro no sinal HLS: ${data.details}`);
      });
      void videoEl.play().catch(() => {});
    } else {
      videoEl.src = clean;
      void videoEl.play().catch(() => {});
    }
    setPvwLoading(false);
  }, [runCopyrightAnalysis]);

  // Análise automática com debounce quando o usuário cola ou altera o link no campo
  useEffect(() => {
    if (sourceMode !== 'url') return;
    const clean = streamUrl.trim();
    if (!clean) {
      setCopyrightAnalysis(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void runCopyrightAnalysis(clean);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [sourceMode, streamUrl, runCopyrightAnalysis]);

  // Monitor de Programa: sinal HLS direto da VPS
  useEffect(() => {
    void loadPgmHls();
    return () => {
      if (pgmHlsRef.current) {
        pgmHlsRef.current.destroy();
        pgmHlsRef.current = null;
      }
    };
  }, [loadPgmHls]);

  // Renova URL HLS a cada 10 min
  useEffect(() => {
    const timer = window.setInterval(() => void loadPgmHls(), 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [loadPgmHls]);

  // Quando seleciona uma atração na biblioteca, carrega imediatamente no Preview
  useEffect(() => {
    if (sourceMode === 'library') {
      setPvwYtId(null);
      setPvwUrlLoaded(null);
      if (selectedMedia) {
        void loadPvwMedia(selectedMedia);
      } else if (pvwVideoRef.current) {
        pvwVideoRef.current.src = '';
      }
    }
  }, [sourceMode, selectedMedia, loadPvwMedia]);

  // Cleanup de HLS do preview ao desmontar
  useEffect(() => {
    return () => {
      if (pvwHlsRef.current) {
        pvwHlsRef.current.destroy();
        pvwHlsRef.current = null;
      }
    };
  }, []);

  // Polling de snapshot ao vivo (4s)
  useEffect(() => {
    let active = true;
    const fetchSnapshot = async () => {
      try {
        const snap = await getGsaTvLiveConsoleSnapshot();
        if (active) setLiveData(snap);
      } catch { /* silencioso */ }
    };
    void fetchSnapshot();
    const interval = window.setInterval(fetchSnapshot, 4000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // Comandos
  // ──────────────────────────────────────────────────────────────────────────
  const executeCommand = async (
    command: GsaTvLiveCommand,
    payload: Record<string, unknown> = {},
  ) => {
    setBusy(command);
    try {
      await sendGsaTvLiveCommand(command, {
        channel_id: channel?.id || 'ch-main',
        ...payload,
      });
      toast.success('Comando executado com sucesso!');
      window.setTimeout(() => void onChanged(), 1500);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao executar comando.');
    } finally {
      setBusy('');
    }
  };

  const handleTake = async () => {
    const t = TRANSITIONS.find((x) => x.id === transition)!;

    if (sourceMode === 'break') {
      const playlist = buildBreakPlaylist(breakPreset, commercialSpots, activeTitle);
      const breakLabel =
        breakPreset === '1min'
          ? 'Break Rápido (1 min)'
          : breakPreset === '2min'
          ? 'Break Padrão (2 min)'
          : breakPreset === '3min'
          ? 'Break Completo (3 min)'
          : 'Cartela Contínua (Voltamos Já)';

      setBusy('media_take');
      try {
        toast.loading(`Aplicando transição "${t.label}" e entrando no break...`, { id: 'take-break' });
        await sendGsaTvLiveCommand('stream_pause', {
          channel_id: channel?.id || 'ch-main',
          transition_type: transition,
          transition_duration_ms: transition === 'cut' ? 0 : 1500,
        });

        const totalSec = playlist.totalDuration_s;
        setActiveBreak({
          preset: breakPreset,
          title: breakLabel,
          totalDuration_s: totalSec,
          remaining_s: totalSec,
          spots: playlist.spots,
          currentSpotIndex: 0,
          startedAt: Date.now(),
        });

        toast.success(`${breakLabel} NO AR!`, { id: 'take-break' });
      } catch (err: any) {
        toast.error(`Falha ao disparar break: ${err?.message || err}`, { id: 'take-break' });
      } finally {
        setBusy('');
      }
      return;
    }

    if (sourceMode === 'library') {
      if (!takeMediaId) {
        toast.error('Selecione uma atração no menu abaixo para ensaiar no Preview antes de disparar.');
        return;
      }
      await executeCommand(
        'media_take',
        {
          media_item_id: takeMediaId,
          transition_type: transition,
          transition_duration_ms: transition === 'cut' ? 0 : 1500,
        },
      );
    } else {
      // Modo Link de Transmissão / URL
      const cleanUrl = streamUrl.trim();
      if (!cleanUrl) {
        toast.error('Cole o link da transmissão ou vídeo para colocar no ar.');
        return;
      }

      const effectiveProto = streamProtocol === 'auto' ? detectProtocol(cleanUrl) : streamProtocol;
      const title = streamTitle.trim() || (effectiveProto === 'youtube' ? 'Transmissão YouTube' : 'Link Ao Vivo');

      setBusy('media_take');
      try {
        if (effectiveProto === 'direct_video') {
          // Arquivo de vídeo direto (MP4, MKV, WebM, MOV)
          toast.loading('Importando e preparando vídeo na VPS...', { id: 'take-stream' });
          const imported = await importGsaTvMediaFromUrl({
            url: cleanUrl,
            title,
            mediaKind: 'program',
            rightsConfirmed: true,
          });
          toast.loading(`Aplicando transição "${t.label}" e colocando no ar...`, { id: 'take-stream' });
          await sendGsaTvLiveCommand('media_take', {
            channel_id: channel?.id || 'ch-main',
            media_item_id: imported.id,
            transition_type: transition,
            transition_duration_ms: transition === 'cut' ? 0 : 1500,
          });
          toast.success(`Vídeo "${title}" colocado no ar com sucesso!`, { id: 'take-stream' });
        } else {
          // Fluxo de stream ao vivo (HLS .m3u8, RTMP, RTMPS, SRT ou YouTube Live)
          toast.loading('Conectando link de transmissão na VPS...', { id: 'take-stream' });
          const ytId = extractYoutubeId(cleanUrl);

          const res: any = await mutateGsaTvExtended('save_live_source', {
            channel_id: channel?.id || 'ch-main',
            name: title,
            protocol: effectiveProto === 'youtube' ? 'hls' : effectiveProto,
            enabled: true,
            public_notes: `Disparo da Central Master: ${cleanUrl.slice(0, 100)}`,
            config: ytId ? { youtube_id: ytId } : {},
          });
          const sourceId = String(res?.id || res);
          await updateGsaTvLiveSourceCredentials(sourceId, cleanUrl);

          toast.loading(`Aplicando transição "${t.label}" e colocando no ar...`, { id: 'take-stream' });
          await sendGsaTvLiveCommand('live_take', {
            channel_id: channel?.id || 'ch-main',
            source_id: sourceId,
            transition_type: transition,
            transition_duration_ms: transition === 'cut' ? 0 : 1500,
          });
          toast.success(`Transmissão "${title}" disparada no ar com sucesso!`, { id: 'take-stream' });
        }
        window.setTimeout(() => void onChanged(), 1500);
      } catch (err: any) {
        toast.error(err?.message || 'Falha ao colocar transmissão no ar.', { id: 'take-stream' });
      } finally {
        setBusy('');
      }
    }
  };


  return (
    <div className="space-y-6">
      {/* ── BANNER DE STATUS ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-white shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-md">
            <Tv className="h-6 w-6 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black tracking-tight text-white">
                GSA TV • MESA MASTER DE CONTROLE
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-black uppercase tracking-wider ${
                  onAir
                    ? 'animate-pulse bg-red-500 text-white'
                    : isPaused
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-white" />
                {onAir ? 'NO AR AO VIVO' : isPaused ? 'EM INTERVALO' : 'OFFLINE'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              {channel?.name || 'Canal Principal GSA TV'} • Transmissão Contínua {channel?.quality_profile === '1080p30' ? '1080p30 Full HD' : channel?.quality_profile === '1080p60' ? '1080p60 Full HD' : '720p30 HD'}
            </p>
          </div>
        </div>

        {/* ── CONTROLE DO SELO AO VIVO NO AR (ABAIXO DO LOGO) ── */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy === 'live_badge_toggle'}
            onClick={() => void handleToggleLiveBadge()}
            title={liveBadgeActive ? 'Clique para retirar o selo AO VIVO da transmissão' : 'Clique para exibir o selo AO VIVO sob o logotipo na transmissão'}
            className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all duration-200 shadow-lg ${
              liveBadgeActive
                ? 'bg-red-600 hover:bg-red-700 text-white ring-2 ring-red-400 ring-offset-2 ring-offset-slate-950 shadow-red-900/50'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 hover:border-slate-600'
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                liveBadgeActive ? 'bg-white shadow-[0_0_8px_#fff] animate-ping' : 'bg-slate-600'
              }`}
            />
            <Radio className="h-4 w-4" />
            <span className="font-bold">SELO AO VIVO:</span>
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-black ${
                liveBadgeActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {liveBadgeActive ? 'NO AR' : 'DESLIGADO'}
            </span>
          </button>
        </div>
      </div>

      {/* ── ALERTA DE BREAK COMERCIAL NO AR ────────────────────────────── */}
      {activeBreak && (
        <div className="mb-4 rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-amber-500/20 via-amber-400/10 to-transparent p-4 shadow-md backdrop-blur">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-500 p-2.5 text-slate-950 shadow">
                <Megaphone className="h-6 w-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase text-slate-950">
                    BREAK NO AR AGORA
                  </span>
                  <span className="text-sm font-black text-slate-900">{activeBreak.title}</span>
                </div>
                <p className="text-xs text-slate-600 font-medium">
                  {activeBreak.preset === 'continuous'
                    ? 'Cartela contínua em loop'
                    : `Spot ${activeBreak.currentSpotIndex + 1} de ${activeBreak.spots.length}: ${activeBreak.spots[activeBreak.currentSpotIndex]?.title || ''}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              {activeBreak.preset !== 'continuous' && (
                <div className="text-right">
                  <div className="text-2xl font-black tabular-nums text-amber-700">
                    {formatSecondsToTime(activeBreak.remaining_s)}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    de {formatSecondsToTime(activeBreak.totalDuration_s)}
                  </div>
                </div>
              )}

              <button
                onClick={() => void handleEndBreak(false)}
                className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-black uppercase text-white shadow hover:bg-red-700 transition"
              >
                <FastForward className="h-3.5 w-3.5" />
                Retomar Programa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DUPLA DE MONITORES: PREVIEW + PROGRAMA ───────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* ── MONITOR DE PREVIEW (Ensaio) ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Eye className="h-4 w-4 text-indigo-500" />
            <span className="text-xs font-black uppercase tracking-wider text-indigo-700">
              Monitor de Preview (Ensaio)
            </span>
            <span className="ml-auto truncate max-w-[220px] text-[10px] text-slate-500">
              {sourceMode === 'break'
                ? `📢 Break: ${breakPreset}`
                : sourceMode === 'url'
                ? (streamTitle.trim() || pvwUrlLoaded || 'Aguardando link')
                : (selectedMedia ? `🎬 ${selectedMedia.title}` : 'Aguardando seleção')}
            </span>
          </div>

          <MonitorFrame
            label="PREVIEW — O QUE VAI ENTRAR"
            badge={
              sourceMode === 'break'
                ? 'Break Pronto'
                : sourceMode === 'url'
                ? (pvwUrlLoaded ? 'Link Pronto para TAKE' : 'Aguardando Link')
                : (selectedMedia ? 'Pronto para TAKE' : 'Vazio')
            }
            badgeColor={
              sourceMode === 'break'
                ? 'bg-amber-500'
                : sourceMode === 'url'
                ? (pvwUrlLoaded ? 'bg-indigo-500' : 'bg-slate-600')
                : (selectedMedia ? 'bg-indigo-500' : 'bg-slate-600')
            }
          >
            {sourceMode === 'break' ? (
              <div className="relative flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/40 p-5 text-center">
                <div className="rounded-2xl bg-amber-500/20 p-3 ring-1 ring-amber-500/40 shadow-lg">
                  <Megaphone className="h-8 w-8 text-amber-400" />
                </div>
                <h4 className="mt-2.5 text-sm font-black uppercase tracking-wider text-white">
                  {breakPreset === '1min'
                    ? 'Break Rápido (1 min • 60s)'
                    : breakPreset === '2min'
                    ? 'Break Padrão (2 min • 120s)'
                    : breakPreset === '3min'
                    ? 'Break Completo (3 min • 180s)'
                    : 'Cartela Contínua (Voltamos Já)'}
                </h4>
                <p className="mt-0.5 text-xs font-semibold text-amber-300/90">
                  {breakPreset === 'continuous'
                    ? 'Tela institucional em loop contínuo'
                    : `${buildBreakPlaylist(breakPreset, commercialSpots, activeTitle).spots.length} peças publicitárias no roteiro`}
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-1.5 max-w-sm">
                  {buildBreakPlaylist(breakPreset, commercialSpots, activeTitle).spots.map((spot, idx) => (
                    <span
                      key={idx}
                      className="rounded-md bg-white/10 px-2 py-0.5 text-[9px] font-bold text-slate-200 backdrop-blur"
                    >
                      {idx + 1}. {spot.title.length > 20 ? `${spot.title.slice(0, 20)}...` : spot.title} ({spot.duration_s}s)
                    </span>
                  ))}
                </div>
              </div>
            ) : sourceMode === 'url' ? (
              pvwYtId ? (
                <div className="relative h-full w-full bg-black">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${pvwYtId}?autoplay=1&mute=${pvwMuted ? 1 : 0}&controls=1`}
                    title="Prévia do YouTube"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full border-0"
                  />
                  <div className="absolute top-2 right-2 flex gap-1 z-10">
                    <button
                      onClick={() => setPvwMuted((m) => !m)}
                      className="rounded-lg bg-black/60 p-1.5 text-white hover:bg-black/80"
                      title={pvwMuted ? 'Ativar Áudio do Ensaio' : 'Mutar'}
                    >
                      {pvwMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5 text-indigo-400" />}
                    </button>
                  </div>
                </div>
              ) : pvwUrlLoaded ? (
                <>
                  <video
                    ref={pvwVideoRef}
                    muted={pvwMuted}
                    playsInline
                    autoPlay
                    controls
                    className="h-full w-full object-contain"
                  />
                  {pvwLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80">
                      <div className="flex flex-col items-center gap-2 text-white">
                        <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
                        <span className="text-xs font-bold uppercase tracking-wider">Conectando ao sinal do link...</span>
                      </div>
                    </div>
                  )}
                  {pvwError && !pvwLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 p-4 text-center">
                      <div className="space-y-2">
                        <Radio className="mx-auto h-7 w-7 text-indigo-400" />
                        <p className="text-xs font-bold text-white">Falha ao abrir sinal do link</p>
                        <p className="text-[10px] text-slate-400">{pvwError}</p>
                        <button
                          onClick={() => loadPvwUrl(pvwUrlLoaded)}
                          className="mt-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white"
                        >
                          Tentar Novamente
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1 z-10">
                    <button
                      onClick={() => setPvwMuted((m) => !m)}
                      className="rounded-lg bg-black/60 p-1.5 text-white hover:bg-black/80"
                      title={pvwMuted ? 'Ativar Áudio do Ensaio' : 'Mutar'}
                    >
                      {pvwMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5 text-indigo-400" />}
                    </button>
                    <button
                      onClick={() => void pvwVideoRef.current?.requestFullscreen()}
                      className="rounded-lg bg-black/60 p-1.5 text-white hover:bg-black/80"
                      title="Tela Cheia"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-slate-400">
                  <Link className="h-8 w-8 text-indigo-400/50" />
                  <p className="text-xs font-bold text-slate-300">Nenhum link carregado no Preview</p>
                  <p className="max-w-xs text-[11px] text-slate-500">
                    Cole a URL da transmissão (HLS .m3u8, MP4 ou YouTube) no campo abaixo e clique em &quot;Preview&quot; para assistir antes de disparar no ar.
                  </p>
                </div>
              )
            ) : !selectedMedia ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-slate-400">
                <Eye className="h-8 w-8 text-indigo-400/50" />
                <p className="text-xs font-bold text-slate-300">Nenhuma atração selecionada</p>
                <p className="max-w-xs text-[11px] text-slate-500">
                  Selecione um programa na lista abaixo para ensaiar no Preview com áudio e controles antes de disparar no ar.
                </p>
              </div>
            ) : (
              <>
                <video
                  ref={pvwVideoRef}
                  muted={pvwMuted}
                  playsInline
                  autoPlay
                  controls
                  className="h-full w-full object-contain"
                />
                {pvwLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80">
                    <div className="flex flex-col items-center gap-2 text-white">
                      <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
                      <span className="text-xs font-bold uppercase tracking-wider">Carregando arquivo na VPS...</span>
                    </div>
                  </div>
                )}
                {pvwError && !pvwLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 p-4 text-center">
                    <div className="space-y-2">
                      <Radio className="mx-auto h-7 w-7 text-indigo-400" />
                      <p className="text-xs font-bold text-white">Falha ao abrir mídia</p>
                      <p className="text-[10px] text-slate-400">{pvwError}</p>
                      <button
                        onClick={() => void loadPvwMedia(selectedMedia)}
                        className="mt-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white"
                      >
                        Tentar Novamente
                      </button>
                    </div>
                  </div>
                )}
                {/* Controles do Preview */}
                <div className="absolute top-2 right-2 flex gap-1 z-10">
                  <button
                    onClick={() => setPvwMuted((m) => !m)}
                    className="rounded-lg bg-black/60 p-1.5 text-white hover:bg-black/80"
                    title={pvwMuted ? 'Ativar Áudio do Ensaio' : 'Mutar'}
                  >
                    {pvwMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5 text-indigo-400" />}
                  </button>
                  <button
                    onClick={() => void pvwVideoRef.current?.requestFullscreen()}
                    className="rounded-lg bg-black/60 p-1.5 text-white hover:bg-black/80"
                    title="Tela Cheia"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}

            {/* Badge "PREVIEW" */}
            <div className="absolute left-2 top-2 z-10">
              <span className="rounded bg-indigo-600/90 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow backdrop-blur">
                PREVIEW
              </span>
            </div>
          </MonitorFrame>

          {/* Info do Preview */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-indigo-900 truncate max-w-[300px]">
                {sourceMode === 'break'
                  ? `Break: ${breakPreset === '1min' ? '1 Minuto (4 spots)' : breakPreset === '2min' ? '2 Minutos Padrão (6 spots)' : breakPreset === '3min' ? '3 Minutos Completo (8 spots)' : 'Cartela Contínua'}`
                  : sourceMode === 'url'
                  ? (pvwUrlLoaded ? `Pronto: ${streamTitle.trim() || pvwUrlLoaded}` : 'Cole o link abaixo para ensaiar')
                  : (selectedMedia ? `Pronto: ${selectedMedia.title}` : 'Selecione abaixo para ensaiar')}
              </span>
              {sourceMode === 'break' ? (
                <span className="rounded bg-amber-200/80 px-2 py-0.5 text-[10px] font-black uppercase text-amber-900 shrink-0">
                  {breakPreset === 'continuous' ? 'Loop' : `${buildBreakPlaylist(breakPreset, commercialSpots, activeTitle).totalDuration_s}s`}
                </span>
              ) : sourceMode === 'url' ? (
                pvwUrlLoaded && (
                  <span className="rounded bg-indigo-200/80 px-2 py-0.5 text-[10px] font-black uppercase text-indigo-800 shrink-0">
                    {streamProtocol === 'auto' ? detectProtocol(pvwUrlLoaded) : streamProtocol}
                  </span>
                )
              ) : (
                selectedMedia && (
                  <span className="rounded bg-indigo-200/80 px-2 py-0.5 text-[10px] font-black text-indigo-800 shrink-0">
                    {Math.round(selectedMedia.duration_s / 60)} min
                  </span>
                )
              )}
            </div>
          </div>
        </div>

        {/* ── MONITOR DE PROGRAMA (Ao Vivo) ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-black uppercase tracking-wider text-red-700">
              Monitor de Programa (Ao Vivo)
            </span>

            {/* Indicador de Sinal Direto HLS */}
            <div className="ml-auto flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 border border-slate-700 px-2.5 py-0.5 text-[10px] font-black uppercase text-emerald-400 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                SINAL DIRETO VPS (HLS)
              </span>
              <button
                onClick={() => void loadPgmHls()}
                className="rounded-lg border border-slate-300 bg-white p-1 text-slate-600 hover:bg-slate-100 shadow-sm"
                title="Recarregar Sinal HLS da VPS"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
          </div>

          <MonitorFrame
            label="PROGRAMA — NO AR AGORA"
            badge={onAir ? 'AO VIVO' : isPaused ? 'INTERVALO' : 'OFFLINE'}
            badgeColor={onAir ? 'bg-red-500 animate-ping' : 'bg-amber-400'}
          >
            <video
              ref={pgmVideoRef}
              muted={pgmMuted}
              playsInline
              autoPlay
              className="h-full w-full object-contain"
            />
            {pgmLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80">
                <Loader2 className="h-8 w-8 animate-spin text-red-400" />
              </div>
            )}
            {pgmError && !pgmLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 p-4 text-center">
                <div className="space-y-2">
                  <Radio className="mx-auto h-8 w-8 text-red-400" />
                  <p className="text-sm font-bold text-white">Sinal VPS em Standby</p>
                  <p className="text-[10px] text-slate-400">{pgmError}</p>
                  <button
                    onClick={() => void loadPgmHls()}
                    className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white"
                  >
                    <RefreshCw className="mr-1 inline h-3.5 w-3.5" /> Reconectar
                  </button>
                </div>
              </div>
            )}
            <div className="absolute bottom-2 right-2 flex gap-1 z-10">
              <button
                onClick={() => setPgmMuted((m) => !m)}
                className="rounded-lg bg-black/60 p-1.5 text-white hover:bg-black/80"
                title={pgmMuted ? 'Ativar Áudio da Emissora' : 'Mutar Áudio'}
              >
                {pgmMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5 text-red-400" />}
              </button>
              <button
                onClick={() => void pgmVideoRef.current?.requestFullscreen()}
                className="rounded-lg bg-black/60 p-1.5 text-white hover:bg-black/80"
                title="Tela Cheia"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Overlay de Break Comercial Ativo */}
            {activeBreak && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-slate-950/95 via-indigo-950/95 to-slate-950/95 p-6 text-center backdrop-blur-sm">
                <div className="flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-400 animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                  INTERVALO COMERCIAL NO AR
                </div>

                <div className="mt-3 text-4xl font-black tabular-nums tracking-tight text-white drop-shadow">
                  {activeBreak.preset === 'continuous' ? 'AO VIVO' : formatSecondsToTime(activeBreak.remaining_s)}
                </div>
                <p className="text-[11px] font-bold text-amber-300">
                  {activeBreak.preset === 'continuous'
                    ? 'Cartela Institucional Ativa'
                    : `Restantes de ${formatSecondsToTime(activeBreak.totalDuration_s)}`}
                </p>

                {activeBreak.preset !== 'continuous' && activeBreak.totalDuration_s > 0 && (
                  <div className="mt-3 h-2 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-1000"
                      style={{
                        width: `${Math.min(100, Math.max(0, ((activeBreak.totalDuration_s - activeBreak.remaining_s) / activeBreak.totalDuration_s) * 100))}%`,
                      }}
                    />
                  </div>
                )}

                {activeBreak.spots[activeBreak.currentSpotIndex] && (
                  <div className="mt-4 max-w-sm rounded-xl border border-white/10 bg-white/5 p-3 text-left">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase text-amber-400">
                      <span>Tocando Agora (Spot {activeBreak.currentSpotIndex + 1} de {activeBreak.spots.length}):</span>
                      <span>{activeBreak.spots[activeBreak.currentSpotIndex].duration_s}s</span>
                    </div>
                    <div className="mt-1 text-xs font-bold text-white truncate">
                      {activeBreak.spots[activeBreak.currentSpotIndex].title}
                    </div>
                    <div className="text-[10px] text-slate-300 truncate">
                      {activeBreak.spots[activeBreak.currentSpotIndex].advertiser}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => void handleEndBreak(false)}
                  className="mt-4 flex items-center gap-1.5 rounded-xl bg-red-600/90 hover:bg-red-600 px-4 py-2 text-xs font-black uppercase text-white shadow-lg transition"
                >
                  <FastForward className="h-3.5 w-3.5" />
                  Encerrar Break & Retomar Programa
                </button>
              </div>
            )}

            {/* Badge "PROGRAMA" */}
            <div className="absolute left-2 top-2 z-10">
              <span className="rounded bg-red-600/90 px-2 py-0.5 text-[10px] font-black uppercase text-white shadow backdrop-blur">
                PROGRAMA
              </span>
            </div>
          </MonitorFrame>

          {/* Título no ar */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-black uppercase text-red-600">
                NO AR
              </span>
              <span className="truncate text-xs font-bold text-slate-800">{activeTitle}</span>
              <span className="ml-auto shrink-0 text-[10px] font-bold text-emerald-600">
                ✓ Sinal Direto HLS
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── MESA DE CORTE: TAKE + TRANSIÇÃO ──────────────────────────────── */}
      <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-slate-50 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900">MESA DE CORTE — DISPARAR NO AR (TAKE)</h3>
            <p className="text-xs text-slate-500">Selecione a atração, confirme no Preview e dispare com a transição desejada</p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Coluna esquerda: seleção de mídia */}
          <div className="space-y-3">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase text-slate-600">
                1. Selecione a Atração (carrega no Preview acima):
              </label>

              {/* TABS: ARQUIVO NO SERVIDOR vs LINK DE TRANSMISSÃO vs BREAK COMERCIAL */}
              <div className="mb-3 flex rounded-xl border border-slate-300 bg-white p-1 shadow-sm gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setSourceMode('library');
                    if (selectedMedia) void loadPvwMedia(selectedMedia);
                  }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
                    sourceMode === 'library'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <FileVideo className="h-3.5 w-3.5" />
                  Arquivo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSourceMode('url');
                    if (streamUrl.trim()) loadPvwUrl(streamUrl);
                  }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
                    sourceMode === 'url'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Link className="h-3.5 w-3.5" />
                  Link URL
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode('break')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
                    sourceMode === 'break'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Megaphone className="h-3.5 w-3.5" />
                  Break Comercial ⭐
                </button>
              </div>

              {sourceMode === 'break' ? (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 shadow-inner">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black uppercase text-amber-950 flex items-center gap-1">
                      <Timer className="h-3.5 w-3.5 text-amber-600" />
                      Duração do Intervalo Comercial:
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowSpotsManager(true)}
                      className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 underline flex items-center gap-1"
                    >
                      <Layers className="h-3 w-3" /> Gerenciar Peças ({commercialSpots.length})
                    </button>
                  </div>

                  {/* Seleção de Presets */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: '1min', label: '1 Minuto', sec: '60s', desc: '4 spots' },
                      { id: '2min', label: '2 Minutos ⭐', sec: '120s', desc: 'Padrão TV' },
                      { id: '3min', label: '3 Minutos', sec: '180s', desc: 'Bloco Nobre' },
                      { id: 'continuous', label: 'Contínuo', sec: 'Loop', desc: 'Cartela & Som' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setBreakPreset(p.id as any)}
                        className={`flex flex-col items-center justify-center rounded-lg border p-2 text-center transition ${
                          breakPreset === p.id
                            ? 'border-amber-500 bg-amber-500 text-slate-950 font-black shadow'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-amber-300'
                        }`}
                      >
                        <span className="text-xs font-black">{p.label}</span>
                        <span className="text-[10px] opacity-80">{p.sec}</span>
                        <span className="text-[8px] opacity-70">{p.desc}</span>
                      </button>
                    ))}
                  </div>

                  {/* Roteiro Sequencial do Break */}
                  <div className="rounded-lg border border-amber-200 bg-white/90 p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-black text-slate-700 uppercase">
                      <span>Roteiro do Break Programado:</span>
                      <span className="text-amber-800 font-bold">
                        {breakPreset === 'continuous'
                          ? 'Loop Institucional'
                          : `Total: ${buildBreakPlaylist(breakPreset, commercialSpots, activeTitle).totalDuration_s}s`}
                      </span>
                    </div>

                    {commercialSpots.filter((s) => s.active).length === 0 ? (
                      <div className="rounded-lg bg-amber-50 p-2.5 text-center text-xs text-amber-900 border border-dashed border-amber-300">
                        <p className="font-bold text-[11px]">Nenhuma peça comercial cadastrada ainda</p>
                        <p className="text-[10px] text-amber-700 mt-0.5">
                          O intervalo entrará com a cartela oficial de continuidade. Para rodar comerciais de patrocinadores reais, clique em &quot;Gerenciar Peças&quot; acima.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                        {buildBreakPlaylist(breakPreset, commercialSpots, activeTitle).spots.map((spot, idx) => {
                          const meta = CATEGORY_METADATA[spot.category];
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-[10px] border border-slate-100"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-bold text-slate-400">{idx + 1}.</span>
                                <span className="truncate font-semibold text-slate-800">{spot.title}</span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className={`rounded px-1.5 py-0.2 text-[8px] font-bold border ${meta?.badgeColor || 'bg-slate-100'}`}>
                                  {meta?.icon} {meta?.label.split(' ')[0]}
                                </span>
                                <span className="font-mono text-[9px] text-slate-500">{spot.duration_s}s</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : sourceMode === 'library' ? (
                <>
                  <select
                    value={takeMediaId}
                    onChange={(e) => setTakeMediaId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">-- Escolha o que colocar no ar --</option>
                    {readyMedia.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({Math.round(m.duration_s / 60)} min)
                      </option>
                    ))}
                  </select>
                  {selectedMedia && (
                    <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs text-indigo-800">
                      <Eye className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-semibold">Carregado no Preview:</span>
                      <span className="truncate">{selectedMedia.title}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 shadow-inner">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-slate-700">
                      Link da Transmissão ou Vídeo:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={streamUrl}
                        onChange={(e) => setStreamUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            loadPvwUrl(streamUrl);
                          }
                        }}
                        placeholder="Cole URL (HLS .m3u8, MP4, RTMP ou YouTube)..."
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      />
                      <button
                        type="button"
                        onClick={() => loadPvwUrl(streamUrl)}
                        disabled={!streamUrl.trim()}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow transition hover:bg-indigo-700 disabled:opacity-50"
                        title="Carregar para assistir no Monitor de Preview"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Preview
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-600">
                        Título da Transmissão (Opcional):
                      </label>
                      <input
                        type="text"
                        value={streamTitle}
                        onChange={(e) => setStreamTitle(e.target.value)}
                        placeholder="Ex.: Live Externa, Matéria de Campo"
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-600">
                        Tipo do Sinal:
                      </label>
                      <select
                        value={streamProtocol}
                        onChange={(e) => setStreamProtocol(e.target.value as any)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
                      >
                        <option value="auto">Auto (Detectar)</option>
                        <option value="hls">HLS (.m3u8)</option>
                        <option value="direct_video">Vídeo MP4 / WebM</option>
                        <option value="youtube">YouTube</option>
                        <option value="rtmp">RTMP</option>
                        <option value="rtmps">RTMPS</option>
                        <option value="srt">SRT</option>
                      </select>
                    </div>
                  </div>

                  {pvwUrlLoaded && (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span className="font-bold">Sinal carregado no Preview!</span>
                      <span className="truncate text-slate-600">
                        ({streamProtocol === 'auto' ? detectProtocol(pvwUrlLoaded).toUpperCase() : streamProtocol.toUpperCase()})
                      </span>
                    </div>
                  )}

                  {/* ANÁLISE AUTOMÁTICA DE DIREITOS AUTORAIS / CONTENT ID */}
                  {isAnalyzingCopyright && (
                    <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 p-2.5 text-xs text-indigo-800">
                      <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                      <span className="font-semibold">Analisando direitos autorais e risco de Content ID no YouTube...</span>
                    </div>
                  )}

                  {copyrightAnalysis && !isAnalyzingCopyright && (
                    <div
                      className={`overflow-hidden rounded-xl border p-3 text-xs shadow-sm transition-all ${
                        copyrightAnalysis.riskLevel === 'high'
                          ? 'border-rose-300 bg-rose-50/90 text-rose-950'
                          : copyrightAnalysis.riskLevel === 'moderate'
                          ? 'border-amber-300 bg-amber-50/90 text-amber-950'
                          : 'border-emerald-300 bg-emerald-50/90 text-emerald-950'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {copyrightAnalysis.riskLevel === 'high' ? (
                            <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0" />
                          ) : copyrightAnalysis.riskLevel === 'moderate' ? (
                            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                          ) : (
                            <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                          )}
                          <div>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                                copyrightAnalysis.riskLevel === 'high'
                                  ? 'bg-rose-600 text-white'
                                  : copyrightAnalysis.riskLevel === 'moderate'
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-emerald-600 text-white'
                              }`}
                            >
                              {copyrightAnalysis.riskLevel === 'high'
                                ? `🔴 Alto Risco (${copyrightAnalysis.riskScore}%)`
                                : copyrightAnalysis.riskLevel === 'moderate'
                                ? `🟡 Risco Moderado (${copyrightAnalysis.riskScore}%)`
                                : `🟢 Sinal Seguro (${copyrightAnalysis.riskScore}%)`}
                            </span>
                            <span className="ml-2 font-bold text-slate-800 text-[11px]">
                              {copyrightAnalysis.categoryLabel}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowCopyrightDetails((v) => !v)}
                          className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                        >
                          {showCopyrightDetails ? 'Ocultar' : 'Detalhes'}
                          {showCopyrightDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </div>

                      <div className="mt-2 space-y-1">
                        <p className="font-bold text-xs">
                          {copyrightAnalysis.riskTitle}
                        </p>
                        <p className="text-[11px] leading-relaxed text-slate-700">
                          {copyrightAnalysis.summary}
                        </p>
                        {copyrightAnalysis.holder && (
                          <p className="text-[10px] text-slate-600">
                            <strong>Detentor identificado:</strong> {copyrightAnalysis.holder}
                          </p>
                        )}
                      </div>

                      {showCopyrightDetails && (
                        <div className="mt-3 space-y-2 border-t border-black/10 pt-2 text-[11px]">
                          <div>
                            <strong className="block text-[10px] uppercase text-slate-600">
                              Políticas de Transmissão do YouTube:
                            </strong>
                            <p className="mt-0.5 text-slate-700">
                              {copyrightAnalysis.youtubePolicy}
                            </p>
                          </div>

                          {copyrightAnalysis.recommendations.length > 0 && (
                            <div>
                              <strong className="block text-[10px] uppercase text-slate-600">
                                Recomendações para a Mesa Diretora:
                              </strong>
                              <ul className="mt-1 list-disc pl-4 space-y-0.5 text-slate-700 text-[10px]">
                                {copyrightAnalysis.recommendations.map((rec, i) => (
                                  <li key={i}>{rec}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Trava de segurança para Alto Risco */}
                      {copyrightAnalysis.riskLevel === 'high' && (
                        <div className="mt-3 rounded-lg border border-rose-300 bg-white/90 p-2.5">
                          <label className="flex items-start gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={copyrightAcknowledged}
                              onChange={(e) => setCopyrightAcknowledged(e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-rose-400 text-rose-600 focus:ring-rose-500"
                            />
                            <span className="text-[10px] font-bold text-rose-900 leading-tight">
                              Estou ciente do risco de Content ID e declaro possuir autorização, cessão de direitos ou direito jornalístico de citação (Fair Use) para colocar no ar.
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Coluna direita: tipo de transição */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-600">
                2. Escolha o Tipo de Transição:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TRANSITIONS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTransition(t.id)}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-all ${
                      transition === t.id
                        ? 'border-indigo-500 bg-indigo-600 text-white shadow-md'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300'
                    }`}
                    title={t.desc}
                  >
                    <span className="text-lg">{t.icon}</span>
                    <span className="text-[11px] font-black leading-tight">{t.label}</span>
                    <span className={`text-[9px] leading-tight ${transition === t.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                      {t.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Botão de Disparo */}
        <div className="mt-5">
          <button
            onClick={() => void handleTake()}
            disabled={
              Boolean(busy) ||
                (sourceMode === 'library'
                  ? !takeMediaId
                  : sourceMode === 'break'
                  ? false
                  : !streamUrl.trim())
            }
            className={`flex w-full items-center justify-center gap-3 rounded-2xl ${
              sourceMode === 'break'
                ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800'
                : 'bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800'
            } px-6 py-4 text-base font-black uppercase tracking-wider text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50`}
          >
            {busy === 'media_take' || busy === 'live_take' ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                DISPARANDO NO AR...
              </>
            ) : sourceMode === 'break' ? (
              <>
                <Megaphone className="h-5 w-5" />
                DISPARAR BREAK COMERCIAL NO AR (TAKE)
                <span className="ml-2 rounded-full bg-black/30 px-2.5 py-0.5 text-xs font-bold normal-case">
                  {breakPreset === '1min'
                    ? '1 min'
                    : breakPreset === '2min'
                    ? '2 min (Padrão)'
                    : breakPreset === '3min'
                    ? '3 min'
                    : 'Cartela Contínua'}
                </span>
                {transition !== 'cut' && (
                  <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold normal-case">
                    {TRANSITIONS.find((t) => t.id === transition)?.label}
                  </span>
                )}
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                COLOCAR NO AR AGORA (TAKE)
                {transition !== 'cut' && (
                  <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold normal-case">
                    {TRANSITIONS.find((t) => t.id === transition)?.label}
                  </span>
                )}
                {sourceMode === 'url' && (
                  <span className="ml-2 rounded-full bg-black/30 px-2 py-0.5 text-xs font-bold normal-case">
                    Link Externo
                  </span>
                )}
              </>
            )}
          </button>
          <p className="mt-2 text-center text-[10px] text-slate-400">
            A transição selecionada será aplicada pelo servidor da VPS sem interrupção do stream no YouTube.
          </p>
        </div>
      </div>

      {/* ── SUITE DE INTERVALOS COMERCIAIS & CONTINUIDADE MASTER ─────────── */}
      <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/40 p-5 shadow-sm">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-amber-500 p-2 text-slate-950 shadow-sm">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">INTERVALOS COMERCIAIS & CONTINUIDADE MASTER</h3>
              <p className="text-xs text-slate-500">
                Disparo rápido de breaks com contagem regressiva e retorno suave ao programa
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowQuickBreakModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2 text-xs font-black uppercase text-white shadow-md transition"
            >
              <Zap className="h-4 w-4" /> Disparar ou Agendar Comercial
            </button>
            <button
              type="button"
              onClick={() => setShowSpotsManager(true)}
              className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 shadow-sm transition"
            >
              <Layers className="h-3.5 w-3.5 text-amber-600" />
              Biblioteca de Peças ({commercialSpots.length})
            </button>
          </div>
        </div>

        {/* Lista de Breaks Agendados para Hoje */}
        {scheduledBreaks.length > 0 && (
          <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/90 p-3 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-indigo-950 mb-2">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-indigo-600" />
                Intervalos Agendados para Entrar Automaticamente ({scheduledBreaks.length}):
              </span>
              <span className="text-[10px] text-indigo-700 font-normal">
                O sistema executará no minuto marcado com pausa automática do programa
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {scheduledBreaks.map((sb) => (
                <div
                  key={sb.id}
                  className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs border border-indigo-200 shadow-sm"
                >
                  <span className="font-mono font-black text-indigo-700">{sb.time}</span>
                  <span className="font-semibold text-slate-800">{sb.spotTitle}</span>
                  <span className="text-[10px] rounded bg-amber-100 text-amber-800 px-1.5 py-0.2 font-bold">
                    {sb.preset}
                  </span>
                  <button
                    onClick={() => handleCancelScheduledBreak(sb.id)}
                    className="ml-1 text-rose-500 hover:text-rose-700 font-black text-sm"
                    title="Cancelar agendamento"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Se houver break no ar */}
        {activeBreak ? (
          <div className="rounded-xl border border-amber-300 bg-amber-100/70 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-amber-600 animate-ping" />
                  <span className="text-xs font-black uppercase tracking-wider text-amber-950">
                    BREAK NO AR • {activeBreak.title}
                  </span>
                </div>
                <div className="text-xs text-slate-700">
                  <span className="font-bold">Tocando agora:</span>{' '}
                  {activeBreak.spots[activeBreak.currentSpotIndex]?.title || 'Transmissão de Peças Publicitárias'}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {activeBreak.preset !== 'continuous' && (
                  <div className="text-center font-mono font-black text-2xl text-amber-950 bg-white/80 px-3 py-1 rounded-lg border border-amber-200 shadow-inner">
                    {formatSecondsToTime(activeBreak.remaining_s)}
                  </div>
                )}
                <button
                  onClick={() => void handleEndBreak(false)}
                  className="flex items-center gap-1 rounded-xl bg-red-600 hover:bg-red-700 px-3.5 py-2 text-xs font-black uppercase text-white shadow transition"
                >
                  <FastForward className="h-3.5 w-3.5" /> Retomar Agora
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Botões de Disparo Rápido 1-Clique */
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              onClick={() => void handleDirectBreakTake('1min')}
              disabled={Boolean(busy) || isPaused}
              className="flex flex-col items-center justify-center gap-1 rounded-xl border border-amber-200 bg-white p-3 text-center transition hover:border-amber-400 hover:bg-amber-50/50 disabled:opacity-40 shadow-sm"
            >
              <Timer className="h-5 w-5 text-amber-600" />
              <span className="text-xs font-black text-slate-900">Break 1 Minuto</span>
              <span className="text-[10px] text-slate-500">60s • 4 Spots</span>
            </button>
            <button
              onClick={() => void handleDirectBreakTake('2min')}
              disabled={Boolean(busy) || isPaused}
              className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-amber-400 bg-amber-50/70 p-3 text-center transition hover:bg-amber-100 disabled:opacity-40 shadow-sm"
            >
              <Megaphone className="h-5 w-5 text-amber-700" />
              <span className="text-xs font-black text-amber-950">Break 2 Minutos ⭐</span>
              <span className="text-[10px] text-amber-700 font-medium">120s • Padrão TV</span>
            </button>
            <button
              onClick={() => void handleDirectBreakTake('3min')}
              disabled={Boolean(busy) || isPaused}
              className="flex flex-col items-center justify-center gap-1 rounded-xl border border-amber-200 bg-white p-3 text-center transition hover:border-amber-400 hover:bg-amber-50/50 disabled:opacity-40 shadow-sm"
            >
              <Film className="h-5 w-5 text-amber-600" />
              <span className="text-xs font-black text-slate-900">Break 3 Minutos</span>
              <span className="text-[10px] text-slate-500">180s • Bloco Nobre</span>
            </button>
            <button
              onClick={() => void handleDirectBreakTake('continuous')}
              disabled={Boolean(busy) || isPaused}
              className="flex flex-col items-center justify-center gap-1 rounded-xl border border-amber-200 bg-white p-3 text-center transition hover:border-amber-400 hover:bg-amber-50/50 disabled:opacity-40 shadow-sm"
            >
              <Pause className="h-5 w-5 text-slate-600" />
              <span className="text-xs font-black text-slate-900">Cartela Contínua</span>
              <span className="text-[10px] text-slate-500">Loop de Segurança</span>
            </button>
          </div>
        )}
      </div>

      {/* ── PRODUÇÃO RÁPIDA IA ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <div className="rounded-lg bg-purple-100 p-2 text-purple-700">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900">PRODUÇÃO RÁPIDA COM IA</h3>
            <p className="text-xs text-slate-500">Produza uma edição nova com 1 clique</p>
          </div>
        </div>
        <div className="flex gap-3">
          <select
            value={generatingProgram}
            onChange={(e) => setGeneratingProgram(e.target.value)}
            className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none"
          >
            <option value="gsa-news">📰 GSA News — Edição Principal</option>
            <option value="meio-dia">☀️ GSA Meio Dia News</option>
            <option value="manha">🌅 GSA Manhã News</option>
            <option value="boletim">💰 GSA Mercado</option>
            <option value="ta-na-rede">🌐 GSA Tá na Rede (Virais)</option>
            <option value="pipoca">🍿 GSA Sessão Pipoca (Intro)</option>
          </select>
          <button
            onClick={() => {
              toast.success('Solicitação enviada! A edição será gerada nos bastidores.');
              if (onOpenTab) onOpenTab('ai');
            }}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-purple-700 px-4 py-2 text-xs font-black text-white shadow transition hover:bg-purple-800"
          >
            <Sparkles className="h-4 w-4" />
            PRODUZIR
          </button>
        </div>
      </div>

      {/* ── LINHA DO TEMPO DO DIA ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-indigo-600" />
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">
              GRADE DO DIA • LINHA DO TEMPO CONTÍNUA
            </h3>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            Horário Oficial de Brasília • 24 Horas no Ar
          </span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {DAILY_BLOCKS.map((block, idx) => {
            const blockHour = parseInt(block.time.split(':')[0], 10);
            const isPast = currentHour > blockHour;
            const isCurrent = currentHour === blockHour;
            return (
              <div
                key={idx}
                className={`flex w-44 shrink-0 flex-col justify-between rounded-xl border p-3 transition-all ${
                  isCurrent
                    ? 'border-red-500 bg-red-50 shadow-md ring-2 ring-red-500/20'
                    : isPast
                    ? 'border-slate-200 bg-slate-50/70 opacity-70'
                    : 'border-slate-200 bg-white hover:border-indigo-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-black ${isCurrent ? 'text-red-700' : 'text-slate-800'}`}>
                      {block.time}
                    </span>
                    <span className="text-base">{block.icon}</span>
                  </div>
                  <h4 className="mt-1 truncate text-xs font-black text-slate-900" title={block.title}>
                    {block.title}
                  </h4>
                </div>
                <div className="mt-2.5 flex items-center justify-between border-t border-slate-200/60 pt-2 text-[10px]">
                  <span className="font-semibold text-slate-500">{block.badge}</span>
                  {isCurrent ? (
                    <span className="font-black uppercase text-red-600">NO AR</span>
                  ) : isPast ? (
                    <span className="font-bold text-slate-400">Exibido</span>
                  ) : (
                    <span className="font-bold text-indigo-600">Agendado</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* ── MODAL / GAVETA DE GERENCIAMENTO DE COMERCIAIS & ANUNCIANTES ── */}
      {showSpotsManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header do Modal */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-amber-500 p-2 text-slate-950 shadow">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Biblioteca de Peças Publicitárias & Anunciantes GSA TV
                  </h3>
                  <p className="text-xs text-slate-500">
                    Gerencie comerciais de patrocinadores, chamadas da grade, institucionais e utilidade pública
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSpotsManager(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
              >
                ✕
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Formulário: Adicionar Novo Spot */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-amber-950">
                  <Plus className="h-4 w-4 text-amber-600" />
                  Cadastrar Nova Peça Publicitária / Anunciante:
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-5">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Título da Peça / Campanha:
                    </label>
                    <input
                      type="text"
                      value={newSpotTitle}
                      onChange={(e) => setNewSpotTitle(e.target.value)}
                      placeholder="Ex.: Campanha de Inverno Cooperativa"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Anunciante / Patrocinador:
                    </label>
                    <input
                      type="text"
                      value={newSpotAdvertiser}
                      onChange={(e) => setNewSpotAdvertiser(e.target.value)}
                      placeholder="Ex.: Cooperativa Agro / Grupo GSA"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Categoria da Peça:
                    </label>
                    <select
                      value={newSpotCategory}
                      onChange={(e) => setNewSpotCategory(e.target.value as SpotCategory)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-amber-500"
                    >
                      <option value="sponsor">💼 Patrocinador Externo</option>
                      <option value="promo">📢 Auto-Promoção da Grade</option>
                      <option value="institutional">🏢 Institucional Grupo GSA</option>
                      <option value="public_service">🕒 Utilidade Pública / Hora Certa</option>
                      <option value="bumper">🎬 Vinheta de Continuidade</option>
                    </select>
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Duração (Segundos):
                    </label>
                    <input 
                      type="number"
                      min={3}
                      max={180}
                      value={newSpotDuration}
                      inputMode="numeric"
onChange={(e) => setNewSpotDuration(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-amber-500"
                    />
                  </div>

                </div>

                {/* SELETOR DE ORIGEM DO VÍDEO DO COMERCIAL (LINK, BIBLIOTECA OU UPLOAD) */}
                <div className="rounded-xl border border-amber-200/90 bg-white p-3.5 space-y-2.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-black uppercase text-slate-800">
                      Origem do Vídeo da Peça Comercial:
                    </label>
                    <span className="text-[10px] font-semibold text-slate-500">
                      Escolha como fornecer o comercial
                    </span>
                  </div>

                  {/* 3 Tabs de Origem */}
                  <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => setNewSpotSourceType('url')}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold transition ${
                        newSpotSourceType === 'url'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-white'
                      }`}
                    >
                      <Link className="h-3.5 w-3.5" />
                      1. Link / URL Externa
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewSpotSourceType('library')}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold transition ${
                        newSpotSourceType === 'library'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-white'
                      }`}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      2. Salvo na Biblioteca ({readyMedia.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewSpotSourceType('upload')}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold transition ${
                        newSpotSourceType === 'upload'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-white'
                      }`}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      3. Subir do Computador
                    </button>
                  </div>

                  {/* Campos Condicionais */}
                  {newSpotSourceType === 'url' && (
                    <div className="space-y-1">
                      <input
                        type="url"
                        value={newSpotUrl}
                        onChange={(e) => setNewSpotUrl(e.target.value)}
                        placeholder="Cole a URL do vídeo (ex.: https://.../spot.mp4, YouTube, etc.)..."
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-amber-500"
                      />
                      <p className="text-[10px] text-slate-500">
                        Insira a URL direta do comercial ou vídeo institucional para exibição durante o break.
                      </p>
                    </div>
                  )}

                  {newSpotSourceType === 'library' && (
                    <div className="space-y-1">
                      <select
                        value={newSpotLibraryId}
                        onChange={(e) => handleSelectSpotFromLibrary(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-amber-500"
                      >
                        <option value="">-- Selecione um vídeo já gravado na biblioteca da GSA TV --</option>
                        {readyMedia.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title} ({Math.round(item.duration_s)}s • {item.media_kind || 'mídia'})
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-500">
                        O título e a duração exata da peça serão preenchidos automaticamente a partir do arquivo selecionado.
                      </p>
                    </div>
                  )}

                  {newSpotSourceType === 'upload' && (
                    <div>
                      <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/50 p-4 text-center cursor-pointer hover:bg-amber-100/60 transition">
                        <Upload className="h-6 w-6 text-amber-600 mb-1" />
                        <span className="text-xs font-black text-slate-800">
                          {newSpotFileName ? `Arquivo Carregado: ${newSpotFileName}` : 'Clique aqui para escolher o arquivo de vídeo do computador'}
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5">
                          Formatos aceitos: MP4, MOV, MKV, WebM (o sistema detecta a minutagem automaticamente)
                        </span>
                        <input
                          type="file"
                          accept="video/*"
                          onChange={handleSpotFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleAddSpot}
                    className="flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 px-5 py-2.5 text-xs font-black uppercase text-white shadow-md transition"
                  >
                    <Plus className="h-4 w-4" /> Cadastrar Peça Publicitária
                  </button>
                </div>
              </div>

              {/* Filtros por Categoria */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'all', label: 'Todas as Peças', count: commercialSpots.length },
                    { id: 'sponsor', label: 'Patrocinadores', count: commercialSpots.filter((s) => s.category === 'sponsor').length },
                    { id: 'promo', label: 'Chamadas da Grade', count: commercialSpots.filter((s) => s.category === 'promo').length },
                    { id: 'institutional', label: 'Institucionais', count: commercialSpots.filter((s) => s.category === 'institutional').length },
                    { id: 'public_service', label: 'Utilidade Pública', count: commercialSpots.filter((s) => s.category === 'public_service').length },
                    { id: 'bumper', label: 'Vinhetas', count: commercialSpots.filter((s) => s.category === 'bumper').length },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setSelectedSpotFilter(tab.id as any)}
                      className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                        selectedSpotFilter === tab.id
                          ? 'bg-slate-900 text-white shadow'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>

                <span className="text-[11px] font-semibold text-slate-500">
                  {commercialSpots.filter((s) => s.active).length} ativas na rotação de breaks
                </span>
              </div>

              {/* Lista de Peças Publicitárias */}
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {commercialSpots.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
                    <Megaphone className="h-8 w-8 text-slate-400 mb-2" />
                    <h4 className="text-xs font-bold text-slate-800">Nenhuma peça publicitária cadastrada</h4>
                    <p className="text-[11px] text-slate-500 max-w-sm mt-1">
                      Utilize o formulário acima para cadastrar os comerciais reais da sua emissora usando um Link, subindo um arquivo do seu computador ou selecionando da biblioteca existente.
                    </p>
                  </div>
                ) : (
                  commercialSpots
                    .filter((spot) => selectedSpotFilter === 'all' || spot.category === selectedSpotFilter)
                    .map((spot) => {
                      const meta = CATEGORY_METADATA[spot.category];
                      return (
                        <div
                          key={spot.id}
                          className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition ${
                            spot.active
                              ? 'border-slate-200 bg-white hover:border-amber-300 shadow-sm'
                              : 'border-slate-200 bg-slate-50/70 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleToggleSpot(spot.id)}
                              className={`rounded-md p-1.5 transition ${
                                spot.active
                                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                  : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                              }`}
                              title={spot.active ? 'Desativar da rotação' : 'Ativar na rotação'}
                            >
                              <Check className="h-4 w-4" />
                            </button>

                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-md px-2 py-0.5 text-[9px] font-bold border ${meta?.badgeColor}`}>
                                  {meta?.icon} {meta?.label}
                                </span>
                                {spot.sourceType === 'library' || spot.libraryMediaId ? (
                                  <span className="rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 text-[8px] font-bold">
                                    📁 Biblioteca GSA
                                  </span>
                                ) : spot.sourceType === 'upload' || spot.fileName ? (
                                  <span className="rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 text-[8px] font-bold">
                                    ⬆️ Upload ({spot.fileName || 'Arquivo Local'})
                                  </span>
                                ) : spot.videoUrl ? (
                                  <span className="rounded-md bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[8px] font-bold">
                                    🔗 Link URL
                                  </span>
                                ) : null}
                                <h4 className="text-xs font-bold text-slate-900">{spot.title}</h4>
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                                <span>Anunciante: <strong className="text-slate-700">{spot.advertiser}</strong></span>
                                <span>•</span>
                                <span>Duração: <strong className="text-slate-700">{spot.duration_s} segundos</strong></span>
                                {spot.videoUrl && (
                                  <>
                                    <span>•</span>
                                    <span className="text-indigo-600 truncate max-w-xs">{spot.videoUrl}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDeleteSpot(spot.id)}
                              className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                              title="Remover peça"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            {/* Footer do Modal */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
              <div className="flex items-center gap-3">
                {commercialSpots.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllSpots}
                    className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                  >
                    <Trash2 className="h-3 w-3" /> Zerar Peças
                  </button>
                )}
                <span className="text-[11px] text-slate-500">
                  Os intervalos montam o roteiro exclusivamente com as peças reais que você cadastrar.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowSpotsManager(false)}
                className="rounded-xl bg-slate-900 hover:bg-slate-800 px-4 py-2 text-xs font-black uppercase text-white shadow transition"
              >
                Concluir & Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL PRÁTICO: DISPARAR OU AGENDAR COMERCIAL ────────────────── */}
      {showQuickBreakModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-amber-500 px-6 py-4 text-slate-950">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-slate-950 p-2 text-amber-400 shadow">
                  <Zap className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight">
                    Disparar ou Agendar Comercial
                  </h3>
                  <p className="text-xs font-semibold text-slate-900/80">
                    Processo 100% automático: o sistema pausa o programa com vinheta e retoma de onde parou.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowQuickBreakModal(false)}
                className="rounded-lg p-1.5 text-slate-950 hover:bg-black/10 transition text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Conteúdo */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* PASSO 1: Escolha da Peça / Comercial */}
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase text-slate-800">
                  1. Escolha o Comercial ou Peça Publicitária:
                </label>

                {commercialSpots.length === 0 && readyMedia.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-center space-y-2">
                    <p className="text-xs font-bold text-amber-900">
                      Nenhum comercial cadastrado ainda.
                    </p>
                    <p className="text-[11px] text-amber-700">
                      Você pode cadastrar agora via Link, upload do computador ou usar a cartela institucional oficial da emissora.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowQuickBreakModal(false);
                        setShowSpotsManager(true);
                      }}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-black uppercase text-white shadow"
                    >
                      + Cadastrar Peça Agora
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <select
                      value={quickSelectedSpotId}
                      onChange={(e) => setQuickSelectedSpotId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                    >
                      <option value="">-- Cartela Oficial GSA TV / Rotação de Comerciais --</option>
                      {commercialSpots.map((spot) => (
                        <option key={spot.id} value={spot.id}>
                          {spot.title} ({spot.duration_s}s • {spot.advertiser})
                        </option>
                      ))}
                      {readyMedia.map((m) => (
                        <option key={m.id} value={`media-${m.id}`}>
                          📁 Biblioteca TV: {m.title} ({Math.round(m.duration_s)}s)
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        {commercialSpots.length} peças cadastradas na sua biblioteca
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowQuickBreakModal(false);
                          setShowSpotsManager(true);
                        }}
                        className="font-bold text-indigo-600 hover:text-indigo-800 underline"
                      >
                        + Cadastrar Nova Peça (Upload / Link)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Duração do Intervalo */}
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase text-slate-800">
                  2. Duração do Intervalo:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: '1min', label: '1 Minuto (60s)' },
                    { id: '2min', label: '2 Minutos (Padrão TV ⭐)' },
                    { id: '3min', label: '3 Minutos (Bloco Nobre)' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setQuickPreset(p.id as BreakDurationPreset)}
                      className={`rounded-xl border p-2.5 text-center text-xs font-bold transition ${
                        quickPreset === p.id
                          ? 'border-amber-500 bg-amber-500 text-slate-950 font-black shadow'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <hr className="border-slate-200" />

              {/* AÇÕES: DISPARAR AGORA OU AGENDAR */}
              <div className="space-y-3">
                <label className="block text-xs font-black uppercase text-slate-800">
                  3. O que deseja fazer?
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* AÇÃO 1: DISPARAR IMEDIATAMENTE */}
                  <div className="rounded-xl border-2 border-red-500 bg-red-50/50 p-4 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-black uppercase text-red-800">
                        <Zap className="h-4 w-4 text-red-600" />
                        Opção 1: Ao Vivo Agora
                      </div>
                      <p className="mt-1 text-[11px] text-slate-600">
                        Entra no ar imediatamente. Pausa o programa com a vinheta oficial (&quot;Estamos apresentando...&quot;) e retoma de onde parou.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowQuickBreakModal(false);
                        void handleDirectBreakTake(quickPreset);
                      }}
                      disabled={Boolean(busy) || isPaused}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 py-3 text-xs font-black uppercase text-white shadow-md transition disabled:opacity-50"
                    >
                      <Zap className="h-4 w-4" /> Disparar Agora no Ar
                    </button>
                  </div>

                  {/* AÇÃO 2: AGENDAR PARA UM HORÁRIO */}
                  <div className="rounded-xl border-2 border-indigo-400 bg-indigo-50/50 p-4 flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-black uppercase text-indigo-900">
                        <Calendar className="h-4 w-4 text-indigo-600" />
                        Opção 2: Agendar para Horário
                      </div>
                      <p className="mt-1 text-[11px] text-slate-600">
                        Programe o intervalo para entrar automaticamente no horário marcado.
                      </p>

                      <div className="mt-2 space-y-1.5">
                        <input
                          type="time"
                          value={quickScheduleTime}
                          onChange={(e) => setQuickScheduleTime(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                        />
                        {/* Atalhos Rápidos */}
                        <div className="flex flex-wrap gap-1">
                          {[
                            { label: '+10 min', addMin: 10 },
                            { label: '+20 min', addMin: 20 },
                            { label: '+30 min', addMin: 30 },
                          ].map((shortcut) => (
                            <button
                              key={shortcut.label}
                              type="button"
                              onClick={() => {
                                const d = new Date(Date.now() + shortcut.addMin * 60000);
                                setQuickScheduleTime(
                                  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                                );
                              }}
                              className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-200"
                            >
                              {shortcut.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const spotName =
                          commercialSpots.find((s) => s.id === quickSelectedSpotId)?.title ||
                          'Intervalo Comercial';
                        handleScheduleBreak(quickScheduleTime, quickPreset, spotName);
                      }}
                      disabled={!quickScheduleTime}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3 text-xs font-black uppercase text-white shadow-md transition disabled:opacity-50"
                    >
                      <Clock className="h-4 w-4" /> Confirmar Agendamento
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3 text-xs text-slate-500">
              <span>
                💡 O sistema é 100% autônomo: as vinhetas institucionais e o retorno do programa são automáticos.
              </span>
              <button
                type="button"
                onClick={() => setShowQuickBreakModal(false)}
                className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-300"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GsaTvMasterControl;
