import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { OrdemFiscal } from '../../../types';
import { formatCurrency, formatDate } from '../../../lib/utils';
import { FileText, Download, Receipt, Search, Eye, Printer, FileDown } from 'lucide-react';
import { Modal } from '../../ui/Modal';

const RECEIPT_PRINT_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; padding: 40px; color: #111; background: #fff; }
  .header { border-bottom: 3px solid #111; padding-bottom: 20px; margin-bottom: 24px; }
  .title { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase; }
  .subtitle { font-size: 11px; color: #666; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; margin-top: 4px; }
  .code { font-size: 13px; font-weight: 700; color: #4f46e5; margin-top: 8px; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #666; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
  .row { display: flex; justify-content: space-between; gap: 24px; padding: 6px 0; border-bottom: 1px solid #f5f5f5; }
  .row label { font-size: 12px; color: #555; font-weight: 600; }
  .row span { font-size: 12px; font-weight: 700; color: #111; text-align: right; overflow-wrap: anywhere; }
  .total-row { border-top: 2px solid #111; margin-top: 8px; padding-top: 12px; }
  .total-row label { font-size: 14px; font-weight: 900; }
  .total-row span { font-size: 18px; font-weight: 900; color: #4f46e5; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
  .badge-pago { background: #d1fae5; color: #065f46; }
  .badge-pendente { background: #fef3c7; color: #92400e; }
  .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #999; letter-spacing: 1px; }
  @media print { body { padding: 20px; } }
`;

function appendPrintElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  parent: Node,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  parent.appendChild(element);
  return element;
}

function appendReceiptSection(
  doc: Document,
  parent: Node,
  title: string,
  rows: Array<[label: string, value: string, valueClass?: string, rowClass?: string]>,
) {
  const section = appendPrintElement(doc, parent, 'div', 'section');
  appendPrintElement(doc, section, 'div', 'section-title', title);
  rows.forEach(([label, value, valueClass, rowClass]) => {
    const row = appendPrintElement(doc, section, 'div', `row${rowClass ? ` ${rowClass}` : ''}`);
    appendPrintElement(doc, row, 'label', undefined, label);
    appendPrintElement(doc, row, 'span', valueClass, value);
  });
}

function formatReceiptAmount(value: unknown) {
  const amount = Number(value);
  return (Number.isFinite(amount) ? amount : 0).toFixed(2).replace('.', ',');
}

function renderFiscalReceipt(doc: Document, ordem: OrdemFiscal) {
  const purchaseTypeLabels: Record<string, string> = {
    servico: 'Serviço',
    produto: 'Produto',
    assinatura: 'Assinatura',
  };
  const issueStatusLabels: Record<string, string> = {
    pendente_emissao: 'Pendente Emissão',
    emitida: 'Emitida',
    cancelada: 'Cancelada',
    inutilizada: 'Inutilizada',
  };

  doc.documentElement.lang = 'pt-BR';
  doc.title = `Recibo Fiscal — ${String(ordem.codigo_fiscal || '')}`;
  doc.head.replaceChildren();
  const charset = doc.createElement('meta');
  charset.setAttribute('charset', 'UTF-8');
  doc.head.appendChild(charset);
  const style = doc.createElement('style');
  style.textContent = RECEIPT_PRINT_STYLES;
  doc.head.appendChild(style);
  doc.body.replaceChildren();

  const header = appendPrintElement(doc, doc.body, 'div', 'header');
  appendPrintElement(doc, header, 'div', 'title', 'Recibo Fiscal');
  appendPrintElement(doc, header, 'div', 'subtitle', 'Grupo GSA — Gestão de Serviços');
  appendPrintElement(doc, header, 'div', 'code', String(ordem.codigo_fiscal || '—'));

  const clientRows: Array<[string, string]> = [
    ['Nome', String(ordem.cliente_nome || '—')],
    ['CPF / CNPJ', String(ordem.cliente_documento || '—')],
    ['Telefone', String(ordem.cliente_telefone || '—')],
  ];
  if (ordem.cliente_email) clientRows.push(['Email', String(ordem.cliente_email)]);
  appendReceiptSection(doc, doc.body, 'Dados do Cliente', clientRows);

  const purchaseRows: Array<[string, string]> = [
    ['Tipo', purchaseTypeLabels[ordem.tipo_compra || ''] || '—'],
    ['Descrição', String(ordem.descricao_item || '—')],
  ];
  if (ordem.codigo_ordem) purchaseRows.push(['Código da Ordem', String(ordem.codigo_ordem)]);
  if (ordem.codigo_orcamento) purchaseRows.push(['Código do Orçamento', String(ordem.codigo_orcamento)]);
  appendReceiptSection(doc, doc.body, 'Detalhes da Compra', purchaseRows);

  const valueRows: Array<[string, string, string?, string?]> = [
    ['Valor Bruto', `R$ ${formatReceiptAmount(ordem.valor_bruto)}`],
  ];
  if (Number(ordem.valor_desconto) > 0) valueRows.push(['Desconto', `- R$ ${formatReceiptAmount(ordem.valor_desconto)}`]);
  if (Number(ordem.valor_acrescimo) > 0) valueRows.push(['Acréscimo', `+ R$ ${formatReceiptAmount(ordem.valor_acrescimo)}`]);
  valueRows.push(['Total', `R$ ${formatReceiptAmount(ordem.valor_total)}`, undefined, 'total-row']);
  appendReceiptSection(doc, doc.body, 'Valores', valueRows);

  const paid = ordem.status_pagamento === 'pago';
  const paymentRows: Array<[string, string, string?]> = [
    ['Status', paid ? 'Pago' : 'Pendente', `badge ${paid ? 'badge-pago' : 'badge-pendente'}`],
  ];
  if (ordem.forma_pagamento) paymentRows.push(['Forma de Pagamento', String(ordem.forma_pagamento).toUpperCase()]);
  if (ordem.data_pagamento) paymentRows.push(['Data do Pagamento', formatDate(ordem.data_pagamento)]);
  appendReceiptSection(doc, doc.body, 'Pagamento', paymentRows);

  const invoiceRows: Array<[string, string]> = [
    ['Status de Emissão', issueStatusLabels[ordem.status_emissao || ''] || '—'],
  ];
  if (ordem.numero_nota) invoiceRows.push(['Número da NF', String(ordem.numero_nota)]);
  if (ordem.data_emissao) invoiceRows.push(['Data de Emissão', formatDate(ordem.data_emissao)]);
  appendReceiptSection(doc, doc.body, 'Nota Fiscal', invoiceRows);

  appendPrintElement(
    doc,
    doc.body,
    'div',
    'footer',
    `Gerado em ${formatDate(new Date())} • Sistema GSA Gestão de Serviços`,
  );
}

export function NotasFiscaisList({ clientId, initialItemId }: { clientId: string, initialItemId?: string }) {
  const [ordens, setOrdens] = useState<OrdemFiscal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedOrdem, setSelectedOrdem] = useState<OrdemFiscal | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    fetchOrdens();
  }, [clientId]);

  useEffect(() => {
    const handleOpenItem = (e: any) => {
      const itemId = e.detail?.itemId;
      if (itemId && ordens.length > 0) {
        const item = ordens.find(o => o.id === itemId);
        if (item) {
          setSelectedOrdem(item);
          setIsDetailOpen(true);
        }
      }
    };
    window.addEventListener('open-nf-detail', handleOpenItem);
    return () => window.removeEventListener('open-nf-detail', handleOpenItem);
  }, [ordens]);

  useEffect(() => {
    const channel = supabase
      .channel('client-nf-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ordens_fiscais',
        filter: `cliente_id=eq.${clientId}`
      }, () => {
        fetchOrdens();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clientId]);

  const fetchOrdens = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ordens_fiscais')
        .select('*')
        .eq('cliente_id', clientId)
        .eq('status_emissao', 'emitida')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrdens(data || []);
    } catch (err) {
      console.error('Erro ao buscar ordens fiscais:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrdens = ordens.filter(o => 
    o.codigo_fiscal?.toLowerCase().includes(search.toLowerCase()) ||
    o.descricao_item?.toLowerCase().includes(search.toLowerCase()) ||
    o.numero_nota?.toLowerCase().includes(search.toLowerCase())
  );

  const handlePrintReceipt = (ordem: OrdemFiscal) => {
    const printWindow = window.open('about:blank', '_blank', 'noopener,noreferrer');
    if (!printWindow) return;
    printWindow.opener = null;

    renderFiscalReceipt(printWindow.document, ordem);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight text-neutral-900">Minhas Notas Fiscais</h2>
          <p className="text-sm text-neutral-500">Documentos fiscais referentes aos seus produtos e serviços.</p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Buscar por código ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-neutral-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-12 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          </div>
        ) : filteredOrdens.length === 0 ? (
          <div className="col-span-full py-12 text-center rounded-3xl bg-neutral-50 border border-neutral-100 flex flex-col items-center justify-center">
            <Receipt className="h-12 w-12 text-neutral-300 mb-3" />
            <p className="text-sm font-bold text-neutral-600">Nenhuma nota fiscal encontrada.</p>
            <p className="text-xs text-neutral-500 mt-1">Sujas notas fiscais emitidas aparecerão aqui.</p>
          </div>
        ) : (
          filteredOrdens.map((ordem) => (
            <div key={ordem.id} id={`nf-${ordem.id}`} className={`relative flex flex-col rounded-3xl bg-white p-5 sm:p-6 shadow-sm border transition-all hover:shadow-md ${initialItemId === ordem.id ? 'border-indigo-400 ring-2 ring-indigo-100 shadow-md scale-[1.01]' : 'border-neutral-200'}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 flex items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-indigo-600">{ordem.codigo_fiscal}</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">NF Nº {ordem.numero_nota || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-black text-neutral-900">{formatCurrency(ordem.valor_total)}</span>
                  <span className="text-[9px] font-bold text-neutral-400 mt-0.5">{formatDate(ordem.data_emissao || ordem.created_at)}</span>
                </div>
              </div>

              <div className="mb-5 flex-1 space-y-3">
                <div>
                  <p className="text-[9px] font-black uppercase text-neutral-400 tracking-widest mb-0.5">Descrição / Serviço</p>
                  <p className="text-xs font-bold text-neutral-700 line-clamp-2">{ordem.descricao_item || 'Serviços/Produtos Diversos'}</p>
                </div>
                
                <div className="flex flex-wrap gap-1.5">
                  {ordem.codigo_orcamento && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/10">
                      ORÇ: {ordem.codigo_orcamento}
                    </span>
                  )}
                  {ordem.codigo_ordem && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/10">
                      OS/OC: {ordem.codigo_ordem}
                    </span>
                  )}
                  {ordem.forma_pagamento && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                      PGTO: {ordem.forma_pagamento.replace(/_/g, ' ')}
                    </span>
                  )}
                  {ordem.tipo_compra && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-neutral-100 text-neutral-600 ring-1 ring-inset ring-neutral-500/10">
                      {ordem.tipo_compra}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 border-t border-neutral-100 pt-4 mt-auto">
                <button 
                  onClick={() => { setSelectedOrdem(ordem); setIsDetailOpen(true); }}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#1a1a1a] py-2.5 text-xs font-bold text-white hover:bg-black transition-all shadow-sm"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver Detalhes
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Detalhes da Ordem Fiscal">
        {selectedOrdem && (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-neutral-50 ring-1 ring-neutral-200">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-mono text-lg font-black text-indigo-600">{selectedOrdem.codigo_fiscal}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">NF Nº {selectedOrdem.numero_nota || 'N/A'}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-neutral-900">{formatCurrency(selectedOrdem.valor_total)}</p>
                  <p className="text-xs text-neutral-500">{formatDate(selectedOrdem.data_emissao || selectedOrdem.created_at)}</p>
                </div>
              </div>
              <div className="border-t border-neutral-200 mt-3 pt-3">
                <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-1">Descrição Detalhada</p>
                <p className="text-sm font-bold text-neutral-800">{selectedOrdem.descricao_item}</p>
                
                <div className="grid grid-cols-2 gap-4 mt-4">
                  {selectedOrdem.codigo_orcamento && (
                    <div>
                      <p className="text-[9px] font-black uppercase text-neutral-400 tracking-widest mb-0.5">Orçamento Origem</p>
                      <p className="text-xs font-bold text-neutral-900">{selectedOrdem.codigo_orcamento}</p>
                    </div>
                  )}
                  {selectedOrdem.codigo_ordem && (
                    <div>
                      <p className="text-[9px] font-black uppercase text-neutral-400 tracking-widest mb-0.5">Ordem de Serviço/Compra</p>
                      <p className="text-xs font-bold text-neutral-900">{selectedOrdem.codigo_ordem}</p>
                    </div>
                  )}
                  {selectedOrdem.forma_pagamento && (
                    <div>
                      <p className="text-[9px] font-black uppercase text-neutral-400 tracking-widest mb-0.5">Forma de Pagamento</p>
                      <p className="text-xs font-bold text-neutral-900 uppercase">{selectedOrdem.forma_pagamento.replace(/_/g, ' ')}</p>
                    </div>
                  )}
                  {selectedOrdem.tipo_compra && (
                    <div>
                      <p className="text-[9px] font-black uppercase text-neutral-400 tracking-widest mb-0.5">Categoria / Tipo</p>
                      <p className="text-xs font-bold text-neutral-900 uppercase">{selectedOrdem.tipo_compra}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-neutral-200 mt-3 pt-3">
                 <p className="text-[10px] font-black uppercase text-neutral-400 tracking-widest mb-2">Composição do Valor</p>
                 <div className="flex justify-between items-center text-xs mb-1">
                   <span className="text-neutral-500 font-bold">Valor Bruto / Unitário Base</span>
                   <span className="font-black text-neutral-700">{formatCurrency(selectedOrdem.valor_bruto || selectedOrdem.valor_total)}</span>
                 </div>
                 {Number(selectedOrdem.valor_desconto) > 0 && (
                   <div className="flex justify-between items-center text-xs mb-1 text-emerald-600">
                     <span className="font-bold">Descontos Aplicados</span>
                     <span className="font-black">- {formatCurrency(selectedOrdem.valor_desconto)}</span>
                   </div>
                 )}
                 {Number(selectedOrdem.valor_acrescimo) > 0 && (
                   <div className="flex justify-between items-center text-xs mb-1 text-rose-600">
                     <span className="font-bold">Acréscimos / Taxas</span>
                     <span className="font-black">+ {formatCurrency(selectedOrdem.valor_acrescimo)}</span>
                   </div>
                 )}
                 <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-neutral-200 border-dashed">
                   <span className="font-black text-neutral-900 uppercase tracking-widest">Valor Total Pago</span>
                   <span className="font-black text-indigo-600 text-base">{formatCurrency(selectedOrdem.valor_total)}</span>
                 </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-widest text-neutral-400">Documentos Disponíveis</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => handlePrintReceipt(selectedOrdem)}
                  className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white border-2 border-neutral-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
                >
                  <div className="h-10 w-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600 group-hover:bg-indigo-100 group-hover:text-indigo-600 mb-2 transition-all">
                    <Printer className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-bold text-neutral-900 group-hover:text-indigo-700">Baixar Recibo</span>
                  <span className="text-[10px] text-neutral-500 mt-1">Sempre disponível</span>
                </button>

                {selectedOrdem.arquivo_nf_url ? (
                  <a href={selectedOrdem.arquivo_nf_url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white border-2 border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all group">
                    <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-200 mb-2 transition-all">
                      <FileDown className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-bold text-neutral-900 group-hover:text-emerald-700">Baixar Nota Fiscal</span>
                    <span className="text-[10px] text-emerald-600 mt-1 font-medium">Download do PDF</span>
                  </a>
                ) : (
                  <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-neutral-50 border-2 border-neutral-100 cursor-not-allowed opacity-60">
                    <div className="h-10 w-10 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-400 mb-2">
                      <FileDown className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-bold text-neutral-500">Nota Fiscal</span>
                    <span className="text-[10px] text-neutral-400 mt-1">Aguardando upload</span>
                  </div>
                )}
              </div>
              {selectedOrdem.arquivo_nf_xml_url && (
                <div className="pt-2">
                  <a href={selectedOrdem.arquivo_nf_xml_url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-neutral-100 py-3 text-xs font-bold text-neutral-600 hover:bg-neutral-200 transition-all">
                    <Download className="h-4 w-4" /> Baixar XML da Nota Fiscal
                  </a>
                </div>
              )}
            </div>
            
            <div className="pt-4 border-t border-neutral-100">
              <button onClick={() => setIsDetailOpen(false)} className="w-full rounded-xl bg-neutral-100 py-3 font-bold text-neutral-600 hover:bg-neutral-200">
                Fechar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
