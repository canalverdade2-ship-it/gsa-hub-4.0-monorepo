import React, { useMemo } from 'react';
import { Clock, User, Building2, Flag, AlertCircle, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { differenceInDays, isPast } from 'date-fns';

interface Props {
  demandas: any[];
  onVerDetalhes: (d: any) => void;
  highlightedId?: string | null;
}

const STATUS_COLS = [
  { id: 'aberta',      label: 'Não Iniciado', color: 'bg-amber-500',   header: 'bg-amber-50  border-amber-200',  ids: ['aberta', 'aguardando_atribuicao'] },
  { id: 'negociacao',  label: '💬 Negociação', color: 'bg-yellow-500',  header: 'bg-yellow-50 border-yellow-200', ids: ['em_negociacao', 'contraproposta_prestador', 'contraproposta_admin_final'] },
  { id: 'ativa',       label: 'Em Execução',  color: 'bg-blue-500',    header: 'bg-blue-50   border-blue-200',   ids: ['ativa'] },
  { id: 'em_analise',  label: 'Em Análise',   color: 'bg-violet-500',  header: 'bg-violet-50 border-violet-200', ids: ['em_analise'] },
  { id: 'em_ajuste',   label: 'Em Ajuste',    color: 'bg-orange-500',  header: 'bg-orange-50 border-orange-200', ids: ['em_ajuste'] },
  { id: 'concluida',   label: 'Concluída',    color: 'bg-emerald-500', header: 'bg-emerald-50 border-emerald-200', ids: ['concluida', 'finalizada', 'concluida_interna'] },
];

const PRIO_CONFIG: Record<string, { label: string; badge: string; dot: string }> = {
  urgente: { label: 'Urgente', badge: 'bg-red-100 text-red-700',    dot: 'bg-red-500 animate-pulse' },
  alta:    { label: 'Alta',    badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  normal:  { label: 'Normal',  badge: 'bg-blue-100 text-blue-700',  dot: 'bg-blue-400' },
  baixa:   { label: 'Baixa',   badge: 'bg-neutral-100 text-neutral-500', dot: 'bg-neutral-300' },
};

function PrazoIndicator({ prazo }: { prazo?: string }) {
  if (!prazo) return null;
  const dt = new Date(prazo);
  const dias = differenceInDays(dt, new Date());
  const vencida = isPast(dt);

  if (vencida) return <span className="flex items-center gap-1 text-[9px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-full"><AlertCircle className="h-2.5 w-2.5"/>Vencida</span>;
  if (dias === 0) return <span className="flex items-center gap-1 text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">⚠️ Hoje</span>;
  if (dias <= 2) return <span className="text-[9px] font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">{dias}d restante</span>;
  return <span className="text-[9px] font-medium text-neutral-400">{format(dt, 'dd/MM', { locale: ptBR })}</span>;
}

export function DemandasKanban({ demandas, onVerDetalhes }: Props) {
  const byStatus = useMemo(() => {
    const map: Record<string, any[]> = {};
    STATUS_COLS.forEach(col => { map[col.id] = []; });
    demandas.forEach(d => {
      if (d.status === 'cancelada') return; // Filtra canceladas do Kanban
      const col = STATUS_COLS.find(c => c.ids.includes(d.status));
      if (col) map[col.id].push(d);
      else map['aberta'].push(d); // fallback
    });
    return map;
  }, [demandas]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
      {STATUS_COLS.map(col => {
        const cards = byStatus[col.id] || [];
        const vencidas = cards.filter(d => d.prazo_limite && isPast(new Date(d.prazo_limite))).length;
        const temContraproposta = col.id === 'negociacao' && cards.some(d => d.status === 'contraproposta_prestador');
        return (
          <div key={col.id} className="flex flex-col shrink-0 w-72">
            {/* Column header */}
            <div className={`rounded-2xl border ${col.header} p-3 mb-3 ${temContraproposta ? 'ring-2 ring-yellow-400 animate-pulse' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                  <span className="text-xs font-black text-neutral-700 uppercase tracking-widest">{col.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  {vencidas > 0 && <span className="text-[9px] font-black bg-red-500 text-white px-2 py-0.5 rounded-full">{vencidas}🔴</span>}
                  <span className="text-xs font-black text-neutral-500 bg-white/70 px-2 py-0.5 rounded-full">{cards.length}</span>
                </div>
              </div>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-3 flex-1 min-h-[200px]">
              {cards.length === 0 && (
                <div className="flex-1 rounded-2xl border-2 border-dashed border-neutral-200 flex items-center justify-center">
                  <p className="text-xs text-neutral-300 font-bold">Vazio</p>
                </div>
              )}
              {cards.map(d => {
                const prio = PRIO_CONFIG[d.prioridade || 'normal'];
                const vencida = d.prazo_limite && isPast(new Date(d.prazo_limite)) && d.status !== 'concluida';
                return (
                  <div
                    key={d.id}
                    id={`demanda-${d.id}`}
                    className={`rounded-2xl bg-white shadow-sm ring-1 p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group ${
                      false === d.id 
                        ? 'ring-indigo-500 bg-indigo-50/50 scale-[1.02] z-10 shadow-xl border-indigo-500 animate-pulse' 
                        : vencida ? 'ring-red-300 bg-red-50/50' : 'ring-neutral-200 hover:ring-indigo-200'
                    }`}
                    onClick={() => onVerDetalhes(d)}
                  >
                    {/* Top */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${prio.dot}`} />
                        <p className="text-xs font-black text-neutral-800 truncate">
                          {d.titulo || d.descricao?.slice(0, 40) || `#${d.id.slice(0, 6).toUpperCase()}`}
                        </p>
                      </div>
                      <button className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0">
                        <Eye className="h-3 w-3 text-neutral-500" />
                      </button>
                    </div>

                    {/* Cliente */}
                    <p className="text-[10px] text-neutral-500 font-medium mb-2 truncate">
                      {d.ordem_servico?.cliente?.nome || '—'}
                    </p>

                    {/* Tags */}
                    <div className="flex items-center flex-wrap gap-1.5 mb-3">
                      <span className={`flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full ${prio.badge}`}>
                        <Flag className="h-2.5 w-2.5" />{prio.label}
                      </span>
                      <PrazoIndicator prazo={d.prazo_limite} />
                      {d.total_comentarios > 0 && (
                        <span className="text-[9px] text-neutral-400 font-bold">💬 {d.total_comentarios}</span>
                      )}
                    </div>

                    {/* Responsável */}
                    <div className="flex items-center gap-1.5 pt-2 border-t border-neutral-100">
                      {d.colaborador_id ? (
                        <><User className="h-3 w-3 text-indigo-400" /><span className="text-[10px] font-bold text-neutral-600 truncate">{d.colaborador?.nome || 'Colaborador'}</span></>
                      ) : d.prestador_id ? (
                        <><Building2 className="h-3 w-3 text-orange-400" /><span className="text-[10px] font-bold text-neutral-600 truncate">{d.prestador?.nome_razao || 'Prestador'}</span></>
                      ) : (
                        <><Clock className="h-3 w-3 text-neutral-300" /><span className="text-[10px] text-neutral-400">Pool Central</span></>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
