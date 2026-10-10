import type { ProductVariationsPayload } from './types/productVariations';

export type Module = 'dashboard' | 'perfil' | 'orcamentos' | 'servicos' | 'produtos' | 'assinaturas' | 'servicos_assinaturas' | 'transferencias' | 'financeiro' | 'fidelidade' | 'cobranca' | 'vouchers' | 'suporte' | 'indique-ganhe' | 'pontos' | 'promocoes' | 'premios' | 'historico_niveis' | 'area_vip' | 'loja' | 'credito_loja';

export interface ProdutoFornecedorConfig {
  produto_id?: string;
  fornecimento_externo_ativo: boolean;
  tipo_fornecedor?: 'online' | 'loja_fisica' | null;
  nome_fornecedor?: string | null;
  url_produto?: string | null;
  cidade?: string | null;
  estado?: string | null;
  endereco?: string | null;
  telefone?: string | null;
  observacoes?: string | null;
  created_at?: string;
  updated_at?: string;
}


export type Cliente = {
  id: string;
  codigo_cliente: string;
  nome: string;
  cpf?: string;
  cnpj?: string;
  tipo_pessoa: 'pf' | 'pj';
  telefone?: string;
  data_cadastro?: string;
  email?: string;
  data_nascimento?: string;
  cep?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  observacoes?: string;
  status?: 'ativo' | 'inativo';
  saldo_carteira?: number;
  saldo_pontos?: number;
  indicacao_origem_id?: string;
  carteira_bloqueada?: boolean;
  pontos_bloqueados?: boolean;
  cadastro_aprovado?: boolean;
  bonus_boas_vindas_pendente?: boolean;
  saque_liberado_manual?: boolean;
  motivo_bloqueio_cadastro?: string;
  motivo_bloqueio_carteira?: string;
  motivo_bloqueio_pontos?: string;
  bloqueado?: boolean;
  nivel_id?: string;
  nivel_manual_id?: string | null;
  nivel_manual_info?: string | null;
  pontos_totais?: number;
  auto_level?: {
    nome_nivel: string;
    pontos_minimos: number;
    pontos_maximos?: number | null;
    pontos_por_real: number;
    cor: string;
    cor_texto?: string;
    visual_style?: string;
    preco?: number;
    taxa_saque_transferencia?: number;
    benefits?: string[];
    exclusive_benefits?: string[];
  };
  manual_level?: {
    nome_nivel: string;
    pontos_minimos: number;
    pontos_maximos?: number | null;
    pontos_por_real: number;
    cor: string;
    cor_texto?: string;
    visual_style?: string;
    preco?: number;
    taxa_saque_transferencia?: number;
    benefits?: string[];
    exclusive_benefits?: string[];
  };
  nome_razao?: string;
  client_levels?: Record<string, unknown>;
  limite_credito_total?: number;
  limite_credito_disponivel?: number;
  limite_credito_bloqueado?: number;
  opcao_pagamento_parcelado?: boolean;
  max_parcelas?: number;
};

export interface LojaCategoria {
  id: string;
  nome: string;
  slug: string;
  icone?: string;
  imagem_url?: string;
  ordem?: number;
  status: 'ativo' | 'inativo';
  tipo_item?: 'produto' | 'assinatura' | 'servico' | 'todos';
  created_at?: string;
  updated_at?: string;
};

export type Servico = {
  id: string;
  codigo_servico: string;
  nome: string;
  descricao: string;
  valor: number;
  status: 'ativo' | 'inativo';
  tipo_cliente: 'pf' | 'pj' | 'ambos';
  categoria?: string;
  categoria_id?: string;
  ocultar_valor?: boolean;
  visivel_na_loja?: boolean;
  subtitulo_catalogo?: string;
  visivel_catalogo_publico?: boolean;
  disponivel_orcamento?: boolean;
  ordem_catalogo?: number;
  imagem_url?: string;
  imagens_adicionais?: string[];
};

