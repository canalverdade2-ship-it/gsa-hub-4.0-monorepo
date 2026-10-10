import os, re
base_client = r'C:\Users\Adriano Farias\Downloads\GSA_HUB 2.0\GSA HUB 3.0\src\components\client'
file_path = os.path.join(base_client, 'ClientTickets.tsx')

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

new_modals = """
      {/* Modal: Novo Chamado */}
      <Modal open={isNewTicketModalOpen} onClose={() => setIsNewTicketModalOpen(false)} title="Abrir Novo Chamado">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize:13, color:'#64748b', margin:'0 0 10px 0' }}>Descreva sua dúvida ou solicitação para a nossa equipe.</p>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Título do chamado *</label>
            <input type="text" className="form-input" placeholder="Ex: Dúvida sobre imposto" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">OS Vinculada (Opcional)</label>
            <select className="form-select">
              <option value="">Selecione uma OS (Opcional)</option>
              <option value="OS105">OS105</option>
              <option value="OS108">OS108</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Mensagem Inicial *</label>
            <textarea className="form-input" rows={4} placeholder="Detalhe sua solicitação..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)}></textarea>
          </div>
          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 20, display: 'flex', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <Button variant="secondary" style={{ width: '100%' }} onClick={() => setIsNewTicketModalOpen(false)}>Cancelar</Button>
            </div>
            <div style={{ flex: 2 }}>
              <Button variant="primary" style={{ width: '100%' }} onClick={handleCreateTicket}>Abrir Chamado</Button>
            </div>
          </div>
        </div>
      </Modal>
"""
pattern = r'\{\/\* Modal: Novo Chamado \*\/}.*?(?=\s*<\/div>\s*\);\s*\}\s*export default)'
content = re.sub(pattern, new_modals, content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
