import React, { useEffect, useMemo, useState } from 'react';
import { BarChart2, TrendingUp, CheckCircle2, Clock, DollarSign, Download, Calendar, Filter, Users, FileText } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { api, isDemoMode, money } from '../../api';

type ReportData = {
  clients: number;
  orders: number;
  activeOrders: number;
  completedOrders: number;
  tickets: number;
  proposals: number;
  contracts: number;
  revenue: number;
  pending: number;
  averageOrder: number;
  sla: number;
};

const demoReportData: ReportData = {
  clients: 18, orders: 18, activeOrders: 18, completedOrders: 0, tickets: 3,
  proposals: 12, contracts: 7, revenue: 4850000, pending: 1200000,
  averageOrder: 345000, sla: 94.8
};

const normalizedStatus = (value: any) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function buildReportData(state: any): ReportData {
  const clients = Array.isArray(state?.clients) ? state.clients : [];
  const orders = Array.isArray(state?.orders) ? state.orders : [];
  const tickets = Array.isArray(state?.tickets) ? state.tickets : [];
  const proposals = Array.isArray(state?.proposals) ? state.proposals : [];
  const contracts = Array.isArray(state?.contracts) ? state.contracts : [];
  const invoices = Array.isArray(state?.invoices) ? state.invoices : [];
  const activeOrders = orders.filter((row: any) => !['concluida', 'cancelada', 'cancelado'].includes(normalizedStatus(row.status))).length;
  const completedOrders = orders.filter((row: any) => ['concluida', 'concluido'].includes(normalizedStatus(row.status))).length;
  const paidStatuses = ['paga', 'pago', 'paid', 'quitada', 'quitado'];
  const revenue = invoices.reduce((sum: number, invoice: any) => {
    if (paidStatuses.includes(normalizedStatus(invoice.status))) return sum + Number(invoice.total || invoice.amount || 0);
    return sum + (Array.isArray(invoice.installments) ? invoice.installments.filter((item: any) => paidStatuses.includes(normalizedStatus(item.status))).reduce((inner: number, item: any) => inner + Number(item.amount || item.value || 0), 0) : 0);
  }, 0);
  const pending = invoices.reduce((sum: number, invoice: any) => paidStatuses.includes(normalizedStatus(invoice.status)) ? sum : sum + Number(invoice.total || invoice.amount || 0), 0);
  const orderValues = [...contracts, ...invoices].map((row: any) => Number(row.total || row.amount || row.value || 0)).filter((value: number) => value > 0);
  const averageOrder = orderValues.length ? Math.round(orderValues.reduce((sum, value) => sum + value, 0) / orderValues.length) : 0;
  const sla = orders.length ? Math.round((completedOrders / orders.length) * 1000) / 10 : 0;
  return { clients: clients.length, orders: orders.length, activeOrders, completedOrders, tickets: tickets.length, proposals: proposals.length, contracts: contracts.length, revenue, pending, averageOrder, sla };
}