export type Produto = {
  id: string;
  codigo_produto: string;
  codigo_barras?: string | null;
  identificador_preferencial?: 'interno' | 'codigo_barras';
  tipo_codigo_barras?: 'EAN-8' | 'UPC-A' | 'EAN-13' | 'GTIN-14' | 'OUTRO' | null;
  nome: string;
  descricao: string;
  valor: number;
  status: 'ativo' | 'inativo';
  tipo_cliente: 'pf' | 'pj' | 'ambos';
  categoria?: string;
  categoria_id?: string;
  ocultar_valor?: boolean;
  visivel_na_loja?: boolean;
  imagem_url?: string;
  controle_estoque?: boolean;
  estoque_disponivel?: number;
  valor_custo?: number;
  porcentagem_lucro?: number;
  imagens_adicionais?: string[];
  link_afiliado?: string;
  possui_variacoes?: boolean;
  variacoes?: ProductVariationsPayload;
  
  // Desconto individual de produtos
  desconto_ativo?: boolean;
  desconto_tipo?: 'porcentagem' | 'valor' | null;
  desconto_valor?: number | null;
  valor_promocional?: number | null;
  desconto_percentual?: number | null;
  desconto_atualizado_em?: string | null;
  desconto_prazo_tipo?: 'determinado' | 'indeterminado';
  desconto_fim_em?: string | null;
  // Controle de cota promocional (quantidade limitada)
  desconto_limite_quantidade_ativo?: boolean;
  desconto_quantidade_limite?: number | null;
  desconto_quantidade_utilizada?: number;
  desconto_campanha_id?: string | null;
};

/** Informações sobre a cota de quantidade promocional de um produto */
export interface PromotionQuantityInfo {
  limitadoPorQuantidade: boolean;
  quantidadeLimite: number | null;
  quantidadeUtilizada: number;
  quantidadeRestante: number | null; // null = ilimitado
  campanhaId: string | null;
  esgotadaPorQuantidade: boolean;
}

/** Detalhamento de preço quando parte da quantidade tem desconto e parte não */
export interface ProductQuantityPriceBreakdown {
  quantidadeSolicitada: number;
  quantidadeComDesconto: number;
  quantidadeSemDesconto: number;
  valorNormalUnitario: number;
  valorPromocionalUnitario: number | null;
  subtotalComDesconto: number;
  subtotalSemDesconto: number;
  subtotalFinal: number;
  quantidadeRestanteAntes: number | null;
  campanhaId: string | null;
}

export type Assinatura = {
  id: string;
  codigo_assinatura: string;
  nome: string;
  descricao: string;
  valor: number;
  status: 'ativo' | 'inativo';
  tipo_cliente: 'pf' | 'pj' | 'ambos';
  categoria?: string;
  categoria_id?: string;
  ocultar_valor?: boolean;
  visivel_na_loja?: boolean;
  imagem_url?: string;
  imagens_adicionais?: string[];
};

export type Empresa = {
  id: string;
  razao_social: string;
  cnpj: string;
  telefone: string;
  responsavel: string;
  taxa_conversao_pontos: number;
};

export type Voucher = {
  id: string;
  codigo_voucher: string;
  nome?: string;
  tipo: 'valor' | 'porcentagem';
  valor: number;
  cliente_id: string | null;
  validade: string | null;
  usage_limit: number;
  usage_count: number;
  status: 'ativo' | 'usado' | 'cancelado';
  motivo_cancelamento?: string;
  data_cancelamento?: string;
  categoria: 'desconto' | 'saque';
  data_uso?: string;
  tipo_uso?: string;
  created_at: string;
};

