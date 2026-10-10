import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { uploadFile, getPublicFileUrl, removeFile, getPrivateFileUrl } from '../../../lib/storage';
import { toast } from 'react-hot-toast';
import { FileText, Plus, CheckCircle, XCircle, Trash2, Shield, Upload, Clock, Calendar } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { formatDateTime } from '../../../lib/utils';
import { canDeleteRecord } from '../../../lib/deleteRequest';
import { useAdminNotifications } from '../../../hooks/useAdminNotifications';
import { logService } from '../../../lib/logService';
import { notificationService } from '../../../lib/notificationService';
import { whatsappNotificationService } from '../../../lib/whatsappNotificationService';
import { AdminWhatsAppButton } from '../ui/AdminWhatsAppButton';

interface AdminPrestadorDocumentosProps {
  prestadorId: string;
  prestadorNome?: string;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
  prestadorTelefone?: string;
}

export function AdminPrestadorDocumentos({ 
  prestadorId, 
  prestadorNome, 
  colaboradorId, 
  colaboradorNome,
  prestadorTelefone
}: AdminPrestadorDocumentosProps) {
  const { refreshCounts } = useAdminNotifications();
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  
  const [requestData, setRequestData] = useState({ nome: '', tipo: 'outro', outroTipo: '' });
  const [uploadData, setUploadData] = useState({ nome: '', tipo: 'outro', outroTipo: '', files: [] as File[] });
  const [rejectReason, setRejectReason] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string>('');

  const fetchDocumentosLocal = useCallback(async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('prestador_documentos')
          .select('*')
          .eq('prestador_id', prestadorId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        
        if (data) {
          let filtered = data;
          if (monthFilter) {
            filtered = filtered.filter((d: any) => d.created_at?.startsWith(monthFilter));
          }
          setDocumentos(filtered || []);
        }
      } catch (e) {
        console.error(e);
        toast.error('Erro ao buscar documentos.');
      } finally {
        setLoading(false);
      }
  }, [prestadorId, monthFilter]);

  useEffect(() => {
    fetchDocumentosLocal();

    const channel = supabase
      .channel('admin-prestador-documentos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prestador_documentos', filter: `prestador_id=eq.${prestadorId}` }, fetchDocumentosLocal)
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDocumentosLocal, prestadorId]);

  const handleRequestDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const { error } = await supabase.from('prestador_documentos').insert([{
        prestador_id: prestadorId,
        nome: requestData.nome,
        tipo: requestData.tipo === 'outro' ? requestData.outroTipo : requestData.tipo,
        status: 'pendente'
      }]);
      if (error) throw error;
      
      // Notificar Prestador
      await notificationService.notifyProvider(
        prestadorId,
        '📄 Documento Solicitado',
        `Foi solicitada a submissão do documento: ${requestData.nome}. Por favor, acesse o módulo Documentos para enviar.`,
        'documentos',
        'os_documento_solicitado'
      );

      toast.success('Documento solicitado com sucesso.');
      refreshCounts?.();
      setIsRequestModalOpen(false);
      setRequestData({ nome: '', tipo: 'outro', outroTipo: '' });
    } catch (e) {
      toast.error('Erro ao solicitar documento.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAdminUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadData.files.length === 0) return toast.error('Selecione ao menos um arquivo.');
    setActionLoading(true);
    try {
      const urls: string[] = [];
      const actualTipo = uploadData.tipo === 'outro' ? uploadData.outroTipo : uploadData.tipo;

      const uploadPromises = uploadData.files.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${uploadData.tipo}-admin-${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
        const filePath = `${prestadorId}/${fileName}`;

        const { url: __publicUrl, path: __r2Path } = await uploadFile(file, 'documentos_prestador', filePath);

        // publicUrl is handled directly
        return __publicUrl;
      });

      const uploadedUrls = await Promise.all(uploadPromises);
      urls.push(...uploadedUrls);

      try {
        const { error: insertError } = await supabase.from('prestador_documentos').insert([{
          prestador_id: prestadorId,
          nome: uploadData.nome,
          tipo: actualTipo,
          status: 'aprovado',
          urls,
          enviado_por_admin: true
        }]);
        if (insertError) throw insertError;
      } catch (error) {
        console.error('Erro ao inserir documento:', error);
        toast.error('Erro ao inserir documento.');
        return;
      }

      toast.success('Documentos adicionados diretamente.');
      refreshCounts?.();
      setIsUploadModalOpen(false);
      setUploadData({ nome: '', tipo: 'outro', outroTipo: '', files: [] });
    } catch (e) {
      toast.error('Erro no upload.');
    } finally {
      setActionLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string, motivo?: string) => {
    setActionLoading(true);
    try {
      const { error } = await supabase.from('prestador_documentos').update({
        status,
        motivo_rejeicao: motivo || null
      }).eq('id', id);
      if (error) throw error;
      toast.success(`Status atualizado para ${status}.`);
      refreshCounts?.();

      // Notificar Prestador
      await notificationService.notifyProvider(
        prestadorId,
        status === 'aprovado' ? '✅ Documento Aprovado' : '❌ Documento Rejeitado',
        status === 'aprovado' 
          ? `Seu documento foi aprovado com sucesso.` 
          : `Seu documento foi rejeitado. Motivo: ${motivo}. Por favor, reenvie.`,
        'documentos',
        status === 'aprovado' ? 'prestador_documento_aprovado' : 'prestador_documento_rejeitado',
        { prioridade: status === 'reprovado' ? 'alta' : 'normal' }
      );

      // Log action
      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: `DOCUMENTO_${status.toUpperCase()}`,
        detalhes: `Documento #${id} do prestador ${prestadorNome || prestadorId} foi ${status === 'aprovado' ? 'aprovado' : 'rejeitado'}${motivo ? `. Motivo: ${motivo}` : ''}`
      });

      if (isRejectModalOpen) setIsRejectModalOpen(false);
    } catch (e) {
      toast.error('Erro ao mudar status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string, nome: string, urls?: string[]) => {
    const canProceed = await canDeleteRecord('prestador_documentos', id);
    if (!canProceed) return;

    if (!confirm(`Excluir ${nome}?`)) return;
    setActionLoading(true);
    try {
      setDocumentos(prev => prev.filter(doc => doc.id !== id));
      
      if (urls && Array.isArray(urls)) {
        const deletePaths = urls.map(url => {
          try {
            const urlObj = new URL(url);
            const pathSegments = urlObj.pathname.split('/');
            return pathSegments.slice(pathSegments.indexOf('documentos_prestador') + 1).join('/');
          } catch {
            return null;
          }
        }).filter(Boolean) as string[];

        if (deletePaths.length > 0) {
          await supabase.storage.from('documentos_prestador').remove(deletePaths);
        }
      }

      const { error } = await supabase.from('prestador_documentos').delete().eq('id', id);
      if (error) {
        // If error, refetch to restore state
        fetchDocumentosLocal();
        throw error;
      }
      toast.success('Excluído.');
      refreshCounts?.();

      // Log action
      await logService.logAction({
        ator_tipo: colaboradorId ? 'colaborador' : 'admin',
        ator_id: colaboradorId || undefined,
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'EXCLUIR_DOCUMENTO_PRESTADOR',
        detalhes: `Excluiu o documento "${nome}" (ID: ${id}) do prestador: ${prestadorNome || prestadorId}`
      });
    } catch (e) {
      toast.error('Erro ao excluir.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-indigo-600 border-t-transparent flex rounded-full animate-spin"/></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 mb-4 justify-between border-b border-neutral-100 pb-4 items-center">
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
        
        <div className="flex gap-2">
          <button onClick={() => setIsRequestModalOpen(true)} disabled={actionLoading} className="btn-secondary text-indigo-600 bg-indigo-50 border-none px-3 py-1.5 h-auto text-xs disabled:opacity-50">
            <Plus className="w-4 h-4 mr-1" /> Requisitar
          </button>
          <button onClick={() => setIsUploadModalOpen(true)} disabled={actionLoading} className="btn-secondary text-emerald-600 bg-emerald-50 border-none px-3 py-1.5 h-auto text-xs disabled:opacity-50">
            <Upload className="w-4 h-4 mr-1" /> Envio Direto
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {documentos.length === 0 ? (
          <p className="text-center text-sm text-neutral-500 py-4">Nenhum documento solicitado ou enviado.</p>
        ) : documentos.map(doc => (
          <div key={doc.id} className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl border border-neutral-200 bg-white items-center justify-between">
            <div className="flex items-center gap-3 w-full">
              <div className="p-2 bg-neutral-100 rounded-lg text-neutral-600"><FileText className="w-5 h-5"/></div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-neutral-900">{doc.nome}</h4>
                  {doc.enviado_por_admin && <span className="text-[10px] bg-sky-100 text-sky-700 font-bold px-1.5 py-0.5 rounded-full uppercase flex items-center gap-1"><Shield className="w-3 h-3"/> Admin</span>}
                </div>
                <div className="flex text-xs text-neutral-500 gap-2 mt-1">
                  <span className="uppercase tracking-wider">{doc.tipo.replace('_', ' ')}</span>
                  <span>•</span>
                  <span>{formatDateTime(doc.created_at)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className={`px-2 py-1 text-[10px] uppercase font-bold text-white rounded-full ${
                doc.status === 'aprovado' ? 'bg-emerald-500' :
                doc.status === 'reprovado' ? 'bg-red-500' :
                doc.status === 'em_analise' ? 'bg-amber-500' : 'bg-neutral-500'
              }`}>
                {doc.status.replace('_', ' ')}
              </span>
              
              {doc.urls && Array.isArray(doc.urls) && (
                <div className="flex gap-2 flex-wrap">
                  {doc.urls.map((u: string, i: number) => (
                    <a key={i} href={u} target="_blank" rel="noreferrer" className="text-[10px] bg-indigo-50 text-indigo-600 font-bold px-2 py-1 rounded hover:bg-indigo-100">
                      Ver {i + 1}
                    </a>
                  ))}
                </div>
              )}

              {doc.status === 'em_analise' && (
                <div className="flex items-center gap-1 border-l pl-3 ml-1 border-neutral-200">
                  <button onClick={() => updateStatus(doc.id, 'aprovado')} disabled={actionLoading} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded disabled:opacity-50" title="Aprovar"><CheckCircle className="w-5 h-5"/></button>
                  <button onClick={() => { setSelectedDocId(doc.id); setIsRejectModalOpen(true); }} disabled={actionLoading} className="p-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-50" title="Reprovar"><XCircle className="w-5 h-5"/></button>
                </div>
              )}

              <button onClick={() => handleDelete(doc.id, doc.nome, doc.urls)} disabled={actionLoading} className="p-1 text-neutral-400 hover:text-red-600 ml-2 disabled:opacity-50" title="Excluir"><Trash2 className="w-4 h-4"/></button>
              
              {prestadorTelefone && (
                 <div className="border-l pl-3 ml-1 border-neutral-200 scale-90 origin-right">
                   <AdminWhatsAppButton
                      telefone={prestadorTelefone}
                      mensagem={whatsappNotificationService.gerarMensagemWhatsApp({
                         tipo: 'personalizado',
                         clienteNome: prestadorNome || 'Prestador',
                         titulo: doc.nome,
                         status: doc.status,
                         detalhesExtras: doc.motivo_rejeicao
                      })}
                   />
                 </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Moda Requisitar */}
      <Modal isOpen={isRequestModalOpen} onClose={() => setIsRequestModalOpen(false)} title="Requisitar Documento" size="wide">
        <form onSubmit={handleRequestDocument} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome/Rótulo *</label>
            <input required type="text" value={requestData.nome} onChange={e=>setRequestData({...requestData, nome: e.target.value})} className="input-field" placeholder="Ex: CNH Frente" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Categoria *</label>
            <select value={requestData.tipo} onChange={e=>setRequestData({...requestData, tipo: e.target.value})} className="input-field">
              <option value="cnh">CNH / RG</option>
              <option value="comprovante_residencia">Comprovante de Residência</option>
              <option value="alvara">Alvará / MEI</option>
              <option value="curriculo">Currículo</option>
              <option value="antecedentes_criminais">Antecedentes Criminais</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          {requestData.tipo === 'outro' && (
            <div>
              <label className="block text-sm font-medium mb-1 animate-in fade-in slide-in-from-top-1">Nome da Categoria Customizada *</label>
              <input required type="text" value={requestData.outroTipo} onChange={e=>setRequestData({...requestData, outroTipo: e.target.value})} className="input-field" placeholder="Ex: Certidão de Casamento" />
            </div>
          )}
          <button type="submit" disabled={actionLoading} className="btn-primary w-full">Solicitar</button>
        </form>
      </Modal>

      {/* Modal Upload Admin */}
      <Modal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} title="Upload Direto (Admin)" size="wide">
        <form onSubmit={handleAdminUpload} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome/Rótulo *</label>
            <input required type="text" value={uploadData.nome} onChange={e=>setUploadData({...uploadData, nome: e.target.value})} className="input-field" placeholder="Ex: Contrato Assinado GSA" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Categoria *</label>
            <select value={uploadData.tipo} onChange={e=>setUploadData({...uploadData, tipo: e.target.value})} className="input-field">
              <option value="contrato">Contrato</option>
              <option value="certificado">Certificado Interno</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          {uploadData.tipo === 'outro' && (
            <div>
              <label className="block text-sm font-medium mb-1 animate-in fade-in slide-in-from-top-1">Nome da Categoria Customizada *</label>
              <input required type="text" value={uploadData.outroTipo} onChange={e=>setUploadData({...uploadData, outroTipo: e.target.value})} className="input-field" placeholder="Ex: Regulamento Interno" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Arquivos (Até 5) *</label>
            <div className="space-y-2 mb-3">
              {uploadData.files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-emerald-50 rounded-xl px-3 py-2 border border-emerald-100">
                  <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
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
          <button type="submit" disabled={actionLoading || uploadData.files.length === 0} className="btn-primary w-full bg-emerald-600 hover:bg-emerald-700">Fazer Upload e Aprovar</button>
        </form>
      </Modal>

      {/* Modal Rejeitar */}
      <Modal isOpen={isRejectModalOpen} onClose={() => setIsRejectModalOpen(false)} title="Reprovar Documento" size="wide">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-red-700">Motivo da Reprovação *</label>
            <textarea required value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={3} className="input-field" placeholder="O documento está ilegível..." />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsRejectModalOpen(false)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={() => updateStatus(selectedDocId!, 'reprovado', rejectReason)} disabled={!rejectReason || actionLoading} className="btn-primary bg-red-600 hover:bg-red-700 flex-1">Confirmar Reprovação</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
