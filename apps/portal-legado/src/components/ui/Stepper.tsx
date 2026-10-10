import React, { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { Stage } from '../../types';
import Badge from './Badge';

export interface StepperProps {
  stages: Stage[];
  onStageClick?: (stage: Stage) => void;
  interactive?: boolean;
}

export function Stepper({ stages, onStageClick, interactive = true }: StepperProps) {
  const [expandedId, setExpandedId] = useState<string | null>(stages[0]?.id || null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {stages.map((stg, index) => {
        const isDone = stg.status === 'Concluída';
        const isActive = stg.status === 'Em andamento';
        const isExpanded = expandedId === stg.id;
        const isLast = index === stages.length - 1;

        return (
          <div key={stg.id || index} className="client-step-item">
            {/* Left Indicator Column */}
            <div className="client-step-indicator">
              <div
                className={`client-step-dot ${
                  isDone
                    ? 'client-step-dot--done'
                    : isActive
                    ? 'client-step-dot--active'
                    : 'client-step-dot--pending'
                }`}
              >
                {isDone ? <Check size={18} strokeWidth={2.5} /> : index + 1}
              </div>
              {!isLast && (
                <div
                  className={`client-step-line ${
                    isDone ? 'client-step-line--done' : isActive ? 'client-step-line--active' : ''
                  }`}
                />
              )}
            </div>

            {/* Right Content Column */}
            <div className="client-step-content">
              <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h4 className="client-step-title">{stg.name}</h4>
                  <p className="client-step-desc">
                    {stg.clientUpdate || stg.description || 'Etapa em processamento.'}
                  </p>
                </div>
                <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Badge status={stg.status} />
                  {stg.completedAt && (
                    <span className="responsive-row" style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Calendar size={13} />
                      {new Date(stg.completedAt + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
              </div>

              {/* Expandable toggle */}
              {interactive && (
                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(stg.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563eb',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: 0
                    }}
                  >
                    {isExpanded ? (
                      <>
                        Ocultar detalhes <ChevronUp size={14} />
                      </>
                    ) : (
                      <>
                        Ver detalhes <ChevronDown size={14} />
                      </>
                    )}
                  </button>

                  {isExpanded && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 12,
                        background: '#f8fafc',
                        borderRadius: 8,
                        fontSize: 13,
                        color: '#334155',
                        border: '1px solid #e2e8f0'
                      }}
                    >
                      {stg.description && (
                        <p style={{ marginBottom: 6 }}>
                          <strong>Descrição:</strong> {stg.description}
                        </p>
                      )}
                      {stg.clientUpdates && stg.clientUpdates.length > 0 && (
                        <div style={{ marginTop: 8, marginBottom: 8 }}>
                          <strong style={{ display: 'block', marginBottom: 5 }}>Atualizações</strong>
                          <div style={{ display: 'grid', gap: 6 }}>
                            {stg.clientUpdates.map((item) => (
                              <div key={item.id} style={{ padding: '7px 9px', background: '#fff', border: '1px solid #dbeafe', borderRadius: 7 }}>
                                <div>{item.text}</div>
                                {item.date && <small style={{ display: 'block', marginTop: 3, color: '#64748b' }}>{item.date}</small>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {stg.clientUpdate && (
                        <p style={{ marginBottom: 6 }}>
                          <strong>Atualização:</strong> {stg.clientUpdate}
                        </p>
                      )}
                      {((stg.requestedDocuments && stg.requestedDocuments.length > 0) || stg.requestedDocument) && (
                        <div style={{ marginTop: 8, marginBottom: 8 }}>
                          <strong style={{ display: 'block', marginBottom: 5 }}>Documentos solicitados</strong>
                          {stg.requestedDocuments?.map((document) => (
                            <p key={document.id} style={{ margin: '3px 0', color: document.status === 'approved' ? '#047857' : '#92400e' }}>
                              {document.name} <span style={{ fontSize: 11 }}>({document.status === 'approved' ? 'aprovado' : document.status === 'analysis' ? 'em análise' : 'pendente'})</span>
                            </p>
                          ))}
                          {stg.requestedDocument && !stg.requestedDocuments?.some((document) => document.name === stg.requestedDocument) && (
                            <p style={{ margin: '3px 0', color: stg.requestedDocumentStatus === 'approved' ? '#047857' : '#92400e' }}>
                              {stg.requestedDocument} <span style={{ fontSize: 11 }}>({stg.requestedDocumentStatus === 'approved' ? 'aprovado' : stg.requestedDocumentStatus === 'analysis' ? 'em análise' : 'pendente'})</span>
                            </p>
                          )}
                        </div>
                      )}
                      {stg.deadlineDays && (
                        <p style={{ color: '#64748b' }}>
                          <strong>Prazo previsto:</strong> {stg.deadlineDays}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Stepper;
