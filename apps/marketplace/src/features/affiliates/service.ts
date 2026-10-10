import { callClientRpc } from '../../lib/clientRpc';
import type {
  AffiliateCommission,
  AffiliateCommissionStatus,
  AffiliateLink,
  AffiliatePayout,
  AffiliatePayoutStatus,
  AffiliatePointsEvent,
  AffiliateProfile,
  AffiliateProgram,
  AffiliateSnapshot,
  AffiliateTransfer,
  AffiliateTransferTarget,
  ProfileAccessState,
  CreateAffiliateLinkInput,
  JoinAffiliateInput,
  AffiliateProfileInput,
} from './types';

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
);

const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (...values: unknown[]) => String(values.find(value => typeof value === 'string' && value.length > 0) || '');
const number = (...values: unknown[]) => {
  const value = values.find(candidate => candidate !== null && candidate !== undefined && Number.isFinite(Number(candidate)));
  return value === undefined ? 0 : Number(value);
};
const bool = (value: unknown, fallback = true) => typeof value === 'boolean' ? value : fallback;

const normalizeProfile = (value: unknown): AffiliateProfile | null => {
  if (!value) return null;
  const item = record(value);
  if (!text(item.id)) return null;
  return {
    id: text(item.id),
    codigoPublico: text(item.codigo_publico, item.codigoPublico),
    nomeDivulgacao: text(item.nome_divulgacao, item.nomeDivulgacao),
    nomeCompleto: text(item.nome_completo, item.nomeCompleto, item.nome) || undefined,
    cpf: text(item.cpf, item.cpf_cnpj, item.documento) || undefined,
    status: text(item.status, 'ativo') as AffiliateProfile['status'],
    pixTipo: text(item.pix_tipo, item.pixTipo),
    pixChave: text(item.pix_chave, item.pixChave),
    termosVersao: text(item.termos_versao, item.termosVersao) || undefined,
    termosAceitosEm: text(item.termos_aceitos_em, item.termosAceitosEm) || undefined,
    criadoEm: text(item.created_at, item.criado_em, item.criadoEm) || undefined,
  };
};

const normalizeProgram = (value: unknown): AffiliateProgram => {
  const item = record(value);
  return {
    id: text(item.id),
    codigo: text(item.codigo),
    nome: text(item.nome, item.codigo),
    descricao: text(item.descricao) || undefined,
    percentual: number(item.percentual),
    baseTipo: text(item.base_tipo, item.baseTipo) || undefined,
    caminhoPadrao: text(item.caminho_padrao, item.caminhoPadrao, '/'),
    janelaAtribuicaoDias: number(item.janela_atribuicao_dias, item.janelaAtribuicaoDias),
    carenciaDias: number(item.carencia_dias, item.carenciaDias),
    saqueMinimo: number(item.saque_minimo, item.saqueMinimo),
    pontosPorReal: number(item.pontos_por_real, item.pontosPorReal),
    ativo: bool(item.ativo),
  };
};

const normalizeLink = (value: unknown): AffiliateLink => {
  const item = record(value);
  return {
    id: text(item.id),
    programaId: text(item.programa_id, item.programaId),
    programaCodigo: text(item.programa_codigo, item.programaCodigo, item.codigo_programa),
    programaNome: text(item.programa_nome, item.programaNome, item.programa_codigo),
    codigo: text(item.codigo),
    destino: text(item.destino, '/'),
    titulo: text(item.titulo, item.programa_nome, item.programa_codigo, 'Link de afiliado'),
    ativo: bool(item.ativo),
    cliques: number(item.cliques, item.total_cliques),
    conversoes: number(item.conversoes, item.total_conversoes),
    comissaoTotal: number(item.comissao_total, item.total_comissao, item.comissaoTotal),
    criadoEm: text(item.created_at, item.criado_em, item.criadoEm) || undefined,
  };
};

const normalizeCommission = (value: unknown): AffiliateCommission => {
  const item = record(value);
  return {
    id: text(item.id),
    codigoReferencia: text(item.codigo_referencia, item.codigoReferencia, item.codigo_orcamento) || undefined,
    programaCodigo: text(item.programa_codigo, item.programaCodigo),
    programaNome: text(item.programa_nome, item.programaNome, item.programa_codigo, 'Programa GSA'),
    carenciaDias: number(item.carencia_dias, item.carenciaDias, 30),
    origemTipo: text(item.origem_tipo, item.source_type, item.origemTipo) || undefined,
    origemId: text(item.origem_id, item.source_id, item.origemId) || undefined,
    valorBruto: number(item.valor_bruto, item.valorBruto, item.base_elegivel, item.baseElegivel),
    baseElegivel: number(item.base_elegivel, item.baseElegivel),
    percentual: number(item.percentual),
    valor: number(item.valor),
    status: text(item.status, 'pendente') as AffiliateCommissionStatus,
    disponivelEm: text(item.disponivel_em, item.available_at, item.disponivelEm) || undefined,
    criadoEm: text(item.created_at, item.criado_em, item.criadoEm) || undefined,
  };
};

