import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate, formatDateTime, maskCPF, maskCNPJ, maskPhone } from './utils';
import { Orcamento, OS, Fatura, Empresa } from '../types';
import { supabase } from './supabase';

// ─── Interfaces para os PDFs ──────────────────────────────────────────────────
export interface PdfEmpresa {
  razao_social?: string;
  nome?: string;
  cnpj?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
}

export interface PdfCliente {
  nome?: string;
  cpf?: string;
  cnpj?: string;
  codigo_cliente?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
}

export interface PdfItem {
  nome?: string;
  descricao?: string;
}

export interface PdfOrcamento {
  servicos?: { nome?: string };
  valor_servico?: number;
  valor_adicional?: number;
  descricao_adicional?: string;
  acrescimo?: number;
  desconto?: number;
  total?: number;
}

export interface PdfOS {
  codigo_os?: string;
  orcamentos?: PdfOrcamento;
}

export interface PdfFaturaItem {
  descricao?: string;
  valor?: number;
  quantidade?: number;
  subtotal?: number;
}

// ─── Design Tokens & Color Palette ────────────────────────────────────────────
const COLOR = {
  primary:      [15,  23,  42]  as [number, number, number],  // Slate-900 (#0F172A)
  secondary:    [30,  41,  59]  as [number, number, number],  // Slate-800 (#1E293B)
  accent:       [79,  70,  229] as [number, number, number],  // Indigo-600 (#4F46E5)
  accentLight:  [245, 247, 255] as [number, number, number],  // Indigo-50 (#F5F7FF)
  accentBorder: [224, 231, 255] as [number, number, number],  // Indigo-100 (#E0E7FF)
  gold:         [193, 154,  67] as [number, number, number],  // Brand Gold (#C19A43)
  goldBg:       [254, 252, 232] as [number, number, number],  // Amber-50 (#FEFCE8)
  
  // Status semânticos
  success:      [16,  185, 129] as [number, number, number],  // Emerald-600 (#10B981)
  successBg:    [236, 253, 245] as [number, number, number],  // Emerald-50 (#ECFDF5)
  warning:      [217, 119,   6] as [number, number, number],  // Amber-600 (#D97706)
  warningBg:    [255, 251, 235] as [number, number, number],  // Amber-50 (#FFFBEB)
  danger:       [220,  38,  38] as [number, number, number],  // Red-600 (#DC2626)
  dangerBg:     [254, 242, 242] as [number, number, number],  // Red-50 (#FEF2F2)
  
  // Superfícies e Tipografia
  textDark:     [15,  23,  42]  as [number, number, number],  // Slate-900
  textBody:     [51,  65,  85]  as [number, number, number],  // Slate-700
  textMuted:    [100, 116, 139] as [number, number, number],  // Slate-500
  textLight:    [148, 163, 184] as [number, number, number],  // Slate-400
  
  surface:      [248, 250, 252] as [number, number, number],  // Slate-50 (#F8FAFC)
  surfaceAlt:   [241, 245, 249] as [number, number, number],  // Slate-100 (#F1F5F9)
  border:       [226, 232, 240] as [number, number, number],  // Slate-200 (#E2E8F0)
  white:        [255, 255, 255] as [number, number, number],
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Busca informações da empresa de forma segura e com fallback */
async function fetchEmpresaInfo(): Promise<PdfEmpresa | null> {
  try {
    if (supabase && typeof supabase.from === 'function') {
      const { data, error } = await supabase.from('empresa').select('*').limit(1).maybeSingle();
      if (!error && data) return data;
    }
  } catch (e) {
    // Fallback silencioso
  }
  return {
    razao_social: 'GRUPO GSA GESTÃO DE SERVIÇOS',
    nome: 'GRUPO GSA',
    cnpj: '53.217.297/0001-08',
    telefone: '(11) 92085-7754',
    email: 'contato@grupogsa.com.br',
    endereco: 'São Paulo, SP'
  };
}

function checkPageBreak(doc: jsPDF, y: number, neededH: number): number {
  if (y + neededH > PAGE_H - 20) {
    doc.addPage();
    return 18;
  }
  return y;
}

/** Trunca texto para caber em maxW (em mm) com a fonte/size ativa */
function truncate(doc: jsPDF, text: string, maxW: number): string {
  if (!text) return '—';
  while (doc.getTextWidth(text) > maxW && text.length > 3) {
    text = text.slice(0, -4) + '…';
  }
  return text;
}

/** Formata dados automaticamente (CPF, CNPJ, Telefone) */
function formatSmartValue(label: string, value?: string | null): string {
  if (!value || value === '–' || value === '-') return '—';
  const clean = String(value).trim();
  const lower = label.toLowerCase();
  
  if (lower.includes('cpf') && /^\d{11}$/.test(clean.replace(/\D/g, ''))) {
    return maskCPF(clean);
  }
  if (lower.includes('cnpj') && /^\d{14}$/.test(clean.replace(/\D/g, ''))) {
    return maskCNPJ(clean);
  }
  if ((lower.includes('cpf') || lower.includes('cnpj')) && clean.replace(/\D/g, '').length === 11) {
    return maskCPF(clean);
  }
  if ((lower.includes('cpf') || lower.includes('cnpj')) && clean.replace(/\D/g, '').length === 14) {
    return maskCNPJ(clean);
  }
  if ((lower.includes('telefone') || lower.includes('tel') || lower.includes('whatsapp')) && clean.replace(/\D/g, '').length >= 10) {
    return maskPhone(clean);
  }
  return clean;
}

/**
 * Desenha o logotipo / monograma vetorial GSA HUB de alta precisão
 */
function drawVectorLogo(doc: jsPDF, x: number, y: number, size = 12) {
  // Fundo do brasão / badge arredondado
  doc.setFillColor(...COLOR.primary);
  doc.roundedRect(x, y, size, size, 2.5, 2.5, 'F');

  // Borda sutil dourada/indigo
  doc.setDrawColor(...COLOR.gold);
  doc.setLineWidth(0.4);
  doc.roundedRect(x, y, size, size, 2.5, 2.5, 'S');

  // Monograma "GSA"
  doc.setTextColor(...COLOR.gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(size * 0.45);
  doc.text('GSA', x + size / 2, y + size * 0.58, { align: 'center' });

  // Sub-tag "HUB"
  doc.setFontSize(size * 0.22);
  doc.setTextColor(255, 255, 255);
  doc.text('HUB', x + size / 2, y + size * 0.86, { align: 'center' });
}

/** Badge de status estilizado */
function drawStatusPill(doc: jsPDF, status: string, x: number, y: number, alignRight = false): number {
  const statusMap: Record<string, { label: string; bg: [number,number,number]; fg: [number,number,number] }> = {
    pago:               { label: 'PAGO',               bg: COLOR.successBg, fg: COLOR.success },
    aprovado:           { label: 'APROVADO',           bg: COLOR.successBg, fg: COLOR.success },
    concluido:          { label: 'CONCLUÍDO',          bg: COLOR.successBg, fg: COLOR.success },
    ativo:              { label: 'ATIVO',              bg: COLOR.successBg, fg: COLOR.success },
    pendente:           { label: 'PENDENTE',           bg: COLOR.warningBg, fg: COLOR.warning },
    pendente_pagamento: { label: 'AG. PAGAMENTO',     bg: COLOR.warningBg, fg: COLOR.warning },
    em_andamento:       { label: 'EM ANDAMENTO',       bg: COLOR.warningBg, fg: COLOR.warning },
    em_aberto:          { label: 'EM ABERTO',          bg: COLOR.accentLight, fg: COLOR.accent },
    aberto:             { label: 'ABERTO',             bg: COLOR.accentLight, fg: COLOR.accent },
    vencida:            { label: 'VENCIDA',            bg: COLOR.dangerBg,  fg: COLOR.danger  },
    cancelado:          { label: 'CANCELADO',          bg: COLOR.dangerBg,  fg: COLOR.danger  },
    rejeitado:          { label: 'REJEITADO',          bg: COLOR.dangerBg,  fg: COLOR.danger  },
  };
  
  const rawStatus = (status || 'aberto').toLowerCase().replace(/\s+/g, '_');
  const cfg = statusMap[rawStatus] || { label: (status || 'ABERTO').toUpperCase(), bg: COLOR.surfaceAlt, fg: COLOR.textMuted };
  
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  const tw = doc.getTextWidth(cfg.label) + 7;
  const pillW = Math.max(tw, 18);
  const pillH = 5.8;
  const drawX = alignRight ? x - pillW : x;

  // Fundo da pílula
  doc.setFillColor(...cfg.bg);
  doc.roundedRect(drawX, y, pillW, pillH, 1.8, 1.8, 'F');
  
  // Borda fina
  doc.setDrawColor(...cfg.fg);
  doc.setLineWidth(0.2);
  doc.roundedRect(drawX, y, pillW, pillH, 1.8, 1.8, 'S');

  // Ponto colorido indicador
  doc.setFillColor(...cfg.fg);
  doc.circle(drawX + 3, y + pillH / 2, 0.8, 'F');

  // Texto
  doc.setTextColor(...cfg.fg);
  doc.text(cfg.label, drawX + 5.2, y + 4.1);

  return pillW;
}

/**
 * Desenha o cabeçalho executivo moderno (Clean & High-Contrast).
 * Retorna a posição Y pronta para o início do conteúdo.
 */
function drawHeader(
  doc: jsPDF,
  empresa: PdfEmpresa | null | undefined,
  docType: string,
  docCode: string,
  docDate: string,
  status?: string
): number {
  // 1. Faixa geométrica de destaque no topo da página (3.5mm)
  doc.setFillColor(...COLOR.primary);
  doc.rect(0, 0, PAGE_W, 3.5, 'F');
  doc.setFillColor(...COLOR.accent);
  doc.rect(PAGE_W * 0.45, 0, PAGE_W * 0.55, 3.5, 'F');

  const startY = 11;

  // 2. Logotipo vetorial
  drawVectorLogo(doc, MARGIN, startY, 13);

  // 3. Informações da Empresa (Lado Esquerdo)
  const leftTextX = MARGIN + 16;
  const companyName = empresa?.razao_social || empresa?.nome || 'GRUPO GSA GESTÃO DE SERVIÇOS';
  
  doc.setTextColor(...COLOR.primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text(truncate(doc, companyName.toUpperCase(), 90), leftTextX, startY + 4);

  // Metadados da empresa em linha / coluna compacta
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR.textMuted);

  let metaY = startY + 8.2;
  const cnpjText = empresa?.cnpj ? `CNPJ: ${maskCNPJ(empresa.cnpj)}` : 'CNPJ: 53.217.297/0001-08';
  const telText = empresa?.telefone ? `Tel: ${maskPhone(empresa.telefone)}` : 'Tel: (11) 92085-7754';
  doc.text(`${cnpjText}   •   ${telText}`, leftTextX, metaY);

  if (empresa?.email || empresa?.endereco) {
    metaY += 3.8;
    const locationText = empresa.email || empresa.endereco || '';
    doc.text(truncate(doc, locationText, 90), leftTextX, metaY);
  }

  // 4. Bloco de Identificação do Documento (Lado Direito)
  const rightX = PAGE_W - MARGIN;

  // Tag do tipo de documento
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  const typeLabel = docType.toUpperCase();
  const typeTagW = doc.getTextWidth(typeLabel) + 8;
  
  doc.setFillColor(...COLOR.accentLight);
  doc.roundedRect(rightX - typeTagW, startY - 0.5, typeTagW, 6, 1.5, 1.5, 'F');
  doc.setDrawColor(...COLOR.accentBorder);
  doc.setLineWidth(0.2);
  doc.roundedRect(rightX - typeTagW, startY - 0.5, typeTagW, 6, 1.5, 1.5, 'S');

  doc.setTextColor(...COLOR.accent);
  doc.text(typeLabel, rightX - typeTagW / 2, startY + 3.8, { align: 'center' });

  // Status Badge ao lado se couber ou logo abaixo
  if (status) {
    drawStatusPill(doc, status, rightX - typeTagW - 3, startY - 0.5, true);
  }

  // Código do Documento em destaque
  doc.setTextColor(...COLOR.primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(docCode, rightX, startY + 11.5, { align: 'right' });

  // Data de Emissão
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR.textMuted);
  doc.text(`Emissão: ${docDate}`, rightX, startY + 15.5, { align: 'right' });

  // 5. Linha divisória sutil na base do cabeçalho
  const lineY = startY + 18.5;
  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, lineY, PAGE_W - MARGIN, lineY);

  return lineY + 6; // Y de início do conteúdo
}

/** Rodapé profissional em todas as páginas */
function drawFooter(doc: jsPDF, empresa: PdfEmpresa | null | undefined) {
  const pages = (doc as any).internal.getNumberOfPages();
  const companyLabel = empresa?.razao_social || empresa?.nome || 'GRUPO GSA GESTÃO DE SERVIÇOS';

  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const footerY = PAGE_H - 12;

    // Linha separadora
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, footerY, PAGE_W - MARGIN, footerY);

    // Texto institucional (Esquerda)
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLOR.textMuted);
    doc.text(`${companyLabel}  •  Autenticação Digital`, MARGIN, footerY + 5);

    // Carimbo de emissão (Centro)
    doc.text(`Emitido em: ${formatDateTime(new Date().toISOString())}`, PAGE_W / 2, footerY + 5, { align: 'center' });

    // Numeração de página (Direita)
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLOR.textBody);
    doc.text(`Página ${i} de ${pages}`, PAGE_W - MARGIN, footerY + 5, { align: 'right' });
  }
}

