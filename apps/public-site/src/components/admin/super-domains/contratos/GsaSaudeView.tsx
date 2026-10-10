import React, { useState, useEffect, useMemo } from 'react';
import { 
  HeartPulse, Plus, Search, Filter, Download, Users, 
  DollarSign, CheckCircle2, AlertTriangle, ShieldCheck, 
  UserCheck, RefreshCw, Eye, FileText, Phone, Mail, 
  Calendar, Award, Activity, Stethoscope, Clock
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
import { SaudeRecord, SaudeBeneficiario, SaudeTipoPlano } from './contratos.types';

export function GsaSaudeView() {
  const [contratosSaude, setContratosSaude] = useState<SaudeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSaudeId, setSelectedSaudeId] = useState<string | null>(null);
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [activeSlideTab, setActiveSlideTab] = useState<string>('geral');

  // Filter
  const [operadoraFilter, setOperadoraFilter] = useState<string>('todas');
  const [tipoPlanoFilter, setTipoPlanoFilter] = useState<string>('todos');

  const fetchSaude = async () => {
    setLoading(true);

    try {
      const { data: dbData, error } = await supabase
        .from('saude_contratos')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && dbData && dbData.length > 0) {
        const mapped: SaudeRecord[] = dbData.map((d: any) => ({
          id: d.id,
          codigo_proposta_contrato: d.codigo_proposta || d.codigo || `SAU-${String(d.id).slice(0, 8).toUpperCase()}`,
          cliente_id: d.cliente_id || '',
          cliente_nome: d.cliente_nome || d.titular_nome || 'Cliente',
          cliente_documento: d.cliente_documento || d.cpf || '',
          operadora_nome: d.operadora_nome || d.operadora || 'Operadora',
          nome_plano: d.nome_plano || d.plano || 'Plano de Saúde',
          tipo_plano: (d.tipo_plano as SaudeTipoPlano) || 'individual',
          coparticipacao: Boolean(d.coparticipacao),
          acomodacao: d.acomodacao || 'enfermaria',
          abrangencia: d.abrangencia || 'nacional',
          vidas_count: Number(d.vidas_count || (Array.isArray(d.beneficiarios) ? d.beneficiarios.length : 1)),
          valor_mensalidade: Number(d.valor_mensalidade || d.valor || 0),
          comissao_prevista: Number(d.comissao_prevista || 0),
          comissao_status: d.comissao_status || 'prevista',
          status: d.status || 'ativo',
          data_inicio: d.data_inicio || d.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
          data_reajuste_anual: d.data_reajuste_anual || '',
          beneficiarios: Array.isArray(d.beneficiarios) ? d.beneficiarios : []
        }));
        setContratosSaude(mapped);
      } else {
        setContratosSaude([]);
      }
    } catch {
      setContratosSaude([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSaude();
  }, []);

  useRealtimeSubscription({ table: 'saude_contratos', onChange: fetchSaude });

  const selectedSaude = useMemo(() => {
    return contratosSaude.find(s => s.id === selectedSaudeId) || null;
  }, [contratosSaude, selectedSaudeId]);

  const filteredSaude = useMemo(() => {
    return contratosSaude.filter(s => {
      if (operadoraFilter !== 'todas' && s.operadora_nome !== operadoraFilter) return false;
      if (tipoPlanoFilter !== 'todos' && s.tipo_plano !== tipoPlanoFilter) return false;
      return true;
    });
  }, [contratosSaude, operadoraFilter, tipoPlanoFilter]);

  const telemetry = useMemo(() => {
    const totalContratos = contratosSaude.length;
    const vidasTotal = contratosSaude.reduce((acc, cur) => acc + cur.vidas_count, 0);
    const mensalidadesTotal = contratosSaude.reduce((acc, cur) => acc + cur.valor_mensalidade, 0);
    const comissoesTotal = contratosSaude.reduce((acc, cur) => acc + cur.comissao_prevista, 0);

    return {
      totalContratos,
      vidasTotal,
      mensalidadesTotal,
      comissoesTotal
    };
  }, [contratosSaude]);

  const handleOpenSaude = (item: SaudeRecord) => {
    setSelectedSaudeId(item.id);
    setIsSlideOverOpen(true);
    setActiveSlideTab('geral');
  };

  const columns: GridColumn<SaudeRecord>[] = [
    {
      key: 'operadora_plano',
      header: 'Operadora & Plano',
      width: '320px',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-200">
            <HeartPulse className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-900 truncate text-sm">
              {row.operadora_nome}
            </div>
            <div className="text-xs text-slate-500 truncate">{row.nome_plano}</div>
          </div>
        </div>
      )
    },
    {
      key: 'titular',
      header: 'Titular / Contratante',
      width: '240px',
      render: (row) => (
        <div className="text-xs space-y-0.5">
          <div className="font-bold text-slate-900 truncate">{row.cliente_nome}</div>
          <div className="text-slate-500 font-mono">{row.cliente_documento}</div>
        </div>
      )
    },
    {
      key: 'vidas',
      header: 'Vidas (Segurados)',
      width: '140px',
      align: 'center',
      render: (row) => (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700">
          <Users className="h-3.5 w-3.5 text-slate-500" />
          {row.vidas_count} vida(s)
        </span>
      )
    },
    {
      key: 'mensalidade',
      header: 'Mensalidade & Comissão',
      width: '180px',
      align: 'right',
      render: (row) => (
        <div className="text-right">
          <div className="font-bold text-slate-900 text-sm">
            {formatCurrency(row.valor_mensalidade)}/mês
          </div>
          <div className="text-[11px] text-teal-700 font-semibold">
            Comissão: {formatCurrency(row.comissao_prevista)}
          </div>
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
          onClick={() => handleOpenSaude(row)}
          className="px-3 py-1 text-xs font-bold rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 transition"
        >
          Beneficiários
        </button>
      )
    }
  ];

  const slideTabs: SlideOverTab[] = [
    { id: 'geral', label: 'Dados do Plano', icon: HeartPulse },
    { id: 'beneficiarios', label: 'Relação de Beneficiários', icon: Users, badge: selectedSaude?.beneficiarios.length },
    { id: 'financeiro', label: 'Mensalidades & Comissão', icon: DollarSign }
  ];

  return (
    <div className="space-y-6">
      {/* Telemetry */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-teal-100 bg-teal-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-800">Vidas Ativas</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100 text-teal-800">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-teal-950">{telemetry.vidasTotal}</div>
          <div className="mt-1 text-xs text-teal-700">Segurados sob gestão</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Contratos / Apólices</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <HeartPulse className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{telemetry.totalContratos}</div>
          <div className="mt-1 text-xs text-slate-500">Planos de saúde ativos</div>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Prêmios Mensais</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-950">{formatCurrency(telemetry.mensalidadesTotal)}</div>
          <div className="mt-1 text-xs text-emerald-700">Faturamento gerido</div>
        </div>

        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Comissões de Corretagem</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-indigo-950">{formatCurrency(telemetry.comissoesTotal)}</div>
          <div className="mt-1 text-xs text-indigo-700">Receita de intermediação</div>
        </div>
      </div>

      <TacticalDataGrid<SaudeRecord>
        title="GSA Saúde & Convênios Médicos"
        subtitle="Intermediação e gestão operacional de planos de saúde, cotações, implantação de propostas, carteirinhas e beneficiários."
        data={filteredSaude}
        columns={columns}
        keyExtractor={(row) => row.id}
        isLoading={loading}
        onRowClick={(row) => handleOpenSaude(row)}
        searchPlaceholder="Buscar por titular, operadora, plano, CPF/CNPJ..."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchSaude}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </button>
            <button
              type="button"
              onClick={() => navigate(routes.admin.saude.cotacoes())}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-teal-700 text-white hover:bg-teal-800 shadow-sm"
            >
              <Plus className="h-4 w-4" /> Abrir Cotações de Saúde
            </button>
          </div>
        }
      />

      {/* SLIDEOVER */}
      <CommandSlideOver
        isOpen={isSlideOverOpen}
        onClose={() => setIsSlideOverOpen(false)}
        width="xl"
        title={selectedSaude ? `${selectedSaude.operadora_nome} - ${selectedSaude.nome_plano}` : 'Plano de Saúde'}
        subtitle={selectedSaude ? `Titular: ${selectedSaude.cliente_nome} • ${selectedSaude.vidas_count} vidas` : ''}
        badge={selectedSaude ? <StatusBadge status={selectedSaude.status} size="sm" dot /> : undefined}
        tabs={slideTabs}
        activeTab={activeSlideTab}
        onTabChange={setActiveSlideTab}
      >
        {selectedSaude && (
          <div className="space-y-6">
            {activeSlideTab === 'geral' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase">Mensalidade Total</div>
                    <div className="text-xl font-black text-slate-900 mt-1">{formatCurrency(selectedSaude.valor_mensalidade)}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Vencimento mensal</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase">Acomodação</div>
                    <div className="text-base font-bold text-slate-900 mt-1 uppercase">{selectedSaude.acomodacao}</div>
                    <div className="text-xs text-slate-500 mt-0.5">Abrangência {selectedSaude.abrangencia}</div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="text-xs font-bold text-slate-500 uppercase">Reajuste ANS</div>
                    <div className="text-base font-bold text-slate-900 mt-1">{formatDate(selectedSaude.data_reajuste_anual)}</div>
                    <div className="text-xs text-teal-700 font-semibold mt-0.5">Vigência regular</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Especificações Técnicas</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="font-bold text-slate-500 block">Operadora de Saúde:</span>
                      <span className="font-semibold text-slate-900 text-sm">{selectedSaude.operadora_nome}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">Modalidade do Contrato:</span>
                      <span className="font-semibold text-slate-900 text-sm uppercase">{selectedSaude.tipo_plano}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">Coparticipação:</span>
                      <span className="font-semibold text-slate-900">{selectedSaude.coparticipacao ? 'Sim (Taxa conforme tabela ANS)' : 'Sem Coparticipação'}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">Código da Proposta/Apólice:</span>
                      <span className="font-mono text-slate-900 font-bold">{selectedSaude.codigo_proposta_contrato}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSlideTab === 'beneficiarios' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900">Roster de Segurados / Beneficiários</h4>
                    <button
                      type="button"
                      disabled
                      title="Inclusão de dependentes deve ser feita pelo fluxo operacional de Saúde; este painel é somente de consulta."
                      className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-200 text-slate-500 cursor-not-allowed flex items-center gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" /> Inclusão via fluxo de Saúde
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {selectedSaude.beneficiarios.map(ben => (
                      <div key={ben.id} className="py-4 flex items-center justify-between text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{ben.nome}</span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                              {ben.parentesco}
                            </span>
                          </div>
                          <div className="text-slate-500 font-mono mt-0.5">CPF: {maskCPF(ben.cpf)} • Nasc: {formatDate(ben.data_nascimento)}</div>
                          {ben.numero_carteirinha && (
                            <div className="text-teal-800 font-bold text-[11px] mt-1">Carteirinha: {ben.numero_carteirinha}</div>
                          )}
                        </div>

                        <div className="text-right">
                          {ben.carencia_restante_dias === 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Carência Cumprida
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg">
                              <Clock className="h-3.5 w-3.5" /> Carência: {ben.carencia_restante_dias} dias
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CommandSlideOver>
    </div>
  );
}
