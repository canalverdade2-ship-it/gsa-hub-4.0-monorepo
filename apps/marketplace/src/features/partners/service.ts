import { callAdminRpc } from '../../lib/adminRpc';
import { supabase } from '../../lib/supabase';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { sendAdminWhatsAppNotification } from '../../utils/n8nWhatsApp';
import type {
  Partner,
  PartnerApplicationData,
  PartnerApplicationResult,
  PartnerBenefitRedemptionPayload,
  PartnerBenefitRedemptionResult,
  PartnerFormData,
  PartnerRedemptionAppeal,
  ProtocolConsultResult,
} from './types';

const PUBLIC_FIELDS = [
  'id', 'slug', 'name', 'category', 'short_description', 'description', 'logo_url', 'cover_url',
  'phone', 'whatsapp', 'email', 'website', 'instagram', 'facebook', 'linkedin', 'street', 'number',
  'complement', 'neighborhood', 'city', 'state', 'zip_code', 'maps_url', 'business_hours',
  'service_mode', 'service_regions', 'services', 'products', 'benefits', 'featured', 'display_order',
  'status', 'redemption_has_coupon', 'redemption_coupon_code', 'redemption_has_voucher',
  'redemption_has_link', 'redemption_link', 'redemption_auto_redirect', 'redemption_instructions',
  'redemption_delay_24h', 'created_at', 'updated_at',
].join(',');

function normalizeList(value: string[] | null | undefined): string[] {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizePartner(partner: any): Partner {
  return {
    ...partner,
    service_regions: normalizeList(partner?.service_regions),
    services: normalizeList(partner?.services),
    products: normalizeList(partner?.products),
    featured: Boolean(partner?.featured),
    display_order: Number(partner?.display_order || 0),
    redemption_has_coupon: Boolean(partner?.redemption_has_coupon),
    redemption_has_voucher: Boolean(partner?.redemption_has_voucher),
    redemption_has_link: Boolean(partner?.redemption_has_link),
    redemption_auto_redirect: Boolean(partner?.redemption_auto_redirect),
    redemption_delay_24h: Boolean(partner?.redemption_delay_24h),
    application_source: partner?.application_source || 'admin',
  } as Partner;
}

export async function listPublicPartners(): Promise<Partner[]> {
  const { data, error } = await supabase
    .from('parceiros_publicos')
    .select(PUBLIC_FIELDS)
    .eq('status', 'ativo')
    .order('featured', { ascending: false })
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map(normalizePartner);
}

export async function getPublicPartner(slug: string): Promise<Partner | null> {
  const { data, error } = await supabase
    .from('parceiros_publicos')
    .select(PUBLIC_FIELDS)
    .eq('status', 'ativo')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizePartner(data) : null;
}

export async function submitPartnerApplication(
  payload: PartnerApplicationData,
  logoFile?: File | null,
  coverFile?: File | null,
): Promise<PartnerApplicationResult> {
  const body = new FormData();
  body.append('payload', JSON.stringify(payload));
  if (logoFile) body.append('logo', logoFile, logoFile.name);
  if (coverFile) body.append('cover', coverFile, coverFile.name);

  const { data, error } = await supabase.functions.invoke<PartnerApplicationResult & { error?: string }>(
    'gsa-partner-application',
    { body },
  );

  if (error) {
    throw new Error(error.message || 'Não foi possível enviar a solicitação de parceria.');
  }
  if (!data?.success || !data.protocol) {
    throw new Error(data?.message || 'Não foi possível concluir o envio da solicitação.');
  }
  return data;
}

export async function listAdminPartners(): Promise<Partner[]> {
  try {
    const snapshot = await callAdminRpc<{ partners?: Partner[] }>('gsa_admin_partners_snapshot');
    if (snapshot?.partners && snapshot.partners.length > 0) {
      return (snapshot.partners || []).map(normalizePartner);
    }
  } catch (rpcErr) {
    console.warn('gsa_admin_partners_snapshot falhou, buscando parceiros diretamente:', rpcErr);
  }

  const { data, error } = await supabase
    .from('parceiros')
    .select('*')
    .neq('status', 'excluido')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao listar parceiros:', error);
    return [];
  }

  return (data || []).map(normalizePartner);
}

