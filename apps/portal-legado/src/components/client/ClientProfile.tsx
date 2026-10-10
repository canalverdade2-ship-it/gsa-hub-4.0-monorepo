import React, { useEffect, useState } from 'react';
import { User, Building2, Mail, Phone, MapPin, Shield, Lock, CheckCircle2, AlertCircle, MessageCircle, Trash2, Clock } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { api, isDemoMode } from '../../api';

export interface ClientProfileProps {
  onNavigate?: (screen: string) => void;
}

export function ClientProfile({ onNavigate }: ClientProfileProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'security'>('info');

  // Contact Form
  const [name, setName] = useState(isDemoMode ? 'Empresa Alfa Ltda' : '');
  const [tradeName, setTradeName] = useState(isDemoMode ? 'Alfa Serviços' : '');
  const [tax] = useState(isDemoMode ? '12.345.678/0001-90' : ''); // Read-only
  const [contactName, setContactName] = useState(isDemoMode ? 'Roberto Alfa' : '');
  const [email, setEmail] = useState(isDemoMode ? 'alfa@gsa.local' : '');
  const [phone, setPhone] = useState(isDemoMode ? '(11) 97777-8888' : '');
  const [whatsapp, setWhatsapp] = useState(isDemoMode ? '(11) 97777-8888' : '');

  // Address
  const [cep, setCep] = useState(isDemoMode ? '01001-000' : '');
  const [street, setStreet] = useState(isDemoMode ? 'Rua das Indústrias' : '');
  const [number, setNumber] = useState(isDemoMode ? '100' : '');
  const [extra, setExtra] = useState(isDemoMode ? 'Sala 402' : '');
  const [district, setDistrict] = useState(isDemoMode ? 'Centro' : '');
  const [city, setCity] = useState(isDemoMode ? 'São Paulo' : '');
  const [state, setState] = useState(isDemoMode ? 'SP' : '');

  useEffect(() => {
    let active = true;
    const reloadProfile = async () => {
      try {
        const result = await api('/client-state');
        const profile = result?.clients?.[0];
        if (!active || !profile) return;
        setName(profile.name || '');
        setTradeName(profile.tradeName || '');
        setContactName(profile.contact || '');
        setEmail(profile.email || '');
        setPhone(profile.phone || '');
        setWhatsapp(profile.whatsapp || profile.phone || '');
        setCep(profile.cep || '');
        setStreet(profile.street || '');
        setNumber(profile.number || '');
        setExtra(profile.extra || '');
        setDistrict(profile.district || '');
        setCity(profile.city || '');
        setState(profile.state || '');
        const pendingDeletion = Array.isArray(result.accountDeletionRequests)
          ? result.accountDeletionRequests.find((item: any) => item.status === 'pending')
          : null;
        setDeletionRequest(pendingDeletion || null);
      } catch {
        // Keep the last confirmed profile visible while the API reconnects.
      }
    };
    void reloadProfile();
    window.addEventListener('gsa:reload', reloadProfile);
    return () => {
      active = false;
      window.removeEventListener('gsa:reload', reloadProfile);
    };
  }, []);

  // Security Form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deletionRequest, setDeletionRequest] = useState<any | null>(null);
  const [deletionModalOpen, setDeletionModalOpen] = useState(false);
  const [deletionSuccessOpen, setDeletionSuccessOpen] = useState(false);
  const [deletionReason, setDeletionReason] = useState('');
  const [deletionError, setDeletionError] = useState('');
  const [submittingDeletion, setSubmittingDeletion] = useState(false);

  const handleSavePassword = async () => {
    setPasswordError('');
    if (!currentPassword) {
      setPasswordError('Informe sua senha atual.');
      return;
    }
    if (newPassword.length < 10) {
      setPasswordError('A nova senha deve ter no mínimo 10 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('A confirmação da nova senha não confere.');
      return;
    }

    try {
      await api('/me/password', { currentPassword, newPassword }, 'PATCH');
      setSuccessMsg('Sua senha de acesso foi alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (error: any) {
      setPasswordError(error?.message || 'Não foi possível alterar sua senha agora.');
    }
  };

  const handleRequestAccountDeletion = async () => {
    setDeletionError('');
    const reason = deletionReason.trim();
    if (reason.length < 5) {
      setDeletionError('Informe o motivo da exclusão com pelo menos 5 caracteres.');
      return;
    }
    setSubmittingDeletion(true);
    try {
      const result = await api('/account-deletion-requests', { reason });
      setDeletionRequest(result.request || null);
      setDeletionModalOpen(false);
      setDeletionReason('');
      setDeletionSuccessOpen(true);
      window.dispatchEvent(new Event('gsa:reload'));
    } catch (error: any) {
      setDeletionError(error?.message || 'Não foi possível enviar a solicitação de exclusão.');
    } finally {
      setSubmittingDeletion(false);
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Meus Dados & Segurança</h1>
        <p className="page-subtitle">Revise seus dados cadastrais, informações de contato e senha de acesso.</p>
      </div>

      {successMsg && (
        <div className="responsive-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 18px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: 8,
            color: '#047857',
            marginBottom: 20,
            fontSize: 14,
            fontWeight: 600
          }}
        >
          <CheckCircle2 size={18} />
          {successMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="responsive-row" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <Button
          variant={activeTab === 'info' ? 'primary' : 'secondary'}
          size="sm"
          icon={<Building2 size={16} />}
          onClick={() => setActiveTab('info')}
        >
          Dados Cadastrais
        </Button>
        <Button
          variant={activeTab === 'security' ? 'primary' : 'secondary'}
          size="sm"
          icon={<Shield size={16} />}
          onClick={() => setActiveTab('security')}
        >
          Segurança
        </Button>
      </div>

      {activeTab === 'info' ? (
        <Card style={{ padding: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 20 }}>
            Informações da Empresa / Titular
          </h2>

          <div className="profile-readonly-notice">
            <Lock size={18} />
            <div>
              <strong>Dados protegidos contra alteração</strong>
              <span>Para corrigir ou atualizar qualquer informação cadastral, abra um ticket para a equipe GSA.</span>
            </div>
          </div>

          <fieldset className="profile-readonly-fields" disabled>

          <div className="responsive-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Razão Social / Nome</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Nome Fantasia</label>
              <input
                type="text"
                className="form-input"
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">CNPJ / CPF (Identificador Fiscal)</label>
              <input type="text" className="form-input" value={tax} disabled />
              <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                O CNPJ/CPF é protegido contra alteração direta. Solicite via suporte se necessário.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Responsável pelo Contato</label>
              <input
                type="text"
                className="form-input"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">E-mail Principal</label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Telefone / WhatsApp</label>
              <input
                type="text"
                className="form-input"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </div>
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '24px 0 16px', borderTop: '1px solid #e2e8f0', paddingTop: 20 }}>
            Endereço Comercial
          </h3>

          <div className="responsive-split" style={{ display: 'grid', gridTemplateColumns: '140px 1fr 120px', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">CEP</label>
              <input
                type="text"
                className="form-input"
                value={cep}
                onChange={(e) => setCep(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Logradouro / Rua</label>
              <input
                type="text"
                className="form-input"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Número</label>
              <input
                type="text"
                className="form-input"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="responsive-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 16, marginTop: 8 }}>
            <div className="form-group">
              <label className="form-label">Complemento</label>
              <input
                type="text"
                className="form-input"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Cidade</label>
              <input
                type="text"
                className="form-input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">UF</label>
              <input
                type="text"
                className="form-input"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </div>
          </div>

          </fieldset>

          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
            <Button variant="upload" size="md" icon={<MessageCircle size={16} />} onClick={() => onNavigate?.('support')}>
              Solicitar Alteração Via Ticket
            </Button>
          </div>
        </Card>
      ) : (
        /* Tab: Segurança */
        <>
        <Card className="account-deletion-card" style={{ padding: 28, marginTop: 16 }}>
          <div className="account-deletion-panel">
            <div className="account-deletion-copy">
              <div className="account-deletion-heading">
                <Trash2 size={17} />
                <strong>Excluir minha conta</strong>
              </div>
              <p>
                Solicite a exclusão da sua conta. O pedido será analisado pela equipe GSA e os dados permanecerão protegidos durante a análise.
              </p>
            </div>
            {deletionRequest?.status === 'pending' ? (
              <div className="account-deletion-pending">
                <Clock size={16} />
                <span>Solicitação em análise. A conta será excluída em até 5 dias após a aprovação.</span>
              </div>
            ) : (
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 size={15} />}
                onClick={() => { setDeletionError(''); setDeletionModalOpen(true); }}
              >
                Excluir minha conta
              </Button>
            )}
          </div>
        </Card>
        </>
      )}

      <Modal open={deletionModalOpen} onClose={() => { if (!submittingDeletion) setDeletionModalOpen(false); }} title="Solicitar exclusão da conta">
        <div className="account-deletion-modal">
          <p className="account-deletion-modal-help">
            Informe o motivo da exclusão. Após confirmar, sua solicitação entrará em análise pelo sistema.
          </p>
          {deletionError && (
            <div className="account-deletion-error"><AlertCircle size={16} />{deletionError}</div>
          )}
          <div className="form-group">
            <label className="form-label" htmlFor="account-deletion-reason">Motivo da exclusão</label>
            <textarea
              id="account-deletion-reason"
              className="form-input"
              rows={4}
              value={deletionReason}
              onChange={(event) => setDeletionReason(event.target.value)}
              placeholder="Explique por que deseja excluir sua conta..."
              disabled={submittingDeletion}
            />
          </div>
          <div className="account-deletion-modal-actions">
            <Button variant="secondary" disabled={submittingDeletion} onClick={() => setDeletionModalOpen(false)}>Cancelar</Button>
            <Button variant="danger" disabled={submittingDeletion || deletionReason.trim().length < 5} icon={<Trash2 size={15} />} onClick={() => void handleRequestAccountDeletion()}>
              {submittingDeletion ? 'Enviando...' : 'Confirmar solicitação'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={deletionSuccessOpen} onClose={() => setDeletionSuccessOpen(false)} title="Solicitação recebida">
        <div className="account-deletion-success">
          <div className="account-deletion-success-icon"><CheckCircle2 size={24} /></div>
          <p>
            Seu pedido de exclusão da conta entrou em análise pelo sistema. Em até <strong>cinco dias</strong>, a equipe concluirá a análise e a conta será excluída.
          </p>
          <Button variant="primary" style={{ width: '100%' }} onClick={() => setDeletionSuccessOpen(false)}>Entendi</Button>
        </div>
      </Modal>
    </div>
  );
}

export default ClientProfile;
