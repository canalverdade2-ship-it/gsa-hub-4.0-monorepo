export type CopyrightRiskLevel = 'low' | 'moderate' | 'high';

export type CopyrightCategory =
  | 'broadcast_tv'
  | 'record_label'
  | 'sports'
  | 'commercial_film'
  | 'public_domain'
  | 'independent_creator'
  | 'generic_stream';

export type CopyrightAnalysisResult = {
  url: string;
  provider: 'youtube' | 'web_stream' | 'direct_video';
  title: string;
  authorName?: string;
  authorUrl?: string;
  thumbnailUrl?: string;
  riskLevel: CopyrightRiskLevel;
  riskScore: number; // 0 to 100
  riskTitle: string;
  category: CopyrightCategory;
  categoryLabel: string;
  holder: string;
  summary: string;
  youtubePolicy: string;
  recommendations: string[];
};

// Grandes emissoras e grupos de comunicação comercial (monitoramento severo no Content ID)
const BROADCAST_NETWORKS = [
  { key: 'gazeta', name: 'TV Gazeta / Fundação Cásper Líbero' },
  { key: 'globo', name: 'Grupo Globo (TV Globo / G1 / GE)' },
  { key: 'record', name: 'Record TV' },
  { key: 'sbt', name: 'SBT (Sistema Brasileiro de Televisão)' },
  { key: 'band', name: 'Rede Bandeirantes (Band)' },
  { key: 'redetv', name: 'RedeTV!' },
  { key: 'cnn', name: 'CNN Brasil / Warner Bros. Discovery' },
  { key: 'jovempan', name: 'Grupo Jovem Pan' },
  { key: 'espn', name: 'ESPN / The Walt Disney Company' },
  { key: 'sportv', name: 'SporTV / Canais Globo' },
  { key: 'premiere', name: 'Premiere / Grupo Globo' },
  { key: 'combate', name: 'Canal Combate' },
  { key: 'cazetv', name: 'CazéTV / LiveMode' },
  { key: 'tnt', name: 'TNT Sports / Warner' },
  { key: 'paramount', name: 'Paramount Global' },
  { key: 'fox', name: 'Fox / Disney' },
  { key: 'disney', name: 'The Walt Disney Company' },
  { key: 'warner', name: 'Warner Bros. Discovery' },
  { key: 'hbo', name: 'HBO / Max' },
  { key: 'netflix', name: 'Netflix' },
  { key: 'bbc', name: 'BBC News / Studios' },
  { key: 'reuters', name: 'Reuters' },
];

// Gravadoras fonográficas e distribuidoras musicais
const RECORD_LABELS = [
  { key: 'vevo', name: 'VEVO Music Network' },
  { key: 'somlivre', name: 'Som Livre' },
  { key: 'warner music', name: 'Warner Music Group' },
  { key: 'sony music', name: 'Sony Music Entertainment' },
  { key: 'universal music', name: 'Universal Music Group' },
  { key: 'kondzilla', name: 'KondZilla Filmes' },
  { key: 'gr6', name: 'GR6 Explode' },
  { key: 'mkmusic', name: 'MK Music' },
  { key: 'todah', name: 'Todah Music' },
  { key: 'gravadora', name: 'Gravadora Fonográfica' },
  { key: 'records', name: 'Selo Fonográfico / Gravadora' },
];

// Ligas e eventos esportivos exclusivos
const SPORTS_ENTITIES = [
  { key: 'fifa', name: 'FIFA' },
  { key: 'conmebol', name: 'CONMEBOL' },
  { key: 'cbf', name: 'CBF' },
  { key: 'brasileirao', name: 'Brasileirão Série A/B' },
  { key: 'libertadores', name: 'Copa Libertadores' },
  { key: 'champions', name: 'UEFA Champions League' },
  { key: 'ufc', name: 'UFC' },
  { key: 'f1', name: 'Fórmula 1 (FOM)' },
  { key: 'formula 1', name: 'Fórmula 1' },
  { key: 'nba', name: 'NBA' },
  { key: 'olympics', name: 'Comitê Olímpico (COI)' },
];

// Domínio público, governamental e livre
const PUBLIC_ORGS = [
  { key: 'tv brasil', name: 'TV Brasil / EBC' },
  { key: 'ebc', name: 'Empresa Brasil de Comunicação (EBC)' },
  { key: 'senado', name: 'TV Senado Federal' },
  { key: 'camara', name: 'TV Câmara' },
  { key: 'stf', name: 'TV Justiça / STF' },
  { key: 'governo', name: 'Governo Federal / Órgão Público' },
  { key: 'gov.br', name: 'Portal Institucional gov.br' },
  { key: 'nasa', name: 'NASA (Domínio Público)' },
  { key: 'unesco', name: 'UNESCO' },
  { key: 'creative commons', name: 'Licença Creative Commons' },
  { key: 'archive.org', name: 'Internet Archive (Acervo Livre)' },
  { key: 'dominio publico', name: 'Domínio Público' },
  { key: 'public domain', name: 'Domínio Público Internacional' },
];

