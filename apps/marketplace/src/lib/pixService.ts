import { supabase } from './supabase';
import { callClientRpc } from './clientRpc';

/**
 * Utilitário para cálculo de CRC16-CCITT (Padrão Banco Central / PIX EMV)
 */
export function crc16(str: string): string {
  let crc = 0xFFFF;
  const strlen = str.length;

  for (let c = 0; c < strlen; c++) {
    crc ^= str.charCodeAt(c) << 8;
    for (let i = 0; i < 8; i++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }

  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Formata um campo EMV (ID + Tamanho 2 dígitos + Conteúdo)
 */
export function formatEMV(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

export interface PixPayloadParams {
  chavePix?: string;
  nomeRecebedor?: string;
  cidadeRecebedor?: string;
  valor?: number;
  txId?: string;
  descricao?: string;
}

/**
 * Gera a string do PIX Copia e Cola (BR Code) no padrão oficial do BACEN
 */
export function generatePixCopiaECola({
  chavePix = '+5511920857756',
  nomeRecebedor = 'GRUPO GSA SERVICOS',
  cidadeRecebedor = 'SAO PAULO',
  valor = 0,
  txId = 'GSAPEDIDO',
  descricao = 'Compra GSA Store',
}: PixPayloadParams): string {
  let cleanKey = chavePix.trim().replace(/\s+/g, '');
  if (/^\d{10,11}$/.test(cleanKey)) {
    cleanKey = `+55${cleanKey}`;
  }

  const cleanName = nomeRecebedor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .slice(0, 25)
    .toUpperCase();

  const cleanCity = cidadeRecebedor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .slice(0, 15)
    .toUpperCase();

  const cleanTxId = (txId || 'GSAPEDIDO').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'GSAPEDIDO';

  // Merchant Account Information (Tag 26)
  const gui = formatEMV('00', 'br.gov.bcb.pix');
  const key = formatEMV('01', cleanKey);
  const desc = descricao ? formatEMV('02', descricao.slice(0, 40)) : '';
  const merchantAccountInfo = formatEMV('26', `${gui}${key}${desc}`);

  // Additional Data (Tag 62)
  const additionalData = formatEMV('62', formatEMV('05', cleanTxId));

  // Montagem base do Payload
  let payload = [
    formatEMV('00', '01'), // Format Indicator
    formatEMV('01', valor > 0 ? '12' : '11'), // Point of Initiation
    merchantAccountInfo,
    formatEMV('52', '0000'), // Merchant Category Code
    formatEMV('53', '986'), // Currency BRL
  ].join('');

  if (valor > 0) {
    payload += formatEMV('54', valor.toFixed(2));
  }

  payload += [
    formatEMV('58', 'BR'), // Country Code
    formatEMV('59', cleanName), // Merchant Name
    formatEMV('60', cleanCity), // Merchant City
    additionalData,
    '6304', // CRC16 Tag + Tamanho
  ].join('');

  const crc = crc16(payload);
  return `${payload}${crc}`;
}

/**
 * Gera URL de renderização do QR Code visual a partir da string do PIX
 */
export function getQrCodeImageUrl(pixCode: string, size = 320): string {
  const encoded = encodeURIComponent(pixCode);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${encoded}`;
}

export interface InfinitePayCheckoutResult {
  success: boolean;
  link?: string;
  orderNsu?: string;
  total?: number;
  pixCode?: string;
  qrCodeUrl?: string;
  error?: string;
}

const INFINITEPAY_HANDLE = 'getsemani-gsa';
const INFINITEPAY_API_URL = 'https://api.checkout.infinitepay.io/links';
const INFINITEPAY_CHECK_URL = 'https://api.checkout.infinitepay.io/payment_check';

/**
 * Cria link de checkout oficial na InfinitePay e persiste fatura no banco.
 * O QR Code e o código PIX Copia e Cola são gerados pela própria InfinitePay
 * e exibidos via iframe no modal — não são gerados localmente.
 */
export async function createInfinitePayOrderCheckout({
  orcamentoId,
  codigoOrcamento,
  clienteId,
  clienteNome,
  clienteEmail,
  clienteTelefone,
}: {
  orcamentoId: string;
  codigoOrcamento: string;
  clienteId: string;
  /** @deprecated Ignorado. O valor financeiro é sempre obtido no servidor. */
  valorLiquido?: number;
  clienteNome?: string;
  clienteEmail?: string;
  clienteTelefone?: string;
}): Promise<InfinitePayCheckoutResult> {
  try {
    const quote = await callClientRpc<any>('gsa_client_store_payment_quote', {
      p_orcamento_id: orcamentoId,
    });
    const valorFinal = Number(quote?.total ?? 0);
    if (!Number.isFinite(valorFinal) || valorFinal < 0) {
      throw new Error('O servidor retornou um total inválido para o pedido.');
    }

    // Pedidos integralmente quitados com pontos/carteira não possuem uma
    // parcela externa. Nunca transforme R$ 0,00 em uma cobrança mínima.
    if (valorFinal < 0.01) {
      return { success: true, total: valorFinal };
    }

    // Obter sessão para a Edge Function autenticada
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Usuário não autenticado.');
    }

    // Chama a Edge Function para criar o link no backend (protegendo a manipulação de preço)
    const { data, error: invokeError } = await supabase.functions.invoke('gsa-payments', {
      body: {
        action: 'create_store_link',
        orcamento_id: orcamentoId,
        sessao_id: session.user.id,
        session_token: session.access_token,
      },
    });

    if (invokeError) {
      console.error('[pixService] Erro ao invocar gsa-payments:', invokeError);
      return { success: false, error: 'Falha de comunicação ao gerar pagamento.' };
    }

    if (data?.error) {
      return { success: false, error: data.error };
    }

    return {
      success: true,
      link: data.link,
      orderNsu: data.order_nsu,
      total: data.total || valorFinal,
    };
  } catch (err: any) {
    console.error('[pixService] Erro ao criar checkout:', err);
    return {
      success: false,
      error: err.message || 'Erro ao gerar dados do PIX.',
    };
  }
}

/**
 * Consulta o status real do pagamento no Supabase (Orçamento / Fatura)
 */
export async function checkOrderStatus(orcamentoId: string): Promise<{
  pago: boolean;
  status: string;
  statusDetalhe?: string;
}> {
  try {
    // 1. Verificar na tabela orcamentos
    const { data: orc } = await supabase
      .from('orcamentos')
      .select('status, fase_negociacao')
      .eq('id', orcamentoId)
      .maybeSingle();

    const statusOrc = String(orc?.status || '').toLowerCase();
    const isOrcPago = ['pago', 'aprovado', 'em_expedicao', 'em_transporte', 'concluido'].includes(statusOrc);

    if (isOrcPago) {
      return {
        pago: true,
        status: statusOrc,
        statusDetalhe: orc?.fase_negociacao,
      };
    }

    // 2. Verificar na tabela faturas vinculada
    const { data: fatura } = await supabase
      .from('faturas')
      .select('status')
      .eq('orcamento_id', orcamentoId)
      .maybeSingle();

    const statusFat = String(fatura?.status || '').toLowerCase();
    const isFatPaga = statusFat === 'pago';

    return {
      pago: isFatPaga,
      status: isFatPaga ? 'pago' : (statusOrc || statusFat || 'pendente'),
      statusDetalhe: orc?.fase_negociacao,
    };
  } catch {
    return { pago: false, status: 'erro' };
  }
}
