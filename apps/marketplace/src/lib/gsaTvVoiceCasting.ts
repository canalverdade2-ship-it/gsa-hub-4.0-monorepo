// Configuração Oficial do Casting de Vozes Escolhido pelo Usuário para a GSA TV
// Provedor: Fish Audio S2.1 Pro Free (Ilimitado via header model: s2.1-pro-free)

export type VoiceRole = 'chamadas' | 'vinhetas' | 'ancora_masc' | 'ancora_fem';

export interface VoiceProfile {
  id: string;
  role: VoiceRole;
  name: string;
  category: string;
  description: string;
  referenceId: string;
  audioDemoUrl: string;
  style: string;
  sampleText: string;
}

export const GSA_TV_OFFICIAL_VOICES: Record<VoiceRole, VoiceProfile> = {
  chamadas: {
    id: 'voice_chamadas',
    role: 'chamadas',
    name: 'Impacto Comercial (Oficial GSA TV)',
    category: 'Chamadas & Institucional',
    description: 'Voz comercial forte, ágil e moderna com dicção impecável, ideal para chamadas da grade e atrações da emissora.',
    referenceId: '5c8a9b5d0b2549c7ada853529199ebe5',
    audioDemoUrl: '/cast/opcao4_impacto_comercial.mp3',
    style: 'Impacto Comercial / Dicção Limpa & Vibrante',
    sampleText: 'Nesta sexta-feira, não perca os grandes destaques da economia e os debates mais importantes da semana. Tudo isso e muito mais, aqui na GSA TV.',
  },
  vinhetas: {
    id: 'voice_vinhetas',
    role: 'vinhetas',
    name: 'Impacto Comercial (Vinhetas & Transições)',
    category: 'Vinhetas & "A Seguir"',
    description: 'Voz vibrante e rápida para vinhetas de "A Seguir", chamadas curtas e passagens dinâmicas de bloco.',
    referenceId: '5c8a9b5d0b2549c7ada853529199ebe5',
    audioDemoUrl: '/cast/opcao4_impacto_comercial.mp3',
    style: 'Transições Rápidas / Dinâmica',
    sampleText: 'Você está assistindo à GSA TV. A seguir, continue acompanhando a nossa programação especial. GSA TV, a sua rede 24 horas no ar!',
  },
  ancora_masc: {
    id: 'voice_ancora_masc',
    role: 'ancora_masc',
    name: 'Jornalista Titular (Bancada)',
    category: 'Telejornal (Âncora Masculino Titular)',
    description: 'Narração séria, dramática e impositiva para hard news, economia, política e as manchetes da noite.',
    referenceId: 'fafc0100f94747259ecd6081ae5226aa',
    audioDemoUrl: '/cast/demo_ancora_masc.mp3',
    style: 'Jornalismo Investigativo & Notícias',
    sampleText: 'Boa noite. O mercado financeiro fechou o dia em alta e o Congresso aprovou novas medidas para o setor produtivo nacional. Acompanhe os detalhes.',
  },
  ancora_fem: {
    id: 'voice_ancora_fem',
    role: 'ancora_fem',
    name: 'Jornalista Titular (Escalada)',
    category: 'Telejornal (Âncora Feminina Titular)',
    description: 'Dicção jornalística feminina profissional em português do Brasil, conduzindo reportagens, escaladas e cidades.',
    referenceId: '74b5a4384563467b80dd0ca12ca5fd04',
    audioDemoUrl: '/cast/demo_ancora_fem.mp3',
    style: 'Jornalismo Claro & Dinâmico',
    sampleText: 'E na edição de hoje, vamos conferir também a previsão do tempo para as capitais e as principais oportunidades de emprego e negócios para esta semana.',
  },
};