export async function analyzeUrlCopyright(rawUrl: string): Promise<CopyrightAnalysisResult> {
  const cleanUrl = rawUrl.trim();
  if (!cleanUrl) {
    throw new Error('URL vazia para análise.');
  }

  const isYouTube =
    cleanUrl.includes('youtube.com/') ||
    cleanUrl.includes('youtu.be/');

  if (isYouTube) {
    return analyzeYouTubeUrl(cleanUrl);
  }

  return analyzeGenericUrl(cleanUrl);
}

async function analyzeYouTubeUrl(url: string): Promise<CopyrightAnalysisResult> {
  let oembedData: any = null;
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(oembedUrl);
    if (response.ok) {
      oembedData = await response.json();
    }
  } catch {
    // Silencioso se oEmbed falhar por rede/bloqueio
  }

  const title = oembedData?.title || 'Transmissão no YouTube';
  const authorName = oembedData?.author_name || '';
  const authorUrl = oembedData?.author_url || '';
  const thumbnailUrl = oembedData?.thumbnail_url || '';

  const searchText = `${title} ${authorName} ${authorUrl} ${url}`.toLowerCase();

  // 1. Testar se é Emissora Comercial de TV
  for (const b of BROADCAST_NETWORKS) {
    if (searchText.includes(b.key)) {
      return {
        url,
        provider: 'youtube',
        title,
        authorName,
        authorUrl,
        thumbnailUrl,
        riskLevel: 'high',
        riskScore: 94,
        riskTitle: `ALTO RISCO DE CONTENT ID — EMISSORA DE TELEVISÃO`,
        category: 'broadcast_tv',
        categoryLabel: 'Emissora Comercial de TV',
        holder: `${b.name} (${authorName || b.key})`,
        summary: `Este conteúdo é de titularidade de uma emissora comercial de televisão (${b.name}).`,
        youtubePolicy:
          'O YouTube possui detecção ativa e em tempo real (Content ID) para sinais de emissoras de TV aberta e fechada. A retransmissão simultânea não autorizada provoca o bloqueio ou encerramento imediato da transmissão ao vivo pelo YouTube.',
        recommendations: [
          'Não retransmita o programa ao vivo na íntegra sem contrato de afiliação ou cessão de direitos.',
          'Se o objetivo for jornalístico, utilize apenas citações curtas comentadas (Fair Use / Direito de Informação).',
          'Para manter o canal no ar 24h seguro no YouTube, prefira conteúdos de domínio público ou produções próprias.',
        ],
      };
    }
  }

  // 2. Testar se é Esporte / Competição Oficial
  for (const s of SPORTS_ENTITIES) {
    if (searchText.includes(s.key)) {
      return {
        url,
        provider: 'youtube',
        title,
        authorName,
        authorUrl,
        thumbnailUrl,
        riskLevel: 'high',
        riskScore: 98,
        riskTitle: `BLOQUEIO IMEDIATO — TRANSMISSÃO ESPORTIVA EXCLUSIVA`,
        category: 'sports',
        categoryLabel: 'Evento Esportivo Protegido',
        holder: s.name,
        summary: `Eventos esportivos e partidas possuem direitos de transmissão altamente exclusivos e patrulhados.`,
        youtubePolicy:
          'O sistema de proteção anti-pirataria do YouTube encerra sumariamente transmissões ao vivo que reproduzam imagens ou áudios de partidas esportivas licenciadas.',
        recommendations: [
          'É expressamente desaconselhado colocar sinal ao vivo de partidas ou lutas oficiais na grade.',
          'Utilize apenas narração em estúdio com placar e gráficos próprios sem espelhar o feed de vídeo da partida.',
        ],
      };
    }
  }

  // 3. Testar se é Fonograma / Gravadora Musical
  for (const r of RECORD_LABELS) {
    if (searchText.includes(r.key)) {
      return {
        url,
        provider: 'youtube',
        title,
        authorName,
        authorUrl,
        thumbnailUrl,
        riskLevel: 'high',
        riskScore: 88,
        riskTitle: `ALTO RISCO — MÚSICA / GRAVADORA COMERCIAL`,
        category: 'record_label',
        categoryLabel: 'Música & Fonograma Comercial',
        holder: `${r.name} (${authorName || r.key})`,
        summary: `Material com fonograma registrado por gravadora comercial ou distribuidora de música.`,
        youtubePolicy:
          'O Content ID de áudio do YouTube identifica faixas protegidas em menos de 3 minutos de execução, podendo emudecer o canal ou gerar aviso de direitos autorais.',
        recommendations: [
          'Substitua por músicas de domínio público, biblioteca livre ou produções da GSA Music.',
          'Evite clipes oficiais de grandes artistas sem autorização expressa.',
        ],
      };
    }
  }

  // 4. Testar se é Órgão Público / Domínio Público / Governo
  for (const p of PUBLIC_ORGS) {
    if (searchText.includes(p.key)) {
      return {
        url,
        provider: 'youtube',
        title,
        authorName,
        authorUrl,
        thumbnailUrl,
        riskLevel: 'low',
        riskScore: 10,
        riskTitle: `CONTEÚDO SEGURO — ÓRGÃO PÚBLICO / LIVRE`,
        category: 'public_domain',
        categoryLabel: 'Domínio Público / Institucional',
        holder: p.name,
        summary: `Conteúdo de interesse público, governamental ou de divulgação autorizada (${p.name}).`,
        youtubePolicy:
          'Material livre para exibição pública sem restrições de Content ID agressivo pelo YouTube.',
        recommendations: [
          'Excelente para preenchimento de grade e programação informativa da GSA TV.',
          'Recomenda-se manter a identificação visual da fonte no GC ou créditos.',
        ],
      };
    }
  }

  // 5. Canal Geral / Criador Independente
  return {
    url,
    provider: 'youtube',
    title,
    authorName: authorName || 'Canal do YouTube',
    authorUrl,
    thumbnailUrl,
    riskLevel: 'moderate',
    riskScore: 48,
    riskTitle: `RISCO MODERADO — CRIADOR DE CONTEÚDO INDEPENDENTE`,
    category: 'independent_creator',
    categoryLabel: 'Criador Independente',
    holder: authorName || 'Autor no YouTube',
    summary: `Vídeo publicado por criador independente. Não foi identificado vínculo direto com grandes emissoras de TV ou gravadoras.`,
    youtubePolicy:
      'Pode conter trilhas musicais ou trechos com reivindicação de monetização. Geralmente não bloqueia a transmissão, mas pode receber reivindicação de Content ID do criador da trilha.',
    recommendations: [
      'Verifique se a música de fundo é livre de royalties.',
      'Dê crédito ao canal de origem na tela durante a exibição.',
    ],
  };
}

