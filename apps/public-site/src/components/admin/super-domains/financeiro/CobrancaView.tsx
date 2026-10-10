import React, { useState, useEffect, useMemo } from 'react';
import { 
  Gavel, AlertTriangle, MessageCircle, Settings, History, Send, Clock, CheckCircle2,
  Activity, User, Scale, Target, Banknote, Loader2, TrendingUp, ShieldAlert, Search, 
  Filter, XCircle, Trash2, FileText, Layers, RefreshCw, Plus, Calendar, CreditCard, Eye
} from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { formatCurrency, formatDateTime, formatDate, maskPhone, maskCPF, maskCNPJ } from '../../../../lib/utils';
import { toast } from 'react-hot-toast';
import { notificationService } from '../../../../lib/notificationService';
import { logService } from '../../../../lib/logService';
import { whatsappNotificationService } from '../../../../lib/whatsappNotificationService';
import { TacticalDataGrid, GridColumn } from '../shared/TacticalDataGrid';
import { CommandSlideOver } from '../shared/CommandSlideOver';
import { StatusBadge } from '../shared/StatusBadge';
import { AdminWhatsAppButton } from '../../ui/AdminWhatsAppButton';

export interface CobrancaViewProps {
  initialItemId?: string;
  colaboradorNome?: string;
  colaboradorId?: string;
  onNavigateTab?: (tab: string, subTab?: string, itemId?: string) => void;
}