export async function savePartner(payload: PartnerFormData, id?: string): Promise<Partner> {
  const shortDescription = (
    payload.short_description?.trim() ||
    payload.description?.trim() ||
    payload.benefits?.trim() ||
    payload.name?.trim() ||
    'Parceiro Comercial GSA'
  );

  const normalized = {
    ...payload,
    slug: (payload.slug || payload.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    name: payload.name.trim(),
    category: payload.category?.trim() || 'Geral',
    short_description: shortDescription,
    description: payload.description?.trim() || null,
    legal_name: payload.legal_name?.trim() || null,
    service_regions: normalizeList(payload.service_regions),
    services: normalizeList(payload.services),
    products: normalizeList(payload.products),
  };

  const partnerId = id || (payload as any)?.id || null;
  const redemptionData = {
    redemption_has_coupon: Boolean(payload.redemption_has_coupon),
    redemption_coupon_code: payload.redemption_coupon_code?.trim() || null,
    redemption_has_voucher: Boolean(payload.redemption_has_voucher),
    redemption_has_link: Boolean(payload.redemption_has_link),
    redemption_link: payload.redemption_link?.trim() || null,
    redemption_auto_redirect: Boolean(payload.redemption_auto_redirect),
    redemption_instructions: payload.redemption_instructions?.trim() || null,
    redemption_delay_24h: Boolean(payload.redemption_delay_24h),
  };

  const result = await callAdminRpc<{ partner: Partner }>('gsa_admin_save_partner', {
    p_partner_id: partnerId,
    p_payload: {
      ...normalized,
      id: partnerId,
      ...redemptionData,
    },
  });

  if (!result?.partner) {
    throw new Error('Não foi possível salvar o parceiro comercial.');
  }

  return normalizePartner(result.partner);
}

export async function redeemPartnerBenefit(
  payload: PartnerBenefitRedemptionPayload,
): Promise<PartnerBenefitRedemptionResult> {
  const duplicateJustification = payload.justificativaDuplicidade?.trim() || '';
  const isDuplicateOverride = Boolean(payload.forceOverride && duplicateJustification);
  if (payload.forceOverride && !duplicateJustification) {
    throw new Error('Informe uma justificativa para solicitar o benefício novamente.');
  }

  const rpcParams: Record<string, any> = {
    p_parceiro_id: payload.parceiroId || null,
    p_parceiro_slug: payload.parceiroSlug || null,
    p_nome_completo: payload.nomeCompleto.trim(),
    p_telefone: payload.telefone.trim(),
    p_cliente_id: payload.clienteId || null,
  };

  if (payload.email) {
    rpcParams.p_email = payload.email.trim();
  }

  if (isDuplicateOverride) {
    rpcParams.p_justificativa = duplicateJustification;
  }

  const rpcName = isDuplicateOverride
    ? 'gsa_public_resgatar_beneficio_parceiro_em_analise'
    : 'gsa_public_resgatar_beneficio_parceiro';

  let { data, error } = await supabase.rpc(rpcName, rpcParams);

  // Compatibilidade apenas para instalações antigas da RPC normal.
  if (!isDuplicateOverride && error && error.message &&
      (error.message.includes('p_email') || error.code === 'PGRST202' || error.message.includes('parameters'))) {
    delete rpcParams.p_email;
    const retry = await supabase.rpc('gsa_public_resgatar_beneficio_parceiro', rpcParams);
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    throw new Error(error.message || 'Não foi possível resgatar o benefício no momento.');
  }

  const result = data as PartnerBenefitRedemptionResult;

  const partnerName = result?.partner_name || 'Parceiro Comercial GSA';
  const benefitDesc = result?.benefits || 'Benefício e condição especial garantidos pelo Grupo GSA.';

  // Determina se é modo 24h
  let isDelay24h = Boolean(result?.delay_24h);
  if (result?.delay_24h === undefined) {
    if (result && !result.has_coupon && !result.has_voucher && !result.has_link) {
      isDelay24h = true;
    } else if (payload.parceiroId || payload.parceiroSlug) {
      const partnerQuery = supabase.from('parceiros').select('redemption_delay_24h, redemption_has_coupon, redemption_has_voucher, redemption_has_link');
      if (payload.parceiroId) partnerQuery.eq('id', payload.parceiroId);
      else if (payload.parceiroSlug) partnerQuery.eq('slug', payload.parceiroSlug);
      const { data: pData } = await partnerQuery.maybeSingle();
      if (pData) {
        isDelay24h = Boolean(pData.redemption_delay_24h || (!pData.redemption_has_coupon && !pData.redemption_has_voucher && !pData.redemption_has_link));
      }
    }
  }

  const protocolo = result?.codigo_gerado || result?.protocolo || `PROT-RES-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;



  if (result?.status === 'analise') {
    // Duplicidade justificada: aguarda decisão administrativa antes de enviar mensagem de liberação.
  } else if (isDelay24h) {
    // 1. Envia notificação de WhatsApp para o cliente informando o prazo de 24h de forma limpa e agradável
    const firstName = payload.nomeCompleto.trim().split(' ')[0] || payload.nomeCompleto.trim();

    const clientWelcomeMessage = [
      `📋 *SOLICITAÇÃO DE BENEFÍCIO REGISTRADA!*`,
      ``,
      `Olá, *${firstName}*! 👋`,
      ``,
      `Recebemos seu pedido de resgate do benefício exclusivo da parceria *${partnerName}*.`,
      ``,
      `🎁 *Benefício:*`,
      `${benefitDesc}`,
      ``,
      `⏳ *PRAZO DE ATIVAÇÃO (EM ATÉ 24 HORAS):*`,
      `Nossa equipe já está processando sua liberação junto ao parceiro. Em até *24 horas*, você receberá por aqui, no seu WhatsApp, o seu *link oficial de ativação* com carência zero.`,
      ``,
      `📄 *Protocolo:* \`${protocolo}\``,
      ``,
      `_Grupo GSA — Gestão de Serviços & Benefícios_`
    ].filter(Boolean).join('\n');

    void whatsappNotificationService.enviarWhatsAppDireto(payload.telefone, clientWelcomeMessage).catch((e) => {
      console.warn('Falha no envio de WhatsApp inicial de resgate:', e);
    });

    // 2. Envia notificação ao WhatsApp do Administrador informando que há um resgate pendente com protocolo
    void sendAdminWhatsAppNotification({
      title: `Novo Resgate: ${partnerName}`,
      category: 'FORNECEDORES',
      message: `O cliente *${payload.nomeCompleto}* solicitou o benefício da parceria *${partnerName}*.\n\nProtocolo: *${protocolo}*\nWhatsApp: ${payload.telefone}\nE-mail: ${payload.email || 'Não informado'}\nStatus: *Pendente de cadastro no parceiro e link de ativação*.\n\nAcesse o Painel Administrativo em Fornecedores & Parceiros > Resgates para gerar o link.`
    }).catch((err) => {
      console.warn('[PartnersService] Falha ao despachar notificação WhatsApp para admin:', err);
    });
  } else {
    // Modo Imediato: Envia confirmação com cupom/link direto de forma limpa
    const firstName = payload.nomeCompleto.trim().split(' ')[0] || payload.nomeCompleto.trim();

    const clientImmediateMessage = [
      `🎉 *BENEFÍCIO RESGATADO COM SUCESSO!* 🚀`,
      ``,
      `Olá, *${firstName}*! 👋`,
      ``,
      `O seu benefício na parceria *${partnerName}* foi liberado com sucesso!`,
      ``,
      `🎁 *Benefício:*`,
      `${benefitDesc}`,
      ``,
      result?.codigo_gerado ? `🔑 *Código de Acesso:* \`${result.codigo_gerado}\`` : null,
      result?.link ? `🔗 *Link da Parceria:*\n${result.link}` : null,
      result?.instructions ? `📌 *Instruções:* ${result.instructions}` : null,
      ``,
      `📄 *Protocolo:* \`${protocolo}\``,
      ``,
      `_Grupo GSA — Gestão de Serviços & Benefícios_`
    ].filter(Boolean).join('\n');

    void whatsappNotificationService.enviarWhatsAppDireto(payload.telefone, clientImmediateMessage).catch((e) => {
      console.warn('Falha no envio de WhatsApp imediato de resgate:', e);
    });
  }

  return {
    ...result,
    delay_24h: isDelay24h,
    codigo_gerado: protocolo,
    protocolo
  };
}

