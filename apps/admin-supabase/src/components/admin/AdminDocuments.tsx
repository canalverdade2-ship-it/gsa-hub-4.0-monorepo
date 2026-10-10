import React, { useEffect, useState } from 'react';
import {
  Folder,
  FileText,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Download,
  Eye,
  Filter,
  Building2,
  Upload,
  Edit,
  Trash
} from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import UploadZone from '../ui/UploadZone';
import { api, isDemoMode } from '../../api';

interface DocItem {
  id: string;
  clientCode: string;
  clientName: string;
  orderCode?: string;
  title: string;
  folder: string;
  blocking: boolean;
  status: 'Aguardando envio' | 'Em análise' | 'Aprovado' | 'Rejeitado';
  deadline: string;
  fileName?: string;
  fileSize?: string;
  uploadedAt?: string;
  feedback?: string;
}

export function AdminDocuments() {
  const [toast, showToast] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFolder, setActiveFolder] = useState<string>('all');
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [customFolders, setCustomFolders] = useState<{id: string; clientId: string; name: string}[]>(isDemoMode ? [
    { id: 'f1', clientId: 'CL108', name: 'Documentos societários' },
    { id: 'f2', clientId: 'CL108', name: 'Contratos' },
    { id: 'f3', clientId: 'CL108', name: 'Notas fiscais' },
    { id: 'f4', clientId: 'CL109', name: 'Impostos & Taxas' },
  ] : []);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderForm, setFolderForm] = useState({ id: '', name: '' });
  
  const [clientOptions, setClientOptions] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocItem | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);

  const handleDownload = (fileName: string) => {
    const content = `GSA HUB - DOCUMENTO PROTOCOLADO OFICIAL
==============================================
Arquivo: ${fileName}
Data de Exportação: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}
Autenticação: GSA-DOC-HASH-${Date.now()}`;
    const blob = new Blob([content], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // New Request Form State
  const [newClient, setNewClient] = useState(isDemoMode ? '108' : '');
  const [newOrder, setNewOrder] = useState(isDemoMode ? '105' : '');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDeadline, setNewDeadline] = useState('2026-10-10');
  const [newBlocking, setNewBlocking] = useState(true);
  const [newFolder, setNewFolder] = useState('Documentos societários');

  // Rejection Feedback State
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  const [isDirectUploadModalOpen, setIsDirectUploadModalOpen] = useState(false);
  const [documents, setDocuments] = useState<DocItem[]>(isDemoMode ? [
    {
      id: 'doc-1',
      clientCode: 'CL108',
      clientName: 'Empresa Alfa Ltda',
      orderCode: 'OS105',
      title: 'RG e CPF dos Sócios (Frente e Verso)',
      folder: 'Documentos societários',
      blocking: true,
      status: 'Em análise',
      deadline: '05/10/2026',
      fileName: 'documentos_socios_alfa.pdf',
      fileSize: '2.4 MB',
      uploadedAt: '02/10/2026 às 11:20'
    },
    {
      id: 'doc-2',
      clientCode: 'CL108',
      clientName: 'Empresa Alfa Ltda',
      orderCode: 'OS105',
      title: 'Comprovante de Endereço Comercial (IPTU)',
      folder: 'Documentos societários',
      blocking: true,
      status: 'Aguardando envio',
      deadline: '06/10/2026'
    },
    {
      id: 'doc-3',
      clientCode: 'CL108',
      clientName: 'Empresa Alfa Ltda',
      orderCode: 'OS105',
      title: 'Minuta de Contrato Social Assinada',
      folder: 'Contratos',
      blocking: false,
      status: 'Aprovado',
      deadline: '01/10/2026',
      fileName: 'minuta_contrato_social_v1.pdf',
      fileSize: '1.8 MB',
      uploadedAt: '01/10/2026 às 15:40'
    },
    {
      id: 'doc-4',
      clientCode: 'CL102',
      clientName: 'Empresa Alfa Ltda (Matriz)',
      title: 'Nota Fiscal de Honorários 09/2026',
      folder: 'Notas fiscais',
      blocking: false,
      status: 'Aprovado',
      deadline: '30/09/2026',
      fileName: 'NF_00192_GSA_HONORARIOS.pdf',
      fileSize: '450 KB',
      uploadedAt: '30/09/2026 às 09:00'
    },
    {
      id: 'doc-5',
      clientCode: 'CL103',
      clientName: 'Mariana Costa',
      title: 'Comprovante de Pagamento Taxa DARE',
      folder: 'Impostos & Taxas',
      blocking: true,
      status: 'Rejeitado',
      deadline: '02/10/2026',
      fileName: 'comprovante_ilegivel.jpg',
      fileSize: '820 KB',
      uploadedAt: '01/10/2026 às 18:00',
      feedback: 'Documento ilegível. Código de autenticação bancária cortado na imagem.'
    }
  ] : []);

  const reloadDocuments = async () => {
    try {
      const state = await api('/state');
      if (Array.isArray(state.clients)) {
        setClientOptions(state.clients);
        setNewClient((current) => current && state.clients.some((client: any) => String(client.id) === String(current))
          ? current
          : String(state.clients[0]?.id || ''));
      }
      const clientsById = new Map<string, any>((state.clients || []).map((client: any) => [String(client.id), client] as [string, any]));
      if (Array.isArray(state.documents)) {
        setDocuments(state.documents.map((doc: any) => {
          const client = clientsById.get(String(doc.clientId));
          const latest = Array.isArray(doc.versions) ? doc.versions[doc.versions.length - 1] : null;
          return { ...doc, id: String(doc.id), clientCode: client?.code || `CL${doc.clientId}`, clientName: client?.name || 'Cliente', orderCode: doc.orderCode || (doc.orderId ? `OS${doc.orderId}` : ''), folder: doc.folder || 'Geral', status: doc.status || 'Aguardando envio', deadline: doc.deadline || '—', fileName: latest?.fileName, uploadedAt: latest?.date, feedback: doc.rejectionReason };
        }) as DocItem[]);
      }
    } catch {
      // Keep the seeded list available if the server is temporarily unavailable.
    }
  };
  useEffect(() => {
    void reloadDocuments();
    const handleReload = () => { void reloadDocuments(); };
    window.addEventListener('gsa:reload', handleReload);
    return () => window.removeEventListener('gsa:reload', handleReload);
  }, []);

  const displayedFolders = selectedClient === 'all'
    ? [{ id: 'all', name: 'Todos os Documentos', count: documents.length }]
    : [
        { id: 'all', name: 'Todos os Documentos do Cliente', count: documents.filter(d => d.clientCode === selectedClient).length },
        ...customFolders.filter(f => f.clientId === selectedClient).map(f => ({
          id: f.id,
          name: f.name,
          count: documents.filter(d => d.clientCode === selectedClient && d.folder === f.name).length,
          custom: true
        }))
      ];

  const filteredDocs = documents.filter((d) => {
    if (selectedClient !== 'all' && d.clientCode !== selectedClient) return false;
    
    // Convert folder ID back to name for filtering
    const targetFolderName = activeFolder === 'all' ? 'all' : (customFolders.find(f => f.id === activeFolder)?.name || activeFolder);

    const matchesSearch =
      d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.clientCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFolder = activeFolder === 'all' || targetFolderName === 'all' || d.folder === targetFolderName;
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchesSearch && matchesFolder && matchesStatus;
  });

  const handleCreateRequest = async () => {
    if (!newTitle.trim()) return;
    
    // Quick helper to map client ID to name for display
    const getClientName = (id: string) => {
      if (id === '102') return 'Empresa Alfa Ltda (Matriz)';
      if (id === '108') return 'Empresa Alfa Ltda (Serviços)';
      if (id === '103') return 'Mariana Costa Silva';
      return 'Empresa Alfa Ltda';
    };

    const newDoc: DocItem = {
      id: `doc-${Date.now()}`,
      clientCode: `CL${newClient}`,
      clientName: getClientName(newClient),
      orderCode: `OS${newOrder}`,
      title: newTitle,
      folder: newFolder,
      blocking: newBlocking,
      status: 'Aguardando envio',
      deadline: newDeadline
    };
    try {
      await api('/documents', { clientId: Number(newClient), orderId: Number(newOrder), title: newTitle, description: newDescription, deadline: newDeadline, blocking: newBlocking, folder: newFolder, visible: true });
      await reloadDocuments();
    } catch {
      setDocuments([newDoc, ...documents]);
    }
    setNewTitle('');
    setNewDescription('');
    setIsRequestModalOpen(false);
  };

  const handleApprove = async (doc: DocItem) => {
    try { await api(`/documents/${doc.id}/approve`, {}, 'PATCH'); await reloadDocuments(); } catch {
    setDocuments(
      documents.map((d) => (d.id === doc.id ? { ...d, status: 'Aprovado', feedback: undefined } : d))
    );
    }
    setIsReviewModalOpen(false);
  };

  const handleReject = async (doc: DocItem) => {
    if (!rejectReason.trim()) return;
    try { await api(`/documents/${doc.id}/reject`, { reason: rejectReason.trim() }, 'PATCH'); await reloadDocuments(); } catch {
    setDocuments(
      documents.map((d) => (d.id === doc.id ? { ...d, status: 'Rejeitado', feedback: rejectReason } : d))
    );
    }
    setRejectReason('');
    setIsReviewModalOpen(false);
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {toast && <div className="banner-alert banner-alert--green" role="status">{toast}<Button variant="ghost" size="sm" onClick={() => showToast('')}>Fechar</Button></div>}
      {/* Header */}
      <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">Gestão de Documentos</h1>
          <p className="page-subtitle">Controle de solicitações, pendências documentais e pastas por cliente.</p>
        </div>
        <Button
          variant="primary"
          size="md"
          icon={<Plus size={16} />}
          onClick={() => setIsRequestModalOpen(true)}
        >
          Solicitar Documento
        </Button>
      </div>

      {/* Main Grid: Left Folders Sidebar + Right Document List */}
      <div className="documents-grid">
        {/* Left Panel: Folder Navigation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Visualizar Cliente</label>
              <select 
                className="form-select" 
                value={selectedClient} 
                onChange={e => {
                  setSelectedClient(e.target.value);
                  setActiveFolder('all');
                }}
                style={{ fontSize: 13, padding: '6px 10px' }}
              >
                <option value="all">Visão Global (Todos)</option>
                {(clientOptions.length ? clientOptions : (isDemoMode ? [{ id: '108', code: 'CL108', name: 'Empresa Alfa Ltda' }] : [])).map(c => <option key={c.id} value={c.id}>{c.code ? `${c.code} — ` : ''}{c.name}</option>)}
              </select>
            </div>
            <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Pastas
              </div>
              {selectedClient !== 'all' && (
                <button className="responsive-row" 
                  onClick={() => { setFolderForm({id:'', name:''}); setIsFolderModalOpen(true); }}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}
                >
                  <Plus size={14} /> Nova
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {displayedFolders.map((f) => {
                const isActive = activeFolder === f.id;
                return (
                  <button className="responsive-row"
                    key={f.id}
                    type="button"
                    onClick={() => setActiveFolder(f.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: isActive ? '#eff6ff' : 'transparent',
                      color: isActive ? '#2563eb' : '#334155',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 150ms ease'
                    }}
                  >
                    <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Folder size={16} color={isActive ? '#2563eb' : '#64748b'} />
                      <span style={{ fontSize: 13 }}>{f.name}</span>
                    </div>
                    <span
                      style={{
                        background: isActive ? '#bfdbfe' : '#f1f5f9',
                        color: isActive ? '#1d4ed8' : '#64748b',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: 10
                      }}
                    >
                      {f.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Quick Stats Card */}
          <Card style={{ padding: 16, background: '#f8fafc' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
              Status das Solicitações
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', color: '#b45309' }}>
                <span>Em análise:</span>
                <strong>{documents.filter((d) => d.status === 'Em análise').length}</strong>
              </div>
              <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span>Aguardando envio:</span>
                <strong>{documents.filter((d) => d.status === 'Aguardando envio').length}</strong>
              </div>
              <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', color: '#047857' }}>
                <span>Aprovados:</span>
                <strong>{documents.filter((d) => d.status === 'Aprovado').length}</strong>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Panel: Search, Filter, Document Cards & Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Header of the Right Panel */}
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '12px 16px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Folder size={20} color="#64748b" />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                {activeFolder === 'all' ? 'Todos os Documentos' : (customFolders.find(f => f.id === activeFolder)?.name || activeFolder)}
              </h2>
            </div>
            {activeFolder !== 'all' && (
              <Button variant="outline-blue" size="sm" icon={<Upload size={14} />} onClick={() => setIsDirectUploadModalOpen(true)}>
                Incluir Arquivo
              </Button>
            )}
          </div>

          {/* Filter Bar */}
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div className="topbar-search-wrap" style={{ maxWidth: 360 }}>
              <input
                type="text"
                className="topbar-search-input"
                placeholder="Buscar documento ou cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search size={16} className="topbar-search-icon" />
            </div>

            <div className="responsive-row" style={{ display: 'flex', gap: 6 }}>
              {['all', 'Em análise', 'Aguardando envio', 'Aprovado', 'Rejeitado'].map((st) => (
                <Button
                  key={st}
                  variant={statusFilter === st ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setStatusFilter(st)}
                >
                  {st === 'all' ? 'Todos os Status' : st}
                </Button>
              ))}
            </div>
          </div>

          {/* Documents Table */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-responsive">
              <div className="table-responsive admin-mobile-card-table" role="region" aria-label="Lista de documentos" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Documento Solicitado</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Cliente / Vínculo</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Prazo</th>
                  <th style={{ padding: '14px 20px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((doc) => (
                  <tr
                    key={doc.id}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background 150ms ease'
                    }}
                  >
                    <td data-label="Documento" style={{ padding: '16px 20px' }}>
                      <div className="responsive-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            background: doc.blocking ? '#fef2f2' : '#eff6ff',
                            color: doc.blocking ? '#ef4444' : '#2563eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}
                        >
                          <FileText size={18} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{doc.title}</div>
                          <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <span style={{ fontSize: 12, color: '#64748b' }}>Pasta: {doc.folder}</span>
                          </div>
                          {doc.feedback && (
                            <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4, fontStyle: 'italic' }}>
                              Motivo rejeição: {doc.feedback}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td data-label="Cliente" style={{ padding: '16px 20px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{doc.clientName}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {doc.clientCode} {doc.orderCode && `• ${doc.orderCode}`}
                      </div>
                    </td>

                    <td data-label="Prazo" style={{ padding: '16px 20px', color: '#475569', fontSize: 13 }}>
                      {doc.deadline}
                    </td>

                    <td data-label="Status" style={{ padding: '16px 20px' }}>
                      <Badge
                        status={doc.status}
                        variant={
                          doc.status === 'Aprovado'
                            ? 'green'
                            : doc.status === 'Em análise'
                            ? 'yellow'
                            : doc.status === 'Rejeitado'
                            ? 'red'
                            : 'gray'
                        }
                      />
                    </td>

                    <td data-label="Ações" style={{ padding: '16px 20px', textAlign: 'right' }}>
                      {doc.status === 'Em análise' ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setSelectedDoc(doc);
                            setIsReviewModalOpen(true);
                          }}
                        >
                          Avaliar Envio
                        </Button>
                      ) : doc.fileName ? (
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Eye size={14} />}
                            onClick={() => setPreviewDoc(doc)}
                          >
                            Ver
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Download size={14} />}
                            onClick={() => handleDownload(doc.fileName || 'documento')}
                          >
                            Baixar
                          </Button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>Aguardando cliente</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            </div>
          </Card>
        </div>
      </div>

      {/* Modal: Solicitar Novo Documento */}
      <Modal
        open={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        title="Solicitar Documento ao Cliente"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px 0' }}>
            Preencha os dados abaixo para solicitar um documento ao cliente.
          </p>

          <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 20 }}></div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>Cliente e Vínculo</h3>
          
          <div className="responsive-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Cliente Vinculado</label>
              <select className="form-select" value={newClient} onChange={e => setNewClient(e.target.value)}>
                {clientOptions.length ? clientOptions.map((client: any) => (
                  <option key={client.id} value={client.id}>{client.code ? `${client.code} — ` : ''}{client.name}</option>
                )) : isDemoMode ? <>
                  <option value="102">Empresa Alfa Ltda (Matriz)</option>
                  <option value="108">Empresa Alfa Ltda (Serviços)</option>
                  <option value="103">Mariana Costa Silva</option>
                </> : <option value="" disabled>Nenhum cliente disponível</option>}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Ordem de Serviço (Opcional)</label>
              <input type="number" className="form-input" placeholder="Ex: 105" value={newOrder} onChange={e => setNewOrder(e.target.value)} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 20, marginTop: 6 }}></div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>Dados do Documento</h3>
          
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Título da Solicitação *</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: Cópia autenticada do RG dos administradores"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Instruções para o Cliente</label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Ex: Enviar frente e verso em PDF legível..."
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 20, marginTop: 6 }}></div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>Configurações</h3>
          
          <div className="responsive-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Prazo Limite</label>
              <input
                type="date"
                className="form-input"
                value={newDeadline}
                onChange={(e) => setNewDeadline(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Pasta Destino</label>
              <select className="form-select" value={newFolder} onChange={e => setNewFolder(e.target.value)}>
                <option value="Documentos societários">Documentos societários</option>
                <option value="Contratos">Contratos</option>
                <option value="Notas fiscais">Notas fiscais</option>
                <option value="Impostos & Taxas">Impostos & Taxas</option>
              </select>
            </div>
          </div>

          <div className="responsive-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              marginTop: 6
            }}
          >
            <input
              type="checkbox"
              id="blocking-checkbox"
              checked={newBlocking}
              onChange={(e) => setNewBlocking(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <label htmlFor="blocking-checkbox" style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>
              Documento obrigatório para concluir a etapa (requer aprovação)
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <Button variant="secondary" onClick={() => setIsRequestModalOpen(false)} style={{ width: '100%' }}>
                Cancelar
              </Button>
            </div>
            <div style={{ flex: 2 }}>
              <Button variant="primary" onClick={handleCreateRequest} style={{ width: '100%' }}>
                Enviar Solicitação
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal: Avaliar Arquivo Enviado */}
      {selectedDoc && (
        <Modal
          open={isReviewModalOpen}
          onClose={() => { setIsReviewModalOpen(false); setShowRejectConfirm(false); setRejectReason(''); }}
          title={`Avaliação de Documento: ${selectedDoc.title}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px 0' }}>
              Avalie o arquivo enviado pelo cliente. Você pode aprovar ou rejeitar informando o motivo.
            </p>

            <div style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Arquivo enviado pelo cliente:</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                {selectedDoc.fileName} ({selectedDoc.fileSize})
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                Enviado em: {selectedDoc.uploadedAt}
              </div>
              <div style={{ marginTop: 10 }}>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Eye size={14} />}
                  onClick={() => setPreviewDoc(selectedDoc)}
                >
                  Visualizar Arquivo
                </Button>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 20, marginTop: 6 }}></div>

            {!showRejectConfirm ? (
              <>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Motivo da Rejeição (Apenas se for recusar)</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Ex: Documento com validade expirada..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <div style={{ flex: 1 }}>
                    <Button variant="secondary" onClick={() => setIsReviewModalOpen(false)} style={{ width: '100%' }}>
                      Cancelar
                    </Button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Button
                      variant="danger"
                      icon={<XCircle size={16} />}
                      onClick={() => setShowRejectConfirm(true)}
                      disabled={!rejectReason.trim()}
                      style={{ width: '100%' }}
                    >
                      Rejeitar
                    </Button>
                  </div>
                  <div style={{ flex: 2 }}>
                    <Button
                      variant="success"
                      icon={<CheckCircle2 size={16} />}
                      onClick={() => handleApprove(selectedDoc)}
                      style={{ width: '100%' }}
                    >
                      Aprovar Documento
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: 14, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
                <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>Confirmar Rejeição</div>
                <p style={{ fontSize: 13, color: '#991b1b', margin: '0 0 16px 0' }}>
                  Tem certeza que deseja rejeitar este documento? O cliente será notificado com o motivo informado.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <Button variant="secondary" onClick={() => setShowRejectConfirm(false)} style={{ width: '100%' }}>
                      Voltar
                    </Button>
                  </div>
                  <div style={{ flex: 2 }}>
                    <Button variant="danger" onClick={() => { handleReject(selectedDoc); setShowRejectConfirm(false); }} style={{ width: '100%' }}>
                      Confirmar Rejeição
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal: Prévia do Arquivo */}
      {previewDoc && (
        <Modal
          open={true}
          onClose={() => setPreviewDoc(null)}
          title={`Prévia: ${previewDoc.title}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px 0' }}>
              Visualização rápida do documento.
            </p>
            <div
              style={{
                height: 240,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                color: '#2563eb'
              }}
            >
              <FileText size={48} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                  {previewDoc.fileName || 'arquivo_anexado.pdf'}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Tamanho: {previewDoc.fileSize || '1.8 MB'} • Enviado pelo cliente
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <Button variant="secondary" onClick={() => setPreviewDoc(null)} style={{ width: '100%' }}>
                  Fechar
                </Button>
              </div>
              <div style={{ flex: 2 }}>
                <Button
                  variant="primary"
                  icon={<Download size={16} />}
                  onClick={() => handleDownload(previewDoc.fileName || 'documento')}
                  style={{ width: '100%' }}
                >
                  Baixar Arquivo
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Gerenciar Pasta */}
      <Modal
        open={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        title={folderForm.id ? "Editar Pasta" : "Nova Pasta"}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px 0' }}>
            Informe o nome da pasta para organizar os documentos.
          </p>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nome da Pasta</label>
            <input 
              type="text" 
              className="form-input" 
              value={folderForm.name} 
              onChange={e => setFolderForm({...folderForm, name: e.target.value})}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <Button variant="secondary" onClick={() => setIsFolderModalOpen(false)} style={{ width: '100%' }}>
                Cancelar
              </Button>
            </div>
            <div style={{ flex: 2 }}>
              <Button variant="success" onClick={() => {
                if (!folderForm.name.trim()) return;
                if (folderForm.id) {
                  setCustomFolders(customFolders.map(f => f.id === folderForm.id ? { ...f, name: folderForm.name } : f));
                } else {
                  setCustomFolders([...customFolders, { id: 'f' + Date.now(), clientId: selectedClient, name: folderForm.name }]);
                }
                setIsFolderModalOpen(false);
              }} style={{ width: '100%' }}>
                Salvar Pasta
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal: Upload Direto na Pasta */}
      {isDirectUploadModalOpen && (
        <Modal open={isDirectUploadModalOpen} onClose={() => setIsDirectUploadModalOpen(false)} title="Incluir Arquivo na Pasta">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px 0' }}>
              Faça o upload de um arquivo para incluí-lo diretamente na pasta atual.
            </p>
            
            <div style={{ padding: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 6 }}>
              <p style={{ fontSize: 13, color: '#166534', margin: 0 }}>
                Você está incluindo um arquivo na pasta <strong>{customFolders.find(f => f.id === activeFolder)?.name || activeFolder}</strong>. Ele será marcado como aprovado imediatamente.
              </p>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Título do Documento</label>
              <input type="text" className="form-input" placeholder="Ex: Comprovante de Pagamento" autoFocus />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Arquivo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', border: '2px dashed #e2e8f0', borderRadius: 8, justifyContent: 'center' }}>
                <input type="file" id="direct-upload-input" style={{ display: 'none' }} />
                <Button variant="outline-blue" size="sm" onClick={() => document.getElementById('direct-upload-input')?.click()} icon={<Upload size={14} />}>
                  Selecionar Arquivo
                </Button>
                <span style={{ fontSize: 13, color: '#64748b' }}>Nenhum arquivo selecionado</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <Button variant="secondary" onClick={() => setIsDirectUploadModalOpen(false)} style={{ width: '100%' }}>
                  Cancelar
                </Button>
              </div>
              <div style={{ flex: 2 }}>
                <Button variant="primary" onClick={() => {
                  showToast('Arquivo enviado e salvo na pasta com sucesso!');
                  setIsDirectUploadModalOpen(false);
                }} style={{ width: '100%' }}>
                  Fazer Upload
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default AdminDocuments;
