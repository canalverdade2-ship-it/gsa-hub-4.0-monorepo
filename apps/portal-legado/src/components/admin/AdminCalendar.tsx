import React, { useEffect, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, UserCheck, AlertCircle, Filter, CheckCircle2 } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { api, isDemoMode } from '../../api';

interface CalendarEvent {
  id: string;
  orderCode: string;
  clientName: string;
  title: string;
  date: string;
  time?: string;
  rps: string;
  type: 'stage_deadline' | 'recurrent_agenda' | 'client_meeting';
  status: 'pending' | 'completed' | 'critical';
  source?: 'system' | 'manual';
}

export function AdminCalendar() {
  const [currentMonthDate, setCurrentMonthDate] = useState(() => new Date(2026, 9, 1));
  const [filterRps, setFilterRps] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'grid' | 'agenda'>('grid');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ description: '', task: '', time: '', client: '', contract: '', order: '', proposal: '' });
  const [orderOptions, setOrderOptions] = useState<Array<{ code: string; clientName: string; rps: string }>>([]);

  const monthYear = currentMonthDate.getFullYear();
  const monthIndex = currentMonthDate.getMonth();
  const currentMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(currentMonthDate).replace(/^./, (letter) => letter.toUpperCase());
  const daysInMonth = Array.from({ length: new Date(monthYear, monthIndex + 1, 0).getDate() }, (_, i) => i + 1);
  const leadingDays = Array.from({ length: new Date(monthYear, monthIndex, 1).getDay() }, (_, i) => new Date(monthYear, monthIndex, 0).getDate() - (new Date(monthYear, monthIndex, 1).getDay() - i - 1));
  const trailingDays = Array.from({ length: (7 - ((leadingDays.length + daysInMonth.length) % 7)) % 7 }, (_, i) => i + 1);
  const today = new Date();

  const [events, setEvents] = useState<CalendarEvent[]>(isDemoMode ? [
    {
      id: 'ev-1',
      orderCode: 'OS105',
      clientName: 'Empresa Alfa Ltda',
      title: 'Protocolar na Junta Comercial de SP',
      date: '2026-10-05',
      time: '14:00',
      rps: 'João Carlos da Silva',
      type: 'stage_deadline',
      status: 'critical'
    },
    {
      id: 'ev-2',
      orderCode: 'OS105',
      clientName: 'Empresa Alfa Ltda',
      title: 'Conferência de Documentos Societários',
      date: '2026-10-02',
      time: '10:00',
      rps: 'João Carlos da Silva',
      type: 'stage_deadline',
      status: 'completed'
    },
    {
      id: 'ev-3',
      orderCode: 'OS108',
      clientName: 'Beta Tecnologia',
      title: 'Fechamento Mensal Folha & Simples',
      date: '2026-10-10',
      time: '17:00',
      rps: 'Ana Martins',
      type: 'recurrent_agenda',
      status: 'pending'
    },
    {
      id: 'ev-4',
      orderCode: 'OS109',
      clientName: 'Gama Varejo',
      title: 'Emissão de Alvará de Funcionamento',
      date: '2026-10-15',
      time: '11:30',
      rps: 'Mariana Souza',
      type: 'stage_deadline',
      status: 'pending'
    },
    {
      id: 'ev-5',
      orderCode: 'OS105',
      clientName: 'Empresa Alfa Ltda',
      title: 'Coleta de Assinatura Digital dos Sócios',
      date: '2026-10-08',
      time: '16:00',
      rps: 'João Carlos da Silva',
      type: 'stage_deadline',
      status: 'pending'
    },
    { id: 'ev-3b', orderCode: 'OS108', clientName: 'Beta Tecnologia', title: 'Fechamento Mensal Folha & Simples', date: '2026-10-17', time: '17:00', rps: 'Ana Martins', type: 'recurrent_agenda', status: 'pending' },
    { id: 'ev-3c', orderCode: 'OS108', clientName: 'Beta Tecnologia', title: 'Fechamento Mensal Folha & Simples', date: '2026-10-24', time: '17:00', rps: 'Ana Martins', type: 'recurrent_agenda', status: 'pending' },
    { id: 'ev-3d', orderCode: 'OS108', clientName: 'Beta Tecnologia', title: 'Fechamento Mensal Folha & Simples', date: '2026-10-31', time: '17:00', rps: 'Ana Martins', type: 'recurrent_agenda', status: 'pending' },
    { id: 'invoice-1', orderCode: 'FAT-2026-0105', clientName: 'Empresa Alfa Ltda', title: 'Fatura em aberto · R$ 2.500,00', date: '2026-10-05', time: '23:59', rps: 'Financeiro', type: 'client_meeting', status: 'pending' },
    { id: 'invoice-2', orderCode: 'FAT-2026-0098', clientName: 'Beta Tecnologia', title: 'Fatura atrasada · R$ 1.800,00', date: '2026-10-02', time: '23:59', rps: 'Financeiro', type: 'client_meeting', status: 'critical' },
    { id: 'invoice-3', orderCode: 'FAT-2026-0112', clientName: 'Gama Varejo', title: 'Fatura pendente · R$ 3.200,00', date: '2026-10-15', time: '23:59', rps: 'Financeiro', type: 'client_meeting', status: 'pending' },
    {
      id: 'ev-6',
      orderCode: 'OS112',
      clientName: 'Delta Logística',
      title: 'Reunião de Alinhamento Tributário',
      date: '2026-10-19',
      time: '09:00',
      rps: 'Ana Martins',
      type: 'client_meeting',
      status: 'pending'
    }
  ] : []);

  useEffect(() => {
    if (isDemoMode) return;
    let cancelled = false;
    api('/state').then((state) => {
      if (cancelled) return;
      const clients = Array.isArray(state?.clients) ? state.clients : [];
      const orders = Array.isArray(state?.orders) ? state.orders : [];
      const options = orders.map((order: any) => ({
        code: String(order.code || `OS${order.id}`),
        clientName: clients.find((client: any) => String(client.id) === String(order.clientId))?.name || `Cliente ${order.clientId || ''}`,
        rps: String(order.rpsName || order.assignee || 'Administrativo')
      }));
      setOrderOptions(options);
      const systemEvents: CalendarEvent[] = orders.filter((order: any) => order.end || order.start || order.createdAt || order.created).map((order: any) => {
        const clientName = options.find((option: { code: string; clientName: string; rps: string }) => option.code === String(order.code || `OS${order.id}`))?.clientName || 'Sem cliente';
        const date = String(order.end || order.start || order.createdAt || order.created).slice(0, 10);
        const done = ['concluída', 'concluida', 'concluído', 'concluido', 'cancelada', 'cancelado'].includes(String(order.status || '').toLowerCase());
        return { id: `order-${order.id}`, orderCode: String(order.code || `OS${order.id}`), clientName, title: `Prazo da OS · ${order.title || 'Serviço'}`, date, time: '23:59', rps: String(order.rpsName || 'Administrativo'), type: 'stage_deadline', status: done ? 'completed' : 'pending', source: 'system' } as CalendarEvent;
      });
      const manualEvents = (Array.isArray(state?.calendarEvents) ? state.calendarEvents : []).map((event: any) => ({ ...event, id: String(event.id), source: 'manual' })) as CalendarEvent[];
      setEvents([...systemEvents, ...manualEvents]);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const handleToggleEventStatus = (id: string) => {
    setEvents(
      events.map((ev) =>
        ev.id === id
          ? { ...ev, status: ev.status === 'completed' ? 'pending' : 'completed' }
          : ev
      )
    );
    const event = events.find((item) => item.id === id);
    if (!isDemoMode && event?.source === 'manual') void api(`/calendar-events/${id}`, { status: event.status === 'completed' ? 'pending' : 'completed' }, 'PATCH').catch(() => undefined);
    if (selectedEvent && selectedEvent.id === id) {
      setSelectedEvent((prev) =>
        prev ? { ...prev, status: prev.status === 'completed' ? 'pending' : 'completed' } : null
      );
    }
  };

  const filteredEvents = events.filter((e) => {
    if (filterRps !== 'all' && e.rps !== filterRps) return false;
    return true;
  });

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="page-title">Calendário & Agenda Operacional</h1>
          <p className="page-subtitle">Acompanhe prazos de etapas, datas de OS recorrentes e entregas aos clientes.</p>
        </div>
        <div className="responsive-row" style={{ display: 'flex', gap: 8 }}>
          <Button
            variant={activeTab === 'grid' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveTab('grid')}
          >
            Grade Mensal
          </Button>
          <Button
            variant={activeTab === 'agenda' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveTab('agenda')}
          >
            Lista de Prazos
          </Button>
        </div>
      </div>

      {/* Filter and Month Navigation Bar */}
      <div className="responsive-row"
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12
        }}
      >
        <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              style={{ padding: '6px 8px' }}
              onClick={() => setCurrentMonthDate(new Date(monthYear, monthIndex - 1, 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', minWidth: 140, textAlign: 'center' }}>
              {currentMonth}
            </span>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              style={{ padding: '6px 8px' }}
              onClick={() => setCurrentMonthDate(new Date(monthYear, monthIndex + 1, 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <span className="pill pill--blue" style={{ fontSize: 12 }}>Hoje: {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(today)}</span>
        </div>

        <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Responsável (RPS):</span>
          <select
            className="form-select"
            style={{ width: 'auto', padding: '6px 12px', fontSize: 13 }}
            value={filterRps}
            onChange={(e) => setFilterRps(e.target.value)}
          >
            <option value="all">Todos os Responsáveis</option>
            {(isDemoMode ? ['João Carlos da Silva', 'Ana Martins', 'Mariana Souza'] : Array.from(new Set(orderOptions.map((order) => order.rps).filter(Boolean)))).map((rps) => <option key={rps} value={rps}>{rps}</option>)}
          </select>
        </div>
      </div>

      {/* Main View: Grid vs Agenda */}
      {activeTab === 'grid' ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 680 }}>
              {/* Weekday headers */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 800,
              color: '#64748b',
              padding: '10px 0'
            }}
          >
            <div>DOM</div>
            <div>SEG</div>
            <div>TER</div>
            <div>QUA</div>
            <div>QUI</div>
            <div>SEX</div>
            <div>SÁB</div>
          </div>

          {/* Days Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              background: '#e2e8f0',
              gap: 1
            }}
          >
            {leadingDays.map((d) => (
              <div key={`prev-${d}`} style={{ minHeight: 110, background: '#f8fafc', padding: 8, opacity: 0.4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{d}</span>
              </div>
            ))}

            {daysInMonth.map((day) => {
              const dayStr = `${monthYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayEvents = filteredEvents.filter((e) => e.date === dayStr);
              const isToday = day === today.getDate() && monthIndex === today.getMonth() && monthYear === today.getFullYear();

              return (
                <div
                  key={day}
                  onClick={() => { setSelectedDate(dayStr); setScheduleForm({ description:'', task:'', time:'', client:'', contract:'', order:'', proposal:'' }); }}
                  style={{
                    minHeight: 110,
                    background: isToday ? '#eff6ff' : '#ffffff',
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}
                >
                  <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: isToday ? '#2563eb' : 'transparent',
                        color: isToday ? '#ffffff' : '#0f172a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>
                        {dayEvents.length} {dayEvents.length === 1 ? 'prazo' : 'prazos'}
                      </span>
                    )}
                  </div>

                  {/* Day events pills */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                    {dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                        style={{
                          background: ev.status === 'completed' ? '#ecfdf5' : ev.status === 'critical' ? '#fef2f2' : '#ffffff',
                          border: `1px solid ${ev.status === 'completed' ? '#a7f3d0' : ev.status === 'critical' ? '#fecaca' : '#cbd5e1'}`,
                          borderRadius: 6,
                          padding: '4px 6px',
                          fontSize: 11,
                          lineHeight: 1.3,
                          cursor: 'pointer'
                        }}
                        title={`${ev.orderCode} - ${ev.clientName}: ${ev.title} (${ev.rps})`}
                      >
                        <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 800, color: '#2563eb' }}>{ev.orderCode}</span>
                          <span style={{ fontSize: 10, color: '#64748b' }}>{ev.time}</span>
                        </div>
                        <div style={{ color: '#0f172a', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.title}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {trailingDays.map((d) => (
              <div key={`next-${d}`} style={{ minHeight: 110, background: '#f8fafc', padding: 8, opacity: 0.4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>{d}</span>
              </div>
            ))}
          </div>
            </div>
          </div>
        </Card>
      ) : (
        /* Agenda list view */
        <Card style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>
            Próximos Compromissos & Prazos da Operação
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredEvents.map((ev) => (
              <div className="responsive-row"
                key={ev.id}
                onClick={() => setSelectedEvent(ev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  cursor: 'pointer',
                  transition: 'background 150ms ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#f8fafc')}
              >
                <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: ev.status === 'completed' ? '#ecfdf5' : '#eff6ff',
                      color: ev.status === 'completed' ? '#10b981' : '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    {ev.status === 'completed' ? <CheckCircle2 size={20} /> : <CalendarIcon size={20} />}
                  </div>
                  <div>
                    <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="pill pill--blue" style={{ fontSize: 11, padding: '2px 8px' }}>
                        {ev.orderCode}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{ev.title}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      Cliente: <strong>{ev.clientName}</strong> • Data: <strong>{ev.date} às {ev.time}</strong>
                    </div>
                  </div>
                </div>

                <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="responsive-row" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
                    <UserCheck size={14} color="#2563eb" />
                    <span>{ev.rps}</span>
                  </div>
                  <Badge
                    status={ev.status === 'completed' ? 'Concluído' : ev.status === 'critical' ? 'Urgente' : 'Pendente'}
                    variant={ev.status === 'completed' ? 'green' : ev.status === 'critical' ? 'red' : 'yellow'}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      
      {/* Modals area */}
      <Modal open={!!selectedDate} onClose={() => setSelectedDate(null)} title={selectedDate ? `Agendamento de ${selectedDate}` : 'Novo agendamento'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Título</label>
            <input className="form-input" value={scheduleForm.task} onChange={e => setScheduleForm({...scheduleForm, task:e.target.value})} placeholder="Título do evento" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Data</label>
            <input type="date" className="form-input" value={selectedDate || ''} readOnly />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Hora Início</label>
              <input className="form-input" type="time" value={scheduleForm.time} onChange={e => setScheduleForm({...scheduleForm, time:e.target.value})} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Hora Fim</label>
              <input className="form-input" type="time" />
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Descrição</label>
            <textarea className="form-input" value={scheduleForm.description} onChange={e => setScheduleForm({...scheduleForm, description:e.target.value})} placeholder="Descrição" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">OS Vinculada</label>
            <select className="form-select" value={scheduleForm.order} onChange={e => setScheduleForm({...scheduleForm, order:e.target.value})}>
              <option value="">Selecione uma OS</option>
              {orderOptions.map((order) => <option key={order.code} value={order.code}>{order.code} — {order.clientName}</option>)}
            </select>
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <Button variant="secondary" style={{ width: '100%' }} onClick={() => setSelectedDate(null)}>Cancelar</Button>
            </div>
            <div style={{ flex: 2 }}>
              <Button variant="primary" style={{ width: '100%' }} onClick={async () => {
                const linkedOrder = orderOptions.find((order) => order.code === scheduleForm.order);
                const payload = { orderCode: scheduleForm.order || 'AGENDA', clientName: linkedOrder?.clientName || 'Sem cliente', title: scheduleForm.task || scheduleForm.description || 'Novo agendamento', date: selectedDate || '', time: scheduleForm.time, rps: linkedOrder?.rps || 'Administrativo', type: 'client_meeting', status: 'pending', description: scheduleForm.description };
                if (isDemoMode) {
                  setEvents(current => [...current, { id:`manual-${Date.now()}`, ...payload, source:'manual' } as any]);
                } else {
                  try { const created = await api('/calendar-events', payload); setEvents(current => [...current, { ...created, id: String(created.id), source: 'manual' }]); } catch { return; }
                }
                setSelectedDate(null);
              }}>Salvar</Button>
            </div>
          </div>
        </div>
      </Modal>

      {selectedEvent && (
        <Modal open={true} onClose={() => setSelectedEvent(null)} title={`Editar Evento`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Título</label>
              <input className="form-input" defaultValue={selectedEvent.title} id="edit-title" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Data</label>
              <input type="date" className="form-input" defaultValue={selectedEvent.date} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Hora Início</label>
                <input className="form-input" type="time" defaultValue={selectedEvent.time || ''} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Hora Fim</label>
                <input className="form-input" type="time" />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Descrição</label>
              <textarea className="form-input" defaultValue="" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">OS Vinculada</label>
              <select className="form-select" defaultValue={selectedEvent.orderCode}>
                <option value={selectedEvent.orderCode}>{selectedEvent.orderCode}</option>
              </select>
            </div>
            <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'flex', gap: 14 }}>
              <Button variant="danger" style={{ flex: 1 }} onClick={async () => {
                if (!isDemoMode && selectedEvent.source === 'manual') {
                  try { await api(`/calendar-events/${selectedEvent.id}`, undefined, 'DELETE'); } catch { return; }
                }
                setEvents(items => items.filter(item => item.id !== selectedEvent.id));
                setSelectedEvent(null);
              }}>Excluir</Button>
              <Button variant="primary" style={{ flex: 2 }} onClick={async () => {
                const titleVal = (document.getElementById('edit-title') as HTMLInputElement).value;
                const updated = { ...selectedEvent, title: titleVal };
                if (!isDemoMode && selectedEvent.source === 'manual') {
                  try { await api(`/calendar-events/${selectedEvent.id}`, { title: titleVal }, 'PATCH'); } catch { return; }
                }
                setEvents(items => items.map(item => item.id === updated.id ? updated : item));
                setSelectedEvent(null);
              }}>Salvar</Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}

export default AdminCalendar;