export type Orcamento = {
  id: string;
  codigo_orcamento: string;
  cliente_id: string;
  servico_id?: string;
  produto_id?: string;
  assinatura_id?: string;
  categoria: 'servico' | 'produto' | 'assinatura';
  observacoes_servico: string;
  valor_servico: number;
  valor_produto?: number;
  valor_assinatura?: number;
  valor_adicional: number;
  descricao_adicional: string;
  acrescimo: number;
  desconto: number;
  promocao_desconto_manual: number;
  total: number;
  status: 'aberto' | 'aprovado' | 'cancelado' | 'em revisão' | 'negociação' | 'pendência documentos';
  data_criacao: string;
  data_emissao?: string;
  titulo_solicitacao?: string;
  descricao_solicitacao?: string;
  nivel_prioridade?: 'baixa' | 'media' | 'alta';
  desconto_solicitado_porcentagem?: number;
  motivo_desconto?: string;
  proposta_admin_porcentagem?: number;
  fase_negociacao?: 'cliente' | 'admin';
  quantidade_meses?: number;
  quantidade?: number;
  prazo_indeterminado?: boolean;
  promocao_id?: string;
  origem_renovacao_id?: string;
  tipo_renovacao?: 'comprar_novamente' | 'assinar_novamente' | 'renovar_assinatura';
  anexos?: (string | { nome: string, url: string })[];
  documentos_solicitados?: string[];
  comprovante_concorrente?: string;
  comprovante_concorrente_urls?: string[];
  dia_vencimento?: number;
  cupom_desconto_id?: string;
  cupom_entrega_id?: string;
  endereco_entrega?: Record<string, unknown>;
  taxa_entrega?: number;
  entrega_cupom_aplicado?: boolean;
  origem_gsa_store?: boolean;
  status_entrega?: 'pedido_realizado' | 'pagamento_aprovado' | 'separacao' | 'em_transito' | 'entregue';
  rastreio_codigo?: string;
  rastreio_transportadora?: string;
  data_pagamento_aprovado?: string;
  data_separacao?: string;
  data_envio?: string;
  data_entrega?: string;
  status_quitacao_credito?: string;
  valor_quitacao_acordo?: number;
};

export type OS = {
  id: string;
  codigo_os: string;
  orcamento_id: string;
  cliente_id: string;
  status: 'andamento' | 'concluido' | 'cancelado';
  motivo_cancelamento?: string;
  data_inicio: string;
  data_fim?: string;
  tipo_entrega?: 'whatsapp' | 'online';
  data_entrega?: string;
  link_documento?: string;
  documentos_solicitados_os?: string[];
  anexos_os?: { nome: string; url: string; mime_type?: string; size?: number }[];
};

export type Fatura = {
  id: string;
  codigo_fatura: string;
  created_at?: string;
  os_id?: string;
  ordem_compra_id?: string;
  ordem_assinatura_id?: string;
  cliente_id: string;
  valor_total: number;
  valor_pago: number;
  status: 'pendente' | 'pago' | 'cancelado' | 'revisada' | 'vencida' | 'aguardando_link' | 'pendente_pagamento' | 'fatura_negociada' | 'protestado';
  tem_cobranca?: boolean;
  data_vencimento: string;
  data_emissao?: string;
  data_pagamento?: string;
  motivo_cancelamento?: string;
  data_cancelamento?: string;
  forma_pagamento_escolhida?: string;
  data_escolha_pagamento?: string;
  desconto_voucher_aplicado?: number;
  abatimento_carteira_aplicado?: number;
  desconto_pontos_aplicado?: number;
  valor_final_pendente?: number;
  valor_base_original?: number;
  acrescimo_manual?: number;
  desconto_manual?: number;
  data_envio_link?: string;
  pontos_gerados?: boolean;
  tipo?: 'servico' | 'produto' | 'assinatura' | 'pacote_nivel' | 'avulsa';
  clientes?: Cliente;
  gerada_automaticamente?: boolean;
  mes_referencia?: string;
  pacote_nivel_id?: string;
  itens_faturados?: Record<string, unknown>[];
  historico_pagamentos?: Record<string, unknown>[];
  observacoes?: string;
  orcamento_id?: string;
  is_amortizacao_credito?: boolean;
  ordens_compra?: any;
  match?: any;
};

export type OrdemCompra = {
  id: string;
  codigo_ordem: string;
  cliente_id: string;
  produto_id: string;
  status: 'em_analise' | 'concluido' | 'cancelado';
  data_criacao: string;
  data_conclusao?: string;
};

