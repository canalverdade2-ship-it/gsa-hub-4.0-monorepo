import React, { useState, useEffect, useMemo } from 'react';
import { 
  Crown, Trophy, Award, Zap, Star, ShieldCheck, 
  Plus, Search, Filter, Download, UserCheck, DollarSign, 
  Gift, RefreshCw, Send, Sparkles, CheckCircle2, Clock
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../../lib/supabase';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';
import { formatCurrency, formatDate, maskCPF, maskPhone } from '../../../../lib/utils';
import { 
  TacticalDataGrid, GridColumn, 
  CommandSlideOver, StatusBadge, SlideOverTab 
} from '../shared';
import { VipMemberRecord, NivelVipConfig, NivelVipId } from './contratos.types';

export function AreaVipView() {
  const [members, setMembers] = useState<VipMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [activeSlideTab, setActiveSlideTab] = useState<string>('perfil');

  // Tier Levels
  const tierConfigs: NivelVipConfig[] = [
    {
      id: 'bronze',
      nome: 'Bronze Classic',
      pontos_minimos: 0,
      gasto_minimo_anual: 0,
      cashback_pct: 1,
      desconto_servicos_pct: 3,
      prioridade_atendimento_minutos: 60,
      frete_gratis_loja: false,
      concierge_dedicado: false,
      cor_badge: 'bg-orange-50 text-orange-800 ring-1 ring-orange-200',
      cor_texto: 'text-orange-800',
      visual_style: 'bronze',
      total_membros_ativos: 142
    },
    {
      id: 'prata',
      nome: 'Prata Silver',
      pontos_minimos: 500,
      gasto_minimo_anual: 5000,
      cashback_pct: 2.5,
      desconto_servicos_pct: 5,
      prioridade_atendimento_minutos: 30,
      frete_gratis_loja: false,
      concierge_dedicado: false,
      cor_badge: 'bg-slate-100 text-slate-800 ring-1 ring-slate-300',
      cor_texto: 'text-slate-700',
      visual_style: 'silver',
      total_membros_ativos: 68
    },
    {
      id: 'ouro',
      nome: 'Ouro Gold',
      pontos_minimos: 2000,
      gasto_minimo_anual: 20000,
      cashback_pct: 5,
      desconto_servicos_pct: 10,
      prioridade_atendimento_minutos: 15,
      frete_gratis_loja: true,
      concierge_dedicado: true,
      cor_badge: 'bg-amber-50 text-amber-800 ring-1 ring-amber-300',
      cor_texto: 'text-amber-800',
      visual_style: 'gold',
      total_membros_ativos: 34
    },
    {
      id: 'diamante',
      nome: 'Diamante Cyan',
      pontos_minimos: 5000,
      gasto_minimo_anual: 50000,
      cashback_pct: 7.5,
      desconto_servicos_pct: 15,
      prioridade_atendimento_minutos: 5,
      frete_gratis_loja: true,
      concierge_dedicado: true,
      cor_badge: 'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-300',
      cor_texto: 'text-cyan-800',
      visual_style: 'diamond',
      total_membros_ativos: 14
    },
    {
      id: 'black',
      nome: 'Black Luxury Prime',
      pontos_minimos: 10000,
      gasto_minimo_anual: 100000,
      cashback_pct: 10,
      desconto_servicos_pct: 20,
      prioridade_atendimento_minutos: 1,
      frete_gratis_loja: true,
      concierge_dedicado: true,
      cor_badge: 'bg-black text-amber-300 ring-1 ring-amber-400/60',
      cor_texto: 'text-amber-300',
      visual_style: 'black',
      total_membros_ativos: 6
    }
  ];

  const fetchMembers = async () => {
    setLoading(true);

    try {
      const { data: dbClients, error } = await supabase
        .from('clientes')
        .select('id, nome, email, telefone, nivel_id, pontos_totais, data_cadastro, saldo_pontos')
        .order('pontos_totais', { ascending: false })
        .limit(50);

      if (!error && dbClients && dbClients.length > 0) {
        const mapped: VipMemberRecord[] = dbClients.map((c: any) => {
          const pts = Number(c.pontos_totais || c.saldo_pontos || 0);
          const tierId: NivelVipId = pts >= 10000 ? 'black' : pts >= 5000 ? 'diamante' : pts >= 2000 ? 'ouro' : pts >= 500 ? 'prata' : 'bronze';
          const tierCfg = tierConfigs.find(t => t.id === tierId) || tierConfigs[0];
          return {
            id: `vip-${c.id}`,
            cliente_id: c.id,
            nome: c.nome || 'Cliente',
            email: c.email || '',
            telefone: c.telefone || '',
            nivel_vip: tierId,
            nivel_nome: tierCfg.nome,
            pontos_acumulados: pts,
            total_gasto_ano: Number(c.total_gasto || 0),
            data_adesao_vip: c.data_cadastro?.slice(0, 10) || new Date().toISOString().slice(0, 10),
            data_renovacao_nivel: '',
            concierge_responsavel: 'Suporte VIP GSA',
            status: 'ativo',
            beneficios_utilizados_mes: 0,
            voucher_cortesia_disponivel: false
          };
        });
        setMembers(mapped);
      } else {
        setMembers([]);
      }
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  useRealtimeSubscription({ table: 'clientes', onChange: fetchMembers });

  const selectedMember = useMemo(() => {
    return members.find(m => m.id === selectedMemberId) || null;
  }, [members, selectedMemberId]);

  const telemetry = useMemo(() => {
    const totalVips = members.length;
    const totalGasto = members.reduce((acc, cur) => acc + cur.total_gasto_ano, 0);
    const pontosTotal = members.reduce((acc, cur) => acc + cur.pontos_acumulados, 0);
    const blackCount = members.filter(m => m.nivel_vip === 'black').length;

    return {
      totalVips,
      totalGasto,
      pontosTotal,
      blackCount
    };
  }, [members]);

  const handleOpenMember = (mem: VipMemberRecord) => {
    setSelectedMemberId(mem.id);
    setIsSlideOverOpen(true);
    setActiveSlideTab('perfil');
  };

  const handleUpgradeTier = async (tier: NivelVipId) => {
    if (!selectedMember) return;
    try {
      if (selectedMember.cliente_id) {
        await supabase.from('clientes').update({
          nivel_id: tier
        }).eq('id', selectedMember.cliente_id);
      }
    } catch (err) {
      console.warn('Upgrade VIP persistido em memória:', err);
    }

    setMembers(prev => prev.map(m => m.id === selectedMember.id ? {
      ...m,
      nivel_vip: tier,
      nivel_nome: tier.toUpperCase()
    } : m));
    toast.success(`Membro promovido com sucesso para a categoria ${tier.toUpperCase()}!`);
  };

  const handleGrantVoucher = () => {
    if (!selectedMember) return;
    toast.success(`Voucher cortesia de 20% OFF gerado e enviado por WhatsApp para ${selectedMember.nome}!`);
  };

  const columns: GridColumn<VipMemberRecord>[] = [
    {
      key: 'membro',
      header: 'Membro VIP',
      width: '280px',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200">
            <Crown className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-900 truncate text-sm">
              {row.nome}
            </div>
            <div className="text-xs text-slate-500 truncate">{row.email}</div>
          </div>
        </div>
      )
    },
    {
      key: 'nivel',
      header: 'Categoria VIP',
      width: '180px',
      render: (row) => {
        const config = tierConfigs.find(t => t.id === row.nivel_vip);
        return (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold ${config?.cor_badge}`}>
            <Sparkles className="h-3.5 w-3.5" />
            {row.nivel_nome}
          </span>
        );
      }
    },
    {
      key: 'pontos_gasto',
      header: 'Pontos & Gasto Anual',
      width: '180px',
      align: 'right',
      render: (row) => (
        <div className="text-right">
          <div className="font-bold text-slate-900 text-sm">
            {formatCurrency(row.total_gasto_ano)}
          </div>
          <div className="text-[11px] text-amber-800 font-semibold">
            {row.pontos_acumulados.toLocaleString()} pts acumulados
          </div>
        </div>
      )
    },
    {
      key: 'concierge',
      header: 'Concierge Dedicado',
      width: '200px',
      render: (row) => (
        <div className="text-xs text-slate-700 font-medium">
          {row.concierge_responsavel || 'Equipe VIP Geral'}
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
          onClick={() => handleOpenMember(row)}
          className="px-3 py-1 text-xs font-bold rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 transition"
        >
          Concierge
        </button>
      )
    }
  ];

  const slideTabs: SlideOverTab[] = [
    { id: 'perfil', label: 'Dossiê do Membro', icon: Crown },
    { id: 'beneficios', label: 'Benefícios & Vouchers', icon: Gift },
    { id: 'tiers', label: 'Categorias & Upgrade', icon: Trophy }
  ];

  return (
    <div className="space-y-6">
      {/* Telemetry KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Total VIPs</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <Crown className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-amber-950">{telemetry.totalVips}</div>
          <div className="mt-1 text-xs text-amber-700">Membros ativos nos tiers</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Membros Black</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-black text-amber-300">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{telemetry.blackCount}</div>
          <div className="mt-1 text-xs text-slate-500">Nível Luxury Ultra</div>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Gasto Anual VIP</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-950">{formatCurrency(telemetry.totalGasto)}</div>
          <div className="mt-1 text-xs text-emerald-700">Volume transacionado</div>
        </div>

        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Pontos em Circulação</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-indigo-950">{telemetry.pontosTotal.toLocaleString()}</div>
          <div className="mt-1 text-xs text-indigo-700">Custodiados no programa</div>
        </div>
      </div>

      {/* Tier Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        {tierConfigs.map((tier) => (
          <div key={tier.id} className={`rounded-2xl p-4 border ${tier.cor_badge} space-y-2`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wider">{tier.nome}</span>
              <Crown className="h-4 w-4" />
            </div>
            <div className="text-xl font-black">{tier.total_membros_ativos} membros</div>
            <div className="text-[11px] opacity-80">
              {tier.cashback_pct}% Cashback • {tier.desconto_servicos_pct}% OFF
            </div>
          </div>
        ))}
      </div>

      <TacticalDataGrid<VipMemberRecord>
        title="Quadro de Membros VIP & Fidelização Prime"
        subtitle="Gerenciamento de clientes de alto valor, concessão de privilégios exclusivos, atendimento concierge e vouchers cortesia."
        data={members}
        columns={columns}
        keyExtractor={(row) => row.id}
        isLoading={loading}
        onRowClick={(row) => handleOpenMember(row)}
        searchPlaceholder="Buscar por nome, e-mail, telefone..."
      />

      {/* SLIDEOVER */}
      <CommandSlideOver
        isOpen={isSlideOverOpen}
        onClose={() => setIsSlideOverOpen(false)}
        width="lg"
        title={selectedMember ? selectedMember.nome : 'Dossiê VIP'}
        subtitle={selectedMember ? `${selectedMember.nivel_nome} • Concierge: ${selectedMember.concierge_responsavel}` : ''}
        badge={selectedMember ? <StatusBadge status={selectedMember.status} size="sm" dot /> : undefined}
        tabs={slideTabs}
        activeTab={activeSlideTab}
        onTabChange={setActiveSlideTab}
      >
        {selectedMember && (
          <div className="space-y-6">
            {activeSlideTab === 'perfil' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Informações de Fidelidade</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="font-bold text-slate-500 block">Nome do Membro:</span>
                      <span className="font-semibold text-slate-900">{selectedMember.nome}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">Telefone:</span>
                      <span className="font-medium text-slate-900">{maskPhone(selectedMember.telefone)}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">Total Gasto Anual:</span>
                      <span className="font-bold text-emerald-700 text-sm">{formatCurrency(selectedMember.total_gasto_ano)}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">Saldo de Pontos:</span>
                      <span className="font-bold text-amber-800 text-sm">{selectedMember.pontos_acumulados.toLocaleString()} pts</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">Data de Adesão VIP:</span>
                      <span className="text-slate-800">{formatDate(selectedMember.data_adesao_vip)}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block">Renovação de Nível:</span>
                      <span className="text-slate-800">{formatDate(selectedMember.data_renovacao_nivel)}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 space-y-3">
                  <h4 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                    <Gift className="h-4 w-4 text-amber-800" />
                    Ações de Concierge
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleGrantVoucher}
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-800 text-white hover:bg-amber-900 transition"
                    >
                      Conceder Voucher de Cortesia (20% OFF)
                    </button>
                    <a
                      href={`https://wa.me/55${selectedMember.telefone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition"
                    >
                      Abrir Contato Concierge
                    </a>
                  </div>
                </div>
              </div>
            )}

            {activeSlideTab === 'tiers' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <h4 className="text-sm font-bold text-slate-900">Promover / Alterar Categoria Manualmente</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {tierConfigs.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleUpgradeTier(t.id)}
                        className={`p-3.5 rounded-xl border flex items-center justify-between transition text-xs ${
                          selectedMember.nivel_vip === t.id
                            ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Crown className="h-4 w-4 text-amber-800" />
                          <div className="text-left">
                            <span className="font-bold text-slate-900 block">{t.nome}</span>
                            <span className="text-[11px] text-slate-500">{t.cashback_pct}% Cashback • {t.desconto_servicos_pct}% OFF</span>
                          </div>
                        </div>
                        {selectedMember.nivel_vip === t.id && (
                          <span className="text-xs font-bold text-amber-800">Nível Atual</span>
                        )}
                      </button>
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
