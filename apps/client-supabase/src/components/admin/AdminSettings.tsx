import React, { useEffect, useState } from 'react';
import { Settings, Building2, Users, DollarSign, Bell, Shield, Save, CheckCircle2, KeyRound, Plus } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { api, isDemoMode } from '../../api';
import { ADMIN_MODULES, ADMIN_ROLE_TEMPLATES, parseAdminPermissions, permissionsForRole } from '../../adminPermissions';

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  adminRole?: string;
  permissions?: string[] | string;
  clientId?: string | null;
  active?: boolean | number;
};

export function AdminSettings() {
  const [activeTab, setActiveTab] = useState<'company' | 'users' | 'finance' | 'notifications'>('company');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Company Form State
  const [companyName, setCompanyName] = useState(isDemoMode ? 'GSA Soluções Administrativas Ltda' : '');
  const [tradeName, setTradeName] = useState(isDemoMode ? 'GSA HUB — Assessoria e Legalização' : '');
  const [tax, setTax] = useState(isDemoMode ? '12.345.678/0001-90' : '');
  const [email, setEmail] = useState(isDemoMode ? 'contato@gsa.local' : '');
  const [phone, setPhone] = useState(isDemoMode ? '(11) 3456-7890' : '');
  const [address, setAddress] = useState(isDemoMode ? 'Av. Paulista, 1000, Bela Vista, São Paulo - SP' : '');

  // Finance Settings
  const [penaltyPercent, setPenaltyPercent] = useState('2.0');
  const [interestPercent, setInterestPercent] = useState('1.0');
  const [gracePeriodDays, setGracePeriodDays] = useState('3');
  const [maxInstallments, setMaxInstallments] = useState('12');
  const [infinitePayEnabled, setInfinitePayEnabled] = useState(false);
  const [infinitePayHandle, setInfinitePayHandle] = useState('gsahub_solucoesdigital');
  const [infinitePayRedirect, setInfinitePayRedirect] = useState('');
  const [infinitePayWebhook, setInfinitePayWebhook] = useState('');
  const [infinitePayApiKey, setInfinitePayApiKey] = useState('');
  const [infinitePayConfigured, setInfinitePayConfigured] = useState<boolean | null>(null);

  // Modals
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserPasswordConfirm, setNewUserPasswordConfirm] = useState('');
  const [newUserRole, setNewUserRole] = useState('Operador / RPS');
  const [newUserPermissions, setNewUserPermissions] = useState<string[]>(permissionsForRole('Operador / RPS'));

  const [resetModalUser, setResetModalUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    api('/infinitepay/status')
      .then((status) => {
        setInfinitePayConfigured(Boolean(status?.configured));
        if (status) {
          setInfinitePayEnabled(Boolean(status.enabled));
          setInfinitePayHandle(status.handle || '');
          setInfinitePayRedirect(status.redirectUrl || '');
          setInfinitePayWebhook(status.webhookUrl || '');
        }
      })
      .catch(() => setInfinitePayConfigured(false));
  }, []);

  useEffect(() => {
    if (isDemoMode) return;
    let cancelled = false;
    Promise.all([api('/state'), api('/admin/users')]).then(([state, remoteUsers]) => {
      if (cancelled) return;
      const c = state?.company || {};
      setCompanyName(c.name || '');
      setTradeName(c.tradeName || '');
      setTax(c.tax || '');
      setEmail(c.email || '');
      setPhone(c.phone || '');
      setAddress(c.address || '');
      setUsers(Array.isArray(remoteUsers) ? remoteUsers : []);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  // Admin Users
  const [users, setUsers] = useState<AdminUser[]>(isDemoMode ? [
    { id: 'u1', name: 'Mariana Souza', email: 'admin@gsa.local', role: 'Administrador Geral', active: true },
    { id: 'u2', name: 'João Carlos da Silva', email: 'joao.silva@gsa.local', role: 'Operador / RPS', active: true },
    { id: 'u3', name: 'Ana Martins', email: 'ana.martins@gsa.local', role: 'Operador / RPS', active: true }
  ] : []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSave = async () => {
    try {
      await api('/company', { name: companyName, tradeName, tax, email, phone, address }, 'PATCH');
      const result = await api('/infinitepay/config', { apiKey: infinitePayApiKey.trim(), handle: infinitePayHandle, enabled: infinitePayEnabled, redirectUrl: infinitePayRedirect, webhookUrl: infinitePayWebhook }, 'POST');
      setInfinitePayConfigured(Boolean(result.configured));
      setInfinitePayApiKey('');
      setSavedSuccess(true);
      showToast('Configurações atualizadas com sucesso e persistidas no servidor!');
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível salvar as configurações.');
    }
  };

  const resetInviteForm = () => {
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserPasswordConfirm('');
    setNewUserRole('Operador / RPS');
    setNewUserPermissions(permissionsForRole('Operador / RPS'));
  };

  const handleInviteRoleChange = (role: string) => {
    setNewUserRole(role);
    if (role !== 'Personalizado') setNewUserPermissions(permissionsForRole(role));
  };

  const handleInviteUser = async () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPermissions.length || newUserPassword.length < 10 || newUserPassword !== newUserPasswordConfirm) {
      showToast('Informe os dados, uma senha de no mínimo 10 caracteres e confirme a senha.');
      return;
    }
    try {
      let created: any = { id: `u-${Date.now()}`, name: newUserName, email: newUserEmail, role: 'admin', adminRole: newUserRole, permissions: newUserPermissions, active: true };
      if (!isDemoMode) {
        created = await api('/admin/users', { name: newUserName.trim(), email: newUserEmail.trim(), password: newUserPassword, adminRole: newUserRole, permissions: newUserPermissions });
      }
      setUsers((current) => [...current, created]);
      resetInviteForm();
      setIsInviteModalOpen(false);
      showToast(`Usuário ${created.email} criado com as permissões selecionadas.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível criar o usuário.');
    }
  };

  const handleConfirmResetPassword = async () => {
    if (!resetModalUser) return;
    if (!isDemoMode) await api(`/admin/users/${resetModalUser.id}/password`, { password: newPassword }, 'PATCH');
    showToast(`Nova senha provisória gerada e enviada para ${resetModalUser.email}!`);
    setResetModalUser(null);
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#10b981',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            fontWeight: 600,
            fontSize: 14
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Configurações do Sistema</h1>
          <p className="page-subtitle">Parâmetros institucionais, regras financeiras, usuários e notificações.</p>
        </div>
        <Button variant="primary" size="md" icon={<Save size={16} />} onClick={handleSave}>
          Salvar Alterações
        </Button>
      </div>

      {savedSuccess && (
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
          Configurações atualizadas com sucesso e persistidas no servidor!
        </div>
      )}

      {/* Settings Navigation Tabs */}
      <div className="responsive-row" style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        <Button
          variant={activeTab === 'company' ? 'primary' : 'secondary'}
          size="sm"
          icon={<Building2 size={16} />}
          onClick={() => setActiveTab('company')}
        >
          Dados da Empresa
        </Button>
        <Button
          variant={activeTab === 'users' ? 'primary' : 'secondary'}
          size="sm"
          icon={<Users size={16} />}
          onClick={() => setActiveTab('users')}
        >
          Usuários & Permissões
        </Button>
        <Button
          variant={activeTab === 'finance' ? 'primary' : 'secondary'}
          size="sm"
          icon={<DollarSign size={16} />}
          onClick={() => setActiveTab('finance')}
        >
          Regras Financeiras
        </Button>
        <Button
          variant={activeTab === 'notifications' ? 'primary' : 'secondary'}
          size="sm"
          icon={<Bell size={16} />}
          onClick={() => setActiveTab('notifications')}
        >
          WhatsApp & Mensageria
        </Button>
      </div>

      {/* Tab: Dados da Empresa */}
      {activeTab === 'company' && (
        <Card style={{ padding: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 20 }}>
            Identificação Institucional da Empresa
          </h2>
          <div className="responsive-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Razão Social *</label>
              <input
                type="text"
                className="form-input"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
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
              <label className="form-label">CNPJ *</label>
              <input
                type="text"
                className="form-input"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">E-mail Institucional *</label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Telefone Principal *</label>
              <input
                type="text"
                className="form-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Endereço da Sede</label>
              <input
                type="text"
                className="form-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Tab: Usuários do Sistema */}
      {activeTab === 'users' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div className="responsive-row" style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
              Equipe Administrativa & Operacional
            </h2>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => { resetInviteForm(); setIsInviteModalOpen(true); }}
            >
              Convidar Usuário
            </Button>
          </div>
          <div className="table-responsive admin-mobile-card-table" role="region" aria-label="Lista de usuários" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>
                <th style={{ padding: '14px 24px', fontWeight: 700 }}>Nome Completo</th>
                <th style={{ padding: '14px 24px', fontWeight: 700 }}>E-mail de Acesso</th>
                <th style={{ padding: '14px 24px', fontWeight: 700 }}>Nível de Acesso</th>
                <th style={{ padding: '14px 24px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '14px 24px', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td data-label="Nome" style={{ padding: '16px 24px', fontWeight: 700, color: '#0f172a' }}>
                    {u.name}
                  </td>
                  <td data-label="E-mail" style={{ padding: '16px 24px', color: '#334155' }}>
                    {u.email}
                  </td>
                  <td data-label="Nível de Acesso" style={{ padding: '16px 24px' }}>
                    <span className="pill pill--blue" style={{ fontSize: 11 }}>
                      {u.adminRole || (u.role === 'admin' ? 'Administrador Geral' : 'Cliente')}
                    </span>
                    {u.role === 'admin' && (
                      <span style={{ display: 'block', marginTop: 5, color: '#64748b', fontSize: 11 }}>
                        {parseAdminPermissions(u.permissions).includes('*')
                          ? 'Todos os módulos'
                          : `${parseAdminPermissions(u.permissions).length} módulo(s) liberado(s)`}
                      </span>
                    )}
                  </td>
                  <td data-label="Status" style={{ padding: '16px 24px' }}>
                    <Badge status="Ativo" variant="green" />
                  </td>
                  <td data-label="Ações" style={{ padding: '16px 24px', textAlign: 'right' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<KeyRound size={14} />}
                      onClick={() => setResetModalUser(u)}
                    >
                      Redefinir Senha
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      )}

      {/* Tab: Regras Financeiras */}
      {activeTab === 'finance' && (
        <Card style={{ padding: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 20 }}>
            Parâmetros de Cobrança, Juros e Renegociação
          </h2>
          <div className="grid-3-cols">
            <div className="form-group">
              <label className="form-label">Multa por Atraso (%)</label>
              <input
                type="text"
                className="form-input"
                value={penaltyPercent}
                onChange={(e) => setPenaltyPercent(e.target.value)}
              />
              <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                Padrão legal máximo permitido: 2.0%
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Juros Moratórios Mensais (%)</label>
              <input
                type="text"
                className="form-input"
                value={interestPercent}
                onChange={(e) => setInterestPercent(e.target.value)}
              />
              <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                Taxa de 1.0% ao mês pro rata die.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Tolerância para Renegociação (dias)</label>
              <input
                type="text"
                className="form-input"
                value={gracePeriodDays}
                onChange={(e) => setGracePeriodDays(e.target.value)}
              />
              <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                Após o prazo, a fatura requer termo de renegociação.
              </span>
            </div>
          </div>
          <div className="form-group" style={{ maxWidth: 420, marginTop: 22 }}><label className="form-label">Máximo de parcelas mensais</label><input type="number" min="1" max="60" className="form-input" value={maxInstallments} onChange={e => setMaxInstallments(e.target.value)} /><span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>Define o limite disponível ao emitir novas faturas.</span></div>
          <div style={{ marginTop: 26, paddingTop: 22, borderTop: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: 15, margin: '0 0 6px', color: '#0f172a' }}>InfinitePay — Checkout de Pagamentos</h3>
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#64748b' }}>Configure os dados para gerar links de pagamento e receber confirmações via webhook. A chave secreta fica protegida no servidor e nunca é exibida no navegador.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 12, color: infinitePayConfigured ? '#166534' : '#92400e' }}>
              <span className={`pill ${infinitePayConfigured ? 'pill--green' : 'pill--yellow'}`} style={{ fontSize: 11 }}>
                {infinitePayConfigured === null ? 'Verificando chave…' : infinitePayConfigured ? 'Chave API configurada' : 'Chave API não configurada'}
              </span>
              {infinitePayConfigured && <span>{infinitePayEnabled ? 'Integração habilitada.' : 'Ative a integração para gerar pagamentos.'}</span>}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13, fontWeight: 700 }}><input type="checkbox" checked={infinitePayEnabled} onChange={e => setInfinitePayEnabled(e.target.checked)} /> Ativar integração InfinitePay</label>
            <div className="form-group" style={{ maxWidth: 520, marginBottom: 16 }}>
              <label className="form-label">Chave API da InfinitePay</label>
              <input
                type="password"
                className="form-input"
                value={infinitePayApiKey}
                onChange={(e) => setInfinitePayApiKey(e.target.value)}
                placeholder={infinitePayConfigured ? 'Chave configurada — deixe vazio para manter' : 'Cole a chave inchk_...'}
                autoComplete="new-password"
              />
              <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>A chave é enviada diretamente ao servidor e não fica salva no navegador.</span>
            </div>
            <div className="grid-3-cols">
              <div className="form-group"><label className="form-label">InfiniteTag (Handle)</label><input className="form-input" value={infinitePayHandle} onChange={e => setInfinitePayHandle(e.target.value.replace(/^\$/, ''))} placeholder="sua-infinite-tag" /><span style={{ fontSize: 11, color: '#64748b' }}>Informe sem o símbolo $.</span></div>
              <div className="form-group"><label className="form-label">URL de redirecionamento</label><input className="form-input" value={infinitePayRedirect} onChange={e => setInfinitePayRedirect(e.target.value)} placeholder="https://seusite.com/pagamento-concluido" /></div>
              <div className="form-group"><label className="form-label">URL do webhook</label><input className="form-input" value={infinitePayWebhook} onChange={e => setInfinitePayWebhook(e.target.value)} placeholder="https://seusite.com/webhook-infinitepay" /></div>
            </div>
          </div>
        </Card>
      )}

      {/* Tab: Notificações & WhatsApp */}
      {activeTab === 'notifications' && (
        <Card style={{ padding: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>
            Integração e Régua de Cobrança / Notificações
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="responsive-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>Serviço de WhatsApp Oficial</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Envios manuais mediante confirmação e lembretes automáticos de vencimento.
                </div>
              </div>
              <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="pill pill--green" style={{ fontSize: 11 }}>API Conectada</span>
              </div>
            </div>

            <div className="responsive-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>Notificações Internas em Tempo Real (SSE)</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Sincronização imediata entre painel administrativo e portal do cliente sem necessidade de recarregar a página.
                </div>
              </div>
              <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="pill pill--blue" style={{ fontSize: 11 }}>Ativo</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Modal: Convidar Usuário */}
      <Modal open={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} title="Convidar Novo Usuário da Equipe">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px 0' }}>
            Preencha os dados abaixo para convidar um novo membro para a equipe.
          </p>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nome Completo *</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: Lucas Ferreira dos Santos"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">E-mail Profissional *</label>
            <input
              type="email"
              className="form-input"
              placeholder="lucas.santos@gsa.local"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
            />
          </div>

          <div className="responsive-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Senha inicial *</label>
              <input
                type="password"
                className="form-input"
                placeholder="Mínimo de 10 caracteres"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Confirmar senha *</label>
              <input
                type="password"
                className="form-input"
                placeholder="Repita a senha"
                value={newUserPasswordConfirm}
                onChange={(e) => setNewUserPasswordConfirm(e.target.value)}
                autoComplete="new-password"
                style={{ borderColor: newUserPasswordConfirm && newUserPassword !== newUserPasswordConfirm ? '#ef4444' : undefined }}
              />
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Função / Nível de Acesso *</label>
            <select
              className="form-select"
              value={newUserRole}
              onChange={(e) => handleInviteRoleChange(e.target.value)}
            >
              {Object.keys(ADMIN_ROLE_TEMPLATES).map((role) => (
                <option key={role} value={role}>
                  {role}{role === 'Administrador Geral' ? ' (acesso total)' : role === 'Personalizado' ? ' (escolha os módulos)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0 }}>Módulos permitidos *</label>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {newUserPermissions.includes('*') ? 'Acesso total' : `${newUserPermissions.length} selecionado(s)`}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, padding: 12, border: '1px solid #dbe3ee', borderRadius: 10, background: '#f8fafc' }}>
              {ADMIN_MODULES.map((module) => {
                const checked = newUserPermissions.includes('*') || newUserPermissions.includes(module.id);
                const locked = newUserRole !== 'Personalizado';
                return (
                  <label key={module.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, padding: '5px 6px', borderRadius: 7, background: checked ? '#eff6ff' : 'transparent', color: '#334155', fontSize: 12, cursor: locked ? 'default' : 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked || module.id === 'dashboard'}
                      onChange={(event) => setNewUserPermissions((current) => event.target.checked
                        ? [...new Set([...current.filter((item) => item !== '*'), module.id])]
                        : current.filter((item) => item !== module.id))}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{module.label}</span>
                  </label>
                );
              })}
            </div>
            <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: '#64748b' }}>
              A função preenche os módulos automaticamente. Escolha “Personalizado” para ajustar módulo por módulo.
            </span>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <Button variant="secondary" onClick={() => setIsInviteModalOpen(false)} style={{ width: '100%' }}>
                Cancelar
              </Button>
            </div>
            <div style={{ flex: 2 }}>
              <Button variant="primary" onClick={handleInviteUser} style={{ width: '100%' }}>
                Criar Usuário
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal: Redefinir Senha */}
      {resetModalUser && (
        <Modal open={!!resetModalUser} onClose={() => { setResetModalUser(null); setNewPassword(''); setConfirmPassword(''); }} title="Alterar Senha do Usuário">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px 0' }}>
              Defina uma nova senha de acesso para o usuário <strong>{resetModalUser.name}</strong>.
            </p>
            
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nova Senha</label>
              <input 
                type="password" 
                className="form-input" 
                placeholder="Digite a nova senha" 
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Confirmar Senha</label>
              <input 
                type="password" 
                className="form-input" 
                placeholder="Digite a senha novamente"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                style={{
                  borderColor: confirmPassword && newPassword !== confirmPassword ? '#ef4444' : undefined
                }}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <span style={{ fontSize: 12, color: '#ef4444', marginTop: 4, display: 'block' }}>As senhas não coincidem.</span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <Button variant="secondary" onClick={() => { setResetModalUser(null); setNewPassword(''); setConfirmPassword(''); }} style={{ width: '100%' }}>
                  Cancelar
                </Button>
              </div>
              <div style={{ flex: 2 }}>
                <Button 
                  variant="primary" 
                  onClick={() => { handleConfirmResetPassword(); setNewPassword(''); setConfirmPassword(''); }} 
                  style={{ width: '100%' }}
                  disabled={!newPassword || newPassword !== confirmPassword}
                >
                  Atualizar Senha
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default AdminSettings;