/** Título de seção moderno com pílula de destaque */
function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  // Pílula vertical accent
  doc.setFillColor(...COLOR.accent);
  doc.roundedRect(MARGIN, y, 2.2, 5.5, 0.8, 0.8, 'F');

  // Texto do título
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLOR.primary);
  const titleText = title.toUpperCase();
  doc.text(titleText, MARGIN + 4.5, y + 4.2);

  // Linha de suporte suave à direita
  const textW = doc.getTextWidth(titleText);
  const lineStartX = MARGIN + 4.5 + textW + 3;
  if (lineStartX < PAGE_W - MARGIN) {
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.15);
    doc.line(lineStartX, y + 2.8, PAGE_W - MARGIN, y + 2.8);
  }

  return y + 9.5;
}

/**
 * Renderiza dois cards lado a lado balanceados (ex: Informações do Documento + Dados do Cliente)
 */
function drawDualCards(
  doc: jsPDF,
  leftCard: { title: string; fields: [string, string][] },
  rightCard: { title: string; fields: [string, string][] },
  y: number
): number {
  const gap = 4;
  const cardW = (CONTENT_W - gap) / 2;
  const pad = 4;
  const rowH = 7.2;
  
  const maxRows = Math.max(leftCard.fields.length, rightCard.fields.length);
  const cardH = 7 + maxRows * rowH + pad * 2;

  const cards = [
    { data: leftCard, x: MARGIN },
    { data: rightCard, x: MARGIN + cardW + gap }
  ];

  cards.forEach(({ data, x }) => {
    // Fundo do card
    doc.setFillColor(...COLOR.surface);
    doc.roundedRect(x, y, cardW, cardH, 2.5, 2.5, 'F');
    
    // Borda fina
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, cardW, cardH, 2.5, 2.5, 'S');

    // Cabeçalho interno do card
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLOR.primary);
    doc.text(data.title.toUpperCase(), x + pad, y + pad + 2.5);

    // Divisória interna do card
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.15);
    doc.line(x + pad, y + pad + 4.5, x + cardW - pad, y + pad + 4.5);

    // Campos
    let fieldY = y + pad + 8;
    data.fields.forEach(([label, rawValue]) => {
      // Label
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLOR.textMuted);
      doc.text(label.toUpperCase(), x + pad, fieldY + 1.5);

      // Valor formatado
      const formatted = formatSmartValue(label, rawValue);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLOR.textDark);
      doc.text(truncate(doc, formatted, cardW - pad * 2), x + pad, fieldY + 5.2);

      fieldY += rowH;
    });
  });

  return y + cardH + 5.5;
}