export interface CompletePartnerRedemptionPayload {
  resgateId: string;
  linkAtivacao: string;
  partnerName: string;
  partnerCover?: string | null;
  partnerLogo?: string | null;
  benefitName?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  protocolo?: string;
  cupom?: string;
  voucher?: string;
  forceApprove?: boolean;
}

/**
 * Registra o link de ativação gerado pelo Administrador e envia a notificação bonita e elaborada por WhatsApp
 */
export async function completePartnerRedemption(payload: CompletePartnerRedemptionPayload): Promise<boolean> {
  const cleanLink = payload.linkAtivacao.trim();
  if (!cleanLink) {
    throw new Error('Informe o link de ativação gerado no site do parceiro.');
  }

  // 0. Verifica duplicidade se não for forceApprove
  if (!payload.forceApprove) {
    try {
      const fromObj = supabase.from('parceiros_resgates');
      if (typeof fromObj?.select === 'function') {
        const { data: currentResgate } = await fromObj
          .select('parceiro_id')
          .eq('id', payload.resgateId)
          .single();

        if (currentResgate?.parceiro_id) {
          let query = supabase
            .from('parceiros_resgates')
            .select('id')
            .eq('parceiro_id', currentResgate.parceiro_id)
            .neq('id', payload.resgateId)
            .neq('status', 'recusado');
            
          if (payload.customerEmail && payload.customerPhone) {
            query = query.or(`email.eq.${payload.customerEmail},telefone.eq.${payload.customerPhone}`);
          } else if (payload.customerEmail) {
            query = query.eq('email', payload.customerEmail);
          } else if (payload.customerPhone) {
            query = query.eq('telefone', payload.customerPhone);
          }

          const { data: dups } = await query.limit(1);
          if (dups && dups.length > 0) {
            throw new Error('DUPLICATE_FOUND');
          }
        }
      }
    } catch (dupErr: any) {
      if (dupErr?.message === 'DUPLICATE_FOUND') throw dupErr;
    }
  }

  // 1. Atualiza no banco de dados via RPC administrativa (SECURITY DEFINER)
  // Nota: as colunas 'cupom' e 'voucher' NÃO existem na tabela parceiros_resgates;
  // esses valores são enviados apenas na mensagem de WhatsApp ao cliente.
  const rpcResult = await callAdminRpc<{ success: boolean; error?: string }>('gsa_admin_complete_partner_redemption', {
    p_resgate_id: payload.resgateId,
    p_link_ativacao: cleanLink || null,
  });

  if (!rpcResult?.success) {
    throw new Error(
      typeof rpcResult?.error === 'string'
        ? rpcResult.error
        : 'Falha ao salvar a conclusão do resgate no banco de dados.',
    );
  }


  // Busca foto de capa/banner do parceiro (prioridade) ou logo
  let imageToSend = payload.partnerCover || payload.partnerLogo;
  if (!imageToSend && payload.resgateId) {
    try {
      const { data: resgData } = await supabase
        .from('parceiros_resgates')
        .select('parceiro_id')
        .eq('id', payload.resgateId)
        .maybeSingle();

      if (resgData?.parceiro_id) {
        const { data: parcData } = await supabase
          .from('parceiros')
          .select('cover_url, logo_url')
          .eq('id', resgData.parceiro_id)
          .maybeSingle();
        if (parcData) {
          imageToSend = parcData.cover_url || parcData.logo_url;
        }
      }
    } catch {
      // Ignora falha de busca de imagem e segue com envio
    }
  }

  // 2. Dispara a notificação de WhatsApp limpa, moderna e elegante para o cliente
  const partnerTitle = payload.partnerName || 'Parceiro Comercial GSA';
  const benefitDesc = payload.benefitName || 'Condição exclusiva com 100% de desconto e carência zero.';
  const customerFirstName = payload.customerName.trim().split(' ')[0] || payload.customerName.trim();

  const lines = [
    `🎉 *SEU BENEFÍCIO JÁ ESTÁ DISPONÍVEL!* 🚀`,
    ``,
    `Olá, *${customerFirstName}*! 👋`,
    ``,
    `O seu link oficial de ativação para a parceria com a *${partnerTitle}* já foi liberado com sucesso!`,
    ``,
    `🎁 *Benefício Exclusivo:*`,
    `${benefitDesc}`,
    ``,
    `🔗 *LINK OFICIAL DE ATIVAÇÃO:*`,
    `${cleanLink}`,
    ``,
    payload.cupom?.trim() ? `🎟️ *CUPOM DE DESCONTO:*\n\`${payload.cupom.trim()}\`\n` : null,
    payload.voucher?.trim() ? `🎫 *VOUCHER EXCLUSIVO:*\n\`${payload.voucher.trim()}\`\n` : null,
    `📋 *Como ativar:*`,
    ``,
    `1️⃣ Clique no link oficial acima`,
    ``,
    `2️⃣ Conclua o seu cadastro no site`,
    ``,
    `3️⃣ Aproveite o benefício com carência zero!`,
    ``,
    payload.protocolo ? `📄 *Protocolo:* \`${payload.protocolo}\`` : null,
    payload.protocolo ? `` : null,
    `_Grupo GSA — Gestão de Serviços & Benefícios_`
  ];

  const activationMessage = lines.filter(item => item !== null).join('\n');

  const sent = await whatsappNotificationService.enviarWhatsAppDireto(
    payload.customerPhone,
    activationMessage,
    {
      mediaUrl: imageToSend || undefined,
      fileName: 'banner-beneficio.png'
    }
  );
  return sent;
}

