export type PartnerStatus = 'em_analise' | 'ativo' | 'inativo' | 'encerrado' | 'excluido';
export type PartnerServiceMode = 'presencial' | 'online' | 'hibrido';
export type PartnerApplicationSource = 'admin' | 'public_form';

export interface Partner {
  id: string;
  slug: string;
  name: string;
  legal_name?: string | null;
  tax_document?: string | null;
  category: string;
  short_description: string;
  description?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  linkedin?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  maps_url?: string | null;
  business_hours?: string | null;
  service_mode: PartnerServiceMode;
  service_regions: string[];
  services: string[];
  products: string[];
  benefits?: string | null;
  contact_person?: string | null;
  internal_notes?: string | null;
  featured: boolean;
  display_order: number;
  status: PartnerStatus;
  application_source?: PartnerApplicationSource;
  application_protocol?: string | null;
  submitted_at?: string | null;
  privacy_consent_at?: string | null;
  redemption_has_coupon?: boolean;
  redemption_coupon_code?: string | null;
  redemption_has_voucher?: boolean;
  redemption_has_link?: boolean;
  redemption_link?: string | null;
  redemption_auto_redirect?: boolean;
  redemption_instructions?: string | null;
  redemption_delay_24h?: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartnerBenefitRedemptionPayload {
  parceiroId?: string;
  parceiroSlug?: string;
  nomeCompleto: string;
  email?: string;
  telefone: string;
  clienteId?: string;
  justificativaDuplicidade?: string;
  alertaDuplicidade?: boolean;
  forceOverride?: boolean;
}

export interface PartnerRedemption {
  id: string;
  parceiro_id: string;
  cliente_id?: string | null;
  nome_completo: string;
  email?: string | null;
  telefone: string;
  cpf?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  codigo_gerado?: string | null;
  tipo_resgate: string;
  link_destino?: string | null;
  link_ativacao?: string | null;
  status?: 'pendente' | 'concluido' | 'analise' | 'recusado' | string;
  alerta_duplicidade?: boolean;
  justificativa_duplicidade?: string | null;
  motivo_recusa?: string | null;
  motivo_cancelamento?: string | null;
  data_cancelamento?: string | null;
  recusado_em?: string | null;
  data_ativacao?: string | null;
  recurso?: PartnerRedemptionAppeal | null;
  auto_redirecionado: boolean;
  created_at: string;
  parceiro_name?: string;
  parceiro_slug?: string;
  parceiro_benefits?: string;
  parceiro_logo?: string | null;
}

export type PartnerRedemptionAppealStatus = 'em_analise' | 'deferido' | 'indeferido';

export interface PartnerRedemptionAppeal {
  id: string;
  protocolo_recurso: string;
  contestacao_cliente: string;
  status: PartnerRedemptionAppealStatus;
  aberto_em: string;
  prazo_analise_em: string;
  analisado_em?: string | null;
  motivo_decisao?: string | null;
  evidencias?: string[];
}

export interface PartnerRedemptionTimelineEvent {
  id: string;
  tipo: string;
  titulo: string;
  descricao?: string | null;
  ocorrido_em: string;
}

export interface PartnerBenefitRedemptionResult {
  success: boolean;
  resgate_id: string;
  partner_name: string;
  partner_slug: string;
  partner_logo?: string | null;
  benefits?: string | null;
  tipo_resgate: 'cupom' | 'voucher' | 'link' | 'combinado';
  status?: string;
  codigo_gerado?: string | null;
  protocolo?: string | null;
  has_coupon: boolean;
  has_voucher: boolean;
  has_link: boolean;
  link?: string | null;
  auto_redirect: boolean;
  instructions?: string | null;
  delay_24h?: boolean;
}

export type PartnerFormData = Omit<
  Partner,
  | 'id'
  | 'tax_document'
  | 'application_source'
  | 'application_protocol'
  | 'submitted_at'
  | 'privacy_consent_at'
  | 'created_at'
  | 'updated_at'
>;

export interface PartnerApplicationData {
  name: string;
  legal_name: string;
  tax_document: string;
  category: string;
  short_description: string;
  description: string;
  contact_person: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
  business_hours: string;
  service_mode: PartnerServiceMode;
  service_regions: string[];
  services: string[];
  products: string[];
  benefits: string;
  privacy_consent: boolean;
  started_at: string;
  company_website: string;
}

export interface PartnerApplicationResult {
  success: boolean;
  protocol: string;
  message: string;
}

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  em_analise: 'Em análise',
  ativo: 'Ativo',
  inativo: 'Inativo',
  encerrado: 'Encerrado',
  excluido: 'Excluído',
};


export const PARTNER_MODE_LABELS: Record<PartnerServiceMode, string> = {
  presencial: 'Presencial',
  online: 'On-line',
  hibrido: 'Presencial e on-line',
};

export interface ProtocolConsultResult {
  codigo: string;
  protocolo_resgate?: string;
  tracking_key: string;
  status: 'pendente' | 'concluido' | 'analise' | 'recusado';
  parceiro_nome: string;
  parceiro_slug: string;
  parceiro_logo: string | null;
  nome_completo: string;
  telefone: string;
  email: string | null;
  tipo_resgate: string;
  link_ativacao: string | null;
  cupom: string | null;
  voucher: string | null;
  instructions: string | null;
  delay_24h: boolean;
  created_at: string;
  data_ativacao?: string | null;
  recusado_em?: string | null;
  motivo_recusa?: string | null;
  recurso?: PartnerRedemptionAppeal | null;
  eventos: PartnerRedemptionTimelineEvent[];
}