/** Card de informações genérico em grid */
function drawInfoCard(doc: jsPDF, fields: [string, string][], y: number, columns = 2): number {
  const cardPad = 4.5;
  const colW = CONTENT_W / columns;
  const rowH = 7.5;
  const rows = Math.ceil(fields.length / columns);
  const cardH = rows * rowH + cardPad * 2;

  doc.setFillColor(...COLOR.surface);
  doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 2.5, 2.5, 'F');
  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 2.5, 2.5, 'S');

  fields.forEach(([label, rawValue], idx) => {
    const col = idx % columns;
    const row = Math.floor(idx / columns);
    const xBase = MARGIN + cardPad + col * colW;
    const yBase = y + cardPad + row * rowH;

    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLOR.textMuted);
    doc.text(label.toUpperCase(), xBase, yBase + 2);

    const formatted = formatSmartValue(label, rawValue);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLOR.textDark);
    doc.text(truncate(doc, formatted, colW - cardPad - 2), xBase, yBase + 5.8);
  });

  return y + cardH + 5.5;
}

/**
 * 1. Card Full-Width de Condições Comerciais & Pagamento / Observações
 */
function drawCommercialConditionsCard(
  doc: jsPDF,
  notes: string | string[] | undefined,
  y: number,
  title = 'Condições Comerciais & Pagamento'
): number {
  const defaultNotes = [
    '• Pagamento aceito via PIX instantâneo, Cartão de Crédito ou Boleto.',
    '• Proposta válida por 10 dias corridos a partir da data de emissão.',
    '• Aprovação rápida e digital pelo portal do cliente ou via WhatsApp.'
  ];

  const noteList = notes ? (Array.isArray(notes) ? notes : [notes]) : defaultNotes;
  
  // Calcula altura necessária
  let totalTextLines = 0;
  const preparedLines: string[][] = [];
  noteList.forEach((line) => {
    const split = doc.splitTextToSize(line, CONTENT_W - 12);
    preparedLines.push(split);
    totalTextLines += split.length;
  });

  const cardH = 9 + totalTextLines * 4.2 + 4;

  // Fundo do Card
  doc.setFillColor(...COLOR.surface);
  doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 2.5, 2.5, 'F');
  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 2.5, 2.5, 'S');

  // Ícone info circular estilizado (i)
  doc.setDrawColor(...COLOR.accent);
  doc.setLineWidth(0.3);
  doc.circle(MARGIN + 6, y + 5.5, 1.8, 'S');
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLOR.accent);
  doc.text('i', MARGIN + 6, y + 6.3, { align: 'center' });

  // Título do Card
  doc.setFontSize(7.8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLOR.primary);
  doc.text(title, MARGIN + 10, y + 6.2);

  // Linhas de Observações / Condições
  let lineY = y + 11.5;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR.textBody);

  preparedLines.forEach((split) => {
    doc.text(split, MARGIN + 5.5, lineY);
    lineY += split.length * 4.2;
  });

  return y + cardH + 4.5;
}

