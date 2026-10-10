import React, { useState, useMemo } from 'react';
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Eye, Flag, User, Building2, AlertCircle, Download } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { isPast, differenceInDays } from 'date-fns';

interface Props {
  demandas: any[];
  onVerDetalhes: (d: any) => void;
  highlightedId?: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  aberta:                     { label: 'Não Iniciado',      color: 'bg-amber-100 text-amber-700' },
  aguardando_atribuicao:      { label: '📦 Triagem (Pool)',   color: 'bg-indigo-100 text-indigo-700' },
  ativa:                      { label: 'Em Execução',       color: 'bg-blue-100 text-blue-700' },
  em_negociacao:              { label: '💬 Em Negociação',  color: 'bg-yellow-100 text-yellow-800' },
  contraproposta_prestador:   { label: '↩ Contraproposta',  color: 'bg-indigo-100 text-indigo-800' },
  contraproposta_admin_final: { label: '↪ Proposta Final',  color: 'bg-orange-100 text-orange-800' },
  em_analise:                 { label: 'Em Análise',        color: 'bg-violet-100 text-violet-700' },
  em_ajuste:                  { label: 'Em Ajuste',         color: 'bg-orange-100 text-orange-700' },
  concluida:                  { label: 'Concluída',         color: 'bg-emerald-100 text-emerald-700' },
  concluida_interna:          { label: 'Aguardando Finalização (Vendas)',   color: 'bg-emerald-50 text-emerald-700 border border-emerald-100' },
  finalizada:                 { label: 'Concluída',             color: 'bg-emerald-100 text-emerald-700' },
  cancelada:                  { label: 'Cancelada',         color: 'bg-red-100 text-red-700' },
  pendente_aceite:            { label: 'Ag. Aceite',        color: 'bg-yellow-100 text-yellow-700' },
};

const PRIO_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  urgente: { label: 'Urgente', color: 'text-red-600 bg-red-50', icon: '🔴' },
  alta:    { label: 'Alta',    color: 'text-orange-600 bg-orange-50', icon: '🟠' },
  normal:  { label: 'Normal',  color: 'text-blue-600 bg-blue-50', icon: '🔵' },
  baixa:   { label: 'Baixa',   color: 'text-neutral-500 bg-neutral-100', icon: '⚪' },
};

const PAGE_SIZE = 20;
type SortKey = 'created_at' | 'prazo_limite' | 'prioridade' | 'status';

