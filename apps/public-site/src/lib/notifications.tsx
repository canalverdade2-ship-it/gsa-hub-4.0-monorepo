import { supabase } from './supabase';
import { sessionService } from './sessionService';
import { callClientRpc } from './clientRpc';
import { Module } from '../types';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import type { AcaoOrigem, DestinatarioTipo, Prioridade } from './notificationService';

export const EMOJIS = {
  orcamentos: '📄✨',
  servicos: '🛠️⚙️',
  produtos: '📦🛒',
  assinaturas: '📅🔄',
  transferencias: '💸↔️',
  financeiro: '💰💳',
  vouchers: '🎫🎁',
  suporte: '💬🆘',
  'indique-ganhe': '🤝🎉',
  pontos: '⭐🏆',
  promocoes: '🔥📢',
  premios: '🎁🎊',
  area_vip: '👑💎',
  credito_loja: '💳💰',
  success: '✅✅',
  warning: '⚠️⚠️',
  error: '❌❌',
  info: 'ℹ️ℹ️',
  bell: '🔔🔔'
};

export function showAnimatedToast(titulo: string, mensagem: string, modulo: Module | 'success' | 'error' | 'warning' | 'info' = 'info') {
  const emoji = EMOJIS[modulo as keyof typeof EMOJIS] || EMOJIS.bell;
  
  toast.custom((t) => (
    <motion.div
      initial={{ opacity: 0, x: 50, scale: 0.8 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.8 }}
      className={`${
        t.visible ? 'animate-enter' : 'animate-leave'
      } max-w-md w-full bg-white shadow-lg rounded-2xl pointer-events-auto flex ring-1 ring-black/5 overflow-hidden`}
    >
      <div className="flex-1 w-0 p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0 pt-0.5">
            <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center text-xl">
              {emoji.substring(0, 2)}
            </div>
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-semibold text-neutral-900">
              {titulo}
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              {mensagem}
            </p>
          </div>
        </div>
      </div>
      <div className="flex border-l border-black/5">
        <button
          onClick={() => toast.dismiss(t.id)}
          className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none"
        >
          Fechar
        </button>
      </div>
    </motion.div>
  ), { duration: 5000 });
}

/**
 * Cria uma notificação na tabela `notificacoes`.
 * 
 * ATUALIZADO: Agora inclui colunas de roteamento inteligente.
 * Para notificações com destinatário preciso, use notificationService.ts.
 * Esta função mantém retrocompatibilidade com chamadas existentes.
 */
