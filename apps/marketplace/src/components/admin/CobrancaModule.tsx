import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { notificationService } from '../../lib/notificationService';
import { useAdminNotifications } from '../../hooks/useAdminNotifications';
import { formatCurrency, formatDateTime, formatDate, maskPhone, maskCPF, maskCNPJ, generateCode } from '../../lib/utils';
import { toast } from 'react-hot-toast';
import { logService } from '../../lib/logService';
import { useConfirm } from '../../hooks/useConfirm';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { 
  Gavel, AlertTriangle, MessageCircle, Settings, History, Send, Clock, CheckCircle,
  Activity, User, Briefcase, Scale, Target, Banknote, Loader2,
  TrendingUp, TrendingDown, ShieldAlert, Search, Filter, XCircle, Trash2, FileText, Layers
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { AdminWhatsAppButton } from './ui/AdminWhatsAppButton';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { canDeleteRecord } from '../../lib/deleteRequest';
import { sessionService } from '../../lib/sessionService';
import { callAdminRpc } from '../../lib/adminRpc';

const getAdminSessionForRpc = () => {
  const session = sessionService.getCurrentSession();
  if (!session?.sessaoId || !session?.sessionToken) {
    throw new Error('Sessão administrativa expirada. Faça login novamente.');
  }
  return session;
};

export function CobrancaModule({ initialTab, initialItemId, onNavigate, colaboradorNome }: { initialTab?: string, initialItemId?: string, onNavigate?: (mod: string, tab?: string, item?: string) => void, colaboradorNome?: string }) {
  const { pendencies } = useAdminNotifications();
  const confirmHook = useConfirm();
  const [activeTab, setActiveTab] = useState(initialTab || 'dashboard');
  const [loading, setLoading] = useState(true);
  const [cobrancas, setCobrancas] = useState<any[]>([]);
  const [faturasElegiveis, setFaturasElegiveis] = useState<any[]>([]);
  const [loadingFaturasElegiveis, setLoadingFaturasElegiveis] = useState(false);
  const [configs, setConfigs] = useState<any>({});
  const [editingConfigs, setEditingConfigs] = useState<any>({});
  const [savingConfigs, setSavingConfigs] = useState(false);
  // Fix #9: Busca na fila
  const [searchFila, setSearchFila] = useState('');
  
  // Modals
  const [selectedCobranca, setSelectedCobranca] = useState<any>(null);
  const [isWpModalOpen, setIsWpModalOpen] = useState(false);
  const [wpMessage, setWpMessage] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [isGerarCobrancaOpen, setIsGerarCobrancaOpen] = useState(false);
  const [selectedFaturaIds, setSelectedFaturaIds] = useState<string[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  
  const [isAcordoModalOpen, setIsAcordoModalOpen] = useState(false);
  const [acordoData, setAcordoData] = useState({ parcelas: 1, dtPrimeiroVenc: '', desconto: 0, tipo_desconto: 'fixo', observacoes: '' });
  
  const [isHistoricoModalOpen, setIsHistoricoModalOpen] = useState(false);
  const [novoHistorico, setNovoHistorico] = useState({ tipo: 'contato_telefonico', descricao: '', promessa_pagamento: false, data_promessa: '' });
  const [parcelaLoading, setParcelaLoading] = useState<string | null>(null);
  const [submittingAcordo, setSubmittingAcordo] = useState(false);
  
  // Modal baixa parcela
  const [isBaixaParcelaOpen, setIsBaixaParcelaOpen] = useState(false);
  const [parcelaSelecionada, setParcelaSelecionada] = useState<any>(null);
  const [baixaData, setBaixaData] = useState({ data_pagamento: new Date().toISOString().split('T')[0], forma_pagamento: 'pix' });
  
  // Modal baixa manual cobrança
  const [isBaixaCobrancaOpen, setIsBaixaCobrancaOpen] = useState(false);
  const [baixaCobrancaData, setBaixaCobrancaData] = useState({ valor_pago: 0, data_pagamento: new Date().toISOString().split('T')[0], forma_pagamento: 'pix' });
  
  // Modal Protesto
  const [isProtestoModalOpen, setIsProtestoModalOpen] = useState(false);
  const [protestoData, setProtestoData] = useState({ data_protesto: new Date().toISOString().split('T')[0], nome_cartorio: '' });
  const [isSubmittingAcao, setIsSubmittingAcao] = useState(false);


// Fix #3: Reagir a mudanças no initialTab
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    let isMounted = true;
    const loadInit = async () => {
      await fetchConfigs(isMounted);
      await fetchDados(isMounted);
    };
    loadInit();

    let timeoutId: NodeJS.Timeout;
    const debouncedFetch = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fetchDados();
      }, 300);
    };

    const channelCobrancas = supabase
      .channel(`admin-cobrancas-rt-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cobrancas' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cobranca_historico' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cobranca_acordo_parcelas' }, debouncedFetch)
      .subscribe();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      supabase.removeChannel(channelCobrancas);
    };
  }, []);

  const fetchConfigs = async (isMounted = true) => {
    try {
      const { data, error } = await supabase.from('system_settings').select('*');
      if (error) throw error;
      if (data && isMounted) {
        const parsed = data.reduce((acc: any, curr: any) => ({ ...acc, [curr.key]: curr.value }), {});
        setConfigs(parsed);
        setEditingConfigs(parsed);
      }
    } catch (err: any) {
      toast.error('Erro ao buscar configurações.');
    }
  };

  // Fix #7: Recalcular dias_atraso e valor_atualizado dinamicamente
  const fetchDados = async (isMounted = true) => {
    if (isMounted) setLoading(true);
    try {
      const { data: configData, error: configError } = await supabase.from('system_settings').select('key, value');
      if (configError) throw configError;
      const settings = (configData || []).reduce((acc: any, curr: any) => ({ ...acc, [curr.key]: curr.value }), {});
    const multaPct = Number(settings.cobranca_multa_porcentagem) || 2;
    const jurosMensal = Number(settings.cobranca_juros_mensal) || 1;
    const jurosTipo = settings.cobranca_juros_tipo || 'diario';

    const { data, error } = await supabase
      .from('cobrancas')
      .select('*, faturas(codigo_fatura, data_vencimento), clientes(nome, cpf, cnpj, telefone, email, codigo_cliente), cobranca_historico(*), cobranca_acordo_parcelas(*)')
      .order('score_risco', { ascending: false });

    if (data) {
      // Recalcular valores dinâmicos para cada cobrança ativa
      const updated = data.map((c: any) => {
        if (['quitado'].includes(c.status)) return c;
        
        const vencimento = c.faturas?.data_vencimento ? new Date(c.faturas.data_vencimento) : new Date(c.created_at);
        const diff = Date.now() - vencimento.getTime();
        const diasAtraso = Math.max(0, Math.floor(diff / 86400000));
        
        const valorOriginal = Number(c.valor_original);
        const multa = valorOriginal * (multaPct / 100);
        let juros = 0;
        if (jurosTipo === 'diario') {
          juros = valorOriginal * (jurosMensal / 100 / 30) * diasAtraso;
        } else {
          juros = valorOriginal * (jurosMensal / 100) * Math.floor(diasAtraso / 30);
        }
        const valorAtualizado = Math.round((valorOriginal + multa + juros) * 100) / 100;

        let score = 0;
        score += Math.min(diasAtraso * 0.4, 40);
        score += Math.min((valorOriginal / 1000) * 5, 25);
        score += 15;
        score = Math.max(0, Math.min(100, Math.round(score)));

        return {
          ...c,
          dias_atraso: diasAtraso,
          valor_multa: Math.round(multa * 100) / 100,
          valor_juros: Math.round(juros * 100) / 100,
          valor_atualizado: valorAtualizado,
          score_risco: score
        };
      });
      if (isMounted) setCobrancas(updated);
    }
    } catch (err: any) {
      toast.error('Erro ao carregar dados de cobrança.');
    }
    if (isMounted) setLoading(false);
  };

  const fetchFaturasElegiveisCobranca = async () => {
    setLoadingFaturasElegiveis(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('faturas')
        .select('id, codigo_fatura, cliente_id, valor_total, valor_final_pendente, data_vencimento, status, created_at, clientes(nome, telefone, email, codigo_cliente), cobrancas(id)')
        .in('status', ['pendente', 'vencida', 'pendente_pagamento', 'aguardando_link'])
        .lte('data_vencimento', today)
        .order('data_vencimento', { ascending: true });

      if (error) throw error;

      setFaturasElegiveis((data || []).filter((f: any) => !f.cobrancas || f.cobrancas.length === 0));
    } catch (err) {
      console.error('Erro ao buscar faturas elegiveis para cobranca:', err);
      toast.error('Erro ao carregar faturas elegiveis para cobranca.');
    } finally {
      setLoadingFaturasElegiveis(false);
    }
  };

  const openGerarCobrancaModal = () => {
    setIsGerarCobrancaOpen(true);
    setSelectedFaturaIds([]);
    fetchFaturasElegiveisCobranca();
  };

  const toggleSelectFatura = (id: string) => {
    setSelectedFaturaIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAllFaturas = () => {
    if (selectedFaturaIds.length === faturasElegiveis.length) {
      setSelectedFaturaIds([]);
    } else {
      setSelectedFaturaIds(faturasElegiveis.map((f) => f.id));
    }
  };

  const handleGerarCobrancasEmLote = async () => {
    const idsToProcess = selectedFaturaIds.length > 0 ? selectedFaturaIds : faturasElegiveis.map((f) => f.id);
    if (idsToProcess.length === 0) {
      toast.error('Nenhuma fatura elegível para gerar cobrança.');
      return;
    }

    setBatchProcessing(true);
    let successCount = 0;
    let existsCount = 0;
    let errorCount = 0;

    try {
      const session = getAdminSessionForRpc();
      for (const faturaId of idsToProcess) {
        const fatura = faturasElegiveis.find((f) => f.id === faturaId);
        try {
          const { data, error } = await supabase.rpc('gsa_admin_criar_cobranca_fatura', {
            p_sessao_id: session.sessaoId,
            p_session_token: session.sessionToken,
            p_fatura_id: faturaId
          });

          if (error) {
            errorCount++;
          } else if (data?.already_exists) {
            existsCount++;
          } else {
            successCount++;
            if (fatura) {
              await logService.logAction({
                ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
                ator_nome: colaboradorNome || 'Administrador',
                acao: 'GERAR_COBRANCA',
                detalhes: `Cobrança em lote gerada para a fatura ${fatura.codigo_fatura || fatura.id}.`
              });
            }
          }
        } catch (error) {
          console.error("Erro ao gerar cobrança em lote:", error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} cobrança(s) gerada(s) em lote com sucesso!`);
      }
      if (existsCount > 0) {
        toast(`${existsCount} fatura(s) já possuíam cobrança ativa.`, { icon: 'ℹ️' });
      }
      if (errorCount > 0) {
        toast.error(`Falha ao gerar cobrança em ${errorCount} fatura(s).`);
      }

      setSelectedFaturaIds([]);
      fetchDados();
      fetchFaturasElegiveisCobranca();
      setActiveTab('fila');
      setIsGerarCobrancaOpen(false);
    } catch (err: any) {
      console.error('Erro ao gerar cobranças em lote:', err);
      toast.error('Erro ao processar cobranças em lote.');
    } finally {
      setBatchProcessing(false);
    }
  };

  const handleGerarCobrancaFatura = async (fatura: any) => {
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_criar_cobranca_fatura', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_fatura_id: fatura.id
      });

      if (error) throw error;

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'GERAR_COBRANCA',
        detalhes: `Cobranca gerada para a fatura ${fatura.codigo_fatura || fatura.id}.`
      });

      if (data?.already_exists) {
        toast('Esta fatura ja esta na central de cobranca.', { icon: 'i' });
      } else {
        toast.success('Cobranca gerada com sucesso!');
      }

      fetchDados();
      fetchFaturasElegiveisCobranca();
      setActiveTab('fila');
    } catch (err: any) {
      console.error('Erro ao gerar cobranca:', err);
      toast.error(err?.message || 'Erro ao gerar cobranca.');
    }
  };

  // --- KPI Cálculos ---
  const kpis = {
    totalPendente: cobrancas.filter(c => ['pendente', 'em_cobranca', 'acordo_quebrado'].includes(c.status)).reduce((a, b) => a + Number(b.valor_atualizado), 0),
    totalRecuperado: cobrancas.filter(c => ['quitado', 'acordo'].includes(c.status)).reduce((a, b) => a + Number(b.valor_pago || 0), 0),
    qtdEmAtraso: cobrancas.filter(c => ['pendente', 'em_cobranca', 'acordo_quebrado'].includes(c.status)).length,
    qtdAcordos: cobrancas.filter(c => ['acordo', 'acordo_quebrado'].includes(c.status)).length,
    qtdCartorio: cobrancas.filter(c => c.status === 'cartorio' || c.status === 'protestado' || c.nivel_cobranca >= 3).length,
    cobrancasHoje: cobrancas.filter(c => ['pendente', 'em_cobranca', 'acordo_quebrado'].includes(c.status) && (!c.data_ultimo_contato || new Date(c.data_ultimo_contato).toDateString() !== new Date().toDateString())).length,
    acordosVencendo: cobrancas.filter(c => ['acordo', 'acordo_quebrado'].includes(c.status) && (c.cobranca_acordo_parcelas || []).some((p: any) => p.status === 'pendente' && new Date(p.data_vencimento).getTime() <= Date.now() + 7 * 86400000)).length,
    taxaRecuperacao: 0
  };
  const totalGeral = kpis.totalPendente + kpis.totalRecuperado;
  kpis.taxaRecuperacao = totalGeral > 0 ? (kpis.totalRecuperado / totalGeral) * 100 : 0;

  // Fix #8: Dados para gráfico de distribuição
  const statusDistribution = [
    { name: 'Pendente', value: cobrancas.filter(c => c.status === 'pendente').length, color: '#f59e0b' },
    { name: 'Em Cobrança', value: cobrancas.filter(c => c.status === 'em_cobranca').length, color: '#ef4444' },
    { name: 'Acordo', value: cobrancas.filter(c => c.status === 'acordo').length, color: '#6366f1' },
    { name: 'Acordo Quebrado', value: cobrancas.filter(c => c.status === 'acordo_quebrado').length, color: '#e11d48' },
    { name: 'Cartório', value: cobrancas.filter(c => ['cartorio', 'protestado'].includes(c.status)).length, color: '#1e293b' },
    { name: 'Quitado', value: cobrancas.filter(c => c.status === 'quitado').length, color: '#10b981' },
  ].filter(s => s.value > 0);

  const historicoGeral = cobrancas
    .flatMap(c => (c.cobranca_historico || []).map((h: any) => ({ ...h, cobranca: c })))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 80);

  // --- Handler WhatsApp ---
  const handleEnviarWhatsAppDireto = async (c: any) => {
    if (!c || sendingId === c.id) return;
    setSendingId(c.id);

    const defaultCobrancaTemplate = [
      `⚠️ *AVISO DE COBRANÇA - PENDÊNCIA FINANCEIRA* ⚠️`,
      ``,
      `Olá, *{nome_cliente}*! 👋`,
      ``,
      `Identificamos uma pendência financeira em aberto no sistema *GSA HUB* referente à sua fatura. 📄`,
      ``,
      `📋 *DETALHES DA PENDÊNCIA:*`,
      `🧾 *Fatura:* #{numero_fatura}`,
      `⏰ *Dias em Atraso:* {dias_atraso} dias`,
      `💸 *Valor Atualizado (c/ encargos):* *{valor_atualizado}*`,
      ``,
      `💬 Como podemos auxiliar com a quitação desta pendência?`,
      `Estamos à disposição para negociar as melhores condições de pagamento para você de forma rápida e segura! 🤝`,
      ``,
      `▶️ *COMO RESOLVER AGORA MESMO:*`,
      `Responda esta mensagem com a opção desejada para autoatendimento:`,
      ``,
      `1️⃣ Solicitar 2ª via da Fatura / Boleto`,
      `2️⃣ Gerar código PIX para pagamento`,
      `3️⃣ Negociar dívida`,
      ``,
      `_Mensagem enviada via GSA HUB._`
    ].join('\n');

    const legacyTemplate = "Olá {nome_cliente}, notamos que a sua fatura {numero_fatura} no valor atualizado de R$ {valor_atualizado} consta em aberto há {dias_atraso} dias. Como podemos auxiliar com a quitação desta pendência?";
    const isLegacy = configs.cobranca_wp_template?.trim().startsWith("Olá {nome_cliente}, notamos que a sua fatura");

    const rawTemplate = (configs.cobranca_wp_template && configs.cobranca_wp_template.trim() !== '' && !isLegacy)
      ? configs.cobranca_wp_template
      : defaultCobrancaTemplate;

    let msg = rawTemplate
      .replace(/{nome_cliente}/g, c.clientes?.nome || 'Cliente')
      .replace(/{numero_fatura}/g, c.faturas?.codigo_fatura || c.fatura_id?.substring(0, 8))
      .replace(/{valor_original}/g, formatCurrency(c.valor_original))
      .replace(/{valor_atualizado}/g, formatCurrency(c.valor_atualizado))
      .replace(/{dias_atraso}/g, String(c.dias_atraso || 0));

    // Corrige duplicação "R$ R$" caso venha de templates legados
    msg = msg.replace(/R\$\s*R\$/g, 'R$');

    // Garante o rodapé padrão se não estiver presente
    if (!msg.includes('_Mensagem enviada via GSA HUB._')) {
      msg = msg + '\n\n_Mensagem enviada via GSA HUB._';
    }

    const phoneNum = c.clientes?.telefone?.replace(/\D/g, '') || null;

    try {
      const session = getAdminSessionForRpc();
      const { error } = await supabase.rpc('gsa_admin_registrar_cobranca_historico', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cobranca_id: c.id,
        p_tipo_acao: 'contato_whatsapp',
        p_descricao: 'Mensagem de cobrança enviada via WhatsApp.',
        p_canal: 'whatsapp',
        p_atualizar_ultimo_contato: true
      });

      if (error) console.warn('Erro ao registrar histórico de cobrança:', error);

      fetchDados();

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'CONTATO_WHATSAPP_COBRANCA',
        detalhes: `Mensagem WhatsApp enviada para ${c.clientes?.nome} (Ref: ${c.faturas?.codigo_fatura || c.id.slice(0, 8)})`
      });

      const sent = await whatsappNotificationService.enviarWhatsAppDireto(phoneNum, msg, {
        clienteNome: c.clientes?.nome,
        codigoFatura: c.faturas?.codigo_fatura
      });

      if (sent) {
        toast.success(`✅ Notificação de cobrança enviada instantaneamente no WhatsApp!`);
      } else {
        toast.error(`Não foi possível enviar a notificação no WhatsApp.`);
      }
    } catch (err: any) {
      console.error('Erro ao processar envio de cobrança:', err);
      toast.error(err?.message || 'Erro ao processar envio de cobrança.');
    } finally {
      setSendingId(null);
    }
  };

  const handleMudarStatusCobranca = async (cobranca: any, status: string, nivel: number = 1) => {
    try {
      const session = getAdminSessionForRpc();
      const { error } = await supabase.rpc('gsa_admin_mudar_status_cobranca', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cobranca_id: cobranca.id,
        p_status: status,
        p_nivel_cobranca: nivel
      });

      if (error) throw error;

      toast.success(`Divida movida para ${status}!`);
      setIsHistoricoModalOpen(false);
      setSelectedCobranca(null);

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'MUDAR_STATUS_COBRANCA',
        detalhes: `Status da cobranca ${cobranca.id.slice(0, 8)} alterado para ${status} (Nivel ${nivel})`
      });

      fetchDados();
    } catch (err: any) {
      console.error('Erro ao mudar status de cobranca:', err);
      toast.error(err?.message || 'Erro ao mudar status.');
    } finally {
      setIsSubmittingAcao(false);
    }
  };

  const confirmarProtesto = async () => {
    if (!selectedCobranca || !protestoData.data_protesto || !protestoData.nome_cartorio || isSubmittingAcao) {
      if (!isSubmittingAcao) toast.error('Preencha todos os campos do protesto.');
      return;
    }

    setIsSubmittingAcao(true);
    try {
      const session = getAdminSessionForRpc();
      const faturaDescricaoOriginal = selectedCobranca.faturas?.codigo_fatura || selectedCobranca.fatura_id?.substring(0, 8);
      const { data, error } = await supabase.rpc('gsa_admin_protestar_cobranca', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cobranca_id: selectedCobranca.id,
        p_data_protesto: protestoData.data_protesto,
        p_nome_cartorio: protestoData.nome_cartorio
      });

      if (error) throw error;

      await notificationService.notifyClient(
        selectedCobranca.cliente_id,
        'ALERTA: Titulo Protestado',
        `Sua divida (Ref: ${faturaDescricaoOriginal || selectedCobranca.id.slice(0, 8)}) foi encaminhada para o cartorio ${protestoData.nome_cartorio}. Entre em contato urgente com a assessoria.`,
        'financeiro',
        'cobranca_protesto',
        { itemId: data?.fatura_id || selectedCobranca.fatura_id || selectedCobranca.id, tab: 'faturas', prioridade: 'urgente' }
      );

      toast.success(data?.already_processed ? 'Titulo ja estava protestado.' : 'Titulo protestado e fatura agrupada gerada.');
      setIsProtestoModalOpen(false);
      setSelectedCobranca(null);
      setProtestoData({ data_protesto: new Date().toISOString().split('T')[0], nome_cartorio: '' });

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'PROTESTAR_DIVIDA',
        detalhes: `Divida de ${selectedCobranca.clientes?.nome || selectedCobranca.cliente_id} protestada no cartorio ${protestoData.nome_cartorio}. Valor: ${formatCurrency(selectedCobranca.valor_atualizado)}`
      });

      fetchDados();
    } catch (err: any) {
      console.error('Erro ao registrar protesto:', err);
      toast.error(err?.message || 'Erro ao registrar protesto e agrupar divida.');
    } finally {
      setIsSubmittingAcao(false);
    }
  };

  // Fix #6: Protesto em lote
  const handleProtestoLote = async () => {
    toast.error('Protesto em lote não está disponível. Utilize a opção individual em cada devedor.');
  };

  const confirmarGerarAcordo = async () => {
    if (!selectedCobranca || !acordoData.parcelas || !acordoData.dtPrimeiroVenc || submittingAcordo) return;

    if (acordoData.desconto < 0) {
      toast.error('O desconto não pode ser negativo');
      return;
    }

    const valorDesconto = acordoData.tipo_desconto === 'porcentagem'
      ? (selectedCobranca.valor_atualizado * (acordoData.desconto / 100))
      : (acordoData.desconto || 0);

    if (valorDesconto > selectedCobranca.valor_atualizado) {
      toast.error('O desconto não pode ser maior que o valor total da fatura');
      return;
    }

    setSubmittingAcordo(true);
    try {
      const valorBase = selectedCobranca.valor_atualizado - valorDesconto;
      const valorParcela = Math.round((valorBase / acordoData.parcelas) * 100) / 100;
      const session = getAdminSessionForRpc();

      const { data, error } = await supabase.rpc('gsa_admin_gerar_acordo_cobranca', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cobranca_id: selectedCobranca.id,
        p_parcelas: acordoData.parcelas,
        p_dt_primeiro_venc: acordoData.dtPrimeiroVenc,
        p_desconto: acordoData.desconto || 0,
        p_tipo_desconto: acordoData.tipo_desconto,
        p_observacoes: acordoData.observacoes || null
      });

      if (error) throw error;

      await notificationService.notifyClient(
        selectedCobranca.cliente_id,
        'Novo Acordo de Parcelamento',
        `Um acordo de ${acordoData.parcelas}x foi gerado para sua divida. Confira as faturas no seu painel financeiro.`,
        'financeiro',
        'cobranca_acordo',
        { itemId: selectedCobranca.fatura_id || selectedCobranca.id, tab: 'faturas', prioridade: 'alta' }
      );

      toast.success(data?.already_processed ? 'Acordo ja estava gerado.' : 'Acordo gerado com sucesso!');
      setIsAcordoModalOpen(false);
      setIsHistoricoModalOpen(false);
      setSelectedCobranca(null);

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'GERAR_ACORDO_COBRANCA',
        detalhes: `Acordo gerado para ${selectedCobranca.clientes?.nome || selectedCobranca.cliente_id}: ${acordoData.parcelas}x de ${formatCurrency(valorParcela)} (base: ${formatCurrency(valorBase)})`
      });

      fetchDados();
    } catch (err: any) {
      console.error('Erro ao gerar acordo:', err);
      toast.error(err?.message || 'Erro ao gerar acordo.');
    } finally {
      setSubmittingAcordo(false);
    }
  };

  const handleCancelarAcordo = async (c: any) => {
    const ok = await confirmHook.confirm({
      title: 'Cancelar Acordo?',
      message: 'As faturas das parcelas pendentes serão canceladas e a dívida original será reativada. Esta ação não pode ser desfeita.',
      confirmLabel: 'Sim, cancelar acordo',
      cancelLabel: 'Manter acordo',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const session = getAdminSessionForRpc();
      const faturaDescricaoOriginal = c.faturas?.codigo_fatura || c.fatura_id?.substring(0, 8) || '';
      const { error } = await supabase.rpc('gsa_admin_cancelar_acordo_cobranca', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cobranca_id: c.id
      });

      if (error) throw error;

      toast.success('Acordo cancelado e divida original reativada.');

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'CANCELAR_ACORDO_COBRANCA',
        detalhes: `Acordo do cliente ${c.clientes?.nome || c.cliente_id} (Ref: ${faturaDescricaoOriginal}) cancelado manualmente.`
      });

      fetchDados();
    } catch (err: any) {
      console.error('Erro ao cancelar acordo:', err);
      toast.error(err?.message || 'Erro ao cancelar acordo.');
    }
  };

  const handleExcluirAcordo = async (c: any) => {
    const canProceed = await canDeleteRecord('cobrancas', c.id);
    if (!canProceed) return;

    const ok = await confirmHook.confirm({
      title: 'Excluir Registro de Cobrança?',
      message: 'ATENÇÃO: A exclusão removerá o registro de cobrança e cancelará o acordo. A dívida original NÃO será reativada automaticamente. Deseja continuar?',
      confirmLabel: 'Sim, excluir definitivamente',
      cancelLabel: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const session = getAdminSessionForRpc();
      const faturaDescricaoOriginal = c.faturas?.codigo_fatura || c.fatura_id?.substring(0, 8) || '';
      const { error } = await supabase.rpc('gsa_admin_excluir_cobranca', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cobranca_id: c.id
      });

      if (error) throw error;

      toast.success('Registro de cobranca excluido.');

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'EXCLUIR_COBRANCA',
        detalhes: `Registro de cobranca/acordo de ${c.clientes?.nome || c.cliente_id} removido permanentemente. Ref: ${faturaDescricaoOriginal}`
      });

      fetchDados();
    } catch (err: any) {
      console.error('Erro ao excluir registro:', err);
      toast.error(err?.message || 'Erro ao excluir registro.');
    }
  };

  const salvarHistoricoManual = async () => {
    if (!selectedCobranca || !novoHistorico.descricao || isSubmittingAcao) return;
    setIsSubmittingAcao(true);
    try {
      const session = getAdminSessionForRpc();
      const { error } = await supabase.rpc('gsa_admin_registrar_cobranca_historico', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cobranca_id: selectedCobranca.id,
        p_tipo_acao: novoHistorico.tipo,
        p_descricao: novoHistorico.descricao,
        p_canal: 'manual',
        p_promessa_pagamento: novoHistorico.promessa_pagamento,
        p_data_promessa: novoHistorico.promessa_pagamento ? novoHistorico.data_promessa : null,
        p_valor_envolvido: null,
        p_atualizar_ultimo_contato: false
      });

      if (error) throw error;

      if (novoHistorico.promessa_pagamento) {
        await notificationService.notifyClient(
          selectedCobranca.cliente_id,
          'Promessa de Pagamento Registrada',
          `Registramos sua promessa de pagamento para o dia ${formatDate(novoHistorico.data_promessa)}. Agradecemos o contato.`,
          'financeiro',
          'cobranca_promessa',
          { itemId: selectedCobranca.fatura_id || selectedCobranca.id, tab: 'faturas' }
        );
      }

      toast.success('Historico registrado!');
      setNovoHistorico({ tipo: 'contato_telefonico', descricao: '', promessa_pagamento: false, data_promessa: '' });

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'REGISTRAR_HISTORICO_MANUAL_COBRANCA',
        detalhes: `Log manual registrado para cobranca ${selectedCobranca.id.slice(0, 8)} - Tipo: ${novoHistorico.tipo}`
      });

      fetchDados();
      try {
        const { data, error } = await supabase.from('cobrancas').select('*, cobranca_historico(*)').eq('id', selectedCobranca.id).single();
        if (error) throw error;
        if (data) setSelectedCobranca((prev: any) => ({ ...prev, cobranca_historico: data.cobranca_historico }));
      } catch (err: any) {
        toast.error('Erro ao atualizar histórico da cobrança.');
      }
    } catch (err: any) {
      console.error('Erro ao registrar historico:', err);
      toast.error(err?.message || 'Erro ao registrar historico.');
    } finally {
      setIsSubmittingAcao(false);
    }
  };

  const abrirBaixaParcela = (parcela: any) => {
    setParcelaSelecionada(parcela);
    setBaixaData({ data_pagamento: new Date().toISOString().split('T')[0], forma_pagamento: 'pix' });
    setIsBaixaParcelaOpen(true);
  };

  const confirmarBaixaParcela = async () => {
    if (!parcelaSelecionada || parcelaLoading || isSubmittingAcao) return;
    setParcelaLoading(parcelaSelecionada.id);
    setIsSubmittingAcao(true);
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_baixar_parcela_cobranca', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_parcela_id: parcelaSelecionada.id,
        p_data_pagamento: baixaData.data_pagamento,
        p_forma_pagamento: baixaData.forma_pagamento
      });

      if (error) throw error;

      await notificationService.notifyClient(
        selectedCobranca.cliente_id,
        'Pagamento de Parcela Confirmado',
        `Confirmamos o recebimento da parcela ${parcelaSelecionada.numero_parcela} via ${baixaData.forma_pagamento.toUpperCase()}.`,
        'financeiro',
        'cobranca_pagamento',
        { itemId: data?.fatura_id || selectedCobranca.fatura_id || selectedCobranca.id, tab: 'faturas' }
      );

      toast.success(data?.already_processed ? 'Parcela ja estava baixada.' : 'Parcela baixada com sucesso!');
      setIsBaixaParcelaOpen(false);
      setParcelaSelecionada(null);

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'BAIXA_PARCELA_COBRANCA',
        detalhes: `Parcela ${parcelaSelecionada.numero_parcela} da cobranca ${data?.cobranca_id?.slice?.(0, 8) || '?'} baixada. Valor: ${formatCurrency(parcelaSelecionada.valor_parcela)}`
      });

      fetchDados();
    } catch (err: any) {
      console.error('Erro ao baixar parcela:', err);
      toast.error(err?.message || 'Erro ao baixar parcela.');
    } finally {
      setParcelaLoading(null);
      setIsSubmittingAcao(false);
    }
  };

  const confirmarBaixaManualCobranca = async () => {
    if (!selectedCobranca || isSubmittingAcao) return;
    setIsSubmittingAcao(true);
    try {
      const session = getAdminSessionForRpc();
      const { data, error } = await supabase.rpc('gsa_admin_baixar_cobranca_manual', {
        p_sessao_id: session.sessaoId,
        p_session_token: session.sessionToken,
        p_cobranca_id: selectedCobranca.id,
        p_valor_pago: baixaCobrancaData.valor_pago,
        p_data_pagamento: baixaCobrancaData.data_pagamento,
        p_forma_pagamento: baixaCobrancaData.forma_pagamento
      });

      if (error) throw error;

      await notificationService.notifyClient(
        selectedCobranca.cliente_id,
        'Divida Quitada com Sucesso',
        `A baixa do seu titulo (Ref: ${selectedCobranca.faturas?.codigo_fatura || 'Divida'}) foi realizada com sucesso. Obrigado!`,
        'financeiro',
        'cobranca_quitacao',
        { itemId: selectedCobranca.fatura_id || selectedCobranca.id, tab: 'faturas', prioridade: 'alta' }
      );

      toast.success(data?.already_processed ? 'Cobranca ja estava quitada.' : 'Baixa manual concluida e cliente notificado!');
      setIsBaixaCobrancaOpen(false);
      setIsHistoricoModalOpen(false);

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'BAIXA_MANUAL_COBRANCA',
        detalhes: `Baixa manual da cobranca ${selectedCobranca.id.slice(0, 8)} (${selectedCobranca.clientes?.nome || 'cliente'}). Valor pago: ${formatCurrency(baixaCobrancaData.valor_pago)} via ${baixaCobrancaData.forma_pagamento.toUpperCase()}`
      });

      fetchDados();
    } catch (err: any) {
      console.error('Erro ao registrar baixa manual:', err);
      toast.error(err?.message || 'Erro ao registrar baixa manual.');
    }
  };

  // --- Render Functions ---
  // Fix #8: Dashboard completo com gráfico
  const renderDashboard = () => (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-rose-100 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Total em Atraso</p>
            <p className="text-xl font-black text-rose-600">{formatCurrency(kpis.totalPendente)}</p>
          </div>
          <div className="h-10 w-10 bg-rose-50 rounded-xl flex items-center justify-center">
            <TrendingDown className="h-5 w-5 text-rose-500" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-emerald-100 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Recuperado</p>
            <p className="text-xl font-black text-emerald-600">{formatCurrency(kpis.totalRecuperado)}</p>
          </div>
          <div className="h-10 w-10 bg-emerald-50 rounded-xl flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-indigo-100 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Taxa Recuperação</p>
            <p className="text-xl font-black text-indigo-600">{kpis.taxaRecuperacao.toFixed(1)}%</p>
          </div>
          <div className="h-10 w-10 bg-indigo-50 rounded-xl flex items-center justify-center">
            <Target className="h-5 w-5 text-indigo-500" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-amber-100 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">Devedores Ativos</p>
            <p className="text-xl font-black text-amber-600">{kpis.qtdEmAtraso}</p>
          </div>
          <div className="h-10 w-10 bg-amber-50 rounded-xl flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </div>
        </div>
        <button onClick={() => setActiveTab('fila')} className="bg-white p-5 rounded-3xl shadow-sm border border-blue-100 flex items-center justify-between text-left transition-all hover:-translate-y-0.5 hover:shadow-lg">
          <div>
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Cobrar Hoje</p>
            <p className="text-xl font-black text-blue-600">{kpis.cobrancasHoje}</p>
          </div>
          <div className="h-10 w-10 bg-blue-50 rounded-xl flex items-center justify-center">
            <Clock className="h-5 w-5 text-blue-500" />
          </div>
        </button>
        <button onClick={() => setActiveTab('acordos')} className="bg-white p-5 rounded-3xl shadow-sm border border-violet-100 flex items-center justify-between text-left transition-all hover:-translate-y-0.5 hover:shadow-lg">
          <div>
            <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-1">Acordos 7 dias</p>
            <p className="text-xl font-black text-violet-600">{kpis.acordosVencendo}</p>
          </div>
          <div className="h-10 w-10 bg-violet-50 rounded-xl flex items-center justify-center">
            <Briefcase className="h-5 w-5 text-violet-500" />
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Risco */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-neutral-100">
          <h3 className="font-black text-neutral-800 uppercase tracking-wider mb-4 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-rose-500"/> Maior Risco de Crédito (Top 5)
          </h3>
          <div className="space-y-3">
            {cobrancas.filter(c => ['pendente', 'em_cobranca', 'acordo_quebrado'].includes(c.status)).slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-2xl bg-neutral-50 ring-1 ring-neutral-200">
                <div>
                  <p className="font-bold text-sm text-neutral-800">{c.clientes?.nome}</p>
                  <p className="text-[10px] text-neutral-500 font-bold">{c.dias_atraso} dias de atraso · Score: {c.score_risco}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-rose-600">{formatCurrency(c.valor_atualizado)}</p>
                  <button onClick={() => { setSelectedCobranca(c); setIsHistoricoModalOpen(true); }} className="text-[10px] text-indigo-600 font-black uppercase tracking-wider underline">Ver Detalhes</button>
                </div>
              </div>
            ))}
            {cobrancas.filter(c => ['pendente', 'em_cobranca', 'acordo_quebrado'].includes(c.status)).length === 0 && (
              <div className="p-6 text-center text-neutral-400 text-sm font-bold">Nenhum devedor ativo.</div>
            )}
          </div>
        </div>

        {/* Fix #8: Gráfico de distribuição por status */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-neutral-100">
          <h3 className="font-black text-neutral-800 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-500"/> Distribuição por Status
          </h3>
          {statusDistribution.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {statusDistribution.map(s => (
                  <div key={s.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }}></div>
                    <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">{s.name}</span>
                    <span className="ml-auto text-xs font-black text-neutral-800">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-10 text-center text-neutral-400 text-sm font-bold">Sem dados para exibir.</div>
          )}
        </div>
      </div>
    </div>
  );

  // Fix #4 e #9: Filtrar fila + busca + empty state
  const cobrancasFila = cobrancas
    .filter(c => ['pendente', 'em_cobranca'].includes(c.status))
    .filter(c => {
      if (!searchFila) return true;
      const term = searchFila.toLowerCase();
      return c.clientes?.nome?.toLowerCase().includes(term) ||
             c.faturas?.codigo_fatura?.toLowerCase().includes(term);
    });

  const renderFila = () => (
    <div className="space-y-4">
      {/* Busca */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input 
            type="text" 
            placeholder="Buscar por cliente ou fatura..." 
            value={searchFila}
            onChange={e => setSearchFila(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-neutral-200 rounded-2xl text-sm font-medium text-neutral-800 outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>
        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{cobrancasFila.length} pendências</span>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-neutral-100 p-2 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-neutral-100">
              <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-6">Devedor</th>
              <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Fatura Origin.</th>
              <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Valor c/ Encargos</th>
              <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Score Risco</th>
              <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Status</th>
              <th className="p-4 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest pr-6">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {cobrancasFila.map(c => (
              <tr key={c.id} className="hover:bg-neutral-50/50">
                <td className="p-4 pl-6">
                  <p className="text-xs font-black text-neutral-800">{c.clientes?.nome}</p>
                  <p className="text-[10px] font-bold text-neutral-400">{c.clientes?.telefone ? maskPhone(c.clientes.telefone) : 'Sem número'}</p>
                </td>
                <td className="p-4">
                  <p className="text-xs text-neutral-600 font-bold">#{c.faturas?.codigo_fatura}</p>
                  <p className="text-[10px] text-rose-500 font-bold">{c.dias_atraso} dias</p>
                </td>
                <td className="p-4 font-black text-rose-600">{formatCurrency(c.valor_atualizado)}</td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 bg-neutral-200 rounded-full overflow-hidden">
                      <div className={`h-full ${c.score_risco > 75 ? 'bg-red-500' : c.score_risco > 40 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${c.score_risco}%` }}></div>
                    </div>
                    <span className="text-[10px] font-black text-neutral-600">{c.score_risco}/100</span>
                  </div>
                </td>
                <td className="p-4">
                  <span className="px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-700">
                    {c.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="p-4 text-right pr-6 space-x-2">
                  <button 
                    onClick={() => handleEnviarWhatsAppDireto(c)} 
                    disabled={sendingId === c.id} 
                    className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-all" 
                    title="Cobrar WhatsApp (Envio Instantâneo)"
                  >
                    {sendingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                  </button>
                  <button onClick={() => { setSelectedCobranca(c); setIsHistoricoModalOpen(true); }} className="p-1.5 bg-neutral-100 text-neutral-600 rounded-lg hover:bg-neutral-200" title="Ver Detalhes">
                    <History className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {cobrancasFila.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-neutral-400 text-sm font-bold">
                  {searchFila ? 'Nenhum resultado para essa busca.' : 'Nenhuma cobrança pendente na fila. 🎉'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderAcordos = () => (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-indigo-100 flex items-center gap-4">
        <div className="h-12 w-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
          <Briefcase className="h-6 w-6 text-indigo-500" />
        </div>
        <div>
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Acordos Vigentes</p>
          <p className="text-xl font-black text-indigo-600">{kpis.qtdAcordos} contratos renegociados</p>
        </div>
      </div>
      <div className="bg-white rounded-3xl shadow-sm border border-neutral-100 p-2 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-neutral-100">
              <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-6">Cliente</th>
              <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Valor do Acordo</th>
              <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Status Acordo</th>
              <th className="p-4 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest pr-6">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {cobrancas.filter(c => ['acordo', 'acordo_quebrado'].includes(c.status)).map(c => (
              <React.Fragment key={c.id}>
                <tr className="hover:bg-neutral-50/50">
                  <td className="p-4 pl-6">
                    <p className="text-xs font-black text-neutral-800">{c.clientes?.nome}</p>
                    <p className="text-[10px] font-bold text-neutral-400">Score de Risco: {c.score_risco}</p>
                  </td>
                  <td className="p-4 font-black text-indigo-600">{formatCurrency(c.valor_atualizado)}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${
                      c.status === 'acordo' ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {c.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4 text-right pr-6">
                    <button onClick={() => { setSelectedCobranca(c); setIsHistoricoModalOpen(true); }} className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black">
                      Detalhes
                    </button>
                  </td>
                </tr>
                {c.cobranca_acordo_parcelas && c.cobranca_acordo_parcelas.length > 0 && (
                  <tr className="bg-neutral-50/50">
                    <td colSpan={4} className="p-4 pl-6">
                      <div className="space-y-2 border-l-2 border-indigo-200 pl-4 py-2">
                        {c.cobranca_acordo_parcelas.sort((a: any, b: any) => a.numero_parcela - b.numero_parcela).map((p: any) => (
                          <div key={p.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-neutral-100 shadow-sm">
                             <div>
                               <p className="text-[10px] font-black uppercase text-neutral-500">Parcela {p.numero_parcela} <span className="ml-2 text-neutral-400">Venc: {formatDate(p.data_vencimento)}</span></p>
                               <p className="font-bold text-neutral-800">{formatCurrency(p.valor_parcela)}</p>
                             </div>
                             <div>
                               {p.status === 'pago' ? (
                                  <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Pago</span>
                                    <button onClick={() => abrirBaixaParcela(p)} className="px-3 py-1 bg-neutral-100 text-neutral-600 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-neutral-200">Detalhes</button>
                                  </div>
                               ) : (
                                  <button onClick={() => abrirBaixaParcela(p)} disabled={parcelaLoading === p.id} className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 border border-emerald-200 flex items-center gap-1 disabled:opacity-50">
                                    {parcelaLoading === p.id ? <Activity className="h-3 w-3 animate-spin"/> : <Banknote className="h-3 w-3"/>}
                                    Dar Baixa
                                  </button>
                               )}
                             </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {cobrancas.filter(c => ['acordo', 'acordo_quebrado'].includes(c.status)).length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-neutral-400 text-sm font-bold">Nenhum acordo ativo no momento.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Fix #5 e #6: Botões protestar corrigidos
  const renderCartorio = () => (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-3xl shadow-sm border border-neutral-200 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-neutral-100 rounded-2xl flex items-center justify-center">
            <Scale className="h-6 w-6 text-neutral-700" />
          </div>
          <div>
            <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest mb-1">Ações Jurídicas e Protestos</p>
            <p className="text-xl font-black text-neutral-800">{kpis.qtdCartorio} clientes nesta fase</p>
          </div>
        </div>
        <button 
          onClick={handleProtestoLote} 
          title="Indisponível: utilize a opção individual em cada devedor"
          disabled
          className="px-6 py-3 bg-neutral-400 text-white rounded-xl text-[10px] font-black uppercase tracking-widest cursor-not-allowed opacity-60"
        >
          Protesto em Lote (Indisponível)
        </button>
      </div>
      <div className="bg-white rounded-3xl shadow-sm border border-neutral-100 p-2 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-neutral-100">
              <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-6">Cliente</th>
              <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Atraso</th>
              <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Valor da Dívida</th>
              <th className="p-4 text-[10px] font-black text-neutral-400 uppercase tracking-widest">Status</th>
              <th className="p-4 text-right text-[10px] font-black text-neutral-400 uppercase tracking-widest pr-6">Ações Jurídicas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-50">
            {cobrancas.filter(c => c.status === 'cartorio' || c.status === 'protestado' || c.nivel_cobranca >= 3).map(c => (
              <tr key={c.id} className="hover:bg-neutral-50/50">
                <td className="p-4 pl-6">
                  <p className="text-xs font-black text-neutral-800">{c.clientes?.nome}</p>
                </td>
                <td className="p-4 text-xs font-bold text-rose-500">{c.dias_atraso} dias</td>
                <td className="p-4 font-black text-neutral-900">{formatCurrency(c.valor_atualizado)}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${
                    c.status === 'protestado' ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700'
                  }`}>
                    {c.status === 'protestado' ? 'Protestado' : 'Aguardando'}
                  </span>
                </td>
                <td className="p-4 text-right pr-6 space-x-2">
                  <button onClick={() => { setSelectedCobranca(c); setIsHistoricoModalOpen(true); }} className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-neutral-200">
                    Dossiê
                  </button>
                  {/* Fix #5: Passa c diretamente em vez de depender de selectedCobranca */}
                  {c.status !== 'protestado' && (
                    <button onClick={() => { setSelectedCobranca(c); setProtestoData({ data_protesto: new Date().toISOString().split('T')[0], nome_cartorio: '' }); setIsProtestoModalOpen(true); }} className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 border border-rose-200">
                      Protestar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {cobrancas.filter(c => c.status === 'cartorio' || c.status === 'protestado' || c.nivel_cobranca >= 3).length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-neutral-400 text-sm font-bold">Nenhum cliente em nível de cartório ou ação judicial.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderHistorico = () => (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
      <div className="bg-white rounded-3xl shadow-sm border border-neutral-100 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Auditoria da esteira</p>
            <h3 className="text-lg font-black text-neutral-900">Histórico de contatos e ações</h3>
          </div>
          <span className="rounded-full bg-neutral-100 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">
            {historicoGeral.length} registros recentes
          </span>
        </div>

        <div className="space-y-3">
          {historicoGeral.map((h: any) => (
            <button
              key={h.id}
              type="button"
              onClick={() => { setSelectedCobranca(h.cobranca); setIsHistoricoModalOpen(true); }}
              className="w-full rounded-2xl border border-neutral-100 bg-neutral-50 p-4 text-left transition-all hover:border-indigo-200 hover:bg-white hover:shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-neutral-500 shadow-sm">
                  {h.tipo_acao === 'contato_whatsapp' ? <MessageCircle className="h-4 w-4 text-green-500" /> :
                   h.tipo_acao === 'acordo' ? <Briefcase className="h-4 w-4 text-indigo-500" /> :
                   h.tipo_acao === 'protesto' ? <Scale className="h-4 w-4 text-rose-500" /> :
                   <History className="h-4 w-4 text-neutral-500" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-black text-neutral-900">{h.cobranca?.clientes?.nome || 'Cliente'}</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-indigo-500">
                      {h.tipo_acao?.replace(/_/g, ' ') || 'acao'}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs font-medium text-neutral-600">{h.descricao}</p>
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    {formatDateTime(h.created_at)}
                  </p>
                </div>
              </div>
            </button>
          ))}

          {historicoGeral.length === 0 && (
            <div className="rounded-3xl border border-dashed border-neutral-200 p-12 text-center">
              <History className="mx-auto mb-3 h-10 w-10 text-neutral-200" />
              <p className="text-sm font-bold text-neutral-400">Nenhum contato registrado ainda.</p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-3xl border border-neutral-100 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Fluxo recomendado</p>
          <div className="mt-4 space-y-3">
            {[
              'Priorizar devedores na Fila',
              'Registrar contato ou promessa',
              'Gerar acordo quando houver negociação',
              'Mover para protesto somente em risco alto',
            ].map((step, index) => (
              <div key={step} className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-black text-white">{index + 1}</span>
                <span className="text-xs font-bold text-neutral-700">{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const saveConfigs = async () => {
    setSavingConfigs(true);
    try {
      const cobrancaKeys = ['cobranca_multa_porcentagem', 'cobranca_juros_mensal', 'cobranca_juros_tipo', 'cobranca_wp_template'];
      const settings = cobrancaKeys
        .filter((key) => editingConfigs[key] !== undefined)
        .map((key) => ({ key, value: String(editingConfigs[key]) }));
      if (settings.length > 0) {
        await callAdminRpc<boolean>('gsa_admin_upsert_settings', { p_settings: settings });
      }
      setConfigs(editingConfigs);
      toast.success('Configurações atualizadas!');

      // Log Action
      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'ATUALIZAR_CONFIGS_COBRANCA',
        detalhes: `Configurações da estéira de cobrança atualizadas.`
      });
    } catch (err) {
      toast.error('Erro ao atualizar configurações.');
    } finally {
      setSavingConfigs(false);
    }
  };

  const renderConfiguracoes = () => (
    <div className="bg-white rounded-3xl shadow-sm border border-neutral-100 p-8 max-w-3xl">
      <h3 className="text-sm font-black text-neutral-800 uppercase tracking-widest mb-6 flex items-center gap-2">
        <Settings className="h-5 w-5 text-neutral-400" /> Réguas e Ajustes
      </h3>
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Multa Pós-Vencimento (%)</label>
            <input  
              type="number" 
              value={editingConfigs.cobranca_multa_porcentagem || ''}
              inputMode="numeric"
onChange={(e) => setEditingConfigs({...editingConfigs, cobranca_multa_porcentagem: e.target.value})}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-sm font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-indigo-500" 
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Juros Mensal (%)</label>
            <input  
              type="number" 
              value={editingConfigs.cobranca_juros_mensal || ''}
              inputMode="numeric"
onChange={(e) => setEditingConfigs({...editingConfigs, cobranca_juros_mensal: e.target.value})}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-sm font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-indigo-500" 
            />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Tipo de Aplicação de Juros</label>
          <select 
            value={editingConfigs.cobranca_juros_tipo || 'diario'}
            onChange={e => setEditingConfigs({...editingConfigs, cobranca_juros_tipo: e.target.value})}
            className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-sm font-bold text-neutral-800 outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="diario">Diariamente (Pró-rata / Juros de mora ao dia)</option>
            <option value="mensal">Mensalmente (Somente a cada ciclo de 30 dias)</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Template WhatsApp (Gatilho Fila de Cobrança)</label>
          <p className="text-[10px] text-neutral-400 mb-2 font-medium">Use as tags: <span className="font-bold text-indigo-500">{"{nome_cliente}"}</span>, <span className="font-bold text-indigo-500">{"{numero_fatura}"}</span>, <span className="font-bold text-indigo-500">{"{valor_atualizado}"}</span>, <span className="font-bold text-indigo-500">{"{dias_atraso}"}</span></p>
          <textarea 
            rows={12}
            value={
              editingConfigs.cobranca_wp_template?.trim().startsWith("Olá {nome_cliente}, notamos que a sua fatura") 
                ? [
                    `⚠️ *AVISO DE COBRANÇA - PENDÊNCIA FINANCEIRA* ⚠️`,
                    ``,
                    `Olá, *{nome_cliente}*! 👋`,
                    ``,
                    `Identificamos uma pendência financeira em aberto no sistema *GSA HUB* referente à sua fatura. 📄`,
                    ``,
                    `📋 *DETALHES DA PENDÊNCIA:*`,
                    `🧾 *Fatura:* #{numero_fatura}`,
                    `⏰ *Dias em Atraso:* {dias_atraso} dias`,
                    `💸 *Valor Atualizado (c/ encargos):* *{valor_atualizado}*`,
                    ``,
                    `💬 Como podemos auxiliar com a quitação desta pendência?`,
                    `Estamos à disposição para negociar as melhores condições de pagamento para você de forma rápida e segura! 🤝`,
                    ``,
                    `▶️ *COMO RESOLVER AGORA MESMO:*`,
                    `Responda esta mensagem com a opção desejada para autoatendimento:`,
                    ``,
                    `1️⃣ Solicitar 2ª via da Fatura / Boleto`,
                    `2️⃣ Gerar código PIX para pagamento`,
                    `3️⃣ Negociar dívida`,
                    ``,
                    `_Mensagem enviada via GSA HUB._`
                  ].join('\n')
                : editingConfigs.cobranca_wp_template || ''
            }
            onChange={e => setEditingConfigs({...editingConfigs, cobranca_wp_template: e.target.value})}
            className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-sm font-medium text-neutral-800 outline-none focus:ring-2 focus:ring-green-500 resize-none" 
          />
        </div>
        <div className="pt-4 border-t border-neutral-100 flex justify-end">
          <button onClick={saveConfigs} disabled={savingConfigs} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
            {savingConfigs ? <Activity className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Salvar Regras da Esteira
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="bg-[#1a1a1a] p-4 rounded-[2rem] text-white relative shadow-2xl mb-3 overflow-hidden">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-1/4 w-60 h-60 bg-violet-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-4">
              <div className="h-8 w-1.5 bg-rose-500 rounded-full shadow-[0_0_20px_rgba(244,63,94,0.6)]"></div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400">
                Central de Cobrança
              </h1>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={openGerarCobrancaModal}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-rose-500/20 transition-all hover:bg-rose-600"
              >
                <FileText className="h-3.5 w-3.5" />
                Gerar Cobranca
              </button>
              <Gavel className="hidden h-8 w-8 text-white/10 md:block" />
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'dashboard', label: 'Painel', icon: Activity },
              { id: 'fila', label: 'Fila de Cobrança', icon: User },
              { id: 'acordos', label: 'Acordos', icon: Briefcase },
              { id: 'cartorio', label: 'Protestos', icon: Scale },
              { id: 'historico', label: 'Historico', icon: History },
              { id: 'configuracoes', label: 'Configurações', icon: Settings },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeTab === t.id 
                    ? 'bg-white text-rose-600 shadow-xl' 
                    : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex py-20 justify-center text-neutral-400"><Activity className="h-8 w-8 animate-spin" /></div>
      ) : (
        <div className="animate-in fade-in">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'fila' && renderFila()}
          {activeTab === 'acordos' && renderAcordos()}
          {activeTab === 'cartorio' && renderCartorio()}
          {activeTab === 'historico' && renderHistorico()}
          {activeTab === 'configuracoes' && renderConfiguracoes()}
        </div>
      )}

      {/* --- Modals --- */}
      <Modal isOpen={isGerarCobrancaOpen} onClose={() => setIsGerarCobrancaOpen(false)} title="Gerar Cobrança" size="wide">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-neutral-50 p-4 ring-1 ring-neutral-100">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">Faturas vencidas sem cobrança</p>
              <p className="text-sm font-bold text-neutral-600">
                Selecione as faturas desejadas ou gere a cobrança em lote para todas as pendentes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={fetchFaturasElegiveisCobranca}
                disabled={loadingFaturasElegiveis || batchProcessing}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-neutral-700 shadow-sm ring-1 ring-neutral-200 transition-all hover:ring-rose-200 hover:text-rose-600 disabled:opacity-50"
              >
                <Activity className={`h-4 w-4 ${loadingFaturasElegiveis ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
              {faturasElegiveis.length > 0 && (
                <button
                  type="button"
                  onClick={handleGerarCobrancasEmLote}
                  disabled={batchProcessing || loadingFaturasElegiveis}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-rose-600 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-rose-500/25 transition-all hover:from-rose-600 hover:to-rose-700 disabled:opacity-50"
                >
                  <Layers className={`h-4 w-4 ${batchProcessing ? 'animate-spin' : ''}`} />
                  {batchProcessing
                    ? 'Gerando...'
                    : selectedFaturaIds.length > 0
                    ? `Gerar (${selectedFaturaIds.length}) em Lote`
                    : `Gerar Todas em Lote (${faturasElegiveis.length})`}
                </button>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-neutral-100 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="w-10 px-4 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={faturasElegiveis.length > 0 && selectedFaturaIds.length === faturasElegiveis.length}
                        onChange={toggleSelectAllFaturas}
                        disabled={batchProcessing || loadingFaturasElegiveis || faturasElegiveis.length === 0}
                        className="h-4 w-4 rounded border-neutral-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                        title="Selecionar / Deselecionar todas"
                      />
                    </th>
                    {['Fatura', 'Cliente', 'Vencimento', 'Valor', 'Ação'].map(h => (
                      <th key={h} className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {loadingFaturasElegiveis ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center">
                        <Activity className="mx-auto h-7 w-7 animate-spin text-neutral-300" />
                      </td>
                    </tr>
                  ) : faturasElegiveis.length > 0 ? (
                    faturasElegiveis.map((fatura: any) => {
                      const isSelected = selectedFaturaIds.includes(fatura.id);
                      return (
                        <tr key={fatura.id} className={`transition-colors hover:bg-neutral-50/60 ${isSelected ? 'bg-rose-50/40' : ''}`}>
                          <td className="px-4 py-4 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectFatura(fatura.id)}
                              disabled={batchProcessing}
                              className="h-4 w-4 rounded border-neutral-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-5 py-4">
                            <p className="font-mono text-xs font-black text-indigo-600">#{fatura.codigo_fatura || fatura.id.slice(0, 8)}</p>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{fatura.status}</p>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm font-black text-neutral-900">{fatura.clientes?.nome || 'Cliente não informado'}</p>
                            <p className="text-[10px] font-bold text-neutral-400">{fatura.clientes?.telefone ? maskPhone(fatura.clientes.telefone) : fatura.clientes?.email || 'Sem contato'}</p>
                          </td>
                          <td className="px-5 py-4 text-xs font-bold text-rose-500">{formatDate(fatura.data_vencimento)}</td>
                          <td className="px-5 py-4 text-sm font-black text-neutral-900">{formatCurrency(fatura.valor_final_pendente || fatura.valor_total || 0)}</td>
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={() => handleGerarCobrancaFatura(fatura)}
                              disabled={batchProcessing}
                              className="rounded-2xl bg-rose-500 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-rose-500/20 transition-all hover:bg-rose-600 disabled:opacity-50"
                            >
                              Gerar Cobrança
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-14 text-center">
                        <FileText className="mx-auto mb-3 h-10 w-10 text-neutral-200" />
                        <p className="text-sm font-bold text-neutral-400">Nenhuma fatura vencida sem cobrança encontrada.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isWpModalOpen} onClose={() => setIsWpModalOpen(false)} title="Enviar Notificação de Cobrança" size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">Prévia da Mensagem (WhatsApp)</p>
            <span className="text-[10px] font-bold text-neutral-400">Disparo Instantâneo</span>
          </div>
          <textarea
            value={wpMessage}
            onChange={(e) => setWpMessage(e.target.value)}
            className="w-full h-56 rounded-2xl bg-neutral-50 border border-neutral-200 p-4 font-medium text-xs text-neutral-800 focus:ring-2 focus:ring-green-500 outline-none resize-none"
          />
          <button 
            onClick={() => selectedCobranca && handleEnviarWhatsAppDireto(selectedCobranca)} 
            disabled={sendingId === selectedCobranca?.id} 
            className="w-full bg-green-500 hover:bg-green-600 py-4 rounded-xl text-white font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-green-500/20"
          >
            {sendingId === selectedCobranca?.id ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Enviando Notificação...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> Enviar Notificação para o Cliente
              </>
            )}
          </button>
        </div>
      </Modal>

      <Modal isOpen={isHistoricoModalOpen} onClose={() => { setIsHistoricoModalOpen(false); setSelectedCobranca(null); }} title="Detalhes da Cobrança" size="wide">
        {selectedCobranca && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-neutral-50 p-4 rounded-2xl ring-1 ring-neutral-200">
                <p className="text-[10px] text-neutral-400 uppercase font-black">Cliente</p>
                <p className="font-bold text-neutral-800">{selectedCobranca.clientes?.nome}</p>
                <p className="text-xs text-neutral-500">{maskCPF(selectedCobranca.clientes?.cpf || '') || maskCNPJ(selectedCobranca.clientes?.cnpj || '')}</p>
              </div>
              <div className="bg-rose-50 p-4 rounded-2xl ring-1 ring-rose-200">
                <p className="text-[10px] text-rose-400 uppercase font-black">Valor Atualizado</p>
                <p className="text-xl font-black text-rose-600">{formatCurrency(selectedCobranca.valor_atualizado)}</p>
                <p className="text-[10px] font-bold text-rose-500">{selectedCobranca.dias_atraso} dias de atraso</p>
              </div>
              <div className="bg-amber-50 p-4 rounded-2xl ring-1 ring-amber-200">
                <p className="text-[10px] text-amber-400 uppercase font-black">Multa</p>
                <p className="font-black text-amber-600">{formatCurrency(selectedCobranca.valor_multa)}</p>
              </div>
              <div className="bg-orange-50 p-4 rounded-2xl ring-1 ring-orange-200">
                <p className="text-[10px] text-orange-400 uppercase font-black">Juros</p>
                <p className="font-black text-orange-600">{formatCurrency(selectedCobranca.valor_juros)}</p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-3 pt-4 border-t border-neutral-100">
              <AdminWhatsAppButton 
                telefone={selectedCobranca.clientes?.telefone}
                mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                  tipo: 'cobranca',
                  clienteNome: selectedCobranca.clientes?.nome,
                  codigo: selectedCobranca.faturas?.codigo_fatura || selectedCobranca.id.substring(0, 8),
                  status: selectedCobranca.status,
                  dataVencimento: selectedCobranca.faturas?.vencimento ? formatDate(selectedCobranca.faturas.vencimento) : (selectedCobranca.vencimento_original ? formatDate(selectedCobranca.vencimento_original) : undefined),
                  valorTotal: formatCurrency(selectedCobranca.valor_atualizado)
                })}
                variant="icon"
              />
              {selectedCobranca.status !== 'acordo' && selectedCobranca.status !== 'quitado' && selectedCobranca.status !== 'cartorio' && selectedCobranca.status !== 'protestado' && (
                <button onClick={() => { setIsHistoricoModalOpen(false); setAcordoData({ parcelas: 1, dtPrimeiroVenc: '', desconto: 0, tipo_desconto: 'fixo', observacoes: '' }); setIsAcordoModalOpen(true); }} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                  Gerar Acordo / Parcelamento
                </button>
              )}
              {selectedCobranca.status !== 'cartorio' && selectedCobranca.status !== 'protestado' && selectedCobranca.status !== 'quitado' && (
                <button onClick={() => handleMudarStatusCobranca(selectedCobranca, 'cartorio', 3)} className="px-6 py-3 bg-neutral-900 hover:bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                  Mandar para Protesto
                </button>
              )}
              {['acordo', 'acordo_quebrado'].includes(selectedCobranca.status) && (
                <button onClick={() => { handleCancelarAcordo(selectedCobranca); setIsHistoricoModalOpen(false); }} className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                  Cancelar Acordo
                </button>
              )}
              <button onClick={() => { handleExcluirAcordo(selectedCobranca); setIsHistoricoModalOpen(false); }} className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                Excluir Registro
              </button>
              {selectedCobranca.status !== 'quitado' && (
                <button onClick={() => {
                  setBaixaCobrancaData({ 
                    valor_pago: selectedCobranca.valor_atualizado, 
                    data_pagamento: new Date().toISOString().split('T')[0], 
                    forma_pagamento: 'pix' 
                  });
                  setIsBaixaCobrancaOpen(true);
                }} className="px-6 py-3 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ml-auto">
                  Baixa Manual (Quitada)
                </button>
              )}
            </div>
            
            <div className="flex flex-col gap-4">
              <div className="bg-white p-4 rounded-2xl ring-1 ring-neutral-200 shadow-sm border border-neutral-100">
                <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-3">Registrar Contato Manual</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select value={novoHistorico.tipo} onChange={e => setNovoHistorico({...novoHistorico, tipo: e.target.value})} className="rounded-xl border border-neutral-200 bg-neutral-50 p-2 text-xs font-bold text-neutral-800 outline-none">
                    <option value="contato_telefonico">Ligação Telefônica</option>
                    <option value="email">Email</option>
                    <option value="visita">Visita Presencial</option>
                    <option value="outro">Outro</option>
                  </select>
                  <input type="text" placeholder="Resumo da conversa..." value={novoHistorico.descricao} onChange={e => setNovoHistorico({...novoHistorico, descricao: e.target.value})} className="md:col-span-2 rounded-xl border border-neutral-200 bg-neutral-50 p-2 text-xs text-neutral-800 outline-none" />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="promessa" checked={novoHistorico.promessa_pagamento} onChange={e => setNovoHistorico({...novoHistorico, promessa_pagamento: e.target.checked})} className="rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500" />
                    <label htmlFor="promessa" className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">Promessa Pgt?</label>
                    {novoHistorico.promessa_pagamento && (
                      <input type="date" value={novoHistorico.data_promessa} onChange={e => setNovoHistorico({...novoHistorico, data_promessa: e.target.value})} className="ml-2 rounded-lg border border-neutral-200 bg-neutral-50 p-1 text-xs text-neutral-800 outline-none" />
                    )}
                  </div>
                  <button onClick={salvarHistoricoManual} disabled={!novoHistorico.descricao || isSubmittingAcao} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50">
                    Salvar Log
                  </button>
                </div>
              </div>

              <div className="bg-neutral-50 p-4 rounded-2xl">
                <h4 className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Timeline da Dívida</h4>
                <div className="space-y-3">
                  {selectedCobranca.cobranca_historico && selectedCobranca.cobranca_historico.length > 0 ? (
                    selectedCobranca.cobranca_historico.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((h: any) => (
                      <div key={h.id} className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white border-2 border-neutral-200 text-neutral-500 shadow-sm shrink-0 mt-0.5">
                          {h.tipo_acao === 'contato_whatsapp' ? <MessageCircle className="h-3.5 w-3.5 text-green-500" /> : 
                           h.tipo_acao === 'acordo' ? <Briefcase className="h-3.5 w-3.5 text-indigo-500" /> :
                           h.tipo_acao === 'mudanca_status' ? <Filter className="h-3.5 w-3.5 text-amber-500" /> :
                           h.promessa_pagamento ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> :
                           <Clock className="h-3.5 w-3.5 text-neutral-500" />}
                        </div>
                        <div className="flex-1 bg-white p-3 rounded-xl shadow-sm border border-neutral-100">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-black uppercase text-indigo-500">{h.tipo_acao?.replace(/_/g, ' ') || 'Ação'}</span>
                            <time className="text-[10px] font-bold text-neutral-400">{formatDateTime(h.created_at)}</time>
                          </div>
                          <p className="text-xs text-neutral-600 font-medium">{h.descricao}</p>
                          {h.promessa_pagamento && h.data_promessa && (
                            <p className="mt-2 text-[10px] font-black text-emerald-600 bg-emerald-50 max-w-fit px-2 py-1 rounded">
                              Promessa: {formatDate(h.data_promessa)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-neutral-400 font-bold uppercase text-[10px] tracking-widest bg-white rounded-xl shadow-sm border border-neutral-100">
                      Nenhum histórico registrado
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Fix #10: Modal de Acordo com prévia de valor por parcela */}
      <Modal isOpen={isAcordoModalOpen} onClose={() => setIsAcordoModalOpen(false)} title="Gerar Acordo / Parcelamento" size="md">
        {selectedCobranca && (
          <div className="space-y-4">
            <div className="bg-indigo-50 p-4 rounded-xl ring-1 ring-indigo-200 flex justify-between items-center mb-4">
              <div>
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Valor Atual da Dívida</p>
                <p className="text-lg font-black text-indigo-600">{formatCurrency(selectedCobranca.valor_atualizado)}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 item-end">
              <div className="col-span-2">
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">Desconto Concedido</label>
                <input  type="number" value={acordoData.desconto || ''} inputMode="numeric"
onChange={(e) => setAcordoData({...acordoData, desconto: Number(e.target.value)})} className="w-full rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-bold text-neutral-800 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder={acordoData.tipo_desconto === 'fixo' ? 'R$' : '%'} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">Tipo</label>
                <select value={acordoData.tipo_desconto} onChange={e => setAcordoData({...acordoData, tipo_desconto: e.target.value})} className="w-full rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-bold text-neutral-800 outline-none">
                  <option value="fixo">R$ Reais</option>
                  <option value="porcentagem">% Percent.</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">Qtd. Parcelas</label>
                <input  type="number" min="1" max="120" value={acordoData.parcelas} inputMode="numeric"
onChange={(e) => setAcordoData({...acordoData, parcelas: Number(e.target.value)})} className="w-full rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-bold text-neutral-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">1º Vencimento</label>
                <input type="date" value={acordoData.dtPrimeiroVenc} onChange={e => setAcordoData({...acordoData, dtPrimeiroVenc: e.target.value})} className="w-full rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-bold text-neutral-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
            </div>

            {/* Fix #10: Prévia do valor por parcela */}
            {acordoData.parcelas > 0 && (() => {
              const valorDescontoPreview = acordoData.tipo_desconto === 'porcentagem' 
                ? (selectedCobranca.valor_atualizado * (acordoData.desconto / 100))
                : (acordoData.desconto || 0);
              const totalComDesconto = selectedCobranca.valor_atualizado - valorDescontoPreview;
              const valorParcPreview = Math.round((totalComDesconto / (acordoData.parcelas || 1)) * 100) / 100;

              return (
                <div className="bg-emerald-50 p-4 rounded-xl ring-1 ring-emerald-200">
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Prévia do Acordo</p>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs text-neutral-600 font-medium">Valor com desconto:</p>
                      <p className="font-black text-neutral-800">{formatCurrency(totalComDesconto)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-neutral-600 font-medium">{acordoData.parcelas}x de:</p>
                      <p className="text-xl font-black text-emerald-600">
                        {formatCurrency(valorParcPreview)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div>
              <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">Observações do Acordo</label>
              <textarea rows={2} value={acordoData.observacoes} onChange={e => setAcordoData({...acordoData, observacoes: e.target.value})} className="w-full rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800 focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
            </div>
            <button onClick={confirmarGerarAcordo} disabled={!acordoData.parcelas || !acordoData.dtPrimeiroVenc || submittingAcordo || isSubmittingAcao} className="w-full bg-indigo-600 hover:bg-indigo-700 py-4 rounded-xl text-white font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 mt-4 disabled:opacity-50 transition-all">
              {submittingAcordo || isSubmittingAcao ? <><Activity className="h-4 w-4 animate-spin" /> Processando...</> : 'Confirmar Acordo'}
            </button>
          </div>
        )}
      </Modal>

      {/* Modal Baixa / Detalhes de Parcela */}
      <Modal isOpen={isBaixaParcelaOpen} onClose={() => { setIsBaixaParcelaOpen(false); setParcelaSelecionada(null); }} title={parcelaSelecionada?.status === 'pago' ? "Detalhes da Parcela" : "Dar Baixa na Parcela"} size="sm">
        {parcelaSelecionada && (
          <div className="space-y-5">
            <div className="bg-emerald-50 p-4 rounded-xl ring-1 ring-emerald-200">
              <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Parcela {parcelaSelecionada.numero_parcela} {parcelaSelecionada.status === 'pago' && '- Paga'}</p>
              <p className="text-xl font-black text-emerald-600">{formatCurrency(parcelaSelecionada.valor_parcela)}</p>
              <p className="text-[10px] font-bold text-neutral-500 mt-1">Vencimento: {formatDate(parcelaSelecionada.data_vencimento)}</p>
            </div>

            {parcelaSelecionada.status === 'pago' ? (
              <div className="space-y-4">
                <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">Data do Pagamento</p>
                  <p className="font-bold text-neutral-800">{formatDate(parcelaSelecionada.data_pagamento)}</p>
                </div>
                <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-1">Forma de Pagamento</p>
                  <p className="font-bold text-neutral-800 uppercase">{parcelaSelecionada.forma_pagamento ? parcelaSelecionada.forma_pagamento.replace('_', ' ') : 'Não informada'}</p>
                </div>
                <button 
                  onClick={() => { setIsBaixaParcelaOpen(false); setParcelaSelecionada(null); }} 
                  className="w-full bg-neutral-900 hover:bg-black py-4 rounded-xl text-white font-black uppercase tracking-widest text-[10px] flex items-center justify-center transition-all"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Data do Pagamento</label>
                  <input 
                    type="date" 
                    value={baixaData.data_pagamento} 
                    onChange={e => setBaixaData({...baixaData, data_pagamento: e.target.value})} 
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-bold text-neutral-800 focus:ring-2 focus:ring-emerald-500 outline-none" 
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Forma de Pagamento</label>
                  <select 
                    value={baixaData.forma_pagamento} 
                    onChange={e => setBaixaData({...baixaData, forma_pagamento: e.target.value})} 
                    className="w-full rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-bold text-neutral-800 focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="pix">PIX</option>
                    <option value="boleto">Boleto Bancário</option>
                    <option value="transferencia">Transferência Bancária</option>
                    <option value="cartao_credito">Cartão de Crédito</option>
                    <option value="cartao_debito">Cartão de Débito</option>
                    <option value="dinheiro">Dinheiro</option>
                    <option value="cheque">Cheque</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>

                <button 
                  onClick={confirmarBaixaParcela} 
                  disabled={!baixaData.data_pagamento || parcelaLoading === parcelaSelecionada.id} 
                  className="w-full bg-emerald-600 hover:bg-emerald-700 py-4 rounded-xl text-white font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                >
                  {parcelaLoading === parcelaSelecionada.id ? (
                    <><Activity className="h-4 w-4 animate-spin" /> Processando...</>
                  ) : (
                    <><CheckCircle className="h-4 w-4" /> Confirmar Baixa</>
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Modal Baixa Manual Cobrança Completa */}
      <Modal isOpen={isBaixaCobrancaOpen} onClose={() => setIsBaixaCobrancaOpen(false)} title="Dar Baixa Manual" size="sm">
        <div className="space-y-5">
          <div className="bg-emerald-50 p-4 rounded-xl ring-1 ring-emerald-200">
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Valor da Cobrança</p>
            <p className="text-xl font-black text-emerald-900">{formatCurrency(selectedCobranca?.valor_atualizado || 0)}</p>
          </div>
          
          <div>
            <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Valor Pago</label>
            <input  
              type="number" 
              value={baixaCobrancaData.valor_pago} 
              inputMode="numeric"
onChange={(e) => setBaixaCobrancaData({...baixaCobrancaData, valor_pago: Number(e.target.value)})} 
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-bold text-neutral-800 focus:ring-2 focus:ring-emerald-500 outline-none" 
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Data do Pagamento</label>
            <input 
              type="date" 
              value={baixaCobrancaData.data_pagamento} 
              onChange={e => setBaixaCobrancaData({...baixaCobrancaData, data_pagamento: e.target.value})} 
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-bold text-neutral-800 focus:ring-2 focus:ring-emerald-500 outline-none" 
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Forma de Pagamento</label>
            <select 
              value={baixaCobrancaData.forma_pagamento} 
              onChange={e => setBaixaCobrancaData({...baixaCobrancaData, forma_pagamento: e.target.value})} 
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-bold text-neutral-800 focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="pix">PIX</option>
              <option value="boleto">Boleto Bancário</option>
              <option value="transferencia">Transferência Bancária</option>
              <option value="cartao_credito">Cartão de Crédito</option>
              <option value="cartao_debito">Cartão de Débito</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="cheque">Cheque</option>
              <option value="outro">Outro</option>
            </select>
          </div>

          <button 
            onClick={confirmarBaixaManualCobranca} 
            disabled={!baixaCobrancaData.data_pagamento || baixaCobrancaData.valor_pago <= 0 || isSubmittingAcao} 
            className="w-full bg-emerald-600 hover:bg-emerald-700 py-4 rounded-xl text-white font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
          >
            <CheckCircle className="h-4 w-4" /> {isSubmittingAcao ? 'Aguarde...' : 'Confirmar Baixa'}
          </button>
        </div>
      </Modal>

      {/* Modal Detalhes do Protesto */}
      <Modal isOpen={isProtestoModalOpen} onClose={() => setIsProtestoModalOpen(false)} title="Enviar para Protesto" size="sm">
        <div className="space-y-5">
          <div className="bg-rose-50 p-4 rounded-xl ring-1 ring-rose-200">
            <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1">Dívida a Protestar</p>
            <p className="text-xl font-black text-rose-900">{formatCurrency(selectedCobranca?.valor_atualizado || 0)}</p>
            <p className="text-[10px] font-bold text-neutral-500 mt-1">Cliente: {selectedCobranca?.clientes?.nome}</p>
          </div>
          
          <div>
            <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Data do Protesto</label>
            <input 
              type="date" 
              value={protestoData.data_protesto} 
              onChange={e => setProtestoData({...protestoData, data_protesto: e.target.value})} 
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-bold text-neutral-800 focus:ring-2 focus:ring-rose-500 outline-none" 
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-2">Nome do Cartório</label>
            <input 
              type="text" 
              placeholder="Ex: 1º Ofício de Protesto..."
              value={protestoData.nome_cartorio} 
              onChange={e => setProtestoData({...protestoData, nome_cartorio: e.target.value})} 
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm font-bold text-neutral-800 focus:ring-2 focus:ring-rose-500 outline-none" 
            />
          </div>

          <button 
            onClick={confirmarProtesto} 
            disabled={!protestoData.data_protesto || !protestoData.nome_cartorio || isSubmittingAcao} 
            className="w-full bg-rose-600 hover:bg-rose-700 py-4 rounded-xl text-white font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-rose-600/20"
          >
            <Gavel className="h-4 w-4" /> {isSubmittingAcao ? 'Aguarde...' : 'Confirmar e Enviar para Protesto'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