export function DemandasTabela({ demandas, onVerDetalhes }: Props) {
  const [busca, setBusca] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [prioFiltro, setPrioFiltro] = useState('todos');
  const [responsavelFiltro, setResponsavelFiltro] = useState('todos');
  const [prazoFiltro, setPrazoFiltro] = useState('todos');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [pagina, setPagina] = useState(1);

  const agora = new Date();

  const filtradas = useMemo(() => {
    let arr = [...demandas];

    // busca
    if (busca) {
      const b = busca.toLowerCase();
      arr = arr.filter(d =>
        d.id.includes(b) ||
        (d.titulo || '').toLowerCase().includes(b) ||
        (d.descricao || '').toLowerCase().includes(b) ||
        (d.ordem_servico?.cliente?.nome || '').toLowerCase().includes(b) ||
        (d.colaborador?.nome || '').toLowerCase().includes(b) ||
        (d.prestador?.nome_razao || '').toLowerCase().includes(b)
      );
    }

    // status
    if (statusFiltro !== 'todos') arr = arr.filter(d => d.status === statusFiltro);

    // prioridade
    if (prioFiltro !== 'todos') arr = arr.filter(d => d.prioridade === prioFiltro);

    // responsável tipo
    if (responsavelFiltro === 'interno') arr = arr.filter(d => !!d.colaborador_id);
    if (responsavelFiltro === 'externo') arr = arr.filter(d => !!d.prestador_id);
    if (responsavelFiltro === 'pool') arr = arr.filter(d => !d.colaborador_id && !d.prestador_id);

    // prazo
    if (prazoFiltro === 'vencidas') arr = arr.filter(d => d.prazo_limite && isPast(new Date(d.prazo_limite)) && !['concluida', 'concluida_interna', 'finalizada', 'cancelada'].includes(d.status));
    if (prazoFiltro === 'hoje') arr = arr.filter(d => d.prazo_limite && differenceInDays(new Date(d.prazo_limite), agora) === 0);
    if (prazoFiltro === 'semana') arr = arr.filter(d => d.prazo_limite && differenceInDays(new Date(d.prazo_limite), agora) <= 7 && differenceInDays(new Date(d.prazo_limite), agora) >= 0);

    // ordenação
    const PRIO_ORDER: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
    arr.sort((a, b) => {
      let va: any, vb: any;
      if (sortKey === 'prioridade') { va = PRIO_ORDER[a.prioridade || 'normal']; vb = PRIO_ORDER[b.prioridade || 'normal']; }
      else { va = a[sortKey] || ''; vb = b[sortKey] || ''; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return arr;
  }, [demandas, busca, statusFiltro, prioFiltro, responsavelFiltro, prazoFiltro, sortKey, sortDir]);

  const totalPag = Math.ceil(filtradas.length / PAGE_SIZE);
  const pagAtual = filtradas.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
    setPagina(1);
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronDown className="h-3 w-3 text-neutral-300" />;
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-indigo-500" /> : <ChevronDown className="h-3 w-3 text-indigo-500" />;
  };

  const exportCSV = () => {
    const rows = filtradas.map(d => ({
      id: d.id.slice(0, 8).toUpperCase(),
      titulo: d.titulo || d.descricao?.slice(0, 50) || '—',
      status: d.status,
      prioridade: d.prioridade || 'normal',
      cliente: d.ordem_servico?.cliente?.nome || '—',
      responsavel: d.colaborador?.nome || d.prestador?.nome_razao || 'Pool',
      prazo: d.prazo_limite ? format(new Date(d.prazo_limite), 'dd/MM/yyyy HH:mm') : '—',
      criado_em: format(new Date(d.created_at), 'dd/MM/yyyy'),
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(';'), ...rows.map(r => headers.map(h => `"${(r as any)[h]}"`).join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `demandas_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-neutral-200">
        <div className="flex flex-wrap gap-3">
          {/* Busca */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Buscar por título, cliente, responsável..."
              value={busca}
              onChange={e => { setBusca(e.target.value); setPagina(1); }}
              className="w-full rounded-xl bg-neutral-100 pl-9 pr-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <select value={statusFiltro} onChange={e => { setStatusFiltro(e.target.value); setPagina(1); }} className="rounded-xl bg-neutral-100 px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="todos">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <select value={prioFiltro} onChange={e => { setPrioFiltro(e.target.value); setPagina(1); }} className="rounded-xl bg-neutral-100 px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="todos">Toda prioridade</option>
            <option value="urgente">🔴 Urgente</option>
            <option value="alta">🟠 Alta</option>
            <option value="normal">🔵 Normal</option>
            <option value="baixa">⚪ Baixa</option>
          </select>

          <select value={responsavelFiltro} onChange={e => { setResponsavelFiltro(e.target.value); setPagina(1); }} className="rounded-xl bg-neutral-100 px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="todos">Todos</option>
            <option value="interno">Equipe Interna</option>
            <option value="externo">Prestador Externo</option>
            <option value="pool">Pool Central</option>
          </select>

          <select value={prazoFiltro} onChange={e => { setPrazoFiltro(e.target.value); setPagina(1); }} className="rounded-xl bg-neutral-100 px-3 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="todos">Qualquer prazo</option>
            <option value="vencidas">🔴 Vencidas</option>
            <option value="hoje">⚠️ Vencem hoje</option>
            <option value="semana">📅 Esta semana</option>
          </select>

          <button onClick={exportCSV} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white uppercase tracking-widest hover:bg-emerald-700 transition-all">
            <Download className="h-3 w-3" /> CSV
          </button>
        </div>
        <p className="text-[10px] text-neutral-400 mt-2 font-medium">{filtradas.length} demanda(s) encontrada(s)</p>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/70">
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">Código</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">Título</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">Cliente</th>
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">Responsável</th>
                <th
                  className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 cursor-pointer hover:text-indigo-600 transition-colors"
                  onClick={() => toggleSort('prioridade')}
                >
                  <span className="flex items-center gap-1">Prioridade <SortIcon k="prioridade" /></span>
                </th>
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">Status</th>
                <th
                  className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 cursor-pointer hover:text-indigo-600 transition-colors"
                  onClick={() => toggleSort('prazo_limite')}
                >
                  <span className="flex items-center gap-1">Prazo <SortIcon k="prazo_limite" /></span>
                </th>
                <th
                  className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400 cursor-pointer hover:text-indigo-600 transition-colors"
                  onClick={() => toggleSort('created_at')}
                >
                  <span className="flex items-center gap-1">Criação <SortIcon k="created_at" /></span>
                </th>
                <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-neutral-400">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {pagAtual.map(d => {
                const prio = PRIO_CONFIG[d.prioridade || 'normal'];
                const status = STATUS_LABELS[d.status] || { label: d.status, color: 'bg-neutral-100 text-neutral-500' };
                const vencida = d.prazo_limite && isPast(new Date(d.prazo_limite)) && !['concluida', 'concluida_interna', 'finalizada', 'cancelada'].includes(d.status);
                const diasPrazo = d.prazo_limite ? differenceInDays(new Date(d.prazo_limite), agora) : null;

                return (
                  <tr 
                    key={d.id} 
                    id={`demanda-${d.id}`}
                    className={`group transition-colors ${
                      false === d.id 
                        ? 'bg-indigo-50 ring-2 ring-indigo-500 z-10 animate-pulse' 
                        : vencida ? 'bg-red-50/40' : 'hover:bg-neutral-50/70'
                    }`}
                  >
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs font-bold text-neutral-400">#{d.id.slice(0, 6).toUpperCase()}</span>
                    </td>
                    <td className="px-5 py-4 max-w-[180px]">
                      <p className="text-sm font-bold text-neutral-900 truncate">{d.titulo || d.descricao?.slice(0, 35) || '—'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-neutral-600 truncate max-w-[120px]">{d.ordem_servico?.cliente?.nome || '—'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        {d.colaborador_id
                          ? <><User className="h-3.5 w-3.5 text-indigo-400 shrink-0" /><span className="text-sm text-neutral-700 truncate max-w-[100px]">{d.colaborador?.nome || '—'}</span></>
                          : d.prestador_id
                          ? <><Building2 className="h-3.5 w-3.5 text-orange-400 shrink-0" /><span className="text-sm text-neutral-700 truncate max-w-[100px]">{d.prestador?.nome_razao || '—'}</span></>
                          : <span className="text-xs text-neutral-400 italic">Pool</span>
                        }
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`flex items-center w-fit gap-1 text-[10px] font-black px-2 py-1 rounded-full ${prio.color}`}>
                        <Flag className="h-2.5 w-2.5" />{prio.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${status.color}`}>{status.label}</span>
                    </td>
                    <td className="px-5 py-4">
                      {d.prazo_limite ? (
                        <div className={`text-xs font-bold ${vencida ? 'text-red-600' : diasPrazo !== null && diasPrazo <= 1 ? 'text-amber-600' : 'text-neutral-500'}`}>
                          {vencida
                            ? <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3" />Vencida</span>
                            : format(new Date(d.prazo_limite), "dd/MM/yy", { locale: ptBR })
                          }
                        </div>
                      ) : <span className="text-neutral-300 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-neutral-400">{format(new Date(d.created_at), "dd/MM/yy", { locale: ptBR })}</span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => onVerDetalhes(d)}
                        className="h-8 w-8 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-500 hover:bg-indigo-600 hover:text-white transition-all"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {pagAtual.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <Search className="h-10 w-10 text-neutral-200 mx-auto mb-3" />
                    <p className="text-sm text-neutral-400 font-medium">Nenhuma demanda encontrada.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPag > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-neutral-100 bg-neutral-50/50">
            <p className="text-xs text-neutral-400 font-medium">
              {(pagina - 1) * PAGE_SIZE + 1}–{Math.min(pagina * PAGE_SIZE, filtradas.length)} de {filtradas.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina === 1}
                className="h-8 w-8 rounded-lg flex items-center justify-center disabled:opacity-30 hover:bg-neutral-200 transition-all"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(totalPag, 5) }, (_, i) => i + Math.max(1, pagina - 2)).filter(p => p <= totalPag).map(p => (
                <button
                  key={p}
                  onClick={() => setPagina(p)}
                  className={`h-8 w-8 rounded-lg text-xs font-bold transition-all ${p === pagina ? 'bg-indigo-600 text-white' : 'hover:bg-neutral-200 text-neutral-500'}`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPagina(p => Math.min(totalPag, p + 1))}
                disabled={pagina === totalPag}
                className="h-8 w-8 rounded-lg flex items-center justify-center disabled:opacity-30 hover:bg-neutral-200 transition-all"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