export async function setPartnerStatus(id: string, status: Partner['status']): Promise<void> {
  await callAdminRpc('gsa_admin_set_partner_status', {
    p_partner_id: id,
    p_status: status,
  });
}

export async function listPartnerRedemptions(partnerId?: string): Promise<import('./types').PartnerRedemption[]> {
  try {
    const result = await callAdminRpc<{ redemptions?: import('./types').PartnerRedemption[] }>('gsa_admin_list_partner_redemptions', {
      p_partner_id: partnerId || null,
    });
    if (result?.redemptions && result.redemptions.length > 0) {
      return result.redemptions;
    }
  } catch {
    // Fallback: consulta direta
  }

  try {
    let query = supabase
      .from('parceiros_resgates')
      .select('*')
      .order('created_at', { ascending: false });
    if (partnerId) {
      query = query.eq('parceiro_id', partnerId);
    }
    const { data, error } = await query;
    if (error) {
      console.warn('Fallback de resgates falhou:', error);
      return [];
    }

    const redemptions = (data || []) as import('./types').PartnerRedemption[];

    // Enriquecer dados dos clientes (e-mail, CPF, endereço) caso não estejam no registro de resgate
    try {
      const phones = redemptions.map(r => r.telefone ? r.telefone.replace(/\D/g, '') : '').filter(Boolean);
      const clientIds = redemptions.map(r => r.cliente_id).filter(Boolean) as string[];

      if (phones.length > 0 || clientIds.length > 0) {
        const { data: clientsData } = await supabase
          .from('clientes')
          .select('id, nome, email, telefone, cpf, endereco, cidade, estado, cep');

        if (clientsData && clientsData.length > 0) {
          return redemptions.map(r => {
            const cleanPhone = r.telefone ? r.telefone.replace(/\D/g, '') : '';
            const matched = clientsData.find(c => 
              (r.cliente_id && c.id === r.cliente_id) ||
              (cleanPhone && c.telefone && c.telefone.replace(/\D/g, '').includes(cleanPhone.slice(-8))) ||
              (r.nome_completo && c.nome && c.nome.toLowerCase().trim() === r.nome_completo.toLowerCase().trim())
            );

            return {
              ...r,
              email: r.email || matched?.email || null,
              telefone: r.telefone || matched?.telefone || '',
              cpf: r.cpf || matched?.cpf || null,
              endereco: r.endereco || matched?.endereco || null,
              cidade: r.cidade || matched?.cidade || null,
              estado: r.estado || matched?.estado || null,
              cep: r.cep || matched?.cep || null,
            };
          });
        }
      }
    } catch (enrichErr) {
      console.warn('Enriquecimento de resgates falhou silenciosamente:', enrichErr);
    }

    return redemptions;
  } catch (err) {
    console.error('Erro ao listar resgates do parceiro:', err);
    return [];
  }
}

