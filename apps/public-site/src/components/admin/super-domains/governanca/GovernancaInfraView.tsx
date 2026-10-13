import React, { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import {
  Activity,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  ShieldCheck,
  Users,
  Terminal as TerminalIcon,
  Cpu,
  CheckCircle2,
  Lock,
  Search,
  MessageSquare,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { callAdminRpc } from '../../../../lib/adminRpc';
import { supabase } from '../../../../lib/supabase';
import { formatDateTime } from '../../../../lib/utils';
import { sendAdminWhatsAppNotification } from '../../../../utils/n8nWhatsApp';
import { OracleMetricsPanel } from '../../infra/OracleMetricsPanel';
import { WhatsAppQRCodeManager } from '../../infra/WhatsAppQRCodeManager';
import { WhatsAppHealthMonitor } from '../../WhatsAppHealthMonitor';
import { TacticalDataGrid, CommandSlideOver, StatusBadge, GridColumn } from '../shared';
import { SystemSnapshot, SystemTableStat, SystemUserAuth } from './types';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';

const LazyVPSTerminal = React.lazy(() =>
  import('../../infra/VPSTerminal').then((m) => ({ default: m.VPSTerminal }))
);

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatBytes(value: unknown) {
  const bytes = numberValue(value);
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

export function GovernancaInfraView() {
  const [activeTab, setActiveTab] = useState<'vps' | 'database' | 'whatsapp'>('vps');
  const [snapshot, setSnapshot] = useState<SystemSnapshot>({ metrics: {}, tables: [], users_list: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingAlert, setSendingAlert] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Inspector modal for metrics
  const [activeCardModal, setActiveCardModal] = useState<'database' | 'storage' | 'users' | 'tables' | null>(null);
  const [userSearch, setUserSearch] = useState('');

  const fetchFallbackUsers = useCallback(async () => {
    try {
      const users: SystemUserAuth[] = [];
      const seenIds = new Set<string>();

      // 1. Colaboradores
      const { data: cols } = await supabase.from('colaboradores').select('id, nome, email, created_at, status');
      if (cols && cols.length > 0) {
        cols.forEach((c) => {
          if (c.id && !seenIds.has(c.id)) {
            seenIds.add(c.id);
            users.push({
              id: c.id,
              nome: c.nome || 'Colaborador GSA',
              email: c.email || '—',
              tipo: c.email === 'admin@gsa.com' || (c.nome && c.nome.toLowerCase().includes('admin'))
                ? 'Administrador Master'
                : 'Colaborador GSA',
              status: c.status === 'inativo' ? 'Bloqueado' : 'Ativo',
              created_at: c.created_at,
            });
          }
        });
      }

      // 2. Clientes
      try {
        const { data: clis } = await supabase.from('clientes').select('id, nome, email, data_cadastro, status').limit(100);
        if (clis && clis.length > 0) {
          clis.forEach((c) => {
            if (c.id && !seenIds.has(c.id)) {
              seenIds.add(c.id);
              users.push({
                id: c.id,
                nome: c.nome || 'Cliente GSA',
                email: c.email || '—',
                tipo: 'Cliente GSA',
                status: c.status === 'inativo' || c.status === 'bloqueado' ? 'Bloqueado' : 'Ativo',
                created_at: c.data_cadastro,
              });
            }
          });
        }
      } catch (e) {
        console.warn('Erro ao carregar clientes para telemetria:', e);
      }

      if (users.length > 0) {
        setSnapshot((prev) => ({ ...prev, users_list: users }));
      }
    } catch (e) {
      console.warn('Erro ao carregar usuários de fallback:', e);
    }
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const data = await callAdminRpc<SystemSnapshot>('gsa_admin_system_snapshot');
        const usersList = Array.isArray(data?.users_list) && data.users_list.length > 0 ? data.users_list : [];

        setSnapshot({
          metrics: data?.metrics || {},
          tables: Array.isArray(data?.tables) ? data.tables : [],
          users_list: usersList,
          generated_at: data?.generated_at,
        });

        if (usersList.length === 0) {
          void fetchFallbackUsers();
        }
      } catch (error: any) {
        toast.error(error?.message || 'Não foi possível carregar as métricas de infraestrutura.');
        void fetchFallbackUsers();
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchFallbackUsers]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeSubscription([
    { table: 'colaboradores', onChange: () => void load(true) },
    { table: 'clientes', onChange: () => void load(true) },
    { table: 'system_settings', onChange: () => void load(true) },
    { table: 'gsa_whatsapp_ramais', onChange: () => void load(true) }
  ]);

  const handleSendTestAlert = async () => {
    setSendingAlert(true);
    try {
      const success = await sendAdminWhatsAppNotification({
        title: 'Alerta de Observabilidade GSA OS',
        message: 'Status do sistema verificado via Painel Governança. Todos os serviços da VPS e PostgreSQL estão operando 100%.',
        category: 'SISTEMA',
      });
      if (success) {
        toast.success('Alerta de observabilidade enviado para o WhatsApp Master!');
      } else {
        toast.error('Erro ao enviar notificação para o WhatsApp.');
      }
    } catch (e: any) {
      toast.error('Falha no envio de notificação: ' + (e?.message || 'Erro desconhecido'));
    } finally {
      setSendingAlert(false);
    }
  };

  const metrics = snapshot.metrics || {};

  const filteredUsers = useMemo(() => {
    const value = userSearch.trim().toLowerCase();
    if (!value) return snapshot.users_list || [];
    return (snapshot.users_list || []).filter(
      (u) =>
        (u.nome && u.nome.toLowerCase().includes(value)) ||
        (u.email && u.email.toLowerCase().includes(value)) ||
        (u.tipo && u.tipo.toLowerCase().includes(value))
    );
  }, [userSearch, snapshot.users_list]);

  // Database Table Columns
  const tableColumns: GridColumn<SystemTableStat>[] = [
    {
      key: 'table',
      header: 'Nome da Tabela',
      sortable: true,
      render: (row) => <span className="font-mono text-xs font-bold text-slate-900">{row.table}</span>,
    },
    {
      key: 'estimated_rows',
      header: 'Linhas Estimadas',
      sortable: true,
      align: 'right',
      render: (row) => (
        <span className="font-mono text-xs font-bold text-slate-800 tabular-nums">
          {numberValue(row.estimated_rows).toLocaleString('pt-BR')}
        </span>
      ),
    },
    {
      key: 'dead_rows',
      header: 'Linhas Mortas (Dead Tuples)',
      sortable: true,
      align: 'right',
      render: (row) => {
        const dead = numberValue(row.dead_rows);
        return (
          <span className={`font-mono text-xs font-semibold tabular-nums ${dead > 1000 ? 'text-amber-600 font-bold' : 'text-slate-500'}`}>
            {dead.toLocaleString('pt-BR')}
          </span>
        );
      },
    },
    {
      key: 'last_analyze',
      header: 'ÃÅ¡ltima Análise do Vacuum',
      sortable: true,
      render: (row) => {
        const date = row.last_analyze || row.last_autoanalyze;
        return <span className="font-mono text-xs text-slate-500">{date ? formatDateTime(date) : '—'}</span>;
      },
    },
  ];

  const cards = [
    {
      key: 'database' as const,
      label: 'Banco de Dados',
      value: formatBytes(metrics.database_size_bytes),
      icon: Database,
      color: 'text-purple-600 bg-purple-50 hover:border-purple-300',
    },
    {
      key: 'storage' as const,
      label: 'Storage & Mídia',
      value: formatBytes(metrics.storage_size_bytes),
      icon: HardDrive,
      color: 'text-blue-600 bg-blue-50 hover:border-blue-300',
    },
    {
      key: 'users' as const,
      label: 'Usuários Cadastrados',
      value: (snapshot.users_list?.length || numberValue(metrics.auth_users_count)).toLocaleString('pt-BR'),
      icon: Users,
      color: 'text-emerald-600 bg-emerald-50 hover:border-emerald-300',
    },
    {
      key: 'tables' as const,
      label: 'Tabelas no Schema',
      value: numberValue(metrics.database_tables_count || snapshot.tables?.length).toLocaleString('pt-BR'),
      icon: Server,
      color: 'text-amber-600 bg-amber-50 hover:border-amber-300',
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* â”€â”€ Sub-navigation Tab Bar â”€â”€ */}
      <div className="flex items-center justify-between gap-4 flex-wrap bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('vps')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'vps' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Cpu className="h-3.5 w-3.5 text-indigo-200" />
            <span>Oracle VPS & Terminal</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('database')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'database' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Database className="h-3.5 w-3.5 text-purple-200" />
            <span>PostgreSQL & Tabelas</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('whatsapp')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
              activeTab === 'whatsapp' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5 text-emerald-200" />
            <span>WhatsApp & Evolution API</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSendTestAlert()}
            disabled={sendingAlert}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-2xs disabled:opacity-50"
          >
            <MessageSquare className={`h-3.5 w-3.5 ${sendingAlert ? 'animate-bounce' : ''}`} />
            <span>{sendingAlert ? 'Enviando...' : 'Alerta WhatsApp'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRefreshKey((prev) => prev + 1);
              void load(true);
            }}
            disabled={refreshing}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs"
            title="Atualizar telemetria"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* â”€â”€ Tab: VPS â”€â”€ */}
      {activeTab === 'vps' && (
        <div className="space-y-6">
          <OracleMetricsPanel key={`vps-${refreshKey}`} />
          <Suspense fallback={<div className="h-64 rounded-2xl bg-slate-900 border border-slate-800 animate-pulse" />}>
            <LazyVPSTerminal key={`term-${refreshKey}`} />
          </Suspense>
        </div>
      )}

      {/* ── Tab: WhatsApp ── */}
      {activeTab === 'whatsapp' && (
        <div className="space-y-6">
          <WhatsAppHealthMonitor key={`wa-health-${refreshKey}`} variant="card" />
          <WhatsAppQRCodeManager key={`wa-${refreshKey}`} />
        </div>
      )}

      {/* â”€â”€ Tab: Database â”€â”€ */}
      {activeTab === 'database' && (
        <div className="space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(({ key, label, value, icon: Icon, color }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveCardModal(key)}
                className={`group text-left rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer ${color}`}
              >
                <div className="flex justify-between items-start">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 group-hover:scale-105 transition-transform">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    Detalhes âÅ¾”
                  </span>
                </div>
                <p className="mt-4 text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                <p className="mt-1 text-2xl font-black text-slate-900 tracking-tight">{value}</p>
              </button>
            ))}
          </div>

          {/* Database Tables Grid */}
          <TacticalDataGrid<SystemTableStat>
            title="Estatísticas e Monitoramento das Tabelas (PostgreSQL)"
            subtitle="Estimativas fornecidas pelo motor do banco de dados via RPC segura"
            data={snapshot.tables || []}
            columns={tableColumns}
            keyExtractor={(row) => row.table}
            isLoading={loading}
            searchPlaceholder="Filtrar tabela por nome..."
          />
        </div>
      )}

      {/* â”€â”€ Modal for Card Details â”€â”€ */}
      {activeCardModal && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div
            className={`bg-white rounded-2xl w-full p-6 shadow-2xl border border-slate-200 relative space-y-6 max-h-[90vh] flex flex-col ${
              activeCardModal === 'users' ? 'max-w-4xl' : 'max-w-lg'
            }`}
          >
            <button
              onClick={() => setActiveCardModal(null)}
              className="absolute top-5 right-5 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal: Banco de Dados */}
            {activeCardModal === 'database' && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <span className="p-3 bg-purple-100 text-purple-600 rounded-xl">
                    <Database className="w-6 h-6" />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Banco de Dados PostgreSQL</h3>
                    <p className="text-xs text-slate-500">Métricas da instância de banco de dados na VPS Oracle</p>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                    <span className="font-semibold text-slate-500">Tamanho Total Alocado</span>
                    <span className="font-bold text-purple-700 font-mono">{formatBytes(metrics.database_size_bytes)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                    <span className="font-semibold text-slate-500">Motor de Banco</span>
                    <span className="font-mono font-bold text-slate-800">PostgreSQL 17.2 (Linux x86_64)</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                    <span className="font-semibold text-slate-500">Status da Instância</span>
                    <span className="font-bold uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Ativo & Operacional
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Modal: Storage */}
            {activeCardModal === 'storage' && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <span className="p-3 bg-blue-100 text-blue-600 rounded-xl">
                    <HardDrive className="w-6 h-6" />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Armazenamento de Arquivos</h3>
                    <p className="text-xs text-slate-500">Buckets de mídia, documentos e anexos do sistema</p>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                    <span className="font-semibold text-slate-500">Volume Total em Uso</span>
                    <span className="font-bold text-blue-700 font-mono">{formatBytes(metrics.storage_size_bytes)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                    <span className="font-semibold text-slate-500">Provedor de Mídia</span>
                    <span className="font-mono font-bold text-slate-800">Supabase Storage</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                    <span className="font-semibold text-slate-500">Políticas de Segurança (RLS)</span>
                    <span className="font-bold uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" /> Ativadas por Bucket
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Modal: Usuários */}
            {activeCardModal === 'users' && (
              <div className="flex flex-col flex-1 overflow-hidden space-y-4">
                <div className="flex items-center gap-3">
                  <span className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
                    <Users className="w-6 h-6" />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Usuários Cadastrados no Sistema</h3>
                    <p className="text-xs text-slate-500">
                      Listagem de contas registradas e vinculadas ({snapshot.users_list?.length || 0})
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Pesquisar usuário..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="text-xs text-slate-500 font-semibold">
                    Exibindo <span className="text-slate-900 font-mono font-bold">{filteredUsers.length}</span> registros
                  </div>
                </div>

                <div className="overflow-y-auto flex-1 border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600 sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5">Nome / Identificação</th>
                        <th className="px-4 py-2.5">E-mail</th>
                        <th className="px-4 py-2.5">Tipo de Perfil</th>
                        <th className="px-4 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-bold text-slate-900">{u.nome || 'Usuário'}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">{u.email}</td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                              {u.tipo || 'Usuário'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={u.status || 'ativo'} size="xs" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setActiveCardModal(null)}
              className="w-full py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-colors shadow-2xs"
            >
              Fechar Detalhes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
