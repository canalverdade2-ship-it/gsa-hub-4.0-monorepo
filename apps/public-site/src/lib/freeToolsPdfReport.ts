import { jsPDF } from 'jspdf';

export type CalculatorReportMode = 'free' | 'pro';

export interface CalculatorReportRow {
  label: string;
  value: string;
}

export interface CalculatorReportSection {
  title: string;
  rows?: CalculatorReportRow[];
  items?: string[];
  text?: string;
}

export interface CalculatorPdfReport {
  calculator: string;
  mode: CalculatorReportMode;
  headline: string;
  summary: string;
  sections: CalculatorReportSection[];
  disclaimer: string;
}

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 16;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
const FOOTER_Y = 288;

function safeFilePart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function generatedAt() {
  return new Date().toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function createCalculatorPdfDocument(report: CalculatorPdfReport) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const modeLabel = report.mode === 'pro' ? 'RELATORIO COMPLETO - MODO PRO' : 'RELATORIO SIMPLES - MODO FREE';
  let y = 0;

  const drawPageHeader = (firstPage: boolean) => {
    doc.setFillColor(18, 34, 49);
    doc.rect(0, 0, PAGE_WIDTH, firstPage ? 48 : 28, 'F');
    doc.setFillColor(199, 164, 88);
    doc.rect(0, 0, 4, firstPage ? 48 : 28, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(firstPage ? 15 : 11);
    doc.text('GSA HUB', MARGIN, firstPage ? 15 : 12);

    doc.setTextColor(216, 189, 115);
    doc.setFontSize(8);
    doc.text(modeLabel, MARGIN, firstPage ? 23 : 19);

    if (firstPage) {
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(19);
      const titleLines = doc.splitTextToSize(report.calculator, CONTENT_WIDTH - 8);
      doc.text(titleLines, MARGIN, 35);
    }

    y = firstPage ? 58 : 36;
  };

  const ensureSpace = (height: number) => {
    if (y + height <= FOOTER_Y - 8) return;
    doc.addPage();
    drawPageHeader(false);
  };

  const writeParagraph = (text: string, options?: { bold?: boolean; muted?: boolean; size?: number }) => {
    const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
    const lineHeight = 5;
    ensureSpace((lines.length * lineHeight) + 3);
    doc.setFont('helvetica', options?.bold ? 'bold' : 'normal');
    doc.setFontSize(options?.size || 9.5);
    doc.setTextColor(options?.muted ? 92 : 37, options?.muted ? 101 : 49, options?.muted ? 110 : 58);
    doc.text(lines, MARGIN, y);
    y += (lines.length * lineHeight) + 3;
  };

  const writeSectionTitle = (title: string) => {
    ensureSpace(13);
    doc.setDrawColor(199, 164, 88);
    doc.setLineWidth(0.7);
    doc.line(MARGIN, y, MARGIN + 10, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 32);
    doc.text(title, MARGIN + 14, y + 1.5);
    y += 9;
  };

  const writeRow = (row: CalculatorReportRow) => {
    const labelLines = doc.splitTextToSize(row.label, 66);
    const valueLines = doc.splitTextToSize(row.value || '-', 103);
    const rowHeight = Math.max(labelLines.length, valueLines.length) * 5 + 7;
    ensureSpace(rowHeight);

    doc.setFillColor(248, 246, 241);
    doc.setDrawColor(222, 216, 206);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, rowHeight - 2, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(91, 101, 110);
    doc.text(labelLines, MARGIN + 4, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(17, 24, 32);
    doc.text(valueLines, MARGIN + 73, y + 5.5);
    y += rowHeight + 1;
  };

  const writeItems = (items: string[]) => {
    for (const item of items) {
      const lines = doc.splitTextToSize(`- ${item}`, CONTENT_WIDTH - 4);
      const height = lines.length * 5 + 2;
      ensureSpace(height);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(55, 65, 73);
      doc.text(lines, MARGIN + 2, y);
      y += height;
    }
  };

  drawPageHeader(true);

  doc.setFillColor(report.mode === 'pro' ? 239 : 245, report.mode === 'pro' ? 232 : 242, report.mode === 'pro' ? 210 : 235);
  doc.setDrawColor(205, 190, 151);
  const headlineLines = doc.splitTextToSize(report.headline, CONTENT_WIDTH - 10);
  const summaryLines = doc.splitTextToSize(report.summary, CONTENT_WIDTH - 10);
  const summaryHeight = 15 + (headlineLines.length * 6) + (summaryLines.length * 5);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, summaryHeight, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(23, 36, 51);
  doc.text(headlineLines, MARGIN + 5, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(82, 92, 100);
  doc.text(summaryLines, MARGIN + 5, y + 10 + (headlineLines.length * 6));
  y += summaryHeight + 9;

  writeParagraph(`Gerado em ${generatedAt()}.`, { muted: true, size: 8.5 });

  for (const section of report.sections) {
    writeSectionTitle(section.title);
    if (section.text) writeParagraph(section.text);
    for (const row of section.rows || []) writeRow(row);
    if (section.items?.length) writeItems(section.items);
    y += 3;
  }

  writeSectionTitle('Aviso importante');
  writeParagraph(report.disclaimer, { muted: true });
  writeParagraph('Este PDF foi criado localmente no navegador apenas para download. O arquivo e os dados do relatorio nao foram enviados nem armazenados no sistema ou no banco de dados da GSA.', { bold: true, size: 8.5 });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(220, 214, 204);
    doc.line(MARGIN, FOOTER_Y - 2, PAGE_WIDTH - MARGIN, FOOTER_Y - 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110, 118, 124);
    doc.text('GSA HUB - Ferramentas publicas', MARGIN, FOOTER_Y + 2);
    doc.text(`Pagina ${page} de ${pageCount}`, PAGE_WIDTH - MARGIN, FOOTER_Y + 2, { align: 'right' });
  }

  doc.setProperties({
    title: `${report.calculator} - ${modeLabel}`,
    subject: 'Relatorio educativo gerado pelas calculadoras publicas da GSA HUB',
    author: 'GSA HUB',
    creator: 'GSA HUB',
  });

  return doc;
}

export function downloadCalculatorPdf(report: CalculatorPdfReport) {
  const doc = createCalculatorPdfDocument(report);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `gsa-${safeFilePart(report.calculator)}-${report.mode}-${date}.pdf`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