function analyzeGenericUrl(url: string): CopyrightAnalysisResult {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    // Domínios governamentais e públicos
    if (
      host.endsWith('.gov.br') ||
      host.endsWith('.ebc.com.br') ||
      host.includes('archive.org') ||
      host.includes('wikimedia.org') ||
      host.includes('pexels.com') ||
      host.includes('pixabay.com')
    ) {
      return {
        url,
        provider: pathname.includes('.m3u8') ? 'web_stream' : 'direct_video',
        title: parsed.pathname.split('/').pop() || 'Arquivo de Mídia Oficial',
        riskLevel: 'low',
        riskScore: 8,
        riskTitle: `SINAL SEGURO — DOMÍNIO PÚBLICO / GOVERNO`,
        category: 'public_domain',
        categoryLabel: 'Domínio Público / Governo',
        holder: host,
        summary: `A URL aponta para um servidor governamental ou acervo aberto (${host}).`,
        youtubePolicy:
          'Servidores de livre acesso e domínio público não possuem Content ID restritivo no YouTube.',
        recommendations: [
          'Material totalmente seguro para exibição contínua na GSA TV.',
        ],
      };
    }

    // Domínios de emissoras comerciais
    if (
      host.includes('globo.com') ||
      host.includes('record') ||
      host.includes('sbt.com.br') ||
      host.includes('band.uol.com.br') ||
      host.includes('gazeta')
    ) {
      return {
        url,
        provider: 'web_stream',
        title: 'Transmissão de Emissora Comercial',
        riskLevel: 'high',
        riskScore: 92,
        riskTitle: `ALTO RISCO — SERVIDOR DE EMISSORA DE TV`,
        category: 'broadcast_tv',
        categoryLabel: 'Rede Comercial de Televisão',
        holder: host,
        summary: `O link pertence à infraestrutura de uma emissora de TV comercial (${host}).`,
        youtubePolicy:
          'Transmissões retransmitidas de emissoras comerciais são monitoradas e derrubadas com alta probabilidade.',
        recommendations: [
          'Requer autorização formal de retransmissão de sinal.',
        ],
      };
    }
  } catch {
    // URL parsing falhou
  }

  return {
    url,
    provider: 'web_stream',
    title: 'Sinal Externo de Transmissão',
    riskLevel: 'moderate',
    riskScore: 40,
    riskTitle: `STREAM INDEPENDENTE / ACERVO WEB`,
    category: 'generic_stream',
    categoryLabel: 'Transmissão Web Genérica',
    holder: 'Servidor Externo',
    summary: 'Fonte externa de transmissão. Certifique-se de que a mídia é livre de direitos autorais protegidos.',
    youtubePolicy:
      'Transmissões com trilhas sonoras comerciais podem sofrer reivindicações automatizadas de áudio.',
    recommendations: [
      'Confirme se o conteúdo exibido possui trilha sonora livre de direitos.',
    ],
  };
}
