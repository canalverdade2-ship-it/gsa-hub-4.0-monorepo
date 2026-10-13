import { supabase } from './supabase';
import { toast } from 'react-hot-toast';
import {
  applyDynamicGreetingAndFooter,
  randomizeMessageUrls,
  injectZeroWidthEntropy,
  pdfVariationEngine,
} from './whatsappVariationService';
import { whatsappHealthService } from './whatsappHealthService';

export type WhatsAppContext = {
  tipo: 'orcamento' | 'os' | 'compra' | 'assinatura' | 'fatura' | 'voucher' | 'promocao' | 'credito' | 'produto' | 'cobranca' | 'cliente' | 'ticket' | 'indicacao' | 'personalizado' | 'carteira_digital' | 'carteira_pontos' | 'documento_cliente' | 'fiscal' | 'venda' | 'reembolso' | 'vip' | 'premio' | 'cupom' | 'troca' | 'servico' | 'acesso' | 'cadastro' | 'demanda_tecnico' | 'documento_prestador' | 'extrato';
  clienteNome?: string;
  codigo?: string;
  status?: string;
  valorTotal?: number | string;
  dataVencimento?: string;
  detalhesExtras?: string;
  titulo?: string; // Usado para promoção ou assunto de ticket
  
  // Detalhamento de Pagamento
  formaPagamento?: string;
  cupomAplicado?: string;
  valorCupom?: number | string;
  pontosUtilizados?: number;
  valorPontos?: number | string;
  saldoCarteiraUtilizado?: number | string;
  creditoGsaUtilizado?: number | string;
  valorLiquido?: number | string;
};

// ─── Helpers Internos ───────────────────────────────────────────────────────────

function emojiStatus(status?: string): string {
  if (!status) return 'ℹ️';
  const s = status.toLowerCase();
  if (s.includes('aprovado') || s.includes('concluí') || s.includes('pago') || s.includes('liberado') || s.includes('convert') || s.includes('ativo') || s.includes('resolvid')) return '✅';
  if (s.includes('cancel') || s.includes('recus') || s.includes('negad') || s.includes('inativ')) return '❌';
  if (s.includes('vencid') || s.includes('atraso') || s.includes('cobranç') || s.includes('protesto')) return '⚠️';
  if (s.includes('pendente') || s.includes('aguardando') || s.includes('aberto')) return '⏳';
  if (s.includes('análise') || s.includes('analise') || s.includes('andamento') || s.includes('processo')) return '🔍';
  if (s.includes('enviado') || s.includes('emitido') || s.includes('gerado')) return '📤';
  return 'ℹ️';
}

function emojiTipo(tipo: string): string {
  const map: Record<string, string> = {
    orcamento: '📋',
    os: '🔧',
    compra: '🛍️',
    assinatura: '📝',
    fatura: '💳',
    voucher: '🎟️',
    promocao: '🎁',
    credito: '📈',
    produto: '📦',
    cobranca: '⚠️',
    cliente: '👤',
    ticket: '🎫',
    indicacao: '🤝',
    personalizado: '💬',
    carteira_digital: '💳',
    carteira_pontos: '⭐',
    documento_cliente: '📄',
    fiscal: '🧾',
    venda: '🛍️',
    reembolso: '💸',
    vip: '👑',
    premio: '🏆',
    cupom: '🎟️',
    troca: '🔄',
    servico: '🛠️',
    acesso: '🔑',
    cadastro: '📋',
    demanda_tecnico: '⚡',
    documento_prestador: '📄',
    extrato: '📊',
  };
  return map[tipo] || '🔔';
}

function rodape(despedida: string): string {
  return `${despedida}\n\n_Mensagem enviada via GSA HUB._`;
}

function formatList(items: (string | null | undefined)[]): string {
  return items.filter(Boolean).map(item => `⬢ ${item}`).join('\n');
}

// ─── Roteamento Inteligente de Destinatário (Suporte a LID e JID Canônico) ─────

