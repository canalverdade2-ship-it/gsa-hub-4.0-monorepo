import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { uploadFile } from '../../../lib/storage';
import { toast } from 'react-hot-toast';
import { SupportConversationModal } from '../../common/SupportConversationModal';
import { 
  Search, Filter, Plus, FileText, CheckCircle, Clock, 
  AlertCircle, XCircle, MessageSquare, Trash2, Upload, 
  UserPlus, Info, ArrowUpCircle, Briefcase, File, PlusCircle, History, Paperclip, X, Send
} from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { formatCurrency, generateCode, formatDate, formatDateTime } from '../../../lib/utils';
import { logService } from '../../../lib/logService';
import { demandService } from '../../../lib/demandService';
import { notificationService } from '../../../lib/notificationService';
import { useFileViewer } from '../../../contexts/FileViewerContext';
import { callAdminRpc } from '../../../lib/adminRpc';
import { useConfirm } from '../../../hooks/useConfirm';
import { ConfirmDialog } from '../../ui/ConfirmDialog';

export function PrestadoresDemandas({ subTab, initialItemId, colaboradorNome, colaboradorId }: { subTab?: string, initialItemId?: string, colaboradorNome?: string | null, colaboradorId?: string | null }) {
  const confirmHook = useConfirm();
  const { confirm } = confirmHook;
  const { openFile } = useFileViewer();
  const [demandas, setDemandas] = useState<any[]>([]);
  const [prestadores, setPrestadores] = useState<any[]>([]);
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [ordensServico, setOrdensServico] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(subTab || 'abertas');

  useEffect(() => {
    if (subTab) setActiveTab(subTab as any);
  }, [subTab]);
  const [suportes, setSuportes] = useState<any[]>([]);
  
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [activeAssignTab, setActiveAssignTab] = useState<'info' | 'direcionamento'>('direcionamento');
  const [activeTransferTab, setActiveTransferTab] = useState<'info' | 'transferencia' | 'contexto'>('transferencia');
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, demanda: any | null, type: 'finalize' | 'cancel'}>({isOpen: false, demanda: null, type: 'finalize'});
  const [isCounterModalOpen, setIsCounterModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [isAjusteModalOpen, setIsAjusteModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [activeDetailsTab, setActiveDetailsTab] = useState<'geral' | 'execucao' | 'entrega' | 'historico' | 'suporte_cliente'>('geral');
  const [historico, setHistorico] = useState<any[]>([]);
  const [transferTarget, setTransferTarget] = useState<'admin' | 'prestador' | 'colaborador'>('prestador');
  const [transferPrestadorId, setTransferPrestadorId] = useState('');
  const [transferColaboradorId, setTransferColaboradorId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferFile, setTransferFile] = useState<File | null>(null);
  const [transferValor, setTransferValor] = useState('');
  const [transferPrazo, setTransferPrazo] = useState('');
  const [isCancelWithReasonModalOpen, setIsCancelWithReasonModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  
  const [selectedDemanda, setSelectedDemanda] = useState<any>(null);
  const [selectedSuporte, setSelectedSuporte] = useState<any>(null);
  const [ajusteDescricao, setAjusteDescricao] = useState('');
  const [ajustePrazo, setAjustePrazo] = useState('');
  const [selectedPrestadorId, setSelectedPrestadorId] = useState('');
  const [valorProposto, setValorProposto] = useState('');
  const [detalhes, setDetalhes] = useState('');
  const [prazoEntrega, setPrazoEntrega] = useState('');
  const [linkEntrega, setLinkEntrega] = useState('');
  
  const [novaDemandaTitulo, setNovaDemandaTitulo] = useState('');
  const [novaDemandaDescricao, setNovaDemandaDescricao] = useState('');
  const [novaDemandaOsId, setNovaDemandaOsId] = useState('');
  const [novaDemandaArquivos, setNovaDemandaArquivos] = useState<File[]>([]);
  
  const [counterValue, setCounterValue] = useState('');
  const [counterReason, setCounterReason] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gerarOrdemFiscal, setGerarOrdemFiscal] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const hasAutoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (initialItemId && hasAutoOpened.current !== initialItemId) {
      if (activeTab === 'suporte') {
        if (suportes.length > 0) {
          const suporte = suportes.find(s => s.id === initialItemId);
          if (suporte) {
            setSelectedSuporte(suporte);
            setIsSupportModalOpen(true);
            hasAutoOpened.current = initialItemId;
          }
        }
      } else if (demandas.length > 0) {
        const timer = setTimeout(() => {
          const element = document.getElementById(`demand-${initialItemId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedId(initialItemId);
            
            // Abrir modal automaticamente
            const demanda = demandas.find(d => d.id === initialItemId);
            if (demanda) {
              setSelectedDemanda(demanda);
              setIsDetailsModalOpen(true);
              hasAutoOpened.current = initialItemId;
            }

            setTimeout(() => setHighlightedId(null), 3000);
          }
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [initialItemId, demandas, suportes, activeTab]);

  // ── Helper: cria ordem fiscal vinculada a uma fatura ─────────────────────
  const createOrdemFiscal = async (demanda: any, faturaId: string, orcTotal: number) => {
    try {
      const osRaw = demanda.ordem_servico;
      const osObj = Array.isArray(osRaw) ? osRaw[0] : osRaw;
      const orc = osObj?.orcamento;
      const orcObj = Array.isArray(orc) ? orc[0] : orc;

      // Buscar dados completos do cliente
      const { data: clienteData } = await supabase
        .from('clientes')
        .select('nome, cpf, cnpj, tipo_pessoa, telefone')
        .eq('id', osObj?.cliente_id)
        .maybeSingle();

      const documento = clienteData?.tipo_pessoa === 'pj'
        ? clienteData?.cnpj
        : clienteData?.cpf;

      try {
        await supabase.from('ordens_fiscais').insert([{
          codigo_fiscal: generateCode('FISC'),
          fatura_id: faturaId,
          demanda_id: demanda.id,
          cliente_id: osObj?.cliente_id || null,
          cliente_nome: clienteData?.nome || osObj?.cliente?.nome || null,
          cliente_documento: documento || null,
          cliente_telefone: clienteData?.telefone || osObj?.cliente?.telefone || null,
          tipo_compra: 'servico',
          descricao_item: orcObj?.servico?.nome || demanda.titulo || null,
          codigo_ordem: osObj?.codigo_os || null,
          codigo_orcamento: orcObj?.codigo_orcamento || null,
          valor_bruto: orcTotal,
          valor_desconto: 0,
          valor_acrescimo: 0,
          valor_total: orcTotal,
          status_pagamento: 'pendente',
          status_emissao: 'pendente_emissao',
        }]).throwOnError();
      } catch (error) {
        console.error('Erro ao criar ordem fiscal:', error);
        toast.error('Erro ao criar ordem fiscal.');
      }
    } catch (err) {
      console.error('Erro ao criar ordem fiscal:', err);
      throw err;
    }
  };

  useEffect(() => {
    fetchDemandas();
    fetchPrestadores();
    fetchSuportes();
    fetchOrdensServico();
    fetchColaboradores();

    const channel = supabase
      .channel('admin-prestador-demandas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_demandas' }, () => {
        fetchDemandas();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_suporte_demandas' }, () => {
        fetchSuportes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestadores' }, () => {
        fetchPrestadores();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_servico' }, () => {
        fetchOrdensServico();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOrdensServico = async () => {
    try {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('id, codigo_os, orcamentos(servicos(nome))')
        .eq('status', 'andamento')
        .order('data_inicio', { ascending: false });
      if (error) throw error;
      setOrdensServico(data || []);
    } catch (error) {
      console.error('Erro ao buscar ordens de serviço:', error);
    }
  };

  const fetchSuportes = async () => {
    try {
      const { data, error } = await supabase
        .from('prestador_suporte_demandas')
        .select(`
          *,
          prestador:prestadores(nome_razao),
          demanda:prestador_demandas(
            titulo,
            ordem_servico:ordens_servico(codigo_os)
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) {
        if (error.code === 'PGRST205') {
          console.warn('Tabela prestador_suporte_demandas não encontrada. Certifique-se de aplicar as migrações.');
          setSuportes([]);
          return;
        }
        throw error;
      }
      setSuportes(data || []);
    } catch (error) {
      console.error('Erro ao buscar suportes:', error);
    }
  };

  const fetchDemandas = async () => {
    try {
      const { data, error } = await supabase
        .from('prestador_demandas')
        .select(`
          *,
          prestador:prestadores(nome_razao, documento),
          colaborador:colaboradores(nome, email),
          ordem_servico:ordens_servico(
            id,
            codigo_os,
            orcamento_id,
            cliente_id,
            cliente:clientes(nome),
            orcamento:orcamentos(
              id,
              codigo_orcamento,
              total,
              observacoes_servico,
              descricao_adicional,
              servico:servicos(nome)
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.message?.includes('detalhes') || error.message?.includes('prazo_entrega')) {
          // Fallback if new columns are missing
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('prestador_demandas')
            .select(`
              id, prestador_id, os_id, titulo, descricao, valor_proposto_admin, valor_proposto_prestador, valor_final, status, data_inicio, data_conclusao, created_at, updated_at, link_resultado, 
              prestador:prestadores(nome_razao, documento),
              ordem_servico:ordens_servico(
                id,
                codigo_os,
                orcamento_id,
                cliente_id,
                cliente:clientes(nome),
                orcamento:orcamentos(
                  id,
                  codigo_orcamento,
                  total,
                  observacoes_servico,
                  descricao_adicional,
                  servico:servicos(nome)
                )
              )
            `)
            .order('created_at', { ascending: false });
          
          if (fallbackError) throw fallbackError;
          setDemandas(fallbackData || []);
          return;
        }
        throw error;
      }
      setDemandas(data || []);
    } catch (error) {
      console.error('Erro ao buscar demandas:', error);
      toast.error('Erro ao carregar demandas.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPrestadores = async () => {
    try {
      const { data, error } = await supabase
        .from('prestadores')
        .select('id, nome_razao, documento')
        .eq('status', 'ativo')
        .order('nome_razao');
      if (error) throw error;
      setPrestadores(data || []);
    } catch (error) {
      console.error('Erro ao buscar prestadores:', error);
    }
  };

  const fetchColaboradores = async () => {
    try {
      const { data, error } = await supabase
        .from('colaboradores')
        .select('id, nome, email')
        .eq('status', 'ativo')
        .order('nome');
      if (error) throw error;
      setColaboradores(data || []);
    } catch (error) {
      console.error('Erro ao buscar colaboradores:', error);
    }
  };

  const fetchHistorico = async (demandaId: string) => {
    try {
      const { data, error } = await supabase
        .from('prestador_demandas_historico')
        .select('*')
        .eq('demanda_id', demandaId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setHistorico(data || []);
    } catch (error) {
      console.error('Erro ao buscar histórico da demanda:', error);
    }
  };

  const addDemandHistory = async (demandaId: string, tipoEvento: any, motivo: string, extras: any = {}) => {
    try {
      await demandService.addDemandHistory({
        demandaId,
        tipoEvento,
        motivo,
        colaboradorOrigemId: colaboradorId || null,
        ...extras
      });
      // Atualizar lista se o modal estiver aberto
      if (isDetailsModalOpen && selectedDemanda?.id === demandaId) {
        fetchHistorico(demandaId);
      }
    } catch (error) {
      console.error('Erro ao registrar histórico da demanda:', error);
    }
  };

  useEffect(() => {
    if (isDetailsModalOpen && selectedDemanda?.id) {
      fetchHistorico(selectedDemanda.id);
    }
  }, [isDetailsModalOpen, selectedDemanda?.id]);

  const handleCreateDemanda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaDemandaTitulo) {
      toast.error('Preencha o título da demanda.');
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const arquivosBriefing: any[] = [];
      if (novaDemandaArquivos.length > 0) {
        for (const file of novaDemandaArquivos) {
          const ext = file.name.split('.').pop();
          const path = `briefings/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const { url: publicUrl } = await uploadFile(file, 'entregas_demandas', path);
          
          // publicUrl is handled by uploadFile directly if bucket is public, else use getPublicFileUrl or getPrivateFileUrl.
          arquivosBriefing.push({ nome: file.name, url: publicUrl, tipo: file.type, tamanho: file.size });
        }
      }

      const { data: demanda, error: insertError } = await supabase
        .from('prestador_demandas')
        .insert({
          titulo: novaDemandaTitulo,
          descricao: novaDemandaDescricao,
          os_id: novaDemandaOsId || null,
          status: 'aberta',
          arquivos_briefing: arquivosBriefing
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Registrar Histórico
      await addDemandHistory(
        demanda.id,
        'criacao',
        `Demanda criada no sistema com o título: "${novaDemandaTitulo}"${novaDemandaOsId ? '. Vinculada à OS ' + ordensServico.find(os => os.id === novaDemandaOsId)?.codigo_os : ''}.`
      );



      toast.success('Demanda criada com sucesso!');
      setIsCreateModalOpen(false);

      await logService.logAction({
        acao: 'CRIAR_DEMANDA_PRESTADOR',
        detalhes: JSON.stringify({ demanda_id: demanda.id, titulo: novaDemandaTitulo, os_id: novaDemandaOsId || null }),
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador'
      });

      setNovaDemandaTitulo('');
      setNovaDemandaDescricao('');
      setNovaDemandaOsId('');
      setNovaDemandaArquivos([]);
      fetchDemandas();
    } catch (error) {
      console.error('Erro ao criar demanda:', error);
      toast.error('Erro ao criar demanda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignPrestador = async (e: React.FormEvent) => {
    e.preventDefault();
    const isGestaoInterna = selectedPrestadorId === 'gestao_interna';
    
    if (!selectedDemanda || !selectedPrestadorId || isSubmitting) {
      if (!isSubmitting) toast.error('Selecione uma opção de direcionamento.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Para Gestão Interna, a demanda vai para a "fila" geral aguardando atribuição.
      const isGestaoInterna = selectedPrestadorId === 'gestao_interna';
      
      const updateData: any = {
        prestador_id: isGestaoInterna ? null : selectedPrestadorId,
        colaborador_id: null,
        valor_proposto_admin: isGestaoInterna ? null : parseFloat(valorProposto),
        detalhes: detalhes || (isGestaoInterna ? 'Direcionado para a Gestão Interna (Aguardando Triagem)' : 'Direcionado para Prestador Externo'),
        prazo_entrega: isGestaoInterna ? null : new Date(prazoEntrega).toISOString(),
        status: isGestaoInterna ? 'aguardando_atribuicao' : 'ativa',
        data_inicio: new Date().toISOString()
      };

      const { error } = await supabase
        .from('prestador_demandas')
        .update(updateData)
        .eq('id', selectedDemanda.id);

      if (error) {
        if (error.message?.includes('detalhes')) {
          // Fallback if detalhes column is missing
          const { detalhes: _, ...fallbackData } = updateData;
          const { error: fallbackError } = await supabase
            .from('prestador_demandas')
            .update({
              ...fallbackData,
              descricao: detalhes // Use descricao as fallback for detalhes
            })
            .eq('id', selectedDemanda.id);
          
          if (fallbackError) throw fallbackError;
        } else {
          throw error;
        }
      }

      // Registrar Histórico
      const destNome = isGestaoInterna ? 'Gestão Interna' : prestadores.find(p => p.id === selectedPrestadorId)?.nome_razao || 'Prestador';
      await addDemandHistory(
        selectedDemanda.id,
        'transferencia',
        `Demanda direcionada para ${destNome}.${!isGestaoInterna ? ` Valor: ${formatCurrency(parseFloat(valorProposto))}. Prazo: ${formatDate(prazoEntrega)}.` : ''}`,
        {
          prestadorDestinoId: isGestaoInterna ? null : selectedPrestadorId,
          valorProposto: isGestaoInterna ? null : parseFloat(valorProposto)
        }
      );

      try {
        if (isGestaoInterna && selectedDemanda.os_id) {
          await supabase.from('os_notas').insert({
            os_id: selectedDemanda.os_id,
            nota: 'Demanda direcionada para o fluxo de Gestão Interna.'
          }).throwOnError();
        } else if (selectedDemanda.os_id) {
          await supabase.from('os_notas').insert({
            os_id: selectedDemanda.os_id,
            nota: `Demanda direcionada para o prestador externo: ${destNome}.`
          }).throwOnError();
        }
      } catch (error) {
        console.error('Erro ao adicionar nota na OS:', error);
        toast.error('Erro ao adicionar nota na OS.');
      }

      if (!isGestaoInterna) {
        await notificationService.notifyProvider(
          selectedPrestadorId,
          '🆕 Nova Demanda Atribuída',
          `Você recebeu uma nova demanda: ${selectedDemanda.titulo}. Valor Proposto: ${formatCurrency(parseFloat(valorProposto))}.`,
          'demandas',
          'demanda_atribuida',
          { tab: 'abertas', itemId: selectedDemanda.id }
        );
      } else {
        // Notificar Gestão Interna (Broadcast para quem tem acesso)
        await notificationService.notifyAdmin(
          '🆕 Nova Demanda na Fila',
          `Uma nova demanda "${selectedDemanda.titulo}" foi encaminhada para a Gestão Interna e aguarda atribuição.`,
          'demandas',
          'demanda_redirecionada',
          { tab: 'aguardando', itemId: selectedDemanda.id, prioridade: 'normal' }
        );
      }

      toast.success(`Demanda direcionada para ${isGestaoInterna ? 'Gestão Interna' : 'Prestador Externo'}!`);
      setIsAssignModalOpen(false);
      setIsDetailsModalOpen(false);

      await logService.logAction({
        acao: isGestaoInterna ? 'DIRECIONAR_DEMANDA_GESTAO_INTERNA' : 'DIRECIONAR_DEMANDA_PRESTADOR',
        detalhes: JSON.stringify({ demanda_id: selectedDemanda.id, titulo: selectedDemanda.titulo, prestador: destNome }),
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador'
      });

      resetAssignForm();
      setActiveTab('ativas');
      fetchDemandas();
    } catch (error) {
      console.error('Erro ao direcionar demanda:', error);
      toast.error('Erro ao direcionar demanda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendCounterProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDemanda || !counterValue || isSubmitting) {
      if (!counterValue && !isSubmitting) toast.error('Informe o valor da contraproposta.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('prestador_demandas')
        .update({
          valor_proposto_admin: parseFloat(counterValue),
          motivo_negociacao: counterReason,
          status: 'contraproposta_admin_final',
          is_contraproposta_final: true
        })
        .eq('id', selectedDemanda.id);

      if (error) throw error;

      // Registrar Histórico
      await addDemandHistory(
        selectedDemanda.id,
        'negociacao',
        `Contraproposta final enviada ao prestador no valor de ${formatCurrency(parseFloat(counterValue))}.${counterReason ? ` Motivo: ${counterReason}` : ''}`,
        {
          valorProposto: parseFloat(counterValue),
          prestadorDestinoId: selectedDemanda.prestador_id
        }
      );

      await notificationService.notifyProvider(
        selectedDemanda.prestador_id,
        '💬 Nova Contraproposta',
        `A administração enviou uma contraproposta final para a demanda: ${selectedDemanda.titulo}.`,
        'demandas',
        'demanda_contraproposta',
        { tab: 'abertas', itemId: selectedDemanda.id }
      );

      toast.success('Contraproposta final enviada ao prestador!');
      setIsCounterModalOpen(false);
      setIsDetailsModalOpen(false);

      await logService.logAction({
        acao: 'ENVIAR_CONTRAPROPOSTA_DEMANDA',
        detalhes: JSON.stringify({ demanda_id: selectedDemanda.id, valor: parseFloat(counterValue), motivo: counterReason }),
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador'
      });

      setCounterValue('');
      setCounterReason('');
      fetchDemandas();
    } catch (error) {
      console.error('Erro ao enviar contraproposta:', error);
      toast.error('Erro ao enviar contraproposta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptCounterProposal = async (demanda: any) => {
    if (!demanda || isSubmitting) return;

    if (!await confirm({ title: 'Confirmação', message: `Deseja aceitar a contraproposta de ${formatCurrency(demanda.valor_proposto_prestador)} feita pelo prestador?` })) {
      return;
    }

    setIsSubmitting(true);
    try {
      const valorFinal = demanda.valor_proposto_prestador;
      const { error } = await supabase
        .from('prestador_demandas')
        .update({ 
          status: 'ativa', 
          data_inicio: new Date().toISOString(),
          valor_final: valorFinal
        })
        .eq('id', demanda.id);

      if (error) throw error;

      // Registrar Histórico
      await addDemandHistory(
        demanda.id,
        'aceite',
        `Contraproposta do prestador aceita pela administração. Valor final: ${formatCurrency(valorFinal)}. Serviço em execução.`,
        {
          valorProposto: valorFinal,
          prestadorDestinoId: demanda.prestador_id
        }
      );

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'ACEITAR_CONTRAPROPOSTA_DEMANDA',
        detalhes: `Aceitou contraproposta da demanda #${demanda.id.slice(0, 8)} no valor de ${formatCurrency(valorFinal)}`
      });

      await notificationService.notifyProvider(
        demanda.prestador_id,
        '🤝 Contraproposta Aceita',
        `Sua contraproposta para a demanda ${demanda.titulo} foi aceita. O serviço já pode ser iniciado.`,
        'demandas',
        'demanda_atribuida',
        { tab: 'ativas', itemId: demanda.id }
      );

      toast.success('Contraproposta aceita! A demanda agora está ativa.');
      setIsDetailsModalOpen(false);
      fetchDemandas();
    } catch (error: any) {
      console.error('Erro ao aceitar contraproposta:', error);
      toast.error(error.message || 'Erro ao aceitar contraproposta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetAssignForm = () => {
    setSelectedPrestadorId('');
    setValorProposto('');
    setDetalhes('');
    setPrazoEntrega('');
  };

  const handleFinalizeDemanda = async (demanda: any) => {
    setConfirmModal({ isOpen: true, demanda, type: 'finalize' });
  };

  const confirmFinalizeDemanda = async () => {
    const demanda = confirmModal.demanda;
    if (!demanda || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const agora = new Date().toISOString();
      const osRaw = demanda.ordem_servico;
      const osObj = Array.isArray(osRaw) ? osRaw[0] : osRaw;
      const orc = osObj?.orcamento;
      const orcObj = Array.isArray(orc) ? orc[0] : orc;
      const orcTotal = Number(orcObj?.total || 0);

      // 1. Atualizar Demanda
      const { error: errorDemanda } = await supabase
        .from('prestador_demandas')
        .update({ 
          status: 'finalizada',
          data_conclusao: agora
        })
        .eq('id', demanda.id);
      if (errorDemanda) throw errorDemanda;

      // 2. Atualizar OS e linkar entrega
      if (demanda.os_id) {
        // Obter anexos atuais da OS
        let osData = null;
        try {
          const { data } = await supabase.from('ordens_servico').select('anexos_os').eq('id', demanda.os_id).single();
          osData = data;
        } catch (error) {
          console.error('Erro ao buscar anexos da OS:', error);
          toast.error('Erro ao buscar anexos da OS.');
        }
        let currentAnexos = osData?.anexos_os || [];
        
        // Mapear arquivos da entrega
        let deliveryAnexos: any[] = [];
        
        // 1. Arquivos da Gestão Interna (Array)
        if (demanda.arquivos_resultado && Array.isArray(demanda.arquivos_resultado)) {
            deliveryAnexos = [...deliveryAnexos, ...demanda.arquivos_resultado.map((url: string, index: number) => ({
                nome: `Entrega_Interna_${index + 1}`,
                url: url
            }))];
        }
        
        // 2. Link do resultado entregue pelo prestador.
        if (demanda.link_resultado) {
            deliveryAnexos.push({
                nome: 'Entrega_Final_Prestador',
                url: demanda.link_resultado
            });
        }
        
        // Deduplicar por URL para evitar duplicidade em caso de reprocessamento
        const uniqueAnexos = [...currentAnexos];
        deliveryAnexos.forEach(newAnexo => {
          if (!uniqueAnexos.some(existing => existing.url === newAnexo.url)) {
            uniqueAnexos.push(newAnexo);
          }
        });

        const { error: errorOS } = await supabase
          .from('ordens_servico')
          .update({ 
            status: 'concluido',
            data_fim: agora,
            anexos_os: uniqueAnexos
          })
          .eq('id', demanda.os_id);
        if (errorOS) throw errorOS;

        try {
          // Registrar nota de conclusão na OS para o cliente ver no histórico
          await supabase.from('os_notas').insert({
            os_id: demanda.os_id,
            nota: '✅ Atendimento concluído com sucesso! Os arquivos finais foram disponibilizados e a fatura gerada. Obrigado por confiar na GSA!'
          }).throwOnError();
        } catch (error) {
          console.error('Erro ao adicionar nota na OS:', error);
          toast.error('Erro ao adicionar nota na OS.');
        }

        // 3. Gerar Fatura para o Cliente (Valor do Orçamento)
        const { data: fatura, error: errorFatura } = await supabase
          .from('faturas')
          .insert({
            codigo_fatura: generateCode('FAT'),
            os_id: demanda.os_id,
            cliente_id: osObj?.cliente_id,
            valor_total: orcTotal,
            valor_final_pendente: orcTotal,
            status: 'pendente',
            data_vencimento: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            tipo: 'servico'
          })
          .select()
          .single();
        if (errorFatura) throw errorFatura;

        // Ordem Fiscal se solicitado
        if (gerarOrdemFiscal && fatura) {
          await createOrdemFiscal(demanda, fatura.id, orcTotal);
        }

        // 3.1 Notificar Cliente sobre Conclusão e Fatura
        if (osObj?.cliente_id) {
          await notificationService.notifyClient(
            osObj.cliente_id,
            '✅ Serviço Concluído',
            `O atendimento da demanda ${demanda.titulo} foi finalizado com sucesso! Os arquivos já estão disponíveis.`,
            'servicos',
            'os_concluida',
            { itemId: demanda.os_id, tab: 'concluidas' }
          );

          await notificationService.notifyClient(
            osObj.cliente_id,
            '📄 Nova Fatura Gerada',
            `Uma fatura no valor de ${formatCurrency(orcTotal)} foi gerada referente ao serviço concluído.`,
            'financeiro',
            'fatura_gerada',
            { itemId: fatura.id, tab: 'faturas' }
          );
        }
      }

      // 4. Gerar Crédito para o Prestador (Valor da Demanda)
      if (demanda.prestador_id) {
        const { error: errorTransacao } = await supabase
          .from('prestador_transacoes')
          .insert({
            prestador_id: demanda.prestador_id,
            demanda_id: demanda.id,
            tipo: 'credito',
            valor: demanda.valor_final || 0,
            descricao: `Pagamento pela Demanda nº ${demanda.codigo_demanda || `#${demanda.id.slice(0, 8)}`} Finalizada.`,
            status: 'concluido'
          });
        if (errorTransacao) throw errorTransacao;

        // 4.1 Notificar Prestador sobre Crédito
        await notificationService.notifyProvider(
          demanda.prestador_id,
          '💰 Crédito Liberado',
          `Seu crédito referente à demanda ${demanda.titulo} foi liberado em sua carteira.`,
          'financeiro',
          'pagamento_confirmado',
          { tab: 'extrato' }
        );
      }

      // 5. Histórico
      await addDemandHistory(
        demanda.id,
        'finalizacao',
        `Demanda finalizada administrativamente. Fatura gerada para o cliente no valor de ${formatCurrency(orcTotal)}.`
      );

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'FINALIZAR_DEMANDA_PRESTADOR',
        detalhes: `Finalizou demanda #${demanda.id.slice(0, 8)} e OS #${demanda.os_id?.slice(0, 8)}`
      });

      toast.success('Demanda e Ordem de Serviço concluídas com sucesso!');
      setIsDetailsModalOpen(false);
      fetchDemandas();
      setConfirmModal({ isOpen: false, demanda: null, type: 'finalize' });
    } catch (error: any) {
      console.error('Erro ao finalizar demanda:', error);
      toast.error(error.message || 'Erro ao finalizar demanda.');
    } finally {
      setIsSubmitting(false);
    }
  };



  const handleTransferDemanda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDemanda || isSubmitting) return;
    if (transferTarget === 'prestador' && !transferPrestadorId) {
      toast.error('Selecione o novo prestador.');
      return;
    }
    if (transferTarget === 'colaborador' && !transferColaboradorId) {
      toast.error('Selecione o colaborador.');
      return;
    }

    setIsSubmitting(true);
    try {
      let arquivoUrl = '';
      if (transferFile) {
        const fileExt = transferFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `transfers/${selectedDemanda.id}/${fileName}`;
        const { url: publicUrl } = await uploadFile(transferFile, 'entregas_demandas', filePath);
        // publicUrl is handled by uploadFile directly if bucket is public, else use getPublicFileUrl or getPrivateFileUrl.
        arquivoUrl = publicUrl;
      }

      const updateData: any = {
        prestador_id: transferTarget === 'prestador' ? transferPrestadorId : null,
        colaborador_id: transferTarget === 'colaborador' ? transferColaboradorId : null,
        status: transferTarget === 'prestador' ? 'em_negociacao' : 'ativa',
        valor_proposto_admin: transferTarget === 'prestador' ? parseFloat(transferValor) : selectedDemanda.valor_proposto_admin,
        valor_final: transferTarget === 'prestador' ? null : (selectedDemanda.valor_final || selectedDemanda.valor_proposto_admin),
        prazo_entrega: transferTarget === 'prestador' && transferPrazo ? new Date(transferPrazo).toISOString() : selectedDemanda.prazo_entrega,
        data_inicio: (transferTarget === 'prestador' || transferTarget === 'colaborador') ? null : new Date().toISOString(),
        detalhes: `${selectedDemanda.detalhes || selectedDemanda.descricao || ''}\n\n--- TRANSFERÊNCIA ---\nOrigem: ${selectedDemanda.colaborador?.nome || selectedDemanda.prestador?.nome_razao || 'Central'}\nMotivo: ${transferReason}`,
        arquivo_transferencia: arquivoUrl || null
      };

      const { error: updateError } = await supabase
        .from('prestador_demandas')
        .update(updateData)
        .eq('id', selectedDemanda.id);

      if (updateError) throw updateError;

      // Registrar Histórico
      const targetNameHist = transferTarget === 'prestador' 
        ? (prestadores.find(p => p.id === transferPrestadorId)?.nome_razao || 'Novo Prestador')
        : (colaboradores.find(c => c.id === transferColaboradorId)?.nome || 'Novo Colaborador');
      
      await addDemandHistory(
        selectedDemanda.id,
        'transferencia',
        `Demanda transferida de ${selectedDemanda.prestador?.nome_razao || selectedDemanda.colaborador?.nome || 'Fila'} para ${targetNameHist}. Motivo: ${transferReason}`,
        {
          prestadorDestinoId: transferTarget === 'prestador' ? transferPrestadorId : null,
          colaboradorDestinoId: transferTarget === 'colaborador' ? transferColaboradorId : null,
          valorProposto: transferTarget === 'prestador' ? parseFloat(transferValor) : null
        }
      );

      // Log in os_notas (Usando termos genéricos para privacidade conforme solicitado)
      let targetName = 'Equipe Interna';
      if (transferTarget === 'prestador') targetName = 'Equipe Externa';
      if (transferTarget === 'colaborador') targetName = 'Departamento Interno';

      const prevName = selectedDemanda.prestador_id ? 'Equipe Externa' : (selectedDemanda.colaborador_id ? 'Departamento Interno' : 'Equipe Interna');
      
      try {
        await supabase.from('os_notas').insert({
          os_id: selectedDemanda.os_id,
          nota: `Demanda transferida de "${prevName}" para "${targetName}".`
        }).throwOnError();
      } catch (error) {
        console.error('Erro ao adicionar nota na OS:', error);
        toast.error('Erro ao adicionar nota na OS.');
      }

      if (transferTarget === 'prestador') {
        await notificationService.notifyProvider(
          transferPrestadorId,
          '🆕 Nova Demanda Transferida',
          `Você recebeu uma nova demanda via transferência: ${selectedDemanda.titulo}.`,
          'demandas',
          'demanda_atribuida',
          { tab: 'abertas', itemId: selectedDemanda.id }
        );
      } else if (transferTarget === 'colaborador') {
        await notificationService.notifyAdmin(
          '🔄 Demanda Transferida',
          `A demanda "${selectedDemanda.titulo}" foi transferida para você.`,
          'demandas',
          'demanda_atribuida',
          { colaboradorId: transferColaboradorId, itemId: selectedDemanda.id, prioridade: 'alta' }
        );
      }

      toast.success('Demanda transferida com sucesso!');
      setIsTransferModalOpen(false);
      setIsDetailsModalOpen(false);

      await logService.logAction({
        acao: 'TRANSFERIR_DEMANDA_PRESTADOR',
        detalhes: JSON.stringify({ demanda_id: selectedDemanda.id, novo_alvo: transferTarget, motivo: transferReason }),
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador'
      });

      fetchDemandas();
    } catch (error) {
      console.error('Erro ao transferir demanda:', error);
      toast.error('Erro ao transferir demanda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelDemanda = async (demanda: any) => {
    setConfirmModal({ isOpen: true, demanda, type: 'cancel' });
  };

  const confirmCancelDemanda = async () => {
    const demanda = confirmModal.demanda;
    if (!demanda || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const data = await callAdminRpc<any>('gsa_admin_cancelar_demanda', {
        p_demanda_id: demanda.id,
        p_motivo: 'Cancelada pela administração via fluxo rápido.'
      });

      if (data && !data.success) throw new Error(data.error);

      // Histórico já registrado pela RPC segura

      toast.success('Demanda, OS e Orçamento cancelados com sucesso!');
      setIsDetailsModalOpen(false);
      fetchDemandas();
      setConfirmModal({ isOpen: false, demanda: null, type: 'cancel' });
    } catch (error: any) {
      console.error('Erro ao cancelar demanda:', error);
      toast.error(error.message || 'Erro ao cancelar demanda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelDemandaWithReason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDemanda || !cancelReason || isSubmitting) {
      if (!cancelReason && !isSubmitting) toast.error('Informe o motivo do cancelamento.');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await callAdminRpc<any>('gsa_admin_cancelar_demanda', {
        p_demanda_id: selectedDemanda.id,
        p_motivo: cancelReason
      });

      if (data && !data.success) throw new Error(data.error);

      // Registrar Histórico
      await addDemandHistory(
        selectedDemanda.id,
        'cancelamento',
        `Demanda cancelada pela administração. Motivo: ${cancelReason}`
      );

      if (selectedDemanda.prestador_id) {
        await notificationService.notifyProvider(
          selectedDemanda.prestador_id,
          '❌ Demanda Cancelada',
          `A demanda ${selectedDemanda.titulo} foi cancelada pela administração.`,
          'demandas',
          'demanda_cancelada',
          { tab: 'canceladas', itemId: selectedDemanda.id }
        );
      }

      toast.success('Demanda e Ordem de Serviço canceladas com sucesso!');
      setIsCancelWithReasonModalOpen(false);
      setIsDetailsModalOpen(false);
      setCancelReason('');
      fetchDemandas();
    } catch (error: any) {
      console.error('Erro ao cancelar demanda com motivo:', error);
      toast.error(error.message || 'Erro ao processar o cancelamento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDemanda = async (demanda: any) => {
    if (isSubmitting) return;
    if (!await confirm({ title: 'Atenção', message: 'Atenção: A "Exclusão" de uma demanda agora realizará o CANCELAMENTO em cascata da Demanda, OS e Orçamento para preservar os logs do sistema. Deseja prosseguir?' })) return;
    
    setIsSubmitting(true);
    try {
      const data = await callAdminRpc<any>('gsa_admin_cancelar_demanda', {
        p_demanda_id: demanda.id,
        p_motivo: 'Cancelamento via função de exclusão administrativa (registros preservados).'
      });

      if (data && !data.success) throw new Error(data.error);

      toast.success('Demanda, OS e Orçamento cancelados com sucesso!');
      setIsDetailsModalOpen(false);
      fetchDemandas();
    } catch (error: any) {
      console.error('Erro ao cancelar demanda:', error);
      toast.error(error.message || 'Erro ao processar o cancelamento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const demandasAguardandoFinalizacao = demandas.filter(d => d.status === 'concluida_interna').length;

  const filteredDemandas = demandas.filter(d => {
    if (activeTab === 'abertas') return d.status === 'aberta' || d.status === 'em_negociacao' || d.status === 'contraproposta_prestador' || d.status === 'contraproposta_admin_final';
    if (activeTab === 'ativas') return d.status === 'ativa' || d.status === 'aguardando_atribuicao' || d.status === 'em_analise' || d.status === 'em_ajuste' || d.status === 'aguardando_aceite' || d.status === 'concluida' || d.status === 'concluida_interna';
    if (activeTab === 'concluidas') return d.status === 'finalizada' || d.status === 'recusada';
    if (activeTab === 'canceladas') return d.status === 'cancelada';
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h2 className="text-2xl font-black text-neutral-900 uppercase tracking-tight">Gestão de Demandas</h2>
          <p className="text-sm text-neutral-500 font-medium">Acompanhe e gerencie ordens de serviço e demandas externas.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#1a1a1a] px-6 py-3 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-black/10 hover:bg-black transition-all active:scale-95"
          >
            <Plus className="h-5 w-5" />
            Nova Demanda
          </button>
        </div>
      </div>

      {/* Banner: Demandas aguardando finalização (devolvidas pela Gestão Interna) */}
      {demandasAguardandoFinalizacao > 0 && (
        <div className="flex items-center gap-3 bg-lime-50 border border-lime-300 rounded-2xl px-5 py-3.5 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-lime-500 text-white shrink-0 animate-pulse">
            <CheckCircle className="h-4 w-4" />
          </div>
          <p className="text-sm font-bold text-lime-800 flex-1">
            ⚡ {demandasAguardandoFinalizacao} demanda(s) concluída(s) pela <strong>Gestão Interna</strong> aguardando sua finalização!
          </p>
          <button
            onClick={() => setActiveTab('ativas')}
            className="text-xs font-black bg-lime-600 text-white px-4 py-1.5 rounded-xl hover:bg-lime-700 transition-all whitespace-nowrap shadow-sm"
          >
            Ver Ativas →
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        {activeTab === 'suporte' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-6 py-4 font-medium">OS / Demanda</th>
                  <th className="px-6 py-4 font-medium">Prestador</th>
                  <th className="px-6 py-4 font-medium">Mensagem</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {suportes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-neutral-500">
                      Nenhum chamado de suporte encontrado.
                    </td>
                  </tr>
                ) : (
                  suportes.map((suporte) => (
                    <tr key={suporte.id} className="transition-colors hover:bg-neutral-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-neutral-900">{suporte.demanda?.ordem_servico?.codigo_os || 'N/A'}</div>
                        <div className="text-xs text-neutral-500">{suporte.demanda?.titulo || 'Sem título'}</div>
                      </td>
                      <td className="px-6 py-4 text-neutral-600">
                        {suporte.prestador?.nome_razao || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-neutral-600 max-w-xs truncate" title={suporte.mensagem}>
                        {suporte.mensagem}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          suporte.status === 'aberto' ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20' :
                          suporte.status === 'em_andamento' ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20' :
                          'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20'
                        }`}>
                          {suporte.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {suporte.status !== 'concluido' && (
                          <button
                            onClick={() => {
                              setSelectedSuporte(suporte);
                              setIsSupportModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                          >
                            <MessageSquare className="h-3 w-3" />
                            Responder
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-6 py-4 font-medium">OS / Título</th>
                  <th className="px-6 py-4 font-medium">Data</th>
                  <th className="px-6 py-4 font-medium">Prestador</th>
                  <th className="px-6 py-4 font-medium">Valor Proposto</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-neutral-500">
                      <div className="flex justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#1a1a1a] border-t-transparent"></div></div>
                    </td>
                  </tr>
                ) : filteredDemandas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-neutral-500">
                      Nenhuma demanda encontrada nesta aba.
                    </td>
                  </tr>
                ) : (
                  filteredDemandas.map((demanda) => (
                    <tr 
                      key={demanda.id} 
                      id={`demand-${demanda.id}`}
                      className={`transition-colors duration-300 ${
                        highlightedId === demanda.id 
                          ? 'bg-indigo-50/80 ring-2 ring-indigo-500 z-10' 
                          : 'hover:bg-neutral-50'
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-neutral-900">{demanda.ordem_servico?.codigo_os || 'N/A'}</div>
                        {demanda.codigo_demanda && (
                          <span className="inline-block mt-1 font-mono text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md ring-1 ring-indigo-100">
                            {demanda.codigo_demanda}
                          </span>
                        )}
                        <div className="text-xs text-neutral-500">{demanda.ordem_servico?.orcamento?.servico?.nome || 'Sem título'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-neutral-900">{formatDate(demanda.created_at)}</div>
                        <div className="text-[10px] text-neutral-500">{formatDateTime(demanda.created_at)}</div>
                      </td>
                      <td className="px-6 py-4 text-neutral-600">
                        {demanda.prestador?.nome_razao || demanda.colaborador?.nome || 'Não atribuído'}
                      </td>
                      <td className="px-6 py-4 text-neutral-600">
                        {formatCurrency(demanda.valor_proposto_admin || 0)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                          demanda.status === 'aberta' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' :
                          demanda.status === 'ativa' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' :
                          demanda.status === 'em_negociacao' ? 'bg-indigo-50 text-indigo-700 ring-indigo-600/20' :
                          demanda.status === 'contraproposta_prestador' ? 'bg-blue-600 text-white ring-blue-700' :
                          demanda.status === 'contraproposta_admin_final' ? 'bg-orange-100 text-orange-800 ring-orange-600/20' :
                          demanda.status === 'em_analise' ? 'bg-amber-50 text-amber-700 ring-amber-600/20' :
                          demanda.status === 'em_ajuste' ? 'bg-orange-50 text-orange-700 ring-orange-600/20' :
                          demanda.status === 'concluida' || demanda.status === 'finalizada' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' :
                          demanda.status === 'concluida_interna' ? 'bg-violet-100 text-violet-700 ring-violet-600/20 animate-pulse' :
                          demanda.status === 'cancelada' ? 'bg-red-50 text-red-700 ring-red-600/20' :
                          'bg-neutral-50 text-neutral-700 ring-neutral-600/20'
                        }`}>
                          {demanda.status === 'concluida_interna' ? 'Em Análise (Vendas)' : (demanda.status === 'finalizada' || demanda.status === 'concluida' ? 'Concluída' : (demanda.status?.replace(/_/g, ' ') || '—'))}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => {
                            setSelectedDemanda(demanda);
                            if (demanda.status === 'aberta') {
                              // Pre-fill details with OS info
                              const os = demanda.ordem_servico;
                              const orcamento = os?.orcamento;
                              const info = `Demanda Nº: #${demanda.id.slice(0, 8)}\nOS Nº: ${os?.codigo_os || 'N/A'}\nOrçamento Nº: ${orcamento?.codigo_orcamento || 'N/A'}\nCliente: ${os?.cliente?.nome || 'N/A'}\nServiço: ${orcamento?.servico?.nome || 'N/A'}\n\nDetalhes do Orçamento:\n${orcamento?.observacoes_servico || orcamento?.descricao_adicional || 'Sem detalhes adicionais'}`;
                              setDetalhes(info);
                              setIsAssignModalOpen(true);
                            } else {
                              setIsDetailsModalOpen(true);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50"
                        >
                          {demanda.status === 'aberta' ? (
                            <>
                              <CheckCircle className="h-4 w-4" />
                              Direcionar
                            </>
                          ) : (
                            <>
                              <FileText className="h-4 w-4" />
                              Detalhes
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedDemanda(null);
          setActiveDetailsTab('geral');
        }}
        title="Detalhes da Demanda"
        size="full"
      >
        {selectedDemanda && (
          <div className="flex flex-col h-full bg-neutral-50/50 -m-6">
            {/* Modal Header Premium */}
            <div className="bg-white px-4 py-4 sm:px-8 sm:py-6 border-b border-neutral-200">
              <div className="flex flex-col lg:flex-row items-center justify-between gap-4 lg:gap-8">
                <div className="flex items-center gap-4 sm:gap-6 w-full lg:w-auto">
                  <div className={`flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-[1.5rem] sm:rounded-[2rem] shadow-sm ring-1 ring-black/5 shrink-0 ${
                    selectedDemanda.status === 'concluida' ? 'bg-emerald-50 text-emerald-600' : 
                    selectedDemanda.status === 'cancelada' ? 'bg-red-50 text-red-600' :
                    'bg-indigo-50 text-indigo-600'
                  }`}>
                    <Briefcase className="h-6 w-6 sm:h-8 sm:w-8" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg sm:text-2xl font-black text-neutral-900 uppercase tracking-tight truncate">
                      {selectedDemanda.ordem_servico?.orcamento?.servico?.nome || selectedDemanda.titulo}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
                      <span className="font-mono text-[8px] sm:text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg ring-1 ring-indigo-100">
                        OS: {selectedDemanda.ordem_servico?.codigo_os || 'N/A'}
                      </span>
                      <span className="font-mono text-[8px] sm:text-[10px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg ring-1 ring-purple-100">
                        {selectedDemanda.codigo_demanda || `#${selectedDemanda.id.slice(0, 8)}`}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 sm:px-3 sm:py-1 text-[8px] sm:text-[10px] font-black uppercase tracking-widest ${
                        selectedDemanda.status === 'concluida' || selectedDemanda.status === 'finalizada' ? 'bg-emerald-50 text-emerald-600' : 
                        selectedDemanda.status === 'concluida_interna' ? 'bg-violet-100 text-violet-700 animate-pulse' :
                        selectedDemanda.status === 'aberta' ? 'bg-amber-50 text-amber-600' :
                        selectedDemanda.status === 'contraproposta_prestador' ? 'bg-blue-600 text-white' :
                        selectedDemanda.status === 'contraproposta_admin_final' ? 'bg-orange-100 text-orange-800' :
                        selectedDemanda.status === 'cancelada' ? 'bg-red-50 text-red-600' :
                        'bg-indigo-50 text-indigo-600'
                      }`}>
                        {selectedDemanda.status === 'concluida_interna' ? 'AGUARDANDO FINALIZAÇÃO (VENDAS)' : (selectedDemanda.status === 'finalizada' || selectedDemanda.status === 'concluida' ? 'CONCLUÍDA' : (selectedDemanda.status?.replace(/_/g, ' ') || '—').toUpperCase())}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center justify-center lg:justify-end gap-2 sm:gap-3 w-full lg:w-auto mt-2 lg:mt-0 pt-3 lg:pt-0 border-t border-neutral-100 lg:border-t-0">
                  {selectedDemanda.status === 'contraproposta_prestador' && (
                    <>
                      <button
                        onClick={() => handleAcceptCounterProposal(selectedDemanda)}
                        disabled={isSubmitting}
                        className="flex-1 lg:flex-none flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-[10px] sm:text-xs font-bold text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all"
                      >
                        <CheckCircle className="h-4 w-4" />
                        <span className="whitespace-nowrap">Aprovar Contraproposta</span>
                      </button>
                      <button
                        onClick={() => {
                          setCounterValue(selectedDemanda.valor_proposto_admin?.toString() || '');
                          setIsCounterModalOpen(true);
                        }}
                        disabled={isSubmitting}
                        className="flex-1 lg:flex-none flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-[10px] sm:text-xs font-bold text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all"
                      >
                        <MessageSquare className="h-4 w-4" />
                        <span className="whitespace-nowrap">Nova Proposta</span>
                      </button>
                    </>
                  )}
                  {(selectedDemanda.status === 'ativa' || selectedDemanda.status === 'aguardando_atribuicao') && (
                    <button
                      onClick={() => handleFinalizeDemanda(selectedDemanda)}
                      disabled={isSubmitting || !!selectedDemanda.colaborador_id || selectedDemanda.status === 'aguardando_atribuicao'}
                      className={`flex-1 lg:flex-none flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-lg transition-all ${
                        (selectedDemanda.colaborador_id || selectedDemanda.status === 'aguardando_atribuicao')
                          ? 'bg-neutral-400 cursor-not-allowed shadow-none' 
                          : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                      }`}
                      title={(selectedDemanda.colaborador_id || selectedDemanda.status === 'aguardando_atribuicao') ? 'Esta demanda está sob gestão interna. A conclusão deve ser feita no módulo de Gestão Interna.' : ''}
                    >
                      <CheckCircle className="h-4 w-4" />
                      {(selectedDemanda.colaborador_id || selectedDemanda.status === 'aguardando_atribuicao') ? 'Gestão Interna (Triagem/Ativa)' : 'Finalizar Demanda'}
                    </button>
                  )}
                  {selectedDemanda.status === 'concluida_interna' && (
                    <button
                      onClick={() => handleFinalizeDemanda(selectedDemanda)}
                      disabled={isSubmitting}
                      className="flex-1 lg:flex-none flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-lg transition-all bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20 animate-pulse"
                      title="A Gestão Interna aprovou esta demanda. Clique para concluir oficialmente."
                    >
                      <CheckCircle className="h-4 w-4" />
                      ✅ Concluir Demanda
                    </button>
                  )}
                  {selectedDemanda.status === 'em_analise' && (
                    <button
                      onClick={() => handleFinalizeDemanda(selectedDemanda)}
                      disabled={isSubmitting || !!selectedDemanda.colaborador_id}
                      className={`flex-1 lg:flex-none flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-lg transition-all ${
                        selectedDemanda.colaborador_id 
                          ? 'bg-neutral-400 cursor-not-allowed shadow-none' 
                          : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                      }`}
                      title={selectedDemanda.colaborador_id ? 'Esta entrega deve ser aprovada no módulo de Gestão Interna.' : ''}
                    >
                      <CheckCircle className="h-4 w-4" />
                      {selectedDemanda.colaborador_id ? 'Gestão Interna (Análise)' : 'Aprovar Entrega'}
                    </button>
                  )}
                  {selectedDemanda.status === 'concluida' && (
                    <button
                      onClick={() => handleFinalizeDemanda(selectedDemanda)}
                      disabled={isSubmitting}
                      className="flex-1 lg:flex-none flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-lg transition-all bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Concluir Demanda
                    </button>
                  )}

                  {(selectedDemanda.status === 'finalizada' || selectedDemanda.status === 'concluida') && (
                    <div className="flex items-center gap-3 px-6 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Demanda Finalizada Oficialmente</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
              {/* Sidebar Tabs */}
              <div className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-neutral-200 p-2 sm:p-4 flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible custom-scrollbar">
                {[
                  { id: 'geral', label: 'Geral', icon: Info },
                  { id: 'execucao', label: 'Execução', icon: Clock, hidden: selectedDemanda.status === 'finalizada' || selectedDemanda.status === 'concluida' },
                  { id: 'entrega', label: 'Entrega', icon: CheckCircle, hidden: selectedDemanda.status === 'finalizada' || selectedDemanda.status === 'concluida' },
                  { id: 'suporte_cliente', label: 'Suporte Cliente', icon: MessageSquare, hidden: !selectedDemanda.os_id },
                  { id: 'historico', label: 'Histórico', icon: History }
                ].filter(t => !t.hidden).map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveDetailsTab(tab.id as any)}
                      className={`flex-1 lg:flex-none flex items-center justify-center lg:justify-start gap-2 lg:gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-[1.25rem] lg:rounded-xl text-[10px] sm:text-sm font-bold transition-all whitespace-nowrap ${
                        activeDetailsTab === tab.id 
                          ? 'bg-indigo-50 text-indigo-600 shadow-sm ring-1 ring-indigo-100' 
                          : 'text-neutral-500 hover:bg-neutral-50'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar">
                {activeDetailsTab === 'suporte_cliente' && selectedDemanda.os_id && (
                  <div className="animate-in fade-in slide-in-from-right-4 h-full">
                     <AdminOSSuporteChat osId={selectedDemanda.os_id} remetenteId={colaboradorId || null} remetenteNome={colaboradorNome || 'Admin'} clienteId={selectedDemanda.ordem_servico?.cliente_id} isConcluida={selectedDemanda.status === 'concluida' || selectedDemanda.status === 'concluida_interna'} />
                  </div>
                )}

                {activeDetailsTab === 'geral' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                        <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Vínculos</p>
                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase">Ordem de Serviço</p>
                            <p className="text-sm font-black text-neutral-900">{selectedDemanda.ordem_servico?.codigo_os || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase">Cliente</p>
                            <p className="text-sm font-black text-neutral-900">{selectedDemanda.ordem_servico?.cliente?.nome || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase">Status do Sistema</p>
                            <p className="text-sm font-black text-indigo-600 uppercase tracking-wide">{selectedDemanda.status.replace('_', ' ')}</p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                        <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Datas e Prazos</p>
                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase">Data de Criação</p>
                            <p className="text-sm font-black text-neutral-900">{new Date(selectedDemanda.created_at).toLocaleString('pt-BR')}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase">Previsão de Entrega</p>
                            <p className="text-sm font-black text-neutral-900">
                              {selectedDemanda.prazo_entrega ? formatDate(selectedDemanda.prazo_entrega) : 'Não definido'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                        <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Financeiro</p>
                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] font-bold text-neutral-400 uppercase">Valor Orçado (Admin)</p>
                            <p className="text-sm font-black text-neutral-900">{formatCurrency(selectedDemanda.valor_proposto_admin || 0)}</p>
                          </div>
                          {selectedDemanda.valor_proposto_prestador && (
                            <div className="pt-2">
                              <p className="text-[10px] font-bold text-blue-500 uppercase">Proposta do Prestador</p>
                              <p className="text-sm font-black text-blue-700">{formatCurrency(selectedDemanda.valor_proposto_prestador)}</p>
                            </div>
                          )}
                          {selectedDemanda.valor_final && (
                            <div>
                              <p className="text-[10px] font-bold text-neutral-400 uppercase">Valor Final (Acordado)</p>
                              <p className="text-sm font-black text-emerald-600">{formatCurrency(selectedDemanda.valor_final)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Descrição Original da Demanda</p>
                      <p className="text-sm text-neutral-600 leading-relaxed font-medium whitespace-pre-wrap">
                        {selectedDemanda.descricao || 'Nenhuma descrição detalhada fornecida na criação desta demanda.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {selectedDemanda.arquivos_briefing && Array.isArray(selectedDemanda.arquivos_briefing) && selectedDemanda.arquivos_briefing.length > 0 && (
                        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">📎 Anexos do Cliente (Briefing)</p>
                          <div className="space-y-2">
                            {selectedDemanda.arquivos_briefing.map((item: any, i: number) => {
                              const url = typeof item === 'string' ? item : item.url;
                              const nome = typeof item === 'string' ? `Briefing ${i + 1}` : item.nome || `Briefing ${i + 1}`;
                              return (
                                <button key={i} type="button" onClick={() => openFile(url, nome)} className="w-full flex items-center gap-3 p-3 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-all border border-indigo-100 text-left">
                                  <Upload className="h-4 w-4 shrink-0" />
                                  <span className="text-xs font-bold truncate">{nome}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {selectedDemanda.arquivos_transferencia && Array.isArray(selectedDemanda.arquivos_transferencia) && selectedDemanda.arquivos_transferencia.length > 0 && (
                        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">🔄 Anexos de Transferência</p>
                          <div className="space-y-2">
                            {selectedDemanda.arquivos_transferencia.map((url: string, i: number) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all border border-amber-100">
                                <Paperclip className="h-4 w-4 shrink-0" />
                                <span className="text-xs font-bold truncate">Anexo de Transferência {i + 1}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Banner de Progresso — Gestão Interna */}
                    {(selectedDemanda.status === 'aguardando_atribuicao' || 
                      selectedDemanda.status === 'concluida_interna' || 
                      (selectedDemanda.status === 'ativa' && !selectedDemanda.prestador_id)) && (
                      <div className="rounded-3xl bg-gradient-to-r from-indigo-50 via-violet-50 to-purple-50 p-6 ring-1 ring-indigo-200 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="h-9 w-9 rounded-xl bg-indigo-100 flex items-center justify-center">
                            <Briefcase className="h-4 w-4 text-indigo-600" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Acompanhamento — Gestão Interna</p>
                            <p className="text-xs font-bold text-indigo-700">Esta demanda está sendo tratada pela equipe interna</p>
                          </div>
                        </div>

                        {/* Stepper Visual */}
                        <div className="flex items-center gap-0 mb-4">
                          {[
                            { label: 'Recebida', done: true },
                            { label: 'Em Execução', done: selectedDemanda.status === 'ativa' || selectedDemanda.status === 'concluida_interna' },
                            { label: 'Entrega Realizada', done: selectedDemanda.status === 'concluida_interna' },
                          ].map((step, i) => (
                            <div key={i} className="flex items-center flex-1">
                              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 transition-all ${
                                step.done 
                                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' 
                                  : 'bg-white text-neutral-400 ring-2 ring-neutral-200'
                              }`}>
                                {step.done ? '✓' : i + 1}
                              </div>
                              {i < 2 && <div className={`flex-1 h-0.5 mx-1 rounded-full transition-all ${step.done ? 'bg-indigo-400' : 'bg-neutral-200'}`} />}
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between px-1">
                          <span className="text-[9px] font-bold text-indigo-500 uppercase">Recebida</span>
                          <span className="text-[9px] font-bold text-indigo-500 uppercase">Em Execução</span>
                          <span className="text-[9px] font-bold text-indigo-500 uppercase">Concluída</span>
                        </div>

                        {/* Info contextual */}
                        <div className="mt-4 pt-3 border-t border-indigo-200/60">
                          {selectedDemanda.status === 'aguardando_atribuicao' && (
                            <p className="text-xs text-indigo-600 font-medium">
                              ⏳ A demanda está aguardando um membro da equipe interna assumir a execução. Nenhuma ação necessária aqui no módulo Vendas até a conclusão.
                            </p>
                          )}
                          {selectedDemanda.status === 'ativa' && !selectedDemanda.prestador_id && (
                            <p className="text-xs text-indigo-600 font-medium">
                              🛠️ A equipe interna assumiu e está executando esta demanda. Você será notificado assim que ela for concluída.
                              {selectedDemanda.data_inicio && <span className="block mt-1 text-indigo-400">Iniciada em: {new Date(selectedDemanda.data_inicio).toLocaleString('pt-BR')}</span>}
                            </p>
                          )}
                          {selectedDemanda.status === 'concluida_interna' && (
                            <p className="text-xs text-emerald-700 font-bold">
                              ✅ A Gestão Interna concluiu o atendimento desta demanda! Use o botão "Concluir Demanda" acima para finalizar oficialmente (gerar fatura, concluir OS).
                              {selectedDemanda.data_conclusao && <span className="block mt-1 font-medium text-emerald-500">Concluída em: {new Date(selectedDemanda.data_conclusao).toLocaleString('pt-BR')}</span>}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedDemanda.status === 'aberta' && (
                      <div className="pt-6 border-t border-neutral-200">
                         <button
                          onClick={() => {
                            setIsDetailsModalOpen(false);
                            setIsAssignModalOpen(true);
                          }}
                          className="w-full rounded-2xl bg-[#1a1a1a] py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl hover:bg-black transition-all flex items-center justify-center gap-3"
                        >
                          <Plus className="h-4 w-4" />
                          Direcionar Agora para Prestador ou Equipe
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {activeDetailsTab === 'execucao' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Responsável pela Execução</p>
                          <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-xl">
                              {(selectedDemanda.prestador?.nome_razao || selectedDemanda.colaborador?.nome || 'G')[0]}
                            </div>
                            <div>
                              <p className="text-sm font-black text-neutral-900">
                                {selectedDemanda.prestador?.nome_razao || selectedDemanda.colaborador?.nome || (selectedDemanda.status === 'ativa' || selectedDemanda.status === 'concluida_interna' ? 'Equipe Interna GSA (Admin)' : 'Aguardando Atribuição — Gestão Interna')}
                              </p>
                              <p className="text-[10px] font-bold text-neutral-400 uppercase">
                                {selectedDemanda.prestador_id ? 'Prestador Externo' : (selectedDemanda.colaborador_id ? 'Colaborador Interno' : (selectedDemanda.status === 'ativa' || selectedDemanda.status === 'concluida_interna' ? 'Execução Direta pela Administração' : 'Pool Central — Gestão Interna'))}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Prazos de Execução</p>
                          <div className="space-y-4">
                            <div>
                              <p className="text-[10px] font-bold text-neutral-400 uppercase">Início do Trabalho</p>
                              <p className="text-sm font-black text-neutral-900">
                                {selectedDemanda.data_inicio ? new Date(selectedDemanda.data_inicio).toLocaleString('pt-BR') : 'Ainda não iniciado'}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-neutral-400 uppercase">Prazo Prometido</p>
                              <p className="text-sm font-black text-indigo-600">
                                {selectedDemanda.prazo_entrega ? formatDate(selectedDemanda.prazo_entrega) : 'Não definido'}
                              </p>
                            </div>
                          </div>
                        </div>
                     </div>

                     <div className="rounded-3xl bg-neutral-900 p-8 text-white shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-indigo-500/20 rounded-full blur-2xl transition-transform group-hover:scale-150"></div>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4 relative z-10">Instruções de Direcionamento</p>
                        <p className="text-base font-medium leading-relaxed relative z-10 whitespace-pre-wrap">
                          {selectedDemanda.detalhes || 'Sem instruções específicas fornecidas para esta execução.'}
                        </p>
                        
                        {(selectedDemanda.motivo_negociacao || selectedDemanda.valor_proposto_prestador) && (
                          <div className="mt-6 pt-6 border-t border-white/10 relative z-10">
                            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-2">Justificativa do Prestador (Negociação)</p>
                            <p className="text-sm font-medium italic text-neutral-300">
                              {selectedDemanda.motivo_negociacao || "O prestador solicitou um novo valor sem justificativa adicional."}
                            </p>
                          </div>
                        )}
                        
                        {selectedDemanda.arquivo_transferencia && (
                          <div className="mt-6 pt-6 border-t border-white/10 relative z-10">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3">Material de Apoio (Anexo)</p>
                            <a 
                              href={selectedDemanda.arquivo_transferencia} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-3 rounded-2xl bg-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-white/20 transition-all backdrop-blur-sm border border-white/10"
                            >
                              <Upload className="h-4 w-4" />
                              Explorar Documento Anexo
                            </a>
                          </div>
                        )}
                     </div>

                     {selectedDemanda.status === 'ativa' && (
                       <div className="flex flex-wrap gap-4 pt-4">
                         {!selectedDemanda.prestador_id && (
                            <button
                              onClick={() => {
                                setTransferTarget('prestador');
                                setTransferPrestadorId('');
                                setTransferColaboradorId('');
                                setTransferReason('');
                                setTransferFile(null);
                                setTransferValor(selectedDemanda.valor_final?.toString() || selectedDemanda.valor_proposto_admin?.toString() || '');
                                setIsTransferModalOpen(true);
                              }}
                              className="flex-1 rounded-2xl border border-indigo-200 bg-indigo-50 py-4 text-xs font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                            >
                              <Plus className="h-4 w-4" />
                              Transferir para Terceiro
                            </button>
                         )}
                         <button
                            onClick={() => handleDeleteDemanda(selectedDemanda)}
                            className="flex-1 rounded-2xl border border-red-200 bg-red-50 py-4 text-xs font-black uppercase tracking-widest text-red-600 hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                          >
                            <Trash2 className="h-4 w-4" />
                            Cancelar e Excluir
                          </button>
                       </div>
                     )}
                  </div>
                )}

                {activeDetailsTab === 'entrega' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    {(selectedDemanda.data_entrega_prestador || (selectedDemanda.status === 'concluida_interna' && selectedDemanda.data_conclusao)) ? (
                      <div className="space-y-6">
                        <div className={`rounded-3xl p-8 border shadow-sm relative overflow-hidden ${
                          selectedDemanda.status === 'concluida_interna' 
                            ? 'bg-lime-50 border-lime-200' 
                            : 'bg-amber-50 border-amber-200'
                        }`}>
                          <div className="absolute top-0 right-0 p-4 opacity-10">
                            <Clock className={`h-20 w-20 ${selectedDemanda.status === 'concluida_interna' ? 'text-lime-900' : 'text-amber-900'}`} />
                          </div>
                          <div className="relative z-10">
                            <h5 className={`text-xl font-black uppercase tracking-tight mb-4 flex items-center gap-3 ${
                              selectedDemanda.status === 'concluida_interna' ? 'text-violet-900' : 'text-amber-900'
                            }`}>
                              {selectedDemanda.status === 'concluida_interna' ? (
                                <><CheckCircle className="h-6 w-6" /> Entrega Realizada pela Gestão Interna</>
                              ) : (
                                <><AlertCircle className="h-6 w-6" /> Entrega Pendente de Avaliação</>
                              )}
                            </h5>
                            <p className={`text-sm font-medium mb-6 ${
                              selectedDemanda.status === 'concluida_interna' ? 'text-violet-800' : 'text-amber-800'
                            }`}>
                              {selectedDemanda.status === 'concluida_interna' ? (
                                <>A equipe interna entregou esta demanda em <strong>{new Date(selectedDemanda.data_conclusao).toLocaleString('pt-BR')}</strong>. Analise o resultado e finalize oficialmente no botão acima.</>
                              ) : (
                                <>O serviço foi entregue em <strong>{new Date(selectedDemanda.data_entrega_prestador).toLocaleString('pt-BR')}</strong>. Analise os materiais abaixo antes de finalizar definitivamente.</>
                              )}
                            </p>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {selectedDemanda.link_resultado && (
                                <a href={selectedDemanda.link_resultado} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 rounded-2xl bg-white p-4 text-sm font-bold text-blue-700 shadow-sm border border-blue-200 hover:shadow-md transition-all">
                                  <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                                    <FileText className="h-5 w-5" />
                                  </div>
                                  Link da Entrega
                                </a>
                              )}
                              {/* Arquivos da Gestão Interna (array) */}
                              {selectedDemanda.arquivos_resultado && Array.isArray(selectedDemanda.arquivos_resultado) && selectedDemanda.arquivos_resultado.map((url: string, idx: number) => (
                                <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 rounded-2xl bg-white p-4 text-sm font-bold text-violet-700 shadow-sm border border-violet-200 hover:shadow-md transition-all">
                                  <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-500">
                                    <File className="h-5 w-5" />
                                  </div>
                                  Anexo Interno #{idx + 1}
                                </a>
                              ))}
                            </div>
                          </div>
                        </div>

                        {selectedDemanda.observacao_entrega && (
                           <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                             <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Comentários do Prestador</p>
                             <p className="text-sm text-neutral-600 leading-relaxed font-medium italic">
                               "{selectedDemanda.observacao_entrega}"
                             </p>
                           </div>
                        )}

                        {selectedDemanda.status === 'em_analise' && (
                          <div className="flex gap-4 pt-4">
                            <button
                              onClick={() => setIsAjusteModalOpen(true)}
                              className="flex-1 rounded-2xl bg-amber-500 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 transition-all"
                            >
                              Solicitar Ajustes
                            </button>
                            <button
                              onClick={() => handleFinalizeDemanda(selectedDemanda)}
                              disabled={!!selectedDemanda.colaborador_id}
                              className={`flex-1 rounded-2xl py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-all ${
                                selectedDemanda.colaborador_id
                                  ? 'bg-neutral-400 cursor-not-allowed shadow-none'
                                  : 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700'
                              }`}
                              title={selectedDemanda.colaborador_id ? 'Aprovação sob responsabilidade da Gestão Interna.' : ''}
                            >
                              {selectedDemanda.colaborador_id ? 'Aprovação via Gestão Interna' : 'Aprovar e Concluir OS'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2.5rem] shadow-sm ring-1 ring-black/5 text-center px-8">
                         <Clock className="h-20 w-20 text-neutral-100 mb-6" />
                         <h4 className="text-xl font-black text-neutral-400 uppercase tracking-widest mb-2">Aguardando Entrega</h4>
                         <p className="text-neutral-400 max-w-md text-sm">
                           Os materiais resultantes desta demanda ainda não foram enviados pelo responsável. Assim que houver uma entrega, ela aparecerá aqui para sua revisão.
                         </p>
                         
                         {selectedDemanda.status === 'ativa' && !selectedDemanda.prestador_id && (
                            <button
                               onClick={() => handleFinalizeDemanda(selectedDemanda)}
                               disabled={!!selectedDemanda.colaborador_id}
                               className={`mt-8 rounded-2xl px-8 py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl transition-all flex items-center justify-center gap-3 ${
                                 selectedDemanda.colaborador_id
                                   ? 'bg-neutral-400 cursor-not-allowed shadow-none'
                                   : 'bg-indigo-600 shadow-indigo-600/20 hover:bg-indigo-700'
                               }`}
                               title={selectedDemanda.colaborador_id ? 'Responsabilidade da Gestão Interna.' : ''}
                             >
                               <Upload className="h-4 w-4" />
                               {selectedDemanda.colaborador_id ? 'Aguardando Gestão Interna' : 'Registrar Entrega Manual'}
                             </button>
                         )}
                      </div>
                    )}

                    {selectedDemanda.status === 'concluida' && selectedDemanda.data_conclusao && (
                      <div className="rounded-3xl bg-emerald-500 p-8 text-white shadow-2xl">
                         <div className="flex items-center gap-4 mb-4">
                            <div className="h-14 w-14 rounded-2xl bg-white/20 flex items-center justify-center">
                              <CheckCircle className="h-8 w-8 text-white" />
                            </div>
                            <div>
                               <h5 className="text-2xl font-black uppercase tracking-tight">Serviço Concluido</h5>
                               <p className="text-white/80 font-medium">Finalizado em {new Date(selectedDemanda.data_conclusao).toLocaleString('pt-BR')}</p>
                            </div>
                         </div>
                      </div>
                    )}

                    {selectedDemanda.status === 'concluida_interna' && selectedDemanda.data_conclusao && (
                      <div className="rounded-3xl bg-gradient-to-r from-lime-500 to-emerald-500 p-8 text-white shadow-2xl animate-in fade-in">
                         <div className="flex items-center gap-4 mb-4">
                            <div className="h-14 w-14 rounded-2xl bg-white/20 flex items-center justify-center animate-pulse">
                              <CheckCircle className="h-8 w-8 text-white" />
                            </div>
                            <div>
                               <h5 className="text-2xl font-black uppercase tracking-tight">Gestão Interna Concluiu</h5>
                               <p className="text-white/80 font-medium">Concluída em {new Date(selectedDemanda.data_conclusao).toLocaleString('pt-BR')}</p>
                            </div>
                         </div>
                         <div className="bg-white/15 rounded-2xl p-4 mt-2">
                           <p className="text-sm font-bold text-white/90">
                             ✅ A gestão interna aprovou esta demanda. Use o botão "Concluir Demanda" no topo para concluir oficialmente (OS, fatura e registros).
                           </p>
                         </div>
                      </div>
                    )}
                  </div>
                )}
                
                {activeDetailsTab === 'historico' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 pb-8">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-lg font-black text-neutral-900 uppercase tracking-tight">Linha do Tempo Operacional</h4>
                      <div className="px-3 py-1 rounded-full bg-neutral-100 text-[10px] font-black text-neutral-500 uppercase tracking-widest">
                        {historico.length} Eventos
                      </div>
                    </div>

                    {historico.length > 0 ? (
                      <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-indigo-500 before:via-neutral-200 before:to-transparent">
                        {historico.map((item, idx) => (
                          <div key={item.id} className="relative flex items-start gap-6 group">
                            <div className={`absolute left-0 mt-1.5 h-10 w-10 rounded-2xl flex items-center justify-center shadow-lg ring-4 ring-white z-10 transition-transform group-hover:scale-110 ${
                              idx === 0 ? 'bg-indigo-600 text-white' : 'bg-white text-neutral-400 ring-neutral-50'
                            }`}>
                              <Clock className="h-5 w-5" />
                            </div>
                            
                            <div className="flex-1 ml-12">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                                <p className={`text-sm font-black uppercase tracking-tight ${idx === 0 ? 'text-indigo-600' : 'text-neutral-900'}`}>
                                  {item.acao?.replace(/_/g, ' ') || 'Evento'}
                                </p>
                                <time className="text-[10px] font-bold text-neutral-400 whitespace-nowrap bg-neutral-50 px-2 py-1 rounded-lg border border-neutral-100">
                                  {new Date(item.created_at).toLocaleString('pt-BR')}
                                </time>
                              </div>
                              
                              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200 group-hover:ring-indigo-200 transition-all">
                                <p className="text-xs text-neutral-600 leading-relaxed font-medium">
                                  {item.detalhes}
                                </p>
                                <div className="mt-3 flex items-center gap-2 pt-3 border-t border-neutral-50">
                                  <div className="h-5 w-5 rounded-lg bg-neutral-100 flex items-center justify-center text-[8px] font-black text-neutral-500 uppercase">
                                    {(item.ator_nome || 'A')[0]}
                                  </div>
                                  <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                                    Por: {item.ator_nome || 'Sistema'} · {item.ator_tipo || 'Automático'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2.5rem] shadow-sm ring-1 ring-black/5 text-center px-8">
                         <History className="h-20 w-20 text-neutral-100 mb-6" />
                         <h4 className="text-xl font-black text-neutral-400 uppercase tracking-widest mb-2">Sem Histórico</h4>
                         <p className="text-neutral-400 max-w-md text-sm">
                           Não foram encontrados registros históricos para esta demanda. Todas as ações futuras serão registradas automaticamente aqui.
                         </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Contraproposta Modal */}
      <Modal
        isOpen={isCounterModalOpen}
        onClose={() => {
          setIsCounterModalOpen(false);
          setCounterValue('');
          setCounterReason('');
        }}
        title="Enviar Contraproposta Final"
        size="wide"
      >
        <form onSubmit={handleSendCounterProposal} className="space-y-4">
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Valor Proposto (R$) *
            </label>
            <input 
              type="number"
              required
              step="0.01"
              min="0"
              value={counterValue}
              inputMode="numeric"
onChange={(e) => setCounterValue(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 p-2.5 outline-none focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a]"
              placeholder="0.00"
            />
          </div>
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Motivo / Observação
            </label>
            <textarea
              value={counterReason}
              onChange={(e) => setCounterReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-neutral-300 p-2.5 outline-none focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a]"
              placeholder="Explique o motivo da contraproposta..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setIsCounterModalOpen(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-[#1a1a1a] px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
            >
              {isSubmitting ? 'Enviando...' : 'Enviar Contraproposta'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Direcionar Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => {
          setIsAssignModalOpen(false);
          resetAssignForm();
          setActiveAssignTab('direcionamento');
        }}
        title="Direcionar Demanda para Execução"
        size="full"
      >
        <form onSubmit={handleAssignPrestador} className="flex flex-col h-full bg-neutral-50/50 -m-6">
          {/* Modal Header Premium */}
          <div className="bg-white px-4 py-4 sm:px-8 sm:py-6 border-b border-neutral-200">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-[1.5rem] sm:rounded-[2rem] bg-indigo-50 text-indigo-600 shadow-sm ring-1 ring-black/5 shrink-0">
                  <UserPlus className="h-6 w-6 sm:h-8 sm:w-8" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-2xl font-black text-neutral-900 uppercase tracking-tight">
                    Direcionar Demanda
                  </h2>
                  <p className="text-[8px] sm:text-[10px] font-black text-neutral-400 uppercase tracking-widest mt-0.5 sm:mt-1">
                    Defina o responsável e condições
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setIsAssignModalOpen(false);
                    resetAssignForm();
                    setActiveAssignTab('direcionamento');
                  }}
                  className="flex-1 sm:flex-none rounded-xl px-4 py-2.5 text-xs font-bold text-neutral-500 hover:bg-neutral-100 transition-all border border-neutral-100 sm:border-transparent"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-xl bg-[#1a1a1a] px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-black/20 hover:bg-black transition-all"
                >
                  <CheckCircle className="h-4 w-4" />
                  {isSubmitting ? 'Processando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
            {/* Sidebar Tabs */}
            <div className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-neutral-200 p-2 sm:p-4 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible custom-scrollbar">
              {[
                { id: 'direcionamento', label: 'Direcionamento', icon: UserPlus },
                { id: 'info', label: 'Contexto', icon: Info }
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveAssignTab(tab.id as any)}
                    className={`flex-1 md:flex-none flex items-center justify-center md:justify-start gap-2 md:gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-[1rem] sm:rounded-xl text-[10px] sm:text-sm font-bold transition-all whitespace-nowrap ${
                      activeAssignTab === tab.id 
                        ? 'bg-indigo-50 text-indigo-600 shadow-sm ring-1 ring-indigo-100' 
                        : 'text-neutral-500 hover:bg-neutral-50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-12">
              <div className="max-w-6xl mx-auto">
                {activeAssignTab === 'direcionamento' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-neutral-200">
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-6">Responsável e Valores</p>
                      
                      <div className="space-y-6">
                        <div>
                          <label className="mb-2 block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">
                            Prestador de Serviço Selecionado *
                          </label>
                          <select
                            required
                            value={selectedPrestadorId}
                            onChange={(e) => setSelectedPrestadorId(e.target.value)}
                            className="w-full rounded-2xl bg-neutral-50 border-transparent px-5 py-4 text-sm font-bold text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                          >
                            <option value="">Direcionar para...</option>
                            <option value="gestao_interna" className="font-bold text-indigo-600 bg-indigo-50">🏢 Módulo Gestão Interna</option>
                          </select>
                        </div>

                        {selectedPrestadorId && selectedPrestadorId !== 'gestao_interna' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <label className="mb-2 block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">
                                Valor Proposto (R$) *
                              </label>
                              <div className="relative">
                                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400 font-bold">R$</span>
                                <input 
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  required
                                  value={valorProposto}
                                  inputMode="numeric"
onChange={(e) => setValorProposto(e.target.value)}
                                  className="w-full rounded-2xl bg-neutral-50 border-transparent pl-12 pr-5 py-4 text-sm font-black text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                                  placeholder="0,00"
                                />
                              </div>
                            </div>
                            
                            <div>
                              <label className="mb-2 block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">
                                Prazo para Entrega *
                              </label>
                              <input
                                type="datetime-local"
                                required
                                value={prazoEntrega}
                                onChange={(e) => setPrazoEntrega(e.target.value)}
                                className="w-full rounded-2xl bg-neutral-50 border-transparent px-5 py-4 text-sm font-bold text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedPrestadorId && selectedPrestadorId !== 'gestao_interna' && (
                      <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-neutral-200">
                        <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-6">Instruções para o Prestador</p>
                        <textarea
                          required
                          rows={6}
                          value={detalhes}
                          onChange={(e) => setDetalhes(e.target.value)}
                          className="w-full rounded-3xl bg-neutral-50 border-transparent px-5 py-4 text-sm font-medium text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200 resize-none"
                          placeholder="Descreva detalhadamente o que deve ser feito, links de referência, padrões de qualidade esperados..."
                        />
                      </div>
                    )}
                  </div>
                )}

                {activeAssignTab === 'info' && selectedDemanda && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Números de Referência</p>
                          <div className="space-y-3">
                             <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase">Demanda</span>
                                <span className="text-sm font-black text-neutral-900">#{selectedDemanda.id.slice(0, 8)}</span>
                             </div>
                             <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase">Código OS</span>
                                <span className="text-sm font-black text-indigo-600">{selectedDemanda.ordem_servico?.codigo_os || 'N/A'}</span>
                             </div>
                             <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase">Orçamento</span>
                                <span className="text-sm font-black text-neutral-900">{selectedDemanda.ordem_servico?.orcamento?.codigo_orcamento || 'N/A'}</span>
                             </div>
                          </div>
                       </div>

                       <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-neutral-200">
                          <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-4">Cliente e Serviço</p>
                          <div className="space-y-3">
                             <p className="text-[10px] font-bold text-neutral-400 uppercase">Cliente</p>
                             <p className="text-sm font-black text-neutral-900">{selectedDemanda.ordem_servico?.cliente?.nome || 'N/A'}</p>
                             <div className="h-[1px] bg-neutral-100 my-2"></div>
                             <p className="text-[10px] font-bold text-neutral-400 uppercase">Serviço</p>
                             <p className="text-sm font-black text-neutral-900">{selectedDemanda.ordem_servico?.orcamento?.servico?.nome || 'N/A'}</p>
                          </div>
                       </div>
                    </div>
                    
                    <div className="rounded-3xl bg-neutral-900 p-8 text-white shadow-2xl">
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4">Instruções Originais (OS)</p>
                        <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">
                          {selectedDemanda.ordem_servico?.orcamento?.observacoes_servico || selectedDemanda.ordem_servico?.orcamento?.descricao_adicional || 'Sem detalhes adicionais no orçamento original.'}
                        </p>
                    </div>

                    {selectedDemanda.descricao && (
                      <div className="rounded-3xl bg-indigo-50 p-6 border border-indigo-100">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Notas da Demanda</p>
                        <p className="text-sm text-indigo-900 font-medium italic">"{selectedDemanda.descricao}"</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal de Nova Demanda */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setNovaDemandaTitulo('');
          setNovaDemandaDescricao('');
          setNovaDemandaOsId('');
          setNovaDemandaArquivos([]);
        }}
        title="Nova Demanda"
        size="wide"
      >
        <form onSubmit={handleCreateDemanda} className="space-y-5">
          <div className="rounded-3xl bg-[#1a1a1a] p-5 text-white shadow-xl">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
                <PlusCircle className="h-6 w-6" />
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/40">Gestao interna</p>
                <h3 className="mt-1 text-xl font-black tracking-tight">Criar nova demanda</h3>
                <p className="mt-1 max-w-3xl text-sm font-medium text-white/55">
                  Registre a atividade interna, detalhe a entrega esperada e vincule uma OS quando existir contexto.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-5 shadow-sm">
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Título da Demanda *
            </label>
            <input
              type="text"
              required
              value={novaDemandaTitulo}
              onChange={(e) => setNovaDemandaTitulo(e.target.value)}
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-900 outline-none transition-all placeholder:text-neutral-400 focus:border-[#1a1a1a] focus:bg-white focus:ring-4 focus:ring-neutral-900/5"
              placeholder="Ex: Criação de Logotipo"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Descrição
            </label>
            <textarea
              rows={7}
              value={novaDemandaDescricao}
              onChange={(e) => setNovaDemandaDescricao(e.target.value)}
              className="w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-medium text-neutral-800 outline-none transition-all placeholder:text-neutral-400 focus:border-[#1a1a1a] focus:bg-white focus:ring-4 focus:ring-neutral-900/5"
              placeholder="Descreva os detalhes da demanda..."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Vincular a Ordem de Serviço (Opcional)
            </label>
            <div className="mb-5 rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 p-5 shadow-sm">
              <label className="mb-3 flex items-center gap-2 text-sm font-black text-neutral-700">
                <Paperclip className="h-4 w-4 text-neutral-400" />
                Anexos da demanda
              </label>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-white px-6 py-8 text-center transition-all hover:border-[#1a1a1a] hover:bg-neutral-50">
                <Upload className="mb-3 h-8 w-8 text-neutral-400" />
                <span className="text-sm font-black text-neutral-800">Clique para anexar arquivos</span>
                <span className="mt-1 text-xs font-medium text-neutral-500">PDF, imagens, documentos ou materiais de briefing</span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setNovaDemandaArquivos(prev => [...prev, ...files]);
                    e.currentTarget.value = '';
                  }}
                />
              </label>

              {novaDemandaArquivos.length > 0 && (
                <div className="mt-4 space-y-2">
                  {novaDemandaArquivos.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-neutral-200">
                      <div className="flex min-w-0 items-center gap-3">
                        <File className="h-4 w-4 shrink-0 text-indigo-500" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-neutral-800">{file.name}</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNovaDemandaArquivos(prev => prev.filter((_, i) => i !== index))}
                        className="rounded-xl p-2 text-neutral-400 transition-all hover:bg-rose-50 hover:text-rose-500"
                        title="Remover anexo"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <select
              value={novaDemandaOsId}
              onChange={(e) => setNovaDemandaOsId(e.target.value)}
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold text-neutral-800 outline-none transition-all focus:border-[#1a1a1a] focus:bg-white focus:ring-4 focus:ring-neutral-900/5"
            >
              <option value="">Não vincular</option>
              {ordensServico.map((os) => (
                <option key={os.id} value={os.id}>
                  {os.codigo_os} - {os.orcamentos?.servicos?.nome || 'Serviço'}
                </option>
              ))}
            </select>
          </div>

          <div className="sticky bottom-0 -mx-1 flex justify-end gap-3 border-t border-neutral-100 bg-white/95 px-1 pt-4 backdrop-blur">
            <button
              type="button"
              onClick={() => {
                setIsCreateModalOpen(false);
                setNovaDemandaTitulo('');
                setNovaDemandaDescricao('');
                setNovaDemandaOsId('');
                setNovaDemandaArquivos([]);
              }}
              className="rounded-2xl px-5 py-3 text-sm font-black text-neutral-600 transition-all hover:bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-2xl bg-[#1a1a1a] px-6 py-3 text-sm font-black text-white shadow-xl shadow-black/10 transition-all hover:bg-black disabled:opacity-50"
            >
              {isSubmitting ? 'Criando...' : 'Criar Demanda'}
            </button>
          </div>
        </form>
      </Modal>

      {selectedSuporte && (
        <SupportConversationModal
          isOpen={isSupportModalOpen}
          onClose={() => {
            setIsSupportModalOpen(false);
            setSelectedSuporte(null);
          }}
          suporte={selectedSuporte}
          onUpdate={fetchSuportes}
          autorId="00000000-0000-0000-0000-000000000000"
          autorTipo="admin"
        />
      )}
      {isAjusteModalOpen && (
        <Modal isOpen={isAjusteModalOpen} onClose={() => setIsAjusteModalOpen(false)} title="Solicitar Ajuste" size="wide">
          <form onSubmit={async (e) => {
            e.preventDefault();
            try {
              const { error } = await supabase.from('prestador_demandas').update({
                ajuste_solicitado: ajusteDescricao,
                prazo_ajuste: new Date(ajustePrazo).toISOString(),
                status_ajuste: 'solicitado',
                status: 'em_ajuste' // Re-open for adjustment
              }).eq('id', selectedDemanda.id);
              if (error) throw error;

              // Registrar Histórico
              await addDemandHistory(
                selectedDemanda.id,
                'ajuste',
                `Ajuste solicitado ao prestador. Motivo: ${ajusteDescricao}. Novo prazo sugerido: ${formatDate(ajustePrazo)}`
              );
              
              if (selectedDemanda.os_id) {
                try {
                  await supabase.from('os_notas').insert({
                    os_id: selectedDemanda.os_id,
                    nota: `Ajuste solicitado ao prestador pela administração.`
                  }).throwOnError();
                } catch (error) {
                  console.error('Erro ao adicionar nota na OS:', error);
                  toast.error('Erro ao adicionar nota na OS.');
                }
              }

              toast.success('Ajuste solicitado!');
              setIsAjusteModalOpen(false);
              setIsDetailsModalOpen(false);
              await logService.logAction({
                acao: 'SOLICITAR_AJUSTE_DEMANDA',
                detalhes: JSON.stringify({ motivo: ajusteDescricao, prazo: ajustePrazo }),
                ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
                ator_nome: colaboradorNome || 'Administrador'
              });

              fetchDemandas();
            } catch (error) {
              toast.error('Erro ao solicitar ajuste.');
            }
          }} className="space-y-4">
            <textarea value={ajusteDescricao} onChange={e => setAjusteDescricao(e.target.value)} className="w-full rounded-lg border p-2" placeholder="Descreva o ajuste necessário..." required />
            <input type="datetime-local" value={ajustePrazo} onChange={e => setAjustePrazo(e.target.value)} className="w-full rounded-lg border p-2" required />
            <button type="submit" className="w-full rounded-lg bg-amber-600 p-2 text-white">Enviar Solicitação</button>
          </form>
        </Modal>
      )}
      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, demanda: null, type: 'finalize' })}
        title={confirmModal.type === 'finalize' ? 'Finalizar Demanda' : 'Cancelar Demanda'}
        size="wide"
      >
        <div className="space-y-4">
          <p className="text-neutral-600">
            {confirmModal.type === 'finalize' 
              ? (confirmModal.demanda?.colaborador_id 
                  ? 'Tem certeza que deseja finalizar esta demanda interna?' 
                  : (confirmModal.demanda?.colaborador_id ? 'Tem certeza que deseja finalizar esta demanda interna?' : 'Tem certeza que deseja finalizar esta demanda? O valor será creditado ao prestador.'))
              : 'Tem certeza que deseja cancelar esta demanda?'}
          </p>
          {/* Opção de gerar ordem fiscal — somente na finalização */}
          {confirmModal.type === 'finalize' && (
            <label className="flex items-start gap-3 cursor-pointer rounded-2xl border border-indigo-200 bg-indigo-50 p-4 hover:bg-indigo-100 transition-all">
              <div className="mt-0.5">
                <input
                  type="checkbox"
                  checked={gerarOrdemFiscal}
                  onChange={e => setGerarOrdemFiscal(e.target.checked)}
                  className="h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>
              <div>
                <p className="text-sm font-black text-indigo-700">Gerar Ordem Fiscal</p>
                <p className="text-xs text-indigo-500 mt-0.5">Uma ordem fiscal será criada e direcionada ao Módulo Fiscal com todos os dados desta transação.</p>
              </div>
            </label>
          )}
          <div className="flex gap-4 pt-4">
            <button
              onClick={() => setConfirmModal({ isOpen: false, demanda: null, type: 'finalize' })}
              className="flex-1 rounded-xl border border-neutral-200 py-3 font-bold text-neutral-600 hover:bg-neutral-50"
              disabled={isSubmitting}
            >
              Voltar
            </button>
            <button
              onClick={confirmModal.type === 'finalize' ? confirmFinalizeDemanda : confirmCancelDemanda}
              className={`flex-1 rounded-xl py-3 font-bold text-white shadow-lg transition-all ${
                confirmModal.type === 'finalize' 
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' 
                  : 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
              } disabled:opacity-50`}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Processando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </Modal>



      <Modal isOpen={isCancelWithReasonModalOpen} onClose={() => !isSubmitting && setIsCancelWithReasonModalOpen(false)} title="Cancelar Demanda Interna" size="wide">
        <form onSubmit={handleCancelDemandaWithReason} className="space-y-4">
          <p className="text-sm text-neutral-600">
            Informe o motivo do cancelamento. Esta informação será visível para o cliente no histórico de acompanhamento.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Motivo do Cancelamento *</label>
            <textarea
              required
              rows={4}
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Descreva o motivo do cancelamento..."
              className="w-full rounded-lg border border-neutral-300 p-2.5 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            />
          </div>
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={() => setIsCancelWithReasonModalOpen(false)}
              disabled={isSubmitting}
              className="flex-1 rounded-lg border border-neutral-300 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !cancelReason}
              className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  Confirmar Cancelamento
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Transfer Demand Modal */}
      {/* Transfer Demand Modal */}
      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => {
          setIsTransferModalOpen(false);
          setActiveTransferTab('transferencia');
          setTransferPrazo('');
        }}
        title="Transferir Responsabilidade da Demanda"
        size="full"
      >
        <form onSubmit={handleTransferDemanda} className="flex flex-col h-full bg-neutral-50/50 -m-6">
          {/* Modal Header Premium */}
          <div className="bg-white px-8 py-6 border-b border-neutral-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-[2rem] bg-amber-50 text-amber-600 shadow-sm ring-1 ring-black/5">
                  <ArrowUpCircle className="h-8 w-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-neutral-900 uppercase tracking-tight">
                    Transferir Demanda
                  </h2>
                  <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mt-1">
                    Mova a execução para outro prestador ou equipe interna
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsTransferModalOpen(false);
                    setActiveTransferTab('transferencia');
                  }}
                  className="rounded-xl px-4 py-2.5 text-xs font-bold text-neutral-500 hover:bg-neutral-100 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-amber-600/20 hover:bg-amber-700 transition-all"
                >
                  <CheckCircle className="h-4 w-4" />
                  {isSubmitting ? 'Transferindo...' : 'Confirmar Transferência'}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar Tabs */}
            <div className="w-64 bg-white border-r border-neutral-200 p-4 space-y-1">
              {[
                { id: 'transferencia', label: 'Dados da Transferência', icon: ArrowUpCircle },
                { id: 'contexto', label: 'Contexto da Demanda', icon: Info }
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTransferTab(tab.id as any)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                      activeTransferTab === tab.id 
                        ? 'bg-amber-50 text-amber-700 shadow-sm' 
                        : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-12">
              <div className="max-w-6xl mx-auto">
                {activeTransferTab === 'transferencia' && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-neutral-200">
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-6">Destino da Transferência</p>
                      
                      <div className="space-y-6">
                        <div className="flex gap-4 p-1.5 bg-neutral-100 rounded-2xl mb-4">
                          <button
                            type="button"
                            onClick={() => setTransferTarget('prestador')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${transferTarget === 'prestador' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                          >
                            Para Prestador Externo
                          </button>
                          <button
                            type="button"
                            onClick={() => setTransferTarget('colaborador')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${transferTarget === 'colaborador' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                          >
                            Para Colaborador Interno
                          </button>
                          <button
                            type="button"
                            onClick={() => setTransferTarget('admin')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${transferTarget === 'admin' ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                          >
                            Para Adm
                          </button>
                        </div>

                        {transferTarget === 'prestador' && (
                          <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
                            <div>
                              <label className="mb-2 block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Novo Prestador *</label>
                              <select
                                required
                                value={transferPrestadorId}
                                onChange={(e) => setTransferPrestadorId(e.target.value)}
                                className="w-full rounded-2xl bg-neutral-50 border-transparent px-5 py-4 text-sm font-bold text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                              >
                                <option value="">Selecione um prestador...</option>
                                {prestadores
                                  .filter(p => p.id !== selectedDemanda?.prestador_id)
                                  .map(p => (
                                    <option key={p.id} value={p.id}>{p.nome_razao}</option>
                                  ))
                                }
                              </select>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                <label className="mb-2 block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Valor Proposto (R$) *</label>
                                <div className="relative">
                                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400 font-bold">R$</span>
                                  <input 
                                    type="number"
                                    step="0.01"
                                    required
                                    value={transferValor}
                                    inputMode="numeric"
onChange={(e) => setTransferValor(e.target.value)}
                                    className="w-full rounded-2xl bg-neutral-50 border-transparent pl-12 pr-5 py-4 text-sm font-black text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                                    placeholder="0,00"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="mb-2 block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Prazo para Entrega *</label>
                                <input
                                  type="datetime-local"
                                  required
                                  value={transferPrazo}
                                  onChange={(e) => setTransferPrazo(e.target.value)}
                                  className="w-full rounded-2xl bg-neutral-50 border-transparent px-5 py-4 text-sm font-bold text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {transferTarget === 'colaborador' && (
                          <div className="animate-in fade-in slide-in-from-top-2">
                            <label className="mb-2 block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Selecionar Colaborador *</label>
                            <select
                              required
                              value={transferColaboradorId}
                              onChange={(e) => setTransferColaboradorId(e.target.value)}
                              className="w-full rounded-2xl bg-neutral-50 border-transparent px-5 py-4 text-sm font-bold text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200"
                            >
                              <option value="">Selecione um colaborador...</option>
                              {colaboradores.map(c => (
                                <option key={c.id} value={c.id}>{c.nome}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-neutral-200">
                      <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest mb-6">Motivo e Arquivo de Apoio</p>
                      <div className="space-y-6">
                        <textarea
                          required
                          rows={4}
                          value={transferReason}
                          onChange={(e) => setTransferReason(e.target.value)}
                          className="w-full rounded-3xl bg-neutral-50 border-transparent px-5 py-4 text-sm font-medium text-neutral-900 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none ring-1 ring-neutral-200 resize-none"
                          placeholder="Descreva o motivo desta transferência para o histórico..."
                        />
                        
                        <div className="mt-1 flex justify-center rounded-3xl border border-dashed border-neutral-300 px-6 py-10 hover:bg-neutral-50 transition-colors">
                          <div className="text-center">
                            <PlusCircle className="mx-auto h-10 w-10 text-neutral-400 mb-2" />
                            <div className="flex text-xs leading-6 text-neutral-600">
                              <label className="relative cursor-pointer rounded-md bg-transparent font-black text-indigo-600 focus-within:outline-none hover:text-indigo-500">
                                <span>Anexar Documento de Apoio</span>
                                <input type="file" className="sr-only" onChange={(e) => setTransferFile(e.target.files?.[0] || null)} />
                              </label>
                            </div>
                            {transferFile && (
                              <p className="text-[10px] font-black text-emerald-600 mt-2 bg-emerald-50 px-3 py-1 rounded-full inline-block">{transferFile.name}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTransferTab === 'contexto' && selectedDemanda && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                    <div className="rounded-3xl bg-neutral-900 p-8 text-white shadow-2xl relative overflow-hidden group">
                       <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div>
                       <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4 relative z-10">Contexto da Ordem de Serviço</p>
                       <div className="grid grid-cols-2 gap-8 mb-8 relative z-10">
                          <div>
                             <p className="text-[10px] font-bold text-white/40 uppercase">Código OS</p>
                             <p className="text-xl font-black">{selectedDemanda.ordem_servico?.codigo_os || 'N/A'}</p>
                          </div>
                          <div>
                             <p className="text-[10px] font-bold text-white/40 uppercase">Serviço</p>
                             <p className="text-xl font-black">{selectedDemanda.ordem_servico?.orcamento?.servico?.nome || 'N/A'}</p>
                          </div>
                       </div>
                       <div className="pt-6 border-t border-white/10 relative z-10">
                          <p className="text-[10px] font-bold text-white/40 uppercase mb-2">Instruções Originais (Admin)</p>
                          <p className="text-sm font-medium leading-relaxed opacity-80 whitespace-pre-wrap">
                            {selectedDemanda.detalhes || 'Nenhum detalhe adicional na demanda.'}
                          </p>
                       </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
      </Modal>
      <ConfirmDialog {...confirmHook} />
    </div>
  );
}

interface AdminOSSuporteChatProps {
  osId: string;
  remetenteId: string | null;
  remetenteNome: string;
  clienteId?: string;
  isConcluida?: boolean;
}

export function AdminOSSuporteChat({ osId, remetenteId, remetenteNome, clienteId, isConcluida }: AdminOSSuporteChatProps) {
  const [mensagens, setMensagens] = useState<any[]>([]);
  const [anexoFile, setAnexoFile] = useState<File | null>(null);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { openFile } = useFileViewer();

  const fetchMensagens = async () => {
    const { data } = await supabase
      .from('os_suporte_mensagens')
      .select('*')
      .eq('os_id', osId)
      .order('created_at', { ascending: true });
    if (data) {
      setMensagens(data);
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 100);
    }
  };

  useEffect(() => {
    fetchMensagens();

    const channel = supabase
      .channel('admin-os-suporte-chat')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'os_suporte_mensagens',
        filter: `os_id=eq.${osId}`
      }, (payload) => {
        setMensagens((prev) => {
          if (prev.find(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        setTimeout(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }, 100);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [osId]);

  const handleEnviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!novaMensagem.trim() && !anexoFile) || enviando) return;

    setEnviando(true);
    try {
      let mensagemTexto = novaMensagem.trim();

      if (anexoFile) {
        const fileExt = anexoFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
        const path = `suporte/${osId}/${fileName}`;
        
        const { url: publicUrl } = await uploadFile(anexoFile, 'entregas_demandas', path);
        
        // publicUrl is handled by uploadFile directly if bucket is public, else use getPublicFileUrl or getPrivateFileUrl.
        
        const anexoStr = `[ANEXO|${anexoFile.name}|${publicUrl}]`;
        mensagemTexto = mensagemTexto ? `${mensagemTexto}\n\n${anexoStr}` : anexoStr;
      }

      const { error } = await supabase
        .from('os_suporte_mensagens')
        .insert({
          os_id: osId,
          remetente_tipo: 'admin',
          remetente_id: remetenteId,
          remetente_nome: remetenteNome,
          mensagem: mensagemTexto
        });
      
      if (error) throw error;
      setNovaMensagem('');
      setAnexoFile(null);
      
      if (clienteId) {
        await notificationService.notifyClient(
          clienteId,
          '💬 Nova Mensagem de Suporte',
          `${remetenteNome}: ${novaMensagem.trim()}`,
          'servicos',
          'ticket_mensagem_cliente',
          { itemId: osId, tab: 'andamento' }
        );
      }
    } catch (err) {
      console.error('Erro ao enviar mensagem', err);
      toast.error('Erro ao enviar mensagem.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col h-[500px] rounded-2xl bg-white ring-1 ring-neutral-200 overflow-hidden">
      <div className="flex items-center gap-3 bg-neutral-50 px-6 py-4 border-b border-neutral-200">
        <MessageSquare className="h-5 w-5 text-indigo-600" />
        <div>
          <h4 className="font-bold text-neutral-900">Suporte ao Cliente (OS)</h4>
          <p className="text-xs text-neutral-500">Chat em tempo real com o cliente.</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-neutral-50/50">
        {mensagens.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-neutral-400">
            <MessageSquare className="h-8 w-8 mb-3 opacity-20" />
            <p className="text-sm font-medium">Nenhuma mensagem ainda.</p>
          </div>
        ) : (
          mensagens.map((msg) => {
            const isMe = msg.remetente_tipo === 'admin';
            const anexoMatch = msg.mensagem.match(/\[ANEXO\|(.*?)\|(.*?)\]/);
            const textContent = msg.mensagem.replace(/\[ANEXO\|.*?\|.*?\]/, '').trim();
            const fileName = anexoMatch ? anexoMatch[1] : null;
            const fileUrl = anexoMatch ? anexoMatch[2] : null;
            const isImage = fileName?.match(/\.(jpg|jpeg|png|gif|webp)$/i);

            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && <p className="text-[10px] font-bold text-neutral-400 mb-1 ml-1">Cliente</p>}
                {isMe && msg.remetente_nome && <p className="text-[10px] font-bold text-indigo-400 mb-1 mr-1">{msg.remetente_nome}</p>}
                <div 
                  className={`max-w-[80%] rounded-2xl px-5 py-3 flex flex-col gap-2 ${
                    isMe 
                      ? 'bg-indigo-600 text-white rounded-br-sm' 
                      : 'bg-white border border-neutral-200 text-neutral-800 rounded-bl-sm shadow-sm'
                  }`}
                >
                  {textContent && <p className="text-sm whitespace-pre-wrap">{textContent}</p>}
                  
                  {anexoMatch && (
                    <button type="button" onClick={() => openFile(fileUrl!, fileName!)} className={`block mt-1 overflow-hidden rounded-xl border ${isMe ? 'border-white/20' : 'border-neutral-200'} transition-opacity hover:opacity-90 cursor-pointer`}>
                      {isImage ? (
                        <img src={fileUrl!} alt={fileName!} className="max-w-[200px] max-h-[200px] object-cover" />
                      ) : (
                        <div className={`flex items-center gap-2 p-3 ${isMe ? 'bg-white/10' : 'bg-neutral-50'}`}>
                          <Paperclip className={`h-5 w-5 shrink-0 ${isMe ? 'text-white' : 'text-indigo-600'}`} />
                          <span className={`text-xs font-semibold truncate max-w-[150px] ${isMe ? 'text-white' : 'text-neutral-700'}`}>{fileName}</span>
                        </div>
                      )}
                    </button>
                  )}
                </div>
                <p className="text-[10px] font-bold text-neutral-400 mt-1 px-1">
                  {new Date(msg.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
            );
          })
        )}
      </div>

      <div className="p-4 bg-white border-t border-neutral-200 flex flex-col gap-2">
        {isConcluida ? (
          <div className="p-3 bg-neutral-100 rounded-xl text-center text-sm font-medium text-neutral-500 flex items-center justify-center gap-2">
            <MessageSquare className="h-4 w-4 opacity-50" />
            Demanda concluída. O chat foi encerrado.
          </div>
        ) : (
          <>
            {anexoFile && (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 w-fit">
            <Paperclip className="h-4 w-4 text-indigo-600" />
            <span className="text-xs font-semibold text-indigo-900 truncate max-w-[200px]">{anexoFile.name}</span>
            <button type="button" onClick={() => setAnexoFile(null)} className="ml-2 text-indigo-400 hover:text-indigo-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <form onSubmit={handleEnviar} className="flex items-center gap-3">
          <label className={`cursor-pointer flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${anexoFile ? 'bg-indigo-100 text-indigo-600' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'} ${enviando ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input type="file" className="hidden" disabled={enviando} onChange={(e) => {
              if (e.target.files?.[0]) setAnexoFile(e.target.files[0]);
              e.target.value = '';
            }} />
            <Paperclip className="h-5 w-5" />
          </label>
          <input
            type="text"
            value={novaMensagem}
            onChange={(e) => setNovaMensagem(e.target.value)}
            placeholder="Digite sua resposta..."
            className="flex-1 rounded-xl bg-neutral-100 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            disabled={enviando}
          />
          <button
            type="submit"
            disabled={(!novaMensagem.trim() && !anexoFile) || enviando}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
          </>
        )}
      </div>
    </div>
  );
}
