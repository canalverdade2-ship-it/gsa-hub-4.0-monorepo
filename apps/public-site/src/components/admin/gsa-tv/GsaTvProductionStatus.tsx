import React from 'react';
import { AlertTriangle, Clock3 } from 'lucide-react';

const reasons: Record<string, string> = {
  missing_media: 'Sem vídeo vinculado', missing_file: 'Arquivo não encontrado',
  media_not_approved: 'Conteúdo ainda não liberado', rights_expired_before_end: 'Liberação vence antes do fim do programa',
  overlong: 'Vídeo ultrapassa o horário reservado', underfilled: 'Vídeo não preenche o horário reservado',
  metadata_duration_mismatch: 'Duração cadastrada difere do arquivo', probe_failed: 'Arquivo não passou na verificação',
  gap_or_overlap: 'Intervalo ou sobreposição na grade', day_coverage: 'Grade não cobre toda a janela diária',
  schedule_changed_during_check: 'A grade mudou durante a conferência; uma nova verificação é necessária',
};

export function GsaTvProductionStatus({ audit = [] }: { audit?: any[] }) {
  const last = audit.filter(x => x.action === 'automation_report' && x.resource_id === 'production_readiness')
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  const report = last?.details;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const current = report?.date === today;
  const ready = current && report?.state === 'ready';
  const issues = Array.isArray(report?.issues) ? report.issues : [];
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Prontidão da programação">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="flex items-center gap-2 font-black"><Clock3 className="h-5 w-5 text-indigo-600" />Programação automática</h3>
        <p className="mt-1 text-sm text-slate-500">Produção de madrugada · programação a partir das 06h00 · horário de Brasília</p></div>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
        {ready ? 'Grade verificada' : !report ? 'Sem verificação disponível' : !current ? 'Verificação de outra data' : 'Grade com pendências'}
      </span>
    </div>
    {report ? <>
      <p className="mt-4 text-xs text-slate-500">Edição {report.date} · conferida em {new Date(report.checked_at || last.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
      {issues.length > 0 && <details className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4" open>
        <summary className="cursor-pointer text-sm font-bold text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />{issues.length} pendência(s) na última conferência</summary>
        <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto text-sm text-slate-700">{issues.map((issue: any, index: number) => <li key={`${issue.block || 'grade'}-${issue.issue}-${index}`}>
          <strong>{issue.program || 'Grade diária'}:</strong> {reasons[issue.issue] || 'Verificação pendente'}
        </li>)}</ul>
      </details>}
      <p className="mt-3 text-xs text-slate-500">Esta conferência valida os arquivos e a grade. A confirmação do sinal no ar é exibida no controle de transmissão.</p>
    </> : <p className="mt-4 text-sm text-slate-500">Nenhum relatório foi encontrado no histórico carregado. Atualize para consultar os registros mais recentes.</p>}
  </section>;
}
