import { useState, useEffect, useRef } from 'react';
import { Search, ClipboardList, CheckCircle, XCircle, Clock, MessageSquare, Plus, Printer, Send, AlertCircle, FileText, Trash2, FileUp, Download, Link } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { OS } from '../../types';
import { Modal } from '../ui/Modal';
import { formatCurrency, formatDate, formatDateTime, generateUUID, handleError } from '../../lib/utils';
import { GlobalFilter } from '../ui/GlobalFilter';
import { toast } from 'react-hot-toast';
import { generateOSPDF } from '../../lib/pdf';
import { pdfSharingService } from '../../lib/pdfSharingService';
import { AdminWhatsAppButton } from './ui/AdminWhatsAppButton';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';
import { createNotification } from '../../lib/notifications';
import { notificationService } from '../../lib/notificationService';
import { osService } from '../../lib/osService';
import { canDeleteRecord } from '../../lib/deleteRequest';
import { logService } from '../../lib/logService';
import { PainelRentabilidade } from './PainelRentabilidade';
import { useFileViewer } from '../../contexts/FileViewerContext';
import { callAdminRpc } from '../../lib/adminRpc';

export function OrdensServicoModule({ activeSubTab, initialItemId, colaboradorNome }: { activeSubTab?: 'abertas' | 'concluidas' | 'canceladas', initialItemId?: string, colaboradorNome?: string }) {
  const [activeTab, setActiveTab] = useState<'andamento' | 'concluido' | 'cancelado'>('andamento');

  useEffect(() => {
    if (activeSubTab) {
      const mapping: Record<string, 'andamento' | 'concluido' | 'cancelado'> = {
        'abertas': 'andamento',
        'concluidas': 'concluido',
        'canceladas': 'cancelado'
      };
      setActiveTab(mapping[activeSubTab]);
    }
  }, [activeSubTab]);
  const [ordens, setOrdens] = useState<OS[]>([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({
    mes: '',
    ano: ''
  });
  const [selectedOS, setSelectedOS] = useState<OS | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [osToCancel, setOsToCancel] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const hasAutoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (initialItemId && ordens.length > 0 && hasAutoOpened.current !== initialItemId) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`os-${initialItemId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedId(initialItemId);
          
          // Abrir modal automaticamente
          const os = ordens.find(o => o.id === initialItemId);
          if (os) {
            setSelectedOS(os);
            setIsDetailOpen(true);
            hasAutoOpened.current = initialItemId;
          }

          setTimeout(() => setHighlightedId(null), 3000);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialItemId, ordens]);

  const activeTabRef = useRef(activeTab);
  const searchRef = useRef(search);
  const filtersRef = useRef(filters);

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { searchRef.current = search; }, [search]);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  useEffect(() => {
    fetchOrdens();
  }, [activeTab, search, filters]);

  // Stable Realtime Subscription
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const debouncedFetch = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fetchOrdens();
      }, 300);
    };

    const channel = supabase
      .channel(`admin-os-rt-${Date.now()}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ordens_servico'
      }, () => {
        debouncedFetch();
      })
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, []); // Empty dependency array for stability

  const fetchOrdens = async () => {
    let query = supabase
      .from('ordens_servico')
      .select('*, clientes(id, nome, cpf, cnpj, telefone, email, codigo_cliente), orcamentos:orcamento_id(id, servico_id, produto_id, assinatura_id, codigo_orcamento, total, valor_servico, valor_adicional, descricao_adicional, acrescimo, desconto, servicos(nome, descricao)), prestador_demandas(id, status, link_entrega, link_resultado, arquivos_resultado, arquivos_briefing)')
      .eq('status', activeTab);
    
    if (search) {
      query = query.ilike('codigo_os', `%${search}%`);
    }

    if (filters.mes) {
      const year = filters.ano || new Date().getFullYear();
      const startDate = `${year}-${filters.mes}-01`;
      const endDate = new Date(Number(year), Number(filters.mes), 0).toISOString().split('T')[0];
      query = query.gte('data_inicio', startDate).lte('data_inicio', endDate);
    }

    const { data } = await query.order('codigo_os', { ascending: false });
    if (data) setOrdens(data as any);
  };


  const handleCancelClick = (id: string) => {
    setOsToCancel(id);
    setCancelReason('');
    setIsCancelModalOpen(true);
  };

  const confirmCancel = async () => {
    if (!osToCancel || !cancelReason) return;
    
    // 1. Atualizar a OS principal
    const { error } = await supabase
      .from('ordens_servico')
      .update({ 
        status: 'cancelado', 
        data_fim: new Date().toISOString(),
        motivo_cancelamento: `${cancelReason}${colaboradorNome ? ` [POR: ${colaboradorNome}]` : ''}` 
      })
      .eq('id', osToCancel);

    if (error) {
      toast.error('Erro ao cancelar OS.');
    } else {
      const os = ordens.find(o => o.id === osToCancel);

      if (os) {
        // Lançamento do cancelamento no histórico
        await osService.addOSNote(
          osToCancel,
          os.cliente_id,
          `Serviço cancelado. Motivo: ${cancelReason}${colaboradorNome ? ` [POR: ${colaboradorNome}]` : ''}`,
          os.codigo_os
        );
      }
      
      // 2. Cascata: Cancelar todas as demandas de prestadores vinculadas
      const { data: demandasAfetadas, error: demandasError } = await supabase
        .from('prestador_demandas')
        .update({ status: 'cancelada' })
        .eq('os_id', osToCancel)
        .select('id, prestador_id, codigo_demanda');
      if (demandasError) {
        toast.error('A OS foi cancelada, mas houve falha ao cancelar as demandas vinculadas. Atualize a tela e tente novamente.');
        return;
      }

      // 3. Notificar Cliente
      if (os) {
        await notificationService.notifyClient(
          os.cliente_id,
          '❌ Ordem de Serviço Cancelada',
          `Sua ordem de serviço ${os.codigo_os} foi cancelada pelo sistema. Motivo: ${cancelReason}`,
          'servicos',
          'os_cancelada',
          { tab: 'cancelado', itemId: os.id, prioridade: 'alta', contexto: { os_id: os.id, codigo: os.codigo_os, motivo: cancelReason } }
        );
      }

      // 4. Notificar cada Prestador afetado
      if (demandasAfetadas && demandasAfetadas.length > 0) {
        for (const dem of demandasAfetadas) {
          if (dem.prestador_id) {
            await notificationService.notifyProvider(
              dem.prestador_id,
              '⚠️ Demanda Cancelada pela GSA',
              `A demanda ${dem.codigo_demanda || dem.id.slice(0,8)} foi cancelada pelo sistema. Motivo: ${cancelReason}`,
              'demandas',
              'demanda_cancelada',
              { itemId: dem.id, prioridade: 'alta', contexto: { demanda_id: dem.id, motivo: cancelReason } }
            );
          }
        }
      }

      toast.success('OS e demandas vinculadas canceladas com sucesso.');
      setIsDetailOpen(false);
      setIsCancelModalOpen(false);
      
      await logService.logAction({
        acao: 'CANCELAR_OS',
        detalhes: JSON.stringify({ os_id: osToCancel, codigo: os?.codigo_os, motivo: cancelReason }),
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador'
      });

      fetchOrdens();
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-end gap-4 px-2 mb-8">
        <GlobalFilter 
          searchValue={search}
          onSearch={setSearch}
          currentFilters={filters}
          onFilterChange={setFilters}
          onClear={() => {
            setSearch('');
            setFilters({ mes: '', ano: new Date().getFullYear().toString() });
          }}
          options={[
            {
              id: 'mes',
              label: 'Mês de Início',
              type: 'select',
              options: [
                { value: '01', label: 'Janeiro' },
                { value: '02', label: 'Fevereiro' },
                { value: '03', label: 'Março' },
                { value: '04', label: 'Abril' },
                { value: '05', label: 'Maio' },
                { value: '06', label: 'Junho' },
                { value: '07', label: 'Julho' },
                { value: '08', label: 'Agosto' },
                { value: '09', label: 'Setembro' },
                { value: '10', label: 'Outubro' },
                { value: '11', label: 'Novembro' },
                { value: '12', label: 'Dezembro' }
              ]
            },
            {
              id: 'ano',
              label: 'Ano',
              type: 'select',
              options: [
                { value: '2024', label: '2024' },
                { value: '2025', label: '2025' },
                { value: '2026', label: '2026' }
              ]
            }
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {ordens.length > 0 ? ordens.map((os) => (
          <div 
            key={os.id} 
            id={`os-${os.id}`}
            className={`group relative overflow-hidden rounded-[2.5rem] bg-white p-8 shadow-sm ring-1 ring-black/5 transition-all hover:shadow-2xl hover:-translate-y-1 ${
              highlightedId === os.id 
                ? 'bg-indigo-50/50 ring-2 ring-indigo-500 z-10 scale-[1.01]' 
                : ''
            }`}
          >
            <div className={`absolute top-0 right-0 h-32 w-32 translate-x-12 -translate-y-12 rounded-full opacity-5 group-hover:opacity-10 transition-opacity ${
              os.status === 'andamento' ? 'bg-indigo-500' : 
              os.status === 'concluido' ? 'bg-emerald-500' : 'bg-red-500'
            }`} />
            
            <div className="mb-6 flex items-center justify-between relative z-10">
              <div className="flex items-center gap-4">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-inner transition-all group-hover:scale-110 ${
                  os.status === 'andamento' ? 'bg-indigo-50 text-indigo-600' : 
                  os.status === 'concluido' ? 'bg-emerald-50 text-emerald-600' : 
                  'bg-red-50 text-red-600'
                }`}>
                  <ClipboardList className="h-7 w-7" />
                </div>
                <div>
                  <span className="font-mono text-[10px] font-black text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-lg ring-1 ring-indigo-100">
                    {os.codigo_os}
                  </span>
                  <p className="text-[10px] font-black text-neutral-300 uppercase tracking-widest mt-1.5">{formatDate(os.data_inicio)}</p>
                </div>
              </div>
              <button 
                onClick={() => { setSelectedOS(os); setIsDetailOpen(true); }}
                className="rounded-2xl bg-indigo-600 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-indigo-700 active:scale-95 shadow-lg shadow-indigo-600/20"
              >
                Gerenciar
              </button>
            </div>

            <div className="space-y-2 relative z-10">
              <h3 className="text-xl font-black text-neutral-900 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">{(os as any).clientes?.nome}</h3>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest line-clamp-1">{(os as any).orcamentos?.servicos?.nome}</p>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-neutral-100 pt-6 relative z-10">
              <p className="text-2xl font-black text-[#1a1a1a] tracking-tighter">{formatCurrency((os as any).orcamentos?.total)}</p>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-neutral-400 bg-neutral-50 px-3 py-1.5 rounded-xl ring-1 ring-neutral-100">
                <Clock className="h-4 w-4 text-neutral-300" />
                {os.status === 'andamento' ? 'Em execução' : os.status === 'concluido' ? 'Finalizada' : 'Cancelada'}
              </div>
            </div>
          </div>
        )) : (
          <div className="col-span-full py-24 text-center">
            <ClipboardList className="h-16 w-16 text-neutral-100 mx-auto mb-4" />
            <p className="text-[10px] font-black text-neutral-300 uppercase tracking-widest">Nenhuma ordem de serviço {activeTab} encontrada</p>
          </div>
        )}
      </div>

      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Gerenciar Ordem de Serviço" size="full">
        <div className="max-w-6xl mx-auto py-8">
          {selectedOS && (
            <OSDetails 
              os={selectedOS} 
              onCancel={() => handleCancelClick(selectedOS.id)}
              colaboradorNome={colaboradorNome}
              onFinalized={() => {
                setIsDetailOpen(false);
                fetchOrdens();
              }}
            />
          )}
        </div>
      </Modal>

      <Modal isOpen={isCancelModalOpen} onClose={() => setIsCancelModalOpen(false)} title="Cancelar Ordem de Serviço" size="wide">
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">Tem certeza que deseja cancelar esta OS? Esta ação não pode ser desfeita.</p>
          <div>
            <label className="mb-1 block text-sm font-bold text-neutral-700">Motivo do Cancelamento *</label>
            <textarea 
              rows={3}
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 focus:border-indigo-500 focus:outline-none"
              placeholder="Informe o motivo..."
            />
          </div>
          <div className="flex gap-4 pt-2">
            <button onClick={() => setIsCancelModalOpen(false)} className="flex-1 rounded-xl border border-neutral-200 py-3 font-bold text-neutral-600 hover:bg-neutral-50">Voltar</button>
            <button 
              onClick={confirmCancel}
              disabled={!cancelReason}
              className="flex-1 rounded-xl bg-red-600 py-3 font-bold text-white shadow-lg shadow-red-600/20 hover:bg-red-700 disabled:opacity-50"
            >
              Confirmar Cancelamento
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function OSDetails({ os, onCancel, colaboradorNome, onFinalized }: { os: OS, onCancel: () => void, colaboradorNome?: string, onFinalized?: () => void }) {
  const { openFile } = useFileViewer();
  const [notas, setNotas] = useState<any[]>([]);
  const [novaNota, setNovaNota] = useState('');
  const [isDocRequestModalOpen, setIsDocRequestModalOpen] = useState(false);
  const [requestedDocs, setRequestedDocs] = useState<string[]>(['']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [clienteInfo, setClienteInfo] = useState<any>((os as any).clientes || null);
  const finalizeRequestId = useRef(generateUUID());

  useEffect(() => {
    fetchNotas();
    if (!clienteInfo && os.cliente_id) {
      (async () => {
        try {
          const { data, error } = await supabase.from('clientes').select('id, nome, telefone').eq('id', os.cliente_id).maybeSingle();
          if (error) toast.error('Erro ao buscar dados do cliente.');
          else if (data) setClienteInfo(data);
        } catch {
          toast.error('Erro ao buscar dados do cliente.');
        }
      })();
    }
  }, [os.id, os.cliente_id]);

  const fetchNotas = async () => {
    try {
      const { data, error } = await supabase.from('os_notas').select('*').eq('os_id', os.id).order('data_criacao', { ascending: false });
      if (error) throw error;
      if (data) setNotas(data);
    } catch (err) {
      toast.error('Erro ao carregar notas da OS.');
    }
  };

  const handleAddNota = async () => {
    if (!novaNota) return;
    try {
      const result = await osService.addOSNote(
        os.id,
        os.cliente_id,
        `${novaNota}${colaboradorNome ? ` [POR: ${colaboradorNome}]` : ''}`,
        os.codigo_os
      );

      if (result.success) {
        setNovaNota('');
        fetchNotas();
        toast.success('Observação adicionada com sucesso.');

        await logService.logAction({
          acao: 'ADICIONAR_NOTA_OS',
          detalhes: JSON.stringify({ os_id: os.id, codigo: os.codigo_os, nota: novaNota }),
          ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
          ator_nome: colaboradorNome || 'Administrador'
        });
      }
    } catch (err) {
      console.error('Error adding nota:', err);
      toast.error('Erro ao registrar ocorrência.');
    }
  };

  const handleDeleteNota = async (id: string) => {
    const canProceed = await canDeleteRecord('os_notas', id);
    if (!canProceed) return;

    try {
      const { error } = await supabase.from('os_notas').delete().eq('id', id);
      if (error) throw error;
      await fetchNotas();
      toast.success('Registro excluído.');

      await logService.logAction({
        acao: 'EXCLUIR_NOTA_OS',
        detalhes: JSON.stringify({ os_id: os.id, codigo: os.codigo_os, nota_id: id }),
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador'
      });
    } catch (err) {
      console.error('Error deleting nota:', err);
      toast.error('Erro ao excluir registro.');
    }
  };

  const hasInternalDemand = Array.isArray((os as any).prestador_demandas) 
    ? (os as any).prestador_demandas.some((d: any) => ['ativa', 'em_analise', 'em_ajuste'].includes(d.status))
    : ['ativa', 'em_analise', 'em_ajuste'].includes((os as any).prestador_demandas?.status);

  const isAwaitingFinalization = Array.isArray((os as any).prestador_demandas)
    ? (os as any).prestador_demandas.some((d: any) => d.status === 'concluida_interna')
    : (os as any).prestador_demandas?.status === 'concluida_interna';

  const orcamentoData = Array.isArray((os as any).orcamentos) ? (os as any).orcamentos[0] : (os as any).orcamentos;

  const handleRequestDocumentsOS = async () => {
    const finalDocs = requestedDocs.filter(d => d.trim() !== '');
    if (finalDocs.length === 0) {
      toast.error('Adicione pelo menos um documento.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('ordens_servico')
        .update({ 
          documentos_solicitados_os: finalDocs
        })
        .eq('id', os.id);

      if (error) throw error;

      await osService.addOSNote(os.id, os.id, `Administração solicitou documentos: ${finalDocs.join(', ')}${colaboradorNome ? ` [POR: ${colaboradorNome}]` : ''}`, os.codigo_os);

      await notificationService.notifyClient(
        os.cliente_id,
        '📁 Documentos Solicitados na OS',
        `A administração solicitou o envio de documentos para o andamento da Ordem de Serviço ${os.codigo_os}. Verifique os detalhes no portal.`,
        'servicos',
        'os_documento_solicitado',
        { tab: 'andamento', itemId: os.id, prioridade: 'alta', contexto: { os_id: os.id, documentos: finalDocs } }
      );

      toast.success('Solicitação de documentos enviada ao cliente.');
      setIsDocRequestModalOpen(false);
      setRequestedDocs(['']);
      
      await logService.logAction({
        acao: 'SOLICITAR_DOCS_OS',
        detalhes: JSON.stringify({ os_id: os.id, codigo: os.codigo_os, documentos: finalDocs }),
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_nome: colaboradorNome || 'Administrador'
      });

      // A atualização local ou via subscription ocorrerá
      os.documentos_solicitados_os = finalDocs;
    } catch (err: any) {
      toast.error(handleError(err, 'solicitar documentos'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmFinalizeOS = async () => {
    setIsSubmitting(true);
    try {
      const result = await callAdminRpc<{ success?: boolean }>('gsa_admin_finalize_service_order', {
        p_request_id: finalizeRequestId.current,
        p_ordem_servico_id: os.id,
      });
      if (!result?.success) {
        throw new Error('O servidor não confirmou a finalização da ordem de serviço.');
      }

      await notificationService.notifyClient(
        os.cliente_id,
        '🎉 Serviço Concluído e Entregue',
        `Sua ordem de serviço ${os.codigo_os} foi finalizada com sucesso! Verifique os documentos entregues no seu painel.`,
        'servicos',
        'os_concluida',
        { tab: 'concluido', itemId: os.id, prioridade: 'alta' }
      );

      toast.success('Ordem de Serviço finalizada com sucesso!');
      setIsFinalizeModalOpen(false);
      if (onFinalized) {
        onFinalized();
      }
    } catch (err: any) {
      toast.error('Erro ao finalizar OS: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      
      {/* Header Info */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] shadow-sm ring-1 ring-black/5">
         <div className="flex items-center gap-6">
            <div className={`h-16 w-16 flex items-center justify-center rounded-3xl ${os.status === 'andamento' ? 'bg-indigo-50 text-indigo-600' : os.status === 'concluido' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              <ClipboardList className="h-8 w-8" />
            </div>
            <div>
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest leading-none mb-1">Identificador OS</p>
              <h2 className="text-2xl font-black text-neutral-900 tracking-tight">{os.codigo_os}</h2>
            </div>
         </div>

         <div className="flex items-center gap-4">
            <AdminWhatsAppButton 
              telefone={clienteInfo?.telefone || (os as any).clientes?.telefone}
              mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                tipo: 'os',
                clienteNome: clienteInfo?.nome || (os as any).clientes?.nome,
                codigo: os.codigo_os,
                status: os.status === 'andamento' ? 'Em Execução' : os.status === 'concluido' ? 'Finalizada' : 'Cancelada',
                detalhesExtras: notas.length > 0 ? notas[0].nota : undefined
              })}
            />
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-black text-neutral-400 uppercase tracking-widest leading-none mb-1">Início da Operação</p>
              <p className="text-xs font-bold text-neutral-500 uppercase">{formatDate(os.data_inicio)}</p>
            </div>
            <span className={`rounded-2xl px-6 py-3 text-xs font-black uppercase tracking-widest ${
              os.status === 'andamento' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 
              os.status === 'concluido' ? 'bg-emerald-100 text-emerald-700' : 
              'bg-red-100 text-red-700 font-black'
            }`}>
              {os.status === 'andamento' ? 'Em Execução' : os.status === 'concluido' ? 'Finalizada' : 'Cancelada'}
            </span>
         </div>
      </div>

      {hasInternalDemand && (
        <div className="rounded-[2rem] bg-indigo-600 p-6 text-white flex items-center gap-4 shadow-xl animate-pulse">
          <div className="h-10 w-10 flex items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-tight">OS Sob Gestão de Fluxo Interno</p>
            <p className="text-xs opacity-80 font-medium">A autonomia administrativa está limitada até o processamento das demandas vinculadas.</p>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
        
        {/* Left Column: Context & History */}
        <div className="lg:col-span-2 space-y-10">
          
          {/* Client & Service Section */}
          <section className="bg-white rounded-[2.5rem] p-10 shadow-sm ring-1 ring-black/5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-2 mb-2 block leading-none">Contratante</label>
                  <div className="rounded-3xl bg-neutral-50 p-6 flex items-center gap-4 ring-1 ring-inset ring-neutral-200/50">
                    <div className="h-12 w-12 rounded-2xl bg-white flex items-center justify-center text-indigo-600 font-black text-xl shadow-sm">
                      {(os as any).clientes?.nome?.charAt(0) || 'C'}
                    </div>
                    <div>
                      <p className="text-base font-black text-neutral-900 leading-tight">{(os as any).clientes?.nome}</p>
                      <p className="text-xs font-bold text-neutral-400">{(os as any).clientes?.codigo_cliente}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-2 mb-2 block leading-none">Escopo Contratado</label>
                  <div className="rounded-3xl border border-neutral-100 p-6 bg-white shadow-sm">
                    <p className="text-lg font-black text-neutral-900 uppercase tracking-tight">{orcamentoData?.servicos?.nome || 'Serviço Personalizado'}</p>
                    <div className="mt-3 flex items-center gap-2 text-indigo-600">
                      <FileText className="h-4 w-4" />
                      <span className="text-xs font-black uppercase tracking-widest">Origem: {orcamentoData?.codigo_orcamento || 'Ajuste Manual'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-2 mb-2 block leading-none">Detalhamento Técnico</label>
                <div className="p-6 bg-neutral-50 rounded-3xl ring-1 ring-inset ring-neutral-200/50 min-h-[160px]">
                  <p className="text-sm font-medium text-neutral-600 leading-relaxed whitespace-pre-wrap">
                    {orcamentoData?.observacoes_servico || orcamentoData?.servicos?.descricao || 'Sem especificações detalhadas no registro.'}
                  </p>
                </div>
              </div>
            </div>

            {(os.documentos_solicitados_os?.length > 0 || os.anexos_os?.length > 0 || (os as any).prestador_demandas?.some((d: any) => d.link_entrega || d.link_resultado)) && (
              <div className="mt-10">
                <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-2 mb-2 block leading-none">Documentos / Entregáveis</label>
                <div className="rounded-3xl border border-neutral-100 p-6 bg-white shadow-sm space-y-4">
                  {(os as any).prestador_demandas?.map((d: any, dIdx: number) => {
                    const link = d.link_entrega || d.link_resultado;
                    if (!link) return null;
                    return (
                      <div key={`link-${dIdx}`} className="space-y-3 mb-6">
                        <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                          <Link className="h-4 w-4" /> Link de Entrega Final { (os as any).prestador_demandas.length > 1 ? `#${dIdx + 1}` : '' }
                        </p>
                        <a href={link.startsWith('http') ? link : `https://${link}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 underline break-all">
                          {link}
                        </a>
                      </div>
                    );
                  })}

                  {(os as any).prestador_demandas?.map((d: any, dIdx: number) => {
                    if (!d.arquivos_briefing || !Array.isArray(d.arquivos_briefing) || d.arquivos_briefing.length === 0) return null;
                    return (
                      <div key={`briefing-${dIdx}`} className="space-y-3 mb-6">
                        <p className="text-xs font-bold text-amber-600 uppercase tracking-widest flex items-center gap-2">
                          <FileText className="h-4 w-4" /> Briefing / Anexos Originais { (os as any).prestador_demandas.length > 1 ? `#${dIdx + 1}` : '' }
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {d.arquivos_briefing.map((url: string, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 ring-1 ring-inset ring-neutral-200/50">
                              <div className="flex items-center gap-2 truncate pr-2">
                                <FileText className="h-4 w-4 text-amber-500 flex-shrink-0" />
                                <span className="text-xs font-bold text-neutral-700 truncate">Anexo {idx + 1}</span>
                              </div>
                              <a
                                href={url.startsWith('gsa-private://') ? '#' : url}
                                 onClick={(event) => {
                                   if (url.startsWith('gsa-private://')) {
                                     event.preventDefault();
                                     void openFile(url, `Anexo de briefing ${idx + 1}`);
                                   }
                                 }}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 rounded-lg bg-white text-amber-600 hover:bg-amber-50 ring-1 ring-inset ring-neutral-200/50 transition-colors"
                                title="Visualizar"
                              >
                                <Download className="h-4 w-4" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {os.anexos_os?.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" /> Documentos Recebidos
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {os.anexos_os.map((doc: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 ring-1 ring-inset ring-neutral-200/50">
                            <div className="flex items-center gap-2 truncate pr-2">
                              <FileText className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                              <span className="text-xs font-bold text-neutral-700 truncate">{doc.nome}</span>
                            </div>
                            <a
                              href={doc.url.startsWith('gsa-private://') ? '#' : doc.url}
                               onClick={(event) => {
                                 if (doc.url.startsWith('gsa-private://')) {
                                   event.preventDefault();
                                   void openFile(doc.url, doc.nome);
                                 }
                               }}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 rounded-lg bg-white text-indigo-600 hover:bg-indigo-50 ring-1 ring-inset ring-neutral-200/50 transition-colors"
                              title="Baixar Documento"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {os.documentos_solicitados_os?.length > 0 && (
                    <div className="mt-4 p-4 rounded-2xl bg-amber-50 ring-1 ring-inset ring-amber-200/50 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0">
                        <Clock className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-amber-900">Aguardando envio pelo cliente</p>
                        <p className="text-xs text-amber-700 mt-1">Pendentes: {os.documentos_solicitados_os.join(', ')}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Timeline / Occurrences Section */}
          <section className="bg-white rounded-[2.5rem] p-10 shadow-sm ring-1 ring-black/5">
            <h3 className="mb-8 text-[10px] font-black uppercase tracking-widest text-indigo-600 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Diário de Bordo / Ocorrências
            </h3>

            <div className="space-y-6">
              <div className="flex gap-3">
                <input 
                  type="text" 
                  placeholder="Registrar nova atualização na OS..." 
                  value={novaNota}
                  onChange={e => setNovaNota(e.target.value)}
                  className="flex-1 rounded-2xl bg-neutral-50 p-4 text-sm font-medium ring-1 ring-inset ring-neutral-200/50 focus:ring-2 focus:ring-indigo-500/20 focus:bg-white outline-none transition-all"
                />
                <button 
                  onClick={handleAddNota} 
                  className="h-12 w-12 flex items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all"
                >
                  <Plus className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {notas.map(n => (
                  <div key={n.id} className="group relative rounded-3xl bg-neutral-50 p-6 ring-1 ring-neutral-100 hover:ring-indigo-200 transition-all">
                    <div className="flex justify-between items-start mb-2">
                       <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">{formatDateTime(n.data_criacao)}</span>
                       <button 
                        onClick={() => handleDeleteNota(n.id)} 
                        className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition-all"
                        title="Remover Nota"
                       >
                         <Trash2 className="h-4 w-4" />
                       </button>
                    </div>
                    <p className="text-sm font-medium text-neutral-700 leading-relaxed">{n.nota}</p>
                  </div>
                ))}
                {notas.length === 0 && (
                  <div className="py-12 text-center border-2 border-dashed border-neutral-100 rounded-[2rem]">
                    <Clock className="h-10 w-10 text-neutral-200 mx-auto mb-3" />
                    <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Sem registros históricos</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Financial & Actions */}
        <div className="space-y-10">
          
          {/* Financial Summary */}
          <section className="bg-neutral-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 -mt-10 -ml-10 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl"></div>
            
            <h3 className="mb-10 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Consolidado Financeiro</h3>
            
            <div className="space-y-6">
               <div className="flex justify-between items-center px-2">
                 <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Serviço Base</span>
                 <span className="font-black text-white/90">{formatCurrency(orcamentoData?.valor_servico || 0)}</span>
               </div>
               
               {orcamentoData?.valor_adicional > 0 && (
                 <div className="flex flex-col gap-1 px-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Extras</span>
                      <span className="font-black text-white/90">{formatCurrency(orcamentoData.valor_adicional)}</span>
                    </div>
                    <p className="text-[9px] text-white/40 italic truncate opacity-60 uppercase">{orcamentoData.descricao_adicional}</p>
                 </div>
               )}

               <div className="flex justify-between items-center px-2">
                 <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Encargos (+)</span>
                 <span className="font-black text-emerald-400">+ {formatCurrency(orcamentoData?.acrescimo || 0)}</span>
               </div>
               
               <div className="flex justify-between items-center px-2">
                 <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Bonificações (-)</span>
                 <span className="font-black text-red-400">- {formatCurrency(orcamentoData?.desconto || 0)}</span>
               </div>
               
               <div className="mt-10 pt-10 border-t border-white/10">
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2 text-center">Valor do Contrato</p>
                  <p className="text-4xl font-black text-center tracking-tighter">{formatCurrency(orcamentoData?.total || 0)}</p>
               </div>
            </div>
          </section>

          {/* Profitability */}
          <div className="rounded-[2.5rem] overflow-hidden shadow-sm ring-1 ring-black/5">
            <PainelRentabilidade tipo="previsto" osId={os.id} />
          </div>

          {/* Actions */}
          <div className="space-y-6">
            <PDFExportMenu 
              onDownload={() => generateOSPDF(os, (os as any).clientes, (os as any).orcamentos)}
              onWhatsApp={async () => {
                const doc = await generateOSPDF(os, (os as any).clientes, (os as any).orcamentos, { returnDoc: true });
                if (doc) {
                  const result = await pdfSharingService.uploadAndGetLink(doc as any, `os_${os.codigo_os}.pdf`);
                  if (result) {
                    await pdfSharingService.shareViaWhatsApp((os as any).clientes.telefone || '', result.url, 'Ordem de Serviço', os.codigo_os);
                    setTimeout(() => pdfSharingService.deleteTempFile(result.path), 86400000);
                  }
                }
              }}
              onEmail={async () => {
                const doc = await generateOSPDF(os, (os as any).clientes, (os as any).orcamentos, { returnDoc: true });
                if (doc) {
                  const result = await pdfSharingService.uploadAndGetLink(doc as any, `os_${os.codigo_os}.pdf`);
                  if (result) {
                    await pdfSharingService.shareViaEmail((os as any).clientes.email || '', 'Ordem de Serviço', os.codigo_os, result.url);
                    setTimeout(() => pdfSharingService.deleteTempFile(result.path), 86400000);
                  }
                }
              }}
            />

            {os.status === 'andamento' && (
              <div className="space-y-3">
                {isAwaitingFinalization && (
                  <button 
                    onClick={() => setIsFinalizeModalOpen(true)}
                    className="w-full rounded-[1.5rem] bg-emerald-600 py-6 font-black text-xs uppercase tracking-[0.2em] text-white hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 active:scale-95 shadow-lg shadow-emerald-600/20"
                  >
                    <CheckCircle className="h-5 w-5" />
                    Finalizar e Entregar
                  </button>
                )}
                <button 
                  onClick={() => setIsDocRequestModalOpen(true)}
                  className="w-full rounded-[1.5rem] bg-indigo-50 py-6 font-black text-xs uppercase tracking-[0.2em] text-indigo-600 hover:bg-indigo-100 transition-all flex items-center justify-center gap-3 active:scale-95 shadow-sm"
                >
                  <FileUp className="h-5 w-5" />
                  Solicitar Documentos
                </button>
                <button 
                  onClick={onCancel}
                  disabled={hasInternalDemand}
                  className={`w-full rounded-[1.5rem] py-6 text-xs font-black uppercase tracking-[0.2em] transition-all shadow-sm ${
                    hasInternalDemand 
                      ? 'bg-neutral-50 text-neutral-300 ring-1 ring-neutral-200 cursor-not-allowed opacity-50' 
                      : 'bg-white text-red-500 ring-1 ring-red-100 hover:bg-red-50 hover:text-red-700'
                  }`}
                >
                  {hasInternalDemand ? 'Cancelamento Bloqueado (Em Fluxo)' : 'Cancelar Ordem de Serviço'}
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      <Modal
        isOpen={isFinalizeModalOpen}
        onClose={() => setIsFinalizeModalOpen(false)}
        title="Confirmar Finalização da OS"
        size="wide"
      >
        <div className="space-y-6">
          <div className="p-6 rounded-[2rem] bg-emerald-50 border border-emerald-100">
             <div className="flex items-center gap-4 mb-4">
                <div className="h-12 w-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <CheckCircle className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-black text-emerald-900 uppercase tracking-tight">Análise de Entrega Concluída?</h3>
             </div>
             <p className="text-sm text-emerald-700 leading-relaxed font-medium">
               Ao confirmar, a Ordem de Serviço será marcada como <strong>Concluída</strong>. O cliente receberá os arquivos finais e uma fatura será gerada automaticamente no valor de <strong>{formatCurrency(orcamentoData?.total || 0)}</strong>.
             </p>
          </div>
          
          <div className="flex gap-4">
            <button 
              onClick={() => setIsFinalizeModalOpen(false)}
              className="flex-1 rounded-2xl bg-neutral-100 py-4 text-xs font-black uppercase tracking-widest text-neutral-600 hover:bg-neutral-200"
            >
              Voltar
            </button>
            <button 
              onClick={confirmFinalizeOS}
              disabled={isSubmitting}
              className="flex-1 rounded-2xl bg-emerald-600 py-4 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 disabled:opacity-50"
            >
              {isSubmitting ? 'Processando...' : 'Confirmar e Entregar'}
            </button>
          </div>
        </div>
      </Modal>

      {isDocRequestModalOpen && (
        <Modal
          isOpen={isDocRequestModalOpen}
          onClose={() => setIsDocRequestModalOpen(false)}
          title="Solicitar Documentos ao Cliente"
          size="wide"
        >
          <div className="space-y-6">
            <p className="text-sm text-neutral-600 leading-relaxed">
              Liste abaixo os documentos que o cliente precisa enviar para o prosseguimento desta Ordem de Serviço. O cliente será notificado e um aviso aparecerá no acompanhamento do serviço dele.
            </p>
            <div className="space-y-4">
              {requestedDocs.map((doc, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={doc}
                    onChange={(e) => {
                      const newDocs = [...requestedDocs];
                      newDocs[idx] = e.target.value;
                      setRequestedDocs(newDocs);
                    }}
                    placeholder={`Ex: RG, CNH, Comprovante de Endereço...`}
                    className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                  {requestedDocs.length > 1 && (
                    <button
                      onClick={() => setRequestedDocs(requestedDocs.filter((_, i) => i !== idx))}
                      className="rounded-xl bg-red-50 px-4 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      <XCircle className="h-5 w-5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setRequestedDocs([...requestedDocs, ''])}
                className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700"
              >
                <Plus className="h-4 w-4" />
                Adicionar mais um documento
              </button>
            </div>
            
            <div className="flex gap-4 pt-4 border-t border-neutral-100">
              <button
                onClick={() => setIsDocRequestModalOpen(false)}
                className="flex-1 rounded-xl border border-neutral-200 py-3 text-sm font-bold text-neutral-600 hover:bg-neutral-50 transition-colors"
                disabled={isSubmitting}
              >
                Cancelar
              </button>
              <button
                onClick={handleRequestDocumentsOS}
                disabled={isSubmitting}
                className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20 disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Enviar Solicitação
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PDFExportMenu({ onDownload, onWhatsApp, onEmail }: any) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative w-full">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-[1.5rem] bg-indigo-600 py-6 font-black text-xs uppercase tracking-[0.2em] text-white shadow-2xl shadow-indigo-600/20 hover:bg-indigo-700 flex items-center justify-center gap-3 transition-all active:scale-95"
      >
        <Printer className="h-5 w-5" />
        Exportar Documento
      </button>
      
      {isOpen && (
        <div className="absolute bottom-full left-0 w-full mb-3 bg-white rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] ring-1 ring-black/5 p-3 z-50 flex flex-col gap-2 animate-in slide-in-from-bottom-2 fade-in duration-300">
          <button onClick={() => { setIsOpen(false); onDownload(); }} className="w-full text-left px-5 py-4 hover:bg-neutral-50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-neutral-700 flex items-center justify-between transition-colors">
            Baixar PDF (Cópia Local)
            <Printer className="h-4 w-4 text-neutral-300"/>
          </button>
          <button onClick={() => { setIsOpen(false); onWhatsApp(); }} className="w-full text-left px-5 py-4 hover:bg-emerald-50 text-emerald-700 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-between transition-colors">
            Enviar via WhatsApp
            <Send className="h-4 w-4 text-emerald-400"/>
          </button>
          <button onClick={() => { setIsOpen(false); onEmail(); }} className="w-full text-left px-5 py-4 hover:bg-indigo-50 text-indigo-700 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-between transition-colors">
            Enviar via E-mail
            <MessageSquare className="h-4 w-4 text-indigo-400"/>
          </button>
        </div>
      )}
    </div>
  );
}