export type OrdemAssinatura = {
  id: string;
  codigo_ordem: string;
  cliente_id: string;
  assinatura_id: string;
  status: 'em_analise' | 'concluido' | 'cancelado' | 'em_cancelamento';
  data_criacao: string;
  data_conclusao?: string;
  prazo_meses?: number;
  renovacao_automatica?: boolean;
  data_vencimento?: string;
  data_cancelamento?: string;
  valor_proporcional_cancelamento?: number;
};

export type Ticket = {
  id: string;
  cliente_id: string;
  prestador_id?: string;
  assunto: string;
  descricao: string;
  status: 'aberto' | 'em andamento' | 'concluido' | 'cancelado';
  data_abertura: string;
  data_fechamento?: string;
  modulo?: 'cliente' | 'afiliado';
};

export type TicketMensagem = {
  id: string;
  ticket_id: string;
  autor_id: string; // ID do cliente ou 'admin'
  autor_nome: string;
  mensagem: string;
  anexo_url?: string;
  anexo_tipo?: string;
  anexo_nome?: string;
  data_envio: string;
  tipo: 'cliente' | 'admin' | 'prestador';
};

export type Saque = {
  id: string;
  cliente_id: string;
  valor: number;
  taxa_aplicada: number;
  valor_liquido: number;
  tipo_chave_pix: string;
  chave_pix: string;
  status: 'pendente' | 'pago' | 'cancelado';
  data_solicitacao: string;
  data_vencimento?: string;
  data_pagamento?: string;
  observacoes?: string;
  motivo_cancelamento?: string;
  motivo_prorrogacao?: string;
  clientes?: any;
};

export type Transferencia = {
  id: string;
  cliente_origem_id: string;
  cliente_destino_id: string;
  tipo: 'saldo' | 'pontos';
  valor: number;
  taxa_aplicada: number;
  valor_liquido: number;
  motivo: string;
  status: 'em_analise' | 'aprovado' | 'recusado' | 'reprovado' | 'concluido' | 'estornado' | 'cancelado';
  data_solicitacao: string;
  data_analise?: string;
  observacoes_admin?: string;
  cliente_origem?: { nome: string };
  cliente_destino?: { nome: string };
};

export type Indicacao = {
  id: string;
  indicador_id: string;
  indicado_nome: string;
  whatsapp_indicado: string;
  data_indicacao: string;
  voucher_id?: string;
  status: 'aberta' | 'concluída' | 'cancelada';
  data_cadastro_indicado?: string;
  data_conclusao?: string;
  bonus_indicador: number;
  bonus_indicado: number;
  data_criacao: string;
};

export type PontoMovimentacao = {
  id: string;
  cliente_id: string;
  fatura_id?: string;
  tipo: 'geracao_fatura' | 'conversao_dinheiro' | 'uso_fatura' | 'ajuste_manual' | 'estorno' | 'bonus_boas_vindas';
  pontos: number;
  saldo_apos: number;
  descricao: string;
  valor_convertido?: number;
  data_movimentacao: string;
};

export type Promocao = {
  id: string;
  codigo_promocao?: string;
  titulo: string;
  descricao: string;
  tipo: 'servico' | 'produto' | 'assinatura' | 'geral';
  tipo_desconto?: 'valor' | 'porcentagem' | 'nenhum';
  valor_desconto?: number;
  data_inicio_divulgacao: string;
  data_fim_divulgacao: string;
  prazo_validade_meses: number;
  status: 'ativa' | 'suspensa' | 'encerrada' | 'usada' | 'cancelada' | 'cancelado' | 'disponivel';
  created_at: string;
};

export type ClientePromocao = {
  id: string;
  cliente_id: string;
  promocao_id: string;
  data_ativacao: string;
  data_expiracao: string;
  status: 'ativa' | 'usada' | 'suspensa' | 'cancelado' | 'cancelada' | 'encerrada' | 'disponivel';
  orcamento_id?: string;
  data_uso?: string;
  motivo_cancelamento?: string;
  data_cancelamento?: string;
  created_at: string;
};

