import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, ShieldAlert, AlertTriangle, Plus, Search, 
  Filter, Download, DollarSign, CheckCircle2, Clock, 
  FileText, Car, Home, Heart, Building, Eye, RefreshCw, 
  Phone, UserCheck, Award
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { navigate } from '../../../../routing/navigationService';
import { routes } from '../../../../routing/routeCatalog';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { formatCurrency, formatDate, maskCPF } from '../../../../lib/utils';
import { 
  TacticalDataGrid, GridColumn, 
  CommandSlideOver, StatusBadge, SlideOverTab 
} from '../shared';
import { SeguroRecord, SeguroRamo, SinistroItem } from './contratos.types';

export function GsaSegurosView() {
  const [seguros, setSeguros] = useState<SeguroRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeguroId, setSelectedSeguroId] = useState<string | null>(null);
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [activeSlideTab, setActiveSlideTab] = useState<string>('apolice');

  // Filter
  const [ramoFilter, setRamoFilter] = useState<string>('todos');

  const fetchSeguros = async () => {
    setLoading(true);

    try {
      const { data: dbData, error } = await supabase
        .from('seguros_apolices')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && dbData && dbData.length > 0) {
        const mapped: SeguroRecord[] = dbData.map((d: any) => ({
          id: d.id,
          codigo_apolice: d.codigo_apolice || d.codigo || `APOL-${String(d.id).slice(0, 8).toUpperCase()}`,
          cliente_id: d.cliente_id || '',
          cliente_nome: d.cliente_nome || d.segurado_nome || 'Cliente',
          cliente_documento: d.cliente_documento || d.cpf_cnpj || '',
          seguradora_nome: d.seguradora_nome || d.seguradora || 'Seguradora',
          ramo: (d.ramo as SeguroRamo) || 'auto',
          objeto_segurado: d.objeto_segurado || d.descricao_bem || 'Bem Segurado',
          importancia_segurada: Number(d.importancia_segurada || d.valor_cobertura || 0),
          premio_total: Number(d.premio_total || d.premio || 0),
          forma_pagamento: d.forma_pagamento || '',
          franquia_valor: Number(d.franquia_valor || d.franquia || 0),
          vigencia_inicio: d.vigencia_inicio || d.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
          vigencia_fim: d.vigencia_fim || '',
          status: d.status || 'vigente',
          comissao_corretagem: Number(d.comissao_corretagem || 0),
          assistencia_24h_ativa: Boolean(d.assistencia_24h_ativa),
          sinistros: Array.isArray(d.sinistros) ? d.sinistros : []
        }));
        setSeguros(mapped);
      } else {
        setSeguros([]);
      }
    } catch {
      setSeguros([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSeguros();
  }, []);

  useRealtimeSubscription({ table: 'seguros_apolices', onChange: fetchSeguros });

  const selectedSeguro = useMemo(() => {
    return seguros.find(s => s.id === selectedSeguroId) || null;
  }, [seguros, selectedSeguroId]);

  const filteredSeguros = useMemo(() => {
    return seguros.filter(s => {
      if (ramoFilter !== 'todos' && s.ramo !== ramoFilter) return false;
      return true;
    });
  }, [seguros, ramoFilter]);

  const telemetry = useMemo(() => {
    const totalApolices = seguros.length;
    const isTotal = seguros.reduce((acc, cur) => acc + cur.importancia_segurada, 0);
    const premiosTotal = seguros.reduce((acc, cur) => acc + cur.premio_total, 0);
    const sinistrosAbertos = seguros.filter(s => s.sinistros.length > 0).length;

    return {
      totalApolices,
      isTotal,
      premiosTotal,
      sinistrosAbertos
    };
  }, [seguros]);

  const handleOpenSeguro = (seg: SeguroRecord) => {
    setSelectedSeguroId(seg.id);
    setIsSlideOverOpen(true);
    setActiveSlideTab('apolice');
  };

  const getRamoIcon = (ramo: SeguroRamo) => {
    switch (ramo) {
      case 'auto': return Car;
      case 'residencial': return Home;
      case 'vida': return Heart;
      default: return Building;
    }
  };

  const columns: GridColumn<SeguroRecord>[] = [
    {
      key: 'seguradora_objeto',
      header: 'Apólice & Bem Segurado',
      width: '320px',
      render: (row) => {
        const Icon = getRamoIcon(row.ramo);
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-200">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-900 truncate text-sm">
                {row.seguradora_nome}
              </div>
              <div className="text-xs text-slate-500 truncate">{row.objeto_segurado}</div>
              <div className="text-[10px] text-blue-600 font-mono font-bold mt-0.5">{row.codigo_apolice}</div>
            </div>
          </div>
        );
      }
    },
    {
      key: 'segurado',
      header: 'Segurado (Cliente)',
      width: '240px',
      render: (row) => (
        <div className="text-xs space-y-0.5">
          <div className="font-bold text-slate-900 truncate">{row.cliente_nome}</div>
          <div className="text-slate-500 font-mono">{row.cliente_documento}</div>
        </div>
      )
    },
    {
      key: 'is_premio',
      header: 'Importância Segurada / Prêmio',
      width: '200px',
      align: 'right',
      render: (row) => (
        <div className="text-right">
          <div className="font-bold text-slate-900 text-sm">
            IS: {formatCurrency(row.importancia_segurada)}
          </div>
          <div className="text-[11px] text-slate-500">
            Prêmio: {formatCurrency(row.premio_total)}
          </div>
        </div>
      )
    },
    {
      key: 'vigencia',
      header: 'Vigência',
      width: '160px',
      render: (row) => (
        <div className="text-xs text-slate-700 font-medium">
          {formatDate(row.vigencia_inicio)} até {formatDate(row.vigencia_fim)}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      width: '130px',
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
          onClick={() => handleOpenSeguro(row)}
          className="px-3 py-1 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
        >
          Regular Sinistro
        </button>
      )
    }
  ];

  const slideTabs: SlideOverTab[] = [
    { id: 'apolice', label: 'Dados da Apólice', icon: ShieldCheck },
    { id: 'sinistros', label: 'Regulação de Sinistros', icon: ShieldAlert, badge: selectedSeguro?.sinistros.length },
    { id: 'assistencias', label: 'Assistência 24 Horas', icon: Phone }
  ];

  return (
    <div className="space-y-6">
      {/* Telemetry */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Apólices Ativas</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-blue-950">{telemetry.totalApolices}</div>
          <div className="mt-1 text-xs text-blue-700">Em plena vigência</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">IS Sob Risco</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{formatCurrency(telemetry.isTotal)}</div>
          <div className="mt-1 text-xs text-slate-500">Patrimônio segurado</div>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Prêmios Emitidos</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-950">{formatCurrency(telemetry.premiosTotal)}</div>
          <div className="mt-1 text-xs text-emerald-700">Prêmio líquido total</div>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Sinistros em Regulação</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-rose-950">{telemetry.sinistrosAbertos}</div>
          <div className="mt-1 text-xs text-rose-700">Em vistoria / análise</div>
        </div>
      </div>

      <TacticalDataGrid<SeguroRecord>
        title="GSA Seguros & Regulação de Sinistros"
        subtitle="Controle de apólices, cotações multirramos, acionamento de assistências 24h e laudos periciais de indenização."
        data={filteredSeguros}
        columns={columns}
        keyExtractor={(row) => row.id}
        isLoading={loading}
        onRowClick={(row) => handleOpenSeguro(row)}
        searchPlaceholder="Buscar por apólice, segurado, objeto, seguradora..."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchSeguros}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </button>
            <button
              type="button"
              onClick={() => navigate(routes.admin.seguros.cotacoes())}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
            >
              <Plus className="h-4 w-4" /> Abrir Cotações de Seguro
            </button>
          </div>
        }
      />

      {/* SLIDEOVER */}
      <CommandSlideOver
        isOpen={isSlideOverOpen}
        onClose={() => setIsSlideOverOpen(false)}
        width="xl"
        title={selectedSeguro ? `${selectedSeguro.seguradora_nome} - ${selectedSeguro.objeto_segurado}` : 'Apólice'}
        subtitle={selectedSeguro ? `Segurado: ${selectedSeguro.cliente_nome} • Apólice: ${selectedSeguro.codigo_apolice}` : ''}
        badge={selectedSeguro ? <StatusBadge status={selectedSeguro.status} size="sm" dot /> : undefined}
        tabs={slideTabs}
        activeTab={activeSlideTab}
        onTabChange={setActiveSlideTab}
      >
        {selectedSeguro && (
          <div className="space-y-6">
            {activeSlideTab === 'apolice' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase">Importância Segurada</div>
                    <div className="text-xl font-black text-slate-900 mt-1">{formatCurrency(selectedSeguro.importancia_segurada)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Limite máximo indenizável</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase">Prêmio Total</div>
                    <div className="text-xl font-black text-slate-900 mt-1">{formatCurrency(selectedSeguro.premio_total)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{selectedSeguro.forma_pagamento}</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase">Franquia Obrigatória</div>
                    <div className="text-xl font-black text-rose-700 mt-1">{formatCurrency(selectedSeguro.franquia_valor || 0)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Participação do segurado</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Dados Cadastrais do Risco</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="font-bold text-slate-500 block">Companhia Seguradora:</span>
                      <span className="font-semibold text-slate-900 text-sm">{selectedSeguro.seguradora_nome}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">Ramo de Seguro:</span>
                      <span className="font-semibold text-slate-900 text-sm uppercase">{selectedSeguro.ramo}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">Objeto / Bem Coberto:</span>
                      <span className="font-semibold text-slate-900">{selectedSeguro.objeto_segurado}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">Comissão de Corretagem GSA:</span>
                      <span className="font-bold text-emerald-700">{formatCurrency(selectedSeguro.comissao_corretagem)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSlideTab === 'sinistros' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900">Histórico & Abertura de Sinistros</h4>
                    <button
                      type="button"
                      onClick={() => navigate(routes.admin.seguros.sinistros())}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" /> Abrir Gestão de Sinistros
                    </button>
                  </div>

                  {selectedSeguro.sinistros.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      {selectedSeguro.sinistros.map(sin => (
                        <div key={sin.id} className="py-4 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 text-sm">{sin.codigo_sinistro} • Ocorrido em {formatDate(sin.data_ocorrencia)}</span>
                            <StatusBadge status={sin.status} size="xs" />
                          </div>
                          <p className="text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">{sin.descricao}</p>
                          <div className="flex items-center justify-between text-[11px] pt-1">
                            <span className="font-semibold text-slate-700">Prejuízo Reclamado: {formatCurrency(sin.valor_reclamado)}</span>
                            <span className="text-emerald-700 font-bold">Franquia Comprovada</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      Nenhum sinistro registrado para esta apólice.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CommandSlideOver>
    </div>
  );
}