export function CobrancaView({
  initialItemId,
  colaboradorNome,
  colaboradorId,
  onNavigateTab
}: CobrancaViewProps) {
  const [activeTab, setActiveTab] = useState<'fila' | 'acordos' | 'protestos' | 'configuracoes'>('fila');
  const [cobrancas, setCobrancas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<any>({});
  const [savingConfigs, setSavingConfigs] = useState(false);

  // Selected item & SlideOvers
  const [selectedCobranca, setSelectedCobranca] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Agreement Drawer
  const [isAcordoDrawerOpen, setIsAcordoDrawerOpen] = useState(false);
  const [acordoData, setAcordoData] = useState({
    parcelas: 1,
    dtPrimeiroVenc: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
    desconto: 0,
    observacoes: ''
  });
  const [submittingAcordo, setSubmittingAcordo] = useState(false);

  // Installment Settle Drawer
  const [isBaixaParcelaOpen, setIsBaixaParcelaOpen] = useState(false);
  const [selectedParcela, setSelectedParcela] = useState<any | null>(null);
  const [baixaParcelaData, setBaixaParcelaData] = useState({
    data_pagamento: new Date().toISOString().split('T')[0],
    forma_pagamento: 'pix'
  });
  const [submittingBaixaParcela, setSubmittingBaixaParcela] = useState(false);

  // Manual Full Settle Drawer
  const [isBaixaManualOpen, setIsBaixaManualOpen] = useState(false);
  const [baixaManualData, setBaixaManualData] = useState({
    valor_pago: 0,
    data_pagamento: new Date().toISOString().split('T')[0],
    forma_pagamento: 'pix'
  });
  const [submittingBaixaManual, setSubmittingBaixaManual] = useState(false);

  // Protest Drawer
  const [isProtestoDrawerOpen, setIsProtestoDrawerOpen] = useState(false);
  const [protestoData, setProtestoData] = useState({
    data_protesto: new Date().toISOString().split('T')[0],
    nome_cartorio: ''
  });
  const [submittingProtesto, setSubmittingProtesto] = useState(false);

  // Contact History Modal
  const [isHistoricoDrawerOpen, setIsHistoricoDrawerOpen] = useState(false);
  const [novoHistorico, setNovoHistorico] = useState({
    tipo: 'contato_telefonico',
    descricao: '',
    promessa_pagamento: false,
    data_promessa: ''
  });
  const [submittingHistorico, setSubmittingHistorico] = useState(false);

  // ── Fetch Collections & Settings ─────────────────────────────────────────
  const fetchConfigs = async () => {
    try {
      const { data } = await supabase.from('system_settings').select('*');
      if (data) {
        const parsed = data.reduce((acc: any, curr: any) => ({ ...acc, [curr.key]: curr.value }), {});
        setConfigs(parsed);
      }
    } catch (err) {
      console.error('Erro ao buscar configurações:', err);
    }
  };

  const fetchCobrancas = async () => {
    setLoading(true);
    try {
      const { data: configData } = await supabase.from('system_settings').select('key, value');
      const settings = (configData || []).reduce((acc: any, curr: any) => ({ ...acc, [curr.key]: curr.value }), {});
      const multaPct = Number(settings.cobranca_multa_porcentagem) || 2;
      const jurosMensal = Number(settings.cobranca_juros_mensal) || 1;
      const jurosTipo = settings.cobranca_juros_tipo || 'diario';

      const { data, error } = await supabase
        .from('cobrancas')
        .select(`
          *,
          faturas(id, codigo_fatura, data_vencimento, valor_total),
          clientes(id, nome, cpf, cnpj, telefone, email, codigo_cliente),
          cobranca_historico(*),
          cobranca_acordo_parcelas(*)
        `)
        .order('score_risco', { ascending: false });

      if (error) throw error;

      if (data) {
        const updated = data.map((c: any) => {
          if (c.status === 'quitado') return c;

          const vencimento = c.faturas?.data_vencimento ? new Date(c.faturas.data_vencimento) : new Date(c.created_at);
          const diff = Date.now() - vencimento.getTime();
          const diasAtraso = Math.max(0, Math.floor(diff / 86400000));

          const valorOriginal = Number(c.valor_original || 0);
          const multa = valorOriginal * (multaPct / 100);
          let juros = 0;
          if (jurosTipo === 'diario') {
            juros = valorOriginal * (jurosMensal / 100 / 30) * diasAtraso;
          } else {
            juros = valorOriginal * (jurosMensal / 100) * Math.floor(diasAtraso / 30);
          }
          const valorAtualizado = Math.round((valorOriginal + multa + juros) * 100) / 100;

          let score = 0;
          score += Math.min(diasAtraso * 0.4, 40);
          score += Math.min((valorOriginal / 1000) * 5, 25);
          score += 15;
          score = Math.max(0, Math.min(100, Math.round(score)));

          return {
            ...c,
            dias_atraso: diasAtraso,
            valor_multa: Math.round(multa * 100) / 100,
            valor_juros: Math.round(juros * 100) / 100,
            valor_atualizado: valorAtualizado,
            score_risco: score
          };
        });

        setCobrancas(updated);

        if (initialItemId) {
          const target = updated.find(it => it.id === initialItemId || it.fatura_id === initialItemId);
          if (target) {
            setSelectedCobranca(target);
            setIsDetailOpen(true);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao buscar cobranças:', err);
      toast.error('Erro ao carregar dados de cobrança.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
    fetchCobrancas();
  }, []);

  useRealtimeSubscription([
    { table: 'cobrancas', onChange: fetchCobrancas },
    { table: 'cobranca_historico', onChange: fetchCobrancas },
    { table: 'cobranca_acordo_parcelas', onChange: fetchCobrancas }
  ]);

  // ── Actions ─────────────────────────────────────────────────────────────
  
  // 1. Gerar Acordo via RPC gsa_admin_gerar_acordo_cobranca
  const handleGerarAcordo = async () => {
    if (!selectedCobranca) return;
    if (acordoData.parcelas < 1) {
      toast.error('Informe ao menos 1 parcela.');
      return;
    }
    if (!acordoData.dtPrimeiroVenc) {
      toast.error('Informe o vencimento da primeira parcela.');
      return;
    }

    setSubmittingAcordo(true);
    try {
      const res = await callAdminRpc<any>('gsa_admin_gerar_acordo_cobranca', {
        p_cobranca_id: selectedCobranca.id,
        p_parcelas: Number(acordoData.parcelas),
        p_primeiro_vencimento: acordoData.dtPrimeiroVenc,
        p_desconto_valor: Number(acordoData.desconto) || 0,
        p_observacoes: acordoData.observacoes || 'Acordo de parcelamento formalizado.'
      });

      if (res && !res.success) throw new Error(res.error || 'Erro ao gerar acordo.');

      toast.success('Acordo gerado e parcelas criadas com sucesso!');
      setIsAcordoDrawerOpen(false);
      setIsDetailOpen(false);
      fetchCobrancas();

      await logService.logAction({
        ator_tipo: colaboradorNome ? 'colaborador' : 'admin',
        ator_id: colaboradorId || 'admin',
        ator_nome: colaboradorNome || 'Administrador',
        acao: 'GERAR_ACORDO_COBRANCA',
        detalhes: `Gerou acordo de ${acordoData.parcelas}x para a cobrança #${selectedCobranca.id.slice(0, 8)}`
      });
    } catch (err: any) {
      console.error('Erro ao gerar acordo:', err);
      toast.error(err?.message || 'Erro ao gerar acordo.');
    } finally {
      setSubmittingAcordo(false);
    }
  };

  // 2. Baixar Parcela de Acordo via RPC gsa_admin_baixar_parcela_cobranca
  const handleBaixarParcela = async () => {
    if (!selectedParcela) return;

    setSubmittingBaixaParcela(true);
    try {
      const res = await callAdminRpc<any>('gsa_admin_baixar_parcela_cobranca', {
        p_parcela_id: selectedParcela.id,
        p_data_pagamento: baixaParcelaData.data_pagamento,
        p_forma_pagamento: baixaParcelaData.forma_pagamento
      });

      if (res && !res.success) throw new Error(res.error || 'Erro ao baixar parcela.');

      toast.success('Parcela baixada com sucesso!');
      setIsBaixaParcelaOpen(false);
      fetchCobrancas();
    } catch (err: any) {
      console.error('Erro ao baixar parcela:', err);
      toast.error(err?.message || 'Erro ao baixar parcela.');
    } finally {
      setSubmittingBaixaParcela(false);
    }
  };

  // 3. Baixa Manual de Cobrança via RPC gsa_admin_baixar_cobranca_manual
  const handleBaixarCobrancaManual = async () => {
    if (!selectedCobranca) return;
    if (baixaManualData.valor_pago <= 0) {
      toast.error('Informe o valor pago.');
      return;
    }

    setSubmittingBaixaManual(true);
    try {
      const res = await callAdminRpc<any>('gsa_admin_baixar_cobranca_manual', {
        p_cobranca_id: selectedCobranca.id,
        p_valor_pago: Number(baixaManualData.valor_pago),
        p_data_pagamento: baixaManualData.data_pagamento,
        p_forma_pagamento: baixaManualData.forma_pagamento
      });

      if (res && !res.success) throw new Error(res.error || 'Erro ao liquidar cobrança.');

      toast.success('Cobrança liquidada com sucesso!');
      setIsBaixaManualOpen(false);
      setIsDetailOpen(false);
      fetchCobrancas();
    } catch (err: any) {
      console.error('Erro ao liquidar cobrança:', err);
      toast.error(err?.message || 'Erro ao liquidar cobrança.');
    } finally {
      setSubmittingBaixaManual(false);
    }
  };

  // 4. Registrar Protesto em Cartório via RPC gsa_admin_protestar_cobranca
  const handleRegistrarProtesto = async () => {
    if (!selectedCobranca) return;
    if (!protestoData.nome_cartorio.trim()) {
      toast.error('Informe o nome do cartório.');
      return;
    }

    setSubmittingProtesto(true);
    try {
      const res = await callAdminRpc<any>('gsa_admin_protestar_cobranca', {
        p_cobranca_id: selectedCobranca.id,
        p_data_protesto: protestoData.data_protesto,
        p_cartorio: protestoData.nome_cartorio.trim()
      });

      if (res && !res.success) throw new Error(res.error || 'Erro ao protestar cobrança.');

      toast.success('Cobrança enviada para protesto em cartório!');
      setIsProtestoDrawerOpen(false);
      setIsDetailOpen(false);
      fetchCobrancas();
    } catch (err: any) {
      console.error('Erro ao protestar:', err);
      toast.error(err?.message || 'Erro ao registrar protesto.');
    } finally {
      setSubmittingProtesto(false);
    }
  };

  // 5. Registrar Histórico de Contato via RPC gsa_admin_registrar_cobranca_historico
  const handleSalvarHistorico = async () => {
    if (!selectedCobranca) return;
    if (!novoHistorico.descricao.trim()) {
      toast.error('Informe a descrição do contato.');
      return;
    }

    setSubmittingHistorico(true);
    try {
      const res = await callAdminRpc<any>('gsa_admin_registrar_cobranca_historico', {
        p_cobranca_id: selectedCobranca.id,
        p_tipo: novoHistorico.tipo,
        p_descricao: novoHistorico.descricao.trim(),
        p_promessa_pagamento: novoHistorico.promessa_pagamento,
        p_data_promessa: novoHistorico.promessa_pagamento ? novoHistorico.data_promessa : null
      });

      if (res && !res.success) throw new Error(res.error || 'Erro ao registrar histórico.');

      toast.success('Histórico de contato registrado!');
      setNovoHistorico({ tipo: 'contato_telefonico', descricao: '', promessa_pagamento: false, data_promessa: '' });
      setIsHistoricoDrawerOpen(false);
      fetchCobrancas();
    } catch (err: any) {
      console.error('Erro ao salvar histórico:', err);
      toast.error(err?.message || 'Erro ao salvar histórico.');
    } finally {
      setSubmittingHistorico(false);
    }
  };

  // 6. Cancelar Acordo via RPC gsa_admin_cancelar_acordo_cobranca
  const handleCancelarAcordo = async (cobranca: any) => {
    if (!confirm('Deseja realmente cancelar o acordo desta cobrança? As parcelas pendentes serão removidas.')) return;
    try {
      const res = await callAdminRpc<any>('gsa_admin_cancelar_acordo_cobranca', {
        p_cobranca_id: cobranca.id,
        p_motivo: 'Cancelamento manual via painel de cobrança.'
      });

      if (res && !res.success) throw new Error(res.error || 'Erro ao cancelar acordo.');
      toast.success('Acordo cancelado com sucesso.');
      fetchCobrancas();
    } catch (err: any) {
      console.error('Erro ao cancelar acordo:', err);
      toast.error(err?.message || 'Erro ao cancelar acordo.');
    }
  };

  // ── Columns ─────────────────────────────────────────────────────────────
  const columns: GridColumn<any>[] = [
    {
      key: 'id',
      header: 'Título / Cobrança',
      width: '150px',
      render: (row) => (
        <div>
          <span className="font-mono font-bold text-slate-900 text-xs">
            #{row.faturas?.codigo_fatura || row.id.slice(0, 8)}
          </span>
          <div className="text-[10px] text-slate-400">
            Prot: {row.id.slice(0, 8)}
          </div>
        </div>
      )
    },
    {
      key: 'cliente',
      header: 'Cliente Inadimplente',
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900 text-xs truncate">
            {row.clientes?.nome || 'Cliente não identificado'}
          </p>
          <p className="text-[10px] text-slate-500 font-mono">
            {row.clientes?.cpf || row.clientes?.cnpj || row.clientes?.telefone || '—'}
          </p>
        </div>
      )
    },
    {
      key: 'dias_atraso',
      header: 'Aging / Atraso',
      align: 'center',
      width: '120px',
      sortable: true,
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${
          row.dias_atraso > 60 ? 'bg-rose-100 text-rose-800' :
          row.dias_atraso > 30 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
        }`}>
          {row.dias_atraso} dias
        </span>
      )
    },
    {
      key: 'valor_original',
      header: 'Original',
      align: 'right',
      width: '120px',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-slate-600 text-xs">
          {formatCurrency(row.valor_original)}
        </span>
      )
    },
    {
      key: 'valor_atualizado',
      header: 'Valor Atualizado',
      align: 'right',
      width: '140px',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-mono font-bold text-slate-900 text-xs">
            {formatCurrency(row.valor_atualizado || row.valor_original)}
          </span>
          {row.valor_multa > 0 && (
            <div className="text-[9px] font-mono text-rose-600">
              +{formatCurrency(row.valor_multa + row.valor_juros)} (juros/multa)
            </div>
          )}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Fase / Status',
      align: 'center',
      width: '130px',
      sortable: true,
      render: (row) => <StatusBadge status={row.status} size="xs" />
    },
    {
      key: 'acoes',
      header: 'Ações Rápidas',
      align: 'right',
      width: '160px',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {row.status !== 'quitado' && (
            <button
              onClick={() => {
                setSelectedCobranca(row);
                setAcordoData({
                  parcelas: 2,
                  dtPrimeiroVenc: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
                  desconto: 0,
                  observacoes: ''
                });
                setIsAcordoDrawerOpen(true);
              }}
              title="Gerar Acordo / Parcelamento"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              <Scale className="h-3 w-3" />
              <span>Acordo</span>
            </button>
          )}

          <button
            onClick={() => {
              setSelectedCobranca(row);
              setIsDetailOpen(true);
            }}
            title="Ver Detalhes da Cobrança"
            className="p-1.5 rounded text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </div>
      )
    }
  ];

  const filteredCobrancas = useMemo(() => {
    if (activeTab === 'acordos') {
      return cobrancas.filter(c => c.status === 'em_acordo' || (c.cobranca_acordo_parcelas && c.cobranca_acordo_parcelas.length > 0));
    }
    if (activeTab === 'protestos') {
      return cobrancas.filter(c => c.status === 'protestado' || c.data_protesto);
    }
    return cobrancas;
  }, [cobrancas, activeTab]);

  return (
    <div className="space-y-4 animate-fade-up">
      {/* ── Sub-Navigation Tabs ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center bg-slate-200/70 p-1 rounded-xl border border-slate-200 gap-1">
          <button
            onClick={() => setActiveTab('fila')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'fila'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Gavel className="h-3.5 w-3.5 text-rose-500" />
            <span>Fila Geral de Inadimplência</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-rose-100 text-rose-800">
              {cobrancas.filter(c => c.status !== 'quitado').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('acordos')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'acordos'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Scale className="h-3.5 w-3.5 text-indigo-500" />
            <span>Acordos & Renegociações</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800">
              {cobrancas.filter(c => c.status === 'em_acordo').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('protestos')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'protestos'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5 text-slate-700" />
            <span>Cartório & Protestos</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-slate-200 text-slate-800">
              {cobrancas.filter(c => c.status === 'protestado').length}
            </span>
          </button>
        </div>

        <button
          onClick={fetchCobrancas}
          title="Recarregar Cobranças"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* ── Main DataGrid ── */}
      <TacticalDataGrid
        title="Régua & Gestão de Inadimplência"
        subtitle="Gerenciamento de títulos vencidos, cálculo dinâmico de juros, formalização de acordos e protestos."
        data={filteredCobrancas}
        columns={columns}
        keyExtractor={(row) => row.id}
        isLoading={loading}
        onRowClick={(row) => {
          setSelectedCobranca(row);
          setIsDetailOpen(true);
        }}
      />

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER 1: DEEP COBRANÇA INSPECTION
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={selectedCobranca ? `Cobrança #${selectedCobranca.id.slice(0, 8)}` : 'Detalhes'}
        subtitle={selectedCobranca ? `Cliente: ${selectedCobranca.clientes?.nome}` : ''}
        badge={selectedCobranca ? <StatusBadge status={selectedCobranca.status} size="sm" /> : undefined}
        width="lg"
        headerActions={
          selectedCobranca?.clientes?.telefone && (
            <AdminWhatsAppButton
              telefone={selectedCobranca.clientes.telefone}
              mensagem={`Olá ${selectedCobranca.clientes.nome}, sua cobrança referente à fatura ${selectedCobranca.faturas?.codigo_fatura || ''} está pendente. Valor: R$ ${(selectedCobranca.valor_atualizado || selectedCobranca.valor_original || 0).toFixed(2)}.`}
            />
          )
        }
        footer={
          selectedCobranca && selectedCobranca.status !== 'quitado' && (
            <div className="flex items-center justify-between w-full flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProtestoData({
                      data_protesto: new Date().toISOString().split('T')[0],
                      nome_cartorio: ''
                    });
                    setIsProtestoDrawerOpen(true);
                  }}
                  className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs"
                >
                  Registrar Protesto
                </button>

                <button
                  type="button"
                  onClick={() => setIsHistoricoDrawerOpen(true)}
                  className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-2xs"
                >
                  + Histórico Contato
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBaixaManualData({
                      valor_pago: selectedCobranca.valor_atualizado || selectedCobranca.valor_original,
                      data_pagamento: new Date().toISOString().split('T')[0],
                      forma_pagamento: 'pix'
                    });
                    setIsBaixaManualOpen(true);
                  }}
                  className="px-3 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-2xs"
                >
                  Quitar Cobrança
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAcordoData({
                      parcelas: 2,
                      dtPrimeiroVenc: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
                      desconto: 0,
                      observacoes: ''
                    });
                    setIsAcordoDrawerOpen(true);
                  }}
                  className="px-3 py-2 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-2xs"
                >
                  Gerar Acordo
                </button>
              </div>
            </div>
          )
        }
      >
        {selectedCobranca && (
          <div className="space-y-6">
            {/* Financial Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Valor Original</span>
                <p className="text-sm font-mono font-bold text-slate-900 mt-0.5">
                  {formatCurrency(selectedCobranca.valor_original)}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Multa / Juros</span>
                <p className="text-sm font-mono font-bold text-rose-600 mt-0.5">
                  +{formatCurrency(selectedCobranca.valor_multa + selectedCobranca.valor_juros)}
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800">Total Atualizado</span>
                <p className="text-base font-mono font-black text-rose-950 mt-0.5">
                  {formatCurrency(selectedCobranca.valor_atualizado || selectedCobranca.valor_original)}
                </p>
              </div>
            </div>

            {/* Active Agreement Installments if exists */}
            {selectedCobranca.cobranca_acordo_parcelas && selectedCobranca.cobranca_acordo_parcelas.length > 0 && (
              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Scale className="h-4 w-4 text-indigo-600" />
                    Parcelas do Acordo Formalizado
                  </h4>
                  <button
                    onClick={() => handleCancelarAcordo(selectedCobranca)}
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold underline"
                  >
                    Cancelar Acordo
                  </button>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                  {selectedCobranca.cobranca_acordo_parcelas.map((p: any) => (
                    <div key={p.id} className="p-3 flex items-center justify-between text-xs font-mono bg-slate-50/50 hover:bg-slate-50">
                      <div>
                        <span className="font-bold text-slate-900">Parcela {p.numero_parcela}</span>
                        <p className="text-[11px] text-slate-500">Vencimento: {formatDate(p.data_vencimento)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-900">{formatCurrency(p.valor)}</span>
                        <StatusBadge status={p.status} size="xs" />
                        {p.status === 'pendente' && (
                          <button
                            onClick={() => {
                              setSelectedParcela(p);
                              setIsBaixaParcelaOpen(true);
                            }}
                            className="px-2 py-1 text-[10px] font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            Baixar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Interaction Timeline / History */}
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <History className="h-4 w-4 text-indigo-600" />
                Histórico de Contatos & Ações
              </h4>

              {selectedCobranca.cobranca_historico && selectedCobranca.cobranca_historico.length > 0 ? (
                <div className="space-y-2">
                  {selectedCobranca.cobranca_historico.map((h: any) => (
                    <div key={h.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-bold text-slate-700 uppercase">{h.tipo?.replace(/_/g, ' ')}</span>
                        <span>{formatDateTime(h.created_at)}</span>
                      </div>
                      <p className="text-slate-800">{h.descricao}</p>
                      {h.promessa_pagamento && (
                        <div className="text-emerald-700 font-bold font-mono text-[11px]">
                          Promessa de Pagamento: {formatDate(h.data_promessa)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Nenhum histórico registrado até o momento.</p>
              )}
            </div>
          </div>
        )}
      </CommandSlideOver>

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER 2: BUILD PAYMENT AGREEMENT (ACORDO)
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isAcordoDrawerOpen}
        onClose={() => setIsAcordoDrawerOpen(false)}
        title="Gerar Acordo / Renegociação de Dívida"
        subtitle={selectedCobranca ? `Cliente: ${selectedCobranca.clientes?.nome}` : ''}
        width="md"
        primaryAction={{
          label: 'Formalizar Acordo',
          onClick: handleGerarAcordo,
          loading: submittingAcordo,
          variant: 'primary',
          icon: <Scale className="h-4 w-4" />
        }}
        secondaryAction={{
          label: 'Cancelar',
          onClick: () => setIsAcordoDrawerOpen(false)
        }}
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 space-y-1">
            <span className="text-[10px] font-bold uppercase text-indigo-700">Valor Base da Dívida</span>
            <p className="text-lg font-mono font-bold text-indigo-950">
              {selectedCobranca ? formatCurrency(selectedCobranca.valor_atualizado || selectedCobranca.valor_original) : 'R$ 0,00'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Quantidade de Parcelas *
              </label>
              <input 
                type="number"
                min={1}
                max={24}
                value={acordoData.parcelas}
                inputMode="numeric"
onChange={(e) => setAcordoData(prev => ({ ...prev, parcelas: Number(e.target.value) }))}
                className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono font-bold text-slate-900 shadow-2xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                1º Vencimento *
              </label>
              <input
                type="date"
                value={acordoData.dtPrimeiroVenc}
                onChange={(e) => setAcordoData(prev => ({ ...prev, dtPrimeiroVenc: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold text-slate-900 shadow-2xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Desconto Concedido no Acordo (R$)
            </label>
            <input 
              type="number"
              min={0}
              value={acordoData.desconto}
              inputMode="numeric"
onChange={(e) => setAcordoData(prev => ({ ...prev, desconto: Number(e.target.value) }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono font-bold text-slate-900 shadow-2xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Observações / Termos do Acordo
            </label>
            <textarea
              rows={3}
              placeholder="Ex: Acordo parcelado em 3x mediante PIX..."
              value={acordoData.observacoes}
              onChange={(e) => setAcordoData(prev => ({ ...prev, observacoes: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-medium text-slate-900 shadow-2xs"
            />
          </div>
        </div>
      </CommandSlideOver>

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER 3: SETTLE INSTALLMENT (BAIXA PARCELA)
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isBaixaParcelaOpen}
        onClose={() => setIsBaixaParcelaOpen(false)}
        title="Baixar Parcela de Acordo"
        subtitle={selectedParcela ? `Parcela ${selectedParcela.numero_parcela} no valor de ${formatCurrency(selectedParcela.valor)}` : ''}
        width="sm"
        primaryAction={{
          label: 'Confirmar Baixa da Parcela',
          onClick: handleBaixarParcela,
          loading: submittingBaixaParcela,
          variant: 'success',
          icon: <CheckCircle2 className="h-4 w-4" />
        }}
        secondaryAction={{
          label: 'Cancelar',
          onClick: () => setIsBaixaParcelaOpen(false)
        }}
      >
        <div className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Data do Pagamento *
            </label>
            <input
              type="date"
              value={baixaParcelaData.data_pagamento}
              onChange={(e) => setBaixaParcelaData(prev => ({ ...prev, data_pagamento: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold text-slate-900 shadow-2xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Forma de Pagamento *
            </label>
            <select
              value={baixaParcelaData.forma_pagamento}
              onChange={(e) => setBaixaParcelaData(prev => ({ ...prev, forma_pagamento: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold text-slate-900 shadow-2xs"
            >
              <option value="pix">PIX</option>
              <option value="cartao_credito">Cartão de Crédito</option>
              <option value="boleto">Boleto Bancário</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="transferencia">Transferência TED</option>
            </select>
          </div>
        </div>
      </CommandSlideOver>

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER 4: MANUAL FULL SETTLEMENT
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isBaixaManualOpen}
        onClose={() => setIsBaixaManualOpen(false)}
        title="Liquidar Cobrança Manualmente"
        subtitle={selectedCobranca ? `Cliente: ${selectedCobranca.clientes?.nome}` : ''}
        width="sm"
        primaryAction={{
          label: 'Confirmar Liquidação',
          onClick: handleBaixarCobrancaManual,
          loading: submittingBaixaManual,
          variant: 'success',
          icon: <CheckCircle2 className="h-4 w-4" />
        }}
        secondaryAction={{
          label: 'Cancelar',
          onClick: () => setIsBaixaManualOpen(false)
        }}
      >
        <div className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Valor Efetivamente Pago (R$) *
            </label>
            <input 
              type="number"
              value={baixaManualData.valor_pago}
              inputMode="numeric"
onChange={(e) => setBaixaManualData(prev => ({ ...prev, valor_pago: Number(e.target.value) }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono font-bold text-slate-900 shadow-2xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Data do Pagamento *
            </label>
            <input
              type="date"
              value={baixaManualData.data_pagamento}
              onChange={(e) => setBaixaManualData(prev => ({ ...prev, data_pagamento: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold text-slate-900 shadow-2xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Forma de Pagamento *
            </label>
            <select
              value={baixaManualData.forma_pagamento}
              onChange={(e) => setBaixaManualData(prev => ({ ...prev, forma_pagamento: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold text-slate-900 shadow-2xs"
            >
              <option value="pix">PIX</option>
              <option value="cartao_credito">Cartão de Crédito</option>
              <option value="boleto">Boleto Bancário</option>
              <option value="dinheiro">Dinheiro</option>
            </select>
          </div>
        </div>
      </CommandSlideOver>

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER 5: PROTEST REGISTRATION
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isProtestoDrawerOpen}
        onClose={() => setIsProtestoDrawerOpen(false)}
        title="Registrar Protesto em Cartório"
        subtitle={selectedCobranca ? `Cliente: ${selectedCobranca.clientes?.nome}` : ''}
        badge={<StatusBadge status="protestado" size="xs" />}
        width="sm"
        primaryAction={{
          label: 'Confirmar Registro de Protesto',
          onClick: handleRegistrarProtesto,
          loading: submittingProtesto,
          variant: 'danger',
          icon: <ShieldAlert className="h-4 w-4" />
        }}
        secondaryAction={{
          label: 'Cancelar',
          onClick: () => setIsProtestoDrawerOpen(false)
        }}
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900">
            Esta ação registrará o envio deste título para protesto formal em cartório de notas e protestos de títulos.
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Nome do Cartório / Tabelionato *
            </label>
            <input
              type="text"
              placeholder="Ex: 1º Ofício de Protesto de Títulos de SP"
              value={protestoData.nome_cartorio}
              onChange={(e) => setProtestoData(prev => ({ ...prev, nome_cartorio: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-medium text-slate-900 shadow-2xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Data do Registro do Protesto *
            </label>
            <input
              type="date"
              value={protestoData.data_protesto}
              onChange={(e) => setProtestoData(prev => ({ ...prev, data_protesto: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold text-slate-900 shadow-2xs"
            />
          </div>
        </div>
      </CommandSlideOver>

      {/* ══════════════════════════════════════════════════════════
          SLIDE-OVER 6: CONTACT HISTORY
          ══════════════════════════════════════════════════════════ */}
      <CommandSlideOver
        isOpen={isHistoricoDrawerOpen}
        onClose={() => setIsHistoricoDrawerOpen(false)}
        title="Registrar Novo Contato de Cobrança"
        subtitle={selectedCobranca ? `Cliente: ${selectedCobranca.clientes?.nome}` : ''}
        width="sm"
        primaryAction={{
          label: 'Salvar Histórico',
          onClick: handleSalvarHistorico,
          loading: submittingHistorico,
          icon: <Plus className="h-4 w-4" />
        }}
        secondaryAction={{
          label: 'Cancelar',
          onClick: () => setIsHistoricoDrawerOpen(false)
        }}
      >
        <div className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Tipo de Contato *
            </label>
            <select
              value={novoHistorico.tipo}
              onChange={(e) => setNovoHistorico(prev => ({ ...prev, tipo: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold text-slate-900 shadow-2xs"
            >
              <option value="contato_telefonico">Ligação Telefônica</option>
              <option value="whatsapp">Mensagem WhatsApp</option>
              <option value="email">E-mail Formal</option>
              <option value="notificacao_extrajudicial">Notificação Extrajudicial</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Descrição do Contato *
            </label>
            <textarea
              rows={3}
              placeholder="Descreva o que foi conversado e a postura do devedor..."
              value={novoHistorico.descricao}
              onChange={(e) => setNovoHistorico(prev => ({ ...prev, descricao: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-medium text-slate-900 shadow-2xs"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={novoHistorico.promessa_pagamento}
                onChange={(e) => setNovoHistorico(prev => ({ ...prev, promessa_pagamento: e.target.checked }))}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span className="font-bold text-slate-800">Houve promessa de pagamento?</span>
            </label>

            {novoHistorico.promessa_pagamento && (
              <div className="space-y-1 pl-6">
                <label className="block text-[11px] font-bold text-slate-600 uppercase">
                  Data da Promessa de Pagamento
                </label>
                <input
                  type="date"
                  value={novoHistorico.data_promessa}
                  onChange={(e) => setNovoHistorico(prev => ({ ...prev, data_promessa: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold text-slate-900 shadow-2xs"
                />
              </div>
            )}
          </div>
        </div>
      </CommandSlideOver>
    </div>
  );
}