/**
 * 2. Card Full-Width de Resumo Financeiro com Valor Total em Destaque
 */
function drawFinancialSummaryCard(
  doc: jsPDF,
  rows: [string, string, boolean?][],
  y: number
): number {
  const regularRows = rows.filter(r => !r[2]);
  const totalRow = rows.find(r => r[2] === true);

  const regularRowH = 6.2;
  const totalBoxH = 14;
  const pad = 4.5;
  const cardH = pad + regularRows.length * regularRowH + totalBoxH + pad + 1;

  // Fundo do Card
  doc.setFillColor(...COLOR.surface);
  doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 2.5, 2.5, 'F');
  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 2.5, 2.5, 'S');

  // Linhas Regulares (Subtotal, Descontos, Acréscimos)
  let curY = y + pad + 3.5;
  regularRows.forEach(([label, value]) => {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');

    const isDiscount = label.toLowerCase().includes('desconto') || label.toLowerCase().includes('abatimento') || value.startsWith('-');
    if (isDiscount) {
      doc.setTextColor(...COLOR.success);
    } else {
      doc.setTextColor(...COLOR.textBody);
    }

    doc.text(label, MARGIN + 5, curY);
    doc.setFont('helvetica', 'bold');
    doc.text(value, PAGE_W - MARGIN - 5, curY, { align: 'right' });

    curY += regularRowH;
  });

  // Bloco Destacado do Total Final (Full-Width dentro do Card)
  if (totalRow) {
    const boxY = y + cardH - totalBoxH - pad;
    const boxW = CONTENT_W - 5;
    const boxX = MARGIN + 2.5;

    // Fundo Navy Escuro
    doc.setFillColor(...COLOR.primary);
    doc.roundedRect(boxX, boxY, boxW, totalBoxH, 2.2, 2.2, 'F');

    // Label do Total (Esquerda)
    doc.setTextColor(224, 231, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(totalRow[0].toUpperCase(), boxX + 4.5, boxY + 5.5);

    // Subtítulo (Esquerda)
    doc.setFontSize(6.2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text('À vista ou faturado', boxX + 4.5, boxY + 10.5);

    // Valor Total Formatado (Direita)
    doc.setTextColor(...COLOR.white);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(totalRow[1], boxX + boxW - 5, boxY + 9, { align: 'right' });
  }

  return y + cardH + 5;
}

// ─── Geradores Principais ─────────────────────────────────────────────────────

/**
 * 1. ORÇAMENTO PDF (Moderno & Executivo)
 */
export async function generateOrcamentoPDF(
  orcamento: Orcamento,
  cliente: PdfCliente | null | undefined,
  item: PdfItem | null | undefined,
  options: { returnDoc?: boolean } = {}
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const empresa = await fetchEmpresaInfo();

  const code = orcamento.codigo_orcamento || `ORC-${String(orcamento.id || '').slice(0, 8)}`;
  const emissionDate = formatDate(orcamento.data_criacao);
  const status = orcamento.status || 'aberto';

  let y = drawHeader(doc, empresa, 'Orçamento', `N.º ${code}`, emissionDate, status);

  // Cards lado a lado: Informações do Orçamento & Dados do Cliente
  y = drawDualCards(
    doc,
    {
      title: 'Informações do Orçamento',
      fields: [
        ['Código', code],
        ['Data de Emissão', emissionDate],
        ['Categoria', (orcamento.categoria || 'Serviço').toUpperCase()],
        ['Status Atual', status.toUpperCase()],
      ]
    },
    {
      title: 'Dados do Cliente',
      fields: [
        ['Nome Completo', cliente?.nome || 'Cliente GSA'],
        ['CPF / CNPJ', cliente?.cpf || cliente?.cnpj || '—'],
        ['Código do Cliente', cliente?.codigo_cliente || '—'],
        ['Telefone / WhatsApp', cliente?.telefone || '—'],
      ]
    },
    y
  );

  // Seção de Itens / Serviços
  y = drawSectionTitle(doc, 'Itens e Serviços do Orçamento', y);

  const itemNome = item?.nome || orcamento.descricao_adicional || (orcamento as any).titulo || 'Serviço Especializado';
  const itemValor = orcamento.categoria === 'produto' ? (orcamento.valor_produto || 0) :
                    orcamento.categoria === 'assinatura' ? (orcamento.valor_assinatura || 0) :
                    (orcamento.valor_servico || 0);
  const quantidade = orcamento.quantidade || 1;

  const tableBody: (string | number)[][] = [
    [
      itemNome,
      quantidade.toString(),
      formatCurrency(itemValor),
      formatCurrency(itemValor * quantidade)
    ],
  ];

  if ((orcamento.valor_adicional || 0) > 0) {
    tableBody.push([
      orcamento.descricao_adicional || 'Taxa Adicional / Deslocamento',
      '1',
      formatCurrency(orcamento.valor_adicional),
      formatCurrency(orcamento.valor_adicional)
    ]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Descrição do Serviço / Produto', 'Qtd', 'Valor Unit.', 'Total']],
    body: tableBody,
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      textColor: COLOR.textDark,
      lineColor: COLOR.border,
      lineWidth: 0.15
    },
    headStyles: {
      fillColor: COLOR.primary,
      textColor: COLOR.white,
      fontStyle: 'bold',
      fontSize: 7.5
    },
    alternateRowStyles: {
      fillColor: COLOR.surface
    },
    columnStyles: {
      0: { cellWidth: 'auto', fontStyle: 'bold' },
      1: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 7;

  // 1. Resumo Financeiro Full-Width
  const subtotalValue = itemValor * quantidade + (orcamento.valor_adicional || 0);
  const totalRows: [string, string, boolean?][] = [
    ['Subtotal dos Itens', formatCurrency(subtotalValue)],
  ];

  if ((orcamento.acrescimo || 0) > 0) {
    totalRows.push(['Acréscimos', `+ ${formatCurrency(orcamento.acrescimo)}`]);
  }
  if ((orcamento.desconto || 0) > 0) {
    totalRows.push(['Descontos Aplicados', `- ${formatCurrency(orcamento.desconto)}`]);
  }
  totalRows.push(['Valor Total do Orçamento', formatCurrency(orcamento.total || (subtotalValue + (orcamento.acrescimo || 0) - (orcamento.desconto || 0))), true]);

  y = drawFinancialSummaryCard(doc, totalRows, y);

  // 2. Condições Comerciais Full-Width (Por Último)
  y = checkPageBreak(doc, y, 45);
  const customNotes = orcamento.descricao_adicional ? [
    `• Observações: ${orcamento.descricao_adicional}`,
    '• Pagamento aceito via PIX instantâneo, Cartão de Crédito ou Boleto.',
    '• Proposta válida por 10 dias corridos a partir da data de emissão.',
    '• Aprovação rápida e digital pelo portal do cliente ou via WhatsApp.'
  ] : undefined;

  y = drawCommercialConditionsCard(doc, customNotes, y);

  drawFooter(doc, empresa);

  if (options.returnDoc) return doc;
  doc.save(`orcamento_${code}.pdf`);
}

/**
 * 2. ORDEM DE SERVIÇO (OS) PDF
 */
export async function generateOSPDF(
  os: OS,
  cliente: PdfCliente | null | undefined,
  orcamento: PdfOrcamento | null | undefined,
  options: { returnDoc?: boolean } = {}
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const empresa = await fetchEmpresaInfo();

  const code = os.codigo_os || `OS-${String(os.id || '').slice(0, 8)}`;
  const startDate = formatDate(os.data_inicio);
  const status = os.status || 'aberto';

  let y = drawHeader(doc, empresa, 'Ordem de Serviço', `N.º ${code}`, startDate, status);

  // Cards lado a lado
  y = drawDualCards(
    doc,
    {
      title: 'Dados da Ordem de Serviço',
      fields: [
        ['Código OS', code],
        ['Status Operacional', status.toUpperCase()],
        ['Data de Início', startDate],
        ['Previsão / Conclusão', os.data_fim ? formatDate(os.data_fim) : 'Em andamento'],
      ]
    },
    {
      title: 'Dados do Cliente',
      fields: [
        ['Nome Completo', cliente?.nome || 'Cliente GSA'],
        ['CPF / CNPJ', cliente?.cpf || cliente?.cnpj || '—'],
        ['Código do Cliente', cliente?.codigo_cliente || '—'],
        ['Telefone / Contato', cliente?.telefone || '—'],
      ]
    },
    y
  );

  // Detalhamento do Serviço
  y = drawSectionTitle(doc, 'Detalhamento do Serviço Executado', y);

  const tableRows: string[][] = [
    ['Serviço: ' + (orcamento?.servicos?.nome || 'Execução Operacional de Serviços'), formatCurrency(orcamento?.valor_servico || 0)],
  ];
  if ((orcamento?.valor_adicional || 0) > 0) {
    tableRows.push([orcamento?.descricao_adicional || 'Taxa Adicional / Peças / Deslocamento', formatCurrency(orcamento.valor_adicional)]);
  }
  if ((orcamento?.acrescimo || 0) > 0) {
    tableRows.push(['Acréscimo Comercial', `+ ${formatCurrency(orcamento.acrescimo)}`]);
  }
  if ((orcamento?.desconto || 0) > 0) {
    tableRows.push(['Desconto Concedido', `- ${formatCurrency(orcamento.desconto)}`]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Descrição do Serviço e Materiais', 'Valor']],
    body: tableRows,
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      textColor: COLOR.textDark,
      lineColor: COLOR.border,
      lineWidth: 0.15
    },
    headStyles: {
      fillColor: COLOR.primary,
      textColor: COLOR.white,
      fontStyle: 'bold',
      fontSize: 7.5
    },
    alternateRowStyles: {
      fillColor: COLOR.surface
    },
    columnStyles: {
      0: { cellWidth: 'auto', fontStyle: 'bold' },
      1: { cellWidth: 40, halign: 'right', fontStyle: 'bold' }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 7;

  // 1. Resumo Financeiro Full-Width
  const totalRows: [string, string, boolean?][] = [
    ['Valor Total dos Serviços Executados', formatCurrency(orcamento?.total || 0), true]
  ];
  y = drawFinancialSummaryCard(doc, totalRows, y);

  // 2. Condições e Termos de Execução Full-Width (Por Último)
  y = checkPageBreak(doc, y, 45);
  y = drawCommercialConditionsCard(doc, [
    '• Atesto que os serviços foram realizados com zelo e em conformidade técnica.',
    '• Garantia de execução válida conforme os termos contratuais acordados.',
    '• Dúvidas ou solicitações de garantia podem ser abertas diretamente no painel GSA HUB.'
  ], y, 'Termos de Conclusão & Garantia');

  // Boxes de Assinatura Profissionais
  y = checkPageBreak(doc, y, 28);
  const sigBoxW = (CONTENT_W - 8) / 2;
  const sigBoxH = 22;

  // Box Empresa
  doc.setFillColor(...COLOR.surface);
  doc.roundedRect(MARGIN, y, sigBoxW, sigBoxH, 2, 2, 'F');
  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y, sigBoxW, sigBoxH, 2, 2, 'S');

  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.3);
  doc.line(MARGIN + 6, y + 13, MARGIN + sigBoxW - 6, y + 13);
  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLOR.textBody);
  doc.text('RESPONSÁVEL TÉCNICO / EMPRESA', MARGIN + sigBoxW / 2, y + 17.5, { align: 'center' });

  // Box Cliente
  const clientSigX = MARGIN + sigBoxW + 8;
  doc.setFillColor(...COLOR.surface);
  doc.roundedRect(clientSigX, y, sigBoxW, sigBoxH, 2, 2, 'F');
  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.2);
  doc.roundedRect(clientSigX, y, sigBoxW, sigBoxH, 2, 2, 'S');

  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.3);
  doc.line(clientSigX + 6, y + 13, clientSigX + sigBoxW - 6, y + 13);
  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLOR.textBody);
  doc.text('CLIENTE / AUTORIZAÇÃO DE CONCLUSÃO', clientSigX + sigBoxW / 2, y + 17.5, { align: 'center' });

  drawFooter(doc, empresa);

  if (options.returnDoc) return doc;
  doc.save(`os_${code}.pdf`);
}

