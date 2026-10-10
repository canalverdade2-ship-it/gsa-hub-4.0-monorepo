import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import {
  FileText, Plus, CheckCircle, XCircle, Trash2, Shield, Upload, Clock, Calendar
} from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { formatDateTime } from '../../../lib/utils';
import { canDeleteRecord } from '../../../lib/deleteRequest';
import { useAdminNotifications } from '../../../hooks/useAdminNotifications';
import { notificationService } from '../../../lib/notificationService';
import { whatsappNotificationService } from '../../../lib/whatsappNotificationService';
import { AdminWhatsAppButton } from '../ui/AdminWhatsAppButton';
import { uploadFile, removeFile, getPublicFileUrl } from '../../../lib/storage';

interface AdminClienteDocumentosProps {
  clienteId: string;
  clienteNome?: string;
  clienteTelefone?: string;
}

export function AdminClienteDocumentos({ clienteId, clienteNome, clienteTelefone }: AdminClienteDocumentosProps) {
  const { refreshCounts } = useAdminNotifications();
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);

  const [requestData, setRequestData] = useState({ nome: '', tipo: 'documento', outroTipo: '' });
  const [uploadData, setUploadData] = useState({ nome: '', tipo: 'contrato', outroTipo: '', files: [] as File[] });
  const [rejectReason, setRejectReason] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [monthFilter, setMonthFilter] = useState('');

  useEffect(() => {
    fetchDocumentos();

    const channel = supabase
      .channel(`admin-cliente-docs-${clienteId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cliente_documentos',
        filter: `cliente_id=eq.${clienteId}`
      }, fetchDocumentos)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clienteId, monthFilter]);

  const fetchDocumentos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('cliente_documentos')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      let filtered = data || [];
      if (monthFilter) {
        filtered = filtered.filter((d: any) => d.created_at?.startsWith(monthFilter));
      }
      setDocumentos(filtered);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao buscar documentos.');
    } finally {
      setLoading(false);
    }
  };

  // ── Requisitar documento (cliente precisa enviar) ─────────────────────────
  const handleRequestDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const tipo = requestData.tipo === 'outro' ? requestData.outroTipo : requestData.tipo;
      const { data: docData, error } = await supabase.from('cliente_documentos').insert([{
        cliente_id: clienteId,
        nome: requestData.nome,
        tipo,
        status: 'pendente'
      }]).select('id').single();
      
      if (error) throw error;
      
      // Criar a notificação alertando o cliente com a rota correta
      await notificationService.notifyClient(
        clienteId,
        '📄 Documento Solicitado',
        `Foi solicitada a submissão do documento: ${requestData.nome}. Por favor, acesse seu perfil na aba Meus Documentos para enviar.`,
        'perfil',
        'documento_solicitado',
        { tab: 'documentos' }
      );

      // Automação: Registrar a pendência para habilitar resposta direta e enviar no WhatsApp.
      // A automação é opcional: se a função de pendência não existir no banco, o fluxo
      // principal (documento solicitado + notificação) não pode ser interrompido.
      if (clienteTelefone) {
        try {
          const { error: pendenciaError } = await supabase.rpc('gsa_registrar_pendencia_whatsapp', {
            p_cliente_id: clienteId,
            p_telefone: clienteTelefone,
            p_modulo: 'documentos',
            p_registro_id: docData.id,
            p_tipo_esperado: 'arquivo',
            p_mensagem_contexto: `Envio pendente de: ${requestData.nome}`
          });
          if (pendenciaError) {
            console.warn('Automação de pendência WhatsApp indisponível:', pendenciaError.message);
          }
        } catch (pendenciaError) {
          console.warn('Automação de pendência WhatsApp indisponível:', pendenciaError);
        }

        const msgWhats = whatsappNotificationService.gerarMensagemWhatsApp({
          tipo: 'documento_cliente',
          clienteNome,
          status: 'pendente',
          titulo: requestData.nome
        });
        
        whatsappNotificationService.enviarWhatsAppDireto(clienteTelefone, msgWhats)
          .catch(err => console.warn('Falha no envio de WA direto (documento_solicitado):', err));
      }

      toast.success('Documento solicitado com sucesso.');
      refreshCounts?.();
      setIsRequestModalOpen(false);
      setRequestData({ nome: '', tipo: 'cpf_rg', outroTipo: '' });
    } catch (e) {
      console.error(e);
      toast.error('Erro ao solicitar documento.');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Upload direto pelo admin (aprovado imediatamente) ─────────────────────
  const handleAdminUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadData.files.length === 0) return toast.error('Selecione ao menos um arquivo.');
    setActionLoading(true);
    try {
      const urls: string[] = [];
      const tipo = uploadData.tipo === 'outro' ? uploadData.outroTipo : uploadData.tipo;

      for (const file of uploadData.files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${tipo}-admin-${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
        const filePath = `${clienteId}/${fileName}`;

        const { url: uploadedUrl, path: uploadedPath } = await uploadFile(file, 'documentos_cliente', filePath);
        urls.push(uploadedUrl ?? getPublicFileUrl(uploadedPath));
      }

      const { error: insertError } = await supabase.from('cliente_documentos').insert([{
        cliente_id: clienteId,
        nome: uploadData.nome,
        tipo,
        status: 'aprovado',
        urls,
        enviado_por_admin: true
      }]);
      if (insertError) throw insertError;

      toast.success('Documentos adicionados diretamente.');
      
      // Notificar o cliente sobre o novo documento
      await notificationService.notifyClient(
        clienteId,
        '📄 Novo Documento Disponível',
        `Um novo documento ("${uploadData.nome}") foi anexado ao seu perfil pela administração.`,
        'perfil',
        'documento_admin_upload',
        { tab: 'documentos' }
      );

      refreshCounts?.();
      setIsUploadModalOpen(false);
      setUploadData({ nome: '', tipo: 'documento', outroTipo: '', files: [] });
    } catch (e) {
      console.error(e);
      toast.error('Erro no upload.');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Atualizar status (aprovar / reprovar) ─────────────────────────────────
  const updateStatus = async (id: string, status: string, motivo?: string) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('cliente_documentos')
        .update({ status, motivo_rejeicao: motivo || null })
        .eq('id', id);
      if (error) throw error;
      toast.success(`Status atualizado: ${status.replace('_', ' ')}.`);
      refreshCounts?.();

      // Notificar Cliente
      await notificationService.notifyClient(
        clienteId,
        status === 'aprovado' ? '✅ Documento Aprovado' : '❌ Documento Rejeitado',
        status === 'aprovado' 
          ? `Seu documento foi aprovado com sucesso.` 
          : `Seu documento foi rejeitado. Motivo: ${motivo}. Por favor, reenvie.`,
        'perfil',
        status === 'aprovado' ? 'documento_aprovado' : 'documento_rejeitado',
        { tab: 'documentos', prioridade: status === 'reprovado' ? 'alta' : 'normal' }
      );

      if (isRejectModalOpen) {
        setIsRejectModalOpen(false);
        setRejectReason('');
        setSelectedDocId(null);
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao mudar status.');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Excluir documento ─────────────────────────────────────────────────────
  const handleDelete = async (id: string, nome: string, urls?: string[]) => {
    const canProceed = await canDeleteRecord('cliente_documentos', id);
    if (!canProceed) return;
    if (!confirm(`Excluir "${nome}"?`)) return;

    try {
      setDocumentos(prev => prev.filter(d => d.id !== id));

      if (urls && Array.isArray(urls)) {
        for (const url of urls) {
          try {
            const urlObj = new URL(url);
            const pathSegments = urlObj.pathname.split('/');
            const storagePath = pathSegments
              .slice(pathSegments.indexOf('documentos_cliente') + 1)
              .join('/');
            if (storagePath) {
              await removeFile(storagePath);
            }
          } catch (storageErr) {
            console.error('Erro ao excluir arquivo do storage:', storageErr);
          }
        }
      }

      const { error } = await supabase.from('cliente_documentos').delete().eq('id', id);
      if (error) {
        fetchDocumentos();
        throw error;
      }
      toast.success('Documento excluído.');
      refreshCounts?.();
    } catch (e) {
      console.error(e);
      toast.error('Erro ao excluir.');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="py-8 flex justify-center">
        <div className="h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 mb-4 justify-between border-b border-neutral-100 pb-4 items-center">
        {/* Filtro de mês */}
        <div className="flex items-center gap-2 bg-neutral-50 px-3 py-1.5 rounded-xl border border-neutral-200">
          <Calendar className="h-4 w-4 text-neutral-400" />
          <select
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value)}
            className="text-xs font-bold text-neutral-700 focus:outline-none bg-transparent"
          >
            <option value="">Todos os meses</option>
            {Array.from({ length: 12 }, (_, i) => {
              const month = (i + 1).toString().padStart(2, '0');
              const year = new Date().getFullYear();
              return (
                <option key={month} value={`${year}-${month}`}>
                  {new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date(year, i))}
                </option>
              );
            })}
          </select>
        </div>

        {/* Ações */}
        <div className="flex gap-2">
          <button
            onClick={() => setIsRequestModalOpen(true)}
            className="btn-secondary text-indigo-600 bg-indigo-50 border-none px-3 py-1.5 h-auto text-xs flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Requisitar
          </button>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="btn-secondary text-emerald-600 bg-emerald-50 border-none px-3 py-1.5 h-auto text-xs flex items-center gap-1"
          >
            <Upload className="w-4 h-4" /> Envio Direto
          </button>
        </div>
      </div>

      {/* Lista de documentos */}
      <div className="space-y-3">
        {documentos.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border-2 border-dashed border-neutral-200">
            <FileText className="h-10 w-10 text-neutral-200 mx-auto mb-3" />
            <p className="text-sm font-bold text-neutral-400 uppercase tracking-widest">
              Nenhum documento solicitado ou enviado
            </p>
            <p className="text-xs text-neutral-400 mt-1">
              Use "Requisitar" para solicitar um documento ao cliente
            </p>
          </div>
        ) : (
          documentos.map(doc => (
            <div
              key={doc.id}
              className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl border border-neutral-200 bg-white items-center justify-between hover:shadow-sm transition-all"
            >
              {/* Info */}
              <div className="flex items-center gap-3 w-full">
                <div className={`p-2 rounded-lg shrink-0 ${
                  doc.status === 'aprovado' ? 'bg-emerald-50 text-emerald-600' :
                  doc.status === 'reprovado' ? 'bg-red-50 text-red-600' :
                  doc.status === 'em_analise' ? 'bg-amber-50 text-amber-600' :
                  'bg-neutral-100 text-neutral-500'
                }`}>
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium text-neutral-900 truncate">{doc.nome}</h4>
                    {doc.enviado_por_admin && (
                      <span className="text-[10px] bg-sky-100 text-sky-700 font-bold px-1.5 py-0.5 rounded-full uppercase flex items-center gap-1 shrink-0">
                        <Shield className="w-3 h-3" /> Admin
                      </span>
                    )}
                  </div>
                  <div className="flex text-xs text-neutral-500 gap-2 mt-0.5 flex-wrap">
                    <span className="uppercase tracking-wider">{doc.tipo.replace('_', ' ')}</span>
                    <span>•</span>
                    <span>{formatDateTime(doc.created_at)}</span>
                  </div>
                  {doc.status === 'reprovado' && doc.motivo_rejeicao && (
                    <p className="text-xs text-red-600 mt-1 bg-red-50 px-2 py-1 rounded-lg border border-red-100">
                      <span className="font-bold">Motivo:</span> {doc.motivo_rejeicao}
                    </p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 shrink-0">
                <span className={`px-2 py-1 text-[10px] uppercase font-bold text-white rounded-full ${
                  doc.status === 'aprovado' ? 'bg-emerald-500' :
                  doc.status === 'reprovado' ? 'bg-red-500' :
                  doc.status === 'em_analise' ? 'bg-amber-500' : 'bg-neutral-400'
                }`}>
                  {doc.status === 'em_analise' && <Clock className="w-3 h-3 inline mr-1" />}
                  {doc.status.replace('_', ' ')}
                </span>

                {doc.urls && Array.isArray(doc.urls) && (
                  <div className="flex gap-2 flex-wrap">
                    {doc.urls.map((u, i) => (
                      <a
                        key={i}
                        href={u}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] bg-indigo-50 text-indigo-600 font-bold px-2 py-1 rounded hover:bg-indigo-100"
                      >
                        Ver {i + 1}
                      </a>
                    ))}
                  </div>
                )}

                {doc.status === 'em_analise' && (
                  <div className="flex items-center gap-1 border-l pl-3 ml-1 border-neutral-200">
                    <button
                      onClick={() => updateStatus(doc.id, 'aprovado')}
                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                      title="Aprovar"
                      disabled={actionLoading}
                    >
                      <CheckCircle className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => { setSelectedDocId(doc.id); setIsRejectModalOpen(true); }}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                      title="Reprovar"
                      disabled={actionLoading}
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                )}

                <button
                  onClick={() => handleDelete(doc.id, doc.nome, doc.urls)}
                  className="p-1 text-neutral-400 hover:text-red-600 ml-1"
                  title="Excluir"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                {clienteTelefone && (
                  <div className="ml-1 scale-[0.8] opacity-70 hover:opacity-100 hover:scale-[0.9] transition-all flex items-center justify-center origin-center">
                    <AdminWhatsAppButton
                      telefone={clienteTelefone}
                      mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                        tipo: 'documento_cliente',
                        clienteNome,
                        status: doc.status,
                        titulo: doc.nome
                      })}
                    />
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Modal: Requisitar ───────────────────────────────────────────── */}
      <Modal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        title="Requisitar Documento ao Cliente"
        size="wide"
      >
        <form onSubmit={handleRequestDocument} className="space-y-4">
          <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-sm text-amber-800">
            O cliente receberá uma solicitação para enviar este documento na aba "Meus Documentos" do portal.
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nome / Rótulo *</label>
            <input
              required
              type="text"
              value={requestData.nome}
              onChange={e => setRequestData({ ...requestData, nome: e.target.value })}
              className="input-field"
              placeholder="Ex: CPF frente e verso"
            />
          </div>
          <button type="submit" disabled={actionLoading} className="btn-primary w-full">
            {actionLoading ? 'Solicitando...' : 'Solicitar Documento'}
          </button>
        </form>
      </Modal>

      {/* ── Modal: Upload Direto (Admin) ────────────────────────────────── */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        title="Upload Direto (Admin)"
        size="wide"
      >
        <form onSubmit={handleAdminUpload} className="space-y-4">
          <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100 text-sm text-emerald-800">
            O documento será inserido como <strong>Aprovado</strong> e marcado como enviado pelo Admin.
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nome / Rótulo *</label>
            <input
              required
              type="text"
              value={uploadData.nome}
              onChange={e => setUploadData({ ...uploadData, nome: e.target.value })}
              className="input-field"
              placeholder="Ex: Contrato Assinado GSA"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Arquivos (Até 5) *</label>
            <div className="space-y-2 mb-3">
              {uploadData.files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-emerald-50 rounded-xl px-3 py-2 border border-emerald-100">
                  <Plus className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="text-xs font-bold text-emerald-700 truncate flex-1">{f.name}</span>
                  <button type="button" onClick={() => setUploadData(prev => ({ ...prev, files: prev.files.filter((_, idx) => idx !== i) }))} className="text-emerald-500 hover:text-emerald-700">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            {uploadData.files.length < 5 && (
              <div className="mt-1 flex justify-center rounded-xl border-2 border-dashed border-neutral-300 px-6 py-6 hover:bg-neutral-50 transition-colors">
                <div className="space-y-1 text-center">
                  <Upload className="mx-auto h-8 w-8 text-neutral-400" />
                  <div className="flex text-sm text-neutral-600 justify-center mt-2">
                    <label className="relative cursor-pointer font-medium text-indigo-600 hover:text-indigo-500">
                      <span>Selecionar arquivos</span>
                      <input
                        type="file"
                        multiple
                        className="sr-only"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={e => {
                          const files = Array.from(e.target.files || []);
                          setUploadData(prev => ({ ...prev, files: [...prev.files, ...files].slice(0, 5) }));
                        }}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-neutral-500">
                    Selecionados: {uploadData.files.length}/5
                  </p>
                </div>
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={actionLoading || uploadData.files.length === 0}
            className="btn-primary w-full bg-emerald-600 hover:bg-emerald-700"
          >
            {actionLoading ? 'Enviando...' : 'Fazer Upload e Aprovar'}
          </button>
        </form>
      </Modal>

      {/* ── Modal: Reprovar ────────────────────────────────────────────── */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => { setIsRejectModalOpen(false); setRejectReason(''); setSelectedDocId(null); }}
        title="Reprovar Documento"
        size="wide"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-red-700">Motivo da Reprovação *</label>
            <textarea
              required
              rows={3}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              className="input-field"
              placeholder="Ex: O documento está ilegível, por favor reenvie..."
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setIsRejectModalOpen(false); setRejectReason(''); setSelectedDocId(null); }}
              className="btn-secondary flex-1"
            >
              Cancelar
            </button>
            <button
              onClick={() => selectedDocId && updateStatus(selectedDocId, 'reprovado', rejectReason)}
              disabled={!rejectReason || actionLoading}
              className="btn-primary bg-red-600 hover:bg-red-700 flex-1"
            >
              {actionLoading ? 'Salvando...' : 'Confirmar Reprovação'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
