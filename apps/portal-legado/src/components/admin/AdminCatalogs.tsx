import React, { useEffect, useState } from 'react';
import { Database, Plus, Search, Briefcase, UserCheck, Edit, CheckCircle2, XCircle, Power, Trash2 } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { Service, RPS } from '../../types';
import { api, isDemoMode } from '../../api';

export function AdminCatalogs() {
  const [activeTab, setActiveTab] = useState<'services' | 'rps'>('services');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isRpsModalOpen, setIsRpsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingRps, setEditingRps] = useState<RPS | null>(null);

  // Services Catalog
  const [services, setServices] = useState<Service[]>(isDemoMode ? [
    {
      id: 101,
      code: 'SRV101',
      name: 'Abertura de Empresa',
      description: 'Elaboração de contrato social, registro na JUCESP, CNPJ, Inscrição Municipal e Alvará.',
      price: 250000, // R$ 2.500,00 in cents
      active: true
    },
    {
      id: 102,
      code: 'SRV102',
      name: 'Alteração Contratual',
      description: 'Entrada/saída de sócios, alteração de endereço, razão social ou CNAEs.',
      price: 180000, // R$ 1.800,00 in cents
      active: true
    },
    {
      id: 103,
      code: 'SRV103',
      name: 'Encerramento de Empresa (Distrato)',
      description: 'Baixa completa de CNPJ, certidões negativas e distrato social registrado.',
      price: 220000, // R$ 2.200,00 in cents
      active: true
    },
    {
      id: 104,
      code: 'SRV104',
      name: 'BPO Fiscal & Contábil Mensal',
      description: 'Assessoria contábil mensal, fechamento fiscal do Simples Nacional/Presumido e folha.',
      price: 150000, // R$ 1.500,00 in cents
      active: true
    }
  ] : []);

  // RPS Catalog
  const [rpsList, setRpsList] = useState<RPS[]>(isDemoMode ? [
    {
      id: 100,
      code: 'RPS100',
      name: 'João Carlos da Silva',
      email: 'joao.silva@gsa.local',
      active: true
    },
    {
      id: 101,
      code: 'RPS101',
      name: 'Ana Martins',
      email: 'ana.martins@gsa.local',
      active: true
    },
    {
      id: 102,
      code: 'RPS102',
      name: 'Mariana Souza',
      email: 'mariana.souza@gsa.local',
      active: true
    }
  ] : []);

  // New Service Form
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceDesc, setNewServiceDesc] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('2000,00');

  // New RPS Form
  const [newRpsName, setNewRpsName] = useState('');
  const [newRpsEmail, setNewRpsEmail] = useState('');

  useEffect(() => {
    let active = true;
    const reloadCatalog = async () => {
      try {
        const state = await api('/state');
        if (!active) return;
        if (Array.isArray(state.services)) setServices(state.services as Service[]);
        if (Array.isArray(state.rps)) setRpsList(state.rps as RPS[]);
      } catch {
        // Keep the last confirmed catalog visible if the API is temporarily unavailable.
      }
    };
    void reloadCatalog();
    const onReload = () => { void reloadCatalog(); };
    window.addEventListener('gsa:reload', onReload);
    return () => {
      active = false;
      window.removeEventListener('gsa:reload', onReload);
    };
  }, []);

  const formatMoney = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  const handleCreateService = async () => {
    if (!newServiceName.trim()) return;
    const cleanPrice = parseFloat(newServicePrice.replace(/\./g, '').replace(',', '.')) || 0;
    const newService: Service = {
      id: 100 + services.length + 1,
      code: `SRV${100 + services.length + 1}`,
      name: newServiceName,
      description: newServiceDesc,
      price: Math.round(cleanPrice * 100),
      active: true
    };
    try {
      await api('/services', {
        name: newService.name,
        description: newService.description,
        price: cleanPrice
      });
      const state = await api('/state');
      if (Array.isArray(state.services)) setServices(state.services as Service[]);
    } catch {
      return;
    }
    setNewServiceName('');
    setNewServiceDesc('');
    setIsServiceModalOpen(false);
  };

  const handleUpdateService = async () => {
    if (!editingService || !newServiceName.trim()) return;
    const cleanPrice = parseFloat(newServicePrice.replace(/\./g, '').replace(',', '.')) || 0;
    try {
      await api(`/services/${editingService.id}`, {
        name: newServiceName,
        description: newServiceDesc,
        price: cleanPrice
      }, 'PATCH');
      const state = await api('/state');
      if (Array.isArray(state.services)) setServices(state.services as Service[]);
      setEditingService(null);
    } catch {
      return;
    }
  };

  const handleCreateRps = async () => {
    if (!newRpsName.trim()) return;
    const newRps: RPS = {
      id: 100 + rpsList.length,
      code: `RPS${100 + rpsList.length}`,
      name: newRpsName,
      email: newRpsEmail || `${newRpsName.toLowerCase().replace(/\s+/g, '.')}@gsa.local`,
      active: true
    };
    try {
      await api('/rps', { name: newRps.name, email: newRps.email });
      const state = await api('/state');
      if (Array.isArray(state.rps)) setRpsList(state.rps as RPS[]);
    } catch {
      return;
    }
    setNewRpsName('');
    setNewRpsEmail('');
    setIsRpsModalOpen(false);
  };

  const handleUpdateRps = async () => {
    if (!editingRps || !newRpsName.trim()) return;
    try {
      await api(`/rps/${editingRps.id}`, { name: newRpsName, email: newRpsEmail || editingRps.email }, 'PATCH');
      const state = await api('/state');
      if (Array.isArray(state.rps)) setRpsList(state.rps as RPS[]);
      setEditingRps(null);
    } catch {
      return;
    }
  };

  const toggleServiceStatus = async (id: number) => {
    const current = services.find((service) => String(service.id) === String(id));
    if (!current) return;
    try {
      await api(`/services/${id}`, { active: !current.active }, 'PATCH');
      const state = await api('/state');
      if (Array.isArray(state.services)) setServices(state.services as Service[]);
    } catch {
      return;
    }
  };

  const toggleRpsStatus = async (id: number) => {
    const current = rpsList.find((rps) => String(rps.id) === String(id));
    if (!current) return;
    try {
      await api(`/rps/${id}`, { active: !current.active }, 'PATCH');
      const state = await api('/state');
      if (Array.isArray(state.rps)) setRpsList(state.rps as RPS[]);
    } catch {
      return;
    }
  };

  const deleteService = async (id: number) => {
    if (!window.confirm('Deseja excluir este serviço?')) return;
    try {
      await api(`/services/${id}`, { active: false }, 'PATCH');
      const state = await api('/state');
      if (Array.isArray(state.services)) setServices(state.services as Service[]);
      setEditingService(null);
    } catch {
      return;
    }
  };

  const deleteRps = async (id: number) => {
    if (!window.confirm('Deseja excluir este responsável?')) return;
    try {
      await api(`/rps/${id}`, { active: false }, 'PATCH');
      const state = await api('/state');
      if (Array.isArray(state.rps)) setRpsList(state.rps as RPS[]);
      setEditingRps(null);
    } catch {
      return;
    }
  };

  const openEditService = (srv: Service) => {
    setEditingService(srv);
    setNewServiceName(srv.name);
    setNewServiceDesc(srv.description || '');
    setNewServicePrice((srv.price / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  };

  const openEditRps = (rps: RPS) => {
    setEditingRps(rps);
    setNewRpsName(rps.name);
    setNewRpsEmail(rps.email || '');
  };

  const filteredServices = services.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredRps = rpsList.filter((r) =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">Cadastros Base do Sistema</h1>
          <p className="page-subtitle">Gerencie o catálogo oficial de Serviços (SRV) e Responsáveis (RPS).</p>
        </div>
        <Button
          variant="primary"
          size="md"
          icon={<Plus size={16} />}
          onClick={() => {
            if (activeTab === 'services') {
              setNewServiceName('');
              setNewServiceDesc('');
              setNewServicePrice('2000,00');
              setIsServiceModalOpen(true);
            } else {
              setNewRpsName('');
              setNewRpsEmail('');
              setIsRpsModalOpen(true);
            }
          }}
        >
          {activeTab === 'services' ? 'Novo Serviço (SRV)' : 'Novo Responsável (RPS)'}
        </Button>
      </div>

      {/* Tabs and Search Bar */}
      <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div className="responsive-row" style={{ display: 'flex', gap: 8 }}>
          <Button
            variant={activeTab === 'services' ? 'primary' : 'secondary'}
            size="sm"
            icon={<Briefcase size={16} />}
            onClick={() => setActiveTab('services')}
          >
            Serviços (SRV)
          </Button>
          <Button
            variant={activeTab === 'rps' ? 'primary' : 'secondary'}
            size="sm"
            icon={<UserCheck size={16} />}
            onClick={() => setActiveTab('rps')}
          >
            Responsáveis pelo Serviço (RPS)
          </Button>
        </div>

        <div className="topbar-search-wrap" style={{ maxWidth: 360 }}>
          <input
            type="text"
            className="topbar-search-input"
            placeholder={activeTab === 'services' ? 'Buscar serviço por nome ou código...' : 'Buscar RPS por nome ou código...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search size={16} className="topbar-search-icon" />
        </div>
      </div>

      {/* Services Table */}
      {activeTab === 'services' ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive admin-mobile-card-table" role="region" aria-label="Catálogo de serviços" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>
                <th style={{ padding: '14px 20px', fontWeight: 700 }}>Código</th>
                <th style={{ padding: '14px 20px', fontWeight: 700 }}>Nome do Serviço</th>
                <th style={{ padding: '14px 20px', fontWeight: 700 }}>Descrição Operacional</th>
                <th style={{ padding: '14px 20px', fontWeight: 700 }}>Preço Base</th>
                <th style={{ padding: '14px 20px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredServices.map((srv) => (
                <tr key={srv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td data-label="Código" style={{ padding: '16px 20px' }}>
                    <span className="pill pill--blue" style={{ fontSize: 12, fontWeight: 800 }}>
                      {srv.code}
                    </span>
                  </td>
                  <td data-label="Serviço" style={{ padding: '16px 20px', fontWeight: 700, color: '#0f172a' }}>
                    {srv.name}
                  </td>
                  <td data-label="Descrição" style={{ padding: '16px 20px', color: '#64748b', fontSize: 13, maxWidth: 400 }}>
                    {srv.description}
                  </td>
                  <td data-label="Preço Base" style={{ padding: '16px 20px', fontWeight: 800, color: '#0f172a' }}>
                    {formatMoney(srv.price)}
                  </td>
                  <td data-label="Status" style={{ padding: '16px 20px' }}>
                    <Badge status={srv.active ? 'Ativo' : 'Inativo'} variant={srv.active ? 'green' : 'gray'} />
                  </td>
                  <td data-label="Ações" style={{ padding: '16px 20px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Edit size={14} />}
                        onClick={() => openEditService(srv)}
                      >
                        Editar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      ) : (
        /* RPS Table */
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-responsive admin-mobile-card-table" role="region" aria-label="Lista de responsáveis" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>
                <th style={{ padding: '14px 20px', fontWeight: 700 }}>Código</th>
                <th style={{ padding: '14px 20px', fontWeight: 700 }}>Nome Completo</th>
                <th style={{ padding: '14px 20px', fontWeight: 700 }}>E-mail de Notificações</th>
                <th style={{ padding: '14px 20px', fontWeight: 700 }}>Papel no Sistema</th>
                <th style={{ padding: '14px 20px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredRps.map((rps) => (
                <tr key={rps.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td data-label="Código" style={{ padding: '16px 20px' }}>
                    <span className="pill pill--blue" style={{ fontSize: 12, fontWeight: 800 }}>
                      {rps.code}
                    </span>
                  </td>
                  <td data-label="Responsável" style={{ padding: '16px 20px' }}>
                    <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: '#eff6ff',
                          color: '#2563eb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: 12
                        }}
                      >
                        {rps.name.split(' ').slice(0, 2).map((n) => n[0]).join('')}
                      </div>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{rps.name}</span>
                    </div>
                  </td>
                  <td data-label="E-mail" style={{ padding: '16px 20px', color: '#334155' }}>
                    {rps.email}
                  </td>
                  <td data-label="Papel" style={{ padding: '16px 20px' }}>
                    <span className="pill pill--gray" style={{ fontSize: 11 }}>
                      Responsável Técnico / Comercial
                    </span>
                  </td>
                  <td data-label="Status" style={{ padding: '16px 20px' }}>
                    <Badge status={rps.active ? 'Ativo' : 'Inativo'} variant={rps.active ? 'green' : 'gray'} />
                  </td>
                  <td data-label="Ações" style={{ padding: '16px 20px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Edit size={14} />}
                        onClick={() => openEditRps(rps)}
                      >
                        Editar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      )}

      
      {/* Modal: Novo Serviço */}
      <Modal open={isServiceModalOpen} onClose={() => setIsServiceModalOpen(false)} title="Cadastrar Novo Serviço (SRV)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Código</label>
              <input type="text" className="form-input" readOnly value={`SRV${100 + services.length + 1}`} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Preço Base (R$)</label>
              <input type="text" className="form-input" value={newServicePrice} onChange={(e) => setNewServicePrice(e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nome do Serviço</label>
            <input type="text" className="form-input" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Descrição</label>
            <textarea className="form-input" value={newServiceDesc} onChange={(e) => setNewServiceDesc(e.target.value)} />
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <Button variant="secondary" style={{ width: '100%' }} onClick={() => setIsServiceModalOpen(false)}>Cancelar</Button>
            </div>
            <div style={{ flex: 2 }}>
              <Button variant="primary" style={{ width: '100%' }} onClick={handleCreateService}>Salvar</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal: Editar Serviço */}
      {editingService && (
        <Modal open={true} onClose={() => setEditingService(null)} title={`Editar Serviço: ${editingService.code}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Código</label>
                <input type="text" className="form-input" readOnly value={editingService.code} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Preço Base (R$)</label>
                <input type="text" className="form-input" value={newServicePrice} onChange={(e) => setNewServicePrice(e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nome do Serviço</label>
              <input type="text" className="form-input" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Descrição</label>
              <textarea className="form-input" value={newServiceDesc} onChange={(e) => setNewServiceDesc(e.target.value)} />
            </div>
            <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.4fr', gap: 10 }}>
              <Button style={{ width: '100%', whiteSpace: 'nowrap' }} variant={editingService.active ? 'danger' : 'success'} icon={<Power size={14} />} onClick={() => { toggleServiceStatus(editingService.id); setEditingService(null); }}>{editingService.active ? 'Desativar' : 'Ativar'}</Button>
              <Button style={{ width: '100%', whiteSpace: 'nowrap' }} variant="danger" icon={<Trash2 size={14} />} onClick={() => deleteService(editingService.id)}>Excluir</Button>
              <Button variant="secondary" style={{ width: '100%', whiteSpace: 'nowrap' }} onClick={() => setEditingService(null)}>Cancelar</Button>
              <Button variant="primary" style={{ width: '100%', whiteSpace: 'nowrap' }} onClick={handleUpdateService}>Salvar</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Novo RPS */}
      <Modal open={isRpsModalOpen} onClose={() => setIsRpsModalOpen(false)} title="Cadastrar Responsável (RPS)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nome Completo</label>
            <input type="text" className="form-input" value={newRpsName} onChange={(e) => setNewRpsName(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">E-mail</label>
              <input type="email" className="form-input" value={newRpsEmail} onChange={(e) => setNewRpsEmail(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Telefone</label>
              <input type="text" className="form-input" placeholder="(00) 00000-0000" />
            </div>
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <Button variant="secondary" style={{ width: '100%' }} onClick={() => setIsRpsModalOpen(false)}>Cancelar</Button>
            </div>
            <div style={{ flex: 2 }}>
              <Button variant="primary" style={{ width: '100%' }} onClick={handleCreateRps}>Salvar</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal: Editar RPS */}
      {editingRps && (
        <Modal open={true} onClose={() => setEditingRps(null)} title={`Editar RPS: ${editingRps.code}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nome Completo</label>
              <input type="text" className="form-input" value={newRpsName} onChange={(e) => setNewRpsName(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">E-mail</label>
                <input type="email" className="form-input" value={newRpsEmail} onChange={(e) => setNewRpsEmail(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Telefone</label>
                <input type="text" className="form-input" placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.4fr', gap: 10 }}>
              <Button style={{ width: '100%', whiteSpace: 'nowrap' }} variant={editingRps.active ? 'danger' : 'success'} icon={<Power size={14} />} onClick={() => { toggleRpsStatus(editingRps.id); setEditingRps(null); }}>{editingRps.active ? 'Desativar' : 'Ativar'}</Button>
              <Button style={{ width: '100%', whiteSpace: 'nowrap' }} variant="danger" icon={<Trash2 size={14} />} onClick={() => deleteRps(editingRps.id)}>Excluir</Button>
              <Button variant="secondary" style={{ width: '100%', whiteSpace: 'nowrap' }} onClick={() => setEditingRps(null)}>Cancelar</Button>
              <Button variant="primary" style={{ width: '100%', whiteSpace: 'nowrap' }} onClick={handleUpdateRps}>Salvar</Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}

export default AdminCatalogs;