/**
 * 3. FATURA / RECIBO DE PAGAMENTO PDF
 */
export async function generateFaturaPDF(
  fatura: Fatura,
  cliente: PdfCliente | null | undefined,
  os: PdfOS | null | undefined,
  options: { returnDoc?: boolean } = {}
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const empresa = await fetchEmpresaInfo();
  const orcamento = os?.orcamentos;

  const isPaid = fatura.status === 'pago';
  const docTypeLabel = isPaid ? 'Recibo de Pagamento' : 'Fatura de Cobrança';
  const code = fatura.codigo_fatura || `FAT-${String(fatura.id || '').slice(0, 8)}`;
  const dueDate = formatDate(fatura.data_vencimento);
  const emissionDate = formatDate(fatura.data_emissao || fatura.created_at || fatura.data_vencimento);

  let y = drawHeader(doc, empresa, docTypeLabel, `N.º ${code}`, emissionDate, fatura.status);

  // Cards lado a lado
  const faturaFields: [string, string][] = [
    ['Código da Fatura', code],
    ['Data de Emissão', emissionDate],
    ['Data de Vencimento', dueDate],
  ];
  if (isPaid && fatura.data_pagamento) {
    faturaFields.push(['Data do Pagamento', formatDateTime(fatura.data_pagamento)]);
  } else {
    faturaFields.push(['Status da Cobrança', (fatura.status || 'aberto').toUpperCase()]);
  }

  y = drawDualCards(
    doc,
    {
      title: isPaid ? 'Dados do Recibo' : 'Dados da Fatura',
      fields: faturaFields
    },
    {
      title: 'Dados do Pagador / Cliente',
      fields: [
        ['Nome / Razão Social', cliente?.nome || 'Cliente GSA'],
        ['CPF / CNPJ', cliente?.cpf || cliente?.cnpj || '—'],
        ['Código do Cliente', cliente?.codigo_cliente || '—'],
        ['Telefone / WhatsApp', cliente?.telefone || '—'],
      ]
    },
    y
  );

  // Seção de Itens Faturados
  y = drawSectionTitle(doc, 'Itens Faturados', y);

  let tableBody: string[][] = [];

  if (Array.isArray(fatura.itens_faturados) && fatura.itens_faturados.length > 0) {
    tableBody = (fatura.itens_faturados as any[]).map((it) => [
      it.descricao || it.nome || 'Item Faturado',
      String(it.quantidade || 1),
      formatCurrency(it.valor_unitario || it.valor || 0),
      formatCurrency(it.subtotal || ((it.quantidade || 1) * (it.valor_unitario || it.valor || 0)))
    ]);
  } else if (os) {
    const servico = orcamento?.servicos?.nome || 'Serviço Operacional';
    tableBody.push([`Serviço: ${servico} (Ref. OS ${os.codigo_os})`, '1', formatCurrency(orcamento?.valor_servico || 0), formatCurrency(orcamento?.valor_servico || 0)]);
    if ((orcamento?.valor_adicional || 0) > 0) {
      tableBody.push([orcamento?.descricao_adicional || 'Taxa Adicional', '1', formatCurrency(orcamento?.valor_adicional || 0), formatCurrency(orcamento?.valor_adicional || 0)]);
    }
  } else if (fatura.ordens_compra) {
    const oc = fatura.ordens_compra;
    const prod = oc.produtos?.nome || 'Produto Adquirido';
    tableBody.push([`Produto: ${prod} (Ref. ${oc.codigo_ordem || oc.codigo_oc || 'OC'})`, String(oc.quantidade || 1), formatCurrency(oc.produtos?.valor || 0), formatCurrency((oc.produtos?.valor || 0) * (oc.quantidade || 1))]);
  } else if ((fatura as any).ordens_assinatura) {
    const oa = (fatura as any).ordens_assinatura;
    const plan = oa.assinaturas?.nome || 'Plano de Assinatura';
    tableBody.push([`Assinatura: ${plan} (Ref. ${oa.codigo_ordem || oa.codigo_oa || 'OA'})`, String(oa.quantidade || 1), formatCurrency(oa.assinaturas?.valor || 0), formatCurrency((oa.assinaturas?.valor || 0) * (oa.quantidade || 1))]);
  } else {
    tableBody.push([fatura.observacoes || 'Cobrança de Serviços e Produtos', '1', formatCurrency(fatura.valor_total), formatCurrency(fatura.valor_total)]);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Descrição do Item', 'Qtd', 'Valor Unit.', 'Total']],
    body: tableBody,
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      textColor: COLOR.textDark,
      lineColor: COLOR.border,
      lineWidth: 0.15
    },
    headStyles: {
      fillColor: COLOR.primary,
      textColor: COLOR.white,
      fontStyle: 'bold',
      fontSize: 7.5
    },
    alternateRowStyles: {
      fillColor: COLOR.surface
    },
    columnStyles: {
      0: { cellWidth: 'auto', fontStyle: 'bold' },
      1: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 7;

  // 1. Resumo Financeiro Full-Width
  const baseTotal = Number(fatura.valor_base_original) > 0 
    ? Number(fatura.valor_base_original) 
    : (
        Number(fatura.valor_total || 0) 
        + Number(fatura.desconto_manual || 0) 
        - Number(fatura.acrescimo_manual || 0) 
        + Number(fatura.desconto_voucher_aplicado || 0) 
        + Number(fatura.abatimento_carteira_aplicado || 0) 
        + Number(fatura.desconto_pontos_aplicado || 0)
      );

  const totalRows: [string, string, boolean?][] = [
    ['Subtotal Original', formatCurrency(baseTotal)],
  ];
  if ((fatura.desconto_voucher_aplicado || 0) > 0)    totalRows.push(['Desconto Cupom / Voucher', `- ${formatCurrency(fatura.desconto_voucher_aplicado)}`]);
  if ((fatura.abatimento_carteira_aplicado || 0) > 0) totalRows.push(['Abatimento Saldo Carteira', `- ${formatCurrency(fatura.abatimento_carteira_aplicado)}`]);
  if ((fatura.desconto_pontos_aplicado || 0) > 0)     totalRows.push(['Desconto Programa de Pontos', `- ${formatCurrency(fatura.desconto_pontos_aplicado)}`]);
  if ((orcamento?.acrescimo || 0) > 0)                totalRows.push(['Acréscimo', `+ ${formatCurrency(orcamento.acrescimo)}`]);
  if ((orcamento?.desconto || 0) > 0)                 totalRows.push(['Desconto Orçamento', `- ${formatCurrency(orcamento.desconto)}`]);
  if (Number(fatura.acrescimo_manual) > 0)            totalRows.push(['Acréscimo Ajuste', `+ ${formatCurrency(fatura.acrescimo_manual)}`]);
  if (Number(fatura.desconto_manual) > 0)             totalRows.push(['Desconto Ajuste', `- ${formatCurrency(fatura.desconto_manual)}`]);

  const valorTotalFinal = Number(fatura.valor_total || 0);
  const valorPago = Number(fatura.valor_pago || 0);

  if (isPaid) {
    totalRows.push(['Total Quitado', formatCurrency(valorPago > 0 ? valorPago : valorTotalFinal), true]);
  } else {
    totalRows.push(['Total a Pagar', formatCurrency(valorTotalFinal), true]);
    if (valorPago > 0 && valorPago < valorTotalFinal) {
      totalRows.push(['Valor Já Pago', `- ${formatCurrency(valorPago)}`]);
      const restante = Math.max(0, valorTotalFinal - valorPago);
      totalRows.push(['Saldo Restante', formatCurrency(restante)]);
    }
  }

  y = drawFinancialSummaryCard(doc, totalRows, y);

  // 2. Condições de Pagamento / Quitação Full-Width (Por Último)
  y = checkPageBreak(doc, y, 45);
  const paymentNotes = isPaid ? [
    `• Pagamento confirmado com sucesso em: ${formatDateTime(fatura.data_pagamento)}.`,
    `• Forma de pagamento: ${(fatura.forma_pagamento_escolhida || 'PIX / Instantâneo').toUpperCase()}.`,
    '• Este documento serve como recibo oficial de quitação financeira no sistema GSA HUB.'
  ] : [
    `• Fatura com vencimento em ${dueDate}.`,
    '• Pague via PIX Copia e Cola pelo painel GSA HUB para baixa automática instantânea.',
    '• Dúvidas sobre faturamento? Entre em contato com a equipe financeira.'
  ];

  y = drawCommercialConditionsCard(doc, paymentNotes, y, isPaid ? 'Informações de Quitação' : 'Condições de Pagamento');

  drawFooter(doc, empresa);

  if (options.returnDoc) return doc;
  doc.save(`fatura_${code}.pdf`);
}

/**
 * 4. EXTRATO FINANCEIRO PDF (Moderno & Executivo)
 */
export const generateExtratoPDF = async (extrato: any[], clienteNome: string, options: any = {}) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const empresa = await fetchEmpresaInfo();

  const emissionDate = formatDate(new Date());
  let y = drawHeader(doc, empresa, 'Extrato Financeiro', `EXT-${Date.now().toString().slice(-6)}`, emissionDate);

  // Card do Titular / Período
  y = drawInfoCard(doc, [
    ['Titular da Conta', clienteNome || 'Cliente GSA'],
    ['Data da Emissão', emissionDate],
    ['Período Consultado', 'Histórico Completo de Movimentações'],
    ['Status da Conta', 'REGULAR / ATIVA'],
  ], y, 2);

  // Totalizadores de Entradas, Saídas e Saldo
  const totalEntradas = extrato.filter(e => e.tipo === 'entrada').reduce((acc, cur) => acc + Number(cur.valor || 0), 0);
  const totalSaidas = extrato.filter(e => e.tipo === 'saida').reduce((acc, cur) => acc + Number(cur.valor || 0), 0);
  const saldoLiquido = totalEntradas - totalSaidas;

  const cardW = (CONTENT_W - 8) / 3;
  const kpiH = 15;

  // KPI 1: Entradas
  doc.setFillColor(...COLOR.successBg);
  doc.roundedRect(MARGIN, y, cardW, kpiH, 2, 2, 'F');
  doc.setDrawColor(...COLOR.success);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y, cardW, kpiH, 2, 2, 'S');
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLOR.success);
  doc.text('TOTAL DE ENTRADAS', MARGIN + 4, y + 5);
  doc.setFontSize(9.5);
  doc.text(`+ ${formatCurrency(totalEntradas)}`, MARGIN + 4, y + 11.5);

  // KPI 2: Saídas
  const kpi2X = MARGIN + cardW + 4;
  doc.setFillColor(...COLOR.dangerBg);
  doc.roundedRect(kpi2X, y, cardW, kpiH, 2, 2, 'F');
  doc.setDrawColor(...COLOR.danger);
  doc.setLineWidth(0.2);
  doc.roundedRect(kpi2X, y, cardW, kpiH, 2, 2, 'S');
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLOR.danger);
  doc.text('TOTAL DE SAÍDAS', kpi2X + 4, y + 5);
  doc.setFontSize(9.5);
  doc.text(`- ${formatCurrency(totalSaidas)}`, kpi2X + 4, y + 11.5);

  // KPI 3: Saldo
  const kpi3X = MARGIN + (cardW + 4) * 2;
  doc.setFillColor(...COLOR.primary);
  doc.roundedRect(kpi3X, y, cardW, kpiH, 2, 2, 'F');
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(200, 215, 240);
  doc.text('SALDO RESULTANTE', kpi3X + 4, y + 5);
  doc.setFontSize(9.5);
  doc.setTextColor(...COLOR.white);
  doc.text(formatCurrency(saldoLiquido), kpi3X + 4, y + 11.5);

  y += kpiH + 7;

  // Tabela de Transações
  y = drawSectionTitle(doc, 'Movimentações Financeiras', y);

  const tableData = extrato.map(item => [
    formatDate(item.data),
    item.descricao || 'Movimentação Financeira',
    item.tipo === 'entrada' ? 'ENTRADA' : 'SAÍDA',
    formatCurrency(item.valor)
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Data', 'Descrição da Movimentação', 'Tipo', 'Valor']],
    body: tableData,
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      textColor: COLOR.textDark,
      lineColor: COLOR.border,
      lineWidth: 0.15
    },
    headStyles: {
      fillColor: COLOR.primary,
      textColor: COLOR.white,
      fontStyle: 'bold',
      fontSize: 7.5
    },
    alternateRowStyles: {
      fillColor: COLOR.surface
    },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 'auto', fontStyle: 'bold' },
      2: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
    },
    didParseCell: function(data) {
      if (data.section === 'body') {
        const isEntrada = data.row.raw[2] === 'ENTRADA';
        if (data.column.index === 2) {
          data.cell.styles.textColor = isEntrada ? COLOR.success : COLOR.danger;
        }
        if (data.column.index === 3) {
          data.cell.styles.textColor = isEntrada ? COLOR.success : COLOR.danger;
        }
      }
    }
  });

  drawFooter(doc, empresa);

  if (options.returnDoc) return doc;
  doc.save(`extrato_financeiro_${Date.now()}.pdf`);
};


