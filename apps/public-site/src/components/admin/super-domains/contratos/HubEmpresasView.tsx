import React, { useState, useEffect, useMemo } from 'react';
import { 
  Building2, Building, Plus, Search, Filter, Download, 
  MapPin, Phone, Mail, User, CreditCard, DollarSign, 
  ShieldCheck, CheckCircle2, Clock, AlertTriangle, Layers, 
  GitBranch, Edit3, Trash2, RefreshCw, FileText, Check
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../../lib/supabase';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { formatCurrency, formatDate, maskCNPJ, maskPhone } from '../../../../lib/utils';
import { 
  TacticalDataGrid, GridColumn, 
  CommandSlideOver, StatusBadge, SlideOverTab 
} from '../shared';
import { EmpresaB2BRecord, B2BCondicaoPagamento } from './contratos.types';

export function HubEmpresasView() {
  const [empresas, setEmpresas] = useState<EmpresaB2BRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string | null>(null);
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [activeSlideTab, setActiveSlideTab] = useState<string>('geral');
  const [isNewEmpresaModalOpen, setIsNewEmpresaModalOpen] = useState(false);

  // Form State
  const [formEmpresa, setFormEmpresa] = useState({
    razao_social: '',
    nome_fantasia: '',
    cnpj: '',
    inscricao_estadual: '',
    responsavel_legal: '',
    cargo_responsavel: '',
    email_corporativo: '',
    telefone_corporativo: '',
    cidade: 'São Paulo',
    estado: 'SP',
    endereco_completo: '',
    limite_credito_faturado: '50000',
    condicao_pagamento: 'boleto_30dd' as B2BCondicaoPagamento,
    desconto_corporativo_pct: '10',
    sla_atendimento_horas: '4'
  });

  const fetchEmpresas = async () => {
    setLoading(true);

    try {
      const { data: dbData, error } = await supabase
        .from('clientes')
        .select('*')
        .or('tipo_pessoa.eq.pj,cnpj.not.is.null')
        .order('data_cadastro', { ascending: false });

      if (!error && dbData && dbData.length > 0) {
        const mapped: EmpresaB2BRecord[] = dbData.map((d: any) => ({
          id: d.id,
          codigo_empresa: d.codigo_cliente || `CORP-${String(d.id).slice(0, 6).toUpperCase()}`,
          razao_social: d.nome || 'Empresa PJ',
          nome_fantasia: d.nome_fantasia || d.nome || 'Empresa PJ',
          cnpj: d.cnpj || '',
          inscricao_estadual: d.inscricao_estadual || 'ISENTO',
          responsavel_legal: d.responsavel_legal || '',
          cargo_responsavel: d.cargo_responsavel || 'Representante Legal',
          email_corporativo: d.email || '',
          telefone_corporativo: d.telefone || '',
          cidade: d.cidade || '',
          estado: d.estado || '',
          endereco_completo: d.endereco ? `${d.endereco}, ${d.numero || ''} - ${d.bairro || ''}` : '',
          is_matriz: true,
          filiais: [],
          limite_credito_faturado: Number(d.limite_credito || 0),
          limite_credito_utilizado: 0,
          condicao_pagamento: (d.condicao_pagamento as B2BCondicaoPagamento) || 'boleto_30dd',
          desconto_corporativo_pct: Number(d.desconto_corporativo || 0),
          sla_atendimento_horas: 4,
          contratos_b2b_count: 0,
          faturamento_mensal_medio: 0,
          status: d.status || 'ativo',
          data_cadastro: d.data_cadastro?.slice(0, 10) || new Date().toISOString().slice(0, 10)
        }));
        setEmpresas(mapped);
      } else {
        setEmpresas([]);
      }
    } catch {
      setEmpresas([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmpresas();
  }, []);

  useRealtimeSubscription({ table: 'clientes', onChange: fetchEmpresas });

  const selectedEmpresa = useMemo(() => {
    return empresas.find(e => e.id === selectedEmpresaId) || null;
  }, [empresas, selectedEmpresaId]);

  const telemetry = useMemo(() => {
    const total = empresas.length;
    const totalFiliais = empresas.reduce((acc, cur) => acc + cur.filiais.length, 0);
    const limiteConcedido = empresas.reduce((acc, cur) => acc + cur.limite_credito_faturado, 0);
    const faturamentoTotal = empresas.reduce((acc, cur) => acc + cur.faturamento_mensal_medio, 0);

    return {
      total,
      totalFiliais,
      limiteConcedido,
      faturamentoTotal
    };
  }, [empresas]);

  const handleOpenEmpresa = (emp: EmpresaB2BRecord) => {
    setSelectedEmpresaId(emp.id);
    setIsSlideOverOpen(true);
    setActiveSlideTab('geral');
  };

  const handleCreateEmpresa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmpresa.razao_social.trim() || !formEmpresa.cnpj.trim()) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }

    try {
      const result = await callAdminRpc<{ success?: boolean; cliente_id?: string }>('gsa_admin_criar_cliente', {
        p_payload: {
          nome: formEmpresa.nome_fantasia.trim() || formEmpresa.razao_social.trim(),
          cnpj: formEmpresa.cnpj.trim(),
          tipo_pessoa: 'pj',
          email: formEmpresa.email_corporativo.trim() || null,
          telefone: formEmpresa.telefone_corporativo.trim() || null,
          cidade: formEmpresa.cidade || null,
          estado: formEmpresa.estado || null,
          endereco: formEmpresa.endereco_completo.trim() || null,
          observacoes: [
            formEmpresa.razao_social.trim() ? `Razão social: ${formEmpresa.razao_social.trim()}` : '',
            formEmpresa.responsavel_legal.trim() ? `Responsável legal: ${formEmpresa.responsavel_legal.trim()}` : '',
            formEmpresa.cargo_responsavel.trim() ? `Cargo: ${formEmpresa.cargo_responsavel.trim()}` : '',
          ].filter(Boolean).join(' | ') || null,
        },
      });

      if (!result?.success || !result.cliente_id) {
        throw new Error('O cadastro não retornou uma empresa persistida.');
      }

      await fetchEmpresas();
      setIsNewEmpresaModalOpen(false);
      setSelectedEmpresaId(result.cliente_id);
      setIsSlideOverOpen(true);
      toast.success('Empresa B2B cadastrada e persistida com sucesso.');
    } catch (error: any) {
      console.error('Erro ao cadastrar empresa B2B:', error);
      toast.error(error?.message || 'Não foi possível cadastrar a empresa.');
    }
  };

  const columns: GridColumn<EmpresaB2BRecord>[] = [
    {
      key: 'empresa',
      header: 'Empresa & CNPJ',
      width: '320px',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-200">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-900 truncate text-sm">
              {row.razao_social}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              <span>{maskCNPJ(row.cnpj)}</span>
              <span>•</span>
              <span className="text-blue-600 font-bold">{row.codigo_empresa}</span>
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'contato',
      header: 'Responsável & Cidade',
      width: '240px',
      render: (row) => (
        <div className="text-xs space-y-0.5">
          <div className="font-bold text-slate-800">{row.responsavel_legal}</div>
          <div className="text-slate-500">{row.cidade}/{row.estado} • {maskPhone(row.telefone_corporativo)}</div>
        </div>
      )
    },
    {
      key: 'filiais',
      header: 'Estrutura / Filiais',
      width: '150px',
      render: (row) => (
        <div className="text-xs">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold bg-slate-100 text-slate-700">
            <GitBranch className="h-3.5 w-3.5 text-slate-500" />
            Matriz + {row.filiais.length} Filial(is)
          </span>
        </div>
      )
    },
    {
      key: 'credito',
      header: 'Crédito Faturado B2B',
      width: '180px',
      align: 'right',
      render: (row) => (
        <div className="text-right">
          <div className="font-bold text-slate-900 text-sm">
            {formatCurrency(row.limite_credito_faturado)}
          </div>
          <div className="text-[11px] text-slate-500">
            Utilizado: {formatCurrency(row.limite_credito_utilizado)}
          </div>
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      align: 'center',
      render: (row) => (
        <StatusBadge status={row.status} size="sm" dot />
      )
    },
    {
      key: 'acoes',
      header: 'Ações',
      width: '120px',
      align: 'right',
      render: (row) => (
        <button
          type="button"
          onClick={() => handleOpenEmpresa(row)}
          className="px-3 py-1 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
        >
          Dossiê B2B
        </button>
      )
    }
  ];

  const slideTabs: SlideOverTab[] = [
    { id: 'geral', label: 'Dados Corporativos', icon: Building2 },
    { id: 'filiais', label: 'Matriz & Filiais', icon: GitBranch, badge: selectedEmpresa?.filiais.length },
    { id: 'faturamento', label: 'Crédito & Faturamento', icon: CreditCard },
    { id: 'documentos', label: 'Documentação Jurídica', icon: FileText }
  ];

  return (
    <div className="space-y-6">
      {/* Telemetry KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Contas B2B</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{telemetry.total}</div>
          <div className="mt-1 text-xs text-slate-500">Grupos empresariais ativos</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Filiais Integradas</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <GitBranch className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{telemetry.totalFiliais}</div>
          <div className="mt-1 text-xs text-slate-500">Unidades vinculadas</div>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Limite Concedido</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-950">{formatCurrency(telemetry.limiteConcedido)}</div>
          <div className="mt-1 text-xs text-emerald-700">Crédito para faturamento 30DD</div>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Faturamento B2B</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-blue-950">{formatCurrency(telemetry.faturamentoTotal)}</div>
          <div className="mt-1 text-xs text-blue-700">Volume mensal médio</div>
        </div>
      </div>

      <TacticalDataGrid<EmpresaB2BRecord>
        title="Hub Empresas & Gestão B2B Corporate"
        subtitle="Diretório corporativo para grandes contas, hierarquia de filiais, prazos especiais de faturamento e acordos de nível de serviço."
        data={empresas}
        columns={columns}
        keyExtractor={(row) => row.id}
        isLoading={loading}
        onRowClick={(row) => handleOpenEmpresa(row)}
        searchPlaceholder="Buscar empresa por Razão Social, Nome Fantasia, CNPJ ou Cidade..."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchEmpresas}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </button>
            <button
              type="button"
              onClick={() => setIsNewEmpresaModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
            >
              <Plus className="h-4 w-4" /> Cadastrar Empresa B2B
            </button>
          </div>
        }
      />

      {/* COMMAND SLIDE-OVER */}
      <CommandSlideOver
        isOpen={isSlideOverOpen}
        onClose={() => setIsSlideOverOpen(false)}
        width="xl"
        title={selectedEmpresa ? selectedEmpresa.razao_social : 'Dossiê B2B'}
        subtitle={selectedEmpresa ? `${selectedEmpresa.codigo_empresa} • CNPJ: ${selectedEmpresa.cnpj}` : ''}
        badge={selectedEmpresa ? <StatusBadge status={selectedEmpresa.status} size="sm" dot /> : undefined}
        tabs={slideTabs}
        activeTab={activeSlideTab}
        onTabChange={setActiveSlideTab}
      >
        {selectedEmpresa && (
          <div className="space-y-6">
            {/* TAB 1: GERAL */}
            {activeSlideTab === 'geral' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Informações Cadastrais Oficiais</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="font-bold text-slate-500 block">Razão Social:</span>
                      <span className="font-semibold text-slate-900">{selectedEmpresa.razao_social}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">Nome Fantasia:</span>
                      <span className="font-semibold text-slate-900">{selectedEmpresa.nome_fantasia}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">CNPJ:</span>
                      <span className="font-mono text-slate-900 font-semibold">{maskCNPJ(selectedEmpresa.cnpj)}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">Inscrição Estadual:</span>
                      <span className="font-mono text-slate-900">{selectedEmpresa.inscricao_estadual || 'Isento'}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">Responsável Legal:</span>
                      <span className="font-semibold text-slate-900">{selectedEmpresa.responsavel_legal} ({selectedEmpresa.cargo_responsavel || 'Procurador'})</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">E-mail Corporativo:</span>
                      <span className="text-slate-900">{selectedEmpresa.email_corporativo}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="font-bold text-slate-500 block">Sede / Endereço:</span>
                      <span className="text-slate-900">{selectedEmpresa.endereco_completo}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: FILIAIS */}
            {activeSlideTab === 'filiais' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900">Hierarquia de Filiais & Unidades</h4>
                    <button
                      type="button"
                      disabled
                      title="O cadastro persistente de filiais ainda não está disponível neste módulo."
                      className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-200 text-slate-500 cursor-not-allowed flex items-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" /> Filiais indisponíveis
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-blue-950 text-sm block">Matriz Principal ({selectedEmpresa.cidade}/{selectedEmpresa.estado})</span>
                        <span className="text-slate-600 font-mono text-[11px]">{selectedEmpresa.cnpj} • {selectedEmpresa.endereco_completo}</span>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-600 text-white">Sede Matriz</span>
                    </div>

                    {selectedEmpresa.filiais.map(f => (
                      <div key={f.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-900 text-sm block">{f.nome_unidade}</span>
                          <span className="text-slate-500 font-mono text-[11px]">{f.cnpj} • Resp: {f.responsavel} ({f.telefone})</span>
                        </div>
                        <StatusBadge status={f.status} size="xs" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: FATURAMENTO & CRÉDITO */}
            {activeSlideTab === 'faturamento' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <h4 className="text-sm font-bold text-slate-900">Condições Comerciais & Limite Faturado</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="font-bold text-slate-500 block">Condição de Pagamento:</span>
                      <span className="text-base font-bold text-slate-900 mt-1 block uppercase">
                        {selectedEmpresa.condicao_pagamento.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="font-bold text-slate-500 block">Desconto Corporativo B2B:</span>
                      <span className="text-base font-bold text-emerald-700 mt-1 block">
                        {selectedEmpresa.desconto_corporativo_pct}% de desconto contratual
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="font-bold text-slate-500 block">Limite de Crédito Concedido:</span>
                      <span className="text-base font-bold text-slate-900 mt-1 block">
                        {formatCurrency(selectedEmpresa.limite_credito_faturado)}
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="font-bold text-slate-500 block">SLA de Atendimento Garantido:</span>
                      <span className="text-base font-bold text-indigo-700 mt-1 block">
                        Até {selectedEmpresa.sla_atendimento_horas} horas úteis
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: DOCUMENTOS */}
            {activeSlideTab === 'documentos' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <h4 className="text-sm font-bold text-slate-900">Documentos Societários & Fiscais</h4>
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-blue-600" />
                        <div>
                          <div className="font-bold text-slate-900">Contrato Social Consolidado & Última Alteração</div>
                          <div className="text-slate-500 text-[11px]">contrato_social_registrado.pdf</div>
                        </div>
                      </div>
                      <StatusBadge status="aprovado" size="xs" />
                    </div>

                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-blue-600" />
                        <div>
                          <div className="font-bold text-slate-900">Cartão CNPJ Receita Federal Ativo</div>
                          <div className="text-slate-500 text-[11px]">comprovante_cnpj.pdf</div>
                        </div>
                      </div>
                      <StatusBadge status="aprovado" size="xs" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CommandSlideOver>

      {/* MODAL: NOVA EMPRESA B2B */}
      {isNewEmpresaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Cadastro de Empresa B2B Corporate</h3>
                  <p className="text-xs text-slate-500">Credenciamento de pessoa jurídica com faturamento especial</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewEmpresaModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateEmpresa} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Razão Social *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Prime Soluções e Serviços S/A"
                    value={formEmpresa.razao_social}
                    onChange={(e) => setFormEmpresa({ ...formEmpresa, razao_social: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nome Fantasia</label>
                  <input
                    type="text"
                    placeholder="Ex: Prime Soluções"
                    value={formEmpresa.nome_fantasia}
                    onChange={(e) => setFormEmpresa({ ...formEmpresa, nome_fantasia: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">CNPJ *</label>
                  <input
                    type="text"
                    required
                    placeholder="00.000.000/0000-00"
                    value={formEmpresa.cnpj}
                    onChange={(e) => setFormEmpresa({ ...formEmpresa, cnpj: maskCNPJ(e.target.value) })}
                    className="w-full px-3.5 py-2.5 text-xs font-mono font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Responsável Legal</label>
                  <input
                    type="text"
                    placeholder="Nome do Diretor / Administrador"
                    value={formEmpresa.responsavel_legal}
                    onChange={(e) => setFormEmpresa({ ...formEmpresa, responsavel_legal: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Telefone Corporativo</label>
                  <input
                    type="text"
                    placeholder="(11) 3000-0000"
                    value={formEmpresa.telefone_corporativo}
                    onChange={(e) => setFormEmpresa({ ...formEmpresa, telefone_corporativo: maskPhone(e.target.value) })}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Condição de Pagamento</label>
                  <select
                    value={formEmpresa.condicao_pagamento}
                    onChange={(e: any) => setFormEmpresa({ ...formEmpresa, condicao_pagamento: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="a_vista">À Vista</option>
                    <option value="boleto_15dd">Boleto Faturado 15DD</option>
                    <option value="boleto_30dd">Boleto Faturado 30DD</option>
                    <option value="boleto_30_60dd">Boleto Faturado 30/60DD</option>
                    <option value="faturamento_mensal">Faturamento Consolidado Mensal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Limite de Crédito (R$)</label>
                  <input 
                    type="number"
                    value={formEmpresa.limite_credito_faturado}
                    inputMode="numeric"
onChange={(e) => setFormEmpresa({ ...formEmpresa, limite_credito_faturado: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewEmpresaModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                >
                  Salvar Empresa B2B
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
