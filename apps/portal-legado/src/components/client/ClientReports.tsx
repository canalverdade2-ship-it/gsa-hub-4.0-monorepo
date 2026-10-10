import React from 'react';
import { BarChart2, FileText, Download, CheckCircle2, ShieldCheck, Calendar } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { isDemoMode } from '../../api';

export function ClientReports() {
  const reports = isDemoMode ? [
    {
      id: 'rep-1',
      title: 'Certidões Negativas de Débitos (CND Federal, Estadual e Trabalhista)',
      orderCode: 'OS105',
      competence: 'Setembro / 2026',
      issuedAt: '30/09/2026',
      hash: 'a9f8e71b2c3d4e5f6a7b8c9d0e1f2a3b',
      status: 'Disponível',
      fileName: 'CND_Conjunta_Empresa_Alfa_09_2026.pdf',
      fileSize: '1.2 MB'
    },
    {
      id: 'rep-2',
      title: 'Relatório Mensal de Apuração do Simples Nacional & Guia DAS',
      competence: 'Agosto / 2026',
      issuedAt: '15/09/2026',
      hash: 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6',
      status: 'Disponível',
      fileName: 'Relatorio_DAS_Simples_08_2026.pdf',
      fileSize: '850 KB'
    },
    {
      id: 'rep-3',
      title: 'Termo de Encerramento e Entrega da Ordem de Serviço OS105',
      orderCode: 'OS105',
      competence: 'Outubro / 2026',
      issuedAt: 'Previsto para 15/10/2026',
      status: 'Em elaboração',
      fileName: 'Termo_Conclusao_OS105.pdf',
      fileSize: '—'
    }
  ] : [];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Relatórios & Entregáveis</h1>
        <p className="page-subtitle">Baixe certidões negativas, relatórios mensais e termos de encerramento emitidos pela GSA.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!reports.length && (
          <Card style={{ padding: 28, textAlign: 'center' }}>
            <FileText size={28} color="#94a3b8" />
            <p className="page-subtitle" style={{ margin: '10px 0 0' }}>Nenhum relatório ou entregável disponível no momento.</p>
          </Card>
        )}
        {reports.map((rep) => (
          <Card key={rep.id} style={{ padding: 22 }}>
            <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div className="responsive-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: rep.status === 'Disponível' ? '#eff6ff' : '#f8fafc',
                    color: rep.status === 'Disponível' ? '#2563eb' : '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <FileText size={22} />
                </div>

                <div>
                  <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{rep.title}</h2>
                    {rep.orderCode && (
                      <span className="pill pill--blue" style={{ fontSize: 11 }}>{rep.orderCode}</span>
                    )}
                  </div>

                  <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6, fontSize: 12, color: '#64748b' }}>
                    <span>Competência: <strong>{rep.competence}</strong></span>
                    <span>•</span>
                    <span>Emitido em: <strong>{rep.issuedAt}</strong></span>
                    {rep.fileSize !== '—' && (
                      <>
                        <span>•</span>
                        <span>Tamanho: <strong>{rep.fileSize}</strong></span>
                      </>
                    )}
                  </div>

                  {rep.hash && (
                    <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11, color: '#047857' }}>
                      <ShieldCheck size={14} />
                      <span>Assinatura Digital de Autenticidade: <code>{rep.hash}</code></span>
                    </div>
                  )}
                </div>
              </div>

              <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Badge
                  status={rep.status}
                  variant={rep.status === 'Disponível' ? 'green' : 'gray'}
                />

                {rep.status === 'Disponível' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Download size={14} />}
                    onClick={() => alert(`Baixando: ${rep.fileName}`)}
                  >
                    Baixar Relatório
                  </Button>
                ) : (
                  <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                    Aguardando conclusão de etapas
                  </span>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default ClientReports;