const normalizePayout = (value: unknown): AffiliatePayout => {
  const item = record(value);
  return {
    id: text(item.id),
    valor: number(item.valor),
    status: text(item.status, 'solicitado') as AffiliatePayoutStatus,
    pixTipo: text(item.pix_tipo, item.pixTipo) || undefined,
    pixChaveMascarada: text(item.pix_chave_mascarada, item.pixChaveMascarada) || undefined,
    solicitadoEm: text(item.solicitado_em, item.created_at, item.solicitadoEm) || undefined,
    pagoEm: text(item.pago_em, item.pagoEm) || undefined,
    motivo: text(item.motivo, item.observacao) || undefined,
  };
};

const normalizeTransfer = (value: unknown): AffiliateTransfer => {
  const item = record(value);
  return {
    id: text(item.id),
    codigo: text(item.codigo),
    valor: number(item.valor),
    status: text(item.status, 'concluida') as AffiliateTransfer['status'],
    direcao: text(item.direcao, 'enviada') as AffiliateTransfer['direcao'],
    contraparteNome: text(item.contraparte_nome, item.contraparteNome, 'Afiliado GSA'),
    contraparteCodigo: text(item.contraparte_codigo, item.contraparteCodigo),
    observacao: text(item.observacao) || undefined,
    concluidaEm: text(item.concluida_em, item.concluidaEm, item.created_at) || undefined,
    estornadaEm: text(item.estornada_em, item.estornadaEm) || undefined,
  };
};

const normalizeTransferTarget = (value: unknown): AffiliateTransferTarget | null => {
  const item = record(value);
  if (!text(item.id)) return null;
  return {
    id: text(item.id),
    codigoPublico: text(item.codigo_publico, item.codigoPublico),
    nomeDivulgacao: text(item.nome_divulgacao, item.nomeDivulgacao),
    nomeCompleto: text(item.nome_completo, item.nomeCompleto, item.nome) || undefined,
    email: text(item.email) || undefined,
    telefone: text(item.telefone) || undefined,
    cnpj: text(item.cnpj) || undefined,
    tipoPessoa: text(item.tipo_pessoa, item.tipoPessoa) || undefined,
    nomeMascarado: text(item.nome_mascarado, item.nomeMascarado) || undefined,
    emailMascarado: text(item.email_mascarado, item.emailMascarado) || undefined,
    telefoneMascarado: text(item.telefone_mascarado, item.telefoneMascarado) || undefined,
  };
};

const normalizePointsEvent = (value: unknown): AffiliatePointsEvent => {
  const item = record(value);
  return {
    id: text(item.id),
    tipo: text(item.tipo, 'resgate_carteira'),
    pontos: number(item.pontos, item.pontos_assinados, item.pontosAssinados),
    valorCarteira: number(item.valor_carteira, item.valorCarteira),
    metadata: record(item.metadata),
    criadoEm: text(item.created_at, item.criado_em, item.criadoEm) || undefined,
  };
};

export function normalizeAffiliateSnapshot(value: unknown): AffiliateSnapshot {
  const root = record(value);
  const summary = record(root.summary || root.resumo);
  return {
    affiliate: normalizeProfile(root.affiliate || root.afiliado),
    programs: list(root.programs || root.programas).map(normalizeProgram).filter(item => item.codigo),
    links: list(root.links).map(normalizeLink).filter(item => item.codigo),
    summary: {
      cliques: number(summary.cliques, summary.total_cliques),
      conversoes: number(summary.conversoes, summary.total_conversoes),
      totalPendente: number(summary.total_pendente, summary.totalPendente),
      totalDisponivel: number(summary.total_disponivel, summary.totalDisponivel, summary.saldo_disponivel),
      totalPago: number(summary.total_pago, summary.totalPago),
      totalSolicitado: number(summary.total_solicitado, summary.totalSolicitado),
      saqueMinimo: number(summary.saque_minimo, summary.saqueMinimo, 50),
      pontos: number(summary.pontos),
      saldoCarteira: number(summary.saldo_carteira, summary.saldoCarteira),
      pontosTaxa: number(summary.pontos_taxa, summary.pontosTaxa, 0.01),
      pontosMinimo: number(summary.pontos_minimo, summary.pontosMinimo, 100),
      pontosAtivo: bool(summary.pontos_ativo, true),
    },
    commissions: list(root.commissions || root.comissoes).map(normalizeCommission).filter(item => item.id),
    payouts: list(root.payouts || root.saques).map(normalizePayout).filter(item => item.id),
    transfers: list(root.transfers || root.transferencias).map(normalizeTransfer).filter(item => item.id),
    pointsEvents: list(root.points_events || root.pointsEvents).map(normalizePointsEvent).filter(item => item.id),
  };
}

