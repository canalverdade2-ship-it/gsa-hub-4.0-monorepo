const { jsPDF } = require('jspdf');
const autoTablePlugin = require('jspdf-autotable');
const autoTable = autoTablePlugin.default || autoTablePlugin;
const fs = require('fs');
const path = require('path');

function generatePdf() {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Cores institucionais do Grupo GSA
  const COLOR_PRIMARY = [15, 23, 42]; // Slate 900
  const COLOR_SECONDARY = [30, 41, 59]; // Slate 800
  const COLOR_ACCENT = [217, 119, 6]; // Amber 600
  const COLOR_ACCENT_LIGHT = [254, 243, 199]; // Amber 100
  const COLOR_MUTED = [100, 116, 139]; // Slate 500
  const COLOR_BORDER = [226, 232, 240]; // Slate 200

  // Função para desenhar o cabeçalho executivo em cada página
  function drawHeader(title = 'GUIA OFICIAL DE PROGRAMAÇÃO 24 HORAS') {
    doc.setFillColor(...COLOR_PRIMARY);
    doc.rect(0, 0, pageWidth, 18, 'F');

    doc.setFillColor(...COLOR_ACCENT);
    doc.rect(0, 18, pageWidth, 1.5, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('GSA TV', 14, 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(217, 119, 6);
    doc.text('•', 34, 11);
    doc.setTextColor(255, 255, 255);
    doc.text(title, 38, 11);

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('GRUPO GSA', pageWidth - 14, 11, { align: 'right' });
  }

  // Função para desenhar o rodapé padrão com paginação
  function drawFooter(pageNumber, totalPages) {
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_MUTED);
    doc.text('GSA TV 24H • Transmissão Contínua Full HD 1080p • Grade Sem Repetições Cansativas', 14, pageHeight - 7);
    doc.text(`Página ${pageNumber} de ${totalPages}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // PÁGINA 1: CAPA & PRINCÍPIOS EDITORIAIS DA GSA TV
  // ═════════════════════════════════════════════════════════════════════════════
  drawHeader('MANUAL DA GRADE DEFINITIVA 24H');

  // Banner da Capa
  doc.setFillColor(...COLOR_SECONDARY);
  doc.roundedRect(14, 25, pageWidth - 28, 38, 3, 3, 'F');

  doc.setTextColor(251, 191, 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('GSA TV • GRADE DEFINITIVA 24 HORAS', 20, 37);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text('Guia Completo de Atrações, Faixas Horárias e Proposta Editorial Harmonizada', 20, 45);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text('Programação Semanal Contínua • Zero Reprises Excessivas • Jornalismo, Fé, Cidadania e Família', 20, 54);

  // Pilares Estruturais (3 Caixas)
  const boxWidth = (pageWidth - 28 - 8) / 3;
  const boxY = 68;

  // Caixa 1: Jornalismo & Clima
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, boxY, boxWidth, 40, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, boxY, boxWidth, 40, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLOR_PRIMARY);
  doc.text('[JORNALISMO & SERVIÇOS]', 18, boxY + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(51, 65, 85);
  doc.text(
    '• 07h25/11h55/18h55 - GSA Tempo\n' +
    '• 07h30 - GSA Manhã News\n' +
    '• 10h00 - Cidadania & Seus Direitos\n' +
    '• 12h00 - GSA Meio Dia News (Pontual)\n' +
    '• 12h30 - GSA Mercado\n' +
    '• 19h00 - GSA News Noite (Bancada)',
    18,
    boxY + 13
  );

  // Caixa 2: Espiritualidade
  doc.setFillColor(...COLOR_ACCENT_LIGHT);
  doc.roundedRect(14 + boxWidth + 4, boxY, boxWidth, 40, 2, 2, 'F');
  doc.setDrawColor(245, 158, 11);
  doc.roundedRect(14 + boxWidth + 4, boxY, boxWidth, 40, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(180, 83, 9);
  doc.text('[GSA EM FÉ & BÍBLIA]', 18 + boxWidth + 4, boxY + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(120, 53, 15);
  doc.text(
    '• 07h00 - O Despertar da Fé\n' +
    '• 09h00 - A Oração da Manhã\n' +
    '• 09h30 - GSA Histórias da Bíblia\n' +
    '• 13h00 - A Bênção da Tarde\n' +
    '• 15h00 - Hora da Misericórdia\n' +
    '• 20h00 / 23h00 - Bênção da Família / Noite',
    18 + boxWidth + 4,
    boxY + 13
  );

  // Caixa 3: Louvor & Família
  doc.setFillColor(243, 232, 255);
  doc.roundedRect(14 + (boxWidth * 2) + 8, boxY, boxWidth, 40, 2, 2, 'F');
  doc.setDrawColor(192, 132, 252);
  doc.roundedRect(14 + (boxWidth * 2) + 8, boxY, boxWidth, 40, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(107, 33, 168);
  doc.text('[MÚSICA & ENTRETENIMENTO]', 18 + (boxWidth * 2) + 8, boxY + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(88, 28, 135);
  doc.text(
    '• 13h30 - GSA Desenhos Clássicos\n' +
    '• 16h30 - GSA Planeta Terra / Natureza\n' +
    '• 17h00 - GSA Tá na Rede (Edição Única)\n' +
    '• 17h30 - GSA Motor\n' +
    '• 18h00 / 21h00 - GSA Music (Dose Dupla)\n' +
    '• 22h00 - Noites de Cinema e Docs',
    18 + (boxWidth * 2) + 8,
    boxY + 13
  );

  // Tabela de Princípios Operacionais
  autoTable(doc, {
    startY: 114,
    head: [['Diretriz Operacional', 'O Que Muda na Nova Grade', 'Benefício para o Telespectador']],
    body: [
      [
        'Fim das Reprises Cansativas',
        'Eliminação do "efeito espelho" da tarde (Sabor e Destinos às 16h30/17h30) e da reprise de Business 45 min depois.',
        'Grade 100% dinâmica. Quem sintoniza em horários diferentes sempre encontra conteúdo inédito.'
      ],
      [
        'Inclusão dos 3 Novos Pilares',
        '• Cidadania & Direitos (10h00)\n• Clima & Tempo Brasil (07h25/11h55/18h55)\n• Histórias da Bíblia (09h30).',
        'Atração de famílias e grande utilidade pública com orientações de INSS, aposentadoria e previsão do tempo.'
      ],
      [
        'Faixa do Almoço Pontual',
        '11h30 GSA Sabor -> 11h55 GSA Tempo -> 12h00 GSA Meio Dia News em ponto -> 12h30 GSA Mercado.',
        'Fluxo perfeito de atenção ao meio-dia, mantendo o telespectador ligado sem quebra de ritmo.'
      ],
      [
        'Mesa Master & Content ID',
        'Playout com Preview e Program em tempo real com validação automática anti-strike do YouTube.',
        'Segurança jurídica e operacional absoluta para manter o sinal contínuo no ar 24h por dia.'
      ],
      [
        'Intervalos Comerciais (Breaks)',
        'Presets rápidos (60s, 120s padrão, 180s e cartela contínua) com rotação de patrocinadores e institucionais.',
        'Monetização sustentável e valorização de parceiros sem quebrar a transmissão nem cansar o público.'
      ]
    ],
    theme: 'grid',
    headStyles: { fillColor: COLOR_PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7.4, textColor: [30, 41, 59], cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 80 },
      2: { cellWidth: 'auto' }
    }
  });

  // Box inferior da Capa
  const tableBottomY = doc.lastAutoTable.finalY + 6;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, tableBottomY, pageWidth - 28, 20, 2, 2, 'F');
  doc.setDrawColor(...COLOR_BORDER);
  doc.roundedRect(14, tableBottomY, pageWidth - 28, 20, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR_PRIMARY);
  doc.text('DECLARAÇÃO DE CONFORMIDADE DA EMISSORA:', 18, tableBottomY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...COLOR_MUTED);
  doc.text(
    'A grade oficial GSA TV segue o modelo híbrido de excelência: 80% do tempo em acervo de domínio público, órgãos governamentais\n' +
    'e cultura aberta, e 20% em jornalismo e produções de inteligência artificial de alta fidelidade visual.',
    18,
    tableBottomY + 12
  );

  // ═════════════════════════════════════════════════════════════════════════════
  // PÁGINA 2: TABELA DA GRADE DIURNA (06h00 às 15h00)
  // ═════════════════════════════════════════════════════════════════════════════
  doc.addPage();
  drawHeader('GRADE SEMANAL • FAIXA MATUTINA & VESPERTINA');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_PRIMARY);
  doc.text('TABELA DE TRANSMISSÃO SEMANAL — FAIXA DIURNA (06h00 às 15h00)', 14, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR_MUTED);
  doc.text('Horários oficiais de Brasília • Programação contínua sem repetições cansativas', 14, 30);

  autoTable(doc, {
    startY: 33,
    head: [['Horário', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']],
    body: [
      ['06:00', 'GSA Bem Viver', 'GSA Bem Viver', 'GSA Bem Viver', 'GSA Bem Viver', 'GSA Bem Viver', 'GSA Agro', 'GSA Agro'],
      ['06:30', 'GSA Bem Viver (Nutri)', 'GSA Bem Viver (Nutri)', 'GSA Bem Viver (Nutri)', 'GSA Bem Viver (Nutri)', 'GSA Bem Viver (Nutri)', 'GSA Agro (Tec)', 'GSA Agro (Tec)'],
      ['07:00', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé'],
      ['07:25', 'GSA Tempo', 'GSA Tempo', 'GSA Tempo', 'GSA Tempo', 'GSA Tempo', 'GSA Tempo', 'GSA Tempo'],
      ['07:30', 'GSA Manhã News', 'GSA Manhã News', 'GSA Manhã News', 'GSA Manhã News', 'GSA Manhã News', 'GSA Manhã News', 'GSA Motivação'],
      ['08:00', 'GSA Business', 'GSA Tech', 'GSA Business', 'GSA Tech', 'GSA Business', 'Motivação', 'Bem Viver'],
      ['09:00', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé'],
      ['09:30', 'GSA Hist. Bíblia', 'GSA Hist. Bíblia', 'GSA Hist. Bíblia', 'GSA Hist. Bíblia', 'GSA Hist. Bíblia', 'GSA Hist. Bíblia', 'GSA Hist. Bíblia'],
      ['10:00', 'GSA Cidadania', 'GSA Cidadania', 'GSA Cidadania', 'GSA Cidadania', 'GSA Cidadania', 'GSA Mundo', 'GSA Mundo'],
      ['11:00', 'GSA Destinos', 'GSA Destinos', 'GSA Destinos', 'GSA Destinos', 'GSA Destinos', 'GSA Tech', 'Tá na Rede'],
      ['11:30', 'GSA Sabor', 'GSA Sabor', 'GSA Sabor', 'GSA Sabor', 'GSA Sabor', 'GSA Tech', 'GSA Motor'],
      ['11:55', 'GSA Tempo', 'GSA Tempo', 'GSA Tempo', 'GSA Tempo', 'GSA Tempo', 'GSA Tempo', 'GSA Tempo'],
      ['12:00', 'GSA MEIO DIA NEWS', 'GSA MEIO DIA NEWS', 'GSA MEIO DIA NEWS', 'GSA MEIO DIA NEWS', 'GSA MEIO DIA NEWS', 'GSA MEIO DIA NEWS', 'GSA MEIO DIA NEWS'],
      ['12:30', 'GSA Mercado', 'GSA Mercado', 'GSA Mercado', 'GSA Mercado', 'GSA Mercado', 'GSA Motor', 'GSA Sabor'],
      ['13:00', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé'],
      ['13:30', 'GSA Desenhos', 'GSA Desenhos', 'GSA Desenhos', 'GSA Desenhos', 'GSA Desenhos', 'GSA Sessão Pipoca', 'GSA Sessão Pipoca'],
      ['14:30', 'GSA Desenhos — Continuação', 'GSA Desenhos — Continuação', 'GSA Desenhos — Continuação', 'GSA Desenhos — Continuação', 'GSA Desenhos — Continuação', 'GSA Sessão Pipoca — Continuação', 'GSA Sessão Pipoca — Continuação'],
      ['15:00', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé', 'GSA Em Fé'],
    ],
    theme: 'grid',
    headStyles: { fillColor: COLOR_PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center' },
    bodyStyles: { fontSize: 7.2, textColor: [30, 41, 59], cellPadding: 2.2, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 16, fontStyle: 'bold', fillColor: [241, 245, 249] },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: function (data) {
      // Destaque Meio Dia News
      if (data.row.index === 12 && data.column.index > 0) {
        data.cell.styles.fillColor = [254, 243, 199];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = [180, 83, 9];
      }
      // Destaque GSA Em Fé
      if ((data.row.index === 2 || data.row.index === 6 || data.row.index === 14 || data.row.index === 17) && data.column.index > 0) {
        data.cell.styles.fillColor = [255, 251, 235];
        data.cell.styles.textColor = [161, 98, 7];
        data.cell.styles.fontStyle = 'bold';
      }
      // Destaque Cidadania & Histórias da Bíblia (Novos)
      if ((data.row.index === 7 || data.row.index === 8) && data.column.index > 0) {
        data.cell.styles.textColor = [15, 23, 42];
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  // Legenda
  const legendY = doc.lastAutoTable.finalY + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR_MUTED);
  doc.text('Destaques: 09h30 Histórias da Bíblia • 10h00 Cidadania & Direitos • 12h00 Meio Dia News pontual ao vivo.', 14, legendY);

  // ═════════════════════════════════════════════════════════════════════════════
  // PÁGINA 3: TABELA DA GRADE NOTURNA & MADRUGADA (15h30 às 06h00)
  // ═════════════════════════════════════════════════════════════════════════════
  doc.addPage();
  drawHeader('GRADE SEMANAL • FAIXA NOITE & MADRUGADA');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_PRIMARY);
  doc.text('TABELA DE TRANSMISSÃO SEMANAL — FAIXA NOTURNA & MADRUGADA (15h30 às 06h00)', 14, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR_MUTED);
  doc.text('Horários nobres, noites temáticas e o grande Corujão GSA', 14, 30);

  autoTable(doc, {
    startY: 33,
    head: [['Horário', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']],
    body: [
      ['15:30', 'GSA Business', 'GSA Tech', 'GSA Business', 'GSA Tech', 'GSA Business', 'GSA Cinema', 'GSA Cinema'],
      ['16:30', 'GSA Planeta Terra', 'GSA Planeta Terra', 'GSA Planeta Terra', 'GSA Planeta Terra', 'GSA Planeta Terra', 'GSA Cinema — Continuação', 'GSA Cinema — Continuação'],
      ['17:00', 'GSA TÁ NA REDE', 'GSA TÁ NA REDE', 'GSA TÁ NA REDE', 'GSA TÁ NA REDE', 'GSA TÁ NA REDE', 'GSA Esportes', 'GSA Esportes'],
      ['17:30', 'GSA Motor', 'GSA Motor', 'GSA Motor', 'GSA Motor', 'GSA Motor', 'GSA Destinos', 'GSA Destinos'],
      ['18:00', 'GSA MUSIC', 'GSA MUSIC', 'GSA MUSIC', 'GSA MUSIC', 'GSA MUSIC', 'GSA MUSIC', 'GSA MUSIC'],
      ['18:55', 'GSA Tempo', 'GSA Tempo', 'GSA Tempo', 'GSA Tempo', 'GSA Tempo', 'GSA Tempo', 'GSA Tempo'],
      ['19:00', 'GSA NEWS NOITE', 'GSA NEWS NOITE', 'GSA NEWS NOITE', 'GSA NEWS NOITE', 'GSA NEWS NOITE', 'GSA News Esp.', 'GSA News Esp.'],
      ['19:30', 'GSA Mercado', 'GSA Mercado', 'GSA Mercado', 'GSA Mercado', 'GSA Mercado', 'GSA News Esp.', 'GSA News Esp.'],
      ['20:00', 'GSA EM FÉ', 'GSA EM FÉ', 'GSA EM FÉ', 'GSA EM FÉ', 'GSA EM FÉ', 'GSA EM FÉ', 'GSA EM FÉ'],
      ['20:30', 'GSA Cidadania', 'GSA Cidadania', 'GSA Cidadania', 'GSA Cidadania', 'GSA Cidadania', 'GSA Tá na Rede Web', 'GSA Tá na Rede Web'],
      ['21:00', 'GSA MUSIC', 'GSA MUSIC', 'GSA MUSIC', 'GSA MUSIC', 'GSA MUSIC', 'GSA MUSIC', 'GSA MUSIC'],
      ['22:00', 'GSA Doc', 'GSA Mistérios', 'GSA Sessão Pipoca', 'GSA Mistérios', 'GSA Doc', 'GSA Doc', 'GSA Doc Especial'],
      ['23:00', 'GSA EM FÉ', 'GSA EM FÉ', 'GSA EM FÉ', 'GSA EM FÉ', 'GSA EM FÉ', 'GSA EM FÉ', 'GSA EM FÉ'],
      ['23:30', 'GSA News Not.', 'GSA News Not.', 'GSA Sessão Pipoca — Continuação', 'GSA News Not.', 'GSA News Not.', 'GSA Mistérios Not.', 'GSA Em Fé Reflexão'],
      ['00:00', 'GSA Sessão Pipoca — Madrugada', 'GSA Sessão Pipoca — Madrugada', 'GSA Sessão Pipoca — Madrugada', 'GSA Sessão Pipoca — Madrugada', 'GSA Sessão Pipoca — Madrugada', 'GSA Sessão Pipoca — Madrugada', 'GSA Sessão Pipoca — Madrugada'],
      ['01:45', 'GSA Documentário Especial', 'GSA Documentário Especial', 'GSA Documentário Especial', 'GSA Documentário Especial', 'GSA Documentário Especial', 'GSA Documentário Especial', 'GSA Documentário Especial'],
      ['02:45', 'GSA Mistérios da Noite', 'GSA Mistérios da Noite', 'GSA Mistérios da Noite', 'GSA Mistérios da Noite', 'GSA Mistérios da Noite', 'GSA Mistérios da Noite', 'GSA Mistérios da Noite'],
      ['03:45', 'GSA Tá na Rede Madrugada', 'GSA Tá na Rede Madrugada', 'GSA Tá na Rede Madrugada', 'GSA Tá na Rede Madrugada', 'GSA Tá na Rede Madrugada', 'GSA Tá na Rede Madrugada', 'GSA Tá na Rede Madrugada'],
      ['04:15', 'GSA Noite de Louvor', 'GSA Noite de Louvor', 'GSA Noite de Louvor', 'GSA Noite de Louvor', 'GSA Noite de Louvor', 'GSA Noite de Louvor', 'GSA Noite de Louvor'],
      ['05:15', 'GSA Destinos do Mundo', 'GSA Destinos do Mundo', 'GSA Destinos do Mundo', 'GSA Destinos do Mundo', 'GSA Destinos do Mundo', 'GSA Destinos do Mundo', 'GSA Destinos do Mundo'],
    ],
    theme: 'grid',
    headStyles: { fillColor: COLOR_PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center' },
    bodyStyles: { fontSize: 7.2, textColor: [30, 41, 59], cellPadding: 2.2, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 16, fontStyle: 'bold', fillColor: [241, 245, 249] },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: function (data) {
      // Destaque GSA Music
      if ((data.row.index === 4 || data.row.index === 10) && data.column.index > 0) {
        data.cell.styles.fillColor = [243, 232, 255];
        data.cell.styles.textColor = [107, 33, 168];
        data.cell.styles.fontStyle = 'bold';
      }
      // Destaque News Noite
      if (data.row.index === 6 && data.column.index > 0) {
        data.cell.styles.fillColor = [224, 231, 255];
        data.cell.styles.textColor = [30, 58, 138];
        data.cell.styles.fontStyle = 'bold';
      }
      // Destaque GSA Em Fé
      if ((data.row.index === 8 || data.row.index === 12) && data.column.index > 0) {
        data.cell.styles.fillColor = [255, 251, 235];
        data.cell.styles.textColor = [161, 98, 7];
        data.cell.styles.fontStyle = 'bold';
      }
    }
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // PÁGINA 4: CATÁLOGO DETALHADO — JORNALISMO, CIDADANIA & FÉ
  // ═════════════════════════════════════════════════════════════════════════════
  doc.addPage();
  drawHeader('CATÁLOGO DETALHADO • JORNALISMO & CIDADANIA');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_PRIMARY);
  doc.text('CATÁLOGO OFICIAL DE PROGRAMAS — BLOCOS 1 E 2', 14, 25);

  autoTable(doc, {
    startY: 30,
    head: [['Programa & Bloco', 'Horários & Duração', 'Formato & Produção', 'Descrição Completa do Conteúdo']],
    body: [
      [
        '[NEWS] GSA Manhã News',
        'Seg a Sáb: 07h30\nDuração: 25 min',
        'Telejornal Matutino Ágil\nProdução: Híbrida IA / Acervo',
        'Abertura informativa com giro completo pelas principais capitais brasileiras, condições climáticas, situação do trânsito nas metrópoles e primeiras notícias da economia. Linguagem rápida e dinâmica para quem está saindo para o trabalho.'
      ],
      [
        '[CLIMA] GSA Tempo ⭐',
        'Diário: 07h25, 11h55 e 18h55\nDuração: 5 min',
        'Pílula Meteorológica Dinâmica\nProdução: Mapas de Satélite',
        'Boletim meteorológico estratégico com mapas interativos de todas as regiões brasileiras, alertas da Defesa Civil, previsão para plantio e colheita do agronegócio e temperaturas máximas e mínimas antes dos três telejornais.'
      ],
      [
        '[NEWS] GSA Meio Dia News\n(Edição Pontual 12h00)',
        'Seg a Dom: 12h00\nDuração: 30 min',
        'Telejornal Vespertino\nProdução: Híbrida IA / Acervo',
        'O telejornal de almoço da emissora, entrando no ar com precisão matemática às 12h00 em ponto. Cobertura factual dos fatos da manhã, serviços úteis ao cidadão, direitos do consumidor, giro das cidades e resumo internacional.'
      ],
      [
        '[ECON] GSA Mercado',
        'Seg a Sex: 12h30 (Rep. 19h30)\nDuração: 30 min',
        'Painel Econômico\nProdução: Dados B3 / IA',
        'Análise didática das oscilações da B3 (Ibovespa), cotações do Dólar Comercial e Turismo, Euro, commodities agrícolas (soja, café, boi gordo) e inflação. Cartelas gráficas explicativas sobre finanças pessoais e investimentos.'
      ],
      [
        '[SOCIAL] GSA Cidadania ⭐',
        'Seg a Sex: 10h00 (Rep. 20h30)\nDuração: 30 min',
        'Revista de Utilidade Pública\nProdução: Órgãos Oficiais & IA',
        'Consultoria prática e acessível para o povo brasileiro: INSS, regras de aposentadoria, auxílios (BPC e Bolsa Família), direitos do consumidor no Procon, microempreendedor individual (MEI), direitos trabalhistas e pequenas causas.'
      ],
      [
        '[NEWS] GSA News Noite\n(Grande Edição de Bancada)',
        'Seg a Sex: 19h00 (Rep. 23h30)\nDuração: 30 min',
        'Telejornal Nobre de Bancada\nApresentadores IA: Holt & Nyla',
        'O principal produto jornalístico da casa. Análise profunda dos fatos mais relevantes do Brasil e do mundo, grandes reportagens de tecnologia e impacto social, comentários editoriais e os desdobramentos políticos do dia.'
      ],
      [
        '[BIZ] GSA Business',
        'Seg, Qua e Sex: 08h00 / 15h30\nDuração: 45 min',
        'Revista Corporativa\nProdução: Acervo & IA',
        'Programa dedicado a gestores, microempresários e líderes de mercado. Aborda cases de sucesso, gestão inteligente de serviços, novos modelos de franquias, governança, produtividade e inovação corporativa.'
      ],
      [
        '[FÉ] GSA Em Fé\n(6 Edições Diárias Sagradas)',
        'Diário: 07h, 09h, 13h, 15h, 20h e 23h\nDuração: 15 a 30 min',
        'Espiritualidade & Oração\nProdução: Mensagens & Louvor',
        'As 6 colunas sagradas de bênção e paz da família:\n' +
        '• 07h00: O Despertar da Fé (Salmos e força para o dia)\n' +
        '• 09h00: A Oração da Manhã (Gratidão e intercessão)\n' +
        '• 13h00: Bênção da Tarde (Reflexão do almoço e ânimo de trabalho)\n' +
        '• 15h00: Hora da Misericórdia (Perdão, reconciliação e esperança)\n' +
        '• 20h00: A Bênção da Família (União dos lares e harmonia)\n' +
        '• 23h00: A Oração da Noite (Descanso sereno e sono tranquilo).'
      ]
    ],
    theme: 'grid',
    headStyles: { fillColor: COLOR_PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    bodyStyles: { fontSize: 7.4, textColor: [30, 41, 59], cellPadding: 2.8 },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 32 },
      2: { cellWidth: 38 },
      3: { cellWidth: 'auto' }
    }
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // PÁGINA 5: CATÁLOGO DETALHADO — BÍBLIA, MÚSICA, CAMPO E GASTRONOMIA
  // ═════════════════════════════════════════════════════════════════════════════
  doc.addPage();
  drawHeader('CATÁLOGO DETALHADO • BÍBLIA, MÚSICA & CAMPO');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_PRIMARY);
  doc.text('CATÁLOGO OFICIAL DE PROGRAMAS — BLOCOS 3 E 4', 14, 25);

  autoTable(doc, {
    startY: 30,
    head: [['Programa & Bloco', 'Horários & Duração', 'Formato & Produção', 'Descrição Completa do Conteúdo']],
    body: [
      [
        '[BÍBLIA] GSA Histórias da Bíblia ⭐',
        'Seg a Dom: 09h30\nDuração: 30 min',
        'Animações & Dramatizações\nAcervo: Narrativas Bíblicas',
        'Narrativas clássicas das Sagradas Escrituras em formato visual lúdico e educativo para toda a família (A Criação, A Arca de Noé, Davi e Golias, Daniel na Cova dos Leões, Parábolas de Jesus), ensinando fé, honra e virtudes morais.'
      ],
      [
        '[MÚSICA] GSA Music\n(Dose Dupla Todos os Dias)',
        'Diário: 18h00 e 21h00\nDuração: 45 a 60 min',
        'Música Cristã & Gospel\nProdução: Acervo e Gravadoras',
        'Os maiores nomes do louvor, adoração e música cristã contemporânea. Clipes em alta resolução, rankings das canções mais executadas, apresentações de corais, orquestras sacras e grandes encontros de adoração.'
      ],
      [
        '[FÉ] GSA Motivação',
        'Sáb e Dom: 08h00\nDuração: 30 min',
        'Superação Pessoal\nProdução: Palestras & Histórias',
        'Histórias inspiradoras de vida, superação de adversidades, foco em hábitos saudáveis, disciplina e mensagens de encorajamento para começar o fim de semana com energia renovada.'
      ],
      [
        '[AGRO] GSA Agro',
        'Sáb e Dom: 06h00 às 07h00\nDuração: 60 min',
        'Revista do Agronegócio\nParcerias: Embrapa / MAPA / Senar',
        'O homem do campo e a potência do agro brasileiro. Tecnologia no campo, manejo sustentável, inovação em maquinário agrícola, previsão climática para plantio e colheita, cotações de safras e técnicas de pecuária moderna.'
      ],
      [
        '[SABOR] GSA Sabor',
        'Seg a Sex: 11h30\nDom: 12h30\nDuração: 30 min',
        'Culinária & Gastronomia\nProdução: Chefs & Regional',
        'O programa que abre o apetite da família ao meio-dia. Receitas práticas, econômicas e saborosas da culinária tradicional brasileira, dicas de chefs, confeitaria, reaproveitamento de alimentos e segredos culinários.'
      ],
      [
        '[TURISMO] GSA Destinos',
        'Seg a Sex: 11h00\nSáb e Dom: 17h30\nDuração: 30 min',
        'Viagens & Ecoturismo\nProdução: Acervo Documental',
        'Uma jornada pelas cidades mais fascinantes do Brasil e do planeta. Paisagens paradisíacas, centros históricos, parques ecológicos preservados, gastronomia local e guias práticos para viajantes e famílias.'
      ],
      [
        '[MOTOR] GSA Motor',
        'Seg a Sex: 17h30\nSáb: 12h30 | Dom: 11h30\nDuração: 30 a 45 min',
        'Universo Automotivo\nProdução: Testes & Especialistas',
        'Lançamentos da indústria automotiva, testes de performance de veículos nacionais e importados, mobilidade elétrica, restauração de carros clássicos colecionáveis e orientações de segurança viária.'
      ],
      [
        '[SAÚDE] GSA Bem Viver',
        'Seg a Sex: 06h00\nFins de Semana: 08h30\nDuração: 30 min',
        'Saúde & Bem-Estar\nProdução: Médicos & Educadores',
        'Orientações médicas preventivas, saúde mental, nutrição balanceada, rotina de exercícios físicos em casa e qualidade de vida para todas as idades, com foco especial na longevidade ativa.'
      ]
    ],
    theme: 'grid',
    headStyles: { fillColor: COLOR_PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    bodyStyles: { fontSize: 7.4, textColor: [30, 41, 59], cellPadding: 2.8 },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 32 },
      2: { cellWidth: 38 },
      3: { cellWidth: 'auto' }
    }
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // PÁGINA 6: CATÁLOGO DETALHADO — CINEMA, CIÊNCIA & CORUJÃO
  // ═════════════════════════════════════════════════════════════════════════════
  doc.addPage();
  drawHeader('CATÁLOGO DETALHADO • CINEMA, CIÊNCIA & MADRUGADA');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_PRIMARY);
  doc.text('CATÁLOGO OFICIAL DE PROGRAMAS — BLOCOS 5 E 6', 14, 25);

  autoTable(doc, {
    startY: 30,
    head: [['Programa & Bloco', 'Horários & Duração', 'Formato & Produção', 'Descrição Completa do Conteúdo']],
    body: [
      [
        '[NATUREZA] GSA Planeta Terra ⭐',
        'Seg a Sex: 16h30\nDuração: 30 min',
        'Vida Selvagem & Ecologia\nProdução: Acervo Documental',
        'A beleza grandiosa da fauna e flora mundiais: os segredos dos oceanos, florestas tropicais, expedições pelos polos e o comportamento animal em alta definição, trazendo enriquecimento e paz para a tarde da família.'
      ],
      [
        '[CINE] GSA Sessão Pipoca',
        'Sáb e Dom: 13h30\nQuarta: 22h00\nDuração: 75 a 90 min',
        'Sessão de Cinema Completa\nAcervo: Filmes Clássicos Livres',
        'Grandes filmes da era de ouro do cinema mundial restaurados. Clássicos da comédia, faroeste, suspense e aventura adequados para toda a família curtir junta na tarde do fim de semana e na noite de quarta-feira.'
      ],
      [
        '[WEB] GSA Tá na Rede\n(A Grande Edição Diária)',
        'Seg a Sex: 17h00\nFins de Semana: 10h/11h\nDuração: 30 min',
        'Cultura Digital & Memes\nProdução: Monitoramento Viral',
        'Os vídeos mais engraçados e impressionantes que dominaram a internet na semana. Tendências do TikTok, Instagram e YouTube, curiosidades dos influenciadores digitais e debates sobre segurança na rede.'
      ],
      [
        '[INFANTIL] GSA Desenhos',
        'Seg a Sex: 13h30\nDuração: 60 min',
        'Animações Clássicas\nAcervo: Domínio Público Educativo',
        'Espaço dedicado à infância com animações clássicas de domínio público, historinhas educativas, valores morais e personagens que encantam gerações com leveza e segurança de conteúdo.'
      ],
      [
        '[CIÊNCIA] GSA Mistérios & Curiosidades',
        'Ter e Qui: 22h00\nSáb: 23h30 (Reprise)\nDuração: 45 min',
        'Documentários & Enigmas\nProdução: Acervo Histórico',
        'Arqueologia misteriosa, monumentos das civilizações antigas, exploração espacial profunda da NASA, fenômenos da natureza sem explicação e as maiores teorias da ciência contemporânea.'
      ],
      [
        '[TECH] GSA Tech',
        'Ter e Qui: 08h00 / 15h30\nSábado: 11h00\nDuração: 45 min',
        'Inovação & IA\nProdução: IA & Tech Reviews',
        'O mundo das tecnologias emergentes, Inteligência Artificial generativa, robótica, novos smartphones e computadores, cibersegurança e o futuro da sociedade hiperconectada.'
      ],
      [
        '[CULTURA] GSA Doc',
        'Seg, Sex, Sáb e Dom: 22h00\nDuração: 60 min',
        'Grandes Documentários\nProdução: Acervos Globais',
        'Documentários internacionais premiados sobre vida selvagem, biografias de grandes líderes da humanidade, marcos históricos da civilização e conquistas científicas.'
      ],
      [
        '[CORUJÃO] GSA Sessão Pipoca — Madrugada & Faixa Corujão',
        'Diário: 00h00 às 06h00\nDuração: 6 Horas Contínuas',
        'Maratona Noturna Ouro\nProdução: Filmes, Docs & Fé',
        'Programação contínua da madrugada:\n' +
        '• 00h00: GSA Sessão Pipoca — Madrugada (Filmes clássicos em sequência)\n' +
        '• 01h45: GSA Documentário Especial Internacional\n' +
        '• 02h45: GSA Mistérios da Noite (Ciência e descobertas)\n' +
        '• 03h45: GSA Tá na Rede Madrugada (Curiosidades web)\n' +
        '• 04h15: GSA Noite de Louvor (Sessão de louvor para quem vigia)\n' +
        '• 05h15: GSA Destinos do Mundo (Amanhecer em cidades globais).'
      ]
    ],
    theme: 'grid',
    headStyles: { fillColor: COLOR_PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    bodyStyles: { fontSize: 7.4, textColor: [30, 41, 59], cellPadding: 2.8 },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold' },
      1: { cellWidth: 32 },
      2: { cellWidth: 38 },
      3: { cellWidth: 'auto' }
    }
  });

  // Box inferior de diretrizes operacionais
  const finalY = doc.lastAutoTable.finalY + 5;
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, finalY, pageWidth - 28, 18, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, finalY, pageWidth - 28, 18, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR_PRIMARY);
  doc.text('DIRETRIZES DE CONTINUIDADE E OPERAÇÃO MASTER:', 18, finalY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  doc.text(
    '1. Toda transição entre atrações deve respeitar os tempos padronizados (1.5s para Fade e 2.0s para Dissolve).\n' +
    '2. O sinal da VPS opera em modo contínuo para evitar que a live do YouTube encerre por perda de chave RTMP.\n' +
    '3. Em caso de quebra imprevista de sinal, acione imediatamente o botão "Intervalo & Continuidade".',
    18,
    finalY + 10.5
  );

  // ═════════════════════════════════════════════════════════════════════════════
  // APLICAÇÃO DE RODAPÉ COM NUMERAÇÃO EM TODAS AS PÁGINAS
  // ═════════════════════════════════════════════════════════════════════════════
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(i, totalPages);
  }

  // Gravação do Arquivo
  const buffer = Buffer.from(doc.output('arraybuffer'));

  const outputPaths = [
    path.join(__dirname, '..', 'public', 'guia-programacao-gsa-tv.pdf'),
    path.join('C:', 'Users', 'Adriano Farias', 'Downloads', 'Guia_de_Programacao_GSA_TV_24H.pdf'),
    path.join('C:', 'Users', 'Adriano Farias', '.gemini', 'antigravity', 'brain', '50e21a00-fa09-44b5-9f62-60b76cc0338f', 'Guia_de_Programacao_GSA_TV_24H.pdf')
  ];

  for (const outPath of outputPaths) {
    try {
      const dir = path.dirname(outPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(outPath, buffer);
      console.log('PDF gravado com sucesso em:', outPath);
    } catch (err) {
      console.error('Erro ao gravar em', outPath, err.message);
    }
  }

  return outputPaths;
}

generatePdf();
