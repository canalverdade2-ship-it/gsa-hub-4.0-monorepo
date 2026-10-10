import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Users, UserPlus, Search, Filter, RefreshCw, 
  Download, Eye, Star, Phone, Mail, Building2, 
  ShieldCheck, AlertTriangle, CheckCircle, XCircle 
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { TacticalDataGrid, GridColumn, StatusBadge } from '../shared';
import { PrestadorDetailDrawer, PrestadorItem } from './PrestadorDetailDrawer';
import { NovoPrestadorDrawer } from './NovoPrestadorDrawer';
import { supabase } from '../../../../lib/supabase';
import { formatCurrency, formatDate, maskCPF, maskCNPJ, maskPhone } from '../../../../lib/utils';
import { useRealtimeSubscription } from '../../../../hooks/useRealtime';

export interface PrestadoresSectionProps {
  initialItemId?: string | null;
  colaboradorId?: string | null;
  colaboradorNome?: string | null;
}

export function PrestadoresSection({
  initialItemId,
  colaboradorId,
  colaboradorNome
}: PrestadoresSectionProps) {
  const [prestadores, setPrestadores] = useState<PrestadorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [selectedPrestador, setSelectedPrestador] = useState<PrestadorItem | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [isNewDrawerOpen, setIsNewDrawerOpen] = useState(false);

  const fetchPrestadores = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('prestadores')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPrestadores(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar prestadores:', err);
      toast.error('Erro ao carregar lista de prestadores.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrestadores();
  }, [fetchPrestadores]);

  useRealtimeSubscription({ table: 'prestadores', onChange: fetchPrestadores });

  // Handle deep-link opening
  useEffect(() => {
    if (initialItemId && prestadores.length > 0) {
      const match = prestadores.find((p) => p.id === initialItemId);
      if (match) {
        setSelectedPrestador(match);
        setIsDetailDrawerOpen(true);
      }
    }
  }, [initialItemId, prestadores]);

  const filteredData = useMemo(() => {
    if (statusFilter === 'todos') return prestadores;
    if (statusFilter === 'pendentes') {
      return prestadores.filter((p) => ['pendente', 'em_analise', 'suspenso', 'reprovado'].includes(p.status));
    }
    return prestadores.filter((p) => p.status === statusFilter);
  }, [prestadores, statusFilter]);

  const handleRowClick = (row: PrestadorItem) => {
    setSelectedPrestador(row);
    setIsDetailDrawerOpen(true);
  };

  const columns: GridColumn<PrestadorItem>[] = [
    {
      key: 'nome_razao',
      header: 'Prestador / Razão Social',
      sortable: true,
      render: (row) => (
        <div className="flex flex-col">
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            {row.nome_razao}
            {row.status === 'ativo' && (
              <span title="Prestador Homologado">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 flex items-center gap-2">
            <span className="font-mono">{row.tipo_cadastro.toUpperCase()}: {row.documento.length > 11 ? maskCNPJ(row.documento) : maskCPF(row.documento)}</span>
            {row.nome_responsavel && <span>• Resp: {row.nome_responsavel}</span>}
          </div>
        </div>
      )
    },
    {
      key: 'area_servico',
      header: 'Especialidade / Área',
      sortable: true,
      width: '180px',
      render: (row) => (
        <span className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
          {row.area_servico || 'Geral / Multisserviços'}
        </span>
      )
    },
    {
      key: 'contato',
      header: 'Contato Principal',
      render: (row) => (
        <div className="text-xs text-slate-600 space-y-0.5">
          <div className="flex items-center gap-1">
            <Phone className="h-3 w-3 text-slate-400" />
            <span>{maskPhone(row.telefone)}</span>
          </div>
          {row.email && (
            <div className="flex items-center gap-1 text-[11px] text-slate-500 truncate max-w-[180px]">
              <Mail className="h-3 w-3 text-slate-400" />
              <span className="truncate">{row.email}</span>
            </div>
          )}
        </div>
      )
    },
    {
      key: 'saldo_carteira',
      header: 'Saldo Carteira',
      sortable: true,
      align: 'right',
      width: '140px',
      render: (row) => (
        <div className="font-mono font-bold text-slate-900 tabular-nums">
          {formatCurrency(row.saldo_carteira || 0)}
        </div>
      )
    },
    {
      key: 'avaliacao_media',
      header: 'Avaliação',
      sortable: true,
      align: 'center',
      width: '110px',
      render: (row) => (
        <div className="inline-flex items-center gap-1 font-bold text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          <span>{row.avaliacao_media ? row.avaliacao_media.toFixed(1) : '5.0'}</span>
        </div>
      )
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      width: '130px',
      render: (row) => <StatusBadge status={row.status} size="sm" />
    },
    {
      key: 'acoes',
      header: 'Ações',
      align: 'center',
      width: '90px',
      render: (row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleRowClick(row);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
        >
          <Eye className="h-3.5 w-3.5 text-slate-500" />
          Ver
        </button>
      )
    }
  ];

  const filterChips = [
    { id: 'todos', label: 'Todos os Prestadores', count: prestadores.length },
    { id: 'ativo', label: 'Ativos / Homologados', count: prestadores.filter((p) => p.status === 'ativo').length },
    { id: 'pendentes', label: 'Pendentes / Revisão', count: prestadores.filter((p) => ['pendente', 'em_analise', 'suspenso', 'reprovado'].includes(p.status)).length },
    { id: 'desligado', label: 'Desligados', count: prestadores.filter((p) => p.status === 'desligado').length }
  ];

  return (
    <div className="space-y-4">
      {/* Top action toolbar & status filter chips */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {filterChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setStatusFilter(chip.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                statusFilter === chip.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{chip.label}</span>
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${statusFilter === chip.id ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {chip.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchPrestadores}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            title="Atualizar lista"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={() => setIsNewDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 uppercase tracking-wider active:scale-[0.99]"
          >
            <UserPlus className="h-4 w-4" />
            <span>Novo Prestador</span>
          </button>
        </div>
      </div>

      {/* Main Tactical Grid */}
      <TacticalDataGrid<PrestadorItem>
        title="Diretório de Prestadores de Serviços"
        subtitle="Quadro tático de homologação, alocação operacional, pontuação e retenção de terceiros"
        data={filteredData}
        columns={columns}
        keyExtractor={(item) => item.id}
        onRowClick={handleRowClick}
        isLoading={loading}
        pageSize={15}
        searchPlaceholder="Buscar por nome, documento, telefone, área..."
      />

      {/* Detail SlideOver Drawer */}
      <PrestadorDetailDrawer
        isOpen={isDetailDrawerOpen}
        onClose={() => {
          setIsDetailDrawerOpen(false);
          setSelectedPrestador(null);
        }}
        prestador={selectedPrestador}
        onUpdated={fetchPrestadores}
        colaboradorId={colaboradorId}
        colaboradorNome={colaboradorNome}
      />

      {/* New Prestador Drawer */}
      <NovoPrestadorDrawer
        isOpen={isNewDrawerOpen}
        onClose={() => setIsNewDrawerOpen(false)}
        onSuccess={fetchPrestadores}
        colaboradorId={colaboradorId}
        colaboradorNome={colaboradorNome}
      />
    </div>
  );
}