export async function fetchAffiliateSnapshot(): Promise<AffiliateSnapshot> {
  const [snapshotData, transfersData] = await Promise.all([
    callClientRpc('gsa_client_affiliate_snapshot'),
    callClientRpc('gsa_client_affiliate_transfers').catch(() => null),
  ]);
  const snapshot = normalizeAffiliateSnapshot(snapshotData);
  const transfersRoot = record(transfersData);
  snapshot.transfers = list(transfersRoot.transfers || transfersRoot.transferencias)
    .map(normalizeTransfer)
    .filter(item => item.id);
  return snapshot;
}

export async function fetchProfileAccessState(): Promise<ProfileAccessState> {
  const root = record(await callClientRpc('gsa_client_profile_access_state'));
  return {
    clientId: text(root.client_id, root.clientId),
    clientProfileActive: bool(root.perfil_cliente_ativo, true),
    affiliateProfileActive: bool(root.perfil_afiliado_ativo, false),
    clientProfileActivatedAt: text(root.perfil_cliente_ativado_em, root.clientProfileActivatedAt) || undefined,
    registrationOrigin: text(root.cadastro_origem, root.registrationOrigin) || undefined,
  };
}

export async function activateClientProfileFromAffiliate(): Promise<ProfileAccessState> {
  await callClientRpc('gsa_affiliate_activate_client_profile');
  return fetchProfileAccessState();
}

export async function joinAffiliate(input: JoinAffiliateInput): Promise<AffiliateSnapshot> {
  await callClientRpc('gsa_client_join_affiliate', {
    p_nome_divulgacao: input.nomeDivulgacao,
    p_pix_tipo: input.pixTipo,
    p_pix_chave: input.pixChave,
    p_termos_versao: input.termosVersao,
  });
  return fetchAffiliateSnapshot();
}

export async function updateAffiliateProfile(input: AffiliateProfileInput): Promise<AffiliateSnapshot> {
  await callClientRpc('gsa_client_update_affiliate_profile', {
    p_nome_divulgacao: input.nomeDivulgacao,
    p_pix_tipo: input.pixTipo,
    p_pix_chave: input.pixChave,
  });
  return fetchAffiliateSnapshot();
}

export async function createAffiliateLink(input: CreateAffiliateLinkInput): Promise<AffiliateSnapshot> {
  await callClientRpc('gsa_client_create_affiliate_link', {
    p_programa_codigo: input.programaCodigo,
    p_destino: input.destino,
    p_titulo: input.titulo,
  });
  return fetchAffiliateSnapshot();
}

export async function requestAffiliatePayout(value: number, requestId: string): Promise<AffiliateSnapshot> {
  await callClientRpc('gsa_client_request_affiliate_payout', {
    p_request_id: requestId,
    p_valor: value,
  });
  return fetchAffiliateSnapshot();
}

export async function cancelAffiliatePayout(payoutId: string): Promise<AffiliateSnapshot> {
  await callClientRpc('gsa_client_cancel_affiliate_payout', { p_saque_id: payoutId });
  return fetchAffiliateSnapshot();
}

export async function lookupAffiliateTransferTarget(identifier: string): Promise<AffiliateTransferTarget> {
  const data = await callClientRpc('gsa_client_lookup_affiliate_transfer_target', {
    p_identificador: identifier,
  });
  const root = record(data);
  if (root.success === false) {
    throw new Error(text(root.error, 'Afiliado destinatario nao encontrado.'));
  }
  const target = normalizeTransferTarget(root.target);
  if (!target) {
    throw new Error('Afiliado destinatario nao encontrado.');
  }
  return target;
}

export async function transferAffiliateBalance(
  targetId: string,
  value: number,
  requestId: string,
  note?: string,
): Promise<AffiliateSnapshot> {
  await callClientRpc('gsa_client_transfer_affiliate_balance', {
    p_request_id: requestId,
    p_destinatario_id: targetId,
    p_valor: value,
    p_observacao: note || null,
  });
  return fetchAffiliateSnapshot();
}

export async function reverseReceivedAffiliateTransfer(transferId: string): Promise<AffiliateSnapshot> {
  await callClientRpc('gsa_client_reverse_received_affiliate_transfer', {
    p_transferencia_id: transferId,
  });
  return fetchAffiliateSnapshot();
}

export async function redeemAffiliatePoints(points: number, requestId: string): Promise<AffiliateSnapshot> {
  await callClientRpc('gsa_client_redeem_affiliate_points', {
    p_request_id: requestId,
    p_pontos: points,
  });
  return fetchAffiliateSnapshot();
}
