import React, { useState } from 'react';
import { Folder, FileText, Upload, Download, Eye, CheckCircle2, Clock, AlertTriangle, AlertCircle, ArrowLeft, ChevronRight } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import UploadZone from '../ui/UploadZone';
import Modal from '../ui/Modal';
import { api, isDemoMode } from '../../api';
import { signedFileUrl } from '../../storage';

interface ClientDocReq {
  id: string;
  orderCode: string;
  personal?: boolean;
  title: string;
  instructions: string;
  deadline: string;
  blocking: boolean;
  status: 'Aguardando envio' | 'Em análise' | 'Aprovado' | 'Rejeitado';
  uploadedFile?: string;
  uploadedFileId?: string;
  rejectionReason?: string;
}

export interface ClientDocumentsProps {
  routeDetail?: string | null;
  onOpenFolder?: (folder: string) => void;
  onCloseFolder?: () => void;
}

export function ClientDocuments({ routeDetail, onOpenFolder, onCloseFolder }: ClientDocumentsProps) {
  const [activeTab, setActiveTab] = useState<'requests' | 'folders'>('folders');
  const [selectedReq, setSelectedReq] = useState<ClientDocReq | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploadConfirmOpen, setIsUploadConfirmOpen] = useState(false);
  const [isUploadSuccessOpen, setIsUploadSuccessOpen] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [previewDocument, setPreviewDocument] = useState<{ name: string; url: string } | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  React.useEffect(() => {
    setActiveFolder(['Contratos', 'Notas fiscais', 'Documentos societários'].includes(routeDetail || '') ? routeDetail! : null);
  }, [routeDetail]);
  React.useEffect(() => {
    if (routeDetail === 'solicitacoes') setActiveTab('requests');
  }, [routeDetail]);
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  const [requests, setRequests] = useState<ClientDocReq[]>(isDemoMode ? [
    {
      id: 'req-1',
      orderCode: 'OS105',
      title: 'Comprovante de Endereço Comercial (IPTU do Imóvel)',
      instructions: 'Enviar cópia legível do carnê de IPTU de 2026 ou contrato de locação com firma reconhecida.',
      deadline: '06/10/2026',
      blocking: true,
      status: 'Aguardando envio'
    },
    {
      id: 'req-2',
      orderCode: 'OS105',
      title: 'RG e CPF dos Sócios (Frente e Verso)',
      instructions: 'Cópia digitalizada em alta resolução ou CNH Digital.',
      deadline: '05/10/2026',
      blocking: true,
      status: 'Em análise',
      uploadedFile: 'documentos_socios_alfa.pdf'
    },
    {
      id: 'req-3',
      orderCode: 'OS105',
      title: 'Minuta de Contrato Social Assinada',
      instructions: 'Assinatura digital via Gov.br ou Certificado Digital e-CPF.',
      deadline: '01/10/2026',
      blocking: false,
      status: 'Aprovado',
      uploadedFile: 'minuta_contrato_social_v1.pdf'
    }
  ] : []);

  React.useEffect(() => {
    const reload = async () => {
      try {
        const state = await api('/client-state');
        const serviceRequests = (Array.isArray(state.documents) ? state.documents : []).map((doc: any) => {
          const latest = Array.isArray(doc.versions) ? doc.versions[doc.versions.length - 1] : null;
          return {
            id: String(doc.id),
            orderCode: doc.orderCode || (doc.orderId ? `OS${doc.orderId}` : '—'),
            title: doc.title,
            instructions: doc.description || '',
            deadline: doc.deadline || '—',
            blocking: Boolean(doc.blocking),
            status: doc.status || 'Aguardando envio',
            uploadedFile: latest?.fileName,
            uploadedFileId: latest?.fileId,
            rejectionReason: doc.rejectionReason
          };
        });
        const personalRequests = (Array.isArray(state.personalDocuments) ? state.personalDocuments : []).map((doc: any) => {
          const latest = Array.isArray(doc.versions) ? doc.versions[doc.versions.length - 1] : null;
          return {
            id: String(doc.id),
            personal: true,
            orderCode: 'Perfil do cliente',
            title: doc.title,
            instructions: doc.description || 'Documento pessoal solicitado para manter o cadastro do cliente atualizado.',
            deadline: doc.deadline || '—',
            blocking: Boolean(doc.blocking),
            status: doc.status || 'Aguardando envio',
            uploadedFile: latest?.fileName,
            uploadedFileId: latest?.fileId,
            rejectionReason: doc.rejectionReason
          };
        });
        setRequests([...personalRequests, ...serviceRequests]);
      } catch {
        // Keep the local fixture visible if the server is temporarily unavailable.
      }
    };
    void reload();
    const handleReload = () => { void reload(); };
    window.addEventListener('gsa:reload', handleReload);
    return () => window.removeEventListener('gsa:reload', handleReload);
  }, []);

  React.useEffect(() => {
    if (!routeDetail || ['Contratos', 'Notas fiscais', 'Documentos societários'].includes(routeDetail)) return;
    setActiveTab('requests');
    const request = requests.find((item) => String(item.id) === String(routeDetail));
    if (request) {
      window.setTimeout(() => document.getElementById(`client-document-request-${request.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
    }
  }, [routeDetail, requests]);

  const handleUploadSubmit = (file: File) => {
    setPendingUploadFile(file);
  };

  const sendConfirmedUpload = async () => {
    if (!selectedReq || !pendingUploadFile) return;
    const file = pendingUploadFile;
    let result: any;
    try {
      const formData = new FormData();
      formData.append('file', file);
      result = await api(`${selectedReq.personal ? '/personal-documents' : '/documents'}/${selectedReq.id}/upload`, formData);
    } catch {
      setUploadError('Não foi possível enviar o documento. Tente novamente.');
      return;
    }
    setRequests(
      requests.map((r) =>
        r.id === selectedReq.id
          ? { ...r, status: 'Em análise', uploadedFile: result.fileName || file.name, uploadedFileId: result.fileId, rejectionReason: undefined }
          : r
      )
    );
    setIsUploadModalOpen(false);
    setIsUploadConfirmOpen(false);
    setPendingUploadFile(null);
    setUploadError('');
    setIsUploadSuccessOpen(true);
  };

  const handleDownloadFile = (fileName: string) => {
    const content = `GSA HUB - DOCUMENTO DO CLIENTE
==============================================
Arquivo: ${fileName}
Data de Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}
Autenticado digitalmente pela plataforma GSA HUB.`;
    const blob = new Blob([content], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const pendingDocumentRequests = requests.filter((request) => request.status === 'Aguardando envio').length;

  if (activeFolder && !isDemoMode) {
    return (
      <div className="client-folder-page" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => { setActiveFolder(null); onCloseFolder?.(); }}>Voltar para Pastas e Arquivos</Button>
        <Card className="client-folder-files-card">
          <p className="page-subtitle" style={{ margin: 0 }}>Nenhum arquivo disponível nesta pasta.</p>
        </Card>
      </div>
    );
  }

  if (activeFolder) {
    return (
      <div className="client-folder-page" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => { setActiveFolder(null); onCloseFolder?.(); }}>Voltar para Pastas e Arquivos</Button>
        <div className="client-folder-page-heading">
          <span className="client-folder-icon"><Folder size={24} /></span>
          <div><h1 className="page-title">{activeFolder}</h1><p className="page-subtitle">Arquivos desta pasta</p></div>
        </div>
          <Card className="client-folder-files-card">
            <div className="client-folder-files-list">
              {activeFolder === 'Contratos' && (
                <div className="client-folder-file-card">
                  <div className="client-folder-file-main">
                    <span className="client-folder-file-icon"><FileText size={21} /></span>
                    <div className="client-folder-file-copy">
                      <div className="client-folder-file-name">
                        CONT-2024-00157 — Prestação de Serviços Contábeis.pdf
                      </div>
                      <div className="client-folder-file-meta"><span>PDF</span> Assinado em 01/10/2026 <strong>2.4 MB</strong></div>
                    </div>
                  </div>
                  <div className="client-folder-file-actions">
                    <Button variant="secondary" size="sm" icon={<Eye size={14} />} onClick={() => setPreviewFile('CONT-2024-00157 — Prestação de Serviços Contábeis.pdf')}>Visualizar</Button>
                    <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={() => handleDownloadFile('CONT-2024-00157-Prestacao-Servicos.pdf')}>Baixar</Button>
                  </div>
                </div>
              )}

              {activeFolder === 'Notas fiscais' && (
                <div className="client-folder-file-card">
                  <div className="client-folder-file-main">
                    <span className="client-folder-file-icon"><FileText size={21} /></span>
                    <div className="client-folder-file-copy">
                      <div className="client-folder-file-name">
                        NFS-e 00192 — GSA HUB Soluções Administrativas.pdf
                      </div>
                      <div className="client-folder-file-meta"><span>PDF</span> Emitida em 30/09/2026 <strong>450 KB</strong></div>
                    </div>
                  </div>
                  <div className="client-folder-file-actions">
                    <Button variant="secondary" size="sm" icon={<Eye size={14} />} onClick={() => setPreviewFile('NFS-e 00192 — GSA HUB Soluções Administrativas.pdf')}>Visualizar</Button>
                    <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={() => handleDownloadFile('NFSe-00192-GSA-HUB.pdf')}>Baixar</Button>
                  </div>
                </div>
              )}

              {activeFolder === 'Documentos societários' && (
                <div className="client-folder-file-card">
                  <div className="client-folder-file-main">
                    <span className="client-folder-file-icon"><FileText size={21} /></span>
                    <div className="client-folder-file-copy">
                      <div className="client-folder-file-name">
                        Minuta do Contrato Social — Empresa Alfa Ltda.pdf
                      </div>
                      <div className="client-folder-file-meta"><span>PDF</span> Aprovado em 01/10/2026 <strong>1.8 MB</strong></div>
                    </div>
                  </div>
                  <div className="client-folder-file-actions">
                    <Button variant="secondary" size="sm" icon={<Eye size={14} />} onClick={() => setPreviewFile('Minuta do Contrato Social — Empresa Alfa Ltda.pdf')}>Visualizar</Button>
                    <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={() => handleDownloadFile('Minuta-Contrato-Social-Empresa-Alfa.pdf')}>Baixar</Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        <Modal open={Boolean(previewFile)} onClose={() => setPreviewFile(null)} title="Visualizar Documento">
          <div className="client-document-preview">
            <span className="client-document-preview-icon"><FileText size={34} /></span>
            <div>
              <strong>{previewFile}</strong>
              <span>Pré-visualização do documento armazenado na pasta {activeFolder}.</span>
            </div>
            <div className="client-document-preview-sheet">
              <div className="client-document-preview-brand">GSA HUB</div>
              <div className="client-document-preview-line client-document-preview-line--title" />
              <div className="client-document-preview-line" />
              <div className="client-document-preview-line" />
              <div className="client-document-preview-line client-document-preview-line--short" />
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Meus Documentos</h1>
        <p className="page-subtitle">Envie documentos solicitados pela equipe GSA e acesse seu repositório de arquivos.</p>
      </div>

      {/* Tabs */}
      <div className="client-document-tabs" role="group" aria-label="Visualização dos documentos">
        <button
          type="button"
          className={`client-document-tab ${activeTab === 'folders' ? 'is-active' : ''}`}
          aria-pressed={activeTab === 'folders'}
          onClick={() => setActiveTab('folders')}
        >
          <Folder size={18} />
          <span>Pastas e Arquivos</span>
        </button>
        <button
          type="button"
          className={`client-document-tab ${activeTab === 'requests' ? 'is-active' : ''}`}
          aria-pressed={activeTab === 'requests'}
          onClick={() => setActiveTab('requests')}
        >
          <FileText size={18} />
          <span>Solicitações</span>
          {pendingDocumentRequests > 0 && (
            <span className="client-document-tab-count" aria-label={`${pendingDocumentRequests} solicitações pendentes`}>
              {pendingDocumentRequests > 99 ? '99+' : pendingDocumentRequests}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'requests' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {requests.map((req) => (
            <Card id={`client-document-request-${req.id}`} key={req.id} className={`document-request-card document-request-card--${req.status.toLowerCase().replace(/\s+/g, '-')}`} style={{ padding: 0 }}>
              <div className="document-request-heading">
                <div className="document-request-meta">
                  <span className="document-request-order"><span><FileText size={15} /></span>{req.personal ? 'Documento pessoal' : req.orderCode}</span>
                  <Badge
                    status={req.status}
                    variant={req.status === 'Aguardando envio' ? 'red' : req.status === 'Em análise' ? 'yellow' : 'green'}
                  />
                </div>
                <h2>{req.title}</h2>
              </div>
              <div className="document-request-body">
                <p>{req.instructions}</p>
                <div className="document-request-deadline">
                  <Clock size={18} />
                  <div><span>Prazo para entrega</span><strong>{req.deadline}</strong></div>
                </div>
                {req.uploadedFile && (
                  <div className="document-request-file"><FileText size={16} /><span>Arquivo enviado: {req.uploadedFileId ? (
                    <button
                      type="button"
                      className="client-document-file-preview-link"
                      onClick={async () => {
                        try {
                          const url = await signedFileUrl(req.uploadedFileId!);
                          setPreviewDocument({ name: req.uploadedFile || 'Documento enviado', url });
                        } catch {
                          setUploadError('Não foi possível abrir este arquivo agora.');
                        }
                      }}
                    >{req.uploadedFile}</button>
                  ) : <strong>{req.uploadedFile}</strong>}</span></div>
                )}
              </div>
              <div className="document-request-footer">
                {req.status === 'Aguardando envio' && (
                  <Button variant="upload" size="sm" icon={<Upload size={16} />} onClick={() => {
                    setSelectedReq(req);
                    setIsUploadModalOpen(true);
                  }}>Enviar Arquivo</Button>
                )}
                {req.status === 'Em análise' && <span className="document-request-message">Em conferência pela equipe GSA</span>}
                {req.status === 'Aprovado' && <span className="document-request-message document-request-message--approved"><CheckCircle2 size={15} /> Documento validado</span>}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="client-folder-grid">
          {(isDemoMode ? ['Contratos', 'Notas fiscais', 'Documentos societários'] : []).map((folder) => (
            <button key={folder} type="button" className="client-folder-card" onClick={() => { setActiveFolder(folder); onOpenFolder?.(folder); }}>
              <span className="client-folder-label"><strong>{folder}</strong><span>Abrir pasta</span></span>
              <span className="client-folder-icon"><Folder size={24} /></span>
              <ChevronRight size={18} />
            </button>
          ))}
          {!isDemoMode && requests.length === 0 && <p className="page-subtitle" style={{ gridColumn: '1 / -1', margin: 0 }}>Nenhum documento disponível no momento.</p>}
        </div>
      )}

      {/* Upload Modal */}
      {selectedReq && (
        <Modal
          open={isUploadModalOpen}
          onClose={() => { setIsUploadModalOpen(false); setPendingUploadFile(null); }}
          title={`Enviar: ${selectedReq.title}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: '#475569' }}>
              {selectedReq.instructions}
            </div>

            <UploadZone
              onFileSelect={handleUploadSubmit}
              selectedFile={pendingUploadFile ? {
                name: pendingUploadFile.name,
                size: `${(pendingUploadFile.size / (1024 * 1024)).toFixed(2)} MB`
              } : null}
              onRemove={() => setPendingUploadFile(null)}
              accept=".pdf,.jpg,.jpeg,.png"
              hint="Arquivos em PDF, JPG ou PNG até 15 MB."
            />

            <div className="responsive-row" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <Button variant="secondary" onClick={() => { setIsUploadModalOpen(false); setPendingUploadFile(null); }}>
                Cancelar
              </Button>
              <Button variant="primary" disabled={!pendingUploadFile} onClick={() => { setIsUploadModalOpen(false); setIsUploadConfirmOpen(true); }}>
                Confirmar envio
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {selectedReq && pendingUploadFile && (
        <Modal
          open={isUploadConfirmOpen}
          onClose={() => { setIsUploadConfirmOpen(false); setIsUploadModalOpen(true); }}
          title="Confirmar envio do documento"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, color: '#475569', fontSize: 14, lineHeight: 1.5 }}>
              Confirma o envio de <strong>{pendingUploadFile.name}</strong> para a solicitação <strong>{selectedReq.title}</strong>?
            </p>
            {uploadError && <p role="alert" style={{ margin: 0, color: '#dc2626', fontSize: 13 }}>{uploadError}</p>}
            <div className="responsive-row" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" onClick={() => { setIsUploadConfirmOpen(false); setIsUploadModalOpen(true); }}>
                Voltar
              </Button>
              <Button variant="primary" onClick={() => void sendConfirmedUpload()}>
                Sim, enviar documento
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <Modal
        open={isUploadSuccessOpen}
        onClose={() => setIsUploadSuccessOpen(false)}
        isSuccessModal
        successTitle="Documento enviado com sucesso e encaminhado para análise pelo sistema."
        successButtonText="Entendi"
      />

      <Modal
        open={Boolean(previewDocument)}
        onClose={() => setPreviewDocument(null)}
        title={previewDocument?.name || 'Visualizar documento'}
        className="modal-dialog--wide"
      >
        {previewDocument && (
          previewDocument.name.match(/\.(jpe?g|png)$/i) ? (
            <img src={previewDocument.url} alt={previewDocument.name} style={{ display: 'block', width: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
          ) : (
            <iframe title={previewDocument.name} src={previewDocument.url} style={{ display: 'block', width: '100%', height: '75vh', border: 0, borderRadius: 8 }} />
          )
        )}
      </Modal>
    </div>
  );
}

export default ClientDocuments;
