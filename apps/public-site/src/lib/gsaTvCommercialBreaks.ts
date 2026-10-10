// ──────────────────────────────────────────────────────────────────────────────
// GSA TV • Sistema de Gerenciamento de Intervalos Comerciais (Breaks Master)
// 100% Baseado em Dados e Peças Reais Cadastradas pelo Usuário
// ──────────────────────────────────────────────────────────────────────────────

export type BreakDurationPreset = '1min' | '2min' | '3min' | 'continuous';

export type SpotCategory = 'sponsor' | 'promo' | 'institutional' | 'public_service' | 'bumper';

export type SpotSourceType = 'url' | 'library' | 'upload';

export interface CommercialSpot {
  id: string;
  title: string;
  advertiser: string;
  category: SpotCategory;
  duration_s: number;
  sourceType?: SpotSourceType;
  videoUrl?: string;
  libraryMediaId?: string;
  fileName?: string;
  active: boolean;
}

export interface ActiveBreak {
  preset: BreakDurationPreset;
  title: string;
  totalDuration_s: number;
  remaining_s: number;
  spots: CommercialSpot[];
  currentSpotIndex: number;
  startedAt: number;
}

export interface ScheduledBreak {
  id: string;
  time: string;
  preset: BreakDurationPreset;
  spotTitle: string;
  spotId?: string;
  createdAt: number;
}

export const CATEGORY_METADATA: Record<
  SpotCategory,
  { label: string; badgeColor: string; icon: string; desc: string }
> = {
  sponsor: {
    label: 'Patrocinador',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: '💼',
    desc: 'Anunciante ou empresa parceira real cadastrada.',
  },
  promo: {
    label: 'Chamada da Grade',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: '📢',
    desc: 'Chamada promocional de atrações da GSA TV.',
  },
  institutional: {
    label: 'Institucional',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: '🏢',
    desc: 'Vídeo institucional da emissora ou do Grupo GSA.',
  },
  public_service: {
    label: 'Utilidade Pública',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: '🕒',
    desc: 'Avisos à comunidade, campanhas e hora certa.',
  },
  bumper: {
    label: 'Vinheta de Continuidade',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    icon: '🎬',
    desc: 'Vinheta técnica de ida ou volta do intervalo.',
  },
};

// ZERO dados fictícios: a biblioteca inicia vazia aguardando o cadastro real do operador
export const DEFAULT_COMMERCIAL_SPOTS: CommercialSpot[] = [];

/**
 * Monta o roteiro sequencial de spots para o break utilizando estritamente as peças reais cadastradas
 */
export function buildBreakPlaylist(
  preset: BreakDurationPreset,
  library: CommercialSpot[],
  currentProgramTitle?: string
): { totalDuration_s: number; spots: CommercialSpot[] } {
  const activeSpots = library.filter((s) => s.active);

  const cleanProgram =
    currentProgramTitle?.trim() &&
    currentProgramTitle !== 'Programação Oficial GSA TV' &&
    currentProgramTitle !== 'Tela de Continuidade / Intervalo'
      ? currentProgramTitle.trim()
      : null;

  // Se o usuário ainda não cadastrou nenhuma peça real, exibe a cartela técnica de continuidade da emissora
  if (activeSpots.length === 0 || preset === 'continuous') {
    const defaultDuration =
      preset === '1min' ? 60 : preset === '2min' ? 120 : preset === '3min' ? 180 : 0;

    return {
      totalDuration_s: defaultDuration,
      spots: [
        {
          id: 'station-continuity-card',
          title: cleanProgram
            ? `Intervalo Comercial: ${cleanProgram} (Voltamos Já)`
            : 'Intervalo da Programação — Voltamos Já',
          advertiser: 'GSA TV',
          category: 'bumper',
          duration_s: defaultDuration,
          active: true,
        },
      ],
    };
  }

  // Se o usuário cadastrou peças reais, monta o roteiro respeitando o tempo do preset
  const targetDuration_s = preset === '1min' ? 60 : preset === '2min' ? 120 : 180;
  const spots: CommercialSpot[] = [];
  let accumulatedTime = 0;
  let idx = 0;

  while (accumulatedTime < targetDuration_s && idx < activeSpots.length * 4) {
    const spot = activeSpots[idx % activeSpots.length];
    const remainingTime = targetDuration_s - accumulatedTime;

    if (remainingTime <= 0) break;

    // Se o spot couber no tempo restante ou se for o único spot
    if (spot.duration_s <= remainingTime || spots.length === 0) {
      spots.push(spot);
      accumulatedTime += spot.duration_s;
    } else {
      // Ajusta o último spot para preencher exatamente o tempo do break
      spots.push({
        ...spot,
        duration_s: remainingTime,
      });
      accumulatedTime += remainingTime;
      break;
    }
    idx++;
  }

  return {
    totalDuration_s: accumulatedTime,
    spots,
  };
}

/**
 * Formata segundos no formato MM:SS
 */
export function formatSecondsToTime(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