export async function consultarProtocolo(
  codigo: string
): Promise<{ success: boolean; data?: ProtocolConsultResult; message?: string }> {
  try {
    const { data, error } = await supabase.rpc('gsa_public_consultar_protocolo', {
      p_codigo: codigo.trim().toUpperCase(),
    });

    if (error) {
      console.error('Erro RPC consultarProtocolo:', error);
      return { success: false, message: 'Erro ao consultar protocolo. Tente novamente.' };
    }

    if (!data || data.success === false) {
      return { success: false, message: data?.message || 'Protocolo não encontrado.' };
    }

    const result = data as ProtocolConsultResult;
    result.eventos = Array.isArray(result.eventos) ? result.eventos : [];

    return { success: true, data: result };
  } catch (err) {
    console.error('Erro inesperado ao consultar protocolo:', err);
    return { success: false, message: 'Erro inesperado. Tente novamente.' };
  }
}

export async function checkDuplicateRedemption(parceiroId: string, email?: string, telefone?: string): Promise<boolean> {
  if (!parceiroId || (!email && !telefone)) return false;

  let query = supabase
    .from('parceiros_resgates')
    .select('id')
    .eq('parceiro_id', parceiroId)
    .neq('status', 'recusado'); // Only count non-rejected as duplicates

  if (email && telefone) {
    query = query.or(`email.eq.${email},telefone.eq.${telefone}`);
  } else if (email) {
    query = query.eq('email', email);
  } else if (telefone) {
    query = query.eq('telefone', telefone);
  }

  const { data, error } = await query.limit(1);
  if (error) {
    console.warn('Erro ao checar duplicidade:', error);
    return false;
  }

  return data && data.length > 0;
}

