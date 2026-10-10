export type AffiliateStatus = 'ativo' | 'suspenso' | 'encerrado';
export type AffiliateCommissionStatus = 'pendente' | 'disponivel' | 'paga' | 'revertida';
export type AffiliatePayoutStatus = 'solicitado' | 'aprovado' | 'pago' | 'rejeitado' | 'cancelado';
export type AffiliateTransferStatus = 'concluida' | 'cancelada' | 'estornada';

/** Versão vigente dos Termos de Uso do Programa de Afiliados.
 *  Altere SOMENTE aqui sempre que publicar novos termos.
 *  Usar em AffiliateAccessPage (registerAffiliate) e AfiliadoDashboard (activateProfile). */
export const AFFILIATE_CURRENT_TERMS_VERSION = '2026-08-29';


export interface AffiliateProfile {
  id: string;
  codigoPublico: string;
  nomeDivulgacao: string;
  nomeCompleto?: string;
  cpf?: string;
  status: AffiliateStatus;
  pixTipo: string;
  pixChave: string;
  termosVersao?: string;
  termosAceitosEm?: string;
  criadoEm?: string;
}


export interface AffiliateProgram {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string;
  percentual: number;
  baseTipo?: string;
  caminhoPadrao: string;
  janelaAtribuicaoDias: number;
  carenciaDias: number;
  saqueMinimo: number;
  pontosPorReal: number;
  ativo: boolean;
}

export interface AffiliateLink {
  id: string;
  programaId: string;
  programaCodigo: string;
  programaNome: string;
  codigo: string;
  destino: string;
  titulo: string;
  ativo: boolean;
  cliques: number;
  conversoes: number;
  comissaoTotal: number;
  criadoEm?: string;
}

export interface AffiliateCommission {
  id: string;
  codigoReferencia?: string;
  programaCodigo: string;
  programaNome: string;
  carenciaDias?: number;
  origemTipo?: string;
  origemId?: string;
  valorBruto?: number;
  baseElegivel: number;
  percentual: number;
  valor: number;
  status: AffiliateCommissionStatus;
  disponivelEm?: string;
  criadoEm?: string;
}

export interface AffiliatePayout {
  id: string;
  valor: number;
  status: AffiliatePayoutStatus;
  pixTipo?: string;
  pixChaveMascarada?: string;
  solicitadoEm?: string;
  pagoEm?: string;
  motivo?: string;
}

export interface AffiliateTransfer {
  id: string;
  codigo: string;
  valor: number;
  status: AffiliateTransferStatus;
  direcao: 'enviada' | 'recebida';
  contraparteNome: string;
  contraparteCodigo: string;
  observacao?: string;
  concluidaEm?: string;
  estornadaEm?: string;
}

export interface AffiliateSummary {
  cliques: number;
  conversoes: number;
  totalPendente: number;
  totalDisponivel: number;
  totalPago: number;
  totalSolicitado: number;
  saqueMinimo: number;
  pontos?: number;
  saldoCarteira?: number;
  pontosTaxa?: number;
  pontosMinimo?: number;
  pontosAtivo?: boolean;
}

export interface AffiliatePointsEvent {
  id: string;
  tipo: string;
  pontos: number;
  valorCarteira: number;
  metadata?: Record<string, any>;
  criadoEm?: string;
}

export interface AffiliateSnapshot {
  affiliate: AffiliateProfile | null;
  programs: AffiliateProgram[];
  links: AffiliateLink[];
  summary: AffiliateSummary;
  commissions: AffiliateCommission[];
  payouts: AffiliatePayout[];
  transfers?: AffiliateTransfer[];
  pointsEvents?: AffiliatePointsEvent[];
}

export interface AffiliateProfileInput {
  nomeDivulgacao: string;
  pixTipo: string;
  pixChave: string;
}

export interface JoinAffiliateInput extends AffiliateProfileInput {
  termosVersao: string;
}

export interface CreateAffiliateLinkInput {
  programaCodigo: string;
  destino: string;
  titulo: string;
}

export interface AffiliateTransferTarget {
  id: string;
  codigoPublico: string;
  nomeDivulgacao: string;
  nomeCompleto?: string;
  email?: string;
  telefone?: string;
  cnpj?: string;
  tipoPessoa?: string;
  nomeMascarado?: string;
  emailMascarado?: string;
  telefoneMascarado?: string;
}

export interface ProfileAccessState {
  clientId: string;
  clientProfileActive: boolean;
  affiliateProfileActive: boolean;
  clientProfileActivatedAt?: string;
  registrationOrigin?: string;
}
