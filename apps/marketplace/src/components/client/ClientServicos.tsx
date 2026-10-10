import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { createNotification } from '../../lib/notifications';
import { notificationService } from '../../lib/notificationService';
import { OS } from '../../types';
import { formatCurrency, formatDate, formatDateTime, generateCode, handleError } from '../../lib/utils';
import { useFileViewer } from '../../contexts/FileViewerContext';
import { ClipboardList, Clock, CheckCircle, XCircle, MessageSquare, Download, FileText, AlertCircle, Send, UploadCloud, Paperclip, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { toast } from 'react-hot-toast';
import { useAutoFitTabs } from '../../hooks/useAutoFitTabs';
import { useRealtimeSubscription } from '../../hooks/useRealtime';
import { clientOperationalWrite } from '../../lib/clientOperationalWrite';
import { removePrivateDocument, uploadPrivateDocument } from '../../lib/privateStorage';
import { useWhatsAppDocument } from '../../hooks/useWhatsAppDocument';
import { generateOSPDF } from '../../lib/pdf';
import { whatsappNotificationService } from '../../lib/whatsappNotificationService';

export function ClientServicos({ 
  clientId, 
  initialTab, 
  initialItemId,
  onNavigate
}: { 
  clientId: string, 
  initialTab?: string, 
  initialItemId?: string,
  onNavigate?: (module: string, tab?: string) => void
}) {
  const [activeTab, setActiveTab] = useState<'andamento' | 'concluido' | 'cancelado'>(
    (initialTab as any) || 'andamento'
  );
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 640 : false);
  const [servicos, setServicos] = useState<OS[]>([]);
  const { isSendingWhatsApp, sendToWhatsApp } = useWhatsAppDocument();
  const [selectedOS, setSelectedOS] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<'detalhes' | 'suporte'>('detalhes');
  const [pendencyFiles, setPendencyFiles] = useState<{ [docIndex: number]: File }>({});
  const [isSubmittingDocs, setIsSubmittingDocs] = useState(false);
  const hasAutoOpened = useRef<string | null>(null);
  const activeTabRef = useRef(activeTab);
  const selectedOSRef = useRef(selectedOS);
  const { containerRef: tabContainerRef, setButtonRef } = useAutoFitTabs(16, 10);
  const { openFile } = useFileViewer();

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { selectedOSRef.current = selectedOS; }, [selectedOS]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab as any);
  }, [initialTab]);

  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (initialItemId && servicos.length > 0 && hasAutoOpened.current !== initialItemId) {
      const item = servicos.find(s => s.id === initialItemId);
      if (item) {
        hasAutoOpened.current = initialItemId;
        
        if (item.status === 'andamento') setActiveTab('andamento');
        else if (item.status === 'concluido') setActiveTab('concluido');
        else if (item.status === 'cancelado') setActiveTab('cancelado');

        setSelectedOS(item);
        setIsModalOpen(true);

        // Scroll to the item
        setTimeout(() => {
          const element = document.getElementById(`os-${initialItemId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedItemId(item.id);
            setTimeout(() => setHighlightedItemId(null), 3000);
          }
        }, 300);
      } else {
        if (initialTab && initialTab !== activeTab) {
          setActiveTab(initialTab as any);
        }
      }
    }
  }, [initialItemId, servicos.length, initialTab]);

  useEffect(() => {
    fetchServicos();
  }, [activeTab, clientId, isMobile]);

  useRealtimeSubscription(
    [
      {
        table: 'ordens_servico',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        debounceMs: 300,
        onChange: fetchServicos,
        onPayload: (payload) => {
          if (payload.new && selectedOSRef.current && (payload.new as any).id === selectedOSRef.current.id) {
            setSelectedOS((prev) => (prev ? ({ ...prev, ...payload.new } as any) : null));
          }
        },
      },
      {
        table: 'orcamentos',
        filter: clientId ? `cliente_id=eq.${clientId}` : undefined,
        debounceMs: 300,
        onChange: fetchServicos,
      },
      {
        table: 'os_notas',
        onChange: fetchServicos,
      },
      {
        table: 'os_suporte_mensagens',
        onChange: fetchServicos,
      },
    ],
    [clientId, activeTab, isMobile]
  );

  async function fetchServicos() {
    let query = supabase
      .from('ordens_servico')
      .select('*, orcamentos(*, servicos(nome))')
      .eq('cliente_id', clientId)
      .order('codigo_os', { ascending: false });

    if (!isMobile) {
      query = query.eq('status', activeTab);
    }
    
    const { data } = await query;
    if (data) setServicos(data as any);
  };

  const handleOpenDetails = (os: any) => {
    setSelectedOS(os);
    setPendencyFiles({});
    setIsModalOpen(true);
  };

  const handleFileChange = (index: number, file: File | null) => {
    setPendencyFiles(prev => {
      const next = { ...prev };
      if (file) {
        next[index] = file;
      } else {
        delete next[index];
      }
      return next;
    });
  };

  const handleSubmitOSDocuments = async () => {
    if (!selectedOS) return;

    const docsSolicitados = selectedOS.documentos_solicitados_os || [];
    if (Object.keys(pendencyFiles).length < docsSolicitados.length) {
      toast.error('Envie todos os documentos solicitados.');
      return;
    }

    const uploadedReferences: string[] = [];
    let documentsPersisted = false;
    setIsSubmittingDocs(true);

    try {
      const novosAnexos: Array<{
        nome: string;
        url: string;
        mime_type: string;
        size: number;
      }> = [];

      for (let i = 0; i < docsSolicitados.length; i++) {
        const pendingFile = pendencyFiles[i];
        if (!pendingFile) continue;

        const uploaded = await uploadPrivateDocument(pendingFile, {
          scope: 'clientes',
          ownerId: selectedOS.cliente_id || clientId,
          context: 'ordens-servico',
          contextId: selectedOS.id,
        });

        uploadedReferences.push(uploaded.reference);
        novosAnexos.push({
          nome: docsSolicitados[i],
          url: uploaded.reference,
          mime_type: uploaded.mimeType,
          size: uploaded.size,
        });
      }

      const anexosFinais = [...(selectedOS.anexos_os || []), ...novosAnexos];

      await clientOperationalWrite(clientId, 'ordens_servico', 'update', {
        anexos_os: anexosFinais,
        documentos_solicitados_os: null,
      }, { id: selectedOS.id });
      documentsPersisted = true;

      await clientOperationalWrite(clientId, 'os_notas', 'insert', {
        os_id: selectedOS.id,
        nota: 'Cliente enviou os documentos solicitados.',
      });

      await notificationService.notifyAdmin(
        '📁 Documentos de OS Recebidos',
        `O cliente enviou os documentos solicitados para a OS ${selectedOS.codigo_os}.`,
        'vendas',
        'os_documento_enviado',
        { tab: 'os', itemId: selectedOS.id, prioridade: 'alta' },
      );

      toast.success('Documentos enviados com segurança!');
      setPendencyFiles({});
      setSelectedOS({
        ...selectedOS,
        anexos_os: anexosFinais,
        documentos_solicitados_os: null,
      });
    } catch (err: any) {
      if (!documentsPersisted && uploadedReferences.length > 0) {
        await Promise.allSettled(uploadedReferences.map(reference => removePrivateDocument(reference)));
      }
      toast.error(handleError(err, 'enviar documentos'));
    } finally {
      setIsSubmittingDocs(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="w-full hidden sm:block">
        <div ref={tabContainerRef} className="flex w-full gap-1 rounded-3xl bg-neutral-200/50 p-1 ring-1 ring-neutral-300 shadow-inner">
          {['andamento', 'concluido', 'cancelado'].map((t, index) => (
            <button 
              key={t}
              ref={setButtonRef(index)}
              onClick={() => setActiveTab(t as any)}
              className={`min-w-0 flex-1 whitespace-nowrap rounded-2xl px-1.5 py-2.5 font-black capitalize transition-all sm:px-6 ${activeTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
            >
              {t === 'andamento' ? 'Em Execução' : t === 'concluido' ? 'Concluídas' : 'Canceladas'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {servicos.map((os) => (
          <div id={`os-${os.id}`} key={os.id} className={`group overflow-hidden rounded-3xl p-1 transition-all duration-500 relative ${highlightedItemId === os.id ? 'bg-indigo-50 ring-4 ring-indigo-500 shadow-2xl shadow-indigo-500/20 scale-[1.02] z-10' : 'bg-white shadow-md hover:shadow-xl ring-1 ring-neutral-300'}`}>
            {highlightedItemId === os.id && (
              <span className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 ring-4 ring-white animate-pulse z-20 flex items-center justify-center">
                <span className="h-2 w-2 rounded-full bg-white" />
              </span>
            )}
            <div className="flex flex-col lg:flex-row bg-white rounded-3xl m-0.5">
              <div className="flex-1 p-8">
                <div className="mb-6 flex items-center justify-between">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${os.status === 'andamento' ? 'bg-indigo-50 text-indigo-600' : os.status === 'concluido' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                    <ClipboardList className="h-6 w-6" />
                  </div>
                  <span className="font-mono text-xs font-bold text-indigo-600">{os.codigo_os}</span>
                </div>

                <h3 className="text-xl font-black text-neutral-900 tracking-tight">#{os.codigo_os}</h3>
                <p className="text-sm font-medium text-neutral-500 mb-4">Referente a: <span className="text-neutral-900">{(os as any).orcamentos?.servicos?.nome}</span></p>
                
                <div className="mt-6 space-y-3 rounded-2xl bg-neutral-100/50 p-6 ring-1 ring-neutral-300">
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-500">Valor do Serviço</span>
                    <span className="font-bold text-neutral-900">{formatCurrency((os as any).orcamentos?.valor_servico)}</span>
                  </div>
                  
                  {(os as any).orcamentos?.valor_adicional > 0 && (
                    <div className="space-y-1 border-t border-neutral-100 pt-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-500">Valor Adicional</span>
                        <span className="font-bold text-neutral-900">{formatCurrency((os as any).orcamentos?.valor_adicional)}</span>
                      </div>
                      {(os as any).orcamentos?.descricao_adicional && (
                        <p className="text-[10px] text-neutral-400 italic leading-tight bg-white/50 p-1.5 rounded-lg">
                          <span className="font-bold uppercase mr-1">Detalhes:</span>
                          {(os as any).orcamentos?.descricao_adicional}
                        </p>
                      )}
                    </div>
                  )}

                  {(os as any).orcamentos?.acrescimo > 0 && (
                    <div className="flex justify-between text-sm text-amber-600 border-t border-neutral-100 pt-2">
                      <span className="font-bold">Acréscimo</span>
                      <span className="font-bold">+ {formatCurrency((os as any).orcamentos?.acrescimo)}</span>
                    </div>
                  )}

                  {(os as any).orcamentos?.desconto > 0 && (
                    <div className="flex justify-between text-sm text-emerald-600 border-t border-neutral-100 pt-2">
                      <span className="font-bold">Desconto</span>
                      <span className="font-bold">- {formatCurrency((os as any).orcamentos?.desconto)}</span>
                    </div>
                  )}
                </div>

                <div className="mt-8 grid grid-cols-2 gap-6 border-t border-neutral-100 pt-6">
                  <div>
                    <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Iniciado em</p>
                    <p className="font-bold text-neutral-900">{formatDate(os.data_inicio)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Total Final</p>
                    <p className="font-bold text-indigo-600">{formatCurrency((os as any).orcamentos?.total)}</p>
                  </div>
                </div>

                {os.status === 'cancelado' && (
                  <div className="mt-6">
                    <button
                      onClick={() => handleOpenDetails(os)}
                      className="w-full rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600 transition-colors hover:bg-red-100 flex items-center justify-center gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      Detalhes do Cancelamento
                    </button>
                  </div>
                )}

                {os.status === 'concluido' && (
                  <div className="mt-6">
                    <button
                      onClick={() => handleOpenDetails(os)}
                      className="w-full rounded-xl bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-600 transition-colors hover:bg-indigo-100 flex items-center justify-center gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      Detalhes do Serviço
                    </button>
                  </div>
                )}
                {os.status === 'andamento' && (
                  <div className="mt-6">
                    <button
                      onClick={() => handleOpenDetails(os)}
                      className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700 flex items-center justify-center gap-2"
                    >
                      <Clock className="h-4 w-4" />
                      Acompanhar Serviço
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {servicos.length === 0 && (
          <div className="py-24 text-center">
            <p className="text-neutral-400 font-medium">Nenhum serviço encontrado nesta categoria.</p>
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedOS?.status === 'concluido' ? "Detalhes do Serviço Concluído" : selectedOS?.status === 'cancelado' ? "Detalhes do Cancelamento" : "Acompanhamento do Serviço"}
        size="full"
      >
        {selectedOS && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-neutral-100 p-6 ring-1 ring-neutral-300">
              <h3 className="text-2xl font-black text-neutral-900 tracking-tight">#{selectedOS.codigo_os}</h3>
              <p className="text-base font-medium text-neutral-500 mb-6">Referente a: <span className="text-neutral-900">{selectedOS.orcamentos?.servicos?.nome}</span></p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Data de Início</p>
                  <p className="font-bold text-neutral-900">{formatDate(selectedOS.data_inicio)}</p>
                </div>
                {selectedOS.status === 'concluido' && (
                  <>
                    <div>
                      <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Data de Entrega</p>
                      <p className="font-bold text-neutral-900">{selectedOS.data_entrega ? formatDate(selectedOS.data_entrega) : formatDate(selectedOS.data_fim)}</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-6 border-b border-neutral-200">
              <button
                onClick={() => setActiveModalTab('detalhes')}
                className={`pb-3 text-sm font-bold transition-colors border-b-2 flex items-center gap-2 ${activeModalTab === 'detalhes' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
              >
                <FileText className="h-4 w-4" /> Detalhes
              </button>
              <button
                onClick={() => setActiveModalTab('suporte')}
                className={`pb-3 text-sm font-bold transition-colors border-b-2 flex items-center gap-2 ${activeModalTab === 'suporte' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
              >
                <MessageSquare className="h-4 w-4" /> Suporte
              </button>
            </div>

            {activeModalTab === 'detalhes' ? (
              <div className="space-y-6">

            {selectedOS.status === 'cancelado' && (
              <div className="rounded-2xl bg-red-50 p-6 ring-1 ring-red-100 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 shadow-sm">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-red-900">Serviço Cancelado</h3>
                    <p className="text-sm text-red-700 mt-0.5">Este serviço foi interrompido.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">Cancelado em</p>
                    <p className="text-sm font-bold text-red-900">{selectedOS.data_fim ? formatDateTime(selectedOS.data_fim) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-1">Motivo do Cancelamento</p>
                    <p className="text-sm font-medium text-red-900">{selectedOS.motivo_cancelamento || 'Motivo não informado.'}</p>
                  </div>
                </div>
              </div>
            )}

            {selectedOS.status === 'concluido' && (
              <>
                {selectedOS.tipo_entrega === 'online' && selectedOS.link_documento && (
                  <div className="rounded-2xl bg-indigo-50 p-6 ring-1 ring-indigo-100 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                      <FileText className="h-8 w-8" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-indigo-900">Seu documento está pronto!</h4>
                      <p className="text-sm text-indigo-700 mt-1">Clique no botão abaixo para baixar o seu documento.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openFile(selectedOS.link_documento, 'Entregável')}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700 shadow-sm"
                    >
                      <Download className="h-4 w-4" />
                      Visualizar Documento
                    </button>
                  </div>
                )}
                
                {selectedOS.tipo_entrega === 'whatsapp' && (
                  <div className="rounded-2xl bg-emerald-50 p-6 ring-1 ring-emerald-100 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <CheckCircle className="h-8 w-8" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-emerald-900">Serviço Entregue</h4>
                      <p className="text-sm text-emerald-700 mt-1">Este serviço foi entregue via WhatsApp na data informada acima.</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Pendência de Documentos */}
            {selectedOS.status === 'andamento' && selectedOS.documentos_solicitados_os?.length > 0 && (
              <div className="rounded-2xl bg-amber-50 p-6 ring-1 ring-amber-200/50 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shadow-sm">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-amber-900">Documentos Solicitados</h3>
                    <p className="text-sm text-amber-700 mt-0.5">A administração solicitou arquivos adicionais para prosseguir.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {selectedOS.documentos_solicitados_os.map((doc: string, idx: number) => (
                    <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white ring-1 ring-inset ring-amber-100">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        <span className="text-sm font-bold text-amber-900">{doc}</span>
                      </div>
                      <div className="w-full sm:w-auto relative group">
                        <input
                          type="file"
                          id={`os-doc-${idx}`}
                          className="hidden"
                          accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx"
                           onChange={(e) => handleFileChange(idx, e.target.files?.[0] || null)}
                        />
                        <label
                          htmlFor={`os-doc-${idx}`}
                          className={`w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-2 text-sm font-bold transition-all cursor-pointer ${
                            pendencyFiles[idx]
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                              : 'border-amber-200 hover:border-amber-400 text-amber-700'
                          }`}
                        >
                          {pendencyFiles[idx] ? (
                            <>
                              <CheckCircle className="h-4 w-4" />
                              {pendencyFiles[idx].name}
                            </>
                          ) : (
                            <>
                              <UploadCloud className="h-4 w-4" />
                              Anexar Arquivo
                            </>
                          )}
                        </label>
                      </div>
                    </div>
                  ))}
                  
                  <button
                    onClick={handleSubmitOSDocuments}
                    disabled={isSubmittingDocs || Object.keys(pendencyFiles).length < selectedOS.documentos_solicitados_os.length}
                    className="w-full mt-4 flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-4 text-sm font-bold text-white transition-all hover:bg-amber-600 disabled:opacity-50 shadow-lg shadow-amber-500/20 active:scale-95"
                  >
                    {isSubmittingDocs ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Enviar Documentos
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Documentos Anexados / Enviados */}
            {selectedOS.anexos_os?.length > 0 && (
              <div className="rounded-2xl bg-neutral-50 p-6 ring-1 ring-neutral-200">
                <h4 className="text-sm font-black uppercase tracking-widest text-neutral-500 mb-4 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500" /> Documentos Enviados
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedOS.anexos_os.map((doc: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white shadow-sm ring-1 ring-inset ring-neutral-200/50">
                      <div className="flex items-center gap-2 truncate pr-2">
                        <FileText className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                        <span className="text-xs font-bold text-neutral-700 truncate">{doc.nome}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openFile(doc.url, doc.nome)}
                        className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                        title="Visualizar no Sistema"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h4 className="font-bold text-neutral-900">Histórico de Acompanhamento</h4>
              <OSNotas osId={selectedOS.id} />
            </div>
            </div>
            ) : (
              <OSSuporteChat osId={selectedOS.id} clientId={clientId} remetenteId={clientId} remetenteTipo="cliente" isConcluida={selectedOS.status === 'concluido'} />
            )}
            {activeModalTab === 'detalhes' ? (
              <div className="mt-4 pb-16">
                <button
                  onClick={async () => {
                    try {
                      // Fetch full OS data for the PDF (like orcamentos and cliente) if needed.
                      // Wait, selectedOS should already have these.
                      const doc = await generateOSPDF(selectedOS, selectedOS.clientes, selectedOS.orcamentos, { returnDoc: true }) as any;
                      const pdfBase64 = doc.output('datauristring');
                      
                      const mensagemBase = whatsappNotificationService.gerarMensagemWhatsApp({
                        tipo: 'os',
                        clienteNome: selectedOS.clientes?.nome,
                        codigo: selectedOS.codigo_os,
                        status: selectedOS.status === 'concluido' ? 'Concluída' : selectedOS.status === 'cancelado' ? 'Cancelada' : 'Em Andamento',
                        dataVencimento: selectedOS.data_previsao_entrega ? formatDate(selectedOS.data_previsao_entrega) : undefined,
                      });
                      
                      await sendToWhatsApp(
                        selectedOS.clientes?.telefone,
                        mensagemBase,
                        pdfBase64,
                        `os_${selectedOS.codigo_os}.pdf`
                      );
                    } catch (error) {
                      console.error(error);
                      toast.error("Erro ao gerar PDF da OS.");
                    }
                  }}
                  disabled={isSendingWhatsApp}
                  className="w-full mb-6 flex items-center justify-center gap-2 rounded-xl bg-emerald-100 py-4 text-sm font-bold text-emerald-800 hover:bg-emerald-200 border border-emerald-200 transition-all disabled:opacity-50"
                >
                  {isSendingWhatsApp ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" /> : <MessageSquare className="h-5 w-5" />}
                  {isSendingWhatsApp ? 'Enviando...' : 'Enviar OS p/ meu WhatsApp'}
                </button>
            </div>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}

function OSNotas({ osId }: { osId: string }) {
  const [notas, setNotas] = useState<any[]>([]);

  const fetchNotas = async () => {
    const { data } = await supabase.from('os_notas').select('*').eq('os_id', osId).order('data_criacao', { ascending: false });
    if (data) setNotas(data);
  };

  useEffect(() => {
    fetchNotas();

    const channel = supabase
      .channel('notas-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'os_notas',
        filter: `os_id=eq.${osId}`
      }, () => {
        fetchNotas();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [osId]);

  return (
    <div className="space-y-3">
      {notas.map(n => (
        <div key={n.id} className="rounded-xl bg-white p-4 text-sm shadow-md ring-1 ring-neutral-300 overflow-hidden">
          <p className="text-neutral-700 break-words whitespace-pre-wrap">{n.nota}</p>
          <p className="mt-2 text-[10px] font-bold text-neutral-400">{formatDateTime(n.data_criacao)}</p>
        </div>
      ))}
      {notas.length === 0 && <p className="text-xs text-neutral-400 italic">Nenhuma atualização registrada.</p>}
    </div>
  );
}

export function OSSuporteChat({ osId, clientId, remetenteId, remetenteTipo, isConcluida }: { osId: string, clientId: string, remetenteId: string, remetenteTipo: 'cliente' | 'admin', isConcluida?: boolean }) {
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
      .channel('os-suporte-chat')
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
    let uploadedReference: string | null = null;
    let messagePersisted = false;

    try {
      let mensagemTexto = novaMensagem.trim();

      if (anexoFile) {
        const uploaded = await uploadPrivateDocument(anexoFile, {
          scope: 'clientes',
          ownerId: clientId,
          context: 'ordens-servico',
          contextId: osId,
        });
        uploadedReference = uploaded.reference;

        const safeDisplayName = uploaded.fileName.replace(/\|/g, '_');
        const anexoStr = `[ANEXO|${safeDisplayName}|${uploaded.reference}|${uploaded.mimeType}]`;
        mensagemTexto = mensagemTexto ? `${mensagemTexto}\n\n${anexoStr}` : anexoStr;
      }

      await clientOperationalWrite(clientId, 'os_suporte_mensagens', 'insert', {
        os_id: osId,
        remetente_tipo: remetenteTipo,
        remetente_id: remetenteId,
        mensagem: mensagemTexto,
      });
      messagePersisted = true;

      await notificationService.notifyAdmin(
        '💬 Nova Mensagem do Cliente',
        `O cliente enviou uma nova mensagem na OS #${osId.slice(0, 8)}.`,
        'demandas',
        'sistema',
        { itemId: osId, tab: 'ativas', prioridade: 'normal' },
      );

      setNovaMensagem('');
      setAnexoFile(null);
    } catch (err) {
      if (!messagePersisted && uploadedReference) {
        await removePrivateDocument(uploadedReference).catch(() => undefined);
      }
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
          <h4 className="font-bold text-neutral-900">Suporte em Tempo Real</h4>
          <p className="text-xs text-neutral-500">Tire suas dúvidas ou envie informações.</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-neutral-50/50">
        {mensagens.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-neutral-400">
            <MessageSquare className="h-8 w-8 mb-3 opacity-20" />
            <p className="text-sm font-medium">Nenhuma mensagem ainda.</p>
            <p className="text-xs">Inicie a conversa enviando uma mensagem abaixo.</p>
          </div>
        ) : (
          mensagens.map((msg) => {
            const isMe = msg.remetente_tipo === remetenteTipo;
            const anexoMatch = msg.mensagem.match(/\[ANEXO\|(.*?)\|(.*?)(?:\|(.*?))?\]/);
            const textContent = msg.mensagem.replace(/\[ANEXO\|.*?\|.*?(?:\|.*?)?\]/, '').trim();
            const fileName = anexoMatch ? anexoMatch[1] : null;
            const fileUrl = anexoMatch ? anexoMatch[2] : null;

            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div 
                  className={`max-w-[80%] rounded-2xl px-5 py-3 flex flex-col gap-2 ${
                    isMe 
                      ? 'bg-indigo-600 text-white rounded-br-sm' 
                      : 'bg-white border border-neutral-200 text-neutral-800 rounded-bl-sm shadow-sm'
                  }`}
                >
                  {textContent && <p className="text-sm whitespace-pre-wrap">{textContent}</p>}
                  
                  {anexoMatch && (
                    <button
                      type="button"
                      onClick={() => void openFile(fileUrl!, fileName!)}
                      className={`mt-1 flex max-w-[240px] items-center gap-2 rounded-xl border p-3 transition-opacity hover:opacity-90 ${isMe ? 'border-white/20 bg-white/10' : 'border-neutral-200 bg-neutral-50'}`}
                    >
                      <Paperclip className={`h-5 w-5 shrink-0 ${isMe ? 'text-white' : 'text-indigo-600'}`} />
                      <span className={`truncate text-xs font-semibold ${isMe ? 'text-white' : 'text-neutral-700'}`}>{fileName}</span>
                      <Download className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] font-bold text-neutral-400 mt-1 px-1">
                  {formatDateTime(msg.created_at)}
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
            placeholder="Digite sua mensagem..."
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