export async function approveRedemption(resgateId: string): Promise<boolean> {
  const result = await callAdminRpc<{ success?: boolean }>('gsa_admin_set_partner_redemption_status', {
    p_resgate_id: resgateId,
    p_status: 'pendente',
    p_motivo: null,
  });
  return result?.success === true;
}

export async function rejectRedemption(resgateId: string, motivo: string): Promise<boolean> {
  const result = await callAdminRpc<{ success?: boolean }>('gsa_admin_set_partner_redemption_status', {
    p_resgate_id: resgateId,
    p_status: 'recusado',
    p_motivo: motivo.trim(),
  });
  return result?.success === true;
}

export async function cancelPartnerRedemption(resgateId: string, motivo: string): Promise<boolean> {
  const result = await callAdminRpc<{ success?: boolean }>('gsa_admin_cancel_partner_redemption', {
    p_resgate_id: resgateId,
    p_motivo: motivo.trim(),
  });
  return result?.success === true;
}

export async function deletePartnerRedemption(resgateId: string, confirmation: string): Promise<boolean> {
  const result = await callAdminRpc<{ success?: boolean }>('gsa_admin_delete_partner_redemption', {
    p_resgate_id: resgateId,
    p_confirmation: confirmation.trim(),
  });
  return result?.success === true;
}