export function AdminReports() {
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [reportData, setReportData] = useState<ReportData>(demoReportData);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode) return;
    let cancelled = false;
    api('/state').then((state) => {
      if (!cancelled) setReportData(buildReportData(state));
    }).catch(() => {
      if (!cancelled) setReportData({ ...demoReportData, revenue: 0, pending: 0, averageOrder: 0, sla: 0 });
    });
    return () => { cancelled = true; };
  }, []);

  const reportLabels = useMemo(() => ({
    sla: `${reportData.sla.toFixed(1).replace('.', ',')}%`,
    revenue: money(reportData.revenue),
    pending: money(reportData.pending),
    averageOrder: money(reportData.averageOrder)
  }), [reportData]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleExportCsv = () => {
    const csvContent =
      'Resumo,Clientes,Ordens,Ordens ativas,Concluídas,Chamados,Faturamento pago,Faturamento pendente\n' +
      `GSA HUB,${reportData.clients},${reportData.orders},${reportData.activeOrders},${reportData.completedOrders},${reportData.tickets},${reportLabels.revenue},${reportLabels.pending}\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_sla_gsa_hub_${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Planilha CSV gerada e baixada com sucesso!');
  };

  const handleExportPdf = () => {
    // Gera um PDF real (com cabeçalho, conteúdo e tabela) para que o navegador
    // consiga abrir o arquivo, em vez de receber texto com MIME de PDF.
    const periodLabel = period === 'month' ? 'Este mes' : period === 'quarter' ? '3o trimestre' : 'Ano completo';
    const escapePdf = (value: string) => value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const stream = [
      'q',
      '0.13 0.35 0.92 rg', '0 742 595 100 re', 'f',
      '1 1 1 rg', 'BT', '/F1 24 Tf', '50 795 Td', '(GSA HUB) Tj', '/F1 10 Tf', '0 -20 Td', '(INTELIGENCIA OPERACIONAL) Tj', 'ET',
      '0.10 0.14 0.22 rg', 'BT', '/F1 20 Tf', '50 688 Td', '(Relatorio Executivo) Tj', '/F1 11 Tf', '0 -22 Td', `(${escapePdf(periodLabel)}) Tj`, 'ET',
      '0.88 0.93 1 rg', '50 545 150 95 re', 'f', '0.91 0.98 0.95 rg', '222 545 150 95 re', 'f', '1 0.95 0.82 rg', '394 545 151 95 re', 'f',
      '0.10 0.14 0.22 rg', 'BT', '/F1 9 Tf', '62 618 Td', '(SLA NO PRAZO) Tj', '/F1 22 Tf', '0 -32 Td', `(${escapePdf(reportLabels.sla)}) Tj`, 'ET',
      '0.10 0.14 0.22 rg', 'BT', '/F1 9 Tf', '234 618 Td', '(ORDENS EM EXECUCAO) Tj', '/F1 22 Tf', '0 -32 Td', `(${reportData.activeOrders}) Tj`, 'ET',
      '0.10 0.14 0.22 rg', 'BT', '/F1 9 Tf', '406 618 Td', '(FATURAMENTO PAGO) Tj', '/F1 18 Tf', '0 -32 Td', `(${escapePdf(reportLabels.revenue)}) Tj`, 'ET',
      '0.13 0.35 0.92 rg', '50 490 495 2 re', 'f',
      '0.10 0.14 0.22 rg', 'BT', '/F1 13 Tf', '50 455 Td', '(Resumo operacional) Tj', '/F1 11 Tf', '0 -28 Td', `(${escapePdf(`Ticket medio por OS: ${reportLabels.averageOrder}`)}) Tj`, '0 -22 Td', `(${escapePdf(`SLA com ${reportLabels.sla} de cumprimento no periodo.`)}) Tj`, '0 -22 Td', '(Relatorio gerado automaticamente pelo GSA HUB 3.0.) Tj', 'ET',
      '0.45 0.50 0.60 rg', 'BT', '/F1 8 Tf', '50 55 Td', '(GSA HUB 3.0  |  Documento executivo) Tj', 'ET', 'Q'
    ];
    const content = stream.join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets[index + 1] = pdf.length;
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const blob = new Blob([pdf], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    showToast('Relatório Executivo PDF gerado e aberto em uma nova aba!');
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#10b981',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            fontWeight: 600,
            fontSize: 14
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Relatórios & Inteligência Operacional</h1>
          <p className="page-subtitle">Indicadores de cumprimento de prazos (SLA), volume de ordens e faturamento.</p>
        </div>
        <div className="responsive-row" style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="md" icon={<Download size={16} />} onClick={handleExportCsv}>
            Exportar CSV
          </Button>
          <Button variant="primary" size="md" icon={<FileText size={16} />} onClick={handleExportPdf}>
            Gerar Relatório Executivo PDF
          </Button>
        </div>
      </div>

      {/* Period Filter Tabs */}
      <div className="responsive-row" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <Button
          variant={period === 'month' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setPeriod('month')}
        >
          Este Mês (Outubro/2026)
        </Button>
        <Button
          variant={period === 'quarter' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setPeriod('quarter')}
        >
          3º Trimestre (Jul - Set)
        </Button>
        <Button
          variant={period === 'year' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setPeriod('year')}
        >
          Ano Completo (2026)
        </Button>
      </div>

      {/* 4 Main SaaS Metric Cards */}
      <div className="grid-4-cols" style={{ marginBottom: 24 }}>
        <Card style={{ padding: 20 }}>
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>SLA no Prazo</span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#ecfdf5',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', marginTop: 8 }}>{reportLabels.sla}</div>
          <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#10b981', marginTop: 4 }}>
            <TrendingUp size={14} />
            <span>+2.4% vs mês anterior</span>
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>Ordens em Execução</span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Clock size={18} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', marginTop: 8 }}>{reportData.activeOrders}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            {reportData.completedOrders} concluídas • {reportData.activeOrders} em execução
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>Faturamento Realizado</span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#ecfdf5',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <DollarSign size={18} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', marginTop: 8 }}>{reportLabels.revenue}</div>
          <div style={{ fontSize: 12, color: '#10b981', marginTop: 4 }}>
            {reportLabels.pending} em aberto
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>Ticket Médio / OS</span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#fef3c7',
                color: '#b45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <TrendingUp size={18} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', marginTop: 8 }}>{reportLabels.averageOrder}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            Base de contratos recorrentes e avulsos
          </div>
        </Card>
      </div>

      {/* Two Column Section: Service Distribution + SLA Performance */}
      <div className="grid-2-cols" style={{ gap: 20, marginBottom: 24 }}>
        {/* Service Volume Breakdown */}
        <Card style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>
            Resumo de Serviços e Clientes
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                <span>Clientes cadastrados</span>
                <span>{reportData.clients}</span>
              </div>
              <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${reportData.clients ? 100 : 0}%`, background: '#2563eb', borderRadius: 4 }} />
              </div>
            </div>

            <div>
              <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                <span>Ordens de serviço</span>
                <span>{reportData.orders}</span>
              </div>
              <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${reportData.orders ? 100 : 0}%`, background: '#3b82f6', borderRadius: 4 }} />
              </div>
            </div>

            <div>
              <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                <span>Propostas registradas</span>
                <span>{reportData.proposals}</span>
              </div>
              <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${reportData.proposals ? 100 : 0}%`, background: '#10b981', borderRadius: 4 }} />
              </div>
            </div>

            <div>
              <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                <span>Contratos registrados</span>
                <span>{reportData.contracts}</span>
              </div>
              <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${reportData.contracts ? 100 : 0}%`, background: '#94a3b8', borderRadius: 4 }} />
              </div>
            </div>
          </div>
        </Card>

        {/* Operational Efficiency Card */}
        <Card style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>
            Indicadores Operacionais
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Chamados de suporte</span>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>{reportData.tickets}</strong>
            </div>
            <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Ordens em execução</span>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>{reportData.activeOrders}</strong>
            </div>
            <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Ordens concluídas</span>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>{reportData.completedOrders}</strong>
            </div>
            <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Faturas em aberto</span>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>{reportLabels.pending}</strong>
            </div>
          </div>
        </Card>
      </div>

      {/* Team SLA Performance Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
            Desempenho e Carga Operacional por Responsável (RPS)
          </h2>
        </div>
        <div className="table-responsive admin-mobile-card-table" role="region" aria-label="Desempenho por responsável" tabIndex={0}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, textTransform: 'uppercase' }}>
              <th style={{ padding: '14px 24px', fontWeight: 700 }}>Responsável (RPS)</th>
              <th style={{ padding: '14px 24px', fontWeight: 700 }}>Ordens Ativas</th>
              <th style={{ padding: '14px 24px', fontWeight: 700 }}>SLA Cumprido</th>
              <th style={{ padding: '14px 24px', fontWeight: 700 }}>Média de Entrega</th>
              <th style={{ padding: '14px 24px', fontWeight: 700 }}>Status de Carga</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-label="Responsável" style={{ padding: '16px 24px', fontWeight: 700, color: '#0f172a' }}>Equipe operacional</td>
              <td data-label="Ordens Ativas" style={{ padding: '16px 24px' }}>{reportData.activeOrders} ordens</td>
              <td data-label="SLA Cumprido" style={{ padding: '16px 24px', color: '#10b981', fontWeight: 700 }}>{reportLabels.sla}</td>
              <td data-label="Média de Entrega" style={{ padding: '16px 24px', color: '#64748b' }}>{reportData.completedOrders} concluídas</td>
              <td data-label="Carga" style={{ padding: '16px 24px' }}>
                <span className={`pill ${reportData.activeOrders ? 'pill--blue' : 'pill--green'}`} style={{ fontSize: 11 }}>{reportData.activeOrders ? 'Em execução' : 'Disponível'}</span>
              </td>
            </tr>
          </tbody>
        </table></div>
      </Card>
    </div>
  );
}

export default AdminReports;