export type Notificacao = {
  id: string;
  cliente_id: string | null;
  prestador_id?: string | null;
  titulo: string;
  mensagem: string;
  modulo: Module;
  tab?: string;
  item_id?: string;
  lida: boolean;
  data_criacao: string;
  tipo?: string;
};

export type OrdemFiscal = {
  id: string;
  codigo_fiscal: string;
  fatura_id?: string;
  demanda_id?: string;
  cliente_id?: string;
  // Snapshot do cliente
  cliente_nome?: string;
  cliente_documento?: string;
  cliente_telefone?: string;
  cliente_email?: string;
  // Dados da compra
  tipo_compra?: 'servico' | 'produto' | 'assinatura';
  descricao_item?: string;
  codigo_ordem?: string;
  codigo_orcamento?: string;
  // Valores
  valor_bruto: number;
  valor_desconto: number;
  valor_acrescimo: number;
  valor_total: number;
  // Pagamento
  forma_pagamento?: string;
  data_pagamento?: string;
  status_pagamento: 'pendente' | 'pago' | 'cancelado';
  // Emissão de NF
  status_emissao: 'pendente_emissao' | 'emitida' | 'cancelada' | 'inutilizada';
  numero_nota?: string;
  data_emissao?: string;
  // Arquivos
  arquivo_nf_url?: string;
  arquivo_nf_xml_url?: string;
  // Outros
  observacoes?: string;
  created_at: string;
  updated_at: string;
};

export type CobrancaStatus = 'pendente' | 'em_cobranca' | 'acordo' | 'acordo_quebrado' | 
  'cartorio_preparando' | 'cartorio_enviado' | 'cartorio_protestado' | 'cartorio_baixado' | 
  'negativado' | 'negativado_baixado' | 'quitado' | 'cancelado' | 'perdoado';

export type CobrancaHistoricoTipo = 'criacao' | 'notificacao_inapp' | 'whatsapp_enviado' | 
  'email_enviado' | 'nivel_escalado' | 'score_atualizado' | 
  'cartorio_preparado' | 'cartorio_enviado' | 'cartorio_protestado' | 'cartorio_baixado' | 
  'negativacao_incluida' | 'negativacao_baixada' | 
  'acordo_criado' | 'acordo_parcela_paga' | 'acordo_quebrado' | 
  'promessa_registrada' | 'promessa_cumprida' | 'promessa_quebrada' | 
  'contestacao_aberta' | 'contestacao_respondida' | 
  'tag_adicionada' | 'tag_removida' | 
  'quitacao' | 'cancelamento' | 'perdao' | 
  'observacao' | 'juros_multa_recalculado' | 
  'carta_gerada' | 'bloqueio_servicos';

export type Cobranca = {
  id: string;
  fatura_id: string;
  cliente_id: string;
  valor_original: number;
  valor_multa: number;
  valor_juros: number;
  valor_atualizado: number;
  dias_atraso: number;
  score_risco: number;
  status: CobrancaStatus;
  nivel_cobranca: number;
  total_notificacoes_enviadas: number;
  total_whatsapp_enviados: number;
  data_ultima_notificacao?: string;
  data_ultimo_whatsapp?: string;
  data_ultima_acao: string;
  tags: string[];
  // Cartório
  data_envio_cartorio?: string;
  data_protesto?: string;
  data_baixa_protesto?: string;
  numero_protocolo_cartorio?: string;
  cartorio_nome?: string;
  cartorio_endereco?: string;
  // Negativação
  data_negativacao?: string;
  data_baixa_negativacao?: string;
  numero_protocolo_negativacao?: string;
  orgao_negativacao?: 'spc' | 'serasa' | 'spc_serasa' | 'outro';
  // Acordo
  acordo_ativo: boolean;
  acordo_parcelas?: number;
  acordo_valor_entrada?: number;
  acordo_valor_parcela?: number;
  acordo_desconto_porcentagem?: number;
  acordo_valor_total?: number;
  acordo_data_inicio?: string;
  acordo_parcelas_pagas: number;
  acordo_data_quebra?: string;
  acordo_motivo_quebra?: string;
  // Contestacao
  contestacao_ativa: boolean;
  contestacao_motivo?: string;
  contestacao_data?: string;
  contestacao_resposta?: string;
  contestacao_respondida: boolean;
  // Quitação
  data_quitacao?: string;
  forma_quitacao?: string;
  observacoes?: string;
  responsavel: string;
  created_at: string;
  updated_at: string;
  // Joins
  faturas?: Fatura;
  clientes?: Cliente;
};

