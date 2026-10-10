import React, { useEffect, useState } from 'react';
import { Search, Plus, Filter, MoreVertical, Building2, User, ChevronRight, CheckCircle2, Mail, Phone, MapPin, Fingerprint } from 'lucide-react';
import { Client } from '../../types';
import { api, isDemoMode } from '../../api';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import Modal from '../ui/Modal';

import Client360 from './Client360';

const digitsOnly = (value: string) => value.replace(/\D/g, '');
const maskCpfCnpj = (value: string, type: 'PJ' | 'PF') => {
  const digits = digitsOnly(value).slice(0, type === 'PJ' ? 14 : 11);
  if (type === 'PF') return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return digits.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};
const maskPhone = (value: string) => {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length <= 10) return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
};
const maskCep = (value: string) => {
  const digits = digitsOnly(value).slice(0, 8);
  return digits.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
};

export interface AdminClientsProps {
  onSelectClient?: (client: Client) => void;
  onNewClient?: () => void;
  onNavigateToOrder?: (orderCode: string) => void;
  routeDetail?: string | null;
  onOpenClient?: (code: string) => void;
  onCloseClient?: () => void;
}

export function AdminClients({ onSelectClient, onNewClient, onNavigateToOrder, routeDetail, onOpenClient, onCloseClient }: AdminClientsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'PJ' | 'PF'>('all');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // New Client Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const [newType, setNewType] = useState<'PJ' | 'PF'>('PJ');
  const [newName, setNewName] = useState('');
  const [newTradeName, setNewTradeName] = useState('');
  const [newTax, setNewTax] = useState('');
  const [newContact, setNewContact] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCep, setNewCep] = useState('');
  const [newStreet, setNewStreet] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newDistrict, setNewDistrict] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('');
  const [cnpjLookupState, setCnpjLookupState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [cnpjLookupMessage, setCnpjLookupMessage] = useState('');
  const [cepLookupState, setCepLookupState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [cepLookupMessage, setCepLookupMessage] = useState('');

  const [clients, setClients] = useState<Client[]>(isDemoMode ? [
    {
      id: 108,
      code: 'CL108',
      type: 'PJ',
      name: 'Empresa Alfa Ltda',
      tradeName: 'Alfa Serviços',
      tax: '12.345.678/0001-90',
      contact: 'Roberto Alfa',
      email: 'alfa@gsa.local',
      phone: '(11) 97777-8888',
      city: 'São Paulo',
      state: 'SP',
      active: true
    },
    {
      id: 102,
      code: 'CL102',
      type: 'PJ',
      name: 'Empresa Alfa Ltda',
      tradeName: 'Alfa Matriz',
      tax: '12.345.678/0001-90',
      contact: 'Marina Almeida',
      email: 'pj@gsa.local',
      phone: '(11) 99999-1111',
      city: 'São Paulo',
      state: 'SP',
      active: true
    },
    {
      id: 110,
      code: 'CL103',
      type: 'PF',
      name: 'Mariana Costa',
      tax: '529.982.247-25',
      email: 'pf@gsa.local',
      phone: '(11) 98888-2222',
      city: 'São Paulo',
      state: 'SP',
      active: true
    }
  ] : []);
  useEffect(() => {
    let active = true;
    const reloadClients = async () => {
      try {
        const state = await api('/state');
        if (active && Array.isArray(state.clients)) {
          setClients(state.clients as Client[]);
        }
      } catch {
        // Keep the seeded list available if the API is temporarily unavailable.
      }
    };
    reloadClients();
    const onReload = () => { void reloadClients(); };
    window.addEventListener('gsa:reload', onReload);
    return () => {
      active = false;
      window.removeEventListener('gsa:reload', onReload);
    };
  }, []);

  useEffect(() => {
    setSelectedClient(routeDetail ? clients.find((client) => client.code === routeDetail) || null : null);
    if (routeDetail === 'novo') setIsNewModalOpen(true);
  }, [routeDetail, clients]);

  useEffect(() => {
    const normalizedCnpj = digitsOnly(newTax);
    if (newType !== 'PJ' || normalizedCnpj.length !== 14) {
      setCnpjLookupState('idle');
      setCnpjLookupMessage('');
      return undefined;
    }

    let cancelled = false;
    setCnpjLookupState('loading');
    setCnpjLookupMessage('Consultando CNPJ...');
    api(`/cnpj/${normalizedCnpj}`)
      .then((company) => {
        if (cancelled) return;
        setNewName(company?.name || '');
        setNewTradeName(company?.tradeName || company?.name || '');
        setNewEmail(company?.email || '');
        setNewPhone(maskPhone(company?.phone || ''));
        setNewCep(maskCep(company?.cep || ''));
        setNewStreet(company?.street || '');
        setNewNumber(company?.number || '');
        setNewDistrict(company?.district || '');
        setNewCity(typeof company?.city === 'string' ? company.city : company?.city?.Nome || company?.city?.name || '');
        setNewState(String(company?.state || '').slice(0, 2).toUpperCase());
        setCnpjLookupState('success');
        setCnpjLookupMessage('');
      })
      .catch((error: any) => {
        if (cancelled) return;
        setCnpjLookupState('error');
        setCnpjLookupMessage(error?.message || 'Não foi possível consultar o CNPJ agora.');
      });

    return () => { cancelled = true; };
  }, [newTax, newType]);

  useEffect(() => {
    const normalizedCep = digitsOnly(newCep);
    if (normalizedCep.length !== 8) {
      setCepLookupState('idle');
      setCepLookupMessage('');
      return undefined;
    }

    let cancelled = false;
    setCepLookupState('loading');
    setCepLookupMessage('Consultando endereço...');

    api(`/cep/${normalizedCep}`)
      .then((address) => {
        if (cancelled) return;
        if (address?.erro) {
          setCepLookupState('error');
          setCepLookupMessage('CEP não encontrado.');
          return;
        }
        setNewStreet(address?.logradouro || '');
        setNewDistrict(address?.bairro || '');
        setNewCity(address?.localidade || '');
        setNewState(address?.uf || '');
        setCepLookupState('success');
        setCepLookupMessage('');
      })
      .catch(() => {
        if (cancelled) return;
        setCepLookupState('error');
        setCepLookupMessage('Não foi possível consultar o CEP agora.');
      });

    return () => { cancelled = true; };
  }, [newCep]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const showCreateError = (msg: string) => {
    setCreateError(msg);
  };

  const handleCreateClient = async () => {
    if (!newName.trim() || !newTax.trim() || !newEmail.trim() || !newPhone.trim()) {
      showCreateError('Preencha nome, documento, e-mail e telefone para cadastrar o cliente.');
      return;
    }
    const newCode = `CL${100 + clients.length + 10}`;
    const created: Client = {
      id: 100 + clients.length + 10,
      code: newCode,
      type: newType,
      name: newName,
      tradeName: newTradeName || undefined,
      tax: newTax,
      contact: newContact || undefined,
      email: newEmail || `${newCode.toLowerCase()}@gsa.local`,
      phone: newPhone || '(11) 98765-4321',
      cep: newCep || undefined,
      street: newStreet || undefined,
      number: newNumber || undefined,
      district: newDistrict || undefined,
      city: newCity || undefined,
      state: newState || undefined,
      active: true
    };

    let persisted = created;
    try {
      const result = await api('/clients', {
        ...created,
        code: undefined,
        email: created.email || `${newCode.toLowerCase()}@gsa.local`,
      });
      const state = await api('/state');
      const remote = Array.isArray(state.clients)
        ? (state.clients as Client[]).find((client) => String(client.id) === String(result.id))
        : undefined;
      if (remote) {
        persisted = remote;
        setClients(state.clients as Client[]);
      } else {
        setClients([created, ...clients]);
      }
    } catch (error: any) {
      showCreateError(error?.message || 'Não foi possível cadastrar o cliente no servidor.');
      return;
    }
    setIsNewModalOpen(false);
    setSelectedClient(persisted); // Open newly created client's 360 hub
    onOpenClient?.(persisted.code);
    showToast(`Cliente ${persisted.code} cadastrado com sucesso! Abrindo visão 360°...`);

    // Reset fields
    setNewName('');
    setNewTradeName('');
    setNewTax('');
    setNewContact('');
    setNewEmail('');
    setNewPhone('');
    setNewCep('');
    setNewStreet('');
    setNewNumber('');
    setNewDistrict('');
    setNewCity('');
    setNewState('');
    setCnpjLookupState('idle');
    setCnpjLookupMessage('');
    setCepLookupState('idle');
    setCepLookupMessage('');
  };

  if (selectedClient) {
    return (
      <Client360
        client={selectedClient}
        onBack={() => { setSelectedClient(null); onCloseClient?.(); }}
        onNavigateToOrder={onNavigateToOrder}
      />
    );
  }

  const filtered = clients.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.tax.includes(searchTerm);
    const matchesType = filterType === 'all' || c.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
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
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">Gestão da base de clientes, relacionamento e visão 360°.</p>
        </div>
        <Button
          variant="primary"
          size="md"
          icon={<Plus size={16} />}
          onClick={() => {
            setIsNewModalOpen(true);
            onNewClient?.();
          }}
        >
          Novo Cliente
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="responsive-row admin-clients-filters" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="topbar-search-wrap" style={{ maxWidth: 360 }}>
          <input
            type="text"
            className="topbar-search-input"
            placeholder="Buscar por nome, código ou documento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search size={16} className="topbar-search-icon" />
        </div>

        <div className="responsive-row admin-clients-types" style={{ display: 'flex', gap: 6 }}>
          <Button
            variant={filterType === 'all' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFilterType('all')}
          >
            Todos
          </Button>
          <Button
            variant={filterType === 'PJ' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFilterType('PJ')}
          >
            Pessoa Jurídica
          </Button>
          <Button
            variant={filterType === 'PF' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFilterType('PF')}
          >
            Pessoa Física
          </Button>
        </div>
      </div>

      {/* Clients Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive admin-mobile-card-table" role="region" aria-label="Lista de clientes" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>
              <th style={{ padding: '14px 20px', fontWeight: 700 }}>Identificação</th>
              <th style={{ padding: '14px 20px', fontWeight: 700 }}>Documento</th>
              <th style={{ padding: '14px 20px', fontWeight: 700 }}>Contato</th>
              <th style={{ padding: '14px 20px', fontWeight: 700 }}>Localização</th>
              <th style={{ padding: '14px 20px', fontWeight: 700 }}>Status</th>
              <th style={{ padding: '14px 20px', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.id}
                className="admin-client-card"
                onClick={() => {
                  setSelectedClient(c);
                  onOpenClient?.(c.code);
                  onSelectClient?.(c);
                }}
                style={{
                  borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer',
                  transition: 'background 150ms ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <td data-label="Identificação" style={{ padding: '16px 20px' }}>
                  <div className="responsive-row admin-client-identity" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      className="admin-client-avatar"
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: '#eff6ff',
                        color: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700
                      }}
                    >
                      {c.type === 'PJ' ? <Building2 size={18} /> : <User size={18} />}
                    </div>
                    <div className="admin-client-name">
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{c.code} {c.tradeName && `• ${c.tradeName}`}</div>
                    </div>
                  </div>
                </td>
                <td data-label="Documento" style={{ padding: '16px 20px', color: '#334155', fontWeight: 500 }}>
                  <span className="admin-client-data"><Fingerprint className="admin-client-data-icon" size={17} />{c.tax}</span>
                </td>
                <td data-label="Contato" style={{ padding: '16px 20px' }}>
                  <div className="admin-client-data" style={{ color: '#0f172a', fontWeight: 600 }}><Mail className="admin-client-data-icon" size={16} /><span>{c.email}</span></div>
                  <div className="admin-client-data" style={{ fontSize: 12, color: '#64748b' }}><Phone className="admin-client-data-icon" size={15} /><span>{c.phone}</span></div>
                </td>
                <td data-label="Localização" style={{ padding: '16px 20px', color: '#64748b' }}>
                  <span className="admin-client-data"><MapPin className="admin-client-data-icon" size={16} /><span>{c.city}/{c.state}</span></span>
                </td>
                <td data-label="Status" style={{ padding: '16px 20px' }}>
                  <Badge status={c.active ? 'Ativo' : 'Inativo'} variant={c.active ? 'green' : 'gray'} />
                </td>
                <td data-label="Ações" style={{ padding: '16px 20px', textAlign: 'right' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<ChevronRight size={16} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedClient(c);
                      onOpenClient?.(c.code);
                      onSelectClient?.(c);
                    }}
                  >
                    Abrir 360°
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>

      {/* ========================================================================= */}
      {/* MODAL: NOVO CLIENTE */}
      {/* ========================================================================= */}
      <Modal open={isNewModalOpen} onClose={() => setIsNewModalOpen(false)} title="Cadastrar Novo Cliente" className="modal-dialog--client-form">
        <div className="client-form" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div className="client-form-divider" style={{ borderTop: '1px solid #f1f5f9', margin: '2px 0 4px' }}></div>
          <h3 className="client-form-section-title" style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 5px' }}>Tipo de Cliente</h3>
          
          <div className="form-group" style={{ margin: 0 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setNewType('PJ')} style={{ flex:1, padding:'8px', borderRadius:8, border:'2px solid', borderColor: newType==='PJ' ? '#2563eb' : '#e2e8f0', background: newType==='PJ' ? '#eff6ff' : '#fff', color: newType==='PJ' ? '#1d4ed8' : '#64748b', fontWeight:700, cursor:'pointer' }}>Pessoa Jurídica</button>
              <button type="button" onClick={() => setNewType('PF')} style={{ flex:1, padding:'8px', borderRadius:8, border:'2px solid', borderColor: newType==='PF' ? '#2563eb' : '#e2e8f0', background: newType==='PF' ? '#eff6ff' : '#fff', color: newType==='PF' ? '#1d4ed8' : '#64748b', fontWeight:700, cursor:'pointer' }}>Pessoa Física</button>
            </div>
          </div>

          <div className="client-form-divider" style={{ borderTop: '1px solid #f1f5f9', margin: '2px 0 4px' }}></div>
          <h3 className="client-form-section-title" style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 5px' }}>Dados Principais</h3>

          {newType === 'PJ' ? (
            <>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">CNPJ *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="organization"
                  className="form-input"
                  placeholder="00.000.000/0001-00"
                  value={newTax}
                  onChange={(e) => setNewTax(maskCpfCnpj(e.target.value, 'PJ'))}
                />
                {cnpjLookupMessage && (
                  <small
                    className={`client-form-cep-status client-form-cep-status--${cnpjLookupState}`}
                    role={cnpjLookupState === 'error' ? 'alert' : undefined}
                  >
                    {cnpjLookupMessage}
                  </small>
                )}
              </div>
              <div className="responsive-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Razão Social *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Preenchida automaticamente pelo CNPJ"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Nome Fantasia</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Preenchido automaticamente pelo CNPJ"
                    value={newTradeName}
                    onChange={(e) => setNewTradeName(e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="responsive-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Nome Completo *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: Carlos Alberto da Silva"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">CPF *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="form-input"
                  placeholder="000.000.000-00"
                  value={newTax}
                  onChange={(e) => setNewTax(maskCpfCnpj(e.target.value, 'PF'))}
                />
              </div>
            </div>
          )}

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Pessoa de Contato</label>
            <input
              type="text"
              className="form-input"
              placeholder="Ex: Amanda Lima"
              value={newContact}
              onChange={(e) => setNewContact(e.target.value)}
            />
          </div>

          <div className="client-form-divider" style={{ borderTop: '1px solid #f1f5f9', margin: '2px 0 4px' }}></div>
          <h3 className="client-form-section-title" style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 5px' }}>Contato e Endereço</h3>

          <div className="responsive-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">E-mail Principal *</label>
              <input
                type="email"
                className="form-input"
                placeholder="contato@cliente.com.br"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Telefone / WhatsApp *</label>
              <input
                type="text"
                className="form-input"
                placeholder="(11) 98765-4321"
                value={newPhone}
                onChange={(e) => setNewPhone(maskPhone(e.target.value))}
              />
            </div>
          </div>

          <div className="responsive-fields" style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 9 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">CEP</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                className="form-input"
                placeholder="00000-000"
                value={newCep}
                onChange={(e) => setNewCep(maskCep(e.target.value))}
              />
              {cepLookupMessage && (
                <small
                  className={`client-form-cep-status client-form-cep-status--${cepLookupState}`}
                  role={cepLookupState === 'error' ? 'alert' : undefined}
                >
                  {cepLookupMessage}
                </small>
              )}
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Número</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="address-line2"
                className="form-input"
                placeholder="Ex: 100"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Rua / Logradouro</label>
            <input
              type="text"
              autoComplete="street-address"
              className="form-input"
              placeholder="Preenchido automaticamente pelo CEP"
              value={newStreet}
              onChange={(e) => setNewStreet(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Bairro</label>
            <input
              type="text"
              className="form-input"
              placeholder="Preenchido automaticamente pelo CEP"
              value={newDistrict}
              onChange={(e) => setNewDistrict(e.target.value)}
            />
          </div>

          <div className="responsive-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 9 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Cidade</label>
              <input
                type="text"
                className="form-input"
                autoComplete="address-level2"
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">UF</label>
              <input
                type="text"
                className="form-input"
                autoComplete="address-level1"
                value={newState}
                onChange={(e) => setNewState(e.target.value.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase())}
              />
            </div>
          </div>

          <div className="client-form-actions" style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <div style={{ flex: 1 }}>
              <Button variant="secondary" onClick={() => setIsNewModalOpen(false)} style={{ width: '100%' }}>
                Cancelar
              </Button>
            </div>
            <div style={{ flex: 2 }}>
              <Button variant="primary" onClick={handleCreateClient} style={{ width: '100%' }}>
                Cadastrar Cliente
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(createError)}
        onClose={() => setCreateError(null)}
        title="Não foi possível cadastrar"
        className="client-create-error-modal"
      >
        <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#991b1b',
            borderRadius: 10,
            padding: '14px 16px',
            lineHeight: 1.45,
            fontSize: 14,
            fontWeight: 600
          }}>
            {createError}
          </div>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            Corrija os dados informados e tente novamente.
          </p>
          <Button variant="primary" onClick={() => setCreateError(null)} style={{ width: '100%' }}>
            Entendi
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default AdminClients;
