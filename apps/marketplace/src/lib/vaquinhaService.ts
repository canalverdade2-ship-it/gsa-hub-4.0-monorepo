import { supabase } from './supabase';
import { generatePixCopiaECola, getQrCodeImageUrl } from './pixService';

export interface Vaquinha {
  id: string;
  codigo: string;
  produto_id?: string;
  produto_snapshot: {
    id?: string;
    nome: string;
    imagem_url: string;
    valor: number;
    valor_promocional?: number;
    categoria?: string;
  };
  organizador_nome: string;
  organizador_telefone: string;
  organizador_email?: string;
  organizador_id?: string;
  presenteado_nome: string;
  data_evento?: string;
  mensagem?: string;
  meta_valor: number;
  valor_arrecadado: number;
  quantidade_contribuicoes: number;
  status: 'aberta' | 'concluida' | 'cancelada' | 'expirada';
  endereco_entrega?: any;
  pedido_gerado_id?: string;
  created_at: string;
  updated_at: string;
}

export interface VaquinhaContribuicao {
  id: string;
  vaquinha_id: string;
  contribuinte_nome: string;
  contribuinte_telefone?: string;
  contribuinte_email?: string;
  valor: number;
  mensagem?: string;
  pix_copia_cola?: string;
  pix_qr_code_url?: string;
  status: 'pendente' | 'pago' | 'cancelado';
  transacao_id?: string;
  pago_em?: string;
  created_at: string;
}

export interface VaquinhaDetailsResponse {
  success: boolean;
  vaquinha?: Vaquinha;
  contribuicoes?: VaquinhaContribuicao[];
  percentual?: number;
  valor_restante?: number;
  meta_atingida?: boolean;
  error?: string;
}

export const vaquinhaService = {
  /**
   * Cria uma nova Vaquinha de Presente no banco de dados
   */
  async createVaquinha(dados: {
    produto_id?: string;
    produto_snapshot: any;
    organizador_nome: string;
    organizador_telefone: string;
    organizador_email?: string;
    organizador_id?: string;
    presenteado_nome: string;
    data_evento?: string;
    mensagem?: string;
    meta_valor: number;
    endereco_entrega?: any;
  }): Promise<{ success: boolean; vaquinha?: Vaquinha; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('gsa_criar_vaquinha', {
        p_dados: dados,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao criar vaquinha.');

      return { success: true, vaquinha: data.vaquinha };
    } catch (err: any) {
      console.error('[vaquinhaService] Erro ao criar vaquinha:', err);
      return { success: false, error: err.message || 'Erro de conexão ao criar vaquinha.' };
    }
  },

  /**
   * Obtém os detalhes completos da Vaquinha por Código (VAQ-XXXXXX) ou ID UUID
   */
  async getVaquinha(codigoOuId: string): Promise<VaquinhaDetailsResponse> {
    try {
      const { data, error } = await supabase.rpc('gsa_obter_vaquinha', {
        p_codigo_ou_id: codigoOuId.trim(),
      });

      if (error) throw error;
      return data as VaquinhaDetailsResponse;
    } catch (err: any) {
      console.error('[vaquinhaService] Erro ao obter vaquinha:', err);
      return { success: false, error: err.message || 'Erro ao carregar vaquinha.' };
    }
  },

  /**
   * Registra uma nova intenção de contribuição e gera o PIX Copia e Cola / QR Code oficial
   */
  async createContribution(params: {
    vaquinha_id: string;
    contribuinte_nome: string;
    contribuinte_telefone?: string;
    contribuinte_email?: string;
    valor: number;
    mensagem?: string;
    codigoVaquinha?: string;
  }): Promise<{ success: boolean; contribution?: VaquinhaContribuicao; pixCopiaECola?: string; qrCodeUrl?: string; error?: string }> {
    try {
      const valorNum = Number(params.valor);
      if (isNaN(valorNum) || valorNum <= 0) {
        throw new Error('Valor de contribuição inválido.');
      }

      // 1. Gera código PIX oficial Banco Central
      const pixCode = generatePixCopiaECola({
        valor: valorNum,
        descricao: `Vaquinha GSA ${params.codigoVaquinha || ''}`.trim(),
      });
      const qrCodeUrl = getQrCodeImageUrl(pixCode, 320);

      // 2. Insere registro de contribuição pendente
      const { data, error } = await supabase
        .from('loja_vaquinha_contribuicoes')
        .insert({
          vaquinha_id: params.vaquinha_id,
          contribuinte_nome: params.contribuinte_nome.trim(),
          contribuinte_telefone: params.contribuinte_telefone?.trim() || null,
          contribuinte_email: params.contribuinte_email?.trim() || null,
          valor: valorNum,
          mensagem: params.mensagem?.trim() || null,
          pix_copia_cola: pixCode,
          pix_qr_code_url: qrCodeUrl,
          status: 'pendente',
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        contribution: data,
        pixCopiaECola: pixCode,
        qrCodeUrl: qrCodeUrl,
      };
    } catch (err: any) {
      console.error('[vaquinhaService] Erro ao criar contribuição:', err);
      return { success: false, error: err.message || 'Falha ao registrar contribuição.' };
    }
  },

  /**
   * Confirma o pagamento de uma contribuição (PIX confirmado) e atualiza a vaquinha
   */
  async confirmContribution(contribuicaoId: string, transacaoId?: string): Promise<{ success: boolean; meta_atingida?: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('gsa_confirmar_contribuicao_vaquinha', {
        p_contribuicao_id: contribuicaoId,
        p_transacao_id: transacaoId || null,
      });

      if (error) throw error;
      return { success: true, meta_atingida: data?.meta_atingida };
    } catch (err: any) {
      console.error('[vaquinhaService] Erro ao confirmar contribuição:', err);
      return { success: false, error: err.message || 'Erro ao confirmar pagamento.' };
    }
  },

  /**
   * Gera texto pré-formatado para compartilhamento no WhatsApp
   */
  getWhatsAppShareUrl(vaquinha: Vaquinha, baseUrl?: string): string {
    const url = `${baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')}/marketplace/loja/vaquinha/${vaquinha.codigo}`;
    const texto = `🎁 *Vaquinha de Presente para ${vaquinha.presenteado_nome}!*\n\n` +
      `Galera, criei uma vaquinha no Grupo GSA para comprarmos: *${vaquinha.produto_snapshot?.nome || 'um presente especial'}*.\n\n` +
      `💰 *Meta:* R$ ${Number(vaquinha.meta_valor).toFixed(2).replace('.', ',')}\n` +
      `${vaquinha.mensagem ? `💬 "${vaquinha.mensagem}"\n\n` : ''}` +
      `👉 Para contribuir com qualquer valor via PIX, acesse o link:\n${url}`;

    return `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
  },
};