export async function resolveWhatsAppDestination(telefone: string): Promise<string> {
  const clean = telefone.replace(/\D/g, '');
  if (!clean) return telefone;

  // Roteamento inteligente para o número Master / Administrador (LID direto para garantir entrega com Baileys)
  if (clean.includes('11971858372') || clean.includes('1171858372') || clean.includes('971858372')) {
    return '38830967099420@lid';
  }

  // Tenta resolver se o contato possui um chat/LID ativo na Evolution API
  try {
    const res = await fetch('http://147.15.43.141:8080/chat/findChats/GSA_WhatsApp', {
      method: 'POST',
      headers: {
        'apikey': 'gsa_hub_evolution_token_2026',
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({ where: {} }),
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      const chats = await res.json();
      if (Array.isArray(chats)) {
        const found = chats.find((c: any) => c.remoteJid && (c.remoteJid.includes(clean) || (clean.length >= 8 && c.remoteJid.includes(clean.slice(-8)))));
        if (found?.remoteJid) {
          return found.remoteJid;
        }
      }
    }
  } catch {
    // fallback
  }

  return clean.startsWith('55') ? clean : `55${clean}`;
}

// ─── Serviço Principal ────────────────────────────────────────────────────────

export interface SendDirectOptions {
  clienteNome?: string;
  codigoFatura?: string;
  mediaBase64?: string;
  mediaUrl?: string;
  pdfUrl?: string;
  pdfPath?: string;
  fileName?: string;
  linkPreview?: boolean;

  // Humanization & Choreography Options (R1 & R3)
  isReply?: boolean;
  quotedMessageId?: string;
  skipPresence?: boolean;
  timeScale?: number;
  customInitialDelayMs?: number;

  // Dynamic Variation Options (R2)
  enableVariation?: boolean;
  enableZeroWidth?: boolean;
  enableUrlRandomizer?: boolean;
}

export const whatsappNotificationService = {
  gerarMensagemWhatsApp: (contexto: WhatsAppContext): string => {
    const nome = contexto.clienteNome ? `*${contexto.clienteNome.trim()}*` : 'prezado(a) cliente';
    const saudacao = `Olá, ${nome}! 👋`;
    const cabecalho = `🏢 *GSA — Gestão de Serviços*`;
    const statusEmoji = emojiStatus(contexto.status);
    const tipoEmoji = emojiTipo(contexto.tipo);
    const strStatus = contexto.status || '—';
    const strCodigo = contexto.codigo || '—';

    let subtitulo = '';
    let descricao = '';
    let blocoDetalhes = '';
    let tituloAcao = '📌 *PRÓXIMO PASSO*';
    let textoAcao = '';
    let despedida = '';

    switch (contexto.tipo) {
      // ─── Carteira Digital ──────────────────────────────────────────────────
      case 'carteira_digital':
        subtitulo = `💳 *Atualização na sua Carteira Digital*`;
        descricao = `O seu saldo financeiro foi atualizado e está disponível no sistema.`;
        
        blocoDetalhes = [
          `${tipoEmoji} *SALDO EM CARTEIRA*`,
          formatList([
            `*Valor Disponível:* 💰 ${contexto.valorTotal}`
          ])
        ].join('\n');

        tituloAcao = `ℹ️ *INFORMAÇÃO IMPORTANTE*`;
        textoAcao = `Lembramos que você tem total liberdade financeira. Você pode *sacar este valor para sua conta* a qualquer momento de forma rápida e segura através do nosso sistema.`;
        despedida = `_Dúvidas? É só responder esta mensagem._`;
        break;

      // ─── Carteira de Pontos ────────────────────────────────────────────────
      case 'carteira_pontos':
        subtitulo = `⭐ *Atualização no Clube de Benefícios*`;
        descricao = `O seu saldo de pontos foi atualizado e está disponível na sua conta!`;
        
        blocoDetalhes = [
          `${tipoEmoji} *PONTUAÇÃO ACUMULADA*`,
          formatList([
            `*Total Disponível:* 🎁 ${contexto.valorTotal} pts`
          ])
        ].join('\n');

        tituloAcao = `💡 *O QUE FAZER COM SEUS PONTOS?*`;
        textoAcao = `Aproveite os seus benefícios exclusivos! Você poderá:\n1️⃣ Resgatar seus pontos e sacar em valores reais.\n2️⃣ Trocar por descontos incríveis na nossa loja GSA.`;
        despedida = `_Dúvidas? É só responder esta mensagem._`;
        break;

      // ─── Documento Cliente ────────────────────────────────────────────────
      case 'documento_cliente':
        const nomeDoc = contexto.titulo || 'Documento';
        
        if (contexto.status === 'solicitado' || contexto.status === 'pendente') {
          subtitulo = `📄 *Solicitação de Documento*`;
          descricao = `Temos uma nova pendência de documentação em seu perfil.`;
          blocoDetalhes = [
            `${tipoEmoji} *DETALHES DA SOLICITAÇÃO*`,
            formatList([
              `*Documento:* 📄 ${nomeDoc}`,
              `*Status:* ⏳ Aguardando Envio`
            ])
          ].join('\n');
          tituloAcao = `📌 *O QUE FAZER AGORA?*`;
          textoAcao = `Para darmos continuidade aos seus processos, por favor, envie o arquivo solicitado o quanto antes para análise.\n\nVocê tem duas opções:\n1️⃣ *Responder a esta mensagem* anexando a foto ou PDF do documento.\n2️⃣ Acessar a aba "Documentos" no seu Portal do Cliente e realizar o envio por lá.`;
        } else if (contexto.status === 'aprovado') {
          subtitulo = `📄 *Análise de Documento*`;
          descricao = `Ótima notícia! Seu documento foi recebido e avaliado pela nossa equipe.`;
          blocoDetalhes = [
            `${tipoEmoji} *RESULTADO DA ANÁLISE*`,
            formatList([
              `*Documento:* 📄 ${nomeDoc}`,
              `*Status:* ✅ Aprovado com Sucesso!`
            ])
          ].join('\n');
          tituloAcao = `✅ *TUDO CERTO!*`;
          textoAcao = `Agradecemos pelo envio. Seu cadastro está atualizado e não há pendências referentes a este documento.`;
        } else if (contexto.status === 'em_analise' || contexto.status === 'analise') {
          subtitulo = `📄 *Documento Recebido*`;
          descricao = `Recebemos o seu documento e ele já está na fila de verificação da nossa equipe.`;
          blocoDetalhes = [
            `${tipoEmoji} *STATUS ATUAL*`,
            formatList([
              `*Documento:* 📄 ${nomeDoc}`,
              `*Status:* 🔍 Em Análise`
            ])
          ].join('\n');
          tituloAcao = `⏳ *PRÓXIMOS PASSOS*`;
          textoAcao = `Agora é só aguardar! Em breve traremos uma atualização se o documento foi aprovado com sucesso ou se há alguma pendência.`;
        } else if (contexto.status === 'reprovado') {
          subtitulo = `📄 *Análise de Documento*`;
          descricao = `Avaliamos o documento que você nos enviou recentemente.`;
          blocoDetalhes = [
            `${tipoEmoji} *RESULTADO DA ANÁLISE*`,
            formatList([
              `*Documento:* 📄 ${nomeDoc}`,
              `*Status:* ❌ Reprovado`
            ])
          ].join('\n');
          tituloAcao = `⚠️ *AÇÃO NECESSÁRIA*`;
          textoAcao = `Infelizmente não foi possível aprovar o documento enviado. Por favor, acesse o seu Portal do Cliente e realize o envio de um novo arquivo corrigido.`;
        }
        
        despedida = `_Dúvidas? É só responder esta mensagem._`;
        break;

      // ─── Módulo Fiscal ─────────────────────────────────────────────────────
      case 'fiscal':
        subtitulo = `🧾 *Emissão de Nota Fiscal*`;
        descricao = `Sua Nota Fiscal referente aos serviços prestados já foi gerada e está disponível!`;
        blocoDetalhes = [
          `${tipoEmoji} *DETALHES DA NOTA*`,
          formatList([
            `*Número:* ${strCodigo}`,
            contexto.valorTotal ? `*Valor Total:* 💰 ${contexto.valorTotal}` : null
          ])
        ].join('\n');
        tituloAcao = `📄 *COMO ACESSAR?*`;
        textoAcao = `Acesse o seu Portal do Cliente para visualizar e baixar o PDF/XML da sua nota a qualquer momento.`;
        despedida = `_Dúvidas? É só responder esta mensagem._`;
        break;

      // ─── Módulo de Reembolso ───────────────────────────────────────────────
      case 'reembolso':
        subtitulo = `💸 *Atualização de Reembolso*`;
        descricao = `Temos novidades sobre a sua solicitação de reembolso.`;
        blocoDetalhes = [
          `${tipoEmoji} *STATUS DO SEU REEMBOLSO*`,
          formatList([
            `*Referência:* ${strCodigo}`,
            `*Status:* ${statusEmoji} ${strStatus}`,
            contexto.valorTotal ? `*Valor:* 💰 ${contexto.valorTotal}` : null
          ])
        ].join('\n');
        tituloAcao = `ℹ️ *O QUE ISSO SIGNIFICA?*`;
        textoAcao = `Sua solicitação foi processada! Se o status constar como Pago, o valor já foi (ou está sendo) direcionado para a sua conta.`;
        despedida = `_Dúvidas? É só responder esta mensagem._`;
        break;

      // ─── Módulo de Vendas ──────────────────────────────────────────────────
      case 'venda':
        subtitulo = `🛍️ *Confirmação de Compra*`;
        descricao = `Agradecemos por escolher a Loja GSA. O seu pedido foi processado com sucesso!`;
        blocoDetalhes = [
          `${tipoEmoji} *RESUMO DO PEDIDO*`,
          formatList([
            `*Número do Pedido:* ${strCodigo}`,
            `*Status:* ${statusEmoji} ${strStatus}`,
            contexto.valorTotal ? `*Valor Total:* 💰 ${contexto.valorTotal}` : null
          ])
        ].join('\n');
        tituloAcao = `🚚 *PRÓXIMOS PASSOS*`;
        textoAcao = `Sua compra está garantida. Acesse a plataforma para acompanhar os detalhes e o andamento da sua entrega ou serviço.`;
        despedida = `_Dúvidas? É só responder esta mensagem._`;
        break;

      // ─── Módulo VIP ────────────────────────────────────────────────────────
      case 'vip':
        subtitulo = `👑 *Bem-vindo à Área VIP*`;
        descricao = `É com muita alegria que informamos que você agora faz parte do grupo exclusivo de clientes VIP GSA!`;
        blocoDetalhes = [
          `${tipoEmoji} *SEUS BENEFÍCIOS EXCLUSIVOS*`,
          `A partir de agora você conta com atendimento prioritário, condições diferenciadas e acesso a produtos ocultos em nossa loja.`
        ].join('\n');
        tituloAcao = `✨ *COMO APROVEITAR?*`;
        textoAcao = `Acesse o Portal do Cliente e note a sua nova insígnia VIP. Navegue pelas opções para descobrir vantagens exclusivas pensadas para você!`;
        despedida = `_Dúvidas? É só responder esta mensagem._`;
        break;

      // ─── Módulo de Prêmio ──────────────────────────────────────────────────
      case 'premio':
        subtitulo = `🏆 *Resgate de Prêmio Concluído*`;
        descricao = `Temos excelentes novidades sobre o seu Clube de Benefícios!`;
        blocoDetalhes = [
          `${tipoEmoji} *SEU NOVO PRÊMIO*`,
          formatList([
            `*Item:* ${contexto.titulo || 'Prêmio Especial'}`,
            contexto.valorTotal ? `*Pontos Utilizados:* 🎁 ${contexto.valorTotal} pts` : null
          ])
        ].join('\n');
        tituloAcao = `🎉 *APROVEITE!*`;
        textoAcao = `Agradecemos por ser um cliente fidelizado GSA. Aproveite bastante o seu prêmio exclusivo.`;
        despedida = `_Dúvidas? É só responder esta mensagem._`;
        break;

      // ─── Módulo de Cupons ──────────────────────────────────────────────────
      case 'cupom':
        subtitulo = `🎟️ *Você ganhou um Cupom de Desconto!*`;
        descricao = `Preparamos um presente especial para você utilizar na Loja GSA.`;
        blocoDetalhes = [
          `${tipoEmoji} *DETALHES DO CUPOM*`,
          formatList([
            `*Código:* ${strCodigo}`,
            contexto.valorTotal ? `*Desconto:* 💰 ${contexto.valorTotal}` : null
          ])
        ].join('\n');
        tituloAcao = `💡 *COMO USAR?*`;
        textoAcao = `Acesse a nossa loja no Portal do Cliente, escolha seus itens e insira o código acima no momento do checkout para aplicar o desconto.`;
        despedida = `_Aproveite antes que expire!_`;
        break;

      // ─── Módulo de Trocas ──────────────────────────────────────────────────
      case 'troca':
        subtitulo = `🔄 *Atualização de Troca/Devolução*`;
        descricao = `Temos novidades sobre a sua solicitação de troca ou devolução.`;
        blocoDetalhes = [
          `${tipoEmoji} *STATUS DO PROCESSO*`,
          formatList([
            `*Pedido Referência:* ${strCodigo}`,
            `*Status:* ${statusEmoji} ${strStatus}`
          ])
        ].join('\n');
        tituloAcao = `📦 *ACOMPANHE O PROCESSO*`;
        textoAcao = `Sua solicitação está em andamento. Caso precise enviar ou recolher algum item, nossa equipe entrará em contato com as instruções.`;
        despedida = `_Dúvidas? É só responder esta mensagem._`;
        break;

      // ─── Módulo de Serviço (Compartilhamento) ──────────────────────────────
      case 'servico':
        subtitulo = `🛠️ *Detalhes do Serviço*`;
        descricao = `Conforme conversamos, aqui estão os detalhes do serviço de seu interesse.`;
        blocoDetalhes = [
          `${tipoEmoji} *SOBRE O SERVIÇO*`,
          formatList([
            `*Nome:* ${contexto.titulo}`,
            contexto.valorTotal ? `*Valor Estimado:* 💰 a partir de ${contexto.valorTotal}` : null
          ])
        ].join('\n');
        tituloAcao = `📅 *VAMOS AGENDAR?*`;
        textoAcao = `Acesse nosso portal para visualizar o catálogo completo e solicitar um orçamento sem compromisso para este serviço.`;
        despedida = `_Estou à disposição para tirar dúvidas!_`;
        break;

      // ─── Módulo de Acesso (Senha Temporária) ───────────────────────────────
      case 'acesso':
        subtitulo = `🔑 *Acesso ao Sistema GSA*`;
        descricao = `Suas credenciais de acesso foram geradas ou atualizadas com sucesso.`;
        blocoDetalhes = [
          `${tipoEmoji} *DADOS DE LOGIN*`,
          formatList([
            `*Usuário/E-mail:* ${contexto.detalhesExtras}`,
            `*Senha Temporária:* Acesse o sistema pelo link enviado por e-mail para criar sua senha segura.`
          ])
        ].join('\n');
        tituloAcao = `🔒 *MUITO IMPORTANTE*`;
        textoAcao = `Acesse o nosso portal utilizando as credenciais acima e *lembre-se de alterar a sua senha* no primeiro acesso por questões de segurança.`;
        despedida = `_Mantenha seus dados seguros!_`;
        break;

      // ─── Módulo de Cadastro (Boas vindas) ──────────────────────────────────
      case 'cadastro':
        subtitulo = `📋 *Bem-vindo(a) ao GSA!*`;
        descricao = `Seu cadastro foi realizado com sucesso em nosso sistema.`;
        blocoDetalhes = [
          `${tipoEmoji} *SOBRE O PORTAL*`,
          `No portal você poderá acompanhar orçamentos, faturas, documentos, serviços e participar do nosso Clube de Benefícios exclusivo.`
        ].join('\n');
        tituloAcao = `🚀 *PRIMEIRO ACESSO*`;
        textoAcao = `Acesse agora mesmo pelo link do sistema. Caso ainda não tenha recebido sua senha, solicite-a com nossa equipe.`;
        despedida = `_Estamos felizes em ter você com a gente!_`;
        break;

      // ─── Módulo Demandas Técnico ───────────────────────────────────────────
      case 'demanda_tecnico':
        subtitulo = `⚡ *Nova Demanda Atribuída*`;
        descricao = `Você acaba de receber uma nova tarefa/demanda no sistema.`;
        blocoDetalhes = [
          `${tipoEmoji} *DETALHES DA TAREFA*`,
          formatList([
            `*Código:* ${strCodigo}`,
            `*Demanda:* ${contexto.titulo}`,
            `*Prioridade:* ${contexto.status === 'alta' ? '🔴 ALTA' : contexto.status === 'media' ? '🟡 MÉDIA' : '🟢 BAIXA'}`
          ])
        ].join('\n');
        tituloAcao = `⚡ *AÇÃO NECESSÁRIA*`;
        textoAcao = `Acesse imediatamente o seu painel de Demandas no sistema para visualizar os detalhes, prazos, anexos e inicie o atendimento.`;
        despedida = `_Bom trabalho!_`;
        break;

      // ─── Documento Prestador ───────────────────────────────────────────────
      case 'documento_prestador':
        const nomeDocPrestador = contexto.titulo || 'Documento';
        if (contexto.status === 'solicitado' || contexto.status === 'pendente') {
          subtitulo = `📄 *Solicitação de Documento (Prestador)*`;
          descricao = `Temos uma pendência de documentação em seu perfil de prestador.`;
          blocoDetalhes = [
            `${tipoEmoji} *DETALHES DA SOLICITAÇÃO*`,
            formatList([
              `*Documento:* 📄 ${nomeDocPrestador}`,
              `*Status:* ⏳ Aguardando Envio`
            ])
          ].join('\n');
          tituloAcao = `📌 *O QUE FAZER AGORA?*`;
          textoAcao = `Para darmos continuidade aos seus repasses e serviços, por favor, acesse o Portal e envie o arquivo solicitado para análise.`;
        } else if (contexto.status === 'aprovado') {
          subtitulo = `📄 *Análise de Documento (Prestador)*`;
          descricao = `Ótima notícia! Seu documento de prestador foi validado pela nossa equipe.`;
          blocoDetalhes = [
            `${tipoEmoji} *RESULTADO DA ANÁLISE*`,
            formatList([
              `*Documento:* 📄 ${nomeDocPrestador}`,
              `*Status:* ✅ Aprovado com Sucesso!`
            ])
          ].join('\n');
          tituloAcao = `✅ *TUDO CERTO!*`;
          textoAcao = `Agradecemos pelo envio. Seu cadastro de prestador está regularizado.`;
        } else if (contexto.status === 'em_analise' || contexto.status === 'analise') {
          subtitulo = `📄 *Documento Recebido (Prestador)*`;
          descricao = `Recebemos o seu documento e ele já está na fila de verificação da nossa equipe administrativa.`;
          blocoDetalhes = [
            `${tipoEmoji} *STATUS ATUAL*`,
            formatList([
              `*Documento:* 📄 ${nomeDocPrestador}`,
              `*Status:* 🔍 Em Análise`
            ])
          ].join('\n');
          tituloAcao = `⏳ *PRÓXIMOS PASSOS*`;
          textoAcao = `Agora é só aguardar! Em breve traremos uma atualização se o documento foi aprovado.`;
        } else if (contexto.status === 'reprovado') {
          subtitulo = `📄 *Análise de Documento (Prestador)*`;
          descricao = `Avaliamos o documento de prestador que você enviou recentemente.`;
          blocoDetalhes = [
            `${tipoEmoji} *RESULTADO DA ANÁLISE*`,
            formatList([
              `*Documento:* 📄 ${nomeDocPrestador}`,
              `*Status:* ❌ Reprovado`
            ])
          ].join('\n');
          tituloAcao = `⚠️ *AÇÃO NECESSÁRIA*`;
          textoAcao = `Não foi possível validar o documento. Acesse o seu Portal e realize o envio de um novo arquivo legível e correto.`;
        }
        despedida = `_Dúvidas? É só responder esta mensagem._`;
        break;

      // ─── Orçamento ─────────────────────────────────────────────────────────
      case 'orcamento':
        subtitulo = `📋 *Atualização do seu Orçamento*`;
        descricao = `Temos novidades sobre a sua solicitação.`;
        
        blocoDetalhes = [
          `${tipoEmoji} *DETALHES DO ORÇAMENTO*`,
          formatList([
            `*Código:* ${strCodigo}`,
            `*Status:* ${statusEmoji} ${strStatus}`,
            contexto.valorTotal ? `*Valor:* 💰 ${contexto.valorTotal}` : null
          ])
        ].join('\n');

        if (contexto.status?.toLowerCase().includes('aprovado')) {
          tituloAcao = `📌 *O QUE FAZER AGORA?*`;
          textoAcao = `Acesse o seu Portal do Cliente para confirmar as informações e dar andamento ao serviço.`;
        } else {
          textoAcao = `Acesse o portal para acompanhar todos os detalhes e próximos passos.`;
        }
        despedida = `_Dúvidas? É só responder esta mensagem._`;
        break;

      // ─── Ordem de Serviço ──────────────────────────────────────────────────
      case 'os':
        subtitulo = `🔧 *Andamento da Ordem de Serviço*`;
        descricao = `Sua ordem de serviço teve o status atualizado.`;

        blocoDetalhes = [
          `${tipoEmoji} *DADOS DA OS*`,
          formatList([
            `*Número:* ${strCodigo}`,
            `*Situação:* ${statusEmoji} ${strStatus}`,
            contexto.valorTotal ? `*Valor:* 💰 ${contexto.valorTotal}` : null
          ])
        ].join('\n');

        textoAcao = `Acompanhe o progresso completo no seu Portal do Cliente.`;
        despedida = `_Qualquer dúvida, estamos disponíveis para atendimento._`;
        break;

      // ─── Ordem de Compra ───────────────────────────────────────────────────
      case 'compra':
        subtitulo = `🛍️ *Atualização do seu Pedido*`;
        descricao = `Seu pedido de compra foi atualizado no sistema.`;

        blocoDetalhes = [
          `${tipoEmoji} *RESUMO DO PEDIDO*`,
          formatList([
            `*Pedido:* ${strCodigo}`,
            `*Status:* ${statusEmoji} ${strStatus}`,
            contexto.valorTotal ? `*Valor Total:* 💰 ${contexto.valorTotal}` : null
          ])
        ].join('\n');

        textoAcao = `Verifique todos os detalhes do seu pedido no portal.`;
        despedida = `_Obrigado pela preferência!_`;
        break;

      // ─── Assinatura ────────────────────────────────────────────────────────
      case 'assinatura':
        subtitulo = `📝 *Atualização da Assinatura*`;
        descricao = `Identificamos uma atualização no seu plano de assinatura.`;

        blocoDetalhes = [
          `${tipoEmoji} *INFORMAÇÕES*`,
          formatList([
            `*Código:* ${strCodigo}`,
            `*Status:* ${statusEmoji} ${strStatus}`,
            contexto.valorTotal ? `*Mensalidade:* 💰 ${contexto.valorTotal}` : null
          ])
        ].join('\n');

        textoAcao = `Gerencie sua assinatura diretamente no Portal do Cliente.`;
        despedida = `_Agradecemos a sua fidelidade!_`;
        break;

      // ─── Fatura ────────────────────────────────────────────────────────────
      case 'fatura':
        const isAtrasado = contexto.status?.toLowerCase().includes('vencid') || contexto.status?.toLowerCase().includes('atraso');
        const isPago = contexto.status?.toLowerCase().includes('pago');
        
        if (isPago) {
          subtitulo = `🎉 *Pagamento Confirmado!*`;
          descricao = `O pagamento da sua fatura foi processado com sucesso.`;
          
          blocoDetalhes = [
            `${tipoEmoji} *RESUMO DO PAGAMENTO*`,
            formatList([
              `*Referência:* ${strCodigo}`,
              contexto.valorTotal ? `*Valor Original:* 💰 ${contexto.valorTotal}` : null,
              contexto.cupomAplicado ? `*Cupom Aplicado:* 🎟️ -${contexto.valorCupom} (Cód: ${contexto.cupomAplicado})` : null,
              contexto.pontosUtilizados ? `*Pontos Utilizados:* ⭐ ${contexto.pontosUtilizados} pts (-${contexto.valorPontos})` : null,
              contexto.saldoCarteiraUtilizado ? `*Saldo Carteira:* 💳 -${contexto.saldoCarteiraUtilizado}` : null,
              contexto.creditoGsaUtilizado ? `*Crédito Loja GSA:* 💳 -${contexto.creditoGsaUtilizado}` : null,
              contexto.valorLiquido ? `*Valor Pago:* 💰 ${contexto.valorLiquido} ${contexto.formaPagamento ? `via ${contexto.formaPagamento}` : ''}` : null
            ])
          ].join('\n');
          
          textoAcao = `Obrigado por manter as contas em dia. Acesse o portal para ver o recibo e histórico completo.`;
        } else {
          subtitulo = isAtrasado ? `⚠️ *Aviso de Fatura*` : `💳 *Status da Fatura*`;
          descricao = `Esta é uma notificação sobre o status da sua fatura.`;
  
          blocoDetalhes = [
            `${tipoEmoji} *DETALHES DA FATURA*`,
            formatList([
              `*Referência:* ${strCodigo}`,
              `*Situação:* ${statusEmoji} ${strStatus}`,
              contexto.dataVencimento ? `*Vencimento:* 📅 ${contexto.dataVencimento}` : null,
              contexto.valorTotal ? `*Valor:* 💰 ${contexto.valorTotal}` : null
            ])
          ].join('\n');
        }

        if (isAtrasado) {
          tituloAcao = `🚨 *REGULARIZE AGORA*`;
          textoAcao = `Acesse o Portal do Cliente para realizar o pagamento e evitar encargos adicionais.`;
        } else {
          textoAcao = `Visualize o histórico completo e baixe a segunda via no seu portal.`;
        }
        despedida = `_Em caso de dúvidas, entre em contato conosco._`;
        break;

      // ─── Voucher ───────────────────────────────────────────────────────────
      case 'voucher':
        subtitulo = `🎁 *Você ganhou um Benefício!*`;
        descricao = `Um voucher especial foi liberado para você.`;

        blocoDetalhes = [
          `${tipoEmoji} *DADOS DO VOUCHER*`,
          formatList([
            `*Código Promocional:* ${strCodigo}`,
            contexto.valorTotal ? `*Desconto:* 💰 ${contexto.valorTotal}` : null,
            `*Dica:* Utilize antes da data de vencimento.`
          ])
        ].join('\n');

        tituloAcao = `🎟️ *COMO UTILIZAR*`;
        textoAcao = `Insira o código do voucher ao realizar sua próxima compra ou contratação no portal.`;
        despedida = `_Aproveite este benefício exclusivo!_`;
        break;

      // ─── Promoção ─────────────────────────────────────────────────────────
      case 'promocao':
        subtitulo = `🎁 *Oferta Exclusiva para Você!*`;
        descricao = `Temos uma novidade imperdível no GSA.`;

        blocoDetalhes = [
          `${tipoEmoji} *DETALHES DA PROMOÇÃO*`,
          formatList([
            `*Nome:* ${contexto.titulo || contexto.codigo || 'Promoção Especial'}`,
            contexto.valorTotal ? `*Valor:* 💰 A partir de ${contexto.valorTotal}` : null,
            `*Atenção:* Oferta por tempo limitado.`
          ])
        ].join('\n');

        textoAcao = `Acesse agora o portal e garanta sua oferta antes que acabe!`;
        despedida = `_Não perca essa oportunidade!_`;
        break;
      case 'credito':
        const credAprovado = contexto.status?.toLowerCase().includes('aprovado') || contexto.status?.toLowerCase().includes('liberado');
        subtitulo = credAprovado ? `🎉 *Crédito Liberado!*` : `📈 *Análise de Crédito*`;
        descricao = credAprovado ? `Temos ótimas notícias sobre a sua solicitação.` : `Sua solicitação teve o status atualizado.`;

        blocoDetalhes = [
          `${tipoEmoji} *INFORMAÇÕES DO CRÉDITO*`,
          formatList([
            `*Status:* ${statusEmoji} ${strStatus}`,
            contexto.valorTotal ? `*Limite:* 💰 ${contexto.valorTotal}` : null
          ])
        ].join('\n');

        if (credAprovado) {
          tituloAcao = `🚀 *PRÓXIMO PASSO*`;
          textoAcao = `Acesse o Portal do Cliente para visualizar as condições e começar a utilizar seu limite.`;
        } else {
          textoAcao = `Acompanhe sua solicitação em tempo real no Portal do Cliente.`;
        }
        despedida = credAprovado 
          ? `_Aproveite seu crédito com responsabilidade._` 
          : `_Dúvidas? Estamos à disposição._`;
        break;

      // ─── Produto ───────────────────────────────────────────────────────────
      case 'produto':
        subtitulo = `🎉 *Novidade no GSA!*`;
        descricao = `Um novo produto acaba de ser disponibilizado.`;

        blocoDetalhes = [
          `${tipoEmoji} *SOBRE O PRODUTO*`,
          formatList([
            `*Nome:* ${contexto.titulo || contexto.codigo || 'Lançamento Exclusivo'}`,
            contexto.valorTotal ? `*Valor:* 💰 ${contexto.valorTotal}` : null
          ])
        ].join('\n');

        textoAcao = `Confira todos os detalhes e faça seu pedido agora pelo portal.`;
        despedida = `_Esperamos que você goste dessa novidade!_`;
        break;

      // ─── Cobrança ──────────────────────────────────────────────────────────
      case 'cobranca':
        subtitulo = `⚠️ *AVISO DE COBRANÇA - PENDÊNCIA FINANCEIRA*`;
        descricao = `Identificamos uma pendência financeira em aberto referente à sua fatura no sistema GSA HUB.`;

        blocoDetalhes = [
          `📋 *DETALHES DA PENDÊNCIA:*`,
          formatList([
            `*Fatura:* ${strCodigo}`,
            `*Situação:* ${statusEmoji} ${strStatus}`,
            contexto.dataVencimento ? `*Vencimento:* 📅 ${contexto.dataVencimento}` : null,
            contexto.valorTotal ? `*Valor Atualizado (c/ encargos):* 💰 *${contexto.valorTotal}*` : null
          ]),
          ``,
          `🤝 Como podemos auxiliar com a quitação desta pendência? Estamos à disposição para negociar as melhores condições de pagamento para você.`
        ].join('\n');

        tituloAcao = `📌 *PRÓXIMO PASSO:*`;
        textoAcao = `Acesse o Portal do Cliente GSA para visualizar a fatura, obter a 2ª via ou realizar o pagamento.`;
        despedida = `_Se o pagamento já foi realizado, por favor desconsidere este aviso._`;
        break;

      // ─── Cliente ───────────────────────────────────────────────────────────
      case 'cliente':
        subtitulo = `👤 *Atualização Cadastral*`;
        descricao = `Esta é uma notificação sobre os dados da sua conta GSA.`;

        blocoDetalhes = [
          `${tipoEmoji} *DADOS DA CONTA*`,
          formatList([
            contexto.detalhesExtras ? `*Observação:* ${contexto.detalhesExtras}` : `Temos uma informação importante para você.`
          ])
        ].join('\n');

        textoAcao = `Acesse o portal para gerenciar sua conta de forma completa.`;
        despedida = `_Em caso de dúvidas, é só nos responder._`;
        break;

      // ─── Ticket de Suporte ─────────────────────────────────────────────────
      case 'ticket':
        const ticketResolvido = contexto.status?.toLowerCase().includes('concluí') || contexto.status?.toLowerCase().includes('resolvid');
        subtitulo = ticketResolvido ? `✅ *Chamado Resolvido!*` : `🎫 *Atualização no Suporte*`;
        descricao = ticketResolvido ? `O problema relatado foi solucionado pela nossa equipe.` : `Temos uma atualização sobre o seu chamado.`;

        blocoDetalhes = [
          `${tipoEmoji} *DADOS DO TICKET*`,
          formatList([
            `*Número:* ${strCodigo}`,
            `*Assunto:* ${contexto.titulo || '—'}`,
            `*Status:* ${statusEmoji} ${strStatus}`
          ])
        ].join('\n');

        if (ticketResolvido) {
          tituloAcao = `⭐ *AVALIAÇÃO*`;
          textoAcao = `Acesse o portal para confirmar a resolução. Caso o problema persista, abra um novo chamado.`;
        } else {
          textoAcao = `Acompanhe a tratativa e envie novas mensagens diretamente no Portal do Cliente.`;
        }
        despedida = `_Nossa equipe está dedicada em te ajudar._`;
        break;

      // ─── Indicação ─────────────────────────────────────────────────────────
      case 'indicacao':
        subtitulo = `🤝 *Atualização de Indicação*`;
        descricao = `Temos novidades sobre a pessoa que você indicou ao GSA.`;

        blocoDetalhes = [
          `${tipoEmoji} *RESUMO DA INDICAÇÃO*`,
          formatList([
            contexto.clienteNome ? `*Amigo(a) Indicado(a):* ${contexto.clienteNome}` : null,
            `*Status:* ${statusEmoji} ${strStatus}`
          ])
        ].join('\n');

        tituloAcao = `🎁 *SEUS BÔNUS*`;
        textoAcao = `Confira o histórico de suas indicações e os benefícios acumulados acessando o seu portal.`;
        despedida = `_Continue indicando e ganhando!_`;
        break;

      // ─── Personalizado ─────────────────────────────────────────────────────
      case 'personalizado':
        subtitulo = `💬 *Aviso Importante*`;
        descricao = `Equipe GSA entrou em contato.`;

        blocoDetalhes = [
          `${tipoEmoji} *MENSAGEM*`,
          formatList([
            contexto.detalhesExtras ? contexto.detalhesExtras : `Por favor, verifique seu portal para mais informações.`
          ])
        ].join('\n');

        textoAcao = `Acesse o Portal do Cliente para consultar detalhes.`;
        despedida = `_Estamos à disposição._`;
        break;

      // ─── Extrato ───────────────────────────────────────────────────────────
      case 'extrato':
        subtitulo = `📊 *EXTRATO FINANCEIRO DISPONÍVEL*`;
        descricao = `Acabamos de gerar o extrato com o histórico completo das suas movimentações.`;

        blocoDetalhes = [
          `📊 *O QUE VOCÊ VAI ENCONTRAR NO PDF:*`,
          formatList([
            `🟢 *Entradas* (Créditos, comissões, estornos e pagamentos)`,
            `🔴 *Saídas* (Resgates, débitos e contratação de serviços)`,
            contexto.valorTotal ? `💰 *Saldo Final na Emissão:* ${contexto.valorTotal}` : `💰 *Saldo Atualizado da Carteira*`
          ])
        ].join('\n');

        tituloAcao = `📑 *COMO VISUALIZAR*`;
        textoAcao = `Basta tocar no arquivo PDF enviado acima para abrir o seu documento.\n\n💡 *Dica:* Você pode salvar este arquivo ou encaminhar para a sua equipe financeira.`;
        
        despedida = `_Precisa de ajuda ou encontrou alguma divergência?_\n_Acesse a Central de Atendimento no Portal GSA._`;
        break;

      default:
        subtitulo = `🔔 *Nova Notificação*`;
        descricao = `Temos uma atualização no sistema para você.`;
        blocoDetalhes = '';
        textoAcao = `Acesse o portal do cliente para mais informações.`;
        despedida = `_— Equipe GSA_`;
    }

    // Se houver detalhes extras adicionais (não se aplica para personalizado ou cliente que já usam em outro local)
    let blocoObservacoes = '';
    if (contexto.detalhesExtras && contexto.tipo !== 'personalizado' && contexto.tipo !== 'cliente') {
      blocoObservacoes = `💡 *OBSERVAÇÕES ADICIONAIS*\n⬢ ${contexto.detalhesExtras}\n`;
    }

    const mensagemFinal = [
      cabecalho,
      ``,
      saudacao,
      ``,
      subtitulo,
      descricao,
      ``,
      blocoDetalhes,
      ``,
      blocoObservacoes ? `${blocoObservacoes}\n` : null,
      tituloAcao,
      textoAcao,
      ``,
      rodape(despedida),
    ].filter(line => line !== null && line !== undefined).join('\n');

    // Substituir múltiplas quebras de linha por apenas duas e remover espaços vazios
    return mensagemFinal.replace(/\n{3,}/g, '\n\n').trim();
  },

  abrirWhatsApp: (telefone: string | undefined | null, mensagem: string) => {
    const text = encodeURIComponent(mensagem);
    if (!telefone) {
      window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
      return;
    }
    const cleanPhone = telefone.replace(/\D/g, '');
    const ddiPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${ddiPhone}&text=${text}`;
    window.open(whatsappUrl, '_blank');
  },

  enviarWhatsAppDireto: async (
    telefone?: string | null,
    mensagem?: string,
    options?: SendDirectOptions
  ): Promise<boolean> => {
    if (!mensagem || typeof mensagem !== 'string') return false;

    let targetPhone = telefone ? telefone.replace(/\D/g, '') : '';

    // Se o telefone não veio nos props, tenta resolver automaticamente pelo Código da OS, Fatura ou Nome do Cliente!
    if (!targetPhone || targetPhone.length < 8) {
      try {
        // 1. Tentar por código de Ordem de Serviço (ex: OS102)
        const matchOS = mensagem.match(/(?:Número|Código|OS):\s*\*?(OS\d+)\*?/i);
        if (matchOS && matchOS[1]) {
          const codigoOs = matchOS[1].trim();
          const { data: osData } = await supabase
            .from('ordens_servico')
            .select('clientes(telefone)')
            .eq('codigo_os', codigoOs)
            .maybeSingle();

          if ((osData as any)?.clientes?.telefone) {
            targetPhone = (osData as any).clientes.telefone.replace(/\D/g, '');
          }
        }

        // 2. Tentar por nome do cliente
        if (!targetPhone || targetPhone.length < 8) {
          const matchNome = mensagem.match(/Olá,\s*\*([^*]+)\*/i);
          if (matchNome && matchNome[1]) {
            const nomeCliente = matchNome[1].trim();
            const { data: cliData } = await supabase
              .from('clientes')
              .select('telefone')
              .ilike('nome', `%${nomeCliente}%`)
              .not('telefone', 'is', null)
              .limit(1);

            if (cliData && cliData.length > 0 && cliData[0].telefone) {
              targetPhone = cliData[0].telefone.replace(/\D/g, '');
            }
          }
        }
      } catch (e) {
        console.warn('⚠️ Erro na resolução automática de telefone do cliente:', e);
      }
    }

    if (!targetPhone || targetPhone.length < 8) {
      toast.error('❌ Não foi possível realizar o envio automático: telefone do cliente não foi localizado no cadastro.');
      return false;
    }

    // R5 Integration: Check if dispatch is paused
    if (whatsappHealthService.isPaused()) {
      whatsappHealthService.enqueueMessage({
        recipient: targetPhone,
        message: mensagem,
        options: options as any,
      });
      return true;
    }

    const resolvedDestination = await resolveWhatsAppDestination(targetPhone);
    const timeScale = getEffectiveTimeScale(options);

    return new Promise<boolean>((resolve, reject) => {
      const item: PendingBatchItem = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        message: mensagem,
        options,
        resolve,
        reject,
      };

      const existingBatch = pendingBatches.get(resolvedDestination);

      if (existingBatch) {
        existingBatch.items.push(item);
        return;
      }

      const initialDelayRaw =
        options?.customInitialDelayMs !== undefined
          ? options.customInitialDelayMs
          : options?.skipPresence
          ? 0
          : Math.floor(Math.random() * 8001) + 4000;

      const initialDelay =
        options?.customInitialDelayMs !== undefined
          ? options.customInitialDelayMs
          : Math.round(initialDelayRaw * timeScale);

      const newBatch: ActiveBatch = {
        phone: targetPhone,
        resolvedDestination,
        items: [item],
        timeScale,
        timer: null,
      };

      pendingBatches.set(resolvedDestination, newBatch);

      if (initialDelay <= 0) {
        pendingBatches.delete(resolvedDestination);
        void executeBatch(newBatch);
      } else {
        newBatch.timer = setTimeout(() => {
          pendingBatches.delete(resolvedDestination);
          void executeBatch(newBatch);
        }, initialDelay);
      }
    });
  },

  getQueueLength: (): number => {
    return whatsappHealthService.getState().queuedCount;
  },

  isPaused: (): boolean => {
    return whatsappHealthService.isPaused();
  },

  setPaused: (paused: boolean): void => {
    whatsappHealthService.setPaused(paused);
  },
};

// ─── Concurrency, Micro-Jitter & Batching Pipeline (R1 & R3) ─────────────────

interface PendingBatchItem {
  id: string;
  message: string;
  options?: SendDirectOptions;
  resolve: (value: boolean) => void;
  reject: (reason?: any) => void;
}

interface ActiveBatch {
  phone: string;
  resolvedDestination: string;
  items: PendingBatchItem[];
  timer: any;
  timeScale: number;
}

const pendingBatches = new Map<string, ActiveBatch>();
let lastDispatchTimestamp = 0;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getEffectiveTimeScale(options?: SendDirectOptions): number {
  if (options?.timeScale !== undefined) {
    return options.timeScale;
  }
  const isTest =
    typeof process !== 'undefined' &&
    (process.env.NODE_ENV === 'test' ||
      Boolean(process.env.VITEST) ||
      typeof (globalThis as any).__vitest__ !== 'undefined');
  return isTest ? 0.001 : 1.0;
}

async function executeBatch(batch: ActiveBatch): Promise<void> {
  const { resolvedDestination, items, timeScale } = batch;
  if (items.length === 0) return;

  // Micro-Jitter between distinct recipient dispatches (300ms to 1200ms)
  const now = Date.now();
  const jitterBase = Math.floor(Math.random() * 901) + 300;
  const jitterDelay = Math.round(jitterBase * timeScale);
  if (jitterDelay > 0 && now - lastDispatchTimestamp < jitterDelay) {
    await sleep(jitterDelay - (now - lastDispatchTimestamp));
  }
  lastDispatchTimestamp = Date.now();

  const firstOptions = items[0].options;
  // If multiple items, group them with dividers
  const compositeText = items.map((item) => item.message).join('\n\n──────────────────────────────\n\n');

  // Check if any item has media
  const mediaItem = items.find((item) => item.options?.mediaUrl || item.options?.mediaBase64);
  const options: SendDirectOptions = {
    ...firstOptions,
    ...(mediaItem?.options || {}),
  };

  // Storage integration: apply dynamic variations
  let finalText = compositeText;
  if (options?.enableVariation !== false) {
    if (options?.clienteNome || options?.enableVariation === true) {
      finalText = applyDynamicGreetingAndFooter(finalText, options?.clienteNome);
    }
    if (
      options?.enableUrlRandomizer !== false &&
      (options?.enableVariation === true || finalText.includes('http://') || finalText.includes('https://'))
    ) {
      finalText = randomizeMessageUrls(finalText);
    }
    if (options?.enableZeroWidth === true || options?.enableVariation === true) {
      finalText = injectZeroWidthEntropy(finalText);
    }
  }

  // Handle PDF byte variation
  let mediaBase64 = options?.mediaBase64;
  if (
    mediaBase64 &&
    (options?.fileName?.toLowerCase().endsWith('.pdf') || mediaBase64.includes('pdf'))
  ) {
    mediaBase64 = pdfVariationEngine.applyBase64Variation(mediaBase64);
  }

  const skipPresence = Boolean(options?.skipPresence);
  const fetchFn = typeof window !== 'undefined' && window.fetch ? window.fetch : globalThis.fetch;

  // R1: Presence Choreography Sequence
  if (!skipPresence) {
    // 1. Read Receipt Emittance (if reply context exists)
    if (options?.isReply || options?.quotedMessageId) {
      try {
        const readPayload: any = {
          readMessages: [
            {
              remoteJid: resolvedDestination,
              fromMe: false,
              ...(options?.quotedMessageId ? { id: options.quotedMessageId } : {}),
            },
          ],
        };
        await fetchFn('http://147.15.43.141:8080/chat/markMessageAsRead/GSA_WhatsApp', {
          method: 'POST',
          headers: {
            apikey: 'gsa_hub_evolution_token_2026',
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify(readPayload),
          signal:
            typeof AbortSignal !== 'undefined' && AbortSignal.timeout
              ? AbortSignal.timeout(2500)
              : undefined,
        });
      } catch (e) {
        console.warn('⚠️ Falha não-bloqueante no read receipt:', e);
      }
    }

    // 2. Set presence available
    try {
      await fetchFn('http://147.15.43.141:8080/chat/sendPresence/GSA_WhatsApp', {
        method: 'POST',
        headers: {
          apikey: 'gsa_hub_evolution_token_2026',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ number: resolvedDestination, presence: 'available', delay: 1200 }),
        signal:
          typeof AbortSignal !== 'undefined' && AbortSignal.timeout
            ? AbortSignal.timeout(2500)
            : undefined,
      });
    } catch (e) {
      console.warn('⚠️ Falha não-bloqueante ao definir presença available:', e);
    }

    // 3. Typing indicator sequence: composing (4s) -> paused (2s) -> composing (3s)
    try {
      await fetchFn('http://147.15.43.141:8080/chat/sendPresence/GSA_WhatsApp', {
        method: 'POST',
        headers: {
          apikey: 'gsa_hub_evolution_token_2026',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ number: resolvedDestination, presence: 'composing', delay: 1200 }),
        signal:
          typeof AbortSignal !== 'undefined' && AbortSignal.timeout
            ? AbortSignal.timeout(2500)
            : undefined,
      });
    } catch {}
    await sleep(Math.round(4000 * timeScale));

    try {
      await fetchFn('http://147.15.43.141:8080/chat/sendPresence/GSA_WhatsApp', {
        method: 'POST',
        headers: {
          apikey: 'gsa_hub_evolution_token_2026',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ number: resolvedDestination, presence: 'paused', delay: 1200 }),
        signal:
          typeof AbortSignal !== 'undefined' && AbortSignal.timeout
            ? AbortSignal.timeout(2500)
            : undefined,
      });
    } catch {}
    await sleep(Math.round(2000 * timeScale));

    try {
      await fetchFn('http://147.15.43.141:8080/chat/sendPresence/GSA_WhatsApp', {
        method: 'POST',
        headers: {
          apikey: 'gsa_hub_evolution_token_2026',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ number: resolvedDestination, presence: 'composing', delay: 1200 }),
        signal:
          typeof AbortSignal !== 'undefined' && AbortSignal.timeout
            ? AbortSignal.timeout(2500)
            : undefined,
      });
    } catch {}
    await sleep(Math.round(3000 * timeScale));
  }

  // 4. 3-Tier Fallback Cascade Dispatch
  let dispatchSuccess = false;

  // Tier 1: Evolution API direct (Port 8080)
  try {
    if (options?.mediaUrl || mediaBase64) {
      const mediaPayload = {
        number: resolvedDestination,
        mediatype: 'image',
        mimetype: 'image/png',
        caption: finalText,
        media: options.mediaUrl || mediaBase64,
        fileName: options.fileName || 'logo-parceiro.png',
        delay: 500,
      };

      const evoMediaRes = await fetchFn('http://147.15.43.141:8080/message/sendMedia/GSA_WhatsApp', {
        method: 'POST',
        headers: {
          apikey: 'gsa_hub_evolution_token_2026',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(mediaPayload),
        signal:
          typeof AbortSignal !== 'undefined' && AbortSignal.timeout
            ? AbortSignal.timeout(8000)
            : undefined,
      });

      if (evoMediaRes.ok) {
        const evoData = await evoMediaRes.json().catch(() => ({}));
        if (
          evoData?.key?.id ||
          evoData?.status === 'PENDING' ||
          evoMediaRes.status === 201 ||
          evoMediaRes.status === 200
        ) {
          console.log(
            `✅ WhatsApp com imagem enviado via Evolution API para ${resolvedDestination}:`,
            evoData?.key?.id
          );
          dispatchSuccess = true;
        }
      }
    } else {
      const evoRes = await fetchFn('http://147.15.43.141:8080/message/sendText/GSA_WhatsApp', {
        method: 'POST',
        headers: {
          apikey: 'gsa_hub_evolution_token_2026',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          number: resolvedDestination,
          text: finalText,
          delay: 500,
          linkPreview: options?.linkPreview ?? true,
        }),
        signal:
          typeof AbortSignal !== 'undefined' && AbortSignal.timeout
            ? AbortSignal.timeout(6000)
            : undefined,
      });

      if (evoRes.ok) {
        const evoData = await evoRes.json().catch(() => ({}));
        if (
          evoData?.key?.id ||
          evoData?.status === 'PENDING' ||
          evoRes.status === 201 ||
          evoRes.status === 200
        ) {
          console.log(
            `✅ WhatsApp enviado diretamente via Evolution API para ${resolvedDestination}:`,
            evoData?.key?.id
          );
          dispatchSuccess = true;
        }
      }
    }
  } catch (evoErr) {
    console.warn('⚠️ Tentativa direta na Evolution API falhou, tentando via Edge Function...', evoErr);
  }

  // Tier 2: Fallback via Edge Function vps-api
  if (!dispatchSuccess) {
    try {
      const { data, error } = await supabase.functions.invoke('vps-api', {
        body: {
          action: 'send-whatsapp',
          phone: resolvedDestination,
          message: finalText,
          title: 'Notificação GSA HUB',
          category: 'CLIENTE',
          targetIp: '147.15.43.141',
        },
      });

      if (!error && data?.success) {
        dispatchSuccess = true;
      }
    } catch (e) {
      console.warn('⚠️ Falha no disparo via Edge Function vps-api:', e);
    }
  }

  // Tier 3: Fallback via n8n webhook (Port 5678)
  if (!dispatchSuccess) {
    try {
      const n8nRes = await fetchFn('http://147.15.43.141:5678/webhook/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          phone: resolvedDestination,
          message: finalText,
          title: 'Notificação GSA HUB',
          category: 'CLIENTE',
        }),
        signal:
          typeof AbortSignal !== 'undefined' && AbortSignal.timeout
            ? AbortSignal.timeout(5000)
            : undefined,
      });
      if (n8nRes.ok) {
        dispatchSuccess = true;
      }
    } catch (n8nErr) {
      console.warn('⚠️ Falha no webhook n8n:', n8nErr);
    }
  }

  // 5. Cleanup presence: set unavailable
  if (!skipPresence) {
    try {
      await fetchFn('http://147.15.43.141:8080/chat/sendPresence/GSA_WhatsApp', {
        method: 'POST',
        headers: {
          apikey: 'gsa_hub_evolution_token_2026',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ number: resolvedDestination, presence: 'unavailable', delay: 1200 }),
        signal:
          typeof AbortSignal !== 'undefined' && AbortSignal.timeout
            ? AbortSignal.timeout(2500)
            : undefined,
      });
    } catch (err) {
      console.warn('⚠️ Falha não-bloqueante ao definir presença unavailable:', err);
    }
  }

  if (!dispatchSuccess) {
    toast.error('⚠️ Ocorreu um erro no servidor de WhatsApp. Tente novamente em instantes.');
  }

  // Resolve all enqueued promises in this batch
  items.forEach((item) => {
    item.resolve(dispatchSuccess);
  });
}
