import React, { useState } from 'react';
import {
  FileText,
  Download,
  Upload,
  Send,
  CheckCircle,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Building2,
  BriefcaseBusiness,
  CircleDollarSign,
  PenLine
} from 'lucide-react';
import { Contract } from '../../types';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import { api, isDemoMode, money } from '../../api';
import { buildContractPdf, downloadContractPdf } from '../../documents';

export interface ClientContractsProps {
  contract?: Contract;
  onBack?: () => void;
  routeDetail?: string | null;
  onOpenContract?: (code: string) => void;
  onCloseContract?: () => void;
}

export function ClientContracts({ contract: propContract, onBack, routeDetail, onOpenContract, onCloseContract }: ClientContractsProps) {
  // Sample data matching Image 5
  const fallbackContract: Contract = propContract || {
    id: 157,
    code: 'CONT-2024-00157',
    clientId: 102,
    serviceId: 101,
    start: '2024-06-10',
    end: '2025-06-30',
    term: 'fixed',
    status: 'Aguardando envio',
    total: 153000,
    fileName: 'contrato-srv101.pdf',
    fileId: 'mock-contrato-srv101.pdf',
    signedFileId: null
  };
  const [remoteContracts, setRemoteContracts] = React.useState<Contract[]>([]);
  React.useEffect(() => {
    const reload = async () => {
      try {
        const result = await api('/contracts');
        if (Array.isArray(result)) setRemoteContracts(result);
      } catch {
        // Keep the local fixture visible if the server is unavailable.
      }
    };
    void reload();
    window.addEventListener('gsa:reload', reload);
    return () => window.removeEventListener('gsa:reload', reload);
  }, []);
  const availableContracts: Contract[] = remoteContracts.length
    ? remoteContracts
    : (propContract ? [propContract] : (isDemoMode ? [fallbackContract] : []));
  const contract: Contract = availableContracts.find((item) => item.code === routeDetail) || availableContracts[0] || fallbackContract;
  const contractClientCode = (contract as any).client?.code || (contract as any).clientCode || (contract.clientId ? `CL${contract.clientId}` : '—');
  const contractClientName = (contract as any).client?.name || (contract as any).clientName || 'Cliente';
  const contractClientDocument = (contract as any).client?.document || (contract as any).clientDocument || '';
  const contractServiceCode = (contract as any).service?.code || (contract as any).serviceCode || (contract.serviceId ? `SRV${contract.serviceId}` : '—');
  const contractServiceName = (contract as any).service?.name || (contract as any).serviceTitle || 'Serviço contratado';
  const hasContract = availableContracts.length > 0;

  const [uploadedFile, setUploadedFile] = useState<{ file: File; name: string; size: string } | null>(null);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadContractId, setUploadContractId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [sentContractIds, setSentContractIds] = useState<number[]>([]);
  const [showContract, setShowContract] = useState(Boolean(routeDetail));
  React.useEffect(() => { setShowContract(routeDetail === contract.code); }, [routeDetail, contract.code]);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isContractSent = (item: Contract) =>
    sentContractIds.includes(Number(item.id)) || item.status === 'Em análise' || item.status === 'Assinado';
  const isSent = isContractSent(contract);
  const uploadContract = availableContracts.find((item) => item.id === uploadContractId) || contract;
  const digitalSignatureUrl = contract.signingUrl || contract.signatureUrl || '';
  const [signatureError, setSignatureError] = useState('');
  const [signatureMessage, setSignatureMessage] = useState('');
  const [signatureUpgrade, setSignatureUpgrade] = useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('govbr_signature');
    if (result === 'success') {
      setSignatureMessage('Contrato assinado digitalmente com sucesso pelo Gov.br.');
      setSignatureError('');
      setSignatureUpgrade(false);
    } else if (result === 'upgrade') {
      setSignatureUpgrade(true);
      setSignatureError('Sua conta Gov.br precisa ser nível prata ou ouro para assinar este contrato.');
    } else if (result === 'error') {
      setSignatureUpgrade(false);
      setSignatureError('Não foi possível concluir a assinatura Gov.br. Tente novamente ou entre em contato com o suporte.');
    }
    if (result) {
      params.delete('govbr_signature');
      const query = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    }
  }, []);

  const openUploadModal = (targetContract?: Contract) => {
    const target = targetContract || availableContracts.find((item) => !isContractSent(item)) || contract;
    setUploadContractId(target?.id ?? null);
    setUploadedFile(null);
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setUploadModalOpen(true);
  };

  const handleSelectFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setUploadedFile({
        file,
        name: file.name,
        size: `${Math.round(file.size / 1024)} KB`
      });
      setUploadError('');
    }
  };

  const handleSend = async () => {
    if (!uploadedFile || !uploadContract || uploading) return;
    setUploading(true);
    setUploadError('');
    try {
      const payload = new FormData();
      payload.append('file', uploadedFile.file);
      await api(`/contracts/${uploadContract.id}/upload`, payload);
      const uploadedContractId = Number(uploadContract.id);
      setSentContractIds((current) => current.includes(uploadedContractId) ? current : [...current, uploadedContractId]);
      setRemoteContracts((items) => items.map((item) => item.id === uploadedContractId
        ? { ...item, status: 'Em análise', signedFileName: uploadedFile.name }
        : item));
      setUploadModalOpen(false);
      setIsSuccessModalOpen(true);
    } catch (requestError: any) {
      setUploadError(requestError?.message || 'Não foi possível enviar o contrato assinado.');
    } finally {
      setUploading(false);
    }
  };

  const handleUploadCancel = () => {
    if (uploading) return;
    setUploadModalOpen(false);
    setUploadedFile(null);
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleModalClose = () => {
    setIsSuccessModalOpen(false);
  };

  const renderUploadModal = () => (
    <Modal open={uploadModalOpen} onClose={handleUploadCancel} title="Enviar contrato assinado">
      <div className="contract-upload-modal">
        <p className="contract-upload-modal-help">Escolha o contrato e anexe o PDF assinado para enviar para análise.</p>

        <div className="form-group">
          <label className="form-label" htmlFor="signed-contract-select">Contrato</label>
          <select
            id="signed-contract-select"
            className="form-select"
            value={uploadContract?.id ?? ''}
            onChange={(event) => {
              setUploadContractId(Number(event.target.value));
              setUploadedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            disabled={availableContracts.length <= 1 || uploading}
          >
            {availableContracts.map((item) => (
              <option key={item.id} value={item.id} disabled={isContractSent(item)}>
                {item.code} — {item.service?.name || 'Contrato'}{isContractSent(item) ? ' (já enviado)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="contract-upload-file-area">
          <div>
            <strong>Contrato assinado em PDF</strong>
            <span>Selecione o arquivo assinado para anexar.</span>
          </div>
          <Button variant="outline-blue" size="sm" icon={<Upload size={15} />} onClick={handleSelectFileClick} disabled={uploading}>
            Escolher arquivo
          </Button>
        </div>

        {uploadedFile && (
          <div className="contract-upload-file-chip">
            <FileText size={18} />
            <div>
              <strong>{uploadedFile.name}</strong>
              <span>{uploadedFile.size}</span>
            </div>
            <button type="button" aria-label="Remover arquivo" onClick={() => { setUploadedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} disabled={uploading}>
              <X size={17} />
            </button>
          </div>
        )}

        {uploadError && <p className="form-error" role="alert">{uploadError}</p>}

        <div className="contract-upload-actions">
          <Button variant="secondary" onClick={handleUploadCancel} disabled={uploading}>Cancelar</Button>
          <Button variant="success" icon={<Send size={16} />} onClick={handleSend} disabled={!uploadedFile || !uploadContract || uploading}>
            {uploading ? 'Enviando...' : 'Enviar'}
          </Button>
        </div>
      </div>
    </Modal>
  );

  const renderSuccessModal = () => (
    <Modal
      open={isSuccessModalOpen}
      onClose={handleModalClose}
      isSuccessModal={true}
      successTitle="Seu contrato foi enviado e ficará em análise pelo sistema."
      successButtonText="Entendi"
    />
  );

  const handleDigitalSignature = async () => {
    setSignatureError('');
    setSignatureMessage('');
    setSignatureUpgrade(false);
    if (!digitalSignatureUrl) {
      try {
        if (!contract.fileId) {
          const pdf = buildContractPdf({ ...contract, clientName: contractClientName, serviceTitle: contractServiceName, clientTax: contractClientDocument, totalFormatted: money(contract.total) });
          const file = new File([pdf.output('blob')], `${String(contract.code || 'contrato').replace(/[^\w.-]/g, '_')}.pdf`, { type: 'application/pdf' });
          const payload = new FormData();
          payload.append('file', file);
          await api(`/contracts/${contract.id}/upload`, payload);
        }
        const result = await api(`/govbr/signature/start/${contract.id}`);
        if (!result?.authorizationUrl) throw new Error('O servidor não retornou o endereço de autorização Gov.br.');
        window.location.assign(result.authorizationUrl);
      } catch (requestError: any) {
        setSignatureError(requestError?.message || 'Não foi possível iniciar a assinatura digital pelo Gov.br.');
      }
      return;
    }
    window.open(digitalSignatureUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadContract = async () => {
    try {
      await downloadContractPdf({
        ...contract,
        clientName: contractClientName,
        serviceTitle: contractServiceName,
        clientTax: contractClientDocument,
        totalFormatted: money(contract.total)
      });
    } catch (error: any) {
      setSignatureError(error?.message || 'Não foi possível baixar o contrato agora.');
    }
  };

  if (!hasContract) {
    return (
      <div className="client-contract-list" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="responsive-row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 className="page-title">Meus Contratos</h1>
            <p className="page-subtitle">Nenhum contrato disponível no momento.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!showContract) {
    return (
      <div className="client-contract-list" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="responsive-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 className="page-title">Meus Contratos</h1>
            <p className="page-subtitle">Consulte seus contratos, status e documentos assinados.</p>
          </div>
        </div>
        <button type="button" className="client-service-list-card" onClick={() => { setShowContract(true); onOpenContract?.(contract.code); }}>
          <span className="client-service-list-icon"><FileText size={23} /></span>
          <span className="client-service-list-content">
            <span className="client-service-list-topline">
              <strong>{contract.code}</strong>
              <Badge status={contract.status} />
            </span>
            <b>Contrato de Prestação de Serviços</b>
            <span>{contractServiceName} · {money(contract.total)}</span>
            <span className="client-service-list-progress">
              <i><em style={{ width: isSent ? '100%' : '52%' }} /></i>
              {contract.status === 'Assinado'
                ? 'Contrato aprovado'
                : isContractSent(contract)
                  ? 'Contrato enviado para análise'
                  : 'Aguardando envio do contrato'}
            </span>
          </span>
          <span className="client-service-list-arrow"><ChevronRight size={19} /></span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', paddingBottom: 60 }}>
      {/* Top Bar with back arrow (Image 5) */}
      <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        {(onBack || showContract) && (
          <button className="responsive-row"
            type="button"
            onClick={() => { setShowContract(false); if (onCloseContract) onCloseContract(); else onBack?.(); }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#0f172a',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <ChevronLeft size={24} />
          </button>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Contrato {contract.code}</h1>
          <div style={{ marginTop: 4 }}>
            <Badge
              status={contract.status === 'Assinado' ? 'Assinado' : isSent ? 'Em análise' : 'Aguardando envio'}
              variant={contract.status === 'Assinado' ? 'green' : isSent ? 'yellow' : 'blue'}
            />
          </div>
        </div>
      </div>

      {/* Contract submission notice */}
      {!isSent ? (
        <div className="banner-alert contract-awaiting-notice">
          <div className="contract-awaiting-notice-icon"><AlertCircle size={22} /></div>
          <div>
            <div style={{ fontWeight: 800, color: '#78350f' }}>
              Aguardando envio do contrato assinado
            </div>
            <div style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>
              Envie o contrato assinado para darmos continuidade ao processo.
            </div>
          </div>
        </div>
      ) : (
        <div className={`banner-alert ${contract.status === 'Assinado' ? 'banner-alert--green' : ''}`}>
          <CheckCircle size={20} color="#10b981" style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, color: '#065f46' }}>
              {contract.status === 'Assinado' ? 'Contrato aprovado' : 'Contrato enviado com sucesso'}
            </div>
            <div style={{ fontSize: 12, color: '#047857', marginTop: 2 }}>
              {contract.status === 'Assinado'
                ? 'Seu contrato assinado foi validado e aprovado pelo painel administrativo.'
                : 'Seu contrato foi enviado e ficará em análise pelo sistema.'}
            </div>
          </div>
        </div>
      )}

      {signatureMessage && (
        <div className="banner-alert banner-alert--green" role="status">
          <CheckCircle size={20} color="#10b981" style={{ flexShrink: 0 }} />
          <div style={{ fontWeight: 700, color: '#065f46' }}>{signatureMessage}</div>
        </div>
      )}
      {signatureUpgrade && (
        <div className="banner-alert contract-signature-upgrade" role="alert">
          <div>
            <strong>Atualize sua conta Gov.br para continuar.</strong>
            <div>É necessário ter nível prata ou ouro para usar a assinatura eletrônica.</div>
            <a href="https://confiabilidades.acesso.gov.br/" target="_blank" rel="noreferrer">Atualizar nível da conta</a>
          </div>
        </div>
      )}

      {/* Meta Row: Cliente | Serviço | Valor contratado (Image 5) */}
      <div className="client-contract-data-card">
        <div className="client-contract-data-item">
          <span className="client-contract-data-icon"><Building2 size={19} /></span>
          <div className="client-contract-data-copy">
            <span>Cliente</span>
            <strong>{contractClientCode}</strong>
            <small>{contractClientName}</small>
          </div>
        </div>

        <div className="client-contract-data-item">
          <span className="client-contract-data-icon"><BriefcaseBusiness size={19} /></span>
          <div className="client-contract-data-copy">
            <span>Serviço</span>
            <strong>{contractServiceCode}</strong>
            <small>{contractServiceName}</small>
          </div>
        </div>

        <div className="client-contract-data-item client-contract-data-item--value">
          <span className="client-contract-data-icon"><CircleDollarSign size={19} /></span>
          <div className="client-contract-data-copy">
            <span>Valor Contratado</span>
            <strong>{money(contract.total)}</strong>
            <small>Valor total do serviço</small>
          </div>
        </div>
      </div>

      {/* Contract in PDF Section (Image 5) */}
      <div style={{ marginBottom: 20 }}>
        <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <FileText size={20} color="#2563eb" />
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Contrato em PDF</h3>
            <p style={{ fontSize: 12, color: '#64748b' }}>Visualize o contrato completo abaixo.</p>
          </div>
        </div>

        {/* Embedded PDF Viewer Component Simulator */}
        <div className="pdf-viewer-container">
          <div className="pdf-viewer-toolbar">
            <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span>☰</span>
              <span>1 / 8</span>
              <span>— 100% +</span>
            </div>
            <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span className="responsive-row" title="Baixar Contrato em PDF" style={{ display: 'flex', alignItems: 'center' }}>
                <Download size={14} style={{ cursor: 'pointer' }} onClick={handleDownloadContract} />
              </span>
              <span>🖨️</span>
              <span>⋮</span>
            </div>
          </div>

          <div className="pdf-viewer-body">
            <div className="pdf-page-mock">
              <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 16, marginBottom: 20 }}>
                <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, background: '#2563eb', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14 }}>
                    G
                  </div>
                  <strong style={{ fontSize: 16, color: '#0f172a' }}>GSA HUB</strong>
                </div>
                <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b' }}>
                  Contrato<br />
                  <strong>Nº {contract.code}</strong>
                </div>
              </div>

              <h2 style={{ fontSize: 16, fontWeight: 800, textAlign: 'center', margin: '20px 0', textTransform: 'uppercase', color: '#0f172a' }}>
                CONTRATO DE PRESTAÇÃO DE SERVIÇOS
              </h2>

              <p style={{ marginBottom: 12 }}>
                <strong>1. PARTES</strong><br />
                Este contrato é celebrado entre a <strong>{contractClientName}</strong>{contractClientDocument ? `, inscrita sob ${contractClientDocument}` : ''}, doravante denominada "CONTRATANTE", e a <strong>GSA HUB</strong>, doravante denominada "CONTRATADA".
              </p>

              <p style={{ marginBottom: 12 }}>
                <strong>2. OBJETO</strong><br />
                O presente contrato tem por objeto a prestação de serviços de {contractServiceName.toLowerCase()}, conforme condições e prazos acordados.
              </p>

              <p style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: 11 }}>
                [Página 1 de 8 — Documento emitido eletronicamente pela plataforma GSA HUB]
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Uploaded File Chip / Selection (Image 5 Screen 2 & 4) */}
      {uploadedFile && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
            {isSent ? 'Arquivo enviado' : 'Arquivo anexado'}
          </div>
          <div className="responsive-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#ffffff',
              border: isSent ? '1px solid #10b981' : '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '12px 16px'
            }}
          >
            <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  background: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 10
                }}
              >
                PDF
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                  {uploadedFile.name}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {uploadedFile.size} • Enviado em 10/06/2024
                </div>
              </div>
            </div>

            {isSent ? (
              <CheckCircle size={20} color="#10b981" />
            ) : (
              <button
                type="button"
                onClick={() => setUploadedFile(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom Action Buttons */}
      <div className="contract-action-buttons">
        <Button
          variant="outline-blue"
          icon={<Download size={18} />}
          onClick={handleDownloadContract}
        >
          Baixar contrato
        </Button>

        <Button
          variant="primary"
          icon={<PenLine size={18} />}
          onClick={handleDigitalSignature}
        >
          Assinar digitalmente
        </Button>

        <Button
          variant="upload"
          icon={<Upload size={18} />}
          onClick={() => openUploadModal(contract)}
          disabled={isSent}
        >
          Enviar contrato assinado
        </Button>
      </div>
      {signatureError && <p className="form-error contract-signature-error" role="alert">{signatureError}</p>}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        accept=".pdf,application/pdf"
      />

      {renderUploadModal()}

      {renderSuccessModal()}
    </div>
  );
}

export default ClientContracts;
