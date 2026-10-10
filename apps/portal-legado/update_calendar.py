import os, re

base_admin = r'C:\Users\Adriano Farias\Downloads\GSA_HUB 2.0\GSA HUB 3.0\src\components\admin'
base_client = r'C:\Users\Adriano Farias\Downloads\GSA_HUB 2.0\GSA HUB 3.0\src\components\client'

# 1. AdminCalendar.tsx
file_path = os.path.join(base_admin, 'AdminCalendar.tsx')
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

new_modals = """
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
              <option value="OS105">OS105</option>
              <option value="OS108">OS108</option>
            </select>
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <Button variant="secondary" style={{ width: '100%' }} onClick={() => setSelectedDate(null)}>Cancelar</Button>
            </div>
            <div style={{ flex: 2 }}>
              <Button variant="primary" style={{ width: '100%' }} onClick={() => {
                const event = { id:`manual-${Date.now()}`, orderCode: scheduleForm.order || 'AGENDA', clientName: 'Sem cliente', title: scheduleForm.task || scheduleForm.description || 'Novo agendamento', date: selectedDate || '', time: scheduleForm.time, rps:'Administrativo', type:'client_meeting', status:'pending', source:'manual' };
                setEvents(current => [...current, event as any]);
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
              <Button variant="danger" style={{ flex: 1 }} onClick={() => {
                setEvents(items => items.filter(item => item.id !== selectedEvent.id));
                setSelectedEvent(null);
              }}>Excluir</Button>
              <Button variant="primary" style={{ flex: 2 }} onClick={() => {
                const titleVal = (document.getElementById('edit-title') as HTMLInputElement).value;
                const updated = { ...selectedEvent, title: titleVal };
                setEvents(items => items.map(item => item.id === updated.id ? updated : item));
                setSelectedEvent(null);
              }}>Salvar</Button>
            </div>
          </div>
        </Modal>
      )}
"""

pattern = r'\{\/\* Modal: Detalhes do Evento \/ Prazo \*\/}.*?(?=\s*<\/div>\s*\);\s*\}\s*export default)'
content = re.sub(pattern, new_modals, content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
