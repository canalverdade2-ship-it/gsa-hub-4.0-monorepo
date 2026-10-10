import { formatDate } from '../../../../lib/utils';

/**
 * Exporta um array de objetos para CSV e faz download automático.
 */
export function exportarCSV(dados: Record<string, unknown>[], nomeArquivo: string) {
  if (!dados || dados.length === 0) {
    alert('Nenhum dado disponível para exportar.');
    return;
  }
  const cabecalhos = Object.keys(dados[0]);
  const linhas = dados.map(row =>
    cabecalhos
      .map(k => {
        const val = row[k];
        const str = val === null || val === undefined ? '' : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(';')
  );
  const conteudo = [cabecalhos.join(';'), ...linhas].join('\n');
  const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${nomeArquivo}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Abre o diálogo de impressão para exportar como PDF.
 */
export function exportarPDF() {
  window.print();
}

/**
 * Retorna range de datas (ISO strings) baseado no período selecionado.
 */
export function getRangeDatas(periodo: string, dataInicio?: string, dataFim?: string): { inicio: string; fim: string } {
  const agora = new Date();
  const fimISO = agora.toISOString();

  if (periodo === 'personalizado' && dataInicio && dataFim) {
    return { inicio: new Date(dataInicio).toISOString(), fim: new Date(dataFim + 'T23:59:59').toISOString() };
  }

  let inicio: Date;
  switch (periodo) {
    case 'hoje':
      inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0);
      break;
    case 'semana':
      inicio = new Date(agora);
      inicio.setDate(agora.getDate() - 7);
      break;
    case 'trimestre':
      inicio = new Date(agora);
      inicio.setMonth(agora.getMonth() - 3);
      break;
    case 'semestre':
      inicio = new Date(agora);
      inicio.setMonth(agora.getMonth() - 6);
      break;
    case 'ano':
      inicio = new Date(agora.getFullYear(), 0, 1);
      break;
    case 'mes':
    default:
      inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
      break;
  }

  return { inicio: inicio.toISOString(), fim: fimISO };
}

export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

export function formatarData(data: string | undefined | null): string {
  if (!data) return '—';
  return formatDate(data);
}

export function formatarNumero(n: number): string {
  return new Intl.NumberFormat('pt-BR').format(n || 0);
}
