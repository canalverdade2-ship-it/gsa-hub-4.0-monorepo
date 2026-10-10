import { jsPDF } from 'jspdf';
import { openPrivateFile, signedFileUrl } from './storage';

function printable(value: unknown, fallback = '—') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

export function buildContractPdf(contract: Record<string, any>) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const left = 20;
  const pageWidth = 170;
  let y = 24;
  pdf.setTextColor(37, 99, 235);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.text('GSA HUB — SOLUÇÕES DIGITAIS', left, y);
  y += 12;
  pdf.setDrawColor(37, 99, 235);
  pdf.line(left, y, left + pageWidth, y);
  y += 15;
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(15);
  pdf.text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS', left, y);
  y += 12;

  const sections: Array<[string, string]> = [
    ['Identificação', `Contrato: ${printable(contract.code)}\nCliente: ${printable(contract.clientName || contract.client?.name)}\nDocumento: ${printable(contract.clientTax || contract.client?.tax)}`],
    ['Serviço contratado', `Serviço: ${printable(contract.serviceTitle || contract.service?.name)}\nProposta de origem: ${printable(contract.proposalCode || contract.proposal?.code)}`],
    ['Vigência', `Início: ${printable(contract.start || contract.startDate)}\nTérmino: ${printable(contract.end || contract.endDate, 'Indeterminado')}\nPrazo: ${printable(contract.termType)}`],
    ['Valor', `Valor total: ${printable(contract.totalFormatted || contract.total)}\nCondições: ${printable(contract.paymentTerms || contract.paymentCondition)}`],
    ['Condições contratuais', printable(contract.terms || contract.description || contract.clauses, 'As partes concordam com a prestação do serviço descrito neste instrumento e com os valores e prazos aqui apresentados.')]
  ];

  for (const [heading, content] of sections) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(37, 99, 235);
    pdf.text(heading.toUpperCase(), left, y);
    y += 6;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(51, 65, 85);
    const lines = pdf.splitTextToSize(content, pageWidth);
    if (y + lines.length * 5 > 265) { pdf.addPage(); y = 24; }
    pdf.text(lines, left, y);
    y += lines.length * 5 + 8;
  }

  if (y + 24 > 275) { pdf.addPage(); y = 24; }
  pdf.setDrawColor(148, 163, 184);
  pdf.line(left, y + 14, left + 70, y + 14);
  pdf.line(left + 100, y + 14, left + 170, y + 14);
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  pdf.text('GSA HUB', left, y + 20);
  pdf.text(printable(contract.clientName || contract.client?.name, 'Cliente'), left + 100, y + 20);
  pdf.setFontSize(8);
  pdf.text('Documento gerado pela plataforma GSA HUB.', left, 285);
  return pdf;
}

export async function downloadContractPdf(contract: Record<string, any>) {
  if (contract.fileId && !String(contract.fileId).startsWith('mock-')) {
    await openPrivateFile(String(contract.fileId), `${printable(contract.code, 'contrato')}.pdf`);
    return;
  }
  buildContractPdf(contract).save(`${printable(contract.code, 'contrato')}.pdf`);
}

export async function proposalPdfUrl(path: string) {
  return signedFileUrl(path, 300);
}