async function invokePartnerAppealGateway(action: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('gsa-auth-session', {
    body: { action, payload },
  });
  if (!error) return data as any;

  let code = 'appeal_unavailable';
  const response = (error as any)?.context instanceof Response ? (error as any).context as Response : null;
  if (response) {
    try {
      const body = await response.clone().json();
      code = body?.error || code;
    } catch {
      // Mantém a mensagem pública genérica.
    }
  }
  const messages: Record<string, string> = {
    appeal_already_used: 'Esta solicitação já utilizou o único recurso disponível.',
    appeal_not_available: 'O recurso não está disponível para esta solicitação.',
    invalid_or_expired_code: 'O código é inválido ou expirou. Solicite um novo código.',
    verification_delivery_failed: 'Não foi possível enviar o código pelo WhatsApp. Tente novamente em instantes.',
    too_many_attempts: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    invalid_payload: 'Os dados de confirmação ficaram inconsistentes. Volte uma etapa e tente novamente.',
    appeal_submission_failed: 'O código foi validado, mas não foi possível registrar o recurso. Tente novamente.',
  };
  const gatewayError = new Error(messages[code] || 'Não foi possível concluir o recurso no momento.') as Error & { code?: string };
  gatewayError.code = code;
  throw gatewayError;
}

export async function requestPartnerAppealVerification(protocol: string): Promise<{
  success: boolean;
  challenge_id: string;
  expires_in: number;
  destination: string;
}> {
  return invokePartnerAppealGateway('request_partner_appeal', {
    protocol: protocol.trim().toUpperCase(),
  });
}

export async function beginPartnerAppealChallenge(protocol: string): Promise<{
  success: boolean;
  challenge_id: string;
  expires_in: number;
  destination: string;
}> {
  return requestPartnerAppealVerification(protocol);
}

export async function submitPartnerAppeal(payload: {
  challengeId: string;
  code: string;
  contestacao: string;
  idempotencyKey: string;
  anexos?: string[];
}): Promise<{ success: boolean; appeal: PartnerRedemptionAppeal }> {
  return invokePartnerAppealGateway('submit_partner_appeal', {
    challenge_id: payload.challengeId,
    code: payload.code,
    contestacao: payload.contestacao.trim(),
    idempotency_key: payload.idempotencyKey,
    anexos: payload.anexos || [],
  });
}

export async function completePartnerAppeal(payload: {
  challengeId: string;
  pin: string;
  justificativa: string;
  anexos?: string[];
  idempotencyKey?: string;
}): Promise<{ success: boolean; appeal: PartnerRedemptionAppeal }> {
  const fallbackUuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });

  return submitPartnerAppeal({
    challengeId: payload.challengeId,
    code: payload.pin,
    contestacao: payload.justificativa,
    idempotencyKey: payload.idempotencyKey || (
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : fallbackUuid()
    ),
    anexos: payload.anexos,
  });
}

export async function uploadAppealEvidenceFile(file: File, protocol: string): Promise<string> {
  const cleanProtocol = protocol.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const fileExt = file.name.split('.').pop() || 'jpg';
  const cleanFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const filePath = `recursos/${cleanProtocol}/${cleanFileName}`;

  const { data, error } = await supabase.storage
    .from('parceiros-midias')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.warn('Erro no upload para parceiros-midias:', error);
    throw new Error('Não foi possível enviar o anexo de evidência.');
  }

  const { data: urlData } = supabase.storage
    .from('parceiros-midias')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

export async function decidePartnerAppeal(
  recursoId: string,
  decisao: 'deferido' | 'indeferido',
  motivo?: string,
): Promise<PartnerRedemptionAppeal> {
  const result = await callAdminRpc<{ success: boolean; appeal: PartnerRedemptionAppeal }>('gsa_admin_decide_partner_appeal', {
    p_recurso_id: recursoId,
    p_decisao: decisao,
    p_motivo: motivo?.trim() || null,
  });
  if (!result?.success || !result.appeal) throw new Error('Não foi possível registrar a decisão do recurso.');
  return result.appeal;
}
