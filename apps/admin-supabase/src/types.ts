export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'client';
  clientId?: string | null;
  active: boolean;
}

export interface Company {
  id: string;
  name: string;
  tax: string;
  email: string;
  phone: string;
  description: string;
}

export interface Client {
  id: number;
  code: string;
  type: 'PF' | 'PJ';
  name: string;
  tradeName?: string;
  tax: string;
  contact?: string;
  email: string;
  phone: string;
  whatsapp?: string;
  cep?: string;
  street?: string;
  number?: string;
  extra?: string;
  district?: string;
  city?: string;
  state?: string;
  active: boolean;
  createdAt?: string;
}

export interface Service {
  id: number;
  code: string;
  name: string;
  description: string;
  price: number;
  active: boolean;
}

export interface RPS {
  id: number;
  code: string;
  name: string;
  email?: string;
  active: boolean;
}

export interface Proposal {
  id: number;
  code: string;
  clientId: number;
  serviceId: number;
  service?: Service;
  rpsId: number;
  rpsName: string;
  title: string;
  description: string;
  status: 'Aguardando aceite' | 'Aceita' | 'Recusada' | 'Em análise' | 'Convertida';
  base: number;
  extra: number;
  extraName?: string;
  subtotal: number;
  discount: number;
  discountInput?: number;
  discountType?: 'fixed' | 'percent';
  total: number;
  term: 'fixed' | 'indefinite';
  start?: string;
  end?: string;
  fileId?: string | null;
  revised?: boolean;
  revisedAt?: string;
  acceptedAt?: string;
  acceptedBy?: string;
  previousVersion?: {
    subtotal: number;
    total: number;
    discount: number;
    discountInput: number;
    discountType: 'fixed' | 'percent';
    status: string;
    date: string;
    acceptedAt?: string;
    acceptedBy?: string;
  };
  revisionHistory?: Array<{
    revisedAt: string;
    previous: NonNullable<Proposal['previousVersion']>;
  }>;
  rejectionReason?: string;
  counteroffer?: {
    description: string;
    proposedValue: number;
    submittedAt: string;
    userName: string;
  };
}

export interface Contract {
  id: number;
  code: string;
  clientId: number;
  proposalId?: number;
  serviceId: number;
  service?: Service;
  rpsId?: number;
  rpsName?: string;
  status: 'Pendente' | 'Aguardando envio' | 'Em análise' | 'Assinado';
  start: string;
  end?: string;
  term: 'fixed' | 'indefinite';
  total: number;
  fileName?: string;
  fileId?: string;
  signingUrl?: string;
  signatureUrl?: string;
  signedFileId?: string | null;
  signedFileName?: string;
  signedSignatureFileId?: string | null;
  signedSignatureFileName?: string;
  signatureMethod?: 'gov.br' | string;
  signatureType?: 'detached' | 'enveloped' | string;
  signatureHashAlgorithm?: string;
  signedAt?: string;
}

export interface Stage {
  id: string;
  name: string;
  description?: string;
  clientUpdate?: string;
  internalNote?: string;
  requestedDocument?: string;
  requestedDocumentStatus?: 'pending' | 'analysis' | 'approved';
  requestedDocumentFile?: string;
  requestedDocumentReason?: string;
  requestedDocuments?: Array<{ id: number; name: string; status: 'pending' | 'analysis' | 'approved'; file?: string }>;
  clientUpdates?: Array<{ id: number; text: string; date: string }>;
  internalNotes?: Array<{ id: number; text: string; date: string }>;
  deadlineDays?: string;
  completedAt?: string | null;
  status: 'Concluída' | 'Em andamento' | 'Não iniciada' | 'Pendente' | 'Aguardando';
}

export interface Order {
  id: number;
  code: string;
  clientId: number;
  serviceId: number;
  service?: Service;
  rpsId?: number;
  rpsName?: string;
  title: string;
  description?: string;
  type: 'OS Única' | 'OS Recorrente';
  priority: 'Normal' | 'Alta' | 'Urgente';
  status: 'Em andamento' | 'Concluída' | 'Pendente' | 'Cancelado';
  start: string;
  end?: string;
  term?: 'fixed' | 'indefinite';
  total: number;
  stages: Stage[];
  updates?: Array<{ date: string; text: string; details?: string }>;
}

export interface Installment {
  id: number;
  number: number;
  due: string;
  amount: number;
  status: 'Pendente' | 'Pago' | 'Vencido';
  paidAt?: string;
  paidAmount?: number;
  paymentMethod?: string;
  paymentInstallments?: number;
}

export interface Invoice {
  id: number;
  code: string;
  clientId: number;
  orderId?: number;
  title: string;
  total: number;
  originalTotal?: number;
  renegotiated?: boolean;
  renegotiationHistory?: Array<{ date: string; originalTotal: number; newTotal: number }>;
  discountHistory?: Array<{ date: string; amount: number; percent: number; reason?: string }>;
  surchargeHistory?: Array<{ date: string; amount: number; percent: number; reason?: string }>;
  due: string;
  status: 'Pendente' | 'Parcial' | 'Pago' | 'Vencido';
  installments: Installment[];
  payments?: Array<{ at: string; amount: number; installment?: number }>;
  paymentHistory?: Array<{ at: string; amount: number; method: string; installments: number }>;
  changes?: Array<{ date: string; type: string; previous: number; current: number; interest?: number; penalty?: number; discount?: number }>;
}

export interface DocumentReq {
  id: number;
  clientId: number;
  orderId?: number;
  stageId?: string;
  title: string;
  description: string;
  deadline?: string;
  blocking?: boolean;
  status: 'Aguardando envio' | 'Em análise' | 'Aprovado' | 'Rejeitado';
  versions: Array<{ id: number; fileId?: string; fileName?: string; date: string; status: string }>;
  visible?: boolean;
}

export interface TicketMessage {
  id: number;
  author: string;
  role: 'admin' | 'client';
  text: string;
  files?: string[];
  internal?: boolean;
  at: string;
}

export interface Ticket {
  id: number;
  code: string;
  clientId: number;
  orderId?: number;
  title: string;
  status: 'Aberto' | 'Em atendimento' | 'Resolvido';
  messages: TicketMessage[];
}

export interface NotificationItem {
  id: string;
  clientId?: number;
  kind: string;
  recordId: any;
  target?: { screen: string; detail?: string | null } | null;
  message: string;
  audience: 'admin' | 'client';
  read?: boolean;
  createdAt: string;
}