export async function createNotification(
  clienteId: string | null,
  titulo: string,
  mensagem: string,
  modulo: Module,
  tab?: string,
  itemId?: string,
  tipo?: string,
  options?: {
    prestadorId?: string | null;
    acaoOrigem?: AcaoOrigem;
    prioridade?: Prioridade;
    contexto?: Record<string, any>;
  }
) {
  try {
    // Verificação básica de parâmetros
    if (!titulo || !mensagem) return;

    // Adiciona emoji ao título se não tiver
    let finalTitulo = titulo;
    const emoji = EMOJIS[modulo as keyof typeof EMOJIS] || EMOJIS.bell;
    if (!titulo.includes(emoji.substring(0, 2))) {
      finalTitulo = `${emoji} ${titulo}`;
    }

    // Determinar destinatário automaticamente baseado nos IDs
    let destinatarioTipo: DestinatarioTipo = 'admin';
    if (clienteId && clienteId !== 'null') {
      destinatarioTipo = 'cliente';
    } else if (options?.prestadorId) {
      destinatarioTipo = 'prestador';
    } else if (tipo === 'global') {
      destinatarioTipo = 'broadcast_todos';
    }

    const session = sessionService.getCurrentSession();
    if (session?.atorTipo === 'cliente') {
      if (destinatarioTipo !== 'admin' && !(destinatarioTipo === 'cliente' && clienteId === session.atorId)) {
        throw new Error('Destinatário não permitido para esta sessão.');
      }
      await callClientRpc(destinatarioTipo === 'admin' ? 'gsa_client_notify_admin' : 'gsa_client_notify_self', {
        p_titulo: finalTitulo, p_mensagem: mensagem, p_modulo: modulo,
        p_tab: tab || null, p_item_id: itemId || null,
        p_acao_origem: options?.acaoOrigem || 'sistema',
        p_prioridade: options?.prioridade || 'normal', p_contexto: options?.contexto || {},
        ...(destinatarioTipo === 'cliente' ? { p_tipo: tipo || 'sistema' } : {}),
      });
      return;
    }
    const { error } = await supabase
      .from('notificacoes')
      .insert([{
        cliente_id: clienteId,
        prestador_id: options?.prestadorId || null,
        titulo: finalTitulo,
        mensagem,
        modulo,
        tab,
        item_id: itemId,
        tipo: tipo || 'sistema',
        lida: false,
        data_criacao: new Date().toISOString(),
        // Novas colunas de roteamento
        destinatario_tipo: destinatarioTipo,
        acao_origem: options?.acaoOrigem || 'sistema',
        prioridade: options?.prioridade || 'normal',
        contexto: options?.contexto || null
      }]);

    if (error) {
      console.warn('Aviso: Erro ao criar notificação:', error.message);
      throw error;
    }
  } catch (err) {
    console.error('Falha crítica ao tentar criar notificação:', err);
    throw err;
  }
}

/**
 * Cria a sequência de notificações de boas-vindas na ordem correta:
 * 1º Bem Vindo (Latest/Top)
 * 2º Cadastro Aprovado
 * 3º Pontos Ganhos
 * 4º Parabéns Upgrade de Nivel (Oldest)
 */
export async function createWelcomeSequence(clientId: string, bonusValue: number = 100, levelName: string = 'Básico') {
  console.log(`[Notificações] Criando sequência de boas-vindas para o cliente ${clientId}...`);
  try {
    const now = new Date();
    
    const notifications = [
      {
        cliente_id: clientId,
        titulo: '⭐🏆 PARABÉNS!',
        mensagem: `Você acaba de subir para o nível ${levelName.toUpperCase()}! Agora você ganha pontos para cada R$1 gasto no sistema.`,
        modulo: 'dashboard',
        tipo: 'sistema',
        destinatario_tipo: 'cliente',
        prioridade: 'normal',
        data_criacao: new Date(now.getTime() - 3000).toISOString()
      },
      {
        cliente_id: clientId,
        titulo: '⭐🏆 Pontos Ganhos',
        mensagem: `Você ganhou ${bonusValue} pontos de boas-vindas! 🎉`,
        modulo: 'dashboard',
        tipo: 'sistema',
        destinatario_tipo: 'cliente',
        prioridade: 'normal',
        data_criacao: new Date(now.getTime() - 2000).toISOString()
      },
      {
        cliente_id: clientId,
        titulo: '✅✅ Cadastro Aprovado',
        mensagem: 'Seu cadastro foi analisado e aprovado! Todos os módulos estão liberados. 🚀',
        modulo: 'dashboard',
        tipo: 'sistema',
        destinatario_tipo: 'cliente',
        prioridade: 'alta',
        data_criacao: new Date(now.getTime() - 1000).toISOString()
      },
      {
        cliente_id: clientId,
        titulo: '👋 Bem-vindo(a)!',
        mensagem: 'Seu cadastro foi criado com sucesso. Bem-vindo(a) ao portal! 🎉',
        modulo: 'dashboard',
        tipo: 'sistema',
        destinatario_tipo: 'cliente',
        prioridade: 'normal',
        data_criacao: now.toISOString()
      }
    ];

    await supabase.from('notificacoes').insert(notifications);

  } catch (err) {
    console.error('Erro ao criar sequência de boas-vindas:', err);
  }
}