export type CobrancaHistorico = {
  id: string;
  cobranca_id: string;
  tipo_acao: CobrancaHistoricoTipo;
  descricao: string;
  valor_envolvido?: number;
  template_usado?: string;
  canal?: 'whatsapp' | 'inapp' | 'email' | 'sistema' | 'manual' | 'telefone' | 'presencial';
  usuario: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type CobrancaAcordoParcela = {
  id: string;
  cobranca_id: string;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  status: 'pendente' | 'paga' | 'atrasada' | 'cancelada';
  data_pagamento?: string;
  forma_pagamento?: string;
  observacoes?: string;
  created_at: string;
};

export type CobrancaPromessaPagamento = {
  id: string;
  cobranca_id: string;
  cliente_id?: string;
  data_prometida: string;
  valor_prometido?: number;
  status: 'pendente' | 'cumprida' | 'quebrada' | 'cancelada';
  observacoes?: string;
  data_registro: string;
  data_verificacao?: string;
  created_at: string;
};


export type CupomLoja = {
  id: string;
  codigo_cupom: string;
  nome_cupom: string;
  categoria_cupom: 'desconto' | 'entrega' | 'reembolso';
  tipo_desconto?: 'valor' | 'porcentagem';
  valor_desconto?: number;
  tipo_entrega?: 'frete_gratis' | 'frete_gratis_minimo' | 'taxa_fixa';
  valor_minimo_compra?: number;
  taxa_fixa_entrega?: number;
  cliente_id?: string;
  produto_id?: string;
  limite_usos: number;
  limite_usos_por_cliente?: number;
  total_usos: number;
  data_validade?: string;
  status: 'ativo' | 'inativo' | 'usado' | 'expirado' | 'cancelado';
  motivo_cancelamento?: string;
  created_at: string;
  updated_at: string;
};

export type LojaSolicitacao = {
  id: string;
  codigo_solicitacao?: string;
  cliente_id: string;
  orcamento_origem_id?: string;
  tipo: 'troca' | 'devolucao';
  motivo: string;
  imagens?: string[] | Record<string, unknown>[];
  imagens_anexo?: string[] | Record<string, unknown>[];
  descricao_detalhada?: string;
  metodo_entrega?: string;
  endereco_devolucao?: string;
  data_agendamento?: string;
  rastreio_cliente?: string;
  rastreio_admin?: string;
  produto_desejado_id?: string;
  valor_diferenca?: number;
  status: 'pendente' | 'em_analise' | 'aprovado' | 'aguardando_instrucoes' | 'aguardando_devolucao' | 'devolucao_postada' | 'agendado' | 'devolucao_recebida' | 'novo_produto_enviado' | 'rejeitado' | 'concluido';
  resposta_admin?: string;
  novo_orcamento_id?: string;
  historico_status?: any;
  created_at: string;
  updated_at: string;
  // joins
  clientes?: Cliente;
  orcamento_origem?: Orcamento;
  produto_desejado?: Produto;
};

export type LojaAvaliacao = {
  id: string;
  produto_id: string;
  cliente_id: string;
  nota: number;
  comentario?: string;
  created_at: string;
};



export type LojaCarrinho = {
  id: string;
  cliente_id: string;
  item_id: string;
  tipo: 'produto' | 'servico' | 'assinatura';
  quantidade: number;
  prazo_meses?: number;
  updated_at: string;
};

export type LojaAvisoEstoque = {
  id: string;
  produto_id: string;
  cliente_id: string;
  notificado: boolean;
  created_at: string;
};

export type LojaCreditoSolicitacao = {
  id: string;
  cliente_id: string;
  tipo_solicitacao: 'adesao' | 'alteracao';
  status: 'analise' | 'documentos_pendentes' | 'pre_aprovado' | 'contrato_pendente_assinatura' | 'contrato_assinado' | 'liberado' | 'negado' | 'cancelado';
  limite_solicitado?: number;
  limite_aprovado?: number;
  opcao_pagamento_parcelado: boolean;
  documentos_solicitados?: string[];
  motivo_negacao?: string;
  nova_tentativa_apos?: string;
  data_liberacao_credito?: string;
  contrato_url?: string;
  contrato_assinado_url?: string;
  created_at: string;
  updated_at: string;
  clientes?: Cliente;
};

export type LojaCreditoDocumento = {
  id: string;
  solicitacao_id: string;
  nome_documento: string;
  arquivo_url: string;
  status: 'pendente' | 'aprovado' | 'rejeitado';
  observacao?: string;
  created_at: string;
  updated_at?: string;
};

export type LojaCreditoMovimentacao = {
  id: string;
  cliente_id: string;
  solicitacao_id?: string;
  fatura_id?: string;
  tipo: 'concessao_inicial' | 'compra' | 'amortizacao' | 'ajuste_adm_aumento' | 'ajuste_adm_reducao' | 'solicitacao_aumento_aprovada' | 'estorno_compra' | 'cancelamento_limite';
  valor: number;
  limite_total_anterior: number;
  limite_total_novo: number;
  limite_disponivel_anterior: number;
  limite_disponivel_novo: number;
  descricao?: string;
  created_at: string;
};

// ==========================================
// Promoções Inteligentes GSA Store
// ==========================================

export type PromocaoQuantidadeNivel = {
  quantidade_minima: number;
  tipo: 'unidade_gratis' | 'desconto_proxima' | 'ganhe_outro_produto';
  desconto_tipo?: 'porcentagem' | 'valor';
  desconto_valor?: number;
  produto_brinde_id?: string;
  quantidade_brinde?: number;
};

export type PromocaoComboItem = {
  produto_id: string;
  quantidade_minima: number;
};

export type PromocaoNivelVip = {
  nivel_id: string;
  quantidade_minima: number;
};

export type PromocaoQuantidade = {
  id: string;
  nome: string;
  descricao?: string;
  tipo_promocao: 'unidade_gratis' | 'desconto_proxima' | 'ganhe_outro_produto' | 'combo';
  escopo_gatilho: 'produto' | 'categoria' | 'geral' | 'valor_minimo' | 'combo';
  produto_gatilho_id?: string;
  categoria_gatilho_id?: string;
  valor_minimo_compra?: number;
  produtos_combo?: PromocaoComboItem[];
  quantidade_minima: number;
  desconto_tipo?: 'porcentagem' | 'valor';
  desconto_valor?: number;
  produto_brinde_id?: string;
  quantidade_brinde?: number;
  niveis?: PromocaoQuantidadeNivel[];
  nivel_minimo_id?: string;
  niveis_vip?: PromocaoNivelVip[];
  uso_maximo_por_cliente: number;
  prioridade: number;
  data_inicio: string;
  data_fim?: string;
  status: 'ativa' | 'suspensa' | 'encerrada';
  created_at: string;
  updated_at: string;
  // Joins
  produto_gatilho?: Produto;
  produto_brinde?: Produto;
  categoria_gatilho?: LojaCategoria;
  nivel_minimo?: Record<string, unknown>; 
};

export type PromocaoQuantidadeUso = {
  id: string;
  promocao_id: string;
  cliente_id: string;
  orcamento_id?: string;
  quantidade_usada: number;
  nivel_aplicado?: number;
  economia_gerada?: number;
  detalhes?: Record<string, unknown>;
  created_at: string;
};

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  image: string | null;
  category: string | null;
  author: string | null;
  published_at: string;
  created_at: string;
}
